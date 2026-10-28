# Quiz

A questão de alternativa (`alternativa`): quatro alternativas, uma correta, cada errada vinda de uma confusão real.

## O que a questão cobra

- Entender, não decorar: interpretar um resultado, prever o que acontece se algo muda, escolher o método certo para uma situação, reconhecer o erro num raciocínio, aplicar a ideia a um caso pequeno.
- Nada de detalhe obscuro, de pegadinha de leitura ou de alternativa que só difere por uma palavra.
- Num curso aplicado, prefira situações e números pequenos; num teórico, propriedades e porquês; num misto, varie.
- Na lição, a dificuldade acompanha o nível do aluno (mais direta para iniciante, situação menos óbvia para quem domina). No diagnóstico, vale o que o prompt dele diz.
- **Nunca os mesmos dados do exemplo.** A questão reusa a ideia com outros números, outra situação ou outro trecho de código, para não entregar a resposta. Depois de um problema aberto, a questão não é o próprio problema resolvido.

## Contexto e enunciado

- `contexto` (opcional): o cenário em markdown, com a situação, os dados, o código, os vetores e as matrizes que a pergunta usa. Pode ter mais de uma frase. Sem cenário, fica de fora.
- `enunciado` (obrigatório): só a pergunta, direta, numa frase, sem repetir o contexto.
- O contexto e o enunciado juntos se entendem sem olhar as alternativas.

## As alternativas

1. Exatamente 4, curtas e paralelas (mesmo formato, tamanho parecido), exatamente uma com `"correta": true`.
2. Nenhuma alternativa traz justificativa; o porquê vai só na `explicacao`.
3. Escreva primeiro a correta e transforme-a em cada errada trocando a ideia certa por uma confusão comum de quem estuda o assunto (não um absurdo).
4. Em cada errada, `confusao` diz o erro de raciocínio que leva a escolhê-la, numa frase curta ("Confunde frequência do termo com frequência nos documentos."). Nunca "Alternativa errada" nem o texto da alternativa repetido.
5. Varie a posição da correta entre as questões.
6. Sem negrito numa alternativa só.
7. `explicacao`: de 2 a 3 frases dizendo por que a correta está certa e qual é o erro principal das outras.

Lendo as alternativas sem saber o assunto, não deve dar para adivinhar a correta. Se der, reescreva.

## Exemplo pequeno

> **Contexto:** Numa coleção de 1.000 documentos, "fatura" está em 10 e "cliente" está em 900.
>
> **Enunciado:** Quanto vale o idf de "fatura", com o log na base 10?
>
> - $100$ (confusão: esquece o log e fica com $N / df$)
> - $0{,}05$ (confusão: calcula o idf de "cliente" no lugar do de "fatura")
> - $2$ (correta)
> - $-2$ (confusão: inverte a razão e usa $df / N$)
>
> **Explicação:** O idf é $\log(N / df) = \log(1000/10) = \log 100 = 2$. Quem marca 100 esquece o log, e quem marca $-2$ inverte a razão.
