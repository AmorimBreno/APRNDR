# Termos-chave e pedidos de explicação (2026-10-29)

Pedido do Breno: na lição 2 do módulo 1, "Stemming é a transformação de palavras em radicais…" usa "radicais" sem que nada no curso tenha explicado o que é um radical. Ele quer:
1. os termos-chave destacados no texto, com a definição curta ao passar o mouse e, ao clicar, ir para onde foram explicados;
2. selecionar um trecho que não entendeu e pedir "Não sei o que é isso" ou "Explique melhor".

Decisões dele (2026-10-29): fazer antes da parte 4 do plano de 2026-10-28 (os pedidos de explicação viram evidência para o relatório dela); as duas coisas agora; um botão para marcar os termos nos módulos já gerados; GPT-6.1 Sol; clicar no termo leva até onde ele foi explicado (sem link no cartão).

Tudo é do perfil de estudos. O núcleo só ganha um mecanismo genérico de link com esquema próprio no Markdown (abaixo).

## O glossário do curso

`materias/<matéria>/cursos/<curso>/glossario.json`, na pasta de dados, gravado inteiro de uma vez (lib/arquivos.ts), na trava da matéria. Sem arquivo, o glossário está vazio.

```json
{
	"versao": 1,
	"termos": [
		{
			"id": "t-radical",
			"termo": "radical",
			"definicao": "A parte da palavra que sobra depois de tirar as terminações; \"estud\" é o radical de \"estudar\" e \"estudante\".",
			"conceito": "c-…",
			"explicado": { "modulo": "m1", "licao": "l1", "bloco": "l1-b3" },
			"origem": "geracao",
			"criadoEm": "…",
			"alteradoEm": "…"
		}
	]
}
```

- `id`: `t-` mais o termo sem acento, em minúsculas, com hífens (`t-fitacao-de-polinomio`). Um id repetido ganha `-2`, `-3`.
- `termo`: a forma de dicionário (singular, sem artigo), de 1 a 80 caracteres. `definicao`: de 1 a 2 frases, até 300 caracteres, em markdown simples (sem bloco de código).
- `conceito`: o id do conceito do mapa da matéria, quando o termo é um deles (opcional).
- `explicado`: o bloco onde o termo é explicado no curso; `null` quando nada no curso o explica ("Não explicado no curso"). Com `explicacao` (o id de um pedido de explicação, abaixo) quando foi guardado a partir de um pedido.
- `origem`: `geracao` (veio com uma lição gerada), `anotacao` ("Marcar os termos" num módulo antigo) ou `pedido` ("Guardar no glossário" num pedido de explicação).
- Gerar um módulo de novo não apaga termos. Um `explicado` que aponta para um bloco que não existe mais é tratado como `null` na tela; a próxima geração que explicar o termo atualiza o `explicado`.

## A marca no texto

Um termo é marcado no markdown dos blocos com um link de esquema próprio: `[radicais](termo:t-radical)`. O texto do link é a forma que aparece na frase (plural, conjugação); o id leva ao glossário. Vale em todo texto de bloco: explicações, ideia central, pergunta, contexto, enunciado, alternativas e explicação das questões. Não vale dentro de código nem de fórmula.

O núcleo (packages/ui, Markdown) ganha um mecanismo genérico: `ligacoes?: Record<string, (alvo: string, filhos: ReactNode) => ReactNode>`, pelo esquema do link (`termo` → o perfil desenha). Um esquema sem função continua como texto (o link não abre fora). O mecanismo não sabe o que é um termo; serviria a um perfil de programação (`api:`, por exemplo). docs/markdown-da-conversa.md ganha uma linha sobre isso.

Uma marca para um id que não existe no glossário aparece como texto comum.

## Na geração das lições

Metodologia nova `profiles/estudos/metodo/termos.md` (carregada em toda lição e na reescrita de um bloco): o que é um termo-chave (vocabulário técnico que o Breno precisa para acompanhar, não toda palavra), marcar a primeira ocorrência do termo em cada bloco (não todas), explicar todo termo novo antes de usá-lo — na introdução ou no conceito, com uma frase que diga o que é — e reusar os termos do glossário (marcados com o id dele, sem explicar de novo; uma retomada curta vale quando o termo é de muitos módulos atrás).

A mensagem da lição leva o glossário do curso (id, termo, definição; até uns 8 mil caracteres, os termos dos conceitos da lição primeiro). O JSON da lição ganha `termos`: os termos novos daquela lição, `[{"chave": "novo-1", "termo": "…", "definicao": "…", "conceito": "c-…" | null, "explicadoEm": <índice do bloco>}]`, e os textos marcam `[…](termo:novo-1)` para os novos e `[…](termo:t-…)` para os do glossário.

