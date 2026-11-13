// @vitest-environment happy-dom
// A escolha dos materiais do curso na etapa Materiais do guia (TelaGuiaCurso) no DOM: a tela de verdade e uma
// janela falsa em que a "extensão" dos cursos responde como a de verdade (com as funções puras de curso-tipos.ts).
// Cobre a marcação de cada material pronto (todos marcados de saída), a contagem, o aviso de nenhum material, o
// que vai para a extensão (só os desmarcados), o aviso do que a mudança descarta, o curso reaberto com os
// desmarcados de antes e a linha da contagem que não pula. Nada aqui toca a pasta de dados nem a rede.

import type { AcaoRecebida, JanelaPerfilHook, SituacaoMaterial } from "@estudos/ui";
import { createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ArquivoDoCurso, confirmarEtapa, type Curso, escolherMateriais, novoCurso } from "../../lib/curso-tipos.ts";
import { TelaGuiaCurso } from "./TelaGuiaCurso.tsx";

const MATERIA = "calc";
const SESSAO = "0198f3a2-7c4d-7e11-9b2a-5f1d3c8e9a01";
const AGORA = new Date("2026-11-12T10:00:00.000Z");
const BASICO = { nome: "P1: limites", prazo: null, horasPorSemana: 4 };

const pronto = (nome: string): SituacaoMaterial => ({ caminho: `materias/${MATERIA}/materiais/${nome}`, pasta: `materias/${MATERIA}/materiais`, nome, tipo: "pdf", estado: "pronto", tamanho: 1000, trechos: 4 });
const MATERIAIS: SituacaoMaterial[] = [
	pronto("aula-01.pdf"),
	pronto("aula-02.pdf"),
	pronto("aula-03.pdf"),
	{ caminho: `materias/${MATERIA}/materiais/aula-04.pdf`, pasta: `materias/${MATERIA}/materiais`, nome: "aula-04.pdf", tipo: "pdf", estado: "processando", tamanho: 1000, etapa: "página 2 de 10" },
];
const PRONTOS: ArquivoDoCurso[] = ["aula-01.pdf", "aula-02.pdf", "aula-03.pdf"].map((arquivo) => ({ arquivo, hash: `h-${arquivo}` }));

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
async function ate(condicao: () => boolean, prazo = 3000): Promise<void> {
	const fim = Date.now() + prazo;
	while (!condicao()) {
		if (Date.now() > fim) throw new Error("a condição não ficou verdadeira a tempo");
		await esperar(10);
	}
}

interface Enviada {
	acao: string;
	dados: Record<string, unknown>;
}
interface Controle {
	/** O curso.json que a "extensão" tem. */
	curso: Curso;
	enviadas: Enviada[];
	destinos: string[];
	receber(acao: string, dados: unknown): void;
}

let controle: Controle;
let container: HTMLDivElement;
let root: Root;
let contador = 0;

const mapaFalso = { erros: [], fecharErro() {}, operar() {}, aprovar() {}, mapear() {}, refazer() {}, cancelar() {}, doTema() {} };
const cursosFalsos = { comecar: async () => controle.curso, descartar: async () => {}, listar() {} };

function Bancada() {
	const [acoesPorPainel, setAcoes] = useState<Record<string, AcaoRecebida[]>>({});
	const [etapa, setEtapa] = useState("materiais");
	controle.receber = (acao, dados) => {
		const chave = `i${++contador}`;
		setAcoes((atuais) => ({ ...atuais, cursos: [...(atuais.cursos ?? []), { chave, acao, dados }] }));
	};
	const [acoes] = useState(() => ({
		acaoDaInterface: async (painel: string, acao: string, dados: Record<string, unknown>) => {
			controle.enviadas.push({ acao, dados });
			if (painel !== "cursos") return;
			if (acao === "abrir" || acao === "prontos") setTimeout(() => controle.receber("curso", { materia: MATERIA, curso: controle.curso, prontos: PRONTOS }), 5);
			else if (acao === "confirmar" && dados.etapa === "materiais") {
				// Como a extensão: os prontos do disco menos o que a tela diz que ele tirou.
				const tirados = ((dados.dados as { excluidos?: string[] }).excluidos ?? []) as string[];
				const resultado = confirmarEtapa(controle.curso, "materiais", escolherMateriais(PRONTOS, tirados), AGORA);
				controle.curso = resultado.curso;
				setTimeout(() => controle.receber("curso", { materia: MATERIA, curso: resultado.curso, invalidadas: resultado.invalidadas, pedido: dados.pedido, prontos: PRONTOS }), 5);
			}
		},
		enviar: async () => "iniciada" as const,
		listarSessoes: async () => [],
		abrirSessao: async (id: string) => ({ sessaoId: id }),
		enviarMateriais: async () => [],
		reprocessarMaterial: async () => {},
	}));
	const janela = {
		estado: { perfil: "estudos", sessao: { sessaoId: SESSAO, contexto: { chave: `materia:${MATERIA}`, rotulo: "Cálculo" } }, acoesPorPainel, conversa: [], executando: false, fila: [], pedidos: [], registrosPedidos: {} },
		conexao: "aberta",
		acoes,
	} as unknown as JanelaPerfilHook;
	return createElement(TelaGuiaCurso, {
		janela,
		materiaId: MATERIA,
		materia: { id: MATERIA, nome: "Cálculo", cor: "amber", glifo: "∫", provas: [], criadaEm: AGORA.toISOString() },
		cursoId: controle.curso.id,
		etapa,
		mapa: mapaFalso as never,
		cursos: cursosFalsos as never,
		materiais: MATERIAIS,
		navegar: (destino: string) => {
			controle.destinos.push(destino);
			setTimeout(() => setEtapa(destino.split("/").at(-1) ?? ""), 0);
		},
		tom: "amber",
	});
}

