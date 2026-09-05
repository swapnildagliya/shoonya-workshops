#!/usr/bin/env node
/**
 * Fail the deploy if a call-to-action fails WCAG AA contrast.
 *
 * Found 2026-09-05 on the Round Trip to Cuba page: "Register now — from €75" and
 * the sticky "Register" bar were white on Shoonya purple at 3.43:1, where AA wants
 * 4.5:1 for text under 24px. The two controls the page exists for.
 *
 * D-057 settles which way to fix it: on a vibrant ground WHITE is the loudest tone
 * and belongs to the headline, BLACK to subordinate labels. An 11px uppercase
 * tracked button label is subordinate-label register, so it goes black — which also
 * clears 4.5:1 without inflating the button.
 *
 * Resolves var() against the file's own :root, so it reads what actually ships.
 *
 * Usage: node checks/audit-cta-contrast.mjs [--json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELECTORS = ['.btn-primary', '.regbar-cta', '.nav-cta', '.btn-ghost', '.more-hub'];

const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || ['_build', 'assets', 'img', 'lib', 'checks', 'exports'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (e.name === 'index.html') pages.push(p);
  }
})(ROOT);

const hexToRgb = h => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};
/* Returns [r,g,b,a]. Alpha matters: a translucent button ground is the page
   behind it tinted, not an opaque swatch — treating rgba() as opaque invented a
   1:1 "failure" on a perfectly legible coral-on-coral-tint pill. */
const toRgb = v => {
  v = String(v).trim();
  if (v.startsWith('#')) return [...hexToRgb(v), 1];
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (m) { const n = m[1].split(',').map(x => parseFloat(x)); return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1]; }
  const named = { white: [255,255,255,1], black: [0,0,0,1], transparent: [0,0,0,0] };
  return named[v.toLowerCase()] || null;
};
const over = (fg, bg) => fg[3] >= 1 ? fg.slice(0,3) : fg.slice(0,3).map((c,i) => c*fg[3] + bg[i]*(1-fg[3]));
const lum = c => { const [r,g,b] = c.map(v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*r + 0.7152*g + 0.0722*b; };
const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1,L2)+0.05) / (Math.min(L1,L2)+0.05); };

const findings = [];
for (const file of pages) {
  const css = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  const vars = {};
  for (const rootBlock of css.matchAll(/:root\s*\{([^}]*)\}/g))
    for (const v of rootBlock[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[v[1]] = v[2].trim();
  const resolve = v => {
    for (let i = 0; i < 5 && /var\(/.test(v); i++)
      v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_, n) => vars[n] || '');
    return v.trim();
  };

  for (const sel of SELECTORS) {
    const re = new RegExp('(^|[,}])\\s*' + sel.replace('.', '\\.') + '\\s*\\{([^}]*)\\}', 'm');
    const m = css.match(re);
    if (!m) continue;
    const body = m[2];
    const grab = p => { const g = body.match(new RegExp('(?:^|;)\\s*' + p + '\\s*:\\s*([^;]+)')); return g ? resolve(g[1]) : null; };
    let fg = toRgb(grab('color') || ''), bg = toRgb(grab('background(?:-color)?') || '');
    if (!fg || !bg) continue;
    // Composite a translucent button ground over the page ground before judging.
    const pageBg = toRgb(resolve((css.match(/body\s*\{[^}]*?background(?:-color)?\s*:\s*([^;]+)/) || [])[1] || '#0B090F')) || [11,9,15,1];
    bg = over(bg, pageBg.slice(0,3));
    fg = over(fg, bg);
    const fsRaw = grab('font-size'), weight = parseInt(grab('font-weight') || '400', 10);
    const px = fsRaw ? parseFloat(fsRaw) : 16;
    const large = px >= 24 || (px >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bg);
    if (r < need) findings.push({ file: rel, sel, ratio: +r.toFixed(2), need, px, weight });
  }
}

if (process.argv.includes('--json')) { console.log(JSON.stringify(findings, null, 2)); }
else if (!findings.length) console.log(`cta-contrast ✓ — ${pages.length} page(s), every CTA meets WCAG AA.`);
else {
  console.log(`cta-contrast — ${findings.length} CTA(s) below AA:\n`);
  for (const f of findings) console.log(`  ${f.file}  ${f.sel}  ${f.ratio}:1 (needs ${f.need}) at ${f.px}px/${f.weight}`);
  console.log(`\nD-057: on a vibrant ground white is the headline tone, black the subordinate label.\nA small tracked button label goes black — that clears AA without resizing the button.`);
}
process.exit(findings.length ? 1 : 0);
