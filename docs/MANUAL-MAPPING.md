# OB-X Owner's Manual → this implementation

Source: **Oberheim OB-X Owner's Manual** (1979). The sections below follow the
manual's own section order and control names — MANUAL, CONTROL, MODULATION,
OSCILLATORS, FILTER, ENVELOPES, MODULATION PANEL — and map each control onto the
parameter id it carries in `src/params.js`.

The signal architecture follows the manual: two oscillators per voice with
saw/pulse waveform selection, shared pulse width, X-MOD and SYNC, a low-pass
filter fed by osc 1 / osc 2 / noise with keyboard tracking, and two four-stage
envelopes (filter and loudness). Programs are stored in a 32-program programmer
addressed as four groups of eight, which is the original's scheme.

The **panel layout** is taken from a later OB-X-derived plugin skin rather than
from the 1979 front panel. That skin adds several controls the original did not
have, and they are carried here as genuine additions rather than as
reconstructions: a **VINTAGE** drift knob, a **VOL/BALANCE** knob, a filter
**TYPE** (2-pole / 4-pole) selector, **VELO** and **TOUCH** routing switches,
split/double **KEYBOARD** modes, and an **ARPEGGIATOR**. These are called out
again in "Deliberate departures" at the end.

Two caveats on what "in this build" means:

* Ranges below come from three files and nowhere else: `src/params.js` (the
  parameter model), the `scale` table and voice loop in `src/obx-processor.js`
  (the AudioWorklet DSP, which is what actually determines how a parameter
  sounds), and the tooltip formatters at the bottom of `src/ui.js` (what the
  user is told a knob is doing). Anything those three do not pin down is
  described as normalised 0..1 and nothing more.
* Every programmable parameter is stored normalised 0..1, exactly as the
  original programmer stored 8-bit values. `switch` parameters hold 0 or 1;
  `multi` parameters hold an integer `0..states-1`.

---

## MANUAL section

The manual: *"The controls in the MANUAL section are NOT programmable."* This
build honours that — none of these live in `PARAMS`; they are entries in
`GLOBALS` and are addressed from the UI with a `g:` prefix. The panel is titled
**MASTER** in `ui.js` rather than MANUAL.

| Manual control | Parameter id | Range / behaviour in this build | Manual quote or note |
| --- | --- | --- | --- |
| VOLUME | `g:masterVol` (`GLOBALS.masterVol`, default 0.75) | 0..1, knob, not programmable; the DSP applies `v²·0.9` as a smoothed master gain | *"This control affects the output volume of the OB-X simultaneously from the LEFT, MONO, and RIGHT outputs … this parameter cannot be input into the programmer."* |
| AUTO (auto-tune) | `g:tune` | Momentary rocker (`momentary: true`), so it fires on press and clears on release | *"When this button is pressed, the microprocessor automatically tunes all OB-X oscillators. While this process is occurring, the output amplifier is shut-off."* |
| HOLD | `g:hold` (`GLOBALS.hold`, default 0) | Latching switch, 0/1 | *"This button is used to produce a sustained note or chord … The note or notes played will now be sustained indefinitely."* |
| CHORD | `g:chord` (`GLOBALS.chord`, default 0) | Latching switch, 0/1 | Manual: *"The HOLD and RESET switches can be used together to produce a very useful 'UNISON CHORD' effect … the chord previously held will sound, transposed by the amount that the played note is above the lowest note on the keyboard."* **Difference:** this build exposes CHORD as one dedicated switch; there is no RESET switch on the panel, so the two-button procedure in the manual is collapsed into a single control. |
| — (addition) | `g:volBalance` (`GLOBALS.volBalance`, default 0.5) | 0..1, the stereo spread of the voice pan-pots; the DSP pans voice `i` of 8 to `((i/7)·2−1)·spread` | Not a 1979 panel control; from the plugin skin. |
| MASTER TUNE | `g:masterTune` (`GLOBALS.masterTune`, default 0.5) | 0..1; the DSP has an explicit ±0.04 dead zone around centre (= A-440) and reaches ±50 cents at the extremes, which is what the `cents` readout of `(v-0.5)·100` implies | `params.js` comment: "dead-zone at centre = A-440". The manual page consulted covers VOLUME/AUTO/HOLD/CHORD only. |

