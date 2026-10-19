// O menu de cadernos (design-system/README.md, "Telas e fluxo"): a faixa
// escura com a marca e, na folha de papel, os cadernos das matérias na
// SubjectWheel do design system, um por matéria, com a capa NotebookCover na
// cor e no ideograma dela. "Abrir" leva ao caderno (TelaCaderno); a última
// linha, "Nova matéria", abre o modal de criar; a tecla Materiais abre os
// materiais da matéria do meio da roda.
//
// A sessão do perfil vem da TelaEstudos; a lista vem da extensão de matérias
// (extensions/materias.ts) pela ponte, no painel "cadernos".

import { Button, Icon, type OrnamentGlyph, pad2, Stat, SubjectWheel, type SubjectItem } from "@estudos/design-system";
import { type ControleFaixaMarca, FaixaMarca, type JanelaPerfilHook, type PropsTelaInicial, semEsperar, type SituacaoMaterial } from "@estudos/ui";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Materia, pastaMateriaisRelativa } from "../../lib/materia-tipos.ts";
import { dataCurta, lerAcoes, PAINEL_CADERNOS, proximaProva, quando, rotuloCapa } from "./comum.ts";
import { ModalMateria } from "./ModalMateria.tsx";
import { ModalMateriais } from "./ModalMateriais.tsx";

const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

/** Altura de uma linha da roda (--wheel-row do design system), em px de CSS. */
const LINHA_RODA = 128;

function itemDaRoda(materia: Materia, indice: number, hoje: Date, materiais: number): SubjectItem {
	const prova = proximaProva(materia, hoje);
	const contagem = materiais ? ` · ${materiais} ${materiais === 1 ? "material" : "materiais"}` : "";
	return {
		id: materia.id,
		title: materia.nome,
		kicker: `Caderno ${pad2(indice + 1)}${prova ? ` · ${prova.nome} ${quando(prova.dias)}` : ""}${contagem}`,
		...(prova ? { meta: dataCurta(prova.data) } : {}),
		cover: { tone: materia.cor, glyph: materia.glifo as OrnamentGlyph, label: rotuloCapa(materia.nome), number: pad2(indice + 1) },
	};
}

/** Linhas visíveis da roda que cabem na altura (ímpar, pelo menos 1: numa janela baixa, sem barra de rolagem). */
function linhasQueCabem(altura: number): number {
	const linhas = Math.floor(altura / LINHA_RODA);
	return Math.max(1, linhas % 2 === 0 ? linhas - 1 : linhas);
}

export interface PropsTelaCadernos extends PropsTelaInicial {
	janela: JanelaPerfilHook;
	/** A matéria do meio da roda (guardada pela TelaEstudos: voltar do caderno cai nela). */
	escolhida?: string;
	escolher(id: string): void;
}

