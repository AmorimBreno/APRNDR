// Serviço de materiais de um perfil (ESPECIFICACAO 5.5 e 5.6). O perfil diz no
// profile.json quais pastas da pasta de dados observar ("materiais": {"pastas":
// ["materias/*/materiais"]}); o núcleo não sabe o que é uma matéria.
//
// - Varredura: ao iniciar, a cada 30 s e logo depois de o app adicionar um
//   arquivo. O aviso de arquivo novo do Windows pode não chegar na unidade do
//   Google Drive, por isso a varredura em vez de só observar.
// - Um arquivo não muda se o tamanho e a data de modificação forem os do
//   manifesto; se mudarem, o hash decide. Arquivos novos ou mudados vão para
//   uma fila processada um de cada vez (a visão custa; um por vez é previsível).
// - Arquivo apagado: sai do índice e o .extraido dele é apagado (é derivado).
//   Só numa pasta que a varredura conseguiu ler: com o Drive fora do ar, nada
//   é apagado.
// - O índice é remontado do .extraido quando falta ou está velho, sem chamar o modelo.
// - O .extraido fica ao lado da pasta observada: duas pastas observadas dentro
//   da mesma pasta dividiriam o mesmo .extraido. O padrão de uma pasta por
//   matéria (materias/*\/materiais) não tem esse problema.

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { apagarExtraido, gravarExtraido, gravarManifesto, lerManifesto, lerTrechos, type Manifesto, PASTA_EXTRAIDO, pastaDoExtraido } from "./extraido.ts";
import { extrairArquivo, hashDe, tipoDoArquivo } from "./extrair.ts";
import { IndiceMateriais, type ResultadoBusca } from "./indice.ts";
import type { Descrever, TipoMaterial, Trecho } from "./tipos.ts";
import { criarDescrever, type RegistroVisao } from "./visao.ts";

export interface ConfigMateriais {
	/** Pastas observadas, relativas à pasta de dados, com * para um nível qualquer ("materias/*\/materiais"). */
	pastas: string[];
	/** Modelo com visão (provedor/id) para as páginas visuais. Sem ele, só o texto. */
	modeloVisao?: string;
}

export type EstadoMaterial = "na_fila" | "processando" | "pronto" | "erro" | "nao_suportado";

export interface SituacaoMaterial {
	/** Caminho relativo à pasta de dados, com barras normais ("materias/calculo/materiais/aula-04.pdf"). */
	caminho: string;
	/** A pasta observada ("materias/calculo/materiais"). */
	pasta: string;
	/** O caminho dentro da pasta observada ("aula-04.pdf"). */
	nome: string;
	tipo?: TipoMaterial;
	estado: EstadoMaterial;
	tamanho: number;
	/** O que está fazendo agora ("descrevendo a página 3 de 20"). */
	etapa?: string;
	progresso?: { feito: number; total: number };
	trechos?: number;
	/** US$ da visão. */
	custo?: number;
	avisos?: string[];
	erro?: string;
	/** ISO 8601. */
	extraidoEm?: string;
}

/** Um arquivo que acabou de ficar pronto (`novo` = não tinha extraído antes). */
export interface MaterialPronto {
	caminho: string;
	pasta: string;
	nome: string;
	tipo: TipoMaterial;
	trechos: number;
	custo: number;
	novo: boolean;
}

export type EventoMateriais =
	| { tipo: "situacao"; materiais: SituacaoMaterial[] }
	| { tipo: "pronto"; material: MaterialPronto }
	| { tipo: "removido"; caminho: string; pasta: string; nome: string };

export interface OpcoesServicoMateriais {
	pastaDados: string;
	config: ConfigMateriais;
	/** Arquivo do SQLite (fora da pasta de dados), ou ":memory:". */
	arquivoIndice: string;
	/** Registro de modelos do pi, para a visão. */
	registro?: () => Promise<RegistroVisao>;
	/** Padrão 30 s; 0 = sem varredura periódica (testes). */
	intervaloMs?: number;
	/** Problemas que não são de um arquivo (pasta de dados fora do ar, modelo de visão inválido). */
	aoAvisar?(mensagem: string): void;
}

