# Rotina: app de estudos (PWA) para o iPad da namorada do Felipe

Começado em 27/10/2026, num chat que era do app Ajudante. Este arquivo serve para continuar em outro chat.

## Orientações do Felipe
- App para o iPad dela, que estuda para o **vestibular**, **procrastina** e **não planeja bem**. Ela usa **Apple Pencil**.
- **A estética é muito importante.** Ela gosta de **rosa claro**.
- Não precisa ser igual ao Ajudante nem tão restritivo.
- Planejamento em camadas:
  - **Ano:** o ano inteiro até a prova, com um design muito bom.
  - **Mês:** todos os assuntos do mês, sem dia específico.
  - **Semana:** com dias específicos. O que atrasar passa para a semana seguinte e o mês ainda se completa, sem atrasar o todo.
  - **Dia:** perguntar o **contexto do dia** para planejar.
- IA inteligente que **reorganiza a distribuição** dos assuntos conforme necessário.
- Ela não tem acesso ao Claude, por isso existe uma área de configurações da IA (**"Do meu jeito"**). Ela escreve as preferências e isso entra no prompt.
- **Meta mínima para começar** ("Só 5 minutos").
- **Tarefas quebradas em passos** para ela ir marcando.
- **Timer** (depois avaliar se ficou bom).
- Apple Pencil: redação corrigida pelas 5 competências do ENEM, flashcards escritos à mão, folha de rascunho que vira tarefas. Aprovado, **fica para a v2**.
- **3 temas visuais escolhíveis** (Caderno, Noite calma, Cores das áreas). O padrão é o Caderno em rosa claro.
- Economizar tokens. Linguagem simples, em PT-BR.
- Tudo grátis: GitHub Pages e chave grátis do Gemini. O Felipe tem conta no GitHub, mas sabe pouco de git.

## Segurança
- As chaves do Gemini (2, grátis) **nunca vão no código**, porque o repositório é público. Ela cola as chaves em Ajustes e elas ficam só no iPad (localStorage `rotina.chaves`). Não repetir as chaves em lugar nenhum.
- Os dados dela ficam só no aparelho (localStorage `rotina.dados`). Para salvar ou restaurar, use a cópia de segurança em Ajustes.

## Estado atual (v1)
- Arquivos em `C:\rotina`: index.html, app.css, app.js, sw.js, manifest.webmanifest e ícones. É JavaScript puro, sem etapa de build.
- Telas: Hoje, Semana, Mês, Ano, Ajustes, mais o botão "Falar com a IA" em todas as telas.
- IA: Gemini chamado direto do navegador, modelos `gemini-3.8-flash` e depois `gemini-3.5-flash-lite`, testando chave 1 e depois chave 2. Uma chamada devolve JSON `{resposta, acoes[]}`.
  - Ações: marcar_dia, novo_assunto, mover_mes, feito, remover_assunto, blocos_hoje, foco_mes, fases, lembrar.
  - Toda mudança da IA tem **Desfazer**.
- Função `rolar()`: assunto com dia vencido volta para "Para encaixar"; mês vencido passa para o mês atual.
- Os temas mudam só pelo CSS (`[data-tema=caderno|noite|cores]`).
- Ao mudar arquivos, **subir `VERSAO` no sw.js**, para o iPad pegar a atualização.
- **Testado:** telas no Chrome headless (perfil temporário) com dados de exemplo.
- **Não testado:** a chamada real da IA (falta a chave), e o app no iPad.

## Publicado (27/10/2026)
- Git e gh instalados; login feito como felipeson-dev. Repo: https://github.com/felipeson-dev/rotina (público). Link do app: https://felipeson-dev.github.io/rotina/
- Para atualizar: subir `VERSAO` no sw.js, depois `git add -A; git commit -m ...; git push` (em C:\rotina; recarregar o PATH se o terminal for antigo).

## Próximos passos
1. (FEITO) Publicar no GitHub Pages. O PC não tem git nem gh. Proposta: instalar Git e GitHub CLI com o winget (pedir autorização ao Felipe), ele faz `gh auth login` uma vez, depois criar o repositório público e ativar o Pages.
2. No iPad: Safari → link → Compartilhar → "Adicionar à Tela de Início". Depois colar as chaves em Ajustes e tocar em "Testar a IA".
3. Ajustar conforme o uso dela.
4. v2: Apple Pencil (redação e flashcards à mão, rascunho que vira tarefas).

