# profiles/estudos

Skills, agentes e extensões do pi usados pelo perfil de estudos. A base é uma cópia do repositório learn, com adições deste projeto.

Origem: github.com/amosblomqvist/learn, commit 7cfd894 ("updated thumbnail").
Copiado sem o histórico git e sem a pasta assets/. O README original está em README-learn.md.

Antes de vir para cá, a cópia morava em vault/.pi no estudos-ia (branch main, commit c03bc25, checkpoint 1), onde rodava no WSL com o pi-interactive-subagents (tmux) e o Obsidian. Lá o primeiro commit tinha os arquivos exatamente como no learn, e cada mudança tinha o seu commit. Agora tudo roda no Windows nativo, sem WSL e sem tmux.

As linhas alteradas nos arquivos do learn são marcadas com o comentário [estudos-ia]. Nos .json, que não aceitam comentário, a explicação está aqui.

## O que saiu

- extensions/md-log.ts: gravava as respostas de quiz e de ask_user_question num log em markdown para o Obsidian, que não é mais usado.
- settings.json: foi para pi-global/ (configuração global do pi, instalada em ~/.pi/agent).

## Mudanças em relação ao learn

1. extensions/visual-tools/tools/_common.ts: procura o navegador primeiro na variável PI_CHROME_PATH, depois nos caminhos do macOS, do Linux e do Windows (Edge em Program Files (x86) e Program Files; Chrome em Program Files e em %LOCALAPPDATA%\Google\Chrome\Application). O PATH dos subprocessos passa a usar o separador do sistema (";" no Windows).
2. extensions/visual-tools/tools/mermaid_tools.ts: no Windows roda o cli.js do mermaid-cli com o próprio Node, porque o node_modules/.bin/mmdc é um script de shell.
3. extensions/visual-tools/tools/svg_tools.ts: desenha com o @resvg/resvg-js, carregando as fontes do sistema (Arial para sans-serif). rsvg-convert e magick ficam como reserva, se estiverem no PATH.
4. extensions/visual-tools/package.json: saiu a devDependency que apontava para a pasta do Mac do autor; entraram o puppeteer como dependência direta (ver .npmrc) e o @resvg/resvg-js.
5. extensions/visual-tools/.npmrc (novo): não instala peer dependencies, para não criar uma cópia do pi em node_modules. extensions/visual-tools/.puppeteerrc.cjs (novo): o npm install não baixa o Chrome do puppeteer, porque o desenho usa o navegador achado por findChrome().
6. extensions/visual-tools/package-lock.json: refeito do zero no WSL e atualizado pelo npm no Windows.
7. extensions/quiz.ts e ask-user-question.ts: textos que o usuário vê traduzidos para português ("I don't know" virou "Não sei").
8. agents/mermaid-maker.md e svg-maker.md: modelo trocado para openrouter/anthropic/claude-sonnet-5.5.
9. agents/professor.md (novo): agente geral do perfil, openrouter/openai/gpt-6.1-sol, com as skills teach e visualize.
10. AGENTS.md (novo, era o APPEND_SYSTEM.md): aulas em português e regras de estilo do Breno, como instruções fixas do perfil.

## Pendências para a Etapa 2/3

- extensions/visual-tools/index.ts registra as ferramentas de desenho no interactive-subagents, que não é usado no Windows. O app vai criar os subagentes e carregar essas ferramentas por conta própria.
- agents/researcher.md lista safe_bash, que só existe no interactive-subagents.
- extensions/quiz.ts e ask-user-question.ts desenham com ctx.ui.custom e só funcionam no terminal. No app elas ganham versões web com os mesmos nomes e parâmetros.
- Os comentários de quiz.ts e ask-user-question.ts ainda falam do log do Obsidian.
