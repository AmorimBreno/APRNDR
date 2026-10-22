// @vitest-environment happy-dom
// As partes puras do guia de criação de curso (guia-curso.ts): o padrão do
// prazo pelas provas da matéria, os rótulos da lista da seção Cursos, a
// seleção da etapa Mapa guardada pelos desmarcados (com um conceito novo
// chegando), o texto e o motivo do primário do Mapa e as etapas que dá para
// abrir; e as linhas da linha do tempo dos eventos dos cursos (descreverEvento).

import type { SituacaoMaterial } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import { type Curso, validarEtapa } from "../../lib/curso-tipos.ts";
import type { Evento } from "../../lib/eventos.ts";
import { aplicarOperacoes, type Conceito, type MapaConteudo, mapaVazio } from "../../lib/mapa-tipos.ts";
import {
	campoDoErroBasico,
	desmarcadosIniciais,
	entradaBasico,
	etapaDepois,
	etapaEmVista,
	formBasico,
	formObjetivo,
	marcados,
	motivoMapaParado,
	podeAbrir,
	processando,
	provasFuturas,
	rotuloCurso,
	rotuloDaProva,
	textoEditado,
	textoPrazo,
	textoPrimarioMapa,
	textoSelecao,
	valorDaProva,
} from "./guia-curso.ts";
import { descreverEvento } from "./TelaCaderno.tsx";

const HOJE = new Date(2026, 9, 22, 10, 0);
const materia = {
	provas: [
		{ nome: "P2", data: "2026-12-10" },
		{ nome: "P0", data: "2026-10-01" },
		{ nome: "P1", data: "2026-11-20" },
	],
};

function curso(extra: Partial<Curso> = {}): Curso {
	return {
		versao: 1,
		id: "p1",
		nome: "P1: regressão",
		materia: "ciencia-de-dados",
		situacao: "rascunho",
		etapa: "materiais",
		criadoEm: "2026-10-22T13:00:00.000Z",
		alteradoEm: "2026-10-22T13:00:00.000Z",
		basico: { prazo: "2026-11-20", prova: "P1", horasPorSemana: 4 },
		materiais: null,
		objetivo: null,
		mapa: null,
		diagnostico: null,
		esqueleto: null,
		...extra,
	};
}

function conceito(id: string, extra: Partial<Conceito> = {}): Conceito {
	return { id, nome: `Conceito ${id}`, descricao: "", referencias: [], prioridade: "normal", origem: "usuario", criadoEm: "2026-10-22T13:00:00.000Z", ...extra };
}

function mapaCom(ids: string[], extra: Partial<MapaConteudo> = {}): MapaConteudo {
	return { ...mapaVazio(), situacao: "aprovado", aprovadoEm: "2026-10-22T13:00:00.000Z", conceitos: ids.map((id) => conceito(id)), ...extra };
}

describe("o prazo do Básico", () => {
	it("lista só as provas de hoje em diante, da mais próxima para a mais distante", () => {
		const provas = provasFuturas(materia, HOJE);
		expect(provas.map((prova) => [prova.nome, prova.dias])).toEqual([
			["P1", 29],
			["P2", 49],
		]);
		expect(rotuloDaProva(provas[0]!)).toBe("P1 · 20/11 · em 29 dias");
	});

	it("num curso novo, o padrão é a prova futura mais próxima, com 4 horas por semana", () => {
		const provas = provasFuturas(materia, HOJE);
		expect(formBasico(undefined, provas)).toEqual({ nome: "", escolha: valorDaProva(provas[0]!), outraData: "", horas: "4" });
		expect(entradaBasico(formBasico(undefined, provas), provas)).toEqual({ nome: "", prazo: "2026-11-20", prova: "P1", horasPorSemana: 4 });
	});

	it("sem prova futura, o padrão é Sem prazo", () => {
		const provas = provasFuturas({ provas: [{ nome: "P0", data: "2026-10-01" }] }, HOJE);
		expect(formBasico(undefined, provas).escolha).toBe("sem");
		expect(entradaBasico(formBasico(undefined, provas), provas).prazo).toBeNull();
	});

	it("reabrindo, a prova volta escolhida; um prazo que não é de prova vira Outra data", () => {
		const provas = provasFuturas(materia, HOJE);
		expect(formBasico(curso(), provas).escolha).toBe(valorDaProva(provas[0]!));
		const outro = formBasico(curso({ basico: { prazo: "2026-11-25", horasPorSemana: 2.5 } }), provas);
		expect(outro).toEqual({ nome: "P1: regressão", escolha: "outra", outraData: "2026-11-25", horas: "2.5" });
		expect(entradaBasico(outro, provas)).toEqual({ nome: "P1: regressão", prazo: "2026-11-25", horasPorSemana: 2.5 });
		expect(formBasico(curso({ basico: { prazo: null, horasPorSemana: 4 } }), provas).escolha).toBe("sem");
	});

	it("Outra data sem data e horas vazias vão para a validação dizer o campo", () => {
		const entrada = entradaBasico({ nome: "Curso", escolha: "outra", outraData: "", horas: "" }, []);
		expect(entrada.prazo).toBeNull();
		expect(Number.isNaN(entrada.horasPorSemana)).toBe(true);
		expect(() => validarEtapa("basico", entrada, { hoje: "2026-10-22" })).toThrow(/horas/);
		expect(entradaBasico({ nome: "Curso", escolha: "sem", outraData: "", horas: "2,5" }, []).horasPorSemana).toBe(2.5);
	});

	it("o erro da validação vai para o campo certo", () => {
		const erro = (dados: unknown) => {
			try {
				validarEtapa("basico", dados, { hoje: "2026-10-22" });
			} catch (falha) {
				return campoDoErroBasico((falha as Error).message);
			}
			return "nenhum";
		};
		expect(erro({ nome: " ", prazo: null, horasPorSemana: 4 })).toBe("nome");
		expect(erro({ nome: "Curso", prazo: "2026-10-01", horasPorSemana: 4 })).toBe("prazo");
		expect(erro({ nome: "Curso", prazo: null, horasPorSemana: 0 })).toBe("horas");
		expect(erro({ nome: "Curso", prazo: null, horasPorSemana: 4 })).toBe("nenhum");
	});
});

