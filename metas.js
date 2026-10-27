'use strict';
/* Metas de questões, num lugar só: a meta do dia sai das matérias que estão no dia dela (não de todas as matérias),
   conta o que ela faz no app e o que faz fora (livro, outra plataforma) com um toque, e mostra a semana. */

ui.metaEditar = false;
const ACERTO = v => (v.f - (v.s || 0)) > 0 ? Math.round(v.a / (v.f - (v.s || 0)) * 100) : null;

/** Matérias do dia: as dos assuntos de hoje; sem plano, as da semana (até 3). Sempre inclui as que já tiveram questões hoje. */
function materiasDoDia() {
  const d = S.dias[hoje()], feitas = Object.keys(S.qlog[hoje()] || {}).filter(m => MIN_Q[m]);
  let mats = [...new Set((d?.blocos || []).map(b => b.materia).filter(m => MIN_Q[m]))];
  if (!mats.length) { const w = semAtual(); mats = [...new Set(S.assuntos.filter(a => a.semana === w && !a.feito && MIN_Q[a.materia]).map(a => a.materia))].slice(0, 3); }
  return [...new Set([...mats, ...feitas])];
}
const metaDoDia = () => soma(materiasDoDia(), m => metaQ(m));
const feitasHoje = m => (S.qlog[hoje()] || {})[m]?.f || 0;

function anelQ(feito, meta, tam = 108) {
  const r = tam / 2 - 9, C = 2 * Math.PI * r, p = meta ? Math.min(1, feito / meta) : 0;
  return `<div class="anel-q" style="width:${tam}px;height:${tam}px"><svg viewBox="0 0 ${tam} ${tam}" aria-hidden="true"><circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="var(--linha)" stroke-width="9"/>
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="var(--rosa)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/></svg>
    <span><b>${feito}</b><small>de ${meta}</small></span></div>`;
}

function linhasMeta(mats, botoes) {
  return mats.map(m => { const f = feitasHoje(m), meta = metaQ(m), ac = ACERTO((S.qlog[hoje()] || {})[m] || { f: 0, a: 0 });
    return `<div class="meta-linha" style="${cor(m)}"><span><i class="ponto"></i>${esc(m)}${ac != null ? ` <small class="fraco">· ${ac}% de acerto</small>` : ''}</span>
      <span class="fraco">${f}/${meta}${f >= meta ? ' ✓' : ''}</span><div class="barra"><i style="width:${Math.min(100, Math.round(f / Math.max(1, meta) * 100))}%;background:var(--c)"></i></div>
      ${botoes ? `<div class="linha mais-q">${[5, 10, 20].map(n => `<button class="chip" data-acao="qMais" data-m="${esc(m)}" data-v="${n}">+${n}</button>`).join('')}</div>` : ''}</div>`; }).join('');
}

function semanaQ() {
  const w = semAtual(), dias = Array.from({ length: 7 }, (_, i) => somaDias(w, i));
  const tot = d => soma(Object.values(S.qlog[d] || {}), v => v.f), max = Math.max(metaDoDia() || 1, ...dias.map(tot));
  const sem = dias.flatMap(d => Object.values(S.qlog[d] || {})), f = soma(sem, v => v.f), ac = ACERTO({ f, a: soma(sem, v => v.a), s: soma(sem, v => v.s || 0) });
  return `<div class="coluna" style="gap:8px"><span class="rotulo">esta semana · ${f} questões${ac != null ? ` · ${ac}% de acerto` : ''}</span>
    <div class="dias-estudo">${dias.map(d => { const n = tot(d); return `<div class="de ${d === hoje() ? 'hoje' : ''}"><div class="coluna-barra"><i style="height:${Math.round(n / max * 100)}%;background:var(--rosa)"></i></div><span>${SEMANA[deIso(d).getDay()].slice(0, 3)}</span><small>${n || '·'}</small></div>`; }).join('')}</div></div>`;
}

function painelQuestoes() {
  const mats = materiasDoDia(), meta = metaDoDia(), feito = soma(mats, feitasHoje);
  const editar = ui.metaEditar ? `<div class="coluna" style="gap:8px"><span class="rotulo">meta por dia de cada matéria (vale nos dias em que a matéria está no seu plano)</span>
    <div class="tab-metas" style="grid-template-columns:1fr 120px">${Object.keys(MIN_Q).map(m => `<span>${esc(m)}</span><input type="number" min="0" max="500" data-metaq="${esc(m)}" value="${metaQ(m)}">`).join('')}</div>
    <div class="linha"><button class="botao claro" data-acao="metaEditar">Pronto</button></div></div>` : '';
  return `<section class="cartao painel-q"><div class="pq-topo">${anelQ(feito, meta)}
      <div class="coluna" style="gap:6px"><h2>Questões de hoje</h2>
        <p class="fraco" style="margin:0">${mats.length ? `A meta vem das matérias do seu dia: ${mats.map(esc).join(', ')}.` : 'Monte o seu dia para eu calcular a meta.'} Vale tudo: o que fizer aqui e o que fizer fora (livro, apostila, outra plataforma).</p>
        <div class="linha"><button class="botao" data-acao="qForaRapido">+ Fiz questões fora do app</button><button class="link" data-acao="metaEditar">${ui.metaEditar ? 'Fechar metas' : 'Ajustar metas'}</button></div></div></div>
    ${mats.length ? linhasMeta(mats, true) : ''}${editar}${semanaQ()}</section>`;
}

