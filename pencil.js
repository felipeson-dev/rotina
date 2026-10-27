'use strict';
/* Apple Pencil: quadro de escrita à mão (pressão, borracha, desfazer), rascunho que vira tarefas, redação corrigida pelas 5 competências,
   cartões escritos à mão com revisão espaçada e caderno de cada assunto. Os desenhos ficam no aparelho (IndexedDB). */

// ---------- armazenamento dos desenhos ----------
const DB = {
  _db: null,
  abrir() {
    return this._db ||= new Promise((ok, falha) => {
      const r = indexedDB.open('rotina-desenhos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('d');
      r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error);
    });
  },
  async get(k) { try { const db = await this.abrir(); return await new Promise(ok => { const q = db.transaction('d').objectStore('d').get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch { return null; } },
  async set(k, v) { try { const db = await this.abrir(); await new Promise(ok => { const t = db.transaction('d', 'readwrite'); t.objectStore('d').put(v, k); t.oncomplete = ok; t.onerror = ok; }); } catch { } },
  async del(k) { try { const db = await this.abrir(); await new Promise(ok => { const t = db.transaction('d', 'readwrite'); t.objectStore('d').delete(k); t.oncomplete = ok; t.onerror = ok; }); } catch { } },
};

// ---------- desenho ----------
const CANETAS = ['#22252B', '#2F5BEA', '#D6336C', '#2B8A3E'];
const MARCAS = ['#FFE066', '#FFA8C5', '#8CE99A'];
const estadoQuadro = { ferr: 'caneta', cor: CANETAS[0], marca: MARCAS[0], dedo: false, penVisto: false };

function tracar(ctx, s, k) {
  const p = s.p; if (p.length < 6) { if (p.length >= 3) { ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, Math.max(1, (s.w * (0.4 + p[2])) / 2), 0, 7); ctx.fillStyle = s.c; ctx.fill(); } return; }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.c;
  if (s.t === 'm') { // marca-texto: um traço só, translúcido
    ctx.globalAlpha = 0.38; ctx.lineWidth = s.w * k; ctx.beginPath(); ctx.moveTo(p[0] * k, p[1] * k);
    for (let i = 3; i < p.length; i += 3) ctx.lineTo(p[i] * k, p[i + 1] * k);
    ctx.stroke(); ctx.globalAlpha = 1; return;
  }
  for (let i = 3; i < p.length; i += 3) { // caneta: espessura segue a pressão
    ctx.lineWidth = s.w * k * (0.35 + 1.1 * ((p[i + 2] + p[i - 1]) / 2));
    ctx.beginPath(); ctx.moveTo(p[i - 3] * k, p[i - 2] * k); ctx.lineTo(p[i] * k, p[i + 1] * k); ctx.stroke();
  }
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

class Quadro {
  constructor(el) {
    this.el = el; this.chave = el.dataset.chave; this.altura = +el.dataset.altura || 600; this.fundo = el.dataset.fundo || 'liso';
    this.W0 = 0; this.tr = []; this.refaz = []; this.atual = null; this.mudou = false;
    el.classList.add('quadro', 'fundo-' + this.fundo);
    el.innerHTML = `<div class="quadro-barra"></div><div class="quadro-area" style="height:${this.altura}px"><canvas class="q-fixo"></canvas><canvas class="q-vivo"></canvas></div>`;
    this.barra = el.firstElementChild; this.area = this.barra.nextElementSibling;
    [this.fixo, this.vivo] = this.area.querySelectorAll('canvas');
    this.cf = this.fixo.getContext('2d'); this.cv = this.vivo.getContext('2d');
    this.ajustar(); this.desenharBarra();
    this.vivo.addEventListener('pointerdown', e => this.baixo(e));
    this.vivo.addEventListener('pointermove', e => this.mover(e));
    this.vivo.addEventListener('pointerup', e => this.soltar(e));
    this.vivo.addEventListener('pointercancel', e => this.soltar(e));
    this.vivo.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) this.comando(b.dataset.q, b.dataset.v); });
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (this.area.clientWidth !== this.largura) { this.ajustar(); this.redesenhar(); } }).observe(this.area);
    this.pronto = DB.get('d:' + this.chave).then(d => { if (d) { this.W0 = d.w; this.tr = d.s || []; } this.redesenhar(); });
  }
  ajustar() {
    const w = this.area.clientWidth || 600, h = this.altura, d = Math.min(2, window.devicePixelRatio || 1);
    this.largura = w; this.d = d; if (!this.W0) this.W0 = w;
    for (const c of [this.fixo, this.vivo]) { c.width = Math.round(w * d); c.height = Math.round(h * d); c.style.width = w + 'px'; c.style.height = h + 'px'; }
  }
  get k() { return this.largura / this.W0; }
  redesenhar() {
    const c = this.cf; c.setTransform(this.d, 0, 0, this.d, 0, 0); c.clearRect(0, 0, this.largura, this.altura);
    for (const s of this.tr) tracar(c, s, this.k);
  }
  desenharBarra() {
    const e = estadoQuadro;
    const bt = (q, v, rot, on, cls = '') => `<button type="button" class="qb ${cls}" data-q="${q}" ${v !== undefined ? `data-v="${v}"` : ''} aria-pressed="${!!on}" title="${rot}">${rot}</button>`;
    const cor = (q, cs, atual) => cs.map(c => `<button type="button" class="qcor" style="background:${c}" data-q="${q}" data-v="${c}" aria-pressed="${atual === c && ((q === 'cor' && e.ferr === 'caneta') || (q === 'marca' && e.ferr === 'marca'))}" aria-label="cor"></button>`).join('');
    this.barra.innerHTML = `${bt('ferr', 'caneta', 'Caneta', e.ferr === 'caneta')}${cor('cor', CANETAS, e.cor)}
      ${bt('ferr', 'marca', 'Marca-texto', e.ferr === 'marca')}${cor('marca', MARCAS, e.marca)}
      ${bt('ferr', 'borracha', 'Borracha', e.ferr === 'borracha')}<span class="qsep"></span>
      ${bt('desfazer', undefined, 'Desfazer')}${bt('refazer', undefined, 'Refazer')}${bt('limpar', undefined, 'Limpar')}
      ${bt('dedo', undefined, e.dedo ? 'Dedo desenha: sim' : 'Dedo desenha: não', e.dedo)}`;
  }
  comando(q, v) {
    const e = estadoQuadro;
    if (q === 'ferr') e.ferr = v; else if (q === 'cor') { e.ferr = 'caneta'; e.cor = v; } else if (q === 'marca') { e.ferr = 'marca'; e.marca = v; }
    else if (q === 'desfazer') { const s = this.tr.pop(); if (s) { this.refaz.push(s); this.redesenhar(); this.salvar(); } }
    else if (q === 'refazer') { const s = this.refaz.pop(); if (s) { this.tr.push(s); this.redesenhar(); this.salvar(); } }
    else if (q === 'limpar') { if (this.tr.length && confirm('Apagar tudo desta folha?')) { this.tr = []; this.refaz = []; this.redesenhar(); this.salvar(); } }
    else if (q === 'dedo') e.dedo = !e.dedo;
    document.querySelectorAll('.quadro').forEach(el => el._q?.desenharBarra());
  }
  ponto(e) { const r = this.vivo.getBoundingClientRect(); return [(e.clientX - r.left) / this.k, (e.clientY - r.top) / this.k, e.pressure > 0 ? e.pressure : 0.5]; }
  baixo(e) {
    if (e.pointerType === 'pen') estadoQuadro.penVisto = true;
    // dedo: só rola a página (a menos que "Dedo desenha" esteja ligado). Assim a palma não risca a folha.
    if (e.pointerType === 'touch' && !estadoQuadro.dedo) { this.rolando = { y: e.clientY, x: e.clientX }; this.vivo.setPointerCapture(e.pointerId); return; }
    e.preventDefault(); this.vivo.setPointerCapture(e.pointerId);
    const borracha = estadoQuadro.ferr === 'borracha' || e.button === 5 || (e.buttons & 32);
    if (borracha) { this.apagando = true; this.apagar(e); return; }
    const m = estadoQuadro.ferr === 'marca';
    this.atual = { t: m ? 'm' : 'p', c: m ? estadoQuadro.marca : estadoQuadro.cor, w: m ? 20 : 2.6, p: this.ponto(e) };
  }
  mover(e) {
    if (this.rolando) { const pai = this.el.closest('.janela') || window; pai.scrollBy(0, this.rolando.y - e.clientY); this.rolando.y = e.clientY; return; }
    if (this.apagando) { this.apagar(e); return; }
    if (!this.atual) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const x of (evs.length ? evs : [e])) this.atual.p.push(...this.ponto(x).map((v, i) => i < 2 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100));
    const c = this.cv; c.setTransform(this.d, 0, 0, this.d, 0, 0); c.clearRect(0, 0, this.largura, this.altura); tracar(c, this.atual, this.k);
  }
  soltar() {
    if (this.rolando) { this.rolando = null; return; }
    if (this.apagando) { this.apagando = false; return; }
    if (!this.atual) return;
    this.tr.push(this.atual); this.atual = null; this.refaz = [];
    this.cv.setTransform(1, 0, 0, 1, 0, 0); this.cv.clearRect(0, 0, this.vivo.width, this.vivo.height);
    this.redesenhar(); this.salvar();
  }
  apagar(e) {
    const [x, y] = this.ponto(e), r = 14 / this.k; const antes = this.tr.length;
    this.tr = this.tr.filter(s => { const p = s.p; if (p.length < 6) return Math.hypot(p[0] - x, p[1] - y) > r;
      for (let i = 3; i < p.length; i += 3) if (distSeg(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) < r + s.w / 2) return false; return true; });
    if (this.tr.length !== antes) { this.redesenhar(); this.salvar(); }
  }
  salvar() { this.mudou = true; clearTimeout(this._t); this._t = setTimeout(() => DB.set('d:' + this.chave, { w: this.W0, s: this.tr }), 500); }
  vazio() { return !this.tr.length; }
  /** Imagem jpeg (fundo branco) para mandar à IA ou mostrar. */
  imagem(max = 1400) { return imagemDe({ w: this.W0, s: this.tr }, this.altura / this.W0, max); }
}

function imagemDe(d, prop, max = 1400) {
  const w = Math.min(max, Math.max(600, d.w)), k = w / d.w;
  let h = Math.round(d.w * prop * k);
  if (d.s?.length) { let fim = 0; for (const s of d.s) for (let i = 1; i < s.p.length; i += 3) fim = Math.max(fim, s.p[i]); h = Math.min(h, Math.round((fim + 40) * k)); }
  const c = document.createElement('canvas'); c.width = w; c.height = Math.max(120, h);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  for (const s of d.s || []) tracar(x, s, k);
  return c.toDataURL('image/jpeg', 0.85);
}

/** Monta os quadros que apareceram na tela e preenche as imagens guardadas (cartões). */
function montarQuadros() {
  document.querySelectorAll('.quadro-vaga:not([data-ok])').forEach(el => { el.dataset.ok = '1'; el._q = new Quadro(el); });
  document.querySelectorAll('img[data-desenho]:not([data-ok])').forEach(img => {
    img.dataset.ok = '1';
    DB.get('d:' + img.dataset.desenho).then(d => { if (d?.s?.length) img.src = imagemDe(d, +img.dataset.prop || 0.4, 900); else img.alt = '(em branco)'; });
  });
}
const quadroHtml = (chave, altura, fundo = 'liso') => `<div class="quadro-vaga" data-chave="${esc(chave)}" data-altura="${altura}" data-fundo="${fundo}"></div>`;
const quadroDe = chave => [...document.querySelectorAll('.quadro-vaga')].map(e => e._q).find(q => q?.chave === chave);

