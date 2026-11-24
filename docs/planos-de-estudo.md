# Planos de estudos (contrato, versão 1)

Decisão de origem: ESPECIFICACAO.md, 13.21. Fases no docs/PLANO.md, "Novo rumo: o professor ao lado" (este contrato é a base da Fase 2). Vale junto de docs/notas-formato.md (o formato das notas) e docs/mesa-parte-d.md (a marca "do professor" e o link `conversa:`).

Resumo: um plano de estudos é uma nota comum da matéria, marcada com uma tag na primeira linha. É uma checklist dos assuntos. Uma conversa com o professor pode seguir um plano (opcional), escolhido num seletor ou criado pelo professor no começo da conversa. O professor ensina do jeito de sempre, marca o item quando termina de ensiná-lo e retoma pelo primeiro item não marcado.


## 1. A nota

- Fica em `materias/<id>/notas/<Título>.md`, como qualquer nota, com o título que o Breno ou o professor escolher. Pode haver vários planos por matéria.
- A primeira linha não vazia é a tag:

      Plano de estudos · criado em 24/11/2026

  Ela é lida por `ehPlanoDeEstudos(markdown)` em lib/nota-tipos.ts: a primeira linha não vazia começa com "Plano de estudos · ". Se o Breno apagar a linha, a nota deixa de ser plano (continua uma nota comum, e o professor volta a só ler).
- Corpo, nesta ordem (só a checklist é obrigatória):
  1. o objetivo, numa linha `**Objetivo:** ...`, com a data opcional no mesmo texto;
  2. a seção `## Itens`, com os itens em lista de tarefas (`- [ ]` e `- [x]`), um assunto por item, o texto do item numa linha;
  3. a seção `## Conversas`, com um link por conversa que seguiu o plano: `- [24/11/2026](conversa:<id curto>)` (o mesmo link da marca "do professor", lib/trecho-guardado.ts, `idCurtoDaConversa`).
- Não há anotações do professor nos itens. Qualquer outro texto que o Breno escrever (subitens, observações, menções) é preservado como está.

Exemplo:

```markdown
Plano de estudos · criado em 24/11/2026
**Objetivo:** prova final de 26/11 (4 questões escritas e o lab)

## Itens
- [x] **Q1 · Passos do k-means e da clusterização hierárquica (dendrograma)**
- [ ] **Q2 · Seleção de features × redução de dimensionalidade por PCA**
- [ ] **Q3 · Curva ROC**
- [ ] **Q4 · Word embedding × outras vetorizações de texto**
- [ ] **Lab · StratifiedKFold e AUC-ROC multiclasse, k-means e HCluster, PCA, acurácia da clusterização**

## Conversas
- [24/11/2026](conversa:abc12345)
```

Leitura (pura, em lib/plano-tipos.ts): os itens são as tarefas de primeiro nível da seção `## Itens` (sem a seção, as tarefas de primeiro nível da nota toda), cada um com o índice, o texto e o marcado; o progresso é "marcados de total"; o item atual é o primeiro não marcado; o plano está concluído quando todos estão marcados (e há pelo menos um).


## 2. A ligação com a conversa

- A ligação fica no próprio plano, na seção Conversas. O plano de uma conversa é o plano da matéria cuja seção Conversas tem o id curto dela; se houver mais de um, vale o de modificação mais recente. Nada de arquivo ou banco novo.
- Ligar acrescenta o link (criando a seção, se faltar); desligar tira o link dessa conversa do plano. Trocar de plano é desligar de um e ligar no outro.
- Conversa ainda sem mensagem (a "Nova", que ainda não tem arquivo): a escolha fica guardada na tela e vai para o plano junto da primeira mensagem.
- A troca vale a partir da próxima mensagem.


## 3. Quem grava

- O professor só grava em notas com a tag, e só pelas operações abaixo, nunca reescrevendo a nota inteira. Nas outras notas do Breno ele continua só lendo (`listar_notas`, `ler_nota`).
- Toda gravação leva a versão (hash) lida: se o arquivo mudou no meio (o Breno editou), a extensão relê e aplica a operação sobre a versão nova; se o item não existe mais, recusa e diz ao professor.
- Operações (puras, em lib/plano-tipos.ts, aplicadas por lib/planos.ts com o lib/arquivos.ts):
  - marcar e desmarcar um item (pelo índice e conferindo o texto);
  - acrescentar um item (no fim da lista ou depois de um item);
  - ligar e desligar uma conversa.
  As operações mexem só na linha do item, na lista de itens ou na seção Conversas; o resto do arquivo fica byte a byte igual.
- O Breno edita o plano no editor de notas como qualquer nota, inclusive marcando e desmarcando.


## 4. Ferramentas do professor

Só na conversa de uma matéria (a matéria vem do contexto da sessão, como `listar_notas`):
- `listar_planos()`: os planos da matéria, com título, progresso e se esta conversa segue algum.
- `ler_plano(titulo?)`: o plano (o ligado, sem título), com os itens numerados.
- `criar_plano(titulo, objetivo?, itens)`: cria a nota com a tag e liga a conversa. Recusa se já existe uma nota com o título. A tela mostra o cartão "Plano criado" com Abrir.
- `atualizar_plano(operacoes)`: marcar, desmarcar e acrescentar itens no plano ligado.

O nome exato das ferramentas e se ficam em extensions/notas.ts ou numa extensions/planos.ts nova é decidido no plano da Fase 2.


## 5. O que o professor recebe

Com um plano ligado, cada mensagem leva um resumo curto do plano: o título, o objetivo, os itens com o marcado e o item atual. Ele entra pelo gancho `before_agent_start` do pi; a forma (mensagem do perfil escondida da tela ou acréscimo ao prompt de sistema) é decidida no plano da Fase 2, conferindo a API do pi e o converterHistorico do núcleo (que hoje prende ao último item do usuário a mensagem escondida do contexto da tela).

Instruções (AGENTS.md do perfil): com um plano ligado, seguir os itens em ordem; numa conversa nova, retomar pelo primeiro não marcado; marcar o item quando terminar de ensiná-lo; propor um item novo quando uma dúvida crescer, e acrescentar se o Breno concordar. A forma de ensinar não muda: o conteúdo inteiro, do jeito de sempre, sem dividir em trechos curtos e sem esperar o Breno anotar. Para criar um plano: no máximo 2 ou 3 perguntas rápidas (prazo, o que ele já sabe) e então criar e seguir para o primeiro item.


## 6. Eventos

No eventos.jsonl da matéria, com o id da sessão: `criou_plano` {materia, titulo, itens}, `ligou_plano` e `desligou_plano` {materia, titulo, conversa}, `atualizou_plano` {materia, titulo, operacoes (tipo, índice, texto), conversa}. A edição do Breno pelo editor continua gerando o `editou_nota` de sempre.


## 7. A tela

- No topo do painel do professor da mesa, ao lado do seletor de conversas, o seletor "Plano: <título> ▾" (ou "Plano: nenhum"), com os planos da matéria e o progresso de cada um ("2 de 5", "concluído"), "Nenhum" e "Criar plano nesta conversa" (manda o pedido ao professor).
- Na lista de notas, a tag "plano de estudos" com o progresso.
- No topo da nota do plano, uma faixa com o progresso e as conversas (o clique abre a conversa, como o link `conversa:`).
- Na conversa, o cartão "Plano criado: <título>" com Abrir, no rodapé da resposta, como o "Nota criada".
- Tudo segue docs/padroes-de-interface.md: o seletor e a faixa não mudam de tamanho ao trocar de estado, e o progresso não pisca durante uma gravação.
