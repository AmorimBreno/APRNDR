// Janela do perfil: a barra tijolo no topo (a linha do perfil virou aba),
// o histórico de conversas à esquerda, a conversa como documento no meio com
// a barra de pergunta no pé e, à direita, a área de painéis (abre sozinha
// quando um painel dela recebe algo). Os pedidos que esperam resposta viram
// botões na conversa e são respondidos num modal, que abre sozinho quando o
// pedido chega e pode ser minimizado. A lógica fica no @estudos/ui.

import { Icon, Tag } from "@estudos/design-system";
import {
	type AparenciaContextos,
	AreaPaineis,
	Contador,
	type EntradaTelaInicial,
	Historico,
	idsDosPaineis,
	type InfoModelo,
	type ResumoSessao,
	SeletorAgente,
	SeletorModelo,
	semEsperar,
	useJanelaPerfil,
	usePerfis,
} from "@estudos/ui";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { registroPaineis } from "../paineis.ts";
import { PainelConversa } from "./PainelConversa.tsx";
import { TelaCarregando } from "./TelaCarregando.tsx";

const dolar = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const inteiro = new Intl.NumberFormat("pt-BR");

export interface PropsJanelaPerfil {
	perfilId: string;
	/** Para onde o botão da esquerda da barra volta: a tela inicial do perfil ou a de perfis. */
	voltar: { rotulo: string; hash: string };
	/** Hook do perfil com o rótulo e a cor de agora de cada contexto (EntradaTelaInicial). Fixo por perfil. */
	usarAparenciaContextos?: EntradaTelaInicial["usarAparenciaContextos"];
}

const semAparencia: AparenciaContextos = {};

export function JanelaPerfil({ perfilId, voltar, usarAparenciaContextos }: PropsJanelaPerfil) {
	const janela = useJanelaPerfil(perfilId);
	const { estado, conexao, acoes } = janela;
	// O hook do perfil é o mesmo enquanto a janela existe (a App remonta a janela ao trocar de perfil).
	const aparencia = usarAparenciaContextos?.(janela) ?? semAparencia;
	const perfis = usePerfis();
	const perfil = perfis.lista?.perfis.find((item) => item.id === perfilId);

	// O rascunho fica aqui: o PainelConversa some enquanto o perfil recarrega (tela de carregando).
	const rascunho = useState("");
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

	// A área de painéis abre sozinha quando um painel dela recebe uma ação nova
	// (os pedidos vão para o modal, não para a área).
	const idsDaArea = idsDosPaineis(perfil?.paineis ?? [], estado.acoesPorPainel, registroPaineis);
	const chegadas = idsDaArea.reduce((soma, id) => soma + (estado.acoesPorPainel[id]?.length ?? 0), 0);
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
				voltar={voltar}
			/>
		);
	}

	const agentes = perfil?.agentes ?? [];
	const agenteAtual = estado.sessao?.agente ?? "";
	const ocupado = !aberta || estado.executando;
	const uso = estado.uso;

	return (
		<div className="janela">
			<header className="topo">
				<button type="button" className="topo__voltar button" onClick={() => (window.location.hash = voltar.hash)}>
					<Icon name="list" size={18} strokeWidth={2.5} />
					{voltar.rotulo}
				</button>
				{/* Uma conversa com contexto (a de um caderno) mostra o assunto; a geral, o perfil. */}
				<div className="topo__titulo">
					<span className="overline">{estado.sessao?.contexto ? `${nomePerfil} · conversa de` : "Perfil"}</span>
					<h1 className="display-sm">
						{estado.sessao?.contexto ? (aparencia[estado.sessao.contexto.chave]?.rotulo ?? estado.sessao.contexto.rotulo) : nomePerfil}
					</h1>
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
						{...(estado.sessao?.contexto ? { contexto: estado.sessao.contexto } : {})}
						aparencia={aparencia}
						desabilitado={!aberta}
						novaSessao={() => semEsperar(acoes.novaSessao())}
						abrirSessao={(id) => semEsperar(acoes.abrirSessao(id))}
					/>
				</aside>

				<PainelConversa
					modo="cheio"
					janela={janela}
					{...(perfil ? { perfil } : {})}
					relerPerfis={perfis.recarregar}
					rascunho={rascunho}
				/>

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
		</div>
	);
}
