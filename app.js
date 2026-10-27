'use strict';
/* Rotina: plano de estudos (Ano → Mês → Semana → Dia) com IA (Gemini). Tudo fica salvo só neste aparelho. */

const CHAVE = 'rotina.dados';
const CHAVE_IA = 'rotina.chaves';

// ---------- utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => iso(new Date());
const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const mesDe = s => s.slice(0, 7);
const somaDias = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };
const somaMes = (m, n) => { const d = deIso(m + '-01'); d.setMonth(d.getMonth() + n); return iso(d).slice(0, 7); };
const segunda = s => { const d = deIso(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); };
const okData = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const okMes = s => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const nomeMes = m => MESES[+m.slice(5, 7) - 1];
const dataLonga = s => { const d = deIso(s); return `${SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const diaCurto = s => { const d = deIso(s); return `${SEMANA[d.getDay()].slice(0, 3)} ${d.getDate()}`; };
const agoraHm = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const diasAte = s => Math.round((deIso(s) - deIso(hoje())) / 86400000);

const MATERIAS = {
  'Matemática': 'mat', 'Física': 'nat', 'Química': 'nat', 'Biologia': 'nat',
  'História': 'hum', 'Geografia': 'hum', 'Filosofia': 'hum', 'Sociologia': 'hum',
  'Português': 'lin', 'Literatura': 'lin', 'Redação': 'lin', 'Inglês': 'lin', 'Espanhol': 'lin', 'Artes': 'lin',
};
const AREAS = { mat: 'Matemática', nat: 'Natureza', hum: 'Humanas', lin: 'Linguagens', out: 'Outros' };
const area = m => MATERIAS[m] || 'out';
const cor = m => `--c: var(--${area(m)})`;
const tag = m => `<span class="tag" style="${cor(m)}">${esc(m || 'Outra')}</span>`;

const ICONES = {
  ano: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mes: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  semana: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  hoje: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>',
};
const icone = n => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[n]}</svg>`;

// ---------- dados ----------
const VAZIO = {
  perfil: { nome: 'Uany Rebeca', vestibular: 'ENEM e, logo depois, Medicina em SP: USP-SP, Santa Casa SP, Albert Einstein, UNIFESP, São Camilo e FMABC', dataProva: '', fortes: '', fracas: '', horarios: '',
    jeito: 'Primeiro foco total no ENEM. Cerca de 2 dias depois do ENEM, começar a estudar para as provas de Medicina em SP (USP-SP, Santa Casa SP, Albert Einstein, UNIFESP, São Camilo, FMABC).' },
  tema: 'cores', cores: { acento: '#C2255C', fundo: '#FFFFFF' }, fases: [], meses: {}, assuntos: [], dias: {}, feitos: {}, estudo: {}, chat: [], cartoes: [], redacoes: [], qlog: {}, notas: {}, erros: [], tq: {}, pend: [], metaQ: {}, minQ: {}, qh: {}, foco: [], focoAnalise: {}, timer: null, provas: [], semeado: false, v: 2,
};

const provasFuturas = () => (S.provas || []).filter(p => okData(p.data) && p.data >= hoje()).sort((a, b) => a.data < b.data ? -1 : 1);
const proximaProva = () => provasFuturas()[0];
const ultimaProva = () => provasFuturas().slice(-1)[0];

/** Troca o plano pelo plano base (SP) a partir de `inicio`. Só usa dados novos; o perfil fica. */
function aplicarPlanoBase(inicio) {
  const b = montarPlanoBase(inicio);
  S.fases = b.fases; S.meses = b.meses; S.assuntos = b.assuntos; S.dias = {}; S.timer = null;
  S.provas = PROVAS_BASE.map(p => ({ ...p })); S.semeado = true;
  distribuirSemanas();
}

function carregar() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { }
  s = Object.assign(JSON.parse(JSON.stringify(VAZIO)), s || {});
  s.perfil = Object.assign({}, VAZIO.perfil, s.perfil);
  if (!s.perfil.nome) s.perfil.nome = VAZIO.perfil.nome;
  s.tema = 'cores'; s.cores = Object.assign({}, VAZIO.cores, s.cores); s.estudo ||= {}; s.chat ||= []; s.cartoes ||= []; s.redacoes ||= []; s.qlog ||= {}; s.notas ||= {}; s.erros ||= []; s.tq ||= {}; s.pend ||= []; s.metaQ ||= {}; s.minQ ||= {}; s.qh ||= {}; s.foco ||= []; s.focoAnalise ||= {};
  if (s.v !== 2) { s.v = 2; s.assuntos = []; s.semeado = false; s.dias = {}; s.timer = null; } // formato novo: o plano base é refeito
  return s;
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (e) { ui.iaMsg = 'Não consegui salvar neste aparelho: ' + e.message; }
}
function lerChaves() { try { return JSON.parse(localStorage.getItem(CHAVE_IA) || '[]'); } catch { return []; } }
function gravarChaves(ks) { try { localStorage.setItem(CHAVE_IA, JSON.stringify(ks)); } catch { } }
const temChave = () => lerChaves().some(k => k && k.trim());

// Link de configuração única: #k=<base64 de ["chave1","chave2"]>. Guarda no aparelho e apaga do endereço.
try {
  const m = location.hash.match(/^#k=(.+)$/);
  if (m) {
    const ks = JSON.parse(atob(decodeURIComponent(m[1])));
    if (Array.isArray(ks)) gravarChaves(ks.map(String));
    else if (ks && typeof ks === 'object') { if (Array.isArray(ks.g)) gravarChaves(ks.g.map(String)); if (ks.l?.chave) localStorage.setItem('rotina.llama', JSON.stringify(ks.l)); }
    history.replaceState(null, '', location.pathname);
  }
} catch { }

let S = carregar();
const ui = { view: 'hoje', mesModo: 'lista', qs: null, mes: mesDe(hoje()), semana: 0, iaMsg: '', desfazer: null, carregando: '',
  ctxTexto: '', ctxEnergia: '', horas: 0, planejar: false, iaTexto: '', apagar: false, chatAberto: false, anoModo: 'cartoes', anoMes: '', anoMat: '' };

// ---------- planejamento: o plano é uma fila; cada assunto tem uma semana prevista, mas pode ser feito antes (adiantado) ou depois (atrasado) ----------
// Tempo de um assunto de conteúdo = teoria + questões × minutos por questão (Matemática custa mais que Biologia) + correção.
// A IA calibra `teoria` e `q` por assunto (densidade); itens com `min` fixo (redação, simulado, revisão) não mudam.
const MIN_Q = { 'Matemática': 4.5, 'Física': 4, 'Química': 3.2, 'Biologia': 2.2, 'História': 2, 'Geografia': 2, 'Português': 2.5, 'Literatura': 2.3, 'Inglês': 2, 'Filosofia': 2, 'Sociologia': 2 };
const Q_PADRAO = { 'Matemática': 25, 'Física': 20, 'Química': 20, 'Biologia': 25, 'História': 20, 'Geografia': 20, 'Português': 15, 'Literatura': 10, 'Inglês': 10, 'Filosofia': 10, 'Sociologia': 10 };
const minPorQ = m => { if (S.minQ?.[m] > 0) return S.minQ[m]; const t = S.tq?.[m]; return t && t.n >= 8 ? Math.max(0.8, Math.min(12, t.seg / 60)) : MIN_Q[m] ?? 2.5; }; // aprende com o tempo real das listas de questões
const tempoDe = a => ({ t: a.teoria ?? 60, q: a.q ?? Q_PADRAO[a.materia] ?? 15 });
const minDe = a => { if (a.min) return a.min; const { t, q } = tempoDe(a); return Math.round(t + q * minPorQ(a.materia) * 1.25); };
const ehConteudo = a => !!a && !a.min;
const semAtual = () => segunda(hoje());
const semDe = a => a.semana || semAtual();
const estadoDe = a => a.feito ? 'feito' : semDe(a) < semAtual() ? 'atrasado' : semDe(a) === semAtual() ? 'semana' : 'futuro';
const fmtMin = m => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? (r ? `${h}h${pad(r)}` : `${h}h`) : `${r} min`; };
const soma = (l, f) => l.reduce((s, x) => s + f(x), 0);
const semanaCurta = s => `${deIso(s).getDate()}/${pad(deIso(s).getMonth() + 1)}`;

function setFeito(a, ok, sincronizar = true) {
  if (!a || !!a.feito === ok) return;
  a.feito = ok;
  // integração: marcar o assunto em qualquer tela (Mês, Semana, Ano) marca também os passos do bloco de hoje, e vice-versa
  if (sincronizar) for (const d of Object.values(S.dias)) for (const b of d.blocos || []) if (b.assuntoId === a.id) b.passos.forEach(p => { if (p.ok !== ok) { p.ok = ok; } });
  if (ok) { a.feitoEm = hoje(); S.estudo[hoje()] = (S.estudo[hoje()] || 0) + minDe(a); }
  else { const d = a.feitoEm; if (d && S.estudo[d]) S.estudo[d] = Math.max(0, S.estudo[d] - minDe(a)); a.feitoEm = null; }
}

/** Dá uma semana prevista aos assuntos que ainda não têm, repartindo o mês em partes iguais e misturando as matérias. */
function distribuirSemanas() {
  const w0 = semAtual(), porMes = {};
  for (const a of S.assuntos) if (!a.feito && !a.semana) (porMes[a.mes] ||= []).push(a);
  for (const [m, lista] of Object.entries(porMes)) {
    const ini = m + '-01', fim = somaDias(somaMes(m, 1) + '-01', -1);
    let ws = [];
    for (let w = segunda(ini); w <= fim; w = somaDias(w, 7)) if (w >= w0 && mesDe(somaDias(w, 3)) === m) ws.push(w);
    if (!ws.length) ws = [segunda(ini) >= w0 ? segunda(ini) : w0];
    lista.sort((x, y) => (x.ord || 0) - (y.ord || 0));
    lista.forEach((a, i) => { a.semana = ws[Math.min(ws.length - 1, Math.floor(i * ws.length / lista.length))]; });
  }
}

function rolar() {
  const m = mesDe(hoje());
  let mudou = false;
  for (const a of S.assuntos) {
    if (!a.feito && a.mes < m) { a.mes = m; mudou = true; }
  }
  if (S.assuntos.some(a => !a.feito && !a.semana)) { distribuirSemanas(); mudou = true; }
  if (mudou) salvar();
}

const achar = id => S.assuntos.find(a => a.id === id);
const diaHoje = () => (S.dias[hoje()] ||= { contexto: '', horas: 0, cap: 0, blocos: [] });

function faseAtual(m = mesDe(hoje())) { return S.fases.find(f => f.inicio <= m && m <= f.fim); }