## Testar no PC
- `C:\rotina` servido com `python -m http.server <porta livre>`. A porta 8765 já está ocupada; use outra, por exemplo 18765.
- Chrome headless com `--user-data-dir` temporário. Nunca usar a janela do Felipe.
- Para semear dados de exemplo: um `teste.html` que grava `rotina.dados` e redireciona para `index.html#hoje|semana|mes|ano`. Ele fica fora da pasta do app.
- Prévia dos estilos: https://claude.ai/artifact/NqKPPEXQn2dis5xNBnUwHW

## v3 (27/10/2026): reformulação
- Plano base completo de Medicina SP em base.js (assuntos com `ord` e `min`). Provas em `S.provas` (datas de 2027 estimadas).
- Modelo novo: cada assunto tem `semana` prevista (segunda-feira), sem dia fixo. Hoje = fila (atrasados, semana, adiantar) preenchida pelas horas livres x 0,8 (x0,7 cansada, x0,5 sem vontade). Estudo feito por dia em `S.estudo`.
- Semana: progresso, selo "Adiantada", atrasados. Ano: Cartões e Mapa interativo. Tema único "cores" com acento e fundo personalizáveis. IA em formato de conversa (`S.chat`).
- Ao mudar o formato dos dados: `v` em VAZIO/carregar (v:2 refaz o plano base).
- Chaves só via link `#k=` ou Ajustes. gemini-3.8-flash às vezes dá 503: o app cai para gemini-3.5-flash-lite.
## v4 (27/10/2026): caneta, questões, tempos, caminho
- Novos arquivos: extras.js (questões, dia que se reabastece, calibração dos tempos, mapa Caminho) e pencil.js (quadro de escrita com Apple Pencil, rascunho->tarefas, redação ENEM 5 competências com visão do Gemini, cartões à mão com revisão espaçada, caderno por assunto). Desenhos em IndexedDB (não vão na cópia de segurança!).
- Tempo do assunto = teoria + questões x min/questão por matéria (MIN_Q) x 1,25; a IA calibra teoria/q/densidade (a.calibrado).
- Questões: registrar feitas/acertos; <70% agenda "Refazer os erros" na semana seguinte (S.qlog guarda o histórico).
- Modelos grátis (só Flash): gemini-3.8-flash > 3.6-flash > 3.5-flash > 3.5-flash-lite; visão sem o lite. Pro e Argon exigem pagamento.
- Teste: nunca matar todos os chrome.exe; só os com --user-data-dir de teste.
## v5 (27/10/2026)
- dia.js: aba "Meu dia" (texto livre ou só horas -> IA monta agenda; calculadora: estudo líquido x 0,8 x fator de energia; rotina base em perfil.horarios; replanejar mantém o feito). Hoje = lista de assuntos; `b.sug` é só sugestão de horário.
- IA por tarefa (rotaIa em app.js): texto = Llama (Groq/Cerebras/OpenRouter, chave em Ajustes, `rotina.llama`) > Gemini lite > flash; visão = Gemini flash. Cota esgotada (429) é pulada no dia (S.uso).
- Cadernos: aba Caderno > Cadernos (S.notas indexa por matéria; páginas livres; desenhos na cópia de segurança). Redação: digitar ou à mão + nota manual do professor.
- Caminho rosa com enchimento por minutos; selo "à frente do plano". Cores: prévia + "Salvar estas cores" (ui.coresPrev).
- Testes: python -m http.server em pasta temporária, Chrome headless com --user-data-dir temporário; matar só processos com esse perfil.
## v6 (27/10/2026)
- Ano: só Cartões e Caminho (provas só nos cartões). O Mapa agora fica no Mês (colunas por semana, Lista | Mapa). Caminho redesenhado: estrada rosa, anel de progresso e nº de assuntos que faltam por semana, fases, bandeiras de provas.
- questoes.js: aba Questões. ENEM real (api.enem.dev, CORS aberto, gabarito oficial) ou IA no estilo da banca (Fuvest, Vunesp…; podem ter erros). Caderno de erros (revisão em 3 dias), "Fiz por fora", tempo real por questão aprende o min/questão por matéria (S.tq; minPorQ).
- redacao.js: histórico de redações (texto/desenho + IA + correções de outras pessoas com foto), cartões digitados e gerador de cartões por IA. Substitui vRedacao/vCartoes do pencil.js (código antigo ficou lá, sem uso).
- dia.js: rotina base + o que contou hoje (substitui o item equivalente) + suposições visíveis.
- IA: gemini-3.5-flash-lite é o padrão para texto (2-3 s, bom JSON). OpenRouter free: 50 req/dia, lento, JSON falha: não usar. Chave OpenRouter do Felipe NÃO foi gravada em lugar nenhum.
## v7 (27/10/2026)
- banco.js: banco de questões local (IndexedDB 'banco:enem|ia|import'), filtros (banca, ano, área, matéria, não feitas/erradas/acertadas, quantidade, sorteio/ordem), download do ENEM inteiro (api.enem.dev, limit máx 50), IA gera e guarda, importar JSON (formato em "Como importar?"). Histórico por questão em S.qh. PENDENTE (combinado p/ depois): trazer VUNESP, bancas de SP e federais em grande volume; classificar questões do ENEM por matéria com IA (lite, lotes de 40).
- mais.js: Pendências (IA entende texto; avisos com o app aberto + .ics p/ o Calendário do iPad, único jeito de avisar com o app fechado sem servidor), metas diárias de questões por matéria (S.metaQ; padrão 50 mat/fís/quím e 100 nas demais), minutos por questão editáveis (S.minQ), tempo do assunto à mão (a.manual).
- Integração: setFeito sincroniza os passos do bloco de hoje nos dois sentidos. Rotina base só em Meu dia (Ajustes aponta para lá).
- Cartões: quantidade livre (1-50), pergunta rosa e resposta azul.
## v8 (27/10/2026): banco grande
- banco.js reescrito: IndexedDB "rotina-banco" (store q = questão completa, m = lista de fichas leves em memória). Filtros: grupos de bancas (SP, Medicina, "exigentes"), busca de banca, ano, matéria, dificuldade, assunto, área, novas/erradas/acertadas, sem figura. Resolução pela IA + caixa de dúvidas por questão (salvas na questão).
- ferramentas/montar_banco.py: baixa conjuntos abertos do Hugging Face e gera JSON em C:\rotina-banco (FORA do repositório; licença dos conjuntos é desconhecida, uso pessoal). Fontes: CEIA-POSITIVO/vestibular-gen_qa (15,3 mil, só História e Geografia, 354 bancas do país), BLUEX (USP/Unicamp sem figura), letmarchezi/unicamp_2019_2025, maritaca-ai/enem 2024. Com --token hf_xxx baixa também Fazzioni/Vestibular_65k_sem_imagem (65 mil, todas as matérias; conjunto "gated": exige conta grátis e aceitar os termos).
- datasets-server do HF limita pedidos (429): o script espera e guarda cache de páginas em C:\rotina-banco\cache (pode apagar depois).
- Teste: o Chrome headless com --virtual-time-budget NÃO espera IndexedDB; usar o controle por DevTools (scratchpad cdp.ps1) ou esperar em tempo real.
## v9 (27/10/2026)
- Banco: o conjunto de 65 mil (Fazzioni/Vestibular_65k_sem_imagem) rende 60.531 questões úteis em 8 matérias (História, Português, Biologia, Geografia, Química, Física, Sociologia, Filosofia) e 401 bancas; NÃO tem Matemática, Literatura separada nem Inglês. Matemática vem do ENEM (botão no app), de BLUEX/Unicamp e da IA. Arquivos em C:\rotina-banco (parte1..6); vestibulares-humanas.json é subconjunto (movido para \redundante). O app deduplica por conteúdo (chaveQ). pyarrow instalado só em C:\rotina-banco\libs (apagar a pasta desfaz).
- Gerar cartões e questões da IA: quantidade livre (contador − / +), em lotes. Cartões: pergunta rosa, resposta azul, conferido em foto.
- foco.js: aba Foco (diário de distrações: cronômetro, app, gatilho, justificativa, ler captura do Tempo de Uso com a IA, relatório semanal e análise). O iPad não deixa app web ler o Tempo de Uso sozinho.
- O token do Hugging Face foi colado no chat: usado só no PC para baixar; não gravar. Sugerir revogar.
## v10 (27/10/2026): figuras e fórmulas
- montar_banco.py agora traz figuras: UNESP/Vunesp 2014-2025 (985 questões, 424 com figura; repo lubashima/UNESP-University_Entrance_Exam-PTBR), Unicamp 2019-2025 (535, 200 com figura; images.rar extraído com tar), BLUEX USP/Unicamp (1018, 454 com figura). Imagens reduzidas a JPEG 860px q70 (~40 KB) e embutidas na questão (data URI). Pillow e pyarrow só em C:\rotina-banco\libs.
- Pacotes para o iPad em C:\rotina-banco\para-o-ipad (.json.gz, 71,7 MB no total; o app lê .gz): 1-com-figuras (46 MB), 2-Quimica-Fisica-Biologia, 3-Portugues-Sociologia-Filosofia, 4-Historia, 5-Geografia. Total ~63 mil questões.
- Fórmulas LaTeX das provas renderizam com KaTeX (cdnjs, cacheado pelo service worker).
- ENEM de enem.dev traz figuras por URL (precisa de internet).
## v11 (27/10/2026): verificação dos dados e questões oficiais
- VERIFICADO E DESCARTADO: (a) UNESP de lubashima: todas as questões sem a alternativa E e o gabarito E virou D (23 de 90 erradas em 2019, conferido com o gabarito do Objetivo); (b) o conjunto de 65 mil (Fazzioni) e o de 15 mil (CEIA, subconjunto): no ENEM 2010, o gabarito difere do oficial em ~54% das questões com as mesmas alternativas. Arquivos movidos para C:\rotina-banco\descartado-gabarito-errado. Unicamp (letmarchezi) bateu 100% e BLUEX ~97% (exceto USP 2023), mas foram substituídos pelas oficiais.
- NOVA FONTE: resoluções comentadas do Curso Objetivo (curso-objetivo.br + API sistemas.objetivo.br/ResolucaoComentadaApi/templates/prova/<cod>): gabarito oficial + imagem de cada questão com a resolução. ferramentas/objetivo.py baixa, faz OCR com o Windows (ferramentas/ocr.ps1, pt-BR) e acha o corte entre enunciado e "Resolução". O app mostra a imagem direto do site, recortada (modo 'objetivo'); depois de responder, a resolução. A imagem fica em cache no service worker depois da 1ª vez.
- ferramentas/oficiais.py roda tudo (bancas de SP, medicina, exatas, ENEM), classifica matéria (classificar.py, Gemini lite, chaves só no ambiente) e gera pacotes 6 a 9 em para-o-ipad.
- metas.js: painel "Questões de hoje" (meta = soma das metas das matérias do dia; +5/+10/+20 e "fiz fora do app" com acertos opcionais; semana). Metas saíram de Ajustes.
## v12 (27/10/2026)
- Foco removido (o iPad não deixa app web ler o Tempo de Uso).
- metas.js reescrito: meta do dia = UM total (planoQ.total, por dia da semana em planoQ.dias, compensa até 25% do que faltou ontem), repartido pelas matérias do dia por pesos (Mat/Fís/Quím 1, demais 2). Períodos Hoje/Semana/Mês/Tudo (feitas, acerto, tempo, dias que bateu), gráfico com linha da meta, planejamento por texto (IA) e aviso se a meta passa do tempo do dia. qlog guarda {f,a,s,t}.
- objetivo.py: regex de "Resolução" aceita OCR quebrado ("Resol u..."); "falhas" no log é cumulativo por banca.
## v13 (27/10/2026)
- Metas simplificadas: orçamento em PONTOS por dia (padrão 120; questão leve = 1 ponto, Mat/Fís/Quím = 2), repartido igualmente entre as matérias do dia; meta em questões = pontos/matéria/custo. S.planoQ {total, dias, compensar}, S.qmeta guarda a meta de cada dia. Detalhes retráteis (<details data-k>, estado em ui.ab). Banco: filtros extras e gerador de IA retráteis.
- oficiais.py: só provas de 2010 em diante.
## v14 (27/10/2026): banco normal
- Cada questão tem MATÉRIA e ASSUNTO do plano de estudos (classificar.py, Gemini lite, 4 em paralelo, CONTEUDO de base.js). App: chips de matéria e de assunto com contagem, busca no texto (OCR indexado, sem acento, singular, '2º grau' = quadrática), contagem ao vivo, Resolver (N) e Ver a lista paginada. Reimportar atualiza o assunto das já importadas.

