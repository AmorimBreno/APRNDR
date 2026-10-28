# Módulos do curso: gerar sob demanda (item 6)

ESPECIFICACAO 8.3 ("Geração dos módulos") e 9.1. O guia cria só o esqueleto; o conteúdo de cada módulo é gerado quando o Breno chega nele, pelo "Gerar módulo", com um formulário de campos opcionais. Decisões do Breno: o modelo é o GPT-6.1 Sol (2026-10-26); qualquer módulo pode ser gerado quando ele quiser, e o "Próximo" é só a recomendação (2026-10-27). Os cursos estão em docs/cursos.md.

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

Qualquer um, quando o Breno quiser (decisão dele em 2026-10-27, que troca o "só o próximo" de 2026-10-26). Gerar e ser recomendado são coisas separadas:
- todo módulo não concluído pode ser gerado (ou gerado de novo, com confirmação; a versão anterior é substituída quando a nova fica pronta). Um concluído não é gerado de novo;
- o recomendado ("Próximo") é o primeiro módulo do esqueleto, na ordem, que não está concluído e não está aguardando material. Concluir um módulo passa a recomendação para o seguinte.

### Concluir um módulo

O módulo gerado ganha `concluidoEm` (ISO 8601) quando o Breno o conclui. Por enquanto, a conclusão é manual: "Concluir o módulo", no pé da última lição da visão do módulo, com confirmação ("Concluir o módulo NN? A recomendação passa para o próximo."). A partir do item 7, o progresso da aula também conclui. Evento `concluiu_modulo` (objeto `{materia, curso, modulo}`; resultado `{licoes, questoes}`), na matéria. Ação da ponte `concluir {materia, curso, modulo, pedido}`. Concluído não volta atrás (desfazer fica para depois).

### O card de cada módulo

A cor diz se o módulo foi gerado; a etiqueta "Próximo" diz qual é o recomendado (independentes):
- concluído: o vinil holográfico com o carimbo (state `done`), ação "Rever";
- gerado e não concluído: preenchido de musgo (o material do state `next` do ModuleCard), ação "Abrir"; "Gerar de novo" embaixo do card;
- não gerado: preto (o fundo do painel, borda cheia, sem tracejado nem cadeado), ação "Gerar módulo";
- gerando: o card preto vai se enchendo de musgo de baixo para cima conforme o progresso (esperando os materiais ≈ 5 %, planejando ≈ 10 %, escrevendo a lição i de n ≈ 10 + 90 × (i − 1) / n %, gravado = 100 %), com uma transição suave; a etapa em texto embaixo do card e o Parar;
- aguardando material: preto, com a etiqueta "Aguardando material" e a nota;
- o recomendado leva a etiqueta "Próximo" (a do ModuleCard), seja gerado ou não; nenhum outro leva.
Nada fica bloqueado. As variações são classes do perfil por cima do ModuleCard (o design system não muda).

## O esquema da lição (2026-10-28)

Pedido do Breno: as lições estavam curtas, pouco explicadas e com questões demais. Toda lição segue um esquema, que o plano escreve no roteiro e o código confere:

1. **Introdução** (explicação, formato `introducao`): o contexto do tema — o que é, por que importa, onde e como se usa no mundo real e no material. Sempre o primeiro bloco.
2. Para cada ideia da lição, um ciclo:
   - **Conceito** (explicação, formato `conceito`): a teoria, com o porquê;
   - **Exemplo** (explicação, formato pelo nível: `exemplo_resolvido`, `exemplo_incompleto` ou `problema_aberto`): o conceito aplicado, desenvolvido passo a passo e depois retomado para explicar melhor;
   - **Pergunta** (`verificacao`): uma pergunta curta para ver se o conceito apresentado foi entendido;
   - opcionalmente, mais explicação (`conceito` ou exemplo) quando a ideia pede.
3. **Ideia central** (bloco novo `ideia_central`: `{texto, conceitos}`, de 1 a 3 frases): o que guardar da lição, no visual do Callout. Vem antes do quiz.
4. **Quiz** (`alternativa`): no fim de cada ideia prática ou da lição.
5. **Dissertativa**: quando a lição (ou a ideia) é mais teórica, com pouco a praticar.

Regras que o código confere (validarPlano no roteiro e validarLicao no resultado; uma nova tentativa da lição quando falham): começa por `introducao`; nenhuma questão antes do primeiro conceito; nunca duas questões seguidas (pergunta, quiz, dissertativa); toda pergunta vem depois de um conceito ou exemplo; ideia central antes do quiz final; pelo menos 70 % dos caracteres da lição em explicações (introdução, conceito, exemplos e ideia central); uma explicação de conceito tem pelo menos uns 900 caracteres, uma introdução uns 600 e um exemplo uns 900 (exemplo explicado, não só o código). Lições geradas antes disto continuam válidas para ler.

