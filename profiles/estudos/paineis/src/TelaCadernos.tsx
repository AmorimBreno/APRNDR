// Tela inicial do perfil de estudos: o menu de cadernos (design-system/README.md,
// "Telas e fluxo"). A faixa escura com a marca e, na folha de papel, a lista de
// cadernos das matérias. Os cadernos ainda não existem (ESPECIFICACAO 8.1,
// Etapa 4): a folha diz o que falta e para que serve, e o pé leva à conversa
// com o professor. Na Etapa 4 a lista vira a SubjectWheel do design system.

import { Button, Icon, pad2, Stat } from "@estudos/design-system";
import { FaixaMarca, type PropsTelaInicial } from "@estudos/ui";

const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

export function TelaCadernos(props: PropsTelaInicial) {
	// Os cadernos chegam na Etapa 4; até lá, a lista é vazia.
	const cadernos: number = 0;
	return (
		<div className="tela">
			<FaixaMarca legenda={`${props.perfil?.nome ?? "Estudos"} · ${mesAno.format(new Date())}`} glifo="書">
				<Stat value={pad2(cadernos)} label="Cadernos" size="lg" accent />
				<Button icon="arrow-left" onClick={props.voltar}>
					Perfis
				</Button>
			</FaixaMarca>
			<main className="folha">
				<header className="folha__cabeca">
					<h1 className="overline" style={{ margin: 0 }}>
						Seus cadernos
					</h1>
					<span className="data">
						{pad2(cadernos)} {cadernos === 1 ? "caderno" : "cadernos"}
					</span>
				</header>
				<div className="folha__corpo">
					<div className="folha__aviso">
						<h2 className="display-sm" style={{ margin: 0 }}>
							Nenhum caderno ainda
						</h2>
						<p className="body-lg">
							Cadernos guardam suas anotações, os resumos do professor e os questionários de cada matéria. Cada matéria vai ter o seu, criado
							pelo guia de novo plano de estudos.
						</p>
					</div>
					<div className="linha linha--inativa" aria-disabled="true">
						<span className="linha__numero" aria-hidden="true">
							<Icon name="plus" size={40} strokeWidth={2.5} />
						</span>
						<span className="linha__texto">
							<span className="overline">Em breve</span>
							<span className="linha__titulo display-md">Novo plano de estudos</span>
						</span>
					</div>
				</div>
				<footer className="folha__pe">
					<span className="overline">Enquanto isso, a conversa com o professor já funciona</span>
					<button type="button" className="tecla-papel button" onClick={props.abrirConversa}>
						Conversar com o professor
						<Icon name="arrow-right" size={18} strokeWidth={2.25} />
					</button>
				</footer>
			</main>
		</div>
	);
}
