// Tela inicial: a faixa da marca e, na folha de papel, a lista de perfis
// (GET /api/perfis). Perfis inválidos aparecem no fim, com o erro.

import { Icon, pad2, Stat, Tag } from "@estudos/design-system";
import { type ErroPerfil, type ResumoPerfil, usePerfis } from "@estudos/ui";
import { FaixaMarca } from "./FaixaMarca.tsx";

const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function plural(n: number, um: string, varios: string): string {
	return `${pad2(n)} ${n === 1 ? um : varios}`;
}

function LinhaPerfil({ perfil, posicao }: { perfil: ResumoPerfil; posicao: number }) {
	const detalhes = [
		`Perfil ${pad2(posicao)}`,
		plural(perfil.agentes.length, "agente", "agentes"),
		plural(perfil.paineis.length, "painel", "painéis"),
	].join(" · ");
	return (
		<a className="linha" href={`#/perfil/${encodeURIComponent(perfil.id)}`}>
			<span className="linha__numero display-lg" aria-hidden="true">
				{pad2(posicao)}
			</span>
			<span className="linha__texto">
				<span className="overline">{detalhes}</span>
				<span className="linha__titulo display-md">{perfil.nome}</span>
			</span>
			<span className="linha__lado">
				{perfil.aberto ? (
					<Tag tone="sage" dot>
						Aberto
					</Tag>
				) : null}
				<span className="linha__abrir button">
					Abrir <Icon name="arrow-right" size={18} strokeWidth={2.25} />
				</span>
			</span>
		</a>
	);
}

function LinhaErro({ invalido }: { invalido: ErroPerfil }) {
	return (
		<div className="linha linha--erro">
			<span className="linha__numero">
				<Icon name="alert" size={40} strokeWidth={2.5} label="Erro" />
			</span>
			<span className="linha__texto">
				<span className="linha__arquivo data">{invalido.arquivo}</span>
				<p className="linha__erro code">{invalido.mensagem}</p>
			</span>
			<span className="linha__lado">
				<Tag tone="brick" icon="alert">
					Inválido
				</Tag>
			</span>
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
			<div className="folha__aviso" role="alert">
				<h2 className="display-sm" style={{ margin: 0 }}>
					Servidor fora do ar
				</h2>
				<p className="body-lg">Não consegui ler a lista de perfis. Confira se o app está rodando (pnpm dev) e tente de novo.</p>
				<p className="code" style={{ color: "var(--on-paper-muted)" }}>
					{erro}
				</p>
			</div>
		);
	} else if (!lista) {
		corpo = (
			<div className="folha__aviso">
				<p className="overline" style={{ display: "flex", alignItems: "center", gap: 12 }}>
					Carregando perfis <span className="ap-cursor" aria-hidden="true" />
				</p>
			</div>
		);
	} else {
		corpo = (
			<>
				{perfis.length === 0 ? (
					<div className="folha__aviso">
						<h2 className="display-sm" style={{ margin: 0 }}>
							Nenhum perfil ainda
						</h2>
						<p className="body-lg">
							Perfis ficam em profiles/&lt;id&gt;/profile.json. Cada um define os agentes, as ferramentas e os painéis de um jeito de usar o
							app.
						</p>
					</div>
				) : (
					<nav aria-label="Perfis">
						{perfis.map((perfil, indice) => (
							<LinhaPerfil key={perfil.id} perfil={perfil} posicao={indice + 1} />
						))}
					</nav>
				)}
				{invalidos.length > 0 ? (
					<section aria-label="Perfis com erro">
						<p className="folha__secao overline">Com erro: corrija o profile.json e recarregue a lista</p>
						{invalidos.map((invalido) => (
							<LinhaErro key={invalido.arquivo} invalido={invalido} />
						))}
					</section>
				) : null}
			</>
		);
	}

	return (
		<div className="tela">
			<FaixaMarca legenda={`Seus perfis · ${mesAno.format(new Date())}`} glifo="学習">
				<Stat value={pad2(perfis.length)} label={perfis.length === 1 ? "Perfil pronto" : "Perfis prontos"} size="lg" accent />
			</FaixaMarca>
			<main className="folha">
				<header className="folha__cabeca">
					<h1 className="overline" style={{ margin: 0 }}>
						Escolha um perfil
					</h1>
					{lista ? <span className="data">{plural(perfis.length, "perfil", "perfis")}</span> : null}
				</header>
				<div className="folha__corpo">{corpo}</div>
				<footer className="folha__pe">
					<span className="overline">Perfis em profiles/</span>
					<button type="button" className="tecla-papel button" onClick={recarregar} disabled={carregando}>
						<Icon name="refresh" size={18} strokeWidth={2.25} />
						Recarregar lista
					</button>
				</footer>
			</main>
		</div>
	);
}
