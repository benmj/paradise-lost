// Layout check: the gold bar beside a famous passage must never touch the text (drop cap included).
// Needs a running server (default http://localhost:8107) and playwright.  node scripts/check-layout.mjs [base]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8107/';
const b = await chromium.launch();
let bad = 0, checked = 0;
for (const [mode, vp] of [['scroll', { width: 390, height: 844 }], ['page', { width: 390, height: 844 }], ['page', { width: 1000, height: 760 }], ['spread', { width: 1280, height: 800 }]]) {
  const c = await b.newContext({ viewport: vp }); const p = await c.newPage();
  await p.addInitScript((m) => localStorage.setItem('mode', JSON.stringify(m)), mode);
  for (let n = 1; n <= 12; n++) {
    await p.goto(`${base}#/r/${n}`); await p.waitForSelector('.ln');
    const r = await p.evaluate(() => [...document.querySelectorAll('.ln.famous-ln')].map((el) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const t = w.nextNode(); const rg = document.createRange(); rg.setStart(t, 0); rg.setEnd(t, 1);
      const cs = getComputedStyle(el), bar = el.getBoundingClientRect().left + 2;
      const first = el.classList.contains('first') ? rg.getBoundingClientRect().left : rg.getBoundingClientRect().left;
      return { l: el.dataset.l, gap: first - bar };
    }));
    for (const x of r) { checked++; if (x.gap < 6) { bad++; console.log(`COLLISION ${mode} ${vp.width}px book ${n} line ${x.l}: ${x.gap.toFixed(1)}px`); } }
  }
  await c.close();
}
await b.close();
console.log(`${checked} famous lines checked, ${bad} collisions`);
process.exit(bad ? 1 : 0);