---

## CONTROL section

The manual: *"The controls in the CONTROL section are all programmable."* All
three original controls are in `PARAMS` here.

| Manual control | Parameter id | Range / behaviour in this build | Manual quote or note |
| --- | --- | --- | --- |
| PORTAMENTO | `portamento` | knob, default 0.00; the DSP glide time is `2.0·v²` seconds (exactly 0 below v = 0.001), matching the `glide` readout of `2000·v²` ms — so 0 to 2 s. Applied per voice as a one-pole approach to the target pitch, so glide is polyphonic as the manual describes | *"This control determines the rate of portamento or 'glide' of each voice … the portamento of the OB-X is polyphonic, so each voice will portamento from note to note independently of all other notes. Portamento also functions in UNISON mode."* |
| UNISON | `unison` | switch, 0/1, default 0 | *"When switched on, causes all voices to be sounded by one key depression. In UNISON mode, the OB-X keyboard operates with low note rule."* Used by the Group C leads in the factory bank. |
| OSC 2 DETUNE | `osc2detune` | knob, default 0.50, flagged `center: true`; the DSP applies `(v-0.5)*100` cents and the `detune` formatter reads out the same, so the range is ±50 cents with 0.5 = in tune. The knob's LED lights whenever the value is more than 0.02 away from centre | *"This control allows Oscillator 2 to be tuned either flat or sharp with respect to Oscillator 1. Turning the control to the left makes Oscillator 2 go flat and to the right makes it go sharp. The associated LED turns on whenever the second oscillator is being detuned."* Per-voice `vintage` drift is added on top of this, which is what gives the ensemble programs their movement. |
| — (addition) | `vintage` | knob, default 0.30; scales a per-voice tuning scatter of up to about ±9 cents plus a slow shared wander, and a per-voice cut-off trim of up to ±0.06 | Component-drift amount. Not a 1979 control. |
| — (addition) | `velo` | multi, 4 states, default 0 — off / fil / amp / both (panel LED caps `FIL`, `AMP`); the state is read as a bit pair, bit 0 = filter, bit 1 = amp. Filter routing scales `filterMod` by velocity; amp routing scales gain by `0.25 + 0.75·velocity` | Velocity routing. The OB-X keyboard was not velocity sensitive. |
| — (addition) | `touch` | multi, 4 states, default 0 — off / fil / amp / both, same bit-pair encoding; filter routing adds `pressure·0.4` to the cut-off control value | Aftertouch routing. Not a 1979 control. |

---

## MODULATION section

The manual: *"The controls in the MODULATION section are all programmable and are
of 2 basic types. The control and switches in the first column, labeled 'LFO',
are used to select the low frequency oscillator characteristics. The controls and
switches in the other two columns, labeled 'FREQUENCY' and 'PULSE WIDTH', are
used to select amounts and destinations of the modulations."*

This build keeps that three-column shape: an LFO column, then `depth1` with the
FREQUENCY destinations, then `depth2` with the PULSE WIDTH destinations. In
`ui.js` the two destination columns are both captioned "DESTINATION" and the
knobs are labelled DEPTH 1 / DEPTH 2 rather than DEPTH.

### LFO column

| Manual control | Parameter id | Range / behaviour in this build | Manual quote or note |
| --- | --- | --- | --- |
| RATE | `lfoRate` | knob, default 0.35; the `hz` formatter is `0.1 · 200^v`, i.e. 0.1 Hz to 20 Hz | *"Its range is from approximately 1/10 oscillation per second to 20 oscillations per second."* The formatter matches the manual's range. |
| SINE | `lfoSine` | switch, default **1** | *"selects sine wave modulation from the LFO. This effects a smooth rising and falling of pitch during frequency modulation or smooth changing of the pulse width during pulse width modulation."* |
| SQUARE | `lfoSquare` | switch, default 0 | *"This produces a discrete downward interval during frequency modulation or a discrete pulse width change during pulse width modulation."* |
| S/H | `lfoSH` | switch, default 0 | *"selects a random output from the LFO. This produces a sequence of random pitches during frequency modulation or a sequence of random pulse widths during pulse width modulation."* The three waveform switches are independent switches here, as on the panel — nothing forces exactly one to be on. |

