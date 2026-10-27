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

function questoesSemana(w) {
  const tot = {};
  for (let i = 0; i < 7; i++) for (const [m, v] of Object.entries(S.qlog[somaDias(w, i)] || {})) { const t = tot[m] ||= { f: 0, a: 0 }; t.f += v.f; t.a += v.a; }
  const ms = Object.entries(tot).filter(([, v]) => v.f);
  if (!ms.length) return '';
  const f = soma(ms, ([, v]) => v.f), a = soma(ms, ([, v]) => v.a);
  return `<div class="coluna" style="gap:8px"><span class="rotulo">questões da semana · ${f} feitas · ${Math.round(a / f * 100)}% de acerto</span>
    <div class="linha">${ms.map(([m, v]) => `<span class="tag" style="${cor(m)}">${esc(m)} ${v.f} · ${Math.round(v.a / v.f * 100)}%</span>`).join('')}</div></div>`;
}

// ---------- dia que se reabastece ----------
/** Se ela está terminando mais rápido que o previsto, puxa o próximo assunto (adiantando) para não sobrar tempo. */
function reabastecer() {
  const d = S.dias[hoje()];
  if (!d || !d.cap || !d.t0) return 0;
  const gasto = (Date.now() - d.t0) / 60000, resta = d.cap - gasto;
  let pend = soma(d.blocos.filter(b => !achar(b.assuntoId)?.feito && !b.passos.every(p => p.ok)), b => b.min || 0), n = 0;
  for (const a of filaPlano()) {
    if (pend >= resta - 20) break;
    if (d.blocos.some(b => b.assuntoId === a.id)) continue;
    if (pend + minDe(a) > resta + 30) continue;
    d.blocos.push(blocoDe(a)); pend += minDe(a); n++;
  }
  return n;
}
{
  const marca = () => { const d = diaHoje(); if (!d.t0) d.t0 = Date.now() - 25 * 60000; };
  const depois = () => { const n = reabastecer(); if (n) { ui.iaMsg = `Você está rendendo! Puxei ${n} ${n === 1 ? 'assunto' : 'assuntos'} da fila para o seu dia.`; ui.desfazer = null; salvar(); render(); } };
  const p0 = ACOES.passo, t0 = ACOES.timerFeito;
  ACOES.passo = el => { marca(); p0(el); depois(); };
  ACOES.timerFeito = el => { marca(); t0(el); depois(); };
}

