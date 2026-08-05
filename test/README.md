# Tests

Two headless-Chromium checks, driven by Playwright.

```sh
npm install --no-save playwright   # or use a global install
node test/smoke.mjs                # panel layout + all 32 programs render
node test/dsp.mjs                  # spectral checks on the synthesis engine
node test/interact.mjs             # programmer, keyboard routing, switches
```

`smoke.mjs` builds the panel, asserts that nothing overflows its section and
that the keybed geometry is right, then renders all 32 factory programs
through an `OfflineAudioContext` and flags any that come out silent, clipped
or non-finite. It also writes `docs/panel.png`.

`dsp.mjs` renders single notes offline and measures the spectrum with a
Goertzel filter: that a sawtooth's harmonics fall off at 1/n, that a 50 %
square suppresses its even harmonics, that closing the filter attenuates the
eighth harmonic far more than the fundamental, that 4-pole rolls off past
2-pole, that resonance lifts the cut-off band without ever self-oscillating,
and that osc 2's semitone detents and SYNC land where they should.

`interact.mjs` drives the instrument through the DOM: selecting and writing
programs, MANUAL mode, multi-state switch cycling and LED states, knob
detents, split/double voice routing, HOLD, the manual's CHORD transposition
rule, and persistence. It exits non-zero on any failure.
