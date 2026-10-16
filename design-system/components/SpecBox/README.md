# SpecBox

Caixa de ficha técnica com traço grosso (`border-strong`, na cor do texto do card) e cabeçalho opcional separado por filete — o que dá ao card o ar de painel de máquina.

- `title` (à esquerda, ex.: "MOD-03") e `code` (à direita, ex.: "Derivadas") montam o cabeçalho; sem eles, é só a caixa.
- Dentro: `Readout` empilhados, a porcentagem grande (`Stat variant="figure"`, com o título "Progresso") ou um `Meter` com `tone="ink"`. O par mais comum é porcentagem + leituras, em duas caixas lado a lado.
- Use dentro de `Card` colorido ou `panel`; ela herda a cor. Não aninhe caixa dentro de caixa.