## v16 (27/10) - questoes em TEXTO lidas por IA (teste)
- ferramentas/transcrever.py: IA (Gemini, visao) le a imagem do Objetivo -> enunciado limpo (LaTeX), alternativas, resolucao em texto, assunto, figuras recortadas (caixa da IA + folga + corte pelas linhas de texto do OCR). Chaves so em GEMINI_KEYS (ambiente).
- Teste: C:\rotina-banco\para-o-ipad\00-TESTE-questoes-em-texto.json.gz (46 questoes). Processamento total SO depois da aprovacao dele.
- mdLite: tabelas markdown e italico.

## v17 (27/10) - Desempenho e navegacao
- desempenho.js: aba Desempenho (periodo 7/30/tudo, barras por dia, por materia, assuntos fracos com Treinar, plano, redacao, erros).
- nav.js: historico do navegador (Voltar sai da questao para a lista, fecha janela, volta de aba), F5 guarda aba/filtros/lista/questao em andamento (localStorage rotina.nav + IndexedDB d:qs). Botoes Voltar a lista e Anterior na questao.

## v18 (27/10) - escolher questoes com caixas, historico, Anterior/Proxima
- Escolher questoes: caixas (Materia, Assunto, Situacao, Banca, Ano, Ordem, Quantas) com contagem; busca no texto de todas as questoes (ficha leve ganhou x e p; META_V=2 refaz as fichas).
- Historico por questao S.qh {ok,dia,n,ac,er,h[[dia,1|0,letra]]}, gravado na hora da resposta; filtro Situacao (nao fiz, ja fiz, errei/acertei na ultima, ja errei alguma vez).
- Questao: mapa numerado, Anterior/Proxima sempre, IA retratil, resolucao com mdLite (italico/negrito).
- transcrever.py: falhas eram RECITATION (o Gemini nao copia enunciado publicado na internet; ~4%). Essas ficam no modo imagem (nao se perdem). Motivos em <saida>.falhas.json.

