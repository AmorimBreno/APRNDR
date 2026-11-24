// Teste real dos planos de estudos (docs/planos-de-estudo.md, Fase 2), pelo
// núcleo e pela extensão de verdade, com o professor de verdade (OpenRouter).
// Tudo numa pasta de dados TEMPORÁRIA, com uma matéria criada aqui: nunca lê
// nem grava a pasta de dados do Breno. O perfil é o de estudos, sem o serviço
// de materiais (para não indexar nada).
//
// O roteiro: (1) pedir um plano para a prova com os temas do Breno e responder
// as perguntas do professor até ele criar o plano; (2) pedir para começar e,
// depois da explicação, dizer que entendeu, esperando que ele marque o item 1;
// (3) numa conversa nova, seguir o plano pela ponte (como o seletor faz) e
// conferir que ele retoma pelo primeiro item não marcado.
//
// Uso, na raiz do repositório (as chaves vêm das variáveis do Windows):
//   pnpm exec tsx scripts/testar-plano.ts
// Sai com código 1 se alguma conferência falhar. Custa algumas chamadas ao GPT-6.1 Sol.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { carregarChaves } from "../apps/server/src/chaves.ts";
import { type EventoNucleo, JanelaPerfil, lerPerfil } from "../packages/core/src/index.ts";
import { criarMateria } from "../profiles/estudos/lib/materias.ts";
import { listarNotas } from "../profiles/estudos/lib/notas.ts";
import { lerPlano, PAINEL_PLANOS, TIPO_MENSAGEM_PLANO } from "../profiles/estudos/lib/plano-tipos.ts";
import { contextoDaMateria } from "../profiles/estudos/paineis/src/comum.ts";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chaves = carregarChaves(["OPENROUTER_API_KEY", "TAVILY_API_KEY"]);
if (chaves.OPENROUTER_API_KEY === "ausente") throw new Error("Configure OPENROUTER_API_KEY nas variáveis de ambiente do Windows.");

let falhas = 0;
const conferir = (ok: boolean, descricao: string) => {
	console.log(`${ok ? "  OK     " : "  FALHOU "} ${descricao}`);
	if (!ok) falhas++;
};

const dados = await mkdtemp(join(tmpdir(), "estudos-testar-plano-"));
const perfilReal = await lerPerfil(join(raiz, "profiles", "estudos"));
const { materiais: _semMateriais, ...semMateriais } = perfilReal;
const perfil = { ...semMateriais, pastaDados: dados };
const janela = new JanelaPerfil(perfil);
let custo = 0;
const ferramentas: string[] = [];
let ultimaResposta = "";

janela.assinar((evento: EventoNucleo) => {
	switch (evento.tipo) {
		case "uso":
			custo += evento.custo;
			return;
		case "ferramenta_inicio":
			ferramentas.push(evento.nome);
			console.log(`  [ferramenta] ${evento.nome} ${JSON.stringify(evento.argumentos).slice(0, 160)}`);
			return;
		case "mensagem_assistente":
			if (evento.texto.trim()) ultimaResposta = evento.texto;
			return;
		case "pedido_interface":
			// O professor perguntou pelo ask_user_question (ou um quiz): responde como o Breno responderia.
			console.log(`  [pedido] ${evento.painel}/${evento.acao}: respondendo`);
			janela.responder(evento.id, { escolhas: [], outra: "Não sei nada ainda de nenhum tema. Pode criar o plano com esses temas, na ordem.", texto: "Não sei nada ainda de nenhum tema. Pode criar o plano com esses temas, na ordem." });
			return;
		case "diagnostico":
			console.log(`  [diagnostico ${evento.nivel}] ${evento.mensagem}`);
			return;
		case "erro":
			console.log(`  [erro ${evento.origem}] ${evento.mensagem}`);
			return;
		default:
	}
});

async function falar(texto: string): Promise<string> {
	console.log(`\n> ${texto.slice(0, 140)}`);
	ultimaResposta = "";
	await janela.enviar(texto);
	await janela.aguardarOcioso();
	console.log(`  < ${ultimaResposta.replace(/\s+/g, " ").slice(0, 300)}…`);
	return ultimaResposta;
}

const planosDaMateria = async (materiaId: string) => (await listarNotas(dados, materiaId)).notas.filter((nota) => nota.plano);

try {
	const materia = await criarMateria(dados, { nome: "Ciência de Dados" });
	await janela.iniciar();
	await janela.novaSessao(undefined, contextoDaMateria(materia));

	// (1) Criar o plano.
	await falar(
		[
			"Quero montar um plano de estudos nesta conversa. A prova final é no dia 26/11. O professor disse que cai:",
			"Parte escrita: 1) os passos dos algoritmos K-médias e Clusterização Hierárquica (construção do dendrograma); 2) as diferenças entre seleção de features e a redução de dimensionalidade por PCA; 3) conceito de curva ROC; 4) diferenças entre word embedding e outros esquemas de vetorização de textos.",
			"Parte prática: seleção de modelo de classificação com StratifiedKFold e AUC-ROC multiclasse; clusterização com k-means e HCluster; os mesmos modelos com PCA; discussão dos resultados, incluindo a acurácia da clusterização.",
		].join("\n"),
	);
	for (let tentativa = 0; tentativa < 3 && !ferramentas.includes("criar_plano"); tentativa++) {
		await falar("Não sei nada ainda de nenhum tema. Pode criar o plano com esses temas, na ordem.");
	}
	conferir(ferramentas.includes("criar_plano"), "o professor chamou criar_plano");
	const planos = await planosDaMateria(materia.id);
	conferir(planos.length === 1, `uma nota de plano na matéria (${planos.map((p) => p.titulo).join(", ")})`);
	const titulo = planos[0]?.titulo ?? "";
	const arquivo = join(dados, "materias", materia.id, "notas", `${titulo}.md`);
	const lerArquivo = async () => lerPlano(await readFile(arquivo, "utf8"));
	const criado = await lerArquivo();
	conferir(Boolean(criado && criado.total >= 4), `o plano tem itens (${criado?.total ?? 0})`);
	conferir(Boolean(criado && criado.conversas.length === 1), "a conversa entrou no histórico do plano");

	// (2) A aula e a marcação.
	if (!ultimaResposta.toLowerCase().includes("k-m") && !ultimaResposta.toLowerCase().includes("cluster")) await falar("Pode começar.");
	await falar("Entendi os passos do k-means e do dendrograma. Pode marcar e passar para o próximo tema.");
	const depoisDaAula = await lerArquivo();
	conferir(Boolean(depoisDaAula?.itens[0]?.feito), "o item 1 ficou marcado");
	const sessao1 = janela.estado?.sessaoId ?? "";

	// (3) Conversa nova seguindo o plano, como o seletor faz.
	await janela.novaSessao(undefined, contextoDaMateria(materia));
	const sessao2 = janela.estado?.sessaoId ?? "";
	conferir(sessao2 !== "" && sessao2 !== sessao1, "abriu uma conversa nova");
	janela.acaoDaInterface(PAINEL_PLANOS, "seguir", { materia: materia.id, titulo, sessao: sessao2, pedido: "teste-1" });
	await new Promise((pronto) => setTimeout(pronto, 500));
	const retomada = await falar(`Vamos seguir o plano "${titulo}".`);
	const item2 = depoisDaAula?.itens.find((item) => !item.feito)?.texto ?? "";
	const palavra = item2.split(/[\s—-]+/).find((parte) => parte.length > 5) ?? item2;
	conferir(retomada.toLowerCase().includes(palavra.toLowerCase()) || ferramentas.includes("quiz"), `retomou pelo item não marcado (${item2.slice(0, 60)})`);
	const final = await lerArquivo();
	conferir(Boolean(final && final.conversas.length === 2), "a conversa nova entrou no histórico");
	const sessaoArquivo = (await janela.listarSessoes()).find((s) => s.id === sessao2);
	conferir(Boolean(sessaoArquivo), "a conversa nova foi gravada");
	// A mensagem escondida é uma entrada custom_message com o customType do plano (a entrada "custom" tem o mesmo nome).
	const linhasSessao = (await readFile(sessaoArquivo?.arquivo ?? "", "utf8").catch(() => "")).split("\n").filter(Boolean).map((linha) => JSON.parse(linha) as { type?: string; customType?: string });
	conferir(linhasSessao.some((linha) => linha.type === "custom_message" && linha.customType === TIPO_MENSAGEM_PLANO), "o resumo do plano foi gravado na sessão (mensagem escondida)");
	conferir(linhasSessao.some((linha) => linha.type === "custom" && linha.customType === "estudos.plano"), "a conversa nova guarda o plano seguido (entrada da sessão)");
	if (process.env.MANTER) console.log(`\nSessão 2: ${sessaoArquivo?.arquivo}\n${linhasSessao.map((l) => `${l.type}${l.customType ? `:${l.customType}` : ""}`).join(" | ")}`);
	console.log(`\nArquivo final do plano:\n${await readFile(arquivo, "utf8")}`);
} finally {
	console.log(`\nCusto total: US$ ${custo.toFixed(4)}`);
	await janela.descartar().catch(() => {});
	if (process.env.MANTER) console.log(`Pasta mantida: ${dados}`);
	else await rm(dados, { recursive: true, force: true }).catch(() => {});
}
if (falhas > 0) {
	console.log(`\n${falhas} conferência(s) falharam.`);
	process.exit(1);
}
console.log("\nTudo certo.");
