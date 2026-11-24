// O seletor do plano de estudos, a segunda linha do topo do painel do professor (docs/planos-de-estudo.md, seção 7):
// "Plano: <título> · 2 de 5". Lista os planos da matéria com o progresso ("concluído" quando for o caso), "Nenhum" e
// "Criar plano nesta conversa". Escolher um plano manda `seguir` pela ponte "planos" e, com a resposta ok, manda ao
// professor `Vamos seguir o plano "<título>".` (a aula começa sozinha). "Criar plano nesta conversa" só manda a
// mensagem, sem seguir nada. "Nenhum" só solta, sem mensagem.
//
// Padrões de interface (docs/padroes-de-interface.md): fica desligado com o professor respondendo, com fila ou pedido
// pendente e sem sessão, como o seletor das conversas; ocupa a largura da linha em todos os estados (o título longo
// corta com reticências) e a mesma altura; a lista que já se conhecia fica até a nova chegar; "Aplicando…" não existe:
// o seletor só desliga enquanto a extensão responde, sem trocar o texto.

import { Icon } from "@estudos/design-system";
import { type JanelaPerfilHook, MenuSuspenso, type OpcaoMenu, semEsperar } from "@estudos/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { planoPorTitulo, progressoDoPlano, usePlanos } from "./planos-ponte.ts";

export const ID_NENHUM_PLANO = "__nenhum__";
export const ID_CRIAR_PLANO = "__criar__";
const PREFIXO_PLANO = "plano:";

export const TEXTO_CRIAR_PLANO = "Quero montar um plano de estudos nesta conversa.";
export const mensagemSeguirPlano = (titulo: string) => `Vamos seguir o plano "${titulo}".`;

export interface PropsSeletorPlano {
	janela: JanelaPerfilHook;
	materiaId: string;
	/** Desligado de fora (a troca de conversa em andamento). */
	desligado?: boolean;
}

export function SeletorPlano({ janela, materiaId, desligado = false }: PropsSeletorPlano) {
	const { estado, acoes } = janela;
	const { planos, seguindo, seguir } = usePlanos(janela, materiaId);
	const [trabalhando, setTrabalhando] = useState(false);
	const [erro, setErro] = useState<string | undefined>(undefined);
	const vivo = useRef(true);
	useEffect(() => {
		vivo.current = true;
		return () => {
			vivo.current = false;
		};
	}, []);
	// Outra matéria ou outra conversa: o erro de uma escolha antiga não vale mais (regra 4).
	const sessaoId = estado.sessao?.sessaoId;
	useEffect(() => setErro(undefined), [materiaId, sessaoId]);

	const ocupado = estado.executando || estado.fila.length > 0 || estado.pedidos.length > 0;
	const semSessao = !sessaoId;
	const bloqueado = desligado || ocupado || semSessao || trabalhando;

	const opcoes = useMemo<OpcaoMenu[]>(() => {
		const daMateria = (planos ?? []).map<OpcaoMenu>((plano) => ({ id: `${PREFIXO_PLANO}${plano.titulo}`, titulo: plano.titulo, detalhe: progressoDoPlano(plano) }));
		return [...daMateria, { id: ID_NENHUM_PLANO, titulo: "Nenhum" }, { id: ID_CRIAR_PLANO, titulo: "Criar plano nesta conversa" }];
	}, [planos]);

	const atual = seguindo ? `${PREFIXO_PLANO}${planoPorTitulo(planos, seguindo)?.titulo ?? seguindo}` : ID_NENHUM_PLANO;
	const resumoAtual = planoPorTitulo(planos, seguindo);

	const escolher = (id: string) => {
		setErro(undefined);
		if (id === ID_CRIAR_PLANO) {
			semEsperar(
				acoes.enviar(TEXTO_CRIAR_PLANO).catch(() => {
					if (vivo.current) setErro("Não consegui mandar a mensagem ao professor.");
				}),
			);
			return;
		}
		const titulo = id === ID_NENHUM_PLANO ? null : id.slice(PREFIXO_PLANO.length);
		setTrabalhando(true);
		void (async () => {
			try {
				await seguir(titulo);
			} catch (falha) {
				if (vivo.current) setErro(falha instanceof Error && falha.message ? falha.message : "Não consegui mudar o plano.");
				return;
			} finally {
				if (vivo.current) setTrabalhando(false);
			}
			if (titulo === null) return;
			try {
				await acoes.enviar(mensagemSeguirPlano(titulo));
			} catch {
				if (vivo.current) setErro("O plano foi escolhido, mas não consegui mandar a mensagem ao professor.");
			}
		})();
	};

	// Até a primeira lista chegar o texto fica escondido, ocupando o espaço (regra 3): "Plano: nenhum" não pisca antes da hora.
	const titulo = resumoAtual?.titulo ?? seguindo ?? "nenhum";
	// Sem planos na matéria: só "Criar plano nesta conversa".
	const opcoesVisiveis = planos && planos.length === 0 ? opcoes.filter((opcao) => opcao.id === ID_CRIAR_PLANO) : opcoes;

	return (
		<div className="mesa-cab__plano">
			<div className="mesa-cab__linha mesa-cab__linha--plano">
			<MenuSuspenso
				opcoes={opcoesVisiveis}
				atual={planos && planos.length === 0 ? "" : atual}
				escolher={escolher}
				conteudoBotao={
					<span className="mesa-cab__atual mesa-cab__atual--plano">
						<Icon name="checklist" size={16} strokeWidth={2.25} />
						<span className="mesa-cab__atual-titulo mesa-cab__atual-titulo--plano body-sm" style={{ visibility: planos ? "visible" : "hidden" }}>{`Plano: ${titulo}`}</span>
						{resumoAtual ? <span className="mesa-cab__atual-data overline">{progressoDoPlano(resumoAtual)}</span> : null}
					</span>
				}
				classeBotao="mesa-cab__botao mesa-cab__botao--plano"
				rotulo="Plano de estudos desta conversa"
				rotuloMenu="Planos de estudos desta matéria"
				desabilitado={bloqueado}
				className="mesa-cab__menu mesa-cab__menu--plano"
			/>
			</div>
			{erro ? (
				<p className="mesa__aviso" role="status">
					{erro}
				</p>
			) : null}
		</div>
	);
}
