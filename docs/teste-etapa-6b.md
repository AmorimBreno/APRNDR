# Teste do item 6, parte B: a visão do módulo gerado

Objetivo: confirmar que o "Abrir" do card gerado leva à visão do módulo; que a aba do curso no topo mostra o módulo, a trilha e a próxima lição; que o índice das lições, o aviso de visualização e o cabeçalho da lição aparecem; que cada bloco tem o número e o rótulo certos, com "Além do material" nos complementos; que código, fórmulas, vetores e o R$ saem certos; que a régua acompanha a leitura; que a pergunta, a questão e a dissertativa mostram a resposta, o gabarito e a rubrica só quando você pede; que as referências abrem o material; e que a navegação entre lições, o F5 e a trilha funcionam. O contrato está em docs/modulos.md.

Tempo: uns 20 minutos. Custo: nenhum. Este roteiro só lê módulos já gerados; não chama o modelo.

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo.
2. Tenha um curso pronto com pelo menos um módulo gerado (pelo roteiro docs/teste-etapa-6a.md). Para os passos 21 e 22, o ideal é ter dois módulos gerados, e o primeiro com pelo menos duas lições.
3. Abra o app pelo atalho "Estudos", entre no caderno do curso e, na seção Cursos, clique em "Abrir" no curso. O que você deve ver: a visão do curso, com a ficha e os módulos.


## Teste

### Abrir o módulo

1. No card do módulo gerado, clique em "Abrir". Por quê: o "Abrir" passou a funcionar. O que você deve ver: a visão do módulo, sem a etiqueta "Em breve"; a aba do caderno some e, no lugar dela, a aba tijolo do curso.

### A aba do curso no topo

2. Olhe a aba no topo. Por quê: a CourseBar. O que você deve ver: à esquerda, "Curso" para voltar; o título "Módulo NN · nome"; acima dele, o nome do curso e a lição ("<curso> · lição 1 de N"); a trilha dos módulos, com o aberto marcado como atual, os outros gerados normais, os não gerados tracejados e a "Avaliação geral" no fim; à direita, "Próxima lição".
3. Clique em "Curso". Por quê: voltar. O que você deve ver: a visão do curso. Clique em "Abrir" de novo para voltar ao módulo.

### O índice e o aviso

4. Olhe à esquerda. Por quê: o índice das lições. O que você deve ver: "Lições" com a lista numerada (01, 02, …); a lição atual destacada; embaixo, o resumo "N lições · M questões · gerado em dd/mm".
5. Olhe o alto da coluna de leitura. Por quê: o aviso. O que você deve ver: "Visualização" com o texto "Visualização do módulo. Responder às questões e pedir outra explicação chegam com a aula (item 7)." e um X para fechar.
6. Feche o aviso e aperte F5. Por quê: o aviso é lembrado. O que você deve ver: o aviso some e não volta depois do F5.

### A lição e os blocos

7. Olhe o cabeçalho da lição. O que você deve ver: "Lição 1 de N", o título e, embaixo, o objetivo.
8. Desça pelos blocos. Por quê: o número e o rótulo de cada bloco. O que você deve ver: cada bloco com o número na margem e o rótulo pelo tipo: "Explicação", "Exemplo resolvido", "Exemplo para completar", "Problema aberto", "Pergunta", "Questão" ou "Dissertativa" (nem toda lição tem todos).
9. Procure um bloco com a etiqueta "Além do material". Por quê: os complementos. O que você deve ver: a etiqueta só nas explicações que vão além dos seus materiais (passe o mouse: "Este bloco vai além dos seus materiais."). Se nenhuma lição tiver, anote "não apareceu".
10. Olhe o código, as fórmulas e os valores em reais. Por quê: o Markdown da lição. O que você deve ver: o código com cores; as fórmulas desenhadas, sem texto em vermelho; vetores e matrizes em caixas; um valor como "R$ 46" como texto normal, não como fórmula.

### A régua

11. Olhe a margem da coluna de leitura, ao lado dos blocos. Por quê: a régua dos blocos. O que você deve ver: um traço por bloco; passe o mouse num traço e veja o número e o rótulo (por exemplo "03 · Questão").
12. Role a lição devagar. O que você deve ver: o traço do bloco que está no meio da tela fica marcado e muda conforme você lê.
13. Clique num traço lá de baixo. O que você deve ver: a lição rola até aquele bloco.

### Respostas e gabaritos

14. Numa "Pergunta", clique em "Ver resposta". O que você deve ver: a resposta esperada aparece e o botão vira "Esconder resposta".
15. Numa "Questão", clique em "Ver gabarito". O que você deve ver: as alternativas continuam sem poder marcar; a correta marcada; embaixo de cada errada, a confusão dela ("Quem escolhe esta …"); e a "Explicação". Clique em "Esconder gabarito": tudo volta como antes.
16. Numa "Dissertativa", clique em "Ver rubrica e resposta-modelo". O que você deve ver: "Rubrica · N pontos" com os critérios e a "Resposta-modelo". O botão vira "Esconder rubrica e resposta-modelo".

### Referências

17. Clique numa etiqueta de referência embaixo de um bloco (o nome do arquivo e o local). Por quê: as referências do mapa. O que você deve ver: a seção Materiais do caderno com aquele material aberto.

### Entre lições

18. Volte ao módulo e clique em "Próxima lição" (no pé da lição ou na aba). O que você deve ver: a lição 2; o índice destaca a 02; a aba mostra "lição 2 de N"; a rota termina em …/modulos/m1/l2. Na última lição, o botão vira "Voltar ao curso".
19. Clique em "Lição anterior" no pé. O que você deve ver: a lição 1 de novo. Na primeira lição, "Lição anterior" fica desligado.
20. Vá para a lição 2 e aperte F5. Por quê: a rota guarda a lição. O que você deve ver: o app volta na mesma lição 2, não na primeira.

### A trilha

21. Na trilha da aba, clique em outro módulo gerado. O que você deve ver: a visão daquele módulo, com ele como atual na trilha e a lição 1 aberta. Os não gerados (tracejados) e a "Avaliação geral" não abrem. Se só houver um módulo gerado, anote "não deu para testar".

### Tela estreita

22. Deixe a janela do app estreita (arraste a borda até a metade da tela ou menos). Por quê: o layout estreito. O que você deve ver: no lugar do índice à esquerda, uma faixa de fichas das lições (o número e o título) acima da lição, com a atual destacada; a régua some. Clique numa ficha: abre aquela lição.


## Resultado

Anote "ok" ou o que aconteceu:

1. Abrir leva à visão do módulo:
2. Aba do curso (título, kicker, trilha, Próxima lição):
3. Curso para voltar:
4. Índice com a atual e o resumo:
5. Aviso de visualização:
6. Aviso fechado não volta depois do F5:
7. Cabeçalho da lição:
8. Número e rótulo dos blocos:
9. Além do material:
10. Código, fórmulas, vetores e R$:
11. Régua com um traço por bloco:
12. Régua seguindo a leitura:
13. Clique na régua rola até o bloco:
14. Ver resposta:
15. Ver gabarito e Esconder gabarito:
16. Ver rubrica e resposta-modelo:
17. Referência abre o material:
18. Próxima lição e a rota:
19. Lição anterior:
20. F5 na lição 2:
21. Trilha para outro módulo:
22. Fichas na tela estreita:
