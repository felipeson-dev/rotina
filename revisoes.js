'use strict';
/* Revisões espaçadas: o assunto estudado volta sozinho (1 semana, depois 1 mês, depois a cada ~2 meses), adaptando ao acerto dela:
   foi bem (80%+) = demora mais; foi mal (<60%) = volta em 4 dias e com um pouco de teoria. Em 2 dias da semana (padrão: quarta e sábado)
   parte do estudo vira "questões de assuntos já estudados", escolhidos pelo app (vencidos, fracos, mais cobrados) ou marcados por ela.
   Também: "Fazer questões no app" direto do assunto (Hoje, janela do assunto e revisões), abatendo o passo de questões do bloco. */
const diasRev = () => S.perfil.diasRev || [3, 6];   // dias de revisão (0 = domingo … 6 = sábado); padrão: quarta e sábado
const INTERVALOS_REV = [7, 30, 60];     // dias até a 1ª, 2ª e as próximas voltas

/** Quantas questões oficiais desse assunto há no banco (o quanto ele cai nas provas). */
function cobranca(a) { return BANCO.pronto ? BANCO.itens.filter(q => q.m === a.materia && q.as === tagDe(a)).length : 0; }

/** Acerto dela nas questões do banco desse assunto (última tentativa de cada uma) ou nas que ela registrou. */
function acertoDe(a) {
  let f = 0, ok = 0;
  if (BANCO.pronto) for (const q of BANCO.itens) if (q.m === a.materia && q.as === tagDe(a) && S.qh[q.id]) { f++; if (S.qh[q.id].ok) ok++; }
  if (a.questoes?.feitas) { f += a.questoes.feitas; ok += a.questoes.acertos; }
  return f >= 3 ? Math.round(ok / f * 100) : null;
}

function agendarRev(a, pct = null) {
  const r = a.rev ||= { n: 0, hist: [] };
  if (pct != null) r.hist = [...(r.hist || []), [hoje(), pct]].slice(-8);
  const base = INTERVALOS_REV[Math.min(r.n, INTERVALOS_REV.length - 1)];
  const dias = pct == null ? base : pct >= 80 ? Math.round(base * 1.5) : pct >= 60 ? base : 4;
  r.teoria = pct != null && pct < 60;
  r.prox = somaDias(hoje(), dias);
}

/** Uma volta da revisão foi feita (com o acerto, se ela fez questões). */
function revisaoFeita(a, pct = null) {
  if (!a.rev) return;
  a.rev.n += pct == null || pct >= 60 ? 1 : 0;   // foi mal: a contagem não anda (volta logo, mais simples)
  a.rev.ult = hoje(); agendarRev(a, pct);
}

// estudou o assunto: a 1ª volta fica para daqui a 1 semana
{ const s0 = setFeito; setFeito = function (a, ok, sinc) { const antes = a && !!a.feito; s0.apply(this, arguments); if (!a || antes === ok) return;
  // tópico dividido em partes: a revisão começa quando a última parte é feita
  if (ok && ehConteudo(a) && (!a.parte || a.parte[0] === a.parte[1])) { a.rev = { n: 0, hist: [] }; agendarRev(a); } else if (!ok) delete a.rev; }; }

const estudados = () => S.assuntos.filter(a => a.feito && ehConteudo(a) && (!a.parte || a.parte[0] === a.parte[1]));   // tópico em partes conta uma vez (a última)
const vencidas = (dia = hoje()) => estudados().filter(a => a.rev?.prox && a.rev.prox <= dia).sort((x, y) => x.rev.prox < y.rev.prox ? -1 : 1);

