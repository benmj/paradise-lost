// Render src/icon.svg to the PNG app icons. Usage: node scripts/icons.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const src = new URL("../src/", import.meta.url).pathname;
const svg = readFileSync(src + "icon.svg", "utf8");
const browser = await chromium.launch();
for (const size of [180, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:#f4eedf}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: `${src}icon-${size}.png`, omitBackground: false });
}
await browser.close();
