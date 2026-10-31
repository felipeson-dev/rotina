'use strict';
/* Extras do plano: questões (com revisão automática dos erros), dia que se reabastece, calibração dos tempos pela IA e o mapa "Caminho". */

S.qlog ||= {};

// ---------- questões ----------
function modalQuestoes(a) {
  const { q } = tempoDe(a), prev = a.questoes;
  abrirModal(`<div class="entre"><div>${tag(a.materia)}</div><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
    <h2>Questões: ${esc(a.titulo)}</h2>
    <span class="fraco">O app guarda quantas você fez e acertou. Se o acerto ficar abaixo de 70%, eu agendo uma revisão dos erros na semana que vem.</span>
    <div class="linha"><label class="campo" style="flex:1">Quantas fez<input type="number" id="q-feitas" min="0" max="300" value="${prev ? prev.feitas : q}"></label>
      <label class="campo" style="flex:1">Quantas acertou<input type="number" id="q-acertos" min="0" max="300" value="${prev ? prev.acertos : ''}"></label></div>
    <div class="linha"><button class="botao" data-acao="salvarQuestoes" data-id="${a.id}">Salvar</button></div>`);
}

/** Registra questões feitas/acertadas de um assunto (e do dia). Abaixo de 70%: agenda a revisão dos erros. Devolve a mensagem. */
function registrarQ(a, f, ac) {
  const m = a.materia, ant = a.questoes;
  if (ant && S.qlog[a.qdia]?.[m]) { const v = S.qlog[a.qdia][m]; v.f = Math.max(0, v.f - ant.feitas); v.a = Math.max(0, v.a - ant.acertos); }
  a.questoes = { feitas: f, acertos: ac }; a.qdia = hoje();
  const v = ((S.qlog[hoje()] ||= {})[m] ||= { f: 0, a: 0 }); v.f += f; v.a += ac;
  let msg = `Anotado: ${ac} de ${f}.`;
  if (f >= 10 && ac / f < 0.7 && !a.revisao) {
    a.revisao = true;
    S.assuntos.push({ id: uid(), mes: mesDe(somaDias(semAtual(), 7)), materia: m, titulo: `Refazer os erros: ${a.titulo}`, semana: somaDias(semAtual(), 7), ord: 0.5, min: 45, feito: false });
    msg += ' Foi abaixo de 70%, então agendei uma revisão dos erros para a semana que vem.';
  } else if (f >= 10 && ac / f >= 0.9) msg += ' Excelente!';
  return msg;
}

function questoesSemana(w) {
  const tot = {};
  for (let i = 0; i < 7; i++) for (const [m, v] of Object.entries(S.qlog[somaDias(w, i)] || {})) { const t = tot[m] ||= { f: 0, a: 0 }; t.f += v.f; t.a += v.a; }
  const ms = Object.entries(tot).filter(([, v]) => v.f);
  if (!ms.length) return '';
  const f = soma(ms, ([, v]) => v.f), a = soma(ms, ([, v]) => v.a);
  return `<div class="coluna" style="gap:8px"><span class="rotulo">questões da semana · ${f} feitas · ${Math.round(a / f * 100)}% de acerto</span>
    <div class="linha">${ms.map(([m, v]) => `<span class="tag" style="${cor(m)}">${esc(m)} ${v.f} · ${Math.round(v.a / v.f * 100)}%</span>`).join('')}</div></div>`;
}

// ---------- dia: o adiantamento agora fica na prévia opcional de Hoje (previaAdiantarHtml), sem empurrar tarefas obrigatórias ----------
function reabastecer() { return 0; }