describe("o Objetivo", () => {
	it("o padrão é só o material com material confirmado e livre sem; tipo misto", () => {
		expect(formObjetivo(curso({ materiais: { arquivos: [{ arquivo: "aula-01.pdf", hash: "a" }] } }))).toEqual({ escopo: "so_material", tipo: "misto", motivo: "" });
		expect(formObjetivo(curso({ materiais: { arquivos: [] } }))).toEqual({ escopo: "livre", tipo: "misto", motivo: "" });
		expect(formObjetivo(curso({ objetivo: { escopo: "material_base", tipo: "teorico", motivo: "P1" } })).escopo).toBe("material_base");
	});
});

describe("a lista da seção Cursos", () => {
	it("o rótulo diz onde o rascunho parou", () => {
		expect(rotuloCurso({ situacao: "rascunho", etapa: "mapa" })).toEqual({ texto: "Rascunho · parou em Mapa", tom: "amber" });
		expect(rotuloCurso({ situacao: "rascunho", etapa: "diagnostico" }).texto).toBe("Rascunho · parou em Diagnóstico");
		expect(rotuloCurso({ situacao: "pronto", etapa: "esqueleto" })).toEqual({ texto: "Pronto", tom: "sage" });
	});

	it("o prazo usa o nome da prova quando a data é a de uma prova", () => {
		expect(textoPrazo("2026-11-20", materia)).toBe("P1 em 20/11");
		expect(textoPrazo("2026-11-25", materia)).toBe("25/11");
		expect(textoPrazo(null, materia)).toBe("sem prazo");
	});

	it("editado há …", () => {
		const agora = new Date("2026-10-22T13:10:00.000Z");
		expect(textoEditado("2026-10-22T13:05:00.000Z", agora)).toBe("editado há 5 min");
		expect(textoEditado("2026-10-21T12:00:00.000Z", agora)).toBe("editado ontem");
	});
});

