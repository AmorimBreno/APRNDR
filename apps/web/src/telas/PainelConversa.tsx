// O painel da conversa: o documento (respostas, notas, ferramentas), a barra
// de pergunta, o modal dos pedidos com o voo, e os erros, diagnósticos e o
// aviso de perfil recarregado. Saiu da JanelaPerfil para valer em dois modos:
//
// - "cheio": a tela cheia de sempre, um filho da grade da JanelaPerfil
//   (a coluna do meio, que a JanelaPerfil monta com o histórico e os painéis);
// - "embutido": um painel que preenche o contêiner do pai (a mesa de estudo
//   do perfil, PropsConversaEmbutida em @estudos/ui). Escondido é hidden e
//   inert, nunca desmontado, para o rascunho, a citação, a resposta em
//   andamento e os pedidos continuarem. Sem seletor de modelo e de agente.
//
// Nada daqui conhece nota, lição ou matéria: o perfil entrega o contexto da
// tela, o cabeçalho e a citação pela PropsConversaEmbutida.

import { Button, EmptyState, pad2 } from "@estudos/design-system";
import {
	AgenteAnimado,
	atividadeDoAgente,
	AvatarAgente,
	BarraPergunta,
	BotaoPedido,
	type ContextoTela,
	DocumentoConversa,
	entradaDoPainel,
	type ErroJanela,
	idsDosPaineis,
	iniciarVoo,
	type ItemAssistente,
	type JanelaPerfilHook,
	ModalPedido,
	numerarPedidos,
	type PropsConversaEmbutida,
	type RegistroPedido,
	resumoDoPedido,
	ROTULOS_ATIVIDADE,
	type ResumoPerfil,
	type Voo,
} from "@estudos/ui";
import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { registroPaineis } from "../paineis.ts";

const nomesOrigem: Record<ErroJanela["origem"], string> = {
	modelo: "Erro do modelo",
	extensao: "Erro de extensão",
	nucleo: "Erro do núcleo",
	servidor: "Erro do servidor",
	pedido: "Erro no pedido",
};

export interface PropsPainelConversa {
	modo: "cheio" | "embutido";
	/** A janela do perfil: um useJanelaPerfil só por perfil (abrir de novo duplicaria). */
	janela: JanelaPerfilHook;
	/** O perfil como /api/perfis devolve; undefined enquanto a lista carrega. */
	perfil?: ResumoPerfil;
	/** Relê a lista de perfis (um perfil recarregado pode ter mudado os agentes). */
	relerPerfis(): void;
	/**
	 * O rascunho do campo, quando o pai precisa guardá-lo (a JanelaPerfil troca
	 * este painel pela tela de carregando e o rascunho não pode se perder).
	 */
	rascunho?: [string, Dispatch<SetStateAction<string>>];
	/** Só no embutido: false = escondido (hidden e inert), nunca desmontado. Padrão true. */
	aberta?: boolean;
	obterContexto?: PropsConversaEmbutida["obterContexto"];
	cabecalho?: ReactNode;
	citacao?: PropsConversaEmbutida["citacao"];
	aoPedidoPendente?: PropsConversaEmbutida["aoPedidoPendente"];
	/** Só no embutido: o link "Abrir na tela cheia" (a rota da conversa do perfil). */
	hrefTelaCheia?: string;
}

const nomeBonito = (nome: string) => nome.charAt(0).toUpperCase() + nome.slice(1);

