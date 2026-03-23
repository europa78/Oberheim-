/* ============================================
   OB-Xd Web Synthesizer - Application Entry
   ============================================ */

(async function () {
    // Initialize audio engine
    const engine = new OBXdEngine();

    // Click/touch to start AudioContext (browser requirement)
    const startAudio = async () => {
        await engine.init();

        // Initialize UI
        const ui = new OBXdUI(engine);
        ui.init();

        // Load presets
        let currentPreset = 0;
        ui.updatePresetUI(OBXdPresets, currentPreset);

        // Apply initial preset
        engine.loadPreset(OBXdPresets[currentPreset]);
        ui.applyPresetToUI(OBXdPresets[currentPreset]);

        // Preset navigation
        document.getElementById('btn-prev-preset').addEventListener('click', () => {
            currentPreset = (currentPreset - 1 + OBXdPresets.length) % OBXdPresets.length;
            engine.loadPreset(OBXdPresets[currentPreset]);
            ui.applyPresetToUI(OBXdPresets[currentPreset]);
            ui.updatePresetUI(OBXdPresets, currentPreset);
        });

        document.getElementById('btn-next-preset').addEventListener('click', () => {
            currentPreset = (currentPreset + 1) % OBXdPresets.length;
            engine.loadPreset(OBXdPresets[currentPreset]);
            ui.applyPresetToUI(OBXdPresets[currentPreset]);
            ui.updatePresetUI(OBXdPresets, currentPreset);
        });

        document.getElementById('preset-select').addEventListener('change', (e) => {
            currentPreset = parseInt(e.target.value);
            engine.loadPreset(OBXdPresets[currentPreset]);
            ui.applyPresetToUI(OBXdPresets[currentPreset]);
            ui.updatePresetUI(OBXdPresets, currentPreset);
        });

        // Remove overlay
        document.getElementById('start-overlay').remove();
    };

    // Create start overlay (required for Web Audio)
    const overlay = document.createElement('div');
    overlay.id = 'start-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.9); display: flex; flex-direction: column;
        align-items: center; justify-content: center; z-index: 9999;
        cursor: pointer; font-family: 'Orbitron', monospace;
    `;
    overlay.innerHTML = `
        <div style="color: #ff6b00; font-size: 36px; font-weight: 900; letter-spacing: 8px;
                    text-shadow: 0 0 30px rgba(255,107,0,0.5); margin-bottom: 16px;">OBERHEIM</div>
        <div style="color: #888; font-size: 14px; letter-spacing: 4px; margin-bottom: 40px;">OB-Xd WEB SYNTHESIZER</div>
        <div style="color: #ff6b00; font-size: 14px; letter-spacing: 3px;
                    border: 1px solid #ff6b00; padding: 12px 32px; border-radius: 4px;
                    animation: pulse 2s ease-in-out infinite;">CLICK TO START</div>
        <div style="color: #555; font-size: 11px; margin-top: 24px; letter-spacing: 1px;">
            Keys: A-L (white) W,E,T,Y,U,O,P (black) | Z/X: Octave
        </div>
        <style>
            @keyframes pulse {
                0%, 100% { opacity: 1; box-shadow: 0 0 10px rgba(255,107,0,0.3); }
                50% { opacity: 0.7; box-shadow: 0 0 20px rgba(255,107,0,0.6); }
            }
        </style>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', startAudio, { once: true });
    overlay.addEventListener('touchstart', startAudio, { once: true });
})();
