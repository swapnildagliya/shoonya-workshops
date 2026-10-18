#!/usr/bin/env node
/**
 * Local mock of the app's public catalogue + quote endpoints, and a static server for this repo.
 * Contract: docs/proposals/2026-10-03-pass-builder-spec.md (Design System repo).
 * The quote applies the same "best single pass" rule the app's applyBestPass() uses: a pass applies only
 * when the selection includes ALL of its sessions, and the pass that saves the most wins.
 *
 * Slugs: sevillanas-refresh (normal), disabled, quote-fails, slow-quote; anything else 404 (the event is not public in the app yet).
 * Session member_price (10% off, 27) is a MOCK value only: the app prices members by Shoonya ID at checkout.
 *
 * Shapes follow the real T13 endpoints (not yet deployed): catalogue {event,builder,sessions,passes,currency}; name_nl is null everywhere,
 * pass key is null, amounts are euros. Quote: POST {items,shoonya_id} (GET also works) -> {items:[{...,price,member_price,payable}], applied_pass,
 * subtotal, total, total_cents, saving, basis?}; errors 400 bad_items/unknown_session, 409 session_unavailable/pass_only/nothing_to_pay, 404, 429, 503.
 *
 * Usage: node checks/pass-builder-mock.mjs [port=4177]      (also importable: startMock(port))
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'checks/fixtures/pass-builder');
const BASE = JSON.parse(fs.readFileSync(path.join(FIX, 'sevillanas-refresh.catalogue.json'), 'utf8'));

export function catalogueFor(slug) {
  if (!['sevillanas-refresh', 'quote-fails', 'slow-quote', 'disabled'].includes(slug)) return null;
  const c = JSON.parse(JSON.stringify(BASE));
  c.event.slug = slug;
  c.builder = { enabled: slug !== 'disabled', reason: slug === 'disabled' ? 'not_enabled' : null };
  return c;
}

/** Same normalisation as the app's parseShoonyaId (src/lib/shoonya-id-resolve.ts): trim, drop spaces, '#', 'sh' prefix, leading zeros, 1-7 digits. */
export function parseShoonyaId(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\s+/g, '').replace(/^#/, '').replace(/^sh/i, '');
  if (!/^\d+$/.test(s)) return null;
  s = s.replace(/^0+(?=\d)/, '');
  if (!/^\d{1,7}$/.test(s)) return null;
  return Number(s);
}

/** TEST FIXTURES (not real people). The real rule lives in the app: a PAID registration in the semester that covers the event date
 *  OR in the next semester on sale counts as member. Here: autumn = the semester on the event date, spring = the next one on sale. */
export const FIXTURE_IDS = { autumnMember: '12', springOnlyMember: '345', nonMember: '678', malformed: '12x4', unknownNumber: '9999' };
const REGISTRATIONS = { 12: ['autumn'], 345: ['spring'], 678: [] };
const QUALIFYING = ['autumn', 'spring'];
export function basisFor(rawId) {
  if (rawId == null || String(rawId).trim() === '') return { basis: null, member: false };
  const id = parseShoonyaId(rawId);
  if (id == null) return { basis: 'unknown', member: false };            // not a Shoonya ID at all
  if (!(id in REGISTRATIONS)) return { basis: 'none', member: false };     // well-formed but no semester course (the app cannot tell unknown from none)
  const member = REGISTRATIONS[id].some((r) => QUALIFYING.includes(r));
  return { basis: member ? 'member' : 'none', member };
}