### FREQUENCY column

| Manual control | Parameter id | Range / behaviour in this build | Manual quote or note |
| --- | --- | --- | --- |
| DEPTH | `depth1` | knob, default 0.00; for the oscillator destinations the DSP applies `depth1² · 12` semitones, so the taper is square-law and full travel is one octave; for the filter destination it is `depth1 · lfo · 0.5` of cut-off travel | *"This control determines the amount of selected LFO waveform to be sent to modulate the frequency of Oscillator 1, Oscillator 2 or the Filter, as controlled by the destination switches below it."* |
| OSC 1 | `d1Osc1` | switch, default 0 | *"When on, this switch selects Oscillator 1 as a destination for frequency modulation. The amount of modulation by the selected LFO waveform is determined by the DEPTH control."* |
| OSC 2 | `d1Osc2` | switch, default 0 | Same rôle for oscillator 2. The DEPTH entry above names all three destinations; the individual OSC 2 / FILTER entries fall on a manual page not among those consulted. |
| FILTER | `d1Filter` | switch, default 0 | Same rôle for the filter cutoff. Note the FILTER section's own MODULATION control is separate: *"The control works independently from and in addition to the amount of LFO modulation from the MODULATION section."* |

### PULSE WIDTH column

| Manual control | Parameter id | Range / behaviour in this build | Manual quote or note |
| --- | --- | --- | --- |
| DEPTH | `depth2` | knob, default 0.00; the DSP pulse-width offset is `depth2 · 0.42 · lfo`, and the resulting duty cycle is clamped to 0.03..0.97 | Amount for the PULSE WIDTH destination column. `d2Pwm1` / `d2Pwm2` do nothing unless `depth2` > 0. |
| PWM 1 | `d2Pwm1` | switch, default 0 | Pulse-width modulation destination for oscillator 1. Only meaningful when a Pulse waveform is on for that oscillator. |
| PWM 2 | `d2Pwm2` | switch, default 0 | Pulse-width modulation destination for oscillator 2. |
| VOLUME | `d2Volume` | switch, default 0; the DSP scales the voice amplitude by `1 − depth2·0.5·(0.5 − lfo·0.5)`, i.e. tremolo | Third destination in this column on the panel (LFO to loudness — tremolo). The manual page consulted stops after the FREQUENCY column's OSC 1 entry, so no quote is offered for it. |

---

## OSCILLATORS section

The manual: *"The controls in the OSCILLATORS section are all programmable."*

