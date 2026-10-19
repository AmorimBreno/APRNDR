// Índice dos materiais (ESPECIFICACAO 5.6): um SQLite do próprio Node
// (node:sqlite) com busca de texto (FTS5, sem diferença de acento nem de
// maiúscula). Fica na pasta local do app, nunca na pasta de dados: um SQLite
// sincronizado pelo Google Drive pode corromper. É derivado do .extraido e
// pode ser apagado a qualquer hora: o serviço o remonta sem chamar o modelo.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Manifesto } from "./extraido.ts";
import type { Trecho } from "./tipos.ts";

/** Muda quando as tabelas mudarem: um índice de outra versão é apagado e remontado. */
const VERSAO_INDICE = 1;

export interface ArquivoIndexado {
	/** Caminho relativo à pasta de dados, com barras normais. */
	caminho: string;
	hash: string;
	tipo: string;
	trechos: number;
}

export interface ResultadoBusca {
	caminho: string;
	/** Nome do trecho no .extraido ("pagina-012"). */
	nome: string;
	local: string;
	origem: string;
	/** Pedaço do texto em volta das palavras achadas, com elas entre « ». */
	recorte: string;
}

/**
 * A consulta do usuário (ou do agente) como consulta do FTS5: cada palavra
 * entre aspas (nada de operadores soltos) e com * no fim, para "deriv" achar
 * "derivada". `todas` = todas as palavras (E); senão, qualquer uma (OU).
 */
export function consultaFts(consulta: string, todas = true): string | undefined {
	const palavras = consulta.match(/[\p{L}\p{N}_]+/gu) ?? [];
	if (palavras.length === 0) return undefined;
	return palavras.map((palavra) => `"${palavra}"*`).join(todas ? " " : " OR ");
}

export class IndiceMateriais {
	private readonly banco: DatabaseSync;

	constructor(arquivo: string) {
		if (arquivo !== ":memory:") mkdirSync(dirname(arquivo), { recursive: true });
		this.banco = new DatabaseSync(arquivo);
		const versao = (this.banco.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
		if (versao !== VERSAO_INDICE) {
			this.banco.exec("DROP TABLE IF EXISTS arquivos; DROP TABLE IF EXISTS trechos;");
			this.banco.exec(`PRAGMA user_version = ${VERSAO_INDICE}`);
		}
		this.banco.exec(`
			CREATE TABLE IF NOT EXISTS arquivos (caminho TEXT PRIMARY KEY, hash TEXT NOT NULL, tipo TEXT NOT NULL, trechos INTEGER NOT NULL);
			CREATE VIRTUAL TABLE IF NOT EXISTS trechos USING fts5(
				caminho UNINDEXED, nome UNINDEXED, local UNINDEXED, origem UNINDEXED, ordem UNINDEXED, texto,
				tokenize = 'unicode61 remove_diacritics 2'
			);
		`);
	}

	arquivos(): ArquivoIndexado[] {
		return this.banco.prepare("SELECT caminho, hash, tipo, trechos FROM arquivos ORDER BY caminho").all() as unknown as ArquivoIndexado[];
	}

	/** Troca o que o índice tem do arquivo pelos trechos novos. */
	substituir(caminho: string, manifesto: Pick<Manifesto, "hash" | "tipo">, trechos: Trecho[]): void {
		this.emTransacao(() => {
			this.apagarLinhas(caminho);
			this.banco
				.prepare("INSERT INTO arquivos (caminho, hash, tipo, trechos) VALUES (?, ?, ?, ?)")
				.run(caminho, manifesto.hash, manifesto.tipo, trechos.length);
			const inserir = this.banco.prepare("INSERT INTO trechos (caminho, nome, local, origem, ordem, texto) VALUES (?, ?, ?, ?, ?, ?)");
			for (const [ordem, trecho] of trechos.entries()) inserir.run(caminho, trecho.nome, trecho.local, trecho.origem, ordem, trecho.texto);
		});
	}

	remover(caminho: string): void {
		this.emTransacao(() => this.apagarLinhas(caminho));
	}

	/**
	 * Busca os trechos que têm todas as palavras (se nenhum tiver, os que têm
	 * alguma), dos mais relevantes para os menos. `prefixo` limita a uma pasta
	 * ("materias/calculo-i/").
	 */
	buscar(consulta: string, opcoes: { prefixo?: string; limite?: number } = {}): ResultadoBusca[] {
		const limite = Math.max(1, Math.min(50, opcoes.limite ?? 10));
		for (const todas of [true, false]) {
			const fts = consultaFts(consulta, todas);
			if (!fts) return [];
			const filtro = opcoes.prefixo ? "AND caminho LIKE ? ESCAPE '\\'" : "";
			const parametros: Array<string | number> = [fts];
			if (opcoes.prefixo) parametros.push(`${opcoes.prefixo.replace(/[\\%_]/g, (letra) => `\\${letra}`)}%`);
			parametros.push(limite);
			const linhas = this.banco
				.prepare(
					`SELECT caminho, nome, local, origem, snippet(trechos, 5, '«', '»', ' … ', 32) AS recorte
					 FROM trechos WHERE trechos MATCH ? ${filtro} ORDER BY bm25(trechos) LIMIT ?`,
				)
				.all(...parametros) as unknown as ResultadoBusca[];
			if (linhas.length > 0 || palavrasDe(consulta) < 2) return linhas;
		}
		return [];
	}

	fechar(): void {
		if (this.banco.isOpen) this.banco.close();
	}

	private apagarLinhas(caminho: string): void {
		this.banco.prepare("DELETE FROM trechos WHERE caminho = ?").run(caminho);
		this.banco.prepare("DELETE FROM arquivos WHERE caminho = ?").run(caminho);
	}

	private emTransacao(operacao: () => void): void {
		this.banco.exec("BEGIN");
		try {
			operacao();
			this.banco.exec("COMMIT");
		} catch (erro) {
			this.banco.exec("ROLLBACK");
			throw erro;
		}
	}
}

const palavrasDe = (consulta: string) => (consulta.match(/[\p{L}\p{N}_]+/gu) ?? []).length;
