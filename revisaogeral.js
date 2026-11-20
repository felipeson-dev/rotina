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
    const L = (grupos[chave] || []).slice().sort((x, y) => x.dia < y.dia ? 1 : x.dia > y.dia ? -1 : 0);
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
    return { a, m: a.materia, tag: tagDe(a), n, n90, pct, faixa, firme, faltam: Math.max(0, RG_MIN - n), dias, razao, score, status, cob };
  }).sort((x, y) => y.score - x.score);
}

const rgDias = d => d == null ? 'sem data' : d === 0 ? 'visto hoje' : `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
const RG_STATUS = { agora: ['Rever agora', '#C2483D'], breve: ['Em breve', '#C98A12'], ok: ['Em dia', '#2E8B57'], adiada: ['Adiado', 'var(--fraco)'] };
const RG_FILTROS = [['agora', 'Rever agora'], ['breve', 'Em breve'], ['poucas', 'Poucas questões'], ['ok', 'Em dia'], ['adiada', 'Adiados'], ['todos', 'Todos']];

function rgCartao(x) {
  const [rot, cor_] = RG_STATUS[x.status];
  const linha1 = `${x.dias == null ? 'sem data de contato' : x.dias === 0 ? 'visto hoje' : `${rgDias(x.dias)} sem rever`} · ${x.n90 ? `${x.n90} ${x.n90 === 1 ? 'questão' : 'questões'} nos últimos 3 meses` : 'nenhuma questão nos últimos 3 meses'}`;
  const linha2 = x.pct == null ? (x.n ? `só ${x.n} ${x.n === 1 ? 'questão feita' : 'questões feitas'}: faltam ${x.faltam} para ter média` : `nenhuma questão feita: faltam ${RG_MIN} para ter média`)
    : x.firme ? `acerto ${RG_NOME[x.faixa]} (${x.pct}%) nas últimas ${RG_MIN}` : `prévia: ${x.pct}% em ${x.n} questões (faltam ${x.faltam} para a média valer)`;
  const motivo = x.status === 'agora' ? (x.faixa === 'baixa' ? 'acerto baixo e tempo sem rever' : x.faixa === 'alta' ? 'faz tempo, mesmo com acerto alto' : 'faz tempo sem rever') : '';
  return `<div class="rg-ass" style="${cor(x.m)}"><div class="rg-topo"><div class="coluna" style="gap:2px;flex:1;min-width:0"><b>${esc(x.a.titulo)}</b><span class="fraco" style="font-size:13px">${esc(x.m)}${x.cob ? ` · ${x.cob} questões no banco` : ''}${x.a.fraco ? ' · marcado como fraco' : ''}</span></div>
      <div class="coluna" style="gap:2px;align-items:flex-end"><b style="color:${x.firme ? dsCorAc(x.pct) : 'var(--fraco)'}">${x.pct == null ? '–' : x.pct + '%'}</b><span style="font-size:12px;font-weight:700;color:${cor_}">${rot}</span></div></div>
    <span class="fraco" style="font-size:13px">${linha1}</span><span class="fraco" style="font-size:13px">${linha2}${motivo ? ` · <b>${motivo}</b>` : ''}</span>
    <div class="linha" style="gap:6px"><button class="chip" data-acao="rgTreinar" data-id="${x.a.id}">${x.n < RG_MIN ? `Fazer ${Math.max(5, x.faltam)} questões` : 'Treinar 10 questões'}</button>
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
  return cab + `<section class="cartao"><div class="resumo-dia">
      <div><strong>${todos.length}</strong><span>assuntos estudados</span></div>
      <div><strong style="color:${agora.length ? '#C2483D' : '#2E8B57'}">${agora.length}</strong><span>para rever agora</span></div>
      <div><strong>${conta('poucas')}</strong><span>com poucas questões</span></div>
      <div><strong style="color:${dsCorAc(media)}">${media == null ? '–' : media + '%'}</strong><span>acerto médio</span></div></div>
    <p class="fraco" style="margin:0;font-size:13px">As sugestões não são obrigatórias: servem de guia. A média de acerto só vale a partir de ${RG_MIN} questões do assunto. Acerto alto = 70% ou mais, médio = 50 a 69%, baixo = abaixo de 50%.</p>
    ${agora.length ? `<div class="linha"><button class="botao grande" data-acao="rgMontar">Montar a revisão de hoje (${Math.min(5, agora.length)} ${Math.min(5, agora.length) === 1 ? 'assunto' : 'assuntos'})</button></div>` : '<p style="margin:0">Nada urgente por enquanto. Bom trabalho!</p>'}
    ${porMat.length ? `<div class="linha" style="gap:6px">${porMat.map(x => `<span class="selo" style="${cor(x.m)}">${esc(x.m)}: ${x.r} p/ rever</span>`).join('')}</div>` : ''}</section>
    <section class="cartao"><div class="linha" style="gap:6px">${RG_FILTROS.map(([v, t]) => `<button class="chip" data-acao="rgFiltro" data-v="${v}" aria-pressed="${ui.rgFiltro === v}">${t} (${conta(v)})</button>`).join('')}</div>
      <label class="campo" style="max-width:280px">Matéria<select data-ui="rgMat"><option value="">Todas</option>${mats.map(m => `<option ${ui.rgMat === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
      <div class="coluna" style="gap:10px">${mostrar.length ? mostrar.map(rgCartao).join('') : '<p class="fraco" style="margin:0">Nenhum assunto nesta lista.</p>'}</div>
      ${lista.length > mostrar.length ? `<button class="link" data-acao="rgMais">Mostrar todos (${lista.length})</button>` : ''}</section>`;
}
const rgBate = (x, f) => f === 'todos' ? true : f === 'poucas' ? !x.firme && x.status !== 'adiada' : x.status === f;

Object.assign(VIEWS, { revisao: vRevisao });
Object.assign(ACOES, {
  rgFiltro: el => { ui.rgFiltro = el.dataset.v; ui.rgTodos = false; render(); },
  rgMais: () => { ui.rgTodos = true; render(); },
  rgTreinar: async el => { const a = achar(el.dataset.id); if (!a) return; await questoesDosAssuntos([a], { revisaoIds: [a.id], chaveLista: 'rg:' + a.id + ':' + hoje(), tituloLista: 'Revisão · ' + a.titulo }, 10); },
  rgMontar: async () => {
    const l = (rgAnalise() || []).filter(x => x.status === 'agora').slice(0, 5).map(x => x.a);
    if (!l.length) return;
    await questoesDosAssuntos(l, { revisaoIds: l.map(a => a.id), chaveLista: 'rg:' + hoje(), tituloLista: 'Revisão de hoje' }, 4);
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
document.addEventListener('change', e => { if (e.target.dataset?.ui === 'rgMat') { ui.rgMat = e.target.value; ui.rgTodos = false; render(); } });