O código confere (validarLicao, com a nova tentativa da lição que já existe):
- toda marca aponta para um termo do glossário ou para um termo novo da lição; as outras viram texto (conserto, sem nova tentativa);
- um termo novo é explicado (`explicadoEm`) num bloco de explicação (introdução, conceito ou exemplo) que vem antes ou é o mesmo da primeira marca dele; senão, problema da lição ("o termo X é usado no bloco 3 antes de ser explicado no bloco 5") e nova tentativa;
- definição e termo dentro dos limites; um termo novo igual (sem acento e caixa) a um do glossário vira o do glossário.

Ao gravar o módulo: os termos novos recebem o id, as marcas `novo-n` são trocadas pelo id, e o glossário ganha os termos (`origem: "geracao"`, `explicado` com o bloco). A reescrita de um bloco recebe o glossário e mantém as marcas (mesmas regras).

## Marcar os termos num módulo já gerado

Ação `marcar_termos {materia, curso, modulo, pedido}`: uma chamada por lição (prompt `prompts/modulo-termos.md`, GPT-6.1 Sol, temperatura 0, com a metodologia termos.md), fora da trava, com a nova tentativa de JSON inválido e cancelamento no fim da sessão. A mensagem leva os blocos da lição (ids e textos) e o glossário. Devolve `{"termos": [{"bloco": "l2-b1", "trecho": "radicais", "id": "t-…" | null, "termo": "…", "definicao": "…", "explicadoEm": "l1-b3" | null}]}` (`id` de um termo existente, ou termo novo com definição; `explicadoEm` o bloco que de fato explica o termo no módulo, ou null).

O código põe a marca na primeira ocorrência exata do `trecho` no texto do bloco, fora de código (crases e blocos), fórmulas ($) e links que já existem; um trecho que não aparece é descartado. Nenhuma outra mudança no texto. O módulo é gravado (sem mudar a `versao` dos blocos) e o glossário ganha os termos novos (`origem: "anotacao"`). Termos sem `explicadoEm` entram com `explicado: null`. Evento `marcou_termos` no `eventos.jsonl` da matéria: objeto `{materia, curso, modulo}`; resultado `{termosNovos, marcas, custo}`. O estado mostra `marcando: {licao, licoes}` enquanto isso. Rodar de novo só acrescenta (o que já está marcado fica).

Na tela: no índice da visão do módulo, "Marcar os termos" (com o custo aproximado), só num módulo sem nenhuma marca; durante, "Marcando os termos da lição 1 de 2…".

## O termo na tela

- A marca aparece em **negrito**, sublinhada, na cor âmbar do design system (a do post-it do quiz, legível no fundo escuro).
- Passar o mouse (ou focar pelo teclado) abre um cartão acima do termo, misturando as referências do Breno (o tooltip escuro com cabeçalho e o cartão "Polyglot"):
  - cabeçalho: um ícone e "Conceito-chave", com o lugar à direita: "Módulo 01 · Lição 1" ou "Não explicado no curso";
  - corpo: preenchido de âmbar (como o cartão "Polyglot" da referência), com o termo grande em tinta escura (a forma do glossário) e a definição embaixo;
  - uma setinha apontando para o termo.
- Clicar no termo leva ao bloco onde ele foi explicado: abre o módulo e a lição (se for outra) e rola até o bloco, com um destaque rápido nele. Termo sem `explicado`: o clique fixa o cartão aberto (não navega). No próprio bloco que o explica, o clique não faz nada.
- O cartão cabe na tela (vira para baixo quando não há espaço em cima) e funciona em 375 px.

## Selecionar um trecho e pedir explicação

Ao selecionar um trecho (de 1 a 300 caracteres) dentro do texto de um bloco, aparece uma barrinha flutuante junto da seleção com **Não sei o que é isso** e **Explique melhor**. Seleção fora de um bloco, ou que cruza blocos, não mostra nada.

