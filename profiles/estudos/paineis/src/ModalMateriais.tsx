// Modal de materiais de uma matéria (item 4.2): a área de soltar arquivos
// (FileDrop do design system), que manda os arquivos para
// materias/<id>/materiais pelo servidor, e a lista do que o serviço de
// materiais do núcleo sabe de cada arquivo dessa pasta: na fila, processando
// (com a etapa e a barra), pronto (trechos e custo da visão), erro ou formato
// não suportado. A lista se atualiza sozinha pelo evento "materiais".
// Quando o caderno existir (4.3), este conteúdo vira a seção Materiais dele.

import { Button, FileDrop, formatBytes, Icon, type IconName, Modal, Tag, type TagProps } from "@estudos/design-system";
import type { SituacaoMaterial } from "@estudos/ui";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Materia } from "../../lib/materia-tipos.ts";

const ACEITOS = ".pdf,.py,.ipynb,.md,.markdown,.txt";

const dolar = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 });

const ICONE_TIPO: Record<string, IconName> = { pdf: "file", python: "code", notebook: "code", texto: "file" };
const NOME_TIPO: Record<string, string> = { pdf: "PDF", python: "Python", notebook: "Notebook", texto: "Texto" };

function etiqueta(situacao: SituacaoMaterial): { texto: string } & Pick<TagProps, "tone" | "icon" | "dot"> {
	switch (situacao.estado) {
		case "pronto":
			return { texto: "Pronto", tone: "sage", icon: "check" };
		case "processando":
			return { texto: "Processando", tone: "amber", dot: true };
		case "na_fila":
			return { texto: "Na fila", tone: "outline", icon: "clock" };
		case "erro":
			return { texto: "Erro", tone: "brick", icon: "alert" };
		case "nao_suportado":
			return { texto: "Não suportado", tone: "outline" };
	}
}

function detalhe(situacao: SituacaoMaterial): string {
	switch (situacao.estado) {
		case "pronto": {
			const custo = situacao.custo ? ` · ${dolar.format(situacao.custo)} com a visão` : "";
			return `${situacao.trechos ?? 0} ${situacao.trechos === 1 ? "trecho" : "trechos"}${custo}`;
		}
		case "processando":
			return situacao.etapa ?? "Processando…";
		case "na_fila":
			return "Esperando a vez";
		case "erro":
			return situacao.erro ?? "Erro desconhecido.";
		case "nao_suportado":
			return "Por enquanto: PDF, .py, .ipynb, markdown e texto";
	}
}

interface PropsModalMateriais {
	aberto: boolean;
	fechar(): void;
	materia?: Materia;
	/** Os materiais da pasta da matéria. undefined = a lista ainda não chegou. */
	materiais?: SituacaoMaterial[];
	/** A pasta da matéria, relativa à pasta de dados ("materias/calculo/materiais"). */
	pasta: string;
	enviar(arquivos: File[]): Promise<string[]>;
	reprocessar(caminho: string): Promise<void>;
}

