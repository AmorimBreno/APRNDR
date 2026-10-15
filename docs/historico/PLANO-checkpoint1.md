# Plano de implementação: sistema de estudos com IA que aprende o jeito de explicar

Este documento é a especificação do projeto para o Claude Code. Ele explica o contexto, as decisões já tomadas e o que cada fase precisa entregar. A pasta referencias/ acompanha este arquivo.


## 0. Como começar

Para o Breno: crie um repositório privado no GitHub, coloque este arquivo na raiz como PLANO.md e a pasta referencias/ ao lado. Abra o Claude Code na raiz e peça: "Leia o PLANO.md inteiro e me apresente o plano da Fase 1 antes de executar qualquer coisa."

Para o Claude Code: a primeira tarefa é criar .claude/CLAUDE.md com as regras da seção 2, um resumo curto deste plano (menos de 100 linhas) e a instrução de ler a seção da fase atual no PLANO.md antes de trabalhar.

Use .claude/CLAUDE.md, e não CLAUDE.md na raiz. O motivo: o pi lê os arquivos CLAUDE.md e AGENTS.md da pasta onde roda e de todas as pastas acima dela. Um CLAUDE.md na raiz do repositório entraria no contexto do professor (o pi) durante as aulas, misturando instruções de programação com as de ensino. Pelo mesmo motivo, não crie AGENTS.md nem CLAUDE.md em nenhuma pasta acima de vault/.


## 1. Contexto

Quem usa: o Breno, estudante de Engenharia de Computação no Instituto Mauá de Tecnologia e estagiário full-stack. Trabalha com React e TypeScript e usa Linux (Ubuntu). Estuda em português.

O problema: explicações de IA costumam ser diretas demais e pulam passos do raciocínio. Ele se perde nesses saltos. O sistema precisa descobrir como explicar para ele e melhorar com o uso.

A referência: github.com/amosblomqvist/learn. É uma configuração para o pi (github.com/earendil-works/pi), um agente de terminal que funciona com vários provedores de IA. O sistema sonda o que o aluno sabe, monta um plano e ensina conceito por conceito. A personalização é manual: o autor escreveu a skill de ensino para si mesmo e diz para cada um editar a sua.

O que o Breno quer, nesta ordem:

1. O sistema do repositório funcionando igual ao original.
2. A calibração do jeito de explicar. Um questionário sobre a maneira de explicar e, sempre que ele disser que não entendeu ou pedir para explicar de novo, o sistema pensa em formas realmente diferentes de explicar e atualiza a memória desse modo de ensino.
3. Com a parte anterior funcionando, um app web parecido com o artefato de plano de estudos que ele já usa (referencias/plano-cd.html).
4. Depois, features novas no app: botão em cada seção para refazer a explicação, explicar melhor ou com mais detalhe, comentários e outras ideias que ele vai trazer.


## 2. Como trabalhar com o Breno

1. Antes de executar cada fase, ou qualquer tarefa grande dentro dela, explique o plano e espere a aprovação dele.
2. Quando explicar algo para ele (uma decisão técnica, um erro, um conceito), não pule passos do raciocínio. Diga o porquê de cada etapa.
3. Escreva em português do Brasil, de forma simples e direta. Documentos crus: título, item e texto corrido. Sem tabelas enfeitadas e sem negrito espalhado.
4. Não chute como o pi funciona. A documentação dele está em packages/coding-agent/docs no repositório do pi (lista na seção 11), e o código-fonte é aberto. Leia antes de usar uma API.
5. Commits pequenos, um por passo, com mensagem em português.
6. Cada fase termina com um roteiro de teste em docs/ que o Breno executa. A fase só está pronta quando ele aprovar.


## 3. Decisões já tomadas

1. A base é o pi, como no repositório de referência. O pi já resolve o uso de várias IAs: chave por variável de ambiente (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY) ou pelo comando /login, e modelos locais, como os do Ollama, pelo models.json.
2. O conteúdo das aulas fica em markdown numa pasta aberta no Obsidian (o vault). Matemática em LaTeX. Diagramas como PNG embutidos na nota.
3. A lógica de ensino mora em arquivos de texto: skills, agentes e o perfil. O app da Fase 3 usa esses mesmos arquivos. Não pode existir uma segunda cópia da lógica de ensino dentro do app.
4. A memória do jeito de explicar é um arquivo markdown que o Breno lê e edita no Obsidian, não um banco escondido. Toda mudança nela passa pela aprovação dele.
5. As fases seguem a ordem da seção 1. A Fase 3 só começa depois que a Fase 2 funcionar no estudo de verdade.


