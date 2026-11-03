// Aba Desempenho: como ela está indo nas questões (por matéria e por assunto), no plano e na redação, e o que treinar.
// Usa o que o app já guarda: S.qlog (por dia e matéria), S.qh (última vez de cada questão), S.assuntos, S.erros e S.redacoes.
ICONES.desempenho = '<path d="M4 20V10M10 20V4M16 20v-7"/><path d="M2 20h20"/>';
ui.dsPer = 'mes';
// nota da IA ou, se não tiver, a última correção que ela anotou (professor, cursinho)
const notaRedDe = e => e.nota ?? (e.correcoes?.length ? e.correcoes[e.correcoes.length - 1].nota : null);
const DS_PERIODOS = [['semana', '7 dias'], ['mes', '30 dias'], ['tudo', 'Tudo']];

const dsCorAc = p => p == null ? 'var(--fraco)' : p >= 70 ? '#2E8B57' : p >= 50 ? '#C98A12' : '#C2483D';
const dsMin = seg => seg >= 60 ? fmtMin(Math.round(seg / 6) / 10) : `${Math.round(seg)} s`;

function dsDias(per) {
  const h = hoje();
  if (per === 'tudo') return Object.keys(S.qlog).sort();
  return Array.from({ length: per === 'semana' ? 7 : 30 }, (_, i) => somaDias(h, i - (per === 'semana' ? 6 : 29)));
}

/** Barras do período: um dia por barra (até 30) ou uma semana por barra (quando é "Tudo"). */
function dsSerie(per) {
  const dias = dsDias(per);
  if (per !== 'tudo') return dias.map(d => { const l = qDia(d), f = soma(l, ([, v]) => v.f), a = soma(l, ([, v]) => v.a), s = soma(l, ([, v]) => v.s || 0); return { d, rot: String(deIso(d).getDate()), f, ac: acerto(f, a, s) }; });
  const sem = {};
  for (const d of dias) { const w = segunda(d), x = (sem[w] ||= { d: w, f: 0, a: 0, s: 0 }); for (const [, v] of qDia(d)) { x.f += v.f; x.a += v.a; x.s += v.s || 0; } }
  return Object.values(sem).sort((a, b) => a.d < b.d ? -1 : 1).slice(-14).map(x => ({ d: x.d, rot: semanaCurta(x.d), f: x.f, ac: acerto(x.f, x.a, x.s) }));
}

function dsSequencia() {
  let n = 0, d = hoje();
  if (!feitasDia(d)) d = somaDias(d, -1);
  while (feitasDia(d) > 0 && n < 400) { n++; d = somaDias(d, -1); }
  return n;
}

// por que ela errou: marcado na própria questão (fica em S.qh[id].h[n][3]) e opcional
const MOTIVOS = [['conteudo', 'Não sabia o conteúdo'], ['atencao', 'Falta de atenção'], ['enunciado', 'Não entendi a pergunta'], ['pressa', 'Pressa ou falta de tempo']];
const DS_PROVAS = /fuvest|santa casa|einstein|unifesp|s[aã]o camilo|fmabc|famerp|enem/i;   // as provas dela

function motivoHtml(q) {
  if (q.certo || !q.id || q.tipo === 'disc') return '';
  const l = S.qh[q.id]?.h, atual = l?.length ? l[l.length - 1][3] : '';
  return `<div class="mot-erro"><span class="rotulo">por que errou? (opcional)</span><div class="linha" style="gap:6px">${MOTIVOS.map(([v, t]) => `<button class="chip" data-acao="qMotivo" data-v="${v}" aria-pressed="${atual === v}">${t}</button>`).join('')}</div></div>`;
}

// questões que ela marcou com erro: a lista sai por "Copiar lista" para corrigir no banco depois
S.qProblemas ||= {};
const TIPOS_PROBLEMA = [['texto', 'Texto errado'], ['gabarito', 'Gabarito errado'], ['tema', 'Tema errado'], ['imagem', 'Imagem cortada ou ilegível'], ['outro', 'Outro']];
const nomeProblema = v => TIPOS_PROBLEMA.find(t => t[0] === v)?.[1] || 'Outro';

