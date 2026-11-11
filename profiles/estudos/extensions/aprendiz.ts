// A memória do aprendiz no perfil de estudos (item 9, parte A; docs/aprendiz.md, seção 7). Arquivo do
// projeto, não do learn. O cálculo e o disco ficam em ../lib/aprendiz.ts e ../lib/aprendiz-indicadores-tipos.ts;
// aqui fica só a ponte com a tela (painel "aprendiz", docs/ponte-de-eventos.md): a tela manda
// "interface:acao" `indicadores` e a extensão responde com "interface:mostrar" `indicadores`
// ({ indicadores }) ou `erro` ({ mensagem }), as duas passageiras (gravar: false). Nesta parte a extensão
// não grava nada na pasta de dados: só lê os eventos e os arquivos das matérias, e guarda o cache dos
// indicadores fora dela (%LOCALAPPDATA%\estudos-app\aprendiz). As leituras passam por uma fila só, para
// não calcular duas vezes ao mesmo tempo.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { indicadoresDoAprendiz, PAINEL_APRENDIZ, pastaCacheAprendiz } from "../lib/aprendiz.ts";

/** Onde o cache fica; os testes passam uma pasta temporária. */
export interface OpcoesAprendiz {
	pastaCache?: string;
}

const textoOuNada = (valor: unknown) => (typeof valor === "string" ? valor : undefined);

export function montarAprendiz(pi: ExtensionAPI, opcoes: OpcoesAprendiz = {}): void {
	let pastaDados: string | undefined;
	/** A fila das leituras: cada uma espera a anterior, mesmo que ela tenha falhado. */
	let fila: Promise<unknown> = Promise.resolve();

	const mostrar = (acao: "indicadores" | "erro", dados: Record<string, unknown>) => pi.events.emit("interface:mostrar", { painel: PAINEL_APRENDIZ, acao, dados, gravar: false });

	const naFila = (tarefa: () => Promise<void>) => {
		const proxima = fila.then(tarefa, tarefa);
		fila = proxima.catch(() => undefined);
	};

	pi.on("session_start", (_evento, ctx) => {
		pastaDados = ctx.cwd;
	});

	pi.events.on("interface:acao", (recebido) => {
		const { painel, acao, dados: bruto } = recebido as { painel?: string; acao?: string; dados?: unknown };
		if (painel !== PAINEL_APRENDIZ || acao !== "indicadores") return;
		// Sem session_start, esta cópia não é a da sessão: ao recarregar o código, o núcleo carrega as
		// extensões uma vez a mais (montagem.ts), e essa carga continua ouvindo o barramento. Ela fica calada.
		const dados = pastaDados;
		if (!dados) return;
		const pedido = textoOuNada((bruto as { pedido?: unknown } | undefined)?.pedido);
		const eco = pedido ? { pedido } : {};
		naFila(async () => {
			try {
				const indicadores = await indicadoresDoAprendiz(dados, opcoes.pastaCache ?? pastaCacheAprendiz());
				mostrar("indicadores", { indicadores, ...eco });
			} catch (erro) {
				mostrar("erro", { mensagem: `Não consegui calcular os indicadores do aprendiz: ${(erro as Error).message}`, ...eco });
			}
		});
	});
}

export default function aprendizExtensao(pi: ExtensionAPI) {
	montarAprendiz(pi);
}
