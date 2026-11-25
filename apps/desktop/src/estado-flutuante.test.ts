import { describe, expect, it } from "vitest";
import {
	atalhoDeInicializacao,
	corrigirPosicao,
	gravarFlutuante,
	lerFlutuante,
	MARGEM_PRIMEIRA_VEZ,
	pastaInicializar,
	balaoPelaBolinha,
	bolinhaPeloBalao,
	deslocamentoDoBalao,
	disposicaoDoBalao,
	disposicaoDoChat,
	VAO_BALAO,
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

describe("disposição do chat (balão ao lado da bolinha)", () => {
	const B = TAMANHO_BOLINHA.width;
	const { width: LB, height: AB } = TAMANHO_CHAT;

	it("no canto superior esquerdo: balão à direita, topo com topo", () => {
		const d = disposicaoDoChat({ x: 10, y: 10 }, tela);
		expect(d.lado).toBe("direita");
		expect(d.janela).toEqual({ x: 10, y: 10, width: B + VAO_BALAO + LB, height: AB });
		expect(d.bolinha).toEqual({ x: 0, y: 0 });
		expect(d.balao).toEqual({ x: B + VAO_BALAO, y: 0, width: LB, height: AB });
		expect(d.ponta.y).toBe(38);
	});

	it("no canto superior direito: balão à esquerda; a bolinha fica onde estava na tela", () => {
		const d = disposicaoDoChat({ x: 1800, y: 10 }, tela);
		expect(d.lado).toBe("esquerda");
		expect(d.balao.x).toBe(0);
		expect(d.bolinha.x).toBe(LB + VAO_BALAO);
		expect(d.janela.x + d.bolinha.x).toBe(1800);
		expect(d.janela.y + d.bolinha.y).toBe(10);
	});

	it("no canto inferior esquerdo: o fundo do balão alinha com o fundo da bolinha", () => {
		const d = disposicaoDoChat({ x: 10, y: 950 }, tela);
		expect(d.lado).toBe("direita");
		expect(d.janela.y + d.balao.y + AB).toBe(950 + B);
		expect(d.bolinha.y).toBe(AB - B);
		expect(d.ponta.y).toBe(AB - B / 2);
	});

	it("no canto inferior direito: esquerda e para cima, tudo dentro da área", () => {
		const p = { x: 1840, y: 950 };
		const d = disposicaoDoChat(p, tela);
		expect(d.lado).toBe("esquerda");
		expect(d.janela.x).toBeGreaterThanOrEqual(0);
		expect(d.janela.y).toBeGreaterThanOrEqual(0);
		expect(d.janela.x + d.janela.width).toBeLessThanOrEqual(1920);
		expect(d.janela.y + d.janela.height).toBeLessThanOrEqual(1040);
		expect({ x: d.janela.x + d.bolinha.x, y: d.janela.y + d.bolinha.y }).toEqual(p);
	});

	it("o balão que não cabe na vertical desliza para dentro da área, sem mexer na bolinha", () => {
		const d = disposicaoDoChat({ x: 100, y: 300 }, { x: 0, y: 0, width: 1920, height: 700 });
		expect(d.janela.y + d.balao.y).toBe(700 - AB);
		expect(d.janela.y + d.bolinha.y).toBe(300);
		const d2 = disposicaoDoChat({ x: 100, y: 400 }, { x: 0, y: 100, width: 1920, height: 600 });
		expect(d2.janela.y + d2.balao.y).toBe(100);
		expect(d2.janela.y + d2.bolinha.y).toBe(400);
	});

	it("o que não cabe do lado escolhido usa o outro", () => {
				const d = disposicaoDoChat({ x: 450, y: 100 }, { x: 0, y: 0, width: 1000, height: 1040 }, { width: 520, height: 620 });
		// Centro 488 < 500 (queria a direita): 450+76+14+520 = 1060 > 1000, não cabe; à esquerda 450-14-520 < 0, também não: o de mais folga (direita 474 > esquerda 450).
		expect(d.lado).toBe("direita");
		const e = disposicaoDoChat({ x: 460, y: 100 }, { x: 0, y: 0, width: 1100, height: 1040 }, { width: 440, height: 620 });
		// Centro 498 < 550 (direita): 460+76+14+440 = 990 cabe. Já em x=600 (centro 638 > 550) a esquerda cabe.
		expect(e.lado).toBe("direita");
		const f = disposicaoDoChat({ x: 530, y: 100 }, { x: 0, y: 0, width: 1100, height: 1040 }, { width: 520, height: 620 });
		// Centro 568 > 550 (esquerda): 530-14-520 = -4 < 0, não cabe; à direita 530+76+14+520 = 1140 > 1100, também não: mais folga é a direita (494 > 530? não): esquerda.
		expect(f.lado).toBe("esquerda");
		const g = disposicaoDoChat({ x: 300, y: 100 }, { x: 0, y: 0, width: 920, height: 1040 }, { width: 420, height: 620 });
		// Centro 338 < 460 (direita): 300+76+14+420 = 810 cabe.
		expect(g.lado).toBe("direita");
		const h = disposicaoDoChat({ x: 450, y: 100 }, { x: 0, y: 0, width: 900, height: 1040 });
		// Centro 488 > 450 (esquerda): 450-14-420 = 16 cabe.
		expect(h.lado).toBe("esquerda");
		const i = disposicaoDoChat({ x: 440, y: 100 }, { x: 0, y: 0, width: 960, height: 1040 }, { width: 450, height: 620 });
		// Centro 478 < 480 (direita): 440+76+14+450 = 980 > 960 não cabe; esquerda: 440-14-450 = -24 não cabe; folga: direita 444, esquerda 440 -> direita.
		expect(i.lado).toBe("direita");
	});

	it("a ponta fica a 24 px das bordas do balão, no máximo", () => {
		expect(disposicaoDoChat({ x: 10, y: 1040 - B }, tela).ponta.y).toBe(AB - B / 2);
		const d = disposicaoDoChat({ x: 10, y: 300 }, { x: 0, y: 0, width: 1920, height: 650 });
		// Centro em 338 na metade de baixo: o balão sobe até o topo da área (0), e a ponta fica em 338.
		expect(d.ponta.y).toBe(338);
		const extremo = disposicaoDoChat({ x: 10, y: 0 }, { x: 0, y: 0, width: 1920, height: 300 });
		expect(extremo.ponta.y).toBeGreaterThanOrEqual(24);
		expect(extremo.ponta.y).toBeLessThanOrEqual(AB - 24);
		// Bolinha bem abaixo do balão deslizado: a ponta para na margem de baixo.
		const longe = disposicaoDoChat({ x: 10, y: 600 }, { x: 0, y: 0, width: 1920, height: 650 });
		expect(longe.ponta.y).toBe(AB - 24);
	});

	it("a janela contém a bolinha e o balão", () => {
		for (const p of [{ x: 0, y: 0 }, { x: 960, y: 500 }, { x: 1844, y: 964 }, { x: 5, y: 700 }]) {
			const d = disposicaoDoChat(p, tela);
			for (const r of [{ ...d.bolinha, width: B, height: B }, d.balao]) {
				expect(r.x).toBeGreaterThanOrEqual(0);
				expect(r.y).toBeGreaterThanOrEqual(0);
				expect(r.x + r.width).toBeLessThanOrEqual(d.janela.width);
				expect(r.y + r.height).toBeLessThanOrEqual(d.janela.height);
			}
		}
	});
});

describe("disposição da janela do balão (duas janelas)", () => {
	const B = TAMANHO_BOLINHA.width;
	const { width: LB, height: AB } = TAMANHO_CHAT;
	const JB = LB + VAO_BALAO;

	it("canto superior esquerdo: o balão à direita, com o vão do lado da bolinha e topo com topo", () => {
		const d = disposicaoDoBalao({ x: 10, y: 10 }, tela);
		expect(d.lado).toBe("direita");
		expect(d.balao).toEqual({ x: 10 + B, y: 10, width: JB, height: AB });
		expect(d.ponta.y).toBe(38);
	});

	it("canto superior direito: o balão à esquerda; o vão fica à direita dele, junto da bolinha", () => {
		const d = disposicaoDoBalao({ x: 1800, y: 10 }, tela);
		expect(d.lado).toBe("esquerda");
		expect(d.balao.x + d.balao.width).toBe(1800);
		expect(d.balao).toMatchObject({ width: JB, height: AB, y: 10 });
	});

	it("canto inferior esquerdo: o fundo do balão alinha com o fundo da bolinha", () => {
		const d = disposicaoDoBalao({ x: 10, y: 950 }, tela);
		expect(d.lado).toBe("direita");
		expect(d.balao.y + AB).toBe(950 + B);
		expect(d.ponta.y).toBe(AB - B / 2);
	});

	it("canto inferior direito: esquerda e para cima, dentro da área", () => {
		const d = disposicaoDoBalao({ x: 1840, y: 950 }, tela);
		expect(d.lado).toBe("esquerda");
		expect(d.balao.x).toBeGreaterThanOrEqual(0);
		expect(d.balao.y).toBeGreaterThanOrEqual(0);
		expect(d.balao.x + d.balao.width).toBeLessThanOrEqual(1920);
		expect(d.balao.y + d.balao.height).toBeLessThanOrEqual(1040);
	});

	it("desliza na vertical quando não cabe, e a ponta continua na bolinha", () => {
		const area = { x: 0, y: 0, width: 1920, height: 700 };
		const d = disposicaoDoBalao({ x: 100, y: 300 }, area);
		expect(d.balao.y + AB).toBe(700);
		expect(d.ponta.y).toBe(300 + B / 2 - d.balao.y);
	});

	it("troca de lado quando o preferido não cabe", () => {
		const estreita = { x: 0, y: 0, width: 1000, height: 1040 };
		// Centro na metade esquerda (queria a direita), mas 100 + 76 + 14 + 420 cabe; já em x=450 o centro passa de 500 - mas a esquerda cabe.
		expect(disposicaoDoBalao({ x: 100, y: 100 }, estreita).lado).toBe("direita");
		expect(disposicaoDoBalao({ x: 480, y: 100 }, estreita).lado).toBe("esquerda");
		// 460: centro 498 < 500 (direita), 460 + 76 + 14 + 420 = 970 cabe.
		expect(disposicaoDoBalao({ x: 460, y: 100 }, estreita).lado).toBe("direita");
		// 500: centro 538 > 500 (esquerda): 500 - 14 - 420 = 66 cabe.
		expect(disposicaoDoBalao({ x: 500, y: 100 }, estreita).lado).toBe("esquerda");
		// Na borda esquerda o balão queria a esquerda (centro > metade em tela estreita) e não cabe: vai para a direita.
		const minuscula = { x: 0, y: 0, width: 600, height: 1040 };
		expect(disposicaoDoBalao({ x: 300, y: 100 }, minuscula).lado).toBe("esquerda");
		expect(disposicaoDoBalao({ x: 120, y: 100 }, minuscula).lado).toBe("direita");
	});

	it("arrastar qualquer uma das duas janelas leva a outra, mantendo o deslocamento", () => {
		const bolinha = { x: 1800, y: 900 };
		const d = disposicaoDoBalao(bolinha, tela);
		const desl = deslocamentoDoBalao(d, bolinha);
		// O balão na tela = bolinha + deslocamento (o balão à esquerda tem x menor).
		expect(balaoPelaBolinha(desl, bolinha)).toEqual({ x: d.balao.x, y: d.balao.y });
		expect(balaoPelaBolinha(desl, { x: 500, y: 400 })).toEqual({ x: 500 + desl.x, y: 400 + desl.y });
		expect(bolinhaPeloBalao(desl, balaoPelaBolinha(desl, { x: 500, y: 400 }))).toEqual({ x: 500, y: 400 });
		// Arrastando o balão para (300, 200): a bolinha vai para (300 - desl.x, 200 - desl.y).
		expect(bolinhaPeloBalao(desl, { x: 300, y: 200 })).toEqual({ x: 300 - desl.x, y: 200 - desl.y });
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
