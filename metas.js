'use strict';
/* Meta de questões, simples: um orçamento por dia em "pontos". Questão de matéria leve vale 1 ponto, de Matemática/Física/Química vale 2
   (por levarem mais tempo). 120 pontos = 120 questões leves ou 60 pesadas. O app reparte o orçamento entre as matérias do dia dela
   e mostra a meta em questões. Tudo que é detalhe fica recolhido. */

const DIAS_NOME = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const CUSTO_Q = { 'Matemática': 2, 'Física': 2, 'Química': 2 };
S.planoQ ||= { total: 120, dias: {}, compensar: true, texto: '', resposta: '' };
S.qmeta ||= {};
ui.mqPer = 'semana'; ui.mqTexto = ''; ui.ab ||= {};

const planoQ = () => { const p = (S.planoQ ||= { total: 120, dias: {}, compensar: true, texto: '', resposta: '' }); if (!(p.total >= 0) || p.total > 400) p.total = 120; return p; };
const custoQ = m => CUSTO_Q[m] ?? 1;
const qDia = d => Object.entries(S.qlog[d] || {}).filter(([m]) => m);
const feitasDia = d => soma(qDia(d), ([, v]) => v.f);
const acerto = (f, a, s = 0) => (f - s) > 0 ? Math.round(a / (f - s) * 100) : null;
const fmtT = seg => seg >= 60 ? fmtMin(Math.round(seg / 60)) : seg ? '<1 min' : '—';
const pontosDia = d => { const p = planoQ(), wd = deIso(d).getDay(); return p.dias?.[wd] ?? p.total; };

/** Matérias do dia: as dos assuntos de hoje; sem plano, as da semana (até 3); mais as que já tiveram questões hoje. */
function materiasDoDia() {
  const d = S.dias[hoje()], feitas = qDia(hoje()).map(([m]) => m).filter(m => MIN_Q[m]);
  let mats = [...new Set((d?.blocos || []).map(b => b.materia).filter(m => MIN_Q[m]))];
  if (!mats.length) { const w = semAtual(); mats = [...new Set(S.assuntos.filter(a => a.semana === w && !a.feito && MIN_Q[a.materia]).map(a => a.materia))].slice(0, 3); }
  return [...new Set([...mats, ...feitas])];
}
/** Questões de cada matéria: os pontos do dia divididos igualmente entre as matérias, e cada parte dividida pelo custo da matéria. */
function metasPorMateria() {
  const mats = materiasDoDia(), pts = pontosDia(hoje()), o = {};
  if (!mats.length || !pts) return o;
  for (const m of mats) o[m] = Math.max(5, Math.round(pts / mats.length / custoQ(m) / 5) * 5);
  // compensa até 25% do que faltou ontem (só depois que ela começou a registrar)
  const ont = somaDias(hoje(), -1), antes = S.qmeta[ont] || 0, base = soma(Object.values(o), x => x);
  if (planoQ().compensar && antes && Object.keys(S.qlog).some(x => x < hoje() && feitasDia(x) > 0)) {
    const extra = Math.min(Math.round(base * 0.25 / 5) * 5, Math.round(Math.max(0, antes - feitasDia(ont)) / 2 / 5) * 5);
    if (extra > 0) for (const m of mats) o[m] = Math.round(o[m] * (base + extra) / base / 5) * 5;
  }
  return o;
}
function metaTotal() { const t = soma(Object.values(metasPorMateria()), x => x); S.qmeta[hoje()] = t; return t; }
const feitasHoje = m => (S.qlog[hoje()] || {})[m]?.f || 0;
const minQuestoes = metas => Math.round(soma(Object.entries(metas), ([m, n]) => n * minPorQ(m)));

