// O provedor do "Vendo" da mesa de estudo (docs/mesa-de-estudo.md, 2.6 e 2.7):
// a aba ativa (nota ou lição) se registra aqui como FonteVendo, e o painel do
// professor lê a fonte na hora de mandar a mensagem (obterContexto). O olho
// decide se o arquivo inteiro vai junto ou só o rótulo; fica lembrado por perfil
// e matéria. O contrato (FonteVendo, ValorVendo) está em vendo.ts.

import type { ContextoTela } from "@estudos/ui";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
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

/** O valor do contexto: o contrato, mais o que o chip precisa para se redesenhar. */
export interface ValorVendoMesa extends ValorVendo {
	/** Muda a cada registro ou troca de fonte, para o chip e a faixa de abas se redesenharem. */
	versao: number;
	/** O último envio com o olho aberto falhou ao ler o arquivo. */
	falhou: boolean;
	/** O contexto da fonte ativa agora, para o painel mandar junto da mensagem. */
	obterContexto(): ContextoTela | undefined;
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
	const [versao, setVersao] = useState(0);
	const [falhou, setFalhou] = useState(false);

	const registrar = useCallback((fonte: FonteVendo) => {
		fontes.current.push(fonte);
		setVersao((v) => v + 1);
		return () => {
			fontes.current = fontes.current.filter((outra) => outra !== fonte);
			setVersao((v) => v + 1);
		};
	}, []);
	const ativa = useCallback(() => fontes.current.at(-1), []);

	const obterContexto = useCallback(() => {
		const fonte = fontes.current.at(-1);
		if (!fonte) {
			setFalhou(false);
			return undefined;
		}
		const leitura = lerFonte(fonte, olhoRef.current);
		setFalhou(leitura.falhou);
		return leitura.contexto;
	}, []);

	const valor = useMemo<ValorVendoMesa>(() => ({ registrar, ativa, olho, alternarOlho, versao, falhou, obterContexto }), [registrar, ativa, olho, alternarOlho, versao, falhou, obterContexto]);
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
