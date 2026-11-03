# Teste da agenda

Objetivo: confirmar a agenda do perfil de estudos: as colunas de tarefas e de calendário do caderno, a tela da agenda com as três abas (Calendário em tela cheia, Tarefas e Quadro), as provas das matérias no calendário, a linha do tempo do caderno com as tarefas e o professor lendo a agenda pelo ler_agenda. Confirmar também que os arquivos da agenda ficam legíveis na pasta de dados.

Tempo: uns 45 minutos. Custo: quase nenhum. Só o passo 28 manda uma mensagem ao professor (gasta uns tokens do modelo); o resto não usa modelo.

Os passos criam tarefas, colunas e uma prova de teste na sua pasta de dados (agenda/agenda.json e a pasta da matéria). Use nomes que começam com "Teste" para achar tudo depois. O passo 30 apaga o que foi criado. Os eventos desses testes continuam nos eventos.jsonl, porque eles só crescem.

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo.

2. Se a sua agenda já tiver tarefas ou colunas que não são de teste, anote quais são. Por quê: o passo 30 não deve mexer nelas.


## Teste

1. Abra o app com o atalho "Estudos", clique no card Estudos e, com Ciência de Dados no meio da roda, clique em "Abrir". Por quê: é a entrada no caderno, onde ficam as tarefas e o calendário. O que você deve ver: embaixo, três colunas: a lista com as tags Notas, Materiais e Mapa de conteúdo (metade da largura), um cartão "Tarefas" (um quarto) e um cartão "Calendário" (um quarto), os dois até o fim da janela. No cartão Tarefas, o título com a contagem de abertas, dois botões de ícone (a lista e o quadro; passe o mouse para ler o nome), a lista de hoje com "Nova tarefa", as próximas por prazo e o campo "Adicionar tarefa…" no pé. No Calendário, o botão Tela cheia no alto, o mês com o dia de hoje destacado e as seis semanas em células grandes.

2. No cartão Calendário, clique num dia do mês que não seja hoje. Por quê: o dia escolhido manda na lista do dia, que fica no cartão Tarefas. O que você deve ver: o dia com um contorno no calendário e, no cartão Tarefas, o título do dia no lugar de "Hoje", a lista com "Nada marcado para este dia." e o botão "Nova tarefa".

3. Com esse dia escolhido, clique em "Nova tarefa". Por quê: o modal já vem com a data do dia e a matéria do caderno. O que você deve ver: o modal "Nova tarefa" (com "Agenda" no alto), o campo Data com o dia escolhido e o campo Matéria com Ciência de Dados. Preencha o Título com "Teste: ler o capítulo 2", a Hora com 14:00 e clique em "Criar tarefa". Por quê da hora: confere que a hora aparece junto da data.

4. Olhe os dois cartões depois de salvar. Por quê: a tarefa entra no calendário e na lista na hora. O que você deve ver: o modal fecha; o dia escolhido ganha um pontinho colorido embaixo do número, na cor da matéria; a lista do dia, no cartão Tarefas, mostra a tarefa com a hora, o título e a caixinha de feita à esquerda; a contagem de abertas sobe e a tarefa aparece também em "Próximas", no grupo do prazo dela.

5. Marque a caixinha da tarefa na lista do dia e, depois, desmarque. Por quê: a caixinha move a tarefa para a coluna de feito e a tira de volta. O que você deve ver: marcada, a tarefa aparece apagada na lista do dia; desmarcada, ela volta aberta e sem o apagado. A primeira coluna que não é a de feito é a que recebe a tarefa de volta.

6. Clique em "Tela cheia", no cartão Calendário. Por quê: leva ao calendário grande, já filtrado pela matéria do caderno. O que você deve ver: a tela da agenda, com a barra no alto (o botão "Caderno" à esquerda, o nome da matéria em cima de "Agenda", as abas Calendário, Tarefas e Quadro e o botão "Nova tarefa"). Embaixo, o mês com a tarefa "Teste: ler o capítulo 2" no dia, como uma etiqueta colorida, e à direita o minimês com a lista do dia.

7. No cabeçalho do calendário, troque para "Semana" e depois para "Mês". Por quê: a Semana mostra os sete dias com a lista inteira de cada um. O que você deve ver: na Semana, os sete dias lado a lado com o título da semana, os com hora em ordem de hora e depois os sem hora. Volte para "Mês" e aperte F5. O que você deve ver: depois de recarregar, a visão que ficou escolhida continua, porque ela fica guardada no navegador.

