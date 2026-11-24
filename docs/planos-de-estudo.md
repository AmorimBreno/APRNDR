# Planos de estudos (contrato e plano da Fase 2, versão 2)

Decisão de origem: ESPECIFICACAO.md, 13.21. Fases no docs/PLANO.md, "Novo rumo: o professor ao lado". Vale junto de docs/notas-formato.md (o formato das notas), docs/mesa-parte-d.md (a marca "do professor", o cartão e o link `conversa:`) e docs/ponte-de-eventos.md.

Resumo: um plano de estudos é uma nota comum da matéria, marcada com uma tag na primeira linha. É uma checklist dos assuntos. Uma conversa com o professor pode seguir um plano (opcional), escolhido num seletor ou criado pelo professor no começo da conversa. O professor ensina do jeito de sempre, marca o item quando termina de ensiná-lo e retoma pelo primeiro item não marcado.

Decisões do Breno (2026-11-24): sem anotações do professor nos itens; a aula segue normal (sem trechos curtos, sem esperar anotar); escolher um plano no seletor já começa a aula (o app manda a mensagem); o cartão do plano criado tem Abrir e Desfazer.

O que mudou da versão 1: a conversa guarda qual plano segue numa entrada da própria sessão (seção 2), e a seção Conversas do plano vira só o histórico (soltar o plano não tira o link). O professor recebe o resumo por uma mensagem escondida do `before_agent_start` (seção 5), conferido na API do pi 1.2.0.


## 1. A nota

- Fica em `materias/<id>/notas/<Título>.md`, como qualquer nota, com o título que o Breno ou o professor escolher. Pode haver vários planos por matéria.
- A primeira linha não vazia é a tag:

      Plano de estudos · criado em 24/11/2026

  Lida por `ehPlanoDeEstudos(markdown)` em lib/plano-tipos.ts (o nota-tipos.ts importa de lá): a primeira linha não vazia começa com "Plano de estudos · ". Se o Breno apagar a linha, a nota deixa de ser plano (continua uma nota comum, e o professor volta a só ler). Como a marca "do professor", a linha da tag não entra na prévia da lista (`previaDaNota`).
- Corpo (só a checklist é obrigatória):
  1. o objetivo, numa linha `**Objetivo:** ...`, com a data opcional no mesmo texto;
  2. a seção `## Itens`, com as tarefas (`- [ ]` e `- [x]`, o formato que o editor já grava), um assunto por item, o texto numa linha;
  3. a seção `## Conversas`, o histórico das conversas que seguiram o plano: `- [24/11/2026](conversa:<id curto>)` (lib/trecho-guardado.ts, `idCurtoDaConversa`).
- Sem anotações do professor nos itens. Qualquer outro texto do Breno (subitens, observações, menções, a ordem que ele mudou) é preservado como está.

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

Leitura (pura, lib/plano-tipos.ts, sem Node, usada também pela tela): os itens são as tarefas de primeiro nível da seção `## Itens` (sem a seção, as tarefas de primeiro nível da nota toda), numerados de 1 em diante na ordem do arquivo; cada um com o texto (o markdown da linha, sem o `- [ ] `) e o marcado. Progresso = marcados de total. Item atual = o primeiro não marcado. Concluído = todos marcados (e pelo menos um). As tarefas de dentro de um item (recuadas) são do Breno e não contam.


## 2. A conversa e o plano

- Qual plano a conversa segue fica numa entrada da sessão, `customType: "estudos.plano"`, `data: { titulo: string | null }`, gravada com `pi.appendEntry` (não vai ao modelo). Vale a última do ramo, como o contexto da matéria (`materiaDaConversa`). `null` = não segue plano. Sem entrada, não segue.
- Seguir um plano (pelo seletor ou pelo `criar_plano`) grava a entrada. Soltar ("Nenhum") grava `null`. Trocar é gravar o outro.
- A seção Conversas é só o histórico: na primeira execução depois de a conversa seguir o plano (o `before_agent_start`), se o id curto dela não está na seção, a extensão acrescenta o link e grava `ligou_plano`. Soltar não tira o link.
- Renomear a nota do plano: a extensão de notas avisa (`pi.events`, "notas:renomeada" {materia, de, para}) e, se a conversa aberta segue `de`, a extensão dos planos grava a entrada com `para`. Apagar a nota ou tirar a tag: a conversa passa a não seguir nada (o resumo não vai, o seletor mostra "Nenhum").


## 3. Quem grava e como

