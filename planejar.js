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

// ---------- proteções: o plano principal nunca se perde por engano ----------
/** Cópia do plano (assuntos, períodos, meses, fases, provas) no aparelho: uma por dia e uma antes de cada mudança grande; guarda as 20 últimas. */
async function copiarPlano(rotulo) {
  const nome = rotulo || hoje();
  await DB.set('d:bkp:' + nome, JSON.stringify({ assuntos: S.assuntos, periodos: S.periodos, meses: S.meses, fases: S.fases, provas: S.provas || [] }));
  S.bkps = [...(S.bkps || []).filter(x => x !== nome), nome].slice(-20);
  for (const velho of (S.bkpsTodos || []).filter(x => !S.bkps.includes(x))) DB.del('d:bkp:' + velho);
  S.bkpsTodos = [...S.bkps]; salvar();
}
if (!(S.bkps || []).includes(hoje())) copiarPlano();
const impactoPeriodo = p => S.assuntos.filter(a => !a.feito && !a.periodo && semDe(a) >= segunda(p.ini) && semDe(a) <= p.fim).length;
const diasPeriodo = p => Math.round((deIso(p.fim) - deIso(p.ini)) / 864e5) + 1;

function aplicarPeriodo() {
  const p = ui.plPrev; if (!p) return;
  const pausar = ui.plModo === 'pausar';
  if (pausar && diasPeriodo(p) > 21 && !$('#pl-conf')?.checked) { ui.iaMsg = `Esse plano pausa o cronograma por ${diasPeriodo(p)} dias. Marque "Entendi" para aplicar, ou escolha "Encaixar".`; render(); return; }
  copiarPlano(`${hoje()} ${agoraHm()} · antes do plano`);
  const { chat: _c, ...resto } = S; const antes = JSON.stringify(resto);
  // o que já estava planejado nesses mesmos dias e ainda não foi feito dá lugar ao plano novo
  const sobre = S.periodos.filter(x => x.ini <= p.fim && p.ini <= x.fim).map(x => x.id);
  S.assuntos = S.assuntos.filter(a => !(sobre.includes(a.periodo) && !a.feito && a.dia >= p.ini && a.dia <= p.fim));
  S.periodos = S.periodos.filter(x => !sobre.includes(x.id) || S.assuntos.some(a => a.periodo === x.id));
  const id = uid();
  for (const it of p.itens) S.assuntos.push({ id: uid(), mes: mesDe(it.dia), materia: it.materia, titulo: it.titulo, semana: segunda(it.dia), dia: it.dia, min: it.min, ord: 0.5, feito: false, periodo: id });
  S.periodos.push({ id, ini: p.ini, fim: p.fim, so: pausar, texto: p.texto.slice(0, 300) });
  ui.plPrev = null; ui.plTexto = ''; ui.plModo = 'encaixar';
  if (p.ini <= hoje() && hoje() <= p.fim && S.dias[hoje()]?.cap) { montarHoje(); if (typeof sugerirHorarios === 'function') sugerirHorarios(S.dias[hoje()]); }
  ui.desfazer = antes; ui.iaMsg = `Plano aplicado: ${p.itens.length} blocos de ${diaCurto(p.ini)} a ${diaCurto(p.fim)}. ${pausar ? 'Nesses dias, o seu "Hoje" segue só este plano.' : 'Eles entram primeiro em cada dia, e o tempo que sobrar segue o cronograma.'} Se precisar, dá para voltar o plano em Ajustes.`;
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
        <div class="pl-modo"><span class="rotulo">e o cronograma principal nesses dias?</span>
          <label class="marca-q"><input type="radio" name="plmodo" data-pl-modo="encaixar" ${ui.plModo !== 'pausar' ? 'checked' : ''}> <span><b>Encaixar junto</b> (recomendado): estes blocos entram primeiro em cada dia, e o tempo que sobrar continua o cronograma.</span></label>
          <label class="marca-q"><input type="radio" name="plmodo" data-pl-modo="pausar" ${ui.plModo === 'pausar' ? 'checked' : ''}> <span><b>Pausar o cronograma</b> nesses ${diasPeriodo(p)} dias: só este plano. ${impactoPeriodo(p)} ${impactoPeriodo(p) === 1 ? 'assunto previsto para essas semanas fica' : 'assuntos previstos para essas semanas ficam'} para depois.</span></label>
          ${ui.plModo === 'pausar' && diasPeriodo(p) > 21 ? `<label class="marca-q aviso-forte"><input type="checkbox" id="pl-conf"> <span>Entendi: o cronograma fica parado por ${diasPeriodo(p)} dias.</span></label>` : ''}</div>
        <label class="campo">Quer mudar algo?<textarea data-ui="plAjuste" rows="2" placeholder="Ex.: sábado só de manhã; mais matemática; tira inglês">${esc(ui.plAjuste)}</textarea></label>
        <div class="linha"><button class="botao grande" data-acao="plAplicar">Usar este plano</button><button class="botao claro" data-acao="plAjustar">Pedir ajuste</button><button class="link" data-acao="plDescartar">Descartar</button></div></section>` : ''}
    <section class="cartao"><h2>Planejar um período</h2>
      <p class="fraco" style="margin:0">Escreva do seu jeito: até quando, o que quer estudar e quanto tempo tem. A IA distribui pelos dias, você confere e aplica.</p>
      <textarea data-ui="plTexto" rows="4" placeholder="Ex.: De hoje até 7/11 quero revisar para o ENEM: ecologia, genética, funções, porcentagem, estequiometria e redação. Estudo umas 4h por dia, domingo só de manhã.">${esc(ui.plTexto)}</textarea>
      <div class="linha"><button class="botao grande" data-acao="plPlanejar">Organizar com a IA</button></div></section>
    <section class="cartao"><h2>Mudar o cronograma</h2>
      <p class="fraco" style="margin:0">Para mexer no que já está planejado: viagem, faltas, adiantar ou atrasar assuntos, trocar a ordem.</p>
      ${ui.plMud ? `<div class="pl-mud"><span class="rotulo">a IA sugere estas mudanças</span>${ui.plMud.resposta ? `<p style="margin:0">${esc(ui.plMud.resposta)}</p>` : ''}
        ${ui.plMud.linhas.length ? `<ul class="pl-mud-lista">${ui.plMud.linhas.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="fraco" style="margin:0">Nenhuma mudança no plano.</p>'}
        <div class="linha">${ui.plMud.linhas.length ? '<button class="botao" data-acao="plMudAplicar">Aplicar</button>' : ''}<button class="link" data-acao="plMudDescartar">Descartar</button></div></div>`
      : `<textarea data-ui="plMudar" rows="3" placeholder="Ex.: semana que vem vou viajar de quinta a domingo; quero adiantar genética; não consegui estudar ontem.">${esc(ui.plMudar)}</textarea>
      <div class="linha"><button class="botao" data-acao="plMudar">Pedir à IA</button></div>`}</section>
    ${periodos.length ? `<section class="cartao"><h2>Períodos planejados</h2>${periodos.map(x => { const l = S.assuntos.filter(a => a.periodo === x.id), f = l.filter(a => a.feito).length;
      return detalhe('per-' + x.id, `${diaCurto(x.ini)} a ${diaCurto(x.fim)} · ${f} de ${l.length} feitos`, `${x.texto ? `<p class="fraco" style="margin:0">"${esc(x.texto)}"</p>` : ''}${diasHtml(l, true)}
        <div class="linha"><button class="link" data-acao="plApagar" data-id="${x.id}">Apagar este período</button></div>`); }).join('')}</section>` : ''}`;
}

/** O que cada ação da IA faria, em português, para ela conferir antes de aplicar. */
function descreverAcao(a) {
  const x = a?.id && achar(a.id), nome = x ? `"${x.titulo}"` : '';
  switch (a?.tipo) {
    case 'marcar_semana': return x && okData(a.dia) ? `${nome} → semana de ${semanaCurta(segunda(a.dia))}` : '';
    case 'marcar_dia': return x && okData(a.dia) ? `${nome} → dia ${diaCurto(a.dia)}` : '';
    case 'mover_mes': return x && okMes(a.mes) ? `${nome} → ${nomeMes(a.mes)}` : '';
    case 'novo_assunto': return a.titulo ? `+ novo: ${a.materia || ''} · ${a.titulo}${okData(a.dia) ? ` (${diaCurto(a.dia)})` : okMes(a.mes) ? ` (${nomeMes(a.mes)})` : ''}` : '';
    case 'feito': return x ? `${nome} marcado como ${a.feito === false ? 'não feito' : 'feito'}` : '';
    case 'remover_assunto': return x ? `✕ apagar ${nome}` : '';
    case 'blocos_hoje': return 'trocar os assuntos de hoje';
    case 'foco_mes': return okMes(a.mes) ? `foco de ${nomeMes(a.mes)}: ${a.foco}` : '';
    case 'fases': return 'refazer as fases do ano';
    case 'prova': return a.nome ? `prova ${a.nome}: ${okData(a.data) ? diaCurto(a.data) : ''}` : '';
    case 'lembrar': return `lembrar: ${a.texto}`;
  }
  return '';
}

// Ajustes: voltar o plano para uma cópia
{ const v0 = VIEWS.ajustes; VIEWS.ajustes = function () {
  const l = (S.bkps || []).slice().reverse();
  return v0() + `<section class="cartao"><h2>Cópias do plano</h2><p class="fraco" style="margin:0">O app guarda uma cópia do plano por dia e antes de cada mudança grande. Se algo der errado, volte para uma delas.</p>
    ${l.length ? `<div class="coluna" style="gap:6px">${l.map(n => `<div class="entre"><span>${esc(n.replace(/^(\d{4})-(\d\d)-(\d\d)/, '$3/$2/$1'))}</span><button class="link" data-acao="bkpVoltar" data-v="${esc(n)}">Voltar para esta</button></div>`).join('')}</div>` : '<p class="fraco" style="margin:0">Ainda não há cópias.</p>'}</section>`;
}; }

document.addEventListener('change', e => { const v = e.target.dataset?.plModo; if (v) { ui.plModo = v; render(); } });

Object.assign(VIEWS, { planejar: vPlanejar });
Object.assign(ACOES, {
  plPlanejar: () => { const t = ($('[data-ui="plTexto"]')?.value ?? ui.plTexto).trim(); ui.plTexto = t; if (!t) { ui.iaMsg = 'Escreva o que quer estudar e até quando.'; render(); return; } ui.plPrev = null; planejarPeriodo(t); },
  plAjustar: () => { const t = ($('[data-ui="plAjuste"]')?.value ?? ui.plAjuste).trim(); if (!t) { ui.iaMsg = 'Escreva o que quer mudar na prévia.'; render(); return; } planejarPeriodo(ui.plPrev.texto, t); },
  plAplicar: () => aplicarPeriodo(),
  plDescartar: () => { ui.plPrev = null; render(); },
  // mudar o cronograma: primeiro mostra o que a IA quer mudar; só aplica quando ela confirma
  plMudar: async () => {
    const t = ($('[data-ui="plMudar"]')?.value ?? ui.plMudar).trim(); if (!t) return;
    if (!temChaveIa()) { ui.iaMsg = 'Falta a chave da IA (Ajustes).'; render(); return; }
    ui.plMudar = t; ui.carregando = 'A IA está pensando nas mudanças…'; render();
    try {
      const r = await chamarIa(`${ACOES_IA}\n\nSituação atual (JSON):\n${JSON.stringify(contextoIa())}\n\nPedido dela: ${t}`);
      const acoes = Array.isArray(r.acoes) ? r.acoes : [];
      ui.plMud = { texto: t, resposta: String(r.resposta || '').trim(), acoes, linhas: acoes.map(descreverAcao).filter(Boolean) };
    } catch (e) { ui.iaMsg = `Não consegui falar com a IA agora (${e.message}).`; }
    ui.carregando = ''; render();
  },
  plMudAplicar: async () => {
    const m = ui.plMud; if (!m) return;
    await copiarPlano(`${hoje()} ${agoraHm()} · antes de mudar`);
    const { chat: _c, ...resto } = S; const antes = JSON.stringify(resto);
    const n = aplicar(m.acoes); ui.desfazer = n ? antes : null; ui.plMud = null; ui.plMudar = '';
    ui.iaMsg = n ? `Pronto: ${n} ${n === 1 ? 'mudança' : 'mudanças'} no plano. Dá para desfazer aqui ou voltar o plano em Ajustes.` : 'Nada mudou.'; salvar(); render();
  },
  plMudDescartar: () => { ui.plMud = null; render(); },
  bkpVoltar: async el => {
    const nome = el.dataset.v; if (!confirm(`Voltar o plano para a cópia "${nome}"? O que você marcou como feito depois disso volta a ficar pendente.`)) return;
    const raw = await DB.get('d:bkp:' + nome); if (!raw) { ui.iaMsg = 'Essa cópia não está mais no aparelho.'; render(); return; }
    const { chat: _c, ...resto } = S; ui.desfazer = JSON.stringify(resto);
    await copiarPlano(`${hoje()} ${agoraHm()} · antes de voltar`);
    Object.assign(S, JSON.parse(raw)); ui.iaMsg = `Plano voltou para "${nome}".`; salvar(); render();
  },
  plTirar: el => { S.assuntos = S.assuntos.filter(a => a.id !== el.dataset.id); salvar(); render(); },
  plApagar: el => {
    const { chat: _c, ...resto } = S; ui.desfazer = JSON.stringify(resto);
    S.assuntos = S.assuntos.filter(a => a.periodo !== el.dataset.id || a.feito); S.periodos = S.periodos.filter(x => x.id !== el.dataset.id);
    ui.iaMsg = 'Período apagado (o que já tinha feito continua marcado).'; salvar(); render();
  },
});
