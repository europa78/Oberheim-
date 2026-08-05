/*
 * OB-X replica — factory program bank.
 *
 * The original OB-X programmer holds 32 programs, addressed on the front panel
 * as four GROUPS (A, B, C, D) of eight PROGRAM buttons (1..8). This bank is a
 * flat array in that same order, so the panel address maps onto the index as:
 *
 *     index = group * 8 + (program - 1)
 *
 *     0..7   -> A1..A8   brass and ensembles
 *     8..15  -> B1..B8   strings, pads and choirs
 *     16..23 -> C1..C8   basses, clavs, percussive and lead sounds
 *     24..31 -> D1..D8   effects, sweeps, noise and experimental
 *
 * Every value is normalised 0..1 exactly as the programmer stores it; 'multi'
 * parameters hold an integer 0..states-1 and 'switch' parameters hold 0 or 1.
 * Programs are partial — anything omitted keeps the default from params.js,
 * because the host runs each entry through normaliseProgram() on load.
 *
 * Values are chosen against the scaling in obx-processor.js, which matters
 * because two of those curves are steep:
 *   - envelope times are 1 ms + 10 s * v^3, so a musical attack of 25 ms is
 *     around 0.13, not 0.05;
 *   - the filter cut-off is 16 Hz * 2^(10.1 * v), and KBD tracking subtracts
 *     up to 0.2 at the bottom of the keyboard, so bass programs need a higher
 *     nominal cut-off than their brightness suggests.
 *
 * Names are kept to 16 characters or fewer so they fit the programmer LCD.
 */

// Osc 2 FREQUENCY is quantised to 61 half-step detents over five octaves, so a
// musical interval is written as semi(n). Osc 1 FREQUENCY has five one-octave
// detents over its four octave range, written as oct(n).
const semi = (n) => n / 60;
const oct = (n) => n / 4;