// ---------- tempos calibrados pela IA ----------
async function calibrarTempos(todos = false) {
  if (!temChaveIa() || ui.calibrando) return 0;
  const limite = todos ? '9999-12-31' : somaDias(semAtual(), 28);
  const alvo = S.assuntos.filter(a => !a.feito && ehConteudo(a) && !a.calibrado && semDe(a) <= limite);
  if (!alvo.length) return 0;
  ui.calibrando = true; let n = 0;
  const tabela = Object.entries(MIN_Q).map(([m, v]) => `${m} ${v} min`).join(', ');
  try {
    for (let i = 0; i < alvo.length; i += 40) {
      const lote = alvo.slice(i, i + 40).map(a => ({ id: a.id, materia: a.materia, titulo: a.titulo }));
      const r = await chamarIa(`Estime o esforço de cada assunto para uma estudante de Medicina (Fuvest, Vunesp, ENEM) aprender bem:
- "teoria": minutos de aula ou resumo (15 a 180). Assuntos densos ou cheios de conceitos novos pedem mais; assuntos simples ou de revisão, menos.
- "q": quantas questões ela deve fazer para fixar (0 a 60). Assuntos de cálculo e prática (Matemática, Física, Química) pedem mais; conceituais, menos.
- "dens": densidade de 1 (leve) a 5 (muito denso).
O app calcula o tempo das questões sozinho, por matéria (minutos por questão: ${tabela}). Responda SÓ com JSON: {"assuntos":[{"id":"...","teoria":60,"q":20,"dens":3}]}
Assuntos: ${JSON.stringify(lote)}`, 6000);
      for (const x of r.assuntos || []) {
        const a = achar(x.id); if (!a) continue;
        const t = +x.teoria, q = +x.q, d = +x.dens;
        if (t >= 15 && t <= 240) a.teoria = Math.round(t / 5) * 5;
        if (q >= 0 && q <= 80) a.q = Math.round(q);
        if (d >= 1 && d <= 5) a.dens = Math.round(d);
        a.calibrado = true; n++;
      }
      salvar(); if (todos || telaQuieta()) render();
    }
  } catch (e) { ui.calibroErro = e.message; }
  ui.calibrando = false;
  return n;
}

