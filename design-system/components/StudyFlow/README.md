# StudyFlow

A página de referência do fluxo inteiro, em 1280px: o menu de cadernos, a linha selecionada subindo e virando a aba do curso, e a aula ao vivo em coluna única. Use como mapa de como as telas se encaixam.

- Menu: faixa escura à esquerda (`menu-rail`) com `Wordmark`, um `Ornament` 学習 e `Stat`; à direita a folha `paper` com a `SubjectWheel`. "Novo plano" (na faixa ou na última linha) abre o guia em `Modal` + `Stepper`; ao criar, o plano novo também sobe e vira a aba.
- Entrar: a linha tijolo sai da lista e anima até o topo (560ms, `cubic-bezier(.65, 0, .25, 1)`), enquanto a folha desce e some e a aula sobe; quando ela pousa, vira a `CourseBar`. Voltar ("Matérias") faz o caminho inverso, até a mesma linha.
- Curso: `CourseBar` no topo, `SectionRuler` na margem, a coluna da aula (`LessonBlock`, `StudentNote`, perguntas com `QuizQuestion`) e a `AskBar` fixa no pé. "Encerrar aula" adiciona o `SummaryCard`.
- Com `prefers-reduced-motion`, a troca de tela é imediata.
