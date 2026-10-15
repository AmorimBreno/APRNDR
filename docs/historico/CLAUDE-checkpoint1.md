# Projeto estudos-ia

Sistema de estudos com IA que aprende o jeito de explicar para o Breno. Base: a configuração learn (github.com/amosblomqvist/learn, commit 7cfd894) para o pi (github.com/earendil-works/pi).

Este arquivo é para o Claude Code, não para o pi. Ele fica em .claude/ de propósito: o pi lê CLAUDE.md e AGENTS.md da pasta onde roda e de todas as pastas acima dela, e um arquivo na raiz entraria no contexto do professor durante as aulas. Não crie CLAUDE.md nem AGENTS.md na raiz nem em nenhuma pasta acima de vault/.


## Antes de trabalhar

1. Veja abaixo qual é a etapa atual.
2. Leia no PLANO.md a seção dessa etapa e a seção 12 (decisões de 2026-10-05), que tem prioridade sobre o resto do plano quando os dois divergem.
3. Explique o plano da etapa ao Breno e espere a aprovação antes de executar.


## Etapa atual

Checkpoint 1, Etapa 1: o learn funcionando igual ao original (PLANO.md seção 6, com os ajustes da seção 12). Instalação e teste de fumaça feitos; esperando o Breno executar docs/teste-fase-1.md e aprovar.

Concluídas: Etapa 0 (repositório, .claude/CLAUDE.md, referencias/, decisões registradas no PLANO.md).

Estado da Etapa 1:
- pi 1.0.4 em ~/.pi/agent/bin (WSL), pi-interactive-subagents, web_search/web_fetch (Tavily) instalados por extras/instalar.sh.
- Modelos (OpenRouter): professor openai/gpt-6.1-sol (vault/.pi/settings.json, escolhido por prova cega em vault/comparacao/); pesquisador z-ai/glm-5.3; desenhistas anthropic/claude-sonnet-5.5.
- Regras de estilo do Breno em vault/.pi/APPEND_SYSTEM.md (vão para o perfil na Etapa 2).
- Para testar o pi sem o Breno: tmux headless (tmux new-session -d) a partir de vault/, com pi -a; os subagentes pedem confiança no projeto até o Breno escolher "Trust" na primeira aula.


## Como trabalhar com o Breno

1. Antes de executar cada etapa, ou qualquer tarefa grande dentro dela, explique o plano e espere a aprovação dele.
2. Ao explicar algo para ele (decisão técnica, erro, conceito), não pule passos do raciocínio. Diga o porquê de cada etapa.
3. Escreva em português do Brasil, de forma simples e direta. Documentos crus: título, item e texto corrido. Sem tabelas enfeitadas e sem negrito espalhado.
4. Não chute como o pi funciona. A documentação está em packages/coding-agent/docs no repositório do pi, e o código-fonte é aberto. Leia antes de usar uma API.
5. Commits pequenos, um por passo, com mensagem em português.
6. Cada etapa termina com um roteiro de teste em docs/ que o Breno executa. A etapa só está pronta quando ele aprovar.
7. Chaves de API (OpenRouter, Tavily) o Breno coloca no ambiente. Nunca escreva chaves em arquivos do repositório.


## Resumo do plano

Checkpoint 1: pi + Obsidian + terminal.

- Etapa 0: preparação do repositório.
- Etapa 1: o learn igual ao original. pi, tmux, Chromium e librsvg no WSL; vault/.pi com os arquivos do learn e as correções da seção 4 do PLANO; web_search e web_fetch com Tavily em extras/; modelos pelo OpenRouter; tudo em português.
- Etapa 2: calibração e reexplicação (PLANO seção 7). Extensão perfil.ts, skills calibrar e reexplicar, comandos /calibrar, /denovo e /naoentendi, mudanças mínimas e comentadas na skill teach.
- Etapa 3: notas por conceito. Comando /fim-aula gera de uma vez as notas limpas em vault/notas/<assunto>/<conceito>.md, resume a aula e propõe mudanças no perfil.
- Etapa 4: uma semana de estudo real de Ciência de Dados. Fecha o checkpoint 1 quando o Breno aprovar.

Checkpoint 2: app React + servidor (PLANO seções 8 e 9), mais o gerador de plano de estudo (dias por semana, horas por dia ou estudo rápido) e o clicar num trecho para reexplicar. Só começa depois do checkpoint 1 aprovado.


## Ambiente

- Máquina: Windows 11. O pi, o tmux e o Chromium rodam no WSL (Ubuntu), porque o pi-interactive-subagents só funciona dentro do tmux.
- O vault fica no Windows (projeto-estudos\vault) e o pi acessa por /mnt/c/... O Obsidian do Windows não percebe mudanças em arquivos dentro do WSL (\\wsl$), e a aula ao vivo do /md-log precisa disso.
- Rodar sempre a partir de vault/: tmux new -A -s estudo 'pi'.
- Provedor: só OpenRouter. Orçamento: US$ 10 a 30 por mês. Busca do pesquisador: Tavily.
- .gitattributes força LF em tudo, porque scripts .sh com CRLF quebram no bash do WSL.


## Regras fixas do projeto

1. A lógica de ensino mora em arquivos de texto (skills, agentes, perfil). O app do checkpoint 2 usa esses mesmos arquivos. Nunca duplicar a lógica de ensino dentro do app.
2. O perfil (vault/perfil/como-eu-aprendo.md) é markdown que o Breno lê e edita. Toda mudança nele passa pela aprovação dele.
3. Copiar os arquivos do learn para vault/.pi sem clonar um repositório git dentro do outro, e registrar o commit de origem num README em vault/.pi.
4. Mudanças em arquivos vindos do learn: mínimas e marcadas com comentário, para comparar com o original.
5. O repositório é privado. O learn não tem licença; publicar algo exigiria pedir permissão ao autor.
