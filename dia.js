'use strict';
/* Meu dia: ela conta como vai ser o dia (ou só diz as horas) e o app monta a agenda inteira a partir da rotina base dela,
   do que ela contou hoje e do que aconteceu ontem. A IA entende o texto (horários, almoço, energia); o app calcula o tempo e encaixa os assuntos. */

ICONES.meudia = '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M9.5 15.5l2 2 3.5-4"/>';
const TIPOS_DIA = { estudo: 'Estudo', refeicao: 'Refeição', exercicio: 'Exercício', compromisso: 'Compromisso', trabalho: 'Aula / trabalho', pausa: 'Pausa', lazer: 'Lazer', outro: 'Outro' };
ui.diaTexto = ''; ui.diaHoras = ''; ui.diaAjuste = '';

const hm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
const hmStr = n => `${pad(Math.floor(n / 60) % 24)}:${pad(n % 60)}`;

/** Distribui os assuntos pelas janelas de estudo, só como sugestão de horário (ela pode fazer na ordem que quiser). */
function sugerirHorarios(d) {
  const jan = (d.agenda || []).filter(x => x.tipo === 'estudo' && hm(x.inicio) != null).map(x => ({ ini: hm(x.inicio), fim: hm(x.fim) })).sort((a, b) => a.ini - b.ini);
  d.blocos.forEach(b => { b.sug = null; });
  if (!jan.length) return;
  let w = 0, t = jan[0].ini;
  for (const b of d.blocos) {
    if (achar(b.assuntoId)?.feito || b.passos.every(p => p.ok)) continue;
    while (w < jan.length && jan[w].fim - t < 15) { w++; t = jan[w]?.ini; }
    if (w >= jan.length) break;
    b.sug = hmStr(t);
    let falta = Math.round((b.min || 30) / 0.8);
    while (falta > 0 && w < jan.length) { const livre = jan[w].fim - t; if (falta <= livre) { t += falta; falta = 0; } else { falta -= livre; w++; t = jan[w]?.ini; } }
  }
}

function tratarAgenda(lista, agoraMin) {
  const ag = [];
  for (const x of Array.isArray(lista) ? lista : []) {
    let i = hm(x.inicio), f = hm(x.fim); if (i == null || f == null) continue;
    if (f <= i) f = Math.min(24 * 60 - 1, f + 24 * 60 > 24 * 60 ? 24 * 60 - 1 : f + 24 * 60);
    const tipo = TIPOS_DIA[x.tipo] ? x.tipo : 'outro';
    if (f <= agoraMin) continue; // já passou
    if (tipo === 'estudo' && i < agoraMin) i = agoraMin; // não planeja estudo no passado
    if (f - i < (tipo === 'estudo' ? 25 : 1)) continue;
    ag.push({ inicio: hmStr(i), fim: hmStr(f), titulo: String(x.titulo || TIPOS_DIA[tipo]).slice(0, 80), tipo });
  }
  return ag.sort((a, b) => hm(a.inicio) - hm(b.inicio));
}

