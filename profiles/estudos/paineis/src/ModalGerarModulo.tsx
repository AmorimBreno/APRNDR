// O formulário "Gerar módulo" (item 6, parte A, docs/modulos.md, "A tela"):
// o que vai acontecer, a área de soltar materiais da matéria (os arquivos vão
// para a matéria e entram no mapa; os mandados por aqui vão no pedido, em
// materiaisNovos), "Informações específicas" e "Observações" (tudo opcional),
// e a marcação "Ainda não tenho o material deste módulo", que troca os campos
// por uma nota e o primário por "Marcar como aguardando material". Um aviso
// diz o custo aproximado. Ao gerar (ou marcar), o modal fecha quando a
// extensão responde, e o card passa a mostrar a etapa.
//
// Quem abre monta o modal de novo a cada abertura (key), para o formulário
// começar do que foi pedido antes.

import { Button, Checkbox, Modal, TextArea } from "@estudos/design-system";
import type { SituacaoMaterial } from "@estudos/ui";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ConteudoMateriais } from "./ModalMateriais.tsx";
import {
	type CamposPedido,
	camposDoPedido,
	CUSTO_APROXIMADO,
	nomesMandados,
	primarioDoFormulario,
	TEXTO_DO_FORMULARIO,
	tituloDoFormulario,
} from "./modulos-tela.ts";

const MOLA = { type: "spring", stiffness: 380, damping: 32 } as const;

export interface PropsModalGerarModulo {
	aberto: boolean;
	fechar(): void;
	numero: number;
	nome: string;
	/** O nome do curso, na legenda. */
	curso?: string;
	/** O que foi pedido antes (Tentar de novo, Gerar de novo), para começar preenchido. */
	inicial?: CamposPedido;
	/** Gerar de novo um módulo gerado: sem a marcação de aguardando material. */
	deNovo?: boolean;
	/** Os materiais da pasta da matéria; undefined = a lista ainda não chegou. */
	materiais?: SituacaoMaterial[];
	/** A pasta de materiais da matéria, relativa à pasta de dados. */
	pasta: string;
	enviar(arquivos: File[]): Promise<string[]>;
	reprocessar(caminho: string): Promise<void>;
	gerar(campos: CamposPedido): Promise<unknown>;
	aguardar(nota: string): Promise<unknown>;
}

export function ModalGerarModulo(props: PropsModalGerarModulo) {
	const [informacoes, setInformacoes] = useState(props.inicial?.informacoes ?? "");
	const [observacoes, setObservacoes] = useState(props.inicial?.observacoes ?? "");
	const [mandados, setMandados] = useState<string[]>(props.inicial?.materiaisNovos ?? []);
	const [semMaterial, setSemMaterial] = useState(false);
	const [nota, setNota] = useState("");
	const [subindo, setSubindo] = useState(0);
	const [enviando, setEnviando] = useState(false);
	const [erro, setErro] = useState<string | undefined>(undefined);

	const fechar = () => {
		if (!enviando) props.fechar();
	};

	// Os arquivos soltos aqui vão para a matéria; os gravados entram no pedido.
	const enviar = async (arquivos: File[]) => {
		setSubindo((atual) => atual + 1);
		try {
			const gravados = await props.enviar(arquivos);
			setMandados((atuais) => nomesMandados(atuais, gravados, props.pasta));
			return gravados;
		} finally {
			setSubindo((atual) => atual - 1);
		}
	};

	const confirmar = () => {
		if (enviando || subindo > 0) return;
		setEnviando(true);
		setErro(undefined);
		const resposta = semMaterial ? props.aguardar(nota) : props.gerar(camposDoPedido({ informacoes, observacoes, materiaisNovos: mandados }));
		resposta
			.then(() => {
				setEnviando(false);
				props.fechar();
			})
			.catch((falha: unknown) => {
				setEnviando(false);
				setErro(falha instanceof Error ? falha.message : String(falha));
			});
	};

	const entrada = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8, transition: { duration: 0.12 } }, transition: MOLA };
	return (
		<Modal
			open={props.aberto}
			onClose={fechar}
			kicker={props.curso ?? "Curso"}
			title={tituloDoFormulario(props.numero, props.nome)}
			size="lg"
			dismissible={!enviando}
			footer={
				<>
					<span className="data mod__custo">{semMaterial ? "" : CUSTO_APROXIMADO}</span>
					<Button variant="secondary" onClick={fechar} disabled={enviando}>
						Cancelar
					</Button>
					<Button variant="primary" onClick={confirmar} disabled={enviando || subindo > 0} aria-busy={enviando}>
						{enviando ? (semMaterial ? "Marcando…" : "Começando…") : primarioDoFormulario(semMaterial)}
					</Button>
				</>
			}
		>
			<div className="mod__form">
				<p className="body mod__texto">{TEXTO_DO_FORMULARIO}</p>
				<AnimatePresence initial={false} mode="wait">
					{semMaterial ? (
						<motion.div key="nota" className="mod__campos" {...entrada}>
							<TextArea label="Nota (opcional)" hint="Ex.: a aula 5 sai na quinta." value={nota} onChange={(evento) => setNota(evento.target.value)} rows={2} disabled={enviando} />
						</motion.div>
					) : (
						<motion.div key="campos" className="mod__campos" {...entrada}>
							<section className="mod__materiais" aria-labelledby="mod-materiais">
								<h3 id="mod-materiais" className="overline mod__rotulo">
									Materiais novos para este módulo (opcional)
								</h3>
								<ConteudoMateriais {...(props.materiais ? { materiais: props.materiais } : {})} pasta={props.pasta} enviar={enviar} reprocessar={props.reprocessar} />
								{mandados.length ? <p className="data mod__mandados">Vão com o pedido: {mandados.join(", ")}</p> : null}
							</section>
							<TextArea
								label="Informações específicas (opcional)"
								hint="Ex.: a professora disse que a prova cobra só a parte de TF-IDF."
								value={informacoes}
								onChange={(evento) => setInformacoes(evento.target.value)}
								rows={3}
								disabled={enviando}
							/>
							<TextArea
								label="Observações (opcional)"
								hint="Ex.: quero mais exercícios em código."
								value={observacoes}
								onChange={(evento) => setObservacoes(evento.target.value)}
								rows={3}
								disabled={enviando}
							/>
						</motion.div>
					)}
				</AnimatePresence>
				{props.deNovo ? null : (
					<Checkbox label="Ainda não tenho o material deste módulo" checked={semMaterial} onChange={(evento) => setSemMaterial(evento.target.checked)} disabled={enviando} />
				)}
				{subindo > 0 ? <p className="body-sm mod__aviso">Esperando o envio dos arquivos para continuar.</p> : null}
				{erro ? <p className="body-sm cursos__erro mod__erro">{erro}</p> : null}
			</div>
		</Modal>
	);
}
