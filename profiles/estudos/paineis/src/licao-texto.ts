// O texto de uma lição para o professor da mesa de estudo, com o olho aberto
// (ESPECIFICACAO.md 13.19; docs/mesa-de-estudo.md, 2.7). Puro e sem React.
//
// Contrato escrito no WP0; implementado no WP6 até licao-texto.test.ts passar.
//
// Formato (blocos separados por uma linha em branco, na ordem da lição):
//   # <título>
//   Objetivo: <objetivo>
//   explicação: o texto; com complemento, a linha "(Complemento: vai além do material.)" depois
//   ideia central: "Ideia central: <texto>"
//   verificação: "Pergunta rápida: <pergunta>"
//   alternativa: "Questão: " + o contexto (se houver) e o enunciado, separados por uma linha
//     em branco, e depois uma alternativa por linha: "a) <texto>", "b) <texto>"…
//   dissertativa: "Questão dissertativa: " + o contexto (se houver) e o enunciado, como acima
//   Depois de cada bloco, cada explicação pedida já respondida desta lição e
//   deste bloco, na versão atual do bloco, na ordem de `explicacoes`:
//     Explicação pedida sobre "<trecho>": <explicação>
//
// Nunca entram: o gabarito (correta, confusao e a explicacao da alternativa),
// respostaEsperada, rubrica, respostaModelo, as referências, as versões
// anteriores dos blocos nem as respostas do Breno.

import type { Licao } from "../../lib/modulo-tipos.ts";
import type { ExplicacaoPedida } from "../../lib/termos-tipos.ts";

export function textoDaLicao(licao: Licao, explicacoes?: readonly ExplicacaoPedida[]): string {
	void licao;
	void explicacoes;
	throw new Error("licao-texto: a implementar no WP6");
}