## 4. O repositório de referência por dentro

Commit de referência: 7cfd894. As peças:

1. skills/teach/SKILL.md é o método de ensino. Tem dois princípios: começar por verdades incondicionais, que o aluno aceita sem ressalva; e mostrar "como eu poderia ter descoberto isso?", motivando cada passo. O processo tem três fases, sempre nesta ordem:
   - Sondar: quizzes que sobem a dificuldade até achar onde o conhecimento acaba em cada pré-requisito (ferramenta quiz), e perguntas sobre o objetivo do aluno (ferramenta ask_user_question).
   - Planejar: um subagente pesquisador mapeia o assunto; o plano é apresentado em prosa e como mapa de dependências em mermaid; o professor espera a aprovação.
   - Ensinar: para cada nó do mapa, motivar, estabelecer, conectar ao que já foi aprendido e checar com quiz.
   A skill também traz um bom procedimento para escrever alternativas de quiz e pede LaTeX em tudo.
2. skills/visualize/SKILL.md decide quando vale um diagrama e delega a um subagente desenhista. O desenhista escreve, renderiza, olha a imagem, corrige e só então publica em viz/. A lição embute a imagem com ![[arquivo.png|500]].
3. agents/researcher.md busca na web e devolve um resumo com fontes. Usa as ferramentas web_search, web_fetch e safe_bash. Modelo fixado: openrouter/z-ai/glm-5.3.
4. agents/mermaid-maker.md e agents/svg-maker.md são os desenhistas. Modelo fixado: anthropic/claude-sonnet-5. Precisam de um modelo que aceite imagem, porque olham o PNG que geraram.
5. extensions/quiz.ts registra a ferramenta quiz, com correção na hora, a opção "I don't know" e um campo de nota livre.
6. extensions/ask-user-question.ts registra a ferramenta ask_user_question, para perguntas sem resposta certa.
7. extensions/md-log.ts cria o comando /md-log <arquivo>, que espelha a sessão num .md. O Breno deixa esse arquivo aberto no Obsidian e acompanha a aula ao vivo. /md-unlog para.
8. extensions/visual-tools/ tem as ferramentas write, edit e render para mermaid (mermaid-cli com Chrome) e para SVG (rsvg-convert, com ImageMagick de reserva). Elas se registram no pi-interactive-subagents.
9. Dependência externa: pi-interactive-subagents (github.com/amosblomqvist/pi-interactive-subagents). Roda cada subagente num painel do tmux e só funciona dentro do tmux. Sem ele o ensino funciona, mas sem pesquisador e sem diagramas.

Problemas encontrados lendo o código, que a Fase 1 precisa resolver:

1. extensions/visual-tools/package.json tem uma devDependency que aponta para uma pasta do Mac do autor (file:/Users/amos/...). O npm install vai falhar. Em tempo de execução o pi entrega os próprios módulos às extensões, então dá para remover essa dependência ou trocar por uma versão do npm.
2. Em extensions/visual-tools/tools/_common.ts, os caminhos do Chrome são só de macOS. No Linux, procurar também /usr/bin/google-chrome, /usr/bin/google-chrome-stable, /usr/bin/chromium, /usr/bin/chromium-browser e /snap/bin/chromium, ou ler o caminho de uma variável de ambiente. Sem isso o mermaid-cli não renderiza, porque o download do Chromium está desligado (PUPPETEER_SKIP_DOWNLOAD=1).
3. O pesquisador depende de web_search e web_fetch. O pi-interactive-subagents procura essas ferramentas como extensões globais em ~/.pi/agent/extensions/web-search/index.ts e web-fetch/index.ts (ver a função getToolExtensionPath em pi-extension/subagents/index.ts). Elas não estão em nenhum dos dois repositórios. É preciso escrever ou encontrar essas extensões e escolher, com o Breno, o serviço de busca. A maioria pede chave.
4. Os modelos fixados nos agentes precisam ser trocados pelos que o Breno tiver.
5. O repositório learn não tem arquivo de licença. Para uso pessoal não há problema. O repositório do projeto fica privado, e publicar algo exigiria pedir permissão ao autor.
6. Idioma: o Breno estuda em português, e o quiz mostra "I don't know".


