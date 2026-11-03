# Teste do painel do caderno

Objetivo: confirmar que o caderno da matéria é um painel: a aba tijolo com o leque de capas, a capa que edita e a foto do professor que abre a conversa; embaixo, a faixa dos cursos, a faixa da linha do tempo e a lista com as tags Notas, Materiais e Mapa de conteúdo. Confirmar também que as notas, os materiais e os cursos continuam abrindo onde abriam antes.

Tempo: uns 20 minutos. Custo: nenhum (o passo 4 abre a conversa, mas não manda mensagem ao professor).

Para os passos 5 a 8 você precisa de uma matéria com um curso em rascunho e, se tiver, um curso pronto. Se não tiver rascunho, crie um pelo "Novo curso", avance até a etapa Mapa e saia pelo Sair. Para o passo 9, precisa de uma matéria com pelo menos um evento na linha do tempo (criar uma nota já serve). Para o passo 11, de uma nota com uma menção a um arquivo de material.

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo.


## Teste

1. Abra o app com o atalho "Estudos", clique no card Estudos e, com Ciência de Dados no meio da roda, clique em "Abrir". Por quê: é a entrada no caderno. O que você deve ver: a aba tijolo no topo, com o leque de três capas à esquerda, a capa com o número e o nome da matéria e a foto do professor à direita. Embaixo, de cima para baixo: a faixa Cursos, a faixa Linha do tempo e a lista com as tags Notas, Materiais e Mapa de conteúdo. Não há mais o índice das seções à esquerda nem as seções "em breve".

2. Passe o mouse sobre o leque de capas, à esquerda da aba. Por quê: o leque abre no hover. O que você deve ver: as três capas se abrem em leque. Tire o mouse: o leque se fecha. Depois, clique no leque. Por quê: é a saída para as matérias. O que você deve ver: a roda com as matérias, a aba virando a linha tijolo da roda, como no passo 13 do roteiro docs/teste-etapa-4-3a.md. Abra o caderno de novo pelo "Abrir" para continuar.

3. Passe o mouse sobre a capa com o número, no meio da aba. Por quê: a capa é o botão de editar a matéria. O que você deve ver: a capa inclina, como a capa da linha do meio da roda. Clique nela. Por quê: confere a edição sem salvar. O que você deve ver: o modal "Editar matéria" com o nome, a cor, o ideograma e as provas atuais. Feche sem salvar (Esc ou o botão de fechar). O caderno continua igual, com o mesmo nome e a mesma cor.

4. Passe o mouse sobre a foto do professor, à direita da aba. Por quê: a foto é o botão da conversa da matéria. O que você deve ver: a foto pula de leve. Clique nela. Por quê: abre a conversa da matéria e volta ao caderno pelo botão da barra. O que você deve ver: "Abrindo a conversa…" por um instante e a conversa da matéria, com o botão da esquerda da barra dizendo "Caderno". Clique em "Caderno": volta ao caderno, na mesma tag em que você estava.

5. Na faixa Cursos, observe o primeiro curso pronto. Por quê: é o curso em andamento, o único que ganha a cor da matéria no fundo. O que você deve ver: o card com o número 01, o nome do curso, a etiqueta verde "Pronto · N módulos" e o prazo embaixo ("P1 em 20/11", "20/11" ou "sem prazo"). Clique no card. Por quê: um curso pronto abre a visão do curso. O que você deve ver: "Curso · Ciência de Dados", o nome do curso, o botão "Rever o guia" e a Ficha do curso. Clique em "Cursos", no topo: volta ao caderno.

6. Na faixa Cursos, clique no card de um rascunho. Por quê: um rascunho volta ao guia de criação, de onde você para. O que você deve ver: a etiqueta âmbar "Rascunho · parou em …" com o ícone de relógio, e, ao lado do card, o botão "Descartar". O guia abre na etapa em que você parou. Clique em "Sair": volta ao caderno.

7. No rascunho, clique em "Descartar". Por quê: o descarte apaga a pasta do curso, por isso pede confirmação. O que você deve ver: o modal "Descartar o rascunho <nome>?" com o texto "A pasta do curso é apagada." e os botões Manter e Descartar. Clique em "Manter": o modal fecha e o card continua na faixa. Se quiser testar o descarte de verdade, use só um rascunho de teste.

8. Na faixa Cursos, clique no card tracejado "Novo curso", no fim da faixa. Por quê: abre o guia de criação de um curso novo. O que você deve ver: o guia no lugar do painel, com a aba do caderno no topo e o trilho das seis etapas. Clique em "Sair" (sem criar nada): volta ao caderno.

