// A voz do professor flutuante (docs/professor-flutuante.md, R7, R9 e R10): gravar e parar (o botão ou o
// atalho), converter para WAV, transcrever no servidor (POST /api/transcrever) e, com o texto no campo,
// enviar sozinho depois de 2 s, com Cancelar. Qualquer edição do campo também cancela o envio.
// Nada de áudio fica guardado: só a memória desta tela, até a resposta do servidor.

import { useCallback, useEffect, useRef, useState } from "react";
import { converterParaWav, paraBase64 } from "./voz-wav.ts";

export const LIMITE_GRAVACAO_S = 60;
export const ESPERA_ENVIO_S = 2;
/** Menos que isto é um clique sem querer: não vale mandar ao servidor. */
const MINIMO_S = 0.4;

export const MSG_SEM_MICROFONE = "Não consegui usar o microfone.";
export const MSG_SEM_AUDIO = "Não ouvi nada. Tente de novo.";
export const MSG_SEM_TEXTO = "Não entendi o que foi dito. Tente de novo.";
const MSG_FALHA_TRANSCRICAO = "Não consegui transcrever o áudio.";

export interface Captacao {
	/** Para de captar e devolve os blocos crus (Float32, mono) e a taxa da placa de som. */
	parar(): Promise<{ blocos: Float32Array[]; taxa: number }>;
}

/** O que o hook usa do ambiente; os testes trocam por falsos. */
export interface AmbienteVoz {
	obterMicrofone(): Promise<MediaStream>;
	iniciarCaptacao(stream: MediaStream): Captacao;
	buscar: typeof fetch;
	agora(): number;
}

/** A captação crua com um ScriptProcessor: funciona no Chromium do Electron sem arquivo de worklet à parte. */
export function captarDoMicrofone(stream: MediaStream): Captacao {
	const Contexto: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
	const contexto = new Contexto();
	// Sem gesto do usuário (o atalho global) o contexto pode nascer suspenso.
	void contexto.resume().catch(() => {});
	const fonte = contexto.createMediaStreamSource(stream);
	const no = contexto.createScriptProcessor(4096, 1, 1);
	const blocos: Float32Array[] = [];
	no.onaudioprocess = (evento) => blocos.push(new Float32Array(evento.inputBuffer.getChannelData(0)));
	// O nó só roda ligado à saída; um ganho zero evita ouvir o próprio microfone.
	const mudo = contexto.createGain();
	mudo.gain.value = 0;
	fonte.connect(no);
	no.connect(mudo);
	mudo.connect(contexto.destination);
	return {
		async parar() {
			no.onaudioprocess = null;
			for (const trilha of stream.getTracks()) trilha.stop();
			fonte.disconnect();
			no.disconnect();
			const taxa = contexto.sampleRate;
			await contexto.close().catch(() => {});
			return { blocos, taxa };
		},
	};
}

export const ambienteDoNavegador = (): AmbienteVoz => ({
	obterMicrofone: () => navigator.mediaDevices.getUserMedia({ audio: true }),
	iniciarCaptacao: captarDoMicrofone,
	buscar: (...args) => fetch(...args),
	agora: () => Date.now(),
});

export type FaseVoz = "ocioso" | "gravando" | "transcrevendo";

export interface PropsUsarVoz {
	perfilId: string;
	/** O texto do campo agora (para a edição parar a contagem). */
	texto: string;
	definirTexto(texto: string): void;
	/** Chamado quando a contagem chega ao fim, com o texto que a voz pôs no campo. */
	aoEnviar(texto: string): void;
	/** O texto atual do campo que é só um modelo (o "Olha minha página…"): a voz o substitui em vez de somar. */
	textoModelo?: string;
	ambiente?: AmbienteVoz;
}

export interface VozHook {
	fase: FaseVoz;
	/** Segundos gravados (gravando) ou o total gravado (transcrevendo). */
	segundos: number;
	/** Quantos segundos faltam para o envio automático; undefined = sem contagem. */
	envioEm: number | undefined;
	erro: string | undefined;
	alternar(): void;
	cancelarEnvio(): void;
	limparErro(): void;
}

