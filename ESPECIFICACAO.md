# Especificação do projeto: app de estudos com o pi

Este documento descreve o que o app deve ser, como ele é organizado e em que ordem deve ser construído. Ele é a referência para a implementação. Quando algo aqui entrar em conflito com uma decisão tomada depois, a decisão mais recente vale e este documento deve ser atualizado.


## 1. Visão

Um aplicativo pessoal, de uso só do Breno, rodando localmente no Windows. O "cérebro" é o pi (agente de código), usado como biblioteca. O app é uma interface própria, parecida com o Claude Desktop, organizada em perfis. Cada perfil abre uma janela com as suas próprias ferramentas e painéis.

O primeiro perfil é o de estudos: cadernos por matéria, cursos gerados com IA a partir dos materiais das aulas, sessões de estudo com explicações que se adaptam a ele, questionários, respostas dissertativas e avaliações. Um perfil de programação virá no futuro e não deve ser construído agora, mas a estrutura precisa permitir que ele seja adicionado sem mexer no núcleo.

O diferencial do app é que a forma de explicar melhora com o uso, com base em evidências do que de fato funcionou para ele (seção 9).


## 2. Princípios

O núcleo nunca sabe o que é um caderno, um curso ou um arquivo de código. Ele só conhece perfis, sessões do pi, agentes, eventos e painéis identificados por um nome. Tudo o que é específico de estudos mora no perfil de estudos. Ao colocar algo no núcleo, a pergunta é: isso faria sentido também para o perfil de programação? Se não, vai para o perfil.

Os dados de estudo são arquivos simples e legíveis (markdown e JSON), numa pasta separada do código. O código pode quebrar sem afetar os dados. Qualquer índice ou banco é derivado dos arquivos e pode ser apagado e reconstruído.

Tudo é rastreável. Toda explicação aponta para o material de onde veio. Toda conclusão sobre o aprendiz aponta para os eventos que a sustentam.

O app deve abrir com um clique e refletir edições no código ao vivo ou quase ao vivo.


## 3. Stack e execução

Sistema: Windows.

Linguagem e ferramentas: TypeScript em tudo, monorepo com pnpm workspaces.

Servidor: Node.js, usando o SDK do pi (createAgentSession). Verificar na instalação qual é o nome atual do pacote do pi (já apareceu como @mariozechner/pi-coding-agent e como @earendil-works/pi-coding-agent).

Front: React com Vite.

Comunicação entre front e servidor: WebSocket para eventos em tempo real (texto chegando, ferramenta chamada, ação de interface) e HTTP para operações simples.

