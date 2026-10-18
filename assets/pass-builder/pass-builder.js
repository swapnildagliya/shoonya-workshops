/* Pass Builder — shared block for workshop + festival landing pages. Vanilla, no dependencies.
   Mount: <div class="pass-builder" data-event="<slug>" data-api="https://<host>" data-app="https://<host>"></div>
   Inline mode (optional): add data-mode="inline" data-rows="#progList". The block then upgrades the page's own session rows
   (.prow > .prow-main[.num .thumb .s-name .s-price .chev] + .prow-detail; .open = expanded) with a tick box and a live price,
   and mounts only the summary where the div sits. Default mode (no data-mode) builds its own card list and is unchanged.
   The block never computes a price: it shows what the app's quote endpoint returns.
   Inline mode (rev 6): optional Shoonya ID field (raw string sent as shoonya_id, never a member flag), whole-row selection, quick-pick pass chips,
   one Register inside the summary (same tab). Default mode is the older card list + drawer + toasts.
   If the catalogue cannot be loaded (no JS, failed fetch, 404, >6 s) the page's static price table stays untouched. */
(function () {
  'use strict';
  var TIMEOUT = 4000, CAT_TIMEOUT = 6000;
  var reduce = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };

  var STR = {
    en: {
      hint: 'Tap the sessions you want.',
      member: 'Member price',
      total: 'Total',
      passApplied: '{pass} applied — you save €{saving}',
      empty: 'Nothing selected yet.',
      register: 'Register', registerInline: 'Register',
      toCheckout: 'Continue to registration',
      finalNote: 'Final price confirmed at checkout.',
      quoteFailed: 'Price shown at checkout.',
      full: 'Full',
      partner: 'Register together with your partner',
      added: '{name} added',
      removed: '{name} removed',
      close: 'Close',
      lede: 'Tap a session to add it. Passes apply by themselves.',
      passesAria: 'Passes',
      chipSaturday: 'Saturday', chipSunday: 'Sunday', chipWeekend: 'Whole weekend',
      membersPrice: 'Members €{price}',
      cond: 'Semester students pay the member price.',
      idLabel: 'Shoonya ID (optional)',
      idMember: 'Member price applied.',
      idNone: 'Full price — no semester course on this ID.',
      idClear: 'Not you? Clear',
      details: 'Details',
      registerTotal: 'Register · €{total}',
      payLine: 'Pay online with Stripe at the next step.',
      finalLine: 'Final price at checkout.',
      noRefund: 'No refunds. Questions? ',
      needId: 'You need a Shoonya ID to register — ',
      needIdLink: 'create one',
      soldPass: 'Not available in: {passes}.',
      session1: '{n} session', sessionN: '{n} sessions',
      taught: 'Taught in English.',
      yourSelection: 'Your selection',
      memberLine: 'Member price',
      passLine: '{pass} — discount'
    },
    nl: {
      hint: 'Tik de sessies aan die je wil.',
      member: 'Ledenprijs',
      total: 'Totaal',
      passApplied: '{pass} toegepast — je bespaart €{saving}',
      empty: 'Nog niets gekozen.',
      register: 'Schrijf je in', registerInline: 'Inschrijven',
      toCheckout: 'Verder naar inschrijven',
      finalNote: 'De definitieve prijs zie je bij het afrekenen.',
      quoteFailed: 'De prijs zie je bij het afrekenen.',
      full: 'Volzet',
      partner: 'Schrijf je samen met je partner in',
      added: '{name} toegevoegd',
      removed: '{name} verwijderd',
      close: 'Sluiten',
      lede: 'Tik een sessie aan om ze toe te voegen. Passen gelden vanzelf.',
      passesAria: 'Passen',
      chipSaturday: 'Zaterdag', chipSunday: 'Zondag', chipWeekend: 'Hele weekend',
      membersPrice: 'Leden €{price}',
      cond: 'Wie een semestercursus volgt, betaalt de ledenprijs.',
      idLabel: 'Shoonya ID (optioneel)',
      idMember: 'Ledenprijs toegepast.',
      idNone: 'Volle prijs — geen semestercursus op dit nummer.',
      idClear: 'Niet jij? Wissen',
      details: 'Details',
      registerTotal: 'Inschrijven · €{total}',
      payLine: 'Je betaalt online via Stripe bij de volgende stap.',
      finalLine: 'Definitieve prijs bij het afrekenen.',
      noRefund: 'Geen terugbetaling. Vragen? ',
      needId: 'Je hebt een Shoonya ID nodig — ',
      needIdLink: 'maak er een aan',
      soldPass: 'Niet beschikbaar in: {passes}.',
      session1: '{n} sessie', sessionN: '{n} sessies',
      taught: 'Les in het Engels.',
      yourSelection: 'Jouw keuze',
      memberLine: 'Ledenprijs',
      passLine: '{pass} — korting'
    }
  };

  var LANG = ((document.documentElement.lang || 'en').slice(0, 2).toLowerCase() === 'nl') ? 'nl' : 'en';
  var S = STR[LANG];
  function fill(tpl, o) { return tpl.replace(/\{(\w+)\}/g, function (_, k) { return o[k]; }); }
  function nm(o) { return (LANG === 'nl' && o.name_nl) ? o.name_nl : o.name; }
  function num(n) { var s = (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ''); return LANG === 'nl' ? s.replace('.', ',') : s; }
  function eur(n) { return '€' + num(n); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.5"/></svg>';

  function fetchJSON(url, ms, ctl, body) {
    ctl = ctl || new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, ms);
    var init = { signal: ctl.signal, headers: { Accept: 'application/json' } };
    if (body) { init.method = 'POST'; init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); } // POST: the Shoonya ID stays out of URLs and logs
    return fetch(url, init).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) { clearTimeout(timer); return j; }, function (e) { clearTimeout(timer); throw e; });
  }

  function quoteURL(api, slug) { return api + '/api/events/' + encodeURIComponent(slug) + '/quote'; }
  function quoteBody(list, idRaw) { var b = { items: list.map(function (s) { return s.serial; }) }; if (idRaw && String(idRaw).trim()) b.shoonya_id = idRaw; return b; }
  // start/end can be null: show the day only, never 'null–null'
  function whenOf(fmt, s) { var d = fmt.format(new Date(s.date + 'T12:00:00')); return (s.start && s.end) ? d + ' · ' + s.start + '–' + s.end : d; }
  function startKey(s) { return s.date + (s.start || ''); }

  /* ---------- animated total (shared): no cents unless the target or start has cents ---------- */
  function makeCounter(totalEl) {
    var shown = 0, tween = 0;
    function paint(v, cents) { totalEl.textContent = cents ? '€' + (LANG === 'nl' ? v.toFixed(2).replace('.', ',') : v.toFixed(2)) : '€' + String(Math.round(v)); }
    return {
      clear: function () { cancelAnimationFrame(tween); shown = 0; totalEl.setAttribute('data-empty', '1'); totalEl.textContent = ''; },
      set: function (target) {
        cancelAnimationFrame(tween);
        var wasEmpty = totalEl.getAttribute('data-empty') === '1';
        totalEl.removeAttribute('data-empty');
        var from = wasEmpty ? target : shown;
        if (reduce() || from === target) { shown = target; totalEl.textContent = eur(target); return; }
        var t0 = performance.now(), D = 400, cents = (from % 1 !== 0) || (target % 1 !== 0);
        (function step(now) {
          var p = Math.min((now - t0) / D, 1), e = 1 - Math.pow(1 - p, 3);
          if (p >= 1) { shown = target; totalEl.textContent = eur(target); return; }
          shown = from + (target - from) * e; paint(shown, cents); tween = requestAnimationFrame(step);
        })(performance.now());
      }
    };
  }

  /* ---------- toasts ---------- */
  var toaster, toasts = [];
  function ensureToaster() {
    if (toaster) return;
    toaster = el('div', 'pb-toaster'); toaster.setAttribute('aria-hidden', 'true');
    document.body.appendChild(toaster);
    toaster.addEventListener('mouseenter', function () { toasts.forEach(function (t) { clearTimeout(t.timer); }); });
    toaster.addEventListener('mouseleave', function () { toasts.forEach(schedule); });
    // a hidden tab pauses the timers, so a toast is never missed
    document.addEventListener('visibilitychange', function () { toasts.forEach(function (t) { if (document.hidden) clearTimeout(t.timer); else schedule(t); }); });
  }
  function toastLayout() {
    var bar = document.querySelector('.regbar.show');
    toaster.style.bottom = (bar ? bar.offsetHeight + 12 : 20) + 'px';
    var n = toasts.length;
    toasts.forEach(function (t, i) {
      var idx = n - 1 - i, lift = idx * 10, scale = 1 - idx * 0.05;
      t.el.style.transform = 'translateY(-' + lift + 'px) scale(' + scale + ')';
      t.el.style.opacity = '1';
      t.el.style.zIndex = String(i);
    });
  }
  function schedule(t) { clearTimeout(t.timer); t.timer = setTimeout(function () { dismiss(t); }, 2500); }
  function dismiss(t, instant) {
    var i = toasts.indexOf(t); if (i < 0) return;
    toasts.splice(i, 1); clearTimeout(t.timer);
    t.el.classList.add('is-leaving'); t.el.style.opacity = '0'; t.el.style.transform += ' translateY(14px)';
    setTimeout(function () { if (t.el.parentNode) t.el.parentNode.removeChild(t.el); }, instant ? 0 : 220);
    toastLayout();
  }
  function toast(msg, removed) {
    ensureToaster();
    var e = el('div', 'pb-toast' + (removed ? ' is-removed' : ''));
    e.appendChild(el('i')); e.appendChild(el('span', '', msg));
    toaster.appendChild(e);
    var t = { el: e, timer: 0 };
    toasts.push(t);
    while (toasts.length > 3) dismiss(toasts[0], true);
    requestAnimationFrame(function () { requestAnimationFrame(function () { toastLayout(); }); });
    schedule(t);
  }

  /* ---------- drawer (one per page, shared by every builder) ---------- */
  var drawer, scrim, drawerOpen = false, curY = 0, vel = 0, springRAF = 0, dragging = false, returnFocus = null, inerted = [], drCtx = null;
  function setY(y) { curY = y; drawer.style.transform = 'translateY(' + y + 'px)'; }
  function spring(to, done, fast) {
    cancelAnimationFrame(springRAF);
    if (reduce()) { setY(to); if (done) done(); return; }
    var pos = curY, v = vel * 1000, last = performance.now(), k = fast ? 1500 : 900, c = fast ? 77 : 60; // both critically damped; close is stiffer and aims 80 px past the edge so it leaves without a long tail
    (function step(now) {
      var dt = Math.min((now - last) / 1000, 0.05); last = now;
      var n = Math.max(1, Math.ceil(dt * 240)), h = dt / n; // sub-steps: stable on slow frames too
      for (var i = 0; i < n; i++) { v += (-k * (pos - to) - c * v) * h; pos += v * h; }
      setY(pos);
      if (fast ? pos >= to - 80 : (Math.abs(v) < 30 && Math.abs(pos - to) < 0.5)) { if (!fast) setY(to); if (done) done(); return; }
      springRAF = requestAnimationFrame(step);
    })(performance.now());
  }
  function buildDrawer() {
    if (drawer) return;
    scrim = el('div', 'pb-scrim'); scrim.addEventListener('click', closeDrawer);
    drawer = el('div', 'pb-drawer'); drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'pbDrTitle'); drawer.tabIndex = -1;
    drawer.innerHTML = '<div class="pb-grab" aria-hidden="true"></div><div class="pb-dr-head"><h2 class="pb-dr-title" id="pbDrTitle"></h2><button type="button" class="pb-close"></button></div>' +
      '<div class="pb-dr-lines"></div><p class="pb-dr-pass" hidden></p>' +
      '<div class="pb-dr-total"><span class="pb-total-label"></span><span class="n"></span></div>' +
      '<p class="pb-dr-note pb-dr-fail" hidden></p><p class="pb-dr-note pb-dr-main"></p>' +
      '<div class="pb-dr-foot"><a class="pb-go" target="_blank" rel="noopener"></a><button type="button" class="pb-close pb-close-foot" hidden></button></div>';
    document.body.appendChild(scrim); document.body.appendChild(drawer);
    var q = function (s) { return drawer.querySelector(s); };
    q('.pb-dr-title').textContent = S.register; q('.pb-dr-title').tabIndex = -1; q('.pb-total-label').textContent = S.total;
    [].forEach.call(drawer.querySelectorAll('.pb-close'), function (b) { b.textContent = S.close; b.addEventListener('click', closeDrawer); });
    q('.pb-dr-main').textContent = S.finalNote; q('.pb-go').textContent = S.toCheckout;
    setY(window.innerHeight);
    // drag to dismiss (handle + title)
    var startY = 0, lastY = 0, lastT = 0, pid = null;
    function down(e) {
      if (dragging || e.target.closest('a,button')) return; // a second finger never takes over
      dragging = true; pid = e.pointerId; cancelAnimationFrame(springRAF); vel = 0;
      startY = e.clientY - curY; lastY = e.clientY; lastT = performance.now();
      drawer.setPointerCapture && drawer.setPointerCapture(e.pointerId);
    }
    function move(e) {
      if (!dragging || e.pointerId !== pid) return;
      var ny = e.clientY - startY; if (ny < 0) ny = ny / 4;
      setY(ny);
      var now = performance.now(); vel = (e.clientY - lastY) / (now - lastT || 16); lastY = e.clientY; lastT = now;
    }
    function up(e) {
      if (!dragging || e.pointerId !== pid) return; dragging = false; pid = null;
      if (curY > drawer.offsetHeight * 0.4 || vel > 0.11) closeDrawer(); else spring(0);
    }
    var grab = q('.pb-grab'), title = q('.pb-dr-head');
    [grab, title].forEach(function (h) { h.style.touchAction = 'none'; h.addEventListener('pointerdown', down); });
    drawer.addEventListener('pointermove', move); drawer.addEventListener('pointerup', up); drawer.addEventListener('pointercancel', up);
    document.addEventListener('keydown', function (e) {
      if (!drawerOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); }
      else if (e.key === 'Tab') {
        var f = [].slice.call(drawer.querySelectorAll('a[href],button:not([disabled])')).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) { e.preventDefault(); drawer.focus(); return; }
        var first = f[0], last = f[f.length - 1];
        if (!drawer.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === drawer.querySelector('.pb-dr-title')) { e.preventDefault(); last.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }
  function cents(n) { return Math.round(n * 100); }
  function minus(n) { return '\u2212' + eur(n); }
  /* inline mode: the price breakdown. Every number is read from the app's quote; the lines only repeat what it says. */
  function fillInline(ctx) {
    var q = function (s) { return drawer.querySelector(s); };
    var d = ctx.data(), qd = d.quote, list = d.sessions, lines = q('.pb-dr-lines');
    var byS = {}; if (qd) (qd.items || []).forEach(function (it) { byS[it.serial] = it; });
    var memberOff = 0;
    if (qd && qd.basis === 'member') (qd.items || []).forEach(function (it) { var v = typeof it.payable === 'number' ? it.payable : it.member_price; if (typeof v === 'number' && v < it.price) memberOff += cents(it.price) - cents(v); });
    var passOff = (qd && qd.applied_pass && qd.saving > 0) ? cents(qd.saving) : 0;
    var listSum = 0; list.forEach(function (s) { var it = byS[s.serial]; listSum += cents(it && typeof it.price === 'number' ? it.price : s.price); });
    // a breakdown that does not add up to the total is never shown: treat the quote as unavailable
    var ok = !!qd && !d.failed && listSum - memberOff - passOff === cents(qd.total);
    var sig = [d.href, ok ? qd.total : 'x', memberOff, passOff].join('|');
    if (ctx.sig === sig && lines.childNodes.length) return; ctx.sig = sig;
    lines.textContent = '';
    list.forEach(function (s) {
      var it = byS[s.serial], row = el('div', 'pb-dr-line'), left = el('span');
      left.appendChild(document.createTextNode(ctx.label(s))); left.appendChild(el('small', '', ctx.when(s)));
      row.appendChild(left); row.appendChild(el('span', 'pr', eur(ok && it && typeof it.price === 'number' ? it.price : s.price)));
      lines.appendChild(row);
    });
    var i = 0;
    function disc(label, off) {
      var row = el('div', 'pb-dr-line pb-dr-disc'); row.style.setProperty('--i', String(i++));
      row.appendChild(el('span', '', label)); row.appendChild(el('span', 'pr', '\u2212' + eur(off / 100)));
      row.setAttribute('data-kind', 'discount'); lines.appendChild(row);
    }
    if (ok && memberOff > 0) { disc(S.memberLine, memberOff); lines.lastChild.setAttribute('data-line', 'member'); }
    if (ok && passOff > 0) { disc(fill(S.passLine, { pass: ctx.passLabel(qd.applied_pass) }), passOff); lines.lastChild.setAttribute('data-line', 'pass'); }
    q('.pb-dr-total').hidden = !ok; q('.n').textContent = ok ? eur(qd.total) : '';
    q('.pb-dr-fail').hidden = ok; q('.pb-dr-fail').textContent = ok ? '' : S.quoteFailed;
    q('.pb-dr-main').textContent = S.payLine;
    q('.pb-dr-pass').hidden = true; q('.pb-dr-pass').textContent = '';
    q('.pb-go').setAttribute('href', d.href); q('.pb-go').removeAttribute('target'); q('.pb-go').removeAttribute('rel');
  }
  function fillDrawer(ctx) {
    var q = function (s) { return drawer.querySelector(s); };
    drawer.setAttribute('data-kind', ctx.inline ? 'inline' : 'cards');
    q('.pb-dr-title').textContent = ctx.inline ? S.yourSelection : S.register;
    q('.pb-dr-head .pb-close').hidden = !!ctx.inline; q('.pb-close-foot').hidden = !ctx.inline;
    q('.pb-dr-total').hidden = false; q('.pb-dr-fail').hidden = true;
    if (ctx.inline) return fillInline(ctx);
    q('.pb-go').setAttribute('target', '_blank'); q('.pb-go').setAttribute('rel', 'noopener');
    var lines = q('.pb-dr-lines'); lines.textContent = '';
    ctx.selectedSessions().forEach(function (s) {
      var row = el('div', 'pb-dr-line'), left = el('span');
      left.appendChild(document.createTextNode(nm(s))); left.appendChild(el('small', '', ctx.when(s)));
      row.appendChild(left); row.appendChild(el('span', 'pr', eur(ctx.member ? s.member_price : s.price)));
      lines.appendChild(row);
    });
    var pass = q('.pb-dr-pass'), qd = ctx.quote;
    if (qd && qd.applied_pass && qd.saving > 0) { pass.hidden = false; pass.textContent = fill(S.passApplied, { pass: nm(qd.applied_pass), saving: num(qd.saving) }); }
    else { pass.hidden = true; pass.textContent = ''; }
    q('.n').textContent = qd ? eur(qd.total) : '';
    q('.pb-dr-main').textContent = qd ? S.finalNote : S.quoteFailed;
    q('.pb-go').setAttribute('href', ctx.href());
  }
  function setInert(on) {
    if (on) {
      inerted = [].slice.call(document.body.children).filter(function (n) { return n !== drawer && n !== scrim && n !== toaster && n.tagName !== 'SCRIPT' && !n.inert; });
      inerted.forEach(function (n) { n.inert = true; });
    } else { inerted.forEach(function (n) { n.inert = false; }); inerted = []; }
  }
  function openDrawer(ctx, trigger) {
    buildDrawer(); drCtx = ctx; fillDrawer(ctx);
    returnFocus = trigger; drawerOpen = true;
    var root = document.documentElement, main = document.querySelector('main');
    var gutter = window.innerWidth - root.clientWidth;
    if (gutter > 0) root.style.paddingRight = gutter + 'px';
    if (main) { main.style.transformOrigin = 'center ' + (window.scrollY + window.innerHeight / 2) + 'px'; main.classList.remove('pb-closing'); main.classList.add('pb-scaling'); }
    root.classList.add('pb-open');
    drawer.classList.add('show'); scrim.classList.add('show');
    var h = drawer.offsetHeight; setY(h);
    requestAnimationFrame(function () { spring(0); });
    setInert(true);
    // inline: focus the heading (the dialog's name); default mode: the link
    (ctx.inline ? drawer.querySelector('.pb-dr-title') : drawer.querySelector('.pb-go')).focus({ preventScroll: true });
  }
  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false; drCtx = null;
    setInert(false);
    scrim.classList.remove('show');
    var root = document.documentElement, main = document.querySelector('main');
    root.classList.remove('pb-open');
    spring(drawer.offsetHeight + 80, function () { drawer.classList.remove('show'); root.style.paddingRight = ''; }, true);
    if (main) { main.classList.add('pb-closing'); setTimeout(function () { if (!drawerOpen) { main.classList.remove('pb-scaling', 'pb-closing'); main.style.transformOrigin = ''; } }, 330); }
    if (returnFocus) returnFocus.focus({ preventScroll: true });
  }

  /* ---------- the builder, default mode (card list + drawer + toasts) ---------- */
  function mount(host, cat) {
    var slug = host.getAttribute('data-event'), api = host.getAttribute('data-api').replace(/\/$/, ''), app = (host.getAttribute('data-app') || '').replace(/\/$/, '');
    var sessions = cat.sessions.slice().sort(function (a, b) { return startKey(a).localeCompare(startKey(b)); });
    var selected = {}, member = false, quote = null, quoteFailed = false, debounce = 0, qctl = null, seq = 0;

    var dateFmt = new Intl.DateTimeFormat(LANG === 'nl' ? 'nl-BE' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    function when(s) { return whenOf(dateFmt, s); }
    function chosen() { return sessions.filter(function (s) { return selected[s.serial]; }); }
    function href() { return app + '/register/event/' + encodeURIComponent(slug) + '?items=' + chosen().map(function (s) { return encodeURIComponent(s.serial); }).join(','); }

    // the member condition is the page's own sentence, never ours (D-092 + D-094)
    var notesSrc = document.querySelector('#pricing .price-notes'), condText = '', restNode = null;
    if (notesSrc) {
      restNode = notesSrc.cloneNode(true);
      var tn = restNode.firstChild;
      if (tn && tn.nodeType === 3) {
        var m = tn.nodeValue.match(/^([\s\S]*?[.!?])\s+([\s\S]*)$/);
        if (m) { condText = m[1].trim(); tn.nodeValue = m[2]; } else { condText = tn.nodeValue.trim(); tn.nodeValue = ''; }
      }
    }

    host.textContent = '';
    var cards = {};
    host.appendChild(el('p', 'pb-hint', S.hint));
    var list = el('div', 'pb-list'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', S.hint);
    sessions.forEach(function (s) {
      var b = el('button', 'pb-card'); b.type = 'button'; b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', 'false');
      b.setAttribute('data-serial', s.serial);
      var box = el('span', 'pb-box'); box.innerHTML = CHECK;
      var mid = el('span'); mid.appendChild(el('span', 'pb-when', when(s))); mid.appendChild(el('span', 'pb-name', nm(s)));
      if (s.partner_compulsory) mid.appendChild(el('span', 'pb-sub', S.partner));
      var price = el('span', 'pb-price');
      b.appendChild(box); b.appendChild(mid); b.appendChild(price);
      if (s.available === false) { b.disabled = true; price.textContent = S.full; }
      else b.addEventListener('click', function () { toggle(s); });
      cards[s.serial] = { b: b, price: price };
      list.appendChild(b);
    });
    host.appendChild(list);

    var mem = el('label', 'pb-member'); var cb = el('input'); cb.type = 'checkbox'; cb.name = 'member';
    mem.appendChild(cb); mem.appendChild(el('span', 'pb-m-label', S.member));
    if (condText) mem.appendChild(el('span', 'pb-cond', condText));
    // default mode has no Shoonya ID field, and the server prices only by ID: no member checkbox here (member pricing lives in inline mode)

    var sum = el('div', 'pb-summary');
    var row = el('div', 'pb-total-row'); row.appendChild(el('span', 'pb-total-label', S.total));
    var totalEl = el('span', 'pb-total-num'); totalEl.setAttribute('data-empty', '1'); totalEl.setAttribute('aria-hidden', 'true');
    row.appendChild(totalEl); sum.appendChild(row);
    var counter = makeCounter(totalEl);
    var noteEl = el('p', 'pb-total-note', S.empty); sum.appendChild(noteEl);
    var live = el('span', 'pb-sr'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true'); sum.appendChild(live);
    var reg = el('button', 'pb-register', S.register); reg.type = 'button'; reg.disabled = true; sum.appendChild(reg);
    host.appendChild(sum);
    if (restNode && restNode.textContent.trim()) { restNode.className = 'pb-notes'; host.appendChild(restNode); }

    function refreshPrices() {
      sessions.forEach(function (s) { if (s.available !== false) cards[s.serial].price.textContent = eur(member ? s.member_price : s.price); });
    }
    function render() {
      var n = chosen().length;
      reg.disabled = n === 0;
      if (n === 0) {
        counter.clear();
        noteEl.textContent = S.empty; noteEl.className = 'pb-total-note'; live.textContent = S.empty; sum.setAttribute('data-state', 'empty');
        return;
      }
      if (quoteFailed || !quote) {
        if (!quoteFailed) { noteEl.textContent = ''; noteEl.className = 'pb-total-note'; }
        else { counter.clear(); noteEl.textContent = S.quoteFailed; noteEl.className = 'pb-total-note'; live.textContent = S.quoteFailed; sum.setAttribute('data-state', 'failed'); }
        return;
      }
      counter.set(quote.total);
      totalEl.setAttribute('data-value', String(quote.total));
      if (quote.applied_pass && quote.saving > 0) {
        noteEl.textContent = fill(S.passApplied, { pass: nm(quote.applied_pass), saving: num(quote.saving) }); noteEl.className = 'pb-total-note is-pass';
      } else { noteEl.textContent = ''; noteEl.className = 'pb-total-note'; }
      live.textContent = S.total + ' ' + eur(quote.total) + (noteEl.textContent ? '. ' + noteEl.textContent : '');
      sum.setAttribute('data-state', 'idle');
    }
    function requestQuote() {
      clearTimeout(debounce);
      if (!chosen().length) { if (qctl) qctl.abort(); sum.removeAttribute('data-busy'); quote = null; quoteFailed = false; render(); return; }
      sum.setAttribute('data-busy', '1'); sum.setAttribute('data-state', 'busy');
      debounce = setTimeout(function () {
        if (qctl) qctl.abort();
        var my = ++seq; qctl = new AbortController();
        fetchJSON(quoteURL(api, slug), TIMEOUT, qctl, quoteBody(chosen(), '')).then(function (q) {
          if (my !== seq) return;
          if (!q || typeof q.total !== 'number') throw new Error('bad quote');
          quote = q; quoteFailed = false; sum.removeAttribute('data-busy'); render(); if (drCtx) fillDrawer(ctx);
        }).catch(function () {
          if (my !== seq) return;
          quote = null; quoteFailed = true; sum.removeAttribute('data-busy'); render(); if (drCtx) fillDrawer(ctx);
        });
      }, 150);
    }
    function toggle(s) {
      var on = !selected[s.serial];
      if (on) selected[s.serial] = true; else delete selected[s.serial];
      cards[s.serial].b.setAttribute('aria-checked', on ? 'true' : 'false');
      toast(fill(on ? S.added : S.removed, { name: nm(s) }), !on);
      requestQuote();
    }
    cb.addEventListener('change', function () { member = cb.checked; refreshPrices(); requestQuote(); });
    var ctx = {
      get member() { return member; }, get quote() { return quote; },
      selectedSessions: chosen, when: when, href: href
    };
    reg.addEventListener('click', function () { if (chosen().length) openDrawer(ctx, reg); });
    refreshPrices();
  }

  /* ---------- the builder, inline mode ---------- */
  function mountInline(host, cat) {
    var slug = host.getAttribute('data-event'), api = host.getAttribute('data-api').replace(/\/$/, ''), app = (host.getAttribute('data-app') || '').replace(/\/$/, '');
    var sessions = cat.sessions.slice().sort(function (a, b) { return startKey(a).localeCompare(startKey(b)); });
    var bySerial = {}; sessions.forEach(function (s) { bySerial[s.serial] = s; });
    function plain(t) { return String(t || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
    // match every session to a page row BEFORE touching the DOM; any miss = leave the page exactly as it is
    var rowsRoot = document.querySelector(host.getAttribute('data-rows') || '#none');
    if (!rowsRoot) throw new Error('rows not found');
    var rowEls = [].slice.call(rowsRoot.querySelectorAll('.prow')), rowOf = {};
    function rowName(r) { var n = r.querySelector('.s-name'); if (!n) return ''; var c = n.cloneNode(true); [].slice.call(c.querySelectorAll('.badge')).forEach(function (b) { b.remove(); }); return c.textContent.replace(/\s+/g, ' ').trim(); }
    var claimed = [];
    sessions.forEach(function (s, idx) {
      var want = [s.name, s.name_nl].filter(Boolean).map(plain);
      var r = rowEls.filter(function (r) { return want.indexOf(plain(rowName(r))) >= 0; })[0];
      // name_nl is null in the app: a Dutch page row will not match the English name, so fall back to the row at the same place in the day/time order
      if (!r && rowEls.length === sessions.length && claimed.indexOf(rowEls[idx]) < 0 && sessions.every(function (x) { return !x.name_nl; })) r = rowEls[idx];
      if (r) claimed.push(r);
      if (!r || !r.querySelector('.prow-main') || !r.querySelector('.prow-detail') || !r.querySelector('.s-price') || !r.querySelector('.s-name') || !r.querySelector('.s-day')) throw new Error('row for ' + s.serial);
      rowOf[s.serial] = r;
    });
    // names shown in the drawer are the page's own (always in the page language, whatever the app sends)
    var labelOf = {}; sessions.forEach(function (s) { labelOf[s.serial] = rowName(rowOf[s.serial]) || nm(s); });

    var dateFmt = new Intl.DateTimeFormat(LANG === 'nl' ? 'nl-BE' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    function when(s) { return whenOf(dateFmt, s).replace(',', ''); }
    function avail(s) { return s.available !== false; }

    // passes: identified by key, else by the SET of sessions they cover (never by display name)
    function passKind(p) {
      if (p.key) return p.key;
      var cov = p.covered || [];
      if (cov.length === sessions.length) return 'weekend';
      var dates = {}; cov.forEach(function (c) { if (bySerial[c]) dates[bySerial[c].date] = 1; });
      var ds = Object.keys(dates);
      if (ds.length === 1) { var d = new Date(ds[0] + 'T12:00:00').getDay(); return d === 6 ? 'saturday' : d === 0 ? 'sunday' : null; }
      return null;
    }
    var passes = (cat.passes || []).filter(function (p) { return p.covered && p.covered.length && p.covered.every(function (c) { return bySerial[c]; }); })
      .map(function (p) {
        var kind = passKind(p), lbl = kind === 'saturday' ? S.chipSaturday : kind === 'sunday' ? S.chipSunday : kind === 'weekend' ? S.chipWeekend : nm(p);
        return { p: p, label: lbl, covered: p.covered, ok: p.available !== false && p.covered.every(function (c) { return avail(bySerial[c]); }) };
      }).sort(function (a, b) { return a.covered.length - b.covered.length || bySerial[a.covered[0]].date.localeCompare(bySerial[b.covered[0]].date); });

    // pass names in the page language: the app's name_nl is null, so read the page's own price table (last rows, same order as the sorted passes)
    var tableRows = [].slice.call(document.querySelectorAll('#pricing .price-row .nm'));
    function passName(x) {
      var i = passes.indexOf(x), t = tableRows.length === sessions.length + passes.length ? tableRows[sessions.length + i] : null;
      return (LANG === 'nl' && !x.p.name_nl && t) ? t.textContent.trim() : nm(x.p);
    }
    function appliedName(ap) {
      var cov = (ap.covered || []).slice().sort().join(), hit = passes.filter(function (x) { return x.covered.slice().sort().join() === cov; })[0];
      return hit ? passName(hit) : nm(ap);
    }

    // links taken from the page itself
    var contactA = document.querySelector('#pricing .price-notes a, .price-notes a');
    var sidA = document.querySelector('[data-sid][href]');
    var carry = [].slice.call(document.querySelectorAll('[data-reg]')).filter(function (a) { return !a.closest('.cta-card'); });
    var barPrice = document.querySelector('#regbar .regbar-price'), barPriceOrig = barPrice ? barPrice.textContent : '';

    var selected = {}, idRaw = '', basis = null, memberItem = {}, quote = null, quoteKey = '', quoteFailed = false, debounce = 0, idDebounce = 0, qctl = null, pctl = null, seq = 0, idGen = 0;
    function chosen() { return sessions.filter(function (s) { return selected[s.serial]; }); }
    function idParam() { return idRaw.trim() ? '&shoonya_id=' + encodeURIComponent(idRaw) : ''; }
    function itemsOf(list) { return list.map(function (s) { return encodeURIComponent(s.serial); }).join(','); }
    function href() { return app + '/register/event/' + encodeURIComponent(slug) + '?items=' + itemsOf(chosen()) + idParam(); }
    function keyNow() { return itemsOf(chosen()) + '|' + idRaw; }

    /* ---- rows ---- */
    var ui = {};
    rowsRoot.setAttribute('role', 'group'); rowsRoot.setAttribute('aria-label', S.hint);
    sessions.forEach(function (s) {
      var row = rowOf[s.serial], main = row.querySelector('.prow-main'), detail = row.querySelector('.prow-detail');
      var nameEl = row.querySelector('.s-name'), priceEl = row.querySelector('.s-price'), dayEl = row.querySelector('.s-day');
      var textDiv = nameEl.parentNode, thumb = main.querySelector('.thumb'), numEl = main.querySelector('.num'), oldChev = main.querySelector('.chev');
      var nid = 'pbn-' + s.serial, pid = 'pbp-' + s.serial, did = 'pbd-' + s.serial, wid = 'pbw-' + s.serial;
      nameEl.id = nid; priceEl.id = pid; dayEl.id = wid; detail.id = did; row.setAttribute('data-pb', '1'); row.setAttribute('data-serial', s.serial);
      var wt = when(s), wcut = wt.lastIndexOf(' · '); dayEl.textContent = wcut < 0 ? wt : wt.slice(0, wcut + 3);
      if (wcut >= 0) dayEl.appendChild(el('span', 'pb-time', wt.slice(wcut + 3))); // the time range never breaks at the dash
      // the row control: tick box + thumbnail + text + price, one checkbox
      var pick = el('div', 'pb-pick'); pick.setAttribute('role', 'checkbox'); pick.setAttribute('aria-checked', 'false'); pick.tabIndex = 0;
      pick.setAttribute('data-serial', s.serial); pick.setAttribute('aria-labelledby', nid + ' ' + wid + ' ' + pid);
      var box = el('span', 'pb-box'); box.innerHTML = CHECK; var tick = el('span', 'pb-tick'); tick.appendChild(box);
      pick.appendChild(tick); if (thumb) pick.appendChild(thumb); pick.appendChild(textDiv); pick.appendChild(priceEl);
      if (numEl) numEl.remove(); if (oldChev) oldChev.remove();
      main.appendChild(pick);
      var det = el('button', 'pb-details', S.details); det.type = 'button'; det.setAttribute('aria-expanded', 'false'); det.setAttribute('aria-controls', did);
      det.setAttribute('aria-labelledby', 'pbdb-' + s.serial + ' ' + nid); det.id = 'pbdb-' + s.serial;
      main.appendChild(det);
      detail.inert = true;
      if (s.partner_compulsory) textDiv.appendChild(el('div', 'pb-sub', S.partner));
      var passNote = null;
      if (!avail(s)) {
        pick.setAttribute('aria-disabled', 'true'); pick.tabIndex = -1; row.setAttribute('data-soldout', '1'); priceEl.textContent = S.full; priceEl.classList.add('pb-full');
        var hit = passes.filter(function (x) { return x.covered.indexOf(s.serial) >= 0; });
        if (hit.length) { passNote = el('div', 'pb-sub pb-passgone', fill(S.soldPass, { passes: hit.map(function (x) { return passName(x); }).join(', ') })); textDiv.appendChild(passNote); }
      }
      ui[s.serial] = { pick: pick, price: priceEl, row: row, det: det, detail: detail };
      // one capture listener owns every click in the row, so the page's own toggle on .prow-main never double-fires
      row.addEventListener('click', function (e) {
        if (!main.contains(e.target)) return;
        e.stopPropagation();
        if (e.target.closest('.pb-details')) { var o = row.classList.toggle('open'); det.setAttribute('aria-expanded', o ? 'true' : 'false'); detail.inert = !o; return; }
        if (e.target.closest('.pb-pick')) toggle(s);
      }, true);
      pick.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(s); } });
    });

    /* ---- block ---- */
    host.textContent = '';
    var taught = host.getAttribute('data-taught') === 'en' ? el('p', 'pb-taught', S.taught) : null;
    if (taught) host.appendChild(taught);
    var chipBox = null, chips = [];
    if (passes.length) {
      chipBox = el('div', 'pb-chips'); chipBox.setAttribute('role', 'group'); chipBox.setAttribute('aria-label', S.passesAria);
      passes.forEach(function (x) {
        var b = el('button', 'pb-chip'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
        b.appendChild(el('span', 'pb-chip-l', x.label)); b.appendChild(el('span', 'pb-chip-p', eur(x.p.price)));
        b.appendChild(el('span', 'pb-chip-m', fill(S.membersPrice, { price: num(x.p.member_price) })));
        if (!x.ok) { b.disabled = true; }
        b.addEventListener('click', function () {
          var all = x.covered.every(function (c) { return selected[c]; });
          x.covered.forEach(function (c) { if (all) delete selected[c]; else selected[c] = true; });
          changed();
        });
        chips.push({ b: b, x: x }); chipBox.appendChild(b);
      });
      host.appendChild(chipBox);
      host.appendChild(el('p', 'pb-cond', S.cond));
    }
    var idWrap = el('div', 'pb-idbox');
    var idLbl = el('label', 'pb-idlabel', S.idLabel); idLbl.setAttribute('for', 'pbId');
    var idIn = el('input', 'pb-id'); idIn.id = 'pbId'; idIn.type = 'text'; idIn.name = 'shoonya_id'; idIn.setAttribute('inputmode', 'numeric');
    idIn.setAttribute('autocomplete', 'off'); idIn.setAttribute('autocapitalize', 'off'); idIn.setAttribute('spellcheck', 'false'); idIn.setAttribute('aria-describedby', 'pbIdOut');
    var idOut = el('p', 'pb-id-out'); idOut.id = 'pbIdOut'; idOut.setAttribute('aria-live', 'polite');
    var idClr = el('button', 'pb-id-clear', S.idClear); idClr.type = 'button'; idClr.hidden = true;
    idWrap.appendChild(idLbl); idWrap.appendChild(idIn); idWrap.appendChild(idOut); idWrap.appendChild(idClr); host.appendChild(idWrap);
    // the ID is remembered on this device only (every workshop page shares it); it leaves the browser only inside a quote
    var ID_KEY = 'sdc_shoonya_id';
    function idStore(v) { try { if (v) localStorage.setItem(ID_KEY, v); else localStorage.removeItem(ID_KEY); } catch (e) {} }
    idClr.addEventListener('click', function () { idStore(''); idIn.value = ''; idIn.dispatchEvent(new Event('input')); idIn.focus(); });

    var sum = el('div', 'pb-summary');
    var trow = el('div', 'pb-total-row'); trow.appendChild(el('span', 'pb-total-label', S.total));
    var totalEl = el('span', 'pb-total-num'); totalEl.setAttribute('data-empty', '1'); totalEl.setAttribute('aria-hidden', 'true');
    trow.appendChild(totalEl); sum.appendChild(trow);
    var counter = makeCounter(totalEl);
    var noteEl = el('p', 'pb-total-note', S.empty); sum.appendChild(noteEl);
    var live = el('span', 'pb-sr'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true'); sum.appendChild(live);
    var reg = el('a', 'pb-register', S.registerInline); reg.setAttribute('aria-disabled', 'true'); sum.appendChild(reg);
    sum.appendChild(el('p', 'pb-line pb-pay', S.payLine));
    sum.appendChild(el('p', 'pb-line pb-final', S.finalLine));
    var refund = el('p', 'pb-line pb-refund'); refund.appendChild(document.createTextNode(S.noRefund));
    if (contactA) { var ca = el('a', '', contactA.textContent.trim()); ca.setAttribute('href', contactA.getAttribute('href')); refund.appendChild(ca); refund.appendChild(document.createTextNode('.')); }
    sum.appendChild(refund);
    var needId = el('p', 'pb-line pb-needid'); needId.appendChild(document.createTextNode(S.needId));
    if (sidA) { var sa = el('a', '', S.needIdLink); sa.setAttribute('href', sidA.getAttribute('href')); sa.setAttribute('target', '_blank'); sa.setAttribute('rel', 'noopener'); needId.appendChild(sa); needId.appendChild(document.createTextNode('.')); }
    else needId.textContent = '';
    if (needId.textContent) sum.appendChild(needId);
    host.appendChild(sum);

    /* ---- the price breakdown (drawer) ---- */
    function openSummary(trigger) {
      var ctx = { inline: true, when: when, label: function (s) { return labelOf[s.serial]; }, passLabel: appliedName, data: function () { return { sessions: chosen(), quote: currentQuote(), failed: quoteFailed, href: href() }; } };
      openDrawer(ctx, trigger);
    }
    // a plain click opens the breakdown; modified clicks, middle click and no-JS keep the real href
    function plainClick(e) { return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented; }

    /* ---- render ---- */
    function memberShown(s) { return basis === 'member' && memberItem[s.serial] != null && memberItem[s.serial] < s.price; }
    function renderPrices() {
      sessions.forEach(function (s) {
        if (!avail(s)) return;
        var p = ui[s.serial].price; p.textContent = '';
        if (memberShown(s)) { p.appendChild(el('span', 'pb-now', eur(memberItem[s.serial]))); var w = el('s', 'pb-was', eur(s.price)); p.appendChild(w); }
        else p.textContent = eur(s.price);
      });
    }
    function sessionsWord(n) { return fill(n === 1 ? S.session1 : S.sessionN, { n: n }); }
    function currentQuote() { return quote && quoteKey === keyNow() ? quote : null; }
    function render() {
      var list = chosen(), n = list.length, q = currentQuote();
      sessions.forEach(function (s) {
        var on = !!selected[s.serial], u = ui[s.serial];
        u.pick.setAttribute('aria-checked', on ? 'true' : 'false');
        if (on) u.row.setAttribute('data-selected', '1'); else u.row.removeAttribute('data-selected');
      });
      chips.forEach(function (c) { c.b.setAttribute('aria-pressed', c.x.ok && c.x.covered.every(function (k) { return selected[k]; }) ? 'true' : 'false'); });
      renderPrices();
      idOut.textContent = basis === 'member' ? S.idMember : basis === 'none' ? S.idNone : '';
      var label = S.registerInline;
      if (n === 0) {
        counter.clear(); noteEl.textContent = S.empty; noteEl.className = 'pb-total-note'; live.textContent = S.empty; sum.setAttribute('data-state', 'empty');
        reg.removeAttribute('href'); reg.setAttribute('aria-disabled', 'true');
      } else {
        reg.setAttribute('href', href()); reg.removeAttribute('aria-disabled');
        if (quoteFailed) {
          counter.clear(); noteEl.textContent = S.quoteFailed; noteEl.className = 'pb-total-note'; live.textContent = S.quoteFailed; sum.setAttribute('data-state', 'failed');
        } else if (q) {
          counter.set(q.total); totalEl.setAttribute('data-value', String(q.total));
          if (q.applied_pass && q.saving > 0) { noteEl.textContent = fill(S.passApplied, { pass: appliedName(q.applied_pass), saving: num(q.saving) }); noteEl.className = 'pb-total-note is-pass'; }
          else { noteEl.textContent = ''; noteEl.className = 'pb-total-note'; }
          live.textContent = S.total + ' ' + eur(q.total) + (noteEl.textContent ? '. ' + noteEl.textContent : '');
          label = fill(S.registerTotal, { total: num(q.total) }); sum.setAttribute('data-state', 'idle');
        } else { noteEl.textContent = ''; noteEl.className = 'pb-total-note'; }
      }
      reg.textContent = label;
      // nav + sticky bar: #programme when nothing is selected, the selection when something is
      carry.forEach(function (a) { a.setAttribute('href', n ? href() : '#programme'); a.removeAttribute('target'); a.removeAttribute('rel'); });
      if (drawerOpen && drCtx && drCtx.inline) fillDrawer(drCtx); // a quote that lands while the breakdown is open fills it in
      if (barPrice) barPrice.textContent = n ? (q ? eur(q.total) + ' · ' : '') + sessionsWord(n) : barPriceOrig;
    }

    reg.addEventListener('click', function (e) {
      if (reg.getAttribute('aria-disabled') === 'true' || !chosen().length || !plainClick(e)) return;
      e.preventDefault(); openSummary(reg);
    });
    carry.forEach(function (a) {
      a.addEventListener('click', function (e) { if (!chosen().length || !plainClick(e)) return; e.preventDefault(); openSummary(a); });
    });

    /* ---- quotes: the app decides ---- */
    function takeBasis(q, gen) {
      if (gen !== idGen || !idRaw.trim()) return;
      if (q.basis === 'member' || q.basis === 'none' || q.basis === 'unknown') basis = q.basis; else basis = 'unknown';
      if (basis === 'member' || basis === 'none') idStore(idRaw.trim()); // only an ID the app answered for
      if (basis === 'member') (q.items || []).forEach(function (it) { var v = typeof it.payable === 'number' ? it.payable : it.member_price; if (typeof v === 'number') memberItem[it.serial] = v; });
      else memberItem = {};
    }
    function requestQuote() {
      clearTimeout(debounce);
      if (!chosen().length) { if (qctl) qctl.abort(); sum.removeAttribute('data-busy'); quote = null; quoteFailed = false; render(); return; }
      sum.setAttribute('data-busy', '1'); sum.setAttribute('data-state', 'busy');
      debounce = setTimeout(function () {
        if (qctl) qctl.abort();
        var my = ++seq, gen = idGen, key = keyNow(); qctl = new AbortController();
        fetchJSON(quoteURL(api, slug), TIMEOUT, qctl, quoteBody(chosen(), idRaw)).then(function (q) {
          if (my !== seq) return;
          if (!q || typeof q.total !== 'number') throw new Error('bad quote');
          quote = q; quoteKey = key; quoteFailed = false; sum.removeAttribute('data-busy'); takeBasis(q, gen); render();
        }).catch(function () {
          if (my !== seq) return;
          quote = null; quoteFailed = true; sum.removeAttribute('data-busy'); render();
        });
      }, 150);
    }
    // a price probe: all open sessions, only to learn the basis and each row's price for this ID (its total is never shown)
    function requestProbe() {
      if (pctl) pctl.abort();
      if (!idRaw.trim()) return;
      var gen = idGen; pctl = new AbortController();
      var open = sessions.filter(avail);
      fetchJSON(quoteURL(api, slug), TIMEOUT, pctl, quoteBody(open, idRaw)).then(function (q) {
        if (gen !== idGen || !q || typeof q.total !== 'number') return;
        takeBasis(q, gen); render();
      }).catch(function () {});
    }
    function changed() { render(); requestQuote(); }
    function toggle(s) {
      if (!avail(s)) return;
      if (selected[s.serial]) delete selected[s.serial]; else selected[s.serial] = true;
      changed();
    }
    idIn.addEventListener('input', function () {
      idRaw = idIn.value; idGen++; basis = null; memberItem = {};          // nothing member-priced until the app confirms THIS id
      idClr.hidden = !idRaw.trim(); if (!idRaw.trim()) idStore('');
      if (pctl) pctl.abort(); clearTimeout(idDebounce);
      render();
      if (chosen().length) { sum.setAttribute('data-busy', '1'); }
      idDebounce = setTimeout(function () { requestProbe(); requestQuote(); }, 400);
    });
    render();
    var kept = ''; try { kept = localStorage.getItem(ID_KEY) || ''; } catch (e) {}
    if (kept) { idIn.value = kept; idIn.dispatchEvent(new Event('input')); }
  }

  function init() {
    [].slice.call(document.querySelectorAll('.pass-builder[data-event][data-api]')).forEach(function (host) {
      var slug = host.getAttribute('data-event'), api = host.getAttribute('data-api').replace(/\/$/, '');
      fetchJSON(api + '/api/events/' + encodeURIComponent(slug) + '/catalogue', CAT_TIMEOUT).then(function (cat) {
        if (!cat || !cat.sessions || !cat.sessions.length) throw new Error('empty catalogue');
        if (cat.builder && cat.builder.enabled === false) throw new Error('builder disabled'); // the app says no: the page stays exactly as it is
        var inline = host.getAttribute('data-mode') === 'inline';
        if (inline) {
          mountInline(host, cat);
          // merged section: the programme heading becomes the pricing heading (same page markup); the lede's last sentence ("tap to read more") becomes the new lede
          var rowsRoot = document.querySelector(host.getAttribute('data-rows')), sec = rowsRoot && rowsRoot.closest('section');
          var ph = sec && sec.querySelector('.sec-head'), pricing = document.querySelector('#pricing'), th = pricing && pricing.querySelector('.sec-head');
          if (ph && th) ph.innerHTML = th.innerHTML;
          var lede = sec && sec.querySelector('.lede');
          if (lede) lede.textContent = S.lede; // level is on the badge and in the FAQ; the lede explains the control only
          // the leftover "Ready to register?" card, the static table and the pricing nav link all go: the merged list holds everything
          if (pricing) pricing.classList.add('pb-replaced');
          [].forEach.call(document.querySelectorAll('a[href="#pricing"]'), function (a) { a.classList.add('pb-replaced'); });
        } else {
          var grid = host.parentNode.querySelector('.price-grid') || document.querySelector('#pricing .price-grid');
          var table = grid && grid.firstElementChild;
          mount(host, cat);
          if (grid && table) { grid.insertBefore(host, grid.firstChild); table.classList.add('pb-replaced');
            var cta = grid.querySelector('.cta-card [data-reg]'); if (cta) cta.classList.add('pb-replaced');
            var blurb = grid.querySelector('.cta-card p:not(.cap):not(.idline):not(.addr)'); if (blurb) blurb.classList.add('pb-replaced'); }
        }
        host.setAttribute('data-ready', '1');
      }).catch(function () { host.textContent = ''; /* leave the static table exactly as it is */ });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
