# Teste da Etapa 3: a interface real da base

Objetivo: confirmar que o app inteiro está no design system APRNDR e que as peças da base funcionam com o agente de verdade: tela de perfis, tela de carregamento, janela do perfil (conversa como documento, seletores, histórico, custo), área de painéis, o ask_user_question e o quiz no app, o cancelamento de pedidos e a edição ao vivo. Não é uma aula; é um teste de que cada peça está no lugar e funciona.

Tempo: uns 30 minutos. Custo esperado: menos de US$ 0,50. Cada passo com o professor custa alguns centavos.

No fim, anote o resultado de cada passo e mande para o Claude Code. A Etapa 3 só está pronta quando você aprovar.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C e feche o terminal. Se estiver em dúvida, use o atalho "Parar Estudos" da área de trabalho. Por quê: o atalho sobe o app sozinho, e as portas 7430 e 7431 precisam estar livres.

2. Desta vez a aparência conta. Reprove um passo se o visual fugir do design system (design-system/README.md): cor com função errada, texto ilegível, caixa-alta em texto do professor, layout quebrado. Também reprove se faltar informação ou se algo não funcionar.


## Teste

### Tela de perfis e carregamento

1. Abra o app com o atalho "Estudos". Por quê: confere o lançador com o tema novo. O que você deve ver: nenhuma janela de terminal; abre o Edge em modo app com o fundo quase preto, a faixa escura à esquerda com APRNDR (o ponto tijolo depois do R), "Seus perfis · outubro de 2026", o ideograma 学習 com "aprendizado" ao lado e, no pé, "01 Perfil pronto". À direita, a folha de papel com "Escolha um perfil" e "01 perfil".

2. Passe o mouse sobre a linha do perfil Estudos, sem clicar. Por quê: no design system, a linha escolhida da lista fica tijolo. O que você deve ver: a linha inteira fica tijolo, com o texto claro, e o "Perfil 01 · 02 agentes · 02 painéis" continua legível. Ao tirar o mouse, ela volta ao papel. Com o perfil já aberto no servidor, aparece também a etiqueta verde "Aberto".

3. Clique em "Recarregar lista" no pé da folha. Por quê: confere a tecla de papel. O que você deve ver: "Carregando perfis" com o cursor âmbar piscando por um instante e a lista de volta.

4. Clique na linha do perfil Estudos. Por quê: confere a tela de carregamento. O que você deve ver: a faixa da marca com o ideograma 始 ("começo") e o botão Perfis; à direita, "Perfil", "ESTUDOS" grande e a etapa ("Montando a sessão" ou o que o núcleo estiver fazendo) com o cursor âmbar. Pode passar rápido; se piscar e sumir, tudo bem.

### Janela do perfil

5. Olhe a janela aberta. Por quê: confere o layout. O que você deve ver: no topo, a barra tijolo com Perfis, "Perfil · ESTUDOS", os controles Agente e Modelo, "Custo da sessão" com o valor em US$ e os tokens (some quando a janela é estreita), o botão de recarregar e a tecla "Painéis". À esquerda, a faixa com "Nova conversa" e a lista de conversas, com a aberta marcada em âmbar. No meio, a conversa (vazia: um bloco verde com 問 e "Conversa nova") e, no pé, o campo "Pergunte, peça ou responda…" com a tecla âmbar de enviar.

6. Clique em "Nova conversa" e mande: "Em três itens curtos, com uma palavra em negrito em cada, explique a média aritmética. Mostre a fórmula em LaTeX e termine com duas linhas de Python." Por quê: confere a conversa como documento e o markdown. O que você deve ver: a sua mensagem numa nota creme, levemente torta, com "Você escreveu"; a resposta num bloco com o número "01 —" na margem, a etiqueta "Resposta" e "Escrevendo" com o cursor âmbar enquanto chega. No fim: lista com negrito, a fórmula desenhada (não o texto com $), o código numa caixa escura e o nome do modelo no pé do bloco. Se o modelo mandar o raciocínio, aparece um "Raciocínio" recolhível no topo do bloco; alguns modelos não mandam, e isso não reprova.

7. Mande uma pergunta mais longa, por exemplo "Explique em 10 parágrafos a diferença entre média e mediana", e, enquanto o professor escreve, mande "e a moda?". Depois clique em Parar. Por quê: confere a fila e o Parar. O que você deve ver: enquanto ele responde, aparece "Respondendo" com o botão Parar acima do campo, e a ajuda diz "Enter põe a mensagem na fila". A segunda mensagem aparece tracejada com "Na fila". Ao clicar em Parar, a resposta para e "e a moda?" volta para o campo de texto.

