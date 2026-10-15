// נוצר אוטומטית מתיקיית gas/ (build.ps1) – לא לערוך כאן.

// ==================== Config.gs ====================
// הגדרות קבועות ומבנה הגיליונות. ראה docs/data-model.md

const CONFIG = {
  TIMEZONE: 'Asia/Jerusalem',
  APP_VERSION: '1.0.0',
  UNDO_MINUTES: 10,          // כמה זמן עובד יכול לבטל דיווח שלו
  SESSION_SECONDS: 21600,    // תוקף כניסת מנהל (6 שעות – המקסימום של CacheService)
  LOCK_MS: 20000,
  BACKUP_FOLDER: 'גיבויי מלאי',
  DOCS_FOLDER: 'מסמכי מלאי',
};

// עמודות לכל גיליון. סיומת :n = מספר, :b = כן/לא. כל השאר טקסט.
const SCHEMA = {
  Items: ['id', 'parentId', 'name', 'kind', 'unitId', 'buyUnitName', 'buyUnitQty:n', 'minQty:n',
    'aliases', 'imageId', 'value:n', 'sort:n', 'archived:b', 'createdAt', 'updatedAt', 'isFolder:b'],
  Units: ['id', 'name', 'archived:b'],
  Locations: ['id', 'name', 'type', 'address', 'archived:b'],
  ContainerProjects: ['id', 'containerId', 'projectId', 'from', 'to'],
  People: ['id', 'name', 'role', 'email', 'token', 'alerts:b', 'archived:b'],
  Projects: ['id', 'name', 'status', 'openedAt', 'closedAt', 'note', 'archived:b'],
  Suppliers: ['id', 'name', 'phone', 'contact', 'note', 'archived:b', 'email', 'vatId', 'address', 'extraDiscount:n'],
  // מחירון ספק: לכל ספק ופריט – קוד אצל הספק, מחיר מחירון והנחה רגילה (ליחידת קנייה, לפני מע"מ)
  SupplierItems: ['id', 'supplierId', 'itemId', 'code', 'listPrice:n', 'discount:n', 'updatedAt', 'archived:b'],
  Movements: ['id', 'at', 'clientAt', 'clientKey', 'type', 'itemId', 'qty:n', 'from', 'to', 'projectId',
    'byPersonId', 'orderId', 'orderLineId', 'unitPrice:n', 'supplierId', 'note', 'reversesId', 'flags'],
  UnknownItems: ['id', 'text', 'movementId', 'byPersonId', 'at', 'status', 'itemId'],
  // extraDiscount – הנחה נוספת על כל ההזמנה (%), אחרי ההנחות בשורות
  Orders: ['id', 'number:n', 'supplierId', 'destId', 'status', 'pricesIncludeVat:b', 'vatRate:n',
    'createdBy', 'createdAt', 'sentAt', 'closedAt', 'note', 'extraDiscount:n', 'destIds'],  // destIds – כמה מחסנים (מופרדים בפסיק); destId = הראשון
  // unitPriceBuy = נטו (מחירון פחות הנחה). listPrice/discount – מה שסגרו בהזמנה הזו. saveToList – לעדכן את מחירון הספק בשליחה
  // expectedAt – מתי הספק אמר שהיתרה תגיע (YYYY-MM-DD). לפיו נקבע איחור; בלעדיו – ימים מהשליחה
  OrderLines: ['id', 'orderId', 'itemId', 'qtyBuy:n', 'buyUnitQty:n', 'unitPriceBuy:n', 'listPrice:n', 'discount:n', 'saveToList:b', 'expectedAt', 'destId'],  // destId – לאיזה מחסן השורה (ריק = היעד של ההזמנה)
  Prices: ['id', 'itemId', 'supplierId', 'at', 'unitPrice:n', 'source', 'refId', 'listPrice:n', 'discount:n', 'qty:n'],
  Settings: ['key', 'value'],
  Log: ['at', 'byPersonId', 'action', 'entity', 'entityId', 'summary', 'before', 'after'],
  // מסמכים מצולמים (PDF ב-Drive): קבלת סחורה, קנייה בחנות, נזק, פריט לא מוכר, הצעת מחיר...
  Docs: ['id', 'at', 'byPersonId', 'kind', 'name', 'fileId', 'url', 'orderId', 'clientKey', 'note', 'archived:b'],
};

const ID_PREFIX = {
  Items: 'IT', Units: 'UN', Locations: 'LC', ContainerProjects: 'CP', People: 'PE', Projects: 'PR',
  Suppliers: 'SU', Movements: 'MV', UnknownItems: 'UK', Orders: 'OR', OrderLines: 'OL', Prices: 'PC', Docs: 'DC', SupplierItems: 'SI',
};

const DEFAULT_SETTINGS = {
  vatRate: '18',
  lateDays: '7',
  stalePriceMonths: '6',
  digestHour: '7',
  nextOrderNumber: '1',
  companyName: 'אומנויות בירוק בע"מ',
  companyDetails: '',   // פרטי החברה במסמך הזמנה לספק (כתובת, ח.פ., טלפון)
  lastDigestAt: '',
};

const DEFAULT_UNITS = ['יחידה', 'מטר', 'גליל', 'קרטון', 'ליטר', 'קילו', 'זוג'];

const LOCATION_TYPES = ['hub', 'container', 'cart', 'vehicle', 'repair'];  // vehicle – רק לנתונים ישנים
const STOCK_LOCATION_TYPES = ['hub', 'container', 'cart'];   // נספרים מול המינימום
const SITE_LOCATION_TYPES = ['container', 'cart'];           // משויכים לפרויקטים

// סוגי התנועות. field = מותר לעובד שטח. from/to = סוגי מחזיקים מותרים:
// L = מקום, P = אדם, S = ספק, X = נצרך/יצא, R = מקום מסוג "בתיקון"
const MOVE_TYPES = {
  opening:         { field: false, from: [''],       to: ['L', 'P'] },
  receive:         { field: true,  from: ['S'],      to: ['L'] },
  purchase:        { field: true,  from: ['S', ''],  to: ['L', 'P', 'X'] },
  pull:            { field: true,  from: ['L', 'P'], to: ['X'] },
  return_surplus:  { field: true,  from: ['X'],      to: ['L', 'P'] },
  transfer:        { field: true,  from: ['L', 'P'], to: ['L', 'P'] },
  repair_out:      { field: true,  from: ['L', 'P'], to: ['R'] },
  repair_in:       { field: true,  from: ['R'],      to: ['L', 'P'] },
  broken:          { field: true,  from: ['L', 'P'], to: ['X'] },
  lost:            { field: true,  from: ['L', 'P'], to: ['X'] },
  found:           { field: true,  from: ['X'],      to: ['L', 'P'] },
  return_supplier: { field: true,  from: ['L'],      to: ['S'] },
  count:           { field: true,  from: ['L', 'P', 'R', 'X'], to: ['L', 'P', 'R', 'X'] },
  reversal:        { field: false, from: null,       to: null },
};

// הודעות שגיאה למשתמש. הנוסח הסופי מגיע מלשונית "טקסטים לאישור" במסמך התכנון.
const MSG = {
  generic: 'לא הצלחתי לשמור. נסה שוב בעוד רגע.',
  badLink: 'הקישור הזה כבר לא פעיל. צריך לבקש קישור חדש מהמנהל.',
  notAdmin: 'לחשבון הזה אין הרשאת ניהול. אפשר לבקש ממנהל קיים להוסיף אותך.',
  sessionExpired: 'צריך להתחבר שוב.',
  qtyMissing: 'צריך לבחור כמות',
  missing: 'חסר: ',
  duplicateName: 'כבר יש "{name}" בתיקייה הזו',
  personHasTools: 'על {name} רשומים {n} כלים. צריך להחזיר או להעביר אותם קודם.',
  folderHasStock: 'בתיקייה הזו יש פריטים עם מלאי. קודם צריך להעביר אותם או לאפס את המלאי.',
  locationHasStock: 'ב{name} יש עדיין מלאי. קודם צריך להעביר אותו.',
  projectHasMoves: 'על {name} כבר נרשמו דיווחים, אז אפשר רק לסגור אותו (אם הדיווחים נרשמו בטעות – קודם לבטל אותם בארכיון › כל התנועות).',
  lastAdmin: 'אי אפשר להסיר את המנהל האחרון. קודם צריך להוסיף מנהל אחר.',
  undoExpired: 'עבר הזמן לביטול. אפשר לתקן עם פעולה הפוכה, או לבקש מהמנהל.',
  conflict: 'מישהו אחר שינה את זה בינתיים. רענן ונסה שוב.',
};

// גרסת Firebase (v2) – לא סודי (מופיע גם בדף)
const FIREBASE = {
  projectId: 'inventory-beyarok',
  apiKey: 'AIzaSyB2LdUuYDc6MC9q7wggiMPF26eoFEN7pKY',
  adminUrl: 'https://beyarok.github.io/inventory/v2/admin.html',
};

// ==================== Util.gs ====================
// עזרים כלליים – משותפים לגיליון (Db.gs) ולגרסת Firebase (v2/engine.js)

function now_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function today_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

// שגיאה שההודעה שלה מוצגת למשתמש כמו שהיא
function userError_(msg, vars) {
  const text = fill_(msg, vars);
  const e = new Error(text);
  e.userMessage = text;
  throw e;
}

function fill_(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_MS);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function round2_(n) {
  return Math.round(Number(n) * 100) / 100;
}

// ==================== Model.gs ====================
// חישובים: עץ הפריטים, מחזיקים, ומלאי מתוך יומן התנועות.

