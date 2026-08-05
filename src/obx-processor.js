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

// ---------------------------------------------------------------------------
// Band-limited oscillator primitives
// ---------------------------------------------------------------------------

/** PolyBLEP residual for a step discontinuity at phase t with increment dt. */
function polyBlep(t, dt) {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
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
// Filter — four TPT one-pole stages in a ladder with soft-saturated feedback.
// Tapping after stage 2 gives the "two-pole, low-pass type" of the original;
// tapping after stage 4 gives the 24 dB/oct option the panel's TYPE switch
// selects. Resonance is capped below the self-oscillation threshold because
// the manual states the filter "cannot be put into oscillation".
// ---------------------------------------------------------------------------

class Ladder {
  constructor() { this.s0 = 0; this.s1 = 0; this.s2 = 0; this.s3 = 0; this.fb = 0; }

  process(x, G, k, fourPole) {
    let u = x - k * this.fb;
    u = Math.tanh(u * 0.8) * 1.25;      // gentle drive, keeps resonance tame

    let v = (u - this.s0) * G; let y0 = v + this.s0; this.s0 = y0 + v;
    v = (y0 - this.s1) * G;    let y1 = v + this.s1; this.s1 = y1 + v;
    v = (y1 - this.s2) * G;    let y2 = v + this.s2; this.s2 = y2 + v;
    v = (y2 - this.s3) * G;    let y3 = v + this.s3; this.s3 = y3 + v;

    const out = fourPole ? y3 : y1;
    this.fb = out;
    return out;
  }

  reset() { this.s0 = this.s1 = this.s2 = this.s3 = this.fb = 0; }
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
    this.filter = new Ladder();
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
    this.tuning = 0;       // cents offset applied by AUTO TUNE drift
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
    return pool && pool.length ? pool : this.pools[0];
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
      outL[i] *= this.masterGain;
      if (outR !== outL) outR[i] *= this.masterGain;
    }
    return true;
  }

  renderVoice(v, L, lfo, n, outL, outR, masterCents, bendSemis, spread) {
    const p = L.p;
    const gl = this.globals;

    // ---- per-block coefficients -------------------------------------------
    const vintage = L.get('vintage');
    const detuneCents = (L.get('osc2detune', 0.5) - 0.5) * 50;

    const osc1Base = scale.osc1Semis(L.get('osc1Freq'));
    const osc2Base = scale.osc2Semis(L.get('osc2Freq'));

    const saw1 = L.get('osc1Saw') >= 0.5, pul1 = L.get('osc1Pulse') >= 0.5;
    const saw2 = L.get('osc2Saw') >= 0.5, pul2 = L.get('osc2Pulse') >= 0.5;
    const tri1 = saw1 && pul1, tri2 = saw2 && pul2;
    const osc1On = saw1 || pul1, osc2On = saw2 || pul2;

    const pwBase = scale.pulseWidth(L.get('pulseWidth'));
    const xmod = L.get('xmod');
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
    const k = res * (fourPole ? 3.4 : 1.6);
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
      const vib = (gl.modDepth * 0.5 + (touchFil || touchAmp ? 0 : 0)) * mod;
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
      let acc = 0;
      for (let s = 0; s < 2; s++) {
        const dt2 = f2 / (SR * 2);
        // Oscillator 2 first: it can modulate oscillator 1 (X-MOD) and is the
        // slave when SYNC is on.
        v.phase2 += dt2;
        let wrapped2 = false;
        if (v.phase2 >= 1) { v.phase2 -= 1; wrapped2 = true; }

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
        const f1m = xmod > 0 ? f1 * (1 + xmod * xmod * 4 * o2) : f1;
        const dt1 = clamp(Math.abs(f1m) / (SR * 2), 0, 0.45);

        v.phase1 += dt1;
        if (v.phase1 >= 1) {
          v.phase1 -= 1;
          // "SYNC ... causes Oscillator 2 to lock onto a harmonic of
          //  Oscillator 1" — the master's wrap resets the slave.
          if (syncOn) { v.phase2 = v.phase1 * (dt2 / Math.max(dt1, 1e-9)); v.tri2 = 0; }
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
        if (wrapped2 && syncOn) { /* slave wrap already handled above */ }

        acc += o1 * fOsc1 + o2 * fOsc2;
      }
      let mix = acc * 0.5 * 0.5;                     // decimate, then headroom
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
      const G = gTan / (1 + gTan);

      let sig = v.filter.process(mix, G, k, fourPole);
      sig *= 1 + k * 0.22;                            // restore level lost to resonance

      // ---- amplifier ------------------------------------------------------
      let amp = aEnv * velAmp;
      if (touchAmp) amp *= 1 - 0.5 + 0.5 * (1 + pressure) * 0.5 + pressure * 0.5;
      if (d2v) amp *= 1 - depth2 * 0.5 * (0.5 - mod * 0.5);

      const y = sig * amp * 0.32;
      outL[i] += y * gainL;
      if (outR !== outL) outR[i] += y * gainR;
    }
  }
}

registerProcessor('obx-processor', OBXProcessor);
