// A memória do aprendiz, camada 2 (item 9, parte A; docs/aprendiz.md, seções 2 e 7): lê do disco o que
// o cálculo puro (aprendiz-indicadores-tipos.ts) precisa e guarda o resultado em cache. Aqui só se LÊ
// a pasta de dados (eventos, config.json, matérias, mapas, cursos e módulos); nada é gravado nela. O
// cache é derivado, fica fora da pasta de dados (sincronizada com o Google Drive), em
// %LOCALAPPDATA%\estudos-app\aprendiz\indicadores.json, e pode ser apagado: a próxima leitura o refaz.

import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	calcularIndicadores,
	type ConfigAprendiz,
	type IndicadoresAprendiz,
	lerConfigAprendiz,
	VERSAO_INDICADORES,
} from "./aprendiz-indicadores-tipos.ts";
import { gravarDeUmaVez } from "./arquivos.ts";
import { caminhoDoCurso } from "./cursos.ts";
import { type Evento, lerEventos } from "./eventos.ts";
import { lerMapa } from "./mapa.ts";
import { arquivoMateria, eventosAprendiz, pastaAprendiz, pastaMaterias } from "./materias.ts";
import { caminhoDoModulo } from "./modulos.ts";

export * from "./aprendiz-indicadores-tipos.ts";

/** Até quanto tempo o cache vale mesmo sem evento novo: o decaimento depende do dia, então passado esse tempo ele é refeito. */
export const VALIDADE_DO_CACHE_MS = 24 * 60 * 60 * 1000;

/** %LOCALAPPDATA%\estudos-app\aprendiz: a pasta do cache (fora da pasta de dados). */
export const pastaCacheAprendiz = () => join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "estudos-app", "aprendiz");

export const arquivoCacheIndicadores = (pastaCache: string) => join(pastaCache, "indicadores.json");
export const arquivoConfigAprendiz = (dados: string) => join(pastaAprendiz(dados), "config.json");

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);

async function lerJson(arquivo: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(arquivo, "utf8"));
	} catch {
		return undefined;
	}
}

/** A config do aprendiz: aprendiz/config.json completado com os padrões. Sem o arquivo (ou ilegível), os padrões; o arquivo nunca é criado. */
export async function lerConfig(dados: string): Promise<ConfigAprendiz> {
	return lerConfigAprendiz(await lerJson(arquivoConfigAprendiz(dados)));
}

/** Os ids das matérias que existem: as pastas de materias/ que têm materia.json, em ordem alfabética. Sem materias/, nenhuma. */
export async function materiasExistentes(dados: string): Promise<string[]> {
	let pastas: string[];
	try {
		pastas = (await readdir(pastaMaterias(dados), { withFileTypes: true })).filter((entrada) => entrada.isDirectory()).map((entrada) => entrada.name);
	} catch {
		return [];
	}
	const existentes: string[] = [];
	for (const pasta of pastas) {
		try {
			if ((await stat(arquivoMateria(dados, pasta))).isFile()) existentes.push(pasta);
		} catch {
			// sem materia.json: não é matéria
		}
	}
	return existentes.sort();
}

/** Os nomes dos conceitos pelo mapa de cada matéria: materia -> (id do conceito -> nome). Mapa que não abre = matéria sem nomes. */
export async function nomesDosConceitos(dados: string, materias: readonly string[]): Promise<Map<string, Map<string, string>>> {
	const nomes = new Map<string, Map<string, string>>();
	for (const materia of materias) {
		try {
			const mapa = await lerMapa(dados, materia);
			nomes.set(materia, new Map(mapa.conceitos.map((conceito) => [conceito.id, conceito.nome])));
		} catch {
			nomes.set(materia, new Map());
		}
	}
	return nomes;
}

type Alternativas = Array<{ confusao?: unknown }>;

