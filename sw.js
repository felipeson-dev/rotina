// Guarda o app para abrir sem internet. Ao mudar arquivos, subir a VERSAO.
const VERSAO = 'rotina-13';
const ARQUIVOS = ['./', 'index.html', 'app.css', 'base.js', 'app.js', 'extras.js', 'pencil.js', 'dia.js', 'redacao.js', 'questoes.js', 'banco.js', 'mais.js', 'metas.js', 'manifest.webmanifest', 'icone-180.png', 'icone-192.png', 'icone-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'generativelanguage.googleapis.com') return;
  if (url.origin === location.origin) {
    // rede primeiro (pega atualizações), cache se estiver sem internet
    e.respondWith(fetch(e.request)
      .then(r => { const c = r.clone(); caches.open(VERSAO).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com') || url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'www.curso-objetivo.br') {
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request)
      .then(r => { const c = r.clone(); caches.open(VERSAO).then(x => x.put(e.request, c)); return r; })));
  }
});
