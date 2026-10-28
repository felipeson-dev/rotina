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

const amanha = () => somaDias(hoje(), 1);
const diaDe = data => data === hoje() ? diaHoje() : (S.dias[data] ||= { contexto: '', horas: 0, cap: 0, blocos: [] });

/** Monta a agenda de hoje (do agora até dormir) ou de amanhã (o dia inteiro). Os assuntos de amanhã entram no próprio dia,
   de manhã, conforme o que ela terminar hoje (prepararDiaPlanejado). */
async function planejarDia(texto, horas, alvo = hoje()) {
  const ehHoje = alvo === hoje(), d = diaDe(alvo), agora = new Date(), agoraMin = ehHoje ? agora.getHours() * 60 + agora.getMinutes() : 0;
  d.suposicoes = []; ui.carregando = ehHoje ? 'Montando o seu dia…' : 'Montando o seu dia de amanhã…'; ui.iaMsg = ''; render();
  const { chat: _c, ...resto } = S; const antes = JSON.stringify(resto);
  try {
    let estudoMin = 0, fator = 1, resposta = '', ag = [], so = [];
    const basal = (S.perfil.horarios || '').trim();
    if (!texto.trim() && horas > 0) {
      estudoMin = Math.round(horas * 60); ag = [{ inicio: '', fim: '', titulo: `${horas}h livres para estudar`, tipo: 'estudo', min: estudoMin }];
      resposta = `${ehHoje ? 'Dia' : 'Amanhã'} montado com ${horas}h livres.`;
    } else {
      if (!texto.trim() && !basal) throw new Error('escreva como será o dia, ou preencha a rotina base abaixo, ou informe as horas livres');
      const ref = ehHoje ? S.dias[somaDias(hoje(), -1)] : S.dias[hoje()], refNome = ehHoje ? 'Ontem' : 'Hoje';
      const atras = S.assuntos.filter(a => estadoDe(a) === 'atrasado').length;
      const pend = (S.pend || []).filter(p => !p.feito && p.dia === alvo).map(p => `${p.titulo}${p.hora ? ' às ' + p.hora : ''}`).join('; ');
      const r = await chamarIa(`Planeje o dia ${ehHoje ? `de hoje (${alvo}, agora são ${hmStr(agoraMin)})` : `de AMANHÃ (${dataLonga(alvo)}, ${alvo})`}.
Rotina base dela: ${basal || '(não informada)'}.
${ref ? `${refNome}: contexto "${ref.contexto || 'sem registro'}"; estudou ${fmtMin(S.estudo[ehHoje ? somaDias(hoje(), -1) : hoje()] || 0)}.` : `${refNome}: sem registro.`} Há ${atras} assuntos atrasados.${pend ? ` Pendências e compromissos desse dia já anotados por ela (inclua na agenda): ${pend}.` : ''}
Para esse dia ela disse: "${texto.trim() || '(nada: use a rotina base)'}"${horas > 0 ? `. Ela também informou ${horas}h livres para estudar` : ''}.
Monte a agenda ${ehHoje ? 'do restante do dia (a partir de agora, até a hora de dormir)' : 'do dia inteiro (do acordar até a hora de dormir)'} com TODOS os blocos: aula ou trabalho, refeições, exercício, compromissos, pausas, lazer e as janelas de estudo (tipo "estudo") nos espaços livres. COMO COMBINAR: parta da rotina base e aplique por cima o que ela contou. Tudo que ela NÃO mencionou vem da rotina base. O que ela mencionou SUBSTITUI o item equivalente da rotina base (ex.: se ela janta das 17h às 19h, esqueça o jantar padrão; se a aula é em outro horário, ignore o horário padrão). Se nem ela nem a rotina base dizem algo essencial (hora de dormir, almoço, jantar, café), assuma um horário típico e liste em "suposicoes". Cansaço ou sono ruim entram no "fator". Ela é uma estudante de vestibular que quer render: use para estudo todo espaço livre razoável (manhã, tarde e noite), deixando refeições, descanso e lazer curtos e realistas. Janelas de estudo de pelo menos 40 min, e quebre janelas longas com pausas curtas.
Responda SÓ com JSON: {"resposta":"2 frases curtas e gentis resumindo o dia","fator":1,"motivo":"curto","agenda":[{"inicio":"HH:MM","fim":"HH:MM","titulo":"...","tipo":"estudo|refeicao|exercicio|compromisso|trabalho|pausa|lazer|outro"}],"suposicoes":["o que você assumiu por falta de informação, curto"],"atualizar_rotina":"","materias_hoje":[]}
"materias_hoje": só se ela pediu matérias específicas para estudar nesse dia (ex.: "quero só matemática", "vou focar em química e física"), a lista com os nomes exatos entre ${[...Object.keys(MIN_Q), 'Redação'].join(', ')}; senão [].
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
    if (!estudoMin) throw new Error('não achei tempo livre para estudar. Conte mais sobre o dia ou informe as horas');
    // o que já passou na agenda anterior continua aparecendo (apagado), para ela ver o dia inteiro
    const passados = ehHoje ? (d.agenda || []).filter(x => hm(x.fim) != null && hm(x.fim) <= agoraMin && !ag.some(y => y.inicio === x.inicio && y.titulo === x.titulo)) : [];
    d.agenda = [...passados, ...ag]; d.fator = fator; d.horas = Math.round(estudoMin / 6) / 10;
    d.contexto = [texto.trim(), horas > 0 ? `${horas}h livres` : ''].filter(Boolean).join(' · ') || 'rotina base';
    if (ehHoje) { montarHoje(Math.round(estudoMin * 0.8 * fator), so); sugerirHorarios(d); }
    else { d.cap = Math.round(estudoMin * 0.8 * fator); d.so = so; d.blocos = []; d.montado = false; }
    ui.desfazer = antes; ui.iaMsg = resposta || (ehHoje ? 'Dia montado.' : 'Amanhã montado.');
    ui.diaTexto = ''; ui.diaHoras = ''; ui.amanhaTexto = '';
    salvar();
  } catch (e) { ui.iaMsg = `Não consegui montar ${ehHoje ? 'o dia' : 'amanhã'}: ${e.message}.`; ui.desfazer = null; }
  ui.carregando = ''; render();
}

/** O dia planejado na véspera: na primeira vez que ela abre o app no dia, os assuntos entram nas janelas de estudo. */
function prepararDiaPlanejado() {
  const d = S.dias[hoje()];
  if (!d?.agenda?.length || d.montado !== false || d.blocos.length) return;
  d.montado = true; montarHoje(d.cap, d.so || []); sugerirHorarios(d); salvar();
}

const agoraMinutos = () => { const a = new Date(); return a.getHours() * 60 + a.getMinutes(); };

/** Depois de mexer na agenda: recalcula o tempo de estudo e, se for hoje, encaixa os assuntos de novo (o que já começou fica). */
function reajustarDia(d, data = hoje()) {
  d.agenda.sort((a, b) => (hm(a.inicio) ?? 9999) - (hm(b.inicio) ?? 9999));
  const estudo = soma(d.agenda.filter(x => x.tipo === 'estudo'), x => x.min || Math.max(0, (hm(x.fim) ?? 0) - (hm(x.inicio) ?? 0)));
  d.horas = Math.round(estudo / 6) / 10;
  if (data === hoje()) { if (estudo) montarHoje(Math.round(estudo * 0.8 * (d.fator || 1))); sugerirHorarios(d); }
  else d.cap = Math.round(estudo * 0.8 * (d.fator || 1));
  salvar(); render();
}

// ---------- levar o dia para a Agenda do iPad (.ics): os blocos aparecem no app Calendário e no widget dele ----------
function icsDoDia(data, d) {
  const d8 = data.replace(/-/g, ''), agora = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const doBloco = x => d.blocos.filter(b => b.sug && hm(b.sug) >= hm(x.inicio) && hm(b.sug) < hm(x.fim)).map(b => b.titulo);
  const ev = d.agenda.filter(x => hm(x.inicio) != null && hm(x.fim) != null).map((x, i) => {
    const ass = x.tipo === 'estudo' ? doBloco(x) : [];
    const titulo = x.tipo === 'estudo' ? `Estudo${ass.length ? ': ' + ass.join(' · ') : ''}` : x.titulo;
    // id estável por dia e horário: mandar de novo o mesmo dia atualiza em vez de repetir (no Calendário que respeita o id)
    return ['BEGIN:VEVENT', `UID:rotina-${d8}-${x.inicio.replace(':', '')}-${i}@rotina`, `DTSTAMP:${agora}`, `DTSTART:${d8}T${x.inicio.replace(':', '')}00`, `DTEND:${d8}T${x.fim.replace(':', '')}00`,
      `SUMMARY:${icsTxt(titulo)}`, `DESCRIPTION:${icsTxt(TIPOS_DIA[x.tipo] + (ass.length > 1 ? '\n' + ass.join('\n') : ''))}`,
      ...(['estudo', 'compromisso', 'trabalho'].includes(x.tipo) ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsTxt(titulo)}`, 'TRIGGER:-PT5M', 'END:VALARM'] : []), 'END:VEVENT'].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rotina//PT', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n');
}
async function levarParaAgenda(data) {
  const d = S.dias[data]; if (!d?.agenda?.some(x => x.inicio)) { ui.iaMsg = 'Monte o dia com horários primeiro.'; render(); return; }
  const nome = `rotina-${data}`, txt = icsDoDia(data, d), arq = new File([txt], nome + '.ics', { type: 'text/calendar' });
  try { if (navigator.canShare?.({ files: [arq] })) { await navigator.share({ files: [arq], title: nome }); return; } } catch { }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/calendar' })); a.download = nome + '.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** O dia inteiro numa linha do tempo flexível: dá para mudar horário, tirar, pôr, e empurrar o resto quando atrasar. */
function agendaHtml(d, data = hoje()) {
  const ehHoje = data === hoje(), agora = ehHoje ? agoraMinutos() : -1, cap = d.cap || 0, jan = d.agenda.filter(x => x.tipo === 'estudo');
  const dosBlocos = x => d.blocos.filter(b => b.sug && hm(b.sug) >= hm(x.inicio) && hm(b.sug) < hm(x.fim));
  const ed = i => ui.agEdit === `${data}|${i}`;
  const form = (x, i) => `<div class="ag-form"><div class="linha">
      <label class="campo" style="flex:0 1 120px">Começa<input type="time" id="ag-i" value="${esc(x.inicio || '')}"></label>
      <label class="campo" style="flex:0 1 120px">Termina<input type="time" id="ag-f" value="${esc(x.fim || '')}"></label>
      <label class="campo" style="flex:1 1 150px">Tipo<select id="ag-tp">${Object.entries(TIPOS_DIA).map(([v, t]) => `<option value="${v}" ${x.tipo === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <label class="campo">O que é<input type="text" id="ag-t" value="${esc(x.titulo || '')}" placeholder="Ex.: academia, almoço, dentista"></label>
    <div class="linha"><button class="botao" data-acao="agSalvar" data-i="${i}" data-dia="${data}">Salvar</button>${i >= 0 ? `<button class="botao contorno" data-acao="agRemover" data-i="${i}" data-dia="${data}">Tirar do dia</button>` : ''}<button class="link" data-acao="agCancelar">Cancelar</button></div></div>`;
  let marcouAgora = !ehHoje;
  const itens = d.agenda.map((x, i) => {
    const ini = hm(x.inicio), fim = hm(x.fim), passou = ehHoje && fim != null && fim <= agora, eAgora = ehHoje && ini != null && ini <= agora && agora < fim;
    let marca = '';
    if (!marcouAgora && ini != null && (eAgora || ini > agora)) { marcouAgora = true; if (!eAgora) marca = `<div class="ag-agora"><span>agora · ${hmStr(agora)}</span></div>`; }
    if (ed(i)) return marca + form(x, i);
    const pct = eAgora ? Math.round((agora - ini) / Math.max(1, fim - ini) * 100) : 0;
    return `${marca}<div class="ag ${x.tipo} ${passou ? 'passou' : ''} ${eAgora ? 'agora' : ''}"><span class="ag-h">${x.inicio ? `${x.inicio}<small>${x.fim}</small>` : '·'}</span>
      <div class="ag-c"><div class="entre"><strong>${esc(x.titulo)}</strong><span class="linha" style="gap:6px">${eAgora ? '<span class="selo">agora</span>' : ''}<button class="link ag-ed" data-acao="agEditar" data-i="${i}" data-dia="${data}" aria-label="Mudar">mudar</button></span></div>
        <span class="fraco">${TIPOS_DIA[x.tipo]}${ini != null && fim != null ? ` · ${fmtMin(fim - ini)}` : ''}</span>
        ${eAgora ? `<div class="barra fina"><i style="width:${pct}%"></i></div>` : ''}
        ${x.tipo === 'estudo' && d.blocos.length ? `<div class="ag-ass">${(x.inicio ? dosBlocos(x) : d.blocos).map(b => `<span class="tag" style="${cor(b.materia)}">${b.sug ? b.sug + ' · ' : ''}${esc(b.titulo.length > 34 ? b.titulo.slice(0, 33) + '…' : b.titulo)}</span>`).join('')}</div>` : ''}</div></div>`;
  }).join('');
  return `<section class="cartao"><div class="entre"><h2>${ehHoje ? 'Como está o seu dia' : 'Amanhã'}</h2><span class="fraco">${dataLonga(data)}</span></div>
    <div class="resumo-dia"><div><strong>${fmtMin(soma(jan, x => x.min || hm(x.fim) - hm(x.inicio)))}</strong><span>de estudo no dia</span></div>
      <div><strong>${fmtMin(cap)}</strong><span>de assuntos (20% de folga${d.fator < 1 ? `, energia ×${d.fator}` : ''})</span></div>
      ${ehHoje ? `<div><strong>${d.blocos.length}</strong><span>${d.blocos.length === 1 ? 'assunto' : 'assuntos'}</span></div>` : ''}</div>
    <div class="agenda">${itens}${!marcouAgora && d.agenda.some(x => hm(x.inicio) != null) ? `<div class="ag-agora"><span>agora · ${hmStr(agora)}</span></div>` : ''}</div>
    ${ui.agEdit === `${data}|-1` ? form({ inicio: ehHoje ? hmStr(Math.ceil(agora / 15) * 15 % 1440) : '08:00', fim: ehHoje ? hmStr((Math.ceil(agora / 15) * 15 + 60) % 1440) : '09:00', tipo: 'compromisso', titulo: '' }, -1) : ''}
    <div class="linha"><button class="botao claro" data-acao="agNovo" data-dia="${data}">+ Pôr algo no dia</button>
      ${ehHoje ? `<span class="fraco" style="font-size:14px">Atrasou?</span><button class="chip" data-acao="agAtrasar" data-v="15">+15 min</button><button class="chip" data-acao="agAtrasar" data-v="30">+30 min</button><button class="chip" data-acao="agAtrasar" data-v="60">+1 h</button>` : ''}
      <button class="botao contorno" data-acao="agAgenda" data-dia="${data}">Pôr na Agenda do iPad</button></div>
    ${d.suposicoes?.length ? `<p class="fraco" style="margin:0;font-size:14px"><b>Assumi:</b> ${d.suposicoes.map(esc).join(' · ')}. Se estiver errado, toque em "mudar" ou conte abaixo.</p>` : ''}
    <p class="fraco" style="margin:0;font-size:14px">${ehHoje ? 'Nada aqui é rígido: mude os horários quando quiser. Os assuntos se reencaixam sozinhos no tempo de estudo que sobrar.' : 'Os assuntos entram amanhã cedo, conforme o que você terminar hoje. Pode mudar os horários à vontade.'}</p></section>`;
}

function vMeuDia() {
  prepararDiaPlanejado();
  const h = hoje(), d = S.dias[h], am = S.dias[amanha()];
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
  const amanhaCartao = `<details class="cartao" data-k="amanha" ${ui.ab?.amanha || am?.agenda?.length ? 'open' : ''}><summary><strong>Planejar amanhã</strong> <span class="fraco">· ${dataLonga(amanha())}</span></summary>
    <div class="coluna" style="gap:12px;margin-top:12px">${am?.agenda?.length ? agendaHtml(am, amanha()) : ''}
    <p class="fraco" style="margin:0">${am?.agenda?.length ? 'Mudou algo para amanhã? Conte e eu refaço.' : 'Conte como vai ser amanhã e eu já deixo o dia montado. Se não escrever nada, uso a sua rotina base.'}</p>
    <textarea data-ui="amanhaTexto" placeholder="Ex.: amanhã acordo 6h30, aula até 12h, dentista às 16h, quero estudar mais matemática.">${esc(ui.amanhaTexto || '')}</textarea>
    <div class="linha"><button class="botao" data-acao="planejarAmanha">${am?.agenda?.length ? 'Refazer amanhã' : 'Montar amanhã'}</button></div></div></details>`;
  const rotina = `<details class="cartao" ${basal ? '' : 'open'}><summary><strong>Minha rotina base</strong> <span class="fraco">· o que se repete na maioria dos dias</span></summary>
    <label class="campo" style="margin-top:12px"><small>Horários fixos, aulas, refeições, exercício, sono. O que você contar no dia ajusta isso, e se algo mudar de vez eu atualizo aqui.</small>
    <textarea data-campo="horarios" placeholder="Ex.: acordo 7h; aula de seg a sex das 8h às 12h30; almoço 13h; academia seg, qua e sex às 18h; janto 20h; durmo 23h30; sábado à tarde livre">${esc(S.perfil.horarios)}</textarea></label></details>`;
  return `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">${dataLonga(h)}</span><h1>Meu dia</h1></div></header>${avisoIa()}${temAg ? agendaHtml(d) : ''}${planejar}${amanhaCartao}${rotina}`;
}

Object.assign(VIEWS, { meudia: vMeuDia });
{ const h0 = VIEWS.hoje; VIEWS.hoje = function () { prepararDiaPlanejado(); return h0.apply(this, arguments); }; }
Object.assign(ACOES, {
  agEditar: el => { ui.agEdit = `${el.dataset.dia || hoje()}|${el.dataset.i}`; render(); },
  agCancelar: () => { ui.agEdit = null; render(); },
  agNovo: el => { ui.agEdit = `${el.dataset.dia || hoje()}|-1`; render(); },
  agSalvar: el => {
    const data = el.dataset.dia || hoje(), d = diaDe(data), i = +el.dataset.i, ini = hm($('#ag-i')?.value), fim = hm($('#ag-f')?.value), tipo = $('#ag-tp')?.value || 'outro';
    if (ini == null || fim == null || fim <= ini) { ui.iaMsg = 'Confira os horários: o fim tem que ser depois do começo.'; render(); return; }
    const x = { inicio: hmStr(ini), fim: hmStr(fim), tipo, titulo: ($('#ag-t')?.value || '').trim().slice(0, 80) || TIPOS_DIA[tipo] };
    d.agenda ||= [];
    if (i >= 0) d.agenda[i] = x; else d.agenda.push(x);
    ui.agEdit = null; reajustarDia(d, data);
  },
  agRemover: el => { const data = el.dataset.dia || hoje(), d = diaDe(data); d.agenda.splice(+el.dataset.i, 1); ui.agEdit = null; reajustarDia(d, data); },
  agAtrasar: el => {
    // empurra o que ainda não acabou; o que passaria da meia-noite fica no limite
    const d = diaHoje(), v = +el.dataset.v, agora = agoraMinutos();
    for (const x of d.agenda) { const i = hm(x.inicio), f = hm(x.fim); if (i == null || f <= agora) continue; if (i > agora) x.inicio = hmStr(Math.min(1439, i + v)); x.fim = hmStr(Math.min(1439, f + v)); }
    d.agenda = d.agenda.filter(x => hm(x.inicio) == null || hm(x.fim) > hm(x.inicio));
    ui.iaMsg = `Empurrei o resto do dia em ${v >= 60 ? v / 60 + ' h' : v + ' min'}.`; reajustarDia(d);
  },
  agAgenda: el => levarParaAgenda(el.dataset.dia || hoje()),
  planejarDia: () => {
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
  planejarAmanha: () => {
    const t = ($('[data-ui="amanhaTexto"]')?.value ?? ui.amanhaTexto ?? '').trim(), am = S.dias[amanha()];
    const texto = am?.agenda?.length && t ? `${am.contexto && am.contexto !== 'rotina base' ? am.contexto + '. ' : ''}MUDANÇA: ${t}` : t;
    planejarDia(texto, 0, amanha());
  },
});
render();
