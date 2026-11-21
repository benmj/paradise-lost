// Phone-size screenshots of the running app. Usage: node scripts/shots.mjs [baseUrl]
import { chromium } from "playwright";
const base = process.argv[2] || "http://127.0.0.1:8107/";
const out = new URL("../shots/", import.meta.url).pathname;
const browser = await chromium.launch();
const errors = [];
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/i\.ytimg|favicon/.test(m.text()) && errors.push(`${tag} console: ${m.text()}`));
};
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
  const page = await ctx.newPage();
  watch(page, scheme);
  const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: `${out}${scheme}-${name}.png` }); };
  await page.goto(base + "#/"); await page.evaluate(() => document.fonts.ready); await shot("home");
  await page.evaluate(() => scrollTo(0, 820)); await shot("home-books");
  await page.goto(base + "#/b/4"); await shot("guide");
  await page.evaluate(() => scrollTo(0, 900)); await shot("guide-argument");
  await page.goto(base + "#/b/4/listen"); await page.waitForTimeout(400); await shot("guide-listen");
  await page.goto(base + "#/r/1"); await shot("reader");
  await page.goto(base + "#/r/4/288"); await page.waitForTimeout(500);
  await page.locator("#l-299 .gl, #l-300 .gl, #l-301 .gl, #l-302 .gl, #l-304 .gl").first().click().catch(() => {});
  await shot("reader-gloss");
  await page.goto(base + "#/r/9/775"); await page.waitForTimeout(600); await page.evaluate(() => document.querySelector("figure.dore")?.scrollIntoView({ block: "center" })); await shot("reader-plate");
  await page.goto(base + "#/plates"); await shot("plates");
  await page.goto(base + "#/listen"); await shot("listen");
  await page.goto(base + "#/people"); await shot("people");
  await page.goto(base + "#/people/satan"); await shot("person");
  await ctx.close();
}
// Wide screen with the chat sidebar open on a reader page.
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
const page = await ctx.newPage();
watch(page, "wide");
await page.goto(base + "#/r/9/780"); await page.waitForTimeout(800);
await page.click("#ask-fab"); await page.waitForTimeout(600);
await page.screenshot({ path: `${out}wide-reader-chat.png` });
await ctx.close();
// CHAT=1: a real answer from Ask the Reader, from a gloss on the phone.
if (process.env.CHAT) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light" });
  const p = await c.newPage();
  watch(p, "chat");
  await p.goto(base + "#/r/4/301"); await p.waitForTimeout(700);
  await p.locator("#l-301 .gl").first().click();
  await p.click("#nc-ask");
  await p.waitForSelector(".msg.reader .md p", { timeout: 90000 });
  await p.waitForFunction(() => !document.querySelector(".chat-send.stop"), null, { timeout: 90000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}light-chat.png` });
  await c.close();
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "no page errors");
