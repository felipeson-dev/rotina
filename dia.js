'use strict';
/* Meu dia: ela conta como vai ser o dia (ou só diz as horas) e o app monta a agenda inteira a partir da rotina base dela,
   do que ela contou hoje e do que aconteceu ontem. A IA entende o texto (horários, almoço, energia); o app calcula o tempo e encaixa os assuntos. */

ICONES.meudia = '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M9.5 15.5l2 2 3.5-4"/>';
const TIPOS_DIA = { estudo: 'Estudo', exercicio: 'Treino / exercício', compromisso: 'Compromisso', refeicao: 'Refeição', trabalho: 'Aula / trabalho', pausa: 'Pausa', lazer: 'Lazer', outro: 'Outro' };
const ICONE_TIPO_DIA = { estudo: '📚', exercicio: '🏋️', compromisso: '📅', refeicao: '🍽', trabalho: '🎓', pausa: '☕', lazer: '🌿', outro: '📌' };
ui.diaTexto = ''; ui.diaHoras = ''; ui.diaAjuste = ''; ui.hojeIaAberta = false;

const hm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
const hmStr = n => `${pad(Math.floor(Math.max(0, n) / 60) % 24)}:${pad(Math.max(0, n) % 60)}`;

/** Distribui os assuntos pelas janelas de estudo, só como sugestão de horário (ela pode fazer na ordem que quiser). */
function sugerirHorarios(d) {
  if (!d?.blocos) return;
  const jan = (d.agenda || []).filter(x => x.tipo === 'estudo' && hm(x.inicio) != null && hm(x.fim) != null).map(x => ({ ini: hm(x.inicio), fim: hm(x.fim) })).sort((a, b) => a.ini - b.ini);
  d.blocos.forEach(b => { b.sug = null; });
  if (!jan.length) return;
  let w = 0, t = jan[0].ini;
  for (const b of d.blocos) {
    if (typeof blocoConcluido === 'function' ? blocoConcluido(b) : (achar(b.assuntoId)?.feito || b.passos?.every(p => p.ok))) continue;
    while (w < jan.length && jan[w].fim - t < 15) { w++; t = jan[w]?.ini; }
    if (w >= jan.length) break;
    b.sug = hmStr(t);
    let falta = Math.round((b.min || 30) / 0.8);
    while (falta > 0 && w < jan.length) { const livre = jan[w].fim - t; if (falta <= livre) { t += falta; falta = 0; } else { falta -= livre; w++; t = jan[w]?.ini; } }
  }
}
window.sugerirHorarios = sugerirHorarios;

