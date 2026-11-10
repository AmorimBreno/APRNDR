// O topo do painel do professor na mesa de estudo (docs/mesa-de-estudo.md, 2.4),
// numa linha só: a pill do custo da conversa no começo (com os tokens no title),
// o seletor das conversas da matéria ao lado do botão Nova e, no fim, o botão de
// ícone que abre a conversa na tela cheia (o nome da matéria já está na barra do
// caderno, logo acima). Embaixo do topo, o aviso da troca de sessão
// (2.3): a conversa mudou em outra aba, o professor está terminando outra
// resposta, ou a conversa da matéria está abrindo. É o `cabecalho` que a
// MesaEstudo passa à conversa embutida (PropsConversaEmbutida.cabecalho).
//
// Nova e o seletor trocam a sessão fora da entrada no caderno; por isso pedem
// confirmação se o professor está respondendo, e chamam executarAntesDeTrocar()
// (salvar a nota aberta) antes de trocar.

import { Button, Icon } from "@estudos/design-system";
import { guardarSessaoDoPerfil, type JanelaPerfilHook, MenuSuspenso, type OpcaoMenu, semEsperar } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Materia } from "../../lib/materia-tipos.ts";
import { contextoDaMateria } from "./comum.ts";
import { useTrocaSessao } from "./troca-sessao.tsx";

type ListaSessoes = Awaited<ReturnType<JanelaPerfilHook["acoes"]["listarSessoes"]>>;

/** Mesmo formato do botão de informações das respostas (InfoResposta): dólares com 4 casas. */
const dolar = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const inteiro = new Intl.NumberFormat("pt-BR");
const data = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function dataCurta(iso: string): string {
	const momento = new Date(iso);
	return Number.isNaN(momento.getTime()) ? "" : data.format(momento);
}

const ID_ATUAL = "__atual__";

export interface PropsCabecalhoProfessor {
	janela: JanelaPerfilHook;
	perfilId: string;
	/** Sem a matéria (ainda carregando), o topo mostra só o custo. */
	materia?: Materia;
	/** Abre a conversa do perfil na tela cheia (props.abrirConversa da tela do caderno); sem ele o botão não aparece. */
	abrirConversa?(): void;
}

