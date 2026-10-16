# Stepper

Trilho de etapas numeradas (01 → 04) para guias em modal, como a criação de curso, e para as fases de um módulo.

- `steps`: textos ou `{ label, description }`; `current` começa em 0. `onStepClick(index)` deixa voltar clicando numa etapa feita.
- Feita = `sage` com visto; atual = `amber` com lábio de tecla; a fazer = contorno.
- Três a cinco etapas, cada uma com um substantivo ("Materiais", "Nível", "Objetivo", "Revisão").
