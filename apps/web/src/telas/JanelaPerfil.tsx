// Janela do perfil: a barra tijolo no topo (a linha do perfil virou aba),
// o histórico de conversas à esquerda, a conversa como documento no meio com
// a barra de pergunta no pé e, à direita, a área de painéis (abre sozinha
// quando um painel dela recebe algo). Os pedidos que esperam resposta viram
// botões na conversa e são respondidos num modal, que abre sozinho quando o
// pedido chega e pode ser minimizado. A lógica fica no @estudos/ui.

import { Button, EmptyState, Icon, pad2, Tag } from "@estudos/design-system";
import {
	AgenteAnimado,
	AreaPaineis,
	atividadeDoAgente,
	AvatarAgente,
	type ItemAssistente,
	BarraPergunta,
	BotaoPedido,
	comTransicao,
	Contador,
	DocumentoConversa,
	entradaDoPainel,
	idsDosPaineis,
	iniciarVoo,
	ModalPedido,
	numerarPedidos,
	type RegistroPedido,
	resumoDoPedido,
	type ErroJanela,
	Historico,
	type InfoModelo,
	type ResumoSessao,
	ROTULOS_ATIVIDADE,
	SeletorAgente,
	SeletorModelo,
	semEsperar,
	useJanelaPerfil,
	usePerfis,
	type Voo,
} from "@estudos/ui";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { registroPaineis } from "../paineis.ts";
import { TelaCarregando } from "./TelaCarregando.tsx";

const dolar = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const inteiro = new Intl.NumberFormat("pt-BR");

const nomesOrigem: Record<ErroJanela["origem"], string> = {
	modelo: "Erro do modelo",
	extensao: "Erro de extensão",
	nucleo: "Erro do núcleo",
	servidor: "Erro do servidor",
	pedido: "Erro no pedido",
};

export interface PropsJanelaPerfil {
	perfilId: string;
	/** Para onde o botão da esquerda da barra volta: a tela inicial do perfil ou a de perfis. */
	voltar: { rotulo: string; hash: string };
}