// ---------- telas ----------
ICONES.caderno = '<path d="M5 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5z"/><path d="M9 3v18M13 8h3M13 12h3"/>';
ui.cad = 'rascunho'; ui.redTema = ''; ui.redRes = null; ui.rascTarefas = null; ui.cartao = null; ui.novoCartao = false;
S.cartoes ||= []; S.redacoes ||= [];

function vCaderno() {
  const abas = [['rascunho', 'Rascunho'], ['redacao', 'Redação'], ['cartoes', 'Cartões']];
  const cab = `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">caderno</span><h1>Escreva com a caneta</h1></div>
    <div class="alterna" role="group">${abas.map(([v, t]) => `<button data-acao="aba" data-v="${v}" aria-pressed="${ui.cad === v}">${t}</button>`).join('')}</div></header>${avisoIa()}`;
  return cab + (ui.cad === 'redacao' ? vRedacao() : ui.cad === 'cartoes' ? vCartoes() : vRascunho());
}

function propostasHtml() {
  const t = ui.rascTarefas;
  if (!t) return '';
  if (!t.length) return `<section class="cartao"><p style="margin:0">Não achei tarefas nessa folha. Tente escrever com letra maior.</p></section>`;
  return `<section class="cartao"><h2>Tarefas que encontrei</h2>${t.map((x, i) => `<div class="entre prova"><span><strong>${esc(x.titulo)}</strong>${x.materia ? ' · ' + esc(x.materia) : ''}<br><span class="fraco" style="font-size:14px">${(x.passos || []).map(esc).join(' → ')}</span></span>
      <button class="botao claro" data-acao="tarefaRascunho" data-i="${i}">Pôr no meu dia</button></div>`).join('')}
    <div class="linha"><button class="botao" data-acao="tarefaRascunho" data-i="todas">Pôr todas no meu dia</button></div></section>`;
}

