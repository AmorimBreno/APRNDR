# ModuleCard

O card de um módulo do curso. A forma é sempre a mesma (número e curso no topo, nome grande, a ficha com a porcentagem e duas leituras, rodapé com o código e a ação); o estado muda o material do card, para dar para ler a grade de longe.

| `state` | Quando | Como fica |
|---|---|---|
| `done` | Módulo concluído | Vinil holográfico (`holo-1` a `holo-6`) com o carimbo 完 em tijolo. O brilho acompanha o ponteiro. 100%. Ação "Rever". |
| `current` | O módulo em que você está | `amber`, com o adesivo "Em curso" preso no canto. Ação "Continuar". |
| `next` | O próximo módulo, já liberado | `moss`, com a tag creme "Próximo" (seta). 0%. Ação "Começar". |
| `locked` | Desativado: ainda não começou e não é o próximo | Sem preenchimento, contorno tracejado, cadeado, texto apagado e o mostrador vazio (--%). No lugar da ação: "Abre depois do Módulo NN". |

- `number` vira "Módulo 03" e "#MOD-03"; `title` é o nome do módulo; `course` aparece depois do número (opcional dentro da tela de um curso).
- `progress` (0 a 1) é o número grande, em IBM Plex Mono (`Stat variant="figure"`). Em `done` é sempre 100%; em `locked` não aparece.
- `readings`: até duas leituras de painel (`{ label, value, unit }`). Concluído: nota do questionário e aulas. Em curso: questões restantes e tempo por questão. Próximo e desativado: aulas previstas e tempo estimado.
- `onOpen` deixa o card inteiro clicável (o botão do rodapé cobre o card, com o anel de foco em volta dele). Em `locked` não há ação.
- `action` troca o texto da ação; `as="li"` dentro de uma lista.
- Monte em grade de 2 colunas no desktop (`repeat(auto-fill, minmax(380px, 1fr))`, vão de 24px e 28px entre linhas por causa do adesivo). O card ocupa a largura da célula e se ajusta sozinho: abaixo de ~460px a ficha empilha e o título diminui.
- Um só `current` por curso. O holográfico é só para o que foi concluído — não use em destaque, promoção nem enfeite.
- Com movimento reduzido, ou no toque, o holográfico fica parado.
