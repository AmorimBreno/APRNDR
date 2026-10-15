// Verificação da tarefa 2.3 (ponte de eventos e subagentes) com chamadas reais
// ao modelo, pelo SDK do pi, usando o perfil de estudos e a pasta de dados de
// verdade. Gasta pouco (respostas curtas) e para se o custo passar de US$ 1.
//
// a. Ponte: uma extensão de teste (só deste script) registra teste_mostrar,
//    que emite "interface:mostrar", e teste_perguntar, que faz
//    "interface:pedido" e espera a resposta. O script responde pela JanelaPerfil.
// b. Subagente researcher pela ferramenta subagent: progresso, resultado e uso.
// c. Subagente mermaid-maker: um grafo de 3 nós publicado em <dados>\viz.
// d. web_fetch com fresh=true busca a página direto (sem o Tavily).
//
// Uso, no PowerShell, na raiz do repositório (as chaves vêm das variáveis de
// usuário do Windows; o script nunca as imprime):
//   $env:OPENROUTER_API_KEY=[Environment]::GetEnvironmentVariable("OPENROUTER_API_KEY","User")
//   $env:TAVILY_API_KEY=[Environment]::GetEnvironmentVariable("TAVILY_API_KEY","User")
//   node_modules\.bin\tsx scripts\testar-ponte.ts
//
// Sai com código 1 se alguma conferência falhar.

import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type EventoNucleo, JanelaPerfil, lerPerfil, pastaSubagentes } from "../packages/core/src/index.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// O typebox é dependência do núcleo; o script o pega de lá.
const { Type } = createRequire(join(raiz, "packages", "core", "package.json"))("typebox") as {
	Type: { Object: (p: object) => never; String: (o?: object) => object };
};

const TETO_CUSTO = 1;
const perfil = await lerPerfil(join(raiz, "profiles", "estudos"));

let falhas = 0;
function conferir(ok: boolean, descricao: string): void {
	console.log(`${ok ? "  OK     " : "  FALHOU "} ${descricao}`);
	if (!ok) falhas++;
}
function titulo(texto: string): void {
	console.log(`\n=== ${texto}`);
}

// ---------------------------------------------------------------------------
// Extensão de teste: faz o papel de uma ferramenta de perfil (só usa pi.events).

const recebidasPelaFerramenta: unknown[] = [];

function extensaoDeTeste(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "teste_mostrar",
		label: "teste_mostrar",
		description: "Test tool: shows a text in the app's 'teste' panel.",
		parameters: Type.Object({ texto: Type.String({ description: "Text to show." }) }),
		async execute(_id, params: { texto: string }) {
			pi.events.emit("interface:mostrar", { painel: "teste", acao: "mostrar", dados: { texto: params.texto } });
			return { content: [{ type: "text", text: "Mostrado no painel teste." }], details: undefined };
		},
	} as ToolDefinition);
	pi.registerTool({
		name: "teste_perguntar",
		label: "teste_perguntar",
		description: "Test tool: asks the user a question in the app's 'teste' panel and waits for the answer.",
		parameters: Type.Object({ pergunta: Type.String({ description: "The question." }) }),
		async execute(idChamada, params: { pergunta: string }) {
			const resposta = await new Promise<{ id: string; dados?: unknown; cancelado?: boolean; motivo?: string }>((resolver) => {
				const parar = pi.events.on("interface:resposta", (dados) => {
					const recebida = dados as { id: string };
					if (recebida.id !== idChamada) return;
					parar();
					resolver(recebida);
				});
				pi.events.emit("interface:pedido", { id: idChamada, painel: "teste", acao: "perguntar", dados: { pergunta: params.pergunta } });
			});
			recebidasPelaFerramenta.push(resposta);
			const texto = resposta.cancelado
				? `O usuário não respondeu (${resposta.motivo}).`
				: `Resposta do usuário: ${JSON.stringify(resposta.dados)}`;
			return { content: [{ type: "text", text: texto }], details: undefined };
		},
	} as ToolDefinition);
}

const janela = new JanelaPerfil(perfil, { extensoesNucleo: () => [extensaoDeTeste] });