/** Se ela montou o dia rápido ("Tenho 4h hoje") sem agenda detalhada, cria janelas flexíveis iniciais e inclui pendências com horário. */
function garantirAgendaPadrao(d, data = hoje()) {
  if (!d) return;
  d.agenda ||= [];
  // sincroniza pendências do dia com horário que ainda não estejam na agenda
  const pends = (S.pend || []).filter(p => !p.feito && p.dia === data && hm(p.hora) != null);
  for (const p of pends) {
    const ini = hm(p.hora), fim = Math.min(1439, ini + 60);
    if (!d.agenda.some(x => x.pendId === p.id || (x.inicio === hmStr(ini) && x.titulo.toLowerCase() === p.titulo.toLowerCase()))) {
      d.agenda.push({ inicio: hmStr(ini), fim: hmStr(fim), titulo: p.titulo, tipo: /treino|academia|corrida|pilates|natac|exerc/i.test(p.titulo) ? 'exercicio' : 'compromisso', pendId: p.id });
    }
  }
  const temComHora = d.agenda.some(x => hm(x.inicio) != null && hm(x.fim) != null);
  if (!temComHora && (d.horas > 0 || d.blocos?.length)) {
    const minTot = Math.round((d.horas || Math.max(2, Math.round(soma(d.blocos || [], b => b.min || 30) / 48))) * 60);
    const agora = data === hoje() ? (new Date().getHours() * 60 + new Date().getMinutes()) : 480;
    const iniBase = data === hoje() ? Math.min(1260, Math.max(480, Math.ceil(agora / 30) * 30)) : 480;
    d.agenda = d.agenda.filter(x => hm(x.inicio) != null);
    if (minTot <= 210 || iniBase >= 960) {
      const fim = Math.min(1410, iniBase + minTot);
      d.agenda.push({ inicio: hmStr(iniBase), fim: hmStr(fim), titulo: 'Bloco de estudo (flexível)', tipo: 'estudo' });
    } else {
      const m1 = Math.min(180, Math.round(minTot / 2)), m2 = Math.max(60, minTot - m1);
      const fim1 = Math.min(1320, iniBase + m1);
      const iniPausa = fim1, fimPausa = Math.min(1350, iniPausa + (iniPausa >= 690 && iniPausa <= 840 ? 60 : 30));
      const fim2 = Math.min(1425, fimPausa + m2);
      d.agenda.push({ inicio: hmStr(iniBase), fim: hmStr(fim1), titulo: 'Estudo · 1º turno (flexível)', tipo: 'estudo' });
      d.agenda.push({ inicio: hmStr(iniPausa), fim: hmStr(fimPausa), titulo: iniPausa >= 690 && iniPausa <= 840 ? 'Almoço / descanso' : 'Pausa / lanche', tipo: iniPausa >= 690 && iniPausa <= 840 ? 'refeicao' : 'pausa' });
      if (fim2 > fimPausa + 20) d.agenda.push({ inicio: hmStr(fimPausa), fim: hmStr(fim2), titulo: 'Estudo · 2º turno (flexível)', tipo: 'estudo' });
    }
    d.agenda.sort((a, b) => (hm(a.inicio) ?? 9999) - (hm(b.inicio) ?? 9999));
    sugerirHorarios(d);
  }
}
window.garantirAgendaPadrao = garantirAgendaPadrao;

