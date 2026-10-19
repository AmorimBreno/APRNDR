// Tela inicial do perfil de estudos: o menu de cadernos (design-system/README.md,
// "Telas e fluxo"). A faixa escura com a marca e, na folha de papel, os
// cadernos das matérias na SubjectWheel do design system, um por matéria, com
// a capa NotebookCover na cor e no ideograma dela. A última linha, "Nova
// matéria", abre o modal de criar.
//
// A tela abre a sessão do perfil para falar com a extensão de matérias
// (extensions/materias.ts) pela ponte: manda "listar" e "criar" ao painel
// "cadernos" e recebe "lista", "criada" e "erro". Por enquanto, abrir um
// caderno abre a conversa com o professor (item 4.1 do docs/PLANO.md).

import { Button, Icon, Modal, NotebookCover, type OrnamentGlyph, pad2, Stat, SubjectWheel, type SubjectItem, TextField } from "@estudos/design-system";
import { type AcaoRecebida, type ControleFaixaMarca, FaixaMarca, type PropsTelaInicial, semEsperar, useJanelaPerfil } from "@estudos/ui";
import { type FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CORES_MATERIA, type CorMateria, type EntradaMateria, GLIFOS_MATERIA, type ListaMaterias, type Materia } from "../../lib/materia-tipos.ts";

/** O painel da ponte que a extensão de matérias atende. */
export const PAINEL_CADERNOS = "cadernos";

const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
const UM_DIA = 24 * 60 * 60 * 1000;

/** Altura de uma linha da roda (--wheel-row do design system), em px de CSS. */
const LINHA_RODA = 128;

/** A data AAAA-MM-DD como meia-noite local. */
const dataLocal = (data: string) => new Date(`${data}T00:00:00`);

/** A próxima prova (hoje ou depois) e quantos dias faltam. */
function proximaProva(materia: Materia, hoje: Date) {
	const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
	const futuras = materia.provas
		.map((prova) => ({ ...prova, dias: Math.round((dataLocal(prova.data).getTime() - inicio) / UM_DIA) }))
		.filter((prova) => prova.dias >= 0)
		.sort((a, b) => a.dias - b.dias);
	return futuras[0];
}

function quando(dias: number): string {
	if (dias === 0) return "hoje";
	if (dias === 1) return "amanhã";
	return `em ${dias} dias`;
}

/** O nome curto na etiqueta da capa: a primeira palavra. */
const rotuloCapa = (nome: string) => nome.split(" ")[0] ?? nome;

function itemDaRoda(materia: Materia, indice: number, hoje: Date): SubjectItem {
	const prova = proximaProva(materia, hoje);
	return {
		id: materia.id,
		title: materia.nome,
		kicker: `Caderno ${pad2(indice + 1)}${prova ? ` · ${prova.nome} ${quando(prova.dias)}` : ""}`,
		...(prova ? { meta: diaMes.format(dataLocal(prova.data)).replace(".", "") } : {}),
		cover: { tone: materia.cor, glyph: materia.glifo as OrnamentGlyph, label: rotuloCapa(materia.nome), number: pad2(indice + 1) },
	};
}

/** O que a extensão mandou ao painel "cadernos": a última lista e um erro, se ele veio depois dela. */
function lerAcoes(acoes: AcaoRecebida[]): { lista?: ListaMaterias; erro?: string } {
	let lista: ListaMaterias | undefined;
	let erro: string | undefined;
	for (const acao of acoes) {
		if (acao.acao === "lista") {
			lista = acao.dados as ListaMaterias;
			erro = undefined;
		} else if (acao.acao === "erro" && (acao.dados as { ao?: string } | undefined)?.ao !== "criar") {
			erro = (acao.dados as { mensagem?: string } | undefined)?.mensagem ?? "Erro desconhecido.";
		}
	}
	return { ...(lista ? { lista } : {}), ...(erro ? { erro } : {}) };
}

/** Linhas visíveis da roda que cabem na altura (ímpar, pelo menos 3). */
function linhasQueCabem(altura: number): number {
	const linhas = Math.floor(altura / LINHA_RODA);
	return Math.max(3, linhas % 2 === 0 ? linhas - 1 : linhas);
}

const semAcoes: AcaoRecebida[] = [];

