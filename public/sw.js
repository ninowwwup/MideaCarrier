/**
 * Service Worker do MIGOU - PWA & Push Manager
 * 
 * Responsabilidades:
 * 1. Push Manager: Escuta eventos de Push da API Web Push quando o app estiver em segundo plano ou fechado.
 * 2. Alerta Visual: Dispara notificação nativa com ações ('Tratar no SAP').
 * 3. Requisito estrito de 5 segundos: O pop-up fecha automaticamente após 5 segundos.
 * 4. Som e Comunicação com Janelas: Envia postMessage para abas abertas tocarem o som de gota d'água.
 * 5. Clique na Notificação: Foca a janela existente do MIGOU ou abre uma nova.
 * 6. Cache Offline: Preserva arquivos estáticos e recursos essenciais.
 */

const CACHE_NAME = 'migou-pwa-v7';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/audio/water_drop.wav',
  '/audio/frog.wav',
  '/audio/bubbles.wav',
  '/audio/cat.wav',
  '/audio/rebound.wav',
  '/audio/bird.wav',
  '/audio/tinder.wav',
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza imediata de todos os caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      }),
      self.clients.claim(),
    ])
  );
});

// Interceptação de requisições: Network-First para sempre entregar a versão mais recente da Vercel
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});

/**
 * PUSH MANAGER: Escuta eventos de Web Push do Servidor
 * Dispara mesmo se o navegador estiver em segundo plano ou com a aba fechada!
 */
self.addEventListener('push', (event) => {
  let data = {};

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    try {
      data = { title: 'MIGOU - Nova Solicitação', body: event.data.text() };
    } catch (err) {
      data = {
        title: 'MIGOU: Nova Solicitação SAP',
        body: 'Nova movimentação solicitada pelo Time Buiatte.',
      };
    }
  }

  const title = data.title || 'MIGOU: Nova Solicitação SAP';
  const tag = data.tag || 'migou-push-' + Date.now();

  const notificationOptions = {
    body: data.body || 'Nova transferência entre depósitos aguardando atendimento.',
    icon: data.icon || '/icon.svg',
    badge: '/icon.svg',
    tag: tag,
    data: data.data || { url: '/', items: data.items || [] },
    vibrate: [200, 100, 200, 100, 250],
    renotify: true,
    requireInteraction: false,
    silent: false, // Som do sistema caso o navegador esteja fechado
    actions: [
      { action: 'open_sap', title: 'Tratar no SAP' },
    ],
  };

  event.waitUntil(
    Promise.all([
      // 1. Exibir a notificação nativa na tela do usuário
      self.registration.showNotification(title, notificationOptions).then(() => {
        // Requisito estrito: Desaparecer em 5 segundos
        setTimeout(async () => {
          try {
            const activeNotifs = await self.registration.getNotifications({ tag });
            activeNotifs.forEach((n) => n.close());
          } catch (err) {}
        }, 5000);
      }),

      // 2. Transmitir o evento para todas as abas e janelas abertas do MIGOU
      // para tocarem imediatamente o som suave de gota d'água e mostrarem o toast Outlook
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clientList) => {
        clientList.forEach((client) => {
          client.postMessage({
            type: 'PUSH_NOTIFICATION_RECEIVED',
            payload: data,
            shouldPlaySound: true,
          });
        });
      }),
    ])
  );
});

/**
 * Ação ao clicar na notificação do Push Manager
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já houver uma janela do MIGOU aberta, foca nela
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: event.notification.data,
            action: event.action,
          });
          return client.focus();
        }
      }
      // Se nenhuma estiver aberta, abre uma nova janela
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Mensagens internas do aplicativo para o Service Worker
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
