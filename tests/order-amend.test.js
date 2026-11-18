// בדיקות לעריכת הזמנה אחרי שליחה (admin.order.save עם amend).
// הרצה: node tests/order-amend.test.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

function makeDb() {
  const t = {};
  const settings = { nextOrderNumber: 1, vatRate: 18 };
  let n = 0;
  const tbl = name => (t[name] = t[name] || []);
  const db = {
    all: (name, o) => tbl(name).filter(r => (o && o.includeArchived) || !r.archived),
    byId: (name, id) => tbl(name).find(r => r.id === id) || null,
    insert: (name, d) => { const r = Object.assign({ id: name.slice(0, 2).toUpperCase() + (++n), archived: false }, d); tbl(name).push(r); return r; },
    update: (name, id, d) => Object.assign(tbl(name).find(r => r.id === id), d),
    setting: k => settings[k],
    setSetting: (k, v) => { settings[k] = v; },
  };
  db.insertMany = (name, list) => list.map(d => db.insert(name, d));
  return db;
}

function load() {
  const ctx = { console, Date, Math, JSON, Object, Array, String, Number, Error, Set, isNaN };
  ctx.Db = makeDb();
  ctx.window = ctx;
  ctx.CONFIG = { TIMEZONE: 'Asia/Jerusalem' };
  ctx.Utilities = { formatDate: d => d.toISOString(), getUuid: () => Math.random().toString(16).slice(2) };
  ctx.LockService = { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'v2', 'core.js'), 'utf8');
  vm.runInContext(src + '\n;this.__x = { saveOrder_, setOrderStatus_, saveRecord_, Model, orderLines_ };', ctx);
  return ctx;
}

const actor = { id: 'PE1' };
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + (e.userMessage || e.message)); process.exitCode = 1; }
}

// הזמנה שנשלחה: מצמד 10 ב-5 ₪, זווית 4 ב-3 ₪
function setup(received) {
  const c = load();
  const x = c.__x;
  const sup = c.Db.insert('Suppliers', { name: 'הגרעין' });
  const sup2 = c.Db.insert('Suppliers', { name: 'ספק אחר' });
  const wh = c.Db.insert('Locations', { name: 'קדרון', type: 'warehouse' });
  const a = x.saveRecord_('Items', { name: 'מצמד 25' }, actor);
  const b = x.saveRecord_('Items', { name: 'זווית 25' }, actor);
  const t = x.saveRecord_('Items', { name: 'טי 25' }, actor);
  const o = x.saveOrder_({ supplierId: sup.id, destId: wh.id, lines: [
    { itemId: a.id, qtyBuy: 10, listPrice: 5 }, { itemId: b.id, qtyBuy: 4, listPrice: 3 }] }, actor);
  x.setOrderStatus_(o.id, 'send', actor);
  const [la, lb] = Array.from(x.orderLines_(o.id));
  x.Model.receivedByLine = () => (received ? received(la, lb) : {});
  return { c, x, sup, sup2, wh, a, b, t, o, la, lb };
}
const lines = (x, o) => Array.from(x.orderLines_(o.id)).map(l => [l.itemId, l.qtyBuy, l.unitPriceBuy]);
const base = (s, lineArr) => ({ id: s.o.id, amend: true, supplierId: s.sup.id, destId: s.wh.id, lines: lineArr });

test('בלי amend – הזמנה שנשלחה עדיין לא נערכת (כמו היום)', () => {
  const s = setup();
  assert.throws(() => s.x.saveOrder_({ id: s.o.id, supplierId: s.sup.id, destId: s.wh.id, lines: [] }, actor));
});

