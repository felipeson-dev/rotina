'use strict';
/* Planejamento: ela escreve o que quer estudar num período ("de hoje até o dia 7 vou revisar ecologia, funções...") e a IA distribui pelos dias.
   Ela vê a prévia, pede ajuste se quiser, e aplica: cada item vira um assunto com dia marcado (a.dia) e, nos dias desse período,
   o dia dela usa só o que foi planejado (montarHoje). A mesma aba também muda o cronograma que já existe, pela IA do plano (pedirIa). */
ICONES.planejar = '<path d="M4 6h9M4 12h16M4 18h6"/><circle cx="17" cy="6" r="2.2"/><circle cx="13" cy="18" r="2.2"/>';
ui.plTexto = ''; ui.plAjuste = ''; ui.plMudar = ''; ui.plPrev = null;

const diaCurtoSemana = d => deIso(d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');

async function planejarPeriodo(texto, ajuste = '') {
  const h = hoje(), anterior = ajuste && ui.plPrev ? ui.plPrev : null;
  ui.carregando = anterior ? 'Ajustando o plano…' : 'A IA está organizando o seu período…'; ui.iaMsg = ''; render();
  try {
    const r = await chamarIa(`Hoje é ${dataLonga(h)} (${h}). Ela quer planejar um período de estudo.
Pedido dela: "${texto}"
${anterior ? `Você já tinha proposto este plano: ${JSON.stringify(anterior.itens)}\nEla pediu este ajuste: "${ajuste}". Devolva o plano inteiro já ajustado.` : ''}
Rotina base dela: ${S.perfil.horarios?.trim() || '(não informada)'}.
Provas: ${JSON.stringify(provasFuturas().slice(0, 4))}.${window.pendHojeTexto?.() ? ` Compromissos de hoje: ${window.pendHojeTexto()}.` : ''}
Distribua o que ela pediu pelos dias do período:
- respeite as horas por dia que ela disser; se não disser, use a rotina base; sem nada, umas 4h nos dias úteis e menos no fim de semana. Dias de descanso que ela citar ficam vazios. Não planeje antes de hoje.
- cada item é um bloco de estudo de 30 a 150 min, com título curto e específico do que fazer (ex.: "Ecologia: cadeias e ciclos, revisão + 15 questões do ENEM").
- em cada dia, quando der, misture 1 matéria pesada (Matemática, Física, Química) e 1 leve, com as pesadas primeiro; evite a mesma matéria duas vezes no dia. Se ela pedir só uma matéria, siga o pedido.
- se for revisão para uma prova: inclua questões de provas antigas, um simulado perto da prova e a véspera leve.
- matérias válidas: ${Object.keys(MATERIAS).join(', ')}.
Responda SÓ com JSON: {"resposta":"1 ou 2 frases curtas","inicio":"AAAA-MM-DD","fim":"AAAA-MM-DD","itens":[{"dia":"AAAA-MM-DD","materia":"","titulo":"","min":90}]}`, 8000);
    const ini = okData(r.inicio) && r.inicio >= h ? r.inicio : h;
    const itens = (Array.isArray(r.itens) ? r.itens : []).filter(x => okData(x.dia) && x.dia >= ini && x.titulo)
      .map(x => ({ dia: x.dia, materia: MATERIAS[x.materia] ? x.materia : 'Outra', titulo: String(x.titulo).slice(0, 140), min: Math.max(15, Math.min(240, Math.round(+x.min || 60))) }))
      .sort((a, b) => a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0);
    if (!itens.length) throw new Error('não veio nenhum item; conte o período e os assuntos com mais detalhe');
    const fim = okData(r.fim) && r.fim >= itens[itens.length - 1].dia ? r.fim : itens[itens.length - 1].dia;
    ui.plPrev = { texto: anterior ? anterior.texto + ' · ' + ajuste : texto, ini, fim, itens, resposta: String(r.resposta || '').trim() };
    ui.plAjuste = '';
  } catch (e) { ui.iaMsg = `Não consegui planejar agora (${e.message}).`; }
  ui.carregando = ''; render();
}

function aplicarPeriodo() {
  const p = ui.plPrev; if (!p) return;
  const { chat: _c, ...resto } = S; const antes = JSON.stringify(resto);
  // o que já estava planejado nesses mesmos dias e ainda não foi feito dá lugar ao plano novo
  const sobre = S.periodos.filter(x => x.ini <= p.fim && p.ini <= x.fim).map(x => x.id);
  S.assuntos = S.assuntos.filter(a => !(sobre.includes(a.periodo) && !a.feito && a.dia >= p.ini && a.dia <= p.fim));
  S.periodos = S.periodos.filter(x => !sobre.includes(x.id) || S.assuntos.some(a => a.periodo === x.id));
  const id = uid();
  for (const it of p.itens) S.assuntos.push({ id: uid(), mes: mesDe(it.dia), materia: it.materia, titulo: it.titulo, semana: segunda(it.dia), dia: it.dia, min: it.min, ord: 0.5, feito: false, periodo: id });
  S.periodos.push({ id, ini: p.ini, fim: p.fim, so: true, texto: p.texto.slice(0, 300) });
  ui.plPrev = null; ui.plTexto = '';
  if (p.ini <= hoje() && hoje() <= p.fim && S.dias[hoje()]?.cap) { montarHoje(); if (typeof sugerirHorarios === 'function') sugerirHorarios(S.dias[hoje()]); }
  ui.desfazer = antes; ui.iaMsg = `Plano aplicado: ${p.itens.length} blocos de ${diaCurto(p.ini)} a ${diaCurto(p.fim)}. Nesses dias, o seu "Hoje" segue este plano.`;
  salvar(); render();
}

/** Lista por dia (prévia ou período já aplicado). */
function diasHtml(itens, aplicado) {
  const por = {}; for (const x of itens) (por[x.dia] ||= []).push(x);
  return `<div class="pl-dias">${Object.entries(por).sort().map(([d, l]) => `<div class="pl-dia ${d === hoje() ? 'hoje' : ''}"><div class="entre"><strong>${diaCurtoSemana(d)}${d === hoje() ? ' · hoje' : ''}</strong><span class="fraco">${fmtMin(soma(l, x => x.min || minDe(x)))}</span></div>
    ${l.map(x => `<div class="pl-item ${x.feito ? 'feito' : ''}" style="${cor(x.materia)}"><i class="ponto"></i><span>${x.feito ? '✓ ' : ''}${esc(x.titulo)}</span><small class="fraco">${fmtMin(x.min || minDe(x))}</small>${aplicado && !x.feito ? `<button class="link" data-acao="plTirar" data-id="${x.id}" aria-label="Tirar">tirar</button>` : ''}</div>`).join('')}</div>`).join('')}</div>`;
}

function vPlanejar() {
  const p = ui.plPrev, h = hoje();
  const periodos = S.periodos.filter(x => x.fim >= somaDias(h, -14)).sort((a, b) => a.ini < b.ini ? -1 : 1);
  return `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">organizar os próximos dias</span><h1>Planejamento</h1></div></header>${avisoIa()}
    ${p ? `<section class="cartao pl-prev"><div class="entre"><h2>Prévia do plano</h2><span class="fraco">${diaCurto(p.ini)} a ${diaCurto(p.fim)} · ${p.itens.length} blocos · ${fmtMin(soma(p.itens, x => x.min))}</span></div>
        ${p.resposta ? `<p style="margin:0">${esc(p.resposta)}</p>` : ''}${diasHtml(p.itens, false)}
        <label class="campo">Quer mudar algo?<textarea data-ui="plAjuste" rows="2" placeholder="Ex.: sábado só de manhã; mais matemática; tira inglês">${esc(ui.plAjuste)}</textarea></label>
        <div class="linha"><button class="botao grande" data-acao="plAplicar">Usar este plano</button><button class="botao claro" data-acao="plAjustar">Pedir ajuste</button><button class="link" data-acao="plDescartar">Descartar</button></div></section>` : ''}
    <section class="cartao"><h2>Planejar um período</h2>
      <p class="fraco" style="margin:0">Escreva do seu jeito: até quando, o que quer estudar e quanto tempo tem. A IA distribui pelos dias, você confere e aplica.</p>
      <textarea data-ui="plTexto" rows="4" placeholder="Ex.: De hoje até 7/11 quero revisar para o ENEM: ecologia, genética, funções, porcentagem, estequiometria e redação. Estudo umas 4h por dia, domingo só de manhã.">${esc(ui.plTexto)}</textarea>
      <div class="linha"><button class="botao grande" data-acao="plPlanejar">Organizar com a IA</button></div></section>
    <section class="cartao"><h2>Mudar o cronograma</h2>
      <p class="fraco" style="margin:0">Para mexer no que já está planejado: viagem, faltas, adiantar ou atrasar assuntos, trocar a ordem.</p>
      <textarea data-ui="plMudar" rows="3" placeholder="Ex.: semana que vem vou viajar de quinta a domingo; quero adiantar genética; não consegui estudar ontem.">${esc(ui.plMudar)}</textarea>
      <div class="linha"><button class="botao" data-acao="plMudar">Pedir à IA</button></div></section>
    ${periodos.length ? `<section class="cartao"><h2>Períodos planejados</h2>${periodos.map(x => { const l = S.assuntos.filter(a => a.periodo === x.id), f = l.filter(a => a.feito).length;
      return detalhe('per-' + x.id, `${diaCurto(x.ini)} a ${diaCurto(x.fim)} · ${f} de ${l.length} feitos`, `${x.texto ? `<p class="fraco" style="margin:0">"${esc(x.texto)}"</p>` : ''}${diasHtml(l, true)}
        <div class="linha"><button class="link" data-acao="plApagar" data-id="${x.id}">Apagar este período</button></div>`); }).join('')}</section>` : ''}`;
}

Object.assign(VIEWS, { planejar: vPlanejar });
Object.assign(ACOES, {
  plPlanejar: () => { const t = ($('[data-ui="plTexto"]')?.value ?? ui.plTexto).trim(); ui.plTexto = t; if (!t) { ui.iaMsg = 'Escreva o que quer estudar e até quando.'; render(); return; } ui.plPrev = null; planejarPeriodo(t); },
  plAjustar: () => { const t = ($('[data-ui="plAjuste"]')?.value ?? ui.plAjuste).trim(); if (!t) { ui.iaMsg = 'Escreva o que quer mudar na prévia.'; render(); return; } planejarPeriodo(ui.plPrev.texto, t); },
  plAplicar: () => aplicarPeriodo(),
  plDescartar: () => { ui.plPrev = null; render(); },
  plMudar: () => { const t = ($('[data-ui="plMudar"]')?.value ?? ui.plMudar).trim(); if (!t) return; ui.plMudar = ''; pedirIa(t, 'Mudando o cronograma…', t); },
  plTirar: el => { S.assuntos = S.assuntos.filter(a => a.id !== el.dataset.id); salvar(); render(); },
  plApagar: el => {
    const { chat: _c, ...resto } = S; ui.desfazer = JSON.stringify(resto);
    S.assuntos = S.assuntos.filter(a => a.periodo !== el.dataset.id || a.feito); S.periodos = S.periodos.filter(x => x.id !== el.dataset.id);
    ui.iaMsg = 'Período apagado (o que já tinha feito continua marcado).'; salvar(); render();
  },
});