function problemaHtml(q) {
  if (!q.id) return '';
  const p = S.qProblemas[q.id];
  if (p) return `<div class="mot-erro"><span class="fraco" style="font-size:14px">Marcada com erro: ${nomeProblema(p.tipo)}.</span><button class="link" data-acao="qProblemaTirar" style="align-self:flex-start;font-size:14px">Desfazer</button></div>`;
  if (ui.qProblemaDe !== q.id) return `<button class="link" data-acao="qProblemaAbrir" style="align-self:flex-start;font-size:14px">Esta questão tem erro?</button>`;
  return `<div class="mot-erro"><span class="rotulo">qual é o erro?</span><div class="linha" style="gap:6px">${TIPOS_PROBLEMA.map(([v, t]) => `<button class="chip" data-acao="qProblemaMarcar" data-v="${v}">${t}</button>`).join('')}</div></div>`;
}

const textoProblemas = () => Object.entries(S.qProblemas).map(([id, p]) => `${id} | ${nomeProblema(p.tipo)} | ${p.fonte || ''}${p.num ? ' nº ' + p.num : ''} | ${p.dia}`).join('\n');

function dsProblemas() {
  const l = Object.entries(S.qProblemas).sort((a, b) => a[1].dia < b[1].dia ? 1 : -1);
  if (!l.length) return `<section class="cartao"><h2>Questões com erro</h2><p class="fraco" style="margin:0">Nenhuma marcada. Se encontrar um erro em uma questão, toque em "Esta questão tem erro?".</p></section>`;
  return `<section class="cartao"><div class="entre"><h2>Questões com erro</h2><span class="fraco">${l.length} ${l.length === 1 ? 'marcada' : 'marcadas'}</span></div>
    <div class="linha"><button class="botao" data-acao="dsProblemasCopiar">Copiar lista</button></div>
    ${detalhe('dsProb', 'Ver a lista', `<div class="coluna" style="gap:6px">${l.map(([id, p]) => `<div class="entre"><span style="font-size:14px">${esc(p.fonte || id)}${p.num ? ' nº ' + esc(p.num) : ''} · ${nomeProblema(p.tipo)}</span><button class="link" data-acao="dsProblemaTirar" data-id="${esc(id)}" style="font-size:14px">Tirar</button></div>`).join('')}
      <textarea readonly rows="4" style="font-size:13px">${esc(textoProblemas())}</textarea></div>`)}</section>`;
}

/** Quanto cada assunto cai nos últimos 5 anos de cada prova dela. "muito" = 20% que mais caem; "médio" = os 40% seguintes. */
let dsIncCache = null;
function dsIncidencia() {
  if (dsIncCache?.n === BANCO.itens.length) return dsIncCache;
  const provas = BANCO.itens.filter(q => !q.ds && q.t === 'real' && +q.a && DS_PROVAS.test(q.b) && !/^simulado/i.test(q.b)), anos = {}, por = {};
  for (const q of provas) (anos[q.b] ||= new Set()).add(+q.a);
  const ult = {};
  for (const [b, s] of Object.entries(anos)) ult[b] = new Set([...s].sort((x, y) => y - x).slice(0, 5));
  for (const q of provas) if (ult[q.b].has(+q.a) && q.m && q.as && q.as !== 'Outro') por[q.m + '|' + q.as] = (por[q.m + '|' + q.as] || 0) + 1;
  const ord = Object.values(por).sort((x, y) => y - x);
  return dsIncCache = { n: BANCO.itens.length, por, muito: ord[Math.floor(ord.length * .2)] || 1, medio: ord[Math.floor(ord.length * .6)] || 1 };
}

