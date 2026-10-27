'use strict';
/* Pendências (coisas da vida, com dia, hora e aviso), metas diárias de questões e tempos de estudo definidos à mão. */

ICONES.pendencias = '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>';
S.pend ||= []; S.metaQ ||= {}; S.minQ ||= {};
const METAQ_PADRAO = { 'Matemática': 50, 'Física': 50, 'Química': 50, 'Biologia': 100, 'História': 100, 'Geografia': 100, 'Português': 100, 'Literatura': 100 };
const metaQ = m => S.metaQ[m] ?? METAQ_PADRAO[m] ?? 0;
const CATS_PEND = ['Saúde', 'Casa', 'Pessoal', 'Estudos', 'Compras', 'Outros'];
const ALERTAS = [[-1, 'sem aviso'], [0, 'na hora'], [10, '10 min antes'], [30, '30 min antes'], [60, '1 hora antes'], [1440, '1 dia antes']];
const REPETE = [['', 'não repete'], ['diaria', 'todo dia'], ['semanal', 'toda semana'], ['mensal', 'todo mês']];
ui.pendMod = null;

// ---------- pendências ----------
const dtPend = p => p.dia ? new Date(`${p.dia}T${p.hora || '08:00'}:00`).getTime() : null;
function rotuloDia(d) {
  if (!d) return 'sem data'; const h = hoje();
  return d === h ? 'hoje' : d === somaDias(h, 1) ? 'amanhã' : d === somaDias(h, -1) ? 'ontem' : diaCurto(d) + ' ' + nomeMes(d).slice(0, 3);
}
const pendAbertas = () => S.pend.filter(p => !p.feito);
function pendHojeTexto() {
  const h = hoje(), l = pendAbertas().filter(p => p.dia === h);
  return l.length ? l.map(p => `${p.titulo}${p.hora ? ' às ' + p.hora : ''}`).join('; ') : '';
}

function itemPend(p) {
  const h = hoje(), atras = p.dia && p.dia < h && !p.feito;
  return `<div class="pend ${p.feito ? 'feita' : ''} ${atras ? 'atrasada' : ''} ${p.prio ? 'prio' : ''}">
    <input type="checkbox" data-acao="pendFeito" data-id="${p.id}" ${p.feito ? 'checked' : ''} aria-label="Feita">
    <button class="pend-corpo" data-acao="pendEditar" data-id="${p.id}"><strong>${p.prio ? '★ ' : ''}${esc(p.titulo)}</strong>
      <span class="pend-chips">${p.dia ? `<span class="selo ${atras ? 'atraso' : ''}">${rotuloDia(p.dia)}${p.hora ? ' · ' + p.hora : ''}</span>` : ''}${p.repete ? `<span class="selo">↻ ${REPETE.find(r => r[0] === p.repete)[1]}</span>` : ''}${p.alerta >= 0 && p.dia ? `<span class="selo">🔔 ${ALERTAS.find(a => a[0] === p.alerta)?.[1] || ''}</span>` : ''}${p.cat ? `<span class="selo">${esc(p.cat)}</span>` : ''}</span>
      ${p.nota ? `<span class="fraco" style="font-size:13px">${esc(p.nota)}</span>` : ''}</button></div>`;
}

function pendHojeHtml() {
  const h = hoje(), l = pendAbertas().filter(p => p.dia && p.dia <= h).sort((a, b) => (a.dia + (a.hora || '')) < (b.dia + (b.hora || '')) ? -1 : 1);
  if (!l.length) return '';
  return `<section class="cartao"><div class="entre"><h2>Pendências de hoje</h2><button class="link" data-acao="ir" data-v="pendencias">Ver todas</button></div>${l.map(itemPend).join('')}</section>`;
}

function metaQHtml() {
  const d = S.dias[hoje()], q = S.qlog[hoje()] || {};
  const mats = [...new Set([...(d?.blocos || []).map(b => b.materia), ...Object.keys(q)].filter(m => metaQ(m) > 0))];
  if (!mats.length) return '';
  return `<section class="cartao"><div class="entre"><h2>Meta de questões</h2><button class="link" data-acao="ir" data-v="questoes">Fazer questões</button></div>
    ${mats.map(m => { const f = q[m]?.f || 0, meta = metaQ(m); return `<div class="meta-linha" style="${cor(m)}"><span><i class="ponto"></i>${esc(m)}</span><span class="fraco">${f}/${meta}${f >= meta ? ' ✓' : ''}</span><div class="barra"><i style="width:${Math.min(100, Math.round(f / meta * 100))}%;background:var(--c)"></i></div></div>`; }).join('')}</section>`;
}