const Model = (() => {
  let cache = null;

  function reset() { cache = null; }

  function index_() {
    if (cache) return cache;
    const items = Db.all('Items', { includeArchived: true });
    const children = {};
    items.forEach(it => {
      if (it.archived) return;
      const p = it.parentId || '';
      (children[p] = children[p] || []).push(it);
    });
    cache = { items, children, stock: null };
    return cache;
  }

  function item(id) { return Db.byId('Items', id); }

  function childrenOf(id) { return index_().children[id || ''] || []; }

  // עלה = פריט שאפשר להחזיק ממנו מלאי: בלי תתי-סוגים, ולא נוצר כתיקייה (תיקייה ריקה היא עדיין תיקייה)
  function isLeaf(id) { return childrenOf(id).length === 0 && !(item(id) || {}).isFolder; }

  // ערך שעובר בירושה מלמעלה (kind, unitId)
  function inherited(id, field) {
    let it = item(id);
    let guard = 0;
    while (it && guard++ < 50) {
      if (it[field]) return it[field];
      it = item(it.parentId);
    }
    return '';
  }

  function kindOf(id) { return inherited(id, 'kind') || 'consumable'; }

  function path(id) {
    const names = [];
    let it = item(id);
    let guard = 0;
    while (it && guard++ < 50) {
      names.unshift(it.name);
      it = item(it.parentId);
    }
    return names;
  }

  // כל הצאצאים (כולל עצמו)
  function descendants(id) {
    const out = [id];
    childrenOf(id).forEach(c => { out.push.apply(out, descendants(c.id)); });
    return out;
  }

  // ---------- מחזיקים ----------
  // "L:LC-0001" מקום · "P:PE-0001" אדם · "S:SU-0001" ספק · "X" נצרך/יצא · "" אין

  function holderKind(h) {
    if (!h) return '';
    if (h === 'X') return 'X';
    const [k, id] = h.split(':');
    if (k === 'L') {
      const loc = Db.byId('Locations', id);
      return loc && loc.type === 'repair' ? 'R' : 'L';
    }
    return k;
  }

  function holderExists(h) {
    const k = holderKind(h);
    if (k === '' || k === 'X') return true;
    const id = h.split(':')[1];
    const table = { L: 'Locations', R: 'Locations', P: 'People', S: 'Suppliers' }[k];
    const row = table && Db.byId(table, id);
    return !!(row && !row.archived);
  }

  function holderName(h) {
    if (!h) return '';
    if (h === 'X') return 'נצרך';
    const [k, id] = h.split(':');
    const table = { L: 'Locations', P: 'People', S: 'Suppliers' }[k];
    const row = table && Db.byId(table, id);
    return row ? row.name : h;
  }

  // ---------- מלאי ----------

  function reversedIds_() {
    const ids = {};
    Db.all('Movements').forEach(m => { if (m.reversesId) ids[m.reversesId] = true; });
    return ids;
  }

  // { itemId: { holder: qty } } – רק יתרות שאינן אפס, בלי X ובלי ספקים
  function balances() {
    const c = index_();
    if (c.stock) return c.stock;
    const b = {};
    const add = (itemId, h, q) => {
      if (!h || h === 'X' || h.indexOf('S:') === 0) return;
      const row = b[itemId] = b[itemId] || {};
      row[h] = (row[h] || 0) + q;
    };
    Db.all('Movements').forEach(m => {
      if (!m.itemId || !m.qty) return;
      add(m.itemId, m.from, -m.qty);
      add(m.itemId, m.to, m.qty);
    });
    Object.keys(b).forEach(itemId => {
      Object.keys(b[itemId]).forEach(h => { if (b[itemId][h] === 0) delete b[itemId][h]; });
    });
    c.stock = b;
    return b;
  }

  function qtyAt(itemId, holder) {
    const row = balances()[itemId];
    return (row && row[holder]) || 0;
  }

  function isStockLocation_(h) {
    if (!h || h.indexOf('L:') !== 0) return false;
    const loc = Db.byId('Locations', h.slice(2));
    return !!(loc && STOCK_LOCATION_TYPES.indexOf(loc.type) >= 0);
  }

  // מה שבמחסנים (מרלו"ג + מכולות) – נבדק מול המינימום
  function warehouseQty(itemId) {
    const row = balances()[itemId] || {};
    return Object.keys(row).reduce((s, h) => s + (isStockLocation_(h) ? row[h] : 0), 0);
  }

  // מה שרשום על מחזיק: [{itemId, qty}]
  function heldBy(holder) {
    const b = balances();
    const out = [];
    Object.keys(b).forEach(itemId => {
      const q = b[itemId][holder];
      if (q) out.push({ itemId, qty: q });
    });
    return out;
  }

  // "משכתי": מתכלה שהעובד משך לפרויקטים פתוחים, פחות עודפים שהחזיר
  function pullsOf(personId) {
    const reversed = reversedIds_();
    const openProjects = {};
    Db.all('Projects').forEach(p => { if (p.status === 'open') openProjects[p.id] = true; });
    const groups = {};
    Db.all('Movements').forEach(m => {
      if (m.byPersonId !== personId || reversed[m.id] || !openProjects[m.projectId] || !m.itemId) return;
      if (m.type !== 'pull' && m.type !== 'return_surplus') return;
      if (m.type === 'pull' && String(m.from).indexOf('P:') === 0) return; // "השתמשתי" במה שהיה רשום עליו – אין עודף להחזיר
      const key = m.projectId + '|' + m.itemId;
      const g = groups[key] = groups[key] || { projectId: m.projectId, itemId: m.itemId, qty: 0, lastAt: '', lastFrom: '' };
      if (m.type === 'pull') {
        g.qty += m.qty;
        const t = m.clientAt || m.at;
        if (t > g.lastAt) { g.lastAt = t; g.lastFrom = m.from; }
      } else {
        g.qty -= m.qty;
      }
    });
    return Object.keys(groups).map(k => groups[k]).filter(g => g.qty > 0)
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  }

  // כמה התקבל מכל שורת הזמנה
  function receivedByLine() {
    const reversed = reversedIds_();
    const out = {};
    Db.all('Movements').forEach(m => {
      if (m.type === 'receive' && m.orderLineId && !reversed[m.id]) {
        out[m.orderLineId] = (out[m.orderLineId] || 0) + m.qty;
      }
    });
    return out;
  }

  return {
    reset, item, childrenOf, isLeaf, inherited, kindOf, path, descendants,
    holderKind, holderExists, holderName, balances, qtyAt, warehouseQty, heldBy, pullsOf, receivedByLine,
    reversedIds_,
  };
})();

// ==================== Auth.gs ====================
// הרשאות: עובד שטח מזוהה לפי הטוקן בקישור האישי; מנהל – לפי כניסה עם חשבון גוגל.

function fieldPerson_(token) {
  const t = String(token || '').trim();
  const p = t && Db.all('People').find(x => x.token && x.token === t);
  if (!p) authError_(MSG.badLink);
  return p;
}

// הדף שולח את ה-ID token שהתקבל מ"כניסה עם גוגל". בודקים אותו מול גוגל ומחפשים מנהל עם אותו מייל.
function adminLogin_(idToken) {
  const clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set (Script properties)');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) authError_(MSG.sessionExpired);
  const info = JSON.parse(res.getContentText());
  if (info.aud !== clientId || String(info.email_verified) !== 'true') authError_(MSG.notAdmin);
  const email = String(info.email || '').toLowerCase();
  const p = Db.all('People').find(x => x.role === 'admin' && String(x.email).toLowerCase() === email);
  if (!p) authError_(MSG.notAdmin);
  const session = Utilities.getUuid();
  CacheService.getScriptCache().put('sess:' + session, p.id, CONFIG.SESSION_SECONDS);
  return { session, person: { id: p.id, name: p.name, email: p.email } };
}

// כל קריאה של מנהל מאריכה את הכניסה ב-6 שעות נוספות
function adminPerson_(session) {
  const cache = CacheService.getScriptCache();
  const id = session && cache.get('sess:' + session);
  const p = id && Db.byId('People', id);
  if (!p || p.archived || p.role !== 'admin') authError_(MSG.sessionExpired);
  cache.put('sess:' + session, p.id, CONFIG.SESSION_SECONDS);
  return p;
}

function authError_(msg) {
  const e = new Error(msg);
  e.userMessage = msg;
  e.code = 'AUTH';
  throw e;
}

function newToken_() {
  return Utilities.getUuid().replace(/-/g, '');
}

// ==================== Movements.gs ====================
// רישום תנועות – משותף לשטח ולמנהל. כל שינוי במלאי עובר מכאן.

// inp: { clientKey, clientAt, type, itemId, unknownText, qty, countedQty, from, to, projectId,
//        orderLineId, supplierId, unitPrice, note }
function recordMovement_(inp, actor, isAdmin) {
  const type = String(inp.type || '');
  const rule = MOVE_TYPES[type];
  if (!rule || type === 'reversal') userError_(MSG.missing + 'סוג פעולה');
  if (!isAdmin && !rule.field) userError_(MSG.notAdmin);

  // אותה לחיצה שנשלחה פעמיים (חזרה של קליטה) – נרשמת פעם אחת
  if (inp.clientKey) {
    const dup = Db.all('Movements').find(m => m.clientKey === String(inp.clientKey));
    if (dup) return { id: dup.id, duplicate: true, flags: dup.flags };
  }

  const m = {
    at: now_(),
    clientAt: inp.clientAt || '',
    clientKey: inp.clientKey || '',
    type,
    itemId: inp.itemId || '',
    qty: null,
    from: inp.from || '',
    to: inp.to || '',
    projectId: inp.projectId || '',
    byPersonId: actor.id,
    orderId: '',
    orderLineId: '',
    unitPrice: inp.unitPrice === '' || inp.unitPrice === undefined || inp.unitPrice === null ? null : Number(inp.unitPrice),
    supplierId: inp.supplierId || '',
    note: String(inp.note || '').slice(0, 500),
    reversesId: '',
    flags: '',
  };
  const flags = [];

  // מנהל שרושם בשם עובד (למשל החזרת עודף שהעובד משך) – כדי שזה יירד מ"משכתי" של העובד
  if (isAdmin && inp.byPersonId && inp.byPersonId !== actor.id) {
    const p = Db.byId('People', inp.byPersonId);
    if (!p) userError_(MSG.missing + 'עובד');
    m.byPersonId = p.id;
    m.note = ('נרשם ע"י ' + actor.name + (m.note ? ' · ' + m.note : '')).slice(0, 500);
  }

  // ---- קבלה מהזמנה: הפריט, הספק והמחיר מגיעים מההזמנה ----
  if (type === 'receive') {
    const line = Db.byId('OrderLines', inp.orderLineId);
    const order = line && Db.byId('Orders', line.orderId);
    if (!order) userError_(MSG.missing + 'הזמנה');
    if (['sent', 'partial'].indexOf(order.status) < 0) userError_('ההזמנה הזו כבר לא פתוחה לקבלה');
    m.orderId = order.id;
    m.orderLineId = line.id;
    m.itemId = line.itemId;
    m.supplierId = order.supplierId;
    m.from = 'S:' + order.supplierId;
    m.to = inp.to || 'L:' + (line.destId || order.destId);
    m.unitPrice = unitPriceFromLine_(line, order);
  }

  // ---- פריט ----
  let unknown = false;
  if (!m.itemId) {
    if (!String(inp.unknownText || '').trim()) userError_(MSG.missing + 'פריט');
    unknown = true;
    flags.push('unknown');
  } else {
    const it = Model.item(m.itemId);
    if (!it || it.archived) userError_(MSG.missing + 'פריט');
    if (!Model.isLeaf(it.id)) userError_('צריך לבחור פריט, לא תיקייה');
  }

  // ---- ספירה: נשמרת כהפרש בין מה שנספר למה שבמערכת ----
  if (type === 'count') {
    const at = inp.from || inp.to;
    if (!at || at === 'X') userError_(MSG.missing + 'מקום');
    const counted = Number(inp.countedQty);
    if (!Number.isInteger(counted) || counted < 0) userError_(MSG.qtyMissing);
    // פריט לא מוכר שנספר: אין לו מלאי במערכת, אז כל מה שנספר נכנס (כשהמנהל ישייך אותו – זה יהיה המלאי שלו)
    const diff = counted - (unknown ? 0 : Model.qtyAt(m.itemId, at));
    if (diff === 0) return { id: null, nochange: true };
    m.qty = Math.abs(diff);
    m.from = diff < 0 ? at : 'X';
    m.to = diff < 0 ? 'X' : at;
    m.note = m.note || ('נספרו ' + counted);
  } else {
    m.qty = Number(inp.qty);
    if (!Number.isInteger(m.qty) || m.qty <= 0) userError_(MSG.qtyMissing);
  }

  // ---- ספק ----
  if (type === 'purchase') m.from = m.supplierId ? 'S:' + m.supplierId : '';
  if (type === 'return_supplier') {
    if (!m.supplierId) userError_(MSG.missing + 'ספק');
    m.to = 'S:' + m.supplierId;
  }

  // ---- מאיפה / לאן ----
  const fk = Model.holderKind(m.from);
  const tk = Model.holderKind(m.to);
  if (rule.from.indexOf(fk) < 0) userError_(MSG.missing + 'מאיפה');
  if (rule.to.indexOf(tk) < 0) userError_(MSG.missing + 'לאן');
  if (!Model.holderExists(m.from)) userError_(MSG.missing + 'מאיפה');
  if (!Model.holderExists(m.to)) userError_(MSG.missing + 'לאן');
  if (m.from && m.from === m.to) userError_('המקור והיעד זהים');

  // ---- פרויקט ----
  const needsProject = type === 'pull' || type === 'return_surplus' || (type === 'purchase' && m.to === 'X');
  // "אחר": פרויקט שהמנהל עוד לא הוסיף, או שימוש כללי – כותבים בטקסט, והמנהל משייך אחר כך
  if (needsProject && type !== 'return_surplus' && m.projectId === '_other') {
    const text = String(inp.projectNote || '').trim();
    if (!text) userError_(MSG.missing + 'פרויקט');
    m.projectId = '';
    m.note = ('פרויקט: ' + text + (m.note ? ' · ' + m.note : '')).slice(0, 500);
    flags.push('noProject');
  } else if (needsProject) {
    const pr = Db.byId('Projects', m.projectId);
    if (!pr || pr.archived) userError_(MSG.missing + 'פרויקט');
    if (pr.status !== 'open') userError_('הפרויקט הזה סגור');
  }
  if (type === 'pull' && !unknown && Model.kindOf(m.itemId) === 'tool') {
    userError_('כלי לא נמשך לפרויקט. כדי לקחת כלי משתמשים ב"לקחתי" כהעברה אליך.');
  }

  // ---- משיכה של יותר ממה שיש: לא חוסמים, מסמנים למנהל ----
  if (!unknown && ['L', 'P', 'R'].indexOf(fk) >= 0 && Model.qtyAt(m.itemId, m.from) < m.qty) {
    flags.push('overdraw');
  }

  m.flags = flags.join(',');
  Db.insert('Movements', m);

  if (unknown) {
    Db.insert('UnknownItems', {
      text: String(inp.unknownText).trim().slice(0, 200), movementId: m.id, byPersonId: actor.id,
      at: m.at, status: 'open', itemId: '',
    });
  }
  if (m.orderId) refreshOrderStatus_(m.orderId);
  Model.reset();
  return { id: m.id, flags: m.flags };
}