## v19 (27/10) - transcricao completa em andamento
- C:\rotina-banco\rodar-tudo.ps1 (GEMINI_KEYS no ambiente, nunca no arquivo): transcrever.py (8 threads; espera a cota sozinho; retoma) nos grupos 6+7, depois 8+9 quando oficiais.py terminar, segunda passada, empacotar.py.
- Saida: C:\rotina-banco\transcrito.json (+ .falhas.json com motivos). Pacotes: para-o-ipad\6..9 (mesmo id da versao imagem, v=2: o app troca sem duplicar e mantem historico).
- Falhas ~4%: recitation (Gemini nao copia enunciado publicado), gabarito divergente, alternativas em figura -> ficam no modo imagem.
- Log: C:\rotina-banco\log-transcrever.txt. Se o PC desligar: rodar de novo rodar-tudo.ps1 com GEMINI_KEYS.
- Cota gratis (medida em 27/10): flash-lite 500 pedidos/dia e 15/min por chave; flash 20/dia. 3 chaves = ~1.500 questoes/dia (volta a meia-noite do Pacifico). transcrever.py registra cota e espera; resultados na ordem em que terminam.

## v21 (27/10) - agenda flexivel e Planejamento
- Dia: pesadas primeiro (depois redacao, depois leves), so ordem sugerida.
- Meu dia: linha do tempo do dia inteiro (estudo, treino, refeicoes, compromissos), bloco 'agora', mudar/tirar/por, 'Atrasou? +15/+30/+1h' empurra o resto; assuntos se reencaixam (reajustarDia). Replanejar mantem o que ja passou.
- planejar.js (aba Planejamento): IA distribui um periodo pelos dias (previa, ajuste, aplicar). Itens viram assuntos com a.dia e a.periodo; S.periodos {id,ini,fim,so}. Nos dias do periodo, montarHoje usa so o planejado. 'Mudar o cronograma' usa pedirIa (nova acao marcar_dia).
- transcrever.py usa so o flash-lite e no maximo 430 pedidos/dia por chave (C:\rotina-banco\uso-gemini.json), para sobrar cota para a IA do app (mesmas chaves). Ritmo: ~1.290 questoes/dia.

