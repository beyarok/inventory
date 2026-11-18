// בדיקות לסדר פריטים קבוע (admin.items.reorder) ולפריט חדש שנכנס בסוף.
// הרצה: node tests/reorder.test.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

function makeDb() {
  const t = {};
  let n = 0;
  const tbl = name => (t[name] = t[name] || []);
  return {
    all: (name, o) => tbl(name).filter(r => (o && o.includeArchived) || !r.archived),
    byId: (name, id) => tbl(name).find(r => r.id === id) || null,
    insert: (name, d) => { const r = Object.assign({ id: d.id || name.slice(0, 2).toUpperCase() + (++n), archived: false }, d); tbl(name).push(r); return r; },
    insertMany: (name, list) => list.map(d => this.insert(name, d)),
    update: (name, id, d) => Object.assign(tbl(name).find(r => r.id === id), d),
    _t: t,
  };
}

function load() {
  const ctx = { console, Date, Math, JSON, Object, Array, String, Number, Error, Set };
  ctx.Db = makeDb();
  ctx.window = ctx;
  ctx.CONFIG = { TIMEZONE: 'Asia/Jerusalem' };
  ctx.Utilities = { formatDate: d => d.toISOString(), getUuid: () => Math.random().toString(16).slice(2) };
  ctx.LockService = { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'v2', 'core.js'), 'utf8');
  vm.runInContext(src + '\n;this.__x = { reorderItems_, saveRecord_, Model, ADMIN_ACTIONS };', ctx);
  return ctx;
}

const actor = { id: 'PE1' };
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + (e.userMessage || e.message)); process.exitCode = 1; }
}

function setup() {
  const c = load();
  const { saveRecord_ } = c.__x;
  const f = saveRecord_('Items', { name: 'אביזרים 25', isFolder: true }, actor);
  const a = saveRecord_('Items', { name: 'מצמד 25', parentId: f.id }, actor);
  const b = saveRecord_('Items', { name: 'זווית 25', parentId: f.id }, actor);
  const d = saveRecord_('Items', { name: 'הסתעפות 25', parentId: f.id }, actor);
  return { c, f, a, b, d };
}
const order = (c, pid) => Array.from(c.__x.Model.childrenOf(pid))
  .sort((x, y) => (x.sort || 0) - (y.sort || 0) || x.name.localeCompare(y.name, 'he', { numeric: true })).map(x => x.name);

test('הפעולה רשומה כפעולת מנהל', () => {
  const { c } = setup();
  assert.ok(c.__x.ADMIN_ACTIONS['admin.items.reorder']);
});

test('סדר חדש נשמר ונשאר אחרי טעינה מחדש של המודל', () => {
  const { c, f, a, b, d } = setup();
  c.__x.ADMIN_ACTIONS['admin.items.reorder']({ parentId: f.id, ids: [a.id, b.id, d.id] }, actor);
  c.__x.Model.reset();
  assert.deepStrictEqual(order(c, f.id), ['מצמד 25', 'זווית 25', 'הסתעפות 25']);
});

test('פריט חדש בתיקייה מסודרת נכנס בסוף', () => {
  const { c, f, a, b, d } = setup();
  c.__x.reorderItems_(f.id, [a.id, b.id, d.id], actor);
  c.__x.saveRecord_('Items', { name: 'אבזר א', parentId: f.id }, actor);
  assert.deepStrictEqual(order(c, f.id), ['מצמד 25', 'זווית 25', 'הסתעפות 25', 'אבזר א']);
});

test('פריט חדש בתיקייה בלי סדר – בלי שינוי (לפי א-ב כמו היום)', () => {
  const { c, f } = setup();
  const x = c.__x.saveRecord_('Items', { name: 'אבזר א', parentId: f.id }, actor);
  assert.ok(!x.sort);
});

test('רשימה חסרה / כפולה / זרה נדחית ולא משנה כלום', () => {
  const { c, f, a, b, d } = setup();
  const before = order(c, f.id);
  assert.throws(() => c.__x.reorderItems_(f.id, [a.id, b.id], actor));
  assert.throws(() => c.__x.reorderItems_(f.id, [a.id, a.id, b.id], actor));
  assert.throws(() => c.__x.reorderItems_(f.id, [a.id, b.id, f.id], actor));
  assert.deepStrictEqual(order(c, f.id), before);
});

test('פריט שהוסר (מוסתר) לא נכלל בסדר', () => {
  const { c, f, a, b, d } = setup();
  c.Db.update('Items', d.id, { archived: true });
  c.__x.Model.reset();
  c.__x.reorderItems_(f.id, [b.id, a.id], actor);
  assert.deepStrictEqual(order(c, f.id), ['זווית 25', 'מצמד 25']);
});

test('נרשם ביומן השינויים', () => {
  const { c, f, a, b, d } = setup();
  const n0 = c.Db.all('Log').length;
  c.__x.reorderItems_(f.id, [d.id, a.id, b.id], actor);
  const logs = c.Db.all('Log');
  assert.strictEqual(logs.length, n0 + 1);
  assert.ok(logs[logs.length - 1].summary.indexOf('סדר פריטים') === 0);
});

console.log(passed + ' passed');
