// O professor agindo na mesa de estudo (parte C1; docs/mesa-parte-c.md, seção 2).
// Arquivo do projeto, não do learn. Duas ferramentas, só na conversa de uma
// matéria (o contexto "materia:<id>" gravado pelo núcleo na sessão; na conversa
// geral elas recusam):
// - abrir_na_mesa: pede à tela para abrir uma nota ou uma lição como aba;
// - destacar_trecho: pede à tela para destacar (ou só rolar até) um trecho de
//   uma aba.
//
// Uma ferramenta do professor não recebe resultado da tela (contrato, B1). Por
// isso a extensão confere TUDO no disco antes de emitir: a matéria, o título da
// nota (conferirTitulo), a nota, o módulo gerado, a lição e o trecho. Só então
// emite um "interface:mostrar" no painel "mesa" com um ComandoMesa de id único e
// gravar: false (um comando gravado voltaria a rodar ao reabrir a conversa, B2)
// e devolve ao modelo "pedido enviado à tela". Não espera a tela. Os títulos, os
// ids e os trechos vêm do modelo: nada vira caminho por concatenação, tudo passa
// pelas conferências das libs.
//
// Com os cursos pausados (CURSOS_NA_INTERFACE, ESPECIFICACAO 13.21), as duas só
// aceitam notas: uma lição é recusada com uma frase para o modelo, e as descrições
// não falam de lições.
import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ErroCurso, ehIdModulo, listarCursos } from "../lib/cursos.ts";
import { ErroMaterias } from "../lib/materias.ts";
import { ACAO_COMANDO_MESA, type ComandoAbrirMesa, type ComandoDestacarMesa, type ComandoMesa, LIMITE_TRECHO_DESTAQUE, PAINEL_MESA } from "../lib/mesa-tipos.ts";
import { lerModulo, type Licao, type ModuloGerado } from "../lib/modulos.ts";
import { garantirMateria, lerNota, previaDaNota } from "../lib/notas.ts";
import { textoDaLicao } from "../paineis/src/licao-texto.ts";
import { rotaDaOrigem } from "../paineis/src/origem-mesa.ts";
import { CURSOS_NA_INTERFACE } from "../paineis/src/painel-caderno.ts";
import { materiaDaConversa } from "./notas.ts";

/** customType da mensagem custom com o contexto da tela, gravada pelo núcleo (packages/core/src/contexto-tela.ts). */
const TIPO_MENSAGEM_CONTEXTO_TELA = "nucleo.contexto-tela";

type Entradas = ReadonlyArray<{ type?: string; customType?: string; data?: unknown; details?: unknown }>;

/** O que o pedido aponta, ainda por conferir no disco. */
type Alvo = { tipo: "nota"; titulo: string } | { tipo: "licao"; curso?: string; modulo: string; licao?: string };

/** Um alvo já conferido: a rota da aba, o rótulo e o texto que a tela mostra (onde o trecho precisa estar). */
interface AlvoConferido {
	tipo: "nota" | "licao";
	caminho: string;
	rotulo: string;
	texto: string;
}

/** Erro de conferência: a frase vai direto ao modelo. */
class ErroMesa extends Error {}

const normalizar = (texto: string) => texto.replace(/\s+/g, " ").trim().toLowerCase();

const respostaErro = (texto: string) => ({ content: [{ type: "text" as const, text: texto }], details: undefined, isError: true as const });

const mensagemDe = (erro: unknown): string => {
	if (erro instanceof ErroMesa || erro instanceof ErroMaterias || erro instanceof ErroCurso) return erro.message;
	return `Não consegui conferir no disco: ${(erro as Error).message}`;
};

/**
 * A aba em foco no último contexto da tela da conversa (a mensagem custom que o
 * núcleo grava depois de cada mensagem do Breno): a origem do contexto com
 * `foco`, sem a âncora. Sem contexto, ou sem foco nele, undefined.
 */
