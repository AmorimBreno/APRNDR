#!/usr/bin/env node
/**
 * Prova cega do professor.
 *
 * Manda o mesmo pedido de aula para vários modelos do OpenRouter e grava as
 * respostas em vault/comparacao/<tema>/ com nomes A, B, C..., sem dizer qual
 * modelo escreveu qual. O gabarito (letra -> modelo, custo, tokens) fica em
 * extras/prova-cega/gabarito-<tema>.json, fora do vault e fora do git.
 *
 * O pedido junta o que o professor do pi recebe (skill teach + APPEND_SYSTEM)
 * com um aluno simulado cuja sondagem já foi feita. Não há ferramentas: o
 * quiz é escrito como texto. O que se compara é a qualidade da explicação.
 *
 * Uso (no WSL, a partir da raiz do repositório, com OPENROUTER_API_KEY definida):
 *   node extras/prova-cega/prova-cega.mjs
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMA = "r2-ajustado";
const MODELOS = ["openai/gpt-6.1-sol", "z-ai/glm-5.3", "deepseek/deepseek-v4-pro-0813"];

const chave = process.env.OPENROUTER_API_KEY;
if (!chave) {
	console.error("OPENROUTER_API_KEY não está definida. Veja docs/instalacao.md, passo 2.");
	process.exit(1);
}

const skillTeach = readFileSync(join(RAIZ, "vault/.pi/skills/teach/SKILL.md"), "utf8");
const appendSystem = readFileSync(join(RAIZ, "vault/.pi/APPEND_SYSTEM.md"), "utf8");

const sistema = `You are a teacher. Your output is rendered as markdown in Obsidian (LaTeX and mermaid render natively).

In this session the interactive tools (quiz, ask_user_question, subagents) are NOT available. Whenever the skill tells you to use \`quiz\`, write the question as plain markdown instead: the question, then options labeled a), b), c)... Do not reveal the answer or the explanation.

<skill name="teach">
${skillTeach}
</skill>

${appendSystem}`;

const pedido = `Quero entender R² ajustado.

Contexto sobre mim: sou o Breno, estudante de Engenharia de Computação no Instituto Mauá e estagiário full-stack (React e TypeScript). Estou fazendo uma disciplina de Ciência de Dados. Minha maior dificuldade com explicações de IA é quando elas são diretas demais ou pulam passos do raciocínio: eu me perco nesses saltos.

A Fase 1 (sondagem) já foi feita. Resultado:

- Média, variância e soma dos quadrados: acertei tudo, inclusive calcular a variância de um conjunto pequeno à mão.
- Regressão linear: sei que a reta minimiza a soma dos quadrados dos resíduos; acertei o que é um resíduo; acertei interpretar o coeficiente angular.
- R²: sei a frase "fração da variância explicada pelo modelo" e acertei que $R^2 = 1$ significa ajuste perfeito. Errei a pergunta "o que acontece com o R² quando você adiciona uma variável explicativa que é puro ruído?" (respondi que ele cai). Marquei "Não sei" em "por que ele nunca cai?".
- Graus de liberdade: marquei "Não sei" na pergunta básica (por que a variância amostral divide por $n-1$).
- Objetivo (resposta no ask_user_question): entender por que o R² ajustado existe e como interpretar um R² ajustado numa saída de regressão do meu curso, para escolher entre modelos com números diferentes de variáveis.

Faça agora a Fase 2 (o plano em prosa e o mapa de dependências em mermaid). Depois, considere que eu aprovei o plano e ensine o primeiro nó completo, seguindo o loop da Fase 3 (motivar, estabelecer, conectar), terminando com a pergunta de checagem do nó escrita como texto.`;

async function perguntar(modelo) {
	const inicio = Date.now();
	const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
		body: JSON.stringify({
			model: modelo,
			messages: [
				{ role: "system", content: sistema },
				{ role: "user", content: pedido },
			],
			// Sem max_tokens o OpenRouter reserva o máximo do modelo (até 131 mil
			// tokens) e recusa o pedido se o saldo não cobrir essa reserva.
			max_tokens: 16000,
			reasoning: { effort: "medium" },
			usage: { include: true },
		}),
	});
	if (!res.ok) {
		throw new Error(`${modelo}: OpenRouter respondeu ${res.status}: ${(await res.text()).slice(0, 500)}`);
	}
	const dados = await res.json();
	const segundos = Math.round((Date.now() - inicio) / 1000); // depois do corpo inteiro chegar
	const texto = dados.choices?.[0]?.message?.content ?? "";
	if (!texto.trim()) throw new Error(`${modelo}: resposta vazia`);
	return { modelo, texto, segundos, uso: dados.usage ?? null, provedor: dados.provider ?? null };
}

// Sorteia as letras para ninguém (nem o Breno) saber a ordem de antemão.
const embaralhados = [...MODELOS].sort(() => Math.random() - 0.5);
const letras = embaralhados.map((_, i) => String.fromCharCode(65 + i));

console.log(`Perguntando a ${MODELOS.length} modelos em paralelo (pode levar alguns minutos)...`);
const resultados = await Promise.allSettled(embaralhados.map(perguntar));

const pasta = join(RAIZ, "vault/comparacao", TEMA);
mkdirSync(pasta, { recursive: true });
const gabarito = { tema: TEMA, data: new Date().toISOString(), respostas: {} };
let custoTotal = 0;

resultados.forEach((r, i) => {
	const letra = letras[i];
	if (r.status === "rejected") {
		console.error(`Resposta ${letra} falhou: ${r.reason?.message ?? r.reason}`);
		gabarito.respostas[letra] = { modelo: embaralhados[i], erro: String(r.reason?.message ?? r.reason) };
		return;
	}
	const { modelo, texto, segundos, uso, provedor } = r.value;
	writeFileSync(join(pasta, `resposta-${letra}.md`), `# Resposta ${letra}\n\n${texto}\n`, "utf8");
	custoTotal += uso?.cost ?? 0;
	gabarito.respostas[letra] = { modelo, provedor, segundos, uso };
	console.log(`Resposta ${letra} gravada (${segundos}s).`);
});

const letrasOk = Object.keys(gabarito.respostas).filter((l) => !gabarito.respostas[l].erro);
if (letrasOk.length === 0) {
	rmSync(pasta, { recursive: true, force: true });
	console.error("\nNenhum modelo respondeu. Nada foi gravado.");
	process.exit(1);
}
writeFileSync(
	join(pasta, "avaliacao.md"),
	`# Prova cega: ${TEMA}

Leia as respostas ${letrasOk.map((l) => `[[resposta-${l}|${l}]]`).join(", ")}. Todas receberam o mesmo pedido: o plano da aula e o primeiro nó, para um aluno simulado (você) aprendendo R² ajustado.

Perguntas para guiar a leitura:

- Em algum momento você se perdeu? Onde?
- Algum passo foi pulado ou apareceu do nada?
- O mapa em mermaid faz sentido como ordem de ensino?
- A pergunta de checagem testa o que foi ensinado?

## Sua ordem (da melhor para a pior)

1.
2.
3.

## Comentários

`,
	"utf8",
);

const arqGabarito = join(RAIZ, "extras/prova-cega", `gabarito-${TEMA}.json`);
writeFileSync(arqGabarito, JSON.stringify(gabarito, null, 2), "utf8");
console.log(`\nPronto. Respostas em vault/comparacao/${TEMA}/. Custo total: US$ ${custoTotal.toFixed(4)}.`);
console.log("O gabarito (qual letra é qual modelo) está em extras/prova-cega/. Não abra antes de avaliar.");