/** Quantidade de questões para um bloco de hoje: usa a meta do dia dividida pelos assuntos da matéria (ou o padrão do assunto). */
function questoesDoBloco(b) {
  if (!b) return 15;
  if (b.tipo === 'revisao') return Math.max(4, ((b.revisao || []).length || 1) * (b.vaga === 'dia' ? 4 : 5));
  const a = b.assuntoId && achar(b.assuntoId);
  const metas = metasPorMateria(), metaMat = metas[b.materia];
  if (metaMat > 0) {
    const d = S.dias[hoje()];
    const nBlocos = Math.max(1, (d?.blocos || []).filter(x => x.materia === b.materia && (!x.assuntoId || ehConteudo(achar(x.assuntoId)))).length);
    return Math.max(5, Math.round(metaMat / nBlocos / 5) * 5);
  }
  return a ? (tempoDe(a).q || 15) : 15;
}
window.questoesDoBloco = questoesDoBloco;

function sincronizarPassoQ(b, a) {
  if (!b || !a || !ehConteudo(a) || !b.passos?.length) return;
  const q = questoesDoBloco(b);
  b.qMeta = q;
  const p = b.passos.find(x => /quest/i.test(x.t));
  if (!p) return;
  if (/^Fazer \d+ quest/i.test(p.t)) p.t = `Fazer ${q} questões (~${fmtMin(Math.round(q * minPorQ(b.materia)))})`;
  if (!p.ok && (a.questoes?.feitas || 0) >= q) {
    p.ok = true;
    S.feitos[hoje()] = (S.feitos[hoje()] || 0) + 1;
    if (b.passos.every(x => x.ok)) setFeito(a, true, false);
  }
}
window.sincronizarPassoQ = sincronizarPassoQ;

function anelQ(feito, meta, tam = 108) {
  const r = tam / 2 - 9, C = 2 * Math.PI * r, p = meta ? Math.min(1, feito / meta) : 0;
  return `<div class="anel-q" style="width:${tam}px;height:${tam}px"><svg viewBox="0 0 ${tam} ${tam}" aria-hidden="true"><circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="var(--linha)" stroke-width="9"/>
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${feito >= meta && meta ? '#2B8A3E' : 'var(--rosa)'}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/></svg>
    <span><b>${feito}</b><small>de ${meta}</small></span></div>`;
}

const detalhe = (k, titulo, corpo) => `<details class="det-q" data-k="${k}" ${ui.ab[k] ? 'open' : ''}><summary>${titulo}</summary><div class="det-corpo">${corpo}</div></details>`;

function diasDoPeriodo(per) {
  const h = hoje();
  if (per === 'semana') return Array.from({ length: 7 }, (_, i) => somaDias(semAtual(), i));
  if (per === 'mes') { const m = mesDe(h), n = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate(); return Array.from({ length: n }, (_, i) => `${m}-${pad(i + 1)}`); }
  return Object.keys(S.qlog).sort();
}
function resumoPeriodo(dias) {
  let f = 0, a = 0, s = 0, t = 0, batidos = 0, comMeta = 0; const mats = {};
  for (const d of dias) {
    const meta = d < hoje() ? S.qmeta[d] || 0 : 0; if (meta) { comMeta++; if (feitasDia(d) >= meta) batidos++; }
    for (const [m, v] of qDia(d)) { f += v.f; a += v.a; s += v.s || 0; t += v.t || 0; const x = (mats[m] ||= { f: 0, a: 0, s: 0, t: 0 }); x.f += v.f; x.a += v.a; x.s += v.s || 0; x.t += v.t || 0; }
  }
  return { f, a, s, t, batidos, comMeta, mats };
}
function graficoPeriodo(dias, per) {
  const max = Math.max(10, ...dias.map(d => Math.max(feitasDia(d), S.qmeta[d] || 0)));
  return `<div class="q-dias ${per === 'semana' ? '' : 'denso'}">${dias.slice(-62).map(d => { const f = feitasDia(d), meta = S.qmeta[d] || 0;
    return `<div class="${d === hoje() ? 'hoje' : ''}" title="${diaCurto(d)}: ${f}${meta ? ' de ' + meta : ''}"><div class="col"><i style="height:${Math.round(f / max * 100)}%" class="${f >= meta && meta ? 'bateu' : ''}"></i>${meta ? `<u style="bottom:${Math.round(meta / max * 100)}%"></u>` : ''}</div><small>${per === 'semana' ? DIAS_NOME[deIso(d).getDay()] : +d.slice(8)}</small></div>`; }).join('')}</div>
    <p class="fraco" style="margin:0;font-size:13px">Barras: questões do dia. Tracinho: meta do dia. Verde: bateu a meta.</p>`;
}

