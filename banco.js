'use strict';
/* Banco de questões: tudo fica no aparelho (IndexedDB) e é filtrado aqui, sem depender de internet na hora de estudar.
   Fontes: ENEM (baixado uma vez da API aberta enem.dev), questões geradas pela IA (guardadas) e questões importadas de arquivo JSON.
   Formato de cada questão: { id, banca, tipo: 'real'|'ia', ano, area, materia, assunto, enunciado, imagens: [url], alts: [{l,t,img}], gab, coment }.
   Por enquanto sem resolução comentada; o campo "coment" já existe para quando houver. */

S.qh ||= {}; // histórico por questão: { id: { ok, dia, n } }
const BANCO = { itens: [], pronto: false, carregando: false, msg: '' };
const FONTES_BANCO = ['enem', 'ia', 'import'];
ui.qf = { fontes: [], a0: '', a1: '', area: '', mat: '', st: 'todas', n: 10, ordem: 'sorteio' };

const AREAS_Q = [['', 'Todas'], ['ciencias-natureza', 'Natureza'], ['matematica', 'Matemática'], ['ciencias-humanas', 'Humanas'], ['linguagens', 'Linguagens']];
const AREA_DA_MATERIA = { 'Biologia': 'ciencias-natureza', 'Química': 'ciencias-natureza', 'Física': 'ciencias-natureza', 'Matemática': 'matematica', 'História': 'ciencias-humanas', 'Geografia': 'ciencias-humanas', 'Filosofia': 'ciencias-humanas', 'Sociologia': 'ciencias-humanas', 'Português': 'linguagens', 'Literatura': 'linguagens', 'Inglês': 'linguagens' };
const areaDeQ = q => q.area || AREA_DA_MATERIA[q.materia] || '';
const rotuloArea = a => (AREAS_Q.find(x => x[0] === a) || [, ''])[1];
const chaveFonte = q => q.banca + (q.tipo === 'ia' ? ' (IA)' : '');

async function carregarBanco() {
  if (BANCO.pronto || BANCO.carregando) return;
  BANCO.carregando = true;
  const partes = await Promise.all(FONTES_BANCO.map(k => DB.get('banco:' + k)));
  BANCO.itens = partes.flatMap(p => Array.isArray(p) ? p : []);
  BANCO.pronto = true; BANCO.carregando = false; render();
}
async function guardarFonte(k) { await DB.set('banco:' + k, BANCO.itens.filter(q => q._f === k)); }

function filtrarBanco() {
  const f = ui.qf;
  return BANCO.itens.filter(q => {
    if (f.fontes.length && !f.fontes.includes(chaveFonte(q))) return false;
    if (f.a0 && q.ano && q.ano < +f.a0) return false;
    if (f.a1 && q.ano && q.ano > +f.a1) return false;
    if (f.area && areaDeQ(q) !== f.area) return false;
    if (f.mat && q.materia !== f.mat) return false;
    const h = S.qh[q.id];
    if (f.st === 'novas' && h) return false;
    if (f.st === 'erradas' && !(h && !h.ok)) return false;
    if (f.st === 'acertadas' && !(h && h.ok)) return false;
    return true;
  });
}

