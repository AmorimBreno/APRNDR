// Rotas por hash (o recarregar da página mantém a tela). A troca de tela é
// animada por View Transition (movimento.ts, comTransicao).
//
// - "#/": a tela de perfis;
// - "#/perfil/<id>": a tela inicial do perfil, se ele tiver uma (telas-iniciais.ts),
//   ou a janela de conversa;
// - "#/perfil/<id>/conversa": a janela de conversa de um perfil com tela inicial;
// - "#/perfil/<id>/<caminho>": uma subtela da tela inicial (no perfil de
//   estudos, "caderno/<matéria>/<seção>"). O caminho é do perfil; o front só o
//   repassa. A conversa volta para o último caminho aberto.

import { comTransicao, type EntradaTelaInicial, type PropsConversaEmbutida, ProvedorImagens, usePerfis } from "@estudos/ui";
import { MotionConfig } from "motion/react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { telasIniciais } from "./telas-iniciais.ts";
import { JanelaPerfil } from "./telas/JanelaPerfil.tsx";
import { PainelConversa } from "./telas/PainelConversa.tsx";
import { TelaPerfis } from "./telas/TelaPerfis.tsx";

interface Rota {
	perfil?: string;
	conversa: boolean;
	/** Subtela da tela inicial, sem barras nas pontas ("caderno/calculo/notas"). */
	caminho?: string;
}

export function rotaDoHash(hash: string): Rota {
	const achado = /^#\/perfil\/([^/]+)(?:\/(.+?))?\/?$/.exec(hash);
	if (!achado) return { conversa: false };
	const perfil = decodeURIComponent(achado[1]!);
	const resto = achado[2];
	if (!resto) return { perfil, conversa: false };
	if (resto === "conversa") return { perfil, conversa: true };
	return { perfil, conversa: false, caminho: resto.split("/").map(decodeURIComponent).join("/") };
}

/**
 * true se a troca de hash `de` -> `para` é entre duas subtelas do mesmo perfil
 * e a entrada da tela inicial pede para ela não animar a página (as abas da
 * mesa de estudo: a conversa ao lado não pode piscar). Qualquer outra troca
 * (outro perfil, a conversa em tela cheia, a tela de perfis) anima como antes.
 */
export function trocaSemTransicao(entrada: Pick<EntradaTelaInicial, "semTransicao"> | undefined, de: string, para: string): boolean {
	if (!entrada?.semTransicao) return false;
	const antes = rotaDoHash(de);
	const depois = rotaDoHash(para);
	if (!antes.perfil || antes.perfil !== depois.perfil || antes.conversa || depois.conversa) return false;
	return entrada.semTransicao(antes.caminho ?? "", depois.caminho ?? "");
}

/** O hash da conversa em tela cheia do perfil. */
const hashDaConversa = (perfil: string) => `#/perfil/${encodeURIComponent(perfil)}/conversa`;

/**
 * O componente da conversa embutida de um perfil (PropsTelaInicial.conversa).
 * Um só por perfil: a identidade do componente tem de ser estável, ou o React
 * o remontaria a cada render da tela inicial e perderia o rascunho.
 */
const conversasEmbutidas = new Map<string, ComponentType<PropsConversaEmbutida>>();

function conversaEmbutidaDe(perfilId: string): ComponentType<PropsConversaEmbutida> {
	let componente = conversasEmbutidas.get(perfilId);
	if (!componente) {
		componente = function ConversaEmbutida({ janela, aberta, obterContextos, cabecalho, citacao, acimaDoCampo, placeholder, aoPedidoPendente }) {
			const perfis = usePerfis();
			const perfil = perfis.lista?.perfis.find((item) => item.id === perfilId);
			return (
				<PainelConversa
					modo="embutido"
					janela={janela}
					{...(perfil ? { perfil } : {})}
					relerPerfis={perfis.recarregar}
					aberta={aberta}
					{...(obterContextos ? { obterContextos } : {})}
					{...(cabecalho ? { cabecalho } : {})}
					{...(citacao ? { citacao } : {})}
					{...(acimaDoCampo ? { acimaDoCampo } : {})}
					{...(placeholder ? { placeholder } : {})}
					{...(aoPedidoPendente ? { aoPedidoPendente } : {})}
					hrefTelaCheia={hashDaConversa(perfilId)}
				/>
			);
		};
		conversasEmbutidas.set(perfilId, componente);
	}
	return componente;
}

