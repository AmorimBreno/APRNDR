# Agenda (calendário, tarefas e quadro)

A agenda junta três vistas de uma coisa só: as tarefas do Breno. O calendário mostra as tarefas que têm data e as provas das matérias; o quadro (kanban) mostra todas as tarefas em colunas; a coluna de uma tarefa é a situação dela. Decisões do Breno:

- A agenda é uma só, global (não por matéria). Cada tarefa pode ter uma matéria, opcional. No caderno de uma matéria, a tela filtra pela matéria; a tela cheia mostra todas.
- As colunas do quadro são do Breno: criar, renomear, reordenar, apagar. Uma delas é marcada como a de "feito".
- No calendário entram, além das tarefas com data, as provas das matérias. As provas não são copiadas: saem do `materia.json` de cada matéria a cada vez.
- O professor só lê a agenda (`ler_agenda`). Ele não cria nem muda tarefas.

Tudo isto é do perfil de estudos (profiles/estudos), não do núcleo. Código: `profiles/estudos/lib/agenda-tipos.ts` (tipos e regras puras, sem Node: a tela importa daqui), `profiles/estudos/lib/agenda.ts` (disco e eventos) e `profiles/estudos/extensions/agenda.ts` (a ponte e o `ler_agenda`).

## O arquivo

`<dados>/agenda/agenda.json`, gravado inteiro de uma vez (escrito ao lado e renomeado), em JSON com indentação de tabulação:

```json
{
	"versao": 1,
	"colunas": [
		{ "id": "a-fazer", "nome": "A fazer", "feito": false },
		{ "id": "fazendo", "nome": "Fazendo", "feito": false },
		{ "id": "feito", "nome": "Feito", "feito": true }
	],
	"tarefas": [
		{
			"id": "t-0mgk3x1a2b3c-9f2e",
			"titulo": "Resolver a lista 3",
			"nota": "Exercícios 4 a 9.",
			"coluna": "a-fazer",
			"ordem": 0,
			"data": "2026-11-10",
			"hora": "14:00",
			"materia": "calculo-i",
			"criadaEm": "2026-11-03T12:00:00.000Z",
			"alteradaEm": "2026-11-03T12:00:00.000Z"
		}
	]
}
```

- `colunas`: a ordem do array é a ordem do quadro. Ao menos uma, e exatamente uma com `feito: true`. `id`: as três padrão têm `a-fazer`, `fazendo` e `feito`; as criadas depois têm `col-` + 12 dígitos base 36 de milissegundos + `-` + 4 hex aleatórios. `nome`: até 40 caracteres, único (sem diferença de maiúsculas e acentos).
- `tarefas`: o array fica na ordem do quadro (coluna e depois `ordem`).
  - `id`: `t-` + 12 dígitos base 36 de milissegundos + `-` + 4 hex aleatórios.
  - `titulo`: obrigatório, aparado, em uma linha, até 200 caracteres.
  - `nota`: texto livre, até 5000 caracteres. Só existe se não for vazia.
  - `coluna`: o id de uma coluna que existe.
  - `ordem`: a posição dentro da coluna (0, 1, 2…), renumerada a cada mudança.
  - `data`: `AAAA-MM-DD`, um dia que existe. `hora`: `HH:MM`, de 00:00 a 23:59, e só existe junto de uma `data`.
  - `materia`: o id de uma matéria. Conferido quando é informado ou trocado; uma matéria que sumiu depois não impede editar a tarefa.
  - `criadaEm`, `alteradaEm`: ISO 8601.
  - `concluidaEm`: ISO 8601. Preenchida quando a tarefa entra na coluna de feito (ou nasce nela) e apagada quando sai. Uma tarefa está aberta quando a coluna dela não é a de feito.
- Sem o arquivo, a agenda começa com as colunas padrão A fazer, Fazendo e Feito (esta com `feito: true`) e nenhuma tarefa. O arquivo só é gravado na primeira escrita: abrir ou ler não cria nada.
- Um `agenda.json` que não abre ou não vale (JSON quebrado, versão desconhecida, sem coluna de feito, tarefa numa coluna que não existe, data fora do formato…) é um erro claro, com o caminho e o motivo, e o arquivo nunca é sobrescrito: nem a tela nem o `ler_agenda` funcionam até o Breno corrigi-lo.

## Regras das operações

As operações são funções puras de `agenda-tipos.ts` (recebem a agenda, devolvem a nova ou erram); a tela usa as mesmas para mostrar a mudança na hora, e a extensão as aplica antes de gravar. Uma operação que não muda nada devolve a mesma agenda e não grava nada.

- **Criar tarefa**: título; opcionais nota, coluna (padrão: a primeira do quadro), data, hora, matéria. Entra no fim da coluna. Na coluna de feito, já nasce concluída.
- **Editar tarefa**: título, nota, data, hora, matéria. Só os campos enviados mudam. Para limpar nota, data, hora ou matéria: `null` (ou texto vazio); o título não pode ficar vazio. Tirar a data sem dizer a hora tira a hora junto; pedir uma hora sem data é erro.
- **Mover tarefa**: coluna de destino e posição (0 = primeira; sem posição ou maior que o tamanho, no fim; a posição conta sem a própria tarefa). Renumera as ordens das colunas mexidas. Entrar na coluna de feito preenche `concluidaEm`; sair apaga.
- **Apagar tarefa**.
- **Criar coluna**: nome (e posição opcional; padrão: no fim). Nunca nasce como a de feito.
- **Renomear coluna**.
- **Reordenar colunas**: a lista de ids precisa ter todas as colunas, uma vez cada.
- **Marcar feito**: a coluna passa a ser a de feito e a marca da outra sai. As tarefas da nova coluna de feito ganham `concluidaEm`; as da antiga perdem.
- **Apagar coluna**: nunca a última e nunca a de feito (marque outra antes). Vazia, apaga. Com tarefas, precisa de um `destino` (outra coluna): as tarefas vão para o fim dele, na mesma ordem (no destino de feito, ficam concluídas).

## Itens do calendário

`itensDoCalendario(agenda, materias, { de, ate, materia? })` (agenda-tipos.ts, pura) junta, no intervalo `de`–`ate` (as duas pontas incluídas, `AAAA-MM-DD`), as tarefas que têm data e as provas das matérias. Com `materia`, só as dela. Cada item:

```json
{ "tipo": "tarefa" | "prova", "data": "2026-11-20", "hora": "14:00", "titulo": "…", "materia": "calculo-i", "feita": false, "id": "…" }
```

- `hora`: só nas tarefas com hora. `materia`: o id; opcional na tarefa, sempre presente na prova. `feita`: só nas tarefas (está na coluna de feito).
- `titulo`: o título da tarefa ou o nome da prova (P1…). O nome da matéria vem de `materias`.
- `id`: o da tarefa ou, na prova, `prova:<matéria>:<data>:<nome>`.
- Ordem: por dia; no dia, os sem hora primeiro e depois por hora; a prova antes da tarefa.
- `itensComProvas(agenda, provas, filtro)` faz o mesmo com as provas já prontas (o formato `provas` da mensagem `agenda`, abaixo); é o que a tela usa, porque ela recebe as provas na mensagem.
- Também em agenda-tipos.ts: `tarefasAtrasadas(agenda, hoje, materia?)` (abertas com data antes de hoje) e `tarefasSemData(agenda, materia?)` (abertas sem data).

## Eventos

Só de acréscimo, pela `acrescentarEvento` (profiles/estudos/lib/eventos.ts). O `objeto` de um evento de tarefa é `{materia?, tarefa, titulo}` (o id e o título da tarefa; `materia` só quando a tarefa tem).

| verbo | quando | resultado |
|---|---|---|
| `criou_tarefa` | criar tarefa | `{coluna, colunaNome, data?, hora?}` |
| `editou_tarefa` | editar com alguma mudança | `{mudou: {campo: valorNovo}, antes: {campo: valorAntigo}}`; só os campos que mudaram; `null` = sem valor |
| `moveu_tarefa` | mudar de coluna (sem ser de ou para feito) | `{de, deNome, para, paraNome}` (ids e nomes das colunas) |
| `concluiu_tarefa` | entrar na coluna de feito, no lugar do `moveu_tarefa` | `{de, deNome, para, paraNome}` |
| `reabriu_tarefa` | sair da coluna de feito, no lugar do `moveu_tarefa` | `{de, deNome, para, paraNome}` |
| `apagou_tarefa` | apagar tarefa | `{coluna, colunaNome, concluida, data?, hora?}` |
| `alterou_quadro` | qualquer mudança de coluna | veja abaixo |

Mudar a tarefa de lugar dentro da mesma coluna não grava evento. Os eventos que a mudança de coluna causa nas tarefas (marcar feito, apagar coluna com destino) não viram `concluiu_tarefa` nem `moveu_tarefa` por tarefa: ficam no `alterou_quadro`.

`alterou_quadro`: `objeto` `{quadro: "agenda", coluna?, nome?}`; `resultado` sempre com `acao`:

- `criou_coluna`: `{posicao}`
- `renomeou_coluna`: `{de, para}` (nomes)
- `reordenou_colunas`: `{antes, depois}` (listas de ids)
- `marcou_feito`: `{anterior, concluidas, reabertas}` (id da antiga coluna de feito e quantas tarefas ganharam e perderam `concluidaEm`)
- `apagou_coluna`: `{destino?, destinoNome?, movidas}` (`movidas`: os ids das tarefas)

Onde vão:

- Evento de tarefa **com matéria**: `materias/<matéria>/eventos.jsonl` (aparece na linha do tempo do caderno). Se a pasta da matéria não existe mais, vai para o da agenda (a pasta não é recriada por causa de um evento).
- Evento de tarefa **sem matéria** e todos os `alterou_quadro`: `agenda/eventos.jsonl`.
- **Trocar a matéria** de uma tarefa: o `editou_tarefa` vai para a matéria nova (ou para `agenda/eventos.jsonl`, se a tarefa ficou sem matéria) e `antes.materia` cita a antiga.

O evento é gravado depois da agenda. Sessão: o `sessao` do evento é a da sessão do pi em que a extensão está.

## Ponte (painel "agenda", docs/ponte-de-eventos.md)

Tela → extensão (`interface:acao`, painel `agenda`). Toda ação aceita `pedido` (texto qualquer, que volta na resposta):

| ação | dados |
|---|---|
| `abrir` | `{pedido?}` |
| `criar_tarefa` | `{titulo, nota?, coluna?, data?, hora?, materia?, pedido?}` |
| `editar_tarefa` | `{id, mudancas: {titulo?, nota?, data?, hora?, materia?}, pedido?}` (`null` limpa nota, data, hora e matéria) |
| `mover_tarefa` | `{id, coluna, posicao?, pedido?}` |
| `apagar_tarefa` | `{id, pedido?}` |
| `criar_coluna` | `{nome, posicao?, pedido?}` |
| `renomear_coluna` | `{id, nome, pedido?}` |
| `reordenar_colunas` | `{ids, pedido?}` (todos os ids das colunas, na nova ordem) |
| `marcar_feito` | `{id, pedido?}` (id da coluna) |
| `apagar_coluna` | `{id, destino?, pedido?}` (`destino`: o id da coluna que recebe as tarefas; obrigatório se a coluna tem tarefas) |

Extensão → tela (`interface:mostrar`, painel `agenda`, sempre `gravar: false`). Cada ação recebe exatamente uma resposta:

- `agenda {colunas, tarefas, provas, materias, pedido?, criada?}`: a agenda inteira, lida de novo do disco.
  - `colunas`: `[{id, nome, feito}]` na ordem do quadro. `tarefas`: as tarefas como no arquivo (na ordem do quadro).
  - `provas`: as provas de todas as matérias, lidas na hora do `materia.json`: `[{materia, nome, cor, prova, data}]` (`materia` é o id; `nome` e `cor`, os da matéria; `prova`, o nome da prova).
  - `materias`: `[{id, nome, cor}]` de todas as matérias (para escolher a matéria de uma tarefa).
  - `pedido`: o da ação. `criada`: o id da tarefa (`criar_tarefa`) ou da coluna (`criar_coluna`) criada.
- `erro {mensagem, ao?, pedido?}`: a ação falhou (validação, arquivo ilegível, dado faltando). `ao` é o nome da ação, `mensagem` já está em português para mostrar. Nada foi gravado. Também vem quando falta um dado obrigatório (o id, a coluna de destino, a lista de ids), para a tela não ficar esperando.

Regras:

- Todas as leituras e escritas passam por uma fila só, na ordem em que chegaram: as respostas voltam na ordem das ações e cada uma mostra o estado depois da sua ação.
- Quando uma matéria muda (provas novas, matéria nova), a extensão não avisa: a tela pede `abrir` de novo.
- Como as outras extensões, a cópia da extensão que não recebeu o `session_start` fica calada.
- Abrir não grava nada.

## `ler_agenda` (ferramenta do professor, só de leitura)

Parâmetros opcionais: `de` e `ate` (`AAAA-MM-DD`; padrão: hoje até 30 dias depois do início) e `materia` (o id). Devolve texto curto, em português, com quatro seções (cada uma com a contagem e, se passar de 40 linhas, "… e mais N"):

1. **Atrasadas**: tarefas abertas com data antes de hoje.
2. **Abertas com data no intervalo**: sem repetir as atrasadas.
3. **Abertas sem data**.
4. **Provas no intervalo**: `data: nome (matéria X)`.

Cada tarefa vem como `- título (id …; data hora; matéria X; coluna Y). Nota: …` (a nota cortada em 140 caracteres). Com `materia`, tudo é só daquela matéria (inclusive as tarefas sem data). Datas ruins, intervalo invertido, matéria que não existe e agenda ilegível voltam como erro da ferramenta. A ferramenta nunca escreve, nem cria o `agenda.json`. Numa conversa de caderno ela não filtra sozinha pela matéria da conversa: o professor passa `materia` se quiser.
