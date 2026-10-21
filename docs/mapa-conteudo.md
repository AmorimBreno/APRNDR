# Mapa de conteúdo (item 4.4)

ESPECIFICACAO 8.2: o agente lê o material e monta a lista de conceitos, em ordem, com a referência de onde cada um aparece (arquivo e local). O Breno revisa: tira o que não cai, marca prioridades, ajusta a ordem e aprova. Os cursos (item 4.5) são montados a partir do mapa aprovado.

Tudo isto é do perfil de estudos (profiles/estudos), não do núcleo.

## O arquivo

`materias/<id>/mapa-conteudo.json`, gravado inteiro de uma vez (escrito ao lado e renomeado), em JSON com indentação de tabulação:

```json
{
	"versao": 1,
	"situacao": "rascunho",
	"aprovadoEm": "2026-10-21T14:00:00.000Z",
	"conceitos": [
		{
			"id": "c-0mgk3x1a2b3c-9f2e",
			"nome": "Regressão linear",
			"descricao": "Ajuste de uma reta aos dados pelos mínimos quadrados.",
			"referencias": [{ "arquivo": "aula-04.pdf", "local": "página 12", "trecho": "pagina-012" }],
			"prioridade": "normal",
			"origem": "material",
			"criadoEm": "2026-10-21T13:00:00.000Z",
			"fora": true,
			"novo": true
		}
	],
	"arquivos": {
		"aula-04.pdf": { "hash": "…", "mapeadoEm": "…", "modelo": "openrouter/anthropic/claude-sonnet-5.5", "custo": 0.012, "conceitos": 9 }
	}
}
```

- `situacao`: `rascunho` (nunca aprovado), `aprovado` ou `alterado` (já foi aprovado e mudou depois, por uma operação ou por um mapeamento). `aprovadoEm` existe desde a primeira aprovação.
- `conceitos`: a ordem do array é a ordem do mapa, inclusive dos que estão fora.
  - `id`: `c-` + 12 dígitos base 36 de milissegundos + `-` + 4 hex aleatórios.
  - `referencias`: `arquivo` é o caminho dentro de `materiais/`, com barras normais (o mesmo do manifesto do `.extraido`); `local` é o `local` do trecho no manifesto; `trecho` é o `nome` do trecho.
  - `prioridade`: `alta`, `normal` ou `baixa`.
  - `origem`: `material` (veio de um mapeamento) ou `usuario` (escrito à mão).
  - `fora`: o Breno tirou do mapa. Só aparece quando é verdadeiro.
  - `novo`: entrou por um mapeamento depois da primeira aprovação. Só aparece quando é verdadeiro e é limpo em toda aprovação.
- "Sem fonte" não é gravado: é um conceito de origem `material` sem nenhuma referência.
- `arquivos`: os arquivos já mapeados, com o hash do manifesto do `.extraido` no momento do mapeamento.

Um arquivo pendente é um arquivo com manifesto em `materias/<id>/.extraido/<arquivo>/manifesto.json` cujo hash não está em `arquivos` (ou é diferente). Sem `mapa-conteudo.json`, o mapa é vazio (situação `rascunho`).

## Regras de fusão (mapear um arquivo)

O modelo recebe o mapa atual (id, nome, descrição e se está fora) e os trechos do arquivo (local e texto). Ele devolve os conceitos do arquivo, na ordem em que aparecem:

```json
{ "conceitos": [ { "id": "c-… ou null", "nome": "…", "descricao": "…", "locais": ["página 3", "página 4"] } ] }
```

O código, não o modelo, aplica o resultado:

1. Antes de mapear um arquivo que já estava no mapa (ele mudou, ou o mapa está sendo refeito), as referências desse arquivo saem de todos os conceitos.
2. `locais` só valem se forem exatamente o `local` de um trecho do arquivo; os outros são descartados. Um conceito sem nenhum local válido é descartado (nada de referência inventada).
3. `id` de um conceito que existe no mapa: o conceito ganha as referências novas (sem repetir). O nome, a descrição, a prioridade, a posição e o `fora` dele não mudam: o que o Breno decidiu nunca é desfeito. Um id que não existe é tratado como `null`.
4. `id` null: conceito novo, de origem `material`, prioridade `normal`, `novo` se o mapa já tem `aprovadoEm`. Ele entra logo depois do item anterior da resposta; se for o primeiro da resposta, logo antes do próximo item da resposta que já existe no mapa; se não houver nenhum, no fim.
5. Dois itens da resposta com o mesmo nome (sem diferença de maiúsculas e acentos) viram um só.
6. `arquivos[arquivo]` é gravado com o hash, a data, o modelo, o custo e quantos conceitos o arquivo tocou. Se o mapa estava `aprovado`, passa a `alterado`.

