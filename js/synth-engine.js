/* ============================================
   OB-Xd Web Synthesizer - Audio Engine
   8-voice polyphonic subtractive synthesizer
   ============================================ */

class OBXdEngine {
    constructor() {
        this.audioCtx = null;
        this.masterGain = null;
        this.compressor = null;
        this.chorusNode = null;
        this.reverbNode = null;
        this.delayNode = null;
        this.analyser = null;
        this.voices = [];
        this.maxVoices = 8;
        this.activeNotes = new Map();
        this.voiceMode = 'poly'; // poly, mono, unison
        this.baseOctave = 3;

        // Synth parameters with defaults
        this.params = {
            // Voice
            voiceDetune: 0.15,
            portamento: 0,
            masterVolume: 0.7,

            // OSC 1
            osc1Wave: 'sawtooth',
            osc1Octave: 0,
            osc1Detune: 0,
            osc1PW: 0.5,
            osc1Level: 0.8,

            // OSC 2
            osc2Wave: 'sawtooth',
            osc2Octave: 0,
            osc2Detune: 0,
            osc2PW: 0.5,
            osc2Level: 0.5,
            osc2Sync: 0,
            oscCross: 0,

            // Filter
            filterType: 'lowpass',
            filterSlope: 12,
            filterCutoff: 8000,
            filterResonance: 1,
            filterEnvAmount: 0.3,
            filterKeyTrack: 0.5,
            filterVelocity: 0.3,

            // Filter Envelope
            filterAttack: 0.01,
            filterDecay: 0.3,
            filterSustain: 0.5,
            filterRelease: 0.5,

            // Amp Envelope
            ampAttack: 0.01,
            ampDecay: 0.3,
            ampSustain: 0.7,
            ampRelease: 0.5,

            // LFO
            lfoWave: 'sine',
            lfoRate: 3,
            lfoDelay: 0,
            lfoToPitch: 0,
            lfoToFilter: 0,
            lfoToPW: 0,
            lfoToAmp: 0,

            // Effects
            chorusRate: 1.2,
            chorusDepth: 0,
            reverbMix: 0.15,
            reverbDecay: 2,
            delayTime: 0.3,
            delayFeedback: 0,
            delayMix: 0,
        };
    }

    async init() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // Master chain: voices -> compressor -> chorus -> delay -> reverb -> master gain -> destination
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = this.params.masterVolume;

        // Compressor to tame peaks
        this.compressor = this.audioCtx.createDynamicsCompressor();
        this.compressor.threshold.value = -12;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.1;

        // Analyser for visualization
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 2048;

        // Setup effects
        this._setupChorus();
        this._setupDelay();
        await this._setupReverb();

        // Signal chain
        this.voiceBus = this.audioCtx.createGain();
        this.voiceBus.gain.value = 1;

