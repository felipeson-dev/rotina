'use strict';
/* Plano base: assuntos de Medicina em SP (matriz Fuvest/Vunesp + ENEM), distribuídos pelos meses.
   As datas de 2027 são ESTIMADAS pelo padrão de 2026 até saírem os editais. */

const PROVAS_BASE = [
  { nome: 'ENEM, 1º dia', data: '2026-11-08' },
  { nome: 'ENEM, 2º dia', data: '2026-11-15' },
  { nome: 'Santa Casa SP', data: '2027-09-25', estimada: true },
  { nome: 'Albert Einstein', data: '2027-10-10', estimada: true },
  { nome: 'USP (Fuvest), 1ª fase', data: '2027-11-07', estimada: true },
  { nome: 'São Camilo', data: '2027-11-27', estimada: true },
  { nome: 'USP (Fuvest), 2ª fase', data: '2027-12-05', estimada: true },
  { nome: 'UNIFESP', data: '', estimada: true },
  { nome: 'FMABC', data: '', estimada: true },
];

const FIM_CONTEUDO = '2027-06';
const FASES_BASE = [
  { nome: 'Base', inicio: '2026-10', fim: '2027-02', objetivo: 'Ver todo o conteúdo pela primeira vez, com exercícios simples.' },
  { nome: 'Aprofundamento', inicio: '2027-03', fim: '2027-06', objetivo: 'Terminar o conteúdo e começar a resolver provas de Fuvest e Vunesp.' },
  { nome: 'Revisão', inicio: '2027-07', fim: '2027-08', objetivo: 'Revisar matéria por matéria, atacando os erros do caderno.' },
  { nome: 'Reta final', inicio: '2027-09', fim: '2027-12', objetivo: 'Simulados cronometrados, redação e manter o ritmo.' },
];