function vPend() {
  const h = hoje(), ab = pendAbertas().sort((a, b) => ((a.dia || '9') + (a.hora || '')) < ((b.dia || '9') + (b.hora || '')) ? -1 : 1);
  const atras = ab.filter(p => p.dia && p.dia < h), hojeL = ab.filter(p => p.dia === h), prox = ab.filter(p => p.dia > h), sem = ab.filter(p => !p.dia);
  const feitas = S.pend.filter(p => p.feito).slice(-8).reverse();
  const bloco = (t, l, cls = '') => l.length ? `<section class="cartao ${cls}"><h2>${t} <span class="fraco" style="font-size:16px">(${l.length})</span></h2>${l.map(itemPend).join('')}</section>` : '';
  const porDia = {}; prox.forEach(p => (porDia[p.dia] ||= []).push(p));
  const notif = 'Notification' in window ? Notification.permission : 'nao';
  return `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">${dataLonga(h)}</span><h1>Pendências</h1></div>
      <div class="linha">${prox.concat(hojeL).length ? '<button class="botao claro" data-acao="pendICSTodas">Levar tudo para o Calendário</button>' : ''}</div></header>${avisoIa()}
    <section class="cartao"><h2>Nova pendência</h2>
      <div class="linha" style="flex-wrap:nowrap"><input type="text" id="pend-rapido" placeholder="Ex.: dentista quinta às 15h30, avisar 1h antes" data-ui="pendRapido" value="${esc(ui.pendRapido || '')}"><button class="botao" data-acao="pendRapida">Adicionar</button></div>
      <div class="linha"><span class="fraco" style="font-size:14px">${temChaveIa() ? 'Escreva do seu jeito: a IA entende dia, hora, aviso e repetição.' : 'Sem chave de IA, só o título é guardado.'}</span><button class="link" data-acao="pendNova">Preencher tudo à mão</button></div>
      ${notif === 'default' ? '<div class="linha"><button class="botao contorno" data-acao="pendPermissao">Ativar avisos neste aparelho</button><span class="fraco" style="font-size:14px">Os avisos aparecem com o app aberto. Para avisar com o app fechado, use "Levar para o Calendário".</span></div>'
        : notif === 'denied' ? '<p class="fraco" style="margin:0;font-size:14px">Os avisos do sistema estão bloqueados; o app ainda avisa por dentro quando está aberto.</p>' : ''}</section>
    ${bloco('Atrasadas', atras, 'pend-atras')}${bloco('Hoje', hojeL)}
    ${Object.keys(porDia).sort().map(d => bloco(rotuloDia(d), porDia[d])).join('')}
    ${bloco('Sem data', sem)}
    ${!ab.length ? '<section class="cartao"><p class="fraco" style="margin:0">Nenhuma pendência. Aproveite!</p></section>' : ''}
    ${feitas.length ? `<details class="cartao"><summary><strong>Feitas recentemente</strong> <span class="fraco">(${feitas.length})</span></summary>${feitas.map(itemPend).join('')}</details>` : ''}`;
}

