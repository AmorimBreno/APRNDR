// @vitest-environment happy-dom
// As partes puras da etapa Esqueleto do guia e da visão do curso pronto
// (esqueleto-tela.ts): os rótulos das datas e do prazo, a lista do
// calendário, o motivo do "Criar curso" desligado, o menu "Mover para…" e a
// ordem das leituras do curso; o que a ponte guarda do esqueleto (lerCursos);
// a etiqueta da lista com os módulos (rotuloCurso); e as linhas da linha do
// tempo do esqueleto (descreverEvento).

import type { AcaoRecebida } from "@estudos/ui";
import { describe, expect, it } from "vitest";
import type { Curso } from "../../lib/curso-tipos.ts";
import { calcularCalendario, type Esqueleto, type Modulo } from "../../lib/esqueleto-tipos.ts";
import type { Evento } from "../../lib/eventos.ts";
import { lerCursos } from "./cursos-ponte.ts";
import {
	calendarioNaTela,
	datasDoCard,
	destinoAoApagar,
	leiturasDoCurso,
	modulosEmVista,
	motivoCriarDesligado,
	opcoesMoverPara,
	periodoDoModulo,
	prazoDoCurso,
	rotuloPrazo,
	textoHorasPorSemana,
	textoModulos,
	textoPrazoDoCurso,
} from "./esqueleto-tela.ts";
import { rotuloCurso } from "./guia-curso.ts";
import { formatarDolar } from "./ModalMateriais.tsx";
import { descreverEvento } from "./LinhaDoTempo.tsx";

const HOJE = "2026-10-26";

const modulo = (id: string, extra: Partial<Modulo> = {}): Modulo => ({
	id,
	nome: `Módulo ${id}`,
	objetivo: "",
	conceitos: [],
	tipo: "normal",
	horas: 2,
	...extra,
});

const MODULOS: Modulo[] = [
	modulo("m1", { nome: "A reta de regressão", conceitos: ["c1", "c2"], horas: 3 }),
	modulo("m2", { nome: "Resíduos", conceitos: ["c3"], horas: 2 }),
];
const CONCEITOS = ["c1", "c2", "c3"];

describe("datas e prazo", () => {
	it("o período do módulo: de… a…, ou em… num dia só", () => {
		expect(periodoDoModulo("2026-10-27", "2026-11-02")).toBe("de 27/10 a 02/11");
		expect(periodoDoModulo("2026-10-27", "2026-10-27")).toBe("em 27/10");
	});

	it("o prazo do calendário: com a prova, só a data, ou sem prazo", () => {
		expect(rotuloPrazo({ prazo: "2026-11-20", prova: "P1" })).toBe("Prazo: P1 em 20/11");
		expect(rotuloPrazo({ prazo: "2026-11-20" })).toBe("Prazo: 20/11");
		expect(rotuloPrazo({ prazo: null })).toBe("Sem prazo");
		expect(rotuloPrazo(null)).toBe("Sem prazo");
	});

	it("as horas por semana e os módulos, com vírgula e no singular", () => {
		expect(textoHorasPorSemana(4)).toBe("4 h por semana");
		expect(textoHorasPorSemana(2.5)).toBe("2,5 h por semana");
		expect(textoModulos(1)).toBe("1 módulo");
		expect(textoModulos(6)).toBe("6 módulos");
	});

	it("o prazo da visão do curso diz quanto falta", () => {
		expect(textoPrazoDoCurso({ prazo: "2026-11-20", prova: "P1" }, HOJE)).toBe("P1 em 20/11, em 25 dias");
		expect(textoPrazoDoCurso({ prazo: "2026-10-27" }, HOJE)).toBe("27/10, amanhã");
		expect(textoPrazoDoCurso({ prazo: "2026-10-26" }, HOJE)).toBe("26/10, hoje");
		expect(textoPrazoDoCurso({ prazo: "2026-10-20" }, HOJE)).toBe("20/10, já passou");
		expect(textoPrazoDoCurso({ prazo: null }, HOJE)).toBe("Sem prazo");
		expect(prazoDoCurso({ prazo: "2026-11-20", prova: "P1" }, HOJE)).toEqual({ valor: "P1 em 20/11", falta: "em 25 dias" });
		expect(prazoDoCurso({ prazo: null }, HOJE)).toEqual({ valor: "Sem prazo" });
	});

	it("as datas embaixo do card do módulo", () => {
		expect(datasDoCard("2026-10-27", "2026-11-01", "2026-11-02")).toBe("de 27/10 a 01/11 · avaliação 02/11");
	});
});

