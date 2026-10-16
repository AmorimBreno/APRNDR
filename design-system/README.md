APRNDR é a interface de um app de estudos com IA: um tutor que dá aulas ao vivo adaptadas a quem estuda, cadernos por matéria e cursos em módulos com questionários. O visual junta painel de máquina antiga e pôster vintage: fundo quase preto, blocos de cor chapada com cantos grandes, letra larga e pesada nos títulos, letrinhas técnicas em caixa-alta, adesivos de papel e ideogramas enormes como ornamento.

## Princípios

- Pôster, não planilha. Cada tela tem um bloco de cor protagonista e muito fundo escuro em volta. Monte painéis em bento: blocos de tamanhos diferentes num grid com `space-4` de vão sobre `surface-ground`.
- A aula é um documento, não um chat. O tutor escreve a aula numa coluna única, bloco a bloco; você responde e pergunta no meio da página, e no fim sai um resumo para revisar.
- Sempre dá para saber onde você está: a aba do curso mostra a etapa na trilha, e a régua na margem mostra o bloco dentro da aula.
- Cor tem função fixa (veja Cor). Nunca pinte um bloco só para enfeitar com uma cor que tem significado de estado.
- Ler vem antes de enfeitar: o texto da aula é grande (`lesson-body`, 19/32) numa coluna de `measure-read` (720px).
- Certo e errado nunca dependem só de cor: sempre ícone e palavra.
- Todo número diz o que é. Nada de siglas ou letras soltas em medidores e fichas: "Progresso 62%", "Questões restantes 12".

## Voz e texto

- Português do Brasil, segunda pessoa ("você"), frases curtas. O tutor fala como um monitor paciente: um passo por vez, exemplo concreto, e cada bloco termina dizendo o que vem a seguir.
- Sem emoji, sem "Ótima pergunta!", sem exclamações em série. Elogio só quando há algo específico para elogiar ("Boa base. Faltou fechar com o limite.").
- Rótulos de bloco são substantivos: "Explicação", "Exemplo", "Pergunta", "Resposta", "Reexplicação", "Revisão". As notas do aluno dizem quem fez o quê: "Você perguntou", "Você pediu", "Sua resposta".
- Botões: verbo primeiro, até três palavras — "Enviar resposta", "Próxima", "Reexplicar", "Encerrar aula", "Criar plano".
- Feedback de questão: "Correta", "Ainda não", "Quase lá". Diga o que estava certo antes do que faltou. Nota baixa recomenda revisão; nunca bloqueia.
- Erros dizem como resolver: "Cole o link completo, começando com https://", "Escreva pelo menos 80 caracteres."
- Telas vazias dizem o que falta e para que serve: "Nenhum caderno ainda — cadernos guardam suas anotações, os resumos do tutor e os questionários de cada matéria."
- Caixa-alta é só de interface: os estilos `display-*`, `button` e `overline` já transformam. Escreva o texto normal no código ("Enviar resposta"). Conteúdo gerado pelo tutor nunca vira caixa-alta — muda o sentido de variáveis e siglas.
- Números de painel com dois dígitos ("03/10", "Módulo 03"); decimais com vírgula ("2,47 min", "7,5/10").

## Cor

Um tema só, escuro, com uma folha clara para a lista de cadernos.