function modalPend(p) {
  const novo = !p; p ||= { titulo: '', dia: ui.pendDia || '', hora: '', alerta: 10, repete: '', cat: '', nota: '', prio: false };
  abrirModal(`<div class="entre"><h2>${novo ? 'Nova pendência' : 'Pendência'}</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
    <label class="campo">O que é<input type="text" id="p-titulo" value="${esc(p.titulo)}" placeholder="Ex.: Consulta no dentista"></label>
    <div class="linha"><label class="campo" style="flex:1 1 160px">Dia<input type="date" id="p-dia" value="${esc(p.dia)}"></label><label class="campo" style="flex:1 1 120px">Hora<input type="time" id="p-hora" value="${esc(p.hora)}"></label></div>
    <div class="linha"><label class="campo" style="flex:1 1 160px">Avisar<select id="p-alerta">${ALERTAS.map(([v, t]) => `<option value="${v}" ${p.alerta === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo" style="flex:1 1 160px">Repetir<select id="p-repete">${REPETE.map(([v, t]) => `<option value="${v}" ${p.repete === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <div class="coluna" style="gap:8px"><span class="rotulo">tipo</span><div class="linha">${CATS_PEND.map(c => `<button type="button" class="chip" data-acao="pendCat" data-v="${c}" aria-pressed="${p.cat === c}">${c}</button>`).join('')}</div></div>
    <label class="campo">Anotação<textarea id="p-nota" style="min-height:70px">${esc(p.nota)}</textarea></label>
    <label class="linha" style="gap:8px"><input type="checkbox" id="p-prio" ${p.prio ? 'checked' : ''} style="width:22px;height:22px"> Importante ★</label>
    <div class="linha"><button class="botao" data-acao="pendSalvar" data-id="${novo ? '' : p.id}">Salvar</button>
      ${novo ? '' : `<button class="botao claro" data-acao="pendICS" data-id="${p.id}">Levar para o Calendário</button><button class="link" data-acao="pendApagar" data-id="${p.id}">Apagar</button>`}</div>`);
  ui.pendCat = p.cat;
}

const normPend = d => ({ titulo: String(d.titulo || '').trim().slice(0, 140), dia: okData(d.dia) ? d.dia : '', hora: /^\d{1,2}:\d{2}$/.test(d.hora || '') ? d.hora.padStart(5, '0') : '',
  alerta: d.alerta == null || isNaN(+d.alerta) ? 10 : +d.alerta, repete: ['diaria', 'semanal', 'mensal'].includes(d.repete) ? d.repete : '', cat: CATS_PEND.includes(d.cat) ? d.cat : '', nota: String(d.nota || ''), prio: !!d.prio });
function criarPend(d) { const p = { id: uid(), feito: false, ...normPend(d) }; if (p.titulo) S.pend.push(p); return p; }

// ---------- calendário (.ics): o jeito de receber aviso com o app fechado ----------
const icsTxt = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
function icsEvento(p) {
  const d8 = p.dia.replace(/-/g, ''), L = ['BEGIN:VEVENT', `UID:${p.id}@rotina`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`];
  if (p.hora) { const [hh, mm] = p.hora.split(':').map(Number), fim = hh * 60 + mm + 30; L.push(`DTSTART:${d8}T${pad(hh)}${pad(mm)}00`, `DTEND:${d8}T${pad(Math.floor(fim / 60) % 24)}${pad(fim % 60)}00`); }
  else L.push(`DTSTART;VALUE=DATE:${d8}`, `DTEND;VALUE=DATE:${somaDias(p.dia, 1).replace(/-/g, '')}`);
  L.push(`SUMMARY:${icsTxt(p.titulo)}`); if (p.nota) L.push(`DESCRIPTION:${icsTxt(p.nota)}`);
  if (p.repete) L.push('RRULE:FREQ=' + { diaria: 'DAILY', semanal: 'WEEKLY', mensal: 'MONTHLY' }[p.repete]);
  if (p.alerta >= 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsTxt(p.titulo)}`, `TRIGGER:-PT${p.hora ? p.alerta : p.alerta + 0}M`, 'END:VALARM');
  L.push('END:VEVENT'); return L.join('\r\n');
}
async function entregarIcs(lista, nome) {
  const ok = lista.filter(p => p.dia); if (!ok.length) { ui.iaMsg = 'Dê um dia à pendência para levar ao Calendário.'; fecharModal(); render(); return; }
  const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rotina//PT', 'CALSCALE:GREGORIAN', ...ok.map(icsEvento), 'END:VCALENDAR'].join('\r\n');
  const arq = new File([txt], nome + '.ics', { type: 'text/calendar' });
  try { if (navigator.canShare?.({ files: [arq] })) { await navigator.share({ files: [arq], title: nome }); return; } } catch { }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/calendar' })); a.download = nome + '.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- avisos com o app aberto ----------
function mostrarAvisoPend(p) {
  let box = $('#avisos'); if (!box) { box = document.createElement('div'); box.id = 'avisos'; document.body.appendChild(box); }
  const el = document.createElement('div'); el.className = 'aviso-pend';
  el.innerHTML = `<div><strong>🔔 ${esc(p.titulo)}</strong><br><span class="fraco">${p.hora ? 'às ' + p.hora : 'hoje'}${p.nota ? ' · ' + esc(p.nota) : ''}</span></div>
    <div class="linha"><button class="botao" data-aviso="feito">Feita</button><button class="botao claro" data-aviso="soneca">Daqui a 10 min</button><button class="x" data-aviso="fechar" aria-label="Fechar">×</button></div>`;
  el.addEventListener('click', e => {
    const a = e.target.dataset.aviso; if (!a) return;
    if (a === 'feito') ACOES.pendFeito({ dataset: { id: p.id }, checked: true }); if (a === 'soneca') { p.soneca = Date.now() + 600000; salvar(); }
    el.remove();
  });
  box.appendChild(el);
  try { if (typeof audio !== 'undefined' && audio) bip(); } catch { }
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const op = { body: p.hora ? 'às ' + p.hora : 'hoje', tag: p.id, icon: 'icone-192.png' };
      navigator.serviceWorker?.ready.then(r => r.showNotification(p.titulo, op)).catch(() => new Notification(p.titulo, op));
    }
  } catch { }
}
function checarPend() {
  const agora = Date.now(); let mudou = false;
  for (const p of S.pend) {
    if (p.feito || !p.dia || !(p.alerta >= 0)) continue;
    const alvo = dtPend(p), chave = p.dia + 'T' + (p.hora || ''), quando = alvo - p.alerta * 60000;
    const soneca = p.soneca && agora >= p.soneca;
    if ((agora >= quando && agora < alvo + 6 * 3600000 && p.avisado !== chave) || soneca) { p.avisado = chave; p.soneca = 0; mudou = true; mostrarAvisoPend(p); }
  }
  if (mudou) salvar();
}
setInterval(checarPend, 20000); document.addEventListener('visibilitychange', () => { if (!document.hidden) checarPend(); });
document.addEventListener('pointerdown', () => { try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); } catch { } }, { once: true });

// ---------- tempos à mão e metas (Ajustes) ----------
function tempoEditorHtml(a) {
  const { t, q } = tempoDe(a);
  return `<details class="tempo-man"><summary class="link">Definir o tempo à mão</summary>
    <div class="linha"><label class="campo" style="flex:1 1 130px">Teoria (min)<input type="number" id="t-teoria" min="10" max="400" value="${t}"></label><label class="campo" style="flex:1 1 130px">Questões<input type="number" id="t-q" min="0" max="200" value="${q}"></label></div>
    <div class="linha"><button class="botao claro" data-acao="tempoManual" data-id="${a.id}">Salvar meu tempo</button>${a.manual || a.calibrado ? `<button class="link" data-acao="tempoAuto" data-id="${a.id}">Voltar ao automático</button>` : ''}</div></details>`;
}
function ajustesQuestoesHtml() {
  const mats = Object.keys(MIN_Q);
  return `<section class="cartao"><h2>Questões: tempo e metas</h2>
    <p class="fraco" style="margin:0">Quanto tempo você leva por questão e quantas quer fazer por dia em cada matéria. O tempo por questão entra no cálculo do tempo dos assuntos. Se deixar em branco, uso o valor automático (que aprende com as suas listas).</p>
    <div class="tab-metas"><span class="rotulo">matéria</span><span class="rotulo">min por questão</span><span class="rotulo">meta por dia</span>
    ${mats.map(m => `<span>${esc(m)}</span><input type="number" step="0.5" min="0.5" max="15" data-minq="${esc(m)}" value="${S.minQ[m] || ''}" placeholder="${(Math.round(minPorQ(m) * 10) / 10)}"><input type="number" min="0" max="500" data-metaq="${esc(m)}" value="${S.metaQ[m] ?? ''}" placeholder="${METAQ_PADRAO[m] ?? 0}">`).join('')}</div></section>`;
}

Object.assign(VIEWS, { pendencias: vPend });
Object.assign(ACOES, {
  pendRapida: async () => {
    const t = ($('#pend-rapido')?.value || ui.pendRapido || '').trim(); if (!t) return;
    ui.pendRapido = '';
    if (!temChaveIa()) { criarPend({ titulo: t }); salvar(); render(); return; }
    ui.carregando = 'Entendendo a pendência…'; render();
    try {
      const d = new Date(), r = await chamarIa(`Hoje é ${dataLonga(hoje())} (${hoje()}, ${SEMANA[d.getDay()]}), agora ${agoraHm()}. Transforme em uma pendência: "${t}". Responda SÓ com JSON: {"titulo":"curto, sem a data e a hora","dia":"AAAA-MM-DD ou null","hora":"HH:MM ou null","alerta":10,"repete":"","cat":"Saúde|Casa|Pessoal|Estudos|Compras|Outros","prio":false}
"alerta" = minutos de antecedência do aviso (-1 sem aviso; padrão 10; se ela pediu "1 hora antes" use 60). "repete" = "diaria", "semanal", "mensal" ou "". Datas relativas (amanhã, quinta, semana que vem) viram AAAA-MM-DD.`, 600, [], 'texto');
      const p = criarPend(r.titulo ? r : { titulo: t }); ui.iaMsg = p.dia ? `Anotado: ${p.titulo}, ${rotuloDia(p.dia)}${p.hora ? ' às ' + p.hora : ''}.` : `Anotado: ${p.titulo}.`;
    } catch { criarPend({ titulo: t }); ui.iaMsg = 'A IA não respondeu; guardei só o título. Toque nele para colocar dia e hora.'; }
    salvar(); ui.carregando = ''; render();
  },
  pendNova: () => modalPend(null),
  pendEditar: el => { const p = S.pend.find(x => x.id === el.dataset.id); if (p) modalPend(p); },
  pendCat: el => { ui.pendCat = ui.pendCat === el.dataset.v ? '' : el.dataset.v; document.querySelectorAll('[data-acao="pendCat"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === ui.pendCat)); },
  pendSalvar: el => {
    const t = $('#p-titulo').value.trim(); if (!t) return;
    const d = { titulo: t, dia: $('#p-dia').value, hora: $('#p-hora').value, alerta: +$('#p-alerta').value, repete: $('#p-repete').value, cat: ui.pendCat || '', nota: $('#p-nota').value.trim(), prio: $('#p-prio').checked };
    if (el.dataset.id) { const p = S.pend.find(x => x.id === el.dataset.id); if (p) { Object.assign(p, normPend(d)); p.avisado = ''; } } else criarPend(d);
    salvar(); fecharModal(); render();
  },
  pendApagar: el => { S.pend = S.pend.filter(x => x.id !== el.dataset.id); salvar(); fecharModal(); render(); },
  pendFeito: el => {
    const p = S.pend.find(x => x.id === el.dataset.id); if (!p) return;
    if (el.checked && p.repete && p.dia) { p.dia = p.repete === 'diaria' ? somaDias(p.dia, 1) : p.repete === 'semanal' ? somaDias(p.dia, 7) : iso(new Date(deIso(p.dia).setMonth(deIso(p.dia).getMonth() + 1))); p.avisado = ''; ui.iaMsg = `Feita! Próxima: ${rotuloDia(p.dia)}.`; }
    else { p.feito = el.checked; p.feitoEm = el.checked ? hoje() : null; }
    salvar(); render();
  },
  pendICS: el => { const p = S.pend.find(x => x.id === el.dataset.id); if (p) entregarIcs([p], 'pendencia'); },
  pendICSTodas: () => entregarIcs(pendAbertas().filter(p => p.dia && p.dia >= hoje()), 'pendencias-rotina'),
  pendPermissao: async () => { try { await Notification.requestPermission(); } catch { } render(); },
  tempoManual: el => {
    const a = achar(el.dataset.id), t = Math.round(+$('#t-teoria').value), q = Math.round(+$('#t-q').value);
    if (a && t >= 5 && q >= 0) { a.teoria = t; a.q = q; a.calibrado = true; a.manual = true; salvar(); }
    fecharModal(); ui.iaMsg = 'Tempo definido por você. A IA não vai mexer neste assunto.'; render();
  },
  tempoAuto: el => { const a = achar(el.dataset.id); if (a) { delete a.teoria; delete a.q; delete a.manual; a.calibrado = false; salvar(); } fecharModal(); render(); },
});

document.addEventListener('change', e => {
  const el = e.target, v = el.value === '' ? null : +el.value;
  if (el.dataset.minq) { if (v > 0) S.minQ[el.dataset.minq] = v; else delete S.minQ[el.dataset.minq]; salvar(); }
  if (el.dataset.metaq) { if (v != null && v >= 0) S.metaQ[el.dataset.metaq] = v; else delete S.metaQ[el.dataset.metaq]; salvar(); }
});
render(); setTimeout(checarPend, 1500);