// ---------------------------------------------------------------------------
// Eventos traduzidos, mostrados enquanto chegam.

const eventos: EventoNucleo[] = [];
let custoTotal = 0;
let textoAberto = false;
janela.assinar((evento) => {
	eventos.push(evento);
	if (evento.tipo === "texto_delta") {
		if (!textoAberto) process.stdout.write("  [texto] ");
		textoAberto = true;
		process.stdout.write(evento.delta);
		return;
	}
	if (evento.tipo === "raciocinio_delta") return;
	if (textoAberto) process.stdout.write("\n");
	textoAberto = false;
	switch (evento.tipo) {
		case "uso":
			custoTotal += evento.custo;
			console.log(
				`  [uso] ${evento.agente ? `(subagente ${evento.agente}) ` : ""}${evento.modelo}: ${evento.tokensEntrada} entrada, ${evento.tokensSaida} saída; US$ ${evento.custo.toFixed(5)}`,
			);
			return;
		case "ferramenta_inicio":
			console.log(`  [ferramenta_inicio] ${evento.nome} ${JSON.stringify(evento.argumentos).slice(0, 160)}`);
			return;
		case "ferramenta_progresso":
			console.log(`  [ferramenta_progresso] ${evento.nome}: ${evento.resumo}`);
			return;
		case "ferramenta_fim":
			console.log(`  [ferramenta_fim] ${evento.nome} erro=${evento.erro} ${evento.duracaoMs ?? "?"} ms: ${evento.resumo.slice(0, 160)}`);
			return;
		case "acao_interface":
		case "pedido_interface":
		case "pedido_interface_cancelado":
			console.log(`  [${evento.tipo}] ${JSON.stringify({ ...evento, tipo: undefined })}`);
			if (evento.tipo === "pedido_interface") {
				// Simula o usuário respondendo pela interface um pouco depois.
				setTimeout(() => {
					const ok = janela.responder(evento.id, { resposta: "azul" });
					console.log(`  (janela.responder(${evento.id}) = ${ok})`);
				}, 300);
			}
			return;
		case "mensagem_assistente":
			console.log(`  [mensagem_assistente] ${evento.modelo} parada=${evento.motivoParada}${evento.erro ? ` ERRO=${evento.erro}` : ""}`);
			return;
		case "estado_sessao":
			console.log(`  [estado_sessao] agente=${evento.estado.agente} modelo=${evento.estado.modelo} ferramentas=${evento.estado.ferramentas.join(",")}`);
			return;
		case "diagnostico":
			console.log(`  [diagnostico ${evento.nivel}] ${evento.mensagem}`);
			return;
		case "erro":
			console.log(`  [erro ${evento.origem}] ${evento.mensagem}`);
			return;
		default:
			return;
	}
});

async function perguntar(texto: string): Promise<Extract<EventoNucleo, { tipo: "mensagem_assistente" }> | undefined> {
	if (custoTotal > TETO_CUSTO * 0.9) throw new Error(`custo já em US$ ${custoTotal.toFixed(4)}; parando antes do teto`);
	console.log(`  > ${texto}`);
	const antes = eventos.length;
	await janela.enviar(texto);
	await janela.aguardarOcioso();
	return eventos.slice(antes).filter((evento) => evento.tipo === "mensagem_assistente").at(-1) as
		| Extract<EventoNucleo, { tipo: "mensagem_assistente" }>
		| undefined;
}

function desde(indice: number): EventoNucleo[] {
	return eventos.slice(indice);
}

function pngsEm(pasta: string): string[] {
	return existsSync(pasta) ? readdirSync(pasta).filter((nome) => nome.endsWith(".png")) : [];
}

try {
	titulo("a. Ponte: interface:mostrar e interface:pedido");
	const estado = await janela.iniciar();
	conferir(estado.ferramentas.includes("subagent"), "a ferramenta subagent está ativa na sessão do professor");
	conferir(estado.ferramentas.includes("teste_mostrar") && estado.ferramentas.includes("teste_perguntar"), "ferramentas de teste ativas");
	let marca = eventos.length;
	await perguntar(
		"Teste técnico do app: chame a ferramenta teste_mostrar com o texto 'olá painel'; depois chame teste_perguntar com a pergunta 'Qual é a cor?'. No fim responda só com a resposta que voltou, em uma palavra.",
	);
	const mostrar = desde(marca).find((evento) => evento.tipo === "acao_interface");
	conferir(
		mostrar?.tipo === "acao_interface" && mostrar.painel === "teste" && mostrar.acao === "mostrar" && JSON.stringify(mostrar.dados).includes("painel"),
		`EventoNucleo acao_interface: ${JSON.stringify(mostrar)}`,
	);
	const pedido = desde(marca).find((evento) => evento.tipo === "pedido_interface");
	conferir(pedido?.tipo === "pedido_interface" && pedido.painel === "teste" && pedido.acao === "perguntar", `EventoNucleo pedido_interface: ${JSON.stringify(pedido)}`);
	conferir(
		recebidasPelaFerramenta.length === 1 && JSON.stringify(recebidasPelaFerramenta[0]) === JSON.stringify({ id: pedido?.tipo === "pedido_interface" ? pedido.id : "", dados: { resposta: "azul" } }),
		`a ferramenta recebeu a resposta: ${JSON.stringify(recebidasPelaFerramenta[0])}`,
	);

	titulo("b. Subagente researcher");
	await janela.novaSessao();
	marca = eventos.length;
	const antesSubagentes = existsSync(pastaSubagentes(perfil)) ? readdirSync(pastaSubagentes(perfil)) : [];
	const respostaB = await perguntar(
		"Use o subagente researcher para descobrir em que ano o R² ajustado foi proposto e por quem; responda em uma frase com a fonte.",
	);
	const chamadaB = desde(marca).find((evento) => evento.tipo === "ferramenta_inicio" && evento.nome === "subagent");
	const progressoB = desde(marca).filter((evento) => evento.tipo === "ferramenta_progresso" && evento.nome === "subagent");
	const fimB = desde(marca).find((evento) => evento.tipo === "ferramenta_fim" && evento.nome === "subagent");
	const usoB = desde(marca).filter((evento) => evento.tipo === "uso" && evento.agente === "researcher");
	conferir(!!chamadaB && JSON.stringify(chamadaB).includes("researcher"), "o professor chamou subagent(agent=researcher)");
	conferir(progressoB.length > 0, `${progressoB.length} eventos ferramenta_progresso`);
	conferir(
		progressoB.some((evento) => evento.tipo === "ferramenta_progresso" && /researcher: web_(search|fetch)/.test(evento.resumo)),
		"o progresso diz qual ferramenta a filha usa",
	);
	conferir(fimB?.tipo === "ferramenta_fim" && !fimB.erro, "subagent terminou sem erro");
	conferir(usoB.length > 0 && usoB.every((evento) => evento.tipo === "uso" && evento.modelo.includes("glm")), `uso da filha com o modelo dela (${usoB.length} eventos)`);
	conferir(!!respostaB && /19\d\d|20\d\d/.test(respostaB.texto), `resposta final: ${respostaB?.texto.replace(/\s+/g, " ")}`);
	const novosSubagentes = readdirSync(pastaSubagentes(perfil)).filter((nome) => !antesSubagentes.includes(nome));
	conferir(novosSubagentes.length >= 1, `sessão filha gravada em ${pastaSubagentes(perfil)}: ${novosSubagentes.join(", ")}`);
	const listadas = await janela.listarSessoes();
	conferir(
		!listadas.some((sessao) => sessao.arquivo.includes(`${join(".sessoes-pi", "subagentes")}`)),
		"a sessão filha não aparece na lista de sessões do perfil",
	);
	const statsB = janela.sessaoPi?.getSessionStats();
	console.log(`  estatísticas da sessão principal (incluem o usage da filha no resultado da ferramenta): US$ ${statsB?.cost.toFixed(5)}`);

	titulo("c. Subagente mermaid-maker");
	await janela.novaSessao();
	marca = eventos.length;
	const pastaViz = join(perfil.pastaDados, "viz");
	const antesViz = pngsEm(pastaViz);
	const respostaC = await perguntar(
		"Use o subagente mermaid-maker para desenhar um grafo graph LR com 3 nós: 'Dados' -> 'Modelo' -> 'Previsão'. Responda só com o filename que ele devolver.",
	);
	const fimC = desde(marca).find((evento) => evento.tipo === "ferramenta_fim" && evento.nome === "subagent");
	const progressoC = desde(marca).filter((evento) => evento.tipo === "ferramenta_progresso" && evento.nome === "subagent");
	// O professor às vezes pede na tarefa "responda só com o filename"; aí o maker não usa o bloco RESULT.
	conferir(
		fimC?.tipo === "ferramenta_fim" && !fimC.erro && /viz-[\w-]+\.png/.test(fimC.resumo),
		`resultado do mermaid-maker (${fimC?.tipo === "ferramenta_fim" && /RESULT:/.test(fimC.resumo) ? "com" : "sem"} bloco RESULT): ${fimC?.tipo === "ferramenta_fim" ? fimC.resumo : "?"}`,
	);
	conferir(progressoC.some((evento) => evento.tipo === "ferramenta_progresso" && /render_mermaid/.test(evento.resumo)), "o progresso mostra render_mermaid");
	const novosPng = pngsEm(pastaViz).filter((nome) => !antesViz.includes(nome));
	for (const nome of novosPng) console.log(`  PNG novo: ${join(pastaViz, nome)} (${statSync(join(pastaViz, nome)).size} bytes)`);
	conferir(novosPng.length === 1, `um PNG publicado em ${pastaViz}`);
	conferir(!!respostaC && novosPng.some((nome) => respostaC.texto.includes(nome)), `o professor devolveu o filename: ${respostaC?.texto.trim()}`);

	titulo("d. web_fetch com fresh=true");
	const extensoes = janela.sessaoPi?.resourceLoader.getExtensions().extensions ?? [];
	const webFetch = extensoes.map((extensao) => extensao.tools.get("web_fetch")).find(Boolean)?.definition;
	conferir(!!webFetch, "web_fetch carregada das extensões globais");
	if (webFetch) {
		const url = "https://registry.npmjs.org/@earendil-works/pi-coding-agent/latest";
		const executar = (parametros: object) =>
			webFetch.execute("teste-d", parametros as never, undefined, undefined, undefined as never) as Promise<{
				content: Array<{ type: string; text?: string }>;
				details: { source: string; fresh: boolean; chars: number };
			}>;
		const aoVivo = await executar({ url, fresh: true, max_chars: 10000 });
		const textoAoVivo = aoVivo.content[0]?.text ?? "";
		console.log(`  fresh=true: source=${aoVivo.details.source} fresh=${aoVivo.details.fresh} ${aoVivo.details.chars} car.; versão: ${textoAoVivo.match(/"version"\s*:\s*"([^"]+)"/)?.[1]}`);
		conferir(aoVivo.details.source === "direct" && aoVivo.details.fresh === true, "fresh=true buscou direto");
		conferir(!textoAoVivo.startsWith("Note:"), "sem aviso de cache no texto ao vivo");
		const padrao = await executar({ url: "https://en.wikipedia.org/wiki/Coefficient_of_determination", max_chars: 1000 });
		const textoPadrao = padrao.content[0]?.text ?? "";
		console.log(`  sem fresh: source=${padrao.details.source}; começo: ${textoPadrao.slice(0, 140).replace(/\s+/g, " ")}`);
		conferir(padrao.details.source !== "tavily" || textoPadrao.startsWith("Note:"), "sem fresh, o conteúdo do Tavily vem com o aviso de cache");
	}
} catch (erro) {
	falhas++;
	console.error("\nErro:", erro instanceof Error ? erro.message : erro);
} finally {
	await janela.descartar();
}

console.log(`\nCusto total (soma dos eventos "uso", principal e filhas): US$ ${custoTotal.toFixed(4)}`);
console.log(falhas === 0 ? "Tudo certo." : `${falhas} conferência(s) falharam.`);
process.exitCode = falhas === 0 ? 0 : 1;
