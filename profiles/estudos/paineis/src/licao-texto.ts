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

import { versaoDoBloco, type Bloco, type Licao } from "../../lib/modulo-tipos.ts";
import type { ExplicacaoPedida } from "../../lib/termos-tipos.ts";

export function textoDaLicao(licao: Licao, explicacoes?: readonly ExplicacaoPedida[]): string {
	const partes: string[] = [`# ${licao.titulo}\nObjetivo: ${licao.objetivo}`];
	for (const bloco of licao.blocos) {
		partes.push(textoDoBloco(bloco));
		for (const pedido of explicacoesDoBloco(licao, bloco, explicacoes ?? [])) {
			partes.push(`Explicação pedida sobre "${pedido.trecho}": ${pedido.explicacao}`);
		}
	}
	return partes.join("\n\n");
}

// Só as explicações desta lição, deste bloco e da versão atual: as de versões
// antigas falam de um texto que o Breno já não vê.
function explicacoesDoBloco(licao: Licao, bloco: Bloco, explicacoes: readonly ExplicacaoPedida[]): (ExplicacaoPedida & { explicacao: string })[] {
	return explicacoes.filter(
		(pedido): pedido is ExplicacaoPedida & { explicacao: string } =>
			pedido.licao === licao.id &&
			pedido.bloco === bloco.id &&
			pedido.versao === versaoDoBloco(bloco) &&
			typeof pedido.explicacao === "string" &&
			pedido.explicacao.trim() !== "",
	);
}

function textoDoBloco(bloco: Bloco): string {
	switch (bloco.tipo) {
		case "explicacao":
			return bloco.complemento ? `${bloco.texto}\n(Complemento: vai além do material.)` : bloco.texto;
		case "verificacao":
			return `Pergunta rápida: ${bloco.pergunta}`;
		case "ideia_central":
			return `Ideia central: ${bloco.texto}`;
		case "alternativa": {
			const alternativas = bloco.alternativas.map((alternativa, indice) => `${String.fromCharCode(97 + indice)}) ${alternativa.texto}`);
			return `Questão: ${enunciadoComContexto(bloco.contexto, bloco.enunciado)}\n${alternativas.join("\n")}`;
		}
		case "dissertativa":
			return `Questão dissertativa: ${enunciadoComContexto(bloco.contexto, bloco.enunciado)}`;
	}
}

function enunciadoComContexto(contexto: string | undefined, enunciado: string): string {
	return contexto ? `${contexto}\n\n${enunciado}` : enunciado;
}
