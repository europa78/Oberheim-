/*
 * OB-X replica — parameter model.
 *
 * Single source of truth shared by the UI, the programmer (patch memory) and
 * the AudioWorklet DSP. Every programmable parameter is stored normalised to
 * 0..1, exactly like the original's 8-bit programmer values; the DSP is
 * responsible for scaling them into musical ranges.
 *
 * Section names and control names follow the OB-X Owner's Manual:
 *   MANUAL section  -> not programmable (volume, tune, hold, chord, master tune)
 *   CONTROL section -> programmable (portamento, unison, osc 2 detune)
 *   MODULATION      -> programmable (LFO + two destination columns)
 *   OSCILLATORS     -> programmable
 *   FILTER          -> programmable
 *   ENVELOPES       -> programmable (filter envelope + loudness envelope)
 */

// ---------------------------------------------------------------------------
// Programmable parameters — these make up a "program" in the programmer.
// type: 'knob' (continuous 0..1) | 'switch' (0/1) | 'multi' (0..states-1)
// ---------------------------------------------------------------------------

export const PARAMS = [
  // --- CONTROL -------------------------------------------------------------
  { id: 'vintage',     name: 'Vintage',      type: 'knob',  def: 0.30 },
  { id: 'portamento',  name: 'Portamento',   type: 'knob',  def: 0.00 },
  // Both cycle off / filter / amp / both, shown on the pair of FIL and AMP LEDs.
  { id: 'velo',        name: 'Velo',         type: 'multi', states: 4, def: 0 },
  { id: 'touch',       name: 'Touch',        type: 'multi', states: 4, def: 0 },
  { id: 'unison',      name: 'Unison',       type: 'switch', def: 0 },
  { id: 'osc2detune',  name: 'Osc 2 Detune', type: 'knob',  def: 0.50, center: true },

  // --- MODULATION ----------------------------------------------------------
  { id: 'lfoRate',     name: 'LFO Rate',     type: 'knob',  def: 0.35 },
  { id: 'lfoSine',     name: 'Sine',         type: 'switch', def: 1 },
  { id: 'lfoSquare',   name: 'Square',       type: 'switch', def: 0 },
  { id: 'lfoSH',       name: 'S/H',          type: 'switch', def: 0 },

  { id: 'depth1',      name: 'Depth 1',      type: 'knob',  def: 0.00 },
  { id: 'd1Osc1',      name: 'Osc 1',        type: 'switch', def: 0 },
  { id: 'd1Osc2',      name: 'Osc 2',        type: 'switch', def: 0 },
  { id: 'd1Filter',    name: 'Filter',       type: 'switch', def: 0 },

  { id: 'depth2',      name: 'Depth 2',      type: 'knob',  def: 0.00 },
  { id: 'd2Pwm1',      name: 'PWM 1',        type: 'switch', def: 0 },
  { id: 'd2Pwm2',      name: 'PWM 2',        type: 'switch', def: 0 },
  { id: 'd2Volume',    name: 'Volume',       type: 'switch', def: 0 },

  // --- OSCILLATORS ---------------------------------------------------------
  // "1 FREQUENCY ... in one octave increments over a four octave range"
  { id: 'osc1Freq',    name: 'Osc 1 Freq',   type: 'knob',  def: 0.00, steps: 5 },
  { id: 'osc1Saw',     name: 'Saw',          type: 'switch', def: 1 },
  { id: 'osc1Pulse',   name: 'Pulse',        type: 'switch', def: 0 },
  // "fully counter-clockwise a square wave (50%) ... fully clockwise a 5% duty cycle"
  { id: 'pulseWidth',  name: 'Pulse Width',  type: 'knob',  def: 0.00 },
  { id: 'xmod',        name: 'X-Mod',        type: 'knob',  def: 0.00 },
  { id: 'sync',        name: 'Sync',         type: 'switch', def: 0 },
  // "2 FREQUENCY ... in half-step increments over a five octave range" — the
  // range runs upward from unison, so osc 2 cannot be tuned below osc 1 by
  // this control; OSC 2 DETUNE covers the cents either side.
  { id: 'osc2Freq',    name: 'Osc 2 Freq',   type: 'knob',  def: 0.00, steps: 61 },
  { id: 'osc2Saw',     name: 'Saw',          type: 'switch', def: 1 },
  { id: 'osc2Pulse',   name: 'Pulse',        type: 'switch', def: 0 },

  // --- FILTER --------------------------------------------------------------
  { id: 'cutoff',      name: 'Frequency',    type: 'knob',  def: 1.00 },
  { id: 'resonance',   name: 'Resonance',    type: 'knob',  def: 0.00 },
  { id: 'filterMod',   name: 'Modulation',   type: 'knob',  def: 0.00 },
  { id: 'filterType',  name: 'Type',         type: 'multi', states: 2, def: 0 }, // 0 = 2-pole, 1 = 4-pole
  { id: 'fOsc1',       name: 'Osc 1',        type: 'switch', def: 1 },
  { id: 'fOsc2',       name: 'Osc 2',        type: 'multi', states: 3, def: 2 }, // off / half / full
  { id: 'fNoise',      name: 'Noise',        type: 'multi', states: 3, def: 0 }, // off / half / full
  { id: 'kbdTrack',    name: 'Kbd',          type: 'switch', def: 1 },

  // --- ENVELOPES -----------------------------------------------------------
  { id: 'fAttack',     name: 'Attack',       type: 'knob',  def: 0.00 },
  { id: 'fDecay',      name: 'Decay',        type: 'knob',  def: 0.30 },
  { id: 'fSustain',    name: 'Sustain',      type: 'knob',  def: 0.60 },
  { id: 'fRelease',    name: 'Release',      type: 'knob',  def: 0.20 },

  { id: 'aAttack',     name: 'Attack',       type: 'knob',  def: 0.00 },
  { id: 'aDecay',      name: 'Decay',        type: 'knob',  def: 0.30 },
  { id: 'aSustain',    name: 'Sustain',      type: 'knob',  def: 1.00 },
  { id: 'aRelease',    name: 'Release',      type: 'knob',  def: 0.20 },
];

