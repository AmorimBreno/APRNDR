// A linha do tempo do caderno (ESPECIFICACAO 8.1, item 4.3): os eventos do
// eventos.jsonl da matéria, do mais novo ao mais antigo (a timeline não é um
// arquivo à parte, seção 7). Vive fora da TelaCaderno para o painel poder usar
// os mesmos textos sem importar a tela (import circular). Três formas:
// - descreverEvento: o ícone, a frase e o detalhe de cada evento;
// - LinhaDoTempo: a lista vertical completa, agrupada por dia, que aparece no
//   modal "Ver tudo" (ModalLinhaDoTempo);
// - FaixaTempo: a faixa horizontal do painel, só com as marcas redondas (o
//   ícone) dos eventos mais recentes sobre uma linha contínua; o dia, a hora e a
//   frase aparecem num balão ao lado do mouse (ou ancorado na marca, com o foco).

import { Button, Icon, type IconName, Modal } from "@estudos/design-system";
import { semMovimento } from "@estudos/ui";
import { motion } from "motion/react";
import { type Dispatch, memo, type PointerEvent as EventoPonteiro, type SetStateAction, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Evento } from "../../lib/eventos.ts";
import { type Ponto, posicaoAncorada, posicaoDoBalao } from "./balao-posicao.ts";
import { dataCurta } from "./comum.ts";
import { numeroCurto } from "./diagnostico-tela.ts";
import { dataNumerica } from "./guia-curso.ts";
import { formatarDolar } from "./ModalMateriais.tsx";
import type { Retangulo } from "./termos-tela.ts";

const diaLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const NOMES_TIPO: Record<string, string> = { pdf: "PDF", python: "Python", notebook: "Notebook", texto: "Texto" };
const NOMES_CAMPO: Record<string, string> = { nome: "nome", cor: "cor da capa", glifo: "ideograma", provas: "provas" };

/** O nome do curso de um evento: o do resultado, se veio; senão o id do objeto. */
function nomeDoCurso(evento: Evento): string {
	const resultado = (evento.resultado ?? {}) as Record<string, unknown>;
	return typeof resultado.nome === "string" ? resultado.nome : typeof evento.objeto.curso === "string" ? evento.objeto.curso : "um curso";
}

