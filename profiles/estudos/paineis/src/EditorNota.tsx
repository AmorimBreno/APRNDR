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

import { Button, Callout, Icon, Modal } from "@estudos/design-system";
import { type JanelaPerfilHook, semMovimento, useValorEstavel } from "@estudos/ui";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { conferirTitulo, type NotaAberta, TAMANHO_TITULO, temHtmlDesconhecido } from "../../lib/nota-tipos.ts";
import { ancoraDoEditor, mostrarNaNota } from "./destaque-nota.ts";
import { acrescentarMarkdown, carregarNoEditor, extensoesDaNota, markdownDaNota } from "./editor-nota.ts";
import { AlcaBlocos } from "./AlcaBlocos.tsx";
import { BarraFormatacao } from "./BarraFormatacao.tsx";
import { AcoesDePergunta, BarraSelecao, useSelecaoDoDocumento } from "./BarraSelecao.tsx";
import { EditorFormula } from "./EditorFormula.tsx";
import { idDoLinkDeConversa } from "./conversa-link.ts";
import { FaixaDoPlano } from "./FaixaDoPlano.tsx";
import { comecaComATag, dadosDaFaixa, mesmaFaixa } from "./plano-faixa.ts";
import { useMesa } from "./mesa-ir.ts";
import { RotuloEstado } from "./RotuloEstado.tsx";
import { type ArquivoMencionavel, META_TITULOS, materialDoAlvo } from "./mencao.ts";
import { PROIBIDOS_PADRAO, trechoDaBarra } from "./selecao.ts";
import { useTrocaSessao } from "./troca-sessao.tsx";
import { useVendoOpcional } from "./vendo.tsx";

type TipoFormula = "linha" | "bloco";

import { mesmoTitulo, PAINEL_NOTAS, useNovasRespostas } from "./notas-ponte.ts";

const ESPERA_SALVAR = 1500;
/** Na nota o próprio editor é contenteditable: o que fica de fora da seleção são os campos (o título) e o painel do professor. */
const PROIBIDOS_NOTA = PROIBIDOS_PADRAO.replace("[contenteditable=true],", "");
/** Quanto a troca de sessão espera o salvamento terminar. */
const PRAZO_ANTES_DE_TROCAR = 5000;
/** Quanto o Apagar espera a resposta da extensão antes de soltar o modal. */
const PRAZO_APAGAR = 15_000;
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
	/** Os títulos das notas da matéria (para as menções); undefined enquanto a lista não chegou. */
	titulos?: readonly string[];
	/** Abre outra nota da matéria (o clique numa menção). */
	abrirNota(titulo: string): void;
	/** Os arquivos de material da matéria (para as menções); undefined enquanto a lista não chegou. */
	arquivos?: readonly ArquivoMencionavel[];
	/** Abre a seção Materiais com o arquivo em destaque (o clique numa menção a material). */
	abrirMaterial(nome: string): void;
	/** Um nó logo abaixo do cabeçalho "← Notas · matéria … Salva às", dentro do cartão (na mesa: a faixa de abas). */
	abaixoDoCabecalho?: ReactNode;
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
	// O último rótulo de situação mostrado ("Salva às 10:02"): passa para a nota seguinte, que o mantém na tela
	// até o estado dela durar o bastante (rotuloEstavel), em vez de piscar "Abrindo…" na troca.
	const ultimoRotulo = useRef<string | undefined>(undefined);
	return (
		<EditorDaNota
			key={aberta.vez}
			{...props}
			rotuloInicial={ultimoRotulo.current}
			aoMostrarRotulo={(rotulo) => {
				ultimoRotulo.current = rotulo;
			}}
			titulo={aberta.titulo}
			renomeada={(para) => {
				// Mesma vez: o editor continua montado, só o título (e o caminho) mudam.
				setAberta((atual) => ({ titulo: para, vez: atual.vez }));
				props.renomeada(para);
			}}
		/>
	);
}

