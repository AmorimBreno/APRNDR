# SectionRuler

A régua na margem esquerda da aula: um traço por bloco; os já lidos ficam claros, o atual é mais longo e âmbar, os próximos são cinza. Mostra onde você está dentro da aula, como a `ProgressTrack` mostra onde você está no curso.

- `items` (`{ id, label }`, na ordem dos blocos), `current` (o bloco em leitura) e `onSelect(id)` para rolar até ele.
- Passar o mouse ou focar um traço mostra "03 · Explicação" numa etiqueta de papel.
- Fixa na margem, centralizada na altura da área de leitura.
