// Extensão inline do núcleo com as ferramentas de materiais (buscar_material,
// ler_material e listar_arquivos_de_material) e os avisos do serviço para as
// extensões do perfil, no barramento da sessão:
// - "materiais:pronto" {caminho, pasta, nome, tipo, trechos, custo, novo};
// - "materiais:removido" {caminho, pasta, nome}.
// Entra em toda sessão principal de um perfil com "materiais" no profile.json.
//
// Escopo: numa sessão com contexto (a conversa de um caderno), a busca e a
// lista ficam na pasta do contexto (escopoMateriais, "materias/calculo-i"). O
// agente só sai dela com todas: true, quando o usuário pede.

import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ServicoMateriais, SituacaoMaterial } from "./servico.ts";
import type { Trecho } from "./tipos.ts";

/** Texto máximo que ler_material devolve de uma vez. */
export const LIMITE_LEITURA = 40_000;

export const EVENTOS_MATERIAIS = { pronto: "materiais:pronto", removido: "materiais:removido" } as const;

const descricaoOrigem = (origem: string) => (origem === "visao" ? " (descrita pela visão)" : "");

/** O número de um trecho para de/ate: a página no PDF, a célula no notebook, a posição nos outros. */
const numeroDoTrecho = (trecho: Trecho, indice: number) => trecho.pagina ?? trecho.celula ?? indice + 1;

function linhaSituacao(situacao: SituacaoMaterial): string {
	const estado =
		situacao.estado === "pronto"
			? `pronto, ${situacao.trechos ?? 0} trechos`
			: situacao.estado === "erro"
				? `erro: ${situacao.erro}`
				: situacao.estado === "nao_suportado"
					? "formato não suportado"
					: situacao.estado === "processando"
						? `processando (${situacao.etapa ?? "..."})`
						: "na fila";
	return `- ${situacao.caminho} [${situacao.tipo ?? "?"}; ${estado}]`;
}

/** A pasta da busca: dentro do escopo (a pedida, se estiver nele; senão o escopo), ou a pedida se for em tudo. */
export function pastaDaBusca(escopo: string | undefined, pedida: string | undefined, todas: boolean | undefined): string | undefined {
	const limpa = (pasta: string) => pasta.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	if (!escopo || todas) return pedida ? limpa(pedida) : undefined;
	const raiz = limpa(escopo);
	const dentro = pedida ? limpa(pedida) : "";
	return dentro === raiz || dentro.startsWith(`${raiz}/`) ? dentro : raiz;
}

