// מסך השטח. דף אחד, בלי ספריות. נתונים נשמרים בטלפון; דיווחים יוצאים ברקע וממתינים כשאין קליטה.

(() => {
  const TX = T.field;
  const STOCK_TYPES = ['hub', 'container', 'cart', 'vehicle'];

  // ---------- עזרים ----------
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
  const num = n => Number(n || 0).toLocaleString('he-IL');
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
  // חיפוש: בלי גרשיים, ו-"וו" = "ו" (זווית / זוית)
  const norm = s => String(s || '').toLowerCase().replace(/["'״׳`]/g, '').replace(/וו/g, 'ו').replace(/\s+/g, ' ').trim();

  const svg = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  const ICON = {
    camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    used: svg('<path d="M5 12l4 4 10-10"/>'),
    take: svg('<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M4 20h16"/>'),
    return: svg('<path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
    transfer: svg('<path d="M4 8h14"/><path d="M14 4l4 4-4 4"/><path d="M20 16H6"/><path d="M10 12l-4 4 4 4"/>'),
    receive: svg('<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>'),
    broken: svg('<path d="M15 6a4 4 0 0 0 4.6 4.6L11 19.2a2.1 2.1 0 0 1-3-3L16.6 7.6A4 4 0 0 0 15 6z"/><path d="M4 4l4 4"/>'),
    more: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    chevron: svg('<path d="M15 6l-6 6 6 6"/>'),
    back: svg('<path d="M9 6l6 6-6 6"/>'),
    folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    leaf: svg('<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-4 6-7 10-9"/>'),
    user: svg('<circle cx="9" cy="8" r="4"/><path d="M3 20c0-3 3-6 6-6s6 3 6 6"/><path d="M16 11l2 2 4-4"/>'),
    check: svg('<path d="M5 12l5 5L20 7"/>'),
    home: svg('<path d="M3 10l9-6 9 6v10H3z"/><path d="M8 20v-6h8v6"/>'),
    cloud: svg('<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4 4 0 0 1 0 9z"/><path d="M12 12v6"/><path d="M9 15l3-3 3 3"/>'),
  };

  // ---------- מצב ----------
  const params = new URLSearchParams(location.search);
  const S = {
    token: params.get('t') || '',
    data: null,
    ix: null,
    queue: [],
    sentIds: {},
    snaps: {},
    offline: false,
    flushing: false,
    toast: null,
    fatal: null,
    bk: null, // רשימה פתוחה: { action, from, items: [...] }
  };
  const key = n => (window.STORE_PREFIX || 'inv:') + n + ':' + S.token;
  const store = {
    get(n, def) { try { const v = localStorage.getItem(key(n)); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set(n, v) { try { localStorage.setItem(key(n), JSON.stringify(v)); } catch (e) { /* אחסון מלא או חסום */ } },
  };

  // ---------- תקשורת ----------
  async function api(action, payload) {
    const req = Object.assign({ action, token: S.token }, payload || {});
    if (window.DEMO_HANDLE) return window.DEMO_HANDLE(req);
    if (window.LOCAL_API) return window.LOCAL_API(req); // גרסת Firebase
    const res = await fetch(window.APP_CONFIG.apiUrl, { method: 'POST', body: JSON.stringify(req) });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      // השרת של גוגל החזיר דף שגיאה (עומס רגעי) – זו לא בעיית קליטה, פשוט מנסים שוב
      const err = new Error('server');
      err.server = true;
      throw err;
    }
  }

  // ---------- אינדקס הנתונים ----------
  function buildIndex() {
    const d = S.data;
    const ix = { items: {}, children: {}, units: {}, locs: {}, people: {}, sups: {}, projects: {}, orders: {} };
    d.items.forEach(i => {
      ix.items[i.id] = i;
      const p = i.parentId || '';
      (ix.children[p] = ix.children[p] || []).push(i);
    });
    Object.keys(ix.children).forEach(p => ix.children[p].sort((a, b) =>
      (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name, 'he', { numeric: true })));
    d.units.forEach(u => { ix.units[u.id] = u; });
    d.locations.forEach(l => { ix.locs[l.id] = l; });
    d.people.forEach(p => { ix.people[p.id] = p; });
    d.suppliers.forEach(s => { ix.sups[s.id] = s; });
    d.projects.forEach(p => { ix.projects[p.id] = p; });
    d.orders.forEach(o => { ix.orders[o.id] = o; });
    ix.leaves = d.items.filter(i => !ix.children[i.id] && !i.isFolder);
    ix.search = {};
    ix.leaves.forEach(i => { ix.search[i.id] = norm([i.name, i.aliases, pathNames(i.id, ix).join(' ')].join(' ')); });
    S.ix = ix;
  }

  const item = id => S.ix.items[id];
  const isLeaf = id => !S.ix.children[id] && !(S.ix.items[id] || {}).isFolder;
  function inherited(id, f) {
    let it = item(id), g = 0;
    while (it && g++ < 50) { if (it[f]) return it[f]; it = item(it.parentId); }
    return '';
  }
  const kindOf = id => inherited(id, 'kind') || 'consumable';
  const unitName = id => (S.ix.units[inherited(id, 'unitId')] || {}).name || '';
  // "30 מטר", אבל "30" ולא "30 יחידה"
  const qtyLabel = (q, id) => {
    const u = id ? unitName(id) : '';
    return num(q) + (u && u !== 'יחידה' ? ' ' + u : '');
  };
  function pathNames(id, ix) {
    ix = ix || S.ix;
    const out = [];
    let it = ix.items[id], g = 0;
    if (it) it = ix.items[it.parentId];
    while (it && g++ < 50) { out.unshift(it.name); it = ix.items[it.parentId]; }
    return out;
  }
  // "20 מ"מ" לבד לא אומר כלום – מוסיפים את שם התיקייה
  function displayName(id) {
    const it = item(id);
    if (!it) return '';
    const parent = item(it.parentId);
    return /^[\d.]/.test(it.name) && parent ? parent.name + ' ' + it.name : it.name;
  }

  const me = () => 'P:' + S.data.me.id;
  function holderName(h) {
    if (!h) return '';
    if (h === me()) return TX.me;
    const [k, id] = h.split(':');
    if (k === 'L') return (S.ix.locs[id] || {}).name || '';
    if (k === 'P') return (S.ix.people[id] || {}).name || '';
    return '';
  }
  const qtyAt = (itemId, h) => ((S.data.stock[itemId] || {})[h]) || 0;
  function holdersWith(itemId) {
    const row = S.data.stock[itemId] || {};
    return Object.keys(row).filter(h => row[h] > 0 && (h.indexOf('P:') === 0 || S.ix.locs[h.slice(2)]))
      .sort((a, b) => row[b] - row[a]);
  }
  const locsOfTypes = types => S.data.locations.filter(l => types.indexOf(l.type) >= 0);
  const repairLoc = () => S.data.locations.find(l => l.type === 'repair');

  function myTools() { return (S.data.personal.tools || []).filter(t => item(t.itemId)); }
  // כמה דברים רשומים על העובד: כלים לפי כמות, מתכלה – פריט אחד לכל סוג
  function heldCount() { return myTools().reduce((s, t) => s + (kindOf(t.itemId) === 'tool' ? t.qty : 1), 0); }
  function myPulls() { return (S.data.personal.pulls || []).filter(p => item(p.itemId) && (S.ix.projects[p.projectId] || p.projectName)); }
  // שם הפרויקט של משיכה (גם פרויקט שנסגר לאחרונה)
  const pullProject = p => ((S.ix.projects[p.projectId] || {}).name || p.projectName || '') + (p.closed ? ' ' + TX.closedTag : '');

  // ---------- ניווט ----------
  const stack = [{ v: 'home' }];
  let skipPops = 0;
  const cur = () => stack[stack.length - 1];
  function go(view) {
    S.toast = null;
    stack.push(view);
    history.pushState({ n: stack.length }, '');
    render();
    window.scrollTo(0, 0);
  }
  function back() { history.back(); }
  function goHome() {
    const n = stack.length - 1;
    stack.length = 1;
    if (n > 0) { skipPops++; history.go(-n); }
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', () => {
    if (skipPops) { skipPops--; return; }
    if (stack.length > 1) stack.pop();
    render();
  });

  // ---------- תצוגה ----------
  const top = (title, withBack) =>
    '<header class="top">' + (withBack
      ? '<button class="back" data-a="back">' + ICON.back + esc(TX.back) + '</button>'
      : '<span class="leaf">' + ICON.leaf + '</span>') +
    '<h1>' + esc(title) + '</h1></header>';

  // "אין קליטה" רק כשהטלפון באמת בלי רשת. אחרת – הודעה שקטה שהדיווחים בדרך.
  function banners() {
    const docs = DOCS.count ? '<div class="banner info">' + ICON.camera + '<span class="grow">' + esc(fmt(TX.docsSending, { n: DOCS.count })) + '</span></div>' : '';
    if (!S.queue.length) return docs;
    if (navigator.onLine === false) {
      return '<div class="banner warn">' + ICON.cloud + '<span class="grow">' + esc(fmt(TX.offline, { n: S.queue.length })) + '</span></div>';
    }
    return '<div class="banner info">' + ICON.cloud + '<span class="grow">' + esc(fmt(TX.sending, { n: S.queue.length })) + '</span></div>' + docs;
  }

  function itemRow(id, opts) {
    opts = opts || {};
    const it = item(id);
    const sub = opts.sub !== undefined ? opts.sub : pathNames(id).join(' › ');
    return '<button class="row" data-a="' + (opts.a || 'pickItem') + '" data-id="' + id + '"' +
      (opts.extra || '') + '><span class="grow"><div class="name">' + esc(opts.short ? it.name : displayName(id)) + '</div>' +
      (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</span>' +
      (opts.qty !== undefined ? '<span class="qty">' + esc(opts.qty) + '</span>' : '') + ICON.chevron + '</button>';
  }

  const VIEWS = {};

  VIEWS.home = () => {
    const d = S.data;
    const pulls = myPulls().length;
    const tools = heldCount();
    const recents = (d.personal.recentItemIds || []).filter(id => item(id) && isLeaf(id)).slice(0, 5);
    const act = a => '<button class="act' + (BK_ACTIONS.indexOf(a) < 0 ? ' quiet' : '') + '" data-a="action" data-action="' + a + '">' + ICON[a] + esc(TX.actions[a]) + '</button>';
    return top(fmt(TX.hello, { name: d.me.name }), false) + '<main class="body">' + banners() +
      '<button class="mycard" data-a="mine">' + ICON.user + '<span class="grow"><div class="t">' + esc(TX.myCard) + '</div>' +
      '<div class="s">' + esc(pulls || tools ? fmt(TX.myCardLine, { pulls, tools }) : TX.myCardEmpty) + '</div></span>' + ICON.chevron + '</button>' +
      (S.bk && S.bk.items.length ? '<div class="banner warn"><span class="grow">' + esc(fmt(TX.bkPending, { action: TX.actions[S.bk.action], n: S.bk.items.length })) + '</span>' +
        '<button data-a="bkContinue">' + esc(TX.bkContinue) + '</button><button data-a="bkDiscard">' + esc(TX.bkDiscard) + '</button></div>' : '') +
      '<div class="grid two">' + ['take', 'transfer', 'return', 'broken', 'receive', 'more'].map(act).join('') + '</div>' +
      (recents.length ? '<div class="label">' + esc(TX.recent) + '</div><div class="list">' +
        recents.map(id => itemRow(id, { a: 'card' })).join('') + '</div>' : '') +
      '<button class="search" data-a="search">' + ICON.search + '<span class="hint" style="font-size:16px">' + esc(TX.search) + '</span></button>' +
      '</main>';
  };

  // בחירת פריט: חיפוש, "מה רשום עליך", אחרונים, ועץ שנפתח כמו תיקיות
  const MINE_FIRST = ['return', 'transfer', 'broken', 'repairOut'];
  // פעולות שאפשר לעשות גם על פריט שעוד לא קיים במערכת ("לא מוצא את הפריט? כתוב מה זה")
  const ALLOW_UNKNOWN = ['take', 'purchase', 'count', 'found', null];
  const unknownLabel = a => ({ count: TX.unknownFieldCount, found: TX.unknownFieldFound }[a] || TX.unknownField);

  VIEWS.pick = v => {
    const title = v.action ? fmt(TX.pickTitle, { action: TX.actions[v.action] }) : TX.allItems;
    return top(title, true) + '<main class="body">' +
      '<label class="search">' + ICON.search + '<input id="q" type="search" autocomplete="off" placeholder="' + esc(TX.search) + '" value="' + esc(v.q || '') + '"></label>' +
      '<div id="results" class="body" style="padding:0">' + pickResults(v) + '</div></main>';
  };

  function pickResults(v) {
    const a = v.action ? 'pickItem' : 'card';
    const unknownLink = ALLOW_UNKNOWN.indexOf(v.action || null) >= 0
      ? '<button class="link" data-a="unknown">' + esc(TX.unknownLink) + '</button>' : '';
    if (v.q && norm(v.q)) {
      const words = norm(v.q).split(' ');
      const hits = S.ix.leaves.filter(i => words.every(w => S.ix.search[i.id].indexOf(w) >= 0)).slice(0, 40);
      if (!hits.length) return '<div class="empty">' + esc(fmt(TX.noResults, { q: v.q })) + '</div>' + unknownLink;
      return '<div class="list">' + hits.map(i => itemRow(i.id, { a })).join('') + '</div>' + unknownLink;
    }
    let h = '';
    if (!v.folder && MINE_FIRST.indexOf(v.action) >= 0) {
      const rows = myTools().map(t => itemRow(t.itemId, { a, qty: qtyLabel(t.qty, t.itemId), extra: ' data-held="1"' }));
      if (v.action === 'return') {
        myPulls().forEach(p => rows.push(itemRow(p.itemId, {
          a, qty: qtyLabel(p.qty, p.itemId), sub: pullProject(p),
          extra: ' data-project="' + p.projectId + '"',
        })));
      }
      if (rows.length) h += '<div class="label">' + esc(TX.pickMine) + '</div><div class="list">' + rows.join('') + '</div>';
      if (v.action === 'return') return h || '<div class="empty">' + esc(TX.myCardEmpty) + '</div>';
    }
    if (!v.folder) {
      const recents = (S.data.personal.recentItemIds || []).filter(id => item(id) && isLeaf(id)).slice(0, 5);
      if (recents.length) h += '<div class="label">' + esc(TX.recent) + '</div><div class="list">' + recents.map(id => itemRow(id, { a })).join('') + '</div>';
      h += '<div class="label">' + esc(TX.allItems) + '</div>';
    } else {
      const crumbs = [];
      let it = item(v.folder);
      while (it) { crumbs.unshift(it); it = item(it.parentId); }
      h += '<div class="crumbs"><button data-a="folder" data-id="">' + esc(TX.allItems) + '</button>' +
        crumbs.map((c, i) => ' › ' + (i === crumbs.length - 1 ? '<b>' + esc(c.name) + '</b>'
          : '<button data-a="folder" data-id="' + c.id + '">' + esc(c.name) + '</button>')).join('') + '</div>';
    }
    const kids = S.ix.children[v.folder || ''] || [];
    h += '<div class="list">' + kids.map(c => isLeaf(c.id)
      ? itemRow(c.id, { a, sub: '', short: true })
      : '<button class="row folder" data-a="folder" data-id="' + c.id + '"><span class="grow"><div class="name">' + esc(c.name) + '</div></span>' + ICON.folder + '</button>'
    ).join('') + '</div>';
    return h + unknownLink;
  }

  VIEWS.unknown = v => top(fmt(TX.pickTitle, { action: TX.actions[v.action || 'take'] }), true) + '<main class="body">' +
    '<div class="field"><div class="label">' + esc(unknownLabel(v.action)) + '</div>' +
    '<input id="unknownText" class="text" maxlength="200" value="' + esc(v.text || '') + '"></div>' +
    '<div class="hint">' + esc(TX.unknownHint) + '</div><div id="err" class="error"></div>' +
    '<button class="send" data-a="unknownGo">' + esc(TX.continue) + '</button></main>';

  // כרטיס פריט
  VIEWS.card = v => {
    const id = v.itemId;
    const it = item(id);
    if (!it) return VIEWS.home();
    const rows = holdersWith(id).map(h => {
      const k = h.split(':')[0];
      const loc = S.ix.locs[h.slice(2)];
      const label = k === 'P' ? (h === me() ? TX.me : fmt(TX.atPerson, { name: holderName(h) })) : loc.name;
      return '<div><span>' + esc(label) + '</span><span>' + esc(qtyLabel(qtyAt(id, h), id)) + '</span></div>';
    });
    const act = a => '<button class="act" data-a="action" data-action="' + a + '" data-id="' + id + '">' + ICON[a] + esc(TX.actions[a]) + '</button>';
    return top(it.name, true) + '<main class="body">' +
      '<div class="path">' + esc(pathNames(id).join(' › ')) + '</div>' +
      '<div class="label">' + esc(TX.inStock) + '</div>' +
      (rows.length ? '<div class="stock">' + rows.join('') + '</div>' : '<div class="empty">' + esc(TX.noStock) + '</div>') +
      '<div class="label">' + esc(TX.whatHappened) + '</div>' +
      '<div class="grid two">' + (kindOf(id) !== 'tool' && qtyAt(id, me()) > 0 ? ['used', 'return', 'transfer', 'take', 'more'] : ['take', 'return', 'transfer', 'more']).map(act).join('') + '</div></main>';
  };

  // "עוד": פעולות נדירות
  const MORE = ['found', 'repairOut', 'repairIn', 'count', 'returnSupplier', 'purchase'];
  VIEWS.more = v => top(TX.actions.more, true) + '<main class="body"><div class="list">' +
    MORE.map(a => '<button class="row" data-a="action" data-action="' + a + '"' + (v.itemId ? ' data-id="' + v.itemId + '"' : '') +
      '><span class="grow"><div class="name">' + esc(TX.actions[a]) + '</div></span>' + ICON.chevron + '</button>').join('') +
    '</div></main>';

  // ---------- מסך סיום: מה צריך לשאול בכל פעולה ----------
  const chip = (h, label, n) => ({ h, label, n });
  function locChips(types, itemId) {
    return locsOfTypes(types).map(l => chip('L:' + l.id, l.name, itemId ? qtyAt(itemId, 'L:' + l.id) : undefined))
      .sort((a, b) => (b.n || 0) - (a.n || 0));
  }
  function placesChips(itemId, opts) {
    const out = locChips(STOCK_TYPES, itemId);
    if (!opts || !opts.noMe) out.unshift(chip(me(), TX.me, itemId ? qtyAt(itemId, me()) || undefined : undefined));
    S.data.people.filter(p => 'P:' + p.id !== me()).forEach(p => out.push(chip('P:' + p.id, p.name, itemId ? qtyAt(itemId, 'P:' + p.id) || undefined : undefined)));
    return out;
  }
  function withStock(itemId, chips) {
    const has = chips.filter(c => c.n > 0);
    return has.length ? has : chips;
  }
  function projectChips(from) {
    const all = S.data.projects.map(p => chip(p.id, p.name));
    if (from && from.indexOf('L:') === 0) {
      const ids = S.data.containerProjects.filter(c => c.containerId === from.slice(2)).map(c => c.projectId);
      const mine = all.filter(c => ids.indexOf(c.h) >= 0);
      if (mine.length) return mine;
    }
    return all;
  }

  // מתכלה שרשום על העובד עצמו (לא "משכתי" לפרויקט)
  function heldReturn(v) {
    if (!v.itemId || v.projectId) return false;
    if (v.held) return true;
    return qtyAt(v.itemId, me()) > 0 && !myPulls().some(p => p.itemId === v.itemId);
  }

  function spec(v) {
    const id = v.itemId;
    const tool = id ? kindOf(id) === 'tool' : false;
    const s = { type: '', from: null, to: null, project: false, supplier: false, what: false, counted: false, fixedFrom: '', fixedTo: '' };
    switch (v.action) {
      case 'take':
        if (tool) { s.type = 'transfer'; s.from = withStock(id, locChips(STOCK_TYPES, id).concat(placesChips(id, { noMe: true }).filter(c => c.h.indexOf('P:') === 0))); s.fixedTo = me(); }
        else { s.type = 'pull'; s.from = id ? withStock(id, locChips(STOCK_TYPES, id)) : locChips(STOCK_TYPES); s.fixedTo = 'X'; s.project = true; }
        break;
      case 'used':
        s.type = 'pull'; s.fixedFrom = me(); s.fixedTo = 'X'; s.project = true;
        break;
      case 'return':
        // כלי, או מתכלה שרשום על העובד (הועבר אליו, לא נמשך לפרויקט) – העברה ממנו למחסן
        if (tool || heldReturn(v)) { s.type = 'transfer'; s.fixedFrom = me(); s.to = locChips(STOCK_TYPES); }
        else { s.type = 'return_surplus'; s.fixedFrom = 'X'; s.to = locChips(STOCK_TYPES); s.project = true; }
        break;
      case 'transfer':
        s.type = 'transfer'; s.from = withStock(id, placesChips(id)); s.to = placesChips(null);
        break;
      case 'broken':
        s.what = true; s.from = withStock(id, placesChips(id)); s.fixedTo = 'X';
        break;
      case 'found':
        s.type = 'found'; s.fixedFrom = 'X'; s.to = placesChips(null);
        break;
      case 'repairOut':
        s.type = 'repair_out'; s.from = withStock(id, placesChips(id)); s.fixedTo = repairLoc() ? 'L:' + repairLoc().id : '';
        break;
      case 'repairIn':
        s.type = 'repair_in'; s.fixedFrom = repairLoc() ? 'L:' + repairLoc().id : ''; s.to = placesChips(null);
        break;
      case 'count':
        s.type = 'count'; s.from = locChips(STOCK_TYPES, null); s.counted = true;
        break;
      case 'returnSupplier':
        s.type = 'return_supplier'; s.from = withStock(id, locChips(STOCK_TYPES, id)); s.supplier = true;
        break;
      case 'purchase':
        s.type = 'purchase'; s.to = placesChips(null); s.supplier = true;
        break;
    }
    return s;
  }

  function initFinish(v) {
    if (v.init) return;
    v.init = true;
    const s = spec(v);
    v.qty = s.counted ? '' : 1;
    // פריט שנקנה ביחידות גדולות (גליל = 100 מטר): ברירת המחדל היא לדווח ביחידה הגדולה
    v.unitMode = buyPer(v.itemId) > 1 ? 'buy' : 'stock';
    if (s.from && s.from.length === 1) v.from = s.from[0].h;
    if (v.action === 'broken' && qtyAt(v.itemId, me()) > 0) v.from = me();
    if (v.action === 'take' && s.from && !v.from) {
      const has = s.from.filter(c => c.n > 0);
      if (has.length === 1) v.from = has[0].h;
    }
    // מחזיר/מעביר פחות מגליל שלם (למשל 30 מטר) – מתחילים במטרים
    const max = myMax(v, v.projectId);
    if (v.unitMode === 'buy' && max !== null && max % buyPer(v.itemId) !== 0) v.unitMode = 'stock';
    v.what = 'broken';
    autoProject(v);
  }

  function autoProject(v) {
    const s = spec(v);
    if (!s.project || v.projectId === '_other') return;
    let chips = projectChips(v.from);
    if (v.action === 'return' && !v.projectId) {
      const p = myPulls().filter(x => x.itemId === v.itemId);
      if (p.length === 1) v.projectId = p[0].projectId;
    }
    if (chips.length === 1) v.projectId = chips[0].h;
    else if (v.projectId && !chips.some(c => c.h === v.projectId)) v.projectId = '';
    else if (!v.projectId) {
      const last = store.get('lastProject', '');
      if (chips.some(c => c.h === last)) v.projectId = last;
    }
  }

  function chipsHtml(field, chips, selected) {
    return '<div class="chips">' + chips.map(c => '<button class="chip' + (c.h === selected ? ' on' : '') +
      '" data-a="chip" data-field="' + field + '" data-v="' + esc(c.h) + '">' + esc(c.label) +
      (c.n !== undefined && c.n !== 0 ? ' <span class="n">· ' + num(c.n) + '</span>' : '') + '</button>').join('') + '</div>';
  }

  // הרבה פרויקטים: רשימה נגללת (האחרון שבחרתי ראשון) במקום קיר כפתורים
  function projectListHtml(chips, selected) {
    const last = store.get('lastProject', '');
    const other = chips.filter(c => c.h === '_other');
    const list = chips.filter(c => c.h !== '_other').sort((a, b) => (b.h === last) - (a.h === last) || a.label.localeCompare(b.label, 'he'));
    return '<div class="plist">' + list.concat(other).map(c => '<button class="prow' + (c.h === selected ? ' on' : '') + (c.h === '_other' ? ' other' : '') +
      '" data-a="chip" data-field="projectId" data-v="' + esc(c.h) + '">' + esc(c.label) + '</button>').join('') + '</div>';
  }

  VIEWS.finish = v => {
    initFinish(v);
    const s = spec(v);
    const name = v.itemId ? displayName(v.itemId) : v.unknownText;
    const unit = v.itemId ? unitName(v.itemId) : '';
    let h = top(fmt('{action} · {item}', { action: TX.actions[v.action], item: name }), true) + '<main class="body">';
    if (v.itemId) h += '<div class="path">' + esc(pathNames(v.itemId).join(' › ')) + '</div>';

    if (s.what) h += '<div class="field"><div class="label">' + esc(TX.brokenQ) + '</div>' +
      chipsHtml('what', [chip('broken', TX.brokenOpt), chip('lost', TX.lostOpt)], v.what) + '</div>';
    if (s.counted) {
      h += '<div class="field"><div class="label">' + esc(TX.from) + '</div>' + chipsHtml('from', s.from, v.from) + '</div>';
      h += '<div class="field"><div class="label">' + esc(v.from ? fmt(TX.countQ, { place: holderName(v.from) }) : TX.countQNoPlace) + '</div>' + stepper(v, unit) + '</div>';
    } else {
      const max = myMax(v, v.projectId);
      h += '<div class="field"><div class="label">' + esc(TX.qty) + '</div>' + stepper(v, unit) +
        (max !== null ? '<div class="hint" style="text-align:center">' + esc(fmt(s.type === 'return_surplus' ? TX.youPulled : TX.youHave, { n: qtyLabel(max, v.itemId) })) + '</div>' : '') + '</div>';
      if (s.from) h += '<div class="field"><div class="label">' + esc(TX.from) + '</div>' + chipsHtml('from', s.from, v.from) + '</div>';
    }
    if (s.project) {
      const chips = projectChips(s.from ? v.from : '');
      const cont = v.from && S.ix.locs[v.from.slice(2)];
      // "אחר" – פרויקט שעוד לא קיים במערכת, או שימוש כללי (לא בהחזרת עודף – היא תמיד לפרויקט שממנו נמשך)
      const other = s.type !== 'return_surplus';
      if (chips.length === 1 && cont && (cont.type === 'container' || cont.type === 'cart') && v.projectId !== '_other') {
        h += '<div class="field"><div class="label">' + esc(TX.project) + '</div><div class="hint" style="font-size:15px">' +
          esc(fmt(TX.projectAuto, { project: chips[0].label, container: cont.name })) + '</div>' +
          (other ? '<button class="link" data-a="chip" data-field="projectId" data-v="_other" style="padding:4px 0">' + esc(TX.otherProjectLink) + '</button>' : '') + '</div>';
      } else {
        h += '<div class="field"><div class="label">' + esc(TX.project) + '</div>' +
          (chips.length > 4 ? projectListHtml : (c, sel) => chipsHtml('projectId', c, sel))(other ? chips.concat([chip('_other', TX.otherProject)]) : chips, v.projectId) +
          (v.projectId === '_other' ? '<input id="projNote" class="text" maxlength="120" style="margin-top:8px" placeholder="' + esc(TX.otherProjectQ) + '" value="' + esc(v.projectNote || '') + '">' : '') + '</div>';
      }
    }
    if (s.to) h += '<div class="field"><div class="label">' + esc(TX.to) + '</div>' + chipsHtml('to', s.to.filter(c => c.h !== v.from), v.to) + '</div>';
    if (s.supplier) {
      const chips = S.data.suppliers.map(x => chip(x.id, x.name));
      if (v.action === 'purchase') chips.push(chip('_other', TX.other));
      h += '<div class="field"><div class="label">' + esc(v.action === 'purchase' ? TX.boughtWhere : TX.supplier) + '</div>' + chipsHtml('supplierId', chips, v.supplierId) + '</div>';
      if (v.action === 'purchase') h += '<div class="hint">' + esc(TX.priceHint) + '</div>';
    }
    const noteOpen = v.supplierId === '_other' || v.noteOpen;
    if (v.unknownText || PHOTO_ACTIONS.indexOf(v.action) >= 0) h += photosHtml(v);
    h += noteOpen
      ? '<div class="field"><div class="label">' + esc(TX.note) + '</div><input id="note" class="text" maxlength="300" value="' + esc(v.note || '') + '"></div>'
      : '<button class="link" data-a="noteOpen" style="text-align:right;padding:4px 0">' + esc(TX.note) + '</button>';
    h += '<div id="err" class="error">' + esc(v.err || '') + '</div>';
    h += '<button class="send" data-a="send">' + esc(TX.send) + '</button></main>';
    return h;
  };

  function stepper(v, unit) {
    const per = buyPer(v.itemId);
    let h = '<div class="stepper"><button data-a="step" data-d="1">+</button>' +
      '<input id="qty" type="number" inputmode="numeric" min="0" step="1" value="' + esc(v.qty) + '">' +
      '<button data-a="step" data-d="-1">−</button>' + (per > 1 ? '' : '<span class="unit">' + esc(unit) + '</span>') + '</div>';
    if (per > 1) {
      // מתג: גלילים / מטר, ומתחת – כמה זה ביחידת המלאי
      const it = item(v.itemId);
      const n = parseInt(v.qty, 10) || 0;
      h += '<div class="chips" style="justify-content:center">' +
        '<button class="chip' + (v.unitMode === 'buy' ? ' on' : '') + '" data-a="unitMode" data-v="buy">' + esc(it.buyUnitName) + '</button>' +
        '<button class="chip' + (v.unitMode === 'stock' ? ' on' : '') + '" data-a="unitMode" data-v="stock">' + esc(unit || TX.units) + '</button></div>' +
        (v.unitMode === 'buy' ? '<div class="hint" id="qtyConv" style="text-align:center">' + esc(fmt(TX.unitEquals, { n: num(n), unit: it.buyUnitName, total: num(n * per), stockUnit: unit })) + '</div>' : '');
    }
    return h;
  }
  // כמה יחידות מלאי ביחידת קנייה אחת (0/1 = אין יחידת קנייה)
  function buyPer(id) {
    const it = id && item(id);
    return it && it.buyUnitName && Number(it.buyUnitQty) > 1 ? Number(it.buyUnitQty) : 1;
  }

  // ---------- מסלול "רשימה": פעולה → מאיפה (פעם אחת) → משפחות → מוצר (כמה + לאן) → עוד מוצרים → סיכום → שלח ----------
  // ארבע הפעולות היומיומיות. מוצר אחרי מוצר בלי לחזור כל פעם להתחלה.
  const BK_ACTIONS = ['take', 'transfer', 'return', 'broken'];
  const BK_FROM = { take: 'wh', transfer: 'wh', return: 'me', broken: 'whme' };
  const bkKey = (itemId, projectId) => itemId + '|' + (projectId || '');
  function bkSave() { store.set('basket', S.bk && S.bk.items.length ? S.bk : null); }
  const bkEntry = (itemId, projectId) => S.bk && S.bk.items.find(e => e.k === bkKey(itemId, projectId));
  const bkPickedQty = itemId => (S.bk ? S.bk.items.filter(e => e.itemId === itemId).reduce((t, e) => t + e.qty, 0) : 0);
  function bkFromOptions(action, itemId) {
    const out = locChips(STOCK_TYPES, itemId);
    if (BK_FROM[action] === 'whme') out.push(chip(me(), TX.me, itemId ? qtyAt(itemId, me()) : undefined));
    return out;
  }
  // כל המוצרים שמתחת לתיקייה
  function leavesUnder(fid) {
    const out = [];
    const walk = pid => (S.ix.children[pid] || []).forEach(c => (isLeaf(c.id) ? out.push(c.id) : walk(c.id)));
    walk(fid || '');
    return out;
  }
  const bkBar = () => {
    const n = S.bk ? S.bk.items.length : 0;
    return '<div class="bbar"><button class="finish" data-a="bkSummary"' + (n ? '' : ' disabled') + '>' +
      (n ? esc(TX.bkFinish) + ' <span class="n">' + n + '</span>' : esc(TX.bkEmptyBar)) + '</button></div>';
  };

  // שלב 1: מאיפה – פעם אחת לכל הרשימה
  VIEWS.bfrom = v => {
    const last = store.get('lastFrom:' + S.bk.action, '');
    return top(TX.actions[S.bk.action], true) + '<main class="body"><div class="qlabel">' + esc(TX.bkFrom) + '</div><div class="places">' +
      bkFromOptions(S.bk.action, v.itemId).map(c => '<button class="place' + (c.h === last ? ' last' : '') + '" data-a="bkFrom" data-h="' + esc(c.h) + '">' +
        (c.h === me() ? ICON.user : ICON.home) + '<span class="grow">' + esc(c.label) +
        (c.h === me() ? '<span class="sub">' + esc(TX.bkMeSub) + '</span>' : v.itemId ? '<span class="sub">' + esc(fmt(TX.bkHave, { n: qtyLabel(c.n || 0, v.itemId) })) + '</span>' : '') + '</span>' +
        (c.h === last ? '<span class="tag">' + esc(TX.bkLast) + '</span>' : '') + '</button>').join('') +
      '</div></main>';
  };

  // שלב 2: משפחות → תתי-משפחות → מוצרים (חיפוש תמיד למעלה)
  function bkCrumbs(fid) {
    const path = [];
    let it = item(fid);
    while (it) { path.unshift(it); it = item(it.parentId); }
    return '<div class="bcrumbs"><b>' + esc(holderName(S.bk.from)) + '</b>' + path.map((f, i) => '<span class="sep">›</span>' +
      (i < path.length - 1 ? '<button data-a="bkJump" data-id="' + f.id + '">' + esc(f.name) + '</button>' : '<b>' + esc(f.name) + '</b>')).join('') + '</div>';
  }
  function bkRow(id, opts) {
    opts = opts || {};
    const have = qtyAt(id, S.bk.from);
    const picked = bkPickedQty(id);
    return '<button class="row brow' + (picked ? ' picked' : '') + '" data-a="bkItem" data-id="' + id + '"' + (opts.extra || '') + '><span class="grow">' +
      '<div class="name">' + esc(opts.short ? item(id).name : displayName(id)) + '</div>' +
      '<div class="sub' + (have || opts.sub ? '' : ' zero') + '">' + esc(opts.sub || (have ? fmt(TX.bkHave, { n: qtyLabel(have, id) }) : TX.bkNone)) + '</div></span>' +
      (picked ? '<span class="badge">' + esc(fmt(TX.bkPickedOne, { n: qtyLabel(picked, id) })) + '</span>' : ICON.chevron) + '</button>';
  }
  function bkCatHtml(fid) {
    const kids = S.ix.children[fid || ''] || [];
    const folders = kids.filter(c => !isLeaf(c.id) && leavesUnder(c.id).length);
    const leaves = kids.filter(c => isLeaf(c.id));
    let h = '';
    if (folders.length) {
      h += '<div class="tiles' + (fid ? ' sub' : '') + '">' + folders.map(f => {
        const under = leavesUnder(f.id);
        const picked = under.filter(id => bkPickedQty(id) > 0).length;
        return '<button class="tile' + (picked ? ' has' : '') + '" data-a="bkOpen" data-id="' + f.id + '">' + (picked ? '<span class="picked">' + esc(fmt(TX.bkPicked, { n: picked })) + '</span>' : '') +
          '<span class="nm">' + esc(f.name) + '</span><span class="ct">' + esc(fmt(TX.bkItems, { n: under.length })) + '</span></button>';
      }).join('') + '</div>';
    }
    if (leaves.length) h += (folders.length ? '<div class="qlabel" style="margin-top:6px">' + esc(TX.bkProducts) + '</div>' : '') +
      '<div class="list blist">' + leaves.map(c => bkRow(c.id, { short: true })).join('') + '</div>';
    return h || '<div class="empty">' + esc(TX.bkNothingHere) + '</div>';
  }
  function bkSearchHtml(q) {
    const words = norm(q).split(' ').filter(Boolean);
    const hits = S.ix.leaves.filter(i => words.every(w => S.ix.search[i.id].indexOf(w) >= 0)).slice(0, 40);
    return hits.length ? '<div class="list blist">' + hits.map(i => bkRow(i.id)).join('') + '</div>' : '<div class="empty">' + esc(fmt(TX.noResults, { q })) + '</div>';
  }
  // "החזרה למחסן": רק מה שרשום על העובד – כלים, מתכלה שהועבר אליו, ומה שמשך לפרויקטים
  function bkMineHtml() {
    const rows = myTools().map(t => bkRow(t.itemId, { sub: fmt(TX.bkOnYou, { n: qtyLabel(t.qty, t.itemId) }), extra: ' data-held="1"' }));
    myPulls().forEach(p => rows.push(bkRow(p.itemId, {
      sub: fmt(TX.bkPulledFor, { n: qtyLabel(p.qty, p.itemId), project: pullProject(p) }), extra: ' data-project="' + p.projectId + '"',
    })));
    return rows.length ? '<div class="list blist">' + rows.join('') + '</div>' : '<div class="empty">' + esc(TX.bkMineEmpty) + '</div>';
  }
  VIEWS.bcat = v => {
    const fid = v.fid || '';
    const title = fid ? item(fid).name : TX.actions[S.bk.action];
    const mine = S.bk.action === 'return';
    return top(title, true) + (mine ? '' : bkCrumbs(fid)) + '<main class="body">' +
      (mine ? '' : '<label class="search">' + ICON.search + '<input id="bq" type="search" autocomplete="off" placeholder="' + esc(TX.search) + '" value="' + esc(v.q || '') + '"></label>') +
      '<div id="bres">' + (mine ? bkMineHtml() : v.q ? bkSearchHtml(v.q) : bkCatHtml(fid)) + '</div>' +
      (S.bk.action === 'take' ? '<button class="link" data-a="unknown">' + esc(TX.unknownLink) + '</button>' : '') +
      '</main>' + bkBar();
  };

  // שלב 3: מוצר – כמה, ולאן / לאיזה פרויקט / מה קרה. לא שואלים שוב מאיפה.
  function bkInit(v) {
    if (v.init) return;
    v.init = true;
    v.action = S.bk.action;
    v.from = S.bk.from;
    const e = bkEntry(v.itemId, v.projectId);
    if (e) { Object.assign(v, { qty: e.typed, unitMode: e.unitMode, to: e.to, projectId: e.projectId, projectNote: e.projectNote, what: e.what, held: e.held }); return; }
    v.qty = 1;
    v.unitMode = buyPer(v.itemId) > 1 ? 'buy' : 'stock';
    const max = myMax(v, v.projectId);
    if (v.unitMode === 'buy' && max !== null && max % buyPer(v.itemId) !== 0) v.unitMode = 'stock';
    const lastTo = store.get('lastTo:' + v.action, '');
    if (bkToChips(v).some(c => c.h === lastTo)) v.to = lastTo;
    v.what = store.get('lastWhat', 'broken');
    if (v.action === 'take') autoProject(v);
  }
  const bkToChips = v => locChips(STOCK_TYPES).filter(c => c.h !== v.from);
  const bkIsTool = v => kindOf(v.itemId) === 'tool';
  VIEWS.bitem = v => {
    bkInit(v);
    const id = v.itemId;
    const editing = !!bkEntry(id, v.projectId);
    const max = myMax(v, v.projectId);
    const haveAt = v.action === 'return' ? null : qtyAt(id, v.from);
    let h = top(TX.actions[v.action], true) + '<main class="body">' +
      '<div class="path">' + esc(pathNames(id).join(' › ')) + '</div><div class="iname">' + esc(displayName(id)) + '</div>' +
      (haveAt !== null ? '<span class="have">' + esc(fmt(TX.bkHaveAt, { place: holderName(v.from), n: qtyLabel(haveAt, id) })) + '</span>' : '') +
      '<div class="field"><div class="qlabel">' + esc(TX.qty) + '</div>' + stepper(v, unitName(id)) +
      (max !== null ? '<div class="hint" style="text-align:center">' + esc(fmt(v.projectId ? TX.youPulled : TX.youHave, { n: qtyLabel(max, id) })) + '</div>' : '') + '</div>';
    if (v.action === 'take') {
      if (bkIsTool(v)) h += '<div class="hint" style="font-size:15px">' + esc(TX.bkToolMe) + '</div>';
      else {
        const chips = projectChips(v.from);
        const cont = S.ix.locs[v.from.slice(2)];
        if (chips.length === 1 && cont && (cont.type === 'container' || cont.type === 'cart') && v.projectId !== '_other') {
          h += '<div class="field"><div class="qlabel">' + esc(TX.project) + '</div><div class="hint" style="font-size:15px">' +
            esc(fmt(TX.projectAuto, { project: chips[0].label, container: cont.name })) + '</div>' +
            '<button class="link" data-a="chip" data-field="projectId" data-v="_other" style="padding:4px 0;text-align:right">' + esc(TX.otherProjectLink) + '</button></div>';
        } else {
          const all = chips.concat([chip('_other', TX.otherProject)]);
          h += '<div class="field"><div class="qlabel">' + esc(TX.project) + '</div>' +
            (chips.length > 4 ? projectListHtml(all, v.projectId) : chipsHtml('projectId', all, v.projectId)) +
            (v.projectId === '_other' ? '<input id="projNote" class="text" maxlength="120" style="margin-top:8px" placeholder="' + esc(TX.otherProjectQ) + '" value="' + esc(v.projectNote || '') + '">' : '') + '</div>';
        }
      }
    } else if (v.action === 'transfer' || v.action === 'return') {
      h += '<div class="field"><div class="qlabel">' + esc(TX.bkToWh) + '</div>' + chipsHtml('to', bkToChips(v), v.to) + '</div>';
    } else if (v.action === 'broken') {
      h += '<div class="field"><div class="qlabel">' + esc(TX.brokenQ) + '</div>' + chipsHtml('what', [chip('broken', TX.brokenOpt), chip('lost', TX.lostOpt)], v.what) + '</div>';
    }
    h += (editing ? '<button class="link danger" data-a="bkRemove">' + esc(TX.bkRemove) + '</button>' : '') +
      '<div id="err" class="error">' + esc(v.err || '') + '</div></main>' +
      '<div class="bbar"><button class="addbtn" data-a="bkAdd">' + ICON.check + esc(editing ? TX.bkUpdate : TX.bkAdd) + '</button></div>';
    return h;
  };

  // שלב 4: סיכום לפני שליחה – אפשר לתקן או להוציא
  function bkDest(e) {
    if (S.bk.action === 'take') return e.projectId === '_other' ? e.projectNote : e.projectId ? (S.ix.projects[e.projectId] || {}).name : TX.bkToolShort;
    if (S.bk.action === 'broken') return e.what === 'lost' ? TX.lostOpt : TX.brokenOpt;
    return holderName(e.to);
  }
  VIEWS.bsum = v => {
    const bk = S.bk;
    const n = bk.items.length;
    return top(TX.bkSummary, true) + '<main class="body">' +
      '<div class="sumhead">' + esc(fmt(bk.action === 'return' ? TX.bkSumHeadMine : TX.bkSumHead, { action: TX.actions[bk.action], from: holderName(bk.from), n })) + '</div>' +
      (n ? '<div class="list sumlist">' + bk.items.map((e, i) => '<div class="sumrow"><button class="grow" data-a="bkEdit" data-i="' + i + '">' +
        '<div class="name">' + esc(displayName(e.itemId)) + '</div><div class="sub">' + esc((bk.action === 'broken' ? '' : '← ') + bkDest(e)) + '</div></button>' +
        '<span class="q">' + esc(e.label) + '</span><button class="x" data-a="bkDel" data-i="' + i + '" aria-label="' + esc(TX.bkRemove) + '">✕</button></div>').join('') + '</div>' +
        '<div class="hint">' + esc(TX.bkEditHint) + '</div>' : '<div class="empty">' + esc(TX.bkEmptyList) + '</div>') +
      (bk.action === 'broken' ? photosHtml(v) : '') +
      '<div id="err" class="error"></div></main>' +
      '<div class="bbar"><button class="finish" data-a="bkSend"' + (n ? '' : ' disabled') + '>' + esc(fmt(TX.bkSend, { n })) + '</button>' +
      '<button class="link" data-a="back" style="width:100%">' + esc(TX.bkMore) + '</button></div>';
  };

  // ---------- קבלת סחורה ----------
  VIEWS.receive = () => {
    // הזמנה לכמה מחסנים – שורה לכל מחסן; כל עובד בוחר את המחסן שאליו הסחורה הגיעה
    const rows = [];
    S.data.orders.forEach(o => {
      const dests = [];
      S.data.orderLines.filter(l => l.orderId === o.id).forEach(l => { const d = l.destId || o.destId; if (dests.indexOf(d) < 0) dests.push(d); });
      dests.forEach(d => rows.push({ o, d, n: S.data.orderLines.filter(l => l.orderId === o.id && (l.destId || o.destId) === d).length }));
    });
    return top(TX.receiveTitle, true) + '<main class="body"><div class="list">' +
      (rows.length ? rows.map(x => {
        const dr = rcvDraft(x.o.id, x.d);
        const other = othersReceived(x.o.id, x.d);
        return '<button class="row" data-a="order" data-id="' + x.o.id + '" data-dest="' + x.d + '"><span class="grow"><div class="name">' +
          esc(fmt(TX.orderLine, { number: x.o.number, supplier: (S.ix.sups[x.o.supplierId] || {}).name || '', n: x.n })) + '</div>' +
          '<div class="sub">' + esc(fmt(TX.toPlace, { place: holderName('L:' + x.d) })) + (dr ? ' · <b>' + esc(fmt(TX.rcvHasDraft, { n: Object.keys(dr.counted || {}).length })) + '</b>' : '') +
          (other ? '<br><b>' + esc(fmt(TX.rcvOtherStarted, other)) + '</b>' : '') +
          '</div></span>' + ICON.chevron + '</button>';
      }).join('') : '<div class="empty">' + esc(TX.noOpenOrders) + '</div>') +
      '<button class="row" data-a="action" data-action="purchase"><span class="grow"><div class="name">' + esc(TX.noOrder) + '</div></span>' + ICON.chevron + '</button>' +
      '</div></main>';
  };

  // עובד אחר כבר קלט מההזמנה הזו (למחסן הזה) – מי ומתי האחרון
  function othersReceived(orderId, destId) {
    let last = null;
    orderLinesOf(orderId, destId).forEach(x => {
      const l = x.line;
      if (l.received > 0 && l.lastBy && l.lastBy !== S.data.me.id && (!last || l.lastAt > last.lastAt)) last = l;
    });
    return last ? { name: (S.ix.people[last.lastBy] || {}).name || '', date: relDate(last.lastAt) } : null;
  }

  function orderLinesOf(orderId, destId) {
    const o = S.ix.orders[orderId] || {};
    return S.data.orderLines.filter(l => l.orderId === orderId && item(l.itemId) && (!destId || (l.destId || o.destId) === destId)).map(l => {
      const per = l.buyUnitQty || 1;
      const remaining = Math.max(0, Math.round((l.qtyBuy - l.received / per) * 100) / 100);
      const it = item(l.itemId);
      const u = per > 1 ? it.buyUnitName || '' : unitName(l.itemId);
      return { line: l, per, remaining, unit: u === 'יחידה' ? '' : u };
    });
  }

  // קבלת סחורה = טיוטת ספירה: מסמנים מוצר אחרי מוצר, רואים את כל מה שנספר ומתקנים,
  // ושום דבר לא נכנס למלאי עד "שלח קבלה". הטיוטה נשמרת בטלפון (אפשר לצאת ולחזור).
  const rcvKey = (id, dest) => 'rcv:' + id + (dest ? ':' + dest : '');
  const rcvDraft = (id, dest) => store.get(rcvKey(id, dest), null);
  function saveRcv(v) {
    if (Object.keys(v.counted).length) store.set(rcvKey(v.orderId, v.destId), { counted: v.counted, to: v.to, base: v.base });
    else store.set(rcvKey(v.orderId, v.destId), null);
  }

  VIEWS.receiveOrder = v => {
    const o = S.ix.orders[v.orderId];
    if (!o) return VIEWS.receive();
    if (!v.init) {
      v.init = true;
      v.destId = v.destId || o.destId;
      const d = rcvDraft(o.id, v.destId) || {};
      v.counted = d.counted || {};
      v.base = d.base || {};
      v.to = d.to || 'L:' + v.destId;
      v.qtys = {};
      v.q = '';
    }
    const lines = orderLinesOf(o.id, v.destId);
    const open = lines.filter(x => x.remaining > 0);
    // מה שכבר התקבל בינתיים (למשל ממכשיר אחר) – יוצא מהטיוטה
    Object.keys(v.counted).forEach(id => {
      if (open.some(x => x.line.id === id)) return;
      const x = lines.find(y => y.line.id === id);
      if (x && (v.dropped = v.dropped || []).indexOf(x.line.itemId) < 0) v.dropped.push(x.line.itemId);
      delete v.counted[id];
    });
    saveRcv(v);
    const n = open.filter(x => v.counted[x.line.id] !== undefined).length;
    const pending = open.length - n;
    return top(fmt(TX.orderLine, { number: o.number, supplier: (S.ix.sups[o.supplierId] || {}).name || '', n: lines.length }), true) +
      '<main class="body"><div class="recvhead"><div class="recvprog"><b>' + esc(fmt(TX.rcvProgress, { n, total: open.length })) + '</b>' +
      '<div class="barw"><div class="bar" style="width:' + (open.length ? Math.round(n / open.length * 100) : 0) + '%"></div></div></div>' +
      '<input id="rq" class="text" type="search" placeholder="' + esc(TX.recvSearch) + '" value="' + esc(v.q) + '" autocomplete="off"></div>' +
      '<div class="hint">' + esc(TX.rcvDraftHint) + '</div>' +
      (v.dropped && v.dropped.length ? '<div class="banner warn">' + esc(fmt(TX.rcvDropped, { items: v.dropped.map(displayName).join(', ') })) + '</div>' : '') +
      '<div class="field"><div class="label">' + esc(TX.arrivedTo) + '</div>' + chipsHtml('to', locChips(STOCK_TYPES), v.to) + '</div>' +
      photosHtml(v) +
      '<div id="recvList">' + rcvListHtml(v, lines) + '</div>' +
      '<div id="err" class="error"></div>' +
      (pending > 1 ? '<button class="link" data-a="rcvAll" style="padding:8px 0">' + esc(TX.rcvAllRest) + '</button>' : '') +
      '<button class="send" data-a="rcvSend"' + (n ? '' : ' disabled style="opacity:.5"') + '>' + esc(fmt(TX.rcvSend, { n })) + '</button></main>';
  };

  function rcvListHtml(v, lines) {
    const words = norm(v.q).split(' ').filter(Boolean);
    const match = x => !words.length || words.every(w => (S.ix.search[x.line.itemId] || norm(displayName(x.line.itemId))).indexOf(w) >= 0);
    const open = lines.filter(x => x.remaining > 0 && match(x));
    const todo = open.filter(x => v.counted[x.line.id] === undefined);
    const done = open.filter(x => v.counted[x.line.id] !== undefined);
    const before = lines.filter(x => x.remaining <= 0 && match(x));
    if (!todo.length && !done.length && !before.length) return '<div class="empty">' + esc(TX.recvNone) + '</div>';
    // כמות ברירת מחדל = מה שנשאר (נשמרת, כדי ש-+/− יתחילו ממנה)
    const qtyOf = x => { if (v.qtys[x.line.id] === undefined) v.qtys[x.line.id] = x.remaining; return v.qtys[x.line.id]; };
    const sub = x => esc(fmt(TX.recvOrdered, { n: num(x.line.qtyBuy) + (x.unit ? ' ' + x.unit : '') })) +
      (x.line.received > 0 ? ' · ' + esc(fmt(TX.recvLeft, { n: num(x.remaining) })) +
        (x.line.lastBy && x.line.lastBy !== S.data.me.id ? ' · ' + esc(fmt(TX.rcvBy, { name: (S.ix.people[x.line.lastBy] || {}).name || '' })) : '') : '');
    let h = '';
    if (todo.length) {
      h += '<div class="label">' + esc(fmt(TX.rcvTodo, { n: todo.length })) + '</div><div class="list">' + todo.map(x =>
        '<div class="recvrow"><div class="name">' + esc(displayName(x.line.itemId)) + '</div><div class="sub">' + sub(x) + '</div>' +
        '<div class="recvctl"><span class="stepper"><button data-a="lineStep" data-id="' + x.line.id + '" data-d="1">+</button>' +
        '<input data-line="' + x.line.id + '" type="number" inputmode="numeric" min="0" value="' + esc(qtyOf(x)) + '">' +
        '<button data-a="lineStep" data-id="' + x.line.id + '" data-d="-1">−</button></span>' +
        '<button class="recvbtn" data-a="rcvCount" data-id="' + x.line.id + '">' + ICON.check + esc(TX.rcvCounted) + '</button></div></div>').join('') + '</div>';
    }
    if (done.length) {
      h += '<div class="label">' + esc(fmt(TX.rcvDone, { n: done.length })) + '</div><div class="list">' + done.map(x => {
        const q = Number(v.counted[x.line.id]) || 0;
        return '<div class="recvrow counted' + (q < x.remaining ? ' short' : '') + '"><div class="name">' + ICON.check + ' ' + esc(displayName(x.line.itemId)) + '</div>' +
          '<div class="sub">' + sub(x) + (q < x.remaining ? ' · <b>' + esc(fmt(TX.rcvShort, { n: num(x.remaining - q) })) + '</b>' : '') + '</div>' +
          '<div class="recvctl"><span class="stepper"><button data-a="rcvStep" data-id="' + x.line.id + '" data-d="1">+</button>' +
          '<input data-cline="' + x.line.id + '" type="number" inputmode="numeric" min="0" value="' + esc(v.counted[x.line.id]) + '">' +
          '<button data-a="rcvStep" data-id="' + x.line.id + '" data-d="-1">−</button></span>' +
          '<button class="mini" data-a="rcvUncount" data-id="' + x.line.id + '">' + esc(TX.rcvUncount) + '</button></div></div>';
      }).join('') + '</div>';
    }
    if (before.length) {
      h += '<div class="label">' + esc(fmt(TX.rcvBefore, { n: before.length })) + '</div><div class="list">' + before.map(x =>
        '<div class="recvrow done"><span class="grow">' + ICON.check + ' ' + esc(displayName(x.line.itemId)) + ' · ' +
        esc(fmt(TX.recvGot, { n: num(Math.round(x.line.received / x.per * 100) / 100) })) + '</span></div>').join('') + '</div>';
    }
    return h;
  }
  // חיפוש: מעדכנים רק את הרשימה – המקלדת נשארת פתוחה. כמויות נשמרות תוך כדי הקלדה.
  document.addEventListener('input', e => {
    const v = cur();
    if (v.v !== 'receiveOrder') return;
    if (e.target.id === 'rq') {
      v.q = e.target.value;
      document.getElementById('recvList').innerHTML = rcvListHtml(v, orderLinesOf(v.orderId, v.destId));
    } else if (e.target.dataset && e.target.dataset.line) {
      v.qtys[e.target.dataset.line] = e.target.value;
    } else if (e.target.dataset && e.target.dataset.cline) {
      v.counted[e.target.dataset.cline] = e.target.value;
      saveRcv(v);
    }
  });

  // ---------- הציוד שלי ----------
  function relDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const day = x => x.toISOString().slice(0, 10);
    const today = new Date();
    const y = new Date(Date.now() - 86400000);
    if (day(d) === day(today)) return TX.today;
    if (day(d) === day(y)) return TX.yesterday;
    return d.getDate() + '.' + (d.getMonth() + 1);
  }

  VIEWS.mine = v => {
    const tab = v.tab || 'pulls';
    const tools = myTools();
    const toolCount = heldCount();
    let h = top(TX.myCard, true) + '<main class="body"><div class="tabs">' +
      '<button class="' + (tab === 'pulls' ? 'on' : '') + '" data-a="tab" data-tab="pulls">' + esc(TX.tabPulls) + '</button>' +
      '<button class="' + (tab === 'tools' ? 'on' : '') + '" data-a="tab" data-tab="tools">' + esc(fmt(TX.tabTools, { n: toolCount })) + '</button></div>';
    if (tab === 'pulls') {
      const pulls = myPulls();
      if (!pulls.length) return h + '<div class="empty">' + esc(TX.pullsEmpty) + '</div></main>';
      const byProject = {};
      pulls.forEach(p => { (byProject[p.projectId] = byProject[p.projectId] || []).push(p); });
      Object.keys(byProject).forEach(pid => {
        h += '<div class="group">' + esc(pullProject(byProject[pid][0])) + '</div><div class="list">' +
          byProject[pid].map(p => '<div class="row"><span class="grow"><div class="name">' + esc(displayName(p.itemId)) + '</div>' +
            '<div class="sub">' + esc(fmt(TX.pullLine, { date: relDate(p.lastAt), from: holderName(p.lastFrom) })) + '</div></span>' +
            '<span class="qty">' + esc(qtyLabel(p.qty, p.itemId)) + '</span>' +
            '<button class="mini" data-a="returnSurplus" data-id="' + p.itemId + '" data-project="' + pid + '">' + esc(TX.returnSurplus) + '</button></div>').join('') +
          '</div>';
      });
      return h + '<div class="hint">' + esc(TX.pullsHint) + '</div></main>';
    }
    if (!tools.length) return h + '<div class="empty">' + esc(TX.toolsEmpty) + '</div></main>';
    return h + '<div class="list">' + tools.map(t => kindOf(t.itemId) === 'tool'
      ? itemRow(t.itemId, { a: 'card', qty: qtyLabel(t.qty, t.itemId) })
      : '<div class="row"><span class="grow"><div class="name">' + esc(displayName(t.itemId)) + '</div><div class="sub">' + esc(pathNames(t.itemId).join(' › ')) + '</div></span>' +
        '<span class="qty">' + esc(qtyLabel(t.qty, t.itemId)) + '</span><button class="mini" data-a="used" data-id="' + t.itemId + '">' + esc(TX.actions.used) + '</button></div>'
    ).join('') + '</div><div class="hint">' + esc(TX.usedHint) + '</div></main>';
  };

  VIEWS.message = v => top('', false) + '<div class="center">' + esc(v.text) + '</div>';

  // ---------- ציור ----------
  // עדכון שמגיע ברקע (נתונים חדשים, הודעה שנעלמת) לא מצייר מחדש בזמן הקלדה – אחרת המקלדת נסגרת והמסך קופץ.
  // מחכים שהשדה ייצא מפוקוס.
  const typing = () => {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'checkbox' && a.type !== 'file' && a.closest('#app');
  };
  function softRender() {
    if (typing()) { S.renderLater = true; return; }
    render();
  }
  document.addEventListener('focusout', () => setTimeout(() => {
    if (S.renderLater && !typing()) { S.renderLater = false; render(); }
  }, 60));

  function render() {
    const app = document.getElementById('app');
    if (S.fatal) { app.innerHTML = VIEWS.message({ text: S.fatal }); return; }
    if (!S.data) { app.innerHTML = VIEWS.message({ text: TX.loading }); return; }
    const v = cur();
    const html = (VIEWS[v.v] || VIEWS.home)(v);
    app.innerHTML = html + toastHtml();
    app.classList.toggle('bb', html.indexOf('class="bbar"') >= 0);
  }

  function toastHtml() {
    const t = S.toast;
    if (!t) return '';
    return '<div class="toast"><div class="banner ' + t.kind + '">' + (t.kind === 'ok' ? ICON.check : '') +
      '<span class="grow">' + esc(t.text) + '</span>' +
      (t.undoKey ? '<button data-a="undo" data-key="' + t.undoKey + '">' + esc(TX.undo) + '</button>' : '') + '</div></div>';
  }

  let toastTimer = null;
  function toast(kind, text, undoKey) {
    S.toast = { kind, text, undoKey };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { S.toast = null; softRender(); }, undoKey ? 9000 : 5000);
    render();
  }

  // ---------- פעולות ----------
  const H = {};

  // ---- קבלת סחורה (טיוטת ספירה) ----
  H.rcvCount = el => {
    const v = cur();
    readInputs(v);
    const x = orderLinesOf(v.orderId, v.destId).find(y => y.line.id === el.dataset.id);
    if (!x) return;
    v.counted[x.line.id] = v.qtys[x.line.id] !== undefined ? v.qtys[x.line.id] : x.remaining;
    v.base[x.line.id] = x.line.received;
    saveRcv(v);
    render();
  };
  H.rcvStep = el => {
    const v = cur();
    readInputs(v);
    v.counted[el.dataset.id] = Math.max(0, (Number(v.counted[el.dataset.id]) || 0) + Number(el.dataset.d));
    saveRcv(v);
    render();
  };
  H.rcvUncount = el => {
    const v = cur();
    readInputs(v);
    delete v.counted[el.dataset.id];
    saveRcv(v);
    render();
  };
  H.rcvAll = async () => {
    const v = cur();
    readInputs(v);
    const left = orderLinesOf(v.orderId, v.destId).filter(x => x.remaining > 0 && v.counted[x.line.id] === undefined);
    if (!left.length) return;
    if (!(await confirmBox(fmt(TX.rcvAllConfirm, { n: left.length }), TX.rcvAllRest))) return;
    left.forEach(x => { v.counted[x.line.id] = v.qtys[x.line.id] !== undefined ? v.qtys[x.line.id] : x.remaining; v.base[x.line.id] = x.line.received; });
    saveRcv(v);
    render();
  };
  // שליחה: עכשיו (ורק עכשיו) הכל נכנס למלאי
  H.rcvSend = async () => {
    const v = cur();
    readInputs(v);
    const o = S.ix.orders[v.orderId];
    const open = orderLinesOf(v.orderId, v.destId).filter(x => x.remaining > 0);
    const ms = [];
    open.forEach(x => {
      const q = Number(v.counted[x.line.id]) || 0;
      if (q > 0) ms.push({ clientKey: uuid(), clientAt: new Date().toISOString(), type: 'receive', orderLineId: x.line.id, itemId: x.line.itemId, qty: Math.round(q * x.per), to: v.to });
    });
    if (!ms.length) { document.getElementById('err').textContent = TX.qtyMissing; return; }
    const over = open.filter(x => (Number(v.counted[x.line.id]) || 0) > x.remaining);
    if (over.length) {
      const txt = over.map(x => {
        const base = v.base[x.line.id] !== undefined ? v.base[x.line.id] : x.line.received;
        const by = x.line.received > base && x.line.lastBy !== S.data.me.id
          ? ' ' + fmt(TX.rcvOverMeanwhile, { name: (S.ix.people[x.line.lastBy] || {}).name || '' }) : '';
        return '• ' + displayName(x.line.itemId) + ': ' + fmt(TX.rcvOverLine, { left: num(x.remaining), n: num(Number(v.counted[x.line.id])) }) + by;
      }).join('\n');
      if (!(await confirmBox(TX.rcvOverTitle + '\n\n' + txt + '\n\n' + TX.rcvOverQ, TX.rcvOverYes))) return;
    }
    if (!(await confirmBox(fmt(TX.rcvSendConfirm, { n: ms.length, place: holderName(v.to) }), fmt(TX.rcvSend, { n: ms.length })))) return;
    const missing = open.filter(x => (Number(v.counted[x.line.id]) || 0) < x.remaining).length;
    queueDoc(v, ms[0].clientKey, o.id, TX.docKinds.receive + ' · ' + fmt(TX.orderNo, { number: o.number }) + ' · ' + ((S.ix.sups[o.supplierId] || {}).name || ''));
    v.counted = {};
    saveRcv(v);
    // הזמנה לכמה מחסנים: ההודעה מדברת על החלק של המחסן הזה
    const otherDests = S.data.orderLines.some(l => l.orderId === o.id && (l.destId || o.destId) !== v.destId);
    const place = holderName('L:' + v.destId);
    enqueue(ms, missing ? fmt(otherDests ? TX.receivedSomeDest : TX.receivedSome, { number: o.number, n: missing, place })
      : fmt(otherDests ? TX.receivedAllDest : TX.receivedAll, { number: o.number, place }));
  };
  // ---- מסלול "רשימה" ----
  // מתחילים פעולה (מהבית, או מכרטיס פריט – אז המוצר נפתח מיד אחרי "מאיפה")
  async function bkStart(action, itemId) {
    if (S.bk && S.bk.items.length && S.bk.action !== action) {
      if (!(await confirmBox(fmt(TX.bkReplace, { action: TX.actions[S.bk.action], n: S.bk.items.length }), TX.bkReplaceYes))) return;
    }
    if (!S.bk || S.bk.action !== action) S.bk = { action, from: '', items: [] };
    S.bk.pending = itemId || '';
    if (BK_FROM[action] === 'me') {
      S.bk.from = me();
      bkSave();
      return go({ v: 'bcat', fid: '', q: '' });
    }
    // יש כבר רשימה פתוחה מאותו מקום – ממשיכים ממנה
    if (S.bk.items.length && S.bk.from) return bkAfterFrom();
    const opts = bkFromOptions(action, itemId);
    if (opts.length === 1) { S.bk.from = opts[0].h; return bkAfterFrom(); }
    go({ v: 'bfrom', itemId: itemId || '' });
  }
  function bkAfterFrom() {
    bkSave();
    const p = S.bk.pending;
    S.bk.pending = '';
    go({ v: 'bcat', fid: '', q: '' });
    if (p) go({ v: 'bitem', itemId: p });
  }
  H.bkFrom = el => {
    S.bk.from = el.dataset.h;
    store.set('lastFrom:' + S.bk.action, S.bk.from);
    // "מאיפה" נשאל פעם אחת: אחרי הבחירה המסך שלו יוצא מההיסטוריה
    stack.pop();
    stack.push({ v: 'bcat', fid: '', q: '' });
    history.replaceState({ n: stack.length }, '');
    bkSave();
    render();
    if (S.bk.pending) { const p = S.bk.pending; S.bk.pending = ''; go({ v: 'bitem', itemId: p }); }
  };
  H.bkOpen = el => go({ v: 'bcat', fid: el.dataset.id, q: '' });
  H.bkJump = el => {
    const target = el.dataset.id;
    const i = stack.map(x => x.v === 'bcat' && x.fid === target).lastIndexOf(true);
    if (i < 0) return;
    const n = stack.length - 1 - i;
    if (n > 0) history.go(-n);
  };
  H.bkItem = el => go({ v: 'bitem', itemId: el.dataset.id, projectId: el.dataset.project || '', held: el.dataset.held === '1' });
  H.bkEdit = el => {
    const e = S.bk.items[Number(el.dataset.i)];
    go({ v: 'bitem', itemId: e.itemId, projectId: S.bk.action === 'return' ? e.projectId : '', held: e.held });
  };
  H.bkDel = el => { S.bk.items.splice(Number(el.dataset.i), 1); bkSave(); render(); };
  H.bkSummary = () => go({ v: 'bsum' });
  // אחרי ✓ חוזרים צעד אחד – לקטגוריה שממנה נבחר המוצר
  function bkBackWith(text, undoKey) {
    S.toast = { kind: 'ok', text, undoKey };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { S.toast = null; softRender(); }, 6000);
    back();
  }
  H.bkRemove = () => {
    const v = cur();
    S.bk.items = S.bk.items.filter(e => e.k !== bkKey(v.itemId, v.action === 'return' ? v.projectId : ''));
    bkSave();
    bkBackWith(TX.bkRemoved);
  };
  H.bkAdd = async () => {
    const v = cur();
    readInputs(v);
    const fail = msg => { v.err = msg; render(); };
    const typed = parseInt(v.qty, 10);
    if (!(typed > 0)) return fail(TX.qtyMissing);
    const per = v.unitMode === 'buy' ? buyPer(v.itemId) : 1;
    const qty = typed * per;
    const tool = bkIsTool(v);
    if (v.action === 'take' && !tool) {
      if (!v.projectId) return fail(fmt(TX.missing, { field: TX.project }));
      if (v.projectId === '_other' && !String(v.projectNote || '').trim()) return fail(fmt(TX.missing, { field: TX.otherProjectQ }));
    }
    if ((v.action === 'transfer' || v.action === 'return') && !v.to) return fail(fmt(TX.missing, { field: TX.bkToWh }));
    // מה שרשום על העובד – לא יותר ממנו. ממחסן – רק אזהרה (המלאי במערכת לא תמיד מדויק)
    const max = myMax(v, v.projectId);
    const k = bkKey(v.itemId, v.action === 'return' ? v.projectId : '');
    const others = S.bk.items.filter(e => e.itemId === v.itemId && e.k !== k).reduce((t, e) => t + e.qty, 0);
    if (max !== null && qty + others > max) return fail(fmt(v.projectId && v.action === 'return' ? TX.youPulled : TX.overMine, { n: qtyLabel(max - others, v.itemId) }));
    if (max === null && v.from.indexOf('L:') === 0 && qtyAt(v.itemId, v.from) < qty + others) {
      if (!(await confirmBox(fmt(TX.overdraw, { place: holderName(v.from), n: num(qtyAt(v.itemId, v.from)) }), TX.overdrawYes))) return;
    }
    const label = per > 1 ? num(typed) + ' ' + item(v.itemId).buyUnitName : qtyLabel(qty, v.itemId);
    const e = {
      k, itemId: v.itemId, typed, unitMode: v.unitMode, qty, label, to: v.to || '', held: !!v.held || (v.action === 'return' && !v.projectId),
      projectId: v.action === 'take' && tool ? '' : v.projectId || '', projectNote: v.projectId === '_other' ? String(v.projectNote || '').trim() : '', what: v.what,
    };
    const old = bkEntry(v.itemId, v.action === 'return' ? v.projectId : '');
    if (old) Object.assign(old, e); else S.bk.items.push(e);
    if (e.to) store.set('lastTo:' + v.action, e.to);
    if (e.projectId && e.projectId !== '_other') store.set('lastProject', e.projectId);
    if (v.action === 'broken') store.set('lastWhat', e.what);
    bkSave();
    bkBackWith(fmt(old ? TX.bkUpdated : TX.bkAdded, { item: displayName(v.itemId), qty: label }), old ? '' : 'bk:' + k);
  };
  // יציאה מהמסלול כשיש מוצרים ברשימה – שואלים קודם
  H.back = async () => {
    const v = cur();
    if (v.v === 'bcat' && !v.fid && S.bk && S.bk.items.length) {
      if (!(await confirmBox(fmt(TX.bkLeave, { n: S.bk.items.length }), TX.bkLeaveYes))) return;
      S.bk = null;
      bkSave();
    }
    back();
  };
  H.bkContinue = () => bkStart(S.bk.action);
  H.bkDiscard = async () => {
    if (!(await confirmBox(fmt(TX.bkLeave, { n: S.bk.items.length }), TX.bkDiscardYes))) return;
    S.bk = null;
    bkSave();
    render();
  };
  H.bkSend = async () => {
    const v = cur();
    const bk = S.bk;
    const n = bk.items.length;
    if (!n) return;
    if (!(await confirmBox(fmt(TX.bkSendConfirm, { n }), TX.bkSendYes))) return;
    const at = new Date().toISOString();
    const ms = bk.items.map(e => {
      const m = { clientKey: uuid(), clientAt: at, itemId: e.itemId, qty: e.qty, from: bk.from, to: '', projectId: '', projectNote: '', note: '', unknownText: '', supplierId: '' };
      if (bk.action === 'take') {
        if (kindOf(e.itemId) === 'tool') Object.assign(m, { type: 'transfer', to: me() });
        else Object.assign(m, { type: 'pull', to: 'X', projectId: e.projectId, projectNote: e.projectNote });
      } else if (bk.action === 'transfer') {
        Object.assign(m, { type: 'transfer', to: e.to });
      } else if (bk.action === 'return') {
        // מה שנמשך לפרויקט חוזר כ"החזרת עודף" על אותו פרויקט – העלות של הפרויקט יורדת
        if (e.projectId) Object.assign(m, { type: 'return_surplus', from: 'X', to: e.to, projectId: e.projectId });
        else Object.assign(m, { type: 'transfer', from: me(), to: e.to });
      } else {
        Object.assign(m, { type: e.what === 'lost' ? 'lost' : 'broken', to: 'X' });
      }
      return m;
    });
    if (bk.action === 'broken') queueDoc(v, ms[0].clientKey, '', TX.docKinds.broken + ' · ' + bk.items.map(e => item(e.itemId).name).join(', ').slice(0, 80));
    const label = fmt(TX.bkSent, { action: TX.actions[bk.action], n });
    S.bk = null;
    bkSave();
    enqueue(ms, label);
  };

  H.mine = () => go({ v: 'mine', tab: 'pulls' });
  H.tab = el => { cur().tab = el.dataset.tab; render(); };
  H.search = () => { go({ v: 'pick', action: null, q: '' }); focusQ(); };
  H.card = el => go({ v: 'card', itemId: el.dataset.id });
  H.folder = el => { cur().folder = el.dataset.id; cur().q = ''; render(); window.scrollTo(0, 0); };
  H.action = el => {
    const a = el.dataset.action;
    const itemId = el.dataset.id;
    if (a === 'receive') return go({ v: 'receive' });
    if (a === 'more') return go({ v: 'more', itemId });
    if (BK_ACTIONS.indexOf(a) >= 0) return bkStart(a, itemId);
    if (itemId) return go({ v: 'finish', action: a, itemId });
    go({ v: 'pick', action: a, q: '' });
  };
  H.pickItem = el => go({ v: 'finish', action: cur().action, itemId: el.dataset.id, projectId: el.dataset.project || '', held: el.dataset.held === '1' });
  H.used = el => go({ v: 'finish', action: 'used', itemId: el.dataset.id });
  H.returnSurplus = el => go({ v: 'finish', action: 'return', itemId: el.dataset.id, projectId: el.dataset.project });
  H.unknown = () => go({ v: 'unknown', action: cur().action || 'take', text: cur().q || '' });
  H.unknownGo = () => {
    const text = document.getElementById('unknownText').value.trim();
    if (!text) { document.getElementById('err').textContent = fmt(TX.missing, { field: unknownLabel(cur().action) }); return; }
    const action = ['purchase', 'count', 'found'].indexOf(cur().action) >= 0 ? cur().action : 'take';
    go({ v: 'finish', action, unknownText: text });
  };
  H.order = el => go({ v: 'receiveOrder', orderId: el.dataset.id, destId: el.dataset.dest || '' });
  H.noteOpen = () => { cur().noteOpen = true; render(); const n = document.getElementById('note'); if (n) n.focus(); };
  H.chip = el => {
    const v = cur();
    readInputs(v);
    v[el.dataset.field] = el.dataset.v;
    if (el.dataset.field === 'from') autoProject(v);
    v.err = '';
    // רשימת פרויקטים נגללת – שומרים על מקום הגלילה
    const box = el.closest('.plist');
    const st = box ? box.scrollTop : 0;
    render();
    const nb = box && document.querySelector('.plist');
    if (nb) nb.scrollTop = st;
  };
  H.unitMode = el => {
    const v = cur();
    readInputs(v);
    v.unitMode = el.dataset.v;
    // לא יותר ממה שרשום על העובד, ביחידה החדשה
    const max = myMax(v, v.projectId);
    if (max !== null) v.qty = Math.min(parseInt(v.qty, 10) || 0, Math.floor(max / (v.unitMode === 'buy' ? buyPer(v.itemId) : 1)));
    render();
  };
  H.step = el => {
    const v = cur();
    readInputs(v);
    const d = Number(el.dataset.d);
    const max = myMax(v, v.projectId);
    // פחות מגליל שלם רשום על העובד – "+" עובר לבד למטרים
    if (d > 0 && max !== null && v.unitMode === 'buy' && max < buyPer(v.itemId)) {
      v.unitMode = 'stock';
      v.qty = 0;
    }
    let q = Math.max(0, (parseInt(v.qty, 10) || 0) + d);
    // "+" לא עובר את מה שרשום על העובד (ביחידה שנבחרה: גליל או מטר)
    if (max !== null) {
      const per = v.unitMode === 'buy' ? buyPer(v.itemId) : 1;
      q = Math.min(q, Math.floor(max / per));
    }
    v.qty = q;
    render();
  };

  // כמה העובד יכול להחזיר/להעביר מעצמו (ביחידת מלאי), או null כשאין מגבלה
  function myMax(v, projectId) {
    if (!v.itemId) return null;
    const s = spec(v);
    if (s.type === 'return_surplus') {
      return myPulls().filter(p => p.itemId === v.itemId && (!projectId || p.projectId === projectId)).reduce((t, p) => t + p.qty, 0);
    }
    const from = s.fixedFrom || v.from || '';
    if (from === me() && !s.counted) return qtyAt(v.itemId, me());
    return null;
  }
  H.lineStep = el => {
    const v = cur();
    readInputs(v);
    const id = el.dataset.id;
    v.qtys[id] = Math.max(0, (Number(v.qtys[id]) || 0) + Number(el.dataset.d));
    render();
  };
  H.undo = el => {
    const k = el.dataset.key;
    // ביטול הוספה לרשימה (עוד לא נשלח כלום)
    if (k.indexOf('bk:') === 0) {
      if (S.bk) S.bk.items = S.bk.items.filter(e => e.k !== k.slice(3));
      bkSave();
      S.toast = null;
      return render();
    }
    undo(k);
  };
  H.send = () => sendFinish();

  function readInputs(v) {
    const q = document.getElementById('qty');
    if (q) v.qty = q.value;
    const n = document.getElementById('note');
    if (n) v.note = n.value;
    const pn = document.getElementById('projNote');
    if (pn) v.projectNote = pn.value;
    document.querySelectorAll('input[data-line]').forEach(i => { v.qtys[i.dataset.line] = i.value; });
  }

  function focusQ() { const q = document.getElementById('q'); if (q) q.focus(); }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el || !H[el.dataset.a]) return;
    e.preventDefault();
    H[el.dataset.a](el);
  });
  document.addEventListener('input', e => {
    // הקלדת כמות בגלילים – מעדכנים את "= 200 מטר" תוך כדי
    if (e.target.id === 'qty' && document.getElementById('qtyConv')) {
      const v = cur();
      const it = item(v.itemId);
      const n = parseInt(e.target.value, 10) || 0;
      document.getElementById('qtyConv').textContent = fmt(TX.unitEquals, { n: num(n), unit: it.buyUnitName, total: num(n * buyPer(v.itemId)), stockUnit: unitName(v.itemId) });
      return;
    }
    if (e.target.id === 'bq') {
      const v = cur();
      v.q = e.target.value;
      document.getElementById('bres').innerHTML = norm(v.q) ? bkSearchHtml(v.q) : bkCatHtml(v.fid);
      return;
    }
    if (e.target.id === 'q') {
      const v = cur();
      v.q = e.target.value;
      if (v.q) v.folder = '';
      document.getElementById('results').innerHTML = pickResults(v);
    }
  });

  // ---------- שליחה ----------
  function confirmBox(text, yes) {
    return new Promise(resolve => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = '<div class="modal"><p style="white-space:pre-line">' + esc(text) + '</p><div class="btns"><button class="yes">' + esc(yes) +
        '</button><button class="no">' + esc(TX.cancel) + '</button></div></div>';
      bg.addEventListener('click', e => {
        if (e.target.closest('.yes')) { bg.remove(); resolve(true); }
        else if (e.target.closest('.no') || e.target === bg) { bg.remove(); resolve(false); }
      });
      document.body.appendChild(bg);
    });
  }

  async function sendFinish() {
    const v = cur();
    readInputs(v);
    const s = spec(v);
    const fail = msg => { v.err = msg; render(); };
    const typed = parseInt(v.qty, 10);
    if (s.counted ? !(typed >= 0) : !(typed > 0)) return fail(TX.qtyMissing);
    // בגלילים: המערכת סופרת ביחידת המלאי (מטר), אז 2 גלילים = 200
    const per = v.unitMode === 'buy' ? buyPer(v.itemId) : 1;
    const qty = typed * per;
    const from = s.fixedFrom || v.from || '';
    const to = s.fixedTo || v.to || '';
    if (s.from && !v.from) return fail(fmt(TX.missing, { field: TX.from }));
    if (s.to && !v.to) return fail(fmt(TX.missing, { field: TX.to }));
    let projectId = '';
    if (s.project) {
      const chips = projectChips(s.from ? v.from : '');
      // החזרת עודף – תמיד לפרויקט שממנו נמשך (גם אם נסגר בינתיים)
      projectId = v.projectId === '_other' ? '_other' : s.type === 'return_surplus' && v.projectId ? v.projectId : chips.length === 1 ? chips[0].h : v.projectId;
      if (!projectId) return fail(fmt(TX.missing, { field: TX.project }));
      if (projectId === '_other' && !String(v.projectNote || '').trim()) return fail(fmt(TX.missing, { field: TX.otherProjectQ }));
    }
    if (s.supplier && v.action === 'returnSupplier' && !v.supplierId) return fail(fmt(TX.missing, { field: TX.supplier }));
    const type = s.what ? v.what : s.type;

    // מה שרשום על העובד עצמו – אי אפשר להחזיר/להעביר יותר ממנו
    const max = myMax(v, projectId);
    if (max !== null && qty > max) {
      return fail(fmt(s.type === 'return_surplus' ? TX.youPulled : TX.overMine, { n: qtyLabel(max, v.itemId) }));
    }
    // ממחסן או מאדם אחר – המלאי במערכת לא תמיד מדויק, אז רק מזהירים
    if (max === null && v.itemId && !s.counted && (from.indexOf('L:') === 0 || from.indexOf('P:') === 0) && qtyAt(v.itemId, from) < qty) {
      const okGo = await confirmBox(fmt(TX.overdraw, { place: holderName(from), n: num(qtyAt(v.itemId, from)) }), TX.overdrawYes);
      if (!okGo) return;
    }
    if (projectId && projectId !== '_other') store.set('lastProject', projectId);
    const m = {
      clientKey: uuid(), clientAt: new Date().toISOString(), type, itemId: v.itemId || '', unknownText: v.unknownText || '',
      qty: s.counted ? null : qty, countedQty: s.counted ? qty : null, from, to, projectId,
      projectNote: projectId === '_other' ? String(v.projectNote || '').trim() : '',
      supplierId: v.supplierId && v.supplierId !== '_other' ? v.supplierId : '', note: v.note || '',
    };
    const label = per > 1 ? num(typed) + ' ' + item(v.itemId).buyUnitName + ' (' + qtyLabel(qty, v.itemId) + ')'
      : s.counted ? num(qty) : qtyLabel(qty, v.itemId);
    queueDoc(v, m.clientKey, '', v.unknownText ? TX.docKinds.unknown + ' · ' + v.unknownText : TX.docKinds[s.what ? v.what : v.action] + (v.itemId ? ' · ' + item(v.itemId).name : ''));
    enqueue([m], fmt(TX.sent, { qty: label, item: v.itemId ? displayName(v.itemId) : v.unknownText }));
  }



  // נכנס לתור, מתעדכן מיד במסך, ונשלח ברקע
  function enqueue(ms, label) {
    const key0 = ms[0].clientKey;
    S.snaps[key0] = { keys: ms.map(m => m.clientKey), stock: JSON.stringify(S.data.stock), personal: JSON.stringify(S.data.personal) };
    ms.forEach(m => { S.queue.push(m); applyLocal(m); });
    store.set('queue', S.queue);
    store.set('boot', S.data);
    goHome();
    toast('ok', label, key0);
    flush();
  }

  // עדכון מקומי עד שהשרת עונה (ספירה מחושבת רק בשרת)
  function applyLocal(m) {
    const d = S.data;
    if (m.type === 'receive' && m.orderLineId) {
      const ol = (d.orderLines || []).find(l => l.id === m.orderLineId);
      if (ol) ol.received = (ol.received || 0) + m.qty;
    }
    if (m.itemId && m.type !== 'count') {
      const row = d.stock[m.itemId] = d.stock[m.itemId] || {};
      const isHolder = h => h && h !== 'X' && h.indexOf('S:') !== 0;
      if (isHolder(m.from)) row[m.from] = (row[m.from] || 0) - m.qty;
      if (isHolder(m.to)) row[m.to] = (row[m.to] || 0) + m.qty;
    }
    const p = d.personal;
    if (m.itemId) {
      p.recentItemIds = [m.itemId].concat((p.recentItemIds || []).filter(x => x !== m.itemId)).slice(0, 8);
      if (m.from === me() || m.to === me()) {
        let t = p.tools.find(x => x.itemId === m.itemId);
        if (!t) { t = { itemId: m.itemId, qty: 0 }; p.tools.push(t); }
        t.qty += m.to === me() ? m.qty : -m.qty;
        p.tools = p.tools.filter(x => x.qty > 0);
      }
      if ((m.type === 'pull' || m.type === 'return_surplus') && m.from !== me() && m.projectId !== '_other') {
        let g = p.pulls.find(x => x.itemId === m.itemId && x.projectId === m.projectId);
        if (!g && m.type === 'pull') { g = { itemId: m.itemId, projectId: m.projectId, qty: 0, lastAt: m.clientAt, lastFrom: m.from }; p.pulls.unshift(g); }
        if (g) {
          g.qty += m.type === 'pull' ? m.qty : -m.qty;
          if (m.type === 'pull') { g.lastAt = m.clientAt; g.lastFrom = m.from; }
        }
        p.pulls = p.pulls.filter(x => x.qty > 0);
      }
    }
  }

  async function undo(key0) {
    const snap = S.snaps[key0];
    S.toast = null;
    if (!snap) return render();
    const queued = snap.keys.filter(k => S.queue.some(m => m.clientKey === k));
    if (queued.length === snap.keys.length) {
      S.queue = S.queue.filter(m => snap.keys.indexOf(m.clientKey) < 0);
      S.data.stock = JSON.parse(snap.stock);
      S.data.personal = JSON.parse(snap.personal);
      store.set('queue', S.queue);
      store.set('boot', S.data);
      delete S.snaps[key0];
      return toast('ok', TX.undone);
    }
    try {
      for (const k of snap.keys) {
        const id = S.sentIds[k];
        if (!id) continue;
        const r = await api('field.undo', { movementId: id });
        if (!r.ok) return toast('err', r.error || TX.generic);
      }
      delete S.snaps[key0];
      toast('ok', TX.undone);
      refresh();
    } catch (e) {
      toast('err', TX.generic);
    }
  }

  // ניסיון חוזר מהיר: 2, 4, 8, 16, 30 שניות. השרת של גוגל לפעמים מתעכב או נקטע – זה לא אומר שאין קליטה.
  let retryMs = 0;
  let retryTimer = null;
  function scheduleRetry() {
    retryMs = Math.min(retryMs ? retryMs * 2 : 2000, 30000);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(flush, retryMs);
  }

  // נתונים טריים מהשרת + מה שעוד בתור מעליהם
  function applyBoot(boot) {
    S.serverBoot = JSON.stringify(boot);
    S.data = boot;
    S.queue.forEach(applyLocal);
    buildIndex();
    store.set('boot', S.data);
    if (['finish', 'unknown', 'pick'].indexOf(cur().v) < 0) softRender();
  }
  // הנתונים מהשרת + מה שעוד בתור (אחרי ביטול של דיווח שבתור)
  function rebuildLocal() {
    if (!S.serverBoot) return;
    S.data = JSON.parse(S.serverBoot);
    S.queue.forEach(applyLocal);
    buildIndex();
    store.set('boot', S.data);
  }

  async function flush() {
    if (S.flushing || !S.queue.length) return;
    S.flushing = true;
    clearTimeout(retryTimer);
    const batch = S.queue.slice(0, 50);
    const wasRetrying = retryMs > 0;
    let ok = false;
    try {
      const r = await api('field.submit', { movements: batch, withBoot: true });
      if (!r.ok) {
        if (r.code === 'AUTH') return fatal(TX.badLink);
        return scheduleRetry();
      }
      ok = true;
      retryMs = 0;
      const done = {};
      r.data.results.forEach(res => {
        done[res.clientKey] = true;
        if (res.ok && res.id) S.sentIds[res.clientKey] = res.id;
        if (!res.ok) {
          const m = batch.find(x => x.clientKey === res.clientKey) || {};
          toast('err', fmt(TX.failed, { item: m.itemId && item(m.itemId) ? displayName(m.itemId) : m.unknownText || '', error: res.error }));
        }
      });
      S.queue = S.queue.filter(m => !done[m.clientKey]);
      store.set('queue', S.queue);
      if (wasRetrying && !S.toast) toast('ok', TX.flushed);
      if (r.data.boot) applyBoot(r.data.boot);
      else refresh();
    } catch (e) {
      scheduleRetry();
    } finally {
      S.flushing = false;
      if (cur().v === 'home') softRender();
      if (ok && S.queue.length) setTimeout(flush, 300);
    }
  }

  function fatal(text) {
    S.fatal = text;
    render();
  }

  // מושך את הנתונים העדכניים, ומחיל מעליהם מה שעוד מחכה בתור
  // מושך את הנתונים העדכניים, ומחיל מעליהם מה שעוד מחכה בתור. כישלון = שקט; ננסה בפעם הבאה.
  let lastRefresh = 0;
  async function refresh() {
    lastRefresh = Date.now();
    try {
      const r = await api('field.bootstrap');
      if (!r.ok) {
        if (r.code === 'AUTH') { store.set('boot', null); fatal(TX.badLink); }
        return;
      }
      applyBoot(r.data);
    } catch (e) {
      lastRefresh = 0;
    }
  }

  let polling = false;
  let pollAgain = false; // שינוי שהגיע באמצע בדיקה – בודקים שוב מיד אחריה
  async function poll() {
    if (polling) { pollAgain = true; return; }
    if (S.flushing || S.queue.length || !S.data || document.visibilityState !== 'visible') return;
    polling = true;
    try {
      const r = await api('ping');
      if (r.ok && r.data.ver && r.data.ver !== S.data.ver) await refresh();
    } catch (e) {
      /* ננסה שוב בבדיקה הבאה */
    } finally {
      polling = false;
      if (pollAgain) { pollAgain = false; setTimeout(poll, 0); }
    }
  }

  // ---------- צילום מסמכים ----------
  // צילומים מוקטנים בטלפון, נשמרים בתור (IndexedDB – גם בלי קליטה), והסקריפט של גוגל הופך אותם ל-PDF ב-Drive.
  const PHOTO_ACTIONS = ['purchase', 'broken', 'returnSupplier'];
  const DOCS = { count: 0, busy: false };

  function photosHtml(v) {
    if (!window.ENGINE) return '';
    const ph = v.photos || [];
    return '<div class="field"><div class="label">' + esc(TX.photoLabel) + '</div>' +
      (ph.length ? '<div class="thumbs">' + ph.map((p, i) => '<span class="thumb"><img src="data:image/jpeg;base64,' + p + '" alt=""><button data-a="photoRemove" data-i="' + i + '">✕</button></span>').join('') + '</div>' : '') +
      '<label class="photobtn">' + ICON.camera + esc(ph.length ? TX.photoMore : TX.photoAdd) +
      '<input type="file" accept="image/*" capture="environment" multiple data-photo hidden></label></div>';
  }
  H.photoRemove = el => { const v = cur(); readInputs(v); v.photos.splice(Number(el.dataset.i), 1); render(); };
  document.addEventListener('change', async e => {
    if (!e.target.matches('input[data-photo]')) return;
    const v = cur();
    readInputs(v);
    v.photos = v.photos || [];
    for (const f of [...e.target.files].slice(0, 10)) {
      try { v.photos.push(await shrink(f)); } catch (err) { /* קובץ שאינו תמונה */ }
    }
    render();
  });
  // מקטינים לצלע ארוכה של 2200 פיקסלים – חד מספיק לקריאת חשבונית, ועדיין סביר לשליחה
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 2200 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
      img.src = url;
    });
  }

  // תור המסמכים
  function idb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('inv-docs', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbDo(mode, fn) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('q', mode);
      const out = fn(tx.objectStore('q'));
      tx.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      tx.onerror = () => reject(tx.error);
    });
  }
  const pad2 = n => String(n).padStart(2, '0');
  function stamp() {
    const d = new Date();
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad2(d.getHours()) + '-' + pad2(d.getMinutes());
  }
  // שם אוטומטי: איזה טופס · על מה · מי · מתי
  function queueDoc(v, clientKey, orderId, what) {
    if (!v.photos || !v.photos.length || !window.ENGINE) return;
    const job = { id: uuid(), clientKey, orderId: orderId || '', kind: v.unknownText ? 'unknown' : v.action || 'receive',
      name: what + ' · ' + S.data.me.name + ' · ' + stamp(), images: v.photos.slice(), token: S.token };
    v.photos = [];
    idbDo('readwrite', st => st.put(job)).then(() => { DOCS.count += 1; flushDocs(); }).catch(() => { /* אין אחסון – מוותרים על המסמך */ });
  }
  async function flushDocs() {
    if (DOCS.busy || !window.ENGINE) return;
    DOCS.busy = true;
    try {
      const jobs = (await idbDo('readonly', st => st.getAll())).filter(j => j.token === S.token);
      DOCS.count = jobs.length;
      for (const j of jobs) {
        if (navigator.onLine === false) break;
        // 1. הקובץ ל-Drive (פעם אחת – אם כבר עלה, יש לו fileId)
        if (!j.fileId) {
          const r = await window.ENGINE.uploadDoc({ name: j.name, images: j.images });
          if (!r.ok) { if (r.code === 'AUTH') await idbDo('readwrite', st => st.delete(j.id)); continue; }
          j.fileId = r.data.fileId;
          j.url = r.data.url;
          j.images = [];
          await idbDo('readwrite', st => st.put(j));
        }
        // 2. רישום במערכת
        const r2 = await api('field.doc', { doc: { fileId: j.fileId, url: j.url, kind: j.kind, name: j.name, orderId: j.orderId, clientKey: j.clientKey } });
        if (r2.ok || r2.code === 'AUTH') await idbDo('readwrite', st => st.delete(j.id));
      }
      DOCS.count = (await idbDo('readonly', st => st.getAll())).filter(j => j.token === S.token).length;
    } catch (e) {
      /* אין קליטה – ננסה שוב */
    } finally {
      DOCS.busy = false;
      if (cur().v === 'home') render();
    }
  }

  // ---------- הפעלה ----------
  function start() {
    S.bk = store.get('basket', null);
    if (!S.token) { S.fatal = TX.noLink; render(); return; }
    history.replaceState({ n: 1 }, '');
    S.data = store.get('boot', null);
    S.queue = store.get('queue', []);
    if (S.data) buildIndex();
    render();
    // קודם שולחים מה שמחכה (התשובה מביאה גם נתונים טריים); אם אין מה לשלוח – רק מרעננים
    if (S.queue.length) flush(); else refresh();
    flushDocs();
    setInterval(flushDocs, 30000);
    const onNet = () => { if (cur().v === 'home') softRender(); if (navigator.onLine) { flush(); flushDocs(); } };
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    // חזרה לאפליקציה: שולחים מיד, ומרעננים אם עברו יותר מדקה
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (S.queue.length) { retryMs = 0; flush(); } else poll();
    });
    // כל 20 שניות: "השתנה משהו?" – רק אם כן מושכים את כל הנתונים (פריט חדש, הזמנה חדשה, מלאי שהשתנה)
    setInterval(poll, window.ENGINE ? 1500 : 20000); // בגרסת Firebase הבדיקה מקומית (בלי פנייה לרשת)
    // גרסת Firebase: שינוי של מישהו אחר מגיע מיד
    window.addEventListener('inv:changed', poll);
    if ('serviceWorker' in navigator && !window.DEMO_HANDLE) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.FieldApp = { start, S };
})();
