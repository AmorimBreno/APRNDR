// O topo do chat compacto do professor flutuante (docs/professor-flutuante.md, 2.4): a matéria da
// conversa, pela chave do contexto da sessão ("materia:<id>"), e o seletor de plano dela. Uma conversa
// sem matéria é "Conversa geral", sem seletor. A linha tem sempre a mesma altura: antes de a sessão
// chegar ela fica reservada e vazia (docs/padroes-de-interface.md, regras 2 e 5).

import type { JanelaPerfilHook } from "@estudos/ui";
import { SeletorPlano } from "./SeletorPlano.tsx";

const PREFIXO_MATERIA = "materia:";
export const ROTULO_CONVERSA_GERAL = "Conversa geral";

/** O id da matéria de uma chave de contexto ("materia:calculo"), ou undefined se não for de matéria. */
export function materiaDaChave(chave: string | undefined): string | undefined {
	return chave?.startsWith(PREFIXO_MATERIA) && chave.length > PREFIXO_MATERIA.length ? chave.slice(PREFIXO_MATERIA.length) : undefined;
}

export function CabecalhoFlutuante({ janela }: { janela: JanelaPerfilHook }) {
	const sessao = janela.estado.sessao;
	const contexto = sessao?.contexto;
	const materiaId = materiaDaChave(contexto?.chave);
	const rotulo = materiaId ? (contexto?.rotulo ?? materiaId) : ROTULO_CONVERSA_GERAL;
	const cor = contexto?.cor && /^[a-z][a-z-]{0,23}$/.test(contexto.cor) ? contexto.cor : undefined;
	return (
		<div className="flutuante-cab">
			<div className="flutuante-cab__materia">
				{/* A sessão ainda não chegou: o texto fica escondido, ocupando o lugar. */}
				<span className="flutuante-cab__ponto" aria-hidden="true" style={{ visibility: sessao ? "visible" : "hidden", ...(cor ? { background: `var(--${cor})` } : {}) }} />
				<span className="flutuante-cab__nome body-strong" style={{ visibility: sessao ? "visible" : "hidden" }}>
					{rotulo}
				</span>
			</div>
			{/* key: outra matéria é outro seletor (o erro e a lista de uma não vazam para a outra). */}
			{materiaId ? <SeletorPlano key={materiaId} janela={janela} materiaId={materiaId} /> : null}
		</div>
	);
}
