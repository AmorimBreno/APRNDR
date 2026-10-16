# Button

Botão com cara de tecla de computador antigo: rótulo em Unbounded caixa-alta e um lábio inferior (`key-lip`) que afunda ao clicar.

- `variant`: `primary` (âmbar — a ação principal da tela, no máximo um por vista), `secondary` (padrão), `ghost` (ações de apoio, como Reexplicar e Copiar sob uma resposta) e `danger` (tijolo — só para apagar ou sair sem salvar).
- `size`: `sm` 32px, `md` 40px, `lg` 48px. `icon` vai antes do rótulo, `iconRight` depois (setas de avançar). `iconOnly` faz um quadrado — passe `aria-label`.
- Rótulo: verbo primeiro, até três palavras, escrito normal ("Enviar resposta") — o caixa-alta vem do estilo.
- Em rodapés, o primário fica por último, à direita.
- Desabilitado só quando falta algo que o usuário consegue resolver ali (ex.: resposta vazia); explique o motivo por perto.
