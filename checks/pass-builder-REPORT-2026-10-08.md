# Pass Builder — page block, build report (2026-10-03)

Branch `pass-builder-2026-10-03` (base b2f5a84). Nothing pushed or deployed. Head SHA: see `git log -1` (the commit that adds this file).

## Files

Added
- `assets/pass-builder/pass-builder.js`, `assets/pass-builder/pass-builder.css` — the shared block (vanilla, no dependencies).
- `checks/pass-builder-mock.mjs` — mock catalogue + quote server (same best-single-pass rule) and static server; test slugs `edge`, `slow`, `quote-fails`, `slow-quote`.
- `checks/audit-pass-builder.mjs` — the Playwright audit (27 checks). Playwright is read from the Design System checkout's node_modules (nothing installed here).
- `checks/fixtures/pass-builder/indian-dance-winter-intensive-2027.{catalogue,quote-sat-pass,quote-single,quote-full-member}.json`
- `checks/screenshots/pass-builder/*.png`, `checks/pass-builder-results.json`

Changed (EN + NL in the same pass, D-029)
- `indian-dance-winter-intensive-2027/index.html` and `…/nl/index.html`: stylesheet link, the mount div before `.price-grid` with a `TODO(api-host)` comment (data-api and data-app point at `http://127.0.0.1:4177`, the fixture server), and one deferred script tag. No price, date or fact touched; the static table is still in the DOM.

## Strings (for approval) — exactly the table in the brief

| Key | EN | NL |
|---|---|---|
| hint | Tap the sessions you want. | Tik de sessies aan die je wil. |
| member | Member price | Ledenprijs |
| total | Total | Totaal |
| passApplied | {pass} applied — you save €{saving} | {pass} toegepast — je bespaart €{saving} |
| empty | Nothing selected yet. | Nog niets gekozen. |
| register | Register | Schrijf je in |
| toCheckout | Continue to registration | Verder naar inschrijven |
| finalNote | Final price confirmed at checkout. | De definitieve prijs zie je bij het afrekenen. |
| quoteFailed | Price shown at checkout. | De prijs zie je bij het afrekenen. |
| full | Full | Volzet |
| partner | Register together with your partner | Schrijf je samen met je partner in |
| added | {name} added | {name} toegevoegd |
| removed | {name} removed | {name} verwijderd |
| close | Close | Sluiten |

