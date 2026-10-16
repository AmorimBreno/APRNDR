# Mapa de arquivos

AGENTS.md — regras do projeto para o Claude Code (não vai para o pi)
CLAUDE.md — comandos e convenções curtas para o Claude Code
ESPECIFICACAO.md — o que o app deve ser; seção 13 = decisões de 2026-10-15
filemap.md — este mapa; atualizar ao criar ou mover arquivos
package.json — raiz do monorepo: scripts dev, typecheck e test; versões fixas; builds liberados (pnpm.onlyBuiltDependencies)
pnpm-workspace.yaml — pacotes do workspace (packages/*, apps/*, design-system e profiles/*/paineis; o resto de profiles/ fica de fora)
tsconfig.base.json — opções de TypeScript comuns (estrito, ESM, Bundler); cada pacote estende
vitest.config.ts — testes de packages/*/src, apps/*/src e profiles/*/extensions (com alias do typebox para a cópia do packages/core, como o pi faz)

docs/PLANO.md — etapas, tarefas e estado atual; atualizar ao aceitar uma tarefa
docs/teste-etapa-N.md — roteiro de teste que o Breno roda no fim de cada etapa
docs/teste-etapa-1.md — roteiro da Etapa 1: pi no Windows Terminal com o perfil de estudos
docs/teste-etapa-2.md — roteiro da Etapa 2: app pelo atalho, sessão, subagente, ponte de eventos e edição ao vivo
docs/teste-etapa-3.md — roteiro da Etapa 3: tema APRNDR, tela de perfis e de carregamento, janela do perfil, seletor de modelo, painéis, ask_user_question, quiz, cancelamento e edição ao vivo
docs/ponte-de-eventos.md — protocolo da ponte (interface:mostrar, pedido, resposta, acao) para quem escreve extensão de perfil
docs/historico/ — documentos do checkpoint 1 (pi no WSL com tmux e Obsidian); só consulta

packages/core/ — @estudos/core: núcleo genérico (não conhece estudos); consumido direto do src/index.ts; subcaminho @estudos/core/protocolo = src/protocolo.ts (sem o pi, para o front)
packages/core/src/perfis.ts — esquema zod do profile.json e leitura da pasta profiles/ (lerPerfis, lerPerfil; lerPerfisComErros separa os inválidos)
packages/core/src/agentes.ts — leitura dos arquivos de agente (frontmatter pelo parseFrontmatter do pi + prompt)
packages/core/src/modelos.ts — nomes provedor/id resolvidos no registro de modelos do pi, níveis de raciocínio, modelos disponíveis
packages/core/src/eventos.ts — tipo EventoNucleo (protocolo genérico, inclusive acao_interface e pedido_interface), tradução dos eventos da sessão do pi e do histórico
packages/core/src/sessoes.ts — opções do DefaultResourceLoader por (perfil, agente) e modo (principal ou subagente), filtros de skills e ferramentas, agente gravado na sessão, lista de sessões em <dados>/.sessoes-pi
packages/core/src/montagem.ts — criação de uma sessão do pi pelo SDK, ligação das extensões com o filtro de ferramentas e encerramento; comum à sessão principal e às filhas
packages/core/src/ponte.ts — ponte de eventos: extensão inline que liga pi.events à janela (mostrar, pedido e resposta com cancelamento, inclusive pelo usuário, ação da interface)
packages/core/src/pergunta.ts — ask_user_question do app: mesmo nome, parâmetros e resultado da versão de terminal, perguntando pela ponte no painel "pergunta"; entra em toda sessão principal
packages/core/src/pergunta.test.ts — testes da ferramenta com a ponte e o barramento do pi
packages/core/src/subagentes.ts — ferramenta subagent: sessão filha em <dados>/.sessoes-pi/subagentes, progresso pelo onUpdate, texto final e uso da filha
packages/core/src/protocolo.ts — protocolo do WebSocket: mensagens do cliente (esquema zod e validarMensagemCliente), mensagens do servidor e dados de cada resposta; só zod e import type
packages/core/src/janela-perfil.ts — JanelaPerfil: uma sessão do pi por janela (iniciar, enviar, abortar, trocar modelo e agente, histórico, recarregar, responder e acaoDaInterface da ponte)
packages/core/src/*.test.ts — testes vitest do núcleo (sem rede; janela-perfil.test.ts usa perfil e pasta do pi temporários)
packages/ui/ — @estudos/ui: lógica e peças do front comuns a todos os perfis, com o visual do design system; importa do núcleo só tipos de @estudos/core/protocolo
packages/ui/src/index.ts — exporta tudo do pacote
packages/ui/src/tipos.ts — tipos do núcleo derivados do protocolo (EventoNucleo, EstadoSessao, ItemHistorico, InfoModelo, ResumoSessao)
packages/ui/src/cliente.ts — ClienteConexao: WebSocket em /ws, reconexão com espera crescente, pedir() com pedidoId e promessa da resposta, estado da conexão; obterCliente() = cliente único da página
packages/ui/src/estado-janela.ts — reducer puro da janela de perfil (sessão, conversa com ferramentas no lugar, execução, fila, uso somado, carregando, erros, pedidos e ações da ponte por painel, registro de cada pedido com a situação e a resposta, aviso de recarregado)
packages/ui/src/use-janela-perfil.ts — hook useJanelaPerfil(perfilId): abre o perfil, aplica o reducer, ações (enviar, abortar, trocar modelo e agente, sessões, modelos, recarregar, ponte); reabre a sessão ao reconectar
packages/ui/src/use-perfis.ts — hook usePerfis e buscarPerfis: GET /api/perfis (perfis válidos e erros)
packages/ui/src/paineis.tsx — registro de painéis (componente, título, soModal, resumir o pedido, revisarAoResponder), AreaPaineis (só ações; os pedidos vão para o modal) e PainelGenerico (ações e pedidos em JSON, responder com texto ou cancelar, revisão)
packages/ui/src/estilo.css — estilos da tela de faixa e folha (.tela, .faixa, .folha, .linha, .tecla-papel) e das peças da janela (aviso de erro, documento, ferramentas, barra, histórico, seletor de modelo, painéis) e o CSS do KaTeX; exportado como @estudos/ui/estilo.css
packages/ui/src/visual/Markdown.tsx — markdown das respostas (react-markdown, GFM, LaTeX com remark-math e rehype-katex; sem HTML cru)
packages/ui/src/visual/Conversa.tsx — DocumentoConversa: respostas como bloco sem etiqueta, com o número e o botão de informações na margem e o autor em cima (raciocínio recolhível), mensagens do usuário em StudentNote, ferramentas em linhas técnicas (status, duração, progresso, resumo)
packages/ui/src/visual/Avatares.tsx — AvatarAgente (a foto do profile.json recortada no rosto, num círculo de papel; sem foto, a inicial) e AvatarUsuario (desenho próprio no traço do Notion)
packages/ui/src/visual/BarraPergunta.tsx — AskBar com a fila, o aviso de respondendo e o Parar (Enter durante a resposta põe na fila)
packages/ui/src/visual/SeletorModelo.tsx — tecla de papel do modelo atual (abre o modal, por isso não tem cara de campo) e modal com busca no catálogo; os modelos do perfil primeiro
packages/ui/src/visual/SeletorAgente.tsx — botão do agente na barra do topo com menu próprio no visual do menu do Callout (o select nativo abre com o visual do Windows); teclado completo
packages/ui/src/visual/Historico.tsx — nova conversa e lista de sessões gravadas (a aberta marcada)
packages/ui/src/visual/PainelPergunta.tsx — painel "pergunta" do ask_user_question, mostrado no modal: texto livre, uma escolha ou várias, sempre com Outra; Não responder cancela; revisão com a sua resposta
packages/ui/src/visual/InfoResposta.tsx — botão de informações de uma resposta (na margem, ao lado do número): balão com data, agente, modelo, duração, tokens e custo
packages/ui/src/visual/InfoResposta.test.ts — testes das linhas do balão
packages/ui/src/visual/Pedidos.tsx — pedidos na conversa: BotaoPedido (âmbar pulsando enquanto espera, só contorno depois), ModalPedido (responder, minimizar, rever), resumo e numeração por tipo
packages/ui/src/visual/Pedidos.test.ts — testes da numeração e do resumo
packages/ui/src/paineis-nucleo.ts — registro dos painéis do núcleo (pergunta), que o front junta com os dos perfis
packages/ui/src/telas-iniciais.ts — tipos da tela inicial de um perfil (o que abre antes da conversa) e do registro delas
packages/ui/src/paineis.test.ts — teste dos ids da área de painéis (os só de pedidos ficam de fora)
packages/ui/src/estado-janela.test.ts, cliente.test.ts — testes vitest do reducer e do cliente (WebSocket falso, sem DOM)

apps/server/ — @estudos/server: Hono (HTTP) + ws (WebSocket) na porta 7431; dev com dev.mjs
apps/server/dev.mjs — modo dev: roda src/index.ts com o tsx e reinicia quando apps/server/src ou packages/core/src mudam, pedindo o encerramento pelo IPC (o tsx watch mata o processo na hora no Windows)
apps/server/src/config.ts — porta, caminhos (raiz, profiles/, %LOCALAPPDATA%\estudos-app\logs), nomes das chaves e espera do watcher
apps/server/src/index.ts — liga tudo: chaves, janelas, rotas, WebSocket /ws, watcher, log e encerramento limpo (sinais e pedido do dev.mjs)
apps/server/src/app.ts — rotas HTTP: /api/saude, /api/perfis (válidos e erros à parte), /api/perfis/:id/sessoes
apps/server/src/janelas.ts — Janelas: uma JanelaPerfil por perfil, compartilhada pelas conexões; lista de perfis em cache; registro de modelos compartilhado
apps/server/src/conexao.ts — trata cada mensagem do WebSocket (validação, chamada à janela, resposta com pedidoId) e o resumo para o log
apps/server/src/observador.ts — watcher (fs.watch recursivo) de profiles/ (menos node_modules e profiles/<id>/paineis) e ~/.pi/agent/extensions, com filtro por data de modificação e espera de 300 ms
apps/server/src/chaves.ts — lê OPENROUTER_API_KEY e TAVILY_API_KEY das variáveis de usuário do Windows quando faltam no processo
apps/server/src/log.ts — log no console e em %LOCALAPPDATA%\estudos-app\logs\servidor-AAAA-MM-DD.log
apps/server/src/servidor.test.ts — testes do servidor sem rede (rotas, mensagens com janela falsa, watcher, chaves)
apps/web/ — @estudos/web: Vite + React na porta 7430, com proxy de /api e /ws para a 7431
apps/web/vite.config.ts — porta e proxy do Vite
apps/web/index.html — página do Vite (título APRNDR)
apps/web/src/main.tsx — carrega os estilos (tokens.css e componentes.css do design system, estilo.css do @estudos/ui, estilo.css do app) e monta o App no #raiz
apps/web/src/estilo.css — estilo do app por cima do design system: altura da página, cards da tela de perfis, tela de carregamento e o layout da janela do perfil
packages/ui/src/visual/FaixaMarca.tsx — faixa escura da esquerda (Wordmark, legenda, Ornament, pé livre), usada pela tela de carregamento e pela tela de cadernos
apps/web/src/telas/TelaPerfis.tsx — tela inicial: um card por perfil, até 4 numa linha com a altura da tela (1 ou 2 com metade da largura cada) (capa no papel, nome, ideograma, barra que enche no hover, lema, selo), perfis com erro, servidor fora do ar
apps/web/src/telas/TelaCarregando.tsx — tela enquanto a sessão do perfil é montada: etapa atual, aviso de conexão e erros
apps/web/src/telas/JanelaPerfil.tsx — janela do perfil: barra tijolo (Perfis, SeletorAgente, SeletorModelo, custo, recarregar, painéis), histórico, conversa como documento com os botões dos pedidos e a barra de pergunta, modal do pedido (abre sozinho, minimiza, revisa), avisos, erros, diagnósticos e área de painéis (abre sozinha quando um painel dela recebe algo)
apps/web/src/App.tsx — rotas por hash: #/ = perfis, #/perfil/<id> = tela inicial do perfil (se houver) ou conversa, #/perfil/<id>/conversa = conversa de perfil com tela inicial
apps/web/src/App.test.ts — teste da leitura do hash
apps/web/src/telas-iniciais.ts — registro das telas iniciais dos perfis (estudos = cadernos)
apps/web/src/paineis.ts — registro de painéis do front: os do núcleo (pergunta), os do perfil de estudos (quiz) e o teste (PainelGenerico, com resumo do pedido); ids sem componente também usam o genérico

pi-global/ — fonte versionada do que vai para ~/.pi/agent (instalar com scripts/instalar-pi-global.mjs)
pi-global/settings.json — provedor e modelo padrão do pi
pi-global/extensions/web-search/index.ts — ferramenta web_search (Tavily)
pi-global/extensions/web-fetch/index.ts — ferramenta web_fetch (Tavily Extract, com download direto de reserva)

profiles/estudos/ — perfil de estudos (recursos do pi e, depois, profile.json e painéis)
profiles/estudos/profile.json — definição do perfil de estudos (pasta de dados, agentes, skills, extensões, extensões das sessões filhas, painéis, aparência na tela de perfis)
profiles/estudos/avatares/professor.png — foto do professor na conversa (com o aviso de direitos no arquivo; ver ORIGEM.md)
profiles/estudos/capa.png — capa do perfil na tela de perfis
profiles/estudos/AGENTS.md — instruções fixas do perfil: idioma e regras de estilo do Breno
profiles/estudos/ORIGEM.md — de onde vieram os arquivos do learn e o que mudou
profiles/estudos/README-learn.md — README original do learn
profiles/estudos/agents/ — definições dos agentes (frontmatter com modelo, ferramentas, raciocínio)
profiles/estudos/agents/professor.md — agente geral do perfil (gpt-6.1-sol, skills teach e visualize)
profiles/estudos/agents/researcher.md — pesquisador (glm-5.3, web_search e web_fetch)
profiles/estudos/agents/mermaid-maker.md, svg-maker.md — desenhistas (sonnet-5.5, olham o PNG que geram)
profiles/estudos/skills/teach/SKILL.md — método de ensino (base do explicador)
profiles/estudos/skills/visualize/SKILL.md — quando e como pedir um diagrama
profiles/estudos/extensions/quiz.ts — ferramenta quiz (desenha no terminal; fora do profile.json, só para o pi no terminal)
profiles/estudos/extensions/quiz-web.ts — ferramenta quiz do app: mesmo nome, parâmetros, correção e resultado do quiz.ts, perguntando pela ponte no painel "quiz" e mandando o resultado depois; arquivo do projeto
profiles/estudos/extensions/quiz-web.test.ts — testes do quiz web com um barramento falso
profiles/estudos/paineis/ — @estudos/perfil-estudos: código de tela do perfil (o watcher do servidor ignora esta pasta; quem recarrega é o Vite)
profiles/estudos/paineis/src/index.ts — tela inicial do perfil (cadernos) e registro dos painéis (quiz = Questões: só modal, revisa ao responder, resumo "Questão")
profiles/estudos/paineis/src/TelaCadernos.tsx — tela inicial do perfil de estudos: menu de cadernos com faixa e folha (vazio até a Etapa 4) e a tecla para a conversa
profiles/estudos/paineis/src/PainelQuiz.tsx — painel do quiz no modal: QuizQuestion (ou teclas marcáveis no multi-select), Não sei, nota, Pular; revisão com o gabarito e o QuizFeedback
profiles/estudos/paineis/src/estilo.css — estilos do painel do quiz
profiles/estudos/extensions/ask-user-question.ts — ferramenta ask_user_question (desenha no terminal; no app vale a do núcleo, packages/core/src/pergunta.ts)
profiles/estudos/extensions/painel-teste.ts — ferramentas de teste da ponte (mostrar_painel_teste, perguntar_no_painel_teste); arquivo do projeto, não do learn
profiles/estudos/extensions/visual-tools/ — ferramentas write/edit/render de mermaid e SVG dos desenhistas; npm install dentro da pasta
profiles/estudos/extensions/visual-tools/tools/mermaid_tools.ts, svg_tools.ts — as ferramentas; carregadas só nas sessões filhas (extensoesSubagentes do profile.json)
profiles/estudos/extensions/visual-tools/index.ts — registrava as ferramentas no interactive-subagents; fora do profile.json, não é usado pelo app
profiles/estudos/extensions/visual-tools/tools/_common.ts — acha o navegador (Edge no Windows) e roda subprocessos

referencias/plano-cd.html — artefato de plano de estudo usado antes; referência visual para o design

design-system/ — design system APRNDR (feito no Claude Design), pacote @estudos/design-system do workspace: manual, tokens, componentes React, fontes e ícones
design-system/ESTUDOS.md — mudanças do estudos-ia sobre a exportação do Claude Design (refazer ao trocar a pasta)
design-system/package.json, tsconfig.json — o pacote: exports dos componentes (components/src), do tokens.css e do componentes.css (= components/bundle.css)
design-system/README.md — manual da marca: princípios, voz, cor, tipografia, forma, telas e fluxo, estados, ícones e ornamento
design-system/tokens.json — os tokens (cores, estilos de texto, espaços, raios, bordas, tamanhos, sombras); a fonte da verdade
design-system/tokens.css — gerado do tokens.json: variáveis CSS, @font-face (fonts/) e uma classe por estilo de texto; carregar antes do components/bundle.css
design-system/components/bundle.js, bundle.css — componentes prontos para React 18 (window.Aprndr) e os estilos deles (classes ap-)
design-system/components/src/ — fonte TypeScript dos componentes (base, nav, forms, lesson, quiz, overlay, data, icons); index.d.ts = os tipos
design-system/components/<Componente>/ — README.md (quando e como usar) e preview.html (prévia do artefato: precisa do tokens.css, bundle.css, React e bundle.js já carregados)
design-system/components/StudyFlow/preview.html — a página do fluxo completo (menu de cadernos, aba do curso, aula em coluna única)
design-system/fonts/, licenses/fonts-OFL.txt — fontes woff2 (Unbounded, Archivo, Sono, IBM Plex Mono 500, Fraunces, Zen Antique recortada) e a licença OFL
design-system/assets/Icons/ — os 29 ícones em SVG e o README com o uso de cada um

scripts/instalar-pi-global.mjs — copia pi-global/ para ~/.pi/agent (mescla o settings.json)
scripts/pi-estudos.cmd — abre o pi no terminal com o perfil de estudos, em %LOCALAPPDATA%\estudos-app\pi-teste (fora do repositório)
scripts/testar-render.mjs — gera PNGs de teste pelo mesmo código das visual-tools (em %TEMP%/estudos-render-teste)
scripts/testar-nucleo.ts — verificação do núcleo com chamadas reais (sessão, prompt, troca de modelo e agente, histórico, recarregar); rodar com o tsx e as chaves
scripts/testar-servidor.ts — verificação da tarefa 2.4 pelo WebSocket do pnpm dev (perfil, pergunta, sessões, modelo, watcher; --reabrir <sessaoId> depois de reiniciar)
scripts/testar-ponte.ts — verificação da tarefa 2.3 com chamadas reais (ponte, subagentes researcher e mermaid-maker, web_fetch fresh); rodar com o tsx e as chaves
scripts/prova-cega/prova-cega.mjs — compara modelos de professor às cegas; grava em <dados>/comparacao

launcher/iniciar.vbs — alvo do atalho "Estudos": roda o iniciar.mjs sem janela (avisa se faltar o node)
launcher/iniciar.mjs — lançador: confere a saúde, sobe o pnpm dev escondido (Start-Process -WindowStyle Hidden), espera e abre o Edge --app; log lancador-*.log, saída dev-*.log, PID em %LOCALAPPDATA%\estudos-app\lancador.pid.json
launcher/parar.vbs — alvo do atalho "Parar Estudos": roda o parar.mjs sem janela
launcher/parar.mjs — encerra a árvore do pnpm dev gravada e os node do app nas portas 7430/7431; nunca toca em outros processos
launcher/comum.mjs — caminhos, portas, log, PowerShell e avisos comuns ao lançador
scripts/criar-atalho.ps1 — cria os atalhos "Estudos" e "Parar Estudos" na área de trabalho (rodar com -ExecutionPolicy Bypass)
