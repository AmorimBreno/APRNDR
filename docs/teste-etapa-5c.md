# Teste do item 5, parte C: o esqueleto e o curso pronto

Objetivo: confirmar que a etapa Esqueleto do guia monta os módulos com o professor, que dá para editar os módulos (nome, objetivo, tipo, horas, conceitos, ordem, módulo novo e apagar) e as edições ficam salvas, que o calendário é calculado na hora e avisa quando o prazo aperta, que "Criar curso" leva à visão do curso pronto, que a lista, a linha do tempo e o curso.json mostram o curso pronto, e que o professor lê os módulos. No fim, uma seção à parte confere o código, os vetores e as matrizes na conversa e nas questões do diagnóstico. O contrato está em docs/cursos.md, seção "Parte C: o esqueleto e o curso pronto", e em docs/markdown-da-conversa.md.

Tempo: uns 30 minutos. Custo esperado: uns 2 a 3 centavos de dólar. Cada geração do esqueleto chama o GPT-6.1 Sol, custa por volta de 1 centavo de dólar e leva uns 10 s (o teste real deu 7 módulos em 10 s por US$ 0,010). O roteiro gera o esqueleto duas vezes ("Gerar de novo" no passo 20). A parte de código e vetores custa a conversa com o professor, menos de 1 centavo.

Os passos usam uma matéria de teste, "Teste do esqueleto", apagada no fim pelo Explorador (a pasta G:\Meu Drive\estudos-dados\materias\teste-do-esqueleto).

Atenção: para chegar ao Esqueleto, o diagnóstico grava eventos em G:\Meu Drive\estudos-dados\aprendiz\eventos.jsonl, que é só de acréscimo. Eles não somem quando a matéria de teste é apagada. Todos levam objeto.materia "teste-do-esqueleto", para dar para separar depois. Os eventos do esqueleto (gerou_esqueleto e criou_curso) vão só para o eventos.jsonl da matéria.

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo (a extensão dos cursos com o esqueleto e o Markdown novo).
2. Abra o app pelo atalho "Estudos", crie a matéria "Teste do esqueleto" e, na seção Cursos, comece um curso pelo guia (por exemplo, "Probabilidade básica"). No Básico, ponha um prazo daqui a umas 4 semanas e 4 horas por semana. Siga as etapas até o Diagnóstico (com "Continuar sem material" e "Montar a partir do tema", deixando uns 6 a 10 conceitos marcados), responda o diagnóstico e clique em "Concluir diagnóstico". Por quê: o esqueleto precisa de um curso com o diagnóstico concluído. O que você deve ver: a etapa Esqueleto aberta.
3. Abra o Explorador em G:\Meu Drive\estudos-dados. Por quê: alguns passos olham o curso.json e o eventos.jsonl da matéria.

Nota: trocar de conversa durante a geração do esqueleto encerra a sessão do pi e para a chamada. Durante esses passos, fique no guia.


## Teste

### Montar o esqueleto

1. Olhe a etapa Esqueleto. Por quê: ainda não há proposta. O que você deve ver: o texto "O professor agrupa os conceitos do curso em módulos, usando o diagnóstico, e o calendário sai das suas horas por semana e do prazo." e o primário "Montar o esqueleto".

2. Clique em "Montar o esqueleto". Por quê: a chamada ao GPT-6.1 Sol (uns 10 s). O que você deve ver: a etiqueta "Gerando", o professor animado e "O professor está montando os módulos…". No fim, os módulos à esquerda e o calendário à direita.

3. Olhe o topo e os módulos. Por quê: o que cada módulo mostra. O que você deve ver: no topo, "N módulos · M conceitos" e "Gerar de novo". Em cada módulo: o número (01, 02, …) na primeira linha, com os controles; o nome sem caixa alta, sem quebrar no meio das palavras; o objetivo embaixo, na largura toda do bloco; o tipo (Normal, Curto ou Revisão); as horas; e os conceitos como etiquetas.

### Editar os módulos

4. Clique no nome de um módulo, mude o texto e aperte Enter. Faça o mesmo no objetivo. Por quê: editar no lugar. O que você deve ver: o texto novo no lugar, sem abrir outra tela.

5. Troque o tipo de um módulo (por exemplo, de Normal para Revisão). Por quê: o tipo do módulo. O que você deve ver: o tipo novo no módulo.

6. Mude as horas de um módulo para mais e olhe o calendário. Por quê: o calendário é calculado na hora. O que você deve ver: as datas dos módulos seguintes e o resumo ("N h em M dias") mudam logo, sem esperar o servidor.

