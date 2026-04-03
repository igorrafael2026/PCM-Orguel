// sw.js — PCM Orguel Service Worker
// Estratégia: Network First (sempre busca versão mais nova, sem modo offline)

const CACHE_NAME = 'pcm-orguel-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Sempre busca da rede primeiro
  event.respondWith(
    fetch(event.request).catch(() => {
      // Se falhar (sem internet), tenta cache como fallback
      return caches.match(event.request);
    })
  );
});
