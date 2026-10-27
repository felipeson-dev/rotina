'use strict';
/* Banco de questões: milhares de questões ficam no aparelho (IndexedDB "rotina-banco") e são filtradas sem internet.
   Em memória fica só uma ficha leve de cada questão (BANCO.itens); o texto completo é lido do banco ao montar a lista.
   Fontes: ENEM (baixado da API aberta enem.dev), questões geradas pela IA e arquivos JSON importados (ferramentas/montar_banco.py gera os arquivos).
   Questão: { id, banca, ano, area, materia, assunto, dif, fig, enunciado, imagens[], alts:[{l,t,img}], gab, coment, res_ia, duvidas }. */

S.qh ||= {}; // histórico por questão: { id: { ok, dia, n, ac, er, h: [[dia, 1|0, letra]] } }
const BANCO = { itens: [], pronto: false, carregando: false, msg: '', baixando: false };
ui.qf = { assunto: '', mat: '', banca: '', ano: '', st: 'todas', tag: '', semFig: true, res: false, n: 10, ordem: 'sorteio' };

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
  async del(ids) { const db = await this.abrir(); return new Promise(ok => { const t = db.transaction('q', 'readwrite'), s = t.objectStore('q'); ids.forEach(id => s.delete(id)); t.oncomplete = ok; t.onerror = ok; }); },
  async cada(fn) { const db = await this.abrir(); return new Promise(ok => { const r = db.transaction('q').objectStore('q').openCursor(); r.onsuccess = () => { const c = r.result; if (!c) return ok(); fn(c.value); c.continue(); }; r.onerror = () => ok(); }); },
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
/** Começo do enunciado para a lista (sem fórmulas nem marcações). */
const previa = s => String(s || '').replace(/\$\$?[^$]*\$\$?/g, ' [fórmula] ').replace(/[*_#|>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 130);
const META_V = 2;   // muda quando a ficha leve ganha campos: refaz as fichas a partir das questões guardadas
const metaDe = q => ({ id: q.id, k: chaveQ(q), b: q.banca || 'Outra', a: q.ano || 0, ar: q.area || '', m: q.materia || '', s: normBusca(q.assunto).slice(0, 140), as: q.assunto || '', x: normBusca(q.enunciado).slice(0, 400), p: previa(q.enunciado), n: q.num || '', d: q.dif || '', t: q.tipo === 'ia' ? 'ia' : 'real', f: q.fig ? 1 : 0, r: q.modo === 'objetivo' || q.coment ? 1 : 0, v: +q.v || 0 });

async function carregarBanco() {
  if (BANCO.pronto || BANCO.carregando) return;
  BANCO.carregando = true;
  try {
    BANCO.itens = await BD.meta();
    if (BANCO.itens.length && (await DB.get('banco:metav')) !== META_V) {
      const novas = []; await BD.cada(q => novas.push(metaDe(q))); BANCO.itens = novas; await BD.setMeta(novas);
    }
    DB.set('banco:metav', META_V);
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
  const pos = new Map(BANCO.itens.map((m, i) => [m.id, i])), atual = [];
  // versão melhor de uma questão que já está no banco (a mesma questão agora em texto, "v" maior) ou que ganhou assunto: troca,
  // guardando o que ela já fez nela (resolução da IA e dúvidas). O histórico de acertos continua, porque o id é o mesmo.
  for (const q of lista) {
    const i = q && pos.get(q.id); if (i == null) continue;
    const m = BANCO.itens[i];
    if ((q.v || 0) > (m.v || 0) || (q.assunto && !m.as)) {
      const velho = await BD.get(q.id);
      atual.push(velho ? { ...q, res_ia: velho.res_ia || q.res_ia || '', duvidas: velho.duvidas || q.duvidas || [] } : q); BANCO.itens[i] = metaDe(q);
    }
  }
  // a versão de teste (id "tx-…") sai quando chega a definitiva, para não ficar repetida
  const teste = new Set(lista.filter(q => q && q.v >= 2 && pos.has('tx-' + q.id)).map(q => 'tx-' + q.id));
  if (teste.size) { BANCO.itens = BANCO.itens.filter(m => !teste.has(m.id)); await BD.del([...teste]); }
  if (atual.length) { await BD.put(atual); BANCO.atualizadas = (BANCO.atualizadas || 0) + atual.length; }
  const ja = new Set(BANCO.itens.map(m => m.id)), ks = new Set(BANCO.itens.map(m => m.k).filter(Boolean)), novos = [];
  for (const q of lista) { if (!q || !q.id || ja.has(q.id)) continue; const k = chaveQ(q); if (ks.has(k)) { BANCO.repetidas = (BANCO.repetidas || 0) + 1; continue; } ja.add(q.id); ks.add(k); novos.push(q); }
  if (novos.length) { await BD.put(novos); BANCO.itens.push(...novos.map(metaDe)); }
  if (novos.length || atual.length || teste.size) await BD.setMeta(BANCO.itens);
  return novos.length;
}
/** Histórico de uma questão: { ok, dia (última vez), n, ac, er, h: [[dia, 1|0, letra]] } (os registros antigos só tinham ok/dia/n). */
function histDe(id) {
  const h = S.qh[id]; if (!h) return null;
  return { ...h, ac: h.ac ?? (h.ok ? 1 : 0), er: h.er ?? (h.ok ? 0 : 1), h: h.h || [[h.dia, h.ok ? 1 : 0]] };
}
const SITUACOES = [['todas', 'Todas'], ['novas', 'Ainda não fiz'], ['feitas', 'Já fiz'], ['erradas', 'Errei na última vez'], ['acertadas', 'Acertei na última vez'], ['jaerrei', 'Já errei alguma vez']];
function situacaoOk(st, id) {
  if (!st || st === 'todas') return true;
  const h = S.qh[id];
  if (st === 'novas') return !h;
  if (!h) return false;
  return st === 'feitas' || (st === 'erradas' && !h.ok) || (st === 'acertadas' && h.ok) || (st === 'jaerrei' && (!h.ok || (h.er ?? 0) > 0));
}

function filtrarBanco(troca = {}) {
  const f = { ...ui.qf, ...troca }, toks = tokensBusca(f.tag);
  const bs = f.banca || '', pre = bs.startsWith('p:') ? PRESETS_BANCA[bs.slice(2)]?.[1] : null, b1 = bs.startsWith('b:') ? bs.slice(2) : '';
  const an = f.ano || '', desde = an.startsWith('d:') ? +an.slice(2) : 0, so = an.startsWith('a:') ? +an.slice(2) : 0;
  return BANCO.itens.filter(q => {
    if (b1 && q.b !== b1) return false;
    if (pre && !pre.test(q.b)) return false;
    if (desde && !(q.a >= desde)) return false;
    if (so && q.a !== so) return false;
    if (f.mat && q.m !== f.mat) return false;
    if (f.assunto && q.as !== f.assunto) return false;
    if (f.semFig && q.f) return false;
    if (f.res && !q.r) return false;
    if (toks.length) { const alvo = q.s + ' ' + (q.x || '') + ' ' + normBusca(q.b) + ' ' + normBusca(q.m); if (!toks.every(w => alvo.includes(w))) return false; }
    return situacaoOk(f.st, q.id);
  });
}

// ---------- tela de escolher questões: caixas de seleção, tudo num lugar só ----------
function contar(lista, campo) { const c = {}; for (const q of lista) { const k = q[campo]; if (k) c[k] = (c[k] || 0) + 1; } return c; }
const opcao = (v, t, atual) => `<option value="${esc(v)}" ${String(atual ?? '') === String(v) ? 'selected' : ''}>${esc(t)}</option>`;
const milhar = n => n.toLocaleString('pt-BR');

function qMontar() {
  if (!BANCO.pronto) { carregarBanco(); return '<section class="cartao"><p class="fraco" style="margin:0">Abrindo o banco de questões…</p></section>'; }
  const f = ui.qf, todos = BANCO.itens;
  if (!todos.length) return `<section class="cartao"><h2>Escolher questões</h2><p style="margin:0">O banco está vazio. Importe os arquivos de questões ou baixe o ENEM logo abaixo.</p></section><!--meta-->${cartaoBanco(true)}`;
  const achadas = filtrarBanco();
  // cada caixa mostra quantas questões há em cada opção, já considerando as outras caixas
  const semMat = filtrarBanco({ mat: '', assunto: '' }), semSt = filtrarBanco({ st: 'todas' }), semBanca = filtrarBanco({ banca: '' }), semAno = filtrarBanco({ ano: '' });
  const porMat = contar(semMat, 'm'), porBanca = contar(semBanca, 'b'), porAno = contar(semAno, 'a');
  const anos = Object.keys(porAno).map(Number).filter(Boolean).sort((a, b) => b - a);
  const caixa = (rot, id, html, ativo, extra = '') => `<label class="filtro ${ativo ? 'ativo' : ''}"><span>${rot}</span><select data-qf="${id}" ${extra}>${html}</select></label>`;
  const nSt = v => semSt.filter(q => situacaoOk(v, q.id)).length;
  const nAno = d => semAno.filter(q => q.a >= d).length;
  const algum = f.mat || f.banca || f.ano || (f.st && f.st !== 'todas') || f.tag || f.res;
  return `<section class="cartao escolher"><div class="entre"><h2>Escolher questões</h2>${algum ? '<button class="link" data-acao="qfLimpar">Limpar filtros</button>' : ''}</div>
    <div class="filtros">
      ${caixa('Matéria', 'mat', opcao('', `Todas as matérias (${milhar(semMat.length)})`, f.mat) + Object.entries(porMat).sort((a, b) => a[0].localeCompare(b[0])).map(([m, n]) => opcao(m, `${m} (${milhar(n)})`, f.mat)).join(''), f.mat)}
      ${caixa('Assunto', 'assunto', f.mat ? opcao('', 'Todos os assuntos', f.assunto) + assuntosDe(f.mat, semMat).map(([a, n]) => opcao(a, `${a} (${n})`, f.assunto)).join('') : opcao('', 'Escolha a matéria antes', ''), f.assunto, f.mat ? '' : 'disabled')}
      ${caixa('Situação', 'st', SITUACOES.map(([v, t]) => opcao(v, `${t} (${milhar(nSt(v))})`, f.st || 'todas')).join(''), f.st && f.st !== 'todas')}
      ${caixa('Banca', 'banca', opcao('', 'Todas as bancas', f.banca) + `<optgroup label="Grupos">${Object.entries(PRESETS_BANCA).map(([k, [t, re]]) => opcao('p:' + k, `${t} (${milhar(semBanca.filter(q => re.test(q.b)).length)})`, f.banca)).join('')}</optgroup>`
        + `<optgroup label="Banca">${Object.entries(porBanca).sort((a, b) => b[1] - a[1]).map(([b, n]) => opcao('b:' + b, `${b} (${milhar(n)})`, f.banca)).join('')}</optgroup>`, f.banca)}
      ${caixa('Ano', 'ano', opcao('', 'Qualquer ano', f.ano) + `<optgroup label="A partir de">${[2020, 2015, 2010].filter(d => anos.some(a => a >= d)).map(d => opcao('d:' + d, `${d} em diante (${milhar(nAno(d))})`, f.ano)).join('')}</optgroup>`
        + `<optgroup label="Só um ano">${anos.map(a => opcao('a:' + a, `${a} (${porAno[a]})`, f.ano)).join('')}</optgroup>`, f.ano)}
      ${caixa('Ordem', 'ordem', [['sorteio', 'Sorteadas'], ['novas', 'Mais recentes primeiro'], ['antigas', 'Mais antigas primeiro']].map(([v, t]) => opcao(v, t, f.ordem)).join(''), false)}
    </div>
    <label class="filtro busca"><span>Procurar no texto</span><input type="search" data-qf="tag" value="${esc(f.tag)}" placeholder="Ex.: função quadrática, Segundo Reinado, mitose"></label>
    <div class="linha marcas"><label class="marca-q"><input type="checkbox" data-qf-marca="semFig" ${f.semFig ? 'checked' : ''}> Esconder as que dependem de figura que não veio</label>
      <label class="marca-q"><input type="checkbox" data-qf-marca="res" ${f.res ? 'checked' : ''}> Só com resolução</label></div>
    <div class="acao-q"><div class="coluna" style="gap:0"><strong class="n-achadas">${milhar(achadas.length)}</strong><span class="fraco">${achadas.length === 1 ? 'questão encontrada' : 'questões encontradas'}</span></div>
      <label class="filtro quantas"><span>Quantas</span><select data-qf="n">${[5, 10, 15, 20, 30, 50].map(n => opcao(n, String(n), f.n)).join('')}${opcao(9999, 'Todas', f.n >= 9999 ? 9999 : f.n)}</select></label>
      <button class="botao grande" data-acao="qGerar" ${achadas.length ? '' : 'disabled'}>Resolver${achadas.length ? ` ${Math.min(f.n, achadas.length)}` : ''}</button>
      <button class="botao claro" data-acao="qVerLista" ${achadas.length ? '' : 'disabled'}>${ui.qLista ? 'Esconder a lista' : 'Ver a lista'}</button></div>
    ${ui.qLista ? listaQuestoes(achadas) : ''}</section><!--meta-->${cartaoBanco(false)}`;
}

/** Importar, baixar o ENEM e gerar com a IA: fica fechado no fim da tela. */
function cartaoBanco(aberto) {
  const todos = BANCO.itens, porMat = contar(todos, 'm');
  return `<section class="cartao">${detalhe('bancoinfo', `Banco de questões · ${milhar(todos.length)} questões · importar`, `
      ${todos.length ? `<div class="linha">${Object.entries(porMat).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<span class="tag" style="${cor(m)}">${esc(m)} · ${milhar(n)}</span>`).join('')}</div>` : ''}
      ${BANCO.msg ? `<p style="margin:0">${esc(BANCO.msg)}</p>` : ''}
      <div class="linha"><label class="botao claro" style="display:inline-flex;align-items:center">Importar arquivos<input type="file" accept="application/json,.json,.gz,application/gzip" multiple data-acao-arquivo="bancoImportar" hidden></label>
        <button class="botao claro" data-acao="bancoEnem" ${BANCO.baixando ? 'disabled' : ''}>${BANCO.baixando ? 'Baixando…' : todos.some(q => q.b === 'ENEM') ? 'Atualizar ENEM' : 'Baixar o ENEM (2009–2023)'}</button>
        <button class="link" data-acao="bancoAjuda">Como importar?</button></div>`).replace('<details ', aberto || BANCO.msg ? '<details open ' : '<details ')}
    ${detalhe('iaq', 'Criar questões novas com a IA', `<p class="fraco" style="margin:0">A IA escreve questões inéditas no estilo da banca e elas ficam guardadas no banco. Podem ter erros: confira.</p>
      <div class="linha"><label class="campo" style="flex:1 1 170px">Banca<select data-ui="qBanca">${BANCAS.map(b => `<option ${ui.qBanca === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        <label class="campo" style="flex:1 1 170px">Matéria<select data-ui="qMat">${Object.keys(MIN_Q).map(m => `<option ${ui.qMat === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="campo" style="flex:1 1 130px">Dificuldade<select data-ui="qDif">${['fácil', 'média', 'difícil'].map(d => `<option ${ui.qDif === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <div class="campo" style="flex:0 1 190px">Quantas questões<div class="linha">${stepperHtml('qia-n', ui.qNIa || 10, 1, 60)}</div></div></div>
      <label class="campo">Assunto<input type="text" data-ui="qTema" id="q-tema" value="${esc(ui.qTema)}" placeholder="Ex.: genética, leis de Mendel"></label>
      <div class="linha"><button class="botao" data-acao="qIaBanco">Gerar e guardar no banco</button></div>`)}</section>`;
}

function metaQTabela() {
  const q = S.qlog[hoje()] || {}, mats = Object.keys(MIN_Q).filter(m => metaQ(m) > 0);
  if (!mats.length) return '';
  return `<section class="cartao"><div class="entre"><h2>Metas de hoje</h2><span class="fraco" style="font-size:14px">Mude as metas em Ajustes</span></div>
    ${mats.map(m => { const f = q[m]?.f || 0, meta = metaQ(m); return `<div class="meta-linha" style="${cor(m)}"><span><i class="ponto"></i>${esc(m)}</span><span class="fraco">${f}/${meta}</span><div class="barra"><i style="width:${Math.min(100, Math.round(f / meta * 100))}%;background:var(--c)"></i></div></div>`; }).join('')}</section>`;
}

// ---------- questão com resolução e dúvidas ----------
/** Linha "Seu histórico": ✓ 12/10 · ✗ 20/10 (as últimas vezes que fez esta questão). */
function histHtml(id) {
  const h = id && histDe(id); if (!h) return '';
  return `<div class="q-hist"><span class="fraco">Seu histórico nesta questão:</span>${h.h.slice(-6).map(([d, ok, l]) => `<span class="${ok ? 'h-ok' : 'h-er'}">${ok ? '✓' : '✗'} ${diaCurto(d)}${l ? ' (' + esc(l) + ')' : ''}</span>`).join('')}</div>`;
}

/** Números das questões da lista: verde = acertou, vermelho = errou, contorno = atual. Toque para ir direto. */
function mapaSessao(s) {
  const n = s.itens.length; if (n < 2) return '';
  let ini = 0, fim = n;
  if (n > 25) { ini = Math.max(0, Math.min(s.i - 12, n - 25)); fim = ini + 25; }
  const bt = j => { const q = s.itens[j]; return `<button class="${q.resp == null ? '' : q.certo ? 'h-ok' : 'h-er'} ${j === s.i ? 'atual' : ''}" data-acao="qIr" data-i="${j}" aria-label="Questão ${j + 1}">${j + 1}</button>`; };
  return `<nav class="q-mapa" aria-label="Questões da lista">${ini ? '<span>…</span>' : ''}${Array.from({ length: fim - ini }, (_, k) => bt(ini + k)).join('')}${fim < n ? '<span>…</span>' : ''}</nav>`;
}

/** Texto-base da questão anterior: em imagem (modo objetivo) ou em texto. */
const prevHtml = r => r.modo === 'objetivo' ? recorteObj(r, false) : `<div class="enunciado q-prev">${mdLite(r.enunciado)}${(r.imagens || []).map(u => `<img class="q-img" src="${u}" alt="figura" loading="lazy">`).join('')}</div>`;
function qQuestao() {
  const s = ui.qs, q = s.itens[s.i], resp = q.resp != null, ultima = s.i + 1 >= s.itens.length;
  if (ui.qPrevImg && ui.qPrevImg.id !== q.prev) ui.qPrevImg = null;
  const ia = q.res_ia ? `<div class="res-ia"><span class="rotulo">resolução pela IA</span><div class="enunciado">${mdLite(q.res_ia)}</div></div>` : '';
  const duv = (q.duvidas || []).map(d => `<div class="msg u">${esc(d.p)}</div><div class="msg ia">${mdLite(d.r)}</div>`).join('');
  const nav = `<div class="q-nav"><button class="botao contorno" data-acao="qAnt" ${s.i ? '' : 'disabled'}>‹ Anterior</button>
      <button class="botao contorno" data-acao="qRasc">${ui.qRasc ? 'Fechar rascunho' : 'Rascunho'}</button>
      <button class="botao ${resp ? 'grande' : 'claro'}" data-acao="qProx">${ultima ? 'Terminar' : 'Próxima ›'}</button></div>`;
  return `${mapaSessao(s)}<section class="cartao questao"><div class="entre"><span class="linha" style="gap:6px"><span class="tag" style="${cor(q.materia)}">${esc(q.materia)}</span>${q.assunto ? `<span class="selo">${esc(q.assunto)}</span>` : ''}</span><span class="fraco">${esc(q.fonte)}${q.num ? ' · nº ' + esc(q.num) : ''}</span></div>
    ${histHtml(q.id)}
    ${q.fig ? '<p class="fraco" style="margin:0;font-size:13px">⚠ Pode depender de um texto ou figura de outra questão. Se não der para resolver, vá para a próxima.</p>' : ''}
    ${q.modo === 'objetivo' ? `${q.prev ? `<button class="link" data-acao="qPrev" style="align-self:flex-start">${ui.qPrevImg ? 'Esconder' : 'Ver'} o texto/figura da questão anterior (às vezes o texto-base está nela)</button>${ui.qPrevImg ? prevHtml(ui.qPrevImg) : ''}` : ''}
      ${recorteObj(q, false)}` : `${q.prev && q.dep ? `<button class="link" data-acao="qPrev" style="align-self:flex-start">${ui.qPrevImg ? 'Esconder' : 'Ler'} o texto da questão anterior (o texto-base desta questão está nela)</button>${ui.qPrevImg ? prevHtml(ui.qPrevImg) : ''}` : ''}<div class="enunciado">${mdLite(q.enunciado)}${(q.imagens || []).map(u => `<img class="q-img" src="${u}" alt="figura" loading="lazy">`).join('')}</div>${q.img ? `<a class="link" href="${esc(q.img)}" target="_blank" rel="noopener" style="align-self:flex-start;font-size:13px">ver a imagem original da prova</a>` : ''}`}
    <div class="alts ${q.modo === 'objetivo' ? 'so-letras' : ''}">${q.alts.map(a => { const sel = q.resp === a.l, certa = resp && a.l === q.gab, errada = resp && sel && a.l !== q.gab;
      return `<button class="alt ${sel ? 'sel' : ''} ${certa ? 'certa' : ''} ${errada ? 'errada' : ''}" data-acao="qResp" data-v="${a.l}" ${resp ? 'disabled' : ''}><b>${a.l}</b><span>${mdLite(a.t)}${a.img && /^https:/.test(a.img) ? `<img class="q-img" src="${a.img}" alt="">` : ''}</span></button>`; }).join('')}</div>
    ${resp ? `<div class="gabarito ${q.certo ? 'ok' : 'errou'}"><strong>${q.certo ? 'Acertou!' : `Errou. A certa era ${q.gab}.`}</strong>${q.coment ? `<div class="resolucao">${mdLite(q.coment)}</div>` : ''}</div>
      ${q.modo === 'objetivo' ? `<div class="coluna" style="gap:6px"><span class="rotulo">resolução comentada (Curso Objetivo)</span>${recorteObj(q, true)}</div>` : ''}` : ''}
    ${nav}
    ${ui.qRasc ? quadroHtml('qtmp', 420, 'quadriculado') : ''}
    ${resp ? detalhe('qia', `Perguntar à IA${q.res_ia || duv ? ' · já tem resposta aqui' : ''}`, `<div class="ajuda-ia"><div class="linha"><button class="botao claro" data-acao="resolIa" ${ui.carregando ? 'disabled' : ''}>${q.res_ia ? 'Resolver de novo com a IA' : 'Ver a resolução pela IA'}</button></div>${ia}${duv ? `<div class="msgs-duv">${duv}</div>` : ''}
      <div class="linha" style="flex-wrap:nowrap;align-items:flex-end"><textarea id="duvida-txt" data-ui="duvidaTxt" rows="2" placeholder="Tire uma dúvida específica: por que a C está errada? Como eu faria sem calculadora?" style="min-height:56px">${esc(ui.duvidaTxt || '')}</textarea><button class="botao" data-acao="duvidaIa" ${ui.carregando ? 'disabled' : ''}>Perguntar</button></div></div>`) : ''}</section>`;
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
      modo: 'objetivo', img: q.img, w: +q.w, h: +q.h, corte: +q.corte, prev: q.prev || '', num: q.num || '', fase: q.fase || '', v: +q.v || 0 };
  }
  if (!q || !(q.enunciado || q.pergunta) || !Array.isArray(q.alts || q.alternativas)) return null;
  const bruto = q.alts || q.alternativas;
  const alts = bruto.map((a, k) => typeof a === 'string' ? { l: 'ABCDE'[k], t: a, img: '' } : { l: a.l || a.letra || 'ABCDE'[k], t: a.t || a.texto || '', img: a.img || '' });
  const gab = String(q.gab || q.gabarito || '').toUpperCase().trim();
  if (alts.length < 2 || !/^[A-E]$/.test(gab)) return null;
  return { id: q.id || `imp-${Date.now().toString(36)}-${i}`, banca: String(q.banca || 'Importada'), tipo: 'real', ano: +q.ano || 0, area: q.area || '', materia: q.materia || '', assunto: q.assunto || '', dif: q.dif || q.dificuldade || '', fig: q.fig ? 1 : 0,
    enunciado: String(q.enunciado || q.pergunta), imagens: (q.imagens || []).filter(u => /^(https:|data:image\/)/.test(u)), alts, gab, coment: String(q.coment || q.comentario || ''), fonte: q.fonte || '',
    img: /^https:/.test(q.img || '') ? q.img : '', num: q.num || '', fase: q.fase || '', prev: q.prev || '', dep: q.dep ? 1 : 0, v: +q.v || 0 };
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
  qPrev: async () => {
    if (ui.qPrevImg) { ui.qPrevImg = null; render(); return; }
    const q = ui.qs.itens[ui.qs.i], r = q.prev && await BD.get(q.prev);
    ui.qPrevImg = r || null; if (!ui.qPrevImg) ui.iaMsg = 'A questão anterior não está no banco.'; render();
  },
  qfLimpar: () => { ui.qf = { ...ui.qf, mat: '', assunto: '', banca: '', ano: '', st: 'todas', tag: '', res: false }; ui.qPag = 0; render(); },
  qGerar: async () => {
    let l = filtrarBanco();
    l = ui.qf.ordem === 'sorteio' || !ui.qf.ordem ? l.slice().sort(() => Math.random() - 0.5) : ordenarLista(l);
    await ACOES.qIniciarIds(l.slice(0, Math.max(1, ui.qf.n)).map(m => m.id));
  },
  qIniciarIds: async ids => {
    const recs = (await Promise.all(ids.map(id => BD.get(id)))).filter(Boolean);
    const itens = recs.map(q => ({ id: q.id, fonte: `${q.banca}${q.ano ? ' ' + q.ano : ''}${q.tipo === 'ia' ? ' · IA' : ''}`, materia: q.materia || (q.area ? rotuloArea(q.area) + ' (' + q.banca + ')' : 'Questão'),
      enunciado: q.enunciado, imagens: q.imagens || [], alts: q.alts, gab: q.gab, coment: q.coment || '', fig: q.fig, res_ia: q.res_ia || '', duvidas: q.duvidas || [],
      modo: q.modo || '', img: q.img || '', w: q.w, h: q.h, corte: q.corte, prev: q.prev || '', dep: q.dep || 0, assunto: q.assunto || '', num: q.num || '' }));
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
  if (el.dataset.qf) { const k = el.dataset.qf; ui.qf[k] = k === 'n' ? Math.max(1, Math.min(9999, +el.value || 10)) : el.value; if (k === 'mat') ui.qf.assunto = ''; ui.qPag = 0; render(); }
  if (el.dataset.qfMarca) { ui.qf[el.dataset.qfMarca] = el.checked; ui.qPag = 0; render(); }
  if (el.dataset.acaoArquivo === 'bancoImportar' && el.files?.length) {
    const arquivos = [...el.files]; BANCO.msg = 'Importando…'; BANCO.repetidas = 0; BANCO.atualizadas = 0; render();
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
      BANCO.msg = `${total.toLocaleString('pt-BR')} questões novas no banco${BANCO.atualizadas ? ` · ${BANCO.atualizadas.toLocaleString('pt-BR')} atualizadas (agora em texto)` : ''}${BANCO.repetidas ? ` · ${BANCO.repetidas.toLocaleString('pt-BR')} repetidas ignoradas` : ''}${ignoradas ? ` (${ignoradas} ignoradas por formato)` : ''}.`; render();
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
const ordenarLista = l => { const s = ui.qf.ordem === 'antigas' ? -1 : 1; return l.slice().sort((a, b) => s * ((b.a || 0) - (a.a || 0)) || String(a.b).localeCompare(String(b.b)) || (+a.n || 0) - (+b.n || 0)); };
function listaQuestoes(achadas) {
  const l = ordenarLista(achadas), pg = ui.qPag || 0, por = 20, ini = pg * por, fatia = l.slice(ini, ini + por);
  return `<div class="lista-q"><div class="entre"><span class="rotulo">lista · ${ini + 1} a ${Math.min(l.length, ini + por)} de ${l.length.toLocaleString('pt-BR')}</span>
    <div class="linha"><button class="botao contorno" data-acao="qPag" data-v="-1" ${pg ? '' : 'disabled'}>‹</button><button class="botao contorno" data-acao="qPag" data-v="1" ${ini + por < l.length ? '' : 'disabled'}>›</button></div></div>
    ${fatia.map((q, i) => { const h = histDe(q.id);
      return `<button class="linha-q" data-acao="qComecarDe" data-i="${ini + i}"><span class="st ${h ? (h.ok ? 'ok' : 'x') : ''}" title="${h ? (h.ok ? 'acertou na última vez' : 'errou na última vez') : 'ainda não feita'}"></span>
        <span class="lq-corpo"><strong>${esc(q.b)} ${q.a || ''}${q.n ? ' · nº ' + esc(q.n) : ''}</strong><small class="fraco">${esc(q.m || '')}${q.as ? ' · ' + esc(q.as) : ''}</small>
        ${q.p ? `<small class="lq-texto">${esc(q.p)}…</small>` : ''}</span>
        ${h ? `<span class="lq-hist">${h.ac ? `<b class="h-ok">✓ ${h.ac}</b>` : ''}${h.er ? `<b class="h-er">✗ ${h.er}</b>` : ''}</span>` : ''}</button>`; }).join('')}</div>`;
}Object.assign(ACOES, {
  qfMat: el => { ui.qf.mat = el.dataset.v; ui.qf.assunto = ''; ui.qPag = 0; render(); },
  qfAssunto: el => { ui.qf.assunto = el.dataset.v; ui.qPag = 0; render(); },
  qVerLista: () => { ui.qLista = !ui.qLista; ui.qPag = 0; render(); },
  qIr: el => { const s = ui.qs, j = +el.dataset.i; if (j === s.i) return; if (s.itens[s.i].resp == null) fecharItem(s); s.i = j; s.tq = Date.now(); ui.qRasc = false; DB.del('d:qtmp'); render(); },
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
