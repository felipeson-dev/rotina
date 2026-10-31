// Navegação: o botão Voltar do navegador/iPad funciona (volta da questão para a lista, fecha janelas, volta de aba),
// e o F5 ou fechar e abrir o app devolve a pessoa ao mesmo lugar (aba, filtros, lista e a questão em andamento).
const NAV = { chave: 'rotina.nav', voltando: false, suspenso: false, y: 0, salvando: 0, tinhaQs: false };
const NAV_FORA = ['qs', 'carregando', 'iaMsg', 'desfazer', 'apagar', 'chatAberto', 'coresPrev', 'qPrevImg', 'calibrando', 'calibroErro', 'ultimaIa', 'duvidaTxt', 'planejar', 'qRasc'];
const navModal = () => !$('#modal').hidden;
const navChave = () => JSON.stringify({ v: ui.view, a: ui.view === 'questoes' ? ui.qAba || '' : '', q: !!ui.qs, m: navModal() });
const navUrl = () => '#' + ui.view;
try { history.scrollRestoration = 'manual'; } catch { }

// ---------- guardar o lugar ----------
function navSalvar() {
  try {
    const u = {}; for (const [k, v] of Object.entries(ui)) if (!NAV_FORA.includes(k) && typeof v !== 'function') u[k] = v;
    localStorage.setItem(NAV.chave, JSON.stringify({ u, y: Math.round(NAV.y) }));
  } catch { }
  if (ui.qs) { NAV.tinhaQs = true; DB.set('d:qs', ui.qs); } else if (NAV.tinhaQs) { NAV.tinhaQs = false; DB.del('d:qs'); }
}
function navAgendar() { clearTimeout(NAV.salvando); NAV.salvando = setTimeout(navSalvar, ui.qs ? 120 : 400); }
addEventListener('scroll', () => { NAV.y = window.scrollY; clearTimeout(NAV.salvando); NAV.salvando = setTimeout(navSalvar, 600); }, { passive: true });
addEventListener('pagehide', navSalvar);
document.addEventListener('visibilitychange', () => { if (document.hidden) navSalvar(); });

// ---------- histórico ----------
function navSync() {
  if (NAV.suspenso) return;
  const k = navChave(), cur = history.state;
  if (!cur || !cur.k) { history.replaceState({ k }, '', navUrl()); return; }
  if (cur.k === k) { if (location.hash !== navUrl()) history.replaceState(cur, '', navUrl()); return; }
  const c = JSON.parse(cur.k), n = JSON.parse(k);
  // só mudou "saiu da lista de questões" ou "fechou a janela": volta uma entrada em vez de empilhar outra
  const igual = c.v === n.v && c.a === n.a;
  if (igual && ((c.q && !n.q && c.m === n.m) || (c.m && !n.m && c.q === n.q))) { if (!NAV.voltando) { NAV.voltando = true; history.back(); } return; }
  // fechou a janela E mudou de tela na mesma ação (ex.: "Fazer hoje" na janela do assunto): a entrada da janela vira a da tela nova,
  // em vez de voltar (o history.back() chega depois, assíncrono, e desfaria a troca de tela)
  if (c.m && !n.m) { history.replaceState({ k }, '', navUrl()); NAV.y = 0; return; }
  history.replaceState({ ...cur, y: NAV.y }, '', location.href);
  // começou uma lista vindo de outra tela (ex.: "Treinar" no Desempenho): deixa a tela de questões como entrada intermediária, para o Voltar cair nela
  if (n.q && !c.q && !c.m && !n.m && !igual) history.pushState({ k: JSON.stringify({ ...n, q: false }) }, '', navUrl());
  history.pushState({ k }, '', navUrl());
  NAV.y = 0;
}

