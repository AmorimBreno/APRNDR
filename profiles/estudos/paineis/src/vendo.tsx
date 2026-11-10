// O provedor do "Vendo" da mesa de estudo (docs/mesa-de-estudo.md, 2.6, 2.7 e 5b):
// a aba ativa (nota ou lição) se registra aqui como FonteVendo, e o painel do
// professor lê as fontes na hora de mandar a mensagem (obterContextos). A
// bancada leva um ContextoTela por aba aberta: as selecionadas com o conteúdo,
// as outras só com o nome. Só a aba ativa tem fonte registrada; as outras abas
// deixam aqui a última cópia do texto (ao desregistrar e a cada envio). O olho
// antigo (um por matéria, lembrado por perfil) continua no contrato de vendo.ts,
// mas a seleção agora é por aba (selecao-bancada.ts).

import type { ContextoTela } from "@estudos/ui";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { abaDoCaminho, type TipoAbaMesa } from "./abas-mesa.ts";
import { type FonteVendo, LIMITE_CONTEUDO_VENDO, type ValorVendo } from "./vendo.ts";

/** O que saiu de ler uma fonte: o contexto e se o texto() falhou (para o chip avisar). */
export interface LeituraDaFonte {
	contexto: ContextoTela;
	/** texto() lançou: a mensagem vai sem conteúdo e o chip avisa. */
	falhou: boolean;
}

/**
 * Lê a fonte na hora de mandar. Olho aberto: chama texto(), corta em
 * LIMITE_CONTEUDO_VENDO e marca parcial. Olho fechado: nem chama texto(), vai
 * só tipo, rótulo e origem (o trecho citado o painel junta depois, como selecao).
 */
export function lerFonte(fonte: FonteVendo, olho: boolean): LeituraDaFonte {
	const base = { tipo: fonte.tipo, rotulo: fonte.rotulo, origem: fonte.origem, olho };
	if (!olho) return { contexto: base, falhou: false };
	let texto: string | undefined;
	try {
		texto = fonte.texto();
	} catch {
		return { contexto: base, falhou: true };
	}
	if (!texto) return { contexto: base, falhou: false };
	const parcial = texto.length > LIMITE_CONTEUDO_VENDO;
	return { contexto: { ...base, conteudo: parcial ? texto.slice(0, LIMITE_CONTEUDO_VENDO) : texto, ...(parcial ? { parcial: true } : {}) }, falhou: false };
}

/** O ContextoTela da fonte (undefined sem fonte). */
export function contextoDaFonte(fonte: FonteVendo | undefined, olho: boolean): ContextoTela | undefined {
	return fonte ? lerFonte(fonte, olho).contexto : undefined;
}

/** A soma dos conteúdos de uma mensagem; abaixo dos 200 mil do núcleo (LIMITES_CONTEXTO_TELA), com folga. */
export const LIMITE_SOMA_VENDO = 190_000;

/** Uma aba da bancada, como a mesa a conhece. */
export interface AbaDaBancada {
	chave: string;
	tipo: TipoAbaMesa;
	rotulo: string;
	/** A rota de agora da aba. */
	caminho: string;
}

export interface EntradaContextos {
	/** As abas abertas, na ordem em que aparecem. */
	abas: readonly AbaDaBancada[];
	/** A aba em foco (sem foco, nenhum contexto leva foco). */
	chaveFoco: string | undefined;
	/** As chaves selecionadas (chavesSelecionadas): só essas vão com o conteúdo. */
	selecionadas: ReadonlySet<string>;
	/** A fonte registrada, a da aba em foco. */
	ativa: FonteVendo | undefined;
	/** A última cópia guardada do texto da aba. */
	copia(chave: string): string | undefined;
	guardarCopia(chave: string, texto: string): void;
	/** Pede o conteúdo de uma nota sem cópia, com prazo; undefined = não veio a tempo. */
	pedirNota?(aba: AbaDaBancada): Promise<string | undefined>;
}

/** A chave da aba de uma fonte (a mesma de abaDoCaminho). */
export function chaveDaFonte(fonte: FonteVendo): string | undefined {
	return abaDoCaminho(fonte.origem)?.chave;
}

