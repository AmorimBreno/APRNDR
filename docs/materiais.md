# Serviço de materiais

O serviço de materiais é do núcleo (packages/core/src/materiais/) e é genérico: ele não sabe o que é uma matéria. Um perfil liga o serviço declarando no profile.json quais pastas da pasta de dados observar. Especificação: seções 5.5 e 5.6.

## Ligar num perfil

```json
"materiais": {
	"pastas": ["materias/*/materiais"],
	"modeloVisao": "openrouter/anthropic/claude-sonnet-5.5"
}
```

- `pastas`: relativas à pasta de dados, com barras normais. Cada `*` vale um nível (pastas ocultas ficam de fora). Uma pasta que ainda não existe é ignorada até aparecer.
- `modeloVisao`: modelo com visão, no formato provedor/id. Sem ele, ou sem credencial, as páginas visuais ficam só com o texto que tiverem, e o arquivo ganha um aviso.

Não ponha duas pastas observadas dentro da mesma pasta: o `.extraido` fica ao lado da pasta observada e seria dividido.

## O que acontece com um arquivo

1. A varredura acha o arquivo. Ela roda ao abrir o perfil, a cada 30 segundos e logo depois de o app adicionar arquivos. Não depende do aviso de arquivo novo do Windows, que pode não chegar no G: do Google Drive.
2. Formatos: PDF, .py, .ipynb, .md, .markdown e .txt. Os outros aparecem como "não suportado".
3. Extração, um arquivo por vez:
	- PDF: texto por página (pdfjs-dist). Uma página com menos de 300 caracteres, com uma imagem que cobre 20% da página ou mais, ou com muitos desenhos e pouco texto vira PNG e é descrita pelo modelo com visão.
	- Python: uma parte por função ou classe do nível de cima (pelo `ast` do Python) e partes de "código do módulo" para o resto. Sem Python, partes de 120 linhas.
	- Notebook: uma parte por célula, com as saídas de texto; figuras das saídas são descritas pela visão.
	- Markdown e texto: partes pelos títulos `#` e `##`.
4. O resultado vai para o `.extraido`, ao lado da pasta observada, em markdown legível:

```
materias/calculo-i/
	materiais/aula-04.pdf
	.extraido/aula-04.pdf/
		manifesto.json      hash, tamanho, data, custo, avisos e a lista de trechos
		pagina-001.md       cabeçalho (arquivo, local, origem, modelo) e o texto
		pagina-002.md
```

5. O índice (SQLite do Node com busca de texto, sem diferença de acento) é atualizado. Ele fica em `%LOCALAPPDATA%\estudos-app\indice\<perfil>.sqlite`, nunca na pasta de dados. Pode ser apagado: o serviço o remonta do `.extraido` sem chamar o modelo.

Um arquivo só é processado de novo se o conteúdo mudar (o tamanho e a data poupam o hash). Um arquivo apagado sai do índice e o `.extraido` dele é apagado, mas só numa pasta que a varredura conseguiu ler: com o Drive fora do ar, nada some.

## O que o perfil recebe

- Ferramentas do núcleo, em toda sessão principal do perfil: `buscar_material` (consulta, pasta opcional), `ler_material` (caminho, de e até por página, célula ou seção) e `listar_arquivos_de_material`.
- No barramento da sessão (`pi.events`), para as extensões do perfil:
	- `materiais:pronto` com `{caminho, pasta, nome, tipo, trechos, custo, novo}`: `novo` é falso quando o arquivo já tinha extraído e mudou;
	- `materiais:removido` com `{caminho, pasta, nome}`.
	A extensão de matérias do perfil de estudos grava esses avisos no eventos.jsonl da matéria (adicionou_material, atualizou_material, removeu_material).

## Interface

- Evento do núcleo `materiais` com a lista inteira (`SituacaoMaterial[]`) a cada mudança; no front, `estado.materiais`.
- Mensagens do WebSocket: `listar_materiais` e `reprocessar_material` (refaz do zero, inclusive as descrições da visão).
- HTTP: `POST /api/perfis/<id>/materiais`, multipart com `pasta` (relativa à pasta de dados, precisa seguir um dos padrões) e um ou mais `arquivos`. Um nome repetido com o mesmo conteúdo é pulado; com outro conteúdo, ganha " (2)". No front: `acoes.enviarMateriais(pasta, arquivos)`.
