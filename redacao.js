'use strict';
/* Redação com histórico (reler o texto e todas as correções, da IA e de outras pessoas) e cartões com gerador por IA.
   Carregado depois do pencil.js: as funções vRedacao, vCartoes e as ações daqui substituem as antigas. */

const MODELOS_RED = {
  vunesp: {
    nome: 'Vunesp / Med SP',
    desc: 'Santa Casa, Einstein, UNIFESP, São Camilo, FMABC e UNESP · dissertação argumentativa (0 a 28, SEM proposta de intervenção)',
    max: 28,
    step: 1,
    comps: [
      { n: 1, nome: 'Tema e gênero (texto dissertativo-argumentativo)', max: 8 },
      { n: 2, nome: 'Coerência, argumentação e repertório', max: 8 },
      { n: 3, nome: 'Coesão, modalidade e norma culta', max: 12 },
    ],
  },
  fuvest: {
    nome: 'Fuvest (USP)',
    desc: 'USP · dissertação (ou gênero pedido na proposta), foco em projeto de texto, criticidade e articulação (0 a 50, SEM proposta de intervenção)',
    max: 50,
    step: 1,
    comps: [
      { n: 1, nome: 'Desenvolvimento do tema e organização do gênero', max: 20 },
      { n: 2, nome: 'Coerência dos argumentos e articulação das partes', max: 15 },
      { n: 3, nome: 'Correção gramatical e adequação vocabular', max: 15 },
    ],
  },
  enem: {
    nome: 'ENEM',
    desc: '5 competências (0 a 1000, COM proposta de intervenção detalhada na C5)',
    max: 1000,
    step: 40,
    comps: [
      { n: 1, nome: 'Norma culta', max: 200 },
      { n: 2, nome: 'Tema, repertório e estrutura', max: 200 },
      { n: 3, nome: 'Argumentação e projeto de texto', max: 200 },
      { n: 4, nome: 'Coesão textual', max: 200 },
      { n: 5, nome: 'Proposta de intervenção', max: 200 },
    ],
  },
  unicamp: {
    nome: 'Unicamp',
    desc: 'Gênero textual específico pedido na proposta + leitura crítica da coletânea (0 a 48)',
    max: 48,
    step: 1,
    comps: [
      { n: 1, nome: 'Proposta temática e cumprimento do gênero', max: 12 },
      { n: 2, nome: 'Leitura e articulação dos textos de apoio', max: 12 },
      { n: 3, nome: 'Construção do texto, coesão e coerência', max: 12 },
      { n: 4, nome: 'Convenções da escrita e registro', max: 12 },
    ],
  },
};
const modeloRedDe = r => MODELOS_RED[r?.modelo] || MODELOS_RED.enem;
const pctNotaRed = (nota, max) => nota == null ? null : Math.max(0, Math.min(100, Math.round(nota / (max || 1000) * 100)));
const detectarModeloRed = txt => {
  const t = String(txt || '').toLowerCase();
  if (/fuvest|\busp\b/.test(t)) return 'fuvest';
  if (/unicamp/.test(t)) return 'unicamp';
  if (/vunesp|santa casa|einstein|unifesp|camilo|fmabc|unesp/.test(t)) return 'vunesp';
  if (/enem/.test(t)) return 'enem';
  return null;
};
const migrarRed = r => {
  if (!r.id) r.id = uid();
  r.modelo ||= 'enem';
  r.correcoes ||= [];
  if (r.manual) { r.correcoes.push({ id: uid(), fonte: 'Professor', nota: r.manual.nota, obs: r.manual.obs || '', dia: r.dia }); delete r.manual; }
  return r;
};
const notaRed = r => r.nota ?? (r.correcoes.length ? r.correcoes[r.correcoes.length - 1].nota : null);
const stepperHtml = (id, v, min, max) => `<div class="stepper"><button type="button" class="qb" data-acao="step" data-id="${id}" data-d="-1" aria-label="menos">−</button><input type="number" id="${id}" min="${min}" max="${max}" value="${v}" inputmode="numeric"><button type="button" class="qb" data-acao="step" data-id="${id}" data-d="1" aria-label="mais">+</button></div>`;
Object.assign(ACOES, { step: el => { const i = document.getElementById(el.dataset.id); if (!i) return; const passo = i.id === 'mq-total' ? 10 : 1; const n = Math.max(+i.min, Math.min(+i.max, (+i.value || 0) + +el.dataset.d * passo)); i.value = n; if (i.id === 'cg-n') ui.cgN = n; if (i.id === 'qia-n') ui.qNIa = n; i.dispatchEvent(new Event('input', { bubbles: true })); if (i.id === 'mq-total') render(); const b = document.querySelector('[data-acao="cgGerar"]'); if (b && i.id === 'cg-n') b.textContent = 'Gerar ' + n; } });
document.addEventListener('input', e => { if (e.target.id === 'cg-n') { ui.cgN = Math.max(1, Math.min(100, Math.round(+e.target.value) || 1)); const b = document.querySelector('[data-acao="cgGerar"]'); if (b) b.textContent = 'Gerar ' + ui.cgN; } if (e.target.id === 'qia-n') ui.qNIa = Math.max(1, Math.min(60, Math.round(+e.target.value) || 1)); });
ui.redVer = null; ui.redModelo ||= 'vunesp'; ui.cgMat = 'Biologia'; ui.cgPedido = ''; ui.cgN = 10; ui.cgLista = null; ui.cartaoModo = 'mao';

