# Ornament

Um ideograma japonês em pé, enorme, com a tradução em português em letra de painel ao lado — o ornamento-pôster do sistema.

- Passe `glyph` (um da lista `OrnamentGlyph`: 学 aprender, 習 praticar, 学習 aprendizado, 知 conhecer, 問 pergunta, 答 resposta, 考 pensar, 解 resolver, 読 ler, 書 escrever, 復習 revisão, 試験 avaliação, 完 concluído, 独創 originalidade, 新 novo, 始 começo, 終 fim, 一 a 十 para números de módulo).
- `caption` troca a legenda (padrão: a tradução); `caption={false}` esconde. `size`: `xl` (160px; 112px no celular) para capas, telas vazias e conclusão; `md` (56px) para cabeçalhos e cards.
- Dois caracteres empilham na vertical, em coluna.
- Ponha sempre dentro de um bloco de cor (`Card` em `brick`, `moss`, `sage`…) ou direto no fundo escuro; a cor vem do texto do bloco.
- É decoração com significado: escolha o ideograma pelo sentido da tela (revisão → 復習, módulo 3 → 三). Nunca use para texto corrido nem invente ideogramas fora da lista (a fonte só tem esses).
- Um ornamento por tela.
