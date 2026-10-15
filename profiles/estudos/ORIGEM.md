# vault/.pi

Configuração do pi usada nas aulas. É uma cópia do repositório learn, com adições deste projeto.

Origem: github.com/amosblomqvist/learn, commit 7cfd894 ("updated thumbnail").
Copiado sem o histórico git e sem a pasta assets/. O README original está em README-learn.md.

O primeiro commit desta pasta tem os arquivos exatamente como no original. Toda mudança feita depois está em commits separados, e as linhas alteradas nos arquivos do learn são marcadas com o comentário [estudos-ia].

## Mudanças em relação ao original

Cada item tem o seu commit. Nos arquivos .ts e .md as linhas mudadas têm o comentário [estudos-ia]; nos .json (que não aceitam comentário) a explicação está aqui.

1. extensions/visual-tools/tools/_common.ts: procura o Chrome também nos caminhos do Linux e na variável PI_CHROME_PATH.
2. extensions/visual-tools/package.json: saiu a devDependency que apontava para a pasta do Mac do autor; entrou o puppeteer como dependência direta (ver .npmrc).
3. extensions/visual-tools/.npmrc (novo): não instala peer dependencies, para não criar uma cópia do pi em node_modules.
4. extensions/visual-tools/package-lock.json: refeito do zero no WSL.
5. extensions/quiz.ts, ask-user-question.ts e md-log.ts: textos que o usuário vê traduzidos para português ("I don't know" virou "Não sei").
6. agents/mermaid-maker.md e svg-maker.md: modelo trocado para openrouter/anthropic/claude-sonnet-5.5.
7. APPEND_SYSTEM.md (novo): aulas em português e regras de estilo do Breno.
8. settings.json (novo): professor openai/gpt-6.1-sol pelo OpenRouter.