8. Use as setas "‹" e "›" ao lado de "Hoje" e, por fim, "Hoje". Por quê: as setas andam um mês (ou uma semana, na Semana) e "Hoje" volta para hoje. O que você deve ver: o título muda (por exemplo, "Dezembro de 2026"), a lateral acompanha, e "Hoje" volta ao mês de hoje, com o dia de hoje destacado.

9. Na lateral, clique num dia do minimês. Por quê: o minimês, a grade grande e a lista do dia seguem o mesmo dia escolhido. O que você deve ver: a grade muda para o mês desse dia (se for outro mês), a lista da lateral mostra o dia clicado e o dia escolhido fica com o contorno nos dois calendários.

10. Crie quatro ou cinco tarefas de teste no mesmo dia (o passo 11 mostra uma forma de criar). Por quê: quando as etiquetas não cabem na célula do mês, aparece "N mais". A altura da célula define quantas cabem, por isso pode ser preciso criar mais. O que você deve ver: na célula do mês, as etiquetas que cabem e um "N mais" no lugar das outras. Clique em "N mais": o dia fica escolhido e a lista da lateral mostra todas as tarefas do dia.

11. Dê um duplo clique num lugar livre de um dia da grade (fora das etiquetas). Por quê: é o atalho para criar uma tarefa naquele dia. O que você deve ver: o modal "Nova tarefa" com a Data desse dia e a matéria do filtro. Crie uma tarefa de teste ou feche com Esc, que não cria nada.

12. Clique num dia da grade para escolhê-lo e use o teclado: setas para andar entre os dias, Home e End para as pontas da semana, PageDown e PageUp para trocar de mês, e Enter. Por quê: o calendário inteiro funciona pelo teclado. O que você deve ver: o contorno do dia anda com as setas; Enter abre o modal "Nova tarefa" com a data do dia que tem o foco; Esc fecha. Pelo Tab, a grade entra por um único lugar, o dia escolhido.

13. Abra a matéria pela capa do caderno (no caderno, clique na capa com o número, como no passo 3 do roteiro docs/teste-painel-caderno.md). No campo "Prova", escreva "P1 de teste" e, em "Data da prova", uma data deste mês. Clique em "Salvar". Por quê: as provas não são copiadas para a agenda: o calendário lê a data da prova do cadastro da matéria. Se a matéria for a sua de verdade, a prova de teste sai no passo 30. O que você deve ver: no dia da prova, a bandeira e o nome "P1 de teste" no calendário grande, e a etiqueta "Prova" na lista do dia, no cartão e na lateral.

14. Na tela da agenda, abra o filtro de matéria (no alto, à direita do título) e escolha outra matéria. Depois, volte para "Todas as matérias". Por quê: o filtro deixa só as tarefas e as provas da matéria escolhida, nas listas, no quadro e no calendário. Tarefas sem matéria somem com o filtro. O que você deve ver: com a matéria escolhida, o calendário mostra só os itens dela e a barra mostra a cor e o nome dela; com "Todas as matérias", volta tudo. O endereço muda com a matéria, e o F5 mantém a escolha.

15. Clique em "Caderno", no canto esquerdo da barra. Por quê: volta ao caderno da matéria do filtro. O que você deve ver: o caderno da matéria escolhida, com os cartões de tarefas e do calendário. Se o filtro estivesse em "Todas as matérias", o botão diria "Matérias" e levaria à roda.

16. Volte à tela da agenda pelo botão "Tela cheia" do cartão Calendário e clique na aba "Tarefas", com "Todas as matérias" no filtro. Por quê: a lista de tarefas agrupa por prazo. O que você deve ver: grupos com os títulos Atrasadas, Hoje, Amanhã, Esta semana, Mais tarde e Sem data, cada um com as tarefas de teste no grupo do prazo delas (a "Teste: ler o capítulo 2" cai em Hoje ou no dia que você escolheu). Cada linha tem a caixinha, o título, a data e a hora, a matéria com a bolinha da cor e a coluna como etiqueta.

17. No campo "Adicionar tarefa…" no alto da lista, escreva "Teste: rápida" e aperte Enter. Depois, escreva "Teste: para apagar" e aperte Esc. Por quê: o Enter cria a tarefa só com o título, na primeira coluna que não é a de feito, com a matéria do filtro se houver; o Esc limpa o campo sem criar nada. O que você deve ver: a "Teste: rápida" aparece em Sem data (ela não tem data), o campo continua pronto para a próxima tarefa, e "Teste: para apagar" não aparece em lugar nenhum.