## A metodologia em arquivos

O "como ensinar" sai dos prompts e vai para arquivos por tipo de ensino, em `profiles/estudos/metodo/` (a base, no repositório): `estrutura-da-licao.md`, `introducao.md`, `conceito.md`, `exemplos.md`, `ideia-central.md`, `pergunta.md`, `quiz.md`, `dissertativa.md`. Cada chamada carrega só o que vai escrever: o plano carrega a estrutura; a lição, a estrutura e os arquivos dos tipos de bloco do roteiro dela; a reescrita de um bloco, o arquivo do tipo dele; o diagnóstico, quiz e dissertativa; o corretor, dissertativa. Os prompts (`prompts/modulo-*.md`, `diagnostico.md`) ficam com o formato e as regras de saída. A parte 4 do plano acrescenta, por arquivo, os ajustes pessoais aprovados pelo Breno, na pasta de dados (`aprendiz/metodo/<arquivo>.md`), carregados junto da base.

## A tela das questões (2026-10-28)

Os blocos de texto continuam com a etiqueta de hoje. As questões não levam etiqueta: cada tipo tem um post-it (o Sticker do design system, como o "Em curso" do card do módulo), com ícone e nome, preso no canto do cartão, e a borda do cartão na cor do tipo:
- Quiz (`alternativa`): âmbar, texto preto;
- Dissertativa: tijolo, texto preto;
- Pergunta (`verificacao`): musgo (a cor do card do módulo gerado), texto claro (`--on-moss`; o preto não se lia no musgo).
A ideia central usa o visual do Callout (não é questão).

## Responder as questões (parte 2 do plano de 2026-10-28)

Pedido do Breno: as questões do módulo deixam de ser só para ler ("Ver gabarito") e passam a ser respondidas de verdade; as respostas viram eventos e dão o progresso. Os botões "Ver resposta", "Ver gabarito" e "Ver rubrica e resposta-modelo" saem; no lugar, cada questão tem "Não sei", que mostra a resposta e conta como não sabida.

### Confiança

Antes de responder qualquer questão (seção 8 da especificação), o Breno marca a confiança de 1 a 4, como no diagnóstico: 1 = chute, 2 = pouca, 3 = boa, 4 = certeza. Sem confiança, "Responder" fica desligado. "Não sei" não pede confiança. A confiança é marcada uma vez por questão e vale para as tentativas dela (na segunda tentativa do quiz e na reescrita da dissertativa, a extensão usa a gravada; uma mandada de novo é ignorada). O `tempoMs` vai da marcação da confiança até a resposta (na tela comprida do módulo, o momento em que a questão "apareceu" não diz nada).

### Quiz (`alternativa`): duas tentativas

1. Escolhe uma alternativa e "Responder".
2. Certa: a alternativa fica verde, aparece a explicação. Acabou.
3. Errada na primeira: a alternativa fica marcada como errada e desligada, e aparece uma pista com a confusão dela ("Pista: essa resposta confunde correlação com causalidade."; o texto da `confusao`, sem modelo). "Tentar de novo": escolhe outra.
4. Errada na segunda: aparece o gabarito inteiro (a correta, a confusão embaixo de cada errada e a explicação).

A conferência é feita pela extensão (ela tem o gabarito e grava o evento); não chama modelo.

### Pergunta rápida (`verificacao`): conferida pelo modelo

O Breno escreve a resposta (TextArea) e "Responder". O modelo compara com a `respostaEsperada` e devolve `avaliacao` (`certa`, `parcial` ou `errada`) e um `retorno` de 1 a 2 frases (o que está certo e o que faltou, sem copiar a resposta esperada). A tela mostra "Conferindo…", depois a avaliação (Certa / Em parte / Errada), o retorno e a resposta esperada. Uma tentativa só.

Prompt `prompts/verificacao.md` (`model: openrouter/openai/gpt-6.1-sol`, temperatura 0, uma nova tentativa com JSON inválido), com a metodologia `pergunta.md`. A mensagem leva a pergunta, a resposta esperada, os textos dos blocos de explicação logo antes dela na lição (o que acabou de ser explicado, até uns 6 mil caracteres) e a resposta do Breno. Resposta só em JSON: `{"avaliacao": "certa" | "parcial" | "errada", "retorno": "…"}`.

### Dissertativa: corrigida pela rubrica, com uma reescrita