// ביטול = תנועה הפוכה. עובד יכול לבטל רק דיווח שלו, ורק בדקות הראשונות.
function reverseMovement_(id, actor, isAdmin) {
  const m = Db.byId('Movements', id);
  if (!m || m.type === 'reversal') userError_(MSG.missing + 'דיווח');
  if (Model.reversedIds_()[id]) return { id: null, already: true };
  if (!isAdmin) {
    if (m.byPersonId !== actor.id) userError_(MSG.undoExpired);
    if (Date.now() - Date.parse(m.at) > CONFIG.UNDO_MINUTES * 60000) userError_(MSG.undoExpired);
  }
  const r = Db.insert('Movements', {
    at: now_(), type: 'reversal', itemId: m.itemId, qty: m.qty, from: m.to, to: m.from,
    projectId: m.projectId, byPersonId: actor.id, orderId: m.orderId, orderLineId: m.orderLineId,
    supplierId: m.supplierId, reversesId: m.id, note: '',
  });
  if (m.orderId) refreshOrderStatus_(m.orderId);
  const uk = Db.all('UnknownItems').find(u => u.movementId === m.id && u.status === 'open');
  if (uk) Db.update('UnknownItems', uk.id, { status: 'canceled' });
  Model.reset();
  return { id: r.id };
}

// מחיר ליחידת מלאי, לפני מע"מ
function unitPriceFromLine_(line, order) {
  if (line.unitPriceBuy === null || line.unitPriceBuy === '') return null;
  const per = line.buyUnitQty || 1;
  let p = line.unitPriceBuy / per;
  if (order.extraDiscount) p = p * (1 - order.extraDiscount / 100); // הנחה נוספת על כל ההזמנה – מה ששילמנו בפועל
  if (order.pricesIncludeVat) p = p / (1 + (order.vatRate || 0) / 100);
  return Math.round(p * 10000) / 10000;
}

// מנהל משייך לפרויקט דיווח שנרשם עם "פרויקט אחר"
function setMovementProject_(id, projectId, actor) {
  const m = Db.byId('Movements', id);
  if (!m || String(m.flags).indexOf('noProject') < 0) userError_(MSG.missing + 'דיווח');
  const pr = Db.byId('Projects', projectId);
  if (!pr || pr.archived) userError_(MSG.missing + 'פרויקט');
  const flags = String(m.flags).split(',').filter(f => f && f !== 'noProject').join(',');
  Db.update('Movements', id, { projectId: pr.id, flags });
  log_(actor, 'setProject', 'Movements', id, pr.name);
  Model.reset();
  return { id, projectId: pr.id };
}

// מסמך מצולם: הקובץ כבר ב-Drive, כאן נרשם הקישור (פעם אחת לכל clientKey)
function addDoc_(d, actor) {
  if (!d.fileId || !d.url) userError_(MSG.missing + 'קובץ');
  if (d.clientKey) {
    const dup = Db.all('Docs').find(x => x.clientKey === String(d.clientKey) && x.fileId === String(d.fileId));
    if (dup) return { id: dup.id, duplicate: true };
  }
  const row = Db.insert('Docs', {
    at: now_(), byPersonId: actor.id, kind: String(d.kind || '').slice(0, 30), name: String(d.name || '').slice(0, 200),
    fileId: String(d.fileId), url: String(d.url), orderId: d.orderId || '', clientKey: d.clientKey || '', note: String(d.note || '').slice(0, 300),
  });
  return { id: row.id };
}

// ==================== Orders.gs ====================
// הזמנות: טיוטה › נשלחה › התקבלה חלקית › התקבלה (או: בוטלה / נסגרה חלקית)

// data: { id?, supplierId, destId | destIds[], pricesIncludeVat, note, lines: [{ id?, itemId, destId?, qtyBuy, listPrice, discount, saveToList | unitPriceBuy }] }
// הזמנה לכמה מחסנים: שורה לכל פריט × מחסן. מחיר והנחה זהים, רק הכמות מתחלקת.
// מחיר: אם יש listPrice – הנטו מחושב ממנו ומההנחה; אחרת unitPriceBuy כמו שהוא (הזמנות ישנות).
// שורה שהכמות שלה 0 נחשבת מחוקה.
function saveOrder_(data, actor) {
  const supplier = Db.byId('Suppliers', data.supplierId);
  if (!supplier || supplier.archived) userError_(MSG.missing + 'ספק');
  const destIds = (Array.isArray(data.destIds) && data.destIds.length ? data.destIds : [data.destId]).filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i);
  destIds.forEach(id => {
    const l = Db.byId('Locations', id);
    if (!l || l.archived || l.type === 'repair') userError_(MSG.missing + 'יעד');
  });
  if (!destIds.length) userError_(MSG.missing + 'יעד');
  const dest = Db.byId('Locations', destIds[0]);

  let order = data.id ? Db.byId('Orders', data.id) : null;
  if (order && order.status !== 'draft') userError_('אפשר לערוך רק הזמנה שעוד לא נשלחה');
  const fields = {
    supplierId: supplier.id, destId: dest.id, destIds: destIds.join(','), pricesIncludeVat: !!data.pricesIncludeVat,
    note: String(data.note || '').slice(0, 1000),
  };
  // הנחה נוספת על כל ההזמנה. בהזמנה חדשה – ברירת המחדל היא ההנחה הכללית של הספק
  if (data.extraDiscount !== undefined && data.extraDiscount !== null && data.extraDiscount !== '') {
    fields.extraDiscount = Math.min(100, Math.max(0, Number(data.extraDiscount) || 0));
  } else if (!order) {
    fields.extraDiscount = Number(supplier.extraDiscount) || 0;
  }
  if (order) {
    Db.update('Orders', order.id, fields);
  } else {
    const number = Number(Db.setting('nextOrderNumber')) || 1;
    Db.setSetting('nextOrderNumber', number + 1);
    order = Db.insert('Orders', Object.assign(fields, {
      number, status: 'draft', vatRate: Number(Db.setting('vatRate')) || 0,
      createdBy: actor.id, createdAt: now_(),
    }));
  }

  const existing = {};
  Db.all('OrderLines').filter(l => l.orderId === order.id).forEach(l => { existing[l.id] = l; });
  const newLines = [];
  (data.lines || []).forEach(l => {
    const qty = Number(l.qtyBuy) || 0;
    const p = linePrice_(l);
    const lineDest = l.destId && destIds.indexOf(l.destId) >= 0 ? l.destId : dest.id;
    p.destId = lineDest;
    if (l.id && existing[l.id]) {
      Db.update('OrderLines', l.id, Object.assign({ qtyBuy: qty }, p));
      delete existing[l.id];
      return;
    }
    if (!qty) return;
    const it = Model.item(l.itemId);
    if (!it || it.archived || !Model.isLeaf(it.id)) userError_(MSG.missing + 'פריט');
    newLines.push(Object.assign({ orderId: order.id, itemId: it.id, qtyBuy: qty, buyUnitQty: it.buyUnitQty || 1 }, p));
  });
  // שורות שלא נשלחו שוב = הוסרו מהטיוטה
  Object.keys(existing).forEach(id => Db.update('OrderLines', id, { qtyBuy: 0 }));
  Db.insertMany('OrderLines', newLines);
  log_(actor, data.id ? 'update' : 'create', 'Orders', order.id, 'הזמנה ' + order.number + ' · ' + supplier.name);
  return order;
}

const num_ = v => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

// מחיר שורה: מחירון + הנחה → נטו
function linePrice_(l) {
  const list = num_(l.listPrice);
  if (list === null) return { unitPriceBuy: num_(l.unitPriceBuy), listPrice: null, discount: null, saveToList: false };
  const discount = Math.min(100, Math.max(0, num_(l.discount) || 0));
  return { listPrice: list, discount, unitPriceBuy: round2_(list * (1 - discount / 100)), saveToList: !!l.saveToList };
}

// מחירון הספק לפריט (או null)
function supplierItem_(supplierId, itemId) {
  return Db.all('SupplierItems').find(x => x.supplierId === supplierId && x.itemId === itemId) || null;
}

function orderLines_(orderId) {
  return Db.all('OrderLines').filter(l => l.orderId === orderId && l.qtyBuy > 0);
}

// action: send / cancel / closePartial
function setOrderStatus_(id, action, actor) {
  const order = Db.byId('Orders', id);
  if (!order) userError_(MSG.missing + 'הזמנה');
  const received = Model.receivedByLine();
  const lines = orderLines_(id);
  const anyReceived = lines.some(l => received[l.id]);

  if (action === 'send') {
    if (order.status !== 'draft') userError_('ההזמנה כבר נשלחה');
    if (!lines.length) userError_('אין פריטים בהזמנה');
    const at = now_();
    Db.update('Orders', id, { status: 'sent', sentAt: at });
    // המחירים נכנסים להיסטוריה ברגע השליחה – מכאן נבנית השוואת הספקים
    const byItem = {};
    lines.filter(l => l.unitPriceBuy !== null).forEach(l => {
      if (byItem[l.itemId]) byItem[l.itemId].qty += l.qtyBuy;
      else byItem[l.itemId] = { itemId: l.itemId, supplierId: order.supplierId, at, unitPrice: unitPriceFromLine_(l, order),
        source: 'order', refId: l.id, listPrice: l.listPrice, discount: l.discount, qty: l.qtyBuy };
    });
    Db.insertMany('Prices', Object.keys(byItem).map(k => byItem[k]));
    // מחירון הספק: מה שסומן "עדכן במחירון", ופריט שעוד לא היה במחירון שלו
    lines.filter(l => l.listPrice !== null).forEach(l => {
      const cur = supplierItem_(order.supplierId, l.itemId);
      if (cur && !l.saveToList) return;
      if (cur) Db.update('SupplierItems', cur.id, { listPrice: l.listPrice, discount: l.discount, updatedAt: at, archived: false });
      else Db.insert('SupplierItems', { supplierId: order.supplierId, itemId: l.itemId, code: '', listPrice: l.listPrice, discount: l.discount, updatedAt: at });
    });
  } else if (action === 'cancel') {
    if (anyReceived) userError_('כבר התקבלו פריטים מההזמנה הזו. אפשר לסגור אותה במקום לבטל.');
    if (['draft', 'sent'].indexOf(order.status) < 0) userError_('אי אפשר לבטל את ההזמנה הזו');
    Db.update('Orders', id, { status: 'canceled', closedAt: now_() });
  } else if (action === 'closePartial') {
    if (['sent', 'partial'].indexOf(order.status) < 0) userError_('ההזמנה הזו כבר סגורה');
    Db.update('Orders', id, { status: 'closed_partial', closedAt: now_() });
  } else {
    userError_(MSG.missing + 'פעולה');
  }
  log_(actor, action, 'Orders', id, 'הזמנה ' + order.number);
  return Db.byId('Orders', id);
}