function painelQuestoes() {
  const p = planoQ(), metas = metasPorMateria(), meta = metaTotal(), feito = feitasDia(hoje()), mats = Object.keys(metas);
  const tq = Math.round(soma(qDia(hoje()), ([, v]) => v.t || 0) / 60), tempoMeta = minQuestoes(metas), capMin = S.dias[hoje()]?.cap || 0;
  const per = ui.mqPer, dias = diasDoPeriodo(per), r = resumoPeriodo(dias), ac = acerto(r.f, r.a, r.s);
  const pts = pontosDia(hoje()), descanso = p.dias?.[deIso(hoje()).getDay()] === 0;
  const linhaMat = mats.map(m => { const f = feitasHoje(m); return `<span class="chip-q" style="${cor(m)}"><i class="ponto"></i>${esc(m)} <b>${f}/${metas[m]}</b>${f >= metas[m] ? ' ✓' : ''}</span>`; }).join('');
  const porMateria = mats.length ? mats.map(m => { const f = feitasHoje(m), v = (S.qlog[hoje()] || {})[m] || { f: 0, a: 0, s: 0 }, a2 = acerto(v.f, v.a, v.s || 0);
    return `<div class="meta-linha" style="${cor(m)}"><span><i class="ponto"></i>${esc(m)} <small class="fraco">· cada questão vale ${custoQ(m)} ponto${custoQ(m) > 1 ? 's' : ''}${a2 != null ? ` · ${a2}% de acerto` : ''}</small></span><span class="fraco">${f} de ${metas[m]}</span>
      <div class="barra"><i style="width:${Math.min(100, Math.round(f / Math.max(1, metas[m]) * 100))}%;background:var(--c)"></i></div>
      <div class="linha mais-q">${[5, 10, 20].map(n => `<button class="chip" data-acao="qMais" data-m="${esc(m)}" data-v="${n}">+${n}</button>`).join('')}</div></div>`; }).join('') : '<p class="fraco" style="margin:0">Monte o seu dia para eu escolher as matérias.</p>';
  const ritmo = `<div class="alterna" role="group" style="align-self:flex-start">${[['semana', 'Semana'], ['mes', 'Mês'], ['tudo', 'Tudo']].map(([v, t]) => `<button data-acao="mqPer" data-v="${v}" aria-pressed="${per === v}">${t}</button>`).join('')}</div>
    <div class="resumo-dia"><div><strong>${r.f}</strong><span>questões feitas</span></div><div><strong>${ac != null ? ac + '%' : '—'}</strong><span>de acerto</span></div><div><strong>${fmtT(r.t)}</strong><span>de tempo anotado</span></div>${r.comMeta ? `<div><strong>${r.batidos}/${r.comMeta}</strong><span>dias com meta batida</span></div>` : ''}</div>
    ${graficoPeriodo(dias, per)}
    ${Object.keys(r.mats).length ? `<div class="coluna" style="gap:6px"><span class="rotulo">por matéria</span>${Object.entries(r.mats).sort((a, b) => b[1].f - a[1].f).map(([m, v]) => `<div class="foco-linha" style="${cor(m)}"><span><i class="ponto"></i> ${esc(m)} <small class="fraco">· ${acerto(v.f, v.a, v.s) ?? '—'}% de acerto${v.t ? ` · ${(v.t / v.f / 60).toFixed(1)} min/questão` : ''}</small></span><span class="fraco">${v.f}</span><div class="barra"><i style="width:${Math.round(v.f / Math.max(1, r.f) * 100)}%;background:var(--c)"></i></div></div>`).join('')}</div>` : ''}`;
  const plano = `<p class="fraco" style="margin:0;font-size:14px">A meta é um orçamento em pontos: <b>${p.total} pontos</b> por dia. Questão de Biologia, História, Português etc. vale 1 ponto; de Matemática, Física e Química vale 2 (levam mais tempo). Ou seja, ${p.total} questões leves ou ${Math.round(p.total / 2)} pesadas. O app reparte entre as matérias do dia.</p>
    <textarea data-ui="mqTexto" id="mq-texto" placeholder="Ou escreva do seu jeito: esta semana quero mais, domingo descanso, estou atrasada em Física…">${esc(ui.mqTexto || '')}</textarea>
    <div class="linha"><button class="botao" data-acao="mqPlanejar">Ajustar com a IA</button><span class="fraco">ou defina:</span>${stepperHtml('mq-total', p.total, 0, 400)}<button class="botao claro" data-acao="mqTotal">Usar esses pontos</button></div>
    <label class="linha" style="gap:8px;cursor:pointer"><input type="checkbox" data-acao="mqComp" ${p.compensar ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--rosa)"> Compensar parte do que faltar ontem (até +25%)</label>
    ${p.resposta ? `<p class="fraco" style="margin:0;font-size:14px">${esc(p.resposta)}</p>` : ''}`;
  return `<section class="cartao painel-q"><div class="pq-topo">${anelQ(feito, meta)}
      <div class="coluna" style="gap:6px"><h2>Questões de hoje</h2>
        <p style="margin:0">${descanso ? 'Hoje é dia de descanso de questões.' : meta ? `Meta: <b>${meta} questões</b> (${pts} pontos) · faltam <b>${Math.max(0, meta - feito)}</b>${tempoMeta ? ` · ≈ ${fmtMin(tempoMeta)}` : ''}` : 'Sem meta por enquanto: monte o seu dia.'}</p>
        <div class="linha">${linhaMat}</div>
        ${capMin && tempoMeta > capMin ? `<p style="margin:0;color:#9C3D07;font-size:14px">⚠ Passa do tempo de estudo de hoje (${fmtMin(capMin)}).</p>` : ''}
        <div class="linha"><button class="botao" data-acao="qForaRapido">+ Fiz questões fora do app</button>${feito ? `<span class="fraco">${feito} feitas${tq ? ` em ${fmtMin(tq)}` : ''}</span>` : ''}</div></div></div>
    ${detalhe('mat', 'Por matéria (hoje)', porMateria)}${detalhe('ritmo', 'Meu ritmo: semana, mês e total', ritmo)}${detalhe('plano', 'Ajustar a meta', plano)}</section>`;
}

