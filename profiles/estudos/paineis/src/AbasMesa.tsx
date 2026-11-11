// A faixa de abas da mesa de estudo (docs/mesa-de-estudo.md, 2.2 e 2.10): as
// notas e lições abertas da matéria, lembradas por matéria no localStorage. As
// regras (abrir, fechar, limite, rolagem) estão em abas-mesa.ts; aqui ficam a
// gravação e o desenho. Cada aba é role="tab" dentro de um tablist, com o
// teclado do SeletorAbas (setas, Home, End; Delete fecha); o botão do meio do
// mouse também fecha. O X é um botão vizinho da aba, não filho dela (botão dentro
// de botão não vale). A faixa mora dentro do cartão da nota ou da lição (logo
// abaixo do cabeçalho) e rola na horizontal quando as abas não cabem, com as
// bordas esmaecidas (data-esq e data-dir, lidos pelo mesa.css) onde há mais.

import { Icon } from "@estudos/design-system";
import { semMovimento } from "@estudos/ui";
import { type KeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { type AbaMesa, abaDoCaminho } from "./abas-mesa.ts";
import { abaVizinha } from "./painel-caderno.ts";

function chaveAbas(perfilId: string, materiaId: string): string {
	return `estudos:${perfilId}:${materiaId}:abas-mesa`;
}

function ehAba(valor: unknown): valor is AbaMesa {
	if (typeof valor !== "object" || valor === null) return false;
	const aba = valor as Record<string, unknown>;
	return (
		typeof aba.chave === "string" &&
		typeof aba.caminho === "string" &&
		typeof aba.rotulo === "string" &&
		(aba.tipo === "nota" || aba.tipo === "licao") &&
		(aba.rolagem === undefined || typeof aba.rolagem === "number") &&
		(aba.previa === undefined || typeof aba.previa === "boolean")
	);
}

/** As abas lembradas da matéria; sem localStorage, ou com dado estragado, nenhuma. Descarta as que não são mais uma aba reconhecida. */
function lerAbas(perfilId: string, materiaId: string): AbaMesa[] {
	try {
		const bruto = localStorage.getItem(chaveAbas(perfilId, materiaId));
		const lido: unknown = bruto ? JSON.parse(bruto) : [];
		return Array.isArray(lido) ? lido.filter(ehAba).filter((aba) => abaDoCaminho(aba.caminho)?.chave === aba.chave) : [];
	} catch {
		return [];
	}
}

function guardarAbas(perfilId: string, materiaId: string, abas: readonly AbaMesa[]): void {
	try {
		localStorage.setItem(chaveAbas(perfilId, materiaId), JSON.stringify(abas));
	} catch {
		// Sem armazenamento: vale só nesta abertura.
	}
}

/** As abas da matéria, lidas e gravadas no localStorage. Ao trocar de matéria, lê as dela na própria renderização. */
export function useAbasGuardadas(perfilId: string, materiaId: string): [AbaMesa[], (atualizar: (atuais: AbaMesa[]) => AbaMesa[]) => void] {
	const chave = chaveAbas(perfilId, materiaId);
	const [estado, setEstado] = useState(() => ({ chave, abas: lerAbas(perfilId, materiaId) }));
	let abas = estado.abas;
	if (estado.chave !== chave) {
		abas = lerAbas(perfilId, materiaId);
		setEstado({ chave, abas });
	}
	// A versão mais nova, para gravar sem esperar a renderização (a mesa pode desmontar logo depois).
	const ultima = useRef(abas);
	ultima.current = abas;
	const atualizar = useCallback(
		(mudar: (atuais: AbaMesa[]) => AbaMesa[]) => {
			const novas = mudar(ultima.current);
			ultima.current = novas;
			guardarAbas(perfilId, materiaId, novas);
			setEstado({ chave: chaveAbas(perfilId, materiaId), abas: novas });
		},
		[perfilId, materiaId],
	);
	return [abas, atualizar];
}

export interface PropsAbasMesa {
	abas: readonly AbaMesa[];
	/** A chave da aba ativa (a rota de agora), ou undefined quando a rota não é uma aba. */
	ativa?: string;
	/** O rótulo da aba ativa vindo da fonte registrada, que vale mais que o guardado. */
	rotuloDaAtiva?: string;
	/** A aba que o professor abriu ou apontou (parte C1): pulsa uma vez a cada `vez` nova, quando ela já está na faixa. */
	pulso?: { chave: string; vez: number };
	escolher(aba: AbaMesa): void;
	fechar(aba: AbaMesa): void;
}

/** O pulso da aba do professor: um anel âmbar que acende e apaga (só sombra e fundo: o tamanho não muda). */
const QUADROS_PULSO: Keyframe[] = [
	{ boxShadow: "inset 0 0 0 1px var(--line), 0 0 0 0 color-mix(in srgb, var(--amber) 0%, transparent)" },
	{ boxShadow: "inset 0 0 0 1px var(--amber), 0 0 0 3px color-mix(in srgb, var(--amber) 45%, transparent)" },
	{ boxShadow: "inset 0 0 0 1px var(--line), 0 0 0 0 color-mix(in srgb, var(--amber) 0%, transparent)" },
];

const pulsosFeitos = new WeakSet<object>();

export function AbasMesa({ abas, ativa, rotuloDaAtiva, pulso, escolher, fechar }: PropsAbasMesa) {
	const base = useId();
	const botoes = useRef<Record<string, HTMLButtonElement | null>>({});
	// O pulso de cada pedido sai uma vez só, quando a aba já existe na faixa (a aba nova pode chegar um render depois). A
	// faixa é remontada ao trocar de nota: o registro do que já pulsou fica fora do componente.
	const chavesAgora = abas.map((aba) => aba.chave).join("\n");
	useEffect(() => {
		if (!pulso || pulsosFeitos.has(pulso)) return;
		const caixa = botoes.current[pulso.chave]?.parentElement;
		if (!caixa) return;
		pulsosFeitos.add(pulso);
		caixa.scrollIntoView?.({ inline: "nearest", block: "nearest" });
		if (semMovimento() || typeof caixa.animate !== "function") return;
		caixa.animate(QUADROS_PULSO, { duration: 700, iterations: 3, easing: "ease-in-out" });
	}, [pulso, chavesAgora]);
	const faixa = useRef<HTMLDivElement>(null);
	const [bordas, setBordas] = useState({ esq: false, dir: false });
	const temAbas = abas.length > 0;
	const medir = useCallback(() => {
		const elemento = faixa.current;
		if (!elemento) return;
		const esq = elemento.scrollLeft > 1;
		const dir = elemento.scrollLeft + elemento.clientWidth < elemento.scrollWidth - 1;
		setBordas((atual) => (atual.esq === esq && atual.dir === dir ? atual : { esq, dir }));
	}, []);
	// Mede ao mudar a lista e a largura; a ativa entra na parte visível da faixa.
	useLayoutEffect(() => {
		const elemento = faixa.current;
		if (!elemento) return;
		medir();
		if (typeof ResizeObserver !== "function") return;
		const observador = new ResizeObserver(medir);
		observador.observe(elemento);
		return () => observador.disconnect();
	}, [temAbas, abas.length, medir]);
	useEffect(() => {
		if (!ativa) return;
		botoes.current[ativa]?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
	}, [ativa]);
	if (!temAbas) return null;

	const chaves = abas.map((aba) => aba.chave);
	// Só uma aba entra na ordem do Tab: a ativa (ou a primeira, se a rota de agora não é uma aba).
	const tabulavel = ativa && chaves.includes(ativa) ? ativa : chaves[0];

	const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>, aba: AbaMesa) => {
		if (evento.key === "Delete") {
			evento.preventDefault();
			fechar(aba);
			return;
		}
		const vizinha = abaVizinha(chaves, aba.chave, evento.key);
		if (!vizinha) return;
		evento.preventDefault();
		botoes.current[vizinha]?.focus();
		const alvo = abas.find((outra) => outra.chave === vizinha);
		if (alvo) escolher(alvo);
	};

	return (
		<div ref={faixa} className="mesa-abas" role="tablist" aria-label="Notas e lições abertas" data-esq={bordas.esq ? "sim" : undefined} data-dir={bordas.dir ? "sim" : undefined} onScroll={medir}>
			{abas.map((aba) => {
				const escolhida = aba.chave === ativa;
				const rotulo = escolhida && rotuloDaAtiva ? rotuloDaAtiva : aba.rotulo;
				return (
					<div
							key={aba.chave}
							role="presentation"
							className={`mesa-aba${escolhida ? " mesa-aba--ativa" : ""}${aba.previa ? " mesa-aba--previa" : ""}`}
							// O botão do meio fecha a aba; o mousedown dele não pode abrir o rolar automático do navegador.
							onMouseDown={(evento) => {
								if (evento.button === 1) evento.preventDefault();
							}}
							onAuxClick={(evento) => {
								if (evento.button !== 1) return;
								evento.preventDefault();
								fechar(aba);
							}}
						>
						<button
							ref={(elemento) => {
								botoes.current[aba.chave] = elemento;
							}}
							type="button"
							role="tab"
							id={`${base}-${aba.chave}`}
							aria-selected={escolhida}
							tabIndex={aba.chave === tabulavel ? 0 : -1}
							className="mesa-aba__botao"
							title={rotulo}
							onClick={() => escolher(aba)}
							onKeyDown={(evento) => aoTeclar(evento, aba)}
						>
							<Icon name={aba.tipo === "licao" ? "book" : "notebook"} size={16} strokeWidth={2.25} />
							<span className="body-sm mesa-aba__rotulo">{rotulo}</span>
						</button>
						<button type="button" tabIndex={-1} className="mesa-aba__fechar" aria-label={`Fechar a aba ${rotulo}`} title="Fechar a aba (Delete)" onClick={() => fechar(aba)}>
							<Icon name="close" size={14} strokeWidth={2.5} />
						</button>
					</div>
				);
			})}
		</div>
	);
}
