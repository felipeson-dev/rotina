'use strict';
/* Rotina: plano de estudos (Ano → Mês → Semana → Dia) com IA (Gemini). Tudo fica salvo só neste aparelho. */

const CHAVE = 'rotina.dados';
const CHAVE_IA = 'rotina.chaves';
const MODELOS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];

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
  perfil: { nome: '', vestibular: 'ENEM', dataProva: '', fortes: '', fracas: '', horarios: '', jeito: '' },
  tema: 'caderno', fases: [], meses: {}, assuntos: [], dias: {}, feitos: {}, timer: null,
};

function carregar() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { }
  s = Object.assign(JSON.parse(JSON.stringify(VAZIO)), s || {});
  s.perfil = Object.assign({}, VAZIO.perfil, s.perfil);
  return s;
}
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (e) { ui.iaMsg = 'Não consegui salvar neste aparelho: ' + e.message; }
}
function lerChaves() { try { return JSON.parse(localStorage.getItem(CHAVE_IA) || '[]'); } catch { return []; } }
function gravarChaves(ks) { try { localStorage.setItem(CHAVE_IA, JSON.stringify(ks)); } catch { } }
const temChave = () => lerChaves().some(k => k && k.trim());

let S = carregar();
const ui = { view: S.perfil.nome ? 'hoje' : 'ajustes', mes: mesDe(hoje()), semana: 0, iaMsg: '', desfazer: null, carregando: '',
  ctxTexto: '', ctxEnergia: '', ctxTempo: '', iaTexto: '', apagar: false };

/** O que atrasou não some: volta para "encaixar" (semana) ou passa para o mês atual, sem atrasar o resto. */
function rolar() {
  const h = hoje(), m = mesDe(h);
  let mudou = false;
  for (const a of S.assuntos) {
    if (a.feito) continue;
    if (a.dia && a.dia < h) { a.dia = null; a.atrasou = (a.atrasou || 0) + 1; mudou = true; }
    if (a.mes < m) { a.mes = m; a.atrasou = (a.atrasou || 0) + 1; mudou = true; }
  }
  if (mudou) salvar();
}

const achar = id => S.assuntos.find(a => a.id === id);
const diaHoje = () => (S.dias[hoje()] ||= { contexto: '', blocos: [] });

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
  const falta = okData(p.dataProva) ? ` A prova é em ${p.dataProva} (faltam ${diasAte(p.dataProva)} dias).` : '';
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

async function chamarIa(prompt, max = 8000) {
  const chaves = lerChaves().map(k => (k || '').trim()).filter(Boolean);
  let erro = 'sem chave';
  for (const k of chaves) {
    for (const modelo of MODELOS) {
      let r;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sistema() }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: max, temperature: 0.6 },
          }),
        });
      } catch (e) { erro = 'sem internet?'; continue; }
      if (r.ok) {
        const j = await r.json();
        const t = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
        try { return JSON.parse(t.replace(/^```(json)?|```$/g, '').trim()); } catch { erro = 'resposta incompleta'; continue; }
      }
      erro = r.status === 429 ? 'a cota grátis acabou por agora' : `erro ${r.status}`;
    }
  }
  throw new Error(erro);
}

const ACOES_IA = `Responda SÓ com JSON: {"resposta": "1 a 3 frases curtas para ela", "acoes": [ ... ]}
Ações possíveis (use só as necessárias; lista vazia se for só conversa):
- {"tipo":"marcar_dia","id":"<id do assunto>","dia":"AAAA-MM-DD" ou null}  (null = volta para "sem dia")
- {"tipo":"novo_assunto","mes":"AAAA-MM","materia":"<matéria>","titulo":"<assunto curto e específico>","dia":"AAAA-MM-DD" ou null}
- {"tipo":"mover_mes","id":"<id>","mes":"AAAA-MM"}
- {"tipo":"feito","id":"<id>","feito":true}
- {"tipo":"remover_assunto","id":"<id>"}  (só se ela pedir)
- {"tipo":"blocos_hoje","blocos":[{"assuntoId":"<id ou null>","titulo":"...","materia":"...","inicio":"HH:MM","fim":"HH:MM","passos":["...","..."]}]}  (substitui os blocos de hoje)
- {"tipo":"foco_mes","mes":"AAAA-MM","foco":"1 frase com as prioridades do mês"}
- {"tipo":"fases","fases":[{"nome":"...","inicio":"AAAA-MM","fim":"AAAA-MM","objetivo":"..."}]}  (substitui as fases do ano)
- {"tipo":"lembrar","texto":"preferência dela, curta"}  (quando ela disser como gosta das coisas)
Regras: matérias válidas: ${Object.keys(MATERIAS).join(', ')}. Use os ids exatamente como vieram. Mexa só no necessário.
Atrasos não são problema: encaixe nos próximos dias para o mês fechar. Blocos de 25 a 50 min com pausas entre eles; 2 a 4 passos por bloco, o primeiro bem fácil.`;

