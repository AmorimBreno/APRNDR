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
| `materiais` | `mapa`, `diagnostico`, `esqueleto` (e `objetivo` se a lista ficou vazia e o escopo confirmado é `so_material`) |
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
- `prontos {materia, curso}`: manda de novo o curso com os materiais prontos de agora; a tela pede quando muda quantos materiais prontos a matéria tem

Extensão → tela (`interface:mostrar`, sempre `gravar: false`):

- `lista {materia, cursos: [{id, nome, situacao, etapa, prazo, alteradoEm}]}`
- `curso {materia, curso, invalidadas?, pedido?, prontos?}`: o curso.json inteiro, depois de abrir, começar, confirmar ou `prontos`; `invalidadas` são as etapas que a confirmação apagou; `prontos` são os materiais prontos da matéria agora (`[{arquivo, hash}]` dos manifestos do `.extraido`, em ordem de caminho), que a tela compara com a etapa Materiais para avisar que eles mudaram
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

## Parte B: o diagnóstico

ESPECIFICACAO 8.3, etapa 5, e 9.2. O diagnóstico compara o que o Breno acha que sabe de cada conceito do curso com o que ele acerta: é a primeira evidência de calibração, e as questões servem como pré-teste do curso. Ele tem três fases, na mesma etapa do guia: autoavaliação, questões e resultado.

### No curso.json

Enquanto o diagnóstico não termina, o progresso fica em `diagnosticoEmAndamento` (a etapa `diagnostico` continua `null`, e o guia reabre na fase em que parou). "Concluir diagnóstico" confirma a etapa: o conteúdo de `diagnosticoEmAndamento` vira `diagnostico` (com `concluidoEm`) e o campo em andamento sai. Tudo o que invalida a etapa `diagnostico` (tabela acima) apaga também o `diagnosticoEmAndamento`.

```json
"diagnosticoEmAndamento": {
	"autoavaliacao": { "c-…": 2 },
	"questoes": [
		{
			"id": "q1",
			"tipo": "alternativa",
			"conceitos": ["c-…"],
			"enunciado": "…",
			"alternativas": [
				{ "texto": "…", "correta": true },
				{ "texto": "…", "confusao": "Confunde correlação com causalidade." }
			],
			"explicacao": "…"
		},
		{
			"id": "q7",
			"tipo": "dissertativa",
			"conceitos": ["c-…"],
			"enunciado": "…",
			"rubrica": [{ "criterio": "Define o resíduo", "descricao": "…", "pontos": 2 }],
			"respostaModelo": "…"
		}
	],
	"geradoEm": "…", "modelo": "openrouter/openai/gpt-6.1-sol", "custo": 0.03,
	"respostas": {
		"q1": { "confianca": 3, "escolha": 1, "correta": false, "tempoMs": 41000, "respondidaEm": "…" },
		"q7": {
			"confianca": 2, "texto": "…", "tempoMs": 180000, "respondidaEm": "…",
			"correcao": {
				"criterios": [{ "criterio": "Define o resíduo", "trechos": ["…"], "pontos": 1, "max": 2, "justificativa": "…" }],
				"total": 3, "max": 5, "modelo": "…", "custo": 0.01
			}
		}
	}
}
```

- `autoavaliacao`: um nível por conceito do curso: 0 = nunca vi, 1 = já ouvi falar, 2 = sei explicar, 3 = sei aplicar.
- `questoes`: geradas de uma vez, depois da autoavaliação. Cada alternativa errada leva a `confusao` que ela representa (8.5). A ordem das alternativas é a de exibição (o modelo já embaralha; o código confere que há exatamente uma correta).
- `respostas`: `confianca` de 1 a 4 (1 = chute, 2 = pouca, 3 = boa, 4 = certeza), marcada antes de responder; `escolha` é o índice da alternativa; `tempoMs` do momento em que a questão apareceu até a resposta.
- `correcao` da dissertativa: uma chamada só, pela rubrica, primeiro extraindo da resposta os trechos de cada critério e só depois pontuando (8.5). As rodadas repetidas, a mediana e a concordância com a nota do Breno ficam para o item 8.

