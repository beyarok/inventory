// הגרסה הקיימת הועברה לתיקייה v2. הקובץ הזה נשאר רק כדי שטלפונים עם האייקון הישן יקבלו את ההפניה לגרסה החדשה.
const VERSION = 'field-12-moved';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.indexOf('field-') === 0).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// לא שומרים כלום – הכל מהרשת (v2 מנהלת לעצמה את השמירה לטלפון)
