'use strict';
/* Banco de questões: milhares de questões ficam no aparelho (IndexedDB "rotina-banco") e são filtradas sem internet.
   Em memória fica só uma ficha leve de cada questão (BANCO.itens); o texto completo é lido do banco ao montar a lista.
   Fontes: ENEM (baixado da API aberta enem.dev), questões geradas pela IA e arquivos JSON importados (ferramentas/montar_banco.py gera os arquivos).
   Questão: { id, banca, ano, area, materia, assunto, dif, fig, enunciado, imagens[], alts:[{l,t,img}], gab, coment, res_ia, duvidas }. */

S.qh ||= {}; // histórico por questão: { id: { ok, dia, n } }
const BANCO = { itens: [], pronto: false, carregando: false, msg: '', baixando: false };
ui.qf = { assunto: '', bancas: [], buscaBanca: '', preset: '', a0: '', a1: '', area: '', mat: '', st: 'todas', dif: '', tag: '', semFig: true, n: 10, ordem: 'sorteio' };

const AREAS_Q = [['', 'Todas'], ['ciencias-natureza', 'Natureza'], ['matematica', 'Matemática'], ['ciencias-humanas', 'Humanas'], ['linguagens', 'Linguagens']];
const AREA_DA_MATERIA = { 'Biologia': 'ciencias-natureza', 'Química': 'ciencias-natureza', 'Física': 'ciencias-natureza', 'Matemática': 'matematica', 'História': 'ciencias-humanas', 'Geografia': 'ciencias-humanas', 'Filosofia': 'ciencias-humanas', 'Sociologia': 'ciencias-humanas', 'Português': 'linguagens', 'Literatura': 'linguagens', 'Inglês': 'linguagens' };
const areaDeQ = q => q.ar || AREA_DA_MATERIA[q.m] || '';
const rotuloArea = a => (AREAS_Q.find(x => x[0] === a) || [, ''])[1];
// Grupos de bancas (seleção minha, por nome): São Paulo, Medicina e "provas exigentes parecidas com Fuvest/Vunesp" de outros estados
const PRESETS_BANCA = {
  sp: ['Bancas de SP', /fuvest|\busp\b|unicamp|unesp|vunesp|unifesp|famerp|famema|santa casa|fmabc|einstein|puc-?sp|puc campinas|fgv|fatec|etec|mackenzie|unitau|unisa|unimep|\busf\b|uninove|ufscar|ufabc|insper|facere|fmj|fameg|unaerp|unifran|fcmsc|cesumar|esamc/i],
  med: ['Medicina', /medicina|famerp|famema|santa casa|fmabc|einstein|unifesp|facere|fmj|fameg|fame\b|famevaço|cusc|unieva|famene|fcm\b|uniceplac|famesp|cesmac med/i],
  exigentes: ['Exigentes (parecem Fuvest/Vunesp)', /unicamp|unesp|ufrgs|uerj|ufmg|unb|ufpr|uel\b|ufsc|ufrj|ufpe|ufc\b|ufba|puc|fgv|mackenzie|\bita\b|\bime\b|espcex|enem|uff|ufscar|unifesp|ufu|uem|uepg|ufes|usp|fuvest|vunesp/i],
};

// ---------- armazenamento ----------
const BD = {
  _db: null,
  abrir() {
    return this._db ||= new Promise((ok, falha) => {
      const r = indexedDB.open('rotina-banco', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('q', { keyPath: 'id' }); r.result.createObjectStore('m'); };
      r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error);
    });
  },
  async put(lista) {
    const db = await this.abrir();
    for (let i = 0; i < lista.length; i += 400) {
      await new Promise((ok, falha) => { const t = db.transaction('q', 'readwrite'), s = t.objectStore('q'); lista.slice(i, i + 400).forEach(q => s.put(q)); t.oncomplete = ok; t.onerror = () => falha(t.error); });
    }
  },
  async get(id) { const db = await this.abrir(); return new Promise(ok => { const q = db.transaction('q').objectStore('q').get(id); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); },
  async meta() { const db = await this.abrir(); return new Promise(ok => { const q = db.transaction('m').objectStore('m').get('lista'); q.onsuccess = () => ok(q.result || []); q.onerror = () => ok([]); }); },
  async setMeta(l) { const db = await this.abrir(); return new Promise(ok => { const t = db.transaction('m', 'readwrite'); t.objectStore('m').put(l, 'lista'); t.oncomplete = ok; t.onerror = ok; }); },
};
/** Chave do conteúdo (começo do enunciado + gabarito): o mesmo texto vindo de duas fontes não entra duas vezes. */
function chaveQ(q) { const t = String(q.enunciado || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 120) + (q.gab || ''); let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + t.length; }
const normTxt = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** Texto para busca: sem acento, "2º" vira "2", plural vira singular (funções = função), para achar "funções de segundo grau". */
const normBusca = s => normTxt(s).replace(/(\d)\s*[º°ª]/g, '$1').replace(/oes\b/g, 'ao').replace(/s\b/g, '');
const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'no', 'na', 'um', 'uma', 'com', 'que']);
function tokensBusca(q) {
  let t = normBusca(q);
  const extra = [];
  if (/\b(2|segundo)\s*grau\b/.test(t)) { t = t.replace(/\b(2|segundo)\s*grau\b/g, ' '); extra.push('quadrat'); }
  if (/\b(1|primeiro)\s*grau\b/.test(t)) { t = t.replace(/\b(1|primeiro)\s*grau\b/g, ' '); extra.push('afim'); }
  return [...t.split(/\s+/).filter(w => w && !PARADAS.has(w)), ...extra];
}
const metaDe = q => ({ id: q.id, k: chaveQ(q), b: q.banca || 'Outra', a: q.ano || 0, ar: q.area || '', m: q.materia || '', s: normBusca(q.assunto).slice(0, 140), as: q.assunto || '', x: q.modo === 'objetivo' ? normBusca(q.enunciado).slice(0, 600) : '', n: q.num || '', d: q.dif || '', t: q.tipo === 'ia' ? 'ia' : 'real', f: q.fig ? 1 : 0, r: q.modo === 'objetivo' || q.coment ? 1 : 0 });

