'use strict';
/* Motor unificado de Revisão Inteligente (memória adaptativa estilo FSRS leve + orçamento anti-sufoco):
   - Uma ÚNICA fonte de verdade usada tanto nos blocos de Hoje quanto na aba Revisão (sem divergência de números).
   - Calcula a retenção estimada R(t) = exp(-0.223 * dias / estabilidade) por assunto, combinando acertos no banco
     (com filtro por subtópico para não misturar assuntos que compartilham a mesma tag!), questões feitas fora do app
     (S.foraQ + a.questoes), peso nas provas de Medicina SP (A/B/C + incidência) e marcação de "fraco".
   - Orçamento anti-sufoco: revisões NUNCA engolem os assuntos novos — garantem pelo menos 68% do tempo de estudo
     para conteúdo novo enquanto houver cronograma pendente, intercalam Exatas + Bio/Humanas e misturam até 40%
     de erros antigos (≥3 dias) com questões inéditas das bancas do cenário dela (Capital ou Campinas). */

const diasRev = () => S.perfil.diasRev || [3, 6];   // dias da revisão maior (0 = dom … 6 = sáb); padrão: quarta e sábado
const PESADAS_REV = ['Matemática', 'Física', 'Química'];
const REV_MIN_FIRME = 8;                            // mínimo de questões para a média ser considerada firme
const REV_JANELA_DIAS = 90;

const nomeCanonicoRev = a => String(a?.nome || a?.titulo || '').replace(/\s*·\s*sessão\s+\d+\/\d+\s*$/i, '').replace(/\s*\(parte \d+ de \d+\)\s*$/i, '').trim();
const nomeDe = a => a?.nome || a?.titulo || '';

/** Assunto do banco de questões que corresponde ao tópico (o cronograma usa tópicos mais finos que o banco). */
const tagDe = a => {
  if (!a) return '';
  let t = a.tag;
  if (!t) {
    const n = a.nome || a.titulo || '';
    if (/^interpreta[cç][aã]o de texto/i.test(n) && a.materia === 'Português') t = 'Interpretação de texto e tipologia';
    else if (/^ingl[eê]s:\s*um texto/i.test(n) || a.materia === 'Inglês') t = 'Interpretação de textos em inglês';
    else if (/^obra(\s+\(fuvest\)| da fuvest)/i.test(n)) t = 'Leituras obrigatórias da Fuvest';
    else t = a.titulo;
  }
  return window.limparNomeAssunto ? window.limparNomeAssunto(t) : t;
};

const ehHabitoQ = a => !!a && !ehConteudo(a) && (
  /^discursivas/i.test(nomeDe(a)) ||
  (/^interpreta[cç][aã]o de texto/i.test(nomeDe(a)) && a.materia === 'Português') ||
  /^ingl[eê]s:\s*um texto/i.test(nomeDe(a)) ||
  /^obra(\s+\(fuvest\)| da fuvest)/i.test(nomeDe(a))
);

/** Um assunto de conteúdo só conta como "estudado" (e entra em revisão) quando a ÚLTIMA parte e a ÚLTIMA sessão forem concluídas. */
const ehFinalDoAssunto = a => !!a && ehConteudo(a) && (!a.parte || a.parte[0] === a.parte[1]) && (!a.sessao || a.sessao.k === a.sessao.n);

