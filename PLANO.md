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

## Próximos passos
1. Publicar no GitHub Pages. O PC não tem git nem gh. Proposta: instalar Git e GitHub CLI com o winget (pedir autorização ao Felipe), ele faz `gh auth login` uma vez, depois criar o repositório público e ativar o Pages.
2. No iPad: Safari → link → Compartilhar → "Adicionar à Tela de Início". Depois colar as chaves em Ajustes e tocar em "Testar a IA".
3. Ajustar conforme o uso dela.
4. v2: Apple Pencil (redação e flashcards à mão, rascunho que vira tarefas).

## Testar no PC
- `C:\rotina` servido com `python -m http.server <porta livre>`. A porta 8765 já está ocupada; use outra, por exemplo 18765.
- Chrome headless com `--user-data-dir` temporário. Nunca usar a janela do Felipe.
- Para semear dados de exemplo: um `teste.html` que grava `rotina.dados` e redireciona para `index.html#hoje|semana|mes|ano`. Ele fica fora da pasta do app.
- Prévia dos estilos: https://claude.ai/artifact/NqKPPEXQn2dis5xNBnUwHW
