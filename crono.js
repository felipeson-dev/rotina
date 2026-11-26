'use strict';
/* Cronograma definitivo da Uany (cronograma.js, gerado no PC): a partir de 20/11/2026 ele vira o plano do app. Aplica uma vez por
   versão, com cópia de segurança do plano anterior; o que ela planejou na aba Planejamento (períodos) continua valendo.
   Cada tópico vem dividido em partes de até 2h30 (a revisão espaçada só começa na última parte); hábitos e simulados têm dia e tempo fixos.
   Antes do início, o dia não puxa nada do cronograma; nos dias de "limpeza" (a cada 6 semanas) não entra conteúdo novo. */

const cenarioDe = () => (S.perfil && S.perfil.cenario) || 'capital';
function aplicarCronograma() {
  const C = CRONOGRAMA, cen = cenarioDe(), tinhaCrono = !!S.cronoV;
  if (typeof copiarPlano === 'function') copiarPlano(`${hoje()} ${agoraHm()} · antes do cronograma v${C.v}`);
  // o que ela já fez em cada assunto passa para o plano novo: pelo id (mesma versão, troca de cenário) ou, de uma versão para outra,
  // pelo nome do assunto e pela fração já estudada (incluindo sessões divididas)
  const velhosArr = S.assuntos.filter(a => a.crono), velhos = new Map(velhosArr.map(a => [a.id, a]));
  const baseNomeSemSessao = s => String(s || '').replace(/\s*·\s*sessão\s+\d+\/\d+\s*$/i, '').replace(/\s*\(parte \d+ de \d+\)\s*$/i, '').trim();
  const chaveNome = a => a.materia + '|' + baseNomeSemSessao(a.nome || a.titulo);
  // assunto renomeado no plano novo (ex.: v4 com os módulos do Ferretto) traz o nome antigo em 'ant'
  const chaveNova = a => a.ant ? a.materia + '|' + baseNomeSemSessao(a.ant) : chaveNome(a);
  const fracao = a => {
    const p0 = a.parte ? a.parte[0] : 1, p1 = a.parte ? a.parte[1] : 1;
    const sk = a.sessao ? a.sessao.k : 1, sn = a.sessao ? a.sessao.n : 1;
    return (p0 - 1 + sk / sn) / Math.max(1, p1);
  };
  const porNome = new Map(); for (const a of velhosArr) { const k = chaveNome(a); if (!porNome.has(k)) porNome.set(k, []); porNome.get(k).push(a); }
  const sessoesPorOrig = new Map();
  for (const a of velhosArr) if (a.sessao && a.origId) { (sessoesPorOrig.get(a.origId) || sessoesPorOrig.set(a.origId, []).get(a.origId)).push(a); }
  const equivalente = x => {
    const l = porNome.get(chaveNova(x)) || porNome.get(chaveNome(x)); if (!l) return null;
    // se uma parte foi dividida em sessões, só marca a parte inteira como feita se TODAS as sessões daquela parte estiverem feitas
    const feitas = l.filter(o => o.feito && (!o.sessao || l.filter(y => y.origId && y.origId === o.origId).every(y => y.feito)));
    const F = feitas.length ? Math.max(...feitas.map(fracao)) : 0, fx = fracao(x);
    if (feitas.length && fx <= F + 0.01) {
      const ref = feitas.find(o => Math.abs(fracao(o) - F) < 0.01) || feitas[feitas.length - 1];
      return { ...ref, rev: fx >= 0.999 ? ref.rev : null, feito: true };
    }
    const fraco = l.some(o => o.fraco), qAgg = l.reduce((acc, o) => {
      if (o.questoes?.feitas) { acc.feitas += o.questoes.feitas; acc.acertos += o.questoes.acertos || 0; acc.semAc += o.questoes.semAc || 0; }
      return acc;
    }, { feitas: 0, acertos: 0, semAc: 0 });
    return (fraco || qAgg.feitas) ? { fraco, ...(qAgg.feitas ? { questoes: qAgg } : {}) } : null;
  };
  const novos = [];
  for (const x of C.itens.filter(item => !item.cenario || item.cenario === cen)) {
    // se a usuária dividiu este item em sessões nesta mesma versão e ainda está em andamento, preserva as sessões
    const ses = sessoesPorOrig.get(x.id);
    if (ses && ses.length > 1 && ses.some(s => s.feito) && !ses.every(s => s.feito)) {
      novos.push(...ses.map(s => ({ ...s })));
      continue;
    }
    const v = velhos.get(x.id) || equivalente(x);
    const a = { ...x, ord: x.ord ?? 0.5, feito: !!v?.feito, semOrig: x.semana };
    if (window.limparNomeAssunto && a.tag) a.tag = window.limparNomeAssunto(a.tag);
    if (x.min_ != null) {               // conteúdo: ~40% teoria e o resto em questões (o app recalcula pelo ritmo dela)
      a.teoria = Math.max(25, x.teoria || 40);   // consistente com o piso de 25 min na carga
      const minAlvo = Math.max(60, x.min_ || 60);
      a.q = Math.max(8, Math.round((minAlvo - a.teoria) / ((MIN_Q[x.materia] || 2.8) * 1.25)));
      a.calibrado = true;
      delete a.min_;
    }
    if (a.habito === 'enem') a.min = Math.max(75, a.min || 75);
    if (v) {
      // quando fez, revisões agendadas, acerto nas questões, marca de fraco e soneca
      for (const k of ['feitoEm', 'rev', 'revSoneca', 'questoes', 'qdia', 'fraco']) if (v[k] != null) a[k] = v[k];
      // preserva 'dia' personalizado somente se é o mesmo item (evita travar hábitos em datas antigas ao trocar versão)
      if (velhos.get(x.id) === v && v.dia != null && !x.habito) a.dia = v.dia;
      // tempos que ela mesma ajustou
      if (v.manual) for (const k of ['teoria', 'q', 'dens', 'manual', 'calibrado']) if (v[k] != null) a[k] = v[k];
      // semana que ela (ou a IA a pedido dela) mudou de lugar
      if (velhos.get(x.id) === v && v.semOrig && v.semana !== v.semOrig) { a.semana = v.semana; a.mes = v.mes; }
    }
    novos.push(a);
  }
  // preserva TODOS os assuntos adicionados manualmente pela usuária (feitos ou pendentes) e itens de períodos planejados
  S.assuntos = [...S.assuntos.filter(a => a.periodo || !a.crono), ...novos];
  // dias de hoje em diante: bloco de assunto que não existe mais passa para o equivalente novo; se não houver, sai (o dia se completa sozinho)
  const ids = new Set(novos.map(a => a.id));
  const novoDe = (id, concluido) => { const o = velhos.get(id); if (!o) return null; const l = novos.filter(a => chaveNova(a) === chaveNome(o) || chaveNome(a) === chaveNome(o)); if (!l.length) return null;
    if (concluido) { const f = l.filter(a => a.feito); return f.length ? f[f.length - 1].id : null; }
    return (l.find(a => !a.feito && fracao(a) >= fracao(o) - 0.01) || l.find(a => !a.feito) || l[l.length - 1]).id; };
  for (const [dia, d] of Object.entries(S.dias || {})) {
    if (dia < hoje() || !d.blocos) continue;
    d.blocos = d.blocos.filter(b => {
      if (!b.assuntoId || ids.has(b.assuntoId) || S.assuntos.some(a => a.id === b.assuntoId)) return true;
      const n = novoDe(b.assuntoId, (b.passos || []).length ? b.passos.every(p => p.ok) : !!b.feito);
      if (n && !d.blocos.some(o => o.assuntoId === n)) { const a = novos.find(x => x.id === n); b.assuntoId = n; b.titulo = a.titulo; return true; }
      return (b.passos || []).some(p => p.ok) || b.feito;   // o que ela já começou fica, como registro do dia
    });
  }
  S.fases = C.fases.map(f => ({ ...f }));
  // datas que ela corrigiu manualmente (ex.: "a Fuvest será dia tal") continuam valendo —
  // mas NUNCA trata datas estimadas antigas do base.js (antes do 1º cronograma) como se fossem edição dela!
  const dataPlano = new Map(C.provas.map(p => [p.nome, p.data]));
  if (S.datasDela?.['USP (Fuvest), 1ª fase']?.data === '2027-11-07' && S.datasDela['USP (Fuvest), 1ª fase'].estimada) {
    delete S.datasDela['USP (Fuvest), 1ª fase'];
  }
  if (tinhaCrono) {
    for (const p of S.provas || []) {
      if (!dataPlano.has(p.nome) || !p.data) continue;
      if (p.data !== dataPlano.get(p.nome) && p.estimada === false) (S.datasDela ||= {})[p.nome] = { data: p.data, estimada: false };
      else if (p.data === dataPlano.get(p.nome) && S.datasDela) delete S.datasDela[p.nome];
    }
  }
  S.provas = [...(S.provas || []).filter(p => p.data && p.data < '2027-01-01' && p.data >= hoje()), ...C.provas.filter(p => !p.cenario || p.cenario === cen).map(p => { const v = S.datasDela?.[p.nome]; return v ? { ...p, data: v.data, estimada: v.estimada } : { ...p }; })];
  // foco de cada mês: o que começa nas matérias principais
  S.meses = {};
  for (const m of [...new Set(novos.map(a => a.mes))]) {
    const ini = ['Biologia', 'Química', 'Física', 'Matemática'].map(mat => novos.find(a => a.mes === m && a.materia === mat && a.parte?.[0] === 1)?.nome).filter(Boolean);
    S.meses[m] = { foco: ini.length ? `Começa: ${ini.join('; ')}.` : '' };
  }
  S.cronoV = C.v; S.cronoCen = cen; S.cronoInicio = C.inicio; S.diasLimpeza = C.limpeza; S.semeado = true;
  salvar();
  return novos.length;
}

