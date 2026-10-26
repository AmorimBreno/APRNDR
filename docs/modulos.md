# Módulos do curso: gerar sob demanda (item 6)

ESPECIFICACAO 8.3 ("Geração dos módulos") e 9.1. O guia cria só o esqueleto; o conteúdo de cada módulo é gerado quando o Breno chega nele, pelo "Gerar módulo", com um formulário de campos opcionais. Decisões do Breno em 2026-10-26: só o próximo módulo pode ser gerado; o modelo é o GPT-6.1 Sol. Os cursos estão em docs/cursos.md.

Tudo isto é do perfil de estudos.

Duas partes, cada uma aprovada no app: A (o arquivo, a geração, o formulário, os estados e o aguardando material) e B (a visão do módulo gerado).

## O arquivo

`materias/<matéria>/cursos/<curso>/modulos/<módulo>.json` (o id do módulo do esqueleto: m1, m2…), gravado inteiro de uma vez (lib/arquivos.ts). Sem arquivo, o módulo ainda não foi gerado.

```json
{
	"versao": 1,
	"id": "m3",
	"curso": "estudo-de-ciencia-de-dados-para-atividade",
	"materia": "ciencia-de-dados",
	"situacao": "gerado",
	"pedido": { "informacoes": "…", "observacoes": "…", "materiaisNovos": ["aula-05.pdf"], "pedidoEm": "…" },
	"aguardando": { "nota": "A aula 5 sai na quinta.", "desde": "…", "prontos": [{ "arquivo": "…", "hash": "…" }] },
	"licoes": [
		{
			"id": "l1",
			"titulo": "…",
			"objetivo": "…",
			"conceitos": ["c-…"],
			"blocos": [
				{ "id": "l1-b1", "tipo": "explicacao", "conceitos": ["c-…"], "formato": "exemplo_resolvido", "texto": "…markdown…", "referencias": [{ "arquivo": "aula-04.pdf", "local": "página 12", "trecho": "pagina-012" }], "complemento": true },
				{ "id": "l1-b2", "tipo": "verificacao", "conceitos": ["c-…"], "pergunta": "…", "respostaEsperada": "…" },
				{ "id": "l1-b3", "tipo": "alternativa", "conceitos": ["c-…"], "contexto": "…", "enunciado": "…", "alternativas": [{ "texto": "…", "correta": true }, { "texto": "…", "confusao": "…" }], "explicacao": "…", "referencias": [] },
				{ "id": "l1-b4", "tipo": "dissertativa", "conceitos": ["c-…"], "contexto": "…", "enunciado": "…", "rubrica": [{ "criterio": "…", "descricao": "…", "pontos": 2 }], "respostaModelo": "…" }
			]
		}
	],
	"geradoEm": "…", "modelo": "openrouter/openai/gpt-6.1-sol", "custo": 0.12,
	"materiaisUsados": [{ "arquivo": "aula-04.pdf", "hash": "…" }]
}
```

- `situacao`: `aguardando_material` ou `gerado`. "Gerando" e "erro" não são gravados: são estados da extensão (um módulo que falhou continua sem arquivo, ou com a versão anterior).
- `pedido`: o que o Breno escreveu no formulário (tudo opcional) e os materiais que ele mandou por ali.
- `aguardando`: com `situacao: "aguardando_material"`; `prontos` é a foto dos materiais prontos da matéria naquele momento, para avisar quando chegar um novo.
- Blocos: os ids são `l<n>-b<n>`. As questões (`alternativa`, `dissertativa`) têm o formato das questões do diagnóstico (docs/cursos.md, Parte B): `contexto` opcional, `enunciado` só com a pergunta, a `confusao` em cada alternativa errada, a rubrica de 3 a 5 critérios.
- `explicacao.formato` (9.1), escolhido pelo nível do conceito: `exemplo_resolvido` (iniciante), `exemplo_incompleto` (intermediário: passos para completar), `problema_aberto` (domina) ou `conceito` (a apresentação, antes do exemplo). `complemento: true` marca o que vai além do material (8.3, escopo "só o material": aparece marcado como complemento).
- O markdown segue docs/markdown-da-conversa.md (código em bloco com a linguagem, vetores e matrizes em blocos `vetor` e `matriz`, LaTeX).

## Qual módulo pode ser gerado

Só o próximo: o primeiro módulo do esqueleto, na ordem, que não está `gerado` nem `aguardando_material`. Um módulo aguardando material não segura os seguintes. Os gerados podem ser gerados de novo (com confirmação; a versão anterior é substituída). Um módulo aguardando pode ser gerado assim que o Breno quiser.

## O nível de cada conceito

Calculado pelo código a partir do diagnóstico concluído do curso (por enquanto; o perfil do aprendiz é o item 9): `iniciante` (disse "nunca vi" ou "já ouvi falar", ou errou a questão dele), `intermediario` (disse "sei explicar", ou acertou em parte), `domina` (disse "sei aplicar" e acertou); sem questão, vale o que ele disse. O nível escolhe o formato da explicação (9.1: exemplo resolvido completo para iniciante, com passos faltando para intermediário, problema aberto para quem domina; exemplos resolvidos demais atrapalham quem já sabe).