// ---------- caminho: a jornada semana a semana ----------
function semanasDoPlano() {
  const w0 = semAtual(), todas = S.assuntos.map(semDe);
  const ini = todas.reduce((m, x) => x < m ? x : m, w0);
  let fim = ultimaProva() ? segunda(ultimaProva().data) : w0;
  for (const s of todas) if (s > fim) fim = s;
  const ws = []; for (let w = ini; w <= fim && ws.length < 120; w = somaDias(w, 7)) ws.push(w);
  return ws;
}
function statusSemana(w) {
  const l = S.assuntos.filter(a => a.semana === w), f = l.filter(a => a.feito).length;
  return { l, f, st: !l.length ? 'vazia' : f === l.length ? 'ok' : f ? 'meio' : w < semAtual() ? 'atras' : 'falta' };
}
function infoSemana(w) {
  const { l, f, st } = statusSemana(w), fim = somaDias(w, 6);
  const min = soma(l, minDe), fz = soma(l.filter(a => a.feito), minDe);
  const frase = { ok: w > semAtual() ? 'Adiantada! Já está tudo pronto.' : 'Semana completa.', meio: 'Em andamento.', atras: 'Ficou atrasada: esses assuntos entram primeiro no seu dia.', falta: w === semAtual() ? 'Esta é a sua semana.' : 'Ainda vai chegar.', vazia: 'Sem assuntos previstos.' }[st];
  const provas = (S.provas || []).filter(p => okData(p.data) && p.data >= w && p.data <= fim);
  const item = a => `<span class="item-mini ${a.feito ? 'feito' : ''}" style="${cor(a.materia)}"><i class="ponto"></i>${esc(a.titulo)}</span>`;
  const pend = l.filter(a => !a.feito), fei = l.filter(a => a.feito);
  return `<span class="rotulo">semana de ${deIso(w).getDate()}/${pad(deIso(w).getMonth() + 1)} a ${deIso(fim).getDate()}/${pad(deIso(fim).getMonth() + 1)}${w === semAtual() ? ' · agora' : ''}</span>
    <h3>${f} de ${l.length} assuntos · ${fmtMin(fz)} de ${fmtMin(min)}</h3><p class="fraco" style="margin:0">${frase}</p>
    ${provas.map(p => `<span class="bandeira">${esc(p.nome)}${p.estimada ? ' (estimada)' : ''}</span>`).join('')}
    ${fei.length ? `<span class="rotulo" style="color:var(--tinta)">feito</span><div class="mini-lista">${fei.map(item).join('')}</div>` : ''}
    ${pend.length ? `<span class="rotulo">falta</span><div class="mini-lista">${pend.map(item).join('')}</div>` : ''}`;
}
function anoCaminho() {
  const ws = semanasDoPlano(), PL = 8, W = 1000, mx = 70, dx = (W - 2 * mx) / (PL - 1), dy = 150, topo = 96;
  const pos = ws.map((w, i) => { const r = Math.floor(i / PL), c = i % PL; return { w, r, x: r % 2 ? W - mx - c * dx : mx + c * dx, y: topo + r * dy + Math.sin(c * 1.1 + r * 2) * 16 }; });
  const H = topo + (Math.ceil(ws.length / PL) - 1) * dy + 80, sts = ws.map(statusSemana);
  const caminho = pos.slice(1).map((q, i) => { const p = pos[i], lado = p.r % 2 ? -1 : 1;
    return p.r === q.r ? `M${p.x} ${p.y} C${(p.x + q.x) / 2} ${p.y},${(p.x + q.x) / 2} ${q.y},${q.x} ${q.y}` : `M${p.x} ${p.y} C${p.x + lado * 95} ${p.y},${q.x + lado * 95} ${q.y},${q.x} ${q.y}`; });
  // estrada: faixa larga com tracejado no meio; o rosa enche por cima conforme os minutos feitos
  const estrada = caminho.map(d => `<path class="estrada" d="${d}"/>`).join('') + caminho.map(d => `<path class="estrada-meio" d="${d}"/>`).join('');
  const preenchida = caminho.map((d, i) => { const l = sts[i].l, tot = soma(l, minDe), fz = soma(l.filter(a => a.feito), minDe), frac = tot ? fz / tot : 0;
    return `${sts[i].st === 'atras' ? `<path class="estrada-atras" d="${d}"/>` : ''}${frac > 0 ? `<path class="trilha rosa" pathLength="1" stroke-dasharray="${Math.min(1, frac).toFixed(3)} 1" d="${d}"/>` : ''}`; }).join('');
  const nomes = pos.map((p, i) => {
    const m = mesDe(somaDias(p.w, 3)); if (i && mesDe(somaDias(pos[i - 1].w, 3)) === m) return '';
    const sm = pos.filter((q, j) => mesDe(somaDias(q.w, 3)) === m).map(q => statusSemana(q.w));
    const completo = sm.length && sm.every(x => x.st === 'ok');
    return `<text class="mes-txt" x="${p.x}" y="${p.y + 40}" text-anchor="middle">${nomeMes(m).slice(0, 3)} ${m.slice(2, 4)}${completo ? ' ✦' : ''}</text>`; }).join('');
  const fases = S.fases || [];
  const faseDe = w => fases.find(f => f.inicio <= mesDe(somaDias(w, 3)) && mesDe(somaDias(w, 3)) <= f.fim);
  const faixas = pos.map((p, i) => { const f = faseDe(p.w); if (!f || (i && faseDe(pos[i - 1].w) === f)) return '';
    return `<g class="fase-tag"><rect x="${p.x - 8}" y="${p.y - 70}" width="${Math.max(70, f.nome.length * 7.4 + 22)}" height="22" rx="11"/><text x="${p.x + 3}" y="${p.y - 55}">${esc(f.nome)}</text></g>`; }).join('');
  const provasPorSem = {};
  for (const p of S.provas || []) if (okData(p.data)) (provasPorSem[segunda(p.data)] ||= []).push(p);
  const C = 2 * Math.PI * 19;
  const nos = pos.map((p, i) => {
    const s = sts[i], tot = soma(s.l, minDe), fz = soma(s.l.filter(a => a.feito), minDe), frac = tot ? fz / tot : 0;
    const mats = [...new Set(s.l.map(a => a.materia))].join('|'), agora = p.w === semAtual(), pr = provasPorSem[p.w], sel = p.w === ui.caminhoSem;
    return `<g class="no-sem ${s.st} ${agora ? 'agora' : ''} ${sel ? 'sel' : ''}" data-w="${p.w}" data-mats="${esc(mats)}" tabindex="0" role="button" aria-label="Semana de ${semanaCurta(p.w)}: ${s.f} de ${s.l.length} assuntos">
      ${agora ? `<circle class="pulso" cx="${p.x}" cy="${p.y}" r="22"/>` : ''}
      <circle class="anel-fundo" cx="${p.x}" cy="${p.y}" r="19"/><circle class="anel-prog" cx="${p.x}" cy="${p.y}" r="19" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${p.x} ${p.y})"/>
      <circle class="bolinha" cx="${p.x}" cy="${p.y}" r="13"/>
      ${s.st === 'ok' ? `<path class="certo" d="M${p.x - 5} ${p.y} l4 4 l7 -8"/>` : s.l.length ? `<text class="qtd" x="${p.x}" y="${p.y + 4.5}" text-anchor="middle">${s.l.length - s.f}</text>` : ''}
      ${agora ? `<g class="avatar"><text x="${p.x}" y="${p.y - 30}" text-anchor="middle">♥</text></g>` : ''}
      ${pr ? `<g class="bandeira-svg"><line x1="${p.x}" y1="${p.y - 22}" x2="${p.x}" y2="${p.y - 62}"/><path d="M${p.x} ${p.y - 62} h${Math.min(124, 10 + pr[0].nome.length * 6.8)} l-8 9 l8 9 h-${Math.min(124, 10 + pr[0].nome.length * 6.8)}z"/><text x="${p.x + 6}" y="${p.y - 48}">${esc(pr[0].nome.slice(0, 17))}</text></g>` : ''}</g>`; }).join('');
  const total = S.assuntos.length, fz = S.assuntos.filter(a => a.feito).length, pct = total ? Math.round(fz / total * 100) : 0;
  const mats = [...new Set(S.assuntos.map(a => a.materia))];
  const agora = ws.includes(ui.caminhoSem) ? ui.caminhoSem : semAtual();
  // quanto está à frente (ou atrás) do plano: assuntos feitos de semanas futuras x atrasados
  const adiant = S.assuntos.filter(a => a.feito && semDe(a) > semAtual()), atras = S.assuntos.filter(a => estadoDe(a) === 'atrasado');
  const pendMin = soma(S.assuntos.filter(a => !a.feito), minDe), semRest = Math.max(1, ws.filter(w => w >= semAtual()).length);
  const diasPlano = pendMin / semRest / 6;
  const diasFrente = diasPlano ? soma(adiant, minDe) / diasPlano : 0;
  const situ = adiant.length ? `<div class="selo adiante grande">Você está à frente do plano: ${adiant.length} ${adiant.length === 1 ? 'assunto' : 'assuntos'} de semanas futuras já feitos (≈ ${diasFrente < 1 ? 'menos de 1 dia' : Math.round(diasFrente) + (Math.round(diasFrente) === 1 ? ' dia' : ' dias')} de estudo ganhos).</div>`
    : atras.length ? `<div class="selo atraso grande">${atras.length} ${atras.length === 1 ? 'assunto atrasado' : 'assuntos atrasados'}: eles entram primeiro no seu dia.</div>` : '<div class="selo grande">No ritmo do plano.</div>';
  return `<section class="cartao"><div class="entre"><h2>Seu caminho até a prova</h2><span class="fraco">${fz} de ${total} assuntos · ${pct}%</span></div>
    <p class="fraco" style="margin:0">Cada bolinha é uma semana: o número é quantos assuntos faltam e o anel enche conforme você estuda. Passe o mouse (ou toque) para ver os detalhes. Adiantando semanas, a estrada enche mais rápido.</p>${situ}
    <div class="linha legenda-caminho"><span class="lg ok"></span>completa <span class="lg meio"></span>em andamento <span class="lg falta"></span>por vir <span class="lg atras"></span>atrasada</div>
    <div class="linha">${mats.map(m => `<span class="tag hl" style="${cor(m)}" data-hl="${esc(m)}">${esc(m)}</span>`).join('')}</div>
    <div class="grade2 caminho-grade"><div class="caminho-svg"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Caminho do ano">${estrada}${preenchida}${nomes}${faixas}${nos}</svg></div>
      <aside class="cartao painel-sem" id="caminho-info">${infoSemana(agora)}</aside></div></section>`;
}