/** Os assuntos já estudados que mais precisam de questões agora: vencidos, marcados como fracos, com acerto baixo, mais cobrados, há mais tempo sem ver. */
function escolherRevisao(n, fora = []) {
  const h = hoje();
  return estudados().filter(a => !fora.includes(a.id)).map(a => {
    const pct = acertoDe(a), atraso = a.rev?.prox && a.rev.prox <= h ? (deIso(h) - deIso(a.rev.prox)) / 864e5 : -1;
    const semVer = (deIso(h) - deIso(a.rev?.ult || a.feitoEm || h)) / 864e5;
    const nota = (atraso >= 0 ? 100 + atraso : 0) + (a.fraco ? 40 : 0) + (pct != null && pct < 60 ? 30 : pct != null && pct < 75 ? 12 : 0) + Math.log2(1 + cobranca(a)) * 4 + Math.min(20, semVer / 3);
    return { a, nota };
  }).sort((x, y) => y.nota - x.nota).slice(0, n).map(x => x.a);
}

const blocoRev = (titulo, lista, min, vaga) => ({ id: uid(), assuntoId: null, tipo: 'revisao', vaga, revisao: lista.map(a => a.id), titulo, materia: lista.length === 1 ? lista[0].materia : 'Revisão', min,
  passos: [...(lista.some(a => a.rev?.teoria) ? [{ t: 'Reler o resumo dos que foram mal da última vez (15 min)', ok: false }] : []), { t: `Fazer as questões (${lista.length * (vaga === 'dia' ? 3 : 5)} a ${lista.length * (vaga === 'dia' ? 4 : 6)}): no app ou no livro`, ok: false }, { t: 'Olhar os erros e anotar o que esqueceu', ok: false }] });

/* Revisão com tempo FIXO, pré-programado: uma vaga curta todo dia e uma vaga maior nos dias de revisão (Ajustes).
   O tamanho das vagas nunca cresce: se houver mais revisões vencidas do que cabe, as menos urgentes esperam a próxima vaga.
   O app escolhe os assuntos (24–48 h depois para exatas, vencidos, fracos, mais cobrados) e ela pode trocar. */
// a partir de março (fase de aprofundamento) as vagas crescem um pouco, se ela não mudou nada em Ajustes
function cfgRev() { const tarde = hoje() >= '2027-03-01'; return { diario: tarde ? 30 : 20, maior: tarde ? 180 : 150, ...(S.perfil.revCfg || {}) }; }
/** Assunto do banco de questões que corresponde ao tópico (o cronograma usa tópicos mais finos que o banco). */
const tagDe = a => a.tag || a.titulo;
const nomeDe = a => a.nome || a.titulo;
const PESADAS_REV = ['Matemática', 'Física', 'Química'];
/** Exatas estudadas há 1 ou 2 dias, ainda sem a revisão rápida de fixação. */
const fixacao = () => estudados().filter(a => PESADAS_REV.includes(a.materia) && a.rev && !a.rev.fix && a.feitoEm && a.feitoEm < hoje() && a.feitoEm >= somaDias(hoje(), -2));

{ const m0 = montarHoje; montarHoje = function (cap, so = []) {
  const d = diaHoje(), per = periodoDeHoje(), c = cfgRev();
  d.blocos = d.blocos.filter(b => b.tipo !== 'revisao' || b.passos.some(p => p.ok) || b.escolhidos);   // refaz as vagas que ela não começou nem escolheu
  const ja = d.blocos.filter(b => b.tipo === 'revisao'), usados = ja.flatMap(b => b.revisao);
  const capOk = cap > 0 ? cap : d.cap || 0;
  const novos = [];
  if (!(so || []).length && !per?.so && capOk >= 90) {
    // vaga do dia (curta): primeiro a fixação das exatas, depois as vencidas mais urgentes; ~10 min por assunto
    if (c.diario > 0 && !ja.some(b => b.vaga === 'dia')) {
      const n = Math.max(1, Math.floor(c.diario / 10)), l = [...fixacao(), ...vencidas()].filter((a, i, v) => v.indexOf(a) === i && !usados.includes(a.id)).slice(0, n);
      if (l.length) novos.push(blocoRev(`Revisão do dia: ${l.map(nomeDe).join(' · ')}`, l, c.diario, 'dia'));
    }
    // vaga maior, nos dias de revisão: questões de assuntos já estudados; ~30 min por assunto
    if (c.maior > 0 && diasRev().includes(deIso(hoje()).getDay()) && !ja.some(b => b.vaga === 'semana')) {
      const fora = [...usados, ...novos.flatMap(b => b.revisao)], l = escolherRevisao(Math.max(1, Math.floor(c.maior / 30)), fora);
      if (l.length) novos.push(blocoRev('Revisão da semana: questões de assuntos já estudados', l, c.maior, 'semana'));
    }
  }
  const usado = soma(novos, b => b.min);
  m0.call(this, Math.max(1, capOk - usado), so);
  d.cap = capOk; d.blocos.push(...novos);
}; }
// marcou todos os passos de um bloco de revisão: a volta conta como feita (sem acerto, se ela fez fora do app)
{ const p0 = ACOES.passo; ACOES.passo = el => { p0(el); const b = diaHoje().blocos.find(x => x.id === el.dataset.b);
  if (b?.tipo === 'revisao' && !b.contou && b.passos.every(p => p.ok)) { b.contou = true; b.revisao.map(achar).filter(Boolean).forEach(a => revisaoFeita(a)); salvar(); } }; }

