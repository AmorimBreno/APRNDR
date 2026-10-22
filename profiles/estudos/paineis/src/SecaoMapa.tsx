// A seção Mapa de conteúdo do caderno (item 4.4, docs/mapa-conteudo.md): os
// conceitos que o mapeador tirou dos materiais, em ordem, com a referência de
// onde cada um aparece. O Breno revisa (tira, traz de volta, marca a
// prioridade, muda a ordem arrastando pela grade de seis pontos ou pelos
// botões, edita o nome e a descrição no lugar, escreve conceitos novos) e
// aprova. Cada mudança vai para a extensão como um lote de operações e
// aparece na hora (mapa-ponte.ts, useMapa).
//
// De cima para baixo: o erro da extensão (dá para fechar), a situação com
// Refazer e Aprovar, o mapeamento em andamento (com Parar) ou os arquivos
// pendentes (com Mapear), a lista numerada, "Conceito novo" e, fechada no
// começo, "Fora do mapa".

import { Button, Callout, EmptyState, Icon, Modal, pad2, Tag, type Tone } from "@estudos/design-system";
import { MenuSuspenso } from "@estudos/ui";
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Conceito, contarMapa, novoIdConceito, type Operacao, type Prioridade, semFonte } from "../../lib/mapa-tipos.ts";
import {
	agruparReferencias,
	custoDoMapa,
	type MapaDaMateria,
	moverDepoisDoArrasto,
	moverUmLugar,
	progressoAndamento,
	resumoMapa,
	rotuloSituacao,
	textoAndamento,
	textoPendentes,
} from "./mapa-ponte.ts";
import { formatarDolar } from "./ModalMateriais.tsx";

const MOLA = { type: "spring", stiffness: 420, damping: 34 } as const;

const OPCOES_PRIORIDADE = [
	{ id: "alta", titulo: "Alta" },
	{ id: "normal", titulo: "Normal" },
	{ id: "baixa", titulo: "Baixa" },
];

export interface PropsSecaoMapa {
	mapa: MapaDaMateria;
	/** Cor da capa, para o bloco do ideograma do mapa vazio. */
	tom: Tone;
	irParaMateriais(): void;
	/** Abre a seção Materiais com o arquivo em destaque. */
	abrirMaterial(arquivo: string): void;
}

