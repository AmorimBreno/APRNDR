// Verificação do diagnóstico do guia de cursos (item 5, parte B) com chamadas
// reais aos modelos de profiles/estudos/prompts/diagnostico.md e corretor.md.
// Monta numa pasta temporária (fora do Drive), pela lib, uma matéria com um
// .extraido pequeno (3 trechos sobre regressão linear), o mapa aprovado com 6
// conceitos e as referências, e um curso até a etapa Mapa (tipo misto, escopo
// só o material). Carrega a extensão profiles/estudos/extensions/cursos.ts
// pelo carregador de extensões do pi (o mesmo das sessões), entrega a ela o
// registro de modelos de verdade e manda, pela ponte, a autoavaliação, a
// geração das questões e a resposta da dissertativa (uma resposta mediana
// escrita aqui). Mostra as questões (enunciado, a correta e as confusões), a
// correção por critério, o custo e os eventos. A pasta temporária é apagada
// no fim.
//
// Uso, na raiz do repositório (a chave vem do processo ou, se faltar, das
// variáveis de usuário do Windows; o script nunca a imprime):
//   node_modules\.bin\tsx scripts\testar-diagnostico.ts
//
// Sai com código 1 se a geração ou a correção falhar.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { carregarChaves } from "../apps/server/src/chaves.ts";
import { criarRegistroModelos } from "../packages/core/src/modelos.ts";
import type { MensagemCurso } from "../profiles/estudos/lib/curso-tipos.ts";
import { comecarCurso, confirmarNoDisco, lerCurso, materiaisProntos } from "../profiles/estudos/lib/cursos.ts";
import type { QuestaoDissertativa, RespostaDissertativa } from "../profiles/estudos/lib/diagnostico.ts";
import { lerEventos } from "../profiles/estudos/lib/eventos.ts";
import { gravarMapa, type MapaConteudo, mapaVazio, pastaExtraidoArquivo } from "../profiles/estudos/lib/mapa.ts";
import { criarMateria, eventosAprendiz, eventosMateria } from "../profiles/estudos/lib/materias.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// O pi do packages/core (a raiz do monorepo não tem node_modules dele).
const pi = (await import(pathToFileURL(join(raiz, "packages", "core", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js")).href)) as typeof import("@earendil-works/pi-coding-agent");

const origem = carregarChaves(["OPENROUTER_API_KEY"]);
console.log(`OPENROUTER_API_KEY: ${origem.OPENROUTER_API_KEY}`);

const ARQUIVO = "aula-regressao.pdf";
const TRECHOS: Array<[local: string, nome: string, texto: string]> = [
	[
		"página 1",
		"pagina-001",
		"Regressão linear simples. Queremos descrever como uma variável resposta y varia com uma variável explicativa x por uma reta: $y_i = \\beta_0 + \\beta_1 x_i + \\varepsilon_i$. O intercepto $\\beta_0$ é o valor esperado de y quando x = 0, e a inclinação $\\beta_1$ é quanto y muda, em média, quando x aumenta uma unidade. O termo $\\varepsilon_i$ é o erro: o que a reta não explica. Supomos que os erros têm média zero, variância constante (homocedasticidade) e são independentes entre si.",
	],
	[
		"página 2",
		"pagina-002",
		"Mínimos quadrados. Os coeficientes estimados $\\hat\\beta_0$ e $\\hat\\beta_1$ são os que minimizam a soma dos quadrados dos resíduos, $\\sum (y_i - \\hat y_i)^2$, onde $\\hat y_i = \\hat\\beta_0 + \\hat\\beta_1 x_i$ é o valor previsto. O resíduo $e_i = y_i - \\hat y_i$ é a diferença entre o observado e o previsto; ele é positivo quando o ponto está acima da reta. A inclinação estimada é $\\hat\\beta_1 = \\frac{\\sum (x_i - \\bar x)(y_i - \\bar y)}{\\sum (x_i - \\bar x)^2}$, e a reta sempre passa pelo ponto $(\\bar x, \\bar y)$. Elevar ao quadrado impede que resíduos positivos e negativos se cancelem e pesa mais os erros grandes.",
	],
	[
		"página 3",
		"pagina-003",
		"Qualidade do ajuste. O coeficiente de determinação $R^2 = 1 - \\frac{SQR}{SQT}$ é a fração da variabilidade de y explicada pela reta, entre 0 e 1; SQR é a soma dos quadrados dos resíduos e SQT a soma dos quadrados total, $\\sum (y_i - \\bar y)^2$. Um $R^2$ alto não prova que x causa y, nem que a relação é linear: sempre olhe o gráfico dos resíduos contra os valores previstos. Um padrão em forma de funil indica que a variância dos erros não é constante; uma curva indica que a relação não é linear.",
	],
];

const CONCEITOS: Array<{ id: string; nome: string; descricao: string; trechos: string[]; prioridade: "alta" | "normal" }> = [
	{ id: "c-reta", nome: "Regressão linear simples", descricao: "Modelar y como uma reta em x mais um erro.", trechos: ["pagina-001"], prioridade: "alta" },
	{ id: "c-coef", nome: "Interpretação dos coeficientes", descricao: "O que o intercepto e a inclinação dizem sobre y.", trechos: ["pagina-001"], prioridade: "normal" },
	{ id: "c-mq", nome: "Mínimos quadrados", descricao: "Escolher a reta que minimiza a soma dos quadrados dos resíduos.", trechos: ["pagina-002"], prioridade: "normal" },
	{ id: "c-res", nome: "Resíduo", descricao: "A diferença entre o valor observado e o previsto pela reta.", trechos: ["pagina-002", "pagina-003"], prioridade: "normal" },
	{ id: "c-r2", nome: "Coeficiente de determinação (R²)", descricao: "A fração da variabilidade de y explicada pela reta.", trechos: ["pagina-003"], prioridade: "normal" },
	{ id: "c-sup", nome: "Suposições do modelo", descricao: "Erros com média zero, variância constante e independentes.", trechos: ["pagina-001", "pagina-003"], prioridade: "normal" },
];

const NIVEIS = { "c-reta": 3, "c-coef": 2, "c-mq": 2, "c-res": 1, "c-r2": 0, "c-sup": 1 };

/** Uma resposta mediana: acerta a ideia da reta e do resíduo, erra de leve o critério e não fala da previsão com cuidado. */
const RESPOSTA_MEDIANA =
	"A regressão linear tenta achar uma reta que passe pelos pontos do gráfico de x e y. Para escolher a reta, a gente olha a distância dos pontos até ela, que é o resíduo, e escolhe a reta em que essas distâncias somadas ficam pequenas. Depois dá para usar a reta para estimar y para outros valores de x. Acho que quanto mais pontos perto da reta, melhor o modelo.";

const dados = await mkdtemp(join(tmpdir(), "estudos-testar-diagnostico-"));
let falhou = false;
try {
	const materia = (await criarMateria(dados, { nome: "Ciência de Dados" })).id;

	// O .extraido: o manifesto e um .md por trecho.
	const pasta = pastaExtraidoArquivo(dados, materia, ARQUIVO);
	await mkdir(pasta, { recursive: true });
	for (const [local, nome, texto] of TRECHOS) await writeFile(join(pasta, `${nome}.md`), `---\narquivo: ${ARQUIVO}\nlocal: ${local}\norigem: texto\n---\n\n${texto}\n`, "utf8");
	const manifesto = { versao: 1, arquivo: ARQUIVO, hash: "h-teste", tamanho: 1, tipo: "pdf", extraidoEm: "2026-10-21T00:00:00.000Z", custo: 0, avisos: [], trechos: TRECHOS.map(([local, nome]) => ({ local, nome, origem: "texto" })) };
	await writeFile(join(pasta, "manifesto.json"), JSON.stringify(manifesto), "utf8");

	// O mapa aprovado, com as referências.
	const localDe = new Map(TRECHOS.map(([local, nome]) => [nome, local]));
	const mapa: MapaConteudo = {
		...mapaVazio(),
		situacao: "aprovado",
		aprovadoEm: "2026-10-21T00:00:00.000Z",
		conceitos: CONCEITOS.map((conceito) => ({
			id: conceito.id,
			nome: conceito.nome,
			descricao: conceito.descricao,
			prioridade: conceito.prioridade,
			origem: "material" as const,
			criadoEm: "2026-10-21T00:00:00.000Z",
			referencias: conceito.trechos.map((trecho) => ({ arquivo: ARQUIVO, local: localDe.get(trecho)!, trecho })),
		})),
	};
	await gravarMapa(dados, materia, mapa);

	// O curso até a etapa Mapa, pela lib.
	const curso = (await comecarCurso(dados, materia, { nome: "P1: regressão", prazo: null, horasPorSemana: 4 })).id;
	await confirmarNoDisco(dados, materia, curso, "materiais", { arquivos: await materiaisProntos(dados, materia) });
	await confirmarNoDisco(dados, materia, curso, "objetivo", { escopo: "so_material", tipo: "misto", motivo: "Passar na P1 entendendo de verdade." });
	await confirmarNoDisco(dados, materia, curso, "mapa", { conceitos: CONCEITOS.map((conceito) => conceito.id) });

	// A extensão pelo carregador do pi, num barramento próprio.
	const barramento = pi.createEventBus();
	const semGlobais = join(dados, ".pi-vazio");
	await mkdir(semGlobais, { recursive: true });
	const carregadas = await pi.discoverAndLoadExtensions([join(raiz, "profiles", "estudos", "extensions", "cursos.ts")], dados, semGlobais, barramento);
	if (carregadas.errors.length) throw new Error(`a extensão não carregou: ${carregadas.errors.map((erro) => erro.error).join("; ")}`);
	const extensao = carregadas.extensions.find((item) => item.resolvedPath.endsWith("cursos.ts"));
	if (!extensao || carregadas.extensions.length !== 1) throw new Error(`esperava só a extensão dos cursos: ${carregadas.extensions.map((item) => item.path).join(", ")}`);

	const registroReal = new pi.ModelRegistry(await criarRegistroModelos());
	const registro = new Proxy(registroReal, {
		get(alvo, nome, receptor) {
			if (nome !== "complete") {
				const valor = Reflect.get(alvo, nome, receptor);
				return typeof valor === "function" ? valor.bind(alvo) : valor;
			}
			return async (...argumentos: Parameters<typeof registroReal.complete>) => {
				const inicio = Date.now();
				const resposta = await alvo.complete(...argumentos);
				console.log(
					`Chamada: ${resposta.provider}/${resposta.model}, parada ${resposta.stopReason}${resposta.errorMessage ? ` (${resposta.errorMessage})` : ""}, ${resposta.usage.input + resposta.usage.cacheRead + resposta.usage.cacheWrite} tokens de entrada, ${resposta.usage.output} de saída, US$ ${resposta.usage.cost.total.toFixed(5)}, ${((Date.now() - inicio) / 1000).toFixed(1)} s`,
				);
				return resposta;
			};
		},
	});

	const mostrados: Array<{ acao: string; dados: Record<string, unknown> }> = [];
	barramento.on("interface:mostrar", (mensagem) => mostrados.push(mensagem as { acao: string; dados: Record<string, unknown> }));
	const ctx = { cwd: dados, sessionManager: { getSessionId: () => "testar-diagnostico", getBranch: () => [] }, modelRegistry: registro };
	for (const tratador of extensao.handlers.get("session_start") ?? []) await tratador({ type: "session_start" }, ctx as never);

	const acao = (nome: string, extra: Record<string, unknown>) => barramento.emit("interface:acao", { painel: "cursos", acao: nome, dados: { materia, curso, ...extra } });
	const esperar = async (condicao: () => boolean | Promise<boolean>, minutos = 8) => {
		const inicio = Date.now();
		while (!(await condicao())) {
			if (Date.now() - inicio > minutos * 60_000) throw new Error("demorou demais");
			await new Promise((resolver) => setTimeout(resolver, 200));
		}
	};
	const doPedido = (pedido: string) => mostrados.find((mensagem) => mensagem.dados.pedido === pedido);
	const erros = () => mostrados.filter((mensagem) => mensagem.acao === "erro");

	acao("autoavaliar", { pedido: "auto", niveis: NIVEIS });
	await esperar(() => doPedido("auto") !== undefined);
	if (doPedido("auto")!.acao === "erro") throw new Error(`autoavaliar: ${JSON.stringify(doPedido("auto")!.dados)}`);

	console.log("\n=== Gerando as questões");
	const inicio = Date.now();
	acao("gerar_diagnostico", { pedido: "gerar" });
	await esperar(() => doPedido("gerar") !== undefined);
	console.log(`Tempo: ${((Date.now() - inicio) / 1000).toFixed(1)} s.`);
	if (doPedido("gerar")!.acao === "erro") throw new Error(`gerar_diagnostico: ${String(doPedido("gerar")!.dados.mensagem)}`);
	const naTela = (doPedido("gerar")!.dados as unknown as MensagemCurso).curso.diagnosticoEmAndamento!;
	console.log(`Na tela: ${naTela.questoes.length} questões; gabarito escondido: ${!JSON.stringify(naTela).includes('"correta"') && !JSON.stringify(naTela).includes('"confusao"')}`);

	const gravado = (await lerCurso(dados, materia, curso)).diagnosticoEmAndamento!;
	const nomeDe = new Map(CONCEITOS.map((conceito) => [conceito.id, conceito.nome]));
	console.log(`Modelo ${gravado.modelo}, custo da geração US$ ${gravado.custo?.toFixed(5)}.`);
	for (const questao of gravado.questoes) {
		console.log(`\n--- ${questao.id} (${questao.tipo}; ${questao.conceitos.map((id) => nomeDe.get(id) ?? id).join(", ")})`);
		console.log(questao.enunciado);
		if (questao.tipo === "alternativa") {
			questao.alternativas.forEach((alternativa, indice) =>
				console.log(`  ${String.fromCharCode(97 + indice)}) ${alternativa.texto}${alternativa.correta ? "   [CORRETA]" : `   [confusão: ${alternativa.confusao}]`}`),
			);
			console.log(`  Explicação: ${questao.explicacao}`);
		} else {
			for (const item of questao.rubrica) console.log(`  [${item.pontos}] ${item.criterio}: ${item.descricao}`);
			console.log(`  Resposta-modelo: ${questao.respostaModelo}`);
		}
	}

	const dissertativa = gravado.questoes.find((questao): questao is QuestaoDissertativa => questao.tipo === "dissertativa");
	if (!dissertativa) throw new Error("nenhuma dissertativa gerada");
	console.log(`\n=== Corrigindo ${dissertativa.id} com a resposta mediana:\n${RESPOSTA_MEDIANA}`);
	const errosAntes = erros().length;
	acao("responder", { pedido: "resp", questao: dissertativa.id, confianca: 2, texto: RESPOSTA_MEDIANA, tempoMs: 180_000 });
	await esperar(() => doPedido("resp") !== undefined);
	if (doPedido("resp")!.acao === "erro") throw new Error(`responder: ${String(doPedido("resp")!.dados.mensagem)}`);
	await esperar(async () => erros().length > errosAntes || ((await lerCurso(dados, materia, curso)).diagnosticoEmAndamento!.respostas[dissertativa.id] as RespostaDissertativa).correcao !== undefined);
	if (erros().length > errosAntes) throw new Error(`correção: ${String(erros().at(-1)!.dados.mensagem)}`);
	const correcao = ((await lerCurso(dados, materia, curso)).diagnosticoEmAndamento!.respostas[dissertativa.id] as RespostaDissertativa).correcao!;
	for (const item of correcao.criterios) {
		console.log(`- ${item.criterio}: ${item.pontos}/${item.max} — ${item.justificativa}`);
		for (const trecho of item.trechos) console.log(`    "${trecho}"`);
	}
	console.log(`Total ${correcao.total}/${correcao.max}; modelo ${correcao.modelo}; custo US$ ${correcao.custo.toFixed(5)}.`);
	console.log(`\nCusto total: US$ ${((gravado.custo ?? 0) + correcao.custo).toFixed(5)}.`);

	for (const tratador of extensao.handlers.get("session_shutdown") ?? []) await tratador({ type: "session_shutdown", reason: "quit" }, ctx as never);

	const daMateria = (await lerEventos(eventosMateria(dados, materia))).eventos.filter((evento) => evento.verbo === "gerou_diagnostico");
	const doAprendiz = (await lerEventos(eventosAprendiz(dados))).eventos;
	console.log(`\n=== Eventos: gerou_diagnostico ${JSON.stringify(daMateria.map(({ resultado, contexto }) => ({ resultado, contexto })))}`);
	console.log(`aprendiz: ${doAprendiz.map((evento) => evento.verbo).join(", ")}`);
	const dis = doAprendiz.find((evento) => evento.verbo === "respondeu_dissertativa");
	console.log(`respondeu_dissertativa contexto: ${JSON.stringify(dis?.contexto)}`);
} catch (erro) {
	falhou = true;
	console.log(`FALHOU: ${(erro as Error).message}`);
} finally {
	await rm(dados, { recursive: true, force: true });
}
console.log(falhou ? "\nFALHOU" : "\nOK");
process.exit(falhou ? 1 : 0);
