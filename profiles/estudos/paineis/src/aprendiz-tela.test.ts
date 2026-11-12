import { describe, expect, it } from "vitest";
import { conceitoDeTeste, conceitosVariados, MATERIAS_DE_TESTE } from "./aprendiz-fixtures.ts";
import {
	ABAS_DO_APRENDIZ,
	abaDaRotaAprendiz,
	agruparPorFaixa,
	chaveDoConceito,
	ehRotaDoAprendiz,
	eventosParaMostrar,
	faixaDoDominio,
	filtrarPorMateria,
	formatarBrier,
	formatarDominio,
	formatarGanho,
	formatarPonderado,
	formatarQueDisse,
	idCurtoDoConceito,
	idCurtoDoEvento,
	LIMITE_EVENTOS_NOS_DETALHES,
	leituraDoBrier,
	lerRotaDoAprendiz,
	materiasDosDados,
	nomeDoConceito,
	opcoesDeMateriaAprendiz,
	ordenarConceitos,
	resumirConceitos,
	rotaDeVoltarDoAprendiz,
	rotaDoAprendiz,
	semRespostas,
	textoDosIgnorados,
	textoHaQuanto,
} from "./aprendiz-tela.ts";

describe("as rotas", () => {
	it("aprendiz/<aba>[/matéria]", () => {
		expect(rotaDoAprendiz()).toBe("aprendiz/indicadores");
		expect(rotaDoAprendiz("indicadores", "calculo")).toBe("aprendiz/indicadores/calculo");
		expect(rotaDoAprendiz("hipoteses")).toBe("aprendiz/hipoteses");
		expect(rotaDoAprendiz("historico", "fisica")).toBe("aprendiz/historico/fisica");
		expect(rotaDeVoltarDoAprendiz()).toBe("");
	});

	it("as três abas, nesta ordem", () => {
		expect(ABAS_DO_APRENDIZ.map((aba) => aba.id)).toEqual(["indicadores", "hipoteses", "historico"]);
		expect(ABAS_DO_APRENDIZ.map((aba) => aba.nome)).toEqual(["Indicadores", "Hipóteses", "Histórico"]);
	});

	it("uma aba que não existe (ou nenhuma) abre Indicadores", () => {
		expect(abaDaRotaAprendiz("indicadores")).toBe("indicadores");
		expect(abaDaRotaAprendiz("hipoteses")).toBe("hipoteses");
		expect(abaDaRotaAprendiz("historico")).toBe("historico");
		expect(abaDaRotaAprendiz("outra")).toBe("indicadores");
		expect(abaDaRotaAprendiz(undefined)).toBe("indicadores");
	});

	it("o destaque vai depois de um ?, com o id codificado, e a rota volta inteira", () => {
		expect(rotaDoAprendiz("historico", undefined, { evento: "0abc-1234" })).toBe("aprendiz/historico?evento=0abc-1234");
		expect(rotaDoAprendiz("historico", "calculo", { evento: "0abc-1234" })).toBe("aprendiz/historico/calculo?evento=0abc-1234");
		expect(rotaDoAprendiz("hipoteses", "calculo", { hipotese: "h-1,h-2" })).toBe("aprendiz/hipoteses/calculo?hipotese=h-1%2Ch-2");
		expect(lerRotaDoAprendiz("aprendiz/historico?evento=0abc-1234")).toEqual({ aba: "historico", evento: "0abc-1234" });
		expect(lerRotaDoAprendiz("aprendiz/historico/calculo?evento=0abc-1234")).toEqual({ aba: "historico", materia: "calculo", evento: "0abc-1234" });
		expect(lerRotaDoAprendiz(rotaDoAprendiz("hipoteses", "calculo", { hipotese: "h-1,h-2" }))).toEqual({ aba: "hipoteses", materia: "calculo", hipotese: "h-1,h-2" });
	});

	it("o App guarda cada pedaço do caminho codificado e o devolve decodificado: a rota com ? e = volta inteira (F5 e o botão voltar)", () => {
		const caminho = rotaDoAprendiz("historico", "calculo", { evento: "0abc-1234" });
		const hash = caminho.split("/").map(encodeURIComponent).join("/");
		expect(hash).toBe("aprendiz/historico/calculo%3Fevento%3D0abc-1234");
		const devolvido = hash.split("/").map(decodeURIComponent).join("/");
		expect(devolvido).toBe(caminho);
		expect(lerRotaDoAprendiz(devolvido)).toEqual({ aba: "historico", materia: "calculo", evento: "0abc-1234" });
		// Sem matéria o ? fica no pedaço da aba.
		const semMateria = rotaDoAprendiz("hipoteses", undefined, { hipotese: "h-1,h-2" });
		expect(lerRotaDoAprendiz(semMateria.split("/").map(encodeURIComponent).join("/").split("/").map(decodeURIComponent).join("/"))).toEqual({ aba: "hipoteses", hipotese: "h-1,h-2" });
	});

	it("lerRotaDoAprendiz: sem aba ou com aba desconhecida cai em indicadores; o ? não vira matéria", () => {
		expect(lerRotaDoAprendiz("aprendiz")).toEqual({ aba: "indicadores" });
		expect(lerRotaDoAprendiz("aprendiz/xyz/fisica")).toEqual({ aba: "indicadores", materia: "fisica" });
		expect(lerRotaDoAprendiz("aprendiz/hipoteses/calculo").materia).toBe("calculo");
		expect(lerRotaDoAprendiz("aprendiz/historico?evento=").evento).toBeUndefined();
	});

	it("reconhece o caminho da tela", () => {
		expect(ehRotaDoAprendiz("aprendiz")).toBe(true);
		expect(ehRotaDoAprendiz("aprendiz/indicadores/calc")).toBe(true);
		expect(ehRotaDoAprendiz("aprendizado/x")).toBe(false);
		expect(ehRotaDoAprendiz("caderno/aprendiz")).toBe(false);
	});
});

