// A tela inicial do perfil de estudos: guarda a sessão do perfil (um
// useJanelaPerfil só, para trocar de subtela sem reabrir) e escolhe a subtela
// pelo caminho: "" = os cadernos; "caderno/<matéria>[/<seção>]" = o caderno;
// "caderno/<matéria>/notas/<título>" = o editor de uma nota, dentro do caderno;
// "caderno/<matéria>/materiais/<arquivo>" = os materiais com o arquivo em destaque;
// "caderno/<matéria>/cursos/novo" e "caderno/<matéria>/cursos/<curso>/guia[/<etapa>]"
// = o guia de criação de curso, dentro do caderno; "caderno/<matéria>/cursos/<curso>"
// = a visão do curso pronto, dentro do caderno;
// "caderno/<matéria>/cursos/<curso>/modulos/<módulo>[/<lição>]" = a visão do
// módulo gerado, com a CourseBar no lugar da aba do caderno.
// Um caminho desconhecido cai nos cadernos.

import { type PropsTelaInicial, useJanelaPerfil } from "@estudos/ui";
import { useEffect, useState } from "react";
import { rotaDoModulo } from "./modulo-tela.ts";
import { TelaCaderno } from "./TelaCaderno.tsx";
import { TelaCadernos } from "./TelaCadernos.tsx";

export function TelaEstudos(props: PropsTelaInicial) {
	const janela = useJanelaPerfil(props.perfilId);
	const [tipo, materiaId, secao, ...resto] = props.caminho.split("/");
	const nota = secao === "notas" && resto.length ? resto.join("/") : undefined;
	// "caderno/<matéria>/materiais/<arquivo>": a seção Materiais com o arquivo em destaque (o nome pode ter pastas).
	const material = secao === "materiais" && resto.length ? resto.join("/") : undefined;
	// "caderno/<matéria>/cursos/novo" ou "caderno/<matéria>/cursos/<curso>/guia[/<etapa>]": o guia de criação de curso.
	const guia =
		secao === "cursos" && resto[1] === "guia" && resto[0]
			? { curso: resto[0], ...(resto[2] ? { etapa: resto[2] } : {}) }
			: secao === "cursos" && resto.length === 1 && resto[0] === "novo"
				? {}
				: undefined;
	// "caderno/<matéria>/cursos/<curso>": a visão do curso pronto.
	const cursoPronto = secao === "cursos" && resto.length === 1 && resto[0] && resto[0] !== "novo" ? resto[0] : undefined;
	// "caderno/<matéria>/cursos/<curso>/modulos/<módulo>[/<lição>]": a visão do módulo gerado.
	const modulo = secao === "cursos" ? rotaDoModulo(resto) : undefined;
	const noCaderno = tipo === "caderno" && Boolean(materiaId);
	// A matéria do meio da roda: voltar de um caderno cai nele.
	const [escolhida, setEscolhida] = useState<string | undefined>(undefined);
	useEffect(() => {
		if (noCaderno && materiaId) setEscolhida(materiaId);
	}, [noCaderno, materiaId]);

	if (noCaderno && materiaId) return <TelaCaderno {...props} janela={janela} materiaId={materiaId} {...(secao ? { secao } : {})} {...(nota ? { nota } : {})} {...(material ? { material } : {})} {...(guia ? { guia } : {})} {...(cursoPronto ? { curso: cursoPronto } : {})} {...(modulo ? { modulo } : {})} />;
	return <TelaCadernos {...props} janela={janela} {...(escolhida ? { escolhida } : {})} escolher={setEscolhida} />;
}
