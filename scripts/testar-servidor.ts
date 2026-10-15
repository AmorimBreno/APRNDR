// Verificação da tarefa 2.4 com o servidor de verdade e chamadas reais ao
// modelo, pelo WebSocket e pelo proxy do Vite (ws://localhost:7430/ws). Gasta
// pouco: uma pergunta de uma frase.
//
// Uso, com o pnpm dev rodando, na raiz do repositório:
//   node_modules\.bin\tsx scripts\testar-servidor.ts
//     abre o perfil estudos, manda uma pergunta, lista as sessões, troca o
//     modelo e testa o watcher (muda só a data do profiles/estudos/AGENTS.md).
//     No fim imprime o id da sessão.
//   node_modules\.bin\tsx scripts\testar-servidor.ts --reabrir <sessaoId>
//     reabre o perfil com essa sessão (depois de o servidor reiniciar) e
//     confere que o histórico volta.
//
// O script não precisa das chaves: quem chama o modelo é o servidor.
// Sai com código 1 se alguma conferência falhar.

import { utimes } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventoNucleo } from "../packages/core/src/eventos.ts";
import type { MensagemCliente, MensagemServidor } from "../packages/core/src/protocolo.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENDERECO = "ws://localhost:7430/ws";
const PERFIL = "estudos";
const MODELO_NOVO = "openrouter/anthropic/claude-sonnet-5.5";

let falhas = 0;
function conferir(ok: boolean, descricao: string): void {
	console.log(`${ok ? "  OK     " : "  FALHOU "} ${descricao}`);
	if (!ok) falhas++;
}
function titulo(texto: string): void {
	console.log(`\n=== ${texto}`);
}

// --- Conexão ------------------------------------------------------------------------

const socket = new WebSocket(ENDERECO);
const recebidas: MensagemServidor[] = [];
const esperas: Array<{ teste: (mensagem: MensagemServidor) => boolean; resolver: (mensagem: MensagemServidor) => void }> = [];

socket.addEventListener("message", (evento) => {
	const mensagem = JSON.parse(String(evento.data)) as MensagemServidor;
	recebidas.push(mensagem);
	mostrar(mensagem);
	for (const espera of [...esperas]) {
		if (espera.teste(mensagem)) {
			esperas.splice(esperas.indexOf(espera), 1);
			espera.resolver(mensagem);
		}
	}
});

let textoAberto = false;
function mostrar(mensagem: MensagemServidor): void {
	if (mensagem.tipo === "evento" && mensagem.evento.tipo === "texto_delta") {
		if (!textoAberto) process.stdout.write("  [texto_delta...] ");
		textoAberto = true;
		process.stdout.write(mensagem.evento.delta);
		return;
	}
	if (mensagem.tipo === "evento" && mensagem.evento.tipo === "raciocinio_delta") return;
	if (textoAberto) process.stdout.write("\n");
	textoAberto = false;
	console.log(`  <- ${descrever(mensagem)}`);
}

function descrever(mensagem: MensagemServidor): string {
	switch (mensagem.tipo) {
		case "evento":
			return `evento ${descreverEvento(mensagem.evento)}`;
		case "historico":
			return `historico (${mensagem.itens.length} itens: ${mensagem.itens.map((item) => item.papel).join(", ")})`;
		case "resposta":
			return `resposta ${mensagem.pedido} pedidoId=${mensagem.pedidoId} ok=${mensagem.ok}${mensagem.ok ? "" : ` erro=${mensagem.erro}`}`;
		default:
			return JSON.stringify(mensagem);
	}
}

function descreverEvento(evento: EventoNucleo): string {
	switch (evento.tipo) {
		case "estado_sessao":
			return `estado_sessao sessao=${evento.estado.sessaoId} agente=${evento.estado.agente} modelo=${evento.estado.modelo}`;
		case "mensagem_assistente":
			return `mensagem_assistente modelo=${evento.modelo} parada=${evento.motivoParada} texto=${evento.texto.length} car.`;
		case "uso":
			return `uso ${evento.modelo} ${evento.tokensEntrada}+${evento.tokensSaida} tokens, US$ ${evento.custo.toFixed(5)}`;
		case "mensagem_usuario":
			return `mensagem_usuario (${evento.texto.length} car.)`;
		default:
			return JSON.stringify(evento);
	}
}

function esperar(teste: (mensagem: MensagemServidor) => boolean, limiteMs: number, descricao: string): Promise<MensagemServidor> {
	return new Promise((resolver, rejeitar) => {
		const espera = { teste, resolver: (mensagem: MensagemServidor) => (clearTimeout(limite), resolver(mensagem)) };
		const limite = setTimeout(() => {
			esperas.splice(esperas.indexOf(espera), 1);
			rejeitar(new Error(`tempo esgotado esperando ${descricao}`));
		}, limiteMs);
		esperas.push(espera);
	});
}

