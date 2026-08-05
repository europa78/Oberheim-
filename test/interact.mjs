import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=path.join(ROOT,p); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(8932,r));
const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required','--use-gl=swiftshader','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:900}});
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errs.push(m.text())});
await page.addInitScript(()=>{ try{localStorage.clear()}catch{} });
await page.goto('http://127.0.0.1:8932/');
await page.click('#boot-btn');
await page.waitForSelector('#obx:not([hidden])');
await page.waitForTimeout(300);

const checks=[];
const t=(name,fn)=>checks.push({name,fn});
const q=(sel)=>page.locator(sel);
const val=(id)=>page.evaluate(id=>window.obx.store.get(id), id);
const txt=(sel)=>page.textContent(sel);

// 1. program select
await q('.panel-programmer [data-param="g:prog3"] .rocker').click();
checks.push(['program select -> A3', (await txt('.lcd-text.num'))==='A3']);
checks.push(['program name loaded', (await txt('.lcd-name')).length>0]);

// 2. editing marks dirty
await page.evaluate(()=>window.obx.store.set('cutoff', 0.42));
checks.push(['edit marks dirty', (await txt('.lcd-text.num'))==='A3*']);
checks.push(['edit stored', Math.abs(await val('cutoff')-0.42)<1e-9]);

// 3. write commits
await q('.panel-programmer [data-param="g:write"] .rocker').click();
checks.push(['write arms', await page.evaluate(()=>window.obx.store.writeArmed)===true]);
await q('.panel-programmer [data-param="g:prog5"] .rocker').click();
await page.waitForTimeout(50);
checks.push(['write clears dirty', await page.evaluate(()=>window.obx.store.dirty)===false]);
checks.push(['written to A5', await page.evaluate(()=>Math.abs(window.obx.store.bank[4].cutoff-0.42)<1e-9)]);

// 4. recall restores
await q('.panel-programmer [data-param="g:prog1"] .rocker').click();
await q('.panel-programmer [data-param="g:prog5"] .rocker').click();
checks.push(['recall restores edit', Math.abs(await val('cutoff')-0.42)<1e-9]);

// 5. group knob
await page.evaluate(()=>window.obx.store.set('g:group', 0.6));
checks.push(['group C selected', (await txt('.lcd-text.num')).startsWith('C')]);

// 6. manual mode
await q('.panel-programmer [data-param="g:manual"] .rocker').click();
checks.push(['manual mode', (await txt('.lcd-text.num'))==='MAN']);
await q('.panel-programmer [data-param="g:manual"] .rocker').click();
checks.push(['manual mode off', (await txt('.lcd-text.num'))!=='MAN']);

// 7. multi-state switches cycle correctly
await page.evaluate(()=>window.obx.store.set('fOsc2',0));
await q('.panel-filter [data-param="fOsc2"] .rocker').click();
checks.push(['fOsc2 -> half', await val('fOsc2')===1]);
await q('.panel-filter [data-param="fOsc2"] .rocker').click();
checks.push(['fOsc2 -> full', await val('fOsc2')===2]);
await q('.panel-filter [data-param="fOsc2"] .rocker').click();
checks.push(['fOsc2 wraps to off', await val('fOsc2')===0]);
checks.push(['half LED lights alone', await page.evaluate(async()=>{
  window.obx.store.set('fOsc2',1);
  const leds=document.querySelectorAll('.panel-filter [data-param="fOsc2"] .led');
  return leds[0].classList.contains('on') && !leds[1].classList.contains('on');
})]);
checks.push(['2/4 pole lights one LED', await page.evaluate(()=>{
  window.obx.store.set('filterType',0);
  const l=document.querySelectorAll('.panel-filter [data-param="filterType"] .led');
  const twoPole=l[0].classList.contains('on')&&!l[1].classList.contains('on');
  window.obx.store.set('filterType',1);
  return twoPole && !l[0].classList.contains('on') && l[1].classList.contains('on');
})]);

// 8. knob quantisation (osc1Freq has 5 detents)
await page.evaluate(()=>window.obx.store.set('osc1Freq',0.6));
checks.push(['osc1Freq quantised to detent', await val('osc1Freq')===0.5]);
await page.evaluate(()=>window.obx.store.set('osc2Freq',0.2));
checks.push(['osc2Freq semitone detent', Math.abs(await val('osc2Freq')-12/60)<1e-9]);

// 9. keyboard modes and voice pools
await q('.panel-keyboard [data-param="g:double"] .rocker').click();
checks.push(['double -> two layers', await page.evaluate(()=>JSON.stringify(window.obx.store.layersForNote(60)))==='[0,1]']);
await q('.panel-keyboard [data-param="g:split"] .rocker').click();
checks.push(['split cancels double', await page.evaluate(()=>window.obx.store.g.double)===0]);
checks.push(['split routes low->lower', await page.evaluate(()=>{
  window.obx.store.armSplit=false; window.obx.store.splitNote=60;
  return JSON.stringify(window.obx.store.layersForNote(48))==='[1]' &&
         JSON.stringify(window.obx.store.layersForNote(72))==='[0]';})]);