Um arquivo grande vai em partes (até uns 120 mil caracteres de trechos por parte, sem cortar um trecho), uma chamada por parte, cada uma vendo o mapa já fundido com as partes anteriores.

Um material que sai (`materiais:removido`): as referências dele saem, `arquivos[arquivo]` sai, e um conceito que ficou sem fonte continua no mapa (a tela mostra o aviso). Se o mapa estava `aprovado`, passa a `alterado`.

"Refazer o mapa" mapeia de novo todos os arquivos, um por vez, pelas mesmas regras (o modelo vê o mapa atual, então os conceitos existentes são reencontrados pelo id e as decisões continuam).

## Operações da revisão

A tela manda operações; a extensão as aplica em fila, com as mesmas funções puras que a tela usa para mostrar a mudança na hora (profiles/estudos/lib/mapa-tipos.ts, sem nada do Node):

| tipo | campos | efeito |
|---|---|---|
| `tirar` | `id` | `fora: true` |
| `trazer` | `id` | tira o `fora` |
| `prioridade` | `id`, `valor` | troca a prioridade |
| `mover` | `id`, `depoisDe` (id ou null = primeiro) | muda a posição |
| `editar` | `id`, `nome?`, `descricao?` | troca o nome ou a descrição (nome vazio não vale) |
| `adicionar` | `id`, `nome`, `descricao?`, `depoisDe` (id, null = primeiro; ausente = no fim) | conceito de origem `usuario`; o id é gerado pela tela |
| `apagar` | `id` | só um conceito de origem `usuario` |

Uma operação sobre um id que não existe é ignorada (e contada). Qualquer operação que mude algo num mapa `aprovado` o passa para `alterado`.

`aprovar`: `situacao: "aprovado"`, `aprovadoEm` agora, todos os `novo` saem. Mapa sem nenhum conceito dentro não pode ser aprovado.

## Eventos (no eventos.jsonl da matéria)

- `mapeou_material`: objeto `{materia, arquivo}`; resultado `{novos, reforcados, descartados, partes, custo}`; contexto `{modelo}`.
- `atualizou_mapa`: objeto `{materia, arquivo}`; resultado `{motivo: "material_removido", semFonte}` (quantos conceitos ficaram sem fonte).
- `revisou_mapa`: um por abertura da seção em que o mapa mudou. A tela gera um id `edicao` quando abre a seção e o manda em cada lote de operações; só o primeiro lote de cada `edicao` grava o evento. Objeto `{materia}`; resultado `{edicao, tipo}` (o tipo da primeira operação).
- `aprovou_mapa`: objeto `{materia}`; resultado `{conceitos, fora}`.

## Ponte (painel "mapa", docs/ponte-de-eventos.md)

Tela → extensão (`interface:acao`, painel `mapa`):

- `abrir {materia}`
- `mapear {materia, arquivos?}`: sem `arquivos`, todos os pendentes
- `refazer {materia}`
- `cancelar {materia}`: para o mapeamento em andamento e esvazia a fila da matéria (o que já foi fundido fica)
- `operar {materia, edicao, pedido, operacoes}`
- `aprovar {materia, pedido}`

Extensão → tela (`interface:mostrar`, sempre `gravar: false`):

- `mapa {materia, mapa, pendentes, andamento, fila, pedido?}`: o estado inteiro, mandado depois de `abrir` e de qualquer mudança (operação, aprovação, cada parte de um mapeamento, material removido).
  - `pendentes`: `[{arquivo, tipo, caracteres, partes, custoEstimado}]`; `custoEstimado` em US$, pelo preço do modelo, ou null se o preço não for conhecido.
  - `andamento`: `{arquivo, parte, partes}` ou null.
  - `fila`: os arquivos esperando, na ordem.
  - `pedido`: o da tela, quando a mudança respondeu a `operar` ou `aprovar`.
- `erro {mensagem, ao?, materia?, arquivo?, pedido?}`

## O modelo e o prompt

`profiles/estudos/prompts/mapeador.md`: frontmatter com `model` (provedor/id; hoje `openrouter/anthropic/claude-sonnet-5.5`, escolha do Breno em 2026-10-21) e o prompt no corpo. A extensão chama o modelo pelo `ctx.modelRegistry` do pi, sem passar pela conversa, com temperatura 0.

## Quando roda

- Sozinho, quando o serviço de materiais avisa `materiais:pronto` de um arquivo de `materias/<id>/materiais` (novo ou mudado), numa fila por matéria.
- Pelo botão "Mapear" da tela, para os pendentes (materiais que já existiam antes do mapa ou cujo mapeamento falhou).
- "Refazer o mapa", com confirmação e o custo estimado.

O professor lê o mapa pela ferramenta `ler_mapa_conteudo` (só leitura; numa conversa de caderno, presa à matéria da conversa).