/** Mapa do mês: uma coluna por semana (anel, barras por área, minutos), filtro por matéria e detalhe da semana tocada. */
function mesMapa(m) {
  const ws = []; for (let w = segunda(m + '-01'); w <= somaDias(somaMes(m, 1) + '-01', -1) && ws.length < 6; w = somaDias(w, 7)) if (mesDe(somaDias(w, 3)) === m) ws.push(w);
  const sel = ws.includes(ui.mesSem) ? ui.mesSem : (ws.includes(semAtual()) ? semAtual() : ws[0]);
  const filtro = a => !ui.anoMat || a.materia === ui.anoMat;
  const ars = ['mat', 'nat', 'hum', 'lin'], maxN = 12;
  const C = 2 * Math.PI * 17, ring = pct => `<svg viewBox="0 0 44 44" width="56" height="56" aria-hidden="true"><circle cx="22" cy="22" r="17" fill="none" stroke="var(--linha)" stroke-width="5"/>
    <circle cx="22" cy="22" r="17" fill="none" stroke="var(--rosa)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 22 22)"/></svg>`;
  const cols = ws.map((w, i) => {
    const l = S.assuntos.filter(a => a.semana === w && filtro(a)), f = l.filter(a => a.feito).length, min = soma(l, minDe), fz = soma(l.filter(a => a.feito), minDe);
    return `<button class="col-mes ${w === semAtual() ? 'atual' : ''} ${w === sel ? 'sel' : ''}" data-acao="mesSem" data-v="${w}" style="--fc: var(--rosa)">
      <span class="faixa"></span><span class="fn">semana ${i + 1}</span><strong>${deIso(w).getDate()}/${pad(deIso(w).getMonth() + 1)}</strong><small>a ${deIso(somaDias(w, 6)).getDate()}/${pad(deIso(somaDias(w, 6)).getMonth() + 1)}</small>
      <div class="ringbox">${ring(min ? fz / min : 0)}<b>${min ? Math.round(fz / min * 100) : 0}%</b></div>
      <div class="mini">${ars.map(ar => { const x = l.filter(a => area(a.materia) === ar), fx = x.filter(a => a.feito).length;
        return `<i style="--c:var(--${ar});height:${Math.max(x.length ? 8 : 2, Math.min(100, x.length / maxN * 100))}%" title="${AREAS[ar]}: ${fx} de ${x.length}"><u style="height:${x.length ? Math.round(fx / x.length * 100) : 0}%"></u></i>`; }).join('')}</div>
      <span class="n">${f} de ${l.length} · ${fmtMin(min)}</span></button>`;
  }).join('');
  const mats = [...new Set(S.assuntos.map(a => a.materia))];
  const porMat = mats.map(mt => {
    const ano = S.assuntos.filter(a => a.materia === mt), fa = ano.filter(a => a.feito).length;
    const mes = ano.filter(a => a.mes === m), fm = mes.filter(a => a.feito).length, pc = (f, n) => n ? Math.round(f / n * 100) : 0;
    return `<button class="mat-linha ${ui.anoMat === mt ? 'sel' : ''}" style="${cor(mt)}" data-acao="anoMat" data-v="${esc(mt)}">
      <span><i class="ponto"></i>${esc(mt)}</span><small><b>${nomeMes(m).slice(0, 3)}:</b> ${fm}/${mes.length} · <b>ano:</b> ${fa}/${ano.length}</small>
      <div class="barras2"><div class="barra"><i style="width:${pc(fm, mes.length)}%;background:var(--c)"></i></div><div class="barra fina"><i style="width:${pc(fa, ano.length)}%;background:var(--c);opacity:.45"></i></div></div></button>`; }).join('');
  const det = S.assuntos.filter(a => a.semana === sel && filtro(a)), porMateria = [...new Set(det.map(a => a.materia))];
  return `<section class="cartao"><div class="entre"><h2>Mapa de ${nomeMes(m)}</h2><span class="fraco" style="font-size:14px">Toque numa semana para ver os assuntos. Toque numa matéria para filtrar.</span></div>
    <div class="mapa-rolagem"><div class="mapa">${cols}</div></div></section>
    <div class="grade2"><section class="cartao"><div class="entre"><h2>Semana de ${deIso(sel).getDate()}/${pad(deIso(sel).getMonth() + 1)}${ui.anoMat ? ` · ${esc(ui.anoMat)}` : ''}</h2>
        <button class="botao claro" data-acao="irSemana" data-v="${sel}">Abrir a semana</button></div>
      ${porMateria.length ? porMateria.map(mt => `<div class="coluna" style="gap:6px"><span class="rotulo" style="${cor(mt)}"><i class="ponto"></i> ${esc(mt)}</span>
        <div class="itens">${det.filter(a => a.materia === mt).map(a => `<button class="item ${a.feito ? 'feito' : ''}" style="${cor(a.materia)}" data-acao="assunto" data-id="${a.id}"><i class="ponto"></i><span>${esc(a.titulo)}</span></button>`).join('')}</div></div>`).join('') : '<p class="fraco" style="margin:0">Nada nesta semana.</p>'}</section>
      <section class="cartao"><div class="entre"><h2>Por matéria</h2>${ui.anoMat ? '<button class="link" data-acao="anoMat" data-v="">Limpar filtro</button>' : ''}</div>${porMat}</section></div>`;
}

