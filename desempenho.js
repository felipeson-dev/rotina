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

/** Assuntos: junta o histórico por questão (S.qh) com a ficha do banco (matéria e assunto). */
function dsAssuntos() {
  const por = {}, id = {};
  for (const m of BANCO.itens) id[m.id] = m;
  for (const [qid, h] of Object.entries(S.qh)) {
    const m = id[qid]; if (!m || !m.m || !m.as || m.as === 'Outro') continue;
    const x = (por[m.m + '|' + m.as] ||= { m: m.m, a: m.as, f: 0, ok: 0 }); x.f++; x.ok += h.ok ? 1 : 0;
  }
  return Object.values(por).map(x => ({ ...x, ac: Math.round(x.ok / x.f * 100) }));
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
  const todos = dsAssuntos(), fracos = todos.filter(x => x.f >= 3 && x.ac < 80).sort((a, b) => a.ac - b.ac || b.f - a.f).slice(0, 8);
  if (!todos.length) return '<p class="fraco" style="margin:0">Quando você resolver questões do banco, aqui aparecem os assuntos em que mais erra, com um botão para treinar.</p>';
  const linha = x => `<div class="des-ass" style="${cor(x.m)}"><div class="coluna" style="gap:2px;flex:1;min-width:0"><b>${esc(x.a)}</b><span class="fraco" style="font-size:13px">${esc(x.m)} · ${x.ok} de ${x.f} certas</span></div>
    <b style="color:${dsCorAc(x.ac)}">${x.ac}%</b><button class="chip" data-acao="dsTreinar" data-m="${esc(x.m)}" data-a="${esc(x.a)}">Treinar</button></div>`;
  const porMat = {};
  for (const x of todos) (porMat[x.m] ||= []).push(x);
  return (fracos.length ? `<span class="rotulo">para melhorar</span>${fracos.map(linha).join('')}` : '<p class="fraco" style="margin:0">Nenhum assunto fraco por enquanto (abaixo de 80%, com pelo menos 3 questões feitas).</p>')
    + detalhe('dsAss', 'Todos os assuntos que já fiz', Object.entries(porMat).map(([m, l]) => `<div class="coluna" style="gap:6px"><span class="tag" style="${cor(m)};align-self:flex-start">${esc(m)}</span>${l.sort((a, b) => a.ac - b.ac).map(linha).join('')}</div>`).join(''))
    + '<p class="fraco" style="margin:0;font-size:13px">Conta a última vez que você fez cada questão do banco.</p>';
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
    <section class="cartao"><h2>Assuntos</h2>${dsAssuntosHtml()}</section>
    <section class="cartao"><h2>Plano de estudos</h2>${dsPlano()}</section>
    <section class="cartao"><h2>Redação</h2>${dsRedacao()}</section>
    <section class="cartao"><div class="entre"><h2>Caderno de erros</h2><span class="fraco">${S.erros.length} guardados · ${venc} para rever hoje</span></div>
      ${S.erros.length ? `<div class="linha"><button class="botao" data-acao="dsErros">Refazer erros</button></div>` : '<p class="fraco" style="margin:0">Nenhum erro guardado.</p>'}</section>`;
}

Object.assign(VIEWS, { desempenho: vDesempenho });
Object.assign(ACOES, {
  dsPer: el => { ui.dsPer = el.dataset.v; render(); },
  dsErros: () => { ui.view = 'questoes'; ui.qAba = 'erros'; ui.qs = null; window.scrollTo(0, 0); render(); },
  dsTreinar: async el => {
    const m = el.dataset.m, a = el.dataset.a;
    // primeiro as que errou ou ainda não fez; completa com as já acertadas
    const l = BANCO.itens.filter(x => x.m === m && x.as === a), prio = x => S.qh[x.id] ? (S.qh[x.id].ok ? 2 : 0) : 1;
    const ids = l.sort((x, y) => prio(x) - prio(y) || Math.random() - 0.5).slice(0, 15).map(x => x.id);
    if (!ids.length) { ui.iaMsg = 'Não achei questões desse assunto no banco.'; render(); return; }
    ui.view = 'questoes'; ui.qAba = 'listas'; window.scrollTo(0, 0);
    await ACOES.qIniciarIds(ids);
  },
});
