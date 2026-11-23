import { chromium } from '/Users/benito/code/paradise-lost/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const S=process.env.S, U='http://localhost:8118/', only=process.argv[2];
const b=await chromium.launch();
const RIP=`(()=>{const s=document.createElement('style');s.textContent='.rip{position:fixed;z-index:99999;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;background:rgba(179,38,46,.30);border:2.5px solid rgba(179,38,46,.9);pointer-events:none;animation:rip .6s ease-out forwards}@keyframes rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}';document.documentElement.appendChild(s);addEventListener('pointerdown',e=>{const d=document.createElement('div');d.className='rip';d.style.left=e.clientX+'px';d.style.top=e.clientY+'px';document.documentElement.appendChild(d);setTimeout(()=>d.remove(),700)},true)})()`;
async function scene(name,{w,h,dsf,mobile=true},mode,hash,fn){
  const dir=`${S}/w/${name}`; fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true});
  const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:dsf,isMobile:mobile,hasTouch:mobile});
  const p=await c.newPage(); await p.addInitScript(RIP); await p.addInitScript(`localStorage.setItem('mode',JSON.stringify('${mode}'))`);
  await p.goto(U+hash); await p.waitForSelector('main#app > *',{state:'attached'}); await p.waitForTimeout(700);
  const cdp=await c.newCDPSession(p); const frames=[]; let n=0;
  cdp.on('Page.screencastFrame',async f=>{const fn=`${dir}/f${String(n++).padStart(5,'0')}.jpg`; fs.writeFileSync(fn,Buffer.from(f.data,'base64')); frames.push({fn,ts:f.metadata.timestamp}); cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{});});
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:1080,maxHeight:1350,everyNthFrame:1});
  await p.waitForTimeout(300); const marks={}; const mark=k=>marks[k]=Date.now()/1000;
  await fn(p,mark); await p.waitForTimeout(400); await cdp.send('Page.stopScreencast'); await c.close();
  const t0=frames[0].ts; let list=''; for(let i=0;i<frames.length;i++){const d=(i<frames.length-1?frames[i+1].ts-frames[i].ts:0.1); list+=`file '${frames[i].fn}'\nduration ${d.toFixed(4)}\n`;} list+=`file '${frames.at(-1).fn}'\n`;
  fs.writeFileSync(`${dir}/list.txt`,list); fs.writeFileSync(`${dir}/marks.json`,JSON.stringify({t0,marks:Object.fromEntries(Object.entries(marks).map(([k,v])=>[k,v-t0])),n:frames.length,dur:frames.at(-1).ts-t0}));
  console.log(name,frames.length,'frames',(frames.at(-1).ts-t0).toFixed(1)+'s',JSON.stringify(marks&&Object.fromEntries(Object.entries(marks).map(([k,v])=>[k,+(v-t0).toFixed(2)]))));
}
const P={w:432,h:540,dsf:2.5};
const tap=async(p,sel)=>{const l=p.locator(sel).first(); await l.waitFor({state:'visible'}); await l.click();};
const sc=(p,y)=>p.evaluate(y=>window.scrollBy({top:y,behavior:'smooth'}),y);
const PH={w:390,h:844,dsf:1}, TB={w:820,h:1180,dsf:1,mobile:false}, DK={w:1280,h:800,dsf:1,mobile:false};
const turn=async(p,n,gap=600)=>{for(let i=0;i<n;i++){await p.keyboard.press('ArrowRight'); await p.waitForTimeout(gap);}};
const jobs={
 phone:()=>scene('phone',PH,'scroll','#/r/1/1',async(p,m)=>{await p.waitForSelector('#poem .ln'); await p.waitForTimeout(500); await sc(p,500); await p.waitForTimeout(900); await sc(p,500); await p.waitForTimeout(1200);}),
 tablet:()=>scene('tablet',TB,'scroll','#/r/9/1',async(p,m)=>{await p.waitForSelector('#poem .ln'); await p.waitForTimeout(500); await tap(p,'#menu'); await p.waitForTimeout(1300); await tap(p,'[data-k=mode][data-v=page]'); await p.waitForTimeout(700); await turn(p,4,650);}),
 desktop:()=>scene('desktop',DK,'spread','#/r/9/1',async(p,m)=>{await p.waitForSelector('#poem .ln'); await p.waitForTimeout(900); await turn(p,4,800);}),
 theme:()=>scene('theme',PH,'scroll','#/r/1/1',async(p,m)=>{await p.waitForSelector('#poem .ln'); await p.waitForTimeout(800); await tap(p,'#menu'); await p.waitForTimeout(1300); await tap(p,'[data-k=ts][data-v="3"]'); await p.waitForTimeout(1100); await tap(p,'[data-k=theme][data-v=dark]'); await p.waitForTimeout(1500); await tap(p,'[data-k=plain]'); await p.waitForTimeout(1500); await tap(p,'[data-k=theme][data-v=dim]'); await p.waitForTimeout(1500);}),
};
for(const k of Object.keys(jobs)) if(!only||only.split(',').includes(k)) await jobs[k]();
await b.close();
