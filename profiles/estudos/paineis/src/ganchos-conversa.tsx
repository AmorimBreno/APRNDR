// Os ganchos que a mesa entrega à conversa embutida (parte C1, WP3; docs/mesa-parte-c.md, seção 5):
// - rodapeDaResposta: "Ir ao trecho", só no último item de assistente do turno e só se a pergunta
//   apontou um trecho de uma aba desta matéria (guardar-na-nota.ts decide);
// - acoesDoBloco: "Guardar na nota" em cada bloco de primeiro nível da resposta pronta.
// Parte D (docs/mesa-parte-d.md, seção 2): o mesmo rodapé mostra um cartão "Nota criada" (NotaCriada.tsx) por nota
// que o professor criou nesse turno, ligado pela chamada da ferramenta (nota-criada.ts).
// Planos (docs/planos-de-estudo.md, seção 7): o mesmo rodapé mostra o cartão "Plano criado" (PlanoCriado.tsx), ligado pela chamada do criar_plano.
// O núcleo (packages/ui) só chama os ganchos: nota, lição e "guardar" ficam aqui.
//
// Os dois devolvem componentes (não conteúdo pronto): eles rodam dentro da árvore da mesa e leem os
// contextos dela (useMesa, useVendo). Fora da mesa o rodapé não aparece (useMesa() é undefined).

import { Button } from "@estudos/design-system";
import { type ItemAssistenteConversa, type ItemUsuarioConversa, type JanelaPerfilHook, type PropsConversaEmbutida, semEsperar } from "@estudos/ui";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { PAINEL_MESA } from "../../lib/mesa-tipos.ts";
import { type AlvoIrAoTrecho, alvoDoIrAoTrecho, ultimaRespostaDoTurno } from "./guardar-na-nota.ts";
import { GuardarNaNota } from "./GuardarNaNota.tsx";
import { useMesa } from "./mesa-ir.ts";
import { cartoesDoTurno, contarDesfeitas, contarNotasCriadas, haNotaCriada } from "./nota-criada.ts";
import { NotaCriada } from "./NotaCriada.tsx";
import { cartoesDePlanoDoTurno, contarPlanosCriados } from "./plano-criado.ts";
import { PlanoCriado } from "./PlanoCriado.tsx";
import { PAINEL_PLANOS } from "./planos-ponte.ts";
import { PAINEL_NOTAS } from "./notas-ponte.ts";

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

	// A lista de notas não se atualiza sozinha (a extensão não emite `lista` depois de nota_criada nem de desfeita): pede a
	// lista de novo ao abrir uma conversa que já tem cartões "Nota criada", quando chega uma nota_criada e quando chega uma
	// `desfeita`. É ela que mantém a tag "do professor" e o cartão ("A nota não existe mais") em dia. É só uma leitura;
	// nenhuma ação do cartão é repetida (regra B2).
	const sessaoId = janela.estado.sessao?.sessaoId;
	const haCartoes = haNotaCriada(janela.estado.acoesPorPainel[PAINEL_MESA], materiaId);
	const criadas = contarNotasCriadas(janela.estado.acoesPorPainel[PAINEL_MESA], materiaId);
	const desfeitas = contarDesfeitas(janela.estado.acoesPorPainel[PAINEL_NOTAS], materiaId);
	const janelaRef = useRef(janela);
	janelaRef.current = janela;
	const listadaEm = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (!sessaoId || (!haCartoes && desfeitas === 0)) return;
		const marca = `${sessaoId}|${criadas}|${desfeitas}`;
		if (listadaEm.current === marca) return;
		listadaEm.current = marca;
		semEsperar(janelaRef.current.acoes.acaoDaInterface(PAINEL_NOTAS, "listar", { materia: materiaId }));
	}, [sessaoId, haCartoes, criadas, desfeitas, materiaId]);

	// O mesmo para os planos: a lista de planos mantém o cartão "Plano criado" ("O plano não existe mais") em dia.
	const planosCriados = contarPlanosCriados(janela.estado.acoesPorPainel[PAINEL_MESA], materiaId);
	const planoListadoEm = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (!sessaoId || planosCriados === 0) return;
		const marca = `${sessaoId}|${planosCriados}`;
		if (planoListadoEm.current === marca) return;
		planoListadoEm.current = marca;
		semEsperar(janelaRef.current.acoes.acaoDaInterface(PAINEL_PLANOS, "listar", { materia: materiaId }));
	}, [sessaoId, planosCriados, materiaId]);

	return {
		rodapeDaResposta: (resposta, perguntaAnterior) => {
			if (!ultimaRespostaDoTurno(janela.estado.conversa, resposta.chave, janela.estado.executando)) return null;
			const alvo = alvoDoIrAoTrecho(perguntaAnterior, materiaId);
			const cartoes = cartoesDoTurno(janela.estado.conversa, resposta.chave, janela.estado.acoesPorPainel[PAINEL_MESA], materiaId);
			const cartoesDePlano = cartoesDePlanoDoTurno(janela.estado.conversa, resposta.chave, janela.estado.acoesPorPainel[PAINEL_MESA], materiaId);
			if (!alvo && cartoes.length === 0 && cartoesDePlano.length === 0) return null;
			return (
				<>
					{alvo ? <RodapeIrAoTrecho alvo={alvo} /> : null}
					{/* A chave leva a sessão: o cartão de uma conversa não é reaproveitado por outra (regra 4 dos padrões). */}
					{cartoes.map((cartao) => (
						<NotaCriada key={`${sessaoId ?? ""}:${cartao.chamada}`} cartao={cartao} janela={janela} />
					))}
					{cartoesDePlano.map((cartao) => (
						<PlanoCriado key={`${sessaoId ?? ""}:${cartao.chamada}`} cartao={cartao} janela={janela} />
					))}
				</>
			);
		},
		acoesDoBloco: (fonte) => <GuardarNaNota fonte={fonte} janela={janela} materiaId={materiaId} chaveFoco={lerFoco} />,
	};
}
