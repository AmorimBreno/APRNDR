# Modal

Janela sobre o véu escuro (`scrim`), com faixa de cabeçalho chapada, como uma ficha técnica. Prende o foco, fecha com Esc e devolve o foco a quem abriu.

- `open`, `onClose`, `title`, `kicker` ("Novo curso · etapa 2 de 4"), `children`, `footer` (botões; primário por último).
- `size`: `sm` 440px (confirmação), `md` 640px (padrão, guias em etapas), `lg` 880px (duas colunas). `tone` da faixa: `amber` padrão; `brick` só em confirmação destrutiva.
- Para guias em etapas, ponha um `Stepper` no topo do corpo e Voltar/Continuar no rodapé.
- `dismissible={false}` quando fechar perderia trabalho; `portal={false}` para renderizar no lugar.
- No celular, encosta no pé da tela.
