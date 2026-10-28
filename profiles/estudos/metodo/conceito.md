# Conceito

A explicação de formato `conceito`: a teoria de uma ideia, com o porquê, antes do exemplo.

O objetivo é o aluno entender, não decorar: o fato novo precisa sair de coisas que ele já aceita e se ligar a elas. Dois princípios guiam o bloco.

## Verdades incondicionais primeiro

- Comece pelo que o aluno pode aceitar como está, sem ressalvas: uma definição de verdade (não uma lista de propriedades vagas) ou uma afirmação universal ("todo X é Y", "nenhum X é Y"). Se a frase precisa de "em geral" ou "quase sempre", ela ainda não é o ponto de partida: desça até um fato mais simples.
- Construa o resto em cima disso, mostrando de qual fato cada passo depende.
- Defina cada termo antes de usá-lo. Um termo novo por vez.

## "Como eu poderia ter descoberto isso?"

- Nada aparece do nada. Parta do problema que a ideia resolve (o da introdução, quando servir) e motive cada passo: por que esta fórmula, por que esta conta, o que levaria alguém a tentar isto.
- O porquê vem antes do como: primeiro a razão de a ideia existir, depois o procedimento.
- Ligue a ideia ao que veio antes na lição: diga de qual fato ela depende.
- O aluno deve sentir que poderia ter chegado lá sozinho.

## A forma

- Parágrafos curtos, de 2 a 4 frases. Cada parte da explicação ganha um subtítulo `###` curto ("### Por que o log"), em vez de um número em negrito no começo do parágrafo. Nenhum título acima de `###`.
- Itens paralelos (propriedades, casos, opções) vão numa lista.
- Um caso pequeno com números, dados ou código ajuda a fixar a definição; o exemplo completo fica para o bloco seguinte.
- Código: um trecho curto num bloco de código, e o texto explica as partes que importam citando cada uma exatamente como aparece no bloco.
- Analogia só quando ela esclarece de verdade, e dizendo onde ela para de valer.
- Use a notação e os nomes do material quando o curso usa material.
- Pelo menos 900 caracteres; mire de 1.200 a 2.500.

## O que evitar

- Começar por uma lista de propriedades no lugar da definição.
- Fórmula jogada sem dizer de onde ela vem.
- Enrolação: "neste bloco vamos ver", resumo repetindo o que acabou de ser dito, elogio.
- Afirmar o que não é certo. Na dúvida sobre um detalhe, deixe-o de fora.

## Exemplo pequeno

> ### O que o IDF mede
>
> Todo termo de uma coleção aparece em algum número de documentos, de 1 a $N$. Esse número é a frequência nos documentos, $df(t)$. Um termo com $df(t) = N$ está em todos os documentos e, por isso, não ajuda a separar um documento do outro.
>
> ### Por que a razão $N / df(t)$
>
> Queremos um peso que cresça quando o termo fica raro. A razão $N / df(t)$ faz isso: vale 1 para o termo que está em todos e 1.000 para o que está em um documento de mil.
>
> ### Por que o log
>
> Um termo mil vezes mais raro não deveria pesar mil vezes mais. O logaritmo encolhe essa escala: $\log(1) = 0$ e $\log(1000) = 3$. Assim, $idf(t) = \log(N / df(t))$.
