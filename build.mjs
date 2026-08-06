#!/usr/bin/env node
/*
 * Bundles the instrument into a single self-contained obx.html.
 *
 * The one genuinely awkward part is the AudioWorklet: `addModule` takes a URL,
 * not a function or a string, so the processor cannot simply be pasted into
 * the page. It is carried instead in a non-executing <script> block, read back
 * at start-up and turned into a Blob URL. That keeps the file standalone and
 * works from file:// as well as over HTTP.
 *
 * Everything else is concatenation: the ES modules share one scope in the
 * bundle, so their imports and exports are stripped. Run `npm run build`.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Strip module syntax so the files can share a single script scope. */
function flatten(src, file) {
  const out = src
    .replace(/^import\s+[^;]*?from\s*['"][^'"]+['"];\s*$/gm, '')
    .replace(/^export\s*\{[^}]*\};\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  if (/^\s*(import|export)\s/m.test(out)) {
    throw new Error(`${file}: module syntax survived flattening — bundle would be broken`);
  }
  return out;
}

// Dependency order: params, then presets, then ui, then app.
const MODULES = ['src/params.js', 'src/presets.js', 'src/ui.js', 'src/app.js'];

const worklet = read('src/obx-processor.js');
if (worklet.includes('</script')) {
  throw new Error('processor source contains </script> and cannot be inlined verbatim');
}

let app = MODULES.map((f) => `\n// ===== ${f} ${'='.repeat(Math.max(0, 60 - f.length))}\n${flatten(read(f), f)}`).join('\n');

// Point the engine at the Blob URL built from the inlined processor.
const NEEDLE = "await this.ctx.audioWorklet.addModule(new URL('./obx-processor.js', import.meta.url));";
if (!app.includes(NEEDLE)) {
  throw new Error('could not find the addModule call to rewrite — check src/app.js');
}
app = app.replace(NEEDLE, 'await addWorklet(this.ctx);');

const css = read('src/obx.css');

// Reuse the real page markup so the bundle cannot drift from index.html.
const html = read('index.html');
const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'))
  .replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>\s*/g, '')
  .trim();
const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'OB-X'])[1];

const bundle = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
${css}
</style>
</head>
<body>

${body}

<!-- The AudioWorklet processor. Not executed here: the type is unknown to the
     browser, so this is inert text that start-up reads and turns into a Blob
     URL, which is the only thing addModule() will accept. -->
<script id="obx-worklet-source" type="text/x-obx-worklet">
${worklet}
</script>

<script type="module">
/*
 * addModule() needs a URL. A Blob URL is the efficient choice and works
 * wherever the page has a real origin, but a page opened straight from disk
 * has an opaque origin, its Blob URLs come out as "blob:null/..." and the
 * worklet loader refuses them. A data: URL has no origin to check and loads
 * in both cases, so it is the fallback.
 */
function obxWorkletSource() {
  return document.getElementById('obx-worklet-source').textContent;
}
function obxBlobURL() {
  return URL.createObjectURL(new Blob([obxWorkletSource()], { type: 'text/javascript' }));
}
function obxDataURL() {
  const utf8 = new TextEncoder().encode(obxWorkletSource());
  let bin = '';
  for (const byte of utf8) bin += String.fromCharCode(byte);
  return 'data:text/javascript;base64,' + btoa(bin);
}
async function addWorklet(ctx) {
  try {
    await ctx.audioWorklet.addModule(obxBlobURL());
  } catch {
    await ctx.audioWorklet.addModule(obxDataURL());
  }
}
${app}
</script>
</body>
</html>
`;

const outPath = path.join(ROOT, 'obx.html');
fs.writeFileSync(outPath, bundle);
const kb = (Buffer.byteLength(bundle) / 1024).toFixed(0);
console.log(`wrote obx.html (${kb} kB) from ${MODULES.length} modules + processor + stylesheet`);
