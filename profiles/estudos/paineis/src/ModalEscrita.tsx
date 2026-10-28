// "Como o professor escreve" (docs/escrita.md, "A tela"): as regras de escrita
// do Breno num modal grande. Abre pela tecla "Escrita" no pé da tela de
// cadernos e pelo link no índice da visão do módulo.
//
// Em cima, a linha do contrato. Cada regra: o texto editável no lugar
// (CampoNoLugar, Enter ou sair salva, Esc desiste), a matéria num seletor
// (Todas as matérias ou uma pelo nome), ligar e desligar (Switch, vale na
// hora), "Apagar" com a confirmação no próprio lugar e, se ela veio de um
// retorno de bloco, a etiqueta "de um retorno". No fim, "Regra nova" (um
// campo; Enter salva). Sem regras, o vazio com um exemplo. Os erros, num
// Callout.
//
// As regras vêm da ponte "escrita" (useEscrita, escrita-ponte.ts): salvar e
// apagar esperam a resposta, sem mudança otimista.

import { Button, Callout, EmptyState, Icon, Modal, Switch, Tag } from "@estudos/design-system";
import { MenuSuspenso, semMovimento } from "@estudos/ui";
import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { type EntradaRegra, type RegraEscrita, TEXTO_REGRA_MAXIMO } from "../../lib/escrita-tipos.ts";
import type { EscritaDoProfessor } from "./escrita-ponte.ts";
import {
	contagemDasRegras,
	EXEMPLO_REGRA,
	LINHA_CONTRATO,
	materiaDaOpcao,
	nomeDaMateria,
	opcaoDaMateria,
	opcoesDaRegra,
	rotuloDaOrigem,
	TITULO_ESCRITA,
	TITULO_SEM_REGRAS,
} from "./escrita-tela.ts";
import { CampoNoLugar } from "./SecaoMapa.tsx";

const MOLA = { type: "spring", stiffness: 420, damping: 36 } as const;

/** As matérias do seletor (o id e o nome). */
export type MateriasDoSeletor = ReadonlyArray<{ id: string; nome: string }>;

export interface PropsModalEscrita {
	aberto: boolean;
	fechar(): void;
	escrita: EscritaDoProfessor;
	materias: MateriasDoSeletor;
}

export function ModalEscrita(props: PropsModalEscrita) {
	const regras = props.escrita.regras;
	return (
		<Modal
			open={props.aberto}
			onClose={props.fechar}
			title={TITULO_ESCRITA}
			kicker={regras ? `Regras de escrita · ${contagemDasRegras(regras)}` : "Regras de escrita"}
			size="lg"
			footer={
				// Sem regras, a ação principal é a do vazio ("Regra nova"): no máximo um primário por vista.
				<Button variant={regras && regras.length === 0 ? "secondary" : "primary"} onClick={props.fechar}>
					Fechar
				</Button>
			}
		>
			<ConteudoEscrita escrita={props.escrita} materias={props.materias} />
		</Modal>
	);
}

