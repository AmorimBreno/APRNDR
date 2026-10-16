# Callout

Caixa de destaque dentro de um bloco da aula, em formato de pasta: o bloco inteiro na cor do tipo, uma aba à esquerda com o título e o ícone num círculo preto, e um degrau suave até o resto da borda. À direita, a aba preta dos três pontos abre um menu para agir sobre aquela frase.

- `tone`: `moss` = Ideia central (texto em Fraunces itálica, padrão), `amber` = Atenção, `steel` = Exemplo, `cream` = Resumo. `label` e `icon` trocam o título e o ícone; `quote` força ou tira a itálica.
- `onAction(id)` liga a aba dos três pontos. O menu padrão (`CALLOUT_ACTIONS`) tem "Perguntar sobre isso" (`ask`: abre a barra de pergunta citando a frase), "Explicar de outro jeito" (`rephrase`: o tutor reescreve) e "Me dá um exemplo" (`example`). `actions` troca a lista. Sem `onAction`, o callout fica sem a aba.
- O círculo do ícone e a aba dos pontos são pretos (`ink-inverse`) com o desenho na cor do callout. A aba ganha uma borda de 2px na cor para não sumir no fundo escuro.
- O menu abre abaixo da aba e foca a primeira opção: setas ↑ ↓, Home e End andam, Enter escolhe, Esc e clique fora fecham e devolvem o foco aos três pontos.
- Uma frase, no máximo duas. Se precisa de mais, é parágrafo, não destaque. No máximo uma Ideia central por bloco.
