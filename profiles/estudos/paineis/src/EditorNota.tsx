// O editor de uma nota do caderno (item 4.3, parte B), no caminho
// caderno/<matéria>/notas/<título>. O texto aparece formatado, no estilo de
// leitura do app (Prose), e o arquivo continua em markdown: o TipTap lê e
// escreve com as extensões de editor-nota.ts.
//
// Salvar é sozinho: 1,5 s depois de parar de digitar, ao sair da nota e com
// Ctrl+S. Um salvamento por vez: o próximo espera a resposta do anterior, que
// traz a versão nova do arquivo. Se o arquivo mudou fora do app, a extensão
// não grava e a tela pergunta: recarregar a do arquivo ou manter a minha.
// Abrir uma nota nunca reescreve o arquivo; só uma mudança sua salva.
// Uma nota com HTML (as decorações da parte C) abre só para leitura.
//
// O título é o nome do arquivo e se edita no topo; a troca de nome espera o
// salvamento em andamento, e os salvamentos esperam a troca terminar.

import { Button, Callout, Icon, SelectionMenu } from "@estudos/design-system";
import type { JanelaPerfilHook } from "@estudos/ui";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { conferirTitulo, type NotaAberta, TAMANHO_TITULO, temHtml } from "../../lib/nota-tipos.ts";
import { carregarNoEditor, extensoesDaNota, markdownDaNota } from "./editor-nota.ts";
import { mesmoTitulo, PAINEL_NOTAS, useNovasRespostas } from "./notas-ponte.ts";

const ESPERA_SALVAR = 1500;
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

type Situacao =
	| { tipo: "abrindo" }
	| { tipo: "limpa"; salvaEm: string }
	| { tipo: "suja" }
	| { tipo: "salvando" }
	| { tipo: "conflito"; mensagem: string }
	| { tipo: "erro"; mensagem: string };

export interface PropsEditorNota {
	janela: JanelaPerfilHook;
	materiaId: string;
	materiaNome?: string;
	titulo: string;
	/** Volta para a lista de notas. */
	voltar(): void;
	/** A nota mudou de nome: o caminho passa a ser o do título novo. */
	renomeada(titulo: string): void;
}

/**
 * Abre outra nota quando o caminho muda para outro título (voltar no
 * navegador, por exemplo), mas não quando o caminho mudou porque esta nota
 * foi renomeada.
 */
export function EditorNota(props: PropsEditorNota) {
	const [aberta, setAberta] = useState({ titulo: props.titulo, vez: 0 });
	// O último título visto no caminho: só uma mudança nele conta (logo depois de renomear, o caminho ainda traz o antigo por um render).
	const [noCaminho, setNoCaminho] = useState(props.titulo);
	if (!mesmoTitulo(props.titulo, noCaminho)) {
		setNoCaminho(props.titulo);
		if (!mesmoTitulo(props.titulo, aberta.titulo)) setAberta({ titulo: props.titulo, vez: aberta.vez + 1 });
	}
	return (
		<EditorDaNota
			key={aberta.vez}
			{...props}
			titulo={aberta.titulo}
			renomeada={(para) => {
				// Mesma vez: o editor continua montado, só o título (e o caminho) mudam.
				setAberta((atual) => ({ titulo: para, vez: atual.vez }));
				props.renomeada(para);
			}}
		/>
	);
}

