'use strict';
/* Redação com histórico (reler o texto e todas as correções, da IA e de outras pessoas) e cartões com gerador por IA.
   Carregado depois do pencil.js: as funções vRedacao, vCartoes e as ações daqui substituem as antigas. */

const migrarRed = r => {
  if (!r.id) r.id = uid();
  r.correcoes ||= [];
  if (r.manual) { r.correcoes.push({ id: uid(), fonte: 'Professor', nota: r.manual.nota, obs: r.manual.obs || '', dia: r.dia }); delete r.manual; }
  return r;
};
const notaRed = r => r.nota ?? (r.correcoes.length ? r.correcoes[r.correcoes.length - 1].nota : null);
const stepperHtml = (id, v, min, max) => `<div class="stepper"><button type="button" class="qb" data-acao="step" data-id="${id}" data-d="-1" aria-label="menos">−</button><input type="number" id="${id}" min="${min}" max="${max}" value="${v}" inputmode="numeric"><button type="button" class="qb" data-acao="step" data-id="${id}" data-d="1" aria-label="mais">+</button></div>`;
Object.assign(ACOES, { step: el => { const i = document.getElementById(el.dataset.id); if (!i) return; const n = Math.max(+i.min, Math.min(+i.max, (+i.value || 0) + +el.dataset.d)); i.value = n; if (i.id === 'cg-n') ui.cgN = n; if (i.id === 'qia-n') ui.qNIa = n; i.dispatchEvent(new Event('input', { bubbles: true })); const b = document.querySelector('[data-acao="cgGerar"]'); if (b && i.id === 'cg-n') b.textContent = 'Gerar ' + n; } });
document.addEventListener('input', e => { if (e.target.id === 'cg-n') { ui.cgN = Math.max(1, Math.min(100, Math.round(+e.target.value) || 1)); const b = document.querySelector('[data-acao="cgGerar"]'); if (b) b.textContent = 'Gerar ' + ui.cgN; } if (e.target.id === 'qia-n') ui.qNIa = Math.max(1, Math.min(60, Math.round(+e.target.value) || 1)); });
ui.redVer = null; ui.cgMat = 'Biologia'; ui.cgPedido = ''; ui.cgN = 10; ui.cgLista = null; ui.cartaoModo = 'mao';

