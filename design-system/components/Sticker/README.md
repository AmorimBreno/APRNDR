# Sticker

Adesivo de papel colado: borda grossa em `paper`, miolo de cor chapada e letra Unbounded grossa. Prende no canto de um card como um post-it, girado e saindo um pouco para fora.

- `children` é o texto principal (uma a duas palavras: "Em curso", "Revisar", "Sexta"). `kicker` põe uma linha pequena acima ("Módulo 03"); `dot` põe o ponto de sinal antes do texto.
- `tone`: `ink` (padrão, quase preto com texto papel), `brick`, `amber`, `sage`, `moss`, `cream`, `steel`. Escolha um tom que contraste com o card onde ele cola (ink ou brick sobre amber; brick sobre moss).
- `holo` é o vinil holográfico: só para conclusão ("Concluído", curso terminado, avaliação aprovada), nunca como enfeite.
- `pin`: `top-right` (padrão de uso), `top-left`, `bottom-right`, `bottom-left` — o card precisa de `position: relative` (o `Card` já tem). `rotate`: 4° a 7° para a direita no canto superior direito; −2° a −4° quando solto.
- Um adesivo por card. Ele substitui as tags de status dentro do card ("Em curso", "Novo", "Prova sexta").
- Em cards estreitos (celular), dê espaço no topo do card (padding-top ~56px) para o adesivo não cobrir o título.
- A sombra curta (`sticker-shadow`) é exclusiva de papel colado: adesivos, notas do aluno e capas de caderno.
