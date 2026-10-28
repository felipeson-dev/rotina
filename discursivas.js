'use strict';
/* Questões discursivas (2ª fase da Fuvest, Unicamp, UNESP; provas abertas de Santa Casa, UNIFESP, FAMERP…): o enunciado é a imagem
   da prova (recortada), ela responde com a caneta num quadro que fica guardado, abre o padrão de resposta (a resolução do Curso Objetivo,
   na mesma imagem) e se avalia: acertei, em parte ou errei. Também dá para pedir a correção à IA, que lê a letra dela. */

// importar: as discursivas vêm no modo imagem, sem alternativas nem gabarito
{ const n0 = normalizarImportada; normalizarImportada = function (q, i) {
  if (q && q.tipo === 'disc' && q.modo === 'objetivo' && /^https:/.test(q.img || '') && q.corte > 0)
    return { id: q.id, banca: String(q.banca), tipo: 'disc', ano: +q.ano || 0, area: AREA_DA_MATERIA[q.materia] || '', materia: q.materia || '', assunto: q.assunto || '', dif: '', fig: 0,
      enunciado: String(q.enunciado || ''), imagens: [], alts: [], gab: '', coment: String(q.coment || ''), fonte: 'Objetivo', modo: 'objetivo', img: q.img, w: +q.w, h: +q.h, corte: +q.corte,
      prev: q.prev || '', num: q.num || '', fase: q.fase || '', v: +q.v || 0 };
  return n0.apply(this, arguments);
}; }

// escolher: objetivas e discursivas não se misturam; a caixa "Tipo" troca entre elas
{ const f0 = filtrarBanco; filtrarBanco = function (troca = {}) { const tq = ({ ...ui.qf, ...troca }).tipoQ || ''; return f0.call(this, troca).filter(q => tq === 'disc' ? q.ds : !q.ds); }; }
{ const m0 = qMontar; qMontar = function () {
  const h = m0.apply(this, arguments); if (!BANCO.pronto || !BANCO.itens.length) return h;
  const nd = BANCO.itens.filter(q => q.ds).length, tq = ui.qf.tipoQ || '';
  if (!nd && !tq) return h;
  const caixa = `<label class="filtro ${tq ? 'ativo' : ''}"><span>Tipo</span><select data-qf="tipoQ">${opcao('', `Objetivas (${milhar(BANCO.itens.length - nd)})`, tq)}${opcao('disc', `Discursivas (${milhar(nd)})`, tq)}</select></label>`;
  return h.replace('<div class="filtros">', '<div class="filtros">' + caixa);
}; }

function qQuestaoDisc() {
  const s = ui.qs, q = s.itens[s.i], ultima = s.i + 1 >= s.itens.length, aval = { C: 'Acertei', P: 'Acertei em parte', E: 'Errei' };
  if (ui.qPrevImg && ui.qPrevDe !== q.id) ui.qPrevImg = null;
  const ia = q.discIa ? `<div class="res-ia"><span class="rotulo">correção pela IA${q.discIa.nota != null ? ` · nota ${q.discIa.nota}/10` : ''}</span>
      ${(q.discIa.itens || []).map(x => `<p style="margin:0"><b>${esc(x.item)})</b> ${x.nota != null ? `<span class="selo">${x.nota}</span> ` : ''}${esc(x.comentario || '')}</p>`).join('')}${q.discIa.geral ? `<p style="margin:0">${mdLite(q.discIa.geral)}</p>` : ''}</div>` : '';
  return `${mapaSessao(s)}<section class="cartao questao"><div class="entre"><span class="linha" style="gap:6px"><span class="tag" style="${cor(q.materia)}">${esc(q.materia || 'Discursiva')}</span><span class="selo">discursiva</span>${q.assunto ? `<span class="selo">${esc(q.assunto)}</span>` : ''}</span><span class="fraco">${esc(q.fonte)}${q.num ? ' · nº ' + esc(q.num) : ''}</span></div>
    ${histHtml(q.id)}
    ${q.prev ? `<button class="link" data-acao="qPrev" style="align-self:flex-start">${ui.qPrevImg ? 'Esconder' : 'Ver'} a questão anterior (às vezes o texto-base está nela)</button>${ui.qPrevImg ? prevHtml(ui.qPrevImg) : ''}` : ''}
    ${riscavel(recorteObj(q, false))}
    <span class="rotulo">sua resposta (com a caneta)</span>
    ${quadroHtml('disc:' + q.id, 380, 'linhas')}
    ${q.verRes ? `<div class="coluna" style="gap:6px"><span class="rotulo">padrão de resposta (resolução do Curso Objetivo)</span>${recorteObj(q, true)}</div>
      <div class="coluna" style="gap:8px"><span class="rotulo">como foi?</span><div class="linha">${Object.entries(aval).map(([v, t]) => `<button class="chip disc-av ${v}" data-acao="qDiscAval" data-v="${v}" aria-pressed="${q.resp === v}">${t}</button>`).join('')}</div></div>
      <div class="linha"><button class="botao claro" data-acao="discIa" ${ui.carregando ? 'disabled' : ''}>${q.discIa ? 'Corrigir de novo com a IA' : 'Corrigir com a IA (lê a sua letra)'}</button></div>${ia}`
      : '<div class="linha"><button class="botao grande" data-acao="qDiscVer">Ver o padrão de resposta</button></div>'}
    <div class="q-nav"><button class="botao contorno" data-acao="qAnt" ${s.i ? '' : 'disabled'}>‹ Anterior</button>
      <button class="botao contorno" data-acao="qRiscar" aria-pressed="${!!ui.qRiscar}">${ui.qRiscar ? 'Parar de riscar' : 'Riscar na questão'}</button>
      <button class="botao ${q.resp ? 'grande' : 'claro'}" data-acao="qProx">${ultima ? 'Terminar' : 'Próxima ›'}</button></div></section>`;
}
{ const q0 = qQuestao; qQuestao = function () { const s = ui.qs, q = s?.itens[s.i]; return q?.tipo === 'disc' && !s.simulado ? qQuestaoDisc() : q0.apply(this, arguments); }; }