export function TelaCadernos(props: PropsTelaInicial) {
	const { estado, acoes } = useJanelaPerfil(props.perfilId);
	const sessaoId = estado.sessao?.sessaoId;
	const recebidas = estado.acoesPorPainel[PAINEL_CADERNOS] ?? semAcoes;
	const { lista, erro } = useMemo(() => lerAcoes(recebidas), [recebidas]);

	// Com a sessão aberta (e de novo se ela mudar, como depois de uma reconexão), pede a lista.
	useEffect(() => {
		if (sessaoId) semEsperar(acoes.acaoDaInterface(PAINEL_CADERNOS, "listar"));
	}, [sessaoId, acoes]);

	const [escolhida, setEscolhida] = useState<string | undefined>(undefined);
	const [criando, setCriando] = useState(false);

	// A faixa entra como bandeira; para sair (para os perfis ou para a conversa), ela sobe antes.
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
	const itens = materias.map((materia, indice) => itemDaRoda(materia, indice, hoje));
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
							{...(escolhida && materias.some((materia) => materia.id === escolhida) ? { value: escolhida } : {})}
							onChange={setEscolhida}
							onOpen={() => sairE(props.abrirConversa)()}
							createLabel="Nova matéria"
							createKicker={materias.length === 0 ? "Comece pelo primeiro caderno" : "Um caderno novo"}
							onCreate={() => setCriando(true)}
							visibleRows={linhas}
							label="Cadernos das matérias"
						/>
					)}
				</div>
				<footer className="folha__pe">
					<span className="overline">
						{lista?.erros.length
							? `${lista.erros.length === 1 ? "Uma pasta" : `${lista.erros.length} pastas`} de matéria com problema: ${lista.erros.map((item) => item.pasta).join(", ")}`
							: "Por enquanto, abrir um caderno leva à conversa com o professor"}
					</span>
					<button type="button" className="tecla-papel button" onClick={sairE(props.abrirConversa)}>
						Conversar com o professor
						<Icon name="arrow-right" size={18} strokeWidth={2.25} />
					</button>
				</footer>
			</main>
			<ModalNovaMateria
				aberto={criando}
				fechar={() => setCriando(false)}
				recebidas={recebidas}
				numero={materias.length + 1}
				criar={(entrada) => acoes.acaoDaInterface(PAINEL_CADERNOS, "criar", entrada)}
				criada={(id) => {
					setEscolhida(id);
					setCriando(false);
				}}
			/>
		</div>
	);
}

interface PropsModalNovaMateria {
	aberto: boolean;
	fechar(): void;
	/** As ações do painel "cadernos": a resposta do criar ("criada" ou "erro") chega por elas. */
	recebidas: AcaoRecebida[];
	criar(entrada: EntradaMateria): Promise<void>;
	criada(id: string): void;
	/** O número do caderno novo, na capa de amostra. */
	numero: number;
}

const NOMES_COR: Record<CorMateria, string> = { moss: "Musgo", amber: "Âmbar", steel: "Aço", ink: "Tinta", cream: "Creme", sage: "Sálvia" };