7. Aumente as horas de vários módulos até o plano não caber no prazo. Por quê: o aviso do prazo apertado. O que você deve ver: no calendário, o aviso "No prazo, este plano pede cerca de N h por semana; você disse M." (M são as 4 h do Básico). Volte as horas para caber, se quiser.

8. Num conceito de um módulo, abra o menu da etiqueta e escolha "Mover para…" outro módulo. Por quê: mover um conceito. O que você deve ver: as opções no formato "Módulo 02 · Nome"; o conceito sai do módulo e aparece no escolhido.

9. Use "Subir" e "Descer" num módulo. Por quê: a ordem. O que você deve ver: o módulo troca de lugar com o vizinho, os números se refazem e o calendário acompanha a ordem nova.

10. Clique em "Módulo novo". Por quê: um módulo vazio bloqueia o Criar curso. O que você deve ver: um módulo novo no fim, sem conceitos, com "Mova conceitos para cá pelo menu dos conceitos."; "Criar curso" desligado com o motivo "O módulo NN está vazio: mova conceitos para ele ou apague-o.". Mova um conceito para ele: o motivo some (se o módulo estiver sem nome, o motivo passa a ser "Dê um nome ao módulo NN.").

11. Apague um módulo com conceitos, pelo X dele. Por quê: os conceitos não se perdem. O que você deve ver: a confirmação "Apagar o módulo NN (nome)?" com "Os conceitos vão para o módulo anterior." (no primeiro módulo, "… para o módulo seguinte.") e os botões "Manter" e "Apagar". Clique em "Apagar": o módulo some e os conceitos dele aparecem no anterior.

12. Clique em "Módulo novo", mova um conceito para ele e deixe-o sem nome. Clique em Sair. Por quê: um módulo sem nome não é salvo. O que você deve ver: o aviso "Sair sem salvar?" com "As mudanças do esqueleto que ainda não foram salvas se perdem (um módulo vazio ou sem nome não é salvo)." e os botões "Continuar aqui" e "Sair". Clique em "Continuar aqui" e dê um nome ao módulo.

13. Espere um segundo e aperte F5. Por quê: as edições ficam salvas. O que você deve ver: o guia volta no Esqueleto com os módulos como você deixou (nomes, objetivos, tipos, horas, conceitos e a ordem).

### O calendário

14. Olhe o calendário. Por quê: as datas calculadas pelo código. O que você deve ver: no topo, o prazo ("Prazo: …") e as horas por semana; uma linha por módulo com o início e o fim ("de 27/10 a 02/11") e a avaliação no dia seguinte ao fim ("avaliação 03/11"); o primeiro módulo começa amanhã; os módulos em sequência, sem sobrepor; no fim, "Avaliação geral DD/MM" no dia anterior ao prazo; e o resumo "N h em M dias".

### Gerar de novo

15. Clique em "Gerar de novo", no topo. Por quê: descartar a proposta. O que você deve ver: "Gerar outro esqueleto?" com "As suas edições nesta proposta se perdem." e os botões "Manter este" e "Gerar outro". Clique em "Manter este": nada muda. Clique de novo e em "Gerar outro": a geração recomeça (por volta de 1 centavo, uns 10 s) e vem uma proposta nova.

### Criar curso

16. Com a proposta sem módulo vazio nem sem nome, clique em "Criar curso". Por quê: o curso fica pronto. O que você deve ver: a visão do curso, com "Curso · Teste do esqueleto" e o nome do curso no topo, e os botões "Cursos" e "Rever o guia".

17. Olhe a visão do curso. Por quê: a ficha e os módulos. O que você deve ver: a "Ficha do curso" com as horas no total e as leituras (prazo, horas por semana, módulos, conceitos, tipo e escopo); em "Módulos", um card por módulo com o número, o nome, os conceitos e as horas; o primeiro como próximo, com "Gerar módulo" e a etiqueta "Em breve"; os outros bloqueados; embaixo de cada card, o objetivo e as datas ("de 27/10 a 02/11 · avaliação 03/11"); e o calendário gravado, igual ao da etapa.

18. Clique em "Cursos". Por quê: a lista da seção Cursos. O que você deve ver: o curso com a etiqueta "Pronto · N módulos" e o botão "Abrir" (sem Continuar e sem Descartar). Clique em "Abrir": volta à visão do curso.

19. Clique em "Rever o guia". Por quê: o guia de um curso pronto é só para leitura. O que você deve ver: todas as etapas feitas no trilho; as etapas sem campos para mudar; o Esqueleto com os módulos e o calendário, sem "Gerar de novo", sem "Módulo novo", sem os controles dos módulos e sem "Criar curso".

### Disco, linha do tempo e professor

