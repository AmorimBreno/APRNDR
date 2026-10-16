// Tela inicial: um card quadrado por perfil, como a escolha de perfil de um
// app de vídeo, no layout das telas de boot retrô (console no topo, a arte, o
// nome grande, o ideograma com a tradução, a barra de carregar e o lema), com
// os tokens do design system: cor chapada e contorno, sem brilho. A aparência
// vem do campo aparencia do profile.json (capa, cor, lema, glifo).

import { EmptyState, Icon, ORNAMENT_MEANINGS, type OrnamentGlyph, pad2, Wordmark } from "@estudos/design-system";
import { type ErroPerfil, type ResumoPerfil, usePerfis } from "@estudos/ui";

const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function glifoDe(perfil: ResumoPerfil): OrnamentGlyph {
	const glifo = perfil.aparencia?.glifo;
	return glifo && Object.hasOwn(ORNAMENT_MEANINGS, glifo) ? (glifo as OrnamentGlyph) : "学";
}

function CartaoPerfil({ perfil, posicao }: { perfil: ResumoPerfil; posicao: number }) {
	const aparencia = perfil.aparencia ?? {};
	const glifo = glifoDe(perfil);
	const padrao = perfil.agentes.find((agente) => agente.nome === perfil.agentePadrao);
	return (
		<a className={`cartao cartao--${aparencia.cor ?? "amber"}`} href={`#/perfil/${encodeURIComponent(perfil.id)}`}>
			<div className="cartao__console data" aria-hidden="true">
				<span>
					&gt; Perfil {pad2(posicao)} · {pad2(perfil.agentes.length)} {perfil.agentes.length === 1 ? "agente" : "agentes"}:{" "}
					<em>{perfil.agentes.map((agente) => agente.nome).join(", ")}</em>
				</span>
				{padrao?.modelo ? (
					<span>
						&gt; Modelo: <em>{padrao.modelo.replace(/^openrouter\//, "")}</em>
					</span>
				) : null}
			</div>

			<div className="cartao__arte">
				{aparencia.capa ? (
					<img src={aparencia.capa} alt="" draggable={false} />
				) : (
					<span className="cartao__glifo" lang="ja" aria-hidden="true">
						{glifo}
					</span>
				)}
			</div>

			<div className="cartao__nome">
				<span className="cartao__titulo">{perfil.nome}</span>
				<span className="cartao__legenda">
					<span lang="ja">{glifo}</span>
					<span className="overline">{ORNAMENT_MEANINGS[glifo]}</span>
				</span>
			</div>

			<div className="cartao__carregar">
				<span className="overline">{perfil.aberto ? "Continuar" : "Abrir perfil"}</span>
				<span className="cartao__trilho" aria-hidden="true">
					<span className="cartao__enchimento" />
				</span>
			</div>

			<div className="cartao__pe">
				<span className="data">{aparencia.lema ? `“${aparencia.lema}”` : perfil.aberto ? "Aberto agora" : ""}</span>
				<span className="cartao__selo" lang="ja" aria-hidden="true">
					{glifo.charAt(0)}
				</span>
			</div>
		</a>
	);
}

function CartaoErro({ invalido }: { invalido: ErroPerfil }) {
	return (
		<div className="cartao cartao--erro" role="group" aria-label="Perfil com erro">
			<div className="cartao__console data">
				<span>&gt; Erro no profile.json</span>
				<span className="cartao__arquivo">{invalido.arquivo}</span>
			</div>
			<p className="cartao__mensagem code">{invalido.mensagem}</p>
			<div className="cartao__nome">
				<span className="cartao__titulo cartao__titulo--menor">Perfil com erro</span>
			</div>
			<div className="cartao__pe">
				<span className="data">Corrija o arquivo e recarregue</span>
				<Icon name="alert" size={22} strokeWidth={2.5} />
			</div>
		</div>
	);
}

export function TelaPerfis() {
	const { lista, erro, carregando, recarregar } = usePerfis();
	const perfis = lista?.perfis ?? [];
	const invalidos = lista?.erros ?? [];

	let corpo;
	if (erro) {
		corpo = (
			<EmptyState glyph="問" tone="brick" title="Servidor fora do ar" role="alert">
				Não consegui ler a lista de perfis. Confira se o app está rodando (pnpm dev) e tente de novo. {erro}
			</EmptyState>
		);
	} else if (!lista) {
		corpo = (
			<p className="perfis__carregando overline">
				Carregando perfis <span className="ap-cursor" aria-hidden="true" />
			</p>
		);
	} else if (perfis.length === 0 && invalidos.length === 0) {
		corpo = (
			<EmptyState glyph="始" tone="moss" title="Nenhum perfil ainda">
				Perfis ficam em profiles/&lt;id&gt;/profile.json. Cada um define os agentes, as ferramentas e os painéis de um jeito de usar o app.
			</EmptyState>
		);
	} else {
		corpo = (
			<nav className="perfis__grade" aria-label="Perfis">
				{perfis.map((perfil, indice) => (
					<CartaoPerfil key={perfil.id} perfil={perfil} posicao={indice + 1} />
				))}
				{invalidos.map((invalido) => (
					<CartaoErro key={invalido.arquivo} invalido={invalido} />
				))}
			</nav>
		);
	}

	return (
		<div className="perfis">
			<header className="perfis__cabeca">
				<div className="perfis__marca">
					<Wordmark size={32} />
					<h1 className="overline">Escolha um perfil · {mesAno.format(new Date())}</h1>
				</div>
				<button type="button" className="perfis__recarregar button" onClick={recarregar} disabled={carregando}>
					<Icon name="refresh" size={18} strokeWidth={2.25} />
					Recarregar
				</button>
			</header>
			<main className="perfis__corpo">{corpo}</main>
		</div>
	);
}