export function abaEmFocoDaConversa(entradas: Entradas): string | undefined {
	let ultimo: unknown;
	for (const entrada of entradas) {
		if (entrada.type === "custom_message" && entrada.customType === TIPO_MENSAGEM_CONTEXTO_TELA) ultimo = entrada.details;
	}
	const contextos = (ultimo as { contextos?: unknown } | undefined)?.contextos;
	if (!Array.isArray(contextos)) return undefined;
	const emFoco = contextos.find((contexto) => (contexto as { foco?: unknown } | null)?.foco === true) as { origem?: unknown } | undefined;
	return typeof emFoco?.origem === "string" && emFoco.origem ? rotaDaOrigem(emFoco.origem) : undefined;
}

/** Uma rota de aba (caderno/<m>/notas/<título> ou caderno/<m>/cursos/<c>/modulos/<mód>[/<lição>]) como alvo; confere que é da matéria da conversa. */
function alvoDaRota(rota: string, materia: string): Alvo {
	const partes = rota.split("/");
	if (partes[0] !== "caderno" || !partes[1]) throw new ErroMesa(`A aba em foco ("${rota}") não é uma nota nem uma lição.`);
	if (partes[1] !== materia) throw new ErroMesa("A aba em foco é de outra matéria; esta conversa é só da matéria dela.");
	if (partes[2] === "notas" && partes.length > 3) return { tipo: "nota", titulo: partes.slice(3).join("/") };
	if (partes[2] === "cursos" && partes[3] && partes[4] === "modulos" && partes[5] && partes.length <= 7) {
		return { tipo: "licao", curso: partes[3], modulo: partes[5], ...(partes[6] ? { licao: partes[6] } : {}) };
	}
	throw new ErroMesa(`A aba em foco ("${rota}") não é uma nota nem uma lição.`);
}

/** O texto de `aba` do destacar_trecho: o título de uma nota, ou [curso/]módulo[/lição] (m1, m1/l2, p1-busca/m1/l2). */
async function alvoDaAba(dados: string, materia: string, aba: string): Promise<Alvo> {
	const partes = aba.split("/").map((parte) => parte.trim());
	if (partes.length === 1) {
		const titulo = aba.trim();
		try {
			await lerNota(dados, materia, titulo);
			return { tipo: "nota", titulo };
		} catch (erro) {
			// Não é uma nota: pode ser o id de um módulo (m1).
			if (!(erro instanceof ErroMaterias) || !ehIdModulo(titulo)) throw erro;
			return { tipo: "licao", modulo: titulo };
		}
	}
	if (partes.length === 2 && ehIdModulo(partes[0])) return { tipo: "licao", modulo: partes[0], licao: partes[1]! };
	if (partes.length === 3 && ehIdModulo(partes[1])) return { tipo: "licao", curso: partes[0]!, modulo: partes[1], licao: partes[2]! };
	throw new ErroMesa(`Não entendi a aba "${aba}". Use o título de uma nota, ou módulo/lição (m1/l2), ou curso/módulo/lição.`);
}

/** O curso e o módulo gerado: o curso pelo id ou nome (se dito) ou o único curso da matéria que tem o módulo. */
async function acharModulo(dados: string, materia: string, pedido: { curso?: string; modulo: string }): Promise<{ cursoId: string; nomeDoModulo: string; modulo: ModuloGerado }> {
	if (!ehIdModulo(pedido.modulo)) throw new ErroMesa(`O módulo "${pedido.modulo}" não é um id de módulo (m1, m2…).`);
	const { cursos } = await listarCursos(dados, materia);
	const pedidoDoCurso = pedido.curso ? normalizar(pedido.curso) : undefined;
	const candidatos = pedidoDoCurso ? cursos.filter((curso) => normalizar(curso.id) === pedidoDoCurso || normalizar(curso.nome) === pedidoDoCurso) : cursos;
	if (pedido.curso && candidatos.length === 0) throw new ErroMesa(`Não achei o curso "${pedido.curso}" nesta matéria.`);
	const achados: Array<{ cursoId: string; nomeDoModulo: string; modulo: ModuloGerado }> = [];
	let aguardando = false;
	for (const curso of candidatos) {
		const lido = await lerModulo(dados, materia, curso.id, pedido.modulo);
		if (!lido) continue;
		if (lido.situacao !== "gerado") {
			aguardando = true;
			continue;
		}
		achados.push({ cursoId: curso.id, nomeDoModulo: curso.esqueleto?.modulos.find((item) => item.id === pedido.modulo)?.nome ?? `Módulo ${pedido.modulo}`, modulo: lido });
	}
	if (achados.length === 0) {
		throw new ErroMesa(aguardando ? `O módulo ${pedido.modulo} ainda está aguardando material: não tem lições para abrir.` : `Não achei o módulo ${pedido.modulo} gerado nesta matéria.`);
	}
	if (achados.length > 1) throw new ErroMesa(`Mais de um curso tem o módulo ${pedido.modulo} (${achados.map((achado) => achado.cursoId).join(", ")}). Diga o curso.`);
	return achados[0]!;
}

