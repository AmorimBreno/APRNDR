// Plugin do Vite (só no pnpm dev): a página não recarrega quando a conexão do Vite cai e volta sem o servidor
// ter reiniciado (fechar a tampa do notebook, a rede caindo).
//
// O cliente do Vite, quando a conexão dele com o servidor cai, espera o servidor responder de novo e então chama
// location.reload(), sempre. Ao acordar o notebook isso piscava a tela toda e jogava fora o que estava só na tela
// (os materiais desmarcados de um curso, um texto por salvar). Aqui o cliente passa a recarregar só se o servidor
// do Vite é outro: cada servidor tem um id (sorteado quando ele sobe, em /__servidor-id) e o cliente compara o id
// de agora com o de quando a página abriu. Servidor reiniciado = id novo = recarrega, como antes (o código pode ter
// mudado). Mesmo servidor = não recarrega; os dados voltam sozinhos pela reconexão do app (packages/ui).
//
// O remendo troca um trecho do client.mjs do Vite 8.3.2. Se o trecho não for achado (outra versão do Vite), nada
// muda e o Vite se comporta como sempre; o aviso no terminal diz isso.

import { randomUUID } from "node:crypto";
import type { Plugin } from "vite";

export const ROTA_ID_DO_SERVIDOR = "/__servidor-id";

/** O trecho do cliente do Vite que espera o servidor voltar e recarrega. */
const RECARGA_DO_VITE = /await waitForSuccessfulPing\(url\.href\);\s*location\.reload\(\);/;

/** O que entra no lugar: espera igual, mas só recarrega se o servidor mudou (ou se não deu para saber). */
const SO_SE_O_SERVIDOR_MUDOU = "await waitForSuccessfulPing(url.href); await __recarregarSeOServidorMudou();";

const AJUDANTE = `
const __idDoServidorAoAbrir = fetch(${JSON.stringify(ROTA_ID_DO_SERVIDOR)}, { cache: "no-store" }).then((resposta) => resposta.text()).catch(() => undefined);
async function __recarregarSeOServidorMudou() {
	const antes = await __idDoServidorAoAbrir;
	let agora;
	try {
		agora = await (await fetch(${JSON.stringify(ROTA_ID_DO_SERVIDOR)}, { cache: "no-store" })).text();
	} catch {
		agora = undefined;
	}
	if (!antes || !agora || antes !== agora) location.reload();
	else console.log("[vite] conexão de volta, o servidor é o mesmo: a página não recarrega.");
}
`;

/** O código do cliente do Vite remendado, ou undefined se o trecho esperado não está nele. */
export function remendarClienteDoVite(codigo: string): string | undefined {
	if (!RECARGA_DO_VITE.test(codigo)) return undefined;
	return codigo.replace(RECARGA_DO_VITE, SO_SE_O_SERVIDOR_MUDOU) + AJUDANTE;
}

const ehClienteDoVite = (id: string) => /vite[\\/]dist[\\/]client[\\/]client\.mjs$/.test(id.split("?")[0] ?? id);

export function semRecarregarAoVoltar(): Plugin {
	const idDoServidor = randomUUID();
	return {
		name: "estudos:sem-recarregar-ao-voltar",
		apply: "serve",
		configureServer(servidor) {
			servidor.middlewares.use(ROTA_ID_DO_SERVIDOR, (_pedido, resposta) => {
				resposta.setHeader("Cache-Control", "no-store");
				resposta.setHeader("Content-Type", "text/plain");
				resposta.end(idDoServidor);
			});
		},
		transform(codigo, id) {
			if (!ehClienteDoVite(id)) return undefined;
			const remendado = remendarClienteDoVite(codigo);
			if (remendado === undefined) {
				this.warn("o cliente do Vite mudou: o remendo que evita recarregar a página ao voltar da suspensão não foi aplicado.");
				return undefined;
			}
			return { code: remendado, map: null };
		},
	};
}