| Manual control | Parameter id | Range / behaviour in this build | Manual quote or note |
| --- | --- | --- | --- |
| 1 FREQUENCY | `osc1Freq` | knob with `steps: 5`, default 0.00, so `quantise()` snaps it to 0, 0.25, 0.5, 0.75, 1 — five detents; the `octaves` formatter reads `+round(v·4) oct` | *"This control determines the initial frequency of Oscillator 1 in one octave increments over a four octave range."* |
| SAW / PULSE WAVEFORM (osc 1) | `osc1Saw` (default 1), `osc1Pulse` (default 0) | Two independent switches. At least one must be on for oscillator 1 to sound; **both on gives a triangle** in this build | *"This switch allows selection of either a sawtooth or pulse waveform from Oscillator 1."* The panel silk-screens TRIANGLE under the pair, which is where the both-on behaviour comes from. |
| PULSE WIDTH | `pulseWidth` | knob, default 0.00; shared by both oscillators. Both the DSP and the `duty` readout use `0.5 − 0.45v`, i.e. 50 % duty at 0 and 5 % at 1 | *"This control allows selection of initial pulse width of both oscillators. When it is set fully counter-clockwise a square wave (50 % duty cycle) is selected. When it is set fully clockwise a 5 % duty cycle is selected."* Has no effect unless a Pulse waveform is on. |
| X-MOD | `xmod` | knob, default 0.00; the DSP frequency-modulates oscillator 1 by oscillator 1's output as `f1 · (1 + xmod²·4·o2)`, so the taper is square-law and anything past roughly 0.3 gets clangorous | *"When switched on, causes Oscillator 2 to modulate Oscillator 1. This allows for production of 'ring-modulator' type sounds."* **Difference:** the manual describes a switch; this build exposes it as a continuous amount knob (with SYNC as the switch beside it). |
| SYNC | `sync` | switch, default 0 | *"When switched on, causes Oscillator 2 to lock onto a harmonic of Oscillator 1."* Sync patches want `osc2Freq` well above 0 plus a filter envelope. |
| 2 FREQUENCY | `osc2Freq` | knob with `steps: 61`, default 0.00, so `quantise()` snaps to 61 half-step detents; the `semis` formatter reads `+round(v·60) semitones` | *"This control determines the initial frequency of Oscillator 2 in half-step increments over a five octave range."* Note the range is upward only from unison, so a unison-ish detuned pair is made with `osc2Freq` at 0 plus `osc2detune`. |
| SAW / PULSE WAVEFORM (osc 2) | `osc2Saw` (default 1), `osc2Pulse` (default 0) | As for oscillator 1, including both-on = triangle | *"This switch allows selection of either a sawtooth or pulse waveform from Oscillator 2."* |

---

## FILTER section

The manual: *"The controls in the FILTER section are all programmable."*

| Manual control | Parameter id | Range / behaviour in this build | Manual quote or note |
| --- | --- | --- | --- |
| FREQUENCY | `cutoff` | knob, default **1.00** (wide open); the DSP maps it as `16·2^(10.1·v)` Hz, i.e. ~16 Hz to ~17.6 kHz, then clamps the result to 12 Hz .. 0.45·sample-rate | *"This control determines the initial cut-off frequency of the Filter. The Filter is a two-pole, low-pass type."* |
| RESONANCE | `resonance` | knob, default 0.00; the DSP feedback coefficient is `v·1.6` two-pole or `v·3.4` four-pole, with a `tanh` drive in the filter core — the comment there reads "gentle drive, keeps resonance tame", so it does not self-oscillate at maximum | *"This control determines the amount of resonance ('Q' or 'emphasis') of the Filter. Note that even in its maximum position, the Filter cannot be put into oscillation."* — i.e. no self-oscillation at maximum, unlike a Moog-style ladder. |
| MODULATION | `filterMod` | knob, default 0.00; added to the cut-off control value as `filterMod · filterEnv`, independently of the `depth1`/`d1Filter` LFO term, which adds `depth1 · lfo · 0.5` | *"This control determines the amount of Filter Envelope which modulates the Filter. The control works independently from and in addition to the amount of LFO modulation from the MODULATION section."* |
| TYPE (addition) | `filterType` | multi, 2 states, default **0** = two-pole; 1 = four-pole. Panel LED caps are `2` and `4` | The manual states the filter is *"a two-pole, low-pass type"* with no option. State 0 is therefore the authentic setting; state 1 is an addition from the plugin skin. |
| OSC 1 | `fOsc1` | switch, default 1 | *"This switch controls whether or not the output from Oscillator 1 is input into the Filter."* |
| OSC 2 HALF / FULL | `fOsc2` | multi, 3 states, default **2** — 0 = off, 1 = half (DSP gain 0.56, i.e. about −5 dB), 2 = full | *"The FULL switch selects the full output of the Oscillator and the HALF switch selects a signal level approximately 5 db. below full output."* Two panel switches on the original; one three-state control with `HALF`/`FULL` LED caps here. |
| NOISE HALF / FULL | `fNoise` | multi, 3 states, default 0 — off / half (gain 0.56) / full | *"The Full switch selects the full output of the Noise Generator and the HALF switch selects a signal level approximately 5 db. below full output."* |
| KBD | `kbdTrack` | switch, default 1; when on the DSP adds `(note-60)/120` to the cut-off control value, so tracking is full-scale-referred rather than exactly 1 V/oct — the bottom of the keybed loses up to about a fifth of the knob's travel | *"This switch determines whether or not the keyboard control voltage going to each voice … is applied to the frequency control input of the Filter. When on, causes the Filter in each voice to 'track' the keyboard."* |

