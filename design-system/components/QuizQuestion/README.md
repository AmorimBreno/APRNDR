# QuizQuestion

Questão de alternativas em que cada opção é uma tecla com a letra (A, B, C…). O teclado responde: a letra escolhe, as setas navegam.

- `prompt`, `options` (`{ id, label }`), `value` e `onChange(id)`. `number`, `total` e `kicker` montam o cabeçalho ("03/10 · Módulo 03 · Derivadas").
- `correctId` revela o gabarito: a certa fica `sage` com visto e "Correta", a escolhida errada fica `brick` com × e "Sua resposta", as outras apagam. Sem `correctId`, serve para enquetes, como o questionário de perfil de aprendizado.
- `children` aparece embaixo das alternativas (botão Conferir, `QuizFeedback`).
- Enunciado como pergunta direta; alternativas curtas e paralelas.
