# Card

O bloco do bento: cor chapada, cantos grandes (`radius-lg`, ou `radius-xl` com `poster`) e os cantos de ficha técnica — índice à esquerda, legenda à direita, rodapé com filete grosso.

- `tone`: `panel` (neutro escuro, o padrão para conteúdo) ou uma cor de marca. Texto, filetes e caixas internas usam a cor `on-*` do bloco automaticamente.
- `index` ("01"), `label` (legenda), `title` (Unbounded caixa-alta), `footer` (código grande, contagem, seta), `children` livres. `as` muda o elemento (`article`, `li`…).
- Status vai num `Sticker` preso no canto superior direito (`pin="top-right"`, girado ~6°), nunca numa tag dentro do card.
- Dados dentro de cards coloridos vão em caixas de traço grosso, lado a lado como numa ficha de máquina: a porcentagem grande (`SpecBox` "Progresso" com `Stat variant="figure"`) e as leituras (`SpecBox` com `Readout`, rótulo ▸ [valor]). Todo número diz o que é — nada de siglas. A seta grande é `arrow-up-right` em 52px com traço 4,5, no rodapé.
- Monte telas em bento: blocos de tamanhos diferentes num grid com `space-4` de vão sobre `surface-ground`. Um bloco de cor forte por grupo; o resto em `panel`.
- Para módulos de um curso, use o `ModuleCard` (concluído, em curso, próximo e desativado).
- Não ponha borda colorida de um lado só, sombra ou degradê.
