// Verificação da geração de módulos (item 6, parte A) com chamadas reais aos
// modelos de profiles/estudos/prompts/modulo-plano.md e modulo-licao.md (com
// os arquivos da metodologia de profiles/estudos/metodo/ no system prompt).
// Monta numa pasta temporária (fora do Drive), pela lib, uma matéria com um
// material pequeno já extraído (um .extraido de mentira de um markdown com 4
// trechos sobre TF-IDF, o último uma lista de exercícios), o mapa aprovado com
// as referências aos trechos e um curso pronto (escopo "só o material", tipo
// misto, o motivo pedindo os exercícios como base das questões; o diagnóstico
// concluído com níveis variados; o módulo m1 de 2 h com 3 conceitos). Carrega a
// extensão profiles/estudos/extensions/modulos.ts pelo carregador de extensões
// do pi (o mesmo das sessões), entrega a ela o registro de modelos de verdade
// e manda, pela ponte, gerar o m1. Mostra os estados, cada chamada (o tamanho
// do system prompt e as novas tentativas, com a mensagem delas), as lições com
// o roteiro, os blocos com o tamanho, a parte dos caracteres nas explicações
// (o esquema da lição), as referências e o custo, e uma introdução, um
// conceito, um exemplo e uma questão inteiros. A pasta temporária é apagada
// no fim.
//
// Uso, na raiz do repositório (a chave vem do processo ou, se faltar, das
// variáveis de usuário do Windows; o script nunca a imprime):
//   node_modules\.bin\tsx scripts\testar-modulo.ts
//
// Sai com código 1 se a geração falhar.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { carregarChaves } from "../apps/server/src/chaves.ts";
import { criarRegistroModelos } from "../packages/core/src/modelos.ts";
import { comecarCurso, confirmarEtapa, confirmarNoDisco, gravarCurso, hojeLocal, lerCurso, materiaisProntos } from "../profiles/estudos/lib/cursos.ts";
import type { Diagnostico, Questao, Resposta } from "../profiles/estudos/lib/diagnostico.ts";
import { calcularCalendario, type Modulo as ModuloDoEsqueleto } from "../profiles/estudos/lib/esqueleto.ts";
import { lerEventos } from "../profiles/estudos/lib/eventos.ts";
import { gravarMapa, type MapaConteudo, mapaVazio, pastaExtraidoArquivo } from "../profiles/estudos/lib/mapa.ts";
import { criarMateria, eventosMateria } from "../profiles/estudos/lib/materias.ts";
import {
	type Bloco,
	caracteresDaLicao,
	ehFormatoExemplo,
	type EstadoModuloNaTela,
	lerModulo,
	type ModuloGerado,
	niveisDoModulo,
	problemasDaLicao,
	roteiroDaLicao,
} from "../profiles/estudos/lib/modulos.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// O pi do packages/core (a raiz do monorepo não tem node_modules dele).
const pi = (await import(pathToFileURL(join(raiz, "packages", "core", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js")).href)) as typeof import("@earendil-works/pi-coding-agent");

const origem = carregarChaves(["OPENROUTER_API_KEY"]);
console.log(`OPENROUTER_API_KEY: ${origem.OPENROUTER_API_KEY}`);

const ARQUIVO = "aulas/aula-03-tfidf.md";
const TRECHOS = [
	{
		local: "seção 1 (Frequência do termo)",
		nome: "secao-01",
		texto: [
			"## Frequência do termo (TF)",
			"",
			"Para representar um documento como vetor, cada termo do vocabulário vira uma coordenada. O peso mais simples é a frequência do termo: tf(t, d) é o número de vezes que o termo t aparece no documento d.",
			"",
			'Exemplo: no documento d1 = "o gato viu o rato", tf("o", d1) = 2, tf("gato", d1) = 1 e tf("cachorro", d1) = 0.',
			"",
			"A frequência bruta favorece documentos longos, que repetem mais todos os termos. Por isso é comum normalizar pelo número de termos do documento: tf(t, d) = n(t, d) / |d|. Em d1, que tem 5 termos, tf(\"o\", d1) = 2/5 = 0,4.",
		].join("\n"),
	},
	{
		local: "seção 2 (Frequência inversa nos documentos)",
		nome: "secao-02",
		texto: [
			"## Frequência inversa nos documentos (IDF)",
			"",
			"Termos que aparecem em quase todos os documentos, como \"o\" e \"de\", não ajudam a distinguir um documento do outro. A frequência inversa nos documentos mede a raridade do termo na coleção:",
			"",
			"idf(t) = log(N / df(t))",
			"",
			"onde N é o número de documentos da coleção e df(t) é o número de documentos que contêm t. Nesta disciplina usamos o logaritmo na base 10.",
			"",
			"Se o termo aparece em todos os documentos, df(t) = N e idf(t) = log(1) = 0: o termo não pesa nada. Quanto menos documentos contêm o termo, maior o idf. O logaritmo suaviza o crescimento: um termo 100 vezes mais raro não fica 100 vezes mais pesado.",
		].join("\n"),
	},
	{
		local: "seção 3 (O peso TF-IDF)",
		nome: "secao-03",
		texto: [
			"## O peso TF-IDF",
			"",
			"O peso TF-IDF combina as duas ideias: w(t, d) = tf(t, d) × idf(t). Um termo pesa muito num documento quando aparece muito nele (tf alto) e em poucos documentos da coleção (idf alto).",
			"",
			"Exemplo com N = 4 documentos e tf bruto: o termo \"rato\" aparece 3 vezes em d2 e está em 2 dos 4 documentos. Então idf(\"rato\") = log(4/2) = log(2) ≈ 0,301 e w(\"rato\", d2) = 3 × 0,301 ≈ 0,903. O termo \"o\" aparece 5 vezes em d2, mas está nos 4 documentos: idf(\"o\") = log(4/4) = 0 e w(\"o\", d2) = 0.",
			"",
			"O vetor TF-IDF do documento tem um peso por termo do vocabulário; a maioria das coordenadas é zero, porque cada documento usa poucos termos do vocabulário.",
		].join("\n"),
	},
	{
		local: "seção 4 (Exercícios)",
		nome: "secao-04",
		texto: [
			"## Exercícios",
			"",
			"Coleção para os exercícios (N = 3), com tf bruto e log na base 10:",
			"- d1: \"dados abertos dados\"",
			"- d2: \"dados privados\"",
			"- d3: \"modelos abertos\"",
			"",
			"1. Calcule tf(\"dados\", d1) e tf(\"abertos\", d1).",
			"2. Calcule df e idf de \"dados\", \"abertos\", \"privados\" e \"modelos\".",
			"3. Monte o vetor TF-IDF de d1 na ordem do vocabulário [dados, abertos, privados, modelos].",
			"4. Se um quarto documento d4 = \"dados\" fosse acrescentado, o idf de \"dados\" aumentaria ou diminuiria? Por quê?",
			"5. Por que uma palavra como \"de\", presente em todos os documentos, recebe peso zero?",
		].join("\n"),
	},
];

const CONCEITOS: Array<{ id: string; nome: string; descricao: string; prioridade: "alta" | "normal" | "baixa"; secoes: number[] }> = [
	{ id: "c-tf", nome: "Frequência do termo (TF)", descricao: "Quantas vezes o termo aparece no documento, bruta ou normalizada pelo tamanho.", prioridade: "normal", secoes: [0, 3] },
	{ id: "c-idf", nome: "Frequência inversa nos documentos (IDF)", descricao: "O log de N sobre o número de documentos com o termo: mede a raridade.", prioridade: "alta", secoes: [1, 3] },
	{ id: "c-tfidf", nome: "Peso TF-IDF", descricao: "O produto do tf pelo idf, o peso de cada termo no vetor do documento.", prioridade: "alta", secoes: [2, 3] },
	{ id: "c-vetor", nome: "Documento como vetor", descricao: "Cada termo do vocabulário é uma coordenada do vetor do documento.", prioridade: "normal", secoes: [0, 2] },
];

/** c-tf: sei aplicar e acertou (domina); c-idf: sei explicar e acertou (intermediário); c-tfidf: já ouvi falar e errou (iniciante); c-vetor: nunca vi, sem questão. */
const NIVEIS = { "c-tf": 3, "c-idf": 2, "c-tfidf": 1, "c-vetor": 0 } as const;
const ALTERNATIVAS: Array<[conceito: string, certa: boolean]> = [
	["c-tf", true],
	["c-idf", true],
	["c-tfidf", false],
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
	return { autoavaliacao: { ...NIVEIS }, questoes, geradoEm: MOMENTO, modelo: "openrouter/openai/gpt-6.1-sol", custo: 0, respostas, concluidoEm: MOMENTO };
}

const dados = await mkdtemp(join(tmpdir(), "estudos-testar-modulo-"));
let falhou = false;
try {
	const materia = (await criarMateria(dados, { nome: "Ciência de Dados" })).id;

	// O .extraido de mentira do markdown (o manifesto e um .md por trecho).
	const pasta = pastaExtraidoArquivo(dados, materia, ARQUIVO);
	await mkdir(pasta, { recursive: true });
	for (const trecho of TRECHOS) await writeFile(join(pasta, `${trecho.nome}.md`), `---\narquivo: ${ARQUIVO}\nlocal: ${trecho.local}\norigem: texto\n---\n\n${trecho.texto}\n`, "utf8");
	const manifesto = { versao: 1, arquivo: ARQUIVO, hash: "h-aula-03", tamanho: 1, tipo: "markdown", extraidoEm: MOMENTO, custo: 0, avisos: [], trechos: TRECHOS.map(({ local, nome }) => ({ local, nome, origem: "texto" })) };
	await writeFile(join(pasta, "manifesto.json"), JSON.stringify(manifesto), "utf8");

	const mapa: MapaConteudo = {
		...mapaVazio(),
		situacao: "aprovado",
		aprovadoEm: MOMENTO,
		conceitos: CONCEITOS.map(({ secoes, ...conceito }) => ({
			...conceito,
			origem: "material" as const,
			criadoEm: MOMENTO,
			referencias: secoes.map((indice) => ({ arquivo: ARQUIVO, local: TRECHOS[indice]!.local, trecho: TRECHOS[indice]!.nome })),
		})),
	};
	await gravarMapa(dados, materia, mapa);

	// O curso pronto, pela lib.
	const curso = (await comecarCurso(dados, materia, { nome: "P1: busca e TF-IDF", prazo: null, prova: "P1", horasPorSemana: 4 })).id;
	await confirmarNoDisco(dados, materia, curso, "materiais", { arquivos: await materiaisProntos(dados, materia) });
	await confirmarNoDisco(dados, materia, curso, "objetivo", { escopo: "so_material", tipo: "misto", motivo: "Passar na P1. Use os exercícios como base para as questões práticas." });
	await confirmarNoDisco(dados, materia, curso, "mapa", { conceitos: CONCEITOS.map((conceito) => conceito.id) });
	await confirmarNoDisco(dados, materia, curso, "diagnostico", diagnosticoConcluido());
	const MODULOS: ModuloDoEsqueleto[] = [
		{ id: "m1", nome: "Pesos TF-IDF", objetivo: "Calcular e interpretar os pesos TF-IDF de uma coleção pequena.", conceitos: ["c-tf", "c-idf", "c-tfidf"], tipo: "normal", horas: 2 },
		{ id: "m2", nome: "Documentos como vetores", objetivo: "Representar documentos como vetores de pesos.", conceitos: ["c-vetor"], tipo: "curto", horas: 1 },
	];
	const calendario = calcularCalendario(MODULOS, { horasPorSemana: 4, prazo: null, hoje: hojeLocal() });
	const pronto = confirmarEtapa(await lerCurso(dados, materia, curso), "esqueleto", { modulos: MODULOS, geradoEm: MOMENTO, modelo: "openrouter/openai/gpt-6.1-sol", custo: 0, criadoEm: MOMENTO, calendario }).curso;
	await gravarCurso(dados, pronto);
	const niveis = niveisDoModulo(pronto.diagnostico, MODULOS[0]!);
	console.log(`Curso ${curso} pronto; m1 (2 h): ${Object.entries(niveis).map(([id, nivel]) => `${id} ${nivel}`).join(", ")}.`);

	// A extensão pelo carregador do pi, num barramento próprio.
	const barramento = pi.createEventBus();
	const semGlobais = join(dados, ".pi-vazio");
	await mkdir(semGlobais, { recursive: true });
	const carregadas = await pi.discoverAndLoadExtensions([join(raiz, "profiles", "estudos", "extensions", "modulos.ts")], dados, semGlobais, barramento);
	if (carregadas.errors.length) throw new Error(`a extensão não carregou: ${carregadas.errors.map((erro) => erro.error).join("; ")}`);
	const extensao = carregadas.extensions.find((item) => item.resolvedPath.endsWith("modulos.ts"));
	if (!extensao || carregadas.extensions.length !== 1) throw new Error(`esperava só a extensão dos módulos: ${carregadas.extensions.map((item) => item.path).join(", ")}`);

	const registroReal = new pi.ModelRegistry(await criarRegistroModelos());
	const registro = new Proxy(registroReal, {
		get(alvo, nome, receptor) {
			if (nome !== "complete") {
				const valor = Reflect.get(alvo, nome, receptor);
				return typeof valor === "function" ? valor.bind(alvo) : valor;
			}
			return async (...argumentos: Parameters<typeof registroReal.complete>) => {
				const inicio = Date.now();
				const [, contexto] = argumentos;
				chamadas++;
				console.log(`\nChamada ${chamadas}: system prompt com ${contexto.systemPrompt?.length ?? 0} caracteres (${[...(contexto.systemPrompt ?? "").matchAll(/<metodologia arquivo="([^"]+)">/g)].map((achado) => achado[1]).join(", ") || "sem metodologia"}).`);
				if (contexto.messages.length > 1) {
					novasTentativas++;
					const ultima = contexto.messages.at(-1)!;
					const texto = Array.isArray(ultima.content) ? ultima.content.map((parte) => ("text" in parte ? parte.text : "")).join("") : String(ultima.content);
					console.log(`Nova tentativa, com a mensagem:\n${texto}`);
				}
				const resposta = await alvo.complete(...argumentos);
				console.log(
					`Chamada: ${resposta.provider}/${resposta.model}, parada ${resposta.stopReason}${resposta.errorMessage ? ` (${resposta.errorMessage})` : ""}, ${resposta.usage.input + resposta.usage.cacheRead + resposta.usage.cacheWrite} tokens de entrada, ${resposta.usage.output} de saída, US$ ${resposta.usage.cost.total.toFixed(5)}, ${((Date.now() - inicio) / 1000).toFixed(1)} s`,
				);
				return resposta;
			};
		},
	});

	let chamadas = 0;
	let novasTentativas = 0;
	const mostrados: Array<{ acao: string; dados: Record<string, unknown> }> = [];
	barramento.on("interface:mostrar", (mensagem) => {
		const recebida = mensagem as { acao: string; dados: Record<string, unknown> };
		mostrados.push(recebida);
		if (recebida.acao === "estado") {
			const m1 = (recebida.dados.modulos as EstadoModuloNaTela[]).find((item) => item.id === "m1");
			console.log(`Estado do m1: ${m1?.situacao}${m1?.situacao === "escrevendo" ? ` ${m1.licao} de ${m1.licoes}` : ""}${m1?.mensagem ? ` (${m1.mensagem})` : ""}`);
		} else if (recebida.acao === "erro") console.log(`Erro: ${String(recebida.dados.mensagem)}`);
	});
	const ctx = { cwd: dados, sessionManager: { getSessionId: () => "testar-modulo", getBranch: () => [] }, modelRegistry: registro };
	for (const tratador of extensao.handlers.get("session_start") ?? []) await tratador({ type: "session_start" }, ctx as never);

	const situacaoDoM1 = () => {
		const estado = mostrados.filter((mensagem) => mensagem.acao === "estado").at(-1);
		return (estado?.dados.modulos as EstadoModuloNaTela[] | undefined)?.find((item) => item.id === "m1")?.situacao;
	};
	const esperar = async (condicao: () => boolean, minutos = 40) => {
		const inicio = Date.now();
		while (!condicao()) {
			if (Date.now() - inicio > minutos * 60_000) throw new Error("demorou demais");
			await new Promise((resolver) => setTimeout(resolver, 500));
		}
	};

	console.log("\n=== Gerando o m1");
	const inicio = Date.now();
	barramento.emit("interface:acao", { painel: "modulos", acao: "gerar", dados: { materia, curso, modulo: "m1", pedido: "gerar" } });
	await esperar(() => mostrados.some((mensagem) => mensagem.acao === "erro") || situacaoDoM1() === "gerado");
	console.log(`Tempo: ${((Date.now() - inicio) / 1000).toFixed(1)} s.`);
	for (const tratador of extensao.handlers.get("session_shutdown") ?? []) await tratador({ type: "session_shutdown", reason: "quit" }, ctx as never);
	if (situacaoDoM1() !== "gerado") throw new Error("a geração falhou");

	const modulo = (await lerModulo(dados, materia, curso, "m1")) as ModuloGerado;
	console.log(`\nModelo ${modulo.modelo}; custo US$ ${modulo.custo.toFixed(5)}; materiais usados: ${modulo.materiaisUsados.map((item) => item.arquivo).join(", ")}.`);
	const contar = (blocos: Bloco[]) => {
		const porTipo: Record<string, number> = {};
		for (const bloco of blocos) porTipo[bloco.tipo] = (porTipo[bloco.tipo] ?? 0) + 1;
		return Object.entries(porTipo).map(([tipo, quantos]) => `${tipo} ${quantos}`).join(", ");
	};
	for (const licao of modulo.licoes) {
		console.log(`\n## ${licao.id}: ${licao.titulo}`);
		console.log(`Objetivo: ${licao.objetivo}`);
		console.log(`Conceitos: ${licao.conceitos.map((id) => `${id} (${niveis[id]})`).join(", ")}`);
		console.log(`Blocos (${licao.blocos.length}): ${contar(licao.blocos)}`);
		console.log(`Roteiro: ${roteiroDaLicao(licao).join(", ")}`);
		for (const bloco of licao.blocos) {
			const referencias = "referencias" in bloco ? bloco.referencias.map((referencia) => referencia.local).join("; ") : "";
			const tamanho = caracteresDaLicao([bloco]).total;
			const extra = bloco.tipo === "explicacao" ? ` formato ${bloco.formato}${bloco.complemento ? ", complemento" : ""}` : "";
			console.log(`- ${bloco.id} ${bloco.tipo} [${bloco.conceitos.join(", ")}]${extra}, ${tamanho} caracteres${referencias ? `; referências: ${referencias}` : ""}`);
		}
		const caracteres = caracteresDaLicao(licao.blocos);
		console.log(`Caracteres: ${caracteres.explicacoes} nas explicações e na ideia central, ${caracteres.questoes} nas questões; ${(caracteres.proporcao * 100).toFixed(1)} % nas explicações.`);
		const problemas = problemasDaLicao(licao.blocos);
		console.log(problemas.length ? `Problemas do esquema: ${problemas.join(" ")}` : "Segue o esquema da lição.");
	}
	console.log(`\nChamadas: ${chamadas}; novas tentativas: ${novasTentativas}.`);
	const todos = modulo.licoes.flatMap((licao) => licao.blocos);
	const daExplicacao = (teste: (formato: string) => boolean) => todos.find((bloco) => bloco.tipo === "explicacao" && teste(bloco.formato));
	const inteiros: Array<[string, Bloco | undefined]> = [
		["Uma introdução inteira", daExplicacao((formato) => formato === "introducao")],
		["Um conceito inteiro", daExplicacao((formato) => formato === "conceito")],
		["Um exemplo inteiro", daExplicacao(ehFormatoExemplo)],
		["A ideia central da primeira lição", todos.find((bloco) => bloco.tipo === "ideia_central")],
		["Uma pergunta inteira", todos.find((bloco) => bloco.tipo === "verificacao")],
		["Uma questão inteira", todos.find((bloco) => bloco.tipo === "alternativa") ?? todos.find((bloco) => bloco.tipo === "dissertativa")],
	];
	for (const [titulo, bloco] of inteiros) {
		console.log(`\n=== ${titulo}${bloco ? ` (${bloco.id})` : ""}`);
		if (bloco && (bloco.tipo === "explicacao" || bloco.tipo === "ideia_central")) console.log(bloco.texto);
		else console.log(JSON.stringify(bloco, null, 2));
	}

	const eventos = (await lerEventos(eventosMateria(dados, materia))).eventos.filter((evento) => evento.verbo === "gerou_modulo");
	console.log(`\n=== Eventos: gerou_modulo ${JSON.stringify(eventos.map(({ resultado, contexto }) => ({ resultado, contexto })))}`);
} catch (erro) {
	falhou = true;
	console.log(`FALHOU: ${(erro as Error).message}`);
} finally {
	await rm(dados, { recursive: true, force: true });
}
console.log(falhou ? "\nFALHOU" : "\nOK");
process.exit(falhou ? 1 : 0);
