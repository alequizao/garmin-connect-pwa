const VERSAO = 'garmin-v57'; // 3.5.0 — app Próximo Ônibus (aba Apps + Simulador)
const TILES = 'garmin-tiles';
const SHELL = ['/garmin/', '/garmin/index.php', '/garmin/manifest.json', '/garmin/icons/icon-192.png', '/garmin/icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.includes('/garmin/app/loja-')) return; // pagina/arquivos da loja: direto da rede, sem cache (o .iq tem 5 MB)
  if (url.pathname.includes('/garmin/api') || url.pathname.includes('/garmin/gpx/')) return; // rede sempre
  if (url.pathname.includes('/agendamentos/relogio_onibus.php')) return; // horários de ônibus: sempre da rede (nunca um cache velho)
  if (url.hostname.includes('tile.openstreetmap') || url.hostname.includes('basemaps')) {
    e.respondWith(caches.open(TILES).then(async c => { const r = await c.match(e.request); if (r) return r; try { const n = await fetch(e.request); if (n.ok) c.put(e.request, n.clone()); return n; } catch (x) { return r || Response.error(); } }));
    return;
  }
  // cache-first: assets versionados (?v=), icones e imagens de lanche (nome com hash) e Leaflet fixo 1.9.4
  if (url.search.includes("v=") || /\/garmin\/(icons|app\/mimei)\/.*\.png$/.test(url.pathname) || url.pathname.includes("/leaflet/1.9.4/")) {
    e.respondWith(caches.open(VERSAO).then(async c => { const r = await c.match(e.request); if (r) return r; const n = await fetch(e.request);
      if (n.ok) { // guarda a versao nova e descarta as antigas do mesmo arquivo (?v= diferente)
        c.put(e.request, n.clone());
        if (url.search.includes("v=")) c.keys().then(ks => ks.forEach(k => { const u = new URL(k.url); if (u.pathname === url.pathname && u.search !== url.search) c.delete(k); }));
      }
      return n; }));
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(VERSAO);
    try { const n = await fetch(e.request); if (n.ok && (url.origin === location.origin || url.hostname === 'cdnjs.cloudflare.com')) c.put(e.request, n.clone()); return n; }
    catch (x) { const r = await c.match(e.request, { ignoreSearch: true }); if (r) return r; if (e.request.mode === 'navigate') return c.match('/garmin/'); throw x; }
  })());
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titulo: 'Garmin Connect', corpo: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Garmin Connect', { body: d.corpo || '', tag: d.tag, renotify: true, requireInteraction: !!d.critico,
    vibrate: d.critico ? [800, 200, 800, 200, 800, 200, 800, 200, 800, 200, 800] : [200, 100, 200], icon: '/garmin/icons/icon-192.png', badge: '/garmin/icons/icon-192.png', data: { url: d.url || '' } }));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.openWindow('/garmin/' + (e.notification.data?.url || ''))); });
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
