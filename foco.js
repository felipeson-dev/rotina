'use strict';
/* Foco: diário de distrações. O iPad não deixa um app da web ler o "Tempo de Uso" sozinho, então há dois caminhos:
   registrar na hora (com cronômetro) ou mandar uma captura da tela Tempo de Uso para a IA ler. Cada registro tem o motivo
   e o gatilho; no fim da semana o app mostra onde o tempo foi e o que mais se repete. */

ICONES.foco = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>';
S.foco ||= []; S.focoAnalise ||= {};
const APPS_FOCO = ['Instagram', 'TikTok', 'YouTube', 'WhatsApp', 'Shein', 'Netflix', 'Jogos', 'Pinterest', 'X (Twitter)', 'Outro'];
const GATILHOS = ['Tédio', 'Ansiedade', 'Cansaço', 'Fugindo de matéria difícil', 'Notificação', 'Pausa que passou do tempo', 'Sem ânimo', 'Companhia / social', 'Recompensa', 'Não sei'];
const HUMORES = [['😖', 'péssimo'], ['😕', 'ruim'], ['😐', 'normal'], ['🙂', 'bom'], ['😄', 'ótimo']];
ui.focoSem = 0; ui.focoAba = 'semana'; ui.focoImp = null;
ui.focoForm = { app: '', outro: '', min: 15, gatilho: '', motivo: '', evitando: '', humor: 0 };

const focoAgora = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const semFoco = () => somaDias(semAtual(), ui.focoSem * 7);
const itensSem = w => S.foco.filter(f => f.dia >= w && f.dia <= somaDias(w, 6));
const agrupa = (l, chave, valor = f => f.min) => { const o = {}; for (const f of l) { const k = chave(f); o[k] = (o[k] || 0) + valor(f); } return Object.entries(o).sort((a, b) => b[1] - a[1]); };

function barrasFoco(lista, total, cor = 'var(--rosa)') {
  if (!lista.length) return '<p class="fraco" style="margin:0">Nada registrado ainda.</p>';
  return lista.map(([k, v]) => `<div class="foco-linha"><span>${esc(k)}</span><span class="fraco">${fmtMin(v)}</span><div class="barra"><i style="width:${Math.round(v / total * 100)}%;background:${cor}"></i></div></div>`).join('');
}

