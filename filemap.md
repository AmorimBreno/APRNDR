# Mapa de arquivos

AGENTS.md — regras do projeto para o Claude Code (não vai para o pi)
CLAUDE.md — comandos e convenções curtas para o Claude Code
ESPECIFICACAO.md — o que o app deve ser; seção 13 = decisões de 2026-10-15
filemap.md — este mapa; atualizar ao criar ou mover arquivos

docs/PLANO.md — etapas, tarefas e estado atual; atualizar ao aceitar uma tarefa
docs/teste-etapa-N.md — roteiro de teste que o Breno roda no fim de cada etapa
docs/historico/ — documentos do checkpoint 1 (pi no WSL com tmux e Obsidian); só consulta

pi-global/ — fonte versionada do que vai para ~/.pi/agent (instalar com scripts/instalar-pi-global.mjs)
pi-global/settings.json — provedor e modelo padrão do pi
pi-global/extensions/web-search/index.ts — ferramenta web_search (Tavily)
pi-global/extensions/web-fetch/index.ts — ferramenta web_fetch (Tavily Extract, com download direto de reserva)

profiles/estudos/ — perfil de estudos (recursos do pi e, depois, profile.json e painéis)
profiles/estudos/AGENTS.md — instruções fixas do perfil: idioma e regras de estilo do Breno
profiles/estudos/ORIGEM.md — de onde vieram os arquivos do learn e o que mudou
profiles/estudos/README-learn.md — README original do learn
profiles/estudos/agents/ — definições dos agentes (frontmatter com modelo, ferramentas, raciocínio)
profiles/estudos/agents/professor.md — agente geral do perfil (gpt-6.1-sol, skills teach e visualize)
profiles/estudos/agents/researcher.md — pesquisador (glm-5.3, web_search e web_fetch)
profiles/estudos/agents/mermaid-maker.md, svg-maker.md — desenhistas (sonnet-5.5, olham o PNG que geram)
profiles/estudos/skills/teach/SKILL.md — método de ensino (base do explicador)
profiles/estudos/skills/visualize/SKILL.md — quando e como pedir um diagrama
profiles/estudos/extensions/quiz.ts — ferramenta quiz (desenha no terminal)
profiles/estudos/extensions/ask-user-question.ts — ferramenta ask_user_question (desenha no terminal)
profiles/estudos/extensions/visual-tools/ — ferramentas write/edit/render de mermaid e SVG dos desenhistas; npm install dentro da pasta
profiles/estudos/extensions/visual-tools/tools/_common.ts — acha o navegador (Edge no Windows) e roda subprocessos

referencias/plano-cd.html — artefato de plano de estudo usado antes; referência visual para o design

scripts/instalar-pi-global.mjs — copia pi-global/ para ~/.pi/agent (mescla o settings.json)
scripts/testar-render.mjs — gera PNGs de teste pelo mesmo código das visual-tools (em %TEMP%/estudos-render-teste)
scripts/prova-cega/prova-cega.mjs — compara modelos de professor às cegas; grava em <dados>/comparacao
