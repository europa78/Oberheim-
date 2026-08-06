import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT='/home/user/Oberheim-';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=path.join(ROOT,p); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(r);});
await new Promise(r=>server.listen(8933,r));
const b=await chromium.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const page=await b.newPage(); await page.goto('http://127.0.0.1:8933/');

const out = await page.evaluate(async () => {
  const { defaultProgram, PARAM_IDS } = await import('/src/params.js');
  const SR = 44100;

  async function render(overrides, note = 69, seconds = 1.0) {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: SR * seconds, sampleRate: SR });
    await ctx.audioWorklet.addModule('/src/obx-processor.js');
    const n = new AudioWorkletNode(ctx, 'obx-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    n.connect(ctx.destination);
    const p = defaultProgram();
    Object.assign(p, overrides);
    const clean = {}; for (const id of PARAM_IDS) clean[id] = p[id];
    n.port.postMessage({ type: 'patch', layer: 0, params: clean });
    n.port.postMessage({ type: 'global', id: 'masterVol', value: 1 });
    n.port.postMessage({ type: 'noteOn', note, velocity: 1, layer: 0 });
    await new Promise(r => setTimeout(r, 30));
    const buf = await ctx.startRendering();
    return buf.getChannelData(0);
  }

  // Goertzel magnitude at a given frequency over the steady-state tail.
  function mag(x, f) {
    const start = Math.floor(x.length * 0.4), end = x.length;
    const w = 2 * Math.PI * f / SR, c = 2 * Math.cos(w);
    let s1 = 0, s2 = 0;
    for (let i = start; i < end; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
    return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / ((end - start) / 2);
  }
  const db = (a, b) => 20 * Math.log10((a + 1e-12) / (b + 1e-12));

  const res = {};

  // 1. A sawtooth on A4 should put its energy at 440 Hz with 1/n harmonics.
  {
    const x = await render({ vintage: 0, aSustain: 1, aAttack: 0, cutoff: 1, filterMod: 0, kbdTrack: 0, osc2Saw: 0, osc2Pulse: 0 });
    const h = [1, 2, 3, 4].map(k => mag(x, 440 * k));
    res.sawFundamentalHz = 440;
    res.sawH1 = +h[0].toFixed(4);
    res.sawH2overH1_dB = +db(h[1], h[0]).toFixed(1);   // expect about -6
    res.sawH3overH1_dB = +db(h[2], h[0]).toFixed(1);   // expect about -9.5
    res.sawOffPitch_dB = +db(mag(x, 660), h[0]).toFixed(1); // non-harmonic, should be low
  }

  // 2. A 50 % square should suppress even harmonics.
  {
    const x = await render({ vintage: 0, aSustain: 1, cutoff: 1, kbdTrack: 0, osc1Saw: 0, osc1Pulse: 1, pulseWidth: 0, osc2Saw: 0, osc2Pulse: 0 });
    res.squareH2overH1_dB = +db(mag(x, 880), mag(x, 440)).toFixed(1);  // expect very low
    res.squareH3overH1_dB = +db(mag(x, 1320), mag(x, 440)).toFixed(1); // expect about -9.5
  }

  // 3. Lowering the filter must attenuate a high harmonic far more than the fundamental.
  {
    const open = await render({ vintage: 0, aSustain: 1, cutoff: 1, kbdTrack: 0, filterMod: 0, osc2Saw: 0, osc2Pulse: 0 });
    const shut = await render({ vintage: 0, aSustain: 1, cutoff: 0.35, kbdTrack: 0, filterMod: 0, osc2Saw: 0, osc2Pulse: 0 });
    res.filter_h1_change_dB = +db(mag(shut, 440), mag(open, 440)).toFixed(1);
    res.filter_h8_change_dB = +db(mag(shut, 3520), mag(open, 3520)).toFixed(1);
  }

  // 4. Four-pole should roll off faster than two-pole at the same cut-off.
  {
    const two = await render({ vintage: 0, aSustain: 1, cutoff: 0.45, filterType: 0, kbdTrack: 0, osc2Saw: 0, osc2Pulse: 0 });
    const four = await render({ vintage: 0, aSustain: 1, cutoff: 0.45, filterType: 1, kbdTrack: 0, osc2Saw: 0, osc2Pulse: 0 });
    res.fourPole_vs_twoPole_at_h8_dB = +db(mag(four, 3520), mag(two, 3520)).toFixed(1);
  }

  // 5. Resonance must lift the band at cut-off but never self-oscillate.
  {
    const flat = await render({ vintage: 0, aSustain: 1, cutoff: 0.45, resonance: 0, kbdTrack: 0, osc2Saw: 0, osc2Pulse: 0 });
    const rez  = await render({ vintage: 0, aSustain: 1, cutoff: 0.45, resonance: 1, kbdTrack: 0, osc2Saw: 0, osc2Pulse: 0 });
    const fc = 16 * Math.pow(2, 0.45 * 10.1);
    res.resonancePeak_dB = +db(mag(rez, fc), mag(flat, fc)).toFixed(1);
    // With no oscillators routed in and resonance maxed, the filter must stay quiet.
    const silent = await render({ vintage: 0, aSustain: 1, cutoff: 0.45, resonance: 1, fOsc1: 0, fOsc2: 0, fNoise: 0, kbdTrack: 0 });
    let peak = 0; for (let i = silent.length >> 1; i < silent.length; i++) peak = Math.max(peak, Math.abs(silent[i]));
    res.selfOscillationPeak = +peak.toFixed(6);
  }

  // 6. Osc 2 at +12 semitones should land an octave up.
  {
    const x = await render({ vintage: 0, aSustain: 1, cutoff: 1, kbdTrack: 0, osc1Saw: 0, osc1Pulse: 0, fOsc1: 0, osc2Freq: 12 / 60, osc2Saw: 1 });
    res.osc2OctaveUp_880_over_440_dB = +db(mag(x, 880), mag(x, 440)).toFixed(1);
  }

  // 7. Sync should add harmonics that a plain saw does not have.
  {
    const plain = await render({ vintage: 0, aSustain: 1, cutoff: 1, kbdTrack: 0, osc1Saw: 0, osc1Pulse: 0, fOsc1: 0, osc2Freq: 7 / 60, sync: 0 });
    const sync  = await render({ vintage: 0, aSustain: 1, cutoff: 1, kbdTrack: 0, osc1Saw: 0, osc1Pulse: 0, fOsc1: 0, osc2Freq: 7 / 60, sync: 1 });
    res.sync_puts_energy_at_440_dB = +db(mag(sync, 440), mag(plain, 440)).toFixed(1);
  }

  // 8. A narrow pulse must not carry a DC offset into the amplifier.
  {
    const dcOf = async (pw) => {
      const x = await render({ vintage: 0, aSustain: 1, cutoff: 1, kbdTrack: 0,
        osc1Saw: 0, osc1Pulse: 1, pulseWidth: pw, osc2Saw: 0, osc2Pulse: 0 }, 57, 1.0);
      let s = 0; const a = Math.floor(x.length * 0.5);
      for (let i = a; i < x.length; i++) s += x[i];
      return s / (x.length - a);
    };
    res.narrowPulseDC = +Math.abs(await dcOf(1)).toFixed(5);
    res.squareDC = +Math.abs(await dcOf(0)).toFixed(5);
  }

  // 9. Envelope shape: a long attack must start quiet and grow.
  {
    const x = await render({ vintage: 0, aAttack: 0.55, aSustain: 1, cutoff: 1, kbdTrack: 0, osc2Saw: 0, osc2Pulse: 0 }, 69, 1.0);
    const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
    res.attackEarly = +rms(0, 4410).toFixed(4);
    res.attackLate = +rms(35280, 39690).toFixed(4);
  }

  return res;
});
// Expected values, with tolerances wide enough for the oscillator's own
// dither but tight enough to catch a real regression.
const EXPECT = [
  ['saw 2nd harmonic is 6 dB down',        out.sawH2overH1_dB,      -7.2,  -5.2],
  ['saw 3rd harmonic is 9.5 dB down',      out.sawH3overH1_dB,     -11.0,  -8.5],
  ['saw has no energy off the harmonics',  out.sawOffPitch_dB,    -Infinity, -60],
  ['square suppresses even harmonics',     out.squareH2overH1_dB, -Infinity, -60],
  ['square 3rd harmonic is 9.5 dB down',   out.squareH3overH1_dB,  -11.0,  -8.5],
  ['closing the filter keeps the fundamental', out.filter_h1_change_dB, -25,   -2],
  ['closing the filter kills the 8th',     out.filter_h8_change_dB, -Infinity, -30],
  ['4-pole rolls off past 2-pole',         out.fourPole_vs_twoPole_at_h8_dB, -Infinity, -12],
  ['resonance lifts the cut-off band',     out.resonancePeak_dB,     8,   30],
  ['filter never self-oscillates',         out.selfOscillationPeak,  0,   1e-4],
  ['osc 2 at +12 sounds an octave up',     out.osc2OctaveUp_880_over_440_dB, 20, Infinity],
  ['sync adds the master fundamental',     out.sync_puts_energy_at_440_dB,   20, Infinity],
  ['narrow pulse carries no DC',           out.narrowPulseDC,        0,   0.001],
  ['50% square carries no DC',             out.squareDC,             0,   0.001],
  ['long attack starts quiet',             out.attackEarly,          0,   0.012],
  ['long attack grows',                    out.attackLate,        0.02,   1],
];

let failed = 0;
for (const [name, got, lo, hi] of EXPECT) {
  const ok = got >= lo && got <= hi;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(42)} ${String(got).padStart(9)}` +
              (ok ? '' : `   expected ${lo}..${hi}`));
}
console.log(`\n${EXPECT.length - failed}/${EXPECT.length} passed`);
await b.close(); server.close();
process.exit(failed ? 1 : 0);