function estudados() {
  const vistos = new Set(), out = [];
  for (const a of S.assuntos || []) {
    if (!a.feito || !ehFinalDoAssunto(a)) continue;
    const k = `${a.materia}|${nomeCanonicoRev(a)}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(a);
  }
  return out;
}

function subRegexDe(a) {
  const tag = tagDe(a), nome = nomeCanonicoRev(a), subs = window.SUBTOPICOS?.[tag];
  if (!subs || !nome || nome === tag) return null;
  const toks = normBusca(nome).split(/\s+/).filter(w => w.length >= 4 && !PARADAS.has(w));
  if (!toks.length) return null;
  let melhor = null, max = 0;
  for (const [sn, re] of subs) {
    const st = normBusca(sn);
    const pts = toks.filter(w => st.includes(w)).length;
    if (pts > max) { max = pts; melhor = re; }
  }
  return max > 0 ? melhor : null;
}

const regexBancaCenario = () => {
  const cen = (S.perfil && S.perfil.cenario) || 'capital';
  if (cen === 'campinas') return /unicamp|puc[- ]?campinas|enem|unesp|fuvest/i;
  return /fuvest|unifesp|santa casa|einstein|s[aã]o camilo|fmabc|unesp|famerp|famema|s[ií]rio|fmj|enem/i;
};

/** Mapa de quantos tópicos do cronograma compartilham cada (matéria|tag) — evita misturar acertos de tópicos diferentes. */
function tagsCompartilhadas() {
  const c = {};
  for (const a of S.assuntos || []) {
    if (!ehConteudo(a) || (a.parte && a.parte[0] !== a.parte[1]) || (a.sessao && a.sessao.k !== a.sessao.n)) continue;
    const k = `${a.materia}|${tagDe(a)}`;
    c[k] = (c[k] || 0) + 1;
  }
  return c;
}

/** Quantas questões oficiais desse assunto há no banco (o quanto ele cai nas provas). */
function cobranca(a) {
  if (!BANCO.pronto) return 0;
  const tag = tagDe(a);
  return BANCO.itens.filter(q => !window.questaoIgnorada?.(q) && q.m === a.materia && q.as === tag).length;
}

/** Coleta estatísticas precisas de questões de um assunto (banco filtrado por subtópico/aid + questões feitas fora). */
function statsAssunto(a, ctx = null) {
  const tag = tagDe(a), chave = `${a.materia}|${tag}`;
  const subRe = subRegexDe(a);
  const compartilhada = ctx ? (ctx.shared[chave] || 0) > 1 : false;
  const hj = hoje(), lim90 = somaDias(hj, -REV_JANELA_DIAS);

  let qBanco = [];
  if (BANCO.pronto) {
    const grupo = ctx ? (ctx.qhPorChave[chave] || []) : (() => {
      const l = [];
      for (const q of BANCO.itens) {
        if (q.m !== a.materia || q.as !== tag || !S.qh[q.id]) continue;
        const h = histDe(q.id)?.h; if (!h?.length) continue;
        const u = h[h.length - 1];
        l.push({ m: q, aid: S.qh[q.id].aid || '', dia: u[0] || '', ok: u[1] ? 1 : 0, dias: h.map(t => t[0] || '') });
      }
      return l;
    })();
    if (compartilhada && subRe) {
      const irmaos = (window.SUBTOPICOS?.[tag] || []).map(([, re]) => re).filter(re => re !== subRe);
      const pistas = (re, t) => (t.match(new RegExp(re.source, 'g')) || []).length;
      const filtradas = grupo.filter(x => {
        if (x.aid && x.aid === a.id) return true;
        if (x.aid && x.aid !== a.id) return false;
        const t = (x.m.x || '') + ' ' + (x.m.s || ''), n = pistas(subRe, t);
        return n > 0 && irmaos.every(re => pistas(re, t) <= n);
      });
      qBanco = filtradas;
    } else {
      qBanco = grupo.filter(x => !x.aid || x.aid === a.id || !compartilhada);
    }
  }

  // Questões feitas fora do app (S.foraQ tem datas precisas; se a.questoes tiver saldo antigo sem S.foraQ, inclui sem duplicar)
  const foraLista = (S.foraQ || []).filter(e => e.a === a.id);
  const ext = foraLista.flatMap(e => Array.from({ length: e.f }, (_, i) => ({
    dia: e.dia || a.qdia || a.feitoEm || hj,
    ok: Math.floor((i + 1) * e.ac / e.f) > Math.floor(i * e.ac / e.f) ? 1 : 0,
    dias: [e.dia || a.qdia || a.feitoEm || hj],
  })));
  const jaForaF = soma(foraLista, e => e.f || 0);
  const aComAc = a.questoes?.feitas ? Math.max(0, a.questoes.feitas - (a.questoes.semAc || 0)) : 0;
  if (aComAc > jaForaF) {
    const extraF = aComAc - jaForaF;
    const extraAc = Math.max(0, Math.min(extraF, (a.questoes.acertos || 0) - soma(foraLista, e => e.ac || 0)));
    const dExt = a.qdia || a.feitoEm || hj;
    for (let i = 0; i < extraF; i++) {
      ext.push({ dia: dExt, ok: Math.floor((i + 1) * extraAc / extraF) > Math.floor(i * extraAc / extraF) ? 1 : 0, dias: [dExt] });
    }
  }

  const L = [...qBanco, ...ext].sort((x, y) => x.dia < y.dia ? 1 : x.dia > y.dia ? -1 : 0);
  const base = L.slice(0, 12);
  const n = L.length;
  const n90 = L.filter(x => x.dias.some(d => d >= lim90)).length;
  const pct = n >= 3 ? Math.round(soma(base, x => x.ok) / base.length * 100) : null;
  const ultDiaQ = L[0]?.dia || '';
  return { n, n90, nFora: ext.length, pct, firme: n >= REV_MIN_FIRME, ultDiaQ };
}

/** Acerto dela nas questões desse assunto (compatível com chamadas existentes no app). */
function acertoDe(a) {
  return statsAssunto(a).pct;
}

function garantirEstadoRev(a) {
  const pesada = PESADAS_REV.includes(a.materia);
  const r = (a.rev ||= { n: 0, hist: [] });
  if (!(r.dif >= 1 && r.dif <= 5)) r.dif = pesada ? 3.4 : 2.6;
  if (!(r.estab >= 2)) {
    // migração suave de registros antigos [7, 30, 70]
    const baseN = [pesada ? 7 : 9, pesada ? 22 : 28, pesada ? 52 : 65][Math.min(r.n || 0, 2)];
    r.estab = baseN;
  }
  r.hist ||= [];
  return r;
}

function agendarRev(a, pct = null) {
  const r = garantirEstadoRev(a), hj = hoje();
  if (pct != null) r.hist = [...(r.hist || []), [hj, pct]].slice(-10);
  r.teoria = pct != null && pct < 55;
  const dias = Math.max(3, Math.min(120, Math.round(r.estab)));
  r.prox = somaDias(hj, dias);
}

/** Registra uma revisão concluída (com acerto opcional) e recalcula estabilidade/próxima volta no modelo adaptativo. */
function revisaoFeita(a, pct = null, opts = {}) {
  if (!a) return;
  const r = garantirEstadoRev(a), hj = hoje();
  const pesada = PESADAS_REV.includes(a.materia);
  const ehJanelaFix = !opts.manual && !r.fix && pesada && a.feitoEm && a.feitoEm < hj && a.feitoEm >= somaDias(hj, -2) && (r.n || 0) === 0;
  if (ehJanelaFix) {
    r.fix = hj;
    r.ult = hj;
    if (pct != null) r.hist = [...(r.hist || []), [hj, pct]].slice(-10);
    if (pct != null && pct < 60) { r.estab = 4; r.teoria = true; r.prox = somaDias(hj, 4); }
    else if (!r.prox) agendarRev(a, null);
    return;
  }
  if (pesada && !r.fix) r.fix = hj;
  delete a.revSoneca;
  delete r.perdoada;
  r.ult = hj;
  if (pct == null) {
    r.n = (r.n || 0) + 1;
    r.estab = Math.min(110, Math.round(r.estab * (1.85 - 0.1 * r.dif)));
    r.teoria = false;
  } else if (pct >= 85) {
    r.n = (r.n || 0) + 1;
    r.dif = Math.max(1.2, Math.round((r.dif - 0.35) * 10) / 10);
    r.estab = Math.min(120, Math.round(r.estab * (2.35 - 0.15 * r.dif)));
    if (a.fraco && pct >= 85) a.fraco = false;
  } else if (pct >= 70) {
    r.n = (r.n || 0) + 1;
    r.dif = Math.max(1.5, Math.round((r.dif - 0.1) * 10) / 10);
    r.estab = Math.min(110, Math.round(r.estab * (1.85 - 0.12 * r.dif)));
  } else if (pct >= 55) {
    r.n = (r.n || 0) + 1;
    r.estab = Math.min(60, Math.max(5, Math.round(r.estab * 1.15)));
  } else {
    // acerto baixo (<55%): estabilidade encolhe e pede revisão breve de resumo + novas questões em 3-4 dias
    r.dif = Math.min(5, Math.round((r.dif + 0.5) * 10) / 10);
    r.estab = Math.max(3, Math.min(5, Math.round(r.estab * 0.45)));
    a.fraco = true;
  }
  agendarRev(a, pct);
}

// estudou o assunto completo (última parte + última sessão): inicia o ciclo adaptativo
{ const s0 = setFeito; setFeito = function (a, ok, sinc) {
  const antes = a && !!a.feito;
  s0.apply(this, arguments);
  if (!a || antes === ok) return;
  if (ok && ehFinalDoAssunto(a)) {
    const pesada = PESADAS_REV.includes(a.materia);
    a.rev = { n: 0, estab: pesada ? 7 : 9, dif: pesada ? 3.4 : 2.6, hist: [] };
    agendarRev(a);
  } else if (!ok) {
    delete a.rev;
  }
}; }

/** Perdão suave: assunto classe C (baixa incidência) vencido há 21+ dias sai da fila urgente para evitar efeito bola de neve. */
function perdoarRevisoes() {
  const lim = somaDias(hoje(), -21);
  for (const a of estudados()) {
    if (a.cls === 'C' && !a.fraco && a.rev?.prox && a.rev.prox < lim) {
      a.rev.prox = null;
      a.rev.perdoada = hoje();
    }
  }
}

const prioRev = a => ({ A: 3, B: 2, C: 1 }[a.cls] || 2) + (PESADAS_REV.includes(a.materia) ? 0.5 : 0);

/** Análise completa e UNIFICADA de todos os assuntos estudados — usada por Hoje, Revisão e Ajustes. */
function analisarRevisoes(dia = hoje()) {
  perdoarRevisoes();
  const hj = dia, shared = tagsCompartilhadas();
  const cobr = {}, qhPorChave = {}, errosPorMat = {};
  if (BANCO.pronto) {
    const meta = {};
    for (const m of BANCO.itens) {
      meta[m.id] = m;
      if (!window.questaoIgnorada?.(m) && m.m && m.as) cobr[m.m + '|' + m.as] = (cobr[m.m + '|' + m.as] || 0) + 1;
    }
    for (const qid of Object.keys(S.qh || {})) {
      const m = meta[qid]; if (!m || !m.m || !m.as) continue;
      const h = histDe(qid)?.h; if (!h?.length) continue;
      const u = h[h.length - 1];
      (qhPorChave[m.m + '|' + m.as] ||= []).push({ m, aid: S.qh[qid].aid || '', dia: u[0] || '', ok: u[1] ? 1 : 0, dias: h.map(t => t[0] || '') });
    }
  }
  for (const e of S.erros || []) if (e.rev <= hj && e.materia) errosPorMat[e.materia] = (errosPorMat[e.materia] || 0) + 1;
  const ctx = { shared, qhPorChave };
  const diffDias = (d1, d2) => Math.max(0, Math.round((deIso(d1) - deIso(d2)) / 864e5));

  const res = estudados().map(a => {
    const r = garantirEstadoRev(a);
    const st = statsAssunto(a, ctx);
    const chave = `${a.materia}|${tagDe(a)}`, cob = cobr[chave] || 0;
    const contato = [st.ultDiaQ, r.ult || '', a.feitoEm || ''].reduce((mx, d) => d > mx ? d : mx, '');
    const dias = contato ? diffDias(hj, contato) : 0;

    // Estabilidade efetiva ajustada pelo acerto real observado e pela classe de incidência (A/B/C)
    let estabEf = r.estab;
    const graduadoC = a.cls === 'C' && !a.fraco && (r.n || 0) >= 1 && (st.pct == null || st.pct >= 65);
    const graduadoB = a.cls === 'B' && !a.fraco && (r.n || 0) >= 2 && (st.pct == null || st.pct >= 70);
    if (graduadoC || graduadoB) estabEf = Math.max(estabEf, 75);
    if (st.pct != null) {
      if (st.pct < 55) estabEf = Math.min(estabEf, 7);
      else if (st.pct < 70) estabEf = Math.min(estabEf, Math.max(10, Math.round(r.estab * 0.75)));
      else if (st.firme && st.pct >= 80) estabEf = Math.max(estabEf, Math.round(estabEf * 1.5));
    }
    // Retenção estimada R(t): 100% no dia 0, ~80% em t = estabEf, ~64% em t = 2*estabEf
    const retencao = Math.max(15, Math.min(100, Math.round(100 * Math.exp(-0.223 * dias / Math.max(2, estabEf)))));
    const adiada = !!(a.revSoneca && a.revSoneca > hj);
    const ehFix = PESADAS_REV.includes(a.materia) && !r.fix && a.feitoEm && a.feitoEm < hj && a.feitoEm >= somaDias(hj, -2) && (r.n || 0) === 0;
    const perdoada = (!!r.perdoada && !r.prox) || (a.cls === 'C' && !a.fraco && dias > 25 && (st.pct == null || st.pct >= 65));

    let status = 'ok';
    if (adiada) status = 'adiada';
    else if (ehFix) status = 'fixacao';
    else if (!perdoada && (retencao < 78 || (r.prox && r.prox <= hj && retencao < 85) || (st.pct != null && st.pct < 55 && dias >= 4))) status = 'agora';
    else if (!perdoada && retencao < 88) status = 'breve';

    const pesoProva = ({ A: 1.45, B: 1.1, C: 0.75 }[a.cls] || 1.05) + Math.min(0.35, Math.log2(1 + cob) * 0.05);
    const fatorFraqueza = (a.fraco ? 1.35 : 1) * (st.pct == null ? 1.05 : st.pct < 55 ? 1.42 : st.pct < 70 ? 1.18 : st.pct >= 85 ? 0.8 : 1);
    const urgencia = (ehFix ? 95 : 0) + (100 - retencao) * pesoProva * fatorFraqueza + (errosPorMat[a.materia] ? 4 : 0);

    let motivo = '';
    if (ehFix) motivo = 'Fixação rápida (24–48h após aula de Exatas)';
    else if (status === 'agora') {
      if (st.pct != null && st.pct < 55) motivo = `Acerto baixo (${st.pct}%) · reforçar`;
      else if (a.fraco) motivo = 'Marcado como fraco · memória caindo';
      else if (a.cls === 'A') motivo = `Cai muito nas provas · ${retencao}% retido`;
      else motivo = `Memória em ${retencao}% · boa hora para consolidar`;
    } else if (status === 'breve') motivo = `Retenção em ${retencao}% · volta em breve`;
    else if (perdoada) motivo = 'Baixa incidência · fica para revisão geral';
    else if (graduadoC || graduadoB) motivo = 'Consolidado · manutenção pelos simulados';

    const diasProx = status === 'agora' || ehFix ? 0 : Math.max(1, Math.round(estabEf * Math.log(1 / 0.78) / 0.223 - dias));
    return {
      a, m: a.materia, tag: tagDe(a), cob,
      n: st.n, n90: st.n90, nFora: st.nFora, pct: st.pct, firme: st.firme,
      faltam: Math.max(0, REV_MIN_FIRME - st.n),
      dias, estab: Math.round(estabEf), retencao, status, urgencia, motivo, diasProx, ehFix, perdoada,
    };
  });

  // Compressão anti-ansiedade: mantém no máximo os 12 assuntos de maior impacto (urgência) em "Rever agora";
  // excedentes aguardam com calma em "Em breve" (entram automaticamente assim que os 12 forem feitos!)
  const ordSt = { fixacao: 0, agora: 1, breve: 2, ok: 3, adiada: 4 };
  res.sort((x, y) => ordSt[x.status] - ordSt[y.status] || y.urgencia - x.urgencia);
  let nAgora = 0;
  for (const x of res) {
    if (x.status === 'agora') {
      nAgora++;
      if (nAgora > 12) {
        x.status = 'breve';
        x.motivo = `Na fila de revisão (${x.retencao}% retido) · entra depois dos prioritários`;
      }
    }
  }
  return res.sort((x, y) => ordSt[x.status] - ordSt[y.status] || y.urgencia - x.urgencia);
}

const fixacao = () => analisarRevisoes().filter(x => x.ehFix).map(x => x.a);
const vencidas = (dia = hoje()) => analisarRevisoes(dia).filter(x => x.status === 'agora' || x.status === 'fixacao').map(x => x.a);

/** Intercala assuntos de revisão: alterna Exatas com Biologia/Humanas/Linguagens para maximizar retenção (estudo intercalado). */
function intercalarRevisao(itens, n) {
  const pool = [...itens], out = [];
  while (out.length < n && pool.length) {
    const ult = out[out.length - 1];
    const ultPesada = ult ? PESADAS_REV.includes(ult.m) : null;
    let idx = 0;
    if (ult) {
      const melhor = pool.findIndex(x => x.m !== ult.m && PESADAS_REV.includes(x.m) !== ultPesada);
      if (melhor >= 0 && melhor <= 6) idx = melhor;
      else {
        const diffMat = pool.findIndex(x => x.m !== ult.m);
        if (diffMat >= 0 && diffMat <= 4) idx = diffMat;
      }
    }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/** Escolhe n assuntos já estudados que mais rendem revisar agora (com intercalação inteligente). */
function escolherRevisao(n, fora = []) {
  const lista = analisarRevisoes().filter(x => !fora.includes(x.a.id) && x.status !== 'adiada');
  const candidatos = lista.filter(x => x.status === 'fixacao' || x.status === 'agora' || x.status === 'breve');
  const base = candidatos.length >= n ? candidatos : lista;
  return intercalarRevisao(base, n).map(x => x.a);
}

/** Resumo leve exibido em Hoje (100% consistente com a aba Revisão). */
window.revResumoHoje = () => {
  const l = analisarRevisoes();
  return { total: l.length, urgentes: l.filter(x => x.status === 'agora' || x.status === 'fixacao').length };
};

const blocoRev = (titulo, lista, min, vaga) => ({
  id: uid(), assuntoId: null, tipo: 'revisao', vaga, revisao: lista.map(a => a.id), titulo,
  materia: lista.length === 1 ? lista[0].materia : 'Revisão', min,
  passos: [
    ...(lista.some(a => a.rev?.teoria) ? [{ t: 'Reler o resumo rápido dos que foram abaixo de 55% (10 min)', ok: false }] : []),
    { t: `Fazer ${lista.length * (vaga === 'dia' ? 4 : 5)} questões misturadas (no app ou fora)`, ok: false },
    { t: 'Revisar os erros e anotar o que esqueceu', ok: false },
  ],
});

/* Orçamento enxuto e anti-sufoco:
   - Revisão do dia: 15 min (fixação 24–48h de Exatas ou 1 assunto mais urgente)
   - Revisão maior (qua/sáb): 60 min na base, 90 min a partir de março — e NUNCA passa de 30% do dia enquanto houver conteúdo novo! */
function cfgRev() {
  const tarde = hoje() >= '2027-03-01';
  const padrao = { diario: 15, maior: tarde ? 90 : 60 };
  const salvo = S.perfil.revCfg || {};
  return { ...padrao, ...salvo };
}

{ const m0 = montarHoje; montarHoje = function (cap, so = []) {
  const d = diaHoje(), per = periodoDeHoje(), c = cfgRev();
  d.blocos = d.blocos.filter(b => b.tipo !== 'revisao' || b.passos.some(p => p.ok) || b.escolhidos);
  const ja = d.blocos.filter(b => b.tipo === 'revisao'), usados = ja.flatMap(b => b.revisao);
  const capOk = cap > 0 ? cap : d.cap || 0;
  const temConteudoPendente = S.assuntos.some(a => ehConteudo(a) && !a.feito && semDe(a) <= somaDias(semAtual(), 14));
  const novos = [];

  if (!(so || []).length && !per?.so && capOk >= 90) {
    // Teto global de revisão no dia: se ainda há conteúdo novo, revisões ocupam no máx. 32% do tempo (garantindo ≥68% para assuntos novos!)
    const tetoGlobalRev = temConteudoPendente ? Math.max(15, Math.min(Math.round(capOk * 0.32), capOk - 90)) : capOk;
    let revUsado = soma(ja, b => b.min || 0);

    // 1. Micro-revisão do dia (15 min): fixação 24-48h de Exatas ou 1 assunto mais urgente
    if (c.diario > 0 && !ja.some(b => b.vaga === 'dia') && revUsado < tetoGlobalRev) {
      const minDia = Math.min(c.diario, tetoGlobalRev - revUsado);
      if (minDia >= 15) {
        const n = Math.max(1, Math.min(2, Math.floor(minDia / 12)));
        const l = analisarRevisoes().filter(x => (x.status === 'fixacao' || x.status === 'agora') && !usados.includes(x.a.id)).slice(0, n).map(x => x.a);
        if (l.length) {
          novos.push(blocoRev(`Revisão rápida: ${l.map(nomeCanonicoRev).join(' · ')}`, l, minDia, 'dia'));
          revUsado += minDia;
        }
      }
    }

    // 2. Revisão inteligente (qua/sáb): questões intercaladas, sem sufocar o conteúdo novo
    if (c.maior > 0 && diasRev().includes(deIso(hoje()).getDay()) && !ja.some(b => b.vaga === 'semana') && revUsado < tetoGlobalRev) {
      const recente = somaDias(hoje(), -3);
      const fora = [...usados, ...novos.flatMap(b => b.revisao), ...estudados().filter(a => a.feitoEm && a.feitoEm > recente && !a.fraco).map(a => a.id)];
      const tetoMaior = Math.min(c.maior, tetoGlobalRev - revUsado);
      if (tetoMaior >= 25) {
        const nAss = Math.max(1, Math.min(4, Math.floor(tetoMaior / 22)));
        const l = escolherRevisao(nAss, fora);
        if (l.length) {
          const minBloco = Math.min(tetoMaior, Math.max(25, l.length * 22));
          novos.push(blocoRev('Revisão inteligente (questões misturadas)', l, minBloco, 'semana'));
        }
      }
    }
  }

  const usado = soma(novos, b => b.min), jaMin = soma(ja, b => b.min), resto = capOk - usado;
  if (capOk === 0) m0.call(this, 0, so);
  else if (resto - jaMin >= 30 || (so || []).length || (!novos.length && !ja.length)) m0.call(this, Math.max(1, resto), so);
  else d.blocos = d.blocos.filter(b => { const a = b.assuntoId && achar(b.assuntoId); return !a || a.feito || b.feito || (b.passos || []).some(p => p.ok); });
  d.cap = capOk; d.blocos.push(...novos);
}; }

// marcou todos os passos de um bloco de revisão: a volta conta como feita (sem acerto, se ela fez fora do app)
{ const p0 = ACOES.passo; ACOES.passo = el => {
  p0(el);
  const b = diaHoje().blocos.find(x => x.id === el.dataset.b);
  if (b?.tipo === 'revisao' && !b.contou && b.passos.every(p => p.ok)) {
    b.contou = true;
    b.revisao.map(achar).filter(Boolean).forEach(a => revisaoFeita(a));
    salvar();
  }
}; }

/** Abre uma lista inteligente do banco para os assuntos escolhidos:
    - Em modo revisão (extra.modoRevisao / extra.revisaoIds): mistura até 40% de questões que ela ERROU há ≥3 dias
      (prática de recuperação ativa!) + 60% inéditas priorizando as bancas do cenário dela (SP Capital ou Campinas).
    - Marca porId[qid] = a.id para que a atribuição de acertos ao fim da sessão seja 100% exata mesmo em tags compartilhadas! */
async function questoesDosAssuntos(lista, extra = {}, porAssunto = 10) {
  const qtd = extra.qtd || {}; extra = { ...extra }; delete extra.qtd;
  const k = extra.chaveLista;
  if (k && S.listasAbertas?.[k]?.itens?.length && !S.listasAbertas[k].fim) {
    ACOES.qContinuarLista({ dataset: { k } });
    return;
  }
  if (!BANCO.pronto) await carregarBanco();
  fecharModal();
  if (BANCO.itens.length < 5000 && BANCO._sync) {
    let acabou = false; BANCO._sync.then(() => { acabou = true; }, () => { acabou = true; });
    while (!acabou && BANCO.itens.length < 5000) {
      ui.carregando = `Baixando o banco de questões (só na primeira vez)… ${BANCO.itens.length ? BANCO.itens.length.toLocaleString('pt-BR') + ' prontas' : 'começando'}`; render();
      await new Promise(r => setTimeout(r, 1000));
    }
    ui.carregando = '';
  }
  const modoRev = !!(extra.modoRevisao || extra.revisaoIds?.length);
  const limErroAntigo = somaDias(hoje(), -3);
  const reBanca = regexBancaCenario();
  const bancaBoa = q => reBanca.test(q.b || '') ? 0 : 1;
  const naoMilitar = q => !/^(ita|ime)$/i.test(q.b || '');
  const prio = q => !S.qh[q.id] ? 0 : (!S.qh[q.id].ok ? 1 : 2);

  const ids = [], porId = {}, vistos = new Set();
  for (const a of lista) {
    const ehDisc = /^discursivas/i.test(nomeDe(a));
    if (ehDisc) {
      let candidatas = BANCO.itens.filter(q => !vistos.has(q.id) && !window.questaoIgnorada?.(q) && naoMilitar(q) && q.m === a.materia && q.ds);
      const ineditas = candidatas.filter(q => !S.qh[q.id]);
      const fonte = ineditas.length >= 3 ? ineditas : candidatas;
      fonte.sort((x, y) => prio(x) - prio(y) || bancaBoa(x) - bancaBoa(y) || Math.random() - 0.5);
      for (const q of fonte.slice(0, 3)) { ids.push(q.id); porId[q.id] = a.id; vistos.add(q.id); }
      continue;
    }
    const subRe = subRegexDe(a), tag = tagDe(a);
    let candidatas = BANCO.itens.filter(q => !vistos.has(q.id) && !window.questaoIgnorada?.(q) && naoMilitar(q) && q.m === a.materia && q.as === tag && !q.ds && !q.f);
    if (!candidatas.length) candidatas = BANCO.itens.filter(q => !vistos.has(q.id) && !window.questaoIgnorada?.(q) && naoMilitar(q) && q.m === a.materia && q.as === tag && !q.ds);
    const nA = qtd[a.id] || porAssunto;

    if (subRe) {
      const irmaos = (window.SUBTOPICOS?.[tag] || []).map(([, re]) => re).filter(re => re !== subRe);
      const pistas = (re, t) => (t.match(new RegExp(re.source, 'g')) || []).length;
      const doSub = candidatas.filter(q => {
        const t = (q.x || '') + ' ' + (q.s || ''), n = pistas(subRe, t);
        return n > 0 && irmaos.every(re => pistas(re, t) <= n);
      });
      if (doSub.length >= Math.min(nA, 4)) candidatas = doSub;
    }

    const escolhidas = [];
    if (modoRev) {
      // Em revisão: até 40% de questões erradas anteriormente (há ≥3 dias) para recuperação ativa real
      const maxErros = Math.max(1, Math.floor(nA * 0.4));
      const erradasAntigas = candidatas.filter(q => S.qh[q.id] && !S.qh[q.id].ok && (S.qh[q.id].dia || '') <= limErroAntigo)
        .sort((x, y) => bancaBoa(x) - bancaBoa(y) || Math.random() - 0.5);
      escolhidas.push(...erradasAntigas.slice(0, maxErros));
    }
    const jaIds = new Set(escolhidas.map(q => q.id));
    const faltam = Math.max(0, nA - escolhidas.length);
    const resto = candidatas.filter(q => !jaIds.has(q.id));
    const ineditas = resto.filter(q => !S.qh[q.id]);
    const fonte = ineditas.length >= faltam ? ineditas : resto;
    fonte.sort((x, y) => {
      const sx = subRe ? (subRe.test((x.x || '') + ' ' + (x.s || '')) ? 0 : 1) : 0;
      const sy = subRe ? (subRe.test((y.x || '') + ' ' + (y.s || '')) ? 0 : 1) : 0;
      return sx - sy || prio(x) - prio(y) || bancaBoa(x) - bancaBoa(y) || Math.random() - 0.5;
    });
    escolhidas.push(...fonte.slice(0, faltam));
    for (const q of escolhidas) { ids.push(q.id); porId[q.id] = a.id; vistos.add(q.id); }
  }
  if (!ids.length) {
    ui.view = 'questoes'; ui.qAba = 'listas'; ui.qs = null; ui.qf.mat = lista[0]?.materia || ''; ui.qf.assunto = ''; ui.qf.st = 'novas';
    ui.iaMsg = 'Ainda não há questões desse assunto no banco: abri as inéditas da matéria.'; window.scrollTo(0, 0); render(); return;
  }
  // Em revisão com 2+ assuntos, embaralha levemente mantendo blocos curtos intercalados
  if (modoRev && lista.length > 1) {
    const porAss = {};
    for (const id of ids) (porAss[porId[id]] ||= []).push(id);
    const filas = Object.values(porAss), mix = [];
    while (filas.some(f => f.length)) for (const f of filas) if (f.length) mix.push(f.shift());
    ids.splice(0, ids.length, ...mix);
  }
  ui.view = 'questoes'; ui.qAba = 'listas'; window.scrollTo(0, 0);
  await ACOES.qIniciarIds(ids, { ...extra, porId });
}

// fim da lista: cada assunto revisado anda com atribuição EXATA por _revAssuntoId (sem misturar tags compartilhadas!)
{ const f0 = finalizarSessao; finalizarSessao = function () {
  const s = ui.qs; f0.apply(this, arguments);
  if (!s) return;
  const feitas = s.itens.filter(q => q.resp != null);
  for (const id of s.revisaoIds || []) {
    const a = achar(id); if (!a) continue;
    const diretas = feitas.filter(q => q._revAssuntoId === a.id);
    const l = diretas.length ? diretas : feitas.filter(q => q.materia === a.materia && limAss(q.assunto) === tagDe(a));
    if (l.length) revisaoFeita(a, l.length >= 2 ? Math.round(l.filter(q => q.certo).length / l.length * 100) : null);
  }
  const ids = [...(s.revisaoIds || []), ...(s.assuntoId ? [s.assuntoId] : [])];
  if (feitas.length) for (const b of diaHoje().blocos) {
    if (!(b.id === s.blocoId || ids.includes(b.assuntoId) || (b.revisao || []).some(x => s.revisaoIds?.includes(x)))) continue;
    const p = (b.passos || []).find(p => !p.ok && /quest/i.test(p.t));
    if (p) {
      p.ok = true;
      S.feitos[hoje()] = (S.feitos[hoje()] || 0) + 1;
      if (b.passos.every(x => x.ok)) {
        b.feito = true;
        if (b.assuntoId) setFeito(achar(b.assuntoId), true, false);
      }
    }
    if (b.tipo === 'revisao') b.contou = true;
  }
  salvar();
}; }

Object.assign(ACOES, {
  qDoAssunto: async el => {
    const a = achar(el.dataset.id); if (!a) return;
    const b = (el.dataset.b && diaHoje().blocos.find(x => x.id === el.dataset.b)) || diaHoje().blocos.find(x => x.assuntoId === a.id);
    const ehDisc = /^discursivas/i.test(nomeDe(a));
    const nQ = ehDisc ? 3 : ehHabitoQ(a) ? 10 : (b && window.questoesDoBloco ? window.questoesDoBloco(b) : Math.max(5, Math.min(40, tempoDe(a).q || 15)));
    await questoesDosAssuntos([a], { assuntoId: a.id, blocoId: b?.id || '', chaveLista: 'a:' + a.id, tituloLista: a.titulo }, nQ);
  },
  qDaRevisao: async el => {
    const b = diaHoje().blocos.find(x => x.id === el.dataset.b);
    const l = (b?.revisao || []).map(achar).filter(Boolean);
    if (l.length) await questoesDosAssuntos(l, { revisaoIds: l.map(a => a.id), modoRevisao: true, blocoId: b.id, chaveLista: 'rev:' + b.id, tituloLista: b.titulo }, b.vaga === 'dia' ? 4 : 5);
  },
  fraco: el => { const a = achar(el.dataset.id); if (!a) return; a.fraco = !a.fraco; salvar(); ui.iaMsg = a.fraco ? `Anotado: "${a.titulo}" entra com prioridade na Revisão Inteligente.` : 'Tirei a marca de fraco.'; fecharModal(); render(); },
  diaRev: el => { const v = +el.dataset.v, l = diasRev(); S.perfil.diasRev = l.includes(v) ? l.filter(x => x !== v) : [...l, v].sort(); salvar(); render(); },
  revCfg: el => { S.perfil.revCfg = { ...cfgRev(), [el.dataset.k]: +el.dataset.v }; salvar(); render(); },
  revEscolher: el => {
    const b = diaHoje().blocos.find(x => x.id === el.dataset.b); if (!b) return;
    const analise = analisarRevisoes(), max = Math.max(1, Math.floor(b.min / (b.vaga === 'dia' ? 12 : 22)));
    abrirModal(`<div class="entre"><h2>Escolher assuntos da revisão</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
      <p class="fraco" style="margin:0">Até ${max} ${max === 1 ? 'assunto cabe' : 'assuntos cabem'} nesta vaga (${fmtMin(b.min)}). Estão ordenados por prioridade de memória × peso na prova.</p>
      ${analise.length ? `<div class="rev-escolha">${analise.map(x => `<label class="marca-q"><input type="checkbox" data-rev-esc="${x.a.id}" ${b.revisao.includes(x.a.id) ? 'checked' : ''}> <span><span class="tag" style="${cor(x.m)}">${esc(x.m)}</span> ${esc(nomeCanonicoRev(x.a))} · <b>${x.retencao}% retido</b>${x.pct != null ? ` · acerto ${x.pct}%` : ''}${x.a.fraco ? ' · fraco' : ''}</span></label>`).join('')}</div>`
        : '<p style="margin:0">Ainda não há assuntos estudados. Quando você concluir assuntos, eles aparecem aqui.</p>'}
      <div class="linha"><button class="botao" data-acao="revEscolhidos" data-b="${b.id}" data-max="${max}">Usar estes</button></div>`);
  },
  revEscolhidos: el => {
    const b = diaHoje().blocos.find(x => x.id === el.dataset.b); if (!b) return;
    const ids = [...document.querySelectorAll('[data-rev-esc]:checked')].map(x => x.dataset.revEsc).slice(0, +el.dataset.max);
    const l = ids.map(achar).filter(Boolean), novo = blocoRev(b.vaga === 'dia' ? `Revisão rápida: ${l.map(nomeCanonicoRev).join(' · ') || 'sem assuntos'}` : b.titulo, l, b.min, b.vaga);
    Object.assign(b, { revisao: novo.revisao, titulo: novo.titulo, materia: novo.materia, passos: novo.passos, escolhidos: true });
    if (S.listasAbertas?.['rev:' + b.id]) delete S.listasAbertas['rev:' + b.id];
    salvar(); fecharModal(); render();
  },
});

// botões nos blocos de hoje e na janela do assunto
{ const b0 = blocoHtml; blocoHtml = function (b) {
  let h = b0.apply(this, arguments);
  if (b.tipo === 'revisao') {
    const l = (b.revisao || []).map(achar).filter(Boolean);
    const ab = S.listasAbertas?.['rev:' + b.id];
    const btnRev = ab?.itens?.length && !ab.fim
      ? `<button class="botao destaque" data-acao="qContinuarLista" data-k="rev:${b.id}">Continuar questões (${ab.itens.filter(q => q.resp != null).length}/${ab.itens.length})</button>`
      : l.length ? `<button class="botao claro" data-acao="qDaRevisao" data-b="${b.id}">Fazer ${window.questoesDoBloco ? window.questoesDoBloco(b) : l.length * 4} questões no app</button>` : '';
    return h.replace('</article>', `<div class="rev-lista">${l.map(a => `<span class="tag" style="${cor(a.materia)}">${esc(nomeCanonicoRev(a))}${a.fraco ? ' · fraco' : ''}${acertoDe(a) != null ? ` · ${acertoDe(a)}%` : ''}</span>`).join('')}</div>
      <div class="linha acoes-bloco">${btnRev}<button class="link" data-acao="revEscolher" data-b="${b.id}">${b.escolhidos ? 'Trocar os assuntos' : 'Escolher eu mesma'}</button></div></article>`);
  }
  const a = b.assuntoId && achar(b.assuntoId);
  if (!a || (!ehConteudo(a) && !ehHabitoQ(a))) return h;
  const ab = S.listasAbertas?.['a:' + a.id];
  const qMeta = /^discursivas/i.test(nomeDe(a)) ? 3 : ehHabitoQ(a) ? 10 : (window.questoesDoBloco ? window.questoesDoBloco(b) : (tempoDe(a).q || 15));
  const btnAss = ab?.itens?.length && !ab.fim
    ? `<button class="botao destaque" data-acao="qContinuarLista" data-k="a:${a.id}">Continuar questões (${ab.itens.filter(q => q.resp != null).length}/${ab.itens.length})</button>`
    : `<button class="botao claro" data-acao="qDoAssunto" data-id="${a.id}" data-b="${b.id}">Fazer ${qMeta} questões no app</button>`;
  return h.replace('<div class="linha acoes-bloco">', `<div class="linha acoes-bloco">${btnAss}`);
}; }

{ const m0 = modalAssunto; modalAssunto = function (a) {
  m0.apply(this, arguments);
  if (!ehConteudo(a) && !ehHabitoQ(a)) return;
  const linha = document.querySelector('#modal .janela > .linha:last-child');
  if (!linha) return;
  const ab = S.listasAbertas?.['a:' + a.id];
  const btnCont = ab?.itens?.length && !ab.fim
    ? `<button class="botao destaque" data-acao="qContinuarLista" data-k="a:${a.id}">Continuar questões (${ab.itens.filter(q => q.resp != null).length}/${ab.itens.length})</button>` : '';
  const qBtn = linha.querySelector('[data-acao="qDoAssunto"]');
  if (qBtn && btnCont) qBtn.outerHTML = btnCont;
  else if (!qBtn) linha.insertAdjacentHTML('afterbegin', btnCont || `<button class="botao claro" data-acao="qDoAssunto" data-id="${a.id}">Fazer questões no app</button>`);
  if (!ehConteudo(a)) return;
  const info = a.feito && ehFinalDoAssunto(a) ? analisarRevisoes().find(x => x.a.id === a.id) : null;
  const revTxt = info ? `Retenção estimada: <b>${info.retencao}%</b> · ${info.status === 'agora' || info.ehFix ? 'melhor rever agora' : `próxima em ~${info.diasProx}d`}${info.pct != null ? ` · acerto ${info.pct}%` : ''}` : '';
  if (revTxt) linha.insertAdjacentHTML('beforebegin', `<span class="fraco" style="font-size:14px">${revTxt}</span>`);
  const btnFraco = `<button class="botao contorno" data-acao="fraco" data-id="${a.id}">${a.fraco ? 'Não estou mais fraca nisso' : 'Estou fraca nisso'}</button>`;
  const remBtn = linha.querySelector('[data-acao="removerAssunto"]');
  if (remBtn) remBtn.insertAdjacentHTML('beforebegin', btnFraco); else linha.insertAdjacentHTML('beforeend', btnFraco);
}; }

// Ajustes: orçamento fixo e anti-sufoco da Revisão Inteligente
{ const v0 = VIEWS.ajustes; VIEWS.ajustes = function () {
  const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], c = cfgRev();
  const op = (k, vs) => vs.map(v => `<button class="chip" data-acao="revCfg" data-k="${k}" data-v="${v}" aria-pressed="${c[k] === v}">${v ? fmtMin(v) : 'nenhuma'}</button>`).join('');
  const an = analisarRevisoes(), urg = an.filter(x => x.status === 'agora' || x.status === 'fixacao').length;
  return v0() + `<section class="cartao"><h2>Revisão Inteligente</h2>
    <p class="fraco" style="margin:0">As revisões usam memória adaptativa (FSRS leve) + peso nas provas de Medicina SP, com teto rígido: <b>nunca tomam mais de 32% do seu dia</b> enquanto houver conteúdo novo. Misturam erros antigos com questões inéditas e intercalam Exatas com Bio/Humanas.</p>
    <span class="rotulo">micro-revisão diária</span><div class="linha">${op('diario', [0, 15, 20, 30])}</div>
    <span class="rotulo">revisão maior (nos dias escolhidos)</span><div class="linha">${op('maior', [0, 45, 60, 90, 120, 150])}</div>
    <span class="rotulo">dias da revisão maior</span><div class="linha">${nomes.map((n, i) => `<button class="chip" data-acao="diaRev" data-v="${i}" aria-pressed="${diasRev().includes(i)}">${n}</button>`).join('')}</div>
    <p class="fraco" style="margin:0;font-size:14px">Teto semanal: até ${fmtMin(c.diario * 6 + c.maior * diasRev().length)} · ${an.length} assuntos estudados · ${urg} prontos para rever · ${an.filter(x => x.a.fraco).length} marcados como fracos</p></section>`;
}; }