/** Confere o alvo no disco e devolve a rota, o rótulo e o texto. Erro de conferência vira ErroMesa/ErroMaterias. */
async function conferirAlvo(dados: string, materia: string, alvo: Alvo): Promise<AlvoConferido> {
	await garantirMateria(dados, materia);
	if (alvo.tipo === "nota") {
		// lerNota passa o título por conferirTitulo e confirma a existência do arquivo.
		const nota = await lerNota(dados, materia, alvo.titulo);
		return { tipo: "nota", caminho: `caderno/${materia}/notas/${nota.titulo}`, rotulo: nota.titulo, texto: nota.conteudo };
	}
	if (!CURSOS_NA_INTERFACE) throw new ErroMesa("As lições estão pausadas (os cursos saíram do app): na mesa só abrem notas.");
	const { cursoId, nomeDoModulo, modulo } = await acharModulo(dados, materia, alvo);
	let licoes: Licao[] = modulo.licoes;
	let rotulo = nomeDoModulo;
	let sufixo = "";
	if (alvo.licao) {
		const pedida = normalizar(alvo.licao);
		const licao = modulo.licoes.find((item) => normalizar(item.id) === pedida) ?? modulo.licoes.find((item) => normalizar(item.titulo) === pedida);
		if (!licao) {
			const lista = modulo.licoes.map((item) => `${item.id} (${item.titulo})`).join(", ");
			throw new ErroMesa(`Não achei a lição "${alvo.licao}" no módulo ${modulo.id}. Lições: ${lista || "nenhuma"}.`);
		}
		licoes = [licao];
		rotulo = licao.titulo;
		sufixo = `/${licao.id}`;
	}
	const texto = licoes.map((licao) => textoDaLicao(licao, modulo.explicacoes)).join("\n\n");
	return { tipo: "licao", caminho: `caderno/${materia}/cursos/${cursoId}/modulos/${modulo.id}${sufixo}`, rotulo, texto };
}

/** O trecho está no texto (normalizado)? Na nota, vale também o texto sem a marcação do markdown, que é o que a tela mostra. */
function trechoEstaNoTexto(trecho: string, alvo: AlvoConferido): boolean {
	const procurado = normalizar(trecho);
	if (normalizar(alvo.texto).includes(procurado)) return true;
	return alvo.tipo === "nota" && normalizar(previaDaNota(alvo.texto, Number.POSITIVE_INFINITY)).includes(procurado);
}

/** Os parâmetros do abrir_na_mesa com os cursos na interface: nota ou lição. */
const PARAMETROS_ABRIR = Type.Object({
	tipo: Type.Union([Type.Literal("nota"), Type.Literal("licao")], { description: '"nota" to open a note, "licao" to open a lesson.' }),
	titulo: Type.Optional(Type.String({ description: 'Note title (tipo "nota").' })),
	modulo: Type.Optional(Type.String({ description: 'Module id, m1, m2… (tipo "licao").' })),
	licao: Type.Optional(Type.String({ description: 'Lesson id (l1, l2…) or title (tipo "licao"). Without it, opens the module at its first lesson.' })),
	curso: Type.Optional(Type.String({ description: 'Course id (from ler_curso), only if the subject has more than one course with that module (tipo "licao").' })),
});

