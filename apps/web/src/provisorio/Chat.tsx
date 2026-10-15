// PROVISÓRIO: conversa e campo de texto crus. Serão trocados no redesenho.

import type { ChamadaFerramenta, ItemConversa } from "@estudos/ui";
import { type KeyboardEvent, useEffect, useRef } from "react";

const pre = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 } as const;

function resumirArgumentos(argumentos: unknown): string {
	if (argumentos === undefined) return "";
	let texto: string;
	try {
		texto = JSON.stringify(argumentos) ?? "";
	} catch {
		texto = String(argumentos);
	}
	return texto.length > 160 ? `${texto.slice(0, 159)}…` : texto;
}

const nomesStatus: Record<ChamadaFerramenta["status"], string> = {
	executando: "executando…",
	ok: "ok",
	erro: "erro",
	sem_resultado: "sem resultado",
};

function Ferramenta({ chamada }: { chamada: ChamadaFerramenta }) {
	return (
		<div style={{ marginLeft: chamada.idPai ? 24 : 0 }}>
			<p style={pre}>
				[ferramenta] <strong>{chamada.nome}</strong> {resumirArgumentos(chamada.argumentos)} — {nomesStatus[chamada.status]}
				{chamada.duracaoMs !== undefined ? ` (${(chamada.duracaoMs / 1000).toFixed(1)} s)` : ""}
			</p>
			{chamada.status === "executando" && chamada.progresso ? <p style={pre}>progresso: {chamada.progresso}</p> : null}
			{chamada.resumo ? <p style={pre}>resultado: {chamada.resumo}</p> : null}
		</div>
	);
}

function Item({ item }: { item: ItemConversa }) {
	if (item.tipo === "usuario") {
		return (
			<div>
				<strong>Você</strong>
				<p style={pre}>{item.texto}</p>
			</div>
		);
	}
	if (item.tipo === "ferramenta") return <Ferramenta chamada={item.chamada} />;
	return (
		<div>
			<strong>Assistente</strong>
			{item.modelo ? ` (${item.modelo})` : ""}
			{item.emAndamento ? " — respondendo…" : ""}
			{item.raciocinio ? (
				<details>
					<summary>Raciocínio</summary>
					<p style={pre}>{item.raciocinio}</p>
				</details>
			) : null}
			{item.texto ? <p style={pre}>{item.texto}</p> : null}
			{item.erro ? <p style={pre}>Erro: {item.erro}</p> : null}
		</div>
	);
}

export function Conversa({ conversa }: { conversa: ItemConversa[] }) {
	const fim = useRef<HTMLDivElement>(null);
	useEffect(() => {
		fim.current?.scrollIntoView({ block: "end" });
	}, [conversa]);

	return (
		<div style={{ flex: 1, overflowY: "auto" }}>
			{conversa.length === 0 ? <p>Conversa vazia.</p> : null}
			{conversa.map((item) => (
				<div key={item.chave} style={{ marginBottom: 12 }}>
					<Item item={item} />
				</div>
			))}
			<div ref={fim} />
		</div>
	);
}

export interface PropsCampo {
	texto: string;
	setTexto(texto: string): void;
	executando: boolean;
	desabilitado: boolean;
	enviar(): void;
	parar(): void;
}

/** Enter envia; Shift+Enter quebra a linha. */
export function CampoMensagem(props: PropsCampo) {
	const aoTeclar = (evento: KeyboardEvent<HTMLTextAreaElement>) => {
		if (evento.key === "Enter" && !evento.shiftKey && !evento.nativeEvent.isComposing) {
			evento.preventDefault();
			props.enviar();
		}
	};
	return (
		<div>
			<textarea
				rows={3}
				style={{ width: "100%", boxSizing: "border-box" }}
				value={props.texto}
				onChange={(evento) => props.setTexto(evento.target.value)}
				onKeyDown={aoTeclar}
				placeholder="Mensagem (Enter envia, Shift+Enter quebra a linha)"
				aria-label="Mensagem"
			/>
			<button type="button" onClick={props.enviar} disabled={props.desabilitado || !props.texto.trim()}>
				Enviar
			</button>{" "}
			{props.executando ? (
				<button type="button" onClick={props.parar}>
					Parar
				</button>
			) : null}
		</div>
	);
}