Ação `explicar_trecho {materia, curso, modulo, licao, bloco, pedido, trecho, tipo: "nao_sei" | "explique_melhor"}`: uma chamada (prompt `prompts/explicar-trecho.md`, GPT-6.1 Sol, com a metodologia conceito.md e termos.md), fora da trava. A mensagem leva a lição (título, objetivo), os blocos de explicação até o bloco do trecho (até uns 8 mil caracteres, os mais próximos primeiro), o bloco do trecho inteiro, o trecho, o tipo, os níveis dos conceitos, o glossário e as regras de escrita do Breno. Devolve `{"explicacao": "<markdown, até uns 1500 caracteres>", "termo": {"termo": "…", "definicao": "…"} | null}`:
- `nao_sei`: o que é aquilo, do zero, no nível dele, com um exemplo curto; `termo` quando o trecho é um termo técnico (para poder ir ao glossário);
- `explique_melhor`: outro jeito de explicar a mesma ideia (não repetir o texto do bloco), com um exemplo; `termo` null.

Guardado no `<módulo>.json`, em `explicacoes` (lista, na ordem): `{id, licao, bloco, versao, trecho, tipo, explicacao, termo, em, evento, modelo, custo}`. Gerar o módulo de novo começa sem nenhuma. Evento `pediu_explicacao` no `aprendiz/eventos.jsonl`: objeto `{materia, curso, modulo, licao, bloco, conceitos}`; resultado `{trecho, tipo, explicacao}`; contexto `{fase: "modulo", versao (do bloco), modelo (o do módulo), prompt (o da lição), explicador: {modelo, prompt, custo}}`.

Na tela, embaixo do bloco, um balão por pedido: "Você perguntou: “radicais”" (com o tipo), "Explicando…" enquanto isso, depois a explicação; um erro com "Tentar de novo". Com `termo`, o botão "Guardar no glossário".
Pedidos de antes ficam recolhidos ("2 explicações pedidas"), abrindo um por um.

`guardar_termo {materia, curso, modulo, pedido, explicacao}` (o id do pedido) faz três coisas:
- põe o termo no glossário, com `origem: "pedido"` e `explicado: {modulo, licao, bloco, explicacao}`; se o termo já existe no glossário, só liga a ele;
- marca o trecho no texto do bloco, com as mesmas regras de "Marcar os termos";
- grava o evento `guardou_termo` no aprendiz.
O balão passa a dizer "Guardado no glossário". Clicar no termo de um pedido leva ao balão daquele pedido.

## Ponte (painel "modulos")

- `marcar_termos`, `explicar_trecho`, `guardar_termo`, com pedido, como as outras.
- A mensagem `modulo` leva também o glossário do curso (`glossario`), para a tela desenhar os cartões, e `explicando: [ids]` (os pedidos em andamento, como `corrigindo`).
- O `estado` leva `marcando` por módulo.
- `erro` com `ao` (`marcar_termos`, `explicar_trecho`, `guardar_termo`) e o `bloco` ou o pedido, quando houver; no `explicar_trecho` que falha depois de aceito e no `guardar_termo`, também o id do pedido de explicação (`explicacao`).

Um termo pode ser explicado num módulo diferente do que está aberto: a mensagem `modulo` leva, para os termos com `explicado` em outro módulo, o número e o título desse módulo e da lição (para o cabeçalho do cartão); a tela monta a rota com o módulo, a lição e o bloco (ver "A mensagem `modulo`", abaixo).

## O que a implementação decidiu (2026-10-29)

Os buracos do contrato, decididos pelo mais simples na parte de dados, geração, prompts e extensão. Os tipos e as funções puras que a tela usa ficam em `profiles/estudos/lib/termos-tipos.ts`; o disco, em `lib/termos.ts`; os tipos da ponte, em `lib/modulo-tipos.ts`.

### A marca

- A marca só entra numa palavra inteira: "radical" não marca dentro de "radicais" (o trecho certo é "radicais"). Também não entra logo depois de `!` (viraria imagem) nem de `\`. A ocorrência é exata, com a mesma caixa.
- Fora de código, fórmula e link também quer dizer fora de endereços (`https://…`, `www.…`, `<…>`) e de embeds (`![[…]]`). Os blocos cercados valem com qualquer recuo (dentro de listas). Na dúvida, a região protegida é maior: uma marca a menos nunca estraga o texto.
- Uma por termo em cada bloco é conferido pelo código: a segunda marca do mesmo termo no bloco vira texto (conserto). As marcas fora dos textos onde a marca vale (resposta esperada, confusões, rubrica, resposta-modelo) também viram texto.
- `[x](termo: t-x)` (com espaço) ou `Termo:` são lidas como marca e reescritas do jeito certo.

### Na geração

