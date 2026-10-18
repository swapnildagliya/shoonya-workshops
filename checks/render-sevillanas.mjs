#!/usr/bin/env node
/* Renders the Sevillanas Refresh landing page (EN+NL) at 1440 and 375 with the app API stubbed by pass-builder-mock.mjs
   (the real event is Inactive, so the live catalogue answers 404). Usage: node checks/render-sevillanas.mjs <outDir> */
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
import { startMock, catalogueFor, quoteFor } from './pass-builder-mock.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/Users/swapnil/Documents/Claude/Projects/Design System/node_modules/playwright');
const out = process.argv[2] || '.'; fs.mkdirSync(out, { recursive: true });
const PORT = 4181, BASE = `http://127.0.0.1:${PORT}`; await startMock(PORT);
const browser = await chromium.launch();
const cat = catalogueFor('sevillanas-refresh');
const results = [];
for (const lang of ['en', 'nl']) for (const [w, h] of [[1440, 900], [375, 812]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.route('https://shoonydance.vercel.app/api/events/**', async (route) => {
    const req = route.request(), u = new URL(req.url()), hdr = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...hdr, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
    if (u.pathname.endsWith('/catalogue')) return route.fulfill({ status: 200, headers: hdr, body: JSON.stringify(cat) });
    let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch {}
    return route.fulfill({ status: 200, headers: hdr, body: JSON.stringify(quoteFor(cat, b.items || [], b.shoonya_id)) });
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${BASE}/sevillanas-refresh/${lang === 'nl' ? 'nl/' : ''}`, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important}.hero-eyebrow,.hero-subtitle,.hero-actions,.hero-title .w{animation:none!important;opacity:1!important;transform:none!important}' });
  await page.waitForTimeout(600);
  const tag = `${lang}-${w}`;
  const ready = await page.evaluate(() => !!document.querySelector('.pass-builder[data-ready="1"]'));
  await page.screenshot({ path: path.join(out, `sevillanas-${tag}-1-top.png`) });
  await page.evaluate(() => document.querySelector('#programme').scrollIntoView());
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, `sevillanas-${tag}-2-sessions-empty.png`) });
  const picks = page.locator('#progList [role=checkbox]'); const n = await picks.count();
  for (let i = 0; i < n; i++) await picks.nth(i).click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#programme').scrollIntoView());
  await page.screenshot({ path: path.join(out, `sevillanas-${tag}-3-both-days-pass.png`) });
  const reg = page.locator('.pass-builder button:has-text("€"), .pass-builder .pb-register').first();
  if (await reg.count()) { await reg.click().catch(() => {}); await page.waitForTimeout(1200); await page.screenshot({ path: path.join(out, `sevillanas-${tag}-4-drawer.png`) }); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(out, `sevillanas-${tag}-0-fullpage.png`), fullPage: true });
  results.push({ tag, ready, rows: n, errs });
  await ctx.close();
}
await browser.close(); console.log(JSON.stringify(results, null, 1)); process.exit(0);
