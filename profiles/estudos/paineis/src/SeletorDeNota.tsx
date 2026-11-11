// O seletor curto do "Guardar na nota" (parte C1, WP3; docs/mesa-parte-c.md, seção 5): quando a aba em
// foco é uma lição (ou não há nota em foco), o Breno escolhe em qual nota da matéria o bloco entra, ou
// cria uma nota nova ("Nova nota…", que pede o título). É um popover pequeno ao lado do botão: o foco
// entra nele ao abrir, as setas andam pelas notas, Esc fecha e devolve o foco ao botão (quem abriu),
// e um clique fora também fecha.
//
// Padrões de interface (docs/padroes-de-interface.md): a lista das notas pede à extensão a de agora e
// mostra a última que já se conhecia até ela chegar (regra 2); "Abrindo as notas…" só aparece depois de
// 1 s (regra 1); a linha "Nova nota…" vira o campo do título com a mesma altura e a linha do erro é
// reservada (regra 5).

import { Icon } from "@estudos/design-system";
import { type JanelaPerfilHook, useValorEstavel } from "@estudos/ui";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { conferirTitulo, TAMANHO_TITULO } from "../../lib/nota-tipos.ts";
import { mesmoTitulo } from "./notas-ponte.ts";
import { editadaHa, useListaNotas } from "./SecaoNotas.tsx";

export type DesfechoDeCriar = { ok: true; titulo: string } | { ok: false; mensagem: string };

export interface PropsSeletorDeNota {
	janela: JanelaPerfilHook;
	materiaId: string;
	/** Escolheu uma nota que já existe (ou acabou de ser criada). */
	aoEscolher(titulo: string): void;
	/** Cria a nota (pela ponte de notas); o seletor mostra o erro e, se deu certo, escolhe a nota nova. */
	criar(titulo: string): Promise<DesfechoDeCriar>;
	/** Esc ou clique fora: fecha sem escolher. Quem abriu devolve o foco ao botão. */
	aoFechar(): void;
}

export function SeletorDeNota({ janela, materiaId, aoEscolher, criar, aoFechar }: PropsSeletorDeNota) {
	const lista = useListaNotas(janela, materiaId);
	const raiz = useRef<HTMLDivElement>(null);
	const [criando, setCriando] = useState(false);
	const [titulo, setTitulo] = useState("");
	const [erro, setErro] = useState<string | undefined>(undefined);
	const [esperando, setEsperando] = useState(false);
	const vivo = useRef(true);
	const fechar = useRef(aoFechar);
	fechar.current = aoFechar;
	useEffect(() => {
		vivo.current = true;
		return () => {
			vivo.current = false;
		};
	}, []);

	// "Abrindo as notas…" só depois de 1 s; até lá a área da lista fica reservada, sem texto.
	const semLista = !lista;
	const mostraAbrindo = useValorEstavel(semLista, semLista, false) && semLista;

	// O foco entra no seletor quando ele abre (na primeira nota, ou em "Nova nota…" se não há nenhuma): uma vez só.
	const focou = useRef(false);
	useEffect(() => {
		if (focou.current || !lista) return;
		focou.current = true;
		const primeira = raiz.current?.querySelector<HTMLButtonElement>("button[data-opcao]");
		(primeira ?? raiz.current)?.focus({ preventScroll: true });
	}, [lista]);

	// Um clique fora fecha.
	useEffect(() => {
		const fora = (evento: PointerEvent) => {
			if (raiz.current && evento.target instanceof Node && !raiz.current.contains(evento.target)) fechar.current();
		};
		document.addEventListener("pointerdown", fora);
		return () => document.removeEventListener("pointerdown", fora);
	}, []);

	const teclar = (evento: KeyboardEvent<HTMLDivElement>) => {
		if (evento.key === "Escape") {
			evento.preventDefault();
			evento.stopPropagation();
			aoFechar();
			return;
		}
		if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return;
		const opcoes = [...(raiz.current?.querySelectorAll<HTMLButtonElement>("button[data-opcao]") ?? [])];
		if (opcoes.length === 0) return;
		evento.preventDefault();
		const atual = opcoes.indexOf(document.activeElement as HTMLButtonElement);
		const proximo = evento.key === "ArrowDown" ? (atual + 1) % opcoes.length : (atual - 1 + opcoes.length) % opcoes.length;
		opcoes[proximo]?.focus();
	};

	const enviarNova = async (evento: FormEvent) => {
		evento.preventDefault();
		if (esperando) return;
		const conferido = conferirTitulo(titulo);
		if ("erro" in conferido) return setErro(conferido.erro);
		if (lista?.notas.some((nota) => mesmoTitulo(nota.titulo, conferido.titulo))) return setErro(`Já existe uma nota "${conferido.titulo}" neste caderno.`);
		setErro(undefined);
		setEsperando(true);
		const desfecho = await criar(conferido.titulo);
		if (!vivo.current) return;
		setEsperando(false);
		if (desfecho.ok) aoEscolher(desfecho.titulo);
		else setErro(desfecho.mensagem);
	};

	return (
		// Escondido (visibility, não display: o layout não pula) até a lista estar pronta ou passar 1 s: conteúdo novo só aparece pronto (regra 3).
		<div
			ref={raiz}
			className="seletor-nota"
			role="dialog"
			aria-label="Guardar em qual nota?"
			tabIndex={-1}
			onKeyDown={teclar}
			style={{ visibility: semLista && !mostraAbrindo ? "hidden" : "visible" }}
		>
			<span className="overline seletor-nota__titulo">Guardar em</span>
			<ul className="seletor-nota__lista">
				{lista?.notas.map((nota) => (
					<li key={nota.titulo}>
						<button type="button" className="seletor-nota__item" data-opcao="" onClick={() => aoEscolher(nota.titulo)}>
							<span className="seletor-nota__nome body-strong">{nota.titulo}</span>
							<span className="seletor-nota__quando data">{editadaHa(nota.modificadaEm)}</span>
						</button>
					</li>
				))}
				{lista && lista.notas.length === 0 ? <li className="seletor-nota__vazio body-sm">Nenhuma nota ainda.</li> : null}
				{semLista ? (
					<li className="seletor-nota__vazio body-sm" style={{ visibility: mostraAbrindo ? "visible" : "hidden" }} aria-hidden={!mostraAbrindo}>
						Abrindo as notas…
					</li>
				) : null}
			</ul>
			{criando ? (
				<form className="seletor-nota__nova" onSubmit={enviarNova}>
					<input
						className="seletor-nota__campo body"
						aria-label="Título da nota nova"
						value={titulo}
						onChange={(evento) => {
							setTitulo(evento.target.value);
							setErro(undefined);
						}}
						maxLength={TAMANHO_TITULO}
						placeholder="Título da nota"
						disabled={esperando}
						autoFocus
					/>
					<button type="submit" className="seletor-nota__criar" disabled={esperando} aria-busy={esperando || undefined}>
						Criar
					</button>
				</form>
			) : (
				<button type="button" className="seletor-nota__item seletor-nota__item--nova" data-opcao="" onClick={() => setCriando(true)}>
					<Icon name="plus" size={16} strokeWidth={2.25} />
					<span className="seletor-nota__nome body-strong">Nova nota…</span>
				</button>
			)}
			{/* A linha do erro é reservada: o erro aparecer não muda o tamanho do seletor. */}
			<p className="seletor-nota__erro body-sm" role="alert">
				{erro ?? ""}
			</p>
		</div>
	);
}
