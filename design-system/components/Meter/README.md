# Meter

Medidor de barras verticais com contorno grosso, como os medidores de um sintetizador antigo: progresso por módulo, questões por dia, urgência de revisão.

- `items`: `{ label, value (0–1), title }` — `label` é o rótulo curto sob a barra ("01", "Seg"), `title` o nome completo para leitor de tela ("Módulo 01 · Limites"). `height` (padrão 96), `label` acima, `showValues`.
- `tone` do preenchimento: `sage` (padrão, progresso), `amber`, `brick` (urgência), `cream`, `steel`, ou `ink` sobre cards coloridos (aí contorno e preenchimento usam a cor do texto do card).
- Os rótulos se explicam sozinhos: número do módulo, dia da semana, uma palavra. Nada de siglas ou letras soltas. A legenda de cima diz o que as barras medem ("Progresso por módulo").
- Para um número só (a porcentagem de um módulo), use `Stat variant="figure"`, não uma barra.
