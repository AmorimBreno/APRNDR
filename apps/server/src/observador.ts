// Watcher da edição ao vivo (ESPECIFICACAO 3): observa profiles/ e as
// extensões globais do pi (~/.pi/agent/extensions). Quando algo muda, espera
// a calmaria (uns 300 ms depois da última mudança) e recarrega a janela de
// cada perfil afetado. As extensões globais valem para todos os perfis abertos.
// Mudança num profile.json (ou pasta de perfil nova) também relê a lista.
//
// Por que fs.watch recursivo e não o chokidar: no Windows o Node implementa o
// modo recursivo com ReadDirectoryChangesW, um único handle para a árvore
// inteira, sem polling. O chokidar 4+ usa o mesmo fs.watch por baixo; o que
// ele acrescentaria (filtrar node_modules e conferir a data de modificação)
// cabe em poucas linhas aqui, sem mais uma dependência.
//
// A conferência da data é necessária: o libuv pede ao Windows também os
// avisos de último acesso (FILE_NOTIFY_CHANGE_LAST_ACCESS), então o pi só
// LER o AGENTS.md ou listar as extensões ao montar a sessão já gera eventos
// (visto no teste: uma recarga no meio da primeira resposta, que a abortou).
// Por isso cada evento passa pela ReferenciaArquivos: só conta se o arquivo
// apareceu, sumiu ou mudou de data de modificação ou de tamanho. Pastas que
// já existiam nunca contam (o aviso real vem pelo arquivo de dentro).

import { existsSync, type FSWatcher, watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Janelas } from "./janelas.ts";
import type { Log } from "./log.ts";

interface Marca {
	mtimeMs: number;
	tamanho: number;
	pasta: boolean;
}

/** Data de modificação e tamanho conhecidos de cada arquivo observado (fora de node_modules). */
export class ReferenciaArquivos {
	private readonly marcas = new Map<string, Marca>();

	private chave(caminho: string): string {
		return process.platform === "win32" ? caminho.toLowerCase() : caminho;
	}

	private async marcaDe(caminho: string): Promise<Marca | undefined> {
		try {
			const dados = await stat(caminho);
			return { mtimeMs: dados.mtimeMs, tamanho: dados.size, pasta: dados.isDirectory() };
		} catch {
			return undefined;
		}
	}

	/** Registra o estado atual de uma árvore, sem node_modules. */
	async varrer(raiz: string): Promise<void> {
		const marca = await this.marcaDe(raiz);
		if (!marca) return;
		this.marcas.set(this.chave(raiz), marca);
		if (!marca.pasta) return;
		let itens: string[];
		try {
			itens = await readdir(raiz);
		} catch {
			return;
		}
		for (const item of itens) {
			if (item === "node_modules") continue;
			await this.varrer(join(raiz, item));
		}
	}

	/**
	 * true se o caminho mudou de verdade: apareceu, sumiu ou mudou de data de
	 * modificação ou de tamanho. Atualiza a referência.
	 */
	async mudou(caminho: string): Promise<boolean> {
		const chave = this.chave(caminho);
		const antes = this.marcas.get(chave);
		const agora = await this.marcaDe(caminho);
		if (!agora) {
			if (!antes) return false;
			this.marcas.delete(chave);
			return true;
		}
		this.marcas.set(chave, agora);
		if (!antes) return true;
		if (agora.pasta) return false;
		return antes.mtimeMs !== agora.mtimeMs || antes.tamanho !== agora.tamanho;
	}
}

/** Mudanças juntadas durante a espera. */
export interface Mudancas {
	/** Pasta do perfil (absoluta) -> arquivos alterados, relativos a ela, com "/". */
	perfis: Map<string, Set<string>>;
	/** Arquivos alterados nas extensões globais, relativos a ~/.pi/agent/extensions. */
	globais: Set<string>;
	/** Um profile.json mudou ou apareceu uma pasta de perfil: reler a lista. */
	relerLista: boolean;
}

export function mudancasVazias(): Mudancas {
	return { perfis: new Map(), globais: new Set(), relerLista: false };
}

function partesDoCaminho(relativo: string): string[] {
	return relativo.split(/[\\/]+/).filter(Boolean);
}

/** true para caminhos que nunca recarregam (dependências instaladas). */
export function ignorar(relativo: string): boolean {
	return partesDoCaminho(relativo).includes("node_modules");
}

/**
 * Registra uma mudança vinda do watcher de profiles/. `relativo` é relativo a
 * profiles/ (por exemplo, "estudos\\agents\\professor.md").
 */