function sequencia() {
  let d = hoje(), n = 0;
  if (!S.feitos[d]) d = somaDias(d, -1);
  while (S.feitos[d] > 0) { n++; d = somaDias(d, -1); }
  return n;
}

// ---------- IA ----------
function sistema() {
  const p = S.perfil;
  const falta = provasFuturas().length ? ` Provas: ${provasFuturas().map(x => `${x.nome} em ${x.data}${x.estimada ? ' (data estimada)' : ''}`).join('; ')}.` : '';
  return [
    `Você é a assistente de estudos de ${p.nome || 'uma estudante'}, que estuda para o vestibular (${p.vestibular || 'ENEM'}).${falta}`,
    'Fale em português do Brasil, de um jeito leve, acolhedor e direto, com frases curtas. Nada de sermão ou culpa.',
    'Ela tende a procrastinar e não planeja bem: proponha começos pequenos (o primeiro passo cabe em 5 minutos), passos concretos e poucos de cada vez.',
    p.fortes && `Matérias em que ela vai bem: ${p.fortes}.`,
    p.fracas && `Matérias em que tem mais dificuldade: ${p.fracas}.`,
    p.horarios && `Rotina e horários livres: ${p.horarios}.`,
    p.jeito && `Preferências dela (siga sempre):\n${p.jeito}`,
    `Hoje é ${dataLonga(hoje())} (${hoje()}), agora são ${agoraHm()}.`,
  ].filter(Boolean).join('\n');
}

/* Rotas de IA por tarefa (cada uma com seus provedores, na ordem). O que acabou a cota do dia é pulado até amanhã.
   texto  : conversa, planejar o dia, calibrar tempos  -> Llama (se tiver chave) e Gemini lite (cota maior); flash só se precisar
   visao  : ler letra à mão (redação, rascunho)         -> Gemini flash (lê imagem) */
