// A bancada (docs/mesa-de-estudo.md, 5b): as pills em acimaDoCampo da conversa,
// flutuando logo acima do campo. Uma pill por aba aberta da mesa, na ordem das
// abas. Dentro de cada uma, o olho à esquerda e o nome da aba; a pill inteira é
// o botão que alterna a seleção. Selecionada: o professor recebe a aba inteira
// junto da mensagem (ícone e borda âmbar); não selecionada: só o nome (ícone
// riscado, pill apagada). A aba em foco leva um ponto e o nome em negrito. As
// pills não desmontam ao trocar de foco (a chave é a da aba): só mudam de
// estado. A fileira quebra linha se não couber (são no máximo 6 abas). Quem
// escolhe as chaves selecionadas é a mesa (selecao-bancada.ts).

import { Icon } from "@estudos/design-system";
import type { TipoAbaMesa } from "./abas-mesa.ts";
import { chaveDaFonte, useVendo } from "./vendo.tsx";

const TRACO_ICONE = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "square", strokeLinejoin: "miter" } as const;

/** O mesmo desenho do olho do chip da mensagem (packages/ui/src/visual/Conversa.tsx), que não o exporta. */
function IconeOlho({ aberto }: { aberto: boolean }) {
	return (
		<svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" {...TRACO_ICONE}>
			<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
			{aberto ? <circle cx="12" cy="12" r="2.75" /> : <path d="M4 20L20 4" />}
		</svg>
	);
}

export interface PilulaBancada {
	chave: string;
	tipo: TipoAbaMesa;
	rotulo: string;
}

export interface PropsChipVendo {
	/** As abas abertas, na ordem das abas. Vazio = nada a mostrar. */
	abas: readonly PilulaBancada[];
	/** A aba em foco (a rota de agora), se for uma aba. */
	chaveFoco: string | undefined;
	/** As chaves selecionadas (vão com o conteúdo). */
	selecionadas: ReadonlySet<string>;
	alternar(chave: string): void;
}

export function ChipVendo({ abas, chaveFoco, selecionadas, alternar }: PropsChipVendo) {
	const vendo = useVendo();
	if (abas.length === 0) return null;
	const aviso = "Não consegui ler o arquivo; a última mensagem foi só com o nome.";
	const fonteAtiva = vendo.ativa();
	const chaveAtiva = fonteAtiva ? chaveDaFonte(fonteAtiva) : undefined;
	return (
		<div className="mesa-bancada" role="group" aria-label="O que o professor vê">
			{abas.map((aba) => {
				const marcada = selecionadas.has(aba.chave);
				const foco = aba.chave === chaveFoco;
				// Lição que nunca abriu nesta sessão (restaurada do localStorage) não tem texto para mandar.
				const semConteudo = marcada && aba.tipo === "licao" && aba.chave !== chaveAtiva && vendo.copia(aba.chave) === undefined;
				return (
					<button
						key={aba.chave}
						type="button"
						className={`mesa-vendo${marcada ? " mesa-vendo--aberto" : ""}${foco ? " mesa-vendo--foco" : ""}`}
						aria-pressed={marcada}
						aria-label={`${marcada ? "Tirar da" : "Pôr na"} bancada do professor: ${aba.rotulo}${foco ? " (aba em foco)" : ""}`}
						title={marcada ? "O professor vê o arquivo inteiro" : "O professor vê só o nome"}
						onClick={() => alternar(aba.chave)}
					>
						<span className="mesa-vendo__olho">
							<IconeOlho aberto={marcada} />
						</span>
						{/* O ponto existe em todas as pills (só aparece na em foco): trocar o foco não muda a largura de nenhuma. */}
						<span className="mesa-vendo__ponto" aria-hidden="true" />
						<span className="mesa-vendo__rotulo body-sm">{aba.rotulo}</span>
						{semConteudo ? <span className="mesa-vendo__aviso">abra a aba para o professor ver o conteúdo</span> : null}
						{foco && vendo.falhou ? (
							<span className="mesa-vendo__alerta" role="img" aria-label={aviso} title={aviso}>
								<Icon name="alert" size={14} strokeWidth={2.5} />
							</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}
