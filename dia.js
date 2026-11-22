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
  const jan = (d.agenda || []).filter(x => x.tipo === 'estudo' && hm(x.inicio) != null && hm(x.fim) != null).map((x, idx) => ({ idx, ini: hm(x.inicio), fim: hm(x.fim), titulo: x.titulo })).sort((a, b) => a.ini - b.ini);
  d.blocos.forEach(b => { b.sug = null; b.janelas = []; });
  if (!jan.length) return;
  let w = 0, t = jan[0].ini;
  for (const b of d.blocos) {
    if (typeof blocoConcluido === 'function' ? blocoConcluido(b) : (achar(b.assuntoId)?.feito || b.passos?.every(p => p.ok))) continue;
    while (w < jan.length && jan[w].fim - t < 15) { w++; t = jan[w]?.ini; }
    if (w >= jan.length) break;
    b.sug = hmStr(t);
    let falta = Math.round((b.min || 30) / 0.8);
    while (falta > 0 && w < jan.length) {
      const livre = jan[w].fim - t;
      const uso = Math.min(falta, livre);
      b.janelas.push({ idx: jan[w].idx, ini: hmStr(t), fim: hmStr(t + uso), min: Math.round(uso * 0.8) });
      if (falta <= livre) { t += falta; falta = 0; }
      else { falta -= livre; w++; t = jan[w]?.ini; }
    }
  }
}
window.sugerirHorarios = sugerirHorarios;

/** "Dividir": só para assunto de conteúdo grande (2h ou mais) e ainda não feito; abre uma linha com 2, 3 ou 4 sessões. */
const podeDividir = b => { const a = b.tipo !== 'revisao' && b.assuntoId && achar(b.assuntoId); return !!a && ehConteudo(a) && !a.feito && !blocoConcluido(b) && minDe(a) >= 120; };
window.btnDividir = b => podeDividir(b) ? `<button type="button" class="chip" data-acao="dividirBloco" data-b="${b.id}" title="Dividir este assunto em sessões menores">Dividir</button>` : '';
window.divisorHtml = b => ui.divB === b.id && podeDividir(b)
  ? `<div class="linha" style="gap:6px;flex-wrap:wrap;align-items:center"><span class="fraco" style="font-size:13px">Dividir em quantas sessões?</span>${[2, 3, 4].filter(n => minDe(achar(b.assuntoId)) / n >= 55).map(n => `<button type="button" class="chip" data-acao="dividirEm" data-b="${b.id}" data-n="${n}">${n}</button>`).join('')}<button type="button" class="link" data-acao="dividirBloco" data-b="${b.id}">cancelar</button></div>` : '';

/** Botões de cada assunto sugerido num turno de estudo da programação: questões no app (se o assunto tem), trocar o assunto e tirar. */
function botoesBlocoAg(b, data) {
  const a = b.assuntoId && achar(b.assuntoId), dia = `data-dia="${esc(data)}"`;
  if (b.tipo === 'questoes') return `${b.qAssunto ? `<button type="button" class="chip" data-acao="qDoAssunto" data-id="${b.qAssunto}" data-b="${b.id}" title="Resolver as questões no app">Questões</button>` : ''}<button type="button" class="chip" data-acao="trocarAssunto" data-b="${b.id}" ${dia}>Trocar</button><button type="button" class="x-mini" data-acao="tirarBloco" data-b="${b.id}" title="Tirar do dia">×</button>`;
  const temQ = b.tipo === 'revisao' ? (b.revisao || []).length
    : a && (typeof ehConteudo === 'function' && ehConteudo(a) || typeof ehHabitoQ === 'function' && ehHabitoQ(a));
  const q = !temQ ? '' : b.tipo === 'revisao'
    ? `<button type="button" class="chip" data-acao="qDaRevisao" data-b="${b.id}" title="Resolver questões deste assunto no app">Questões</button>`
    : `<button type="button" class="chip" data-acao="qDoAssunto" data-id="${a.id}" data-b="${b.id}" title="Resolver questões deste assunto no app">Questões</button>`;
  const troca = b.tipo === 'revisao'
    ? `<button type="button" class="chip" data-acao="revEscolher" data-b="${b.id}">Trocar</button>`
    : `<button type="button" class="chip" data-acao="trocarAssunto" data-b="${b.id}" ${dia}>Trocar</button>`;
  return `${q}${troca}${window.btnDividir(b)}<button type="button" class="x-mini" data-acao="tirarBloco" data-b="${b.id}" title="Tirar este assunto do dia">×</button>`;
}

