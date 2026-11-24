import { describe, expect, it } from "vitest";
import {
	atalhoDeInicializacao,
	corrigirPosicao,
	gravarFlutuante,
	lerFlutuante,
	MARGEM_PRIMEIRA_VEZ,
	pastaInicializar,
	posicaoDoChat,
	posicaoInicial,
	tamanhoDaCaptura,
	TAMANHO_BOLINHA,
	TAMANHO_CHAT,
} from "./estado-flutuante.mjs";

const tela = { x: 0, y: 0, width: 1920, height: 1040 };

describe("flutuante.json", () => {
	it("sem arquivo ou estragado, usa o padrão (ligada, sem posição)", () => {
		const padrao = { ligada: true, inicioComWindowsEscolhido: false };
		expect(lerFlutuante(undefined)).toEqual(padrao);
		expect(lerFlutuante("{estragado")).toEqual(padrao);
		expect(lerFlutuante("42")).toEqual(padrao);
		expect(lerFlutuante("null")).toEqual(padrao);
	});

	it("lê os campos válidos e descarta os de tipo errado", () => {
		expect(lerFlutuante(JSON.stringify({ ligada: false, x: 10.4, y: 20.6, inicioComWindowsEscolhido: true }))).toEqual({
			ligada: false,
			x: 10,
			y: 21,
			inicioComWindowsEscolhido: true,
		});
		expect(lerFlutuante(JSON.stringify({ ligada: "não", x: "a", y: 5, inicioComWindowsEscolhido: 1 }))).toEqual({ ligada: true, inicioComWindowsEscolhido: false });
	});

	it("grava e lê de volta", () => {
		const estado = { ligada: false, x: 100, y: 200, inicioComWindowsEscolhido: true };
		expect(lerFlutuante(gravarFlutuante(estado))).toEqual(estado);
		expect(lerFlutuante(gravarFlutuante({ ligada: true, inicioComWindowsEscolhido: false }))).toEqual({ ligada: true, inicioComWindowsEscolhido: false });
	});
});

describe("posição da bolinha", () => {
	it("primeira vez: canto inferior direito, com margem", () => {
		const p = corrigirPosicao({}, [tela]);
		expect(p).toEqual({ x: 1920 - TAMANHO_BOLINHA.width - MARGEM_PRIMEIRA_VEZ, y: 1040 - TAMANHO_BOLINHA.height - MARGEM_PRIMEIRA_VEZ });
		expect(p).toEqual(posicaoInicial(tela));
	});

	it("posição visível fica como está", () => {
		expect(corrigirPosicao({ x: 300, y: 400 }, [tela])).toEqual({ x: 300, y: 400 });
	});

	it("monitor desligado: volta para a tela que existe", () => {
		expect(corrigirPosicao({ x: 3000, y: 200 }, [tela])).toEqual({ x: 1920 - 76, y: 200 });
	});

	it("meio para fora da tela é puxada para dentro; a segunda tela vale", () => {
		expect(corrigirPosicao({ x: -50, y: -10 }, [tela])).toEqual({ x: 0, y: 0 });
		const segunda = { x: 1920, y: 0, width: 1280, height: 1000 };
		expect(corrigirPosicao({ x: 2500, y: 300 }, [tela, segunda])).toEqual({ x: 2500, y: 300 });
	});
});

describe("posição do chat", () => {
	it("no meio da tela cresce para a direita e para baixo", () => {
		expect(posicaoDoChat({ x: 200, y: 100 }, tela)).toEqual({ x: 200, y: 100 });
	});

	it("no canto direito abre para a esquerda", () => {
		const { x, y } = posicaoDoChat({ x: 1820, y: 100 }, tela);
		expect(x).toBe(1820 + 76 - TAMANHO_CHAT.width);
		expect(y).toBe(100);
	});

	it("embaixo abre para cima", () => {
		const { x, y } = posicaoDoChat({ x: 200, y: 940 }, tela);
		expect(x).toBe(200);
		expect(y).toBe(940 + 76 - TAMANHO_CHAT.height);
	});

	it("no canto inferior direito abre para cima e para a esquerda, sempre dentro da área", () => {
		const p = posicaoDoChat(posicaoInicial(tela), tela);
		expect(p.x).toBeGreaterThanOrEqual(0);
		expect(p.x + TAMANHO_CHAT.width).toBeLessThanOrEqual(1920);
		expect(p.y + TAMANHO_CHAT.height).toBeLessThanOrEqual(1040);
	});

	it("área menor que o chat: fica no canto da área", () => {
		expect(posicaoDoChat({ x: 50, y: 50 }, { x: 0, y: 0, width: 300, height: 400 })).toEqual({ x: 0, y: 0 });
	});
});

describe("captura e atalho", () => {
	it("limita o lado maior a 2000 px", () => {
		expect(tamanhoDaCaptura(3840, 2160)).toEqual({ width: 2000, height: 1125 });
		expect(tamanhoDaCaptura(1366, 768)).toEqual({ width: 1366, height: 768 });
	});

	it("o atalho de inicialização roda o iniciar.vbs com --bandeja", () => {
		const a = atalhoDeInicializacao({ raiz: "C:\\Users\\breno\\Projects\\studies", pastaDoSistema: "C:\\WINDOWS", icone: "C:\\i.ico" });
		expect(a.target).toBe("C:\\WINDOWS\\System32\\wscript.exe");
		expect(a.args).toBe('"C:\\Users\\breno\\Projects\\studies\\launcher\\iniciar.vbs" --bandeja');
		expect(a.cwd).toBe("C:\\Users\\breno\\Projects\\studies");
		expect(a.icon).toBe("C:\\i.ico");
		expect(pastaInicializar("C:\\Users\\b\\AppData\\Roaming")).toBe("C:\\Users\\b\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup");
	});
});