/** A linha do contrato, o erro, a lista das regras (ou o vazio) e "Regra nova". */
export function ConteudoEscrita(props: { escrita: EscritaDoProfessor; materias: MateriasDoSeletor }) {
	const { escrita, materias } = props;
	const regras = escrita.regras;
	const [erro, setErro] = useState<string | undefined>(undefined);
	const [novaAberta, setNovaAberta] = useState(false);
	// O erro do listar que o Breno já fechou (pela chave da ação recebida).
	const [dispensado, setDispensado] = useState<string | undefined>(undefined);
	const erroLista = escrita.erro && escrita.erro.chave !== dispensado ? escrita.erro : undefined;

	/** Salvar ou apagar: a promessa da ponte; o erro vai para o Callout, e a rejeição volta para quem chamou. */
	const fazer = (acao: () => Promise<unknown>) => {
		setErro(undefined);
		return acao().catch((falha: unknown) => {
			setErro(falha instanceof Error ? falha.message : String(falha));
			throw falha;
		});
	};

	let lista;
	if (!regras) {
		lista = erroLista ? null : <p className="body escrita__carregando">Abrindo as regras…</p>;
	} else if (regras.length === 0 && !novaAberta) {
		lista = (
			<EmptyState
				glyph="書"
				tone="amber"
				title={TITULO_SEM_REGRAS}
				action={
					<Button variant="primary" icon="plus" onClick={() => setNovaAberta(true)}>
						Regra nova
					</Button>
				}
			>
				{EXEMPLO_REGRA}
			</EmptyState>
		);
	} else {
		lista = (
			<>
				{regras.length > 0 ? (
					<ol className="escrita__lista" aria-label="Regras de escrita">
						<AnimatePresence initial={false}>
							{regras.map((regra, indice) => (
								<motion.li
									key={regra.id}
									className="escrita__item"
									layout={semMovimento() ? false : "position"}
									initial={semMovimento() ? false : { opacity: 0, y: -6 }}
									animate={{ opacity: 1, y: 0 }}
									exit={semMovimento() ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.12 } }}
									transition={MOLA}
								>
									<LinhaRegra
										regra={regra}
										numero={indice + 1}
										materias={materias}
										salvar={(entrada) => fazer(() => escrita.salvar(entrada))}
										apagar={() => fazer(() => escrita.apagar(regra.id))}
									/>
								</motion.li>
							))}
						</AnimatePresence>
					</ol>
				) : null}
				<RegraNova
					aberta={novaAberta}
					abrir={() => setNovaAberta(true)}
					fechar={() => setNovaAberta(false)}
					salvar={(texto) => fazer(() => escrita.salvar({ texto, materia: null, ativa: true }))}
				/>
			</>
		);
	}

	return (
		<div className="escrita">
			<p className="body escrita__contrato">{LINHA_CONTRATO}</p>
			{erro || erroLista ? (
				<div className="escrita__erro">
					<Callout tone="amber" label="Não deu certo" icon="alert" quote={false}>
						<p>{erro ?? erroLista?.mensagem}</p>
						{!erro && erroLista ? (
							<div className="escrita__erro-botoes">
								<Button
									variant="secondary"
									size="sm"
									icon="refresh"
									onClick={() => {
										setDispensado(erroLista.chave);
										escrita.listar();
									}}
								>
									Tentar de novo
								</Button>
							</div>
						) : null}
					</Callout>
					{erro ? <Button variant="ghost" size="sm" iconOnly icon="close" className="escrita__erro-fechar" aria-label="Fechar o aviso" onClick={() => setErro(undefined)} /> : null}
				</div>
			) : null}
			{lista}
		</div>
	);
}