// ---------- tela de montar lista ----------
function qMontar() {
  if (!BANCO.pronto) { carregarBanco(); return '<section class="cartao"><p class="fraco" style="margin:0">Abrindo o banco de questões…</p></section>'; }
  const f = ui.qf, todos = BANCO.itens, achadas = filtrarBanco();
  const fontes = {}; for (const q of todos) fontes[chaveFonte(q)] = (fontes[chaveFonte(q)] || 0) + 1;
  const anos = [...new Set(todos.map(q => q.ano).filter(Boolean))].sort(), mats = [...new Set(todos.map(q => q.materia).filter(Boolean))].sort();
  const sel = (id, v, opts) => `<select data-qf="${id}">${opts.map(([val, t]) => `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const feitas = Object.keys(S.qh).length, tot = soma(Object.values(S.qlog[hoje()] || {}), v => v.f);
  return `<section class="cartao"><div class="entre"><h2>Banco de questões</h2><span class="fraco">${todos.length} no banco · ${feitas} já respondidas</span></div>
    ${todos.length ? `<div class="linha">${Object.entries(fontes).map(([k, n]) => `<span class="tag" style="--c:var(--out)">${esc(k)} · ${n}</span>`).join('')}</div>` : '<p style="margin:0">O banco está vazio. Baixe as questões do ENEM (reais, com gabarito), gere com a IA ou importe um arquivo.</p>'}
    ${BANCO.msg ? `<p class="fraco" style="margin:0">${esc(BANCO.msg)}</p>` : ''}
    <div class="linha"><button class="botao claro" data-acao="bancoEnem" ${BANCO.baixando ? 'disabled' : ''}>${BANCO.baixando ? 'Baixando…' : todos.some(q => q.banca === 'ENEM') ? 'Atualizar ENEM' : 'Baixar o ENEM (2009–2023)'}</button>
      <label class="botao claro" style="display:inline-flex;align-items:center">Importar arquivo<input type="file" accept="application/json,.json" data-acao-arquivo="bancoImportar" hidden></label>
      <button class="link" data-acao="bancoAjuda">Como importar?</button></div></section>
    <section class="cartao"><h2>Escolha as questões</h2>
      ${todos.length ? `<div class="coluna" style="gap:8px"><span class="rotulo">banca / fonte</span><div class="linha">${Object.keys(fontes).map(k => `<button class="chip" data-acao="qfFonte" data-v="${esc(k)}" aria-pressed="${f.fontes.includes(k)}">${esc(k)}</button>`).join('')}<span class="fraco" style="font-size:13px">${f.fontes.length ? '' : '(todas)'}</span></div></div>
      <div class="linha"><label class="campo" style="flex:1 1 130px">Ano, de${sel('a0', f.a0, [['', 'qualquer'], ...anos.map(a => [a, a])])}</label><label class="campo" style="flex:1 1 130px">até${sel('a1', f.a1, [['', 'qualquer'], ...anos.map(a => [a, a])])}</label>
        ${mats.length ? `<label class="campo" style="flex:1 1 170px">Matéria${sel('mat', f.mat, [['', 'todas'], ...mats.map(m => [m, m])])}</label>` : ''}</div>
      <div class="coluna" style="gap:8px"><span class="rotulo">área</span><div class="linha">${AREAS_Q.map(([v, t]) => `<button class="chip" data-acao="qfArea" data-v="${v}" aria-pressed="${f.area === v}">${t}</button>`).join('')}</div></div>
      <div class="coluna" style="gap:8px"><span class="rotulo">quais</span><div class="linha">${[['todas', 'Todas'], ['novas', 'Ainda não feitas'], ['erradas', 'As que errei'], ['acertadas', 'As que acertei']].map(([v, t]) => `<button class="chip" data-acao="qfSt" data-v="${v}" aria-pressed="${f.st === v}">${t}</button>`).join('')}</div></div>
      <div class="linha"><span class="fraco">Quantas:</span>${[5, 10, 20, 30, 50].map(n => `<button class="chip" data-acao="qN" data-v="${n}" aria-pressed="${f.n === n}">${n}</button>`).join('')}
        <input type="number" min="1" max="200" data-qf="n" value="${[5, 10, 20, 30, 50].includes(f.n) ? '' : f.n}" placeholder="outra" style="width:90px">
        <div class="alterna" role="group"><button data-acao="qfOrdem" data-v="sorteio" aria-pressed="${f.ordem === 'sorteio'}">Sorteio</button><button data-acao="qfOrdem" data-v="ordem" aria-pressed="${f.ordem === 'ordem'}">Em ordem</button></div></div>
      <div class="entre contagem"><strong>${achadas.length} ${achadas.length === 1 ? 'questão bate' : 'questões batem'} com os filtros</strong>
        <div class="linha"><button class="botao grande" data-acao="qGerar" ${achadas.length ? '' : 'disabled'}>Começar${achadas.length ? ` (${Math.min(f.n, achadas.length)})` : ''}</button>${S.erros.length ? `<button class="botao claro" data-acao="qRefazerErros">Refazer meus erros (${S.erros.length})</button>` : ''}</div></div>` : ''}</section>
    <section class="cartao"><h2>Aumentar o banco com a IA</h2><p class="fraco" style="margin:0">A IA escreve questões inéditas no estilo da banca e elas ficam guardadas no banco. Podem ter erros: confira.</p>
      <div class="linha"><label class="campo" style="flex:1 1 170px">Banca<select data-ui="qBanca">${BANCAS.map(b => `<option ${ui.qBanca === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        <label class="campo" style="flex:1 1 170px">Matéria<select data-ui="qMat">${Object.keys(MIN_Q).map(m => `<option ${ui.qMat === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="campo" style="flex:1 1 130px">Dificuldade<select data-ui="qDif">${['fácil', 'média', 'difícil'].map(d => `<option ${ui.qDif === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label class="campo" style="flex:0 1 90px">Quantas<input type="number" min="1" max="15" data-ui="qNIa" value="${ui.qNIa || 5}"></label></div>
      <label class="campo">Assunto<input type="text" data-ui="qTema" id="q-tema" value="${esc(ui.qTema)}" placeholder="Ex.: genética, leis de Mendel"></label>
      <div class="linha"><button class="botao" data-acao="qIaBanco">Gerar e guardar no banco</button></div></section>
    ${metaQTabela()}`;
}

function metaQTabela() {
  const q = S.qlog[hoje()] || {}, mats = Object.keys(MIN_Q).filter(m => metaQ(m) > 0);
  if (!mats.length) return '';
  return `<section class="cartao"><div class="entre"><h2>Metas de hoje</h2><span class="fraco" style="font-size:14px">Mude as metas em Ajustes</span></div>
    ${mats.map(m => { const f = q[m]?.f || 0, meta = metaQ(m); return `<div class="meta-linha" style="${cor(m)}"><span><i class="ponto"></i>${esc(m)}</span><span class="fraco">${f}/${meta}</span><div class="barra"><i style="width:${Math.min(100, Math.round(f / meta * 100))}%;background:var(--c)"></i></div></div>`; }).join('')}</section>`;
}

// ---------- ações ----------
async function baixarEnem() {
  BANCO.baixando = true; BANCO.msg = 'Baixando o ENEM… isso leva alguns minutos, mas só uma vez.'; render();
  const ja = new Set(BANCO.itens.map(q => q.id)); let novas = 0;
  try {
    const anos = (await (await fetch('https://api.enem.dev/v1/exams')).json()).map(e => e.year).sort((a, b) => b - a);
    for (const ano of anos) {
      BANCO.msg = `Baixando o ENEM ${ano}… (${novas} questões novas até agora)`; render();
      for (let off = 0; off < 400; off += 50) {
        const r = await fetch(`https://api.enem.dev/v1/exams/${ano}/questions?limit=50&offset=${off}`, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) break;
        const j = await r.json();
        for (const q of j.questions || []) {
          const id = `enem-${ano}-${q.index}-${q.language || ''}`;
          if (ja.has(id) || !q.correctAlternative || !q.alternatives?.length) continue;
          ja.add(id); novas++;
          BANCO.itens.push({ _f: 'enem', id, banca: 'ENEM', tipo: 'real', ano, area: q.discipline, lingua: q.language || '', n: q.index,
            enunciado: [q.context, q.alternativesIntroduction].filter(Boolean).join('\n\n'), imagens: (q.files || []).filter(f => /^https:/.test(f)),
            alts: q.alternatives.map(a => ({ l: a.letter, t: a.text || '', img: /^https:/.test(a.file || '') ? a.file : '' })), gab: q.correctAlternative, coment: '' });
        }
        if (!j.metadata?.hasMore) break;
      }
      await guardarFonte('enem');
    }
    BANCO.msg = `Pronto: ${novas} questões novas do ENEM no banco.`;
  } catch (e) { BANCO.msg = `O download parou (${e.message}). O que já veio ficou guardado; toque de novo para continuar.`; await guardarFonte('enem'); }
  BANCO.baixando = false; render();
}

function normalizarImportada(q, i) {
  if (!q || !q.enunciado || !Array.isArray(q.alts || q.alternativas)) return null;
  const alts = (q.alts || q.alternativas).map((a, k) => typeof a === 'string' ? { l: 'ABCDE'[k], t: a, img: '' } : { l: a.l || a.letra || 'ABCDE'[k], t: a.t || a.texto || '', img: a.img || '' });
  const gab = String(q.gab || q.gabarito || '').toUpperCase().trim();
  if (alts.length < 2 || !/^[A-E]$/.test(gab)) return null;
  return { _f: 'import', id: q.id || `imp-${Date.now().toString(36)}-${i}`, banca: String(q.banca || 'Importada'), tipo: 'real', ano: +q.ano || 0, area: q.area || '', materia: q.materia || '', assunto: q.assunto || '',
    enunciado: String(q.enunciado), imagens: (q.imagens || []).filter(u => /^https:/.test(u)), alts, gab, coment: String(q.coment || q.comentario || '') };
}

Object.assign(ACOES, {
  bancoEnem: () => baixarEnem(),
  bancoAjuda: () => abrirModal(`<div class="entre"><h2>Importar questões</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
    <p>Um arquivo .json com uma lista de questões neste formato (campos extras são ignorados):</p>
    <pre class="codigo">[{ "banca": "Vunesp", "ano": 2024, "materia": "Biologia", "assunto": "Genética",
   "enunciado": "Texto da questão…",
   "alts": ["texto da A", "texto da B", "texto da C", "texto da D", "texto da E"],
   "gab": "C", "imagens": ["https://…/figura.png"], "comentario": "" }]</pre>
    <p class="fraco">Questões repetidas (mesmo id) não duplicam. É assim que dá para montar um banco grande de várias bancas.</p>`),
  qfFonte: el => { const f = ui.qf.fontes, v = el.dataset.v; ui.qf.fontes = f.includes(v) ? f.filter(x => x !== v) : [...f, v]; render(); },
  qfArea: el => { ui.qf.area = el.dataset.v; render(); },
  qfSt: el => { ui.qf.st = el.dataset.v; render(); },
  qfOrdem: el => { ui.qf.ordem = el.dataset.v; render(); },
  qN: el => { ui.qf.n = +el.dataset.v; render(); },
  qGerar: () => {
    let l = filtrarBanco();
    l = ui.qf.ordem === 'ordem' ? l.slice().sort((a, b) => (a.ano || 0) - (b.ano || 0) || (a.n || 0) - (b.n || 0)) : l.slice().sort(() => Math.random() - 0.5);
    const itens = l.slice(0, Math.max(1, ui.qf.n)).map(q => ({ id: q.id, fonte: `${q.banca}${q.ano ? ' ' + q.ano : ''}${q.tipo === 'ia' ? ' · IA' : ''}`, materia: q.materia || (rotuloArea(areaDeQ(q)) ? rotuloArea(areaDeQ(q)) + ' (' + q.banca + ')' : 'Questão'),
      enunciado: q.enunciado, imagens: q.imagens, alts: q.alts, gab: q.gab, coment: q.coment }));
    if (itens.length) iniciarSessao(itens);
  },
  qIaBanco: async () => {
    ui.qTema = ($('#q-tema')?.value ?? ui.qTema).trim(); const n = Math.max(1, Math.min(15, +ui.qNIa || 5));
    ui.carregando = 'A IA está escrevendo as questões…'; ui.iaMsg = ''; render();
    try {
      const novas = (await listaIa(ui.qBanca, ui.qMat, ui.qTema, n, ui.qDif)).map((q, i) => ({ ...q, _f: 'ia', id: `ia-${Date.now().toString(36)}-${i}`, banca: ui.qBanca, tipo: 'ia', ano: new Date().getFullYear(), area: AREA_DA_MATERIA[ui.qMat] || '', materia: ui.qMat, assunto: ui.qTema }));
      if (!novas.length) throw new Error('não veio nenhuma questão');
      BANCO.itens.push(...novas); await guardarFonte('ia'); ui.carregando = '';
      ui.iaMsg = `${novas.length} questões guardadas no banco.`; iniciarSessao(novas.map(q => ({ id: q.id, fonte: `IA · estilo ${q.banca}`, materia: q.materia, enunciado: q.enunciado, imagens: [], alts: q.alts, gab: q.gab, coment: q.coment })), { assuntoId: ui.qTema ? ui.qAssuntoId : null });
    } catch (e) { ui.carregando = ''; ui.iaMsg = `Não consegui gerar agora (${e.message}).`; render(); }
  },
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.qf) { const k = el.dataset.qf; ui.qf[k] = k === 'n' ? Math.max(1, Math.min(200, +el.value || 10)) : el.value; render(); }
  if (el.dataset.acaoArquivo === 'bancoImportar' && el.files?.[0]) {
    el.files[0].text().then(async t => {
      const j = JSON.parse(t), lista = Array.isArray(j) ? j : j.questoes || [], ja = new Set(BANCO.itens.map(q => q.id));
      const ok = lista.map(normalizarImportada).filter(q => q && !ja.has(q.id));
      BANCO.itens.push(...ok); await guardarFonte('import'); BANCO.msg = `${ok.length} questões importadas (${lista.length - ok.length} ignoradas por formato ou repetição).`; render();
    }).catch(err => { BANCO.msg = 'Não consegui ler o arquivo: ' + err.message; render(); });
  }
});
render();