9. Na faixa Linha do tempo, passe o mouse sobre um dos ícones da linha. Por quê: a faixa mostra só os ícones dos eventos recentes, e o detalhe aparece num balão. O que você deve ver: um balão ao lado do mouse com o dia, a hora, a frase e o detalhe do evento. Tire o mouse: o balão some. Depois, use o teclado: aperte Tab até um ícone ter o foco. O que você deve ver: o mesmo balão, com o foco no ícone. Se a faixa tiver mais eventos do que cabem, role para o lado para ver os outros.

10. Na faixa Linha do tempo, clique em "Ver tudo". Por quê: a lista completa, agrupada por dia, fica num modal. O que você deve ver: o modal "Linha do tempo", com o nome da matéria no alto, os eventos de cada dia com a hora e a frase, e o botão Fechar. Feche com Fechar.

11. Clique na tag Materiais. Por quê: trocar de tag navega, e a rota passa a ser a da tag. O que você deve ver: a lista trocar para a área de soltar e a lista de arquivos, com uma mola curta; a contagem de cada tag (Notas, Materiais, Mapa de conteúdo) ao lado do nome. Se houver custo da visão nos materiais, ao lado do seletor aparece "Visão: US$ …". Depois, clique em Mapa de conteúdo: se o mapa já tiver custo, aparece "Mapa: US$ …".

12. Aperte F5 com a tag Mapa de conteúdo aberta. Por quê: o endereço guarda o caderno e a tag. O que você deve ver: depois de recarregar, a mesma tag Mapa de conteúdo, no mesmo caderno. Repita com a tag Materiais.

13. Clique na tag Notas e use as setas do teclado no seletor. Por quê: as setas andam entre as tags e já escolhem a tag. O que você deve ver: a seta para a direita leva a Materiais; a seta para a esquerda, a partir de Notas, vai para Mapa de conteúdo; End vai para Mapa de conteúdo; Home volta para Notas. Termine com a tag Notas aberta para o passo seguinte.

14. Na tag Notas, clique numa nota (ou em "Nova nota" e crie uma de teste). Por quê: a nota abre na área toda, no lugar do painel. O que você deve ver: o editor ocupando a área abaixo da aba, sem as faixas. Clique em "Voltar": o painel volta com a tag Notas escolhida.

15. Abra uma nota que tenha uma menção a um arquivo de material, ou escreva numa nota de teste "[[" e escolha um arquivo da lista. Por quê: a menção leva à tag Materiais com o arquivo em destaque. O que você deve ver: ao clicar na menção, o painel abre a tag Materiais com o arquivo destacado na lista. A tag Materiais continua na lista do caderno, não abre uma tela nova.

16. Abra o app no Edge normal (não no modo app) e, na barra de endereço, troque o que vem depois de caderno/<id da matéria> por /linha-do-tempo e, depois, por /cursos. Por quê: são as rotas antigas, que agora caem na tag Notas. O que você deve ver: o caderno abre na tag Notas, sem erro e sem tela em branco, nas duas.

17. Diminua a janela até ficar com cerca de 375 px de largura. Por quê: confere a tela estreita. O que você deve ver: a página não ganha rolagem para o lado. Só as faixas (Cursos e Linha do tempo) rolam para o lado, dentro delas. As tags do seletor continuam visíveis, e a capa, o nome e a foto do professor continuam na aba.

18. Desligue os efeitos de animação do Windows: Configurações, Acessibilidade, Efeitos visuais, "Efeitos de animação" desligado. Recarregue o app com F5. Por quê: com movimento reduzido, o app não usa as molas nem as entradas animadas. O que você deve ver: as faixas, a lista de tags e as trocas de tela aparecem direto, sem deslizar. O leque e a capa continuam respondendo ao mouse, só sem as animações. Depois, religue os efeitos.


## Resultado

Para cada passo, escreva ok ou o que aconteceu de diferente:

1. Entrada no caderno:
2. Leque de capas:
3. Capa que edita:
4. Foto do professor e a conversa:
5. Curso pronto:
6. Rascunho e Sair:
7. Descartar com confirmação:
8. Novo curso:
9. Linha do tempo e o balão:
10. Ver tudo:
11. Tags e o custo:
12. F5 na tag:
13. Setas do teclado no seletor:
14. Nota e Voltar:
15. Menção a material:
16. Rotas antigas:
17. Janela estreita:
18. Movimento reduzido:
