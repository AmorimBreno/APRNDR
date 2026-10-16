# CourseBar

A aba tijolo no topo do curso — a mesma cor da linha que você escolheu na lista, porque ela é essa linha depois de subir. Mostra onde você está: voltar às matérias, capa e nome do curso, a trilha de progresso e o próximo passo.

- `title`, `kicker` ("Caderno 03 · aula 07"), `cover` (vira capa `sm`), `steps` (as estações da `ProgressTrack`), `onStepClick`, `onBack` com `backLabel` ("Matérias"), `next` (`{ label, kicker, onClick }`, o bloco "Próximo" à direita).
- Altura `course-bar` (96px), largura total, fixa no topo da tela do curso. Tudo abaixo dela é a aula em coluna única.
- Não ponha outras ações na aba: ela é para se localizar.