export class ErroMateriais extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroMateriais";
	}
}

const barras = (caminho: string) => caminho.replace(/\\/g, "/");

/** Arquivos que a varredura ignora: ocultos, temporários do Office e do Windows. */
function ignorado(nome: string): boolean {
	return nome.startsWith(".") || nome.startsWith("~$") || nome.endsWith(".tmp") || nome.toLowerCase() === "desktop.ini";
}

/** `pasta` (relativa) segue um dos padrões? Cada * vale um nível. */
export function seguePadrao(pasta: string, padroes: readonly string[]): boolean {
	const partes = barras(pasta).split("/").filter(Boolean);
	return padroes.some((padrao) => {
		const modelo = barras(padrao).split("/").filter(Boolean);
		return (
			modelo.length === partes.length &&
			modelo.every((parte, indice) => (parte === "*" ? !partes[indice]!.startsWith(".") && partes[indice] !== ".." : parte === partes[indice]))
		);
	});
}

/** As pastas que existem e seguem o padrão, relativas à pasta de dados. */
async function expandirPadrao(pastaDados: string, padrao: string): Promise<string[]> {
	let bases = [""];
	for (const parte of barras(padrao).split("/").filter(Boolean)) {
		const proximas: string[] = [];
		for (const base of bases) {
			if (parte !== "*") {
				proximas.push(base ? `${base}/${parte}` : parte);
				continue;
			}
			let itens;
			try {
				itens = await readdir(join(pastaDados, base), { withFileTypes: true });
			} catch {
				continue;
			}
			for (const item of itens) if (item.isDirectory() && !ignorado(item.name)) proximas.push(base ? `${base}/${item.name}` : item.name);
		}
		bases = proximas;
	}
	const existentes: string[] = [];
	for (const base of bases) {
		try {
			if ((await stat(join(pastaDados, base))).isDirectory()) existentes.push(base);
		} catch {
			// a pasta ainda não existe (uma matéria sem materiais)
		}
	}
	return existentes;
}

/** Os arquivos da pasta e das subpastas, como caminhos relativos a ela. */
async function listarArquivos(pasta: string, prefixo = ""): Promise<string[]> {
	const lista: string[] = [];
	for (const item of await readdir(join(pasta, prefixo), { withFileTypes: true })) {
		if (ignorado(item.name)) continue;
		const relativo = prefixo ? `${prefixo}/${item.name}` : item.name;
		if (item.isDirectory()) lista.push(...(await listarArquivos(pasta, relativo)));
		else if (item.isFile()) lista.push(relativo);
	}
	return lista;
}

/** Os manifestos do .extraido de uma pasta observada (para achar os que não têm mais o arquivo). */
async function manifestosDoExtraido(raiz: string, prefixo = ""): Promise<string[]> {
	const lista: string[] = [];
	let itens;
	try {
		itens = await readdir(join(raiz, prefixo), { withFileTypes: true });
	} catch {
		return lista;
	}
	for (const item of itens) {
		if (!item.isDirectory()) continue;
		const relativo = prefixo ? `${prefixo}/${item.name}` : item.name;
		const manifesto = await lerManifesto(join(raiz, relativo));
		if (manifesto) lista.push(relativo);
		else lista.push(...(await manifestosDoExtraido(raiz, relativo)));
	}
	return lista;
}

export class ServicoMateriais {
	private readonly opcoes: OpcoesServicoMateriais;
	private indiceAberto?: IndiceMateriais;
	private readonly situacoes = new Map<string, SituacaoMaterial>();
	private readonly fila: string[] = [];
	private readonly ouvintes = new Set<(evento: EventoMateriais) => void>();
	private temporizador?: ReturnType<typeof setInterval>;
	private varredura?: Promise<void>;
	private varrerDeNovo = false;
	private processando?: Promise<void>;
	private readonly parada = new AbortController();

	constructor(opcoes: OpcoesServicoMateriais) {
		this.opcoes = opcoes;
	}

