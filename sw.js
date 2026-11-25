/* VoiceNote MD - Service Worker
 * Strategia:
 *  - App shell (HTML/manifest/icona) in cache, aggiornato con network-first
 *    per la navigazione (così gli aggiornamenti arrivano subito).
 *  - Asset statici same-origin: cache-first con popolamento al volo.
 *  - Le chiamate all'API DeepSeek NON vengono mai intercettate né messe in cache.
 */

const CACHE_VERSION = 'v3';
const CACHE_NAME = `voicenote-md-${CACHE_VERSION}`;

// Percorsi relativi: funzionano anche se l'app è servita da una sottocartella.
const APP_SHELL = ['./', './index.html', './manifest.json', './icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((error) => {
        // Un asset mancante non deve bloccare l'installazione del SW.
        console.warn('[SW] Precache parziale non riuscito:', error);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Il metodo GET è l'unico supportato dalla Cache API.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Solo risorse same-origin: l'API DeepSeek e CDN esterni passano diretti alla rete.
  if (url.origin !== self.location.origin) return;

  // Navigazione e manifest: rete prima, cache come fallback offline.
  // Il manifest deve riflettere subito le modifiche (icone/sizes) per restare
  // installabile, quindi non può essere servito cache-first.
  if (request.mode === 'navigate' || url.pathname.endsWith('/manifest.json')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match('./index.html')) || Response.error();
        })
    );
    return;
  }

  // Asset statici: cache-first con aggiornamento opportunistico.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => Response.error());
    })
  );
});
