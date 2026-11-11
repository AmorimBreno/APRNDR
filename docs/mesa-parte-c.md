# Mesa de estudo, parte C1: o professor agindo na esquerda (contrato, versão 2)

Decisão de origem: ESPECIFICACAO.md, 13.19 ("O professor na esquerda"). Este arquivo é o contrato da parte C1 e vale junto de docs/mesa-de-estudo.md (partes A e B). Processo: o guia multiagente do Breno (plano revisado, contratos antes, pacotes com arquivos exclusivos, revisão por diff, um commit por pacote, paradas para teste).

Histórico: o plano de 2026-11-11 foi revisado por um agente Opus no mesmo dia, que leu o código e achou cinco bloqueadores (B1 a B5, seção 1) e quinze lacunas. Esta versão já os incorpora. O Breno decidiu em 2026-11-11: o professor abre abas em segundo plano (D1), o "Guardar na nota" grava citação com fonte e id curto (D3), a aba de material fica para a parte C2 (D4) e o WP2 é feito no Opus.

Escopo da C1: três coisas, só em notas e lições.
1. O professor abre uma aba e destaca um trecho dela (ferramentas `abrir_na_mesa` e `destacar_trecho`).
2. "Ir ao trecho" em cada resposta.
3. "Guardar na nota" em cada bloco de primeiro nível da resposta.

Fora da C1: aba de material (parte C2), aba do mapa, visualizador de PDF, a tag "do professor", sugestões e atalhos (parte D), rota para abrir uma conversa pelo id (parte D).


## 1. O que a revisão achou e como o contrato responde

B1. Uma ferramenta do professor não recebe resultado da tela. O "pedido" da ponte é para o usuário responder (vira botão na conversa, faz a foto pulsar, fica gravado na sessão). Resposta do contrato: a extensão confere tudo no disco antes (a nota existe, o trecho está no texto), emite um `interface:mostrar` com `gravar: false` num painel só da mesa e devolve ao modelo "pedido enviado à tela". A tela tenta; se falhar, mostra um aviso discreto, e o modelo não fica sabendo. Esperar a tela exigiria mudar o núcleo (um pedido sem interface) e é outro plano.

B2. Um "mostrar" gravado voltaria a ser executado ao reabrir a conversa (estadoDaPonte reconstrói acoesPorPainel pelos registros). Resposta: os comandos vão sempre com `gravar: false`; quem consome guarda as chaves que já existiam ao montar e a cada troca de `sessaoId` e só reage a chaves novas (o padrão do pedirNota em MesaEstudo.tsx); o painel novo `mesa` entra em paineis/src/index.ts com `foraDaArea: true`; o painel é só da mesa (o "notas" tem tráfego demais e o limite é de 50 ações por painel).

B3. A `origem` de hoje é só a rota e não diz onde o trecho estava. Resposta: a origem ganha uma âncora (seção 3), e `abaDoCaminho` e `chaveDaFonte` passam a ignorar o que vem depois do "?".

B4. O professor não conhece ids de bloco (o textoDaLicao não os mostra, e a nota não tem blocos com id). Resposta: as ferramentas recebem texto, e a tela localiza. Não existe `ir_ao_bloco`: rolar até uma seção é `destacar_trecho` com o título e `so_rolar`.

B5. O núcleo da conversa não tem onde pendurar ações por resposta ou por parágrafo. Resposta: dois ganchos genéricos, no WP0 (seção 6).


## 2. As ferramentas e o painel "mesa"

Painel `mesa` (constante PAINEL_MESA), `foraDaArea: true`. Ação única da extensão para a tela: `comando` com `dados`:

    ComandoMesa =
      | { cmd: "abrir", tipo: "nota" | "licao", caminho: string, rotulo: string, foco: "prévia" | "foco" }
      | { cmd: "destacar", caminho: string, trecho: string, soRolar: boolean }

`caminho` é a rota da aba (a mesma de abas-mesa.ts) e sempre vem conferida pela extensão. `foco: "prévia"` é o único valor que o professor pode pedir (D1); a tela decide se vira foco (seção 4). Cada comando leva um `id` único (a chave da ação), usado só para não repetir.

Ferramentas (extensions/mesa.ts, só na conversa de uma matéria; na conversa geral recusam, com `materiaDaConversa` de notas.ts):
- `abrir_na_mesa(tipo, titulo)`: nota pelo título (confere com `conferirTitulo` e a existência do arquivo) ou lição por módulo e lição (confere o módulo gerado). Devolve "pedido enviado à tela" ou o erro de conferência.
- `destacar_trecho(trecho, aba?, so_rolar?)`: `aba` é o título da nota ou o módulo/lição (sem `aba`, a aba em foco no último contexto da tela da conversa). O trecho precisa estar, normalizado (espaços juntos, sem diferença de caixa), no texto da nota no disco ou no `textoDaLicao` da lição; senão, erro "trecho não encontrado" ao modelo. `so_rolar` serve para títulos de seção.
- Os caminhos de material e títulos vêm do modelo: toda entrada passa por `conferirTitulo` e `garantirMateria`, nunca por concatenação direta.
- Quando usar: o AGENTS.md do perfil ganha uma regra curta (usar `destacar_trecho` só quando o Breno pediu para ver ou quando apontar um ponto específico ajuda; não em toda resposta; só abrir uma aba quando o assunto está nela e ela não está aberta). Se a skill do learn precisar de mudança, ela é mínima, marcada [estudos-ia] e listada no ORIGEM.md.