describe("o filtro de matéria", () => {
	const conceitos = conceitosVariados();

	it("filtra pela matéria; sem matéria, todos", () => {
		expect(filtrarPorMateria(conceitos, "fisica").map((c) => c.conceito)).toEqual(["series", "vetores"]);
		expect(filtrarPorMateria(conceitos).length).toBe(5);
		expect(filtrarPorMateria(conceitos, "nao-existe")).toEqual([]);
	});

	it("as matérias dos dados, sem repetir", () => {
		expect(materiasDosDados(conceitos)).toEqual(["calculo", "fisica"]);
	});

	it("as opções: Todas e cada matéria dos dados, pelo nome, em ordem alfabética", () => {
		expect(opcoesDeMateriaAprendiz(["fisica", "calculo"], MATERIAS_DE_TESTE)).toEqual([
			{ value: "", label: "Todas as matérias" },
			{ value: "calculo", label: "Cálculo I" },
			{ value: "fisica", label: "Física" },
		]);
	});

	it("um id fora dos dados continua escolhível, e sem nome conhecido vale o id", () => {
		const opcoes = opcoesDeMateriaAprendiz(["calculo"], [], "quimica");
		expect(opcoes.map((o) => o.value)).toEqual(["", "calculo", "quimica"]);
		expect(opcoes.find((o) => o.value === "quimica")?.label).toBe("quimica");
	});

	it("enquanto as matérias não chegam, o rótulo do filtro escolhido fica em branco", () => {
		const opcoes = opcoesDeMateriaAprendiz(["calculo"], [], "calculo", true);
		expect(opcoes.find((o) => o.value === "calculo")?.label).toBe(" ");
	});
});

describe("as faixas de domínio", () => {
	it("limites: 40% e 75%", () => {
		expect(faixaDoDominio(0)).toBe("baixo");
		expect(faixaDoDominio(0.39)).toBe("baixo");
		expect(faixaDoDominio(0.4)).toBe("medio");
		expect(faixaDoDominio(0.74)).toBe("medio");
		expect(faixaDoDominio(0.75)).toBe("alto");
		expect(faixaDoDominio(1)).toBe("alto");
	});

	it("agrupa e resume; o conceito sem respostas fica fora das faixas e é contado à parte", () => {
		const grupos = agruparPorFaixa(conceitosVariados());
		expect(grupos.alto.map((c) => c.conceito)).toEqual(["limites"]);
		expect(grupos.medio.map((c) => c.conceito)).toEqual(["integrais"]);
		expect(grupos.baixo.map((c) => c.conceito)).toEqual(["derivadas", "series"]);
		expect(resumirConceitos(conceitosVariados())).toEqual({ conceitos: 5, alto: 1, medio: 1, baixo: 2, soAutoavaliados: 1 });
		expect(resumirConceitos([])).toEqual({ conceitos: 0, alto: 0, medio: 0, baixo: 0, soAutoavaliados: 0 });
	});

	it("semRespostas é observacoes === 0", () => {
		expect(semRespostas({ observacoes: 0 })).toBe(true);
		expect(semRespostas({ observacoes: 1 })).toBe(false);
	});
});

