// Guarda o app para abrir sem internet. Ao mudar arquivos, subir a VERSAO.
const VERSAO = 'rotina-27';
const ARQUIVOS = ['./', 'index.html', 'app.css', 'base.js', 'app.js', 'extras.js', 'pencil.js', 'dia.js', 'redacao.js', 'questoes.js', 'banco.js', 'mais.js', 'metas.js', 'planejar.js', 'desempenho.js', 'revisoes.js', 'simulados.js', 'discursivas.js', 'cronograma.js', 'crono.js', 'sync.js', 'nav.js', 'manifest.webmanifest', 'icone-180.png', 'icone-192.png', 'icone-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// só guarda resposta boa: um 404/503 no meio de uma atualização do site não pode virar a cópia sem internet
const guardar = (req, r) => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(VERSAO).then(x => x.put(req, c)); } return r; };

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'generativelanguage.googleapis.com') return;
  if (url.origin === location.origin) {
    // rede primeiro (pega atualizações), cache se estiver sem internet ou se a rede devolver erro
    e.respondWith(fetch(e.request)
      .then(r => r.ok ? guardar(e.request, r) : caches.match(e.request, { ignoreSearch: true }).then(m => m || r))
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com') || url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'www.curso-objetivo.br') {
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => guardar(e.request, r))));
  }
});