A patch is silent unless `fOsc1` is 1, or `fOsc2` > 0, or `fNoise` > 0 — the
filter is the only path to the output amplifier. No factory program violates
this.

---

## ENVELOPES section

The manual: *"The controls in the ENVELOPES section are all programmable."* Two
four-stage envelopes: FILTER ENVELOPE and LOUDNESS ENVELOPE. `ui.js` titles the
second one "VOLUME ENVELOPE".

All eight knobs are plain 0..1. Both the DSP (`scale.time`) and the `msTime`
readout use `1 ms + 10 s · v³` — about 1 ms fully counter-clockwise to 10 s fully
clockwise — which matches the manual's *"The shortest time is selected by
setting it fully counter-clockwise."* The taper is cubic, so the useful range for
ordinary attacks is compressed into the bottom third of the travel: a 25 ms
attack is about 0.13, a 300 ms attack about 0.31. The factory bank in
`src/presets.js` is voiced against that curve.

Each stage is implemented as a one-pole approach with a per-sample coefficient,
so DECAY and RELEASE are time constants rather than exact ramp durations.

### Filter envelope

| Manual control | Parameter id | Range / behaviour in this build | Manual quote or note |
| --- | --- | --- | --- |
| ATTACK | `fAttack` | knob, default 0.00 | *"This control determines the initial rise time of the Filter Envelope. The shortest time is selected by setting it fully counter-clockwise."* |
| DECAY | `fDecay` | knob, default 0.30 | *"the fall time … down to the level set by the Sustain control, while a key on the keyboard is being held down. If the Sustain control is at its maximum position this control has no effect on the sound."* |
| SUSTAIN | `fSustain` | knob, default 0.60 | *"This control determines the level the Filter Envelope goes to following the initial decay (set by the Decay control)."* |
| RELEASE | `fRelease` | knob, default 0.20 | *"the fall time of the Filter Envelope of a particular voice after the key controlling that voice is released."* |

### Loudness (volume) envelope

| Manual control | Parameter id | Range / behaviour in this build | Manual quote or note |
| --- | --- | --- | --- |
| ATTACK | `aAttack` | knob, default 0.00 | *"This control determines the initial rise time of the Loudness Envelope. The shortest time is selected by setting it fully counter-clockwise."* |
| DECAY | `aDecay` | knob, default 0.30 | *"If the Sustain control is set completely off this control determines completely the decay characteristics of the Loudness Envelope."* — this is how the Group C percussive programs get their blip. |
| SUSTAIN | `aSustain` | knob, default **1.00** | Level reached after the initial decay, per the FILTER ENVELOPE SUSTAIN wording. |
| RELEASE | `aRelease` | knob, default 0.20 | Fall time after key release. |

---

## MODULATION PANEL

The manual: *"The Modulation Panel is located just to the left of the keyboard."*
In this build these live on the performance panel to the left of the keybed and
are all non-programmable globals.

