// Teste de renderização das ferramentas de desenho do perfil de estudos.
//
// Renderiza um diagrama mermaid e um SVG de exemplo, os dois com texto em
// português, e grava os PNGs em <pasta temporária>/estudos-render-teste/.
//
// Usa o mesmo caminho de código das ferramentas: importa os arquivos .ts de
// profiles/estudos/extensions/visual-tools/tools/ (o Node 24 remove os tipos
// sozinho), registra as ferramentas num "pi" falso e chama write_* e render_*
// como o modelo chamaria. O PNG volta embutido no resultado (base64), igual ao
// que o modelo recebe; este script só o grava em disco.
//
// Pré-requisito: npm install em profiles/estudos/extensions/visual-tools.
// Uso: node scripts/testar-render.mjs

import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const FERRAMENTAS = join(RAIZ, "profiles", "estudos", "extensions", "visual-tools", "tools")
const SAIDA = join(tmpdir(), "estudos-render-teste")

const MERMAID = `graph TD
  A[Coleta de dados] --> B{Os dados estão limpos?}
  B -- Não --> C[Limpeza e transformação]
  B -- Sim --> D[Regressão e validação]
  C --> D`

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="200" viewBox="0 0 420 200">
  <rect x="0" y="0" width="420" height="200" fill="#ffffff"/>
  <line x1="30" y1="150" x2="390" y2="150" stroke="#333" stroke-width="2"/>
  <line x1="30" y1="150" x2="30" y2="30" stroke="#333" stroke-width="2"/>
  <line x1="40" y1="140" x2="370" y2="50" stroke="#1f6feb" stroke-width="3"/>
  <circle cx="90" cy="120" r="5" fill="#d1242f"/>
  <circle cx="200" cy="100" r="5" fill="#d1242f"/>
  <circle cx="300" cy="62" r="5" fill="#d1242f"/>
  <text x="210" y="185" font-family="sans-serif" font-size="16" text-anchor="middle">Área construída (m²)</text>
  <text x="40" y="24" font-family="sans-serif" font-size="16">Preço previsto: ŷ = b₀ + b₁x</text>
  <text x="250" y="130" font-family="sans-serif" font-size="14" fill="#555">Regressão e previsão</text>
</svg>`

// "pi" falso: só guarda as ferramentas registradas pela extensão.
function carregar(ext) {
  const ferramentas = {}
  ext({ registerTool: (t) => (ferramentas[t.name] = t) })
  return ferramentas
}

// Chama a ferramenta de render e grava o PNG que veio embutido no resultado.
async function renderizar(ferramentas, prefixo, fonte, arquivo) {
  await ferramentas[`write_${prefixo}`].execute("teste", { source: fonte })
  const res = await ferramentas[`render_${prefixo}`].execute("teste", {})
  const imagem = res.content.find((c) => c.type === "image")
  if (!res.details.ok || !imagem) {
    const texto = res.content.filter((c) => c.type === "text").map((c) => c.text).join("\n")
    throw new Error(`render_${prefixo} falhou:\n${texto}`)
  }
  const destino = join(SAIDA, arquivo)
  writeFileSync(destino, Buffer.from(imagem.data, "base64"))
  return destino
}

mkdirSync(SAIDA, { recursive: true })
const importar = async (nome) => (await import(pathToFileURL(join(FERRAMENTAS, nome)).href)).default

let falhas = 0
for (const [nome, prefixo, fonte, arquivo] of [
  ["mermaid_tools.ts", "mermaid", MERMAID, "mermaid.png"],
  ["svg_tools.ts", "svg", SVG, "svg.png"],
]) {
  try {
    const destino = await renderizar(carregar(await importar(nome)), prefixo, fonte, arquivo)
    console.log(`ok   ${prefixo}: ${destino}`)
  } catch (err) {
    falhas++
    console.error(`ERRO ${prefixo}: ${err instanceof Error ? err.message : err}`)
  }
}
process.exit(falhas ? 1 : 0)