// ---------- tempos calibrados pela IA ----------
async function calibrarTempos(todos = false) {
  if (!temChave() || ui.calibrando) return 0;
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
      salvar(); render();
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
  const ws = semanasDoPlano(), PL = 8, W = 1000, mx = 70, dx = (W - 2 * mx) / (PL - 1), dy = 128, topo = 80;
  const pos = ws.map((w, i) => { const r = Math.floor(i / PL), c = i % PL; return { w, r, x: r % 2 ? W - mx - c * dx : mx + c * dx, y: topo + r * dy + Math.sin(c * 1.1 + r * 2) * 16 }; });
  const H = topo + (Math.ceil(ws.length / PL) - 1) * dy + 70, sts = ws.map(statusSemana);
  const seg = pos.slice(1).map((q, i) => { const p = pos[i], lado = p.r % 2 ? -1 : 1;
    const d = p.r === q.r ? `M${p.x} ${p.y} C${(p.x + q.x) / 2} ${p.y},${(p.x + q.x) / 2} ${q.y},${q.x} ${q.y}` : `M${p.x} ${p.y} C${p.x + lado * 90} ${p.y},${q.x + lado * 90} ${q.y},${q.x} ${q.y}`;
    return `<path class="trilha ${sts[i].st}" d="${d}"/>`; }).join('');
  const nomes = pos.map((p, i) => {
    const m = mesDe(somaDias(p.w, 3)); if (i && mesDe(somaDias(pos[i - 1].w, 3)) === m) return '';
    return `<text class="mes-txt" x="${p.x}" y="${p.y + 34}" text-anchor="middle">${nomeMes(m).slice(0, 3)} ${m.slice(2, 4)}</text>`; }).join('');
  const provasPorSem = {};
  for (const p of S.provas || []) if (okData(p.data)) (provasPorSem[segunda(p.data)] ||= []).push(p);
  const nos = pos.map((p, i) => {
    const s = sts[i], mats = [...new Set(s.l.map(a => a.materia))].join('|'), agora = p.w === semAtual(), pr = provasPorSem[p.w];
    return `<g class="no-sem ${s.st} ${agora ? 'agora' : ''}" data-w="${p.w}" data-mats="${esc(mats)}" tabindex="0" role="button" aria-label="Semana de ${semanaCurta(p.w)}: ${s.f} de ${s.l.length} assuntos">
      ${agora ? `<circle class="pulso" cx="${p.x}" cy="${p.y}" r="20"/>` : ''}<circle class="bolinha" cx="${p.x}" cy="${p.y}" r="${pr ? 15 : 12}"/>
      ${s.st === 'ok' ? `<path class="certo" d="M${p.x - 5} ${p.y} l4 4 l7 -8"/>` : s.st === 'meio' ? `<path class="meio-txt" d="M${p.x} ${p.y - 12} a12 12 0 0 0 0 24z"/>` : ''}
      ${pr ? `<g class="bandeira-svg"><line x1="${p.x}" y1="${p.y - 15}" x2="${p.x}" y2="${p.y - 46}"/><path d="M${p.x} ${p.y - 46} h${Math.min(120, 8 + pr[0].nome.length * 6.6)} l-8 8 l8 8 h-${Math.min(120, 8 + pr[0].nome.length * 6.6)}z"/><text x="${p.x + 6}" y="${p.y - 33}">${esc(pr[0].nome.slice(0, 16))}</text></g>` : ''}
      ${agora ? `<text class="aqui" x="${p.x}" y="${p.y - 26}" text-anchor="middle">você está aqui</text>` : ''}</g>`; }).join('');
  const total = S.assuntos.length, fz = S.assuntos.filter(a => a.feito).length, pct = total ? Math.round(fz / total * 100) : 0;
  const mats = [...new Set(S.assuntos.map(a => a.materia))];
  const agora = ws.includes(ui.caminhoSem) ? ui.caminhoSem : semAtual();
  return `<section class="cartao"><div class="entre"><h2>Seu caminho até a prova</h2><span class="fraco">${fz} de ${total} assuntos · ${pct}%</span></div>
    <p class="fraco" style="margin:0">Cada bolinha é uma semana. Passe o mouse (ou toque) para ver o que foi feito e o que falta. O caminho se pinta conforme você conclui.</p>
    <div class="linha legenda-caminho"><span class="lg ok"></span>completa <span class="lg meio"></span>em andamento <span class="lg falta"></span>por vir <span class="lg atras"></span>atrasada</div>
    <div class="linha">${mats.map(m => `<span class="tag hl" style="${cor(m)}" data-hl="${esc(m)}">${esc(m)}</span>`).join('')}</div>
    <div class="grade2 caminho-grade"><div class="caminho-svg"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Caminho do ano">${seg}${nomes}${nos}</svg></div>
      <aside class="cartao painel-sem" id="caminho-info">${infoSemana(agora)}</aside></div></section>`;
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
    const m = a.materia, ant = a.questoes;
    if (ant && S.qlog[a.qdia]?.[m]) { const v = S.qlog[a.qdia][m]; v.f = Math.max(0, v.f - ant.feitas); v.a = Math.max(0, v.a - ant.acertos); }
    a.questoes = { feitas: f, acertos: ac }; a.qdia = hoje();
    const v = ((S.qlog[hoje()] ||= {})[m] ||= { f: 0, a: 0 }); v.f += f; v.a += ac;
    let msg = `Anotado: ${ac} de ${f}.`;
    if (f >= 10 && ac / f < 0.7 && !a.revisao) {
      a.revisao = true;
      S.assuntos.push({ id: uid(), mes: mesDe(somaDias(semAtual(), 7)), materia: m, titulo: `Refazer os erros: ${a.titulo}`, semana: somaDias(semAtual(), 7), ord: 0.5, min: 45, feito: false });
      msg += ` Foi abaixo de 70%, então agendei uma revisão dos erros para a semana que vem.`;
    } else if (f >= 10 && ac / f >= 0.9) msg += ' Excelente!';
    salvar(); fecharModal(); ui.iaMsg = msg; ui.desfazer = null; render();
  },
  calibrarTodos: async () => {
    ui.iaMsg = 'Calibrando os tempos com a IA…'; render();
    const n = await calibrarTempos(true);
    ui.iaMsg = n ? `Pronto: calibrei o tempo de ${n} assuntos.` : ui.calibroErro ? `Não deu agora (${ui.calibroErro}).` : 'Todos os assuntos já estão calibrados.'; render();
  },
});

// calibra em silêncio os assuntos das próximas 4 semanas
setTimeout(async () => { const n = await calibrarTempos(false); if (n) { ui.iaMsg = `Calibrei o tempo de ${n} assuntos das próximas semanas com a IA (densidade e questões).`; ui.desfazer = null; render(); } }, 2500);
render();