function EditorDaNota(props: PropsEditorNota & { rotuloInicial?: string | undefined; aoMostrarRotulo?(rotulo: string): void }) {
	const { janela, materiaId } = props;
	const { acoes } = janela;
	const [nota, setNota] = useState<NotaAberta | undefined>(undefined);
	/**
	 * A nota só aparece pronta: o conteúdo entra no editor e os blocos especiais (destaque, recolhível,
	 * pergunta e resposta) são desenhados pelo React num passo seguinte; até lá a página fica escondida,
	 * ocupando o espaço, para não piscar sem estilo (pedido do Breno em 2026-11-10). Cada carga soma 1.
	 */
	const [carga, setCarga] = useState(0);
	const [pronta, setPronta] = useState(false);
	const [erroAbrir, setErroAbrir] = useState<string | undefined>(undefined);
	const [situacao, setSituacao] = useState<Situacao>({ tipo: "abrindo" });
	const [somenteLeitura, setSomenteLeitura] = useState(false);
	const [tituloCampo, setTituloCampo] = useState(props.titulo);
	/** O título que vale agora (o do arquivo, não o que está sendo digitado no campo): o rótulo da nota no "Vendo". */
	const [tituloVigente, setTituloVigente] = useState(props.titulo);
	const [erroTitulo, setErroTitulo] = useState<string | undefined>(undefined);
	/** Muda a cada vez que a barra da seleção some: ela volta com os menus fechados. */
	const [vezBarra, setVezBarra] = useState(0);
	/** A barra da seleção (o foco no campo do link fica dentro dela, e ela não pode sumir por isso). */
	const barraSelecao = useRef<HTMLDivElement>(null);
	/** A área que rola (o corpo da seção): a barra da seleção acompanha a rolagem dela. */
	const [corpo, setCorpo] = useState<HTMLDivElement | null>(null);
	/** A página (onde a alça dos blocos fica). */
	const [pagina, setPagina] = useState<HTMLDivElement | null>(null);
	/** O título grande da página: cresce com o texto (um título longo quebra a linha, como no Notion). */
	const campoTitulo = useRef<HTMLTextAreaElement>(null);
	// Outra nota (o editor é remontado por nota): o texto entra com um fade rápido, só de opacidade,
	// assim que o conteúdo chega, para a troca não parecer travada. Sem animação com movimento reduzido.
	const fadeFeito = useRef(false);
	useLayoutEffect(() => {
		const campo = campoTitulo.current;
		if (!campo) return;
		campo.style.height = "auto";
		campo.style.height = `${campo.scrollHeight}px`;
	}, [tituloCampo]);
	// A altura do título depende da largura: na mesa, ela muda quando o painel do professor abre ou fecha e
	// quando a nota monta antes de a grade ter largura. Mede de novo a cada mudança de largura do campo.
	useEffect(() => {
		const campo = campoTitulo.current;
		if (!campo) return;
		let largura = campo.clientWidth;
		const observador = new ResizeObserver(() => {
			if (campo.clientWidth === largura) return;
			largura = campo.clientWidth;
			campo.style.height = "auto";
			campo.style.height = `${campo.scrollHeight}px`;
		});
		observador.observe(campo);
		return () => observador.disconnect();
	}, []);

	// Espera os blocos especiais da carga de agora estarem desenhados (cada ".react-renderer" do TipTap com
	// conteúdo) e mais um quadro, e só então mostra. Tem prazo (400 ms): se algum bloco não desenhar, a nota
	// aparece assim mesmo. O quadro usa setTimeout como reserva, porque requestAnimationFrame para em aba escondida.
	useEffect(() => {
		if (!nota || !pagina) return;
		let cancelado = false;
		const inicio = performance.now();
		const proximoQuadro = (fazer: () => void) => {
			let feito = false;
			const uma = () => {
				if (feito || cancelado) return;
				feito = true;
				fazer();
			};
			requestAnimationFrame(uma);
			setTimeout(uma, 32);
		};
		const conferir = () => {
			const desenhados = [...pagina.querySelectorAll(".react-renderer")].every((elemento) => elemento.childElementCount > 0);
			if (desenhados || performance.now() - inicio > 400) proximoQuadro(() => setPronta(true));
			else proximoQuadro(conferir);
		};
		proximoQuadro(conferir);
		return () => {
			cancelado = true;
		};
	}, [nota, pagina, carga]);

	useLayoutEffect(() => {
		if (!pronta || !pagina || fadeFeito.current) return;
		fadeFeito.current = true;
		if (semMovimento() || typeof pagina.animate !== "function") return;
		pagina.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "ease-out" });
	}, [pronta, pagina]);

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
	const logica = useRef({
		mudou: () => {},
		salvarAgora: (_forcar?: boolean) => {},
		salvarEEsperar: (): Promise<void> => Promise.resolve(),
		editarFormula: (_tipo: TipoFormula, _latex: string, _posicao: number) => {},
		abrirFormula: (_tipo: TipoFormula, _posicao: number) => {},
		abrirMencao: (_alvo: string) => {},
	});
	/** Os títulos das notas agora (a extensão da menção lê daqui). */
	const titulosAgora = useRef(props.titulos);
	titulosAgora.current = props.titulos;
	const arquivosAgora = useRef(props.arquivos);
	arquivosAgora.current = props.arquivos;
	/** A menção clicada para uma nota que não existe: o modal oferece criar. */
	const [criarMencao, setCriarMencao] = useState<{ alvo: string; criando: boolean; erro?: string } | undefined>(undefined);
	/** O botão Apagar do cabeçalho: o modal de confirmação, o pedido em andamento e o erro da recusa. */
	const [confirmandoApagar, setConfirmandoApagar] = useState(false);
	const [apagando, setApagando] = useState(false);
	const [erroApagar, setErroApagar] = useState<string | undefined>(undefined);
	/** O pedido `apagar` que espera resposta (a resposta da ponte traz o mesmo `pedido`). */
	const apagarPedido = useRef<string | undefined>(undefined);
	const prazoApagar = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	/** A nota foi (ou está sendo) apagada: nada mais salva, nem ao sair, senão o salvamento recriaria o arquivo. */
	const apagada = useRef(false);
	const vivo = useRef(true);
	useEffect(() => {
		vivo.current = true;
		return () => {
			vivo.current = false;
			clearTimeout(prazoApagar.current);
		};
	}, []);
	/** A fórmula aberta no modal (EditorFormula). */
	const [formula, setFormula] = useState<{ tipo: TipoFormula; posicao: number; latex: string; nova: boolean } | undefined>(undefined);

	const editor = useEditor({
		extensions: extensoesDaNota({
			textoVazio: "Escreva aqui. “/” abre os blocos (fórmula, caixa, definição, pergunta…); “## ” faz um título e [[Nome]] uma menção.",
			naTela: true,
			editarFormula: (tipo, no, posicao) => logica.current.editarFormula(tipo, no.attrs.latex as string, posicao),
			abrirFormula: (tipo, posicao) => logica.current.abrirFormula(tipo, posicao),
			titulosNotas: () => titulosAgora.current,
			arquivosMateria: () => arquivosAgora.current,
			abrirMencao: (alvo) => logica.current.abrirMencao(alvo),
		}),
		editable: false,
		editorProps: { attributes: { class: "ap-prose body-lg editor-nota__texto", "aria-label": "Texto da nota" } },
		onUpdate: () => logica.current.mudou(),
	});

	const mudouDoSalvo = () => Boolean(editor && base.current !== undefined && markdownDaNota(editor) !== base.current);

	const salvarAgora = (forcar = false) => {
		clearTimeout(temporizador.current);
		if (!editor || base.current === undefined || somenteLeitura || apagada.current) return;
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

	/**
	 * Para a troca de sessão (antes de trocar): salva o que falta, sem esperar o temporizador, e só termina quando
	 * não há salvamento em voo. Tem prazo: se a resposta não vier, a troca segue (o editor reabre a nota depois).
	 */
	const salvarEEsperar = async () => {
		const prazo = Date.now() + PRAZO_ANTES_DE_TROCAR;
		while (Date.now() < prazo) {
			if (apagada.current) return;
			if (!emVoo.current && !renomeando.current) {
				if (!mudouDoSalvo() || emConflito.current || somenteLeitura) return;
				salvarAgora();
			}
			await new Promise((resolver) => setTimeout(resolver, 50));
		}
	};

	logica.current = {
		mudou,
		salvarAgora,
		salvarEEsperar,
		editarFormula: (tipo, latex, posicao) => {
			if (editor?.isEditable) setFormula({ tipo, posicao, latex, nova: false });
		},
		abrirFormula: (tipo, posicao) => setFormula({ tipo, posicao, latex: "", nova: true }),
		abrirMencao: (alvo) => {
			const material = materialDoAlvo(alvo);
			if (material !== undefined) return props.abrirMaterial(material);
			const existente = props.titulos?.find((titulo) => mesmoTitulo(titulo, alvo));
			if (existente) props.abrirNota(existente);
			else if (props.titulos) setCriarMencao({ alvo, criando: false });
		},
	};

	const mesa = useMesa();
	const mesaAgora = useRef(mesa);
	mesaAgora.current = mesa;
	const invalidarCopia = useVendoOpcional()?.invalidarCopia;

	/** A recusa (ou a falta de resposta) do Apagar: o modal fica aberto com a mensagem e tudo volta a salvar. */
	const falhouApagar = (mensagem: string, esquecerPedido = true) => {
		if (esquecerPedido) apagarPedido.current = undefined;
		clearTimeout(prazoApagar.current);
		apagada.current = false;
		setApagando(false);
		setErroApagar(mensagem);
	};

	/** A extensão apagou: a aba da nota fecha (a mesa leva para a vizinha) ou, sem mesa, volta para a lista. */
	const terminarApagar = async () => {
		apagarPedido.current = undefined;
		clearTimeout(prazoApagar.current);
		clearTimeout(temporizador.current);
		apagada.current = true;
		setApagando(true);
		const rota = `caderno/${materiaId}/notas/${tituloAtual.current}`;
		// A cópia que o Vendo guardava da nota ficou velha.
		invalidarCopia?.(rota);
		await mesaAgora.current?.fecharAbaDaNota?.(rota);
		// Ainda aqui (sem mesa, ou a aba já não existia): volta para a lista.
		if (vivo.current) props.voltar();
	};

	/** O "Apagar" do modal: salva o que falta (a lixeira fica com o que foi escrito), manda o pedido e espera a resposta. */
	const apagarAgora = async () => {
		if (apagando || !nota) return;
		setApagando(true);
		setErroApagar(undefined);
		clearTimeout(temporizador.current);
		await logica.current.salvarEEsperar();
		if (!vivo.current) return;
		if (emVoo.current || renomeando.current) return falhouApagar("A nota ainda está sendo salva. Tente de novo em instantes.");
		const pedido = crypto.randomUUID();
		apagarPedido.current = pedido;
		apagada.current = true;
		acoes
			.acaoDaInterface(PAINEL_NOTAS, "apagar", { materia: materiaId, titulo: tituloAtual.current, ...(versao.current ? { versao: versao.current } : {}), pedido })
			.catch((falha: unknown) => {
				if (apagarPedido.current === pedido) falhouApagar(`Não consegui falar com a sessão: ${(falha as Error).message}`);
			});
		// Sem resposta em 15 s o modal não pode ficar preso; se a resposta chegar depois, o pedido guardado ainda a reconhece.
		prazoApagar.current = setTimeout(() => {
			if (apagarPedido.current === pedido && vivo.current) falhouApagar("A sessão não respondeu. Confira na lista de notas se ela foi apagada.", false);
		}, PRAZO_APAGAR);
	};

	/** Cria a nota da menção e vai para ela (a resposta "criada" chega pela ponte). */
	const criarNotaDaMencao = () => {
		if (!criarMencao) return;
		setCriarMencao({ ...criarMencao, criando: true });
		acoes.acaoDaInterface(PAINEL_NOTAS, "criar", { materia: materiaId, titulo: criarMencao.alvo }).catch((falha: unknown) => {
			setCriarMencao({ ...criarMencao, criando: false, erro: `Não consegui criar a nota: ${(falha as Error).message}` });
		});
	};

	// A lista de notas mudou: a menção tracejada (nota que não existe) é refeita.
	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
		editor.view.dispatch(editor.state.tr.setMeta(META_TITULOS, true).setMeta("addToHistory", false));
	}, [editor, props.titulos, props.arquivos]);

	/** Tira a fórmula da nota (salvar vazio, Remover, ou cancelar uma fórmula nova). */
	const removerFormula = () => {
		if (editor && formula) {
			if (formula.tipo === "bloco") editor.chain().focus().deleteBlockMath({ pos: formula.posicao }).run();
			else editor.chain().focus().deleteInlineMath({ pos: formula.posicao }).run();
		}
		setFormula(undefined);
	};
	const salvarFormula = (latex: string) => {
		if (!latex) return removerFormula();
		if (editor && formula) {
			// O cursor vai para logo depois da fórmula (e não fica a fórmula selecionada).
			const depois = formula.posicao + (editor.state.doc.nodeAt(formula.posicao)?.nodeSize ?? 1);
			if (formula.tipo === "bloco") editor.chain().focus().updateBlockMath({ latex, pos: formula.posicao }).setTextSelection(depois).run();
			else editor.chain().focus().updateInlineMath({ latex, pos: formula.posicao }).setTextSelection(depois).run();
		}
		setFormula(undefined);
	};
	const cancelarFormula = () => {
		if (formula?.nova) removerFormula();
		else {
			setFormula(undefined);
			editor?.commands.focus();
		}
	};

	const abrir = () => {
		esperandoAbrir.current = true;
		semEsperarFalha(acoes.acaoDaInterface(PAINEL_NOTAS, "abrir", { materia: materiaId, titulo: tituloAtual.current }), setErroAbrir);
	};

	/** Carrega o conteúdo do arquivo no editor (abrir e "Recarregar a do arquivo"). */
	const carregar = (aberta: NotaAberta) => {
		if (!editor) return;
		const soLeitura = temHtmlDesconhecido(aberta.conteudo);
		setPronta(false);
		setCarga((atual) => atual + 1);
		carregarNoEditor(editor, aberta.conteudo);
		editor.setEditable(!soLeitura, false);
		base.current = markdownDaNota(editor);
		versao.current = aberta.versao;
		emConflito.current = false;
		pendente.current = false;
		tituloAtual.current = aberta.titulo;
		setTituloCampo(aberta.titulo);
		setTituloVigente(aberta.titulo);
		setSomenteLeitura(soLeitura);
		setNota(aberta);
		setErroAbrir(undefined);
		setSituacao({ tipo: "limpa", salvaEm: aberta.modificadaEm });
	};

	/**
	 * O professor gravou nesta nota (a ação `mudou_fora`, docs/planos-de-estudo.md, seção 3). Com o editor limpo (sem mudança
	 * por salvar, sem salvamento em voo nem renomeação, sem conflito) carrega o conteúdo e a versão novos, fora do desfazer
	 * (carregarNoEditor) e sem esconder a página (nada some na troca). Sujo, ignora: o salvamento dele cai no conflito que
	 * já existe ("Recarregar a do arquivo" ou "Manter a minha"). Devolve se recarregou.
	 */
	const recarregarDeFora = (dados: { titulo: string; versao: string; conteudo: string }): boolean => {
		if (!editor || editor.isDestroyed || !nota || base.current === undefined || apagada.current) return false;
		if (!mesmoTitulo(dados.titulo, tituloAtual.current)) return false;
		if (emVoo.current || renomeando.current || emConflito.current || pendente.current || mudouDoSalvo()) return false;
		if (dados.versao === versao.current) return false;
		clearTimeout(temporizador.current);
		const soLeitura = temHtmlDesconhecido(dados.conteudo);
		carregarNoEditor(editor, dados.conteudo);
		editor.setEditable(!soLeitura, false);
		base.current = markdownDaNota(editor);
		versao.current = dados.versao;
		setSomenteLeitura(soLeitura);
		setNota({ ...nota, conteudo: dados.conteudo, versao: dados.versao });
		return true;
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

	// A mesa pede o salvamento antes de trocar a sessão da janela (a nota aberta fica aqui).
	const { registrarAntesDeTrocar } = useTrocaSessao();
	useEffect(() => registrarAntesDeTrocar(() => logica.current.salvarEEsperar()), [registrarAntesDeTrocar]);

	// A sessão trocou com um salvamento em voo: a resposta dele voltaria pela ponte velha e nunca chegaria, e o
	// editor ficaria preso em "salvando". Solta o salvamento e abre a nota de novo, que traz a versão do arquivo.
	const sessaoVista = useRef(sessaoId);
	useEffect(() => {
		if (sessaoVista.current === sessaoId) return;
		const anterior = sessaoVista.current;
		sessaoVista.current = sessaoId;
		// Sem nota carregada, o efeito de abrir acima já cuida.
		if (!anterior || !sessaoId || !nota || (!emVoo.current && !renomeando.current)) return;
		clearTimeout(temporizador.current);
		emVoo.current = undefined;
		renomeando.current = false;
		renomearDepois.current = undefined;
		pendente.current = false;
		abrir();
	}, [sessaoId]);

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
			case "mudou_fora":
				recarregarDeFora(resposta.dados);
				return;
			case "conflito":
				if (resposta.dados.pedido !== emVoo.current?.pedido) return;
				emVoo.current = undefined;
				pendente.current = false;
				renomearDepois.current = undefined;
				emConflito.current = true;
				setSituacao({ tipo: "conflito", mensagem: resposta.dados.mensagem });
				return;
			case "criada":
				if (criarMencao?.criando && mesmoTitulo(resposta.dados.titulo, criarMencao.alvo)) {
					setCriarMencao(undefined);
					props.abrirNota(resposta.dados.titulo);
				}
				return;
			case "renomeada":
				if (!renomeando.current || !mesmoTitulo(resposta.dados.de, tituloAtual.current)) return;
				renomeando.current = false;
				tituloAtual.current = resposta.dados.para;
				setTituloCampo(resposta.dados.para);
				setTituloVigente(resposta.dados.para);
				props.renomeada(resposta.dados.para);
				if (pendente.current) {
					pendente.current = false;
					salvarAgora();
				}
				return;
			case "apagada":
				if (apagarPedido.current && resposta.dados.pedido === apagarPedido.current) void terminarApagar();
				return;
			case "erro": {
				const { ao, pedido, mensagem, titulo } = resposta.dados;
				if (ao === "apagar" && pedido && pedido === apagarPedido.current) {
					falhouApagar(mensagem);
				} else if (ao === "abrir"&& esperandoAbrir.current && mesmoTitulo(titulo, tituloAtual.current)) {
					esperandoAbrir.current = false;
					setErroAbrir(mensagem);
				} else if (ao === "salvar" && pedido && pedido === emVoo.current?.pedido) {
					emVoo.current = undefined;
					setSituacao({ tipo: "erro", mensagem });
				} else if (ao === "criar" && criarMencao?.criando && mesmoTitulo(titulo, criarMencao.alvo)) {
					setCriarMencao({ ...criarMencao, criando: false, erro: mensagem });
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
		if (!editor || editor.isDestroyed || base.current === undefined || somenteLeitura || emConflito.current || apagada.current) return;
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

	// A nota aberta se registra no "Vendo" da mesa (vendo.tsx): o professor recebe o markdown do buffer do editor, mesmo antes
	// de salvar. Fora da mesa não há provedor e nada acontece. A troca de sessão já salva pela registrarAntesDeTrocar acima.
	// Parte C1: a mesa pede por aqui para achar e destacar um trecho (mostrar, só com a página pronta) e o "Guardar na
	// nota" acrescenta ao buffer (inserirNoBuffer). Tudo lê das refs: a fonte não é registrada de novo a cada render.
	const registrarVendo = useVendoOpcional()?.registrar;
	const abrirConversa = useMesa()?.abrirConversa;
	const abrirConversaAgora = useRef(abrirConversa);
	abrirConversaAgora.current = abrirConversa;
	const aoClicarNaFolha = (evento: MouseEvent<HTMLDivElement>) => {
		const idDaConversa = idDoLinkDeConversa(evento.target);
		if (idDaConversa === undefined) return;
		evento.preventDefault();
		evento.stopPropagation();
		if (idDaConversa !== "") abrirConversaAgora.current?.(idDaConversa);
	};
	const notaCarregada = Boolean(nota);
	const prontaAgora = useRef(pronta);
	prontaAgora.current = pronta;
	const somenteLeituraAgora = useRef(somenteLeitura);
	somenteLeituraAgora.current = somenteLeitura;
	const corpoAgora = useRef(corpo);
	corpoAgora.current = corpo;
	useEffect(() => {
		if (!registrarVendo || !editor || !notaCarregada) return;
		return registrarVendo({
			tipo: "nota",
			rotulo: tituloVigente,
			origem: `caderno/${materiaId}/notas/${tituloVigente}`,
			texto: () => (editor.isDestroyed ? undefined : markdownDaNota(editor)),
			mostrar: (pedido, { suave }) => {
				if (editor.isDestroyed || !prontaAgora.current || base.current === undefined) return undefined;
				return mostrarNaNota(editor, pedido, { rolavel: corpoAgora.current, suave, parado: semMovimento() });
			},
			inserirNoBuffer: (markdown) => {
				if (editor.isDestroyed || base.current === undefined) return { ok: false, motivo: "sem-nota" };
				if (emConflito.current) return { ok: false, motivo: "conflito" };
				if (somenteLeituraAgora.current || !editor.isEditable) return { ok: false, motivo: "somente-leitura" };
				if (emVoo.current || renomeando.current) return { ok: false, motivo: "salvando" };
				return acrescentarMarkdown(editor, markdown) ? { ok: true } : { ok: false, motivo: "vazio" };
			},
		});
	}, [registrarVendo, editor, notaCarregada, tituloVigente, materiaId]);

	// A seleção e a barra de perguntas. Com a nota em edição e um trecho de texto selecionado, o BubbleMenu da formatação
	// aparece e o grupo de perguntas entra nele; a BarraSelecao flutuante só aparece quando o BubbleMenu não está
	// (nota só leitura, ou uma seleção que ele não cobre, como o bloco de código).
	const folha = useRef<HTMLDivElement>(null);
	const { bolhaNaSelecao, trechoDoEditor } = useEditorState({
		editor,
		selector: ({ editor: atual }) => {
			if (!atual) return { bolhaNaSelecao: false, trechoDoEditor: undefined };
			const { selection, doc } = atual.state;
			const texto = selection instanceof TextSelection && !selection.empty && !atual.isActive("codeBlock");
			return { bolhaNaSelecao: atual.isEditable && texto, trechoDoEditor: texto ? trechoDaBarra(doc.textBetween(selection.from, selection.to, " ")) : undefined };
		},
	});
	const { selecao, limpar: limparSelecao } = useSelecaoDoDocumento(folha, { proibidos: PROIBIDOS_NOTA, ativo: !bolhaNaSelecao });
	/** Depois de uma pergunta pelo BubbleMenu: o cursor vai para o fim do trecho, sem apagar o foco do editor. */
	const soltarSelecaoDoEditor = () => {
		if (editor && !editor.isDestroyed) editor.commands.setTextSelection(editor.state.selection.to);
	};

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

	// A faixa do plano de estudos: o progresso e as conversas, ao vivo do que está no editor (mesmo sem salvar). A conferência
	// barata (o primeiro texto não vazio é a tag?) evita serializar o documento a cada transação das notas comuns.
	const faixaDoPlano = useEditorState({
		editor,
		selector: ({ editor: atual }) => {
			if (!atual || atual.isDestroyed) return undefined;
			let primeiro: string | undefined;
			atual.state.doc.forEach((bloco) => {
				if (primeiro === undefined && bloco.textContent.trim() !== "") primeiro = bloco.textContent.trim();
			});
			return comecaComATag(primeiro) ? dadosDaFaixa(markdownDaNota(atual)) : undefined;
		},
		equalityFn: mesmaFaixa,
	});

	const passageiro = !somenteLeitura && (situacao.tipo === "abrindo" || situacao.tipo === "suja" || situacao.tipo === "salvando");
	// Estados passageiros só depois de 1 s; o último rótulo da nota anterior fica até lá (docs/padroes-de-interface.md).
	const rotuloVisivel = useValorEstavel(rotuloSituacao(situacao, somenteLeitura), passageiro, props.rotuloInicial);
	const aoMostrarRotulo = props.aoMostrarRotulo;
	useEffect(() => {
		aoMostrarRotulo?.(rotuloVisivel);
	}, [rotuloVisivel, aoMostrarRotulo]);

	return (
		<>
			{/* A faixa de cima: voltar e a situação do salvamento. O título fica na página. */}
			<header className="editor-nota__barra">
				<button type="button" className="overline editor-nota__voltar" onClick={props.voltar}>
					<Icon name="arrow-left" size={14} strokeWidth={2.5} />
					Notas{props.materiaNome ? ` · ${props.materiaNome}` : ""}
				</button>
				<span className="editor-nota__acoes">
					<span className="data editor-nota__situacao" aria-live="polite">
						{rotuloVisivel}
					</span>
					<Button variant="ghost" size="sm" icon="close" disabled={!nota} onClick={() => { setErroApagar(undefined); setConfirmandoApagar(true); }}>
						Apagar
					</Button>
				</span>
			</header>
			{/* Na mesa de estudo, as abas das notas e lições abertas ficam aqui, dentro do cartão e abaixo do voltar. */}
			{props.abaixoDoCabecalho}
			<div ref={setCorpo} className="editor-nota__corpo" onKeyDown={teclas}>
				{/* A página, como no Notion: uma coluna de leitura no meio, com o título grande no topo. */}
				<div ref={setPagina} className={`editor-nota__pagina${pronta ? "" : " editor-nota__pagina--carregando"}`}>
				<AlcaBlocos editor={editor} pagina={pagina} editavel={Boolean(nota) && !somenteLeitura} />
				{/* A faixa do plano fica dentro da página: aparece junto com ela, já desenhada (a página só some enquanto carrega). */}
				{faixaDoPlano ? <FaixaDoPlano faixa={faixaDoPlano} {...(abrirConversa ? { abrirConversa } : {})} /> : null}
				<textarea
					ref={campoTitulo}
					className="editor-nota__titulo"
					rows={1}
					value={tituloCampo}
					maxLength={TAMANHO_TITULO}
					placeholder="Sem título"
					aria-label="Título da nota"
					aria-invalid={erroTitulo ? true : undefined}
					disabled={!nota || somenteLeitura}
					onChange={(evento) => setTituloCampo(evento.target.value.replace(/\s*\n\s*/g, " "))}
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
				{erroTitulo ? <p className="body-sm editor-nota__erro-titulo">{erroTitulo}</p> : null}
				{erroAbrir ? (
					<Callout tone="amber" label="Não abri a nota">
						<p>{erroAbrir}</p>
						<div className="editor-nota__botoes">
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
						<div className="editor-nota__botoes">
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
						<div className="editor-nota__botoes">
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
				{/* O link conversa:<id> (o do Guardar na nota e o da marca do professor) abre a conversa da matéria, na nota em edição e
				    na em leitura; nunca abre endereço do navegador (a captura vem antes do clique do ProseMirror e do <a>). */}
				<div ref={folha} className={`editor-nota__folha${nota ? "" : " editor-nota__folha--escondida"}`} onClickCapture={aoClicarNaFolha}>
					<EditorContent editor={editor} />
				</div>
				{editor ? (
					<BubbleMenu
						editor={editor}
						className="editor-nota__selecao"
						// Só com um trecho de texto selecionado (não com uma fórmula ou outro bloco selecionado inteiro).
						shouldShow={({ editor: atual, state }) =>
							atual.isEditable && (atual.view.hasFocus() || Boolean(barraSelecao.current?.contains(document.activeElement))) && state.selection instanceof TextSelection && !state.selection.empty && !atual.isActive("codeBlock")
						}
						options={{
							placement: "top",
							offset: 8,
							flip: true,
							shift: { padding: 12 },
							...(corpo ? { scrollTarget: corpo } : {}),
							onHide: () => setVezBarra((vez) => vez + 1),
						}}
						// O clique na barra não tira o foco do texto (só o campo do link recebe o foco).
						onMouseDown={(evento) => {
							if (!(evento.target instanceof HTMLInputElement)) evento.preventDefault();
						}}
					>
						<div ref={barraSelecao}>
							<BarraFormatacao
								key={vezBarra}
								editor={editor}
								editarFormula={(latex, posicao) => logica.current.editarFormula("linha", latex, posicao)}
								{...(trechoDoEditor
									? { extra: <AcoesDePergunta trecho={trechoDoEditor} ancora={() => (editor.isDestroyed ? undefined : ancoraDoEditor(editor.state))} depois={soltarSelecaoDoEditor} /> }
									: {})}
							/>
						</div>
					</BubbleMenu>
				) : null}
				<BarraSelecao selecao={selecao} limpar={limparSelecao} />
				</div>
			</div>
			<Modal
				open={Boolean(criarMencao)}
				onClose={() => setCriarMencao(undefined)}
				kicker="Menção"
				title="Criar esta nota?"
				size="sm"
				footer={
					<>
						<Button variant="secondary" onClick={() => setCriarMencao(undefined)} disabled={criarMencao?.criando}>
							Agora não
						</Button>
						<Button variant="primary" icon="plus" onClick={criarNotaDaMencao} disabled={criarMencao?.criando} aria-busy={criarMencao?.criando}>
							{criarMencao?.criando ? "Criando…" : "Criar e abrir"}
						</Button>
					</>
				}
			>
				<p className="body">
					Ainda não existe a nota <strong>{criarMencao?.alvo}</strong> neste caderno. Ela é criada vazia em notas/ e abre no lugar desta (o que você escreveu aqui já foi salvo).
				</p>
				{criarMencao?.erro ? <p className="body-sm editor-nota__erro-titulo">{criarMencao.erro}</p> : null}
			</Modal>
			<Modal
				open={confirmandoApagar}
				onClose={() => {
					if (!apagando) setConfirmandoApagar(false);
				}}
				kicker="Nota"
				title="Apagar esta nota?"
				size="sm"
				tone="brick"
				dismissible={!apagando}
				footer={
					<>
						<Button variant="ghost" onClick={() => setConfirmandoApagar(false)} disabled={apagando}>
							Cancelar
						</Button>
						<Button variant="danger" icon="close" onClick={() => void apagarAgora()} disabled={apagando} aria-busy={apagando}>
							<RotuloEstado ocupado={apagando} repouso="Apagar nota" passageiro="Apagando…" />
						</Button>
					</>
				}
			>
				<p className="body">
					Apagar <strong>{tituloVigente}</strong>? O arquivo sai do caderno e vai para a pasta <code>notas/.lixeira</code>, de onde você ainda pode recuperá-lo pelo Explorador de Arquivos. As menções a ela em outras notas ficam sem destino.
				</p>
				<p className="body-sm editor-nota__erro-apagar" role="alert">
					{erroApagar ?? ""}
				</p>
			</Modal>
			<EditorFormula
				{...(formula ? { formula: { tipo: formula.tipo, latex: formula.latex, nova: formula.nova } } : {})}
				salvar={salvarFormula}
				remover={removerFormula}
				cancelar={cancelarFormula}
			/>
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