	get config(): ConfigMateriais {
		return this.opcoes.config;
	}

	private get indice(): IndiceMateriais {
		this.indiceAberto ??= new IndiceMateriais(this.opcoes.arquivoIndice);
		return this.indiceAberto;
	}

	assinar(ouvinte: (evento: EventoMateriais) => void): () => void {
		this.ouvintes.add(ouvinte);
		return () => this.ouvintes.delete(ouvinte);
	}

	/** A situação de cada arquivo das pastas observadas, em ordem de caminho. */
	situacao(): SituacaoMaterial[] {
		return [...this.situacoes.values()].sort((a, b) => a.caminho.localeCompare(b.caminho));
	}

	/** Primeira varredura e a periódica. Não espera a varredura terminar. */
	iniciar(): void {
		void this.varrer();
		const intervalo = this.opcoes.intervaloMs ?? 30_000;
		if (intervalo > 0 && !this.temporizador) {
			this.temporizador = setInterval(() => void this.varrer(), intervalo);
			this.temporizador.unref?.();
		}
	}

	/** Para a varredura, cancela o arquivo em processamento e fecha o índice. */
	async parar(): Promise<void> {
		if (this.temporizador) clearInterval(this.temporizador);
		this.temporizador = undefined;
		this.parada.abort();
		this.fila.length = 0;
		await this.varredura?.catch(() => {});
		await this.processando?.catch(() => {});
		this.indiceAberto?.fechar();
		this.indiceAberto = undefined;
	}

	/** Varre as pastas. Se já estiver varrendo, varre de novo quando terminar. */
	varrer(): Promise<void> {
		if (this.varredura) {
			this.varrerDeNovo = true;
			return this.varredura;
		}
		this.varredura = (async () => {
			do {
				this.varrerDeNovo = false;
				await this.umaVarredura();
			} while (this.varrerDeNovo && !this.parada.signal.aborted);
		})().finally(() => {
			this.varredura = undefined;
		});
		return this.varredura;
	}

	/** Espera a varredura e a fila terminarem (testes e roteiro). */
	async ocioso(): Promise<void> {
		while (this.varredura || this.processando) {
			await this.varredura;
			await this.processando;
		}
	}

	private emitir(evento: EventoMateriais): void {
		for (const ouvinte of this.ouvintes) {
			try {
				ouvinte(evento);
			} catch {
				// um ouvinte com erro não para o serviço
			}
		}
	}

	private mudou(): void {
		this.emitir({ tipo: "situacao", materiais: this.situacao() });
	}

	private atualizar(caminho: string, mudancas: Partial<SituacaoMaterial>, avisar = true): void {
		const atual = this.situacoes.get(caminho);
		if (!atual) return;
		const nova: SituacaoMaterial = { ...atual, ...mudancas };
		// Campos que não valem mais no estado novo.
		if (nova.estado !== "processando") {
			delete nova.etapa;
			delete nova.progresso;
		}
		if (nova.estado !== "erro") delete nova.erro;
		this.situacoes.set(caminho, nova);
		if (avisar) this.mudou();
	}