function metaQHtml() {
  const meta = metaTotal(), feito = feitasDia(hoje());
  if (!meta && !feito) return '';
  return `<section class="cartao"><div class="pq-topo">${anelQ(feito, meta, 80)}<div class="coluna" style="gap:4px"><h2 style="font-size:19px">Questões de hoje</h2><span class="fraco" style="font-size:14px">${feito >= meta ? 'Meta batida!' : `Faltam ${meta - feito}`}</span>
    <button class="link" data-acao="ir" data-v="questoes" style="padding:0;align-self:flex-start">Fazer ou registrar questões</button></div></div></section>`;
}
function metaQTabela() { return ''; }
function ajustesQuestoesHtml() {
  return `<section class="cartao"><details class="det-q"><summary>Tempo por questão (por matéria)</summary><div class="det-corpo">
    <p class="fraco" style="margin:0">Em branco, uso o valor automático, que aprende com as suas listas. Entra no cálculo do tempo dos assuntos.</p>
    <div class="tab-metas" style="grid-template-columns:1fr 130px"><span class="rotulo">matéria</span><span class="rotulo">min por questão</span>
    ${Object.keys(MIN_Q).map(m => `<span>${esc(m)}</span><input type="number" step="0.5" min="0.5" max="15" data-minq="${esc(m)}" value="${S.minQ[m] || ''}" placeholder="${(Math.round(minPorQ(m) * 10) / 10)}">`).join('')}</div></div></details></section>`;
}