function iaCardHtml(r, modeloId = 'enem') {
  const mod = MODELOS_RED[r.modelo || modeloId] || MODELOS_RED.enem;
  const maxTot = r.max_total || mod.max;
  const pct = pctNotaRed(r.nota_total, maxTot) ?? 0;
  return `<div class="corr-card"><div class="entre"><div class="coluna" style="gap:2px"><h3>Correção da IA</h3><span class="fraco" style="font-size:12.5px">Critérios: ${esc(mod.nome)}</span></div><span class="nota" style="color:${notaCor(pct * 2)}">${r.nota_total}<small>/${maxTot}</small></span></div>
    ${(r.competencias || []).map((c, idx) => {
      const cMax = c.max || mod.comps[idx]?.max || 200;
      const cPct = Math.min(100, Math.round((c.nota || 0) / cMax * 100));
      return `<div class="comp"><div class="entre"><strong>${mod === MODELOS_RED.enem ? `C${c.n}` : `Critério ${c.n}`} · ${esc(c.nome || mod.comps[idx]?.nome || '')}</strong><span style="color:${notaCor(cPct * 2)};font-weight:800">${c.nota}/${cMax}</span></div>
        <div class="barra"><i style="width:${cPct}%;background:${notaCor(cPct * 2)}"></i></div><span class="fraco" style="font-size:14px">${esc(c.comentario || '')}</span></div>`;
    }).join('')}
    ${r.pontos_fortes?.length ? `<div><span class="rotulo">o que está bom</span><ul>${r.pontos_fortes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${r.melhorar?.length ? `<div><span class="rotulo">para melhorar</span><ul>${r.melhorar.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${r.proximo_passo ? `<p class="mao" style="margin:0">${esc(r.proximo_passo)}</p>` : ''}
    ${r.transcricao ? `<details><summary class="link">Ver o que a IA leu da sua letra</summary><p class="fraco" style="white-space:pre-wrap">${esc(r.transcricao)}</p></details>` : ''}</div>`;
}

function evolucaoRed() {
  const l = S.redacoes.filter(r => notaRed(r) != null).slice(-12);
  if (l.length < 2) return '';
  return `<div class="coluna" style="gap:6px"><span class="rotulo">sua evolução (% da nota máxima)</span><div class="evolucao">${l.map(r => {
    const mod = modeloRedDe(r), n = notaRed(r), pct = pctNotaRed(n, mod.max) ?? 0;
    return `<div title="${esc(r.tema || '')} (${mod.nome}): ${n}/${mod.max} (${pct}%)"><i style="height:${Math.max(6, pct)}%;background:${notaCor(pct * 2)}"></i><small>${pct}%</small></div>`;
  }).join('')}</div></div>`;
}

function vRedacao() {
  S.redacoes.forEach(migrarRed);
  if (ui.redVer) return vRedDetalhe(S.redacoes.find(r => r.id === ui.redVer));
  const w = semAtual(), mod = MODELOS_RED[ui.redModelo] || MODELOS_RED.vunesp;
  const temas = S.assuntos.filter(a => /^Reda/.test(a.titulo) && !a.feito && semDe(a) <= somaDias(w, 14)).slice(0, 4);
  const r = ui.redRes, hist = S.redacoes.slice().reverse();
  const rotuloTemaChip = t => {
    const m = detectarModeloRed(t);
    const limpo = t.replace(/^Redação\s*/i, '').replace(/\s*\+\s*reescrever.*$/i, '').trim();
    return (m ? `${MODELOS_RED[m].nome}: ` : '') + limpo.slice(0, 56) + (limpo.length > 56 ? '…' : '');
  };
  return `<section class="cartao">
    <div class="coluna" style="gap:6px">
      <span class="rotulo">banca / critérios de correção</span>
      <div class="linha" style="gap:6px">${Object.entries(MODELOS_RED).map(([k, m]) => `<button type="button" class="chip" data-acao="redModelo" data-v="${k}" aria-pressed="${ui.redModelo === k}">${esc(m.nome)}</button>`).join('')}</div>
      <p class="fraco" style="margin:0;font-size:13.5px">${esc(mod.desc)}</p>
    </div>
    <div class="alterna" role="group" style="align-self:flex-start"><button data-acao="redModo" data-v="mao" aria-pressed="${ui.redModo !== 'digitar'}">Escrever à mão</button><button data-acao="redModo" data-v="digitar" aria-pressed="${ui.redModo === 'digitar'}">Digitar</button></div>
    <label class="campo">Tema<input type="text" id="red-tema" value="${esc(ui.redTema)}" placeholder="Ex.: Limites da inteligência artificial na saúde" data-ui="redTema"></label>
    ${temas.length ? `<div class="coluna" style="gap:6px"><span class="rotulo">próximas redações do plano</span><div class="linha" style="gap:6px">${temas.map(a => `<button class="chip chip-mini" data-acao="temaRed" data-id="${a.id}" title="${esc(a.titulo)}">${esc(rotuloTemaChip(a.titulo))}</button>`).join('')}</div></div>` : ''}
    ${ui.redModo === 'digitar' ? `<textarea id="red-digitada" data-ui="redTexto" style="min-height:420px" placeholder="Digite a sua redação aqui (se estiver sem a caneta ou no notebook).">${esc(ui.redTexto)}</textarea>` : quadroHtml('redacao', 1700, 'linhas')}
    <div class="linha"><button class="botao grande" data-acao="corrigirRed">Corrigir (${esc(mod.nome)})</button><button class="botao contorno" data-acao="salvarRed">Só salvar no histórico</button></div></section>
    ${r ? `<section class="cartao">${iaCardHtml(r, r.modelo || ui.redModelo)}<div class="linha">${r.id ? `<button class="botao claro" data-acao="redAbrir" data-id="${r.id}">Abrir no histórico</button>` : ''}
      ${r.assuntoId && achar(r.assuntoId) && !achar(r.assuntoId).feito ? `<button class="botao claro" data-acao="feitoAssunto" data-id="${r.assuntoId}">Marcar a redação como feita</button>` : ''}
      <button class="botao contorno" data-acao="rascunhoNova" data-q="redacao">Folha nova</button></div></section>` : ''}
    <section class="cartao"><div class="entre"><h2>Histórico de redações</h2><span class="fraco">${hist.length} ${hist.length === 1 ? 'redação' : 'redações'}</span></div>${evolucaoRed()}
      ${hist.length ? hist.map(h => {
        const mh = modeloRedDe(h);
        return `<button class="red-item" data-acao="redAbrir" data-id="${h.id}"><span><strong>${esc(h.tema || 'Sem tema')}</strong><small class="fraco"> · ${esc(mh.nome)} · ${diaCurto(h.dia)} · ${h.modo === 'digitar' ? 'digitada' : 'à mão'}</small></span>
        <span class="notas-mini">${h.nota != null ? `<b style="color:${notaCor((pctNotaRed(h.nota, mh.max) ?? 0) * 2)}">IA ${h.nota}/${mh.max}</b>` : ''}${h.correcoes.map(c => `<b style="color:${notaCor((pctNotaRed(c.nota, c.max || mh.max) ?? 0) * 2)}">${esc(c.fonte)} ${c.nota}</b>`).join('')}${h.nota == null && !h.correcoes.length ? '<small class="fraco">sem correção</small>' : ''}</span></button>`;
      }).join('')
        : '<p class="fraco" style="margin:0">As redações que você corrigir ou salvar aparecem aqui.</p>'}</section>`;
}

function vRedDetalhe(e) {
  if (!e) { ui.redVer = null; return vRedacao(); }
  const mod = modeloRedDe(e);
  const ia = e.ia ? iaCardHtml({ ...e.ia, nota_total: e.nota, modelo: e.modelo }, e.modelo) : '';
  const corr = e.correcoes.map(c => {
    const cMax = c.max || mod.max, pct = pctNotaRed(c.nota, cMax) ?? 0;
    return `<div class="corr-card"><div class="entre"><h3>${esc(c.fonte)} <small class="fraco">· ${diaCurto(c.dia)}</small></h3><span class="nota" style="color:${notaCor(pct * 2)}">${c.nota}<small>/${cMax}</small></span></div>
    ${c.comps?.some(x => x != null) ? c.comps.map((n, i) => { if (n == null) return ''; const cm = mod.comps[i]?.max || 200; const cp = Math.min(100, Math.round(n / cm * 100)); return `<div class="comp"><div class="entre"><strong>${mod === MODELOS_RED.enem ? `C${i + 1}` : `Critério ${i + 1}`}</strong><span style="color:${notaCor(cp * 2)};font-weight:800">${n}/${cm}</span></div><div class="barra"><i style="width:${cp}%;background:${notaCor(cp * 2)}"></i></div></div>`; }).join('') : ''}
    ${c.obs ? `<p style="margin:0;white-space:pre-wrap">${esc(c.obs)}</p>` : ''}
    ${c.foto ? `<img class="desenho" data-foto="foto:${e.id}:${c.id}" alt="foto da correção" style="min-height:120px">` : ''}
    <div class="linha"><button class="link" data-acao="redDelCorr" data-id="${e.id}" data-c="${c.id}">Apagar esta correção</button></div></div>`;
  }).join('');
  return `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">redação · ${esc(mod.nome)} · ${diaCurto(e.dia)}</span><h2>${esc(e.tema || 'Sem tema')}</h2></div>
    <div class="linha"><button class="botao contorno" data-acao="redVoltar">‹ Voltar</button><button class="botao claro" data-acao="redReescrever" data-id="${e.id}">Reescrever</button></div></header>
    <section class="cartao"><span class="rotulo">o texto</span>${!e.modo ? '<p class="fraco" style="margin:0">Esta redação foi registrada antes de o histórico existir, então o texto e a correção da IA não foram guardados. As próximas ficam completas.</p>' : e.modo === 'digitar' ? `<p style="margin:0;white-space:pre-wrap">${esc(e.texto || '')}</p>` : `<img class="desenho" data-desenho="red:${e.id}" data-prop="2" alt="redação à mão" style="min-height:200px">`}
      <div class="linha">${e.ia ? '' : `<button class="botao" data-acao="corrigirEntrada" data-id="${e.id}">Corrigir (${esc(mod.nome)})</button>`}<button class="link" data-acao="redApagar" data-id="${e.id}">Apagar a redação</button></div></section>
    ${ia ? `<section class="cartao">${ia}</section>` : ''}${corr ? `<section class="cartao">${corr}</section>` : ''}
    <section class="cartao"><h2>Adicionar a correção de outra pessoa</h2><p class="fraco" style="margin:0">Professor, cursinho, outra IA ou você mesma (${esc(mod.nome)}, máx. ${mod.max}).</p>
      <div class="linha"><label class="campo" style="flex:1 1 200px">Quem corrigiu<input type="text" id="cr-fonte" list="fontes-corr" placeholder="Professor, Cursinho, Outra IA…"><datalist id="fontes-corr"><option>Professor</option><option>Cursinho</option><option>Outra IA</option><option>Autocorreção</option></datalist></label>
        <label class="campo" style="flex:0 1 160px">Nota total (0 a ${mod.max})<input type="number" id="cr-nota" min="0" max="${mod.max}" step="${mod.max === 1000 ? 10 : 0.5}"></label></div>
      <div class="linha">${mod.comps.map(c => `<label class="campo" style="flex:1 1 100px">${mod === MODELOS_RED.enem ? `C${c.n}` : `Crit. ${c.n}`} (0-${c.max})<input type="number" id="cr-c${c.n}" min="0" max="${c.max}" step="${mod.max === 1000 ? 20 : 0.5}"></label>`).join('')}</div>
      <label class="campo">Comentários<textarea id="cr-obs" placeholder="O que a pessoa disse sobre o texto"></textarea></label>
      <label class="campo">Foto da correção (opcional)<input type="file" id="cr-foto" accept="image/*"></label>
      <div class="linha"><button class="botao" data-acao="redAddCorr" data-id="${e.id}">Salvar correção</button></div></section>`;
}

async function fotoComprimida(file, max = 1400) {
  const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.8);
}

const PROMPT_RED = (tema, digitado, modeloId = 'enem') => {
  const mod = MODELOS_RED[modeloId] || MODELOS_RED.enem;
  const intro = `${digitado != null ? 'Abaixo está uma redação digitada' : 'A imagem é uma redação manuscrita'} para o vestibular ${mod.nome}${tema ? `, tema: "${tema}"` : ''}.${digitado != null ? `\n\nTEXTO DA REDAÇÃO:\n${digitado}\n\n` : ''} Primeiro ${digitado != null ? 'repita o texto na transcrição' : 'transcreva o texto'}.`;
  let criterios = '';
  if (modeloId === 'vunesp') {
    criterios = `Corrija com rigor pelos critérios oficiais da banca Vunesp (Santa Casa, Einstein, UNIFESP, São Camilo, FMABC, UNESP), de 0 a 28 pontos. IMPORTANTE: a Vunesp NÃO exige proposta de intervenção — NÃO penalize a ausência dela! Avalie em 3 critérios:
1. Tema e gênero dissertativo-argumentativo (0 a 8): abordagem completa do recorte temático e estrutura dissertativa.
2. Coerência, argumentação e repertório (0 a 8): defesa de ponto de vista, progressão e uso produtivo de repertório/coletânea.
3. Coesão, modalidade e norma culta (0 a 12): articulação entre parágrafos/frases, precisão vocabular e gramática.`;
  } else if (modeloId === 'fuvest') {
    criterios = `Corrija com rigor pelos critérios oficiais da Fuvest (USP), de 0 a 50 pontos. IMPORTANTE: a Fuvest NÃO exige proposta de intervenção estilo ENEM — avalie profundidade reflexiva, autoria e criticidade! Avalie em 3 critérios:
1. Desenvolvimento do tema e organização do gênero (0 a 20): leitura crítica da proposta, autoria e recorte pertinente.
2. Coerência dos argumentos e articulação das partes (0 a 15): projeto de texto, progressão argumentativa e coesão.
3. Correção gramatical e adequação vocabular (0 a 15): norma-padrão, clareza e precisão expressiva.`;
  } else if (modeloId === 'unicamp') {
    criterios = `Corrija com rigor pelos critérios oficiais da Unicamp, de 0 a 48 pontos. Avalie em 4 critérios (0 a 12 cada):
1. Proposta temática e cumprimento do gênero textual pedido (interlocução, propósito comunicativo).
2. Leitura e articulação crítica dos textos de apoio/repertório.
3. Construção do texto, coesão e coerência.
4. Convenções da escrita, norma culta e adequação de registro.`;
  } else {
    criterios = `Corrija pelas 5 competências do ENEM, com rigor e sem inflar a nota (notas só 0, 40, 80, 120, 160 ou 200 por competência, total 0 a 1000):
C1 domínio da norma culta; C2 compreensão do tema e estrutura dissertativa; C3 seleção e organização de argumentos; C4 coesão (conectivos); C5 proposta de intervenção (agente, ação, meio, finalidade, detalhamento).`;
  }
  return `${intro} Depois ${criterios}
Se a letra estiver difícil de ler, diga isso nos comentários. Responda SÓ com JSON:
{"transcricao":"...","competencias":[${mod.comps.map(c => `{"n":${c.n},"nome":"${c.nome}","max":${c.max},"nota":0,"comentario":"1 ou 2 frases"}`).join(',')}],"nota_total":0,"pontos_fortes":["..."],"melhorar":["..."],"proximo_passo":"1 frase gentil e prática"}`;
};

async function corrigirComIa(e) {
  const modId = e.modelo || ui.redModelo || 'enem';
  const mod = MODELOS_RED[modId] || MODELOS_RED.enem;
  const digitado = e.modo === 'digitar' ? e.texto : null;
  let img = null;
  if (digitado == null) { const d = await DB.get('d:red:' + e.id); if (!d?.s?.length) throw new Error('não achei o desenho desta redação'); img = imagemDe(d, 2, 1400); }
  const r = await iaComImagem(PROMPT_RED(e.tema, digitado, modId), img, 8000);
  const comps = (r.competencias || []).map((c, idx) => {
    const cMax = mod.comps[idx]?.max || 200;
    const raw = +c.nota || 0;
    const nota = modId === 'enem' ? Math.max(0, Math.min(200, Math.round(raw / 40) * 40)) : Math.max(0, Math.min(cMax, Math.round(raw * 2) / 2));
    return { ...c, n: c.n || idx + 1, nome: c.nome || mod.comps[idx]?.nome || '', max: cMax, nota };
  });
  r.competencias = comps; r.modelo = modId; r.max_total = mod.max;
  r.nota_total = Math.round(comps.reduce((s, c) => s + c.nota, 0) * 10) / 10;
  e.modelo = modId; e.ia = r; e.nota = r.nota_total; return r;
}

/** Guarda a redação do editor no histórico (e o desenho, se for à mão). */
async function guardarRedacaoAtual() {
  const digitar = ui.redModo === 'digitar', q = digitar ? null : quadroDe('redacao');
  const texto = digitar ? ($('#red-digitada')?.value || ui.redTexto || '').trim() : '';
  if (digitar ? texto.length < 80 : (!q || q.vazio())) { ui.iaMsg = digitar ? 'Escreva a redação (pelo menos algumas linhas) primeiro.' : 'A folha está em branco. Escreva a redação primeiro.'; render(); return null; }
  const e = migrarRed({ dia: hoje(), modelo: ui.redModelo || 'vunesp', tema: ($('#red-tema')?.value || ui.redTema || '').trim(), modo: digitar ? 'digitar' : 'mao', texto: digitar ? texto : '', nota: null, ia: null, assuntoId: ui.redAssunto || null });
  ui.redTema = e.tema;
  if (!digitar) await DB.set('d:red:' + e.id, { w: q.W0, s: q.tr.map(s => ({ ...s })) });
  S.redacoes.push(e);
  if (S.redacoes.length > 60) {
    const removidas = S.redacoes.slice(0, S.redacoes.length - 60);
    S.redacoes = S.redacoes.slice(-60);
    // limpa desenhos e fotos órfãs do IndexedDB ao descartar redações mais antigas que 60
    for (const old of removidas) {
      try { await DB.del('d:red:' + old.id); for (const c of old.correcoes || []) await DB.del(`foto:${old.id}:${c.id}`); } catch { }
    }
  }
  salvar(); return e;
}

Object.assign(ACOES, {
  redModelo: el => { if (MODELOS_RED[el.dataset.v]) { ui.redModelo = el.dataset.v; render(); } },
  temaRed: el => {
    const a = achar(el.dataset.id); if (!a) return;
    const m = detectarModeloRed(a.titulo);
    if (m) ui.redModelo = m;
    ui.redTema = a.titulo.replace(/^Redação[^:]*:\s*/i, '').replace(/\s*\+\s*reescrever.*$/i, '').trim();
    ui.redAssunto = a.id; render();
  },
  corrigirRed: async () => {
    const e = await guardarRedacaoAtual(); if (!e) return;
    ui.carregando = e.modo === 'digitar' ? 'Corrigindo a redação…' : 'Lendo e corrigindo a redação…'; ui.iaMsg = ''; render();
    try { const r = await corrigirComIa(e); ui.redRes = { ...r, id: e.id, assuntoId: e.assuntoId }; salvar(); }
    catch (err) { ui.iaMsg = `Não consegui corrigir agora (${err.message}). A redação ficou salva no histórico, e você pode corrigir depois.`; ui.redRes = null; }
    ui.carregando = ''; render();
  },
  salvarRed: async () => { const e = await guardarRedacaoAtual(); if (e) { ui.iaMsg = 'Redação salva no histórico.'; ui.redRes = null; render(); } },
  corrigirEntrada: async el => {
    const e = S.redacoes.find(x => x.id === el.dataset.id); if (!e) return;
    ui.carregando = 'Corrigindo a redação…'; ui.iaMsg = ''; render();
    try { await corrigirComIa(e); salvar(); } catch (err) { ui.iaMsg = `Não consegui corrigir agora (${err.message}).`; }
    ui.carregando = ''; render();
  },
  redAbrir: el => { ui.redVer = el.dataset.id; ui.cad = 'redacao'; ui.view = 'caderno'; window.scrollTo(0, 0); render(); },
  redVoltar: () => { ui.redVer = null; render(); },
  redApagar: async el => {
    if (!confirm('Apagar esta redação e as correções?')) return;
    const e = S.redacoes.find(x => x.id === el.dataset.id);
    if (e) { await DB.del('d:red:' + e.id); for (const c of e.correcoes) await DB.del(`foto:${e.id}:${c.id}`); }
    S.redacoes = S.redacoes.filter(x => x.id !== el.dataset.id); ui.redVer = null; salvar(); render();
  },
  redReescrever: async el => {
    const e = S.redacoes.find(x => x.id === el.dataset.id); if (!e) return;
    ui.redTema = e.tema; ui.redModo = e.modo; ui.redModelo = e.modelo || 'enem'; ui.redRes = null; ui.redVer = null;
    if (e.modo === 'digitar') ui.redTexto = e.texto; else { const d = await DB.get('d:red:' + e.id); await DB.set('d:redacao', d); }
    ui.iaMsg = 'Carreguei a redação na folha para você reescrever.'; render();
  },
  redAddCorr: async el => {
    const e = S.redacoes.find(x => x.id === el.dataset.id); if (!e) return;
    const mod = modeloRedDe(e);
    const comps = mod.comps.map(c => { const v = $('#cr-c' + c.n)?.value; return v == null || v === '' ? null : Math.max(0, Math.min(c.max, +v)); });
    let nota = $('#cr-nota').value === '' ? null : Math.max(0, Math.min(mod.max, +$('#cr-nota').value));
    if (nota == null && comps.some(x => x != null)) nota = Math.round(comps.reduce((s, x) => s + (x || 0), 0) * 10) / 10;
    const obs = $('#cr-obs').value.trim(), file = $('#cr-foto').files?.[0];
    if (nota == null) { ui.iaMsg = 'Informe pelo menos a nota total (ou as notas dos critérios).'; render(); return; }
    const c = { id: uid(), fonte: ($('#cr-fonte').value || 'Professor').trim().slice(0, 40), nota, max: mod.max, comps: comps.some(x => x != null) ? comps : null, obs, dia: hoje(), foto: false };
    if (file) { try { await DB.set(`foto:${e.id}:${c.id}`, { foto: await fotoComprimida(file) }); c.foto = true; } catch { ui.iaMsg = 'Não consegui salvar a foto, mas a correção foi guardada.'; } }
    e.correcoes.push(c); salvar(); ui.iaMsg = ui.iaMsg || 'Correção guardada.'; render();
  },
  redDelCorr: async el => {
    const e = S.redacoes.find(x => x.id === el.dataset.id); if (!e) return;
    await DB.del(`foto:${e.id}:${el.dataset.c}`); e.correcoes = e.correcoes.filter(c => c.id !== el.dataset.c); salvar(); render();
  },
});

// ---------- cartões: digitados, gerados pela IA ou à mão ----------
function cartaoLado(c, lado) {
  const t = lado === 'f' ? (c.ft ?? c.frente) : (c.vt ?? c.verso);
  const rot = lado === 'f' ? 'Pergunta' : 'Resposta';
  const fmt = typeof mdLite === 'function' ? mdLite : esc;
  return `<div class="lado ${lado === 'f' ? 'pergunta' : 'resposta'}"><span class="lado-rotulo">${rot}</span>${t != null ? `<div class="cartao-texto">${fmt(t)}</div>${lado === 'f' && c.dica ? `<p class="fraco" style="margin:6px 0 0;font-size:13px">💡 Dica: ${esc(c.dica)}</p>` : ''}` : `<img class="desenho" data-desenho="${c.id}:${lado}" data-prop="${lado === 'f' ? 0.4 : 0.5}" alt="${rot}">`}</div>`;
}

function vCartoes() {
  const s = ui.cartao;
  if (ui.novoCartao) {
    const dig = ui.cartaoModo === 'digitar';
    return `<section class="cartao"><h2>Novo cartão</h2>
      <div class="alterna" role="group"><button data-acao="cartaoModo" data-v="mao" aria-pressed="${!dig}">Escrever à mão</button><button data-acao="cartaoModo" data-v="digitar" aria-pressed="${dig}">Digitar</button></div>
      <label class="campo">Matéria<select id="c-mat">${Object.keys(MATERIAS).map(m => `<option>${m}</option>`).join('')}</select></label>
      <div class="lado pergunta"><span class="lado-rotulo">Pergunta (frente)</span>${dig ? '<textarea id="c-ft" style="min-height:110px"></textarea>' : quadroHtml('novo-f', 240, 'pontos')}</div>
      <div class="lado resposta"><span class="lado-rotulo">Resposta (verso)</span>${dig ? '<textarea id="c-vt" style="min-height:140px"></textarea>' : quadroHtml('novo-v', 300, 'pontos')}</div>
      <div class="linha"><button class="botao grande" data-acao="salvarCartao">Salvar cartão</button><button class="botao contorno" data-acao="cancelarCartao">Cancelar</button></div></section>`;
  }
  if (s) {
    const c = S.cartoes.find(x => x.id === s.fila[s.i]);
    if (!c) return `<section class="cartao"><h2>Revisão terminada</h2><p style="margin:0">Você revisou ${s.fila.length} ${s.fila.length === 1 ? 'cartão' : 'cartões'}. Volte amanhã.</p>
      <div class="linha"><button class="botao" data-acao="fimRevisao">Voltar</button></div></section>`;
    return `<section class="cartao cartao-rev" style="${cor(c.materia)}"><div class="entre"><span class="rotulo">${s.i + 1} de ${s.fila.length}</span><span class="linha" style="gap:6px">${tag(c.materia)}${c.assunto ? `<span class="selo">${esc(c.assunto)}</span>` : ''}${c.fonte ? `<span class="fraco" style="font-size:12px">${esc(c.fonte)}</span>` : ''}</span></div>
      ${cartaoLado(c, 'f')}
      ${s.virado ? `<hr>${cartaoLado(c, 'v')}
        <div class="linha"><button class="botao contorno" data-acao="nota" data-v="0">Errei</button><button class="botao contorno" data-acao="nota" data-v="1">Difícil</button>
        <button class="botao" data-acao="nota" data-v="2">Bom</button><button class="botao destaque" data-acao="nota" data-v="3">Fácil</button></div>`
        : `<div class="linha"><button class="botao grande" data-acao="virar">Mostrar a resposta</button></div>`}</section>`;
  }
  const v = cartoesVencidos().length, tot = S.cartoes.length, g = ui.cgLista;
  return `<section class="cartao"><div class="entre"><h2>Cartões</h2><span class="fraco">${tot} ${tot === 1 ? 'cartão' : 'cartões'} · ${v} para hoje</span></div>
    <p class="fraco" style="margin:0">Escreva (à mão ou digitando) a pergunta de um lado e a resposta do outro, crie direto dentro das questões ou peça para a IA gerar. O que você erra volta logo; o que acerta volta cada vez mais espaçado.</p>
    <div class="linha"><button class="botao grande" data-acao="revisar" ${v ? '' : 'disabled'}>${v ? `Revisar ${v}` : 'Nada para revisar hoje'}</button>${tot && !v ? `<button class="botao claro" data-acao="revisarTodos">Revisar todos (${tot})</button>` : ''}<button class="botao claro" data-acao="novoCartao">+ Novo cartão</button></div></section>
    <section class="cartao"><h2>Gerar cartões com a IA</h2><p class="fraco" style="margin:0">Diga o que você quer, com as características que preferir.</p>
      <div class="linha"><label class="campo" style="flex:1 1 180px">Matéria<select data-ui="cgMat">${Object.keys(MATERIAS).map(m => `<option ${ui.cgMat === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>
      <textarea id="cg-pedido" data-ui="cgPedido" placeholder="Ex.: 10 cartões sobre o ciclo de Krebs, com pergunta curta e resposta objetiva. Pode incluir um macete para decorar.">${esc(ui.cgPedido)}</textarea>
      <div class="linha"><span class="fraco">Quantos cartões:</span>${stepperHtml('cg-n', ui.cgN, 1, 100)}
        ${[10, 20, 30, 50].map(n => `<button class="chip" data-acao="cgN" data-v="${n}" aria-pressed="${ui.cgN === n}">${n}</button>`).join('')}
        <button class="botao" data-acao="cgGerar">Gerar ${ui.cgN}</button></div>
      ${g ? `<div class="coluna" style="gap:8px"><span class="rotulo">revise antes de adicionar</span>${g.map((x, i) => `<label class="cg-item"><input type="checkbox" data-acao="cgMarca" data-i="${i}" ${x.sel ? 'checked' : ''}><span><b>${esc(x.frente)}</b><br><span class="fraco">${esc(x.verso)}</span></span></label>`).join('')}
        <div class="linha"><button class="botao grande" data-acao="cgAdd">Adicionar ${g.filter(x => x.sel).length} ${g.filter(x => x.sel).length === 1 ? 'cartão' : 'cartões'}</button><button class="botao contorno" data-acao="cgDescartar">Descartar</button></div></div>` : ''}</section>
    ${tot ? `<section class="cartao"><h2>Por matéria</h2>${[...new Set(S.cartoes.map(c => c.materia))].map(m => { const n = S.cartoes.filter(c => c.materia === m).length; return `<div class="entre prova"><span>${tag(m)}</span><span class="fraco">${n} ${n === 1 ? 'cartão' : 'cartões'}</span></div>`; }).join('')}
      ${detalhe('vercartoes', `Ver meus cartões (${tot})`, `<div class="coluna" style="gap:8px">${S.cartoes.slice().reverse().map(c => `<div class="entre prova" style="align-items:flex-start"><div class="coluna" style="gap:2px"><span class="linha" style="gap:6px">${tag(c.materia)}${c.assunto ? `<span class="selo">${esc(c.assunto)}</span>` : ''}<span class="fraco" style="font-size:12px">próx.: ${diaCurto(c.prox)}</span></span>${(c.ft || c.frente) ? `<strong>${esc((c.ft || c.frente).slice(0, 120))}</strong><span class="fraco" style="font-size:13px">${esc((c.vt || c.verso || '').slice(0, 140))}</span>` : '<span class="fraco">Cartão escrito à mão</span>'}</div><button class="x" data-acao="apagarCartao" data-id="${c.id}" title="Apagar cartão">×</button></div>`).join('')}</div>`)}</section>` : ''}`;
}

Object.assign(ACOES, {
  cartaoModo: el => { ui.cartaoModo = el.dataset.v; render(); },
  salvarCartao: async () => {
    const mat = $('#c-mat')?.value || '', id = uid();
    if (ui.cartaoModo === 'digitar') {
      const ft = ($('#c-ft')?.value || '').trim(), vt = ($('#c-vt')?.value || '').trim();
      if (!ft || !vt) { ui.iaMsg = 'Escreva a frente e o verso do cartão.'; render(); return; }
      S.cartoes.push({ id, materia: mat, ft, vt, prox: hoje(), int: 0, fac: 2.3, n: 0 });
    } else {
      const f = quadroDe('novo-f'), v = quadroDe('novo-v');
      if (!f || !v || f.vazio() || v.vazio()) { ui.iaMsg = 'Escreva a frente e o verso do cartão.'; render(); return; }
      await DB.set(`d:${id}:f`, { w: f.W0, s: f.tr }); await DB.set(`d:${id}:v`, { w: v.W0, s: v.tr }); await DB.del('d:novo-f'); await DB.del('d:novo-v');
      S.cartoes.push({ id, materia: mat, prox: hoje(), int: 0, fac: 2.3, n: 0 });
    }
    salvar(); ui.novoCartao = false; ui.iaMsg = 'Cartão salvo.'; render();
  },
  cgN: el => { ui.cgN = +el.dataset.v; render(); },
  cgMarca: el => { const x = ui.cgLista?.[+el.dataset.i]; if (x) { x.sel = el.checked; render(); } },
  cgDescartar: () => { ui.cgLista = null; render(); },
  cgGerar: async () => {
    const pedido = ($('#cg-pedido')?.value ?? ui.cgPedido).trim(); ui.cgPedido = pedido;
    const nIn = Math.round(+$('#cg-n')?.value); if (nIn >= 1) ui.cgN = Math.min(100, nIn);
    if (!pedido) { ui.iaMsg = 'Descreva os cartões que você quer.'; render(); return; }
    ui.iaMsg = ''; const lista = []; let erro = '';
    try {
      // pede em lotes de 12 até chegar na quantidade escolhida (qualquer número, sem limite fixo de 5)
      for (let tentativa = 0; lista.length < ui.cgN && tentativa < 12; tentativa++) {
        const falta = Math.min(12, ui.cgN - lista.length);
        ui.carregando = `Criando os cartões… ${lista.length} de ${ui.cgN}`; render();
        const r = await chamarIa(`Crie exatamente ${falta} cartões de estudo (flashcards) de ${ui.cgMat} para uma estudante de Medicina em preparação para vestibular (Fuvest, Vunesp, ENEM). Pedido dela: "${pedido}". Cada cartão: "frente" é uma pergunta curta e específica; "verso" é a resposta objetiva (no máximo 3 linhas), com um macete se ajudar. ${lista.length ? 'NÃO repita estas perguntas já criadas: ' + lista.slice(-40).map(c => c.frente).join(' | ') + '. ' : ''}Responda SÓ com JSON: {"cartoes":[{"frente":"...","verso":"..."}]}`, 5000, [], 'texto');
        const novos = (r.cartoes || []).filter(c => c.frente && c.verso && !lista.some(x => x.frente === String(c.frente)));
        if (!novos.length) break;
        lista.push(...novos.map(c => ({ frente: String(c.frente), verso: String(c.verso), sel: true })));
      }
    } catch (e) { erro = e.message; }
    ui.cgLista = lista.slice(0, ui.cgN).length ? lista.slice(0, ui.cgN) : null;
    if (!ui.cgLista) ui.iaMsg = `Não consegui gerar agora (${erro || 'a IA não devolveu cartões'}).`;
    else if (erro || lista.length < ui.cgN) ui.iaMsg = `Gerei ${ui.cgLista.length} de ${ui.cgN} (${erro || 'a IA parou de trazer novos'}). Dá para gerar mais depois.`;
    ui.carregando = ''; render();
  },
  cgAdd: () => {
    const sel = (ui.cgLista || []).filter(x => x.sel);
    for (const x of sel) S.cartoes.push({ id: uid(), materia: ui.cgMat, ft: x.frente, vt: x.verso, prox: hoje(), int: 0, fac: 2.3, n: 0 });
    salvar(); ui.cgLista = null; ui.iaMsg = `${sel.length} ${sel.length === 1 ? 'cartão adicionado' : 'cartões adicionados'}. Já estão na fila de hoje.`; render();
  },
});

// preenche as fotos guardadas (correções) depois de cada desenho de tela
{
  const r0 = render;
  render = function () {
    r0.apply(this, arguments);
    document.querySelectorAll('img[data-foto]:not([data-ok])').forEach(img => { img.dataset.ok = '1'; DB.get(img.dataset.foto).then(d => { if (d?.foto) img.src = d.foto; }); });
  };
}
S.redacoes.forEach(migrarRed);
render();
