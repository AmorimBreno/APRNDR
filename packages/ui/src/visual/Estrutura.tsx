// Desenho dos blocos ```vetor``` e ```matriz``` do Markdown (lidos por
// ler-estrutura.ts). O vetor é uma fileira de caixas, o valor dentro e o índice
// embaixo, que quebra em linhas quando é longo; para quem usa leitor de tela, é
// uma lista ("vetor com 5 elementos"). A matriz é uma tabela, com os índices
// das colunas em cima e os das linhas à esquerda, que rola na horizontal.
// `emLinha` (rótulo de alternativa): as caixas de fora viram span, para caber
// dentro do rótulo.

import type { Estrutura } from "./ler-estrutura.ts";

const plural = (quantos: number, singular: string, plural: string) => `${quantos} ${quantos === 1 ? singular : plural}`;

export function descreverEstrutura(estrutura: Estrutura): string {
	const descricao =
		estrutura.tipo === "vetor"
			? `vetor com ${plural(estrutura.valores.length, "elemento", "elementos")}`
			: `matriz com ${plural(estrutura.linhas.length, "linha", "linhas")} e ${plural(estrutura.colunas, "coluna", "colunas")}`;
	return estrutura.rotulo ? `${descricao}: ${estrutura.rotulo}` : descricao;
}

export function DesenhoDaEstrutura({ estrutura, emLinha = false }: { estrutura: Estrutura; emLinha?: boolean }) {
	const Caixa = emLinha ? "span" : "div";
	const descricao = descreverEstrutura(estrutura);
	return (
		<Caixa className={`estrutura estrutura--${estrutura.tipo}`}>
			{estrutura.rotulo ? (
				<Caixa className="estrutura__rotulo" aria-hidden="true">
					{estrutura.rotulo}
				</Caixa>
			) : null}
			{estrutura.tipo === "vetor" ? (
				<ol className="vetor" aria-label={descricao}>
					{estrutura.valores.map((valor, indice) => (
						<li key={indice} className="vetor__celula">
							<span className={`vetor__valor vetor__valor--${valor.tipo}`}>{valor.texto}</span>
							<span className="vetor__indice">
								<span className="ap-visually-hidden">índice </span>
								{indice}
							</span>
						</li>
					))}
				</ol>
			) : (
				<Caixa className="matriz-rolagem">
					<table className="matriz" aria-label={descricao}>
						<thead>
							<tr>
								<td className="matriz__canto" />
								{Array.from({ length: estrutura.colunas }, (_, coluna) => (
									<th key={coluna} scope="col">
										{coluna}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{estrutura.linhas.map((linha, indiceLinha) => (
								<tr key={indiceLinha}>
									<th scope="row">{indiceLinha}</th>
									{linha.map((valor, coluna) => (
										<td key={coluna}>
											<span className={`matriz__valor matriz__valor--${valor.tipo}`}>{valor.texto}</span>
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</Caixa>
			)}
		</Caixa>
	);
}