document.addEventListener('pointerover', e => {
  const no = e.target.closest?.('.no-sem'), hl = e.target.closest?.('[data-hl]');
  if (no) { ui.caminhoSem = no.dataset.w; const el = $('#caminho-info'); if (el) el.innerHTML = infoSemana(no.dataset.w); }
  const svg = $('.caminho-svg');
  if (svg) svg.querySelectorAll('.no-sem').forEach(n => n.classList.toggle('apagado', !!hl && !(n.dataset.mats || '').split('|').includes(hl.dataset.hl)));
});
document.addEventListener('focusin', e => { const no = e.target.closest?.('.no-sem'); if (no) { ui.caminhoSem = no.dataset.w; const el = $('#caminho-info'); if (el) el.innerHTML = infoSemana(no.dataset.w); } });
document.addEventListener('click', e => { const no = e.target.closest?.('.no-sem'); if (no) { ui.caminhoSem = no.dataset.w; const el = $('#caminho-info'); if (el) el.innerHTML = infoSemana(no.dataset.w); } });

Object.assign(ACOES, {
  questoes: el => { const a = achar(el.dataset.id); if (a) modalQuestoes(a); },
  salvarQuestoes: el => {
    const a = achar(el.dataset.id), f = Math.round(+$('#q-feitas').value), ac = Math.round(+$('#q-acertos').value);
    if (!a || !(f >= 0) || !(ac >= 0) || ac > f) { ui.iaMsg = 'Confira os números: os acertos não podem passar das questões feitas.'; fecharModal(); render(); return; }
    const msg = registrarQ(a, f, ac);
    if (f > 0) {
      for (const b of diaHoje().blocos || []) if (b.assuntoId === a.id) {
        const p = (b.passos || []).find(x => !x.ok && /quest/i.test(x.t));
        if (p) { p.ok = true; S.feitos[hoje()] = (S.feitos[hoje()] || 0) + 1; if (b.passos.every(x => x.ok)) setFeito(a, true, false); }
      }
    }
    salvar(); fecharModal(); ui.iaMsg = msg; ui.desfazer = null; render();
  },
  mesModo: el => { ui.mesModo = el.dataset.v; render(); },
  mesSem: el => { ui.mesSem = el.dataset.v; render(); },
  irSemana: el => { ui.semana = Math.round((deIso(el.dataset.v) - deIso(semAtual())) / 604800000); ui.view = 'semana'; window.scrollTo(0, 0); render(); },
  calibrarTodos: async () => {
    ui.iaMsg = 'Calibrando os tempos com a IA…'; render();
    const n = await calibrarTempos(true);
    ui.iaMsg = n ? `Pronto: calibrei o tempo de ${n} assuntos.` : ui.calibroErro ? `Não deu agora (${ui.calibroErro}).` : 'Todos os assuntos já estão calibrados.'; render();
  },
});

// calibra em silêncio os assuntos das próximas 4 semanas
/** Calibração em segundo plano só redesenha nas telas do plano e se ela não estiver digitando ou com uma caixa de seleção aberta. */
function telaQuieta() { return !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '') && ['hoje', 'semana', 'mes', 'ano'].includes(ui.view); }
setTimeout(async () => { const n = await calibrarTempos(false); if (n) { ui.iaMsg = `Calibrei o tempo de ${n} assuntos das próximas semanas com a IA (densidade e questões).`; ui.desfazer = null; if (telaQuieta()) render(); } }, 2500);
render();
