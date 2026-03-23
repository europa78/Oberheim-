/* ============================================
   OB-Xd Web Synthesizer - UI Controller
   Knob interactions, keyboard, MIDI
   ============================================ */

class OBXdUI {
    constructor(engine) {
        this.engine = engine;
        this.knobs = {};
        this.dragState = null;
        this.keyboardOctave = 3;
        this.heldKeys = new Set();

        // Computer keyboard -> note mapping (starting from C)
        this.keyMap = {
            'a': 0,  'w': 1,  's': 2,  'e': 3,  'd': 4,
            'f': 5,  't': 6,  'g': 7,  'y': 8,  'h': 9,
            'u': 10, 'j': 11, 'k': 12, 'o': 13, 'l': 14,
            'p': 15, ';': 16,
        };
    }

    init() {
        this._initKnobs();
        this._initButtons();
        this._initKeyboard();
        this._initComputerKeyboard();
        this._initMIDI();
        this._initEnvelopeDisplays();
        this._initOctaveControls();
        this._updateAllKnobPositions();
    }

    // ============== KNOBS ==============

    _initKnobs() {
        document.querySelectorAll('.knob').forEach(el => {
            const param = el.dataset.param;
            const min = parseFloat(el.dataset.min);
            const max = parseFloat(el.dataset.max);
            const value = parseFloat(el.dataset.value);
            const isLog = el.dataset.log === 'true';
            const step = el.dataset.step ? parseFloat(el.dataset.step) : null;

            this.knobs[param] = { el, min, max, value, isLog, step };

            // Add tooltip element
            const tooltip = document.createElement('div');
            tooltip.className = 'knob-tooltip';
            el.appendChild(tooltip);

            // Mouse events
            el.addEventListener('mousedown', (e) => this._onKnobMouseDown(e, param));

            // Double-click to reset
            el.addEventListener('dblclick', () => {
                this.knobs[param].value = parseFloat(el.dataset.value);
                this._updateKnobVisual(param);
                this.engine.setParam(param, this.knobs[param].value);
            });
        });

        // Global mouse events for dragging
        document.addEventListener('mousemove', (e) => this._onKnobMouseMove(e));
        document.addEventListener('mouseup', () => this._onKnobMouseUp());

        // Touch events
        document.addEventListener('touchmove', (e) => {
            if (this.dragState) {
                e.preventDefault();
                const touch = e.touches[0];
                this._onKnobMouseMove({ clientY: touch.clientY, clientX: touch.clientX });
            }
        }, { passive: false });

        document.addEventListener('touchend', () => this._onKnobMouseUp());
    }

    _onKnobMouseDown(e, param) {
        e.preventDefault();
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        this.dragState = {
            param,
            startY: clientY,
            startValue: this.knobs[param].value,
        };
        this.knobs[param].el.classList.add('dragging');
    }

    _onKnobMouseMove(e) {
        if (!this.dragState) return;

        const { param, startY, startValue } = this.dragState;
        const knob = this.knobs[param];
        const clientY = e.clientY;
        const delta = (startY - clientY) / 150; // sensitivity

        let newValue;
        if (knob.isLog) {
            const logMin = Math.log(knob.min);
            const logMax = Math.log(knob.max);
            const logStart = Math.log(Math.max(startValue, knob.min));
            const logVal = logStart + delta * (logMax - logMin);
            newValue = Math.exp(Math.min(Math.max(logVal, logMin), logMax));
        } else {
            const range = knob.max - knob.min;
            newValue = startValue + delta * range;
        }

        // Clamp
        newValue = Math.min(Math.max(newValue, knob.min), knob.max);

        // Step quantize
        if (knob.step) {
            newValue = Math.round(newValue / knob.step) * knob.step;
        }

        knob.value = newValue;
        this._updateKnobVisual(param);
        this.engine.setParam(param, newValue);

        // Update envelope displays if relevant
        if (param.startsWith('filter') || param.startsWith('amp')) {
            this._drawEnvelopes();
        }
    }

    _onKnobMouseUp() {
        if (this.dragState) {
            this.knobs[this.dragState.param].el.classList.remove('dragging');
            this.dragState = null;
        }
    }