export function JanelaPerfil({ perfilId, voltar }: PropsJanelaPerfil) {
	const { estado, conexao, acoes } = useJanelaPerfil(perfilId);
	const perfis = usePerfis();
	const perfil = perfis.lista?.perfis.find((item) => item.id === perfilId);

	const [texto, setTexto] = useState("");
	const [sessoes, setSessoes] = useState<ResumoSessao[]>([]);
	const [modelos, setModelos] = useState<InfoModelo[]>([]);
	const [paineisAbertos, setPaineisAbertos] = useState(false);
	/** A mensagem enviada voando do campo até a nota (movimento.ts). */
	const [voo, setVoo] = useState<Voo>();
	const aberta = conexao === "aberta";
	const sessaoId = estado.sessao?.sessaoId;

	// Sessões: ao abrir, ao trocar de sessão e no fim de cada resposta (título novo).
	useEffect(() => {
		if (!aberta || !estado.pronto || estado.executando) return;
		acoes.listarSessoes().then(setSessoes, () => {});
	}, [acoes, aberta, estado.pronto, estado.executando, sessaoId]);

	useEffect(() => {
		if (!aberta || !estado.pronto) return;
		acoes.listarModelos().then(setModelos, () => {});
	}, [acoes, aberta, estado.pronto]);

	// O perfil recarregado pode ter mudado os agentes: relê a lista.
	const avisoRecarregado = estado.recarregado?.chave;
	const relerPerfis = perfis.recarregar;
	useEffect(() => {
		if (avisoRecarregado) relerPerfis();
	}, [avisoRecarregado, relerPerfis]);

	// A área de painéis abre sozinha quando um painel dela recebe uma ação nova
	// (os pedidos vão para o modal, não para a área).
	const idsDaArea = idsDosPaineis(perfil?.paineis ?? [], estado.acoesPorPainel, registroPaineis);
	const chegadas = idsDaArea.reduce((soma, id) => soma + (estado.acoesPorPainel[id]?.length ?? 0), 0);
	const chegadasAntes = useRef(chegadas);
	useEffect(() => {
		if (chegadas > chegadasAntes.current) setPaineisAbertos(true);
		chegadasAntes.current = chegadas;
	}, [chegadas]);

	// Modal do pedido: abre sozinho quando chega um pedido novo. Quando o
	// aberto deixa de esperar, fecha, menos no painel que revisa ao responder
	// (o quiz mostra o retorno ali) e só se foi você quem respondeu.
	const [pedidoAberto, setPedidoAberto] = useState<string>();
	const registros = estado.registrosPedidos;
	const vistos = useRef(new Set<string>());
	useEffect(() => {
		for (const registro of Object.values(registros).sort((a, b) => a.ordem - b.ordem)) {
			if (vistos.current.has(registro.id)) continue;
			vistos.current.add(registro.id);
			if (registro.estado === "pendente") setPedidoAberto(registro.id);
		}
	}, [registros]);
	const aberto = pedidoAberto ? registros[pedidoAberto] : undefined;
	const estadoDoAberto = aberto?.estado;
	const painelDoAberto = aberto?.painel;
	const anterior = useRef<{ id?: string; estado?: string }>({});
	// O modal nasce do botão do pedido e, ao fechar ou minimizar, encolhe de
	// volta para dentro dele (View Transition com o nome pedido-aberto).
	const botaoDoPedidoNaTela = (id: string) => document.querySelector<HTMLElement>(`[data-pedido="${CSS.escape(id)}"]`);
	const abrirPedido = (id: string) => {
		const botao = botaoDoPedidoNaTela(id);
		if (!botao) return setPedidoAberto(id);
		void comTransicao(
			() => {
				botao.style.viewTransitionName = "";
				setPedidoAberto(id);
			},
			{ antes: () => (botao.style.viewTransitionName = "pedido-aberto"), classe: "transicao-pedido" },
		);
	};
	const fecharPedido = () => {
		const botao = pedidoAberto ? botaoDoPedidoNaTela(pedidoAberto) : null;
		if (!botao) return setPedidoAberto(undefined);
		void comTransicao(
			() => {
				setPedidoAberto(undefined);
				botao.style.viewTransitionName = "pedido-aberto";
			},
			{ classe: "transicao-pedido" },
		).then(() => {
			botao.style.viewTransitionName = "";
		});
	};
	useEffect(() => {
		const antes = anterior.current;
		anterior.current = { ...(pedidoAberto ? { id: pedidoAberto } : {}), ...(estadoDoAberto ? { estado: estadoDoAberto } : {}) };
		// Só na passagem de "esperando" para outra coisa com o modal aberto: reabrir para rever não fecha.
		if (!pedidoAberto || !painelDoAberto || antes.id !== pedidoAberto || antes.estado !== "pendente" || estadoDoAberto === "pendente") return;
		const revisa = entradaDoPainel(registroPaineis, painelDoAberto).revisarAoResponder;
		if (!(revisa && estadoDoAberto === "respondido")) fecharPedido();
		// fecharPedido muda a cada render; o que importa é a passagem de estado.
	}, [pedidoAberto, estadoDoAberto, painelDoAberto]);
	const numeros = useMemo(() => numerarPedidos(registroPaineis, registros), [registros]);

	const modelosDoPerfil = useMemo(
		() => (perfil?.agentes ?? []).map((agente) => agente.modelo).filter((modelo): modelo is string => Boolean(modelo)),
		[perfil],
	);

	const nomePerfil = perfil?.nome ?? perfilId;
	const avisoConexao = conexao === "reconectando" ? "Reconectando ao servidor" : conexao === "conectando" ? "Conectando ao servidor" : undefined;

	if (!estado.pronto) {
		return (
			<TelaCarregando
				nomePerfil={nomePerfil}
				{...(estado.carregando ? { etapa: estado.carregando } : {})}
				{...(avisoConexao ? { aviso: avisoConexao } : {})}
				erros={estado.erros}
				limparErros={acoes.limparErros}
				voltar={voltar}
			/>
		);
	}

	const enviar = () => {
		const mensagem = texto.trim();
		if (!mensagem) return;
		// O fantasma sai do campo agora e pousa na nota quando o eco do servidor chegar.
		const campo = document.querySelector(".ap-ask__input");
		const novo = campo ? iniciarVoo(mensagem, campo.getBoundingClientRect()) : undefined;
		setVoo(novo);
		setTexto("");
		acoes.enviar(mensagem).then(
			(resultado) => {
				// Na fila, não há nota para pousar agora: a mensagem aparece na lista da fila.
				if (resultado === "enfileirada") {
					novo?.cancelar();
					setVoo(undefined);
				}
			},
			() => {
				novo?.cancelar();
				setVoo(undefined);
				setTexto(mensagem);
			},
		);
	};

	const parar = () => {
		acoes.abortar().then((fila) => {
			if (fila.length) setTexto((atual) => [...fila, atual].filter(Boolean).join("\n\n"));
		}, () => {});
	};

	const agentes = perfil?.agentes ?? [];
	const agenteAtual = estado.sessao?.agente ?? "";
	const ocupado = !aberta || estado.executando;
	const uso = estado.uso;

	// O cabeçalho de cada resposta: a foto e o nome do agente que respondeu. Na
	// resposta que está chegando, a foto reage ao que ele faz.
	const atividade = atividadeDoAgente(estado);
	const avatarDe = (nome: string) => agentes.find((agente) => agente.nome === nome)?.avatar;
	const nomeBonito = (nome: string) => nome.charAt(0).toUpperCase() + nome.slice(1);
	const autorDaResposta = (item: ItemAssistente) => {
		const nome = item.agente ?? agenteAtual;
		if (!nome) return undefined;
		const avatar = avatarDe(nome);
		const vivo = item.emAndamento && atividade !== "parado";
		return (
			<>
				{vivo ? (
					<AgenteAnimado nome={nome} {...(avatar ? { avatar } : {})} atividade={atividade} />
				) : (
					<AvatarAgente nome={nome} {...(avatar ? { avatar } : {})} />
				)}
				<span className="bloco__nome body-strong">{nomeBonito(nome)}</span>
				{vivo ? <span className="bloco__fazendo overline">{ROTULOS_ATIVIDADE[atividade as Exclude<typeof atividade, "parado">]}</span> : null}
			</>
		);
	};
	const situacao =
		atividade === "parado" || !agenteAtual ? undefined : (
			<span className="barra__situacao" role="status">
				<AgenteAnimado nome={agenteAtual} {...(avatarDe(agenteAtual) ? { avatar: avatarDe(agenteAtual)! } : {})} atividade={atividade} tamanho={28} />
				<span className="overline">
					{nomeBonito(agenteAtual)} · {ROTULOS_ATIVIDADE[atividade]}
				</span>
			</span>
		);

	const botaoDoPedido = (registro: RegistroPedido) => (
		<BotaoPedido
			pedido={registro}
			resumo={resumoDoPedido(registroPaineis, registro)}
			numero={numeros[registro.id] ?? 1}
			abrir={() => abrirPedido(registro.id)}
		/>
	);
	// Pedidos sem a chamada de ferramenta na conversa (id diferente do da chamada) vão para o fim.
	const idsDasChamadas = new Set(estado.conversa.flatMap((item) => (item.tipo === "ferramenta" ? [item.chamada.id] : [])));
	const soltos = Object.values(registros)
		.filter((registro) => registro.estado === "pendente" && !idsDasChamadas.has(registro.id))
		.sort((a, b) => a.ordem - b.ordem);

	return (
		<div className="janela">
			<header className="topo" style={{ viewTransitionName: "faixa-marca" }}>
				<button type="button" className="topo__voltar button" onClick={() => (window.location.hash = voltar.hash)}>
					<Icon name="list" size={18} strokeWidth={2.5} />
					{voltar.rotulo}
				</button>
				<div className="topo__titulo">
					<span className="overline">Perfil</span>
					<h1 className="display-sm">{nomePerfil}</h1>
				</div>

				<div className="topo__controles">
					<SeletorAgente
						atual={agenteAtual}
						agentes={agentes}
						trocar={(agente) => semEsperar(acoes.trocarAgente(agente))}
						desabilitado={ocupado}
					/>
					<SeletorModelo
						{...(estado.sessao?.modelo ? { atual: estado.sessao.modelo } : {})}
						doPerfil={modelosDoPerfil}
						modelos={modelos}
						trocar={(modelo) => semEsperar(acoes.trocarModelo(modelo))}
						desabilitado={ocupado}
						legenda={`Perfil · ${nomePerfil}`}
					/>
				</div>

				<div className="topo__uso" title={`Sessão ${sessaoId ?? "?"} · raciocínio ${estado.sessao?.raciocinio ?? "?"}`}>
					<span className="overline">Custo da sessão</span>
					<span className="data">
						US$ <Contador valor={uso.custo} formatar={(valor) => dolar.format(valor)} /> ·{" "}
						<Contador valor={uso.tokensTotal} formatar={(valor) => inteiro.format(Math.round(valor))} /> tokens
					</span>
				</div>

				<div className="topo__acoes">
					{avisoConexao ? (
						<Tag tone="amber" dot role="status">
							{avisoConexao}
						</Tag>
					) : null}
					<button
						type="button"
						className="topo__icone"
						onClick={() => semEsperar(acoes.recarregarPerfil())}
						disabled={!aberta}
						aria-label="Recarregar perfil"
						title="Recarregar perfil"
					>
						<Icon name="refresh" size={20} strokeWidth={2.5} />
					</button>
					<button
						type="button"
						className={`topo__painel button${paineisAbertos ? " topo__painel--aberto" : ""}`}
						aria-pressed={paineisAbertos}
						onClick={() => setPaineisAbertos((atual) => !atual)}
					>
						Painéis
					</button>
				</div>
			</header>

			<div className={`corpo${paineisAbertos ? " corpo--paineis" : ""}`}>
				<aside className="coluna coluna--historico">
					<Historico
						sessoes={sessoes}
						{...(sessaoId ? { atual: sessaoId } : {})}
						desabilitado={!aberta}
						novaSessao={() => semEsperar(acoes.novaSessao())}
						abrirSessao={(id) => semEsperar(acoes.abrirSessao(id))}
					/>
				</aside>

				<main className="centro">
					<div className="rolagem">
						<div className="centro__coluna">
							{estado.recarregado ? (
								<div className="aviso-recarregado" role="status">
									<p className="body">
										<span className="overline">Perfil recarregado</span>{" "}
										{estado.recarregado.motivo === "arquivo" ? "Um arquivo do perfil mudou" : "Você pediu"}
										{estado.recarregado.arquivos?.length ? `: ${estado.recarregado.arquivos.join(", ")}` : ""}.
									</p>
									<Button size="sm" variant="ghost" icon="close" onClick={acoes.fecharAvisoRecarregado}>
										Fechar
									</Button>
								</div>
							) : null}
							{estado.erros.length > 0 ? (
								<div className="aviso-erro" role="alert">
									{estado.erros.map((erro) => (
										<div key={erro.chave}>
											<span className="overline">{nomesOrigem[erro.origem]}</span>
											<p>{erro.mensagem}</p>
										</div>
									))}
									<div>
										<Button size="sm" variant="ghost" onClick={acoes.limparErros}>
											Limpar erros
										</Button>
									</div>
								</div>
							) : null}
							{estado.diagnosticos.length > 0 ? (
								<details className="diagnosticos">
									<summary className="overline">Diagnósticos do perfil: {pad2(estado.diagnosticos.length)}</summary>
									<ul>
										{estado.diagnosticos.map((diagnostico, indice) => (
											<li key={indice} className="body-sm">
												<span className="data">{diagnostico.nivel}</span> {diagnostico.mensagem}
											</li>
										))}
									</ul>
								</details>
							) : null}

							<DocumentoConversa
								conversa={estado.conversa}
								pedidoDaChamada={(id) => (registros[id] ? botaoDoPedido(registros[id]) : undefined)}
								autorDaResposta={autorDaResposta}
								{...(voo ? { voo } : {})}
								aoPousar={() => setVoo(undefined)}
								depois={soltos.map((registro) => (
									<div key={registro.id} className="documento__pedido">
										{botaoDoPedido(registro)}
									</div>
								))}
								vazio={
									<EmptyState glyph="問" tone="moss" title="Conversa nova">
										Escreva abaixo para começar. As respostas aparecem aqui como uma página, bloco a bloco, e as ferramentas que o agente usar
										ficam entre eles.
									</EmptyState>
								}
							/>
						</div>
					</div>
					<div className="centro__pe">
						<BarraPergunta
							texto={texto}
							setTexto={setTexto}
							executando={estado.executando}
							desabilitado={!aberta || Boolean(estado.carregando)}
							fila={estado.fila}
							enviar={enviar}
							parar={parar}
							{...(situacao ? { situacao } : {})}
						/>
					</div>
				</main>

				<AnimatePresence>
				{paineisAbertos ? (
					<motion.aside
						className="coluna coluna--paineis"
						aria-label="Painéis"
						initial={{ opacity: 0, x: 48 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: 48, transition: { duration: 0.16 } }}
						transition={{ type: "spring", stiffness: 380, damping: 30 }}
					>
						<AreaPaineis
							paineis={perfil?.paineis ?? []}
							registro={registroPaineis}
							acoesPorPainel={estado.acoesPorPainel}
							cancelados={estado.cancelados}
							responder={acoes.responderPedido}
							cancelar={acoes.cancelarPedido}
							acaoDaInterface={acoes.acaoDaInterface}
						/>
					</motion.aside>
				) : null}
				</AnimatePresence>
			</div>

			{aberto ? (
				<ModalPedido
					key={aberto.id}
					pedido={aberto}
					registro={registroPaineis}
					numero={numeros[aberto.id] ?? 1}
					acoes={estado.acoesPorPainel[aberto.painel] ?? []}
					cancelados={estado.cancelados}
					responder={acoes.responderPedido}
					cancelar={acoes.cancelarPedido}
					acaoDaInterface={acoes.acaoDaInterface}
					fechar={fecharPedido}
					{...(agenteAtual
						? {
								quemPergunta:
									aberto.estado === "pendente" ? (
										<AgenteAnimado nome={agenteAtual} {...(avatarDe(agenteAtual) ? { avatar: avatarDe(agenteAtual)! } : {})} atividade="perguntando" tamanho={48} />
									) : (
										<AvatarAgente nome={agenteAtual} {...(avatarDe(agenteAtual) ? { avatar: avatarDe(agenteAtual)! } : {})} tamanho={48} />
									),
							}
						: {})}
				/>
			) : null}
		</div>
	);
}
