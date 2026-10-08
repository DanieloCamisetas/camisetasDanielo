/*
 * Service worker del inventario: permite instalar la web como app y abrirla
 * sin cobertura (con lo último que se cargó). Los datos (/api) nunca se
 * cachean aquí: los toques sin conexión los guarda la propia app y los sube
 * al volver la señal.
 */
const CACHE = "camisetas-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Fotos y archivos con versión en el nombre: primero caché.
  const immutable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/api/foto/") ||
    url.pathname.startsWith("/pwa-icon/");
  if (immutable) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) return; // datos: siempre a la red

  // Páginas: red primero; sin conexión, la última versión guardada.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/inventario"))),
    );
  }
});