// אחרי כל קבלה או ביטול קבלה
function refreshOrderStatus_(orderId) {
  const order = Db.byId('Orders', orderId);
  if (!order || ['sent', 'partial', 'received'].indexOf(order.status) < 0) return;
  const received = Model.receivedByLine();
  const lines = orderLines_(orderId);
  const done = lines.length && lines.every(l => (received[l.id] || 0) >= l.qtyBuy * (l.buyUnitQty || 1));
  const any = lines.some(l => received[l.id]);
  const status = done ? 'received' : any ? 'partial' : 'sent';
  if (status !== order.status) {
    Db.update('Orders', orderId, { status, closedAt: done ? now_() : '' });
  }
}

const ORDER_STATUS_NAMES = {
  draft: 'טיוטה', sent: 'נשלחה', partial: 'התקבלה חלקית', received: 'התקבלה',
  closed_partial: 'נסגרה חלקית', canceled: 'בוטלה',
};

// מסמך הזמנה לספק (נפתח להדפסה / שמירה כ-PDF). קודי הספק, מחירון, הנחה ונטו לכל שורה.
function orderPdf_(id) {
  const order = Db.byId('Orders', id);
  if (!order) userError_(MSG.missing + 'הזמנה');
  const supplier = Db.byId('Suppliers', order.supplierId) || {};
  const dest = Db.byId('Locations', order.destId) || {};
  const by = Db.byId('People', order.createdBy) || {};
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const money = n => (n === null || n === undefined ? '' : '₪' + Number(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const vat = (order.vatRate || 0) / 100;
  const lines = orderLines_(id);
  const anyDiscount = lines.some(l => l.discount);

  let total = 0;
  // חלק לכל מחסן (בהזמנה ליעד אחד – חלק אחד)
  const destOf = l => l.destId || order.destId;
  const destList = (String(order.destIds || '').split(',').filter(Boolean).length ? String(order.destIds).split(',').filter(Boolean) : [order.destId])
    .filter(id => lines.some(l => destOf(l) === id));
  const multi = destList.length > 1;
  const sectionOf = {};
  let n = 0;
  lines.sort((a, b) => destList.indexOf(destOf(a)) - destList.indexOf(destOf(b)));
  const rows = lines.map((l, i) => {
    const it = Model.item(l.itemId) || {};
    const per = l.buyUnitQty || 1;
    const unitName = per > 1 ? it.buyUnitName || '' : (Db.byId('Units', Model.inherited(l.itemId, 'unitId')) || {}).name || '';
    const code = (supplierItem_(order.supplierId, l.itemId) || {}).code || '';
    const sum = l.unitPriceBuy === null ? null : l.unitPriceBuy * l.qtyBuy;
    if (sum !== null) total += sum;
    const list = l.listPrice !== null ? l.listPrice : l.unitPriceBuy;
    const dId = destOf(l);
    let head = '';
    if (multi && !sectionOf[dId]) {
      sectionOf[dId] = true;
      n = 0;
      const dl = Db.byId('Locations', dId) || {};
      head = '<tr class="sec"><td colspan="' + (anyDiscount ? 9 : 7) + '">לאספקה ל: ' + esc(dl.name) + (dl.address ? ' · ' + esc(dl.address) : '') + '</td></tr>';
    }
    n += 1;
    return head + '<tr><td>' + n + '</td><td class="c">' + esc(code) + '</td><td>' + esc(it.name) + '</td><td>' + Number(l.qtyBuy).toLocaleString('he-IL') +
      '</td><td>' + esc(unitName === 'יחידה' ? '' : unitName) + '</td>' +
      (anyDiscount ? '<td>' + money(list) + '</td><td>' + (l.discount ? l.discount + '%' : '') + '</td>' : '') +
      '<td>' + money(l.unitPriceBuy) + '</td><td>' + money(sum) + '</td></tr>';
  }).join('');
  const extra = Number(order.extraDiscount) || 0;
  const sub = total;
  total = total * (1 - extra / 100);
  const before = order.pricesIncludeVat ? total / (1 + vat) : total;
  const after = order.pricesIncludeVat ? total : total * (1 + vat);
  const date = String(order.sentAt || order.createdAt).slice(0, 10).split('-').reverse().join('.');
  const details = String(Db.setting('companyDetails') || '');

  const html = '<html dir="rtl"><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#2b2118;font-size:12px;margin:0}' +
    '.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #4A3524;padding-bottom:10px}' +
    '.co{color:#4A3524;font-size:20px;font-weight:bold}.cd{color:#8A7A68;font-size:11px;white-space:pre-line;margin-top:2px}' +
    'h1{font-size:18px;margin:0;color:#4A3524;text-align:left}.meta{text-align:left;color:#555;font-size:11px;line-height:1.6}' +
    '.box{display:flex;gap:30px;margin:14px 0;line-height:1.7}.box b{color:#4A3524}' +
    'table{width:100%;border-collapse:collapse;margin-top:6px}th{background:#4A3524;color:#fff;padding:6px;text-align:right;font-weight:normal}' +
    'td{border-bottom:1px solid #E4DED2;padding:6px}td.c{color:#8A7A68;font-size:11px}' +
    'tr.sec td{background:#F3EEE7;color:#4A3524;font-weight:bold;padding:8px 6px;border-bottom:2px solid #4A3524}' +
    '.t{margin-top:12px;text-align:left;line-height:1.9}.t b{font-size:14px}.n{margin-top:14px}.f{margin-top:26px;color:#8A7A68;font-size:10px}' +
    '</style></head><body>' +
    '<div class="top"><div><div class="co">' + esc(Db.setting('companyName')) + '</div>' + (details ? '<div class="cd">' + esc(details) + '</div>' : '') + '</div>' +
    '<div><h1>הזמנת רכש מס\' ' + order.number + '</h1><div class="meta">תאריך: ' + esc(date) + '</div></div></div>' +
    '<div class="box"><div><b>לכבוד:</b> ' + esc(supplier.name) +
    (supplier.contact ? '<br>' + esc(supplier.contact) : '') + (supplier.phone ? '<br>טל\' ' + esc(supplier.phone) : '') + (supplier.email ? '<br>' + esc(supplier.email) : '') + '</div>' +
    '<div>' + (multi ? '<b>לאספקה ל:</b> ' + destList.map(id => esc((Db.byId('Locations', id) || {}).name)).join(', ') + ' (פירוט לכל מחסן בטבלה)'
      : '<b>לאספקה ל:</b> ' + esc(dest.name) + (dest.address ? '<br>' + esc(dest.address) : '')) + '<br><b>הזמין:</b> ' + esc(by.name) + '</div></div>' +
    '<table><tr><th>#</th><th>קוד ספק</th><th>תיאור</th><th>כמות</th><th>יחידה</th>' + (anyDiscount ? '<th>מחירון</th><th>הנחה</th>' : '') + '<th>מחיר ליח\'</th><th>סה"כ</th></tr>' +
    rows + '</table>' +
    '<div class="t">' + (extra ? 'סה"כ שורות: ' + money(sub) + '<br>הנחה נוספת ' + extra + '%: -' + money(sub - total) + '<br>' : '') +
    'סה"כ לפני מע"מ: ' + money(before) + '<br>מע"מ ' + order.vatRate + '%: ' + money(after - before) +
    '<br><b>סה"כ כולל מע"מ: ' + money(after) + '</b></div>' +
    (order.note ? '<div class="n"><b>הערות:</b> ' + esc(order.note) + '</div>' : '') +
    '<div class="f">הופק ב-' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd.MM.yyyy HH:mm') + '</div>' +
    '</body></html>';
  const pdf = Utilities.newBlob(html, 'text/html', 'order.html').getAs('application/pdf');
  return {
    fileName: 'הזמנה ' + order.number + ' - ' + (supplier.name || '') + '.pdf',
    base64: Utilities.base64Encode(pdf.getBytes()),
  };
}

// עריכת מחירון ספק (מכרטיס הספק). rows: [{ itemId, code?, listPrice?, discount?, remove? }] – כמה פריטים בפעולה אחת
function saveSupplierItems_(supplierId, rows, actor) {
  const sup = Db.byId('Suppliers', supplierId);
  if (!sup) userError_(MSG.missing + 'ספק');
  const at = now_();
  (rows || []).slice(0, 500).forEach(r => {
    const it = Model.item(r.itemId);
    if (!it) userError_(MSG.missing + 'פריט');
    const cur = Db.all('SupplierItems', { includeArchived: true }).find(x => x.supplierId === sup.id && x.itemId === it.id);
    if (r.remove) { if (cur) Db.update('SupplierItems', cur.id, { archived: true, updatedAt: at }); return; }
    const patch = { updatedAt: at, archived: false };
    if (r.code !== undefined) patch.code = String(r.code || '').trim().slice(0, 60);
    if (r.listPrice !== undefined) patch.listPrice = num_(r.listPrice);
    if (r.discount !== undefined) patch.discount = Math.min(100, Math.max(0, num_(r.discount) || 0));
    if (cur) Db.update('SupplierItems', cur.id, patch);
    else Db.insert('SupplierItems', Object.assign({ supplierId: sup.id, itemId: it.id, code: '', listPrice: null, discount: 0 }, patch));
  });
  log_(actor, 'priceList', 'Suppliers', sup.id, 'מחירון ' + sup.name + ' · ' + (rows || []).length + ' פריטים');
  return Db.clean(Db.all('SupplierItems').filter(x => x.supplierId === sup.id));
}

// מסמך מצב הזמנה (להדפסה / לשליחה לספק):
//   kind = 'pending'  – יתרה לאספקה: מה הוזמן, מה הגיע, מה עוד חסר
//   kind = 'received' – מה התקבל, עם תאריך לכל משלוח
function orderStatusDoc_(id, kind) {
  const order = Db.byId('Orders', id);
  if (!order) userError_(MSG.missing + 'הזמנה');
  const supplier = Db.byId('Suppliers', order.supplierId) || {};
  const dest = Db.byId('Locations', order.destId) || {};
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtN = n => Number(Math.round(n * 100) / 100).toLocaleString('he-IL');
  const d = iso => String(iso || '').slice(0, 10).split('-').reverse().join('.');
  const received = Model.receivedByLine();
  const reversed = Model.reversedIds_();
  // משלוחים לכל שורה: תאריך + כמות
  const deliveries = {};
  Db.all('Movements').forEach(m => {
    if (m.type !== 'receive' || !m.orderLineId || reversed[m.id]) return;
    (deliveries[m.orderLineId] = deliveries[m.orderLineId] || []).push({ at: m.clientAt || m.at, qty: m.qty });
  });
  const pending = kind !== 'received';
  const rows = [];
  const destOf = l => l.destId || order.destId;
  const all = orderLines_(id);
  const destList = (String(order.destIds || '').split(',').filter(Boolean).length ? String(order.destIds).split(',').filter(Boolean) : [order.destId])
    .filter(dId => all.some(l => destOf(l) === dId));
  const multi = destList.length > 1;
  const seen = {};
  let n = 0;
  all.sort((a, b) => destList.indexOf(destOf(a)) - destList.indexOf(destOf(b))).forEach(l => {
    const it = Model.item(l.itemId) || {};
    const per = l.buyUnitQty || 1;
    const got = (received[l.id] || 0) / per;
    const left = Math.max(0, l.qtyBuy - got);
    if (pending ? left <= 0 : got <= 0) return;
    const unitName = per > 1 ? it.buyUnitName || '' : (Db.byId('Units', Model.inherited(l.itemId, 'unitId')) || {}).name || '';
    const code = (supplierItem_(order.supplierId, l.itemId) || {}).code || '';
    const dels = (deliveries[l.id] || []).sort((a, b) => (a.at < b.at ? -1 : 1)).map(x => d(x.at) + ': ' + fmtN(x.qty / per)).join('<br>');
    if (multi && !seen[destOf(l)]) {
      seen[destOf(l)] = true;
      n = 0;
      rows.push('<tr class="sec"><td colspan="' + (pending ? 8 : 7) + '">' + esc((Db.byId('Locations', destOf(l)) || {}).name) + '</td></tr>');
    }
    n += 1;
    rows.push('<tr><td>' + n + '</td><td class="c">' + esc(code) + '</td><td>' + esc(it.name) + '</td><td>' + esc(unitName === 'יחידה' ? '' : unitName) + '</td>' +
      '<td>' + fmtN(l.qtyBuy) + '</td><td>' + fmtN(got) + '</td>' +
      (pending ? '<td><b>' + fmtN(left) + '</b></td><td>' + esc(d(l.expectedAt)) + '</td>' : '<td class="c">' + dels + '</td>') + '</tr>');
  });
  const title = (pending ? 'יתרה לאספקה' : 'מה התקבל') + ' · הזמנה ' + order.number;
  const details = String(Db.setting('companyDetails') || '');
  const html = '<html dir="rtl"><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#2b2118;font-size:12px;margin:0}' +
    '.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #4A3524;padding-bottom:10px}' +
    '.co{color:#4A3524;font-size:20px;font-weight:bold}.cd{color:#8A7A68;font-size:11px;white-space:pre-line;margin-top:2px}' +
    'h1{font-size:18px;margin:0;color:#4A3524;text-align:left}.meta{text-align:left;color:#555;font-size:11px;line-height:1.6}' +
    '.box{margin:14px 0;line-height:1.7}.box b{color:#4A3524}' +
    'table{width:100%;border-collapse:collapse;margin-top:6px}th{background:#4A3524;color:#fff;padding:6px;text-align:right;font-weight:normal}' +
    'td{border-bottom:1px solid #E4DED2;padding:6px;vertical-align:top}td.c{color:#8A7A68;font-size:11px}.f{margin-top:26px;color:#8A7A68;font-size:10px}' +
    'tr.sec td{background:#F3EEE7;color:#4A3524;font-weight:bold;padding:8px 6px;border-bottom:2px solid #4A3524}' +
    '</style></head><body>' +
    '<div class="top"><div><div class="co">' + esc(Db.setting('companyName')) + '</div>' + (details ? '<div class="cd">' + esc(details) + '</div>' : '') + '</div>' +
    '<div><h1>' + esc(title) + '</h1><div class="meta">תאריך הזמנה: ' + esc(d(order.sentAt || order.createdAt)) + '<br>נכון ל-' +
    Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd.MM.yyyy') + '</div></div></div>' +
    '<div class="box"><b>לכבוד:</b> ' + esc(supplier.name) + (supplier.contact ? ' · ' + esc(supplier.contact) : '') + (supplier.phone ? ' · טל\' ' + esc(supplier.phone) : '') +
    '<br><b>לאספקה ל:</b> ' + (multi ? destList.map(dId => esc((Db.byId('Locations', dId) || {}).name)).join(', ') : esc(dest.name) + (dest.address ? ' · ' + esc(dest.address) : '')) +
    (pending ? '<br>להלן הפריטים מההזמנה שעדיין לא סופקו. נבקש לעדכן מתי צפויה האספקה.' : '') + '</div>' +
    (rows.length
      ? '<table><tr><th>#</th><th>קוד ספק</th><th>תיאור</th><th>יחידה</th><th>הוזמן</th><th>התקבל</th>' + (pending ? '<th>חסר</th><th>צפוי</th>' : '<th>משלוחים</th>') + '</tr>' + rows.join('') + '</table>'
      : '<div class="box">' + (pending ? 'כל ההזמנה התקבלה – אין יתרה.' : 'עוד לא התקבל כלום מההזמנה הזו.') + '</div>') +
    '<div class="f">הופק ב-' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd.MM.yyyy HH:mm') + '</div></body></html>';
  return { fileName: title + ' - ' + (supplier.name || '') + '.pdf', html };
}

// איחור: לכל שורה שעוד חסרה – עד התאריך הצפוי (אם הספק נתן), אחרת N ימים מהשליחה. מחזיר כמה ימים באיחור (0 = לא).
function orderLateDays_(order, received, now) {
  if (!(order.status === 'sent' || order.status === 'partial') || !order.sentAt) return 0;
  const lateDays = Number(Db.setting('lateDays')) || 7;
  let worst = 0;
  orderLines_(order.id).forEach(l => {
    if ((received[l.id] || 0) >= l.qtyBuy * (l.buyUnitQty || 1)) return;
    const due = l.expectedAt ? Date.parse(l.expectedAt + 'T23:59:59') : Date.parse(order.sentAt) + lateDays * 86400000;
    const days = Math.floor((now - due) / 86400000);
    if (days > worst) worst = days;
  });
  return worst;
}

// מנהל רושם מתי אמורה להגיע יתרה (כמה שורות בבת אחת). date ריק = לא ידוע.
function setLinesExpected_(lineIds, date, actor) {
  const d = String(date || '').trim();
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) userError_(MSG.missing + 'תאריך');
  const done = [];
  (lineIds || []).slice(0, 500).forEach(id => {
    const l = Db.byId('OrderLines', id);
    const o = l && Db.byId('Orders', l.orderId);
    if (!o || ['sent', 'partial'].indexOf(o.status) < 0) return;
    Db.update('OrderLines', id, { expectedAt: d });
    done.push(id);
  });
  if (done.length) log_(actor, 'expected', 'Orders', '', (d ? 'צפוי ' + d.split('-').reverse().join('.') : 'בלי תאריך צפוי') + ' · ' + done.length + ' שורות');
  return { updated: done.length };
}

// ==================== Admin.gs ====================
// פעולות המנהל: רשימות, עץ הפריטים, פריטים לא מוכרים, מחירים, פרויקטים, הגדרות.

// השדות שהמנהל יכול לערוך בכל רשימה
const EDITABLE = {
  Units: ['name'],
  Locations: ['name', 'type', 'address'],
  People: ['name', 'role', 'email', 'alerts'],
  Suppliers: ['name', 'phone', 'contact', 'note', 'email', 'vatId', 'address', 'extraDiscount'],
  Projects: ['name', 'note'],
  Items: ['parentId', 'name', 'kind', 'unitId', 'buyUnitName', 'buyUnitQty', 'minQty', 'aliases', 'imageId', 'value', 'sort', 'isFolder'],
};

const ENTITY_NAMES = {
  Units: 'יחידה', Locations: 'מקום', People: 'אדם', Suppliers: 'ספק', Projects: 'פרויקט', Items: 'פריט',
};

function log_(actor, action, entity, entityId, summary, before, after) {
  const j = v => (v === undefined || v === null ? '' : JSON.stringify(v).slice(0, 2000));
  Db.insert('Log', {
    at: now_(), byPersonId: actor ? actor.id : '', action, entity, entityId: entityId || '',
    summary: summary || '', before: j(before), after: j(after),
  });
}

function strip_(o) {
  const c = Object.assign({}, o);
  delete c._row;
  return c;
}

// ---------- שמירה כללית ----------

// rec: { id?, ...שדות }. opts.moveStockToChild – בפריט חדש מתחת לפריט שיש לו מלאי
function saveRecord_(entity, rec, actor, opts) {
  const allowed = EDITABLE[entity];
  if (!allowed) userError_(MSG.missing + 'רשימה');
  const data = {};
  allowed.forEach(k => { if (rec[k] !== undefined) data[k] = typeof rec[k] === 'string' ? rec[k].trim() : rec[k]; });
  const existing = rec.id ? Db.byId(entity, rec.id) : null;
  if (rec.id && !existing) userError_(MSG.conflict);

  const name = data.name !== undefined ? data.name : existing && existing.name;
  if (!name) userError_(MSG.missing + 'שם');
  validate_(entity, data, existing, name);

  if (existing) {
    const before = strip_(existing);
    if (entity === 'Items') data.updatedAt = now_();
    const after = Db.update(entity, existing.id, data);
    log_(actor, 'update', entity, existing.id, ENTITY_NAMES[entity] + ': ' + name, before, strip_(after));
    Model.reset();
    return after;
  }

  if (entity === 'People') data.token = newToken_();
  if (entity === 'Projects') Object.assign(data, { status: 'open', openedAt: now_() });
  if (entity === 'Items') {
    Object.assign(data, { createdAt: now_(), updatedAt: now_() });
    const parentStock = data.parentId && Model.isLeaf(data.parentId) && holdersOf_(data.parentId);
    if (parentStock && parentStock.length && !(opts && opts.moveStockToChild)) {
      const e = new Error('לפריט הזה יש מלאי. לאיזה תת-סוג להעביר אותו?');
      e.userMessage = e.message;
      e.code = 'PARENT_HAS_STOCK';
      throw e;
    }
    const created = Db.insert('Items', data);
    if (parentStock && parentStock.length) moveStock_(data.parentId, created.id, parentStock, actor);
    log_(actor, 'create', entity, created.id, ENTITY_NAMES[entity] + ': ' + name, null, strip_(created));
    Model.reset();
    return created;
  }
  const created = Db.insert(entity, data);
  log_(actor, 'create', entity, created.id, ENTITY_NAMES[entity] + ': ' + name, null, strip_(created));
  Model.reset();
  return created;
}

function validate_(entity, data, existing, name) {
  const id = existing ? existing.id : null;
  const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  if (entity === 'Items') {
    const parentId = data.parentId !== undefined ? data.parentId : existing ? existing.parentId : '';
    if (parentId) {
      const p = Model.item(parentId);
      if (!p || p.archived) userError_(MSG.missing + 'תיקייה');
      if (id && Model.descendants(id).indexOf(parentId) >= 0) userError_('אי אפשר להעביר תיקייה לתוך עצמה');
      // העברה לתוך פריט שיש לו מלאי הייתה משאירה מלאי על תיקייה
      if (id && existing.parentId !== parentId && Model.isLeaf(parentId) && holdersOf_(parentId).length) {
        userError_('ל"{name}" יש מלאי, ולכן אי אפשר להכניס לתוכו פריטים. קודם צריך להעביר את המלאי שלו.', { name: p.name });
      }
    }
    if (Model.childrenOf(parentId).some(c => c.id !== id && same(c.name, name))) {
      userError_(MSG.duplicateName, { name });
    }
    if (data.kind && ['consumable', 'tool'].indexOf(data.kind) < 0) userError_(MSG.missing + 'סוג');
    if (data.unitId && !Db.byId('Units', data.unitId)) userError_(MSG.missing + 'יחידה');
    ['buyUnitQty', 'minQty', 'value', 'sort'].forEach(k => {
      if (data[k] !== undefined && data[k] !== '' && data[k] !== null && !(Number(data[k]) >= 0)) userError_(MSG.missing + k);
    });
    return;
  }
  if (Db.all(entity).some(o => o.id !== id && same(o.name, name))) userError_(MSG.duplicateName, { name });
  if (entity === 'Locations' && data.type !== undefined && LOCATION_TYPES.indexOf(data.type) < 0) {
    userError_(MSG.missing + 'סוג מקום');
  }
  if (entity === 'People') {
    const role = data.role !== undefined ? data.role : existing && existing.role;
    if (['field', 'admin'].indexOf(role) < 0) userError_(MSG.missing + 'תפקיד');
    // מייל לא חובה (מנהל יכול להיכנס בקישור אישי). צריך אותו רק כדי לקבל את מייל הסיכום.
    const alerts = data.alerts !== undefined ? data.alerts : existing && existing.alerts;
    const email = data.email !== undefined ? data.email : existing && existing.email;
    if (role === 'admin' && alerts && !email) userError_(MSG.missing + 'מייל (כדי לקבל את מייל הסיכום)');
    if (existing && existing.role === 'admin' && role !== 'admin' && adminCount_() <= 1) userError_(MSG.lastAdmin);
  }
}

function adminCount_() {
  return Db.all('People').filter(p => p.role === 'admin').length;
}

// [{holder, qty}] של פריט
function holdersOf_(itemId) {
  const row = Model.balances()[itemId] || {};
  return Object.keys(row).filter(h => row[h] > 0).map(h => ({ holder: h, qty: row[h] }));
}

// מעביר מלאי מפריט אחד לאחר (כשפריט הופך לתיקייה)
function moveStock_(fromItemId, toItemId, holders, actor) {
  const at = now_();
  const rows = [];
  holders.forEach(h => {
    rows.push({ at, type: 'count', itemId: fromItemId, qty: h.qty, from: h.holder, to: 'X', byPersonId: actor.id, note: 'הועבר לתת-סוג' });
    rows.push({ at, type: 'count', itemId: toItemId, qty: h.qty, from: 'X', to: h.holder, byPersonId: actor.id, note: 'הועבר מהפריט שמעל' });
  });
  Db.insertMany('Movements', rows);
  Model.reset();
}

// ---------- ארכיון ----------

function archive_(entity, id, actor) {
  const rec = Db.byId(entity, id);
  if (!rec || !EDITABLE[entity]) userError_(MSG.conflict);
  if (entity === 'People') {
    const tools = Model.heldBy('P:' + id);
    if (tools.length) userError_(MSG.personHasTools, { name: rec.name, n: tools.reduce((s, t) => s + t.qty, 0) });
    if (rec.role === 'admin' && adminCount_() <= 1) userError_(MSG.lastAdmin);
  }
  if (entity === 'Locations' && Model.heldBy('L:' + id).length) userError_(MSG.locationHasStock, { name: rec.name });
  if (entity === 'Projects' && projectHasMoves_(id)) userError_(MSG.projectHasMoves, { name: rec.name });
  if (entity === 'Units' && Db.all('Items').some(it => it.unitId === id)) userError_('היחידה בשימוש בפריטים. קודם צריך לשנות להם יחידה.');
  const ids = entity === 'Items' ? Model.descendants(id) : [id];
  if (entity === 'Items' && ids.some(i => holdersOf_(i).length)) userError_(MSG.folderHasStock);

  ids.forEach(i => Db.update(entity, i, { archived: true }));
  if (entity === 'Locations' || entity === 'Projects') {
    Db.all('ContainerProjects').filter(c => (entity === 'Locations' ? c.containerId : c.projectId) === id && !c.to).forEach(c => Db.update('ContainerProjects', c.id, { to: now_() }));
  }
  log_(actor, 'archive', entity, id, ENTITY_NAMES[entity] + ': ' + rec.name);
  Model.reset();
  return { archived: ids };
}

// דיווחים שנשארו על הפרויקט (בלי מה שבוטל)
function projectHasMoves_(id) {
  const reversed = Model.reversedIds_();
  return Db.all('Movements').some(m => m.projectId === id && !m.reversesId && !reversed[m.id]);
}

function restore_(entity, id, actor) {
  const rec = Db.byId(entity, id);
  if (!rec || !EDITABLE[entity]) userError_(MSG.conflict);
  if (entity === 'Items') {
    // משחזרים גם את התיקיות שמעל, ואת הצאצאים שהועברו יחד איתו לארכיון
    let p = Model.item(rec.parentId);
    while (p) { if (p.archived) Db.update('Items', p.id, { archived: false }); p = Model.item(p.parentId); }
    Db.update('Items', id, { archived: false });
    Model.reset();
    const restoreDown = pid => Db.all('Items', { includeArchived: true }).filter(c => c.parentId === pid && c.archived)
      .forEach(c => { Db.update('Items', c.id, { archived: false }); restoreDown(c.id); });
    restoreDown(id);
  } else {
    Db.update(entity, id, { archived: false });
  }
  log_(actor, 'restore', entity, id, ENTITY_NAMES[entity] + ': ' + rec.name);
  Model.reset();
  return Db.byId(entity, id);
}

// ---------- עץ הפריטים ----------

function duplicateItem_(id, actor) {
  const it = Model.item(id);
  if (!it) userError_(MSG.conflict);
  const copy = {};
  EDITABLE.Items.forEach(k => { copy[k] = it[k]; });
  let n = 1;
  let name = it.name + ' (עותק)';
  const siblings = Model.childrenOf(it.parentId).map(c => c.name);
  while (siblings.indexOf(name) >= 0) name = it.name + ' (עותק ' + ++n + ')';
  copy.name = name;
  return saveRecord_('Items', copy, actor);
}

// הוספה מהירה: rows = [{ path, name, kind, unitName, minQty, buyUnitName, buyUnitQty, aliases }]
// path = תיקיות מתחת ל-parentId, מופרדות ב-› או ב-/. תיקיות חסרות נוצרות.
function quickAdd_(parentId, rows, actor) {
  const created = [];
  const errors = [];
  const unitByName = {};
  Db.all('Units').forEach(u => { unitByName[u.name.trim()] = u.id; });
  const folder = (base, parts) => {
    let pid = base || '';
    parts.forEach(part => {
      const found = Model.childrenOf(pid).find(c => c.name.trim() === part);
      pid = found ? found.id : saveRecord_('Items', { parentId: pid, name: part, isFolder: true }, actor).id;
    });
    return pid;
  };
  rows.forEach((r, i) => {
    try {
      if (!String(r.name || '').trim()) return;
      const parts = String(r.path || '').split(/[›/>]/).map(s => s.trim()).filter(Boolean);
      const pid = folder(parentId, parts);
      let unitId = r.unitId || '';
      const un = String(r.unitName || '').trim();
      if (!unitId && un) {
        unitId = unitByName[un] || saveRecord_('Units', { name: un }, actor).id;
        unitByName[un] = unitId;
      }
      created.push(saveRecord_('Items', {
        parentId: pid, name: r.name, kind: r.kind || '', unitId, minQty: r.minQty,
        buyUnitName: r.buyUnitName || '', buyUnitQty: r.buyUnitQty, aliases: r.aliases || '',
      }, actor));
    } catch (e) {
      errors.push({ row: i, message: e.userMessage || MSG.generic });
    }
  });
  return { created: Db.clean(created), errors };
}

// ---------- פריטים לא מוכרים ----------

function resolveUnknown_(id, itemId, actor) {
  const uk = Db.byId('UnknownItems', id);
  if (!uk || uk.status !== 'open') userError_(MSG.conflict);
  const it = Model.item(itemId);
  if (!it || it.archived || !Model.isLeaf(itemId)) userError_(MSG.missing + 'פריט');
  const mv = Db.byId('Movements', uk.movementId);
  if (mv) {
    const flags = String(mv.flags || '').split(',').filter(f => f && f !== 'unknown');
    Db.update('Movements', mv.id, { itemId, flags: flags.join(',') });
  }
  Db.update('UnknownItems', id, { status: 'linked', itemId });
  log_(actor, 'link', 'UnknownItems', id, '"' + uk.text + '" ← ' + it.name);
  Model.reset();
  return Db.byId('UnknownItems', id);
}

// ---------- מחיר לקנייה בחנות ----------

// unitPrice ליחידת מלאי; includesVat – אם המחיר שהוקלד כולל מע"מ
function setPurchasePrice_(movementId, unitPrice, includesVat, supplierId, actor) {
  const mv = Db.byId('Movements', movementId);
  if (!mv || mv.type !== 'purchase') userError_(MSG.conflict);
  let p = Number(unitPrice);
  if (!(p >= 0)) userError_(MSG.missing + 'מחיר');
  if (includesVat) p = p / (1 + (Number(Db.setting('vatRate')) || 0) / 100);
  p = Math.round(p * 10000) / 10000;
  const patch = { unitPrice: p };
  if (supplierId) {
    if (!Db.byId('Suppliers', supplierId)) userError_(MSG.missing + 'ספק');
    patch.supplierId = supplierId;
    patch.from = 'S:' + supplierId;
  }
  Db.update('Movements', movementId, patch);
  const sup = patch.supplierId || mv.supplierId;
  if (sup && mv.itemId) {
    Db.insert('Prices', { itemId: mv.itemId, supplierId: sup, at: now_(), unitPrice: p, source: 'purchase', refId: movementId });
  }
  log_(actor, 'price', 'Movements', movementId, 'מחיר לקנייה: ' + p);
  return Db.byId('Movements', movementId);
}

// ---------- פרויקטים ומכולות ----------

function setProjectStatus_(id, status, actor) {
  const pr = Db.byId('Projects', id);
  if (!pr || ['open', 'closed'].indexOf(status) < 0) userError_(MSG.conflict);
  Db.update('Projects', id, status === 'closed' ? { status, closedAt: now_() } : { status, closedAt: '' });
  log_(actor, status === 'closed' ? 'close' : 'reopen', 'Projects', id, 'פרויקט: ' + pr.name);
  return Db.byId('Projects', id);
}

// מה עדיין קשור לפרויקט לפני סגירה
function projectCloseCheck_(id) {
  const containers = Db.all('ContainerProjects').filter(c => c.projectId === id && !c.to).map(c => {
    const loc = Db.byId('Locations', c.containerId) || {};
    const items = Model.heldBy('L:' + c.containerId);
    return { containerId: c.containerId, name: loc.name, itemCount: items.length };
  });
  const containerIds = containers.map(c => c.containerId);
  const openOrders = Db.all('Orders').filter(o => ['draft', 'sent', 'partial'].indexOf(o.status) >= 0 &&
    containerIds.indexOf(o.destId) >= 0).map(o => ({ id: o.id, number: o.number }));
  return { containers, openOrders };
}

function assignContainer_(containerId, projectId, assign, actor) {
  const loc = Db.byId('Locations', containerId);
  const pr = Db.byId('Projects', projectId);
  if (!loc || SITE_LOCATION_TYPES.indexOf(loc.type) < 0 || !pr) userError_(MSG.conflict);
  const current = Db.all('ContainerProjects').find(c => c.containerId === containerId && c.projectId === projectId && !c.to);
  if (assign && !current) Db.insert('ContainerProjects', { containerId, projectId, from: now_(), to: '' });
  if (!assign && current) Db.update('ContainerProjects', current.id, { to: now_() });
  log_(actor, assign ? 'assign' : 'unassign', 'ContainerProjects', containerId, loc.name + ' · ' + pr.name);
  return Db.clean(Db.all('ContainerProjects'));
}

// ---------- אנשים והגדרות ----------

function newPersonToken_(id, actor) {
  const p = Db.byId('People', id);
  if (!p) userError_(MSG.conflict);
  Db.update('People', id, { token: newToken_() });
  log_(actor, 'newToken', 'People', id, 'קישור חדש: ' + p.name);
  return Db.byId('People', id);
}

const EDITABLE_SETTINGS = ['vatRate', 'lateDays', 'stalePriceMonths', 'digestHour', 'companyName', 'companyDetails'];

function saveSettings_(values, actor) {
  const before = Db.settings();
  EDITABLE_SETTINGS.forEach(k => {
    if (values[k] === undefined) return;
    const v = String(values[k]).trim();
    if (k !== 'companyName' && k !== 'companyDetails' && !(Number(v) >= 0)) userError_(MSG.missing + k);
    if (k === 'digestHour' && !(Number(v) >= 0 && Number(v) <= 23)) userError_(MSG.missing + 'שעה');
    Db.setSetting(k, v);
  });
  if (values.digestHour !== undefined && String(values.digestHour) !== String(before.digestHour)) installTriggers_();
  log_(actor, 'update', 'Settings', '', 'הגדרות', before, Db.settings());
  return Db.settings();
}

// ==================== Api.gs ====================
// נקודת הכניסה של הדפים (GitHub Pages). כל בקשה: POST עם JSON { action, token | session, ... }.
// התשובה: { ok: true, data } או { ok: false, error, code }.

function doGet() {
  return json_({ ok: true, app: 'inventory', version: CONFIG.APP_VERSION });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: MSG.generic });
  }
  return json_(handle_(req));
}

