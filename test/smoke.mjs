import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.md':'text/markdown' };
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r=>server.listen(8931, r));

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required','--use-gl=swiftshader','--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));

await page.goto('http://127.0.0.1:8931/', { waitUntil: 'networkidle' });
await page.click('#boot-btn');
await page.waitForSelector('#obx:not([hidden])', { timeout: 10000 });
await page.waitForTimeout(500);

// Count widgets built
const counts = await page.evaluate(() => ({
  panels: document.querySelectorAll('.panel').length,
  knobs: document.querySelectorAll('.knob-ctl').length,
  switches: document.querySelectorAll('.sw-ctl').length,
  keys: document.querySelectorAll('.key').length,
  lcd: document.querySelector('.lcd-name')?.textContent,
  slot: document.querySelector('.lcd-text.num')?.textContent,
}));
console.log('WIDGETS', JSON.stringify(counts));

// Layout sanity: nothing inside a panel may spill outside it, and the page
// must not scroll sideways.
const overflow = await page.evaluate(() => {
  const bad = [];
  for (const panel of document.querySelectorAll('.panel')) {
    const pr = panel.getBoundingClientRect();
    for (const c of panel.querySelectorAll('.ctl, .col, .col-cap, .sw-group, .lcd')) {
      const r = c.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > pr.right + 1 || r.left < pr.left - 1 || r.bottom > pr.bottom + 1) {
        bad.push(`${panel.dataset.panel} > ${c.className.split(' ').slice(0,2).join('.')} ` +
                 `[${Math.round(r.left - pr.left)}..${Math.round(r.right - pr.right)}]`);
      }
    }
  }
  return {
    spills: [...new Set(bad)],
    hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    clipped: [...document.querySelectorAll('.col-cap, .sw-label, .cap')]
      .filter(e => e.scrollWidth > e.clientWidth + 1)
      .map(e => e.textContent).slice(0, 12),
  };
});
console.log('OVERFLOW', JSON.stringify(overflow, null, 1));

// Black keys must sit inside the keybed and be narrower than white keys.
const keys = await page.evaluate(() => {
  const kb = document.getElementById('keybed').getBoundingClientRect();
  const w = [...document.querySelectorAll('.key.white')].map(e => e.getBoundingClientRect());
  const b = [...document.querySelectorAll('.key.black')].map(e => e.getBoundingClientRect());
  return {
    whites: w.length, blacks: b.length,
    whiteW: +(w[0]?.width.toFixed(1)), blackW: +(b[0]?.width.toFixed(1)),
    outside: b.filter(r => r.left < kb.left - 1 || r.right > kb.right + 1).length,
    gaps: b.slice(0, 6).map(r => +((r.left - kb.left) / kb.width * 100).toFixed(1)),
  };
});
console.log('KEYS', JSON.stringify(keys));

// Offline render of the DSP: play a chord through each factory program and
// report RMS so we can catch silent or exploding patches.
const audio = await page.evaluate(async () => {
  const { FACTORY_BANK } = await import('/src/presets.js');
  const { normaliseProgram, PARAM_IDS } = await import('/src/params.js');
  const results = [];
  for (let i = 0; i < FACTORY_BANK.length; i++) {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 44100 * 2, sampleRate: 44100 });
    await ctx.audioWorklet.addModule('/src/obx-processor.js');
    const node = new AudioWorkletNode(ctx, 'obx-processor', { numberOfInputs:0, numberOfOutputs:1, outputChannelCount:[2] });
    node.connect(ctx.destination);
    const prog = normaliseProgram(FACTORY_BANK[i]);
    const clean = {}; for (const id of PARAM_IDS) clean[id] = prog[id];
    node.port.postMessage({ type:'patch', layer:0, params: clean });
    node.port.postMessage({ type:'global', id:'masterVol', value:0.8 });
    for (const n of [48, 55, 64]) node.port.postMessage({ type:'noteOn', note:n, velocity:0.9, layer:0 });
    // Let the port messages reach the audio thread before rendering starts.
    await new Promise((r) => setTimeout(r, 30));
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let sum=0, peak=0, nan=0;
    for (let j=0;j<L.length;j++){ const v=(L[j]+R[j])*0.5; if(!Number.isFinite(v)) nan++; sum+=v*v; peak=Math.max(peak,Math.abs(v)); }
    results.push({ i, name: FACTORY_BANK[i].name, rms: Math.sqrt(sum/L.length), peak, nan });
  }
  return results;
});

let bad = 0;
for (const r of audio) {
  const flag = r.nan > 0 ? 'NAN' : r.rms < 0.0008 ? 'SILENT' : r.peak > 1.6 ? 'CLIP' : 'ok';
  if (flag !== 'ok') { bad++; console.log(`  ${flag.padEnd(7)} #${r.i} ${r.name} rms=${r.rms.toFixed(4)} peak=${r.peak.toFixed(3)} nan=${r.nan}`); }
}
console.log(`AUDIO ${audio.length} programs rendered, ${bad} flagged`);
const rmsAll = audio.map(a=>a.rms);
console.log('RMS min/med/max', Math.min(...rmsAll).toFixed(4), rmsAll.sort((a,b)=>a-b)[Math.floor(rmsAll.length/2)].toFixed(4), Math.max(...rmsAll).toFixed(4));

await page.screenshot({ path: path.join(ROOT, 'docs', 'panel.png'), fullPage: true, scale: 'css' });
console.log('ERRORS', errors.length ? JSON.stringify(errors.slice(0,10), null, 1) : 'none');
await browser.close();
server.close();
