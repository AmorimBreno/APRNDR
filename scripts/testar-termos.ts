// Teste real dos termos pela mesma extensão usada pelo app. Copia somente os
// arquivos necessários para uma pasta temporária; nunca grava na origem.
// Uso: pnpm exec tsx scripts/testar-termos.ts [pasta-dados]
// Faz uma chamada por lição do m1 e uma para explicar "radicais" (OpenRouter).
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { carregarChaves } from "../apps/server/src/chaves.ts";
import { criarRegistroModelos } from "../packages/core/src/modelos.ts";
import type { MensagemErroModulos, MensagemEstadoModulos, MensagemModulo, ModuloGerado } from "../profiles/estudos/lib/modulo-tipos.ts";
import {
	aplicarMarcas,
	incorporarTermosMarcados,
	lerGlossario,
	lerTermosMarcados,
	marcasDoBloco,
	textosDoBloco,
} from "../profiles/estudos/lib/termos.ts";
import { objetoJsonDoModelo } from "../profiles/estudos/lib/json-do-modelo.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origem = resolve(process.argv[2] ?? "G:/Meu Drive/estudos-dados");
const materia = "ciencia-de-dados";
const curso = "estudo-de-ciencia-de-dados-para-atividade";
const pastaMateria = join("materias", materia);
const pastaCurso = join(pastaMateria, "cursos", curso);
const arquivoModulo = join(pastaCurso, "modulos", "m1.json");
const chaves = carregarChaves(["OPENROUTER_API_KEY"]);
if (chaves.OPENROUTER_API_KEY === "ausente") throw new Error("Configure OPENROUTER_API_KEY nas variáveis de ambiente do Windows.");
const dados = await mkdtemp(join(tmpdir(), "estudos-testar-termos-"));
let encerrar: (() => Promise<void>) | undefined;
let custo = 0;
try {
	// Lista fechada: sem sessões, notas pessoais, PDFs nem eventos do aprendiz.
	const arquivos = [
		join(pastaMateria, "materia.json"),
		join(pastaMateria, "mapa-conteudo.json"),
		join(pastaCurso, "curso.json"),
		arquivoModulo,
	];
	const opcionais = [join(pastaCurso, "glossario.json"), join("aprendiz", "escrita.json")];
	const copiar = async (relativo: string, opcional = false) => {
		const destino = join(dados, relativo);
		await mkdir(dirname(destino), { recursive: true });
		try {
			await copyFile(join(origem, relativo), destino);
		} catch (e) {
			if (!opcional || (e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
		}
	};
	for (const arquivo of arquivos) await copiar(arquivo);
	for (const arquivo of opcionais) await copiar(arquivo, true);
	// Confere byte por byte no fim que os arquivos lidos não mudaram.
	const antes = new Map(await Promise.all(arquivos.map(async (a) => [a, await readFile(join(origem, a))] as const)));
	const ler = async () => JSON.parse(await readFile(join(dados, arquivoModulo), "utf8")) as ModuloGerado;
	const inicial = await ler();
	const blocoOriginal = inicial.licoes.find((l) => l.id === "l2")?.blocos.find((b) => b.id === "l2-b1");
	assert(
		blocoOriginal && textosDoBloco(blocoOriginal).some((t) => t.texto.includes("radicais")),
		"O caso de teste radicais não está no l2-b1.",
	);

	const pi = (await import(
		pathToFileURL(join(raiz, "packages/core/node_modules/@earendil-works/pi-coding-agent/dist/index.js")).href
	)) as typeof import("@earendil-works/pi-coding-agent");
	const barramento = pi.createEventBus();
	const semGlobais = join(dados, ".pi-vazio");
	await mkdir(semGlobais, { recursive: true });
	const carregadas = await pi.discoverAndLoadExtensions(
		[join(raiz, "profiles/estudos/extensions/modulos.ts")],
		dados,
		semGlobais,
		barramento,
	);
	assert.equal(carregadas.errors.length, 0, carregadas.errors.map((e) => e.error).join("; "));
	assert.equal(carregadas.extensions.length, 1);
	const extensao = carregadas.extensions[0]!;
	const real = new pi.ModelRegistry(await criarRegistroModelos());
	const saidasMarcacao = new Map<string, string>();
	let marcando = true;
	const registro = new Proxy(real, {
		get(alvo, nome, receptor) {
			if (nome !== "complete") {
				const valor = Reflect.get(alvo, nome, receptor);
				return typeof valor === "function" ? valor.bind(alvo) : valor;
			}
			return async (...args: Parameters<typeof real.complete>) => {
				const inicio = Date.now();
				const resposta = await alvo.complete(...args);
				custo += resposta.usage.cost.total;
				if (marcando) {
					const licao = /Lição: ([^,]+),/.exec(JSON.stringify(args[1]))?.[1];
					if (licao)
						saidasMarcacao.set(
							licao,
							resposta.content
								.filter((c) => c.type === "text")
								.map((c) => c.text)
								.join("\n"),
						);
				}
				console.log(
					`Modelo ${resposta.provider}/${resposta.model}: ${resposta.stopReason}, US$ ${resposta.usage.cost.total.toFixed(5)}, ${((Date.now() - inicio) / 1000).toFixed(1)} s`,
				);
				return resposta;
			};
		},
	});
	type Recebida = { painel: string; acao: string; dados: MensagemModulo | MensagemEstadoModulos | MensagemErroModulos };
	const mensagens: Recebida[] = [];
	barramento.on("interface:mostrar", (m) => {
		mensagens.push(m as Recebida);
	});
	const ctx = { cwd: dados, sessionManager: { getSessionId: () => "testar-termos", getBranch: () => [] }, modelRegistry: registro };
	encerrar = async () => {
		for (const h of extensao.handlers.get("session_shutdown") ?? []) await h({ type: "session_shutdown", reason: "quit" }, ctx as never);
	};
	for (const h of extensao.handlers.get("session_start") ?? []) await h({ type: "session_start" }, ctx as never);
	const esperar = async (condicao: () => boolean) => {
		const limite = Date.now() + 10 * 60_000;
		while (!condicao()) {
			const erro = mensagens.find((m) => m.acao === "erro");
			if (erro) throw new Error((erro.dados as MensagemErroModulos).mensagem);
			if (Date.now() > limite) throw new Error("O teste excedeu dez minutos.");
			await new Promise((r) => setTimeout(r, 100));
		}
	};
	const acao = (nome: string, campos: Record<string, unknown>) =>
		barramento.emit("interface:acao", { painel: "modulos", acao: nome, dados: { materia, curso, modulo: "m1", ...campos } });
	console.log(`Teste numa cópia temporária: ${inicial.licoes.length} lições. Nenhuma escrita na origem.`);
	acao("marcar_termos", { pedido: "teste-marcar" });
	await esperar(() => mensagens.some((m) => m.acao === "modulo"));
	const marcado = await ler();
	const glossario = await lerGlossario(dados, materia, curso);
	console.log("\n=== Descartes da validação e da aplicação (mesmas funções da extensão)");
	for (const licao of inicial.licoes) {
		const saida = saidasMarcacao.get(licao.id);
		assert(saida, `A resposta da lição ${licao.id} não foi capturada.`);
		const conferidos = lerTermosMarcados(objetoJsonDoModelo(saida), { licao, modulo: inicial, glossario: glossario.termos });
		const incorporados = incorporarTermosMarcados(glossario, conferidos.termos, { modulo: inicial, agora: new Date() });
		const { aplicadas } = aplicarMarcas(inicial, incorporados.marcas);
		const fora = incorporados.marcas.filter((m) => !aplicadas.some((a) => a.id === m.id && a.bloco === m.bloco && a.trecho === m.trecho));
		console.log(JSON.stringify({ licao: licao.id, descartes: conferidos.descartes, naoAplicadas: fora }));
	}
	console.log("\n=== Glossário");
	for (const termo of glossario.termos)
		console.log(JSON.stringify({ id: termo.id, termo: termo.termo, definicao: termo.definicao, explicado: termo.explicado }));
	console.log("\n=== Marcas e contextos");
	for (const l of marcado.licoes)
		for (const b of l.blocos)
			for (const marca of marcasDoBloco(b)) {
				const texto = textosDoBloco(b).find((t) => t.campo === marca.campo)?.texto ?? "";
				console.log(`${l.id}/${b.id} (${marca.campo}) ${marca.id}: ${texto.slice(Math.max(0, marca.inicio - 60), marca.fim + 60)}`);
			}
	// Uma marcação não pode reescrever conteúdo nem alterar as versões ou respostas.
	const { semMarcas } = await import("../profiles/estudos/lib/termos-tipos.ts");
	for (const [i, l] of marcado.licoes.entries())
		for (const [j, b] of l.blocos.entries()) {
			const anterior = inicial.licoes[i]!.blocos[j]!;
			assert.deepEqual(
				textosDoBloco(b).map((t) => ({ ...t, texto: semMarcas(t.texto) })),
				textosDoBloco(anterior).map((t) => ({ ...t, texto: semMarcas(t.texto) })),
			);
			assert.equal(b.versao, anterior.versao);
		}
	assert.deepEqual(marcado.respostas, inicial.respostas);
	const alvo = marcado.licoes.find((l) => l.id === "l2")!.blocos.find((b) => b.id === "l2-b1")!;
	const radical = marcasDoBloco(alvo).find((m) => m.texto === "radicais");
	assert(radical, 'O modelo não marcou "radicais" no l2-b1. Reveja o prompt.');
	console.log("\n=== Explicação de radicais");
	marcando = false;
	mensagens.length = 0;
	acao("explicar_trecho", { pedido: "teste-explicar", licao: "l2", bloco: "l2-b1", trecho: "radicais", tipo: "nao_sei" });
	await esperar(() =>
		mensagens.some(
			(m) =>
				m.acao === "modulo" &&
				(m.dados as MensagemModulo).modulo.situacao === "gerado" &&
				((m.dados as MensagemModulo).modulo as ModuloGerado).explicacoes?.some((p) => p.trecho === "radicais" && !!p.explicacao),
		),
	);
	const explicado = await ler();
	const pedido = explicado.explicacoes!.findLast((p) => p.trecho === "radicais")!;
	console.log(JSON.stringify(pedido, null, 2));
	assert(pedido.termo, "A explicação não sugeriu um termo para o glossário.");
	console.log("\n=== Bloco indicado como explicação de radical (conferência semântica manual)");
	const termoRadical = glossario.termos.find((t) => t.id === radical.id)!;
	if (termoRadical.explicado) {
		const lugar = termoRadical.explicado;
		console.log(
			JSON.stringify(
				marcado.licoes.find((l) => l.id === lugar.licao)?.blocos.find((b) => b.id === lugar.bloco),
				null,
				2,
			),
		);
	} else console.log("Não explicado no curso (null), como esperado para um termo só usado.");
	for (const [arquivo, conteudo] of antes)
		assert((await readFile(join(origem, arquivo))).equals(conteudo), `A origem mudou durante o teste: ${arquivo}`);
	console.log("\nOK: conteúdo, versões e respostas preservados; origem sem mudanças.");
} finally {
	try {
		await encerrar?.();
	} finally {
		await rm(dados, { recursive: true, force: true });
	}
	console.log(`Custo total: US$ ${custo.toFixed(5)}.`);
}
