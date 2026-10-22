# Teste do item 5, parte A: guia de criação de curso (Básico a Mapa)

Objetivo: confirmar que a seção Cursos do caderno lista os cursos e abre o guia de criação, que as etapas Básico, Materiais, Objetivo e Mapa funcionam e ficam salvas como rascunho, que o mapa sem material é montado a partir do tema, que mudar uma etapa confirmada avisa antes o que ela descarta, que o rascunho pode ser descartado, e que o professor lê os cursos. O contrato está em docs/cursos.md.

Tempo: uns 30 minutos. Custo esperado: uns 3 centavos de dólar. "Montar a partir do tema" chama o Sonnet 5.5 (uns 2 centavos; o teste real deu US$ 0,018). O mapeamento do material pequeno e a pergunta ao professor custam alguns centavos.

Os passos usam uma matéria de teste, "Teste do curso", criada no passo 1 e apagada no fim pelo Explorador (a pasta G:\Meu Drive\estudos-dados\materias\teste-do-curso).

Você vai precisar de um material pequeno: um markdown ou um PDF curto (uma ou duas páginas) sobre qualquer assunto.

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo (a extensão dos cursos).
2. Abra o Explorador em G:\Meu Drive\estudos-dados\materias. Por quê: alguns passos olham o curso.json e o eventos.jsonl.

Nota: trocar de conversa durante o "Montar a partir do tema" ou um mapeamento encerra a sessão do pi e para a chamada. Durante esses passos, fique no guia.


## Teste

### Seção Cursos e Básico

1. Abra o app pelo atalho "Estudos", crie a matéria "Teste do curso" e abra o caderno dela. Pelo Editar do caderno, dê à matéria uma prova com data futura (por exemplo, P1 daqui a um mês). Por quê: o prazo do curso vem das provas da matéria. O que você deve ver: a prova salva no caderno.

2. Abra a seção Cursos. Por quê: a seção vazia. O que você deve ver: "Nenhum curso ainda" e o botão "Novo curso". Clique em "Novo curso".

3. Olhe a tela do guia. Por quê: o guia é uma tela inteira, não um modal. O que você deve ver: a tela cobre o caderno; em cima, "Sair"; o trilho das seis etapas (Básico, Materiais, Objetivo, Mapa, Diagnóstico e Esqueleto) com Básico atual; a rota termina em .../cursos/novo.

4. Escreva o nome "Probabilidade básica". Em Prazo, olhe as opções. Por quê: o prazo pelas provas. O que você deve ver: a prova da matéria como opção ("P1 · <data> · em N dias"), "Outra data" e "Sem prazo". Escolha "Outra data": aparece o campo Data. Escolha "Sem prazo": o campo some. Deixe na prova.

5. Em "Horas por semana", escreva 3,5 (ou 3.5) e clique em Continuar. Por quê: as horas aceitam meia hora, e Continuar cria o rascunho. O que você deve ver: o guia passa para Materiais; a rota muda para .../cursos/probabilidade-basica/guia/materiais. Aperte F5: o guia volta na etapa Materiais.

### Materiais e Objetivo

6. Na etapa Materiais, sem nenhum arquivo, olhe o primário. Por quê: a etapa pode ser pulada. O que você deve ver: o botão "Continuar sem material". Clique nele.

7. Na etapa Objetivo, olhe as opções. Por quê: "Só o material" precisa de material. O que você deve ver: em Escopo, "Só o material" desligado com "Precisa de material: volte à etapa Materiais."; os padrões marcados (Escopo Livre e Tipo Misto); o campo "Por que você vai estudar isto". Escreva um motivo curto e clique em Continuar.

### Mapa a partir do tema

8. Na etapa Mapa, olhe o corpo. Por quê: sem material e com escopo livre, o mapa vem do tema. O que você deve ver: "Sem mapa ainda" e o botão "Montar a partir do tema". Clique nele.

9. Espere os conceitos chegarem (uns 10 a 20 segundos). Por quê: a chamada ao Sonnet 5.5. O que você deve ver: enquanto monta, o primário desligado com "Espere os conceitos do tema chegarem."; no fim, a lista dos conceitos em ordem de estudo, cada um com a etiqueta "Do tema" e uma caixa de marcar, todos marcados, e "N de N conceitos neste curso".

10. Desmarque dois conceitos. Depois clique em "Desmarcar todos" e em "Marcar todos". Desmarque dois de novo. Por quê: a seleção do curso. O que você deve ver: a contagem acompanha ("N-2 de N conceitos neste curso"); com tudo desmarcado, o primário fica desligado com "Marque pelo menos um conceito para o curso.".

11. Num conceito, mude a prioridade, mude o nome no lugar e use Subir. Depois tire um conceito do mapa, abra "Fora do mapa" e clique em "Apagar" nele. Por quê: a revisão é a mesma da seção Mapa de conteúdo, e um conceito do tema pode ser apagado. O que você deve ver: tudo como na seção Mapa de conteúdo; o conceito apagado some também de "Fora do mapa" e a contagem total diminui.

12. Clique em "Aprovar o mapa e continuar". Por quê: aprovar o mapa da matéria e confirmar a etapa. O que você deve ver: a etapa Diagnóstico com "O diagnóstico chega na próxima parte" e "Voltar para os cursos". Aperte F5 numa etapa Mapa (clique nela no trilho): a seleção volta como você deixou.

