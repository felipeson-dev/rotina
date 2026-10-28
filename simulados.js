'use strict';
/* Simulados e provas antigas: (1) registrar à mão um simulado/prova feito fora do app (acertos no total e, se quiser, por matéria,
   que também entram nas estatísticas do dia); (2) fazer uma prova antiga inteira no app, com cronômetro e gabarito só no fim
   ("Entregar prova"), nota por matéria e depois a revisão questão por questão. Tudo fica em S.simulados e aparece no Desempenho. */
S.simulados ||= [];
ui.simForm = false; ui.simBanca = ''; ui.simAno = '';
const MATS_SIM = ['Biologia', 'Química', 'Física', 'Matemática', 'Português', 'Literatura', 'Inglês', 'História', 'Geografia', 'Filosofia', 'Sociologia'];
const pctDe = (a, t) => t ? Math.round(a / t * 100) : 0;

function provasNoBanco() {
  const g = {};
  for (const q of BANCO.itens) if (q.t === 'real' && !q.ds && q.a && q.b) { const k = q.b + '|' + q.a; (g[k] ||= { b: q.b, a: q.a, ids: [] }).ids.push(q.id); }
  return Object.values(g).filter(x => x.ids.length >= 10);
}

function vSimulados() {
  if (!BANCO.pronto) { carregarBanco(); }
  const provas = BANCO.pronto ? provasNoBanco() : [], bancas = [...new Set(provas.map(p => p.b))].sort();
  const anos = provas.filter(p => p.b === ui.simBanca).map(p => p.a).sort((x, y) => y - x);
  const escolhida = provas.find(p => p.b === ui.simBanca && String(p.a) === String(ui.simAno));
  const l = S.simulados.slice().sort((x, y) => x.dia < y.dia ? 1 : -1);
  const form = ui.simForm ? `<div class="sim-form">
      <div class="linha"><label class="campo" style="flex:2 1 220px">Nome<input type="text" id="sim-nome" placeholder="Ex.: Simulado Fuvest 3, Santa Casa 2024"></label>
        <label class="campo" style="flex:1 1 150px">Dia<input type="date" id="sim-dia" value="${hoje()}"></label>
        <label class="campo" style="flex:1 1 150px">Tipo<select id="sim-tipo"><option value="simulado">Simulado</option><option value="prova">Prova antiga</option></select></label></div>
      <div class="linha"><label class="campo" style="flex:1 1 110px">Questões<input type="number" id="sim-total" min="1" max="300"></label>
        <label class="campo" style="flex:1 1 110px">Acertos<input type="number" id="sim-acertos" min="0" max="300"></label>
        <label class="campo" style="flex:1 1 110px">Tempo (min)<input type="number" id="sim-tempo" min="0" max="900"></label>
        <label class="campo" style="flex:1 1 110px">Nota (se tiver)<input type="text" id="sim-nota" placeholder="ex.: 72 ou 780"></label></div>
      <details class="det-q"><summary>Acertos por matéria (opcional, entra nas estatísticas)</summary><div class="det-corpo sim-mats">
        ${MATS_SIM.map(m => `<div class="sim-mat" style="${cor(m)}"><span><i class="ponto"></i>${m}</span><input type="number" min="0" max="200" placeholder="feitas" data-sim-f="${m}"><input type="number" min="0" max="200" placeholder="certas" data-sim-a="${m}"></div>`).join('')}</div></details>
      <label class="campo">Observação<input type="text" id="sim-obs" placeholder="Ex.: errei por desatenção em física; faltou tempo no fim"></label>
      <div class="linha"><button class="botao" data-acao="simSalvar">Salvar</button><button class="link" data-acao="simForm">Cancelar</button></div></div>` : '';
  return `<section class="cartao"><div class="entre"><h2>Fazer uma prova antiga no app</h2></div>
      <p class="fraco" style="margin:0">A prova inteira, na ordem, com cronômetro. O gabarito só aparece quando você entregar; depois dá para revisar questão por questão.</p>
      ${provas.length ? `<div class="filtros"><label class="filtro"><span>Prova</span><select data-ui-sim="simBanca">${opcao('', 'Escolha', ui.simBanca)}${bancas.map(b => opcao(b, b, ui.simBanca)).join('')}</select></label>
        <label class="filtro"><span>Ano</span><select data-ui-sim="simAno" ${ui.simBanca ? '' : 'disabled'}>${opcao('', ui.simBanca ? 'Escolha' : 'Escolha a prova antes', ui.simAno)}${anos.map(a => opcao(a, a, ui.simAno)).join('')}</select></label></div>
        <div class="linha"><button class="botao grande" data-acao="simComecar" ${escolhida ? '' : 'disabled'}>${escolhida ? `Começar (${escolhida.ids.length} questões)` : 'Começar'}</button></div>`
        : '<p class="fraco" style="margin:0">Importe as provas oficiais em Questões para fazer uma prova inteira aqui.</p>'}</section>
    <section class="cartao"><div class="entre"><h2>Meus simulados e provas</h2>${ui.simForm ? '' : '<button class="botao claro" data-acao="simForm">+ Registrar um feito fora do app</button>'}</div>
      ${form}
      ${l.length ? `<div class="sim-lista">${l.map(s => `<div class="sim-item"><div class="entre"><strong>${esc(s.nome)}</strong><span class="fraco">${diaCurto(s.dia)} · ${s.tipo === 'prova' ? 'prova antiga' : 'simulado'}${s.origem === 'app' ? ' · no app' : ''}</span></div>
          <div class="linha" style="gap:8px"><span class="selo grande" style="color:${dsCorAc(pctDe(s.acertos, s.total))}">${s.acertos}/${s.total} · ${pctDe(s.acertos, s.total)}%</span>${s.nota ? `<span class="selo">nota ${esc(s.nota)}</span>` : ''}${s.tempo ? `<span class="fraco">${fmtMin(s.tempo)}</span>` : ''}</div>
          ${Object.keys(s.porMat || {}).length ? `<div class="linha" style="gap:6px">${Object.entries(s.porMat).map(([m, v]) => `<span class="tag" style="${cor(m)}">${esc(m)} ${v.a}/${v.f}</span>`).join('')}</div>` : ''}
          ${s.obs ? `<span class="fraco" style="font-size:14px">${esc(s.obs)}</span>` : ''}<div class="linha"><button class="link" data-acao="simApagar" data-id="${s.id}">Apagar</button></div></div>`).join('')}</div>`
        : '<p class="fraco" style="margin:0">Nenhum simulado ainda. Registre os que fizer fora do app ou faça uma prova antiga aqui.</p>'}</section>`;
}

/** Durante a prova: sem gabarito, dá para trocar a resposta, mapa só marca o que foi respondido. */
function qQuestaoSimulado() {
  const s = ui.qs, q = s.itens[s.i], resp = s.itens.filter(x => x.resp != null).length;
  const mapa = `<nav class="q-mapa" aria-label="Questões da prova">${s.itens.map((x, j) => `<button class="${x.resp != null ? 'resp' : ''} ${j === s.i ? 'atual' : ''}" data-acao="qIr" data-i="${j}">${j + 1}</button>`).join('')}</nav>`;
  return `<section class="cartao sim-barra"><div class="entre"><strong>${esc(s.simNome)}</strong><span class="fraco"><span id="sim-relogio">${fmtMin(Math.round((Date.now() - s.t0) / 60000))}</span> · ${resp} de ${s.itens.length} respondidas</span></div>
      <div class="linha"><button class="botao destaque" data-acao="simEntregar">Entregar prova</button></div></section>${mapa}
    <section class="cartao questao"><div class="entre"><span class="tag" style="${cor(q.materia)}">${esc(q.materia)}</span><span class="fraco">${q.num ? 'nº ' + esc(q.num) : ''}</span></div>
      ${q.modo === 'objetivo' ? recorteObj(q, false) : `<div class="enunciado">${mdLite(q.enunciado)}${(q.imagens || []).map(u => `<img class="q-img" src="${u}" alt="figura" loading="lazy">`).join('')}</div>`}
      <div class="alts ${q.modo === 'objetivo' ? 'so-letras' : ''}">${q.alts.map(a => `<button class="alt ${q.resp === a.l ? 'sel' : ''}" data-acao="qResp" data-v="${a.l}"><b>${a.l}</b><span>${mdLite(a.t)}</span></button>`).join('')}</div>
      <div class="q-nav"><button class="botao contorno" data-acao="qAnt" ${s.i ? '' : 'disabled'}>‹ Anterior</button><button class="botao contorno" data-acao="qRasc">${ui.qRasc ? 'Fechar rascunho' : 'Rascunho'}</button>
        <button class="botao claro" data-acao="qProxSim" ${s.i + 1 < s.itens.length ? '' : 'disabled'}>Próxima ›</button></div>
      ${ui.qRasc ? quadroHtml('qtmp' + s.i, 420, 'quadriculado') : ''}</section>`;
}
setInterval(() => { const el = document.getElementById('sim-relogio'); if (el && ui.qs?.simulado) el.textContent = fmtMin(Math.round((Date.now() - ui.qs.t0) / 60000)); }, 30000);

// na prova, responder só marca (pode trocar); o histórico e o gabarito ficam para a entrega
{ const r0 = ACOES.qResp; ACOES.qResp = el => { const s = ui.qs; if (!s?.simulado) return r0(el); s.itens[s.i].resp = el.dataset.v; render(); }; }

// revisando a prova já entregue: chegar ao fim só volta ao resultado (não conta as questões de novo)
{ const f0 = finalizarSessao; finalizarSessao = function () { const s = ui.qs; if (s?.revisando) { s.fim = true; s.simRes = s.simResG; return; } return f0.apply(this, arguments); }; }

// o resultado da prova: nota por matéria e o botão de revisar
{ const r0 = qResultado; qResultado = function () {
  const s = ui.qs; if (!s.simRes) return r0.apply(this, arguments);
  const x = s.simRes;
  return `<section class="cartao"><h2>${esc(x.nome)}</h2><div class="resumo-dia"><div><strong style="color:${dsCorAc(pctDe(x.acertos, x.total))}">${x.acertos}/${x.total}</strong><span>${pctDe(x.acertos, x.total)}% de acerto</span></div>
      <div><strong>${fmtMin(x.tempo)}</strong><span>de prova</span></div><div><strong>${x.total - x.respondidas}</strong><span>em branco</span></div></div>
    <div class="coluna" style="gap:10px">${Object.entries(x.porMat).sort((a, b) => pctDe(a[1].a, a[1].f) - pctDe(b[1].a, b[1].f)).map(([m, v]) => `<div class="meta-linha" style="${cor(m)}"><span><i class="ponto"></i>${esc(m)}</span><span class="fraco"><b style="color:${dsCorAc(pctDe(v.a, v.f))}">${pctDe(v.a, v.f)}%</b> · ${v.a}/${v.f}</span><div class="barra"><i style="width:${pctDe(v.a, v.f)}%;background:${dsCorAc(pctDe(v.a, v.f))}"></i></div></div>`).join('')}</div>
    <p class="fraco" style="margin:0">Ficou guardada em Simulados, e os erros foram para o caderno de erros.</p>
    <div class="linha"><button class="botao grande" data-acao="simRevisar">Revisar a prova</button><button class="botao claro" data-acao="qNova">Voltar às questões</button></div></section>`;
}; }

