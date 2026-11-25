// Leitura do ambiente da janela própria (sem DOM: só o objeto que o preload expõe).

import { describe, expect, it } from "vitest";
import { lerAmbienteDesktop, lerDisposicao, lerPonteBolinha, lerPonteFlutuante, marcarRotaFlutuante } from "./desktop.ts";

describe("lerAmbienteDesktop", () => {
	it("no navegador comum não há ambiente", () => {
		expect(lerAmbienteDesktop({})).toBeUndefined();
	});

	it("lê o que o preload expõe", () => {
		const sair = async () => {};
		const ambiente = lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: 32, sair } });
		expect(ambiente).toMatchObject({ plataforma: "win32", alturaBarra: 32 });
		expect(typeof ambiente?.sair).toBe("function");
	});

	it("o sair chama o sair do preload", async () => {
		let chamado = 0;
		const ambiente = lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: 32, sair: async () => void chamado++ } });
		await ambiente?.sair();
		expect(chamado).toBe(1);
	});

	it("ignora algo inesperado em vez de ligar a barra", () => {
		expect(lerAmbienteDesktop({ estudosDesktop: "sim" })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: null })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32" } })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: 32 } })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: 0, sair() {} } })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: "win32", alturaBarra: Number.NaN, sair() {} } })).toBeUndefined();
		expect(lerAmbienteDesktop({ estudosDesktop: { plataforma: 1, alturaBarra: 32, sair() {} } })).toBeUndefined();
	});
});

const funcoes = (nomes: string[]) => Object.fromEntries(nomes.map((nome) => [nome, () => {}]));
const NOMES_FLUTUANTE = ["modo", "disposicao", "expandir", "recolher", "moverPara", "capturarTela", "abrirApp", "esconder", "aoMudarModo", "aoAlternarVoz"];

describe("a ponte do professor flutuante", () => {
	const base = { plataforma: "win32", alturaBarra: 32, sair() {} };

	it("o ambiente leva a ponte da bolinha e a que liga e desliga, quando o preload as expõe inteiras", () => {
		const flutuante = funcoes(NOMES_FLUTUANTE);
		const bolinha = funcoes(["ligada", "ligar"]);
		const ambiente = lerAmbienteDesktop({ estudosDesktop: { ...base, flutuante, bolinha } });
		expect(ambiente?.flutuante).toBe(flutuante);
		expect(ambiente?.bolinha).toBe(bolinha);
		expect(lerAmbienteDesktop({ estudosDesktop: base })).not.toHaveProperty("flutuante");
		expect(lerAmbienteDesktop({ estudosDesktop: base })).not.toHaveProperty("bolinha");
	});

	it("uma ponte incompleta ou de outro tipo é ignorada", () => {
		const incompleta = funcoes(NOMES_FLUTUANTE.slice(1));
		expect(lerPonteFlutuante({ estudosDesktop: { ...base, flutuante: incompleta } })).toBeUndefined();
		expect(lerPonteFlutuante({ estudosDesktop: { ...base, flutuante: "sim" } })).toBeUndefined();
		expect(lerPonteFlutuante({ estudosDesktop: { ...base, flutuante: { ...funcoes(NOMES_FLUTUANTE), modo: 1 } } })).toBeUndefined();
		expect(lerPonteBolinha({ estudosDesktop: { ...base, bolinha: funcoes(["ligada"]) } })).toBeUndefined();
		expect(lerPonteBolinha({ estudosDesktop: { ...base, bolinha: null } })).toBeUndefined();
		expect(lerPonteBolinha({})).toBeUndefined();
	});

	it("a janela da bolinha lê a ponte mesmo sem o resto do ambiente", () => {
		const flutuante = funcoes(NOMES_FLUTUANTE);
		expect(lerPonteFlutuante({ estudosDesktop: { flutuante } })).toBe(flutuante);
		expect(lerPonteFlutuante({})).toBeUndefined();
	});

	it("marca só a rota da bolinha como transparente", () => {
		const janela = (hash: string) => ({ location: { hash }, document: { documentElement: { classList: { add: (nome: string) => (marcadas.push(nome), undefined) } } } }) as unknown as Window;
		const marcadas: string[] = [];
		marcarRotaFlutuante(janela("#/perfil/estudos"));
		expect(marcadas).toEqual([]);
		marcarRotaFlutuante(janela("#/flutuante/estudos"));
		expect(marcadas).toEqual(["rota-flutuante"]);
	});
});

describe("lerDisposicao", () => {
	const boa = { janela: { x: 1, y: 2, width: 510, height: 620 }, bolinha: { x: 0, y: 0 }, balao: { x: 90, y: 0, width: 420, height: 620 }, lado: "direita", ponta: { y: 38 } };

	it("aceita uma disposição inteira", () => {
		expect(lerDisposicao(boa)).toEqual(boa);
	});

	it("recusa null, lixo, lado errado e números faltando", () => {
		expect(lerDisposicao(null)).toBeUndefined();
		expect(lerDisposicao("chat")).toBeUndefined();
		expect(lerDisposicao({ ...boa, lado: "cima" })).toBeUndefined();
		expect(lerDisposicao({ ...boa, ponta: {} })).toBeUndefined();
		expect(lerDisposicao({ ...boa, balao: { x: 0, y: 0, width: "420", height: 620 } })).toBeUndefined();
		expect(lerDisposicao({ ...boa, bolinha: { x: Number.NaN, y: 0 } })).toBeUndefined();
	});
});
