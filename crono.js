'use strict';
/* Cronograma definitivo da Uany (cronograma.js, gerado no PC): a partir de 20/11/2026 ele vira o plano do app. Aplica uma vez por
   versão, com cópia de segurança do plano anterior; o que ela planejou na aba Planejamento (períodos) continua valendo.
   Cada tópico vem dividido em partes de até 2h30 (a revisão espaçada só começa na última parte); hábitos e simulados têm dia e tempo fixos.
   Antes do início, o dia não puxa nada do cronograma; nos dias de "limpeza" (a cada 6 semanas) não entra conteúdo novo. */

const cenarioDe = () => (S.perfil && S.perfil.cenario) || 'capital';
function aplicarCronograma() {
  const C = CRONOGRAMA, cen = cenarioDe();
  if (typeof copiarPlano === 'function') copiarPlano(`${hoje()} ${agoraHm()} · antes do cronograma v${C.v}`);
  // o que ela já fez em cada assunto passa para o plano novo: pelo id (mesma versão, troca de cenário) ou, de uma versão para outra,
  // pelo nome do assunto e pela fração já estudada (o plano novo pode dividir o mesmo assunto em outro número de partes)
  const velhosArr = S.assuntos.filter(a => a.crono), velhos = new Map(velhosArr.map(a => [a.id, a]));
  const chaveNome = a => a.materia + '|' + (a.nome || String(a.titulo || '').replace(/\s*\(parte \d+ de \d+\)\s*$/, ''));
  const fracao = a => a.parte ? a.parte[0] / a.parte[1] : 1;
  const porNome = new Map(); for (const a of velhosArr) { const k = chaveNome(a); if (!porNome.has(k)) porNome.set(k, []); porNome.get(k).push(a); }
  const equivalente = x => {
    const l = porNome.get(chaveNome(x)); if (!l) return null;
    const feitas = l.filter(o => o.feito), F = Math.max(0, ...feitas.map(fracao)), fx = fracao(x);
    if (feitas.length && fx <= F + 0.01) return { ...feitas.find(o => fracao(o) === F), rev: fx === 1 ? feitas.find(o => fracao(o) === F).rev : null, feito: true };
    const fraco = l.some(o => o.fraco);
    return fraco ? { fraco: true } : null;
  };
  const novos = C.itens.filter(x => !x.cenario || x.cenario === cen).map(x => {
    const v = velhos.get(x.id) || equivalente(x);
    const a = { ...x, ord: x.ord ?? 0.5, feito: !!v?.feito, semOrig: x.semana };
    if (window.limparNomeAssunto && a.tag) a.tag = window.limparNomeAssunto(a.tag);
    if (x.min_ != null) {               // conteúdo: ~40% teoria e o resto em questões (o app recalcula pelo ritmo dela)
      a.teoria = Math.max(20, x.teoria || 40);   // v3: minutos de aula do pedaço (o resto é questão do próprio assunto)
      const minAlvo = Math.max(60, x.min_ || 60);
      a.q = Math.max(8, Math.round((minAlvo - a.teoria) / ((MIN_Q[x.materia] || 2.8) * 1.25)));
      a.calibrado = true;
      delete a.min_;
    }
    if (a.habito === 'enem') a.min = Math.max(75, a.min || 75);
    if (v) {
      // quando fez, revisões agendadas, acerto nas questões, marca de fraco e o dia que ela escolheu
      for (const k of ['feitoEm', 'rev', 'questoes', 'qdia', 'fraco', 'dia']) if (v[k] != null) a[k] = v[k];
      // tempos que ela mesma ajustou
      if (v.manual) for (const k of ['teoria', 'q', 'dens', 'manual', 'calibrado']) if (v[k] != null) a[k] = v[k];
      // semana que ela (ou a IA a pedido dela) mudou de lugar
      if (velhos.get(x.id) === v && v.semOrig && v.semana !== v.semOrig) { a.semana = v.semana; a.mes = v.mes; }
    }
    return a;
  });
  S.assuntos = [...S.assuntos.filter(a => a.periodo || (a.feito && !a.crono && a.feitoEm)), ...novos];
  // dias de hoje em diante: bloco de assunto que não existe mais passa para o equivalente novo; se não houver, sai (o dia se completa sozinho)
  const ids = new Set(novos.map(a => a.id));
  const novoDe = (id, concluido) => { const o = velhos.get(id); if (!o) return null; const l = novos.filter(a => chaveNome(a) === chaveNome(o)); if (!l.length) return null;
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
  // datas que ela corrigiu (ex.: "a Fuvest será dia tal") continuam valendo
  // (guardadas à parte, para sobreviver à ida e volta entre os cenários)
  const dataPlano = new Map(C.provas.map(p => [p.nome, p.data]));
  for (const p of S.provas || []) {
    if (!dataPlano.has(p.nome) || !p.data) continue;
    if (p.data !== dataPlano.get(p.nome)) (S.datasDela ||= {})[p.nome] = { data: p.data, estimada: p.estimada ?? false };
    else if (S.datasDela) delete S.datasDela[p.nome];
  }
  S.provas = [...(S.provas || []).filter(p => p.data && p.data < '2027-01-01'), ...C.provas.filter(p => !p.cenario || p.cenario === cen).map(p => { const v = S.datasDela?.[p.nome]; return v ? { ...p, data: v.data, estimada: v.estimada } : { ...p }; })];
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

if (typeof CRONOGRAMA !== 'undefined' && (S.cronoV !== CRONOGRAMA.v || (S.cronoV >= 3 && S.cronoCen !== cenarioDe()))) {
  const n = aplicarCronograma();
  ui.iaMsg = `O cronograma novo (v${CRONOGRAMA.v}) está no app: ${n} itens até setembro, com conteúdo, revisões, hábitos e simulados. O plano antigo ficou guardado em Ajustes > Cópias do plano.`;
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
    if (ehConteudo(a)) {
      if (a.teoria != null && a.teoria < 25) a.teoria = 25;
      if (a.q != null && a.q < 8) a.q = 8;
    }
    if (a.habito === 'enem' && a.min && a.min < 75) a.min = 75;
  }
}

// até o dia seguinte ao ENEM o dia é livre: o cronograma só entra a partir de 16/11 (pedido em 31/10); nos dias de limpeza não entra conteúdo novo
const CRONO_LIBERA = '2026-11-16';
{ const f0 = filaParaHoje; filaParaHoje = function () {
  let l = f0.apply(this, arguments);
  if (hoje() < CRONO_LIBERA) l = l.filter(a => !a.crono);
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