const CONTEUDO = {
  'Biologia': ['Química da vida: água, sais, carboidratos, lipídios', 'Proteínas e enzimas', 'Ácidos nucleicos: DNA e RNA', 'Citologia: membrana e transporte', 'Organelas e metabolismo energético', 'Respiração celular e fermentação', 'Fotossíntese e quimiossíntese', 'Núcleo, ciclo celular, mitose e meiose', 'Síntese de proteínas e código genético', 'Biotecnologia: DNA recombinante, PCR, CRISPR', 'Embriologia e histologia animal', '1ª e 2ª leis de Mendel', 'Heranças: ligada ao sexo, alelos múltiplos, ABO e Rh', 'Ligação gênica, interação gênica e genética de populações', 'Evolução: Darwin, seleção natural e especiação', 'Origem da vida e tempo geológico', 'Classificação e vírus', 'Bactérias, protozoários e doenças', 'Fungos e algas', 'Botânica: briófitas e pteridófitas', 'Botânica: gimnospermas e angiospermas', 'Fisiologia vegetal: hormônios e tropismos', 'Zoologia: invertebrados', 'Zoologia: cordados', 'Digestão e nutrição humana', 'Respiração e circulação humana', 'Excreção e homeostase', 'Sistema nervoso e órgãos dos sentidos', 'Sistema endócrino e reprodução humana', 'Imunologia: vacinas e soros', 'Ecologia: cadeias, ciclos e pirâmides', 'Relações ecológicas e sucessão', 'Biomas brasileiros e impacto ambiental'],
  'Química': ['Matéria, substâncias e separação de misturas', 'Modelos atômicos e distribuição eletrônica', 'Tabela periódica e propriedades periódicas', 'Ligações químicas', 'Geometria molecular e polaridade', 'Forças intermoleculares e propriedades físicas', 'Funções inorgânicas: ácidos, bases, sais e óxidos', 'Reações inorgânicas e balanceamento', 'Cálculo estequiométrico e mol', 'Gases', 'Soluções e concentrações', 'Propriedades coligativas', 'Termoquímica', 'Cinética química', 'Equilíbrio químico', 'Equilíbrio iônico: pH e pOH', 'Eletroquímica: pilhas', 'Eletrólise', 'Radioatividade', 'Química orgânica: hidrocarbonetos e nomenclatura', 'Funções orgânicas oxigenadas e nitrogenadas', 'Isomeria plana e espacial', 'Reações orgânicas: substituição e adição', 'Reações orgânicas: oxidação, redução e esterificação', 'Polímeros, lipídios, carboidratos e proteínas', 'Química ambiental e energia'],
  'Física': ['Cinemática: MU e MUV', 'Vetores e movimento em duas dimensões', 'Lançamentos e movimento circular', 'Leis de Newton', 'Atrito, plano inclinado e força centrípeta', 'Trabalho, energia e potência', 'Impulso e quantidade de movimento', 'Gravitação', 'Estática e hidrostática', 'Hidrodinâmica', 'Termologia: calor e dilatação', 'Calorimetria e mudanças de fase', 'Gases e termodinâmica', 'Ondas e acústica', 'Óptica geométrica: espelhos', 'Óptica geométrica: lentes e olho humano', 'Eletrostática', 'Campo e potencial elétrico', 'Corrente, resistores e circuitos', 'Potência elétrica e consumo', 'Magnetismo e força magnética', 'Indução eletromagnética', 'Física moderna'],
  'Matemática': ['Conjuntos e conjuntos numéricos', 'Razão, proporção e regra de três', 'Porcentagem e juros', 'Funções: conceito e afim', 'Função quadrática', 'Função exponencial', 'Logaritmos', 'Funções trigonométricas', 'Trigonometria no triângulo e ciclo', 'Equações e inequações', 'Progressão aritmética e geométrica', 'Análise combinatória', 'Probabilidade', 'Estatística: média, mediana, desvio', 'Matrizes e determinantes', 'Sistemas lineares', 'Geometria plana: áreas e semelhança', 'Geometria espacial: prismas e pirâmides', 'Geometria espacial: cilindro, cone e esfera', 'Geometria analítica: reta', 'Geometria analítica: circunferência e cônicas', 'Números complexos', 'Polinômios', 'Binômio de Newton'],
  'História': ['Antiguidade: Grécia e Roma', 'Idade Média e feudalismo', 'Renascimento e Reformas', 'Absolutismo e mercantilismo', 'Expansão marítima e colonização', 'Brasil Colônia: economia e sociedade', 'Iluminismo e Revolução Francesa', 'Revolução Industrial', 'Independência das Américas e do Brasil', 'Brasil Império', 'Imperialismo e Primeira Guerra', 'Revolução Russa e entreguerras', 'República Velha', 'Era Vargas', 'Segunda Guerra e Guerra Fria', 'Ditadura militar brasileira', 'Redemocratização e Brasil atual', 'História da África e escravidão'],
  'Geografia': ['Cartografia e orientação', 'Geologia, relevo e solos', 'Climatologia e fenômenos climáticos', 'Hidrografia', 'Biomas e questão ambiental', 'População: demografia e migrações', 'Urbanização', 'Agropecuária no Brasil e no mundo', 'Industrialização e matriz energética', 'Globalização e blocos econômicos', 'Geopolítica e conflitos atuais', 'Brasil: regiões e economia'],
  'Português': ['Interpretação de texto e tipologia', 'Gêneros textuais e funções da linguagem', 'Coesão e coerência', 'Morfologia e classes de palavras', 'Sintaxe: período simples', 'Sintaxe: período composto', 'Concordância, regência e crase', 'Figuras de linguagem'],
  'Literatura': ['Trovadorismo, Humanismo e Classicismo', 'Barroco e Arcadismo', 'Romantismo: poesia e prosa', 'Realismo e Naturalismo', 'Parnasianismo e Simbolismo', 'Pré-Modernismo e Modernismo (1ª e 2ª fase)', 'Modernismo (3ª fase) e Contemporânea', 'Leituras obrigatórias da Fuvest'],
  'Inglês': ['Interpretação de textos em inglês', 'Vocabulário, cognatos e falsos cognatos', 'Tempos verbais e voz passiva', 'Conectivos e pronomes'],
  'Filosofia': ['Filosofia antiga e medieval', 'Filosofia moderna e contemporânea'],
  'Sociologia': ['Clássicos: Durkheim, Marx e Weber', 'Cultura, desigualdade e cidadania'],
};

