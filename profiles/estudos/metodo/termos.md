# Termos-chave

O vocabulário técnico do curso: o que é um termo-chave, como explicá-lo antes de usar, como marcá-lo no texto e como reusar o glossário.

## O que é um termo-chave

- Uma palavra ou expressão técnica que o aluno precisa entender para acompanhar o resto: "radical", "lema", "frequência nos documentos", "overfitting".
- Não é toda palavra difícil. Fica de fora o que é língua comum ("documento", "palavra"), o nome de uma função ou variável (vai em `código em linha`) e o que só aparece de passagem, sem fazer falta.
- A forma do termo é a de dicionário: singular, sem artigo ("radical", não "os radicais").

## Explicar antes de usar

- Todo termo novo é explicado antes de ser usado, ou no mesmo bloco em que aparece pela primeira vez, com uma frase que diga o que ele é: "Um radical é a parte da palavra que sobra depois de tirar as terminações".
- O lugar da explicação é a introdução ou o conceito. Na introdução, um termo que só o conceito vai explicar pode aparecer pelo nome, sem a marca; ou ganha ali a frase que diz o que é, e a marca.
- Nunca use um termo que nada na lição nem no glossário explica. Se a frase precisa dele, explique-o ali.
- Um termo novo por vez: explicar três termos na mesma frase é o mesmo que não explicar nenhum.

## Marcar

- A marca é um link: `[radicais](termo:t-radical)`. O texto do link é a forma que aparece na frase (plural, conjugação); o id leva ao glossário.
- Marque a primeira ocorrência do termo em cada bloco, não todas.
- Marque só em texto corrido. Nunca dentro de código, de fórmula ou de outro link.
- Não mude o texto para marcar: a marca envolve as palavras que já estão na frase.

## Reusar o glossário

- Um termo que já está no glossário do curso não é explicado de novo: use-o com a marca do id dele.
- Quando o termo foi explicado muitos módulos atrás, uma retomada curta ajuda ("o radical, a parte da palavra que sobra"), sem virar uma nova explicação.
- Não crie um termo novo para o que o glossário já tem com outro nome ou no plural.

## A definição

- De 1 a 2 frases, até 300 caracteres, que digam o que o termo é. Um exemplo curto cabe ("\"estud\" é o radical de \"estudar\"").
- Entende-se sozinha, fora da lição: o aluno a lê num cartão, sem o resto do texto.
- Sem bloco de código; fórmula curta em LaTeX só quando o termo é uma fórmula.

## Quando o aluno pede explicação de um trecho

- "Não sei o que é isso": explique do zero, no nível dele, o que o trecho é, com um exemplo curto e concreto. Parta do que a lição já explicou antes do trecho.
- "Explique melhor": explique a mesma ideia de outro jeito, com outro exemplo ou outro caminho. Não repita as frases do bloco.
- Curto e direto: o aluno quer voltar para a lição.

## O que evitar

- Marcar tudo: a marca vira ruído e o aluno para de olhar.
- Termo usado antes da explicação ("Stemming leva as palavras aos radicais" sem dizer o que é um radical).
- Definição circular ("radical é o radical da palavra") ou que precisa de outro termo não explicado.

## Exemplo pequeno

> Para comparar "estudar", "estudante" e "estudei", o buscador corta as terminações e fica com o que as três têm em comum. Essa parte tem nome: um [radical](termo:t-radical) é a parte da palavra que sobra depois de tirar as terminações. Aqui, o radical é "estud".
