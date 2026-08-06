/*
 * Verifies the single-file build.
 *
 * The bundle is rebuilt here rather than trusted, so this can never pass
 * against a stale obx.html. It is then loaded three ways and compared with the
 * modular build: same panel, same audio, same throughput. The file:// case is
 * the one that matters — it is why the bundle exists, and it is the case that
 * breaks silently if the worklet ever goes back to a Blob-only URL.
 */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

execFileSync(process.execPath, [path.join(ROOT, 'build.mjs')], { stdio: 'inherit' });

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(8951, r));

const browser = await chromium.launch({
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

async function trial(url) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });

  const result = { errors };
  try {
    await page.goto(url);
    await page.click('#boot-btn');
    await page.waitForSelector('#obx:not([hidden])', { timeout: 8000 });
    await page.waitForTimeout(400);

    Object.assign(result, await page.evaluate(() => {
      const panel = document.querySelector('.panel');
      const cs = panel && getComputedStyle(panel);
      return {
        booted: true,
        panels: document.querySelectorAll('.panel').length,
        knobs: document.querySelectorAll('.knob-ctl').length,
        switches: document.querySelectorAll('.sw-ctl').length,
        keys: document.querySelectorAll('.key').length,
        styled: !!cs && (cs.backgroundImage !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)'),
        engineReady: !!window.obx?.engine?.ready,
      };
    }));

    // Real playback through the live AudioContext, not just an offline render.
    result.audio = await page.evaluate(async () => {
      const a = window.obx;
      const an = a.engine.ctx.createAnalyser();
      an.fftSize = 2048;
      a.engine.out.connect(an);
      a.noteOn(60, 1); a.noteOn(64, 1);
      await new Promise((r) => setTimeout(r, 600));
      const buf = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      a.panic();
      return { rms: +Math.sqrt(sum / buf.length).toFixed(4) };
    });

    result.bench = await page.evaluate(async () => {
      const SEC = 10, SR = 44100;
      const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: SR * SEC, sampleRate: SR });
      const src = document.getElementById('obx-worklet-source');
      if (src) {
        const txt = src.textContent;
        try {
          await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([txt], { type: 'text/javascript' })));
        } catch {
          const u8 = new TextEncoder().encode(txt);
          let bin = '';
          for (const byte of u8) bin += String.fromCharCode(byte);
          await ctx.audioWorklet.addModule('data:text/javascript;base64,' + btoa(bin));
        }
      } else {
        await ctx.audioWorklet.addModule('/src/obx-processor.js');
      }
      const node = new AudioWorkletNode(ctx, 'obx-processor',
        { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.connect(ctx.destination);
      node.port.postMessage({ type: 'patch', layer: 0, params: window.obx.store.live[0] });
      node.port.postMessage({ type: 'global', id: 'masterVol', value: 0.7 });
      for (let i = 0; i < 8; i++) node.port.postMessage({ type: 'noteOn', note: 40 + i * 3, velocity: 1, layer: 0 });
      await new Promise((r) => setTimeout(r, 30));
      const t0 = performance.now();
      await ctx.startRendering();
      return +((SEC * 1000) / (performance.now() - t0)).toFixed(1);
    });
  } catch (e) {
    result.booted = result.booted || false;
    result.failure = e.message.split('\n')[0];
  }
  await page.close();
  return result;
}

const modular = await trial('http://127.0.0.1:8951/index.html');
const overHttp = await trial('http://127.0.0.1:8951/obx.html');
const overFile = await trial(`file://${path.join(ROOT, 'obx.html')}`);

const checks = [];
const same = (a, b) => a.panels === b.panels && a.knobs === b.knobs
                    && a.switches === b.switches && a.keys === b.keys;

checks.push(['modular build serves and boots', modular.booted && modular.engineReady]);
checks.push(['bundle boots over http', overHttp.booted && overHttp.engineReady]);
checks.push(['bundle boots from file://', overFile.booted && overFile.engineReady]);
checks.push(['bundle panel matches modular (http)', same(modular, overHttp)]);
checks.push(['bundle panel matches modular (file)', same(modular, overFile)]);
checks.push(['bundle is styled from file://', overFile.styled === true]);
checks.push(['bundle makes sound over http', overHttp.audio?.rms > 0.002]);
checks.push(['bundle makes sound from file://', overFile.audio?.rms > 0.002]);
checks.push(['no console errors over http', overHttp.errors.length === 0]);
checks.push(['no console errors from file://', overFile.errors.length === 0]);
// Bundling must not cost throughput. A 25 % band absorbs run-to-run noise.
checks.push([`bundle throughput matches modular (${modular.bench}x vs ${overHttp.bench}x http, ${overFile.bench}x file)`,
  overHttp.bench > modular.bench * 0.75 && overFile.bench > modular.bench * 0.75]);
checks.push(['bundle is one self-contained file',
  !/<(script|link)[^>]+(src|href)=/i.test(fs.readFileSync(path.join(ROOT, 'obx.html'), 'utf8'))]);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
if (failed) {
  console.log('\ndetail:', JSON.stringify({ modular, overHttp, overFile }, null, 1));
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
