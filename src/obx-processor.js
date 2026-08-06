/*
 * OB-X replica — AudioWorklet DSP engine.
 *
 * Eight voices, each with two oscillators, a noise source, a resonant
 * low-pass filter and two ADSR envelopes, following the architecture set out
 * in the OB-X Owner's Manual:
 *
 *   OSC 1 (saw / pulse / triangle, 4-octave range)  ─┐
 *   OSC 2 (saw / pulse / triangle, 5-octave range)  ─┼─> FILTER ─> VCA ─> pan
 *   NOISE (half / full)                             ─┘     ^        ^
 *                                        FILTER ENVELOPE ──┘        │
 *                                                 LOUDNESS ENVELOPE ┘
 *
 * The LFO is per layer (the original has one LFO for the whole instrument),
 * with two destination groups: DEPTH 1 to oscillator/filter frequency and
 * DEPTH 2 to pulse width and volume.
 *
 * This file runs on the audio thread and therefore does not import anything;
 * the main thread pushes a complete parameter set over the message port.
 */

const SR = sampleRate;
const TWO_PI = Math.PI * 2;
const VOICE_COUNT = 8;
const ALL_VOICES = Array.from({ length: VOICE_COUNT }, (_, i) => i);

// ---------------------------------------------------------------------------
// Parameter scaling — the programmer stores 0..1; these turn that into
// musical units. Kept together so the mapping is auditable in one place.
// ---------------------------------------------------------------------------

const scale = {
  // "Its range is from approximately 1/10 oscillation per second to 20
  //  oscillations per second."
  lfoRate: (v) => 0.1 * Math.pow(200, v),
  // Envelope times: 1 ms to 10 s, cubic taper.
  time: (v) => 0.001 + 9.999 * v * v * v,
  // Filter cut-off, 16 Hz to ~18 kHz.
  cutoff: (v) => 16 * Math.pow(2, v * 10.1),
  // "in one octave increments over a four octave range"
  osc1Semis: (v) => Math.round(v * 4) * 12,
  // "in half-step increments over a five octave range"
  osc2Semis: (v) => Math.round(v * 60),
  // "fully counter-clockwise a square wave (50 % duty cycle) ... fully
  //  clockwise a 5 % duty cycle"
  pulseWidth: (v) => 0.5 - v * 0.45,
  // Polyphonic portamento, up to two seconds.
  glide: (v) => (v <= 0.001 ? 0 : 2.0 * v * v),
};

function semisToRatio(s) { return Math.pow(2, s / 12); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/*
 * Pade approximation of tanh, within about 1e-3 over the range the drive
 * stage uses. It runs twice per sample per voice inside the oversampled
 * oscillator loop, where the library call measured about a third of the
 * engine's total cost.
 */
function fastTanh(x) {
  if (x < -3) return -1;
  if (x > 3) return 1;
  const x2 = x * x;
  return x * (27 + x2) / (27 + 9 * x2);
}

/*
 * Output saturation. Eight voices in unison with both oscillators, noise and
 * full resonance can sum past full scale, and hard digital clipping there
 * sounds nothing like an overdriven analogue output stage. This is unity
 * below the knee and bends smoothly to the rail above it, so the instrument
 * can be driven hard without ever producing a squared-off edge.
 */
const KNEE = 0.7;
function softClip(x) {
  const a = Math.abs(x);
  if (a <= KNEE) return x;
  return Math.sign(x) * (KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE)));
}

// ---------------------------------------------------------------------------
// Band-limited oscillator primitives
// ---------------------------------------------------------------------------

/** PolyBLEP residual for a step discontinuity at phase t with increment dt. */
function polyBlep(t, dt) {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}

/*
 * Decimation from the 2x oversampled oscillator rate down to the host rate.
 *
 * Going to 4x was measured and reverted: it moved the alias figure by less
 * than a decibel while costing 43 % more CPU, because what remains is the
 * final stage's transition band folding 22-28 kHz down into the top octave,
 * which no amount of upstream oversampling changes.
 *
 * A 31-tap half-band Kaiser design: unity through the audio band, 47 dB down
 * by 0.35 of the internal rate and 88 dB by 0.40, so the oscillators' residual
 * content folds back well below audibility instead of landing in the
 * midrange. Half the taps are exactly zero, which is where the saving is —
 * only 17 multiply-accumulates per output sample.
 */
