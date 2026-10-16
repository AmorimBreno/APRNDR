# Tag

Etiqueta em pílula pastel: contorno de 2px na cor, fundo claro, texto escuro em Archivo e um ícone de traço, na cor do texto, que diz o que ela é. Serve para status, tipo de arquivo, módulo e o tipo de cada bloco da aula.

- `tone`: `neutral` (papel, padrão), `outline` (só contorno, para o fundo escuro) ou uma cor de marca em pastel — `sage` concluído/correto, `amber` em curso/novo, `brick` revisar/erro/ao vivo, `moss` módulo e questionário, `cream` tipo de arquivo, `steel` o tutor e os rótulos de bloco.
- `icon` põe o ícone antes do texto (só o traço, sem preenchimento); `dot`, o ponto de sinal no lugar dele (só para "Ao vivo"). `size`: `md` (32px, padrão) ou `sm` (26px, rótulos de bloco e linhas densas).
- Ícones fixos: Concluído/Correta = `check`, Sua resposta = `close`, Em curso = `clock`, Revisar = `alert`, Módulo = `book`, Questionário = `checklist`, Teste final = `flag`, PDF/arquivo = `file`, código = `code`, Desativado = `lock`, Próximo = `arrow-right`. Rótulos de bloco: veja `BLOCK_ICONS` no LessonBlock.
- Uma a três palavras, em caixa normal ("Em curso"). Nunca use cor sem palavra para dizer certo/errado.
- As cores vêm dos tokens `<cor>-pastel` (fundo), `<cor>-line` (contorno) e `<cor>-deep` (texto e ícone).