describe("ordenarConceitos", () => {
	it("do menor domínio para o maior; no empate, a observação mais recente primeiro; sem respostas no fim", () => {
		const ordem = ordenarConceitos(conceitosVariados()).map((c) => c.conceito);
		// derivadas e series empatam em 20%: derivadas é de 9/11, series de 5/11.
		expect(ordem).toEqual(["derivadas", "series", "integrais", "limites", "vetores"]);
	});

	it("não depende da ordem de entrada e não muda a lista original", () => {
		const entrada = conceitosVariados();
		const copia = [...entrada];
		const a = ordenarConceitos(entrada).map(chaveDoConceito);
		const b = ordenarConceitos([...entrada].reverse()).map(chaveDoConceito);
		expect(a).toEqual(b);
		expect(entrada).toEqual(copia);
	});

	it("o empate total desempata pela matéria e pelo id; um instante inválido não quebra", () => {
		const a = conceitoDeTeste({ conceito: "b", materia: "x", dominio: 0.5, ultima: "ontem" });
		const b = conceitoDeTeste({ conceito: "a", materia: "x", dominio: 0.5, ultima: "ontem" });
		const c = conceitoDeTeste({ conceito: "c", materia: "x", dominio: 0.5, ultima: "2026-11-01T00:00:00.000Z" });
		expect(ordenarConceitos([a, b, c]).map((x) => x.conceito)).toEqual(["c", "a", "b"]);
	});

	it("os sem respostas entre si: o de atividade mais recente primeiro", () => {
		const velho = conceitoDeTeste({ conceito: "v", observacoes: 0, ultima: "2026-10-01T00:00:00.000Z" });
		const novo = conceitoDeTeste({ conceito: "n", observacoes: 0, ultima: "2026-11-01T00:00:00.000Z" });
		expect(ordenarConceitos([velho, novo]).map((x) => x.conceito)).toEqual(["n", "v"]);
	});
});

describe("números em pt-BR", () => {
	it("acertos e erros ponderados com vírgula e no máximo uma casa", () => {
		expect(formatarPonderado(2.449)).toBe("2,4");
		expect(formatarPonderado(0)).toBe("0");
		expect(formatarPonderado(3)).toBe("3");
		expect(formatarPonderado(1234.56)).toBe("1.234,6");
	});

	it("domínio em porcentagem inteira, limitado a 0 e 100", () => {
		expect(formatarDominio(0.714)).toBe("71%");
		expect(formatarDominio(1.3)).toBe("100%");
		expect(formatarDominio(-0.2)).toBe("0%");
	});

	it("ganho com sinal e duas casas, ou traço", () => {
		expect(formatarGanho(0.45)).toBe("+0,45");
		expect(formatarGanho(-0.2)).toBe("−0,20");
		expect(formatarGanho(0)).toBe("0,00");
		expect(formatarGanho(null)).toBe("—");
	});

	it("Brier com duas casas, ou traço; a autoavaliação como 'N de 4'", () => {
		expect(formatarBrier(0.18)).toBe("0,18");
		expect(formatarBrier(null)).toBe("—");
		expect(formatarQueDisse(3)).toBe("3 de 4");
		expect(formatarQueDisse(undefined)).toBe("—");
	});
});

describe("leituraDoBrier", () => {
	it("só com base no Brier, e com poucos dados não interpreta", () => {
		expect(leituraDoBrier(null, 10)).toBe("");
		expect(leituraDoBrier(0.02, 2)).toBe("poucos dados");
		expect(leituraDoBrier(0.08, 5)).toBe("bem calibrado");
		expect(leituraDoBrier(0.18, 5)).toBe("razoável");
		expect(leituraDoBrier(0.25, 5)).toBe("razoável");
		expect(leituraDoBrier(0.31, 5)).toBe("pouco calibrado");
	});

	it("nunca afirma excesso de confiança (o Brier não mostra o lado)", () => {
		for (const brier of [0.01, 0.2, 0.9]) expect(leituraDoBrier(brier, 9)).not.toMatch(/demais|excesso/);
	});
});