// Repara eventual colisão antiga de Fuvest 1ª fase com ENEM 1º dia (07/11/2027 estimada herdada de base.js)
if (S.datasDela?.['USP (Fuvest), 1ª fase']?.data === '2027-11-07' && S.datasDela['USP (Fuvest), 1ª fase'].estimada) {
  delete S.datasDela['USP (Fuvest), 1ª fase'];
  const fp = (S.provas || []).find(p => p.nome === 'USP (Fuvest), 1ª fase' && p.data === '2027-11-07' && p.estimada);
  if (fp) { fp.data = '2027-11-21'; salvar(); }
}

if (typeof CRONOGRAMA !== 'undefined' && (S.cronoV !== CRONOGRAMA.v || (S.cronoV >= 3 && S.cronoCen !== cenarioDe()))) {
  const n = aplicarCronograma();
  ui.iaMsg = CRONOGRAMA.v >= 4
    ? `Plano atualizado com as aulas do Ferretto: em cada assunto aparecem o módulo e as aulas para assistir (em 1,25×). O que você já fez continua marcado. O plano anterior ficou guardado em Ajustes > Cópias do plano.`
    : `O cronograma novo (v${CRONOGRAMA.v}) está no app: ${n} itens até setembro, com conteúdo, revisões, hábitos e simulados. O plano antigo ficou guardado em Ajustes > Cópias do plano.`;
}