async function carregarBanco() {
  if (BANCO.pronto || BANCO.carregando) return;
  BANCO.carregando = true;
  try {
    BANCO.itens = await BD.meta();
    // traz o que existia no formato antigo (versão anterior do app)
    const velhos = (await Promise.all(['enem', 'ia', 'import'].map(k => DB.get('banco:' + k)))).flatMap(p => Array.isArray(p) ? p : []);
    if (velhos.length) {
      const ja = new Set(BANCO.itens.map(m => m.id));
      const novos = velhos.filter(q => !ja.has(q.id)).map(({ _f, ...q }) => ({ ...q, assunto: q.assunto || '', materia: q.materia || '' }));
      await BD.put(novos); BANCO.itens.push(...novos.map(metaDe)); await BD.setMeta(BANCO.itens);
      for (const k of ['enem', 'ia', 'import']) await DB.del('banco:' + k);
    }
  } catch (e) { BANCO.msg = 'Não consegui abrir o banco: ' + e.message; }
  BANCO.pronto = true; BANCO.carregando = false; render();
}

/** Acrescenta questões ao banco (sem repetir ids) e devolve quantas entraram. */
async function adicionarQuestoes(lista) {
  const ja = new Set(BANCO.itens.map(m => m.id)), ks = new Set(BANCO.itens.map(m => m.k).filter(Boolean)), novos = [];
  // reimportar um arquivo melhorado (agora com assunto) atualiza as questões que já estavam no banco
  const pos = new Map(BANCO.itens.map((m, i) => [m.id, i])), atual = [];
  for (const q of lista) { const i = q && pos.get(q.id); if (i != null && q.assunto && !BANCO.itens[i].as) { atual.push(q); BANCO.itens[i] = metaDe(q); } }
  if (atual.length) { await BD.put(atual); await BD.setMeta(BANCO.itens); BANCO.atualizadas = (BANCO.atualizadas || 0) + atual.length; }
  for (const q of lista) { if (!q || !q.id || ja.has(q.id)) continue; const k = chaveQ(q); if (ks.has(k)) { BANCO.repetidas = (BANCO.repetidas || 0) + 1; continue; } ja.add(q.id); ks.add(k); novos.push(q); }
  if (!novos.length) return 0;
  await BD.put(novos); BANCO.itens.push(...novos.map(metaDe)); await BD.setMeta(BANCO.itens);
  return novos.length;
}

function filtrarBanco() {
  const f = ui.qf, pre = f.preset && PRESETS_BANCA[f.preset] ? PRESETS_BANCA[f.preset][1] : null, toks = tokensBusca(f.tag);
  return BANCO.itens.filter(q => {
    if (f.bancas.length ? !f.bancas.includes(q.b) : (pre && !pre.test(q.b))) return false;
    if (f.a0 && q.a && q.a < +f.a0) return false;
    if (f.a1 && q.a && q.a > +f.a1) return false;
    if (f.area && areaDeQ(q) !== f.area) return false;
    if (f.mat && q.m !== f.mat) return false;
    if (f.dif && q.d !== f.dif) return false;
    if (f.semFig && q.f) return false;
    if (f.res && !q.r) return false;
    if (f.assunto && q.as !== f.assunto) return false;
    if (toks.length) { const alvo = q.s + ' ' + (q.x || '') + ' ' + normBusca(q.b) + ' ' + normBusca(q.m); if (!toks.every(w => alvo.includes(w))) return false; }
    const h = S.qh[q.id];
    if (f.st === 'novas' && h) return false;
    if (f.st === 'erradas' && !(h && !h.ok)) return false;
    if (f.st === 'acertadas' && !(h && h.ok)) return false;
    return true;
  });
}

// ---------- tela de montar lista ----------
function contar(lista, campo) { const c = {}; for (const q of lista) { const k = q[campo]; if (k) c[k] = (c[k] || 0) + 1; } return c; }

