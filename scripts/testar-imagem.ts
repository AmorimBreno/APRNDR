// Teste real do "Olha minha página" (docs/professor-flutuante.md, R5): manda ao professor de verdade
// uma imagem com uma pergunta, pelo núcleo (JanelaPerfil.enviar com imagens), numa pasta de dados
// TEMPORÁRIA e sem o serviço de materiais. Não lê nem grava a pasta de dados do Breno.
//
// Uso: pnpm exec tsx scripts/testar-imagem.ts <imagem.png|jpg> ["pergunta"]
// Sai com código 1 se a resposta não vier.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { carregarChaves } from "../apps/server/src/chaves.ts";
import { type EventoNucleo, JanelaPerfil, lerPerfil } from "../packages/core/src/index.ts";
import { criarMateria } from "../profiles/estudos/lib/materias.ts";
import { contextoDaMateria } from "../profiles/estudos/paineis/src/comum.ts";

const [arquivo, pergunta = "Olha minha página: o que está errado, faltando ou em aberto?"] = process.argv.slice(2);
if (!arquivo) throw new Error("Uso: pnpm exec tsx scripts/testar-imagem.ts <imagem> [pergunta]");
const chaves = carregarChaves(["OPENROUTER_API_KEY", "TAVILY_API_KEY"]);
if (chaves.OPENROUTER_API_KEY === "ausente") throw new Error("Configure OPENROUTER_API_KEY nas variáveis de ambiente do Windows.");

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dados = await mkdtemp(join(tmpdir(), "estudos-testar-imagem-"));
const { materiais: _sem, ...perfilSemMateriais } = await lerPerfil(join(raiz, "profiles", "estudos"));
const janela = new JanelaPerfil({ ...perfilSemMateriais, pastaDados: dados });
let resposta = "";
let custo = 0;
let imagensVistas: number | undefined;
janela.assinar((evento: EventoNucleo) => {
	if (evento.tipo === "mensagem_assistente" && evento.texto.trim()) resposta = evento.texto;
	if (evento.tipo === "uso") custo += evento.custo;
	if (evento.tipo === "mensagem_usuario") imagensVistas = (evento as { imagens?: number }).imagens;
	if (evento.tipo === "pedido_interface") janela.responder(evento.id, { escolhas: [], outra: "Pode responder direto.", texto: "Pode responder direto." });
});
try {
	const materia = await criarMateria(dados, { nome: "Ciência de Dados" });
	await janela.iniciar();
	await janela.novaSessao(undefined, contextoDaMateria(materia));
	const bytes = await readFile(arquivo);
	const tipo = extname(arquivo).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
	await janela.enviar(pergunta, undefined, [{ tipo, dados: bytes.toString("base64") }]);
	await janela.aguardarOcioso();
	console.log(`imagens na mensagem do usuário: ${imagensVistas ?? 0}`);
	console.log(`\n${resposta}\n\nCusto: US$ ${custo.toFixed(4)}`);
	if (!resposta.trim()) process.exitCode = 1;
} finally {
	await janela.descartar().catch(() => {});
	await rm(dados, { recursive: true, force: true }).catch(() => {});
}
