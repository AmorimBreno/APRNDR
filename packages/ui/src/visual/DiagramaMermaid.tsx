// Diagramas escritos em ```mermaid``` no Markdown (a conversa, as notas, as lições). O
// desenho sai do próprio mermaid, no navegador, no tema do app. Até o diagrama ficar pronto
// (e se ele não for válido, ou o mermaid não carregar), o que aparece é o bloco de código
// de sempre: conteúdo novo só entra pronto, e um diagrama quebrado nunca vira uma tela de
// erro (docs/padroes-de-interface.md).
//
// Enquanto a resposta chega, o bloco muda a cada palavra: só se desenha depois de ATRASO_MS
// sem mudança. Quando a fonte muda, o desenho anterior continua na tela até o novo ficar
// pronto (ou até se saber que o novo não vale, e então volta o código). O mermaid carrega
// sob demanda (é grande), desenha um diagrama por vez e guarda os desenhos já feitos.
//
// Segurança: securityLevel "strict" (o padrão do mermaid) tira script e links do SVG, e o
// SVG só entra na página depois disso.

import { type ReactNode, useEffect, useRef, useState } from "react";
import { BotaoCopiarImagem, pngDoSvg } from "./BotaoCopiarImagem.tsx";

type Mermaid = typeof import("mermaid").default;

/** Quanto a fonte precisa ficar parada antes de desenhar (a resposta ainda pode estar chegando). */
export const ATRASO_MS = 400;
const GUARDADOS_MAXIMO = 60;

/** O valor de um token do tema, lido na hora de configurar o mermaid (ele não entende var(--x)). */
function token(nome: string, padrao: string): string {
	if (typeof document === "undefined") return padrao;
	return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;
}

let carregando: Promise<Mermaid> | undefined;

function carregar(): Promise<Mermaid> {
	carregando ??= import("mermaid")
		.then(({ default: mermaid }) => {
			const tinta = token("--ink", "#f2eadb");
			const traco = token("--line-strong", "#7d7466");
			const fundo = token("--surface-raised", "#24221f");
			const painel = token("--surface-panel", "#1a1917");
			mermaid.initialize({
				startOnLoad: false,
				securityLevel: "strict",
				theme: "base",
				// Texto em SVG puro (sem foreignObject): os estilos do Prose não vazam para os rótulos.
				htmlLabels: false,
				fontFamily: token("--font-sans", "sans-serif"),
				themeVariables: {
					darkMode: true,
					background: "transparent",
					fontSize: "14px",
					textColor: tinta,
					primaryColor: fundo,
					primaryTextColor: tinta,
					primaryBorderColor: traco,
					secondaryColor: token("--surface-hover", "#2e2b27"),
					secondaryTextColor: tinta,
					tertiaryColor: painel,
					lineColor: token("--ink-muted", "#bdb19e"),
					mainBkg: fundo,
					nodeBorder: traco,
					clusterBkg: painel,
					clusterBorder: traco,
					edgeLabelBackground: painel,
					noteBkgColor: painel,
					noteTextColor: tinta,
					noteBorderColor: traco,
				},
			});
			return mermaid;
		})
		.catch((erro: unknown) => {
			carregando = undefined; // uma nova tentativa na próxima vez (a rede pode voltar)
			throw erro;
		});
	return carregando;
}

const guardados = new Map<string, string>();
let fila: Promise<unknown> = Promise.resolve();
let contador = 0;

/** O SVG da fonte, ou undefined se o mermaid não a aceita. Um diagrama por vez (o mermaid não é reentrante). */
export function desenharMermaid(fonte: string): Promise<string | undefined> {
	const pronto = guardados.get(fonte);
	if (pronto !== undefined) return Promise.resolve(pronto);
	const tarefa = fila.then(async () => {
		const id = `mermaid-${++contador}`;
		try {
			const mermaid = await carregar();
			await mermaid.parse(fonte);
			const { svg } = await mermaid.render(id, fonte);
			if (guardados.size >= GUARDADOS_MAXIMO) guardados.delete(guardados.keys().next().value!);
			guardados.set(fonte, svg);
			return svg;
		} catch {
			return undefined;
		} finally {
			// O mermaid deixa um elemento de apoio no body quando o desenho falha.
			document.getElementById(`d${id}`)?.remove();
		}
	});
	fila = tarefa;
	return tarefa;
}

/** O SVG da fonte quando já está pronto; antes disso (ou se não vale) é undefined. */
function useSvgMermaid(fonte: string): string | undefined {
	const [estado, setEstado] = useState<{ fonte: string; svg: string | undefined } | undefined>(() => {
		const svg = guardados.get(fonte);
		return svg === undefined ? undefined : { fonte, svg };
	});
	useEffect(() => {
		const pronto = guardados.get(fonte);
		if (pronto !== undefined) {
			setEstado({ fonte, svg: pronto });
			return;
		}
		let ativo = true;
		const espera = setTimeout(() => {
			void desenharMermaid(fonte).then((svg) => {
				if (ativo) setEstado({ fonte, svg });
			});
		}, ATRASO_MS);
		return () => {
			ativo = false;
			clearTimeout(espera);
		};
	}, [fonte]);
	// Mudou a fonte e o desenho novo ainda não veio: fica o anterior.
	return estado?.svg;
}

/** `children` é o bloco de código comum, o que aparece enquanto não há diagrama. */
export function DiagramaMermaid({ fonte, children }: { fonte: string; children: ReactNode }) {
	const svg = useSvgMermaid(fonte);
	const caixa = useRef<HTMLDivElement>(null);
	if (svg === undefined) return <>{children}</>;
	// O fundo do PNG é o do próprio bloco (o tema), nunca transparente.
	const fundo = () => (caixa.current ? getComputedStyle(caixa.current).backgroundColor : "") || token("--surface-raised", "#24221f");
	return (
		<div className="diagrama-caixa">
			<div ref={caixa} className="diagrama" role="img" aria-label="Diagrama" dangerouslySetInnerHTML={{ __html: svg }} />
			<BotaoCopiarImagem obterPng={() => pngDoSvg(svg, fundo())} rotulo="Copiar diagrama como imagem" />
		</div>
	);
}