## 5. Estrutura do projeto

```
estudos-ia/                         repositório privado
  .claude/CLAUDE.md                 instruções para o Claude Code (não para o pi)
  PLANO.md                          este plano
  referencias/plano-cd.html         artefato de referência visual (Fase 3)
  docs/                             roteiros de teste de cada fase
  extras/                           código que vai para ~/.pi/agent (web-search, web-fetch), com script de instalação
  vault/                            abrir no Obsidian; o pi roda aqui
    .pi/                            cópia do learn + adições
      APPEND_SYSTEM.md
      skills/  agents/  extensions/  prompts/
    perfil/
      como-eu-aprendo.md            memória do jeito de explicar (Fase 2)
      eventos.jsonl                 histórico de calibrações e reexplicações (Fase 2)
      versoes/                      versões anteriores do perfil
    materiais/                      arquivos do Breno para estudar (notebooks, PDFs)
    aulas/                          logs das sessões (md-log)
    viz/                            diagramas publicados
  app/                              Fase 3
```

Copie os arquivos do learn para vault/.pi, sem clonar um repositório git dentro do outro, e registre o commit de origem num README dentro de vault/.pi.


## 6. Fase 1: o repositório funcionando igual ao original

Objetivo: o sistema do learn rodando na máquina do Breno, só com as adaptações mínimas da seção 4.

Passos:

1. Perguntar ao Breno o que, da seção 10, trava esta fase: sistema operacional (o tmux não roda no Windows nativo, então Linux ou WSL), provedores e chaves, serviço de busca e se ele já usa o Obsidian.
2. Instalar os pré-requisitos: pi (curl -fsSL https://pi.dev/install.sh | sh, ou npm install -g --ignore-scripts @earendil-works/pi-coding-agent com Node 22.19 ou mais novo), tmux, Chrome ou Chromium, rsvg-convert (no Ubuntu, pacote librsvg2-bin) e Obsidian. Conferir cada um com --version.
3. Configurar os provedores pelo /login ou por variáveis de ambiente e testar com /model.
4. Montar vault/.pi com os arquivos do learn.
5. Instalar o pi-interactive-subagents como pacote do pi (pi install git:github.com/amosblomqvist/pi-interactive-subagents; conferir a sintaxe em docs/packages.md do pi).
6. Resolver os problemas 1, 2, 3, 4 e 6 da seção 4:
   - visual-tools: corrigir o package.json e rodar npm install dentro de vault/.pi/extensions/visual-tools;
   - caminhos do Chrome no Linux;
   - web_search e web_fetch: código versionado em extras/, com um script que instala em ~/.pi/agent/extensions/;
   - modelos dos agentes conforme as chaves do Breno, com os desenhistas num modelo que aceite imagem;
   - português: em vault/.pi/APPEND_SYSTEM.md, instruir a responder sempre em português do Brasil, mantendo em inglês só os termos técnicos que a área usa em inglês. Trocar "I don't know" por "Não sei" no quiz.
7. Na primeira vez que o pi abrir em vault/, aceitar a confiança no projeto (project trust). Sem isso o pi não carrega a pasta .pi.
8. Rodar sempre dentro do tmux, a partir de vault/: tmux new -A -s estudo 'pi'.

Pronto quando, seguindo o roteiro em docs/teste-fase-1.md executado pelo Breno:

1. Pedir para aprender um tema curto, por exemplo "R² ajustado", mostra as três fases: sondagem com quiz, plano com mapa em mermaid esperando aprovação e ensino nó a nó com quiz de checagem.
2. /md-log aulas/teste.md mostra a aula ao vivo no Obsidian, com LaTeX renderizado.
3. O pesquisador abre num painel do tmux e devolve fontes.
4. Um diagrama aparece em viz/ e embutido na nota.
5. Tudo em português.


## 7. Fase 2: o sistema aprende o jeito de explicar

Objetivo: descobrir como explicar para o Breno e melhorar com o uso. São duas fontes de aprendizado: um questionário de calibração e os pedidos de "não entendi" e "explica de novo" durante as aulas.

Um cuidado de desenho. Não use "estilos de aprendizagem" do tipo visual, auditivo e cinestésico: a pesquisa não sustenta adaptar o ensino a esses rótulos. O que muda o resultado, e é o caso do Breno, é o tamanho dos passos, o uso de exemplos resolvidos, a ordem (do concreto para o abstrato ou o contrário), quanto dos pré-requisitos já está firme e o vocabulário. É isso que o perfil registra. E o perfil se apoia em evidência (resultado de quiz, ponto onde travou), não só no que o Breno diz preferir.


### 7.1 A memória: vault/perfil/como-eu-aprendo.md

Markdown legível e editável no Obsidian. Exemplo de formato:

```markdown
---
versao: 1
atualizado: 2026-10-06
---
# Como o Breno aprende

## Regras de explicação
- R1. Mostrar todos os passos intermediários do raciocínio. Nada de "é fácil ver que" nem de pular contas. [origem: dito pelo Breno] [confiança: alta]

## O que costuma funcionar
- Conceito matemático novo: exemplo numérico pequeno, depois o passo a passo, depois a fórmula geral. [evidência: 3 eventos]

## O que costuma não funcionar
- Definição formal logo de cara, sem exemplo. [evidência: 2 eventos]

## Hipóteses em teste
- Analogias com programação ajudam em estatística? [evidência: 1 evento]

## O que ele já domina (para analogias e exemplos)
- Programação, desenvolvimento web com React e TypeScript, Linux.
```

Regras do arquivo:

1. Cada regra tem um id, a origem e a confiança.
2. O arquivo entra em todo turno, então precisa ser curto (meta: até umas 60 linhas). Quando crescer, propor a consolidação de regras parecidas.
3. A regra R1 do exemplo já é conhecida e entra como semente: o Breno disse que tem dificuldade com explicações de IA muito diretas ou que pulam passos do raciocínio. As outras linhas do exemplo são só ilustração.


### 7.2 O histórico: vault/perfil/eventos.jsonl

Uma linha JSON por evento. Só se acrescenta, nunca se edita. Exemplo:

```json
{"quando":"2026-10-12T19:40:00-03:00","tipo":"reexplicacao","sessao":"aulas/2026-10-12-r2.md","conceito":"R² ajustado","gatilho":"nao_entendi","onde_travou":"por que dividir por n-p-1","estrategia_anterior":"definicao_formal","estrategia_nova":"exemplo_numerico","resultado":"entendeu","quiz_acertou":true,"regras":["R1"]}
```

Tipos de evento: calibracao, reexplicacao, quiz_errado e mudanca_perfil (aprovada ou recusada).


### 7.3 Questionário de calibração (skill calibrar e comando /calibrar)

Roda na primeira aula, se o perfil não existir, e sempre que o Breno pedir.

1. Contexto, com ask_user_question, porque aqui não há resposta certa: o que costuma fazer ele se perder numa explicação; um exemplo de explicação que funcionou; o que ele acha que prefere (exemplo antes ou depois da teoria, analogias, nível de detalhe, tamanho dos blocos, termos técnicos em inglês ou em português).
2. Teste prático. Três mini conceitos de dificuldade parecida que ele ainda não domine (perguntar a área ou propor). Cada um é explicado num estilo diferente, por exemplo: direto e resumido; passo a passo sem pular nada; exemplo concreto primeiro e regra geral depois. A ordem é sorteada. Depois de cada um vêm uma pergunta de compreensão com quiz, que tem resposta certa, e uma pergunta com ask_user_question sobre onde travou (em nenhum lugar, pulou um passo, termo que eu não conhecia, rápido demais, longo demais) e a clareza de 1 a 5.
3. Síntese. Comparar os acertos com as respostas, escrever as regras propostas com a evidência de cada uma, mostrar o perfil proposto e só gravar depois da aprovação.
4. Avisar ao Breno que isso é um ponto de partida. A calibração de verdade vem do uso (7.4).


### 7.4 Reexplicação (skill reexplicar e comandos /denovo e /naoentendi)

Gatilhos: o Breno diz que não entendeu, pede para explicar de novo ou de outro jeito, diz que um passo foi pulado, marca "Não sei" ou erra o quiz de checagem de um nó. Os comandos são prompt templates em vault/.pi/prompts/ que acionam a skill.

Protocolo:

1. Achar onde travou antes de reexplicar. Perguntar com ask_user_question, usando os passos da explicação anterior como opções, ou usar um quiz curto. Se o problema for um pré-requisito, voltar ao pré-requisito.
2. Pensar em pelo menos três estratégias diferentes, olhando o perfil e o que já foi tentado nesta sessão para este conceito, e escolher uma. Dizer em uma linha qual vai tentar ("vou tentar com um exemplo numérico"), para o Breno poder pedir outra. Dizer a mesma coisa com outras palavras não conta como estratégia nova.
3. Explicar com a estratégia escolhida, sem pular passos.
4. Checar com quiz.
5. Registrar o evento com a ferramenta registrar_evento (7.5).
6. Se falhar de novo, trocar de família de estratégia, por exemplo de verbal para visual ou para código executável. Na terceira falha, oferecer ao Breno escolher a estratégia ou voltar aos pré-requisitos.
7. No fim do nó, depois que o quiz de checagem passar, se os eventos sugerirem uma regra nova ou uma mudança de confiança, propor a mudança no perfil com a ferramenta propor_mudanca_perfil. Não interromper a explicação para isso.

Catálogo de estratégias. Os nomes são fixos porque aparecem no histórico:

- passo_a_passo_fino: quebrar em passos menores, cada um com sua justificativa.
- exemplo_numerico: números pequenos, contas feitas à mão.
- exemplo_do_dominio: um caso real do assunto, de preferência dos materiais em vault/materiais/.
- analogia: com algo que ele domina (lista no perfil).
- visual: diagrama pela skill visualize.
- codigo_executavel: o cálculo em Python, mostrando a saída.
- descoberta_socratica: perguntas pequenas em sequência até ele chegar lá.
- contraexemplo: o que daria errado se não fosse assim.
- de_tras_para_frente: partir do resultado e perguntar por que cada peça precisa estar ali.
- comparacao: contraste com um conceito vizinho que ele já sabe.
- definicao_formal: definição e notação.


### 7.5 Extensão perfil (vault/.pi/extensions/perfil.ts)

Para não depender de o modelo lembrar de ler e escrever os arquivos certos, criar uma extensão do pi que:

1. injeta o conteúdo de como-eu-aprendo.md no prompt de sistema em toda execução (evento before_agent_start; ver docs/extensions.md do pi), com a instrução de seguir as regras;
2. registra a ferramenta registrar_evento, que valida o formato e acrescenta a linha em eventos.jsonl;
3. registra a ferramenta propor_mudanca_perfil, que recebe as mudanças (adicionar, alterar ou remover regras, com motivo e evidência), mostra o antes e o depois, pede a aprovação (aplicar, não aplicar, ajustar), grava o arquivo, aumenta a versão, guarda a versão anterior em perfil/versoes/ e registra o evento mudanca_perfil. Para o diálogo, usar ctx.ui.select e ctx.ui.input, que funcionam no terminal e também fora dele (modo RPC). Isso facilita a Fase 3;
4. registra o comando /perfil, que mostra o perfil atual;
5. opcional: no evento input, reconhece frases como "não entendi" e "explica de novo" e reforça o gatilho da skill reexplicar.


### 7.6 Mudanças na skill teach

Mexer o mínimo e marcar cada mudança com um comentário, para ficar fácil comparar com o original:

1. no começo da sessão, se o perfil não existir, sugerir /calibrar;
2. em todas as fases, seguir as regras do perfil;
3. "Não sei" ou erro no quiz de checagem aciona a skill reexplicar;
4. no fim da sessão, resumir o que funcionou e propor de uma vez as mudanças no perfil.

Pronto quando, seguindo o roteiro em docs/teste-fase-2.md:

1. /calibrar cria o perfil, com regras e evidências, só depois da aprovação.
2. Dizer "não entendi" no meio de um nó leva à pergunta de onde travou, a uma estratégia diferente anunciada em uma linha e a um quiz. O evento aparece em eventos.jsonl.
3. Pedir "de novo" três vezes no mesmo conceito nunca repete a estratégia.
4. Recusar uma mudança de perfil não grava nada e registra a recusa.
5. Numa sessão nova, a explicação já segue o perfil. Testar com uma regra fácil de ver, como "sempre começar com um exemplo numérico".
6. O Breno usou o sistema em pelo menos uma semana de estudo de verdade e aprovou.


## 8. Fase 3: o app com a cara do artefato

Só começa depois do item 6 acima.

Objetivo: uma interface web local que substitui o terminal, com o visual e a organização do artefato de referência. O arquivo referencias/plano-cd.html abre direto no navegador; fora do claude.ai o progresso não é salvo, mas o visual e os questionários funcionam. Ele foi feito à mão num arquivo só (HTML, CSS e JS) e serve de referência de visual e de comportamento, não de arquitetura.

O que copiar dele: tema escuro, fontes Geist e Geist Mono, barra superior com trilha de navegação e progresso, barra lateral de seções com miniaturas, visão de calendário com painel do dia, visão de seções com cards em trilho, questionários de conteúdo e prático numa janela própria e dias marcados como feitos.

Requisitos:

1. Mesmo cérebro. O backend roda o pi pelo SDK (createAgentSession, no mesmo processo Node; ver docs/sdk.md do pi), carregando as mesmas skills, agentes, perfil e extensões de vault/.pi.
2. Versão web das ferramentas de terminal. quiz e ask_user_question desenham a interface com ctx.ui.custom(), que só existe no terminal: no modo RPC ele devolve undefined (ver docs/rpc-extension-ui.md do pi). O app registra ferramentas com os mesmos nomes e parâmetros, que mandam a pergunta ao navegador por WebSocket, esperam a resposta e devolvem ao modelo o mesmo formato de resultado. Assim as skills não mudam.
3. Subagentes sem tmux. O pi-interactive-subagents depende de painéis do tmux. No app, a ferramenta subagent cria sessões filhas pelo SDK, com o modelo, as ferramentas e o prompt de cada arquivo em agents/, e registra as visual-tools nessas sessões.
4. Leitor de lição. O texto chega em streaming e é renderizado como markdown, com LaTeX (KaTeX) e diagramas. A lição também é gravada no vault, como faz o md-log, para continuar legível no Obsidian.
5. Plano e calendário. As seções vêm do mapa de dependências do plano, e cada nó vira uma lição. Os dias de estudo vão para o calendário, e cada dia tem a lição, os questionários e o botão de feito. Importar o plano de Ciência de Dados do artefato é um bom primeiro teste.
6. Questionários no formato do artefato: pergunta, código opcional, alternativas, explicação e fonte, nos tipos conteúdo e prático. Os resultados ficam salvos e viram evidência para o perfil.
7. Configurações: escolher provedor e modelo por papel (professor, pesquisador, desenhistas), usando o que o pi já oferece. As chaves ficam fora do repositório.
8. Tudo local. Os dados ficam nos arquivos do vault. Se o progresso precisar de banco, SQLite local.
9. Stack sugerida, a confirmar com o Breno: React, TypeScript e Vite no front; Node e TypeScript no back (Hono ou Fastify); WebSocket para o streaming e os diálogos.

Comece por uma prova de conceito pequena: uma sessão do pi pelo SDK com o quiz web funcionando. Só depois construa as telas.

Pronto quando:

1. Uma aula completa (sondagem, plano, ensino, quiz e reexplicação) é feita só pelo navegador.
2. O perfil e o eventos.jsonl são os mesmos da Fase 2 e continuam sendo atualizados.
3. O visual segue o artefato no computador e no celular.


## 9. Fase 4: features novas

Regra para todas: qualquer "refazer" ou "não entendi" passa pelo protocolo de reexplicação (7.4) e alimenta o perfil.

1. Botão em cada seção ou parágrafo para refazer a explicação com outra estratégia.
2. Botão para explicar melhor ou com mais detalhe: a mesma estratégia com passos menores (passo_a_passo_fino), mostrando quais passos faltavam.
3. Comentários presos a um trecho da lição. O Breno comenta, a IA responde ali, e o comentário vira evidência para o perfil.
4. Marcações rápidas por parágrafo: "pulou um passo aqui", "não entendi", "longo demais".
5. Sugestão, a confirmar com o Breno: aulas baseadas só nos materiais do curso em vault/materiais/, citando a fonte de cada afirmação, como foi feito nos questionários do artefato.
6. Outras ideias do Breno: (lista a completar).


## 10. Perguntas para o Breno antes de começar

1. Em que sistema vai rodar: Linux nativo ou WSL.
2. Quais provedores e chaves ele tem (Anthropic, OpenAI, Google, OpenRouter) e se quer modelos locais (Ollama).
3. Qual serviço de busca usar no pesquisador e se já tem chave.
4. Nome do repositório privado no GitHub.
5. Se já usa o Obsidian e onde quer o vault.
6. Quanto quer gastar com APIs por mês, para escolher o modelo de cada papel.


## 11. Referências

1. github.com/amosblomqvist/learn, commit 7cfd894: README.md, skills/, agents/ e extensions/.
2. github.com/earendil-works/pi, documentação em packages/coding-agent/docs: quickstart.md, configuration.md, skills.md, prompt-templates.md, extensions.md, packages.md, models.md, providers.md, tmux.md, sdk.md, rpc.md e rpc-extension-ui.md.
3. github.com/amosblomqvist/pi-interactive-subagents: README.md e pi-extension/subagents/index.ts.
4. referencias/plano-cd.html: o artefato de referência visual da Fase 3.


## 12. Decisões de 2026-10-05

Respostas do Breno às perguntas da seção 10 e ajustes de escopo. Quando algo aqui divergir das seções anteriores, vale esta seção.

### Ambiente

1. A máquina é Windows 11, não Ubuntu nativo. O pi, o tmux, o Chromium e o rsvg-convert rodam no WSL (Ubuntu), porque o pi-interactive-subagents só funciona dentro do tmux.
2. O vault fica numa pasta do Windows (projeto-estudos\vault) e o pi acessa por /mnt/c/... O motivo: o Obsidian do Windows não percebe mudanças em arquivos dentro do WSL (\wsl$), e a aula ao vivo do /md-log depende disso. A escrita do WSL em /mnt/c acontece no disco do Windows, então o Obsidian percebe.
3. O Node do Windows (22.17) fica como está. O pi usa um Node 22.19 ou mais novo instalado no WSL.
4. O Obsidian ainda não está instalado. Entra na lista de pré-requisitos da Etapa 1.
5. O .gitattributes força LF em todos os arquivos, porque scripts .sh com CRLF quebram no bash do WSL.

### Provedores, custo e busca

1. Provedor: só OpenRouter, para todos os papéis.
2. Orçamento: US$ 10 a 30 por mês. Antes de fixar os modelos, propor um por papel com base na lista atual do OpenRouter e medir o custo de uma aula de teste. Os desenhistas precisam de um modelo que aceite imagem.
3. Busca do pesquisador: Tavily. As extensões web_search e web_fetch ficam em extras/, escritas de forma que trocar de serviço seja fácil.
4. As chaves (OPENROUTER_API_KEY, TAVILY_API_KEY) o Breno coloca no ambiente do WSL. Nunca em arquivos do repositório.

### Repositório

Repositório privado AmorimBreno/estudos-ia no GitHub. A pasta local continua se chamando projeto-estudos.

### Escopo dos checkpoints

O Breno dividiu o trabalho em dois checkpoints:

1. Checkpoint 1 (pi + Obsidian + terminal) junta as Fases 1 e 2 deste plano e acrescenta as notas por conceito. Etapas:
   - Etapa 0: preparação do repositório.
   - Etapa 1: o learn igual ao original (seção 6).
   - Etapa 2: calibração e reexplicação (seção 7, sem mudanças).
   - Etapa 3: notas por conceito (abaixo).
   - Etapa 4: uma semana de estudo real de Ciência de Dados, com os materiais do curso em vault/materiais/. O roteiro de teste da Etapa 1 continua usando um tema curto (R² ajustado).
2. Checkpoint 2 (app React + servidor) junta as Fases 3 e 4. Só começa depois do checkpoint 1 aprovado.

Cada etapa é explicada e aprovada pelo Breno antes de ser executada.

### Notas por conceito (Etapa 3, novo)

O log da sessão (/md-log em aulas/) continua como está. Além dele, cada conceito estudado vira uma nota limpa em vault/notas/<assunto>/<conceito>.md, com links [[...]] para os conceitos de que ele depende, para a visão de grafo do Obsidian mostrar o mapa de conhecimento.

As notas são geradas só no fim da aula, de uma vez, não a cada nó. Para isso existe o comando /fim-aula, que:

1. gera as notas dos nós que passaram no quiz de checagem;
2. resume o que funcionou na aula;
3. propõe as mudanças no perfil (item 4 da seção 7.6).

O comando existe porque, sem ele, o pi não tem como saber que a aula acabou.

### Movido para o checkpoint 2

1. Gerador de plano de estudo: o Breno escolhe quantos dias da semana e quantas horas por dia vai estudar um assunto, ou pede só um estudo rápido. Entra junto com o plano e o calendário da seção 8.
2. Apontar um trecho da lição para ser reexplicado (clicar no trecho). No checkpoint 1 vale só o "não entendi" geral da seção 7.4.
