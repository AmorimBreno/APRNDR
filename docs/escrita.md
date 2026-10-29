# Escrita dos módulos: regras e retorno (2026-10-28)

Pedido do Breno: dar retorno sobre a escrita dos módulos e ver a escrita melhorar. Decisão dele em 2026-10-28: fazer agora (1) as regras de escrita dele e (2) o retorno em cada bloco, com "Reescrever este bloco"; (3) as propostas de regra a partir dos retornos ficam para o item 9 (memória do aprendiz), usando os retornos guardados como evidência.

Tudo isto é do perfil de estudos.

## 1. Regras de escrita

Instruções fixas do Breno sobre como o conteúdo gerado deve ser escrito (ESPECIFICACAO 13.5: regras ditas por ele são instruções fixas, não hipóteses do perfil do aprendiz; por isso não precisam de evidência). Ficam na pasta de dados, nunca no repositório: `aprendiz/escrita.json`, gravado inteiro de uma vez (lib/arquivos.ts).

```json
{
	"versao": 1,
	"regras": [
		{ "id": "r-…", "texto": "Sempre um exemplo com dados reais antes da definição.", "materia": null, "ativa": true, "criadaEm": "…", "alteradaEm": "…", "origem": "escrita" }
	]
}
```

- `materia`: null = vale para todas as matérias; um id = só para aquela matéria.
- `ativa`: dá para desligar sem apagar.
- `origem`: `escrita` (escrita na tela de regras) ou `retorno` (criada a partir de um retorno de bloco; leva `retorno` com o id do evento).
- Texto de 1 a 300 caracteres; no máximo 30 regras ativas que valem para uma matéria (as globais e as dela).

Onde valem: na geração dos módulos (plano, lições e a reescrita de um bloco) e nas questões do diagnóstico. A mensagem ao modelo leva uma seção "Regras de escrita do Breno (obedeça sempre)" com as regras ativas que valem para a matéria, na ordem; o prompt diz que elas valem acima das orientações gerais de estilo, mas nunca acima das regras de formato do JSON e das referências.

Eventos (no `aprendiz/eventos.jsonl`): `criou_regra_escrita`, `alterou_regra_escrita` (texto, matéria ou ativa), `apagou_regra_escrita`; objeto `{regra, materia?}`; resultado com o texto e o que mudou. O arquivo é só a versão atual; o histórico está nos eventos.

## 2. Retorno em cada bloco

Na visão do módulo, cada bloco tem "Feedback" (desde a parte 3 do plano de 2026-10-28; antes, "Retorno"): as notas rápidas Ruim, Bom e Ótimo e o "Detalhar", que abre este retorno (docs/modulos.md, "O feedback"). No retorno detalhado, o Breno escolhe:
- a avaliação: `ruim`, `bom` ou `otimo` (os eventos antigos têm `bom` ou `melhorar`; `melhorar` vale como `ruim`);
- os motivos (vários, opcionais): `longo`, `abstrato`, `faltou_exemplo`, `codigo_sem_explicacao`, `pulou_passo`, `repetitivo`, `confuso`, `nivel_errado` (fácil ou difícil demais para ele), `erro` (algo errado no conteúdo);
- um texto livre (opcional, até 1000 caracteres).

Grava o evento `avaliou_bloco` no `aprendiz/eventos.jsonl`: objeto `{materia, curso, modulo, licao, bloco, tipo, conceitos}`; resultado `{avaliacao, motivos, texto}`; contexto `{modelo, prompt (nome e hash do prompt que gerou o bloco), versao}` (a versão do bloco: 1 na geração, mais 1 a cada reescrita). Um bloco pode receber vários retornos; todos ficam.

Com o retorno, duas opções:
- "Virar regra de escrita": cria uma regra com o texto do retorno (editável antes de salvar), global ou da matéria, `origem: "retorno"`. É o Breno escrevendo a regra, então vale como instrução fixa.
- "Reescrever este bloco": gera de novo só aquele bloco, com o retorno.

### Reescrever um bloco

`prompts/modulo-bloco.md` (`model: openrouter/openai/gpt-6.1-sol`). A mensagem leva: a lição (título, objetivo, conceitos e os outros blocos, para o bloco novo encaixar), o bloco atual, o retorno (avaliação, motivos e texto), os níveis dos conceitos, os trechos do material dos conceitos do bloco (como na lição), o escopo e o motivo do curso e as regras de escrita. Devolve um bloco do mesmo tipo, validado pelas mesmas regras da lição (referências, questões, formato da explicação; o formato pode mudar se o retorno pedir, por exemplo `nivel_errado`); uma nova tentativa com JSON inválido.

No arquivo do módulo, o bloco novo entra no lugar do antigo com `versao` + 1 e `reescritoEm`; o antigo vai para `anteriores` do próprio bloco (o bloco inteiro, com `substituidoEm` e o id do evento de retorno que pediu a reescrita). O id do bloco não muda. Evento `reescreveu_bloco` no `aprendiz/eventos.jsonl`: objeto como o do retorno; resultado `{de: versão, para: versão, retorno: id do evento}`; contexto `{modelo, prompt, custo}`. É o par de preferência da seção 9.8 (a versão nova pedida pelo Breno contra a anterior).

## Ponte

Painel `escrita`, atendido pela extensão dos módulos (`extensions/modulos.ts`), que é a única que grava o `escrita.json`, numa trava só (o retorno com "Virar regra" também grava nele): `listar {}` → `regras {regras}`; `salvar {pedido, regra: {id?, texto, materia, ativa}}`; `apagar {pedido, id}`; mensagens `regras` e `erro`.

Painel `modulos` (a extensão dos módulos): `retorno {materia, curso, modulo, licao, bloco, pedido, avaliacao, motivos, texto, virarRegra?: {texto, materia}, detalha?}` (grava o evento e, com virarRegra, a regra; desde a parte 3, também a nota em `feedback` e o `detalha`: docs/modulos.md, "O feedback") e `reescrever_bloco {materia, curso, modulo, licao, bloco, pedido, retorno}` (o id do evento de retorno); o estado do módulo mostra `reescrevendo: {licao, bloco}` enquanto isso; no fim, a mensagem `modulo` com o módulo novo.

## A tela

- Tela de cadernos: uma tecla "Escrita" no pé (junto de Materiais e Conversa geral) abre "Como o professor escreve": a lista das regras (texto editável no lugar, a matéria — Todas ou uma — num seletor, ligar e desligar, apagar com confirmação), "Regra nova", e uma linha explicando: "Estas regras valem em todo módulo e em toda questão que o professor gerar. Um retorno num bloco também pode virar regra."
- Visão do módulo: no pé de cada bloco, um Button ghost pequeno "Retorno" abre um balão (ou modal pequeno) com Bom / Precisa melhorar, os motivos em etiquetas marcáveis, o texto, a marcação "Virar regra de escrita" (com o texto editável e Todas as matérias / esta matéria) e os botões "Salvar retorno" e "Salvar e reescrever o bloco". Durante a reescrita, o bloco mostra "Reescrevendo…" com a foto do professor; depois, o bloco novo com uma etiqueta discreta "Reescrito" e "Ver a versão anterior" (mostra a anterior recolhida, só para leitura).
- A visão do módulo também tem, no índice, o link "Como o professor escreve".