- Superfícies, do fundo para cima: `surface-ground` (fundo do app, vãos do bento, faixa da barra da aula) → `surface-panel` (painéis, corpo de modal) → `surface-raised` (campos, alternativas, botão secundário) → `surface-hover` (hover). `surface-well` é o poço: blocos de código, trilhos, área de soltar arquivos.
- `paper` é o branco do sistema (quente, nunca #fff): a folha da lista de cadernos e a borda dos adesivos. Sobre ela, texto `on-paper` e `on-paper-muted`, divisória `paper-line`, hover `paper-hover`.
- Texto no escuro: `ink` principal, `ink-muted` secundário, `ink-subtle` placeholder e horários.
- As seis cores de marca, cada uma com um papel:
  - `amber` — ação e foco. Botão primário (um por tela), item ativo, alternativa selecionada, etapa atual da trilha, cursor do tutor escrevendo, anel de foco.
  - `brick` — a linha selecionada na lista e a aba do curso (a mesma cor, porque uma vira a outra), erro, resposta errada, ação destrutiva e o ponto de sinal da marca. Texto vermelho no escuro é `brick-text`.
  - `sage` — acerto e progresso (barras de medidor, alternativa correta). Como texto, use `sage-text`.
  - `moss` — conteúdo de estudo: o callout Ideia central, o resumo da aula, capas e cards de matéria, o módulo próximo.
  - `cream` — a voz do aluno (as notas coladas na aula), cards claros, teclas A–D das alternativas.
  - `steel` — a voz do tutor (a tag de tipo de cada bloco), o callout Exemplo e cards de estatística.
- Texto sobre uma cor é sempre o `on-<cor>`: escuro (`ink-inverse`) sobre `amber`, `sage`, `cream`, `steel` e `paper`; claro sobre `brick` (`on-brick`) e `moss` (`on-moss`). Dentro de um bloco colorido não existe texto "secundário" em outra cor: diferencie por tamanho e peso.
- `holo-1` a `holo-6` (rosa, pêssego, manteiga, menta, céu, lilás) são o holográfico: só existem juntos, em faixas que se cruzam como vinil holográfico, com o brilho seguindo o ponteiro. Querem dizer uma coisa só — concluído: o `ModuleCard` concluído e o `Sticker` `holo`. Texto por cima é `ink-inverse` (acima de 7:1 em qualquer ponto).
- Estados de módulo, de longe: concluído = holográfico, em curso = `amber` com adesivo, próximo = `moss`, desativado = sem preenchimento, contorno tracejado em `line-strong`.
- `amber-tint`, `brick-tint` e `sage-tint` são fundos de estado, sempre com texto `ink` por cima. `scrim` é o véu atrás de modais.
- `<cor>-pastel`, `<cor>-line` e `<cor>-deep` (para âmbar, tijolo, sálvia, musgo, creme e aço) são só das tags: pílula clara, contorno de 2px na cor e texto escuro (6,4:1 no pior caso). São o único lugar em que o tema escuro usa fundos claros pequenos, além do papel e das notas.
- Contraste: todo par de texto passa 4,5:1 (o mais justo é `on-sage` sobre `sage`, 4,8:1). `line-strong` (borda de controle) e o anel de foco passam 3:1 em todas as superfícies. `line` e `paper-line` são só decorativos.
- O dígito em `brick` do `Stat` só vai sobre fundo escuro ou `cream`.

## Tipografia

Cinco famílias e um ornamento, cada um com uma função. Use as classes de estilo (`.lesson-body`, `.overline`…) em vez de tamanhos soltos.

- `display` — Unbounded, larga e pesada: títulos (`display-lg`, `display-md`, `display-sm`), números-pôster (`display-xl`), rótulos de botão (`button`), o texto dos adesivos e o nome do app. Sempre caixa-alta, menos números.
- `sans` — Archivo: tudo o que se lê. `lesson-body` no texto da aula, `body-lg` em leitura de painéis e nas notas do aluno, `body` e `body-strong` na interface, `body-sm` em ajudas e legendas, `heading` em títulos dentro do conteúdo e enunciados. As tags usam Archivo seminegrito (14px, ou 13px na pequena), em caixa normal.
- `mono` — Sono, monoespaçada e redonda: a voz de painel nos textos pequenos. `overline` para rótulos de campo, cabeçalhos e legendas (caixa-alta espaçada); `data` para contadores e horários; `code` para código.
- `numbers` — IBM Plex Mono 500, só nos números grandes: `data-lg` nas leituras em caixa (`Readout`) e `data-xl` na porcentagem e na nota dentro de cards (`Stat variant="figure"`). Nunca em texto pequeno.
- `serif` — Fraunces: só destaques editoriais. `quote` na frase da Ideia central e em citações; `lead` no parágrafo de abertura da aula. Nunca em interface.
- `ornament` — Zen Antique recortada com os ideogramas do `Ornament`; use só por ele e pelas capas de caderno.
- Hierarquia típica de tela: `overline` (onde estou) → `display-*` (o título) → `lead` ou `lesson-body`.
- As fontes estão em `fonts/` (woff2, licença OFL em `licenses/fonts-OFL.txt`). Os recortes latinos cobrem todo o português.

## Forma, espaço e camadas

- Espaço em base 4: `space-1` (4px) a `space-16` (64px). Vão do bento `space-4`, padding de card e de modal `space-6`, entre seções `space-8`, entre blocos da aula 44px.
- Raios: `radius-lg` em cards, modais e callouts; `radius-xl` em blocos-pôster e na folha de cadernos; `radius-md` em botões, campos, alternativas e notas; `radius-sm` em caixas técnicas e código; `radius-xs` em checkbox e teclas; `radius-full` em tags, chips, switches e pontos.
- O `Callout` tem formato de pasta: a aba do título à esquerda, um degrau suave (curva, diagonal, curva) e, à direita, a aba preta dos três pontos com borda de 2px na cor do callout.
- Contorno no lugar de sombra. Caixas dentro de cards (`SpecBox`, `Readout`, barras do `Meter`) e o filete do rodapé usam o traço grosso `border-strong` (2px) na cor do texto do card. Controles usam `border-control` (1.5px); divisórias, `border-hair` (1px).
- Sombras: `focus-ring`, o lábio de tecla (`key-lip`, `key-lip-pressed`) dos botões preenchidos, das teclas A–D e da etapa atual, e `sticker-shadow`, só para papel colado (adesivos, notas do aluno, capas de caderno). Nada de sombra suave em cards, degradê ou desfoque — a única exceção é o holográfico do que foi concluído.
- Tamanhos de layout: `course-bar` (96px), `menu-rail` (300px), `wheel-row` (128px), `measure-read` (720px). Controles: `control-sm` 32px, `control-md` 40px, `control-lg` 48px. Modais: `modal-sm`, `modal-md`, `modal-lg`.

## Telas e fluxo

- Menu de cadernos: à esquerda, a faixa escura (`menu-rail`) com `Wordmark`, um `Ornament` vertical e o `Stat` de dias seguidos; à direita, a folha `paper` com a `SubjectWheel`. Cada giro do scroll anda uma linha; a do meio é a selecionada e fica tijolo. A última linha é "Novo plano de estudos", que abre o guia em `Modal` + `Stepper`.
- Entrar numa matéria: a linha tijolo sobe e vira a `CourseBar` (560ms, `cubic-bezier(.65, 0, .25, 1)`), enquanto a folha desce e some e a aula aparece. Voltar ("Matérias") faz o caminho inverso, até a mesma linha. Um plano recém-criado também sobe e vira a aba.
- Aula ao vivo: `CourseBar` no topo (nome do curso e `ProgressTrack` com módulo = livro, questionário = prancheta, teste final = bandeira), `SectionRuler` na margem, a coluna única com `LessonBlock`, perguntas no meio (`QuizQuestion`, `EssayAnswer`, `QuizFeedback`) e as suas `StudentNote`, e a `AskBar` fixa no pé. Os três pontos da Ideia central perguntam sobre a frase (a `AskBar` já vem com ela citada), pedem outra explicação ou um exemplo. "Encerrar aula" gera o `SummaryCard`.
- Questionário do módulo: `QuizProgress` no topo, uma questão por vez, `QuizFeedback` depois de responder.
- Módulos do curso: `ModuleCard` em grade de 2 colunas, um por módulo, na ordem — concluídos (holográficos), o em curso, o próximo e os desativados.
- Painéis e progresso: `Card` em bento com `Sticker` no canto, `SpecBox` com a porcentagem (`Stat variant="figure"`) e `Readout`, `Meter`, `Stat`.
- A página "Fluxo de estudo" (`components/StudyFlow`) junta menu, aba do curso e aula em 1280px e serve de mapa.

## Estados e movimento

- Hover: a superfície sobe um degrau (`surface-hover`, `paper-hover`); preenchimentos ganham um leve brilho.
- Pressionado: desce 1px e o lábio encolhe para `key-lip-pressed`.
- Foco do teclado: `focus-ring` (2px da cor do fundo, depois 2px de âmbar sólido) em tudo que é focável; campos trocam a borda para `focus`.
- Selecionado: `amber-tint` com borda `amber`; na lista de cadernos, a linha tijolo. Desabilitado: `opacity-disabled` nos controles; um módulo desativado fica tracejado e apagado, com cadeado.
- Concluído: o holográfico. O brilho e as faixas seguem o ponteiro (450ms, ease-out) e voltam ao lugar quando ele sai.
- Movimento curto (120–320ms, ease-out), sem bounce. As exceções longas são a roda da lista (320ms) e a linha virando aba (560ms). O cursor do tutor pisca em passos, como terminal antigo. Tudo para com `prefers-reduced-motion`.

## Ícones

- 29 ícones próprios: no app, o componente `Icon`; como arquivo, `assets/Icons/` (lista e usos no README do grupo). Traço de 2px na grade de 24, pontas quadradas, quinas vivas; herdam a cor do texto.
- Tipos de etapa têm ícone fixo: `book` módulo, `checklist` questionário, `flag` teste final. `list` é "Matérias"; `lock`, módulo desativado; `message`, o rótulo Resposta.
- Toda tag com significado fixo leva o seu ícone, só de traço e na cor do texto da tag (lista no README do `Tag`).
- A seta `arrow-up-right` em 52px com traço 4,5 é o gesto gráfico dos cards (abrir, começar).
- Sem emoji e sem ícones de outras bibliotecas.

## Ornamento

- Ideogramas japoneses enormes, em pé, com a tradução em português em `overline` ao lado. Só os do `Ornament` (a fonte é recortada): 学 aprender, 習 praticar, 学習 aprendizado, 知 conhecer, 問 pergunta, 答 resposta, 考 pensar, 解 resolver, 読 ler, 書 escrever, 復習 revisão, 試験 avaliação, 完 concluído, 独創 originalidade, 新 novo, 始 começo, 終 fim, e 一 a 十 para números de módulo.
- Escolha pelo sentido: capa de curso → 学, revisão e resumo → 復習, avaliação → 試験, conclusão → 完, plano novo → 新, módulo 3 → 三. Nas capas de caderno, um ideograma por matéria.
- Lugares: faixa do menu, capas de caderno, telas vazias (`EmptyState`), resumo da aula, tela de conclusão. Um por tela (as capas e os carimbos não contam), dentro de um bloco de cor ou direto no fundo escuro. Nunca em texto corrido.
- O carimbo: 完 em tijolo, num quadrado de traço duplo girado, como o carimbo do professor — só no módulo concluído.

## Marca

- Não existe logo desenhado. A marca é o `Wordmark`: APRNDR em Unbounded 800, caixa-alta, com o ponto `brick` depois do R.

## Código

- Os componentes são React 18+: use `components/bundle.js` (`window.Aprndr`) ou copie `components/src/` para o projeto React + TypeScript. Carregue `tokens.css` e depois `components/bundle.css`. Classes com prefixo `ap-`.