function vFoco() {
  const f = ui.focoForm, t = S.focoTimer;
  const hoje0 = hoje();
  const timer = t ? `<div class="cartao foco-timer"><span class="rotulo">cronômetro</span><h2 id="foco-tempo">${Math.max(1, Math.round((Date.now() - t.ini) / 60000))} min</h2><span>Você pegou o celular às ${t.hora}. Quando parar, me conta o que aconteceu.</span>
    <div class="linha"><button class="botao grande" data-acao="focoParei">Parei</button><button class="botao contorno" data-acao="focoCancelaTimer">Cancelar</button></div></div>` : '';
  const pend = S.foco.filter(x => !x.gatilho).length;
  const form = `<section class="cartao"><h2>Registrar uma distração</h2>
    <p class="fraco" style="margin:0">Sem julgamento: o objetivo é entender o que puxa você para o celular.</p>
    <div class="linha">${t ? '' : '<button class="botao claro" data-acao="focoTimer">▶ Peguei o celular agora</button>'}<span class="fraco" style="font-size:14px">${t ? '' : 'ou anote depois:'}</span></div>
    <div class="coluna" style="gap:8px"><span class="rotulo">onde</span><div class="linha">${APPS_FOCO.map(a => `<button class="chip" data-acao="focoApp" data-v="${esc(a)}" aria-pressed="${f.app === a}">${esc(a)}</button>`).join('')}</div>
      ${f.app === 'Outro' ? `<input type="text" data-fform="outro" value="${esc(f.outro)}" placeholder="Qual app ou atividade?">` : ''}</div>
    <div class="linha"><span class="fraco">Quanto tempo:</span>${stepperHtml('foco-min', f.min, 1, 600)}<span class="fraco">min</span>${[5, 10, 15, 30, 60].map(n => `<button class="chip" data-acao="focoMin" data-v="${n}" aria-pressed="${f.min === n}">${n}</button>`).join('')}</div>
    <div class="coluna" style="gap:8px"><span class="rotulo">o que puxou (gatilho)</span><div class="linha">${GATILHOS.map(g => `<button class="chip" data-acao="focoGat" data-v="${esc(g)}" aria-pressed="${f.gatilho === g}">${esc(g)}</button>`).join('')}</div></div>
    <label class="campo">O que você deveria estar fazendo?<input type="text" data-fform="evitando" value="${esc(f.evitando)}" placeholder="Ex.: Química, ligações químicas" list="foco-mats"><datalist id="foco-mats">${Object.keys(MATERIAS).map(m => `<option>${m}</option>`).join('')}</datalist></label>
    <label class="campo">Justificativa<textarea data-fform="motivo" placeholder="Ex.: 30 min na Shein porque vi uma promoção e fiquei sem vontade de começar o exercício" style="min-height:80px">${esc(f.motivo)}</textarea></label>
    <div class="linha"><span class="fraco">Como estava:</span>${HUMORES.map(([e, n], i) => `<button class="chip" data-acao="focoHumor" data-v="${i + 1}" aria-pressed="${f.humor === i + 1}" title="${n}">${e}</button>`).join('')}</div>
    <div class="linha"><button class="botao grande" data-acao="focoSalvar">Salvar registro</button></div></section>`;
  const imp = `<section class="cartao"><h2>Ler o Tempo de Uso do iPad</h2>
    <p class="fraco" style="margin:0">O iPad não deixa o app ver o Tempo de Uso sozinho. Faça uma captura de tela de <b>Ajustes → Tempo de Uso</b> e mande aqui: a IA lê os apps e os minutos, e você só justifica.</p>
    <label class="botao claro" style="display:inline-flex;align-items:center;align-self:flex-start">Escolher a captura<input type="file" accept="image/*" data-acao-arquivo="focoImagem" hidden></label>
    ${ui.focoImp ? `<div class="coluna" style="gap:8px"><span class="rotulo">encontrei (${esc(ui.focoImp.periodo || 'período não identificado')}) · marque o que quer registrar</span>
      ${ui.focoImp.apps.map((a, i) => `<label class="cg-item"><input type="checkbox" data-acao="focoImpMarca" data-i="${i}" ${a.sel ? 'checked' : ''}><span><b>${esc(a.app)}</b> · ${fmtMin(a.minutos)}</span></label>`).join('')}
      <div class="linha"><label class="campo" style="flex:0 1 180px">Dia a que se refere<input type="date" id="foco-imp-dia" value="${hoje0}"></label><button class="botao" data-acao="focoImpAdd">Registrar os marcados</button><button class="botao contorno" data-acao="focoImpDesc">Descartar</button></div></div>` : ''}</section>`;
  const abas = `<div class="alterna" role="group">${[['semana', 'Minha semana'], ['registros', `Registros${pend ? ` · ${pend} a justificar` : ''}`]].map(([v, t]) => `<button data-acao="focoAba" data-v="${v}" aria-pressed="${ui.focoAba === v}">${t}</button>`).join('')}</div>`;
  return `<header class="entre"><div class="coluna" style="gap:4px"><span class="rotulo">foco</span><h1>O que te distrai</h1></div>${abas}</header>${avisoIa()}${timer}
    ${ui.focoAba === 'registros' ? focoRegistros() : focoSemanaHtml() + form + imp}`;
}

function focoRegistros() {
  const l = S.foco.slice().sort((a, b) => (a.dia + a.hora) < (b.dia + b.hora) ? 1 : -1).slice(0, 80);
  if (!l.length) return '<section class="cartao"><p class="fraco" style="margin:0">Nenhum registro ainda.</p></section>';
  return `<section class="cartao"><h2>Registros</h2>${l.map(x => `<div class="foco-reg ${x.gatilho ? '' : 'falta'}"><div class="entre"><strong>${esc(x.app)} · ${fmtMin(x.min)}</strong><span class="fraco" style="font-size:13px">${rotuloDia(x.dia)}${x.hora ? ' · ' + x.hora : ''}</span></div>
    ${x.gatilho ? `<span class="selo">${esc(x.gatilho)}</span>` : '<span class="selo atraso">falta justificar</span>'}${x.evitando ? `<span class="fraco" style="font-size:14px"> evitando: ${esc(x.evitando)}</span>` : ''}
    ${x.motivo ? `<p style="margin:4px 0 0">${esc(x.motivo)}</p>` : ''}
    <div class="linha">${x.gatilho ? '' : `<button class="link" data-acao="focoJust" data-id="${x.id}">Justificar</button>`}<button class="link" data-acao="focoApaga" data-id="${x.id}">Apagar</button></div></div>`).join('')}</section>`;
}

