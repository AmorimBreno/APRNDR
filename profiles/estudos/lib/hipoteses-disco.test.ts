// Testes das hipóteses do aprendiz com um disco que falha ao acrescentar eventos (item 9, parte B): a segunda
// tentativa de cada evento e a reconciliação no começo das operações que gravam (o hipoteses.json é gravado antes
// dos eventos; se os eventos não chegam, a próxima operação os refaz). Pasta temporária, eventos escritos à mão.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const disco = vi.hoisted(() => ({ falhar: undefined as undefined | ((evento: { verbo: string }) => boolean) }));

vi.mock("./eventos.ts", async (importOriginal) => {
	const real = await importOriginal<typeof import("./eventos.ts")>();
	return {
		...real,
		acrescentarEvento: async (arquivo: string, evento: { verbo: string }) => {
			if (disco.falhar?.(evento)) throw new Error("disco falhou");
			return real.acrescentarEvento(arquivo, evento as never);
		},
	};
});

import { acrescentarEvento, type Evento, lerEventos } from "./eventos.ts";
import { decidirHipotese, editarHipotese, lerHipoteses, registrarReflexao, type ResumoDaReflexao } from "./hipoteses.ts";
import { caminhoDoMapa } from "./mapa.ts";
import { arquivoMateria, eventosAprendiz } from "./materias.ts";

let dados = "";
const AGORA = new Date("2026-11-11T12:00:00.000Z");

beforeEach(async () => {
	dados = await mkdtemp(join(tmpdir(), "estudos-hipoteses-disco-"));
	disco.falhar = undefined;
});

afterEach(async () => {
	disco.falhar = undefined;
	await rm(dados, { recursive: true, force: true });
});

async function escrever(arquivo: string, conteudo: unknown): Promise<void> {
	await mkdir(dirname(arquivo), { recursive: true });
	await writeFile(arquivo, JSON.stringify(conteudo), "utf8");
}

function resposta(n: number, sessao: string): Evento {
	return {
		id: `ev${String(n).padStart(3, "0")}`,
		ts: `2026-11-0${n}T10:00:00.000Z`,
		sessao,
		verbo: "respondeu_questao",
		objeto: { materia: "calc", curso: "c", questao: `q${n}`, conceitos: ["limites"] },
		resultado: { correta: false },
	};
}

async function cenario(): Promise<void> {
	await escrever(arquivoMateria(dados, "calc"), { id: "calc", nome: "calc", cor: "moss", glifo: "学", provas: [], criadaEm: "2026-10-01T00:00:00.000Z" });
	await escrever(caminhoDoMapa(dados, "calc"), {
		versao: 1,
		situacao: "aprovado",
		conceitos: [{ id: "limites", nome: "limites", descricao: "", referencias: [], prioridade: "central", origem: "material", criadoEm: "2026-10-01T00:00:00.000Z" }],
		arquivos: {},
	});
	for (const evento of [resposta(1, "s1"), resposta(3, "s2"), resposta(5, "s3")]) await acrescentarEvento(eventosAprendiz(dados), evento);
}

const resumo = (extra: Partial<ResumoDaReflexao> = {}): ResumoDaReflexao => ({ id: "r-9", ts: AGORA.toISOString(), motivo: "botao", ultimoEvento: "ev003", lidos: 2, propostas: 2, aceitas: 2, descartadas: [], ...extra });
const criar = {
	acao: "criar" as const,
	tipo: "misconception" as const,
	escopo: { nivel: "conceito" as const, materia: "calc", conceitos: ["limites"] },
	enunciado: "Confunde limite lateral com limite no ponto",
	evidencias: ["ev001", "ev003"],
	motivo: "dois erros",
};
const eventosDoDisco = async () => (await lerEventos(eventosAprendiz(dados))).eventos;
const verbos = async () => (await eventosDoDisco()).map((evento) => evento.verbo).filter((verbo) => verbo !== "respondeu_questao");

describe("a segunda tentativa de cada evento", () => {
	it("uma falha do disco no append é superada pela segunda tentativa: todos os eventos chegam, uma vez cada", async () => {
		await cenario();
		let chamadas = 0;
		disco.falhar = () => chamadas++ === 0; // só a primeira tentativa do primeiro evento falha
		await registrarReflexao(dados, { resumo: resumo(), propostasValidas: [criar], agora: AGORA });
		expect(await verbos()).toEqual(["refletiu", "propos_hipotese"]);
	});
});

describe("a reconciliação depois de uma gravação que parou no meio", () => {
	it("hipoteses.json gravado e nenhum evento (as duas tentativas falharam): o erro sobe e a próxima operação refaz refletiu e propos_hipotese, sem duplicar", async () => {
		await cenario();
		disco.falhar = () => true;
		await expect(registrarReflexao(dados, { resumo: resumo(), propostasValidas: [criar], agora: AGORA })).rejects.toThrow("disco falhou");
		const gravado = await lerHipoteses(dados);
		expect(gravado.ultimaReflexao?.id).toBe("r-9");
		expect(gravado.hipoteses).toHaveLength(1);
		expect(await verbos()).toEqual([]);

		// o disco volta: a próxima operação que grava reconcilia primeiro
		disco.falhar = undefined;
		const id = gravado.hipoteses[0]!.id;
		await decidirHipotese(dados, { id, decisao: "aprovar" }, { agora: new Date(AGORA.getTime() + 60_000) });
		const todos = await eventosDoDisco();
		expect(todos.map((evento) => evento.verbo).filter((verbo) => verbo !== "respondeu_questao")).toEqual(["refletiu", "propos_hipotese", "aprovou_hipotese"]);
		const refeitos = todos.filter((evento) => evento.verbo === "refletiu" || evento.verbo === "propos_hipotese");
		expect(refeitos.every((evento) => evento.contexto?.reconciliado === true)).toBe(true);
		expect(refeitos[0]).toMatchObject({ objeto: { reflexao: "r-9" }, ts: AGORA.toISOString(), resultado: { id: "r-9", ultimoEvento: "ev003" } });
		expect(refeitos[1]).toMatchObject({ objeto: { hipotese: id, materia: "calc", conceitos: ["limites"] }, resultado: { reflexao: "r-9", enunciado: criar.enunciado, evidencias: ["ev001", "ev003"] } });
		// os ids dos refeitos ficam antes do aprovou (a ordem dos ids segue a ordem de gravação)
		const ids = todos.filter((evento) => evento.verbo !== "respondeu_questao").map((evento) => evento.id);
		expect(ids).toEqual([...ids].sort());

		// reconciliar de novo não acrescenta nada
		await editarHipotese(dados, { id, enunciado: "Confunde limite lateral com limite pontual" }, { agora: new Date(AGORA.getTime() + 120_000) });
		expect((await verbos()).filter((verbo) => verbo === "refletiu" || verbo === "propos_hipotese")).toEqual(["refletiu", "propos_hipotese"]);
	});

	it("parou depois do refletiu: refaz só o que falta (o propos_hipotese e o propos_mudanca_hipotese)", async () => {
		await cenario();
		// uma hipótese já existente para a reflexão propor uma mudança nela
		await registrarReflexao(dados, { resumo: resumo({ id: "r-1", propostas: 1, aceitas: 1 }), propostasValidas: [criar], agora: new Date(AGORA.getTime() - 86_400_000) });
		const alvo = (await lerHipoteses(dados)).hipoteses[0]!.id;
		disco.falhar = (evento) => evento.verbo !== "refletiu";
		await expect(
			registrarReflexao(dados, {
				resumo: resumo({ id: "r-2" }),
				propostasValidas: [
					{ ...criar, enunciado: "Troca o sinal ao passar o limite para o outro lado" },
					{ acao: "reforcar", hipotese: alvo, evidencias: ["ev005"], motivo: "de novo" },
				],
				agora: AGORA,
			}),
		).rejects.toThrow("disco falhou");
		expect(await verbos()).toEqual(["refletiu", "propos_hipotese", "refletiu"]);

		disco.falhar = undefined;
		await editarHipotese(dados, { id: alvo, status: "aprovada" }, { agora: new Date(AGORA.getTime() + 60_000) });
		const depois = (await eventosDoDisco()).filter((evento) => evento.verbo !== "respondeu_questao");
		expect(depois.map((evento) => evento.verbo)).toEqual(["refletiu", "propos_hipotese", "refletiu", "propos_hipotese", "propos_mudanca_hipotese", "editou_hipotese"]);
		expect(depois.filter((evento) => evento.verbo === "refletiu")).toHaveLength(2);
	});

	it("sem última reflexão no arquivo ou com tudo gravado, a reconciliação não grava nada", async () => {
		await cenario();
		await registrarReflexao(dados, { resumo: resumo(), propostasValidas: [criar], agora: AGORA });
		const antes = (await eventosDoDisco()).length;
		const id = (await lerHipoteses(dados)).hipoteses[0]!.id;
		await decidirHipotese(dados, { id, decisao: "rejeitar" }, { agora: new Date(AGORA.getTime() + 1000) });
		expect((await eventosDoDisco()).length).toBe(antes + 1);
	});
});
