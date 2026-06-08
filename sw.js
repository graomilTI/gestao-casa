// Service Worker do PWA "Gestão de Casa"
// Estratégia: stale-while-revalidate para o "app shell" (HTML/CSS/JS/ícones),
// deixando passar direto requisições de outras origens (Supabase, CDN do supabase-js)
// para nunca servir dados financeiros/agenda/tarefas desatualizados do cache.

const CACHE_NAME = 'gestao-casa-v3';
const SHARE_CACHE = 'gestao-casa-shared-file';
const SHARED_FILE_KEY = '/shared-comprovante';

const APP_SHELL = [
  './',
  './index.html',
  './setup.html',
  './dashboard.html',
  './financeiro.html',
  './agenda.html',
  './tarefas.html',
  './rotina.html',
  './comprovante.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/config.js',
  './assets/js/supabase-client.js',
  './assets/js/app.js',
  './assets/js/auth.js',
  './assets/js/setup.js',
  './assets/js/dashboard.js',
  './assets/js/financeiro.js',
  './assets/js/agenda.js',
  './assets/js/tarefas.js',
  './assets/js/rotina.js',
  './assets/js/comprovante.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== SHARE_CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

// Web Share Target — recebe o PDF compartilhado pelo app do banco e guarda
// num cache à parte para a página comprovante.html ler ao abrir (?shared=1)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname.endsWith('comprovante.html')) {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return; // Supabase / CDNs: sempre via rede

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (file && file.size > 0) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(
        SHARED_FILE_KEY,
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/pdf',
            'X-File-Name': encodeURIComponent(file.name || 'comprovante.pdf'),
          },
        })
      );
    }
  } catch (err) {
    console.warn('[SW] Falha ao capturar comprovante compartilhado:', err);
  }
  return Response.redirect('./comprovante.html?shared=1', 303);
}
