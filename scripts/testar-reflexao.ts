// Verificação do agente de reflexão do aprendiz (item 9, parte B) com UMA chamada real ao modelo de
// profiles/estudos/prompts/reflexao.md. Monta numa pasta temporária (fora do Drive; os dados do Breno nunca são
// usados) uma pasta de dados com uma matéria de teste, um mapa pequeno e eventos SINTÉTICOS em 3 sessões, com
// padrões plantados: um erro repetido (com a mesma confusão) em tokenização em 2 sessões, uma autoavaliação alta
// de similaridade do cosseno contrariada pelos erros, e sinais ruidosos isolados. Carrega a extensão
// profiles/estudos/extensions/aprendiz.ts pelo carregador de extensões do pi (o mesmo das sessões), entrega a ela
// o registro de modelos de verdade, pede uma reflexão pelo botão e mostra o resumo (lidos, propostas, aceitas,
// descartadas com os motivos, custo), o JSON que o modelo devolveu e as hipóteses criadas. O cache dos
// indicadores vai para uma pasta temporária também. A pasta temporária é apagada no fim.
//
// Uso, na raiz do repositório (a chave vem do processo ou, se faltar, das variáveis de usuário do Windows; o
// script nunca a imprime):
//   node_modules\.bin\tsx scripts\testar-reflexao.ts
//
// Sai com código 1 se a reflexão falhar.

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { carregarChaves } from "../apps/server/src/chaves.ts";
import { criarRegistroModelos } from "../packages/core/src/modelos.ts";
import { acrescentarEvento, type Evento, lerEventos, novoIdEvento } from "../profiles/estudos/lib/eventos.ts";
import { lerHipoteses, type ResumoDaReflexao } from "../profiles/estudos/lib/hipoteses.ts";
import { gravarMapa, mapaVazio } from "../profiles/estudos/lib/mapa.ts";
import { criarMateria, eventosAprendiz } from "../profiles/estudos/lib/materias.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// O pi do packages/core (a raiz do monorepo não tem node_modules dele).
const pi = (await import(pathToFileURL(join(raiz, "packages", "core", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js")).href)) as typeof import("@earendil-works/pi-coding-agent");

const origem = carregarChaves(["OPENROUTER_API_KEY"]);
console.log(`OPENROUTER_API_KEY: ${origem.OPENROUTER_API_KEY}`);

const CONCEITOS: Array<[id: string, nome: string, descricao: string]> = [
	["c-token", "Tokenização", "Dividir o texto em unidades (tokens) antes de processá-lo."],
	["c-stop", "Stopwords", "Palavras muito comuns que costumam ser removidas."],
	["c-tfidf", "TF-IDF", "Peso de um termo: frequência no documento vezes a raridade na coleção."],
	["c-cos", "Similaridade do cosseno", "Comparar dois vetores de pesos pelo ângulo entre eles."],
	["c-stem", "Stemming", "Reduzir palavras à raiz."],
];

const dados = await mkdtemp(join(tmpdir(), "estudos-testar-reflexao-"));
const cache = await mkdtemp(join(tmpdir(), "estudos-testar-reflexao-cache-"));
let falhou = false;
try {
	const materia = (await criarMateria(dados, { nome: "Processamento de texto" })).id;
	await gravarMapa(dados, materia, {
		...mapaVazio(),
		situacao: "aprovado",
		aprovadoEm: "2026-10-01T00:00:00.000Z",
		conceitos: CONCEITOS.map(([id, nome, descricao]) => ({ id, nome, descricao, referencias: [], prioridade: "normal" as const, origem: "material" as const, criadoEm: "2026-10-01T00:00:00.000Z" })),
	});

	// --- Os eventos sintéticos: 3 sessões, um por vez, com o tempo andando. ---
	const sessoes = ["sessao-sintetica-A", "sessao-sintetica-B", "sessao-sintetica-C"] as const;
	const dia = { A: Date.UTC(2026, 10, 3, 14), B: Date.UTC(2026, 10, 6, 19), C: Date.UTC(2026, 10, 9, 10) };
	const relogio = { A: dia.A, B: dia.B, C: dia.C };
	const objeto = (conceito: string, extra: Record<string, unknown> = {}) => ({ materia, curso: "curso-teste", modulo: "m1", conceitos: [conceito], ...extra });
	const gravar = async (sessao: "A" | "B" | "C", verbo: Evento["verbo"], conceito: string, resultado: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
		relogio[sessao] += 90_000;
		await acrescentarEvento(eventosAprendiz(dados), {
			id: novoIdEvento(relogio[sessao]),
			ts: new Date(relogio[sessao]).toISOString(),
			sessao: sessoes[{ A: 0, B: 1, C: 2 }[sessao]],
			verbo,
			objeto: objeto(conceito, extra),
			resultado,
		});
	};
	const CONFUSAO = "Achar que remover a pontuação é o mesmo que remover o ruído do texto";
	let q = 0;
	const questao = () => ({ questao: `q${++q}` });

	// Sessão A (antes de tudo, o aluno se autoavalia)
	await gravar("A", "autoavaliou_conceito", "c-cos", { nivel: 3 });
	await gravar("A", "autoavaliou_conceito", "c-tfidf", { nivel: 1 });
	await gravar("A", "respondeu_questao", "c-token", { correta: false, escolha: 1, confianca: 4, tentativa: 1, confusao: CONFUSAO, tempoMs: 21_000 }, questao());
	await gravar("A", "respondeu_questao", "c-token", { correta: false, escolha: 1, confianca: 3, tentativa: 1, confusao: CONFUSAO, tempoMs: 18_000 }, questao());
	await gravar("A", "respondeu_questao", "c-stop", { correta: true, escolha: 0, confianca: 3, tentativa: 1, tempoMs: 9_000 }, questao());
	await gravar("A", "respondeu_questao", "c-tfidf", { correta: true, escolha: 2, confianca: 2, tentativa: 1, tempoMs: 30_000 }, questao());
	await gravar("A", "respondeu_questao", "c-cos", { correta: false, escolha: 0, confianca: 4, tentativa: 1, confusao: "Achar que o cosseno mede a distância entre os vetores", tempoMs: 25_000 }, questao());
	await gravar("A", "avaliou_bloco", "c-tfidf", { avaliacao: "ruim", motivos: ["longo_demais"], texto: "Esse bloco foi longo demais." }, { bloco: "l1-b2", licao: "l1" });
	// Sessão B
	await gravar("B", "respondeu_questao", "c-token", { correta: true, escolha: 0, confianca: 3, tentativa: 1, tempoMs: 12_000 }, questao());
	await gravar("B", "respondeu_questao", "c-cos", { correta: false, escolha: 2, confianca: 4, tentativa: 1, confusao: "Achar que o cosseno mede a distância entre os vetores", tempoMs: 22_000 }, questao());
	await gravar("B", "respondeu_verificacao", "c-cos", { avaliacao: "errada", confianca: 4, texto: "O cosseno é a distância entre os dois vetores, quanto menor, mais parecidos.", retorno: "O cosseno mede o ângulo, não a distância." }, questao());
	await gravar("B", "respondeu_questao", "c-tfidf", { correta: true, escolha: 1, confianca: 3, tentativa: 1, tempoMs: 20_000 }, questao());
	await gravar("B", "respondeu_questao", "c-stop", { correta: true, escolha: 0, confianca: 4, tentativa: 1, tempoMs: 7_000 }, questao());
	await gravar("B", "respondeu_questao", "c-stem", { correta: false, escolha: 3, confianca: 2, tentativa: 1, confusao: "Confundir stemming com lematização", tempoMs: 40_000 }, questao());
	await gravar("B", "pediu_explicacao", "c-stem", { tipo: "nao_sei", trecho: "lematização" }, { bloco: "l2-b1", licao: "l2" });
	// Sessão C
	await gravar("C", "respondeu_questao", "c-token", { correta: false, escolha: 1, confianca: 4, tentativa: 1, confusao: CONFUSAO, tempoMs: 16_000 }, questao());
	await gravar("C", "respondeu_questao", "c-cos", { correta: false, escolha: 0, confianca: 4, tentativa: 1, confusao: "Achar que o cosseno mede a distância entre os vetores", tempoMs: 19_000 }, questao());
	await gravar("C", "respondeu_questao", "c-tfidf", { correta: true, escolha: 2, confianca: 3, tentativa: 1, tempoMs: 15_000 }, questao());
	await gravar("C", "respondeu_questao", "c-stop", { correta: true, escolha: 1, confianca: 4, tentativa: 1, tempoMs: 6_000 }, questao());
	await gravar("C", "respondeu_dissertativa", "c-tfidf", { total: 3, max: 4, tentativa: 1, confianca: 3 }, questao());
	await gravar("C", "avaliou_licao", "c-tfidf", { notas: { entendimento: 4, clareza: 4, exemplos: 3, questoes: 4, ritmo: 3 }, texto: "Gostei, mas gostaria de mais exemplos numéricos no TF-IDF." }, { licao: "l1" });
	await gravar("C", "guardou_termo", "c-token", { termo: "n-grama" }, { bloco: "l1-b3", licao: "l1" });
	await gravar("C", "nao_sabia_questao", "c-stem", { tipo: "alternativa", tentativas: 0 }, questao());
	console.log(`Eventos sintéticos: ${(await lerEventos(eventosAprendiz(dados))).eventos.length} em ${sessoes.length} sessões, matéria "${materia}".`);

	// --- A extensão pelo carregador do pi, num barramento próprio. ---
	process.env.LOCALAPPDATA = cache; // o cache dos indicadores não vai para o do Breno
	const barramento = pi.createEventBus();
	const semGlobais = join(dados, ".pi-vazio");
	await mkdir(semGlobais, { recursive: true });
	const carregadas = await pi.discoverAndLoadExtensions([join(raiz, "profiles", "estudos", "extensions", "aprendiz.ts")], dados, semGlobais, barramento);
	if (carregadas.errors.length) throw new Error(`a extensão não carregou: ${carregadas.errors.map((erro) => erro.error).join("; ")}`);
	const extensao = carregadas.extensions.find((item) => item.resolvedPath.endsWith("aprendiz.ts"));
	if (!extensao || carregadas.extensions.length !== 1) throw new Error(`esperava só a extensão do aprendiz: ${carregadas.extensions.map((item) => item.path).join(", ")}`);
	console.log(`Extensão carregada: ferramentas ${[...extensao.tools.keys()].join(", ")}; eventos ${[...extensao.handlers.keys()].join(", ")}`);

	// O registro de verdade, guardando a resposta e o tamanho da entrada para mostrar.
	const registroReal = new pi.ModelRegistry(await criarRegistroModelos());
	const respostas: string[] = [];
	let entradaChars = 0;
	const registro = new Proxy(registroReal, {
		get(alvo, nome, receptor) {
			if (nome !== "complete") {
				const valor = Reflect.get(alvo, nome, receptor);
				return typeof valor === "function" ? valor.bind(alvo) : valor;
			}
			return async (...argumentos: Parameters<typeof registroReal.complete>) => {
				entradaChars = JSON.stringify(argumentos[1].messages).length;
				const resposta = await alvo.complete(...argumentos);
				respostas.push(resposta.content.map((parte) => (parte.type === "text" ? parte.text : "")).join(""));
				console.log(`Chamada: ${resposta.provider}/${resposta.model}, parada ${resposta.stopReason}, ${resposta.usage.input + resposta.usage.cacheRead + resposta.usage.cacheWrite} tokens de entrada, ${resposta.usage.output} de saída, US$ ${resposta.usage.cost.total.toFixed(5)}`);
				return resposta;
			};
		},
	});

	const mostrados: Array<{ acao: string; dados: Record<string, unknown> }> = [];
	barramento.on("interface:mostrar", (mensagem) => mostrados.push(mensagem as { acao: string; dados: Record<string, unknown> }));
	const ctx = { cwd: dados, sessionManager: { getSessionId: () => "testar-reflexao", getBranch: () => [] }, modelRegistry: registro };
	for (const tratador of extensao.handlers.get("session_start") ?? []) await tratador({ type: "session_start" }, ctx as never);

	barramento.emit("interface:acao", { painel: "aprendiz", acao: "refletir", dados: { pedido: "teste" } });
	const inicio = Date.now();
	while (!mostrados.some((mensagem) => mensagem.acao === "refletiu" || mensagem.acao === "erro")) {
		if (Date.now() - inicio > 6 * 60_000) throw new Error("demorou demais");
		await new Promise((resolver) => setTimeout(resolver, 200));
	}
	for (const tratador of extensao.handlers.get("session_shutdown") ?? []) await tratador({ type: "session_shutdown", reason: "quit" }, ctx as never);

	const erro = mostrados.find((mensagem) => mensagem.acao === "erro");
	if (erro) {
		falhou = true;
		console.log(`ERRO: ${JSON.stringify(erro.dados)}`);
	}
	console.log(`\nTamanho da entrada: ${entradaChars} caracteres.`);
	console.log("\n=== JSON devolvido pelo modelo");
	for (const resposta of respostas) console.log(resposta);
	const resumo = mostrados.find((mensagem) => mensagem.acao === "refletiu")?.dados.resumo as ResumoDaReflexao | undefined;
	if (resumo) {
		console.log("\n=== Resumo da reflexão");
		console.log(`lidos ${resumo.lidos}, propostas ${resumo.propostas}, aceitas ${resumo.aceitas}, custo US$ ${(resumo.custo ?? 0).toFixed(5)}`);
		console.log(`descartadas: ${resumo.descartadas.length ? resumo.descartadas.map((item) => `${item.motivo} x${item.quantas}`).join(", ") : "nenhuma"}`);
	}
	const arquivo = await lerHipoteses(dados);
	console.log("\n=== Hipóteses criadas (status proposta; nada vira aprovada sem o Breno)");
	for (const hipotese of arquivo.hipoteses) console.log(`- [${hipotese.tipo} | ${JSON.stringify(hipotese.escopo)} | confiança ${hipotese.confianca} | ${hipotese.status}] ${hipotese.enunciado}\n    a favor: ${hipotese.aFavor.join(", ")}`);
	if (arquivo.hipoteses.length === 0) console.log("(nenhuma)");
	if (arquivo.mudancas.length) console.log(`Mudanças pendentes: ${JSON.stringify(arquivo.mudancas)}`);
	const verbos = (await lerEventos(eventosAprendiz(dados))).eventos.filter((evento) => ["refletiu", "propos_hipotese", "propos_mudanca_hipotese"].includes(evento.verbo)).map((evento) => evento.verbo);
	console.log(`\nEventos gravados: ${verbos.join(", ") || "nenhum"}`);
	if (!resumo || resumo.lidos === 0) falhou = true;
} catch (erro) {
	falhou = true;
	console.log(`FALHOU: ${(erro as Error).message}`);
} finally {
	await rm(dados, { recursive: true, force: true });
	await rm(cache, { recursive: true, force: true });
}
console.log(falhou ? "\nFALHOU" : "\nOK");
process.exit(falhou ? 1 : 0);