function contextoIa() {
  const h = hoje(), m = mesDe(h), ini = segunda(h);
  const d = S.dias[h];
  return {
    hoje: h,
    semana_atual: Array.from({ length: 7 }, (_, i) => somaDias(ini, i)),
    prova: S.perfil.dataProva || null,
    fases: S.fases,
    foco_dos_meses: S.meses,
    assuntos: S.assuntos.filter(a => a.mes <= somaMes(m, 1) && (!a.feito || a.mes === m))
      .map(a => ({ id: a.id, mes: a.mes, materia: a.materia, titulo: a.titulo, dia: a.dia, feito: a.feito, atrasou: a.atrasou || 0 })),
    contexto_de_hoje: d?.contexto || null,
    blocos_de_hoje: (d?.blocos || []).map(b => ({ titulo: b.titulo, materia: b.materia, inicio: b.inicio, fim: b.fim,
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
        case 'marcar_dia':
          if (!x) break;
          x.dia = okData(a.dia) ? a.dia : null;
          if (x.dia) x.mes = mesDe(x.dia);
          n++; break;
        case 'novo_assunto':
          if (!a.titulo) break;
          S.assuntos.push({ id: uid(), mes: okMes(a.mes) ? a.mes : mesDe(okData(a.dia) ? a.dia : h), materia: String(a.materia || 'Outra').slice(0, 30),
            titulo: String(a.titulo).slice(0, 140), dia: okData(a.dia) ? a.dia : null, feito: false, atrasou: 0 });
          n++; break;
        case 'mover_mes':
          if (x && okMes(a.mes)) { x.mes = a.mes; x.dia = null; n++; } break;
        case 'feito':
          if (x) { x.feito = a.feito !== false; n++; } break;
        case 'remover_assunto':
          if (x) { S.assuntos = S.assuntos.filter(y => y !== x); n++; } break;
        case 'blocos_hoje':
          if (!Array.isArray(a.blocos)) break;
          diaHoje().blocos = a.blocos.map(b => {
            const ref = b.assuntoId && achar(b.assuntoId);
            if (ref) { ref.dia = h; ref.mes = mesDe(h); }
            return { id: uid(), assuntoId: ref ? ref.id : null, titulo: String(b.titulo || ref?.titulo || 'Bloco'), materia: b.materia || ref?.materia || '',
              inicio: b.inicio || '', fim: b.fim || '', passos: (b.passos || []).map(t => ({ t: String(t), ok: false })) };
          });
          n++; break;
        case 'foco_mes':
          if (okMes(a.mes)) { S.meses[a.mes] = { ...(S.meses[a.mes] || {}), foco: String(a.foco || '') }; n++; } break;
        case 'fases':
          if (Array.isArray(a.fases)) {
            S.fases = a.fases.filter(f => okMes(f.inicio) && okMes(f.fim))
              .map(f => ({ nome: String(f.nome || 'Fase'), inicio: f.inicio, fim: f.fim, objetivo: String(f.objetivo || '') }));
            n++;
          } break;
        case 'lembrar':
          if (a.texto) { S.perfil.jeito = (S.perfil.jeito ? S.perfil.jeito.trim() + '\n' : '') + '- ' + String(a.texto).trim(); n++; } break;
      }
    } catch { }
  }
  return n;
}

async function pedirIa(pedido, rotulo = 'Pensando…') {
  if (!temChave()) {
    abrirModal(`<h2>Falta a chave da IA</h2><p>Cole a sua chave grátis do Gemini em <b>Ajustes</b> para a IA funcionar.</p>
      <div class="linha"><button class="botao" data-acao="ir" data-v="ajustes">Abrir Ajustes</button><button class="botao contorno" data-acao="fechar">Agora não</button></div>`);
    return;
  }
  fecharModal();
  ui.carregando = rotulo; render();
  try {
    const r = await chamarIa(`${ACOES_IA}\n\nSituação atual (JSON):\n${JSON.stringify(contextoIa())}\n\nPedido dela: ${pedido}`);
    const antes = JSON.stringify(S);
    const n = aplicar(r.acoes);
    ui.desfazer = n ? antes : null;
    ui.iaMsg = String(r.resposta || (n ? 'Pronto, organizei.' : '')).trim();
    salvar();
  } catch (e) {
    ui.iaMsg = `Não consegui falar com a IA agora (${e.message}). Tenta de novo daqui a pouco.`;
    ui.desfazer = null;
  }
  ui.carregando = '';
  render();
}

// ---------- telas ----------
function menuHtml() {
  const itens = [['ano', 'Ano'], ['mes', 'Mês'], ['semana', 'Semana'], ['hoje', 'Hoje']];
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

function vHoje() {
  const h = hoje(), d = S.dias[h] || { contexto: '', blocos: [] };
  const hr = new Date().getHours();
  const saud = hr < 5 ? 'Boa noite' : hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = S.perfil.nome ? `, ${esc(S.perfil.nome)}` : '';
  const topo = `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">${dataLonga(h)}</span><h1>${saud}${nome}</h1></div>
    ${d.contexto ? `<button class="link mao" data-acao="mudarContexto" title="Mudar">${esc(d.contexto)}</button>` : ''}</header>`;

  if (!d.contexto) return topo + avisoIa() + fasesHtml() + contextoHtml();

  const blocos = d.blocos.length ? d.blocos.map(blocoHtml).join('') : `<div class="cartao vazio">
      <p>Nenhum bloco ainda.</p><div class="linha" style="justify-content:center">
      <button class="botao" data-acao="montarDia">Montar meu dia</button><button class="botao contorno" data-acao="novaTarefa">+ Tarefa</button></div></div>`;

  let prox = null;
  for (const b of d.blocos) { const i = b.passos.findIndex(p => !p.ok); if (i >= 0) { prox = { b, i }; break; } }
  const seq = sequencia();
  const lado = `<aside class="coluna">
    <div class="cartao proximo">
      ${prox ? `<span class="rotulo">próximo passo</span><h2>${esc(prox.b.passos[prox.i].t)}</h2><span class="fraco" style="color:inherit;opacity:.75">${esc(prox.b.titulo)}</span>
        <div class="linha"><button class="botao destaque grande" data-acao="timer" data-min="5" data-b="${prox.b.id}" data-i="${prox.i}">Só 5 minutos</button>
        <button class="botao contorno" style="color:inherit" data-acao="timer" data-min="25" data-b="${prox.b.id}" data-i="${prox.i}">Foco 25</button></div>`
        : d.blocos.length ? `<span class="rotulo">hoje</span><h2>Tudo feito por hoje. Orgulho!</h2>` : `<span class="rotulo">hoje</span><h2>Monte o dia e eu te digo por onde começar.</h2>`}
    </div>
    <div class="cartao ia-cartao"><strong>${seq ? `${seq} ${seq === 1 ? 'dia' : 'dias'} seguidos estudando` : 'Um passo hoje já conta'}</strong>
      <span>${esc(faseAtual()?.objetivo || S.meses[mesDe(h)]?.foco || 'Comece pelo passo mais fácil. O resto vem.')}</span></div>
    <div class="linha"><button class="botao claro" data-acao="montarDia">Refazer com a IA</button><button class="botao contorno" data-acao="novaTarefa">+ Tarefa</button></div>
  </aside>`;
  return topo + avisoIa() + fasesHtml() + `<div class="grade2"><section class="coluna" aria-label="Blocos de hoje">${blocos}</section>${lado}</div>`;
}

function contextoHtml() {
  const chips = (campo, ops) => ops.map(o => `<button class="chip" data-acao="ctx" data-campo="${campo}" data-v="${o}" aria-pressed="${ui[campo] === o}">${o}</button>`).join('');
  const doDia = S.assuntos.filter(a => a.dia === hoje() && !a.feito);
  return `<section class="cartao" style="gap:16px">
    <h2>Como está seu dia?</h2>
    <p class="fraco" style="margin:0">Me conta rapidinho que eu monto o dia do tamanho certo. ${doDia.length ? `Marcados pra hoje: ${doDia.map(a => esc(a.titulo)).join(', ')}.` : ''}</p>
    <textarea data-ui="ctxTexto" placeholder="Ex.: aula até 13h, à tarde livre, tenho dentista às 17h">${esc(ui.ctxTexto)}</textarea>
    <div class="coluna" style="gap:8px"><span class="rotulo">energia</span><div class="linha">${chips('ctxEnergia', ['cheia de energia', 'normal', 'cansada', 'sem vontade'])}</div></div>
    <div class="coluna" style="gap:8px"><span class="rotulo">tempo livre pra estudar</span><div class="linha">${chips('ctxTempo', ['1h', '2h', '3h', '4h', '5h ou mais'])}</div></div>
    <div class="linha"><button class="botao grande" data-acao="montarDia">Montar meu dia</button>
      <button class="link" data-acao="montarSimples">Montar sem IA</button></div>
  </section>`;
}

function blocoHtml(b) {
  return `<article class="cartao bloco" style="${cor(b.materia)}">
    <div class="bloco-topo"><h3>${esc(b.titulo)}</h3>
      <span class="hora">${esc([b.inicio, b.fim].filter(Boolean).join(' – '))}</span>${b.materia ? tag(b.materia) : ''}
      <button class="x" data-acao="tirarBloco" data-b="${b.id}" aria-label="Tirar bloco">×</button></div>
    ${b.passos.map((p, i) => `<label class="passo ${p.ok ? 'ok' : ''}"><input type="checkbox" data-acao="passo" data-b="${b.id}" data-i="${i}" ${p.ok ? 'checked' : ''}><span>${esc(p.t)}</span></label>`).join('')}
  </article>`;
}

function vSemana() {
  const h = hoje(), ini = somaDias(segunda(h), ui.semana * 7);
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(ini, i));
  const meses = [...new Set(dias.map(mesDe))];
  const soltos = S.assuntos.filter(a => !a.feito && !a.dia && meses.includes(a.mes)).sort((a, b) => (b.atrasou || 0) - (a.atrasou || 0));
  const item = a => `<button class="item ${a.feito ? 'feito' : ''}" style="${cor(a.materia)}" data-acao="assunto" data-id="${a.id}">
    <i class="ponto"></i><span>${esc(a.titulo)}${a.atrasou && !a.dia ? ' <span class="atraso">· atrasou</span>' : ''}</span></button>`;
  const fim = dias[6];
  return `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">semana</span>
      <h1>${deIso(ini).getDate()} de ${nomeMes(ini)} – ${deIso(fim).getDate()} de ${nomeMes(fim)}</h1></div>
    <div class="linha"><button class="botao contorno" data-acao="semana" data-v="-1" aria-label="Semana anterior">‹</button>
      ${ui.semana ? '<button class="botao contorno" data-acao="semana" data-v="0">Esta semana</button>' : ''}
      <button class="botao contorno" data-acao="semana" data-v="1" aria-label="Próxima semana">›</button></div></header>
    ${avisoIa()}
    <section class="cartao"><div class="entre"><h2>Para encaixar <span class="fraco" style="font-size:16px">(${soltos.length})</span></h2>
      <div class="linha"><button class="botao claro" data-acao="distribuir" data-ini="${ini}" ${soltos.length ? '' : 'disabled'}>Distribuir sozinho</button>
      <button class="botao" data-acao="reorganizar" data-ini="${ini}">Reorganizar com a IA</button></div></div>
      ${soltos.length ? `<div class="linha">${soltos.map(a => `<div style="flex:0 1 260px;min-width:0">${item(a)}</div>`).join('')}</div>`
        : '<p class="fraco" style="margin:0">Tudo do mês já tem dia. Toque num assunto para mudar.</p>'}
    </section>
    <section class="semana">${dias.map(d => {
      const its = S.assuntos.filter(a => a.dia === d);
      return `<div class="dia ${d === h ? 'hoje' : ''} ${d < h ? 'passou' : ''}"><h3>${diaCurto(d)}${d === h ? ' · hoje' : ''}</h3>${its.map(item).join('') || '<span class="fraco" style="font-size:14px">livre</span>'}</div>`;
    }).join('')}</section>`;
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
    <div class="linha"><button class="botao contorno" data-acao="mes" data-v="-1" aria-label="Mês anterior">‹</button>
      <button class="botao contorno" data-acao="mes" data-v="1" aria-label="Próximo mês">›</button></div></header>
    ${avisoIa()}
    <section class="cartao">
      ${S.meses[m]?.foco ? `<p class="mao" style="margin:0">${esc(S.meses[m].foco)}</p>` : ''}
      <div class="entre"><strong>${feitos} de ${lista.length} assuntos</strong><span class="fraco">${pct}%</span></div>
      <div class="barra"><i style="width:${pct}%"></i></div>
      <p class="fraco" style="margin:0">Aqui ficam os assuntos do mês, sem dia fixo. A semana distribui; o que atrasar passa pra frente sem atrasar o mês.</p>
    </section>
    ${grupos.map(([ar, l]) => `<section class="cartao"><h2 class="linha" style="${`--c: var(--${ar})`}"><i class="ponto"></i>${AREAS[ar]}</h2><div class="lista">
      ${l.map(a => `<div class="assunto ${a.feito ? 'feito' : ''}"><input type="checkbox" data-acao="feitoAssunto" data-id="${a.id}" ${a.feito ? 'checked' : ''} aria-label="Feito">
        <button class="titulo" data-acao="assunto" data-id="${a.id}">${esc(a.titulo)} <span class="fraco" style="font-size:13px">· ${esc(a.materia)}</span></button>
        <span class="quando">${a.dia ? diaCurto(a.dia) : a.feito ? '' : 'sem dia'}</span></div>`).join('')}
    </div></section>`).join('')}
    <section class="cartao"><h2>Adicionar assunto</h2>
      <div class="linha" style="align-items:stretch"><select id="nova-materia" style="flex:0 1 200px">${opcoes}</select>
        <input id="novo-titulo" type="text" placeholder="Ex.: Funções do 2º grau" style="flex:1 1 240px">
        <button class="botao" data-acao="addAssunto">Adicionar</button></div>
      <div class="linha"><button class="botao claro" data-acao="sugerirMes">${lista.length ? 'Pedir mais assuntos à IA' : 'IA: sugerir os assuntos do mês'}</button></div>
    </section>`;
}

function vAno() {
  const p = S.perfil, m0 = mesDe(hoje());
  if (!okData(p.dataProva)) return `<header><span class="rotulo">ano</span><h1>Seu ano até a prova</h1></header>${avisoIa()}
    <section class="cartao"><p style="margin:0">Coloque a data da prova em Ajustes para eu montar o ano inteiro.</p>
    <div class="linha"><button class="botao" data-acao="ir" data-v="ajustes">Abrir Ajustes</button></div></section>`;
  const fimM = mesDe(p.dataProva);
  const meses = [];
  for (let m = m0; m <= fimM && meses.length < 24; m = somaMes(m, 1)) meses.push(m);
  return `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">ano</span>
      <h1>Faltam ${diasAte(p.dataProva)} dias</h1><span class="fraco">${esc(p.vestibular || 'Vestibular')} · ${dataLonga(p.dataProva)}</span></div>
    <button class="botao" data-acao="planoAno">${S.fases.length ? 'Refazer o plano com a IA' : 'Montar o plano do ano com a IA'}</button></header>
    ${avisoIa()}
    ${S.fases.length ? `<section class="cartao">${fasesHtml()}<div class="coluna" style="gap:6px">${S.fases.map(f =>
      `<div><strong>${esc(f.nome)}</strong> <span class="fraco">· ${nomeMes(f.inicio)} a ${nomeMes(f.fim)}${f.objetivo ? ' — ' + esc(f.objetivo) : ''}</span></div>`).join('')}</div></section>`
      : '<p class="fraco" style="margin:0">A IA divide o tempo até a prova em fases (base, aprofundamento, revisão, reta final) e dá um foco para cada mês.</p>'}
    <section class="meses">${meses.map(m => {
      const l = S.assuntos.filter(a => a.mes === m), f = l.filter(a => a.feito).length;
      return `<button class="cartao mes-cartao ${m === m0 ? 'atual' : ''}" data-acao="abrirMes" data-v="${m}">
        <div class="entre"><h3>${nomeMes(m)}</h3><span class="fraco" style="font-size:13px">${m.slice(0, 4)}</span></div>
        <p>${esc(S.meses[m]?.foco || (l.length ? '' : 'Sem assuntos ainda'))}</p>
        ${l.length ? `<div class="barra"><i style="width:${Math.round(f / l.length * 100)}%"></i></div><p>${f} de ${l.length} assuntos</p>` : ''}
      </button>`;
    }).join('')}</section>`;
}

function vAjustes() {
  const p = S.perfil, ks = lerChaves();
  const campo = (k, rot, tipo = 'text', dica = '') => `<label class="campo">${rot}${dica ? `<small>${dica}</small>` : ''}
    <input type="${tipo}" data-campo="${k}" value="${esc(p[k])}"></label>`;
  const caixa = (k, rot, dica, ph) => `<label class="campo">${rot}<small>${dica}</small><textarea data-campo="${k}" placeholder="${ph}">${esc(p[k])}</textarea></label>`;
  const temas = [['caderno', 'Caderno', ['#FCF4F6', '#C2477A', '#F6E3A0']], ['noite', 'Noite calma', ['#10141F', '#F4A6C0', '#FFB38A']], ['cores', 'Cores das áreas', ['#FFFFFF', '#3B5BDB', '#C2255C']]];
  return `<header><span class="rotulo">ajustes</span><h1>${p.nome ? 'Do seu jeito' : 'Vamos começar'}</h1></header>
    ${avisoIa()}
    <section class="cartao"><h2>Sobre você</h2>
      ${campo('nome', 'Seu nome')}
      ${campo('vestibular', 'Vestibular', 'text', 'Ex.: ENEM, Fuvest, Unicamp')}
      ${campo('dataProva', 'Data da prova', 'date')}
      ${campo('fortes', 'Matérias em que vai bem')}
      ${campo('fracas', 'Matérias com mais dificuldade')}
      ${caixa('horarios', 'Sua rotina', 'Aulas, trabalho, horários livres. A IA usa para montar os dias.', 'Ex.: aula de seg a sex até 13h; sábado livre; domingo só de manhã')}
    </section>
    <section class="cartao"><h2>Do meu jeito</h2>
      ${caixa('jeito', 'Como você gosta que a IA te ajude', 'Tudo aqui a IA segue sempre. Ela também anota aqui o que você pedir pra ela lembrar.', 'Ex.: não gosto de química à noite; fala comigo de forma leve; prefiro blocos de 40 min')}
    </section>
    <section class="cartao"><h2>Visual</h2><div class="temas">${temas.map(([v, t, cs]) =>
      `<button class="tema-op" data-acao="tema" data-v="${v}" aria-pressed="${S.tema === v}"><div class="amostra">${cs.map(c => `<i style="background:${c}"></i>`).join('')}</div><strong>${t}</strong></button>`).join('')}</div></section>
    <section class="cartao"><h2>IA (Gemini grátis)</h2>
      <p class="fraco" style="margin:0">A chave fica salva só neste iPad. Se a primeira acabar a cota do dia, uso a segunda.</p>
      <label class="campo">Chave 1<input type="password" data-chave="0" value="${esc(ks[0] || '')}" autocomplete="off"></label>
      <label class="campo">Chave 2 (opcional)<input type="password" data-chave="1" value="${esc(ks[1] || '')}" autocomplete="off"></label>
      <div class="linha"><button class="botao claro" data-acao="testarIa">Testar a IA</button></div>
    </section>
    <section class="cartao"><h2>Cópia de segurança</h2>
      <p class="fraco" style="margin:0">Os dados ficam neste aparelho. De vez em quando, salve uma cópia.</p>
      <div class="linha"><button class="botao claro" data-acao="exportar">Salvar cópia</button>
        <label class="botao contorno" style="display:inline-flex;align-items:center">Restaurar cópia<input type="file" accept="application/json,.json" data-acao-arquivo="importar" hidden></label></div>
      ${ui.apagar ? `<div class="linha"><span>Apagar tudo mesmo? Não tem volta.</span><button class="botao" data-acao="apagarSim">Sim, apagar</button><button class="botao contorno" data-acao="apagarNao">Não</button></div>`
        : '<div><button class="link" data-acao="apagar">Apagar todos os dados</button></div>'}
    </section>
    ${p.nome ? '' : '<div class="linha"><button class="botao grande" data-acao="ir" data-v="ano">Pronto, ver meu ano</button></div>'}`;
}

const VIEWS = { hoje: vHoje, semana: vSemana, mes: vMes, ano: vAno, ajustes: vAjustes };

function render() {
  document.documentElement.dataset.tema = S.tema;
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
  const ini = segunda(a.dia && a.dia >= hoje() ? a.dia : hoje());
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(ini, i)).filter(d => d >= hoje());
  abrirModal(`<div class="entre"><div>${tag(a.materia)}</div><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
    <h2>${esc(a.titulo)}</h2>
    <span class="fraco">${a.dia ? 'Marcado para ' + dataLonga(a.dia) : 'Sem dia ainda'} · ${nomeMes(a.mes)}</span>
    <span class="rotulo">colocar no dia</span>
    <div class="linha">${dias.map(d => `<button class="chip" aria-pressed="${a.dia === d}" data-acao="marcarDia" data-id="${a.id}" data-v="${d}">${diaCurto(d)}</button>`).join('')}
      <button class="chip" data-acao="marcarDia" data-id="${a.id}" data-v="">sem dia</button></div>
    <div class="linha"><button class="botao" data-acao="feitoAssunto" data-id="${a.id}">${a.feito ? 'Desmarcar feito' : 'Marcar como feito'}</button>
      <button class="botao contorno" data-acao="proxMes" data-id="${a.id}">Passar pro próximo mês</button>
      <button class="link" data-acao="removerAssunto" data-id="${a.id}">Apagar</button></div>`);
}

function modalIa() {
  const sug = ['Hoje não vou conseguir estudar', 'Tô sem vontade, me ajuda a começar', 'Quero mais matemática essa semana', 'Amanhã tenho compromisso à tarde'];
  abrirModal(`<div class="entre"><h2>Falar com a IA</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
    <p class="fraco" style="margin:0">Peça qualquer mudança no plano, ou só desabafe. Ela reorganiza o que precisar.</p>
    <textarea id="ia-texto" data-ui="iaTexto" placeholder="Ex.: amanhã tenho dentista às 15h">${esc(ui.iaTexto)}</textarea>
    <div class="linha">${sug.map(s => `<button class="chip" data-acao="sugestaoIa" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <div class="linha"><button class="botao grande" data-acao="enviarIa">Enviar</button></div>`);
  setTimeout(() => $('#ia-texto')?.focus(), 50);
}

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
  if (bloco.assuntoId) { const a = achar(bloco.assuntoId); if (a) a.feito = bloco.passos.every(x => x.ok); }
}

function montarSimples() {
  const h = hoje(), d = diaHoje();
  let lista = S.assuntos.filter(a => a.dia === h && !a.feito);
  if (!lista.length) {
    lista = S.assuntos.filter(a => !a.feito && !a.dia && a.mes === mesDe(h)).slice(0, 2);
    lista.forEach(a => a.dia = h);
  }
  d.blocos = lista.map(a => ({ id: uid(), assuntoId: a.id, titulo: a.titulo, materia: a.materia, inicio: '', fim: '',
    passos: ['Ler o resumo ou ver a aula (15 min)', 'Fazer 5 exercícios', 'Corrigir e anotar o que errou'].map(t => ({ t, ok: false })) }));
}

function contextoAtual() { return [ui.ctxTexto.trim(), ui.ctxEnergia, ui.ctxTempo && ui.ctxTempo + ' livres'].filter(Boolean).join(' · '); }

function distribuir(ini) {
  const h = hoje();
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(ini, i)).filter(d => d >= h);
  if (!dias.length) return 0;
  const m = mesDe(dias[0]);
  const fimMes = somaDias(somaMes(m, 1) + '-01', -1);
  const semanasRestantes = Math.max(1, Math.ceil((diasAte(fimMes) + 1) / 7));
  const restantes = S.assuntos.filter(a => a.mes === m && !a.feito).length;
  const naSemana = S.assuntos.filter(a => !a.feito && a.dia && a.dia >= dias[0] && a.dia <= dias[dias.length - 1]).length;
  let cota = Math.ceil(restantes / semanasRestantes) - naSemana;
  const soltos = S.assuntos.filter(a => !a.feito && !a.dia && a.mes === m).sort((a, b) => (b.atrasou || 0) - (a.atrasou || 0));
  const uteis = dias.filter(d => deIso(d).getDay() !== 0);
  const alvo = uteis.length ? uteis : dias;
  let n = 0;
  for (const a of soltos) {
    if (cota-- <= 0) break;
    alvo.sort((x, y) => S.assuntos.filter(b => b.dia === x).length - S.assuntos.filter(b => b.dia === y).length || (x < y ? -1 : 1));
    a.dia = alvo[0]; n++;
  }
  return n;
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
  fechar: () => fecharModal(),
  fecharAviso: () => { ui.iaMsg = ''; ui.desfazer = null; render(); },
  desfazer: () => { if (ui.desfazer) { S = JSON.parse(ui.desfazer); salvar(); } ui.desfazer = null; ui.iaMsg = 'Desfeito.'; render(); },
  ctx: el => { ui[el.dataset.campo] = ui[el.dataset.campo] === el.dataset.v ? '' : el.dataset.v; render(); },
  montarDia: () => {
    const h = hoje(), d = diaHoje();
    if (!d.contexto) d.contexto = contextoAtual() || 'dia normal';
    salvar();
    pedirIa(`Monte meu dia de hoje com a ação blocos_hoje. Contexto de hoje: ${d.contexto}. Comece a partir de ${agoraHm()}.
Use os assuntos marcados para hoje (${h}); se for pouco para o tempo livre, puxe assuntos sem dia ou atrasados do mês com marcar_dia para hoje. Se ela estiver cansada ou sem vontade, faça um dia mais curto e leve.`, 'Montando seu dia…');
  },
  montarSimples: () => { const d = diaHoje(); d.contexto = contextoAtual() || 'dia normal'; montarSimples(); salvar(); render(); },
  mudarContexto: () => { const d = diaHoje(); ui.ctxTexto = d.contexto; d.contexto = ''; salvar(); render(); },
  passo: el => { marcarPasso(el.dataset.b, +el.dataset.i, el.checked); salvar(); render(); },
  tirarBloco: el => { const d = diaHoje(); d.blocos = d.blocos.filter(b => b.id !== el.dataset.b); salvar(); render(); },
  novaTarefa: () => modalTarefa(),
  salvarTarefa: () => {
    const t = $('#t-titulo').value.trim(); if (!t) return;
    const passos = $('#t-passos').value.split('\n').map(x => x.trim()).filter(Boolean);
    const d = diaHoje();
    if (!d.contexto) d.contexto = 'dia normal';
    d.blocos.push({ id: uid(), assuntoId: null, titulo: t, materia: $('#t-materia').value, inicio: '', fim: '',
      passos: (passos.length ? passos : ['Começar (5 min)', 'Terminar']).map(x => ({ t: x, ok: false })) });
    salvar(); fecharModal(); render();
  },
  timer: el => iniciarTimer(+el.dataset.min, el.dataset.b, +el.dataset.i),
  timerMais: el => { const t = S.timer; iniciarTimer(+el.dataset.min, t?.b, t?.i); },
  timerPausa: () => { const t = S.timer; iniciarTimer(5, t?.b, t?.i, 'pausa'); },
  timerParar: () => { S.timer = null; salvar(); renderTimer(); render(); },
  timerFeito: () => { const t = S.timer; if (t?.b) marcarPasso(t.b, t.i, true); S.timer = null; salvar(); render(); },
  semana: el => { ui.semana = el.dataset.v === '0' ? 0 : ui.semana + +el.dataset.v; render(); },
  distribuir: el => { const n = distribuir(el.dataset.ini); ui.iaMsg = n ? `Encaixei ${n} ${n === 1 ? 'assunto' : 'assuntos'} nesta semana.` : 'A cota desta semana já está cheia. O resto fica pras próximas.'; ui.desfazer = null; salvar(); render(); },
  reorganizar: el => {
    const ini = el.dataset.ini, fim = somaDias(ini, 6);
    pedirIa(`Reorganize a semana de ${ini} a ${fim}: encaixe os assuntos sem dia e os atrasados nos dias que faltam (a partir de hoje, ${hoje()}), equilibrando as matérias e respeitando minha rotina, para o mês fechar em dia sem sobrecarregar nenhum dia. Use marcar_dia.`, 'Reorganizando a semana…');
  },
  assunto: el => { const a = achar(el.dataset.id); if (a) modalAssunto(a); },
  marcarDia: el => { const a = achar(el.dataset.id); if (a) { a.dia = el.dataset.v || null; if (a.dia) a.mes = mesDe(a.dia); salvar(); } fecharModal(); render(); },
  feitoAssunto: el => { const a = achar(el.dataset.id); if (a) { a.feito = !a.feito; salvar(); } fecharModal(); render(); },
  proxMes: el => { const a = achar(el.dataset.id); if (a) { a.mes = somaMes(a.mes, 1); a.dia = null; salvar(); } fecharModal(); render(); },
  removerAssunto: el => { S.assuntos = S.assuntos.filter(a => a.id !== el.dataset.id); salvar(); fecharModal(); render(); },
  mes: el => { ui.mes = somaMes(ui.mes, +el.dataset.v); render(); },
  abrirMes: el => { ui.mes = el.dataset.v; ui.view = 'mes'; window.scrollTo(0, 0); render(); },
  addAssunto: () => {
    const t = $('#novo-titulo').value.trim(); if (!t) return;
    S.assuntos.push({ id: uid(), mes: ui.mes, materia: $('#nova-materia').value, titulo: t, dia: null, feito: false, atrasou: 0 });
    salvar(); render(); $('#novo-titulo')?.focus();
  },
  sugerirMes: () => {
    const m = ui.mes, f = faseAtual(m);
    pedirIa(`Sugira os assuntos de ${nomeMes(m)} de ${m.slice(0, 4)} (mês ${m}) com novo_assunto: entre 8 e 16, títulos curtos e específicos, matérias variadas, mais peso nas matérias em que tenho dificuldade${f ? `, na fase "${f.nome}" (${f.objetivo})` : ''}. Não repita assuntos que já existem. Se o mês não tiver foco, defina com foco_mes.`, 'Pensando nos assuntos…');
  },
  planoAno: () => {
    const p = S.perfil;
    pedirIa(`Monte meu plano até a prova (${p.dataProva}): use "fases" (3 a 5 fases do mês ${mesDe(hoje())} até ${mesDe(p.dataProva)}, por exemplo base, aprofundamento, revisão e reta final, com objetivo curto) e foco_mes para cada mês desse período. Depois crie os assuntos do mês atual (${mesDe(hoje())}) com novo_assunto (8 a 14), sem repetir os que já existem.`, 'Montando seu ano…');
  },
  tema: el => { S.tema = el.dataset.v; salvar(); render(); },
  testarIa: async () => {
    ui.carregando = 'Testando…'; render();
    try { const r = await chamarIa('Responda {"resposta":"ok"} com uma saudação curta e animada para ela no lugar de ok.', 400); ui.iaMsg = 'A IA está funcionando: ' + (r.resposta || 'ok'); }
    catch (e) { ui.iaMsg = 'A IA não respondeu: ' + e.message + '. Confira a chave.'; }
    ui.carregando = ''; render();
  },
  exportar: () => exportar(),
  apagar: () => { ui.apagar = true; render(); },
  apagarNao: () => { ui.apagar = false; render(); },
  apagarSim: () => { S = JSON.parse(JSON.stringify(VAZIO)); salvar(); ui.apagar = false; ui.view = 'ajustes'; render(); },
  abrirIa: () => modalIa(),
  sugestaoIa: el => { const t = $('#ia-texto'); ui.iaTexto = el.dataset.v; if (t) t.value = el.dataset.v; },
  enviarIa: () => { const t = ($('#ia-texto')?.value || '').trim(); if (!t) return; ui.iaTexto = ''; pedirIa(t); },
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
  if (el.dataset.chave) { const ks = lerChaves(); ks[+el.dataset.chave] = el.value.trim(); gravarChaves(ks); }
  if (el.dataset.acaoArquivo === 'importar' && el.files?.[0]) {
    el.files[0].text().then(t => {
      const novo = JSON.parse(t);
      if (!novo || !Array.isArray(novo.assuntos)) throw new Error('arquivo não é uma cópia da Rotina');
      S = Object.assign(JSON.parse(JSON.stringify(VAZIO)), novo); salvar(); ui.iaMsg = 'Cópia restaurada.'; render();
    }).catch(err => { ui.iaMsg = 'Não consegui restaurar: ' + err.message; render(); });
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { rolar(); render(); } });

// ---------- início ----------
if (VIEWS[location.hash.slice(1)] && S.perfil.nome) ui.view = location.hash.slice(1);
rolar();
render();
try { navigator.storage?.persist?.(); } catch { }
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