/** A volta de 24–48 h das exatas não muda o calendário das outras voltas (7 dias, 1 mês): só marca que a fixação foi feita. */
{ const r0 = revisaoFeita; revisaoFeita = function (a, pct) { if (a?.rev && !a.rev.fix && PESADAS_REV.includes(a.materia) && a.feitoEm >= somaDias(hoje(), -2) && a.rev.n === 0) { a.rev.fix = hoje(); if (pct != null && pct < 60) a.rev.prox = somaDias(hoje(), 4); return; } return r0.apply(this, arguments); }; }

/** Abre uma lista com questões do banco desses assuntos: primeiro as que ela errou ou ainda não fez. */
async function questoesDosAssuntos(lista, extra = {}, porAssunto = 5) {
  if (!BANCO.pronto) await carregarBanco();
  const prio = q => S.qh[q.id] ? (S.qh[q.id].ok ? 2 : 0) : 1, ids = [];
  for (const a of lista) {
    const l = BANCO.itens.filter(q => q.m === a.materia && q.as === tagDe(a) && !q.f).sort((x, y) => prio(x) - prio(y) || Math.random() - 0.5);
    ids.push(...l.slice(0, porAssunto).map(q => q.id));
  }
  if (!ids.length) {
    // sem questão desse assunto no banco: abre as questões da matéria, já filtradas
    ui.view = 'questoes'; ui.qAba = 'listas'; ui.qs = null; ui.qf.mat = lista[0]?.materia || ''; ui.qf.assunto = '';
    ui.iaMsg = 'Ainda não há questões desse assunto no banco: abri as da matéria.'; window.scrollTo(0, 0); render(); return;
  }
  ui.view = 'questoes'; ui.qAba = 'listas'; window.scrollTo(0, 0);
  await ACOES.qIniciarIds(ids.sort(() => Math.random() - 0.5));
  Object.assign(ui.qs, extra); render();
}

// fim da lista: cada assunto revisado anda (com o acerto dela), e o passo de questões do bloco de hoje é abatido
{ const f0 = finalizarSessao; finalizarSessao = function () {
  const s = ui.qs; f0.apply(this, arguments);
  const feitas = s.itens.filter(q => q.resp != null);
  for (const id of s.revisaoIds || []) {
    const a = achar(id); if (!a) continue;
    const l = feitas.filter(q => q.materia === a.materia && q.assunto === tagDe(a));
    revisaoFeita(a, l.length >= 2 ? Math.round(l.filter(q => q.certo).length / l.length * 100) : null);
  }
  const ids = [...(s.revisaoIds || []), ...(s.assuntoId ? [s.assuntoId] : [])];
  if (feitas.length) for (const b of diaHoje().blocos) {
    if (!(ids.includes(b.assuntoId) || (b.revisao || []).some(x => s.revisaoIds?.includes(x)))) continue;
    const p = b.passos.find(p => !p.ok && /quest/i.test(p.t)); if (p) p.ok = true;
    if (b.tipo === 'revisao') b.contou = true;
  }
  salvar();
}; }