await q('.panel-keyboard [data-param="g:split"] .rocker').click();

// 10. notes sound and keys light
await page.evaluate(()=>window.obx.noteOn(60,0.8));
checks.push(['note marks key down', await page.evaluate(()=>document.querySelector('.key[data-note="60"]').classList.contains('down'))]);
await page.evaluate(()=>window.obx.noteOff(60));
checks.push(['note off clears key', await page.evaluate(()=>!document.querySelector('.key[data-note="60"]').classList.contains('down'))]);

// 11. HOLD latches
await page.evaluate(()=>{window.obx.store.set('g:hold',1); window.obx.noteOn(62,0.8); window.obx.noteOff(62);});
checks.push(['hold sustains note', await page.evaluate(()=>window.obx.sounding.has(62))]);
await page.evaluate(()=>window.obx.store.set('g:hold',0));
checks.push(['hold release frees note', await page.evaluate(()=>!window.obx.sounding.has(62))]);

// 12. CHORD transposition
checks.push(['chord transposes', await page.evaluate(()=>{
  const a=window.obx;
  a.panic();
  a.store.set('g:hold',1);
  for(const n of [60,64,67]){a.noteOn(n,0.8);a.noteOff(n);}
  a.store.set('g:chord',1);
  a.store.set('g:hold',0);
  a.noteOn(38,0.8);                       // 2 semitones above the low C2 (36)
  const got=[...a.sounding].sort((x,y)=>x-y);
  return JSON.stringify(got)==='[62,66,69]';
})]);
await page.evaluate(()=>{window.obx.store.set('g:chord',0);window.obx.panic();});

// 13. arpeggiator cycles through held notes
checks.push(['arpeggiator steps through held notes', await page.evaluate(async () => {
  const a = window.obx;
  a.panic();
  a.store.set('g:arpRate', 1);        // fastest
  a.store.set('g:arpUp', 1);
  a.store.set('g:arpOn', 1);
  for (const n of [60, 64, 67]) a.noteOn(n, 0.8);
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 15));
    if (a.arpCurrent !== null) seen.add(a.arpCurrent);
  }
  a.store.set('g:arpOn', 0);
  for (const n of [60, 64, 67]) a.noteOff(n);
  a.panic();
  return [60, 64, 67].every(n => seen.has(n)) && seen.size === 3;
})]);
checks.push(['arpeggiator sounds one note at a time', await page.evaluate(() => {
  const a = window.obx;
  return a.arpCurrent === null && a.sounding.size === 0;
})]);

// 14. bend lever springs back to centre, mod depth stays
checks.push(['bend lever springs back, mod stays', await page.evaluate(async () => {
  const a = window.obx;
  const lever = a.surface.benderLever;
  const box = a.surface.bender.getBoundingClientRect();
  const sent = [];
  const real = a.engine.setGlobal.bind(a.engine);
  a.engine.setGlobal = (id, v) => { sent.push([id, v]); real(id, v); };
  const ev = (type, x, y) => lever.dispatchEvent(new PointerEvent(type,
    { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
  ev('pointerdown', box.right - 2, box.top + 2);   // hard right, fully up
  ev('pointerup', box.right - 2, box.top + 2);
  a.engine.setGlobal = real;
  const bends = sent.filter(s => s[0] === 'bend').map(s => s[1]);
  const mods = sent.filter(s => s[0] === 'modDepth').map(s => s[1]);
  return bends.length >= 2 && bends[0] > 0.5 && bends.at(-1) === 0
      && mods.length >= 1 && mods.at(-1) > 0.8 && a.store.g.modDepth > 0.8;
})]);
await page.evaluate(() => { window.obx.store.g.modDepth = 0; window.obx.engine.setGlobal('modDepth', 0); });

// 15. persistence round-trip
await page.evaluate(()=>window.obx.store.persist());
await page.waitForTimeout(600);
checks.push(['state persisted', await page.evaluate(()=>!!localStorage.getItem('obx.state.v1'))]);

// 16. transpose is exclusive
await q('.perf-panel [data-param="g:transposeUp"] .rocker').click();
await q('.perf-panel [data-param="g:transposeDown"] .rocker').click();
checks.push(['transpose exclusive', await page.evaluate(()=>window.obx.store.g.transposeUp===0&&window.obx.store.g.transposeDown===1)]);

let fail=0;
for(const c of checks){const [n,ok]=Array.isArray(c)?c:[c.name,false]; if(!ok)fail++; console.log(`${ok?'PASS':'FAIL'}  ${n}`);}
console.log(`\n${checks.length-fail}/${checks.length} passed`);
console.log('PAGE ERRORS:', errs.length?errs.slice(0,6):'none');
await browser.close(); server.close();
process.exit(fail||errs.length?1:0);
