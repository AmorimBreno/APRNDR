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
  - corpo: o termo grande (a forma do glossário), a definição embaixo;
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
- `erro` com `ao` (`marcar_termos`, `explicar_trecho`, `guardar_termo`) e o `bloco` ou o pedido, quando houver.

Um termo pode ser explicado num módulo diferente do que está aberto: a mensagem `modulo` leva, para os termos com `explicado` em outro módulo, o número e o título desse módulo e da lição (para o cabeçalho do cartão) e a rota da tela.
