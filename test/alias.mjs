import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=path.resolve(new URL('..', import.meta.url).pathname);
const M={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const s=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=path.join(ROOT,p); if(!fs.existsSync(f)){r.writeHead(404);return r.end();}
 r.writeHead(200,{'Content-Type':M[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);});
await new Promise(r=>s.listen(8943,r));
const b=await chromium.launch({args:['--no-sandbox']}); const page=await b.newPage();
await page.goto('http://127.0.0.1:8943/');
const out=await page.evaluate(async()=>{
  const { defaultProgram, PARAM_IDS } = await import('/src/params.js');
  const SR=44100, N=32768;
  async function render(ov,note){
    const ctx=new OfflineAudioContext({numberOfChannels:2,length:SR*2,sampleRate:SR});
    await ctx.audioWorklet.addModule('/src/obx-processor.js');
    const n=new AudioWorkletNode(ctx,'obx-processor',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
    n.connect(ctx.destination);
    const p=defaultProgram(); Object.assign(p,ov);
    const c={}; for(const id of PARAM_IDS)c[id]=p[id];
    n.port.postMessage({type:'patch',layer:0,params:c});
    n.port.postMessage({type:'global',id:'masterVol',value:0.7});
    n.port.postMessage({type:'global',id:'volBalance',value:0});
    n.port.postMessage({type:'noteOn',note,velocity:1,layer:0});
    await new Promise(r=>setTimeout(r,30));
    return (await ctx.startRendering()).getChannelData(0);
  }
  function fft(re,im){ const n=re.length;
    for(let i=1,j=0;i<n;i++){let bit=n>>1; for(;j&bit;bit>>=1)j^=bit; j^=bit;
      if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
    for(let len=2;len<=n;len<<=1){const ang=-2*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang);
      for(let i=0;i<n;i+=len){let cr=1,ci=0;
        for(let k=0;k<len/2;k++){const ur=re[i+k],ui=im[i+k];
          const vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci, vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;
          re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
          const ncr=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=ncr;}}}
  }
  // Alias-to-signal: harmonic bins (+/-4) are signal, everything else above
  // 20 Hz is alias + noise. Hann window keeps leakage well inside the guard.
  function ratio(x,f0){
    const off=Math.floor(x.length*0.4);
    const re=new Float64Array(N), im=new Float64Array(N);
    for(let i=0;i<N;i++){const w=0.5-0.5*Math.cos(2*Math.PI*i/(N-1)); re[i]=x[off+i]*w;}
    fft(re,im);
    const binHz=SR/N, isH=new Uint8Array(N/2);
    for(let k=1;k*f0<SR/2;k++){const c=Math.round(k*f0/binHz);
      for(let d=-4;d<=4;d++){const bb=c+d; if(bb>0&&bb<N/2) isH[bb]=1;}}
    let sig=0,ali=0;
    for(let bb=Math.ceil(20/binHz);bb<Math.floor(16000/binHz);bb++){const p=re[bb]*re[bb]+im[bb]*im[bb];
      if(isH[bb]) sig+=p; else ali+=p;}
    return +(10*Math.log10(Math.max(ali,1e-30)/Math.max(sig,1e-30))).toFixed(1);
  }
  const base={vintage:0,aSustain:1,aAttack:0,aDecay:0,cutoff:1,kbdTrack:0,filterMod:0,osc2Saw:0,osc2Pulse:0};
  const sync={vintage:0,aSustain:1,aAttack:0,aDecay:0,cutoff:1,kbdTrack:0,filterMod:0,
              osc1Saw:0,osc1Pulse:0,fOsc1:0,osc2Saw:1,osc2Freq:19/60,sync:1};
  const pulse={...base,osc1Saw:0,osc1Pulse:1,pulseWidth:0.6};
  return {
    'saw A2 110Hz':  ratio(await render(base,45),110),
    'saw A4 440Hz':  ratio(await render(base,69),440),
    'saw A6 1760Hz': ratio(await render(base,93),1760),
    'saw C7 2093Hz': ratio(await render(base,96),2093.0),
    'pulse A4':      ratio(await render(pulse,69),440),
    'SYNC A3 220Hz': ratio(await render(sync,57),220),
    'SYNC A4 440Hz': ratio(await render(sync,69),440),
  };
});
// PolyBLEP oscillators at 2x with a half-band decimator and the drive stage
// inside the oversampled section land here. Thresholds sit a few dB below the
// measured figures so ordinary variation passes but a real regression -- a
// broken decimator, or a nonlinearity moved back out to the host rate --
// fails loudly.
const LIMITS = {
  'saw A2 110Hz': -46, 'saw A4 440Hz': -50, 'saw A6 1760Hz': -44,
  'saw C7 2093Hz': -44, 'pulse A4': -50, 'SYNC A3 220Hz': -43, 'SYNC A4 440Hz': -45,
};
let failed = 0;
for (const [name, got] of Object.entries(out)) {
  const limit = LIMITS[name];
  const ok = got <= limit;
  if (!ok) failed++;
  console.log(`${ok?'PASS':'FAIL'}  alias-to-signal ${name.padEnd(16)} ${String(got).padStart(7)} dB` +
              (ok?'':`   must be <= ${limit}`));
}
console.log(`\n${Object.keys(out).length-failed}/${Object.keys(out).length} passed`);
await b.close(); s.close();
process.exit(failed?1:0);