export function criarExtensaoMateriais(servico: ServicoMateriais, escopo?: string): InlineExtension {
	const parametroTodas = Type.Optional(
		Type.Boolean({
			description: escopo
				? `This conversation is scoped to ${escopo}; searches stay there. Set true only when the user explicitly asks to look in all subjects.`
				: "No effect: this conversation has no scope.",
		}),
	);
	return {
		name: "nucleo-materiais",
		factory: (pi) => {
			const parar = servico.assinar((evento) => {
				if (evento.tipo === "pronto") pi.events.emit(EVENTOS_MATERIAIS.pronto, evento.material);
				else if (evento.tipo === "removido") pi.events.emit(EVENTOS_MATERIAIS.removido, { caminho: evento.caminho, pasta: evento.pasta, nome: evento.nome });
			});
			pi.on("session_shutdown", () => parar());

			pi.registerTool({
				name: "buscar_material",
				label: "Buscar no material",
				description:
					"Full-text search over the user's processed course materials (PDF slides and handouts, Python files, notebooks, markdown). Returns the best matching passages with file path and location (page, cell, function). Accent- and case-insensitive; words are prefix-matched. Use it before explaining something the materials cover, and cite the file and page.",
				parameters: Type.Object({
					consulta: Type.String({ description: "Words to search for (Portuguese or the material's language). Use the key terms, not a whole sentence." }),
					pasta: Type.Optional(Type.String({ description: 'Limit to a folder of the data folder, e.g. "materias/calculo-i".' })),
					limite: Type.Optional(Type.Integer({ minimum: 1, maximum: 30, description: "How many passages (default 8)." })),
					todas: parametroTodas,
				}),
				async execute(_id, params) {
					const pasta = pastaDaBusca(escopo, params.pasta, params.todas);
					const resultados = servico.buscar(params.consulta, { ...(pasta ? { pasta } : {}), limite: params.limite ?? 8 });
					const onde = pasta ? ` (em ${pasta})` : "";
					if (resultados.length === 0) {
						const prontos = servico.situacao().filter((situacao) => situacao.estado === "pronto").length;
						return {
							content: [{ type: "text", text: prontos ? `Nada encontrado para "${params.consulta}"${onde}.` : "Ainda não há material processado." }],
							details: { resultados },
						};
					}
					const linhas = resultados.map(
						(resultado, indice) => `${indice + 1}. ${resultado.caminho}, ${resultado.local}${descricaoOrigem(resultado.origem)}\n   ${resultado.recorte.replace(/\s+/g, " ")}`,
					);
					return {
						content: [
							{
								type: "text",
								text: `${resultados.length} trechos para "${params.consulta}"${onde}:\n${linhas.join("\n")}\n\nPara ler o trecho inteiro, use ler_material com o caminho e o número da página ou da célula.`,
							},
						],
						details: { resultados },
					};
				},
			});

			pi.registerTool({
				name: "ler_material",
				label: "Ler material",
				description:
					"Read the extracted text of a processed material file. For PDFs, de/ate are page numbers; for notebooks, cell numbers; for other files, section numbers. Pages that are mostly images come as a description written by a vision model (marked as such). Long reads are cut; continue from where it says.",
				parameters: Type.Object({
					caminho: Type.String({ description: "File path as returned by buscar_material or listar_arquivos_de_material." }),
					de: Type.Optional(Type.Integer({ minimum: 1, description: "First page/cell/section (default 1)." })),
					ate: Type.Optional(Type.Integer({ minimum: 1, description: "Last page/cell/section (default: as much as fits)." })),
				}),
				async execute(_id, params) {
					try {
						const { situacao, trechos } = await servico.ler(params.caminho);
						const de = params.de ?? 1;
						const ate = params.ate ?? Number.POSITIVE_INFINITY;
						const escolhidos = trechos.map((trecho, indice) => ({ trecho, numero: numeroDoTrecho(trecho, indice) })).filter(({ numero }) => numero >= de && numero <= ate);
						if (escolhidos.length === 0) {
							return { content: [{ type: "text", text: `${situacao.nome} não tem nada entre ${de} e ${params.ate ?? "o fim"} (são ${trechos.length} trechos).` }], details: undefined };
						}
						const partes: string[] = [];
						let tamanho = 0;
						let parouEm: number | undefined;
						for (const { trecho, numero } of escolhidos) {
							const parte = `## ${trecho.local}${descricaoOrigem(trecho.origem)}\n\n${trecho.texto || "(sem texto)"}`;
							if (partes.length > 0 && tamanho + parte.length > LIMITE_LEITURA) {
								parouEm = numero;
								break;
							}
							partes.push(parte);
							tamanho += parte.length;
						}
						const fim = parouEm ? `\n\n[Cortado para caber. Continue com de=${parouEm}.]` : "";
						return { content: [{ type: "text", text: `# ${situacao.caminho}\n\n${partes.join("\n\n")}${fim}` }], details: { caminho: situacao.caminho, parouEm } };
					} catch (erro) {
						return { content: [{ type: "text", text: (erro as Error).message }], details: undefined, isError: true };
					}
				},
			});

			pi.registerTool({
				name: "listar_arquivos_de_material",
				label: "Listar arquivos de material",
				description: "List the material files the app knows (processed or not), with type and status. Optionally limited to a folder of the data folder.",
				parameters: Type.Object({
					pasta: Type.Optional(Type.String({ description: 'Folder of the data folder, e.g. "materias/calculo-i".' })),
					todas: parametroTodas,
				}),
				async execute(_id, params) {
					const pasta = pastaDaBusca(escopo, params.pasta, params.todas);
					const prefixo = pasta ? `${pasta}/` : "";
					const lista = servico.situacao().filter((situacao) => situacao.caminho.startsWith(prefixo));
					return {
						content: [{ type: "text", text: lista.length ? lista.map(linhaSituacao).join("\n") : "Nenhum arquivo de material." }],
						details: { materiais: lista },
					};
				},
			});
		},
	};
}
