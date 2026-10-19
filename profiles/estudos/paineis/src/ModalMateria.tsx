// Modal da matéria: criar (tela de cadernos, "Nova matéria") ou editar (aba
// do caderno, "Editar"). Nome, cor da capa, ideograma e uma prova, com a capa
// de amostra ao lado. A resposta da extensão chega pelas ações do painel
// "cadernos": "criada" ou "alterada", ou um "erro" com ao: "criar" ou "alterar".

import { Button, Modal, NotebookCover, type OrnamentGlyph, pad2, TextField } from "@estudos/design-system";
import type { AcaoRecebida } from "@estudos/ui";
import { type FormEvent, useEffect, useState } from "react";
import { CORES_MATERIA, type CorMateria, type EntradaMateria, GLIFOS_MATERIA, type Materia } from "../../lib/materia-tipos.ts";
import { proximaProva, rotuloCapa } from "./comum.ts";

const NOMES_COR: Record<CorMateria, string> = { moss: "Musgo", amber: "Âmbar", steel: "Aço", ink: "Tinta", cream: "Creme", sage: "Sálvia" };

interface PropsModalMateria {
	aberto: boolean;
	fechar(): void;
	/** Com ela, o modal edita esta matéria; sem ela, cria uma nova. */
	materia?: Materia;
	/** As ações do painel "cadernos": a resposta chega por elas. */
	recebidas: AcaoRecebida[];
	/** Manda a ação à extensão ("criar" com a entrada, ou "alterar" com o id e as mudanças). */
	salvar(entrada: EntradaMateria): Promise<void>;
	/** A extensão confirmou (o id da matéria criada ou alterada). */
	salva(id: string): void;
	/** O número do caderno, na capa de amostra. */
	numero: number;
}

/** A prova que o formulário edita: a próxima, ou a primeira. */
function provaEditada(materia: Materia | undefined) {
	if (!materia) return undefined;
	const proxima = proximaProva(materia, new Date());
	return (proxima && materia.provas.find((prova) => prova.nome === proxima.nome && prova.data === proxima.data)) ?? materia.provas[0];
}

export function ModalMateria(props: PropsModalMateria) {
	const editando = Boolean(props.materia);
	const [nome, setNome] = useState("");
	const [cor, setCor] = useState<CorMateria>("moss");
	const [glifo, setGlifo] = useState<string>("学");
	const [prova, setProva] = useState("");
	const [dataProva, setDataProva] = useState("");
	const [erro, setErro] = useState<string | undefined>(undefined);
	/**
	 * Mandou e espera a resposta: a primeira resposta depois da ação que tinha
	 * chegado por último (a chave dela; null se não havia nenhuma).
	 */
	const [esperando, setEsperando] = useState<string | null | undefined>(undefined);

	// Ao abrir: do zero para criar; com os valores da matéria para editar.
	const { materia } = props;
	useEffect(() => {
		if (!props.aberto) return;
		const editada = provaEditada(materia);
		setNome(materia?.nome ?? "");
		setCor(materia?.cor ?? "moss");
		setGlifo(materia?.glifo ?? "学");
		setProva(editada?.nome ?? "");
		setDataProva(editada?.data ?? "");
		setErro(undefined);
		setEsperando(undefined);
	}, [props.aberto, materia]);

	// A resposta.
	const { recebidas, salva } = props;
	useEffect(() => {
		if (esperando === undefined) return;
		const depois = esperando === null ? 0 : recebidas.findIndex((acao) => acao.chave === esperando) + 1;
		const ok = editando ? "alterada" : "criada";
		for (const acao of recebidas.slice(depois)) {
			const dados = acao.dados as { id?: string; mensagem?: string; ao?: string } | undefined;
			if (acao.acao === ok && dados?.id) {
				setEsperando(undefined);
				salva(dados.id);
				return;
			}
			if (acao.acao === "erro" && dados?.ao === (editando ? "alterar" : "criar")) {
				setEsperando(undefined);
				setErro(dados.mensagem ?? "Não consegui salvar a matéria.");
				return;
			}
		}
	}, [recebidas, esperando, salva, editando]);

	const enviando = esperando !== undefined;
	const enviar = (evento?: FormEvent) => {
		evento?.preventDefault();
		if (!nome.trim() || enviando) return;
		setErro(undefined);
		setEsperando(recebidas.at(-1)?.chave ?? null);
		// Editando, só a prova do formulário muda; as outras ficam como estavam.
		const editada = provaEditada(materia);
		const outras = (materia?.provas ?? []).filter((item) => item !== editada);
		const nova = dataProva ? [{ nome: prova.trim() || "Prova", data: dataProva }] : [];
		const entrada: EntradaMateria = { nome, cor, glifo, provas: [...nova, ...outras] };
		props.salvar(entrada).catch((falha: unknown) => {
			setEsperando(undefined);
			setErro(falha instanceof Error ? falha.message : String(falha));
		});
	};

	return (
		<Modal
			open={props.aberto}
			onClose={props.fechar}
			title={editando ? "Editar matéria" : "Nova matéria"}
			kicker={editando ? `Caderno ${pad2(props.numero)}` : "Um caderno para a matéria"}
			size="md"
			dismissible={!enviando}
			footer={
				<>
					<Button variant="ghost" onClick={props.fechar} disabled={enviando}>
						Cancelar
					</Button>
					<Button variant="primary" iconRight={editando ? "check" : "arrow-right"} onClick={() => enviar()} disabled={!nome.trim() || enviando}>
						{enviando ? (editando ? "Salvando…" : "Criando…") : editando ? "Salvar" : "Criar caderno"}
					</Button>
				</>
			}
		>
			<form className="nova-materia" onSubmit={enviar}>
				<div className="nova-materia__campos">
					<TextField label="Nome" placeholder="Cálculo I" value={nome} maxLength={80} onChange={(evento) => setNome(evento.target.value)} autoFocus />
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
								<button key={opcao} type="button" role="radio" aria-checked={glifo === opcao} className="nova-materia__glifo" onClick={() => setGlifo(opcao)}>
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
							hint={editando ? "Apague a data para tirar a prova." : "Opcional. Dá para marcar depois."}
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
				{/* Enter no campo salva: o form precisa de um submit. */}
				<button type="submit" hidden />
			</form>
		</Modal>
	);
}