/** O hash da tela inicial do perfil, no caminho dado. */
function hashDoCaminho(perfil: string, caminho = ""): string {
	const partes = caminho.split("/").filter(Boolean).map(encodeURIComponent);
	return `#/perfil/${encodeURIComponent(perfil)}${partes.length ? `/${partes.join("/")}` : ""}`;
}

/** O último caminho aberto de cada perfil (para a conversa voltar até ele). */
const ultimosCaminhos = new Map<string, string>();

function irPara(hash: string): void {
	window.location.hash = hash;
}

function TelaInicial({ perfilId, caminho }: { perfilId: string; caminho: string }) {
	const { lista } = usePerfis();
	const entrada = telasIniciais[perfilId]!;
	const Componente = entrada.componente;
	const perfil = lista?.perfis.find((item) => item.id === perfilId);
	ultimosCaminhos.set(perfilId, caminho);
	return (
		<Componente
			perfilId={perfilId}
			{...(perfil ? { perfil } : {})}
			caminho={caminho}
			navegar={(destino) => irPara(hashDoCaminho(perfilId, destino))}
			abrirConversa={() => irPara(`#/perfil/${encodeURIComponent(perfilId)}/conversa`)}
			voltar={() => irPara("#/")}
			conversa={conversaEmbutidaDe(perfilId)}
		/>
	);
}

/** Com "reduzir movimento" no Windows, as animações da Motion param de se mover. */
export function App() {
	return (
		<MotionConfig reducedMotion="user">
			<Rotas />
		</MotionConfig>
	);
}

function Rotas() {
	const [hash, setHash] = useState(() => window.location.hash);
	/** O hash da tela anterior: o hashchange (também o voltar e o avançar) só traz o novo. */
	const hashAnterior = useRef(hash);

	useEffect(() => {
		// A troca de tela acontece numa View Transition: o card do perfil e a folha
		// da tela de cadernos têm o mesmo view-transition-name e se transformam um
		// no outro; o resto troca com um fade (a faixa dos cadernos tem a própria
		// entrada e saída, como bandeira).
		// Exceção: as trocas de subtela que o perfil marca com semTransicao (as abas da mesa) não animam.
		const mudou = () => {
			const de = hashAnterior.current;
			const para = window.location.hash;
			hashAnterior.current = para;
			const atualizar = () => setHash(para);
			const entrada = Object.hasOwn(telasIniciais, rotaDoHash(para).perfil ?? "") ? telasIniciais[rotaDoHash(para).perfil!] : undefined;
			if (trocaSemTransicao(entrada, de, para)) atualizar();
			else void comTransicao(atualizar);
		};
		window.addEventListener("hashchange", mudou);
		return () => window.removeEventListener("hashchange", mudou);
	}, []);

	const { perfil, conversa, caminho = "" } = rotaDoHash(hash);
	if (!perfil) return <TelaPerfis />;
	const inicial = Object.hasOwn(telasIniciais, perfil) ? telasIniciais[perfil] : undefined;
	// key só pelo perfil: trocar de subtela não remonta a tela inicial (ela guarda a sessão aberta).
	// As imagens da pasta de dados (embeds da conversa, painéis) vêm do perfil aberto.
	if (inicial && !conversa) {
		return (
			<ProvedorImagens perfilId={perfil}>
				<TelaInicial key={perfil} perfilId={perfil} caminho={caminho} />
			</ProvedorImagens>
		);
	}
	const ultimo = ultimosCaminhos.get(perfil) ?? "";
	const voltar = inicial
		? { rotulo: (ultimo && inicial.rotuloDoCaminho?.(ultimo)) || inicial.rotuloVoltar, hash: hashDoCaminho(perfil, ultimo) }
		: { rotulo: "Perfis", hash: "#/" };
	// key: outro perfil começa com o estado zerado.
	return (
		<ProvedorImagens perfilId={perfil}>
			<JanelaPerfil
				key={perfil}
				perfilId={perfil}
				voltar={voltar}
				{...(inicial?.usarAparenciaContextos ? { usarAparenciaContextos: inicial.usarAparenciaContextos } : {})}
			/>
		</ProvedorImagens>
	);
}
