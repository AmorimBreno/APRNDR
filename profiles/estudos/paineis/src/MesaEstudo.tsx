// A mesa de estudo (ESPECIFICACAO 13.19; docs/mesa-de-estudo.md, 2.1 e 2.10):
// quando uma nota ou uma lição está aberta, a tela do caderno vira a área de
// estudo à esquerda (children) e o painel do professor à direita, que abre e
// fecha. Em cima da área da esquerda fica a faixa da mesa (vazia por ora, e sem
// ocupar espaço). Entre a barra e o corpo, só na coluna da esquerda, fica a faixa
// das abas (AbasMesa.tsx): as notas e lições abertas da matéria; a rota de agora
// é a aba ativa, e a rolagem de cada aba é guardada e devolvida. O provedor do
// Vendo (vendo.tsx) envolve tudo: a aba ativa se registra nele, o chip do
// professor mostra o que está aberto e o contexto da tela vai junto da mensagem
// (obterContextos). O botão do professor é a foto da aba
// do caderno (useProfessorDaMesa); no módulo, que não tem aba, é um botão na faixa.
//
// O painel é a conversa embutida do app (props.conversa) e fica sempre
// montado: fechado quer dizer escondido (o componente embutido cuida de hidden
// e inert), então o rascunho, a citação e a resposta em andamento continuam. A
// coluna é que some da grade. Aberto ou fechado fica no localStorage, por
// perfil; na primeira vez, fechado. Ctrl+J alterna (capturado antes do
// navegador, que abriria os Downloads), só enquanto a mesa está montada.
//
// Largura da mesa (não da janela, porque o app roda a 90 % de escala e porque a
// mesa pode ficar menor que a tela): a partir de 1100 px o professor é uma
// coluna; abaixo disso vira gaveta por cima da esquerda; abaixo de 760 px, um
// lado por vez (a gaveta ocupa tudo). O modo vem de um ResizeObserver e vai no
// data-modo, para a mola do Motion e o CSS (mesa.css) concordarem.

import { AvatarAgente, type DadosAvatarAgente, type PropsConversaEmbutida, semMovimento } from "@estudos/ui";
import { motion } from "motion/react";
import { type ComponentType, createContext, type CSSProperties, type ReactNode, type RefObject, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Materia } from "../../lib/materia-tipos.ts";
import { abaDoCaminho, abrirAba, fecharAba, guardarRolagem, type TipoAbaMesa } from "./abas-mesa.ts";
import { AbasMesa, useAbasGuardadas } from "./AbasMesa.tsx";
import { CabecalhoProfessor } from "./CabecalhoProfessor.tsx";
import { ChipVendo } from "./ChipVendo.tsx";
import { mesmoTitulo, PAINEL_NOTAS } from "./notas-ponte.ts";
import { alternarEscolha, chavesSelecionadas, escolhasVigentes, type EscolhasBancada, SEM_ESCOLHAS } from "./selecao-bancada.ts";
import { type AbaDaBancada, chaveDaFonte, ProvedorVendo, useVendo } from "./vendo.tsx";

type Modo = "lado" | "gaveta" | "tela";

/** A largura do painel do professor, em px da interface (que roda a 90 %). */
/** O professor ocupa 40 % da largura da mesa em coluna (pedido do Breno), sem ficar estreito demais para a conversa. */
const FRACAO_PAINEL = 0.4;
const LARGURA_MINIMA_PAINEL = 380;
/** Na gaveta, o painel tem largura fixa por cima da esquerda. */
const LARGURA_GAVETA = 440;
const LIMITE_GAVETA = 1100;
const LIMITE_TELA = 760;
const MOLA = { type: "spring", stiffness: 420, damping: 40 } as const;

function modoPelaLargura(largura: number): Modo {
	return largura < LIMITE_TELA ? "tela" : largura < LIMITE_GAVETA ? "gaveta" : "lado";
}

function chaveArmazenada(perfilId: string): string {
	return `estudos:${perfilId}:mesa-professor-aberto`;
}

/** Lembrado por perfil; na primeira vez (ou sem localStorage), fechado. */
function lerAberto(perfilId: string): boolean {
	try {
		return localStorage.getItem(chaveArmazenada(perfilId)) === "1";
	} catch {
		return false;
	}
}

