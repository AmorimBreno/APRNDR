# AskBar

A barra fixa no pé da aula. Não é um chat: o que você manda vira uma `StudentNote` na página e o tutor continua a aula a partir dela.

- Campo que cresce (`value`/`defaultValue`/`onChange`, `onSend` com Enter; Shift+Enter quebra a linha), clipe para anexar (`onAttach`, `attachments`, `onRemoveAttachment`) e a tecla âmbar de enviar. `generating` troca Enviar por Parar (`onStop`).
- `suggestions` + `onSuggestion` mostram atalhos acima do campo ("Continuar", "Outro exemplo", "Não entendi", "Me testa"). `onEnd` mostra "Encerrar aula" à direita da ajuda — encerrar gera o `SummaryCard`.
- Largura de `measure-read`, centralizada sobre uma faixa `surface-ground` com filete `line` em cima.
