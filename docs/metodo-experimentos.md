# O ciclo do método com experimentos (2026-11-03)

Pedido do Breno: "Não gostei da ideia de aprovar, quero apenas que ele vá tentando ativamente corrigindo as coisas até chegar em um resultado, comparando os anteriores com os novos e ir vendo o que melhorou entre eles".

Decisões dele (2026-11-03):
- os ajustes do método entram sozinhos, sem aprovação, como experimentos;
- no máximo 2 experimentos em teste ao mesmo tempo, para dar para saber o que causou uma melhora;
- não há botão para desfazer um experimento: a análise decide.

Este documento muda partes de docs/metodo-ciclo.md:
- **Continuam valendo:** quando o relatório roda, a evidência, o mínimo de retorno, o arquivo do relatório e a ponte de `gerar_relatorio`.
- **Saem:** a aprovação (`decidir_proposta`) e o liga e desliga (`ligar_ajuste`).

Tudo é do perfil de estudos.

## A ideia

1. Cada módulo concluído ganha um placar, calculado pelo código a partir dos eventos. Não é o modelo que dá o placar.
2. Cada módulo gerado guarda quais experimentos estavam valendo na geração dele.
3. Ao concluir um módulo, a análise (o relatório) recebe o placar do módulo, o histórico dos módulos anteriores e os experimentos em teste. Para cada experimento, ela compara o antes e o depois e decide: manter, reescrever, descartar ou continuar testando.
4. Se ainda houver vaga (até 2 em teste), a análise propõe experimentos novos. Eles entram sozinhos e valem a partir do próximo módulo gerado.
5. A análise também registra o que facilita para o Breno (os aprendizados), com evidências. Ela pode confirmar ou contradizer um aprendizado registrado antes.

Um módulo só é evidência fraca, porque os módulos têm dificuldades diferentes. As regras abaixo impedem conclusões cedo demais.

## Os experimentos (os ajustes)

Os ajustes continuam em `aprendiz/metodo/<arquivo>.md`, com o mesmo formato. Só o estado no cabeçalho muda:

```markdown
# Ajustes do Breno para dissertativa.md

## a-20261103-1 · em teste
Antes de entregar uma dissertativa, …
<!-- origem: ciencia-de-dados/estudo-…/m1/p2 · evidências: 0000…, 0000… · começou em 2026-11-03 -->
```

Os estados:
- **`em teste`:** vale nas gerações; é um experimento.
- **`mantido`:** vale nas gerações; virou regra.
- **`descartado`:** não vale mais. Ajustes nunca são apagados.

Os estados antigos continuam sendo lidos:
- `ativo` é lido como `em teste`;
- `desligado` é lido como `descartado`.

O código grava sempre os estados novos. O comentário de origem antigo (`proposta: … · aprovado em …`) continua sendo lido. Os dois ajustes que o Breno aprovou no m1 viram, assim, os dois primeiros experimentos, sem migração.

Numa reescrita, o comentário do ajuste novo diz `reescrita de <arquivo>#<id>`, e o antigo fica `descartado` com `substituído por <id>` no comentário.

Um ajuste é identificado por `<arquivo>#<id>`, porque os ids se repetem entre arquivos (`a-20261103-1` existe em dois deles).

A frase que acompanha os ajustes nas gerações (`FRASE_DOS_AJUSTES`) passa a ser:

> Estes ajustes vieram do retorno do Breno. Os marcados "em teste" são experimentos: siga-os à risca, para que dê para medir o efeito deles. Todos valem acima do texto acima quando os dois conflitarem.

Cada ajuste vai no bloco com o estado dele, por exemplo `- (em teste) Antes de …`.

## O que o módulo guarda na geração

O `m<n>.json` ganha `ajustesUsados: [{arquivo, ajuste, estado}]`, com os ajustes `em teste` e `mantido` carregados na geração das lições. O evento `gerou_modulo` leva o mesmo no `contexto`. Os módulos sem o campo, gerados antes disto, contam como gerados sem experimentos.

A reescrita de um bloco não muda `ajustesUsados`.

## O placar