- `explicadoEm` é a posição do bloco na lista `blocos` do modelo, a partir de 1 (como o roteiro); um bloco descartado conta na posição. As frases dos problemas usam essas posições.
- Na primeira tentativa, um termo que não vale (chave, termo, definição, explicadoEm) e a marca antes da explicação são problemas da lição (nova tentativa, com as frases). Na segunda, não derrubam a lição: o termo que não vale sai (as marcas dele viram texto) e as marcas antes da explicação viram texto.
- O tamanho mínimo das explicações é conferido depois de as marcas desconhecidas virarem texto.
- A mensagem de cada lição leva o glossário da geração: o do disco mais os termos novos das lições já escritas (com os ids já dados), para as seguintes os reusarem. No fim, os termos são juntados ao glossário do disco (que pode ter mudado no meio): um igual (sem acento e caixa) vira o do disco, um id ocupado ganha outro, e as marcas seguem as trocas. O glossário é gravado depois do módulo.
- Um termo do glossário explicado de novo (um termo novo igual a ele) troca o `explicado` só quando o atual é null, aponta para um bloco que não existe mais ou aponta para o módulo que está sendo gerado de novo. Vale a primeira lição que o explica.
- Um glossário ilegível impede a geração, a reescrita, "Marcar os termos" e a explicação (nada é gravado por cima); a mensagem `modulo` vai com o glossário vazio.
- A reescrita de um bloco não cria termo novo: só ids do glossário; as outras marcas viram texto.

### Marcar os termos

- O `explicadoEm` vale se for um bloco de explicação do módulo; senão, null. Só entram no glossário os termos novos que ganharam pelo menos uma marca. Um termo do glossário com `explicadoEm` troca o `explicado` pela mesma regra da geração (sem a do módulo gerado de novo).
- Uma marcação por módulo; um módulo sendo gerado não é marcado. O estado com o pedido diz que foi aceita (com `marcando`); no fim vão o `modulo` e o `estado` sem pedido. Um erro antes de aceitar vem com o pedido; depois, sem pedido, com o gasto, e o `estado` sem `marcando`.
- Se o módulo foi gerado de novo durante a marcação, nada é gravado (erro). Um bloco reescrito no meio não recebe marca.
- O evento `marcou_termos` é gravado mesmo sem nenhuma marca (o modelo foi chamado).
- Custo aproximado, pelo tamanho das mensagens: por lição, uns 15 a 25 mil caracteres de entrada (o prompt com a metodologia, uns 5 mil; a lição, de 10 a 15 mil; o glossário, até 8 mil) e uns 2 a 5 mil de saída, perto da reescrita de um bloco (US$ 0,017): por volta de US$ 0,01 a 0,02 por lição. Depois dos testes reais abaixo, a tela usa a faixa de US$ 0,01 a 0,03 por lição, avisando que varia com o tamanho (a estimativa anterior ficou abaixo do gasto observado).

### Os pedidos de explicação

- O pedido entra no `<módulo>.json` quando o Breno pede, sem `explicacao` (é o que a tela mostra como "Explicando…", com o id em `explicando`), e a resposta do `explicar_trecho` é o `modulo` com o pedido. A explicação chega num `modulo` sem pedido.
- Se a explicação falha, o pedido sai do módulo, e o `erro` vem sem pedido, com `ao: "explicar_trecho"`, o `bloco` e o id do pedido em `explicacao`; "Tentar de novo" manda outro `explicar_trecho`. Um pedido sem explicação que não está em `explicando` (a sessão acabou no meio) falhou (`situacaoDaExplicacao`) e sai no próximo pedido do módulo.
- O trecho tem os espaços juntados e não é procurado no markdown do bloco (a seleção é do texto desenhado, que pode ter fórmula ou formatação). O "Guardar no glossário" põe a marca só se o trecho aparecer no texto do bloco; senão, guarda sem marca.
- A explicação tem até 2500 caracteres (o prompt pede uns 1500) e as marcas dela viram texto. No `explique_melhor`, o termo é sempre null; um termo fora dos limites é problema na primeira tentativa e vira null na segunda.
- O contexto do `pediu_explicacao` leva o modelo e o prompt de onde o bloco veio (o da lição, ou o da reescrita que deu aquela versão), como os eventos das respostas.
- O pedido guardado ganha `guardado` (o id do termo): é por ele que a tela diz "Guardado no glossário". O `guardou_termo` (no aprendiz) tem objeto `{materia, curso, modulo, licao, bloco, explicacao}` e resultado `{id, termo, definicao, novo, marcado}`.

### A mensagem `modulo`

