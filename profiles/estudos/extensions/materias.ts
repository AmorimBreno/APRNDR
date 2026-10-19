// Matérias do perfil de estudos (item 4.1). Arquivo do projeto, não do learn.
// A lógica fica em ../lib/materias.ts; aqui ficam:
// - as ferramentas do agente listar_materias e criar_materia (você pode pedir
//   ao professor "crie a matéria Cálculo I");
// - a ponte com a tela de cadernos (docs/ponte-de-eventos.md): a tela manda
//   "interface:acao" no painel "cadernos" (listar, criar) e a extensão
//   responde com "interface:mostrar" (lista, criada, erro). As listas são
//   passageiras (gravar: false): a tela pede de novo sempre que abre.
// A pasta de dados é o cwd da sessão (o núcleo cria a sessão nela).
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { CORES_MATERIA, criarMateria, type EntradaMateria, ErroMaterias, GLIFOS_MATERIA, listarMaterias } from "../lib/materias.ts";

const PAINEL = "cadernos";

export default function materias(pi: ExtensionAPI) {
	let pastaDados: string | undefined;
	let sessao: string | undefined;

	const mostrar = (acao: string, dados: unknown, gravar = false) => pi.events.emit("interface:mostrar", { painel: PAINEL, acao, dados, gravar });

	const mostrarLista = async () => {
		if (!pastaDados) return;
		try {
			mostrar("lista", await listarMaterias(pastaDados));
		} catch (erro) {
			mostrar("erro", { mensagem: (erro as Error).message });
		}
	};

	pi.on("session_start", (_evento, ctx) => {
		pastaDados = ctx.cwd;
		sessao = ctx.sessionManager.getSessionId();
	});

	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados } = recebido as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL) return;
		if (acao === "listar") {
			void mostrarLista();
		} else if (acao === "criar") {
			void (async () => {
				if (!pastaDados) return mostrar("erro", { mensagem: "A sessão ainda não abriu a pasta de dados. Tente de novo." });
				try {
					const materia = await criarMateria(pastaDados, dados as EntradaMateria, sessao ? { sessao } : {});
					mostrar("criada", { id: materia.id });
					await mostrarLista();
				} catch (erro) {
					mostrar("erro", { mensagem: erro instanceof ErroMaterias ? erro.message : `Não consegui criar a matéria: ${(erro as Error).message}`, ao: "criar" });
				}
			})();
		}
	});

	pi.registerTool({
		name: "listar_materias",
		label: "Listar matérias",
		description: "List the user's subjects (matérias): id, name, cover color and glyph, and exam dates. Each subject has a notebook (caderno) in the app.",
		parameters: Type.Object({}),
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const { materias: lista, erros } = await listarMaterias(ctx.cwd);
			const linhas = lista.map((materia) => {
				const provas = materia.provas.map((prova) => `${prova.nome} em ${prova.data}`).join(", ");
				return `- ${materia.nome} (id ${materia.id})${provas ? `: ${provas}` : ""}`;
			});
			const texto = lista.length ? `Matérias:\n${linhas.join("\n")}` : "O usuário ainda não tem matérias.";
			return {
				content: [{ type: "text", text: erros.length ? `${texto}\n\nPastas com erro: ${erros.map((erro) => erro.pasta).join(", ")}` : texto }],
				details: { materias: lista, erros },
			};
		},
	});

	pi.registerTool({
		name: "criar_materia",
		label: "Criar matéria",
		description:
			"Create a new subject (matéria) with its notebook folder. Use when the user asks to create a subject. The id is derived from the name. Do not create a subject the user did not ask for.",
		parameters: Type.Object({
			nome: Type.String({ description: "Subject name, as the user wrote it (e.g. \"Cálculo I\")." }),
			cor: Type.Optional(Type.Union(CORES_MATERIA.map((cor) => Type.Literal(cor)), { description: "Cover color. Default moss." })),
			glifo: Type.Optional(
				Type.String({ description: `Cover ideogram, one of: ${GLIFOS_MATERIA.join(" ")}. Pick by meaning (e.g. 解 for math, 知 for data, 読 for reading). Default 学.` }),
			),
			provas: Type.Optional(
				Type.Array(Type.Object({ nome: Type.String({ description: "Exam name (e.g. P1)." }), data: Type.String({ description: "Exam date, YYYY-MM-DD." }) }), {
					description: "Known exam dates.",
				}),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			try {
				const materia = await criarMateria(ctx.cwd, params, { sessao: ctx.sessionManager.getSessionId() });
				pastaDados ??= ctx.cwd;
				await mostrarLista();
				return { content: [{ type: "text", text: `Matéria criada: ${materia.nome} (id ${materia.id}).` }], details: { materia } };
			} catch (erro) {
				return { content: [{ type: "text", text: `Não criei a matéria: ${(erro as Error).message}` }], details: undefined, isError: true };
			}
		},
	});
}
