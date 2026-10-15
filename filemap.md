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
docs/ponte-de-eventos.md — protocolo da ponte (interface:mostrar, pedido, resposta, acao) para quem escreve extensão de perfil
docs/historico/ — documentos do checkpoint 1 (pi no WSL com tmux e Obsidian); só consulta

packages/core/ — @estudos/core: núcleo genérico (não conhece estudos); consumido direto do src/index.ts; subcaminho @estudos/core/protocolo = src/protocolo.ts (sem o pi, para o front)
packages/core/src/perfis.ts — esquema zod do profile.json e leitura da pasta profiles/ (lerPerfis, lerPerfil; lerPerfisComErros separa os inválidos)
packages/core/src/agentes.ts — leitura dos arquivos de agente (frontmatter pelo parseFrontmatter do pi + prompt)
packages/core/src/modelos.ts — nomes provedor/id resolvidos no registro de modelos do pi, níveis de raciocínio, modelos disponíveis
packages/core/src/eventos.ts — tipo EventoNucleo (protocolo genérico, inclusive acao_interface e pedido_interface), tradução dos eventos da sessão do pi e do histórico
packages/core/src/sessoes.ts — opções do DefaultResourceLoader por (perfil, agente) e modo (principal ou subagente), filtros de skills e ferramentas, agente gravado na sessão, lista de sessões em <dados>/.sessoes-pi
packages/core/src/montagem.ts — criação de uma sessão do pi pelo SDK, ligação das extensões com o filtro de ferramentas e encerramento; comum à sessão principal e às filhas
packages/core/src/ponte.ts — ponte de eventos: extensão inline que liga pi.events à janela (mostrar, pedido e resposta com cancelamento, ação da interface)
packages/core/src/subagentes.ts — ferramenta subagent: sessão filha em <dados>/.sessoes-pi/subagentes, progresso pelo onUpdate, texto final e uso da filha
packages/core/src/protocolo.ts — protocolo do WebSocket: mensagens do cliente (esquema zod e validarMensagemCliente), mensagens do servidor e dados de cada resposta; só zod e import type
packages/core/src/janela-perfil.ts — JanelaPerfil: uma sessão do pi por janela (iniciar, enviar, abortar, trocar modelo e agente, histórico, recarregar, responder e acaoDaInterface da ponte)
packages/core/src/*.test.ts — testes vitest do núcleo (sem rede; janela-perfil.test.ts usa perfil e pasta do pi temporários)
packages/ui/ — @estudos/ui: componentes e hooks React comuns (vazio até a tarefa 2.5)

apps/server/ — @estudos/server: Hono (HTTP) + ws (WebSocket) na porta 7431; dev com dev.mjs
apps/server/dev.mjs — modo dev: roda src/index.ts com o tsx e reinicia quando apps/server/src ou packages/core/src mudam, pedindo o encerramento pelo IPC (o tsx watch mata o processo na hora no Windows)
apps/server/src/config.ts — porta, caminhos (raiz, profiles/, %LOCALAPPDATA%\estudos-app\logs), nomes das chaves e espera do watcher
apps/server/src/index.ts — liga tudo: chaves, janelas, rotas, WebSocket /ws, watcher, log e encerramento limpo (sinais e pedido do dev.mjs)
apps/server/src/app.ts — rotas HTTP: /api/saude, /api/perfis (válidos e erros à parte), /api/perfis/:id/sessoes
apps/server/src/janelas.ts — Janelas: uma JanelaPerfil por perfil, compartilhada pelas conexões; lista de perfis em cache; registro de modelos compartilhado
apps/server/src/conexao.ts — trata cada mensagem do WebSocket (validação, chamada à janela, resposta com pedidoId) e o resumo para o log
apps/server/src/observador.ts — watcher (fs.watch recursivo) de profiles/ e ~/.pi/agent/extensions, com filtro por data de modificação e espera de 300 ms
apps/server/src/chaves.ts — lê OPENROUTER_API_KEY e TAVILY_API_KEY das variáveis de usuário do Windows quando faltam no processo
apps/server/src/log.ts — log no console e em %LOCALAPPDATA%\estudos-app\logs\servidor-AAAA-MM-DD.log
apps/server/src/servidor.test.ts — testes do servidor sem rede (rotas, mensagens com janela falsa, watcher, chaves)
apps/web/ — @estudos/web: Vite + React na porta 7430, com proxy de /api e /ws para a 7431
apps/web/vite.config.ts — porta e proxy do Vite
apps/web/src/App.tsx — página mínima que mostra /api/saude e os perfis (a tela provisória é a tarefa 2.5)

pi-global/ — fonte versionada do que vai para ~/.pi/agent (instalar com scripts/instalar-pi-global.mjs)
pi-global/settings.json — provedor e modelo padrão do pi
pi-global/extensions/web-search/index.ts — ferramenta web_search (Tavily)
pi-global/extensions/web-fetch/index.ts — ferramenta web_fetch (Tavily Extract, com download direto de reserva)

profiles/estudos/ — perfil de estudos (recursos do pi e, depois, profile.json e painéis)
profiles/estudos/profile.json — definição do perfil de estudos (pasta de dados, agentes, skills, extensões, extensões das sessões filhas, painéis)
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
profiles/estudos/extensions/visual-tools/tools/mermaid_tools.ts, svg_tools.ts — as ferramentas; carregadas só nas sessões filhas (extensoesSubagentes do profile.json)
profiles/estudos/extensions/visual-tools/index.ts — registrava as ferramentas no interactive-subagents; fora do profile.json, não é usado pelo app
profiles/estudos/extensions/visual-tools/tools/_common.ts — acha o navegador (Edge no Windows) e roda subprocessos

referencias/plano-cd.html — artefato de plano de estudo usado antes; referência visual para o design

scripts/instalar-pi-global.mjs — copia pi-global/ para ~/.pi/agent (mescla o settings.json)
scripts/pi-estudos.cmd — abre o pi no terminal com o perfil de estudos, em %LOCALAPPDATA%\estudos-app\pi-teste (fora do repositório)
scripts/testar-render.mjs — gera PNGs de teste pelo mesmo código das visual-tools (em %TEMP%/estudos-render-teste)
scripts/testar-nucleo.ts — verificação do núcleo com chamadas reais (sessão, prompt, troca de modelo e agente, histórico, recarregar); rodar com o tsx e as chaves
scripts/testar-servidor.ts — verificação da tarefa 2.4 pelo WebSocket do pnpm dev (perfil, pergunta, sessões, modelo, watcher; --reabrir <sessaoId> depois de reiniciar)
scripts/testar-ponte.ts — verificação da tarefa 2.3 com chamadas reais (ponte, subagentes researcher e mermaid-maker, web_fetch fresh); rodar com o tsx e as chaves
scripts/prova-cega/prova-cega.mjs — compara modelos de professor às cegas; grava em <dados>/comparacao
