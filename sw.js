// sw.js — PCM Orguel Service Worker v2
// Estratégia: Network First + Cache de fallback para uso offline

const CACHE_NAME = 'pcm-orguel-v2';
const CACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// Instalar — faz cache dos assets principais
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_ASSETS))
  );
});

// Ativar — limpa caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — Network First com fallback para cache
self.addEventListener('fetch', event => {
  // Só intercepta GET
  if (event.request.method !== 'GET') return;

  // Supabase — sempre online, nunca cachear
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Atualiza cache com resposta nova
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Sem internet — serve do cache
        return caches.match(event.request)
          .then(cached => cached || caches.match('./index.html'));
      })
  );
});
