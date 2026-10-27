'use strict';
/* Questões: ela faz a lista dentro do app. Fontes: ENEM de verdade (API aberta enem.dev, com gabarito) ou questões no estilo de cada banca
   geradas pela IA (podem ter erros: conferir o gabarito). Também dá para registrar o que foi feito por fora.
   O app guarda acertos, tempo por questão (e aprende o tempo real de cada matéria) e junta os erros no Caderno de erros. */

ICONES.questoes = '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.1 1-1.1 1.8M12 17h.01"/>';
S.erros ||= []; S.tq ||= {};
ui.qAba = 'listas'; ui.qFonte = 'enem'; ui.qBanca = 'Fuvest'; ui.qMat = 'Biologia'; ui.qArea = 'ciencias-natureza'; ui.qN = 10; ui.qTema = ''; ui.qDif = 'média';

const BANCAS = ['Fuvest', 'Vunesp', 'Santa Casa (Vunesp)', 'Albert Einstein', 'UNIFESP', 'FMABC', 'Unicamp', 'ENEM'];
const AREAS_ENEM = [['ciencias-natureza', 'Natureza (Física, Química, Biologia)'], ['matematica', 'Matemática'], ['ciencias-humanas', 'Humanas'], ['linguagens', 'Linguagens']];
const ROTULO_AREA = Object.fromEntries(AREAS_ENEM);