| Manual control | Parameter id | Range / behaviour in this build | Manual quote or note |
| --- | --- | --- | --- |
| MODULATION LEVER | `g:modDepth` (`GLOBALS.modDepth`, default 0.00) | 0..1 depth knob labelled DEPTH; the lever itself is the `bender` widget | *"This controls the amount of vibrato to be added to both Oscillators. If a patch already contains vibrato, this control will add more as it is moved towards the front. It has no effect when moved in the other direction."* |
| PITCH BEND LEVER | `GLOBALS.bend` | −1..1 | *"Moving it towards the front causes the pitch to go up, and moving it towards the rear causes the pitch to go down. Its range is determined by the NARROW/BROAD switch."* **Difference:** the original had two separate levers; this build has one lever plus a `g:arpMode` switch with LED caps `Mod` / `Arp` that selects what it drives. |
| OSC 2 ONLY | `g:bendOsc2Only` (`GLOBALS.bendOsc2Only`, default 0) | switch, 0/1 | *"When this switch is on, the PITCH BEND lever bends only Oscillator 2 of each voice. This has an interesting affect on programs in which Oscillator 2 is in 'sync'."* |
| NARROW / BROAD | `g:bendRange` (`GLOBALS.bendRange`, default 0) | 0 = narrow, 1 = broad; the DSP bend amount is `(broad ? 12 : 2) · bend` semitones, i.e. exactly a whole step or an octave. Panel caption is AMOUNT | *"In the NARROW position, the PITCH BEND lever has a range of up or down one whole-step … In the BROAD position, the PITCH BEND Lever can move the pitch up or down one octave."* |
| TRANSPOSE | `GLOBALS.transpose` (−1 / 0 / +1), driven by `g:transposeDown` and `g:transposeUp` | Three effective positions | *"This switch has three positions, UP OCTAVE, normal, and DOWN OCTAVE. This transposes the entire keyboard up or down one octave from its normal range, expanding the keyboard's range to six octaves."* `KEY_RANGE` is 61 keys, C2..C7 — the original's five-octave keybed. |

---

## PROGRAMMER

No PROGRAMMER page from the Owner's Manual was among those consulted, so this
table describes the build only and offers no quotes. What is authentic is the
capacity and addressing: 32 programs as four groups (A–D) of eight, which is how
`FACTORY_BANK` in `src/presets.js` is laid out (`index = group·8 + program − 1`).

| Panel control | Parameter id | Range / behaviour in this build | Note |
| --- | --- | --- | --- |
| PROGRAM 1..8 | `g:prog1` … `g:prog8` | Eight switches selecting the program within the current group | Matches the original's eight program buttons. |
| GROUP | `g:group` | Small knob; `groupName` formatter reads out `A`, `B`, `C` or `D` from `'ABCD'[floor(v·4)]` | Selects which bank of eight the program buttons address. |
| BANK | `g:bank` | Small knob; `bankName` formatter currently returns the constant `"Factory"` | Bank switching beyond the single factory bank is not implemented. |
| MANUAL | `g:manual` | Switch — plays the live panel positions rather than the stored program | The original had this too (hence the MANUAL section name). |
| PAGE 2 | `g:page2` | Switch | Plugin-skin control; no 1979 equivalent. |
| GLOBAL | `g:global` | Switch | Plugin-skin control; no 1979 equivalent. |
| WRITE | `g:write` | Switch — commits the current panel state into the selected program slot | The original wrote programs from the panel; a PROTECT switch guarded it (not implemented here — see below). |
| LCD | — | Three-line display: bank, program address (`A1`…`D8`) and program name. `presets.js` keeps every name to 16 characters or fewer to fit it | The 1979 OB-X had no alphanumeric display; program names are an addition. |

### KEYBOARD panel (addition)

| Panel control | Parameter id | Range / behaviour in this build | Note |
| --- | --- | --- | --- |
| SPLIT | `g:split` | switch; `GLOBALS.keyboardMode` = `'split'` | Not on the 1979 OB-X. |
| DOUBLE | `g:double` | switch; `GLOBALS.keyboardMode` = `'double'` | Not on the 1979 OB-X. |
| LOWER / UPPER | `g:lower`, `g:upper` | Select the edited layer (`GLOBALS.editLayer`, 0 = upper, 1 = lower); split point is `GLOBALS.splitNote` = 60 | Not on the 1979 OB-X. |

### ARPEGGIATOR panel (addition)

