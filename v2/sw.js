// גרסת Firebase: שומר את קבצי הדף בטלפון (כולל ספריית Firebase), כדי שייפתח מיד – גם בלי קליטה.
// בכל עדכון של הדף מעלים את מספר הגרסה.
const VERSION = 'field2-18';
const FB = 'https://www.gstatic.com/firebasejs/12.4.0/';
const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const FILES = ['./', 'index.html', 'config.js', 'core.js', 'engine.js', 'manifest.webmanifest',
  '../field.css', '../field.js', '../texts.js', '../icons/icon.svg',
  FB + 'firebase-app.js', FB + 'firebase-auth.js', FB + 'firebase-firestore.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // ספריית Firebase: קבועה לפי מספר גרסה – קודם מהשמור
  if (url.href.indexOf(FB) === 0 || url.href === JSPDF) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // מסך הניהול טוען קבצים עם ?v=… (תמיד הגרסה האחרונה) – לא שומרים אותם, כדי שהזיכרון לא יתמלא
  if (/[?&]v=/.test(url.search)) return;
  // קבצי הדף: קודם מהרשת (כדי לקבל עדכונים), ואם אין קליטה – מהשמור
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// לחיצה על התראה: פותחים את המסך (או עוברים אליו אם כבר פתוח)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './admin.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.indexOf('/inventory/') >= 0);
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