function registrarFora(m, f, ac, min, assuntoId = '') {
  const d = ((S.qlog[hoje()] ||= {})[m] ||= { f: 0, a: 0, s: 0, t: 0 });
  d.f += f; if (ac == null) d.s = (d.s || 0) + f; else d.a += ac;
  if (min > 0) { d.t = (d.t || 0) + min * 60; aprenderTempo(m, min * 60, f); }
  const h = hoje(), dia = S.dias[h];
  const bl = (dia?.blocos || []).find(b => assuntoId ? b.assuntoId === assuntoId : (b.materia === m && b.assuntoId && ehConteudo(achar(b.assuntoId))));
  if (bl) {
    const a = achar(bl.assuntoId);
    if (a) {
      const ant = a.questoes || { feitas: 0, acertos: 0 };
      a.questoes = { feitas: ant.feitas + f, acertos: ant.acertos + (ac != null ? ac : f) };
      a.qdia = h;
      const metaB = questoesDoBloco(bl);
      const p = (bl.passos || []).find(x => !x.ok && /quest/i.test(x.t));
      if (p && a.questoes.feitas >= Math.min(metaB, f)) {
        p.ok = true;
        S.feitos[h] = (S.feitos[h] || 0) + 1;
        if (bl.passos.every(x => x.ok)) setFeito(a, true, false);
      }
    }
  }
}

