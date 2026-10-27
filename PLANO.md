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