describe("calendarioNaTela", () => {
	it("uma linha por módulo, a avaliação geral e o resumo das horas e dos dias", () => {
		const calendario = calcularCalendario(MODULOS, { horasPorSemana: 4, prazo: "2026-11-20", hoje: HOJE });
		const tela = calendarioNaTela(MODULOS, calendario);
		expect(tela.linhas).toEqual([
			{ id: "m1", numero: "01", titulo: "01 · A reta de regressão", periodo: "de 27/10 a 01/11", avaliacao: "avaliação 02/11" },
			{ id: "m2", numero: "02", titulo: "02 · Resíduos", periodo: "de 02/11 a 05/11", avaliacao: "avaliação 06/11" },
		]);
		expect(tela.avaliacaoGeral).toBe("Avaliação geral 19/11");
		// De 27/10 (o começo do primeiro) a 19/11 (a avaliação geral), os dois contados.
		expect(tela.resumo).toBe("5 h em 24 dias");
		expect(tela.avisos).toEqual([]);
	});

	it("segue a ordem dos módulos (depois de mover) e mostra os avisos do calendário", () => {
		const invertidos = [MODULOS[1]!, { ...MODULOS[0]!, nome: "" }];
		const calendario = calcularCalendario(invertidos, { horasPorSemana: 1, prazo: "2026-10-30", hoje: HOJE });
		const tela = calendarioNaTela(invertidos, calendario);
		expect(tela.linhas.map((linha) => linha.titulo)).toEqual(["01 · Resíduos", "02 · Sem nome"]);
		expect(tela.avisos).toHaveLength(1);
		expect(tela.avisos[0]).toContain("pede cerca de");
	});

	it("um módulo de um dia mostra o dia só", () => {
		const curtos = [modulo("m1", { horas: 0.5, conceitos: ["c1"] })];
		const tela = calendarioNaTela(curtos, calcularCalendario(curtos, { horasPorSemana: 4, prazo: null, hoje: HOJE }));
		expect(tela.linhas[0]!.periodo).toBe("em 27/10");
		expect(tela.avaliacaoGeral).toBe("Avaliação geral 28/10");
		expect(tela.resumo).toBe("0,5 h em 2 dias");
	});
});

describe("motivoCriarDesligado", () => {
	it("ligado com a proposta válida e nada pendente", () => {
		expect(motivoCriarDesligado(MODULOS, CONCEITOS, false)).toBeUndefined();
	});

	it("um módulo vazio vem primeiro, com o número dele", () => {
		const modulos = [...MODULOS, modulo("m3", { nome: "" })];
		expect(motivoCriarDesligado(modulos, CONCEITOS, true)).toBe("O módulo 03 está vazio: mova conceitos para ele ou apague-o.");
	});

	it("depois, um módulo sem nome", () => {
		const modulos = [MODULOS[0]!, { ...MODULOS[1]!, nome: "   " }];
		expect(motivoCriarDesligado(modulos, CONCEITOS, false)).toBe("Dê um nome ao módulo 02.");
	});

	it("depois, as outras regras da validação, com a frase dela", () => {
		expect(motivoCriarDesligado(MODULOS, [...CONCEITOS, "c4"], false)).toBe("Um conceito do curso está sem módulo: c4.");
	});

	it("por último, o salvamento pendente", () => {
		expect(motivoCriarDesligado(MODULOS, CONCEITOS, true)).toBe("Salvando as edições…");
	});
});

