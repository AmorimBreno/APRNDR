// Verificação da escrita dos módulos (docs/escrita.md) com uma chamada real ao
// modelo de profiles/estudos/prompts/modulo-bloco.md. Monta numa pasta
// temporária (fora do Drive), pela lib, o mesmo curso do
// scripts/testar-modulo.ts (um .extraido de mentira de um markdown sobre
// TF-IDF, o mapa aprovado e o curso pronto, escopo "só o material"), mas com
// o módulo m1 gerado à mão (validarLicao e gravarModuloGerado, sem chamar o
// modelo): uma lição cuja primeira explicação, sobre o IDF, é longa e
// abstrata. Carrega a extensão profiles/estudos/extensions/modulos.ts pelo
// carregador de extensões do pi e, pela ponte: salva uma regra de escrita
// ("Comece sempre por um exemplo concreto com números."), grava um retorno
// "ruim" com os motivos longo e abstrato nessa explicação e manda
// reescrever o bloco. Mostra o bloco antes e depois (inteiros), o custo, as
// versões gravadas no arquivo e os eventos. A pasta temporária é apagada no
// fim.
//
// Uso, na raiz do repositório (a chave vem do processo ou, se faltar, das
// variáveis de usuário do Windows; o script nunca a imprime):
//   node_modules\.bin\tsx scripts\testar-reescrita.ts
//
// Sai com código 1 se a reescrita falhar.

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { carregarChaves } from "../apps/server/src/chaves.ts";
import { criarRegistroModelos } from "../packages/core/src/modelos.ts";
// Só o tipo: a extensão é carregada pelo carregador do pi (ela importa o typebox, que a raiz não tem).
import type { MensagemEstado } from "../profiles/estudos/extensions/modulos.ts";
import { comecarCurso, confirmarEtapa, confirmarNoDisco, gravarCurso, hojeLocal, lerCurso, materiaisProntos } from "../profiles/estudos/lib/cursos.ts";
import type { Diagnostico } from "../profiles/estudos/lib/diagnostico.ts";
import { lerEscrita } from "../profiles/estudos/lib/escrita.ts";
import { calcularCalendario, type Modulo as ModuloDoEsqueleto } from "../profiles/estudos/lib/esqueleto.ts";
import { lerEventos } from "../profiles/estudos/lib/eventos.ts";
import { gravarMapa, type MapaConteudo, mapaVazio, pastaExtraidoArquivo } from "../profiles/estudos/lib/mapa.ts";
import { criarMateria, eventosAprendiz } from "../profiles/estudos/lib/materias.ts";
import { gravarModuloGerado, lerModulo, type ModuloGerado, validarLicao } from "../profiles/estudos/lib/modulos.ts";

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
		].join("\n"),
	},
	{
		local: "seção 2 (Frequência inversa nos documentos)",
		nome: "secao-02",
		texto: [
			"## Frequência inversa nos documentos (IDF)",
			"",
			'Termos que aparecem em quase todos os documentos, como "o" e "de", não ajudam a distinguir um documento do outro. A frequência inversa nos documentos mede a raridade do termo na coleção:',
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
		].join("\n"),
	},
	{
		local: "seção 4 (Exercícios)",
		nome: "secao-04",
		texto: [
			"## Exercícios",
			"",
			"Coleção para os exercícios (N = 3), com tf bruto e log na base 10:",
			'- d1: "dados abertos dados"',
			'- d2: "dados privados"',
			'- d3: "modelos abertos"',
			"",
			'1. Calcule df e idf de "dados", "abertos", "privados" e "modelos".',
			'2. Se um quarto documento d4 = "dados" fosse acrescentado, o idf de "dados" aumentaria ou diminuiria? Por quê?',
		].join("\n"),
	},
];

const CONCEITOS: Array<{ id: string; nome: string; descricao: string; prioridade: "alta" | "normal" | "baixa"; secoes: number[] }> = [
	{ id: "c-tf", nome: "Frequência do termo (TF)", descricao: "Quantas vezes o termo aparece no documento, bruta ou normalizada pelo tamanho.", prioridade: "normal", secoes: [0] },
	{ id: "c-idf", nome: "Frequência inversa nos documentos (IDF)", descricao: "O log de N sobre o número de documentos com o termo: mede a raridade.", prioridade: "alta", secoes: [1, 3] },
	{ id: "c-tfidf", nome: "Peso TF-IDF", descricao: "O produto do tf pelo idf, o peso de cada termo no vetor do documento.", prioridade: "alta", secoes: [2, 3] },
];

/** A explicação longa e abstrata (o bloco a reescrever): sem nenhum número nem exemplo. */
const EXPLICACAO_LONGA = [
	"A frequência inversa nos documentos é uma medida que procura capturar, de maneira geral, o grau de informatividade de um termo em relação ao conjunto de documentos considerado como um todo, isto é, a coleção. A ideia de fundo é que a relevância de um termo para distinguir documentos não depende apenas de como ele se comporta dentro de um documento específico, mas sobretudo de como ele se distribui pela coleção inteira.",
	"Em termos conceituais, pode-se dizer que um termo amplamente difundido na coleção tende a carregar pouca capacidade discriminativa, ao passo que um termo de ocorrência mais restrita tende a carregar mais capacidade discriminativa. A frequência inversa formaliza essa intuição por meio de uma relação entre o tamanho da coleção e a quantidade de documentos nos quais o termo ocorre, relação essa que é então submetida a uma transformação logarítmica.",
	"A transformação logarítmica cumpre um papel importante do ponto de vista conceitual: ela atenua as diferenças entre termos muito raros e termos moderadamente raros, de modo que a medida não cresça de forma desproporcional. Assim, a medida resultante preserva a ordenação dos termos segundo sua raridade, mas comprime a escala, tornando o comportamento da medida mais estável e mais adequado para ser combinado com outras medidas.",
	"Cabe observar ainda que, no caso limite em que o termo está presente em todos os documentos da coleção, a medida assume seu valor mínimo, o que significa que o termo, nessa situação, não contribui para distinguir documentos. De modo geral, portanto, a frequência inversa nos documentos deve ser entendida como um componente que pondera a importância dos termos segundo sua distribuição na coleção, e é justamente por isso que ela costuma ser combinada com a frequência do termo para formar pesos mais informativos.",
].join("\n\n");

const MOMENTO = new Date().toISOString();

const dados = await mkdtemp(join(tmpdir(), "estudos-testar-reescrita-"));
let falhou = false;
try {
	const materia = (await criarMateria(dados, { nome: "Ciência de Dados" })).id;

	const pasta = pastaExtraidoArquivo(dados, materia, ARQUIVO);
	await mkdir(pasta, { recursive: true });
	for (const trecho of TRECHOS) await writeFile(join(pasta, `${trecho.nome}.md`), `---\narquivo: ${ARQUIVO}\nlocal: ${trecho.local}\norigem: texto\n---\n\n${trecho.texto}\n`, "utf8");
	const manifesto = { versao: 1, arquivo: ARQUIVO, hash: "h-aula-03", tamanho: 1, tipo: "markdown", extraidoEm: MOMENTO, custo: 0, avisos: [], trechos: TRECHOS.map(({ local, nome }) => ({ local, nome, origem: "texto" })) };
	await writeFile(join(pasta, "manifesto.json"), JSON.stringify(manifesto), "utf8");

	const referenciaDe = (indice: number) => ({ arquivo: ARQUIVO, local: TRECHOS[indice]!.local, trecho: TRECHOS[indice]!.nome });
	const mapa: MapaConteudo = {
		...mapaVazio(),
		situacao: "aprovado",
		aprovadoEm: MOMENTO,
		conceitos: CONCEITOS.map(({ secoes, ...conceito }) => ({ ...conceito, origem: "material" as const, criadoEm: MOMENTO, referencias: secoes.map(referenciaDe) })),
	};
	await gravarMapa(dados, materia, mapa);

	// O curso pronto, pela lib; o diagnóstico concluído sem questões (c-idf: "já ouvi falar", iniciante).
	const curso = (await comecarCurso(dados, materia, { nome: "P1: busca e TF-IDF", prazo: null, prova: "P1", horasPorSemana: 4 })).id;
	await confirmarNoDisco(dados, materia, curso, "materiais", { arquivos: await materiaisProntos(dados, materia) });
	await confirmarNoDisco(dados, materia, curso, "objetivo", { escopo: "so_material", tipo: "misto", motivo: "Passar na P1. Use os exercícios como base para as questões práticas." });
	await confirmarNoDisco(dados, materia, curso, "mapa", { conceitos: CONCEITOS.map((conceito) => conceito.id) });
	const diagnostico: Diagnostico = { autoavaliacao: { "c-tf": 2, "c-idf": 1, "c-tfidf": 1 }, questoes: [], geradoEm: MOMENTO, modelo: "openrouter/openai/gpt-6.1-sol", custo: 0, respostas: {}, concluidoEm: MOMENTO };
	// Pela regra pura (como nos testes): o diagnóstico sem questões não passa pela conferência do disco.
	const comDiagnostico = confirmarEtapa(await lerCurso(dados, materia, curso), "diagnostico", diagnostico).curso;
	const MODULOS: ModuloDoEsqueleto[] = [{ id: "m1", nome: "Pesos TF-IDF", objetivo: "Calcular e interpretar os pesos TF-IDF de uma coleção pequena.", conceitos: ["c-tf", "c-idf", "c-tfidf"], tipo: "normal", horas: 2 }];
	const calendario = calcularCalendario(MODULOS, { horasPorSemana: 4, prazo: null, hoje: hojeLocal() });
	const pronto = confirmarEtapa(comDiagnostico, "esqueleto", { modulos: MODULOS, geradoEm: MOMENTO, modelo: "openrouter/openai/gpt-6.1-sol", custo: 0, criadoEm: MOMENTO, calendario }).curso;
	await gravarCurso(dados, pronto);

	// O módulo m1 gerado à mão, pela lib: uma lição sobre o IDF.
	const { licao } = validarLicao(
		{
			blocos: [
				{ tipo: "explicacao", conceitos: ["c-idf"], formato: "exemplo_resolvido", texto: EXPLICACAO_LONGA, referencias: [{ arquivo: ARQUIVO, local: TRECHOS[1]!.local }] },
				{ tipo: "verificacao", conceitos: ["c-idf"], pergunta: "Quanto vale o idf de um termo que aparece em todos os documentos?", respostaEsperada: "Zero, porque log(N/N) = log(1) = 0." },
				{
					tipo: "explicacao",
					conceitos: ["c-idf"],
					formato: "exemplo_incompleto",
					texto: "Na coleção dos exercícios (N = 3), \"dados\" está em d1 e d2.\n\n### Contar os documentos\n\ndf(\"dados\") = 2.\n\n### Calcular o idf\n\nComplete: calcule idf(\"dados\") = log(3/2). Dica: log(1,5) fica entre 0,1 e 0,2.",
					referencias: [{ arquivo: ARQUIVO, local: TRECHOS[3]!.local }],
				},
				{
					tipo: "alternativa",
					conceitos: ["c-idf"],
					contexto: "Numa coleção de 10 documentos, o termo `rede` aparece em 1 documento e o termo `dados` aparece em 10.",
					enunciado: "Qual afirmação sobre os idf (log na base 10) está certa?",
					alternativas: [
						{ texto: "idf(rede) = 1 e idf(dados) = 0", correta: true },
						{ texto: "idf(rede) = 0 e idf(dados) = 1", confusao: "Inverte a relação: acha que aparecer mais aumenta o idf." },
						{ texto: "idf(rede) = 10 e idf(dados) = 1", confusao: "Esquece o logaritmo e usa N/df direto." },
						{ texto: "idf(rede) = idf(dados) = 1", confusao: "Acha que o idf não depende de quantos documentos têm o termo." },
					],
					explicacao: "idf(rede) = log(10/1) = 1 e idf(dados) = log(10/10) = 0. As erradas invertem a relação, esquecem o log ou ignoram o df.",
					referencias: [{ arquivo: ARQUIVO, local: TRECHOS[1]!.local }],
				},
			],
		},
		{ licao: { id: "l1", titulo: "Termos raros pesam mais", objetivo: "Calcular o IDF de um termo e explicar por que termos raros pesam mais.", conceitos: ["c-idf"] }, trechos: [referenciaDe(1), referenciaDe(3)], escopo: "so_material" },
	);
	// O nome e o hash dos prompts, como o hashDoPrompt da extensão (12 hex do sha256), para o retorno achar o prompt da lição no gerou_modulo.
	const usado = async (caminho: string) => ({ nome: basename(caminho), hash: createHash("sha256").update(await readFile(caminho, "utf8"), "utf8").digest("hex").slice(0, 12) });
	const prompts = join(raiz, "profiles", "estudos", "prompts");
	await gravarModuloGerado(
		dados,
		materia,
		curso,
		{ id: "m1", licoes: [licao], modelo: "openrouter/openai/gpt-6.1-sol", custo: 0, materiaisUsados: await materiaisProntos(dados, materia) },
		{ modelo: "openrouter/openai/gpt-6.1-sol", prompts: [await usado(join(prompts, "modulo-plano.md")), await usado(join(prompts, "modulo-licao.md"))] },
	);
	console.log(`Curso ${curso} pronto, com o m1 gerado à mão (${licao.blocos.length} blocos na lição l1).`);

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
				const resposta = await alvo.complete(...argumentos);
				console.log(
					`Chamada: ${resposta.provider}/${resposta.model}, parada ${resposta.stopReason}${resposta.errorMessage ? ` (${resposta.errorMessage})` : ""}, ${resposta.usage.input + resposta.usage.cacheRead + resposta.usage.cacheWrite} tokens de entrada, ${resposta.usage.output} de saída, US$ ${resposta.usage.cost.total.toFixed(5)}, ${((Date.now() - inicio) / 1000).toFixed(1)} s`,
				);
				return resposta;
			};
		},
	});

	const mostrados: Array<{ painel: string; acao: string; dados: Record<string, unknown> }> = [];
	barramento.on("interface:mostrar", (mensagem) => {
		const recebida = mensagem as { painel: string; acao: string; dados: Record<string, unknown> };
		mostrados.push(recebida);
		if (recebida.acao === "erro") console.log(`Erro (${recebida.painel}): ${String(recebida.dados.mensagem)}`);
		else if (recebida.painel === "modulos" && recebida.acao === "estado") {
			const m1 = (recebida.dados as unknown as MensagemEstado).modulos.find((item) => item.id === "m1");
			console.log(`Estado do m1: ${m1?.situacao}${m1?.reescrevendo ? ` (reescrevendo ${m1.reescrevendo.licao}/${m1.reescrevendo.bloco})` : ""}`);
		}
	});
	const ctx = { cwd: dados, sessionManager: { getSessionId: () => "testar-reescrita", getBranch: () => [] }, modelRegistry: registro };
	for (const tratador of extensao.handlers.get("session_start") ?? []) await tratador({ type: "session_start" }, ctx as never);

	const esperar = async (condicao: () => boolean, minutos = 10) => {
		const inicio = Date.now();
		while (!condicao()) {
			if (Date.now() - inicio > minutos * 60_000) throw new Error("demorou demais");
			await new Promise((resolver) => setTimeout(resolver, 200));
		}
	};
	const comPedido = (pedido: string) => mostrados.find((mensagem) => mensagem.dados.pedido === pedido);
	const acao = (painel: string, nome: string, dadosAcao: Record<string, unknown>) => barramento.emit("interface:acao", { painel, acao: nome, dados: dadosAcao });

	console.log("\n=== A regra de escrita");
	acao("escrita", "salvar", { pedido: "regra", regra: { texto: "Comece sempre por um exemplo concreto com números.", materia: null, ativa: true } });
	await esperar(() => Boolean(comPedido("regra")));
	if (comPedido("regra")!.acao !== "regras") throw new Error("a regra não foi salva");
	console.log(JSON.stringify((await lerEscrita(dados)).regras));

	console.log("\n=== O retorno");
	acao("modulos", "retorno", { materia, curso, modulo: "m1", licao: "l1", bloco: "l1-b1", pedido: "retorno", avaliacao: "ruim", motivos: ["longo", "abstrato"], texto: "" });
	await esperar(() => Boolean(comPedido("retorno")));
	const retorno = (comPedido("retorno")!.dados as unknown as MensagemEstado).retorno;
	if (!retorno) throw new Error("o retorno não foi gravado");
	console.log(`Evento do retorno: ${retorno}`);

	const antes = ((await lerModulo(dados, materia, curso, "m1")) as ModuloGerado).licoes[0]!.blocos[0]!;
	console.log("\n=== Reescrevendo o l1-b1");
	const inicio = Date.now();
	acao("modulos", "reescrever_bloco", { materia, curso, modulo: "m1", licao: "l1", bloco: "l1-b1", pedido: "reescrever", retorno });
	await esperar(() => mostrados.some((mensagem) => mensagem.acao === "modulo") || mostrados.some((mensagem) => mensagem.acao === "erro" && mensagem.dados.ao === "reescrever_bloco"));
	console.log(`Tempo: ${((Date.now() - inicio) / 1000).toFixed(1)} s.`);
	for (const tratador of extensao.handlers.get("session_shutdown") ?? []) await tratador({ type: "session_shutdown", reason: "quit" }, ctx as never);
	if (!mostrados.some((mensagem) => mensagem.acao === "modulo")) throw new Error("a reescrita falhou");

	const depois = ((await lerModulo(dados, materia, curso, "m1")) as ModuloGerado).licoes[0]!.blocos[0]!;
	console.log("\n=== Antes (o bloco inteiro)");
	console.log(JSON.stringify(antes, null, 2));
	console.log("\n=== Antes (o texto)");
	console.log(antes.tipo === "explicacao" ? antes.texto : "");
	console.log("\n=== Depois (o bloco inteiro, sem as anteriores)");
	const { anteriores, ...semAnteriores } = depois;
	console.log(JSON.stringify(semAnteriores, null, 2));
	console.log("\n=== Depois (o texto)");
	console.log(depois.tipo === "explicacao" ? depois.texto : "");
	console.log(`\nTamanho do texto: ${antes.tipo === "explicacao" ? antes.texto.length : 0} → ${depois.tipo === "explicacao" ? depois.texto.length : 0} caracteres.`);
	console.log(`\n=== Versões no arquivo: atual ${depois.versao} (reescritoEm ${depois.reescritoEm}); anteriores: ${JSON.stringify((anteriores ?? []).map((item) => ({ versao: item.versao, substituidoEm: item.substituidoEm, retorno: item.retorno })))}`);
	const eventos = (await lerEventos(eventosAprendiz(dados))).eventos.filter((evento) => ["avaliou_bloco", "reescreveu_bloco", "criou_regra_escrita"].includes(evento.verbo));
	console.log("\n=== Eventos do aprendiz");
	for (const evento of eventos) console.log(JSON.stringify({ verbo: evento.verbo, objeto: evento.objeto, resultado: evento.resultado, contexto: evento.contexto }));
	const reescreveu = eventos.find((evento) => evento.verbo === "reescreveu_bloco");
	console.log(`\nCusto da reescrita: US$ ${Number(reescreveu?.contexto?.custo ?? 0).toFixed(5)}.`);
} catch (erro) {
	falhou = true;
	console.log(`FALHOU: ${(erro as Error).message}`);
} finally {
	await rm(dados, { recursive: true, force: true });
}
console.log(falhou ? "\nFALHOU" : "\nOK");
process.exit(falhou ? 1 : 0);