/** Uma linha da linha do tempo: o ícone, a frase e o detalhe. */
export function descreverEvento(evento: Evento): { icone: IconName; texto: string; detalhe?: string } {
	const resultado = (evento.resultado ?? {}) as Record<string, unknown>;
	const arquivo = typeof evento.objeto.arquivo === "string" ? evento.objeto.arquivo : "um arquivo";
	const nota = typeof evento.objeto.nota === "string" ? evento.objeto.nota : "uma nota";
	switch (evento.verbo) {
		case "criou_materia":
			return { icone: "notebook", texto: "Caderno criado", ...(typeof resultado.nome === "string" ? { detalhe: resultado.nome } : {}) };
		case "alterou_materia": {
			const partes = Object.keys(resultado).map((campo) => {
				if (campo === "nome") return `nome: ${String(resultado.nome)}`;
				if (campo === "glifo") return `ideograma ${String(resultado.glifo)}`;
				if (campo === "provas") {
					const provas = resultado.provas as Array<{ nome: string; data: string }>;
					return provas.length ? `provas: ${provas.map((prova) => `${prova.nome} em ${dataCurta(prova.data)}`).join(", ")}` : "sem prova marcada";
				}
				return NOMES_CAMPO[campo] ?? campo;
			});
			return { icone: "refresh", texto: "Matéria editada", ...(partes.length ? { detalhe: partes.join(" · ") } : {}) };
		}
		case "adicionou_material":
		case "atualizou_material": {
			const tipo = typeof resultado.tipo === "string" ? (NOMES_TIPO[resultado.tipo] ?? resultado.tipo) : undefined;
			const trechos = typeof resultado.trechos === "number" ? `${resultado.trechos} ${resultado.trechos === 1 ? "trecho" : "trechos"}` : undefined;
			const custo = typeof resultado.custo === "number" && resultado.custo > 0 ? `${formatarDolar(resultado.custo)} com a visão` : undefined;
			const detalhe = [tipo, trechos, custo].filter(Boolean).join(" · ");
			return {
				icone: evento.verbo === "adicionou_material" ? "paperclip" : "refresh",
				texto: `${evento.verbo === "adicionou_material" ? "Material adicionado" : "Material atualizado"}: ${arquivo}`,
				...(detalhe ? { detalhe } : {}),
			};
		}
		case "removeu_material":
			return { icone: "close", texto: `Material removido: ${arquivo}` };
		case "criou_nota":
			return { icone: "file", texto: `Nota criada: ${nota}` };
		case "editou_nota":
			return { icone: "book", texto: `Nota editada: ${nota}` };
		case "renomeou_nota":
			return {
				icone: "refresh",
				texto: `Nota renomeada: ${nota}`,
				...(typeof resultado.de === "string"
					? {
							detalhe: [
								`antes: ${resultado.de}`,
								Array.isArray(resultado.mencoesAtualizadas) && resultado.mencoesAtualizadas.length
									? `menções atualizadas em ${(resultado.mencoesAtualizadas as string[]).join(", ")}`
									: "",
							]
								.filter(Boolean)
								.join(" · "),
						}
					: {}),
			};
		case "mapeou_material": {
			const novos = typeof resultado.novos === "number" ? resultado.novos : 0;
			const reforcados = typeof resultado.reforcados === "number" ? resultado.reforcados : 0;
			const custo = typeof resultado.custo === "number" ? resultado.custo : 0;
			const detalhe = [
				novos > 0 ? `${novos} ${novos === 1 ? "conceito novo" : "conceitos novos"}` : "",
				reforcados > 0 ? `${reforcados} ${reforcados === 1 ? "reforçado" : "reforçados"}` : "",
				custo > 0 ? formatarDolar(custo) : "",
			]
				.filter(Boolean)
				.join(" · ");
			return { icone: "bulb", texto: `Mapa atualizado com ${arquivo}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "atualizou_mapa": {
			const semFonte = typeof resultado.semFonte === "number" ? resultado.semFonte : 0;
			return {
				icone: "bulb",
				texto: `Mapa sem ${arquivo}`,
				...(semFonte > 0 ? { detalhe: semFonte === 1 ? "1 conceito ficou sem fonte" : `${semFonte} conceitos ficaram sem fonte` } : {}),
			};
		}
		case "revisou_mapa":
			return { icone: "bulb", texto: "Mapa revisado" };
		case "montou_mapa_do_tema": {
			const tema = typeof resultado.tema === "string" ? resultado.tema : "do curso";
			const novos = typeof resultado.novos === "number" ? resultado.novos : undefined;
			const custo = typeof resultado.custo === "number" && resultado.custo > 0 ? formatarDolar(resultado.custo) : "";
			const detalhe = [novos !== undefined ? `${novos} ${novos === 1 ? "conceito" : "conceitos"}` : "", custo].filter(Boolean).join(" · ");
			return { icone: "bulb", texto: `Mapa montado a partir do tema ${tema}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "comecou_curso":
			return { icone: "flag", texto: `Curso começado: ${typeof resultado.nome === "string" ? resultado.nome : String(evento.objeto.curso ?? "um curso")}` };
		case "descartou_curso":
			return { icone: "close", texto: `Rascunho descartado: ${typeof resultado.nome === "string" ? resultado.nome : String(evento.objeto.curso ?? "um curso")}` };
		case "gerou_diagnostico": {
			const questoes = typeof resultado.questoes === "number" ? resultado.questoes : Array.isArray(resultado.questoes) ? resultado.questoes.length : undefined;
			const custo = typeof resultado.custo === "number" && resultado.custo > 0 ? formatarDolar(resultado.custo) : "";
			const detalhe = [questoes !== undefined ? `${questoes} ${questoes === 1 ? "questão" : "questões"}` : "", custo].filter(Boolean).join(" · ");
			return { icone: "checklist", texto: `Diagnóstico preparado: ${nomeDoCurso(evento)}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "gerou_modulo": {
			const modulo = typeof evento.objeto.modulo === "string" ? evento.objeto.modulo : "um módulo";
			const curso = typeof evento.objeto.curso === "string" ? evento.objeto.curso : "um curso";
			const licoes = typeof resultado.licoes === "number" ? `${resultado.licoes} ${resultado.licoes === 1 ? "lição" : "lições"}` : "";
			const questoes = typeof resultado.questoes === "number" ? `${resultado.questoes} ${resultado.questoes === 1 ? "questão" : "questões"}` : "";
			const custo = typeof resultado.custo === "number" && resultado.custo > 0 ? formatarDolar(resultado.custo) : "";
			const detalhe = [licoes, questoes, custo].filter(Boolean).join(" · ");
			return { icone: "book", texto: `Módulo gerado: ${modulo} de ${curso}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "concluiu_modulo": {
			const modulo = typeof evento.objeto.modulo === "string" ? evento.objeto.modulo : "um módulo";
			const curso = typeof evento.objeto.curso === "string" ? evento.objeto.curso : "um curso";
			const licoes = typeof resultado.licoes === "number" ? `${resultado.licoes} ${resultado.licoes === 1 ? "lição" : "lições"}` : "";
			const questoes = typeof resultado.questoes === "number" ? `${resultado.questoes} ${resultado.questoes === 1 ? "questão" : "questões"}` : "";
			const detalhe = [licoes, questoes].filter(Boolean).join(" · ");
			return { icone: "check", texto: `Módulo concluído: ${modulo} de ${curso}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "marcou_aguardando_material": {
			const modulo = typeof evento.objeto.modulo === "string" ? evento.objeto.modulo : "um módulo";
			const aviso = typeof resultado.nota === "string" && resultado.nota.trim() ? resultado.nota.trim() : "";
			return { icone: "clock", texto: `Módulo aguardando material: ${modulo}`, ...(aviso ? { detalhe: aviso } : {}) };
		}
		case "gerou_esqueleto": {
			const modulos = typeof resultado.modulos === "number" ? resultado.modulos : Array.isArray(resultado.modulos) ? resultado.modulos.length : undefined;
			const custo = typeof resultado.custo === "number" && resultado.custo > 0 ? formatarDolar(resultado.custo) : "";
			const detalhe = [modulos !== undefined ? `${modulos} ${modulos === 1 ? "módulo" : "módulos"}` : "", custo].filter(Boolean).join(" · ");
			return { icone: "list", texto: `Esqueleto proposto: ${nomeDoCurso(evento)}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "criou_curso": {
			const modulos = typeof resultado.modulos === "number" ? resultado.modulos : Array.isArray(resultado.modulos) ? resultado.modulos.length : undefined;
			const geral = typeof resultado.avaliacaoGeral === "string" && /^\d{4}-\d{2}-\d{2}$/.test(resultado.avaliacaoGeral) ? dataNumerica(resultado.avaliacaoGeral) : "";
			const detalhe = [modulos !== undefined ? `${modulos} ${modulos === 1 ? "módulo" : "módulos"}` : "", geral ? `avaliação geral em ${geral}` : ""].filter(Boolean).join(" · ");
			return { icone: "flag", texto: `Curso criado: ${nomeDoCurso(evento)}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "recalculou_calendario": {
			const geral = typeof resultado.avaliacaoGeral === "string" && /^\d{4}-\d{2}-\d{2}$/.test(resultado.avaliacaoGeral) ? dataNumerica(resultado.avaliacaoGeral) : "";
			return { icone: "refresh", texto: `Calendário recalculado: ${nomeDoCurso(evento)}`, ...(geral ? { detalhe: `avaliação geral em ${geral}` } : {}) };
		}
		case "concluiu_diagnostico": {
			const { acertos, alternativas, dissertativas, nota } = resultado;
			const detalhe = [
				typeof acertos === "number" && typeof alternativas === "number" && alternativas > 0 ? `${acertos} de ${alternativas} ${alternativas === 1 ? "certa" : "certas"}` : "",
				typeof nota === "number" && typeof dissertativas === "number" && dissertativas > 0
					? `${dissertativas === 1 ? "dissertativa" : "dissertativas"} ${numeroCurto(nota * 10)}/10`
					: "",
			]
				.filter(Boolean)
				.join(" · ");
			return { icone: "check", texto: `Diagnóstico concluído: ${nomeDoCurso(evento)}`, ...(detalhe ? { detalhe } : {}) };
		}
		case "aprovou_mapa": {
			const conceitos = typeof resultado.conceitos === "number" ? resultado.conceitos : undefined;
			return {
				icone: "check",
				texto: "Mapa aprovado",
				...(conceitos !== undefined ? { detalhe: `${conceitos} ${conceitos === 1 ? "conceito" : "conceitos"}` } : {}),
			};
		}
		default:
			return { icone: "flag", texto: evento.verbo.replaceAll("_", " ") };
	}
}

/** Os eventos do mais novo ao mais antigo, em grupos por dia (no fuso do computador). */
export function porDia(eventos: readonly Evento[]): Array<{ dia: string; eventos: Evento[] }> {
	const grupos: Array<{ dia: string; eventos: Evento[] }> = [];
	for (const evento of [...eventos].sort((a, b) => b.ts.localeCompare(a.ts))) {
		const dia = diaLongo.format(new Date(evento.ts));
		const ultimo = grupos.at(-1);
		if (ultimo?.dia === dia) ultimo.eventos.push(evento);
		else grupos.push({ dia, eventos: [evento] });
	}
	return grupos;
}

/** Quantos marcos a faixa do painel mostra, no máximo (o resto fica no "Ver tudo"). Só com os ícones, cabem muitos. */
const MARCOS_NA_FAIXA = 40;

/** Os `limite` eventos mais novos, do mais novo ao mais antigo (a lista de entrada não é alterada). */
export function eventosRecentes(eventos: readonly Evento[], limite: number = MARCOS_NA_FAIXA): Evento[] {
	return [...eventos].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, Math.max(0, limite));
}

/** Um marco da faixa: o evento e, só no primeiro de cada dia, o dia por extenso (a faixa usa isso para abrir espaço na troca de dia). */
export interface MarcoDaFaixa {
	evento: Evento;
	dia?: string;
}

/** Os eventos recentes já na ordem da faixa, com o rótulo do dia só no primeiro marco de cada dia (no fuso do computador). */
export function marcosDaFaixa(eventos: readonly Evento[], limite: number = MARCOS_NA_FAIXA): MarcoDaFaixa[] {
	let anterior: string | undefined;
	return eventosRecentes(eventos, limite).map((evento) => {
		const dia = diaLongo.format(new Date(evento.ts));
		const novoDia = dia !== anterior;
		anterior = dia;
		return novoDia ? { evento, dia } : { evento };
	});
}

/** O aviso das linhas do eventos.jsonl que não puderam ser lidas. */
function avisoInvalidas(invalidas: number): string {
	return `${invalidas === 1 ? "Uma linha" : `${invalidas} linhas`} do eventos.jsonl não ${invalidas === 1 ? "pôde" : "puderam"} ser lida${invalidas === 1 ? "" : "s"} (o arquivo não foi mexido).`;
}

/** A lista vertical completa, agrupada por dia. */
export function LinhaDoTempo({ eventos, invalidas }: { eventos: Evento[]; invalidas: number }) {
	const grupos = porDia(eventos);
	if (grupos.length === 0) return <p className="body caderno__carregando">Nada aconteceu neste caderno ainda.</p>;
	let ordem = 0;
	return (
		<div className="tempo">
			{grupos.map((grupo) => (
				<section key={grupo.dia} className="tempo__dia" aria-label={grupo.dia}>
					<h3 className="overline tempo__data">{grupo.dia}</h3>
					<ol className="tempo__lista">
						{grupo.eventos.map((evento) => {
							const { icone, texto, detalhe } = descreverEvento(evento);
							const atraso = Math.min(ordem++, 12) * 0.035;
							return (
								<motion.li
									key={evento.id}
									className="tempo__evento"
									initial={{ opacity: 0, x: -10 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ type: "spring", stiffness: 420, damping: 30, delay: atraso }}
								>
									<span className="tempo__marca" aria-hidden="true">
										<Icon name={icone} size={16} strokeWidth={2.5} />
									</span>
									<span className="tempo__hora data">{hora.format(new Date(evento.ts))}</span>
									<span className="tempo__texto">
										<span className="body-strong">{texto}</span>
										{detalhe ? <span className="body-sm tempo__detalhe">{detalhe}</span> : null}
									</span>
								</motion.li>
							);
						})}
					</ol>
				</section>
			))}
			{invalidas > 0 ? <p className="body-sm tempo__aviso">{avisoInvalidas(invalidas)}</p> : null}
		</div>
	);
}

/** O texto de uma marca para o leitor de tela, que não depende do balão: o dia, a hora, a frase e o detalhe. */
export function rotuloDoMarco(evento: Evento): string {
	const { texto, detalhe } = descreverEvento(evento);
	const quando = new Date(evento.ts);
	return [`${diaLongo.format(quando)}, ${hora.format(quando)}`, texto, detalhe].filter(Boolean).join(". ");
}

/** De onde vem o balão: acompanha o cursor (mouse) ou fica embaixo da marca (foco do teclado ou toque). */
type AlvoDoBalao = { evento: Evento; modo: "mouse"; ponto: Ponto } | { evento: Evento; modo: "ancorado"; elemento: HTMLElement; alvo: Retangulo };

/** O foco veio do teclado? Num clique de mouse o balão já é o do cursor; se o navegador não conhece o seletor, vale como teclado. */
function focoDoTeclado(elemento: HTMLElement): boolean {
	try {
		return elemento.matches(":focus-visible");
	} catch {
		return true;
	}
}

function ancorarEm(evento: Evento, elemento: HTMLElement): AlvoDoBalao {
	const { left, right, top, bottom } = elemento.getBoundingClientRect();
	return { evento, modo: "ancorado", elemento, alvo: { left, right, top, bottom } };
}

interface PropsMarca {
	evento: Evento;
	definir: Dispatch<SetStateAction<AlvoDoBalao | null>>;
}

/** A marca redonda de um evento: só o ícone. O balão com as informações vem do mouse, do foco ou do toque. */
const MarcaDoEvento = memo(function MarcaDoEvento({ evento, definir }: PropsMarca) {
	const { icone } = descreverEvento(evento);
	const noCursor = (e: EventoPonteiro<HTMLButtonElement>) => {
		if (e.pointerType === "mouse") definir({ evento, modo: "mouse", ponto: { x: e.clientX, y: e.clientY } });
	};
	return (
		<button
			type="button"
			className="tempo__marca faixa-tempo__marca"
			aria-label={rotuloDoMarco(evento)}
			onPointerEnter={noCursor}
			onPointerMove={noCursor}
			// Ao sair, o balão some; se a marca tem o foco do teclado, ele volta a ficar embaixo dela.
			onPointerLeave={(e) => {
				if (e.pointerType !== "mouse") return;
				const elemento = e.currentTarget;
				definir(document.activeElement === elemento && focoDoTeclado(elemento) ? ancorarEm(evento, elemento) : null);
			}}
			// Sem mouse, tocar na marca mostra o balão ancorado nela (tocar fora o fecha).
			onPointerUp={(e) => {
				if (e.pointerType !== "mouse") definir(ancorarEm(evento, e.currentTarget));
			}}
			onFocus={(e) => {
				if (focoDoTeclado(e.currentTarget)) definir(ancorarEm(evento, e.currentTarget));
			}}
			onBlur={() => definir((atual) => (atual?.evento.id === evento.id && atual.modo === "ancorado" ? null : atual))}
		>
			<Icon name={icone} size={18} strokeWidth={2.5} />
		</button>
	);
});

/** O balão com as informações do evento, num portal no body (a rolagem da faixa o cortaria), sempre dentro da janela. */
function BalaoDaFaixa({ alvo, parado }: { alvo: AlvoDoBalao; parado: boolean }) {
	const ref = useRef<HTMLDivElement>(null);
	const { texto, detalhe } = descreverEvento(alvo.evento);
	const quando = new Date(alvo.evento.ts);
	// Mede e posiciona antes de pintar, a cada renderização (o cursor anda, o evento troca). Escreve direto no
	// elemento, sem estado, para o balão não ficar um quadro atrás do cursor. As coordenadas são físicas;
	// o zoom do body entra na divisão, como nos flutuantes dos termos.
	useLayoutEffect(() => {
		const elemento = ref.current;
		if (!elemento) return;
		const zoom = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
		const caixa = elemento.getBoundingClientRect();
		const tamanho = { largura: caixa.width, altura: caixa.height };
		const tela = { largura: window.innerWidth, altura: window.innerHeight };
		const { left, top } = alvo.modo === "mouse" ? posicaoDoBalao(alvo.ponto, tamanho, tela) : posicaoAncorada(alvo.alvo, tamanho, tela);
		elemento.style.left = `${left / zoom}px`;
		elemento.style.top = `${top / zoom}px`;
	});
	return createPortal(
		<div ref={ref} className="faixa-tempo__balao" aria-hidden="true">
			<motion.div
				className="faixa-tempo__balao-cartao"
				initial={parado ? false : { opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.12, ease: "easeOut" }}
			>
				<span className="overline faixa-tempo__balao-dia">{diaLongo.format(quando)}</span>
				<span className="data faixa-tempo__balao-hora">{hora.format(quando)}</span>
				<span className="body-strong">{texto}</span>
				{detalhe ? <span className="body-sm faixa-tempo__balao-detalhe">{detalhe}</span> : null}
			</motion.div>
		</div>,
		document.body,
	);
}

interface PropsFaixaTempo {
	eventos: Evento[];
	/** Linhas do eventos.jsonl que não puderam ser lidas. */
	invalidas: number;
	/** O botão "Ver tudo": o painel abre o ModalLinhaDoTempo. */
	verTudo(): void;
	/** Quantos marcos mostrar, no máximo (40 por padrão). */
	limite?: number;
}

/** A faixa horizontal do painel: o título e "Ver tudo" em cima e, embaixo, só as marcas dos eventos mais recentes (a mais nova à esquerda). */
export function FaixaTempo(props: PropsFaixaTempo) {
	const marcos = marcosDaFaixa(props.eventos, props.limite);
	// Com movimento reduzido, os marcos já aparecem no lugar, sem a mola, e o balão sem o fade.
	const parado = semMovimento();
	const [balao, setBalao] = useState<AlvoDoBalao | null>(null);
	const aberto = balao !== null;
	// Com o balão aberto, Esc o fecha, e tocar (ou clicar) fora das marcas também.
	useEffect(() => {
		if (!aberto) return;
		const tecla = (e: KeyboardEvent) => {
			if (e.key === "Escape") setBalao(null);
		};
		const fora = (e: PointerEvent) => {
			if (!(e.target instanceof Element) || !e.target.closest(".faixa-tempo__marca")) setBalao(null);
		};
		document.addEventListener("keydown", tecla);
		document.addEventListener("pointerdown", fora);
		return () => {
			document.removeEventListener("keydown", tecla);
			document.removeEventListener("pointerdown", fora);
		};
	}, [aberto]);
	return (
		<section className="faixa-tempo" aria-label="Linha do tempo">
			<header className="faixa-tempo__cabeca">
				<h3 className="overline faixa-tempo__titulo">Linha do tempo</h3>
				{marcos.length > 0 ? (
					<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={props.verTudo}>
						Ver tudo
					</Button>
				) : null}
			</header>
			{marcos.length === 0 ? (
				<p className="body faixa-tempo__vazio">Nada aconteceu neste caderno ainda.</p>
			) : (
				// A faixa rola na horizontal; as marcas são focáveis, então o teclado percorre e rola a faixa sozinho.
				// Ao rolar, o balão ancorado acompanha a marca.
				<div
					className="faixa-tempo__rolagem"
					role="region"
					aria-label="Eventos mais recentes do caderno, do mais novo ao mais antigo"
					onScroll={() => setBalao((atual) => (atual?.modo === "ancorado" ? ancorarEm(atual.evento, atual.elemento) : atual))}
				>
					<ol className="faixa-tempo__trilho">
						{marcos.map(({ evento, dia }, indice) => (
							<motion.li
								key={evento.id}
								// Na troca de dia, um espaço maior e um tracinho na linha (o primeiro marco não precisa).
								className={`faixa-tempo__marco${dia && indice > 0 ? " faixa-tempo__marco--novo-dia" : ""}`}
								initial={parado ? false : { opacity: 0, x: -10 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ type: "spring", stiffness: 420, damping: 30, delay: parado ? 0 : Math.min(indice, 12) * 0.035 }}
							>
								<MarcaDoEvento evento={evento} definir={setBalao} />
							</motion.li>
						))}
					</ol>
				</div>
			)}
			{balao ? <BalaoDaFaixa alvo={balao} parado={parado} /> : null}
			{props.invalidas > 0 ? <p className="body-sm tempo__aviso">{avisoInvalidas(props.invalidas)}</p> : null}
		</section>
	);
}

interface PropsModalLinhaDoTempo {
	aberto: boolean;
	fechar(): void;
	eventos: Evento[];
	invalidas: number;
	/** O nome da matéria, no alto do modal. */
	titulo?: string;
}

/** O "Ver tudo" da faixa: a lista vertical completa num modal (o corpo do Modal já rola). */
export function ModalLinhaDoTempo(props: PropsModalLinhaDoTempo) {
	return (
		<Modal
			open={props.aberto}
			onClose={props.fechar}
			title="Linha do tempo"
			kicker={props.titulo}
			size="md"
			footer={
				<Button variant="primary" onClick={props.fechar}>
					Fechar
				</Button>
			}
		>
			<LinhaDoTempo eventos={props.eventos} invalidas={props.invalidas} />
		</Modal>
	);
}
