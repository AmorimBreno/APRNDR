// Notas pessoais do caderno (item 4.3, parte B). Arquivo do projeto, não do learn.
// A lógica fica em ../lib/notas.ts; aqui ficam:
// - a ponte com o caderno (docs/ponte-de-eventos.md): a tela manda
//   "interface:acao" no painel "notas" (listar, abrir, criar, salvar,
//   renomear, guardar, guardou, desfazer_nota) e a extensão responde com
//   "interface:mostrar" (lista, nota, criada, salva, guardada, conflito,
//   renomeada, desfeita, erro), sempre passageiros (gravar: false). Os de uma
//   nota levam materia e titulo; salvar, guardar e desfazer_nota levam o
//   "pedido" da tela de volta, para ela saber a que pedido a resposta é;
// - o "Guardar na nota" da mesa (docs/mesa-parte-c.md, seção 5): guardar
//   acrescenta o texto ao fim de uma nota FECHADA, na fila da nota, com a
//   versão lida e a gravação segura, e grava guardou_na_nota; guardou só grava
//   o evento (a tela inseriu o texto no editor aberto e o salvamento
//   automático grava a nota). As duas levam a `sessao` da tela, que precisa ser
//   a desta extensão;
// - o evento editou_nota: um por abertura da nota em que ela mudou. A tela
//   gera um id ("edicao") quando abre a nota e o manda em cada salvamento;
//   só o primeiro salvamento de cada edicao grava o evento;
// - as notas do professor (parte D da mesa, docs/mesa-parte-d.md): a ferramenta
//   criar_nota cria uma nota NOVA, com a marca "Nota do professor" na primeira
//   linha (lib/nota-do-professor.ts), na fila da nota, e depois de gravar o
//   arquivo e o evento criou_nota_do_professor (com o hash do arquivo) emite no
//   painel "mesa" a ação nota_criada, com gravar: true, para o cartão com Abrir
//   e Desfazer. A ação desfazer_nota (painel "notas") apaga essa nota só se o
//   arquivo ainda tem o hash do último criou_nota_do_professor do título, e
//   grava desfez_nota_do_professor; confere a `sessao` como o guardar;
// - as ferramentas de leitura do professor, listar_notas e ler_nota. Numa
//   conversa de caderno (contexto "materia:<id>" gravado pelo núcleo na
//   sessão) elas e o criar_nota ficam na matéria da conversa (o criar_nota só
//   funciona nela). O professor cria notas novas, mas nas notas do Breno só
//   lê: nunca escreve nelas.
import { readFile, rm } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { acrescentarEvento, criarEvento, lerEventos } from "../lib/eventos.ts";
import { ErroMaterias, eventosMateria } from "../lib/materias.ts";
import { PAINEL_MESA } from "../lib/mesa-tipos.ts";
import { arquivoContinuaIgual, hashDoArquivo, LIMITE_NOTA_DO_PROFESSOR, montarNotaDoProfessor } from "../lib/nota-do-professor.ts";
import { conferirTitulo, temHtmlDesconhecido } from "../lib/nota-tipos.ts";
import { apagarNota, arquivoNota, criarNota, ErroConflito, garantirMateria, lerNota, listarNotas, renomearNota, salvarNota, versaoDe } from "../lib/notas.ts";

const PAINEL = "notas";

/** Até quantos caracteres o "Guardar na nota" acrescenta de uma vez. */
const LIMITE_GUARDAR = 100_000;

/** customType da entrada com o contexto da sessão, gravada pelo núcleo (packages/core/src/sessoes.ts). */
const TIPO_ENTRADA_CONTEXTO = "nucleo.contexto";

/** Até quantos caracteres ler_nota devolve de uma vez. */
const LIMITE_LEITURA = 40_000;

interface DadosAcao {
	materia?: string;
	titulo?: string;
	conteudo?: string;
	versao?: string;
	forcar?: boolean;
	edicao?: string;
	pedido?: string;
	de?: string;
	para?: string;
	/** guardar: o markdown a acrescentar (já formatado pela tela, lib/trecho-guardado.ts). */
	texto?: string;
	/** guardar e guardou: o id da sessão da conversa. */
	sessao?: string;
	/** guardou: quantos caracteres a tela inseriu. */
	tamanho?: number;
}