/** Fecha a conexão e espera o fechamento (sair antes deixa o proxy do Vite com ECONNRESET). */
function fechar(): Promise<void> {
	return new Promise((resolver) => {
		socket.addEventListener("close", () => resolver(), { once: true });
		socket.close(1000);
		setTimeout(resolver, 2000);
	});
}

let contador = 0;
async function pedir(mensagem: MensagemCliente, limiteMs = 60_000) {
	const pedidoId = `p${++contador}`;
	const resposta = esperar((recebida) => recebida.tipo === "resposta" && recebida.pedidoId === pedidoId, limiteMs, `a resposta de ${mensagem.tipo}`);
	console.log(`  -> ${mensagem.tipo} ${pedidoId}`);
	socket.send(JSON.stringify({ ...mensagem, pedidoId }));
	return (await resposta) as Extract<MensagemServidor, { tipo: "resposta" }>;
}

await new Promise<void>((resolver, rejeitar) => {
	socket.addEventListener("open", () => resolver(), { once: true });
	socket.addEventListener("error", () => rejeitar(new Error(`não conectou em ${ENDERECO}; o pnpm dev está rodando?`)), { once: true });
});
console.log(`Conectado em ${ENDERECO}`);

// --- Modo reabrir -------------------------------------------------------------------------

const indiceReabrir = process.argv.indexOf("--reabrir");
if (indiceReabrir >= 0) {
	const sessaoId = process.argv[indiceReabrir + 1];
	if (!sessaoId) throw new Error("uso: --reabrir <sessaoId>");
	titulo(`Reabrir o perfil com a sessão ${sessaoId}`);
	const inicio = recebidas.length;
	const resposta = await pedir({ tipo: "abrir_perfil", perfil: PERFIL, sessaoId }, 120_000);
	const depois = recebidas.slice(inicio);
	conferir(resposta.ok, "abrir_perfil com o sessaoId anterior respondeu ok");
	conferir(depois.some((mensagem) => mensagem.tipo === "carregando"), "recebeu carregando (a janela foi criada de novo)");
	const historico = depois.find((mensagem) => mensagem.tipo === "historico");
	const itens = historico?.tipo === "historico" ? historico.itens : [];
	conferir(itens.some((item) => item.papel === "usuario") && itens.some((item) => item.papel === "assistente"), `o histórico voltou (${itens.length} itens)`);
	conferir(resposta.ok && (resposta.dados as { sessaoId?: string }).sessaoId === sessaoId, "a sessão aberta é a mesma");
	socket.close();
	console.log(falhas ? `\n${falhas} conferência(s) falharam.` : "\nTudo certo.");
	process.exit(falhas ? 1 : 0);
}

// --- 1. Abrir o perfil ---------------------------------------------------------------------

titulo("1. Abrir o perfil estudos");
// Se a janela já está aberta (outra conexão, outro teste), esta conexão entra
// na conversa dela sem "carregando"; aí o teste pede uma sessão nova.
const listaPerfis = (await (await fetch("http://localhost:7430/api/perfis")).json()) as { perfis: Array<{ id: string; aberto: boolean }> };
const jaAberto = listaPerfis.perfis.find((perfil) => perfil.id === PERFIL)?.aberto ?? false;
console.log(`  janela do perfil já aberta no servidor: ${jaAberto}`);
let inicio = recebidas.length;
let aberto = await pedir({ tipo: "abrir_perfil", perfil: PERFIL }, 120_000);
conferir(aberto.ok, "abrir_perfil respondeu ok");
if (jaAberto) {
	const comHistorico = recebidas.slice(inicio);
	conferir(comHistorico.some((mensagem) => mensagem.tipo === "historico"), "entrou na conversa aberta e recebeu o historico");
	inicio = recebidas.length;
	aberto = await pedir({ tipo: "nova_sessao", perfil: PERFIL }, 120_000);
	conferir(aberto.ok, "nova_sessao respondeu ok");
}
let depois = recebidas.slice(inicio);
const indiceCarregando = depois.findIndex((mensagem) => mensagem.tipo === "carregando");
const indiceHistorico = depois.findIndex((mensagem) => mensagem.tipo === "historico");
conferir(indiceCarregando >= 0, "recebeu carregando");
conferir(indiceHistorico > indiceCarregando, "recebeu historico depois do carregando");
const sessaoId = aberto.ok ? (aberto.dados as { sessaoId: string }).sessaoId : "";
console.log(`  sessão: ${sessaoId}`);

// --- 2. Mandar uma pergunta ---------------------------------------------------------------

titulo("2. Pergunta de uma frase, eventos até execucao_fim");
inicio = recebidas.length;
const fim = esperar((mensagem) => mensagem.tipo === "evento" && mensagem.evento.tipo === "execucao_fim", 180_000, "execucao_fim");
const enviado = await pedir({ tipo: "enviar", perfil: PERFIL, texto: "Em uma frase: o que é média aritmética?" });
conferir(enviado.ok && enviado.dados === "iniciada", "enviar respondeu iniciada");
await fim;
depois = recebidas.slice(inicio);
const eventos = depois.flatMap((mensagem) => (mensagem.tipo === "evento" ? [mensagem.evento] : []));
conferir(eventos.some((evento) => evento.tipo === "execucao_inicio"), "recebeu execucao_inicio");
conferir(eventos.some((evento) => evento.tipo === "texto_delta"), "recebeu texto_delta");
// A primeira mensagem do assistente pode ser só uma chamada de ferramenta (parada toolUse); vale a final.
const respostas = eventos.flatMap((evento) => (evento.tipo === "mensagem_assistente" ? [evento] : []));
const final = respostas.at(-1);
conferir(Boolean(final && final.texto.length > 0 && !final.erro && respostas.every((item) => !item.erro)), "recebeu mensagem_assistente final com texto e sem erro");

// --- 3. Listar as sessões --------------------------------------------------------------------

titulo("3. Listar as sessões");
const lista = await pedir({ tipo: "listar_sessoes", perfil: PERFIL });
const sessoes = lista.ok ? (lista.dados as Array<{ id: string; titulo: string; mensagens: number }>) : [];
const desta = sessoes.find((sessao) => sessao.id === sessaoId);
console.log(`  ${sessoes.length} sessões; esta: ${JSON.stringify(desta)}`);
conferir(Boolean(desta), "a sessão nova aparece na lista");

// --- 4. Trocar o modelo ------------------------------------------------------------------------

titulo(`4. Trocar o modelo para ${MODELO_NOVO}`);
const estadoNovo = esperar(
	(mensagem) => mensagem.tipo === "evento" && mensagem.evento.tipo === "estado_sessao" && mensagem.evento.estado.modelo === MODELO_NOVO,
	30_000,
	"estado_sessao com o modelo novo",
);
const troca = await pedir({ tipo: "trocar_modelo", perfil: PERFIL, modelo: MODELO_NOVO });
conferir(troca.ok, "trocar_modelo respondeu ok");
await estadoNovo.then(
	() => conferir(true, "estado_sessao mostra o modelo novo"),
	() => conferir(false, "estado_sessao mostra o modelo novo"),
);

// --- 5. Watcher ------------------------------------------------------------------------------------

titulo("5. Watcher: mudar só a data de profiles/estudos/AGENTS.md");
inicio = recebidas.length;
const recarregado = esperar(
	(mensagem) => mensagem.tipo === "perfil_recarregado" && mensagem.motivo === "arquivo",
	60_000,
	"perfil_recarregado",
);
const agora = new Date();
await utimes(join(raiz, "profiles", "estudos", "AGENTS.md"), agora, agora);
try {
	const mensagem = await recarregado;
	conferir(true, `perfil_recarregado: ${JSON.stringify(mensagem)}`);
	conferir(mensagem.tipo === "perfil_recarregado" && Boolean(mensagem.arquivos?.includes("AGENTS.md")), "a lista de arquivos tem AGENTS.md");
} catch (erro) {
	conferir(false, (erro as Error).message);
}
await new Promise((resolver) => setTimeout(resolver, 1000));
depois = recebidas.slice(inicio);
const historicoNovo = depois.find((mensagem) => mensagem.tipo === "historico");
const itens = historicoNovo?.tipo === "historico" ? historicoNovo.itens : [];
conferir(itens.some((item) => item.papel === "usuario") && itens.some((item) => item.papel === "assistente"), `novo historico com a conversa mantida (${itens.length} itens)`);
const estadoDepois = depois.findLast((mensagem) => mensagem.tipo === "evento" && mensagem.evento.tipo === "estado_sessao");
conferir(
	estadoDepois?.tipo === "evento" && estadoDepois.evento.tipo === "estado_sessao" && estadoDepois.evento.estado.sessaoId === sessaoId,
	"mesma sessão depois de recarregar",
);
const recargas = depois.filter((mensagem) => mensagem.tipo === "perfil_recarregado").length;
conferir(recargas === 1, `uma recarga só (${recargas})`);

socket.close();
console.log(`\nSessão usada: ${sessaoId}`);
console.log(falhas ? `\n${falhas} conferência(s) falharam.` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
