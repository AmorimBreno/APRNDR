// Verificação do mapa a partir do tema (item 5, parte A) com uma chamada real
// e barata ao modelo de profiles/estudos/prompts/mapa-do-tema.md. Monta numa
// pasta temporária (fora do Drive) uma matéria sem material, carrega a
// extensão profiles/estudos/extensions/mapa.ts pelo carregador de extensões
// do pi (o mesmo das sessões), entrega a ela o registro de modelos de verdade
// e manda a ação do_tema com o tema "Probabilidade básica". Mostra o JSON que
// o modelo devolveu, os conceitos do mapa, o custo e o evento. A pasta
// temporária é apagada no fim.
//
// Uso, na raiz do repositório (a chave vem do processo ou, se faltar, das
// variáveis de usuário do Windows; o script nunca a imprime):
//   node_modules\.bin\tsx scripts\testar-mapa-tema.ts
//
// Sai com código 1 se a montagem falhar.

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { carregarChaves } from "../apps/server/src/chaves.ts";
import { criarRegistroModelos } from "../packages/core/src/modelos.ts";
import { lerEventos } from "../profiles/estudos/lib/eventos.ts";
import { type EstadoMapa, lerMapa } from "../profiles/estudos/lib/mapa.ts";
import { criarMateria, eventosMateria } from "../profiles/estudos/lib/materias.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// O pi do packages/core (a raiz do monorepo não tem node_modules dele).
const pi = (await import(pathToFileURL(join(raiz, "packages", "core", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js")).href)) as typeof import("@earendil-works/pi-coding-agent");

const origem = carregarChaves(["OPENROUTER_API_KEY"]);
console.log(`OPENROUTER_API_KEY: ${origem.OPENROUTER_API_KEY}`);

const TEMA = "Probabilidade básica";

const dados = await mkdtemp(join(tmpdir(), "estudos-testar-mapa-tema-"));
let falhou = false;
try {
	const materia = (await criarMateria(dados, { nome: "Estatística" })).id;

	// A extensão pelo carregador do pi, num barramento próprio.
	const barramento = pi.createEventBus();
	// discoverAndLoadExtensions (loadExtensions não é exportado); agentDir vazio, para não carregar as extensões globais.
	const semGlobais = join(dados, ".pi-vazio");
	await mkdir(semGlobais, { recursive: true });
	const carregadas = await pi.discoverAndLoadExtensions([join(raiz, "profiles", "estudos", "extensions", "mapa.ts")], dados, semGlobais, barramento);
	if (carregadas.errors.length) throw new Error(`a extensão não carregou: ${carregadas.errors.map((erro) => erro.error).join("; ")}`);
	const extensao = carregadas.extensions.find((item) => item.resolvedPath.endsWith("mapa.ts"));
	if (!extensao || carregadas.extensions.length !== 1) throw new Error(`esperava só a extensão do mapa: ${carregadas.extensions.map((item) => item.path).join(", ")}`);

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
				console.log(`Chamada: ${resposta.provider}/${resposta.model}, parada ${resposta.stopReason}${resposta.errorMessage ? ` (${resposta.errorMessage})` : ""}, ${resposta.usage.input + resposta.usage.cacheRead + resposta.usage.cacheWrite} tokens de entrada, ${resposta.usage.output} de saída, US$ ${resposta.usage.cost.total.toFixed(5)}`);
				return resposta;
			};
		},
	});

	const mostrados: Array<{ acao: string; dados: unknown }> = [];
	barramento.on("interface:mostrar", (mensagem) => mostrados.push(mensagem as { acao: string; dados: unknown }));
	const ctx = { cwd: dados, sessionManager: { getSessionId: () => "testar-mapa-tema", getBranch: () => [] }, modelRegistry: registro };
	for (const tratador of extensao.handlers.get("session_start") ?? []) await tratador({ type: "session_start" }, ctx as never);

	const inicio = Date.now();
	barramento.emit("interface:acao", { painel: "mapa", acao: "do_tema", dados: { materia, pedido: "teste", tema: TEMA, tipo: "misto", motivo: "Entender a base para a P1." } });
	const terminou = () => mostrados.some((mensagem) => mensagem.acao === "erro" || (mensagem.acao === "mapa" && (mensagem.dados as EstadoMapa).pedido === "teste"));
	while (!terminou()) {
		if (Date.now() - inicio > 6 * 60_000) throw new Error("demorou demais");
		await new Promise((resolver) => setTimeout(resolver, 100));
	}
	console.log(`Tempo: ${((Date.now() - inicio) / 1000).toFixed(1)} s.`);
	const montando = mostrados.filter((mensagem) => mensagem.acao === "mapa").map((mensagem) => (mensagem.dados as EstadoMapa).montandoTema === true);
	console.log(`montandoTema nos estados mandados: ${JSON.stringify(montando)}`);
	for (const tratador of extensao.handlers.get("session_shutdown") ?? []) await tratador({ type: "session_shutdown", reason: "quit" }, ctx as never);

	const erros = mostrados.filter((mensagem) => mensagem.acao === "erro");
	if (erros.length) {
		falhou = true;
		console.log(`ERRO: ${JSON.stringify(erros)}`);
	}
	console.log("\n=== JSON devolvido pelo modelo");
	for (const resposta of respostas) console.log(resposta);
	const mapa = await lerMapa(dados, materia);
	console.log(`\n=== Mapa resultante (${mapa.situacao})`);
	mapa.conceitos.forEach((conceito, indice) => console.log(`${String(indice + 1).padStart(2, "0")}. ${conceito.nome} — ${conceito.descricao} [${conceito.origem}]`));
	const eventos = (await lerEventos(eventosMateria(dados, materia))).eventos.filter((evento) => evento.verbo === "montou_mapa_do_tema");
	console.log(`\n=== Evento: ${JSON.stringify(eventos.map(({ objeto, resultado, contexto }) => ({ objeto, resultado, contexto })))}`);
	if (eventos.length !== 1 || mapa.conceitos.length === 0) falhou = true;
} catch (erro) {
	falhou = true;
	console.log(`FALHOU: ${(erro as Error).message}`);
} finally {
	await rm(dados, { recursive: true, force: true });
}
console.log(falhou ? "\nFALHOU" : "\nOK");
process.exit(falhou ? 1 : 0);
