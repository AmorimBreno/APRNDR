// Verificação do esqueleto do guia de cursos (item 5, parte C) com uma chamada
// real ao modelo de profiles/estudos/prompts/esqueleto.md. Monta numa pasta
// temporária (fora do Drive), pela lib, uma matéria com o mapa aprovado (8
// conceitos de regressão, com prioridades variadas) e um curso até o
// Diagnóstico concluído (escopo livre, tipo misto, prazo daqui a 4 semanas, 4 h
// por semana; o diagnóstico concluído vai direto no curso.json pela lib, com
// níveis e resultados variados). Carrega a extensão
// profiles/estudos/extensions/cursos.ts pelo carregador de extensões do pi (o
// mesmo das sessões), entrega a ela o registro de modelos de verdade e manda,
// pela ponte, gerar_esqueleto. Mostra os módulos (nome, tipo, horas,
// conceitos), o calendário de hoje com os avisos (calcularCalendario) e o
// custo. A pasta temporária é apagada no fim.
//
// Uso, na raiz do repositório (a chave vem do processo ou, se faltar, das
// variáveis de usuário do Windows; o script nunca a imprime):
//   node_modules\.bin\tsx scripts\testar-esqueleto.ts
//
// Sai com código 1 se a geração falhar.

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { carregarChaves } from "../apps/server/src/chaves.ts";
import { criarRegistroModelos } from "../packages/core/src/modelos.ts";
import type { MensagemCurso } from "../profiles/estudos/lib/curso-tipos.ts";
import { comecarCurso, confirmarNoDisco, hojeLocal, lerCurso } from "../profiles/estudos/lib/cursos.ts";
import type { Diagnostico, Questao, Resposta } from "../profiles/estudos/lib/diagnostico.ts";
import { calcularCalendario, NOMES_TIPO_MODULO, somarDias } from "../profiles/estudos/lib/esqueleto.ts";
import { lerEventos } from "../profiles/estudos/lib/eventos.ts";
import { gravarMapa, type MapaConteudo, mapaVazio } from "../profiles/estudos/lib/mapa.ts";
import { criarMateria, eventosMateria } from "../profiles/estudos/lib/materias.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// O pi do packages/core (a raiz do monorepo não tem node_modules dele).
const pi = (await import(pathToFileURL(join(raiz, "packages", "core", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js")).href)) as typeof import("@earendil-works/pi-coding-agent");

const origem = carregarChaves(["OPENROUTER_API_KEY"]);
console.log(`OPENROUTER_API_KEY: ${origem.OPENROUTER_API_KEY}`);

const CONCEITOS: Array<{ id: string; nome: string; descricao: string; prioridade: "alta" | "normal" | "baixa" }> = [
	{ id: "c-reta", nome: "Regressão linear simples", descricao: "Modelar y como uma reta em x mais um erro.", prioridade: "alta" },
	{ id: "c-coef", nome: "Interpretação dos coeficientes", descricao: "O que o intercepto e a inclinação dizem sobre y.", prioridade: "alta" },
	{ id: "c-mq", nome: "Mínimos quadrados", descricao: "Escolher a reta que minimiza a soma dos quadrados dos resíduos.", prioridade: "normal" },
	{ id: "c-res", nome: "Resíduo", descricao: "A diferença entre o valor observado e o previsto pela reta.", prioridade: "normal" },
	{ id: "c-r2", nome: "Coeficiente de determinação (R²)", descricao: "A fração da variabilidade de y explicada pela reta.", prioridade: "alta" },
	{ id: "c-sup", nome: "Suposições do modelo", descricao: "Erros com média zero, variância constante e independentes.", prioridade: "normal" },
	{ id: "c-graf", nome: "Gráfico de resíduos", descricao: "Ler o gráfico dos resíduos contra os previstos para achar funil ou curva.", prioridade: "normal" },
	{ id: "c-prev", nome: "Previsão e extrapolação", descricao: "Usar a reta para prever y e os riscos de prever fora da faixa dos dados.", prioridade: "baixa" },
];

/** O que ele disse (0 nunca vi … 3 sei aplicar) e como foi: certa/errada numa alternativa, ou a nota da dissertativa; sem questão em c-graf. */
const NIVEIS = { "c-reta": 3, "c-coef": 2, "c-mq": 2, "c-res": 1, "c-r2": 0, "c-sup": 1, "c-graf": 0, "c-prev": 3 } as const;
const ALTERNATIVAS: Array<[conceito: string, certa: boolean]> = [
	["c-reta", true],
	["c-coef", false],
	["c-mq", true],
	["c-res", true],
	["c-r2", false],
	["c-sup", false],
];

const MOMENTO = new Date().toISOString();

function diagnosticoConcluido(): Diagnostico {
	const questoes: Questao[] = [];
	const respostas: Record<string, Resposta> = {};
	for (const [indice, [conceito, certa]] of ALTERNATIVAS.entries()) {
		const id = `q${indice + 1}`;
		questoes.push({
			id,
			tipo: "alternativa",
			conceitos: [conceito],
			enunciado: `Questão sobre ${conceito}.`,
			alternativas: [{ texto: "Certa", correta: true }, { texto: "Errada", confusao: "Uma confusão comum." }, { texto: "Outra", confusao: "Outra confusão." }, { texto: "Mais uma", confusao: "Mais uma confusão." }],
			explicacao: "Explicação.",
		});
		respostas[id] = certa
			? { confianca: 3, escolha: 0, correta: true, tempoMs: 40_000, respondidaEm: MOMENTO }
			: { confianca: 3, escolha: 1, correta: false, confusao: "Uma confusão comum.", tempoMs: 40_000, respondidaEm: MOMENTO };
	}
	questoes.push({
		id: "q7",
		tipo: "dissertativa",
		conceitos: ["c-prev"],
		enunciado: "Explique os riscos de prever fora da faixa dos dados.",
		rubrica: [
			{ criterio: "Faixa", descricao: "Diz que a reta só foi ajustada na faixa observada.", pontos: 2 },
			{ criterio: "Risco", descricao: "Diz que fora dela a relação pode mudar.", pontos: 2 },
			{ criterio: "Exemplo", descricao: "Dá um exemplo.", pontos: 1 },
		],
		respostaModelo: "A reta vale na faixa dos dados; fora dela a relação pode não ser linear.",
	});
	respostas.q7 = {
		confianca: 3,
		texto: "A reta só foi ajustada com os x observados; fora disso a relação pode mudar e a previsão erra.",
		tempoMs: 120_000,
		respondidaEm: MOMENTO,
		correcao: {
			criterios: [
				{ criterio: "Faixa", trechos: ["só foi ajustada com os x observados"], pontos: 2, max: 2, justificativa: "Disse." },
				{ criterio: "Risco", trechos: ["fora disso a relação pode mudar"], pontos: 2, max: 2, justificativa: "Disse." },
				{ criterio: "Exemplo", trechos: [], pontos: 0, max: 1, justificativa: "Sem exemplo." },
			],
			total: 4,
			max: 5,
			modelo: "openrouter/openai/gpt-6.1-sol",
			custo: 0,
		},
	};
	return { autoavaliacao: { ...NIVEIS }, questoes, geradoEm: MOMENTO, modelo: "openrouter/openai/gpt-6.1-sol", custo: 0, respostas, concluidoEm: MOMENTO };
}

const dados = await mkdtemp(join(tmpdir(), "estudos-testar-esqueleto-"));
let falhou = false;
try {
	const materia = (await criarMateria(dados, { nome: "Ciência de Dados" })).id;
	const mapa: MapaConteudo = {
		...mapaVazio(),
		situacao: "aprovado",
		aprovadoEm: MOMENTO,
		conceitos: CONCEITOS.map((conceito) => ({ ...conceito, origem: "tema" as const, criadoEm: MOMENTO, referencias: [] })),
	};
	await gravarMapa(dados, materia, mapa);

	// O curso até o Diagnóstico concluído, pela lib.
	const hoje = hojeLocal();
	const prazo = somarDias(hoje, 28);
	const curso = (await comecarCurso(dados, materia, { nome: "P1: regressão", prazo, prova: "P1", horasPorSemana: 4 })).id;
	await confirmarNoDisco(dados, materia, curso, "materiais", { arquivos: [] });
	await confirmarNoDisco(dados, materia, curso, "objetivo", { escopo: "livre", tipo: "misto", motivo: "Passar na P1 entendendo de verdade." });
	await confirmarNoDisco(dados, materia, curso, "mapa", { conceitos: CONCEITOS.map((conceito) => conceito.id) });
	await confirmarNoDisco(dados, materia, curso, "diagnostico", diagnosticoConcluido());
	console.log(`Hoje ${hoje}; prazo ${prazo}; 4 h por semana; ${CONCEITOS.length} conceitos.`);

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
	const ctx = { cwd: dados, sessionManager: { getSessionId: () => "testar-esqueleto", getBranch: () => [] }, modelRegistry: registro };
	for (const tratador of extensao.handlers.get("session_start") ?? []) await tratador({ type: "session_start" }, ctx as never);

	// Espera pelas mensagens da extensão (nunca lendo o curso.json enquanto ela grava).
	const esperar = async (condicao: () => boolean, minutos = 8) => {
		const inicio = Date.now();
		while (!condicao()) {
			if (Date.now() - inicio > minutos * 60_000) throw new Error("demorou demais");
			await new Promise((resolver) => setTimeout(resolver, 200));
		}
	};
	const doPedido = (pedido: string) => mostrados.find((mensagem) => mensagem.dados.pedido === pedido);

	console.log("\n=== Montando o esqueleto");
	const inicio = Date.now();
	barramento.emit("interface:acao", { painel: "cursos", acao: "gerar_esqueleto", dados: { materia, curso, pedido: "gerar" } });
	await esperar(() => doPedido("gerar") !== undefined);
	console.log(`Tempo: ${((Date.now() - inicio) / 1000).toFixed(1)} s. gerandoEsqueleto avisado antes: ${mostrados.some((mensagem) => (mensagem.dados as unknown as MensagemCurso).gerandoEsqueleto === true)}`);
	if (doPedido("gerar")!.acao === "erro") throw new Error(`gerar_esqueleto: ${String(doPedido("gerar")!.dados.mensagem)}`);

	for (const tratador of extensao.handlers.get("session_shutdown") ?? []) await tratador({ type: "session_shutdown", reason: "quit" }, ctx as never);

	const lido = await lerCurso(dados, materia, curso);
	const proposta = lido.esqueletoEmAndamento!;
	const nomeDe = new Map(CONCEITOS.map((conceito) => [conceito.id, conceito.nome]));
	console.log(`Modelo ${proposta.modelo}; custo US$ ${proposta.custo.toFixed(5)}.\n`);
	for (const [indice, modulo] of proposta.modulos.entries()) {
		console.log(`${indice + 1}. ${modulo.nome} (${modulo.id}; ${NOMES_TIPO_MODULO[modulo.tipo]}; ${modulo.horas} h)`);
		console.log(`   Objetivo: ${modulo.objetivo}`);
		console.log(`   Conceitos: ${modulo.conceitos.map((id) => `${nomeDe.get(id) ?? id} [nível ${NIVEIS[id as keyof typeof NIVEIS]}]`).join("; ")}`);
	}
	const horas = proposta.modulos.reduce((soma, modulo) => soma + modulo.horas, 0);
	console.log(`Total: ${horas} h em ${proposta.modulos.length} módulos.`);

	const calendario = calcularCalendario(proposta.modulos, { horasPorSemana: lido.basico!.horasPorSemana, prazo: lido.basico!.prazo, hoje });
	console.log("\n=== Calendário de hoje");
	for (const item of calendario.modulos) console.log(`- ${item.id}: de ${item.inicio} a ${item.fim}; avaliação em ${item.avaliacao}`);
	console.log(`Avaliação geral: ${calendario.avaliacaoGeral}.`);
	if (calendario.horasPorSemanaNecessarias !== undefined) console.log(`Horas por semana necessárias: ${calendario.horasPorSemanaNecessarias}.`);
	console.log(`Avisos: ${calendario.avisos.length ? calendario.avisos.join(" | ") : "nenhum"}`);

	const eventos = (await lerEventos(eventosMateria(dados, materia))).eventos.filter((evento) => evento.verbo === "gerou_esqueleto");
	console.log(`\n=== Eventos: gerou_esqueleto ${JSON.stringify(eventos.map(({ resultado, contexto }) => ({ resultado, contexto })))}`);
} catch (erro) {
	falhou = true;
	console.log(`FALHOU: ${(erro as Error).message}`);
} finally {
	await rm(dados, { recursive: true, force: true });
}
console.log(falhou ? "\nFALHOU" : "\nOK");
process.exit(falhou ? 1 : 0);
