// Verificação do mapa de conteúdo (item 4.4) com uma chamada real e barata ao
// modelo do mapeador (profiles/estudos/prompts/mapeador.md). Monta numa pasta
// temporária (fora do Drive) uma matéria com o .extraido de mentira de uma
// aula curta sobre regressão linear (4 trechos de texto), carrega a extensão
// profiles/estudos/extensions/mapa.ts pelo carregador de extensões do pi (o
// mesmo das sessões), entrega a ela o registro de modelos de verdade e avisa
// "materiais:pronto". Mostra o JSON que o modelo devolveu, o mapa resultante
// e o custo. A pasta temporária é apagada no fim.
//
// Uso, na raiz do repositório (a chave vem do processo ou, se faltar, das
// variáveis de usuário do Windows; o script nunca a imprime):
//   node_modules\.bin\tsx scripts\testar-mapa.ts
//
// Sai com código 1 se o mapeamento falhar.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { carregarChaves } from "../apps/server/src/chaves.ts";
import { criarRegistroModelos } from "../packages/core/src/modelos.ts";
import { lerEventos } from "../profiles/estudos/lib/eventos.ts";
import { type EstadoMapa, lerMapa, pastaExtraidoArquivo } from "../profiles/estudos/lib/mapa.ts";
import { criarMateria, eventosMateria } from "../profiles/estudos/lib/materias.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// O pi do packages/core (a raiz do monorepo não tem node_modules dele).
const pi = (await import(pathToFileURL(join(raiz, "packages", "core", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js")).href)) as typeof import("@earendil-works/pi-coding-agent");

const origem = carregarChaves(["OPENROUTER_API_KEY"]);
console.log(`OPENROUTER_API_KEY: ${origem.OPENROUTER_API_KEY}`);

const TRECHOS: Array<[local: string, nome: string, texto: string]> = [
	[
		"página 1",
		"pagina-001",
		"# Aula 4: Regressão linear\n\nAgenda\n- Motivação\n- O modelo linear\n- Mínimos quadrados\n- Avaliação do ajuste\n- Exercícios",
	],
	[
		"página 2",
		"pagina-002",
		"## O modelo linear\n\nNa regressão linear simples, supomos que a resposta y depende de uma variável x por uma reta: y = β0 + β1·x + ε, em que β0 é o intercepto, β1 é a inclinação e ε é o erro aleatório, com média zero. O objetivo é estimar β0 e β1 a partir de n pares (xi, yi).\n\nO resíduo da observação i é ei = yi − ŷi, a diferença entre o valor observado e o valor previsto pela reta ajustada.",
	],
	[
		"página 3",
		"pagina-003",
		"## Mínimos quadrados\n\nO método dos mínimos quadrados escolhe os coeficientes que minimizam a soma dos quadrados dos resíduos, SQR = Σ (yi − ŷi)². As soluções são β1 = Σ(xi − x̄)(yi − ȳ) / Σ(xi − x̄)² e β0 = ȳ − β1·x̄.\n\nO erro quadrático médio (MSE) é a média dos quadrados dos resíduos, MSE = SQR / n, e mede o quanto a reta erra em média.",
	],
	[
		"página 4",
		"pagina-004",
		"## Avaliação do ajuste\n\nO coeficiente de determinação R² = 1 − SQR/SQT, em que SQT = Σ (yi − ȳ)², é a fração da variação de y explicada pelo modelo. R² vai de 0 a 1.\n\nExemplo: com horas de estudo (x) e nota (y), obtivemos ŷ = 2,1 + 0,8x e R² = 0,72.\n\nExercícios: 1) Calcule β0 e β1 para os dados da tabela. 2) Interprete o R² obtido.",
	],
];

const dados = await mkdtemp(join(tmpdir(), "estudos-testar-mapa-"));
let falhou = false;
try {
	const materia = (await criarMateria(dados, { nome: "Estatística" })).id;
	const arquivo = "aula-04.pdf";
	const pasta = pastaExtraidoArquivo(dados, materia, arquivo);
	await mkdir(pasta, { recursive: true });
	for (const [local, nome, texto] of TRECHOS) await writeFile(join(pasta, `${nome}.md`), `---\narquivo: ${arquivo}\nlocal: ${local}\norigem: texto\n---\n\n${texto}\n`, "utf8");
	await writeFile(
		join(pasta, "manifesto.json"),
		JSON.stringify({ versao: 1, arquivo, hash: "hash-de-teste", tamanho: 1, tipo: "pdf", extraidoEm: new Date().toISOString(), custo: 0, avisos: [], trechos: TRECHOS.map(([local, nome]) => ({ local, nome, origem: "texto" })) }),
		"utf8",
	);

	// A extensão pelo carregador do pi, num barramento próprio.
	const barramento = pi.createEventBus();
	// discoverAndLoadExtensions (loadExtensions não é exportado); agentDir vazio, para não carregar as extensões globais.
	const semGlobais = join(dados, ".pi-vazio");
	await mkdir(semGlobais, { recursive: true });
	const carregadas = await pi.discoverAndLoadExtensions([join(raiz, "profiles", "estudos", "extensions", "mapa.ts")], dados, semGlobais, barramento);
	if (carregadas.errors.length) throw new Error(`a extensão não carregou: ${carregadas.errors.map((erro) => erro.error).join("; ")}`);
	const extensao = carregadas.extensions.find((item) => item.resolvedPath.endsWith("mapa.ts"));
	if (!extensao || carregadas.extensions.length !== 1) throw new Error(`esperava só a extensão do mapa: ${carregadas.extensions.map((item) => item.path).join(", ")}`);
	console.log(`Extensão carregada: ferramentas ${[...extensao.tools.keys()].join(", ")}; eventos ${[...extensao.handlers.keys()].join(", ")}`);

	// O registro de verdade, com as respostas guardadas para mostrar o JSON.
	const registroReal = new pi.ModelRegistry(await criarRegistroModelos());
	const respostas: string[] = [];
	const registro = new Proxy(registroReal, {
		get(alvo, nome, receptor) {
			if (nome !== "complete") {
				const valor = Reflect.get(alvo, nome, receptor);
				return typeof valor === "function" ? valor.bind(alvo) : valor;
			}
			return async (...argumentos: Parameters<typeof registroReal.complete>) => {
				const resposta = await alvo.complete(...argumentos);
				respostas.push(resposta.content.map((parte) => (parte.type === "text" ? parte.text : "")).join(""));
				console.log(`Chamada: ${resposta.provider}/${resposta.model}, parada ${resposta.stopReason}, ${resposta.usage.input + resposta.usage.cacheRead + resposta.usage.cacheWrite} tokens de entrada (${resposta.usage.cacheRead + resposta.usage.cacheWrite} pelo cache), ${resposta.usage.output} de saída, US$ ${resposta.usage.cost.total.toFixed(5)}`);
				return resposta;
			};
		},
	});

	const mostrados: Array<{ acao: string; dados: unknown }> = [];
	barramento.on("interface:mostrar", (mensagem) => mostrados.push(mensagem as { acao: string; dados: unknown }));
	const ctx = { cwd: dados, sessionManager: { getSessionId: () => "testar-mapa", getBranch: () => [] }, modelRegistry: registro };
	for (const tratador of extensao.handlers.get("session_start") ?? []) await tratador({ type: "session_start" }, ctx as never);

	// O estado antes: o arquivo pendente com o custo estimado.
	barramento.emit("interface:acao", { painel: "mapa", acao: "abrir", dados: { materia } });
	const inicio = Date.now();
	const esperar = async (condicao: () => boolean, limite: number) => {
		while (!condicao()) {
			if (Date.now() - inicio > limite) throw new Error("demorou demais");
			await new Promise((resolver) => setTimeout(resolver, 100));
		}
	};
	await esperar(() => mostrados.some((mensagem) => mensagem.acao === "mapa"), 10_000);
	const antes = mostrados.find((mensagem) => mensagem.acao === "mapa")!.dados as EstadoMapa;
	console.log(`Pendentes antes: ${JSON.stringify(antes.pendentes)}`);

	barramento.emit("materiais:pronto", { caminho: `materias/${materia}/materiais/${arquivo}`, pasta: `materias/${materia}/materiais`, nome: arquivo, tipo: "pdf", trechos: TRECHOS.length, custo: 0, novo: true });
	const terminou = () => {
		if (mostrados.some((mensagem) => mensagem.acao === "erro")) return true;
		const ultimo = mostrados.filter((mensagem) => mensagem.acao === "mapa").at(-1)?.dados as EstadoMapa | undefined;
		return respostas.length > 0 && ultimo !== undefined && ultimo.andamento === null && ultimo.fila.length === 0;
	};
	await esperar(terminou, 6 * 60_000);
	for (const tratador of extensao.handlers.get("session_shutdown") ?? []) await tratador({ type: "session_shutdown", reason: "quit" }, ctx as never);

	const erros = mostrados.filter((mensagem) => mensagem.acao === "erro");
	if (erros.length) {
		falhou = true;
		console.log(`ERRO: ${JSON.stringify(erros)}`);
	}
	console.log("\n=== JSON devolvido pelo modelo");
	for (const resposta of respostas) console.log(resposta);
	const mapa = await lerMapa(dados, materia);
	console.log("\n=== Mapa resultante");
	mapa.conceitos.forEach((conceito, indice) =>
		console.log(`${String(indice + 1).padStart(2, "0")}. ${conceito.nome} — ${conceito.descricao} (${conceito.referencias.map((referencia) => `${referencia.local} → ${referencia.trecho}`).join(", ")})`),
	);
	console.log(`arquivos: ${JSON.stringify(mapa.arquivos)}`);
	const eventos = (await lerEventos(eventosMateria(dados, materia))).eventos.filter((evento) => evento.verbo === "mapeou_material");
	console.log(`\n=== Evento: ${JSON.stringify(eventos.map(({ resultado, contexto }) => ({ resultado, contexto })))}`);
	if (eventos.length !== 1 || mapa.conceitos.length === 0) falhou = true;
	console.log(`\nArquivo do mapa: ${(await readFile(join(dados, "materias", materia, "mapa-conteudo.json"), "utf8")).length} caracteres.`);
} catch (erro) {
	falhou = true;
	console.log(`FALHOU: ${(erro as Error).message}`);
} finally {
	await rm(dados, { recursive: true, force: true });
}
console.log(falhou ? "\nFALHOU" : "\nOK");
process.exit(falhou ? 1 : 0);