function navSairSessao() {
  const s = ui.qs; if (!s) return;
  if (!s.fim) {
    const feitas = s.itens.filter(q => q.resp != null), f = feitas.length, tot = s.itens.length;
    if (f >= tot && tot > 0) {
      finalizarSessao();
    } else if (!s.simulado) {
      for (const q of feitas) if (typeof contabilizarQuestaoRespondida === 'function' && !q.contabilizada) contabilizarQuestaoRespondida(s, q);
      S.listasAbertas ||= {};
      S.listasAbertas[s.chaveLista || 'avulsa'] = s;
      salvar();
      if (f > 0) ui.iaMsg = `Suas ${f} respostas já contaram e a lista continua aberta (${f}/${tot}). É só tocar em Continuar quando voltar.`;
    }
  }
  ui.qs = null; ui.qRasc = false; DB.del('d:qs');
}

addEventListener('popstate', e => {
  NAV.voltando = false;
  const st = e.state; if (!st || !st.k) return;
  const k = JSON.parse(st.k);
  NAV.suspenso = true;
  try {
    if (!k.m && navModal()) { ui.chatAberto = false; fecharModal(); }
    if (!k.q && ui.qs) navSairSessao();
    if (VIEWS[k.v]) ui.view = k.v;
    if (k.v === 'questoes' && k.a) ui.qAba = k.a;
    ui.apagar = false;
    if (navChave() !== st.k) history.replaceState({ ...st, k: navChave() }, '', navUrl());   // a entrada pedia algo que não existe mais (ex.: janela ou lista já encerradas)
  } finally { NAV.suspenso = false; }
  render();
  navRolar(st.y || 0);
});

function navRolar(y) { for (const t of [0, 120, 500]) setTimeout(() => window.scrollTo(0, y), t); }

// janelas entram no histórico: Voltar fecha a janela
{ const a0 = abrirModal; abrirModal = function () { a0.apply(this, arguments); navSync(); }; }
{ const d0 = desenharChat; desenharChat = function () { d0.apply(this, arguments); navSync(); }; }
// depois da ação inteira (microtarefa): numa ação que fecha a janela e troca de tela, o histórico vê só o resultado final
{ const f0 = fecharModal; fecharModal = function () { f0.apply(this, arguments); queueMicrotask(navSync); }; }
{ const r0 = render; render = function () {
  r0.apply(this, arguments); document.body.classList.toggle('em-questao', ui.view === 'questoes' && !!ui.qs && !ui.qs.fim); navSync(); navAgendar();
  // em tela estreita o menu rola de lado: a aba atual fica à vista
  const b = innerWidth <= 760 && document.querySelector('#menu [aria-current="page"]');
  if (b) b.parentElement.scrollLeft = b.offsetLeft - (b.parentElement.clientWidth - b.offsetWidth) / 2;
}; }

// ---------- reabrir no mesmo lugar ----------
(async () => {
  let salvo = null; try { salvo = JSON.parse(localStorage.getItem(NAV.chave)); } catch { }
  const hash = location.hash.slice(1);
  if (salvo?.u) Object.assign(ui, salvo.u);
  if (VIEWS[hash]) ui.view = hash;
  if (!VIEWS[ui.view]) ui.view = 'hoje';
  try {
    const qs = await DB.get('d:qs');
    if (qs?.itens?.length && qs.i < qs.itens.length) { qs.tq = Date.now(); ui.qs = qs; NAV.tinhaQs = true; }
  } catch { }
  // entrada base (a tela) e, se havia questão em andamento, mais uma entrada por cima: assim o Voltar funciona depois do F5
  const qs = ui.qs, antes = history.state?.k ? JSON.parse(history.state.k) : null;
  if (qs && antes?.q) history.replaceState({ k: navChave() }, '', navUrl());          // já era uma entrada de lista em andamento (F5): não empilha de novo
  else { ui.qs = null; history.replaceState({ k: navChave() }, '', navUrl()); ui.qs = qs; if (qs) history.pushState({ k: navChave() }, '', navUrl()); }
  render();
  if (salvo?.y && salvo.u?.view === ui.view) navRolar(salvo.y);
})();
