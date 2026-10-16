# LessonBlock

Um bloco da aula ao vivo. Não existe chat: o tutor escreve a aula numa coluna única, um bloco por vez, como uma página de caderno, e você interage no meio dela.

- `index` (número na margem, "03 —"), `label` (tipo do bloco, numa `Tag` aço pequena com ícone), `writing` (cursor âmbar piscando no fim do texto e "Escrevendo"), `actions` (Button `ghost` `sm`: Reexplicar, Outro exemplo).
- O ícone do rótulo sai de `BLOCK_ICONS`: Explicação = `bulb`, Exemplo = `code`, Pergunta = `help`, Resposta = `message`, Reexplicação = `refresh`, Revisão = `notebook`. `icon` troca.
- O conteúdo é markdown renderizado e recebe o estilo `Prose` no tamanho `lesson-body` (19/32). Dentro dele cabem `Callout` (uma Ideia central por bloco, com `onAction` ligado ao tutor), `QuizQuestion` ou `EssayAnswer` (perguntas no meio da aula) e `QuizFeedback`.
- Empilhe os blocos com 44px de vão numa coluna de `measure-read`, com as intervenções do aluno (`StudentNote`) entre eles e a `AskBar` fixa no pé. A margem esquerda leva a `SectionRuler`.
- Voz: frases curtas, um passo por vez, e termine dizendo o que vem a seguir.