export function CabecalhoProfessor({ janela, perfilId, materia, abrirConversa }: PropsCabecalhoProfessor) {
	const { estado, acoes } = janela;
	const troca = useTrocaSessao();
	const sessaoId = estado.sessao?.sessaoId;
	const chave = materia ? `materia:${materia.id}` : undefined;
	const [sessoes, setSessoes] = useState<ListaSessoes>([]);
	// A troca que espera o "Trocar mesmo assim?" do Breno.
	const [confirmando, setConfirmando] = useState<(() => Promise<unknown>) | undefined>(undefined);
	const [trocando, setTrocando] = useState(false);
	const vivo = useRef(true);
	useEffect(() => {
		vivo.current = true;
		return () => {
			vivo.current = false;
		};
	}, []);

	const atualizar = useCallback(() => {
		acoes
			.listarSessoes()
			.then((lista) => {
				if (vivo.current) setSessoes(lista);
			})
			.catch(() => {});
	}, [acoes]);
	// De novo ao trocar de sessão e quando a resposta termina (o título e a data mudam).
	useEffect(() => {
		if (sessaoId) atualizar();
	}, [sessaoId, estado.executando, atualizar]);

	const ocupado = estado.executando || estado.fila.length > 0 || estado.pedidos.length > 0;
	const atualDaMateria = chave !== undefined && estado.sessao?.contexto?.chave === chave;

	const opcoes = useMemo<OpcaoMenu[]>(() => {
		if (!chave) return [];
		const daMateria = sessoes
			.filter((sessao) => sessao.contexto?.chave === chave)
			.sort((a, b) => b.modificadaEm.localeCompare(a.modificadaEm))
			.map<OpcaoMenu>((sessao) => ({ id: sessao.id, titulo: sessao.titulo || "Conversa sem título", detalhe: dataCurta(sessao.modificadaEm) }));
		// A conversa aberta sem arquivo ainda (uma Nova sem mensagens) também aparece.
		if (atualDaMateria && sessaoId && !daMateria.some((opcao) => opcao.id === sessaoId)) {
			daMateria.unshift({ id: sessaoId, titulo: "Conversa atual", detalhe: "ainda sem mensagens" });
		}
		return daMateria;
	}, [sessoes, chave, atualDaMateria, sessaoId]);

	const opcaoAtual = opcoes.find((opcao) => opcao.id === sessaoId);

	/** Salva o que está aberto, troca e guarda a sessão para a conversa em tela cheia abrir nela. */
	const trocar = useCallback(
		async (fazer: () => Promise<{ sessaoId: string }>) => {
			setTrocando(true);
			try {
				await troca.executarAntesDeTrocar();
				const aberta = await fazer();
				guardarSessaoDoPerfil(perfilId, aberta.sessaoId);
				atualizar();
			} catch {
				// O erro do pedido já entra em estado.erros (a faixa de erros do painel).
			} finally {
				if (vivo.current) setTrocando(false);
			}
		},
		[troca, perfilId, atualizar],
	);

	const pedirTroca = (fazer: () => Promise<{ sessaoId: string }>) => {
		if (ocupado) setConfirmando(() => () => trocar(fazer));
		else semEsperar(trocar(fazer));
	};

	const nova = () => {
		if (!materia) return;
		pedirTroca(() => acoes.novaSessao(undefined, contextoDaMateria(materia)));
	};
	const abrir = (id: string) => {
		if (!materia || id === sessaoId) return;
		pedirTroca(() => acoes.abrirSessao(id, contextoDaMateria(materia)));
	};

	const aviso =
		troca.situacao === "trocando" ? (
			<p className="mesa__aviso" role="status">
				Abrindo a conversa da matéria…
			</p>
		) : troca.situacao === "esperando_resposta" ? (
			<p className="mesa__aviso" role="status">
				O professor está terminando outra resposta
			</p>
		) : troca.situacao === "outra_aba" ? (
			<div className="mesa__aviso mesa__aviso--acao" role="status">
				<span>A conversa mudou em outra aba</span>
				<Button size="sm" variant="secondary" icon="arrow-left" onClick={troca.voltarParaMateria}>
					{`Voltar para ${materia?.nome ?? "a matéria"}`}
				</Button>
			</div>
		) : null;

	/** Guarda a nota aberta e a conversa de agora (a tela cheia abre nela) e então abre a tela cheia. */
	const abrirNaTelaCheia = () => {
		if (!abrirConversa) return;
		semEsperar(
			troca
				.executarAntesDeTrocar()
				.catch(() => {})
				.then(() => {
					if (sessaoId) guardarSessaoDoPerfil(perfilId, sessaoId);
					abrirConversa();
				}),
		);
	};
	const uso = estado.uso;
	const tituloCusto = `Custo desta conversa, com os subagentes. Tokens: entrada ${inteiro.format(uso.tokensEntrada)}, saída ${inteiro.format(uso.tokensSaida)}, cache lido ${inteiro.format(uso.tokensCacheLeitura)}, cache escrito ${inteiro.format(uso.tokensCacheEscrita)}.`;

	const desligado = trocando || troca.situacao === "trocando" || !materia;

	return (
		<div className="mesa-cab">
			{/* Sem o nome da matéria: ele já está na barra do caderno, logo acima (pedido do Breno). */}
			<div className="mesa-cab__linha">
				<span className="mesa-cab__custo" tabIndex={0} title={tituloCusto}>
					{`US$ ${dolar.format(uso.custo)}`}
				</span>
				<span className="mesa-cab__espaco" aria-hidden="true" />
				<div
					className="mesa-cab__seletor"
					// A lista pode ter mudado em outra aba ou pela tela cheia: pede de novo ao chegar nela.
					onPointerDownCapture={atualizar}
					onKeyDownCapture={(evento) => {
						if (evento.key === "Enter" || evento.key === " " || evento.key === "ArrowDown") atualizar();
					}}
				>
					{opcoes.length > 0 ? (
						<MenuSuspenso
							opcoes={opcoes}
							atual={atualDaMateria && sessaoId ? sessaoId : ID_ATUAL}
							escolher={abrir}
							conteudoBotao={
								<span className="mesa-cab__atual">
									<Icon name="clock" size={16} strokeWidth={2.25} />
									<span className="mesa-cab__atual-titulo body-sm">{opcaoAtual?.titulo ?? "Conversas da matéria"}</span>
									{opcaoAtual?.detalhe ? <span className="mesa-cab__atual-data overline">{opcaoAtual.detalhe}</span> : null}
								</span>
							}
							classeBotao="mesa-cab__botao"
							rotulo="Conversas desta matéria"
							rotuloMenu="Conversas desta matéria"
							desabilitado={desligado}
							className="mesa-cab__menu"
						/>
					) : (
						<span className="mesa-cab__vazio">Nenhuma conversa anterior</span>
					)}
				</div>
				<Button size="sm" variant="secondary" icon="plus" disabled={desligado} onClick={nova}>
					Nova
				</Button>
				{abrirConversa ? (
					<Button variant="ghost" size="sm" iconOnly icon="arrow-up-right" title="Tela cheia" aria-label="Abrir a conversa na tela cheia" onClick={abrirNaTelaCheia} />
				) : null}
			</div>
			{confirmando ? (
				<div className="mesa__aviso mesa__aviso--acao" role="alertdialog" aria-label="Confirmar a troca de conversa">
					<span>O professor está respondendo. Trocar mesmo assim?</span>
					<span className="mesa__aviso-botoes">
						<Button
							size="sm"
							variant="danger"
							onClick={() => {
								const fazer = confirmando;
								setConfirmando(undefined);
								semEsperar(fazer());
							}}
						>
							Trocar
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setConfirmando(undefined)}>
							Cancelar
						</Button>
					</span>
				</div>
			) : null}
			{aviso}
		</div>
	);
}