export function quoteFor(cat, items, rawId) {
  const { basis, member } = basisFor(rawId);
  const byS = Object.fromEntries(cat.sessions.map((s) => [s.serial, s]));
  const chosen = items.map((i) => byS[i]);
  const p = (s) => (member ? s.member_price : s.price);
  const subtotal = chosen.reduce((a, s) => a + p(s), 0);
  const set = new Set(chosen.map((s) => s.serial));
  let best = null;
  for (const pass of cat.passes) {
    if (!pass.covered.every((c) => set.has(c))) continue;
    const covered = pass.covered.reduce((a, c) => a + p(byS[c]), 0);
    const price = member ? pass.member_price : pass.price;
    const save = covered - price;
    if (save > 0 && (!best || save > best.save)) best = { pass, save, price };
  }
  const saving = best ? best.save : 0;
  return {
    items: chosen.map((s) => ({ serial: s.serial, name: s.name, name_nl: s.name_nl ?? null, date: s.date, start: s.start, end: s.end, price: s.price, member_price: s.member_price, payable: p(s) })),
    applied_pass: best ? { name: best.pass.name, name_nl: best.pass.name_nl ?? null, price: best.price, covered: best.pass.covered } : null,
    subtotal, total: subtotal - saving, total_cents: Math.round((subtotal - saving) * 100), saving, currency: 'EUR', early_bird_until: null, ...(basis ? { basis } : {}),
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };

export function startMock(port = 4177) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Cache-Control': 'no-store' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const m = u.pathname.match(/^\/api\/events\/([^/]+)\/(catalogue|quote)$/);
    const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(body)); };
    if (m) {
      const slug = decodeURIComponent(m[1]); const cat = catalogueFor(slug);
      if (!cat) return json(404, { error: 'not found' });
      if (m[2] === 'catalogue') return slug === 'slow' ? setTimeout(() => json(200, cat), 8000) : json(200, cat);
      if (slug === 'quote-fails') return json(500, { error: 'boom' });
      const answer = (items, rawId) => {
        if (!Array.isArray(items) || !items.length || items.some((i) => typeof i !== 'string')) return json(400, { error: 'bad_items' });
        const known = new Set(cat.sessions.map((x) => x.serial));
        if (items.some((i) => !known.has(i))) return json(400, { error: 'unknown_session' });
        if (items.some((i) => cat.sessions.find((x) => x.serial === i).available === false)) return json(409, { error: 'session_unavailable' });
        const q = quoteFor(cat, items, rawId); // a 'member' flag is never read
        return slug === 'slow-quote' ? setTimeout(() => json(200, q), 700) : json(200, q);
      };
      if (req.method === 'POST') {
        let raw = ''; req.on('data', (d) => (raw += d));
        return req.on('end', () => { let b; try { b = JSON.parse(raw || '{}'); } catch { return json(400, { error: 'bad_items' }); } answer(b.items, b.shoonya_id); });
      }
      return answer((u.searchParams.get('items') || '').split(',').filter(Boolean), u.searchParams.get('shoonya_id'));
    }
    // PREVIEW STAND-IN for the app's registration form (/register/event/<slug>?items=…&shoonya_id=…), so Continue does not 404 locally
    const rm = u.pathname.match(/^\/register\/event\/([^/]+)$/);
    if (rm) {
      const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const cat = catalogueFor(decodeURIComponent(rm[1]));
      const items = (u.searchParams.get('items') || '').split(',').filter(Boolean), id = u.searchParams.get('shoonya_id') || '';
      let q = null; try { if (cat && items.length) q = quoteFor(cat, items, id); } catch {}
      const rows = items.map((i) => { const s = cat && cat.sessions.find((x) => x.serial === i); return `<li>${esc(s ? s.name : i)}</li>`; }).join('');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...cors });
      return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Registration (preview)</title>
<body style="font:16px/1.5 Inter,system-ui,sans-serif;background:#f4f1eb;color:#141218;max-width:560px;margin:40px auto;padding:0 16px">
<p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#c4561c">Local preview — stand-in</p>
<h1 style="font-weight:400">The Shoonya registration form opens here</h1>
<p>On the live site this is the app's registration page, with these sessions already ticked:</p><ul>${rows || '<li>(none)</li>'}</ul>
<p>Shoonya ID passed on: <b>${esc(id) || '—'}</b>${q ? ` · price the app will charge: <b>€${esc(q.total)}</b>${q.basis ? ` (${esc(q.basis)})` : ''}` : ''}</p>
<p><a href="javascript:history.back()" style="color:#c4561c">← Back to the page</a></p></body>`);
    }
    let rel = decodeURIComponent(u.pathname); if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', ...cors });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 4177;
  await startMock(port); console.log('mock on http://127.0.0.1:' + port);
}
