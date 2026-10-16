// PROVISÓRIO: janela do perfil crua (sessões, seletores, chat, painéis).
// Só prova que o pi está ligado à interface; será trocada no redesenho. A
// lógica fica no @estudos/ui (useJanelaPerfil, AreaPaineis).

import {
	AreaPaineis,
	type InfoModelo,
	type ResumoSessao,
	semEsperar,
	useJanelaPerfil,
	usePerfis,
} from "@estudos/ui";
import { useEffect, useState } from "react";
import { registroPaineis } from "../paineis.ts";
import { TelaCarregando } from "../telas/TelaCarregando.tsx";
import { CampoMensagem, Conversa } from "./Chat.tsx";

function formatarData(iso: string): string {
	const data = new Date(iso);
	return Number.isNaN(data.getTime()) ? iso : data.toLocaleString("pt-BR");
}

export function JanelaPerfilProvisoria({ perfilId }: { perfilId: string }) {
	const { estado, conexao, acoes } = useJanelaPerfil(perfilId);
	const perfis = usePerfis();
	const perfil = perfis.lista?.perfis.find((item) => item.id === perfilId);

	const [texto, setTexto] = useState("");
	const [sessoes, setSessoes] = useState<ResumoSessao[]>([]);
	const [modelos, setModelos] = useState<InfoModelo[]>([]);
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

	const avisoConexao =
		conexao === "reconectando" ? <p>Reconectando…</p> : conexao === "conectando" ? <p>Conectando ao servidor…</p> : null;

	const erros =
		estado.erros.length > 0 ? (
			<div>
				<strong>Erros</strong>{" "}
				<button type="button" onClick={acoes.limparErros}>
					Limpar
				</button>
				<ul>
					{estado.erros.map((erro) => (
						<li key={erro.chave} style={{ whiteSpace: "pre-wrap" }}>
							[{erro.origem}] {erro.mensagem}
						</li>
					))}
				</ul>
			</div>
		) : null;

	if (!estado.pronto) {
		const aviso = conexao === "reconectando" ? "Reconectando ao servidor" : conexao === "conectando" ? "Conectando ao servidor" : undefined;
		return (
			<TelaCarregando
				nomePerfil={perfil?.nome ?? perfilId}
				{...(estado.carregando ? { etapa: estado.carregando } : {})}
				{...(aviso ? { aviso } : {})}
				erros={estado.erros}
				limparErros={acoes.limparErros}
			/>
		);
	}

	const modeloAtual = estado.sessao?.modelo ?? "";
	const opcoesModelo = modelos.some((modelo) => modelo.nome === modeloAtual) || !modeloAtual
		? modelos.map((modelo) => modelo.nome)
		: [modeloAtual, ...modelos.map((modelo) => modelo.nome)];
	const agentes = perfil?.agentes ?? [];
	const agenteAtual = estado.sessao?.agente ?? "";
	const uso = estado.uso;

	return (
		<div className="provisorio" style={{ display: "flex", height: "100vh", gap: 16, padding: 8, boxSizing: "border-box" }}>
			<aside style={{ width: 240, overflowY: "auto", flexShrink: 0 }}>
				<p>
					<a href="#/">Perfis</a>
				</p>
				<h2>{perfil?.nome ?? perfilId}</h2>
				<button type="button" onClick={() => semEsperar(acoes.novaSessao())} disabled={!aberta}>
					Nova conversa
				</button>
				<h3>Sessões</h3>
				<ul>
					{sessoes.map((sessao) => (
						<li key={sessao.id}>
							{sessao.id === sessaoId ? (
								<strong>{sessao.titulo || "(sem título)"}</strong>
							) : (
								<button type="button" onClick={() => semEsperar(acoes.abrirSessao(sessao.id))} disabled={!aberta}>
									{sessao.titulo || "(sem título)"}
								</button>
							)}
							<br />
							<small>
								{formatarData(sessao.modificadaEm)} · {sessao.mensagens} msg.{sessao.agente ? ` · ${sessao.agente}` : ""}
							</small>
						</li>
					))}
				</ul>
			</aside>

			<main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
				<div>
					<label>
						Agente:{" "}
						<select
							value={agenteAtual}
							onChange={(evento) => semEsperar(acoes.trocarAgente(evento.target.value))}
							disabled={!aberta || estado.executando}
						>
							{agentes.some((agente) => agente.nome === agenteAtual) ? null : <option value={agenteAtual}>{agenteAtual}</option>}
							{agentes.map((agente) => (
								<option key={agente.nome} value={agente.nome}>
									{agente.nome} ({agente.papel})
								</option>
							))}
						</select>
					</label>{" "}
					<label>
						Modelo:{" "}
						<select
							value={modeloAtual}
							onChange={(evento) => semEsperar(acoes.trocarModelo(evento.target.value))}
							disabled={!aberta || estado.executando}
						>
							{opcoesModelo.map((nome) => (
								<option key={nome} value={nome}>
									{nome}
								</option>
							))}
						</select>
					</label>{" "}
					<button type="button" onClick={() => semEsperar(acoes.recarregarPerfil())} disabled={!aberta}>
						Recarregar perfil
					</button>
				</div>
				<p>
					Sessão {sessaoId ?? "?"} · raciocínio {estado.sessao?.raciocinio ?? "?"} · custo da sessão US$ {uso.custo.toFixed(4)} (
					{uso.tokensTotal} tokens, {uso.respostas} respostas)
					{estado.executando ? " · respondendo…" : ""}
				</p>
				{avisoConexao}
				{estado.carregando ? <p>Carregando: {estado.carregando}</p> : null}
				{estado.recarregado ? (
					<p>
						Perfil recarregado ({estado.recarregado.motivo === "arquivo" ? "arquivo mudou" : "pedido"})
						{estado.recarregado.arquivos?.length ? `: ${estado.recarregado.arquivos.join(", ")}` : ""}.{" "}
						<button type="button" onClick={acoes.fecharAvisoRecarregado}>
							Fechar
						</button>
					</p>
				) : null}
				{estado.diagnosticos.length > 0 ? (
					<details>
						<summary>Diagnósticos ({estado.diagnosticos.length})</summary>
						<ul>
							{estado.diagnosticos.map((diagnostico, indice) => (
								<li key={indice} style={{ whiteSpace: "pre-wrap" }}>
									[{diagnostico.nivel}] {diagnostico.mensagem}
								</li>
							))}
						</ul>
					</details>
				) : null}
				{erros}

				<Conversa conversa={estado.conversa} />

				{estado.fila.length > 0 ? (
					<div>
						<strong>Na fila</strong>
						<ol>
							{estado.fila.map((mensagem, indice) => (
								<li key={indice} style={{ whiteSpace: "pre-wrap" }}>
									{mensagem}
								</li>
							))}
						</ol>
					</div>
				) : null}
				<CampoMensagem
					texto={texto}
					setTexto={setTexto}
					executando={estado.executando}
					desabilitado={!aberta || Boolean(estado.carregando)}
					enviar={enviar}
					parar={parar}
				/>
			</main>

			<aside style={{ width: 320, overflowY: "auto", flexShrink: 0 }}>
				<h2>Painéis</h2>
				<AreaPaineis
					paineis={perfil?.paineis ?? []}
					registro={registroPaineis}
					acoesPorPainel={estado.acoesPorPainel}
					pedidos={estado.pedidos}
					cancelados={estado.cancelados}
					responder={acoes.responderPedido}
					acaoDaInterface={acoes.acaoDaInterface}
				/>
			</aside>
		</div>
	);
}