const TEMAS_REDACAO = ['Desafios da saúde mental', 'Acesso à saúde pública', 'Desinformação e redes sociais', 'Desigualdade social', 'Educação no Brasil', 'Meio ambiente e clima', 'Violência contra a mulher', 'Envelhecimento da população', 'Tecnologia e trabalho', 'Racismo estrutural', 'Fome e segurança alimentar', 'Cultura e identidade'];

/** Cria fases, foco dos meses e assuntos a partir de `inicio` (AAAA-MM-DD). Não mexe no perfil. */
function montarPlanoBase(inicio) {
  const m0 = mesDe(inicio);
  const meses = [];
  for (let m = m0; m <= FIM_CONTEUDO; m = somaMes(m, 1)) meses.push(m);
  // o 1º mês pesa só pelos dias que restam
  const d0 = deIso(inicio), diasMes = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
  const pesos = meses.map((_, i) => i ? 1 : Math.max(0.25, (diasMes - d0.getDate() + 1) / diasMes));
  const total = pesos.reduce((a, b) => a + b, 0);
  const limites = []; let ac = 0;
  for (const p of pesos) { ac += p / total; limites.push(ac); }

  const assuntos = [];
  const novo = (mes, materia, titulo) => assuntos.push({ id: uid(), mes, materia, titulo, dia: null, feito: false, atrasou: 0 });
  for (const [materia, lista] of Object.entries(CONTEUDO)) {
    lista.forEach((t, i) => {
      const pos = (i + 0.5) / lista.length;
      novo(meses[Math.max(0, limites.findIndex(l => pos <= l + 1e-9))] || meses[meses.length - 1], materia, t);
    });
  }
  // redação: um tema por semana ao longo do estudo
  let k = 0;
  for (const m of meses) for (let s = 0; s < 4; s++) novo(m, 'Redação', `Redação ${k + 1}: ${TEMAS_REDACAO[k++ % TEMAS_REDACAO.length]}`);

  // revisão e reta final
  const rev = ['Biologia', 'Química', 'Física', 'Matemática', 'História', 'Geografia', 'Português', 'Literatura'];
  ['2027-07', '2027-08'].forEach((m, j) => {
    rev.forEach((mat, i) => { if (i % 2 === j) { novo(m, mat, `Revisão geral de ${mat}: erros do caderno`); novo(m, mat, `Questões de provas antigas: ${mat}`); } });
    for (let s = 0; s < 4; s++) novo(m, 'Redação', `Redação de revisão ${j * 4 + s + 1}: ${TEMAS_REDACAO[(k++) % TEMAS_REDACAO.length]}`);
  });
  ['2027-09', '2027-10', '2027-11', '2027-12'].forEach(m => {
    for (let s = 1; s <= 2; s++) novo(m, 'Matemática', `Simulado ${m.slice(5)}/${s}: exatas`);
    novo(m, 'Biologia', `Simulado ${m.slice(5)}: biológicas e química`);
    novo(m, 'Português', `Simulado ${m.slice(5)}: humanas e linguagens`);
    for (let s = 0; s < 3; s++) novo(m, 'Redação', `Redação ${m.slice(5)}/${s + 1}: ${TEMAS_REDACAO[(k++) % TEMAS_REDACAO.length]}`);
  });

  const focos = {};
  for (const m of meses) {
    const ex = ['Biologia', 'Química', 'Física', 'Matemática'].map(mat => assuntos.find(a => a.mes === m && a.materia === mat)?.titulo).filter(Boolean);
    focos[m] = { foco: ex.length ? `Começa com ${ex.join('; ')}.` : '' };
  }
  focos['2027-07'] = { foco: 'Revisão: Biologia, Física, História e Português, mais questões antigas.' };
  focos['2027-08'] = { foco: 'Revisão: Química, Matemática, Geografia e Literatura, mais questões antigas.' };
  focos['2027-09'] = { foco: 'Santa Casa chegando. Simulados e redação toda semana.' };
  focos['2027-10'] = { foco: 'Einstein e Fuvest: simulados cronometrados e erros do caderno.' };
  focos['2027-11'] = { foco: 'Fuvest 1ª fase e São Camilo: manter o ritmo e descansar bem.' };
  focos['2027-12'] = { foco: 'Fuvest 2ª fase: redação e específicas.' };
  return { fases: FASES_BASE.map(f => ({ ...f })), meses: focos, assuntos };
}
