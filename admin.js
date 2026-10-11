// מסך הניהול. דף אחד, בלי ספריות. כל הנתונים נטענים בכניסה, וכל שינוי טוען אותם מחדש.

(() => {
  const TA = T.admin;
  const STOCK_TYPES = ['hub', 'container'];

  // ---------- עזרים ----------
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
  const num = n => Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
  const norm = s => String(s || '').toLowerCase().replace(/["'״׳`]/g, '').replace(/\s+/g, ' ').trim();
  const svg = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  const ICON = {
    leaf: svg('<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-7 10-9"/>'),
    home: svg('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>'),
    stock: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    items: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    orders: svg('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11L21 7H7"/>'),
    projects: svg('<path d="M4 21V5l8-3 8 3v16"/><path d="M9 21v-5h6v5"/>'),
    reports: svg('<path d="M5 20V12M12 20V5M19 20v-9"/>'),
    lists: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
    archive: svg('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/>'),
    menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    file: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>'),
    open: svg('<path d="M6 9l6 6 6-6"/>'),
    closed: svg('<path d="M15 6l-6 6 6 6"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  };

  // ---------- מצב ----------
  const A = {
    session: window.DEMO_SESSION || (() => { try { return localStorage.getItem('inv:admin:session') || ''; } catch (e) { return ''; } })(),
    d: null,
    ix: null,
    section: 'home',
    sel: '',
    open: {},
    itemQ: '',
    listTab: 'People',
    showArchived: false,
    loginMsg: '',
    stockView: 'bars',
    stockGroup: 'item',
    stockSort: 'low',
    stockFilter: 'all',
    stockQ: '',
    stockOpen: {},
    stockPlace: '',
    stockPerson: '',
    orderTab: 'basket',
    orderId: '',
    basket: { qty: {}, sup: {}, extra: [] },
    compareQ: '',
    projectId: '',
    report: 'projects',
    period: 'month',
    rangeFrom: '',
    rangeTo: '',
    archTab: 'moves',
    logQ: '',
    logPerson: '',
  };

  async function api(action, payload) {
    const req = Object.assign({ action, session: A.session }, payload || {});
    if (window.DEMO_HANDLE) return window.DEMO_HANDLE(req);
    const res = await fetch(window.APP_CONFIG.apiUrl, { method: 'POST', body: JSON.stringify(req) });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      // השרת החזיר משהו שאינו תשובה רגילה (למשל דף שגיאה של גוגל) – שומרים פרט קצר לאבחון
      console.error('Server response', res.status, text.slice(0, 500));
      throw new Error('server ' + res.status + ': ' + text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80));
    }
  }

  // ---------- נתונים: שמורים בדפדפן, מתעדכנים ברקע ----------
  // השרת של גוגל עונה תוך 2–13 שניות. לכן המסך תמיד מוצג מיד מהנתונים השמורים,
  // וכל פנייה לשרת רצה ברקע עם חיווי קטן "מתעדכן" / "שומר".
  const CACHE_KEY = 'inv:admin:data';
  let loading = 0;
  let saving = 0;

  // A.server = הנתונים האחרונים שהגיעו מהשרת. A.d = מה שמוצג: נתוני השרת + שינויים שעוד בדרך.
  // כך שינוי מופיע מיד, ולא "קופץ אחורה" כשמגיעה מהשרת תשובה ישנה יותר.
  const pendingOps = [];
  const clone = x => JSON.parse(JSON.stringify(x));

  function recompute() {
    const d = clone(A.server);
    pendingOps.forEach(op => { try { op.apply(d); } catch (e) { /* שינוי שכבר לא רלוונטי */ } });
    A.d = d;
    buildIndex();
  }

  function setData(d) {
    // תשובה ישנה (שיצאה מהשרת לפני תשובה שכבר הגיעה) לא דורסת נתונים חדשים יותר
    if (A.server && d.stamp && A.server.stamp && d.stamp < A.server.stamp) return;
    A.server = d;
    recompute();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) { /* אחסון מלא – ממשיכים בלי */ }
  }

  // שינוי "אופטימי": apply(d) משנה את הנתונים המוצגים מיד; השרת מאשר ברקע.
  // אם השרת דוחה – השינוי נעלם ומופיעה הודעה. onDone(result) רץ אחרי אישור השרת.
  async function optimistic(action, payload, apply, onDone) {
    const op = { apply };
    pendingOps.push(op);
    recompute();
    safeRender();
    saving++;
    syncState();
    let r;
    try {
      r = await api(action, Object.assign({ withBoot: true }, payload));
    } catch (e) {
      r = { ok: false, error: offlineText(e) };
    } finally {
      saving--;
      syncState();
    }
    pendingOps.splice(pendingOps.indexOf(op), 1);
    if (r.ok && r.data && r.data.boot) {
      const result = r.data.result;
      setData(r.data.boot);
      if (onDone) onDone(result);
      r = Object.assign({}, r, { data: result });
    } else {
      recompute();
      if (r.code === 'AUTH') { logout(TA.sessionExpired); return r; }
      toast(r.error || TA.error, true);
    }
    safeRender();
    return r;
  }
  const tmpId = () => 'tmp-' + Math.random().toString(36).slice(2, 9);

  // לא מציירים מחדש באמצע הקלדה או כשחלון פתוח – כדי לא למחוק מה שמקלידים
  function safeRender() {
    const el = document.activeElement;
    if (document.getElementById('modal') || (el && /INPUT|SELECT|TEXTAREA/.test(el.tagName) && el.id !== 'itemQ' && el.id !== 'stockQ')) {
      A.dirty = true;
      return;
    }
    A.dirty = false;
    render();
  }

  function syncState() {
    let el = document.getElementById('sync');
    const text = saving ? TA.syncSaving : loading ? TA.syncLoading : '';
    if (!text) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'sync';
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  // "אין חיבור", ואם השרת החזיר דף שגיאה – גם פרט קצר ממנו
  const offlineText = e => TA.offline + (e && e.message && e.message.indexOf('server') === 0 ? ' (' + e.message + ')' : '');

  async function load() {
    loading++;
    syncState();
    try {
      const r = await api('admin.bootstrap');
      if (!r.ok) {
        if (r.code === 'AUTH') return logout(TA.sessionExpired);
        return toast(r.error || TA.error, true);
      }
      setData(r.data);
      safeRender();
    } catch (e) {
      toast(offlineText(e), true);
    } finally {
      loading--;
      syncState();
    }
  }

  // פעולה שמשנה נתונים. השרת מחזיר באותה תשובה גם את כל הנתונים המעודכנים.
  async function mutate(action, payload, okMsg) {
    let r;
    saving++;
    syncState();
    try {
      r = await api(action, Object.assign({ withBoot: true }, payload));
    } catch (e) {
      toast(offlineText(e), true);
      return { ok: false, error: offlineText(e) };
    } finally {
      saving--;
      syncState();
    }
    if (!r.ok) {
      if (r.code === 'AUTH') { logout(TA.sessionExpired); return r; }
      if (r.code !== 'PARENT_HAS_STOCK') toast(r.error || TA.error, true);
      return r;
    }
    if (r.data && r.data.boot) {
      setData(r.data.boot);
      r = Object.assign({}, r, { data: r.data.result });
    }
    if (okMsg !== null) toast(okMsg || TA.saved);
    safeRender();
    return r;
  }

  function logout(msg) {
    A.session = '';
    A.d = null;
    A.server = null;
    pendingOps.length = 0;
    try {
      localStorage.removeItem('inv:admin:session');
      localStorage.removeItem(CACHE_KEY);
    } catch (e) { /* */ }
    A.loginMsg = msg || '';
    render();
  }

  // ---------- אינדקס ----------
  function buildIndex() {
    const t = A.d.tables;
    const ix = { items: {}, children: {}, units: {}, locs: {}, people: {}, sups: {}, projects: {}, orders: {}, moves: {} };
    t.Items.forEach(i => {
      ix.items[i.id] = i;
      if (i.archived) return;
      const p = i.parentId || '';
      (ix.children[p] = ix.children[p] || []).push(i);
    });
    Object.keys(ix.children).forEach(p => ix.children[p].sort((a, b) =>
      (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name, 'he', { numeric: true })));
    t.Units.forEach(u => { ix.units[u.id] = u; });
    t.Locations.forEach(l => { ix.locs[l.id] = l; });
    t.People.forEach(p => { ix.people[p.id] = p; });
    t.Suppliers.forEach(s => { ix.sups[s.id] = s; });
    t.Projects.forEach(p => { ix.projects[p.id] = p; });
    t.Orders.forEach(o => { ix.orders[o.id] = o; });
    t.Movements.forEach(m => { ix.moves[m.id] = m; });
    ix.reversed = {};
    t.Movements.forEach(m => { if (m.reversesId) ix.reversed[m.reversesId] = true; });
    // מחיר אחרון לכל פריט (ליחידת מלאי, לפני מע"מ)
    ix.lastPrice = {};
    t.Prices.forEach(p => {
      const cur = ix.lastPrice[p.itemId];
      if (!cur || p.at > cur.at) ix.lastPrice[p.itemId] = p;
    });
    A.ix = ix;
  }

  const item = id => A.ix.items[id];
  // עלה = פריט שאפשר להחזיק ממנו מלאי. תיקייה שנוצרה כתיקייה נשארת תיקייה גם כשהיא ריקה.
  const isLeaf = id => !A.ix.children[id] && !(A.ix.items[id] || {}).isFolder;
  function inheritedWithSource(id, f) {
    let it = item(id), g = 0;
    while (it && g++ < 50) { if (it[f]) return { value: it[f], from: it }; it = item(it.parentId); }
    return { value: '', from: null };
  }
  const inherited = (id, f) => inheritedWithSource(id, f).value;
  const kindOf = id => inherited(id, 'kind') || 'consumable';
  const unitName = id => (A.ix.units[inherited(id, 'unitId')] || {}).name || '';
  function pathOf(id) {
    const out = [];
    let it = item(id), g = 0;
    if (it) it = item(it.parentId);
    while (it && g++ < 50) { out.unshift(it); it = item(it.parentId); }
    return out;
  }
  function displayName(id) {
    const it = item(id);
    if (!it) return '';
    const parent = item(it.parentId);
    return /^[\d.]/.test(it.name) && parent ? parent.name + ' ' + it.name : it.name;
  }
  function descendants(id) {
    const out = [id];
    (A.ix.children[id] || []).forEach(c => out.push.apply(out, descendants(c.id)));
    return out;
  }
  function holderName(h) {
    if (!h) return '';
    if (h === 'X') return '';
    const [k, id] = h.split(':');
    if (k === 'L') return (A.ix.locs[id] || {}).name || '';
    if (k === 'P') return (A.ix.people[id] || {}).name || '';
    if (k === 'S') return (A.ix.sups[id] || {}).name || '';
    return '';
  }
  function warehouseQty(id) {
    const row = A.d.stock[id] || {};
    return Object.keys(row).reduce((s, h) => {
      const loc = h.indexOf('L:') === 0 && A.ix.locs[h.slice(2)];
      return s + (loc && STOCK_TYPES.indexOf(loc.type) >= 0 ? row[h] : 0);
    }, 0);
  }

  // מה דורש טיפול (אותו חישוב כמו במייל הסיכום)
  function digest() {
    const t = A.d.tables;
    const s = A.d.settings;
    const now = Date.now();
    const lateMs = (Number(s.lateDays) || 7) * 86400000;
    const belowMin = t.Items.filter(i => !i.archived && isLeaf(i.id) && i.minQty !== null && i.minQty !== '' && warehouseQty(i.id) < i.minQty);
    const late = t.Orders.filter(o => (o.status === 'sent' || o.status === 'partial') && o.sentAt && now - Date.parse(o.sentAt) > lateMs);
    const missingPrice = t.Movements.filter(m => m.type === 'purchase' && m.unitPrice === null && !A.ix.reversed[m.id]);
    const unknown = t.UnknownItems.filter(u => u.status === 'open');
    const weekAgo = now - 7 * 86400000;
    const overdraws = t.Movements.filter(m => String(m.flags).indexOf('overdraw') >= 0 && !A.ix.reversed[m.id] && Date.parse(m.at) > weekAgo);
    return { belowMin, late, missingPrice, unknown, overdraws };
  }

  // ---------- תצוגה ----------
  const SECTIONS = ['home', 'stock', 'items', 'orders', 'projects', 'reports', 'lists', 'archive', 'settings', 'help'];
  const VIEW = {};

  function render() {
    const app = document.getElementById('app');
    if (!A.session) { app.innerHTML = loginHtml(); mountLogin(); return; }
    if (!A.d) { app.innerHTML = '<div class="center muted">' + esc(TA.loading) + '</div>'; return; }
    const dg = digest();
    const badge = { home: 0, items: dg.unknown.length, orders: dg.late.length + dg.missingPrice.length };
    app.innerHTML = '<div class="topbar"><button data-a="menu">' + ICON.menu + '</button><b>' + esc(TA.appName) + '</b></div>' +
      '<div class="shell"><aside class="side" id="side"><div class="brand">' + ICON.leaf + esc(TA.appName) + '</div><nav class="nav">' +
      SECTIONS.map(s => '<button class="' + (A.section === s ? 'on' : '') + '" data-a="section" data-s="' + s + '">' + ICON[s] +
        esc(TA.menu[s]) + (badge[s] ? '<span class="badge">' + badge[s] + '</span>' : '') + '</button>').join('') +
      '</nav><div class="who"><span>' + esc(A.d.me.name) + '</span><button data-a="logout">' + esc(TA.logout) + '</button></div></aside>' +
      '<main class="main" id="main">' + (VIEW[A.section] || VIEW.soon)(dg) + '</main></div>';
    afterRender();
  }

  let afterHooks = [];
  function afterRender() { const h = afterHooks; afterHooks = []; h.forEach(f => f()); }

  VIEW.soon = () => '<h1>' + esc(TA.menu[A.section]) + '</h1><div class="box muted">' + esc(TA.soon) + '</div>';

  // ---------- כניסה ----------
  function loginHtml() {
    return '<div class="center"><div style="color:var(--green)">' + ICON.leaf.replace('<svg', '<svg style="width:48px;height:48px"') + '</div>' +
      '<h1>' + esc(TA.loginTitle) + '</h1>' + (A.loginMsg ? '<div class="err">' + esc(A.loginMsg) + '</div>' : '') +
      '<div id="gbtn"></div></div>';
  }

  function mountLogin() {
    const cid = window.APP_CONFIG && window.APP_CONFIG.googleClientId;
    if (!cid) return;
    const go = () => {
      google.accounts.id.initialize({ client_id: cid, callback: onCredential });
      google.accounts.id.renderButton(document.getElementById('gbtn'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'he' });
    };
    if (window.google && google.accounts) return go();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = go;
    document.head.appendChild(s);
  }

  async function onCredential(resp) {
    try {
      const r = await api('admin.login', { idToken: resp.credential });
      if (!r.ok) { A.loginMsg = r.error || TA.notAdmin; return render(); }
      A.session = r.data.session;
      try { localStorage.setItem('inv:admin:session', A.session); } catch (e) { /* */ }
      A.loginMsg = '';
      render();
      load();
    } catch (e) {
      A.loginMsg = TA.error;
      render();
    }
  }

  // ---------- בית ----------
  VIEW.home = dg => {
    const h = new Date().getHours();
    const hello = fmt(h < 12 ? TA.goodMorning : h < 17 ? TA.goodNoon : TA.goodEvening, { name: A.d.me.name });
    const card = (n, label, s, cls) => '<button class="card ' + (n ? cls : '') + '" data-a="section" data-s="' + s + '"><span class="n">' + n + '</span>' + esc(label) + '</button>';
    const any = dg.belowMin.length + dg.late.length + dg.missingPrice.length + dg.unknown.length + dg.overdraws.length;
    const moves = A.d.tables.Movements.slice(-15).reverse();
    return '<h1>' + esc(hello) + '</h1>' +
      (any ? '<div class="cards">' +
        card(dg.belowMin.length, TA.cardBelowMin, 'stock', 'bad') +
        card(dg.late.length, TA.cardLate, 'orders', 'warn') +
        card(dg.missingPrice.length, TA.cardMissingPrice, 'orders', 'warn') +
        card(dg.unknown.length, TA.cardUnknown, 'items', 'warn') +
        card(dg.overdraws.length, TA.cardOverdraw, 'stock', 'warn') + '</div>'
        : '<div class="box">' + esc(TA.allGood) + '</div>') +
      '<h2>' + esc(TA.recentMoves) + '</h2><div class="box" style="padding:0"><table>' +
      moves.map(m => moveRow(m, false)).join('') +
      '</table></div>';
  };

  // שורת תנועה – בבית (קצר) וברשימה המלאה (full: זמן ראשון + הערה)
  function moveRow(m, full) {
    const dead = A.ix.reversed[m.id] || m.type === 'reversal';
    const uk = !m.itemId && A.d.tables.UnknownItems.find(u => u.movementId === m.id);
    const what = esc(TA.moveTypes[m.type] || m.type) + ' ' + (m.qty ? num(m.qty) + ' ' + esc(m.itemId ? unitLabel(m.itemId) : '') + ' ' : '') +
      esc(m.itemId ? displayName(m.itemId) : uk ? '"' + uk.text + '"' : '') +
      (A.ix.reversed[m.id] ? ' <span class="tag">' + esc(TA.reversedTag) + '</span>' : '') +
      (String(m.flags).indexOf('overdraw') >= 0 ? ' <span class="tag" style="background:var(--warn-bg);color:var(--warn)">' + esc(TA.overdrawTag) + '</span>' : '');
    const btn = '<td>' + (dead || isTmp(m.id) ? '' : '<button class="btn sm" data-a="reverseMove" data-id="' + m.id + '">' + esc(TA.undoMove) + '</button>') + '</td>';
    const who = '<td>' + esc((A.ix.people[m.byPersonId] || {}).name) + '</td>';
    const time = '<td class="muted small" style="white-space:nowrap">' + esc(when(m.clientAt || m.at)) + '</td>';
    return '<tr' + (dead ? ' class="arch"' : '') + '>' + (full
      ? time + who + '<td>' + what + '</td><td class="muted small">' + esc(moveWhere(m)) + '</td><td class="muted small">' + esc(m.note) + '</td>'
      : who + '<td>' + what + '</td><td class="muted small">' + esc(moveWhere(m)) + '</td>' + time) + btn + '</tr>';
  }

  function moveWhere(m) {
    const parts = [];
    const f = holderName(m.from);
    const t = holderName(m.to);
    if (f) parts.push(f);
    if (t) parts.push(t);
    let s = parts.join(' ← ');
    if (m.projectId && A.ix.projects[m.projectId]) s += (s ? ' · ' : '') + A.ix.projects[m.projectId].name;
    return s;
  }

  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === today.toDateString()) return hm;
    return d.getDate() + '.' + (d.getMonth() + 1) + ' ' + hm;
  }

  // ---------- פריטים ----------
  VIEW.items = dg => {
    let h = '<h1>' + esc(TA.menu.items) + '</h1>';
    if (dg.unknown.length) h += unknownBox(dg.unknown);
    h += '<div class="btns" style="margin-bottom:12px">' +
      '<button class="btn" data-a="newNode" data-folder="1">' + ICON.folder + esc(TA.newFolder) + '</button>' +
      '<button class="btn" data-a="newNode">' + ICON.plus + esc(TA.newItem) + '</button>' +
      '<button class="btn p" data-a="quickAdd">' + esc(TA.quickAdd) + '</button>' +
      '<button class="btn" data-a="quickAdd" data-paste="1">' + esc(TA.importExcel) + '</button></div>';
    h += '<div class="split"><div class="tree"><div class="inline" style="margin-bottom:8px"><input id="itemQ" class="in" placeholder="' + esc(TA.searchItems) + '" value="' + esc(A.itemQ) + '"></div>' +
      '<div id="treeBody">' + treeHtml() + '</div></div>' +
      '<div id="detail">' + detailHtml() + '</div></div>';
    return h;
  };

  function unknownBox(list) {
    return '<div class="box" style="margin-bottom:14px"><b>' + esc(TA.unknownTitle) + '</b><table>' + list.map(u =>
      '<tr><td>' + esc(fmt(TA.unknownLine, { text: u.text, person: (A.ix.people[u.byPersonId] || {}).name || '', date: when(u.at) })) + '</td>' +
      '<td class="btns" style="justify-content:flex-end"><button class="btn sm" data-a="unknownCreate" data-id="' + u.id + '">' + esc(TA.unknownCreate) + '</button>' +
      '<button class="btn sm" data-a="unknownLink" data-id="' + u.id + '">' + esc(TA.unknownLink) + '</button>' +
      '<button class="btn sm danger" data-a="unknownDelete" data-id="' + u.id + '">' + esc(TA.unknownDelete) + '</button></td></tr>').join('') + '</table></div>';
  }

  function treeHtml() {
    if (A.itemQ && norm(A.itemQ)) {
      const words = norm(A.itemQ).split(' ');
      const hits = A.d.tables.Items.filter(i => !i.archived && words.every(w => norm(i.name + ' ' + i.aliases + ' ' + pathOf(i.id).map(p => p.name).join(' ')).indexOf(w) >= 0)).slice(0, 60);
      return hits.map(i => nodeHtml(i, 0, true)).join('') || '<div class="muted small">—</div>';
    }
    const walk = (pid, depth) => (A.ix.children[pid] || []).map(c => nodeHtml(c, depth) +
      (!isLeaf(c.id) && A.open[c.id] ? walk(c.id, depth + 1) : '')).join('');
    // שורש העץ: לחיצה עליו = "שום דבר לא מסומן", ופריט חדש ייווצר בראשי
    const root = '<div class="node' + (!A.sel ? ' on' : '') + '" data-a="selectNode" data-id="" style="padding-right:6px">' +
      '<span class="tw"></span><span class="ic">' + ICON.folder + '</span><span>' + esc(TA.allItems) + '</span></div>';
    return root + (walk('', 1) || '<div class="muted small">' + esc(TA.emptyList) + '</div>');
  }

  function nodeHtml(it, depth, flat) {
    const leaf = isLeaf(it.id);
    let q = '';
    if (leaf) {
      const w = warehouseQty(it.id);
      const low = it.minQty !== null && it.minQty !== '' && w < it.minQty;
      q = '<span class="q' + (low ? ' low' : '') + '">' + num(w) + '</span>';
    }
    return '<div class="node' + (A.sel === it.id ? ' on' : '') + '" style="padding-right:' + (6 + depth * 16) + 'px" data-a="selectNode" data-id="' + it.id + '">' +
      '<span class="tw"' + (leaf ? '' : ' data-a="toggleNode" data-id="' + it.id + '"') + '>' + (leaf ? '' : A.open[it.id] ? ICON.open : ICON.closed) + '</span>' +
      '<span class="ic">' + (leaf ? ICON.file : ICON.folder) + '</span>' +
      '<span>' + esc(flat ? displayName(it.id) : it.name) + '</span>' + q + '</div>';
  }

  function detailHtml() {
    const it = item(A.sel);
    if (!it || it.archived) return '<div class="box muted">' + esc(TA.chooseItem) + '</div>';
    const leaf = isLeaf(it.id);
    const kindInh = inheritedWithSource(it.parentId, 'kind');
    const unitInh = inheritedWithSource(it.parentId, 'unitId');
    const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (String(cur || '') === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>';
    const inhLabel = (src, label) => src.from ? label + ' ' + fmt(TA.inheritedFrom, { folder: src.from.name }) : TA.noInherit;
    const kindName = k => (k === 'tool' ? TA.kindTool : TA.kindConsumable);
    const units = A.d.tables.Units.filter(u => !u.archived);
    let h = '<div class="box"><div class="crumbs">' + esc(pathOf(it.id).map(p => p.name).join(' › ')) + '</div>' +
      '<div class="form">' +
      '<label>' + esc(TA.fName) + '</label><input class="in" id="f_name" value="' + esc(it.name) + '">' +
      '<label>' + esc(TA.fKind) + '</label><select class="in" id="f_kind">' +
        opt('', inhLabel(kindInh, kindName(kindInh.value)), it.kind) + opt('consumable', TA.kindConsumable, it.kind) + opt('tool', TA.kindTool, it.kind) + '</select>' +
      '<label>' + esc(TA.fUnit) + '</label><select class="in" id="f_unit">' +
        opt('', inhLabel(unitInh, (A.ix.units[unitInh.value] || {}).name || ''), it.unitId) + units.map(u => opt(u.id, u.name, it.unitId)).join('') + '</select>';
    if (leaf) {
      const lp = A.ix.lastPrice[it.id];
      h += '<label>' + esc(TA.fBuyUnit) + '</label><div class="inline"><input class="in" id="f_buyName" placeholder="' + esc(TA.buyUnitNone) + '" value="' + esc(it.buyUnitName) + '">' +
          '<span>=</span><input class="in" id="f_buyQty" type="number" min="1" style="max-width:110px" value="' + esc(it.buyUnitQty) + '"><span class="muted">' + esc(unitName(it.id)) + '</span></div>' +
        '<label>' + esc(TA.fMin) + '</label><input class="in" id="f_min" type="number" min="0" value="' + esc(it.minQty) + '">' +
        '<label>' + esc(TA.fAliases) + '</label><div><input class="in" id="f_aliases" value="' + esc(String(it.aliases || '').split(';').filter(Boolean).join(', ')) + '"><div class="hint">' + esc(TA.aliasesHint) + '</div></div>' +
        '<label>' + esc(TA.fValue) + '</label><input class="in" id="f_value" type="number" min="0" step="0.01" value="' + esc(it.value) + '" placeholder="' + (lp ? esc('₪' + num(lp.unitPrice) + ' ' + TA.valueAuto) : '') + '">';
    }
    h += '</div><div class="btns" style="margin-top:14px"><button class="btn p" data-a="saveItem">' + esc(TA.save) + '</button>' +
      (leaf ? '<button class="btn" data-a="duplicateItem">' + esc(TA.duplicate) + '</button>' : '') +
      '<button class="btn" data-a="addChild">' + ICON.plus + esc(TA.newItem) + '</button>' +
      '<button class="btn" data-a="moveItem">' + esc(TA.moveFolder) + '</button>' +
      '<button class="btn danger" data-a="archiveItem">' + esc(TA.remove) + '</button></div></div>';

    if (leaf) {
      const row = A.d.stock[it.id] || {};
      const holders = Object.keys(row).filter(k => row[k]);
      const w = warehouseQty(it.id);
      const low = it.minQty !== null && it.minQty !== '' && w < it.minQty;
      h += '<h2>' + esc(TA.inStockTitle) + '</h2><div class="box"><div style="margin-bottom:8px"><b>' + esc(fmt(TA.warehouseTotal, { n: num(w) + ' ' + unitName(it.id) })) + '</b>' +
        (low ? ' <span class="tag" style="background:var(--danger-bg);color:var(--danger)">' + esc(TA.belowMin) + '</span>' : '') + '</div>' +
        '<div class="stockrows">' + holders.map(k => '<div><span>' + esc(holderName(k)) + '</span><span>' + num(row[k]) + '</span></div>').join('') + '</div>' +
        '<div class="btns" style="margin-top:10px"><button class="btn sm" data-a="setQty" data-id="' + it.id + '">' + esc(TA.setQty) + '</button><button class="btn sm" data-a="moveStock" data-id="' + it.id + '">' + esc(TA.moveStock) + '</button></div></div>';
    } else {
      h += '<div class="box muted" style="margin-top:12px">' + esc(fmt(TA.folderInfo, { n: descendants(it.id).filter(x => x !== it.id && isLeaf(x)).length })) + '</div>';
    }
    return h;
  }

  // ---------- מחירים והזמנות פתוחות ----------
  const DAY = 86400000;
  const staleCutoff = () => Date.now() - (Number(A.d.settings.stalePriceMonths) || 6) * 30 * DAY;

  // המחיר האחרון אצל כל ספק: [{supplierId, unitPrice, at, fresh}]
  function pricesOf(itemId) {
    const by = {};
    A.d.tables.Prices.forEach(p => {
      if (p.itemId !== itemId || p.unitPrice === null) return;
      if (!by[p.supplierId] || p.at > by[p.supplierId].at) by[p.supplierId] = p;
    });
    const cut = staleCutoff();
    return Object.keys(by).map(s => ({ supplierId: s, unitPrice: by[s].unitPrice, at: by[s].at, fresh: Date.parse(by[s].at) >= cut }));
  }
  function cheapest(itemId) {
    const fresh = pricesOf(itemId).filter(p => p.fresh && A.ix.sups[p.supplierId] && !A.ix.sups[p.supplierId].archived);
    return fresh.sort((a, b) => a.unitPrice - b.unitPrice)[0] || null;
  }
  function lastSupplier(itemId) {
    return pricesOf(itemId).sort((a, b) => (a.at < b.at ? 1 : -1))[0] || null;
  }
  // כמה כבר בדרך בהזמנות פתוחות (ביחידות מלאי)
  function onOrder(itemId) {
    const open = {};
    A.d.tables.Orders.forEach(o => { if (o.status === 'sent' || o.status === 'partial') open[o.id] = true; });
    return A.d.tables.OrderLines.reduce((s, l) => {
      if (!open[l.orderId] || l.itemId !== itemId || !l.qtyBuy) return s;
      return s + Math.max(0, l.qtyBuy * (l.buyUnitQty || 1) - (A.d.receivedByLine[l.id] || 0));
    }, 0);
  }
  const money = n => (n === null || n === undefined || n === '' ? '' : '₪' + Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const shortDate = iso => { if (!iso) return ''; const d = new Date(iso); return d.getDate() + '.' + (d.getMonth() + 1) + '.' + String(d.getFullYear()).slice(2); };
  const unitLabel = id => { const u = unitName(id); return u === 'יחידה' ? '' : u; };
  const leaves = () => A.d.tables.Items.filter(i => !i.archived && isLeaf(i.id));
  const hasMin = it => it.minQty !== null && it.minQty !== '';

  // "משך לפרויקטים פתוחים" – אותו חישוב כמו בשרת
  function pullsOf(personId) {
    const open = {};
    A.d.tables.Projects.forEach(p => { if (p.status === 'open') open[p.id] = true; });
    const g = {};
    A.d.tables.Movements.forEach(m => {
      if (m.byPersonId !== personId || A.ix.reversed[m.id] || !open[m.projectId] || !m.itemId) return;
      if (m.type !== 'pull' && m.type !== 'return_surplus') return;
      const k = m.projectId + '|' + m.itemId;
      g[k] = g[k] || { projectId: m.projectId, itemId: m.itemId, qty: 0 };
      g[k].qty += m.type === 'pull' ? m.qty : -m.qty;
    });
    return Object.keys(g).map(k => g[k]).filter(x => x.qty > 0);
  }

  // ---------- מלאי ----------
  const seg = (action, cur, opts) => '<div class="seg">' + opts.map(o => '<button class="' + (o[0] === cur ? 'on' : '') + '" data-a="' + action + '" data-v="' + o[0] + '">' + esc(o[1]) + '</button>').join('') + '</div>';

  VIEW.stock = () => {
    let h = '<h1>' + esc(TA.menu.stock) + '</h1><div class="btns" style="margin-bottom:12px">' +
      seg('stockGroup', A.stockGroup, [['item', TA.byItem], ['place', TA.byPlace], ['person', TA.byPerson]]);
    if (A.stockGroup === 'item') {
      h += seg('stockView', A.stockView, [['bars', TA.viewBars], ['table', TA.viewTable]]) +
        seg('stockFilter', A.stockFilter, [['all', TA.fAll], ['below', TA.fBelow], ['consumable', TA.fConsumable], ['tool', TA.fTools]]) +
        (A.stockView === 'bars' ? seg('stockSort', A.stockSort, [['low', TA.sortLow], ['abc', TA.sortAbc]]) : '') +
        '<input class="in" id="stockQ" style="max-width:220px" placeholder="' + esc(TA.searchItems) + '" value="' + esc(A.stockQ) + '">';
    }
    h += '</div><div id="stockBody">' + stockBody() + '</div>';
    return h;
  };

  function stockItems() {
    const words = norm(A.stockQ).split(' ').filter(Boolean);
    return leaves().filter(it => {
      if (A.stockFilter === 'below' && !(hasMin(it) && warehouseQty(it.id) < it.minQty)) return false;
      if (A.stockFilter === 'consumable' && kindOf(it.id) !== 'consumable') return false;
      if (A.stockFilter === 'tool' && kindOf(it.id) !== 'tool') return false;
      const hay = norm(it.name + ' ' + it.aliases + ' ' + pathOf(it.id).map(p => p.name).join(' '));
      return words.every(w => hay.indexOf(w) >= 0);
    });
  }

  function stockBody() {
    if (A.stockGroup === 'place') return stockByPlace();
    if (A.stockGroup === 'person') return stockByPerson();
    const list = stockItems();
    if (A.stockView === 'table') return stockTable(list);
    const ratio = it => (hasMin(it) && it.minQty > 0 ? warehouseQty(it.id) / it.minQty : 99);
    list.sort((a, b) => (A.stockSort === 'low' ? ratio(a) - ratio(b) : 0) || displayName(a.id).localeCompare(displayName(b.id), 'he', { numeric: true }));
    if (!list.length) return '<div class="box muted">' + esc(TA.nothing) + '</div>';
    return '<div class="box" style="padding:4px 14px">' + list.map(it => {
      const w = warehouseQty(it.id);
      const min = hasMin(it) ? it.minQty : null;
      const low = min !== null && w < min;
      const scale = Math.max(w, (min || 0) * 2, 1);
      const bar = min !== null
        ? '<div class="barw"><div class="bar' + (low ? ' r' : '') + '" style="width:' + Math.max(0, Math.min(100, w / scale * 100)) + '%"></div><div class="mk" style="right:' + (min / scale * 100) + '%"></div></div>'
        : '';
      const open = A.stockOpen[it.id];
      const row = A.d.stock[it.id] || {};
      return '<div class="srow"><div class="stop" data-a="stockToggle" data-id="' + it.id + '"><span><b>' + esc(displayName(it.id)) + '</b> <span class="muted small">' + esc(pathOf(it.id).map(p => p.name).join(' › ')) + '</span></span>' +
        '<span class="' + (low ? 'lowtxt' : '') + '">' + (min !== null ? esc(fmt(TA.qtyOfMin, { qty: num(w), min: num(min), unit: unitLabel(it.id) })) : num(w) + ' ' + esc(unitLabel(it.id))) +
        (onOrder(it.id) ? ' <span class="tag g">' + esc(TA.cOnOrder) + ' ' + num(onOrder(it.id)) + '</span>' : '') + '</span></div>' + bar +
        (open ? '<div class="sexp">' + Object.keys(row).filter(k => row[k]).map(k => '<span>' + esc(holderName(k)) + ': ' + num(row[k]) + '</span>').join('') +
          '<button class="btn sm" data-a="setQty" data-id="' + it.id + '">' + esc(TA.setQty) + '</button><button class="btn sm" data-a="moveStock" data-id="' + it.id + '">' + esc(TA.moveStock) + '</button></div>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function stockTable(list) {
    const locs = A.d.tables.Locations.filter(l => !l.archived && STOCK_TYPES.indexOf(l.type) >= 0);
    const sum = (id, pred) => { const row = A.d.stock[id] || {}; return Object.keys(row).filter(pred).reduce((s, k) => s + row[k], 0); };
    const isType = t => k => k.indexOf('L:') === 0 && (A.ix.locs[k.slice(2)] || {}).type === t;
    list.sort((a, b) => displayName(a.id).localeCompare(displayName(b.id), 'he', { numeric: true }));
    return '<div class="box" style="padding:0;overflow:auto"><table><tr><th>' + esc(TA.cItem) + '</th>' + locs.map(l => '<th>' + esc(l.name) + '</th>').join('') +
      '<th>' + esc(TA.vehicles) + '</th><th>' + esc(TA.people) + '</th><th>' + esc(TA.total) + '</th><th>' + esc(TA.fMin) + '</th></tr>' +
      list.map(it => {
        const w = warehouseQty(it.id);
        const low = hasMin(it) && w < it.minQty;
        const cell = n => '<td>' + (n ? num(n) : '<span class="muted">–</span>') + '</td>';
        return '<tr' + (low ? ' class="lowrow"' : '') + '><td>' + esc(displayName(it.id)) + '</td>' + locs.map(l => cell((A.d.stock[it.id] || {})['L:' + l.id])).join('') +
          cell(sum(it.id, isType('vehicle'))) + cell(sum(it.id, k => k.indexOf('P:') === 0)) +
          '<td><b>' + num(w) + '</b></td><td>' + (hasMin(it) ? num(it.minQty) : '') + '</td></tr>';
      }).join('') + '</table></div>';
  }

  function stockByPlace() {
    const places = A.d.tables.Locations.filter(l => !l.archived);
    if (!A.stockPlace && places.length) A.stockPlace = 'L:' + places[0].id;
    const cards = '<div class="cards" style="margin-bottom:12px">' + places.map(l => {
      const n = Object.keys(A.d.stock).filter(id => (A.d.stock[id]['L:' + l.id] || 0) > 0).length;
      return '<button class="card' + (A.stockPlace === 'L:' + l.id ? ' on' : '') + '" data-a="stockPlace" data-v="L:' + l.id + '"><b>' + esc(l.name) + '</b><div class="small muted">' +
        esc(TA.locTypes[l.type]) + ' · ' + n + '</div></button>';
    }).join('') + '</div>';
    const h = A.stockPlace;
    const rows = Object.keys(A.d.stock).filter(id => item(id) && (A.d.stock[id][h] || 0) !== 0)
      .sort((a, b) => displayName(a).localeCompare(displayName(b), 'he', { numeric: true }));
    return cards + '<div class="box" style="padding:0"><table><tr><th>' + esc(TA.cItem) + '</th><th>' + esc(TA.cQty) + '</th><th>' + esc(TA.companyTotal) + '</th><th>' + esc(TA.fMin) + '</th><th></th></tr>' +
      (rows.length ? rows.map(id => {
        const it = item(id);
        const w = warehouseQty(id);
        return '<tr' + (hasMin(it) && w < it.minQty ? ' class="lowrow"' : '') + '><td>' + esc(displayName(id)) + '</td><td><b>' + num(A.d.stock[id][h]) + '</b> ' + esc(unitLabel(id)) + '</td><td>' + num(w) +
          '</td><td>' + (hasMin(it) ? num(it.minQty) : '') + '</td><td><div class="btns"><button class="btn sm" data-a="setQty" data-id="' + id + '" data-place="' + h + '">' + esc(TA.setQty) + '</button><button class="btn sm" data-a="moveStock" data-id="' + id + '" data-from="' + h + '">' + esc(TA.moveStock) + '</button></div></td></tr>';
      }).join('') : '<tr><td colspan="5" class="muted">' + esc(TA.nothing) + '</td></tr>') + '</table></div>';
  }

  function stockByPerson() {
    const people = A.d.tables.People.filter(p => !p.archived);
    if (!A.stockPerson && people.length) A.stockPerson = (people.find(p => p.role === 'field') || people[0]).id;
    const pid = A.stockPerson;
    const pulls = pullsOf(pid);
    const tools = Object.keys(A.d.stock).filter(id => item(id) && (A.d.stock[id]['P:' + pid] || 0) > 0);
    const cards = '<div class="btns" style="margin-bottom:12px">' + people.map(p => '<button class="btn' + (p.id === pid ? ' p' : '') + '" data-a="stockPerson" data-v="' + p.id + '">' + esc(p.name) + '</button>').join('') + '</div>';
    const byProject = {};
    pulls.forEach(x => { (byProject[x.projectId] = byProject[x.projectId] || []).push(x); });
    return cards + '<div class="split" style="grid-template-columns:1fr 1fr"><div class="box"><b>' + esc(TA.personPulls) + '</b>' +
      (pulls.length ? Object.keys(byProject).map(prj => '<h2 style="margin:10px 0 4px;font-size:15px">' + esc((A.ix.projects[prj] || {}).name) + '</h2>' +
        byProject[prj].map(x => '<div class="kv"><span>' + esc(displayName(x.itemId)) + '</span><span>' + num(x.qty) + ' ' + esc(unitLabel(x.itemId)) + '</span></div>').join('')).join('')
        : '<div class="muted">' + esc(TA.nothing) + '</div>') + '</div>' +
      '<div class="box"><b>' + esc(TA.personTools) + '</b>' + (tools.length ? tools.map(id => '<div class="kv"><span>' + esc(displayName(id)) + '</span><span class="inline">' + num(A.d.stock[id]['P:' + pid]) + ' <button class="btn sm" data-a="moveStock" data-id="' + id + '" data-from="P:' + pid + '">' + esc(TA.moveStock) + '</button></span></div>').join('')
        : '<div class="muted">' + esc(TA.nothing) + '</div>') + '</div></div>';
  }

  // ---------- הזמנות ----------
  VIEW.orders = () => {
    if (A.orderId && A.ix.orders[A.orderId]) return orderView(A.ix.orders[A.orderId]);
    A.orderId = '';
    const dg = digest();
    const counts = { basket: basketItems().length, open: A.d.tables.Orders.filter(o => ['draft', 'sent', 'partial'].indexOf(o.status) >= 0).length, price: dg.missingPrice.length };
    let h = '<h1>' + esc(TA.menu.orders) + '</h1><div class="btns" style="margin-bottom:12px"><div class="seg">' +
      Object.keys(TA.oTabs).map(k => '<button class="' + (A.orderTab === k ? 'on' : '') + '" data-a="orderTab" data-v="' + k + '">' + esc(TA.oTabs[k]) +
        (counts[k] ? ' <span class="cnt">' + counts[k] + '</span>' : '') + '</button>').join('') + '</div>' +
      '<button class="btn" data-a="newOrder">' + ICON.plus + esc(TA.newOrder) + '</button></div>';
    if (A.orderTab === 'basket') h += basketView();
    if (A.orderTab === 'open') h += ordersTable(A.d.tables.Orders.filter(o => ['draft', 'sent', 'partial'].indexOf(o.status) >= 0), TA.noOrders);
    if (A.orderTab === 'history') h += ordersTable(A.d.tables.Orders.filter(o => ['received', 'closed_partial', 'canceled'].indexOf(o.status) >= 0), TA.historyEmpty);
    if (A.orderTab === 'price') h += missingPriceView(dg.missingPrice);
    if (A.orderTab === 'compare') h += compareView();
    return h;
  };

  // הפריטים בסל: מה שמתחת למינימום (אחרי מה שכבר בדרך בהזמנות) + מה שהוסף ידנית
  function basketItems() {
    const ids = leaves().filter(it => hasMin(it) && warehouseQty(it.id) + onOrder(it.id) < it.minQty).map(it => it.id);
    A.basket.extra.forEach(id => { if (ids.indexOf(id) < 0 && item(id)) ids.push(id); });
    return ids;
  }
  function basketSupplier(id) {
    if (A.basket.sup[id] !== undefined) return A.basket.sup[id];
    const c = cheapest(id) || lastSupplier(id);
    return c ? c.supplierId : '';
  }

  function basketView() {
    const ids = basketItems();
    if (!ids.length) return '<div class="box muted">' + esc(TA.basketEmpty) + '</div><div style="margin-top:10px"><button class="btn" data-a="basketAdd">' + ICON.plus + esc(TA.addNotMissing) + '</button></div>';
    const groups = {};
    ids.forEach(id => { const s = basketSupplier(id); (groups[s] = groups[s] || []).push(id); });
    const sups = A.d.tables.Suppliers.filter(s => !s.archived);
    const order = Object.keys(groups).sort((a, b) => (a === '') - (b === ''));
    return order.map(sid => {
      const rows = groups[sid];
      const n = rows.filter(id => Number(A.basket.qty[id]) > 0).length;
      return '<div class="box" style="margin-bottom:12px"><div class="btns" style="justify-content:space-between;margin-bottom:6px"><b>' +
        esc(sid ? (A.ix.sups[sid] || {}).name : TA.noSupplier) + '</b>' +
        (sid ? '<button class="btn p" data-a="basketCreate" data-s="' + sid + '"' + (n ? '' : ' disabled style="opacity:.5"') + '>' + esc(fmt(TA.createOrder, { n })) + '</button>' : '') + '</div>' +
        '<table><tr><th>' + esc(TA.cItem) + '</th><th>' + esc(TA.cStock) + '</th><th>' + esc(TA.cOnOrder) + '</th><th>' + esc(TA.cOrderQty) + '</th><th>' + esc(TA.cPrice) + '</th><th>' + esc(TA.cLastAt) + '</th><th>' + esc(TA.moveSupplier) + '</th></tr>' +
        rows.map(id => {
          const it = item(id);
          const per = it.buyUnitQty || 1;
          const p = pricesOf(id).find(x => x.supplierId === sid);
          const best = cheapest(id);
          const last = lastSupplier(id);
          const w = warehouseQty(id);
          return '<tr><td>' + esc(displayName(id)) + '</td><td' + (hasMin(it) && w < it.minQty ? ' class="lowtxt"' : '') + '>' + num(w) + (hasMin(it) ? ' / ' + num(it.minQty) : '') + ' ' + esc(unitLabel(id)) + '</td>' +
            '<td>' + (onOrder(id) ? num(onOrder(id)) : '') + '</td>' +
            '<td><div class="inline"><input class="in" type="number" min="0" style="max-width:90px" data-bq="' + id + '" value="' + esc(A.basket.qty[id] || '') + '"><span class="muted small">' + esc(per > 1 ? it.buyUnitName : unitLabel(id)) + '</span></div></td>' +
            '<td' + (p && best && p.supplierId === best.supplierId ? ' class="best"' : p && !p.fresh ? ' class="muted"' : '') + '>' + (p ? money(p.unitPrice * per) : '') + '</td>' +
            '<td class="small">' + (last ? esc((A.ix.sups[last.supplierId] || {}).name) + ' · ' + shortDate(last.at) : '') + '</td>' +
            '<td><select class="in" data-bs="' + id + '" style="max-width:150px"><option value="">—</option>' + sups.map(s => '<option value="' + s.id + '"' + (s.id === sid ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></td></tr>';
        }).join('') + '</table></div>';
    }).join('') + '<div class="btns"><button class="btn" data-a="basketAdd">' + ICON.plus + esc(TA.addNotMissing) + '</button><span class="hint">' + esc(TA.emptyQtyHint) + '</span></div>';
  }

  function orderTotals(o, lines) {
    const vat = (o.vatRate || Number(A.d.settings.vatRate) || 0) / 100;
    const total = lines.reduce((s, l) => s + (l.unitPriceBuy === null || l.unitPriceBuy === '' ? 0 : l.unitPriceBuy * l.qtyBuy), 0);
    const before = o.pricesIncludeVat ? total / (1 + vat) : total;
    return { before, after: o.pricesIncludeVat ? total : total * (1 + vat) };
  }
  const linesOf = id => A.d.tables.OrderLines.filter(l => l.orderId === id && l.qtyBuy > 0);
  function lateDays(o) {
    if (!(o.status === 'sent' || o.status === 'partial') || !o.sentAt) return 0;
    const days = Math.floor((Date.now() - Date.parse(o.sentAt)) / DAY);
    return days > (Number(A.d.settings.lateDays) || 7) ? days : 0;
  }

  function ordersTable(list, empty) {
    if (!list.length) return '<div class="box muted">' + esc(empty) + '</div>';
    list = list.slice().sort((a, b) => b.number - a.number);
    return '<div class="box" style="padding:0"><table><tr><th>' + esc(TA.cNumber) + '</th><th>' + esc(TA.fSupplier) + '</th><th>' + esc(TA.fDest) + '</th><th>' + esc(TA.cStatus) + '</th><th>' + esc(TA.cDate) + '</th><th>' + esc(TA.cSum) + '</th></tr>' +
      list.map(o => {
        const late = lateDays(o);
        return '<tr class="click" data-a="openOrder" data-id="' + o.id + '"><td>' + o.number + '</td><td>' + esc((A.ix.sups[o.supplierId] || {}).name) + '</td><td>' + esc((A.ix.locs[o.destId] || {}).name) +
          '</td><td><span class="tag ' + (o.status === 'received' ? 'g' : '') + '">' + esc(TA.statuses[o.status]) + '</span>' + (late ? ' <span class="tag" style="background:var(--warn-bg);color:var(--warn)">' + esc(fmt(TA.late, { n: late })) + '</span>' : '') +
          '</td><td>' + shortDate(o.sentAt || o.createdAt) + '</td><td>' + money(orderTotals(o, linesOf(o.id)).after) + '</td></tr>';
      }).join('') + '</table></div>';
  }

  function orderView(o) {
    const draft = o.status === 'draft';
    const lines = linesOf(o.id);
    const t = orderTotals(o, lines);
    const steps = ['draft', 'sent', 'partial', 'received'];
    const reached = o.status === 'closed_partial' ? 2 : o.status === 'canceled' ? -1 : steps.indexOf(o.status);
    const sups = A.d.tables.Suppliers.filter(s => !s.archived || s.id === o.supplierId);
    const dests = A.d.tables.Locations.filter(l => (!l.archived || l.id === o.destId) && l.type !== 'repair');
    let h = '<button class="link" data-a="orderBack" style="margin-bottom:8px">' + esc(TA.backToList) + '</button>' +
      '<h1>' + esc(fmt(TA.orderTitle, { number: o.number, supplier: (A.ix.sups[o.supplierId] || {}).name || '' })) + '</h1>' +
      '<div class="btns" style="margin-bottom:12px">' + (o.status === 'canceled' || o.status === 'closed_partial'
        ? '<span class="tag">' + esc(TA.statuses[o.status]) + '</span>'
        : steps.map((s, i) => '<span class="tag' + (i <= reached ? ' g' : '') + '">' + esc(TA.statuses[s]) + '</span>').join(' › ')) + '</div>';
    h += '<div class="box"><div class="form" style="grid-template-columns:140px 1fr;max-width:560px">' +
      '<label>' + esc(TA.fSupplier) + '</label>' + (draft ? '<select class="in" id="o_sup">' + sups.map(s => '<option value="' + s.id + '"' + (s.id === o.supplierId ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>' : '<span>' + esc((A.ix.sups[o.supplierId] || {}).name) + '</span>') +
      '<label>' + esc(TA.fDest) + '</label>' + (draft ? '<select class="in" id="o_dest">' + dests.map(l => '<option value="' + l.id + '"' + (l.id === o.destId ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select>' : '<span>' + esc((A.ix.locs[o.destId] || {}).name) + '</span>') +
      '<label>' + esc(TA.fIncVat) + '</label>' + (draft ? '<input type="checkbox" id="o_vat"' + (o.pricesIncludeVat ? ' checked' : '') + '>' : '<span>' + (o.pricesIncludeVat ? '✓' : '—') + '</span>') +
      '<label>' + esc(TA.fNote) + '</label>' + (draft ? '<input class="in" id="o_note" value="' + esc(o.note) + '">' : '<span>' + esc(o.note) + '</span>') + '</div></div>';
    h += '<div class="box" style="margin-top:12px;padding:0"><table id="olines"><tr><th>' + esc(TA.cItem) + '</th><th>' + esc(TA.cOrdered) + '</th><th>' + esc(TA.cUnit) + '</th>' +
      (draft ? '' : '<th>' + esc(TA.cReceived) + '</th>') + '<th>' + esc(TA.cUnitPrice) + '</th><th>' + esc(TA.cSum) + '</th>' + (draft ? '<th></th>' : '') + '</tr>' +
      lines.map(l => {
        const it = item(l.itemId) || {};
        const per = l.buyUnitQty || 1;
        const unit = per > 1 ? it.buyUnitName : unitLabel(l.itemId);
        const got = (A.d.receivedByLine[l.id] || 0) / per;
        const full = got >= l.qtyBuy;
        return '<tr data-line="' + l.id + '"><td>' + esc(displayName(l.itemId)) + '</td><td>' + (draft ? '<input class="in" type="number" min="0" style="max-width:90px" data-lq value="' + l.qtyBuy + '">' : num(l.qtyBuy)) + '</td><td>' + esc(unit) + '</td>' +
          (draft ? '' : '<td' + (full ? '' : ' style="color:var(--warn)"') + '>' + num(got) + '</td>') +
          '<td>' + (draft ? '<input class="in" type="number" min="0" step="0.01" style="max-width:110px" data-lp value="' + esc(l.unitPriceBuy) + '">' : money(l.unitPriceBuy)) + '</td>' +
          '<td>' + money(l.unitPriceBuy === null ? null : l.unitPriceBuy * l.qtyBuy) + '</td>' + (draft ? '<td><button class="btn sm danger" data-a="lineRemove">✕</button></td>' : '') + '</tr>';
      }).join('') + '</table></div>' +
      '<div class="btns" style="justify-content:space-between;margin:10px 0">' + (draft ? '<button class="btn" data-a="lineAdd">' + ICON.plus + esc(TA.addLine) + '</button>' : '<span></span>') +
      '<b>' + esc(fmt(TA.totals, { before: money(t.before), after: money(t.after) })) + '</b></div>';
    h += '<div class="btns">' +
      (draft ? '<button class="btn p" data-a="orderSave">' + esc(TA.saveDraft) + '</button><button class="btn p" data-a="orderSend">' + esc(TA.markSent) + '</button>' : '') +
      '<button class="btn" data-a="orderPdf">' + esc(TA.downloadPdf) + '</button>' +
      (o.status === 'sent' || o.status === 'partial' ? '<button class="btn" data-a="orderClose">' + esc(TA.closePartial) + '</button>' : '') +
      ((draft || o.status === 'sent') && !lines.some(l => A.d.receivedByLine[l.id]) ? '<button class="btn danger" data-a="orderCancel">' + esc(TA.cancelOrder) + '</button>' : '') + '</div>';
    return h;
  }

  function missingPriceView(list) {
    if (!list.length) return '<div class="box muted">' + esc(TA.priceEmpty) + '</div>';
    const sups = A.d.tables.Suppliers.filter(s => !s.archived);
    return '<div class="box" style="padding:0"><table><tr><th>' + esc(TA.cItem) + '</th><th>' + esc(TA.cQty) + '</th><th>' + esc(TA.cWho) + '</th><th>' + esc(TA.cDate) + '</th><th>' + esc(TA.fSupplier) + '</th><th>' + esc(TA.cUnitPrice) + '</th><th>' + esc(TA.fIncVat) + '</th><th></th></tr>' +
      list.map(m => '<tr data-mv="' + m.id + '"><td>' + esc(m.itemId ? displayName(m.itemId) : '') + (m.note ? '<div class="small muted">' + esc(m.note) + '</div>' : '') + '</td><td>' + num(m.qty) + ' ' + esc(unitLabel(m.itemId)) + '</td><td>' +
        esc((A.ix.people[m.byPersonId] || {}).name) + '</td><td>' + shortDate(m.clientAt || m.at) + '</td>' +
        '<td><select class="in" data-ps style="max-width:150px"><option value="">—</option>' + sups.map(s => '<option value="' + s.id + '"' + (s.id === m.supplierId ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></td>' +
        '<td><input class="in" type="number" min="0" step="0.01" style="max-width:100px" data-pp></td><td><input type="checkbox" data-pv checked></td>' +
        '<td><button class="btn sm p" data-a="savePrice">' + esc(TA.savePrice) + '</button></td></tr>').join('') + '</table></div>';
  }

  function compareView() {
    const words = norm(A.compareQ).split(' ').filter(Boolean);
    const ids = leaves().map(i => i.id).filter(id => pricesOf(id).length)
      .filter(id => words.every(w => norm(displayName(id) + ' ' + pathOf(id).map(p => p.name).join(' ')).indexOf(w) >= 0));
    const supIds = [];
    ids.forEach(id => pricesOf(id).forEach(p => { if (supIds.indexOf(p.supplierId) < 0) supIds.push(p.supplierId); }));
    let h = '<div class="btns" style="margin-bottom:10px"><input class="in" id="compareQ" style="max-width:240px" placeholder="' + esc(TA.searchItems) + '" value="' + esc(A.compareQ) + '">' +
      '<span class="hint">' + esc(fmt(TA.compareHint, { n: A.d.settings.stalePriceMonths || 6 })) + '</span></div>';
    if (!ids.length) return h + '<div class="box muted">' + esc(TA.compareEmpty) + '</div>';
    return h + '<div class="box" style="padding:0;overflow:auto"><table><tr><th>' + esc(TA.cItem) + '</th>' + supIds.map(s => '<th>' + esc((A.ix.sups[s] || {}).name) + '</th>').join('') + '</tr>' +
      ids.map(id => {
        const ps = pricesOf(id);
        const best = cheapest(id);
        const it = item(id);
        const per = it.buyUnitQty || 1;
        return '<tr><td>' + esc(displayName(id)) + (per > 1 ? '<div class="small muted">' + esc(it.buyUnitName) + '</div>' : '') + '</td>' + supIds.map(s => {
          const p = ps.find(x => x.supplierId === s);
          if (!p) return '<td class="muted">–</td>';
          return '<td class="' + (best && best.supplierId === s ? 'best' : !p.fresh ? 'muted' : '') + '">' + money(p.unitPrice * per) + ' <span class="small muted">' + shortDate(p.at) + '</span></td>';
        }).join('') + '</tr>';
      }).join('') + '</table></div>';
  }

  // ---------- שווי ועלויות ----------
  // שווי ליחידת מלאי: שווי ידני, אחרת המחיר האחרון, אחרת 0
  function valueOf(id) {
    const it = item(id);
    if (it && it.value !== null && it.value !== '' && it.value !== undefined) return Number(it.value);
    const p = A.ix.lastPrice[id];
    return p ? p.unitPrice : 0;
  }
  // משיכות והחזרות עודפים שלא בוטלו: [{m, sign}]
  function consumption(filter) {
    return A.d.tables.Movements.filter(m => (m.type === 'pull' || m.type === 'return_surplus') && m.itemId &&
      !A.ix.reversed[m.id] && filter(m)).map(m => ({ m, sign: m.type === 'pull' ? 1 : -1 }));
  }
  const moveTime = m => Date.parse(m.clientAt || m.at);
  const bar = (n, max) => '<div class="hbar"><div style="width:' + (max > 0 && n > 0 ? Math.max(1, n / max * 100) : 0) + '%"></div></div>';

  // ---------- פרויקטים ----------
  VIEW.projects = () => {
    const list = A.d.tables.Projects.filter(p => !p.archived);
    const open = list.filter(p => p.status === 'open').sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
    const closed = list.filter(p => p.status === 'closed').sort((a, b) => (a.closedAt < b.closedAt ? 1 : -1));
    const row = p => '<div class="node' + (A.projectId === p.id ? ' on' : '') + '" data-a="openProject" data-id="' + p.id + '" style="justify-content:space-between"><span>' + esc(p.name) +
      '</span><span class="small muted">' + esc(p.status === 'open' ? fmt(TA.since, { date: shortDate(p.openedAt) }) : fmt(TA.closedAt, { date: shortDate(p.closedAt) })) + '</span></div>';
    return '<h1>' + esc(TA.menu.projects) + '</h1><div class="split" style="grid-template-columns:260px 1fr"><div class="tree">' +
      '<button class="btn p" data-a="newProject" style="margin-bottom:8px">' + ICON.plus + esc(TA.newProject) + '</button>' +
      '<div class="small muted" style="margin:6px 4px">' + esc(TA.openProjects) + '</div>' + open.map(row).join('') +
      (closed.length ? '<div class="small muted" style="margin:12px 4px 6px">' + esc(TA.closedProjects) + '</div>' + closed.map(row).join('') : '') +
      '</div><div>' + projectDetail() + '</div></div>';
  };

  function projectDetail() {
    const p = A.ix.projects[A.projectId];
    if (!p || p.archived) return '<div class="box muted">' + esc(TA.chooseProject) + '</div>';
    const assigned = A.d.tables.ContainerProjects.filter(c => c.projectId === p.id && !c.to);
    const freeContainers = A.d.tables.Locations.filter(l => l.type === 'container' && !l.archived && !assigned.some(c => c.containerId === l.id));
    const rows = consumption(m => m.projectId === p.id);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const byItem = {};
    let total = 0, month = 0;
    rows.forEach(({ m, sign }) => {
      const b = byItem[m.itemId] = byItem[m.itemId] || { qty: 0, people: {} };
      b.qty += sign * m.qty;
      if (sign > 0) b.people[m.byPersonId] = (b.people[m.byPersonId] || 0) + m.qty;
      const cost = sign * m.qty * valueOf(m.itemId);
      total += cost;
      if (moveTime(m) >= monthStart.getTime()) month += cost;
    });
    const tools = assigned.reduce((s, c) => s + Object.keys(A.d.stock).reduce((t, id) =>
      t + (item(id) && kindOf(id) === 'tool' ? Math.max(0, (A.d.stock[id]['L:' + c.containerId] || 0)) : 0), 0), 0);
    const items = Object.keys(byItem).filter(id => byItem[id].qty > 0).sort((a, b) => byItem[b].qty * valueOf(b) - byItem[a].qty * valueOf(a));
    return '<div class="box"><div class="btns" style="justify-content:space-between"><h2 style="margin:0">' + esc(p.name) +
      (p.status === 'closed' ? ' <span class="tag">' + esc(TA.closedProjects) + '</span>' : '') + '</h2><div class="btns">' +
      '<button class="btn" data-a="editProject">' + esc(TA.edit) + '</button>' +
      (p.status === 'open' ? '<button class="btn" data-a="closeProject">' + esc(TA.closeProject) + '</button>' : '<button class="btn" data-a="reopenProject">' + esc(TA.reopen) + '</button>') +
      '</div></div>' + (p.note ? '<div class="muted" style="margin-top:6px">' + esc(p.note) + '</div>' : '') +
      '<div class="inline" style="margin-top:12px"><span class="muted">' + esc(TA.containers) + ':</span>' +
      (assigned.length ? assigned.map(c => '<span class="tag g">' + esc((A.ix.locs[c.containerId] || {}).name) +
        ' <button data-a="unassign" data-id="' + c.containerId + '" title="' + esc(TA.remove) + '">✕</button></span>').join(' ') : '<span class="muted">' + esc(TA.noContainers) + '</span>') +
      (freeContainers.length ? '<select class="in" id="assignSel" style="max-width:160px"><option value="">' + esc(TA.assignContainer) + '…</option>' +
        freeContainers.map(l => '<option value="' + l.id + '">' + esc(l.name) + '</option>').join('') + '</select>' : '') + '</div></div>' +
      '<div class="cards" style="margin-top:12px"><div class="card"><span class="small muted">' + esc(TA.costToDate) + '</span><span class="n">' + money(total) + '</span></div>' +
      '<div class="card"><span class="small muted">' + esc(TA.costMonth) + '</span><span class="n">' + money(month) + '</span></div>' +
      '<div class="card"><span class="small muted">' + esc(TA.toolsInContainers) + '</span><span class="n">' + num(tools) + '</span></div></div>' +
      '<h2>' + esc(TA.consumption) + '</h2>' + (items.length ? '<div class="box" style="padding:0"><table><tr><th>' + esc(TA.cItem) + '</th><th>' + esc(TA.cQty) + '</th><th>' + esc(TA.cCost) + '</th><th>' + esc(TA.cTopPuller) + '</th></tr>' +
        items.map(id => {
          const b = byItem[id];
          const top = Object.keys(b.people).sort((x, y) => b.people[y] - b.people[x])[0];
          return '<tr><td>' + esc(displayName(id)) + '</td><td>' + num(b.qty) + ' ' + esc(unitLabel(id)) + '</td><td>' + money(b.qty * valueOf(id)) + '</td><td>' + esc((A.ix.people[top] || {}).name) + '</td></tr>';
        }).join('') + '</table></div><div class="hint" style="margin-top:6px">' + esc(TA.costHint) + '</div>'
        : '<div class="box muted">' + esc(TA.noConsumption) + '</div>');
  }

  // ---------- דוחות ----------
  function periodRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    if (A.period === 'quarter') start.setMonth(start.getMonth() - 2);
    if (A.period === 'year') start.setMonth(0);
    if (A.period === 'range') {
      return { from: A.rangeFrom ? Date.parse(A.rangeFrom + 'T00:00:00') : 0, to: A.rangeTo ? Date.parse(A.rangeTo + 'T23:59:59') : Infinity };
    }
    return { from: start.getTime(), to: Infinity };
  }

  // כל דוח מחזיר: כותרות, שורות (לטבלה ולאקסל), ועמודה לפסים
  function reportData() {
    const r = periodRange();
    const inRange = m => { const t = moveTime(m); return t >= r.from && t <= r.to; };
    const R = A.report;
    if (R === 'projects') {
      const by = {};
      consumption(inRange).forEach(({ m, sign }) => {
        const b = by[m.projectId] = by[m.projectId] || { items: {}, cost: 0 };
        b.items[m.itemId] = true;
        b.cost += sign * m.qty * valueOf(m.itemId);
      });
      return { head: [TA.cProject, TA.cLines, TA.cCost], barCol: 2, money: [2],
        rows: Object.keys(by).map(k => [(A.ix.projects[k] || {}).name || '', Object.keys(by[k].items).length, by[k].cost]).sort((a, b) => b[2] - a[2]) };
    }
    if (R === 'people') {
      const by = {};
      consumption(inRange).forEach(({ m, sign }) => {
        const b = by[m.byPersonId] = by[m.byPersonId] || { lines: 0, cost: 0 };
        if (sign > 0) b.lines++;
        b.cost += sign * m.qty * valueOf(m.itemId);
      });
      A.d.tables.People.filter(p => !p.archived).forEach(p => { by[p.id] = by[p.id] || { lines: 0, cost: 0 }; });
      return { head: [TA.cPerson, TA.cLines, TA.cCost, TA.cToolsHeld], barCol: 2, money: [2],
        rows: Object.keys(by).map(pid => [(A.ix.people[pid] || {}).name || '', by[pid].lines, by[pid].cost,
          Object.keys(A.d.stock).reduce((s, id) => s + Math.max(0, A.d.stock[id]['P:' + pid] || 0), 0)])
          .filter(r2 => r2[1] || r2[3]).sort((a, b) => b[2] - a[2]) };
    }
    if (R === 'lost') {
      const rows = A.d.tables.Movements.filter(m => (m.type === 'broken' || m.type === 'lost') && !A.ix.reversed[m.id] && inRange(m))
        .sort((a, b) => moveTime(b) - moveTime(a))
        .map(m => [shortDate(m.clientAt || m.at), displayName(m.itemId), TA.moveTypes[m.type], m.qty, (A.ix.people[m.byPersonId] || {}).name || '', holderName(m.from)]);
      return { head: [TA.cDate, TA.cItem, TA.cType, TA.cQty, TA.cPerson, TA.cFrom], rows };
    }
    if (R === 'suppliers') {
      const by = {};
      const months = {};
      A.d.tables.Movements.filter(m => (m.type === 'receive' || m.type === 'purchase') && m.unitPrice !== null && !A.ix.reversed[m.id] && inRange(m)).forEach(m => {
        const d = new Date(moveTime(m));
        const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        months[mk] = true;
        const s = m.supplierId || '';
        by[s] = by[s] || {};
        by[s][mk] = (by[s][mk] || 0) + m.qty * m.unitPrice;
      });
      const mks = Object.keys(months).sort();
      const rows = Object.keys(by).map(s => {
        const vals = mks.map(mk => by[s][mk] || 0);
        return [(A.ix.sups[s] || {}).name || TA.noSupplier].concat(vals, [vals.reduce((a, b) => a + b, 0)]);
      }).sort((a, b) => b[b.length - 1] - a[a.length - 1]);
      const head = [TA.cSupplier].concat(mks.map(mk => mk.slice(5) + '.' + mk.slice(2, 4)), [TA.total]);
      return { head, rows, barCol: head.length - 1, money: head.map((h, i) => i).slice(1) };
    }
    if (R === 'asof') return asofData();
    if (R === 'countSheet') return countSheetData();
    // שווי המלאי לפי מקום – נכון להיום
    const by = {};
    Object.keys(A.d.stock).forEach(id => {
      if (!item(id)) return;
      Object.keys(A.d.stock[id]).forEach(h => {
        const q = A.d.stock[id][h];
        if (q > 0) by[h] = (by[h] || 0) + q * valueOf(id);
      });
    });
    return { head: [TA.cPlace, TA.cValue], barCol: 1, money: [1],
      rows: Object.keys(by).filter(h => by[h] > 0).map(h => [holderName(h), by[h]]).sort((a, b) => b[1] - a[1]) };
  }

  // ---- מצב לתאריך: מחשבים את המלאי מכל התנועות עד סוף היום שנבחר ----
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const isoToShort = iso => (iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(2, 4) : '');
  const placeOptions = () => A.d.tables.Locations.filter(l => !l.archived);

  function asofData() {
    const date = A.asofDate || todayIso();
    const end = Date.parse(date + 'T23:59:59');
    const b = {};
    A.d.tables.Movements.forEach(m => {
      if (!m.itemId || !m.qty || moveTime(m) > end) return;
      const add = (h, q) => {
        if (!h || h === 'X' || h.indexOf('S:') === 0) return;
        b[m.itemId] = b[m.itemId] || {};
        b[m.itemId][h] = (b[m.itemId][h] || 0) + q;
      };
      add(m.from, -m.qty);
      add(m.to, m.qty);
    });
    const leafs = leaves().sort((a, x) => (pathOf(a.id).map(p => p.name).join() + a.name).localeCompare(pathOf(x.id).map(p => p.name).join() + x.name, 'he', { numeric: true }));
    const folder = id => pathOf(id).map(p => p.name).join(' › ');
    const place = A.asofPlace || '';
    const title = fmt(TA.asofTitle, { date: isoToShort(date), place: place ? ' · ' + holderName(place) : '' });
    if (place) {
      return { title, head: [TA.cFolder, TA.cItem, TA.cUnit, TA.cQty],
        rows: leafs.filter(it => (b[it.id] || {})[place]).map(it => [folder(it.id), it.name, unitName(it.id), b[it.id][place]]) };
    }
    const locs = placeOptions();
    const isWh = h => { const l = A.ix.locs[h.slice(2)]; return h.indexOf('L:') === 0 && l && STOCK_TYPES.indexOf(l.type) >= 0; };
    return { title, head: [TA.cFolder, TA.cItem, TA.cUnit].concat(locs.map(l => l.name), [TA.cAtPeople, TA.total]),
      rows: leafs.filter(it => b[it.id] && Object.keys(b[it.id]).some(h => b[it.id][h])).map(it => {
        const row = b[it.id];
        const people = Object.keys(row).filter(h => h.indexOf('P:') === 0).reduce((s, h) => s + row[h], 0);
        const wh = Object.keys(row).filter(isWh).reduce((s, h) => s + row[h], 0);
        return [folder(it.id), it.name, unitName(it.id)].concat(locs.map(l => row['L:' + l.id] || ''), [people || '', wh]);
      }) };
  }

  // ---- דף ספירה: מה שאמור להיות במקום, עם עמודות ריקות לכתיבה ביד ----
  function countSheetData() {
    const locs = placeOptions();
    if (!A.countPlace && locs.length) A.countPlace = 'L:' + (locs.find(l => l.type === 'hub') || locs[0]).id;
    const place = A.countPlace;
    const folder = id => pathOf(id).map(p => p.name).join(' › ');
    const list = leaves().filter(it => A.countAll || ((A.d.stock[it.id] || {})[place] || 0) !== 0)
      .sort((a, x) => (folder(a.id) + ' ' + a.name).localeCompare(folder(x.id) + ' ' + x.name, 'he', { numeric: true }));
    const head = [TA.cFolder, TA.cItem, TA.cUnit].concat(A.countShowQty ? [TA.cInSystem] : [], [TA.cCounted, TA.cRemark]);
    return { title: fmt(TA.countTitle, { place: holderName(place), date: isoToShort(todayIso()) }), head, blank: [head.length - 2, head.length - 1], sheet: true,
      rows: list.map(it => [folder(it.id), it.name, unitName(it.id)].concat(A.countShowQty ? [(A.d.stock[it.id] || {})[place] || 0] : [], ['', ''])) };
  }

  function reportControls() {
    const R = A.report;
    const placeSelect = (id, cur, withAll) => '<select class="in" id="' + id + '" style="max-width:180px">' +
      (withAll ? '<option value="">' + esc(TA.allPlaces) + '</option>' : '') +
      placeOptions().map(l => '<option value="L:' + l.id + '"' + (cur === 'L:' + l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select>';
    if (R === 'value') return '<span class="muted">' + esc(TA.valueNow) + '</span>';
    if (R === 'asof') {
      return '<span class="muted">' + esc(TA.asofDate) + '</span><input class="in" type="date" id="rAsof" style="max-width:170px" value="' + esc(A.asofDate || todayIso()) + '">' +
        placeSelect('rAsofPlace', A.asofPlace || '', true);
    }
    if (R === 'countSheet') {
      return placeSelect('rCountPlace', A.countPlace, false) +
        '<label class="small inline"><input type="checkbox" id="cAll"' + (A.countAll ? ' checked' : '') + '> ' + esc(TA.countAllItems) + '</label>' +
        '<label class="small inline"><input type="checkbox" id="cQty"' + (A.countShowQty ? ' checked' : '') + '> ' + esc(TA.countShowQty) + '</label>';
    }
    return seg('period', A.period, Object.keys(TA.periods).map(k => [k, TA.periods[k]])) +
      (A.period === 'range' ? '<span>' + esc(TA.from) + '</span><input class="in" type="date" id="rFrom" style="max-width:160px" value="' + esc(A.rangeFrom) + '"><span>' + esc(TA.to) + '</span><input class="in" type="date" id="rTo" style="max-width:160px" value="' + esc(A.rangeTo) + '">' : '');
  }

  VIEW.reports = () => {
    const d = reportData();
    const max = d.barCol !== undefined ? Math.max.apply(null, d.rows.map(r => r[d.barCol]).concat([0])) : 0;
    const cell = (v, i) => (d.blank && d.blank.indexOf(i) >= 0 ? '<td class="blankcell"></td>'
      : '<td>' + (d.money && d.money.indexOf(i) >= 0 ? money(v) : typeof v === 'number' ? num(v) : esc(v)) + '</td>');
    return '<h1>' + esc(TA.menu.reports) + '</h1><div class="btns noprint" style="margin-bottom:12px">' +
      seg('report', A.report, Object.keys(TA.reportNames).map(k => [k, TA.reportNames[k]])) + '</div>' +
      '<div class="btns noprint" style="margin-bottom:12px">' + reportControls() +
      '<span style="flex:1"></span><button class="btn" data-a="exportCsv">' + esc(TA.downloadExcel) + '</button><button class="btn" data-a="printReport">' + esc(TA.printPdf) + '</button></div>' +
      (A.report === 'countSheet' ? '<div class="hint noprint" style="margin-bottom:10px">' + esc(TA.countHint) + '</div>' : '') +
      '<h2 class="printonly">' + esc(d.title || TA.reportNames[A.report]) + '</h2>' +
      (d.title ? '<h2 class="noprint" style="margin-top:0">' + esc(d.title) + '</h2>' : '') +
      (d.rows.length ? '<div class="box" style="padding:0;overflow:auto"><table class="' + (d.sheet ? 'countsheet' : '') + '"><tr>' + d.head.map(h => '<th>' + esc(h) + '</th>').join('') + (d.barCol !== undefined ? '<th style="width:28%"></th>' : '') + '</tr>' +
        d.rows.map(r => '<tr>' + r.map(cell).join('') + (d.barCol !== undefined ? '<td>' + bar(r[d.barCol], max) + '</td>' : '') + '</tr>').join('') +
        '</table></div>' : '<div class="box muted">' + esc(TA.reportEmpty) + '</div>');
  };

  // ---------- ארכיון ----------
  const ARCH_ENTITIES = ['Items', 'People', 'Locations', 'Suppliers', 'Units', 'Projects'];
  VIEW.archive = () => {
    let h = '<h1>' + esc(TA.menu.archive) + '</h1><div class="btns" style="margin-bottom:12px">' +
      seg('archTab', A.archTab, Object.keys(TA.archTabs).map(k => [k, TA.archTabs[k]]));
    if (A.archTab === 'moves') {
      const people = A.d.tables.People;
      h += '<input class="in" id="movesQ" style="max-width:240px" placeholder="' + esc(TA.movesSearch) + '" value="' + esc(A.movesQ || '') + '">' +
        '<select class="in" id="movesPerson" style="max-width:160px"><option value="">' + esc(TA.allPeople) + '</option>' +
        people.map(p => '<option value="' + p.id + '"' + (A.movesPerson === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>' +
        '<select class="in" id="movesType" style="max-width:160px"><option value="">' + esc(TA.allTypes) + '</option>' +
        Object.keys(TA.moveTypes).filter(k => k !== 'reversal').map(k => '<option value="' + k + '"' + (A.movesType === k ? ' selected' : '') + '>' + esc(TA.moveTypes[k]) + '</option>').join('') + '</select></div>' +
        '<div id="movesBody">' + movesTable() + '</div>';
      return h;
    }
    if (A.archTab === 'log') {
      const people = A.d.tables.People;
      h += '<input class="in" id="logQ" style="max-width:240px" placeholder="' + esc(TA.logSearch) + '" value="' + esc(A.logQ) + '">' +
        '<select class="in" id="logPerson" style="max-width:180px"><option value="">' + esc(TA.allPeople) + '</option>' +
        people.map(p => '<option value="' + p.id + '"' + (A.logPerson === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></div>' +
        '<div id="logBody">' + logTable() + '</div>';
      return h;
    }
    const rows = [];
    ARCH_ENTITIES.forEach(e => A.d.tables[e].filter(r => r.archived).forEach(r => rows.push({ e, r })));
    h += '</div>';
    if (!rows.length) return h + '<div class="box muted">' + esc(TA.removedEmpty) + '</div>';
    return h + '<div class="box" style="padding:0"><table><tr><th>' + esc(TA.fType) + '</th><th>' + esc(TA.fName) + '</th><th></th></tr>' +
      rows.map(x => '<tr><td>' + esc(TA.entityNames[x.e]) + '</td><td>' + esc(x.e === 'Items' ? pathOf(x.r.id).map(p => p.name).concat([x.r.name]).join(' › ') : x.r.name) +
        '</td><td><button class="btn sm" data-a="archRestore" data-e="' + x.e + '" data-id="' + x.r.id + '">' + esc(TA.restore) + '</button></td></tr>').join('') + '</table></div>';
  };

  // כל התנועות, החדשות קודם, עם חיפוש וסינון. מציגים 200 בכל פעם ("הצג עוד").
  function movesTable() {
    const words = norm(A.movesQ || '').split(' ').filter(Boolean);
    const unknownText = {};
    A.d.tables.UnknownItems.forEach(u => { unknownText[u.movementId] = u.text; });
    const all = A.d.tables.Movements.slice().reverse().filter(m => {
      if (A.movesPerson && m.byPersonId !== A.movesPerson) return false;
      if (A.movesType && m.type !== A.movesType && !(m.type === 'reversal' && (A.ix.moves[m.reversesId] || {}).type === A.movesType)) return false;
      if (!words.length) return true;
      const hay = norm([m.itemId ? displayName(m.itemId) + ' ' + pathOf(m.itemId).map(p => p.name).join(' ') : unknownText[m.id] || '',
        (A.ix.people[m.byPersonId] || {}).name, TA.moveTypes[m.type], moveWhere(m), m.note].join(' '));
      return words.every(w => hay.indexOf(w) >= 0);
    });
    if (!all.length) return '<div class="box muted">' + esc(TA.nothing) + '</div>';
    const limit = A.movesLimit || 200;
    return '<div class="box" style="padding:0;overflow:auto"><table><tr><th>' + esc(TA.cWhen) + '</th><th>' + esc(TA.cWho) + '</th><th>' + esc(TA.cWhat) + '</th><th>' +
      esc(TA.cFrom) + '</th><th>' + esc(TA.fNote) + '</th><th></th></tr>' + all.slice(0, limit).map(m => moveRow(m, true)).join('') + '</table></div>' +
      '<div class="btns" style="margin-top:8px"><span class="hint">' + esc(fmt(TA.movesCount, { shown: Math.min(limit, all.length), total: all.length })) + '</span>' +
      (all.length > limit ? '<button class="btn sm" data-a="movesMore">' + esc(TA.showMore) + '</button>' : '') + '</div>';
  }

  function logTable() {
    const words = norm(A.logQ).split(' ').filter(Boolean);
    const rows = A.d.log.slice().reverse().filter(l => (!A.logPerson || l.byPersonId === A.logPerson) &&
      words.every(w => norm(l.summary + ' ' + (TA.logActions[l.action] || l.action)).indexOf(w) >= 0));
    if (!rows.length) return '<div class="box muted">' + esc(TA.nothing) + '</div>';
    return '<div class="box" style="padding:0"><table><tr><th>' + esc(TA.cWhen) + '</th><th>' + esc(TA.cWho) + '</th><th>' + esc(TA.cWhat) + '</th><th></th></tr>' +
      rows.map(l => '<tr><td class="small">' + esc(when(l.at)) + '</td><td>' + esc((A.ix.people[l.byPersonId] || {}).name) + '</td><td>' +
        esc(TA.logActions[l.action] || l.action) + '</td><td>' + esc(l.summary) + '</td></tr>').join('') + '</table></div><div class="hint" style="margin-top:6px">' + esc(TA.logLimit) + '</div>';
  }

  // ---------- הגדרות ----------
  VIEW.settings = () => {
    const s = A.d.settings;
    const admins = A.d.tables.People.filter(p => p.role === 'admin' && !p.archived);
    return '<h1>' + esc(TA.menu.settings) + '</h1><div class="box"><h2 style="margin-top:0">' + esc(TA.sGeneral) + '</h2><div class="form" style="max-width:560px">' +
      '<label>' + esc(TA.sVat) + '</label><input class="in" id="s_vatRate" type="number" min="0" step="0.1" value="' + esc(s.vatRate) + '">' +
      '<label>' + esc(TA.sLate) + '</label><input class="in" id="s_lateDays" type="number" min="1" value="' + esc(s.lateDays) + '">' +
      '<label>' + esc(TA.sStale) + '</label><input class="in" id="s_stalePriceMonths" type="number" min="1" value="' + esc(s.stalePriceMonths) + '">' +
      '<label>' + esc(TA.sDigest) + '</label><select class="in" id="s_digestHour">' + Array.from({ length: 24 }, (_, hh) => '<option value="' + hh + '"' + (String(hh) === String(s.digestHour) ? ' selected' : '') + '>' + String(hh).padStart(2, '0') + ':00</option>').join('') + '</select>' +
      '<label>' + esc(TA.sCompany) + '</label><input class="in" id="s_companyName" value="' + esc(s.companyName) + '">' +
      '</div><div class="btns" style="margin-top:12px"><button class="btn p" data-a="saveSettings">' + esc(TA.save) + '</button></div></div>' +
      '<div class="box" style="margin-top:12px"><h2 style="margin-top:0">' + esc(TA.sAdmins) + ' · ' + esc(TA.sRecipients) + '</h2><div class="hint" style="margin-bottom:8px">' + esc(TA.sRecipientsHint) + '</div>' +
      '<table><tr><th>' + esc(TA.fName) + '</th><th>' + esc(TA.fEmail) + '</th><th>' + esc(TA.fAlerts) + '</th></tr>' +
      admins.map(p => '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.email) + '</td><td><input type="checkbox" data-a="toggleAlerts" data-id="' + p.id + '"' + (p.alerts ? ' checked' : '') + '></td></tr>').join('') +
      '</table><div class="btns" style="margin-top:10px"><button class="btn" data-a="addAdmin">' + ICON.plus + esc(TA.sAddAdmin) + '</button></div></div>' +
      '<div class="box" style="margin-top:12px"><h2 style="margin-top:0">' + esc(TA.sBackup) + '</h2><div class="hint" style="margin-bottom:8px">' + esc(TA.sBackupHint) + '</div>' +
      '<button class="btn" data-a="backupNow">' + esc(TA.backupNow) + '</button></div>';
  };

  // ---------- עזרה ----------
  // ממיר את הטקסט מ-help.js: ## חלק, ### נושא (נפתח בלחיצה), 1. / - רשימות, **מודגש**
  function helpSections() {
    const out = [];
    let part = null, topic = null;
    String(window.HELP || '').split('\n').forEach(raw => {
      const line = raw.trim();
      if (line.indexOf('## ') === 0) { part = { title: line.slice(3), topics: [] }; out.push(part); topic = null; return; }
      if (line.indexOf('### ') === 0 && part) { topic = { title: line.slice(4), lines: [] }; part.topics.push(topic); return; }
      if (topic) topic.lines.push(line);
    });
    return out;
  }
  const inlineMd = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  function topicHtml(lines) {
    let h = '', list = '';
    const flush = () => { if (list) { h += '</' + list + '>'; list = ''; } };
    lines.forEach(l => {
      const ol = l.match(/^\d+\.\s+(.*)/);
      const ul = l.match(/^-\s+(.*)/);
      if (ol || ul) {
        const kind = ol ? 'ol' : 'ul';
        if (list !== kind) { flush(); h += '<' + kind + '>'; list = kind; }
        h += '<li>' + inlineMd((ol || ul)[1]) + '</li>';
      } else {
        flush();
        if (l) h += '<p>' + inlineMd(l) + '</p>';
      }
    });
    flush();
    return h;
  }
  VIEW.help = () => {
    const words = norm(A.helpQ || '').split(' ').filter(Boolean);
    const parts = helpSections();
    return '<h1>' + esc(TA.menu.help) + '</h1><input class="in" id="helpQ" style="max-width:300px;margin-bottom:14px" placeholder="' + esc(TA.helpSearch) + '" value="' + esc(A.helpQ || '') + '">' +
      parts.map(p => {
        const topics = p.topics.filter(t => words.every(w => norm(t.title + ' ' + t.lines.join(' ')).indexOf(w) >= 0));
        if (!topics.length) return '';
        return '<h2>' + esc(p.title) + '</h2>' + topics.map(t => '<details class="help"' + (words.length ? ' open' : '') + '><summary>' + esc(t.title) + '</summary>' + topicHtml(t.lines) + '</details>').join('');
      }).join('');
  };

  // ---------- רשימות ----------
  const LIST_FIELDS = {
    People: [
      { k: 'name', label: TA.fName },
      { k: 'role', label: TA.fRole, type: 'select', options: [['field', TA.roleField], ['admin', TA.roleAdmin]] },
      { k: 'email', label: TA.fEmail },
      { k: 'alerts', label: TA.fAlerts, type: 'check' },
    ],
    Locations: [
      { k: 'name', label: TA.fName },
      { k: 'type', label: TA.fType, type: 'select', options: Object.keys(TA.locTypes).map(k => [k, TA.locTypes[k]]) },
      { k: 'address', label: TA.fAddress },
    ],
    Suppliers: [
      { k: 'name', label: TA.fName }, { k: 'phone', label: TA.fPhone }, { k: 'contact', label: TA.fContact }, { k: 'note', label: TA.fNote },
    ],
    Units: [{ k: 'name', label: TA.fName }],
  };

  VIEW.lists = () => {
    const ent = A.listTab;
    const rows = A.d.tables[ent].filter(r => A.showArchived || !r.archived)
      .sort((a, b) => (a.archived - b.archived) || a.name.localeCompare(b.name, 'he'));
    const fields = LIST_FIELDS[ent];
    const cell = (r, f) => {
      if (f.type === 'select') return esc((f.options.find(o => o[0] === r[f.k]) || [, ''])[1]);
      if (f.type === 'check') return r[f.k] ? '✓' : '';
      return esc(r[f.k]);
    };
    return '<h1>' + esc(TA.menu.lists) + '</h1><div class="btns" style="margin-bottom:12px"><div class="seg">' +
      Object.keys(TA.listTabs).map(k => '<button class="' + (k === ent ? 'on' : '') + '" data-a="listTab" data-t="' + k + '">' + esc(TA.listTabs[k]) + '</button>').join('') +
      '</div><button class="btn p" data-a="listAdd">' + ICON.plus + esc(TA.add) + '</button>' +
      '<label class="small muted inline"><input type="checkbox" data-a="toggleArchived"' + (A.showArchived ? ' checked' : '') + '> ' + esc(TA.showArchived) + '</label></div>' +
      '<div class="box" style="padding:0;overflow:auto"><table><tr>' + fields.map(f => '<th>' + esc(f.label) + '</th>').join('') + '<th></th></tr>' +
      (rows.length ? rows.map(r => '<tr' + (r.archived ? ' class="arch"' : '') + '>' + fields.map(f => '<td>' + cell(r, f) + '</td>').join('') +
        '<td><div class="btns" style="justify-content:flex-end">' + (r.archived
          ? '<span class="tag">' + esc(TA.archivedTag) + '</span><button class="btn sm" data-a="listRestore" data-id="' + r.id + '">' + esc(TA.restore) + '</button>'
          : (ent === 'People' && r.token ? '<button class="btn sm" data-a="copyLink" data-id="' + r.id + '">' + esc(TA.copyLink) + '</button><button class="btn sm" data-a="newLink" data-id="' + r.id + '">' + esc(TA.newLink) + '</button>' : '') +
            '<button class="btn sm" data-a="listEdit" data-id="' + r.id + '">' + esc(TA.edit) + '</button>' +
            '<button class="btn sm danger" data-a="listArchive" data-id="' + r.id + '">' + esc(TA.remove) + '</button>') +
        '</div></td></tr>').join('') : '<tr><td colspan="9" class="muted">' + esc(TA.emptyList) + '</td></tr>') +
      '</table></div>';
  };

  function fieldUrl(token) {
    const base = (window.APP_CONFIG && window.APP_CONFIG.fieldUrl) || new URL('index.html', location.href).href;
    return base + (base.indexOf('?') >= 0 ? '&' : '?') + 't=' + token;
  }

  // ---------- חלונות ----------
  function modal(html, wide) {
    closeModal();
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.id = 'modal';
    bg.innerHTML = '<div class="modal' + (wide ? ' wide' : '') + '">' + html + '</div>';
    bg.addEventListener('mousedown', e => { if (e.target === bg) closeModal(); });
    document.body.appendChild(bg);
    const first = bg.querySelector('input:not([type=checkbox]),select');
    if (first) first.focus();
    return bg;
  }
  function closeModal() {
    const m = document.getElementById('modal');
    if (m) m.remove();
    if (A.dirty) setTimeout(safeRender, 0);
  }

  function confirmBox(text, yes, danger) {
    return new Promise(resolve => {
      const bg = modal('<p style="margin:0">' + esc(text) + '</p><div class="foot"><button class="btn ' + (danger ? 'danger' : 'p') + '" data-r="1">' + esc(yes) +
        '</button><button class="btn" data-r="0">' + esc(TA.cancel) + '</button></div>');
      bg.addEventListener('click', e => {
        const b = e.target.closest('[data-r]');
        if (b) { closeModal(); resolve(b.dataset.r === '1'); }
      });
    });
  }

  function promptBox(title, value) {
    return new Promise(resolve => {
      const bg = modal('<h3>' + esc(title) + '</h3><input class="in" id="pv" value="' + esc(value || '') + '">' +
        '<div class="foot"><button class="btn p" data-r="1">' + esc(TA.create) + '</button><button class="btn" data-r="0">' + esc(TA.cancel) + '</button></div>');
      const done = ok => { const v = document.getElementById('pv').value.trim(); closeModal(); resolve(ok && v ? v : null); };
      bg.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); });
      bg.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    });
  }

  // בוחר תיקייה (לעץ) או פריט (לפריט לא מוכר)
  function pickBox(title, leaves, excludeIds) {
    return new Promise(resolve => {
      // יעד להעברה: תיקייה, או פריט שעוד אף פעם לא היה לו מלאי (למשל תיקייה חדשה שעוד ריקה)
      const used = {};
      A.d.tables.Movements.forEach(m => { if (m.itemId) used[m.itemId] = true; });
      const list = leaves
        ? A.d.tables.Items.filter(i => !i.archived && isLeaf(i.id))
        : A.d.tables.Items.filter(i => !i.archived && !isTmp(i.id) && (!isLeaf(i.id) || !used[i.id]) && (excludeIds || []).indexOf(i.id) < 0);
      const label = i => pathOf(i.id).map(p => p.name).concat([i.name]).join(' › ');
      const rows = q => {
        const words = norm(q).split(' ').filter(Boolean);
        return (leaves ? [] : [{ id: '', l: TA.root }]).concat(list.map(i => ({ id: i.id, l: label(i) })))
          .filter(r => words.every(w => norm(r.l).indexOf(w) >= 0)).slice(0, 80)
          .map(r => '<div class="node" data-pick="' + r.id + '" style="cursor:pointer;padding:6px;border-bottom:1px solid var(--line)">' +
            (leaves ? '' : '<span class="ic">' + (r.id && isLeaf(r.id) ? ICON.file : ICON.folder) + '</span> ') + esc(r.l) + '</div>').join('');
      };
      const bg = modal('<h3>' + esc(title) + '</h3><input class="in" id="pq" placeholder="' + esc(TA.searchItems) + '"><div id="pl" style="max-height:50vh;overflow:auto">' + rows('') + '</div>' +
        '<div class="foot"><button class="btn" data-r="0">' + esc(TA.cancel) + '</button></div>');
      bg.querySelector('#pq').addEventListener('input', e => { bg.querySelector('#pl').innerHTML = rows(e.target.value); });
      bg.addEventListener('click', e => {
        const p = e.target.closest('[data-pick]');
        if (p) { closeModal(); resolve(p.dataset.pick); return; }
        if (e.target.closest('[data-r]')) { closeModal(); resolve(null); }
      });
    });
  }

  // onSave(values) מחזיר את תשובת השרת; החלון נסגר רק כשהשמירה הצליחה
  function formBox(title, fields, rec, onSave) {
    return new Promise(resolve => {
      const input = f => {
        const v = rec[f.k];
        if (f.type === 'select') return '<select class="in" data-k="' + f.k + '">' + f.options.map(o => '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
        if (f.type === 'check') return '<input type="checkbox" data-k="' + f.k + '"' + (v ? ' checked' : '') + '>';
        return '<input class="in" data-k="' + f.k + '" value="' + esc(v) + '">';
      };
      const bg = modal('<h3>' + esc(title) + '</h3><div class="form">' + fields.map(f => '<label>' + esc(f.label) + '</label>' + input(f)).join('') + '</div>' +
        '<div id="ferr" class="err"></div><div class="foot"><button class="btn p" data-r="1">' + esc(TA.save) + '</button><button class="btn" data-r="0">' + esc(TA.cancel) + '</button></div>');
      const collect = () => {
        const out = {};
        bg.querySelectorAll('[data-k]').forEach(el => { out[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; });
        return out;
      };
      // החלון נסגר מיד והשמירה רצה ברקע. onSave יכול להחזיר טקסט = שגיאה מקומית, והחלון נשאר פתוח.
      bg.addEventListener('click', e => {
        const b = e.target.closest('[data-r]');
        if (!b) return;
        if (b.dataset.r === '0') { closeModal(); resolve(null); return; }
        const values = collect();
        const local = onSave.validate ? onSave.validate(values) : '';
        if (local) { bg.querySelector('#ferr').textContent = local; return; }
        closeModal();
        resolve(values);
        onSave(values);
      });
    });
  }

  // ---------- הוספה מהירה ----------
  const Q_COLS = ['path', 'name', 'unitName', 'minQty', 'buyUnitName', 'buyUnitQty', 'aliases'];
  function quickAddBox(folderId, focusPaste) {
    const folderName = folderId ? item(folderId).name : TA.root;
    const units = A.d.tables.Units.filter(u => !u.archived);
    const heads = [TA.qPath, TA.fName, TA.fUnit, TA.fMin, TA.fBuyUnit, '=', TA.fAliases, TA.fKind];
    const rowHtml = (r) => '<tr>' + Q_COLS.map(c => '<td><input class="in" data-c="' + c + '" value="' + esc(r[c] || '') + '"' +
      (c === 'unitName' ? ' list="unitList"' : '') + (c === 'minQty' || c === 'buyUnitQty' ? ' type="number" min="0" style="width:80px"' : '') + '></td>').join('') +
      '<td><select class="in" data-c="kind"><option value=""></option><option value="consumable">' + esc(TA.kindConsumable) + '</option><option value="tool">' + esc(TA.kindTool) + '</option></select></td></tr>';
    const bg = modal('<h3>' + esc(fmt(TA.quickTitle, { folder: folderName })) + '</h3><div class="hint">' + esc(TA.quickHint) + '</div>' +
      '<datalist id="unitList">' + units.map(u => '<option value="' + esc(u.name) + '">').join('') + '</datalist>' +
      '<div style="overflow:auto"><table class="qtable"><thead><tr>' + heads.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody id="qbody">' +
      [0, 1, 2, 3, 4].map(() => rowHtml({})).join('') + '</tbody></table></div>' +
      '<div id="qerr" class="err"></div><div class="foot"><button class="btn p" id="qsave">' + esc(fmt(TA.qSave, { n: '' })) + '</button>' +
      '<button class="btn" id="qadd">' + esc(TA.qAddRow) + '</button><button class="btn" data-close="1">' + esc(TA.cancel) + '</button></div>', true);
    const body = bg.querySelector('#qbody');
    const addRow = (vals) => { body.insertAdjacentHTML('beforeend', rowHtml(vals || {})); return body.lastElementChild; };
    const rowsData = () => [...body.querySelectorAll('tr')].map(tr => {
      const r = {};
      tr.querySelectorAll('[data-c]').forEach(el => { r[el.dataset.c] = el.value.trim(); });
      return r;
    }).filter(r => r.name);
    const refreshCount = () => { bg.querySelector('#qsave').textContent = fmt(TA.qSave, { n: rowsData().length || '' }); };
    bg.addEventListener('input', refreshCount);
    bg.querySelector('#qadd').addEventListener('click', () => addRow().querySelector('[data-c="name"]').focus());
    bg.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
    // Enter = שורה הבאה, ממשיכה את התיקייה של השורה הנוכחית
    body.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const tr = e.target.closest('tr');
      let next = tr.nextElementSibling;
      if (!next) next = addRow();
      const path = tr.querySelector('[data-c="path"]').value;
      const np = next.querySelector('[data-c="path"]');
      if (!np.value) np.value = path;
      next.querySelector('[data-c="name"]').focus();
    });
    // הדבקה מאקסל: טבלה עם טאבים
    body.addEventListener('paste', e => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (text.indexOf('\t') < 0 && text.indexOf('\n') < 0) return;
      e.preventDefault();
      let tr = e.target.closest('tr');
      text.replace(/\r/g, '').split('\n').filter(l => l.trim()).forEach(line => {
        if (!tr) tr = addRow();
        const cells = line.split('\t');
        Q_COLS.forEach((c, i) => { if (cells[i] !== undefined) tr.querySelector('[data-c="' + c + '"]').value = cells[i].trim(); });
        tr = tr.nextElementSibling;
      });
      refreshCount();
    });
    bg.querySelector('#qsave').addEventListener('click', async () => {
      const rows = rowsData();
      if (!rows.length) return;
      const r = await mutate('admin.items.quickAdd', { parentId: folderId, rows }, null);
      if (!r.ok) return;
      const d = r.data;
      if (d.errors.length) {
        bg.querySelector('#qerr').textContent = fmt(TA.qErrors, { n: d.errors.length }) + ': ' + d.errors.map(x => (rows[x.row] || {}).name + ' – ' + x.message).join(' · ');
        toast(fmt(TA.qDone, { n: d.created.length }));
        return;
      }
      closeModal();
      if (folderId) A.open[folderId] = true;
      toast(fmt(TA.qDone, { n: d.created.length }));
    });
    if (focusPaste) body.querySelector('[data-c="path"]').focus();
  }

  // ---------- הודעה קופצת ----------
  let toastTimer = null;
  function toast(text, err) {
    if (!text) text = err ? (TA.error || 'שגיאה') : (TA.saved || 'נשמר');
    clearTimeout(toastTimer);
    document.querySelectorAll('.toast').forEach(t => t.remove());
    document.body.insertAdjacentHTML('beforeend', '<div class="toast' + (err ? ' err' : '') + '">' + esc(text) + '</div>');
    toastTimer = setTimeout(() => document.querySelectorAll('.toast').forEach(t => t.remove()), err ? 7000 : 4500);
  }

  // ---------- פעולות ----------
  // התיקייה שבה נוצר פריט חדש: התיקייה שנבחרה, או זו של הפריט שנבחר
  function currentFolder() {
    const it = item(A.sel);
    if (!it || it.archived) return '';
    return isLeaf(it.id) ? it.parentId || '' : it.id;
  }

  // ---------- בדיקות מקומיות (כדי שטעות תופיע מיד ולא אחרי כמה שניות מהשרת) ----------
  const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  function dupError(entity, name, id, parentId) {
    const rows = entity === 'Items'
      ? (A.ix.children[parentId || ''] || [])
      : A.d.tables[entity].filter(r => !r.archived);
    return rows.some(r => r.id !== id && sameName(r.name, name)) ? fmt(TA.duplicateName, { name: String(name).trim() }) : '';
  }
  const hasStock = id => Object.keys(A.d.stock[id] || {}).some(h => A.d.stock[id][h] > 0);
  const numOrNull = v => (v === '' || v === null || v === undefined ? null : Number(v));

  // פריט חדש: מופיע מיד בעץ (עם מזהה זמני), ומקבל מזהה אמיתי כשהשרת מאשר
  async function createNode(parentId, name, isFolder) {
    const err = dupError('Items', name, null, parentId);
    if (err) return toast(err, true);
    const moveStock = parentId && isLeaf(parentId) && hasStock(parentId);
    if (moveStock && !(await confirmBox(TA.parentHasStock, TA.moveStockYes))) return;
    const tmp = tmpId();
    if (parentId) A.open[parentId] = true;
    A.sel = tmp;
    const record = { name, parentId, isFolder: !!isFolder };
    optimistic('admin.save', { entity: 'Items', record, options: { moveStockToChild: !!moveStock } }, d => {
      d.tables.Items.push(Object.assign({ id: tmp, kind: '', unitId: '', archived: false }, record));
      if (moveStock) { d.stock[tmp] = d.stock[parentId]; delete d.stock[parentId]; }
    }, res => { if (A.sel === tmp) A.sel = res.id; });
  }

  // חלון "פריט חדש / תיקייה חדשה": שם + איפה ליצור (ברירת מחדל: התיקייה המסומנת)
  function folderChoices(excludeIds) {
    const used = {};
    A.d.tables.Movements.forEach(m => { if (m.itemId) used[m.itemId] = true; });
    const label = i => pathOf(i.id).map(p => p.name).concat([i.name]).join(' › ');
    return [{ id: '', l: TA.root }].concat(A.d.tables.Items
      .filter(i => !i.archived && !isTmp(i.id) && (!isLeaf(i.id) || !used[i.id]) && (excludeIds || []).indexOf(i.id) < 0)
      .map(i => ({ id: i.id, l: label(i) }))
      .sort((a, b) => a.l.localeCompare(b.l, 'he', { numeric: true })));
  }
  function createBox(title, folderId) {
    if (isTmp(folderId)) folderId = '';
    return new Promise(resolve => {
      const bg = modal('<h3>' + esc(title) + '</h3><div class="form" style="grid-template-columns:110px 1fr">' +
        '<label>' + esc(TA.fName) + '</label><input class="in" id="pv">' +
        '<label>' + esc(TA.createIn) + '</label><select class="in" id="pf">' +
        folderChoices().map(f => '<option value="' + f.id + '"' + (f.id === folderId ? ' selected' : '') + '>' + esc(f.l) + '</option>').join('') +
        '</select></div><div class="foot"><button class="btn p" data-r="1">' + esc(TA.create) + '</button><button class="btn" data-r="0">' + esc(TA.cancel) + '</button></div>');
      const done = ok => {
        const name = document.getElementById('pv').value.trim();
        const parentId = document.getElementById('pf').value;
        closeModal();
        resolve(ok && name ? { name, parentId } : null);
      };
      bg.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); });
      bg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pv') done(true); if (e.key === 'Escape') done(false); });
      document.getElementById('pv').focus();
    });
  }

  // רשומה שעוד לא אושרה בשרת (מזהה זמני) – אי אפשר לפעול עליה עד שהשמירה מסתיימת
  const isTmp = id => String(id || '').indexOf('tmp-') === 0;
  function waitTmp(id) {
    if (!isTmp(id)) return false;
    toast(TA.stillSaving);
    return true;
  }

  const H = {};
  H.menu =() => document.getElementById('side').classList.toggle('open');
  // מעבר בין חלקים גם מושך את הנתונים העדכניים מהשטח
  H.section = el => { A.section = el.dataset.s; render(); window.scrollTo(0, 0); poll(); };
  H.logout = () => logout('');
  H.selectNode = el => {
    A.sel = el.dataset.id;
    if (!isLeaf(A.sel)) A.open[A.sel] = true;
    render();
  };
  H.toggleNode = (el, e) => {
    e.stopPropagation();
    A.open[el.dataset.id] = !A.open[el.dataset.id];
    render();
  };
  H.newNode = async el => {
    const r = await createBox(el.dataset.folder ? TA.newFolder : TA.newItem, currentFolder());
    if (r) createNode(r.parentId, r.name, !!el.dataset.folder);
  };
  H.addChild = async () => {
    if (waitTmp(A.sel)) return;
    const r = await createBox(TA.newItem, A.sel);
    if (r) createNode(r.parentId, r.name);
  };
  H.quickAdd = el => quickAddBox(currentFolder(), !!el.dataset.paste);
  H.saveItem = () => {
    if (waitTmp(A.sel)) return;
    const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : undefined; };
    const it = item(A.sel);
    const leaf = isLeaf(A.sel);
    const rec = { id: A.sel, name: v('f_name'), kind: v('f_kind'), unitId: v('f_unit') };
    if (leaf) Object.assign(rec, {
      buyUnitName: v('f_buyName'), buyUnitQty: v('f_buyQty'), minQty: v('f_min'), value: v('f_value'),
      aliases: v('f_aliases').split(/[,;]/).map(s => s.trim()).filter(Boolean).join(';'),
    });
    if (!rec.name) return toast(TA.fName, true);
    const err = dupError('Items', rec.name, rec.id, it.parentId);
    if (err) return toast(err, true);
    document.activeElement && document.activeElement.blur();
    optimistic('admin.save', { entity: 'Items', record: rec }, d => {
      const x = d.tables.Items.find(i => i.id === rec.id);
      Object.assign(x, rec, leaf ? { buyUnitQty: numOrNull(rec.buyUnitQty), minQty: numOrNull(rec.minQty), value: numOrNull(rec.value) } : {});
    });
    toast(TA.saved);
  };
  H.duplicateItem = () => {
    if (waitTmp(A.sel)) return;
    const it = item(A.sel);
    const tmp = tmpId();
    const names = (A.ix.children[it.parentId || ''] || []).map(c => c.name);
    let name = it.name + ' (עותק)', n = 1;
    while (names.indexOf(name) >= 0) name = it.name + ' (עותק ' + ++n + ')';
    A.sel = tmp;
    optimistic('admin.items.duplicate', { id: it.id }, d => {
      const src = d.tables.Items.find(i => i.id === it.id);
      d.tables.Items.push(Object.assign({}, src, { id: tmp, name }));
    }, res => { if (A.sel === tmp) A.sel = res.id; });
  };
  H.moveItem = async () => {
    const id = A.sel;
    if (waitTmp(id)) return;
    const target = await pickBox(TA.chooseFolder, false, descendants(id));
    if (target === null) return;
    const err = dupError('Items', item(id).name, id, target);
    if (err) return toast(err, true);
    if (target) A.open[target] = true;
    optimistic('admin.save', { entity: 'Items', record: { id, parentId: target } }, d => {
      d.tables.Items.find(i => i.id === id).parentId = target;
    });
  };
  H.archiveItem = async () => {
    if (waitTmp(A.sel)) return;
    const it = item(A.sel);
    if (descendants(it.id).some(hasStock)) return toast(TA.folderHasStock, true);
    if (!(await confirmBox(fmt(TA.confirmArchive, { name: it.name }), TA.remove, true))) return;
    const ids = descendants(it.id);
    A.sel = it.parentId || '';
    optimistic('admin.archive', { entity: 'Items', id: it.id }, d => {
      d.tables.Items.forEach(i => { if (ids.indexOf(i.id) >= 0) i.archived = true; });
    });
    toast(fmt(TA.archived, { name: it.name }));
  };
  // ביטול דיווח = תנועה הפוכה (שום דבר לא נמחק; ביומן רואים שבוטל). הכמויות חוזרות למה שהיו.
  function reverseMove(id) {
    const m = A.ix.moves[id];
    optimistic('admin.movement.reverse', { id }, d => {
      d.tables.Movements.push({ id: tmpId(), at: new Date().toISOString(), type: 'reversal', itemId: m.itemId, qty: m.qty,
        from: m.to, to: m.from, projectId: m.projectId, byPersonId: d.me.id, reversesId: m.id });
      const adj = (h, q) => {
        if (!m.itemId || !h || h === 'X' || h.indexOf('S:') === 0) return;
        d.stock[m.itemId] = d.stock[m.itemId] || {};
        d.stock[m.itemId][h] = (d.stock[m.itemId][h] || 0) + q;
      };
      adj(m.from, m.qty);
      adj(m.to, -m.qty);
      d.tables.UnknownItems.forEach(u => { if (u.movementId === id && u.status === 'open') u.status = 'canceled'; });
    });
  }
  H.reverseMove = async el => {
    const m = A.ix.moves[el.dataset.id];
    const uk = !m.itemId && A.d.tables.UnknownItems.find(u => u.movementId === m.id);
    const what = (A.ix.people[m.byPersonId] || {}).name + ' · ' + (TA.moveTypes[m.type] || '') + ' ' + num(m.qty) + ' ' +
      (m.itemId ? displayName(m.itemId) : uk ? '"' + uk.text + '"' : '');
    if (!(await confirmBox(fmt(TA.undoMoveConfirm, { what }), TA.undoMove, true))) return;
    reverseMove(m.id);
  };
  H.unknownDelete = async el => {
    const u = A.d.tables.UnknownItems.find(x => x.id === el.dataset.id);
    if (!(await confirmBox(fmt(TA.unknownDeleteConfirm, { text: u.text, person: (A.ix.people[u.byPersonId] || {}).name || '' }), TA.unknownDelete, true))) return;
    reverseMove(u.movementId);
  };
  H.unknownLink = async el => {
    const id = el.dataset.id;
    const itemId = await pickBox(TA.unknownPick, true);
    if (!itemId) return;
    optimistic('admin.unknown.resolve', { id, itemId }, d => {
      const u = d.tables.UnknownItems.find(x => x.id === id);
      u.status = 'linked';
      u.itemId = itemId;
      const m = d.tables.Movements.find(x => x.id === u.movementId);
      if (m) m.itemId = itemId;
    });
  };
  H.unknownCreate = async el => {
    const u = A.d.tables.UnknownItems.find(x => x.id === el.dataset.id);
    const folder = await pickBox(TA.chooseFolder, false);
    if (folder === null) return;
    const name = await promptBox(TA.newItem, u.text);
    if (!name) return;
    const r = await mutate('admin.save', { entity: 'Items', record: { name, parentId: folder } }, null);
    if (r.ok) {
      await mutate('admin.unknown.resolve', { id: u.id, itemId: r.data.id });
      A.sel = r.data.id;
      if (folder) A.open[folder] = true;
      render();
    }
  };

  // ---- מלאי ----
  ['stockGroup', 'stockView', 'stockFilter', 'stockSort', 'stockPlace', 'stockPerson'].forEach(k => {
    H[k] = el => { A[k] = el.dataset.v; render(); };
  });
  H.stockToggle = el => {
    A.stockOpen[el.dataset.id] = !A.stockOpen[el.dataset.id];
    document.getElementById('stockBody').innerHTML = stockBody();
  };
  // העברה ממקום/אדם למקום/אדם – כמו "להעביר" בטלפון, רק מהמשרד
  H.moveStock = el => {
    const id = el.dataset.id;
    const row = A.d.stock[id] || {};
    const unit = unitName(id);
    const from = Object.keys(row).filter(h => row[h] > 0 && (h.indexOf('P:') === 0 || A.ix.locs[h.slice(2)]))
      .map(h => [h, holderName(h) + ' · ' + num(row[h]) + (unit ? ' ' + unit : '')]);
    if (!from.length) return toast(TA.nothingToMove, true);
    const to = A.d.tables.Locations.filter(l => !l.archived).map(l => ['L:' + l.id, l.name])
      .concat(A.d.tables.People.filter(p => !p.archived).map(p => ['P:' + p.id, p.name]));
    const hub = A.d.tables.Locations.find(l => l.type === 'hub' && !l.archived);
    const rec = { from: el.dataset.from && row[el.dataset.from] > 0 ? el.dataset.from : from[0][0], to: hub ? 'L:' + hub.id : to[0][0], qty: '' };
    const kindOfHolder = h => (h.indexOf('L:') === 0 && (A.ix.locs[h.slice(2)] || {}).type === 'repair' ? 'R' : h[0]);
    formBox(fmt(TA.moveTitle, { item: displayName(id) }), [
      { k: 'from', label: TA.moveFrom, type: 'select', options: from },
      { k: 'to', label: TA.moveTo, type: 'select', options: to },
      { k: 'qty', label: TA.cQty + (unit ? ' (' + unit + ')' : '') },
    ], rec, Object.assign(v => {
      const qty = Number(v.qty);
      // לתיקון / מתיקון זה סוג תנועה אחר בשרת
      const type = kindOfHolder(v.to) === 'R' ? 'repair_out' : kindOfHolder(v.from) === 'R' ? 'repair_in' : 'transfer';
      return optimistic('admin.movement.add', { movement: { type, itemId: id, qty, from: v.from, to: v.to } }, d => {
        d.stock[id] = d.stock[id] || {};
        d.stock[id][v.from] = (d.stock[id][v.from] || 0) - qty;
        d.stock[id][v.to] = (d.stock[id][v.to] || 0) + qty;
      });
    }, {
      validate: v => {
        const qty = Number(v.qty);
        if (!Number.isInteger(qty) || qty <= 0) return TA.qtyMissing;
        if (v.from === v.to) return TA.sameFromTo;
        if (qty > (row[v.from] || 0)) return fmt(TA.onlyThere, { n: num(row[v.from] || 0) });
        return '';
      },
    }));
  };
  H.setQty = el => {
    const id = el.dataset.id;
    const places = A.d.tables.Locations.filter(l => !l.archived).map(l => ['L:' + l.id, l.name])
      .concat(A.d.tables.People.filter(p => !p.archived).map(p => ['P:' + p.id, p.name]));
    const rec = { place: el.dataset.place || places[0][0], counted: '' };
    formBox(fmt(TA.setQtyTitle, { item: displayName(id) }), [
      { k: 'place', label: TA.setQtyPlace, type: 'select', options: places },
      { k: 'counted', label: TA.setQtyCount },
    ], rec, Object.assign(
      v => optimistic('admin.movement.add', { movement: { type: 'count', itemId: id, countedQty: Number(v.counted), from: v.place } }, d => {
        d.stock[id] = d.stock[id] || {};
        d.stock[id][v.place] = Number(v.counted);
      }),
      { validate: v => (v.counted === '' || !Number.isInteger(Number(v.counted)) || Number(v.counted) < 0 ? TA.qtyMissing : '') }));
    const m = document.getElementById('modal');
    if (m) m.querySelector('.form').insertAdjacentHTML('afterend', '<div class="hint">' + esc(TA.setQtyHint) + '</div>');
  };

  // ---- הזמנות ----
  H.orderTab = el => { A.orderTab = el.dataset.v; A.orderId = ''; render(); poll(); };
  H.openOrder = el => { A.orderId = el.dataset.id; render(); window.scrollTo(0, 0); };
  H.orderBack = () => { A.orderId = ''; render(); };
  H.basketAdd = async () => {
    const id = await pickBox(TA.addNotMissing, true);
    if (id && A.basket.extra.indexOf(id) < 0) A.basket.extra.push(id);
    render();
  };
  H.basketCreate = async el => {
    const sid = el.dataset.s;
    const ids = basketItems().filter(id => basketSupplier(id) === sid && Number(A.basket.qty[id]) > 0);
    if (!ids.length) return;
    const hub = A.d.tables.Locations.find(l => l.type === 'hub' && !l.archived);
    const lines = ids.map(id => {
      const p = pricesOf(id).find(x => x.supplierId === sid);
      const per = item(id).buyUnitQty || 1;
      return { itemId: id, qtyBuy: Number(A.basket.qty[id]), unitPriceBuy: p ? Math.round(p.unitPrice * per * 100) / 100 : '' };
    });
    const r = await mutate('admin.order.save', { order: { supplierId: sid, destId: hub ? hub.id : '', pricesIncludeVat: false, lines } }, null);
    if (!r.ok) return;
    ids.forEach(id => { delete A.basket.qty[id]; A.basket.extra = A.basket.extra.filter(x => x !== id); });
    A.orderId = r.data.id;
    render();
  };
  H.newOrder = () => {
    const sups = A.d.tables.Suppliers.filter(s => !s.archived).map(s => [s.id, s.name]);
    const dests = A.d.tables.Locations.filter(l => !l.archived && l.type !== 'repair').map(l => [l.id, l.name]);
    const hub = A.d.tables.Locations.find(l => l.type === 'hub' && !l.archived);
    formBox(TA.newOrder, [
      { k: 'supplierId', label: TA.fSupplier, type: 'select', options: sups },
      { k: 'destId', label: TA.fDest, type: 'select', options: dests },
    ], { supplierId: sups.length ? sups[0][0] : '', destId: hub ? hub.id : '' }, async v => {
      const r = await mutate('admin.order.save', { order: { supplierId: v.supplierId, destId: v.destId, lines: [] } }, null);
      if (r.ok) { A.orderId = r.data.id; safeRender(); }
      return r;
    });
  };

  function collectOrder(extraLine) {
    const o = A.ix.orders[A.orderId];
    const lines = [...document.querySelectorAll('#olines tr[data-line]')].map(tr => ({
      id: tr.dataset.line,
      qtyBuy: tr.style.display === 'none' ? 0 : tr.querySelector('[data-lq]').value,
      unitPriceBuy: tr.querySelector('[data-lp]').value,
    }));
    if (extraLine) lines.push(extraLine);
    return {
      id: o.id, supplierId: document.getElementById('o_sup').value, destId: document.getElementById('o_dest').value,
      pricesIncludeVat: document.getElementById('o_vat').checked, note: document.getElementById('o_note').value, lines,
    };
  }
  H.orderSave = () => mutate('admin.order.save', { order: collectOrder() });
  H.lineRemove = el => { el.closest('tr').style.display = 'none'; };
  H.lineAdd = async () => {
    const draft = collectOrder();
    const id = await pickBox(TA.addLine, true);
    if (!id) return;
    const p = pricesOf(id).find(x => x.supplierId === draft.supplierId);
    const per = item(id).buyUnitQty || 1;
    draft.lines.push({ itemId: id, qtyBuy: 1, unitPriceBuy: p ? Math.round(p.unitPrice * per * 100) / 100 : '' });
    mutate('admin.order.save', { order: draft }, null);
  };
  H.orderSend = async () => {
    const o = A.ix.orders[A.orderId];
    const r = await mutate('admin.order.save', { order: collectOrder() }, null);
    if (!r.ok) return;
    if (!(await confirmBox(fmt(TA.sendConfirm, { number: o.number }), TA.markSent))) return;
    mutate('admin.order.status', { id: o.id, status: 'send' });
  };
  H.orderClose = async () => {
    if (!(await confirmBox(TA.closeConfirm, TA.closePartial))) return;
    mutate('admin.order.status', { id: A.orderId, status: 'closePartial' });
  };
  H.orderCancel = async () => {
    const o = A.ix.orders[A.orderId];
    if (!(await confirmBox(fmt(TA.cancelConfirm, { number: o.number }), TA.cancelOrder, true))) return;
    mutate('admin.order.status', { id: o.id, status: 'cancel' });
  };
  H.orderPdf = async () => {
    try {
      const r = await api('admin.order.pdf', { id: A.orderId });
      if (!r.ok) return toast(r.error || TA.error, true);
      const bytes = Uint8Array.from(atob(r.data.base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = r.data.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast(TA.error, true);
    }
  };
  H.savePrice = el => {
    const tr = el.closest('tr');
    const price = tr.querySelector('[data-pp]').value;
    if (price === '') return toast(TA.cUnitPrice, true);
    const mv = tr.dataset.mv;
    const supplierId = tr.querySelector('[data-ps]').value;
    const inc = tr.querySelector('[data-pv]').checked;
    optimistic('admin.purchase.setPrice', { movementId: mv, unitPrice: Number(price), includesVat: inc, supplierId }, d => {
      const m = d.tables.Movements.find(x => x.id === mv);
      m.unitPrice = inc ? Number(price) / (1 + (Number(d.settings.vatRate) || 0) / 100) : Number(price);
      if (supplierId) m.supplierId = supplierId;
    });
  };

  // ---- פרויקטים ----
  H.openProject = el => { A.projectId = el.dataset.id; render(); };
  const PROJECT_FIELDS = [{ k: 'name', label: TA.fName }, { k: 'note', label: TA.fNote }];
  H.newProject = () => formBox(TA.newProject, PROJECT_FIELDS, {}, Object.assign(v => {
    const tmp = tmpId();
    A.projectId = tmp;
    return optimistic('admin.save', { entity: 'Projects', record: v }, d => {
      d.tables.Projects.push(Object.assign({ id: tmp, status: 'open', openedAt: new Date().toISOString(), archived: false }, v));
    }, res => { if (A.projectId === tmp) A.projectId = res.id; });
  }, { validate: v => (!v.name.trim() ? TA.fName : dupError('Projects', v.name)) }));
  H.editProject = () => {
    const p = A.ix.projects[A.projectId];
    formBox(TA.edit + ' · ' + p.name, PROJECT_FIELDS, p, v => saveQuiet('Projects', Object.assign({ id: p.id }, v)));
  };
  function assignContainer(containerId, projectId, assign) {
    optimistic('admin.container.assign', { containerId, projectId, assign }, d => {
      if (assign) d.tables.ContainerProjects.push({ id: tmpId(), containerId, projectId, from: new Date().toISOString(), to: '' });
      else d.tables.ContainerProjects.forEach(c => { if (c.containerId === containerId && c.projectId === projectId && !c.to) c.to = new Date().toISOString(); });
    });
  }
  function setProjectStatus(id, status) {
    optimistic('admin.project.status', { id, status }, d => {
      const p = d.tables.Projects.find(x => x.id === id);
      p.status = status;
      p.closedAt = status === 'closed' ? new Date().toISOString() : '';
    });
  }
  H.unassign = el => assignContainer(el.dataset.id, A.projectId, false);
  H.closeProject = async () => {
    const p = A.ix.projects[A.projectId];
    const r = await api('admin.project.closeCheck', { id: p.id });
    if (!r.ok) return toast(r.error || TA.error, true);
    const c = r.data;
    const lines = c.containers.filter(x => x.itemCount).map(x => fmt(TA.closeContainer, { name: x.name, n: x.itemCount }));
    if (c.openOrders.length) lines.push(fmt(TA.closeOrders, { n: c.openOrders.length }));
    const bg = modal('<h3>' + esc(fmt(TA.closeTitle, { name: p.name })) + '</h3><div class="muted">' + esc(TA.closeExplain) + '</div>' +
      (lines.length ? '<ul style="margin:0;color:var(--warn)">' + lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '<div>' + esc(TA.closeNothing) + '</div>') +
      '<div class="foot"><button class="btn p" data-r="1">' + esc(lines.length ? TA.closeAnyway : TA.closeProject) + '</button><button class="btn" data-r="0">' + esc(TA.cancel) + '</button></div>');
    bg.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      closeModal();
      if (b.dataset.r === '1') { setProjectStatus(p.id, 'closed'); toast(TA.projectClosed); }
    });
  };
  H.reopenProject = () => setProjectStatus(A.projectId, 'open');

  // ---- דוחות ----
  H.report = el => { A.report = el.dataset.v; render(); };
  H.period = el => { A.period = el.dataset.v; render(); };
  H.exportCsv = () => {
    const d = reportData();
    const q = v => { const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + [d.head].concat(d.rows).map(r => r.map(q).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = (d.title || TA.reportNames[A.report]) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  H.printReport = () => window.print();

  // ---- ארכיון ----
  H.archTab = el => { A.archTab = el.dataset.v; render(); };
  H.movesMore = () => { A.movesLimit = (A.movesLimit || 200) + 200; document.getElementById('movesBody').innerHTML = movesTable(); };
  function restore(entity, id) {
    optimistic('admin.restore', { entity, id }, d => {
      const r = d.tables[entity].find(x => x.id === id);
      r.archived = false;
      if (entity === 'Items') {
        let p = d.tables.Items.find(x => x.id === r.parentId);
        while (p) { p.archived = false; const pid = p.parentId; p = d.tables.Items.find(x => x.id === pid); }
      }
    });
  }
  H.archRestore = el => restore(el.dataset.e, el.dataset.id);

  // ---- הגדרות ----
  H.saveSettings = () => {
    const values = {};
    ['vatRate', 'lateDays', 'stalePriceMonths', 'digestHour', 'companyName'].forEach(k => { values[k] = document.getElementById('s_' + k).value; });
    document.activeElement && document.activeElement.blur();
    optimistic('admin.settings.save', { values }, d => { Object.assign(d.settings, values); });
    toast(TA.saved);
  };
  H.toggleAlerts = el => {
    const id = el.dataset.id;
    const alerts = el.checked;
    optimistic('admin.save', { entity: 'People', record: { id, alerts } }, d => { d.tables.People.find(p => p.id === id).alerts = alerts; });
  };
  H.addAdmin = () => formBox(TA.sAddAdmin, [{ k: 'name', label: TA.fName }, { k: 'email', label: TA.fEmail }, { k: 'alerts', label: TA.fAlerts, type: 'check' }],
    { alerts: true }, v => saveQuiet('People', Object.assign({ role: 'admin' }, v)));
  H.backupNow = async () => {
    const r = await mutate('admin.backup.now', {}, null);
    if (r.ok) toast(fmt(TA.backupDone, { name: r.data.name }));
  };

  H.listTab = el => { A.listTab = el.dataset.t; render(); };
  H.toggleArchived = el => { A.showArchived = el.checked; render(); };
  H.listAdd = async () => {
    const ent = A.listTab;
    const defaults = { People: { role: 'field', alerts: false }, Locations: { type: 'container' } }[ent] || {};
    formBox(TA.add + ' · ' + TA.listTabs[ent], LIST_FIELDS[ent], defaults,
      withNameCheck(ent, null, values => saveQuiet(ent, values)));
  };
  H.listEdit = async el => {
    if (waitTmp(el.dataset.id)) return;
    const ent = A.listTab;
    const rec = A.d.tables[ent].find(x => x.id === el.dataset.id);
    formBox(TA.edit + ' · ' + rec.name, LIST_FIELDS[ent], rec,
      withNameCheck(ent, rec.id, values => saveQuiet(ent, Object.assign({ id: rec.id }, values))));
  };
  // בדיקת שם חסר/כפול לפני שהחלון נסגר
  function withNameCheck(entity, id, fn) {
    return Object.assign(fn, { validate: v => (v.name !== undefined && !String(v.name).trim() ? TA.fName : dupError(entity, v.name || '', id)) });
  }
  // שמירה מחלון טופס – מופיעה מיד ברשימה, והשרת מאשר ברקע
  function saveQuiet(entity, record) {
    const tmp = record.id ? null : tmpId();
    return optimistic('admin.save', { entity, record }, d => {
      if (record.id) Object.assign(d.tables[entity].find(x => x.id === record.id), record);
      else d.tables[entity].push(Object.assign({ id: tmp, archived: false }, record));
    });
  }
  H.listArchive = async el => {
    if (waitTmp(el.dataset.id)) return;
    const ent = A.listTab;
    const rec = A.d.tables[ent].find(x => x.id === el.dataset.id);
    if (ent === 'People' && Object.keys(A.d.stock).some(i => (A.d.stock[i]['P:' + rec.id] || 0) > 0)) {
      return toast(fmt(TA.personHasTools, { name: rec.name }), true);
    }
    if (!(await confirmBox(fmt(TA.confirmArchive, { name: rec.name }), TA.remove, true))) return;
    optimistic('admin.archive', { entity: ent, id: rec.id }, d => { d.tables[ent].find(x => x.id === rec.id).archived = true; });
    toast(fmt(TA.archived, { name: rec.name }));
  };
  H.listRestore = el => restore(A.listTab, el.dataset.id);
  H.copyLink = async el => {
    const p = A.ix.people[el.dataset.id];
    const url = fieldUrl(p.token);
    try {
      await navigator.clipboard.writeText(url);
      toast(TA.linkCopied);
    } catch (e) {
      // אין גישה ללוח – מציגים את הקישור להעתקה ידנית
      const bg = modal('<h3>' + esc(TA.copyLink + ' · ' + p.name) + '</h3><input class="in" readonly value="' + esc(url) + '" onfocus="this.select()">' +
        '<div class="foot"><button class="btn" data-close="1">' + esc(TA.close) + '</button></div>');
      bg.addEventListener('click', ev => { if (ev.target.closest('[data-close]')) closeModal(); });
    }
  };
  H.newLink = async el => {
    const p = A.ix.people[el.dataset.id];
    if (!(await confirmBox(fmt(TA.newLinkConfirm, { name: p.name }), TA.newLink))) return;
    mutate('admin.person.newToken', { id: p.id });
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el || !H[el.dataset.a] || el.tagName === 'INPUT') return;
    H[el.dataset.a](el, e);
    if (window.innerWidth <= 820 && el.dataset.a === 'section') document.getElementById('side').classList.remove('open');
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('input[data-a]');
    if (el && H[el.dataset.a]) H[el.dataset.a](el, e);
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'itemQ') {
      A.itemQ = t.value;
      document.getElementById('treeBody').innerHTML = treeHtml();
    } else if (t.id === 'stockQ') {
      A.stockQ = t.value;
      document.getElementById('stockBody').innerHTML = stockBody();
    } else if (t.id === 'compareQ') {
      A.compareQ = t.value;
      render();
      const c = document.getElementById('compareQ');
      c.focus();
      c.setSelectionRange(c.value.length, c.value.length);
    } else if (t.dataset.bq) {
      A.basket.qty[t.dataset.bq] = t.value;
      // מעדכן את מונה "צור הזמנה" בלי לצייר מחדש (כדי לא לאבד את המיקוד)
      const box = t.closest('.box');
      const btn = box && box.querySelector('[data-a="basketCreate"]');
      if (btn) {
        const n = [...box.querySelectorAll('[data-bq]')].filter(i => Number(i.value) > 0).length;
        btn.textContent = fmt(TA.createOrder, { n });
        btn.disabled = !n;
        btn.style.opacity = n ? '' : '.5';
      }
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.bs !== undefined) {
      A.basket.sup[t.dataset.bs] = t.value;
      render();
    } else if (t.id === 'assignSel' && t.value) {
      assignContainer(t.value, A.projectId, true);
    } else if (t.id === 'rAsof' || t.id === 'rAsofPlace' || t.id === 'rCountPlace') {
      A[{ rAsof: 'asofDate', rAsofPlace: 'asofPlace', rCountPlace: 'countPlace' }[t.id]] = t.value;
      render();
    } else if (t.id === 'cAll' || t.id === 'cQty') {
      A[t.id === 'cAll' ? 'countAll' : 'countShowQty'] = t.checked;
      render();
    } else if (t.id === 'rFrom' || t.id === 'rTo') {
      A[t.id === 'rFrom' ? 'rangeFrom' : 'rangeTo'] = t.value;
      render();
    } else if (t.id === 'movesPerson' || t.id === 'movesType') {
      A[t.id] = t.value;
      A.movesLimit = 200;
      document.getElementById('movesBody').innerHTML = movesTable();
    } else if (t.id === 'logPerson') {
      A.logPerson = t.value;
      document.getElementById('logBody').innerHTML = logTable();
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'movesQ') {
      A.movesQ = e.target.value;
      A.movesLimit = 200;
      document.getElementById('movesBody').innerHTML = movesTable();
    } else if (e.target.id === 'logQ') {
      A.logQ = e.target.value;
      document.getElementById('logBody').innerHTML = logTable();
    } else if (e.target.id === 'helpQ') {
      A.helpQ = e.target.value;
      render();
      const c = document.getElementById('helpQ');
      c.focus();
      c.setSelectionRange(c.value.length, c.value.length);
    }
  });

  function start() {
    // פתיחה מיידית מהנתונים השמורים מהפעם הקודמת; העדכון מהשרת מגיע ברקע
    if (A.session) {
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (cached && cached.tables) { A.server = cached; recompute(); }
      } catch (e) { /* אין נתונים שמורים */ }
    }
    render();
    if (A.session) load();
    // כל 15 שניות: "השתנה משהו?" (שאלה קלה). רק אם כן – מושכים את הנתונים.
    setInterval(poll, 15000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
  }

  let polling = false;
  async function poll() {
    if (polling || !A.session || !A.server || document.visibilityState !== 'visible' || loading || saving || pendingOps.length) return;
    polling = true;
    try {
      const r = await api('ping');
      if (r.ok && r.data.ver && r.data.ver !== A.server.ver) await load();
    } catch (e) {
      /* ננסה שוב בבדיקה הבאה */
    } finally {
      polling = false;
    }
  }

  window.AdminApp = { start, A };
})();