describe("a seleção da etapa Mapa", () => {
	it("numa etapa não confirmada, todos os de dentro vêm marcados", () => {
		const mapa = mapaCom(["a", "b", "c"]);
		const desmarcados = desmarcadosIniciais(mapa, curso());
		expect(desmarcados.size).toBe(0);
		expect(marcados(mapa, desmarcados)).toEqual(["a", "b", "c"]);
	});

	it("reabrindo uma etapa confirmada, os de dentro que não estão no curso vêm desmarcados", () => {
		const mapa = mapaCom(["a", "b", "c"]);
		const desmarcados = desmarcadosIniciais(mapa, curso({ mapa: { conceitos: ["c", "a"] } }));
		expect([...desmarcados]).toEqual(["b"]);
		expect(marcados(mapa, desmarcados)).toEqual(["a", "c"]);
	});

	it("um conceito que entra no mapa enquanto a etapa está aberta já vem marcado; os de fora nunca", () => {
		const mapa = mapaCom(["a", "b", "c"]);
		const desmarcados = new Set(["b"]);
		const depois = aplicarOperacoes(mapa, [
			{ tipo: "adicionar", id: "d", nome: "Conceito novo" },
			{ tipo: "tirar", id: "c" },
		]).mapa;
		expect(marcados(depois, desmarcados)).toEqual(["a", "d"]);
		expect(textoSelecao(marcados(depois, desmarcados).length, 3)).toBe("2 de 3 conceitos neste curso");
		expect(textoSelecao(1, 1)).toBe("1 de 1 conceito neste curso");
	});

	it("o primário aprova junto quando o mapa não está aprovado", () => {
		expect(textoPrimarioMapa({ situacao: "aprovado" })).toBe("Continuar");
		expect(textoPrimarioMapa({ situacao: "rascunho" })).toBe("Aprovar o mapa e continuar");
		expect(textoPrimarioMapa({ situacao: "alterado" })).toBe("Aprovar o mapa e continuar");
	});

	it("o primário fica desligado mapeando, montando pelo tema, com pendentes ou sem nenhum marcado", () => {
		const parado = { andamento: null, fila: [], pendentes: [] };
		expect(motivoMapaParado(parado, 3)).toBeUndefined();
		expect(motivoMapaParado(parado, 0)).toMatch(/pelo menos um/);
		expect(motivoMapaParado({ ...parado, andamento: { arquivo: "a.pdf", parte: 1, partes: 2 } }, 3)).toMatch(/mapeamento/);
		expect(motivoMapaParado({ ...parado, fila: ["a.pdf"] }, 3)).toMatch(/mapeamento/);
		expect(motivoMapaParado({ ...parado, montandoTema: true }, 3)).toMatch(/tema/);
		expect(motivoMapaParado({ ...parado, pendentes: [{ arquivo: "a.pdf", tipo: "pdf", caracteres: 10, partes: 1, custoEstimado: 0.01 }] }, 3)).toMatch(/pendentes/);
		expect(motivoMapaParado(undefined, 3)).toBeDefined();
	});
});

describe("os materiais", () => {
	const material = (nome: string, estado: SituacaoMaterial["estado"] = "pronto"): SituacaoMaterial => ({
		caminho: `materias/x/materiais/${nome}`,
		pasta: "materias/x/materiais",
		nome,
		estado,
		tamanho: 10,
	});

	it("conta os que ainda estão na fila ou processando", () => {
		expect(processando([material("a.pdf"), material("d.pdf", "processando"), material("e.pdf", "na_fila"), material("f.pdf", "erro")])).toBe(2);
	});
});

describe("as etapas que dá para abrir", () => {
	it("as confirmadas e a primeira não confirmada; a da rota só vale se dá para abrir", () => {
		const atual = curso({ etapa: "objetivo", materiais: { arquivos: [] } });
		expect(podeAbrir(atual, "basico")).toBe(true);
		expect(podeAbrir(atual, "objetivo")).toBe(true);
		expect(podeAbrir(atual, "mapa")).toBe(false);
		expect(etapaEmVista(atual, "materiais")).toBe("materiais");
		expect(etapaEmVista(atual, "mapa")).toBe("objetivo");
		expect(etapaEmVista(atual, undefined)).toBe("objetivo");
		expect(etapaEmVista(atual, "qualquer")).toBe("objetivo");
		expect(etapaEmVista(undefined, "mapa")).toBe("basico");
	});

	it("depois de confirmar, a seguinte na ordem (ou a primeira vazia, se a confirmação descartou)", () => {
		const tudo = curso({ etapa: "diagnostico", materiais: { arquivos: [] }, objetivo: { escopo: "livre", tipo: "misto", motivo: "" }, mapa: { conceitos: ["a"] } });
		expect(etapaDepois(tudo, "basico")).toBe("materiais");
		expect(etapaDepois(tudo, "mapa")).toBe("diagnostico");
		expect(etapaDepois(curso({ etapa: "materiais" }), "basico")).toBe("materiais");
	});
});

describe("a linha do tempo dos cursos", () => {
	const evento = (verbo: string, resultado: Record<string, unknown>, objeto: Record<string, unknown> = { materia: "x", curso: "p1" }): Evento =>
		({ id: "e", ts: "2026-10-22T13:00:00.000Z", verbo, objeto, resultado }) as unknown as Evento;

	it("começou, descartou e montou o mapa do tema", () => {
		expect(descreverEvento(evento("comecou_curso", { nome: "P1: regressão" })).texto).toBe("Curso começado: P1: regressão");
		expect(descreverEvento(evento("descartou_curso", { nome: "P1: regressão", etapa: "mapa" })).texto).toBe("Rascunho descartado: P1: regressão");
		const tema = descreverEvento(evento("montou_mapa_do_tema", { novos: 12, custo: 0.02, tema: "Estatística" }, { materia: "x" }));
		expect(tema.texto).toBe("Mapa montado a partir do tema Estatística");
		expect(tema.detalhe).toMatch(/^12 conceitos · US\$/);
		expect(descreverEvento(evento("montou_mapa_do_tema", { novos: 1, custo: 0, tema: "T" }, { materia: "x" })).detalhe).toBe("1 conceito");
	});
});