### Quais conceitos entram nas questões

Escolhidos pelo código, não pelo modelo: até 8 conceitos do curso. Primeiro os de prioridade alta; depois, alternando entre os níveis da autoavaliação, com pelo menos 2 dos que ele disse "sei explicar" ou "sei aplicar" quando houver (é aí que a calibração aparece). Uma questão de alternativa por conceito escolhido, até 6; dissertativas: 1 (2 no tipo teórico, com pelo menos 4 conceitos), sobre conceitos escolhidos.

### O modelo

`prompts/diagnostico.md` (as questões) e `prompts/corretor.md` (a dissertativa), os dois com `model: openrouter/openai/gpt-6.1-sol`, chamados pela extensão de cursos como o mapeador (temperatura 0 no corretor; uma nova tentativa com JSON inválido). A mensagem das questões leva: o nome, a descrição e a autoavaliação de cada conceito escolhido, o tipo e o escopo do curso, o motivo e, nos escopos com material, até uns 6 mil caracteres por conceito dos trechos do `.extraido` citados nas referências dele (40 mil no total). No escopo "só o material", as questões só cobram o que está nesses trechos.

### Eventos

No `aprendiz/eventos.jsonl` (camada 1 da seção 9.2), com `objeto` `{materia, curso, conceitos, questao?}` e `contexto` `{fase: "diagnostico", modelo?, prompt}` (prompt = o nome do arquivo de prompt e o hash dele):
- `autoavaliou_conceito`: um por conceito quando a autoavaliação é salva (só os que mudaram); resultado `{nivel}`;
- `respondeu_questao`: resultado `{correta, escolha, confusao?, confianca, tempoMs}`;
- `respondeu_dissertativa`: quando a correção chega; resultado `{confianca, tempoMs, total, max, criterios: [{criterio, pontos, max}]}` e o texto em `resultado.texto`.

No `eventos.jsonl` da matéria (a linha do tempo): `gerou_diagnostico` (objeto `{materia, curso}`; resultado `{questoes, custo}`) e `concluiu_diagnostico` (resultado `{acertos, alternativas, dissertativas, nota}`).

### Ponte (painel "cursos")

Tela → extensão:
- `autoavaliar {materia, curso, pedido, niveis}`: salva a autoavaliação (inteira) em andamento;
- `gerar_diagnostico {materia, curso, pedido}`: exige a autoavaliação completa; gera as questões (estado `gerandoDiagnostico: true` na mensagem `curso` enquanto isso); gerar de novo descarta as questões e as respostas anteriores;
- `responder {materia, curso, pedido, questao, confianca, escolha?, texto?, tempoMs}`: grava a resposta; na dissertativa, corrige em seguida (a mensagem `curso` leva `corrigindo: [questao]` enquanto isso);
- `corrigir {materia, curso, pedido, questao}`: tenta de novo a correção de uma dissertativa respondida que ficou sem correção (a correção falhou); uma já corrigida, ou que está sendo corrigida agora, dá erro. Ainda não está em `AcoesCursos` (curso-tipos.ts): a extensão aceita os dados como chegam;
- `concluir_diagnostico {materia, curso, pedido}`: exige todas as questões respondidas e corrigidas; confirma a etapa.

Todas respondem com `curso`. Onde vai o `pedido`:
- `gerar_diagnostico`: primeiro um `curso` sem pedido, com `gerandoDiagnostico: true`; o pedido vai no `curso` com as questões geradas, ou no `erro` (`ao: "gerar_diagnostico"`). Um segundo `gerar_diagnostico` no mesmo curso, com outro em andamento, dá erro;
- `responder`: o pedido vai no `curso` logo depois de gravar a resposta (na dissertativa, já com `corrigindo: [questao]`). A correção chega depois num `curso` sem pedido; se ela falhar, um `erro` sem pedido, com `ao: "corrigir"` e `questao`, e um `curso` sem `corrigindo` (a resposta fica gravada sem correção; `corrigir` tenta de novo). Um erro da própria resposta (já respondida, sem confiança) vem com o pedido, `ao: "responder"` e `questao`;
- `corrigir`: primeiro um `curso` sem pedido, com `corrigindo`; o pedido vai no `curso` com a correção, ou no `erro` (`ao: "corrigir"`, com `questao`).