describe("textoHaQuanto", () => {
	const agora = new Date("2026-11-11T12:00:00.000Z");
	const ha = (ms: number) => new Date(agora.getTime() - ms).toISOString();
	const MIN = 60_000;
	const H = 60 * MIN;
	const D = 24 * H;

	it("minutos, horas, dias, meses e anos", () => {
		expect(textoHaQuanto(ha(10_000), agora)).toBe("agora");
		expect(textoHaQuanto(ha(5 * MIN), agora)).toBe("há 5 min");
		expect(textoHaQuanto(ha(3 * H), agora)).toBe("há 3 h");
		expect(textoHaQuanto(ha(D), agora)).toBe("há 1 dia");
		expect(textoHaQuanto(ha(3 * D), agora)).toBe("há 3 dias");
		expect(textoHaQuanto(ha(29 * D), agora)).toBe("há 29 dias");
		expect(textoHaQuanto(ha(30 * D), agora)).toBe("há 1 mês");
		expect(textoHaQuanto(ha(75 * D), agora)).toBe("há 2 meses");
		expect(textoHaQuanto(ha(400 * D), agora)).toBe("há 1 ano");
		expect(textoHaQuanto(ha(800 * D), agora)).toBe("há 2 anos");
	});

	it("o futuro vale agora e um texto que não é data vale traço; aceita o relógio em número", () => {
		expect(textoHaQuanto(new Date(agora.getTime() + D).toISOString(), agora)).toBe("agora");
		expect(textoHaQuanto("ontem", agora)).toBe("—");
		expect(textoHaQuanto(ha(2 * D), agora.getTime())).toBe("há 2 dias");
	});
});

describe("ids curtos e eventos dos detalhes", () => {
	it("o id do evento sai da parte aleatória", () => {
		expect(idCurtoDoEvento("0mhq4k2a1b3c-9f8e7d6c")).toBe("9f8e7d6c");
		expect(idCurtoDoEvento("semtraco")).toBe("semtraco");
		expect(idCurtoDoEvento("abcdefghijkl")).toBe("efghijkl");
	});

	it("o id do conceito comprido é cortado", () => {
		expect(idCurtoDoConceito("c-limites")).toBe("c-limites");
		expect(idCurtoDoConceito("um-id-bem-comprido-de-conceito")).toBe("um-id-bem-c…");
	});

	it("o nome do conceito, ou o aviso de que o mapa não o tem mais", () => {
		expect(nomeDoConceito({ nome: "Limites" })).toBe("Limites");
		expect(nomeDoConceito({})).toBe("Conceito removido do mapa");
		expect(nomeDoConceito({ nome: "" })).toBe("Conceito removido do mapa");
	});

	it("mostra os mais recentes e diz quantos ficaram de fora", () => {
		const ids = Array.from({ length: LIMITE_EVENTOS_NOS_DETALHES + 5 }, (_, i) => `e${String(i).padStart(3, "0")}-aaaaaaaa`);
		const { ids: mostrados, escondidos } = eventosParaMostrar([...ids].reverse());
		expect(escondidos).toBe(5);
		expect(mostrados.length).toBe(LIMITE_EVENTOS_NOS_DETALHES);
		expect(mostrados.at(-1)).toBe(ids.at(-1));
		expect(eventosParaMostrar(["a", "b"])).toEqual({ ids: ["a", "b"], escondidos: 0 });
	});
});

describe("textoDosIgnorados", () => {
	it("vazio sem ignorados; senão a contagem e o motivo", () => {
		expect(textoDosIgnorados({ materiaInexistente: 0, semConceito: 0 })).toBe("");
		expect(textoDosIgnorados({ materiaInexistente: 13, semConceito: 0 })).toBe("13 eventos ignorados no cálculo: 13 de matéria que não existe mais.");
		expect(textoDosIgnorados({ materiaInexistente: 1, semConceito: 2 })).toBe("3 eventos ignorados no cálculo: 1 de matéria que não existe mais e 2 sem conceito do mapa.");
		expect(textoDosIgnorados({ materiaInexistente: 0, semConceito: 1 })).toBe("1 evento ignorado no cálculo: 1 sem conceito do mapa.");
	});
});