/** O texto acrescentado ao fim da nota, com uma linha em branco antes; o que já estava na nota fica como está. */
export function acrescentarAoFim(conteudo: string, texto: string): string {
	if (conteudo === "") return texto;
	if (conteudo.endsWith("\n\n")) return `${conteudo}${texto}`;
	return `${conteudo}${conteudo.endsWith("\n") ? "\n" : "\n\n"}${texto}`;
}

/** A matéria da conversa: o último contexto "materia:<id>" gravado na sessão. */
export function materiaDaConversa(entradas: ReadonlyArray<{ type?: string; customType?: string; data?: unknown }>): string | undefined {
	let materia: string | undefined;
	for (const entrada of entradas) {
		if (entrada.type !== "custom" || entrada.customType !== TIPO_ENTRADA_CONTEXTO) continue;
		const chave = (entrada.data as { chave?: unknown } | undefined)?.chave;
		materia = typeof chave === "string" && chave.startsWith("materia:") ? chave.slice("materia:".length) : undefined;
	}
	return materia;
}

const mensagemDe = (erro: unknown, acao: string) => (erro instanceof ErroMaterias ? erro.message : `Não consegui ${acao} a nota: ${(erro as Error).message}`);

const mensagemGuardar = (erro: unknown, oQue: string) => (erro instanceof ErroMaterias ? erro.message : `Não consegui ${oQue}: ${(erro as Error).message}`);

const VERBOS_DO_PROFESSOR = new Set<string>(["criou_nota_do_professor", "desfez_nota_do_professor"]);

/**
 * Cria a nota do professor: a nota nova (criarNota recusa um título que já existe, nunca sobrescreve), o
 * arquivo com a marca e o conteúdo, e o evento criou_nota_do_professor com o hash do arquivo. Se algo falha
 * depois da nota nascer, o que esta função gravou é desfeito (só se o arquivo ainda é o dela). Roda na fila da nota.
 */
async function criarNotaDoProfessor(dados: string, materia: string, titulo: string, conteudo: string, sessao: string) {
	const texto = montarNotaDoProfessor({ conteudo, sessao, em: new Date() });
	const nota = await criarNota(dados, materia, titulo, { sessao });
	try {
		await salvarNota(dados, materia, nota.titulo, texto, { versao: versaoDe(""), sessao });
		const hash = hashDoArquivo(texto);
		const tamanho = Buffer.byteLength(texto, "utf8");
		await acrescentarEvento(
			eventosMateria(dados, materia),
			criarEvento({ sessao, verbo: "criou_nota_do_professor", objeto: { materia, titulo: nota.titulo, tamanho, hash } }),
		);
		return { titulo: nota.titulo, tamanho, hash };
	} catch (erro) {
		// Não deixa uma nota vazia ou pela metade para trás, mas também nunca apaga o que não é nosso.
		const arquivo = arquivoNota(dados, materia, nota.titulo);
		const atual = await readFile(arquivo, "utf8").catch(() => undefined);
		if (atual === "" || atual === texto) await rm(arquivo, { force: true }).catch(() => undefined);
		throw erro;
	}
}

/**
 * Desfaz uma nota do professor: só apaga o arquivo se o último evento do título é um criou_nota_do_professor e o
 * arquivo ainda tem o hash dele (o Breno não mexeu). Depois grava desfez_nota_do_professor. Devolve o título.
 * Lança ErroMaterias com a razão (e "Nada foi apagado.") quando recusa. Roda na fila da nota.
 */
