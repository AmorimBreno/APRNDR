// Só este computador fala com o servidor (achado do code-review de 2026-11-24): o Node escuta em
// todas as interfaces, então um aparelho da mesma rede chegaria na porta 7431; e uma página
// qualquer aberta no navegador poderia abrir o WebSocket e mandar mensagens ao professor (que
// gastam créditos do OpenRouter, como a transcrição e as imagens). As duas regras ficam aqui,
// puras, e o index.ts as aplica no HTTP e no upgrade do WebSocket.

/** O endereço de quem conectou é deste computador (IPv4, IPv6 ou IPv4 mapeado em IPv6)? */
export function ehEnderecoLocal(endereco: string | undefined): boolean {
	if (!endereco) return false;
	const limpo = endereco.toLowerCase();
	return limpo === "::1" || limpo.startsWith("127.") || limpo.startsWith("::ffff:127.");
}

/**
 * A origem de um pedido de WebSocket pode falar com o servidor? Sem Origin (um script local, o
 * lançador, os testes), pode; com Origin, só páginas deste computador (o front do Vite, a janela
 * do Electron, uma cópia do front noutra porta para testes): localhost, 127.0.0.1 ou [::1].
 */
export function origemPermitida(origem: string | undefined): boolean {
	if (origem === undefined || origem === "") return true;
	try {
		const { protocol, hostname } = new URL(origem);
		if (protocol !== "http:" && protocol !== "https:") return false;
		return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
	} catch {
		return false;
	}
}