8. Clique no controle Modelo. Por quê: confere o seletor de modelo (era uma pendência: o catálogo tem centenas). O que você deve ver: um modal com a faixa âmbar "Escolher modelo", o campo de busca e a contagem do catálogo, e embaixo "Modelos do perfil" com o atual marcado "Atual". Digite "claude sonnet": aparecem só os que combinam, com contexto e "raciocínio · imagem". Escolha um, mande "oi" e confira o nome do modelo no pé do bloco da resposta. Depois volte para openai/gpt-6.1-sol pelo mesmo modal (ele está em "Modelos do perfil"). Esc ou o × fecham o modal sem trocar.

9. Troque o Agente para researcher e depois de volta para professor. Por quê: confere a troca de agente no tema novo. O que você deve ver: a conversa continua na tela; o controle Agente mostra o agente escolhido. Durante a resposta, os dois controles ficam apagados e não abrem.

10. Clique numa conversa antiga da lista à esquerda e depois volte para a mais recente. Por quê: confere o histórico. O que você deve ver: as mensagens antigas no formato de documento, com as ferramentas no lugar, e a conversa aberta marcada em âmbar. O custo no topo volta a zero ao trocar de conversa: ele soma só as respostas desde que a conversa foi aberta nesta janela.

11. Mande: "Use o researcher para achar em que ano Pearson publicou o coeficiente de correlação, com a fonte." Por quê: confere as linhas de ferramenta. O que você deve ver: entre as notas e os blocos, linhas escuras pequenas com o ícone de código, o nome da ferramenta (subagent), os argumentos cortados, a etiqueta "Executando" em âmbar e o progresso do researcher embaixo; no fim, a duração com vírgula ("12,3 s") e "Concluída" em verde. Pode levar um ou dois minutos.

### Painéis e perguntas

12. Clique na tecla "Painéis" e depois de novo. Por quê: confere a área de painéis. O que você deve ver: à direita (ou por cima da conversa, se a janela for estreita) aparecem os cards "Questões" e "Teste", cada um com o número e "Painel" no topo, e a tecla fica escura enquanto a área está aberta. O segundo clique fecha.

13. Feche a área de painéis e mande: "Use a ferramenta ask_user_question para me perguntar qual matéria eu quero revisar, com as opções Cálculo, Física e Algoritmos." Por quê: confere o ask_user_question no app (núcleo). O que você deve ver: a área de painéis abre sozinha, a tecla mostra "01" em âmbar e, no topo da área, o card "Pergunta" com a borda âmbar e "Esperando você". Nele, a pergunta, "Escolha uma" e as três opções mais "Outra". Escolha "Outra", escreva "Estatística" no campo que aparece e clique em "Enviar resposta". O card some, a linha da ferramenta mostra "User selected: Other: Estatística" e o professor responde a partir disso.

14. Mande: "Use a ferramenta ask_user_question, com multiSelect, para eu escolher quais dias da semana posso estudar, com as opções segunda, quarta e sexta." Por quê: confere o modo de várias escolhas. O que você deve ver: "Escolha uma ou mais" com caixas de marcar. Marque duas e envie. A linha da ferramenta mostra as duas escolhidas.

15. Mande: "Use a ferramenta quiz com uma questão de 4 alternativas: qual é a derivada de x²? Escreva em LaTeX." Por quê: confere o quiz no app (perfil). O que você deve ver: no card "Questões", com a borda âmbar, a questão com "Uma resposta", a fórmula desenhada e as alternativas em teclas A a D (as letras também escolhem pelo teclado), o campo "Nota (opcional)" e os botões Pular, Não sei e Conferir. Escolha uma alternativa errada, escreva uma nota e clique em Conferir. O que você deve ver: a certa fica verde com "Correta", a sua fica tijolo com "Sua resposta", as outras apagam, e embaixo a faixa tijolo "Ainda não" com a explicação e "Sua nota". A linha da ferramenta diz "User answered incorrectly" com a sua nota, e o professor retoma a partir do erro.

16. Peça outra questão do quiz e clique em "Não sei". Depois peça mais uma e clique em "Pular". Por quê: confere os outros dois caminhos. O que você deve ver: com Não sei, a faixa creme "Você marcou Não sei", e o professor trata como lacuna, sem dizer que você errou. Com Pular, a questão some sem retorno, a linha da ferramenta diz "User cancelled the quiz" e o professor segue sem erro. Os resultados ficam no card, o mais novo em cima.

