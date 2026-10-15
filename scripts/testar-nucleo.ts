// Verificação do núcleo (tarefa 2.2) com chamadas reais ao modelo, pelo SDK do
// pi, usando o perfil de estudos e a pasta de dados de verdade. Gasta pouco:
// três perguntas de uma frase. As sessões ficam em <pasta de dados>\.sessoes-pi.
//
// Uso, no PowerShell, na raiz do repositório (as chaves vêm das variáveis de
// usuário do Windows; o script nunca as imprime):
//   $env:OPENROUTER_API_KEY=[Environment]::GetEnvironmentVariable("OPENROUTER_API_KEY","User")
//   $env:TAVILY_API_KEY=[Environment]::GetEnvironmentVariable("TAVILY_API_KEY","User")
//   node_modules\.bin\tsx scripts\testar-nucleo.ts
//
// Sai com código 1 se alguma conferência falhar.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type EventoNucleo, JanelaPerfil, lerPerfil, pastaSessoes } from "../packages/core/src/index.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const perfil = await lerPerfil(join(raiz, "profiles", "estudos"));
const janela = new JanelaPerfil(perfil);

let falhas = 0;
function conferir(ok: boolean, descricao: string): void {
	console.log(`${ok ? "  OK     " : "  FALHOU "} ${descricao}`);
	if (!ok) falhas++;
}
function titulo(texto: string): void {
	console.log(`\n=== ${texto}`);
}

// Eventos traduzidos, mostrados enquanto chegam.
const respostas: Array<Extract<EventoNucleo, { tipo: "mensagem_assistente" }>> = [];
let custoDosEventos = 0;
let textoAberto = false;
let raciocinio = 0;
janela.assinar((evento) => {
	if (evento.tipo === "texto_delta") {
		if (!textoAberto) process.stdout.write("  [texto_delta...] ");
		textoAberto = true;
		process.stdout.write(evento.delta);
		return;
	}
	if (evento.tipo === "raciocinio_delta") {
		raciocinio += evento.delta.length;
		return;
	}
	if (textoAberto) process.stdout.write("\n");
	textoAberto = false;
	switch (evento.tipo) {
		case "mensagem_assistente":
			respostas.push(evento);
			console.log(
				`  [mensagem_assistente] modelo=${evento.modelo} parada=${evento.motivoParada} texto=${evento.texto.length} car. raciocínio=${evento.raciocinio.length} car. (deltas de raciocínio: ${raciocinio} car.)${evento.erro ? ` ERRO=${evento.erro}` : ""}`,
			);
			raciocinio = 0;
			return;
		case "uso":
			custoDosEventos += evento.custo;
			console.log(
				`  [uso] ${evento.modelo}: ${evento.tokensEntrada} entrada, ${evento.tokensSaida} saída, ${evento.tokensCacheLeitura} lidos do cache; US$ ${evento.custo.toFixed(5)}`,
			);
			return;
		case "ferramenta_inicio":
			console.log(`  [ferramenta_inicio] ${evento.nome} ${JSON.stringify(evento.argumentos).slice(0, 120)}`);
			return;
		case "ferramenta_fim":
			console.log(`  [ferramenta_fim] ${evento.nome} erro=${evento.erro} ${evento.duracaoMs ?? "?"} ms: ${evento.resumo.slice(0, 100)}`);
			return;
		case "estado_sessao":
			console.log(
				`  [estado_sessao] agente=${evento.estado.agente} modelo=${evento.estado.modelo} raciocínio=${evento.estado.raciocinio} sessão=${evento.estado.sessaoId}`,
			);
			return;
		case "diagnostico":
			console.log(`  [diagnostico ${evento.nivel}] ${evento.mensagem}`);
			return;
		case "erro":
			console.log(`  [erro ${evento.origem}] ${evento.mensagem}`);
			return;
		default:
			console.log(`  [${evento.tipo}] ${JSON.stringify({ ...evento, tipo: undefined })}`);
	}
});