export function registrarMudancaPerfil(mudancas: Mudancas, pastaPerfis: string, relativo: string): void {
	if (ignorar(relativo)) return;
	const [pasta, ...resto] = partesDoCaminho(relativo);
	if (!pasta) return;
	if (resto.length === 0) {
		// A própria pasta do perfil (criada, renomeada ou um aviso de pasta-mãe).
		mudancas.relerLista = true;
		return;
	}
	// profiles/<id>/paineis é o código de tela do perfil: quem recarrega é o
	// Vite (o pacote @estudos/perfil-<id> do workspace), não a sessão do pi.
	if (resto[0] === "paineis") return;
	const arquivo = resto.join("/");
	if (arquivo === "profile.json") mudancas.relerLista = true;
	const absoluta = join(pastaPerfis, pasta);
	let conjunto = mudancas.perfis.get(absoluta);
	if (!conjunto) {
		conjunto = new Set();
		mudancas.perfis.set(absoluta, conjunto);
	}
	conjunto.add(arquivo);
}

export function registrarMudancaGlobal(mudancas: Mudancas, relativo: string): void {
	if (ignorar(relativo)) return;
	const caminho = partesDoCaminho(relativo).join("/");
	if (caminho) mudancas.globais.add(caminho);
}

function mesmaPasta(a: string, b: string): boolean {
	const normalizar = (caminho: string) => caminho.replace(/[\\/]+$/, "").toLowerCase();
	return normalizar(a) === normalizar(b);
}

/**
 * Aplica as mudanças: relê a lista de perfis se preciso e recarrega cada
 * janela aberta afetada. Janela que ainda não existe: nada a recarregar.
 */
export async function aplicarMudancas(janelas: Janelas, mudancas: Mudancas, log: Log): Promise<void> {
	if (mudancas.relerLista) {
		try {
			await janelas.relerPerfis();
		} catch (erro) {
			log.erro("Erro ao reler a lista de perfis", erro);
		}
	}
	const globais = [...mudancas.globais].map((arquivo) => `~/.pi/agent/extensions/${arquivo}`);
	await Promise.all(
		janelas.pastasAbertas().map(async ({ perfil, pasta }) => {
			let doPerfil: string[] = [];
			for (const [pastaMudada, arquivos] of mudancas.perfis) {
				if (mesmaPasta(pastaMudada, pasta)) doPerfil = [...arquivos];
			}
			const arquivos = [...doPerfil, ...globais];
			if (arquivos.length === 0) return;
			try {
				await janelas.recarregar(perfil, "arquivo", arquivos);
			} catch (erro) {
				const mensagem = erro instanceof Error ? erro.message : String(erro);
				log.erro(`[${perfil}] erro ao recarregar depois de mudança em ${arquivos.join(", ")}`, erro);
				janelas.transmitir(perfil, {
					tipo: "evento",
					perfil,
					evento: { tipo: "erro", origem: "nucleo", mensagem: `Não foi possível recarregar o perfil: ${mensagem}` },
				});
			}
		}),
	);
}

export interface OpcoesObservador {
	janelas: Janelas;
	pastaPerfis: string;
	pastaExtensoesGlobais: string;
	esperaMs: number;
	log: Log;
}

/** Liga os watchers. Devolve a função que os desliga. */
export function observar(opcoes: OpcoesObservador): () => void {
	const { janelas, pastaPerfis, pastaExtensoesGlobais, esperaMs, log } = opcoes;
	let pendentes = mudancasVazias();
	let temporizador: NodeJS.Timeout | undefined;
	/** Aplicação em andamento; a próxima espera por ela, para não recarregar duas vezes ao mesmo tempo. */
	let aplicando: Promise<void> = Promise.resolve();

	const agendar = () => {
		clearTimeout(temporizador);
		temporizador = setTimeout(() => {
			const lote = pendentes;
			pendentes = mudancasVazias();
			aplicando = aplicando.then(() => aplicarMudancas(janelas, lote, log)).catch((erro: unknown) => log.erro("Erro do watcher", erro));
		}, esperaMs);
	};

	const referencia = new ReferenciaArquivos();
	const watchers: FSWatcher[] = [];
	const ligar = (pasta: string, descricao: string, registrar: (relativo: string) => void) => {
		if (!existsSync(pasta)) {
			log.aviso(`Watcher: ${pasta} não existe; ${descricao} não serão observadas.`);
			return;
		}
		const varredura = referencia.varrer(pasta);
		const watcher = watch(pasta, { recursive: true }, (_tipo, nome) => {
			if (!nome) return;
			const relativo = nome.toString();
			if (ignorar(relativo)) return;
			void varredura
				.then(() => referencia.mudou(join(pasta, relativo)))
				.then((mudou) => {
					if (!mudou) return;
					registrar(relativo);
					agendar();
				})
				.catch((erro: unknown) => log.erro(`Watcher de ${pasta}`, erro));
		});
		watcher.on("error", (erro) => log.erro(`Watcher de ${pasta}`, erro));
		watchers.push(watcher);
		log.info(`Watcher: observando ${descricao} em ${pasta}`);
	};

	ligar(pastaPerfis, "as pastas dos perfis", (relativo) => registrarMudancaPerfil(pendentes, pastaPerfis, relativo));
	ligar(pastaExtensoesGlobais, "as extensões globais do pi", (relativo) => registrarMudancaGlobal(pendentes, relativo));

	return () => {
		clearTimeout(temporizador);
		for (const watcher of watchers) watcher.close();
	};
}