/**
 * Monta a lista de contextos da mensagem: um por aba, na ordem das abas, com
 * foco na aba em foco. Selecionada = olho aberto com o conteúdo (a fonte ativa
 * lida na hora; as outras pela cópia guardada; nota sem cópia, pela ponte;
 * lição sem cópia, só o nome); não selecionada = olho fechado, sem conteúdo.
 * Cada conteúdo é cortado em LIMITE_CONTEUDO_VENDO e a soma em LIMITE_SOMA_VENDO
 * (a aba em foco é servida primeiro); o cortado vai com parcial.
 */
export async function montarContextos(entrada: EntradaContextos): Promise<{ contextos: ContextoTela[]; falhou: boolean }> {
	const { abas, chaveFoco, selecionadas, ativa } = entrada;
	const chaveAtiva = ativa ? chaveDaFonte(ativa) : undefined;
	let falhou = false;
	// A cópia se atualiza a cada envio, esteja a aba selecionada ou não.
	let textoAtivo: string | undefined;
	if (ativa && chaveAtiva) {
		try {
			textoAtivo = ativa.texto();
			if (textoAtivo) entrada.guardarCopia(chaveAtiva, textoAtivo);
		} catch {
			falhou = selecionadas.has(chaveAtiva);
		}
	}
	const textos = await Promise.all(
		abas.map(async (aba): Promise<string | undefined> => {
			if (!selecionadas.has(aba.chave)) return undefined;
			if (aba.chave === chaveAtiva) return textoAtivo;
			const guardada = entrada.copia(aba.chave);
			if (guardada !== undefined) return guardada;
			if (aba.tipo !== "nota" || !entrada.pedirNota) return undefined;
			let pedida: string | undefined;
			try {
				pedida = await entrada.pedirNota(aba);
			} catch {
				pedida = undefined;
			}
			if (pedida) entrada.guardarCopia(aba.chave, pedida);
			return pedida;
		}),
	);
	// O orçamento da soma vai primeiro para a aba em foco, depois para as outras na ordem das abas.
	const ordemDoOrcamento = abas.map((_, indice) => indice).sort((a, b) => Number(abas[b]?.chave === chaveFoco) - Number(abas[a]?.chave === chaveFoco));
	let restante = LIMITE_SOMA_VENDO;
	const conteudos = new Map<number, { conteudo: string; parcial: boolean }>();
	for (const indice of ordemDoOrcamento) {
		const texto = textos[indice];
		if (!texto || restante <= 0) continue;
		const teto = Math.min(LIMITE_CONTEUDO_VENDO, restante);
		const parcial = texto.length > teto;
		const conteudo = parcial ? texto.slice(0, teto) : texto;
		restante -= conteudo.length;
		conteudos.set(indice, { conteudo, parcial });
	}
	const contextos = abas.map((aba, indice): ContextoTela => {
		const daAtiva = aba.chave === chaveAtiva ? ativa : undefined;
		const base = {
			tipo: aba.tipo,
			rotulo: daAtiva ? daAtiva.rotulo : aba.rotulo,
			origem: daAtiva ? daAtiva.origem : aba.caminho,
			olho: selecionadas.has(aba.chave),
			...(aba.chave === chaveFoco ? { foco: true } : {}),
		};
		const lido = conteudos.get(indice);
		return lido ? { ...base, conteudo: lido.conteudo, ...(lido.parcial ? { parcial: true } : {}) } : base;
	});
	return { contextos, falhou };
}

/** O valor do contexto: o contrato, mais o que o chip precisa para se redesenhar. */
export interface ValorVendoMesa extends ValorVendo {
	/** Muda a cada registro ou troca de fonte, para as pills e a faixa de abas se redesenharem. */
	versao: number;
	/** O último envio com a aba selecionada falhou ao ler o arquivo. */
	falhou: boolean;
	/** Os contextos da bancada na hora de mandar (um por aba), para o painel mandar junto da mensagem. */
	obterContextos(entrada: Pick<EntradaContextos, "abas" | "chaveFoco" | "selecionadas" | "pedirNota">): Promise<ContextoTela[]>;
	/** A última cópia guardada do texto da aba (de quando ela deixou de ser a ativa, ou do último envio). */
	copia(chave: string): string | undefined;
}

const ContextoVendo = createContext<ValorVendoMesa | undefined>(undefined);

function chaveOlho(perfilId: string, materiaId: string): string {
	return `estudos:${perfilId}:${materiaId}:vendo-olho`;
}

/** Lembrado por perfil e matéria; na primeira vez (ou sem localStorage), aberto. */
function lerOlho(perfilId: string, materiaId: string): boolean {
	try {
		return localStorage.getItem(chaveOlho(perfilId, materiaId)) !== "0";
	} catch {
		return true;
	}
}