// Calibração e limpeza não-destrutiva de tópicos e pisos de tempo para dados já carregados
if (Array.isArray(S?.assuntos)) {
  // semana original de cada assunto (para saber, numa troca de cenário, o que ela mudou de lugar)
  const orig = typeof CRONOGRAMA !== 'undefined' ? new Map(CRONOGRAMA.itens.map(x => [x.id, x.semana])) : new Map();
  for (const a of S.assuntos) if (a.crono && a.semOrig === undefined && orig.has(a.id)) a.semOrig = orig.get(a.id);
  // "Revisão de base" era conteúdo novo (base de Matemática), não uma revisão do app: nome trocado em 17/11 para não confundir
  for (const a of S.assuntos) for (const k of ['titulo', 'nome']) if (typeof a[k] === 'string' && a[k].startsWith('Revisão de base:')) a[k] = 'Base de Matemática:' + a[k].slice('Revisão de base:'.length);
  for (const a of S.assuntos) {
    if (window.limparNomeAssunto && a.tag) a.tag = window.limparNomeAssunto(a.tag);
    if (ehConteudo(a) && !a.manual) {
      if (a.teoria != null && a.teoria < 25) a.teoria = 25;
      if (a.q != null && a.q < 8) a.q = 8;
    }
    if (a.habito === 'enem' && a.min && a.min < 75) a.min = 75;
  }
}

// até a data de início do cronograma o dia é livre; nos dias de limpeza não entra conteúdo novo
const cronoLibera = () => S.cronoInicio || (typeof CRONOGRAMA !== 'undefined' && CRONOGRAMA.inicio) || '2026-11-16';
{ const f0 = filaParaHoje; filaParaHoje = function () {
  let l = f0.apply(this, arguments);
  if (hoje() < cronoLibera()) l = l.filter(a => !a.crono);
  if ((S.diasLimpeza || []).includes(hoje())) l = l.filter(a => !ehConteudo(a) || estadoDe(a) === 'atrasado');
  return l;
}; }

// Ajustes: cenário das provas (muda as provas e, de maio em diante, a lista de obras)
{ const v0 = VIEWS.ajustes; VIEWS.ajustes = function () {
  const c = cenarioDe();
  return v0() + `<section class="cartao"><h2>Onde vou prestar</h2>
    <p class="fraco" style="margin:0">Muda as provas no calendário e, a partir de maio, a lista de obras literárias. Até o fim de abril as obras alternam as duas listas. Decidir até 30/04.</p>
    <div class="linha">${[['capital', 'São Paulo capital (Fuvest, Santa Casa, Einstein, UNIFESP, São Camilo, FMABC)'], ['campinas', 'Campinas (Unicamp, PUC-Campinas)']].map(([v, t]) => `<button class="chip" data-acao="cenario" data-v="${v}" aria-pressed="${c === v}">${t}</button>`).join('')}</div></section>`;
}; }
ACOES.cenario = el => { (S.perfil ||= {}).cenario = el.dataset.v; const n = aplicarCronograma(); ui.iaMsg = `Plano ajustado para ${el.dataset.v === 'campinas' ? 'Campinas' : 'São Paulo capital'} (${n} itens).`; render(); };
