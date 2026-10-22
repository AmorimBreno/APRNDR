# Cursos e o guia de criação (item 5)

ESPECIFICACAO 8.3. Um curso é um plano de estudo de uma matéria: curso, módulos, lições e blocos. O guia de criação monta o curso em seis etapas: Básico, Materiais, Objetivo, Mapa, Diagnóstico e Esqueleto. Decisões do Breno em 2026-10-22: o guia é uma tela inteira sobre o caderno (não um modal); na etapa Mapa, cada curso marca quais conceitos do mapa da matéria entram nele; o diagnóstico e o esqueleto usam o GPT-6.1 Sol.

Tudo isto é do perfil de estudos (profiles/estudos), não do núcleo.

O item vem em três partes, cada uma aprovada no app antes da próxima:
- A: o rascunho, a seção Cursos do caderno e as etapas 1 a 4 (com o mapa montado a partir do tema);
- B: a etapa 5, o diagnóstico;
- C: a etapa 6, o esqueleto e o calendário, e a visão do curso pronto.

Este documento descreve a parte A. As partes B e C acrescentam as suas seções.

## O arquivo

`materias/<matéria>/cursos/<curso>/curso.json`, gravado inteiro de uma vez (escrito ao lado e renomeado), em JSON com indentação de tabulação. O id do curso vem do nome, como o da matéria (sem acento, minúsculo, com hífens, e um número no fim se repetir dentro da matéria).

```json
{
	"versao": 1,
	"id": "p1-regressao",
	"nome": "P1: regressão",
	"materia": "ciencia-de-dados",
	"situacao": "rascunho",
	"etapa": "objetivo",
	"criadoEm": "2026-10-22T13:00:00.000Z",
	"alteradoEm": "2026-10-22T13:10:00.000Z",
	"basico": { "prazo": "2026-11-20", "prova": "P1", "horasPorSemana": 4 },
	"materiais": { "arquivos": [{ "arquivo": "aula-04.pdf", "hash": "…" }] },
	"objetivo": { "escopo": "so_material", "tipo": "misto", "motivo": "Passar na P1 entendendo de verdade." },
	"mapa": { "conceitos": ["c-…", "c-…"] },
	"diagnostico": null,
	"esqueleto": null
}
```

- `situacao`: `rascunho` enquanto o guia não termina; `pronto` depois de "Criar curso" (parte C).
- `etapa`: a primeira etapa ainda não confirmada (`basico`, `materiais`, `objetivo`, `mapa`, `diagnostico`, `esqueleto`), onde o guia reabre. Com todas confirmadas, `esqueleto`.
- Cada etapa confirmada guarda o que foi escolhido nela; uma etapa não confirmada é `null` (ou ausente).
  - `basico`: `prazo` (AAAA-MM-DD, ou null = sem prazo), `prova` (o nome da prova da matéria escolhida, se veio de uma) e `horasPorSemana` (número de 1 a 60).
  - `materiais`: os arquivos de `materias/<id>/materiais` que estavam prontos ao confirmar, com o hash do manifesto do `.extraido` (a foto que serve para saber se os materiais mudaram depois). Pular a etapa confirma com a lista do momento (pode ser vazia).
  - `objetivo`: `escopo` (`so_material`, `material_base` ou `livre`), `tipo` (`teorico`, `aplicado` ou `misto`) e `motivo` (texto livre, pode ser vazio). `so_material` exige pelo menos um arquivo em `materiais`.
  - `mapa`: os ids dos conceitos do mapa da matéria que entram no curso, na ordem do mapa. Só conceitos de dentro do mapa (não `fora`); pelo menos um. Para confirmar, o mapa da matéria precisa estar `aprovado`.
  - `diagnostico` e `esqueleto`: partes B e C.

## Confirmar uma etapa e o que ela invalida

O guia só anda para a frente confirmando: "Continuar" grava a etapa e passa `etapa` para a próxima não confirmada. Voltar a uma etapa já confirmada e confirmá-la com algo diferente invalida as etapas que dependem dela (elas voltam a `null`, e `etapa` vai para a primeira etapa vazia):