/** Junta o histórico por questão (S.qh) com a ficha do banco. Vale a PRIMEIRA vez de cada questão no período: refazer a mesma questão não aumenta o acerto. */
function dsAnalise(per) {
  const ini = per === 'tudo' ? '' : dsDias(per)[0], id = {}, por = {}, bancas = {}, motivos = {}, mats = {};
  let refeitas = 0, viraram = 0;
  for (const m of BANCO.itens) id[m.id] = m;
  for (const qid of Object.keys(S.qh)) {
    const m = id[qid]; if (!m) continue;
    const tent = histDe(qid).h.filter(t => (t[0] || '') >= ini); if (!tent.length) continue;
    const pri = tent[0], erro = tent.findIndex(t => !t[1]);
    if (erro >= 0 && erro < tent.length - 1) { refeitas++; if (tent[tent.length - 1][1]) viraram++; }
    const b = (bancas[m.b] ||= { b: m.b, f: 0, ok: 0 }); b.f++; b.ok += pri[1] ? 1 : 0;
    const x = m.m && m.as && m.as !== 'Outro' ? (por[m.m + '|' + m.as] ||= { m: m.m, a: m.as, f: 0, ok: 0, seq: [], mot: {} }) : null;
    if (x) {
      x.f++; x.ok += pri[1] ? 1 : 0; x.seq.push([pri[0] || '', pri[1] ? 1 : 0]);
      const y = (mats[m.m] ||= { f: 0, ok: 0 }); y.f++; y.ok += pri[1] ? 1 : 0;
    }
    for (const t of tent) if (!t[1] && t[3]) { motivos[t[3]] = (motivos[t[3]] || 0) + 1; if (x) x.mot[t[3]] = (x.mot[t[3]] || 0) + 1; }
  }
  const inc = dsIncidencia();
  const assuntos = Object.values(por).map(x => {
    const y = mats[x.m], erroMat = (y.f - y.ok + 2) / (y.f + 4);
    // com poucas questões, o erro fica puxado para a média da matéria: 1 erro em 2 não vira "o assunto mais fraco"
    const erro = (x.f - x.ok + 4 * erroMat) / (x.f + 4), n = inc.por[x.m + '|' + x.a] || 0;
    const seq = x.seq.sort((p, q) => p[0] < q[0] ? -1 : 1), meio = seq.length >> 1;
    const pct = l => soma(l, t => t[1]) / l.length * 100, dif = seq.length >= 8 ? pct(seq.slice(meio)) - pct(seq.slice(0, meio)) : 0;
    const mot = Object.entries(x.mot).sort((p, q) => q[1] - p[1])[0];
    return { ...x, ac: Math.round(x.ok / x.f * 100), prio: erro * (n || .5), nivel: n >= inc.muito ? 'cai muito' : n >= inc.medio ? 'cai às vezes' : 'cai pouco', tend: dif >= 15 ? 'melhorando' : dif <= -15 ? 'piorando' : '', mot: mot && mot[1] >= 2 ? mot[0] : '' };
  });
  return { assuntos, bancas: Object.values(bancas).filter(b => b.f >= 10).map(b => ({ ...b, ac: Math.round(b.ok / b.f * 100) })).sort((p, q) => p.ac - q.ac), motivos, refeitas, viraram };
}

/** Os que mais caem nas provas dela e que ela nunca testou (em nenhum período). */
function dsNaoTestados() {
  const inc = dsIncidencia(), feitos = new Set();
  const id = {}; for (const m of BANCO.itens) id[m.id] = m;
  for (const qid of Object.keys(S.qh)) if (id[qid]) feitos.add(id[qid].m + '|' + id[qid].as);
  return Object.entries(inc.por).filter(([k, n]) => n >= inc.muito && !feitos.has(k)).sort((p, q) => q[1] - p[1]).slice(0, 10).map(([k]) => { const [m, a] = k.split('|'); return { m, a }; });
}

function dsBarras(serie) {
  const max = Math.max(1, ...serie.map(x => x.f));
  return `<div class="des-barras" role="img" aria-label="Questões por ${ui.dsPer === 'tudo' ? 'semana' : 'dia'}">${serie.map(x => `<div class="des-col" title="${x.rot}: ${x.f} questões${x.ac != null ? ', ' + x.ac + '% de acerto' : ''}">
    <span class="des-n">${x.f || ''}</span><i style="height:${x.f ? Math.max(4, Math.round(x.f / max * 100)) : 0}%;background:${dsCorAc(x.ac)}"></i><small>${x.rot}</small></div>`).join('')}</div>
    <div class="des-leg"><span><i style="background:#2E8B57"></i>70% ou mais</span><span><i style="background:#C98A12"></i>50 a 69%</span><span><i style="background:#C2483D"></i>abaixo de 50%</span></div>`;
}