/** O modal de criar matéria: nome, cor, ideograma e, se já souber, a data da prova. */
function ModalNovaMateria(props: PropsModalNovaMateria) {
	const [nome, setNome] = useState("");
	const [cor, setCor] = useState<CorMateria>("moss");
	const [glifo, setGlifo] = useState<string>("学");
	const [prova, setProva] = useState("");
	const [dataProva, setDataProva] = useState("");
	const [erro, setErro] = useState<string | undefined>(undefined);
	/**
	 * Mandou o criar e espera a resposta: a primeira "criada" ou "erro" depois
	 * da ação que tinha chegado por último (a chave dela; null se não havia nenhuma).
	 */
	const [esperando, setEsperando] = useState<string | null | undefined>(undefined);

	// Ao abrir, começa do zero.
	useEffect(() => {
		if (!props.aberto) return;
		setNome("");
		setCor("moss");
		setGlifo("学");
		setProva("");
		setDataProva("");
		setErro(undefined);
		setEsperando(undefined);
	}, [props.aberto]);

	// A resposta do criar.
	const { recebidas, criada } = props;
	useEffect(() => {
		if (esperando === undefined) return;
		const depois = esperando === null ? 0 : recebidas.findIndex((acao) => acao.chave === esperando) + 1;
		for (const acao of recebidas.slice(depois)) {
			const dados = acao.dados as { id?: string; mensagem?: string; ao?: string } | undefined;
			if (acao.acao === "criada" && dados?.id) {
				setEsperando(undefined);
				criada(dados.id);
				return;
			}
			if (acao.acao === "erro") {
				setEsperando(undefined);
				setErro(dados?.mensagem ?? "Não consegui criar a matéria.");
				return;
			}
		}
	}, [recebidas, esperando, criada]);

	const enviando = esperando !== undefined;
	const enviar = (evento?: FormEvent) => {
		evento?.preventDefault();
		if (!nome.trim() || enviando) return;
		setErro(undefined);
		setEsperando(recebidas.at(-1)?.chave ?? null);
		const entrada: EntradaMateria = { nome, cor, glifo, ...(dataProva ? { provas: [{ nome: prova.trim() || "Prova", data: dataProva }] } : {}) };
		props.criar(entrada).catch((falha: unknown) => {
			setEsperando(undefined);
			setErro(falha instanceof Error ? falha.message : String(falha));
		});
	};

	return (
		<Modal
			open={props.aberto}
			onClose={props.fechar}
			title="Nova matéria"
			kicker="Um caderno para a matéria"
			size="md"
			dismissible={!enviando}
			footer={
				<>
					<Button variant="ghost" onClick={props.fechar} disabled={enviando}>
						Cancelar
					</Button>
					<Button variant="primary" iconRight="arrow-right" onClick={() => enviar()} disabled={!nome.trim() || enviando}>
						{enviando ? "Criando…" : "Criar caderno"}
					</Button>
				</>
			}
		>
			<form className="nova-materia" onSubmit={enviar}>
				<div className="nova-materia__campos">
					<TextField
						label="Nome"
						placeholder="Cálculo I"
						value={nome}
						maxLength={80}
						onChange={(evento) => setNome(evento.target.value)}
						autoFocus
					/>
					<fieldset className="nova-materia__grupo">
						<legend className="overline">Cor da capa</legend>
						<div className="nova-materia__cores" role="radiogroup" aria-label="Cor da capa">
							{CORES_MATERIA.map((opcao) => (
								<button
									key={opcao}
									type="button"
									role="radio"
									aria-checked={cor === opcao}
									aria-label={NOMES_COR[opcao]}
									title={NOMES_COR[opcao]}
									className="nova-materia__cor"
									onClick={() => setCor(opcao)}
								>
									<NotebookCover size="sm" tone={opcao} glyph={glifo as OrnamentGlyph} />
								</button>
							))}
						</div>
					</fieldset>
					<fieldset className="nova-materia__grupo">
						<legend className="overline">Ideograma</legend>
						<div className="nova-materia__glifos" role="radiogroup" aria-label="Ideograma">
							{GLIFOS_MATERIA.map((opcao) => (
								<button
									key={opcao}
									type="button"
									role="radio"
									aria-checked={glifo === opcao}
									className="nova-materia__glifo"
									onClick={() => setGlifo(opcao)}
								>
									{opcao}
								</button>
							))}
						</div>
					</fieldset>
					<div className="nova-materia__prova">
						<TextField label="Prova" placeholder="P1" value={prova} maxLength={40} onChange={(evento) => setProva(evento.target.value)} />
						<TextField
							label="Data da prova"
							type="date"
							value={dataProva}
							onChange={(evento) => setDataProva(evento.target.value)}
							hint="Opcional. Dá para marcar depois."
						/>
					</div>
				</div>
				<div className="nova-materia__capa" aria-hidden="true">
					<NotebookCover size="lg" tone={cor} glyph={glifo as OrnamentGlyph} label={rotuloCapa(nome.trim()) || "Matéria"} number={pad2(props.numero)} />
				</div>
				{erro ? (
					<p className="nova-materia__erro body-sm" role="alert">
						{erro}
					</p>
				) : null}
				{/* Enter no campo cria: o form precisa de um submit. */}
				<button type="submit" hidden />
			</form>
		</Modal>
	);
}
