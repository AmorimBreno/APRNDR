# ProgressTrack

A trilha do curso: uma estação por etapa, cada tipo com ícone e forma próprios — módulo (livro, círculo), questionário do módulo (prancheta, quadrado arredondado) e teste final (bandeira, quadrado maior). O módulo e o questionário dele ficam colados; entre módulos o traço é longo.

- `steps`: `{ id, kind, label, state }` — `kind` `module`, `quiz` ou `final`; `state` `done` (cheia), `current` (âmbar com anel claro e o nome fixo embaixo), `todo` (contorno) ou `locked` (contorno tracejado: módulo ainda não gerado).
- Passar o mouse ou focar uma estação mostra o nome numa etiqueta de papel. `onStepClick` deixa pular para uma etapa (não vale para `locked`).
- Feita para a `CourseBar` (sobre tijolo, usando a cor do texto). Em outro fundo, ajuste a cor do texto do pai.
- Estado nunca só por cor: cheia, contornada e tracejada são formas diferentes, e cada estação tem nome acessível ("Módulo 03 · Derivadas — atual").