18. Abra o filtro "Filtrar por coluna", escolha a primeira coluna e depois "Todas as colunas". Em seguida, ligue e desligue "Mostrar feitas". Por quê: a coluna mostra só as tarefas dela, e "Mostrar feitas" controla as concluídas. O que você deve ver: com a coluna escolhida, só as tarefas dela. Com "Mostrar feitas" desligado, as concluídas somem da lista; ligado, aparece o grupo Feitas no fim, com a contagem. Se todas as tarefas estiverem concluídas e o botão estiver desligado, aparece "Tudo feito" com a frase para ligar.

19. Clique na aba "Quadro". Por quê: é o kanban, com as colunas do Breno lado a lado. O que você deve ver: uma coluna por coluna do quadro (A fazer, Fazendo e Feito, no começo), a coluna de feito com um check no cabeçalho, a contagem de tarefas em cada uma, "+ Adicionar" no pé de cada coluna e, no fim, "+ Nova coluna". A "Teste: rápida" aparece na primeira coluna.

20. Arraste o cartão "Teste: rápida" para a coluna Fazendo. Depois, arraste-o para cima ou para baixo dentro da própria coluna. Por quê: o arrasto muda a coluna e a posição. O que você deve ver: o cartão segue o ponteiro, uma linha âmbar mostra onde ele vai cair, e ao soltar ele fica no lugar. Esc no meio do arrasto cancela. Se o servidor recusar, o cartão volta sozinho para o lugar de antes e aparece um aviso no alto do quadro.

21. Clique no cartão "Teste: rápida", que está em Fazendo, para focá-lo (ou use Tab até ele). Aperte Alt+seta para a esquerda: ele volta para A fazer. Aperte Alt+seta para baixo: se houver um cartão abaixo dele, ele desce um lugar; se não, nada muda. Depois, use o botão "Mover para…" do cartão e escolha Fazendo. Por quê: o teclado e o menu movem o cartão sem o mouse. O que você deve ver: o cartão muda de coluna com Alt+seta para a esquerda, e o "Mover para…" leva a tarefa para o fim da Fazendo.

22. No quadro, clique em "+ Nova coluna" no fim, escreva "Teste: coluna" e aperte Enter. Repita com "Teste: coluna nova". Depois, no menu "…" de "Teste: coluna", escolha "Renomear", apague o nome, escreva "fazendo" (minúsculas) e aperte Enter. Por fim, dê um duplo clique no nome "Teste: coluna", escreva "Teste: coluna 2" e aperte Enter. Por quê: as colunas de teste ficam separadas das suas, e o nome da coluna é do Breno: a agenda recusa nome repetido, sem diferença de maiúsculas e acentos. O que você deve ver: as duas colunas novas no fim do quadro, depois de Feito e sem o check. Com "fazendo", a frase de erro aparece embaixo do campo e o campo continua aberto; Esc desiste. O duplo clique troca o nome na hora.

23. Clique em "+ Adicionar" no pé de "Teste: coluna 2", escreva "Teste: na coluna" e aperte Enter. Por quê: o campo do pé da coluna cria a tarefa ali, sem sair do quadro. O que você deve ver: a tarefa aparece no fim da coluna, e o campo fica pronto para a próxima; Esc fecha o campo.

24. Com o "Mover para…" do cartão "Teste: ler o capítulo 2", leve-o para "Teste: coluna nova". Depois, no menu "…" de "Teste: coluna nova", escolha "Marcar como feito". Vá à aba Calendário e veja o dia da tarefa. Por fim, no menu "…" da coluna Feito, escolha "Marcar como feito" de novo. Por quê: marcar uma coluna como feito muda quais tarefas contam como concluídas. O que você deve ver: o check passa para "Teste: coluna nova" e sai da Feito; a tarefa "Teste: ler o capítulo 2" fica riscada no calendário e apagada na lista do dia. Ao marcar a Feito de volta, o check volta para ela, e a tarefa, que está em outra coluna, fica aberta de novo.

25. No menu "…" da coluna "Teste: coluna nova", escolha "Apagar…". Por quê: apagar uma coluna com tarefas pede outra coluna para receber as tarefas. O que você deve ver: o modal 'Apagar a coluna "Teste: coluna nova"?' com o texto "A coluna tem 1 tarefa." e o campo "Mandar as tarefas para". O botão "Apagar coluna" fica desabilitado até você escolher o destino. Escolha "Fazendo" e confirme: a coluna some e a tarefa vai para o fim da Fazendo. Depois, crie uma coluna "Teste: vazia" com "+ Nova coluna", apague-a pelo mesmo menu e veja o modal dizer "A coluna está vazia: nenhuma tarefa é apagada.".