## A geração

Pela extensão `extensions/modulos.ts` (painel `modulos`), com os prompts `prompts/modulo-plano.md` e `prompts/modulo-licao.md` (`model: openrouter/openai/gpt-6.1-sol`), como o mapeador e o diagnóstico (chamadas fora da trava, uma nova tentativa com JSON inválido, custo somado, cancelamento).

1. Espera os materiais mandados pelo formulário ficarem prontos (o estado mostra "Esperando o processamento de aula-05.pdf") e depois entrarem no mapa de conteúdo da matéria (`mapa.arquivos` com o hash do manifesto; o mapa se atualiza sozinho pelo `materiais:pronto`), com o estado ainda `esperando_materiais` e "Esperando o mapa de conteúdo de aula-05.pdf" (o texto vai em `mensagem`). Cada espera tem o mesmo tempo limite (30 minutos). O material que não fica pronto no tempo é erro e o módulo não é gerado. O mapeamento que falha (a mensagem "erro" do mapa para o arquivo, ou o tempo limite) não impede a geração: o módulo é gerado assim mesmo e o estado leva o `aviso` "aula-05.pdf entrou sem referências: o mapa não terminou." (durante a geração e no módulo gerado, até a próxima ação nele). No escopo livre só a primeira espera vale (o material não entra na geração).
2. Plano do módulo (uma chamada): recebe os conceitos do módulo (nome, descrição, prioridade, nível), o objetivo e o tipo do módulo, as horas, o objetivo, o escopo, o tipo e o motivo do curso, o formulário e, por conceito, a lista dos locais do material que o citam. Devolve as lições: título, objetivo, conceitos e o roteiro (a sequência dos tipos de bloco). Uma lição por uns 40 a 60 minutos do módulo (de 1 a 6); cada lição alterna explicação e prática e termina com prática; uma dissertativa por módulo pelo menos quando o tipo do curso é teórico ou misto.
3. Uma chamada por lição: recebe o plano inteiro (para não repetir as outras), a lição, os níveis, e os trechos do `.extraido` citados pelos conceitos da lição (até uns 40 mil caracteres). Devolve os blocos. No escopo "só o material", as questões só cobram o que está nos trechos, e o que for além aparece como complemento.
4. O código valida: referências como no mapa (um local que não existe é descartado); as questões como no diagnóstico (uma correta, confusão nas erradas, rubrica); blocos vazios saem; uma lição sem prática ou sem explicação pede uma nova tentativa daquela lição (uma vez).
5. Grava o módulo, o evento e manda o estado.

O estado na tela, por módulo: `a_gerar`, `esperando_materiais`, `planejando`, `escrevendo` (`licao`, `licoes`), `gerado`, `aguardando_material`, `erro` (com a mensagem). Cancelar para a geração; o que estava gravado antes fica.

## Eventos (na matéria)

- `gerou_modulo`: objeto `{materia, curso, modulo}`; resultado `{licoes, blocos, questoes, custo}`; contexto `{modelo, prompts: [{nome, hash}]}`.
- `marcou_aguardando_material`: objeto `{materia, curso, modulo}`; resultado `{nota}`.

## Ponte (painel "modulos")

Tela → extensão:
- `listar {materia, curso}`: o estado de todos os módulos do curso;
- `gerar {materia, curso, modulo, pedido, informacoes?, observacoes?, materiaisNovos?}`;
- `aguardar {materia, curso, modulo, pedido, nota?}`;
- `cancelar {materia, curso, modulo}`;
- `abrir {materia, curso, modulo}` (parte B).

Extensão → tela (`gravar: false`):
- `estado {materia, curso, modulos: [{id, situacao, licao?, licoes?, esperando?, mensagem?, aviso?, geradoEm?, custo?, licoesGeradas?, blocos?, questoes?, nota?, materialNovo?}], proximo, pedido?}`, mandado a cada mudança (`proximo`: o próximo módulo, ou null);
- `modulo {materia, curso, modulo: <o json>}` (parte B);
- `erro {mensagem, ao?, materia?, curso?, modulo?, pedido?}`.

`materialNovo: true` num módulo aguardando quando os materiais prontos da matéria mudaram desde que ele começou a aguardar.

## A tela (parte A)

Na visão do curso (TelaCurso):
- O card do próximo módulo tem a ação "Gerar módulo", que abre o formulário (Modal): a área de soltar materiais (vão para a matéria e entram no mapa), "Informações específicas" e "Observações" (TextArea), e a marcação "Ainda não tenho o material deste módulo" (troca o primário por "Marcar como aguardando material", com uma nota opcional). Um aviso diz o custo aproximado.
- Durante a geração, o card mostra a etapa ("Planejando as lições…", "Escrevendo a lição 2 de 4") e um "Parar".
- Gerado: o card diz "Gerado" com o número de lições e de questões, e a ação "Abrir" (parte B; na parte A, "Em breve"). "Gerar de novo" fica num menu do card, com confirmação.
- Aguardando material: o card com a etiqueta "Aguardando material" e a nota; com material novo, "Material novo: gerar agora?".
- Os cards dos módulos depois do próximo continuam bloqueados.