// no Hoje: só o resumo (anel + matérias do dia), sem os botões
function metaQHtml() {
  const mats = materiasDoDia(); if (!mats.length) return '';
  const meta = metaDoDia(), feito = soma(mats, feitasHoje);
  return `<section class="cartao"><div class="pq-topo">${anelQ(feito, meta, 84)}<div class="coluna" style="gap:4px"><h2 style="font-size:19px">Questões de hoje</h2><button class="link" data-acao="ir" data-v="questoes" style="padding:0;align-self:flex-start">Fazer ou registrar questões</button></div></div>${linhasMeta(mats, false)}</section>`;
}
function metaQTabela() { return ''; }
// Ajustes: só o tempo por questão (as metas ficam em Questões)
function ajustesQuestoesHtml() {
  return `<section class="cartao"><h2>Tempo por questão</h2>
    <p class="fraco" style="margin:0">Quanto tempo você leva por questão em cada matéria. Entra no cálculo do tempo dos assuntos. Em branco, uso o valor automático, que aprende com as suas listas. As metas de questões ficam na aba Questões.</p>
    <div class="tab-metas" style="grid-template-columns:1fr 130px"><span class="rotulo">matéria</span><span class="rotulo">min por questão</span>
    ${Object.keys(MIN_Q).map(m => `<span>${esc(m)}</span><input type="number" step="0.5" min="0.5" max="15" data-minq="${esc(m)}" value="${S.minQ[m] || ''}" placeholder="${(Math.round(minPorQ(m) * 10) / 10)}">`).join('')}</div></section>`;
}

function registrarFora(m, f, ac, min) {
  const d = ((S.qlog[hoje()] ||= {})[m] ||= { f: 0, a: 0, s: 0 });
  d.f += f; if (ac == null) d.s = (d.s || 0) + f; else d.a += ac;
  if (min > 0) aprenderTempo(m, min * 60, f);
}

{ const qm0 = qMontar; qMontar = function () { return painelQuestoes() + qm0(); }; }
Object.assign(ACOES, {
  metaEditar: () => { ui.metaEditar = !ui.metaEditar; render(); },
  qMais: el => { registrarFora(el.dataset.m, +el.dataset.v, null, 0); salvar(); ui.iaMsg = `+${el.dataset.v} em ${el.dataset.m}. Se quiser, anote os acertos em "Fiz questões fora do app".`; render(); },
  qForaRapido: () => {
    const mats = materiasDoDia(), todas = Object.keys(MIN_Q);
    abrirModal(`<div class="entre"><h2>Questões feitas fora do app</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
      <p class="fraco" style="margin:0">Livro, apostila, Ferretto, simulado… Só o número já conta para a meta. Os acertos e o tempo são opcionais, mas ajudam o app a calcular melhor.</p>
      <label class="campo">Matéria<select id="f-mat">${[...mats, ...todas.filter(m => !mats.includes(m))].map(m => `<option>${m}</option>`).join('')}</select></label>
      <div class="linha"><label class="campo" style="flex:1 1 110px">Feitas<input type="number" id="f-feitas" min="1" max="500" inputmode="numeric"></label>
        <label class="campo" style="flex:1 1 110px">Acertos (opcional)<input type="number" id="f-acertos" min="0" max="500" inputmode="numeric"></label>
        <label class="campo" style="flex:1 1 130px">Tempo, min (opcional)<input type="number" id="f-min" min="1" max="600" inputmode="numeric"></label></div>
      <div class="linha"><button class="botao" data-acao="qForaSalvar">Registrar</button></div>`);
  },
  qForaSalvar: () => {
    const m = $('#f-mat').value, f = Math.round(+$('#f-feitas').value), acTxt = $('#f-acertos').value, ac = acTxt === '' ? null : Math.round(+acTxt), min = +$('#f-min').value || 0;
    if (!(f > 0) || (ac != null && (ac < 0 || ac > f))) { ui.iaMsg = 'Confira os números: os acertos não podem passar das questões feitas.'; fecharModal(); render(); return; }
    registrarFora(m, f, ac, min); salvar(); fecharModal();
    ui.iaMsg = `Anotado: ${f} questões de ${m}${ac != null ? `, ${ac} certas (${Math.round(ac / f * 100)}%)` : ''}.`; render();
  },
});
render();
