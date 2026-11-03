// O descarte de um rascunho de curso, com a confirmação num Modal: a pasta do
// curso é apagada, então nada some sem o Breno confirmar. Serve à lista da
// seção Cursos (SecaoCursos.tsx) e à faixa do painel do caderno
// (FaixaCursos.tsx), que só precisam pedir o descarte e pôr o modal na tela.

import { Button, Modal } from "@estudos/design-system";
import { type ReactNode, useState } from "react";
import type { ResumoCurso } from "../../lib/curso-tipos.ts";
import type { CursosDaMateria } from "./cursos-ponte.ts";

export interface DescarteDeCurso {
	/** Abre a confirmação para este rascunho. */
	pedirDescarte(curso: ResumoCurso): void;
	/** O modal de confirmação: ponha em qualquer lugar do JSX do componente. */
	modalDescarte: ReactNode;
}

export function useDescartarCurso(cursos: Pick<CursosDaMateria, "descartar">): DescarteDeCurso {
	const [descartando, setDescartando] = useState<ResumoCurso | undefined>(undefined);
	// O último pedido de descarte: o título do modal continua enquanto ele fecha.
	const [alvo, setAlvo] = useState<ResumoCurso | undefined>(undefined);
	const [ocupado, setOcupado] = useState(false);
	const [erro, setErro] = useState<string | undefined>(undefined);

	const fecharModal = () => {
		if (ocupado) return;
		setDescartando(undefined);
		setErro(undefined);
	};
	const descartar = () => {
		if (!descartando || ocupado) return;
		setOcupado(true);
		setErro(undefined);
		cursos
			.descartar(descartando.id)
			.then(() => setDescartando(undefined))
			.catch((falha: unknown) => setErro((falha as Error).message))
			.finally(() => setOcupado(false));
	};

	return {
		pedirDescarte: (curso) => {
			setAlvo(curso);
			setDescartando(curso);
		},
		modalDescarte: (
			<Modal
				open={Boolean(descartando)}
				onClose={fecharModal}
				kicker="Curso em rascunho"
				title={`Descartar o rascunho ${alvo?.nome ?? ""}?`}
				size="sm"
				tone="brick"
				dismissible={!ocupado}
				footer={
					<>
						<Button variant="secondary" onClick={fecharModal} disabled={ocupado}>
							Manter
						</Button>
						<Button variant="danger" onClick={descartar} disabled={ocupado} aria-busy={ocupado}>
							{ocupado ? "Descartando…" : "Descartar"}
						</Button>
					</>
				}
			>
				<p className="body">A pasta do curso é apagada.</p>
				{erro ? <p className="body-sm cursos__erro">{erro}</p> : null}
			</Modal>
		),
	};
}
