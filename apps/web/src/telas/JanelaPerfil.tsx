// Janela do perfil: a barra tijolo no topo (a linha do perfil virou aba),
// o histórico de conversas à esquerda, a conversa como documento no meio com
// a barra de pergunta no pé e, à direita, a área de painéis (abre sozinha
// quando um painel recebe algo). A lógica fica no @estudos/ui.

import { Button, EmptyState, Icon, pad2, Tag } from "@estudos/design-system";
import {
	AreaPaineis,
	BarraPergunta,
	DocumentoConversa,
	type ErroJanela,
	Historico,
	type InfoModelo,
	type ResumoSessao,
	SeletorModelo,
	semEsperar,
	useJanelaPerfil,
	usePerfis,
} from "@estudos/ui";
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

export function JanelaPerfil({ perfilId }: { perfilId: string }) {
	const { estado, conexao, acoes } = useJanelaPerfil(perfilId);
	const perfis = usePerfis();
	const perfil = perfis.lista?.perfis.find((item) => item.id === perfilId);

	const [texto, setTexto] = useState("");
	const [sessoes, setSessoes] = useState<ResumoSessao[]>([]);
	const [modelos, setModelos] = useState<InfoModelo[]>([]);
	const [paineisAbertos, setPaineisAbertos] = useState(false);
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

	// A área de painéis abre sozinha quando chega uma ação ou um pedido novo.
	const chegadas = estado.pedidos.length + Object.values(estado.acoesPorPainel).reduce((soma, lista) => soma + lista.length, 0);
	const chegadasAntes = useRef(chegadas);
	useEffect(() => {
		if (chegadas > chegadasAntes.current) setPaineisAbertos(true);
		chegadasAntes.current = chegadas;
	}, [chegadas]);

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
			/>
		);
	}

	const enviar = () => {
		const mensagem = texto.trim();
		if (!mensagem) return;
		setTexto("");
		acoes.enviar(mensagem).catch(() => setTexto(mensagem));
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
	const pedidosEsperando = estado.pedidos.length;

	return (
		<div className="janela">
			<header className="topo">
				<button type="button" className="topo__voltar button" onClick={() => (window.location.hash = "#/")}>
					<Icon name="list" size={18} strokeWidth={2.5} />
					Perfis
				</button>
				<div className="topo__titulo">
					<span className="overline">Perfil</span>
					<h1 className="display-sm">{nomePerfil}</h1>
				</div>

				<div className="topo__controles">
					<label className="topo__controle">
						<span className="overline">Agente</span>
						<select
							className="topo__select data"
							value={agenteAtual}
							onChange={(evento) => semEsperar(acoes.trocarAgente(evento.target.value))}
							disabled={ocupado}
						>
							{agentes.some((agente) => agente.nome === agenteAtual) ? null : <option value={agenteAtual}>{agenteAtual}</option>}
							{agentes.map((agente) => (
								<option key={agente.nome} value={agente.nome}>
									{agente.nome} ({agente.papel})
								</option>
							))}
						</select>
						<Icon name="chevron-down" size={16} />
					</label>
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
						US$ {dolar.format(uso.custo)} · {inteiro.format(uso.tokensTotal)} tokens
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
						{pedidosEsperando ? <span className="topo__contador data">{pad2(pedidosEsperando)}</span> : null}
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
						/>
					</div>
				</main>

				{paineisAbertos ? (
					<aside className="coluna coluna--paineis" aria-label="Painéis">
						<AreaPaineis
							paineis={perfil?.paineis ?? []}
							registro={registroPaineis}
							acoesPorPainel={estado.acoesPorPainel}
							pedidos={estado.pedidos}
							cancelados={estado.cancelados}
							responder={acoes.responderPedido}
							cancelar={acoes.cancelarPedido}
							acaoDaInterface={acoes.acaoDaInterface}
						/>
					</aside>
				) : null}
			</div>
		</div>
	);
}