26. Clique em "Caderno" e, no caderno de Ciência de Dados, clique no botão do relógio, na aba, perto da foto do professor. Por quê: as mudanças das tarefas com matéria vão para a linha do tempo do caderno. O que você deve ver: o modal "Linha do tempo", com os eventos de hoje: "Tarefa criada" (com o dia e a coluna), "Tarefa movida", "Tarefa concluída" e "Tarefa reaberta", conforme você fez (e "Tarefa apagada" para as tarefas apagadas). As tarefas sem matéria, e as mudanças de coluna, não aparecem aqui. Feche com Fechar.

27. Abra a pasta de dados (G:\Meu Drive\estudos-dados) no Explorador de Arquivos. Por quê: a agenda é arquivo legível, como o resto dos dados. O que você deve ver: a pasta agenda com o agenda.json, o arquivo com as colunas e as tarefas em JSON, com a tarefa "Teste: ler o capítulo 2" e a coluna dela; e, na mesma pasta agenda, o eventos.jsonl (as tarefas sem matéria e as mudanças de coluna). Na pasta da matéria de teste, em materias, aparece o eventos.jsonl com as linhas das tarefas dela. Não edite esses arquivos à mão: use o app. Não apague nada aí.

28. Abra a conversa da matéria pela foto do professor no caderno e escreva "o que eu tenho para fazer esta semana?". Por quê: o professor lê a agenda pela ferramenta ler_agenda, só de leitura. O que você deve ver: uma chamada ler_agenda no grupo de ferramentas da resposta, e a resposta com as seções "Atrasadas (abertas, com data antes de hoje)", "Abertas com data no intervalo", "Abertas sem data" e "Provas no intervalo", com as tarefas e a prova de teste. Depois, peça "crie uma tarefa para amanhã chamada Teste: pelo professor". Ele não tem ferramenta para criar: deve dizer que só consegue ler a agenda, e nenhuma tarefa nova aparece na tela da agenda.

29. Diminua a janela até cerca de 375 px de largura e abra o caderno e a tela da agenda (Calendário e Quadro). Por quê: confere a tela estreita. O que você deve ver: no caderno, abaixo de uns 1100 px as tarefas e o calendário ficam lado a lado embaixo da lista de tags, e abaixo de uns 700 px tudo fica numa coluna. No Calendário, o Mês mostra só os pontinhos coloridos, e a lista do dia fica acima da grade. A página não ganha rolagem para o lado: só o quadro rola para o lado, dentro dele. Volte à largura normal.

30. Apague o que foi criado no teste. Na aba Tarefas, abra cada tarefa que começa com "Teste" e clique em "Apagar tarefa", confirmando no próprio modal. No Quadro, apague as colunas "Teste: coluna 2" e "Teste: vazia", se ainda existirem, pelo menu "…" de cada uma (antes, a coluna precisa estar sem tarefas ou com um destino). Confira que a coluna Feito continua marcada como feito. Por fim, abra "Editar matéria" da matéria de teste, apague a data da prova e clique em "Salvar". Por quê: a agenda e a matéria voltam ao que eram. Os eventos desses testes continuam nos eventos.jsonl, porque eles só crescem. O que você deve ver: a agenda com as colunas A fazer, Fazendo e Feito (esta marcada como feito) e as tarefas que você tinha antes, se houver; o caderno sem a prova de teste.


## Resultado

Para cada passo, escreva ok ou o que aconteceu de diferente:

1. Colunas de tarefas e de calendário no caderno:
2. Escolher um dia:
3. Nova tarefa com a data e a matéria:
4. Pontinho e lista do dia:
5. Caixinha de feita:
6. Tela cheia com a tarefa:
7. Mês, Semana e F5:
8. Setas e Hoje:
9. Minimês:
10. N mais:
11. Duplo clique num dia:
12. Teclado na grade:
13. Prova em Editar matéria:
14. Filtro de matéria:
15. Voltar ao caderno:
16. Aba Tarefas e os grupos:
17. Campo rápido:
18. Filtros e Mostrar feitas:
19. Aba Quadro:
20. Arrastar cartões:
21. Alt+setas e Mover para…:
22. Colunas de teste, Renomear e nome repetido:
23. Adicionar tarefa no pé da coluna:
24. Marcar como feito:
25. Apagar coluna com tarefas:
26. Linha do tempo do caderno:
27. Arquivos da agenda:
28. Professor e ler_agenda:
29. Tela estreita:
30. Limpeza do teste:
