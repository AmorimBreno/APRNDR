// Testes da escrita dos módulos (docs/escrita.md): as regras puras (validar,
// quais valem, a seção da mensagem, o retorno, a troca de um bloco e a
// validação de um bloco) e o disco numa pasta de dados temporária (o
// escrita.json, os eventos do aprendiz e o <módulo>.json reescrito).

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	apagarRegra,
	arquivoEscrita,
	conferirLimite,
	ErroEscrita,
	gravarBlocoReescrito,
	lerEscrita,
	MOTIVOS_RETORNO,
	NOMES_MOTIVO,
	type RegraEscrita,
	registrarRetorno,
	regrasQueValem,
	salvarRegra,
	secaoDasRegras,
	substituirBloco,
	validarRegra,
	validarRetorno,
} from "./escrita.ts";
import { lerEventos } from "./eventos.ts";
import { eventosAprendiz } from "./materias.ts";
import { caminhoDoModulo, ErroModulo, type Licao, lerModulo, type ModuloGerado, validarBloco, validarLicao, versaoDoBloco } from "./modulos.ts";

const AGORA = new Date("2026-10-28T13:00:00.000Z");
const DEPOIS = new Date("2026-10-28T14:00:00.000Z");
const MAIS_DEPOIS = new Date("2026-10-28T15:00:00.000Z");
const MODELO = "openrouter/openai/gpt-6.1-sol";

const regra = (id: string, materia: string | null, ativa = true): RegraEscrita => ({
	id,
	texto: `Regra ${id}.`,
	materia,
	ativa,
	criadaEm: AGORA.toISOString(),
	alteradaEm: AGORA.toISOString(),
	origem: "escrita",
});

describe("validarRegra", () => {
	it("apara o texto; matéria null, ausente ou um id; ativa ausente = true", () => {
		expect(validarRegra({ texto: "  Exemplo antes.  ", materia: null, ativa: false })).toEqual({ texto: "Exemplo antes.", materia: null, ativa: false });
		expect(validarRegra({ texto: "x" })).toEqual({ texto: "x", materia: null, ativa: true });
		expect(validarRegra({ id: "r-1", texto: "x", materia: "calculo-i", ativa: true })).toEqual({ id: "r-1", texto: "x", materia: "calculo-i", ativa: true });
		expect(validarRegra({ texto: "a".repeat(300), materia: null, ativa: true }).texto).toHaveLength(300);
	});

	it("texto vazio ou com mais de 300, matéria inválida, ativa que não é booleano: erro", () => {
		expect(() => validarRegra({ texto: "   ", materia: null, ativa: true })).toThrow(/sem texto/);
		expect(() => validarRegra({ texto: "a".repeat(301), materia: null, ativa: true })).toThrow(/301 caracteres/);
		expect(() => validarRegra({ texto: "x", materia: "../fora", ativa: true })).toThrow(ErroEscrita);
		expect(() => validarRegra({ texto: "x", materia: "", ativa: true })).toThrow(/matéria/);
		expect(() => validarRegra({ texto: "x", materia: 3, ativa: true })).toThrow(/matéria/);
		expect(() => validarRegra({ texto: "x", materia: null, ativa: "sim" })).toThrow(/sim ou não/);
		expect(() => validarRegra("x")).toThrow(ErroEscrita);
	});
});

describe("regrasQueValem", () => {
	it("as ativas, globais e da matéria, na ordem do arquivo; desligadas e de outra matéria ficam fora", () => {
		const regras = [regra("r1", null), regra("r2", "calc"), regra("r3", "fis"), regra("r4", null, false), regra("r5", "calc", false), regra("r6", null)];
		expect(regrasQueValem(regras, "calc").map((item) => item.id)).toEqual(["r1", "r2", "r6"]);
		expect(regrasQueValem(regras, "fis").map((item) => item.id)).toEqual(["r1", "r3", "r6"]);
		expect(regrasQueValem(regras, null).map((item) => item.id)).toEqual(["r1", "r6"]);
		expect(regrasQueValem([], "calc")).toEqual([]);
	});

	it("até 30, as primeiras na ordem", () => {
		const regras = Array.from({ length: 35 }, (_, indice) => regra(`r${indice + 1}`, indice % 2 === 0 ? null : "calc"));
		const valem = regrasQueValem(regras, "calc");
		expect(valem).toHaveLength(30);
		expect(valem[0]!.id).toBe("r1");
		expect(valem.at(-1)!.id).toBe("r30");
	});

	it("devolve cópias", () => {
		const regras = [regra("r1", null)];
		regrasQueValem(regras, null)[0]!.texto = "mudou";
		expect(regras[0]!.texto).toBe("Regra r1.");
	});
});

describe("conferirLimite", () => {
	it("31 valendo para uma matéria é erro; desligada não conta; global conta para cada matéria", () => {
		const trinta = Array.from({ length: 30 }, (_, indice) => regra(`r${indice}`, indice < 20 ? null : "calc"));
		expect(() => conferirLimite(trinta, { ativa: true, materia: "calc" })).not.toThrow();
		expect(() => conferirLimite([...trinta, regra("x", "calc")], { ativa: true, materia: "calc" })).toThrow(/30 regras ligadas valendo para a matéria calc/);
		expect(() => conferirLimite([...trinta, regra("x", "fis")], { ativa: true, materia: "fis" })).not.toThrow();
		expect(() => conferirLimite([...trinta, regra("x", null)], { ativa: true, materia: null })).toThrow(/matéria calc/);
		expect(() => conferirLimite([...trinta, regra("x", "calc", false)], { ativa: false, materia: "calc" })).not.toThrow();
	});
});

describe("secaoDasRegras", () => {
	it("o título e as regras numeradas, na ordem; sem regras, vazio", () => {
		expect(secaoDasRegras([{ texto: "Exemplo antes da definição." }, { texto: " Frases curtas. " }])).toBe(
			"Regras de escrita do Breno (obedeça sempre):\n1. Exemplo antes da definição.\n2. Frases curtas.",
		);
		expect(secaoDasRegras([])).toBe("");
	});
});

describe("validarRetorno", () => {
	it("avaliação, motivos sem repetir na ordem, texto aparado; virarRegra conferida", () => {
		expect(validarRetorno({ avaliacao: "melhorar", motivos: ["longo", "confuso", "longo"], texto: "  Muito longo.  " })).toEqual({ avaliacao: "melhorar", motivos: ["longo", "confuso"], texto: "Muito longo." });
		expect(validarRetorno({ avaliacao: "bom" })).toEqual({ avaliacao: "bom", motivos: [], texto: "" });
		expect(validarRetorno({ avaliacao: "melhorar", virarRegra: { texto: " Mais curto. ", materia: "calc" } }).virarRegra).toEqual({ texto: "Mais curto.", materia: "calc" });
	});

	it("avaliação, motivo ou texto inválido, regra sem texto: erro", () => {
		expect(() => validarRetorno({ avaliacao: "otimo" })).toThrow(/avaliação/);
		expect(() => validarRetorno({ avaliacao: "bom", motivos: ["chato"] })).toThrow(/desconhecido/);
		expect(() => validarRetorno({ avaliacao: "bom", motivos: "longo" })).toThrow(/lista/);
		expect(() => validarRetorno({ avaliacao: "bom", texto: "a".repeat(1001) })).toThrow(/1001/);
		expect(() => validarRetorno({ avaliacao: "bom", virarRegra: { texto: " ", materia: null } })).toThrow(/sem texto/);
	});

	it("um nome em pt-BR para cada motivo", () => {
		for (const motivo of MOTIVOS_RETORNO) expect(NOMES_MOTIVO[motivo]).toBeTruthy();
		expect(NOMES_MOTIVO.codigo_sem_explicacao).toBe("Código sem explicação");
		expect(NOMES_MOTIVO.erro).toBe("Algo errado");
	});
});

