# O ciclo do método: relatório e ajustes (parte 4 do plano de 2026-10-28)

> Mudou em 2026-11-03: a aprovação e o liga e desliga saíram. Os ajustes agora são experimentos que a análise de cada módulo decide sozinha. Veja docs/metodo-experimentos.md, que vale acima deste documento onde os dois diferem.

Pedido do Breno: o professor aprende a ensinar melhor com o retorno dele. Quando um módulo é concluído, o professor lê o que o Breno deixou nele e propõe ajustes à metodologia. Cada proposta cita eventos e o Breno aprova ou rejeita uma a uma.

Decisões dele (2026-11-03):
- o relatório é gerado sozinho ao concluir o módulo;
- o modelo é o GPT-6.1 Sol;
- há um relatório por módulo, não por lição.

Tudo é do perfil de estudos.

## Quando roda

Concluir o módulo (`concluir`, docs/modulos.md) grava a conclusão como hoje e, logo depois, sem esperar, começa o relatório daquele módulo. O relatório é uma chamada ao modelo, fora da trava, com cancelamento no fim da sessão e uma nova tentativa com JSON inválido.

Ele não roda quando o módulo tem pouca evidência: menos de 3 eventos de retorno no módulo. Contam como retorno `avaliou_bloco`, `avaliou_licao`, `pediu_explicacao` e `nao_sabia_questao`. Nesse caso, o relatório é gravado sem chamar o modelo, com `situacao: "pouco_retorno"`, e a tela diz "Pouco retorno neste módulo para propor ajustes.".

Um módulo concluído antes desta parte, ou cujo relatório falhou, tem a ação `gerar_relatorio`, que a tela mostra como "Gerar o relatório do método". Ela também vale para gerar de novo; nesse caso, o relatório anterior é substituído e as decisões já tomadas ficam nos eventos.

## A evidência

O código monta a evidência a partir do `aprendiz/eventos.jsonl`, com os eventos daquele módulo (`objeto.materia`, `objeto.curso` e `objeto.modulo`):
- `avaliou_bloco`;
- `reescreveu_bloco`;
- `avaliou_licao`;
- `respondeu_questao`;
- `respondeu_verificacao`;
- `respondeu_dissertativa`;
- `nao_sabia_questao`;
- `pediu_explicacao`;
- `guardou_termo`.

Cada evento vira uma linha curta com o id: o verbo, a lição e o bloco, o tipo e o formato do bloco, o arquivo de metodologia daquele tipo de bloco (`arquivoDeMetodo`), e o resultado resumido. Por exemplo:
- "Feedback Ruim, motivos longo e abstrato, texto: …";
- "quiz errado na 1ª, confiança 4, confusão: …";
- "Não sei o que é isso: «radicais»".

A mensagem leva:
- as linhas dos eventos, até uns 30 mil caracteres, priorizando os de retorno;
- para os blocos com retorno Ruim ou com pedido de explicação, o começo do texto do bloco, até 600 caracteres cada;
- a metodologia atual, com os arquivos base e os ajustes ativos;
- as regras de escrita do Breno;
- o título e os objetivos das lições do módulo.

## O prompt

O prompt é `prompts/relatorio-metodo.md`, com `model: openrouter/openai/gpt-6.1-sol`. Ele contém só o papel, o que recebe, as regras e o formato.

As regras:
- olhar padrões, não um caso isolado;
- toda afirmação e toda proposta citam os ids dos eventos que a sustentam;
- uma proposta é uma instrução curta e acionável para um arquivo de metodologia, no estilo dele, e não repete o que a base ou um ajuste ativo já diz;
- no máximo 5 propostas;
- não propor nada sobre o conteúdo da matéria, só sobre como ensinar;
- respeitar as regras de escrita do Breno, porque elas são instruções dele e não são reabertas.

O formato:

```json
{
	"resumo": "markdown, até 1500 caracteres",
	"funcionou": [{ "texto": "…", "evidencias": ["ev-…"] }],
	"problemas": [{ "texto": "…", "evidencias": ["ev-…"] }],
	"propostas": [{ "arquivo": "exemplos.md", "ajuste": "…", "porque": "…", "evidencias": ["ev-…", "ev-…"] }]
}
```

