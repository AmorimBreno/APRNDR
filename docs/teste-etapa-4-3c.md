# Teste do item 4.3, parte C: blocos, decorações e menções das notas

Objetivo: confirmar que o "/" abre o menu de blocos, que cada bloco novo (fórmulas, caixa de destaque, recolhível, definição, pergunta e resposta) aparece formatado e é gravado no formato de docs/notas-formato.md, que o Destaque pinta o texto, e que as menções abrem, criam e acompanham a troca de nome das notas.

Tempo: uns 35 minutos. Sem custo (nenhum passo fala com o professor).

Os passos usam a matéria Ciência de Dados e criam nela as notas "Árvores" e "Entropia". No fim, elas podem ficar (são suas) ou ser apagadas pelo Explorador.

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo (pacotes novos: fórmulas e o menu do "/").
2. Abra o Explorador em G:\Meu Drive\estudos-dados\materias\ciencia-de-dados\notas. Por quê: alguns passos olham o arquivo da nota.


## Teste

1. Abra o app pelo atalho "Estudos", o caderno de Ciência de Dados, a seção Notas, e crie a nota "Árvores". Na primeira abertura depois de atualizar, a página pode recarregar sozinha uma vez. Por quê: a nota nova é onde o resto acontece. O que você deve ver: o editor vazio, com a ajuda "Escreva aqui. “/” abre os blocos…".

2. Digite "/". Por quê: o menu de blocos. O que você deve ver: logo abaixo do cursor, um menu com Texto, Título 1 a 3, Lista, Lista numerada, Checklist, Citação, Código, Divisória, Fórmula em bloco, Fórmula na linha, as quatro caixas, Recolhível, Definição e Pergunta e resposta, cada um com ícone ou sigla e uma dica. Use ↑ e ↓: o item em âmbar acompanha. Aperte Esc: o menu fecha e o "/" fica como texto (apague-o).

3. Digite "/form" (e depois apague e tente "/FÓRM" e "/latex"). Por quê: o filtro não liga para acento nem maiúscula e acha por palavras. O que você deve ver: só as duas fórmulas nos três casos. Com "/xyz", o aviso "Nenhum bloco com esse nome".

4. Com "/form", aperte Enter em "Fórmula em bloco". Escreva no campo "RB = \frac{p}{1 - t} \cdot q", veja a prévia e aperte Ctrl+Enter. Por quê: a fórmula em bloco. O que você deve ver: um modal "Nova fórmula" com o campo de LaTeX e a prévia desenhada enquanto você digita; um LaTeX errado (por exemplo "\frac{p") mostra o erro em vermelho e desliga o Salvar; depois de salvar, a fórmula centralizada na nota. Clique nela: o modal abre de novo, agora "Editar fórmula", com Remover. Cancelar não muda nada.

5. Numa linha de texto, escreva "A área é " e use "/" e "Fórmula na linha" com "\pi r^2". Escreva também, como texto, "Custou R$ 10 e depois R$ 20." Por quê: a fórmula no meio da frase e o cifrão de dinheiro. O que você deve ver: a fórmula pequena no meio da frase; a frase do R$ continua texto. No arquivo (Bloco de Notas), "$\pi r^2$" e "R$ 10 e depois R$ 20" sem barra.

6. Numa linha vazia, use "/" e "Caixa: Atenção" e escreva dentro "Receita bruta inclui os impostos sobre venda." Clique nos três pontos à direita da aba da caixa e escolha "Ideia central". Por quê: a caixa de destaque. O que você deve ver: a caixa âmbar com a aba "Atenção" e o ícone; depois de trocar, verde com "Ideia central". No arquivo, `<div class="caixa ideia">`, uma linha em branco, o texto, outra linha em branco e `</div>`.

7. Use "/" e "Definição": escreva o termo "Entropia", aperte Enter e escreva "Mede o quanto um grupo está misturado." Por quê: o termo e a explicação. O que você deve ver: enquanto o termo está vazio, "O termo" em cinza; depois, o termo em destaque, e o Enter leva direto para a explicação (sem uma linha vazia a mais). Um fio âmbar à esquerda.

8. Use "/" e "Pergunta e resposta": escreva "Qual grupo é mais puro: 9/10 ou 5/10?", Enter, e "O de 9 em 10." Depois clique em "Esconder resposta" e em "Mostrar resposta". Por quê: o flashcard. O que você deve ver: "A pergunta" em cinza enquanto vazia; o Enter abre a resposta e põe o cursor nela; os botões escondem e mostram a resposta (só na tela: o arquivo não muda). No arquivo, `<details class="pergunta">` com a pergunta em `<summary>`.

9. Use "/" e "Recolhível": título "Detalhes da conta", Enter, e um texto. Clique na seta. Por quê: o toggle do Notion. O que você deve ver: a seta gira e o conteúdo some e volta; o título continua à vista.

10. Selecione um trecho com o mouse. Clique em Destaque, depois no "A" tijolo e em Marca-texto. Clique em Limpar. Por quê: as decorações. O que você deve ver: a barra creme com Negrito, Itálico e Destaque; o Destaque abre embaixo uma faixa com Marca-texto, cinco "A" coloridos e Limpar. O trecho fica tijolo, depois também com marca-texto, e Limpar tira os dois. A barra não aparece com uma fórmula selecionada.

