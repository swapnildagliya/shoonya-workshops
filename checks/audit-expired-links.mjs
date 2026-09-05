#!/usr/bin/env node
/**
 * Fail the deploy if any page links to an event that is already over.
 *
 * Why this exists: on 2026-09-05 the Round Trip to Cuba page was still promoting
 * the Indian Dance Summer Intensive, six days after it ended. The hub gated that
 * event; the detail page hard-coded it with no expiry. Nobody noticed because
 * nothing looks.
 *
 * It needs no ledger to maintain. Each event page already states its own dates in
 * JSON-LD, so the truth is read from the link TARGET, not from a list someone has
 * to remember to update.
 *
 * A link is accepted when the target has not finished, or when the link is gated:
 *   - the anchor carries data-until with a future date, or
 *   - the anchor's id is hidden by an after('<past date>') branch (the hub pattern).
 *
 * Usage:  node checks/audit-expired-links.mjs [--json]
 * Exit 1 if any ungated expired link is found.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date();
const HOST = 'workshops.shoonyadance.com';

const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || ['_build', 'assets', 'img', 'lib', 'checks', 'exports'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'index.html') pages.push(p);
  }
})(ROOT);

/** Latest endDate (falling back to startDate) declared anywhere in a page's JSON-LD. */
const endOf = new Map();
function eventEnd(slug) {
  if (endOf.has(slug)) return endOf.get(slug);
  const f = path.join(ROOT, slug, 'index.html');
  let end = null;
  if (fs.existsSync(f)) {
    const html = fs.readFileSync(f, 'utf8');
    const dates = [...html.matchAll(/"(?:endDate|startDate)"\s*:\s*"([^"]+)"/g)].map(m => new Date(m[1]));
    const valid = dates.filter(d => !isNaN(d));
    if (valid.length) end = new Date(Math.max(...valid));
  }
  endOf.set(slug, end);
  return end;
}

const findings = [];
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // Ids the page hides once a date has passed. Two idioms are in use across this
  // site and they mean the same thing, so match the SHAPE, not one spelling:
  //   after('2026-08-30T00:00:00')            { hide('btc-idsi'); }        (EN hub)
  //   new Date() >= new Date('2026-08-30...') { ...getElementById('card-idsi')
  //                                             .setAttribute('hidden','') } (NL hub)
  // Reading only the first idiom reported the fully-gated Dutch hub as broken.
  const gatedOut = new Set();
  for (const m of html.matchAll(/\bif\s*\(/g)) {
    const open = html.indexOf('{', m.index);
    if (open < 0) continue;
    const cond = html.slice(m.index, open);
    const date = cond.match(/['"](\d{4}-\d{2}-\d{2}[^'"]*)['"]/);
    if (!date || new Date(date[1]) > NOW) continue;
    let depth = 0, end = open;
    for (; end < html.length; end++) {
      if (html[end] === '{') depth++;
      else if (html[end] === '}' && --depth === 0) break;
    }
    const body = html.slice(open, end);
    for (const id of body.matchAll(/(?:hide|getElementById)\(\s*['"]([^'"]+)['"]\s*\)/g)) gatedOut.add(id[1]);
  }


  // A gate hides a whole card; the link lives INSIDE it. So resolve each gated id
  // to the character range of its element, and treat any link inside that range as
  // gated. Checking the anchor's own id alone reported gated cards as broken.
  const gatedRanges = [];
  for (const id of gatedOut) {
    const at = html.search(new RegExp('id\\s*=\\s*["\']' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']'));
    if (at < 0) continue;
    const open = html.lastIndexOf('<', at);
    const tag = (html.slice(open).match(/^<([a-zA-Z][\w-]*)/) || [])[1];
    if (!tag) continue;
    const re = new RegExp('<' + tag + '\\b|</' + tag + '>', 'gi');
    re.lastIndex = open;
    let depth = 0, m, end = html.length;
    while ((m = re.exec(html))) {
      depth += m[0][1] === '/' ? -1 : 1;
      if (depth === 0) { end = m.index + m[0].length; break; }
    }
    gatedRanges.push([open, end]);
  }
  const insideGate = i => gatedRanges.some(([a, b]) => i >= a && i < b);

  for (const a of html.matchAll(/<a\b([^>]*)href\s*=\s*["'](?:https?:\/\/[^/]*)?\/?([a-z0-9-]+)\/(?:nl\/)?["']([^>]*)>/gi)) {
    const attrs = a[1] + a[3];
    const slug = a[2];
    if (slug === 'nl' || !fs.existsSync(path.join(ROOT, slug, 'index.html'))) continue;
    if (rel.startsWith(slug + path.sep)) continue;              // link to itself

    const end = eventEnd(slug);
    if (!end || end >= NOW) continue;                            // still upcoming

    const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/) || [])[1];
    if (id && gatedOut.has(id)) continue;                        // the link itself is gated
    if (insideGate(a.index)) continue;                           // it sits inside a gated card
    const until = (attrs.match(/\bdata-until\s*=\s*["']([^"']+)["']/) || [])[1];
    if (until && new Date(until) > NOW) continue;                // self-pruning gate

    const line = html.slice(0, a.index).split('\n').length;
    findings.push({ file: rel, line, slug, ended: end.toISOString().slice(0, 10) });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2));
} else if (!findings.length) {
  console.log(`expired-links ✓ — ${pages.length} page(s), no page promotes a finished event.`);
} else {
  console.log(`expired-links — ${findings.length} ungated link(s) to finished events:\n`);
  for (const f of findings) console.log(`  ${f.file}:${f.line}  →  /${f.slug}/  (ended ${f.ended})`);
  console.log(`\nGate it (data-until, or the hub's after()/hide() pattern) or remove it.`);
}
process.exit(findings.length ? 1 : 0);