O código confere:
- `arquivo` é um dos arquivos de `profiles/estudos/metodo/`;
- `ajuste` tem até 400 caracteres e `porque` até 300;
- as evidências são ids da evidência mandada. Os ids que não estão nela saem;
- uma proposta precisa de pelo menos 2 eventos diferentes, e um item de `funcionou` ou `problemas` precisa de pelo menos 1. O que fica abaixo disso sai, como um conserto, sem nova tentativa;
- uma proposta igual a um ajuste ativo do mesmo arquivo sai. A igualdade é medida sem acento, sem caixa e sem espaços.

## O relatório gravado

O relatório fica em `materias/<matéria>/cursos/<curso>/relatorios/<módulo>.json`, na pasta de dados, gravado inteiro de uma vez, na trava da matéria:

```json
{
	"versao": 1,
	"modulo": "m1",
	"situacao": "pronto",
	"geradoEm": "…", "modelo": "…", "custo": 0.06, "prompt": { "nome": "relatorio-metodo.md", "hash": "…" },
	"eventosLidos": 42,
	"resumo": "…",
	"funcionou": [{ "texto": "…", "evidencias": ["…"] }],
	"problemas": [{ "texto": "…", "evidencias": ["…"] }],
	"propostas": [
		{ "id": "p1", "arquivo": "exemplos.md", "ajuste": "…", "porque": "…", "evidencias": ["…"],
		  "decisao": { "tipo": "aprovada", "texto": "…(o texto final, editado ou não)", "em": "…", "evento": "…", "ajuste": "a-…" } }
	]
}
```

- `situacao` é `pronto` ou `pouco_retorno`. Enquanto o relatório é gerado, ou quando ele falha, o estado fica só na extensão; um relatório que falhou não deixa arquivo.
- `decisao.tipo` é `aprovada` ou `rejeitada`; numa rejeitada, vai o `motivo` opcional, de até 300 caracteres.

Na matéria, o evento `gerou_relatorio_metodo`: objeto `{materia, curso, modulo}`; resultado `{situacao, propostas, custo}`; contexto `{modelo, prompt}`.

## Os ajustes aprovados

Os ajustes ficam em `aprendiz/metodo/<arquivo>.md`, na pasta de dados, com um arquivo por arquivo de metodologia (por exemplo, `aprendiz/metodo/exemplos.md`). O arquivo é gravado inteiro pelo código e legível para o Breno:

```markdown
# Ajustes do Breno para exemplos.md

## a-20261103-1 · ativo
Antes do código de um exemplo, diga em uma frase o que ele vai mostrar.
<!-- proposta: m1/p1 · evidências: ev-…, ev-… · aprovado em 2026-11-03 -->
```

O cabeçalho `## <id> · ativo` (ou `· desligado`) separa os ajustes. O texto vai até o comentário. O código lê e grava neste formato, e o Breno pode editar o texto à mão. Um arquivo que não se lê vira erro na tela e não é sobrescrito.

As ações:
- `decidir_proposta {materia, curso, modulo, pedido, proposta, decisao: "aprovar" | "rejeitar", texto?, motivo?}`:
  - aprovar acrescenta o ajuste (com o `texto` editado, quando vier) e grava o evento `aprovou_ajuste_metodo` no aprendiz, com objeto `{arquivo, ajuste, materia, curso, modulo, proposta}` e resultado `{texto, editado, evidencias}`;
  - rejeitar grava `rejeitou_ajuste_metodo`, com resultado `{motivo}`;
  - a decisão vai para o relatório. Uma proposta já decidida dá erro.
- `ligar_ajuste {pedido, arquivo, ajuste, ativo}` liga ou desliga um ajuste e grava o evento `alterou_ajuste_metodo`. Ajustes não são apagados.
- `listar_ajustes {}` devolve a mensagem `ajustes {arquivos: [{arquivo, ajustes: [{id, texto, ativo, origem}]}]}`.

Os ajustes valem nas gerações: toda chamada que carrega um arquivo de metodologia (`lerMetodo`, nas lições, na reescrita, na marcação de termos, na explicação de um trecho, no diagnóstico e no corretor) carrega também os ajustes ativos daquele arquivo. Eles vão logo depois da base, como `<ajustes-do-breno arquivo="exemplos.md">`, com a frase "Estes ajustes foram aprovados pelo Breno a partir do retorno dele e valem acima do texto acima quando os dois conflitarem.". O hash do prompt nos eventos passa a incluir os ajustes, porque uma mudança neles muda o hash.

## A tela