// o caderno de erros sabe que era discursiva
{ const f0 = finalizarSessao; finalizarSessao = function () {
  const s = ui.qs, disc = new Set((s?.itens || []).filter(q => q.tipo === 'disc').map(q => q.id)); f0.apply(this, arguments);
  if (disc.size) for (const e of S.erros) if (disc.has(e.qid)) e.tipo = 'disc';
}; }

Object.assign(ACOES, {
  qDiscVer: () => { const s = ui.qs, q = s.itens[s.i]; q.verRes = true; if (q.resp == null) fecharItem(s); render(); },
  qDiscAval: el => {
    const s = ui.qs, q = s.itens[s.i], primeira = q.resp == null;
    q.resp = el.dataset.v; q.certo = q.resp === 'C';
    if (primeira) registrarHist(q); else if (S.qh[q.id]) { const h = S.qh[q.id]; h.ok = q.certo; if (h.h?.length) { h.h[h.h.length - 1][1] = q.certo ? 1 : 0; h.h[h.h.length - 1][2] = q.resp; } salvar(); }
    render();
  },
  discIa: async () => {
    const s = ui.qs, q = s.itens[s.i], quadro = quadroDe('disc:' + q.id);
    if (!quadro || quadro.vazio()) { ui.iaMsg = 'Escreva a sua resposta no quadro antes de pedir a correção.'; render(); return; }
    ui.carregando = 'A IA está corrigindo a sua resposta…'; render();
    try {
      const r = await iaComImagem(`Você é corretor de vestibular de Medicina (banca: ${q.fonte}). Corrija a resposta manuscrita da estudante (na imagem) a esta questão DISCURSIVA.
Enunciado (lido da imagem da prova, pode ter pequenos erros de leitura): ${q.enunciado || '(não disponível)'}
${q.coment ? `Padrão de resposta: ${q.coment}` : 'Sem o padrão de resposta em texto: corrija pelo conteúdo correto que a banca espera.'}
Para cada item (a, b, c…), diga em 1 ou 2 frases o que está certo, o que faltou ou está errado, e dê nota de 0 a 1. Corrija como a banca: termos técnicos e justificativa contam. Seja direta e gentil, sem saudação.
Responda SÓ com JSON: {"itens":[{"item":"a","nota":1,"comentario":""}],"nota":7.5,"geral":"1 ou 2 frases com o que treinar"}`, quadro.imagem(1200), 3000);
      await guardarNaQuestao(q, { discIa: { itens: Array.isArray(r.itens) ? r.itens.slice(0, 8) : [], nota: r.nota != null ? Math.round(+r.nota * 10) / 10 : null, geral: String(r.geral || '').trim() } });
    } catch (e) { ui.iaMsg = `Não consegui corrigir agora (${e.message}).`; }
    ui.carregando = ''; render();
  },
});