function guardarAberto(perfilId: string, aberto: boolean): void {
	try {
		localStorage.setItem(chaveArmazenada(perfilId), aberto ? "1" : "0");
	} catch {
		// Sem armazenamento: vale só nesta abertura.
	}
}

/** O que a aba do caderno (dentro da mesa) usa para abrir e fechar o painel do professor. */
export interface ProfessorDaMesa {
	aberto: boolean;
	pendente: boolean;
	pulsa: boolean;
	alternar(): void;
	/** Abre o painel se estiver fechado (não alterna). */
	abrir(): void;
	/** Guarda o trecho como citação acima do campo do professor e abre o painel (Perguntar). */
	citar(trecho: string): void;
	/**
	 * Manda ao professor um pedido pronto sobre o trecho, com os contextos da bancada
	 * e o trecho como selecao do contexto em foco (Outro jeito, Me teste nisso), e abre o painel.
	 * Rejeita se o envio nem saiu (conexão caída).
	 */
	perguntar(pedido: string, trecho: string): Promise<void>;
	idPainel: string;
	botao: RefObject<HTMLButtonElement | null>;
}

const ContextoProfessor = createContext<ProfessorDaMesa | undefined>(undefined);

/** Fora da mesa (ou sem conversa embutida) devolve undefined: a foto abre a conversa em tela cheia. */
export function useProfessorDaMesa(): ProfessorDaMesa | undefined {
	return useContext(ContextoProfessor);
}

/** O elemento que rola em cada tipo de aba (a nota e a lição); a rolagem de cada aba é a dele. */
const ELEMENTO_QUE_ROLA = ".editor-nota__corpo, .modulo__corpo";
/** Quantos quadros esperar o conteúdo da aba ficar alto o bastante para devolver a rolagem (a nota carrega do servidor). */
const QUADROS_PARA_ROLAR = 45;
/** Quanto esperar a nota pedida pela ponte (nota restaurada que ainda não abriu nesta sessão). */
const PRAZO_NOTA_MS = 1500;
const PASSO_NOTA_MS = 50;

/** O rótulo inicial de uma aba, pela rota: o título da nota; "Lição" no módulo (a lição registrada troca por um melhor). */
function rotuloDaRota(caminho: string, tipo: TipoAbaMesa): string {
	return tipo === "nota" ? caminho.split("/").slice(3).join("/") : "Lição";
}

export interface PropsMesaEstudo {
	janela: PropsConversaEmbutida["janela"];
	perfilId: string;
	/** O id da matéria, para lembrar abas e olho por matéria. */
	materiaId: string;
	/** A rota de agora (a aba ativa, se for uma nota ou lição) e como navegar. */
	caminho: string;
	navegar(caminho: string): void;
	/** A conversa embutida do app; sem ela a mesa não mostra o professor (nem o botão). */
	conversa?: ComponentType<PropsConversaEmbutida>;
	materia?: Materia;
	/** O professor, para a foto do botão. */
	agente?: { nome: string; avatar?: DadosAvatarAgente };
	/** O botão do professor na faixa do topo: só onde a aba do caderno não existe (o módulo). */
	botaoNaFaixa?: boolean;
	/** Abre a conversa do perfil na tela cheia (o botão de expandir do topo do professor). */
	abrirConversa?(): void;
	/**
	 * A área de estudo: o que a tela do caderno mostrava (aba e nota, ou o módulo).
	 * Uma função recebe o nó das abas (undefined sem nenhuma) para pô-lo dentro do cartão.
	 */
	children: ReactNode | ((abas: ReactNode) => ReactNode);
}

export function MesaEstudo(props: PropsMesaEstudo) {
	return (
		<ProvedorVendo perfilId={props.perfilId} materiaId={props.materiaId}>
			<MesaInterna {...props} />
		</ProvedorVendo>
	);
}