- O professor só grava em notas com a tag, e só pelas operações abaixo, nunca reescrevendo a nota inteira. Nas outras notas do Breno ele só lê (as ferramentas dele já não têm write nem edit, decisão de 2026-11-24).
- Operações (puras, lib/plano-tipos.ts): marcar e desmarcar um item (pelo número, conferindo o texto se vier), acrescentar um item (no fim da lista ou depois de um item) e acrescentar uma conversa. Cada operação mexe só na linha do item, numa linha nova da lista ou na seção Conversas; o resto do arquivo fica byte a byte igual (inclusive o fim de linha que o arquivo usa).
- Gravação (lib/planos.ts): lê, aplica, grava com a versão lida (`salvarNota` com `versao`, que já recusa se o arquivo mudou; a conferência e a gravação ficam numa trava por arquivo, `comTravaDaNota`, a mesma do editor, porque as duas extensões gravam a mesma nota). Se mudou no meio, relê e aplica de novo, até 3 vezes. Um item que não existe mais (ou cujo texto não bate) é recusado com a frase para o professor.
- Depois de gravar, a extensão avisa a tela no painel "notas" com a ação nova `mudou_fora` {materia, titulo, versao, conteudo}: o editor com a nota aberta e sem mudança pendente recarrega o conteúdo (fora do desfazer); com mudança pendente, ignora, e o salvamento dele cai no conflito que já existe ("Recarregar a do arquivo" ou "Manter a minha").
- O Breno edita o plano no editor como qualquer nota (marca, desmarca, reordena, escreve).


## 4. Ferramentas do professor (extensions/planos.ts)

Só na conversa de uma matéria (a matéria vem do contexto, `materiaDaConversa`):
- `listar_planos()`: os planos da matéria, com o progresso, e qual esta conversa segue.
- `ler_plano(titulo?)`: o plano (o seguido, sem título), com os itens numerados e o atual.
- `criar_plano(titulo, objetivo?, itens[])`: cria a nota com a tag (recusa título que já existe), faz a conversa segui-la e mostra o cartão. Até 60 itens, cada um até 300 caracteres, sem HTML desconhecido (`temHtmlDesconhecido`).
- `atualizar_plano(operacoes[])`: no plano seguido; operações `{tipo: "marcar" | "desmarcar", item: number, texto?: string}` e `{tipo: "acrescentar", texto: string, depois?: number}`. Devolve o plano como ficou.

As quatro entram no `tools` de agents/professor.md.


## 5. O que o professor recebe

- No `before_agent_start` (pi 1.2.0: cada extensão pode devolver uma `message`; o pi junta as de todas e grava como mensagens custom depois da do usuário), se a execução veio do Breno (`messageType === "user"`) e a conversa segue um plano que existe: a mensagem `customType: "estudos.plano"`, `display: false`, com o título, o objetivo, os itens numerados com [x] e [ ], o item atual e a regra curta ("siga em ordem; ao terminar de ensinar um item, marque com atualizar_plano"). Até 2000 caracteres (itens longos cortados).
- O núcleo ignora mensagens custom de outro tipo na tela e no histórico (converterHistorico só trata a do contexto da tela), então ela não aparece na conversa. Fica gravada na sessão: dá para saber o que o professor viu.
- Instruções fixas (AGENTS.md do perfil, seção "Planos de estudos"): com um plano, seguir os itens em ordem; numa conversa nova, retomar pelo primeiro não marcado, dizendo onde parou; marcar o item quando terminar de ensiná-lo; propor item novo quando uma dúvida crescer, e acrescentar se o Breno concordar. A forma de ensinar não muda. Para criar: no máximo 2 ou 3 perguntas rápidas (prazo, o que ele já sabe), criar e seguir para o primeiro item.


## 6. Eventos (eventos.jsonl da matéria, com o id da sessão)

`criou_plano` {materia, titulo, itens, hash}, `seguiu_plano` {materia, titulo | null} (seletor, criar ou renomear), `ligou_plano` {materia, titulo, conversa, antes, hash} (o link no histórico), `atualizou_plano` {materia, titulo, operacoes, antes, hash} (antes e hash: o hash do arquivo antes e depois da gravação do professor) e `desfez_plano` {materia, titulo}. A edição do Breno continua no `editou_nota`. A linha do tempo do caderno ganha os rótulos.


## 7. A ponte "planos" e a tela

Ponte (painel "planos", passageira, `gravar: false`):
- a tela manda `listar` {materia} e `seguir` {materia, titulo | null, sessao, pedido}; a extensão responde `lista` {materia, sessao, planos: [{titulo, feitos, total, concluido}], seguindo: titulo | null}, e manda a `lista` de novo depois de criar, atualizar, desfazer ou seguir;
- `desfazer_plano` {materia, titulo, sessao, pedido}: `titulo` é o da criação (o do cartão). A partir do último `criou_plano` com ele, a extensão segue os `renomeou_nota` (o título de agora) e a cadeia das gravações do professor (`atualizou_plano` e `ligou_plano`, cada uma partindo do hash que a anterior deixou). Apaga só se a cadeia não tem buraco (nenhuma edição do Breno no meio) e o arquivo é o que a última gravação deixou; grava `desfez_plano` e a conversa deixa de seguir; responde `desfeito` (com o título de agora) ou `erro`. O cartão não usa a lista para dizer que o plano sumiu (ele pode ter sido renomeado): quem diz é a resposta ao Desfazer.