- `glossario` traz todos os termos do curso (`TermoNaTela`): o termo gravado e o `lugar` que vale, com o número e o título do módulo (pela ordem e pelo nome do esqueleto) e da lição, para todo termo explicado (no módulo aberto ou em outro); `lugar: null` é "Não explicado no curso" (sem `explicado`, ou com um que aponta para um bloco ou pedido que não existe mais). A rota da tela não vai na mensagem: a tela a monta com `modulo`, `licao` e `bloco` do lugar (`caminhoDoModulo` de `paineis/src/modulo-tela.ts`).
- `explicando` vem em toda mensagem `modulo` (vazio sem nenhum), como `corrigindo`.

## Tela implementada e verificação (2026-10-29)

- `paineis/src/TermosModulo.tsx` contém o provedor do perfil, o termo com cartão, a seleção, os balões e a confirmação de Marcar os termos. As regras puras ficam em `termos-tela.ts`. O registro de ligações é estável: uma mensagem da ponte não remonta o termo focado nem fecha o cartão aberto.
- Os flutuantes vão para o `body`, fora da rolagem, com as coordenadas divididas pelo zoom da interface. O cartão vira para baixo se não couber acima; há foco, Esc e fechamento por clique fora. O destino de uma navegação fica só na memória da aba até o módulo carregar; o bloco recebe foco e destaque, e um pedido de explicação é aberto inclusive dentro do grupo recolhido.
- Só o texto didático participa da seleção. Cruzar blocos, selecionar campos ou respostas do aluno não abre a barra. Termos também funcionam nos enunciados, contextos, alternativas e explicações de questões. `QuizQuestion.interactiveLabels` mantém o radio separado do conteúdo para não aninhar os botões dos termos nas alternativas; as teclas do termo não respondem ao quiz e selecionar texto não escolhe uma alternativa.
- `modulos-ponte.ts` lê `glossario` e `explicando`, manda as três ações com pedido e separa os erros por explicação ou marcação. Preserva em memória o pedido que falhou antes de o servidor removê-lo, para oferecer Tentar de novo. Uma nova geração descarta essa memória antiga.
- `scripts/testar-termos.ts` copia apenas a matéria, o mapa, o curso, o m1 e, se existirem, o glossário e as regras de escrita para uma pasta temporária. Carrega a mesma extensão do app, sem reimplementar as ações; mostra os descartes da validação e aplicação, os termos, as marcas, a explicação e os custos. Confere texto, versões, respostas e os bytes dos arquivos da origem. O shutdown e a remoção da pasta temporária ficam no finally.
- Duas rodadas reais com GPT-6.1 Sol: a primeira custou US$ 0,07206 (marcação US$ 0,02868 + US$ 0,02998; explicação US$ 0,01340). A segunda, com o diagnóstico dos descartes no script, custou US$ 0,06917 (marcação US$ 0,02751 + US$ 0,02807; explicação cerca de US$ 0,01359). Nessas duas, 9 termos, incluindo radical, token, stop word, stemming e n-grams; na segunda, nenhum descarte e nenhuma marca inaplicável. Nenhum arquivo da origem foi alterado.
- As primeiras rodadas marcaram radicais em l2-b1, mas ligaram radical ao próprio bloco: há exemplos de formas reduzidas, não uma definição explícita do termo. O passo 5 de `prompts/modulo-termos.md` foi reforçado: uma definição inferível dos exemplos ou da operação de outro conceito não basta; null é preferível a uma referência enganosa. A terceira rodada confirmou radical e stemmer com `explicado: null`, mantendo os lugares válidos dos demais termos. Foram 10 termos, nenhum descarte e nenhuma marca inaplicável; custo US$ 0,05724 (marcação US$ 0,02447 + US$ 0,02538; explicação US$ 0,00739). A explicação pedida definiu radical com um exemplo. Total das três rodadas US$ 0,19847, sem alterar arquivos da origem. A validação automática confere o lugar e o tipo; a qualidade semântica ainda deve ser revisada pelo Breno, não é garantida pelo JSON.
- Conferência no Edge com uma tela temporária de dados sintéticos e ações simuladas, sem abrir uma sessão do pi: cartão, Esc, foco no destino, outra lição e outro módulo, seleção e rejeição entre blocos, balões com carregamento e resposta, guardar, confirmação e progresso de marcar; tela larga e 375 px; preferência de menos movimento emulada. Sem erro de JavaScript ou botões aninhados (a página temporária só teve o 404 do favicon). Os arquivos da tela temporária foram removidos.
- Roteiro para conferir o caminho completo no app, inclusive F5, em `docs/teste-termos.md`. Aprovação visual do Breno ainda pendente; a parte 4 (relatório e propostas de método) não foi iniciada nesta tarefa.
