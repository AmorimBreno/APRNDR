# Icon

Os 29 ícones do sistema: traço de 2px numa grade de 24px, pontas quadradas e quinas vivas, herdando a cor do texto (`currentColor`).

- Passe `name` (veja `ICON_NAMES`), `size` em px (padrão 20) e, se o ícone sozinho tiver significado, `label` para o leitor de tela. Sem `label` ele é decorativo.
- Tamanhos: 14–16 dentro de tags, chips e estações da trilha; 18–20 em botões e campos; 24 em áreas de destaque. A seta grande dos cards é `arrow-up-right` em 52px com `strokeWidth` 4,5.
- Tipos de etapa têm ícone fixo: `book` = módulo, `checklist` = questionário, `flag` = teste final. `list` é o botão "Matérias". `lock` marca o módulo desativado; `message`, o rótulo Resposta.
- Cor: herde do texto. Ícones em `amber` marcam o que é acionável dentro de listas (anexos, chips).
- Não misture com outra biblioteca de ícones nem com emoji.