/** Markdown bem simples (imagens https, negrito, quebras) com HTML escapado. */
function mdLite(s) {
  return esc(s || '').replace(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g, (_, u) => /broken-image/.test(u) ? '' : `<img class="q-img" src="${u}" alt="figura" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(https?:[^)\s]+\)/g, '$1').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
}

// ---------- montar listas ----------
async function listaEnem(area, n) {
  const anos = [2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012], out = [];
  const tenta = async () => {
    const ano = anos[Math.floor(Math.random() * anos.length)];
    const r0 = await fetch(`https://api.enem.dev/v1/exams/${ano}/questions?limit=1&discipline=${area}`, { signal: AbortSignal.timeout(20000) });
    if (!r0.ok) return;
    const tot = (await r0.json()).metadata?.total || 0; if (!tot) return;
    const lim = Math.min(n - out.length, 12), off = Math.floor(Math.random() * Math.max(1, tot - lim));
    const r = await fetch(`https://api.enem.dev/v1/exams/${ano}/questions?limit=${lim}&offset=${off}&discipline=${area}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return;
    for (const q of (await r.json()).questions || []) {
      if (!q.correctAlternative || !q.alternatives?.length) continue;
      out.push({ fonte: 'ENEM ' + q.year, materia: ROTULO_AREA[area].split(' (')[0] + ' (ENEM)', enunciado: [q.context, q.alternativesIntroduction].filter(Boolean).join('\n\n'),
        imagens: (q.files || []).filter(f => /^https:/.test(f)),
        alts: q.alternatives.map(a => ({ l: a.letter, t: a.text || '', img: a.file || '' })), gab: q.correctAlternative, coment: '' });
    }
  };
  for (let i = 0; i < 4 && out.length < n; i++) await tenta();
  return out.slice(0, n);
}

async function listaIa(banca, materia, tema, n, dif) {
  const r = await chamarIa(`Crie ${n} questões de múltipla escolha de ${materia}${tema ? `, sobre: ${tema}` : ''}, no estilo da banca ${banca} para o vestibular de Medicina (dificuldade ${dif}). Cada questão com enunciado contextualizado (pode ter um pequeno texto ou dados), 5 alternativas (A a E) com um único gabarito certo e distratores plausíveis, e um comentário curto explicando a resolução. Não copie questões reais. Responda SÓ com JSON:
{"questoes":[{"enunciado":"...","alternativas":["texto A","texto B","texto C","texto D","texto E"],"gabarito":"C","comentario":"..."}]}`, 7000, [], 'texto');
  return (r.questoes || []).filter(q => q.enunciado && Array.isArray(q.alternativas) && q.alternativas.length >= 4 && /^[A-E]$/.test(String(q.gabarito || '').toUpperCase().trim()))
    .map(q => ({ fonte: `IA · estilo ${banca}`, materia, enunciado: String(q.enunciado), imagens: [], alts: q.alternativas.slice(0, 5).map((t, i) => ({ l: 'ABCDE'[i], t: String(t).replace(/^[A-E][).:\s-]+/, '') })),
      gab: String(q.gabarito).toUpperCase().trim(), coment: String(q.comentario || '') }));
}

function iniciarSessao(itens, extra = {}) {
  ui.qs = { itens: itens.map(q => ({ ...q, resp: null, seg: 0, certo: null })), i: 0, t0: Date.now(), ver: false, fim: false, ...extra };
  ui.qs.tq = Date.now(); DB.del('d:qtmp'); render();
}

// ---------- telas ----------
function vQuestoes() {
  const cab = (t = 'Questões') => `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">questões</span><h1>${t}</h1></div>
    ${ui.qs ? '' : `<div class="alterna" role="group">${[['listas', 'Montar lista'], ['erros', `Erros (${S.erros.length})`], ['fora', 'Fiz por fora']].map(([v, t]) => `<button data-acao="qAba" data-v="${v}" aria-pressed="${ui.qAba === v}">${t}</button>`).join('')}</div>`}</header>${avisoIa()}`;
  if (ui.qs) return cab(ui.qs.fim ? 'Resultado' : `Questão ${ui.qs.i + 1} de ${ui.qs.itens.length}`) + (ui.qs.fim ? qResultado() : qQuestao());
  if (ui.qAba === 'erros') return cab() + qErros();
  if (ui.qAba === 'fora') return cab() + qFora();
  return cab() + qMontar();
}

function qMontar() {
  const w = semAtual(), ass = S.assuntos.filter(a => !a.feito && ehConteudo(a) && semDe(a) <= somaDias(w, 7)).slice(0, 8);
  const est = Object.entries(S.qlog[hoje()] || {}), tot = soma(est, ([, v]) => v.f);
  return `<section class="cartao"><h2>Montar uma lista</h2>
    <div class="alterna" role="group"><button data-acao="qFonte" data-v="enem" aria-pressed="${ui.qFonte === 'enem'}">ENEM de verdade</button><button data-acao="qFonte" data-v="ia" aria-pressed="${ui.qFonte === 'ia'}">IA no estilo da banca</button></div>
    ${ui.qFonte === 'enem' ? `<p class="fraco" style="margin:0">Questões reais do ENEM (2012 a 2023), com o gabarito oficial. Vêm de uma área inteira, sorteadas.</p>
      <label class="campo">Área<select data-ui="qArea">${AREAS_ENEM.map(([v, t]) => `<option value="${v}" ${ui.qArea === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`
      : `<p class="fraco" style="margin:0">A IA escreve questões inéditas no estilo da banca, sobre o assunto que você escolher. Elas podem ter erros, então confira o gabarito e a explicação.</p>
      <div class="linha"><label class="campo" style="flex:1 1 180px">Banca<select data-ui="qBanca">${BANCAS.map(b => `<option ${ui.qBanca === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        <label class="campo" style="flex:1 1 180px">Matéria<select data-ui="qMat">${Object.keys(MIN_Q).map(m => `<option ${ui.qMat === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="campo" style="flex:1 1 140px">Dificuldade<select data-ui="qDif">${['fácil', 'média', 'difícil'].map(d => `<option ${ui.qDif === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label></div>
      <label class="campo">Assunto<input type="text" data-ui="qTema" id="q-tema" value="${esc(ui.qTema)}" placeholder="Ex.: genética, leis de Mendel"></label>
      ${ass.length ? `<div class="linha">${ass.map(a => `<button class="chip" data-acao="qAssunto" data-id="${a.id}">${esc(a.titulo.length > 34 ? a.titulo.slice(0, 33) + '…' : a.titulo)}</button>`).join('')}</div>` : ''}`}
    <div class="linha"><span class="fraco">Quantas:</span>${[5, 10, 15, 20].map(n => `<button class="chip" data-acao="qN" data-v="${n}" aria-pressed="${ui.qN === n}">${n}</button>`).join('')}</div>
    <div class="linha"><button class="botao grande" data-acao="qGerar">Começar a lista</button>${S.erros.length ? `<button class="botao claro" data-acao="qRefazerErros">Refazer meus erros (${S.erros.length})</button>` : ''}</div>
    ${tot ? `<p class="fraco" style="margin:0">Hoje: ${tot} questões · ${Math.round(soma(est, ([, v]) => v.a) / tot * 100)}% de acerto.</p>` : ''}</section>`;
}

function qQuestao() {
  const s = ui.qs, q = s.itens[s.i], resp = q.resp != null;
  return `<section class="cartao questao"><div class="entre"><span class="tag" style="${cor(q.materia)}">${esc(q.materia)}</span><span class="fraco">${esc(q.fonte)}</span></div>
    <div class="enunciado">${mdLite(q.enunciado)}${(q.imagens || []).map(u => `<img class="q-img" src="${u}" alt="figura" loading="lazy">`).join('')}</div>
    <div class="alts">${q.alts.map(a => { const sel = q.resp === a.l, certa = resp && a.l === q.gab, errada = resp && sel && a.l !== q.gab;
      return `<button class="alt ${sel ? 'sel' : ''} ${certa ? 'certa' : ''} ${errada ? 'errada' : ''}" data-acao="qResp" data-v="${a.l}" ${resp ? 'disabled' : ''}><b>${a.l}</b><span>${mdLite(a.t)}${a.img && /^https:/.test(a.img) ? `<img class="q-img" src="${a.img}" alt="">` : ''}</span></button>`; }).join('')}</div>
    ${resp ? `<div class="gabarito ${q.certo ? 'ok' : 'errou'}"><strong>${q.certo ? 'Acertou!' : `Errou. A certa era ${q.gab}.`}</strong>${q.coment ? `<p style="margin:6px 0 0">${esc(q.coment)}</p>` : ''}</div>` : ''}
    <div class="linha"><button class="botao contorno" data-acao="qRasc">${ui.qRasc ? 'Fechar o rascunho' : 'Rascunho à mão'}</button>
      ${resp ? `<button class="botao grande" data-acao="qProx">${s.i + 1 < s.itens.length ? 'Próxima' : 'Ver o resultado'}</button>` : `<button class="botao claro" data-acao="qPular">Pular</button>`}
      <button class="link" data-acao="qSair">Sair da lista</button></div>
    ${ui.qRasc ? quadroHtml('qtmp', 420, 'quadriculado') : ''}</section>`;
}

function qResultado() {
  const s = ui.qs, f = s.itens.filter(q => q.resp != null).length, ac = s.itens.filter(q => q.certo).length, seg = soma(s.itens, q => q.seg), erros = s.itens.filter(q => q.resp != null && !q.certo);
  const a = s.assuntoId && achar(s.assuntoId);
  return `<section class="cartao"><div class="resumo-dia"><div><strong>${ac}/${f}</strong><span>acertos (${f ? Math.round(ac / f * 100) : 0}%)</span></div>
      <div><strong>${f ? fmtMin(Math.round(seg / f / 6) / 10) : '0'}</strong><span>por questão</span></div><div><strong>${fmtMin(Math.round(seg / 60))}</strong><span>tempo total</span></div></div>
    ${s.msg ? `<p style="margin:0">${esc(s.msg)}</p>` : ''}
    ${erros.length ? `<p class="fraco" style="margin:0">${erros.length} ${erros.length === 1 ? 'erro foi guardado' : 'erros foram guardados'} no seu caderno de erros, e eu mostro de novo depois.</p>` : '<p style="margin:0">Nenhum erro desta vez!</p>'}
    <div class="linha"><button class="botao grande" data-acao="qNova">Nova lista</button>${erros.length ? '<button class="botao claro" data-acao="qAba" data-v="erros">Ver meus erros</button>' : ''}</div></section>`;
}

function qErros() {
  if (!S.erros.length) return `<section class="cartao"><p style="margin:0">Nenhum erro guardado. Quando você errar uma questão, ela aparece aqui para refazer depois.</p></section>`;
  const venc = S.erros.filter(e => e.rev <= hoje());
  return `<section class="cartao"><div class="entre"><h2>Caderno de erros</h2><span class="fraco">${S.erros.length} questões · ${venc.length} para rever hoje</span></div>
    <div class="linha"><button class="botao" data-acao="qRefazerErros">Refazer ${venc.length || S.erros.length} erros</button></div>
    ${S.erros.slice().reverse().map(e => `<div class="erro-item" style="${cor(e.materia)}"><div class="entre"><span class="tag" style="${cor(e.materia)}">${esc(e.materia)}</span><span class="fraco" style="font-size:13px">${esc(e.fonte)} · ${diaCurto(e.dia)}${e.vezes ? ` · refeita ${e.vezes}x` : ''}</span></div>
      <details><summary class="link">${esc((e.enunciado || '').replace(/\s+/g, ' ').slice(0, 110))}…</summary><div class="enunciado">${mdLite(e.enunciado)}</div>
        <p class="fraco" style="margin:6px 0 0">Você marcou <b>${e.resp}</b>; a certa é <b>${e.gab}</b>${e.alts?.find(a => a.l === e.gab) ? `: ${esc(e.alts.find(a => a.l === e.gab).t)}` : ''}.${e.coment ? ' ' + esc(e.coment) : ''}</p>
        <div class="linha"><button class="link" data-acao="qApagarErro" data-id="${e.id}">Apagar</button></div></details></div>`).join('')}</section>`;
}

function qFora() {
  const mats = Object.keys(MIN_Q);
  return `<section class="cartao"><h2>Fiz por fora</h2><p class="fraco" style="margin:0">Fez questões de um livro, simulado ou PDF e corrigiu sozinha? Anote aqui para o plano, o tempo por questão e as estatísticas.</p>
    <div class="linha"><label class="campo" style="flex:1 1 180px">Matéria<select id="f-mat">${mats.map(m => `<option>${m}</option>`).join('')}</select></label>
      <label class="campo" style="flex:1 1 180px">Banca ou fonte<input type="text" id="f-banca" placeholder="Ex.: Fuvest 2024, apostila"></label></div>
    <div class="linha"><label class="campo" style="flex:1 1 110px">Feitas<input type="number" id="f-feitas" min="1" max="300"></label>
      <label class="campo" style="flex:1 1 110px">Acertos<input type="number" id="f-acertos" min="0" max="300"></label>
      <label class="campo" style="flex:1 1 140px">Tempo gasto (min)<input type="number" id="f-min" min="1" max="600"></label></div>
    <div class="linha"><button class="botao" data-acao="qForaSalvar">Registrar</button></div></section>`;
}

// ---------- ações ----------
function aprenderTempo(materia, seg, n) {
  if (!MIN_Q[materia] || !n || seg <= 0) return;
  // média ponderada: o valor padrão da matéria pesa como 8 questões; depois, o que ela realmente leva
  const t = (S.tq[materia] ||= { n: 0, seg: MIN_Q[materia] * 60 }), por = seg / n, w = 8 + Math.min(t.n, 40);
  t.seg = (t.seg * w + por * n) / (w + n); t.n += n;
}
function fecharItem(s) { const q = s.itens[s.i]; q.seg += Math.round((Date.now() - s.tq) / 1000); s.tq = Date.now(); }
function finalizarSessao() {
  const s = ui.qs; s.fim = true; ui.qRasc = false;
  const feitas = s.itens.filter(q => q.resp != null);
  const porMat = {};
  for (const q of feitas) { const m = (porMat[q.materia] ||= { f: 0, a: 0, seg: 0 }); m.f++; m.a += q.certo ? 1 : 0; m.seg += q.seg; }
  for (const [m, v] of Object.entries(porMat)) { const d = ((S.qlog[hoje()] ||= {})[m] ||= { f: 0, a: 0 }); d.f += v.f; d.a += v.a; aprenderTempo(m, v.seg, v.f); }
  for (const q of feitas) {
    const ja = S.erros.find(e => e.enunciado === q.enunciado);
    if (!q.certo) { if (ja) { ja.vezes = (ja.vezes || 0) + 1; ja.resp = q.resp; ja.rev = somaDias(hoje(), 3); } else S.erros.push({ id: uid(), dia: hoje(), rev: somaDias(hoje(), 3), vezes: 0, fonte: q.fonte, materia: q.materia, enunciado: q.enunciado, alts: q.alts, gab: q.gab, resp: q.resp, coment: q.coment }); }
    else if (ja && s.revisao) S.erros = S.erros.filter(e => e !== ja); // acertou de novo um erro antigo: sai do caderno
  }
  const a = s.assuntoId && achar(s.assuntoId);
  if (a && feitas.length >= 3) s.msg = registrarQ(a, feitas.length, feitas.filter(q => q.certo).length);
  salvar();
}

Object.assign(VIEWS, { questoes: vQuestoes });
Object.assign(ACOES, {
  qAba: el => { ui.qAba = el.dataset.v; ui.qs = null; render(); },
  qFonte: el => { ui.qFonte = el.dataset.v; render(); },
  qN: el => { ui.qN = +el.dataset.v; render(); },
  qAssunto: el => { const a = achar(el.dataset.id); if (a) { ui.qTema = a.titulo; ui.qMat = MIN_Q[a.materia] ? a.materia : ui.qMat; ui.qAssuntoId = a.id; render(); } },
  qGerar: async () => {
    ui.qTema = ($('#q-tema')?.value ?? ui.qTema).trim(); ui.iaMsg = '';
    ui.carregando = ui.qFonte === 'enem' ? 'Buscando questões do ENEM…' : 'A IA está escrevendo as questões…'; render();
    try {
      const itens = ui.qFonte === 'enem' ? await listaEnem(ui.qArea, ui.qN) : await listaIa(ui.qBanca, ui.qMat, ui.qTema, ui.qN, ui.qDif);
      if (!itens.length) throw new Error('não veio nenhuma questão');
      ui.carregando = ''; iniciarSessao(itens, { assuntoId: ui.qFonte === 'ia' && ui.qTema ? ui.qAssuntoId : null });
    } catch (e) { ui.carregando = ''; ui.iaMsg = `Não consegui montar a lista (${e.message}). Tente de novo.`; render(); }
  },
  qRefazerErros: () => {
    const venc = S.erros.filter(e => e.rev <= hoje()), base = (venc.length ? venc : S.erros).slice(0, 15);
    iniciarSessao(base.map(e => ({ fonte: e.fonte + ' · erro anterior', materia: e.materia, enunciado: e.enunciado, imagens: [], alts: e.alts, gab: e.gab, coment: e.coment })), { revisao: true });
  },
  qResp: el => {
    const s = ui.qs, q = s.itens[s.i]; if (q.resp != null) return;
    fecharItem(s); q.resp = el.dataset.v; q.certo = q.resp === q.gab; render();
  },
  qPular: () => { const s = ui.qs; fecharItem(s); if (s.i + 1 < s.itens.length) { s.i++; ui.qRasc = false; DB.del('d:qtmp'); } else finalizarSessao(); render(); },
  qProx: () => { const s = ui.qs; if (s.i + 1 < s.itens.length) { s.i++; s.tq = Date.now(); ui.qRasc = false; DB.del('d:qtmp'); window.scrollTo(0, 0); } else finalizarSessao(); render(); },
  qRasc: () => { ui.qRasc = !ui.qRasc; render(); },
  qSair: () => { if (ui.qs.itens.some(q => q.resp != null)) finalizarSessao(); else ui.qs = null; render(); },
  qNova: () => { ui.qs = null; ui.qAba = 'listas'; render(); },
  qApagarErro: el => { S.erros = S.erros.filter(e => e.id !== el.dataset.id); salvar(); render(); },
  qForaSalvar: () => {
    const m = $('#f-mat').value, f = Math.round(+$('#f-feitas').value), ac = Math.round(+$('#f-acertos').value), min = +$('#f-min').value || 0;
    if (!(f > 0) || !(ac >= 0) || ac > f) { ui.iaMsg = 'Confira os números: os acertos não podem passar das questões feitas.'; render(); return; }
    const d = ((S.qlog[hoje()] ||= {})[m] ||= { f: 0, a: 0 }); d.f += f; d.a += ac;
    if (min > 0) aprenderTempo(m, min * 60, f);
    salvar(); ui.iaMsg = `Anotado: ${ac} de ${f} em ${m}${min ? ` (${(min / f).toFixed(1)} min por questão)` : ''}.`; render();
  },
});
render();