async function desfazerNota(dados: string, materia: string, tituloPedido: string, sessao: string): Promise<string> {
	await garantirMateria(dados, materia);
	const { eventos } = await lerEventos(eventosMateria(dados, materia));
	const procurado = tituloPedido.toLowerCase();
	let ultimo: (typeof eventos)[number] | undefined;
	for (const evento of eventos) {
		const titulo = evento.objeto.titulo;
		if (!VERBOS_DO_PROFESSOR.has(evento.verbo) || evento.objeto.materia !== materia || typeof titulo !== "string" || titulo.toLowerCase() !== procurado) continue;
		ultimo = evento;
	}
	if (!ultimo) throw new ErroMaterias("Esta nota não foi criada pelo professor. Nada foi apagado.");
	if (ultimo.verbo === "desfez_nota_do_professor") throw new ErroMaterias("Esta nota já foi desfeita. Nada foi apagado.");
	const { titulo: tituloGravado, hash } = ultimo.objeto;
	const conferido = typeof tituloGravado === "string" ? conferirTitulo(tituloGravado) : { erro: "título ausente" };
	if ("erro" in conferido || typeof hash !== "string") throw new ErroMaterias("O registro da criação desta nota está incompleto. Nada foi apagado.");
	const arquivo = arquivoNota(dados, materia, conferido.titulo);
	let bytes: Buffer;
	try {
		bytes = await readFile(arquivo);
	} catch (erro) {
		if ((erro as NodeJS.ErrnoException).code === "ENOENT") throw new ErroMaterias("A nota não existe mais (foi apagada ou mudou de nome). Nada foi apagado.");
		throw erro;
	}
	if (!arquivoContinuaIgual(bytes, hash)) throw new ErroMaterias("A nota foi alterada depois de criada; por isso não a apaguei. Nada foi apagado.");
	await rm(arquivo, { maxRetries: 5, retryDelay: 50 });
	await acrescentarEvento(
		eventosMateria(dados, materia),
		criarEvento({ sessao, verbo: "desfez_nota_do_professor", objeto: { materia, titulo: conferido.titulo } }),
	);
	return conferido.titulo;
}