export const FACTORY_BANK = [
  /* -----------------------------------------------------------------------
   * GROUP A — BRASS AND ENSEMBLES
   * The OB-X signature: two slightly detuned sawtooths, a moderate filter
   * envelope opening a low-ish two-pole cut-off, and a short loudness attack.
   * --------------------------------------------------------------------- */

  // A1 — the reference OB-X brass sound.
  {
    name: 'Brass Ensemble',
    vintage: 0.35,
    osc2detune: 0.580, // ~+8 cents, a slow ensemble beat
    osc1Saw: 1, osc1Pulse: 0,
    osc2Saw: 1, osc2Pulse: 0,
    cutoff: 0.34, resonance: 0.10, filterMod: 0.50,
    fOsc1: 1, fOsc2: 2, kbdTrack: 1,
    fAttack: 0.097, fDecay: 0.368, fSustain: 0.40, fRelease: 0.271,
    aAttack: 0.134, aDecay: 0.368, aSustain: 0.85, aRelease: 0.262,
    velo: 1, // velocity -> filter
  },

  // A2
  {
    name: 'Soft Horns',
    vintage: 0.40,
    osc2detune: 0.550,
    osc1Saw: 1, osc2Saw: 1,
    cutoff: 0.36, resonance: 0.06, filterMod: 0.38,
    fAttack: 0.181, fDecay: 0.412, fSustain: 0.45, fRelease: 0.310,
    aAttack: 0.207, aDecay: 0.391, aSustain: 0.90, aRelease: 0.310,
  },

  // A3 — pulse osc 2 for a reedier, more forward section.
  {
    name: 'Trumpet Section',
    vintage: 0.30,
    osc2detune: 0.590,
    osc1Saw: 1, osc1Pulse: 0,
    osc2Saw: 0, osc2Pulse: 1,
    pulseWidth: 0.30,
    cutoff: 0.28, resonance: 0.18, filterMod: 0.58,
    fAttack: 0.067, fDecay: 0.327, fSustain: 0.30, fRelease: 0.246,
    aAttack: 0.089, aDecay: 0.342, aSustain: 0.80, aRelease: 0.228,
    velo: 3, // velocity -> filter + amp
  },

  // A4
  {
    name: 'Octave Brass',
    vintage: 0.35,
    osc2detune: 0.530,
    osc1Saw: 1, osc2Saw: 1,
    osc2Freq: semi(12), // one octave up
    fOsc2: 1, // half level, so the octave sits under the fundamental
    cutoff: 0.34, resonance: 0.08, filterMod: 0.48,
    fAttack: 0.097, fDecay: 0.355, fSustain: 0.38, fRelease: 0.271,
    aAttack: 0.134, aDecay: 0.368, aSustain: 0.85, aRelease: 0.262,
  },

  // A5
  {
    name: 'Brass Pad',
    vintage: 0.45,
    osc2detune: 0.600,
    osc1Saw: 1, osc2Saw: 1,
    lfoRate: 0.30, lfoSine: 1, // ~0.5 Hz
    depth1: 0.10, d1Osc1: 1, d1Osc2: 1, // ~11 cents of vibrato on both
    cutoff: 0.30, resonance: 0.10, filterMod: 0.40,
    fAttack: 0.292, fDecay: 0.448, fSustain: 0.50, fRelease: 0.368,
    aAttack: 0.327, aDecay: 0.431, aSustain: 0.90, aRelease: 0.391,
  },

  // A6 — percussive stab: filter sustain almost off, amp sustain half up.
  {
    name: 'Big Band Stab',
    vintage: 0.30,
    osc2detune: 0.560,
    osc1Saw: 1, osc2Saw: 1,
    cutoff: 0.22, resonance: 0.22, filterMod: 0.68,
    fAttack: 0.046, fDecay: 0.240, fSustain: 0.08, fRelease: 0.215,
    aAttack: 0.058, aDecay: 0.310, aSustain: 0.55, aRelease: 0.228,
    velo: 3,
  },

  // A7
  {
    name: 'Mellow Brass',
    vintage: 0.40,
    osc2detune: 0.560,
    osc1Saw: 1, osc2Saw: 1,
    filterType: 1, // four-pole
    cutoff: 0.26, resonance: 0.05, filterMod: 0.42,
    fAttack: 0.143, fDecay: 0.431, fSustain: 0.40, fRelease: 0.327,
    aAttack: 0.181, aDecay: 0.412, aSustain: 0.90, aRelease: 0.303,
  },

  // A8
  {
    name: 'Brass Swell',
    vintage: 0.45,
    osc2detune: 0.610,
    osc1Saw: 1, osc2Saw: 1,
    cutoff: 0.20, resonance: 0.12, filterMod: 0.55,
    fAttack: 0.493, fDecay: 0.531, fSustain: 0.55, fRelease: 0.448,
    aAttack: 0.448, aDecay: 0.531, aSustain: 1.00, aRelease: 0.464,
    touch: 1, // aftertouch -> filter
  },

  /* -----------------------------------------------------------------------
   * GROUP B — STRINGS, PADS AND CHOIRS
   * Slow loudness attacks, wider osc 2 detune for chorusing, and pulse-width
   * modulation from DEPTH 2 into PWM 1 / PWM 2 for the vocal and pad voices.
   * --------------------------------------------------------------------- */

  // B1
  {
    name: 'String Ensemble',
    vintage: 0.50,
    osc2detune: 0.640, // ~+14 cents, a wide string chorus
    osc1Saw: 1, osc2Saw: 1,
    lfoRate: 0.28, lfoSine: 1,
    depth1: 0.10, d1Osc1: 1, d1Osc2: 1,
    cutoff: 0.40, resonance: 0.10, filterMod: 0.26,
    fAttack: 0.292, fDecay: 0.448, fSustain: 0.55, fRelease: 0.391,
    aAttack: 0.310, aDecay: 0.448, aSustain: 0.95, aRelease: 0.431,
  },

  // B2 — both oscillators on pulse, swept slowly by DEPTH 2.
  {
    name: 'Warm PWM Pad',
    vintage: 0.45,
    osc2detune: 0.550,
    osc1Saw: 0, osc1Pulse: 1,
    osc2Saw: 0, osc2Pulse: 1,
    pulseWidth: 0.12,
    lfoRate: 0.10, lfoSine: 1, // ~0.17 Hz
    depth2: 0.40, d2Pwm1: 1, d2Pwm2: 1,
    cutoff: 0.36, resonance: 0.12, filterMod: 0.28,
    fAttack: 0.342, fDecay: 0.493, fSustain: 0.55, fRelease: 0.431,
    aAttack: 0.342, aDecay: 0.464, aSustain: 1.00, aRelease: 0.448,
  },

  // B3
  {
    name: 'Choir Aahs',
    vintage: 0.40,
    osc2detune: 0.600,
    osc1Saw: 0, osc1Pulse: 1,
    osc2Saw: 1, osc2Pulse: 0,
    pulseWidth: 0.55,
    cutoff: 0.42, resonance: 0.28, filterMod: 0.24,
    fAttack: 0.327, fDecay: 0.464, fSustain: 0.60, fRelease: 0.412,
    aAttack: 0.310, aDecay: 0.448, aSustain: 0.95, aRelease: 0.412,
  },

  // B4
  {
    name: 'Vox Humana',
    vintage: 0.40,
    osc2detune: 0.610,
    osc1Saw: 0, osc1Pulse: 1,
    osc2Saw: 0, osc2Pulse: 1,
    pulseWidth: 0.08, // close to a square, then swept by DEPTH 2
    lfoRate: 0.18, lfoSine: 1,
    depth2: 0.30, d2Pwm1: 1, d2Pwm2: 1,
    cutoff: 0.46, resonance: 0.18, filterMod: 0.14,
    fAttack: 0.228, fDecay: 0.448, fSustain: 0.70, fRelease: 0.368,
    aAttack: 0.215, aDecay: 0.431, aSustain: 1.00, aRelease: 0.355,
  },

  // B5
  {
    name: 'Analog Strings',
    vintage: 0.70, // heavier drift for a looser ensemble
    osc2detune: 0.670, // ~+17 cents
    osc1Saw: 1, osc2Saw: 1,
    lfoRate: 0.32, lfoSine: 1,
    depth1: 0.12, d1Osc2: 1, // wobble on osc 2 only
    cutoff: 0.42, resonance: 0.14, filterMod: 0.30,
    fAttack: 0.271, fDecay: 0.448, fSustain: 0.55, fRelease: 0.412,
    aAttack: 0.271, aDecay: 0.448, aSustain: 0.92, aRelease: 0.448,
  },

  // B6
  {
    name: 'Halo Pad',
    vintage: 0.35,
    osc2detune: 0.540,
    osc1Saw: 1, osc1Pulse: 1, // both waveforms on = triangle
    osc2Saw: 1, osc2Pulse: 0,
    filterType: 1,
    cutoff: 0.32, resonance: 0.22, filterMod: 0.38,
    fAttack: 0.448, fDecay: 0.543, fSustain: 0.50, fRelease: 0.493,
    aAttack: 0.431, aDecay: 0.531, aSustain: 1.00, aRelease: 0.531,
    touch: 1,
  },

  // B7
  {
    name: 'Glass Fifths',
    vintage: 0.30,
    osc2detune: 0.515, // near-pure, so the fifth stays clean
    osc1Saw: 1, osc1Pulse: 0,
    osc2Saw: 0, osc2Pulse: 1,
    osc2Freq: semi(7), // a fifth above
    pulseWidth: 0.35,
    fOsc2: 1,
    cutoff: 0.48, resonance: 0.30, filterMod: 0.32,
    fAttack: 0.181, fDecay: 0.448, fSustain: 0.45, fRelease: 0.391,
    aAttack: 0.228, aDecay: 0.448, aSustain: 0.90, aRelease: 0.431,
  },

  // B8 — the filter envelope does the work: very slow attack into a big sweep.
  {
    name: 'Slow Sweep Pad',
    vintage: 0.45,
    osc2detune: 0.620,
    osc1Saw: 1, osc2Saw: 1,
    cutoff: 0.12, resonance: 0.35, filterMod: 0.80,
    fAttack: 0.630, fDecay: 0.669, fSustain: 0.45, fRelease: 0.531,
    aAttack: 0.368, aDecay: 0.531, aSustain: 1.00, aRelease: 0.531,
  },

  /* -----------------------------------------------------------------------
   * GROUP C — BASSES, CLAVS, PERCUSSIVE AND LEADS
   * Fast envelopes, more resonance, tight detune, and the OSCILLATORS
   * section's SYNC and X-MOD for the lead voices. The leads use UNISON.
   * Nominal cut-offs sit higher here because KBD tracking darkens the bottom
   * two octaves by up to a fifth of the knob's travel.
   * --------------------------------------------------------------------- */

  // C1
  {
    name: 'Mini Bass',
    vintage: 0.25,
    osc2detune: 0.530,
    osc1Freq: oct(0),
    osc1Saw: 1, osc2Saw: 1,
    cutoff: 0.36, resonance: 0.30, filterMod: 0.55,
    kbdTrack: 1,
    fAttack: 0.046, fDecay: 0.280, fSustain: 0.22, fRelease: 0.228,
    aAttack: 0.046, aDecay: 0.368, aSustain: 0.85, aRelease: 0.199,
    velo: 1,
  },

  // C2
  {
    name: 'Unison Sub',
    vintage: 0.30,
    unison: 1,
    portamento: 0.05,
    osc2detune: 0.540,
    osc1Saw: 0, osc1Pulse: 1,
    pulseWidth: 0.00, // fully counter-clockwise = 50 % square
    osc2Saw: 1, osc2Pulse: 0,
    filterType: 1,
    cutoff: 0.34, resonance: 0.20, filterMod: 0.45,
    fAttack: 0.058, fDecay: 0.342, fSustain: 0.30, fRelease: 0.246,
    aAttack: 0.058, aDecay: 0.412, aSustain: 0.90, aRelease: 0.215,
  },

  // C3
  {
    name: 'Funk Clav',
    vintage: 0.25,
    osc2detune: 0.515,
    osc1Saw: 0, osc1Pulse: 1,
    osc2Saw: 0, osc2Pulse: 1,
    pulseWidth: 0.78, // ~15 % duty, thin and reedy
    cutoff: 0.40, resonance: 0.45, filterMod: 0.50,
    fAttack: 0.000, fDecay: 0.207, fSustain: 0.00, fRelease: 0.190,
    aAttack: 0.000, aDecay: 0.280, aSustain: 0.25, aRelease: 0.181,
    velo: 3,
  },

  // C4 — amp sustain at zero with a short decay: a percussive blip.
  {
    name: 'Perc Blip',
    vintage: 0.25,
    osc2detune: 0.500,
    osc1Saw: 0, osc1Pulse: 1,
    pulseWidth: 0.60,
    osc2Saw: 1, osc2Pulse: 0,
    osc2Freq: semi(12),
    fOsc2: 1,
    cutoff: 0.42, resonance: 0.55, filterMod: 0.50,
    fAttack: 0.000, fDecay: 0.181, fSustain: 0.00, fRelease: 0.170,
    aAttack: 0.000, aDecay: 0.222, aSustain: 0.00, aRelease: 0.181,
    velo: 3,
  },

  // C5
  {
    name: 'Sync Lead',
    vintage: 0.30,
    unison: 1,
    portamento: 0.08,
    osc2detune: 0.500,
    osc1Saw: 1, osc2Saw: 1,
    sync: 1,
    osc2Freq: semi(19), // an octave and a fifth up, locked to osc 1
    cutoff: 0.26, resonance: 0.30, filterMod: 0.62,
    fAttack: 0.058, fDecay: 0.327, fSustain: 0.28, fRelease: 0.262,
    aAttack: 0.067, aDecay: 0.342, aSustain: 0.95, aRelease: 0.215,
    touch: 1,
  },

  // C6
  {
    name: 'X-Mod Lead',
    vintage: 0.30,
    unison: 1,
    osc2detune: 0.500,
    osc1Saw: 1, osc2Saw: 1,
    osc2Freq: semi(7),
    xmod: 0.36, // moderate: bright and reedy, not yet clangorous
    cutoff: 0.30, resonance: 0.35, filterMod: 0.46,
    fAttack: 0.058, fDecay: 0.317, fSustain: 0.32, fRelease: 0.262,
    aAttack: 0.074, aDecay: 0.342, aSustain: 0.90, aRelease: 0.228,
  },

  // C7
  {
    name: 'Solo Lead',
    vintage: 0.35,
    unison: 1,
    portamento: 0.18,
    osc2detune: 0.600,
    osc1Saw: 1, osc2Saw: 1,
    lfoRate: 0.70, lfoSine: 1, // ~3.9 Hz vibrato
    depth1: 0.13, d1Osc1: 1, d1Osc2: 1,
    cutoff: 0.44, resonance: 0.20, filterMod: 0.30,
    fAttack: 0.079, fDecay: 0.368, fSustain: 0.50, fRelease: 0.292,
    aAttack: 0.089, aDecay: 0.368, aSustain: 1.00, aRelease: 0.246,
    touch: 1,
  },

  // C8
  {
    name: 'Reso Bass',
    vintage: 0.25,
    osc2detune: 0.530,
    osc1Saw: 1, osc1Pulse: 0,
    osc2Saw: 0, osc2Pulse: 1,
    pulseWidth: 0.50,
    fOsc2: 1,
    filterType: 1, // four-pole, where the resonance really bites
    cutoff: 0.30, resonance: 0.68, filterMod: 0.62,
    fAttack: 0.000, fDecay: 0.262, fSustain: 0.15, fRelease: 0.228,
    aAttack: 0.046, aDecay: 0.368, aSustain: 0.80, aRelease: 0.199,
    velo: 1,
  },

  /* -----------------------------------------------------------------------
   * GROUP D — EFFECTS, SWEEPS, NOISE AND EXPERIMENTAL
   * S/H modulation, the noise generator on its own into the filter, extreme
   * filter settings and heavy cross modulation.
   * --------------------------------------------------------------------- */

  // D1
  {
    name: 'Sample & Hold',
    vintage: 0.35,
    osc2detune: 0.560,
    osc1Saw: 1, osc2Saw: 1,
    lfoSine: 0, lfoSH: 1, lfoRate: 0.55, // ~2 Hz
    depth1: 0.30, d1Osc1: 1, d1Osc2: 1, // ~1 semitone of random pitch
    cutoff: 0.45, resonance: 0.25, filterMod: 0.25,
    fAttack: 0.058, fDecay: 0.368, fSustain: 0.60, fRelease: 0.292,
    aAttack: 0.058, aDecay: 0.342, aSustain: 0.90, aRelease: 0.271,
  },

  // D2
  {
    name: 'Random Filter',
    vintage: 0.35,
    osc2detune: 0.580,
    osc1Saw: 0, osc1Pulse: 1,
    pulseWidth: 0.45,
    osc2Saw: 1, osc2Pulse: 0,
    lfoSine: 0, lfoSH: 1, lfoRate: 0.62, // ~3 Hz
    depth1: 0.55, d1Filter: 1, // wide random cut-off jumps
    cutoff: 0.32, resonance: 0.62, filterMod: 0.40,
    fAttack: 0.046, fDecay: 0.310, fSustain: 0.35, fRelease: 0.246,
    aAttack: 0.046, aDecay: 0.368, aSustain: 0.90, aRelease: 0.246,
  },

  // D3 — noise generator alone, filter swept slowly by the LFO.
  {
    name: 'Wind',
    vintage: 0.30,
    fOsc1: 0, fOsc2: 0, fNoise: 2, // noise only, at full level
    kbdTrack: 0,
    lfoSine: 1, lfoRate: 0.08, // ~0.15 Hz
    depth1: 0.35, d1Filter: 1,
    cutoff: 0.45, resonance: 0.55, filterMod: 0.00,
    fAttack: 0.310, fDecay: 0.464, fSustain: 0.70, fRelease: 0.412,
    aAttack: 0.368, aDecay: 0.464, aSustain: 1.00, aRelease: 0.464,
  },

  // D4
  {
    name: 'Surf',
    vintage: 0.30,
    fOsc1: 0, fOsc2: 0, fNoise: 2,
    kbdTrack: 0,
    lfoSine: 0, lfoSH: 1, lfoRate: 0.30,
    depth1: 0.25, d1Filter: 1,
    cutoff: 0.22, resonance: 0.30, filterMod: 0.45,
    fAttack: 0.493, fDecay: 0.585, fSustain: 0.50, fRelease: 0.531,
    aAttack: 0.412, aDecay: 0.531, aSustain: 1.00, aRelease: 0.531,
  },

  // D5
  {
    name: 'Filter Sweep',
    vintage: 0.40,
    osc2detune: 0.640,
    osc1Saw: 1, osc2Saw: 1,
    cutoff: 0.08, resonance: 0.50, filterMod: 0.95,
    fAttack: 0.630, fDecay: 0.669, fSustain: 0.30, fRelease: 0.493,
    aAttack: 0.181, aDecay: 0.531, aSustain: 1.00, aRelease: 0.493,
  },

  // D6
  {
    name: 'Siren',
    vintage: 0.30,
    unison: 1,
    osc2detune: 0.500,
    osc1Saw: 1, osc1Pulse: 0,
    osc2Saw: 0, osc2Pulse: 1,
    pulseWidth: 0.20,
    lfoSine: 1, lfoRate: 0.22, // ~0.3 Hz
    depth1: 0.65, d1Osc1: 1, d1Osc2: 1, // ~5 semitones, a deep slow sweep
    cutoff: 0.50, resonance: 0.35, filterMod: 0.20,
    fAttack: 0.124, fDecay: 0.448, fSustain: 0.60, fRelease: 0.342,
    aAttack: 0.124, aDecay: 0.448, aSustain: 1.00, aRelease: 0.310,
  },

  // D7
  {
    name: 'Clangorous',
    vintage: 0.30,
    osc2detune: 0.500,
    osc1Saw: 1, osc2Saw: 1,
    osc2Freq: semi(25),
    xmod: 0.72, // well past the clangorous threshold — ring-modulator territory
    cutoff: 0.26, resonance: 0.45, filterMod: 0.55,
    fAttack: 0.000, fDecay: 0.235, fSustain: 0.10, fRelease: 0.246,
    aAttack: 0.000, aDecay: 0.292, aSustain: 0.30, aRelease: 0.310,
  },

  // D8
  {
    name: 'Tape Warble',
    vintage: 1.00, // maximum drift
    portamento: 0.12,
    osc2detune: 0.800, // ~+30 cents, deliberately out
    osc1Saw: 1, osc2Saw: 1,
    lfoSine: 1, lfoRate: 0.06, // ~0.13 Hz
    depth1: 0.10, d1Osc2: 1, // slow wow on osc 2 only
    cutoff: 0.34, resonance: 0.15, filterMod: 0.26,
    fAttack: 0.310, fDecay: 0.493, fSustain: 0.55, fRelease: 0.431,
    aAttack: 0.292, aDecay: 0.464, aSustain: 0.95, aRelease: 0.448,
  },
];

/** Panel address ("A1".."D8") for a bank index. */
export function programAddress(index) {
  const i = ((index % 32) + 32) % 32;
  return `${'ABCD'[Math.floor(i / 8)]}${(i % 8) + 1}`;
}

/** Bank index for a panel address, e.g. ('C', 5) -> 20. */
export function programIndex(group, program) {
  const g = typeof group === 'number' ? group : 'ABCD'.indexOf(String(group).toUpperCase());
  return Math.max(0, g) * 8 + (Math.min(8, Math.max(1, program)) - 1);
}