function qMontar() {
  if (!BANCO.pronto) { carregarBanco(); return '<section class="cartao"><p class="fraco" style="margin:0">Abrindo o banco de questões…</p></section>'; }
  const f = ui.qf, todos = BANCO.itens, achadas = filtrarBanco();
  const porBanca = contar(todos, 'b'), porMat = contar(todos, 'm');
  const anos = [...new Set(todos.map(q => q.a).filter(Boolean))].sort(), mats = Object.keys(porMat).sort();
  const dificuldades = [...new Set(todos.map(q => q.d).filter(Boolean))];
  const buscaB = f.buscaBanca.trim().toLowerCase();
  const bancasLista = Object.entries(porBanca).filter(([k]) => !buscaB || k.toLowerCase().includes(buscaB)).sort((a, b) => b[1] - a[1]).slice(0, 36);
  const sel = (id, v, opts) => `<select data-qf="${id}">${opts.map(([val, t]) => `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const contaPreset = k => todos.filter(q => PRESETS_BANCA[k][1].test(q.b)).length;
  const feitas = Object.keys(S.qh).length;
  return `<section class="cartao"><div class="entre"><h2>Banco de questões</h2><span class="fraco">${todos.length.toLocaleString('pt-BR')} no banco · ${feitas} já respondidas</span></div>
    ${todos.length ? '' : '<p style="margin:0">O banco está vazio. Baixe o ENEM, importe os arquivos de questões (veja "Como importar") ou gere com a IA.</p>'}
    ${todos.length ? detalhe('bancoinfo', 'O que há no banco', `<div class="linha">${Object.entries(porMat).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<span class="tag" style="${cor(m)}">${esc(m)} · ${n.toLocaleString('pt-BR')}</span>`).join('')}</div>`) : ''}
    ${BANCO.msg ? `<p style="margin:0">${esc(BANCO.msg)}</p>` : ''}
    <div class="linha"><button class="botao claro" data-acao="bancoEnem" ${BANCO.baixando ? 'disabled' : ''}>${BANCO.baixando ? 'Baixando…' : todos.some(q => q.b === 'ENEM') ? 'Atualizar ENEM' : 'Baixar o ENEM (2009–2023)'}</button>
      <label class="botao claro" style="display:inline-flex;align-items:center">Importar arquivos<input type="file" accept="application/json,.json,.gz,application/gzip" multiple data-acao-arquivo="bancoImportar" hidden></label>
      <button class="link" data-acao="bancoAjuda">Como importar?</button></div></section>
    <section class="cartao"><h2>Escolha as questões</h2>
      ${todos.length ? `<div class="coluna" style="gap:8px"><span class="rotulo">matéria</span><div class="linha"><button class="chip" data-acao="qfMat" data-v="" aria-pressed="${!f.mat}">Todas <small>${todos.length.toLocaleString('pt-BR')}</small></button>${Object.entries(porMat).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<button class="chip" data-acao="qfMat" data-v="${esc(m)}" aria-pressed="${f.mat === m}">${esc(m)} <small>${n.toLocaleString('pt-BR')}</small></button>`).join('')}</div></div>
      ${f.mat ? `<div class="coluna" style="gap:8px"><span class="rotulo">assunto de ${esc(f.mat)}</span><div class="linha assuntos-q"><button class="chip" data-acao="qfAssunto" data-v="" aria-pressed="${!f.assunto}">Todos os assuntos</button>${assuntosDe(f.mat, todos).map(([a, n]) => `<button class="chip" data-acao="qfAssunto" data-v="${esc(a)}" aria-pressed="${f.assunto === a}">${esc(a)} <small>${n}</small></button>`).join('')}</div></div>` : ''}
      <label class="campo">Procurar no texto das questões<input type="search" data-qf="tag" value="${esc(f.tag)}" placeholder="Ex.: função quadrática, vértice da parábola, Segundo Reinado"></label>
      <div class="linha"><span class="fraco">Quantas:</span>${[10, 20, 30, 50].map(n => `<button class="chip" data-acao="qN" data-v="${n}" aria-pressed="${f.n === n}">${n}</button>`).join('')}<button class="chip" data-acao="qN" data-v="9999" aria-pressed="${f.n >= 9999}">todas</button><input type="number" min="1" max="500" data-qf="n" value="${[10, 20, 30, 50].includes(f.n) || f.n >= 9999 ? '' : f.n}" placeholder="outra" style="width:84px"></div>
      ${detalhe('filtros', 'Mais filtros (banca, ano, área, quais)', `<div class="coluna" style="gap:8px"><span class="rotulo">grupos de bancas</span><div class="linha">${Object.entries(PRESETS_BANCA).map(([k, [t]]) => `<button class="chip" data-acao="qfPreset" data-v="${k}" aria-pressed="${f.preset === k}">${t} · ${contaPreset(k).toLocaleString('pt-BR')}</button>`).join('')}</div></div>
      <div class="coluna" style="gap:8px"><span class="rotulo">banca específica ${f.bancas.length ? `(${f.bancas.length} escolhida${f.bancas.length > 1 ? 's' : ''})` : ''}</span>
        <input type="search" data-qf="buscaBanca" value="${esc(f.buscaBanca)}" placeholder="Procurar banca: Fuvest, Unicamp, Medicina…">
        <div class="linha">${f.bancas.map(b => `<button class="chip" data-acao="qfBanca" data-v="${esc(b)}" aria-pressed="true">${esc(b)} ✕</button>`).join('')}${bancasLista.filter(([k]) => !f.bancas.includes(k)).map(([k, n]) => `<button class="chip" data-acao="qfBanca" data-v="${esc(k)}" aria-pressed="false">${esc(k)} <small>${n}</small></button>`).join('')}</div></div>
      <div class="linha"><label class="campo" style="flex:1 1 120px">Ano, de${sel('a0', f.a0, [['', 'qualquer'], ...anos.map(a => [a, a])])}</label><label class="campo" style="flex:1 1 120px">até${sel('a1', f.a1, [['', 'qualquer'], ...anos.map(a => [a, a])])}</label>
        ${dificuldades.length ? `<label class="campo" style="flex:1 1 130px">Dificuldade${sel('dif', f.dif, [['', 'qualquer'], ...dificuldades.map(d => [d, d])])}</label>` : ''}</div>
      <div class="coluna" style="gap:8px"><span class="rotulo">quais</span><div class="linha">${[['todas', 'Todas'], ['novas', 'Ainda não feitas'], ['erradas', 'As que errei'], ['acertadas', 'As que acertei']].map(([v, t]) => `<button class="chip" data-acao="qfSt" data-v="${v}" aria-pressed="${f.st === v}">${t}</button>`).join('')}
        <button class="chip" data-acao="qfFig" aria-pressed="${f.semFig}">Sem figura faltando</button><button class="chip" data-acao="qfRes" aria-pressed="${!!f.res}">Só com resolução comentada</button></div></div>
      <div class="linha"><div class="alterna" role="group"><button data-acao="qfOrdem" data-v="sorteio" aria-pressed="${f.ordem === 'sorteio'}">Sorteio</button><button data-acao="qfOrdem" data-v="ordem" aria-pressed="${f.ordem === 'ordem'}">Mais novas primeiro</button></div><button class="link" data-acao="qfLimpar">Limpar filtros</button></div>`)}
      <div class="entre contagem"><strong>${achadas.length.toLocaleString('pt-BR')} ${achadas.length === 1 ? 'questão' : 'questões'}${f.mat ? ' de ' + esc(f.mat) : ''}${f.assunto ? ' · ' + esc(f.assunto) : ''}</strong>
        <div class="linha"><button class="botao grande" data-acao="qGerar" ${achadas.length ? '' : 'disabled'}>Resolver${achadas.length ? ` (${Math.min(f.n, achadas.length)})` : ''}</button><button class="botao claro" data-acao="qVerLista" ${achadas.length ? '' : 'disabled'}>Ver a lista</button>${S.erros.length ? `<button class="botao claro" data-acao="qRefazerErros">Refazer meus erros (${S.erros.length})</button>` : ''}</div></div>
      ${ui.qLista ? listaQuestoes(achadas) : ''}` : ''}</section>
    <section class="cartao"><details class="det-q" data-k="iaq" ${ui.ab.iaq ? 'open' : ''}><summary>Completar o banco com questões feitas pela IA</summary><div class="det-corpo"><p class="fraco" style="margin:0">A IA escreve questões inéditas no estilo da banca e elas ficam guardadas no banco. Podem ter erros: confira.</p>
      <div class="linha"><label class="campo" style="flex:1 1 170px">Banca<select data-ui="qBanca">${BANCAS.map(b => `<option ${ui.qBanca === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        <label class="campo" style="flex:1 1 170px">Matéria<select data-ui="qMat">${Object.keys(MIN_Q).map(m => `<option ${ui.qMat === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="campo" style="flex:1 1 130px">Dificuldade<select data-ui="qDif">${['fácil', 'média', 'difícil'].map(d => `<option ${ui.qDif === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <div class="campo" style="flex:0 1 190px">Quantas questões<div class="linha">${stepperHtml('qia-n', ui.qNIa || 10, 1, 60)}</div></div></div>
      <label class="campo">Assunto<input type="text" data-ui="qTema" id="q-tema" value="${esc(ui.qTema)}" placeholder="Ex.: genética, leis de Mendel"></label>
      <div class="linha"><button class="botao" data-acao="qIaBanco">Gerar e guardar no banco</button></div></div></details></section>
    ${metaQTabela()}`;
}

function metaQTabela() {
  const q = S.qlog[hoje()] || {}, mats = Object.keys(MIN_Q).filter(m => metaQ(m) > 0);
  if (!mats.length) return '';
  return `<section class="cartao"><div class="entre"><h2>Metas de hoje</h2><span class="fraco" style="font-size:14px">Mude as metas em Ajustes</span></div>
    ${mats.map(m => { const f = q[m]?.f || 0, meta = metaQ(m); return `<div class="meta-linha" style="${cor(m)}"><span><i class="ponto"></i>${esc(m)}</span><span class="fraco">${f}/${meta}</span><div class="barra"><i style="width:${Math.min(100, Math.round(f / meta * 100))}%;background:var(--c)"></i></div></div>`; }).join('')}</section>`;
}

// ---------- questão com resolução e dúvidas ----------
function qQuestao() {
  const s = ui.qs, q = s.itens[s.i], resp = q.resp != null;
  if (ui.qPrevImg && ui.qPrevImg.id !== q.prev) ui.qPrevImg = null;
  const ia = q.res_ia ? `<div class="res-ia"><span class="rotulo">resolução pela IA</span><div class="enunciado" style="white-space:pre-wrap">${esc(q.res_ia)}</div></div>` : '';
  const duv = (q.duvidas || []).map(d => `<div class="msg u">${esc(d.p)}</div><div class="msg ia" style="white-space:pre-wrap">${esc(d.r)}</div>`).join('');
  return `<section class="cartao questao"><div class="entre"><span class="linha" style="gap:6px"><span class="tag" style="${cor(q.materia)}">${esc(q.materia)}</span>${q.assunto ? `<span class="selo">${esc(q.assunto)}</span>` : ''}</span><span class="fraco">${esc(q.fonte)}${q.num ? ' · nº ' + esc(q.num) : ''}</span></div>
    ${q.fig ? '<p class="fraco" style="margin:0;font-size:13px">⚠ Pode depender de uma figura que não está no banco. Se não der para resolver, pule.</p>' : ''}
    ${q.modo === 'objetivo' ? `${q.prev ? `<button class="link" data-acao="qPrev" style="align-self:flex-start">${ui.qPrevImg ? 'Esconder' : 'Ver'} o texto/figura da questão anterior (às vezes o texto-base está nela)</button>${ui.qPrevImg ? recorteObj(ui.qPrevImg, false) : ''}` : ''}
      ${recorteObj(q, false)}` : `<div class="enunciado">${mdLite(q.enunciado)}${(q.imagens || []).map(u => `<img class="q-img" src="${u}" alt="figura" loading="lazy">`).join('')}</div>${q.img ? `<a class="link" href="${esc(q.img)}" target="_blank" rel="noopener" style="align-self:flex-start;font-size:13px">ver a imagem original da prova</a>` : '' }`}
    <div class="alts ${q.modo === 'objetivo' ? 'so-letras' : ''}">${q.alts.map(a => { const sel = q.resp === a.l, certa = resp && a.l === q.gab, errada = resp && sel && a.l !== q.gab;
      return `<button class="alt ${sel ? 'sel' : ''} ${certa ? 'certa' : ''} ${errada ? 'errada' : ''}" data-acao="qResp" data-v="${a.l}" ${resp ? 'disabled' : ''}><b>${a.l}</b><span>${mdLite(a.t)}${a.img && /^https:/.test(a.img) ? `<img class="q-img" src="${a.img}" alt="">` : ''}</span></button>`; }).join('')}</div>
    ${resp ? `<div class="gabarito ${q.certo ? 'ok' : 'errou'}"><strong>${q.certo ? 'Acertou!' : `Errou. A certa era ${q.gab}.`}</strong>${q.coment ? `<p style="margin:6px 0 0;white-space:pre-wrap">${esc(q.coment)}</p>` : ''}</div>
      ${q.modo === 'objetivo' ? `<div class="coluna" style="gap:6px"><span class="rotulo">resolução comentada (Curso Objetivo)</span>${recorteObj(q, true)}</div>` : ''}` : ''}
    <div class="linha">${s.i > 0 ? '<button class="botao contorno" data-acao="qAnt">‹ Anterior</button>' : ''}<button class="botao contorno" data-acao="qRasc">${ui.qRasc ? 'Fechar o rascunho' : 'Rascunho à mão'}</button>
      ${resp ? `<button class="botao grande" data-acao="qProx">${s.i + 1 < s.itens.length ? 'Próxima' : 'Ver o resultado'}</button>` : `<button class="botao claro" data-acao="qPular">Pular</button>`}
      <button class="link" data-acao="qSair">Sair da lista</button></div>
    ${ui.qRasc ? quadroHtml('qtmp', 420, 'quadriculado') : ''}
    ${resp ? `<div class="ajuda-ia"><div class="linha"><button class="botao claro" data-acao="resolIa" ${ui.carregando ? 'disabled' : ''}>${q.res_ia ? 'Resolver de novo com a IA' : 'Ver a resolução pela IA'}</button></div>${ia}${duv ? `<div class="msgs-duv">${duv}</div>` : ''}
      <div class="linha" style="flex-wrap:nowrap;align-items:flex-end"><textarea id="duvida-txt" data-ui="duvidaTxt" rows="2" placeholder="Tire uma dúvida específica: por que a C está errada? Como eu faria sem calculadora?" style="min-height:56px">${esc(ui.duvidaTxt || '')}</textarea><button class="botao" data-acao="duvidaIa" ${ui.carregando ? 'disabled' : ''}>Perguntar</button></div></div>` : ''}</section>`;
}

/** Mostra só a parte da imagem do Objetivo que interessa: o enunciado (de cima até o corte) ou a resolução (do corte para baixo). */
function recorteObj(q, resolucao) {
  if (!q?.img || !q.w) return '';
  const alto = resolucao ? q.h - q.corte : q.corte;
  return `<div class="obj-recorte" style="aspect-ratio:${q.w}/${Math.max(20, alto)}"><img src="${esc(q.img)}" alt="${resolucao ? 'resolução' : 'questão'}" loading="lazy" style="${resolucao ? `margin-top:-${(q.corte / q.w * 100).toFixed(3)}%` : ''}"></div>`;
}

const textoQuestao = q => `Questão (${q.fonte}${q.materia ? ', ' + q.materia : ''}):\n${q.enunciado}\n\nAlternativas:\n${q.alts.map(a => `${a.l}) ${a.t}`).join('\n')}\n\nGabarito oficial: ${q.gab}.${q.coment ? '\nResolução existente: ' + q.coment : ''}`;
async function guardarNaQuestao(q, campos) { Object.assign(q, campos); try { const r = await BD.get(q.id); if (r) await BD.put([{ ...r, ...campos }]); } catch { } }

// ---------- ações ----------
async function baixarEnem() {
  BANCO.baixando = true; BANCO.msg = 'Baixando o ENEM… isso leva alguns minutos, mas só uma vez.'; render();
  let novas = 0;
  try {
    const anos = (await (await fetch('https://api.enem.dev/v1/exams')).json()).map(e => e.year).sort((a, b) => b - a);
    for (const ano of anos) {
      BANCO.msg = `Baixando o ENEM ${ano}… (${novas} questões novas até agora)`; render();
      const lote = [];
      for (let off = 0; off < 400; off += 50) {
        const r = await fetch(`https://api.enem.dev/v1/exams/${ano}/questions?limit=50&offset=${off}`, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) break;
        const j = await r.json();
        for (const q of j.questions || []) {
          if (!q.correctAlternative || !q.alternatives?.length) continue;
          const alts = q.alternatives.map(a => ({ l: a.letter, t: a.text || '', img: /^https:/.test(a.file || '') ? a.file : '' }));
          lote.push({ id: `enem-${ano}-${q.index}-${q.language || ''}`, banca: 'ENEM', tipo: 'real', ano, area: q.discipline, materia: '', assunto: q.language ? `Língua estrangeira: ${q.language}` : '',
            enunciado: [q.context, q.alternativesIntroduction].filter(Boolean).join('\n\n'), imagens: (q.files || []).filter(f => /^https:/.test(f)), alts, gab: q.correctAlternative, coment: '' });
        }
        if (!j.metadata?.hasMore) break;
      }
      novas += await adicionarQuestoes(lote);
    }
    BANCO.msg = `Pronto: ${novas} questões novas do ENEM no banco.`;
  } catch (e) { BANCO.msg = `O download parou (${e.message}). O que já veio ficou guardado; toque de novo para continuar.`; }
  BANCO.baixando = false; render();
}

