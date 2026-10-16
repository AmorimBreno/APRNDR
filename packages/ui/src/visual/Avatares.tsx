// Fotos da conversa: a do agente (a imagem do profile.json, recortada no
// rosto, num círculo de papel; o branco da imagem vira papel com multiply) e
// a do usuário, um desenho próprio no traço dos personagens do Notion
// (contorno preto grosso, cabelo chapado, traços mínimos).

import { useState } from "react";
import type { DadosAvatarAgente as DadosAvatar } from "../use-perfis.ts";

export interface PropsAvatarAgente {
	nome: string;
	avatar?: DadosAvatar;
	/** Lado em px. Padrão 36. */
	tamanho?: number;
	className?: string;
}

/** Posição e tamanho da imagem para o círculo mostrar só o recorte. */
export function estiloDoRecorte(
	recorte: [number, number, number],
	natural: { largura: number; altura: number },
	tamanho: number,
): { width: number; height: number; left: number; top: number } {
	const [x, y, lado] = recorte;
	const escala = tamanho / lado;
	return { width: natural.largura * escala, height: natural.altura * escala, left: -x * escala, top: -y * escala };
}

export function AvatarAgente({ nome, avatar, tamanho = 36, className }: PropsAvatarAgente) {
	const [natural, setNatural] = useState<{ largura: number; altura: number }>();
	const [falhou, setFalhou] = useState(false);
	const classe = `avatar avatar--agente${className ? ` ${className}` : ""}`;
	if (!avatar || falhou) {
		return (
			<span className={`${classe} avatar--inicial`} style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.46 }} aria-hidden="true">
				{nome.charAt(0).toUpperCase()}
			</span>
		);
	}
	const posicao = avatar.recorte && natural ? estiloDoRecorte(avatar.recorte, natural, tamanho) : undefined;
	return (
		<span className={classe} style={{ width: tamanho, height: tamanho }} aria-hidden="true">
			<img
				src={avatar.url}
				alt=""
				draggable={false}
				onLoad={(evento) => setNatural({ largura: evento.currentTarget.naturalWidth, altura: evento.currentTarget.naturalHeight })}
				onError={() => setFalhou(true)}
				style={
					avatar.recorte
						? posicao
							? { position: "absolute", ...posicao }
							: { visibility: "hidden" }
						: { width: "100%", height: "100%", objectFit: "cover" }
				}
			/>
		</span>
	);
}

/** O avatar do usuário: desenho próprio, no traço dos personagens do Notion. */
export function AvatarUsuario({ tamanho = 36, className }: { tamanho?: number; className?: string }) {
	return (
		<span className={`avatar avatar--usuario${className ? ` ${className}` : ""}`} style={{ width: tamanho, height: tamanho }} aria-hidden="true">
			<svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke="#15130f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
				{/* ombros e camiseta */}
				<path d="M9 66c1.5-11 9.5-16.5 23-16.5S53.5 55 55 66" fill="#f3ecdf" />
				<path d="M26.5 50.5c1.4 3 3.3 4.4 5.5 4.4s4.1-1.4 5.5-4.4" />
				{/* pescoço */}
				<path d="M27.5 42.5v7M36.5 42.5v7" />
				{/* orelhas */}
				<path d="M20.4 30.5c-3.2-1-4.8 1.6-3.6 4.4 1 2.3 3 3 4.6 2.3" fill="#f3ecdf" />
				<path d="M43.6 30.5c3.2-1 4.8 1.6 3.6 4.4-1 2.3-3 3-4.6 2.3" fill="#f3ecdf" />
				{/* rosto */}
				<path d="M20.5 27c0 10.4 4.7 17.5 11.5 17.5S43.5 37.4 43.5 27 38.8 12.5 32 12.5 20.5 16.6 20.5 27Z" fill="#f3ecdf" />
				{/* cabelo chapado, com a franja caindo para um lado */}
				<path
					d="M19.2 29.5c-2.6-9.6 1.4-18.8 11.4-19.8 6.6-.7 11.6 1.6 13.8 6.2 1.6 3.3 1.5 7.7.4 11.6-1.6-3.6-4-6.3-7.3-7.6-1.6 3-5.6 5.4-10.6 5.6-3.2.1-5.8 1.4-7.7 4Z"
					fill="#15130f"
				/>
				{/* sobrancelhas, olhos, nariz e boca */}
				<path d="M25.3 27.6l3.6-.7M35.1 26.9l3.6.7" />
				<circle cx="27.3" cy="31.4" r="1.5" fill="#15130f" stroke="none" />
				<circle cx="36.7" cy="31.4" r="1.5" fill="#15130f" stroke="none" />
				<path d="M32.2 32.6c-.9 2.4-1.2 3.6.4 3.9" />
				<path d="M29 39.4c1.9 1.4 4.1 1.4 6 0" />
			</svg>
		</span>
	);
}