	private async umaVarredura(): Promise<void> {
		const { pastaDados } = this.opcoes;
		try {
			const info = await stat(pastaDados);
			if (!info.isDirectory()) throw new Error("não é uma pasta");
		} catch {
			this.opcoes.aoAvisar?.(`Materiais: a pasta de dados ${pastaDados} não abriu; a varredura tenta de novo depois.`);
			return;
		}
		const pastas = new Set<string>();
		for (const padrao of this.opcoes.config.pastas) for (const pasta of await expandirPadrao(pastaDados, padrao)) pastas.add(pasta);

		const vistos = new Set<string>();
		const lidas = new Set<string>();
		let mudou = false;
		for (const pasta of pastas) {
			let arquivos: string[];
			try {
				arquivos = await listarArquivos(join(pastaDados, pasta));
			} catch {
				continue;
			}
			lidas.add(pasta);
			for (const nome of arquivos) {
				const caminho = `${pasta}/${nome}`;
				vistos.add(caminho);
				if (await this.conferir(pasta, nome)) mudou = true;
			}
			// .extraido sem o arquivo de origem: o arquivo foi apagado ou renomeado.
			const raizExtraido = join(pastaDados, pasta, "..", PASTA_EXTRAIDO);
			for (const nome of await manifestosDoExtraido(raizExtraido)) {
				if (!vistos.has(`${pasta}/${nome}`)) await apagarExtraido(join(raizExtraido, ...nome.split("/")));
			}
		}
		// Os que sumiram, nas pastas lidas (ou numa pasta observada que não existe mais).
		const conhecidos = new Set([...this.situacoes.keys(), ...this.indice.arquivos().map((arquivo) => arquivo.caminho)]);
		for (const caminho of conhecidos) {
			if (vistos.has(caminho)) continue;
			// A pasta observada do arquivo; sem nenhuma, a pasta dele não existe mais.
			const pasta = [...pastas].find((item) => caminho.startsWith(`${item}/`));
			if (pasta && !lidas.has(pasta)) continue;
			const situacao = this.situacoes.get(caminho);
			this.situacoes.delete(caminho);
			this.indice.remover(caminho);
			const indiceFila = this.fila.indexOf(caminho);
			if (indiceFila >= 0) this.fila.splice(indiceFila, 1);
			const pastaDoArquivo = situacao?.pasta ?? pasta ?? caminho.slice(0, caminho.lastIndexOf("/"));
			this.emitir({ tipo: "removido", caminho, pasta: pastaDoArquivo, nome: situacao?.nome ?? caminho.slice(pastaDoArquivo.length + 1) });
			mudou = true;
		}
		if (mudou) this.mudou();
		this.processarFila();
	}

	/** Confere um arquivo. Devolve true se a situação dele mudou. */
	private async conferir(pasta: string, nome: string): Promise<boolean> {
		const caminho = `${pasta}/${nome}`;
		const absoluto = join(this.opcoes.pastaDados, pasta, ...nome.split("/"));
		const atual = this.situacoes.get(caminho);
		if (atual && (atual.estado === "na_fila" || atual.estado === "processando")) return false;
		let info;
		try {
			info = await stat(absoluto);
		} catch {
			return false;
		}
		const tipo = tipoDoArquivo(nome);
		const base = { caminho, pasta, nome, tamanho: info.size, ...(tipo ? { tipo } : {}) };
		if (!tipo) {
			if (atual?.estado === "nao_suportado" && atual.tamanho === info.size) return false;
			this.situacoes.set(caminho, { ...base, estado: "nao_suportado" });
			return true;
		}
		const pastaExtraido = pastaDoExtraido(join(this.opcoes.pastaDados, pasta), nome);
		const manifesto = await lerManifesto(pastaExtraido);
		if (manifesto && manifesto.tamanho === info.size && manifesto.mtimeMs === info.mtimeMs) {
			const reindexou = await this.garantirNoIndice(caminho, pastaExtraido, manifesto);
			if (atual?.estado === "pronto" && atual.extraidoEm === manifesto.extraidoEm && !reindexou) return false;
			this.situacoes.set(caminho, { ...base, ...this.dadosDoManifesto(manifesto), estado: "pronto" });
			return true;
		}
		if (atual?.estado === "erro" && atual.tamanho === info.size) return false;
		this.situacoes.set(caminho, { ...base, estado: "na_fila" });
		if (!this.fila.includes(caminho)) this.fila.push(caminho);
		return true;
	}

	private dadosDoManifesto(manifesto: Manifesto): Partial<SituacaoMaterial> {
		return {
			trechos: manifesto.trechos.length,
			custo: manifesto.custo,
			extraidoEm: manifesto.extraidoEm,
			...(manifesto.avisos.length ? { avisos: manifesto.avisos } : {}),
		};
	}

