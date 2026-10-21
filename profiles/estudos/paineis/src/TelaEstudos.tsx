// A tela inicial do perfil de estudos: guarda a sessão do perfil (um
// useJanelaPerfil só, para trocar de subtela sem reabrir) e escolhe a subtela
// pelo caminho: "" = os cadernos; "caderno/<matéria>[/<seção>]" = o caderno;
// "caderno/<matéria>/notas/<título>" = o editor de uma nota, dentro do caderno;
// "caderno/<matéria>/materiais/<arquivo>" = os materiais com o arquivo em destaque.
// Um caminho desconhecido cai nos cadernos.

import { type PropsTelaInicial, useJanelaPerfil } from "@estudos/ui";
import { useEffect, useState } from "react";
import { TelaCaderno } from "./TelaCaderno.tsx";
import { TelaCadernos } from "./TelaCadernos.tsx";

export function TelaEstudos(props: PropsTelaInicial) {
	const janela = useJanelaPerfil(props.perfilId);
	const [tipo, materiaId, secao, ...resto] = props.caminho.split("/");
	const nota = secao === "notas" && resto.length ? resto.join("/") : undefined;
	// "caderno/<matéria>/materiais/<arquivo>": a seção Materiais com o arquivo em destaque (o nome pode ter pastas).
	const material = secao === "materiais" && resto.length ? resto.join("/") : undefined;
	const noCaderno = tipo === "caderno" && Boolean(materiaId);
	// A matéria do meio da roda: voltar de um caderno cai nele.
	const [escolhida, setEscolhida] = useState<string | undefined>(undefined);
	useEffect(() => {
		if (noCaderno && materiaId) setEscolhida(materiaId);
	}, [noCaderno, materiaId]);

	if (noCaderno && materiaId) return <TelaCaderno {...props} janela={janela} materiaId={materiaId} {...(secao ? { secao } : {})} {...(nota ? { nota } : {})} {...(material ? { material } : {})} />;
	return <TelaCadernos {...props} janela={janela} {...(escolhida ? { escolhida } : {})} escolher={setEscolhida} />;
}