## 3. A origem com âncora

Formato (puro, em profiles/estudos/paineis/src/origem-mesa.ts, com testes): `<rota>?bloco=<n>&v=<versão>&antes=<texto>&depois=<texto>`.
- O separador é "?" porque "#" é aceito em títulos de nota e "?" é proibido (nota-tipos.ts).
- `bloco`: na lição, o id do bloco da seleção (`closest("[data-bloco]")`); na nota, o título da seção acima da seleção.
- `v`: a versão do bloco na lição (`versaoDoBloco`); omitida na nota.
- `antes` e `depois`: até 40 caracteres de texto ao redor da seleção, codificados; cortados antes de passar de 500 caracteres no total (limite de `origem` no protocolo).
- `formatarOrigem(rota, ancora)` e `lerOrigem(origem)` devolvem a rota e a âncora; origens antigas, sem "?", valem como rota sem âncora (abrem a aba e procuram o texto da `selecao`).
- `abaDoCaminho` e `chaveDaFonte` ignoram tudo depois do "?", para a chave da aba não mudar.
- `perguntar(pedido, trecho)` e a SelecaoAtiva passam a levar o bloco, o antes e o depois, além do texto.

Resolução (src/ancora.ts, pura onde der): ao ir ao trecho, em ordem: o texto exato com o contexto (antes e depois); só o texto exato; o bloco (mesmo com versão diferente); o começo da aba. Em qualquer queda aparece um aviso discreto, "O trecho mudou desde a pergunta", sem mudar o tamanho de nada. Nota renomeada: só avisa nesta rodada (não segue renomeou_nota). Comparação normalizada (`juntarEspacos`); fórmulas do KaTeX duplicam o texto na seleção, então se não achar cai no bloco.


## 4. A mesa consome os comandos

- Só a aba do navegador visível e com foco reage (`document.visibilityState` e `hasFocus`): a janela é uma só e as abas do navegador a compartilham.
- Se a mesa não está montada (o Breno está no painel do caderno), o comando se perde. Isso é aceito e fica escrito.
- Comando `abrir` (D1): a aba abre numa vaga de prévia (uma só, reaproveitada pelo professor; vira fixa se o Breno interagir com ela) e pulsa na faixa. Ela só vira a aba em foco se o Breno não estiver editando: sem digitar há 5 s e sem foco no editor. A vaga de prévia conta no limite de 6 abas, e abrir uma prévia nunca fecha uma aba do Breno antes de fechar a prévia anterior.
- Comando `destacar`: vale sempre na aba em foco. Se a aba alvo não é a em foco, abre ou ativa conforme a regra de `abrir`; o destaque fica pendente nela.
- A âncora pendente é consumida depois que o conteúdo da aba fica pronto (a nota chega pela ponte; o módulo carrega assíncrono, `pronta` em TelaModulo), com prazo, e tem prioridade sobre a rolagem guardada da aba (que hoje seria devolvida ao ativar).
- O destaque não altera o documento: na nota, uma Decoration do ProseMirror; na lição, o CSS Custom Highlight API (`CSS.highlights`, presente no Edge) sobre um Range nos nós de texto. Nunca uma marca no TipTap, que sujaria a nota e dispararia salvamento. Some sozinho depois de uns segundos ou no próximo clique. Movimento reduzido: sem animação.
- A API `irPara(alvo)` da mesa, exposta por contexto React, é a única porta: serve aos comandos do professor e ao "Ir ao trecho".


## 5. Na conversa: "Ir ao trecho" e "Guardar na nota"

Ganchos genéricos do núcleo (no WP0 só os tipos; o WP3 faz o desenho):
- `rodapeDaResposta?(resposta, perguntaAnterior?)` em PropsConversaEmbutida, repassado pelo PainelConversa e chamado em BlocoResposta/DocumentoConversa (Conversa.tsx). `perguntaAnterior` é o item do usuário com o `contextosTela`.
- `acoesDoBloco?(fonteMarkdown, indice)` no Markdown, para ações por bloco de primeiro nível (parágrafo, lista, tabela, código, fórmula, citação). O texto original do bloco sai de `node.position.start/end.offset` sobre `item.texto`.

Regras:
- Os dois só aparecem com a resposta pronta (`!emAndamento`).
- "Ir ao trecho" só no último item de assistente do turno (um turno com ferramentas tem vários), e só se a pergunta tiver `contextosTela` com foco. Presença fixa por resposta, sem mudar tamanho.
- As ações por bloco aparecem com o mouse sobre o bloco e com o foco do teclado, num espaço reservado à direita, sem empurrar o texto.
- Visuais da resposta (`![[imagem]]`): o bloco que tem um embed é guardado como texto; conferir no WP3 se a nota mostra o embed.

Guardar na nota:
- Alvo: a nota em foco. Se a aba em foco é uma lição, abre um seletor curto com as notas da matéria (ação "listar" da ponte de notas) e "Nova nota" (passa por `conferirTitulo` e `criarNota`; é uma nota do Breno, não "do professor", até a parte D definir a tag).
- Nota aberta no editor: o trecho entra no buffer (pelo mesmo parser de editor-nota.ts) e o salvamento automático grava. Nunca gravar no disco por fora, porque o próximo salvamento daria `ErroConflito`. Com o editor em conflito, somente leitura ou com salvamento em andamento (`emVoo`): espera ou recusa com aviso.
- Nota fechada: a extensão lê, acrescenta e grava na fila da nota (`naFila`, com a `versao`), e a tela apaga a cópia daquela aba no Vendo, que ficou velha.
- Aceito, e escrito: uma nota aberta em outra aba do navegador gera conflito, como já acontece hoje.
- Formato do que entra (função pura em profiles/estudos/lib/trecho-guardado.ts, com testes; a parte D usa o mesmo): uma citação em markdown com o texto do bloco, a linha "Professor, conversa de <dd/mm/aaaa>" e um id curto da conversa num comentário HTML (`<!-- conversa:abc123 -->`). A marca "do professor" e a rota para abrir a conversa pelo id são da parte D.
- Evento: verbo novo `guardou_na_nota` em lib/eventos.ts (VerboEvento), no eventos.jsonl da matéria, com `{materia, titulo, sessao, tamanho}`. Com o editor aberto quem grava é a tela, por `interface:acao` no painel "notas" (ação `guardou`), mandando o id da sessão, que a extensão confere. `acaoDaInterface` lança erro durante a troca de sessão: a tela tenta de novo uma vez ou avisa. O `editou_nota` da mesma abertura continua contando como hoje.


## 6. Pacotes

WP0, orquestrador (com Haiku no mecânico). Tipos e testes pendentes, nada de comportamento:
- origem-mesa.ts (formatarOrigem, lerOrigem, abaDoCaminho/chaveDaFonte ignorando "?") com os testes de verdade, porque é puro e é o centro do contrato;
- ancora.ts (assinatura da resolução) e os tipos de ComandoMesa e PAINEL_MESA, mais a entrada em paineis/src/index.ts com foraDaArea;
- a assinatura de irPara(alvo) e o contexto React da mesa (só tipos);
- rodapeDaResposta e acoesDoBloco em telas-iniciais.ts, Conversa.tsx e Markdown.tsx (só tipos);
- o verbo guardou_na_nota e a assinatura de trecho-guardado.ts;
- testes pendentes (it.todo) para o resto.
Parada 0: o Breno lê este contrato.

WP1, Sonnet, em paralelo com o WP2. Arquivos: profiles/estudos/extensions/mesa.ts e mesa.test.ts (novos), profiles/estudos/lib/trecho-guardado.ts e teste, lib/eventos.ts (só o verbo), extensions/notas.ts (a ação `guardar` na fila e `guardou`), profile.json (a extensão), AGENTS.md do perfil (a regra de quando usar). Aceite: testes com pi falso (conferência no disco, recusa sem matéria, `gravar: false`, nota fechada gravada na fila, evento).

WP2, Opus, o pacote mais arriscado. Arquivos: MesaEstudo.tsx, AbasMesa.tsx, abas-mesa.ts, vendo.tsx e vendo.ts, BarraSelecao.tsx, selecao.ts, EditorNota.tsx (destaque, âncora e `inserirNoBuffer`), TelaModulo.tsx, TermosModulo.tsx, ancora.ts, estilo.css/mesa.css do perfil. Entrega: o consumidor dos comandos, a vaga de prévia, a âncora, o destaque, a rolagem contra a âncora e o irPara. Parada 1 da C1 logo depois: o Breno vê o professor abrir, rolar e destacar.

WP3, Sonnet, depois do WP2 e do WP1. Arquivos: packages/ui/src/visual/Conversa.tsx e Markdown.tsx, telas-iniciais.ts, apps/web/src/telas/PainelConversa.tsx, profiles/estudos/paineis/src/ (o rodapé "Ir ao trecho", o seletor e as ações "Guardar na nota"). Aceite: tela cheia sem diferença (R7 da mesa), sem querySelector no envio, ações sem mudar tamanho.

Haiku: registro do painel, verbo, testes puros de origem-mesa (já no WP0), filemap e PLANO.

Parada 3 (C1): o Breno testa abrir, destacar, Ir ao trecho entre abas (gravando a tela a cada 15 ms), Guardar na nota com a nota aberta e fechada, trecho que mudou, reabrir a conversa sem repetir comandos.
Fim: /code-review, roteiro docs/teste-mesa-c.md, filemap e PLANO.

Testes que o contrato exige: origem-mesa (formato, limite de 500, antigas), ancora (exato, com contexto, normalizado, KaTeX, cai no bloco), trecho-guardado, fatiamento por posição, extensão com pi falso, consumidor que ignora histórico e troca de sessão, DOM (destaque sem sujar a nota; rolagem guardada contra a âncora; sem piscar na troca de aba).
