'use strict';
/* Aba Revisão (unificada com o motor de Revisão Inteligente em revisoes.js):
   - Mostra exatamente o mesmo estado de retenção (%), prioridade e motivo que os blocos de Hoje.
   - Sessões inteligentes de 1 toque (Expressa 15 min / Inteligente 35 min / Só meus erros) com intercalação de matérias.
   - Permite escolher assuntos manualmente, registrar questões feitas fora do app (sincronizado com Hoje e Desempenho) e adiar sem culpa. */

Object.assign(ICONES, { revisao: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>' });
if (!GRUPOS_MENU.some(g => g[0] === 'revisao')) GRUPOS_MENU.splice(3, 0, ['revisao', 'Revisão', [['revisao', '']]]);

const rgDias = d => d == null ? 'sem data' : d === 0 ? 'visto hoje' : `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
const RG_STATUS = {
  fixacao: ['Fixação 48h', '#C2255C'],
  agora: ['Rever agora', '#C2483D'],
  breve: ['Em breve', '#C98A12'],
  ok: ['Em dia', '#2E8B57'],
  adiada: ['Adiado', 'var(--fraco)'],
};
const RG_FILTROS = [
  ['agora', 'Para rever'],
  ['breve', 'Em breve'],
  ['poucas', 'Poucas questões'],
  ['ok', 'Em dia'],
  ['adiada', 'Adiados'],
  ['todos', 'Todos'],
];
const corRet = r => r >= 85 ? '#2E8B57' : r >= 72 ? '#C98A12' : '#C2483D';

let rgCache = [];
const rgPadrao = () => S.perfil.rgN || 4;
const rgAnalise = () => (BANCO.pronto ? analisarRevisoes() : []);
const rgBate = (x, f) => f === 'todos' ? true : f === 'poucas' ? !x.firme && x.status !== 'adiada' : f === 'agora' ? (x.status === 'agora' || x.status === 'fixacao') : x.status === f;
const rgSelecao = todos => ui.rgSel ? todos.filter(x => ui.rgSel[x.a.id]) : intercalarRevisao(todos.filter(x => x.status === 'fixacao' || x.status === 'agora'), 4);

function rgCartao(x) {
  const [rot, cor_] = RG_STATUS[x.status] || RG_STATUS.ok;
  const qn = ui.rgQtd?.[x.a.id] || 0, padrao = rgPadrao(), naRev = rgSelecao(rgCache).some(s => s.a.id === x.a.id);
  const linha1 = `${rgDias(x.dias)} · ${x.n90 ? `${x.n90}q nos últimos 3 meses` : 'sem questões recentes'}${x.nFora ? ` · ${x.nFora} fora` : ''}`;
  const linha2 = x.pct == null
    ? (x.n ? `${x.n}q feitas (faltam ${x.faltam} p/ média firme)` : 'nenhuma questão registrada')
    : `${x.firme ? 'acerto' : 'prévia'}: ${x.pct}% (${x.n}q)${x.firme ? '' : ` · faltam ${x.faltam}`}`;
  const clsTag = x.a.cls === 'A' ? '<span class="selo cls-a">cai muito</span>' : '';
  return `<div class="rg-ass" style="${cor(x.m)}">
    <div class="rg-topo">
      <div class="coluna" style="gap:3px;flex:1;min-width:0">
        <div class="linha" style="gap:6px"><span class="tag" style="${cor(x.m)}">${esc(x.m)}</span>${clsTag}${x.a.fraco ? '<span class="selo atraso">fraco</span>' : ''}</div>
        <b>${esc(nomeCanonicoRev(x.a))}</b>
      </div>
      <div class="coluna" style="gap:2px;align-items:flex-end;flex:none">
        <b style="font-size:18px;color:${corRet(x.retencao)}">${x.retencao}%</b>
        <span style="font-size:11.5px;font-weight:700;color:${cor_}">${rot}</span>
      </div>
    </div>
    <div class="barra fina"><i style="width:${x.retencao}%;background:${corRet(x.retencao)}"></i></div>
    <span class="fraco" style="font-size:13px">${linha1} · ${linha2}</span>
    ${x.motivo ? `<span style="font-size:13px;color:var(--tinta)">${esc(x.motivo)}${x.status === 'ok' || x.status === 'breve' ? ` · próxima em ~${x.diasProx}d` : ''}</span>` : ''}
    <div class="linha rg-escolha" style="gap:10px">
      <label class="linha" style="gap:6px;cursor:pointer;font-size:13.5px"><input type="checkbox" data-acao="rgSel" data-id="${x.a.id}" ${naRev ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--acento)"> Na sessão</label>
      <label class="linha" style="gap:6px;font-size:13.5px">questões<select data-rgq="${x.a.id}" style="min-height:34px;width:auto">${[0, 2, 4, 6, 8, 10, 15].map(v => `<option value="${v}" ${qn === v ? 'selected' : ''}>${v ? v : `padrão (${padrao})`}</option>`).join('')}</select></label>
    </div>
    <div class="linha" style="gap:6px">
      <button class="chip chip-mini" data-acao="rgTreinar" data-id="${x.a.id}">${qn ? `Treinar ${qn}q` : x.n < REV_MIN_FIRME ? `Fazer ${Math.max(4, x.faltam)}q` : 'Treinar 6q'}</button>
      <button class="chip chip-mini" data-acao="rgFora" data-id="${x.a.id}">+ Fora do app</button>
      <button class="chip chip-mini" data-acao="rgRevisei" data-id="${x.a.id}">Já revisei</button>
      ${x.status === 'adiada' ? `<button class="chip chip-mini" data-acao="rgAdiar" data-id="${x.a.id}" data-v="0">Voltar</button>` : `<button class="chip chip-mini" data-acao="rgAdiar" data-id="${x.a.id}" data-v="14">Adiar 2 sem.</button>`}
    </div>
  </div>`;
}

function vRevisao() {
  const cab = `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">memória adaptativa · sem sufocar conteúdo novo</span><h1>Revisão Inteligente</h1></div></header>${avisoIa()}`;
  if (!BANCO.pronto) { carregarBanco(); return cab + '<section class="cartao"><p class="fraco" style="margin:0">Abrindo o banco de questões…</p></section>'; }
  const todos = analisarRevisoes();
  if (!todos.length) return cab + `<section class="cartao"><h2>Sua memória inteligente começa no 1º assunto concluído</h2>
    <p class="fraco" style="margin:0">Assim que você concluir um assunto no plano, o app acompanha a sua retenção, mistura erros antigos com questões inéditas das provas de SP e sugere revisões curtas — sem nunca atrapalhar os assuntos novos.</p>
    <div class="linha"><button class="botao" data-acao="ir" data-v="hoje">Ir para Hoje</button></div></section>`;

  ui.rgFiltro ||= 'agora'; ui.rgMat ||= '';
  const conta = f => todos.filter(x => rgBate(x, f)).length;
  const mats = [...new Set(todos.map(x => x.m))].sort((p, q) => p.localeCompare(q));
  const lista = todos.filter(x => rgBate(x, ui.rgFiltro) && (!ui.rgMat || x.m === ui.rgMat));
  const retMedia = Math.round(soma(todos, x => x.retencao) / todos.length);
  const paraRever = todos.filter(x => x.status === 'agora' || x.status === 'fixacao');
  const emDia = todos.filter(x => x.status === 'ok').length;
  const errosVenc = (S.erros || []).filter(e => e.rev <= hoje()).length;
  const porMat = mats.map(m => ({ m, r: paraRever.filter(x => x.m === m).length })).filter(x => x.r);
  const mostrar = lista.slice(0, ui.rgTodos ? 500 : 25);
  rgCache = todos;
  const sel = rgSelecao(todos), totalQ = soma(sel, x => ui.rgQtd?.[x.a.id] || rgPadrao());

  return cab + `<section class="cartao">
    <div class="resumo-dia">
      <div><strong style="color:${corRet(retMedia)}">${retMedia}%</strong><span>retenção média</span></div>
      <div><strong style="color:${paraRever.length ? '#C2483D' : '#2E8B57'}">${paraRever.length}</strong><span>prontos p/ rever</span></div>
      <div><strong style="color:#2E8B57">${emDia}</strong><span>em dia</span></div>
      <div><strong>${todos.length}</strong><span>estudados</span></div>
    </div>
    <div class="coluna" style="gap:10px;padding-top:8px;border-top:1px dashed var(--linha)">
      <span class="rotulo">sessões rápidas de 1 toque (intercaladas + erros antigos)</span>
      <div class="linha" style="gap:8px">
        <button class="botao grande" data-acao="rgExpressa" ${todos.length ? '' : 'disabled'}>⚡ Revisão Expressa (15 min · ~6q)</button>
        <button class="botao claro" data-acao="rgInteligente" ${todos.length ? '' : 'disabled'}>🧠 Sessão Inteligente (35 min · ~12q)</button>
        ${errosVenc ? `<button class="botao contorno" data-acao="qRefazerErros">🎯 Erros vencidos (${errosVenc})</button>` : ''}
      </div>
      <p class="fraco" style="margin:0;font-size:13px">O algoritmo prioriza o que está esfriando × o que mais cai nas suas provas de SP, alternando Exatas com Bio/Humanas. Se acumular, foque só nos primeiros — os de baixa incidência são perdoados automaticamente.</p>
    </div>
    ${detalhe('rgCustom', `Personalizar sessão (${sel.length} ${sel.length === 1 ? 'assunto' : 'assuntos'} · ${totalQ} questões)`, `
      <div class="linha" style="gap:6px"><span class="fraco">Questões por assunto:</span>${[2, 4, 6, 8, 10].map(n => `<button class="chip chip-mini" data-acao="rgN" data-v="${n}" aria-pressed="${rgPadrao() === n}">${n}</button>`).join('')}</div>
      <p class="fraco" style="margin:0;font-size:13px">${ui.rgSel ? 'Assuntos escolhidos por você abaixo.' : 'Selecionados automaticamente os mais urgentes (intercalados).'} Marque/desmarque "Na sessão" em qualquer cartão.${ui.rgSel || Object.values(ui.rgQtd || {}).some(Boolean) ? ' <button class="link" data-acao="rgAuto">Voltar ao automático</button>' : ''}</p>
      <div class="linha"><button class="botao" data-acao="rgMontar" ${sel.length ? '' : 'disabled'}>Iniciar sessão (${totalQ} questões)</button></div>
    `)}
    ${porMat.length ? `<div class="linha" style="gap:6px">${porMat.map(x => `<span class="selo" style="${cor(x.m)}">${esc(x.m)}: ${x.r}</span>`).join('')}</div>` : ''}
  </section>
  <section class="cartao">
    <div class="linha" style="gap:6px">${RG_FILTROS.map(([v, t]) => `<button class="chip chip-mini" data-acao="rgFiltro" data-v="${v}" aria-pressed="${ui.rgFiltro === v}">${t} (${conta(v)})</button>`).join('')}</div>
    <label class="campo" style="max-width:260px">Matéria<select data-ui="rgMat"><option value="">Todas</option>${mats.map(m => `<option ${ui.rgMat === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
    <div class="coluna" style="gap:10px">${mostrar.length ? mostrar.map(rgCartao).join('') : '<p class="fraco" style="margin:0">Nenhum assunto neste filtro — tudo tranquilo por aqui!</p>'}</div>
    ${lista.length > mostrar.length ? `<button class="link" data-acao="rgMais">Mostrar todos (${lista.length})</button>` : ''}
  </section>`;
}

Object.assign(VIEWS, { revisao: vRevisao });
Object.assign(ACOES, {
  rgFiltro: el => { ui.rgFiltro = el.dataset.v; ui.rgTodos = false; render(); },
  rgMais: () => { ui.rgTodos = true; render(); },
  rgExpressa: async () => {
    const l = escolherRevisao(2); if (!l.length) return;
    await questoesDosAssuntos(l, { revisaoIds: l.map(a => a.id), modoRevisao: true, chaveLista: 'rg:exp:' + hoje(), tituloLista: 'Revisão Expressa' }, 3);
  },
  rgInteligente: async () => {
    const l = escolherRevisao(4); if (!l.length) return;
    await questoesDosAssuntos(l, { revisaoIds: l.map(a => a.id), modoRevisao: true, chaveLista: 'rg:int:' + hoje(), tituloLista: 'Sessão Inteligente' }, 3);
  },
  rgTreinar: async el => {
    const a = achar(el.dataset.id); if (!a) return;
    await questoesDosAssuntos([a], { revisaoIds: [a.id], modoRevisao: true, chaveLista: 'rg:' + a.id + ':' + hoje(), tituloLista: 'Revisão · ' + nomeCanonicoRev(a) }, ui.rgQtd?.[a.id] || 6);
  },
  rgMontar: async () => {
    const sel = rgSelecao(analisarRevisoes()); if (!sel.length) return;
    const l = sel.map(x => x.a), qtd = Object.fromEntries(sel.map(x => [x.a.id, ui.rgQtd?.[x.a.id] || rgPadrao()]));
    await questoesDosAssuntos(l, { revisaoIds: l.map(a => a.id), modoRevisao: true, chaveLista: 'rg:' + hoje() + ':' + l.map(a => a.id).join(','), tituloLista: 'Revisão personalizada', qtd }, rgPadrao());
  },
  rgN: el => { S.perfil.rgN = +el.dataset.v; salvar(); render(); },
  rgAuto: () => { ui.rgSel = null; ui.rgQtd = {}; render(); },
  rgSel: el => {
    const y = window.scrollY;
    if (!ui.rgSel) ui.rgSel = Object.fromEntries(rgSelecao(analisarRevisoes()).map(x => [x.a.id, true]));
    if (ui.rgSel[el.dataset.id]) delete ui.rgSel[el.dataset.id]; else ui.rgSel[el.dataset.id] = true;
    render(); window.scrollTo(0, y);
  },
  rgFora: el => {
    const a = achar(el.dataset.id); if (!a) return;
    const lista = (S.foraQ || []).filter(e => e.a === a.id).sort((p, q) => p.dia < q.dia ? 1 : -1);
    abrirModal(`<div class="entre"><div>${tag(a.materia)}</div><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
      <h2>Questões de fora: ${esc(nomeCanonicoRev(a))}</h2>
      <span class="fraco">Fez questões no livro, Ferretto ou cursinho? Anote aqui: entram na retenção, no acerto e no Desempenho.</span>
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
    if (dia === hoje()) revisaoFeita(a, Math.round(ac / f * 100), { manual: true });
    salvar(); fecharModal(); ui.iaMsg = `Anotado: ${ac} de ${f} em "${nomeCanonicoRev(a)}". Retenção atualizada!`; render();
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
    revisaoFeita(a, null, { manual: true }); salvar();
    ui.iaMsg = `Marquei "${nomeCanonicoRev(a)}" como revisado hoje.`; render();
  },
  rgAdiar: el => {
    const a = achar(el.dataset.id); if (!a) return; const v = +el.dataset.v;
    if (v) a.revSoneca = somaDias(hoje(), v); else delete a.revSoneca;
    salvar(); render();
  },
});

document.addEventListener('change', e => {
  const q = e.target.dataset?.rgq;
  if (q) {
    ui.rgQtd ||= {};
    if (+e.target.value) ui.rgQtd[q] = +e.target.value; else delete ui.rgQtd[q];
    if (+e.target.value && !(ui.rgSel || {})[q]) {
      if (!ui.rgSel) ui.rgSel = Object.fromEntries(rgSelecao(analisarRevisoes()).map(x => [x.a.id, true]));
      ui.rgSel[q] = true;
    }
    const y = window.scrollY; render(); window.scrollTo(0, y); return;
  }
  if (e.target.dataset?.ui === 'rgMat') { ui.rgMat = e.target.value; ui.rgTodos = false; render(); }
});
