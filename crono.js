'use strict';
/* Cronograma definitivo da Uany (cronograma.js, gerado no PC): a partir de 20/11/2026 ele vira o plano do app. Aplica uma vez por
   versão, com cópia de segurança do plano anterior; o que ela planejou na aba Planejamento (períodos) continua valendo.
   Cada tópico vem dividido em partes de até 2h30 (a revisão espaçada só começa na última parte); hábitos e simulados têm dia e tempo fixos.
   Antes do início, o dia não puxa nada do cronograma; nos dias de "limpeza" (a cada 6 semanas) não entra conteúdo novo. */

function aplicarCronograma() {
  const C = CRONOGRAMA;
  if (typeof copiarPlano === 'function') copiarPlano(`${hoje()} ${agoraHm()} · antes do cronograma v${C.v}`);
  const feitos = new Set(S.assuntos.filter(a => a.crono && a.feito).map(a => a.id));
  const novos = C.itens.map(x => {
    const a = { ...x, ord: x.ord ?? 0.5, feito: feitos.has(x.id) };
    if (x.min_ != null) {               // conteúdo: ~40% teoria e o resto em questões (o app recalcula pelo ritmo dela)
      a.teoria = x.teoria; a.q = Math.max(3, Math.round((x.min_ - x.teoria) / ((MIN_Q[x.materia] || 2.5) * 1.25))); a.calibrado = true;
      delete a.min_;
    }
    return a;
  });
  S.assuntos = [...S.assuntos.filter(a => a.periodo || (a.feito && !a.crono && a.feitoEm)), ...novos];
  S.fases = C.fases.map(f => ({ ...f }));
  S.provas = [...(S.provas || []).filter(p => p.data && p.data < '2027-01-01'), ...C.provas.map(p => ({ ...p }))];
  // foco de cada mês: o que começa nas matérias principais
  S.meses = {};
  for (const m of [...new Set(novos.map(a => a.mes))]) {
    const ini = ['Biologia', 'Química', 'Física', 'Matemática'].map(mat => novos.find(a => a.mes === m && a.materia === mat && a.parte?.[0] === 1)?.nome).filter(Boolean);
    S.meses[m] = { foco: ini.length ? `Começa: ${ini.join('; ')}.` : '' };
  }
  S.cronoV = C.v; S.cronoInicio = C.inicio; S.diasLimpeza = C.limpeza; S.semeado = true;
  salvar();
  return novos.length;
}

if (typeof CRONOGRAMA !== 'undefined' && S.cronoV !== CRONOGRAMA.v) {
  const n = aplicarCronograma();
  ui.iaMsg = `O cronograma novo está no app: ${n} itens de ${diaCurto(CRONOGRAMA.inicio)} a junho, mais revisões, simulados e hábitos. O plano antigo ficou guardado em Ajustes > Cópias do plano.`;
}

// o dia respeita o começo do cronograma e os dias de limpeza
{ const f0 = filaParaHoje; filaParaHoje = function () {
  let l = f0.apply(this, arguments);
  if (S.cronoInicio && hoje() < S.cronoInicio) l = l.filter(a => !a.crono);
  if ((S.diasLimpeza || []).includes(hoje())) l = l.filter(a => !ehConteudo(a) || estadoDe(a) === 'atrasado');
  return l;
}; }
