/* ============================================
   OB-Xd Web Synthesizer - Factory Presets
   ============================================ */

const OBXdPresets = [
    {
        name: 'Init Patch',
        params: {
            osc1Wave: 'sawtooth', osc1Octave: 0, osc1Detune: 0, osc1PW: 0.5, osc1Level: 0.8,
            osc2Wave: 'sawtooth', osc2Octave: 0, osc2Detune: 0, osc2PW: 0.5, osc2Level: 0.5,
            osc2Sync: 0, oscCross: 0,
            filterType: 'lowpass', filterSlope: 12, filterCutoff: 8000, filterResonance: 1,
            filterEnvAmount: 0.3, filterKeyTrack: 0.5, filterVelocity: 0.3,
            filterAttack: 0.01, filterDecay: 0.3, filterSustain: 0.5, filterRelease: 0.5,
            ampAttack: 0.01, ampDecay: 0.3, ampSustain: 0.7, ampRelease: 0.5,
            lfoWave: 'sine', lfoRate: 3, lfoDelay: 0,
            lfoToPitch: 0, lfoToFilter: 0, lfoToPW: 0, lfoToAmp: 0,
            voiceDetune: 0.15, portamento: 0, masterVolume: 0.7,
            chorusRate: 1.2, chorusDepth: 0, reverbMix: 0.15, reverbDecay: 2,
            delayTime: 0.3, delayFeedback: 0, delayMix: 0,
        }
    },
    {
        name: 'Classic Brass',
        params: {
            osc1Wave: 'sawtooth', osc1Octave: 0, osc1Detune: 0.05, osc1PW: 0.5, osc1Level: 0.8,
            osc2Wave: 'sawtooth', osc2Octave: 0, osc2Detune: -0.05, osc2PW: 0.5, osc2Level: 0.7,
            osc2Sync: 0, oscCross: 0,
            filterType: 'lowpass', filterSlope: 24, filterCutoff: 2000, filterResonance: 2,
            filterEnvAmount: 0.6, filterKeyTrack: 0.5, filterVelocity: 0.5,
            filterAttack: 0.05, filterDecay: 0.4, filterSustain: 0.4, filterRelease: 0.3,
            ampAttack: 0.05, ampDecay: 0.2, ampSustain: 0.8, ampRelease: 0.3,
            lfoWave: 'sine', lfoRate: 5, lfoDelay: 0.5,
            lfoToPitch: 0.05, lfoToFilter: 0, lfoToPW: 0, lfoToAmp: 0,
            voiceDetune: 0.2, portamento: 0, masterVolume: 0.7,
            chorusRate: 1.2, chorusDepth: 0.3, reverbMix: 0.1, reverbDecay: 1.5,
            delayTime: 0.3, delayFeedback: 0, delayMix: 0,
        }
    },
    {
        name: 'Fat Pad',
        params: {
            osc1Wave: 'sawtooth', osc1Octave: 0, osc1Detune: 0.08, osc1PW: 0.5, osc1Level: 0.7,
            osc2Wave: 'sawtooth', osc2Octave: -1, osc2Detune: -0.06, osc2PW: 0.5, osc2Level: 0.6,
            osc2Sync: 0, oscCross: 0,
            filterType: 'lowpass', filterSlope: 12, filterCutoff: 3000, filterResonance: 1.5,
            filterEnvAmount: 0.2, filterKeyTrack: 0.4, filterVelocity: 0.2,
            filterAttack: 0.8, filterDecay: 1.0, filterSustain: 0.7, filterRelease: 1.5,
            ampAttack: 0.6, ampDecay: 0.8, ampSustain: 0.8, ampRelease: 1.5,
            lfoWave: 'triangle', lfoRate: 0.8, lfoDelay: 1,
            lfoToPitch: 0.03, lfoToFilter: 0.15, lfoToPW: 0, lfoToAmp: 0,
            voiceDetune: 0.3, portamento: 0, masterVolume: 0.7,
            chorusRate: 0.8, chorusDepth: 0.5, reverbMix: 0.35, reverbDecay: 3,
            delayTime: 0.4, delayFeedback: 0.3, delayMix: 0.15,
        }
    },
    {
        name: 'Analog Lead',
        params: {
            osc1Wave: 'sawtooth', osc1Octave: 0, osc1Detune: 0, osc1PW: 0.5, osc1Level: 0.9,
            osc2Wave: 'square', osc2Octave: 0, osc2Detune: 0.1, osc2PW: 0.4, osc2Level: 0.5,
            osc2Sync: 0, oscCross: 0,
            filterType: 'lowpass', filterSlope: 24, filterCutoff: 4000, filterResonance: 5,
            filterEnvAmount: 0.5, filterKeyTrack: 0.7, filterVelocity: 0.4,
            filterAttack: 0.01, filterDecay: 0.3, filterSustain: 0.3, filterRelease: 0.2,
            ampAttack: 0.01, ampDecay: 0.1, ampSustain: 0.9, ampRelease: 0.2,
            lfoWave: 'sine', lfoRate: 5.5, lfoDelay: 0.3,
            lfoToPitch: 0.08, lfoToFilter: 0, lfoToPW: 0, lfoToAmp: 0,
            voiceDetune: 0.1, portamento: 0.05, masterVolume: 0.7,
            chorusRate: 1.2, chorusDepth: 0, reverbMix: 0.1, reverbDecay: 1,
            delayTime: 0.35, delayFeedback: 0.35, delayMix: 0.2,
        }
    },
    {
        name: 'PWM Strings',
        params: {
            osc1Wave: 'square', osc1Octave: 0, osc1Detune: 0.04, osc1PW: 0.5, osc1Level: 0.7,
            osc2Wave: 'square', osc2Octave: 0, osc2Detune: -0.04, osc2PW: 0.5, osc2Level: 0.7,
            osc2Sync: 0, oscCross: 0,
            filterType: 'lowpass', filterSlope: 12, filterCutoff: 5000, filterResonance: 0.5,
            filterEnvAmount: 0.1, filterKeyTrack: 0.5, filterVelocity: 0.2,
            filterAttack: 0.5, filterDecay: 0.8, filterSustain: 0.6, filterRelease: 1.0,
            ampAttack: 0.4, ampDecay: 0.5, ampSustain: 0.8, ampRelease: 1.0,
            lfoWave: 'triangle', lfoRate: 1.5, lfoDelay: 0.5,
            lfoToPitch: 0, lfoToFilter: 0.05, lfoToPW: 0.4, lfoToAmp: 0,
            voiceDetune: 0.25, portamento: 0, masterVolume: 0.7,
            chorusRate: 0.6, chorusDepth: 0.6, reverbMix: 0.3, reverbDecay: 2.5,
            delayTime: 0.3, delayFeedback: 0, delayMix: 0,
        }
    },
    {
        name: 'Sub Bass',
        params: {
            osc1Wave: 'square', osc1Octave: -1, osc1Detune: 0, osc1PW: 0.5, osc1Level: 0.9,
            osc2Wave: 'sawtooth', osc2Octave: 0, osc2Detune: 0, osc2PW: 0.5, osc2Level: 0.3,
            osc2Sync: 0, oscCross: 0,
            filterType: 'lowpass', filterSlope: 24, filterCutoff: 800, filterResonance: 3,
            filterEnvAmount: 0.5, filterKeyTrack: 0.3, filterVelocity: 0.5,
            filterAttack: 0.01, filterDecay: 0.2, filterSustain: 0.2, filterRelease: 0.15,
            ampAttack: 0.01, ampDecay: 0.1, ampSustain: 0.9, ampRelease: 0.15,
            lfoWave: 'sine', lfoRate: 3, lfoDelay: 0,
            lfoToPitch: 0, lfoToFilter: 0, lfoToPW: 0, lfoToAmp: 0,
            voiceDetune: 0.05, portamento: 0.03, masterVolume: 0.8,
            chorusRate: 1.2, chorusDepth: 0, reverbMix: 0.05, reverbDecay: 0.8,
            delayTime: 0.3, delayFeedback: 0, delayMix: 0,
        }
    },
    {
        name: 'Sync Sweep',
        params: {
            osc1Wave: 'sawtooth', osc1Octave: 0, osc1Detune: 0, osc1PW: 0.5, osc1Level: 0.9,
            osc2Wave: 'sawtooth', osc2Octave: 1, osc2Detune: 0, osc2PW: 0.5, osc2Level: 0.6,
            osc2Sync: 0.8, oscCross: 0,
            filterType: 'lowpass', filterSlope: 24, filterCutoff: 6000, filterResonance: 4,
            filterEnvAmount: 0.7, filterKeyTrack: 0.5, filterVelocity: 0.3,
            filterAttack: 0.01, filterDecay: 0.6, filterSustain: 0.2, filterRelease: 0.3,
            ampAttack: 0.01, ampDecay: 0.1, ampSustain: 0.8, ampRelease: 0.3,
            lfoWave: 'sine', lfoRate: 4, lfoDelay: 0,
            lfoToPitch: 0, lfoToFilter: 0.2, lfoToPW: 0, lfoToAmp: 0,
            voiceDetune: 0.1, portamento: 0, masterVolume: 0.7,
            chorusRate: 1.2, chorusDepth: 0.2, reverbMix: 0.15, reverbDecay: 1.5,
            delayTime: 0.3, delayFeedback: 0.2, delayMix: 0.15,
        }
    },
    {
        name: 'Ethereal Pad',
        params: {
            osc1Wave: 'triangle', osc1Octave: 0, osc1Detune: 0.06, osc1PW: 0.5, osc1Level: 0.7,
            osc2Wave: 'sawtooth', osc2Octave: 1, osc2Detune: -0.08, osc2PW: 0.5, osc2Level: 0.3,
            osc2Sync: 0, oscCross: 0,
            filterType: 'lowpass', filterSlope: 12, filterCutoff: 2500, filterResonance: 3,
            filterEnvAmount: 0.15, filterKeyTrack: 0.6, filterVelocity: 0.1,
            filterAttack: 1.5, filterDecay: 2.0, filterSustain: 0.6, filterRelease: 3.0,
            ampAttack: 1.2, ampDecay: 1.5, ampSustain: 0.7, ampRelease: 3.0,
            lfoWave: 'sine', lfoRate: 0.3, lfoDelay: 2,
            lfoToPitch: 0.02, lfoToFilter: 0.2, lfoToPW: 0, lfoToAmp: 0.05,
            voiceDetune: 0.35, portamento: 0, masterVolume: 0.7,
            chorusRate: 0.4, chorusDepth: 0.7, reverbMix: 0.5, reverbDecay: 4,
            delayTime: 0.5, delayFeedback: 0.4, delayMix: 0.2,
        }
    },
    {
        name: 'Pluck',
        params: {
            osc1Wave: 'sawtooth', osc1Octave: 0, osc1Detune: 0.03, osc1PW: 0.5, osc1Level: 0.8,
            osc2Wave: 'square', osc2Octave: 0, osc2Detune: -0.03, osc2PW: 0.3, osc2Level: 0.4,
            osc2Sync: 0, oscCross: 0,
            filterType: 'lowpass', filterSlope: 24, filterCutoff: 5000, filterResonance: 4,
            filterEnvAmount: 0.7, filterKeyTrack: 0.6, filterVelocity: 0.6,
            filterAttack: 0.001, filterDecay: 0.15, filterSustain: 0.05, filterRelease: 0.15,
            ampAttack: 0.001, ampDecay: 0.3, ampSustain: 0, ampRelease: 0.15,
            lfoWave: 'sine', lfoRate: 3, lfoDelay: 0,
            lfoToPitch: 0, lfoToFilter: 0, lfoToPW: 0, lfoToAmp: 0,
            voiceDetune: 0.1, portamento: 0, masterVolume: 0.7,
            chorusRate: 1.2, chorusDepth: 0.2, reverbMix: 0.2, reverbDecay: 1.5,
            delayTime: 0.25, delayFeedback: 0.3, delayMix: 0.2,
        }
    },
    {
        name: 'Reso Sweep',
        params: {
            osc1Wave: 'sawtooth', osc1Octave: 0, osc1Detune: 0.07, osc1PW: 0.5, osc1Level: 0.8,
            osc2Wave: 'sawtooth', osc2Octave: 0, osc2Detune: -0.07, osc2PW: 0.5, osc2Level: 0.8,
            osc2Sync: 0, oscCross: 0,
            filterType: 'lowpass', filterSlope: 24, filterCutoff: 1500, filterResonance: 12,
            filterEnvAmount: 0.8, filterKeyTrack: 0.5, filterVelocity: 0.3,
            filterAttack: 0.01, filterDecay: 1.0, filterSustain: 0.1, filterRelease: 0.5,
            ampAttack: 0.01, ampDecay: 0.2, ampSustain: 0.8, ampRelease: 0.5,
            lfoWave: 'sine', lfoRate: 2, lfoDelay: 0,
            lfoToPitch: 0, lfoToFilter: 0.3, lfoToPW: 0, lfoToAmp: 0,
            voiceDetune: 0.2, portamento: 0, masterVolume: 0.6,
            chorusRate: 1.0, chorusDepth: 0.3, reverbMix: 0.2, reverbDecay: 2,
            delayTime: 0.3, delayFeedback: 0, delayMix: 0,
        }
    },
    {
        name: 'Funky Clav',
        params: {
            osc1Wave: 'square', osc1Octave: 0, osc1Detune: 0, osc1PW: 0.3, osc1Level: 0.9,
            osc2Wave: 'square', osc2Octave: 0, osc2Detune: 0.02, osc2PW: 0.7, osc2Level: 0.5,
            osc2Sync: 0, oscCross: 0,
            filterType: 'bandpass', filterSlope: 12, filterCutoff: 3000, filterResonance: 6,
            filterEnvAmount: 0.6, filterKeyTrack: 0.8, filterVelocity: 0.7,
            filterAttack: 0.001, filterDecay: 0.1, filterSustain: 0.15, filterRelease: 0.1,
            ampAttack: 0.001, ampDecay: 0.2, ampSustain: 0.3, ampRelease: 0.1,
            lfoWave: 'sine', lfoRate: 3, lfoDelay: 0,
            lfoToPitch: 0, lfoToFilter: 0, lfoToPW: 0, lfoToAmp: 0,
            voiceDetune: 0.05, portamento: 0, masterVolume: 0.7,
            chorusRate: 1.2, chorusDepth: 0, reverbMix: 0.05, reverbDecay: 0.8,
            delayTime: 0.2, delayFeedback: 0.2, delayMix: 0.1,
        }
    },
    {
        name: 'Space Organ',
        params: {
            osc1Wave: 'square', osc1Octave: 0, osc1Detune: 0, osc1PW: 0.5, osc1Level: 0.6,
            osc2Wave: 'square', osc2Octave: 1, osc2Detune: 0, osc2PW: 0.5, osc2Level: 0.4,
            osc2Sync: 0, oscCross: 0,
            filterType: 'lowpass', filterSlope: 12, filterCutoff: 6000, filterResonance: 0.5,
            filterEnvAmount: 0, filterKeyTrack: 0.3, filterVelocity: 0,
            filterAttack: 0.01, filterDecay: 0.1, filterSustain: 1, filterRelease: 0.1,
            ampAttack: 0.01, ampDecay: 0.01, ampSustain: 1, ampRelease: 0.08,
            lfoWave: 'sine', lfoRate: 6, lfoDelay: 0,
            lfoToPitch: 0.02, lfoToFilter: 0, lfoToPW: 0, lfoToAmp: 0.08,
            voiceDetune: 0.1, portamento: 0, masterVolume: 0.6,
            chorusRate: 2, chorusDepth: 0.4, reverbMix: 0.3, reverbDecay: 2.5,
            delayTime: 0.35, delayFeedback: 0.3, delayMix: 0.15,
        }
    },
];