describe("edição", () => {
	it("o menu Mover para… lista os outros módulos, na ordem", () => {
		const modulos = [...MODULOS, modulo("m7", { nome: "" })];
		expect(opcoesMoverPara(modulos, "m2")).toEqual([
			{ id: "m1", titulo: "Módulo 01 · A reta de regressão" },
			{ id: "m7", titulo: "Módulo 03 · Sem nome" },
		]);
	});

	it("para onde vão os conceitos de um módulo apagado", () => {
		expect(destinoAoApagar(2)).toBe("Os conceitos vão para o módulo anterior.");
		expect(destinoAoApagar(0)).toBe("Os conceitos vão para o módulo seguinte.");
	});

	it("os módulos em vista: os desta tela só enquanto a proposta é a mesma", () => {
		const emAndamento = { modulos: MODULOS, geradoEm: "2026-10-26T10:00:00.000Z" };
		const editados = [MODULOS[1]!, MODULOS[0]!];
		expect(modulosEmVista(emAndamento, { geradoEm: emAndamento.geradoEm, modulos: editados })).toBe(editados);
		expect(modulosEmVista(emAndamento, { geradoEm: "2026-10-25T10:00:00.000Z", modulos: editados })).toBe(MODULOS);
		expect(modulosEmVista(emAndamento, undefined)).toBe(MODULOS);
		expect(modulosEmVista(null, undefined)).toEqual([]);
	});
});

function cursoPronto(extra: Partial<Curso> = {}): Curso {
	const calendario = calcularCalendario(MODULOS, { horasPorSemana: 4, prazo: "2026-11-20", hoje: HOJE });
	const esqueleto: Esqueleto = { modulos: MODULOS, geradoEm: "2026-10-26T10:00:00.000Z", modelo: "openrouter/openai/gpt-6.1-sol", custo: 0.02, criadoEm: "2026-10-26T11:00:00.000Z", calendario };
	return {
		versao: 1,
		id: "p1-regressao",
		nome: "P1: regressão",
		materia: "ciencia-de-dados",
		situacao: "pronto",
		etapa: "esqueleto",
		criadoEm: "2026-10-22T13:00:00.000Z",
		alteradoEm: "2026-10-26T11:00:00.000Z",
		basico: { prazo: "2026-11-20", prova: "P1", horasPorSemana: 4 },
		materiais: { arquivos: [] },
		objetivo: { escopo: "material_base", tipo: "aplicado", motivo: "" },
		mapa: { conceitos: CONCEITOS },
		diagnostico: null,
		esqueleto,
		...extra,
	};
}

describe("leiturasDoCurso", () => {
	it("na ordem: prazo, horas por semana, módulos, conceitos, tipo e escopo, com os nomes do guia", () => {
		expect(leiturasDoCurso(cursoPronto(), HOJE)).toEqual([
			{ id: "prazo", rotulo: "Prazo", valor: "P1 em 20/11", detalhe: "em 25 dias", texto: true },
			{ id: "horas", rotulo: "Horas por semana", valor: "4", unidade: "h" },
			{ id: "modulos", rotulo: "Módulos", valor: "2" },
			{ id: "conceitos", rotulo: "Conceitos", valor: "3" },
			{ id: "tipo", rotulo: "Tipo", valor: "Aplicado", texto: true },
			{ id: "escopo", rotulo: "Escopo", valor: "Material como base", texto: true },
		]);
	});

	it("sem prazo, o prazo vem sem detalhe; horas com vírgula", () => {
		const leituras = leiturasDoCurso(cursoPronto({ basico: { prazo: null, horasPorSemana: 2.5 } }), HOJE);
		expect(leituras[0]).toEqual({ id: "prazo", rotulo: "Prazo", valor: "Sem prazo", texto: true });
		expect(leituras[1]!.valor).toBe("2,5");
	});
});

