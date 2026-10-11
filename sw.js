// שומר את קבצי הדף בטלפון, כדי שהוא ייפתח מיד – גם בלי קליטה.
// בכל עדכון של הדף מעלים את מספר הגרסה.
const VERSION = 'field-8';
const FILES = ['./', 'index.html', 'field.css', 'field.js', 'texts.js', 'config.js', 'manifest.webmanifest', 'icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// קבצי הדף: קודם מהרשת (כדי לקבל עדכונים), ואם אין קליטה – מהשמור. בקשות לשרת לא נשמרות.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // no-cache: תמיד בודקים מול GitHub אם יש גרסה חדשה (בלי זה הטלפון יכול להחזיק גרסה ישנה עד 10 דקות)
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
