# Tests

Two headless-Chromium checks, driven by Playwright.

```sh
npm install --no-save playwright   # or use a global install
node test/smoke.mjs                # panel layout + DSP render
node test/interact.mjs             # programmer, keyboard routing, switches
```

`smoke.mjs` builds the panel, asserts that nothing overflows its section and
that the keybed geometry is right, then renders all 32 factory programs
through an `OfflineAudioContext` and flags any that come out silent, clipped
or non-finite. It also writes `docs/panel.png`.

`interact.mjs` drives the instrument through the DOM: selecting and writing
programs, MANUAL mode, multi-state switch cycling and LED states, knob
detents, split/double voice routing, HOLD, the manual's CHORD transposition
rule, and persistence. It exits non-zero on any failure.
