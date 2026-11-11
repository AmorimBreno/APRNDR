// O cartão "Nota criada: <título>" no rodapé da resposta do professor (parte D, WP2; docs/mesa-parte-d.md,
// seção 2). Vive no `rodapeDaResposta` da conversa embutida (ganchos-conversa.tsx), junto do "Ir ao trecho".
//
// - Abrir: leva à nota na mesa, na aba (é um clique do Breno, não uma prévia): irPara com quem: "usuario".
// - Desfazer: pede a confirmação no próprio cartão ("Apagar a nota? Não dá para voltar atrás."), fecha a aba da
//   nota se ela estiver aberta, manda `desfazer_nota` ao painel "notas" e espera `desfeita` ou `erro` (com o
//   mesmo `pedido`), como o Guardar espera a resposta da ponte. Depois: "Nota desfeita" (sem botões), ou a mensagem
//   da recusa (só Abrir), ou "A nota não existe mais".
// - O cartão só LÊ o que a ponte já gravou (a ação `nota_criada`): ao montar não executa nada (regra B2 da C1).
//
// Padrões de interface (docs/padroes-de-interface.md): o cartão ocupa a linha do rodapé (32 px) em todos os
// estados e tem a mesma largura; a confirmação, a recusa e o aviso trocam só o texto (até duas linhas pequenas)
// e os botões, que têm o mesmo tamanho; "Desfazendo…" só é dito depois de 1 s (antes disso fica a confirmação,
// com os botões desligados); sem movimento reduzido ou não, nada anima.

import { Icon } from "@estudos/design-system";
import { type JanelaPerfilHook, useValorEstavel } from "@estudos/ui";
import { useEffect, useRef, useState } from "react";
import { AVISO_SEM_RESPOSTA, AVISO_SEM_SESSAO, AVISO_SESSAO_TROCANDO, enviarComRetentativa, esperarAcao, novoIdDePedido } from "./guardar-na-nota.ts";
import { useMesa } from "./mesa-ir.ts";
import { ACAO_DESFAZER_NOTA, type CartaoNota, estadoDoCartao, respostaDoDesfazer, TEXTO_CONFIRMAR_DESFAZER, TEXTO_DESFAZENDO, textoDoCartao } from "./nota-criada.ts";
import { PAINEL_NOTAS } from "./notas-ponte.ts";
import { useVendoOpcional } from "./vendo.tsx";

/** Quanto um aviso passageiro (a conversa estava trocando) fica no lugar do texto do cartão. */
export const DURACAO_AVISO_CARTAO_MS = 6000;

type Fase = "repouso" | "confirmando" | "desfazendo";

export interface PropsNotaCriada {
	cartao: CartaoNota;
	/** A janela do perfil (de agora): a sessão, as ações recebidas e o envio pela ponte. */
	janela: JanelaPerfilHook;
}

