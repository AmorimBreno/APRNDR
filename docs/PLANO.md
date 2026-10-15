# Plano de implementação (branch app-perfis)

Este arquivo guarda as tarefas e o estado de cada uma, para uma sessão nova continuar de onde a anterior parou. A referência do que o app deve ser é a ESPECIFICACAO.md (seção 13 tem as decisões de 2026-10-15). As regras de trabalho estão no AGENTS.md.

Cada etapa termina com um roteiro de teste em docs/ que o Breno executa. A etapa só está pronta quando ele aprova. Antes de tarefas grandes, explicar o plano e pedir aprovação.


## Estado atual

Etapa 1: 1.1, 1.2 e 1.3 feitas. Teste de fumaça ok (auth do OpenRouter pronta, três modelos disponíveis, resposta em português seguindo o AGENTS.md do perfil, web_search e web_fetch com o Tavily, custo de US$ 0,06). Esperando o Breno rodar docs/teste-etapa-1.md e aprovar. Abrir o pi com o perfil: scripts\pi-estudos.cmd.


## Etapa 0: preparar o repositório (feita)

0.1 Branch app-perfis criada a partir de origin/main do estudos-ia. Arquivos do learn e da busca web movidos com git mv para profiles/estudos/ e pi-global/. Documentos do checkpoint 1 em docs/historico/. Dados do usuário (vault/aulas, comparacao, viz) copiados para G:\Meu Drive\estudos-dados\legado\ e removidos da branch.

0.2 CLAUDE.md, filemap.md, este plano e a seção 13 da especificação.


## Etapa 1: o pi e o ambiente nesta máquina

1.1 (feita) Instalar o pi e a configuração global (Light). npm install -g @earendil-works/pi-coding-agent@1.2.0. scripts/instalar-pi-global.mjs copia pi-global/extensions/* para ~/.pi/agent/extensions e mescla pi-global/settings.json em ~/.pi/agent/settings.json sem apagar chaves existentes (openrouter, openai/gpt-6.1-sol, raciocínio medium, tema dark). Verificação: pi --version, arquivos no lugar.

1.2 (feita) Adaptar os recursos do perfil ao Windows (Medium). Edge (msedge.exe) como navegador do mermaid-cli, mantendo PI_CHROME_PATH. SVG desenhado com @resvg/resvg-js no lugar do rsvg-convert. agents/professor.md (agente geral, gpt-6.1-sol, skills teach e visualize). AGENTS.md do perfil com idioma e regras de estilo. ORIGEM.md atualizado. scripts/testar-render.mjs gera um PNG de mermaid e um de SVG.

1.3 (feita) Teste de fumaça e roteiro (Medium; depende de 1.1, 1.2 e das chaves). pi -p a partir de uma pasta fora do repositório, com as extensões, skills e o AGENTS.md do perfil: resposta em português seguindo as regras, web_search com resultados do Tavily, pi auth check do OpenRouter. Escreve docs/teste-etapa-1.md para o Breno rodar no Windows Terminal.

Aprovação: o Breno roda docs/teste-etapa-1.md.


## Etapa 2: base do app e integração com o pi (Fase 1 da especificação)

Começa depois da aprovação da Etapa 1.

2.1 Scaffold do monorepo (Medium). Estrutura da seção 4 da especificação, pnpm workspaces, TypeScript estrito, ESM, scripts dev, typecheck e test (vitest). pi fixado em 1.2.0 no packages/core. Vite na porta 7430 com proxy de /api e /ws para o servidor na 7431. profile.json validado com zod.

2.2 Núcleo: perfis e sessões do pi (Heavy). createAgentSession com DefaultResourceLoader carregando só os recursos do perfil e os globais e o AGENTS.md do perfil como único arquivo de contexto; cwd na pasta de dados. Sessões persistentes em <dados>/.sessoes-pi/ (histórico). Troca de agente e de modelo (relatar se a troca de agente no meio da conversa é limpa no SDK ou se abre conversa nova). Eventos da sessão viram um fluxo genérico. quiz e ask_user_question (que dependem do terminal) ficam desligados no app até a Etapa 3.

2.3 Núcleo: ponte de eventos e subagentes (Careful). Extensão do núcleo em toda sessão escuta pi.events; ferramentas de perfil emitem {painel, acao, dados}; o núcleo repassa sem interpretar. Ações da interface viram comandos para a sessão. Ferramenta genérica "subagente" com sessão filha (modelo, ferramentas e prompt do arquivo do agente), progresso como evento genérico, devolve o texto final. Ferramentas do frontmatter do agente resolvidas a partir das extensões do perfil e das globais. safe_bash sai do researcher ou é substituído.

2.4 Servidor (Medium). HTTP (/api/saude, perfis, sessões), WebSocket com protocolo tipado no core, tsx watch, watcher (chokidar) em profiles/<id>/ que recria a sessão, logs em %LOCALAPPDATA%\estudos-app\logs.

2.5 Tela provisória e registro de painéis (Medium). Página crua sem estilo: perfis, chat em tempo real com indicação de ferramenta, seletor de agente e modelo, histórico, área de painéis, tela de carregamento. Lógica em hooks no packages/ui, separada do visual.

2.6 Lançador e atalho (Medium; em paralelo com 2.5). launcher/iniciar.vbs (sem janela) chama launcher/iniciar.mjs: confere a saúde, inicia pnpm dev escondido se preciso, espera, abre msedge --app=http://localhost:7430. scripts/criar-atalho.ps1. launcher/parar.mjs.

2.7 Ferramenta de teste e roteiro (Light). mostrar_painel_teste abre um painel genérico pela ponte. docs/teste-etapa-2.md com os 7 critérios da Fase 1.

Aprovação: o Breno roda docs/teste-etapa-2.md.


## Parada: referências de design

Pedir ao Breno as referências (imagens ou Claude Design). Lembrar do referencias/plano-cd.html. Fazer os mockups, aprovar, e só então implementar.


## Etapa 3: interface real da base

Detalhar depois do design: tokens de tema, tela de perfis, janela do perfil (chat, seletores, histórico, área de painéis), tela de carregamento, versões web de ask_user_question (núcleo) e quiz (perfil) com os mesmos nomes e parâmetros das versões de terminal.


## Etapa 4: perfil de estudos (Fase 2 da especificação)

Itens 1 a 11 da seção 10 da especificação, nesta ordem, cada um com plano e aprovação próprios. Itens com tela nova passam antes por mockup.