/** Parser local para montar a agenda mesmo sem chave de IA ou se ela quiser resposta imediata ao digitar horários. */
function parsearDiaLocal(texto, horas, agoraMin) {
  const ag = [], txt = String(texto || '');
  const Partes = txt.split(/[.;\n]+|(?:\s+e\s+(?=[a-zà-ú]+\s+(?:às|as|das|de|\d)))/i);
  const parseH = (h, m) => (+h < 24 && +(m || 0) < 60 ? +h * 60 + +(m || 0) : null);
  for (const p of Partes) {
    const s = p.trim(); if (!s) continue;
    const mInt = /(?:das?|de)?\s*(\d{1,2})(?:h|:)?(\d{2})?\s*(?:às|as|a|até|-)\s*(\d{1,2})(?:h|:)?(\d{2})?/i.exec(s);
    const mHora = /(?:às|as|a partir das?)?\s*(\d{1,2})(?:h|:)(\d{2})?/i.exec(s);
    let ini = null, fim = null;
    if (mInt) { ini = parseH(mInt[1], mInt[2]); fim = parseH(mInt[3], mInt[4]); }
    else if (mHora) { ini = parseH(mHora[1], mHora[2]); if (ini != null) fim = Math.min(1439, ini + (/estudo|estudar/i.test(s) ? 120 : 60)); }
    if (ini == null || fim == null || fim <= ini) continue;
    let tipo = 'compromisso', tit = s.replace(/(?:das?|de)?\s*\d{1,2}(?:h|:)?\d{0,2}\s*(?:às|as|a|até|-)\s*\d{1,2}(?:h|:)?\d{0,2}/ig, '').replace(/(?:às|as)\s*\d{1,2}(?:h|:)?\d{0,2}/ig, '').replace(/^[\s,:-]+|[\s,:-]+$/g, '');
    if (/treino|academia|corrida|pilates|natac|musculac|exerc|esporte|caminhada/i.test(s)) { tipo = 'exercicio'; tit = tit || 'Treino'; }
    else if (/estud/i.test(s)) { tipo = 'estudo'; tit = tit || 'Bloco de estudo'; }
    else if (/almoc|janta|cafe|lanche|refeic/i.test(s)) { tipo = 'refeicao'; tit = tit || 'Refeição'; }
    else if (/aula|cursinho|faculdade|trabalh|plantao/i.test(s)) { tipo = 'trabalho'; tit = tit || 'Aula / compromisso'; }
    else if (/descans|pausa|cochilo/i.test(s)) { tipo = 'pausa'; tit = tit || 'Pausa'; }
    else if (/lazer|filme|sair|namorad/i.test(s)) { tipo = 'lazer'; tit = tit || 'Lazer'; }
    tit = tit ? tit[0].toUpperCase() + tit.slice(1) : TIPOS_DIA[tipo];
    ag.push({ inicio: hmStr(ini), fim: hmStr(fim), titulo: tit.slice(0, 80), tipo });
  }
  if (!ag.some(x => x.tipo === 'estudo')) {
    const minEst = Math.round((horas > 0 ? horas : 4) * 60);
    const ocupados = ag.map(x => [hm(x.inicio), hm(x.fim)]).sort((a, b) => a[0] - b[0]);
    let cur = Math.max(480, Math.ceil((agoraMin || 480) / 30) * 30), falta = minEst;
    for (const [oi, ofim] of [...ocupados, [1380, 1440]]) {
      if (falta <= 0) break;
      if (oi - cur >= 45) {
        const dur = Math.min(falta, oi - cur, 180);
        ag.push({ inicio: hmStr(cur), fim: hmStr(cur + dur), titulo: 'Estudo (horário flexível)', tipo: 'estudo' });
        falta -= dur;
      }
      cur = Math.max(cur, ofim);
    }
  }
  return ag.sort((a, b) => hm(a.inicio) - hm(b.inicio));
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
    if (!texto.trim() && horas > 0 && !basal) {
      estudoMin = Math.round(horas * 60);
      ag = parsearDiaLocal('', horas, agoraMin);
      resposta = `${ehHoje ? 'Dia' : 'Amanhã'} montado com ${horas}h livres.`;
    } else if (!temChaveIa()) {
      ag = parsearDiaLocal(texto.trim() || basal, horas, agoraMin);
      estudoMin = soma(ag.filter(x => x.tipo === 'estudo'), x => hm(x.fim) - hm(x.inicio));
      resposta = `${ehHoje ? 'Dia' : 'Amanhã'} montado com os seus horários e compromissos.`;
    } else {
      if (!texto.trim() && !basal) throw new Error('escreva como será o dia, ou preencha a rotina base abaixo, ou informe as horas livres');
      const ref = ehHoje ? S.dias[somaDias(hoje(), -1)] : S.dias[hoje()], refNome = ehHoje ? 'Ontem' : 'Hoje';
      const atras = S.assuntos.filter(a => estadoDe(a) === 'atrasado').length;
      const pend = (S.pend || []).filter(p => !p.feito && p.dia === alvo).map(p => `${p.titulo}${p.hora ? ' às ' + p.hora : ''}`).join('; ');
      try {
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
      } catch {
        ag = parsearDiaLocal(texto.trim() || basal, horas, agoraMin);
        resposta = `${ehHoje ? 'Dia' : 'Amanhã'} montado com os seus horários e compromissos.`;
      }
      estudoMin = soma(ag.filter(x => x.tipo === 'estudo'), x => hm(x.fim) - hm(x.inicio));
      if (!estudoMin && horas > 0) { estudoMin = Math.round(horas * 60); ag.push({ inicio: '08:00', fim: hmStr(Math.min(1410, 480 + estudoMin)), titulo: `${horas}h livres para estudar`, tipo: 'estudo', min: estudoMin }); }
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

/** Seção completa dentro de Hoje: mostra tudo do dia (rotina, treino, compromissos e janelas de estudo com assuntos flexíveis),
   fácil de visualizar, adicionar, editar e trocar a ordem. */
function programacaoHojeHtml(d) {
  const data = hoje(), agora = agoraMinutos();
  garantirAgendaPadrao(d, data);
  sugerirHorarios(d);
  const jan = (d.agenda || []).filter(x => x.tipo === 'estudo');
  const dosBlocos = (x, idxJan) => {
    if (!x.inicio) return d.blocos || [];
    const ini = hm(x.inicio), fim = hm(x.fim);
    const encaixados = (d.blocos || []).filter(b => b.sug && hm(b.sug) >= ini && hm(b.sug) < fim);
    // na última janela de estudo, mostra também assuntos pendentes que não couberam ou já concluídos
    if (idxJan === jan.length - 1) {
      const jaMostrados = new Set((d.blocos || []).filter(b => b.sug && jan.some(j => hm(b.sug) >= hm(j.inicio) && hm(b.sug) < hm(j.fim))).map(b => b.id));
      const extras = (d.blocos || []).filter(b => !jaMostrados.has(b.id));
      return [...encaixados, ...extras];
    }
    return encaixados;
  };
  const ed = i => ui.agEdit === `${data}|${i}`;
  const form = (x, i) => `<div class="ag-form"><div class="linha">
      <label class="campo" style="flex:0 1 120px">Começa<input type="time" id="ag-i" value="${esc(x.inicio || '')}"></label>
      <label class="campo" style="flex:0 1 120px">Termina<input type="time" id="ag-f" value="${esc(x.fim || '')}"></label>
      <label class="campo" style="flex:1 1 160px">Tipo<select id="ag-tp">${Object.entries(TIPOS_DIA).map(([v, t]) => `<option value="${v}" ${x.tipo === v ? 'selected' : ''}>${ICONE_TIPO_DIA[v] || ''} ${t}</option>`).join('')}</select></label></div>
    <label class="campo">O que é<input type="text" id="ag-t" value="${esc(x.titulo || '')}" placeholder="Ex.: treino na academia, médico, almoço, estudo…"></label>
    <div class="linha"><button class="botao" data-acao="agSalvar" data-i="${i}" data-dia="${data}">Salvar horário</button>${i >= 0 ? `<button class="botao contorno" data-acao="agRemover" data-i="${i}" data-dia="${data}">Tirar do dia</button>` : ''}<button class="link" data-acao="agCancelar">Cancelar</button></div></div>`;

  let marcouAgora = false, idxEstudo = 0;
  const itens = (d.agenda || []).map((x, i) => {
    const ini = hm(x.inicio), fim = hm(x.fim), passou = fim != null && fim <= agora, eAgora = ini != null && ini <= agora && agora < fim;
    let marca = '';
    if (!marcouAgora && ini != null && (eAgora || ini > agora)) { marcouAgora = true; if (!eAgora) marca = `<div class="ag-agora"><span>agora · ${hmStr(agora)}</span></div>`; }
    if (ed(i)) return marca + form(x, i);
    const pct = eAgora ? Math.round((agora - ini) / Math.max(1, fim - ini) * 100) : 0;
    const jIdx = x.tipo === 'estudo' ? idxEstudo++ : -1;
    const bs = x.tipo === 'estudo' ? dosBlocos(x, jIdx) : [];
    const ic = ICONE_TIPO_DIA[x.tipo] || '📌';
    const checkavel = x.tipo !== 'estudo';
    return `${marca}<div class="ag ${x.tipo} ${passou || x.ok ? 'passou' : ''} ${eAgora ? 'agora' : ''} ${x.ok ? 'ag-ok' : ''}">
      <button type="button" class="ag-h ag-h-btn" data-acao="agEditar" data-i="${i}" data-dia="${data}" title="Toque para mudar o horário">${x.inicio ? `${x.inicio}<small>${x.fim}</small>` : 'livre'}</button>
      <div class="ag-c">
        <div class="entre" style="gap:8px;flex-wrap:wrap">
          <div class="linha" style="gap:8px">
            ${checkavel ? `<input type="checkbox" class="check-ag" data-acao="agCheck" data-i="${i}" data-dia="${data}" ${x.ok ? 'checked' : ''} title="Marcar como feito">` : ''}
            <strong>${ic} ${esc(x.titulo)}</strong>
            ${x.tipo === 'estudo' ? '<span class="selo flexivel">horário e ordem flexíveis</span>' : ''}
          </div>
          <span class="linha" style="gap:8px">
            ${eAgora ? '<span class="selo">agora</span>' : ''}
            <button class="link ag-ed" data-acao="agEditar" data-i="${i}" data-dia="${data}">mudar</button>
            <button class="x-mini" data-acao="agRemover" data-i="${i}" data-dia="${data}" title="Tirar do dia">×</button>
          </span>
        </div>
        <span class="fraco" style="font-size:13px">${TIPOS_DIA[x.tipo]}${ini != null && fim != null ? ` · ${fmtMin(fim - ini)}` : ''}</span>
        ${eAgora ? `<div class="barra fina"><i style="width:${pct}%"></i></div>` : ''}
        ${x.tipo === 'estudo' && bs.length ? `<div class="ag-ass-lista">
          <span class="fraco" style="font-size:12px">Sugestão para este turno (pode fazer em outra ordem):</span>
          ${bs.map(b => {
            const conc = typeof blocoConcluido === 'function' ? blocoConcluido(b) : !!b.feito;
            const pos = d.blocos.indexOf(b);
            return `<div class="ag-ass-item ${conc ? 'feito' : ''}" style="${cor(b.materia)}">
              <label class="linha" style="gap:6px;flex:1;min-width:160px;cursor:pointer">
                <input type="checkbox" data-acao="blocoFeito" data-b="${b.id}" ${conc ? 'checked' : ''}>
                ${b.sug && !conc ? `<span class="ag-sug">~${b.sug}</span>` : ''}
                ${b.materia ? `<span class="tag" style="${cor(b.materia)}">${esc(b.materia)}</span>` : ''}
                <span class="ag-ass-tit">${esc(b.titulo)}</span>
                <small class="fraco">(${fmtMin(b.min || 30)})</small>
              </label>
              <div class="linha" style="gap:2px">
                <button type="button" class="ag-ord" data-acao="moverBloco" data-b="${b.id}" data-d="-1" ${pos <= 0 ? 'disabled' : ''} title="Subir na ordem">↑</button>
                <button type="button" class="ag-ord" data-acao="moverBloco" data-b="${b.id}" data-d="1" ${pos < 0 || pos >= d.blocos.length - 1 ? 'disabled' : ''} title="Descer na ordem">↓</button>
              </div>
            </div>`;
          }).join('')}
        </div>` : ''}
      </div></div>`;
  }).join('');

  const nv = ui.agNovoPreset || { inicio: hmStr(Math.ceil(agora / 15) * 15 % 1440), fim: hmStr((Math.ceil(agora / 15) * 15 + 60) % 1440), tipo: 'compromisso', titulo: '' };
  const aberto = ui.ab?.['prog-hoje'] !== false;
  return `<details class="cartao prog-hoje" data-k="prog-hoje" ${aberto ? 'open' : ''}>
    <summary><div class="entre" style="flex:1;flex-wrap:wrap;gap:8px">
      <div class="linha" style="gap:8px"><strong>🗓 Programação do seu dia</strong><span class="selo flexivel">tudo editável e flexível</span></div>
      <span class="fraco" style="font-size:13px">${(d.agenda || []).length} blocos no dia · toque para ver ou mudar</span>
    </div></summary>
    <div class="prog-hoje-corpo">
      <div class="entre" style="flex-wrap:wrap;gap:8px">
        <div class="linha" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="chip" data-acao="agNovoTipo" data-tipo="exercicio" data-tit="Treino">🏋️ + Treino</button>
          <button type="button" class="chip" data-acao="agNovoTipo" data-tipo="compromisso" data-tit="">📅 + Compromisso</button>
          <button type="button" class="chip" data-acao="agNovoTipo" data-tipo="estudo" data-tit="Bloco de estudo">📚 + Horário de estudo</button>
          <button type="button" class="chip" data-acao="agNovoTipo" data-tipo="refeicao" data-tit="Almoço / lanche">🍽 + Refeição / pausa</button>
        </div>
        <button type="button" class="botao claro" data-acao="hojeIaToggle">${ui.hojeIaAberta ? 'Fechar ajuste rápido' : '✨ Contar / ajustar dia por texto'}</button>
      </div>
      ${ui.hojeIaAberta ? `<div class="ag-form">
        <label class="campo"><span>Conte como vai ser o seu dia (treino, compromissos, horários de estudo, energia) e eu organizo tudo:</span>
          <textarea id="hoje-ia-txt" data-ui="diaTexto" rows="2" placeholder="Ex.: Hoje tenho treino às 18h, médico às 14h, e vou estudar das 8h às 12h e das 15h30 às 17h30.">${esc(ui.diaTexto || '')}</textarea></label>
        <div class="linha">
          <button type="button" class="botao" data-acao="hojeIaMontar">Montar / atualizar programação</button>
          <button type="button" class="link" data-acao="hojeIaToggle">Cancelar</button>
        </div>
      </div>` : ''}
      ${ui.agEdit === `${data}|-1` ? form(nv, -1) : ''}
      <div class="agenda">${itens || '<p class="fraco" style="margin:0">Adicione seus horários de estudo, treino ou compromissos acima.</p>'}</div>
      <div class="entre" style="flex-wrap:wrap;gap:8px;padding-top:4px;border-top:1px dashed var(--linha)">
        <div class="linha" style="gap:6px">
          <span class="fraco" style="font-size:13px">Imprevisto / atrasou?</span>
          <button type="button" class="chip" data-acao="agAtrasar" data-v="15">+15 min</button>
          <button type="button" class="chip" data-acao="agAtrasar" data-v="30">+30 min</button>
          <button type="button" class="chip" data-acao="agAtrasar" data-v="60">+1 h</button>
        </div>
        <div class="linha" style="gap:8px">
          <button type="button" class="link" data-acao="agAgenda" data-dia="${data}" style="font-size:13px">📅 Levar p/ Calendário do iPad</button>
          <button type="button" class="link" data-acao="ir" data-v="meudia" style="font-size:13px">Planejar amanhã / rotina base ›</button>
        </div>
      </div>
      <p class="fraco" style="margin:0;font-size:13px">💡 <b>Totalmente flexível:</b> os horários dos assuntos são apenas um guia para você visualizar o dia. Você pode estudar em qualquer ordem ou mudar a fila com <b>↑ ↓</b>.</p>
    </div>
  </details>`;
}
window.programacaoHojeHtml = programacaoHojeHtml;

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
  agCancelar: () => { ui.agEdit = null; ui.agNovoPreset = null; render(); },
  agNovo: el => { ui.agNovoPreset = null; ui.agEdit = `${el.dataset.dia || hoje()}|-1`; render(); },
  agNovoTipo: el => {
    const data = el.dataset.dia || hoje(), tipo = el.dataset.tipo || 'compromisso', tit = el.dataset.tit || '';
    const padraoHora = { exercicio: ['18:00', '19:00'], estudo: ['08:00', '10:00'], refeicao: ['12:30', '13:30'], compromisso: ['14:00', '15:00'] }[tipo] || ['14:00', '15:00'];
    ui.agNovoPreset = { inicio: padraoHora[0], fim: padraoHora[1], tipo, titulo: tit };
    ui.ab ||= {}; ui.ab['prog-hoje'] = true;
    ui.agEdit = `${data}|-1`; render();
    setTimeout(() => $('#ag-t')?.focus(), 40);
  },
  agCheck: el => {
    const data = el.dataset.dia || hoje(), d = diaDe(data), item = d.agenda?.[+el.dataset.i];
    if (!item) return;
    item.ok = !!el.checked;
    if (item.pendId) { const p = (S.pend || []).find(x => x.id === item.pendId); if (p) p.feito = item.ok; }
    salvar(); render();
  },
  moverBloco: el => {
    const d = diaHoje(), idx = (d.blocos || []).findIndex(b => b.id === el.dataset.b), dir = +el.dataset.d || 0;
    const alvo = idx + dir;
    if (idx < 0 || alvo < 0 || alvo >= d.blocos.length) return;
    const [item] = d.blocos.splice(idx, 1);
    d.blocos.splice(alvo, 0, item);
    sugerirHorarios(d); salvar(); render();
  },
  hojeIaToggle: () => { ui.hojeIaAberta = !ui.hojeIaAberta; render(); },
  hojeIaMontar: () => {
    const t = ($('#hoje-ia-txt')?.value ?? ui.diaTexto ?? '').trim();
    const d = diaHoje();
    ui.hojeIaAberta = false;
    planejarDia(t, d.horas || 4, hoje());
  },
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
