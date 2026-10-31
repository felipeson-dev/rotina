'use strict';
/* Banco de questões: milhares de questões ficam no aparelho (IndexedDB "rotina-banco") e são filtradas sem internet.
   Em memória fica só uma ficha leve de cada questão (BANCO.itens); o texto completo é lido do banco ao montar a lista.
   Fontes: ENEM (baixado da API aberta enem.dev), questões geradas pela IA e arquivos JSON importados (ferramentas/montar_banco.py gera os arquivos).
   Questão: { id, banca, ano, area, materia, assunto, dif, fig, enunciado, imagens[], alts:[{l,t,img}], gab, coment, res_ia, duvidas }. */

S.qh ||= {}; // histórico por questão: { id: { ok, dia, n, ac, er, h: [[dia, 1|0, letra]] } }
S.qExtras ||= {}; // resoluções, dúvidas e flashcards gerados pela IA por questão (sincroniza entre aparelhos)
S.qIgnorar ||= []; // provas guardadas p/ simulado ("Banca|Ano", "*|Ano", "Banca|*") — excluídas de todas as listas manuais e automáticas
const BANCO = { itens: [], pronto: false, carregando: false, msg: '', baixando: false };
ui.qf = { assunto: '', sub: '', mat: '', banca: '', ano: '', st: 'novas', tag: '', semFig: true, res: false, n: 15, ordem: 'sorteio' };
ui.qIaModelo ||= 'argon';
ui.qIgnBanca ||= 'Albert Einstein';
ui.qIgnAno ||= '2026';
ui.qIgnAberto ||= false;

function questaoIgnorada(q) {
  const l = S.qIgnorar;
  if (!l || !l.length || !q) return false;
  const b = String(q.b || q.banca || '').toLowerCase(), a = String(q.a || q.ano || '');
  for (const item of l) {
    const [ib, ia] = String(item).split('|');
    const ibL = (ib || '').toLowerCase();
    const bOk = !ib || ib === '*' || b === ibL || (ibL.includes('einstein') && b.includes('einstein')) || (ibL.includes('santa casa') && b.includes('santa casa')) || (ibL.includes('camilo') && b.includes('camilo'));
    const aOk = !ia || ia === '*' || a === ia;
    if (bOk && aOk) return true;
  }
  return false;
}
window.questaoIgnorada = questaoIgnorada;

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
const txtBusca = s => { const t = normBusca(s); return t.length <= 700 ? t : t.slice(0, 350) + ' ' + t.slice(-350); };
const META_V = 3;   // muda quando a ficha leve ganha campos: refaz as fichas a partir das questões guardadas
const metaDe = q => ({ id: q.id, k: chaveQ(q), b: q.banca || 'Outra', a: q.ano || 0, ar: q.area || '', m: q.materia || '', s: normBusca(q.assunto).slice(0, 140), as: q.assunto || '', x: txtBusca(q.enunciado), p: previa(q.enunciado), n: q.num || '', d: q.dif || '', t: q.tipo === 'ia' ? 'ia' : 'real', f: q.fig ? 1 : 0, r: q.modo === 'objetivo' || q.coment ? 1 : 0, v: +q.v || 0, ds: q.tipo === 'disc' ? 1 : 0 });

async function carregarBanco() {
  if (BANCO.pronto) return;
  if (BANCO._prom) return BANCO._prom;
  BANCO.carregando = true;
  BANCO._prom = (async () => {
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
    BANCO.pronto = true; BANCO.carregando = false; BANCO._prom = null; render();
    sincronizarPacotesBanco(false);
  })();
  return BANCO._prom;
}

/** Atualiza automaticamente o banco de questões a partir da pasta pacotes/ do site quando há versão nova. */
async function sincronizarPacotesBanco(forcar = false) {
  if (BANCO.baixando) return;
  try {
    const rMan = await fetch('pacotes/manifesto.json', { cache: 'no-cache' });
    if (!rMan.ok) return;
    const man = await rMan.json();
    const vAtual = await DB.get('banco:pacotesv') || 0;
    const semAssunto = BANCO.itens.filter(q => !q.as).length;
    if (!forcar && BANCO.itens.length >= 20000 && vAtual >= (man.v || 0) && semAssunto < 100) return;
    BANCO.baixando = true; BANCO.repetidas = 0; BANCO.atualizadas = 0;
    let total = 0;
    for (const arq of man.arquivos || []) {
      BANCO.msg = `Atualizando pacote ${arq.replace('.json.gz', '')}…`; render();
      const r = await fetch('pacotes/' + arq);
      if (!r.ok) continue;
      const txt = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
      const j = JSON.parse(txt), lista = Array.isArray(j) ? j : j.questoes || [];
      const ok = lista.map(normalizarImportada).filter(Boolean);
      total += await adicionarQuestoes(ok);
    }
    await DB.set('banco:pacotesv', man.v || Date.now());
    BANCO.msg = total || BANCO.atualizadas ? `Banco sincronizado: ${BANCO.itens.length.toLocaleString('pt-BR')} questões prontas.` : '';
  } catch (e) {
    if (forcar) BANCO.msg = 'Não consegui atualizar os pacotes agora: ' + e.message;
  }
  BANCO.baixando = false; render();
}

