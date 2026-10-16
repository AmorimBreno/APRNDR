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
11. agents/researcher.md: safe_bash saiu da linha tools (só existia no pi-interactive-subagents). O researcher fica com web_search e web_fetch.
12. extensions/visual-tools/tools/mermaid_tools.ts e svg_tools.ts: no app, os desenhistas são sessões filhas criadas pelo núcleo dentro do processo do servidor, e não processos separados. Por isso o estado (o arquivo-fonte do desenho) passou do módulo para a função da extensão, com uma pasta de trabalho própria por sessão, e a publicação usa o cwd da sessão (ctx.cwd, a pasta de dados) no lugar do process.cwd(). As ferramentas são carregadas pelo campo extensoesSubagentes do profile.json.
13. extensions/visual-tools/tools/_common.ts: publish() recebe a pasta base (o ctx.cwd da sessão); sem ela, continua usando o process.cwd().
14. extensions/visual-tools/index.ts: continua igual, mas saiu do profile.json (extensoes ficou vazio). Ele só registrava as ferramentas no interactive-subagents, que o app não usa.

## Arquivos do projeto (não vêm do learn)

- extensions/painel-teste.ts: ferramentas de teste da ponte de eventos (Etapa 2).
- extensions/quiz-web.ts e quiz-web.test.ts (Etapa 3): a ferramenta quiz no app, com o mesmo nome, os mesmos parâmetros, a mesma correção e o mesmo resultado do quiz.ts, perguntando pela ponte no painel "quiz". O profile.json carrega esta; o quiz.ts continua para o pi no terminal (scripts/pi-estudos.cmd).
- paineis/ (Etapa 3): o código de tela do perfil, pacote @estudos/perfil-estudos do workspace (a tela inicial com os cadernos e o painel do quiz).
- capa.png (Etapa 3): a capa do perfil na tela de perfis (aparencia.capa do profile.json), ilustração escolhida pelo Breno.
- O ask_user_question do app fica no núcleo (packages/core/src/pergunta.ts), com o mesmo nome, parâmetros e resultado do ask-user-question.ts; este continua só para o pi no terminal.

## Pendências

- Os comentários de quiz.ts e ask-user-question.ts ainda falam do log do Obsidian.