	/** Põe o arquivo no índice se ele faltar ou estiver com outro hash. Devolve true se reindexou. */
	private async garantirNoIndice(caminho: string, pastaExtraido: string, manifesto: Manifesto): Promise<boolean> {
		const indexado = this.indice.arquivos().find((arquivo) => arquivo.caminho === caminho);
		if (indexado?.hash === manifesto.hash) return false;
		this.indice.substituir(caminho, manifesto, await lerTrechos(pastaExtraido, manifesto));
		return true;
	}

	private processarFila(): void {
		if (this.processando || this.fila.length === 0 || this.parada.signal.aborted) return;
		this.processando = (async () => {
			while (this.fila.length > 0 && !this.parada.signal.aborted) {
				const caminho = this.fila.shift()!;
				await this.processar(caminho);
			}
		})().finally(() => {
			this.processando = undefined;
		});
	}

	/** O "descrever" da visão, ou nenhum (com aviso) se o modelo não estiver configurado ou disponível. */
	private async descrever(): Promise<{ descrever?: Descrever; aviso?: string }> {
		const { modeloVisao } = this.opcoes.config;
		if (!modeloVisao || !this.opcoes.registro) return {};
		try {
			return { descrever: criarDescrever(await this.opcoes.registro(), modeloVisao, this.parada.signal) };
		} catch (erro) {
			const aviso = `Sem a visão (${(erro as Error).message}): as páginas visuais ficaram só com o texto.`;
			this.opcoes.aoAvisar?.(`Materiais: ${aviso}`);
			return { aviso };
		}
	}

	private async processar(caminho: string): Promise<void> {
		const situacao = this.situacoes.get(caminho);
		if (!situacao?.tipo) return;
		const { pasta, nome } = situacao;
		const absoluto = join(this.opcoes.pastaDados, pasta, ...nome.split("/"));
		const pastaExtraido = pastaDoExtraido(join(this.opcoes.pastaDados, pasta), nome);
		this.atualizar(caminho, { estado: "processando", etapa: "lendo o arquivo" });
		try {
			const info = await stat(absoluto);
			const dados = await readFile(absoluto);
			const hash = hashDe(dados);
			const anterior = await lerManifesto(pastaExtraido);
			if (anterior && anterior.hash === hash) {
				// Só a data mudou (o Drive copiou de novo, por exemplo): nada a extrair.
				const manifesto: Manifesto = { ...anterior, tamanho: info.size, mtimeMs: info.mtimeMs };
				await gravarManifesto(pastaExtraido, manifesto);
				await this.garantirNoIndice(caminho, pastaExtraido, manifesto);
				this.atualizar(caminho, { ...this.dadosDoManifesto(manifesto), estado: "pronto", tamanho: info.size });
				return;
			}
			const { descrever, aviso } = await this.descrever();
			const extracao = await extrairArquivo(
				absoluto,
				{
					...(descrever ? { descrever } : {}),
					sinal: this.parada.signal,
					aoProgredir: ({ feito, total, etapa }) => this.atualizar(caminho, { etapa, progresso: { feito, total } }),
				},
				dados,
			);
			if (aviso && extracao.avisos.length > 0) extracao.avisos.unshift(aviso);
			const manifesto = await gravarExtraido(pastaExtraido, { arquivo: nome, hash, tamanho: info.size, mtimeMs: info.mtimeMs, extracao });
			this.indice.substituir(caminho, manifesto, extracao.trechos);
			this.atualizar(caminho, { ...this.dadosDoManifesto(manifesto), estado: "pronto", tamanho: info.size });
			this.emitir({
				tipo: "pronto",
				material: { caminho, pasta, nome, tipo: extracao.tipo, trechos: extracao.trechos.length, custo: extracao.custo, novo: !anterior },
			});
		} catch (erro) {
			if (this.parada.signal.aborted) return;
			this.atualizar(caminho, { estado: "erro", erro: (erro as Error).message });
		}
	}

