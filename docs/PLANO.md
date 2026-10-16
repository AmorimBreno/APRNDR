# Plano de implementação (branch app-perfis)

Este arquivo guarda as tarefas e o estado de cada uma, para uma sessão nova continuar de onde a anterior parou. A referência do que o app deve ser é a ESPECIFICACAO.md (seção 13 tem as decisões de 2026-10-15). As regras de trabalho estão no AGENTS.md.

Cada etapa termina com um roteiro de teste em docs/ que o Breno executa. A etapa só está pronta quando ele aprova. Antes de tarefas grandes, explicar o plano e pedir aprovação.


## Estado atual

Etapa 1 aprovada pelo Breno em 2026-10-15: o roteiro docs/teste-etapa-1.md passou inteiro (perfil carregado, resposta seguindo as regras, quiz, ask_user_question, busca e PNGs). Abrir o pi com o perfil: scripts\pi-estudos.cmd.

Etapa 2: tarefas 2.1 a 2.7 feitas e revisadas (o orquestrador conferiu no navegador do app: perfil abre, resposta ao vivo, painel teste com pedido e resposta, nova conversa, reinício do servidor com a conversa de volta). Etapa 2 aprovada pelo Breno em 2026-10-15 (docs/teste-etapa-2.md passou inteiro).

Parada de design resolvida em 2026-10-16: o Breno trouxe o design system APRNDR (design-system/, feito no Claude Design). Decisões dele: a marca APRNDR vale para o app inteiro; sem mockups à parte, cada tela é feita direto no app e aprovada antes da próxima; a conversa da janela do perfil vira documento em coluna única (não balões de chat); react-markdown entra para formatar as respostas.

Tarefas 3.1 e 3.2 feitas (2026-10-16): design system como pacote do workspace, tema carregado no app, tela de perfis e tela de carregamento conferidas no navegador (perfil válido, perfil inválido, servidor fora do ar, tela estreita). Tela de perfis e de carregamento aprovadas pelo Breno em 2026-10-16. Tarefa 3.3 feita (aguarda a aprovação do Breno): janela do perfil no tema, conferida no navegador com conversa real (markdown, LaTeX, código, ferramentas, painel teste com pedido e resposta, seletor de modelo com busca, histórico, tela estreita e larga). Decisão nova: as fórmulas em LaTeX (a skill teach escreve toda conta assim) são desenhadas pelo KaTeX (remark-math e rehype-katex). Janela do perfil aprovada pelo Breno em 2026-10-16. Tarefa 3.4 feita (aguarda a aprovação do Breno): cancelamento pelo usuário no protocolo (cancelar_pedido, motivo "usuario"), PainelGenerico no tema, ask_user_question web no núcleo (painel "pergunta"), quiz web no perfil (extensions/quiz-web.ts e o painel em profiles/estudos/paineis, pacote @estudos/perfil-estudos); conferidos no navegador com o agente de verdade. Decisões do Breno: as perguntas ficam na área de painéis (que abre sozinha, com o que espera resposta no topo), não no meio da conversa; o código de tela do perfil fica em profiles/estudos/paineis. 3.4 aprovada pelo Breno em 2026-10-16. Tarefa 3.5 feita: roteiro docs/teste-etapa-3.md (22 passos). Depois do roteiro, duas pendências resolvidas: o erro esperado "Sessão ... não encontrada" (sessão nova ainda sem mensagem, depois de o servidor reiniciar) não aparece mais, só um erro de verdade ao abrir o perfil; e o teste do subagente sem modelo estourava o tempo porque, com a OPENROUTER_API_KEY no ambiente, o pi achava um modelo e chamava a rede (o teste agora tira as chaves *_API_KEY do ambiente enquanto roda). Próximo passo: o Breno roda o roteiro; com a aprovação, a Etapa 3 fecha e começa a Etapa 4.

Tarefa 2.3 feita (aguarda revisão): ponte de eventos (docs/ponte-de-eventos.md) e ferramenta subagent no núcleo; as ferramentas dos desenhistas vêm do campo novo extensoesSubagentes do profile.json; web_fetch ganhou fresh=true e avisa quando o conteúdo do Tavily pode estar em cache.

Decisão da tarefa 2.2: a troca de agente no SDK é limpa e continua a mesma conversa (o pi grava as mudanças de prompt e ferramentas como patches no transcript); a sessão é remontada sobre o mesmo arquivo com o prompt, as skills, as ferramentas e o modelo do novo agente, e o agente fica gravado numa entrada "custom" (nucleo.agente).

Pendências observadas:
- O log do servidor de 2026-10-15 ficou com ~58 MB por um ciclo de EPIPE (corrigido em apps/server/src/log.ts); o arquivo pode ser apagado com o ok do Breno.
- O npm install das visual-tools baixou ~700 MB de Chrome do puppeteer em ~/.cache/puppeteer, que não é usado (o desenho usa o Edge). O .puppeteerrc.cjs impede novos downloads; apagar a pasta só com o ok do Breno.


## Etapa 0: preparar o repositório (feita)