function normalizarImportada(q, i) {
  // questões oficiais do Objetivo: a prova é a própria imagem (recortada até o enunciado); as alternativas são só as letras
  if (q && q.modo === 'objetivo' && /^https:/.test(q.img || '') && /^[A-E]$/.test(q.gab || '') && q.corte > 0) {
    const n = Math.max(2, Math.min(5, +q.nalts || 5));
    return { id: q.id, banca: String(q.banca), tipo: 'real', ano: +q.ano || 0, area: q.area || AREA_DA_MATERIA[q.materia] || '', materia: q.materia || '', assunto: q.assunto || '', dif: '', fig: 0,
      enunciado: String(q.enunciado || ''), imagens: [], alts: 'ABCDE'.slice(0, n).split('').map(l => ({ l, t: '', img: '' })), gab: q.gab, coment: '', fonte: 'Objetivo',
      modo: 'objetivo', img: q.img, w: +q.w, h: +q.h, corte: +q.corte, prev: q.prev || '', num: q.num || '', fase: q.fase || '' };
  }
  if (!q || !(q.enunciado || q.pergunta) || !Array.isArray(q.alts || q.alternativas)) return null;
  const bruto = q.alts || q.alternativas;
  const alts = bruto.map((a, k) => typeof a === 'string' ? { l: 'ABCDE'[k], t: a, img: '' } : { l: a.l || a.letra || 'ABCDE'[k], t: a.t || a.texto || '', img: a.img || '' });
  const gab = String(q.gab || q.gabarito || '').toUpperCase().trim();
  if (alts.length < 2 || !/^[A-E]$/.test(gab)) return null;
  return { id: q.id || `imp-${Date.now().toString(36)}-${i}`, banca: String(q.banca || 'Importada'), tipo: 'real', ano: +q.ano || 0, area: q.area || '', materia: q.materia || '', assunto: q.assunto || '', dif: q.dif || q.dificuldade || '', fig: q.fig ? 1 : 0,
    enunciado: String(q.enunciado || q.pergunta), imagens: (q.imagens || []).filter(u => /^(https:|data:image\/)/.test(u)), alts, gab, coment: String(q.coment || q.comentario || ''), fonte: q.fonte || '' };
}

