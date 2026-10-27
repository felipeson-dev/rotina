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
    let estudoMin = 0, fator = 1, resposta = '', ag = [];
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
Responda SÓ com JSON: {"resposta":"2 frases curtas e gentis resumindo o dia","fator":1,"motivo":"curto","agenda":[{"inicio":"HH:MM","fim":"HH:MM","titulo":"...","tipo":"estudo|refeicao|exercicio|compromisso|trabalho|pausa|lazer|outro"}],"suposicoes":["o que você assumiu por falta de informação, curto"],"atualizar_rotina":""}
"fator" vai de 0.5 a 1 (1 = energia normal; menos se ela disse que está cansada, dormiu mal, doente etc.). "atualizar_rotina" só se ela disse que algo mudou de vez (ex.: "agora acordo às 6h"): devolva a rotina base inteira já atualizada, senão deixe vazio.`, 3000);
      ag = tratarAgenda(r.agenda, agoraMin);
      d.suposicoes = (Array.isArray(r.suposicoes) ? r.suposicoes : []).map(x => String(x).slice(0, 120)).slice(0, 4);
      fator = Math.min(1, Math.max(0.5, +r.fator || 1)); resposta = String(r.resposta || '').trim();
      if (r.motivo && fator < 1) resposta += ` (${String(r.motivo).trim()})`;
      if (r.atualizar_rotina && String(r.atualizar_rotina).trim().length > 10) { S.perfil.horarios = String(r.atualizar_rotina).trim().slice(0, 1500); resposta += ' Atualizei a sua rotina base.'; }
      estudoMin = soma(ag.filter(x => x.tipo === 'estudo'), x => hm(x.fim) - hm(x.inicio));
      if (!estudoMin && horas > 0) { estudoMin = Math.round(horas * 60); ag.push({ inicio: '', fim: '', titulo: `${horas}h livres para estudar`, tipo: 'estudo', min: estudoMin }); }
    }
    if (!estudoMin) throw new Error('não achei tempo livre para estudar. Conte mais sobre o seu dia ou informe as horas');
    d.agenda = ag; d.fator = fator; d.horas = Math.round(estudoMin / 6) / 10;
    d.contexto = [texto.trim(), horas > 0 ? `${horas}h livres` : ''].filter(Boolean).join(' · ') || 'rotina base';
    montarHoje(Math.round(estudoMin * 0.8 * fator)); sugerirHorarios(d);
    ui.desfazer = antes; ui.iaMsg = resposta || 'Dia montado.';
    ui.diaTexto = ''; ui.diaHoras = '';
    salvar();
  } catch (e) { ui.iaMsg = `Não consegui montar o dia: ${e.message}.`; ui.desfazer = null; }
  ui.carregando = ''; render();
}

function vMeuDia() {
  const h = hoje(), d = S.dias[h];
  const temAg = d?.agenda?.length;
  const chavesOk = temChaveIa();
  const planejar = `<section class="cartao" style="gap:14px"><h2>${temAg ? 'Replanejar' : 'Como vai ser o seu dia?'}</h2>
    <p class="fraco" style="margin:0">Conte do seu jeito: a que horas acorda, aulas, almoço, academia, compromissos, como você está se sentindo. Eu calculo o tempo livre, encaixo os assuntos e monto tudo. ${S.perfil.horarios?.trim() ? 'Se não escrever nada, uso a sua rotina base.' : ''}</p>
    <textarea data-ui="diaTexto" placeholder="Ex.: Hoje acordei 7h, tenho aula até 12h30, almoço com a minha mãe, academia às 18h. Dormi mal, estou meio cansada.">${esc(ui.diaTexto)}</textarea>
    <div class="linha"><label class="fraco" for="dia-horas">ou só diga as horas livres:</label>
      <input type="number" id="dia-horas" min="0.5" max="16" step="0.5" placeholder="ex.: 6" value="${esc(ui.diaHoras)}" style="width:100px"></div>
    <div class="linha"><button class="botao grande" data-acao="planejarDia">${temAg ? 'Replanejar o dia' : 'Montar meu dia'}</button>
      ${d?.blocos?.length ? '<button class="botao contorno" data-acao="ir" data-v="hoje">Ver a lista de hoje</button>' : ''}</div>
    ${chavesOk ? '' : '<p class="fraco" style="margin:0;color:var(--tinta)">Sem chave de IA, só consigo usar as horas livres. Cole as chaves em Ajustes para eu entender o texto.</p>'}</section>`;
  const rotina = `<details class="cartao" ${S.perfil.horarios?.trim() ? '' : 'open'}><summary><strong>Minha rotina base</strong> <span class="fraco">· o que se repete na maioria dos dias</span></summary>
    <label class="campo" style="margin-top:12px"><small>Horários fixos, aulas, refeições, exercício, sono. O que você contar no dia ou ontem ajusta isso, e se algo mudar de vez eu atualizo aqui.</small>
    <textarea data-campo="horarios" placeholder="Ex.: acordo 7h; aula de seg a sex das 8h às 12h30; almoço 13h; academia seg, qua e sex às 18h; janto 20h; durmo 23h30; sábado à tarde livre">${esc(S.perfil.horarios)}</textarea></label></details>`;
  let agenda = '';
  if (temAg) {
    const cap = d.cap || 0, jan = d.agenda.filter(x => x.tipo === 'estudo');
    const dosBlocos = x => d.blocos.filter(b => b.sug && hm(b.sug) >= hm(x.inicio) && hm(b.sug) < hm(x.fim));
    agenda = `<section class="cartao"><div class="entre"><h2>Agenda de hoje</h2><span class="fraco">${dataLonga(h)}</span></div>
      <div class="resumo-dia"><div><strong>${fmtMin(soma(jan, x => x.min || hm(x.fim) - hm(x.inicio)))}</strong><span>tempo livre de estudo</span></div>
        <div><strong>${fmtMin(cap)}</strong><span>de assuntos (20% de folga${d.fator < 1 ? `, energia ×${d.fator}` : ''})</span></div>
        <div><strong>${d.blocos.length}</strong><span>${d.blocos.length === 1 ? 'assunto' : 'assuntos'} no dia</span></div></div>
      <div class="agenda">${d.agenda.map(x => `<div class="ag ${x.tipo}"><span class="ag-h">${x.inicio ? `${x.inicio}<small>${x.fim}</small>` : '·'}</span>
        <div class="ag-c"><strong>${esc(x.titulo)}</strong><span class="fraco">${TIPOS_DIA[x.tipo]}</span>
        ${x.tipo === 'estudo' ? `<div class="ag-ass">${(x.inicio ? dosBlocos(x) : d.blocos).map(b => `<span class="tag" style="${cor(b.materia)}">${b.sug ? b.sug + ' · ' : ''}${esc(b.titulo.length > 34 ? b.titulo.slice(0, 33) + '…' : b.titulo)}</span>`).join('')}</div>` : ''}</div></div>`).join('')}</div>
      ${d.suposicoes?.length ? `<p class="fraco" style="margin:0;font-size:14px"><b>Assumi:</b> ${d.suposicoes.map(esc).join(' · ')}. Se estiver errado, conte acima e eu ajusto.</p>` : ''}
      <p class="fraco" style="margin:0;font-size:14px">Os horários dos assuntos são só uma sugestão: faça na ordem que fizer sentido. Se algo mudar, conte acima e eu replanejo o resto do dia sem perder o que já foi feito.</p></section>`;
  }
  return `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">${dataLonga(h)}</span><h1>Meu dia</h1></div></header>${avisoIa()}${planejar}${agenda}${rotina}`;
}

Object.assign(VIEWS, { meudia: vMeuDia });
Object.assign(ACOES, {
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
});
render();