export function SecaoMapa(props: PropsSecaoMapa) {
	const { estado, mapa, erros } = props.mapa;
	// Um id por abertura da seção: a extensão grava um evento revisou_mapa por edicao.
	const [edicao] = useState(() => crypto.randomUUID());
	const operar = (operacoes: Operacao[]) => props.mapa.operar(edicao, operacoes);
	const [confirmarRefazer, setConfirmarRefazer] = useState(false);
	const [verFora, setVerFora] = useState(false);

	const avisos = erros.length ? (
		<div className="mapa__erros">
			<AnimatePresence initial={false}>
				{erros.map((erro) => (
					<motion.div key={erro.chave} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={MOLA}>
						<Callout tone="amber" label="Não deu certo" icon="alert">
							<p>
								{erro.mensagem}
								{erro.arquivo && !erro.mensagem.includes(erro.arquivo) ? ` (${erro.arquivo})` : ""}
							</p>
							<div className="mapa__botoes">
								<Button variant="secondary" size="sm" icon="close" onClick={() => props.mapa.fecharErro(erro.chave)}>
									Fechar
								</Button>
							</div>
						</Callout>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	) : null;

	if (!estado || !mapa) {
		return (
			<div className="mapa">
				{avisos}
				<p className="body caderno__carregando">Abrindo o mapa…</p>
			</div>
		);
	}

	const contas = contarMapa(mapa);
	const andamento = estado.andamento;
	const mapeando = Boolean(andamento) || estado.fila.length > 0;
	const pendentes = estado.pendentes;
	const vazio = mapa.conceitos.length === 0 && pendentes.length === 0 && !mapeando;

	if (vazio) {
		return (
			<div className="mapa">
				{avisos}
				<EmptyState
					glyph="知"
					tone={props.tom}
					title="Sem mapa ainda"
					action={
						<Button variant="primary" icon="paperclip" onClick={props.irParaMateriais}>
							Ir para Materiais
						</Button>
					}
				>
					Adicione materiais na seção Materiais: o mapa é montado sozinho a partir deles.
				</EmptyState>
			</div>
		);
	}

	const situacao = rotuloSituacao(mapa);
	const arquivosMapeados = Object.keys(mapa.arquivos).length;
	const custo = custoDoMapa(mapa);
	const porQueNaoAprova =
		mapa.situacao === "aprovado" ? "O mapa já está aprovado." : contas.dentro === 0 ? "Traga ou escreva pelo menos um conceito antes de aprovar." : mapeando ? "Espere o mapeamento terminar." : undefined;
	const fora = mapa.conceitos.filter((conceito) => conceito.fora);

	return (
		<div className="mapa">
			{avisos}
			<div className="mapa__situacao">
				<Tag size="sm" tone={situacao.tom} {...(mapa.situacao === "aprovado" ? { icon: "check" as const } : mapa.situacao === "alterado" ? { icon: "alert" as const } : {})}>
					{situacao.texto}
				</Tag>
				<span className="data mapa__resumo">{resumoMapa(mapa)}</span>
				<span className="mapa__acoes-mapa">
					<Button variant="secondary" icon="refresh" onClick={() => setConfirmarRefazer(true)} disabled={arquivosMapeados === 0 || mapeando}>
						Refazer o mapa
					</Button>
					<span title={porQueNaoAprova}>
						<Button variant="primary" icon="check" onClick={props.mapa.aprovar} disabled={Boolean(porQueNaoAprova)}>
							{mapa.situacao === "alterado" ? "Aprovar de novo" : "Aprovar mapa"}
						</Button>
					</span>
				</span>
			</div>

			{andamento ? (
				<Callout tone="steel" label="Mapeando" icon="bulb" quote={false}>
					{(() => {
						const { texto, fila } = textoAndamento(andamento, estado.fila);
						return (
							<p>
								{texto}
								{fila ? <span className="mapa__fila"> {fila}</span> : null}
							</p>
						);
					})()}
					<span className="mapa__barra" aria-hidden="true">
						<motion.span initial={false} animate={{ width: `${Math.round(progressoAndamento(andamento) * 100)}%` }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
					</span>
					<div className="mapa__botoes">
						<Button variant="ghost" size="sm" icon="stop" onClick={props.mapa.cancelar}>
							Parar
						</Button>
					</div>
				</Callout>
			) : pendentes.length > 0 ? (
				<Callout tone="cream" label="Para mapear" icon="file" quote={false}>
					<p>{textoPendentes(pendentes)}</p>
					<p className="body-sm mapa__pendentes">{pendentes.map((pendente) => pendente.arquivo).join(" · ")}</p>
					<div className="mapa__botoes">
						<Button variant="secondary" size="sm" icon="bulb" onClick={() => props.mapa.mapear()}>
							Mapear
						</Button>
					</div>
				</Callout>
			) : null}

			<ListaConceitos conceitos={mapa.conceitos} operar={operar} abrirMaterial={props.abrirMaterial} />
			<ConceitoNovo adicionar={(nome, descricao) => operar([{ tipo: "adicionar", id: novoIdConceito(), nome, ...(descricao ? { descricao } : {}) }])} />

			{fora.length > 0 ? (
				<section className="mapa__fora">
					<button type="button" className="mapa__fora-cabeca" aria-expanded={verFora} onClick={() => setVerFora((valor) => !valor)}>
						<span className="overline">Fora do mapa ({fora.length})</span>
						<motion.span className="mapa__seta" animate={{ rotate: verFora ? 90 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
							<Icon name="chevron-right" size={16} strokeWidth={2.5} />
						</motion.span>
					</button>
					<AnimatePresence initial={false}>
						{verFora ? (
							<motion.div
								key="fora"
								className="mapa__dobra"
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: "auto", opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{ type: "spring", stiffness: 420, damping: 38 }}
							>
								<ul className="mapa__fora-lista">
									{fora.map((conceito) => (
										<li key={conceito.id} className="mapa__fora-item">
											<span className="mapa__fora-texto">
												<span className="body-strong">{conceito.nome}</span>
												{conceito.descricao ? <span className="body-sm mapa__descricao-fora">{conceito.descricao}</span> : null}
											</span>
											<Button variant="ghost" size="sm" onClick={() => operar([{ tipo: "trazer", id: conceito.id }])}>
												Trazer de volta
											</Button>
											{conceito.origem === "usuario" ? (
												<Button variant="danger" size="sm" onClick={() => operar([{ tipo: "apagar", id: conceito.id }])}>
													Apagar
												</Button>
											) : null}
										</li>
									))}
								</ul>
							</motion.div>
						) : null}
					</AnimatePresence>
				</section>
			) : null}

			<Modal
				open={confirmarRefazer}
				onClose={() => setConfirmarRefazer(false)}
				kicker="Mapa de conteúdo"
				title="Refazer o mapa?"
				size="sm"
				footer={
					<>
						<Button variant="secondary" onClick={() => setConfirmarRefazer(false)}>
							Cancelar
						</Button>
						<Button
							variant="primary"
							icon="refresh"
							onClick={() => {
								setConfirmarRefazer(false);
								props.mapa.refazer();
							}}
						>
							Refazer o mapa
						</Button>
					</>
				}
			>
				<p className="body">
					{arquivosMapeados === 1 ? "Mapeia de novo o arquivo." : `Mapeia de novo os ${arquivosMapeados} arquivos, um por vez.`} O que você decidiu (tirar,
					prioridade, ordem, nomes) continua.
				</p>
				{custo > 0 ? <p className="body">O primeiro mapeamento custou {formatarDolar(custo)}.</p> : null}
			</Modal>
		</div>
	);
}

/** Os conceitos de dentro, numerados, que mudam de ordem arrastando pela grade. */
function ListaConceitos(props: { conceitos: Conceito[]; operar(operacoes: Operacao[]): void; abrirMaterial(arquivo: string): void }) {
	const dentro = props.conceitos.filter((conceito) => !conceito.fora);
	const ids = dentro.map((conceito) => conceito.id);
	const porId = new Map(dentro.map((conceito) => [conceito.id, conceito]));
	// Durante o arrasto, a ordem é da tela; ao soltar, vira uma operação mover e volta a ser a do mapa.
	const [arrasto, setArrasto] = useState<string[] | null>(null);
	const ordem = arrasto ? [...arrasto.filter((id) => porId.has(id)), ...ids.filter((id) => !arrasto.includes(id))] : ids;
	const ordemAtual = useRef(ordem);
	ordemAtual.current = ordem;

	if (dentro.length === 0) {
		return (
			<p className="body-sm mapa__nenhum">
				{props.conceitos.length === 0 ? "Nenhum conceito ainda. Mapeie os arquivos acima ou escreva um conceito novo." : "Nenhum conceito dentro do mapa. Traga algum de volta ou escreva um novo."}
			</p>
		);
	}

	const soltar = (id: string) => {
		const operacao = moverDepoisDoArrasto(ids, ordemAtual.current, id);
		setArrasto(null);
		if (operacao) props.operar([operacao]);
	};
	const mover = (id: string, direcao: "subir" | "descer") => {
		const operacao = moverUmLugar(ids, id, direcao);
		if (operacao) props.operar([operacao]);
	};

	return (
		<Reorder.Group as="ol" axis="y" values={ordem} onReorder={setArrasto} className="mapa__lista" aria-label="Conceitos do mapa">
			{ordem.map((id, indice) => (
				<LinhaConceito
					key={id}
					conceito={porId.get(id)!}
					numero={indice + 1}
					primeiro={indice === 0}
					ultimo={indice === ordem.length - 1}
					operar={props.operar}
					soltar={() => soltar(id)}
					mover={(direcao) => mover(id, direcao)}
					abrirMaterial={props.abrirMaterial}
				/>
			))}
		</Reorder.Group>
	);
}

interface PropsLinha {
	conceito: Conceito;
	numero: number;
	primeiro: boolean;
	ultimo: boolean;
	operar(operacoes: Operacao[]): void;
	soltar(): void;
	mover(direcao: "subir" | "descer"): void;
	abrirMaterial(arquivo: string): void;
}

/** Espaço entre a etiqueta e o "+N" (o gap de .mapa__ref). */
const VAO_MAIS = 6;

/**
 * Uma referência: o arquivo e os locais, numa etiqueta que abre o arquivo nos
 * materiais. Quando os locais não cabem na linha, a etiqueta mostra os que
 * cabem e um "+N" no fim; o "+N" abre a etiqueta inteira (quebrando a linha) e
 * o "−" fecha de novo. Quantos cabem é medido numa cópia escondida da
 * etiqueta, de novo sempre que a largura da linha muda.
 */
function EtiquetaReferencia(props: { arquivo: string; locais: string[]; abrir(): void }) {
	const { arquivo, locais } = props;
	const [aberta, setAberta] = useState(false);
	const [cabem, setCabem] = useState(locais.length);
	const caixa = useRef<HTMLSpanElement>(null);
	const medida = useRef<HTMLSpanElement>(null);
	const chave = locais.join("\n");

	useLayoutEffect(() => {
		const linha = caixa.current?.parentElement;
		const copia = medida.current;
		if (aberta || !linha || !copia) return;
		const medir = () => {
			const etiqueta = copia.querySelector<HTMLElement>(".ap-tag");
			const pedacos = [...copia.querySelectorAll<HTMLElement>("[data-local]")];
			const mais = copia.querySelector<HTMLElement>(".mapa__mais");
			const ultimo = pedacos.at(-1);
			if (!etiqueta || !mais || !ultimo) return;
			const largura = linha.clientWidth;
			if (etiqueta.offsetWidth <= largura) return setCabem(pedacos.length);
			// O que sobra depois do último pedaço (o respiro da direita da etiqueta).
			const respiro = etiqueta.offsetWidth - (ultimo.offsetLeft + ultimo.offsetWidth);
			let quantos = 1;
			pedacos.forEach((pedaco, indice) => {
				if (pedaco.offsetLeft + pedaco.offsetWidth + respiro + VAO_MAIS + mais.offsetWidth <= largura) quantos = indice + 1;
			});
			setCabem(quantos);
		};
		medir();
		const observador = new ResizeObserver(medir);
		observador.observe(linha);
		return () => observador.disconnect();
	}, [chave, aberta]);

	const escondidos = aberta ? 0 : locais.length - Math.min(cabem, locais.length);
	const visiveis = aberta ? locais : locais.slice(0, locais.length - escondidos);
	return (
		<span ref={caixa} className={`mapa__ref${aberta ? " mapa__ref--aberta" : ""}`}>
			<button type="button" className="mapa__referencia" title={`Abrir ${arquivo} nos materiais`} onClick={props.abrir}>
				<Tag size="sm" tone="cream" icon="file">
					<span className="mapa__referencia-texto">{visiveis.length ? `${arquivo} · ${visiveis.join(", ")}` : arquivo}</span>
				</Tag>
			</button>
			{escondidos > 0 || aberta ? (
				<button
					type="button"
					className="data mapa__mais"
					aria-expanded={aberta}
					aria-label={aberta ? `Mostrar menos locais de ${arquivo}` : `Mostrar mais ${escondidos} locais de ${arquivo}`}
					onClick={() => setAberta(!aberta)}
				>
					{aberta ? "−" : `+${escondidos}`}
				</button>
			) : null}
			{aberta || locais.length === 0 ? null : (
				<span ref={medida} className="mapa__medida" aria-hidden="true">
					<Tag size="sm" tone="cream" icon="file">
						<span>
							{arquivo} ·{" "}
							{locais.map((local, indice) => (
								<span key={indice} data-local="">
									{local}
									{indice < locais.length - 1 ? ", " : ""}
								</span>
							))}
						</span>
					</Tag>
					<span className="data mapa__mais">+{locais.length}</span>
				</span>
			)}
		</span>
	);
}

function LinhaConceito(props: PropsLinha) {
	const { conceito } = props;
	const controles = useDragControls();
	const [arrastando, setArrastando] = useState(false);
	const editar = (campo: "nome" | "descricao", valor: string) =>
		props.operar([campo === "nome" ? { tipo: "editar", id: conceito.id, nome: valor } : { tipo: "editar", id: conceito.id, descricao: valor }]);
	const referencias = agruparReferencias(conceito.referencias);
	const semOrigem = semFonte(conceito);
	return (
		<Reorder.Item
			value={conceito.id}
			as="li"
			dragListener={false}
			dragControls={controles}
			onDragStart={() => setArrastando(true)}
			onDragEnd={() => {
				setArrastando(false);
				props.soltar();
			}}
			transition={MOLA}
			className={`mapa__conceito${arrastando ? " mapa__conceito--arrastando" : ""}`}
		>
			<span
				className="mapa__alca"
				aria-hidden="true"
				title="Arraste para mudar de lugar"
				onPointerDown={(evento) => {
					evento.preventDefault();
					controles.start(evento);
				}}
			>
				<span className="mapa__pontos" />
			</span>
			<span className="data mapa__numero">{pad2(props.numero)}</span>
			<div className="mapa__texto">
				<CampoNoLugar
					valor={conceito.nome}
					rotulo={`Nome do conceito ${conceito.nome}`}
					classe="body-strong mapa__nome"
					obrigatorio
					salvar={(valor) => editar("nome", valor)}
				/>
				<CampoNoLugar
					valor={conceito.descricao}
					rotulo={`Descrição de ${conceito.nome}`}
					classe="body-sm mapa__descricao"
					vazio="Sem descrição"
					longo
					salvar={(valor) => editar("descricao", valor)}
				/>
				{referencias.length || conceito.novo || semOrigem ? (
					<div className="mapa__marcas">
						{referencias.map((referencia) => (
							<EtiquetaReferencia
								key={referencia.arquivo}
								arquivo={referencia.arquivo}
								locais={referencia.locais}
								abrir={() => props.abrirMaterial(referencia.arquivo)}
							/>
						))}
						{conceito.novo ? (
							<Tag size="sm" tone="amber">
								Novo
							</Tag>
						) : null}
						{semOrigem ? (
							<Tag size="sm" tone="brick" icon="alert" title="O material de onde ele veio saiu da matéria.">
								Sem fonte
							</Tag>
						) : null}
					</div>
				) : null}
			</div>
			<MenuSuspenso
				opcoes={OPCOES_PRIORIDADE}
				atual={conceito.prioridade}
				escolher={(valor) => props.operar([{ tipo: "prioridade", id: conceito.id, valor: valor as Prioridade }])}
				conteudoBotao={
					conceito.prioridade === "alta" ? (
						<Tag size="sm" tone="brick">
							Alta
						</Tag>
					) : conceito.prioridade === "baixa" ? (
						<Tag size="sm" tone="outline">
							Baixa
						</Tag>
					) : (
						<span className="body-sm">Prioridade</span>
					)
				}
				classeBotao={`mapa__prioridade-botao${conceito.prioridade === "normal" ? " mapa__prioridade-botao--normal" : ""}`}
				rotulo={`Prioridade de ${conceito.nome}: ${conceito.prioridade}`}
				rotuloMenu="Prioridade"
				className="mapa__prioridade"
			/>
			<span className="mapa__acoes">
				<Button variant="ghost" size="sm" iconOnly icon="arrow-up" aria-label={`Subir ${conceito.nome}`} title="Subir" disabled={props.primeiro} onClick={() => props.mover("subir")} />
				<Button
					variant="ghost"
					size="sm"
					iconOnly
					icon="arrow-up"
					className="mapa__descer"
					aria-label={`Descer ${conceito.nome}`}
					title="Descer"
					disabled={props.ultimo}
					onClick={() => props.mover("descer")}
				/>
				<Button
					variant="ghost"
					size="sm"
					iconOnly
					icon="close"
					aria-label={`Tirar ${conceito.nome} do mapa`}
					title="Tirar do mapa"
					onClick={() => props.operar([{ tipo: "tirar", id: conceito.id }])}
				/>
			</span>
		</Reorder.Item>
	);
}

interface PropsCampo {
	valor: string;
	rotulo: string;
	classe: string;
	salvar(valor: string): void;
	/** Vazio não salva (o nome). */
	obrigatorio?: boolean;
	/** O texto apagado quando o valor está vazio. */
	vazio?: string;
	/** Uma caixa de várias linhas (a descrição); Enter salva do mesmo jeito. */
	longo?: boolean;
}

/** Um texto que vira campo ao clicar: Enter ou sair salva, Esc desiste. */
function CampoNoLugar(props: PropsCampo) {
	const [editando, setEditando] = useState(false);
	const [texto, setTexto] = useState(props.valor);
	// Já terminou (Enter, Esc ou sair): o blur que vem quando o campo some não salva de novo.
	const terminou = useRef(false);
	const campo = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
	useEffect(() => {
		if (!editando) return;
		campo.current?.focus();
		campo.current?.select();
	}, [editando]);

	const abrir = () => {
		terminou.current = false;
		setTexto(props.valor);
		setEditando(true);
	};
	const terminar = () => {
		if (terminou.current) return;
		terminou.current = true;
		setEditando(false);
		const limpo = texto.trim();
		if (props.obrigatorio && !limpo) return;
		if (limpo !== props.valor.trim()) props.salvar(limpo);
	};
	const tecla = (evento: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		if (evento.key === "Enter" && !evento.shiftKey) {
			evento.preventDefault();
			terminar();
		} else if (evento.key === "Escape") {
			evento.preventDefault();
			evento.stopPropagation();
			terminou.current = true;
			setEditando(false);
		}
	};

	if (editando) {
		const comum = {
			ref: campo,
			className: `${props.classe} mapa__campo`,
			value: texto,
			"aria-label": props.rotulo,
			onChange: (evento: { target: { value: string } }) => setTexto(evento.target.value),
			onBlur: terminar,
			onKeyDown: tecla,
			...(props.obrigatorio && !texto.trim() ? { "aria-invalid": true } : {}),
		};
		return props.longo ? <textarea {...comum} rows={2} /> : <input {...comum} type="text" />;
	}
	return (
		<button type="button" className={`${props.classe} mapa__editavel${props.valor ? "" : " mapa__editavel--vazio"}`} aria-label={`${props.rotulo}: editar`} onClick={abrir}>
			{props.valor || props.vazio}
		</button>
	);
}

/** "Conceito novo": a linha com o nome e a descrição; Enter adiciona no fim, Esc fecha. */
function ConceitoNovo(props: { adicionar(nome: string, descricao: string): void }) {
	const [aberto, setAberto] = useState(false);
	const [nome, setNome] = useState("");
	const [descricao, setDescricao] = useState("");
	const campoNome = useRef<HTMLInputElement>(null);

	const fechar = () => {
		setAberto(false);
		setNome("");
		setDescricao("");
	};
	const tecla = (evento: KeyboardEvent<HTMLInputElement>) => {
		if (evento.key === "Enter") {
			evento.preventDefault();
			if (!nome.trim()) return campoNome.current?.focus();
			props.adicionar(nome.trim(), descricao.trim());
			// Fica aberta para o próximo, como uma lista.
			setNome("");
			setDescricao("");
			campoNome.current?.focus();
		} else if (evento.key === "Escape") {
			evento.preventDefault();
			fechar();
		}
	};

	if (!aberto) {
		return (
			<div className="mapa__novo-botao">
				<Button variant="ghost" icon="plus" onClick={() => setAberto(true)}>
					Conceito novo
				</Button>
			</div>
		);
	}
	return (
		<motion.div className="mapa__novo" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={MOLA}>
			<Icon name="plus" size={18} strokeWidth={2.5} />
			<div className="mapa__novo-campos">
				<input
					ref={campoNome}
					type="text"
					className="body-strong mapa__campo"
					placeholder="Nome do conceito"
					aria-label="Nome do conceito novo"
					value={nome}
					onChange={(evento) => setNome(evento.target.value)}
					onKeyDown={tecla}
					autoFocus
				/>
				<input
					type="text"
					className="body-sm mapa__campo"
					placeholder="Descrição (opcional)"
					aria-label="Descrição do conceito novo"
					value={descricao}
					onChange={(evento) => setDescricao(evento.target.value)}
					onKeyDown={tecla}
				/>
				<span className="body-sm mapa__novo-ajuda">Enter adiciona no fim · Esc fecha</span>
			</div>
			<Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Fechar o conceito novo" onClick={fechar} />
		</motion.div>
	);
}