Not in the table, so not invented: the member condition (read verbatim from the page's own `.price-notes`, first sentence); the drawer heading reuses `register`; day/time labels are date formatting (Intl), not copy.

## Check results (node checks/audit-pass-builder.mjs → 27/27)

| Check | Result |
|---|---|
| 31 selections x member on/off, EN and NL: shown total == quote total | 62/62 each language, pass |
| Register link carries exactly the selected serials (62 per language) | pass |
| Saturday pass note string, EN + NL | pass |
| Fallback: no JS / failed fetch / 404 / timeout > 4 s | pass (`.price-grid` and table visible, builder absent) |
| Quote failure shows "Price shown at checkout.", Register still links | pass |
| Sold-out session disabled, "Full/Volzet", cannot be ticked; partner note | pass |
| No seat counts in the block | pass |
| Reduced motion: no count-up; drawer at rest 60 ms after click, no page-scale transition | pass |
| Motion on: count-up passes through intermediate values; spring still travelling at 60 ms | pass |
| Keyboard only (EN, NL): tick, tick, Register, drawer, link focused, focus trapped, Esc closes, focus back on Register, page un-inerted | pass |
| Max-scroll hit-test at 375x812 and 1440x900 (builder Register with sticky bar up and a toast; drawer link above the bar; last link at true max scroll; bar hidden at footer) | pass |
| Cuba dark page (screenshots only, nothing kept mounted there) | done |

## Screenshots (`checks/screenshots/pass-builder/`)

`{en,nl}-{375x812,1440x900}-{1-empty,2-saturday-pass,3-drawer}.png`, `en-375x812-4-toasts.png`, `cuba-dark-1440-builder.png`, `cuba-dark-1440-drawer.png`. All viewed; the first Saturday-pass shots had a toast sitting over the summary, so the audit now waits for toasts to leave before the element shot.

## Did not fit the contract / decisions for Swapnil

1. **I hide only the price TABLE column, not the whole `.price-grid`.** The grid's second column is the "Ready to register?" card, which carries the mandatory "Create a Shoonya ID" line. Hiding the whole grid would drop it. The builder takes the table's column; the card stays. The static table is still in the DOM and returns on any failure.
2. **The page's non-condition notes are kept.** The block moves the rest of `.price-notes` (non-refundable, Contact us) under the summary as a clone, so hiding the table does not lose them. The condition sentence is shown once, beside the toggle, verbatim.
3. **No Close button on the drawer** (no "Close" string in the table). Dismiss = Escape, scrim click, drag. A screen-reader/touch user without those has only the link. Please approve a Close string (EN/NL) if wanted.
4. **Pass names come from the API untranslated** (fixture is English, so the NL note reads "Saturday day pass toegepast"). The app should return localised pass names, or we add a `lang` param.
5. Theming variables must be set on `:root` (the drawer and toasts live on `<body>`). Cuba read correctly with only `--pb-bg/-fg/-muted/-line/-accent/-ease` set.
6. Page scale-back applies to `<main>` only; the fixed nav is not scaled. The existing `body{overflow-x:hidden}` on these pages was left alone (the block adds nothing to body; the drawer scroll lock is on `<html>`).
7. Hero text, the sticky bar's "from €35" and the FAQ still carry static prices — outside the block, not changed.
8. Registration link opens in a new tab, like the page's other Register links.

## Revision 2 (Swapnil's review)
- Mounted builder hides the card's Register button (Shoonya ID + address kept); fallback keeps it. Asserted in both states.
- `member` = Member price / Ledenprijs; condition sentence still verbatim from `.price-notes`.
- Drawer has a Close button in the header (new string `close`); in the keyboard test.
- Optional `name_nl` on sessions, passes and quote items/applied_pass; NL uses it, falls back to `name`. NL line asserted: "Zaterdag-dagpas toegepast — je bespaart €5". Item 3 above (no Close) and item 4 (untranslated pass names) are now resolved.

## Revision 3 (8 Oct 2026, Emil Kowalski design-eng review, Swapnil approved)
- 8 fixes in 08bebc2: card press .97; member tick from scale(.6) + opacity; flick-dismiss vel > 0.11; one pointer owns the drag (second finger ignored); toast exit 200 ms; toast timers pause on hidden tab; hover gated on (hover:hover) and (pointer:fine); reduced motion keeps opacity/colour fades, drops movement. Audit 27/27.
- Release decision (Monday release prep session): NOT in the 8 Oct app merge. Waits for app task T13 (catalogue/quote endpoints on shoonydance.vercel.app); then replace TODO(api-host) and merge. Never ship pointing at 127.0.0.1.
- Local preview: launch config `pass-builder-preview` (port 4177) in the app folder's .claude/launch.json.

## Revision 4 (8 Oct 2026): programme + session picker merged into ONE section (inline mode)

Files: `assets/pass-builder/pass-builder.{js,css}` (new optional `data-mode="inline" data-rows="#progList"`; default mode untouched), `indian-dance-winter-intensive-2027/index.html` + `nl/index.html` (mount div moved from #pricing to under `#progList`), `checks/audit-pass-builder.mjs` (now 40 checks), screenshots in `checks/screenshots/pass-builder/` (`*-1-empty`, `*-2-saturday-pass`, `*-3-drawer` now show the programme section; new `*-5-pricing-card`).

How it works: the builder upgrades the page's own `.prow` rows after the catalogue loads: a tick (`button role=checkbox`, `aria-checked`, named by session + price), the price becomes live (member toggle), the chevron becomes a `<button aria-expanded aria-controls>`. Mouse: tick/price select, title/chevron expand. Sold out = disabled tick + "Full/Volzet". Under the list: member toggle, total, pass note, Register (+ drawer), the three pass rows (the page's own static text, verbatim), then the notes. On success the programme heading is replaced by the pricing heading (copied from the page, "Choose your sessions." / "Kies je sessies."); #pricing keeps only the Shoonya ID card (ID line + address). Any failure (no JS, fetch, 404, timeout, a session with no matching row) leaves the page exactly as before.

New strings: none. (Heading, hint, labels all reuse approved/page text. The lede "Tap any session to read more." is unchanged and still accurate.)

Checks: `node checks/audit-pass-builder.mjs` = 40/40 (62 selections x member, EN+NL, total == quote; fallbacks incl. NL and rows+table+Register intact; keyboard: tick and disclosure are separate stops; mouse targets; each session name once in the visible page (shown to fail with the table un-hidden: 2); roles; pass facts; hit-tests at 375x812 and 1440x900 incl. tick/price/chevron; default mode unchanged on Cuba).

Page height, mounted, scrollHeight px: 375 wide EN 6621 -> 6125, NL 6738 -> 6206; 1440 wide EN 5781 -> 5569, NL 5801 -> 5610.

Did not fit / decisions: (1) Nav link "Pricing"/"Prijzen" now lands on the small ID card; consider pointing it at #programme. (2) No visible "Tap the sessions you want." hint (kept the page lede; hint is only the group's aria-label); add it if selection is not obvious. (3) Without JS the programme list is empty exactly as today (rows are drawn by the page script). (4) Preview server on 4177 was stopped to run the audit; restart via launch config `pass-builder-preview`.

## Revision 5 (8 Oct 2026, Swapnil: "fix it")
- Beige row = ticked only. Hover no longer tints the row (an opened/hovered row looked selected); hover now outlines the tick box in the accent colour (hover+fine pointer only).
- Merged mode hides every `a[href="#pricing"]` nav link (Pricing/Prijzen) — it would land on the leftover ID card. Fallback keeps it.
- Audit 40/40.

## Fable review (8 Oct 2026, read-only) — verdict: fix membership, selection, Register before polish
- **Member price is a promise checkout can't keep.** The page tick is self-declared. Checkout decides from the Shoonya ID. App passes have no member price (`passes.ts` passPriceFor: amount or discount_existing_student only); member_discount_pct reprices sessions only. All `semesters` rows are is_current=false, so nobody is a member today. On 22 Jan the current semester is autumn, so spring registrants (registrations open December, classes from 15 Feb, per Swapnil) would pay full price under the overlap rule.
- **Two "member" notions exist in the app:** current-semester member (route.ts 305–335) vs existing student (decideEligibility; the form labels it "voor leden / for members", WorkshopRegistrationForm.tsx:1010). The page's 36/31.50/70/60/150 can only come from existing-student pricing.
- **Recommended:** replace the tick with an optional Shoonya ID field; the quote endpoint (T13) prices by ID using checkout's own eligibility, never a client flag; parseShoonyaId normalises the ID.
- **Selection:** whole row toggles, "Details" as a small separate button, time shown on the row, passes as quick-pick chips (Saturday / Sunday / Whole weekend), one Register carrying the selection (nav + sticky bar too). Drop the drawer and the toasts.
- **Integration holes:** pass rows vanish if the catalogue pass names don't byte-match the page; /register/event/[id] ignores ?items= until T13; the mock trusts member=1 and gives passes a member price, so the 62 member cases prove nothing about checkout.
- **Strings:** full EN/NL proposal table is in the review hand-back (session 8 Oct). NL "€31.50" on the static rows should read "€31,50".

## Revision 6 (8 Oct 2026, Swapnil approved the Fable review; inline mode rebuilt)

Files: `assets/pass-builder/pass-builder.{js,css}` (inline mode is now its own `mountInline`; default mode keeps the card list + drawer + toasts), `indian-dance-winter-intensive-2027/index.html` + `nl/index.html` (only `data-taught="en"` on the mount div; NL static rows "€31.50" -> "€31,50"), `checks/pass-builder-mock.mjs`, fixtures, `checks/audit-pass-builder.mjs` (70 checks), screenshots.

What changed (inline mode)
- Membership: tick box gone. Optional Shoonya ID field (text, inputMode numeric, 44px). The RAW string goes out as `shoonya_id` (debounced 400 ms); a member flag is never sent. Rows/total show only what the quote returns; `basis` member -> member price with the full price struck through + "Member price applied."; none -> "Full price — no semester course on this ID."; unknown/failure -> no extra line (the "Final price at checkout." line under the total already covers it). Member prices vanish the moment the ID changes until the app confirms the new one.
- Selection: the whole row is one role=checkbox; "Details" is a separate button (aria-expanded, no glyph); time on the row from catalogue start/end; pass chips Saturday/Sunday/Whole weekend (shortcut; quote decides; disabled when a covered session is sold out); sold-out row not tappable, "Full/Volzet" + a line naming passes it breaks; thumbnails only at >= 880px.
- One Register inside the summary, same tab, "Register · €{total}"; nav Register + sticky bar -> #programme when empty, the selection (items + shoonya_id) when not; sticky bar reads "€75 · 2 sessions". Drawer and toasts are not used in inline mode. The "Ready to register?" card, static table and Pricing nav link are hidden in merged mode (whole #pricing section).
- Fixes: NL "€31,50"; count-up shows no cents between whole-euro totals (shared counter, also default mode); price text is no longer a hidden second click target; chips match by `key` else by the covered-session set (never by name); catalogue timeout 6 s.
- Mock: quote takes `shoonya_id`, normalised like parseShoonyaId (copied rules), returns `basis`; no `member=1`. Test IDs (fixtures, not people): 12 autumn member, 345 spring-only (counts), 678 non-member, "12x4" malformed, 9999 unknown number. Slugs added: `renamed`; `slow` is now 8 s.

Contract assumed for T13 (quote): `GET .../quote?items=a,b&shoonya_id=<raw>` -> `{items:[{serial,price,member_price}],total,saving,applied_pass,basis:'member'|'none'|'unknown'}`. `price` = list price, `member_price` only used when basis is member. When an ID is typed the block also sends one "probe" quote (all open sessions) so unselected rows can show their member price and the outcome line works with nothing selected.

Audit: `node checks/audit-pass-builder.mjs` = 70/70. Proved a check can fail: removed `shoonya_id` from the Register href -> 8 FAIL (href x2 languages, nav/sticky x2, one-Register x2, hit-tests); restored -> green.
Page height at 375 wide, empty selection: EN 6125 -> 5758, NL 6206 -> 5783 (1440: EN 5290, NL 5311).

Not fixed / notes: the sticky bar is display:none under prefers-reduced-motion (existing page rule), so its hit-test runs with motion on. Bottom "Register now" CTA and hero links still go to the generic registration link in a new tab. The Shoonya Dance Centre address line lived in the removed card (still in the FAQ and footer).

## Revision 6.1 (8 Oct 2026, main-session render check)
- The lede is now only "Tap a session to add it. Passes apply by themselves." / "Tik een sessie aan om ze toe te voegen. Passen gelden vanzelf." (rev 6 had appended it to the old lede, 5 lines at 375).
- The time range on each row never breaks at the dash (`.pb-time` nowrap).
- In merged mode EVERY `[data-reg]` link (hero, bottom CTA, nav, sticky bar) carries the selection or goes to #programme, not just nav + sticky bar.
- Audit 70/70.

## Revision 7 (8 Oct 2026): price-breakdown drawer in inline mode + the T13 contract

Files: `assets/pass-builder/pass-builder.{js,css}`, `checks/pass-builder-mock.mjs`, `checks/audit-pass-builder.mjs` (121 checks), fixtures (catalogue + 3 quotes rewritten in the T13 shape), screenshots `checks/screenshots/pass-builder/*-6-drawer-*.png`.

Drawer (inline mode only; default mode keeps its own drawer content)
- Summary "Register · EUR total" opens it. Nav, sticky bar and bottom CTA (this page has no hero Register link) keep `#programme` when empty; with a selection they open the same drawer (click + preventDefault, real href kept; ctrl/meta/shift/middle clicks are left alone).
- Content, all from the quote: a line per session (the page's own name, day + time muted, list price), "Member price" line (basis=member, sum of price - payable), "{pass} - pass discount" line (applied_pass/saving), divider, Total, Stripe line, Continue (same tab, items + shoonya_id), Close. Quote failed or lines that do not add up: list prices + "Price shown at checkout.", no total.
- Reuses the existing drawer: spring, handle drag + flick (0.11), one-pointer guard, focus trap, Esc, inert, `<main>` scale .955 / brightness .7. New: focus goes to the heading, Shift+Tab from the heading wraps, footer (Continue + Close) is sticky with safe-area padding, max-height 88vh, discount lines stagger in 50 ms apart (opacity + 8px), off under reduced motion. Close is faster (critically damped spring that aims 80 px past the edge, ~200 ms; open ~500 ms to sub-pixel rest). Springs now sub-step so slow frames cannot make them ring.
- New strings: Your selection / Jouw keuze; Member price / Ledenprijs (line); "{pass} - pass discount" / "{pass} - korting". Reused: Continue to registration / Verder naar inschrijven, Pay online with Stripe..., Close / Sluiten, Total / Totaal.

T13 contract alignment
- Quote is a POST `{items, shoonya_id}` (JSON, no query string). Default mode no longer sends `member`; its member checkbox is removed (no ID field there, the server prices only by ID).
- `payable` drives row member prices and the member line. `builder.enabled=false` leaves the page untouched. Null start/end show the day only. name_nl is null: row matching falls back to day/time order, drawer names come from the page rows, NL pass names from the page's own price table. Chips match by covered set. Pass `available` respected. Any HTTP error = quote failed.
- Mock: new catalogue/quote shapes, POST + OPTIONS, 400/409 errors, well-formed unknown ID returns basis none, slugs `disabled` and `no-times`.

Audit: 121/121. Proved a check can fail: member line forced +EUR 1 -> 4 FAIL (sum and member-line, EN + NL); restored -> green.
Notes: payable below list price for a non-member (early bird) would break the sum, so the drawer would fall back to the failed view; the probe quote (all open sessions) may hit 409 pass_only on the real server, in which case row member prices simply do not appear; the real API must allow CORS POST with content-type JSON.

## Revision 8 (8 Oct 2026, Swapnil: fill the ID in automatically)
- The Shoonya ID is remembered on the device (localStorage `sdc_shoonya_id`, origin workshops.shoonyadance.com, so every workshop page shares it). It is stored only after the app answered member/none for it, it fills in and quotes on the next visit, and it leaves the browser only inside a quote.
- "Not you? Clear" / "Niet jij? Wissen" (new, for approval) removes it. An emptied field also removes it.
- Verified with Playwright: fresh = empty; ' sh345 ' stored as 'sh345'; the NL page restores it with "Ledenprijs toegepast."; Clear empties field + storage; empty after reload. Audit 121/121.

## Wording approved (8 Oct 2026, Swapnil: "ok")
All strings from revisions 6–8 are approved, EN + NL, including:
- the session-list intro, quick picks, condition line, ID label and outcomes, Register · €{total}, sticky bar, sold-out line, "Taught in English.", the Stripe line, final price, refunds, ID needed;
- the drawer: Your selection / Jouw keuze, Member price / Ledenprijs, {pass} — discount / {pass} — korting;
- Not you? Clear / Niet jij? Wissen.
Remaining before merge: T13 live → replace TODO(api-host) with https://shoonydance.vercel.app, add the Winter Intensive admin data in the app, run the audit against the real host, merge and deploy.