export function usarVoz({ perfilId, texto, definirTexto, aoEnviar, textoModelo, ambiente }: PropsUsarVoz): VozHook {
	const [fase, setFase] = useState<FaseVoz>("ocioso");
	const [segundos, setSegundos] = useState(0);
	const [erro, setErro] = useState<string | undefined>(undefined);
	const [envio, setEnvio] = useState<{ texto: string; restam: number } | undefined>(undefined);

	const amb = useRef<AmbienteVoz>(ambiente ?? ambienteDoNavegador());
	if (ambiente) amb.current = ambiente;
	const vivo = useRef(true);
	const faseRef = useRef<FaseVoz>("ocioso");
	const iniciando = useRef(false);
	const captacao = useRef<Captacao | undefined>(undefined);
	const intervalo = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
	const inicio = useRef(0);
	const textoRef = useRef(texto);
	textoRef.current = texto;
	const modeloRef = useRef(textoModelo);
	modeloRef.current = textoModelo;
	const aoEnviarRef = useRef(aoEnviar);
	aoEnviarRef.current = aoEnviar;
	const definirRef = useRef(definirTexto);
	definirRef.current = definirTexto;

	const mudarFase = (nova: FaseVoz) => {
		faseRef.current = nova;
		setFase(nova);
	};

	const pararRelogio = () => {
		if (intervalo.current) clearInterval(intervalo.current);
		intervalo.current = undefined;
	};

	useEffect(() => {
		vivo.current = true;
		return () => {
			vivo.current = false;
			pararRelogio();
			// Fechou a tela gravando: solta o microfone e joga o áudio fora.
			const aberta = captacao.current;
			captacao.current = undefined;
			void aberta?.parar().catch(() => {});
		};
	}, []);

	const transcrever = async (pegada: Captacao) => {
		const duracao = Math.max(0, Math.round((amb.current.agora() - inicio.current) / 1000));
		setSegundos(Math.min(LIMITE_GRAVACAO_S, duracao));
		mudarFase("transcrevendo");
		try {
			const { blocos, taxa } = await pegada.parar();
			const { wav, segundos: total } = converterParaWav(blocos, taxa);
			if (!vivo.current) return;
			if (total < MINIMO_S) {
				setErro(MSG_SEM_AUDIO);
				return;
			}
			const resposta = await amb.current.buscar("/api/transcrever", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ perfil: perfilId, audio: paraBase64(wav), formato: "wav" }),
			});
			const corpo = (await resposta.json().catch(() => ({}))) as { texto?: unknown; erro?: unknown };
			if (!vivo.current) return;
			if (!resposta.ok) {
				setErro(typeof corpo.erro === "string" && corpo.erro ? corpo.erro : MSG_FALHA_TRANSCRICAO);
				return;
			}
			const dito = typeof corpo.texto === "string" ? corpo.texto.trim() : "";
			if (!dito) {
				setErro(MSG_SEM_TEXTO);
				return;
			}
			const atual = textoRef.current;
			const novo = !atual.trim() || atual === modeloRef.current ? dito : `${atual.trimEnd()} ${dito}`;
			definirRef.current(novo);
			setEnvio({ texto: novo, restam: ESPERA_ENVIO_S });
		} catch {
			if (vivo.current) setErro(MSG_FALHA_TRANSCRICAO);
		} finally {
			if (vivo.current) mudarFase("ocioso");
		}
	};

	const parar = () => {
		const pegada = captacao.current;
		if (!pegada || faseRef.current !== "gravando") return;
		captacao.current = undefined;
		pararRelogio();
		void transcrever(pegada);
	};
	const pararRef = useRef(parar);
	pararRef.current = parar;

	const comecar = async () => {
		if (iniciando.current || faseRef.current !== "ocioso") return;
		iniciando.current = true;
		setErro(undefined);
		setEnvio(undefined);
		try {
			const stream = await amb.current.obterMicrofone();
			if (!vivo.current) {
				for (const trilha of stream.getTracks()) trilha.stop();
				return;
			}
			captacao.current = amb.current.iniciarCaptacao(stream);
			inicio.current = amb.current.agora();
			setSegundos(0);
			mudarFase("gravando");
			intervalo.current = setInterval(() => {
				const passou = (amb.current.agora() - inicio.current) / 1000;
				setSegundos(Math.min(LIMITE_GRAVACAO_S, Math.floor(passou)));
				if (passou >= LIMITE_GRAVACAO_S) pararRef.current();
			}, 250);
		} catch {
			if (vivo.current) setErro(MSG_SEM_MICROFONE);
		} finally {
			iniciando.current = false;
		}
	};

	const alternar = useCallback(() => {
		if (faseRef.current === "gravando") pararRef.current();
		else if (faseRef.current === "ocioso") void comecar();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- só usa refs
	}, []);

	// A contagem de 2 s: um passo por segundo; no fim, envia o texto que a voz pôs no campo.
	useEffect(() => {
		if (!envio) return;
		const timer = setTimeout(() => {
			if (envio.restam <= 1) {
				setEnvio(undefined);
				aoEnviarRef.current(envio.texto);
			} else {
				setEnvio({ texto: envio.texto, restam: envio.restam - 1 });
			}
		}, 1000);
		return () => clearTimeout(timer);
	}, [envio]);

	// Qualquer edição do campo (ou esvaziá-lo, ou o envio à mão) para a contagem.
	const textoDoEnvio = envio?.texto;
	useEffect(() => {
		if (textoDoEnvio !== undefined && texto !== textoDoEnvio) setEnvio(undefined);
	}, [texto, textoDoEnvio]);

	const cancelarEnvio = useCallback(() => setEnvio(undefined), []);
	const limparErro = useCallback(() => setErro(undefined), []);

	return { fase, segundos, envioEm: envio?.restam, erro, alternar, cancelarEnvio, limparErro };
}