async function perguntar(texto: string): Promise<Extract<EventoNucleo, { tipo: "mensagem_assistente" }> | undefined> {
	console.log(`  > ${texto}`);
	const antes = respostas.length;
	const disposicao = await janela.enviar(texto);
	console.log(`  (enviar: ${disposicao})`);
	await janela.aguardarOcioso();
	return respostas.slice(antes).at(-1);
}

try {
	titulo("1. Sessão do professor");
	const estado = await janela.iniciar();
	conferir(estado.agente === "professor", `agente = ${estado.agente}`);
	conferir(estado.modelo === "openrouter/openai/gpt-6.1-sol", `modelo = ${estado.modelo} (raciocínio ${estado.raciocinio})`);
	console.log(`  ferramentas ativas: ${estado.ferramentas.join(", ")}`);
	console.log(`  skills ativas: ${estado.skills.join(", ")}`);
	console.log(`  diagnósticos: ${estado.diagnosticos.length === 0 ? "nenhum" : estado.diagnosticos.map((item) => item.mensagem).join(" | ")}`);

	titulo("2. Prompt de sistema efetivo (resumido)");
	const prompt = janela.promptSistema ?? "";
	const secoes = [...prompt.matchAll(/^<([a-z_]+)>$/gm)].map((achado) => achado[1]);
	console.log(`  ${prompt.length} caracteres; seções: preamble, ${secoes.join(", ")}`);
	console.log(`  preamble: ${prompt.split("\n")[0]}`);
	const addendum = prompt.match(/<addendum>\n([\s\S]*?)\n<\/addendum>/)?.[1] ?? "";
	console.log(`  addendum (${addendum.length} car.): começa com "${addendum.split("\n")[0]}" e termina com "${addendum.trim().split("\n").at(-1)}"`);
	console.log(`  skills no prompt: ${[...prompt.matchAll(/<name>([^<]+)<\/name>/g)].map((achado) => achado[1]).join(", ")}`);
	console.log(`  cwd: ${prompt.match(/<cwd>\n(.*)\n<\/cwd>/)?.[1]}`);
	conferir(prompt.includes("# Instruções do perfil de estudos"), 'contém "# Instruções do perfil de estudos"');
	conferir(prompt.includes("Você é o professor do Breno."), "contém o prompt do agente professor");
	conferir(!prompt.includes("# Regras do projeto"), 'NÃO contém "# Regras do projeto" (AGENTS.md da raiz)');
	conferir(!prompt.includes("Claude Code"), 'NÃO contém "Claude Code"');
	conferir(!secoes.includes("project_context"), "sem seção project_context (nenhum AGENTS.md/CLAUDE.md descoberto)");

	titulo("3. Pergunta ao professor");
	const primeira = await perguntar("Em uma frase: o que é desvio padrão?");
	conferir(!!primeira && primeira.texto.length > 0 && !primeira.erro, "o professor respondeu");
	const primeiraId = janela.estado?.sessaoId ?? "";

	titulo("4. Sessões gravadas");
	const sessoes = await janela.listarSessoes();
	for (const sessao of sessoes.slice(0, 5)) {
		console.log(`  ${sessao.id}  ${sessao.modificadaEm}  agente=${sessao.agente}  ${sessao.mensagens} msg  "${sessao.titulo}"`);
	}
	const gravada = sessoes.find((sessao) => sessao.id === primeiraId);
	conferir(!!gravada, "a sessão aparece na lista");
	conferir(
		!!gravada && gravada.arquivo.startsWith(pastaSessoes(perfil)) && existsSync(gravada.arquivo),
		`arquivo em ${pastaSessoes(perfil)}: ${gravada?.arquivo}`,
	);
	conferir(gravada?.agente === "professor", `agente gravado = ${gravada?.agente}`);

	titulo("5. Troca de modelo para anthropic/claude-sonnet-5.5");
	const comSonnet = await janela.trocarModelo("openrouter/anthropic/claude-sonnet-5.5");
	conferir(comSonnet.modelo === "openrouter/anthropic/claude-sonnet-5.5", `modelo = ${comSonnet.modelo}`);
	const segunda = await perguntar("Em uma frase: o que é variância?");
	conferir(segunda?.modelo === "openrouter/anthropic/claude-sonnet-5.5" && !segunda.erro, `respondeu com ${segunda?.modelo}`);

	titulo("6. Troca para o agente researcher");
	const pesquisador = await janela.trocarAgente("researcher");
	console.log(`  ferramentas ativas: ${pesquisador.ferramentas.join(", ")}; modelo ${pesquisador.modelo}; raciocínio ${pesquisador.raciocinio}`);
	conferir(
		pesquisador.ferramentas.includes("web_search") && pesquisador.ferramentas.includes("web_fetch"),
		"ferramentas web_search e web_fetch ativas",
	);
	conferir(!pesquisador.ferramentas.includes("safe_bash"), "safe_bash não está ativa");
	conferir(
		pesquisador.diagnosticos.some((item) => item.mensagem.includes('"safe_bash"')),
		"aviso de diagnóstico sobre safe_bash",
	);
	conferir(pesquisador.sessaoId === primeiraId, "continua na mesma sessão");
	conferir(janela.historico().length >= 4, `histórico mantido (${janela.historico().length} itens)`);
	const promptPesquisador = janela.promptSistema ?? "";
	conferir(
		promptPesquisador.includes("You are a research specialist") && !promptPesquisador.includes("Você é o professor do Breno."),
		"prompt do researcher no lugar do prompt do professor",
	);

	titulo("7. Reabrir a primeira sessão");
	const nova = await janela.novaSessao();
	conferir(nova.sessaoId !== primeiraId && janela.historico().length === 0, `sessão nova ${nova.sessaoId} vazia`);
	const reaberta = await janela.abrirSessao(primeiraId);
	const historico = janela.historico();
	conferir(reaberta.sessaoId === primeiraId, "abriu a primeira sessão");
	conferir(historico.length >= 4, `histórico voltou (${historico.length} itens)`);
	conferir(reaberta.agente === "researcher", `agente restaurado = ${reaberta.agente}`);
	conferir(reaberta.modelo === "openrouter/z-ai/glm-5.3", `modelo restaurado = ${reaberta.modelo}`);
	const primeiraPergunta = historico.find((item) => item.papel === "usuario");
	console.log(`  primeira pergunta no histórico: "${primeiraPergunta?.papel === "usuario" ? primeiraPergunta.texto : "?"}"`);

	titulo("8. Recarregar");
	const recarregada = await janela.recarregar();
	conferir(recarregada.sessaoId === primeiraId, "mesma sessão depois de recarregar");
	conferir(janela.historico().length === historico.length, `histórico mantido (${janela.historico().length} itens)`);
	conferir(recarregada.agente === "researcher" && recarregada.modelo === "openrouter/z-ai/glm-5.3", "agente e modelo mantidos");
	const terceira = await perguntar("Sem usar ferramentas, responda em uma frase: qual foi a minha primeira pergunta nesta conversa?");
	conferir(!!terceira && !terceira.erro && /desvio/i.test(terceira.texto), "a conversa continua (lembrou da primeira pergunta)");

	titulo("9. Custo");
	const estatisticas = janela.sessaoPi?.getSessionStats();
	console.log(`  soma dos eventos "uso": US$ ${custoDosEventos.toFixed(5)}`);
	console.log(
		`  estatísticas da sessão ${primeiraId}: US$ ${estatisticas?.cost.toFixed(5)}, ${estatisticas?.tokens.total} tokens, ${estatisticas?.assistantMessages} respostas`,
	);
} catch (erro) {
	falhas++;
	console.error("\nErro:", erro instanceof Error ? erro.message : erro);
} finally {
	await janela.descartar();
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} conferência(s) falharam.`);
process.exitCode = falhas === 0 ? 0 : 1;
