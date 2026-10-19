// Python (ESPECIFICACAO 5.5): lido por estrutura. O ast do próprio Python diz
// onde começa e termina cada função e classe do nível de cima (com os
// decoradores e os comentários logo acima); cada uma vira um trecho, e o
// código entre elas (imports, constantes, o script) vira trechos de
// "código do módulo". Sem Python, ou com erro de sintaxe, o arquivo entra em
// pedaços de linhas, com um aviso.

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Extracao, Trecho } from "./tipos.ts";

/** Um trecho de código do módulo tem no máximo estas linhas. */
export const LINHAS_POR_TRECHO = 120;

// Lê o arquivo do argumento e imprime em JSON as definições do nível de cima.
const ESTRUTURA_PY = `
import ast, json, sys
fonte = open(sys.argv[1], encoding="utf-8", errors="replace").read()
linhas = fonte.splitlines()
arvore = ast.parse(fonte)
defs = []
for no in arvore.body:
    if not isinstance(no, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        continue
    inicio = min([no.lineno] + [d.lineno for d in no.decorator_list])
    while inicio > 1 and linhas[inicio - 2].strip().startswith("#"):
        inicio -= 1
    tipo = "class" if isinstance(no, ast.ClassDef) else ("async def" if isinstance(no, ast.AsyncFunctionDef) else "def")
    defs.append({"tipo": tipo, "nome": no.name, "inicio": inicio, "fim": no.end_lineno})
print(json.dumps(defs))
`;

export interface DefinicaoPython {
	tipo: "def" | "async def" | "class";
	nome: string;
	/** Linhas de 1 em diante, inclusivas. */
	inicio: number;
	fim: number;
}

/** O executável do Python; muda nos testes. */
export const comandoPython = { arquivo: "python", argumentos: [] as string[] };

/** As definições do nível de cima, pelo ast do Python. Rejeita sem Python ou com erro de sintaxe. */
export async function estruturaPython(caminho: string): Promise<DefinicaoPython[]> {
	const pasta = await mkdtemp(join(tmpdir(), "estudos-py-"));
	try {
		const script = join(pasta, "estrutura.py");
		await writeFile(script, ESTRUTURA_PY, "utf8");
		const saida = await new Promise<string>((resolver, rejeitar) => {
			execFile(
				comandoPython.arquivo,
				[...comandoPython.argumentos, script, caminho],
				{ timeout: 20_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
				(erro, stdout, stderr) => {
					if (erro) rejeitar(new Error(stderr.trim().split("\n").at(-1) || erro.message));
					else resolver(stdout);
				},
			);
		});
		return JSON.parse(saida) as DefinicaoPython[];
	} finally {
		await rm(pasta, { recursive: true, force: true });
	}
}

const nomeTrecho = (numero: number) => `trecho-${String(numero).padStart(3, "0")}`;

/** O código de inicio a fim (1 em diante), em pedaços de no máximo LINHAS_POR_TRECHO, sem os só de linhas vazias. */
function pedacos(linhas: string[], inicio: number, fim: number): Array<[number, number]> {
	const lista: Array<[number, number]> = [];
	for (let comeco = inicio; comeco <= fim; comeco += LINHAS_POR_TRECHO) {
		const final = Math.min(fim, comeco + LINHAS_POR_TRECHO - 1);
		if (linhas.slice(comeco - 1, final).some((linha) => linha.trim())) lista.push([comeco, final]);
	}
	return lista;
}

/** Monta os trechos a partir das definições (ou só dos pedaços de linhas, se não houver estrutura). */
export function trechosPython(fonte: string, definicoes: DefinicaoPython[] | undefined): Trecho[] {
	const linhas = fonte.replace(/\r\n/g, "\n").split("\n");
	const trechos: Trecho[] = [];
	const doModulo = (inicio: number, fim: number) => {
		for (const [comeco, final] of pedacos(linhas, inicio, fim)) {
			trechos.push({
				local: `código do módulo (linhas ${comeco}–${final})`,
				nome: nomeTrecho(trechos.length + 1),
				linhas: [comeco, final],
				origem: "codigo",
				texto: linhas.slice(comeco - 1, final).join("\n"),
			});
		}
	};
	let proxima = 1;
	for (const definicao of [...(definicoes ?? [])].sort((a, b) => a.inicio - b.inicio)) {
		if (definicao.inicio > proxima) doModulo(proxima, definicao.inicio - 1);
		trechos.push({
			local: `${definicao.tipo} ${definicao.nome} (linhas ${definicao.inicio}–${definicao.fim})`,
			nome: nomeTrecho(trechos.length + 1),
			linhas: [definicao.inicio, definicao.fim],
			origem: "codigo",
			texto: linhas.slice(definicao.inicio - 1, definicao.fim).join("\n"),
		});
		proxima = definicao.fim + 1;
	}
	if (proxima <= linhas.length) doModulo(proxima, linhas.length);
	return trechos;
}

export async function extrairPython(caminho: string, fonte: string): Promise<Extracao> {
	const avisos: string[] = [];
	let definicoes: DefinicaoPython[] | undefined;
	try {
		definicoes = await estruturaPython(caminho);
	} catch (erro) {
		avisos.push(`Sem a estrutura do Python (${(erro as Error).message}): o arquivo entrou em pedaços de ${LINHAS_POR_TRECHO} linhas.`);
	}
	return { tipo: "python", trechos: trechosPython(fonte, definicoes), custo: 0, avisos };
}