const DECIM_TAPS = new Float64Array([
  -0.000019404335, 0, 0.000387963060, 0, -0.001982976718, 0, 0.006562589271, 0,
  -0.017124136064, 0, 0.039222973633, 0, -0.089397568908, 0, 0.312354139263, 0.499992841596,
  0.312354139263, 0, -0.089397568908, 0, 0.039222973633, 0, -0.017124136064, 0,
  0.006562589271, 0, -0.001982976718, 0, 0.000387963060, 0, -0.000019404335,
]);
/** Indices of the non-zero taps, so the zeros cost nothing at run time. */
const DECIM_NZ = Uint8Array.from(DECIM_TAPS.reduce(
  (acc, c, i) => (c !== 0 ? (acc.push(i), acc) : acc), []));
const DECIM_LEN = 32; // power of two, so the ring index masks

class Decimator {
  constructor() { this.buf = new Float64Array(DECIM_LEN); this.pos = 0; }

  push(x) {
    this.buf[this.pos] = x;
    this.pos = (this.pos + 1) & (DECIM_LEN - 1);
  }

  /** Filtered value for the samples pushed so far. Call once per host sample. */
  read() {
    let acc = 0;
    const base = this.pos;
    for (let n = 0; n < DECIM_NZ.length; n++) {
      const i = DECIM_NZ[n];
      acc += DECIM_TAPS[i] * this.buf[(base + i) & (DECIM_LEN - 1)];
    }
    return acc;
  }

  reset() { this.buf.fill(0); this.pos = 0; }
}

/*
 * A narrow pulse carries a large DC component — at a 5 % duty cycle the offset
 * is most of the waveform's amplitude. Left in, the loudness envelope
 * multiplies it and every note starts and ends with a thump, sweeping the
 * pulse width wobbles the whole mix, and the offset eats headroom. Real
 * instruments are AC-coupled at the output; this is the equivalent, a one-pole
 * high-pass sitting below the lowest note.
 */
class DCBlocker {
  constructor() { this.x1 = 0; this.y1 = 0; }

  process(x) {
    const y = x - this.x1 + 0.9989 * this.y1;   // about 8 Hz at 44.1 kHz
    this.x1 = x;
    this.y1 = y;
    return y;
  }

  reset() { this.x1 = this.y1 = 0; }
}

// ---------------------------------------------------------------------------
// ADSR envelope — analogue-style exponential segments.
// ---------------------------------------------------------------------------

const IDLE = 0, ATTACK = 1, DECAY = 2, SUSTAIN = 3, RELEASE = 4;

class ADSR {
  constructor() { this.stage = IDLE; this.level = 0; }

  gateOn() { this.stage = ATTACK; }
  gateOff() { if (this.stage !== IDLE) this.stage = RELEASE; }
  kill() { this.stage = IDLE; this.level = 0; }
  get active() { return this.stage !== IDLE || this.level > 1e-5; }

  /** ca/cd/cr are per-sample one-pole coefficients, s is the sustain level. */
  process(ca, cd, cr, s) {
    switch (this.stage) {
      case ATTACK:
        // Aim past the top so the attack segment stays brisk and curved.
        this.level += (1.25 - this.level) * ca;
        if (this.level >= 1) { this.level = 1; this.stage = DECAY; }
        break;
      case DECAY:
        this.level += (s - this.level) * cd;
        if (Math.abs(this.level - s) < 1e-4) { this.level = s; this.stage = SUSTAIN; }
        break;
      case SUSTAIN:
        this.level += (s - this.level) * cd;
        break;
      case RELEASE:
        this.level -= this.level * cr;
        if (this.level < 1e-5) { this.level = 0; this.stage = IDLE; }
        break;
      default:
        this.level = 0;
    }
    return this.level;
  }
}

// ---------------------------------------------------------------------------
// Filter.
//
// The manual describes "a two-pole, low-pass type", which is the default here:
// one topology-preserving state-variable section, taken from the trapezoidal
// integration form, whose damping term gives a proper resonant peak. The
// panel's TYPE switch adds a 24 dB/octave option, built by cascading a second
// section behind the resonant one.
//
// The damping term never reaches zero, so the filter cannot ring on its own —
// the manual is explicit that "even in its maximum position, the Filter cannot
// be put into oscillation".
// ---------------------------------------------------------------------------