function dsMaterias(r) {
  const l = Object.entries(r.mats).map(([m, v]) => ({ m, f: v.f, ac: acerto(v.f, v.a, v.s || 0), seg: v.t && v.f ? v.t / v.f : 0 })).sort((a, b) => (a.f < 5) - (b.f < 5) || (a.ac ?? 101) - (b.ac ?? 101));
  if (!l.length) return '<p class="fraco" style="margin:0">Nenhuma questão neste período.</p>';
  return `<div class="coluna" style="gap:10px">${l.map(x => `<div class="meta-linha" style="${cor(x.m)}"><span><i class="ponto"></i>${esc(x.m)}</span>
    <span class="fraco"><b style="color:${x.f < 5 ? 'var(--fraco)' : dsCorAc(x.ac)}">${x.ac == null ? '–' : x.ac + '%'}</b> · ${x.f} q${x.seg ? ' · ' + dsMin(x.seg) + '/q' : ''}</span>
    <div class="barra"><i style="width:${x.ac || 0}%;background:${x.f < 5 ? 'var(--linha)' : dsCorAc(x.ac)}"></i></div></div>`).join('')}</div>
    <p class="fraco" style="margin:0;font-size:13px">Matérias com menos de 5 questões ainda não contam como avaliação.</p>`;
}