export function NotaCriada({ cartao, janela }: PropsNotaCriada) {
	const mesa = useMesa();
	const vendo = useVendoOpcional();
	// Tudo o que a ação lê vem das refs: o cartão é redesenhado a cada render da conversa, e um Desfazer em andamento
	// (esperar a ponte) precisa da janela mais nova, não da do começo.
	const entrada = useRef({ cartao, janela, mesa, vendo });
	entrada.current = { cartao, janela, mesa, vendo };
	const [fase, setFase] = useState<Fase>("repouso");
	const [recusa, setRecusa] = useState<string | undefined>(undefined);
	const [aviso, setAviso] = useState<string | undefined>(undefined);
	const [desfeita, setDesfeita] = useState(false);
	const vivo = useRef(true);
	const ocupado = useRef(false);
	const relogioAviso = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const botaoDesfazer = useRef<HTMLButtonElement>(null);
	const botaoCancelar = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		vivo.current = true;
		return () => {
			vivo.current = false;
			clearTimeout(relogioAviso.current);
		};
	}, []);

	const estado = estadoDoCartao(cartao, janela.estado.acoesPorPainel[PAINEL_NOTAS], recusa, desfeita);
	const lerAcoes = () => entrada.current.janela.estado.acoesPorPainel[PAINEL_NOTAS] ?? [];

	const avisar = (mensagem: string) => {
		clearTimeout(relogioAviso.current);
		setAviso(mensagem);
		relogioAviso.current = setTimeout(() => setAviso(undefined), DURACAO_AVISO_CARTAO_MS);
	};

	const abrir = () => entrada.current.mesa?.irPara({ origem: cartao.rota, quem: "usuario" });

	/** Pede a lista de novo: depois de uma recusa, ela diz se a nota ainda existe (o cartão vira "não existe mais"). */
	const pedirLista = () => {
		void enviarComRetentativa(() => entrada.current.janela.acoes.acaoDaInterface(PAINEL_NOTAS, "listar", { materia: entrada.current.cartao.materia })).catch(() => {});
	};

	const desfazer = async () => {
		if (ocupado.current) return;
		ocupado.current = true;
		setFase("desfazendo");
		const voltar = (depois?: () => void) => {
			if (!vivo.current) return;
			setFase("repouso");
			depois?.();
		};
		try {
			const { janela: janelaAgora, cartao: alvo, mesa: mesaAgora } = entrada.current;
			const sessao = janelaAgora.estado.sessao?.sessaoId;
			if (!sessao) return voltar(() => avisar(AVISO_SEM_SESSAO));
			// A aba da nota fecha antes (e, se ela é a em foco, espera o salvamento): um salvamento depois do apagar recriaria o arquivo.
			await mesaAgora?.fecharAbaDaNota?.(alvo.rota);
			const pedido = novoIdDePedido("desfazer");
			const vistas = new Set(lerAcoes().map((recebida) => recebida.chave));
			try {
				await enviarComRetentativa(() => entrada.current.janela.acoes.acaoDaInterface(PAINEL_NOTAS, ACAO_DESFAZER_NOTA, { materia: alvo.materia, titulo: alvo.titulo, sessao, pedido }));
			} catch {
				return voltar(() => avisar(AVISO_SESSAO_TROCANDO));
			}
			const desfecho = await esperarAcao(lerAcoes, (recebidas) => respostaDoDesfazer(recebidas, vistas, pedido));
			if (!vivo.current) return;
			if (desfecho?.ok) {
				// A nota saiu do disco: a cópia que o Vendo guardava dela ficou velha.
				entrada.current.vendo?.invalidarCopia(alvo.rota);
				setDesfeita(true);
				return voltar();
			}
			setRecusa(desfecho ? desfecho.mensagem : AVISO_SEM_RESPOSTA);
			pedirLista();
			voltar();
		} finally {
			ocupado.current = false;
		}
	};

	// "Desfazendo…" é um estado passageiro: só é dito depois de 1 s (até lá fica a confirmação, com os botões desligados).
	const desfazendoDito = useValorEstavel(fase === "desfazendo", fase === "desfazendo", false) && fase === "desfazendo";

	// Foco: ao pedir a confirmação vai para "Cancelar" (o gesto seguro); ao cancelar volta para "Desfazer".
	const fasePassada = useRef<Fase>("repouso");
	useEffect(() => {
		const passada = fasePassada.current;
		fasePassada.current = fase;
		if (fase === "confirmando" && passada === "repouso") botaoCancelar.current?.focus({ preventScroll: true });
		else if (fase === "repouso" && passada === "confirmando") botaoDesfazer.current?.focus({ preventScroll: true });
	}, [fase]);

	const confirmando = fase !== "repouso" && estado.tipo === "criada";
	const texto = confirmando ? (desfazendoDito ? TEXTO_DESFAZENDO : TEXTO_CONFIRMAR_DESFAZER) : (aviso ?? textoDoCartao(cartao, estado));
	const emAndamento = fase === "desfazendo";

	return (
		<div
			className="nota-criada"
			data-estado={estado.tipo}
			data-fase={fase}
			role="group"
			aria-label={`Nota do professor: ${cartao.titulo}`}
			onKeyDown={(evento) => {
				if (evento.key !== "Escape" || fase !== "confirmando") return;
				evento.preventDefault();
				evento.stopPropagation();
				setFase("repouso");
			}}
		>
			<Icon name="file" size={16} strokeWidth={2.25} />
			<span className="nota-criada__texto" aria-live="polite" title={texto}>
				{texto}
			</span>
			<span className="nota-criada__botoes">
				{confirmando ? (
					<>
						<button type="button" className="nota-criada__botao nota-criada__botao--perigo" disabled={emAndamento} aria-busy={emAndamento || undefined} onClick={() => void desfazer()}>
							Apagar
						</button>
						<button ref={botaoCancelar} type="button" className="nota-criada__botao" disabled={emAndamento} onClick={() => setFase("repouso")}>
							Cancelar
						</button>
					</>
				) : estado.tipo === "criada" || estado.tipo === "recusada" ? (
					<>
						<button type="button" className="nota-criada__botao" onClick={abrir}>
							Abrir
						</button>
						{estado.tipo === "criada" ? (
							<button ref={botaoDesfazer} type="button" className="nota-criada__botao" onClick={() => setFase("confirmando")}>
								Desfazer
							</button>
						) : null}
					</>
				) : null}
			</span>
		</div>
	);
}