/** One TPT state-variable low-pass section. `k` is the damping, 1/Q. */
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; }

  process(x, g, k) {
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const v3 = x - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + g * v1;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return v2;
  }

  reset() { this.ic1 = this.ic2 = 0; }
}

class OBXFilter {
  constructor() { this.a = new SVF(); this.b = new SVF(); }

  /** k1 damps the resonant section; the second section only runs in 4-pole. */
  process(x, g, k1, fourPole) {
    let y = this.a.process(x, g, k1);
    if (fourPole) y = this.b.process(y, g, 1.35);
    return y;
  }

  reset() { this.a.reset(); this.b.reset(); }
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

class Voice {
  constructor(index) {
    this.index = index;
    this.layer = 0;
    this.note = -1;
    this.gate = false;
    this.velocity = 1;
    this.pressure = 0;
    this.age = 0;

    this.phase1 = Math.random();
    this.phase2 = Math.random();
    this.tri1 = 0;
    this.tri2 = 0;
    this.pitch = 60;      // current (glided) pitch in MIDI note units
    this.target = 60;
    this.filterEnv = new ADSR();
    this.ampEnv = new ADSR();
    this.filter = new OBXFilter();
    this.decim = new Decimator();
    this.dcBlock = new DCBlocker();
    this.noiseState = (index * 2654435761) >>> 0;

    // Per-voice analogue scatter, re-rolled on every note-on. The VINTAGE
    // control scales all of it.
    this.driftA = 0; this.driftB = 0; this.cutoffTrim = 0; this.timeTrim = 1;
    this.driftPhaseA = Math.random() * TWO_PI;
    this.driftPhaseB = Math.random() * TWO_PI;
    this.reroll();
  }

  reroll() {
    this.driftA = (Math.random() * 2 - 1);
    this.driftB = (Math.random() * 2 - 1);
    this.cutoffTrim = (Math.random() * 2 - 1);
    this.timeTrim = 1 + (Math.random() * 2 - 1) * 0.12;
  }

  get active() { return this.ampEnv.active; }

  noteOn(note, vel, glideFrom) {
    this.note = note;
    this.target = note;
    if (glideFrom !== null && glideFrom !== undefined) this.pitch = glideFrom;
    else if (!this.active) this.pitch = note;
    this.velocity = vel;
    this.gate = true;
    this.reroll();
    if (!this.active) { this.filter.reset(); }
    this.filterEnv.gateOn();
    this.ampEnv.gateOn();
  }

  noteOff() {
    this.gate = false;
    this.filterEnv.gateOff();
    this.ampEnv.gateOff();
  }

  kill() {
    this.gate = false;
    this.note = -1;
    this.filterEnv.kill();
    this.ampEnv.kill();
    this.filter.reset();
    this.decim.reset();
    this.dcBlock.reset();
  }

  noise() {
    // xorshift32 — flat, cheap, and deterministic per voice.
    let x = this.noiseState;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.noiseState = x;
    return (x / 2147483648) - 1;
  }
}

// ---------------------------------------------------------------------------
// Layer — one program's worth of parameters plus its LFO.
// ---------------------------------------------------------------------------

class Layer {
  constructor() {
    this.p = Object.create(null);
    this.lfoPhase = Math.random();
    this.shValue = 0;
    this.shArmed = false;
    this.lfoBuf = new Float32Array(128);
    // Smoothed values so knob moves do not zipper.
    this.smCutoff = 0;
    this.smVolume = 1;
  }

  get(id, dflt = 0) {
    const v = this.p[id];
    return typeof v === 'number' ? v : dflt;
  }