export default function notas(pi: ExtensionAPI) {
	let pastaDados: string | undefined;
	let sessao: string | undefined;
	/** As aberturas (edicao) que já gravaram editou_nota. */
	const edicoesRegistradas = new Set<string>();
	/** Uma fila por nota: um salvamento ou uma troca de nome espera o anterior da mesma nota. */
	const filas = new Map<string, Promise<unknown>>();

	const mostrar = (acao: string, dados: unknown) => pi.events.emit("interface:mostrar", { painel: PAINEL, acao, dados, gravar: false });

	const naFila = (chave: string, tarefa: () => Promise<void>) => {
		const anterior = filas.get(chave) ?? Promise.resolve();
		const proxima = anterior.then(tarefa, tarefa);
		filas.set(chave, proxima);
		void proxima.finally(() => {
			if (filas.get(chave) === proxima) filas.delete(chave);
		});
	};

	/** Como naFila, mas devolve o que a tarefa devolveu (ou lança o que ela lançou). */
	const naFilaComResultado = <T>(chave: string, tarefa: () => Promise<T>): Promise<T> =>
		new Promise<T>((resolver, rejeitar) => {
			naFila(chave, async () => {
				try {
					resolver(await tarefa());
				} catch (erro) {
					rejeitar(erro);
				}
			});
		});

	pi.on("session_start", (_evento, ctx) => {
		pastaDados = ctx.cwd;
		sessao = ctx.sessionManager.getSessionId();
	});

	/** Espera o que está na fila das notas da matéria (a lista logo depois de sair do editor vem com o último salvamento). */
	const filaDaMateria = (materia: string) =>
		Promise.all([...filas.entries()].filter(([chave]) => chave.startsWith(`${materia}/`)).map(([, tarefa]) => tarefa.catch(() => undefined)));

	const mostrarLista = async (dados: string, materia: string) => {
		try {
			await filaDaMateria(materia);
			mostrar("lista", await listarNotas(dados, materia));
		} catch (erro) {
			mostrar("erro", { mensagem: mensagemDe(erro, "listar"), ao: "listar", materia });
		}
	};

	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados: bruto } = recebido as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL) return;
		const dadosAcao = (bruto ?? {}) as DadosAcao;
		const { materia } = dadosAcao;
		if (typeof materia !== "string") return;
		// Sem session_start, esta cópia não é a da sessão: ao recarregar o código, o
		// núcleo carrega as extensões uma vez a mais (montagem.ts), e essa carga
		// continua ouvindo o barramento (ver packages/core/src/ponte.ts). Ela fica
		// calada; quem responde é a cópia da sessão.
		const dados = pastaDados;
		if (!dados) return;
		const daSessao = sessao ? { sessao } : {};

		if (acao === "listar") {
			void mostrarLista(dados, materia);
		} else if (acao === "abrir" && typeof dadosAcao.titulo === "string") {
			const titulo = dadosAcao.titulo;
			void (async () => {
				try {
					mostrar("nota", await lerNota(dados, materia, titulo));
				} catch (erro) {
					mostrar("erro", { mensagem: mensagemDe(erro, "abrir"), ao: "abrir", materia, titulo });
				}
			})();
		} else if (acao === "criar" && typeof dadosAcao.titulo === "string") {
			const titulo = dadosAcao.titulo;
			void (async () => {
				try {
					const nota = await criarNota(dados, materia, titulo, daSessao);
					mostrar("criada", { materia, titulo: nota.titulo });
					await mostrarLista(dados, materia);
				} catch (erro) {
					mostrar("erro", { mensagem: mensagemDe(erro, "criar"), ao: "criar", materia, titulo });
				}
			})();
		} else if (acao === "salvar" && typeof dadosAcao.titulo === "string" && typeof dadosAcao.conteudo === "string") {
			const { titulo, conteudo, edicao, pedido } = dadosAcao;
			naFila(`${materia}/${titulo.toLowerCase()}`, async () => {
				const registrarEdicao = typeof edicao === "string" && !edicoesRegistradas.has(edicao);
				try {
					const salva = await salvarNota(dados, materia, titulo, conteudo, {
						...(typeof dadosAcao.versao === "string" ? { versao: dadosAcao.versao } : {}),
						...(dadosAcao.forcar ? { forcar: true } : {}),
						registrarEdicao,
						...daSessao,
					});
					if (registrarEdicao) edicoesRegistradas.add(edicao);
					mostrar("salva", { materia, titulo, ...salva, ...(pedido ? { pedido } : {}) });
				} catch (erro) {
					if (erro instanceof ErroConflito) {
						mostrar("conflito", { materia, titulo, mensagem: erro.message, ...(erro.versaoAtual ? { versaoAtual: erro.versaoAtual } : {}), ...(pedido ? { pedido } : {}) });
					} else {
						mostrar("erro", { mensagem: mensagemDe(erro, "salvar"), ao: "salvar", materia, titulo, ...(pedido ? { pedido } : {}) });
					}
				}
			});
		} else if (acao === "renomear" && typeof dadosAcao.de === "string" && typeof dadosAcao.para === "string") {
			const { de, para } = dadosAcao;
			naFila(`${materia}/${de.toLowerCase()}`, async () => {
				try {
					const { titulo, mencoesAtualizadas } = await renomearNota(dados, materia, de, para, daSessao);
					mostrar("renomeada", { materia, de, para: titulo, mencoesAtualizadas: mencoesAtualizadas ?? [] });
						// A extensão dos planos escuta: se a conversa segue esta nota (um plano de estudos), passa a seguir o título novo.
						pi.events.emit("notas:renomeada", { materia, de, para: titulo });
					// Sem esperar: a lista espera a fila, e esta tarefa ainda está nela.
					void mostrarLista(dados, materia);
				} catch (erro) {
					mostrar("erro", { mensagem: mensagemDe(erro, "renomear"), ao: "renomear", materia, titulo: de });
				}
			});
		} else if (acao === "apagar" && typeof dadosAcao.titulo === "string") {
			// O botão Apagar do editor (as notas do Breno): vai para notas/.lixeira, na fila da nota, com a versão que a tela abriu.
			const { titulo, pedido, versao } = dadosAcao;
			naFila(`${materia}/${titulo.toLowerCase()}`, async () => {
				try {
					const apagada = await apagarNota(dados, materia, titulo, { ...(typeof versao === "string" ? { versao } : {}), ...daSessao });
					mostrar("apagada", { materia, titulo: apagada.titulo, ...(pedido ? { pedido } : {}) });
					// Sem esperar: a lista espera a fila, e esta tarefa ainda está nela.
					void mostrarLista(dados, materia);
				} catch (erro) {
					const mensagem = erro instanceof ErroConflito ? `${erro.message} Nada foi apagado.` : mensagemDe(erro, "apagar");
					mostrar("erro", { mensagem, ao: "apagar", materia, titulo, ...(pedido ? { pedido } : {}) });
				}
			});
		} else if (acao === "desfazer_nota" && typeof dadosAcao.titulo === "string") {
			const { titulo, pedido } = dadosAcao;
			const falhou = (mensagem: string) => mostrar("erro", { mensagem, ao: "desfazer_nota", materia, titulo, ...(pedido ? { pedido } : {}) });
			// Como no guardar: a tela manda o id da sessão que ela mostra.
			if (!sessao || dadosAcao.sessao !== sessao) {
				falhou("Este pedido é de outra conversa, não da que está aberta. Nada foi apagado.");
				return;
			}
			const conferido = conferirTitulo(titulo);
			if ("erro" in conferido) return falhou(`${conferido.erro} Nada foi apagado.`);
			const idSessao = sessao;
			naFila(`${materia}/${conferido.titulo.toLowerCase()}`, async () => {
				try {
					const apagada = await desfazerNota(dados, materia, conferido.titulo, idSessao);
					mostrar("desfeita", { materia, titulo: apagada, ...(pedido ? { pedido } : {}) });
				} catch (erro) {
					falhou(erro instanceof ErroMaterias ? erro.message : `Não consegui desfazer a nota: ${(erro as Error).message}`);
				}
			});
		} else if ((acao === "guardar" || acao === "guardou") && typeof dadosAcao.titulo === "string") {
			const { titulo, texto, pedido } = dadosAcao;
			const falhou = (mensagem: string) => mostrar("erro", { mensagem, ao: acao, materia, titulo, ...(pedido ? { pedido } : {}) });
			// A tela manda o id da sessão que ela mostra; se não é o desta extensão, o pedido é de outra conversa.
			if (!sessao || dadosAcao.sessao !== sessao) {
				falhou("Este pedido é de outra conversa, não da que está aberta. Nada foi guardado.");
				return;
			}
			const chave = `${materia}/${titulo.toLowerCase()}`;
			if (acao === "guardar") {
				if (typeof texto !== "string" || texto.trim() === "") return falhou("Não há texto para guardar na nota.");
				if (texto.length > LIMITE_GUARDAR) return falhou(`O trecho passa de ${LIMITE_GUARDAR} caracteres; guarde um pedaço menor.`);
				// Nota fechada: lê, acrescenta no fim e grava na fila da nota, com a versão lida (se a nota mudou
				// fora do app no meio, vem o conflito e nada é sobrescrito). Só depois de gravar vai o evento.
				naFila(chave, async () => {
					try {
						const nota = await lerNota(dados, materia, titulo);
						const novo = acrescentarAoFim(nota.conteudo, texto);
						const salva = await salvarNota(dados, materia, nota.titulo, novo, { versao: nota.versao, ...daSessao });
						await acrescentarEvento(
							eventosMateria(dados, materia),
							criarEvento({ ...daSessao, verbo: "guardou_na_nota", objeto: { materia, titulo: nota.titulo, sessao, tamanho: texto.length } }),
						);
						const conteudo = novo === "" || novo.endsWith("\n") ? novo : `${novo}\n`;
						mostrar("guardada", { materia, titulo: nota.titulo, conteudo, versao: salva.versao, modificadaEm: salva.modificadaEm, tamanho: texto.length, ...(pedido ? { pedido } : {}) });
					} catch (erro) {
						falhou(erro instanceof ErroConflito ? `${erro.message} Nada foi guardado.` : mensagemGuardar(erro, "guardar o trecho na nota"));
					}
				});
			} else {
				const { tamanho } = dadosAcao;
				if (typeof tamanho !== "number" || !Number.isInteger(tamanho) || tamanho < 0) return falhou("Faltou o tamanho do que foi guardado.");
				// Nota aberta no editor: a tela inseriu o texto e o salvamento automático grava a nota; aqui só o evento.
				naFila(chave, async () => {
					try {
						const nota = await lerNota(dados, materia, titulo);
						await acrescentarEvento(
							eventosMateria(dados, materia),
							criarEvento({ ...daSessao, verbo: "guardou_na_nota", objeto: { materia, titulo: nota.titulo, sessao, tamanho } }),
						);
					} catch (erro) {
						falhou(mensagemGuardar(erro, "registrar o que foi guardado na nota"));
					}
				});
			}
		}
	});

	/** A matéria que a ferramenta lê: a da conversa, se ela for de um caderno; senão, a do parâmetro. */
	const escolherMateria = (pedida: string | undefined, entradas: Parameters<typeof materiaDaConversa>[0]): { materia: string } | { erro: string } => {
		const daConversa = materiaDaConversa(entradas);
		if (daConversa) {
			if (pedida && pedida !== daConversa) return { erro: `Esta conversa é do caderno "${daConversa}": as notas de outras matérias ficam de fora aqui.` };
			return { materia: daConversa };
		}
		if (!pedida) return { erro: "Diga a matéria (o id, de listar_materias)." };
		return { materia: pedida };
	};

	pi.registerTool({
		name: "listar_notas",
		label: "Listar notas",
		description:
			"List the user's personal notes in a subject's notebook: title, last change and a short preview. In a notebook conversation, the subject is the conversation's. Notes are the user's own writing: read them to understand what they wrote, never write or change them (notes you created yourself with criar_nota are marked [do professor] in the list; notes marked [plano de estudos] are study plans, which you read with ler_plano and update only with the plan tools).",
		parameters: Type.Object({
			materia: Type.Optional(Type.String({ description: "Subject id (from listar_materias). Not needed in a notebook conversation." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const escolha = escolherMateria(params.materia, ctx.sessionManager.getBranch());
			if ("erro" in escolha) return { content: [{ type: "text", text: escolha.erro }], details: undefined, isError: true };
			try {
				const lista = await listarNotas(ctx.cwd, escolha.materia);
				const linhas = lista.notas.map((nota) => `- ${nota.titulo}${nota.doProfessor ? " [do professor]" : ""}${nota.plano ? " [plano de estudos]" : ""} (mudou em ${nota.modificadaEm.slice(0, 10)})${nota.previa ? `: ${nota.previa}` : ""}`);
				const texto = linhas.length ? `Notas de ${escolha.materia}:\n${linhas.join("\n")}` : `O caderno ${escolha.materia} ainda não tem notas.`;
				return { content: [{ type: "text", text: texto }], details: lista };
			} catch (erro) {
				return { content: [{ type: "text", text: mensagemDe(erro, "listar") }], details: undefined, isError: true };
			}
		},
	});

	pi.registerTool({
		name: "criar_nota",
		label: "Criar nota",
		description:
			"Create a NEW note in the notebook of the subject of this conversation (only available in a subject's notebook conversation). Takes a title and the note's content in markdown (up to 100000 characters; formulas as $...$ and $$...$$; no raw HTML). Use it when the user asks for a note or a summary, or when a new note clearly helps them; never 'just in case'. It never overwrites: if a note with that title already exists it fails, so pick another title. You cannot change or delete notes, the user's or yours: for the user's own notes you only read (listar_notas, ler_nota). The app writes a first line marking the note as the teacher's and shows the user a card in the conversation with Open and Undo buttons. After creating, say the note's title and that there is an Undo button; do not say you saved anything beyond what this tool confirms.",
		parameters: Type.Object({
			titulo: Type.String({ description: 'Note title (it becomes the file name: no < > : " / \\ | ? * or square brackets; up to 120 characters).' }),
			conteudo: Type.String({ description: "The note's content, in markdown. Do not write the 'Nota do professor' line: the app adds it." }),
		}),
		async execute(chamada, params, _signal, _onUpdate, ctx) {
			const falha = (texto: string) => ({ content: [{ type: "text" as const, text: texto }], details: undefined, isError: true });
			const materia = materiaDaConversa(ctx.sessionManager.getBranch());
			if (!materia) return falha("criar_nota só funciona na conversa do caderno de uma matéria. Nada foi criado.");
			const conferido = conferirTitulo(params.titulo);
			if ("erro" in conferido) return falha(`${conferido.erro} Nada foi criado.`);
			if (params.conteudo.trim() === "") return falha("A nota precisa de conteúdo. Nada foi criado.");
			if (params.conteudo.length > LIMITE_NOTA_DO_PROFESSOR) {
				return falha(`O conteúdo passa de ${LIMITE_NOTA_DO_PROFESSOR} caracteres; faça uma nota menor ou divida em duas. Nada foi criado.`);
			}
			if (temHtmlDesconhecido(params.conteudo)) {
				return falha("O conteúdo tem HTML que o editor das notas não conhece, e a nota abriria só para leitura. Escreva em markdown puro (fórmulas com $...$). Nada foi criado.");
			}
			const sessaoId = ctx.sessionManager.getSessionId();
			try {
				const criada = await naFilaComResultado(`${materia}/${conferido.titulo.toLowerCase()}`, () =>
					criarNotaDoProfessor(ctx.cwd, materia, conferido.titulo, params.conteudo, sessaoId),
				);
				// Só depois de gravar o arquivo e o evento: o cartão da tela parte do que existe.
				pi.events.emit("interface:mostrar", {
					painel: PAINEL_MESA,
					acao: "nota_criada",
					dados: { materia, titulo: criada.titulo, rota: `caderno/${materia}/notas/${criada.titulo}`, chamada, sessao: sessaoId },
					gravar: true,
				});
				return {
					content: [
						{
							type: "text" as const,
							text: `Nota "${criada.titulo}" criada no caderno ${materia}. O Breno vê na conversa um cartão com os botões Abrir e Desfazer. Diga o título e que há um botão Desfazer.`,
						},
					],
					details: { materia, titulo: criada.titulo, tamanho: criada.tamanho },
				};
			} catch (erro) {
				return falha(`${mensagemDe(erro, "criar")} Nada foi criado.`);
			}
		},
	});

	pi.registerTool({
		name: "ler_nota",
		label: "Ler nota",
		description:
			"Read one of the user's personal notes (markdown) by its title. In a notebook conversation, the subject is the conversation's. Read only: never write or change the user's notes.",
		parameters: Type.Object({
			titulo: Type.String({ description: "Note title, as listar_notas shows it." }),
			materia: Type.Optional(Type.String({ description: "Subject id (from listar_materias). Not needed in a notebook conversation." })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const escolha = escolherMateria(params.materia, ctx.sessionManager.getBranch());
			if ("erro" in escolha) return { content: [{ type: "text", text: escolha.erro }], details: undefined, isError: true };
			try {
				const nota = await lerNota(ctx.cwd, escolha.materia, params.titulo);
				const cortada = nota.conteudo.length > LIMITE_LEITURA;
				const corpo = cortada ? `${nota.conteudo.slice(0, LIMITE_LEITURA)}\n\n[… a nota continua; mostrei os primeiros ${LIMITE_LEITURA} caracteres]` : nota.conteudo;
				return {
					content: [{ type: "text", text: `# Nota "${nota.titulo}" (${escolha.materia}, mudou em ${nota.modificadaEm.slice(0, 10)})\n\n${corpo || "(vazia)"}` }],
					details: { materia: nota.materia, titulo: nota.titulo, modificadaEm: nota.modificadaEm, caracteres: nota.conteudo.length },
				};
			} catch (erro) {
				return { content: [{ type: "text", text: mensagemDe(erro, "ler") }], details: undefined, isError: true };
			}
		},
	});
}