async function planejarDia(texto, horas) {
  const d = diaHoje(), agora = new Date(), agoraMin = agora.getHours() * 60 + agora.getMinutes();
  d.suposicoes = []; ui.carregando = 'Montando o seu dia…'; ui.iaMsg = ''; render();
  const { chat: _c, ...resto } = S; const antes = JSON.stringify(resto);
  try {
    let estudoMin = 0, fator = 1, resposta = '', ag = [], so = [];
    const basal = (S.perfil.horarios || '').trim();
    if (!texto.trim() && horas > 0) {
      estudoMin = Math.round(horas * 60); ag = [{ inicio: '', fim: '', titulo: `${horas}h livres para estudar`, tipo: 'estudo', min: estudoMin }];
      resposta = `Dia montado com ${horas}h livres.`;
    } else {
      if (!texto.trim() && !basal) throw new Error('escreva como será o seu dia, ou preencha a rotina base abaixo, ou informe as horas livres');
      const ontem = S.dias[somaDias(hoje(), -1)], atras = S.assuntos.filter(a => estadoDe(a) === 'atrasado').length;
      const r = await chamarIa(`Planeje o dia de hoje (${hoje()}, agora são ${hmStr(agoraMin)}).
Rotina base dela: ${basal || '(não informada)'}.
${ontem ? `Ontem: contexto "${ontem.contexto || 'sem registro'}"; estudou ${fmtMin(S.estudo[somaDias(hoje(), -1)] || 0)}.` : 'Ontem: sem registro.'} Hoje há ${atras} assuntos atrasados.${window.pendHojeTexto?.() ? ` Pendências e compromissos de hoje já anotados por ela (inclua na agenda): ${window.pendHojeTexto()}.` : ''}
Hoje ela disse: "${texto.trim() || '(nada: use a rotina base)'}"${horas > 0 ? `. Ela também informou ${horas}h livres para estudar` : ''}.
Monte a agenda do restante do dia (a partir de agora, até a hora de dormir) com TODOS os blocos: aula ou trabalho, refeições, exercício, compromissos, pausas, lazer e as janelas de estudo (tipo "estudo") nos espaços livres. COMO COMBINAR: parta da rotina base e aplique por cima o que ela contou hoje. Tudo que ela NÃO mencionou hoje vem da rotina base. O que ela mencionou hoje SUBSTITUI o item equivalente da rotina base (ex.: se hoje ela janta das 17h às 19h, esqueça o jantar padrão da rotina; se hoje tem aula em outro horário, ignore o horário padrão). Se nem hoje nem a rotina base dizem algo essencial (hora de dormir, almoço, jantar, café), assuma um horário típico e liste em "suposicoes". O que ela contou sobre ontem ou o cansaço entra no "fator". Ela é uma estudante de vestibular que quer render: use para estudo todo espaço livre razoável do dia (manhã, tarde e noite), deixando refeições, descanso e lazer curtos e realistas. Janelas de estudo de pelo menos 40 min, e quebre janelas longas com pausas curtas.
Responda SÓ com JSON: {"resposta":"2 frases curtas e gentis resumindo o dia","fator":1,"motivo":"curto","agenda":[{"inicio":"HH:MM","fim":"HH:MM","titulo":"...","tipo":"estudo|refeicao|exercicio|compromisso|trabalho|pausa|lazer|outro"}],"suposicoes":["o que você assumiu por falta de informação, curto"],"atualizar_rotina":"","materias_hoje":[]}
"materias_hoje": só se ela pediu matérias específicas para estudar hoje (ex.: "hoje quero só matemática", "vou focar em química e física"), a lista com os nomes exatos entre ${[...Object.keys(MIN_Q), 'Redação'].join(', ')}; senão [].
"fator" vai de 0.5 a 1 (1 = energia normal; menos se ela disse que está cansada, dormiu mal, doente etc.). "atualizar_rotina" só se ela disse que algo mudou de vez (ex.: "agora acordo às 6h"): devolva a rotina base inteira já atualizada, senão deixe vazio.`, 3000);
      ag = tratarAgenda(r.agenda, agoraMin);
      d.suposicoes = (Array.isArray(r.suposicoes) ? r.suposicoes : []).map(x => String(x).slice(0, 120)).slice(0, 4);
      fator = Math.min(1, Math.max(0.5, +r.fator || 1)); resposta = String(r.resposta || '').trim();
      so = (Array.isArray(r.materias_hoje) ? r.materias_hoje : []).map(String);
      if (r.motivo && fator < 1) resposta += ` (${String(r.motivo).trim()})`;
      if (r.atualizar_rotina && String(r.atualizar_rotina).trim().length > 10) { S.perfil.horarios = String(r.atualizar_rotina).trim().slice(0, 1500); resposta += ' Atualizei a sua rotina base.'; }
      estudoMin = soma(ag.filter(x => x.tipo === 'estudo'), x => hm(x.fim) - hm(x.inicio));
      if (!estudoMin && horas > 0) { estudoMin = Math.round(horas * 60); ag.push({ inicio: '', fim: '', titulo: `${horas}h livres para estudar`, tipo: 'estudo', min: estudoMin }); }
    }
    if (!estudoMin) throw new Error('não achei tempo livre para estudar. Conte mais sobre o seu dia ou informe as horas');
    // o que já passou na agenda anterior continua aparecendo (apagado), para ela ver o dia inteiro
    const passados = (d.agenda || []).filter(x => hm(x.fim) != null && hm(x.fim) <= agoraMin && !ag.some(y => y.inicio === x.inicio && y.titulo === x.titulo));
    d.agenda = [...passados, ...ag]; d.fator = fator; d.horas = Math.round(estudoMin / 6) / 10;
    d.contexto = [texto.trim(), horas > 0 ? `${horas}h livres` : ''].filter(Boolean).join(' · ') || 'rotina base';
    montarHoje(Math.round(estudoMin * 0.8 * fator), so); sugerirHorarios(d);
    ui.desfazer = antes; ui.iaMsg = resposta || 'Dia montado.';
    ui.diaTexto = ''; ui.diaHoras = '';
    salvar();
  } catch (e) { ui.iaMsg = `Não consegui montar o dia: ${e.message}.`; ui.desfazer = null; }
  ui.carregando = ''; render();
}