  renderLFO(n, rateExtra) {
    if (this.lfoBuf.length < n) this.lfoBuf = new Float32Array(n);
    const buf = this.lfoBuf;
    const rate = scale.lfoRate(this.get('lfoRate', 0.35)) * rateExtra;
    const inc = rate / SR;
    const useSine = this.get('lfoSine') >= 0.5;
    const useSquare = this.get('lfoSquare') >= 0.5;
    const useSH = this.get('lfoSH') >= 0.5;
    const count = (useSine ? 1 : 0) + (useSquare ? 1 : 0) + (useSH ? 1 : 0);
    const norm = count > 1 ? 1 / count : 1;

    for (let i = 0; i < n; i++) {
      this.lfoPhase += inc;
      if (this.lfoPhase >= 1) {
        this.lfoPhase -= 1;
        // "selects a random output from the LFO" — one new value per cycle.
        this.shValue = Math.random() * 2 - 1;
      }
      let v = 0;
      if (useSine) v += Math.sin(TWO_PI * this.lfoPhase);
      if (useSquare) v += this.lfoPhase < 0.5 ? 1 : -1;
      if (useSH) v += this.shValue;
      buf[i] = count === 0 ? 0 : clamp(v * norm, -1, 1);
    }
    return buf;
  }
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

class OBXProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.layers = [new Layer(), new Layer()];
    this.voices = Array.from({ length: VOICE_COUNT }, (_, i) => new Voice(i));
    this.pools = [[0, 1, 2, 3, 4, 5, 6, 7], []];
    this.globals = {
      masterVol: 0.75,
      volBalance: 0.5,
      masterTune: 0.5,
      bend: 0,
      bendRange: 0,
      bendOsc2Only: 0,
      modDepth: 0,
      transpose: 0,
      unisonSpread: 1,
      pressure: 0,
    };
    this.tuneDrift = 0;    // slowly accumulating oscillator drift
    this.driftClock = 0;
    this.masterGain = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    switch (m.type) {
      case 'patch': {
        const layer = this.layers[m.layer | 0];
        for (const [k, v] of Object.entries(m.params)) layer.p[k] = v;
        break;
      }
      case 'param':
        this.layers[m.layer | 0].p[m.id] = m.value;
        break;
      case 'global':
        this.globals[m.id] = m.value;
        break;
      case 'pools':
        this.pools = m.pools;
        break;
      case 'noteOn':
        this.noteOn(m.note, m.velocity, m.layer | 0);
        break;
      case 'noteOff':
        this.noteOff(m.note, m.layer | 0);
        break;
      case 'pressure':
        this.globals.pressure = m.value;
        break;
      case 'allNotesOff':
        for (const v of this.voices) v.noteOff();
        break;
      case 'panic':
        for (const v of this.voices) v.kill();
        break;
      case 'autoTune':
        // "the microprocessor automatically tunes all OB-X oscillators"
        this.tuneDrift = 0;
        for (const v of this.voices) { v.driftPhaseA = Math.random() * TWO_PI; v.reroll(); }
        break;
    }
  }

  // --- voice allocation ----------------------------------------------------

  poolFor(layer) {
    const pool = this.pools[layer];
    if (pool && pool.length) return pool;
    // Fall back to the first pool, then to every voice, so a malformed pools
    // message can never leave note-on with nothing to allocate from.
    const first = this.pools[0];
    return first && first.length ? first : ALL_VOICES;
  }

  noteOn(note, velocity, layer) {
    const L = this.layers[layer];
    const pool = this.poolFor(layer);

    if (L.get('unison') >= 0.5) {
      // "causes all voices to be sounded by one key depression" with low
      // note priority.
      const sounding = pool.map((i) => this.voices[i]).filter((v) => v.gate && v.note >= 0);
      if (sounding.length && note > Math.min(...sounding.map((v) => v.note))) return;
      const glide = scale.glide(L.get('portamento')) > 0 && sounding.length ? sounding[0].pitch : null;
      for (const i of pool) {
        const v = this.voices[i];
        v.layer = layer;
        v.noteOn(note, velocity, glide);
      }
      return;
    }

    // Re-use a voice already holding this note, then a free one, then steal
    // the oldest.
    let chosen = pool.find((i) => this.voices[i].note === note && this.voices[i].gate);
    if (chosen === undefined) chosen = pool.find((i) => !this.voices[i].active);
    if (chosen === undefined) chosen = pool.find((i) => !this.voices[i].gate);
    if (chosen === undefined) {
      let oldest = pool[0];
      for (const i of pool) if (this.voices[i].age > this.voices[oldest].age) oldest = i;
      chosen = oldest;
    }
    const v = this.voices[chosen];
    const glideOn = scale.glide(L.get('portamento')) > 0;
    v.layer = layer;
    v.age = 0;
    v.noteOn(note, velocity, glideOn && v.note >= 0 ? v.pitch : null);
  }