Na visão do módulo concluído, no pé da última lição (onde estava o "Concluir o módulo"), e com um link no índice, "Relatório do método", aparece o relatório:
- gerando: "O professor está lendo o seu retorno…", com o professor em bolha no humor 3;
- falhou: o erro e "Tentar de novo";
- pouco retorno: a frase e "Gerar mesmo assim", que chama `gerar_relatorio` com `forcar: true`;
- pronto:
  - o resumo;
  - "O que funcionou" e "O que não funcionou", com as evidências recolhidas embaixo de cada item. Cada evidência mostra a linha curta legível do evento e, ao clicar, leva ao bloco;
  - as propostas, num cartão cada, com:
    - a etiqueta do arquivo (por exemplo, "Exemplos");
    - o ajuste em destaque;
    - o porquê;
    - as evidências recolhidas;
    - "Aprovar", "Editar e aprovar" (abre o texto para editar) e "Rejeitar" (com um motivo opcional);
    - depois de decidida, a proposta mostra a decisão ("Aprovada em 03/11" ou "Rejeitada"), com o texto final.

No card do módulo concluído, na visão do curso, uma linha: "Relatório: 2 propostas para decidir", "Relatório pronto" ou "Gerando o relatório…".

No modal "Como o professor escreve", uma seção nova, "Ajustes do método", traz:
- os ajustes por arquivo, cada um com o texto, a origem ("do módulo 01") e "Ligado/Desligado";
- a frase "Estes ajustes vieram dos relatórios dos módulos e entram em toda geração.".

## Ponte (painel "modulos")

As ações `gerar_relatorio {materia, curso, modulo, pedido, forcar?}`, `decidir_proposta`, `ligar_ajuste` e `listar_ajustes` vão com pedido, como as outras.

A mensagem `modulo` de um módulo concluído leva `relatorio` (o JSON gravado, ou null) e `relatorioGerando: boolean`. Cada evidência leva `{id, linha, licao, bloco}`, para a tela desenhar sem ler eventos.

O `estado` leva, por módulo concluído, `relatorio: {situacao: "gerando" | "pronto" | "pouco_retorno" | "erro" | "nenhum", pendentes}`. `pendentes` conta as propostas sem decisão.

O `erro` leva `ao` (`gerar_relatorio`, `decidir_proposta` ou `ligar_ajuste`).

### Detalhes da ponte, como ficaram na extensão

- `concluir` responde como hoje (o `estado` com o pedido, já com `relatorio: {situacao: "gerando"}` no módulo) e dispara o relatório sem esperar. O módulo concluído vai antes, em uma mensagem `modulo` sem pedido, com `relatorioGerando: true`.
- `gerar_relatorio` responde com a mensagem `modulo` com o pedido (com `relatorioGerando: true`). O relatório pronto chega depois, em uma mensagem `modulo` sem pedido. Se falhar, chega um `erro` sem pedido, com `ao: "gerar_relatorio"`, `materia`, `curso` e `modulo`. Os erros de antes de começar (módulo não concluído, relatório que não se lê, relatório já sendo gerado) vão com o pedido.
- A mensagem `modulo` leva também `relatorioErro` (a frase da última tentativa que falhou, ou do arquivo do relatório que não se lê), até a próxima tentativa. O `estado` mostra `relatorio.situacao: "erro"` com `mensagem` nesses dois casos.
- Se gerar de novo falhar, o relatório anterior fica no disco; só um relatório novo que deu certo o substitui.
- `decidir_proposta` responde com a mensagem `modulo` com o pedido, com a decisão no `relatorio`. O `estado` (com os `pendentes`) vai logo depois, sem pedido. Com o relatório sendo gerado de novo, é erro. O `erro` leva `proposta`.
- `ligar_ajuste` e `listar_ajustes` não levam matéria nem curso, e respondem com `ajustes {arquivos, pedido}`: só os arquivos com algum ajuste ou que não se leem (estes com `erro`, a frase). O `erro` de `ligar_ajuste` leva `arquivo` e `ajuste`. `ligar_ajuste` num ajuste que já está no estado pedido não grava nada e não gera evento.
- Aprovar um texto igual (sem acento, caixa e espaços) a um ajuste ativo do mesmo arquivo não acrescenta outro ajuste: a decisão aponta para o que já existe.
- Os arquivos de ajustes têm uma trava só, que pode ser tomada dentro da trava de uma matéria, nunca o contrário.