/** Acrescenta questões ao banco (sem repetir ids) e devolve quantas entraram. */
async function adicionarQuestoes(lista) {
  const pos = new Map(BANCO.itens.map((m, i) => [m.id, i])), atual = [];
  // versão melhor de uma questão que já está no banco (a mesma questão agora em texto, "v" maior) ou que ganhou/mudou assunto: troca,
  // guardando o que ela já fez nela (resolução da IA, dúvidas e flashcards). O histórico de acertos continua, porque o id é o mesmo.
  for (const q of lista) {
    const i = q && pos.get(q.id); if (i == null) continue;
    const m = BANCO.itens[i];
    if ((q.v || 0) > (m.v || 0) || (q.assunto && q.assunto !== m.as) || (q.materia && q.materia !== m.m)) {
      const velho = await BD.get(q.id);
      atual.push(velho ? { ...q, res_ia: velho.res_ia || q.res_ia || '', duvidas: velho.duvidas || q.duvidas || [], flashcards: velho.flashcards || q.flashcards || [] } : q); BANCO.itens[i] = metaDe(q);
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
    if (questaoIgnorada(q)) return false;
    if (b1 && q.b !== b1) return false;
    if (pre && !pre.test(q.b)) return false;
    if (desde && !(q.a >= desde)) return false;
    if (so && q.a !== so) return false;
    if (f.mat && q.m !== f.mat) return false;
    if (f.assunto && q.as !== f.assunto) return false;
    if (f.sub && !bateSubtopico(q, f.assunto, f.sub)) return false;
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

function listasAbertasHtml() {
  const abertas = Object.entries(S.listasAbertas || {}).filter(([, s]) => s && s.itens?.length && !s.fim);
  if (!abertas.length) return '';
  return `<section class="cartao listas-abertas"><span class="rotulo">listas em andamento</span>
    ${abertas.map(([k, s]) => {
      const feitas = s.itens.filter(q => q.resp != null).length, tot = s.itens.length;
      const tit = s.tituloLista || s.itens[0]?.assunto || s.itens[0]?.materia || 'Lista de questões';
      return `<div class="entre"><div class="coluna" style="gap:2px"><strong>${esc(tit)}</strong><span class="fraco" style="font-size:13px">${feitas} de ${tot} respondidas</span></div>
        <div class="linha"><button class="botao destaque" data-acao="qContinuarLista" data-k="${esc(k)}">Continuar (${feitas}/${tot})</button>
          <button class="x" data-acao="qDescartarLista" data-k="${esc(k)}" title="Fechar lista" aria-label="Fechar lista">×</button></div></div>`;
    }).join('')}</section>`;
}

function ignorarHtml() {
  const l = S.qIgnorar || [];
  const bancas = [...new Set(['Albert Einstein', 'Fuvest', 'UNIFESP', 'Santa Casa', 'FMABC', 'São Camilo', 'ENEM', 'UNESP', 'Unicamp', 'FAMERP', 'FAMEMA', ...BANCO.itens.map(q => q.b).filter(Boolean)])];
  const anosBanco = [...new Set(BANCO.itens.map(q => q.a).filter(a => a >= 2000))];
  const anos = [...new Set([2027, 2026, 2025, 2024, 2023, 2022, ...anosBanco])].sort((a, b) => b - a);
  const rotuloRegra = r => { const [b, a] = String(r).split('|'); return `${b === '*' ? 'Todas as bancas' : b} · ${a === '*' ? 'todos os anos' : a}`; };
  return `<div class="q-ignorar">
    <div class="entre" style="gap:8px;flex-wrap:wrap">
      <div class="linha" style="gap:6px;flex-wrap:wrap">
        <span class="rotulo" style="margin:0">🚫 Não fazer (guardar p/ simulado):</span>
        ${l.length ? l.map(r => `<span class="chip ativo" style="gap:6px">${esc(rotuloRegra(r))} <button class="x-mini" data-acao="qIgnorarDel" data-v="${esc(r)}" title="Voltar a incluir" aria-label="Remover filtro">×</button></span>`).join('')
          : '<span class="fraco" style="font-size:13px">nenhuma prova reservada</span>'}
      </div>
      <button class="link" data-acao="qIgnorarToggle" style="font-size:13px">${ui.qIgnAberto ? 'Fechar' : '+ Guardar prova (ex.: Einstein 2026)'}</button>
    </div>
    ${ui.qIgnAberto ? `<div class="linha q-ignorar-form" style="margin-top:8px;gap:8px;flex-wrap:wrap">
      <select id="q-ign-banca" data-ui="qIgnBanca" style="flex:1 1 180px">${opcao('*', 'Todas as bancas', ui.qIgnBanca)}${bancas.map(b => opcao(b, b, ui.qIgnBanca)).join('')}</select>
      <select id="q-ign-ano" data-ui="qIgnAno" style="flex:0 1 140px">${ anos.map(a => opcao(String(a), String(a), ui.qIgnAno)).join('')}${opcao('*', 'Todos os anos', ui.qIgnAno)}</select>
      <button class="botao claro" data-acao="qIgnorarAdd">Guardar (não usar nas listas)</button>
      <small class="fraco" style="flex:1 1 100%;font-size:12px">Questões de provas guardadas aqui nunca entram nas listas geradas por você nem nas listas automáticas do dia/revisão (mas continuam disponíveis na aba Simulados).</small>
    </div>` : ''}
  </div>`;
}

function qMontar() {
  if (!BANCO.pronto) { carregarBanco(); return '<section class="cartao"><p class="fraco" style="margin:0">Abrindo o banco de questões…</p></section>'; }
  const f = ui.qf, todos = BANCO.itens;
  if (!todos.length) return `<section class="cartao"><h2>Escolher questões</h2><p style="margin:0">O banco está vazio. Importe os arquivos de questões ou baixe o ENEM logo abaixo.</p></section><!--meta-->${cartaoBanco(true)}`;
  const achadas = filtrarBanco();
  // cada caixa mostra quantas questões há em cada opção, já considerando as outras caixas
  const semMat = filtrarBanco({ mat: '', assunto: '', sub: '' }), semAssunto = filtrarBanco({ assunto: '', sub: '' }), semSub = filtrarBanco({ sub: '' }), semSt = filtrarBanco({ st: 'todas' }), semBanca = filtrarBanco({ banca: '' }), semAno = filtrarBanco({ ano: '' });
  const porMat = contar(semMat, 'm'), porBanca = contar(semBanca, 'b'), porAno = contar(semAno, 'a');
  const anos = Object.keys(porAno).map(Number).filter(Boolean).sort((a, b) => b - a);
  const caixa = (rot, id, html, ativo, extra = '') => `<label class="filtro ${ativo ? 'ativo' : ''}"><span>${rot}</span><select data-qf="${id}" ${extra}>${html}</select></label>`;
  const nSt = v => semSt.filter(q => situacaoOk(v, q.id)).length;
  const nAno = d => semAno.filter(q => q.a >= d).length;
  const algum = f.mat || f.assunto || f.sub || f.banca || f.ano || (f.st && f.st !== 'novas') || f.tag || f.res;
  const subHtml = !f.mat ? opcao('', 'Escolha a matéria antes', '') : subassuntosHtml(f.mat, f.assunto, f.sub, f.assunto ? semSub : semAssunto);
  return `${listasAbertasHtml()}<section class="cartao escolher"><div class="entre"><h2>Escolher questões</h2>${algum ? '<button class="link" data-acao="qfLimpar">Limpar filtros</button>' : ''}</div>
    <div class="filtros">
      ${caixa('Matéria', 'mat', opcao('', `Todas as matérias (${milhar(semMat.length)})`, f.mat) + Object.entries(porMat).sort((a, b) => a[0].localeCompare(b[0])).map(([m, n]) => opcao(m, `${m} (${milhar(n)})`, f.mat)).join(''), f.mat)}
      ${caixa('Assunto (cronograma)', 'assunto', f.mat ? opcao('', `Todos de ${f.mat} (${milhar(semAssunto.length)})`, f.assunto) + assuntosDe(f.mat, semAssunto).map(([a, n]) => opcao(a, `${a} (${n})`, f.assunto)).join('') : opcao('', 'Escolha a matéria antes', ''), f.assunto, f.mat ? '' : 'disabled')}
      ${caixa('Subassunto / Tópico', 'sub', subHtml, f.sub, f.mat ? '' : 'disabled')}
      ${caixa('Situação', 'st', SITUACOES.map(([v, t]) => opcao(v, `${t} (${milhar(nSt(v))})`, f.st || 'todas')).join(''), f.st && f.st !== 'todas')}
      ${caixa('Banca', 'banca', opcao('', 'Todas as bancas', f.banca) + `<optgroup label="Grupos">${Object.entries(PRESETS_BANCA).map(([k, [t, re]]) => opcao('p:' + k, `${t} (${milhar(semBanca.filter(q => re.test(q.b)).length)})`, f.banca)).join('')}</optgroup>`
        + `<optgroup label="Banca">${Object.entries(porBanca).sort((a, b) => b[1] - a[1]).map(([b, n]) => opcao('b:' + b, `${b} (${milhar(n)})`, f.banca)).join('')}</optgroup>`, f.banca)}
      ${caixa('Ano', 'ano', opcao('', 'Qualquer ano', f.ano) + `<optgroup label="A partir de">${[2020, 2015, 2010].filter(d => anos.some(a => a >= d)).map(d => opcao('d:' + d, `${d} em diante (${milhar(nAno(d))})`, f.ano)).join('')}</optgroup>`
        + `<optgroup label="Só um ano">${anos.map(a => opcao('a:' + a, `${a} (${porAno[a]})`, f.ano)).join('')}</optgroup>`, f.ano)}
      ${caixa('Ordem', 'ordem', [['sorteio', 'Sorteadas'], ['novas', 'Mais recentes primeiro'], ['antigas', 'Mais antigas primeiro']].map(([v, t]) => opcao(v, t, f.ordem)).join(''), false)}
    </div>
    <label class="filtro busca"><span>Procurar no texto</span><input type="search" data-qf="tag" value="${esc(f.tag)}" placeholder="Ex.: função quadrática, Segundo Reinado, mitose"></label>
    ${ignorarHtml()}
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
      <div class="linha"><button class="botao claro" data-acao="bancoSincronizar" ${BANCO.baixando ? 'disabled' : ''}>${BANCO.baixando ? 'Sincronizando…' : 'Sincronizar banco oficial'}</button>
        <label class="botao claro" style="display:inline-flex;align-items:center">Importar arquivos<input type="file" accept="application/json,.json,.gz,application/gzip" multiple data-acao-arquivo="bancoImportar" hidden></label>
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
  return `<div class="q-hist"><span class="fraco">Seu histórico nesta questão:</span>${h.h.slice(-6).map(([d, ok, l]) => `<span class="${ok ? 'h-ok' : l === 'P' ? 'h-meio' : 'h-er'}">${ok ? '✓' : l === 'P' ? '◐' : '✗'} ${diaCurto(d)}${l ? ' (' + esc(l) + ')' : ''}</span>`).join('')}</div>`;
}

/** Números das questões da lista: verde = acertou, vermelho = errou, contorno = atual. Toque para ir direto. */
function mapaSessao(s) {
  const n = s.itens.length; if (n < 2) return '';
  let ini = 0, fim = n;
  if (n > 25) { ini = Math.max(0, Math.min(s.i - 12, n - 25)); fim = ini + 25; }
  const bt = j => { const q = s.itens[j]; return `<button class="${q.resp == null ? '' : q.certo ? 'h-ok' : q.resp === 'P' ? 'h-meio' : 'h-er'} ${j === s.i ? 'atual' : ''}" data-acao="qIr" data-i="${j}" aria-label="Questão ${j + 1}">${j + 1}</button>`; };
  return `<nav class="q-mapa" aria-label="Questões da lista">${ini ? '<span>…</span>' : ''}${Array.from({ length: fim - ini }, (_, k) => bt(ini + k)).join('')}${fim < n ? '<span>…</span>' : ''}</nav>`;
}

/** Texto-base da questão anterior: em imagem (modo objetivo) ou em texto. */
const prevHtml = r => `<div class="coluna" style="gap:6px"><span class="rotulo">questão ${esc(r.num || '')} (anterior)</span>${r.modo === 'objetivo' ? recorteObj(r, false) : `<div class="enunciado q-prev">${mdLite(r.enunciado)}${(r.imagens || []).map(u => `<img class="q-img" src="${u}" alt="figura" loading="lazy">`).join('')}</div>`}
  ${r.prev ? '<button class="link" data-acao="qPrevMais" style="align-self:flex-start">‹ O texto não está aqui? Ver a questão antes desta</button>' : ''}</div>`;
/** Enunciado com a camada para riscar por cima com a caneta (o dedo continua rolando a página). */
const riscavel = html => `<div class="q-riscavel">${ui.qRiscar ? `<div class="quadro-vaga sobre" data-chave="qrisc${ui.qs.i}" data-altura="0" data-fundo="transparente"></div>` : ''}<div class="q-riscavel-alvo">${html}</div></div>`;
function ajudaIaHtml(q, resp) {
  const ia = q.res_ia ? `<div class="res-ia"><span class="rotulo">resolução pela IA</span><div class="enunciado">${mdLite(q.res_ia)}</div></div>` : '';
  const duv = (q.duvidas || []).map(d => `<div class="msg u">${esc(d.p)}</div><div class="msg ia">${mdLite(d.r)}</div>`).join('');
  const cards = (q.flashcards || []).map(c => `<div class="flash-salvo"><span class="rotulo">🗂 flashcard salvo em Cartões</span><div class="enunciado"><strong>${mdLite(c.frente)}</strong></div><div class="fraco enunciado">${mdLite(c.verso)}</div></div>`).join('');
  const mod = ui.qIaModelo || 'argon';
  const selMod = `<div class="ia-modelo-bar"><span class="rotulo">modelo da IA:</span><div class="alterna" role="group">
    ${[['argon', 'Argon'], ['flash', 'Flash'], ['flash-lite', 'Flash Lite']].map(([v, t]) => `<button type="button" data-acao="qIaModelo" data-v="${v}" aria-pressed="${mod === v}">${t}</button>`).join('')}
  </div>${mod === 'argon' && typeof temArgon === 'function' && !temArgon() ? '<span class="fraco" style="font-size:12px">(sem chave Argon em Ajustes · usando Flash por enquanto)</span>' : ''}</div>`;
  const prev = ui.qFlashPrev && ui.qFlashPrev.qid === q.id ? `<div class="flash-previa">
    <div class="entre"><span class="rotulo">prévia do flashcard (${esc(ui.qFlashPrev.modelo || mod)}) — está bom assim ou quer alterar?</span><button class="x" data-acao="qFlashCancelar" title="Cancelar">×</button></div>
    <div class="flash-face frente"><span class="rotulo">frente (pergunta)</span><div class="enunciado"><strong>${mdLite(ui.qFlashPrev.frente)}</strong></div></div>
    <div class="flash-face verso"><span class="rotulo">verso (resposta)</span><div class="enunciado">${mdLite(ui.qFlashPrev.verso)}</div></div>
    ${ui.qFlashPrev.dica ? `<p class="fraco" style="margin:0;font-size:13px">💡 Dica: ${mdLite(ui.qFlashPrev.dica)}</p>` : ''}
    <details class="det-q"><summary>✏️ Editar texto manualmente (opcional)</summary><div class="det-corpo">
      <label class="campo"><span>Frente (pergunta)</span><textarea id="flash-prev-frente" rows="2" data-ui-flash="frente">${esc(ui.qFlashPrev.frente)}</textarea></label>
      <label class="campo"><span>Verso (resposta)</span><textarea id="flash-prev-verso" rows="3" data-ui-flash="verso">${esc(ui.qFlashPrev.verso)}</textarea></label>
    </div></details>
    <div class="linha" style="flex-wrap:nowrap;align-items:flex-end">
      <input type="text" id="flash-ajuste-txt" placeholder="Quer mudar algo? Ex.: deixe mais curto, foque na fórmula, inclua exemplo…">
      <button class="botao claro" data-acao="qFlashAlterar" ${ui.carregando ? 'disabled' : ''}>Pedir alteração (${mod === 'argon' ? 'Argon' : mod === 'flash' ? 'Flash' : 'Flash Lite'})</button>
    </div>
    <div class="linha">
      <button class="botao grande destaque" data-acao="qFlashAprovar" ${ui.carregando ? 'disabled' : ''}>✓ Aprovar e criar flashcard (Flash Lite)</button>
      <button class="botao contorno" data-acao="qFlashCancelar">Cancelar</button>
    </div>
  </div>` : '';
  return detalhe('qia', `Perguntar à IA ou criar Flashcard${q.res_ia || duv || cards ? ' · já tem conteúdo aqui' : ''}`, `<div class="ajuda-ia">
    ${selMod}
    <div class="linha">
      <button class="botao claro" data-acao="resolIa" ${ui.carregando ? 'disabled' : ''}>${q.res_ia ? 'Resolver de novo com a IA' : 'Ver a resolução pela IA'}</button>
      <button class="botao claro" data-acao="qFlashPrevia" ${ui.carregando ? 'disabled' : ''}>🗂 Criar flashcard desta questão</button>
    </div>
    ${prev}${cards}${ia}${duv ? `<div class="msgs-duv">${duv}</div>` : ''}
    <div class="linha" style="flex-wrap:wrap;align-items:flex-end">
      <textarea id="duvida-txt" data-ui="duvidaTxt" rows="2" placeholder="Tire uma dúvida específica ou diga sobre o que quer criar um flashcard (ex.: por que a C está errada? / crie flashcard sobre a fórmula de Euler)" style="min-height:56px;flex:1 1 260px">${esc(ui.duvidaTxt || '')}</textarea>
      <div class="linha"><button class="botao" data-acao="duvidaIa" ${ui.carregando ? 'disabled' : ''}>Perguntar</button>
        <button class="botao contorno" data-acao="qFlashPrevia" ${ui.carregando ? 'disabled' : ''}>🗂 Virar flashcard</button></div>
    </div></div>`);
}

function qQuestao() {
  if (ui.qs.simulado && typeof qQuestaoSimulado === 'function') return qQuestaoSimulado();
  const s = ui.qs, q = s.itens[s.i], resp = q.resp != null, ultima = s.i + 1 >= s.itens.length;
  if (ui.qPrevImg && ui.qPrevDe !== q.id) ui.qPrevImg = null;
  const nav = `<div class="q-nav"><button class="botao contorno" data-acao="qAnt" ${s.i ? '' : 'disabled'}>‹ Anterior</button>
      <button class="botao contorno" data-acao="qRasc">${ui.qRasc ? 'Fechar rascunho' : 'Rascunho'}</button>
      <button class="botao contorno" data-acao="qRiscar" aria-pressed="${!!ui.qRiscar}">${ui.qRiscar ? 'Parar de riscar' : 'Riscar na questão'}</button>
      <button class="botao ${resp ? 'grande' : 'claro'}" data-acao="qProx">${ultima ? 'Terminar' : 'Próxima ›'}</button></div>`;
  return `${mapaSessao(s)}<section class="cartao questao"><div class="entre"><span class="linha" style="gap:6px"><span class="tag" style="${cor(q.materia)}">${esc(q.materia)}</span>${q.assunto ? `<span class="selo">${esc(q.assunto)}</span>` : ''}</span><span class="fraco">${esc(q.fonte)}${q.num ? ' · nº ' + esc(q.num) : ''}</span></div>
    ${histHtml(q.id)}
    ${q.fig ? '<p class="fraco" style="margin:0;font-size:13px">⚠ Pode depender de um texto ou figura de outra questão. Se não der para resolver, vá para a próxima.</p>' : ''}
    ${q.modo === 'objetivo' ? `${q.prev ? `<button class="link" data-acao="qPrev" style="align-self:flex-start">${ui.qPrevImg ? 'Esconder' : 'Ver'} o texto/figura da questão anterior (às vezes o texto-base está nela)</button>${ui.qPrevImg ? prevHtml(ui.qPrevImg) : ''}` : ''}
      ${riscavel(recorteObj(q, false))}` : `${q.prev && q.dep ? `<button class="link" data-acao="qPrev" style="align-self:flex-start">${ui.qPrevImg ? 'Esconder' : 'Ler'} o texto da questão anterior (o texto-base desta questão está nela)</button>${ui.qPrevImg ? prevHtml(ui.qPrevImg) : ''}` : ''}${riscavel(`<div class="enunciado">${mdLite(q.enunciado)}${(q.imagens || []).map(u => `<img class="q-img" src="${u}" alt="figura" loading="lazy">`).join('')}</div>`)}${q.img ? `<a class="link" href="${esc(q.img)}" target="_blank" rel="noopener" style="align-self:flex-start;font-size:13px">ver a imagem original da prova</a>` : ''}`}
    <div class="alts ${q.modo === 'objetivo' ? 'so-letras' : ''}">${q.alts.map(a => { const sel = q.resp === a.l, certa = resp && a.l === q.gab, errada = resp && sel && a.l !== q.gab;
      const risc = !resp && (q.risc || []).includes(a.l);   // alternativa descartada por ela enquanto pensa
      return `<div class="alt-linha ${risc ? 'riscada' : ''}"><button class="alt ${sel ? 'sel' : ''} ${certa ? 'certa' : ''} ${errada ? 'errada' : ''}" data-acao="qResp" data-v="${a.l}" ${resp ? 'disabled' : ''}><b>${a.l}</b><span>${mdLite(a.t)}${a.img && /^https:/.test(a.img) ? `<img class="q-img" src="${a.img}" alt="">` : ''}</span></button>
        ${resp ? '' : `<button class="risca" data-acao="qRiscarAlt" data-v="${a.l}" aria-label="${risc ? 'Desriscar' : 'Riscar'} a ${a.l}" title="${risc ? 'Desriscar' : 'Riscar (descartar)'}">${risc ? '↺' : '✕'}</button>`}</div>`; }).join('')}</div>
    ${resp ? `<div class="gabarito ${q.certo ? 'ok' : 'errou'}"><strong>${q.certo ? 'Acertou!' : `Errou. A certa era ${q.gab}.`}</strong>${q.coment ? `<div class="resolucao">${mdLite(q.coment)}</div>` : ''}</div>
      ${q.modo === 'objetivo' ? `<div class="coluna" style="gap:6px"><span class="rotulo">resolução comentada (Curso Objetivo)</span>${recorteObj(q, true)}</div>` : ''}` : ''}
    ${nav}
    ${ui.qRasc ? quadroHtml('qtmp' + s.i, 520, 'quadriculado') : ''}
    ${ajudaIaHtml(q, resp)}</section>`;
}

/** Mostra só a parte da imagem do Objetivo que interessa: o enunciado (de cima até o corte) ou a resolução (do corte para baixo). */
function recorteObj(q, resolucao) {
  if (!q?.img || !q.w) return '';
  const alto = resolucao ? q.h - q.corte : q.corte;
  return `<div class="obj-recorte" style="aspect-ratio:${q.w}/${Math.max(20, alto)}"><img src="${esc(q.img)}" alt="${resolucao ? 'resolução' : 'questão'}" loading="lazy" style="${resolucao ? `margin-top:-${(q.corte / q.w * 100).toFixed(3)}%` : ''}"></div>`;
}

const textoQuestao = q => `Questão (${q.fonte}${q.materia ? ', ' + q.materia : ''}):\n${q.enunciado}\n\nAlternativas:\n${q.alts.map(a => `${a.l}) ${a.t}`).join('\n')}\n\nGabarito oficial: ${q.gab}.${q.coment ? '\nResolução existente: ' + q.coment : ''}`;
async function guardarNaQuestao(q, campos) {
  Object.assign(q, campos);
  if (q.id) { S.qExtras ||= {}; S.qExtras[q.id] = { ...(S.qExtras[q.id] || {}), ...campos }; salvar(); }
  try { const r = await BD.get(q.id); if (r) await BD.put([{ ...r, ...campos }]); } catch { }
}

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
  bancoSincronizar: () => sincronizarPacotesBanco(true),
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
    ui.qPrevImg = r || null; ui.qPrevDe = q.id; if (!ui.qPrevImg) ui.iaMsg = 'A questão anterior não está no banco.'; render();
  },
  // o texto-base de um grupo (ex.: questões 06 a 09) fica na primeira: dá para ir subindo
  qPrevMais: async () => {
    const r = ui.qPrevImg?.prev && await BD.get(ui.qPrevImg.prev);
    if (r) ui.qPrevImg = r; else ui.iaMsg = 'Não há questão antes desta no banco.'; render();
  },
  qfLimpar: () => { ui.qf = { ...ui.qf, mat: '', assunto: '', sub: '', banca: '', ano: '', st: 'novas', tag: '', res: false }; ui.qPag = 0; render(); },
  qIgnorarToggle: () => { ui.qIgnAberto = !ui.qIgnAberto; render(); },
  qIgnorarAdd: () => {
    const b = $('#q-ign-banca')?.value || ui.qIgnBanca || 'Albert Einstein', a = $('#q-ign-ano')?.value || ui.qIgnAno || '2026';
    const r = `${b}|${a}`;
    S.qIgnorar ||= [];
    if (!S.qIgnorar.includes(r)) S.qIgnorar.push(r);
    ui.qIgnAberto = false; ui.qPag = 0;
    ui.iaMsg = `Guardado: questões de ${b === '*' ? 'todas as bancas' : b} (${a === '*' ? 'todos os anos' : a}) não entrarão em nenhuma lista automática ou manual.`;
    salvar(); render();
  },
  qIgnorarDel: el => {
    const v = el.dataset.v;
    S.qIgnorar = (S.qIgnorar || []).filter(x => x !== v);
    ui.qPag = 0; salvar(); render();
  },
  qGerar: async () => {
    let l = filtrarBanco();
    l = ui.qf.ordem === 'sorteio' || !ui.qf.ordem ? l.slice().sort(() => Math.random() - 0.5) : ordenarLista(l);
    await ACOES.qIniciarIds(l.slice(0, Math.max(1, ui.qf.n)).map(m => m.id), {
      chaveLista: ui.qf.sub ? `sub:${ui.qf.assunto}:${ui.qf.sub}` : ui.qf.assunto ? 'ass:' + ui.qf.assunto : 'banco',
      tituloLista: [ui.qf.mat, ui.qf.assunto, ui.qf.sub && ui.qf.sub !== '__outras__' ? ui.qf.sub : ''].filter(Boolean).join(' · ') || 'Lista do banco',
    });
  },
  qIniciarIds: async (ids, extra = {}) => {
    const recs = (await Promise.all(ids.map(id => BD.get(id)))).filter(Boolean);
    const itens = recs.map(q => {
      const ex = S.qExtras?.[q.id] || {};
      return { id: q.id, fonte: `${q.banca}${q.ano ? ' ' + q.ano : ''}${q.tipo === 'ia' ? ' · IA' : ''}`, materia: q.materia || (q.area ? rotuloArea(q.area) + ' (' + q.banca + ')' : 'Questão'),
        enunciado: q.enunciado, imagens: q.imagens || [], alts: q.alts, gab: q.gab, coment: q.coment || '', fig: q.fig, res_ia: ex.res_ia || q.res_ia || '', duvidas: ex.duvidas || q.duvidas || [], flashcards: ex.flashcards || q.flashcards || [],
        modo: q.modo || '', img: q.img || '', w: q.w, h: q.h, corte: q.corte, prev: q.prev || '', dep: q.dep || 0, assunto: q.assunto || '', num: q.num || '', tipo: q.tipo || '', discIa: ex.discIa || q.discIa || null };
    });
    if (itens.length) iniciarSessao(itens, extra);
  },
  qIaModelo: el => { ui.qIaModelo = el.dataset.v || 'argon'; render(); },
  qFlashPrevia: async () => {
    const q = ui.qs.itens[ui.qs.i], pedido = ($('#duvida-txt')?.value || ui.duvidaTxt || '').trim();
    const mod = ui.qIaModelo || 'argon';
    ui.ab ||= {}; ui.ab.qia = true;
    ui.carregando = `Criando prévia do flashcard com ${mod === 'argon' ? 'Argon' : mod === 'flash' ? 'Flash' : 'Flash Lite'}…`; render();
    try {
      const r = await chamarIa(`${textoQuestao(q)}\n${q.res_ia ? '\nResolução: ' + q.res_ia : ''}\n${pedido ? `\nPedido específico dela para o flashcard: ${pedido}` : '\nExtraia o conceito-chave, fórmula ou pegadinha mais importante desta questão para ela memorizar.'}\n\nCrie um rascunho de flashcard (frente = pergunta curta, direta e ativa; verso = resposta clara, enxuta e precisa, com fórmula em LaTeX se houver; dica = 1 linha opcional). Não copie a questão inteira; foque no conhecimento que resolve questões parecidas no vestibular de Medicina.\nResponda SÓ com JSON: {"frente":"...","verso":"...","dica":"..."}`, 1800, [], mod);
      if (pedido) ui.duvidaTxt = '';
      ui.qFlashPrev = { qid: q.id, frente: String(r.frente || '').trim(), verso: String(r.verso || '').trim(), dica: String(r.dica || '').trim(), modelo: mod };
    } catch (e) { ui.iaMsg = `Não consegui criar a prévia do flashcard (${e.message}).`; }
    ui.carregando = ''; render();
  },
  qFlashAlterar: async () => {
    const q = ui.qs.itens[ui.qs.i], prev = ui.qFlashPrev; if (!prev) return;
    const ajuste = ($('#flash-ajuste-txt')?.value || '').trim();
    const fAtual = ($('#flash-prev-frente')?.value || prev.frente || '').trim();
    const vAtual = ($('#flash-prev-verso')?.value || prev.verso || '').trim();
    if (!ajuste) { ui.iaMsg = 'Digite o que quer mudar no flashcard ou edite o texto direto nas caixas.'; render(); return; }
    const mod = ui.qIaModelo || 'argon';
    ui.carregando = `Ajustando o flashcard com ${mod === 'argon' ? 'Argon' : mod === 'flash' ? 'Flash' : 'Flash Lite'}…`; render();
    try {
      const r = await chamarIa(`${textoQuestao(q)}\n\nRascunho atual do flashcard:\nFrente: ${fAtual}\nVerso: ${vAtual}\nDica: ${prev.dica || ''}\n\nAlteração pedida por ela: ${ajuste}\n\nReescreva o flashcard aplicando o que ela pediu. Responda SÓ com JSON: {"frente":"...","verso":"...","dica":"..."}`, 1800, [], mod);
      ui.qFlashPrev = { qid: q.id, frente: String(r.frente || fAtual).trim(), verso: String(r.verso || vAtual).trim(), dica: String(r.dica ?? prev.dica ?? '').trim(), modelo: mod };
    } catch (e) { ui.iaMsg = `Não consegui alterar agora (${e.message}).`; }
    ui.carregando = ''; render();
  },
  qFlashAprovar: async () => {
    const q = ui.qs.itens[ui.qs.i], prev = ui.qFlashPrev; if (!prev) return;
    const fAprov = ($('#flash-prev-frente')?.value || prev.frente || '').trim();
    const vAprov = ($('#flash-prev-verso')?.value || prev.verso || '').trim();
    if (!fAprov || !vAprov) { ui.iaMsg = 'A frente e o verso não podem ficar em branco.'; render(); return; }
    ui.carregando = 'Finalizando e criando o flashcard com Flash Lite…'; render();
    let frente = fAprov, verso = vAprov, dica = prev.dica || '';
    try {
      const r = await chamarIa(`Finalize e formate este flashcard já aprovado pela estudante (mantenha o texto fiel ao aprovado, apenas garanta formatação limpa e clara para revisão espaçada de Medicina):\nFrente aprovada: ${fAprov}\nVerso aprovado: ${vAprov}\nDica: ${dica}\nMatéria: ${q.materia || ''}\nAssunto: ${q.assunto || ''}\nResponda SÓ com JSON: {"frente":"...","verso":"...","dica":"..."}`, 1200, [], 'flash-lite');
      if (r.frente && r.verso) { frente = String(r.frente).trim(); verso = String(r.verso).trim(); dica = String(r.dica ?? dica).trim(); }
    } catch { /* se estiver sem cota no instante da aprovação, cria direto com o texto aprovado */ }
    const novo = { id: uid(), tipo: 'texto', materia: q.materia || 'Biologia', assunto: q.assunto || '', fonte: q.fonte || '', qid: q.id || '', ft: frente, vt: verso, frente, verso, dica, prox: hoje(), int: 0, fac: 2.3, n: 0 };
    S.cartoes ||= []; S.cartoes.push(novo);
    await guardarNaQuestao(q, { flashcards: [...(q.flashcards || []), { id: novo.id, frente, verso, dica }] });
    ui.qFlashPrev = null; ui.carregando = '';
    ui.iaMsg = '✓ Flashcard criado pelo Flash Lite e guardado em Caderno → Cartões!';
    salvar(); render();
  },
  qFlashCancelar: () => { ui.qFlashPrev = null; render(); },
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
    const q = ui.qs.itens[ui.qs.i], mod = ui.qIaModelo || 'argon'; ui.carregando = 'A IA está resolvendo…'; render();
    try {
      const r = await chamarIa(`Resolva esta questão de vestibular para uma estudante de Medicina, em português do Brasil, de forma clara e organizada: (1) o que a questão pede; (2) o raciocínio passo a passo até a alternativa certa (o gabarito oficial é dado: se o seu raciocínio chegar em outra, diga a dúvida); (3) em uma linha cada, por que as outras alternativas estão erradas; (4) o conceito para fixar. Use texto simples, sem tabelas. Vá direto ao conteúdo: sem saudação, sem comentar prazos ou provas.\n\n${textoQuestao(q)}\n\nResponda SÓ com JSON: {"resolucao":"..."}`, 3500, [], mod);
      await guardarNaQuestao(q, { res_ia: String(r.resolucao || '').trim() });
    } catch (e) { ui.iaMsg = `Não consegui resolver agora (${e.message}).`; }
    ui.carregando = ''; render();
  },
  duvidaIa: async () => {
    const q = ui.qs.itens[ui.qs.i], p = ($('#duvida-txt')?.value || ui.duvidaTxt || '').trim(); if (!p) return;
    if (/^\s*(crie|criar|faz|faça| montar|gerar)\s+(um\s+)?flash\s*card/i.test(p)) { await ACOES.qFlashPrevia(); return; }
    const mod = ui.qIaModelo || 'argon';
    ui.duvidaTxt = ''; ui.carregando = 'A IA está pensando…'; render();
    try {
      const hist = (q.duvidas || []).slice(-3).map(d => `Ela: ${d.p}\nVocê: ${d.r}`).join('\n');
      const r = await chamarIa(`${textoQuestao(q)}\n${q.res_ia ? '\nResolução já dada: ' + q.res_ia : ''}\n${hist ? '\nConversa até aqui:\n' + hist : ''}\n\nDúvida dela: ${p}\nResponda de forma direta, didática e correta, em português do Brasil, só ao que foi perguntado, sem saudação nem comentários sobre prazos ou provas. Responda SÓ com JSON: {"resposta":"..."}`, 2500, [], mod);
      await guardarNaQuestao(q, { duvidas: [...(q.duvidas || []), { p, r: String(r.resposta || '').trim() }] });
    } catch (e) { ui.iaMsg = `Não consegui responder agora (${e.message}).`; ui.duvidaTxt = p; }
    ui.carregando = ''; render();
  },
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.qf) {
    const k = el.dataset.qf;
    if (k === 'sub' && String(el.value || '').includes('||')) {
      const [ass, sb] = String(el.value).split('||');
      ui.qf.assunto = ass; ui.qf.sub = sb;
    } else {
      ui.qf[k] = k === 'n' ? Math.max(1, Math.min(9999, +el.value || 10)) : el.value;
      if (k === 'mat') { ui.qf.assunto = ''; ui.qf.sub = ''; }
      if (k === 'assunto') ui.qf.sub = '';
    }
    ui.qPag = 0; render();
  }
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

// ---------- assuntos, subassuntos e lista de questões ----------
const SUBTOPICOS = {
  // MATEMÁTICA
  'Conjuntos e conjuntos numéricos': [
    ['Revisão de base: frações, potências, raízes e fatoração', /fracao|potencia|raiz|raize|fatorac|produto notave|racionaliz|dizima|mmc|mdc|divisor|multiplo|primo|algarismo|resto da divisao/],
    ['Operações com conjuntos e diagramas de Venn', /conjunto|subconjunto|intersec|uniao|pertence|diagrama|venn|elemento|pesquisa|entrevistad/],
    ['Conjuntos numéricos, intervalos e reta real', /naturai|inteiro|racionai|irracionai|reai|intervalo|reta|modulo|desigualdade/],
  ],
  'Razão, proporção e regra de três': [
    ['Razão, proporção e escala', /razao|proporc|escala|mapa|maquete|diretamente|inversamente|divisao/],
    ['Regra de três simples e composta', /regra de tre|operario|maquina|torneira|vazao|velocidade|ritmo|consumo|combustivel|hora|dia|minuto/],
    ['Unidades de medida, conversões e problemas aritméticos', /litro|metro|quilometro|grama|tonelada|capacidade|volume|massa|preco|custo|valor|compra|venda/],
  ],
  'Porcentagem e juros': [
    ['Porcentagem, acréscimos e descontos', /porcent|%|desconto|acrescimo|aumento|reduz|lucro|prejuizo|inflacao|imposto|promocao/],
    ['Juros simples e compostos / Matemática financeira', /juro|montante|capital|taxa|prestacao|financiamento|investimento|aplicacao|composto|parcela|emprestimo/],
  ],
  'Funções: conceito e afim': [
    ['Funções: conceito, domínio, imagem e gráficos', /dominio|contradominio|imagem|injetora|sobrejetora|bijetora|inversa|composta|f\s*\(|g\s*\(|grafico|tabela/],
    ['Função afim (1º grau) e variação linear', /afim|1 grau|primeiro grau|linear|reta|coeficiente|custo fixo|tarifa|mensalidade|taxa fixa|crescente|decrescente/],
  ],
  'Função quadrática': [
    ['Raízes, concavidade e gráfico da parábola', /parabola|raiz|raize|bhaskara|concav|simetria|intersec|f\s*\(\s*x\s*\)|x\^2|x²|2 grau|segundo grau/],
    ['Vértice, valor máximo e valor mínimo', /maximo|minimo|vertice|maior|menor|lucro|receita|altura|alcance|area/],
  ],
  'Função exponencial': [
    ['Equações e propriedades exponenciais', /equacao|potencia|\^|resolva|valor de x|igualdade|2\^|3\^|5\^|10\^/],
    ['Crescimento/decaimento exponencial e meia-vida', /crescimento|decaimento|meia-vida|bacteria|populac|radioativ|colonia|duplica|triplica|tempo|ano|hora/],
  ],
  'Logaritmos': [
    ['Propriedades operatórias e cálculo de logaritmos', /propriedade|base|log|mantissa|colog|equacao|valor de|sabendo que/],
    ['Função logarítmica e aplicações (Richter, dB, pH, juros)', /richter|decibel|decibei|terremoto|sonor|ph\b|meia-vida|juro|tempo|grafico|escala|populac|bacteria/],
  ],
  'Funções trigonométricas': [
    ['Gráficos, período, amplitude e imagem (sen, cos, tg)', /grafico|periodo|amplitude|imagem|maximo|minimo|temperatura|mare|altura|roda-gigante|oscilac|sen|cos/],
    ['Equações e inequações trigonométricas', /equacao|inequacao|solucao|intervalo|2\s*pi|\\pi|conjunto|raiz|raize/],
  ],
  'Trigonometria no triângulo e ciclo': [
    ['Triângulo retângulo (Pitágoras, seno, cosseno, tangente)', /retangulo|hipotenusa|cateto|pitagora|rampa|escada|altura|edificio|predio|torre|sombra|distancia/],
    ['Lei dos senos e lei dos cossenos', /lei do|cosseno|seno|lados medem|angulo|triangulo abc|distancia entre/],
    ['Ciclo trigonométrico, arcos e relações trigonométricas', /ciclo|circunferencia|radiano|quadrante|arco|identidade|relacao|sen|cos|tg|tangente/],
  ],
  'Equações e inequações': [
    ['Equações e inequações do 1º e 2º grau', /equacao|inequacao|desigualdade|1 grau|2 grau|produto|quociente|solucao|raiz|raize|real|reai/],
    ['Função e equação modular', /modulo|modular|\|/],
  ],
  'Progressão aritmética e geométrica': [
    ['Progressão aritmética (PA)', /aritmetica|\bpa\b|p\.a|razao constante|diferenca|termo geral|soma dos.*termo/],
    ['Progressão geométrica (PG) e soma infinita', /geometrica|\bpg\b|p\.g|quociente|dobro|metade|triplo|infinita|limite/],
    ['Sequências numéricas, figuras e padrões', /sequencia|padrao|figura|etapa|linha|coluna|posicao|termo/],
  ],
  'Análise combinatória': [
    ['Princípio fundamental da contagem (PFC)', /maneira|modo|possibilidade|trajeto|caminho|vestir|cardapio|moeda|dado|pintar|cor|core|distinto|quantos numero|quantas forma/],
    ['Permutação simples, fatorial e anagramas', /permuta|fatorial|anagrama|embaralh|fila|ordem|dispor|sentar|assento|cadeira|palavra|letra/],
    ['Permutação com repetição e permutação circular', /circular|roda|mesa|repeti/],
    ['Arranjo simples, senhas e códigos', /arranjo|senha|placa|codigo|podio|primeiro|classific|algarismo/],
    ['Combinação simples, grupos, comissões e geometria', /combinac|comissao|grupo|equipe|time|escolh|selecion|subconjunto|dupla|trio|aperto|diagonal|triangulo|reta|vertice|ponto/],
  ],
  'Probabilidade': [
    ['Probabilidade simples e espaço amostral (dados, urnas, sorteios)', /espaco amostral|urna|bola|dado|moeda|baralho|carta|sorteio|acaso|escolhid|probabilidade de/],
    ['Probabilidade condicional e eventos independentes', /sabendo que|dado que|condicional|independente|sucessiv|reposicao|certeza/],
    ['União de eventos, complementar e distribuição binomial', /pelo menos|no minimo|exatamente|uniao|ou outro|complementar|binomial|tentativa/],
  ],
  'Estatística: média, mediana, desvio': [
    ['Média aritmética simples e ponderada', /media|ponderada|peso|nota|salario|idade|altura|pontuacao/],
    ['Mediana e moda', /mediana|moda|central|frequente|rol/],
    ['Desvio padrão, variância e análise de gráficos/tabelas', /desvio|variancia|dispersao|regular|homogene|grafico|tabela|histograma|setor/],
  ],
  'Matrizes e determinantes': [
    ['Matrizes: operações, produto e inversa', /matriz|linha|coluna|transposta|simetrica|inversa|produto|elemento|tabela/],
    ['Determinantes (Sarrus, Laplace e propriedades)', /determinante|det|sarrus|laplace|singular|invertivel/],
  ],
  'Sistemas lineares': [
    ['Resolução e problemas com sistemas lineares', /sistema|equacao|solucao|preco|comprou|pagou|ingresso|produto|x\s*\+|y\s*\+/],
    ['Discussão e classificação de sistemas (SPD, SPI, SI)', /possivel|indeterminado|impossivel|unica|infinita|nao admite|parametro|homogeneo/],
  ],
  'Geometria plana: áreas e semelhança': [
    ['Congruência e semelhança de triângulos; Tales', /semelhan|congruen|tale|paralela|proporc|sombra|bissetriz|baricentro|mediana|retangulo|hipotenusa|cateto|pitagora|triangulo/],
    ['Polígonos e quadriláteros', /poligono|hexagono|pentagono|octogono|quadrilatero|trapezio|paralelogramo|losango|retangulo|quadrado|diagonal|angulo interno/],
    ['Circunferência e círculo', /circunferencia|circulo|raio|diametro|corda|tangente|arco|setor|coroa|comprimento|perimetro|pi\b|roda/],
    ['Áreas de figuras planas', /\barea\b|superficie|m\^2|cm\^2|m2|cm2|hachurad|sombread|colorid|destacad|terreno|regiao/],
  ],
  'Geometria espacial: prismas e pirâmides': [
    ['Geometria espacial: prismas, cubos e poliedros', /poliedro|euler|face|aresta|vertice|prisma|cubo|paralelepipedo|bloco|caixa|reservatorio|piscina/],
    ['Geometria espacial: pirâmides, tetraedro e troncos', /piramide|tetraedro|octaedro|apotema|tronco/],
  ],
  'Geometria espacial: cilindro, cone e esfera': [
    ['Cilindro e sólidos de revolução', /cilindro|cilindric|lata|tambor|tubo|cano|copo|revolucao|tanque/],
    ['Cone e tronco de cone', /\bcone\b|conic|geratriz|tronco|funil|casquinha|chapeu/],
    ['Esfera, inscrição e circunscrição de sólidos', /esfera|esferic|semiesfera|hemisferio|calota|bola|globo|inscrit|circunscrit/],
  ],
  'Geometria analítica: reta': [
    ['Ponto, distância, ponto médio e área no plano cartesiano', /distancia|ponto medio|baricentro|colinear|alinhad|cartesiano|coordenada|abscissa|ordenada|vertice/],
    ['Equação da reta, coeficiente angular e posições relativas', /reta|coeficiente|declividade|paralela|perpendicular|concorrente|intersec|inclina/],
  ],
  'Geometria analítica: circunferência e cônicas': [
    ['Geometria analítica: circunferência', /circunferencia|centro|raio|x\^2|y\^2|x²|y²|tangente|secante/],
    ['Cônicas: elipse, hipérbole e parábola', /elipse|hiperbole|parabola|foco|diretriz|excentricidade|assintota|conica|orbita/],
  ],
  'Números complexos': [
    ['Forma algébrica, potências de i e conjugado', /imaginari|conjugado|algebrica|parte real|complexo|\bi\b|z\s*=/],
    ['Forma trigonométrica (polar), módulo e argumento', /argumento|modulo|trigonometrica|polar|moivre|afixo|argand|gauss|raiz/],
  ],
  'Polinômios': [
    ['Valor numérico, grau e divisão de polinômios (Briot-Ruffini)', /divisao|quociente|resto|divisivel|briot|ruffini|grau|polinomio\s+p/],
    ['Equações polinomiais, raízes e relações de Girard', /raiz|raize|girard|soma|produto|multiplicidade|fatorad|equacao/],
  ],
  // FÍSICA
  'Cinemática: MU e MUV': [
    ['Grandezas, unidades, ordem de grandeza e velocidade média', /grandeza|unidade|notacao|ordem de grandeza|velocidade media|deslocamento|tempo|km\/h|m\/s|trecho|viagem/],
    ['Movimento uniforme (MU) e encontro de móveis', /movimento uniforme|velocidade constante|encontro|ultrapass|trem|ponte|tunel|posicao/],
    ['Movimento uniformemente variado (MUV), aceleração e gráficos', /aceleracao|variado|freia|frenagem|repouso|grafico|v\s*x\s*t|s\s*x\s*t|torricelli/],
  ],
  'Lançamentos e movimento circular': [
    ['Queda livre e lançamentos (vertical, horizontal e oblíquo)', /queda livre|lancamento|projetil|altura maxima|alcance|vertical|horizontal|obliquo|gravidade/],
    ['Movimento circular (MCU), período, frequência e transmissão', /circular|periodo|frequencia|rpm|hz|angular|centripeta|polia|engrenagem|roda|disco|satelite/],
  ],
  'Leis de Newton': [
    ['1ª, 2ª e 3ª leis de Newton, massa, peso e força elástica', /inercia|resultante|acao e reacao|forca|massa|peso|aceleracao|dinamometro|mola|hooke|elastica/],
    ['Sistemas de blocos, tração, polias e elevadores', /bloco|fio|corda|tracao|polia|roldana|elevador|balanca|apoio/],
  ],
  'Atrito, plano inclinado e força centrípeta': [
    ['Atrito, plano inclinado e polias', /atrito|estatico|cinetico|escorreg|inclinado|rampa|ladeira|coeficiente/],
    ['Dinâmica do movimento circular (força centrípeta)', /centripeta|curva|loop|globo da morte|lombada|depressao|pendulo|circular|raio/],
  ],
  'Trabalho, energia e potência': [
    ['Trabalho de uma força e potência / rendimento', /trabalho|potencia|rendimento|watt|joule|kwh|motor|bomba|forca.*deslocamento/],
    ['Energia cinética, potencial e conservação da energia mecânica', /cinetica|potencial|gravitacional|elastica|mecanica|conservacao|mola|montanha-russa|velocidade|altura/],
  ],
  'Impulso e quantidade de movimento': [
    ['Impulso, força média e teorema do impulso', /impulso|forca media|tempo de contato|air\s*bag|chute|raquete|taco|grafico/],
    ['Quantidade de movimento e colisões (elástica/inelástica)', /quantidade de movimento|momento linear|colisao|choque|explosao|recuo|patinador|conservacao/],
  ],
  'Gravitação': [
    ['Leis de Kepler e órbitas planetárias/satélites', /kepler|orbita|eliptica|planeta|sol|satelite|periodo|raio orbital|afelio|perielio/],
    ['Lei da gravitação universal e campo gravitacional', /gravitacao|newton|forca gravitacional|campo gravitacional|gravidade|massa|escape|mare/],
  ],
  'Estática e hidrostática': [
    ['Estática do ponto material e corpo extenso (torque/alavancas)', /estatica|equilibrio|torque|momento|alavanca|barra|gangorra|centro de massa|apoio|cabo/],
    ['Hidrostática: densidade, pressão, Stevin, Pascal e empuxo', /densidade|pressao|stevin|pascal|prensa|empuxo|arquimede|flutua|submerso|liquido|agua|fluido|manometro|barometro/],
  ],
  'Termologia: calor e dilatação': [
    ['Termometria e escalas termométricas (Celsius, Fahrenheit, Kelvin)', /termometro|escala|celsius|fahrenheit|kelvin|temperatura|graduac/],
    ['Dilatação térmica e propagação de calor (condução, convecção, irradiação)', /dilatacao|comprimento|barra|lamina|bimetalica|volumetrica|conducao|conveccao|irradiacao|isolante|garrafa termica/],
  ],
  'Calorimetria e mudanças de fase': [
    ['Calor sensível, capacidade térmica e equilíbrio térmico', /especifico|sensivel|capacidade termica|equilibrio termico|mistura|calorimetro|aquec|resfria/],
    ['Calor latente, mudanças de estado e diagrama de fases', /latente|fusao|vaporizacao|ebulicao|solidificacao|condensacao|sublimacao|gelo|vapor|mudanca de fase|diagrama/],
  ],
  'Gases e termodinâmica': [
    ['Transformações gasosas e equação de Clapeyron (gás ideal)', /isotermic|isobaric|isocoric|isovolumetric|clapeyron|gas ideal|gas perfeito|p\s*\.\s*v|pressao.*volume|mol/],
    ['1ª e 2ª leis da termodinâmica, ciclos e máquinas térmicas (Carnot)', /termodinamica|energia interna|trabalho|adiabatic|ciclo|maquina termica|carnot|rendimento|refrigerador|fonte quente|fonte fria/],
  ],
  'Ondas e acústica': [
    ['Ondas: conceitos, equação fundamental (v = λ·f) e MHS', /comprimento de onda|frequencia|periodo|velocidade de propagacao|transversal|longitudinal|eletromagnetica|mecanica|mhs|oscilac|pendulo/],
    ['Fenômenos ondulatórios (reflexão, refração, difração, interferência)', /reflexao|refracao|difracao|interferencia|polarizacao|ressonancia|estacionaria/],
    ['Acústica: som, cordas, tubos sonoros e efeito Doppler', /som|sonor|acustica|altura|intensidade|timbre|decibel|corda|tubo|doppler|eco|sonar|ultrassom/],
  ],
  'Óptica geométrica: espelhos': [
    ['Princípios da óptica, sombra, câmara escura e espelho plano', /propagacao retilinea|sombra|penumbra|eclipse|camara escura|espelho plano|angulo de incidencia|reflexao/],
    ['Espelhos esféricos (côncavo e convexo) e equação de Gauss', /concavo|convexo|esferico|foco|distancia focal|centro de curvatura|real|virtual|direta|invertida|aumento/],
  ],
  'Óptica geométrica: lentes e olho humano': [
    ['Refração da luz, lei de Snell, índice de refração e reflexão total', /refracao|snell|indice de refracao|angulo limite|reflexao total|fibra optica|dioptro|prisma|dispersao|arco-iris/],
    ['Lentes esféricas e óptica da visão (miopia, hipermetropia, instrumentos)', /lente|convergente|divergente|focal|vergencia|dioptria|olho|visao|miopia|hipermetropia|astigmatismo|presbiopia|retina|lupa|microscopio/],
  ],
  'Eletrostática': [
    ['Eletrização (atrito, contato, indução) e condutores/isolantes', /eletrizacao|atrito|contato|inducao|esfera|condutor|isolante|eletron|terra/],
    ['Lei de Coulomb e força elétrica entre cargas', /coulomb|forca eletrica|carga|distancia|repulsao|atracao/],
  ],
  'Campo e potencial elétrico': [
    ['Campo elétrico e linhas de força', /campo eletrico|linha de forca|vetor campo|uniforme|carga de prova/],
    ['Potencial elétrico, ddp, trabalho e capacitores', /potencial|equipotencial|diferenca de potencial|ddp|trabalho|energia potencial|capacitor|condensador/],
  ],
  'Corrente, resistores e circuitos': [
    ['Corrente elétrica e 1ª e 2ª leis de Ohm', /corrente|ampere|resistencia|ohm|resistividade|fio|comprimento|area|grafico.*u.*i/],
    ['Circuitos: associação (série/paralelo), medidores e geradores', /serie|paralelo|equivalente|circuito|amperimetro|voltimetro|gerador|receptor|forca eletromotriz|curto-circuito|chave|lampada/],
  ],
  'Potência elétrica e consumo': [
    ['Potência elétrica, efeito Joule e resistores de aquecimento', /potencia|watt|joule|aquecedor|chuveiro|lampada|fusivel|disjuntor/],
    ['Consumo de energia elétrica (kWh) e eficiência energética', /consumo|kwh|conta|energia eletrica|mes|dia|hora|custo|tarifa/],
  ],
  'Magnetismo e força magnética': [
    ['Ímãs, campo magnético terrestre e campo gerado por corrente', /ima|polo norte|polo sul|bussola|campo magnetico|fio retilineo|espira|bobina|solenoide|regra da mao/],
    ['Força magnética sobre cargas e condutores', /forca magnetica|particula|carga.*campo|trajetoria circular|condutor|motor eletrico/],
  ],
  'Indução eletromagnética': [
    ['Fluxo magnético e Lei de Faraday-Lenz (corrente induzida)', /fluxo|inducao|faraday|lenz|corrente induzida|fem|espira|ima/],
    ['Transformadores, transmissão em alta tensão e geradores CA', /transformador|primario|secundario|enrolamento|alternada|usina|gerador|tensao/],
  ],
  'Física moderna': [
    ['Efeito fotoelétrico, fótons, dualidade onda-partícula e Bohr', /fotoeletrico|foton|planck|quantica|bohr|nivel de energia|espectro|comprimento de onda/],
    ['Relatividade restrita e física nuclear / partículas', /relatividade|einstein|velocidade da luz|nuclear|massa|energia/],
  ],
  // QUÍMICA
  'Matéria, substâncias e separação de misturas': [
    ['Estados físicos, propriedades da matéria, substâncias e misturas', /estado fisico|fusao|ebulicao|densidade|substancia|simples|composta|alotrop|homogenea|heterogenea|fase|componente|eutetica|azeotropica/],
    ['Processos de separação de misturas e tratamento de água', /filtracao|decantacao|destilacao|fracionada|centrifugacao|peneiracao|levigacao|flotacao|extracao|tratamento|separar|separacao/],
  ],
  'Modelos atômicos e distribuição eletrônica': [
    ['Modelos atômicos (Dalton, Thomson, Rutherford, Bohr) e partículas', /dalton|thomson|rutherford|bohr|modelo|proton|neutron|eletron|numero atomico|massa|isotopo|isobaro|isotono/],
    ['Distribuição eletrônica, camadas de valência e íons', /distribuicao|camada|subnivel|valencia|configuracao|ion|cation|anion|orbital|quantico/],
  ],
  'Tabela periódica e propriedades periódicas': [
    ['Classificação periódica (famílias, períodos, metais e ametais)', /tabela|periodica|familia|grupo|periodo|alcalino|halogenio|gas nobre|metal|ametal|transicao/],
    ['Propriedades periódicas (raio, energia de ionização, eletronegatividade)', /raio|ionizacao|eletronegatividade|afinidade|eletropositividade|propriedade/],
  ],
  'Ligações químicas': [
    ['Ligação iônica e compostos iônicos', /ionica|transferencia|cation|anion|reticulo|conduz|fundido/],
    ['Ligação covalente, metálica e regra do octeto', /covalente|metalica|compartilh|octeto|par de eletron|liga|formula/],
  ],
  'Funções inorgânicas: ácidos, bases, sais e óxidos': [
    ['Ácidos e bases (Arrhenius, força, nomenclatura e neutralização)', /acido|base|hidroxido|arrheniu|ionizacao|dissociacao|neutralizacao|indicador|fenolftaleina|tornassol/],
    ['Sais e óxidos (classificação, nomenclatura e chuva ácida)', /\bsal\b|\bsais\b|oxido|carbonato|bicarbonato|sulfato|nitrato|cloreto|anfoter|chuva acida|cal\b/],
  ],
  'Reações inorgânicas e balanceamento': [
    ['Classificação de reações e balanceamento estequiométrico', /balanceamento|coeficiente|sintese|decomposicao|simples troca|dupla troca|deslocamento|precipitacao/],
    ['Número de oxidação (NOX) e reações de oxirredução', /nox|oxidacao|reducao|oxidante|redutor|numero de oxidacao/],
  ],
  'Cálculo estequiométrico e mol': [
    ['Mol, constante de Avogadro, massa molar e fórmulas', /avogadro|6,0|6\.0|10\^23|massa molar|formula minima|molecular|percentual|quantidade de materia|atomo|molecula/],
    ['Estequiometria: massa, volume, pureza, rendimento e reagente limitante', /reacao|equacao|produz|obtido|rendimento|pureza|impureza|limitante|excesso|volume molar|cnpt|c\.n\.t\.p|estequiometr/],
  ],
  'Gases': [
    ['Transformações gasosas e equação de Clapeyron (PV = nRT)', /pressao|volume|temperatura|clapeyron|atm|mmhg|litro|mol/],
    ['Misturas gasosas, pressão parcial, densidade e difusão (Graham)', /mistura|parcial|dalton|difusao|efusao|graham|densidade/],
  ],
  'Soluções e concentrações': [
    ['Solubilidade, curvas de solubilidade e saturação', /solubilidade|saturada|insaturada|supersaturada|precipitado|corpo de fundo|curva|coeficiente/],
    ['Concentração comum, molaridade, título, ppm, diluição e titulação', /concentracao|mol\/l|molar|g\/l|titulo|porcentagem|ppm|diluicao|mistura|titulacao|volume.*solucao/],
  ],
  'Termoquímica': [
    ['Reações endotérmicas/exotérmicas, entalpia de reação e combustão', /endotermic|exotermic|entalpia|calor|combustao|formacao|kj|kcal|absorve|libera|\bdh\b|delta\s*h/],
    ['Lei de Hess e energia de ligação', /hess|etapa|intermediaria|energia de ligacao|quebra|ligac/],
  ],
  'Cinética química': [
    ['Velocidade média, teoria das colisões e energia de ativação', /velocidade|colis|ativacao|complexo ativado|grafico.*energia/],
    ['Fatores que alteram a velocidade (catalisador, temperatura, superfície) e lei da velocidade', /catalisador|superficie de contato|temperatura|concentracao|ordem|k\s*\[|experimento|tabela/],
  ],
  'Equilíbrio químico': [
    ['Constante de equilíbrio (Kc e Kp) e grau de equilíbrio', /constante|kc|kp|equilibrio|concentracao|pressao parcial|reversivel/],
    ['Deslocamento de equilíbrio (Princípio de Le Chatelier)', /desloca|chatelier|aumenta|diminui|adicao|pressao|temperatura|catalisador|rendimento/],
  ],
  'Equilíbrio iônico: pH e pOH': [
    ['Acidez, basicidade, cálculo de pH, pOH e Ka/Kb', /\bph\b|\bpoh\b|h\+|h3o\+|oh-|ionizacao|ka\b|kb\b|kw\b|log|concentracao.*ion/],
    ['Hidrólise salina, solução-tampão e produto de solubilidade (Kps)', /hidrolise|tampao|solubilidade|kps|precipita|bicarbonato|sangue/],
  ],
  'Eletroquímica: pilhas': [
    ['Pilhas eletroquímicas (Daniell), ânodo, cátodo e ddp (ΔEº)', /pilha|daniell|anodo|catodo|potencial|ddp|forca eletromotriz|ponte salina/],
    ['Espontaneidade de reações redox, corrosão e metal de sacrifício', /reduz|oxida|eletron|espontane|corrosao|sacrificio|ferrugem|galvaniz/],
  ],
  'Eletrólise': [
    ['Eletrólise ígnea e aquosa (descarga de íons)', /eletrolise|ignea|aquosa|anodo|catodo|eletrodo|descarga/],
    ['Estequiometria da eletrólise (Leis de Faraday, Q = i·t)', /faraday|corrente|coulomb|ampere|tempo|massa.*depositad|galvanoplastia/],
  ],
  'Radioatividade': [
    ['Emissões radioativas (alfa, beta, gama), fissão e fusão nuclear', /alfa|beta|gama|radioativ|decaimento|nucleo|fissao|fusao|nuclear|urani|cesio|particula/],
    ['Tempo de meia-vida e datação por carbono-14', /meia-vida|semidesintegracao|carbono|restar|reduz|tempo|atividade/],
  ],
  'Química orgânica: hidrocarbonetos e nomenclatura': [
    ['Carbono, classificação de cadeias carbônicas e hibridização', /cadeia|aberta|fechada|aromatica|saturada|insaturada|homogenea|heterogenea|ramificada|carbono|sp2|sp3|sigma|pi\b/],
    ['Hidrocarbonetos, petróleo e nomenclatura IUPAC', /hidrocarboneto|alcano|alceno|alcino|benzeno|aromatico|petroleo|destilacao|octanagem|iupac|metano|etano|butano|propano/],
  ],
  'Funções orgânicas oxigenadas e nitrogenadas': [
    ['Funções oxigenadas (álcool, fenol, aldeído, cetona, ácido, éster, éter)', /alcool|hidroxila|fenol|aldeido|cetona|carbonila|carboxil|acido|ester|eter\b|funcao|grupo funcional/],
    ['Funções nitrogenadas (amina, amida) e propriedades físicas/acidez orgânica', /amina|amida|nitrogenad|basico|acidez|ponto de ebulicao|solubilidade|ligacao de hidrogenio/],
  ],
  'Isomeria plana e espacial': [
    ['Isomeria plana (função, cadeia, posição, metameria, tautomeria)', /plana|funcao|cadeia|posicao|compensacao|metameria|tautomeria|formula molecular/],
    ['Isomeria espacial: geométrica (cis-trans) e óptica (carbono quiral)', /espacial|geometrica|cis|trans|optica|quiral|assimetrico|enantiomero|diastereoisomero|luz polarizada|racemic/],
  ],
  'Reações orgânicas: substituição e adição': [
    ['Reações de adição (alcenos, alcinos, Markovnikov)', /adicao|hidrogenacao|halogenacao|hidratacao|markovnikov|alceno|alcino|dupla ligacao/],
    ['Reações de substituição (alcanos e aromáticos) e eliminação', /substituicao|eliminacao|benzeno|aromatic|alcano|haleto|desidratacao/],
  ],
  'Reações orgânicas: oxidação, redução e esterificação': [
    ['Esterificação, hidrólise, saponificação (sabão) e transesterificação (biodiesel)', /esterificacao|hidrolise|saponificacao|sabao|detergente|transesterificacao|biodiesel|ester/],
    ['Oxidação de álcoois e alcenos (ozonólise, energética) e redução', /oxidacao|ozonolise|permanganato|dicromato|alcool primario|alcool secundario|aldeido|cetona|reducao/],
  ],
  // BIOLOGIA
  'Química da vida: água, sais, carboidratos, lipídios': [
    ['Água e sais minerais', /agua|sal mineral|sais minerai|ferro|calcio|iodo|sodio|potassio|hidratac|solvente|termorregulac/],
    ['Carboidratos, lipídios e vitaminas', /carboidrato|glicid|amido|glicogenio|celulose|glicose|lipidio|gordura|colesterol|fosfolipidio|vitamina|escorbuto|raquitismo/],
  ],
  'Proteínas e enzimas': [
    ['Estrutura e funções das proteínas; aminoácidos e desnaturação', /proteina|aminoacido|peptid|desnaturacao|temperatura|estrutura|colageno|hemoglobina/],
    ['Enzimas: ação catalítica, chave-fechadura, pH e temperatura ótima', /enzima|catalis|substrato|sitio ativo|chave-fechadura|velocidade|ph\b/],
  ],
  'Ácidos nucleicos: DNA e RNA': [
    ['Estrutura do DNA, nucleotídeos, pareamento de bases e replicação', /dna|nucleotideo|adenina|timina|citosina|guanina|dupla-helice|replicacao|semiconservativa|fita/],
    ['RNA (mensageiro, transportador, ribossômico) e transcrição', /rna|uracila|transcricao|mensageiro|transportador|ribossomico/],
  ],
  'Citologia: membrana e transporte': [
    ['Membrana plasmática (mosaico fluido) e especializações', /membrana|fosfolipidio|bicamada|mosaico|glicocalix|microvilosidade|desmossomo|parede celular/],
    ['Transporte passivo (difusão, osmose) e transporte ativo (bomba Na+/K+)', /osmose|difusao|hipertonic|hipotonic|isotonic|plasmolise|turgid|transporte ativo|bomba de sodio|fagocitose|pinocitose/],
  ],
  'Organelas e metabolismo energético': [
    ['Retículo endoplasmático, complexo de Golgi, ribossomos e secreção celular', /reticulo|ribossomo|golgi|secrecao|sintese/],
    ['Lisossomos, peroxissomos, mitocôndrias, cloroplastos e endossimbiose', /lisossomo|digestao intracelular|autofagia|mitocondria|cloroplasto|peroxissomo|centriolo|endossimbio|organela/],
  ],
  'Respiração celular e fermentação': [
    ['Respiração aeróbica (glicólise, ciclo de Krebs, cadeia respiratória)', /respiracao|aerob|glicolise|krebs|cadeia respiratoria|fosforilacao|mitocondria|atp|oxigenio/],
    ['Fermentação alcoólica e láctica', /fermentacao|anaerob|alcoolica|lactica|levedura|fungo|pao|vinho|cerveja|caimbra|muscul/],
  ],
  'Fotossíntese e quimiossíntese': [
    ['Etapas da fotossíntese (fotoquímica/clara e química/Calvin) e clorofila', /clorofila|cloroplasto|tilacoide|estroma|calvin|fotolise|atp|nadph|oxigenio/],
    ['Fatores limitantes da fotossíntese, ponto de compensação fótico e quimiossíntese', /compensacao|fator|intensidade luminosa|taxa|co2|temperatura|quimiossintese/],
  ],
  'Núcleo, ciclo celular, mitose e meiose': [
    ['Núcleo, cromossomos, cariótipo e ciclo celular (intérfase)', /nucleo|cromatina|cromossomo|cariotipo|ploide|2n\b|interfase|fase s|dna|quantidade de dna/],
    ['Mitose, meiose, crossing-over e gametogênese', /mitose|meiose|profase|metafase|anafase|telofase|crossing|permutacao|homologo|cromatide|gamet/],
  ],
  '1ª e 2ª leis de Mendel': [
    ['1ª lei de Mendel, monoibridismo e probabilidade em genética', /1.*lei|primeira lei|monoibrid|dominante|recessivo|heterozigot|homozigot|alelo|cruzamento|probabilidade|fenotipo|genotipo/],
    ['Heredogramas (genealogias) e 2ª lei de Mendel (segregação independente)', /heredograma|genealogia|casal|filho|afetad|normal|2.*lei|segunda lei|diibrid|independente|9:3:3:1/],
  ],
  'Heranças: ligada ao sexo, alelos múltiplos, ABO e Rh': [
    ['Grupos sanguíneos (sistema ABO, fator Rh e eritroblastose fetal)', /\babo\b|sanguineo|sangue|aglutin|doador|receptor|\brh\b|eritroblastose|transfusao/],
    ['Herança ligada ao sexo (daltonismo, hemofilia) e alelos múltiplos', /sexo|cromossomo x|daltonismo|hemofilia|pelagem|coelho|codominancia/],
  ],
  'Ligação gênica, interação gênica e genética de populações': [
    ['Ligação gênica (linkage) e interação gênica / epistasia / herança quantitativa', /ligacao|linkage|recombinacao|morgan|mapa|interacao|epistasia|poligenica|quantitativa/],
    ['Genética de populações (equilíbrio de Hardy-Weinberg)', /populac|hardy|weinberg|frequencia|p\^2|2pq|q\^2|equilibrio/],
  ],
  'Biotecnologia: DNA recombinante, PCR, CRISPR': [
    ['DNA recombinante, transgênicos, clonagem e células-tronco', /transgenic|recombinante|restricao|plasmideo|bacteria|insulina|clonagem|celula-tronco/],
    ['PCR, eletroforese (teste de DNA/paternidade), edição gênica (CRISPR) e terapia gênica', /pcr|eletroforese|paternidade|banda|crispr|edicao|terapia genica|sequenciamento/],
  ],
  'Evolução: Darwin, seleção natural e especiação': [
    ['Teorias evolutivas (Lamarck, Darwin, Neodarwinismo) e seleção natural', /lamarck|darwin|selecao natural|mutacao|variabilidade|adaptacao|resistencia|antibiotico|inseticida|bacteria/],
    ['Especiação, isolamento reprodutivo, homologia/analogia e cladogramas', /especiacao|isolamento|alopatrica|simpatrica|homolog|analog|convergencia|irradiacao|filogen|cladograma|ancestral/],
  ],
  'Ecologia: cadeias, ciclos e pirâmides': [
    ['Cadeias e teias alimentares, fluxo de energia, pirâmides e bioacumulação', /cadeia|teia|trofico|produtor|consumidor|decompositor|energia|biomassa|piramide|bioacumulacao|magnificacao/],
    ['Ciclos biogeoquímicos (nitrogênio, carbono, água, oxigênio)', /ciclo|nitrogenio|fixacao|nitrificacao|desnitrificacao|leguminosa|rizobio|carbono|efeito estufa|agua|oxigenio|fosforo/],
  ],
  'Relações ecológicas e sucessão': [
    ['Relações ecológicas (intra/interespecíficas) e dinâmica de populações', /relacao|mutualismo|protocooperacao|comensalismo|inquilinismo|parasitismo|predacao|competicao|sociedade|colonia|populac|curva de crescimento/],
    ['Sucessão ecológica (pioneira, clímax) e produtividade', /sucessao|pioneir|climax|primaria|secundaria|produtividade|liquida|bruta/],
  ],
  'Biomas brasileiros e impacto ambiental': [
    ['Biomas brasileiros e mundiais (Amazônia, Cerrado, Caatinga, Mata Atlântica)', /bioma|amazonia|cerrado|caatinga|mata atlantica|pantanal|pampa|manguezal|tundra|taiga|savana/],
    ['Impactos ambientais (eutrofização, efeito estufa, desmatamento, poluição)', /eutrofizacao|esgoto|alga|efeito estufa|aquecimento|inversao termica|chuva acida|desmatamento|poluicao|biodiversidade|extincao/],
  ],
  'Bactérias, protozoários e doenças': [
    ['Bactérias: biologia e bacterioses', /bacteria|procariont|antibiotico|tuberculose|tetano|colera|leptospirose|meningite|sifilis|botulismo|hanseniase/],
    ['Protozoários, protozooses (malária, Chagas, leishmaniose) e verminoses', /protozoario|malaria|plasmodio|chaga|barbeiro|trypanosoma|leishmaniose|amebiase|giardiase|esquistossomose|tenia|lombriga|ascaris|ciclo|vetor|hospedeiro/],
  ],
  'Classificação e vírus': [
    ['Sistemática, taxonomia, cladística e reinos dos seres vivos', /taxonomia|especie|genero|familia|reino|dominio|cladograma|filogenet|cientifico|nomenclatura|lineu/],
    ['Vírus: estrutura, replicação e viroses (dengue, febre amarela, HIV, gripe)', /virus|viral|capsideo|bacteriofago|retrovirus|hiv|aids|dengue|aedes|febre amarela|zika|sarampo|raiva|gripe|vacina/],
  ],
  'Botânica: gimnospermas e angiospermas': [
    ['Evolução vegetal, alternância de gerações e gimnospermas (semente/pólen)', /briofita|pteridofita|esporofito|gametofito|gimnosperma|pinheiro|conifera|semente|polen|tubo polinico/],
    ['Angiospermas: flor, fecundação dupla, fruto, semente e polinização', /angiosperma|flor|fruto|ovario|fecundacao|endosperma|polinizacao|dispersao|monocotiledonea|dicotiledonea/],
  ],
  'Fisiologia vegetal: hormônios e tropismos': [
    ['Condução de seiva (xilema/floema), transpiração e estômatos', /seiva|xilema|floema|transpiracao|estomato|coesao|tensao|absorcao|raiz|anel de malpighi/],
    ['Hormônios vegetais (auxina, etileno), fototropismo e fotoperiodismo', /hormonio|fitormonio|auxina|etileno|amadurecimento|giberelina|citocinina|abscisico|tropismo|fototropismo|fotoperiod/],
  ],
  'Digestão e nutrição humana': [
    ['Órgãos do tubo digestório, glândulas anexas (fígado/bile, pâncreas) e absorção', /boca|esofago|estomago|intestino|figado|vesicula|bile|pancreas|absorcao|vilosidade|flora/],
    ['Enzimas digestivas (amilase, pepsina, tripsina, lipase) e ação do pH', /enzima|amilase|ptialina|pepsina|tripsina|lipase|ph\b|acido|basico|proteina|amido/],
  ],
  'Respiração e circulação humana': [
    ['Sistema respiratório, hematose, transporte de gases e controle bulbar', /respirat|pulmao|alveolo|hematose|diafragma|inspiracao|expiracao|hemoglobina|oxigenio|gas carbonico|bicarbonato|bulbo/],
    ['Sistema cardiovascular, coração, circulação pulmonar/sistêmica e sangue', /coracao|atrio|ventriculo|arteria|veia|capilar|circulacao|sangu|pressao arterial|hemacia|leucocito|plaqueta|linfa/],
  ],
  'Excreção e homeostase': [
    ['Sistema urinário, néfron (filtração e reabsorção) e controle hormonal (ADH/aldosterona)', /rim\b|rins|nefron|urina|filtracao|reabsorcao|glicose|adh|antidiuretico|aldosterona/],
    ['Excretas nitrogenadas (amônia, ureia, ácido úrico) e osmorregulação', /amonia|ureia|acido urico|osmorregulac|peixe|ave|reptil|mamifero|homeostase/],
  ],
  'Sistema nervoso e órgãos dos sentidos': [
    ['Neurônio, impulso nervoso, bomba de Na+/K+ e sinapse química', /neuronio|axonio|dendrito|impulso|despolarizacao|bainha de mielina|sinapse|neurotransmissor/],
    ['Sistema nervoso central, arco reflexo, autônomo (simpático/parassimpático) e sentidos', /encefalo|cerebro|cerebelo|bulbo|medula|arco reflexo|simpatico|parassimpatico|adrenalina|acetilcolina|visao|audicao|olho|ouvido/],
  ],
  'Sistema endócrino e reprodução humana': [
    ['Glândulas endócrinas e hormônios (hipófise, tireoide, insulina/glucagon, suprarrenais)', /hipofise|tireoide|insulina|glucagon|glicemia|diabete|adrenalina|cortisol|hormonio|glandula|feedback/],
    ['Sistema reprodutor, ciclo menstrual (FSH, LH, estrógeno, progesterona) e métodos contraceptivos', /menstrual|ovulacao|fsh|\blh\b|estrogeno|progesterona|utero|endometrio|ovario|testiculo|testosterona|fecundacao|gravidez|placenta|contraceptiv|pilula/],
  ],
  'Imunologia: vacinas e soros': [
    ['Imunidade inata/adaptativa, antígenos, anticorpos e células de defesa', /antigeno|anticorpo|imunidade|linfocito|macrofago|leucocito|resposta imune|memoria/],
    ['Imunização ativa (vacinas) e passiva (soros e anticorpos maternos)', /vacina|soro|ativa|passiva|peconhent|ofidic|tetan|campanha/],
  ],
  // HISTÓRIA
  'Antiguidade: Grécia e Roma': [
    ['Pré-história e Antiguidade Oriental (Egito, Mesopotâmia, Hebreus, Persas)', /pre-historia|neolitico|paleolitico|egito|farao|mesopotamia|hamurabi|hebreu|fenicio|persa|rio nilo|tigre|eufrate/],
    ['Grécia Antiga (pólis, democracia ateniense, Esparta, cultura e helenismo)', /grecia|grego|atena|esparta|polis|democracia|cidadania|escrav|filosofia|helenis|olimpiada/],
    ['Roma Antiga (República, Império, direito, plebeus/patrícios e crise)', /roma|romano|patricio|plebeu|senado|republica|imperio|cesar|augusto|gladiador|cristianismo|barbaro/],
  ],
  'Idade Média e feudalismo': [
    ['Alta Idade Média, Império Bizantino, Islã e Reino Carolíngio', /bizantino|justiniano|isla|muculmano|maome|arabe|carolingio|carlos magno|barbaro/],
    ['Feudalismo, sociedade estamental, Igreja Católica, Cruzadas e crise do séc. XIV', /feudal|feudo|servidao|servo|suserano|vassalo|clero|nobreza|igreja|cruzada|peste|burguesia|comercio|renascimento comercial/],
  ],
  'Brasil Colônia: economia e sociedade': [
    ['Economia açucareira, engenho, escravidão e invasões holandesas', /acucar|engenho|cana|nordeste|holande|nassau|escrav|trafico|quilombo|palmare|senhor de engenho/],
    ['Bandeirantismo, missões jesuíticas, ciclo do ouro (mineração) e revoltas coloniais', /bandeirante|jesuita|indigena|ouro|mineracao|minas gerai|derrama|quinto|diamante|inconfidencia|conjura/],
  ],
  'Brasil Império': [
    ['Primeiro Reinado (D. Pedro I, 1824) e Período Regencial (revoltas provinciais)', /primeiro reinado|pedro i\b|1824|poder moderador|confederacao do equador|abdica|regencia|cabanagem|farroupilha|balaiada|sabina|male/],
    ['Segundo Reinado (D. Pedro II, café, Guerra do Paraguai, imigração e abolição)', /segundo reinado|pedro ii|cafe|paraguai|abolic|lei aurea|escrav|imigrante|republican|1888|1889/],
  ],
  'República Velha': [
    ['Oligarquias, política do café com leite, coronelismo e economia cafeeira', /oligarquia|coronel|voto de cabresto|cafe|governadore|taubate|espada|floriano|deodoro|1891/],
    ['Movimentos sociais e revoltas (Canudos, Contestado, Vacina, Chibata, tenentismo, operários)', /canudo|conselheiro|contestado|vacina|oswaldo cruz|chibata|joao candido|tenentismo|coluna prestes|operario|greve/],
  ],
  'Era Vargas': [
    ['Era Vargas (1930–1945: Revolução de 30, Estado Novo, trabalhismo e industrialização)', /varga|getulio|1930|1932|1937|estado novo|dip\b|clt|trabalhismo|populismo|industrializacao|csn|vale/],
    ['República de 1946 a 1964 (Dutra, Vargas, JK, Jânio e Jango)', /1946|dutra|juscelino|jk\b|kubitschek|brasilia|50 anos em 5|meta|janio|goulart|jango|reformas de base|1964/],
  ],
  'Segunda Guerra e Guerra Fria': [
    ['Segunda Guerra Mundial, nazifascismo e Holocausto', /segunda guerra|nazis|hitler|fascis|mussolini|holocausto|judeu|eixo|aliado|1939|1945|hiroshima|stalingrado/],
    ['Guerra Fria (EUA x URSS, bipolaridade) e descolonização da África e Ásia', /guerra fria|uniao sovietica|urss|socialis|capitalis|berlim|otan|varsovia|cuba|vietna|coreia|descolonizacao|africa|asia|apartheid/],
  ],
  'Ditadura militar brasileira': [
    ['Golpe de 1964, AI-5, repressão, censura e resistência', /1964|1968|ai-5|ato institucional|censura|repressao|tortura|exilio|guerrilha|tropicalia/],
    ['Milagre econômico, crise, abertura política, Anistia e Diretas Já', /milagre economico|medici|geisel|figueiredo|abertura|anistia|diretas ja|greve|abc|inflacao|divida/],
  ],
  // GEOGRAFIA
  'Cartografia e orientação': [
    ['Escalas, projeções cartográficas (Mercator, Peters), coordenadas e curvas de nível', /escala|mapa|projecao|mercator|peters|cilindrica|conica|latitude|longitude|coordenada|paralelo|meridiano|curva de nivel|topografi|sensoriamento|satelite/],
    ['Fusos horários, movimentos da Terra (rotação/translação) e estações do ano', /fuso|horario|greenwich|rotacao|translacao|solsticio|equinocio|estacao|insolacao/],
  ],
  'Geologia, relevo e solos': [
    ['Placas tectônicas, vulcanismo, estrutura geológica e relevo brasileiro', /placa|tectonic|terremoto|sism|vulcao|magma|rocha|sedimentar|escudo|bacia|planalto|planicie|depressao|relevo/],
    ['Solos: intemperismo, erosão (voçoroca, lixiviação) e conservação', /intemperismo|solo|erosao|lixiviacao|laterizacao|vocoroca|assoreamento|deslizamento|curva de nivel|terraceamento/],
  ],
  'Climatologia e fenômenos climáticos': [
    ['Fatores e elementos climáticos, massas de ar e climas do Brasil e do mundo', /clima|temperatura|umidade|pressao atmosferica|massa de ar|frente fria|pluvio|chuva|climograma|tropical|equatorial|semiarido|subtropical|moncao/],
    ['Fenômenos e mudanças climáticas (El Niño, La Niña, ilha de calor, efeito estufa)', /el nino|la nina|ilha de calor|inversao termica|efeito estufa|aquecimento|mudanca climatica|camada de ozonio/],
  ],
  'Biomas e questão ambiental': [
    ['Biomas e domínios morfoclimáticos (Ab\'Sáber)', /dominio|morfoclimatico|ab.?saber|amazon|cerrado|caatinga|mares de morro|araucaria|pradaria|pantanal|mangue|vegetacao/],
    ['Questão ambiental, desmatamento e conferências/acordos internacionais', /desmatamento|queimada|sustentavel|conferencia|acordo de paris|kyoto|rio-92|poluicao|biodiversidade|conservacao|impacto/],
  ],
  'População: demografia e migrações': [
    ['Transição demográfica, pirâmide etária, natalidade, envelhecimento e PEA', /populac|demograf|natalidade|mortalidade|fecundidade|piramide etaria|envelhecimento|expectativa de vida|pea\b|bonus demografico/],
    ['Migrações internas (êxodo rural, inter-regionais) e internacionais (refugiados)', /migrac|imigrante|emigrante|refugiad|exodo|fluxo|fronteira|xenofobia|deslocamento/],
  ],
  'Urbanização': [
    ['Rede e hierarquia urbana, metropolização, conurbação e cidades globais', /rede urbana|hierarquia|metropole|megacidade|megalopole|conurbacao|cidade global|urbanizacao/],
    ['Problemas urbanos, segregação socioespacial, gentrificação e mobilidade', /periferia|favela|segregacao|mobilidade|transporte|saneamento|moradia|gentrificacao|enchente|violencia/],
  ],
  'Agropecuária no Brasil e no mundo': [
    ['Agronegócio, modernização agrícola, Revolução Verde, commodities e fronteira agrícola', /agronegocio|soja|commodit|revolucao verde|transgenic|irrigacao|mecanizacao|exporta|centro-oeste|matopiba/],
    ['Questão agrária, estrutura fundiária, agricultura familiar e reforma agrária', /latifundio|reforma agraria|familiar|campon|terra|conflito|mst\b|concentracao fundiaria/],
  ],
  'Industrialização e matriz energética': [
    ['Revoluções industriais, modelos produtivos (fordismo, toyotismo) e indústria no Brasil', /industr|fabrica|fordismo|toyotismo|tecnopol|desconcentracao|sudeste|multinacional/],
    ['Energia e matriz energética (hidrelétrica, solar, eólica, petróleo, nuclear, biomassa)', /energia|eletrica|matriz|hidreletrica|petroleo|carvao|gas natural|nuclear|solar|eolica|biomassa|etanol|renovave|combustivel/],
  ],
  'Globalização e blocos econômicos': [
    ['Globalização, fluxos comerciais/financeiros, multinacionais e transportes', /globalizacao|comercio|exporta|importa|fluxo|financeiro|transporte|ferrovia|rodovia|porto|rede/],
    ['Blocos econômicos (UE, Mercosul, USMCA, BRICS) e organismos internacionais', /bloco|uniao europeia|mercosul|nafta|usmca|brics|tarifa|alfandega|omc\b|fmi\b/],
  ],
  'Geopolítica e conflitos atuais': [
    ['Ordem mundial, potências (EUA, China, Rússia, UE) e organismos internacionais (ONU)', /ordem mundial|potencia|hegem|china|estados unidos|russia|ucrania|onu\b|conselho de seguranca|otan/],
    ['Conflitos regionais, Oriente Médio, questão Palestina, África e fronteiras', /oriente medio|israel|palestina|arabe|ira\b|curdo|caxemira|separatis|terrorismo|fronteira|refugiad/],
  ],
  // PORTUGUÊS
  'Interpretação de texto e tipologia': [
    ['Compreensão e inferência textual (textos argumentativos, jornalísticos e científicos)', /texto|autor|artigo|noticia|reportagem|argument|tese|opiniao|ponto de vista|infere|depreende|objetivo/],
    ['Charges, tirinhas, cartuns, propagandas e textos multimodais (verbal e não verbal)', /tira|tirinha|charge|cartum|quadrinho|imagem|propaganda|anuncio|campanha|cartaz|humor|ironia|verbal/],
    ['Semântica, sentido conotativo/denotativo, ambiguidade e intertextualidade', /sentido|significado|expressao|contexto|metafor|conotat|denotat|ambiguidade|intertextual|parodia|parafrase/],
  ],
  'Gêneros textuais e funções da linguagem': [
    ['Funções da linguagem (referencial, emotiva, conativa, fática, metalinguística, poética) e gêneros', /funcao da linguagem|referencial|emotiva|conativa|apelativa|fatica|metalinguistica|poetica|genero textual|cronica|editorial|carta/],
    ['Variação linguística, norma-padrão, oralidade e preconceito linguístico', /variacao|variedade|norma-padrao|coloquial|formal|informal|oralidade|regional|giria|preconceito linguistico|fala/],
  ],
  'Coesão e coerência': [
    ['Coesão referencial (pronomes, elipse, retomadas e progressão textual)', /pronome|retoma|refere|substitui|antecedente|elemento coesivo|referencia/],
    ['Coesão sequencial: conectivos e valores lógico-semânticos (oposição, causa, concessão)', /conectivo|conjuncao|oposicao|causa|consequencia|concessao|condicao|finalidade|conclusao|adicao|sentido/],
  ],
  'Morfologia e classes de palavras': [
    ['Formação de palavras (derivação e composição) e ortografia/acentuação', /prefixo|sufixo|derivacao|composicao|formacao|radical|neologismo|ortografi|acentuac/],
    ['Classes de palavras I: substantivo, adjetivo, pronome, artigo e numeral', /substantivo|adjetivo|pronome|artigo|numeral|possessivo|demonstrativo|relativo|indefinido/],
    ['Classes de palavras II: verbo (tempos, modos, vozes), advérbio, preposição e conjunção', /verbo|verbal|tempo|preterito|presente|futuro|subjuntivo|imperativo|voz passiva|adverbio|preposicao|conjuncao/],
  ],
  'Sintaxe: período simples': [
    ['Sujeito, predicado e vozes verbais', /sujeito|predicado|indeterminado|inexistente|oracao sem sujeito|voz passiva|voz ativa|agente da passiva/],
    ['Transitividade verbal, objetos (direto/indireto), complemento nominal, adjuntos e aposto', /objeto direto|objeto indireto|transitiv|complemento nominal|adjunto|aposto|vocativo|termo|funcao sintatica/],
  ],
  'Sintaxe: período composto': [
    ['Período composto por coordenação e subordinação (orações e relações sintáticas)', /oracao|coordenad|subordinad|adjetiva|restritiva|explicativa|substantiva|adverbial|periodo|concessiva|causal|temporal|condicional|finalidade|consequencia|oposicao|conjuncao|conectivo/],
    ['Pontuação e efeitos de sentido (vírgula, travessão, dois-pontos, aspas)', /virgula|pontuacao|travessao|dois-pontos|aspa|parentese|ponto|pausa|isolar|intercalar|explicar/],
  ],
  'Concordância, regência e crase': [
    ['Concordância verbal e nominal (norma-padrão e reescrita)', /concordancia|plural|singular|verbo|sujeito|flexao|norma|padrao|reescrit|substitui|correcao|gramatical/],
    ['Regência verbal/nominal, crase e colocação pronominal', /regencia|crase|\ba\s+a\b|acento grave|preposicao|pronom|proclise|enclise|mesoclise|\blhe\b| a que | de que | em que /],
  ],
  'Figuras de linguagem': [
    ['Metáfora, metonímia, comparação, personificação, sinestesia e hipérbole', /metafora|metonimia|comparacao|personificacao|prosopopeia|sinestesia|hiperbole/],
    ['Ironia, antítese, paradoxo, eufemismo, gradação e figuras sonoras/sintáticas', /ironia|antitese|paradoxo|oximoro|eufemismo|gradacao|aliteracao|assonancia|onomatopeia|pleonasmo|elipse|zeugma|anafora/],
  ],
  // LITERATURA
  'Barroco e Arcadismo': [
    ['Quinhentismo e Barroco (Gregório de Matos, Padre Antônio Vieira, cultismo e conceptismo)', /quinhentismo|pero vaz|caminha|jesuita|barroco|gregorio|vieira|sermao|cultismo|conceptismo|antitese|pecado/],
    ['Arcadismo / Neoclassicismo (Cláudio Manuel da Costa, Tomás Antônio Gonzaga, bucolismo)', /arcadismo|arcade|neoclassic|marilia|dirceu|gonzaga|claudio manuel|bucolis|pastor|carpe diem|fugere urbem|inutilia/],
  ],
  'Romantismo: poesia e prosa': [
    ['Romantismo: poesia (indianista, ultrarromântica / Mal do Século e condoreira)', /poesia|poema|verso|estrofe|goncalves dias|indianis|alvares de azevedo|ultrarromant|byron|castro alves|condoreir|navio negreiro|lirico/],
    ['Romantismo: prosa (José de Alencar, Manuel Antônio de Almeida, romance urbano/indianista)', /romance|prosa|narrador|personagem|alencar|iracema|guarani|senhora|luciola|sargento de milicias|bernardo guimaraes|inocencia|taunay/],
  ],
  'Realismo e Naturalismo': [
    ['Realismo e Machado de Assis (Memórias Póstumas, Dom Casmurro, contos e análise psicológica)', /realismo|machado de assis|bras cubas|postuma|casmurro|capitu|bentinho|quincas borba|ironia|psicolog|burgues/],
    ['Naturalismo (Aluísio Azevedo, O Cortiço, determinismo, zoomorfização) e Eça de Queirós', /naturalismo|aluisio|cortico|determinismo|cientificismo|zoomorf|patolog|eca de queiros|primo basilio|reliquia/],
  ],
  'Pré-Modernismo e Modernismo (1ª e 2ª fase)': [
    ['Pré-Modernismo (Euclides da Cunha, Lima Barreto, Monteiro Lobato, Augusto dos Anjos)', /pre-modernismo|euclides|sertao|sertoes|lima barreto|policarpo|triste fim|monteiro lobato|jeca|augusto dos anjos/],
    ['Vanguardas europeias, Semana de 22 e 1ª fase modernista (Oswald, Mário de Andrade, Bandeira)', /vanguarda|futurismo|cubismo|expressionismo|surrealismo|dadaismo|1922|semana de arte|oswald|antropofag|mario de andrade|macunaima|bandeira/],
    ['2ª fase modernista: poesia e romance de 30 (Drummond, Cecília, Graciliano, Jorge Amado, Rachel)', /drummond|carlos drummond|cecilia meireles|vinicius|murilo mendes|graciliano|vidas secas|sao bernardo|jorge amado|rachel de queiroz|quinze|jose lins|erico verissimo|regionalis|1930/],
  ],
  'Modernismo (3ª fase) e Contemporânea': [
    ['3ª fase modernista / Geração de 45 (Clarice Lispector, Guimarães Rosa, João Cabral)', /clarice|lispector|guimaraes rosa|sertao|sagarana|joao cabral|severina|geracao de 45|quintana|lygia|drummond|cecilia|vinicius/],
    ['Poesia moderna e contemporânea, concretismo e canção/MPB', /poema|poesia|verso|estrofe|lirico|eu lirico|concretis|tropicalis|cancao|musica|mpb|chico buarque|caetano|leminski|adelia prado/],
    ['Prosa contemporânea, crônica, conto, temática social e literaturas africanas', /romance|conto|cronica|narrador|personagem|prosa|contemporane|social|critica|mulher|identidade|memoria|conceicao evaristo|mia couto|pepetela|paulina chiziane|angola|mocambique|african/],
  ],
  // INGLÊS
  'Interpretação de textos em inglês': [
    ['Artigos científicos, saúde, medicina e meio ambiente', /health|medical|disease|patient|study|research|science|scientist|climate|environment|water|energy|cell|brain|drug|treatment|virus|cancer/],
    ['Notícias, sociedade, tecnologia e cotidiano', /social|media|internet|technology|world|country|people|work|school|education|women|child|history|politic|economic|company/],
    ['Tirinhas (comics/cartoons), literatura, música e expressões', /comic|cartoon|strip|irony|humor|poem|song|novel|author|writer|character|feel/],
  ],
  // FILOSOFIA & SOCIOLOGIA
  'Filosofia antiga e medieval': [
    ['Filosofia antiga: pré-socráticos, sofistas, Sócrates, Platão e Aristóteles', /pre-socratic|sofista|socrates|maieutica|platao|mito da caverna|ideia|republica|aristotele|etica|virtude|eudaimonia|polis/],
    ['Helenismo (estoicismo, epicurismo, ceticismo) e Filosofia Medieval (Agostinho, Tomás de Aquino)', /helenis|estoic|epicur|cetic|cinismo|medieval|agostinho|tomas de aquino|escolastica|patristica|fe\b|razao|deus/],
  ],
  'Filosofia moderna e contemporânea': [
    ['Teoria do conhecimento: Racionalismo (Descartes), Empirismo (Locke, Hume) e Kant', /descartes|penso|duvida|racionalis|empiris|locke|hume|bacon|experiencia|kant|iluminismo|esclarecimento|imperativo|conhecimento|ciencia/],
    ['Filosofia política: Maquiavel e contratualistas (Hobbes, Locke, Rousseau)', /maquiavel|principe|hobbes|leviata|estado de natureza|contrato social|rousseau|vontade geral|montesquieu|soberania|poder|politica/],
    ['Filosofia contemporânea: Marx, Nietzsche, Existencialismo, Foucault, Arendt e Frankfurt', /marx|nietzsche|schopenhauer|sartre|existencialis|heidegger|foucault|disciplina|biopoder|arendt|banalidade|adorno|horkheimer|frankfurt|habermas|rawls/],
  ],
  'Cultura, desigualdade e cidadania': [
    ['Cultura, identidade, etnocentrismo, ideologia e indústria cultural', /cultura|etnocentrismo|relativismo|identidade|patrimonio|memoria|ideologia|industria cultural|consumo|midia/],
    ['Desigualdade social, estratificação, trabalho, gênero e questão racial', /desigualdade|classe|pobreza|renda|trabalho|precarizacao|genero|mulher|feminis|racismo|racial|negro|indigena|minorias/],
    ['Estado, democracia, cidadania, direitos humanos e movimentos sociais', /estado|democracia|cidadania|direito|movimento social|participacao|politica|violencia|urbana|instituicao/],
  ],
};
window.SUBTOPICOS = SUBTOPICOS;

function bateSubtopico(q, assunto, sub) {
  if (!sub) return true;
  const subs = SUBTOPICOS[assunto || q.as];
  if (!subs || !subs.length) return true;
  const txt = (q.x || '') + ' ' + (q.s || '');
  if (sub === '__outras__') return !subs.some(([, re]) => re.test(txt));
  const par = subs.find(([nome]) => nome === sub);
  return par ? par[1].test(txt) : normBusca(txt).includes(normBusca(sub));
}
window.bateSubtopico = bateSubtopico;

function subassuntosDeAssunto(assunto, itens) {
  const subs = SUBTOPICOS[assunto];
  if (!subs || !subs.length) return [];
  const doAss = itens.filter(q => q.as === assunto);
  if (!doAss.length) return [];
  const res = [];
  for (const [nome, re] of subs) {
    const n = doAss.filter(q => re.test((q.x || '') + ' ' + (q.s || ''))).length;
    if (n > 0) res.push([nome, nome, n]);
  }
  const nOutras = doAss.filter(q => !subs.some(([, re]) => re.test((q.x || '') + ' ' + (q.s || '')))).length;
  if (nOutras > 0 && res.length > 0) res.push(['Outras questões do assunto', '__outras__', nOutras]);
  return res;
}

function subassuntosHtml(mat, assunto, subAtual, itens) {
  if (assunto) {
    const subs = subassuntosDeAssunto(assunto, itens);
    if (!subs.length) return opcao('', 'Assunto único (sem subdivisões)', '');
    return opcao('', `Todos os subtópicos (${itens.length})`, subAtual) + subs.map(([t, v, n]) => opcao(v, `${t} (${n})`, subAtual)).join('');
  }
  const assuntos = assuntosDe(mat, itens);
  const grupos = [];
  for (const [a] of assuntos) {
    const subs = subassuntosDeAssunto(a, itens).filter(([, v]) => v !== '__outras__');
    if (subs.length) grupos.push(`<optgroup label="${esc(a)}">${subs.map(([t, v, n]) => opcao(`${a}||${v}`, `${t} (${n})`, '')).join('')}</optgroup>`);
  }
  if (!grupos.length) return opcao('', 'Escolha o assunto ao lado', '');
  return opcao('', 'Todos os subtópicos (ou escolha um direto)', '') + grupos.join('');
}

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
  qfMat: el => { ui.qf.mat = el.dataset.v; ui.qf.assunto = ''; ui.qf.sub = ''; ui.qPag = 0; render(); },
  qfAssunto: el => { ui.qf.assunto = el.dataset.v; ui.qf.sub = ''; ui.qPag = 0; render(); },
  qVerLista: () => { ui.qLista = !ui.qLista; ui.qPag = 0; render(); },
  qRiscarAlt: el => { const q = ui.qs.itens[ui.qs.i], v = el.dataset.v; q.risc = (q.risc || []).includes(v) ? q.risc.filter(x => x !== v) : [...(q.risc || []), v]; render(); },
  qRiscar: () => { ui.qRiscar = !ui.qRiscar; render(); },
  qIr: el => { const s = ui.qs, j = +el.dataset.i; if (j === s.i) return; if (s.itens[s.i].resp == null) fecharItem(s); s.i = j; s.tq = Date.now(); render(); },
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