Tela (profiles/estudos/paineis):
- No topo do painel do professor (CabecalhoProfessor), uma segunda linha com o seletor "Plano: <título> · 2 de 5" (MenuSuspenso): os planos da matéria com o progresso ("concluído" quando for o caso), "Nenhum" e "Criar plano nesta conversa". Escolher um plano manda `seguir` e, com a resposta, a mensagem "Vamos seguir o plano "<título>"." (a aula começa sozinha). "Criar plano nesta conversa" manda "Quero montar um plano de estudos nesta conversa.". "Nenhum" só solta, sem mensagem. Ocupado (respondendo ou com pedido), o seletor fica desligado, como o das conversas.
- Na lista de notas, a tag "plano de estudos · 2 de 5" (como a "do professor").
- No topo da nota do plano, uma faixa fina com o progresso, calculado ao vivo do conteúdo do editor (lerPlano), e as conversas do histórico (o clique abre a conversa, como o link `conversa:`).
- Na conversa, o cartão "Plano criado: <título>" com Abrir e Desfazer, no rodapé da resposta (o painel "mesa", ação `plano_criado` com `gravar: true`, como o `nota_criada`).
- Tudo segue docs/padroes-de-interface.md: o seletor, a faixa e a tag não mudam de tamanho ao trocar de estado; o progresso não pisca durante uma gravação (vale o último conhecido); estado passageiro só depois de 1 s.

Junto, fora dos planos: "Copiar imagem" nos diagramas da conversa (ImagemDoPerfil, packages/ui), para colar no Samsung Notes.


## 8. Requisitos

- R1 `ehPlanoDeEstudos`, `lerPlano`, as operações e `montarPlano` puros, com o arquivo preservado byte a byte fora do que muda (CRLF incluído). [WP1]
- R2 `listarNotas` devolve `plano: {feitos, total}` nas notas com a tag; a prévia não mostra a tag. [WP1]
- R3 Gravação com versão e até 3 tentativas; item inexistente recusado com frase clara; nota sem tag recusada. [WP1]
- R4 A entrada "estudos.plano" decide o plano seguido; renomear atualiza; apagar ou tirar a tag = nenhum. [WP1]
- R5 As 4 ferramentas, só na conversa de uma matéria; `criar_plano` cria, segue e emite `plano_criado`. [WP1]
- R6 O resumo no `before_agent_start` só em execução do usuário e com plano existente; até 2000 caracteres; a conversa entra no histórico na primeira execução. [WP1]
- R7 Ponte "planos" (listar, seguir, desfazer_plano) e `mudou_fora` no painel "notas". [WP1]
- R8 profile.json com a extensão, o `tools` do professor com as 4, o AGENTS.md com a seção, os eventos na linha do tempo. [WP1 e WP2]
- R9 Seletor no CabecalhoProfessor com mensagem automática ao escolher; desligado quando ocupado. [WP2]
- R10 Tag com progresso na lista; faixa ao vivo na nota; o editor recarrega com `mudou_fora` quando limpo. [WP2]
- R11 Cartão "Plano criado" com Abrir e Desfazer. [WP2]
- R12 "Copiar imagem" nos diagramas da conversa. [WP3]
- R13 Lista "Como conferir" de docs/padroes-de-interface.md no seletor, na tag, na faixa e no cartão. [WP2]


## 9. Pacotes e paradas

- WP0 (orquestrador): este contrato e as assinaturas em lib/plano-tipos.ts (tipos e funções vazias que lançam "falta implementar"), para WP1 e WP2 trabalharem em paralelo.
- WP1 (Sonnet), dados, extensão e instruções: lib/plano-tipos.ts, lib/planos.ts (novo), lib/nota-tipos.ts, lib/notas.ts, lib/eventos.ts se precisar, extensions/planos.ts (novo), extensions/notas.ts (o aviso "notas:renomeada" e o "[plano de estudos]" no listar_notas), profile.json, agents/professor.md, AGENTS.md do perfil, paineis/src/comum.ts (uma linha nas instruções da conversa), docs/notas-formato.md, e os testes.
- WP2 (Sonnet), tela: paineis/src/planos-ponte.ts (novo), CabecalhoProfessor.tsx, SeletorPlano.tsx (novo), SecaoNotas.tsx, EditorNota.tsx (faixa e `mudou_fora`), o cartão (como NotaCriada.tsx, nota-criada.ts e ganchos-conversa.tsx), LinhaDoTempo.tsx (rótulos), index.ts (registro do painel "planos"), o CSS, e os testes (DOM com happy-dom).
- WP3 (Haiku ou Sonnet): "Copiar imagem" em packages/ui.
- Revisão por diff, pnpm typecheck e pnpm test, um commit por pacote. Depois, uma chamada real numa pasta de dados temporária (scripts/testar-plano.ts): criar o plano da prova de Ciência de Dados pela conversa, seguir, marcar um item, retomar numa conversa nova.
- Parada de teste: roteiro docs/teste-planos.md, rodado pelo Breno.

Limites conhecidos: o professor marca o item quando acha que terminou de ensinar; não há conferência de que o Breno entendeu (decisão: sem avaliação nos itens). Um plano com o mesmo título em duas matérias não se mistura (a matéria vem da conversa).