Object.assign(ACOES, {
  bancoEnem: () => baixarEnem(),
  bancoAjuda: () => abrirModal(`<div class="entre"><h2>Como importar questões</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
    <p>Toque em <b>Importar arquivos</b> e escolha um ou vários arquivos .json (dá para escolher todos de uma vez). Os arquivos prontos ficam na pasta <b>C:\\rotina-banco</b> do computador do Felipe: é só mandar para o iPad (AirDrop ou iCloud Drive) e escolher aqui.</p>
    <p>Cada arquivo é uma lista de questões neste formato (campos extras são ignorados):</p>
    <pre class="codigo">[{ "banca": "Vunesp", "ano": 2024, "materia": "Biologia", "assunto": "Genética",
   "enunciado": "Texto da questão…",
   "alts": ["texto da A", "texto da B", "texto da C", "texto da D", "texto da E"],
   "gab": "C", "comentario": "resolução, se houver" }]</pre>
    <p class="fraco">Questões repetidas (mesmo id) não duplicam. Quanto maior o arquivo, mais demora: 15 mil questões levam cerca de 1 minuto.</p>`),
  qfBanca: el => { const f = ui.qf.bancas, v = el.dataset.v; ui.qf.bancas = f.includes(v) ? f.filter(x => x !== v) : [...f, v]; render(); },
  qfPreset: el => { ui.qf.preset = ui.qf.preset === el.dataset.v ? '' : el.dataset.v; render(); },
  qfArea: el => { ui.qf.area = el.dataset.v; render(); },
  qfSt: el => { ui.qf.st = el.dataset.v; render(); },
  qfFig: () => { ui.qf.semFig = !ui.qf.semFig; render(); },
  qfRes: () => { ui.qf.res = !ui.qf.res; render(); },
  qPrev: async () => {
    if (ui.qPrevImg) { ui.qPrevImg = null; render(); return; }
    const q = ui.qs.itens[ui.qs.i], r = q.prev && await BD.get(q.prev);
    ui.qPrevImg = r && r.img ? r : null; if (!ui.qPrevImg) ui.iaMsg = 'A questão anterior não está no banco.'; render();
  },
  qfOrdem: el => { ui.qf.ordem = el.dataset.v; render(); },
  qfLimpar: () => { ui.qf = { ...ui.qf, bancas: [], buscaBanca: '', preset: '', a0: '', a1: '', area: '', mat: '', assunto: '', st: 'todas', dif: '', tag: '' }; render(); },
  qN: el => { ui.qf.n = +el.dataset.v; render(); },
  qGerar: async () => {
    let l = filtrarBanco();
    l = ui.qf.ordem === 'ordem' ? l.slice().sort((a, b) => (a.a || 0) - (b.a || 0)) : l.slice().sort(() => Math.random() - 0.5);
    await ACOES.qIniciarIds(l.slice(0, Math.max(1, ui.qf.n)).map(m => m.id));
  },
  qIniciarIds: async ids => {
    const recs = (await Promise.all(ids.map(id => BD.get(id)))).filter(Boolean);
    const itens = recs.map(q => ({ id: q.id, fonte: `${q.banca}${q.ano ? ' ' + q.ano : ''}${q.tipo === 'ia' ? ' · IA' : ''}`, materia: q.materia || (q.area ? rotuloArea(q.area) + ' (' + q.banca + ')' : 'Questão'),
      enunciado: q.enunciado, imagens: q.imagens || [], alts: q.alts, gab: q.gab, coment: q.coment || '', fig: q.fig, res_ia: q.res_ia || '', duvidas: q.duvidas || [],
      modo: q.modo || '', img: q.img || '', w: q.w, h: q.h, corte: q.corte, prev: q.prev || '', assunto: q.assunto || '', num: q.num || '' }));
    if (itens.length) iniciarSessao(itens);
  },
  qIaBanco: async () => {
    ui.qTema = ($('#q-tema')?.value ?? ui.qTema).trim(); const n = Math.max(1, Math.min(60, Math.round(+$('#qia-n')?.value || +ui.qNIa || 10))); ui.qNIa = n;
    ui.iaMsg = '';
    try {
      // pede em lotes de 6 até chegar na quantidade escolhida
      const novas = []; let erro = '';
      for (let t = 0; novas.length < n && t < 14; t++) {
        ui.carregando = `A IA está escrevendo as questões… ${novas.length} de ${n}`; render();
        try {
          const lote = await listaIa(ui.qBanca, ui.qMat, ui.qTema + (novas.length ? ` (varie o subtópico; não repita: ${novas.slice(-12).map(q => q.enunciado.slice(0, 60)).join(' | ')})` : ''), Math.min(6, n - novas.length), ui.qDif);
          if (!lote.length) break;
          novas.push(...lote.map((q, i) => ({ ...q, id: `ia-${Date.now().toString(36)}-${novas.length + i}`, banca: ui.qBanca, tipo: 'ia', ano: new Date().getFullYear(), area: AREA_DA_MATERIA[ui.qMat] || '', materia: ui.qMat, assunto: ui.qTema })));
        } catch (e) { erro = e.message; break; }
      }
      if (!novas.length) throw new Error(erro || 'não veio nenhuma questão');
      if (novas.length < n) ui.iaMsg = `Vieram ${novas.length} de ${n} (${erro || 'a IA parou'}).`;
      await adicionarQuestoes(novas); ui.carregando = '';
      ui.iaMsg = `${novas.length} questões guardadas no banco.`; iniciarSessao(novas.map(q => ({ id: q.id, fonte: `IA · estilo ${q.banca}`, materia: q.materia, enunciado: q.enunciado, imagens: [], alts: q.alts, gab: q.gab, coment: q.coment, res_ia: '', duvidas: [] })), { assuntoId: ui.qTema ? ui.qAssuntoId : null });
    } catch (e) { ui.carregando = ''; ui.iaMsg = `Não consegui gerar agora (${e.message}).`; render(); }
  },
  resolIa: async () => {
    const q = ui.qs.itens[ui.qs.i]; ui.carregando = 'A IA está resolvendo…'; render();
    try {
      const r = await chamarIa(`Resolva esta questão de vestibular para uma estudante de Medicina, em português do Brasil, de forma clara e organizada: (1) o que a questão pede; (2) o raciocínio passo a passo até a alternativa certa (o gabarito oficial é dado: se o seu raciocínio chegar em outra, diga a dúvida); (3) em uma linha cada, por que as outras alternativas estão erradas; (4) o conceito para fixar. Use texto simples, sem tabelas. Vá direto ao conteúdo: sem saudação, sem comentar prazos ou provas.\n\n${textoQuestao(q)}\n\nResponda SÓ com JSON: {"resolucao":"..."}`, 3500, [], 'texto');
      await guardarNaQuestao(q, { res_ia: String(r.resolucao || '').trim() });
    } catch (e) { ui.iaMsg = `Não consegui resolver agora (${e.message}).`; }
    ui.carregando = ''; render();
  },
  duvidaIa: async () => {
    const q = ui.qs.itens[ui.qs.i], p = ($('#duvida-txt')?.value || ui.duvidaTxt || '').trim(); if (!p) return;
    ui.duvidaTxt = ''; ui.carregando = 'A IA está pensando…'; render();
    try {
      const hist = (q.duvidas || []).slice(-3).map(d => `Ela: ${d.p}\nVocê: ${d.r}`).join('\n');
      const r = await chamarIa(`${textoQuestao(q)}\n${q.res_ia ? '\nResolução já dada: ' + q.res_ia : ''}\n${hist ? '\nConversa até aqui:\n' + hist : ''}\n\nDúvida dela: ${p}\nResponda de forma direta, didática e correta, em português do Brasil, só ao que foi perguntado, sem saudação nem comentários sobre prazos ou provas. Responda SÓ com JSON: {"resposta":"..."}`, 2500, [], 'texto');
      await guardarNaQuestao(q, { duvidas: [...(q.duvidas || []), { p, r: String(r.resposta || '').trim() }] });
    } catch (e) { ui.iaMsg = `Não consegui responder agora (${e.message}).`; ui.duvidaTxt = p; }
    ui.carregando = ''; render();
  },
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.qf) { const k = el.dataset.qf; ui.qf[k] = k === 'n' ? Math.max(1, Math.min(200, +el.value || 10)) : el.value; render(); }
  if (el.dataset.acaoArquivo === 'bancoImportar' && el.files?.length) {
    const arquivos = [...el.files]; BANCO.msg = 'Importando…'; render();
    (async () => {
      let total = 0, ignoradas = 0;
      for (const arq of arquivos) {
        try {
          BANCO.msg = `Lendo ${arq.name}…`; render();
          const txt = /\.gz$/i.test(arq.name) ? await new Response(arq.stream().pipeThrough(new DecompressionStream('gzip'))).text() : await arq.text();
          const j = JSON.parse(txt), lista = Array.isArray(j) ? j : j.questoes || [];
          const ok = lista.map(normalizarImportada).filter(Boolean); ignoradas += lista.length - ok.length;
          BANCO.msg = `Guardando ${ok.length.toLocaleString('pt-BR')} questões de ${arq.name}…`; render();
          total += await adicionarQuestoes(ok);
        } catch (err) { BANCO.msg = `Não consegui ler ${arq.name}: ${err.message}`; render(); }
      }
      BANCO.msg = `${total.toLocaleString('pt-BR')} questões novas no banco${BANCO.repetidas ? ` · ${BANCO.repetidas.toLocaleString('pt-BR')} repetidas ignoradas` : ''}${ignoradas ? ` (${ignoradas} ignoradas por formato)` : ''}.`; render();
    })();
  }
});