20. Volte ao caderno e abra a linha do tempo. Por quê: os eventos da matéria. O que você deve ver: "Esqueleto proposto: <curso>" (duas vezes, uma por geração) e "Curso criado: <curso>".

21. No Explorador, abra materias\teste-do-esqueleto\cursos\<curso>\curso.json no Bloco de Notas. Por quê: o curso pronto fica legível na pasta de dados. O que você deve ver: "situacao": "pronto"; "esqueleto" com os módulos (nome, objetivo, conceitos, tipo, horas) e o "calendario" (início, fim e avaliação de cada módulo, a avaliação geral e os avisos); nenhum "esqueletoEmAndamento".

22. Clique em "Conversar sobre a matéria" e pergunte "quais são os módulos do curso?". Por quê: o professor lê o esqueleto. O que você deve ver: no grupo das ferramentas, a chamada ler_curso; a resposta lista os módulos na ordem, com as datas ou as horas.

23. No fim, feche o app e apague a pasta materias\teste-do-esqueleto pelo Explorador. Por quê: a matéria de teste não é sua. Os eventos do aprendiz\eventos.jsonl ficam (o arquivo é só de acréscimo); não os apague.


## Código e vetores

O pedido de 2026-10-26: o código, os vetores e as matrizes aparecerem desenhados nas questões e na conversa.

24. Abra o app, entre numa conversa qualquer (por exemplo, "Conversar sobre a matéria" em qualquer caderno) e mande ao professor: "Repita exatamente o texto abaixo, sem mudar nada:" seguido do texto de amostra:

````
Use `len(x)` e `sorted(v, reverse=True)`.

```python
def media(notas):
    """Média."""
    if not notas:  # vazia
        return 0.0
    return sum(notas) / len(notas)
```

```vetor
# idades
[6, 3, 8, 12, 11, 'a', None]
```

```matriz
# distâncias
[[0, 5, 9],
 [5, 0, 4],
 [9, 4, 0]]
```
````

Por quê: o Markdown do app. O que você deve ver, na resposta (e também na sua mensagem, se ela usar o mesmo Markdown):
- o código em linha (`len(x)`, `sorted(...)`) com fundo e cor próprios, destacado do texto;
- o bloco python num fundo escuro de editor, com "python" na barra de cima, cores diferentes para as palavras-chave (def, if, return), a string, o comentário e os números, e os números de linha (1 a 5) à esquerda; ao copiar o código, os números não vão junto;
- o vetor como uma fileira de caixas, com a legenda "idades", um valor em cada caixa e o índice (0 a 6) embaixo de cada uma;
- a matriz como uma grade 3 por 3, com a legenda "distâncias", os índices das colunas em cima e os das linhas à esquerda.

25. Num caderno com um curso na etapa Diagnóstico (pode ser o diagnóstico em andamento de um curso seu, só olhando, ou um curso de teste), abra uma questão que tenha código ou um cenário antes da pergunta. Por quê: a questão com contexto em duas colunas. O que você deve ver, com a janela larga: o contexto (o cenário e o código) à esquerda; à direita, a pergunta, a confiança, as alternativas e "Responder". O código aparece em bloco, com as cores e os números de linha. Estreite a janela: as duas partes ficam uma embaixo da outra.

26. Se tiver uma questão gerada antes deste ajuste (por exemplo, a do Word2Vec do seu diagnóstico em andamento), olhe-a também. Por quê: as questões antigas são divididas só na hora de mostrar. O que você deve ver: o mesmo arranjo em duas colunas, com a última frase com ponto de interrogação como a pergunta e o código do enunciado em bloco. Não responda, se for o seu diagnóstico de verdade.


## Resultado

Anote "ok" ou o que aconteceu:

1. Sem proposta e "Montar o esqueleto":
2. A espera com o professor:
3. Os módulos (número, nome sem caixa alta, objetivo, tipo, horas, conceitos):
4. Nome e objetivo no lugar:
5. Trocar o tipo:
6. Horas mudando o calendário na hora:
7. Aviso das horas por semana:
8. Mover para…:
9. Subir e descer:
10. Módulo novo bloqueando o Criar curso:
11. Apagar um módulo:
12. Sair sem salvar?:
13. F5 com as edições:
14. Calendário (datas, avaliações, avaliação geral):
15. Gerar de novo com a confirmação:
16. Criar curso levando à visão do curso:
17. Ficha, cards, Gerar módulo · Em breve, datas e calendário:
18. Lista com "Pronto · N módulos" e Abrir:
19. Rever o guia só para leitura:
20. Linha do tempo:
21. curso.json:
22. Professor com ler_curso:
23. Limpeza:
24. Código, código em linha, vetor e matriz na conversa:
25. Questão com contexto em duas colunas:
26. Questão antiga em duas colunas:
