# Dissertativa

A questão dissertativa (`dissertativa`): uma pergunta para o aluno explicar com as próprias palavras, corrigida por uma rubrica.

## Quando usar

- Quando a lição (ou a ideia) é mais teórica, com pouco a praticar: o aluno mostra que entendeu explicando, justificando, comparando ou interpretando.
- No lugar do quiz final dessa lição. Num curso teórico ou misto, o módulo tem pelo menos uma.

## A pergunta

- `contexto` (opcional): o cenário em markdown (a situação, os dados, o código) que a pergunta usa. Sem cenário, fica de fora.
- `enunciado` (obrigatório): uma pergunta curta e direta, numa frase.
- Pede explicar com as próprias palavras: "por que", "o que acontece se", "compare", "o que este resultado diz". Não pede definição decorada nem cálculo longo.
- Respondível bem em 3 a 6 frases.
- Na lição, nunca os mesmos dados do exemplo.

## A rubrica

- De 3 a 5 critérios. Cada critério é um conceito-chave que a resposta precisa ter, concreto e observável no texto ("Diz que o idf é zero quando o termo está em todos os documentos").
- Nunca critérios vagos ("Demonstra domínio do assunto", "Resposta clara") nem de forma (português, tamanho).
- Cada critério tem `criterio` (um nome curto, único na rubrica), `descricao` (o que precisa aparecer na resposta para ganhar os pontos) e `pontos` (inteiro maior que zero). Os pontos somam de 5 a 10, mais pontos para o critério mais importante.
- Na correção, os pontos vêm só do que está escrito na resposta: a mesma ideia com outras palavras vale igual.

## A resposta-modelo

- `respostaModelo`: uma resposta de 3 a 6 frases, no nível de um bom aluno, que ganha todos os critérios da rubrica.

## O que evitar

- Pergunta que se responde com uma palavra (essa é uma pergunta de verificação ou um quiz).
- Critério que repete outro com outras palavras.
- Resposta-modelo que traz algo que a rubrica não cobra, ou que deixa de cobrir um critério.

## Exemplo pequeno

> **Enunciado:** Por que um termo que aparece em quase todos os documentos recebe peso perto de zero no TF-IDF?
>
> **Rubrica:**
> - Raridade (3 pontos): diz que o idf mede em quantos documentos o termo está.
> - Log de 1 (2 pontos): diz que $N / df$ fica perto de 1 e o log perto de 0.
> - Produto (2 pontos): diz que o peso é tf vezes idf, e por isso cai junto com o idf.
>
> **Resposta-modelo:** O idf mede a raridade do termo na coleção. Se o termo está em quase todos os documentos, $N / df$ fica perto de 1, e o log de 1 é 0. Como o peso é o tf multiplicado pelo idf, ele também fica perto de zero, mesmo que o termo apareça muito no documento.