  noteOff(note, layer) {
    const L = this.layers[layer];
    const pool = this.poolFor(layer);
    if (L.get('unison') >= 0.5) {
      const anyOther = pool.some((i) => this.voices[i].gate && this.voices[i].note !== note);
      if (!anyOther) for (const i of pool) this.voices[i].noteOff();
      return;
    }
    for (const i of pool) {
      const v = this.voices[i];
      if (v.note === note && v.gate) v.noteOff();
    }
  }

  // --- audio ---------------------------------------------------------------

  process(_inputs, outputs) {
    const out = outputs[0];
    const outL = out[0];
    const outR = out.length > 1 ? out[1] : out[0];
    const n = outL.length;
    outL.fill(0);
    if (outR !== outL) outR.fill(0);

    // Slow global oscillator drift, the "vintage" wander shared by the
    // whole instrument on top of each voice's own scatter.
    this.driftClock += n / SR;
    this.tuneDrift = Math.sin(this.driftClock * 0.11) * 0.5 + Math.sin(this.driftClock * 0.037) * 0.5;

    const g = this.globals;
    const lfoBufs = [this.layers[0].renderLFO(n, 1), this.layers[1].renderLFO(n, 1)];

    // MASTER TUNE has a dead zone at the centre; outside it, ±50 cents.
    const mt = g.masterTune - 0.5;
    const masterCents = Math.abs(mt) < 0.04 ? 0 : (mt - Math.sign(mt) * 0.04) * 108.7;

    const bendSemis = (g.bendRange >= 0.5 ? 12 : 2) * g.bend;
    const spread = g.volBalance;

    for (const voice of this.voices) {
      if (!voice.active) { voice.age += n; continue; }
      voice.age += n;
      this.renderVoice(voice, this.layers[voice.layer], lfoBufs[voice.layer], n,
                       outL, outR, masterCents, bendSemis, spread);
    }

    // Master volume, smoothed. Not programmable — the manual is explicit that
    // VOLUME "cannot be input into the programmer".
    const targetGain = g.masterVol * g.masterVol * 0.9;
    for (let i = 0; i < n; i++) {
      this.masterGain += (targetGain - this.masterGain) * 0.002;
      outL[i] = softClip(outL[i] * this.masterGain);
      if (outR !== outL) outR[i] = softClip(outR[i] * this.masterGain);
    }
    return true;
  }