O placar é uma função pura, `placarDoModulo(eventos)`, sobre os eventos do aprendiz daquele módulo (`objeto.materia`, `curso` e `modulo`). Ele pode ser recalculado a qualquer hora. Cada número leva o `n` em que se baseia, para a análise e a tela verem o tamanho da amostra:
- **Quiz na 1ª tentativa:** acertos e total (`respondeu_questao` com `tentativa: 1`).
- **Perguntas (verificações):** pontos e total; certa vale 1, em parte 0,5 e errada 0 (`respondeu_verificacao`, a primeira de cada questão).
- **Dissertativas na 1ª tentativa:** soma de `total` e de `max` (`respondeu_dissertativa` com `tentativa: 1`).
- **"Não sabia":** quantos e de quantas questões. O denominador são as questões distintas com resposta ou com "Não sabia".
- **Questionário:** a média de cada nota (entendimento, clareza, exemplos, questões, ritmo; de 1 a 5) e quantas lições a avaliaram (`avaliou_licao`; vale a última de cada lição).
- **Feedback dos blocos:** quantos Ruim, Bom e Ótimo, contando a última nota de cada bloco (`avaliou_bloco`).
- **Pedidos de explicação** (`pediu_explicacao`) e **termos guardados** (`guardou_termo`), em número absoluto e por lição.
- **Calibração:** o Brier sobre os quizzes na 1ª tentativa e as verificações, com o `n`. A confiança vira probabilidade assim: 1 = 0,25, 2 = 0,5, 3 = 0,75 e 4 = 0,95. O acerto é 1, 0,5 ou 0. Menor é melhor.

Uma taxa sem amostra (`n = 0`) fica `null`, nunca 0.

### O histórico

O histórico é a lista dos módulos concluídos antes do atual, em todas as matérias e cursos, em ordem de `concluidoEm`, com no máximo os 8 últimos. Cada entrada leva:
- o curso e o módulo (ids e nomes);
- `concluidoEm`;
- `ajustesUsados`;
- o placar, recalculado dos eventos.

O histórico é derivado dos arquivos de módulo e dos eventos. Nada novo é gravado para ele.

## A análise (o relatório, versão 2)

Ela continua sendo `gerar_relatorio`, sozinha ao concluir, com o mesmo modelo, a mesma evidência e o mesmo mínimo de retorno.

A mensagem ao modelo ganha:
- **o placar do módulo atual** e **o histórico**, numa tabela de texto: uma linha por módulo e uma coluna por métrica, com os `n`;
- **os experimentos em teste:** para cada um, `<arquivo>#<id>`, o texto, quando começou e em quais módulos do histórico (e no atual) ele estava em `ajustesUsados`;
- **os ajustes mantidos**, para não serem repetidos;
- **as vagas:** `2 − (experimentos em teste)`;
- **os aprendizados registrados**, com o id, o estado e o texto.

O prompt `prompts/relatorio-metodo.md` é reescrito para isso:
- O papel deixa de dizer que o Breno aprova. Os ajustes entram sozinhos como experimentos, e a análise é quem decide sobre eles.
- **Como comparar:** comparar os módulos em que um experimento valeu com os módulos de antes. Olhar as métricas ligadas ao que o experimento quer mudar (um ajuste de dissertativa olha a nota das dissertativas, os "Não sabia" e o questionário), considerar o `n` e lembrar que os módulos têm dificuldades diferentes. Uma diferença pequena com `n` pequeno não decide nada.
- **As decisões:**
  - **manter**, quando melhorou de forma consistente;
  - **descartar**, quando piorou ou não mudou nada depois de testado;
  - **reescrever**, quando a ideia parece certa mas o texto não funcionou (por exemplo, o professor não o seguiu, ou ele foi vago);
  - **continuar**, na dúvida.
- O `porque` de cada decisão cita os números de antes e de depois.
- **Propostas:** no máximo o número de vagas, e as regras de antes valem (padrões, evidências, nada da matéria).
- **Aprendizados:** o que facilita para ele, escrito como observação ("Exemplos concretos antes da definição deixaram o entendimento mais alto: …"), com os números ou os eventos que o sustentam. Também pode confirmar ou contradizer um aprendizado registrado.
- O resumo fala com o Breno sobre o que foi comparado, o que mudou e o que a análise decidiu.

O formato da resposta:

```json
{
	"resumo": "…",
	"funcionou": [{ "texto": "…", "evidencias": ["…"] }],
	"problemas": [{ "texto": "…", "evidencias": ["…"] }],
	"experimentos": [{ "ajuste": "dissertativa.md#a-20261103-1", "decisao": "manter | reescrever | descartar | continuar", "texto": "só em reescrever", "porque": "…" }],
	"propostas": [{ "arquivo": "…", "ajuste": "…", "porque": "…", "evidencias": ["…", "…"] }],
	"aprendizados": [{ "texto": "…", "porque": "…", "evidencias": ["…"] }],
	"revisoes": [{ "aprendizado": "ap-…", "situacao": "confirmado | contradito", "porque": "…" }]
}
```

### O que o código confere

- **`experimentos`:**
  - só vale um experimento `em teste`, uma decisão por experimento;
  - um experimento em teste que ficou de fora recebe `continuar`, com o `porque` "A análise não decidiu sobre ele.";
  - `manter` exige que o experimento tenha valido em pelo menos 2 módulos concluídos, contando o atual;
  - `descartar` e `reescrever` exigem pelo menos 1;
  - abaixo disso, a decisão vira `continuar`, com um conserto anotado;
  - `reescrever` exige um `texto` de até 400 caracteres, diferente do atual;
  - `porque` vai até 400 caracteres.
- **`propostas`:**
  - as regras de antes valem (arquivo válido, até 400 e 300 caracteres, pelo menos 2 evidências do módulo);
  - uma proposta igual a um ajuste `em teste` ou `mantido` do mesmo arquivo sai;
  - entram, na ordem, até o número de vagas que sobrou depois das decisões (uma reescrita ocupa a vaga do experimento que substitui; um descartado ou mantido libera a dele);
  - as que passarem do limite vão para `paraDepois` no relatório, para a tela mostrar. Elas não entram depois sozinhas.
- **`aprendizados`:** no máximo 3 por análise, `texto` até 300 caracteres, `porque` até 300, e pelo menos 1 evidência do módulo. Um aprendizado igual a um registrado (a mesma forma de `mesmoAjuste`) sai.
- **`revisoes`:** o id precisa existir; `porque` vai até 300 caracteres.
- Os consertos não pedem uma nova tentativa ao modelo.

### Aplicar a análise

Logo depois de gravar o relatório pronto, o código aplica a análise, uma vez só, na trava dos ajustes:
- `manter` muda o estado para `mantido`.
- `descartar` muda para `descartado`.
- `reescrever` deixa o antigo `descartado` e acrescenta o texto novo `em teste`.
- `continuar` não muda nada.
- Cada proposta que entrou vira um ajuste `em teste`, com o comentário de origem.
- Cada aprendizado novo é acrescentado a `aprendiz/metodo/aprendizados.md`, e cada revisão muda o estado do aprendizado.

O relatório guarda o que foi aplicado: `aplicadoEm`, e em cada item o id criado ou alterado (`novo: "dissertativa.md#a-20261120-1"`). Se aplicar falhar no meio, o relatório guarda `erroAoAplicar` com a frase, e a tela mostra o erro. Não há nova tentativa automática, porque o que já foi aplicado está nos arquivos e nos eventos.

Gerar de novo um relatório que já tem `aplicadoEm` é erro ("A análise deste módulo já foi aplicada."). Os relatórios da versão 1, `pouco_retorno` ou que falharam continuam podendo ser gerados de novo.

O relatório `pouco_retorno` também guarda o placar, mas não chama o modelo e não muda nenhum experimento.

### Os eventos (no aprendiz, só de acréscimo)

- `iniciou_experimento_metodo`: objeto `{arquivo, ajuste, materia, curso, modulo, proposta}` (no caso de reescrita, `reescritaDe` em vez de `proposta`); resultado `{texto, evidencias}`.
- `decidiu_experimento_metodo`: objeto `{arquivo, ajuste, materia, curso, modulo}`; resultado `{decisao, porque, modulosTestados, novo?}`. Só para `manter`, `descartar` e `reescrever`.
- `registrou_aprendizado_metodo`: objeto `{aprendizado, materia, curso, modulo}`; resultado `{texto, porque, evidencias}`.
- `reviu_aprendizado_metodo`: objeto `{aprendizado, materia, curso, modulo}`; resultado `{situacao, porque}`.

Os eventos antigos (`aprovou_ajuste_metodo`, `rejeitou_ajuste_metodo` e `alterou_ajuste_metodo`) continuam valendo como histórico, e o código não grava mais nenhum deles.

### O relatório gravado (versão 2)

