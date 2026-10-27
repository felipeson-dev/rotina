'use strict';
/* Questões: meta do dia, total feito e ritmo. A meta do dia é UM número (o total do dia) repartido entre as matérias que estão no dia dela.
   O total vem do planejamento (escrito numa caixa, a IA entende) ou de um número padrão; pode compensar parte do que faltou ontem.
   O painel mostra hoje, a semana, o mês e o total: quantidade, acerto, tempo e quantos dias bateu a meta. */

const DIAS_NOME = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const PESO_PADRAO = { 'Matemática': 1, 'Física': 1, 'Química': 1 }; // as mais pesadas pedem menos questões; as demais, o dobro (peso 2)
S.planoQ ||= { total: 60, dias: {}, pesos: {}, compensar: true, texto: '', resposta: '' };
ui.mqPer = 'hoje'; ui.mqTexto = '';

const planoQ = () => (S.planoQ ||= { total: 60, dias: {}, pesos: {}, compensar: true, texto: '', resposta: '' });
const pesoQ = m => planoQ().pesos?.[m] ?? PESO_PADRAO[m] ?? 2;
const qDia = d => Object.entries(S.qlog[d] || {}).filter(([m]) => m);
const feitasDia = d => soma(qDia(d), ([, v]) => v.f);
const acerto = (f, a, s = 0) => (f - s) > 0 ? Math.round(a / (f - s) * 100) : null;
const fmtT = seg => seg >= 60 ? fmtMin(Math.round(seg / 60)) : seg ? '<1 min' : '—';

const baseDia = d => { const p = planoQ(), wd = deIso(d).getDay(); return p.dias?.[wd] ?? p.total; };
/** Meta do dia = base + até 25% do que faltou ontem (se ligado). */
function metaTotal(d = hoje()) {
  const b = baseDia(d); if (!b) return 0;
  if (!planoQ().compensar) return b;
  const ont = somaDias(d, -1), falta = Math.max(0, baseDia(ont) - feitasDia(ont));
  return b + Math.min(Math.round(b * 0.25 / 5) * 5, Math.round(falta / 2 / 5) * 5);
}

/** Matérias do dia: as dos assuntos de hoje; sem plano, as da semana (até 3); mais as que já tiveram questões hoje. */
function materiasDoDia() {
  const d = S.dias[hoje()], feitas = qDia(hoje()).map(([m]) => m).filter(m => MIN_Q[m]);
  let mats = [...new Set((d?.blocos || []).map(b => b.materia).filter(m => MIN_Q[m]))];
  if (!mats.length) { const w = semAtual(); mats = [...new Set(S.assuntos.filter(a => a.semana === w && !a.feito && MIN_Q[a.materia]).map(a => a.materia))].slice(0, 3); }
  return [...new Set([...mats, ...feitas])];
}
/** Parte do total do dia para cada matéria (pelo peso), em múltiplos de 5. */
function metasPorMateria(d = hoje()) {
  const mats = materiasDoDia(), tot = metaTotal(d), soPeso = soma(mats, pesoQ) || 1, o = {};
  for (const m of mats) o[m] = tot ? Math.max(5, Math.round(tot * pesoQ(m) / soPeso / 5) * 5) : 0;
  return o;
}
const feitasHoje = m => (S.qlog[hoje()] || {})[m]?.f || 0;
const minQuestoes = metas => Math.round(soma(Object.entries(metas), ([m, n]) => n * minPorQ(m)));

function anelQ(feito, meta, tam = 120) {
  const r = tam / 2 - 10, C = 2 * Math.PI * r, p = meta ? Math.min(1, feito / meta) : 0;
  return `<div class="anel-q" style="width:${tam}px;height:${tam}px"><svg viewBox="0 0 ${tam} ${tam}" aria-hidden="true"><circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="var(--linha)" stroke-width="10"/>
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${feito >= meta && meta ? '#2B8A3E' : 'var(--rosa)'}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/></svg>
    <span><b>${feito}</b><small>de ${meta}</small></span></div>`;
}

function diasDoPeriodo(per) {
  const h = hoje();
  if (per === 'hoje') return [h];
  if (per === 'semana') return Array.from({ length: 7 }, (_, i) => somaDias(semAtual(), i));
  if (per === 'mes') { const m = mesDe(h), n = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate(); return Array.from({ length: n }, (_, i) => `${m}-${pad(i + 1)}`); }
  return Object.keys(S.qlog).sort();
}

function resumoPeriodo(dias) {
  let f = 0, a = 0, s = 0, t = 0, batidos = 0, comMeta = 0; const mats = {};
  for (const d of dias) {
    const feitas = feitasDia(d); const meta = d <= hoje() ? metaTotal(d) : 0;
    if (meta && d < hoje()) { comMeta++; if (feitas >= meta) batidos++; }
    for (const [m, v] of qDia(d)) { f += v.f; a += v.a; s += v.s || 0; t += v.t || 0; const x = (mats[m] ||= { f: 0, a: 0, s: 0, t: 0 }); x.f += v.f; x.a += v.a; x.s += v.s || 0; x.t += v.t || 0; }
  }
  return { f, a, s, t, batidos, comMeta, mats };
}

function graficoPeriodo(dias, per) {
  if (per === 'hoje') {
    const m = Object.entries(metasPorMateria()), max = Math.max(1, ...m.map(([, n]) => n), ...qDia(hoje()).map(([, v]) => v.f));
    if (!m.length) return '';
    return `<div class="coluna" style="gap:8px">${m.map(([mat, meta]) => { const f = feitasHoje(mat), v = (S.qlog[hoje()] || {})[mat] || { f: 0, a: 0, s: 0 }, ac = acerto(v.f, v.a, v.s || 0);
      return `<div class="meta-linha" style="${cor(mat)}"><span><i class="ponto"></i>${esc(mat)}${ac != null ? ` <small class="fraco">· ${ac}% de acerto</small>` : ''}</span><span class="fraco">${f} de ${meta}${f >= meta ? ' ✓' : ''}</span>
        <div class="barra"><i style="width:${Math.min(100, Math.round(f / Math.max(1, meta) * 100))}%;background:var(--c)"></i></div>
        <div class="linha mais-q">${[5, 10, 20].map(n => `<button class="chip" data-acao="qMais" data-m="${esc(mat)}" data-v="${n}">+${n}</button>`).join('')}</div></div>`; }).join('')}</div>`;
  }
  const max = Math.max(10, ...dias.map(d => Math.max(feitasDia(d), metaTotal(d))));
  return `<div class="q-dias ${per === 'mes' || per === 'tudo' ? 'denso' : ''}">${dias.slice(-62).map(d => { const f = feitasDia(d), meta = metaTotal(d), futuro = d > hoje();
    return `<div class="${d === hoje() ? 'hoje' : ''}" title="${diaCurto(d)}: ${f} de ${meta}"><div class="col"><i style="height:${Math.round(f / max * 100)}%" class="${f >= meta && meta ? 'bateu' : ''}"></i>${meta && !futuro ? `<u style="bottom:${Math.round(meta / max * 100)}%"></u>` : ''}</div><small>${per === 'semana' ? DIAS_NOME[deIso(d).getDay()] : +d.slice(8)}</small></div>`; }).join('')}</div>
    <p class="fraco" style="margin:0;font-size:13px">Barras: questões feitas no dia. O tracinho é a meta do dia; a barra fica verde quando bate.</p>`;
}