export const PARAM_IDS = PARAMS.map((p) => p.id);
export const PARAM_BY_ID = Object.fromEntries(PARAMS.map((p) => [p.id, p]));

/** A fresh program with every parameter at its default. */
export function defaultProgram(name = 'Init Program') {
  const prog = { name };
  for (const p of PARAMS) prog[p.id] = p.def;
  return prog;
}

/** Clone + fill in anything missing, so partial preset definitions are legal. */
export function normaliseProgram(src, fallbackName = 'Program') {
  const prog = defaultProgram(src?.name ?? fallbackName);
  if (src) {
    for (const p of PARAMS) {
      if (typeof src[p.id] === 'number') prog[p.id] = clampParam(p, src[p.id]);
    }
  }
  return prog;
}

export function clampParam(p, v) {
  if (!Number.isFinite(v)) return p.def;
  if (p.type === 'switch') return v >= 0.5 ? 1 : 0;
  if (p.type === 'multi') return Math.min(p.states - 1, Math.max(0, Math.round(v)));
  return Math.min(1, Math.max(0, v));
}

/** Quantise a knob to its detents, if it has any (osc frequency switches). */
export function quantise(p, v) {
  if (p.type !== 'knob' || !p.steps) return v;
  const n = p.steps - 1;
  return Math.round(v * n) / n;
}

// ---------------------------------------------------------------------------
// Global (non-programmable) state — the manual's MANUAL section, plus the
// left-hand performance panel and the keyboard-mode section.
// ---------------------------------------------------------------------------

/*
 * Every one of these is addressed from the panel with a "g:" prefix — the
 * programmer stores none of them. The application seeds its global state
 * directly from this object, so it is the defaults table for the whole
 * non-programmable side of the instrument.
 *
 * State that has no control of its own (the pitch-bend lever position, the
 * split point, which layer is being edited, whether the programmer is in
 * MANUAL mode) lives on the application rather than here.
 */
export const GLOBALS = {
  // MANUAL section — "The controls in the MANUAL section are NOT programmable."
  masterVol:    0.75,
  volBalance:   0.50,  // stereo spread of the voice pan-pots
  masterTune:   0.50,  // dead zone at centre = A-440
  tune:         0,     // momentary: auto-tunes all oscillators
  hold:         0,     // sustains notes indefinitely
  chord:        0,     // transposable "unison chord"

  // Performance panel, left of the keybed
  modDepth:     0.00,  // modulation lever amount (adds vibrato)
  bendRange:    0,     // 0 = narrow (whole step), 1 = broad (octave)
  bendOsc2Only: 0,
  transposeDown: 0,
  transposeUp:  0,
  perfLower:    0,
  perfUpper:    1,

  // Keyboard section
  split:        0,
  double:       0,
  lower:        0,
  upper:        1,

  // Programmer
  manual:       0,
  page2:        0,
  bank:         0,
  group:        0,
  global:       0,
  write:        0,
  prog1: 1, prog2: 0, prog3: 0, prog4: 0,
  prog5: 0, prog6: 0, prog7: 0, prog8: 0,

  // Arpeggiator
  arpRate:      0.45,
  arpOn:        0,
  arpMode:      1,     // 0 = lever drives modulation, 1 = drives the arpeggiator
  arpHold:      0,
  arpKbd:       0,
  arpDown:      0,
  arpUp:        1,
};

export const KEY_RANGE = { first: 36, last: 96 }; // 61 keys, C2..C7
