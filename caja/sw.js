// Service worker: guarda la app para que abra sin internet.
// Estrategia: red primero, caché como respaldo (así ves tus cambios al editar código).
// Si agregas archivos nuevos al proyecto, súmalos a SHELL y sube el número de CACHE.
const CACHE = 'caja-v14';
const SHELL = [
  './', 'index.html', 'manifest.json',
  'css/styles.css', 'css/layout.css', 'css/catalog.css', 'css/sales.css', 'css/dashboard.css', 'css/reports.css', 'css/expenses.css', 'css/clients.css', 'css/responsive.css',
  'js/app.js', 'js/updates.js', 'version.json', 'js/router.js', 'js/database.js', 'js/state.js', 'js/utilities.js', 'js/components.js', 'js/barcode-scan.js',
  'js/dashboard.js', 'js/sales.js', 'js/clients.js', 'js/clients-store.js', 'js/catalog.js', 'js/catalog-store.js', 'js/categories.js', 'js/sales-store.js', 'js/dashboard-store.js', 'js/reports-store.js', 'js/charts.js', 'js/checkout.js', 'js/sales-history.js', 'js/reports.js', 'js/backup.js', 'js/demo-data.js', 'js/demo-banner.js', 'js/settings-common.js', 'js/settings-business.js', 'js/settings-appearance.js', 'js/settings-sales.js', 'js/settings-modules.js', 'js/settings-data.js', 'js/catalog-editor.js', 'js/dashboard-editor.js', 'js/dashboard-widgets.js', 'js/reports-editor.js', 'js/settings.js', 'js/tickets.js', 'js/expenses.js', 'js/expenses-store.js', 'js/expenses-calc.js', 'js/settings-expenses.js',
  'assets/icons/icon.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