/** Aviso de perfil recarregado, erros e diagnósticos; `compacto` é a faixa fina do painel embutido. */
function Avisos({ janela, compacto }: { janela: JanelaPerfilHook; compacto: boolean }) {
	const { estado, acoes } = janela;
	const sufixo = compacto ? " aviso--compacto" : "";
	return (
		<>
			{estado.recarregado ? (
				<div className={`aviso-recarregado${sufixo}`} role="status">
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
				<div className={`aviso-erro${sufixo}`} role="alert">
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
				<details className={`diagnosticos${sufixo}`}>
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
		</>
	);
}

export function PainelConversa({
	modo,
	janela,
	perfil,
	relerPerfis,
	rascunho,
	aberta: abertaProp = true,
	obterContexto,
	cabecalho,
	citacao,
	aoPedidoPendente,
	hrefTelaCheia,
}: PropsPainelConversa) {
	const embutido = modo === "embutido";
	const { estado, conexao, acoes } = janela;
	const interno = useState("");
	const [texto, setTexto] = rascunho ?? interno;
	/** A mensagem enviada voando do campo até a nota (movimento.ts). */
	const [voo, setVoo] = useState<Voo>();
	const campo = useRef<HTMLTextAreaElement | null>(null);
	const conectada = conexao === "aberta";
	// O painel embutido escondido não abre modal sozinho (a foto pulsa no lugar).
	const painelVisivel = !embutido || abertaProp;
	const painelVisivelRef = useRef(painelVisivel);
	painelVisivelRef.current = painelVisivel;

	// O perfil recarregado pode ter mudado os agentes: relê a lista.
	const avisoRecarregado = estado.recarregado?.chave;
	useEffect(() => {
		if (avisoRecarregado) relerPerfis();
	}, [avisoRecarregado, relerPerfis]);

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
			// Com o painel embutido fechado o pedido só fica "visto": o botão espera na conversa.
			if (registro.estado === "pendente" && painelVisivelRef.current) {
				setOrigemDoModal("sozinho");
				setFecharAgora(false);
				setPedidoAberto(registro.id);
			}
		}
	}, [registros]);
	const aberto = pedidoAberto ? registros[pedidoAberto] : undefined;
	const estadoDoAberto = aberto?.estado;
	const painelDoAberto = aberto?.painel;
	const anterior = useRef<{ id?: string; estado?: string }>({});
	// O modal nasce do botão do pedido e, ao fechar ou minimizar, encolhe de
	// volta para dentro dele (ModalPedido). Quem fecha é o modal: daqui só se
	// pede (fecharAgora) e ele avisa quando terminou (aoFechar).
	const [origemDoModal, setOrigemDoModal] = useState<"botao" | "sozinho">("sozinho");
	const [fecharAgora, setFecharAgora] = useState(false);
	const abrirPedido = (id: string) => {
		setOrigemDoModal("botao");
		setFecharAgora(false);
		setPedidoAberto(id);
	};
	const fecharPedido = () => setFecharAgora(true);
	const modalFechou = () => {
		setPedidoAberto(undefined);
		setFecharAgora(false);
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

	// Para a tela inicial: há pedido esperando resposta? (a foto pulsa com o painel fechado)
	const haPendente = Object.values(registros).some((registro) => registro.estado === "pendente");
	const aoPendenteRef = useRef(aoPedidoPendente);
	aoPendenteRef.current = aoPedidoPendente;
	useEffect(() => {
		aoPendenteRef.current?.(haPendente);
	}, [haPendente]);

	// Algum painel da área de painéis recebeu algo: no embutido vira o link para a tela cheia.
	const idsDaArea = idsDosPaineis(perfil?.paineis ?? [], estado.acoesPorPainel, registroPaineis);
	const chegadas = idsDaArea.reduce((soma, id) => soma + (estado.acoesPorPainel[id]?.length ?? 0), 0);

	const enviar = () => {
		const mensagem = texto.trim();
		if (!mensagem) return;
		// No embutido a mensagem leva o que a tela mostra agora e o trecho citado.
		let contexto: ContextoTela | undefined;
		if (embutido) {
			contexto = obterContexto?.();
			if (contexto && citacao) contexto = { ...contexto, selecao: citacao.texto };
		}
		// O fantasma sai do campo agora e pousa na nota quando o eco do servidor chegar.
		const novo = campo.current ? iniciarVoo(mensagem, campo.current.getBoundingClientRect()) : undefined;
		setVoo(novo);
		setTexto("");
		acoes.enviar(mensagem, contexto).then(
			(resultado) => {
				// A citação viajou com a mensagem (a fila do núcleo também a guarda): sai do campo.
				if (contexto?.selecao) citacao?.limpar();
				// Na fila, não há nota para pousar agora: a mensagem aparece na lista da fila.
				if (resultado === "enfileirada") {
					novo?.cancelar();
					setVoo(undefined);
				}
			},
			() => {
				// Falhou: o texto volta ao campo e a citação continua onde estava.
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

	// O cabeçalho de cada resposta: a foto e o nome do agente que respondeu. Na
	// resposta que está chegando, a foto reage ao que ele faz.
	const atividade = atividadeDoAgente(estado);
	const avatarDe = (nome: string) => agentes.find((agente) => agente.nome === nome)?.avatar;
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
				{vivo ? <span className="ap-visually-hidden">{ROTULOS_ATIVIDADE[atividade as Exclude<typeof atividade, "parado">]}</span> : null}
			</>
		);
	};
	// O agente trabalhando, no lugar da próxima resposta, enquanto ainda não há texto.
	const aguardando =
		atividade === "parado" || !agenteAtual ? undefined : (
			<>
				<AgenteAnimado nome={agenteAtual} {...(avatarDe(agenteAtual) ? { avatar: avatarDe(agenteAtual)! } : {})} atividade={atividade} />
				<span className="bloco__nome body-strong">{nomeBonito(agenteAtual)}</span>
				<span className="ap-visually-hidden">{ROTULOS_ATIVIDADE[atividade]}</span>
			</>
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

	const documento = (
		<DocumentoConversa
			conversa={estado.conversa}
			pedidoDaChamada={(id) => (registros[id] ? botaoDoPedido(registros[id]) : undefined)}
			autorDaResposta={autorDaResposta}
			{...(aguardando ? { aguardando } : {})}
			{...(voo ? { voo } : {})}
			aoPousar={() => setVoo(undefined)}
			depois={soltos.map((registro) => (
				<div key={registro.id} className="documento__pedido">
					{botaoDoPedido(registro)}
				</div>
			))}
			vazio={
				<EmptyState glyph="問" tone="moss" title="Conversa nova">
					Escreva abaixo para começar. As respostas aparecem aqui como uma página, bloco a bloco, e as ferramentas que o agente usar ficam entre
					eles.
				</EmptyState>
			}
		/>
	);

	const barra = (
		<BarraPergunta
			texto={texto}
			setTexto={setTexto}
			executando={estado.executando}
			desabilitado={!conectada || Boolean(estado.carregando) || (embutido && !estado.pronto)}
			fila={estado.fila}
			enviar={enviar}
			parar={parar}
			campoRef={campo}
			{...(embutido && citacao ? { citacao } : {})}
		/>
	);

	const modal =
		aberto && painelVisivel ? (
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
				origem={origemDoModal}
				fecharAgora={fecharAgora}
				aoFechar={modalFechou}
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
		) : null;

	if (!embutido) {
		return (
			<>
				<main className="centro">
					<div className="rolagem">
						<div className="centro__coluna">
							<Avisos janela={janela} compacto={false} />
							{documento}
						</div>
					</div>
					<div className="centro__pe">{barra}</div>
				</main>
				{modal}
			</>
		);
	}

	const aviso =
		conexao === "reconectando"
			? "Reconectando ao servidor"
			: conexao === "conectando"
				? "Conectando ao servidor"
				: !estado.pronto
					? (estado.carregando ?? "Montando a sessão")
					: undefined;
	return (
		<section
			className="painel-conversa painel-conversa--embutido"
			aria-label="Conversa com o professor"
			hidden={!abertaProp}
			inert={!abertaProp}
		>
			{cabecalho ? <div className="painel-conversa__cabecalho">{cabecalho}</div> : null}
			{aviso ? (
				<p className="painel-conversa__aviso body-sm" role="status">
					{aviso}
				</p>
			) : null}
			<div className="painel-conversa__avisos">
				<Avisos janela={janela} compacto />
			</div>
			<div className="rolagem painel-conversa__rolagem">
				{estado.pronto ? (
					<div className="painel-conversa__coluna">{documento}</div>
				) : (
					<div className="painel-conversa__esqueleto" aria-hidden="true">
						<span />
						<span />
						<span />
					</div>
				)}
			</div>
			{chegadas > 0 && hrefTelaCheia ? (
				<a className="painel-conversa__tela-cheia body-sm" href={hrefTelaCheia}>
					Abrir na tela cheia
				</a>
			) : null}
			<div className="centro__pe">{barra}</div>
			{modal}
		</section>
	);
}