### Avisos antes de descartar

13. Clique em Objetivo no trilho, troque o Escopo para "Material como base" e clique em Continuar. Por quê: mudar o escopo de ou para Livre descarta o Mapa. O que você deve ver: o aviso "Mudar Objetivo descarta: Mapa. Continuar?", com "A etapa descartada volta a ficar por fazer.". Clique em "Manter como estava": nada muda.

14. Repita o passo 13 e clique em "Descartar e continuar". Por quê: descartar de fato. O que você deve ver: o guia vai para a etapa Mapa, sem a seleção anterior (no trilho, Mapa volta a ficar por fazer). Os conceitos continuam no mapa da matéria.

15. Clique em Materiais no trilho e adicione o material pequeno (solte o arquivo na área). Por quê: o material processa enquanto você segue. O que você deve ver: o arquivo na lista e o aviso "Processando" ("1 arquivo ainda processando; você pode seguir…"); quando fica Pronto, o primário é "Continuar". Clique em Continuar (confirme o aviso de descarte, se aparecer) e vá até a etapa Mapa.

16. Na etapa Mapa, espere o material ser mapeado. Por quê: o mapa com material. O que você deve ver: os conceitos do material entram na lista, sem a etiqueta "Do tema", ao lado dos do tema; a contagem "N de M conceitos neste curso"; enquanto mapeia, o primário desligado com "Espere o mapeamento terminar.". Clique em Continuar (ou "Aprovar o mapa e continuar", se o mapa mudou depois da aprovação).

17. Volte à etapa Materiais pelo trilho, adicione um segundo arquivo pequeno, espere ficar Pronto e vá para a etapa Mapa sem confirmar Materiais de novo. Por quê: os materiais mudaram depois da confirmação. O que você deve ver: o aviso "Os materiais mudaram desde a etapa Materiais." com "Rever materiais".

18. Numa etapa, mude algo (por exemplo, o motivo no Objetivo) e clique em "Sair" sem confirmar. Por quê: sair com mudança não confirmada. O que você deve ver: "Sair sem confirmar esta etapa?" com "O que já foi confirmado fica salvo.", e os botões "Continuar aqui" e "Sair". Clique em Sair.

### Lista, linha do tempo e arquivo

19. Na seção Cursos, olhe a linha do curso. Por quê: a lista dos rascunhos. O que você deve ver: o nome, a etiqueta "Rascunho · parou em <etapa>" em âmbar, o prazo e "editado há…", e os botões "Descartar" e "Continuar". Clique em Continuar: o guia abre na etapa onde parou. Saia de novo.

20. No Explorador, abra materias\teste-do-curso\cursos\probabilidade-basica\curso.json no Bloco de Notas. Por quê: o curso fica legível na pasta de dados. O que você deve ver: um JSON com tabulação, com "situacao": "rascunho", "etapa", "basico" (prazo, prova, "horasPorSemana": 3.5), "materiais", "objetivo" e "mapa" com os ids dos conceitos. O formato está em docs/cursos.md.

21. Volte ao caderno e clique em "Conversar sobre a matéria". Pergunte "que cursos esta matéria tem?". Por quê: o professor lê os cursos. O que você deve ver: no grupo das ferramentas, a chamada ler_curso; a resposta cita o rascunho "Probabilidade básica" e a etapa onde ele parou.

22. Na seção Cursos, clique em "Descartar". Por quê: descartar um rascunho. O que você deve ver: "Descartar o rascunho Probabilidade básica?" com "A pasta do curso é apagada." e os botões "Manter" e "Descartar". Clique em Manter: nada muda. Clique de novo em Descartar e confirme: o curso sai da lista ("Nenhum curso ainda") e a pasta cursos\probabilidade-basica some do Explorador.

23. Abra a linha do tempo do caderno. Por quê: os eventos dos cursos. O que você deve ver: "Curso começado: Probabilidade básica", "Mapa montado a partir do tema …", "Mapa aprovado" e "Rascunho descartado: Probabilidade básica".

24. No fim, feche o app e apague a pasta materias\teste-do-curso pelo Explorador. Por quê: a matéria de teste não é sua.

## Resultado

Anote "ok" ou o que aconteceu:

1. Matéria de teste com a prova:
2. Seção vazia e Novo curso:
3. Tela inteira e o trilho:
4. Prazo (prova, Outra data, Sem prazo):
5. Horas com 0,5, rascunho criado e F5:
6. Continuar sem material:
7. Objetivo ("Só o material" desligado, padrões):
8. Montar a partir do tema:
9. Conceitos "Do tema" e a contagem:
10. Marcar e desmarcar:
11. Revisão e apagar conceito do tema:
12. Aprovar o mapa e continuar, Diagnóstico e F5:
13. Aviso e Manter como estava:
14. Descartar e continuar:
15. Material processando:
16. Mapa com material:
17. Os materiais mudaram:
18. Sair com mudança:
19. Lista e Continuar:
20. curso.json:
21. Professor com ler_curso:
22. Descartar o rascunho:
23. Linha do tempo:
24. Limpeza:
