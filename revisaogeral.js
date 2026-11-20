'use strict';
/* Revisão geral: todos os assuntos já estudados, com há quanto tempo ela não revê, quantas questões fez nos últimos 3 meses e o acerto.
   O acerto só vale a partir de 10 questões (as 10 mais recentes do assunto): antes disso aparece só como "prévia".
   A recomendação NÃO é obrigatória: junta o tempo sem rever com a faixa de acerto (alta 70%+, média 50 a 69%, baixa abaixo de 50%),
   e ainda considera o quanto o assunto cai nas provas e se ela marcou "estou fraca nisso". */
const RG_MIN = 10, RG_JANELA = 90;                         // questões para a média valer; janela de "últimos 3 meses"
const RG_INTERVALO = { baixa: 10, media: 21, alta: 45 };   // dias até pedir revisão, por faixa de acerto
Object.assign(ICONES, { revisao: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>' });
if (!GRUPOS_MENU.some(g => g[0] === 'revisao')) GRUPOS_MENU.splice(3, 0, ['revisao', 'Revisão', [['revisao', '']]]);   // logo depois de Questões

const rgFaixa = p => p == null ? 'sem' : p >= 70 ? 'alta' : p >= 50 ? 'media' : 'baixa';
const RG_NOME = { alta: 'alto', media: 'médio', baixa: 'baixo', sem: 'sem dados' };

function rgAnalise() {
  if (!BANCO.pronto) return null;
  const meta = {}, cobr = {};
  for (const m of BANCO.itens) { meta[m.id] = m; if (!window.questaoIgnorada?.(m) && m.m && m.as) cobr[m.m + '|' + m.as] = (cobr[m.m + '|' + m.as] || 0) + 1; }
  const grupos = {};
  for (const qid of Object.keys(S.qh)) {
    const m = meta[qid]; if (!m || !m.m || !m.as) continue;
    const h = histDe(qid).h; if (!h?.length) continue;
    const u = h[h.length - 1];
    (grupos[m.m + '|' + m.as] ||= []).push({ dia: u[0] || '', ok: u[1] ? 1 : 0, dias: h.map(t => t[0] || '') });
  }
  const hj = hoje(), lim = somaDias(hj, -RG_JANELA), dd = d => d ? Math.max(0, Math.round((deIso(hj) - deIso(d)) / 864e5)) : null;
  return estudados().map(a => {
    const chave = a.materia + '|' + tagDe(a);
    // questões feitas fora do app (registradas por ela, com data): cada uma entra como uma questão; os acertos ficam espalhados entre elas
    const fora = (S.foraQ || []).filter(e => e.a === a.id), ext = fora.flatMap(e => Array.from({ length: e.f }, (_, i) => ({ dia: e.dia, ok: Math.floor((i + 1) * e.ac / e.f) > Math.floor(i * e.ac / e.f) ? 1 : 0, dias: [e.dia] })));
    const L = [...(grupos[chave] || []), ...ext].sort((x, y) => x.dia < y.dia ? 1 : x.dia > y.dia ? -1 : 0);
    const base = L.slice(0, RG_MIN), n = L.length, n90 = L.filter(x => x.dias.some(d => d >= lim)).length;
    const pct = n >= 3 ? Math.round(soma(base, x => x.ok) / base.length * 100) : null;
    const firme = n >= RG_MIN, faixa = rgFaixa(pct);
    const contato = [L[0]?.dia || '', a.rev?.ult || '', a.feitoEm || ''].reduce((m, d) => d > m ? d : m, '');
    const dias = dd(contato);
    const intervalo = faixa === 'sem' ? 21 : firme ? RG_INTERVALO[faixa] : Math.min(21, RG_INTERVALO[faixa]);
    const razao = dias == null ? 1 : dias / intervalo, cob = cobr[chave] || 0;
    const score = razao * 10 + ({ baixa: 8, media: 4, alta: 0, sem: 3 })[faixa] + (firme ? 0 : 3) + Math.log2(1 + cob) * 1.2 + (a.fraco ? 5 : 0);
    const adiada = !!(a.revSoneca && a.revSoneca > hj);
    const status = adiada ? 'adiada' : razao >= 1 ? 'agora' : razao >= 0.6 ? 'breve' : 'ok';
    return { a, m: a.materia, tag: tagDe(a), nFora: ext.length, n, n90, pct, faixa, firme, faltam: Math.max(0, RG_MIN - n), dias, razao, score, status, cob };
  }).sort((x, y) => y.score - x.score);
}

const rgDias = d => d == null ? 'sem data' : d === 0 ? 'visto hoje' : `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
const RG_STATUS = { agora: ['Rever agora', '#C2483D'], breve: ['Em breve', '#C98A12'], ok: ['Em dia', '#2E8B57'], adiada: ['Adiado', 'var(--fraco)'] };
const RG_FILTROS = [['agora', 'Rever agora'], ['breve', 'Em breve'], ['poucas', 'Poucas questões'], ['ok', 'Em dia'], ['adiada', 'Adiados'], ['todos', 'Todos']];

function rgCartao(x) {
  const [rot, cor_] = RG_STATUS[x.status];
  const linha1 = `${x.dias == null ? 'sem data de contato' : x.dias === 0 ? 'visto hoje' : `${rgDias(x.dias)} sem rever`} · ${x.n90 ? `${x.n90} ${x.n90 === 1 ? 'questão' : 'questões'} nos últimos 3 meses` : 'nenhuma questão nos últimos 3 meses'}${x.nFora ? ` · ${x.nFora} feitas fora do app` : ''}`;
  const qn = ui.rgQtd?.[x.a.id] || 0, padrao = rgPadrao(), naRev = rgSelecao(rgCache).some(s => s.a.id === x.a.id);
  const linha2 = x.pct == null ? (x.n ? `só ${x.n} ${x.n === 1 ? 'questão feita' : 'questões feitas'}: faltam ${x.faltam} para ter média` : `nenhuma questão feita: faltam ${RG_MIN} para ter média`)
    : x.firme ? `acerto ${RG_NOME[x.faixa]} (${x.pct}%) nas últimas ${RG_MIN}` : `prévia: ${x.pct}% em ${x.n} questões (faltam ${x.faltam} para a média valer)`;
  const motivo = x.status === 'agora' ? (x.faixa === 'baixa' ? 'acerto baixo e tempo sem rever' : x.faixa === 'alta' ? 'faz tempo, mesmo com acerto alto' : 'faz tempo sem rever') : '';
  return `<div class="rg-ass" style="${cor(x.m)}"><div class="rg-topo"><div class="coluna" style="gap:2px;flex:1;min-width:0"><b>${esc(x.a.titulo)}</b><span class="fraco" style="font-size:13px">${esc(x.m)}${x.cob ? ` · ${x.cob} questões no banco` : ''}${x.a.fraco ? ' · marcado como fraco' : ''}</span></div>
      <div class="coluna" style="gap:2px;align-items:flex-end"><b style="color:${x.firme ? dsCorAc(x.pct) : 'var(--fraco)'}">${x.pct == null ? '–' : x.pct + '%'}</b><span style="font-size:12px;font-weight:700;color:${cor_}">${rot}</span></div></div>
    <span class="fraco" style="font-size:13px">${linha1}</span><span class="fraco" style="font-size:13px">${linha2}${motivo ? ` · <b>${motivo}</b>` : ''}</span>
    <div class="linha rg-escolha" style="gap:10px"><label class="linha" style="gap:6px;cursor:pointer;font-size:14px"><input type="checkbox" data-acao="rgSel" data-id="${x.a.id}" ${naRev ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--rosa)"> Na revisão de hoje</label>
      <label class="linha" style="gap:6px;font-size:14px">questões<select data-rgq="${x.a.id}" style="min-height:34px">${[0, 2, 4, 6, 8, 10, 15, 20].map(v => `<option value="${v}" ${qn === v ? 'selected' : ''}>${v ? v : `padrão (${padrao})`}</option>`).join('')}</select></label></div>
    <div class="linha" style="gap:6px"><button class="chip" data-acao="rgTreinar" data-id="${x.a.id}">${qn ? `Treinar ${qn} questões` : x.n < RG_MIN ? `Fazer ${Math.max(5, x.faltam)} questões` : 'Treinar 10 questões'}</button>
      <button class="chip" data-acao="rgFora" data-id="${x.a.id}">+ Questões de fora</button>
      <button class="chip" data-acao="rgRevisei" data-id="${x.a.id}">Já revisei</button>
      ${x.status === 'adiada' ? `<button class="chip" data-acao="rgAdiar" data-id="${x.a.id}" data-v="0">Voltar à lista</button>` : `<button class="chip" data-acao="rgAdiar" data-id="${x.a.id}" data-v="14">Adiar 2 semanas</button>`}</div></div>`;
}

function vRevisao() {
  const cab = `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">o que já estudei</span><h1>Revisão</h1></div></header>${avisoIa()}`;
  if (!BANCO.pronto) { carregarBanco(); return cab + '<section class="cartao"><p class="fraco" style="margin:0">Abrindo o banco de questões…</p></section>'; }
  const todos = rgAnalise();
  if (!todos.length) return cab + '<section class="cartao"><h2>Ainda não tem assuntos estudados</h2><p class="fraco" style="margin:0">Conforme você for marcando assuntos como feitos, eles aparecem aqui com a recomendação de revisão.</p></section>';
  ui.rgFiltro ||= 'agora'; ui.rgMat ||= '';
  const conta = f => todos.filter(x => rgBate(x, f)).length;
  const mats = [...new Set(todos.map(x => x.m))].sort((p, q) => p.localeCompare(q));
  const lista = todos.filter(x => rgBate(x, ui.rgFiltro) && (!ui.rgMat || x.m === ui.rgMat));
  const firmes = todos.filter(x => x.firme), media = firmes.length ? Math.round(soma(firmes, x => x.pct) / firmes.length) : null;
  const agora = todos.filter(x => x.status === 'agora');
  const porMat = mats.map(m => { const l = todos.filter(x => x.m === m), r = l.filter(x => x.status === 'agora').length; return { m, n: l.length, r }; }).filter(x => x.r);
  const mostrar = lista.slice(0, ui.rgTodos ? 500 : 30);
  rgCache = todos;
  const sel = rgSelecao(todos), totalQ = soma(sel, x => ui.rgQtd?.[x.a.id] || rgPadrao());
  return cab + `<section class="cartao"><div class="resumo-dia">
      <div><strong>${todos.length}</strong><span>assuntos estudados</span></div>
      <div><strong style="color:${agora.length ? '#C2483D' : '#2E8B57'}">${agora.length}</strong><span>para rever agora</span></div>
      <div><strong>${conta('poucas')}</strong><span>com poucas questões</span></div>
      <div><strong style="color:${dsCorAc(media)}">${media == null ? '–' : media + '%'}</strong><span>acerto médio</span></div></div>
    <p class="fraco" style="margin:0;font-size:13px">As sugestões não são obrigatórias: servem de guia. A média de acerto só vale a partir de ${RG_MIN} questões do assunto. Acerto alto = 70% ou mais, médio = 50 a 69%, baixo = abaixo de 50%.</p>
    <div class="coluna" style="gap:8px;padding-top:6px;border-top:1px dashed var(--linha)"><b>Montar a revisão de hoje</b>
      <div class="linha" style="gap:6px"><span class="fraco">Questões de cada assunto:</span>${[2, 4, 6, 8, 10, 15].map(n => `<button class="chip" data-acao="rgN" data-v="${n}" aria-pressed="${rgPadrao() === n}">${n}</button>`).join('')}</div>
      <p class="fraco" style="margin:0;font-size:13px">${ui.rgSel ? 'Você escolheu os assuntos abaixo.' : 'Estão marcados os mais urgentes (até 5).'} Marque ou desmarque "Na revisão de hoje" em qualquer assunto e mude a quantidade de questões só nele, se quiser.${ui.rgSel || Object.values(ui.rgQtd || {}).some(Boolean) ? ' <button class="link" data-acao="rgAuto">Voltar ao automático</button>' : ''}</p>
      <div class="linha"><button class="botao grande" data-acao="rgMontar" ${sel.length ? '' : 'disabled'}>${sel.length ? `Montar a revisão (${sel.length} ${sel.length === 1 ? 'assunto' : 'assuntos'} · ${totalQ} questões)` : 'Escolha ao menos um assunto'}</button></div></div>
    ${porMat.length ? `<div class="linha" style="gap:6px">${porMat.map(x => `<span class="selo" style="${cor(x.m)}">${esc(x.m)}: ${x.r} p/ rever</span>`).join('')}</div>` : ''}</section>
    <section class="cartao"><div class="linha" style="gap:6px">${RG_FILTROS.map(([v, t]) => `<button class="chip" data-acao="rgFiltro" data-v="${v}" aria-pressed="${ui.rgFiltro === v}">${t} (${conta(v)})</button>`).join('')}</div>
      <label class="campo" style="max-width:280px">Matéria<select data-ui="rgMat"><option value="">Todas</option>${mats.map(m => `<option ${ui.rgMat === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
      <div class="coluna" style="gap:10px">${mostrar.length ? mostrar.map(rgCartao).join('') : '<p class="fraco" style="margin:0">Nenhum assunto nesta lista.</p>'}</div>
      ${lista.length > mostrar.length ? `<button class="link" data-acao="rgMais">Mostrar todos (${lista.length})</button>` : ''}</section>`;
}
let rgCache = [];
const rgPadrao = () => S.perfil.rgN || 4;
const rgSelecao = todos => ui.rgSel ? todos.filter(x => ui.rgSel[x.a.id]) : todos.filter(x => x.status === 'agora').slice(0, 5);
const rgBate = (x, f) => f === 'todos' ? true : f === 'poucas' ? !x.firme && x.status !== 'adiada' : x.status === f;

Object.assign(VIEWS, { revisao: vRevisao });
Object.assign(ACOES, {
  rgFiltro: el => { ui.rgFiltro = el.dataset.v; ui.rgTodos = false; render(); },
  rgMais: () => { ui.rgTodos = true; render(); },
  rgTreinar: async el => { const a = achar(el.dataset.id); if (!a) return; await questoesDosAssuntos([a], { revisaoIds: [a.id], chaveLista: 'rg:' + a.id + ':' + hoje(), tituloLista: 'Revisão · ' + a.titulo }, ui.rgQtd?.[a.id] || 10); },
  rgMontar: async () => {
    const sel = rgSelecao(rgAnalise() || []); if (!sel.length) return;
    const l = sel.map(x => x.a), qtd = Object.fromEntries(sel.map(x => [x.a.id, ui.rgQtd?.[x.a.id] || rgPadrao()]));
    await questoesDosAssuntos(l, { revisaoIds: l.map(a => a.id), chaveLista: 'rg:' + hoje() + ':' + l.map(a => a.id).join(','), tituloLista: 'Revisão de hoje', qtd }, rgPadrao());
  },
  rgN: el => { S.perfil.rgN = +el.dataset.v; salvar(); render(); },
  rgAuto: () => { ui.rgSel = null; ui.rgQtd = {}; render(); },
  rgSel: el => {
    const y = window.scrollY;
    if (!ui.rgSel) ui.rgSel = Object.fromEntries(rgSelecao(rgAnalise() || []).map(x => [x.a.id, true]));
    if (ui.rgSel[el.dataset.id]) delete ui.rgSel[el.dataset.id]; else ui.rgSel[el.dataset.id] = true;
    render(); window.scrollTo(0, y);
  },
  // questões feitas fora do app (outro site, livro, simulado de cursinho): entram com data, contam no acerto e nos números do Desempenho
  rgFora: el => {
    const a = achar(el.dataset.id); if (!a) return;
    const lista = (S.foraQ || []).filter(e => e.a === a.id).sort((p, q) => p.dia < q.dia ? 1 : -1);
    abrirModal(`<div class="entre"><div>${tag(a.materia)}</div><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
      <h2>Questões de fora: ${esc(a.titulo)}</h2>
      <span class="fraco">Fez questões em outro lugar (livro, site, simulado do cursinho)? Anote aqui: elas entram na média de acerto e no tempo sem rever deste assunto.</span>
      <div class="linha"><label class="campo" style="flex:1">Quantas fez<input type="number" id="rg-f" min="1" max="300" inputmode="numeric"></label>
        <label class="campo" style="flex:1">Quantas acertou<input type="number" id="rg-ac" min="0" max="300" inputmode="numeric"></label></div>
      <label class="campo">Quando<input type="date" id="rg-dia" value="${hoje()}" max="${hoje()}"></label>
      <div class="linha"><button class="botao" data-acao="rgForaSalvar" data-id="${a.id}">Salvar</button></div>
      ${lista.length ? `<div class="coluna" style="gap:6px"><span class="rotulo">já anotadas</span>${lista.map(e => `<div class="entre"><span>${diaCurto(e.dia)}: ${e.ac} de ${e.f}</span><button class="link" data-acao="rgForaApagar" data-id="${e.id}" data-a="${a.id}">apagar</button></div>`).join('')}</div>` : ''}`);
  },
  rgForaSalvar: el => {
    const a = achar(el.dataset.id); if (!a) return;
    const f = Math.round(+$('#rg-f')?.value), ac = Math.round(+$('#rg-ac')?.value || 0), dia = $('#rg-dia')?.value || hoje();
    if (!(f >= 1 && f <= 300)) { ui.iaMsg = 'Diga quantas questões você fez (de 1 a 300).'; fecharModal(); render(); return; }
    if (ac < 0 || ac > f) { ui.iaMsg = 'O número de acertos não pode ser maior que o de questões.'; fecharModal(); render(); return; }
    if (dia > hoje()) { ui.iaMsg = 'A data não pode ser no futuro.'; fecharModal(); render(); return; }
    (S.foraQ ||= []).push({ id: uid(), a: a.id, dia, f, ac });
    const v = ((S.qlog[dia] ||= {})[a.materia] ||= { f: 0, a: 0 }); v.f += f; v.a += ac;
    const ant = a.questoes || { feitas: 0, acertos: 0, semAc: 0 }; a.questoes = { ...ant, feitas: ant.feitas + f, acertos: ant.acertos + ac };
    salvar(); fecharModal(); ui.iaMsg = `Anotado: ${ac} de ${f} em "${a.titulo}". Já entrou na média e no Desempenho.`; render();
  },
  rgForaApagar: el => {
    const e = (S.foraQ || []).find(x => x.id === el.dataset.id), a = achar(el.dataset.a); if (!e || !a) return;
    S.foraQ = S.foraQ.filter(x => x !== e);
    const v = S.qlog[e.dia]?.[a.materia]; if (v) { v.f = Math.max(0, v.f - e.f); v.a = Math.max(0, v.a - e.ac); if (!v.f) delete S.qlog[e.dia][a.materia]; if (!Object.keys(S.qlog[e.dia]).length) delete S.qlog[e.dia]; }
    if (a.questoes) a.questoes = { ...a.questoes, feitas: Math.max(0, a.questoes.feitas - e.f), acertos: Math.max(0, a.questoes.acertos - e.ac) };
    salvar(); ui.iaMsg = 'Apaguei esse registro.'; ACOES.rgFora({ dataset: { id: a.id } });
  },
  rgRevisei: el => {
    const a = achar(el.dataset.id); if (!a) return;
    if (!a.rev) a.rev = { n: 0, hist: [] };
    delete a.revSoneca; revisaoFeita(a, null); salvar();
    ui.iaMsg = `Marquei "${a.titulo}" como revisado hoje.`; render();
  },
  rgAdiar: el => {
    const a = achar(el.dataset.id); if (!a) return; const v = +el.dataset.v;
    if (v) a.revSoneca = somaDias(hoje(), v); else delete a.revSoneca;
    salvar(); render();
  },
});
document.addEventListener('change', e => {
  const q = e.target.dataset?.rgq;
  if (q) { ui.rgQtd ||= {}; if (+e.target.value) ui.rgQtd[q] = +e.target.value; else delete ui.rgQtd[q]; if (+e.target.value && !(ui.rgSel || {})[q]) { if (!ui.rgSel) ui.rgSel = Object.fromEntries(rgSelecao(rgAnalise() || []).map(x => [x.a.id, true])); ui.rgSel[q] = true; } const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  if (e.target.dataset?.ui === 'rgMat') { ui.rgMat = e.target.value; ui.rgTodos = false; render(); } });