const caixas = () => [...container.querySelectorAll<HTMLInputElement>(".material__marcar input[type=checkbox]")];
const caixaDe = (nome: string) => caixas().find((caixa) => caixa.closest(".ap-check")?.textContent?.includes(nome));
const linhas = () => [...container.querySelectorAll<HTMLElement>("li.material")];
const contagem = () => container.querySelector(".guia__escolha")?.textContent ?? "";
const primario = () => container.querySelector<HTMLButtonElement>(".guia__primario button");
const modal = () => document.querySelector<HTMLElement>('[role="dialog"]');
const confirmacoes = () => controle.enviadas.filter((enviada) => enviada.acao === "confirmar");
const pronta = () => caixas().length === 3;
const clicar = (caixa: HTMLInputElement) => caixa.click();

function comCurso(montar: (curso: Curso) => Curso = (curso) => curso) {
	controle.curso = montar(novoCurso("p1-limites", MATERIA, BASICO, AGORA));
	root.render(createElement(Bancada));
}

beforeEach(() => {
	contador = 0;
	controle = { curso: undefined as never, enviadas: [], destinos: [], receber: () => {} };
	localStorage.clear();
	vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
	vi.spyOn(document, "hasFocus").mockReturnValue(true);
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	root.unmount();
	container.remove();
	await esperar(10);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("a escolha dos materiais na etapa Materiais do guia de curso", () => {
	it("cada material pronto vem marcado; o que ainda processa guarda o lugar sem marcação; a contagem diz quantos entram", async () => {
		comCurso();
		await ate(pronta);
		expect(caixas().every((caixa) => caixa.checked)).toBe(true);
		expect(linhas()).toHaveLength(4);
		// O que processa não tem marcação, mas a coluna existe (o texto não anda quando ele ficar pronto).
		expect(linhas()[3]!.querySelector(".material__marcar--vazio")).not.toBeNull();
		expect(linhas()[3]!.querySelector("input")).toBeNull();
		expect(contagem()).toBe("3 materiais neste curso");
		expect(primario()!.textContent).toContain("Continuar");
		expect(primario()!.textContent).not.toContain("sem material");
		expect(container.querySelectorAll(".material--fora")).toHaveLength(0);
	});

	it("desmarcar um material atualiza a contagem, apaga a linha e manda só os desmarcados ao continuar", async () => {
		comCurso();
		await ate(pronta);
		clicar(caixaDe("aula-02.pdf")!);
		await ate(() => contagem() === "2 de 3 materiais neste curso");
		expect(linhas()[1]!.classList.contains("material--fora")).toBe(true);
		expect(linhas()[0]!.classList.contains("material--fora")).toBe(false);
		expect(caixaDe("aula-02.pdf")!.checked).toBe(false);
		primario()!.click();
		await ate(() => confirmacoes().length === 1);
		expect(confirmacoes()[0]!.dados).toMatchObject({ materia: MATERIA, curso: "p1-limites", etapa: "materiais", dados: { excluidos: ["aula-02.pdf"] } });
		await ate(() => controle.destinos.length > 0);
		expect(controle.destinos.at(-1)).toBe(`caderno/${MATERIA}/cursos/p1-limites/guia/objetivo`);
		expect(controle.curso.materiais).toEqual({ arquivos: [PRONTOS[0], PRONTOS[2]], excluidos: ["aula-02.pdf"] });
	});

	it("marcar de volta o que desmarcou continua como estava: nada nas excluidos", async () => {
		comCurso();
		await ate(pronta);
		clicar(caixaDe("aula-01.pdf")!);
		await ate(() => contagem() === "2 de 3 materiais neste curso");
		clicar(caixaDe("aula-01.pdf")!);
		await ate(() => contagem() === "3 materiais neste curso");
		primario()!.click();
		await ate(() => confirmacoes().length === 1);
		expect(confirmacoes()[0]!.dados.dados).toEqual({ excluidos: [] });
		expect(controle.curso.materiais).toEqual({ arquivos: PRONTOS });
	});

	it("sem nenhum material marcado: aviso claro na mesma linha, primário vira 'Continuar sem material' e o curso segue sem arquivos", async () => {
		comCurso();
		await ate(pronta);
		for (const caixa of caixas()) clicar(caixa);
		await ate(() => contagem() === "Nenhum material neste curso.");
		// A explicação do escopo é o texto fixo de cima (a linha da contagem fica curta e não quebra em tela estreita).
		expect(container.querySelector(".guia__texto")!.textContent).toContain("“Só o material” fica indisponível");
		expect(container.querySelector(".guia__escolha--nenhum")).not.toBeNull();
		expect(primario()!.textContent).toContain("Continuar sem material");
		// É a mesma linha da contagem (o elemento não some nem aparece: a altura é conferida no navegador).
		expect(container.querySelectorAll(".guia__escolha")).toHaveLength(1);
		primario()!.click();
		await ate(() => confirmacoes().length === 1);
		expect(confirmacoes()[0]!.dados.dados).toEqual({ excluidos: ["aula-01.pdf", "aula-02.pdf", "aula-03.pdf"] });
		expect(controle.curso.materiais).toEqual({ arquivos: [], excluidos: ["aula-01.pdf", "aula-02.pdf", "aula-03.pdf"] });
	});

	it("o curso reaberto traz os desmarcados de antes; mudar a escolha com o Mapa feito avisa o que descarta antes de mandar", async () => {
		comCurso((curso) => {
			let atual = confirmarEtapa(curso, "materiais", { arquivos: [PRONTOS[0]!, PRONTOS[2]!], excluidos: ["aula-02.pdf"] }, AGORA).curso;
			atual = confirmarEtapa(atual, "objetivo", { escopo: "material_base", tipo: "misto", motivo: "" }, AGORA).curso;
			return confirmarEtapa(atual, "mapa", { conceitos: ["c-1"] }, AGORA).curso;
		});
		await ate(pronta);
		expect(caixaDe("aula-01.pdf")!.checked).toBe(true);
		expect(caixaDe("aula-02.pdf")!.checked).toBe(false);
		expect(contagem()).toBe("2 de 3 materiais neste curso");
		// Continuar sem mexer: nada muda, nada é descartado, vai direto.
		clicar(caixaDe("aula-02.pdf")!);
		await ate(() => contagem() === "3 materiais neste curso");
		primario()!.click();
		await ate(() => modal() !== null);
		expect(modal()!.textContent).toContain("Mapa");
		expect(confirmacoes()).toHaveLength(0);
		const manter = [...modal()!.querySelectorAll<HTMLButtonElement>("button")].find((botao) => botao.textContent?.includes("Manter como estava"));
		manter!.click();
		await ate(() => modal() === null);
		// "Manter como estava" volta às marcações salvas e não manda nada.
		await ate(() => caixaDe("aula-02.pdf")!.checked === false);
		expect(confirmacoes()).toHaveLength(0);
		// Confirmar a mudança manda e o Mapa cai.
		clicar(caixaDe("aula-02.pdf")!);
		await ate(() => contagem() === "3 materiais neste curso");
		primario()!.click();
		await ate(() => modal() !== null);
		[...modal()!.querySelectorAll<HTMLButtonElement>("button")].find((botao) => botao.textContent?.includes("Descartar e continuar"))!.click();
		await ate(() => confirmacoes().length === 1);
		expect(confirmacoes()[0]!.dados.dados).toEqual({ excluidos: [] });
		expect(controle.curso.mapa).toBeNull();
		expect(controle.curso.materiais).toEqual({ arquivos: PRONTOS });
	});

	it("mexer nas marcações e sair pergunta antes; sem mexer, sai direto", async () => {
		comCurso();
		await ate(pronta);
		const sair = () => [...container.querySelectorAll<HTMLButtonElement>("header button")].find((botao) => botao.textContent?.includes("Sair"))!;
		sair().click();
		await ate(() => controle.destinos.length === 1);
		expect(modal()).toBeNull();
		clicar(caixaDe("aula-03.pdf")!);
		await ate(() => contagem() === "2 de 3 materiais neste curso");
		sair().click();
		await ate(() => modal() !== null);
		expect(modal()!.textContent).toContain("Sair sem confirmar esta etapa?");
		expect(controle.destinos).toHaveLength(1);
	});
});