	/** Processa o arquivo de novo do zero (apaga o extraído, inclusive as descrições). */
	async reprocessar(caminho: string): Promise<void> {
		const situacao = this.situacoes.get(caminho);
		if (!situacao) throw new ErroMateriais(`Não conheço o material "${caminho}".`);
		if (!situacao.tipo) throw new ErroMateriais(`${situacao.nome}: formato ainda não suportado.`);
		if (situacao.estado === "na_fila" || situacao.estado === "processando") return;
		await apagarExtraido(pastaDoExtraido(join(this.opcoes.pastaDados, situacao.pasta), situacao.nome));
		this.indice.remover(caminho);
		this.atualizar(caminho, { estado: "na_fila", trechos: 0, custo: 0 });
		this.fila.push(caminho);
		this.processarFila();
	}

	/**
	 * Copia arquivos para uma pasta observada (criando-a) e varre. Um nome que
	 * já existe com outro conteúdo ganha " (2)"; com o mesmo conteúdo, é pulado.
	 * Devolve os caminhos gravados (relativos à pasta de dados).
	 */
	async adicionar(pasta: string, arquivos: Array<{ nome: string; dados: Uint8Array }>): Promise<string[]> {
		const relativa = barras(pasta).replace(/^\/+|\/+$/g, "");
		if (!seguePadrao(relativa, this.opcoes.config.pastas)) {
			throw new ErroMateriais(`A pasta "${pasta}" não é uma pasta de materiais deste perfil (${this.opcoes.config.pastas.join(", ")}).`);
		}
		const destino = join(this.opcoes.pastaDados, ...relativa.split("/"));
		await mkdir(destino, { recursive: true });
		const gravados: string[] = [];
		for (const arquivo of arquivos) {
			const limpo = basename(barras(arquivo.nome)).replace(/[<>:"|?*\u0000-\u001f]/g, "_").trim();
			if (!limpo || ignorado(limpo)) throw new ErroMateriais(`Nome de arquivo inválido: "${arquivo.nome}".`);
			const extensao = extname(limpo);
			const raiz = limpo.slice(0, limpo.length - extensao.length);
			let nome = limpo;
			for (let numero = 2; ; numero++) {
				let existente: Buffer | undefined;
				try {
					existente = await readFile(join(destino, nome));
				} catch {
					existente = undefined;
				}
				if (!existente) break;
				if (hashDe(existente) === hashDe(arquivo.dados)) {
					nome = "";
					break;
				}
				nome = `${raiz} (${numero})${extensao}`;
			}
			if (!nome) continue;
			await writeFile(join(destino, nome), arquivo.dados, { flag: "wx" });
			gravados.push(`${relativa}/${nome}`);
		}
		await this.varrer();
		return gravados;
	}

	/** Busca nos materiais; `pasta` limita a uma pasta da pasta de dados ("materias/calculo"). */
	buscar(consulta: string, opcoes: { pasta?: string; limite?: number } = {}): ResultadoBusca[] {
		const prefixo = opcoes.pasta ? `${barras(opcoes.pasta).replace(/^\/+|\/+$/g, "")}/` : undefined;
		return this.indice.buscar(consulta, { ...(prefixo ? { prefixo } : {}), ...(opcoes.limite ? { limite: opcoes.limite } : {}) });
	}

	/** Os trechos de um material pronto, lidos do .extraido. */
	async ler(caminho: string): Promise<{ situacao: SituacaoMaterial; trechos: Trecho[] }> {
		const situacao = this.situacoes.get(barras(caminho));
		if (!situacao) throw new ErroMateriais(`Não conheço o material "${caminho}". Use o caminho que a busca ou a lista devolveu.`);
		if (situacao.estado !== "pronto") {
			throw new ErroMateriais(`${situacao.nome} ainda não está pronto (${situacao.estado === "erro" ? `erro: ${situacao.erro}` : situacao.estado}).`);
		}
		const pastaExtraido = pastaDoExtraido(join(this.opcoes.pastaDados, situacao.pasta), situacao.nome);
		const manifesto = await lerManifesto(pastaExtraido);
		if (!manifesto) throw new ErroMateriais(`O extraído de ${situacao.nome} sumiu; ele vai ser processado de novo.`);
		return { situacao, trechos: await lerTrechos(pastaExtraido, manifesto) };
	}
}