const agoraMinutos = () => { const a = new Date(); return a.getHours() * 60 + a.getMinutes(); };

/** Depois de mexer na agenda: recalcula o tempo de estudo, encaixa os assuntos de novo (o que já começou fica) e sugere horários. */
function reajustarDia(d) {
  d.agenda.sort((a, b) => (hm(a.inicio) ?? 9999) - (hm(b.inicio) ?? 9999));
  const estudo = soma(d.agenda.filter(x => x.tipo === 'estudo'), x => x.min || Math.max(0, (hm(x.fim) ?? 0) - (hm(x.inicio) ?? 0)));
  d.horas = Math.round(estudo / 6) / 10;
  if (estudo) montarHoje(Math.round(estudo * 0.8 * (d.fator || 1)));
  sugerirHorarios(d); salvar(); render();
}

/** O dia inteiro numa linha do tempo flexível: dá para mudar horário, tirar, pôr, e empurrar o resto quando atrasar. */
function agendaHtml(d) {
  const agora = agoraMinutos(), h = hoje(), cap = d.cap || 0, jan = d.agenda.filter(x => x.tipo === 'estudo');
  const dosBlocos = x => d.blocos.filter(b => b.sug && hm(b.sug) >= hm(x.inicio) && hm(b.sug) < hm(x.fim));
  const form = (x, i) => `<div class="ag-form"><div class="linha">
      <label class="campo" style="flex:0 1 120px">Começa<input type="time" id="ag-i" value="${esc(x.inicio || '')}"></label>
      <label class="campo" style="flex:0 1 120px">Termina<input type="time" id="ag-f" value="${esc(x.fim || '')}"></label>
      <label class="campo" style="flex:1 1 150px">Tipo<select id="ag-tp">${Object.entries(TIPOS_DIA).map(([v, t]) => `<option value="${v}" ${x.tipo === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <label class="campo">O que é<input type="text" id="ag-t" value="${esc(x.titulo || '')}" placeholder="Ex.: academia, almoço, dentista"></label>
    <div class="linha"><button class="botao" data-acao="agSalvar" data-i="${i}">Salvar</button>${i >= 0 ? `<button class="botao contorno" data-acao="agRemover" data-i="${i}">Tirar do dia</button>` : ''}<button class="link" data-acao="agCancelar">Cancelar</button></div></div>`;
  let marcouAgora = false;
  const itens = d.agenda.map((x, i) => {
    const ini = hm(x.inicio), fim = hm(x.fim), passou = fim != null && fim <= agora, eAgora = ini != null && ini <= agora && agora < fim;
    let marca = '';
    if (!marcouAgora && ini != null && (eAgora || ini > agora)) { marcouAgora = true; if (!eAgora) marca = `<div class="ag-agora"><span>agora · ${hmStr(agora)}</span></div>`; }
    if (ui.agEdit === i) return marca + form(x, i);
    const pct = eAgora ? Math.round((agora - ini) / Math.max(1, fim - ini) * 100) : 0;
    return `${marca}<div class="ag ${x.tipo} ${passou ? 'passou' : ''} ${eAgora ? 'agora' : ''}"><span class="ag-h">${x.inicio ? `${x.inicio}<small>${x.fim}</small>` : '·'}</span>
      <div class="ag-c"><div class="entre"><strong>${esc(x.titulo)}</strong><span class="linha" style="gap:6px">${eAgora ? '<span class="selo">agora</span>' : ''}<button class="link ag-ed" data-acao="agEditar" data-i="${i}" aria-label="Mudar">mudar</button></span></div>
        <span class="fraco">${TIPOS_DIA[x.tipo]}${ini != null && fim != null ? ` · ${fmtMin(fim - ini)}` : ''}</span>
        ${eAgora ? `<div class="barra fina"><i style="width:${pct}%"></i></div>` : ''}
        ${x.tipo === 'estudo' ? `<div class="ag-ass">${(x.inicio ? dosBlocos(x) : d.blocos).map(b => `<span class="tag" style="${cor(b.materia)}">${b.sug ? b.sug + ' · ' : ''}${esc(b.titulo.length > 34 ? b.titulo.slice(0, 33) + '…' : b.titulo)}</span>`).join('')}</div>` : ''}</div></div>`;
  }).join('');
  return `<section class="cartao"><div class="entre"><h2>Como está o seu dia</h2><span class="fraco">${dataLonga(h)}</span></div>
    <div class="resumo-dia"><div><strong>${fmtMin(soma(jan, x => x.min || hm(x.fim) - hm(x.inicio)))}</strong><span>de estudo no dia</span></div>
      <div><strong>${fmtMin(cap)}</strong><span>de assuntos (20% de folga${d.fator < 1 ? `, energia ×${d.fator}` : ''})</span></div>
      <div><strong>${d.blocos.length}</strong><span>${d.blocos.length === 1 ? 'assunto' : 'assuntos'}</span></div></div>
    <div class="agenda">${itens}${!marcouAgora && d.agenda.some(x => hm(x.inicio) != null) ? `<div class="ag-agora"><span>agora · ${hmStr(agora)}</span></div>` : ''}</div>
    ${ui.agEdit === -1 ? form({ inicio: hmStr(Math.ceil(agora / 15) * 15 % 1440), fim: hmStr((Math.ceil(agora / 15) * 15 + 60) % 1440), tipo: 'compromisso', titulo: '' }, -1) : ''}
    <div class="linha"><button class="botao claro" data-acao="agNovo">+ Pôr algo no dia</button>
      <span class="fraco" style="font-size:14px">Atrasou?</span><button class="chip" data-acao="agAtrasar" data-v="15">+15 min</button><button class="chip" data-acao="agAtrasar" data-v="30">+30 min</button><button class="chip" data-acao="agAtrasar" data-v="60">+1 h</button></div>
    ${d.suposicoes?.length ? `<p class="fraco" style="margin:0;font-size:14px"><b>Assumi:</b> ${d.suposicoes.map(esc).join(' · ')}. Se estiver errado, toque em "mudar" ou conte abaixo.</p>` : ''}
    <p class="fraco" style="margin:0;font-size:14px">Nada aqui é rígido: mude os horários quando quiser. Os assuntos se reencaixam sozinhos no tempo de estudo que sobrar.</p></section>`;
}

function vMeuDia() {
  const h = hoje(), d = S.dias[h];
  const temAg = d?.agenda?.length;
  const chavesOk = temChaveIa(), basal = S.perfil.horarios?.trim();
  const planejar = `<section class="cartao" style="gap:14px"><h2>${temAg ? 'Mudou alguma coisa?' : 'Como vai ser o seu dia?'}</h2>
    <p class="fraco" style="margin:0">${temAg ? 'Conte o que mudou (ex.: "a aula acabou mais cedo", "vou jantar fora às 20h") e eu refaço o resto do dia sem perder o que já foi feito.'
      : `Conte do seu jeito: a que horas acorda, aulas, almoço, academia, compromissos, como você está se sentindo. Eu monto o dia inteiro e encaixo os assuntos.${basal ? ' Se não escrever nada, uso a sua rotina base.' : ''}`}</p>
    <textarea data-ui="diaTexto" placeholder="${temAg ? 'Ex.: a aula acabou 11h; vou jantar fora às 20h.' : 'Ex.: Hoje acordei 7h, tenho aula até 12h30, almoço com a minha mãe, academia às 18h. Dormi mal, estou meio cansada.'}">${esc(ui.diaTexto)}</textarea>
    ${temAg ? '' : `<div class="linha"><label class="fraco" for="dia-horas">ou só diga as horas livres:</label>
      <input type="number" id="dia-horas" min="0.5" max="16" step="0.5" placeholder="ex.: 6" value="${esc(ui.diaHoras)}" style="width:100px"></div>`}
    <div class="linha"><button class="botao grande" data-acao="planejarDia">${temAg ? 'Refazer o resto do dia' : 'Montar meu dia'}</button>
      ${d?.blocos?.length ? '<button class="botao contorno" data-acao="ir" data-v="hoje">Ver os assuntos de hoje</button>' : ''}</div>
    ${chavesOk ? '' : '<p class="fraco" style="margin:0;color:var(--tinta)">Sem chave de IA, só consigo usar as horas livres. Cole as chaves em Ajustes para eu entender o texto.</p>'}</section>`;
  const rotina = `<details class="cartao" ${basal ? '' : 'open'}><summary><strong>Minha rotina base</strong> <span class="fraco">· o que se repete na maioria dos dias</span></summary>
    <label class="campo" style="margin-top:12px"><small>Horários fixos, aulas, refeições, exercício, sono. O que você contar no dia ajusta isso, e se algo mudar de vez eu atualizo aqui.</small>
    <textarea data-campo="horarios" placeholder="Ex.: acordo 7h; aula de seg a sex das 8h às 12h30; almoço 13h; academia seg, qua e sex às 18h; janto 20h; durmo 23h30; sábado à tarde livre">${esc(S.perfil.horarios)}</textarea></label></details>`;
  return `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">${dataLonga(h)}</span><h1>Meu dia</h1></div></header>${avisoIa()}${temAg ? agendaHtml(d) : ''}${planejar}${rotina}`;
}

Object.assign(VIEWS, { meudia: vMeuDia });
Object.assign(ACOES, {
  agEditar: el => { ui.agEdit = +el.dataset.i; render(); },
  agCancelar: () => { ui.agEdit = null; render(); },
  agNovo: () => { ui.agEdit = -1; render(); },
  agSalvar: el => {
    const d = diaHoje(), i = +el.dataset.i, ini = hm($('#ag-i')?.value), fim = hm($('#ag-f')?.value), tipo = $('#ag-tp')?.value || 'outro';
    if (ini == null || fim == null || fim <= ini) { ui.iaMsg = 'Confira os horários: o fim tem que ser depois do começo.'; render(); return; }
    const x = { inicio: hmStr(ini), fim: hmStr(fim), tipo, titulo: ($('#ag-t')?.value || '').trim().slice(0, 80) || TIPOS_DIA[tipo] };
    d.agenda ||= [];
    if (i >= 0) d.agenda[i] = x; else d.agenda.push(x);
    ui.agEdit = null; reajustarDia(d);
  },
  agRemover: el => { const d = diaHoje(); d.agenda.splice(+el.dataset.i, 1); ui.agEdit = null; reajustarDia(d); },
  agAtrasar: el => {
    // empurra o que ainda não acabou; o que passaria da meia-noite fica no limite
    const d = diaHoje(), v = +el.dataset.v, agora = agoraMinutos();
    for (const x of d.agenda) { const i = hm(x.inicio), f = hm(x.fim); if (i == null || f <= agora) continue; if (i > agora) x.inicio = hmStr(Math.min(1439, i + v)); x.fim = hmStr(Math.min(1439, f + v)); }
    d.agenda = d.agenda.filter(x => hm(x.inicio) == null || hm(x.fim) > hm(x.inicio));
    ui.iaMsg = `Empurrei o resto do dia em ${v >= 60 ? v / 60 + ' h' : v + ' min'}.`; reajustarDia(d);
  },  planejarDia: () => {
    const ta = document.querySelector('[data-campo="horarios"]'); // a rotina base vale mesmo que o campo ainda não tenha "saído do foco"
    if (ta && ta.value.trim() !== (S.perfil.horarios || '')) { S.perfil.horarios = ta.value.trim(); salvar(); }
    const horas = parseFloat($('#dia-horas')?.value) || 0;
    ui.diaHoras = horas ? String(horas) : '';
    const t = ui.diaTexto.trim();
    const d = S.dias[hoje()];
    // replanejar: junta o que ela já tinha contado com a novidade
    const texto = d?.agenda?.length && t ? `${d.contexto && d.contexto !== 'rotina base' ? d.contexto + '. ' : ''}ATUALIZAÇÃO às ${agoraHm()}: ${t}` : t;
    planejarDia(texto, horas);
  },
});
render();