Object.assign(ACOES, {
  qDoAssunto: async el => { const a = achar(el.dataset.id); if (!a) return; fecharModal(); await questoesDosAssuntos([a], { assuntoId: a.id }, Math.max(5, Math.min(30, tempoDe(a).q || 10))); },
  qDaRevisao: async el => { const b = diaHoje().blocos.find(x => x.id === el.dataset.b); const l = (b?.revisao || []).map(achar).filter(Boolean); if (l.length) await questoesDosAssuntos(l, { revisaoIds: l.map(a => a.id) }); },
  fraco: el => { const a = achar(el.dataset.id); if (!a) return; a.fraco = !a.fraco; salvar(); ui.iaMsg = a.fraco ? `Anotado: "${a.titulo}" entra nas próximas revisões.` : 'Tirei a marca de fraco.'; fecharModal(); render(); },
  diaRev: el => { const v = +el.dataset.v, l = diasRev(); S.perfil.diasRev = l.includes(v) ? l.filter(x => x !== v) : [...l, v].sort(); salvar(); render(); },
  revCfg: el => { S.perfil.revCfg = { ...cfgRev(), [el.dataset.k]: +el.dataset.v }; salvar(); render(); },
  // ela escolhe os assuntos de uma vaga de revisão (a vaga continua com o mesmo tempo)
  revEscolher: el => {
    const b = diaHoje().blocos.find(x => x.id === el.dataset.b); if (!b) return;
    const ordem = escolherRevisao(999), max = Math.max(1, Math.floor(b.min / (b.vaga === 'dia' ? 10 : 30)));
    abrirModal(`<div class="entre"><h2>Escolher os assuntos</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
      <p class="fraco" style="margin:0">Até ${max} ${max === 1 ? 'assunto cabe' : 'assuntos cabem'} nesta revisão (${fmtMin(b.min)}). Os primeiros da lista são os que o app acha mais importantes agora.</p>
      ${ordem.length ? `<div class="rev-escolha">${ordem.map(a => `<label class="marca-q"><input type="checkbox" data-rev-esc="${a.id}" ${b.revisao.includes(a.id) ? 'checked' : ''}> <span><span class="tag" style="${cor(a.materia)}">${esc(a.materia)}</span> ${esc(nomeDe(a))}${a.fraco ? ' · fraco' : ''}${acertoDe(a) != null ? ` · ${acertoDe(a)}%` : ''}${a.rev?.prox && a.rev.prox <= hoje() ? ' · vencida' : ''}</span></label>`).join('')}</div>`
        : '<p style="margin:0">Ainda não há assuntos estudados. Quando você marcar assuntos como feitos, eles aparecem aqui.</p>'}
      <div class="linha"><button class="botao" data-acao="revEscolhidos" data-b="${b.id}" data-max="${max}">Usar estes</button></div>`);
  },
  revEscolhidos: el => {
    const b = diaHoje().blocos.find(x => x.id === el.dataset.b); if (!b) return;
    const ids = [...document.querySelectorAll('[data-rev-esc]:checked')].map(x => x.dataset.revEsc).slice(0, +el.dataset.max);
    const l = ids.map(achar).filter(Boolean), novo = blocoRev(b.vaga === 'dia' ? `Revisão do dia: ${l.map(nomeDe).join(' · ') || 'sem assuntos'}` : b.titulo, l, b.min, b.vaga);
    Object.assign(b, { revisao: novo.revisao, titulo: novo.titulo, materia: novo.materia, passos: novo.passos, escolhidos: true });
    salvar(); fecharModal(); render();
  },
});

