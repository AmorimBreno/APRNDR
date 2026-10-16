# NotebookCover

A capa desenhada de um caderno: lombada, elástico e uma etiqueta de papel com ideograma, nome e número — a imagem de cada matéria na lista e na aba do curso.

- `tone` da capa (`moss`, `amber`, `steel`, `ink`, `cream`, `sage`; evite `brick` na lista, porque a linha selecionada já é tijolo), `glyph` (um ideograma do `Ornament`), `label` (nome curto), `number`, `size` `sm` 40×52 (aba do curso), `md` 72×96 (lista), `lg` 120×160 (capa de curso).
- Cada matéria tem uma capa só e usa sempre a mesma, em todo lugar. Escolha o ideograma pelo assunto (Cálculo → 解 resolver; Dados → 知 conhecer; leitura → 読).
- É decorativa (`aria-hidden`): o nome da matéria sempre aparece em texto ao lado.
