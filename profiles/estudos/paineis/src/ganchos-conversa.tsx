// Os ganchos que a mesa entrega à conversa embutida (parte C1, WP3; docs/mesa-parte-c.md, seção 5):
// - rodapeDaResposta: "Ir ao trecho", só no último item de assistente do turno e só se a pergunta
//   apontou um trecho de uma aba desta matéria (guardar-na-nota.ts decide);
// - acoesDoBloco: "Guardar na nota" em cada bloco de primeiro nível da resposta pronta.
// O núcleo (packages/ui) só chama os ganchos: nota, lição e "guardar" ficam aqui.
//
// Os dois devolvem componentes (não conteúdo pronto): eles rodam dentro da árvore da mesa e leem os
// contextos dela (useMesa, useVendo). Fora da mesa o rodapé não aparece (useMesa() é undefined).

import { Button } from "@estudos/design-system";
import type { ItemAssistenteConversa, ItemUsuarioConversa, JanelaPerfilHook, PropsConversaEmbutida } from "@estudos/ui";
import { type ReactNode, useCallback, useRef } from "react";
import { type AlvoIrAoTrecho, alvoDoIrAoTrecho, ultimaRespostaDoTurno } from "./guardar-na-nota.ts";
import { GuardarNaNota } from "./GuardarNaNota.tsx";
import { useMesa } from "./mesa-ir.ts";

/** "Ir ao trecho": leva à aba e ao trecho de onde a pergunta saiu, pela porta única da mesa (irPara). */
export function RodapeIrAoTrecho({ alvo }: { alvo: AlvoIrAoTrecho }) {
	const mesa = useMesa();
	if (!mesa) return null;
	return (
		<Button
			size="sm"
			variant="ghost"
			icon="arrow-up-right"
			title="Voltar ao trecho de onde a pergunta saiu"
			onClick={() => mesa.irPara({ origem: alvo.origem, ...(alvo.trecho ? { trecho: alvo.trecho } : {}), quem: "usuario" })}
		>
			Ir ao trecho
		</Button>
	);
}

export interface EntradaGanchos {
	/** A janela do perfil: a conversa (para saber a última resposta do turno), a sessão e a ponte. */
	janela: JanelaPerfilHook;
	materiaId: string;
	/** A chave da aba em foco de agora (a mesa guarda numa ref; é lida na hora do clique). */
	chaveFoco(): string | undefined;
}

export interface GanchosDaConversa {
	rodapeDaResposta(resposta: ItemAssistenteConversa, perguntaAnterior?: ItemUsuarioConversa): ReactNode;
	acoesDoBloco: NonNullable<PropsConversaEmbutida["acoesDoBloco"]>;
}

/** Os ganchos da conversa embutida da mesa. Passe os dois à conversa (`rodapeDaResposta` e `acoesDoBloco`). */
export function useGanchosDaConversa({ janela, materiaId, chaveFoco }: EntradaGanchos): GanchosDaConversa {
	const chaveFocoRef = useRef(chaveFoco);
	chaveFocoRef.current = chaveFoco;
	const lerFoco = useCallback(() => chaveFocoRef.current(), []);
	return {
		rodapeDaResposta: (resposta, perguntaAnterior) => {
			if (!ultimaRespostaDoTurno(janela.estado.conversa, resposta.chave, janela.estado.executando)) return null;
			const alvo = alvoDoIrAoTrecho(perguntaAnterior, materiaId);
			return alvo ? <RodapeIrAoTrecho alvo={alvo} /> : null;
		},
		acoesDoBloco: (fonte) => <GuardarNaNota fonte={fonte} janela={janela} materiaId={materiaId} chaveFoco={lerFoco} />,
	};
}
