// O que "Guardar na nota" escreve na nota (parte C1; docs/mesa-parte-c.md, seção 5). Puro
// e sem Node. Contrato escrito no WP0, implementado no WP1. A parte D usa o mesmo
// formato para as notas do professor (a marca "do professor" entra lá).
//
// O formato: uma citação em markdown com o texto do bloco, a linha de fonte e o id curto
// da conversa num comentário HTML, legível fora do app:
//
//     > texto do bloco
//     >
//     > — Professor, conversa de 11/11/2026
//     <!-- conversa:abc123 -->

export interface EntradaTrechoGuardado {
	/** O markdown do bloco como o professor escreveu. */
	texto: string;
	/** Quando o Breno clicou. */
	em: Date;
	/** O id da sessão do pi da conversa. */
	sessao: string;
}

/** Um UUID com hífens (o pi usa UUID v7 nos ids de sessão). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O id curto da conversa: 8 caracteres, estáveis para a mesma sessão. Num UUID v7 os
 * primeiros 12 dígitos são o relógio em milissegundos (duas conversas abertas no mesmo
 * minuto começam igual), então o id curto sai da parte aleatória, depois do dígito de
 * versão. Num id que não é UUID, vale o começo dele (só letras e números, em minúsculas).
 */
export function idCurtoDaConversa(sessao: string): string {
	if (UUID.test(sessao)) return sessao.replace(/-/g, "").toLowerCase().slice(13, 21);
	const limpo = sessao.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
	return limpo.slice(0, 8) || "semid";
}

const doisDigitos = (numero: number) => String(numero).padStart(2, "0");

/** dd/mm/aaaa no fuso local (a data que o Breno viu quando clicou). */
function dataLocal(data: Date): string {
	return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()}`;
}

/** O markdown que entra na nota, sem linhas em branco nas pontas. */
export function formatarTrechoGuardado(entrada: EntradaTrechoGuardado): string {
	const linhas = entrada.texto.replace(/\r\n?/g, "\n").split("\n");
	while (linhas.length > 0 && linhas[0]!.trim() === "") linhas.shift();
	while (linhas.length > 0 && linhas[linhas.length - 1]!.trim() === "") linhas.pop();
	// Toda linha do bloco ganha o "> ": listas, código e fórmulas ficam legíveis dentro da citação.
	// A linha em branco vira só ">", sem espaço sobrando no fim.
	const citadas = linhas.map((linha) => (linha.trim() === "" ? ">" : `> ${linha}`));
	const fonte = `> — Professor, conversa de ${dataLocal(entrada.em)}`;
	const comentario = `<!-- conversa:${idCurtoDaConversa(entrada.sessao)} -->`;
	return [...(citadas.length > 0 ? [...citadas, ">"] : []), fonte, comentario].join("\n");
}
