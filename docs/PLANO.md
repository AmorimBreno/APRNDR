# Plano de implementação (branch app-perfis)

Este arquivo guarda as tarefas e o estado de cada uma, para uma sessão nova continuar de onde a anterior parou. A referência do que o app deve ser é a ESPECIFICACAO.md (seção 13 tem as decisões de 2026-10-15). As regras de trabalho estão no AGENTS.md.

Cada etapa termina com um roteiro de teste em docs/ que o Breno executa. A etapa só está pronta quando ele aprova. Antes de tarefas grandes, explicar o plano e pedir aprovação.


## Estado atual

Etapa 1 aprovada pelo Breno em 2026-10-15: o roteiro docs/teste-etapa-1.md passou inteiro (perfil carregado, resposta seguindo as regras, quiz, ask_user_question, busca e PNGs). Abrir o pi com o perfil: scripts\pi-estudos.cmd.

Etapa 2: tarefas 2.1 a 2.7 feitas e revisadas (o orquestrador conferiu no navegador do app: perfil abre, resposta ao vivo, painel teste com pedido e resposta, nova conversa, reinício do servidor com a conversa de volta). Etapa 2 aprovada pelo Breno em 2026-10-15 (docs/teste-etapa-2.md passou inteiro).

Parada de design resolvida em 2026-10-16: o Breno trouxe o design system APRNDR (design-system/, feito no Claude Design). Decisões dele: a marca APRNDR vale para o app inteiro; sem mockups à parte, cada tela é feita direto no app e aprovada antes da próxima; a conversa da janela do perfil vira documento em coluna única (não balões de chat); react-markdown entra para formatar as respostas.

Tarefas 3.1 e 3.2 feitas (2026-10-16): design system como pacote do workspace, tema carregado no app, tela de perfis e tela de carregamento conferidas no navegador (perfil válido, perfil inválido, servidor fora do ar, tela estreita). Tela de perfis e de carregamento aprovadas pelo Breno em 2026-10-16. Tarefa 3.3 feita (aguarda a aprovação do Breno): janela do perfil no tema, conferida no navegador com conversa real (markdown, LaTeX, código, ferramentas, painel teste com pedido e resposta, seletor de modelo com busca, histórico, tela estreita e larga). Decisão nova: as fórmulas em LaTeX (a skill teach escreve toda conta assim) são desenhadas pelo KaTeX (remark-math e rehype-katex). Janela do perfil aprovada pelo Breno em 2026-10-16. Tarefa 3.4 feita (aguarda a aprovação do Breno): cancelamento pelo usuário no protocolo (cancelar_pedido, motivo "usuario"), PainelGenerico no tema, ask_user_question web no núcleo (painel "pergunta"), quiz web no perfil (extensions/quiz-web.ts e o painel em profiles/estudos/paineis, pacote @estudos/perfil-estudos); conferidos no navegador com o agente de verdade. Decisões do Breno: o código de tela do perfil fica em profiles/estudos/paineis. As perguntas ficaram primeiro na área de painéis; no teste, o Breno achou pequeno e pediu como no Claude (2026-10-16): todo pedido que espera resposta, de qualquer painel, vira um botão na conversa (no lugar da linha da ferramenta; âmbar pulsando enquanto espera, só contorno depois e âmbar claro no hover) e é respondido num modal que abre sozinho, pode ser minimizado e reabre pelo botão; respondido, o botão abre o modal para rever. O quiz fica no modal depois de conferir, com o retorno. A área de painéis fica só para o que os painéis mostram. Depois, também a pedido do Breno: a tela de perfis virou cards no layout de telas de boot retrô (aparencia no profile.json: capa, cor, lema, glifo; a capa do perfil de estudos é a ilustração que ele mandou, em profiles/estudos/capa.png), e a tela de faixa e folha virou a tela inicial do perfil de estudos, o menu de cadernos (vazio até a Etapa 4), com a conversa em #/perfil/estudos/conversa. 3.4 aprovada pelo Breno em 2026-10-16. Tarefa 3.5 feita: roteiro docs/teste-etapa-3.md (22 passos). Depois do roteiro, duas pendências resolvidas: o erro esperado "Sessão ... não encontrada" (sessão nova ainda sem mensagem, depois de o servidor reiniciar) não aparece mais, só um erro de verdade ao abrir o perfil; e o teste do subagente sem modelo estourava o tempo porque, com a OPENROUTER_API_KEY no ambiente, o pi achava um modelo e chamava a rede (o teste agora tira as chaves *_API_KEY do ambiente enquanto roda). Etapa 3 aguardando o roteiro docs/teste-etapa-3.md: em 2026-10-16 o Breno pediu para seguir para a Etapa 4 sem terminar o roteiro (os passos que ele já rodou passaram, com os ajustes de menu do agente, tecla do modelo, modal dos pedidos e cards de perfil). A aprovação formal da Etapa 3 fica para quando ele terminar o roteiro.

