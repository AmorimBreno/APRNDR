// Log do servidor: uma linha por acontecimento, no console e num arquivo por
// dia em %LOCALAPPDATA%\estudos-app\logs\servidor-AAAA-MM-DD.log.
//
// Regra: nunca registrar chaves de API nem o texto inteiro das mensagens do
// usuário. Quem chama passa só o tipo e tamanhos (ver resumirMensagem).

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type NivelLog = "info" | "aviso" | "erro";

export interface Log {
	info(mensagem: string): void;
	aviso(mensagem: string): void;
	erro(mensagem: string, erro?: unknown): void;
}

function doisDigitos(numero: number): string {
	return String(numero).padStart(2, "0");
}

/** Data local AAAA-MM-DD (o nome do arquivo segue o dia do Breno, não o UTC). */
function dataLocal(agora: Date): string {
	return `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;
}

function horaLocal(agora: Date): string {
	return `${doisDigitos(agora.getHours())}:${doisDigitos(agora.getMinutes())}:${doisDigitos(agora.getSeconds())}.${String(agora.getMilliseconds()).padStart(3, "0")}`;
}

function descreverErro(erro: unknown): string {
	if (erro instanceof Error) return erro.stack ?? `${erro.name}: ${erro.message}`;
	return String(erro);
}

// Console desligado depois que a saída quebra. Quando o processo que lê o
// stdout/stderr morre (por exemplo, o pnpm dev encerrado), cada escrita no
// console dá EPIPE; sem isso, o tratador de "exceção não tratada" escrevia o
// erro no console, que dava EPIPE de novo, e o log crescia sem parar.
let consoleAtivo = true;
let fluxosVigiados = false;

function vigiarFluxos(): void {
	if (fluxosVigiados) return;
	fluxosVigiados = true;
	for (const fluxo of [process.stdout, process.stderr]) {
		fluxo.on("error", () => {
			consoleAtivo = false;
		});
	}
}

/** true para erros de saída quebrada (EPIPE), que não devem ser registrados de novo. */
export function ehSaidaQuebrada(erro: unknown): boolean {
	return (erro as { code?: unknown } | undefined)?.code === "EPIPE";
}

/** Cria o log. Sem `pasta`, escreve só no console (os testes usam assim). */
export function criarLog(pasta?: string): Log {
	let pastaPronta = false;
	vigiarFluxos();
	const escrever = (nivel: NivelLog, mensagem: string) => {
		const agora = new Date();
		const linha = `${dataLocal(agora)} ${horaLocal(agora)} [${nivel}] ${mensagem}`;
		if (consoleAtivo) {
			try {
				if (nivel === "erro") console.error(linha);
				else console.log(linha);
			} catch {
				consoleAtivo = false;
			}
		}
		if (!pasta) return;
		try {
			if (!pastaPronta) {
				mkdirSync(pasta, { recursive: true });
				pastaPronta = true;
			}
			appendFileSync(join(pasta, `servidor-${dataLocal(agora)}.log`), `${linha}\n`);
		} catch (erro) {
			if (!consoleAtivo) return;
			try {
				console.error(`Não foi possível escrever no log: ${descreverErro(erro)}`);
			} catch {
				consoleAtivo = false;
			}
		}
	};
	return {
		info: (mensagem) => escrever("info", mensagem),
		aviso: (mensagem) => escrever("aviso", mensagem),
		erro: (mensagem, erro) => escrever("erro", erro === undefined ? mensagem : `${mensagem}: ${descreverErro(erro)}`),
	};
}

/** Log que não escreve nada (testes). */
export const logMudo: Log = { info: () => {}, aviso: () => {}, erro: () => {} };
