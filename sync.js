'use strict';
/* Sincronização entre aparelhos (iPad, iPhone, PC) por um gist SECRETO do GitHub. O token fica só no aparelho (localStorage),
   nunca no código. O app grava os dados (rotina.json) e um resumo do dia para o widget (widget.json). Vale a gravação mais nova.
   Não sincroniza: desenhos à mão e o banco de questões (cada aparelho importa os pacotes). */
const SYNC_K = 'rotina.sync';
const lerSync = () => { try { return JSON.parse(localStorage.getItem(SYNC_K) || '{}'); } catch { return {}; } };
const gravarSync = c => { try { localStorage.setItem(SYNC_K, JSON.stringify(c)); } catch { } };
const GH = 'https://api.github.com/gists';
let syncTimer = 0, syncAplicando = false;

function widgetDados() {
  const d = S.dias[hoje()] || { blocos: [], agenda: [] }, agora = new Date().getHours() * 60 + new Date().getMinutes();
  const hm2 = s => { const m = /^(\d\d):(\d\d)$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const ag = (d.agenda || []).filter(x => hm2(x.fim) > agora);
  const falta = (d.blocos || []).filter(b => !b.passos.every(p => p.ok)).map(b => b.titulo);
  return { atualizado: new Date().toISOString(), dia: hoje(), agora: ag[0] ? `${ag[0].inicio} ${ag[0].titulo}` : '', proximo: ag[1] ? `${ag[1].inicio} ${ag[1].titulo}` : '',
    falta: falta.slice(0, 4), nFalta: falta.length, estudou: S.estudo[hoje()] || 0, meta: d.cap || 0,
    questoes: Object.values(S.qlog[hoje()] || {}).reduce((s, v) => s + (v.f || 0), 0) };
}

async function syncPush() {
  const c = lerSync(); if (!c.token) return;
  const t = S._t || Date.now();
  const files = { 'rotina.json': { content: JSON.stringify({ t, S }) }, 'widget.json': { content: JSON.stringify(widgetDados()) } };
  try {
    const r = await fetch(c.id ? `${GH}/${c.id}` : GH, { method: c.id ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json' },
      body: JSON.stringify(c.id ? { files } : { description: 'Rotina (dados do app)', public: false, files }) });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    const j = await r.json(); gravarSync({ ...c, id: j.id, ult: t, erro: '' });
  } catch (e) { gravarSync({ ...lerSync(), erro: e.message }); }
}

async function syncPull(mostrar) {
  const c = lerSync(); if (!c.token || !c.id) return;
  try {
    const r = await fetch(`${GH}/${c.id}`, { headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    const f = (await r.json()).files['rotina.json']; if (!f) return;
    const txt = f.truncated ? await (await fetch(f.raw_url)).text() : f.content, rem = JSON.parse(txt);
    if (rem.t > (S._t || 0) && rem.t !== c.ult) {           // o outro aparelho gravou depois: traz
      syncAplicando = true; S = carregarDe(rem.S); salvar(); syncAplicando = false;
      gravarSync({ ...lerSync(), ult: rem.t, erro: '' }); if (mostrar !== false) { ui.iaMsg = 'Dados trazidos do outro aparelho.'; render(); }
    }
  } catch (e) { gravarSync({ ...lerSync(), erro: e.message }); }
}
// mesma normalização do carregar() do app, a partir de um objeto
function carregarDe(obj) { try { localStorage.setItem(CHAVE, JSON.stringify(obj)); } catch { } return carregar(); }

{ const s0 = salvar; salvar = function () { if (!syncAplicando) S._t = Date.now(); s0.apply(this, arguments); if (!syncAplicando && lerSync().token) { clearTimeout(syncTimer); syncTimer = setTimeout(syncPush, 4000); } }; }
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncPull(); else if (lerSync().token) syncPush(); });
setTimeout(() => syncPull(), 1500);

Object.assign(ACOES, {
  syncSalvar: async () => {
    const token = ($('#sync-token')?.value || '').trim(), id = ($('#sync-id')?.value || '').trim();
    if (!token) { ui.iaMsg = 'Cole o token do GitHub.'; render(); return; }
    gravarSync({ ...lerSync(), token, id: id || lerSync().id || '' });
    if (id) await syncPull(); else await syncPush();
    const c = lerSync(); ui.iaMsg = c.erro ? `Não consegui sincronizar (${c.erro}). Confira o token.` : `Sincronização ligada. Código para os outros aparelhos e para o widget: ${c.id}`; render();
  },
  syncAgora: async () => { await syncPull(false); await syncPush(); const c = lerSync(); ui.iaMsg = c.erro ? `Erro: ${c.erro}` : 'Sincronizado.'; render(); },
  syncDesligar: () => { gravarSync({}); ui.iaMsg = 'Sincronização desligada neste aparelho.'; render(); },
});
{ const v0 = VIEWS.ajustes; VIEWS.ajustes = function () {
  const c = lerSync();
  return v0() + `<section class="cartao"><h2>Sincronizar aparelhos e widget</h2>
    <p class="fraco" style="margin:0">Usa um arquivo secreto no GitHub. No 1º aparelho: cole o token e deixe o código em branco (o app cria). Nos outros: cole o mesmo token e o código. Desenhos à mão e o banco de questões não sincronizam.</p>
    ${c.token ? `<p style="margin:0">Ligada · código: <b>${esc(c.id || '(criando…)')}</b>${c.erro ? ` · <span style="color:#C2483D">erro: ${esc(c.erro)}</span>` : ''}</p>
      <div class="linha"><button class="botao" data-acao="syncAgora">Sincronizar agora</button><button class="link" data-acao="syncDesligar">Desligar neste aparelho</button></div>`
    : `<label class="campo">Token do GitHub (só permissão de gist)<input type="password" id="sync-token" autocomplete="off"></label>
      <label class="campo">Código (deixe em branco no 1º aparelho)<input type="text" id="sync-id" autocomplete="off"></label>
      <div class="linha"><button class="botao" data-acao="syncSalvar">Ligar</button></div>`}</section>`;
}; }