Object.assign(ACOES, {
  simForm: () => { ui.simForm = !ui.simForm; render(); },
  simSalvar: () => {
    const v = id => $('#' + id)?.value?.trim() || '', total = Math.round(+v('sim-total')), ac = Math.round(+v('sim-acertos'));
    if (!(total > 0) || !(ac >= 0) || ac > total) { ui.iaMsg = 'Confira: os acertos não podem passar do número de questões.'; render(); return; }
    const dia = okData(v('sim-dia')) ? v('sim-dia') : hoje(), porMat = {};
    for (const m of MATS_SIM) { const f = Math.round(+($(`[data-sim-f="${m}"]`)?.value || 0)), a = Math.round(+($(`[data-sim-a="${m}"]`)?.value || 0)); if (f > 0 && a >= 0 && a <= f) porMat[m] = { f, a }; }
    // as questões por matéria entram nas estatísticas do dia (ela faz muita coisa fora do app)
    for (const [m, x] of Object.entries(porMat)) { const d = ((S.qlog[dia] ||= {})[m] ||= { f: 0, a: 0 }); d.f += x.f; d.a += x.a; }
    S.simulados.push({ id: uid(), dia, nome: v('sim-nome') || 'Simulado', tipo: v('sim-tipo') || 'simulado', total, acertos: ac, tempo: Math.round(+v('sim-tempo')) || 0, nota: v('sim-nota').slice(0, 12), porMat, obs: v('sim-obs').slice(0, 200), origem: 'manual' });
    ui.simForm = false; ui.iaMsg = 'Simulado registrado.'; salvar(); render();
  },
  simApagar: el => { S.simulados = S.simulados.filter(s => s.id !== el.dataset.id); salvar(); render(); },
  simComecar: async () => {
    const p = provasNoBanco().find(x => x.b === ui.simBanca && String(x.a) === String(ui.simAno)); if (!p) return;
    await ACOES.qIniciarIds(p.ids);
    Object.assign(ui.qs, { simulado: true, simNome: `${p.b} ${p.a}`, t0: Date.now() }); window.scrollTo(0, 0); render();
  },
  qProxSim: () => { const s = ui.qs; if (s.i + 1 < s.itens.length) { s.i++; window.scrollTo(0, 0); } render(); },
  simEntregar: () => {
    const s = ui.qs, falta = s.itens.filter(q => q.resp == null).length;
    if (falta && !confirm(`Ainda há ${falta} ${falta === 1 ? 'questão' : 'questões'} sem resposta. Entregar mesmo assim?`)) return;
    const porMat = {}; let ac = 0;
    for (const q of s.itens) {
      const m = q.materia || 'Outra', x = (porMat[m] ||= { f: 0, a: 0 }); x.f++;
      if (q.resp != null) { q.certo = q.resp === q.gab; if (q.certo) { x.a++; ac++; } registrarHist(q); }
    }
    const tempo = Math.round((Date.now() - s.t0) / 60000);
    s.simulado = false; finalizarSessao();
    s.simRes = { nome: s.simNome, acertos: ac, total: s.itens.length, respondidas: s.itens.filter(q => q.resp != null).length, porMat, tempo };
    S.simulados.push({ id: uid(), dia: hoje(), nome: s.simNome, tipo: 'prova', total: s.itens.length, acertos: ac, tempo, nota: '', porMat, obs: '', origem: 'app' });
    salvar(); window.scrollTo(0, 0); render();
  },
  simRevisar: () => { const s = ui.qs; s.fim = false; s.revisando = true; s.simResG = s.simRes; s.simRes = null; s.i = 0; window.scrollTo(0, 0); render(); },
  simVer: () => { ui.view = 'questoes'; ui.qAba = 'simulados'; ui.qs = null; window.scrollTo(0, 0); render(); },
});
document.addEventListener('change', e => { const k = e.target.dataset?.uiSim; if (k) { ui[k] = e.target.value; if (k === 'simBanca') ui.simAno = ''; render(); } });

// Desempenho: evolução dos simulados
{ const v0 = VIEWS.desempenho; VIEWS.desempenho = function () {
  const l = S.simulados.slice().sort((a, b) => a.dia < b.dia ? -1 : 1).slice(-12);
  if (!l.length) return v0();
  const html = `<section class="cartao"><h2>Simulados e provas</h2><div class="des-barras">${l.map(s => { const p = pctDe(s.acertos, s.total);
    return `<div class="des-col" title="${esc(s.nome)}: ${p}%"><span class="des-n">${p}%</span><i style="height:${Math.max(4, p)}%;background:${dsCorAc(p)}"></i><small>${diaCurto(s.dia).slice(0, 5)}</small></div>`; }).join('')}</div>
    <div class="linha"><button class="botao claro" data-acao="simVer">Ver todos</button></div></section>`;
  return v0().replace('<section class="cartao"><h2>Por matéria</h2>', html + '<section class="cartao"><h2>Por matéria</h2>');
}; }