function dsAssuntosHtml() {
  if (!BANCO.pronto) { carregarBanco(); return '<p class="fraco" style="margin:0">Abrindo o banco de questões…</p>'; }
  const an = dsAnalise(ui.dsPer), todos = an.assuntos;
  const naoTestados = dsNaoTestados();
  const treino = x => `<button class="chip" data-acao="dsTreinar" data-m="${esc(x.m)}" data-a="${esc(x.a)}">Treinar</button>`;
  const faltando = naoTestados.length ? detalhe('dsNao', `Caem muito e ainda não testei (${naoTestados.length})`, naoTestados.map(x => `<div class="des-ass" style="${cor(x.m)}"><div class="coluna" style="gap:2px;flex:1;min-width:0"><b>${esc(x.a)}</b><span class="fraco" style="font-size:13px">${esc(x.m)}</span></div>${treino(x)}</div>`).join('')) : '';
  if (!todos.length) return `<p class="fraco" style="margin:0">Nenhuma questão do banco neste período. Quando você resolver, aqui aparece o que estudar primeiro.</p>${faltando}`;
  const nomeMot = v => (MOTIVOS.find(m => m[0] === v)?.[1] || '').toLowerCase();
  const fracos = todos.filter(x => x.f >= 3 && x.ac < 80).sort((a, b) => b.prio - a.prio).slice(0, 8);
  const linha = x => `<div class="des-ass" style="${cor(x.m)}"><div class="coluna" style="gap:2px;flex:1;min-width:0"><b>${esc(x.a)}</b><span class="fraco" style="font-size:13px">${esc(x.m)} · ${x.ok} de ${x.f} certas · ${x.nivel}${x.tend ? ' · ' + x.tend : ''}${x.mot ? ' · mais por: ' + nomeMot(x.mot) : ''}</span></div>
    <b style="color:${dsCorAc(x.ac)}">${x.ac}%</b>${treino(x)}</div>`;
  const porMat = {};
  for (const x of todos) (porMat[x.m] ||= []).push(x);
  const nMot = soma(Object.values(an.motivos), n => n);
  const semEstudo = (an.motivos.atencao || 0) + (an.motivos.pressa || 0) + (an.motivos.enunciado || 0);
  const motivos = nMot ? `<div class="coluna" style="gap:8px"><span class="rotulo">por que você erra (${nMot} ${nMot === 1 ? 'erro marcado' : 'erros marcados'})</span>${MOTIVOS.filter(([v]) => an.motivos[v]).sort((a, b) => an.motivos[b[0]] - an.motivos[a[0]]).map(([v, t]) => { const p = Math.round(an.motivos[v] / nMot * 100); return `<div class="meta-linha"><span>${t}</span><span class="fraco">${p}%</span><div class="barra"><i style="width:${p}%"></i></div></div>`; }).join('')}
      ${nMot >= 5 && semEstudo / nMot >= .5 ? '<p class="fraco" style="margin:0">Mais da metade destes erros não é falta de conteúdo: vale treinar a leitura e o ritmo, não só estudar mais teoria.</p>' : ''}</div>`
    : '<p class="fraco" style="margin:0;font-size:13px">Ao errar uma questão, toque no motivo. Assim aparece aqui se o problema é conteúdo, atenção, interpretação ou tempo.</p>';
  return (fracos.length ? `<span class="rotulo">o que estudar primeiro</span>${fracos.map(linha).join('')}<p class="fraco" style="margin:0;font-size:13px">A ordem junta quanto você erra com quanto o assunto cai nos últimos 5 anos das suas provas.</p>` : '<p class="fraco" style="margin:0">Nenhum assunto fraco neste período (abaixo de 80%, com pelo menos 3 questões feitas).</p>')
    + motivos
    + (an.refeitas >= 5 ? `<p style="margin:0">Dos erros que você refez, <b>${an.viraram} de ${an.refeitas}</b> viraram acerto.</p>` : '')
    + detalhe('dsAss', 'Todos os assuntos que já fiz', Object.entries(porMat).map(([m, l]) => `<div class="coluna" style="gap:6px"><span class="tag" style="${cor(m)};align-self:flex-start">${esc(m)}</span>${l.sort((a, b) => a.ac - b.ac).map(linha).join('')}</div>`).join(''))
    + (an.bancas.length ? detalhe('dsBan', 'Acerto por banca', `<div class="coluna" style="gap:10px">${an.bancas.map(b => `<div class="meta-linha"><span>${esc(b.b)}</span><span class="fraco"><b style="color:${dsCorAc(b.ac)}">${b.ac}%</b> · ${b.f} q</span><div class="barra"><i style="width:${b.ac}%;background:${dsCorAc(b.ac)}"></i></div></div>`).join('')}</div>`) : '')
    + faltando
    + '<p class="fraco" style="margin:0;font-size:13px">Conta a primeira vez que você fez cada questão no período. Refazer a mesma questão não aumenta o acerto.</p>';
}

function dsPlano() {
  const l = S.assuntos.filter(ehConteudo), por = {};
  for (const a of l) { const x = (por[a.materia] ||= { t: 0, f: 0, atras: 0 }); x.t++; if (a.feito) x.f++; else if (estadoDe(a) === 'atrasado') x.atras++; }
  const tot = l.length, fe = l.filter(a => a.feito).length;
  if (!tot) return '<p class="fraco" style="margin:0">O plano ainda está vazio.</p>';
  return `<div class="meta-linha"><span><b>Todo o conteúdo</b></span><span class="fraco">${fe} de ${tot} assuntos · ${Math.round(fe / tot * 100)}%</span><div class="barra grossa"><i style="width:${Math.round(fe / tot * 100)}%"></i></div></div>`
    + detalhe('dsPlano', 'Por matéria', Object.entries(por).sort((a, b) => b[1].f / b[1].t - a[1].f / a[1].t).map(([m, x]) => `<div class="meta-linha" style="${cor(m)}"><span><i class="ponto"></i>${esc(m)}</span><span class="fraco">${x.f}/${x.t}${x.atras ? ` · ${x.atras} atrasado${x.atras > 1 ? 's' : ''}` : ''}</span><div class="barra"><i style="width:${Math.round(x.f / x.t * 100)}%;background:var(--c)"></i></div></div>`).join(''));
}

function dsRedacao() {
  const l = S.redacoes.map(e => ({ ...e, nota: notaRedDe(e) })).filter(e => e.nota != null).slice(-10);
  if (!l.length) return '<p class="fraco" style="margin:0">Quando uma redação for corrigida, a nota aparece aqui.</p>';
  const notas = l.map(e => e.nota), media = Math.round(soma(notas, n => n) / notas.length), ult = notas.slice(-3), ant = notas.slice(0, -3);
  const tend = ant.length ? Math.round(soma(ult, n => n) / ult.length - soma(ant, n => n) / ant.length) : null;
  const comp = [1, 2, 3, 4, 5].map(n => { const v = l.map(e => e.ia?.competencias?.find(c => c.n === n)?.nota).filter(x => x != null); return v.length ? Math.round(soma(v, x => x) / v.length) : null; });
  return `<div class="resumo-dia"><div><strong>${media}</strong><span>média das últimas ${l.length}</span></div><div><strong>${Math.max(...notas)}</strong><span>melhor nota</span></div>
      ${tend != null ? `<div><strong style="color:${tend >= 0 ? '#2E8B57' : '#C2483D'}">${tend >= 0 ? '+' : ''}${tend}</strong><span>nas 3 últimas</span></div>` : ''}</div>
    <div class="des-barras des-red">${l.map(e => `<div class="des-col" title="${diaCurto(e.dia)}: ${e.nota}"><span class="des-n">${e.nota}</span><i style="height:${Math.max(4, e.nota / 10)}%;background:var(--acento)"></i><small>${diaCurto(e.dia).slice(0, 5)}</small></div>`).join('')}</div>
    ${comp.some(x => x != null) ? `<div class="coluna" style="gap:8px"><span class="rotulo">média por competência (máx. 200)</span>${comp.map((x, i) => x == null ? '' : `<div class="meta-linha"><span>Competência ${i + 1}</span><span class="fraco">${x}</span><div class="barra"><i style="width:${x / 2}%;background:${dsCorAc(x / 2)}"></i></div></div>`).join('')}</div>` : ''}`;
}

function dsDicas(r) {
  const l = Object.entries(r.mats).filter(([, v]) => v.f >= 10).map(([m, v]) => ({ m, ac: acerto(v.f, v.a, v.s || 0) })).filter(x => x.ac != null).sort((a, b) => a.ac - b.ac);
  const out = [];
  if (l.length >= 2) {
    out.push(`<b>${esc(l[l.length - 1].m)}</b> é o seu ponto forte (${l[l.length - 1].ac}%).`);
    if (l[0].ac < 70) out.push(`<b>${esc(l[0].m)}</b> é a que mais precisa de atenção (${l[0].ac}%).`);
  }
  const venc = S.erros.filter(e => e.rev <= hoje()).length;
  if (venc) out.push(`${venc} ${venc === 1 ? 'erro está' : 'erros estão'} esperando revisão no caderno de erros.`);
  return out.length ? `<ul class="des-dicas">${out.map(t => `<li>${t}</li>`).join('')}</ul>` : '';
}