{ const qm0 = qMontar; qMontar = function () { const h = qm0(), i = h.indexOf('<!--meta-->'); return i < 0 ? painelQuestoes() + h : h.slice(0, i) + painelQuestoes() + h.slice(i); }; } // a escolha das questões vem primeiro; a meta logo abaixo
document.addEventListener('toggle', e => { const k = e.target?.dataset?.k; if (k) ui.ab[k] = e.target.open; }, true);
document.addEventListener('input', e => {
  if (e.target?.id === 'mq-total') {
    const n = Math.max(0, Math.min(400, Math.round(+e.target.value || 0)));
    const p = planoQ(); p.total = n; p.dias = {}; salvar();
  }
});
Object.assign(ACOES, {
  mqPer: el => { ui.mqPer = el.dataset.v; ui.ab.ritmo = true; render(); },
  mqComp: el => { planoQ().compensar = el.checked; ui.ab.plano = true; salvar(); render(); },
  mqTotal: () => { const n = Math.round(+document.getElementById('mq-total')?.value); if (n >= 0) { const p = planoQ(); p.total = n; p.dias = {}; p.resposta = ''; ui.ab.plano = true; salvar(); ui.iaMsg = `Meta diária: ${n} pontos.`; render(); } },
  mqPlanejar: async () => {
    const t = ($('#mq-texto')?.value || ui.mqTexto || '').trim(); if (!t) { ui.iaMsg = 'Escreva como você quer fazer as questões.'; render(); return; }
    ui.mqTexto = t; ui.carregando = 'Ajustando a meta…'; ui.ab.plano = true; render();
    try {
      const r = await chamarIa(`Ajuste a meta diária de questões de uma estudante a partir do que ela escreveu: "${t}".
A meta é um orçamento em PONTOS por dia: questão de matéria leve vale 1 ponto e de Matemática/Física/Química vale 2. Padrão: 120 pontos (120 questões leves ou 60 pesadas). Meta atual: ${planoQ().total} pontos. Hoje é ${SEMANA[deIso(hoje()).getDay()]}.
Responda SÓ com JSON: {"total":120,"dias":{"dom":0},"resposta":"1 frase objetiva do que ficou, sem conselhos extras"}
"total" = pontos por dia (0 a 400); "dias" = só os dias da semana (dom, seg, ter, qua, qui, sex, sáb) que diferem do total (0 = descanso).`, 1000, [], 'texto');
      const p = planoQ(), tot = Math.round(+r.total);
      if (tot >= 0 && tot <= 400) p.total = tot;
      p.dias = {}; for (const [k, v] of Object.entries(r.dias || {})) { const i = DIAS_NOME.indexOf(String(k).toLowerCase().slice(0, 3)); if (i >= 0 && +v >= 0 && +v !== p.total) p.dias[i] = Math.round(+v); }
      p.texto = t; p.resposta = String(r.resposta || ''); ui.mqTexto = ''; salvar();
    } catch (e) { ui.iaMsg = `Não consegui ajustar agora (${e.message}).`; }
    ui.carregando = ''; render();
  },
  qMais: el => { registrarFora(el.dataset.m, +el.dataset.v, null, 0); ui.ab.mat = true; salvar(); ui.iaMsg = `+${el.dataset.v} em ${el.dataset.m}.`; render(); },
  qForaRapido: () => {
    const mats = materiasDoDia(), todas = Object.keys(MIN_Q);
    const blHoje = (S.dias[hoje()]?.blocos || []).filter(b => b.assuntoId && ehConteudo(achar(b.assuntoId)));
    abrirModal(`<div class="entre"><h2>Questões feitas fora do app</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
      <p class="fraco" style="margin:0">Livro, apostila, Ferretto, simulado… Já conta para a meta diária e marca a etapa de questões da tarefa de hoje.</p>
      <label class="campo">Matéria<select id="f-mat">${[...mats, ...todas.filter(m => !mats.includes(m))].map(m => `<option>${m}</option>`).join('')}</select></label>
      ${blHoje.length ? `<label class="campo">Assunto de hoje (opcional)<select id="f-assunto"><option value="">Automático pela matéria</option>${blHoje.map(b => `<option value="${b.assuntoId}">${esc(b.materia)} · ${esc(b.titulo)}</option>`).join('')}</select></label>` : ''}
      <div class="linha"><label class="campo" style="flex:1 1 110px">Feitas<input type="number" id="f-feitas" min="1" max="500" inputmode="numeric"></label>
        <label class="campo" style="flex:1 1 110px">Acertos (opcional)<input type="number" id="f-acertos" min="0" max="500" inputmode="numeric"></label>
        <label class="campo" style="flex:1 1 130px">Tempo, min (opcional)<input type="number" id="f-min" min="1" max="600" inputmode="numeric"></label></div>
      <div class="linha"><button class="botao" data-acao="qForaSalvar">Registrar</button></div>`);
  },
  qForaSalvar: () => {
    const m = $('#f-mat').value, aId = $('#f-assunto')?.value || '', f = Math.round(+$('#f-feitas').value), acTxt = $('#f-acertos').value, ac = acTxt === '' ? null : Math.round(+acTxt), min = +$('#f-min').value || 0;
    if (!(f > 0) || (ac != null && (ac < 0 || ac > f))) { ui.iaMsg = 'Confira os números: os acertos não podem passar das questões feitas.'; fecharModal(); render(); return; }
    const assuntoAlvo = aId ? achar(aId) : null;
    registrarFora(assuntoAlvo ? assuntoAlvo.materia : m, f, ac, min, aId); salvar(); fecharModal();
    ui.iaMsg = `Anotado: ${f} questões de ${assuntoAlvo ? assuntoAlvo.titulo : m}${ac != null ? `, ${ac} certas (${Math.round(ac / f * 100)}%)` : ''}.`; render();
  },
});
render();
