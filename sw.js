/* Service worker de BreathSafe: red primero para páginas, caché primero para recursos estáticos */
const CACHE = "breathsafe-v1";
const SHELL = ["./", "index.html", "nosotros.html", "contacto.html", "privacidad.html", "acceso.html", "vincular.html", "panel.html", "medico.html",
  "css/styles.css", "js/config.js", "js/common.js", "js/sim.js", "js/api.js", "js/dashboard.js", "js/panel.js", "js/acceso.js", "js/vincular.js", "js/medico.js", "js/contacto.js",
  "img/logo.svg", "img/icon.svg", "img/icon-192.png", "manifest.webmanifest"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isCdn = /cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (!sameOrigin && !isCdn) return;
  if (req.mode === "navigate" || (sameOrigin && /\.(html|js|css)$/.test(url.pathname))) {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; })
      .catch(() => caches.match(req).then((r) => r || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; })));
});