// --- Blocos ----------------------------------------------------------------------

const TRECHOS = [
	{ arquivo: "aula.pdf", local: "página 1", trecho: "pagina-1" },
	{ arquivo: "aula.pdf", local: "página 2", trecho: "pagina-2" },
];
const LICAO = { id: "l1", titulo: "A reta", objetivo: "", conceitos: ["c-a", "c-b"] };
const explicacao = (extra: Record<string, unknown> = {}) => ({ tipo: "explicacao", conceitos: ["c-a"], formato: "exemplo_resolvido", texto: "Um **exemplo**.", referencias: [{ arquivo: "aula.pdf", local: "página 1" }], ...extra });
const questaoAlternativa = (extra: Record<string, unknown> = {}) => ({
	tipo: "alternativa",
	conceitos: ["c-a"],
	enunciado: "Qual?",
	alternativas: [{ texto: "Certa", correta: true }, { texto: "Errada", confusao: "Confunde." }, { texto: "Outra", confusao: "Outra confusão." }],
	explicacao: "Porque.",
	referencias: [],
	...extra,
});
const umaLicao = (): Licao => validarLicao({ blocos: [explicacao(), questaoAlternativa()] }, { licao: LICAO, trechos: TRECHOS, escopo: "so_material" }).licao;
const moduloGerado = (materia: string, curso: string): ModuloGerado => ({
	versao: 1,
	id: "m1",
	curso,
	materia,
	situacao: "gerado",
	licoes: [umaLicao()],
	geradoEm: AGORA.toISOString(),
	modelo: MODELO,
	custo: 0.12,
	materiaisUsados: [{ arquivo: "aula.pdf", hash: "h-aula" }],
});

describe("validarBloco", () => {
	const opcoes = { licao: LICAO, trechos: TRECHOS, escopo: "so_material" as const, tipo: "explicacao" as const };

	it("confere pelas regras da lição: conceitos da lição, referências dos trechos, complemento; solto ou em {bloco}", () => {
		const bloco = validarBloco(explicacao({ conceitos: ["c-a", "c-z"], formato: "conceito", referencias: [{ arquivo: "aula.pdf", local: "página 2" }, { arquivo: "aula.pdf", local: "página 9" }] }), opcoes);
		expect(bloco).toEqual({ tipo: "explicacao", conceitos: ["c-a"], formato: "conceito", texto: "Um **exemplo**.", referencias: [TRECHOS[1]] });
		expect(validarBloco({ bloco: explicacao({ referencias: [] }) }, opcoes)).toMatchObject({ complemento: true, referencias: [] });
		expect(validarBloco(questaoAlternativa(), { ...opcoes, tipo: "alternativa" })).toMatchObject({ tipo: "alternativa", enunciado: "Qual?" });
	});

	it("bloco que não vale, de outro tipo ou ausente: ErroModulo com o motivo", () => {
		expect(() => validarBloco(explicacao({ texto: " " }), opcoes)).toThrow(/explicação vazia/);
		expect(() => validarBloco(explicacao({ conceitos: ["c-z"] }), opcoes)).toThrow(/fora da lição/);
		expect(() => validarBloco(questaoAlternativa(), opcoes)).toThrow(/precisava ser "explicacao"/);
		expect(() => validarBloco(questaoAlternativa({ alternativas: [{ texto: "a" }, { texto: "b", confusao: "x" }] }), { ...opcoes, tipo: "alternativa" })).toThrow(ErroModulo);
		expect(() => validarBloco(null, opcoes)).toThrow(/não devolveu o bloco/);
	});
});

describe("substituirBloco", () => {
	const novo = (texto = "Mais curto.") => validarBloco(explicacao({ texto, formato: "conceito" }), { licao: LICAO, trechos: TRECHOS, escopo: "so_material", tipo: "explicacao" });

	it("o novo no lugar com versao + 1 e reescritoEm; o antigo em anteriores; o id fica; o recebido não muda", () => {
		const modulo = moduloGerado("calc", "p1");
		const antes = structuredClone(modulo);
		const antigo = modulo.licoes[0]!.blocos[0]!;
		expect(versaoDoBloco(antigo)).toBe(1);
		const trocado = substituirBloco(modulo, "l1", "l1-b1", novo(), { retornoId: "ev-1", agora: DEPOIS });
		expect(modulo).toEqual(antes);
		const bloco = trocado.licoes[0]!.blocos[0]!;
		expect(bloco).toMatchObject({ id: "l1-b1", tipo: "explicacao", texto: "Mais curto.", formato: "conceito", versao: 2, reescritoEm: DEPOIS.toISOString() });
		expect(bloco.anteriores).toEqual([{ ...antigo, versao: 1, substituidoEm: DEPOIS.toISOString(), retorno: "ev-1" }]);
		expect(trocado.licoes[0]!.blocos[1]).toEqual(modulo.licoes[0]!.blocos[1]);
		expect(trocado.licoes[0]!.blocos).toHaveLength(2);

		const outra = substituirBloco(trocado, "l1", "l1-b1", novo("Terceira."), { retornoId: "ev-2", agora: MAIS_DEPOIS });
		const terceira = outra.licoes[0]!.blocos[0]!;
		expect(terceira).toMatchObject({ id: "l1-b1", texto: "Terceira.", versao: 3, reescritoEm: MAIS_DEPOIS.toISOString() });
		expect(terceira.anteriores!.map((item) => [item.versao, item.retorno])).toEqual([
			[1, "ev-1"],
			[2, "ev-2"],
		]);
		expect(terceira.anteriores![1]).not.toHaveProperty("anteriores");
		expect(terceira.anteriores![1]).toMatchObject({ texto: "Mais curto.", reescritoEm: DEPOIS.toISOString(), substituidoEm: MAIS_DEPOIS.toISOString() });
	});

	it("o id e os campos de versão do novo são ignorados", () => {
		const trocado = substituirBloco(moduloGerado("calc", "p1"), "l1", "l1-b1", { ...novo(), id: "x", versao: 9, anteriores: [] } as never, { retornoId: "ev-1", agora: DEPOIS });
		expect(trocado.licoes[0]!.blocos[0]).toMatchObject({ id: "l1-b1", versao: 2 });
		expect(trocado.licoes[0]!.blocos[0]!.anteriores).toHaveLength(1);
	});

	it("tipo diferente, lição ou bloco que não existe, sem retorno, módulo aguardando: erro", () => {
		const modulo = moduloGerado("calc", "p1");
		expect(() => substituirBloco(modulo, "l1", "l1-b2", novo(), { retornoId: "ev-1" })).toThrow(/não muda o tipo/);
		expect(() => substituirBloco(modulo, "l9", "l1-b1", novo(), { retornoId: "ev-1" })).toThrow(/lição "l9"/);
		expect(() => substituirBloco(modulo, "l1", "l1-b9", novo(), { retornoId: "ev-1" })).toThrow(/bloco "l1-b9"/);
		expect(() => substituirBloco(modulo, "l1", "l1-b1", novo(), { retornoId: "" })).toThrow(/id do retorno/);
		const aguardando = { versao: 1, id: "m1", curso: "p1", materia: "calc", situacao: "aguardando_material", aguardando: { nota: "", desde: AGORA.toISOString(), prontos: [] }, licoes: [] } as const;
		expect(() => substituirBloco(aguardando as never, "l1", "l1-b1", novo(), { retornoId: "ev-1" })).toThrow(ErroEscrita);
	});
});

// --- Disco -----------------------------------------------------------------------

describe("no disco", () => {
	let dados: string;
	const MATERIA = "calculo-i";
	const CURSO = "p1-regressao";
	const doAprendiz = async () => (await lerEventos(eventosAprendiz(dados))).eventos;

	beforeEach(async () => {
		dados = await mkdtemp(join(tmpdir(), "estudos-escrita-"));
	});

	afterEach(async () => {
		await rm(dados, { recursive: true, force: true });
	});

	it("sem arquivo, nenhuma regra", async () => {
		expect(await lerEscrita(dados)).toEqual({ versao: 1, regras: [] });
	});

	it("criar, alterar e apagar: o arquivo e os eventos", async () => {
		const criada = await salvarRegra(dados, { texto: " Exemplo antes da definição. ", materia: null, ativa: true }, { agora: AGORA, sessao: "s1" });
		expect(criada.regra).toMatchObject({ texto: "Exemplo antes da definição.", materia: null, ativa: true, criadaEm: AGORA.toISOString(), alteradaEm: AGORA.toISOString(), origem: "escrita" });
		expect(criada.regra.id).toMatch(/^r-/);
		const segunda = await salvarRegra(dados, { texto: "Gráficos com eixos.", materia: MATERIA, ativa: true }, { agora: AGORA });
		expect((await lerEscrita(dados)).regras.map((item) => item.id)).toEqual([criada.regra.id, segunda.regra.id]);

		const bruto = await readFile(arquivoEscrita(dados), "utf8");
		expect(bruto.endsWith("}\n")).toBe(true);
		expect(Object.keys(JSON.parse(bruto).regras[0])).toEqual(["id", "texto", "materia", "ativa", "criadaEm", "alteradaEm", "origem"]);

		const alterada = await salvarRegra(dados, { id: segunda.regra.id, texto: "Gráficos com eixos.", materia: null, ativa: false }, { agora: DEPOIS });
		expect(alterada.regra).toMatchObject({ materia: null, ativa: false, criadaEm: AGORA.toISOString(), alteradaEm: DEPOIS.toISOString(), origem: "escrita" });
		expect(alterada.regras).toEqual((await lerEscrita(dados)).regras);

		const quantos = (await doAprendiz()).length;
		await salvarRegra(dados, { id: segunda.regra.id, texto: "Gráficos com eixos.", materia: null, ativa: false }, { agora: MAIS_DEPOIS });
		expect(await doAprendiz()).toHaveLength(quantos);
		expect((await lerEscrita(dados)).regras[1]!.alteradaEm).toBe(DEPOIS.toISOString());

		const ficaram = await apagarRegra(dados, criada.regra.id, { agora: MAIS_DEPOIS });
		expect(ficaram.map((item) => item.id)).toEqual([segunda.regra.id]);
		expect((await lerEscrita(dados)).regras.map((item) => item.id)).toEqual([segunda.regra.id]);

		const eventos = await doAprendiz();
		expect(eventos.map((evento) => evento.verbo)).toEqual(["criou_regra_escrita", "criou_regra_escrita", "alterou_regra_escrita", "apagou_regra_escrita"]);
		expect(eventos[0]).toMatchObject({ sessao: "s1", ts: AGORA.toISOString(), objeto: { regra: criada.regra.id }, resultado: { texto: "Exemplo antes da definição.", ativa: true, origem: "escrita" } });
		expect(eventos[0]!.objeto).not.toHaveProperty("materia");
		expect(eventos[1]).toMatchObject({ objeto: { regra: segunda.regra.id, materia: MATERIA } });
		expect(eventos[2]).toMatchObject({
			ts: DEPOIS.toISOString(),
			objeto: { regra: segunda.regra.id },
			resultado: { texto: "Gráficos com eixos.", mudou: ["materia", "ativa"], antes: { materia: MATERIA, ativa: true }, depois: { materia: null, ativa: false } },
		});
		expect(eventos[3]).toMatchObject({ objeto: { regra: criada.regra.id }, resultado: { texto: "Exemplo antes da definição." } });
	});

	it("id que não existe e o limite de 30 ativas: erro, nada gravado", async () => {
		await expect(salvarRegra(dados, { id: "r-nada", texto: "x", materia: null, ativa: true })).rejects.toThrow(/Não achei a regra/);
		await expect(apagarRegra(dados, "r-nada")).rejects.toThrow(ErroEscrita);
		for (let indice = 0; indice < 30; indice++) await salvarRegra(dados, { texto: `Regra ${indice}.`, materia: null, ativa: true }, { agora: AGORA });
		await expect(salvarRegra(dados, { texto: "A 31ª.", materia: MATERIA, ativa: true })).rejects.toThrow(/30 regras ligadas/);
		const desligada = await salvarRegra(dados, { texto: "Desligada.", materia: MATERIA, ativa: false });
		await expect(salvarRegra(dados, { ...desligada.regra, ativa: true })).rejects.toThrow(/30 regras ligadas/);
		expect((await lerEscrita(dados)).regras).toHaveLength(31);
		expect((await doAprendiz()).filter((evento) => evento.verbo === "criou_regra_escrita")).toHaveLength(31);
	});

	it("escrita.json ilegível: erro claro e o arquivo não é sobrescrito", async () => {
		await mkdir(dirname(arquivoEscrita(dados)), { recursive: true });
		for (const conteudo of ["{ não é json", JSON.stringify({ versao: 2, regras: [] }), JSON.stringify({ versao: 1, regras: [{ id: "r1", texto: "x", materia: null, ativa: "sim" }] })]) {
			await writeFile(arquivoEscrita(dados), conteudo, "utf8");
			await expect(lerEscrita(dados)).rejects.toThrow(/Não consegui ler as regras de escrita .*nada foi gravado por cima/);
			await expect(salvarRegra(dados, { texto: "Nova.", materia: null, ativa: true })).rejects.toThrow(ErroEscrita);
			await expect(apagarRegra(dados, "r1")).rejects.toThrow(ErroEscrita);
			expect(await readFile(arquivoEscrita(dados), "utf8")).toBe(conteudo);
		}
		expect(await doAprendiz()).toEqual([]);
	});

	const dadosRetorno = (extra: Record<string, unknown> = {}) => ({
		materia: MATERIA,
		curso: CURSO,
		modulo: "m1",
		licao: "l1",
		bloco: "l1-b1",
		tipo: "explicacao" as const,
		conceitos: ["c-a"],
		avaliacao: "melhorar",
		motivos: ["longo", "abstrato"],
		texto: " Longo e sem exemplo. ",
		modelo: MODELO,
		prompt: { nome: "modulo-licao.md", hash: "abc" },
		...extra,
	});

	it("registrarRetorno: o avaliou_bloco com objeto, resultado e contexto; sem versão, 1; vários retornos ficam", async () => {
		const primeiro = await registrarRetorno(dados, dadosRetorno(), { agora: AGORA, sessao: "s1" });
		const segundo = await registrarRetorno(dados, dadosRetorno({ avaliacao: "bom", motivos: [], texto: "", versao: 2, prompt: undefined }), { agora: DEPOIS });
		expect(primeiro.regra).toBeUndefined();
		const eventos = await doAprendiz();
		expect(eventos.map((evento) => evento.id)).toEqual([primeiro.retorno, segundo.retorno]);
		expect(eventos[0]).toEqual({
			id: primeiro.retorno,
			ts: AGORA.toISOString(),
			sessao: "s1",
			verbo: "avaliou_bloco",
			objeto: { materia: MATERIA, curso: CURSO, modulo: "m1", licao: "l1", bloco: "l1-b1", tipo: "explicacao", conceitos: ["c-a"] },
			resultado: { avaliacao: "melhorar", motivos: ["longo", "abstrato"], texto: "Longo e sem exemplo." },
			contexto: { modelo: MODELO, prompt: { nome: "modulo-licao.md", hash: "abc" }, versao: 1 },
		});
		expect(eventos[1]).toMatchObject({ resultado: { avaliacao: "bom", motivos: [], texto: "" }, contexto: { modelo: MODELO, versao: 2 } });
		expect(eventos[1]!.contexto).not.toHaveProperty("prompt");
		expect(await lerEscrita(dados)).toEqual({ versao: 1, regras: [] });
	});

	it("registrarRetorno com virarRegra: a regra com origem retorno e o id do evento", async () => {
		const feito = await registrarRetorno(dados, dadosRetorno({ virarRegra: { texto: " Sempre um exemplo. ", materia: MATERIA } }), { agora: AGORA });
		expect(feito.regra).toMatchObject({ texto: "Sempre um exemplo.", materia: MATERIA, ativa: true, origem: "retorno", retorno: feito.retorno });
		expect((await lerEscrita(dados)).regras).toEqual([feito.regra]);
		const eventos = await doAprendiz();
		expect(eventos.map((evento) => evento.verbo)).toEqual(["avaliou_bloco", "criou_regra_escrita"]);
		expect(eventos[1]).toMatchObject({ objeto: { regra: feito.regra!.id, materia: MATERIA }, resultado: { origem: "retorno", retorno: feito.retorno } });
		const global = await registrarRetorno(dados, dadosRetorno({ virarRegra: { texto: "Frases curtas.", materia: null } }), { agora: DEPOIS });
		expect(global.regra).toMatchObject({ materia: null, origem: "retorno", retorno: global.retorno });
	});

	it("registrarRetorno inválido (avaliação, matéria da regra, limite): erro e nenhum evento", async () => {
		await expect(registrarRetorno(dados, dadosRetorno({ avaliacao: "otimo" }))).rejects.toThrow(/avaliação/);
		await expect(registrarRetorno(dados, dadosRetorno({ virarRegra: { texto: "x", materia: "outra" } }))).rejects.toThrow(/matéria do bloco/);
		await expect(registrarRetorno(dados, dadosRetorno({ bloco: "" }))).rejects.toThrow(/sem bloco/);
		await expect(registrarRetorno(dados, dadosRetorno({ tipo: "video" }))).rejects.toThrow(/tipo do bloco/);
		expect(await doAprendiz()).toEqual([]);
		for (let indice = 0; indice < 30; indice++) await salvarRegra(dados, { texto: `Regra ${indice}.`, materia: null, ativa: true }, { agora: AGORA });
		const antes = (await doAprendiz()).length;
		await expect(registrarRetorno(dados, dadosRetorno({ virarRegra: { texto: "A 31ª.", materia: null } }))).rejects.toThrow(/30 regras ligadas/);
		expect(await doAprendiz()).toHaveLength(antes);
	});

	async function gravarModuloNoDisco(modulo: ModuloGerado): Promise<void> {
		const arquivo = caminhoDoModulo(dados, modulo.materia, modulo.curso, modulo.id);
		await mkdir(dirname(arquivo), { recursive: true });
		await writeFile(arquivo, `${JSON.stringify(modulo, null, "\t")}\n`, "utf8");
	}

	const novoBloco = (texto: string) => validarBloco(explicacao({ texto }), { licao: LICAO, trechos: TRECHOS, escopo: "so_material", tipo: "explicacao" });
	const reescrita = (retornoId: string) => ({ retornoId, modelo: MODELO, prompt: { nome: "modulo-bloco.md", hash: "def" }, custo: 0.01 });

	it("gravarBlocoReescrito: o módulo gravado com as versões e o reescreveu_bloco", async () => {
		const original = moduloGerado(MATERIA, CURSO);
		await gravarModuloNoDisco(original);
		const lido = await lerModulo(dados, MATERIA, CURSO, "m1");
		expect(lido).toEqual(original);
		expect(versaoDoBloco(lido!.licoes[0]!.blocos[0]!)).toBe(1);

		const gravado = await gravarBlocoReescrito(dados, MATERIA, CURSO, "m1", "l1", "l1-b1", novoBloco("Versão 2."), reescrita("ev-1"), { agora: DEPOIS, sessao: "s2" });
		expect(await lerModulo(dados, MATERIA, CURSO, "m1")).toEqual(gravado);
		const bloco = gravado.licoes[0]!.blocos[0]!;
		expect(bloco).toMatchObject({ id: "l1-b1", texto: "Versão 2.", versao: 2, reescritoEm: DEPOIS.toISOString() });
		expect(bloco.anteriores).toEqual([{ ...original.licoes[0]!.blocos[0]!, versao: 1, substituidoEm: DEPOIS.toISOString(), retorno: "ev-1" }]);
		expect(gravado).toMatchObject({ custo: 0.12, geradoEm: AGORA.toISOString(), modelo: MODELO });

		await gravarBlocoReescrito(dados, MATERIA, CURSO, "m1", "l1", "l1-b1", novoBloco("Versão 3."), reescrita("ev-2"), { agora: MAIS_DEPOIS });
		const final = (await lerModulo(dados, MATERIA, CURSO, "m1")) as ModuloGerado;
		expect(final.licoes[0]!.blocos[0]).toMatchObject({ texto: "Versão 3.", versao: 3 });
		expect(final.licoes[0]!.blocos[0]!.anteriores!.map((item) => item.versao)).toEqual([1, 2]);

		const eventos = await doAprendiz();
		expect(eventos.map((evento) => evento.verbo)).toEqual(["reescreveu_bloco", "reescreveu_bloco"]);
		expect(eventos[0]).toMatchObject({
			sessao: "s2",
			ts: DEPOIS.toISOString(),
			objeto: { materia: MATERIA, curso: CURSO, modulo: "m1", licao: "l1", bloco: "l1-b1", tipo: "explicacao", conceitos: ["c-a"] },
			resultado: { de: 1, para: 2, retorno: "ev-1" },
			contexto: { modelo: MODELO, prompt: { nome: "modulo-bloco.md", hash: "def" }, custo: 0.01 },
		});
		expect(eventos[1]).toMatchObject({ resultado: { de: 2, para: 3, retorno: "ev-2" } });
	});

	it("gravarBlocoReescrito: tipo diferente, sem módulo ou módulo ilegível: erro e nada gravado", async () => {
		await expect(gravarBlocoReescrito(dados, MATERIA, CURSO, "m1", "l1", "l1-b1", novoBloco("x"), reescrita("ev-1"))).rejects.toThrow(/ainda não foi gerado/);
		const original = moduloGerado(MATERIA, CURSO);
		await gravarModuloNoDisco(original);
		const bruto = await readFile(caminhoDoModulo(dados, MATERIA, CURSO, "m1"), "utf8");
		await expect(gravarBlocoReescrito(dados, MATERIA, CURSO, "m1", "l1", "l1-b2", novoBloco("x"), reescrita("ev-1"))).rejects.toThrow(/não muda o tipo/);
		expect(await readFile(caminhoDoModulo(dados, MATERIA, CURSO, "m1"), "utf8")).toBe(bruto);
		await writeFile(caminhoDoModulo(dados, MATERIA, CURSO, "m1"), "{ quebrado", "utf8");
		await expect(gravarBlocoReescrito(dados, MATERIA, CURSO, "m1", "l1", "l1-b1", novoBloco("x"), reescrita("ev-1"))).rejects.toThrow(ErroModulo);
		expect(await readFile(caminhoDoModulo(dados, MATERIA, CURSO, "m1"), "utf8")).toBe("{ quebrado");
		expect(await doAprendiz()).toEqual([]);
	});
});
