// sw.js — PCM Orguel Service Worker v3
// Estratégia: Network First + Cache de fallback + Web Push com app fechado

const CACHE_NAME = 'pcm-orguel-v3';
const CACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// ── Instalar — faz cache dos assets principais ─────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_ASSETS))
  );
});

// ── Ativar — limpa caches antigos ─────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch — Network First com fallback para cache ─────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Supabase e API — sempre online, nunca cachear
  if (event.request.url.includes('supabase.co')) return;
  if (event.request.url.includes('api.anthropic.com')) return;
  if (event.request.url.includes('functions/v1/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then(cached => cached || caches.match('./index.html'));
      })
  );
});

// ── PUSH EVENT — recebe push do servidor mesmo com app FECHADO ──
// Este é o handler crítico que estava faltando.
// Quando o servidor (Edge Function) enviar um push via web-push,
// o browser acorda o SW e dispara este evento, mesmo com o app fechado.
self.addEventListener('push', event => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'PCM Orguel', body: event.data.text() };
    }
  }

  const title   = data.title  || 'PCM Orguel';
  const options = {
    body:    data.body   || '',
    icon:    data.icon   || 'https://orguel.com.br/wp-content/uploads/2021/05/cropped-orguel-favicon-192x192.png',
    badge:   data.badge  || 'https://orguel.com.br/wp-content/uploads/2021/05/cropped-orguel-favicon-192x192.png',
    tag:     data.tag    || 'pcm-notif-' + Date.now(),
    vibrate: [200, 100, 200],
    // renotify: true — toca mesmo se já existe notif com a mesma tag
    renotify: true,
    // requireInteraction: mantém a notif visível até o usuário interagir (desktop)
    requireInteraction: false,
    data:    data.data   || {},
    // actions aparecem em Android e alguns desktop
    actions: [
      { action: 'abrir', title: '📋 Abrir OS' },
      { action: 'fechar', title: '✕ Fechar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── NOTIFICATIONCLICK — ao clicar na notificação ──────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'fechar') return;

  // Abre ou foca a janela do app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Se já tem uma aba do app aberta, foca ela
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Senão, abre nova aba
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});

// ── PUSHSUBSCRIPTIONCHANGE — quando o browser renova a subscription ──
// Importante: browsers às vezes expiram subscriptions. Este evento
// permite renovar e salvar a nova subscription no servidor.
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
      .then(newSub => {
        // Avisar todos os clients para salvar a nova subscription no Supabase
        return clients.matchAll().then(clientList => {
          clientList.forEach(client => {
            client.postMessage({
              type: 'PUSH_SUBSCRIPTION_RENEWED',
              subscription: newSub.toJSON()
            });
          });
        });
      })
      .catch(err => console.warn('[SW] pushsubscriptionchange falhou:', err))
  );
});