function EditorDaNota(props: PropsEditorNota) {
	const { janela, materiaId } = props;
	const { acoes } = janela;
	const [nota, setNota] = useState<NotaAberta | undefined>(undefined);
	const [erroAbrir, setErroAbrir] = useState<string | undefined>(undefined);
	const [situacao, setSituacao] = useState<Situacao>({ tipo: "abrindo" });
	const [somenteLeitura, setSomenteLeitura] = useState(false);
	const [tituloCampo, setTituloCampo] = useState(props.titulo);
	const [erroTitulo, setErroTitulo] = useState<string | undefined>(undefined);
	/** A área que rola (o corpo da seção): a barra da seleção acompanha a rolagem dela. */
	const [corpo, setCorpo] = useState<HTMLDivElement | null>(null);

	// O que vale entre as respostas da extensão (refs: as respostas chegam fora do render).
	const tituloAtual = useRef(props.titulo);
	const versao = useRef<string | undefined>(undefined);
	/** O markdown do que está salvo no arquivo, como o editor o escreve. */
	const base = useRef<string | undefined>(undefined);
	const emVoo = useRef<{ pedido: string; conteudo: string } | undefined>(undefined);
	const pendente = useRef(false);
	const esperandoAbrir = useRef(true);
	const renomeando = useRef(false);
	const renomearDepois = useRef<string | undefined>(undefined);
	const emConflito = useRef(false);
	const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const edicao = useRef(crypto.randomUUID());
	/** As funções do render mais recente: o onUpdate do TipTap e os temporizadores chamam por aqui, para não usar estado velho. */
	const logica = useRef({ mudou: () => {}, salvarAgora: (_forcar?: boolean) => {} });

	const editor = useEditor({
		extensions: extensoesDaNota({ textoVazio: "Escreva aqui. “## ” faz um título, “- ” uma lista, “[ ] ” uma tarefa e [[Nome]] uma menção." }),
		editable: false,
		editorProps: { attributes: { class: "ap-prose body-lg nota__texto", "aria-label": "Texto da nota" } },
		onUpdate: () => logica.current.mudou(),
	});

	const mudouDoSalvo = () => Boolean(editor && base.current !== undefined && markdownDaNota(editor) !== base.current);

	const salvarAgora = (forcar = false) => {
		clearTimeout(temporizador.current);
		if (!editor || base.current === undefined || somenteLeitura) return;
		if (emVoo.current || renomeando.current) {
			pendente.current = true;
			return;
		}
		if (emConflito.current && !forcar) return;
		const conteudo = markdownDaNota(editor);
		if (!forcar && conteudo === base.current) return;
		const pedido = crypto.randomUUID();
		emVoo.current = { pedido, conteudo };
		setSituacao({ tipo: "salvando" });
		acoes
			.acaoDaInterface(PAINEL_NOTAS, "salvar", {
				materia: materiaId,
				titulo: tituloAtual.current,
				conteudo,
				...(versao.current ? { versao: versao.current } : {}),
				...(forcar ? { forcar: true } : {}),
				edicao: edicao.current,
				pedido,
			})
			.catch((falha: unknown) => {
				if (emVoo.current?.pedido !== pedido) return;
				emVoo.current = undefined;
				setSituacao({ tipo: "erro", mensagem: `Não consegui mandar o salvamento: ${(falha as Error).message}` });
			});
	};

	function mudou() {
		if (!editor?.isEditable || base.current === undefined) return;
		if (emConflito.current) return;
		if (!mudouDoSalvo()) {
			clearTimeout(temporizador.current);
			return;
		}
		setSituacao((atual) => (atual.tipo === "salvando" ? atual : { tipo: "suja" }));
		clearTimeout(temporizador.current);
		temporizador.current = setTimeout(() => logica.current.salvarAgora(), ESPERA_SALVAR);
	}

	logica.current = { mudou, salvarAgora };

	const abrir = () => {
		esperandoAbrir.current = true;
		semEsperarFalha(acoes.acaoDaInterface(PAINEL_NOTAS, "abrir", { materia: materiaId, titulo: tituloAtual.current }), setErroAbrir);
	};

	/** Carrega o conteúdo do arquivo no editor (abrir e "Recarregar a do arquivo"). */
	const carregar = (aberta: NotaAberta) => {
		if (!editor) return;
		const soLeitura = temHtml(aberta.conteudo);
		carregarNoEditor(editor, aberta.conteudo);
		editor.setEditable(!soLeitura, false);
		base.current = markdownDaNota(editor);
		versao.current = aberta.versao;
		emConflito.current = false;
		pendente.current = false;
		tituloAtual.current = aberta.titulo;
		setTituloCampo(aberta.titulo);
		setSomenteLeitura(soLeitura);
		setNota(aberta);
		setErroAbrir(undefined);
		setSituacao({ tipo: "limpa", salvaEm: aberta.modificadaEm });
	};

	const enviarRenomear = (para: string) => {
		renomeando.current = true;
		semEsperarFalha(acoes.acaoDaInterface(PAINEL_NOTAS, "renomear", { materia: materiaId, de: tituloAtual.current, para }), (mensagem) => {
			renomeando.current = false;
			setErroTitulo(mensagem);
		});
	};

	const pedirRenomear = () => {
		const conferido = conferirTitulo(tituloCampo);
		if ("erro" in conferido) return setErroTitulo(conferido.erro);
		setErroTitulo(undefined);
		if (conferido.titulo === tituloAtual.current) return setTituloCampo(tituloAtual.current);
		if (renomeando.current) return;
		if (mudouDoSalvo() && !emConflito.current) salvarAgora();
		if (emVoo.current) renomearDepois.current = conferido.titulo;
		else enviarRenomear(conferido.titulo);
	};

	// Abre a nota quando o editor existe e a sessão está aberta.
	const sessaoId = janela.estado.sessao?.sessaoId;
	useEffect(() => {
		if (editor && sessaoId && !nota) abrir();
		// Só editor e sessão: abre uma vez por sessão (abrir lê das refs).
	}, [editor, sessaoId]);

	useNovasRespostas(janela.estado.acoesPorPainel[PAINEL_NOTAS], (resposta) => {
		if (resposta.acao !== "lista" && resposta.dados.materia !== materiaId) return;
		switch (resposta.acao) {
			case "nota":
				if (esperandoAbrir.current && mesmoTitulo(resposta.dados.titulo, tituloAtual.current)) {
					esperandoAbrir.current = false;
					carregar(resposta.dados as NotaAberta);
				}
				return;
			case "salva": {
				const voo = emVoo.current;
				if (!voo || resposta.dados.pedido !== voo.pedido) return;
				base.current = voo.conteudo;
				versao.current = resposta.dados.versao;
				emVoo.current = undefined;
				emConflito.current = false;
				if (renomearDepois.current) {
					const para = renomearDepois.current;
					renomearDepois.current = undefined;
					enviarRenomear(para);
				}
				if (pendente.current || mudouDoSalvo()) {
					pendente.current = false;
					setSituacao({ tipo: "suja" });
					clearTimeout(temporizador.current);
					temporizador.current = setTimeout(() => logica.current.salvarAgora(), ESPERA_SALVAR);
				} else {
					setSituacao({ tipo: "limpa", salvaEm: resposta.dados.modificadaEm });
				}
				return;
			}
			case "conflito":
				if (resposta.dados.pedido !== emVoo.current?.pedido) return;
				emVoo.current = undefined;
				pendente.current = false;
				renomearDepois.current = undefined;
				emConflito.current = true;
				setSituacao({ tipo: "conflito", mensagem: resposta.dados.mensagem });
				return;
			case "renomeada":
				if (!renomeando.current || !mesmoTitulo(resposta.dados.de, tituloAtual.current)) return;
				renomeando.current = false;
				tituloAtual.current = resposta.dados.para;
				setTituloCampo(resposta.dados.para);
				props.renomeada(resposta.dados.para);
				if (pendente.current) {
					pendente.current = false;
					salvarAgora();
				}
				return;
			case "erro": {
				const { ao, pedido, mensagem, titulo } = resposta.dados;
				if (ao === "abrir" && esperandoAbrir.current && mesmoTitulo(titulo, tituloAtual.current)) {
					esperandoAbrir.current = false;
					setErroAbrir(mensagem);
				} else if (ao === "salvar" && pedido && pedido === emVoo.current?.pedido) {
					emVoo.current = undefined;
					setSituacao({ tipo: "erro", mensagem });
				} else if (ao === "renomear" && renomeando.current && mesmoTitulo(titulo, tituloAtual.current)) {
					renomeando.current = false;
					setErroTitulo(mensagem);
					if (pendente.current) {
						pendente.current = false;
						salvarAgora();
					}
				}
				return;
			}
		}
	});

	// Sair da nota (ou fechar a janela) com mudança por salvar: salva já, sem esperar resposta.
	const salvarAoSair = useRef<() => void>(() => {});
	salvarAoSair.current = () => {
		clearTimeout(temporizador.current);
		if (!editor || editor.isDestroyed || base.current === undefined || somenteLeitura || emConflito.current) return;
		const conteudo = markdownDaNota(editor);
		if (conteudo === base.current) return;
		// Com um salvamento ainda sem resposta, a versão que temos já ficou velha: este grava por cima dele.
		const forcar = Boolean(emVoo.current);
		void acoes
			.acaoDaInterface(PAINEL_NOTAS, "salvar", {
				materia: materiaId,
				titulo: tituloAtual.current,
				conteudo,
				...(versao.current && !forcar ? { versao: versao.current } : {}),
				...(forcar ? { forcar: true } : {}),
				edicao: edicao.current,
				pedido: crypto.randomUUID(),
			})
			.catch(() => {});
		base.current = conteudo;
	};
	useEffect(() => {
		const aoFechar = (evento: BeforeUnloadEvent) => {
			if (mudouDoSalvo() || emVoo.current) {
				salvarAoSair.current();
				evento.preventDefault();
			}
		};
		window.addEventListener("beforeunload", aoFechar);
		return () => {
			window.removeEventListener("beforeunload", aoFechar);
			salvarAoSair.current();
		};
		// Liga uma vez: tudo o que lê está nas refs.
	}, []);

	const teclas = (evento: KeyboardEvent) => {
		if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "s") {
			evento.preventDefault();
			salvarAgora();
		}
	};

	const manterMinha = () => {
		emConflito.current = false;
		salvarAgora(true);
	};

	return (
		<>
			<header className="caderno__secao-cabeca nota__cabeca">
				<button type="button" className="overline nota__voltar" onClick={props.voltar}>
					<Icon name="arrow-left" size={14} strokeWidth={2.5} />
					Notas{props.materiaNome ? ` · ${props.materiaNome}` : ""}
				</button>
				<input
					className="display-sm nota__titulo"
					value={tituloCampo}
					maxLength={TAMANHO_TITULO}
					aria-label="Título da nota"
					aria-invalid={erroTitulo ? true : undefined}
					disabled={!nota || somenteLeitura}
					onChange={(evento) => setTituloCampo(evento.target.value)}
					onBlur={pedirRenomear}
					onKeyDown={(evento) => {
						if (evento.key === "Enter") {
							evento.preventDefault();
							pedirRenomear();
							editor?.commands.focus("start");
						} else if (evento.key === "Escape") {
							setTituloCampo(tituloAtual.current);
							setErroTitulo(undefined);
						}
					}}
				/>
				<span className="data caderno__secao-meta nota__situacao" aria-live="polite">
					{rotuloSituacao(situacao, somenteLeitura)}
				</span>
				{erroTitulo ? <span className="body-sm nota__erro-titulo">{erroTitulo}</span> : null}
			</header>
			<div ref={setCorpo} className="caderno__secao-corpo nota__corpo" onKeyDown={teclas}>
				{erroAbrir ? (
					<Callout tone="amber" label="Não abri a nota">
						<p>{erroAbrir}</p>
						<div className="nota__botoes">
							<Button variant="secondary" icon="arrow-left" onClick={props.voltar}>
								Voltar para as notas
							</Button>
							<Button variant="secondary" icon="refresh" onClick={abrir}>
								Tentar de novo
							</Button>
						</div>
					</Callout>
				) : null}
				{situacao.tipo === "conflito" ? (
					<Callout tone="amber" label="Mudou fora do app">
						<p>{situacao.mensagem} Nada foi gravado por cima. Escolha qual versão fica:</p>
						<div className="nota__botoes">
							<Button variant="secondary" icon="refresh" onClick={abrir}>
								Recarregar a do arquivo
							</Button>
							<Button variant="primary" icon="check" onClick={manterMinha}>
								Manter a minha
							</Button>
						</div>
					</Callout>
				) : null}
				{situacao.tipo === "erro" ? (
					<Callout tone="amber" label="Não salvei">
						<p>{situacao.mensagem}</p>
						<div className="nota__botoes">
							<Button variant="secondary" icon="refresh" onClick={() => salvarAgora()}>
								Tentar de novo
							</Button>
						</div>
					</Callout>
				) : null}
				{somenteLeitura ? (
					<Callout tone="steel" label="Só leitura" icon="lock">
						<p>
							Esta nota tem HTML (decorações como destaques e blocos especiais), que o editor só vai entender na próxima parte. Até lá ela abre só para leitura,
							para nada se perder. Você ainda pode mudar o arquivo fora do app.
						</p>
					</Callout>
				) : null}
				{!nota && !erroAbrir ? <p className="body caderno__carregando">Abrindo a nota…</p> : null}
				<div className={`nota__folha${nota ? "" : " nota__folha--escondida"}`}>
					<EditorContent editor={editor} />
				</div>
				{editor ? (
					<BubbleMenu
						editor={editor}
						className="nota__selecao"
						options={{ placement: "top", offset: 8, flip: true, shift: { padding: 12 }, ...(corpo ? { scrollTarget: corpo } : {}) }}
						onMouseDown={(evento) => evento.preventDefault()}
					>
						<SelectionMenu
							label="Formatar o trecho"
							actions={[
								{ label: "Negrito", onClick: () => editor.chain().focus().toggleBold().run() },
								{ label: "Itálico", onClick: () => editor.chain().focus().toggleItalic().run() },
								{ label: "Título", onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
							]}
						/>
					</BubbleMenu>
				) : null}
			</div>
		</>
	);
}

function rotuloSituacao(situacao: Situacao, somenteLeitura: boolean): string {
	if (somenteLeitura) return "Só leitura";
	switch (situacao.tipo) {
		case "abrindo":
			return "Abrindo…";
		case "limpa":
			return `Salva às ${hora.format(new Date(situacao.salvaEm))}`;
		case "suja":
			return "Mudanças por salvar";
		case "salvando":
			return "Salvando…";
		case "conflito":
			return "Mudou fora do app";
		case "erro":
			return "Não salvou";
	}
}

/** Manda a ação; se nem chegou a sair (a conexão caiu), passa a mensagem para `falhou`. */
function semEsperarFalha(promessa: Promise<void>, falhou: (mensagem: string) => void): void {
	promessa.catch((falha: unknown) => falhou(`Não consegui falar com a sessão: ${(falha as Error).message}`));
}
