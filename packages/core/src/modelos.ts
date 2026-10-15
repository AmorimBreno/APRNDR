// Modelos: nomes no formato "provedor/id" (por exemplo
// "openrouter/openai/gpt-6.1-sol") resolvidos pelo registro de modelos do pi
// (ModelRuntime). O provedor é o que vem antes da primeira barra; o resto é o
// id do modelo naquele provedor, que pode ter barras.
//
// As credenciais são as do pi: variáveis de ambiente dos provedores (por
// exemplo OPENROUTER_API_KEY) e ~/.pi/agent/auth.json. Este arquivo nunca lê
// nem imprime chaves; só pergunta ao registro se o provedor tem credencial.

import { join } from "node:path";
import { type CreateAgentSessionOptions, getAgentDir, ModelRuntime } from "@earendil-works/pi-coding-agent";

/** Modelo de conversa do catálogo do pi. */
export type ModeloPi = NonNullable<CreateAgentSessionOptions["model"]>;

/** Nível de raciocínio do pi ("thinking" no frontmatter dos agentes). */
export type NivelRaciocinio = NonNullable<CreateAgentSessionOptions["thinkingLevel"]>;

/** Os níveis que o pi aceita, do menor para o maior (settings.md, defaultThinkingLevel). */
export const NIVEIS_RACIOCINIO = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const satisfies readonly NivelRaciocinio[];

/** O que o núcleo usa do registro de modelos do pi. O ModelRuntime cumpre esta interface. */
export interface RegistroModelos {
	getModel(provedor: string, id: string): ModeloPi | undefined;
	hasConfiguredAuth(provedor: string): boolean;
	getAvailable(): Promise<readonly ModeloPi[]>;
}

/** Um modelo disponível, para o seletor de modelo. */
export interface InfoModelo {
	/** Nome completo, no formato provedor/id. */
	nome: string;
	provedor: string;
	id: string;
	/** Nome de exibição do catálogo do pi. */
	titulo: string;
	/** true = o modelo aceita nível de raciocínio. */
	raciocinio: boolean;
	/** true = o modelo aceita imagem na entrada. */
	imagem: boolean;
	janelaContexto: number;
}

export class ErroModelo extends Error {
	constructor(
		readonly modelo: string,
		mensagem: string,
	) {
		super(mensagem);
		this.name = "ErroModelo";
	}
}

/** Separa "provedor/id" na primeira barra. */
export function separarNomeModelo(nome: string): { provedor: string; id: string } {
	const barra = nome.indexOf("/");
	const provedor = barra > 0 ? nome.slice(0, barra).trim() : "";
	const id = barra > 0 ? nome.slice(barra + 1).trim() : "";
	if (!provedor || !id) {
		throw new ErroModelo(nome, `Modelo "${nome}": use o formato provedor/id, por exemplo openrouter/openai/gpt-6.1-sol.`);
	}
	return { provedor, id };
}

/** Nome completo (provedor/id) de um modelo do pi. */
export function nomeDoModelo(modelo: Pick<ModeloPi, "provider" | "id">): string {
	return `${modelo.provider}/${modelo.id}`;
}

/**
 * Acha o modelo no registro do pi e confere se o provedor tem credencial.
 * Lança ErroModelo com o nome do modelo quando ele não existe ou não tem chave.
 */
export function resolverModelo(registro: RegistroModelos, nome: string): ModeloPi {
	const { provedor, id } = separarNomeModelo(nome);
	const modelo = registro.getModel(provedor, id);
	if (!modelo) {
		throw new ErroModelo(
			nome,
			`Modelo "${nome}" não existe no registro de modelos do pi (provedor "${provedor}", id "${id}").`,
		);
	}
	if (!registro.hasConfiguredAuth(provedor)) {
		throw new ErroModelo(
			nome,
			`Modelo "${nome}": o provedor "${provedor}" não tem credencial. Defina a variável de ambiente do provedor (por exemplo OPENROUTER_API_KEY) ou rode "pi /login".`,
		);
	}
	return modelo;
}

/** Interpreta o "thinking" do frontmatter. Valor desconhecido vira aviso e é ignorado. */
export function interpretarRaciocinio(valor: string | undefined): { nivel?: NivelRaciocinio; aviso?: string } {
	if (valor === undefined) return {};
	const nivel = NIVEIS_RACIOCINIO.find((item) => item === valor.trim().toLowerCase());
	if (!nivel) {
		return { aviso: `nível de raciocínio "${valor}" desconhecido; use um de: ${NIVEIS_RACIOCINIO.join(", ")}` };
	}
	return { nivel };
}

/** Descreve um modelo do pi para o seletor. */
export function descreverModelo(modelo: ModeloPi): InfoModelo {
	return {
		nome: nomeDoModelo(modelo),
		provedor: modelo.provider,
		id: modelo.id,
		titulo: modelo.name,
		raciocinio: modelo.reasoning,
		imagem: modelo.input.includes("image"),
		janelaContexto: modelo.contextWindow,
	};
}

/** Modelos que o pi tem com as credenciais configuradas, em ordem de nome. */
export async function listarModelosDisponiveis(registro: RegistroModelos): Promise<InfoModelo[]> {
	const modelos = await registro.getAvailable();
	return modelos.map(descreverModelo).sort((a, b) => a.nome.localeCompare(b.nome));
}

/**
 * Cria o registro de modelos do pi com as credenciais e os modelos da pasta
 * global (padrão ~/.pi/agent): auth.json, models.json e as variáveis de ambiente.
 */
export async function criarRegistroModelos(pastaPi: string = getAgentDir()): Promise<ModelRuntime> {
	return ModelRuntime.create({
		authPath: join(pastaPi, "auth.json"),
		modelsPath: join(pastaPi, "models.json"),
	});
}