0.1 Branch app-perfis criada a partir de origin/main do estudos-ia. Arquivos do learn e da busca web movidos com git mv para profiles/estudos/ e pi-global/. Documentos do checkpoint 1 em docs/historico/. Dados do usuário (vault/aulas, comparacao, viz) copiados para G:\Meu Drive\estudos-dados\legado\ e removidos da branch.

0.2 CLAUDE.md, filemap.md, este plano e a seção 13 da especificação.


## Etapa 1: o pi e o ambiente nesta máquina

1.1 (feita) Instalar o pi e a configuração global (Light). npm install -g @earendil-works/pi-coding-agent@1.2.0. scripts/instalar-pi-global.mjs copia pi-global/extensions/* para ~/.pi/agent/extensions e mescla pi-global/settings.json em ~/.pi/agent/settings.json sem apagar chaves existentes (openrouter, openai/gpt-6.1-sol, raciocínio medium, tema dark). Verificação: pi --version, arquivos no lugar.

1.2 (feita) Adaptar os recursos do perfil ao Windows (Medium). Edge (msedge.exe) como navegador do mermaid-cli, mantendo PI_CHROME_PATH. SVG desenhado com @resvg/resvg-js no lugar do rsvg-convert. agents/professor.md (agente geral, gpt-6.1-sol, skills teach e visualize). AGENTS.md do perfil com idioma e regras de estilo. ORIGEM.md atualizado. scripts/testar-render.mjs gera um PNG de mermaid e um de SVG.

1.3 (feita) Teste de fumaça e roteiro (Medium; depende de 1.1, 1.2 e das chaves). pi -p a partir de uma pasta fora do repositório, com as extensões, skills e o AGENTS.md do perfil: resposta em português seguindo as regras, web_search com resultados do Tavily, pi auth check do OpenRouter. Escreve docs/teste-etapa-1.md para o Breno rodar no Windows Terminal.

Aprovação: o Breno rodou docs/teste-etapa-1.md e aprovou em 2026-10-15.


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


## Parada: referências de design (feita)

O Breno trouxe o design system APRNDR (design-system/) em 2026-10-16 e dispensou os mockups à parte: as telas são aprovadas uma a uma no próprio app.


## Etapa 3: interface real da base

Visual: o design system APRNDR em design-system/ (manual em design-system/README.md). Ele vira o pacote @estudos/design-system do workspace, mantido como foi exportado do Claude Design; as mudanças para compilar são mínimas e ficam listadas em design-system/ESTUDOS.md, para uma exportação nova poder substituir a pasta. O núcleo (packages/ui e apps/web) usa só as peças genéricas (tokens, fontes, Icon, Wordmark, Ornament, Button, Tag, Card, Callout, Prose, EmptyState, formulários, Modal, Stepper, Meter, Stat, Readout, SpecBox, AskBar, SuggestionChips, SelectionMenu e, com rótulos genéricos, LessonBlock e StudentNote, que desenham a conversa como documento). As outras peças de estudo (NotebookCover, SubjectWheel, CourseBar, ProgressTrack, ModuleCard, LessonBlock, StudentNote, SummaryCard, SectionRuler, quiz) são do perfil; só QuizQuestion e QuizFeedback entram já, no quiz web. Cada tela é aprovada pelo Breno no app antes da próxima.

3.1 Pacote do design system (Light). package.json e tsconfig em design-system/, entrada no pnpm-workspace.yaml, correções mínimas de tipo (import type, cx aceitando bigint) listadas em design-system/ESTUDOS.md. O apps/web carrega tokens.css e bundle.css, e o fundo e a letra do app passam a ser os do tema.

3.2 Tela de perfis e tela de carregamento (Medium). Faixa escura à esquerda com Wordmark e Ornament; folha de papel à direita com a lista de perfis (perfil aberto, perfis inválidos com o erro e como resolver). Tela de carregamento do perfil no mesmo estilo. Aprovação do Breno antes da 3.3.

3.3 Janela do perfil (Heavy). Conversa como documento em coluna única de measure-read: respostas com Prose (react-markdown, sem HTML cru), mensagens do usuário como notas, ferramentas como linhas técnicas pequenas (subagentes recuados, progresso e duração), raciocínio recolhível. AskBar fixa no pé (Enter envia, Parar, fila). Topo com o perfil, o agente (Select), o modelo (com busca: os do profile.json primeiro), o custo da sessão e recarregar perfil. Histórico de sessões e nova conversa numa faixa lateral; área de painéis em Card. Avisos de conexão, erros e diagnósticos com Callout. Aprovação do Breno antes da 3.4.

3.4 Painéis e pedidos (Careful). PainelGenerico no tema; cancelamento de verdade dos pedidos no protocolo (a pendência da Etapa 2); ask_user_question web no núcleo (Modal com RadioGroup e campo livre) e quiz web no perfil (QuizQuestion e QuizFeedback), com os mesmos nomes e parâmetros das versões de terminal.

3.5 Roteiro (Light). docs/teste-etapa-3.md.

Aprovação: o Breno roda docs/teste-etapa-3.md.


## Etapa 4: perfil de estudos (Fase 2 da especificação)

Itens 1 a 11 da seção 10 da especificação, nesta ordem, cada um com plano e aprovação próprios. Itens com tela nova passam antes por mockup.
