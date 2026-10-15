# Mapa de arquivos

AGENTS.md — regras do projeto para o Claude Code (não vai para o pi)
CLAUDE.md — comandos e convenções curtas para o Claude Code
ESPECIFICACAO.md — o que o app deve ser; seção 13 = decisões de 2026-10-15
filemap.md — este mapa; atualizar ao criar ou mover arquivos
package.json — raiz do monorepo: scripts dev, typecheck e test; versões fixas; builds liberados (pnpm.onlyBuiltDependencies)
pnpm-workspace.yaml — pacotes do workspace (packages/*, apps/*; profiles/ fica de fora)
tsconfig.base.json — opções de TypeScript comuns (estrito, ESM, Bundler); cada pacote estende
vitest.config.ts — testes de packages/*/src e apps/*/src

docs/PLANO.md — etapas, tarefas e estado atual; atualizar ao aceitar uma tarefa
docs/teste-etapa-N.md — roteiro de teste que o Breno roda no fim de cada etapa
docs/teste-etapa-1.md — roteiro da Etapa 1: pi no Windows Terminal com o perfil de estudos
docs/historico/ — documentos do checkpoint 1 (pi no WSL com tmux e Obsidian); só consulta

packages/core/ — @estudos/core: núcleo genérico (não conhece estudos); consumido direto do src/index.ts
packages/core/src/perfis.ts — esquema zod do profile.json e leitura da pasta profiles/ (lerPerfis, lerPerfil)
packages/core/src/agentes.ts — leitura dos arquivos de agente (frontmatter pelo parseFrontmatter do pi + prompt)
packages/core/src/modelos.ts — nomes provedor/id resolvidos no registro de modelos do pi, níveis de raciocínio, modelos disponíveis
packages/core/src/eventos.ts — tipo EventoNucleo (protocolo genérico), tradução dos eventos da sessão do pi e do histórico
packages/core/src/sessoes.ts — opções do DefaultResourceLoader por (perfil, agente), filtros de skills e ferramentas, agente gravado na sessão, lista de sessões em <dados>/.sessoes-pi
packages/core/src/janela-perfil.ts — JanelaPerfil: uma sessão do pi por janela (iniciar, enviar, abortar, trocar modelo e agente, histórico, recarregar)
packages/core/src/*.test.ts — testes vitest do núcleo (sem rede; janela-perfil.test.ts usa perfil e pasta do pi temporários)
packages/ui/ — @estudos/ui: componentes e hooks React comuns (vazio até a tarefa 2.5)

apps/server/ — @estudos/server: Hono (HTTP) + ws (WebSocket) na porta 7431; dev com tsx watch
apps/server/src/config.ts — porta do servidor e caminhos da raiz do repositório e de profiles/
apps/server/src/index.ts — rotas /api/saude e /api/perfis e WebSocket /ws (por enquanto só ping e pong)
apps/web/ — @estudos/web: Vite + React na porta 7430, com proxy de /api e /ws para a 7431
apps/web/vite.config.ts — porta e proxy do Vite
apps/web/src/App.tsx — página mínima que mostra /api/saude e os perfis (a tela provisória é a tarefa 2.5)

pi-global/ — fonte versionada do que vai para ~/.pi/agent (instalar com scripts/instalar-pi-global.mjs)
pi-global/settings.json — provedor e modelo padrão do pi
pi-global/extensions/web-search/index.ts — ferramenta web_search (Tavily)
pi-global/extensions/web-fetch/index.ts — ferramenta web_fetch (Tavily Extract, com download direto de reserva)

profiles/estudos/ — perfil de estudos (recursos do pi e, depois, profile.json e painéis)
profiles/estudos/profile.json — definição do perfil de estudos (pasta de dados, agentes, skills, extensões, painéis)
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
scripts/pi-estudos.cmd — abre o pi no terminal com o perfil de estudos, em %LOCALAPPDATA%\estudos-app\pi-teste (fora do repositório)
scripts/testar-render.mjs — gera PNGs de teste pelo mesmo código das visual-tools (em %TEMP%/estudos-render-teste)
scripts/testar-nucleo.ts — verificação do núcleo com chamadas reais (sessão, prompt, troca de modelo e agente, histórico, recarregar); rodar com o tsx e as chaves
scripts/prova-cega/prova-cega.mjs — compara modelos de professor às cegas; grava em <dados>/comparacao