3.6 Ajustes de interface e animação (pedido do Breno em 2026-10-16, antes do 4.1; o plano do 4.1 já escrito fica esperando). Decisões dele: escala em 90%; resposta sem a etiqueta "Resposta" (só tipos diferentes têm etiqueta) e sem o modelo no pé, com um botão de informações ao lado do número; foto do professor (a imagem que ele mandou, com o aviso de direitos mantido no arquivo) e avatar do usuário no estilo Notion (desenho próprio em SVG); professor animado por estado (pensando, escrevendo, pesquisando, preparando questão); professor na frente da pergunta nos modais, sem "Respondido" escrito; animações com física em tudo (mensagem voando do campo para a nota, texto aparecendo, ferramentas vivas, modal nascendo do botão, cards com inclinação 3D, quiz com carimbo e confete, menus, odômetro, histórico, trocas de tela com View Transitions). Biblioteca Motion 13.5.1.

Tarefa 3.6 feita (2026-10-16), um commit por parte: escala, informações da resposta (o núcleo manda momento, duração, uso e agente), fotos, professor animado, modal com o professor, animações da conversa, cards, quiz, detalhes e trocas de tela. Conferido no navegador o que não exige mandar mensagem na conversa aberta do Breno (escala, informações, fotos, histórico, odômetro, cards, trocas de tela); o voo, o professor vivo, o modal nascendo do botão e a reação do quiz ficam para os passos 23 a 30 do roteiro.

Depois da 3.6, mais ajustes pedidos pelo Breno (modal com FLIP e casca no estilo real do botão, bandeira dos cadernos, pedidos gravados na sessão como entradas nucleo.ponte para voltarem iguais depois de reiniciar). Ele conferiu o quiz voltando igual depois de reiniciar e, em 2026-10-16, aprovou o plano do item 4.1 ("pode continuar").

Item 4.1 feito (2026-10-19, aguarda o roteiro docs/teste-etapa-4-1.md), um commit por parte: lógica em profiles/estudos/lib (matérias, eventos só de acréscimo); a ponte ganhou o "interface:mostrar" passageiro (gravar: false, para a lista de matérias não ir para a sessão); extensão materias.ts com as ferramentas e a ponte da tela; o registro de painéis ganhou foraDaArea (a ponte da tela de cadernos não vira card na conversa); a SubjectWheel ganhou createKicker (design-system/ESTUDOS.md); a tela de cadernos abre a sessão do perfil, lista na roda e cria pelo modal. Conferido no navegador: lista vazia vinda da extensão, modal com a capa de amostra e a conversa sem card de cadernos; não criei matéria pelo navegador para não gravar teste na pasta de dados do Breno (a criação está nos testes).

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

4.1 Pasta de dados, matérias e eventos.jsonl (aprovado em 2026-10-16). Lógica em profiles/estudos/lib/ (caminhos, matérias, eventos), com testes. Extensão profiles/estudos/extensions/materias.ts: ferramentas listar_materias e criar_materia; e, pela ponte (interface:acao no painel "cadernos"), listar e criar para a tela. A pasta de dados é a pastaDados do profile.json; a extensão cria materias/ e aprendiz/ se faltarem e avisa se a pasta não estiver acessível. Cada matéria é materias/<id>/materia.json (id, nome, cor, ideograma, provas, criada em; id = o nome sem acento, minúsculo, com número no fim se repetir); subpastas só quando forem usadas. eventos.jsonl por matéria, no formato da seção 9.2 (id ordenável, data e hora, sessão, verbo, objeto, resultado, contexto), só de acréscimo por uma função única; neste item, criou_materia e alterou_materia; aprendiz/eventos.jsonl só com o formato. Tela de cadernos: lista as matérias com a SubjectWheel e as capas NotebookCover; "Nova matéria" abre um modal (nome, cor, ideograma, data de prova); clicar numa matéria abre a conversa por enquanto (o caderno é o 4.3). Roteiro em docs/teste-etapa-4-1.md.

Em 2026-10-19 o Breno criou a primeira matéria pela tela (Ciência de Dados: a pasta, o materia.json e o evento criou_materia ficaram certos) e pediu para seguir sem rodar o roteiro inteiro do 4.1.

Decisões de 2026-10-19 sobre o caderno (4.3), tomadas antes do 4.2:
- Ordem: o serviço de materiais (4.2) vem antes do caderno, como na especificação.
- O plano do caderno está aprovado para quando chegar a vez dele, em três partes: (A) tela do caderno em #/perfil/estudos/caderno/<id> por uma rota genérica de subtela do perfil, a linha tijolo da roda subindo e virando a aba (Matérias, capa, prova, nome, Editar, Conversar), índice das seções com contagem e linha do tempo lida do eventos.jsonl; (B) notas em notas/<Título>.md com editor TipTap 3 e @tiptap/markdown, salvando sozinho, com eventos criou_nota, renomeou_nota e editou_nota (um por vez que abre e mexe); (C) decorações e menções.
- Decorações das notas em HTML dentro do markdown (<mark>, <span class>, <div class> para os blocos especiais), não na sintaxe do Obsidian. As menções continuam [[Nome da nota]].
- O professor não mexe nas notas pessoais. Ele escreve e edita as anotações de aula (as que acontecem durante a aula ao vivo, em aulas/) e cria o resumo quando a aula acaba (em resumos/).
