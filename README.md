# OB-X

A playable replica of the **Oberheim OB-X** polyphonic synthesizer, built from
the 1979 OB-X Owner's Manual and running entirely in the browser on the Web
Audio API. Eight voices of subtractive synthesis, a 32-program programmer, and
a front panel modelled on the instrument itself.

![Panel](docs/panel.png)

## Running it

AudioWorklet modules cannot be loaded from `file://`, so the instrument has to
be served over HTTP:

```sh
python3 serve.py --open        # or: python3 -m http.server 8000
```

Then open <http://127.0.0.1:8000/> and press **Power On**.

## Playing it

| Input | How |
| --- | --- |
| Computer keyboard | `A S D F G H J K L ; '` for white keys, `W E T Y U O P` for black; `Z` / `X` shift octave; `Esc` panics |
| On-screen keybed | Click and drag; striking lower on a key gives a higher velocity |
| MIDI | Any connected MIDI input is picked up automatically — notes, pitch bend, mod wheel (CC 1), channel pressure |
| Bend lever | Drag left/right to bend (spring-loaded back to centre), up/down to set modulation depth |

Knobs respond to vertical drag, mouse wheel, and arrow keys when focused.
Hold <kbd>Shift</kbd> for fine adjustment; double-click resets a knob to its
default.

## The architecture

Each of the eight voices follows the manual's signal path:

```
OSC 1 ─ saw / pulse / triangle, 4-octave range ──┐
OSC 2 ─ saw / pulse / triangle, 5-octave range ──┼──▶ FILTER ──▶ VCA ──▶ pan pot
NOISE ─ half / full ─────────────────────────────┘       ▲         ▲
                                     FILTER ENVELOPE ────┘         │
                                              LOUDNESS ENVELOPE ───┘
```

* **Oscillators** step in one-octave detents over four octaves for osc 1, and
  in semitones over five octaves for osc 2. Selecting both SAW and PULSE gives
  a triangle, as the panel legend indicates. Pulse width runs from a 50 %
  square fully counter-clockwise to a 5 % duty cycle fully clockwise, shared by
  both oscillators. **SYNC** makes osc 1 the master and resets osc 2 on every
  master wrap; **X-MOD** lets osc 2 frequency-modulate osc 1 for
  ring-modulator-like timbres, off / half / full.
* **Band-limiting**: the oscillators are PolyBLEP-corrected, run at 2×
  oversampling and are decimated by a 31-tap half-band filter, which holds
  alias products around 50 dB below the signal. The input saturation sits
  inside the oversampled section so its harmonics are filtered rather than
  folded back, and every voice is AC-coupled before its amplifier, so a narrow
  pulse's large DC offset cannot turn the loudness envelope into a thump.
* **Filter** is a topology-preserving state-variable section in trapezoidal
  form. The manual describes "a two-pole, low-pass type", which is the default;
  the panel's TYPE switch cascades a second section for 24 dB/octave. Its
  damping term never reaches zero, so the filter cannot ring on its own —
  the manual states it "cannot be put into oscillation" even at maximum
  resonance. Measured, resonance peaks around +18 dB at cut-off.
* **Envelopes** are exponential four-stage ADSRs, 1 ms to 10 s, one for the
  filter and one for loudness.
* **LFO** offers sine, square and sample-and-hold (they sum if you select more
  than one, as separate panel switches do), from roughly 0.1 Hz to 20 Hz. DEPTH
  1 routes to osc 1, osc 2 and/or filter frequency; DEPTH 2 routes to the two
  pulse widths and/or volume.
* **Vintage** scatters per-voice tuning, filter cut-off and envelope times, and
  adds a slow shared drift, so voices never sit perfectly on top of each other.
  Pressing **TUNE** re-tunes everything, like the original's AUTO button.
* **Portamento** is polyphonic — each voice glides independently — and works in
  unison, as the manual specifies.

## The programmer

32 programs, addressed as four groups (A–D) of eight, exactly as the original.
**PAGE 2** switches to a second set of 32 for 64 in total.

* Select a program with the GROUP knob and a numbered button.
* **MANUAL** swaps the sound over to the panel's own settings.
* Turning any control edits the live program; the display marks it with `*`.
* To store: press **WRITE** (it lights), then press a program button.
* **GLOBAL** shows the MIDI input in the display; with it lit, **WRITE**
  restores the factory bank (it asks first).
* Everything is persisted to `localStorage`; there is no cassette interface.

**KEYBOARD** splits the eight voices into two four-voice layers. **DOUBLE**
plays both layers from every key; **SPLIT** puts the lower layer below the
split point and the upper layer above it — turn SPLIT on and press a key to
set the split point. **LOWER** / **UPPER** choose which layer the panel edits.

## Layout

| File | Contents |
| --- | --- |
| `index.html` | Page shell |
| `src/params.js` | Parameter model — the single source of truth for the UI, the programmer and the DSP |
| `src/ui.js` | Knob and rocker-switch widgets, panel construction, keybed |
| `src/obx.css` | Panel chrome |
| `src/obx-processor.js` | The AudioWorklet DSP engine |
| `src/presets.js` | 32 factory programs |
| `src/app.js` | Programmer, keyboard routing, arpeggiator, MIDI, engine bridge |
| `docs/MANUAL-MAPPING.md` | Every manual control mapped to its parameter, with the manual's own wording |
| `test/` | Headless-Chromium checks — see `test/README.md` |

## Tests

```sh
npm install     # playwright
npm test
```

Four suites run against real Chromium: a layout and render check over all 32
factory programs, spectral measurements of the synthesis engine, alias-to-signal
measurements on saw, pulse and sync patches, and DOM-driven behaviour checks on
the programmer and keyboard routing. 56 assertions in total.

## What this is and is not

The synthesis architecture, control ranges and programmer behaviour come from
the OB-X Owner's Manual. The panel layout follows a later OB-X-derived plugin
skin, which adds controls the 1979 instrument did not have — VINTAGE,
VOL/BALANCE, the 4-pole filter option, VELO and TOUCH routing, split/double
keyboard modes and an arpeggiator. `docs/MANUAL-MAPPING.md` marks each of
those as an addition and lists what the manual describes but this build does
not implement (the cassette interface, the internal PROTECT switch, hardware
pan-pot trimming and the foot-control inputs).

This is an independent project inspired by the Oberheim OB-X. It is not
affiliated with, endorsed by, or connected to Oberheim or its parent
companies.