const PROVEDORES = {
  groq: { nome: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', modelo: 'llama-3.3-70b-versatile' },
  cerebras: { nome: 'Cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', modelo: 'llama-3.3-70b' },
  openrouter: { nome: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', modelo: 'meta-llama/llama-3.3-70b-instruct:free' },
};
const CHAVE_LLAMA = 'rotina.llama';
const lerLlama = () => { try { return JSON.parse(localStorage.getItem(CHAVE_LLAMA) || '{}'); } catch { return {}; } };
const gravarLlama = o => { try { localStorage.setItem(CHAVE_LLAMA, JSON.stringify(o)); } catch { } };
const temLlama = () => !!lerLlama().chave;
const GEMINI = { texto: ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash'], visao: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'] };

const usoHoje = () => { S.uso ||= {}; if (S.uso.dia !== hoje()) S.uso = { dia: hoje(), n: {}, fim: {} }; return S.uso; };
const marcarUso = (id, ok = true) => { const u = usoHoje(); u.n[id] = (u.n[id] || 0) + 1; if (!ok) u.fim[id] = true; };

function rotaIa(tarefa) {
  const l = lerLlama(), r = [];
  const gem = GEMINI[tarefa] || GEMINI.texto;
  if (tarefa === 'texto' && l.chave) r.push({ t: 'llama', id: 'llama', prov: l.prov || 'groq', modelo: l.modelo || PROVEDORES[l.prov || 'groq'].modelo, chave: l.chave });
  const chaves = lerChaves().map(k => (k || '').trim()).filter(Boolean);
  for (const m of gem) for (const k of chaves) r.push({ t: 'gemini', id: m + '|' + chaves.indexOf(k), modelo: m, chave: k });
  const fim = usoHoje().fim;
  return [...r.filter(x => !fim[x.id]), ...r.filter(x => fim[x.id])]; // os esgotados vão para o fim, por garantia
}

/** Chama a IA conforme a tarefa. `imagens` = dataURLs jpeg (letra à mão). Devolve o JSON da resposta. */
async function chamarIa(prompt, max = 8000, imagens = [], tarefa = imagens.length ? 'visao' : 'texto') {
  let erro = 'sem chave';
  const rota = rotaIa(tarefa);
  if (!rota.length) throw new Error('sem chave. Cole a chave em Ajustes');
  for (const x of rota) {
    let r;
    try {
      if (x.t === 'llama') {
        if (imagens.length) continue;
        r = await fetch(PROVEDORES[x.prov].url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + x.chave },
          body: JSON.stringify({ model: x.modelo, temperature: 0.6, max_tokens: Math.min(max, 8000), response_format: { type: 'json_object' },
            messages: [{ role: 'system', content: sistema() + '\nResponda sempre em JSON válido.' }, { role: 'user', content: prompt }] }), signal: AbortSignal.timeout(40000) });
      } else {
        const partes = [{ text: prompt }, ...imagens.map(d => ({ inlineData: { mimeType: 'image/jpeg', data: d.split(',')[1] } }))];
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${x.modelo}:generateContent`, { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': x.chave },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema() }] }, contents: [{ role: 'user', parts: partes }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: max, temperature: 0.6 } }), signal: AbortSignal.timeout(40000) });
      }
    } catch (e) { erro = e.name === 'TimeoutError' ? 'a IA demorou demais' : 'sem internet?'; continue; }
    if (r.ok) {
      const j = await r.json();
      const t = x.t === 'llama' ? (j.choices?.[0]?.message?.content || '') : (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      try { const out = JSON.parse(t.replace(/^```(json)?|```$/g, '').trim()); marcarUso(x.id); ui.ultimaIa = x.t === 'llama' ? 'Llama · ' + x.modelo : x.modelo; salvar(); return out; } catch { erro = 'resposta incompleta'; continue; }
    }
    if (r.status === 429) { marcarUso(x.id, false); erro = 'a cota grátis acabou por agora'; }
    else erro = r.status === 503 ? 'a IA está sobrecarregada' : r.status === 401 || r.status === 403 ? 'chave recusada (' + (x.t === 'llama' ? 'Llama' : 'Gemini') + ')' : `erro ${r.status}`;
  }
  throw new Error(erro);
}
const temChaveIa = () => temChave() || temLlama();

const ACOES_IA = `Responda SÓ com JSON: {"resposta": "1 a 3 frases curtas para ela", "acoes": [ ... ]}
Ações possíveis (use só as necessárias; lista vazia se for só conversa):
- {"tipo":"marcar_semana","id":"<id do assunto>","dia":"AAAA-MM-DD"}  (qualquer data da semana desejada; o assunto passa a ser previsto para essa semana. Assuntos não têm dia fixo, só semana)
- {"tipo":"novo_assunto","mes":"AAAA-MM","materia":"<matéria>","titulo":"<assunto curto e específico>","dia":"AAAA-MM-DD" ou null,"min":150}  (min = minutos estimados)
- {"tipo":"mover_mes","id":"<id>","mes":"AAAA-MM"}
- {"tipo":"feito","id":"<id>","feito":true}
- {"tipo":"remover_assunto","id":"<id>"}  (só se ela pedir)
- {"tipo":"blocos_hoje","blocos":[{"assuntoId":"<id ou null>","titulo":"...","materia":"...","min":150,"passos":["...","..."]}]}  (substitui os assuntos de hoje, sem horário marcado; só os que ainda não foram começados)
- {"tipo":"foco_mes","mes":"AAAA-MM","foco":"1 frase com as prioridades do mês"}
- {"tipo":"fases","fases":[{"nome":"...","inicio":"AAAA-MM","fim":"AAAA-MM","objetivo":"..."}]}  (substitui as fases do ano)
- {"tipo":"prova","nome":"<nome da prova, igual ou novo>","data":"AAAA-MM-DD","estimada":false}  (corrige ou cria a data de uma prova)
- {"tipo":"lembrar","texto":"preferência dela, curta"}  (quando ela disser como gosta das coisas)
Regras: matérias válidas: ${Object.keys(MATERIAS).join(', ')}. Use os ids exatamente como vieram. Mexa só no necessário.
Atrasos não são problema: o que atrasou passa para as semanas seguintes e o mês fecha. O dia dela é uma lista de assuntos para concluir, sem horários: encha o tempo livre (horas_livres_hoje, menos 20% de folga) somando "min" dos assuntos; primeiro os atrasados, depois os da semana, depois adiantar os da próxima. De 3 a 5 passos concretos por assunto, o primeiro bem fácil.`;

function contextoIa() {
  const h = hoje(), w = semAtual(), d = S.dias[h];
  return {
    hoje: h,
    semana_atual_comeca_em: w,
    provas: provasFuturas().slice(0, 8),
    fases: S.fases,
    foco_dos_meses: S.meses,
    // semana = semana prevista (segunda-feira); min = minutos estimados
    assuntos: S.assuntos.filter(a => !a.feito ? semDe(a) <= somaDias(w, 14) : semDe(a) >= w)
      .map(a => ({ id: a.id, mes: a.mes, semana: semDe(a), materia: a.materia, titulo: a.titulo, min: minDe(a), feito: a.feito, estado: estadoDe(a) })),
    contexto_de_hoje: d?.contexto || null,
    horas_livres_hoje: d?.horas || null,
    blocos_de_hoje: (d?.blocos || []).map(b => ({ assuntoId: b.assuntoId, titulo: b.titulo, materia: b.materia, min: b.min,
      passos: b.passos.map(p => p.t + (p.ok ? ' (feito)' : '')) })),
  };
}

function aplicar(acoes) {
  const h = hoje();
  let n = 0;
  for (const a of Array.isArray(acoes) ? acoes : []) {
    try {
      const x = a.id ? achar(a.id) : null;
      switch (a.tipo) {
        case 'marcar_semana': case 'marcar_dia':
          if (!x || !okData(a.dia)) break;
          x.semana = segunda(a.dia); x.mes = mesDe(somaDias(x.semana, 3));
          n++; break;
        case 'novo_assunto':
          if (!a.titulo) break;
          S.assuntos.push({ id: uid(), mes: okMes(a.mes) ? a.mes : mesDe(okData(a.dia) ? a.dia : h), materia: String(a.materia || 'Outra').slice(0, 30),
            titulo: String(a.titulo).slice(0, 140), semana: okData(a.dia) ? segunda(a.dia) : null, min: +a.min > 0 ? Math.round(+a.min) : 0, ord: 0.5, feito: false });
          n++; break;
        case 'mover_mes':
          if (x && okMes(a.mes)) { x.mes = a.mes; x.semana = null; n++; } break;
        case 'feito':
          if (x) { setFeito(x, a.feito !== false); n++; } break;
        case 'remover_assunto':
          if (x) { S.assuntos = S.assuntos.filter(y => y !== x); n++; } break;
        case 'blocos_hoje':
          if (!Array.isArray(a.blocos)) break;
          { // o que já foi começado fica como está; o resto é trocado
            const d = diaHoje();
            const feitos = d.blocos.filter(b => b.passos.some(p => p.ok) || achar(b.assuntoId)?.feito);
            const novos = a.blocos.map(b => {
              const ref = b.assuntoId && achar(b.assuntoId);
              return { id: uid(), assuntoId: ref ? ref.id : null, titulo: String(b.titulo || ref?.titulo || 'Tarefa'), materia: b.materia || ref?.materia || '',
                min: +b.min > 0 ? Math.round(+b.min) : ref ? minDe(ref) : 30, passos: (b.passos || []).map(t => ({ t: String(t), ok: false })) };
            }).filter(b => b.passos.length && !feitos.some(f => f.assuntoId && f.assuntoId === b.assuntoId));
            d.blocos = [...feitos, ...novos];
          }
          n++; break;
        case 'foco_mes':
          if (okMes(a.mes)) { S.meses[a.mes] = { ...(S.meses[a.mes] || {}), foco: String(a.foco || '') }; n++; } break;
        case 'fases':
          if (Array.isArray(a.fases)) {
            S.fases = a.fases.filter(f => okMes(f.inicio) && okMes(f.fim))
              .map(f => ({ nome: String(f.nome || 'Fase'), inicio: f.inicio, fim: f.fim, objetivo: String(f.objetivo || '') }));
            n++;
          } break;
        case 'prova': {
          if (!a.nome || !okData(a.data)) break;
          const p = (S.provas ||= []).find(y => y.nome.toLowerCase() === String(a.nome).toLowerCase());
          if (p) { p.data = a.data; p.estimada = !!a.estimada; } else S.provas.push({ nome: String(a.nome).slice(0, 60), data: a.data, estimada: !!a.estimada });
          n++; break;
        }
        case 'lembrar':
          if (a.texto) { S.perfil.jeito = (S.perfil.jeito ? S.perfil.jeito.trim() + '\n' : '') + '- ' + String(a.texto).trim(); n++; } break;
      }
    } catch { }
  }
  return n;
}

async function pedirIa(pedido, rotulo = 'Pensando…', falaDela = null) {
  const chat = ui.chatAberto;
  S.chat ||= [];
  if (falaDela) S.chat.push({ r: 'u', t: falaDela });
  if (!temChaveIa()) {
    if (chat) { S.chat.push({ r: 'ia', t: 'Falta a chave da IA. Cole a chave grátis do Gemini em Ajustes.', erro: true }); salvar(); desenharChat(); return; }
    abrirModal(`<h2>Falta a chave da IA</h2><p>Cole a sua chave grátis do Gemini em <b>Ajustes</b> para a IA funcionar.</p>
      <div class="linha"><button class="botao" data-acao="ir" data-v="ajustes">Abrir Ajustes</button><button class="botao contorno" data-acao="fechar">Agora não</button></div>`);
    return;
  }
  if (!chat) fecharModal();
  ui.carregando = rotulo; chat ? desenharChat() : render();
  try {
    const r = await chamarIa(`${ACOES_IA}\n\nSituação atual (JSON):\n${JSON.stringify(contextoIa())}\n\nPedido dela: ${pedido}`);
    const { chat: _c, ...resto } = S;
    const antes = JSON.stringify(resto);
    const n = aplicar(r.acoes);
    ui.desfazer = n ? antes : null;
    ui.iaMsg = String(r.resposta || (n ? 'Pronto, organizei.' : '')).trim();
    if (ui.iaMsg) S.chat.push({ r: 'ia', t: ui.iaMsg, desfazer: !!n });
  } catch (e) {
    ui.iaMsg = `Não consegui falar com a IA agora (${e.message}). Tenta de novo daqui a pouco.`;
    S.chat.push({ r: 'ia', t: ui.iaMsg, erro: true });
    ui.desfazer = null;
  }
  S.chat = S.chat.slice(-40);
  salvar();
  ui.carregando = '';
  if (ui.chatAberto) { ui.iaMsg = ''; desenharChat(); } else render();
}

// ---------- telas ----------
function menuHtml() {
  const itens = [['ano', 'Ano'], ['mes', 'Mês'], ['semana', 'Semana'], ['hoje', 'Hoje'], ['meudia', 'Meu dia'], ['pendencias', 'Pendências'], ['foco', 'Foco'], ['questoes', 'Questões'], ['caderno', 'Caderno']];
  return `<div class="marca">rotina</div>` +
    itens.map(([v, t]) => `<button data-acao="ir" data-v="${v}" ${ui.view === v ? 'aria-current="page"' : ''}>${icone(v)}<span>${t}</span></button>`).join('') +
    `<div class="espaco"></div><button data-acao="ir" data-v="ajustes" ${ui.view === 'ajustes' ? 'aria-current="page"' : ''}>${icone('ajustes')}<span>Ajustes</span></button>`;
}

function avisoIa() {
  if (!ui.iaMsg) return '';
  return `<div class="aviso-ia"><p>${esc(ui.iaMsg)}</p>
    ${ui.desfazer ? '<button class="link" data-acao="desfazer">Desfazer</button>' : ''}
    <button class="x" data-acao="fecharAviso" aria-label="Fechar">×</button></div>`;
}

function fasesHtml() {
  if (!S.fases.length) return '';
  const m = mesDe(hoje());
  const tam = f => Math.max(1, (+f.fim.slice(0, 4) - +f.inicio.slice(0, 4)) * 12 + (+f.fim.slice(5) - +f.inicio.slice(5)) + 1);
  return `<section class="fases" aria-label="Fases do ano">` + S.fases.map(f => {
    const atual = f.inicio <= m && m <= f.fim, passou = f.fim < m;
    let pct = passou ? 100 : 0;
    if (atual) pct = Math.round(((+m.slice(0, 4) - +f.inicio.slice(0, 4)) * 12 + (+m.slice(5) - +f.inicio.slice(5)) + 0.5) / tam(f) * 100);
    return `<div class="fase ${atual ? 'atual' : ''}" style="flex:${tam(f)} 1 0"><div class="barra"><i style="width:${pct}%"></i></div>
      <span>${esc(f.nome)}${atual ? ' · você está aqui' : ''}</span></div>`;
  }).join('') + `</section>`;
}

// ---------- telas ----------
const passosPadrao = a => {
  if (/^Redação/.test(a.titulo)) return ['Escolher a proposta e planejar a estrutura', 'Escrever o texto', 'Reler e marcar o que melhorar'];
  if (/^Simulado/.test(a.titulo)) return ['Fazer cronometrado', 'Corrigir com calma', 'Anotar os erros no caderno'];
  if (a.min) return ['Começar (5 min)', 'Terminar'];
  const { t, q } = tempoDe(a), mq = minPorQ(a.materia);
  return [`Teoria: aula ou resumo (~${fmtMin(t)})`, `Fazer ${q} questões (~${fmtMin(q * mq)})`, `Corrigir e anotar os erros (~${fmtMin(q * mq * 0.25)})`];
};
const blocoDe = a => ({ id: uid(), assuntoId: a.id, titulo: a.titulo, materia: a.materia, min: minDe(a), passos: passosPadrao(a).map(t => ({ t, ok: false })) });

/** Fila do plano: atrasados primeiro, depois a semana atual, depois as próximas (adiantar). */
const filaPlano = () => S.assuntos.filter(a => !a.feito)
  .sort((x, y) => semDe(x) < semDe(y) ? -1 : semDe(x) > semDe(y) ? 1 : x.mes < y.mes ? -1 : x.mes > y.mes ? 1 : (x.ord || 0) - (y.ord || 0));

/** Enche o dia com assuntos até caber o tempo livre (menos 20% para distrações). */
function montarHoje(cap) {
  const d = diaHoje();
  d.cap = cap > 0 ? cap : d.cap || 0;
  const mantidos = d.blocos.filter(b => { const a = b.assuntoId && achar(b.assuntoId); return !a || a.feito || b.passos.some(p => p.ok); });
  let usado = soma(mantidos, b => b.min || 0);
  const novos = [];
  for (const a of filaPlano()) {
    if (usado >= d.cap) break;
    if (mantidos.some(b => b.assuntoId === a.id)) continue;
    const m = minDe(a);
    if (usado + m > d.cap * 1.15 && (novos.length || mantidos.length)) continue;
    novos.push(blocoDe(a)); usado += m;
  }
  d.blocos = [...mantidos, ...novos];
}

function vHoje() {
  const h = hoje(), d = S.dias[h] || { contexto: '', horas: 0, cap: 0, blocos: [] };
  const hr = new Date().getHours();
  const saud = hr < 5 ? 'Boa noite' : hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
  const topo = `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">${dataLonga(h)}</span><h1>${saud}, ${esc(S.perfil.nome.split(' ')[0] || '')}</h1></div></header>`;
  const atrasados = S.assuntos.filter(a => estadoDe(a) === 'atrasado').length;
  const adiantados = S.assuntos.filter(a => a.feito && semDe(a) > semAtual());
  const feitoMin = S.estudo[h] || 0, meta = d.cap || 0;
  const pct = meta ? Math.min(100, Math.round(feitoMin / meta * 100)) : 0;
  const selos = `${atrasados ? `<span class="selo atraso">${atrasados} ${atrasados === 1 ? 'atrasado' : 'atrasados'} da semana passada</span>` : ''}
    ${adiantados.length ? `<span class="selo adiante">${adiantados.length} ${adiantados.length === 1 ? 'assunto adiantado' : 'assuntos adiantados'} · ${fmtMin(soma(adiantados, minDe))}</span>` : ''}`;
  const painel = d.blocos.length ? `<section class="cartao dia-resumo">
      <div class="entre"><strong>${fmtMin(feitoMin)} de assuntos concluídos${feitoMin >= meta ? ' · meta batida!' : ` · meta ${fmtMin(meta)}`}</strong><span class="fraco">${d.horas}h livres · 20% reservado para pausas</span></div>
      <div class="barra grossa"><i style="width:${pct}%"></i></div><div class="linha">${selos}</div></section>` : '';
  const planejar = d.blocos.length ? '' : `<section class="cartao"><h2>Ainda não há plano para hoje</h2><p class="fraco" style="margin:0">Conte como vai ser o seu dia (ou só quantas horas tem livres) e eu monto tudo: agenda, pausas e os assuntos certos.</p>
    <div class="linha"><button class="botao grande" data-acao="ir" data-v="meudia">Planejar meu dia</button></div></section>`;

  const grupos = [['atrasado', 'Atrasados'], ['semana', 'Desta semana'], ['futuro', 'Adiantando a próxima semana'], ['feito', 'Já feitos']];
  const dos = b => { const a = b.assuntoId && achar(b.assuntoId); return a ? (a.feito ? 'feito' : estadoDe(a)) : 'semana'; };
  const lista = grupos.map(([k, t]) => {
    const bs = d.blocos.filter(b => dos(b) === k);
    return bs.length ? `<h3 class="grupo ${k}">${t}<span class="fraco"> · ${fmtMin(soma(bs, b => b.min || 0))}</span></h3>${bs.map(blocoHtml).join('')}` : '';
  }).join('');

  let prox = null;
  for (const b of d.blocos) { const a = b.assuntoId && achar(b.assuntoId); if (a?.feito) continue; const i = b.passos.findIndex(p => !p.ok); if (i >= 0) { prox = { b, i }; break; } }
  const seq = sequencia();
  const lado = `<aside class="coluna">
    <div class="cartao proximo">
      ${prox ? `<span class="rotulo">próximo passo</span><h2>${esc(prox.b.passos[prox.i].t)}</h2><span class="fraco" style="color:inherit;opacity:.75">${esc(prox.b.titulo)}</span>
        <div class="linha"><button class="botao destaque grande" data-acao="timer" data-min="5" data-b="${prox.b.id}" data-i="${prox.i}">Só 5 minutos</button>
        <button class="botao contorno" style="color:inherit" data-acao="timer" data-min="25" data-b="${prox.b.id}" data-i="${prox.i}">Foco 25</button></div>`
        : d.blocos.length ? `<span class="rotulo">hoje</span><h2>Tudo feito por hoje. Orgulho!</h2>` : `<span class="rotulo">hoje</span><h2>Diga quanto tempo tem e eu encho o dia.</h2>`}
    </div>
    ${window.metaQHtml?.() ?? ''}${window.pendHojeHtml?.() ?? ''}
    <div class="cartao ia-cartao"><strong>${seq ? `${seq} ${seq === 1 ? 'dia' : 'dias'} seguidos estudando` : 'Um passo hoje já conta'}</strong>
      <span>${esc(faseAtual()?.objetivo || S.meses[mesDe(h)]?.foco || 'Comece pelo passo mais fácil. O resto vem.')}</span></div>
    ${d.blocos.length ? `<div class="linha"><button class="botao claro" data-acao="maisUm">Puxar mais um assunto</button>
      <button class="botao contorno" data-acao="ir" data-v="meudia">Meu dia</button>
      <button class="botao contorno" data-acao="novaTarefa">+ Tarefa</button></div>` : ''}
  </aside>`;
  return topo + avisoIa() + painel + planejar + (d.blocos.length ? `<div class="grade2"><section class="coluna" aria-label="Assuntos de hoje">${lista}</section>${lado}</div>` : '');
}

function planejarHtml(d) {
  const chips = (campo, ops) => ops.map(o => `<button class="chip" data-acao="ctx" data-campo="${campo}" data-v="${o}" aria-pressed="${ui[campo] === o}">${o}</button>`).join('');
  const horas = d.horas || ui.horas || 0;
  return `<section class="cartao" style="gap:16px">
    <h2>Como está seu dia?</h2>
    <div class="coluna" style="gap:8px"><span class="rotulo">horas livres para estudar hoje</span>
      <div class="linha">${[2, 3, 4, 6, 8, 10, 12].map(n => `<button class="chip" data-acao="horas" data-v="${n}" aria-pressed="${horas === n}">${n}h</button>`).join('')}
      <input type="number" min="1" max="16" step="0.5" id="horas-livres" placeholder="outro" value="${horas && ![2, 3, 4, 6, 8, 10, 12].includes(horas) ? horas : ''}" style="width:90px" data-ui-horas></div>
      <span class="fraco" style="font-size:14px">Eu encho o dia com assuntos para ${horas ? fmtMin(Math.round(horas * 48)) : 'esse tempo'} de estudo e deixo 20% livre para distrações e pausas.</span></div>
    <div class="coluna" style="gap:8px"><span class="rotulo">energia</span><div class="linha">${chips('ctxEnergia', ['cheia de energia', 'normal', 'cansada', 'sem vontade'])}</div></div>
    <textarea data-ui="ctxTexto" placeholder="Algum compromisso ou pedido? Ex.: dentista às 17h, quero mais matemática">${esc(ui.ctxTexto)}</textarea>
    <div class="linha"><button class="botao grande" data-acao="montarDia">Montar meu dia</button></div>
  </section>`;
}

function blocoHtml(b) {
  const a = b.assuntoId && achar(b.assuntoId);
  const est = a ? estadoDe(a) : '';
  const rot = { atrasado: 'atrasado', futuro: 'adiantando', feito: 'feito' }[est];
  return `<article class="cartao bloco ${est}" style="${cor(b.materia)}">
    <div class="bloco-topo"><h3>${esc(b.titulo)}</h3>
      <span class="hora">≈ ${fmtMin(b.min || 0)}${b.sug ? ` · sugerido ${b.sug}` : ''}</span>${b.materia ? tag(b.materia) : ''}${rot ? `<span class="selo ${est}">${rot}</span>` : ''}
      <button class="x" data-acao="tirarBloco" data-b="${b.id}" aria-label="Tirar bloco">×</button></div>
    ${b.passos.map((p, i) => `<label class="passo ${p.ok ? 'ok' : ''}"><input type="checkbox" data-acao="passo" data-b="${b.id}" data-i="${i}" ${p.ok ? 'checked' : ''}><span>${esc(p.t)}</span></label>`).join('')}
    ${a ? `<div class="linha acoes-bloco">${ehConteudo(a) ? `<button class="link" data-acao="questoes" data-id="${a.id}">${a.questoes ? `Questões: ${a.questoes.acertos}/${a.questoes.feitas}` : 'Registrar questões'}</button>` : ''}
      <button class="link" data-acao="caderno" data-id="${a.id}">Caderno à mão</button></div>` : ''}
  </article>`;
}

function vSemana() {
  const h = hoje(), w = somaDias(semAtual(), ui.semana * 7), fim = somaDias(w, 6);
  const lista = S.assuntos.filter(a => a.semana === w);
  const atras = ui.semana === 0 ? S.assuntos.filter(a => estadoDe(a) === 'atrasado') : [];
  const tot = lista.length, fz = lista.filter(a => a.feito).length;
  const minTot = soma(lista, minDe), minFz = soma(lista.filter(a => a.feito), minDe);
  const pct = tot ? Math.round(fz / tot * 100) : 0;
  const prox = S.assuntos.filter(a => a.semana === somaDias(w, 7));
  const proxFz = prox.filter(a => a.feito);
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(w, i));
  const maxMin = Math.max(240, ...dias.map(d => S.estudo[d] || 0));
  const item = a => `<button class="item ${a.feito ? 'feito' : ''}" style="${cor(a.materia)}" data-acao="assunto" data-id="${a.id}">
    <i class="ponto"></i><span>${esc(a.titulo)} <span class="fraco" style="font-size:12px">· ${fmtMin(minDe(a))}${a.feito && a.feitoEm ? ' · feito ' + diaCurto(a.feitoEm) : ''}</span></span></button>`;
  const grade = l => `<div class="itens">${l.map(item).join('')}</div>`;
  const ordenar = l => l.slice().sort((x, y) => (x.feito - y.feito) || (x.ord || 0) - (y.ord || 0));
  return `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">semana${ui.semana === 0 ? ' · esta' : ''}</span>
      <h1>${deIso(w).getDate()} de ${nomeMes(w)} – ${deIso(fim).getDate()} de ${nomeMes(fim)}</h1></div>
    <div class="linha"><button class="botao contorno" data-acao="semana" data-v="-1" aria-label="Semana anterior">‹</button>
      ${ui.semana ? '<button class="botao contorno" data-acao="semana" data-v="0">Esta semana</button>' : ''}
      <button class="botao contorno" data-acao="semana" data-v="1" aria-label="Próxima semana">›</button></div></header>
    ${avisoIa()}
    <section class="cartao">
      <div class="entre"><strong>${fz} de ${tot} assuntos · ${fmtMin(minFz)} de ${fmtMin(minTot)}</strong><span class="fraco">${pct}%</span></div>
      <div class="barra grossa"><i style="width:${pct}%"></i></div>
      ${ui.semana === 0 && proxFz.length ? `<div class="selo adiante grande">Adiantada: você já fez ${proxFz.length} ${proxFz.length === 1 ? 'assunto' : 'assuntos'} da próxima semana (${fmtMin(soma(proxFz, minDe))}).</div>` : ''}
      ${atras.length ? `<div class="selo atraso grande">${atras.length} ${atras.length === 1 ? 'assunto atrasado' : 'assuntos atrasados'} de semanas anteriores. Eles entram primeiro no seu dia.</div>` : ''}
      <div class="dias-estudo">${dias.map(d => { const m = S.estudo[d] || 0; return `<div class="de ${d === h ? 'hoje' : ''}"><div class="coluna-barra"><i style="height:${Math.round(m / maxMin * 100)}%"></i></div><span>${SEMANA[deIso(d).getDay()].slice(0, 3)}</span><small>${m ? fmtMin(m) : '·'}</small></div>`; }).join('')}</div>
      ${questoesSemana(w)}
      <p class="fraco" style="margin:0;font-size:14px">Os assuntos da semana não têm dia fixo: faça no seu ritmo. Se terminar cedo, o app puxa os da próxima semana.</p>
    </section>
    ${atras.length ? `<section class="cartao"><h2>Atrasados <span class="fraco" style="font-size:16px">(${atras.length})</span></h2>${grade(atras)}</section>` : ''}
    <section class="cartao"><div class="entre"><h2>Desta semana <span class="fraco" style="font-size:16px">(${tot})</span></h2>
      <button class="botao" data-acao="reorganizar" data-ini="${w}">Reorganizar com a IA</button></div>
      ${tot ? grade(ordenar(lista)) : '<p class="fraco" style="margin:0">Nenhum assunto previsto para esta semana.</p>'}</section>
    ${prox.length ? `<section class="cartao"><div class="entre"><h2>Próxima semana <span class="fraco" style="font-size:16px">(${proxFz.length} de ${prox.length} feitos)</span></h2>
      <button class="link" data-acao="semana" data-v="1">Ver semana</button></div>${grade(ordenar(prox).slice(0, 8))}</section>` : ''}`;
}

function vMes() {
  const m = ui.mes, lista = S.assuntos.filter(a => a.mes === m);
  const feitos = lista.filter(a => a.feito).length;
  const pct = lista.length ? Math.round(feitos / lista.length * 100) : 0;
  const fase = faseAtual(m);
  const grupos = Object.keys(AREAS).map(ar => [ar, lista.filter(a => area(a.materia) === ar)]).filter(([, l]) => l.length);
  const opcoes = Object.keys(MATERIAS).map(x => `<option>${x}</option>`).join('');
  return `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">${fase ? esc(fase.nome) : 'mês'}</span>
      <h1>${nomeMes(m)} ${m.slice(0, 4)}</h1></div>
    <div class="linha"><div class="alterna" role="group" aria-label="Modo de ver o mês">
        <button data-acao="mesModo" data-v="lista" aria-pressed="${ui.mesModo !== 'mapa'}">Lista</button><button data-acao="mesModo" data-v="mapa" aria-pressed="${ui.mesModo === 'mapa'}">Mapa</button></div>
      <button class="botao contorno" data-acao="mes" data-v="-1" aria-label="Mês anterior">‹</button>
      <button class="botao contorno" data-acao="mes" data-v="1" aria-label="Próximo mês">›</button></div></header>
    ${avisoIa()}
    ${ui.mesModo === 'mapa' ? mesMapa(m) : ''}
    <section class="cartao" ${ui.mesModo === 'mapa' ? 'hidden' : ''}>
      ${S.meses[m]?.foco ? `<p class="mao" style="margin:0">${esc(S.meses[m].foco)}</p>` : ''}
      <div class="entre"><strong>${feitos} de ${lista.length} assuntos</strong><span class="fraco">${pct}%</span></div>
      <div class="barra"><i style="width:${pct}%"></i></div>
      <p class="fraco" style="margin:0">Aqui ficam os assuntos do mês, sem dia fixo. A semana distribui; o que atrasar passa pra frente sem atrasar o mês.</p>
    </section>
    ${ui.mesModo === 'mapa' ? '' : grupos.map(([ar, l]) => `<section class="cartao"><h2 class="linha" style="${`--c: var(--${ar})`}"><i class="ponto"></i>${AREAS[ar]}</h2><div class="lista">
      ${l.map(a => `<div class="assunto ${a.feito ? 'feito' : ''}"><input type="checkbox" data-acao="feitoAssunto" data-id="${a.id}" ${a.feito ? 'checked' : ''} aria-label="Feito">
        <button class="titulo" data-acao="assunto" data-id="${a.id}">${esc(a.titulo)} <span class="fraco" style="font-size:13px">· ${esc(a.materia)}</span></button>
        <span class="quando">${a.feito ? '' : estadoDe(a) === 'atrasado' ? 'atrasado' : 'sem. ' + semanaCurta(semDe(a))}</span></div>`).join('')}
    </div></section>`).join('')}
    <section class="cartao" ${ui.mesModo === 'mapa' ? 'hidden' : ''}><h2>Adicionar assunto</h2>
      <div class="linha" style="align-items:stretch"><select id="nova-materia" style="flex:0 1 200px">${opcoes}</select>
        <input id="novo-titulo" type="text" placeholder="Ex.: Funções do 2º grau" style="flex:1 1 240px">
        <button class="botao" data-acao="addAssunto">Adicionar</button></div>
      <div class="linha"><button class="botao claro" data-acao="sugerirMes">${lista.length ? 'Pedir mais assuntos à IA' : 'IA: sugerir os assuntos do mês'}</button></div>
    </section>`;
}

function vAno() {
  const m0 = mesDe(hoje());
  const prox = proximaProva(), ult = ultimaProva();
  if (!prox) return `<header><span class="rotulo">ano</span><h1>Seu ano até a prova</h1></header>${avisoIa()}
    <section class="cartao"><p style="margin:0">Ainda não há provas com data. Peça para a IA ou recomece o plano base em Ajustes.</p>
    <div class="linha"><button class="botao" data-acao="ir" data-v="ajustes">Abrir Ajustes</button></div></section>`;
  const meses = [];
  for (let m = m0; m <= mesDe(ult.data) && meses.length < 30; m = somaMes(m, 1)) meses.push(m);
  const linhaProva = x => `<div class="entre prova"><span>${esc(x.nome)}</span><span class="fraco">${okData(x.data) ? `${dataLonga(x.data)}${x.estimada ? ' (estimada)' : ''} · ${diasAte(x.data)} dias` : 'data a confirmar'}</span></div>`;
  const semData = (S.provas || []).filter(x => !okData(x.data));
  if (ui.anoModo === 'mapa') ui.anoModo = 'cartoes';
  const cabeca = `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">próxima prova</span>
      <h1>${esc(prox.nome)} em ${diasAte(prox.data)} dias</h1><span class="fraco">${dataLonga(prox.data)}${prox.estimada ? ' (data estimada)' : ''}</span></div>
    <div class="linha"><div class="alterna" role="group" aria-label="Modo de ver o ano">
      <button data-acao="anoModo" data-v="cartoes" aria-pressed="${ui.anoModo === 'cartoes'}">Cartões</button>
      <button data-acao="anoModo" data-v="caminho" aria-pressed="${ui.anoModo === 'caminho'}">Caminho</button></div>
    <button class="botao" data-acao="planoAno">Refazer o plano com a IA</button></div></header>${avisoIa()}`;
  const provas = `<section class="cartao"><h2>Provas</h2>${provasFuturas().concat(semData).map(linhaProva).join('')}
      <p class="fraco" style="margin:0">As datas de 2027 são estimadas pelo padrão de 2026. Quando saírem os editais, mude pela IA ("a Fuvest será dia tal").</p></section>`;
  if (ui.anoModo === 'caminho') return cabeca + anoCaminho();
  return cabeca + provas + `${S.fases.length ? `<section class="cartao">${fasesHtml()}<div class="coluna" style="gap:6px">${S.fases.map(f =>
      `<div><strong>${esc(f.nome)}</strong> <span class="fraco">· ${nomeMes(f.inicio)} a ${nomeMes(f.fim)}${f.objetivo ? ' — ' + esc(f.objetivo) : ''}</span></div>`).join('')}</div></section>`
      : '<p class="fraco" style="margin:0">A IA divide o tempo até a prova em fases e dá um foco para cada mês.</p>'}
    <section class="meses">${meses.map(m => {
      const l = S.assuntos.filter(a => a.mes === m), f = l.filter(a => a.feito).length;
      return `<button class="cartao mes-cartao ${m === m0 ? 'atual' : ''}" data-acao="abrirMes" data-v="${m}">
        <div class="entre"><h3>${nomeMes(m)}</h3><span class="fraco" style="font-size:13px">${m.slice(0, 4)}</span></div>
        <p>${esc(S.meses[m]?.foco || (l.length ? '' : 'Sem assuntos ainda'))}</p>
        ${l.length ? `<div class="barra"><i style="width:${Math.round(f / l.length * 100)}%"></i></div><p>${f} de ${l.length} assuntos</p>` : ''}
      </button>`;
    }).join('')}</section>`;
}

/** Mapa interativo: uma coluna por mês (anel de progresso, barras por área, provas), filtro por matéria e detalhe do mês tocado. */
function anoMapa(meses, m0) {
  const sel = meses.includes(ui.anoMes) ? ui.anoMes : m0;
  const filtro = a => !ui.anoMat || a.materia === ui.anoMat;
  const corFase = f => { const i = S.fases.indexOf(f); return ['--mat', '--nat', '--hum', '--lin'][i < 0 ? 4 : i % 4] || '--out'; };
  const ars = ['mat', 'nat', 'hum', 'lin'];
  const ring = pct => { const c = 2 * Math.PI * 17; return `<svg viewBox="0 0 44 44" width="52" height="52" aria-hidden="true"><circle cx="22" cy="22" r="17" fill="none" stroke="var(--linha)" stroke-width="5"/>
    <circle cx="22" cy="22" r="17" fill="none" stroke="var(--acento)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 22 22)"/></svg>`; };
  const cols = meses.map(m => {
    const l = S.assuntos.filter(a => a.mes === m && filtro(a)), f = l.filter(a => a.feito).length, fase = faseAtual(m);
    const provas = (S.provas || []).filter(p => okData(p.data) && mesDe(p.data) === m);
    const maxN = 14;
    return `<button class="col-mes ${m === m0 ? 'atual' : ''} ${m === sel ? 'sel' : ''}" data-acao="anoMes" data-v="${m}" style="--fc: var(${fase ? corFase(fase) : '--out'})">
      <span class="faixa"></span><span class="fn">${fase ? esc(fase.nome) : ''}</span>
      <strong>${nomeMes(m).slice(0, 3)}</strong><small>${m.slice(2, 4)}</small>
      <div class="ringbox">${ring(l.length ? f / l.length : 0)}<b>${l.length ? Math.round(f / l.length * 100) : 0}%</b></div>
      <div class="mini">${ars.map(ar => { const x = l.filter(a => area(a.materia) === ar), fx = x.filter(a => a.feito).length;
        return `<i style="--c:var(--${ar});height:${Math.max(x.length ? 6 : 2, Math.min(100, x.length / maxN * 100))}%" title="${AREAS[ar]}: ${fx} de ${x.length}"><u style="height:${x.length ? Math.round(fx / x.length * 100) : 0}%"></u></i>`; }).join('')}</div>
      <span class="n">${l.length} assuntos</span>
      ${provas.map(p => `<span class="bandeira">${esc(p.nome)}</span>`).join('')}
    </button>`;
  }).join('');
  const mats = [...new Set(S.assuntos.map(a => a.materia))];
  const porMat = mats.map(mt => {
    const ano = S.assuntos.filter(a => a.materia === mt), fa = ano.filter(a => a.feito).length;
    const mes = ano.filter(a => a.mes === sel), fm = mes.filter(a => a.feito).length;
    const pc = (f, n) => n ? Math.round(f / n * 100) : 0;
    return `<button class="mat-linha ${ui.anoMat === mt ? 'sel' : ''}" style="${cor(mt)}" data-acao="anoMat" data-v="${esc(mt)}">
      <span><i class="ponto"></i>${esc(mt)}</span><small><b>${nomeMes(sel).slice(0, 3)}:</b> ${fm}/${mes.length} · <b>ano:</b> ${fa}/${ano.length}</small>
      <div class="barras2"><div class="barra"><i style="width:${pc(fm, mes.length)}%;background:var(--c)"></i></div><div class="barra fina"><i style="width:${pc(fa, ano.length)}%;background:var(--c);opacity:.45"></i></div></div></button>`; }).join('');
  const det = S.assuntos.filter(a => a.mes === sel && filtro(a));
  const porMateria = [...new Set(det.map(a => a.materia))];
  return `<section class="cartao"><div class="entre"><h2>Mapa do ano</h2><span class="fraco" style="font-size:14px">Toque num mês para ver os assuntos. Toque numa matéria para filtrar.</span></div>
    <div class="mapa-rolagem"><div class="mapa">${cols}</div></div></section>
    <div class="grade2"><section class="cartao"><div class="entre"><h2>${nomeMes(sel)} ${sel.slice(0, 4)}${ui.anoMat ? ` · ${esc(ui.anoMat)}` : ''}</h2>
        <button class="botao claro" data-acao="abrirMes" data-v="${sel}">Abrir o mês</button></div>
      ${S.meses[sel]?.foco ? `<p class="mao" style="margin:0">${esc(S.meses[sel].foco)}</p>` : ''}
      ${porMateria.length ? porMateria.map(mt => `<div class="coluna" style="gap:6px"><span class="rotulo" style="${cor(mt)}"><i class="ponto"></i> ${esc(mt)}</span>
        <div class="itens">${det.filter(a => a.materia === mt).map(a => `<button class="item ${a.feito ? 'feito' : ''}" style="${cor(a.materia)}" data-acao="assunto" data-id="${a.id}"><i class="ponto"></i><span>${esc(a.titulo)}</span></button>`).join('')}</div></div>`).join('')
        : '<p class="fraco" style="margin:0">Nada neste mês.</p>'}</section>
      <section class="cartao"><div class="entre"><h2>Por matéria</h2>${ui.anoMat ? '<button class="link" data-acao="anoMat" data-v="">Limpar filtro</button>' : ''}</div>${porMat}</section></div>`;
}

function vAjustes() {
  const p = S.perfil, ks = lerChaves(), ll = lerLlama();
  const campo = (k, rot, tipo = 'text', dica = '') => `<label class="campo">${rot}${dica ? `<small>${dica}</small>` : ''}
    <input type="${tipo}" data-campo="${k}" value="${esc(p[k])}"></label>`;
  const caixa = (k, rot, dica, ph) => `<label class="campo">${rot}<small>${dica}</small><textarea data-campo="${k}" placeholder="${ph}">${esc(p[k])}</textarea></label>`;
  const acentos = [['#C2255C', 'Rosa'], ['#E64980', 'Rosa claro'], ['#7048E8', 'Roxo'], ['#3B5BDB', 'Azul'], ['#0C8599', 'Turquesa'], ['#2B8A3E', 'Verde'], ['#E8590C', 'Laranja'], ['#16181D', 'Grafite']];
  const fundos = [['#FFFFFF', 'Branco'], ['#FFF5F8', 'Rosa suave'], ['#F6F3FF', 'Lavanda'], ['#F1F8FF', 'Céu'], ['#F0FAF4', 'Menta'], ['#FFFAF0', 'Creme'], ['#F3F4F6', 'Cinza']];
  const cc = ui.coresPrev || S.cores, mudouCores = !!ui.coresPrev && (ui.coresPrev.acento !== S.cores.acento || ui.coresPrev.fundo !== S.cores.fundo);
  const bolas = (campo, lista) => lista.map(([c, n]) => `<button class="bola" style="background:${c}" data-acao="cor" data-campo="${campo}" data-v="${c}" aria-label="${n}" title="${n}" aria-pressed="${cc[campo].toLowerCase() === c.toLowerCase()}"></button>`).join('');
  return `<header><span class="rotulo">ajustes</span><h1>Do seu jeito</h1></header>
    ${avisoIa()}
    <section class="cartao"><h2>Sobre você</h2>
      ${campo('nome', 'Seu nome')}
      ${campo('vestibular', 'Vestibular', 'text', 'Ex.: ENEM, Fuvest, Unicamp')}
      ${campo('fortes', 'Matérias em que vai bem')}
      ${campo('fracas', 'Matérias com mais dificuldade')}
      <div class="linha" style="justify-content:space-between"><span class="fraco">A rotina base (horários de aula, refeições, exercício, sono) agora fica em <b>Meu dia</b>, junto de onde ela é usada.</span><button class="botao claro" data-acao="ir" data-v="meudia">Abrir Meu dia</button></div>
    </section>
    <section class="cartao"><h2>Do meu jeito</h2>
      ${caixa('jeito', 'Como você gosta que a IA te ajude', 'Tudo aqui a IA segue sempre. Ela também anota aqui o que você pedir pra ela lembrar.', 'Ex.: não gosto de química à noite; fala comigo de forma leve; prefiro blocos de 40 min')}
    </section>
    <section class="cartao"><h2>Cores</h2>
      <p class="fraco" style="margin:0">Escolha e veja a prévia ao lado. Só vale de vez quando você tocar em "Salvar estas cores".</p>
      <div class="grade-cores"><div class="coluna" style="gap:16px">
        <div class="coluna" style="gap:8px"><span class="rotulo">cor de destaque</span><div class="linha">${bolas('acento', acentos)}
          <label class="bola personalizada" title="Outra cor"><input type="color" data-cor="acento" value="${esc(cc.acento)}" aria-label="Escolher outra cor de destaque"></label></div></div>
        <div class="coluna" style="gap:8px"><span class="rotulo">cor do fundo</span><div class="linha">${bolas('fundo', fundos)}
          <label class="bola personalizada" title="Outra cor"><input type="color" data-cor="fundo" value="${esc(cc.fundo)}" aria-label="Escolher outra cor de fundo"></label></div></div>
        <div class="linha"><button class="botao" data-acao="salvarCores" ${mudouCores ? '' : 'disabled'}>Salvar estas cores</button>
          ${mudouCores ? '<button class="botao contorno" data-acao="descartarCores">Descartar</button>' : '<span class="fraco">Cores salvas.</span>'}</div></div>
        <div class="previa"><span class="rotulo">prévia</span><h3>Bom dia, Uany</h3>
          <div class="linha"><button class="botao" tabindex="-1">Só 5 minutos</button><button class="botao claro" tabindex="-1">Puxar mais um</button></div>
          <div class="linha"><span class="tag" style="--c:var(--mat)">Matemática</span><span class="tag" style="--c:var(--nat)">Biologia</span><span class="tag" style="--c:var(--lin)">Redação</span></div>
          <div class="barra grossa"><i style="width:62%"></i></div>
          <div class="trilha-previa"><i></i><i></i><i></i><b></b></div></div></div>
    </section>
    <section class="cartao"><h2>IA (Gemini grátis)</h2>
      <p class="fraco" style="margin:0">A chave fica salva só neste iPad. Se a primeira acabar a cota do dia, uso a segunda.</p>
      <label class="campo">Chave 1<input type="password" data-chave="0" value="${esc(ks[0] || '')}" autocomplete="off"></label>
      <label class="campo">Chave 2 (opcional)<input type="password" data-chave="1" value="${esc(ks[1] || '')}" autocomplete="off"></label>
      <hr>
      <p class="fraco" style="margin:0"><strong>Llama (opcional)</strong>: uma segunda IA grátis, mais folgada em quantidade. Ela cuida de conversa, planejar o dia e calibrar tempos, e deixa o Gemini para ler a sua letra à mão.</p>
      <label class="campo">Serviço<select data-llama="prov">${Object.entries(PROVEDORES).map(([k, v]) => `<option value="${k}" ${(ll.prov || 'groq') === k ? 'selected' : ''}>${v.nome}</option>`).join('')}</select></label>
      <label class="campo">Chave do Llama<input type="password" data-llama="chave" value="${esc(ll.chave || '')}" autocomplete="off"></label>
      <label class="campo">Modelo<small>Deixe em branco para usar o padrão (${esc(PROVEDORES[ll.prov || 'groq'].modelo)}).</small><input type="text" data-llama="modelo" value="${esc(ll.modelo || '')}" placeholder="${esc(PROVEDORES[ll.prov || 'groq'].modelo)}"></label>
      <div class="linha"><button class="botao claro" data-acao="testarIa">Testar a IA</button></div>
      <p class="fraco" style="margin:0;font-size:14px">Usos de hoje: ${Object.entries(usoHoje().n).map(([k, v]) => `${esc(k.split('|')[0])} ${v}${usoHoje().fim[k] ? ' (cota acabou)' : ''}`).join(' · ') || 'nenhum ainda'}.</p>
    </section>
    ${window.ajustesQuestoesHtml?.() ?? ''}
    <section class="cartao"><h2>Tempos dos assuntos</h2>
      <p class="fraco" style="margin:0">O tempo de cada assunto soma a teoria e as questões (Matemática leva mais por questão que Biologia). A IA ajusta por densidade, e isso já acontece sozinho nas próximas 4 semanas. Aqui você calibra todos de uma vez.</p>
      <div class="linha"><button class="botao claro" data-acao="calibrarTodos">Calibrar todos com a IA</button></div></section>
    <section class="cartao"><h2>Plano base</h2>
      <p class="fraco" style="margin:0">Todos os assuntos de Medicina em SP, distribuídos até dezembro de 2027. Refazer troca os assuntos e dias (o perfil e as chaves ficam).</p>
      <label class="campo">Começar a estudar em<input type="date" id="base-inicio" value="${hoje() < '2026-11-17' ? '2026-11-17' : hoje()}"></label>
      <div class="linha"><button class="botao claro" data-acao="refazerBase">Refazer o plano base</button></div>
    </section>
    <section class="cartao"><h2>Cópia de segurança</h2>
      <p class="fraco" style="margin:0">Os dados ficam neste aparelho. De vez em quando, salve uma cópia.</p>
      <div class="linha"><button class="botao claro" data-acao="exportar">Salvar cópia</button>
        <label class="botao contorno" style="display:inline-flex;align-items:center">Restaurar cópia<input type="file" accept="application/json,.json" data-acao-arquivo="importar" hidden></label></div>
      ${ui.apagar ? `<div class="linha"><span>Apagar tudo mesmo? Não tem volta.</span><button class="botao" data-acao="apagarSim">Sim, apagar</button><button class="botao contorno" data-acao="apagarNao">Não</button></div>`
        : '<div><button class="link" data-acao="apagar">Apagar todos os dados</button></div>'}
    </section>
`;
}

const VIEWS = { hoje: vHoje, semana: vSemana, mes: vMes, ano: vAno, ajustes: vAjustes };

function render() {
  document.documentElement.dataset.tema = 'cores';
  aplicarCores();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#FCF4F6';
  $('#menu').innerHTML = menuHtml();
  $('#tela').innerHTML = VIEWS[ui.view]() + (ui.carregando ? `<div class="carregando" role="status">${esc(ui.carregando)}</div>` : '');
  renderTimer();
}

// ---------- janelas ----------
function abrirModal(html) { const m = $('#modal'); m.innerHTML = `<div class="janela" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false; }
function fecharModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }

function modalAssunto(a) {
  const w0 = semAtual();
  const semanas = [0, 1, 2, 3].map(i => somaDias(w0, i * 7));
  abrirModal(`<div class="entre"><div>${tag(a.materia)}</div><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
    <h2>${esc(a.titulo)}</h2>
    <span class="fraco">${a.feito ? 'Feito' + (a.feitoEm ? ' em ' + dataLonga(a.feitoEm) : '') : `Previsto para a semana de ${semanaCurta(semDe(a))} (${estadoDe(a) === 'atrasado' ? 'atrasado' : estadoDe(a) === 'futuro' ? 'adiantável' : 'esta semana'})`} · ≈ ${fmtMin(minDe(a))} · ${nomeMes(a.mes)}</span>
    ${ehConteudo(a) ? `<span class="fraco" style="font-size:14px">${a.dens ? `Densidade ${'●'.repeat(a.dens)}${'○'.repeat(5 - a.dens)} · ` : ''}teoria ${fmtMin(tempoDe(a).t)} + ${tempoDe(a).q} questões (~${fmtMin(tempoDe(a).q * minPorQ(a.materia))})${a.calibrado ? ' · calibrado pela IA' : ''}</span>` : ''}
    <span class="rotulo">semana prevista</span>
    <div class="linha">${semanas.map((s, i) => `<button class="chip" aria-pressed="${semDe(a) === s}" data-acao="marcarSemana" data-id="${a.id}" data-v="${s}">${i === 0 ? 'Esta semana' : i === 1 ? 'Próxima' : semanaCurta(s)}</button>`).join('')}</div>
    ${ehConteudo(a) && !a.feito ? window.tempoEditorHtml?.(a) ?? '' : ''}
    <div class="linha"><button class="botao" data-acao="feitoAssunto" data-id="${a.id}">${a.feito ? 'Desmarcar feito' : 'Marcar como feito'}</button>
      ${ehConteudo(a) ? `<button class="botao claro" data-acao="questoes" data-id="${a.id}">Questões</button>` : ''}<button class="botao claro" data-acao="caderno" data-id="${a.id}">Caderno à mão</button>
      ${a.feito ? '' : `<button class="botao claro" data-acao="fazerHoje" data-id="${a.id}">Fazer hoje</button>`}
      <button class="botao contorno" data-acao="proxMes" data-id="${a.id}">Passar pro próximo mês</button>
      <button class="link" data-acao="removerAssunto" data-id="${a.id}">Apagar</button></div>`);
}

function desenharChat() {
  if (!ui.chatAberto) return;
  const m = $('#modal'), antes = $('#ia-texto')?.value ?? ui.iaTexto;
  const msgs = (S.chat || []).map((x, i, l) => `<div class="msg ${x.r} ${x.erro ? 'erro' : ''}">${esc(x.t)}${x.desfazer && ui.desfazer && i === l.length - 1 ? '<button class="link" data-acao="desfazer">Desfazer</button>' : ''}</div>`).join('');
  const sug = ['Hoje não vou conseguir estudar', 'Tô sem vontade, me ajuda a começar', 'Quero mais matemática essa semana', 'Amanhã tenho compromisso à tarde'];
  m.innerHTML = `<div class="janela chat" role="dialog" aria-modal="true">
    <div class="entre"><h2>Falar com a IA</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
    <div class="msgs" id="msgs">${msgs || '<p class="fraco" style="margin:0">Peça qualquer mudança no plano, ou só desabafe. Ela reorganiza o que precisar.</p>'}
      ${ui.carregando ? `<div class="msg ia pensando">${esc(ui.carregando)}</div>` : ''}</div>
    ${(S.chat || []).length ? '' : `<div class="linha">${sug.map(s => `<button class="chip" data-acao="sugestaoIa" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>`}
    <div class="linha" style="flex-wrap:nowrap;align-items:flex-end"><textarea id="ia-texto" data-ui="iaTexto" rows="2" placeholder="Ex.: amanhã tenho dentista às 15h" style="min-height:56px">${esc(antes)}</textarea>
      <button class="botao" data-acao="enviarIa" ${ui.carregando ? 'disabled' : ''}>Enviar</button></div></div>`;
  m.hidden = false;
  const ms = $('#msgs'); if (ms) ms.scrollTop = ms.scrollHeight;
}
function modalIa() { ui.chatAberto = true; desenharChat(); setTimeout(() => $('#ia-texto')?.focus(), 50); }


function modalTarefa() {
  const opcoes = Object.keys(MATERIAS).map(x => `<option>${x}</option>`).join('');
  abrirModal(`<div class="entre"><h2>Nova tarefa de hoje</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
    <label class="campo">O que vai estudar<input id="t-titulo" type="text" placeholder="Ex.: Revisar genética"></label>
    <label class="campo">Matéria<select id="t-materia"><option value="">—</option>${opcoes}</select></label>
    <label class="campo">Passos<small>Um por linha. Comece pelo mais fácil.</small><textarea id="t-passos" placeholder="Ler o resumo&#10;Fazer 5 exercícios&#10;Corrigir"></textarea></label>
    <div class="linha"><button class="botao" data-acao="salvarTarefa">Adicionar</button></div>`);
}

// ---------- timer ----------
let audio = null;
function bip() {
  try {
    if (!audio) return;
    [0, 0.35, 0.7].forEach(t => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(audio.destination);
      o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
    });
  } catch { }
}

function iniciarTimer(min, b, i, modo = 'foco') {
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { }
  const bloco = (S.dias[hoje()]?.blocos || []).find(x => x.id === b);
  const rotulo = modo === 'pausa' ? 'Pausa' : bloco?.passos[i]?.t || 'Foco';
  S.timer = { fim: Date.now() + min * 60000, total: min * 60000, min, modo, b, i, rotulo, acabou: false };
  salvar(); renderTimer(true);
}

function renderTimer(forcar = false) {
  const el = $('#timer'), t = S.timer;
  if (!t) { el.hidden = true; el.innerHTML = ''; el.dataset.estado = ''; return; }
  const resta = Math.max(0, t.fim - Date.now());
  if (!resta && !t.acabou) { t.acabou = true; salvar(); bip(); forcar = true; }
  const estado = t.acabou ? 'fim' : 'rodando';
  el.hidden = false;
  if (forcar || el.dataset.estado !== estado) {
    el.dataset.estado = estado;
    const marcar = t.b && t.modo !== 'pausa' ? `<button class="botao claro" data-acao="timerFeito">Passo feito!</button>` : '';
    if (!t.acabou) el.innerHTML = `<span class="rotulo">${t.modo === 'pausa' ? 'respira' : t.min === 5 ? 'só 5 minutos' : 'foco'}</span>
      <h2>${esc(t.rotulo)}</h2><div class="anel"><div><span class="tempo"></span></div></div>
      <div class="linha" style="justify-content:center">${marcar}<button class="botao contorno" data-acao="timerParar">Parar</button></div>`;
    else if (t.modo === 'pausa') el.innerHTML = `<h2>Pausa acabou</h2><div class="linha" style="justify-content:center">
      <button class="botao grande" data-acao="timerMais" data-min="25">Mais 25 min</button><button class="botao contorno" data-acao="timerParar">Parar por aqui</button></div>`;
    else if (t.min === 5) el.innerHTML = `<h2>Você começou! Esse era o mais difícil.</h2><p class="fraco">Quer seguir mais um pouco?</p>
      <div class="linha" style="justify-content:center"><button class="botao grande" data-acao="timerMais" data-min="20">Mais 20 min</button>${marcar}
      <button class="botao contorno" data-acao="timerParar">Parar por aqui</button></div>`;
    else el.innerHTML = `<h2>Bloco de foco feito!</h2><div class="linha" style="justify-content:center">
      <button class="botao grande destaque" data-acao="timerPausa">Pausa de 5 min</button>${marcar}<button class="botao contorno" data-acao="timerParar">Parar</button></div>`;
  }
  if (!t.acabou) {
    const s = Math.ceil(resta / 1000);
    const tempo = $('.tempo', el); if (tempo) tempo.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    const anel = $('.anel', el); if (anel) anel.style.setProperty('--p', String(1 - resta / t.total));
  }
}
setInterval(() => { if (S.timer && !S.timer.acabou) renderTimer(); }, 1000);

// ---------- ações ----------
function marcarPasso(b, i, ok) {
  const h = hoje(), bloco = (S.dias[h]?.blocos || []).find(x => x.id === b);
  const p = bloco?.passos[i];
  if (!p || p.ok === ok) return;
  p.ok = ok;
  S.feitos[h] = Math.max(0, (S.feitos[h] || 0) + (ok ? 1 : -1));
  if (bloco.assuntoId) setFeito(achar(bloco.assuntoId), bloco.passos.every(x => x.ok), false);
}

function contextoAtual() { return [ui.ctxTexto.trim(), ui.ctxEnergia].filter(Boolean).join(' · '); }

/** Cores personalizadas: tudo sai do acento e do fundo escolhidos. */
function aplicarCores() {
  if (ui.view !== 'ajustes') ui.coresPrev = null;
  const c = ui.coresPrev || S.cores || {}, r = document.documentElement.style;
  const hex = x => /^#[0-9a-f]{6}$/i.test(x || '');
  const a = hex(c.acento) ? c.acento : '#C2255C', f = hex(c.fundo) ? c.fundo : '#FFFFFF';
  const n = parseInt(a.slice(1), 16), lum = (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
  const set = (k, v) => r.setProperty(k, v);
  set('--bg', f); set('--acento', a); set('--sobre-acento', lum > 0.62 ? '#16181D' : '#FFFFFF');
  set('--painel', `color-mix(in srgb, ${f} 93%, #4a5068)`); set('--painel2', `color-mix(in srgb, ${a} 9%, ${f})`);
  set('--linha', `color-mix(in srgb, #4a5068 13%, ${f})`); set('--suave', `color-mix(in srgb, ${a} 15%, ${f})`);
  set('--destaque', `color-mix(in srgb, ${a} 26%, ${f})`); set('--sobre-destaque', '#16181D');
  set('--tinta', `color-mix(in srgb, ${a} 80%, #000)`);
}

function exportar() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const nome = `rotina-copia-${hoje()}.json`;
  const arq = new File([blob], nome, { type: 'application/json' });
  if (navigator.canShare?.({ files: [arq] })) { navigator.share({ files: [arq], title: nome }).catch(() => { }); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const ACOES = {
  ir: el => { ui.view = el.dataset.v; ui.apagar = false; fecharModal(); window.scrollTo(0, 0); render(); },
  fechar: () => { ui.chatAberto = false; fecharModal(); },
  fecharAviso: () => { ui.iaMsg = ''; ui.desfazer = null; render(); },
  desfazer: () => {
    if (ui.desfazer) { const chat = S.chat; S = { ...JSON.parse(ui.desfazer), chat }; S.chat.push({ r: 'ia', t: 'Desfeito.' }); salvar(); }
    ui.desfazer = null; ui.iaMsg = 'Desfeito.'; ui.chatAberto ? desenharChat() : render();
  },
  ctx: el => { ui[el.dataset.campo] = ui[el.dataset.campo] === el.dataset.v ? '' : el.dataset.v; render(); },
  horas: el => { ui.horas = +el.dataset.v; diaHoje().horas = ui.horas; salvar(); render(); },
  abrirPlanejar: () => { ui.planejar = true; render(); },
  fecharPlanejar: () => { ui.planejar = false; render(); },
  montarDia: () => {
    const d = diaHoje();
    const outro = parseFloat($('#horas-livres')?.value);
    if (outro > 0) d.horas = Math.min(16, outro);
    if (!d.horas) { ui.iaMsg = 'Escolha quantas horas livres você tem hoje.'; render(); return; }
    d.contexto = contextoAtual() || 'dia normal';
    montarHoje(); ui.planejar = false; salvar(); render();
    if (temChave() && d.blocos.length) pedirIa(`Ajuste e detalhe meu dia. Contexto de hoje: ${d.contexto}. Tenho ${d.horas}h livres (uso ${fmtMin(d.cap)} com a folga de 20%). Devolva blocos_hoje com os assuntos de blocos_de_hoje (mantenha assuntoId e min; só tire ou troque algum se o contexto pedir) e, para cada um, de 3 a 5 passos concretos e específicos do assunto, o primeiro bem fácil. Se eu pedi algo no contexto (ex.: mais de uma matéria), troque os assuntos por outros da lista com o mesmo total de minutos.`, 'Detalhando seus passos…');
  },
  maisUm: () => {
    const d = diaHoje(), a = filaPlano().find(x => !d.blocos.some(b => b.assuntoId === x.id));
    if (!a) { ui.iaMsg = 'Não há mais assuntos na fila.'; render(); return; }
    d.blocos.push(blocoDe(a)); d.cap = (d.cap || 0) + minDe(a); salvar(); render();
  },
  fazerHoje: el => {
    const a = achar(el.dataset.id), d = diaHoje();
    if (a && !d.blocos.some(b => b.assuntoId === a.id)) { d.blocos.push(blocoDe(a)); d.cap = Math.max(d.cap || 0, soma(d.blocos, b => b.min || 0)); }
    salvar(); fecharModal(); ui.view = 'hoje'; render();
  },
  marcarSemana: el => { const a = achar(el.dataset.id); if (a) { a.semana = el.dataset.v; a.mes = mesDe(somaDias(a.semana, 3)); salvar(); } fecharModal(); render(); },
  anoModo: el => { ui.anoModo = el.dataset.v; render(); },
  anoMes: el => { ui.anoMes = el.dataset.v; render(); },
  anoMat: el => { ui.anoMat = ui.anoMat === el.dataset.v ? '' : el.dataset.v; render(); },
  cor: el => { const y = window.scrollY; ui.coresPrev = { ...(ui.coresPrev || S.cores), [el.dataset.campo]: el.dataset.v }; render(); window.scrollTo(0, y); },
  salvarCores: () => { const y = window.scrollY; if (ui.coresPrev) S.cores = { ...ui.coresPrev }; ui.coresPrev = null; salvar(); ui.iaMsg = 'Cores salvas.'; render(); window.scrollTo(0, y); },
  descartarCores: () => { const y = window.scrollY; ui.coresPrev = null; render(); window.scrollTo(0, y); },
  passo: el => { marcarPasso(el.dataset.b, +el.dataset.i, el.checked); salvar(); render(); },
  tirarBloco: el => { const d = diaHoje(); d.blocos = d.blocos.filter(b => b.id !== el.dataset.b); salvar(); render(); },
  novaTarefa: () => modalTarefa(),
  salvarTarefa: () => {
    const t = $('#t-titulo').value.trim(); if (!t) return;
    const passos = $('#t-passos').value.split('\n').map(x => x.trim()).filter(Boolean);
    const d = diaHoje();
    if (!d.contexto) d.contexto = 'dia normal';
    d.blocos.push({ id: uid(), assuntoId: null, titulo: t, materia: $('#t-materia').value, min: 30,
      passos: (passos.length ? passos : ['Começar (5 min)', 'Terminar']).map(x => ({ t: x, ok: false })) });
    salvar(); fecharModal(); render();
  },
  timer: el => iniciarTimer(+el.dataset.min, el.dataset.b, +el.dataset.i),
  timerMais: el => { const t = S.timer; iniciarTimer(+el.dataset.min, t?.b, t?.i); },
  timerPausa: () => { const t = S.timer; iniciarTimer(5, t?.b, t?.i, 'pausa'); },
  timerParar: () => { S.timer = null; salvar(); renderTimer(); render(); },
  timerFeito: () => { const t = S.timer; if (t?.b) marcarPasso(t.b, t.i, true); S.timer = null; salvar(); render(); },
  semana: el => { ui.semana = el.dataset.v === '0' ? 0 : ui.semana + +el.dataset.v; render(); },
  reorganizar: el => {
    const ini = el.dataset.ini, fim = somaDias(ini, 6);
    pedirIa(`Reorganize a semana de ${ini} a ${fim}: redistribua os assuntos atrasados e os da semana entre as semanas que faltam do mês, equilibrando as matérias e a carga de minutos, para o mês fechar em dia sem sobrecarregar nenhuma semana. Use marcar_semana.`, 'Reorganizando a semana…', 'Reorganize minha semana');
  },
  assunto: el => { const a = achar(el.dataset.id); if (a) modalAssunto(a); },
  feitoAssunto: el => { const a = achar(el.dataset.id); if (a) { setFeito(a, !a.feito); salvar(); } fecharModal(); render(); },
  proxMes: el => { const a = achar(el.dataset.id); if (a) { a.mes = somaMes(a.mes, 1); a.semana = null; salvar(); } fecharModal(); render(); },
  removerAssunto: el => { S.assuntos = S.assuntos.filter(a => a.id !== el.dataset.id); salvar(); fecharModal(); render(); },
  mes: el => { ui.mes = somaMes(ui.mes, +el.dataset.v); render(); },
  abrirMes: el => { ui.mes = el.dataset.v; ui.view = 'mes'; window.scrollTo(0, 0); render(); },
  addAssunto: () => {
    const t = $('#novo-titulo').value.trim(); if (!t) return;
    S.assuntos.push({ id: uid(), mes: ui.mes, materia: $('#nova-materia').value, titulo: t, semana: null, ord: 0.5, feito: false });
    distribuirSemanas();
    salvar(); render(); $('#novo-titulo')?.focus();
  },
  sugerirMes: () => {
    const m = ui.mes, f = faseAtual(m);
    pedirIa(`Sugira os assuntos de ${nomeMes(m)} de ${m.slice(0, 4)} (mês ${m}) com novo_assunto: entre 8 e 16, títulos curtos e específicos, matérias variadas, mais peso nas matérias em que tenho dificuldade${f ? `, na fase "${f.nome}" (${f.objetivo})` : ''}. Não repita assuntos que já existem. Se o mês não tiver foco, defina com foco_mes.`, 'Pensando nos assuntos…');
  },
  planoAno: () => {
    const fim = ultimaProva()?.data || hoje();
    pedirIa(`Refaça meu plano até a última prova (${fim}): use "fases" (3 a 5 fases do mês ${mesDe(hoje())} até ${mesDe(fim)}, por exemplo base, aprofundamento, revisão e reta final, com objetivo curto) e foco_mes para cada mês desse período. Depois crie os assuntos do mês atual (${mesDe(hoje())}) com novo_assunto (8 a 14), sem repetir os que já existem.`, 'Montando seu ano…');
  },
  refazerBase: () => {
    const d = $('#base-inicio')?.value;
    if (!okData(d)) return;
    aplicarPlanoBase(d); salvar(); ui.mes = mesDe(hoje() > d ? hoje() : d); ui.view = 'ano';
    ui.iaMsg = 'Plano base refeito.'; ui.desfazer = null; render();
  },
  testarIa: async () => {
    ui.carregando = 'Testando…'; render();
    try { const r = await chamarIa('Responda {"resposta":"ok"} com uma saudação curta e animada para ela no lugar de ok.', 400); ui.iaMsg = 'A IA está funcionando' + (ui.ultimaIa ? ' (via ' + ui.ultimaIa + ')' : '') + ': ' + (r.resposta || 'ok'); }
    catch (e) { ui.iaMsg = 'A IA não respondeu: ' + e.message + '.'; }
    ui.carregando = ''; render();
  },
  exportar: () => exportar(),
  apagar: () => { ui.apagar = true; render(); },
  apagarNao: () => { ui.apagar = false; render(); },
  apagarSim: () => { S = JSON.parse(JSON.stringify(VAZIO)); salvar(); ui.apagar = false; ui.view = 'ajustes'; render(); },
  abrirIa: () => modalIa(),
  sugestaoIa: el => { const t = $('#ia-texto'); ui.iaTexto = el.dataset.v; if (t) t.value = el.dataset.v; },
  enviarIa: () => { const t = ($('#ia-texto')?.value || '').trim(); if (!t || ui.carregando) return; ui.iaTexto = ''; pedirIa(t, 'Pensando…', t); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-acao]');
  if (el && ACOES[el.dataset.acao]) ACOES[el.dataset.acao](el);
  else if (e.target.id === 'modal') fecharModal();
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.ui) ui[el.dataset.ui] = el.value;
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.campo) { S.perfil[el.dataset.campo] = el.value.trim(); salvar(); if (el.dataset.campo === 'nome') $('#menu').innerHTML = menuHtml(); }
  if (el.dataset.cor) { const y = window.scrollY; ui.coresPrev = { ...(ui.coresPrev || S.cores), [el.dataset.cor]: el.value }; render(); window.scrollTo(0, y); }
  if (el.id === 'horas-livres') { const v = parseFloat(el.value); if (v > 0) { ui.horas = Math.min(16, v); diaHoje().horas = ui.horas; salvar(); } }
  if (el.dataset.llama) { gravarLlama({ ...lerLlama(), [el.dataset.llama]: el.value.trim() }); if (el.dataset.llama === 'prov') render(); }
  if (el.dataset.chave) { const ks = lerChaves(); ks[+el.dataset.chave] = el.value.trim(); gravarChaves(ks); }
  if (el.dataset.acaoArquivo === 'importar' && el.files?.[0]) {
    el.files[0].text().then(t => {
      const novo = JSON.parse(t); const desenhos = novo.desenhos; delete novo.desenhos;
      if (!novo || !Array.isArray(novo.assuntos)) throw new Error('arquivo não é uma cópia da Rotina');
      S = Object.assign(JSON.parse(JSON.stringify(VAZIO)), novo); salvar(); if (desenhos && window.restaurarDesenhos) restaurarDesenhos(desenhos); ui.iaMsg = 'Cópia restaurada.'; render();
    }).catch(err => { ui.iaMsg = 'Não consegui restaurar: ' + err.message; render(); });
  }
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'ia-texto' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ACOES.enviarIa(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { rolar(); render(); } });

// ---------- início ----------
if (VIEWS[location.hash.slice(1)]) ui.view = location.hash.slice(1);
if (!S.semeado && !S.assuntos.length) { aplicarPlanoBase(hoje()); salvar(); } // 1ª abertura: começa hoje, para testar. Em Ajustes dá para recomeçar em 17/11.
rolar();
render();
try { navigator.storage?.persist?.(); } catch { }
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