O Breno escreve a resposta e "Responder". A correção é a do diagnóstico (`prompts/corretor.md`, a mesma chamada: trechos por critério, depois os pontos). A tela mostra "Corrigindo…" e depois:
- o placar em critérios: "Você cobriu 2 de 3 pontos-chave", contando como coberto o critério com todos os pontos, e o total de pontos na escala da rubrica ("5 de 8 pontos");
- cada critério da rubrica com o nome, a marca (coberto, em parte, faltou), os pontos e a justificativa;
- "Reescrever a resposta" (uma vez): reabre o texto com a resposta anterior para editar; a nova é corrigida do mesmo jeito e passa a ser a nota da questão; a primeira fica recolhida em "Primeira versão";
- "Ver a resposta-modelo": mostra a rubrica inteira (com as descrições) e a resposta-modelo, e encerra a questão (não dá mais para reescrever). Depois da reescrita, a resposta-modelo aparece sozinha.

A rubrica (descrições) e a resposta-modelo não aparecem antes de a questão ser encerrada; os nomes dos critérios aparecem na correção.

O `corretor.md` deixa de falar só de "diagnóstico" (a mesma correção serve aos dois); o hash dele muda, e os eventos registram o novo.

### "Não sei"

Em qualquer questão ainda não acabada: grava a resposta como não sabida (sem modelo) e mostra o que a questão mostraria no fim (o gabarito do quiz, a resposta esperada da pergunta, a rubrica e a resposta-modelo da dissertativa). Num quiz depois da primeira tentativa errada, "Não sei" acaba a questão como errada. Na pergunta e na dissertativa, "Não sei" só vale antes da primeira tentativa: depois dela, a pergunta espera a conferência (ou o corrigir, se falhou), e a dissertativa corrigida acaba pelo "Ver a resposta-modelo".

### Onde as respostas ficam

No próprio `<módulo>.json`, no campo `respostas`, pelo id do bloco (como as respostas do diagnóstico ficam no curso). Gerar o módulo de novo substitui o arquivo, e as respostas antigas saem com ele (os eventos ficam). Gravado inteiro, na trava da matéria.

```json
"respostas": {
	"l1-b5": { "tipo": "alternativa", "versao": 1, "confianca": 3, "tentativas": [
		{ "escolha": 2, "correta": false, "confusao": "…", "tempoMs": 41000, "em": "…", "evento": "…" },
		{ "escolha": 0, "correta": true, "tempoMs": 12000, "em": "…", "evento": "…" }
	] },
	"l1-b3": { "tipo": "verificacao", "versao": 1, "confianca": 2, "tentativas": [
		{ "texto": "…", "tempoMs": 30000, "em": "…", "avaliacao": "parcial", "retorno": "…", "modelo": "…", "custo": 0.002, "evento": "…" }
	] },
	"l2-b8": { "tipo": "dissertativa", "versao": 1, "confianca": 2, "tentativas": [
		{ "texto": "…", "tempoMs": 180000, "em": "…", "correcao": { "criterios": [{ "criterio": "…", "trechos": ["…"], "pontos": 1, "max": 2, "justificativa": "…" }], "total": 3, "max": 5, "modelo": "…", "custo": 0.01 }, "evento": "…" }
	], "encerradaEm": "…" },
	"l1-b9": { "tipo": "alternativa", "versao": 1, "naoSei": { "em": "…", "evento": "…" }, "tentativas": [] }
}
```

- `versao`: a versão do bloco respondida. Reescrever o bloco ("Reescrever este bloco") deixa a resposta antiga sem valor: a tela trata a questão como nova, e a próxima resposta substitui a antiga.
- Uma tentativa de pergunta ou dissertativa sem `avaliacao` ou sem `correcao` está sendo conferida, ou a conferência falhou (`corrigir` tenta de novo).
- `naoSei`: a questão acabou como não sabida (pode vir depois de tentativas).
- `encerradaEm` (dissertativa): "Ver a resposta-modelo" ou a segunda tentativa corrigida.

Quando a questão está **feita** (conta no progresso):
- quiz: acertou, errou duas vezes, ou "Não sei";
- pergunta: conferida, ou "Não sei";
- dissertativa: a primeira tentativa corrigida, ou "Não sei" (a reescrita é opcional).

### O progresso

Vem só das respostas (da versão atual de cada bloco): por lição, questões feitas de questões da lição; no módulo, a soma. Aqui, questão é pergunta, quiz ou dissertativa; o `questoes` que o estado já mandava (resumoDoModulo, o "Gerado" do card) conta só quizzes e dissertativas, e o `progresso.questoes` conta as três. A visão do módulo mostra o progresso de cada lição no índice ("3 de 5") e o do módulo no topo (o ProgressTrack do design system). O card do módulo na visão do curso diz "3 de 12 questões feitas". Concluir o módulo continua manual; quando todas as questões estão feitas, o pé da última lição diz "Você fez todas as questões." junto do "Concluir o módulo".

### Eventos (no `aprendiz/eventos.jsonl`)