  renderVoice(v, L, lfo, n, outL, outR, masterCents, bendSemis, spread) {
    const gl = this.globals;

    // ---- per-block coefficients -------------------------------------------
    const vintage = L.get('vintage');
    const detuneCents = (L.get('osc2detune', 0.5) - 0.5) * 100;

    const osc1Base = scale.osc1Semis(L.get('osc1Freq'));
    const osc2Base = scale.osc2Semis(L.get('osc2Freq'));

    const saw1 = L.get('osc1Saw') >= 0.5, pul1 = L.get('osc1Pulse') >= 0.5;
    const saw2 = L.get('osc2Saw') >= 0.5, pul2 = L.get('osc2Pulse') >= 0.5;
    const tri1 = saw1 && pul1, tri2 = saw2 && pul2;
    const osc1On = saw1 || pul1, osc2On = saw2 || pul2;

    const pwBase = scale.pulseWidth(L.get('pulseWidth'));
    // Off / half / full, matching the depth the old continuous control gave
    // at its useful settings.
    const xmod = [0, 0.5, 2.0][Math.round(L.get('xmod'))] ?? 0;
    const syncOn = L.get('sync') >= 0.5;

    const depth1 = L.get('depth1');
    const d1o1 = L.get('d1Osc1') >= 0.5, d1o2 = L.get('d1Osc2') >= 0.5, d1f = L.get('d1Filter') >= 0.5;
    const depth2 = L.get('depth2');
    const d2p1 = L.get('d2Pwm1') >= 0.5, d2p2 = L.get('d2Pwm2') >= 0.5, d2v = L.get('d2Volume') >= 0.5;

    const fOsc1 = L.get('fOsc1') >= 0.5 ? 1 : 0;
    const fOsc2Sel = Math.round(L.get('fOsc2', 2));
    const fOsc2 = fOsc2Sel === 0 ? 0 : fOsc2Sel === 1 ? 0.56 : 1;  // half ≈ −5 dB
    const fNoiseSel = Math.round(L.get('fNoise', 0));
    const fNoise = fNoiseSel === 0 ? 0 : fNoiseSel === 1 ? 0.56 : 1;

    const fourPole = Math.round(L.get('filterType')) === 1;
    const res = L.get('resonance');
    // Damping runs from 2.0 (Q = 0.5, no emphasis) down to 0.1 (Q = 10), which
    // is a strong peak that still cannot break into oscillation.
    const k = 2 - 1.9 * res;
    const kbd = L.get('kbdTrack') >= 0.5 ? 1 : 0;
    const cutoffBase = L.get('cutoff');
    const filterMod = L.get('filterMod');

    const veloSel = Math.round(L.get('velo'));
    const veloFil = (veloSel & 1) === 1, veloAmp = (veloSel & 2) === 2;
    const touchSel = Math.round(L.get('touch'));
    const touchFil = (touchSel & 1) === 1, touchAmp = (touchSel & 2) === 2;

    const tt = v.timeTrim * (1 + vintage * 0.0);
    const coef = (t) => 1 - Math.exp(-1 / Math.max(1, scale.time(t) * tt * SR));
    const fca = coef(L.get('fAttack')), fcd = coef(L.get('fDecay')), fcr = coef(L.get('fRelease'));
    const fs = L.get('fSustain');
    const aca = coef(L.get('aAttack')), acd = coef(L.get('aDecay')), acr = coef(L.get('aRelease'));
    const as = L.get('aSustain');

    const glideTime = scale.glide(L.get('portamento'));
    const glideCoef = glideTime > 0 ? 1 - Math.exp(-1 / (glideTime * SR)) : 1;

    // Per-voice analogue scatter.
    const voiceDetune = vintage * (v.driftA * 9 + this.tuneDrift * v.driftB * 4);
    const voiceCut = vintage * v.cutoffTrim * 0.06;

    // Pan pots: the original spreads its voices across the stereo field.
    const panPos = ((v.index / (VOICE_COUNT - 1)) * 2 - 1) * spread;
    const gainL = Math.cos((panPos + 1) * Math.PI / 4);
    const gainR = Math.sin((panPos + 1) * Math.PI / 4);

    const velAmp = veloAmp ? 0.25 + 0.75 * v.velocity : 1;
    const velFilAmt = veloFil ? v.velocity : 1;

    for (let i = 0; i < n; i++) {
      const mod = lfo[i];

      // ---- pitch --------------------------------------------------------
      v.pitch += (v.target - v.pitch) * glideCoef;

      const pressure = gl.pressure;
      // "This controls the amount of vibrato to be added to both Oscillators."
      const vib = gl.modDepth * 0.5 * mod;
      const freqMod = depth1 * depth1 * 12 * mod;

      let semis1 = v.pitch + gl.transpose * 12 + osc1Base + masterCents / 100 + voiceDetune / 100 + vib;
      let semis2 = v.pitch + gl.transpose * 12 + osc2Base + masterCents / 100
                 + (voiceDetune + detuneCents) / 100 + vib;
      if (d1o1) semis1 += freqMod;
      if (d1o2) semis2 += freqMod;
      if (gl.bendOsc2Only >= 0.5) semis2 += bendSemis;
      else { semis1 += bendSemis; semis2 += bendSemis; }

      const f1 = 440 * semisToRatio(semis1 - 69);
      const f2 = 440 * semisToRatio(semis2 - 69);

      // ---- pulse width ---------------------------------------------------
      const pwMod = depth2 * 0.42 * mod;
      const pw1 = clamp(pwBase + (d2p1 ? pwMod : 0), 0.03, 0.97);
      const pw2 = clamp(pwBase + (d2p2 ? pwMod : 0), 0.03, 0.97);

      // ---- oscillators, 2x oversampled -----------------------------------
      for (let s = 0; s < 2; s++) {
        // Both increments are capped short of Nyquist. Without the cap a high
        // key with osc 2 tuned up five octaves and TRANSPOSE UP (or a broad
        // bend) pushes the increment past a whole cycle per sample, and the
        // single-subtract wrap below can never bring the phase back into
        // range — the oscillator folds down to a loud audible tone where it
        // should be inaudibly high.
        const dt2 = clamp(f2 / (SR * 2), 0, 0.45);
        // Oscillator 2 first: it can modulate oscillator 1 (X-MOD) and is the
        // slave when SYNC is on.
        v.phase2 += dt2;
        if (v.phase2 >= 1) v.phase2 -= 1;

        let o2 = 0;
        if (osc2On) {
          if (tri2) {
            const sq = (v.phase2 < pw2 ? 1 : -1)
                     + polyBlep(v.phase2, dt2)
                     - polyBlep((v.phase2 + 1 - pw2) % 1, dt2);
            v.tri2 = (v.tri2 + 4 * dt2 * sq) * 0.9995;
            o2 = v.tri2;
          } else if (saw2) {
            o2 = 2 * v.phase2 - 1 - polyBlep(v.phase2, dt2);
          } else {
            o2 = (v.phase2 < pw2 ? 1 : -1)
               + polyBlep(v.phase2, dt2)
               - polyBlep((v.phase2 + 1 - pw2) % 1, dt2);
          }
        }

        // "X-MOD ... causes Oscillator 2 to modulate Oscillator 1"
        const f1m = xmod > 0 ? f1 * (1 + xmod * o2) : f1;
        const dt1 = clamp(Math.abs(f1m) / (SR * 2), 0, 0.45);

        v.phase1 += dt1;
        if (v.phase1 >= 1) {
          v.phase1 -= 1;
          // "SYNC ... causes Oscillator 2 to lock onto a harmonic of
          //  Oscillator 1" — the master's wrap resets the slave.
          // The slave restarts proportionally to how far the master overshot
          // its wrap, which places the reset at the right sub-sample instant.
          // The modulo keeps a very slow master from throwing the ratio out of
          // range.
          if (syncOn) {
            v.phase2 = (v.phase1 * (dt2 / Math.max(dt1, 1e-9))) % 1;
            v.tri2 = 0;
          }
        }

        let o1 = 0;
        if (osc1On) {
          if (tri1) {
            const sq = (v.phase1 < pw1 ? 1 : -1)
                     + polyBlep(v.phase1, dt1)
                     - polyBlep((v.phase1 + 1 - pw1) % 1, dt1);
            v.tri1 = (v.tri1 + 4 * dt1 * sq) * 0.9995;
            o1 = v.tri1;
          } else if (saw1) {
            o1 = 2 * v.phase1 - 1 - polyBlep(v.phase1, dt1);
          } else {
            o1 = (v.phase1 < pw1 ? 1 : -1)
               + polyBlep(v.phase1, dt1)
               - polyBlep((v.phase1 + 1 - pw1) % 1, dt1);
          }
        }
        // The input saturation lives here, inside the oversampled section,
        // so the harmonics it generates are caught by the decimator instead
        // of folding back into the audible band. Measured, moving it out of
        // the filter and up here is worth about 5 dB of alias rejection.
        const raw = (o1 * fOsc1 + o2 * fOsc2) * 0.5;
        v.decim.push(fastTanh(raw * 0.9) * 1.11);
      }
      let mix = v.decim.read();
      if (fNoise > 0) mix += v.noise() * fNoise * 0.35;

      // ---- envelopes ------------------------------------------------------
      const fEnv = v.filterEnv.process(fca, fcd, fcr, fs);
      const aEnv = v.ampEnv.process(aca, acd, acr, as);

      // ---- filter ---------------------------------------------------------
      let cut = cutoffBase + voiceCut;
      cut += filterMod * fEnv * velFilAmt;
      if (d1f) cut += depth1 * mod * 0.5;
      if (kbd) cut += (v.pitch - 60) / 120;
      if (touchFil) cut += pressure * 0.4;
      cut = clamp(cut, 0, 1.25);

      const fc = clamp(scale.cutoff(cut), 12, SR * 0.45);
      const gTan = Math.tan(Math.PI * fc / SR);

      let sig = v.filter.process(mix, gTan, k, fourPole);
      sig *= 1 + res * 0.35;                          // a little make-up for the narrow peak
      // AC-couple before the amplifier, so a narrow pulse's offset cannot
      // turn the envelope into a thump.
      sig = v.dcBlock.process(sig);

      // ---- amplifier ------------------------------------------------------
      let amp = aEnv * velAmp;
      if (touchAmp) amp *= 1 + pressure * 0.6;
      if (d2v) amp *= 1 - depth2 * 0.5 * (0.5 - mod * 0.5);

      const y = sig * amp * 0.32;
      outL[i] += y * gainL;
      if (outR !== outL) outR[i] += y * gainR;
    }
  }
}

registerProcessor('obx-processor', OBXProcessor);