O relatório fica no mesmo arquivo, `cursos/<curso>/relatorios/<módulo>.json`, com `versao: 2`. Os campos de antes continuam (`resumo`, `funcionou`, `problemas`, `evidencias`…) e somam-se:
- `placar`, o do módulo;
- `comparacao`: para cada métrica, o valor atual, a média dos módulos do histórico e o `n` de cada um, para a tela mostrar sem calcular;
- `experimentos`: `[{ajuste, arquivo, texto, decisao, porque, modulosTestados, novo?, conserto?}]`;
- `propostas`: `[{id, arquivo, ajuste, porque, evidencias, novo}]`, as que entraram;
- `paraDepois`: as que ficaram de fora pelo limite;
- `aprendizados` e `revisoes`, com o que foi aplicado;
- `aplicadoEm` e `erroAoAplicar?`.

Um relatório da versão 1 continua sendo lido e desenhado como foi, com as propostas e as decisões, mas sem botões.

## O que facilita (os aprendizados)

Os aprendizados ficam em `aprendiz/metodo/aprendizados.md`:

```markdown
# O que facilita para o Breno

## ap-20261103-1 · observado
Exemplos concretos antes da definição deixaram o entendimento mais alto.
<!-- origem: ciencia-de-dados/estudo-…/m2 · evidências: 0000…, 0000… · registrado em 2026-11-03 -->
```

Os estados são `observado`, `confirmado` e `contradito`. O Breno pode editar o texto à mão. Um arquivo que não se lê vira erro na tela e não é sobrescrito, como os ajustes.

Os aprendizados `observado` e `confirmado` entram na geração das lições de um módulo (`modulo-licao`) e na reescrita de um bloco, no máximo os 10 mais recentes, num bloco `<o-que-facilita>` com a frase "O que já se observou que facilita o aprendizado do Breno. Use como orientação, não como regra." A análise recebe todos, com o estado.

O hash do prompt nos eventos inclui esse bloco, como já inclui os ajustes.

## A tela

**Relatório, no pé da última lição.** Os estados "gerando", "falhou" e "pouco retorno" ficam como estão. Um relatório pronto da versão 2 mostra, nesta ordem:
- o resumo;
- **"Placar do módulo":** uma tabela curta com a métrica, este módulo e a média dos anteriores. Uma métrica sem amostra mostra "—", e o `n` vem em texto pequeno. Com nenhum módulo antes, a coluna da média some;
- **"Experimentos":** um cartão por experimento decidido nesta análise, com:
  - a etiqueta do arquivo;
  - o texto;
  - a decisão em destaque ("Mantido: virou regra", "Descartado", "Reescrito", "Continua em teste");
  - "testado em: m2, m3";
  - o porquê;
  - na reescrita, o texto novo;
- **"Novos experimentos":** as propostas que entraram, cada uma com "Começa no próximo módulo", o porquê e as evidências recolhidas;
- **"Ficou para depois":** as de fora pelo limite, em tom apagado, só para leitura;
- **"O que facilita":** os aprendizados novos e as revisões;
- **"O que funcionou"** e **"O que não funcionou"**, como estão.

Não há botão de decisão. Se aplicar tiver falhado, a frase de erro aparece no topo do relatório.

**Card do módulo, na visão do curso.** "Gerando o relatório…" ou "Relatório pronto · 2 experimentos em teste". O número de experimentos em teste é o atual e vem no `estado`.

**Modal "Como o professor escreve".** A seção "Ajustes do método" passa a se chamar "Experimentos do método" e é só para leitura:
- três grupos: "Em teste", "Mantidos" e "Descartados", cada ajuste com o texto, a etiqueta do arquivo e a origem;
- um grupo "O que facilita", com os aprendizados e o estado de cada um;
- a frase "A análise de cada módulo concluído decide sobre os experimentos e registra o que facilita para você.".

## Ponte (painel "modulos")

- `gerar_relatorio` fica como está. O relatório que chega já vem aplicado.
- `decidir_proposta` e `ligar_ajuste` saem: a extensão não as aceita mais (erro de ação desconhecida), e a tela não as chama.
- `listar_ajustes` responde `ajustes {arquivos: [{arquivo, ajustes: [{id, texto, estado, origem}], erro?}], aprendizados: {itens: [{id, texto, situacao, origem}], erro?}, pedido}`.
- O `estado` leva, por módulo concluído, o `relatorio` como hoje (sem `pendentes`), e no topo `experimentosEmTeste: number`.