export function ModalMateriais(props: PropsModalMateriais) {
	const [enviando, setEnviando] = useState<string[]>([]);
	const [erro, setErro] = useState<string | undefined>(undefined);
	const [aviso, setAviso] = useState<string | undefined>(undefined);
	const materiais = props.materiais ?? [];
	const custo = materiais.reduce((soma, material) => soma + (material.custo ?? 0), 0);

	const receber = (arquivos: File[]) => {
		if (arquivos.length === 0) return;
		setErro(undefined);
		setAviso(undefined);
		setEnviando((atual) => [...atual, ...arquivos.map((arquivo) => arquivo.name)]);
		props
			.enviar(arquivos)
			.then((gravados) => {
				const repetidos = arquivos.length - gravados.length;
				if (repetidos > 0) setAviso(repetidos === 1 ? "Um arquivo já estava lá, igual: ficou de fora." : `${repetidos} arquivos já estavam lá, iguais: ficaram de fora.`);
			})
			.catch((falha: unknown) => setErro(falha instanceof Error ? falha.message : String(falha)))
			.finally(() => setEnviando((atual) => atual.filter((nome) => !arquivos.some((arquivo) => arquivo.name === nome))));
	};

	return (
		<Modal
			open={props.aberto}
			onClose={props.fechar}
			title="Materiais"
			kicker={props.materia ? `${props.materia.nome} · ${materiais.length} ${materiais.length === 1 ? "arquivo" : "arquivos"}` : undefined}
			size="lg"
			footer={
				<>
					<span className="materiais__custo data">{custo > 0 ? `Visão nesta matéria: ${dolar.format(custo)}` : ""}</span>
					<Button variant="primary" onClick={props.fechar}>
						Fechar
					</Button>
				</>
			}
		>
			<div className="materiais">
				<FileDrop
					title="Arraste aqui os PDFs das aulas, .py, .ipynb ou markdown"
					hint={`ou clique para escolher. Copiar para a pasta ${props.pasta.replaceAll("/", "\\")} no Drive também funciona (aparece em até 30 s).`}
					accept={ACEITOS}
					files={enviando.map((nome) => ({ name: nome, size: "enviando…" }))}
					onFiles={receber}
					{...(erro ? { error: erro } : {})}
				/>
				{aviso ? <p className="materiais__aviso body-sm">{aviso}</p> : null}
				{props.materiais === undefined ? (
					<p className="materiais__vazio body-sm">Carregando a lista…</p>
				) : materiais.length === 0 ? (
					<p className="materiais__vazio body-sm">
						Nenhum material ainda. Os slides e as listas da matéria viram texto pesquisável: o professor busca neles e cita a página.
					</p>
				) : (
					<ul className="materiais__lista" aria-label="Arquivos de material">
						<AnimatePresence initial={false}>
							{materiais.map((material) => (
								<LinhaMaterial key={material.caminho} material={material} reprocessar={props.reprocessar} />
							))}
						</AnimatePresence>
					</ul>
				)}
			</div>
		</Modal>
	);
}

function LinhaMaterial({ material, reprocessar }: { material: SituacaoMaterial; reprocessar(caminho: string): Promise<void> }) {
	const [pedindo, setPedindo] = useState(false);
	const { texto, ...tag } = etiqueta(material);
	const progresso = material.estado === "processando" && material.progresso?.total ? material.progresso.feito / material.progresso.total : undefined;
	const podeReprocessar = (material.estado === "pronto" || material.estado === "erro") && material.tipo;
	return (
		<motion.li
			layout
			initial={{ opacity: 0, y: 8, scale: 0.98 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, x: -16, transition: { duration: 0.16 } }}
			transition={{ type: "spring", stiffness: 420, damping: 30 }}
			className={`ap-file material${material.estado === "erro" ? " ap-file--error" : ""}`}
		>
			<Icon name={(material.tipo && ICONE_TIPO[material.tipo]) || "file"} size={20} strokeWidth={2.25} />
			<span className="ap-file__name body-sm" title={material.nome}>
				{material.nome}
			</span>
			<span className="material__lado">
				<span className="data material__tamanho">
					{material.tipo ? `${NOME_TIPO[material.tipo]} · ` : ""}
					{formatBytes(material.tamanho)}
				</span>
				<Tag size="sm" {...tag}>
					{texto}
				</Tag>
			</span>
			{podeReprocessar ? (
				<button
					type="button"
					className="ap-file__remove"
					title="Processar de novo (refaz também as descrições da visão)"
					aria-label={`Processar ${material.nome} de novo`}
					disabled={pedindo}
					onClick={() => {
						setPedindo(true);
						reprocessar(material.caminho).finally(() => setPedindo(false));
					}}
				>
					<Icon name="refresh" size={16} strokeWidth={2.5} />
				</button>
			) : (
				<span />
			)}
			<span className={`material__detalhe body-sm${material.estado === "erro" ? " material__detalhe--erro" : ""}`}>
				{detalhe(material)}
				{material.avisos?.length ? (
					<details className="material__avisos">
						<summary>{material.avisos.length === 1 ? "1 aviso" : `${material.avisos.length} avisos`}</summary>
						<ul>
							{material.avisos.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</details>
				) : null}
			</span>
			{progresso !== undefined ? (
				<span className="ap-file__bar material__barra" aria-hidden="true">
					<motion.span initial={false} animate={{ width: `${Math.round(progresso * 100)}%` }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
				</span>
			) : null}
		</motion.li>
	);
}