## v22 (27/10) - correcoes da revisao do Argon
- Dados: ids unicos em provas de 2 dias/blocos (objetivo.ids_unicos + ferramentas/corrigir_ids.py; UNESP 177, ITA 528, FGV 83 questoes recuperadas); materia em branco quando o cabecalho junta materias; recorte do OCR ordenado por altura e 'Resolucao' so depois das alternativas; refazer banca preserva o assunto; classificar.py deixa a IA corrigir a materia; transcrever.py so conta pedido aceito (429 por minuto nao gasta) e espera a virada do dia.
- App: fechar janela + trocar de tela nao volta mais sozinho (nav.js); 'mais um' e reabastecer respeitam o periodo planejado (filaParaHoje); refazer erros busca a questao completa no banco (figuras, texto-base, versao em texto); rascunho a mao por questao (qtmpN); subir mais de uma questao para achar o texto-base; notas de redacao do professor no Desempenho; repeticao mensal no dia 31; calibracao em segundo plano nao redesenha a tela no meio do uso; menu rola de lado em tela estreita; sw.js nao guarda resposta de erro.
- Pendente: FMABC/FAMERP/Mackenzie (links em maiusculas; site do Objetivo fora do ar no momento), refazer recorte da Fuvest 2024, reclassificar questoes sem assunto (precisa de cota), limpar codigo morto.
