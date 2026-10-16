# QuizFeedback

O retorno depois de responder: faixa colorida com ícone e palavra, a explicação do tutor, os critérios da correção e os próximos passos.

- `status`: `correct` (sálvia, "Correta"), `incorrect` (tijolo, "Ainda não") ou `partial` (creme, "Quase lá"). `title` troca a palavra; `score` mostra a nota ("7,5/10").
- `criteria`: `{ label, met }` para dissertativas — cada critério com visto ou ×.
- `actions`: "Próxima" (primário) e, quando faz sentido, "Reexplicar".
- Tom: diga o que estava certo antes do que faltou. Nota baixa recomenda revisão, nunca bloqueia.
