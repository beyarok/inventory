// גרסת Firebase: "השרת" רץ בדפדפן.
// אותו קוד של צד גוגל (core.js – נבנה מ-gas/) מטפל בכל בקשה, והנתונים נשמרים ב-Firestore.
//
// מבנה הנתונים ב-Firestore:
//   c/{טבלה~0001}  – חלק מטבלה: { t, seq, rev, pub, data: JSON {cols, rows} }. טבלה גדולה מתחלקת לכמה חלקים.
//   c/_meta         – { rev, chunks: {id: rev} } – מספר הגרסה של כל המאגר. כל שמירה מעלה אותו ב-1.
//   tokens/{token}  – { personId, active } – הקישורים האישיים של העובדים (לא נשמרים בטבלת האנשים)
//   devices/{uid}   – { token, personId } – טלפון שנכנס עם קישור אישי
//   admins/{email}  – { personId } – מי מנהל (לפי זה כללי האבטחה מאפשרים גישה)
//
// כל שמירה = טרנזקציה: קוראים את _meta; אם מישהו שמר בינתיים – מביאים את החלקים שהשתנו ומריצים מחדש.
// כך שני אנשים שלוחצים באותו רגע לא דורסים זה את זה.

(() => {
  const FB = 'https://www.gstatic.com/firebasejs/12.4.0/';
  const CHUNK_CHARS = 60000;      // גודל חלק (תווים). קטן = שמירה מהירה גם בטלפון
  const FIELD_WRITES = ['Movements', 'UnknownItems', 'Orders'];   // מה שעובד שטח יכול לשנות
  const ADMIN_ONLY_TABLES = ['Log'];                               // מה שעובד שטח לא קורא
  const TMP_VER = '__ver__';

  // ---------- תחליפים לשירותי גוגל שהקוד המשותף משתמש בהם ----------
  function fmtDate(d, tz, pattern) {
    const parts = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
    }).formatToParts(d).forEach(p => { parts[p.type] = p.value; });
    const off = (parts.timeZoneName || 'GMT+00:00').replace('GMT', '') || '+00:00';
    return pattern
      .replace("'T'", 'T')
      .replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day)
      .replace('HH', parts.hour).replace('mm', parts.minute).replace('ss', parts.second)
      .replace('XXX', off);
  }
  let lastHtml = '';
  window.Utilities = {
    formatDate: fmtDate,
    getUuid: () => crypto.randomUUID(),
    // PDF: בדפדפן אין המרה ל-PDF – מחזירים את הדף ומדפיסים אותו (שמירה כ-PDF מחלון ההדפסה)
    newBlob: html => { lastHtml = html; return { getAs: () => ({ getBytes: () => [] }) }; },
    base64Encode: () => '',
  };
  window.LockService = { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) };
  const mem = {};
  window.CacheService = { getScriptCache: () => ({ get: k => (k in mem ? mem[k] : null), put: (k, v) => { mem[k] = String(v); } }) };
  window.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in mem ? mem[k] : null), setProperty: (k, v) => { mem[k] = v; } }) };
  window.Session = { getEffectiveUser: () => ({ getEmail: () => (st.user && st.user.email) || '' }) };

  // ---------- מצב מקומי ----------
  const st = {
    mode: '',          // 'admin' | 'field'
    fb: null,          // פונקציות Firebase
    db: null,
    auth: null,
    user: null,
    token: '',         // שטח: הקישור האישי
    personId: '',      // שטח: מי העובד
    authError: '',
    raw: {},           // מה שהגיע מהמאזין: id -> נתוני המסמך
    rev: -1,           // הגרסה המקומית העקבית האחרונה
    chunks: {},        // id -> { t, seq, rev, cols, rows, raw }
    tokens: {},        // מנהל: token -> { personId, active }
    admins: {},        // מנהל: email -> { personId }
    unsub: [],
    ready: null,
    readyFns: null,
  };
  const pad = n => String(n).padStart(4, '0');
  const readable = id => st.mode !== 'field' || ADMIN_ONLY_TABLES.indexOf(id.split('~')[0]) < 0;

  function newReady() {
    st.ready = new Promise((resolve, reject) => {
      st.readyFns = {
        resolve: () => { st.readyState = 'ok'; resolve(); },
        reject: e => { st.readyState = 'failed'; reject(e); },
      };
    });
    st.readyState = '';
    st.ready.catch(() => {});
  }
  newReady();

  function parseChunk(id, d) {
    const j = JSON.parse(d.data || '{"cols":[],"rows":[]}');
    return { t: d.t, seq: d.seq, rev: d.rev, cols: j.cols, rows: j.rows, raw: d.data };
  }

  // ---------- Db: אותו ממשק כמו gas/Db.gs, על הנתונים מ-Firestore ----------
  const CH = new WeakMap(); // שורה -> החלק שממנו נטענה
  window.Db = (() => {
    let base = { chunks: {}, tokenOf: {} };
    let tables = {};

    function fields_(name) {
      return SCHEMA[name].map(f => {
        const [key, type] = f.split(':');
        return { key, type: type || 's' };
      });
    }
    function parse_(v, type) {
      if (type === 'n') return v === '' || v === null || v === undefined ? null : Number(v);
      if (type === 'b') return v === true || String(v).toUpperCase() === 'TRUE';
      return v === null || v === undefined ? '' : String(v);
    }
    function format_(v, type) {
      if (v === null || v === undefined || v === '') return '';
      if (type === 'b') return v ? 'TRUE' : 'FALSE';
      return String(v);
    }

    function chunkIdsOf(name) {
      return Object.keys(base.chunks).filter(id => base.chunks[id].t === name)
        .sort((a, b) => base.chunks[a].seq - base.chunks[b].seq);
    }

    function load_(name) {
      if (tables[name]) return tables[name];
      if (!SCHEMA[name]) throw new Error('Unknown table ' + name);
      if (st.mode === 'field' && ADMIN_ONLY_TABLES.indexOf(name) >= 0) throw new Error('No access to ' + name);
      const fields = fields_(name);
      const keys = fields.map(f => f.key);
      const typeOf = {};
      fields.forEach(f => { typeOf[f.key] = f.type; });
      const rows = [];
      const byId = {};
      const ids = chunkIdsOf(name);
      ids.forEach(cid => {
        const c = base.chunks[cid];
        const at = keys.map(k => c.cols.indexOf(k));
        c.rows.forEach(arr => {
          const o = {};
          keys.forEach((k, i) => { o[k] = parse_(at[i] < 0 ? '' : arr[at[i]], typeOf[k]); });
          if (name === 'People') o.token = base.tokenOf[o.id] || '';
          CH.set(o, cid);
          rows.push(o);
          if (o.id) byId[o.id] = o;
        });
      });
      const t = { name, keys, typeOf, rows, byId, next: null, dirty: false, touched: new Set(), chunkIds: ids };
      tables[name] = t;
      return t;
    }

    function nextId_(t) {
      const prefix = ID_PREFIX[t.name];
      if (t.next === null) {
        let max = 0;
        t.rows.forEach(o => {
          const m = String(o.id || '').match(/-(\d+)$/);
          if (m) max = Math.max(max, Number(m[1]));
        });
        t.next = max + 1;
      }
      const width = t.name === 'Movements' ? 6 : 4;
      return prefix + '-' + String(t.next++).padStart(width, '0');
    }

    function all(name, opts) {
      const t = load_(name);
      if (opts && opts.includeArchived) return t.rows;
      return t.rows.filter(o => !o.archived);
    }
    function byId(name, id) {
      return id ? load_(name).byId[id] || null : null;
    }
    function insertMany(name, objs) {
      if (!objs.length) return [];
      const t = load_(name);
      objs.forEach(o => {
        if (ID_PREFIX[name] && !o.id) o.id = nextId_(t);
        t.keys.forEach(h => { o[h] = parse_(format_(o[h], t.typeOf[h]), t.typeOf[h]); });
        t.rows.push(o);
        if (o.id) t.byId[o.id] = o;
      });
      t.dirty = true;
      return objs;
    }
    function insert(name, obj) {
      return insertMany(name, [obj])[0];
    }
    function update(name, id, patch) {
      const t = load_(name);
      const o = t.byId[id];
      if (!o) throw new Error('Not found: ' + name + ' ' + id);
      Object.keys(patch).forEach(k => {
        if (k === 'id' || k === '_row') return;
        if (t.typeOf[k] !== undefined) o[k] = parse_(format_(patch[k], t.typeOf[k]), t.typeOf[k]);
      });
      t.dirty = true;
      if (CH.get(o)) t.touched.add(CH.get(o));
      return o;
    }
    function setting(key) {
      const row = load_('Settings').rows.find(o => o.key === key);
      if (row) return row.value;
      return DEFAULT_SETTINGS[key] !== undefined ? DEFAULT_SETTINGS[key] : '';
    }
    function setSetting(key, value) {
      const t = load_('Settings');
      const row = t.rows.find(o => o.key === key);
      if (row) {
        row.value = String(value);
        t.dirty = true;
        if (CH.get(row)) t.touched.add(CH.get(row));
      } else {
        insert('Settings', { key, value: String(value) });
      }
    }
    function settings() {
      const out = Object.assign({}, DEFAULT_SETTINGS);
      load_('Settings').rows.forEach(o => { out[o.key] = o.value; });
      return out;
    }
    function clean(rows) {
      return rows.map(o => Object.assign({}, o));
    }
    function reset() { tables = {}; }
    function useExternal() { tables = {}; } // בגיליון: מקור Firebase. כאן הכל כבר Firebase
    function begin(b) { base = b; tables = {}; }

    // מה צריך לכתוב: החלקים שהשתנו (וחלקים חדשים לשורות חדשות)
    function collect(newRev) {
      const out = [];
      Object.keys(tables).forEach(name => {
        const t = tables[name];
        if (!t.dirty) return;
        if (st.mode === 'field' && FIELD_WRITES.indexOf(name) < 0) throw new Error('Field cannot write ' + name);
        const cell = (o, k) => (name === 'People' && k === 'token' ? '' : format_(o[k], t.typeOf[k]));
        const ser = rows => JSON.stringify({ cols: t.keys, rows: rows.map(o => t.keys.map(k => cell(o, k))) });
        const groups = {};
        t.chunkIds.forEach(id => { groups[id] = []; });
        const fresh = [];
        t.rows.forEach(o => { const c = CH.get(o); if (c && groups[c]) groups[c].push(o); else fresh.push(o); });
        const write = (id, seq, rows) => {
          const data = ser(rows);
          if (base.chunks[id] && base.chunks[id].raw === data) return;
          out.push({ id, doc: { t: name, seq, rev: newRev, pub: ADMIN_ONLY_TABLES.indexOf(name) < 0, data } });
        };
        const lastId = t.chunkIds[t.chunkIds.length - 1] || '';
        t.touched.forEach(id => { if (id !== lastId) write(id, base.chunks[id].seq, groups[id]); });
        if (!fresh.length) {
          if (lastId && t.touched.has(lastId)) write(lastId, base.chunks[lastId].seq, groups[lastId]);
          return;
        }
        // שורות חדשות: לסוף החלק האחרון, וכשהוא מתמלא – לחלק חדש
        let seq = lastId ? base.chunks[lastId].seq : 1;
        let curId = lastId || name + '~' + pad(seq);
        let cur = lastId ? groups[lastId].slice() : [];
        let size = cur.length ? ser(cur).length : 0;
        fresh.forEach(o => {
          const len = ser([o]).length;
          if (cur.length && size + len > CHUNK_CHARS) {
            write(curId, seq, cur);
            seq += 1;
            curId = name + '~' + pad(seq);
            cur = [];
            size = 0;
          }
          cur.push(o);
          size += len;
        });
        write(curId, seq, cur);
      });
      return out;
    }

    function table(name) { return tables[name] || null; }

    return { all, byId, insert, insertMany, update, setting, setSetting, settings, clean, reset, useExternal, fields_, begin, collect, table };
  })();

  // ---------- התאמות בקוד המשותף ----------
  window.dataVersion_ = () => String(st.runVer || st.rev);
  window.bumpVersion_ = () => {};
  window.withLock_ = fn => fn();
  window.fieldPerson_ = token => {
    if (st.authError || !token || token !== st.token) authError_(MSG.badLink);
    const p = Db.byId('People', st.personId);
    if (!p || p.archived) authError_(MSG.badLink);
    return p;
  };
  const myAdminRow = () => {
    const email = st.user && !st.user.isAnonymous && String(st.user.email || '').toLowerCase();
    return email && Db.all('People').find(x => x.role === 'admin' && String(x.email).toLowerCase().trim() === email);
  };
  window.adminLogin_ = () => {
    const p = myAdminRow();
    if (!p) authError_(MSG.notAdmin);
    return { session: 'fb', person: { id: p.id, name: p.name, email: p.email } };
  };
  window.adminPerson_ = () => {
    if (!st.user || st.user.isAnonymous) authError_(MSG.sessionExpired);
    const p = myAdminRow();
    if (!p) authError_(MSG.notAdmin);
    return p;
  };
  const corePdf = window.orderPdf_;
  window.orderPdf_ = id => {
    lastHtml = '';
    const r = corePdf(id);
    return { fileName: r.fileName, html: lastHtml };
  };
  window.backupNow_ = () => userError_('הגיבוי לגרסה החדשה עוד לא מחובר.');

  // ---------- בקשות ----------
  const READ_ONLY = ['ping', 'admin.login', 'field.bootstrap'].concat(ADMIN_READ_ONLY);

  function baseFromLocal() {
    const tokenOf = {};
    Object.keys(st.tokens).forEach(t => {
      const x = st.tokens[t];
      if (x && (!tokenOf[x.personId] || x.active)) tokenOf[x.personId] = t;
    });
    return { chunks: st.chunks, tokenOf };
  }

  function offlineError() {
    const e = new TypeError('offline');
    e.offline = true;
    return e;
  }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(offlineError()), ms))]);
  }
  const copy = x => JSON.parse(JSON.stringify(x));

  async function handle(req) {
    try {
      await withTimeout(st.initP, 20000);
      if (req.action === 'ping') return { ok: true, data: { ver: String(st.rev) } };
      if (st.authError) return { ok: false, error: st.mode === 'field' ? MSG.badLink : MSG.notAdmin, code: 'AUTH' };
      if (!st.user) return { ok: false, error: MSG.sessionExpired, code: 'AUTH' };
      if (req.action === 'admin.backup.now') return await backupViaScript(req);
      if (READ_ONLY.indexOf(req.action) >= 0) {
        // היה ריק ממש עכשיו (למשל מיד אחרי ההקמה) – נותנים רגע לנתונים להגיע
        for (let i = 0; i < 20 && st.readyState === 'failed' && !st.authError; i++) await new Promise(r => setTimeout(r, 150));
        await withTimeout(st.ready, 20000);
        Db.begin(baseFromLocal());
        st.runVer = '';
        return copy(handle_(copy(req)));
      }
      return await write(req);
    } catch (e) {
      if (e && e.code === 'AUTH') return { ok: false, error: e.message, code: 'AUTH' };
      if (e && e.empty) return { ok: false, error: 'המערכת עוד לא הוקמה.', code: 'AUTH' };
      if (e && e.code === 'permission-denied') return { ok: false, error: st.mode === 'field' ? MSG.badLink : MSG.notAdmin, code: 'AUTH' };
      if (e && e.userMessage) return { ok: false, error: e.userMessage };
      console.error('engine', req.action, e);
      throw offlineError(); // רשת / שרת – הדף ינסה שוב
    } finally {
      st.runVer = '';
    }
  }

  async function write(req) {
    const F = st.fb;
    const metaRef = F.doc(st.db, 'c', '_meta');
    let done = null;
    const run = F.runTransaction(st.db, async tx => {
      done = null;
      const ms = await tx.get(metaRef);
      if (!ms.exists()) throw Object.assign(new Error('no data'), { userMessage: 'המערכת עוד לא הוקמה.' });
      const meta = ms.data();
      // מה שהשתנה מאז העדכון המקומי האחרון – נקרא בתוך הטרנזקציה
      const chunks = {};
      const need = [];
      Object.keys(meta.chunks || {}).filter(readable).forEach(id => {
        if (st.chunks[id] && st.chunks[id].rev === meta.chunks[id]) chunks[id] = st.chunks[id];
        else need.push(id);
      });
      const got = await Promise.all(need.map(id => tx.get(F.doc(st.db, 'c', id))));
      got.forEach((s, i) => { if (s.exists()) chunks[need[i]] = parseChunk(need[i], s.data()); });
      const b = baseFromLocal();
      b.chunks = chunks;
      Db.begin(b);
      const newRev = meta.rev + 1;
      st.runVer = TMP_VER;
      const result = handle_(copy(req));
      st.runVer = '';
      // פעולה שנכשלה לא נשמרת בכלל (גם לא חלק ממנה)
      if (!result.ok) { done = { result, rev: meta.rev }; return; }
      const writes = Db.collect(newRev);
      const side = st.mode === 'admin' ? peopleSideEffects() : { tokens: [], admins: [] };
      const any = writes.length || side.tokens.length || side.admins.length;
      if (any) {
        const map = Object.assign({}, meta.chunks);
        writes.forEach(w => { tx.set(F.doc(st.db, 'c', w.id), w.doc); map[w.id] = newRev; });
        side.tokens.forEach(x => (x.del ? tx.delete(F.doc(st.db, 'tokens', x.id)) : tx.set(F.doc(st.db, 'tokens', x.id), x.doc)));
        side.admins.forEach(x => (x.del ? tx.delete(F.doc(st.db, 'admins', x.id)) : tx.set(F.doc(st.db, 'admins', x.id), x.doc)));
        tx.set(metaRef, { rev: newRev, chunks: map, pub: true, at: F.serverTimestamp() });
        done = { result, chunks, writes, side, rev: newRev, map };
      } else {
        done = { result, rev: meta.rev };
      }
    });
    await withTimeout(run, 25000);
    // מעדכנים מיד את המצב המקומי (בלי לחכות שהמאזין יחזיר את מה שכתבנו)
    if (done.writes) {
      const chunks = Object.assign({}, done.chunks);
      done.writes.forEach(w => { chunks[w.id] = parseChunk(w.id, w.doc); st.raw[w.id] = w.doc; });
      st.raw._meta = { rev: done.rev, chunks: done.map, pub: true };
      done.side.tokens.forEach(x => { if (x.del) delete st.tokens[x.id]; else st.tokens[x.id] = x.doc; });
      done.side.admins.forEach(x => { if (x.del) delete st.admins[x.id]; else st.admins[x.id] = x.doc; });
      if (done.rev > st.rev) { st.chunks = chunks; st.rev = done.rev; }
    }
    // הגרסה האמיתית במקום הזמנית
    const ver = String(done.rev);
    const r = done.result;
    if (r && r.data) {
      if (r.data.ver === TMP_VER) r.data.ver = ver;
      if (r.data.boot && r.data.boot.ver === TMP_VER) r.data.boot.ver = ver;
    }
    return copy(r);
  }

  // "גבה עכשיו": הגיבוי נעשה בסקריפט של גוגל (שומר קבצים ב-Drive). הוא מזהה את המנהל לפי הכניסה ל-Firebase.
  async function backupViaScript(req) {
    const idToken = await st.user.getIdToken();
    const res = await fetch(window.APP_CONFIG.oldApiUrl, { method: 'POST', body: JSON.stringify({ action: 'fb.backup', idToken }) });
    let r;
    try { r = JSON.parse(await res.text()); } catch (e) { throw offlineError(); }
    if (!r.ok) return { ok: false, error: r.error || MSG.generic }; // לא מנתקים את המנהל בגלל תקלה בגיבוי
    if (!req.withBoot) return r;
    await withTimeout(st.ready, 20000);
    Db.begin(baseFromLocal());
    const boot = handle_({ action: 'admin.bootstrap', session: 'fb' });
    return copy({ ok: true, data: { result: r.data, boot: boot.data } });
  }

  // אנשים: הקישורים האישיים והרשאות המנהל נשמרים במסמכים נפרדים (לפיהם כללי האבטחה עובדים)
  function peopleSideEffects() {
    const out = { tokens: [], admins: [] };
    const t = Db.table('People');
    if (!t || !t.dirty) return out;
    const wantTokens = {};
    const wantAdmins = {};
    t.rows.forEach(p => {
      if (p.token) wantTokens[p.token] = { personId: p.id, active: !p.archived };
      const email = String(p.email || '').toLowerCase().trim();
      if (p.role === 'admin' && !p.archived && email) wantAdmins[email] = { personId: p.id };
    });
    const diff = (want, have, list) => {
      Object.keys(want).forEach(k => {
        if (!have[k] || JSON.stringify(have[k]) !== JSON.stringify(want[k])) list.push({ id: k, doc: want[k] });
      });
      Object.keys(have).forEach(k => { if (!want[k]) list.push({ id: k, del: true }); });
    };
    diff(wantTokens, st.tokens, out.tokens);
    diff(wantAdmins, st.admins, out.admins);
    return out;
  }

  // ---------- מאזינים: כל שינוי של מישהו אחר מגיע תוך שנייה ----------
  function onChunks(snap) {
    snap.docChanges().forEach(ch => {
      if (ch.type === 'removed') delete st.raw[ch.doc.id];
      else st.raw[ch.doc.id] = ch.doc.data();
    });
    const meta = st.raw._meta;
    if (!meta) {
      if (!snap.metadata.fromCache) st.readyFns.reject(Object.assign(new Error('empty'), { empty: true }));
      return;
    }
    const ids = Object.keys(meta.chunks || {}).filter(readable);
    const consistent = ids.every(id => st.raw[id] && st.raw[id].rev === meta.chunks[id]);
    if (!consistent || meta.rev < st.rev) return;
    if (meta.rev !== st.rev || !Object.keys(st.chunks).length) {
      const chunks = {};
      ids.forEach(id => {
        chunks[id] = st.chunks[id] && st.chunks[id].rev === meta.chunks[id] ? st.chunks[id] : parseChunk(id, st.raw[id]);
      });
      st.chunks = chunks;
      st.rev = meta.rev;
    }
    if (st.readyState === 'failed') newReady(); // למשל: היה ריק, ועכשיו הוקם
    st.readyFns.resolve();
    changed();
  }

  let changeTimer = null;
  function changed() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => window.dispatchEvent(new Event('inv:changed')), 50);
  }

  function listenError(e) {
    console.error('listen', e);
    if (e && e.code === 'permission-denied') {
      st.authError = 'denied';
      st.readyFns.reject(e);
      changed();
    }
  }

  function stopListening() {
    st.unsub.forEach(f => { try { f(); } catch (e) { /* */ } });
    st.unsub = [];
  }

  function listenAdmin() {
    const F = st.fb;
    stopListening();
    st.unsub.push(F.onSnapshot(F.collection(st.db, 'c'), onChunks, listenError));
    st.unsub.push(F.onSnapshot(F.collection(st.db, 'tokens'), s => {
      st.tokens = {};
      s.forEach(d => { st.tokens[d.id] = d.data(); });
      changed();
    }, listenError));
    st.unsub.push(F.onSnapshot(F.collection(st.db, 'admins'), s => {
      st.admins = {};
      s.forEach(d => { st.admins[d.id] = d.data(); });
    }, listenError));
  }

  function listenField() {
    const F = st.fb;
    stopListening();
    const q = F.query(F.collection(st.db, 'c'), F.where('pub', '==', true));
    st.unsub.push(F.onSnapshot(q, onChunks, listenError));
  }

  // ---------- הפעלה ----------
  async function loadFirebase() {
    // בבדיקות: Firebase מדומה בזיכרון (tests/fake-firebase.js)
    const [app, auth, fs] = window.FAKE_FIREBASE || await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
    ]);
    const a = app.initializeApp(window.APP_CONFIG.firebase);
    st.fb = Object.assign({}, auth, fs);
    st.auth = auth.getAuth(a);
    try {
      st.db = fs.initializeFirestore(a, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch (e) {
      st.db = fs.getFirestore(a);
    }
  }

  function resetData() {
    stopListening();
    st.raw = {};
    st.rev = -1;
    st.chunks = {};
    st.tokens = {};
    st.admins = {};
    st.authError = '';
    newReady();
  }

  async function init(mode) {
    st.mode = mode;
    st.initP = (async () => {
      await loadFirebase();
      const F = st.fb;
      st.user = await new Promise(res => {
        let stop = null;
        let got = false;
        stop = F.onAuthStateChanged(st.auth, x => { got = true; if (stop) stop(); res(x); });
        if (got) stop();
      });
      if (mode === 'field') {
        st.token = new URLSearchParams(location.search).get('t') || '';
        if (!st.user) st.user = (await F.signInAnonymously(st.auth)).user;
        await registerDevice();
        if (!st.authError) listenField();
        else st.readyFns.reject(new Error('bad link'));
      } else {
        if (st.user && st.user.isAnonymous) { await F.signOut(st.auth); st.user = null; }
        if (st.user) listenAdmin();
      }
    })();
    st.initP.catch(e => console.error('init', e));
    return st.initP;
  }

  async function registerDevice() {
    const F = st.fb;
    const devRef = F.doc(st.db, 'devices', st.user.uid);
    let dev = null;
    try { dev = (await F.getDoc(devRef)).data() || null; } catch (e) { dev = null; }
    if (dev && dev.token === st.token) { st.personId = dev.personId; return; }
    let t;
    try {
      t = await F.getDoc(F.doc(st.db, 'tokens', st.token || '-'));
    } catch (e) {
      if (e && e.code === 'unavailable') throw e;
      st.authError = 'badLink';
      return;
    }
    if (!t.exists() || !t.data().active) { st.authError = 'badLink'; return; }
    st.personId = t.data().personId;
    await F.setDoc(devRef, { token: st.token, personId: st.personId, at: F.serverTimestamp() });
  }

  // מנהל: כניסה עם חשבון גוגל
  async function signIn() {
    await st.initP;
    const F = st.fb;
    const provider = new F.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const r = await F.signInWithPopup(st.auth, provider);
    st.user = r.user;
    resetData();
    listenAdmin();
    return st.user;
  }

  async function signOut() {
    await st.initP;
    resetData();
    await st.fb.signOut(st.auth);
    st.user = null;
  }

  // האם המאגר כבר הוקם? ('ok' / 'empty' / 'unknown')
  async function dataState() {
    await st.initP;
    try {
      const s = await st.fb.getDocFromServer(st.fb.doc(st.db, 'c', '_meta'));
      return s.exists() ? 'ok' : 'empty';
    } catch (e) {
      return e && e.code === 'permission-denied' ? 'ok' : 'unknown';
    }
  }

  // הקמה ראשונה: נתונים מהמערכת הקיימת (תשובת admin.bootstrap שלה) או התחלה ריקה
  async function createAll(fill) {
    await st.initP;
    const F = st.fb;
    Db.begin({ chunks: {}, tokenOf: {} });
    fill();
    const writes = Db.collect(1);
    const side = peopleSideEffects();
    if (!side.admins.some(x => x.id === String(st.user.email).toLowerCase())) {
      throw new Error('החשבון ' + st.user.email + ' לא מופיע כמנהל בנתונים.');
    }
    const map = {};
    const ops = [];
    writes.forEach(w => { ops.push(['set', F.doc(st.db, 'c', w.id), w.doc]); map[w.id] = 1; });
    side.tokens.forEach(x => ops.push(['set', F.doc(st.db, 'tokens', x.id), x.doc]));
    side.admins.forEach(x => ops.push(['set', F.doc(st.db, 'admins', x.id), x.doc]));
    // _meta אחרון באותה קבוצה: כללי האבטחה מאפשרים הקמה רק כשעוד אין _meta
    ops.push(['set', F.doc(st.db, 'c', '_meta'), { rev: 1, chunks: map, pub: true, at: F.serverTimestamp() }]);
    if (ops.length > 490) throw new Error('יותר מדי נתונים להקמה בבת אחת');
    const batch = F.writeBatch(st.db);
    ops.forEach(o => batch.set(o[1], o[2]));
    await batch.commit();
  }

  function importOld(data) {
    return createAll(() => {
      const t = data.tables || {};
      Object.keys(t).forEach(name => { if (SCHEMA[name]) Db.insertMany(name, t[name].map(r => Object.assign({}, r))); });
      Db.insertMany('Settings', Object.keys(data.settings || {}).map(k => ({ key: k, value: String(data.settings[k]) })));
      Db.insertMany('Log', (data.log || []).map(r => Object.assign({}, r)));
    });
  }

  function startFresh(name) {
    return createAll(() => {
      Db.insertMany('Settings', Object.keys(DEFAULT_SETTINGS).map(k => ({ key: k, value: DEFAULT_SETTINGS[k] })));
      Db.insertMany('Units', DEFAULT_UNITS.map(n => ({ name: n })));
      Db.insertMany('Locations', [{ name: 'מרלו"ג', type: 'hub' }, { name: 'בתיקון', type: 'repair' }]);
      Db.insert('People', { name: name || 'מנהל', role: 'admin', email: st.user.email, token: newToken_(), alerts: true });
    });
  }

  window.ENGINE = {
    init, handle, signIn, signOut, dataState, importOld, startFresh,
    get user() { return st.user; },
    st,
  };
  window.LOCAL_API = handle;
})();