// ---------- assuntos e lista de questões (banco "normal": escolhe matéria, assunto, vê a lista) ----------
/** Assuntos de uma matéria com quantidade de questões, na ordem do plano de estudos (os sem questão ficam de fora). */
function assuntosDe(mat, itens) {
  const c = {}; for (const q of itens) if (q.m === mat && q.as) c[q.as] = (c[q.as] || 0) + 1;
  const ordem = (typeof CONTEUDO !== 'undefined' && CONTEUDO[mat]) || [];
  return [...ordem.filter(a => c[a]).map(a => [a, c[a]]), ...Object.entries(c).filter(([a]) => !ordem.includes(a)).sort((x, y) => y[1] - x[1])];
}
const ordenarLista = l => l.slice().sort((a, b) => (b.a || 0) - (a.a || 0) || String(a.b).localeCompare(String(b.b)) || (+a.n || 0) - (+b.n || 0));
function listaQuestoes(achadas) {
  const l = ordenarLista(achadas), pg = ui.qPag || 0, por = 20, ini = pg * por, fatia = l.slice(ini, ini + por);
  return `<div class="lista-q"><div class="entre"><span class="rotulo">lista · ${ini + 1} a ${Math.min(l.length, ini + por)} de ${l.length.toLocaleString('pt-BR')}</span>
    <div class="linha"><button class="botao contorno" data-acao="qPag" data-v="-1" ${pg ? '' : 'disabled'}>‹</button><button class="botao contorno" data-acao="qPag" data-v="1" ${ini + por < l.length ? '' : 'disabled'}>›</button></div></div>
    ${fatia.map((q, i) => { const h = S.qh[q.id];
      return `<button class="linha-q" data-acao="qComecarDe" data-i="${ini + i}"><span class="st ${h ? (h.ok ? 'ok' : 'x') : ''}" title="${h ? (h.ok ? 'você acertou' : 'você errou') : 'ainda não feita'}"></span>
        <span class="lq-corpo"><strong>${esc(q.b)} ${q.a || ''}${q.n ? ' · nº ' + esc(q.n) : ''}</strong><small class="fraco">${esc(q.m || '')}${q.as ? ' · ' + esc(q.as) : ''}</small>
        ${q.x ? `<small class="lq-texto">${esc(q.x.slice(0, 140))}…</small>` : ''}</span></button>`; }).join('')}</div>`;
}
Object.assign(ACOES, {
  qfMat: el => { ui.qf.mat = el.dataset.v; ui.qf.assunto = ''; ui.qPag = 0; render(); },
  qfAssunto: el => { ui.qf.assunto = el.dataset.v; ui.qPag = 0; render(); },
  qVerLista: () => { ui.qLista = !ui.qLista; ui.qPag = 0; render(); },
  qPag: el => { ui.qPag = Math.max(0, (ui.qPag || 0) + +el.dataset.v); render(); },
  qComecarDe: async el => {
    const l = ordenarLista(filtrarBanco()), i = +el.dataset.i, ids = l.slice(i, i + Math.min(ui.qf.n, 50)).map(m => m.id);
    await ACOES.qIniciarIds(ids);
  },
});

// fórmulas (LaTeX das provas)
// fórmulas (LaTeX das provas) viram matemática de verdade quando o KaTeX carrega (precisa de internet na primeira vez)
function tipografarMath() {
  if (!window.renderMathInElement) return;
  const el = document.getElementById('tela'); if (!el) return;
  try { window.renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }, { left: '$', right: '$', display: false }], throwOnError: false }); } catch { }
}
{ const r1 = render; render = function () { r1.apply(this, arguments); tipografarMath(); }; }
window.addEventListener('load', () => setTimeout(() => render(), 300));
render();