function vRascunho() {
  return `<section class="cartao"><p class="fraco" style="margin:0">Despeje aqui tudo o que está na cabeça: pendências, dúvidas, o que precisa estudar. A IA lê a sua letra e vira tarefas.</p>
    ${quadroHtml('rascunho', 900, 'pontos')}
    <div class="linha"><button class="botao grande" data-acao="rascunhoTarefas">Virar tarefas com a IA</button>
      <button class="botao contorno" data-acao="rascunhoNova">Folha nova</button></div></section>${propostasHtml()}`;
}

function notaCor(n) { return n >= 160 ? '#2B8A3E' : n >= 100 ? '#E8890C' : '#D6336C'; }
function vRedacao() {
  const w = semAtual();
  const temas = S.assuntos.filter(a => /^Reda/.test(a.titulo) && !a.feito && semDe(a) <= somaDias(w, 7)).slice(0, 6);
  const r = ui.redRes;
  const res = r ? `<section class="cartao"><div class="entre"><h2>Correção</h2><span class="nota" style="color:${notaCor(r.nota_total / 5)}">${r.nota_total}<small>/1000</small></span></div>
    ${(r.competencias || []).map(c => `<div class="comp"><div class="entre"><strong>C${c.n} · ${esc(c.nome || '')}</strong><span style="color:${notaCor(c.nota)};font-weight:800">${c.nota}</span></div>
      <div class="barra"><i style="width:${Math.min(100, c.nota / 2)}%;background:${notaCor(c.nota)}"></i></div><span class="fraco" style="font-size:14px">${esc(c.comentario || '')}</span></div>`).join('')}
    ${r.pontos_fortes?.length ? `<div><span class="rotulo">o que está bom</span><ul>${r.pontos_fortes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${r.melhorar?.length ? `<div><span class="rotulo">para melhorar</span><ul>${r.melhorar.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${r.proximo_passo ? `<p class="mao" style="margin:0">${esc(r.proximo_passo)}</p>` : ''}
    ${r.transcricao ? `<details><summary class="link">Ver o que a IA leu da sua letra</summary><p class="fraco" style="white-space:pre-wrap">${esc(r.transcricao)}</p></details>` : ''}
    <div class="linha">${r.assuntoId && achar(r.assuntoId) && !achar(r.assuntoId).feito ? `<button class="botao claro" data-acao="feitoAssunto" data-id="${r.assuntoId}">Marcar a redação como feita</button>` : ''}
      <button class="botao contorno" data-acao="rascunhoNova" data-q="redacao">Folha nova</button></div></section>` : '';
  const hist = S.redacoes.slice(-6).reverse();
  return `<section class="cartao"><p class="fraco" style="margin:0">Escreva a redação à mão, direto aqui. A IA lê a letra e corrige pelas 5 competências do ENEM (cada uma de 0 a 200).</p>
    <label class="campo">Tema<input type="text" id="red-tema" value="${esc(ui.redTema)}" placeholder="Ex.: Desafios da saúde mental" data-ui="redTema"></label>
    ${temas.length ? `<div class="linha">${temas.map(a => `<button class="chip" data-acao="temaRed" data-id="${a.id}">${esc(a.titulo.replace(/^Redação[^:]*:\s*/, ''))}</button>`).join('')}</div>` : ''}
    ${quadroHtml('redacao', 1700, 'linhas')}
    <div class="linha"><button class="botao grande" data-acao="corrigirRed">Corrigir com a IA</button></div></section>${res}
    ${hist.length ? `<section class="cartao"><h2>Suas últimas redações</h2>${hist.map(h => `<div class="entre prova"><span>${esc(h.tema || 'Sem tema')} <span class="fraco">· ${diaCurto(h.dia)}</span></span><strong style="color:${notaCor(h.nota / 5)}">${h.nota}</strong></div>`).join('')}</section>` : ''}`;
}

const hojeIso = () => hoje();
function cartoesVencidos() { return S.cartoes.filter(c => c.prox <= hojeIso()); }
function vCartoes() {
  const s = ui.cartao;
  if (ui.novoCartao) return `<section class="cartao"><h2>Novo cartão</h2>
    <label class="campo">Matéria<select id="c-mat">${Object.keys(MATERIAS).map(m => `<option>${m}</option>`).join('')}</select></label>
    <span class="rotulo">frente (a pergunta)</span>${quadroHtml('novo-f', 240, 'pontos')}
    <span class="rotulo">verso (a resposta)</span>${quadroHtml('novo-v', 300, 'pontos')}
    <div class="linha"><button class="botao grande" data-acao="salvarCartao">Salvar cartão</button><button class="botao contorno" data-acao="cancelarCartao">Cancelar</button></div></section>`;
  if (s) {
    const c = S.cartoes.find(x => x.id === s.fila[s.i]);
    if (!c) return `<section class="cartao"><h2>Revisão terminada</h2><p style="margin:0">Você revisou ${s.fila.length} ${s.fila.length === 1 ? 'cartão' : 'cartões'}. Volte amanhã.</p>
      <div class="linha"><button class="botao" data-acao="fimRevisao">Voltar</button></div></section>`;
    return `<section class="cartao cartao-rev" style="${cor(c.materia)}"><div class="entre"><span class="rotulo">${s.i + 1} de ${s.fila.length}</span>${tag(c.materia)}</div>
      <img class="desenho" data-desenho="${c.id}:f" data-prop="0.4" alt="frente">
      ${s.virado ? `<hr><img class="desenho" data-desenho="${c.id}:v" data-prop="0.5" alt="verso">
        <div class="linha"><button class="botao contorno" data-acao="nota" data-v="0">Errei</button><button class="botao contorno" data-acao="nota" data-v="1">Difícil</button>
        <button class="botao" data-acao="nota" data-v="2">Bom</button><button class="botao destaque" data-acao="nota" data-v="3">Fácil</button></div>`
        : `<div class="linha"><button class="botao grande" data-acao="virar">Mostrar a resposta</button></div>`}</section>`;
  }
  const v = cartoesVencidos().length, tot = S.cartoes.length;
  return `<section class="cartao"><div class="entre"><h2>Cartões à mão</h2><span class="fraco">${tot} ${tot === 1 ? 'cartão' : 'cartões'} · ${v} para hoje</span></div>
    <p class="fraco" style="margin:0">Escreva a pergunta de um lado e a resposta do outro. Eu mostro de novo na hora certa: o que você erra volta logo, o que acerta volta cada vez mais espaçado.</p>
    <div class="linha"><button class="botao grande" data-acao="revisar" ${v ? '' : 'disabled'}>${v ? `Revisar ${v}` : 'Nada para revisar hoje'}</button>
      <button class="botao claro" data-acao="novoCartao">+ Novo cartão</button></div></section>
    ${tot ? `<section class="cartao"><h2>Por matéria</h2>${[...new Set(S.cartoes.map(c => c.materia))].map(m => `<div class="entre prova"><span>${tag(m)}</span><span class="fraco">${S.cartoes.filter(c => c.materia === m).length} cartões</span></div>`).join('')}</section>` : ''}`;
}

// ---------- IA com letra à mão ----------
async function iaComImagem(prompt, img, max = 6000) {
  if (!temChave()) throw new Error('falta a chave da IA, em Ajustes');
  return chamarIa(prompt, max, [img], MODELOS_VISAO);
}

Object.assign(VIEWS, { caderno: vCaderno });
Object.assign(ACOES, {
  aba: el => { ui.cad = el.dataset.v; ui.cartao = null; ui.novoCartao = false; ui.iaMsg = ''; render(); },
  rascunhoNova: async el => {
    if (el.dataset.q === 'redacao') { await DB.del('d:redacao'); ui.redRes = null; }
    else { await DB.del('d:rascunho'); ui.rascTarefas = null; }
    render();
  },
  rascunhoTarefas: async () => {
    const q = quadroDe('rascunho');
    if (!q || q.vazio()) { ui.iaMsg = 'A folha está em branco. Escreva algo antes.'; render(); return; }
    const img = q.imagem();
    if (!$('#modal').hidden) { fecharModal(); ui.view = 'caderno'; ui.cad = 'rascunho'; }
    ui.carregando = 'Lendo a sua letra…'; ui.iaMsg = ''; render();
    try {
      const r = await iaComImagem(`A imagem é uma folha de rascunho escrita à mão pela estudante, com pendências, dúvidas e coisas a estudar. Leia e transforme em tarefas de estudo curtas e concretas.
Responda SÓ com JSON: {"resposta":"1 frase","tarefas":[{"titulo":"...","materia":"<uma de: ${Object.keys(MATERIAS).join(', ')} ou vazio>","min":30,"passos":["...","..."]}]}. No máximo 8 tarefas, 2 a 4 passos cada, o primeiro bem fácil.`, img);
      ui.rascTarefas = (r.tarefas || []).filter(t => t.titulo).slice(0, 8);
      ui.iaMsg = r.resposta || '';
    } catch (e) { ui.iaMsg = `Não consegui ler a folha (${e.message}).`; ui.rascTarefas = null; }
    ui.carregando = ''; render();
  },
  tarefaRascunho: el => {
    const lista = el.dataset.i === 'todas' ? ui.rascTarefas : [ui.rascTarefas[+el.dataset.i]], d = diaHoje();
    for (const t of lista.filter(Boolean)) d.blocos.push({ id: uid(), assuntoId: null, titulo: String(t.titulo).slice(0, 120), materia: MATERIAS[t.materia] ? t.materia : '', min: +t.min > 0 ? Math.round(+t.min) : 30,
      passos: (t.passos?.length ? t.passos : ['Começar (5 min)', 'Terminar']).map(x => ({ t: String(x), ok: false })) });
    if (!d.contexto) d.contexto = 'dia normal';
    salvar(); ui.iaMsg = 'Pus no seu dia.'; ui.view = 'hoje'; render();
  },
  temaRed: el => { const a = achar(el.dataset.id); if (a) { ui.redTema = a.titulo.replace(/^Redação[^:]*:\s*/, ''); ui.redAssunto = a.id; render(); } },
  corrigirRed: async () => {
    const q = quadroDe('redacao');
    if (!q || q.vazio()) { ui.iaMsg = 'A folha está em branco. Escreva a redação primeiro.'; render(); return; }
    const tema = ($('#red-tema')?.value || ui.redTema || '').trim();
    ui.redTema = tema; ui.carregando = 'Lendo e corrigindo a redação…'; ui.iaMsg = ''; render();
    try {
      const r = await iaComImagem(`A imagem é uma redação manuscrita no modelo ENEM (texto dissertativo-argumentativo)${tema ? `, tema: "${tema}"` : ''}. Primeiro transcreva o texto. Depois corrija pelas 5 competências do ENEM, com rigor e sem inflar a nota (notas só 0, 40, 80, 120, 160 ou 200 por competência):
C1 domínio da norma culta; C2 compreensão do tema e estrutura dissertativa; C3 seleção e organização de argumentos; C4 coesão (conectivos); C5 proposta de intervenção (agente, ação, meio, finalidade, detalhamento).
Se a letra estiver difícil de ler, diga isso nos comentários. Responda SÓ com JSON:
{"transcricao":"...","competencias":[{"n":1,"nome":"...","nota":0,"comentario":"1 ou 2 frases"},{"n":2,...},{"n":3,...},{"n":4,...},{"n":5,...}],"nota_total":0,"pontos_fortes":["..."],"melhorar":["..."],"proximo_passo":"1 frase gentil e prática"}`, q.imagem(), 8000);
      const comps = (r.competencias || []).map(c => ({ ...c, nota: Math.max(0, Math.min(200, Math.round((+c.nota || 0) / 40) * 40)) }));
      r.competencias = comps; r.nota_total = comps.reduce((s, c) => s + c.nota, 0); r.assuntoId = ui.redAssunto || null;
      ui.redRes = r; S.redacoes.push({ dia: hoje(), tema, nota: r.nota_total, comps: comps.map(c => c.nota) }); S.redacoes = S.redacoes.slice(-30); salvar();
    } catch (e) { ui.iaMsg = `Não consegui corrigir agora (${e.message}).`; ui.redRes = null; }
    ui.carregando = ''; render();
  },
  novoCartao: () => { ui.novoCartao = true; render(); },
  cancelarCartao: () => { ui.novoCartao = false; render(); },
  salvarCartao: async () => {
    const f = quadroDe('novo-f'), v = quadroDe('novo-v');
    if (!f || !v || f.vazio() || v.vazio()) { ui.iaMsg = 'Escreva a frente e o verso do cartão.'; render(); return; }
    const id = uid();
    await DB.set(`d:${id}:f`, { w: f.W0, s: f.tr }); await DB.set(`d:${id}:v`, { w: v.W0, s: v.tr });
    await DB.del('d:novo-f'); await DB.del('d:novo-v');
    S.cartoes.push({ id, materia: $('#c-mat')?.value || '', prox: hoje(), int: 0, fac: 2.3, n: 0 });
    salvar(); ui.novoCartao = false; ui.iaMsg = 'Cartão salvo.'; render();
  },
  revisar: () => { ui.cartao = { fila: cartoesVencidos().map(c => c.id).sort(() => Math.random() - 0.5), i: 0, virado: false }; render(); },
  virar: () => { ui.cartao.virado = true; render(); },
  nota: el => {
    const s = ui.cartao, c = S.cartoes.find(x => x.id === s.fila[s.i]), n = +el.dataset.v;
    if (c) {
      if (n === 0) { c.int = 1; c.fac = Math.max(1.3, c.fac - 0.2); }
      else if (n === 1) { c.int = Math.max(1, Math.round((c.int || 1) * 1.2)); c.fac = Math.max(1.3, c.fac - 0.1); }
      else if (n === 2) c.int = c.int ? Math.round(c.int * c.fac) : 1;
      else { c.int = c.int ? Math.round(c.int * c.fac * 1.3) : 3; c.fac += 0.1; }
      c.n++; c.prox = somaDias(hoje(), c.int);
      if (n === 0) s.fila.push(c.id); // o que errou volta ainda hoje
    }
    s.i++; s.virado = false; salvar(); render();
  },
  fimRevisao: () => { ui.cartao = null; render(); },
  // caderno de cada assunto e rascunho rápido (em qualquer tela)
  caderno: el => { const a = achar(el.dataset.id); if (a) { ui.chatAberto = false; abrirModal(`<div class="entre"><div>${tag(a.materia)}</div><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
    <h2>${esc(a.titulo)}</h2><span class="fraco">Anotações à mão deste assunto. Salvam sozinhas.</span>${quadroHtml('nota:' + a.id, 800, 'quadriculado')}`); } },
  abrirRascunho: () => { ui.chatAberto = false; ui.rascTarefas = null; abrirModal(`<div class="entre"><h2>Rascunho rápido</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
    <span class="fraco">Escreva o que vier à cabeça. Salva sozinho.</span>${quadroHtml('rascunho', 800, 'pontos')}
    <div class="linha"><button class="botao" data-acao="rascunhoTarefas">Virar tarefas com a IA</button></div>`); },
});

// monta os quadros sempre que a tela ou uma janela mudar
{
  const r0 = render; render = function () { r0.apply(this, arguments); montarQuadros(); };
  const m0 = abrirModal; abrirModal = function () { m0.apply(this, arguments); montarQuadros(); };
}
render();