    _updateKnobVisual(param) {
        const knob = this.knobs[param];
        if (!knob) return;

        // Convert value to 0-1 range
        let normalized;
        if (knob.isLog) {
            const logMin = Math.log(knob.min);
            const logMax = Math.log(knob.max);
            normalized = (Math.log(Math.max(knob.value, knob.min)) - logMin) / (logMax - logMin);
        } else {
            normalized = (knob.value - knob.min) / (knob.max - knob.min);
        }

        // Rotation: -135deg to +135deg (270 degree range)
        const rotation = -135 + normalized * 270;
        const indicator = knob.el.querySelector('.knob-indicator');
        if (indicator) {
            indicator.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
        }

        // Update tooltip
        const tooltip = knob.el.querySelector('.knob-tooltip');
        if (tooltip) {
            let displayVal;
            if (knob.step && knob.step >= 1) {
                displayVal = knob.value.toFixed(0);
            } else if (knob.value >= 1000) {
                displayVal = (knob.value / 1000).toFixed(1) + 'k';
            } else if (knob.value >= 100) {
                displayVal = knob.value.toFixed(0);
            } else {
                displayVal = knob.value.toFixed(2);
            }
            tooltip.textContent = displayVal;
        }
    }

    _updateAllKnobPositions() {
        for (const param of Object.keys(this.knobs)) {
            this._updateKnobVisual(param);
        }
    }

    // Set knob value programmatically (for presets)
    setKnobValue(param, value) {
        if (this.knobs[param]) {
            this.knobs[param].value = value;
            this._updateKnobVisual(param);
        }
    }

    // ============== BUTTONS ==============