function focoSemanaHtml() {
  const w = semFoco(), fim = somaDias(w, 6), l = itensSem(w), tot = soma(l, x => x.min), ant = soma(itensSem(somaDias(w, -7)), x => x.min);
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(w, i));
  const porDia = dias.map(d => [d, soma(l.filter(x => x.dia === d), x => x.min), S.estudo[d] || 0]);
  const maxD = Math.max(60, ...porDia.map(x => Math.max(x[1], x[2])));
  const porApp = agrupa(l, x => x.app), porGat = agrupa(l, x => x.gatilho || '(sem justificativa)'), porEvit = agrupa(l.filter(x => x.evitando), x => x.evitando);
  const horas = Array.from({ length: 24 }, (_, h) => soma(l.filter(x => x.hora && +x.hora.slice(0, 2) === h), x => x.min)), maxH = Math.max(1, ...horas);
  const comp = ant ? (tot > ant ? `↑ ${fmtMin(tot - ant)} a mais que na semana anterior` : tot < ant ? `↓ ${fmtMin(ant - tot)} a menos que na semana anterior` : 'igual à semana anterior') : '';
  const an = S.focoAnalise[w];
  return `<div class="entre"><div class="linha"><button class="botao contorno" data-acao="focoSemana" data-v="-1" aria-label="Semana anterior">‹</button>
      <strong>${deIso(w).getDate()}/${pad(deIso(w).getMonth() + 1)} a ${deIso(fim).getDate()}/${pad(deIso(fim).getMonth() + 1)}${ui.focoSem === 0 ? ' (esta semana)' : ''}</strong>
      <button class="botao contorno" data-acao="focoSemana" data-v="1" aria-label="Próxima semana" ${ui.focoSem >= 0 ? 'disabled' : ''}>›</button></div></div>
    <section class="cartao"><div class="resumo-dia"><div><strong>${fmtMin(tot)}</strong><span>no celular (registrado)</span></div><div><strong>${l.length}</strong><span>registros</span></div><div><strong>${fmtMin(soma(dias, d => S.estudo[d] || 0))}</strong><span>de assuntos concluídos</span></div></div>
      ${comp ? `<p class="fraco" style="margin:0">${comp}</p>` : ''}
      <div class="foco-dias">${porDia.map(([d, m, e]) => `<div><div class="duplas"><i class="est" style="height:${Math.round(e / maxD * 100)}%" title="estudo ${fmtMin(e)}"></i><i class="dis" style="height:${Math.round(m / maxD * 100)}%" title="celular ${fmtMin(m)}"></i></div><span>${SEMANA[deIso(d).getDay()].slice(0, 3)}</span><small>${m ? fmtMin(m) : '·'}</small></div>`).join('')}</div>
      <div class="linha legenda-caminho"><span class="lg-q est"></span>assuntos concluídos <span class="lg-q dis"></span>distração</div></section>
    <div class="grade2"><section class="cartao"><h2>Onde o tempo foi</h2>${barrasFoco(porApp, tot || 1)}</section>
      <section class="cartao"><h2>O que puxou (gatilhos)</h2>${barrasFoco(porGat, tot || 1, '#E8890C')}</section></div>
    ${porEvit.length ? `<section class="cartao"><h2>O que você estava evitando</h2>${barrasFoco(porEvit, tot || 1, '#7048E8')}</section>` : ''}
    <section class="cartao"><h2>Em que horas acontece</h2><div class="foco-horas">${horas.map((m, h) => `<div title="${h}h: ${fmtMin(m)}"><i style="height:${Math.round(m / maxH * 100)}%"></i><small>${h % 3 === 0 ? h : ''}</small></div>`).join('')}</div></section>
    <section class="cartao"><div class="entre"><h2>Análise da semana</h2><button class="botao" data-acao="focoAnalisar" ${l.length < 3 ? 'disabled' : ''}>${an ? 'Analisar de novo' : 'Analisar com a IA'}</button></div>
      ${l.length < 3 ? '<p class="fraco" style="margin:0">Registre pelo menos 3 distrações na semana para a IA achar padrões.</p>' : ''}
      ${an ? `<p style="margin:0">${esc(an.resumo || '')}</p>${an.gatilhos?.length ? `<div><span class="rotulo">principais gatilhos</span><ul>${an.gatilhos.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${an.padroes?.length ? `<div><span class="rotulo">padrões</span><ul>${an.padroes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${an.sugestoes?.length ? `<div><span class="rotulo">para tentar</span><ul>${an.sugestoes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}` : ''}</section>`;
}

Object.assign(VIEWS, { foco: vFoco });
Object.assign(ACOES, {
  focoAba: el => { ui.focoAba = el.dataset.v; render(); },
  focoSemana: el => { ui.focoSem = Math.min(0, ui.focoSem + +el.dataset.v); render(); },
  focoApp: el => { ui.focoForm.app = el.dataset.v; render(); },
  focoMin: el => { ui.focoForm.min = +el.dataset.v; render(); },
  focoGat: el => { ui.focoForm.gatilho = ui.focoForm.gatilho === el.dataset.v ? '' : el.dataset.v; render(); },
  focoHumor: el => { ui.focoForm.humor = ui.focoForm.humor === +el.dataset.v ? 0 : +el.dataset.v; render(); },
  focoTimer: () => { S.focoTimer = { ini: Date.now(), hora: focoAgora() }; salvar(); render(); },
  focoCancelaTimer: () => { S.focoTimer = null; salvar(); render(); },
  focoParei: () => { const t = S.focoTimer; ui.focoForm.min = Math.max(1, Math.round((Date.now() - t.ini) / 60000)); ui.focoForm.hora = t.hora; S.focoTimer = null; salvar(); ui.iaMsg = `Foram ${ui.focoForm.min} min. Agora me conta onde e por quê.`; render(); },
  focoSalvar: () => {
    const f = ui.focoForm, app = f.app === 'Outro' ? (f.outro || 'Outro') : f.app;
    const min = Math.round(+document.getElementById('foco-min')?.value || f.min);
    if (!app) { ui.iaMsg = 'Escolha onde foi (Instagram, Shein, YouTube…).'; render(); return; }
    S.foco.push({ id: uid(), dia: hoje(), hora: f.hora || focoAgora(), app, min, gatilho: f.gatilho, motivo: f.motivo.trim(), evitando: f.evitando.trim(), humor: f.humor });
    ui.focoForm = { app: '', outro: '', min: 15, gatilho: '', motivo: '', evitando: '', humor: 0 }; salvar();
    ui.iaMsg = f.gatilho ? 'Registrado. Obrigada por ser sincera: é assim que dá para entender o padrão.' : 'Registrado. Falta só dizer o que puxou, em "Registros".'; render();
  },
  focoJust: el => {
    const x = S.foco.find(y => y.id === el.dataset.id); if (!x) return;
    abrirModal(`<div class="entre"><h2>${esc(x.app)} · ${fmtMin(x.min)}</h2><button class="x" data-acao="fechar" aria-label="Fechar">×</button></div>
      <div class="coluna" style="gap:8px"><span class="rotulo">o que puxou</span><div class="linha">${GATILHOS.map(g => `<button class="chip" data-acao="focoJustGat" data-id="${x.id}" data-v="${esc(g)}" aria-pressed="${x.gatilho === g}">${esc(g)}</button>`).join('')}</div></div>
      <label class="campo">O que você deveria estar fazendo?<input type="text" id="j-evit" value="${esc(x.evitando)}"></label><label class="campo">Justificativa<textarea id="j-motivo">${esc(x.motivo)}</textarea></label>
      <div class="linha"><button class="botao" data-acao="focoJustSalvar" data-id="${x.id}">Salvar</button></div>`);
  },
  focoJustGat: el => { const x = S.foco.find(y => y.id === el.dataset.id); if (x) { x.gatilho = el.dataset.v; document.querySelectorAll('[data-acao="focoJustGat"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === x.gatilho)); } },
  focoJustSalvar: el => { const x = S.foco.find(y => y.id === el.dataset.id); if (x) { x.evitando = $('#j-evit').value.trim(); x.motivo = $('#j-motivo').value.trim(); salvar(); } fecharModal(); render(); },
  focoApaga: el => { S.foco = S.foco.filter(x => x.id !== el.dataset.id); salvar(); render(); },
  focoImpMarca: el => { const a = ui.focoImp?.apps[+el.dataset.i]; if (a) a.sel = el.checked; },
  focoImpDesc: () => { ui.focoImp = null; render(); },
  focoImpAdd: () => {
    const dia = okData($('#foco-imp-dia')?.value) ? $('#foco-imp-dia').value : hoje(), sel = ui.focoImp.apps.filter(a => a.sel);
    for (const a of sel) S.foco.push({ id: uid(), dia, hora: '', app: a.app, min: Math.round(a.minutos), gatilho: '', motivo: '', evitando: '', humor: 0, importado: true });
    ui.focoImp = null; salvar(); ui.focoAba = 'registros'; ui.iaMsg = `${sel.length} registros importados. Toque em "Justificar" em cada um para dizer o que puxou.`; render();
  },
  focoAnalisar: async () => {
    const w = semFoco(), l = itensSem(w); ui.carregando = 'Analisando a sua semana…'; render();
    try {
      const resumo = { semana: w, total_min: soma(l, x => x.min), estudo_min: soma(Array.from({ length: 7 }, (_, i) => somaDias(w, i)), d => S.estudo[d] || 0), por_app: agrupa(l, x => x.app), por_gatilho: agrupa(l, x => x.gatilho || 'sem justificativa'),
        evitando: agrupa(l.filter(x => x.evitando), x => x.evitando), registros: l.slice(-40).map(x => ({ dia: x.dia, hora: x.hora, app: x.app, min: x.min, gatilho: x.gatilho, motivo: x.motivo, evitando: x.evitando, humor: x.humor })) };
      const r = await chamarIa(`Analise a semana de distrações de uma estudante de vestibular, com gentileza e sem julgamento, em português do Brasil. Dados (JSON): ${JSON.stringify(resumo)}.
Responda SÓ com JSON: {"resumo":"2 a 3 frases sobre a semana","gatilhos":["os 2 ou 3 gatilhos que mais pesaram, com números"],"padroes":["padrões concretos: horários, dias, matérias evitadas, ligação com humor"],"sugestoes":["3 ações pequenas e específicas para a próxima semana"]}`, 2500, [], 'texto');
      S.focoAnalise[w] = { resumo: String(r.resumo || ''), gatilhos: (r.gatilhos || []).map(String), padroes: (r.padroes || []).map(String), sugestoes: (r.sugestoes || []).map(String) }; salvar();
    } catch (e) { ui.iaMsg = `Não consegui analisar agora (${e.message}).`; }
    ui.carregando = ''; render();
  },
});
document.addEventListener('input', e => { const k = e.target.dataset?.fform; if (k) ui.focoForm[k] = e.target.value; if (e.target.id === 'foco-min') ui.focoForm.min = Math.max(1, Math.round(+e.target.value) || 1); });
document.addEventListener('change', async e => {
  const el = e.target; if (el.dataset?.acaoArquivo !== 'focoImagem' || !el.files?.[0]) return;
  ui.carregando = 'Lendo a captura de tela…'; ui.iaMsg = ''; render();
  try {
    const img = await fotoComprimida(el.files[0], 1600);
    const r = await iaComImagem(`Esta imagem é uma captura da tela "Tempo de Uso" do iPhone/iPad. Liste cada app que aparece com o tempo de uso em MINUTOS (converta horas e minutos). Ignore totais e categorias genéricas (se só aparecerem categorias, liste as categorias). Diga se o período é "dia" ou "semana" (ou vazio se não der para saber). Responda SÓ com JSON: {"periodo":"dia","apps":[{"app":"nome","minutos":0}]}`, img, 3000);
    const apps = (r.apps || []).filter(a => a.app && +a.minutos > 0).map(a => ({ app: String(a.app).slice(0, 40), minutos: Math.round(+a.minutos), sel: true }));
    if (!apps.length) throw new Error('não achei apps na imagem');
    ui.focoImp = { periodo: r.periodo || '', apps };
  } catch (err) { ui.iaMsg = `Não consegui ler a captura (${err.message}).`; }
  ui.carregando = ''; render();
});
setInterval(() => { const el = document.getElementById('foco-tempo'); if (el && S.focoTimer) el.textContent = Math.max(1, Math.round((Date.now() - S.focoTimer.ini) / 60000)) + ' min'; }, 15000);
render();