function MesaInterna(props: PropsMesaEstudo) {
	const { perfilId, materiaId, caminho, navegar, conversa: Conversa } = props;
	const vendo = useVendo();
	const [aberto, setAberto] = useState(() => lerAberto(perfilId));
	const [pendente, setPendente] = useState(false);
	/** O trecho citado (Perguntar), na mesa e não na barra, porque o painel do professor é que o mostra e o limpa. */
	const [citacao, setCitacao] = useState<string | undefined>(undefined);
	const [modo, setModo] = useState<Modo>("lado");
	const [largura, setLargura] = useState(0);
	const raiz = useRef<HTMLDivElement>(null);
	const painel = useRef<HTMLElement>(null);
	const botao = useRef<HTMLButtonElement>(null);
	const idPainel = useId();
	const parado = semMovimento();

	// As abas: a rota de agora, se for uma nota ou lição, é a aba ativa e entra na lista da matéria.
	const [abas, atualizarAbas] = useAbasGuardadas(perfilId, materiaId);
	const abasRef = useRef(abas);
	abasRef.current = abas;
	const atualizarAbasRef = useRef(atualizarAbas);
	atualizarAbasRef.current = atualizarAbas;
	const abaAtiva = caminho.split("/")[1] === materiaId ? abaDoCaminho(caminho) : undefined;
	const chaveAtiva = abaAtiva?.chave;
	const fonte = vendo.ativa();
	// O rótulo que a aba ativa registrou (o título de agora da nota, "Lição 2.3 · …") vale mais que o da rota,
	// mas só se a fonte for a desta aba. Ao trocar de aba, o foco muda antes de a nota nova montar: a fonte
	// registrada ainda é a da aba anterior, e usar o rótulo dela trocava o nome (e a largura) da aba e da pill
	// por um instante (bug visto pelo Breno em 2026-11-10).
	const rotuloDaFonte = fonte && chaveAtiva && chaveDaFonte(fonte) === chaveAtiva ? fonte.rotulo : undefined;

	// abaAtiva é derivada do caminho: as dependências são o caminho e o que sai dele.
	useLayoutEffect(() => {
		if (!abaAtiva) return;
		atualizarAbasRef.current((atuais) => {
			const existente = atuais.find((aba) => aba.chave === abaAtiva.chave);
			return abrirAba(atuais, { chave: abaAtiva.chave, caminho, tipo: abaAtiva.tipo, rotulo: existente?.rotulo ?? rotuloDaRota(caminho, abaAtiva.tipo) });
		});
	}, [caminho, abaAtiva?.chave, abaAtiva?.tipo]);

	// Guarda o rótulo registrado na aba, para as abas fechadas (outras abas) continuarem com o nome certo.
	useEffect(() => {
		if (!rotuloDaFonte || !chaveAtiva) return;
		atualizarAbasRef.current((atuais) => (atuais.some((aba) => aba.chave === chaveAtiva && aba.rotulo !== rotuloDaFonte) ? atuais.map((aba) => (aba.chave === chaveAtiva ? { ...aba, rotulo: rotuloDaFonte } : aba)) : atuais));
	}, [rotuloDaFonte, chaveAtiva]);

	// A rolagem de cada aba: o elemento que rola (nota ou lição) avisa por scroll (que não sobe, daí a captura);
	// ao sair da aba a última posição vai para ela, e ao chegar numa aba a posição dela é devolvida.
	const ultimaRolagem = useRef<{ chave: string; topo: number } | undefined>(undefined);
	const chaveDaRolagem = useRef<string | undefined>(undefined);
	const devolvendo = useRef(false);
	useEffect(() => {
		const elemento = raiz.current;
		if (!elemento) return;
		const aoRolar = (evento: Event) => {
			const alvo = evento.target;
			const chave = chaveDaRolagem.current;
			if (devolvendo.current || !chave || !(alvo instanceof HTMLElement) || !alvo.matches(ELEMENTO_QUE_ROLA)) return;
			ultimaRolagem.current = { chave, topo: alvo.scrollTop };
		};
		elemento.addEventListener("scroll", aoRolar, true);
		return () => elemento.removeEventListener("scroll", aoRolar, true);
	}, []);
	useLayoutEffect(() => {
		const antiga = chaveDaRolagem.current;
		const ultima = ultimaRolagem.current;
		if (antiga && antiga !== chaveAtiva && ultima?.chave === antiga) {
			atualizarAbasRef.current((atuais) => guardarRolagem(atuais, antiga, ultima.topo));
		}
		chaveDaRolagem.current = chaveAtiva;
		if (!chaveAtiva) return;
		// O conteúdo da aba pode ainda estar chegando (a nota vem do servidor): espera ele ficar alto o bastante.
		const topo = abasRef.current.find((aba) => aba.chave === chaveAtiva)?.rolagem ?? 0;
		if (topo === 0 && (!antiga || antiga === chaveAtiva)) return;
		let quadro = 0;
		let tentativas = 0;
		const devolver = () => {
			const alvo = raiz.current?.querySelector<HTMLElement>(ELEMENTO_QUE_ROLA);
			if (alvo && (alvo.scrollHeight - alvo.clientHeight >= topo - 1 || tentativas >= QUADROS_PARA_ROLAR)) {
				devolvendo.current = true;
				alvo.scrollTop = topo;
				// O scroll chega depois do quadro: só então volta a anotar.
				quadro = requestAnimationFrame(() => {
					devolvendo.current = false;
				});
				return;
			}
			if (++tentativas <= QUADROS_PARA_ROLAR) quadro = requestAnimationFrame(devolver);
		};
		quadro = requestAnimationFrame(devolver);
		return () => {
			cancelAnimationFrame(quadro);
			devolvendo.current = false;
		};
	}, [chaveAtiva]);
	// Ao sair da mesa (o painel do caderno, a conversa em tela cheia) a rolagem de agora também fica guardada.
	useEffect(
		() => () => {
			const ultima = ultimaRolagem.current;
			if (ultima && ultima.chave === chaveDaRolagem.current) atualizarAbasRef.current((atuais) => guardarRolagem(atuais, ultima.chave, ultima.topo));
		},
		[],
	);

	const escolherAba = (aba: { chave: string; caminho: string }) => {
		if (aba.chave !== chaveAtiva) navegar(aba.caminho);
	};
	const fecharUmaAba = (aba: { chave: string }) => {
		const resultado = fecharAba(abasRef.current, aba.chave, chaveAtiva);
		atualizarAbas(() => resultado.abas);
		// Fechou a ativa: vai para a vizinha, ou para o painel do caderno quando não sobra nenhuma.
		if (aba.chave === chaveAtiva) navegar(resultado.ativar ?? `caderno/${materiaId}/notas`);
	};

	const nodeAbas = <AbasMesa abas={abas} {...(chaveAtiva ? { ativa: chaveAtiva } : {})} {...(rotuloDaFonte ? { rotuloDaAtiva: rotuloDaFonte } : {})} escolher={escolherAba} fechar={fecharUmaAba} />;

	const alternar = useCallback(() => {
		setAberto((atual) => {
			guardarAberto(perfilId, !atual);
			return !atual;
		});
	}, [perfilId]);

	const abrir = useCallback(() => {
		setAberto((atual) => {
			if (!atual) guardarAberto(perfilId, true);
			return true;
		});
	}, [perfilId]);
	const citar = useCallback(
		(trecho: string) => {
			setCitacao(trecho);
			abrir();
		},
		[abrir],
	);
	const limparCitacao = useCallback(() => setCitacao(undefined), []);
	// O envio lê a janela e o contexto na hora (refs): a função que a barra guarda não fica velha.
	const janelaRef = useRef(props.janela);
	janelaRef.current = props.janela;
	// A bancada: uma pill por aba aberta. A seleção padrão é a aba em foco; os cliques valem até o foco mudar (selecao-bancada.ts).
	const [escolhas, setEscolhas] = useState<EscolhasBancada>(SEM_ESCOLHAS);
	const chavesDasAbas = abas.map((aba) => aba.chave);
	const vigentes = escolhasVigentes(escolhas, chavesDasAbas, chaveAtiva);
	// O estado guarda só o que ainda vale: o foco mudou ou a aba fechou, as escolhas somem de verdade.
	useEffect(() => {
		if (vigentes !== escolhas) setEscolhas(vigentes);
	}, [vigentes, escolhas]);
	const selecionadas = new Set(chavesSelecionadas(chavesDasAbas, chaveAtiva, vigentes));
	const alternarSelecao = (chave: string) => setEscolhas(alternarEscolha(escolhas, chavesDasAbas, chaveAtiva, chave));
	const pilulas = abas.map((aba) => ({ chave: aba.chave, tipo: aba.tipo, rotulo: aba.chave === chaveAtiva && rotuloDaFonte ? rotuloDaFonte : aba.rotulo }));
	// Na hora de mandar tudo vem da ref: a função que a barra guarda não fica velha.
	const bancadaRef = useRef<{ abas: AbaDaBancada[]; chaveFoco: string | undefined; selecionadas: ReadonlySet<string> }>({ abas: [], chaveFoco: undefined, selecionadas });
	bancadaRef.current = { abas: abas.map((aba, i) => ({ chave: aba.chave, tipo: aba.tipo, rotulo: pilulas[i]?.rotulo ?? aba.rotulo, caminho: aba.caminho })), chaveFoco: chaveAtiva, selecionadas };
	// Pede o conteúdo de uma nota sem cópia pela ponte de notas e espera a resposta "nota" (com prazo); sem ela, só o nome.
	const pedirNota = useCallback(async (aba: AbaDaBancada): Promise<string | undefined> => {
		const partes = aba.chave.split("/");
		const materia = partes[1];
		const titulo = partes.slice(3).join("/");
		if (!materia || !titulo) return undefined;
		const vistas = new Set((janelaRef.current.estado.acoesPorPainel[PAINEL_NOTAS] ?? []).map((recebida) => recebida.chave));
		await janelaRef.current.acoes.acaoDaInterface(PAINEL_NOTAS, "abrir", { materia, titulo });
		const limite = Date.now() + PRAZO_NOTA_MS;
		while (Date.now() < limite) {
			for (const recebida of janelaRef.current.estado.acoesPorPainel[PAINEL_NOTAS] ?? []) {
				if (vistas.has(recebida.chave) || recebida.acao !== "nota") continue;
				const dados = recebida.dados as { materia?: string; titulo?: string; conteudo?: unknown };
				if (dados.materia === materia && mesmoTitulo(dados.titulo, titulo) && typeof dados.conteudo === "string") return dados.conteudo;
			}
			await new Promise((resolver) => setTimeout(resolver, PASSO_NOTA_MS));
		}
		return undefined;
	}, []);
	const obterContextosDoVendo = vendo.obterContextos;
	const obterContextos = useCallback(() => obterContextosDoVendo({ ...bancadaRef.current, pedirNota }), [obterContextosDoVendo, pedirNota]);
	const perguntar = useCallback(
		async (pedido: string, trecho: string) => {
			const contextos = await obterContextos();
			abrir();
			// O trecho vai no contexto com foco (ou no primeiro). Sem nenhuma aba na bancada não há onde pendurá-lo: vai no texto, como citação.
			if (contextos.length === 0) {
				await janelaRef.current.acoes.enviar(`${pedido}\n\n> ${trecho}`);
				return;
			}
			const alvo = Math.max(0, contextos.findIndex((contexto) => contexto.foco));
			await janelaRef.current.acoes.enviar(pedido, contextos.map((contexto, indice) => (indice === alvo ? { ...contexto, selecao: trecho } : contexto)));
		},
		[abrir, obterContextos],
	);

	// Ctrl+J: na fase de captura e com preventDefault, para o Edge não abrir os Downloads.
	// Só enquanto a mesa está montada e tem professor.
	useEffect(() => {
		if (!Conversa) return;
		const aoTeclar = (evento: KeyboardEvent) => {
			if (!evento.ctrlKey || evento.shiftKey || evento.altKey || evento.metaKey || evento.key.toLowerCase() !== "j") return;
			evento.preventDefault();
			alternar();
		};
		window.addEventListener("keydown", aoTeclar, true);
		return () => window.removeEventListener("keydown", aoTeclar, true);
	}, [Conversa, alternar]);

	// O modo vem da largura da mesa, medida antes de pintar para não piscar o layout errado.
	useLayoutEffect(() => {
		const elemento = raiz.current;
		if (!elemento) return;
		const medir = (valor: number) => {
			setModo(modoPelaLargura(valor));
			setLargura(valor);
		};
		medir(elemento.clientWidth);
		const observador = new ResizeObserver(([entrada]) => {
			if (entrada) medir(entrada.contentRect.width);
		});
		observador.observe(elemento);
		return () => observador.disconnect();
	}, []);

	// Abrir foca o campo de pergunta; fechar devolve o foco ao botão do professor.
	// Não roda na montagem: só quando o Breno abre ou fecha.
	const anterior = useRef(aberto);
	useEffect(() => {
		if (anterior.current === aberto) return;
		anterior.current = aberto;
		if (aberto) {
			// Depois do commit o hidden e o inert já saíram. O campo é o da barra de pergunta
			// (não a primeira textarea do painel, que pode ser de um pedido no documento) e só
			// aceita foco habilitado: com a sessão ainda carregando ele está desligado, então
			// tenta de novo por alguns quadros. Para assim que o foco entra em algo do painel.
			let quadro = 0;
			let tentativas = 0;
			const tentar = () => {
				const campo = painel.current?.querySelector<HTMLTextAreaElement>(".barra textarea:not(:disabled)");
				campo?.focus({ preventScroll: true });
				const foco = document.activeElement;
				if (foco && foco !== document.body && painel.current?.contains(foco)) return;
				if (++tentativas < 30) quadro = requestAnimationFrame(tentar);
			};
			quadro = requestAnimationFrame(tentar);
			return () => cancelAnimationFrame(quadro);
		}
		if (painel.current?.contains(document.activeElement) || document.activeElement === document.body) botao.current?.focus();
		return undefined;
	}, [aberto]);

	// Largura do painel por modo: coluna (0 quando fechado), gaveta ou tela inteira.
	const larguraColuna = Math.max(LARGURA_MINIMA_PAINEL, Math.round(largura * FRACAO_PAINEL));
	const larguraAberta = modo === "tela" ? "100%" : `min(${LARGURA_GAVETA}px, 100%)`;
	const animar = modo === "lado" ? { width: aberto ? larguraColuna : 0, x: 0 } : { width: larguraAberta, x: aberto ? 0 : "105%" };
	const pulsa = pendente && !aberto && !parado;
	// Só abrir e fechar animam: a largura que muda com a medida da mesa (ao carregar,
	// ao redimensionar a janela) entra direto, sem a mola passar por um valor provisório.
	const abertoAnterior = useRef(aberto);
	const abrindoOuFechando = abertoAnterior.current !== aberto;
	useEffect(() => {
		abertoAnterior.current = aberto;
	}, [aberto]);

	const rotuloDoCampo = fonte?.rotulo;
	const contexto: ProfessorDaMesa | undefined = Conversa ? { aberto, pendente, pulsa, alternar, abrir, citar, perguntar, idPainel, botao } : undefined;

	return (
		<ContextoProfessor.Provider value={contexto}>
		<div
			ref={raiz}
			className="mesa"
			data-modo={modo}
			data-aberta={aberto ? "sim" : "nao"}
			style={{ "--largura-professor": `${modo === "lado" ? larguraColuna : LARGURA_GAVETA}px` } as CSSProperties}
		>
			<div className="mesa__esquerda">
				{Conversa && props.botaoNaFaixa ? (
					<div className="mesa__faixa">
						<span className="mesa__faixa-espaco" />
						<button
							ref={botao}
							type="button"
							className={`mesa__professor-botao${pulsa ? " mesa__professor-botao--pulsa" : ""}`}
							onClick={alternar}
							aria-expanded={aberto}
							aria-controls={idPainel}
							title={aberto ? "Fechar o professor (Ctrl+J)" : pendente ? "O professor espera sua resposta (Ctrl+J)" : "Abrir o professor (Ctrl+J)"}
							aria-label={aberto ? "Fechar o painel do professor" : pendente ? "Abrir o painel do professor: há uma pergunta esperando resposta" : "Abrir o painel do professor"}
						>
							<AvatarAgente nome={props.agente?.nome ?? "Professor"} {...(props.agente?.avatar ? { avatar: props.agente.avatar } : {})} tamanho={36} />
						</button>
					</div>
				) : null}
				<div className="mesa__area">{typeof props.children === "function" ? props.children(nodeAbas) : props.children}</div>
			</div>
			{Conversa ? (
				<motion.aside
					ref={painel}
					id={idPainel}
					className="mesa__professor"
					aria-label="Professor"
					initial={false}
					animate={animar}
					transition={parado || !abrindoOuFechando ? { duration: 0 } : MOLA}
				>
					<div className="mesa__professor-miolo">
						<Conversa
							janela={props.janela}
							aberta={aberto}
							aoPedidoPendente={setPendente}
							obterContextos={obterContextos}
							cabecalho={<CabecalhoProfessor janela={props.janela} perfilId={perfilId} {...(props.materia ? { materia: props.materia } : {})} {...(props.abrirConversa ? { abrirConversa: props.abrirConversa } : {})} />}
							acimaDoCampo={<ChipVendo abas={pilulas} chaveFoco={chaveAtiva} selecionadas={selecionadas} alternar={alternarSelecao} />}
							{...(rotuloDoCampo ? { placeholder: `Pergunte sobre ${rotuloDoCampo}…` } : {})}
						/>
					</div>
				</motion.aside>
			) : null}
		</div>
		</ContextoProfessor.Provider>
	);
}
