// A faixa de abas da mesa de estudo (docs/mesa-de-estudo.md, 2.2 e 2.10): as
// notas e lições abertas da matéria, lembradas por matéria no localStorage. As
// regras (abrir, fechar, limite, rolagem) estão em abas-mesa.ts; aqui ficam a
// gravação e o desenho. Cada aba é role="tab" dentro de um tablist, com o
// teclado do SeletorAbas (setas, Home, End; Delete fecha). O X é um botão
// vizinho da aba, não filho dela (botão dentro de botão não vale).

import { Icon } from "@estudos/design-system";
import { type KeyboardEvent, useCallback, useId, useRef, useState } from "react";
import { type AbaMesa, abaDoCaminho } from "./abas-mesa.ts";
import { abaVizinha } from "./painel-caderno.ts";

function chaveAbas(perfilId: string, materiaId: string): string {
	return `estudos:${perfilId}:${materiaId}:abas-mesa`;
}

function ehAba(valor: unknown): valor is AbaMesa {
	if (typeof valor !== "object" || valor === null) return false;
	const aba = valor as Record<string, unknown>;
	return typeof aba.chave === "string" && typeof aba.caminho === "string" && typeof aba.rotulo === "string" && (aba.tipo === "nota" || aba.tipo === "licao") && (aba.rolagem === undefined || typeof aba.rolagem === "number");
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
	escolher(aba: AbaMesa): void;
	fechar(aba: AbaMesa): void;
}

export function AbasMesa({ abas, ativa, rotuloDaAtiva, escolher, fechar }: PropsAbasMesa) {
	const base = useId();
	const botoes = useRef<Record<string, HTMLButtonElement | null>>({});
	if (abas.length === 0) return null;

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
		<div className="mesa-abas" role="tablist" aria-label="Notas e lições abertas">
			{abas.map((aba) => {
				const escolhida = aba.chave === ativa;
				const rotulo = escolhida && rotuloDaAtiva ? rotuloDaAtiva : aba.rotulo;
				return (
					<div key={aba.chave} role="presentation" className={`mesa-aba${escolhida ? " mesa-aba--ativa" : ""}`}>
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