/** Janela para escolher outro assunto no lugar do que foi sugerido (do plano dela, com busca e filtro por matéria). */
function modalTrocarAssunto(bId, dia = hoje()) {
  const d = diaDe(dia), b = (d.blocos || []).find(x => x.id === bId); if (!b) return;
  const fila = filaParaHoje(d.blocos).filter(a => a.id !== b.assuntoId);
  const mats = [...new Set(fila.map(a => a.materia).filter(Boolean))];
  const mat = ui.trocaMat || '', qb = normBusca(ui.trocaQ || '');
  const lista = fila.filter(a => (!mat || a.materia === mat) && (!qb || normBusca(`${a.titulo} ${a.materia}`).includes(qb))).slice(0, 40);
  const dd = `data-dia="${esc(dia)}"`;
  abrirModal(`<div class="entre"><h2>Trocar o assunto</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
    <p class="fraco" style="margin:0">Agora está: <strong>${esc(b.titulo)}</strong>. Escolha o que quer estudar no lugar:</p>
    <div class="linha" style="gap:6px;flex-wrap:wrap">${mats.map(m => `<button class="chip" data-acao="trocaMat" data-v="${esc(m)}" data-b="${b.id}" ${dd} aria-pressed="${mat === m}">${esc(m)}</button>`).join('')}</div>
    <div class="linha"><input type="search" id="troca-q" placeholder="Buscar assunto…" value="${esc(ui.trocaQ || '')}" style="flex:1;min-width:140px"><button class="botao claro" data-acao="trocaBuscar" data-b="${b.id}" ${dd}>Buscar</button></div>
    <div class="coluna" style="gap:6px;max-height:48vh;overflow:auto">${lista.map(a => `<button class="item" style="${cor(a.materia)}" data-acao="trocarPara" data-b="${b.id}" data-id="${a.id}" ${dd}><i class="ponto"></i><span>${esc(a.titulo)} <span class="fraco" style="font-size:12px">· ${a.materia ? esc(a.materia) + ' · ' : ''}${fmtMin(minDe(a))}${a.dia && a.dia <= hoje() ? ' · pedido para hoje' : ''}</span></span></button>`).join('') || '<p class="fraco" style="margin:0">Nenhum assunto encontrado.</p>'}</div>
    <details><summary class="fraco">Ou escreva outro assunto</summary>
      <div class="coluna" style="gap:8px;margin-top:8px"><input type="text" id="troca-livre" maxlength="120" placeholder="Ex.: Geometria espacial: prismas">
        <select id="troca-livre-m"><option value="">Matéria (opcional)</option>${Object.keys(MATERIAS).map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select>
        <button class="botao" data-acao="trocaLivre" data-b="${b.id}" ${dd}>Usar este assunto</button></div></details>`);
}

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
  if (!temComHora && !d.semAgenda && (d.horas > 0 || d.blocos?.length)) {
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

/** Parser local por atividades (usado sem IA): acha almoço, jantar, treino e tarefas soltas, liga a cada uma a hora e a duração mais próximas
    ("1h de jantar", "19h", "final da tarde", "40 min") e encaixa num horário livre o que veio sem horário. */
function parsearAtividadesLocal(texto, agoraMin, ehHoje) {
  const orig = String(texto || '').toLowerCase();
  let t = '', mapa = [];   // t = sem acentos; mapa = posição de cada letra no texto original
  for (let i = 0; i < orig.length; i++) { const n = orig[i].normalize('NFD').replace(/\p{M}/gu, ''); for (const c of n) { t += c; mapa.push(i); } }
  const defs = [
    { re: /\balmoc\w*/g, tipo: 'refeicao', tit: 'Almoço', dur: 60, ini: 12 * 60 + 30, tarde: false },
    { re: /\bjant\w*/g, tipo: 'refeicao', tit: 'Jantar', dur: 60, ini: 19 * 60 + 30, tarde: true },
    { re: /\b(?:trein\w*|academia|corrida|pilates|natac\w*|musculac\w*|caminhad\w*)/g, tipo: 'exercicio', tit: 'Treino', dur: 60, ini: 18 * 60, tarde: true },
    { re: /\b(?:arrum|lav|limp|organiz|resolv|compr|pag|mercado|banco|dentista|medic|cabeleir|unha|lavand)\w*(?:(?!\s+e\s)[^,.;\d])*/g, tipo: 'compromisso', tit: '', dur: 30, ini: 14 * 60 + 30, tarde: false },
  ];
  const acts = [];
  for (const d of defs) for (const m of t.matchAll(d.re)) {
    let fim = m.index + m[0].length; if (d.tit === '') { while (fim > m.index && (/\s/.test(t[fim - 1]) || /\s(?:as|a|ao|no|na|em|para|pra|por|de|do|da)$/.test(t.slice(m.index, fim)))) fim--; }
    const titulo = d.tit || (() => { const s = orig.slice(mapa[m.index], mapa[fim - 1] + 1).trim(); return s ? s[0].toUpperCase() + s.slice(1) : 'Tarefa'; })();
    acts.push({ ...d, titulo: titulo.slice(0, 60), a: m.index, b: fim, tempo: null, durMin: null, per: null });
  }
  if (!acts.length) return [];
  acts.sort((x, y) => x.a - y.a);
  // fichas de hora, duração e período
  const fichas = [];
  const reTok = /(\d{1,2}):(\d{2})|\bas\s+(\d{1,2})\b(?!\s*(?:h|min|horas?)|:)|(\d{1,2})\s*(?:h|horas?)(?:\s*(?:e\s*)?(\d{1,2})\s*(?:min\w*)?)?(?![a-z])|(\d{1,3})\s*min\w*/g;
  for (const m of t.matchAll(reTok)) {
    const a = m.index, b = a + m[0].length, antes = t.slice(Math.max(0, a - 14), a), depois = t.slice(b, b + 6);
    if (m[1] != null) fichas.push({ k: 't', v: +m[1] * 60 + +m[2], a, b });
    else if (m[3] != null) fichas.push({ k: 't', v: +m[3] * 60, a, b });
    else if (m[4] != null) {
      const n = +m[4], mm = +(m[5] || 0), comAs = /(?:\bas|\bdas|a partir das|ate as)\s*$/.test(antes);
      const hora = comAs || (n >= 6 && n <= 23 && !/^\s*(?:de|do)\s/.test(depois) && !/(?:\bpor|durante|\buns|\bmais)\s*$/.test(antes));
      if (hora && n < 24) fichas.push({ k: 't', v: n * 60 + mm, a, b }); else fichas.push({ k: 'd', v: n * 60 + mm, a, b });
    } else if (m[6] != null) fichas.push({ k: 'd', v: +m[6], a, b });
  }
  for (const m of t.matchAll(/final da tarde|fim da tarde|inicio da tarde|comecinho da tarde|de manha|manha|de tarde|tarde|de noite|noite/g)) {
    const w = m[0], v = /final|fim/.test(w) ? 17 * 60 : /inicio|comecinho/.test(w) ? 13 * 60 + 30 : /manha/.test(w) ? 9 * 60 : /tarde/.test(w) ? 15 * 60 : 20 * 60;
    fichas.push({ k: 'p', v, a: m.index, b: m.index + w.length });
  }
  // liga cada ficha à atividade mais próxima (a mais perto de cada tipo ganha primeiro; "1h de jantar" tem prioridade)
  const pares = [];
  for (const f of fichas) for (const ac of acts) {
    const entre = f.b <= ac.a ? t.slice(f.b, ac.a) : '';
    const explicito = f.k === 'd' && f.b <= ac.a && /^\s*(?:de|do|da)\s+(?:o\s+|a\s+)?$/.test(entre);
    // distância = letras entre os dois, sem contar outras fichas nem palavrinhas de ligação ("às", "por", "de"...)
    const gap = (de, ate) => { let s = ''; for (let i = de; i < ate; i++) if (!fichas.some(o => o !== f && i >= o.a && i < o.b)) s += t[i]; return s.replace(/\b(?:as|a|ao|no|na|em|por|de|do|da|durante|uns|mais|para|pra)\b/g, '').replace(/\s+/g, '').length; };
    const dist = explicito ? -1 : f.a >= ac.b ? gap(ac.b, f.a) : gap(f.b, ac.a) * 1.5;
    if (dist >= -1) pares.push({ f, ac, dist });
  }
  pares.sort((x, y) => x.dist - y.dist);
  const usada = new Set();
  for (const { f, ac } of pares) {
    if (usada.has(f)) continue;
    const campo = f.k === 't' ? 'tempo' : f.k === 'd' ? 'durMin' : 'per';
    if (ac[campo] != null) continue;
    ac[campo] = f.v; usada.add(f);
  }
  // a mesma coisa citada duas vezes (ex.: "jantar 19h ... 1h de jantar") vira uma só, juntando o que cada citação trouxe
  const unicas = [];
  for (const ac of acts) {
    const igual = ac.tit ? unicas.find(u => u.tit === ac.tit) : null;
    if (!igual) { unicas.push(ac); continue; }
    for (const c of ['tempo', 'durMin', 'per']) if (igual[c] == null) igual[c] = ac[c];
  }
  // encaixe
  const colocados = [], livre = (i, f) => !colocados.some(c => i < c.f && f > c.i);
  const lista = unicas.map(ac => {
    let ini = ac.tempo ?? ac.per, explicito = ini != null;
    if (ac.tempo != null && ac.tarde && ini < 12 * 60) ini += 12 * 60;
    return { ac, ini: ini ?? ac.ini, dur: ac.durMin || ac.dur, explicito };
  });
  for (const x of lista.sort((p, q) => (q.ac.tempo != null) - (p.ac.tempo != null))) {
    let i = x.ini; const piso = ehHoje ? agoraMin : 6 * 60;
    if (!x.explicito && i < piso) i = piso;
    if (!livre(i, i + x.dur)) {
      let achou = false;
      for (let s = i; s + x.dur <= 22 * 60 + 30; s += 10) if (s >= piso && livre(s, s + x.dur)) { i = s; achou = true; break; }
      if (!achou) for (let s = i; s >= piso; s -= 10) if (livre(s, s + x.dur)) { i = s; break; }
    }
    colocados.push({ i, f: Math.min(1439, i + x.dur), ac: x.ac });
  }
  return colocados.map(c => ({ inicio: hmStr(c.i), fim: hmStr(c.f), titulo: c.ac.titulo, tipo: c.ac.tipo }));
}

/** Parser local para montar a agenda mesmo sem chave de IA ou se ela quiser resposta imediata ao digitar horários. */
function parsearDiaLocal(texto, horas, agoraMin, ehHoje = true) {
  const ag = [], txt = String(texto || '');
  const temJanela = [...txt.matchAll(/(?:das?|de)?\s*(\d{1,2})(?:h|:)?(\d{2})?\s*(?:às|as|a|até|[-–—])\s*(\d{1,2})(?:h|:)?(\d{2})?/ig)]
    .some(m => { const i = +m[1] * 60 + +(m[2] || 0), f = +m[3] * 60 + +(m[4] || 0); return +m[1] < 24 && +m[3] < 24 && f > i; });
  if (!temJanela) { const porAtiv = parsearAtividadesLocal(txt, agoraMin, ehHoje); if (porAtiv.length) return tratarAgenda(porAtiv, agoraMin, texto, ehHoje, horas); }
  // divide por vírgula/ponto/quebra ou " e " quando começa outra atividade (mas preserva "das X às Y e das Z às W" juntos)
  const Partes = txt.split(/[,.;\n]+|(?:\s+e\s+(?!(?:das?|de)\s*\d)(?=[a-zà-ú]+\s+(?:às|as|das|de|\d)))/i);
  const parseH = (h, m) => (+h < 24 && +(m || 0) < 60 ? +h * 60 + +(m || 0) : null);
  const reIntG = /(?:das?|de)?\s*(\d{1,2})(?:h|:)?(\d{2})?\s*(?:às|as|a|até|[-–—])\s*(\d{1,2})(?:h|:)?(\d{2})?/ig;
  let ultTipo = '';
  for (const p of Partes) {
    const s = p.trim(); if (!s) continue;
    const ints = [...s.matchAll(reIntG)].map(m => [parseH(m[1], m[2]), parseH(m[3], m[4])]).filter(([i, f]) => i != null && f != null && f > i);
    const faixas = ints.length ? ints : (() => {
      const mHora = /(?:às|as|a partir das?|das?|de)?\s*(\d{1,2})(?:h|:)(\d{2})?/i.exec(s);
      if (!mHora) return [];
      const ini = parseH(mHora[1], mHora[2]);
      return ini != null ? [[ini, Math.min(1439, ini + (/estudo|estudar/i.test(s) ? 120 : 60))]] : [];
    })();
    if (!faixas.length) continue;
    let tipo = 'compromisso';
    let tit = s.replace(reIntG, '').replace(/(?:às|as|a partir das?|das?|de)?\s*\d{1,2}(?:h|:)?\d{0,2}/ig, '').replace(/^(?:e\s+|vou\s+|tenho\s+)+/i, '').replace(/^[\s,:-]+|[\s,:-]+$/g, '');
    if (/dormir|sono|deitar/i.test(s)) { tipo = 'outro'; tit = 'Dormir'; }
    else if (/treino|academia|corrida|pilates|natac|musculac|exerc|esporte|caminhada/i.test(s)) { tipo = 'exercicio'; tit = tit || 'Treino'; }
    else if (/estud/i.test(s)) { tipo = 'estudo'; tit = 'Bloco de estudo'; }
    else if (/almoc|janta|cafe|lanche|refeic/i.test(s)) { tipo = 'refeicao'; tit = tit || 'Refeição'; }
    else if (/aula|cursinho|faculdade|trabalh|plantao/i.test(s)) { tipo = 'trabalho'; tit = tit || 'Aula / compromisso'; }
    else if (/descans|pausa|cochilo/i.test(s)) { tipo = 'pausa'; tit = tit || 'Pausa'; }
    else if (/lazer|filme|sair|namorad/i.test(s)) { tipo = 'lazer'; tit = tit || 'Lazer'; }
    else if (!tit && ultTipo === 'estudo') { tipo = 'estudo'; tit = 'Bloco de estudo'; }
    ultTipo = tipo;
    tit = tit ? tit[0].toUpperCase() + tit.slice(1) : TIPOS_DIA[tipo];
    for (const [ini, fim] of faixas) ag.push({ inicio: hmStr(ini), fim: hmStr(fim), titulo: tit.slice(0, 80), tipo });
  }
  return tratarAgenda(ag, agoraMin, texto, ehHoje, horas);
}

/** Higieniza e completa a agenda:
   1. Detecta horário de dormir para ser o encerramento do dia (remove bloco de 'dormir' como tarefa).
   2. Se a usuária informou janelas explícitas de estudo, respeita exatamente essas janelas (subtraindo compromissos).
   3. Caso contrário, preenche os intervalos vagos respeitando `horasLivres` (se informado), com pausas de 10 min em blocos longos. */
function tratarAgenda(lista, agoraMin, textoUsuario = '', ehHoje = true, horasLivres = 0) {
  const ag = [];
  const txt = String(textoUsuario || '');

  // 1. Horário de dormir (fim do dia de estudo)
  let fimDia = 23 * 60; // padrão 23:00
  const mSono = /(?:dormir|sono|deitar)\s*(?:[àa]s|as|de|das)?\s*(\d{1,2})(?:h|:)?(\d{2})?/i.exec(txt);
  if (mSono) {
    const h = +mSono[1], m = +(mSono[2] || 0);
    if (h < 24 && m < 60) fimDia = h * 60 + m;
  }
  for (const x of Array.isArray(lista) ? lista : []) {
    if (/dormir|sono|deitar/i.test(x.titulo || '')) {
      const f = hm(x.inicio) ?? hm(x.fim);
      if (f != null && f >= 12 * 60) fimDia = f;
    }
  }

  const pediuLazer = /lazer|descans|folga|filme|sair|namorad|livre/i.test(txt);
  const pisoInicio = ehHoje ? agoraMin : 480;

  // 2. Separa compromissos reais e janelas explícitas de estudo
  const fixos = [], estudosExplic = [];
  for (const x of Array.isArray(lista) ? lista : []) {
    let i = hm(x.inicio), f = hm(x.fim); if (i == null || f == null) continue;
    if (f <= i) f = Math.min(1439, f + 1440);
    const tipo = TIPOS_DIA[x.tipo] ? x.tipo : 'outro';
    if (/dormir|sono|deitar/i.test(x.titulo || '')) continue;
    if (ehHoje && f <= agoraMin) continue; // já passou
    if (!pediuLazer && (tipo === 'lazer' || /tempo livre|descanso|prepara[cç][aã]o/i.test(x.titulo || ''))) continue;
    if (ehHoje && i < agoraMin) i = agoraMin;
    if (f <= i) continue;
    if (tipo === 'estudo') { estudosExplic.push([i, Math.min(f, fimDia)]); continue; }
    fixos.push({ inicio: hmStr(i), fim: hmStr(f), titulo: String(x.titulo || TIPOS_DIA[tipo]).slice(0, 80), tipo });
  }

  fixos.sort((a, b) => hm(a.inicio) - hm(b.inicio));
  if (fixos.length) {
    const ultFim = hm(fixos[fixos.length - 1].fim);
    if (ultFim != null && ultFim > fimDia) fimDia = Math.min(1439, ultFim + 30);
  }

  let blocoIdx = 1;
  let restaMin = horasLivres > 0 ? Math.round(horasLivres * 60) : Infinity;

  const inserirEstudo = (de, ate) => {
    let pos = de;
    while (ate - pos >= 20 && restaMin >= 20) {
      const disp = Math.min(ate - pos, restaMin);
      if (disp <= 100) {
        ag.push({ inicio: hmStr(pos), fim: hmStr(pos + disp), titulo: `Estudo - Bloco ${blocoIdx++}`, tipo: 'estudo' });
        restaMin -= disp;
        pos += disp;
        break;
      }
      const nBlocos = Math.ceil((disp + 10) / 95);
      const tam = Math.min(85, Math.max(45, Math.floor((disp - 10 * (nBlocos - 1)) / nBlocos)));
      ag.push({ inicio: hmStr(pos), fim: hmStr(pos + tam), titulo: `Estudo - Bloco ${blocoIdx++}`, tipo: 'estudo' });
      restaMin -= tam;
      pos += tam;
      if (ate - pos >= 30 && restaMin >= 20) {
        ag.push({ inicio: hmStr(pos), fim: hmStr(pos + 10), titulo: 'Pausa rápida', tipo: 'pausa' });
        pos += 10;
      }
    }
  };

  // Subtrai compromissos de uma lista de janelas [i, f]
  const subtrairFixos = janelas => {
    let res = janelas.filter(([i, f]) => f > i).sort((a, b) => a[0] - b[0]);
    for (const c of fixos) {
      const ci = hm(c.inicio), cf = hm(c.fim), prox = [];
      for (const [i, f] of res) {
        if (cf <= i || ci >= f) { prox.push([i, f]); continue; }
        if (ci > i) prox.push([i, ci]);
        if (cf < f) prox.push([cf, f]);
      }
      res = prox;
    }
    return res;
  };

  for (const c of fixos) ag.push(c);

  if (estudosExplic.length) {
    // usuária pediu janelas específicas de estudo: respeita exatamente essas janelas (sem encher até 23h)
    restaMin = Infinity;
    for (const [i, f] of subtrairFixos(estudosExplic)) inserirEstudo(i, f);
  } else {
    // sem janelas explícitas: preenche intervalos vagos até o teto de horasLivres (ou fimDia se não informado)
    const ini = Math.max(pisoInicio, ehHoje ? agoraMin : 480);
    for (const [i, f] of subtrairFixos([[ini, fimDia]])) {
      if (restaMin < 20) break;
      inserirEstudo(i, f);
    }
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
      ag = parsearDiaLocal('', horas, agoraMin, ehHoje);
      resposta = `${ehHoje ? 'Dia' : 'Amanhã'} montado com ${horas}h livres.`;
    } else if (!temChaveIa()) {
      ag = parsearDiaLocal(texto.trim() || basal, horas, agoraMin, ehHoje);
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
REGRA DE OURO: Ela é uma vestibulanda focada e quer render o máximo.
1. TODO O TEMPO LIVRE entre compromissos fixos e até a hora de dormir DEVE ser usado para estudo (tipo "estudo").
2. NUNCA invente blocos de "tempo livre", "lazer", "preparação" ou "descanso longo" por conta própria nos horários vagos. Se ela não pediu lazer ou descanso, aquele horário é ESTUDO.
3. Se ela citar horário de dormir (ex.: "dormir às 23:30"), esse é o término do dia: NÃO crie uma tarefa de "dormir" na agenda. Se não citar, assuma 23:00 (ou logo após o último compromisso).
4. Janelas de estudo contínuas maiores que 1h30 a 2h devem ter pausas curtas de 10 a 15 min (tipo "pausa").
5. Respeite pontualmente os compromissos fixos que ela citou (aula, treino, médico, refeições).
6. TUDO o que ela citou tem que aparecer na agenda, uma vez cada, com o nome que ela usou (almoço, jantar, treino, arrumar as roupas...). Nada some, nada é juntado com outra coisa.
7. DURAÇÃO: use exatamente a duração que ela disse ("1h", "40 min", "1h30"). Se não disse, use o normal: refeição 1h, treino 1h, tarefa curta 30 min.
8. REFEIÇÕES (almoço, jantar, café, lanche) são tipo "refeicao", no horário que ela disse.
9. TAREFA SEM HORÁRIO (ex.: "arrumar as roupas", "resolver coisas"): escolha você um horário livre, entre blocos de estudo, sem encostar em outro compromisso, com a duração que ela disse. Tipo "compromisso". Não a ignore.
10. HORÁRIO POR PERÍODO: "manhã" = 08:00 a 12:00; "início da tarde" = 13:00 a 15:00; "tarde" = 13:00 a 18:00; "final da tarde" = começa entre 16:30 e 18:00 e termina antes das 19:00; "noite" = 19:00 a 22:00. O bloco inteiro tem que caber no período.
11. NADA se sobrepõe: cada bloco começa quando o anterior termina (ou depois), e nada começa antes de "agora".
12. Antes de responder, confira a lista de tudo o que ela citou contra a agenda.
Responda SÓ com JSON: {"resposta":"2 frases curtas e gentis resumindo o dia","fator":1,"motivo":"curto","agenda":[{"inicio":"HH:MM","fim":"HH:MM","titulo":"...","tipo":"estudo|refeicao|exercicio|compromisso|trabalho|pausa|lazer|outro"}],"suposicoes":["o que você assumiu por falta de informação, curto"],"atualizar_rotina":"","materias_hoje":[]}
"materias_hoje": só se ela pediu matérias específicas para estudar nesse dia (ex.: "quero só matemática", "vou focar em química e física"), a lista com os nomes exatos entre ${[...Object.keys(MIN_Q), 'Redação'].join(', ')}; senão [].
"fator" vai de 0.5 a 1 (1 = energia normal; menos se ela disse que está cansada, dormiu mal, doente etc.). "atualizar_rotina" só se ela disse que algo mudou de vez (ex.: "agora acordo às 6h"): devolva a rotina base inteira já atualizada, senão deixe vazio.`, 8000);
        ag = tratarAgenda(r.agenda, agoraMin, texto.trim() || basal, ehHoje);
        d.suposicoes = (Array.isArray(r.suposicoes) ? r.suposicoes : []).map(x => String(x).slice(0, 120)).slice(0, 4);
        fator = Math.min(1, Math.max(0.5, +r.fator || 1)); resposta = String(r.resposta || '').trim();
        so = (Array.isArray(r.materias_hoje) ? r.materias_hoje : []).map(String);
        if (r.motivo && fator < 1) resposta += ` (${String(r.motivo).trim()})`;
        if (r.atualizar_rotina && String(r.atualizar_rotina).trim().length > 10) { S.perfil.horarios = String(r.atualizar_rotina).trim().slice(0, 1500); resposta += ' Atualizei a sua rotina base.'; }
      } catch (e) {
        ag = parsearDiaLocal(texto.trim() || basal, horas, agoraMin, ehHoje);
        resposta = `A IA não respondeu (${e.message}), então montei de um jeito mais simples e pode ter ficado menos certinho. Toque em montar de novo daqui a pouco para a IA refazer.`;
      }
      estudoMin = soma(ag.filter(x => x.tipo === 'estudo'), x => hm(x.fim) - hm(x.inicio));
      if (!estudoMin && horas > 0) { estudoMin = Math.round(horas * 60); ag.push({ inicio: '08:00', fim: hmStr(Math.min(1410, 480 + estudoMin)), titulo: `${horas}h livres para estudar`, tipo: 'estudo', min: estudoMin }); }
    }
    if (!estudoMin) throw new Error('não achei tempo livre para estudar. Conte mais sobre o dia ou informe as horas');
    // o que já passou na agenda anterior continua aparecendo (apagado), para ela ver o dia inteiro
    const passados = ehHoje ? (d.agenda || []).filter(x => hm(x.fim) != null && hm(x.fim) <= agoraMin && !ag.some(y => y.inicio === x.inicio && y.titulo === x.titulo)) : [];
    d.agenda = [...passados, ...ag]; d.semAgenda = false; d.fator = fator; d.horas = Math.round(estudoMin / 6) / 10; d.soQ = !!ui.soQ;
    d.contexto = [texto.trim(), horas > 0 ? `${horas}h livres` : ''].filter(Boolean).join(' · ') || 'rotina base';
    if (ehHoje) { montarHoje(Math.round(estudoMin * 0.8 * fator), so); sugerirHorarios(d); }
    else { d.cap = Math.round(estudoMin * 0.8 * fator); d.so = so; d.blocos = []; d.montado = false; }
    ui.desfazer = antes; ui.iaMsg = resposta || (ehHoje ? 'Dia montado.' : 'Amanhã montado.');
    ui.diaTexto = ''; ui.diaHoras = ''; ui.amanhaTexto = '';
    ui._desfazerGuard = true; salvar(); ui._desfazerGuard = false;
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
  const dosBlocos = x => d.blocos.filter(b => (b.janelas?.length ? b.janelas.some(j => j.ini >= x.inicio && j.ini < x.fim || (hm(j.fim) > hm(x.inicio) && hm(j.ini) < hm(x.fim))) : (b.sug && hm(b.sug) >= hm(x.inicio) && hm(b.sug) < hm(x.fim))));
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
    const encaixados = (d.blocos || []).filter(b => {
      if (b.janelas?.length) return b.janelas.some(j => j.idx === idxJan);
      return b.sug && hm(b.sug) >= ini && hm(b.sug) < fim;
    });
    // na última janela de estudo, mostra também assuntos pendentes que não couberam ou já concluídos
    if (idxJan === jan.length - 1) {
      const jaMostrados = new Set((d.blocos || []).filter(b => {
        if (b.janelas?.length) return b.janelas.some(j => j.idx < idxJan);
        return b.sug && jan.some(j => hm(b.sug) >= hm(j.inicio) && hm(b.sug) < hm(j.fim));
      }).map(b => b.id));
      const extras = (d.blocos || []).filter(b => !jaMostrados.has(b.id) && !encaixados.some(e => e.id === b.id));
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
        ${x.tipo === 'estudo' ? `<div class="ag-ass-lista">
          ${bs.length ? `<span class="fraco" style="font-size:12px">Sugestão para este turno (pode fazer em outra ordem):</span>
          ${bs.map(b => {
            const conc = typeof blocoConcluido === 'function' ? blocoConcluido(b) : !!b.feito;
            const pos = d.blocos.indexOf(b);
            const ehCont = b.janelas?.length && b.janelas[0].idx < jIdx;
            const sugTurno = b.janelas?.find(j => j.idx === jIdx)?.ini || b.sug;
            return `<div class="ag-ass-item ${conc ? 'feito' : ''} ${ehCont ? 'continua' : ''}" style="${cor(b.materia)}">
              <label class="linha" style="gap:6px;flex:1;min-width:160px;cursor:pointer">
                <input type="checkbox" data-acao="blocoFeito" data-b="${b.id}" ${conc ? 'checked' : ''}>
                ${sugTurno && !conc ? `<span class="ag-sug">~${sugTurno}</span>` : ''}
                ${b.materia ? `<span class="tag" style="${cor(b.materia)}">${esc(b.materia)}</span>` : ''}
                <span class="ag-ass-tit">${esc(b.titulo)}</span>
                ${ehCont ? '<span class="selo continua">↳ continuação</span>' : ''}
                <small class="${b.janelas?.length > 1 ? 'tempo-parte' : 'fraco'}">${(() => {
                  // assunto que passa de um turno para outro: mostra até onde chega neste turno ("1h34 de 2h58"), contando o que veio antes
                  const js = b.janelas || [], k = js.findIndex(j => j.idx === jIdx), tot = b.min || 30;
                  if (js.length < 2 || k < 0) return `(${fmtMin(tot)})`;
                  const ate = k === js.length - 1 ? tot : Math.min(tot, soma(js.slice(0, k + 1), j => j.min));
                  return `(${k ? `+${fmtMin(js[k].min)} · ` : ''}${fmtMin(ate)} de ${fmtMin(tot)}${k < js.length - 1 ? ' · continua no próximo turno ↓' : ''})`;
                })()}</small>
              </label>
              <div class="linha" style="gap:4px;flex-wrap:wrap">
                ${botoesBlocoAg(b, data)}
                <button type="button" class="ag-ord" data-acao="moverBloco" data-b="${b.id}" data-d="-1" ${pos <= 0 ? 'disabled' : ''} title="Subir na ordem">↑</button>
                <button type="button" class="ag-ord" data-acao="moverBloco" data-b="${b.id}" data-d="1" ${pos < 0 || pos >= d.blocos.length - 1 ? 'disabled' : ''} title="Descer na ordem">↓</button>
              </div>
              ${window.divisorHtml(b)}
            </div>`;
          }).join('')}` : `<span class="fraco" style="font-size:12px">Horário de estudo livre · complete pendências ou adiante matérias da semana abaixo.</span>`}
        </div>` : ''}
      </div></div>`;
  }).join('');

  const nv = ui.agNovoPreset || { inicio: hmStr(Math.ceil(agora / 15) * 15 % 1440), fim: hmStr((Math.ceil(agora / 15) * 15 + 60) % 1440), tipo: 'compromisso', titulo: '' };
  const aberto = ui.ab?.['prog-hoje'] !== false;
  return `<details class="cartao prog-hoje" data-k="prog-hoje" ${aberto ? 'open' : ''}>
    <summary><div class="entre" style="flex:1;flex-wrap:wrap;gap:8px">
      <div class="linha" style="gap:8px"><strong>🗓 Programação do seu dia</strong><span class="selo flexivel">tudo editável e flexível</span></div>
      <span class="fraco" style="font-size:13px">${(d.agenda || []).length} ${(d.agenda || []).length === 1 ? 'bloco' : 'blocos'} no dia · toque para ver ou mudar</span>
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
      ${d?.blocos?.length ? '<button class="botao contorno" data-acao="ir" data-v="hoje">Ver os assuntos de hoje</button>' : ''}
      ${temAg || d?.blocos?.length ? `<button class="botao contorno" data-acao="apagarDiaTodo" data-dia="${h}" title="Apaga a agenda e os assuntos de hoje para você montar outro dia. Dá para desfazer.">Apagar o dia e começar de novo</button>` : ''}
      ${temAg ? `<button class="link" data-acao="apagarPlanejamento" data-dia="${h}" title="Tira só os horários; os assuntos continuam na aba Hoje">Apagar só os horários</button>` : ''}</div>
    ${chavesOk ? '' : '<p class="fraco" style="margin:0;color:var(--tinta)">Sem chave de IA, só consigo usar as horas livres. Cole as chaves em Ajustes para eu entender o texto.</p>'}</section>`;
  const amanhaCartao = `<details class="cartao" data-k="amanha" ${ui.ab?.amanha || am?.agenda?.length ? 'open' : ''}><summary><strong>Planejar amanhã</strong> <span class="fraco">· ${dataLonga(amanha())}</span></summary>
    <div class="coluna" style="gap:12px;margin-top:12px">${am?.agenda?.length ? agendaHtml(am, amanha()) : ''}
    <p class="fraco" style="margin:0">${am?.agenda?.length ? 'Mudou algo para amanhã? Conte e eu refaço.' : 'Conte como vai ser amanhã e eu já deixo o dia montado. Se não escrever nada, uso a sua rotina base.'}</p>
    <textarea data-ui="amanhaTexto" placeholder="Ex.: amanhã acordo 6h30, aula até 12h, dentista às 16h, quero estudar mais matemática.">${esc(ui.amanhaTexto || '')}</textarea>
    <div class="linha"><button class="botao" data-acao="planejarAmanha">${am?.agenda?.length ? 'Refazer amanhã' : 'Montar amanhã'}</button>
      ${am?.agenda?.length || am?.blocos?.length ? `<button class="botao contorno" data-acao="apagarDiaTodo" data-dia="${amanha()}" title="Apaga a agenda de amanhã para você montar outra. Dá para desfazer.">Apagar amanhã e começar de novo</button>` : ''}</div></div></details>`;
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
  // trocar o assunto de um bloco do dia (o app sugeriu um assunto e ela quer outro)
  trocarAssunto: el => { ui.trocaMat = ''; ui.trocaQ = ''; modalTrocarAssunto(el.dataset.b, el.dataset.dia || hoje()); },
  trocaMat: el => { ui.trocaQ = $('#troca-q')?.value.trim() || ui.trocaQ || ''; ui.trocaMat = ui.trocaMat === el.dataset.v ? '' : el.dataset.v; modalTrocarAssunto(el.dataset.b, el.dataset.dia || hoje()); },
  trocaBuscar: el => { ui.trocaQ = $('#troca-q')?.value.trim() || ''; modalTrocarAssunto(el.dataset.b, el.dataset.dia || hoje()); },
  trocarPara: el => {
    const dia = el.dataset.dia || hoje(), d = diaDe(dia), i = (d.blocos || []).findIndex(x => x.id === el.dataset.b), a = achar(el.dataset.id);
    if (i < 0 || !a) return;
    const antigo = d.blocos[i], novo = antigo.tipo === 'questoes' ? blocoQuestoes(a, antigo.min || 50) : blocoDe(a); novo.adiantado = antigo.adiantado;
    const andamento = antigo.feito || (antigo.passos || []).some(p => p.ok);   // já tinha andamento: não perde, acrescenta o novo logo depois
    fecharModal();
    comDesfazer(andamento ? `"${antigo.titulo}" já tinha andamento: mantive e acrescentei "${a.titulo}".` : `Troquei "${antigo.titulo}" por "${a.titulo}".`, () => {
      if (andamento) d.blocos.splice(i + 1, 0, novo); else d.blocos[i] = novo;
      sugerirHorarios(d);
    });
  },
  trocaLivre: el => {
    const dia = el.dataset.dia || hoje(), d = diaDe(dia), i = (d.blocos || []).findIndex(x => x.id === el.dataset.b), t = ($('#troca-livre')?.value || '').trim().slice(0, 120);
    if (i < 0 || !t) { ui.iaMsg = 'Escreva o nome do assunto.'; render(); return; }
    const antigo = d.blocos[i], novo = { id: uid(), assuntoId: null, titulo: t, materia: $('#troca-livre-m')?.value || '', min: antigo.min || 30, feito: false, passos: [] };
    fecharModal();
    comDesfazer(`Troquei "${antigo.titulo}" por "${t}".`, () => {
      if (antigo.feito || (antigo.passos || []).some(p => p.ok)) d.blocos.splice(i + 1, 0, novo); else d.blocos[i] = novo;
      sugerirHorarios(d);
    });
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
  agRemover: el => {
    const data = el.dataset.dia || hoje(), d = diaDe(data), x = d.agenda?.[+el.dataset.i]; if (!x) return;
    comDesfazer(`Tirei "${x.titulo}" do dia.`, () => {
      d.agenda.splice(+el.dataset.i, 1); ui.agEdit = null;
      if (!d.agenda.length) d.semAgenda = true;   // tirou o último: o app não recria um bloco de estudo padrão sozinho
      reajustarDia(d, data);
    });
  },
  // recomeçar: apaga a agenda E os assuntos do dia (o que já foi estudado continua registrado nos assuntos); tem "Desfazer"
  apagarDiaTodo: el => {
    const alvo = el.dataset.dia || hoje(), d = diaDe(alvo), ehHoje = alvo === hoje();
    comDesfazer(ehHoje ? 'Dia de hoje apagado por inteiro. Pode montar outro.' : 'Dia de amanhã apagado por inteiro. Pode montar outro.', () => {
      d.agenda = []; d.blocos = []; d.contexto = ''; d.suposicoes = []; d.fator = 1; d.horas = 0; d.cap = 0; d.so = []; d.montado = false; d.semAgenda = true;
      ui.diaTexto = ''; ui.amanhaTexto = ''; ui.diaHoras = ''; ui.agEdit = null;
    });
  },
  agAtrasar: el => {
    // empurra o que ainda não acabou; o que passaria da meia-noite fica no limite
    const d = diaHoje(), v = +el.dataset.v, agora = agoraMinutos();
    for (const x of d.agenda) { const i = hm(x.inicio), f = hm(x.fim); if (i == null || f <= agora) continue; if (i > agora) x.inicio = hmStr(Math.min(1439, i + v)); x.fim = hmStr(Math.min(1439, f + v)); }
    d.agenda = d.agenda.filter(x => hm(x.inicio) == null || hm(x.fim) > hm(x.inicio));
    ui.iaMsg = `Empurrei o resto do dia em ${v >= 60 ? v / 60 + ' h' : v + ' min'}.`; reajustarDia(d);
  },
  agAgenda: el => levarParaAgenda(el.dataset.dia || hoje()),
  apagarPlanejamento: el => {
    const alvo = el.dataset.dia || hoje(), ehHoje = alvo === hoje(), d = diaDe(alvo);
    const { chat: _c, ...resto } = S; const antes = JSON.stringify(resto);
    d.agenda = []; d.contexto = ''; d.suposicoes = []; d.fator = 1; d.horas = 0; d.semAgenda = true;
    if (ehHoje) sugerirHorarios(d);   // os assuntos de hoje ficam (e o que ela já fez), só somem a agenda e os horários sugeridos
    else { d.cap = 0; d.so = []; d.blocos = []; d.montado = false; }
    ui.diaTexto = ''; ui.amanhaTexto = '';
    ui.desfazer = antes; ui.iaMsg = ehHoje ? 'Planejamento de hoje apagado. Os assuntos continuam na aba Hoje.' : 'Planejamento de amanhã apagado.';
    ui._desfazerGuard = true; salvar(); ui._desfazerGuard = false; render();
  },
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