Objeto `{materia, curso, modulo, licao, questao (o id do bloco), conceitos}`; contexto `{fase: "modulo", versao (do bloco), modelo (o do módulo), prompt (o do modulo-licao.md que gerou o bloco, nome e hash)}` e, quando há conferência pelo modelo, `corretor: {modelo, prompt, custo}` (o prompt com a metodologia, como no diagnóstico: "verificacao.md + metodo/pergunta.md", "corretor.md + metodo/dissertativa.md"). O modelo e o prompt do bloco são os do avaliou_bloco (docs/escrita.md): num bloco reescrito, o modelo e o prompt da reescrita que deu aquela versão (modulo-bloco.md com a metodologia):
- `respondeu_questao` (quiz), um por tentativa: resultado `{tentativa, escolha, correta, confusao?, confianca, tempoMs}`;
- `respondeu_verificacao`, quando a conferência chega: resultado `{texto, avaliacao, retorno, confianca, tempoMs}`;
- `respondeu_dissertativa`, quando a correção chega, um por tentativa: resultado `{tentativa, texto, total, max, criterios: [{criterio, pontos, max}], confianca, tempoMs}`;
- `nao_sabia_questao`: resultado `{tipo, tentativas}` (quantas tentativas havia antes).

### Ponte (painel "modulos")

Tela → extensão:
- `responder {materia, curso, modulo, pedido, bloco, confianca?, escolha?, texto?, naoSei?, tempoMs?}`: a extensão confere se a questão ainda aceita resposta (versão atual, não feita ou, na dissertativa, a reescrita ainda livre; no quiz, a escolha não repetida), grava a tentativa e manda o `modulo` com o pedido. No quiz, a tentativa já vai conferida. Na pergunta e na dissertativa, a mensagem leva `corrigindo: [bloco]` e a conferência chega depois num `modulo` sem pedido; se falhar, um `erro` sem pedido, com `ao: "corrigir"` e `bloco`;
- `corrigir {materia, curso, modulo, pedido, bloco}`: tenta de novo a conferência da última tentativa sem avaliação ou correção. Primeiro um `modulo` sem pedido, com `corrigindo`; o pedido vai no `modulo` com a conferência, ou no `erro` (`ao: "corrigir"`, com `bloco`). Uma questão sem tentativa esperando a conferência, ou que está sendo conferida agora, dá erro com o pedido;
- `encerrar {materia, curso, modulo, pedido, bloco}`: a dissertativa corrigida passa a encerrada ("Ver a resposta-modelo"); responde com o `modulo` com o pedido. Sem evento (o progresso não muda).

O erro da própria ação (sem confiança, escolha repetida, questão que já acabou ou que está sendo conferida) vem com o pedido, `ao` (`responder`, `corrigir` ou `encerrar`) e `bloco`. Depois de gravar uma resposta ou uma conferência, a extensão manda também o `estado` (sem pedido), com o progresso novo.

A mensagem `modulo` passa a levar `corrigindo` (os blocos em conferência agora, na ordem do módulo; vazio sem nenhum, nunca ausente) e o módulo com as `respostas`. O `estado` leva, por módulo gerado, `progresso: {feitas, questoes}`. As conferências vão fora da trava, como a correção do diagnóstico; o fim da sessão as cancela sem gravar. Se a resposta mudou enquanto era conferida (o módulo foi gerado de novo, ou o bloco reescrito), a conferência é jogada fora (nada gravado, nenhum evento; vai um `modulo` como está), e o bloco já sai do `corrigindo` assim que muda.

Os tipos e as funções puras que a tela usa ficam em `profiles/estudos/lib/modulo-respostas-tipos.ts` (a resposta que vale pela versão, a situação da questão, o que mostrar, o placar da dissertativa e o progresso); a gravação e os eventos, em `lib/modulo-respostas.ts`.

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
- Todo card não gerado tem a ação "Gerar módulo", que abre o formulário (Modal): a área de soltar materiais (vão para a matéria e entram no mapa), "Informações específicas" e "Observações" (TextArea), e a marcação "Ainda não tenho o material deste módulo" (troca o primário por "Marcar como aguardando material", com uma nota opcional). Um aviso diz o custo aproximado.
- Durante a geração, o card mostra a etapa ("Planejando as lições…", "Escrevendo a lição 2 de 4") e um "Parar".
- Gerado: o card diz "Gerado" com o número de lições e de questões, e a ação "Abrir" (parte B; na parte A, "Em breve"). "Gerar de novo" fica num menu do card, com confirmação.
- Aguardando material: o card com a etiqueta "Aguardando material" e a nota; com material novo, "Material novo: gerar agora?".
- Nenhum card fica bloqueado (ver "O card de cada módulo").