test('עריכה: הגדלת כמות, שינוי מחיר והוספת פריט', () => {
  const s = setup();
  s.x.saveOrder_(base(s, [
    { id: s.la.id, itemId: s.a.id, qtyBuy: 15, listPrice: 5 },
    { id: s.lb.id, itemId: s.b.id, qtyBuy: 4, listPrice: 2.5 },
    { itemId: s.t.id, qtyBuy: 6, listPrice: 4 }]), actor);
  assert.deepStrictEqual(lines(s.x, s.o), [[s.a.id, 15, 5], [s.b.id, 4, 2.5], [s.t.id, 6, 4]]);
  assert.strictEqual(s.c.Db.byId('Orders', s.o.id).status, 'sent');
  const log = s.c.Db.all('Log').filter(l => l.action === 'amend');
  assert.strictEqual(log.length, 1);
});

test('הסרת פריט שלא התקבל ממנו כלום', () => {
  const s = setup();
  s.x.saveOrder_(base(s, [{ id: s.la.id, itemId: s.a.id, qtyBuy: 10, listPrice: 5 }]), actor);
  assert.deepStrictEqual(lines(s.x, s.o), [[s.a.id, 10, 5]]);
});

test('אי אפשר לרדת מתחת למה שהתקבל – ושום דבר לא משתנה', () => {
  const s = setup((la) => ({ [la.id]: 6 }));
  const before = JSON.stringify(lines(s.x, s.o));
  assert.throws(() => s.x.saveOrder_(base(s, [
    { id: s.la.id, itemId: s.a.id, qtyBuy: 5, listPrice: 9 },
    { id: s.lb.id, itemId: s.b.id, qtyBuy: 8, listPrice: 3 }]), actor), /כבר התקבלו 6/);
  assert.strictEqual(JSON.stringify(lines(s.x, s.o)), before);
});

test('אי אפשר להסיר פריט שכבר התקבל ממנו', () => {
  const s = setup((la) => ({ [la.id]: 2 }));
  assert.throws(() => s.x.saveOrder_(base(s, [{ id: s.lb.id, itemId: s.b.id, qtyBuy: 4, listPrice: 3 }]), actor));
});

test('קיצוץ בדיוק למה שהתקבל סוגר את ההזמנה כ"התקבלה"', () => {
  const s = setup((la, lb) => ({ [la.id]: 6, [lb.id]: 4 }));
  s.x.saveOrder_(base(s, [
    { id: s.la.id, itemId: s.a.id, qtyBuy: 6, listPrice: 5 },
    { id: s.lb.id, itemId: s.b.id, qtyBuy: 4, listPrice: 3 }]), actor);
  assert.strictEqual(s.c.Db.byId('Orders', s.o.id).status, 'received');
});

test('הזמנה שהתקבלה חלקית – תוספת משאירה אותה פתוחה', () => {
  const s = setup((la) => ({ [la.id]: 10 }));
  s.c.Db.update('Orders', s.o.id, { status: 'partial' });
  s.x.saveOrder_(base(s, [
    { id: s.la.id, itemId: s.a.id, qtyBuy: 12, listPrice: 5 },
    { id: s.lb.id, itemId: s.b.id, qtyBuy: 4, listPrice: 3 }]), actor);
  assert.strictEqual(s.c.Db.byId('Orders', s.o.id).status, 'partial');
});

test('אי אפשר להחליף ספק', () => {
  const s = setup();
  const p = base(s, [{ id: s.la.id, itemId: s.a.id, qtyBuy: 10, listPrice: 5 }]);
  p.supplierId = s.sup2.id;
  assert.throws(() => s.x.saveOrder_(p, actor), /ספק/);
});

test('אי אפשר להשאיר הזמנה שנשלחה בלי שורות', () => {
  const s = setup();
  assert.throws(() => s.x.saveOrder_(base(s, [
    { id: s.la.id, itemId: s.a.id, qtyBuy: 0 }, { id: s.lb.id, itemId: s.b.id, qtyBuy: 0 }]), actor), /לפחות שורה/);
});

test('הזמנה שבוטלה או נסגרה – לא נערכת', () => {
  const s = setup();
  s.c.Db.update('Orders', s.o.id, { status: 'canceled' });
  assert.throws(() => s.x.saveOrder_(base(s, [{ id: s.la.id, itemId: s.a.id, qtyBuy: 10, listPrice: 5 }]), actor));
});

console.log(passed + ' passed');