function vDesempenho() {
  const dias = dsDias(ui.dsPer), r = resumoPeriodo(dias), ac = acerto(r.f, r.a, r.s), seq = dsSequencia();
  const cab = `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">como estou indo</span><h1>Desempenho</h1></div>
    <div class="alterna" role="group">${DS_PERIODOS.map(([v, t]) => `<button data-acao="dsPer" data-v="${v}" aria-pressed="${ui.dsPer === v}">${t}</button>`).join('')}</div></header>${avisoIa()}`;
  if (!Object.keys(S.qlog).length && !S.redacoes.some(e => notaRedDe(e) != null))
    return cab + `<section class="cartao"><h2>Ainda não tem dados</h2><p class="fraco" style="margin:0">Assim que você resolver questões ou tiver uma redação corrigida, os gráficos aparecem aqui.</p><div class="linha"><button class="botao" data-acao="ir" data-v="questoes">Ir para as questões</button></div></section>`;
  const venc = S.erros.filter(e => e.rev <= hoje()).length;
  return cab + `<section class="cartao"><div class="resumo-dia">
      <div><strong>${r.f}</strong><span>questões feitas</span></div>
      <div><strong style="color:${dsCorAc(ac)}">${ac == null ? '–' : ac + '%'}</strong><span>de acerto</span></div>
      <div><strong>${r.f && r.t ? dsMin(r.t / r.f) : '–'}</strong><span>por questão</span></div>
      <div><strong>${seq}</strong><span>${seq === 1 ? 'dia seguido' : 'dias seguidos'}</span></div></div>
    ${dsDicas(r)}${dsBarras(dsSerie(ui.dsPer))}</section>
    <section class="cartao"><h2>Por matéria</h2>${dsMaterias(r)}</section>
    <section class="cartao"><h2>Análise dos erros</h2>${dsAssuntosHtml()}</section>
    <section class="cartao"><h2>Plano de estudos</h2>${dsPlano()}</section>
    <section class="cartao"><h2>Redação</h2>${dsRedacao()}</section>
    <section class="cartao"><div class="entre"><h2>Caderno de erros</h2><span class="fraco">${S.erros.length} guardados · ${venc} para rever hoje</span></div>
      ${S.erros.length ? `<div class="linha"><button class="botao" data-acao="dsErros">Refazer erros</button></div>` : '<p class="fraco" style="margin:0">Nenhum erro guardado.</p>'}</section>
    ${dsProblemas()}`;
}

Object.assign(VIEWS, { desempenho: vDesempenho });
Object.assign(ACOES, {
  dsPer: el => { ui.dsPer = el.dataset.v; render(); },
  qProblemaAbrir: () => { const y = window.scrollY; ui.qProblemaDe = ui.qs.itens[ui.qs.i].id; render(); window.scrollTo(0, y); },
  qProblemaMarcar: el => { const y = window.scrollY, q = ui.qs.itens[ui.qs.i]; S.qProblemas[q.id] = { tipo: el.dataset.v, dia: hoje(), fonte: q.fonte || '', num: q.num || '' }; ui.qProblemaDe = null; salvar(); render(); window.scrollTo(0, y); },
  qProblemaTirar: () => { const y = window.scrollY; delete S.qProblemas[ui.qs.itens[ui.qs.i].id]; salvar(); render(); window.scrollTo(0, y); },
  dsProblemaTirar: el => { const y = window.scrollY; delete S.qProblemas[el.dataset.id]; salvar(); render(); window.scrollTo(0, y); },
  dsProblemasCopiar: async () => {
    try { await navigator.clipboard.writeText(textoProblemas()); ui.iaMsg = 'Lista copiada.'; }
    catch { ui.iaMsg = 'Não consegui copiar. Abra "Ver a lista" e copie o texto da caixa.'; }
    render();
  },
  qMotivo: el => {
    const q = ui.qs.itens[ui.qs.i], l = S.qh[q.id]?.h; if (!l?.length) return;
    const y = window.scrollY, t = l[l.length - 1];
    t[3] = t[3] === el.dataset.v ? '' : el.dataset.v; salvar(); render(); window.scrollTo(0, y);
  },
  dsErros: () => { ui.view = 'questoes'; ui.qAba = 'erros'; ui.qs = null; window.scrollTo(0, 0); render(); },
  dsTreinar: async el => {
    const m = el.dataset.m, a = el.dataset.a;
    // primeiro as que errou ou ainda não fez, das bancas de SP e do ENEM; completa com as já acertadas
    const l = BANCO.itens.filter(x => x.m === m && x.as === a), prio = x => S.qh[x.id] ? (S.qh[x.id].ok ? 2 : 0) : 1;
    const fora = x => PRESETS_BANCA.sp[1].test(x.b) || /enem/i.test(x.b) ? 0 : 1;
    const ids = l.map(x => [x, Math.random()]).sort(([x, r], [y, s]) => prio(x) - prio(y) || fora(x) - fora(y) || r - s).slice(0, 15).map(([x]) => x.id);
    if (!ids.length) { ui.iaMsg = 'Não achei questões desse assunto no banco.'; render(); return; }
    ui.view = 'questoes'; ui.qAba = 'listas'; window.scrollTo(0, 0);
    await ACOES.qIniciarIds(ids);
  },
});
