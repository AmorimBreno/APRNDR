// Botão "Copiar imagem" das imagens e dos diagramas da conversa: põe a imagem na área de
// transferência como PNG (para colar no Samsung Notes e afins). O retorno aparece no próprio
// botão por um instante, sem mudar o tamanho dele: os textos ficam empilhados na mesma
// célula e só um aparece (docs/padroes-de-interface.md: tamanho estável).

import { useEffect, useRef, useState } from "react";

/** Quanto tempo o retorno ("Copiada" / "Não deu para copiar") fica no botão. */
export const RETORNO_MS = 1500;
const ESCALA_SVG = 2;

type Retorno = "parado" | "copiada" | "falhou";

function carregarImagem(url: string): Promise<HTMLImageElement> {
	return new Promise((resolver, rejeitar) => {
		const imagem = new Image();
		imagem.onload = () => resolver(imagem);
		imagem.onerror = () => rejeitar(new Error("Imagem não carregou"));
		imagem.src = url;
	});
}

function canvasParaPng(imagem: CanvasImageSource, largura: number, altura: number, fundo?: string): Promise<Blob> {
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(largura));
	canvas.height = Math.max(1, Math.round(altura));
	const contexto = canvas.getContext("2d");
	if (!contexto) return Promise.reject(new Error("Sem canvas"));
	if (fundo) {
		contexto.fillStyle = fundo;
		contexto.fillRect(0, 0, canvas.width, canvas.height);
	}
	contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
	return new Promise((resolver, rejeitar) => canvas.toBlob((blob) => (blob ? resolver(blob) : rejeitar(new Error("Sem PNG"))), "image/png"));
}

/** O PNG de uma imagem pelo endereço (a mesma URL que a tela usa). Outros formatos passam por um canvas. */
export async function pngDaUrl(url: string): Promise<Blob> {
	const resposta = await fetch(url);
	if (!resposta.ok) throw new Error(`Imagem indisponível (${resposta.status})`);
	const blob = await resposta.blob();
	if (blob.type === "image/png") return blob;
	const local = URL.createObjectURL(blob);
	try {
		const imagem = await carregarImagem(local);
		return await canvasParaPng(imagem, imagem.naturalWidth || imagem.width, imagem.naturalHeight || imagem.height);
	} finally {
		URL.revokeObjectURL(local);
	}
}

/** O PNG de um SVG (texto), com o fundo dado (um SVG transparente ficaria ilegível colado em fundo escuro). */
export async function pngDoSvg(svg: string, fundo: string): Promise<Blob> {
	const documento = new DOMParser().parseFromString(svg, "image/svg+xml");
	const raiz = documento.documentElement;
	const caixa = raiz.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
	const largura = caixa?.[2] || Number.parseFloat(raiz.getAttribute("width") ?? "") || 800;
	const altura = caixa?.[3] || Number.parseFloat(raiz.getAttribute("height") ?? "") || 600;
	// Sem tamanho em pixels o navegador não sabe desenhar o SVG num canvas (o mermaid usa width="100%").
	raiz.setAttribute("width", String(largura));
	raiz.setAttribute("height", String(altura));
	raiz.removeAttribute("style");
	if (!raiz.getAttribute("xmlns")) raiz.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	const texto = new XMLSerializer().serializeToString(raiz);
	const imagem = await carregarImagem(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`);
	return canvasParaPng(imagem, largura * ESCALA_SVG, altura * ESCALA_SVG, fundo);
}

/** `obterPng` roda no clique; o clique já é o gesto que a área de transferência exige. */
export function BotaoCopiarImagem({ obterPng, rotulo = "Copiar imagem" }: { obterPng: () => Promise<Blob>; rotulo?: string }) {
	const [retorno, setRetorno] = useState<Retorno>("parado");
	const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(relogio.current), []);

	function mostrar(novo: Retorno) {
		setRetorno(novo);
		clearTimeout(relogio.current);
		relogio.current = setTimeout(() => setRetorno("parado"), RETORNO_MS);
	}

	async function copiar() {
		try {
			// A promessa vai dentro do ClipboardItem para o clique valer enquanto a imagem é preparada.
			await navigator.clipboard.write([new ClipboardItem({ "image/png": obterPng() })]);
			mostrar("copiada");
		} catch {
			mostrar("falhou");
		}
	}

	return (
		<button type="button" className="botao-copiar-imagem body-sm" aria-label={rotulo} onClick={() => void copiar()}>
			<span className="botao-copiar-imagem__texto" data-ativo={retorno === "parado"}>Copiar imagem</span>
			<span className="botao-copiar-imagem__texto" data-ativo={retorno === "copiada"}>Copiada</span>
			<span className="botao-copiar-imagem__texto" data-ativo={retorno === "falhou"}>Não deu para copiar</span>
		</button>
	);
}
