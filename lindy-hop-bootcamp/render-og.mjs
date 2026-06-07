// Renders og-image.jpg (1200×630) for the Lindy Hop Bootcamp page
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.join(__dirname, 'index.html');
const outPath  = path.join(__dirname, 'og-image.jpg');

const browser = await chromium.launch();
const page    = await browser.newPage();

await page.setViewportSize({ width: 1200, height: 630 });
await page.goto(`file://${pagePath}`, { waitUntil: 'networkidle' });

// Capture the hero section only (top 630px at 1200px wide)
await page.screenshot({
  path: outPath,
  type: 'jpeg',
  quality: 90,
  clip: { x: 0, y: 0, width: 1200, height: 630 }
});

await browser.close();
console.log(`✓ og-image.jpg written to ${outPath}`);
