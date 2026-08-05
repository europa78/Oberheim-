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
   * envelope opening a low-ish two-pole cutoff, and a short loudness attack.
   * --------------------------------------------------------------------- */

  // A1
  {
    name: 'Brass Ensemble',
    vintage: 0.35,
    osc2detune: 0.532,
    osc1Saw: 1, osc1Pulse: 0,
    osc2Saw: 1, osc2Pulse: 0,
    cutoff: 0.30, resonance: 0.10, filterMod: 0.46,
    fOsc1: 1, fOsc2: 2, kbdTrack: 1,
    fAttack: 0.05, fDecay: 0.36, fSustain: 0.30, fRelease: 0.24,
    aAttack: 0.07, aDecay: 0.35, aSustain: 0.85, aRelease: 0.22,
    velo: 1, // velocity -> filter
  },

  // A2
  {
    name: 'Soft Horns',
    vintage: 0.40,
    osc2detune: 0.522,
    osc1Saw: 1, osc2Saw: 1,
    cutoff: 0.34, resonance: 0.06, filterMod: 0.34,
    fAttack: 0.14, fDecay: 0.40, fSustain: 0.40, fRelease: 0.30,
    aAttack: 0.16, aDecay: 0.40, aSustain: 0.90, aRelease: 0.30,
  },

  // A3
  {
    name: 'Trumpet Section',
    vintage: 0.30,
    osc2detune: 0.545,
    osc1Saw: 1, osc1Pulse: 0,
    osc2Saw: 0, osc2Pulse: 1,
    pulseWidth: 0.30,
    cutoff: 0.26, resonance: 0.18, filterMod: 0.55,
    fAttack: 0.02, fDecay: 0.30, fSustain: 0.25, fRelease: 0.20,
    aAttack: 0.04, aDecay: 0.30, aSustain: 0.80, aRelease: 0.16,
    velo: 3, // velocity -> filter + amp
  },

  // A4
  {
    name: 'Octave Brass',
    vintage: 0.35,
    osc2detune: 0.508,
    osc1Saw: 1, osc2Saw: 1,
    osc2Freq: semi(12), // one octave up
    fOsc2: 1, // half level, so the octave sits under the fundamental
    cutoff: 0.32, resonance: 0.08, filterMod: 0.44,
    fAttack: 0.04, fDecay: 0.34, fSustain: 0.32, fRelease: 0.24,
    aAttack: 0.06, aDecay: 0.35, aSustain: 0.85, aRelease: 0.22,
  },

  // A5
  {
    name: 'Brass Pad',
    vintage: 0.45,
    osc2detune: 0.540,
    osc1Saw: 1, osc2Saw: 1,
    lfoRate: 0.30, lfoSine: 1,
    depth1: 0.06, d1Osc1: 1, d1Osc2: 1, // gentle vibrato on both oscillators
    cutoff: 0.28, resonance: 0.10, filterMod: 0.35,
    fAttack: 0.28, fDecay: 0.50, fSustain: 0.45, fRelease: 0.40,
    aAttack: 0.30, aDecay: 0.50, aSustain: 0.90, aRelease: 0.45,
  },

  // A6
  {
    name: 'Big Band Stab',
    vintage: 0.30,
    osc2detune: 0.528,
    osc1Saw: 1, osc2Saw: 1,
    cutoff: 0.16, resonance: 0.22, filterMod: 0.68,
    fAttack: 0.00, fDecay: 0.22, fSustain: 0.00, fRelease: 0.14,
    aAttack: 0.01, aDecay: 0.30, aSustain: 0.55, aRelease: 0.16,
    velo: 3,
  },

  // A7
  {
    name: 'Mellow Brass',
    vintage: 0.40,
    osc2detune: 0.528,
    osc1Saw: 1, osc2Saw: 1,
    filterType: 1, // four-pole
    cutoff: 0.22, resonance: 0.05, filterMod: 0.40,
    fAttack: 0.10, fDecay: 0.45, fSustain: 0.35, fRelease: 0.32,
    aAttack: 0.12, aDecay: 0.45, aSustain: 0.90, aRelease: 0.28,
  },

  // A8
  {
    name: 'Brass Swell',
    vintage: 0.45,
    osc2detune: 0.550,
    osc1Saw: 1, osc2Saw: 1,
    cutoff: 0.18, resonance: 0.12, filterMod: 0.50,
    fAttack: 0.50, fDecay: 0.60, fSustain: 0.55, fRelease: 0.50,
    aAttack: 0.45, aDecay: 0.60, aSustain: 1.00, aRelease: 0.55,
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
    osc2detune: 0.548,
    osc1Saw: 1, osc2Saw: 1,
    lfoRate: 0.28, lfoSine: 1,
    depth1: 0.05, d1Osc1: 1, d1Osc2: 1,
    cutoff: 0.40, resonance: 0.10, filterMod: 0.22,
    fAttack: 0.25, fDecay: 0.45, fSustain: 0.50, fRelease: 0.40,
    aAttack: 0.26, aDecay: 0.45, aSustain: 0.95, aRelease: 0.45,
  },

  // B2
  {
    name: 'Warm PWM Pad',
    vintage: 0.45,
    osc2detune: 0.516,
    osc1Saw: 0, osc1Pulse: 1,
    osc2Saw: 0, osc2Pulse: 1,
    pulseWidth: 0.12,
    lfoRate: 0.10, lfoSine: 1,
    depth2: 0.40, d2Pwm1: 1, d2Pwm2: 1, // slow PWM on both oscillators
    cutoff: 0.36, resonance: 0.12, filterMod: 0.25,
    fAttack: 0.30, fDecay: 0.55, fSustain: 0.55, fRelease: 0.50,
    aAttack: 0.30, aDecay: 0.50, aSustain: 1.00, aRelease: 0.50,
  },

  // B3
  {
    name: 'Choir Aahs',
    vintage: 0.40,
    osc2detune: 0.535,
    osc1Saw: 0, osc1Pulse: 1,
    osc2Saw: 1, osc2Pulse: 0,
    pulseWidth: 0.55,
    cutoff: 0.30, resonance: 0.28, filterMod: 0.20,
    fAttack: 0.30, fDecay: 0.50, fSustain: 0.60, fRelease: 0.45,
    aAttack: 0.28, aDecay: 0.50, aSustain: 0.95, aRelease: 0.42,
  },

  // B4
  {
    name: 'Vox Humana',
    vintage: 0.40,
    osc2detune: 0.540,
    osc1Saw: 0, osc1Pulse: 1,
    osc2Saw: 0, osc2Pulse: 1,
    pulseWidth: 0.08, // close to a square, then swept by DEPTH 2
    lfoRate: 0.18, lfoSine: 1,
    depth2: 0.30, d2Pwm1: 1, d2Pwm2: 1,
    cutoff: 0.46, resonance: 0.18, filterMod: 0.10,
    fAttack: 0.20, fDecay: 0.50, fSustain: 0.70, fRelease: 0.40,
    aAttack: 0.18, aDecay: 0.50, aSustain: 1.00, aRelease: 0.35,
  },

  // B5
  {
    name: 'Analog Strings',
    vintage: 0.70, // heavier drift for a looser ensemble
    osc2detune: 0.556,
    osc1Saw: 1, osc2Saw: 1,
    lfoRate: 0.32, lfoSine: 1,
    depth1: 0.08, d1Osc2: 1,
    cutoff: 0.42, resonance: 0.14, filterMod: 0.28,
    fAttack: 0.22, fDecay: 0.50, fSustain: 0.55, fRelease: 0.45,
    aAttack: 0.22, aDecay: 0.50, aSustain: 0.92, aRelease: 0.50,
  },

  // B6
  {
    name: 'Halo Pad',
    vintage: 0.35,
    osc2detune: 0.524,
    osc1Saw: 1, osc1Pulse: 1, // both waveforms on = triangle
    osc2Saw: 1, osc2Pulse: 0,
    filterType: 1,
    cutoff: 0.30, resonance: 0.22, filterMod: 0.35,
    fAttack: 0.45, fDecay: 0.60, fSustain: 0.50, fRelease: 0.55,
    aAttack: 0.42, aDecay: 0.60, aSustain: 1.00, aRelease: 0.60,
    touch: 1,
  },

  // B7
  {
    name: 'Glass Fifths',
    vintage: 0.30,
    osc2detune: 0.505,
    osc1Saw: 1, osc1Pulse: 0,
    osc2Saw: 0, osc2Pulse: 1,
    osc2Freq: semi(7), // a fifth above
    pulseWidth: 0.35,
    fOsc2: 1,
    cutoff: 0.48, resonance: 0.30, filterMod: 0.30,
    fAttack: 0.15, fDecay: 0.50, fSustain: 0.45, fRelease: 0.40,
    aAttack: 0.20, aDecay: 0.50, aSustain: 0.90, aRelease: 0.45,
  },

  // B8
  {
    name: 'Slow Sweep Pad',
    vintage: 0.45,
    osc2detune: 0.545,
    osc1Saw: 1, osc2Saw: 1,
    cutoff: 0.12, resonance: 0.35, filterMod: 0.75,
    fAttack: 0.62, fDecay: 0.70, fSustain: 0.45, fRelease: 0.60,
    aAttack: 0.35, aDecay: 0.60, aSustain: 1.00, aRelease: 0.60,
  },

  /* -----------------------------------------------------------------------
   * GROUP C — BASSES, CLAVS, PERCUSSIVE AND LEADS
   * Fast envelopes, more resonance, tight detune, and the OSCILLATORS
   * section's SYNC and X-MOD for the lead voices. Leads use UNISON.
   * --------------------------------------------------------------------- */

  // C1
  {
    name: 'Mini Bass',
    vintage: 0.25,
    osc2detune: 0.512,
    osc1Freq: oct(0),
    osc1Saw: 1, osc2Saw: 1,
    cutoff: 0.14, resonance: 0.30, filterMod: 0.62,
    kbdTrack: 1,
    fAttack: 0.00, fDecay: 0.28, fSustain: 0.12, fRelease: 0.16,
    aAttack: 0.00, aDecay: 0.40, aSustain: 0.85, aRelease: 0.14,
    velo: 1,
  },

  // C2
  {
    name: 'Unison Sub',
    vintage: 0.30,
    unison: 1,
    portamento: 0.05,
    osc2detune: 0.522,
    osc1Saw: 0, osc1Pulse: 1,
    pulseWidth: 0.00, // fully counter-clockwise = 50 % square
    osc2Saw: 1, osc2Pulse: 0,
    filterType: 1,
    cutoff: 0.16, resonance: 0.20, filterMod: 0.50,
    fAttack: 0.00, fDecay: 0.35, fSustain: 0.20, fRelease: 0.18,
    aAttack: 0.00, aDecay: 0.50, aSustain: 0.90, aRelease: 0.16,
  },

  // C3
  {
    name: 'Funk Clav',
    vintage: 0.25,
    osc2detune: 0.503,
    osc1Saw: 0, osc1Pulse: 1,
    osc2Saw: 0, osc2Pulse: 1,
    pulseWidth: 0.78, // narrow pulse, thin and reedy
    cutoff: 0.20, resonance: 0.45, filterMod: 0.55,
    fAttack: 0.00, fDecay: 0.18, fSustain: 0.00, fRelease: 0.12,
    aAttack: 0.00, aDecay: 0.30, aSustain: 0.25, aRelease: 0.10,
    velo: 3,
  },

  // C4
  {
    name: 'Perc Blip',
    vintage: 0.25,
    osc2detune: 0.500,
    osc1Saw: 0, osc1Pulse: 1,
    pulseWidth: 0.60,
    osc2Saw: 1, osc2Pulse: 0,
    osc2Freq: semi(12),
    fOsc2: 1,
    cutoff: 0.24, resonance: 0.55, filterMod: 0.50,
    fAttack: 0.00, fDecay: 0.14, fSustain: 0.00, fRelease: 0.10,
    aAttack: 0.00, aDecay: 0.16, aSustain: 0.00, aRelease: 0.10,
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
    cutoff: 0.26, resonance: 0.30, filterMod: 0.60,
    fAttack: 0.02, fDecay: 0.32, fSustain: 0.25, fRelease: 0.20,
    aAttack: 0.01, aDecay: 0.30, aSustain: 0.95, aRelease: 0.16,
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
    cutoff: 0.30, resonance: 0.35, filterMod: 0.45,
    fAttack: 0.01, fDecay: 0.30, fSustain: 0.30, fRelease: 0.20,
    aAttack: 0.02, aDecay: 0.35, aSustain: 0.90, aRelease: 0.18,
  },

  // C7
  {
    name: 'Solo Lead',
    vintage: 0.35,
    unison: 1,
    portamento: 0.18,
    osc2detune: 0.545,
    osc1Saw: 1, osc2Saw: 1,
    lfoRate: 0.42, lfoSine: 1,
    depth1: 0.10, d1Osc1: 1, d1Osc2: 1,
    cutoff: 0.44, resonance: 0.20, filterMod: 0.30,
    fAttack: 0.02, fDecay: 0.40, fSustain: 0.50, fRelease: 0.25,
    aAttack: 0.03, aDecay: 0.40, aSustain: 1.00, aRelease: 0.20,
    touch: 1,
  },

  // C8
  {
    name: 'Reso Bass',
    vintage: 0.25,
    osc2detune: 0.518,
    osc1Saw: 1, osc1Pulse: 0,
    osc2Saw: 0, osc2Pulse: 1,
    pulseWidth: 0.50,
    fOsc2: 1,
    filterType: 1,
    cutoff: 0.10, resonance: 0.68, filterMod: 0.70,
    fAttack: 0.00, fDecay: 0.24, fSustain: 0.05, fRelease: 0.15,
    aAttack: 0.00, aDecay: 0.40, aSustain: 0.80, aRelease: 0.14,
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
    osc2detune: 0.530,
    osc1Saw: 1, osc2Saw: 1,
    lfoSine: 0, lfoSH: 1, lfoRate: 0.55,
    depth1: 0.30, d1Osc1: 1, d1Osc2: 1, // random pitches on both oscillators
    cutoff: 0.45, resonance: 0.25, filterMod: 0.25,
    fAttack: 0.02, fDecay: 0.40, fSustain: 0.60, fRelease: 0.30,
    aAttack: 0.02, aDecay: 0.30, aSustain: 0.90, aRelease: 0.25,
  },

  // D2
  {
    name: 'Random Filter',
    vintage: 0.35,
    osc2detune: 0.540,
    osc1Saw: 0, osc1Pulse: 1,
    pulseWidth: 0.45,
    osc2Saw: 1, osc2Pulse: 0,
    lfoSine: 0, lfoSH: 1, lfoRate: 0.62,
    depth1: 0.55, d1Filter: 1,
    cutoff: 0.22, resonance: 0.62, filterMod: 0.35,
    fAttack: 0.00, fDecay: 0.30, fSustain: 0.35, fRelease: 0.20,
    aAttack: 0.00, aDecay: 0.40, aSustain: 0.90, aRelease: 0.20,
  },

  // D3
  {
    name: 'Wind',
    vintage: 0.30,
    fOsc1: 0, fOsc2: 0, fNoise: 2, // noise generator only, at full level
    kbdTrack: 0,
    lfoSine: 1, lfoRate: 0.08,
    depth1: 0.35, d1Filter: 1,
    cutoff: 0.30, resonance: 0.55, filterMod: 0.00,
    fAttack: 0.30, fDecay: 0.50, fSustain: 0.70, fRelease: 0.50,
    aAttack: 0.35, aDecay: 0.50, aSustain: 1.00, aRelease: 0.55,
  },

  // D4
  {
    name: 'Surf',
    vintage: 0.30,
    fOsc1: 0, fOsc2: 0, fNoise: 2,
    kbdTrack: 0,
    lfoSine: 0, lfoSH: 1, lfoRate: 0.30,
    depth1: 0.25, d1Filter: 1,
    cutoff: 0.20, resonance: 0.30, filterMod: 0.45,
    fAttack: 0.50, fDecay: 0.60, fSustain: 0.50, fRelease: 0.60,
    aAttack: 0.40, aDecay: 0.60, aSustain: 1.00, aRelease: 0.60,
  },

  // D5
  {
    name: 'Filter Sweep',
    vintage: 0.40,
    osc2detune: 0.550,
    osc1Saw: 1, osc2Saw: 1,
    cutoff: 0.08, resonance: 0.50, filterMod: 0.95,
    fAttack: 0.60, fDecay: 0.70, fSustain: 0.30, fRelease: 0.55,
    aAttack: 0.10, aDecay: 0.60, aSustain: 1.00, aRelease: 0.55,
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
    lfoSine: 1, lfoRate: 0.22,
    depth1: 0.65, d1Osc1: 1, d1Osc2: 1, // deep, slow pitch sweep
    cutoff: 0.50, resonance: 0.35, filterMod: 0.20,
    fAttack: 0.05, fDecay: 0.45, fSustain: 0.60, fRelease: 0.35,
    aAttack: 0.05, aDecay: 0.45, aSustain: 1.00, aRelease: 0.30,
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
    fAttack: 0.00, fDecay: 0.22, fSustain: 0.10, fRelease: 0.18,
    aAttack: 0.00, aDecay: 0.28, aSustain: 0.30, aRelease: 0.30,
  },

  // D8
  {
    name: 'Tape Warble',
    vintage: 1.00, // maximum drift
    portamento: 0.12,
    osc2detune: 0.575,
    osc1Saw: 1, osc2Saw: 1,
    lfoSine: 1, lfoRate: 0.06,
    depth1: 0.14, d1Osc2: 1, // slow wow on osc 2 only
    cutoff: 0.34, resonance: 0.15, filterMod: 0.25,
    fAttack: 0.30, fDecay: 0.55, fSustain: 0.55, fRelease: 0.50,
    aAttack: 0.25, aDecay: 0.50, aSustain: 0.95, aRelease: 0.55,
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