describe("o que a ponte guarda do esqueleto", () => {
	let contador = 0;
	const recebida = (acao: string, dados: unknown): AcaoRecebida => ({ chave: `k${++contador}`, acao, dados });
	const materia = "ciencia-de-dados";

	it("gerandoEsqueleto, o erro de gerar até gerar de novo, e os módulos do curso pronto na lista", () => {
		const rascunho = cursoPronto({ situacao: "rascunho", esqueleto: null });
		let lido = lerCursos([recebida("curso", { materia, curso: rascunho, gerandoEsqueleto: true })], materia);
		expect(lido.esqueletos[rascunho.id]).toEqual({ gerando: true });

		const erro = recebida("erro", { materia, curso: rascunho.id, ao: "gerar_esqueleto", mensagem: "O modelo não respondeu." });
		lido = lerCursos([recebida("curso", { materia, curso: rascunho, gerandoEsqueleto: true }), erro], materia);
		expect(lido.esqueletos[rascunho.id]).toEqual({ gerando: false, erroGerar: { chave: erro.chave, mensagem: "O modelo não respondeu." } });

		// Um "curso" sem gerar mantém o erro; um gerando de novo o tira.
		lido = lerCursos([erro, recebida("curso", { materia, curso: rascunho })], materia);
		expect(lido.esqueletos[rascunho.id]?.erroGerar?.mensagem).toBe("O modelo não respondeu.");
		lido = lerCursos([erro, recebida("curso", { materia, curso: rascunho, gerandoEsqueleto: true })], materia);
		expect(lido.esqueletos[rascunho.id]).toEqual({ gerando: true });

		// O curso pronto que chega atualiza a linha da lista, com quantos módulos ele tem (resumoDoCurso).
		const lista = recebida("lista", { materia, cursos: [{ id: "p1-regressao", nome: "P1: regressão", situacao: "rascunho", etapa: "esqueleto", prazo: null, alteradoEm: "2026-10-26T10:00:00.000Z" }] });
		lido = lerCursos([lista, recebida("curso", { materia, curso: cursoPronto() })], materia);
		expect(lido.lista?.[0]?.modulos).toBe(2);
		expect(lido.esqueletos["p1-regressao"]).toEqual({ gerando: false });
	});

	it("a etiqueta de um curso pronto diz quantos módulos ele tem, quando se sabe", () => {
		expect(rotuloCurso({ situacao: "pronto", etapa: "esqueleto" }, 6)).toEqual({ texto: "Pronto · 6 módulos", tom: "sage" });
		expect(rotuloCurso({ situacao: "pronto", etapa: "esqueleto" }, 1)).toEqual({ texto: "Pronto · 1 módulo", tom: "sage" });
		expect(rotuloCurso({ situacao: "pronto", etapa: "esqueleto" })).toEqual({ texto: "Pronto", tom: "sage" });
	});
});

describe("descreverEvento do esqueleto", () => {
	const evento = (verbo: string, resultado: Record<string, unknown>): Evento =>
		({ id: "e1", ts: "2026-10-26T11:00:00.000Z", verbo, objeto: { materia: "ciencia-de-dados", curso: "p1-regressao" }, resultado }) as unknown as Evento;

	it("gerou_esqueleto: o curso, os módulos e o custo", () => {
		expect(descreverEvento(evento("gerou_esqueleto", { modulos: 5, custo: 0.02 }))).toEqual({
			icone: "list",
			texto: "Esqueleto proposto: p1-regressao",
			detalhe: `5 módulos · ${formatarDolar(0.02)}`,
		});
	});

	it("criou_curso: o nome, os módulos e a avaliação geral", () => {
		expect(descreverEvento(evento("criou_curso", { nome: "P1: regressão", modulos: 5, prazo: "2026-11-20", avaliacaoGeral: "2026-11-19" }))).toEqual({
			icone: "flag",
			texto: "Curso criado: P1: regressão",
			detalhe: "5 módulos · avaliação geral em 19/11",
		});
	});

	it("recalculou_calendario: o curso e a avaliação geral nova", () => {
		expect(descreverEvento(evento("recalculou_calendario", { avaliacaoGeral: "2026-11-04", avisos: ["Até 04/11 (8 dias), …"] }))).toEqual({
			icone: "refresh",
			texto: "Calendário recalculado: p1-regressao",
			detalhe: "avaliação geral em 04/11",
		});
		expect(descreverEvento(evento("recalculou_calendario", {}))).toEqual({ icone: "refresh", texto: "Calendário recalculado: p1-regressao" });
	});
});
