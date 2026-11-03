// @vitest-environment happy-dom
// Interação dos termos dentro das alternativas: HTML válido, teclado e seleção.
import { QuizQuestion } from "@estudos/design-system";
import { Markdown } from "@estudos/ui";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type AcoesTermos, ProvedorTermos } from "./TermosModulo.tsx";

let container: HTMLDivElement;
let root: Root;
let acoes: AcoesTermos;
const escolher = vi.fn();
const matchMediaOriginal = window.matchMedia.bind(window);
beforeEach(() => {
	// O happy-dom rejeita a promessa de uma animação nativa cancelada no unmount.
	// Estes testes são de interação; movimento é conferido no Edge.
	vi.stubGlobal("matchMedia", (query: string) => {
		const consulta = matchMediaOriginal(query);
		Object.defineProperty(consulta, "matches", { value: query.includes("prefers-reduced-motion") });
		return consulta;
	});
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	escolher.mockClear();
	acoes = {
		modulo: "m1",
		glossario: [
			{
				id: "t-radical",
				termo: "radical",
				definicao: "Forma reduzida de uma palavra.",
				explicado: null,
				lugar: null,
				origem: "anotacao",
				criadoEm: "2026-10-29",
				alteradoEm: "2026-10-29",
			},
		],
		explicando: [],
		falhas: [],
		erros: {},
		marcar: async () => {},
		explicar: async () => {},
		guardar: async () => {},
		ir: vi.fn(),
	};
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	window.getSelection()?.removeAllRanges();
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
	vi.unstubAllGlobals();
});
async function renderizar(desligado = false) {
	await act(async () =>
		root.render(
			createElement(ProvedorTermos, {
				acoes,
				children: createElement(QuizQuestion, {
					interactiveLabels: true,
					prompt: "Qual termo?",
					disabled: desligado,
					onChange: escolher,
					options: [
						{ id: "a", label: createElement(Markdown, { texto: "Um [radical](termo:t-radical) é uma forma reduzida.", emLinha: true }) },
						{ id: "b", label: "Uma frase." },
					],
				}),
			}),
		),
	);
}
const radios = () => [...container.querySelectorAll<HTMLButtonElement>("[role=radio]")];
const termo = () => container.querySelector<HTMLButtonElement>(".termo-chave")!;
async function clicar(elemento: HTMLElement) {
	await act(async () => elemento.click());
}

it("clicar no termo consulta a definição sem escolher a alternativa", async () => {
	await renderizar();
	expect(container.querySelector("button button")).toBeNull();
	await clicar(termo());
	expect(escolher).not.toHaveBeenCalled();
	expect(document.querySelector("[role=tooltip]")?.textContent).toContain("Não explicado no curso");
	await clicar(radios()[0]!);
	expect(escolher).toHaveBeenCalledWith("a");
});

it("uma atualização da ponte mantém o termo focado e o cartão aberto", async () => {
	await renderizar();
	const original = termo();
	await act(async () => original.focus());
	expect(document.querySelector("[role=tooltip]")).not.toBeNull();
	acoes = { ...acoes, erros: { outro: "Erro em outro pedido" } };
	await renderizar();
	expect(termo()).toBe(original);
	expect(document.activeElement).toBe(original);
	expect(document.querySelector("[role=tooltip]")).not.toBeNull();
	await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
	expect(document.querySelector("[role=tooltip]")).toBeNull();
});

it("as teclas do termo não escolhem e as teclas do radio continuam funcionando", async () => {
	await renderizar();
	await act(async () => {
		termo().focus();
		termo().dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
	});
	expect(escolher).not.toHaveBeenCalled();
	await act(async () => {
		radios()[0]!.focus();
		radios()[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
	});
	expect(escolher).toHaveBeenCalledWith("b");
	expect(document.activeElement).toBe(radios()[1]);
});

it("selecionar texto da alternativa não escolhe uma resposta", async () => {
	await renderizar();
	const label = container.querySelector<HTMLElement>(".ap-opt__label")!;
	const range = document.createRange();
	range.selectNodeContents(label);
	window.getSelection()!.addRange(range);
	await clicar(label);
	expect(escolher).not.toHaveBeenCalled();
	window.getSelection()!.removeAllRanges();
	await clicar(label);
	expect(escolher).toHaveBeenCalledWith("a");
});

it("mesmo com a questão desligada, a definição pode ser consultada", async () => {
	await renderizar(true);
	await clicar(termo());
	expect(document.querySelector("[role=tooltip]")).not.toBeNull();
	await clicar(radios()[0]!);
	expect(escolher).not.toHaveBeenCalled();
});
