# Padrões de interface

Regras de acabamento para toda tela do app, de qualquer perfil. Vieram dos ajustes da mesa de estudo em 2026-11-10, pedidos pelo Breno: são pequenos detalhes, mas são eles que fazem o app parecer sólido. Valem para código novo e para toda mudança em tela existente, e são conferidos em toda revisão (ver "Como conferir", no fim).


## 1. Estado passageiro só aparece se durar

Um estado passageiro (abrindo, carregando, salvando, mudanças por salvar, trocando) só aparece na tela se durar mais de 1 segundo. Um estado final (salvo, erro, conflito, vazio de verdade) aparece na hora.

Por quê: quase toda troca termina em menos de 1 s. Mostrar "Abrindo…" por 80 ms é só uma piscada que o Breno não consegue ler.

Como: o hook useValorEstavel de @estudos/ui (packages/ui/src/valor-estavel.ts). Exemplo: o rótulo de salvamento da nota (EditorNota.tsx).


## 2. O que está na tela não some durante uma troca

Ao trocar de item (outra nota, outra aba, outra conversa), o que já está na tela fica até o novo estar pronto: o texto antigo continua e só troca quando o novo chega. Um elemento só some, ou fica vazio, se a troca falhar ou passar de um prazo.

Por quê: sumir e voltar é uma piscada. Ficar com o valor antigo por alguns milissegundos não é percebido.

Como: não desmontar o elemento na troca (key estável, hidden em vez de desmontar); guardar o último valor mostrado e passá-lo para o componente seguinte quando ele precisar ser remontado. Exemplos: a pill da aba em foco na conversa (ChipVendo.tsx), o rótulo de salvamento que passa de uma nota para a outra (EditorNota.tsx), o painel do professor fechado continua montado (MesaEstudo.tsx).


## 3. Conteúdo novo só aparece pronto

O conteúdo novo só é mostrado depois de desenhado por inteiro: estilos aplicados, componentes internos montados (as node views do TipTap, fórmulas, imagens com tamanho). Até lá ele fica escondido ocupando o espaço (visibility: hidden, nunca display: none, para o layout não pular), com um prazo (por volta de 400 ms) depois do qual aparece assim mesmo. Então entra com um fade curto.

Por quê: mostrar antes do estilo é ver o conteúdo "cru" por um quadro e depois ele se arrumar.

Como: conferir a condição de pronto a cada quadro (requestAnimationFrame com setTimeout de reserva, porque o requestAnimationFrame para em aba escondida). Exemplo: a página da nota espera cada .react-renderer ter conteúdo (EditorNota.tsx).


## 4. Dado de um item não vaza para outro

Numa troca, durante alguns quadros convivem o item antigo (ainda registrado) e o novo (já em foco). Todo dado que vem de um registro, de uma fonte ou de uma resposta assíncrona precisa conferir a identidade (a chave, o id, a rota) antes de ser usado, não só o tipo.

Por quê: sem isso, o nome da nota anterior apareceu por um instante na aba e na pill da nota nova.

Como: comparar a chave do registro com a do item em foco (MesaEstudo.tsx: o rótulo da fonte só vale se chaveDaFonte(fonte) === chaveAtiva). Respostas que chegam depois de uma troca levam o id de quem pediu e são ignoradas se ele mudou.


## 5. Tamanho estável ao mudar de estado

Um elemento não muda de tamanho só porque mudou de estado (selecionado, em foco, ativo, carregando).

Por quê: a mudança de largura empurra os vizinhos e parece um salto.

Como: destacar com cor, fundo ou borda, nunca com negrito ou padding diferente; reservar o espaço de ícones, pontos e contadores que só aparecem num estado (opacity 0 em vez de não renderizar); larguras mínimas em botões cujo texto muda. Exemplo: o ponto da pill em foco existe em todas as pills (ChipVendo.tsx, mesa.css).


## 6. Medidas acompanham a largura

Tudo o que é medido (altura de um campo que cresce com o texto, posição de algo flutuante, largura de colunas) é medido de novo quando o contêiner muda de tamanho, não só quando o conteúdo muda.

Por quê: na mesa a largura muda ao abrir e fechar o professor; uma medida tirada antes da grade ter largura deixou o título da nota com 518 px.

Como: ResizeObserver no elemento medido. Exemplo: o título da nota (EditorNota.tsx).


## 7. Transições curtas e discretas

Trocas de conteúdo usam um fade curto (por volta de 150 ms, só opacidade). O que não muda (o painel ao lado, a barra do topo) não anima na troca: nada de View Transition da página inteira entre abas do mesmo lugar (EntradaTelaInicial.semTransicao). Com "reduzir movimento" no Windows, nada anima (semMovimento de @estudos/ui).


## 8. Detalhes visuais que se repetem

- Anel de foco só no foco pelo teclado (:focus-visible), nunca depois de um clique.
- Barras de rolagem finas e discretas (scrollbar-width: thin e um polegar de 6 px que fica mais visível no hover), iguais em toda área que rola.
- Seleção e item ativo em âmbar com texto escuro (var(--amber) e var(--on-amber)), como as tags do caderno.


## Como conferir

Em toda revisão de uma mudança de interface (a revisão por diff do orquestrador, o /code-review e o roteiro de teste), passar por estas perguntas:

1. Algum texto de estado passageiro aparece sem esperar 1 s?
2. Numa troca, algo some, fica vazio ou mostra um valor intermediário antes do valor novo?
3. O conteúdo novo pode aparecer antes de estar desenhado?
4. Algum dado vindo de registro, fonte ou resposta assíncrona é usado sem conferir de quem ele é?
5. Algum elemento muda de largura ou altura ao mudar de estado?
6. Alguma medida deixa de ser refeita quando o contêiner muda de tamanho?
7. Alguma transição é longa, desloca o conteúdo ou anima o que não mudou? Ela respeita o movimento reduzido?

Para as perguntas 2, 4 e 5, conferir no navegador e não só no código: fazer a troca e registrar o estado da tela a cada 15 ms (setTimeout, que funciona com o painel do navegador escondido), por exemplo o texto e a largura de cada elemento que muda. A troca está certa quando a lista de estados vistos só tem o antes e o depois, sem nada no meio.

Nos briefs de pacotes de interface (docs/mesa-de-estudo.md e o método multiagente), os critérios de aceite citam este arquivo.