| Panel control | Parameter id | Range / behaviour in this build | Note |
| --- | --- | --- | --- |
| ARPEGGIATE | `g:arpOn` (`GLOBALS.arpOn`) | switch | Entirely an addition; the 1979 OB-X had no arpeggiator. |
| RATE | `g:arpRate` (`GLOBALS.arpRate`, default 0.45) | knob; `arpRate` formatter reads `0.5 + 15v` Hz | — |
| UP / DOWN / KBD / HOLD | `g:arpUp`, `g:arpDown`, `g:arpKbd`, `g:arpHold` | switches feeding `GLOBALS.arpMode` (`'up'`/`'down'`/`'updown'`/`'kbd'`) and `GLOBALS.arpHold` | — |

---

## Deliberate departures

### In this build, not on the 1979 OB-X

* **Four-pole filter option** — `filterType` state 1. The manual is explicit
  that the filter is *"a two-pole, low-pass type"*; state 0 is the authentic
  setting and is the default.
* **VINTAGE drift amount** — `vintage` (default 0.30). A programmable
  component-drift/detune-instability control with no hardware counterpart.
* **Velocity routing** — `velo` (off / filter / amp / both). The OB-X keyboard
  did not sense velocity.
* **Aftertouch routing** — `touch` (off / filter / amp / both). No aftertouch on
  the original keybed.
* **X-MOD as a continuous amount** — the manual describes X-MOD as a switch;
  here it is a knob (`xmod`).
* **CHORD as a single switch** — the manual's chord effect is a HOLD + RESET
  procedure; there is no RESET switch on this panel.
* **VOL/BALANCE** — `g:volBalance`, a stereo spread control over the voice
  pan-pots.
* **Arpeggiator** — on/off, rate, up/down/kbd, hold.
* **Split and double keyboard modes** — `GLOBALS.keyboardMode`, `editLayer`,
  `splitNote`.
* **PAGE 2 and GLOBAL programmer switches**, and an **alphanumeric LCD** showing
  bank, program address and program name.
* **MIDI input** — the boot screen offers "any connected MIDI keyboard". MIDI
  postdates the OB-X, which used discrete CV/gate and a cassette interface.
* **Computer-keyboard playing** (A–L / W–P), an interface-only addition.

Polyphony is **eight voices** (`VOICE_COUNT = 8` in `obx-processor.js`), which
the original OB-X also offered — it shipped in 4-, 6- and 8-voice
configurations — so that is not a departure.

### In the manual, not implemented here

* **Cassette interface** — the original could dump and reload its 32 programs to
  audio cassette. There is no equivalent in this build.
* **PROTECT switch** — the write-protect interlock guarding the programmer; the
  `g:write` switch here has no guard.
* **Pan-pot hardware trimming** — the per-voice pan trimmers set inside the
  instrument. This build exposes only the single `g:volBalance` spread control.
* **Foot-control inputs** — the volume-pedal input the VOLUME entry mentions
  (*"the provision for a VOLUME pedal input without an increase in hum or
  noise"*), plus the other rear-panel pedal/footswitch jacks.
* **LEFT / MONO / RIGHT audio outputs** as separate jacks. The DSP renders a
  stereo pair fed by the voice pan-pots; there is no separate mono sum, and no
  rear panel.
* **AUTO TUNE behaviour in detail** — `g:tune` is present as a momentary switch,
  but the manual's specifics (output amplifier muted during tuning; all
  pitch-affecting controls disabled *except* the pitch bend lever, so moving it
  mid-tune leaves the oscillators out of tune) are not modelled.
* **UNISON with HOLD as a four-step procedure** — the manual's press-UNISON,
  hold-HOLD, play, release-HOLD sequence. `unison` and `g:hold` both exist, but
  the interlocked procedure and its *"press any key on the keyboard"* cancel are
  not reproduced as such.

The manual's low-note rule for UNISON *is* implemented: `noteOn` in
`obx-processor.js` ignores a new note above the lowest sounding one while UNISON
is on, matching *"the lowest note played on the keyboard will always have
priority."*