function iaCardHtml(r) {
  return `<div class="corr-card"><div class="entre"><h3>Correção da IA</h3><span class="nota" style="color:${notaCor(r.nota_total / 5)}">${r.nota_total}<small>/1000</small></span></div>
    ${(r.competencias || []).map(c => `<div class="comp"><div class="entre"><strong>C${c.n} · ${esc(c.nome || '')}</strong><span style="color:${notaCor(c.nota)};font-weight:800">${c.nota}</span></div>
      <div class="barra"><i style="width:${Math.min(100, c.nota / 2)}%;background:${notaCor(c.nota)}"></i></div><span class="fraco" style="font-size:14px">${esc(c.comentario || '')}</span></div>`).join('')}
    ${r.pontos_fortes?.length ? `<div><span class="rotulo">o que está bom</span><ul>${r.pontos_fortes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${r.melhorar?.length ? `<div><span class="rotulo">para melhorar</span><ul>${r.melhorar.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${r.proximo_passo ? `<p class="mao" style="margin:0">${esc(r.proximo_passo)}</p>` : ''}
    ${r.transcricao ? `<details><summary class="link">Ver o que a IA leu da sua letra</summary><p class="fraco" style="white-space:pre-wrap">${esc(r.transcricao)}</p></details>` : ''}</div>`;
}

function evolucaoRed() {
  const l = S.redacoes.filter(r => notaRed(r) != null).slice(-12);
  if (l.length < 2) return '';
  return `<div class="coluna" style="gap:6px"><span class="rotulo">sua evolução</span><div class="evolucao">${l.map(r => `<div title="${esc(r.tema || '')}: ${notaRed(r)}"><i style="height:${Math.round(notaRed(r) / 10)}%;background:${notaCor(notaRed(r) / 5)}"></i><small>${notaRed(r)}</small></div>`).join('')}</div></div>`;
}

function vRedacao() {
  S.redacoes.forEach(migrarRed);
  if (ui.redVer) return vRedDetalhe(S.redacoes.find(r => r.id === ui.redVer));
  const w = semAtual();
  const temas = S.assuntos.filter(a => /^Reda/.test(a.titulo) && !a.feito && semDe(a) <= somaDias(w, 7)).slice(0, 6);
  const r = ui.redRes, hist = S.redacoes.slice().reverse();
  return `<section class="cartao"><p class="fraco" style="margin:0">Escreva a redação (à mão ou digitando). A IA corrige pelas 5 competências do ENEM, e você pode guardar também a correção do professor ou de outra pessoa. Tudo fica no histórico abaixo.</p>
    <div class="alterna" role="group"><button data-acao="redModo" data-v="mao" aria-pressed="${ui.redModo !== 'digitar'}">Escrever à mão</button><button data-acao="redModo" data-v="digitar" aria-pressed="${ui.redModo === 'digitar'}">Digitar</button></div>
    <label class="campo">Tema<input type="text" id="red-tema" value="${esc(ui.redTema)}" placeholder="Ex.: Desafios da saúde mental" data-ui="redTema"></label>
    ${temas.length ? `<div class="linha">${temas.map(a => `<button class="chip" data-acao="temaRed" data-id="${a.id}">${esc(a.titulo.replace(/^Redação[^:]*:\s*/, ''))}</button>`).join('')}</div>` : ''}
    ${ui.redModo === 'digitar' ? `<textarea id="red-digitada" data-ui="redTexto" style="min-height:420px" placeholder="Digite a sua redação aqui (se estiver sem a caneta ou no notebook).">${esc(ui.redTexto)}</textarea>` : quadroHtml('redacao', 1700, 'linhas')}
    <div class="linha"><button class="botao grande" data-acao="corrigirRed">Corrigir com a IA</button><button class="botao contorno" data-acao="salvarRed">Só salvar no histórico</button></div></section>
    ${r ? `<section class="cartao">${iaCardHtml(r)}<div class="linha">${r.id ? `<button class="botao claro" data-acao="redAbrir" data-id="${r.id}">Abrir no histórico</button>` : ''}
      ${r.assuntoId && achar(r.assuntoId) && !achar(r.assuntoId).feito ? `<button class="botao claro" data-acao="feitoAssunto" data-id="${r.assuntoId}">Marcar a redação como feita</button>` : ''}
      <button class="botao contorno" data-acao="rascunhoNova" data-q="redacao">Folha nova</button></div></section>` : ''}
    <section class="cartao"><div class="entre"><h2>Histórico de redações</h2><span class="fraco">${hist.length} ${hist.length === 1 ? 'redação' : 'redações'}</span></div>${evolucaoRed()}
      ${hist.length ? hist.map(h => `<button class="red-item" data-acao="redAbrir" data-id="${h.id}"><span><strong>${esc(h.tema || 'Sem tema')}</strong><small class="fraco"> · ${diaCurto(h.dia)} · ${h.modo === 'digitar' ? 'digitada' : 'à mão'}</small></span>
        <span class="notas-mini">${h.nota != null ? `<b style="color:${notaCor(h.nota / 5)}">IA ${h.nota}</b>` : ''}${h.correcoes.map(c => `<b style="color:${notaCor(c.nota / 5)}">${esc(c.fonte)} ${c.nota}</b>`).join('')}${h.nota == null && !h.correcoes.length ? '<small class="fraco">sem correção</small>' : ''}</span></button>`).join('')
        : '<p class="fraco" style="margin:0">As redações que você corrigir ou salvar aparecem aqui.</p>'}</section>`;
}

function vRedDetalhe(e) {
  if (!e) { ui.redVer = null; return vRedacao(); }
  const ia = e.ia ? iaCardHtml({ ...e.ia, nota_total: e.nota }) : '';
  const corr = e.correcoes.map(c => `<div class="corr-card"><div class="entre"><h3>${esc(c.fonte)} <small class="fraco">· ${diaCurto(c.dia)}</small></h3><span class="nota" style="color:${notaCor(c.nota / 5)}">${c.nota}<small>/1000</small></span></div>
    ${c.comps?.some(x => x != null) ? c.comps.map((n, i) => n == null ? '' : `<div class="comp"><div class="entre"><strong>C${i + 1}</strong><span style="color:${notaCor(n)};font-weight:800">${n}</span></div><div class="barra"><i style="width:${Math.min(100, n / 2)}%;background:${notaCor(n)}"></i></div></div>`).join('') : ''}
    ${c.obs ? `<p style="margin:0;white-space:pre-wrap">${esc(c.obs)}</p>` : ''}
    ${c.foto ? `<img class="desenho" data-foto="foto:${e.id}:${c.id}" alt="foto da correção" style="min-height:120px">` : ''}
    <div class="linha"><button class="link" data-acao="redDelCorr" data-id="${e.id}" data-c="${c.id}">Apagar esta correção</button></div></div>`).join('');
  return `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">redação · ${diaCurto(e.dia)}</span><h2>${esc(e.tema || 'Sem tema')}</h2></div>
    <div class="linha"><button class="botao contorno" data-acao="redVoltar">‹ Voltar</button><button class="botao claro" data-acao="redReescrever" data-id="${e.id}">Reescrever</button></div></header>
    <section class="cartao"><span class="rotulo">o texto</span>${!e.modo ? '<p class="fraco" style="margin:0">Esta redação foi registrada antes de o histórico existir, então o texto e a correção da IA não foram guardados. As próximas ficam completas.</p>' : e.modo === 'digitar' ? `<p style="margin:0;white-space:pre-wrap">${esc(e.texto || '')}</p>` : `<img class="desenho" data-desenho="red:${e.id}" data-prop="2" alt="redação à mão" style="min-height:200px">`}
      <div class="linha">${e.ia ? '' : `<button class="botao" data-acao="corrigirEntrada" data-id="${e.id}">Corrigir com a IA</button>`}<button class="link" data-acao="redApagar" data-id="${e.id}">Apagar a redação</button></div></section>
    ${ia ? `<section class="cartao">${ia}</section>` : ''}${corr ? `<section class="cartao">${corr}</section>` : ''}
    <section class="cartao"><h2>Adicionar a correção de outra pessoa</h2><p class="fraco" style="margin:0">Professor, cursinho, outra IA ou você mesma. Preencha só o que tiver: a nota total, as notas de cada competência, comentários e uma foto da correção.</p>
      <div class="linha"><label class="campo" style="flex:1 1 200px">Quem corrigiu<input type="text" id="cr-fonte" list="fontes-corr" placeholder="Professor, Cursinho, Outra IA…"><datalist id="fontes-corr"><option>Professor</option><option>Cursinho</option><option>Outra IA</option><option>Autocorreção</option></datalist></label>
        <label class="campo" style="flex:0 1 150px">Nota total (0 a 1000)<input type="number" id="cr-nota" min="0" max="1000" step="10"></label></div>
      <div class="linha">${[1, 2, 3, 4, 5].map(i => `<label class="campo" style="flex:1 1 90px">C${i} (0-200)<input type="number" id="cr-c${i}" min="0" max="200" step="20"></label>`).join('')}</div>
      <label class="campo">Comentários<textarea id="cr-obs" placeholder="O que a pessoa disse sobre o texto"></textarea></label>
      <label class="campo">Foto da correção (opcional)<input type="file" id="cr-foto" accept="image/*"></label>
      <div class="linha"><button class="botao" data-acao="redAddCorr" data-id="${e.id}">Salvar correção</button></div></section>`;
}

async function fotoComprimida(file, max = 1400) {
  const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.8);
}

const PROMPT_RED = (tema, digitado) => `${digitado != null ? 'Abaixo está uma redação digitada' : 'A imagem é uma redação manuscrita'} no modelo ENEM (texto dissertativo-argumentativo)${tema ? `, tema: "${tema}"` : ''}.${digitado != null ? `\n\nTEXTO DA REDAÇÃO:\n${digitado}\n\n` : ''} Primeiro ${digitado != null ? 'repita o texto na transcrição' : 'transcreva o texto'}. Depois corrija pelas 5 competências do ENEM, com rigor e sem inflar a nota (notas só 0, 40, 80, 120, 160 ou 200 por competência):
C1 domínio da norma culta; C2 compreensão do tema e estrutura dissertativa; C3 seleção e organização de argumentos; C4 coesão (conectivos); C5 proposta de intervenção (agente, ação, meio, finalidade, detalhamento).
Se a letra estiver difícil de ler, diga isso nos comentários. Responda SÓ com JSON:
{"transcricao":"...","competencias":[{"n":1,"nome":"...","nota":0,"comentario":"1 ou 2 frases"},{"n":2,...},{"n":3,...},{"n":4,...},{"n":5,...}],"nota_total":0,"pontos_fortes":["..."],"melhorar":["..."],"proximo_passo":"1 frase gentil e prática"}`;

async function corrigirComIa(e) {
  const digitado = e.modo === 'digitar' ? e.texto : null;
  let img = null;
  if (digitado == null) { const d = await DB.get('d:red:' + e.id); if (!d?.s?.length) throw new Error('não achei o desenho desta redação'); img = imagemDe(d, 2, 1400); }
  const r = await iaComImagem(PROMPT_RED(e.tema, digitado), img, 8000);
  const comps = (r.competencias || []).map(c => ({ ...c, nota: Math.max(0, Math.min(200, Math.round((+c.nota || 0) / 40) * 40)) }));
  r.competencias = comps; r.nota_total = comps.reduce((s, c) => s + c.nota, 0);
  e.ia = r; e.nota = r.nota_total; return r;
}

/** Guarda a redação do editor no histórico (e o desenho, se for à mão). */
async function guardarRedacaoAtual() {
  const digitar = ui.redModo === 'digitar', q = digitar ? null : quadroDe('redacao');
  const texto = digitar ? ($('#red-digitada')?.value || ui.redTexto || '').trim() : '';
  if (digitar ? texto.length < 80 : (!q || q.vazio())) { ui.iaMsg = digitar ? 'Escreva a redação (pelo menos algumas linhas) primeiro.' : 'A folha está em branco. Escreva a redação primeiro.'; render(); return null; }
  const e = migrarRed({ dia: hoje(), tema: ($('#red-tema')?.value || ui.redTema || '').trim(), modo: digitar ? 'digitar' : 'mao', texto: digitar ? texto : '', nota: null, ia: null, assuntoId: ui.redAssunto || null });
  ui.redTema = e.tema;
  if (!digitar) await DB.set('d:red:' + e.id, { w: q.W0, s: q.tr.map(s => ({ ...s })) });
  S.redacoes.push(e); S.redacoes = S.redacoes.slice(-60); salvar(); return e;
}

Object.assign(ACOES, {
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
    ui.redTema = e.tema; ui.redModo = e.modo; ui.redRes = null; ui.redVer = null;
    if (e.modo === 'digitar') ui.redTexto = e.texto; else { const d = await DB.get('d:red:' + e.id); await DB.set('d:redacao', d); }
    ui.iaMsg = 'Carreguei a redação na folha para você reescrever.'; render();
  },
  redAddCorr: async el => {
    const e = S.redacoes.find(x => x.id === el.dataset.id); if (!e) return;
    const comps = [1, 2, 3, 4, 5].map(i => { const v = $('#cr-c' + i).value; return v === '' ? null : Math.max(0, Math.min(200, Math.round(+v))); });
    let nota = $('#cr-nota').value === '' ? null : Math.max(0, Math.min(1000, Math.round(+$('#cr-nota').value)));
    if (nota == null && comps.some(x => x != null)) nota = comps.reduce((s, x) => s + (x || 0), 0);
    const obs = $('#cr-obs').value.trim(), file = $('#cr-foto').files?.[0];
    if (nota == null) { ui.iaMsg = 'Informe pelo menos a nota total (ou as notas das competências).'; render(); return; }
    const c = { id: uid(), fonte: ($('#cr-fonte').value || 'Professor').trim().slice(0, 40), nota, comps: comps.some(x => x != null) ? comps : null, obs, dia: hoje(), foto: false };
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
  const t = lado === 'f' ? c.ft : c.vt;
  const rot = lado === 'f' ? 'Pergunta' : 'Resposta';
  return `<div class="lado ${lado === 'f' ? 'pergunta' : 'resposta'}"><span class="lado-rotulo">${rot}</span>${t != null ? `<div class="cartao-texto">${esc(t)}</div>` : `<img class="desenho" data-desenho="${c.id}:${lado}" data-prop="${lado === 'f' ? 0.4 : 0.5}" alt="${rot}">`}</div>`;
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
    return `<section class="cartao cartao-rev" style="${cor(c.materia)}"><div class="entre"><span class="rotulo">${s.i + 1} de ${s.fila.length}</span>${tag(c.materia)}</div>
      ${cartaoLado(c, 'f')}
      ${s.virado ? `<hr>${cartaoLado(c, 'v')}
        <div class="linha"><button class="botao contorno" data-acao="nota" data-v="0">Errei</button><button class="botao contorno" data-acao="nota" data-v="1">Difícil</button>
        <button class="botao" data-acao="nota" data-v="2">Bom</button><button class="botao destaque" data-acao="nota" data-v="3">Fácil</button></div>`
        : `<div class="linha"><button class="botao grande" data-acao="virar">Mostrar a resposta</button></div>`}</section>`;
  }
  const v = cartoesVencidos().length, tot = S.cartoes.length, g = ui.cgLista;
  return `<section class="cartao"><div class="entre"><h2>Cartões</h2><span class="fraco">${tot} ${tot === 1 ? 'cartão' : 'cartões'} · ${v} para hoje</span></div>
    <p class="fraco" style="margin:0">Escreva (à mão ou digitando) a pergunta de um lado e a resposta do outro, ou peça para a IA gerar. Eu mostro de novo na hora certa: o que você erra volta logo, o que acerta volta cada vez mais espaçado.</p>
    <div class="linha"><button class="botao grande" data-acao="revisar" ${v ? '' : 'disabled'}>${v ? `Revisar ${v}` : 'Nada para revisar hoje'}</button><button class="botao claro" data-acao="novoCartao">+ Novo cartão</button></div></section>
    <section class="cartao"><h2>Gerar cartões com a IA</h2><p class="fraco" style="margin:0">Diga o que você quer, com as características que preferir.</p>
      <div class="linha"><label class="campo" style="flex:1 1 180px">Matéria<select data-ui="cgMat">${Object.keys(MATERIAS).map(m => `<option ${ui.cgMat === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>
      <textarea id="cg-pedido" data-ui="cgPedido" placeholder="Ex.: 10 cartões sobre o ciclo de Krebs, com pergunta curta e resposta objetiva. Pode incluir um macete para decorar.">${esc(ui.cgPedido)}</textarea>
      <div class="linha"><span class="fraco">Quantos cartões:</span>${stepperHtml('cg-n', ui.cgN, 1, 100)}
        ${[10, 20, 30, 50].map(n => `<button class="chip" data-acao="cgN" data-v="${n}" aria-pressed="${ui.cgN === n}">${n}</button>`).join('')}
        <button class="botao" data-acao="cgGerar">Gerar ${ui.cgN}</button></div>
      ${g ? `<div class="coluna" style="gap:8px"><span class="rotulo">revise antes de adicionar</span>${g.map((x, i) => `<label class="cg-item"><input type="checkbox" data-acao="cgMarca" data-i="${i}" ${x.sel ? 'checked' : ''}><span><b>${esc(x.frente)}</b><br><span class="fraco">${esc(x.verso)}</span></span></label>`).join('')}
        <div class="linha"><button class="botao grande" data-acao="cgAdd">Adicionar ${g.filter(x => x.sel).length} ${g.filter(x => x.sel).length === 1 ? 'cartão' : 'cartões'}</button><button class="botao contorno" data-acao="cgDescartar">Descartar</button></div></div>` : ''}</section>
    ${tot ? `<section class="cartao"><h2>Por matéria</h2>${[...new Set(S.cartoes.map(c => c.materia))].map(m => `<div class="entre prova"><span>${tag(m)}</span><span class="fraco">${S.cartoes.filter(c => c.materia === m).length} cartões</span></div>`).join('')}</section>` : ''}`;
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