Atalho único: um atalho na área de trabalho aponta para um lançador que roda sem janela de terminal. O lançador verifica se o servidor já está rodando; se não estiver, inicia em segundo plano; espera o servidor responder num endpoint de saúde; e abre o Edge ou o Chrome em modo app (--app=http://localhost:PORTA), que parece um programa de desktop. Enquanto as sessões do pi carregam, a interface mostra uma tela de carregamento.

Edição ao vivo: o front atualiza na hora pelo Vite. O servidor reinicia sozinho quando o código dele muda (tsx watch ou equivalente). Os perfis, extensões e skills são observados por um watcher de arquivos, e quando mudam, a sessão daquele perfil é recriada. Existe também um botão "recarregar perfil". Reiniciar o servidor interrompe uma resposta em andamento do agente, e isso é aceitável.

O atalho roda o app a partir do código-fonte em modo de desenvolvimento. O código fica versionado em git para poder voltar quando uma edição quebrar algo.

Futuro, fora do escopo agora: empacotar em Electron reaproveitando os mesmos pacotes.


## 4. Estrutura do repositório

```
projeto/
  packages/
    core/        sessões do pi, perfis, ponte de eventos, serviço de materiais, tipos compartilhados
    ui/          componentes comuns: chat, seletor de agente e modelo, histórico, área de painéis
  apps/
    server/      servidor Node (HTTP + WebSocket) que usa o core
    web/         front React: tela de perfis e janela do perfil
  profiles/
    estudos/     profile.json, AGENTS.md do perfil, extensions/, skills/, painéis
  launcher/      lançador do atalho do Windows
  ESPECIFICACAO.md
  AGENTS.md
```


## 5. Núcleo

5.1 Sessões do pi. O núcleo cria e mantém as sessões do pi pelo SDK, uma por janela de perfil, com os agentes, modelos, extensões e skills declarados no perfil. Ele escuta os eventos da sessão e repassa para o front.

5.2 Perfis. Na inicialização, o núcleo lê a pasta profiles/ e lista os perfis disponíveis. Cada perfil é carregado a partir do seu profile.json.

5.3 Ponte de eventos. Quando uma ferramenta de um perfil quer mostrar algo na tela, ela emite um evento genérico de ação de interface com três partes: o identificador do painel, a ação e os dados. O núcleo repassa esse evento para a janela certa, e o front entrega para o painel com aquele identificador. O núcleo não interpreta o conteúdo. No sentido contrário, ações feitas na interface (botões, seleção de texto) viram comandos enviados à sessão do pi.

5.4 Registro de painéis. O front mantém um registro que liga cada identificador de painel a um componente React. O perfil lista quais painéis usa.

5.5 Serviço de materiais. Extrair e indexar arquivos é genérico (o perfil de programação também vai precisar), então fica no núcleo. Para PDFs: extrair o texto página por página, guardando arquivo e página de cada trecho. Páginas com pouco texto (slides com gráficos, figuras, fórmulas) são renderizadas como imagem e descritas por um modelo com visão. Para código Python e notebooks: ler por estrutura (funções, células, comentários, saídas). Tudo vai para um índice de busca. O uso desse serviço para criar cursos fica no perfil de estudos.

5.6 Índice. Um SQLite com busca de texto (e, se valer a pena, embeddings) usado para buscas, menções entre notas e timeline. Ele é derivado dos arquivos e pode ser reconstruído. Importante: o índice não fica dentro da pasta de dados, porque a pasta de dados é sincronizada com o Google Drive e um SQLite sendo sincronizado pode corromper. O índice fica numa pasta local do app (por exemplo, dentro do AppData).

5.7 Histórico de sessões de chat e troca de agente ou modelo dentro do perfil.


## 6. Formato de um perfil

Cada perfil é uma pasta com um profile.json contendo:

- id e nome do perfil
- caminho da pasta de dados que é o "mundo" do perfil
- agentes do perfil, cada um com nome, papel e modelo padrão
- extensões e skills do pi a carregar
- arquivo de instruções do agente (AGENTS.md do perfil)
- painéis que a janela mostra

A configuração dos agentes do pi já existe na máquina (um agente geral e um agente menor para desenho e pesquisa, com uma ferramenta de pesquisa). O perfil de estudos deve reaproveitar essa configuração em vez de duplicar. Essa integração será feita na implementação.


## 7. Pasta de dados

Fica fora do repositório, num caminho configurável (uma pasta sincronizada com o Google Drive para backup). Estrutura:

```
estudos-dados/
  materias/
    <materia>/
      materia.json        nome, cor, datas de prova
      materiais/          arquivos originais adicionados (PDFs, .py, .ipynb)
      .extraido/          texto e descrições extraídas, por página, com referência de origem
      mapa-conteudo.json  conceitos do material, em ordem, com referências
      notas/              anotações pessoais em markdown
      resumos/            resumos gerados pelos agentes
      aulas/              registro de cada sessão de estudo
      cursos/
        <curso>/
          curso.json      metadados, escopo, objetivo, esqueleto dos módulos
          modulos/        conteúdo de cada módulo, gerado quando chega nele
          questoes.json   banco de questões do curso
      eventos.jsonl       tudo o que acontece na matéria, em ordem
  aprendiz/
    eventos.jsonl         eventos brutos de aprendizagem (seção 9.2, camada 1)
    hipoteses.json        hipóteses do perfil do aprendiz (camada 3)
    perfil-atual.md       resumo curto injetado no explicador (camada 4), versionado
    historico-perfil/     versões anteriores do resumo
```

A timeline de uma matéria não é um arquivo mantido à mão. Toda ação grava uma linha em eventos.jsonl, e a timeline é uma visualização desse registro.


## 8. Perfil de estudos: features

8.1 Matérias e cadernos

Cada matéria tem um caderno, que é a visualização bonita da pasta da matéria: timeline, notas pessoais, resumos dos agentes, registros de aula, cursos, questionários e materiais.

As notas são markdown. Elas têm capítulos (títulos), diagramas, menções entre notas no formato [[nome da nota]], e decorações no estilo do Notion: cores, tamanhos e fontes de texto, destaques e blocos especiais. Essas decorações são extensões do markdown, definidas como um conjunto pequeno e documentado de classes, de forma que o arquivo continue legível fora do app e os agentes consigam ler e escrever. Diagramas são arquivos do Excalidraw referenciados dentro da nota. O editor na tela (TipTap ou similar) mostra tudo formatado e salva em markdown.

8.2 Materiais

O usuário adiciona arquivos à pasta de materiais da matéria (pelo guia de criação de curso, pelo botão de gerar módulo ou direto no caderno). O serviço de materiais do núcleo processa os arquivos e atualiza o índice. Ao adicionar um material novo, o mapa de conteúdo da matéria é atualizado.

Mapa de conteúdo: o agente lê o material e monta a lista de conceitos, em ordem, com a referência de onde cada um aparece (arquivo e página). O usuário revisa: remove o que não cai, marca prioridades e ajusta a ordem. Cursos são montados a partir do mapa aprovado.

8.3 Cursos (planos de estudo)

O plano de estudo é um curso com quatro níveis: curso, módulos, lições e blocos. Um bloco pode ser uma explicação, uma questão de alternativa, uma questão dissertativa ou uma pergunta rápida de verificação. As lições alternam explicação e prática, como as plataformas de curso. Cada módulo termina com uma avaliação do módulo, e o curso termina com uma avaliação geral.

O objetivo do curso muda a mistura: teórico (o que é, como e onde é usado) pesa mais em dissertativas conceituais; aplicado pesa mais em exemplos de aplicação e exercícios práticos; misto equilibra os dois.

Modo de escopo, escolhido na criação:
- só o material: o curso cobre apenas os conceitos do mapa; explicações podem usar exemplos e analogias, mas qualquer coisa além do material aparece marcada como complemento; avaliações só cobram o que está no material
- material como base: o material é a espinha, mas o agente pode aprofundar e trazer temas relacionados
- livre: sem material ou com material só de referência

Em todos os modos, cada bloco de explicação leva a referência de onde veio (exemplo: Aula 4, slide 12), e clicar abre o PDF naquela página.

Guia de criação. O curso é criado num modal em etapas:

1. Básico: matéria (existente ou nova), nome do curso, data da prova ou prazo, tempo disponível por semana.
2. Materiais: área para arrastar arquivos ou escolher uma pasta, com o status de processamento de cada arquivo. Pode ser pulada. O processamento continua em segundo plano enquanto o usuário avança.
3. Escopo e objetivo: modo de escopo (só o material fica desabilitado sem material), teórico, aplicado ou misto, e um campo livre para o motivo do estudo.
4. Mapa de conteúdo: revisão do mapa. Sem material, o agente monta o mapa a partir do tema e do objetivo.
5. Diagnóstico: o agente faz perguntas sobre o quanto o usuário acha que sabe de cada bloco do mapa e depois algumas questões reais sobre esses conceitos (alternativa e uma ou duas dissertativas curtas). A comparação entre o que ele disse e o que acertou é a primeira evidência de calibração, e as questões servem como pré-teste do curso.
6. Esqueleto: módulos, objetivos, conceitos de cada módulo e calendário sugerido de avaliações dentro do prazo. Conceitos já dominados no diagnóstico podem virar módulos curtos ou de revisão. O usuário edita e confirma.

O progresso do guia é salvo como rascunho e pode ser retomado. Voltar a uma etapa anterior e mudá-la invalida as etapas que dependem dela (exemplo: um PDF novo refaz o mapa e o diagnóstico), e o modal avisa antes de descartar.

Geração dos módulos. O guia cria só o esqueleto. O conteúdo de cada módulo é gerado quando o usuário chega nele, por um botão "gerar módulo". Ao clicar, abre um formulário com campos opcionais: materiais novos para aquele módulo (por exemplo, o PDF de uma aula que só foi entregue meses depois da criação do curso), informações específicas e observações do usuário. A geração usa o perfil do aprendiz atualizado até aquele momento. Um módulo cujo material ainda não existe pode ficar no estado "aguardando material".

Se uma avaliação de módulo mostrar lacunas, o agente pode propor uma lição de reforço antes do módulo seguinte.

8.4 Sessão de estudo (anotações de aula)

A tela principal de estudo. De um lado, o conteúdo da lição em blocos. Do outro, o painel do curso: módulo e lição atuais, progresso, e o questionário do capítulo quando ele chega.

Ao selecionar uma frase ou parágrafo de uma explicação, aparece uma barra de ações:
- reexplicar
- explicar de outro jeito (com opções: analogia, caso real, passo a passo, visual com diagrama)
- campo de texto "o que eu entendi / o que não entendi", onde o usuário escreve com as próprias palavras e o agente responde a partir disso

Depois de uma reexplicação, com alguma frequência o agente faz uma pergunta curta de verificação antes de seguir.

O agente intercala perguntas dissertativas durante a lição. Elas servem para fixar o conteúdo e para o sistema entender como o usuário raciocina, o vocabulário que usa e o tipo de explicação que funciona para ele.

Nas questões de prática, a regra é dar dica e não a resposta até o usuário tentar.

Toda sessão de estudo gera um registro em aulas/ e eventos de aprendizagem (seção 9).

8.5 Questões e avaliações

Tipos na primeira versão: alternativa e dissertativa. Exercícios de código ficam para depois.

Cada questão fica no banco do curso, marcada com os conceitos que cobra.

Alternativa: as opções erradas vêm de erros comuns daquele assunto, e cada uma é marcada com a confusão que representa. Assim, um erro revela qual misconception aconteceu.

Dissertativa: cada questão nasce com uma rubrica de 3 a 5 critérios concretos. A correção pelo LLM primeiro extrai da resposta os trechos relevantes para cada critério e só depois pontua. A correção roda 2 ou 3 vezes (ou com 2 modelos) e usa a mediana; divergência grande é tratada como incerteza. Nas primeiras 30 a 50 respostas, o usuário também dá a sua nota, e o app calcula a concordância entre ele e o corretor (kappa ponderado). Só os critérios com boa concordância entram no score.

Confiança: antes de responder qualquer questão, o usuário marca a confiança de 1 a 4.

Exercícios dentro das lições são prática e dão o sinal imediato.

Avaliação do módulo: fica disponível a partir do dia seguinte ao fim do módulo, para medir retenção e não memória recente. Usa variações das questões dos exercícios, não as mesmas. Nota baixa não bloqueia o próximo módulo: o app recomenda a revisão e deixa seguir.

Avaliação geral: mistura questões de todos os módulos, intercaladas.

Revisão espaçada: entre uma coisa e outra, questões de conceitos já vistos voltam nas datas definidas pelo FSRS (biblioteca ts-fsrs).

8.6 Quadro

Um painel de quadro usando Excalidraw. O agente de desenho pode gerar ou editar diagramas no quadro, já que o Excalidraw salva em JSON. Diagramas podem ser inseridos nas notas.


## 9. Metodologia de aprendizado

9.1 O que adaptar

Não adaptar a "estilos de aprendizagem" (visual, auditivo etc.). A pesquisa não sustenta isso. O que deve ser adaptado é: o nível de conhecimento em cada conceito, as confusões específicas (misconceptions), o vocabulário que o usuário já domina e quais estratégias de explicação de fato levaram a acerto depois.

O nível do conceito decide o formato: iniciante recebe exemplo resolvido completo; intermediário recebe exemplo com passos faltando para completar; quem já domina recebe problema aberto. Exemplos resolvidos demais para quem já sabe atrapalham (efeito de reversão de expertise).

Técnicas que o tutor aplica sempre, por terem a melhor evidência: prática de recuperação (responder sem consultar), prática espaçada, auto-explicação, exemplos concretos e texto combinado com diagrama.

9.2 Memória do aprendiz em quatro camadas

Cada camada só é escrita a partir da camada de baixo, e cada item aponta para a sua origem. É isso que impede o perfil de virar bagunça.

Camada 1, eventos brutos. Arquivo só de acréscimo, nunca editado. Formato inspirado no xAPI. Campos: id, timestamp, id da sessão, verbo (pediu reexplicação, pediu outro jeito, escreveu entendimento, respondeu questão, respondeu dissertativa, marcou confiança), objeto (bloco ou questão, conceitos ligados, matéria e curso), resultado (correto ou não, nota por critério, confiança, tempo, texto livre), contexto (estratégia de explicação usada, versão do prompt, modelo, braço do bandit, se foi exploração forçada, versão do perfil injetado) e referência ao texto exato da explicação mostrada.

Camada 2, indicadores calculados. Tudo derivado da camada 1 e recalculável. Por conceito: probabilidade de domínio (BKT simples, com parâmetros fixos no início, por exemplo chute 0,2 e deslize 0,1), estabilidade e próxima revisão (FSRS), acertos e erros com decaimento, ganho normalizado das últimas sessões, calibração (Brier) e misconceptions observadas com os ids dos eventos. Por estratégia e faixa de domínio: os parâmetros do bandit.

O LLM transforma texto livre (respostas dissertativas, "não entendi X") em evidência estruturada (conceito, certo ou errado, misconception). A estimativa numérica é feita pelos modelos simples (BKT, FSRS), não pelo LLM.

Camada 3, hipóteses do perfil. Campos de cada hipótese: id, tipo (conhecimento, misconception, vocabulário, preferência de forma, ritmo, metacognição), escopo (global, matéria ou conceito), enunciado, evidências a favor (ids de eventos), evidências contra (ids de eventos), confiança (baixa, média ou alta, calculada pela quantidade de evidências e pelo número de sessões diferentes, não pela opinião do LLM), data de criação, última confirmação, validade, status (proposta, aprovada, rejeitada, expirada), se foi aprovada pelo usuário, e versão.

Exemplo de hipótese boa: "Em convergência de séries, confunde condição necessária com suficiente; 3 eventos em 2 sessões; confiança média."
Exemplo proibido: "É um aprendiz visual." Também são proibidos elogios genéricos.

Preferências são sempre contextuais quando a evidência for contextual (exemplo: em demonstrações prefere passo a passo, em redes prefere caso real), e não regras globais.

Camada 4, resumo injetado. Um texto curto (algumas centenas de tokens), montado a partir das hipóteses aprovadas e relevantes para o conceito atual, ponderadas por recência e confiança. Contém o nível do conceito atual, as misconceptions ativas, os termos que o usuário domina e os que ainda não, e a estratégia escolhida para a explicação. Cada versão é guardada com identificador, e todo evento registra qual versão estava ativa.

Regras de manutenção:
- decaimento: evidências de preferência perdem peso com o tempo (meia-vida inicial de 30 dias); para conhecimento, o FSRS cuida disso
- conflito: evidência contrária entra em "evidências contra"; se o contra superar o a favor nas ocorrências recentes, a hipótese volta a "proposta" e é levada à revisão do usuário; nada é sobrescrito em silêncio
- validade: hipóteses sem confirmação recente expiram

9.3 Ciclo de atualização

A cada resposta, dentro da sessão: registrar o evento; atualizar o BKT do conceito e o FSRS quando for questão; se o usuário pediu outro jeito ou escreveu o que não entendeu, o explicador recebe esse texto e a explicação anterior e gera uma nova; fazer a pergunta curta de verificação. Nada vai para o perfil de longo prazo nesse momento, só para a memória da sessão.

Ao final de cada sessão: calcular o score da sessão e atualizar a camada 2. Um agente de reflexão lê os eventos da sessão e as hipóteses atuais e propõe criar, reforçar, enfraquecer ou expirar hipóteses, sempre citando ids de eventos. O código descarta automaticamente propostas sem evidência citada. A reflexão usa um prompt (ou modelo) diferente do explicador e não recebe a autoavaliação do usuário como verdade. O usuário vê a diferença no perfil e aprova ou rejeita cada mudança. O perfil é aberto: o usuário pode ver e editar tudo.

Por semana ou mês: atualizar o bandit com as recompensas atrasadas que chegaram; revisar as métricas de tendência; checar se hipóteses aprovadas há mais de 60 dias ainda têm evidência recente.

9.4 Score de aprendizado por sessão

score da sessão = 0,5 x recuperação atrasada + 0,3 x ganho normalizado imediato + 0,2 x qualidade dissertativa

- recuperação atrasada: proporção de acertos, sem ajuda, nas questões de revisão de conceitos vistos em sessões anteriores
- ganho normalizado imediato: média do normalized change dos conceitos novos (mini pré-teste antes do bloco, pós-teste depois)
- qualidade dissertativa: nota média por rubrica, só nos critérios em que o corretor concorda com o usuário

Reportar à parte, sem misturar no score: calibração (Brier) e número de reexplicações por bloco. Pedir reexplicação não é ruim.

Os pesos e a meia-vida são pontos de partida e devem ser configuráveis, para ajuste depois de algumas semanas de dados.

9.5 Experimentação de estratégias (bandit)

Três ou quatro estratégias amplas: exemplo resolvido passo a passo, analogia, caso real aplicado, pergunta socrática com auto-explicação. Thompson sampling com Beta(1,1) por estratégia e por faixa de domínio do conceito (iniciante ou intermediário). Cerca de 20% das escolhas são exploração forçada uniforme, para o bandit não travar cedo numa estratégia. A recompensa é binária e atrasada: acerto na revisão daquele conceito numa sessão posterior. Nunca usar "não pediu reexplicação" como recompensa, nem a nota dissertativa sozinha.

9.6 Métricas de tendência

- estabilidade FSRS média dos conceitos novos aos 7 e aos 30 dias
- acerto na primeira revisão atrasada de conceitos novos
- calibração ao longo do tempo
- concordância do corretor de dissertativas

Para saber se o perfil ajuda de verdade, o app deve permitir desligar o perfil por um período curto e comparar.

9.7 Riscos e salvaguardas

- tutor que entrega a resposta: dica antes de solução; perguntas de verificação
- concordância excessiva do modelo (sycophancy): o explicador avalia a explicação do usuário contra a fonte antes de concordar; correção e reflexão usam chamadas separadas
- deriva do perfil e viés de confirmação: exploração forçada, recompensa atrasada, evidências contra registradas, validade das hipóteses
- sinais ruidosos: um sinal isolado é evidência fraca; hipóteses só sobem com evidência repetida em sessões diferentes
- instruções longas são seguidas mal: o resumo injetado é curto e com prioridades explícitas

9.8 O que coletar desde já para um modelo local no futuro

Para cada bloco de explicação guardar: o contexto completo enviado ao modelo (prompt do sistema, versão do perfil, trecho do material, pergunta), a explicação gerada com modelo e temperatura, a reação do usuário, a explicação seguinte, o resultado imediato e o resultado atrasado. Um par de preferência forte é "explicação B preferida a A" quando B veio depois de A para o mesmo trecho e B teve acerto atrasado que A não teve. Pares só com preferência declarada são marcados como fracos. Guardar também as notas manuais das dissertativas. Esses dados servem para treino futuro por DPO e, antes disso, como conjunto de avaliação.


## 10. Fases de implementação

Fase 1, base. Pronta quando:
1. O atalho no Windows abre o app sem terminal visível, com tela de carregamento.
2. A tela inicial lista os perfis lidos de profiles/.
3. Escolher um perfil cria a sessão do pi com os agentes e extensões daquele perfil.
4. O chat recebe as respostas em tempo real e mostra quando uma ferramenta é chamada.
5. Dá para trocar de agente dentro do perfil, e o histórico de sessões funciona.
6. Uma ferramenta de teste, quando chamada pelo agente, abre um painel genérico na tela pela ponte de eventos.
7. Editar o front atualiza na hora; editar o servidor reinicia sozinho; editar uma extensão do perfil recarrega a sessão.

Fase 2, perfil de estudos, nesta ordem:
1. Pasta de dados configurável, matérias e eventos.jsonl.
2. Serviço de materiais e índice (PDF com descrição de slides, Python, notebooks).
3. Caderno da matéria com timeline, notas em markdown com decorações e menções.
4. Mapa de conteúdo.
5. Guia de criação de curso com as seis etapas.
6. Geração de módulo sob demanda, com formulário e estado "aguardando material".
7. Sessão de estudo com barra de ações na seleção de texto e painel do curso.
8. Questões de alternativa e dissertativas, rubricas, confiança, avaliações e revisão espaçada.
9. Memória do aprendiz nas quatro camadas, score da sessão, agente de reflexão com aprovação do usuário.
10. Bandit de estratégias e métricas de tendência.
11. Quadro com Excalidraw.

Fase 3, programação: não construir agora. Apenas garantir que nada na base impeça um perfil com árvore de arquivos, diff e terminal.


## 11. Fora do escopo por enquanto

- exercícios de código executados no app
- perfil de programação
- empacotamento em Electron
- acesso remoto ou uso por outras pessoas


## 12. Referências principais da metodologia

- Pashler et al. (2008), estilos de aprendizagem
- Kalyuga et al. (2003), efeito de reversão de expertise
- Dunlosky et al. (2013), técnicas de estudo eficazes
- VanLehn (2011), eficácia de tutores
- Corbett e Anderson (1994), Bayesian Knowledge Tracing
- Bull e Kay (2007, 2016), open learner models
- Gao et al. (NeurIPS 2024), PRELUDE e CIPHER
- Park et al. (2023), Generative Agents, memória e reflexão
- Rafferty, Ying e Williams (2019), bandits em experimentos educacionais
- Doroudi, Aleven e Brunskill (2019), RL em sequenciamento instrucional
- Hake (1998), ganho normalizado
- FSRS (ts-fsrs), repetição espaçada
- Bastani et al. (PNAS 2025), riscos da IA como muleta
- Kestin et al. (2025), tutor de IA de Harvard
- especificação xAPI (IEEE 9274.1.1-2023)


## 13. Decisões de 2026-10-15

Tomadas ao montar o projeto num computador novo. Quando divergirem das seções anteriores, valem estas.

13.1 Ambiente. Tudo roda no Windows nativo, sem WSL. O pi suporta Windows e usa o Git Bash para os comandos de shell. Como o app chama o pi pelo SDK, o tmux e o pi-interactive-subagents não são usados: o pesquisador e os desenhistas viram subagentes criados pelo próprio núcleo, como sessões filhas. O pi no terminal serve só para testar a configuração. O navegador do modo app e dos diagramas é o Edge.

13.2 Pacote do pi. O nome atual é @earendil-works/pi-coding-agent, versão 1.2.0, fixada no packages/core.

13.3 Repositório. O código fica no repositório privado AmorimBreno/estudos-ia, na branch app-perfis. A main guarda o checkpoint 1 (pi no terminal com WSL, tmux e Obsidian) até a fusão ser aprovada. Os documentos daquela fase estão em docs/historico/.

13.4 Configuração do pi reaproveitada (seção 6). Ela vem do estudos-ia:
- global, em ~/.pi/agent, com fonte versionada em pi-global/ e instalada por scripts/instalar-pi-global.mjs: settings.json (provedor openrouter, modelo padrão openai/gpt-6.1-sol, raciocínio medium) e as extensões web_search e web_fetch, que usam o Tavily;
- no perfil de estudos, em profiles/estudos/: os agentes professor (agente geral, openai/gpt-6.1-sol), researcher (pesquisa, z-ai/glm-5.3), mermaid-maker e svg-maker (desenho, anthropic/claude-sonnet-5.5, que aceita imagem); as skills teach e visualize; as extensões quiz, ask-user-question e visual-tools. A origem é o repositório learn (commit 7cfd894), registrada em profiles/estudos/ORIGEM.md.
O modelo de cada papel é configurável no profile.json. Provedor único: OpenRouter. Busca: Tavily.

13.5 Método. As regras de idioma e de estilo ditas pelo Breno ficam no AGENTS.md do perfil como instruções fixas. Elas não são hipóteses do perfil do aprendiz, porque não vieram de eventos. A skill teach (verdades incondicionais primeiro e "como eu poderia ter descoberto isso?") é a base do explicador. O fluxo sondar, planejar e ensinar da skill é substituído pelo guia de criação de curso (8.3).

13.6 Contexto das sessões. O pi lê AGENTS.md e CLAUDE.md da pasta onde roda e das pastas acima. O AGENTS.md e o CLAUDE.md da raiz do repositório são para o Claude Code e não podem entrar no contexto do professor. Por isso o núcleo cria as sessões com cwd na pasta de dados do perfil e passa o AGENTS.md do perfil como único arquivo de contexto.

13.7 Caminhos. Pasta de dados: G:\Meu Drive\estudos-dados (disponível off-line no Google Drive). Índice e logs: %LOCALAPPDATA%\estudos-app. As sessões de chat do pi ficam em <pasta de dados>/.sessoes-pi/, porque são dados do usuário e precisam de backup. Os dados do checkpoint 1 (aulas, comparações da prova cega, diagramas) estão em estudos-dados\legado\.

13.8 Chaves. OPENROUTER_API_KEY e TAVILY_API_KEY ficam em variáveis de ambiente do usuário do Windows. Nunca em arquivos do repositório.

13.9 Interface. Na integração (Fase 1), uma tela provisória sem estilo prova que o pi está ligado à interface. A interface real só é desenhada depois que o Breno mandar as referências de design. As ferramentas quiz e ask_user_question desenham no terminal; no app elas ganham versões web com os mesmos nomes e parâmetros, para as skills não mudarem.

13.10 Estrutura do repositório. Além da seção 4: pi-global/ (fonte da configuração global do pi), scripts/ (instalação, testes e prova cega), docs/ (plano, roteiros de teste e histórico) e referencias/ (referências visuais).

13.11 Visual (2026-10-16). O design system é o APRNDR, em design-system/ (manual em design-system/README.md), feito pelo Breno no Claude Design. A marca APRNDR vale para o app inteiro, não só para o perfil de estudos. As peças genéricas (tokens, fontes, botões, campos, cards, modal, medidores) servem ao núcleo; as de estudo (cadernos, curso, aula, questionário) são do perfil. A conversa da janela do perfil é um documento em coluna única, não um chat com balões. A tela de perfis mostra um card por perfil (capa, cor, lema e ideograma no campo aparencia do profile.json). Um perfil pode ter uma tela inicial antes da conversa: a do perfil de estudos é o menu de cadernos. Os pedidos que esperam resposta viram um botão na conversa e são respondidos num modal.

13.12 Animação e presença do professor (2026-10-16). O app é animado com física (molas com bounce, texto aparecendo, elementos que se transformam uns nos outros), contra a regra "sem bounce" do manual do design system; a exceção está em design-system/ESTUDOS.md, e tudo para com prefers-reduced-motion. A interface roda em 90%. O professor tem uma foto (a imagem escolhida pelo Breno) e reage ao que está fazendo: pensando, escrevendo, pesquisando e preparando uma questão. O usuário tem um avatar no estilo dos personagens do Notion. Cada resposta tem um botão de informações (data, agente, modelo, duração, tokens e custo) no lugar do nome do modelo no pé.

13.13 Materiais (2026-10-19). O serviço de materiais (5.5) é ligado pelo campo "materiais" do profile.json: as pastas observadas na pasta de dados (no perfil de estudos, materias/*/materiais) e o modelo com visão (anthropic/claude-sonnet-5.5, pelo OpenRouter). O texto extraído de cada arquivo fica em <matéria>/.extraido/<arquivo>/, um markdown por página, célula ou trecho, com o manifesto.json; o índice (5.6) é um SQLite do próprio Node em %LOCALAPPDATA%\estudos-app\indice e é remontado do .extraido sem chamar o modelo. As pastas são varridas ao abrir o perfil e a cada 30 segundos, porque o aviso de arquivo novo do Windows pode não chegar na unidade do Google Drive. O professor tem as ferramentas buscar_material, ler_material e listar_arquivos_de_material. Os materiais são adicionados pela tecla Materiais da tela de cadernos ou copiando para a pasta; quando o caderno existir, o modal vira a seção Materiais dele. Detalhes em docs/materiais.md. Ordem decidida pelo Breno: os materiais (Fase 2, item 2) antes do caderno (item 3).

13.14 Conversa da matéria (2026-10-19). Cada matéria tem as suas conversas: "Conversar sobre a matéria", no caderno, abre a conversa mais recente daquela matéria ou cria uma, e nela o professor sabe de que matéria se trata e busca só nos materiais dela (só procura nas outras se o Breno pedir). A conversa sem matéria continua existindo ("Conversa geral", na tela de cadernos). No núcleo isso é genérico: uma sessão pode ter um contexto (o assunto, um texto a mais no prompt e a pasta que limita a busca nos materiais), gravado na própria sessão.