export function TelaCadernos(props: PropsTelaCadernos) {
	const { estado, acoes } = props.janela;
	const sessaoId = estado.sessao?.sessaoId;
	const recebidas = estado.acoesPorPainel[PAINEL_CADERNOS];
	const { lista, erro } = useMemo(() => lerAcoes(recebidas ?? []), [recebidas]);

	// Com a sessão aberta (e de novo se ela mudar, como depois de uma reconexão), pede as listas.
	useEffect(() => {
		if (!sessaoId) return;
		semEsperar(acoes.acaoDaInterface(PAINEL_CADERNOS, "listar"));
		semEsperar(acoes.listarMateriais());
	}, [sessaoId, acoes]);

	const [criando, setCriando] = useState(false);
	const [vendoMateriais, setVendoMateriais] = useState(false);

	// A faixa entra como bandeira; para sair (para os perfis, a conversa ou um caderno), ela sobe antes.
	const faixa = useRef<ControleFaixaMarca>(null);
	const sairE = (ir: () => void) => () => {
		void (faixa.current?.sair() ?? Promise.resolve()).then(ir);
	};

	// Quantas linhas da roda cabem na folha.
	const corpo = useRef<HTMLDivElement>(null);
	const [linhas, setLinhas] = useState(5);
	useLayoutEffect(() => {
		const elemento = corpo.current;
		if (!elemento) return;
		const medir = () => setLinhas(linhasQueCabem(elemento.clientHeight));
		medir();
		const observador = new ResizeObserver(medir);
		observador.observe(elemento);
		return () => observador.disconnect();
	}, []);

	const materias = lista?.materias ?? [];
	const hoje = new Date();
	const materiaisDe = (id: string): SituacaoMaterial[] | undefined => estado.materiais?.filter((material) => material.pasta === pastaMateriaisRelativa(id));
	const itens = materias.map((materia, indice) => itemDaRoda(materia, indice, hoje, materiaisDe(materia.id)?.length ?? 0));
	// A matéria do meio da roda (a roda começa na primeira; na linha "Nova matéria", nenhuma).
	const escolhida = props.escolhida ?? materias[0]?.id;
	const materiaAtual = materias.find((materia) => materia.id === escolhida);
	const problemaAoAbrir = !lista && !erro && estado.erros.at(-1)?.mensagem;

	return (
		<div className="tela">
			<FaixaMarca ref={faixa} bandeira legenda={`${props.perfil?.nome ?? "Estudos"} · ${mesAno.format(new Date())}`} glifo="書">
				<Stat value={pad2(materias.length)} label="Cadernos" size="lg" accent />
				<Button icon="arrow-left" onClick={sairE(props.voltar)}>
					Perfis
				</Button>
			</FaixaMarca>
			{/* O card do perfil, na tela de perfis, tem o mesmo nome: ele cresce até virar esta folha. */}
			<main className="folha" style={{ viewTransitionName: `perfil-${props.perfilId}`, viewTransitionClass: "perfil" }}>
				<header className="folha__cabeca">
					<h1 className="overline" style={{ margin: 0 }}>
						Seus cadernos
					</h1>
					<span className="data">
						{pad2(materias.length)} {materias.length === 1 ? "caderno" : "cadernos"}
					</span>
				</header>
				<div className="folha__corpo cadernos__corpo" ref={corpo}>
					{erro || problemaAoAbrir ? (
						<div className="folha__aviso" role="alert">
							<h2 className="display-sm" style={{ margin: 0 }}>
								Não consegui abrir os cadernos
							</h2>
							<p className="body-lg">{erro ?? problemaAoAbrir}</p>
							{erro ? null : (
								<p className="body-lg">
									As conversas também ficam na pasta de dados: se ela estiver no Google Drive, confira se ele está aberto e sincronizado e tente de novo.
								</p>
							)}
							<div>
								<button
									type="button"
									className="tecla-papel button"
									// Sem sessão (ela não abriu), tentar de novo é abrir o perfil de novo: recarregar a tela.
									onClick={() => (sessaoId ? semEsperar(acoes.acaoDaInterface(PAINEL_CADERNOS, "listar")) : window.location.reload())}
								>
									<Icon name="refresh" size={18} strokeWidth={2.25} />
									Tentar de novo
								</button>
							</div>
						</div>
					) : !lista ? (
						<div className="folha__aviso" aria-live="polite">
							<p className="body-lg cadernos__abrindo">Abrindo os cadernos…</p>
						</div>
					) : (
						<SubjectWheel
							items={itens}
							{...(escolhida ? { value: escolhida } : {})}
							onChange={props.escolher}
							onOpen={(id) => sairE(() => props.navegar(`caderno/${id}`))()}
							createLabel="Nova matéria"
							createKicker={materias.length === 0 ? "Comece pelo primeiro caderno" : "Um caderno novo"}
							onCreate={() => setCriando(true)}
							visibleRows={linhas}
							label="Cadernos das matérias"
							className="cadernos__roda"
						/>
					)}
				</div>
				<footer className="folha__pe">
					<span className="overline">
						{lista?.erros.length
							? `${lista.erros.length === 1 ? "Uma pasta" : `${lista.erros.length} pastas`} de matéria com problema: ${lista.erros.map((item) => item.pasta).join(", ")}`
							: "Abra um caderno para ver a linha do tempo e os materiais da matéria"}
					</span>
					<span className="cadernos__teclas">
						<button
							type="button"
							className="tecla-papel button"
							disabled={!materiaAtual}
							title={materiaAtual ? `Materiais de ${materiaAtual.nome}` : "Escolha uma matéria na roda"}
							onClick={() => setVendoMateriais(true)}
						>
							<Icon name="paperclip" size={18} strokeWidth={2.25} />
							Materiais
						</button>
						<button type="button" className="tecla-papel button" onClick={sairE(props.abrirConversa)}>
							Conversar com o professor
							<Icon name="arrow-right" size={18} strokeWidth={2.25} />
						</button>
					</span>
				</footer>
			</main>
			<ModalMateriais
				aberto={vendoMateriais && Boolean(materiaAtual)}
				fechar={() => setVendoMateriais(false)}
				{...(materiaAtual ? { materia: materiaAtual } : {})}
				{...(materiaAtual && estado.materiais ? { materiais: materiaisDe(materiaAtual.id) ?? [] } : {})}
				pasta={materiaAtual ? pastaMateriaisRelativa(materiaAtual.id) : ""}
				enviar={(arquivos) => (materiaAtual ? acoes.enviarMateriais(pastaMateriaisRelativa(materiaAtual.id), arquivos) : Promise.resolve([]))}
				reprocessar={(caminho) => acoes.reprocessarMaterial(caminho)}
			/>
			<ModalMateria
				aberto={criando}
				fechar={() => setCriando(false)}
				recebidas={recebidas ?? []}
				numero={materias.length + 1}
				salvar={(entrada) => acoes.acaoDaInterface(PAINEL_CADERNOS, "criar", entrada)}
				salva={(id) => {
					props.escolher(id);
					setCriando(false);
				}}
			/>
		</div>
	);
}