        this.voiceBus.connect(this.chorusInput);
        this.chorusOutput.connect(this.delayInput);
        this.delayOutput.connect(this.reverbDry);
        this.delayOutput.connect(this.reverbWet);
        this.reverbDry.connect(this.compressor);
        this.reverbWet.connect(this.reverbConvolver);
        this.reverbConvolver.connect(this.compressor);
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);

        // Create global LFO
        this._setupLFO();

        return this;
    }

    _setupLFO() {
        this.lfo = this.audioCtx.createOscillator();
        this.lfo.type = this.params.lfoWave;
        this.lfo.frequency.value = this.params.lfoRate;

        this.lfoGainPitch = this.audioCtx.createGain();
        this.lfoGainPitch.gain.value = 0;

        this.lfoGainFilter = this.audioCtx.createGain();
        this.lfoGainFilter.gain.value = 0;

        this.lfoGainPW = this.audioCtx.createGain();
        this.lfoGainPW.gain.value = 0;

        this.lfoGainAmp = this.audioCtx.createGain();
        this.lfoGainAmp.gain.value = 0;

        this.lfo.connect(this.lfoGainPitch);
        this.lfo.connect(this.lfoGainFilter);
        this.lfo.connect(this.lfoGainPW);
        this.lfo.connect(this.lfoGainAmp);

        this.lfo.start();
    }

    _setupChorus() {
        // Simple chorus using delay modulation
        this.chorusInput = this.audioCtx.createGain();
        this.chorusOutput = this.audioCtx.createGain();
        this.chorusDry = this.audioCtx.createGain();
        this.chorusWet = this.audioCtx.createGain();

        this.chorusDelay1 = this.audioCtx.createDelay(0.1);
        this.chorusDelay1.delayTime.value = 0.005;
        this.chorusDelay2 = this.audioCtx.createDelay(0.1);
        this.chorusDelay2.delayTime.value = 0.007;

        this.chorusLFO1 = this.audioCtx.createOscillator();
        this.chorusLFO1.type = 'sine';
        this.chorusLFO1.frequency.value = this.params.chorusRate;
        this.chorusLFOGain1 = this.audioCtx.createGain();
        this.chorusLFOGain1.gain.value = 0;

        this.chorusLFO2 = this.audioCtx.createOscillator();
        this.chorusLFO2.type = 'sine';
        this.chorusLFO2.frequency.value = this.params.chorusRate * 1.1;
        this.chorusLFOGain2 = this.audioCtx.createGain();
        this.chorusLFOGain2.gain.value = 0;

        this.chorusLFO1.connect(this.chorusLFOGain1);
        this.chorusLFOGain1.connect(this.chorusDelay1.delayTime);
        this.chorusLFO2.connect(this.chorusLFOGain2);
        this.chorusLFOGain2.connect(this.chorusDelay2.delayTime);

        this.chorusLFO1.start();
        this.chorusLFO2.start();

        this.chorusInput.connect(this.chorusDry);
        this.chorusInput.connect(this.chorusDelay1);
        this.chorusInput.connect(this.chorusDelay2);
        this.chorusDelay1.connect(this.chorusWet);
        this.chorusDelay2.connect(this.chorusWet);
        this.chorusDry.connect(this.chorusOutput);
        this.chorusWet.connect(this.chorusOutput);

        this.chorusDry.gain.value = 1;
        this.chorusWet.gain.value = 0;
    }

    _setupDelay() {
        this.delayInput = this.audioCtx.createGain();
        this.delayOutput = this.audioCtx.createGain();
        this.delayLine = this.audioCtx.createDelay(2);
        this.delayLine.delayTime.value = this.params.delayTime;
        this.delayFeedback = this.audioCtx.createGain();
        this.delayFeedback.gain.value = 0;
        this.delayDry = this.audioCtx.createGain();
        this.delayDry.gain.value = 1;
        this.delayWetGain = this.audioCtx.createGain();
        this.delayWetGain.gain.value = 0;

        // Delay filter to darken repeats
        this.delayFilter = this.audioCtx.createBiquadFilter();
        this.delayFilter.type = 'lowpass';
        this.delayFilter.frequency.value = 4000;

        this.delayInput.connect(this.delayDry);
        this.delayInput.connect(this.delayLine);
        this.delayLine.connect(this.delayFilter);
        this.delayFilter.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delayLine);
        this.delayFilter.connect(this.delayWetGain);
        this.delayDry.connect(this.delayOutput);
        this.delayWetGain.connect(this.delayOutput);
    }

    async _setupReverb() {
        this.reverbDry = this.audioCtx.createGain();
        this.reverbDry.gain.value = 1;
        this.reverbWet = this.audioCtx.createGain();
        this.reverbWet.gain.value = this.params.reverbMix;
        this.reverbConvolver = this.audioCtx.createConvolver();

        // Generate impulse response
        this._generateReverbIR(this.params.reverbDecay);
    }

    _generateReverbIR(decay) {
        const sampleRate = this.audioCtx.sampleRate;
        const length = sampleRate * Math.max(decay, 0.5);
        const impulse = this.audioCtx.createBuffer(2, length, sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                // Exponential decay with some early reflections
                const t = i / sampleRate;
                const earlyReflection = (i < sampleRate * 0.05) ? 0.3 : 0;
                data[i] = (Math.random() * 2 - 1 + earlyReflection) *
                          Math.pow(1 - i / length, decay * 1.5);
            }
        }
        this.reverbConvolver.buffer = impulse;
    }

    // Convert MIDI note to frequency
    midiToFreq(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    // Note name from MIDI
    noteNameFromMidi(note) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return names[note % 12] + Math.floor(note / 12 - 1);
    }

    noteOn(note, velocity = 127) {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const vel = velocity / 127;
        const now = this.audioCtx.currentTime;

        if (this.voiceMode === 'mono') {
            this._noteOnMono(note, vel, now);
        } else if (this.voiceMode === 'unison') {
            this._noteOnUnison(note, vel, now);
        } else {
            this._noteOnPoly(note, vel, now);
        }
    }

    _noteOnPoly(note, vel, now) {
        // Steal oldest voice if we're at max
        if (this.activeNotes.size >= this.maxVoices) {
            const oldest = this.activeNotes.keys().next().value;
            this.noteOff(oldest);
        }

        const voice = this._createVoice(note, vel, now);
        this.activeNotes.set(note, voice);
    }

    _noteOnMono(note, vel, now) {
        // Kill all existing voices
        for (const [n, v] of this.activeNotes) {
            this._killVoice(v, now);
        }
        this.activeNotes.clear();

        const voice = this._createVoice(note, vel, now);
        this.activeNotes.set(note, voice);
    }

    _noteOnUnison(note, vel, now) {
        // Kill existing
        for (const [n, v] of this.activeNotes) {
            this._killVoice(v, now);
        }
        this.activeNotes.clear();

        // Create multiple detuned voices
        const unisonCount = 4;
        const voices = [];
        for (let i = 0; i < unisonCount; i++) {
            const detuneOffset = (i - (unisonCount - 1) / 2) * this.params.voiceDetune * 20;
            const voice = this._createVoice(note, vel, now, detuneOffset);
            voices.push(voice);
        }
        this.activeNotes.set(note, voices);
    }

    _createVoice(note, vel, now, extraDetune = 0) {
        const freq = this.midiToFreq(note);
        const p = this.params;

        // Random micro-detuning for analog character
        const microDetune = (Math.random() - 0.5) * p.voiceDetune * 10;

        // === Oscillator 1 ===
        const osc1 = this.audioCtx.createOscillator();
        osc1.type = p.osc1Wave;
        const osc1Freq = freq * Math.pow(2, p.osc1Octave);
        osc1.frequency.value = osc1Freq;
        osc1.detune.value = p.osc1Detune * 100 + microDetune + extraDetune;

        const osc1Gain = this.audioCtx.createGain();
        osc1Gain.gain.value = p.osc1Level;

        // === Oscillator 2 ===
        let osc2, osc2Gain, noiseNode, noiseGain;
        const isNoise = p.osc2Wave === 'noise';

        if (isNoise) {
            // White noise generator
            noiseNode = this._createNoiseNode();
            noiseGain = this.audioCtx.createGain();
            noiseGain.gain.value = p.osc2Level;
        } else {
            osc2 = this.audioCtx.createOscillator();
            osc2.type = p.osc2Wave;
            const osc2Freq = freq * Math.pow(2, p.osc2Octave);
            osc2.frequency.value = osc2Freq;
            osc2.detune.value = p.osc2Detune * 100 + microDetune * 1.3 + extraDetune;
        }

        osc2Gain = this.audioCtx.createGain();
        osc2Gain.gain.value = p.osc2Level;

        // === Filter ===
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = this._getFilterType();
        const baseCutoff = p.filterCutoff;
        const keyTrackOffset = (note - 60) * p.filterKeyTrack * 100;
        const velOffset = vel * p.filterVelocity * 4000;
        filter.frequency.value = Math.min(baseCutoff + keyTrackOffset + velOffset, 20000);
        filter.Q.value = p.filterResonance;

        // Second filter for 24dB mode
        let filter2 = null;
        if (p.filterSlope === 24) {
            filter2 = this.audioCtx.createBiquadFilter();
            filter2.type = this._getFilterType();
            filter2.frequency.value = filter.frequency.value;
            filter2.Q.value = p.filterResonance * 0.7;
        }

        // === Amp VCA ===
        const vca = this.audioCtx.createGain();
        vca.gain.value = 0;

        // === Filter Envelope ===
        const envFilterAmount = p.filterEnvAmount * 8000;
        const filterBaseFreq = filter.frequency.value;

        filter.frequency.setValueAtTime(filterBaseFreq, now);
        filter.frequency.linearRampToValueAtTime(
            Math.min(filterBaseFreq + envFilterAmount, 20000),
            now + p.filterAttack
        );
        filter.frequency.linearRampToValueAtTime(
            Math.min(filterBaseFreq + envFilterAmount * p.filterSustain, 20000),
            now + p.filterAttack + p.filterDecay
        );

        if (filter2) {
            filter2.frequency.setValueAtTime(filterBaseFreq, now);
            filter2.frequency.linearRampToValueAtTime(
                Math.min(filterBaseFreq + envFilterAmount, 20000),
                now + p.filterAttack
            );
            filter2.frequency.linearRampToValueAtTime(
                Math.min(filterBaseFreq + envFilterAmount * p.filterSustain, 20000),
                now + p.filterAttack + p.filterDecay
            );
        }

        // === Amp Envelope ===
        const peakVol = vel * 0.3;
        vca.gain.setValueAtTime(0, now);
        vca.gain.linearRampToValueAtTime(peakVol, now + p.ampAttack);
        vca.gain.linearRampToValueAtTime(
            peakVol * p.ampSustain,
            now + p.ampAttack + p.ampDecay
        );

        // === Connect signal path ===
        osc1.connect(osc1Gain);
        osc1Gain.connect(filter);

        if (isNoise) {
            noiseNode.connect(noiseGain);
            noiseGain.connect(filter);
        } else {
            osc2.connect(osc2Gain);
            osc2Gain.connect(filter);
        }

        if (filter2) {
            filter.connect(filter2);
            filter2.connect(vca);
        } else {
            filter.connect(vca);
        }

        vca.connect(this.voiceBus);

        // === LFO connections ===
        this.lfoGainPitch.connect(osc1.frequency);
        if (osc2) {
            this.lfoGainPitch.connect(osc2.frequency);
        }
        this.lfoGainFilter.connect(filter.frequency);
        if (filter2) {
            this.lfoGainFilter.connect(filter2.frequency);
        }
        this.lfoGainAmp.connect(vca.gain);

        // Start oscillators
        osc1.start(now);
        if (osc2) osc2.start(now);

        return {
            note,
            osc1, osc1Gain,
            osc2, osc2Gain,
            noiseNode, noiseGain,
            filter, filter2,
            vca,
            startTime: now,
            vel,
            filterBaseFreq,
        };
    }

    _createNoiseNode() {
        const bufferSize = this.audioCtx.sampleRate * 2;
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const node = this.audioCtx.createBufferSource();
        node.buffer = buffer;
        node.loop = true;
        node.start();
        return node;
    }

    _getFilterType() {
        const typeMap = {
            'lowpass': 'lowpass',
            'highpass': 'highpass',
            'bandpass': 'bandpass',
            'notch': 'notch',
        };
        return typeMap[this.params.filterType] || 'lowpass';
    }

    noteOff(note) {
        if (!this.audioCtx) return;

        const voiceData = this.activeNotes.get(note);
        if (!voiceData) return;

        const now = this.audioCtx.currentTime;

        if (Array.isArray(voiceData)) {
            // Unison mode - multiple voices per note
            voiceData.forEach(v => this._releaseVoice(v, now));
        } else {
            this._releaseVoice(voiceData, now);
        }

        this.activeNotes.delete(note);
    }

    _releaseVoice(voice, now) {
        const p = this.params;

        // Amp release
        voice.vca.gain.cancelScheduledValues(now);
        voice.vca.gain.setValueAtTime(voice.vca.gain.value, now);
        voice.vca.gain.linearRampToValueAtTime(0, now + p.ampRelease);

        // Filter release
        voice.filter.frequency.cancelScheduledValues(now);
        voice.filter.frequency.setValueAtTime(voice.filter.frequency.value, now);
        voice.filter.frequency.linearRampToValueAtTime(
            voice.filterBaseFreq,
            now + p.filterRelease
        );

        if (voice.filter2) {
            voice.filter2.frequency.cancelScheduledValues(now);
            voice.filter2.frequency.setValueAtTime(voice.filter2.frequency.value, now);
            voice.filter2.frequency.linearRampToValueAtTime(
                voice.filterBaseFreq,
                now + p.filterRelease
            );
        }

        // Cleanup after release
        const cleanupTime = Math.max(p.ampRelease, p.filterRelease) + 0.1;
        setTimeout(() => this._killVoice(voice, now), cleanupTime * 1000);
    }

    _killVoice(voice, now) {
        try {
            if (voice.osc1) { voice.osc1.stop(); voice.osc1.disconnect(); }
            if (voice.osc2) { voice.osc2.stop(); voice.osc2.disconnect(); }
            if (voice.noiseNode) { voice.noiseNode.stop(); voice.noiseNode.disconnect(); }
            if (voice.osc1Gain) voice.osc1Gain.disconnect();
            if (voice.osc2Gain) voice.osc2Gain.disconnect();
            if (voice.noiseGain) voice.noiseGain.disconnect();
            if (voice.filter) voice.filter.disconnect();
            if (voice.filter2) voice.filter2.disconnect();
            if (voice.vca) voice.vca.disconnect();
        } catch (e) {
            // Nodes already stopped/disconnected
        }
    }

    // Update a single parameter
    setParam(name, value) {
        this.params[name] = value;
        this._applyParam(name, value);
    }

    _applyParam(name, value) {
        const now = this.audioCtx ? this.audioCtx.currentTime : 0;

        switch (name) {
            case 'masterVolume':
                if (this.masterGain) this.masterGain.gain.setTargetAtTime(value, now, 0.02);
                break;

            case 'lfoRate':
                if (this.lfo) this.lfo.frequency.setTargetAtTime(value, now, 0.02);
                break;

            case 'lfoToPitch':
                if (this.lfoGainPitch) this.lfoGainPitch.gain.setTargetAtTime(value * 50, now, 0.02);
                break;

            case 'lfoToFilter':
                if (this.lfoGainFilter) this.lfoGainFilter.gain.setTargetAtTime(value * 2000, now, 0.02);
                break;

            case 'lfoToPW':
                if (this.lfoGainPW) this.lfoGainPW.gain.setTargetAtTime(value * 0.5, now, 0.02);
                break;

            case 'lfoToAmp':
                if (this.lfoGainAmp) this.lfoGainAmp.gain.setTargetAtTime(value * 0.3, now, 0.02);
                break;

            case 'chorusDepth':
                if (this.chorusLFOGain1) {
                    this.chorusLFOGain1.gain.setTargetAtTime(value * 0.003, now, 0.02);
                    this.chorusLFOGain2.gain.setTargetAtTime(value * 0.004, now, 0.02);
                    this.chorusWet.gain.setTargetAtTime(value * 0.5, now, 0.02);
                }
                break;

            case 'chorusRate':
                if (this.chorusLFO1) {
                    this.chorusLFO1.frequency.setTargetAtTime(value, now, 0.02);
                    this.chorusLFO2.frequency.setTargetAtTime(value * 1.1, now, 0.02);
                }
                break;

            case 'reverbMix':
                if (this.reverbWet) this.reverbWet.gain.setTargetAtTime(value, now, 0.02);
                if (this.reverbDry) this.reverbDry.gain.setTargetAtTime(1 - value * 0.3, now, 0.02);
                break;

            case 'reverbDecay':
                this._generateReverbIR(value);
                break;

            case 'delayTime':
                if (this.delayLine) this.delayLine.delayTime.setTargetAtTime(value, now, 0.05);
                break;

            case 'delayFeedback':
                if (this.delayFeedback) this.delayFeedback.gain.setTargetAtTime(value, now, 0.02);
                break;

            case 'delayMix':
                if (this.delayWetGain) this.delayWetGain.gain.setTargetAtTime(value, now, 0.02);
                break;

            // Live filter updates on active voices
            case 'filterCutoff':
            case 'filterResonance':
                this._updateActiveFilters(now);
                break;
        }
    }

    _updateActiveFilters(now) {
        for (const [note, voiceData] of this.activeNotes) {
            const voices = Array.isArray(voiceData) ? voiceData : [voiceData];
            for (const voice of voices) {
                const cutoff = Math.min(this.params.filterCutoff +
                    (note - 60) * this.params.filterKeyTrack * 100, 20000);
                voice.filter.frequency.setTargetAtTime(cutoff, now, 0.02);
                voice.filter.Q.setTargetAtTime(this.params.filterResonance, now, 0.02);
                voice.filterBaseFreq = cutoff;
                if (voice.filter2) {
                    voice.filter2.frequency.setTargetAtTime(cutoff, now, 0.02);
                    voice.filter2.Q.setTargetAtTime(this.params.filterResonance * 0.7, now, 0.02);
                }
            }
        }
    }

    setVoiceMode(mode) {
        // Kill all active voices first
        this.panic();
        this.voiceMode = mode;
    }

    setLFOWave(wave) {
        if (this.lfo) {
            this.lfo.type = wave;
            this.params.lfoWave = wave;
        }
    }

    // Stop all voices immediately
    panic() {
        const now = this.audioCtx ? this.audioCtx.currentTime : 0;
        for (const [note, voiceData] of this.activeNotes) {
            if (Array.isArray(voiceData)) {
                voiceData.forEach(v => this._killVoice(v, now));
            } else {
                this._killVoice(voiceData, now);
            }
        }
        this.activeNotes.clear();
    }

    // Load a full preset
    loadPreset(preset) {
        this.panic();
        for (const [key, value] of Object.entries(preset.params)) {
            this.params[key] = value;
            this._applyParam(key, value);
        }
        if (preset.params.lfoWave) {
            this.setLFOWave(preset.params.lfoWave);
        }
    }
}