function painelQuestoes() {
  const p = planoQ(), per = ui.mqPer, dias = diasDoPeriodo(per), r = resumoPeriodo(dias);
  const meta = metaTotal(), feito = feitasDia(hoje()), metas = metasPorMateria(), tq = Math.round(soma(qDia(hoje()), ([, v]) => v.t || 0) / 60);
  const abas = [['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['tudo', 'Tudo']];
  const ac = acerto(r.f, r.a, r.s), comp = meta - baseDia(hoje());
  const tempoMeta = minQuestoes(metas);
  const capMin = S.dias[hoje()]?.cap || 0, avisoTempo = capMin && tempoMeta > capMin ? `<p style="margin:0;color:#9C3D07">⚠ Essa meta ocupa ≈ ${fmtMin(tempoMeta)}, mais que o tempo de estudo de hoje (${fmtMin(capMin)}). Considere diminuir.</p>` : '';
  const resumoDia = p.dias?.[deIso(hoje()).getDay()] === 0 ? 'Hoje está marcado como dia de descanso de questões.' : `Faltam <b>${Math.max(0, meta - feito)}</b> para a meta de hoje${meta ? ` (≈ ${fmtMin(tempoMeta)} do seu dia)` : ''}.`;
  return `<section class="cartao painel-q"><div class="pq-topo">${anelQ(feito, meta)}
      <div class="coluna" style="gap:6px"><h2>Questões de hoje</h2>
        <p style="margin:0">${resumoDia}${comp > 0 ? ` <span class="fraco">(inclui +${comp} que faltaram ontem)</span>` : ''}</p>
        ${avisoTempo}<p class="fraco" style="margin:0">${feito ? `Você já fez ${feito}${tq ? ` em ${fmtMin(tq)}` : ''}.` : 'Ainda nenhuma hoje.'} A meta é o total do dia, repartido entre as matérias do seu plano de hoje${materiasDoDia().length ? ` (${materiasDoDia().map(esc).join(', ')})` : ''}.</p>
        <div class="linha"><button class="botao" data-acao="qForaRapido">+ Fiz questões fora do app</button></div></div></div>
    <div class="alterna" role="group" style="align-self:flex-start">${abas.map(([v, t]) => `<button data-acao="mqPer" data-v="${v}" aria-pressed="${per === v}">${t}</button>`).join('')}</div>
    <div class="resumo-dia"><div><strong>${r.f}</strong><span>questões feitas</span></div><div><strong>${ac != null ? ac + '%' : '—'}</strong><span>de acerto${r.s ? ' (só as com acerto anotado)' : ''}</span></div>
      <div><strong>${fmtT(r.t)}</strong><span>de tempo (anotado)</span></div>${r.comMeta ? `<div><strong>${r.batidos}/${r.comMeta}</strong><span>dias em que bateu a meta</span></div>` : ''}</div>
    ${graficoPeriodo(dias, per)}
    ${per !== 'hoje' && Object.keys(r.mats).length ? `<div class="coluna" style="gap:6px"><span class="rotulo">por matéria</span>${Object.entries(r.mats).sort((a, b) => b[1].f - a[1].f).map(([m, v]) => `<div class="foco-linha" style="${cor(m)}"><span><i class="ponto"></i> ${esc(m)} <small class="fraco">· ${acerto(v.f, v.a, v.s) ?? '—'}% de acerto${v.t ? ` · ${(v.t / v.f / 60).toFixed(1)} min/questão` : ''}</small></span><span class="fraco">${v.f}</span><div class="barra"><i style="width:${Math.round(v.f / Math.max(1, r.f) * 100)}%;background:var(--c)"></i></div></div>`).join('')}</div>` : ''}
    <div class="plano-q"><div class="entre"><h3>Planejamento das metas</h3><span class="fraco" style="font-size:14px">Meta atual: <b>${p.total}</b> por dia${Object.keys(p.dias || {}).length ? ' (com dias diferentes)' : ''}</span></div>
      <p class="fraco" style="margin:0;font-size:14px">Escreva do seu jeito e a IA ajusta a meta de cada dia e o peso de cada matéria. Ex.: "esta semana quero 80 por dia, mais Matemática e Química; domingo descanso" ou "estou atrasada em Física, 100 por dia até sexta".</p>
      <textarea data-ui="mqTexto" id="mq-texto" placeholder="Como você quer fazer as questões?">${esc(ui.mqTexto || '')}</textarea>
      <div class="linha"><button class="botao" data-acao="mqPlanejar">Ajustar as metas</button>
        <span class="fraco">ou defina:</span>${stepperHtml('mq-total', p.total, 0, 300)}<button class="botao claro" data-acao="mqTotal">Usar como meta diária</button></div>
      <label class="linha" style="gap:8px;cursor:pointer"><input type="checkbox" data-acao="mqComp" ${p.compensar ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--rosa)"> Compensar parte do que faltar de um dia no dia seguinte (até +25%)</label>
      ${p.resposta ? `<p class="fraco" style="margin:0;font-size:14px">${esc(p.resposta)}</p>` : ''}
      <details><summary class="link">Peso de cada matéria (como o total do dia é repartido)</summary>
        <div class="tab-metas" style="grid-template-columns:1fr 110px;margin-top:8px">${Object.keys(MIN_Q).map(m => `<span>${esc(m)}</span><input type="number" min="0" max="10" step="0.5" data-pesoq="${esc(m)}" value="${pesoQ(m)}">`).join('')}</div>
        <p class="fraco" style="margin:6px 0 0;font-size:13px">Peso maior = mais questões dessa matéria no dia. Por padrão Matemática, Física e Química têm peso 1 e as demais, 2.</p></details></div></section>`;
}

// no Hoje: resumo curto
function metaQHtml() {
  const meta = metaTotal(), feito = feitasDia(hoje()), metas = metasPorMateria();
  if (!meta && !feito) return '';
  return `<section class="cartao"><div class="pq-topo">${anelQ(feito, meta, 84)}<div class="coluna" style="gap:4px"><h2 style="font-size:19px">Questões de hoje</h2><span class="fraco" style="font-size:14px">${feito >= meta ? 'Meta batida!' : `Faltam ${meta - feito}`}</span>
    <button class="link" data-acao="ir" data-v="questoes" style="padding:0;align-self:flex-start">Fazer ou registrar questões</button></div></div>
    ${Object.entries(metas).map(([m, n]) => `<div class="meta-linha" style="${cor(m)}"><span><i class="ponto"></i>${esc(m)}</span><span class="fraco">${feitasHoje(m)}/${n}</span><div class="barra"><i style="width:${Math.min(100, Math.round(feitasHoje(m) / Math.max(1, n) * 100))}%;background:var(--c)"></i></div></div>`).join('')}</section>`;
}
function metaQTabela() { return ''; }
function ajustesQuestoesHtml() {
  return `<section class="cartao"><h2>Tempo por questão</h2>
    <p class="fraco" style="margin:0">Quanto tempo você leva por questão em cada matéria. Entra no cálculo do tempo dos assuntos. Em branco, uso o valor automático, que aprende com as suas listas. As metas ficam na aba Questões.</p>
    <div class="tab-metas" style="grid-template-columns:1fr 130px"><span class="rotulo">matéria</span><span class="rotulo">min por questão</span>
    ${Object.keys(MIN_Q).map(m => `<span>${esc(m)}</span><input type="number" step="0.5" min="0.5" max="15" data-minq="${esc(m)}" value="${S.minQ[m] || ''}" placeholder="${(Math.round(minPorQ(m) * 10) / 10)}">`).join('')}</div></section>`;
}

function registrarFora(m, f, ac, min) {
  const d = ((S.qlog[hoje()] ||= {})[m] ||= { f: 0, a: 0, s: 0, t: 0 });
  d.f += f; if (ac == null) d.s = (d.s || 0) + f; else d.a += ac;
  if (min > 0) { d.t = (d.t || 0) + min * 60; aprenderTempo(m, min * 60, f); }
}

{ const qm0 = qMontar; qMontar = function () { return painelQuestoes() + qm0(); }; }
Object.assign(ACOES, {
  mqPer: el => { ui.mqPer = el.dataset.v; render(); },
  mqComp: el => { planoQ().compensar = el.checked; salvar(); render(); },
  mqTotal: () => { const n = Math.round(+document.getElementById('mq-total')?.value); if (n >= 0) { const p = planoQ(); p.total = n; p.dias = {}; p.resposta = ''; salvar(); ui.iaMsg = `Meta diária: ${n} questões.`; render(); } },
  mqPlanejar: async () => {
    const t = ($('#mq-texto')?.value || ui.mqTexto || '').trim(); if (!t) { ui.iaMsg = 'Escreva como você quer fazer as questões.'; render(); return; }
    ui.mqTexto = t; ui.carregando = 'Ajustando as metas…'; render();
    try {
      const w = semAtual(), mats = [...new Set(S.assuntos.filter(a => a.semana === w && !a.feito && MIN_Q[a.materia]).map(a => a.materia))];
      const r = await chamarIa(`Ajuste a meta diária de questões de uma estudante de vestibular a partir do que ela escreveu: "${t}".
Hoje é ${SEMANA[deIso(hoje()).getDay()]} (${hoje()}). Meta atual: ${planoQ().total} por dia. Matérias da semana dela: ${mats.join(', ') || 'não definidas'}. Pesos atuais (maior = mais questões): ${JSON.stringify(Object.fromEntries(Object.keys(MIN_Q).map(m => [m, pesoQ(m)])))}.
Responda SÓ com JSON: {"total":60,"dias":{"dom":0,"seg":60,"ter":60,"qua":60,"qui":60,"sex":60,"sáb":60},"pesos":{"Matemática":2},"resposta":"1 frase objetiva dizendo o que ficou (sem conselhos extras, sem diminutivos)"}
"total" = meta diária padrão; "dias" = meta de cada dia da semana (0 = descanso), só os que diferem do total; "pesos" só as matérias que ela pediu para dar mais ou menos ênfase (de 0.5 a 5; padrão Matemática/Física/Química 1 e as demais 2).`, 1500, [], 'texto');
      const p = planoQ(), tot = Math.round(+r.total);
      if (tot >= 0 && tot <= 400) p.total = tot;
      p.dias = {}; for (const [k, v] of Object.entries(r.dias || {})) { const i = DIAS_NOME.indexOf(String(k).toLowerCase().slice(0, 3)); if (i >= 0 && +v >= 0 && +v !== p.total) p.dias[i] = Math.round(+v); }
      for (const [m, v] of Object.entries(r.pesos || {})) if (MIN_Q[m] && +v >= 0 && +v <= 10) p.pesos[m] = +v;
      p.texto = t; p.resposta = String(r.resposta || ''); ui.mqTexto = ''; salvar();
    } catch (e) { ui.iaMsg = `Não consegui ajustar agora (${e.message}).`; }
    ui.carregando = ''; render();
  },
  qMais: el => { registrarFora(el.dataset.m, +el.dataset.v, null, 0); salvar(); ui.iaMsg = `+${el.dataset.v} em ${el.dataset.m}.`; render(); },
  qForaRapido: () => {
    const mats = materiasDoDia(), todas = Object.keys(MIN_Q);
    abrirModal(`<div class="entre"><h2>Questões feitas fora do app</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
      <p class="fraco" style="margin:0">Livro, apostila, Ferretto, simulado… Só o número já conta para a meta. Acertos e tempo são opcionais, mas melhoram o acerto mostrado e o tempo que o app calcula.</p>
      <label class="campo">Matéria<select id="f-mat">${[...mats, ...todas.filter(m => !mats.includes(m))].map(m => `<option>${m}</option>`).join('')}</select></label>
      <div class="linha"><label class="campo" style="flex:1 1 110px">Feitas<input type="number" id="f-feitas" min="1" max="500" inputmode="numeric"></label>
        <label class="campo" style="flex:1 1 110px">Acertos (opcional)<input type="number" id="f-acertos" min="0" max="500" inputmode="numeric"></label>
        <label class="campo" style="flex:1 1 130px">Tempo, min (opcional)<input type="number" id="f-min" min="1" max="600" inputmode="numeric"></label></div>
      <div class="linha"><button class="botao" data-acao="qForaSalvar">Registrar</button></div>`);
  },
  qForaSalvar: () => {
    const m = $('#f-mat').value, f = Math.round(+$('#f-feitas').value), acTxt = $('#f-acertos').value, ac = acTxt === '' ? null : Math.round(+acTxt), min = +$('#f-min').value || 0;
    if (!(f > 0) || (ac != null && (ac < 0 || ac > f))) { ui.iaMsg = 'Confira os números: os acertos não podem passar das questões feitas.'; fecharModal(); render(); return; }
    registrarFora(m, f, ac, min); salvar(); fecharModal();
    ui.iaMsg = `Anotado: ${f} questões de ${m}${ac != null ? `, ${ac} certas (${Math.round(ac / f * 100)}%)` : ''}.`; render();
  },
});
document.addEventListener('change', e => { const el = e.target; if (el.dataset?.pesoq) { const v = +el.value; if (v >= 0) planoQ().pesos[el.dataset.pesoq] = v; salvar(); render(); } });
render();
