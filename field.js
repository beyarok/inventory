// מסך השטח. דף אחד, בלי ספריות. נתונים נשמרים בטלפון; דיווחים יוצאים ברקע וממתינים כשאין קליטה.

(() => {
  const TX = T.field;
  const STOCK_TYPES = ['hub', 'container', 'vehicle'];

  // ---------- עזרים ----------
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
  const num = n => Number(n || 0).toLocaleString('he-IL');
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
  const norm = s => String(s || '').toLowerCase().replace(/["'״׳`]/g, '').replace(/\s+/g, ' ').trim();

  const svg = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  const ICON = {
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
  };
  const key = n => 'inv:' + n + ':' + S.token;
  const store = {
    get(n, def) { try { const v = localStorage.getItem(key(n)); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set(n, v) { try { localStorage.setItem(key(n), JSON.stringify(v)); } catch (e) { /* אחסון מלא או חסום */ } },
  };

  // ---------- תקשורת ----------
  async function api(action, payload) {
    const req = Object.assign({ action, token: S.token }, payload || {});
    if (window.DEMO_HANDLE) return window.DEMO_HANDLE(req);
    const res = await fetch(window.APP_CONFIG.apiUrl, { method: 'POST', body: JSON.stringify(req) });
    return res.json();
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
  function myPulls() { return (S.data.personal.pulls || []).filter(p => item(p.itemId) && S.ix.projects[p.projectId]); }

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

  function banners() {
    let h = '';
    if (S.queue.length && S.offline) {
      h += '<div class="banner warn">' + ICON.cloud + '<span class="grow">' + esc(fmt(TX.offline, { n: S.queue.length })) + '</span></div>';
    }
    return h;
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
    const tools = myTools().reduce((s, t) => s + t.qty, 0);
    const recents = (d.personal.recentItemIds || []).filter(id => item(id) && isLeaf(id)).slice(0, 5);
    const act = a => '<button class="act" data-a="action" data-action="' + a + '">' + ICON[a] + esc(TX.actions[a]) + '</button>';
    return top(fmt(TX.hello, { name: d.me.name }), false) + '<main class="body">' + banners() +
      '<button class="mycard" data-a="mine">' + ICON.user + '<span class="grow"><div class="t">' + esc(TX.myCard) + '</div>' +
      '<div class="s">' + esc(pulls || tools ? fmt(TX.myCardLine, { pulls, tools }) : TX.myCardEmpty) + '</div></span>' + ICON.chevron + '</button>' +
      '<div class="grid">' + ['take', 'return', 'transfer', 'receive', 'broken', 'more'].map(act).join('') + '</div>' +
      (recents.length ? '<div class="label">' + esc(TX.recent) + '</div><div class="list">' +
        recents.map(id => itemRow(id, { a: 'card' })).join('') + '</div>' : '') +
      '<button class="search" data-a="search">' + ICON.search + '<span class="hint" style="font-size:16px">' + esc(TX.search) + '</span></button>' +
      '</main>';
  };

  // בחירת פריט: חיפוש, "מה רשום עליך", אחרונים, ועץ שנפתח כמו תיקיות
  const MINE_FIRST = ['return', 'transfer', 'broken', 'repairOut'];
  const ALLOW_UNKNOWN = ['take', 'purchase', null];

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
      const rows = myTools().map(t => itemRow(t.itemId, { a, qty: num(t.qty) }));
      if (v.action === 'return') {
        myPulls().forEach(p => rows.push(itemRow(p.itemId, {
          a, qty: qtyLabel(p.qty, p.itemId), sub: S.ix.projects[p.projectId].name,
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
    '<div class="field"><div class="label">' + esc(TX.unknownField) + '</div>' +
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
      '<div class="grid two">' + ['take', 'return', 'transfer', 'more'].map(act).join('') + '</div></main>';
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

  function spec(v) {
    const id = v.itemId;
    const tool = id ? kindOf(id) === 'tool' : false;
    const s = { type: '', from: null, to: null, project: false, supplier: false, what: false, counted: false, fixedFrom: '', fixedTo: '' };
    switch (v.action) {
      case 'take':
        if (tool) { s.type = 'transfer'; s.from = withStock(id, locChips(STOCK_TYPES, id).concat(placesChips(id, { noMe: true }).filter(c => c.h.indexOf('P:') === 0))); s.fixedTo = me(); }
        else { s.type = 'pull'; s.from = id ? withStock(id, locChips(STOCK_TYPES, id)) : locChips(STOCK_TYPES); s.fixedTo = 'X'; s.project = true; }
        break;
      case 'return':
        if (tool) { s.type = 'transfer'; s.fixedFrom = me(); s.to = locChips(STOCK_TYPES); }
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
    v.what = 'broken';
    autoProject(v);
  }

  function autoProject(v) {
    const s = spec(v);
    if (!s.project) return;
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
      h += '<div class="field"><div class="label">' + esc(fmt(TX.countQ, { place: v.from ? holderName(v.from) : '' })) + '</div>' + stepper(v, unit) + '</div>';
    } else {
      h += '<div class="field"><div class="label">' + esc(TX.qty) + '</div>' + stepper(v, unit) + '</div>';
      if (s.from) h += '<div class="field"><div class="label">' + esc(TX.from) + '</div>' + chipsHtml('from', s.from, v.from) + '</div>';
    }
    if (s.project) {
      const chips = projectChips(s.from ? v.from : '');
      const cont = v.from && S.ix.locs[v.from.slice(2)];
      if (chips.length === 1 && cont && cont.type === 'container') {
        h += '<div class="field"><div class="label">' + esc(TX.project) + '</div><div class="hint" style="font-size:15px">' +
          esc(fmt(TX.projectAuto, { project: chips[0].label, container: cont.name })) + '</div></div>';
      } else {
        h += '<div class="field"><div class="label">' + esc(TX.project) + '</div>' + chipsHtml('projectId', chips, v.projectId) + '</div>';
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

  // ---------- קבלת סחורה ----------
  VIEWS.receive = () => {
    const orders = S.data.orders.filter(o => S.data.orderLines.some(l => l.orderId === o.id));
    return top(TX.receiveTitle, true) + '<main class="body"><div class="list">' +
      (orders.length ? orders.map(o => '<button class="row" data-a="order" data-id="' + o.id + '"><span class="grow"><div class="name">' +
        esc(fmt(TX.orderLine, { number: o.number, supplier: (S.ix.sups[o.supplierId] || {}).name || '', n: S.data.orderLines.filter(l => l.orderId === o.id).length })) +
        '</div><div class="sub">' + esc(holderName('L:' + o.destId)) + '</div></span>' + ICON.chevron + '</button>').join('')
        : '<div class="empty">' + esc(TX.noOpenOrders) + '</div>') +
      '<button class="row" data-a="action" data-action="purchase"><span class="grow"><div class="name">' + esc(TX.noOrder) + '</div></span>' + ICON.chevron + '</button>' +
      '</div></main>';
  };

  function orderLinesOf(orderId) {
    return S.data.orderLines.filter(l => l.orderId === orderId && item(l.itemId)).map(l => {
      const per = l.buyUnitQty || 1;
      const remaining = Math.max(0, Math.round((l.qtyBuy - l.received / per) * 100) / 100);
      const it = item(l.itemId);
      const u = per > 1 ? it.buyUnitName || '' : unitName(l.itemId);
      return { line: l, per, remaining, unit: u === 'יחידה' ? '' : u };
    });
  }

  VIEWS.receiveOrder = v => {
    const o = S.ix.orders[v.orderId];
    if (!o) return VIEWS.receive();
    const lines = orderLinesOf(o.id);
    if (!v.init) {
      v.init = true;
      v.qtys = {};
      lines.forEach(x => { v.qtys[x.line.id] = x.remaining; });
      v.to = 'L:' + o.destId;
    }
    return top(fmt(TX.orderLine, { number: o.number, supplier: (S.ix.sups[o.supplierId] || {}).name || '', n: lines.length }), true) +
      '<main class="body"><div class="label">' + esc(TX.whatArrived) + '</div><div class="list">' +
      lines.map(x => '<div class="row"><span class="grow"><div class="name">' + esc(displayName(x.line.itemId)) + '</div>' +
        '<div class="sub">' + num(x.remaining) + ' ' + esc(x.unit) + '</div></span>' +
        '<span class="stepper" style="gap:6px"><button data-a="lineStep" data-id="' + x.line.id + '" data-d="1" style="width:40px;height:40px;font-size:20px">+</button>' +
        '<input data-line="' + x.line.id + '" type="number" inputmode="numeric" min="0" value="' + esc(v.qtys[x.line.id]) + '" style="width:64px;font-size:18px">' +
        '<button data-a="lineStep" data-id="' + x.line.id + '" data-d="-1" style="width:40px;height:40px;font-size:20px">−</button></span></div>').join('') +
      '</div><div class="field"><div class="label">' + esc(TX.arrivedTo) + '</div>' + chipsHtml('to', locChips(STOCK_TYPES), v.to) + '</div>' +
      '<div id="err" class="error"></div><button class="send" data-a="receiveGo">' + esc(TX.confirmReceive) + '</button></main>';
  };

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
    const toolCount = tools.reduce((s, t) => s + t.qty, 0);
    let h = top(TX.myCard, true) + '<main class="body"><div class="tabs">' +
      '<button class="' + (tab === 'pulls' ? 'on' : '') + '" data-a="tab" data-tab="pulls">' + esc(TX.tabPulls) + '</button>' +
      '<button class="' + (tab === 'tools' ? 'on' : '') + '" data-a="tab" data-tab="tools">' + esc(fmt(TX.tabTools, { n: toolCount })) + '</button></div>';
    if (tab === 'pulls') {
      const pulls = myPulls();
      if (!pulls.length) return h + '<div class="empty">' + esc(TX.pullsEmpty) + '</div></main>';
      const byProject = {};
      pulls.forEach(p => { (byProject[p.projectId] = byProject[p.projectId] || []).push(p); });
      Object.keys(byProject).forEach(pid => {
        h += '<div class="group">' + esc(S.ix.projects[pid].name) + '</div><div class="list">' +
          byProject[pid].map(p => '<div class="row"><span class="grow"><div class="name">' + esc(displayName(p.itemId)) + '</div>' +
            '<div class="sub">' + esc(fmt(TX.pullLine, { date: relDate(p.lastAt), from: holderName(p.lastFrom) })) + '</div></span>' +
            '<span class="qty">' + esc(qtyLabel(p.qty, p.itemId)) + '</span>' +
            '<button class="mini" data-a="returnSurplus" data-id="' + p.itemId + '" data-project="' + pid + '">' + esc(TX.returnSurplus) + '</button></div>').join('') +
          '</div>';
      });
      return h + '<div class="hint">' + esc(TX.pullsHint) + '</div></main>';
    }
    if (!tools.length) return h + '<div class="empty">' + esc(TX.toolsEmpty) + '</div></main>';
    return h + '<div class="list">' + tools.map(t => itemRow(t.itemId, { a: 'card', qty: num(t.qty) })).join('') + '</div></main>';
  };

  VIEWS.message = v => top('', false) + '<div class="center">' + esc(v.text) + '</div>';

  // ---------- ציור ----------
  function render() {
    const app = document.getElementById('app');
    if (S.fatal) { app.innerHTML = VIEWS.message({ text: S.fatal }); return; }
    if (!S.data) { app.innerHTML = VIEWS.message({ text: TX.loading }); return; }
    const v = cur();
    app.innerHTML = (VIEWS[v.v] || VIEWS.home)(v) + toastHtml();
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
    toastTimer = setTimeout(() => { S.toast = null; render(); }, undoKey ? 9000 : 5000);
    render();
  }

  // ---------- פעולות ----------
  const H = {};
  H.back = () => back();
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
    if (itemId) return go({ v: 'finish', action: a, itemId });
    go({ v: 'pick', action: a, q: '' });
  };
  H.pickItem = el => go({ v: 'finish', action: cur().action, itemId: el.dataset.id, projectId: el.dataset.project || '' });
  H.returnSurplus = el => go({ v: 'finish', action: 'return', itemId: el.dataset.id, projectId: el.dataset.project });
  H.unknown = () => go({ v: 'unknown', action: cur().action || 'take', text: cur().q || '' });
  H.unknownGo = () => {
    const text = document.getElementById('unknownText').value.trim();
    if (!text) { document.getElementById('err').textContent = fmt(TX.missing, { field: TX.unknownField }); return; }
    const action = cur().action === 'purchase' ? 'purchase' : 'take';
    go({ v: 'finish', action, unknownText: text });
  };
  H.order = el => go({ v: 'receiveOrder', orderId: el.dataset.id });
  H.noteOpen = () => { cur().noteOpen = true; render(); const n = document.getElementById('note'); if (n) n.focus(); };
  H.chip = el => {
    const v = cur();
    readInputs(v);
    v[el.dataset.field] = el.dataset.v;
    if (el.dataset.field === 'from') autoProject(v);
    v.err = '';
    render();
  };
  H.unitMode = el => {
    const v = cur();
    readInputs(v);
    v.unitMode = el.dataset.v;
    render();
  };
  H.step = el => {
    const v = cur();
    readInputs(v);
    v.qty = Math.max(0, (parseInt(v.qty, 10) || 0) + Number(el.dataset.d));
    render();
  };
  H.lineStep = el => {
    const v = cur();
    readInputs(v);
    const id = el.dataset.id;
    v.qtys[id] = Math.max(0, (Number(v.qtys[id]) || 0) + Number(el.dataset.d));
    render();
  };
  H.undo = el => undo(el.dataset.key);
  H.send = () => sendFinish();
  H.receiveGo = () => sendReceive();

  function readInputs(v) {
    const q = document.getElementById('qty');
    if (q) v.qty = q.value;
    const n = document.getElementById('note');
    if (n) v.note = n.value;
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
      bg.innerHTML = '<div class="modal"><p>' + esc(text) + '</p><div class="btns"><button class="yes">' + esc(yes) +
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
      projectId = chips.length === 1 ? chips[0].h : v.projectId;
      if (!projectId) return fail(fmt(TX.missing, { field: TX.project }));
    }
    if (s.supplier && v.action === 'returnSupplier' && !v.supplierId) return fail(fmt(TX.missing, { field: TX.supplier }));
    const type = s.what ? v.what : s.type;

    if (v.itemId && !s.counted && (from.indexOf('L:') === 0 || from.indexOf('P:') === 0) && qtyAt(v.itemId, from) < qty) {
      const okGo = await confirmBox(fmt(TX.overdraw, { place: holderName(from), n: num(qtyAt(v.itemId, from)) }), TX.overdrawYes);
      if (!okGo) return;
    }
    if (type === 'return_surplus' && v.itemId) {
      const pulled = myPulls().filter(p => p.itemId === v.itemId && p.projectId === projectId).reduce((t, p) => t + p.qty, 0);
      if (qty > pulled) {
        const okGo = await confirmBox(fmt(TX.overReturn, { n: num(pulled) }), TX.overdrawYes);
        if (!okGo) return;
      }
    }
    if (projectId) store.set('lastProject', projectId);
    const m = {
      clientKey: uuid(), clientAt: new Date().toISOString(), type, itemId: v.itemId || '', unknownText: v.unknownText || '',
      qty: s.counted ? null : qty, countedQty: s.counted ? qty : null, from, to, projectId,
      supplierId: v.supplierId && v.supplierId !== '_other' ? v.supplierId : '', note: v.note || '',
    };
    const label = per > 1 ? num(typed) + ' ' + item(v.itemId).buyUnitName + ' (' + qtyLabel(qty, v.itemId) + ')'
      : s.counted ? num(qty) : qtyLabel(qty, v.itemId);
    enqueue([m], fmt(TX.sent, { qty: label, item: v.itemId ? displayName(v.itemId) : v.unknownText }));
  }

  function sendReceive() {
    const v = cur();
    readInputs(v);
    const lines = orderLinesOf(v.orderId);
    const ms = [];
    lines.forEach(x => {
      const q = Number(v.qtys[x.line.id]) || 0;
      if (q > 0) ms.push({ clientKey: uuid(), clientAt: new Date().toISOString(), type: 'receive', orderLineId: x.line.id, itemId: x.line.itemId, qty: Math.round(q * x.per), to: v.to });
    });
    if (!ms.length) { document.getElementById('err').textContent = TX.qtyMissing; return; }
    const o = S.ix.orders[v.orderId];
    enqueue(ms, fmt(TX.receivedOk, { number: o.number }));
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
      if (m.type === 'pull' || m.type === 'return_surplus') {
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

  async function flush() {
    if (S.flushing || !S.queue.length) return;
    S.flushing = true;
    const batch = S.queue.slice(0, 50);
    const wasOffline = S.offline;
    try {
      const r = await api('field.submit', { movements: batch });
      S.offline = false;
      if (!r.ok) {
        if (r.code === 'AUTH') return fatal(TX.badLink);
        return;
      }
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
      if (wasOffline && !S.toast) toast('ok', TX.flushed);
      await refresh();
    } catch (e) {
      S.offline = true;
      if (cur().v === 'home') render();
    } finally {
      S.flushing = false;
      if (S.queue.length && !S.offline) setTimeout(flush, 500);
    }
  }

  function fatal(text) {
    S.fatal = text;
    render();
  }

  // מושך את הנתונים העדכניים, ומחיל מעליהם מה שעוד מחכה בתור
  async function refresh() {
    try {
      const r = await api('field.bootstrap');
      if (!r.ok) {
        if (r.code === 'AUTH') { store.set('boot', null); fatal(TX.badLink); }
        return;
      }
      S.offline = false;
      S.data = r.data;
      S.queue.forEach(applyLocal);
      buildIndex();
      store.set('boot', S.data);
      const v = cur().v;
      if (['finish', 'receiveOrder', 'unknown', 'pick'].indexOf(v) < 0) render();
    } catch (e) {
      S.offline = true;
      if (cur().v === 'home') render();
    }
  }

  // ---------- הפעלה ----------
  function start() {
    if (!S.token) { S.fatal = TX.noLink; render(); return; }
    history.replaceState({ n: 1 }, '');
    S.data = store.get('boot', null);
    S.queue = store.get('queue', []);
    if (S.data) buildIndex();
    render();
    refresh().then(flush);
    window.addEventListener('online', flush);
    setInterval(() => { if (S.queue.length) flush(); }, 20000);
    setInterval(() => { if (!S.queue.length && document.visibilityState === 'visible' && cur().v === 'home') refresh(); }, 120000);
    if ('serviceWorker' in navigator && !window.DEMO_HANDLE) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.FieldApp = { start, S };
})();
