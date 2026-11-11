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
// "agenda/<aba>[/<matéria>]" = a tela da agenda (calendario, tarefas ou quadro), filtrada pela matéria.
// "aprendiz/<aba>[/<matéria>]" = a tela "Perfil do aprendiz" (hoje só a aba indicadores), filtrada pela matéria.
// Um caminho desconhecido cai nos cadernos.
//
// Também é ela quem troca a sessão da janela para a conversa da matéria ao
// entrar no caderno (docs/mesa-de-estudo.md, 2.3; a regra é de sessao-materia.ts)
// e quem grava a memória da mesa (memoria-mesa.ts). As telas de baixo veem a
// situação da troca por troca-sessao.tsx.

import { type PropsTelaInicial, useJanelaPerfil } from "@estudos/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Materia } from "../../lib/materia-tipos.ts";
import { abaDaRota } from "./agenda-tela.ts";
import { abaDaRotaAprendiz } from "./aprendiz-tela.ts";
import { contextoDaMateria, lerAcoes, PAINEL_CADERNOS, prepararConversa } from "./comum.ts";
import { gravarCaminho, gravarSessao, lerMemoria } from "./memoria-mesa.ts";
import { rotaDoModulo } from "./modulo-tela.ts";
import { chaveDaMateria, decidirSessao, type SituacaoMesa } from "./sessao-materia.ts";
import { TelaAgenda } from "./TelaAgenda.tsx";
import { TelaAprendiz } from "./TelaAprendiz.tsx";
import { TelaCaderno } from "./TelaCaderno.tsx";
import { TelaCadernos } from "./TelaCadernos.tsx";
import { type SituacaoTroca, TrocaSessaoContexto } from "./troca-sessao.tsx";