/** Os parâmetros do abrir_na_mesa com os cursos pausados (ESPECIFICACAO 13.21): só nota. */
const PARAMETROS_ABRIR_SO_NOTA = Type.Object({
	tipo: Type.Literal("nota", { description: 'Always "nota".' }),
	titulo: Type.String({ description: "Note title, as listar_notas shows it." }),
});

export default function mesa(pi: ExtensionAPI) {
	const emitir = (comando: ComandoAbrirMesa | ComandoDestacarMesa): ComandoMesa => {
		const dados: ComandoMesa = { ...comando, id: randomUUID() };
		pi.events.emit("interface:mostrar", { painel: PAINEL_MESA, acao: ACAO_COMANDO_MESA, dados, gravar: false });
		return dados;
	};

	pi.registerTool({
		name: "abrir_na_mesa",
		label: "Abrir na mesa",
		description: !CURSOS_NA_INTERFACE
			? "Open one of the user's notes as a tab on the study table, in the screen on the left of this conversation. Only in a subject's conversation. Use it only when what you are talking about is in a note that is not open yet; never to open things 'just in case'. Give tipo \"nota\" and the note title (as listar_notas shows it). The request is checked against the disk first and sent to the screen; the screen may show it as a preview tab, and you get no confirmation of what happened there."
			: "Open one of the user's notes or one lesson as a tab on the study table, in the screen on the left of this conversation. Only in a subject's conversation. Use it only when what you are talking about is in a note or lesson that is not open yet; never to open things 'just in case'. For a note, give its title (as listar_notas shows it). For a lesson, give the module id (m1, m2…) and the lesson id (l1, l2…), and the course id when the subject has more than one course with that module. The request is checked against the disk first and sent to the screen; the screen may show it as a preview tab, and you get no confirmation of what happened there.",
		// Com os cursos pausados, o modelo só vê os campos da nota (o execute continua o mesmo e recusa lição).
		parameters: (CURSOS_NA_INTERFACE ? PARAMETROS_ABRIR : PARAMETROS_ABRIR_SO_NOTA) as unknown as typeof PARAMETROS_ABRIR,
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const materia = materiaDaConversa(ctx.sessionManager.getBranch());
			if (!materia) return respostaErro("Esta ferramenta só vale na conversa de uma matéria (de um caderno). Nesta conversa não há mesa de estudo.");
			try {
				let alvo: Alvo;
				if (params.tipo === "nota") {
					if (typeof params.titulo !== "string") throw new ErroMesa("Diga o título da nota.");
					alvo = { tipo: "nota", titulo: params.titulo };
				} else {
					if (typeof params.modulo !== "string") throw new ErroMesa("Diga o módulo da lição (m1, m2…).");
					alvo = { tipo: "licao", modulo: params.modulo, ...(params.licao ? { licao: params.licao } : {}), ...(params.curso ? { curso: params.curso } : {}) };
				}
				const conferido = await conferirAlvo(ctx.cwd, materia, alvo);
				const comando = emitir({ cmd: "abrir", tipo: conferido.tipo, caminho: conferido.caminho, rotulo: conferido.rotulo, foco: "previa" });
				const oQue = conferido.tipo === "nota" ? `a nota "${conferido.rotulo}"` : `a lição "${conferido.rotulo}"`;
				return { content: [{ type: "text", text: `Pedido enviado à tela: abrir ${oQue} na mesa. A tela decide como mostrar; não há confirmação.` }], details: comando };
			} catch (erro) {
				return respostaErro(mensagemDe(erro));
			}
		},
	});

	pi.registerTool({
		name: "destacar_trecho",
		label: "Destacar trecho",
		description: !CURSOS_NA_INTERFACE
			? `Highlight a passage of a note on the study table, in the screen on the left of this conversation, so the user sees what you are pointing at. Only in a subject's conversation. Use it only when the user asked to see something, or when pointing at a specific passage really helps; never in every answer. The passage must be text that is really in the note (copy it exactly, at most ${LIMITE_TRECHO_DESTAQUE} characters; it is checked on the disk, ignoring extra spaces and letter case). \`aba\` is the note title; without it, the tab the user has in focus. With so_rolar the screen only scrolls to the passage, without highlighting (good for section titles). You get no confirmation of what the screen did.`
			: `Highlight a passage of a note or lesson on the study table, in the screen on the left of this conversation, so the user sees what you are pointing at. Only in a subject's conversation. Use it only when the user asked to see something, or when pointing at a specific passage really helps; never in every answer. The passage must be text that is really in the note or lesson (copy it exactly, at most ${LIMITE_TRECHO_DESTAQUE} characters; it is checked on the disk, ignoring extra spaces and letter case). \`aba\` is the note title, or module/lesson (m1/l2); without it, the tab the user has in focus. With so_rolar the screen only scrolls to the passage, without highlighting (good for section titles). You get no confirmation of what the screen did.`,
		parameters: Type.Object({
			trecho: Type.String({
				description: CURSOS_NA_INTERFACE
					? `The exact text to point at, copied from the note or lesson (up to ${LIMITE_TRECHO_DESTAQUE} characters).`
					: `The exact text to point at, copied from the note (up to ${LIMITE_TRECHO_DESTAQUE} characters).`,
			}),
			aba: Type.Optional(
				Type.String({
					description: CURSOS_NA_INTERFACE
						? "Note title, or module/lesson such as m1/l2 (or course/module/lesson). Without it, the tab in focus on the user's screen."
						: "Note title. Without it, the tab in focus on the user's screen.",
				}),
			),
			so_rolar: Type.Optional(Type.Boolean({ description: "Only scroll to the passage, without highlighting. Default false." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const entradas = ctx.sessionManager.getBranch();
			const materia = materiaDaConversa(entradas);
			if (!materia) return respostaErro("Esta ferramenta só vale na conversa de uma matéria (de um caderno). Nesta conversa não há mesa de estudo.");
			try {
				const trecho = params.trecho.replace(/\s+/g, " ").trim();
				if (!trecho) throw new ErroMesa("Diga o trecho a destacar.");
				if (trecho.length > LIMITE_TRECHO_DESTAQUE) {
					throw new ErroMesa(`O trecho tem ${trecho.length} caracteres e o máximo é ${LIMITE_TRECHO_DESTAQUE}. Mande só um pedaço dele (o começo da frase ou o título da seção).`);
				}
				let alvo: Alvo;
				if (params.aba?.trim()) {
					alvo = await alvoDaAba(ctx.cwd, materia, params.aba);
				} else {
					const emFoco = abaEmFocoDaConversa(entradas);
					if (!emFoco) throw new ErroMesa("Não sei qual é a aba em foco na tela do Breno agora. Diga a aba (o título da nota, ou módulo/lição).");
					alvo = alvoDaRota(emFoco, materia);
				}
				const conferido = await conferirAlvo(ctx.cwd, materia, alvo);
				if (!trechoEstaNoTexto(trecho, conferido)) {
					throw new ErroMesa(
						`Trecho não encontrado ${conferido.tipo === "nota" ? "na nota" : "na lição"} "${conferido.rotulo}". Copie o texto exatamente como está lá (use ler_nota ou ler_modulo para conferir) e tente de novo.`,
					);
				}
				const comando = emitir({ cmd: "destacar", caminho: conferido.caminho, trecho, soRolar: params.so_rolar === true });
				const oQue = params.so_rolar === true ? "rolar até" : "destacar";
				return { content: [{ type: "text", text: `Pedido enviado à tela: ${oQue} o trecho ${conferido.tipo === "nota" ? "da nota" : "da lição"} "${conferido.rotulo}". Não há confirmação do que a tela fez.` }], details: comando };
			} catch (erro) {
				return respostaErro(mensagemDe(erro));
			}
		},
	});
}