// botões nos blocos de hoje e na janela do assunto
{ const b0 = blocoHtml; blocoHtml = function (b) {
  let h = b0.apply(this, arguments);
  if (b.tipo === 'revisao') {
    const l = (b.revisao || []).map(achar).filter(Boolean);
    return h.replace('</article>', `<div class="rev-lista">${l.map(a => `<span class="tag" style="${cor(a.materia)}">${esc(nomeDe(a))}${a.fraco ? ' · fraco' : ''}${acertoDe(a) != null ? ` · ${acertoDe(a)}%` : ''}</span>`).join('')}</div>
      <div class="linha acoes-bloco">${l.length ? `<button class="botao claro" data-acao="qDaRevisao" data-b="${b.id}">Fazer as questões no app</button>` : ''}<button class="link" data-acao="revEscolher" data-b="${b.id}">${b.escolhidos ? 'Trocar os assuntos' : 'Escolher eu mesma'}</button></div></article>`);
  }
  const a = b.assuntoId && achar(b.assuntoId);
  return a && ehConteudo(a) ? h.replace('<div class="linha acoes-bloco">', `<div class="linha acoes-bloco"><button class="link" data-acao="qDoAssunto" data-id="${a.id}">Fazer questões no app</button>`) : h;
}; }
{ const m0 = modalAssunto; modalAssunto = function (a) {
  m0.apply(this, arguments);
  if (!ehConteudo(a)) return;
  const linha = document.querySelector('#modal .janela > .linha:last-child');
  const rev = a.rev ? `<span class="fraco" style="font-size:14px">Revisão: ${a.rev.n === 0 ? '1ª volta' : `${a.rev.n + 1}ª volta`} em ${diaCurto(a.rev.prox)}${acertoDe(a) != null ? ` · acerto ${acertoDe(a)}%` : ''}</span>` : '';
  linha?.insertAdjacentHTML('beforebegin', rev);
  linha?.insertAdjacentHTML('afterbegin', `<button class="botao" data-acao="qDoAssunto" data-id="${a.id}">Fazer questões no app</button><button class="botao contorno" data-acao="fraco" data-id="${a.id}">${a.fraco ? 'Não estou mais fraca nisso' : 'Estou fraca nisso'}</button>`);
}; }

// Ajustes: as vagas de revisão (tempo fixo) e os dias da revisão maior
{ const v0 = VIEWS.ajustes; VIEWS.ajustes = function () {
  const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], c = cfgRev();
  const op = (k, vs) => vs.map(v => `<button class="chip" data-acao="revCfg" data-k="${k}" data-v="${v}" aria-pressed="${c[k] === v}">${v ? fmtMin(v) : 'nenhuma'}</button>`).join('');
  return v0() + `<section class="cartao"><h2>Revisões</h2>
    <p class="fraco" style="margin:0">As revisões têm hora marcada e tempo fixo: o resto do dia nunca é engolido por elas. O assunto estudado volta em 1 semana, depois em 1 mês (e se adapta ao seu acerto); exatas ganham também uma revisão rápida 1 a 2 dias depois. Se acumular mais do que cabe, as menos urgentes esperam a próxima vaga.</p>
    <span class="rotulo">revisão do dia (todo dia)</span><div class="linha">${op('diario', [0, 15, 20, 30, 45])}</div>
    <span class="rotulo">revisão maior</span><div class="linha">${op('maior', [0, 60, 90, 120, 150, 180])}</div>
    <span class="rotulo">dias da revisão maior</span><div class="linha">${nomes.map((n, i) => `<button class="chip" data-acao="diaRev" data-v="${i}" aria-pressed="${diasRev().includes(i)}">${n}</button>`).join('')}</div>
    <p class="fraco" style="margin:0;font-size:14px">Por semana: ${fmtMin(c.diario * 6 + c.maior * diasRev().length)} de revisão · ${estudados().length} assuntos já estudados · ${vencidas().length} vencidas hoje · ${estudados().filter(a => a.fraco).length} marcados como fracos</p></section>`;
}; }