export function TelaEstudos(props: PropsTelaInicial) {
	const janela = useJanelaPerfil(props.perfilId);
	const { estado, conexao, acoes } = janela;
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

	const sessaoId = estado.sessao?.sessaoId;
	const chaveSessao = estado.sessao?.contexto?.chave;
	const materiaAtiva = noCaderno ? materiaId : undefined;

	// A entrada: a matéria do caderno mudou (inclusive vindo de outra matéria, ou voltando a ela depois de sair).
	// Fica pendente até a sessão certa estar aberta. Sair do caderno não troca nada.
	const [vista, setVista] = useState<string | undefined>(undefined);
	const [entradaDe, setEntradaDe] = useState<string | undefined>(undefined);
	if (vista !== materiaAtiva) {
		setVista(materiaAtiva);
		setEntradaDe(materiaAtiva);
	}
	const entrada = materiaAtiva !== undefined && entradaDe === materiaAtiva;
	const [trocando, setTrocando] = useState(false);
	/** Uma troca por vez (o ref vale na hora; o estado só redesenha). */
	const emTroca = useRef(false);

	// A matéria completa (nome e cor vão no contexto da sessão): da lista da extensão ou do caderno aberto.
	// Trocar de sessão zera as ações da ponte, então a última conhecida vale até a lista nova chegar.
	const recebidas = estado.acoesPorPainel[PAINEL_CADERNOS];
	const lidas = useMemo(() => lerAcoes(recebidas ?? []), [recebidas]);
	const conhecidas = useRef(new Map<string, Materia>());
	for (const item of lidas.lista?.materias ?? []) conhecidas.current.set(item.id, item);
	for (const caderno of Object.values(lidas.cadernos)) conhecidas.current.set(caderno.materia.id, caderno.materia);
	const materia = materiaAtiva ? (lidas.lista ? lidas.lista.materias.find((item) => item.id === materiaAtiva) : conhecidas.current.get(materiaAtiva)) : undefined;
	useEffect(() => {
		// A TelaCaderno também pede; aqui é para a troca não depender de quem montou primeiro.
		// A tela do aprendiz precisa dos nomes das matérias (o filtro e as linhas) e não tem outra fonte.
		const querLista = tipo === "aprendiz" || Boolean(materiaAtiva && !materia);
		if (sessaoId && querLista && !lidas.lista) acoes.acaoDaInterface(PAINEL_CADERNOS, "listar").catch(() => {});
	}, [sessaoId, tipo, materiaAtiva, materia, lidas.lista, acoes]);

	// Carregando: sem conexão, a janela montando a sessão, ou a troca desta tela. O núcleo tem fila própria, então
	// "executando" tem um respiro entre uma mensagem e a próxima: a fila não vazia também conta como respondendo.
	const carregandoDoHook = conexao !== "aberta" || estado.carregando !== undefined || !estado.sessao;
	const base: SituacaoMesa | undefined = materiaAtiva
		? {
				materiaId: materiaAtiva,
				entrada,
				...(chaveSessao ? { chaveSessao } : {}),
				executando: estado.executando || estado.fila.length > 0,
				pedidoPendente: estado.pedidos.length > 0,
				carregando: carregandoDoHook,
			}
		: undefined;
	const decisao = base ? decidirSessao({ ...base, carregando: base.carregando || trocando }) : { acao: "nada" as const };

	/** O que a troca assíncrona precisa ver do render mais recente. */
	const agora = useRef({ janela, materiaAtiva, base });
	agora.current = { janela, materiaAtiva, base };

	// O que as telas de baixo pedem para terminar antes de a sessão trocar (salvar a nota).
	const antesDeTrocar = useRef(new Set<() => Promise<void>>());
	const registrarAntesDeTrocar = useCallback((fn: () => Promise<void>) => {
		antesDeTrocar.current.add(fn);
		return () => {
			antesDeTrocar.current.delete(fn);
		};
	}, []);
	const voltarParaMateria = useCallback(() => setEntradaDe(materiaAtiva), [materiaAtiva]);
	const executarAntesDeTrocar = useCallback(async () => {
		await Promise.all([...antesDeTrocar.current].map((fn) => Promise.resolve().then(fn).catch(() => {})));
	}, []);

	// Faz o que a decisão mandou: "abrir" salva o que está aberto, espera e abre a conversa da matéria.
	useEffect(() => {
		if (decisao.acao !== "abrir" || !materia || emTroca.current) return;
		const alvo = materia;
		emTroca.current = true;
		setTrocando(true);
		void (async () => {
			let encerrada = true;
			try {
				await executarAntesDeTrocar();
				// Enquanto salvava, o Breno pode ter mandado uma mensagem ou mudado de matéria: decide de novo, sem a própria troca.
				const depois = agora.current;
				if (depois.materiaAtiva !== alvo.id || !depois.base || decidirSessao(depois.base).acao !== "abrir") {
					// Não é mais hora: a entrada continua pendente e a decisão roda de novo quando a situação mudar.
					encerrada = false;
					return;
				}
				await prepararConversa(depois.janela, props.perfilId, contextoDaMateria(alvo), lerMemoria(props.perfilId).sessoes[alvo.id]);
			} catch {
				// Cai no finally: sem repetir sozinha (seria um laço contra um erro fixo).
			} finally {
				// Atendida ou falhou: a entrada acaba. Em falha a situação vira "outra_aba" e o Breno escolhe "Voltar para a matéria".
				// Sem isto, um render com o estado ainda velho abriria de novo.
				if (encerrada) setEntradaDe((atual) => (atual === alvo.id ? undefined : atual));
				emTroca.current = false;
				setTrocando(false);
			}
		})();
	}, [decisao.acao, materia, props.perfilId, executarAntesDeTrocar]);

	// A sessão aberta já é a da matéria: a entrada foi atendida.
	useEffect(() => {
		if (materiaAtiva && chaveSessao === chaveDaMateria(materiaAtiva)) setEntradaDe((atual) => (atual === materiaAtiva ? undefined : atual));
	}, [materiaAtiva, chaveSessao]);

	// Reconectar pode cair numa sessão sem contexto (uma "Nova" que ainda não tinha arquivo): conta como entrada.
	const abriuUmaVez = useRef(false);
	const caiu = useRef(false);
	useEffect(() => {
		if (conexao !== "aberta") {
			if (abriuUmaVez.current) caiu.current = true;
			return;
		}
		abriuUmaVez.current = true;
		if (!caiu.current) return;
		// A janela reabre a sessão logo depois; passado o prazo, uma troca vinda de outra aba volta a ser só aviso.
		const prazo = setTimeout(() => {
			caiu.current = false;
		}, 5000);
		return () => clearTimeout(prazo);
	}, [conexao]);
	const sessaoVista = useRef(sessaoId);
	useEffect(() => {
		if (sessaoVista.current === sessaoId) return;
		sessaoVista.current = sessaoId;
		if (caiu.current && sessaoId && materiaAtiva && !chaveSessao) {
			caiu.current = false;
			setEntradaDe(materiaAtiva);
		}
	}, [sessaoId, chaveSessao, materiaAtiva]);

	// A memória da mesa: o caminho dentro do caderno e a sessão de cada matéria.
	useEffect(() => {
		if (materiaAtiva) gravarCaminho(props.perfilId, materiaAtiva, props.caminho);
	}, [props.perfilId, materiaAtiva, props.caminho]);
	useEffect(() => {
		if (materiaAtiva && sessaoId && chaveSessao === chaveDaMateria(materiaAtiva)) gravarSessao(props.perfilId, materiaAtiva, sessaoId);
	}, [props.perfilId, materiaAtiva, sessaoId, chaveSessao]);

	const situacao: SituacaoTroca =
		decisao.acao === "avisar_outra_aba"
			? "outra_aba"
			: decisao.acao === "esperar" && decisao.motivo === "respondendo"
				? "esperando_resposta"
				: // Pronta a abrir mas a matéria não está na lista (apagada): nada a trocar. Sem lista ainda, é carregar.
					decisao.acao === "nada" || (decisao.acao === "abrir" && !materia && lidas.lista)
					? "pronta"
					: "trocando";
	const troca = useMemo(() => ({ situacao, voltarParaMateria, registrarAntesDeTrocar, executarAntesDeTrocar }), [situacao, voltarParaMateria, registrarAntesDeTrocar, executarAntesDeTrocar]);

	// "agenda/<aba>[/<matéria>]": o segundo pedaço é a aba e o terceiro, a matéria do filtro.
	// "aprendiz/<aba>[/<matéria>]": igual, e as matérias que a tela já conhece dão os nomes do filtro.
	const materiasDoAprendiz = tipo === "aprendiz" ? (lidas.lista ? lidas.lista.materias : [...conhecidas.current.values()]) : [];
	const tela =
		tipo === "aprendiz" ? (
			<TelaAprendiz {...props} janela={janela} aba={abaDaRotaAprendiz(materiaId)} materias={materiasDoAprendiz} {...(secao ? { materia: secao } : {})} />
		) : tipo === "agenda" ? (
			<TelaAgenda {...props} janela={janela} aba={abaDaRota(materiaId)} {...(secao ? { materia: secao } : {})} />
		) : noCaderno && materiaId ? (
			<TelaCaderno {...props} janela={janela} materiaId={materiaId} {...(secao ? { secao } : {})} {...(nota ? { nota } : {})} {...(material ? { material } : {})} {...(guia ? { guia } : {})} {...(cursoPronto ? { curso: cursoPronto } : {})} {...(modulo ? { modulo } : {})} />
		) : (
			<TelaCadernos {...props} janela={janela} {...(escolhida ? { escolhida } : {})} escolher={setEscolhida} />
		);
	return <TrocaSessaoContexto.Provider value={troca}>{tela}</TrocaSessaoContexto.Provider>;
}