/** Acha a alternativa de uma questão num curso.json: no diagnóstico concluído ou em andamento (questoes[].id). */
function alternativasDoDiagnostico(curso: unknown, questao: string): Alternativas | undefined {
	if (!ehObjeto(curso)) return undefined;
	for (const origem of [curso.diagnostico, curso.diagnosticoEmAndamento]) {
		if (!ehObjeto(origem) || !Array.isArray(origem.questoes)) continue;
		const achada = origem.questoes.find((item) => ehObjeto(item) && item.id === questao);
		if (ehObjeto(achada) && Array.isArray(achada.alternativas)) return achada.alternativas as Alternativas;
	}
	return undefined;
}

/** Acha a alternativa de um bloco num módulo (licoes[].blocos[].id). */
function alternativasDoModulo(modulo: unknown, bloco: string): Alternativas | undefined {
	if (!ehObjeto(modulo) || !Array.isArray(modulo.licoes)) return undefined;
	for (const licao of modulo.licoes) {
		if (!ehObjeto(licao) || !Array.isArray(licao.blocos)) continue;
		const achado = licao.blocos.find((item) => ehObjeto(item) && item.id === bloco);
		if (ehObjeto(achado) && Array.isArray(achado.alternativas)) return achado.alternativas as Alternativas;
	}
	return undefined;
}

/**
 * A confusão de cada respondeu_questao errada (por id de evento) cuja resposta não trouxe a confusão no
 * próprio resultado: a da alternativa escolhida (resultado.escolha), procurada na questão do diagnóstico
 * (curso.json do curso do evento) ou no bloco do módulo (modulos/<m>.json). Questão, curso ou módulo que não
 * se acha mais, ou ilegível: sem confusão, nunca erro. Só olha as matérias que existem.
 */
export async function confusoesDosEventos(dados: string, eventos: readonly Evento[], materias: ReadonlySet<string>): Promise<Record<string, string>> {
	const arquivos = new Map<string, Promise<unknown>>();
	const lido = (caminho: () => string): Promise<unknown> => {
		let caminhoCerto: string;
		try {
			caminhoCerto = caminho();
		} catch {
			return Promise.resolve(undefined);
		}
		let promessa = arquivos.get(caminhoCerto);
		if (!promessa) {
			promessa = lerJson(caminhoCerto);
			arquivos.set(caminhoCerto, promessa);
		}
		return promessa;
	};
	const texto = (valor: unknown) => (typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined);

	const confusoes: Record<string, string> = {};
	for (const evento of eventos) {
		if (evento.verbo !== "respondeu_questao" || !ehObjeto(evento.resultado) || evento.resultado.correta !== false) continue;
		if (texto(evento.resultado.confusao)) continue;
		const escolha = evento.resultado.escolha;
		const { materia, curso, modulo, questao } = evento.objeto as Record<string, unknown>;
		if (typeof escolha !== "number" || typeof materia !== "string" || typeof curso !== "string" || typeof questao !== "string" || !materias.has(materia)) continue;
		let alternativas: Alternativas | undefined;
		if (typeof modulo === "string") alternativas = alternativasDoModulo(await lido(() => caminhoDoModulo(dados, materia, curso, modulo)), questao);
		else alternativas = alternativasDoDiagnostico(await lido(() => caminhoDoCurso(dados, materia, curso)), questao);
		const confusao = texto(alternativas?.[escolha]?.confusao);
		if (confusao) confusoes[evento.id] = confusao;
	}
	return confusoes;
}

// --- O cache ---------------------------------------------------------------------------------

/** O arquivo do cache: o resultado e a chave com que ele foi calculado. */
interface CacheIndicadores {
	versao: number;
	/** Quantos eventos e qual o último (id) quando foi calculado. */
	quantos: number;
	ultimoEvento: string | null;
	config: ConfigAprendiz;
	materias: string[];
	indicadores: IndicadoresAprendiz;
}

function cacheLido(valor: unknown): CacheIndicadores | undefined {
	if (!ehObjeto(valor) || valor.versao !== VERSAO_INDICADORES) return undefined;
	const { quantos, ultimoEvento, config, materias, indicadores } = valor;
	if (typeof quantos !== "number" || !(ultimoEvento === null || typeof ultimoEvento === "string") || !ehObjeto(config) || !Array.isArray(materias)) return undefined;
	if (!ehObjeto(indicadores) || indicadores.versao !== VERSAO_INDICADORES || typeof indicadores.calculadoEm !== "string" || !Array.isArray(indicadores.conceitos)) return undefined;
	return valor as unknown as CacheIndicadores;
}

/**
 * Os indicadores do aprendiz (camada 2) de todas as matérias, com o nome dos conceitos pelo mapa.
 * Com cache em <pastaCache>/indicadores.json: se o último evento (e quantos eventos), a versão, a config e a
 * lista de matérias são os mesmos e o cache tem menos de um dia (o decaimento muda com os dias), devolve o
 * cache sem recalcular; senão recalcula tudo e regrava o cache por gravação segura. Cache corrompido ou de
 * outra versão: recalcula. Falha ao gravar o cache não atrapalha a resposta. Os nomes dos conceitos
 * não vão para o cache: saem do mapa a cada chamada, que pode ter mudado sem evento novo.
 */
export async function indicadoresDoAprendiz(dados: string, pastaCache: string = pastaCacheAprendiz(), agora: Date = new Date()): Promise<IndicadoresAprendiz> {
	const [{ eventos }, config, materias] = await Promise.all([lerEventos(eventosAprendiz(dados)), lerConfig(dados), materiasExistentes(dados)]);
	const ultimoEvento = eventos[eventos.length - 1]?.id ?? null;

	const arquivoCache = arquivoCacheIndicadores(pastaCache);
	const cache = cacheLido(await lerJson(arquivoCache));
	const vale =
		cache !== undefined &&
		cache.ultimoEvento === ultimoEvento &&
		cache.quantos === eventos.length &&
		JSON.stringify(cache.config) === JSON.stringify(config) &&
		JSON.stringify(cache.materias) === JSON.stringify(materias) &&
		Math.abs(agora.getTime() - Date.parse(cache.indicadores.calculadoEm)) < VALIDADE_DO_CACHE_MS;

	let indicadores: IndicadoresAprendiz;
	if (vale) {
		indicadores = cache.indicadores;
	} else {
		const confusoes = await confusoesDosEventos(dados, eventos, new Set(materias));
		indicadores = calcularIndicadores(eventos, { config, agora, materias, confusoes });
		try {
			const novo: CacheIndicadores = { versao: VERSAO_INDICADORES, quantos: eventos.length, ultimoEvento, config, materias, indicadores };
			await mkdir(pastaCache, { recursive: true });
			await gravarDeUmaVez(arquivoCache, `${JSON.stringify(novo)}\n`);
		} catch {
			// sem cache a resposta continua certa; só a próxima leitura recalcula
		}
	}
	return comNomes(dados, indicadores, materias);
}

/** Acrescenta o nome do mapa a cada conceito (sem mexer no objeto recebido). Conceito que o mapa não tem mais fica sem nome. */
async function comNomes(dados: string, indicadores: IndicadoresAprendiz, materias: readonly string[]): Promise<IndicadoresAprendiz> {
	const doIndicador = new Set(indicadores.conceitos.map((conceito) => conceito.materia));
	const nomes = await nomesDosConceitos(dados, materias.filter((materia) => doIndicador.has(materia)));
	return {
		...indicadores,
		conceitos: indicadores.conceitos.map((conceito) => {
			const nome = nomes.get(conceito.materia)?.get(conceito.conceito);
			const { nome: _antigo, ...resto } = conceito;
			return nome ? { ...resto, nome } : resto;
		}),
	};
}