`gerandoDiagnostico` e `corrigindo` vêm em toda mensagem `curso` (inclusive `abrir` e `prontos`) enquanto a geração ou a correção estão em andamento, para a tela reaberta saber. As chamadas aos modelos vão fora da trava da matéria; o fim da sessão as cancela sem gravar nada. Se a resposta da dissertativa mudou enquanto ela era corrigida (as questões foram geradas de novo), a correção é jogada fora.

O `contexto.prompt` dos eventos é `{nome, hash}`: o nome do arquivo e os 12 primeiros hex do sha256 do conteúdo dele. `respondeu_dissertativa` leva o do `corretor.md`; os outros (`autoavaliou_conceito`, `gerou_diagnostico`, `respondeu_questao`, `concluiu_diagnostico`), o do `diagnostico.md` como ele está na hora do evento. Enquanto alguma questão estiver sem resposta, a tela não recebe `correta`, `confusao`, `explicacao`, `respostaModelo`, a `rubrica`, nem a `correta` e a `correcao` das respostas (o pré-teste não mostra o gabarito durante as questões); a extensão tira esses campos da mensagem. Com todas respondidas, a mensagem vai inteira (a fase Resultado).

### A tela (etapa Diagnóstico)

- Autoavaliação: a lista dos conceitos do curso, cada um com os 4 níveis; "Gerar as questões" quando todos têm nível.
- Questões, uma por vez, com o placar do QuizProgress: primeiro a confiança (1 a 4), e só então as alternativas (QuizQuestion) ou o campo (EssayAnswer); sem gabarito durante as questões.
- Resultado: por conceito, o que ele disse e o que acertou; cada questão com o gabarito, a confusão da alternativa errada escolhida e, na dissertativa, a nota por critério com os trechos; "Concluir diagnóstico".

## Parte C: o esqueleto e o curso pronto

ESPECIFICACAO 8.3, etapa 6, e 8.5. O esqueleto são os módulos do curso: nome, objetivo, conceitos e tipo de cada um, com um calendário sugerido de avaliações dentro do prazo. O conteúdo dos módulos não é gerado aqui: ele vem pelo "gerar módulo" quando o Breno chega em cada um (item 6).

### No curso.json

Como no diagnóstico, a proposta em edição fica em `esqueletoEmAndamento`; "Criar curso" confirma a etapa: o conteúdo vira `esqueleto` (com `criadoEm`), o em andamento sai, e a `situacao` do curso passa a `pronto`. Tudo o que invalida a etapa `esqueleto` apaga também o em andamento. Um curso pronto não volta a ser rascunho: mudar uma etapa dele fica para depois (o guia de um curso pronto abre só para leitura).

```json
"esqueletoEmAndamento": {
	"modulos": [
		{
			"id": "m1",
			"nome": "A reta de regressão",
			"objetivo": "Ajustar e interpretar uma regressão linear simples.",
			"conceitos": ["c-…", "c-…"],
			"tipo": "normal",
			"horas": 3
		}
	],
	"geradoEm": "…", "modelo": "openrouter/openai/gpt-6.1-sol", "custo": 0.02
}
```

- `modulos`, na ordem do curso. Todo conceito do curso (`curso.mapa.conceitos`) está em exatamente um módulo; um módulo tem pelo menos um conceito.
- `tipo`: `normal`, `curto` (conceitos que o diagnóstico mostrou que ele já domina: menos explicação, mais prática) ou `revisao` (só retomar e praticar).
- `horas`: o tempo estimado do módulo (de 0,5 a 40, passo de 0,5).
- `id`: m1, m2… atribuídos pelo código (um módulo novo ganha o próximo número livre).

### O calendário