17. Mande: "Use perguntar_no_painel_teste para me perguntar se está tudo certo e repita o resultado da ferramenta." Quando o card "Teste" aparecer, clique em Cancelar. Por quê: confere o cancelamento de verdade (era uma pendência da Etapa 2). O que você deve ver: o card mostra o pedido numa caixa técnica, o campo "Sua resposta" e os botões Cancelar e Responder. Depois de Cancelar, o resultado da ferramenta é "O usuário cancelou ou não respondeu (usuario)." Antes, ele vinha como uma resposta.

### Avisos e edição ao vivo

18. Clique no botão de recarregar do topo (a seta em círculo). Por quê: confere o aviso de perfil recarregado. O que você deve ver: no topo da conversa, uma faixa âmbar escura com "Perfil recarregado" e "Você pediu.", com o botão Fechar.

19. Com a tela de perfis aberta (clique em Perfis no topo), abra no editor apps\web\src\telas\TelaPerfis.tsx, troque "Escolha um perfil" por "Escolha um perfil teste" e salve. Por quê: edição ao vivo da tela. O que você deve ver: o texto muda na hora, sem a página recarregar. Desfaça e salve de novo.

20. Abra o perfil, deixe a área de painéis aberta, abra profiles\estudos\paineis\src\PainelQuiz.tsx, troque "Nenhuma questão ainda." por "Nenhuma questão por enquanto." e salve. Por quê: o código de tela do perfil é recarregado pelo Vite, sem mexer na sessão do pi. O que você deve ver: o texto do card "Questões" muda (se ele já tiver resultados, o texto não aparece; abra uma conversa nova para ver). Não deve aparecer o aviso "Perfil recarregado". Desfaça e salve de novo.

21. Abra profiles\estudos\extensions\painel-teste.ts, troque "mostrado no painel teste" por "mostrado no painel teste, versão nova" e salve. Por quê: mudança numa extensão recarrega a sessão. O que você deve ver: a faixa "Perfil recarregado" com "Um arquivo do perfil mudou: extensions/painel-teste.ts". Desfaça e salve de novo.

22. Deixe a janela do app estreita, mais ou menos da largura de meia tela. Por quê: confere a tela estreita. O que você deve ver: o custo some do topo; a área de painéis, quando aberta, fica por cima da conversa; numa janela bem estreita (menos de 760 px), a lista de conversas e o nome do perfil saem e ficam a conversa e o campo. Nada deve ficar cortado de lado nem pedir rolagem horizontal.


## Fim

1. Feche a janela do app e use o atalho "Parar Estudos". Por quê: fechar a janela não para o servidor.

2. Os logs ficam em %LOCALAPPDATA%\estudos-app\logs.


## O que ainda não existe ou já se sabe

- As perguntas e as questões ficam só na área de painéis enquanto a conversa está aberta. Ao reabrir uma conversa antiga, aparece só a linha da ferramenta com o resultado em texto. Isso não reprova o teste.
- Ao recarregar a página logo depois de "Nova conversa", sem mandar mensagem, aparece "Sessão … não encontrada". É esperado (a conversa nova só vai para o disco com a primeira mensagem); o app abre uma conversa nova no lugar e o erro some com "Limpar erros". Está anotado para corrigir.
- A linha do quiz mostra "Awaiting user response..." enquanto espera. É o texto da ferramenta original, em inglês.
- As imagens dos diagramas na conversa ainda não aparecem. O arquivo vai para estudos-dados\viz.
- Cadernos, cursos e a aula (as outras telas do design system) são da Etapa 4.


## Se algo falhar

Mande para o Claude Code: o número do passo, o que você fez, o que esperava e o que viu, com a mensagem de erro (da tela ou do log em %LOCALAPPDATA%\estudos-app\logs). Se for visual, uma captura de tela ajuda. Nunca cole o valor das chaves; se uma mensagem ou um log mostrar uma chave, apague esse trecho antes de mandar.


## Resultado

Anote aqui, passo a passo, "ok" ou o que deu errado.

Antes de começar (app parado):
1. Abrir pelo atalho e tela de perfis:
2. Linha tijolo no hover:
3. Recarregar lista:
4. Tela de carregamento:
5. Layout da janela:
6. Conversa como documento e markdown:
7. Fila e Parar:
8. Seletor de modelo com busca:
9. Trocar de agente:
10. Histórico:
11. Linhas de ferramenta (researcher):
12. Área de painéis:
13. ask_user_question com Outra:
14. ask_user_question com várias escolhas:
15. quiz com resposta errada e nota:
16. quiz com Não sei e Pular:
17. Cancelar no painel teste:
18. Perfil recarregado:
19. Edição ao vivo da tela:
20. Edição ao vivo do painel do perfil:
21. Edição ao vivo da extensão:
22. Tela estreita:
Fim (Parar Estudos):