| etapa mudada | invalida |
|---|---|
| `basico` | `esqueleto` (o prazo e as horas mudam o calendário) |
| `materiais` | `mapa`, `diagnostico`, `esqueleto` |
| `objetivo` | `diagnostico`, `esqueleto` (e `mapa` se o escopo mudou de ou para `livre`) |
| `mapa` | `diagnostico`, `esqueleto` |
| `diagnostico` | `esqueleto` |

Confirmar com exatamente o mesmo conteúdo não invalida nada. Uma função pura diz o que uma confirmação invalidaria, para a tela avisar antes ("Isto descarta o Mapa e o Diagnóstico. Continuar?").

O que muda fora do guia não invalida sozinho: se os materiais prontos da matéria ou o mapa mudaram depois da confirmação, o guia mostra um aviso na etapa e você decide confirmar de novo.

## Eventos (no eventos.jsonl da matéria)

- `comecou_curso`: ao criar o rascunho (confirmar Básico pela primeira vez). Objeto `{materia, curso}`; resultado `{nome}`.
- `descartou_curso`: ao descartar um rascunho (a pasta do curso é apagada; só rascunho pode ser descartado, com confirmação). Objeto `{materia, curso}`; resultado `{nome, etapa}`.
- `criou_curso`: parte C.

Confirmar etapas não grava evento (a linha do tempo ficaria cheia de passos do guia).

## Ponte (painel "cursos", docs/ponte-de-eventos.md)

Tela → extensão (`interface:acao`, painel `cursos`):

- `listar {materia}`
- `abrir {materia, curso}`
- `comecar {materia, pedido, basico: {nome, prazo, prova?, horasPorSemana}}`: cria o rascunho com Básico já confirmado
- `confirmar {materia, curso, pedido, etapa, dados}`: `dados` é o conteúdo da etapa; para `basico`, inclui `nome` (o nome do curso pode mudar; o id não muda)
- `descartar {materia, curso, pedido}`

Extensão → tela (`interface:mostrar`, sempre `gravar: false`):

- `lista {materia, cursos: [{id, nome, situacao, etapa, prazo, alteradoEm}]}`
- `curso {materia, curso, invalidadas?, pedido?}`: o curso.json inteiro, depois de abrir, começar ou confirmar; `invalidadas` são as etapas que a confirmação apagou
- `descartado {materia, curso, pedido}`
- `erro {mensagem, ao?, materia?, curso?, pedido?}`

## Mapa a partir do tema

Sem material (escopo `livre` e nenhum arquivo), a etapa Mapa oferece "Montar a partir do tema". O mapa da matéria continua um só (docs/mapa-conteudo.md), e quem escreve nele é só a extensão do mapa:

- ação nova no painel `mapa`: `do_tema {materia, pedido, tema, tipo?, motivo?}` (tema = o nome do curso; tipo e motivo vêm do Objetivo);
- a extensão do mapa chama o modelo do `prompts/mapa-do-tema.md` (frontmatter `model: openrouter/anthropic/claude-sonnet-5.5`, o mesmo do mapeador), que devolve `{"conceitos": [{"nome", "descricao"}]}` na ordem de estudo;
- os conceitos entram no fim do mapa com `origem: "tema"`, sem referência, prioridade `normal`, `novo` se o mapa já tem `aprovadoEm`; um nome igual ao de um conceito do mapa (chaveDoNome) não entra de novo;
- um conceito de origem `tema` não é "sem fonte" e pode ser apagado (como o de origem `usuario`);
- enquanto monta, o estado `mapa` leva `montandoTema: true`; no fim, o evento `montou_mapa_do_tema` (objeto `{materia}`; resultado `{novos, custo, tema}`; contexto `{modelo}`), e o mapa aprovado passa a `alterado` se algo entrou.

## A tela

- A seção Cursos do caderno deixa de ser "em breve": a lista dos cursos da matéria (os rascunhos com a etapa onde pararam e "Continuar"; os prontos abrem a visão do curso, que chega na parte C) e "Novo curso".
- O guia é uma tela inteira em `caderno/<matéria>/cursos/novo` (antes de existir o rascunho) e `caderno/<matéria>/cursos/<curso>/guia[/<etapa>]` (F5 volta na mesma etapa).