function handle_(req) {
  try {
    Db.useExternal(null);
    Model.reset();
    return { ok: true, data: route_(req) };
  } catch (err) {
    if (!err.userMessage) console.error(req && req.action, err && err.stack || err);
    return { ok: false, error: err.userMessage || MSG.generic, code: err.code || '' };
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- "השתנה משהו?" ----------
// מספר גרסה שמתעדכן בכל שינוי. המסכים שואלים עליו כל כמה שניות – שאלה זולה, בלי לקרוא את הגיליון,
// ומושכים את כל הנתונים רק כשהוא השתנה.
function dataVersion_() {
  return PropertiesService.getScriptProperties().getProperty('DATA_VERSION') || '0';
}
function bumpVersion_() {
  PropertiesService.getScriptProperties().setProperty('DATA_VERSION', Date.now() + '-' + Math.floor(Math.random() * 1e6));
}

const FIELD_ACTIONS = {
  'field.bootstrap': (req, me) => fieldBootstrap_(me),
  'field.submit': (req, me) => {
    const out = withLock_(() => submitBatch_(req.movements || [], me));
    if (out.results.some(r => r.ok && r.id)) bumpVersion_();
    // withBoot: מחזירים גם את כל הנתונים המעודכנים – הטלפון לא צריך פנייה נוספת לרענון
    if (req.withBoot) {
      Model.reset();
      out.boot = fieldBootstrap_(me);
    }
    return out;
  },
  // מסמך שהועלה ל-Drive (הקובץ עצמו נוצר בסקריפט – doc.upload) – כאן רק נרשם במערכת
  'field.doc': (req, me) => {
    const out = addDoc_(req.doc || {}, me);
    bumpVersion_();
    return out;
  },
  'field.undo': (req, me) => {
    const out = withLock_(() => reverseMovement_(req.movementId, me, false));
    bumpVersion_();
    return out;
  },
};

const ADMIN_ACTIONS = {
  'admin.bootstrap': (req, me) => adminBootstrap_(me),
  'admin.save': (req, me) => strip_(saveRecord_(req.entity, req.record || {}, me, req.options)),
  'admin.archive': (req, me) => archive_(req.entity, req.id, me),
  'admin.restore': (req, me) => strip_(restore_(req.entity, req.id, me)),
  'admin.items.duplicate': (req, me) => strip_(duplicateItem_(req.id, me)),
  'admin.items.quickAdd': (req, me) => quickAdd_(req.parentId || '', req.rows || [], me),
  'admin.movement.add': (req, me) => recordMovement_(req.movement || {}, me, true),
  'admin.movement.reverse': (req, me) => reverseMovement_(req.id, me, true),
  'admin.doc.add': (req, me) => addDoc_(req.doc || {}, me),
  'admin.movement.setProject': (req, me) => setMovementProject_(req.id, req.projectId, me),
  'admin.unknown.resolve': (req, me) => strip_(resolveUnknown_(req.id, req.itemId, me)),
  'admin.purchase.setPrice': (req, me) => strip_(setPurchasePrice_(req.movementId, req.unitPrice, req.includesVat, req.supplierId, me)),
  'admin.order.save': (req, me) => strip_(saveOrder_(req.order || {}, me)),
  'admin.supplierItems.save': (req, me) => saveSupplierItems_(req.supplierId, req.rows || [], me),
  'admin.order.status': (req, me) => strip_(setOrderStatus_(req.id, req.status, me)),
  'admin.order.pdf': (req) => orderPdf_(req.id),
  'admin.order.doc': (req) => orderStatusDoc_(req.id, req.kind),
  'admin.order.expected': (req, me) => setLinesExpected_(req.lineIds || [], req.date, me),
  'admin.project.status': (req, me) => strip_(setProjectStatus_(req.id, req.status, me)),
  'admin.project.closeCheck': (req) => projectCloseCheck_(req.id),
  'admin.container.assign': (req, me) => assignContainer_(req.containerId, req.projectId, req.assign !== false, me),
  'admin.person.newToken': (req, me) => strip_(newPersonToken_(req.id, me)),
  'admin.settings.save': (req, me) => saveSettings_(req.values || {}, me),
  'admin.backup.now': () => backupNow_(),
};

// פעולות שמשנות נתונים רצות תחת נעילה, כדי ששני משתמשים לא יכתבו באותו רגע
const ADMIN_READ_ONLY = ['admin.bootstrap', 'admin.order.pdf', 'admin.order.doc', 'admin.project.closeCheck'];

function route_(req) {
  const action = String(req.action || '');
  if (action === 'ping') return { ver: dataVersion_() };
  if (action === 'admin.login') return adminLogin_(req.idToken);
  if (action === 'fb.backup') return fbBackupRequest_(req.idToken); // "גבה עכשיו" מהגרסה החדשה
  if (action === 'doc.upload') return docUpload_(req); // צילום מסמך → PDF ב-Drive
  if (FIELD_ACTIONS[action]) return FIELD_ACTIONS[action](req, fieldPerson_(req.token));
  if (ADMIN_ACTIONS[action]) {
    const me = adminPerson_(req.session);
    if (ADMIN_READ_ONLY.indexOf(action) >= 0) return ADMIN_ACTIONS[action](req, me);
    const result = withLock_(() => ADMIN_ACTIONS[action](req, me));
    if (action !== 'admin.backup.now') bumpVersion_();
    // withBoot: מחזירים מיד גם את כל הנתונים המעודכנים – פנייה אחת לשרת במקום שתיים
    if (req.withBoot) {
      Model.reset();
      return { result, boot: adminBootstrap_(me) };
    }
    return result;
  }
  userError_(MSG.generic);
}

// ---------- שטח ----------

// כל דיווח מטופל בנפרד – דיווח שנכשל לא מפיל את האחרים שחיכו בתור
function submitBatch_(movements, me) {
  const results = movements.slice(0, 50).map(inp => {
    try {
      return Object.assign({ ok: true, clientKey: inp.clientKey }, recordMovement_(inp, me, false));
    } catch (err) {
      if (!err.userMessage) console.error('field.submit', err && err.stack || err);
      return { ok: false, clientKey: inp.clientKey, error: err.userMessage || MSG.generic };
    }
  });
  return { results, me: fieldPersonal_(me) };
}

// מה שהעובד צריך כדי לעבוד: רשימות, מלאי, ומה רשום עליו
function fieldBootstrap_(me) {
  const ver = dataVersion_(); // נקרא לפני הנתונים: שינוי שקורה תוך כדי יזוהה בבדיקה הבאה
  const pick = (rows, keys) => rows.map(o => {
    const c = {};
    keys.forEach(k => { c[k] = o[k]; });
    return c;
  });
  const openOrders = Db.all('Orders').filter(o => o.status === 'sent' || o.status === 'partial');
  const openOrderIds = openOrders.map(o => o.id);
  const received = Model.receivedByLine();
  return {
    me: { id: me.id, name: me.name, role: me.role },
    items: pick(Db.all('Items'), ['id', 'parentId', 'name', 'kind', 'unitId', 'buyUnitName', 'buyUnitQty', 'aliases', 'imageId', 'sort', 'isFolder']),
    units: pick(Db.all('Units'), ['id', 'name']),
    locations: pick(Db.all('Locations'), ['id', 'name', 'type']),
    people: pick(Db.all('People'), ['id', 'name']),
    suppliers: pick(Db.all('Suppliers'), ['id', 'name']),
    projects: pick(Db.all('Projects').filter(p => p.status === 'open'), ['id', 'name']),
    containerProjects: pick(Db.all('ContainerProjects').filter(c => !c.to), ['containerId', 'projectId']),
    stock: Model.balances(),
    orders: pick(openOrders, ['id', 'number', 'supplierId', 'destId', 'status']),
    orderLines: Db.all('OrderLines').filter(l => openOrderIds.indexOf(l.orderId) >= 0 && l.qtyBuy > 0)
      .map(l => ({ id: l.id, orderId: l.orderId, itemId: l.itemId, qtyBuy: l.qtyBuy, buyUnitQty: l.buyUnitQty, received: received[l.id] || 0,
        destId: l.destId || (openOrders.find(o => o.id === l.orderId) || {}).destId })),
    personal: fieldPersonal_(me),
    serverTime: now_(),
    ver,
  };
}

function fieldPersonal_(me) {
  Model.reset();
  const mine = Db.all('Movements').filter(m => m.byPersonId === me.id);
  const recent = [];
  for (let i = mine.length - 1; i >= 0 && recent.length < 8; i--) {
    const id = mine[i].itemId;
    if (id && recent.indexOf(id) < 0 && Model.item(id) && !Model.item(id).archived) recent.push(id);
  }
  return {
    tools: Model.heldBy('P:' + me.id),
    pulls: Model.pullsOf(me.id),
    recentItemIds: recent,
  };
}

// ---------- מנהל ----------

function adminBootstrap_(me) {
  const ver = dataVersion_();
  const tables = {};
  ['Items', 'Units', 'Locations', 'ContainerProjects', 'People', 'Projects', 'Suppliers', 'Movements',
    'UnknownItems', 'Orders', 'OrderLines', 'Prices', 'Docs', 'SupplierItems'].forEach(name => {
    tables[name] = Db.clean(Db.all(name, { includeArchived: true }));
  });
  const log = Db.all('Log');
  return {
    me: { id: me.id, name: me.name, email: me.email },
    tables,
    log: Db.clean(log.slice(-500)),
    stock: Model.balances(),
    receivedByLine: Model.receivedByLine(),
    settings: Db.settings(),
    serverTime: now_(),
    ver,
    stamp: Date.now(), // לסדר תשובות בדפדפן: תשובה ישנה לא דורסת חדשה
  };
}

// ==================== Digest.gs ====================
// מייל סיכום יומי למנהלים + גיבוי חודשי. רצים מטריגרים של זמן.

// מה דורש טיפול. משמש גם את המייל וגם את מסך הבית של הניהול (שמחשב את אותו דבר בדפדפן).
function buildDigest_() {
  const s = Db.settings();
  const now = Date.now();
  const lateMs = (Number(s.lateDays) || 7) * 86400000;
  const last = lastDigestAt_();
  const since = last ? Date.parse(last) : 0;
  const unitName = id => (Db.byId('Units', Model.inherited(id, 'unitId')) || {}).name || '';

  const belowMin = Db.all('Items').filter(it => it.minQty !== null && it.minQty !== '' && Model.isLeaf(it.id))
    .map(it => ({ name: it.name, qty: Model.warehouseQty(it.id), min: it.minQty, unit: unitName(it.id) }))
    .filter(x => x.qty < x.min);

  const received = Model.receivedByLine();
  const late = Db.all('Orders').map(o => ({ o, days: orderLateDays_(o, received, now) })).filter(x => x.days > 0).map(x => ({
    number: x.o.number, supplier: (Db.byId('Suppliers', x.o.supplierId) || {}).name || '', days: x.days,
  }));

  const reversed = Model.reversedIds_();
  const missingPrice = Db.all('Movements').filter(m => m.type === 'purchase' && m.unitPrice === null && !reversed[m.id]).length;

  const unknown = Db.all('UnknownItems').filter(u => u.status === 'open').length;

  const overdraws = Db.all('Movements').filter(m => String(m.flags).indexOf('overdraw') >= 0 && !reversed[m.id] &&
    Date.parse(m.at) > since).map(m => ({
    person: (Db.byId('People', m.byPersonId) || {}).name || '',
    qty: m.qty, item: (Model.item(m.itemId) || {}).name || '', from: Model.holderName(m.from),
  }));

  const closedWithStuff = Db.all('Projects').filter(p => p.status === 'closed').map(p => {
    const containers = Db.all('ContainerProjects').filter(c => c.projectId === p.id && !c.to)
      .filter(c => Model.heldBy('L:' + c.containerId).length);
    return containers.length ? { name: p.name, containers: containers.map(c => Model.holderName('L:' + c.containerId)) } : null;
  }).filter(Boolean);

  const count = belowMin.length + late.length + (missingPrice ? 1 : 0) + (unknown ? 1 : 0) + overdraws.length + closedWithStuff.length;
  return { count, belowMin, late, missingPrice, unknown, overdraws, closedWithStuff };
}

// מתי נשלח הסיכום האחרון. בגרסה החדשה הנתונים ב-Firebase (לקריאה בלבד) – לכן שומרים את זה בהגדרות הסקריפט.
function lastDigestAt_() {
  if (fbActive_()) return PropertiesService.getScriptProperties().getProperty('FB_LAST_DIGEST_AT') || '';
  return Db.setting('lastDigestAt');
}
function setLastDigestAt_(v) {
  if (fbActive_()) PropertiesService.getScriptProperties().setProperty('FB_LAST_DIGEST_AT', v);
  else Db.setSetting('lastDigestAt', v);
}

function sendDigest() {
  Db.reset();
  Model.reset();
  if (fbActive_()) fbLoad_();
  const d = buildDigest_();
  setLastDigestAt_(now_());
  if (!d.count) return; // ביום בלי כלום לטפל – לא שולחים

  const to = Db.all('People').filter(p => p.role === 'admin' && p.alerts && p.email).map(p => p.email);
  if (!to.length) return;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sec = (title, lines) => lines.length
    ? '<h3 style="color:#4A3524;margin:16px 0 4px">' + title + '</h3><ul style="margin:0;padding-right:18px">' +
      lines.map(l => '<li>' + l + '</li>').join('') + '</ul>' : '';
  const url = PropertiesService.getScriptProperties().getProperty('ADMIN_URL') || '';

  const html = '<div dir="rtl" style="font-family:Arial,sans-serif;color:#2b2118;font-size:14px">' +
    '<p>בוקר טוב, זה מה שמחכה לטיפול היום:</p>' +
    sec('מתחת למינימום', d.belowMin.map(x => esc(x.name) + ': ' + x.qty + ' מתוך מינימום ' + x.min + ' ' + esc(x.unit))) +
    sec('הזמנות באיחור', d.late.map(x => 'הזמנה ' + x.number + ' מ' + esc(x.supplier) + ' – ' + x.days + ' ימים באיחור')) +
    sec('חסר מחיר', d.missingPrice ? [d.missingPrice + ' קניות בחנות בלי מחיר'] : []) +
    sec('פריטים לא מוכרים', d.unknown ? [d.unknown + ' פריטים מחכים לשיוך'] : []) +
    sec('משיכות מעבר למלאי', d.overdraws.map(x => esc(x.person) + ' משך ' + x.qty + ' ' + esc(x.item) + ' מ' + esc(x.from) +
      ', אבל לפי המערכת לא היה שם מספיק')) +
    sec('פרויקטים שנסגרו עם ציוד', d.closedWithStuff.map(x => esc(x.name) + ' – ' + esc(x.containers.join(', ')))) +
    (url ? '<p style="margin-top:20px"><a href="' + url + '" style="background:#6A9A3A;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none">למסך הניהול</a></p>' : '') +
    '</div>';

  MailApp.sendEmail({
    to: to.join(','),
    subject: 'מלאי: ' + d.count + ' דברים לטיפול – ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd.MM.yyyy'),
    htmlBody: html,
  });
}

// עותק של כל הגיליון לתיקיית הגיבויים
function backupNow_() {
  const folders = DriveApp.getFoldersByName(CONFIG.BACKUP_FOLDER);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(CONFIG.BACKUP_FOLDER);
  const name = 'גיבוי מלאי ' + today_();
  if (fbActive_()) {
    // גרסה חדשה: הנתונים ב-Firebase
    fbLoad_();
    fbRawBackup_(name, folder);
  } else {
    DriveApp.getFileById(SpreadsheetApp.getActive().getId()).makeCopy(name, folder);
  }
  const readable = readableSnapshot_(folder);
  return { name, readable };
}

function monthlyBackup() {
  Db.reset();
  Model.reset();
  backupNow_();
}

// ---------- קובץ קריא: "מצב מלאי YYYY-MM-DD" ----------
// העותק הגולמי נועד לשחזור. הקובץ הזה נועד לאנשים: עברית, שמות במקום מזהים, בלי קודים.

const MOVE_NAMES = {
  opening: 'מלאי פתיחה', receive: 'קבלה מהזמנה', purchase: 'קנייה בחנות', pull: 'משיכה לפרויקט',
  return_surplus: 'החזרת עודף', transfer: 'העברה', repair_out: 'נשלח לתיקון', repair_in: 'חזר מתיקון',
  broken: 'נהרס', lost: 'אבד', found: 'נמצא', return_supplier: 'החזרה לספק', count: 'תיקון ספירה', reversal: 'ביטול דיווח',
};

function readableSnapshot_(folder) {
  const name = 'מצב מלאי ' + today_();
  const ss = SpreadsheetApp.create(name);
  const unitOf = id => (Db.byId('Units', Model.inherited(id, 'unitId')) || {}).name || '';
  const pathOf = id => Model.path(id).slice(0, -1).join(' › ');
  const nameOf = (table, id) => (Db.byId(table, id) || {}).name || '';
  const fmtDate = iso => (iso ? Utilities.formatDate(new Date(iso), CONFIG.TIMEZONE, 'dd.MM.yyyy HH:mm') : '');
  const lastPrice = {};
  Db.all('Prices').forEach(p => { if (!lastPrice[p.itemId] || p.at > lastPrice[p.itemId].at) lastPrice[p.itemId] = p; });
  const valueOf = it => (it.value !== null && it.value !== '' ? it.value : (lastPrice[it.id] || {}).unitPrice || 0);
  const balances = Model.balances();

  // מלאי: שורה לכל פריט, עמודה לכל מקום
  const locs = Db.all('Locations');
  const leaves = Db.all('Items').filter(it => Model.isLeaf(it.id))
    .sort((a, b) => (pathOf(a.id) + a.name).localeCompare(pathOf(b.id) + b.name, 'he'));
  const stockRows = leaves.map(it => {
    const row = balances[it.id] || {};
    const people = Object.keys(row).filter(h => h.indexOf('P:') === 0).reduce((s, h) => s + row[h], 0);
    const w = Model.warehouseQty(it.id);
    const min = it.minQty === null ? '' : it.minQty;
    const val = valueOf(it);
    return [pathOf(it.id), it.name, Model.kindOf(it.id) === 'tool' ? 'כלי' : 'מתכלה', unitOf(it.id)]
      .concat(locs.map(l => row['L:' + l.id] || ''), [people || '', w, min, min !== '' && w < min ? 'כן' : '',
        val ? Math.round(val * 100) / 100 : '', val ? Math.round(val * w * 100) / 100 : '']);
  });
  writeSheet_(ss, 'מלאי', ['תיקייה', 'פריט', 'סוג', 'יחידה'].concat(locs.map(l => l.name),
    ['אצל אנשים', 'סה"כ במחסנים', 'מינימום', 'מתחת למינימום', 'שווי ליחידה (₪)', 'שווי במחסנים (₪)']), stockRows);

  // אצל אנשים
  const peopleRows = [];
  Db.all('People').forEach(p => {
    Model.heldBy('P:' + p.id).forEach(h => {
      const it = Model.item(h.itemId);
      if (it) peopleRows.push([p.name, pathOf(it.id), it.name, h.qty, unitOf(it.id)]);
    });
  });
  writeSheet_(ss, 'אצל אנשים', ['עובד', 'תיקייה', 'פריט', 'כמות', 'יחידה'], peopleRows);

  // תנועות של 31 הימים האחרונים
  const since = Date.now() - 31 * 86400000;
  const reversed = Model.reversedIds_();
  const unknown = {};
  Db.all('UnknownItems').forEach(u => { unknown[u.movementId] = u.text; });
  const holder = h => (h === 'X' ? '' : Model.holderName(h));
  const moveRows = Db.all('Movements').filter(m => Date.parse(m.clientAt || m.at) >= since).reverse().map(m => {
    const it = Model.item(m.itemId);
    return [fmtDate(m.clientAt || m.at), nameOf('People', m.byPersonId), MOVE_NAMES[m.type] || m.type, m.qty,
      it ? unitOf(it.id) : '', it ? it.name : unknown[m.id] ? '"' + unknown[m.id] + '" (לא מוכר)' : '',
      holder(m.from), holder(m.to), nameOf('Projects', m.projectId), m.note, reversed[m.id] ? 'בוטל' : ''];
  });
  writeSheet_(ss, 'תנועות 31 יום', ['מתי', 'מי', 'פעולה', 'כמות', 'יחידה', 'פריט', 'מאיפה', 'לאן', 'פרויקט', 'הערה', 'בוטל'], moveRows);

  // הזמנות פתוחות
  const received = Model.receivedByLine();
  const orderRows = [];
  Db.all('Orders').filter(o => ['draft', 'sent', 'partial'].indexOf(o.status) >= 0).forEach(o => {
    orderLines_(o.id).forEach(l => {
      const it = Model.item(l.itemId) || {};
      const per = l.buyUnitQty || 1;
      orderRows.push([o.number, nameOf('Suppliers', o.supplierId), nameOf('Locations', o.destId), ORDER_STATUS_NAMES[o.status],
        fmtDate(o.sentAt), it.name || '', l.qtyBuy, Math.round((received[l.id] || 0) / per * 100) / 100,
        per > 1 ? it.buyUnitName : unitOf(l.itemId), l.unitPriceBuy === null ? '' : l.unitPriceBuy]);
    });
  });
  writeSheet_(ss, 'הזמנות פתוחות', ['מס׳', 'ספק', 'יעד', 'מצב', 'נשלחה', 'פריט', 'הוזמן', 'התקבל', 'יחידה', 'מחיר ליחידה (₪)'], orderRows);

  // הגיליון הריק שנוצר עם הקובץ
  const first = ss.getSheets()[0];
  if (first && first.getName() !== 'מלאי' && ss.getSheets().length > 1) ss.deleteSheet(first);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  return name;
}

function writeSheet_(ss, name, header, rows) {
  const sh = ss.insertSheet(name);
  const data = [header].concat(rows.length ? rows : [header.map((h, i) => (i === 0 ? 'אין' : ''))]);
  sh.getRange(1, 1, data.length, header.length).setValues(data);
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#F3EEE7');
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  sh.autoResizeColumns(1, header.length);
  return sh;
}

// מתקין מחדש את הטריגרים: סיכום יומי בשעה מההגדרות, גיבוי ב-1 לכל חודש
function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['sendDigest', 'monthlyBackup'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  const hour = Number(Db.setting('digestHour')) || 7;
  ScriptApp.newTrigger('sendDigest').timeBased().everyDays(1).atHour(hour).inTimezone(CONFIG.TIMEZONE).create();
  ScriptApp.newTrigger('monthlyBackup').timeBased().onMonthDay(1).atHour(3).inTimezone(CONFIG.TIMEZONE).create();
}