    _initButtons() {
        // Waveform buttons
        document.querySelectorAll('.wave-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const osc = btn.dataset.osc;
                const wave = btn.dataset.wave;

                // Deactivate siblings
                btn.parentElement.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (osc === '1') {
                    this.engine.params.osc1Wave = wave;
                } else {
                    this.engine.params.osc2Wave = wave;
                }
            });
        });

        // Voice mode buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.parentElement.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.engine.setVoiceMode(btn.dataset.voice);

                const display = document.getElementById('voice-display');
                const labels = { poly: 'POLY 8', mono: 'MONO', unison: 'UNISON 4' };
                display.textContent = labels[btn.dataset.voice] || 'POLY 8';
            });
        });

        // Filter type buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.engine.params.filterType = btn.dataset.filter;
            });
        });

        // Filter slope buttons
        document.querySelectorAll('.slope-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.parentElement.querySelectorAll('.slope-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.engine.params.filterSlope = parseInt(btn.dataset.slope);
            });
        });

        // LFO waveform buttons
        document.querySelectorAll('.lfo-wave-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.parentElement.querySelectorAll('.lfo-wave-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.engine.setLFOWave(btn.dataset.lfoWave);
            });
        });
    }

    // ============== ON-SCREEN KEYBOARD ==============

    _initKeyboard() {
        const keyboard = document.getElementById('keyboard');
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const whiteNotes = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
        const blackNotes = [1, 3, 6, 8, 10]; // C# D# F# G# A#
        const blackPositions = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };

        // Build 2 octaves of keys
        const numOctaves = 2;
        const whiteKeyWidth = 36;

        for (let oct = 0; oct < numOctaves; oct++) {
            // White keys
            whiteNotes.forEach((noteOffset, i) => {
                const key = document.createElement('div');
                key.className = 'key key-white';
                const midi = (this.keyboardOctave + oct) * 12 + noteOffset + 12;
                key.dataset.note = midi;

                if (noteOffset === 0) {
                    const label = document.createElement('span');
                    label.className = 'key-label';
                    label.textContent = `C${this.keyboardOctave + oct}`;
                    key.appendChild(label);
                }

                this._addKeyListeners(key, midi);
                keyboard.appendChild(key);
            });
        }

        // Black keys (positioned absolutely)
        for (let oct = 0; oct < numOctaves; oct++) {
            blackNotes.forEach(noteOffset => {
                const key = document.createElement('div');
                key.className = 'key key-black';
                const midi = (this.keyboardOctave + oct) * 12 + noteOffset + 12;
                key.dataset.note = midi;

                // Position relative to white keys
                const pos = blackPositions[noteOffset];
                const left = (oct * 7 + pos) * whiteKeyWidth + whiteKeyWidth * 0.65;
                key.style.left = `${left}px`;

                this._addKeyListeners(key, midi);
                keyboard.appendChild(key);
            });
        }
    }

    _addKeyListeners(keyEl, midi) {
        const onStart = (e) => {
            e.preventDefault();
            keyEl.classList.add('active');
            this.engine.noteOn(midi, 100);
        };

        const onEnd = (e) => {
            e.preventDefault();
            keyEl.classList.remove('active');
            this.engine.noteOff(midi);
        };

        keyEl.addEventListener('mousedown', onStart);
        keyEl.addEventListener('mouseup', onEnd);
        keyEl.addEventListener('mouseleave', (e) => {
            if (e.buttons > 0) onEnd(e);
        });
        keyEl.addEventListener('mouseenter', (e) => {
            if (e.buttons > 0) onStart(e);
        });

        keyEl.addEventListener('touchstart', onStart, { passive: false });
        keyEl.addEventListener('touchend', onEnd, { passive: false });
    }

    // ============== COMPUTER KEYBOARD ==============

    _initComputerKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            const key = e.key.toLowerCase();

            if (key === 'z') {
                this.keyboardOctave = Math.max(0, this.keyboardOctave - 1);
                this._updateOctaveDisplay();
                return;
            }
            if (key === 'x') {
                this.keyboardOctave = Math.min(7, this.keyboardOctave + 1);
                this._updateOctaveDisplay();
                return;
            }

            if (this.keyMap.hasOwnProperty(key) && !this.heldKeys.has(key)) {
                this.heldKeys.add(key);
                const midi = (this.keyboardOctave + 1) * 12 + this.keyMap[key];
                this.engine.noteOn(midi, 100);
                this._highlightKey(midi, true);
            }
        });

        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keyMap.hasOwnProperty(key)) {
                this.heldKeys.delete(key);
                const midi = (this.keyboardOctave + 1) * 12 + this.keyMap[key];
                this.engine.noteOff(midi);
                this._highlightKey(midi, false);
            }
        });
    }

    _highlightKey(midi, active) {
        const keyEl = document.querySelector(`.key[data-note="${midi}"]`);
        if (keyEl) {
            if (active) keyEl.classList.add('active');
            else keyEl.classList.remove('active');
        }
    }

    // ============== MIDI ==============

    _initMIDI() {
        if (!navigator.requestMIDIAccess) return;

        navigator.requestMIDIAccess().then(
            (midiAccess) => {
                const status = document.getElementById('midi-status');
                const inputs = midiAccess.inputs;

                if (inputs.size > 0) {
                    status.textContent = `MIDI: Connected (${inputs.size} device${inputs.size > 1 ? 's' : ''})`;
                    status.classList.add('connected');
                }

                inputs.forEach(input => {
                    input.onmidimessage = (msg) => this._handleMIDI(msg);
                });

                midiAccess.onstatechange = () => {
                    const count = midiAccess.inputs.size;
                    if (count > 0) {
                        status.textContent = `MIDI: Connected (${count})`;
                        status.classList.add('connected');
                    } else {
                        status.textContent = 'MIDI: Not connected';
                        status.classList.remove('connected');
                    }
                    midiAccess.inputs.forEach(input => {
                        input.onmidimessage = (msg) => this._handleMIDI(msg);
                    });
                };
            },
            () => {
                // MIDI not available
            }
        );
    }

    _handleMIDI(msg) {
        const [status, data1, data2] = msg.data;
        const command = status & 0xf0;

        switch (command) {
            case 0x90: // Note on
                if (data2 > 0) {
                    this.engine.noteOn(data1, data2);
                    this._highlightKey(data1, true);
                } else {
                    this.engine.noteOff(data1);
                    this._highlightKey(data1, false);
                }
                break;
            case 0x80: // Note off
                this.engine.noteOff(data1);
                this._highlightKey(data1, false);
                break;
            case 0xb0: // CC
                this._handleMIDICC(data1, data2);
                break;
        }
    }

    _handleMIDICC(cc, value) {
        const normalized = value / 127;
        // Common MIDI CC mappings
        switch (cc) {
            case 1: // Mod wheel -> LFO to pitch
                this.engine.setParam('lfoToPitch', normalized);
                this.setKnobValue('lfoToPitch', normalized);
                break;
            case 74: // Filter cutoff
                const cutoff = 20 * Math.pow(1000, normalized);
                this.engine.setParam('filterCutoff', cutoff);
                this.setKnobValue('filterCutoff', cutoff);
                break;
            case 71: // Resonance
                const reso = normalized * 30;
                this.engine.setParam('filterResonance', reso);
                this.setKnobValue('filterResonance', reso);
                break;
        }
    }

    // ============== ENVELOPE DISPLAY ==============

    _initEnvelopeDisplays() {
        this._drawEnvelopes();
    }

    _drawEnvelopes() {
        this._drawEnvelope('filter-env-display', {
            a: this.engine.params.filterAttack,
            d: this.engine.params.filterDecay,
            s: this.engine.params.filterSustain,
            r: this.engine.params.filterRelease,
        });
        this._drawEnvelope('amp-env-display', {
            a: this.engine.params.ampAttack,
            d: this.engine.params.ampDecay,
            s: this.engine.params.ampSustain,
            r: this.engine.params.ampRelease,
        });
    }

    _drawEnvelope(containerId, env) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const canvas = container.querySelector('canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const padding = 4;

        ctx.clearRect(0, 0, w, h);

        // Background grid
        ctx.strokeStyle = 'rgba(255,107,0,0.08)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 5; i++) {
            const y = padding + (i / 4) * (h - padding * 2);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Normalize times for display
        const totalTime = env.a + env.d + 0.5 + env.r; // sustain segment is fixed width
        const scaleX = (w - padding * 2) / totalTime;

        const points = [
            { x: padding, y: h - padding }, // start
            { x: padding + env.a * scaleX, y: padding }, // attack peak
            { x: padding + (env.a + env.d) * scaleX, y: padding + (1 - env.s) * (h - padding * 2) }, // sustain level
            { x: padding + (env.a + env.d + 0.5) * scaleX, y: padding + (1 - env.s) * (h - padding * 2) }, // sustain hold
            { x: padding + totalTime * scaleX, y: h - padding }, // release end
        ];

        // Draw filled area
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, h - padding);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,107,0,0.1)';
        ctx.fill();

        // Draw line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = '#ff6b00';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw dots at control points
        points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#ff6b00';
            ctx.fill();
        });
    }

    // ============== OCTAVE CONTROLS ==============

    _initOctaveControls() {
        document.getElementById('octave-down').addEventListener('click', () => {
            this.keyboardOctave = Math.max(0, this.keyboardOctave - 1);
            this._updateOctaveDisplay();
        });
        document.getElementById('octave-up').addEventListener('click', () => {
            this.keyboardOctave = Math.min(7, this.keyboardOctave + 1);
            this._updateOctaveDisplay();
        });
        this._updateOctaveDisplay();
    }

    _updateOctaveDisplay() {
        document.getElementById('octave-display').textContent = `C${this.keyboardOctave}`;
    }

    // ============== PRESET UI ==============

    updatePresetUI(presets, currentIndex) {
        const select = document.getElementById('preset-select');
        const display = document.getElementById('preset-display');

        select.innerHTML = '';
        presets.forEach((preset, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = preset.name;
            if (i === currentIndex) opt.selected = true;
            select.appendChild(opt);
        });

        display.textContent = presets[currentIndex].name;
    }

    // Apply preset to all UI elements
    applyPresetToUI(preset) {
        const p = preset.params;

        // Update knobs
        for (const [key, value] of Object.entries(p)) {
            if (this.knobs[key]) {
                this.knobs[key].value = value;
                this._updateKnobVisual(key);
            }
        }

        // Update waveform buttons
        if (p.osc1Wave) {
            document.querySelectorAll('.wave-btn[data-osc="1"]').forEach(b => {
                b.classList.toggle('active', b.dataset.wave === p.osc1Wave);
            });
        }
        if (p.osc2Wave) {
            document.querySelectorAll('.wave-btn[data-osc="2"]').forEach(b => {
                b.classList.toggle('active', b.dataset.wave === p.osc2Wave);
            });
        }

        // Filter type
        if (p.filterType) {
            document.querySelectorAll('.filter-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.filter === p.filterType);
            });
        }

        // Filter slope
        if (p.filterSlope) {
            document.querySelectorAll('.slope-btn').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.slope) === p.filterSlope);
            });
        }

        // LFO wave
        if (p.lfoWave) {
            document.querySelectorAll('.lfo-wave-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.lfoWave === p.lfoWave);
            });
        }

        // Envelope displays
        this._drawEnvelopes();
    }
}