11. Numa linha vazia, digite "# " (cerquilha e espaço), Enter; "## ", Enter; "- ", Enter, Enter; "1. ", Enter, Enter; "[ ] ". Por quê: a ajuda de cada bloco, como no Notion. O que você deve ver: enquanto vazio, cada bloco mostra o próprio nome em cinza e já no estilo dele: "Título 1" grande, "Título 2", "• Lista", "1. Lista numerada", a caixa com "Tarefa"; a citação ("> ") mostra "Citação" em itálico. O nome some na primeira letra. Um parágrafo vazio só mostra "Escreva, ou “/” para os blocos" na linha do cursor; dentro da pergunta, "A pergunta" e "A resposta"; na definição, "O termo" e "A explicação".

12. Feche e abra a nota de novo e aperte F5. Por quê: tudo volta igual do arquivo. O que você deve ver: os mesmos blocos, nas mesmas cores e tons; a pergunta volta fechada.

13. Numa linha, digite "Ver [[" e depois "Ent". Por quê: a lista das menções. O que você deve ver: um menu com as notas do caderno que batem e, no fim, "Ent" com a dica de nota que ainda não existe. Aperte Esc, apague o "[[Ent" e digite "[[Entropia]]" inteiro: ao fechar os colchetes, vira uma etiqueta tracejada (a nota ainda não existe).

14. Clique na menção tracejada "Entropia" e depois em "Criar e abrir". Por quê: criar a nota pela menção. O que você deve ver: o modal "Criar esta nota?"; depois, a nota Entropia aberta (vazia). Volte para Árvores: a menção não está mais tracejada. Clique nela: abre a nota Entropia.

15. Em Entropia, escreva "Ver [[Árvores]]." Abra Árvores e troque o título para "Árvores de decisão". Por quê: renomear atualiza as menções. O que você deve ver: no arquivo de Entropia, "[[Árvores de decisão]]"; na Linha do tempo, "Nota renomeada: Árvores de decisão" com "antes: Árvores · menções atualizadas em Entropia".

16. No Explorador, crie uma nota com HTML que o app não conhece, por exemplo "Teste.md" com "<b>negrito em HTML</b>", e abra no app. Por quê: o resto do HTML continua protegido. O que você deve ver: "Só leitura"; o arquivo não muda. Uma nota só com os blocos deste roteiro abre editável.


17. Abra uma nota. Por quê: a página no estilo do Notion. O que você deve ver: em cima, uma faixa fina com "← Notas · Ciência de Dados" e "Salva às…"; o título grande no topo da página, escrito como você digitou (sem caixa alta), que quebra a linha se for longo; o texto numa coluna no meio, com margem dos dois lados.

18. Passe o mouse sobre um parágrafo, um título e a caixa. Por quê: a alça dos blocos. O que você deve ver: o bloco ganha um fundo leve (a caixa não, ela já tem cor) e, na margem esquerda, um "+" e a grade de seis pontos. O "+" abre uma linha nova logo abaixo com o menu de blocos aberto. Clique nos seis pontos: o menu com "Transformar em" (Texto, Títulos, Listas, Checklist, Citação) e "Bloco" (Duplicar, Mover para cima, Mover para baixo, Apagar); experimente Mover para baixo e Duplicar. Depois arraste os seis pontos de um bloco para outro lugar: ele muda de lugar e fica com uma moldura âmbar.

19. Digite "/". Por quê: o menu novo. O que você deve ver: os blocos em grupos com título (Texto, Listas, Matemática, Destaques, Estudo), cada um com o atalho de digitação à direita (#, ##, -, 1., [ ], >, ```, $ $…). Com a janela larga, o menu fica ao lado da coluna de texto, na altura da linha; com a janela estreita, à direita do que você escreve, na mesma linha. Nos dois casos, a linha em que você digita fica à vista.

20. Numa nota de Ciência de Dados (que já tem materiais), digite "[[" e parte do nome de um material (por exemplo "ML5"). Por quê: mencionar arquivos. O que você deve ver: o menu ao lado, com o grupo "Anotações" (etiqueta âmbar "Anotação") e o grupo "Arquivos de material" (etiqueta "Arquivo" e o tipo, como "Notebook em materiais/"). Escolha o arquivo: aparece uma etiqueta com um clipe e o nome. No arquivo da nota, `[[materiais/<nome do arquivo>]]`. Clique na etiqueta: a seção Materiais abre com o arquivo marcado em âmbar.

## Resultado

Anote "ok" ou o que aconteceu:

1. Nota nova:
2. Menu do "/":
3. Filtro sem acento:
4. Fórmula em bloco e o modal:
5. Fórmula na linha e o R$:
6. Caixa e troca de tom:
7. Definição:
8. Pergunta e resposta:
9. Recolhível:
10. Destaque:
11. Ajuda de cada bloco:
12. Reabrir e F5:
13. Lista do [[:
14. Criar pela menção:
15. Renomear atualiza menções:
16. HTML desconhecido só para leitura:
17. Página no estilo do Notion:
18. Alça dos blocos (+, menu, arrastar):
19. Menu em grupos e ao lado:
20. Menção a arquivo de material:
