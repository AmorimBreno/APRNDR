# Estrutura da lição

O esquema que toda lição segue: a ordem dos blocos, quanto é explicação, quantas questões e o ritmo.

## O esquema

1. **Introdução** (explicação de formato `introducao`): o contexto do tema. Sempre o primeiro bloco.
2. **Um ciclo por ideia** da lição, na ordem de estudo:
   - **Conceito** (formato `conceito`): a teoria, com o porquê;
   - **Exemplo** (o formato pelo nível do aluno: `exemplo_resolvido`, `exemplo_incompleto` ou `problema_aberto`): o conceito aplicado a dados concretos, desenvolvido passo a passo e depois retomado para explicar melhor;
   - **Pergunta** (`verificacao`): uma pergunta curta para ver se a ideia foi entendida, logo depois do conceito ou do exemplo;
   - quando a ideia pede, **mais explicação** (outro `conceito` ou outro exemplo) antes de seguir.
3. **Ideia central** (`ideia_central`): o que guardar da lição, de 1 a 3 frases, logo antes da questão final.
4. **Quiz** (`alternativa`): no fim da lição; numa lição com duas ideias práticas, pode haver um quiz também no fim da primeira ideia.
5. **Dissertativa**: no lugar do quiz final quando a lição (ou a ideia) é mais teórica, com pouco a praticar (explicar, justificar, comparar).

Uma lição tem de 2 a 3 ideias. Uma ideia é uma coisa que o aluno precisa entender para atingir o objetivo da lição; o ciclo dela começa sempre por um conceito.

## O que o código confere

- O primeiro bloco é a introdução.
- Nenhuma questão (pergunta, quiz, dissertativa) antes do primeiro conceito.
- Nunca duas questões seguidas: entre duas, sempre uma explicação ou a ideia central.
- Toda pergunta vem logo depois de um conceito ou de um exemplo.
- A ideia central vem logo antes da questão final.
- Pelo menos 70 % dos caracteres da lição estão nas explicações (introdução, conceitos, exemplos e ideia central).
- Tamanhos mínimos: introdução 600 caracteres, conceito 900, exemplo 900. Mire mais: introdução de 800 a 1.500, conceito e exemplo de 1.200 a 2.500.

## Quantas questões

- No máximo uma pergunta por ciclo.
- Um quiz por ideia prática (que se aplica com dados, contas ou código), no fim da ideia ou da lição.
- Uma dissertativa quando a lição é teórica. Num curso teórico ou misto, o módulo tem pelo menos uma.
- Uma lição típica tem de 2 a 4 questões ao todo. Questão a mais não ensina: o que ensina é a explicação.

## O ritmo

- Uma lição é para uns 40 a 60 minutos de estudo: umas 3 a 6 explicações longas e poucas questões.
- Cada bloco parte do anterior: o conceito usa o que a introdução contou, o exemplo aplica o conceito, a pergunta confere o que acabou de ser visto.
- O formato do exemplo segue o nível do aluno no conceito: iniciante, `exemplo_resolvido`; intermediário, `exemplo_incompleto`; domina, `problema_aberto`.
- O tipo do módulo também conta: "curto" tem ciclos mais enxutos; "revisão" retoma rápido o conceito e vai ao exemplo.
- Não repita o que as outras lições do módulo cobrem.

## O que evitar

- Lição feita só de questões, ou de uma explicação curta seguida de várias questões.
- Exemplo antes do conceito, ou questão sobre algo que ainda não foi explicado.
- Duas lições com a mesma ideia.

## Exemplo de um bom roteiro

Uma lição prática com duas ideias:

```
introducao, conceito, exemplo_resolvido, verificacao, conceito, exemplo_resolvido, verificacao, ideia_central, alternativa
```

Uma lição teórica com duas ideias:

```
introducao, conceito, verificacao, conceito, exemplo_resolvido, verificacao, ideia_central, dissertativa
```