Calculado pelo código, nunca pelo modelo, a partir de `horas`, de `basico.horasPorSemana`, de `basico.prazo` e de hoje (funções puras, as mesmas na tela e na extensão):
- os módulos vão em sequência a partir de amanhã; cada um dura `ceil(horas / horasPorSemana × 7)` dias corridos (pelo menos 1);
- a avaliação de cada módulo fica disponível no dia seguinte ao fim dele (8.5: medir retenção, não memória recente);
- com prazo: a avaliação geral fica no dia anterior ao prazo; se a soma não cabe antes dela, as durações são encolhidas na mesma proporção (cada módulo com pelo menos 1 dia) e o calendário leva um aviso com as horas por semana que o plano pede ("No prazo, este plano pede cerca de 7 h por semana; você disse 4.");
- sem prazo: a avaliação geral fica no dia seguinte ao fim do último módulo;
- prazo que já passou ou é amanhã: aviso, e o calendário segue como sem prazo.

O resultado (`{modulos: [{id, inicio, fim, avaliacao}], avaliacaoGeral, horasPorSemanaNecessarias?, avisos}`) não é gravado no em andamento; ele é gravado em `esqueleto.calendario` ao criar o curso (a foto do dia da criação).

### O modelo

`prompts/esqueleto.md`, `model: openrouter/openai/gpt-6.1-sol`, chamado pela extensão como o diagnóstico. A mensagem leva: os conceitos do curso na ordem (id, nome, descrição, prioridade), o resumo do diagnóstico por conceito (o nível que ele disse e o resultado), o tipo, o escopo e o motivo, as horas por semana e os dias até o prazo. O modelo devolve `{"modulos": [{"nome", "objetivo", "conceitos": [ids], "tipo", "horas"}]}`. O código valida: ids só do curso; um conceito repetido fica no primeiro módulo; um conceito que faltou entra no módulo do conceito anterior a ele na ordem do curso (ou no primeiro); módulos vazios saem; tipo e horas fora do permitido viram `normal` e 2; e reatribui os ids. Entre 2 e 12 módulos; fora disso é erro (e uma nova tentativa).

### Eventos (na matéria)

- `gerou_esqueleto`: objeto `{materia, curso}`; resultado `{modulos, custo}`; contexto `{modelo, prompt}`.
- `criou_curso`: objeto `{materia, curso}`; resultado `{nome, modulos, prazo, avaliacaoGeral}`.

### Ponte (painel "cursos")

Tela → extensão:
- `gerar_esqueleto {materia, curso, pedido}`: exige o diagnóstico concluído; gera a proposta (a mensagem `curso` leva `gerandoEsqueleto: true` enquanto isso); gerar de novo substitui a proposta;
- `editar_esqueleto {materia, curso, pedido, modulos}`: grava a proposta editada inteira (validada pelas mesmas regras, sem o conserto: aqui um conceito faltando ou repetido é erro);
- `criar_curso {materia, curso, pedido}`: confirma a etapa com o em andamento e o calendário de hoje.

### A tela

- Etapa Esqueleto, na coluna larga: sem proposta, "Montar o esqueleto" (com a espera do professor); com proposta, a lista de módulos editável e, ao lado (ou embaixo, em tela estreita), o calendário.
  - Cada módulo: o número, o nome e o objetivo (editáveis no lugar), o tipo (Normal, Curto, Revisão), as horas, e os conceitos dele como etiquetas; cada etiqueta abre um menu "Mover para o módulo…"; subir, descer e apagar o módulo (só vazio; os conceitos de um módulo que sai vão para o anterior); "Módulo novo" no fim.
  - O calendário: uma linha por módulo (datas de início e fim e o dia da avaliação) e a avaliação geral, com os avisos.
  - Cada edição salva sozinha (editar_esqueleto, com atraso, um por vez), e o calendário acompanha na hora.
  - O primário: "Criar curso". "Gerar de novo" com confirmação.
- O curso pronto, em `caderno/<matéria>/cursos/<curso>`: o nome, o prazo, as horas por semana, o tipo e o escopo; os módulos em ModuleCard (o primeiro como próximo e os outros bloqueados, com o número de conceitos e as horas; a ação de gerar o módulo é do item 6 e aparece como "Em breve"); e o calendário. A seção Cursos abre o curso pronto por aqui.