/** Uma regra: o texto no lugar, a matéria, ligar e desligar, apagar (com a confirmação no lugar) e a origem. */
function LinhaRegra(props: { regra: RegraEscrita; numero: number; materias: MateriasDoSeletor; salvar(entrada: EntradaRegra): Promise<unknown>; apagar(): Promise<unknown> }) {
	const { regra, materias } = props;
	const [ocupada, setOcupada] = useState(false);
	const [confirmando, setConfirmando] = useState(false);
	const origem = rotuloDaOrigem(regra);
	const nomeMateria = nomeDaMateria(regra.materia, materias);

	const mudar = (mudancas: Partial<Pick<EntradaRegra, "texto" | "materia" | "ativa">>) => {
		if (ocupada) return;
		setOcupada(true);
		props
			.salvar({ id: regra.id, texto: regra.texto, materia: regra.materia, ativa: regra.ativa, ...mudancas })
			.catch(() => undefined)
			.finally(() => setOcupada(false));
	};
	const apagar = () => {
		if (ocupada) return;
		setOcupada(true);
		// Apagada, a linha sai da lista; com erro, ela fica e a confirmação fecha.
		props
			.apagar()
			.catch(() => {
				setConfirmando(false);
				setOcupada(false);
			});
	};

	return (
		<div className={`escrita__regra${regra.ativa ? "" : " escrita__regra--desligada"}`} aria-busy={ocupada || undefined}>
			<span className="data escrita__num" aria-hidden="true">
				{String(props.numero).padStart(2, "0")}
			</span>
			<div className="escrita__corpo">
				<CampoNoLugar
					valor={regra.texto}
					rotulo={`Texto da regra ${props.numero}`}
					classe="body escrita__texto"
					obrigatorio
					longo
					salvar={(texto) => mudar({ texto: texto.slice(0, TEXTO_REGRA_MAXIMO) })}
				/>
				<div className="escrita__controles">
					<MenuSuspenso
						opcoes={opcoesDaRegra(regra.materia, materias)}
						atual={opcaoDaMateria(regra.materia)}
						escolher={(opcao) => mudar({ materia: materiaDaOpcao(opcao) })}
						conteudoBotao={<span className="body-sm">{nomeMateria}</span>}
						classeBotao="escrita__materia-botao"
						rotulo={`Matéria da regra ${props.numero}: ${nomeMateria}`}
						rotuloMenu="Onde a regra vale"
						desabilitado={ocupada}
						className="escrita__materia"
					/>
					<Switch
						className="escrita__ligar"
						label={regra.ativa ? "Ligada" : "Desligada"}
						checked={regra.ativa}
						disabled={ocupada}
						onChange={(evento) => mudar({ ativa: evento.target.checked })}
					/>
					{origem ? (
						<Tag size="sm" tone="neutral" icon="message" className="escrita__origem" title="Criada a partir de um retorno num bloco de um módulo.">
							{origem}
						</Tag>
					) : null}
					<span className="escrita__apagar">
						{confirmando ? (
							<span className="escrita__confirmar" role="group" aria-label={`Apagar a regra ${props.numero}?`}>
								<span className="body-sm escrita__pergunta">Apagar esta regra?</span>
								<Button variant="danger" size="sm" onClick={apagar} disabled={ocupada} aria-busy={ocupada}>
									Apagar
								</Button>
								<Button variant="ghost" size="sm" onClick={() => setConfirmando(false)} disabled={ocupada}>
									Não
								</Button>
							</span>
						) : (
							<Button variant="ghost" size="sm" onClick={() => setConfirmando(true)} disabled={ocupada}>
								Apagar
							</Button>
						)}
					</span>
				</div>
			</div>
		</div>
	);
}

/** "Regra nova": o botão e, aberto, o campo (Enter salva e fica aberto para a próxima; Esc fecha). */
function RegraNova(props: { aberta: boolean; abrir(): void; fechar(): void; salvar(texto: string): Promise<unknown> }) {
	const [texto, setTexto] = useState("");
	const [salvando, setSalvando] = useState(false);
	const campo = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		if (props.aberta) campo.current?.focus();
	}, [props.aberta]);

	const fechar = () => {
		setTexto("");
		props.fechar();
	};
	const tecla = (evento: KeyboardEvent<HTMLTextAreaElement>) => {
		if (evento.key === "Enter" && !evento.shiftKey) {
			evento.preventDefault();
			const limpo = texto.trim();
			if (!limpo || salvando) return;
			setSalvando(true);
			props
				.salvar(limpo)
				.then(() => setTexto(""))
				.catch(() => undefined)
				.finally(() => {
					setSalvando(false);
					campo.current?.focus();
				});
		} else if (evento.key === "Escape") {
			// Só fecha o campo, não o modal.
			evento.preventDefault();
			evento.stopPropagation();
			fechar();
		}
	};

	if (!props.aberta) {
		return (
			<div className="escrita__nova-botao">
				<Button variant="ghost" icon="plus" onClick={props.abrir}>
					Regra nova
				</Button>
			</div>
		);
	}
	return (
		<motion.div className="mapa__novo escrita__nova" initial={semMovimento() ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={MOLA}>
			<Icon name="plus" size={18} strokeWidth={2.5} />
			<div className="mapa__novo-campos">
				<textarea
					ref={campo}
					className="body mapa__campo escrita__nova-campo"
					rows={2}
					maxLength={TEXTO_REGRA_MAXIMO}
					placeholder={EXEMPLO_REGRA}
					aria-label="Texto da regra nova"
					value={texto}
					readOnly={salvando}
					aria-busy={salvando || undefined}
					onChange={(evento) => setTexto(evento.target.value)}
					onKeyDown={tecla}
				/>
				<span className="body-sm mapa__novo-ajuda">{salvando ? "Salvando…" : "Enter salva · Esc fecha · vale para todas as matérias (dá para mudar depois)"}</span>
			</div>
			<Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Fechar a regra nova" onClick={fechar} />
		</motion.div>
	);
}