function guardarOlho(perfilId: string, materiaId: string, olho: boolean): void {
	try {
		localStorage.setItem(chaveOlho(perfilId, materiaId), olho ? "1" : "0");
	} catch {
		// Sem armazenamento: vale só nesta abertura.
	}
}

export interface PropsProvedorVendo {
	perfilId: string;
	materiaId: string;
	children: ReactNode;
}

export function ProvedorVendo({ perfilId, materiaId, children }: PropsProvedorVendo) {
	// O olho guarda de qual matéria é: ao trocar de matéria, lê o dela na própria renderização.
	const chave = chaveOlho(perfilId, materiaId);
	const [estadoOlho, setEstadoOlho] = useState(() => ({ chave, valor: lerOlho(perfilId, materiaId) }));
	let olho = estadoOlho.valor;
	if (estadoOlho.chave !== chave) {
		olho = lerOlho(perfilId, materiaId);
		setEstadoOlho({ chave, valor: olho });
	}
	const olhoRef = useRef(olho);
	olhoRef.current = olho;

	const alternarOlho = useCallback(() => {
		const novo = !olhoRef.current;
		guardarOlho(perfilId, materiaId, novo);
		setEstadoOlho({ chave: chaveOlho(perfilId, materiaId), valor: novo });
	}, [perfilId, materiaId]);

	// As fontes montadas, da mais antiga para a mais nova; a ativa é a última.
	const fontes = useRef<FonteVendo[]>([]);
	// A última cópia do texto de cada aba, por chave: é o que as abas fora de foco mandam ao professor.
	const copias = useRef(new Map<string, string>());
	const [versao, setVersao] = useState(0);
	const [falhou, setFalhou] = useState(false);

	const registrar = useCallback((fonte: FonteVendo) => {
		fontes.current.push(fonte);
		setVersao((v) => v + 1);
		return () => {
			// A fonte sai (a aba perdeu o foco ou fechou): deixa a última cópia do texto. Se o editor já morreu ou o texto
			// falha, vale a cópia que já havia.
			const chaveDaAba = chaveDaFonte(fonte);
			if (chaveDaAba) {
				try {
					const texto = fonte.texto();
					if (texto) copias.current.set(chaveDaAba, texto);
				} catch {
					// Sem texto agora.
				}
			}
			fontes.current = fontes.current.filter((outra) => outra !== fonte);
			setVersao((v) => v + 1);
		};
	}, []);
	const ativa = useCallback(() => fontes.current.at(-1), []);
	const copia = useCallback((chaveDaAba: string) => copias.current.get(chaveDaAba), []);

	const obterContextos = useCallback(async (entrada: Pick<EntradaContextos, "abas" | "chaveFoco" | "selecionadas" | "pedirNota">) => {
		// Cópia de aba que já não está aberta não serve se ela voltar: some.
		const abertas = new Set(entrada.abas.map((aba) => aba.chave));
		for (const chaveCopia of [...copias.current.keys()]) if (!abertas.has(chaveCopia)) copias.current.delete(chaveCopia);
		const resultado = await montarContextos({
			...entrada,
			ativa: fontes.current.at(-1),
			copia: (chaveDaAba) => copias.current.get(chaveDaAba),
			guardarCopia: (chaveDaAba, texto) => {
				copias.current.set(chaveDaAba, texto);
			},
		});
		setFalhou(resultado.falhou);
		return resultado.contextos;
	}, []);

	const valor = useMemo<ValorVendoMesa>(
		() => ({ registrar, ativa, olho, alternarOlho, versao, falhou, obterContextos, copia }),
		[registrar, ativa, olho, alternarOlho, versao, falhou, obterContextos, copia],
	);
	return <ContextoVendo.Provider value={valor}>{children}</ContextoVendo.Provider>;
}

/** O Vendo da mesa; fora do provedor lança, porque a nota e a lição só se registram dentro da mesa. */
export function useVendo(): ValorVendoMesa {
	const valor = useContext(ContextoVendo);
	if (!valor) throw new Error("useVendo fora do ProvedorVendo");
	return valor;
}

/** Como useVendo, mas devolve undefined fora da mesa (telas que também rodam sem ela). */
export function useVendoOpcional(): ValorVendoMesa | undefined {
	return useContext(ContextoVendo);
}
