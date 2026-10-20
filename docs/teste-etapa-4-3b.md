# Teste do item 4.3, parte B: as notas do caderno

Objetivo: confirmar que cada caderno tem as suas notas em markdown; que o editor mostra o texto formatado e salva sozinho um arquivo legível fora do app; que nada que mudou fora do app é sobrescrito sem você escolher; que trocar o nome, sair e voltar não perdem nada; que uma nota com HTML abre só para leitura; e que o professor lê as notas mas não escreve nelas.

Tempo: uns 25 minutos. Custo: alguns centavos (o passo 14 fala com o professor).

Os passos usam a matéria Ciência de Dados e criam nela duas notas, "Limites laterais" e "Com HTML". No fim, elas podem ficar (são suas) ou ser apagadas pelo Explorador.

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo e com o editor (pacotes novos do TipTap).
2. Abra o Explorador em G:\Meu Drive\estudos-dados\materias\ciencia-de-dados. Por quê: alguns passos olham e mexem no arquivo da nota fora do app.


## Teste

1. Abra o app com o atalho "Estudos", clique no card Estudos e abra o caderno de Ciência de Dados. Na primeira abertura depois de atualizar, a página pode recarregar sozinha uma vez (o Vite preparando o editor). Por quê: confere a entrada. O que você deve ver: no índice da esquerda, "Notas" com "00" (não mais "em breve").

2. Clique em Notas. Por quê: o caderno ainda não tem notas. O que você deve ver: o bloco com o ideograma 書 na cor da matéria, "Nenhuma nota ainda", um texto dizendo que cada nota é um arquivo em notas/ e que o professor pode lê-las, e a tecla "Nova nota".

3. Clique em "Nova nota", escreva "a/b" e aperte Enter. Depois troque por "Limites laterais" e aperte Enter. Por quê: o título vira o nome do arquivo. O que você deve ver: com "a/b", um erro em vermelho dizendo os caracteres que não podem; com "Limites laterais", o editor abre: no topo, "← Notas · Ciência de Dados", o título grande, à direita "Salva às HH:MM" e, no texto, a ajuda "Escreva aqui. “## ” faz um título…". No Explorador aparece a pasta notas com Limites laterais.md (vazio).

4. Escreva usando os atalhos do markdown, um em cada linha: "## Definição" (vira título), "O limite pela **direita** existe quando x_1 < a." (o negrito aparece quando você fecha os asteriscos), "- primeiro" e Enter "segundo" (lista; Enter duas vezes sai), "[ ] revisar para a P1" (tarefa com caixa), "> Entender antes de decorar" (citação), três crases e Enter (bloco de código) e, num parágrafo, "Ver [[Limites]]." (vira uma etiqueta âmbar quando você fecha os colchetes). Teste também Ctrl+B e Ctrl+I num trecho. Por quê: são as formatações da parte B. O que você deve ver: cada coisa formatada como nas respostas do professor; o sublinhado (Ctrl+U) não existe, de propósito.

5. Selecione um trecho com o mouse. Por quê: a barra da seleção. O que você deve ver: uma barra creme logo acima do trecho, com Negrito, Itálico e Título; cada botão aplica no trecho.

6. Pare de digitar e olhe o canto direito do topo. Por quê: o salvamento é sozinho. O que você deve ver: "Mudanças por salvar" enquanto digita, "Salvando…" por um instante uns 1,5 s depois de parar, e "Salva às HH:MM". Abra o Limites laterais.md no Bloco de Notas: o markdown está legível (## Definição, **direita**, - primeiro, - [ ] revisar…, [[Limites]]), com "x_1 < a" escrito assim, sem barras nem &lt;. Feche o Bloco de Notas sem salvar.

7. Saia da nota (← Notas), abra de novo e aperte Ctrl+Z logo em seguida. Por quê: abrir a nota não pode entrar no desfazer. O que você deve ver: nada muda (a nota não fica vazia) e o topo continua "Salva às…".

8. Com a nota aberta no app, abra o arquivo no Bloco de Notas, troque uma palavra e salve. Volte ao app e digite algo na nota. Por quê: o app nunca grava por cima de uma mudança feita fora dele. O que você deve ver: depois de 1,5 s, um aviso âmbar "Mudou fora do app", dizendo que nada foi gravado por cima, com "Recarregar a do arquivo" e "Manter a minha". Clique em "Recarregar a do arquivo": o texto do Bloco de Notas aparece no editor. Repita a mudança no Bloco de Notas, digite no app de novo e, desta vez, clique em "Manter a minha": o arquivo fica com a versão do app.

9. Clique no título, troque para "Limites laterais e infinitos" e aperte Enter. Depois tente "Limites: laterais" e, com o erro na tela, aperte Esc. Por quê: o título é o nome do arquivo. O que você deve ver: com o primeiro, o endereço muda, o arquivo no Explorador passa a se chamar Limites laterais e infinitos.md e o texto continua no editor; com os dois-pontos, um erro em vermelho embaixo do título, e o Esc volta o título de antes. Para os próximos passos, volte o título para "Limites laterais".

10. Digite uma frase no fim da nota e clique logo em "← Notas", sem esperar. Por quê: sair da nota salva o que faltava. O que você deve ver: a lista com "Limites laterais", a prévia já com a frase nova e "agora há pouco"; no Bloco de Notas, a frase está no arquivo.

11. Abra a nota e aperte F5. Por quê: o endereço guarda a nota. O que você deve ver: a mesma nota, com o mesmo texto, depois de recarregar.

12. Clique em Linha do tempo. Por quê: as notas viram eventos. O que você deve ver: "Nota criada: Limites laterais", "Nota editada: …" (uma vez por vez que você abriu a nota e mexeu, não uma por tecla) e "Nota renomeada: …" com "antes: …" embaixo. O índice da esquerda conta as notas.

13. No Explorador, dentro de notas, crie Com HTML.md com o texto "Um <mark>destaque</mark> aqui." (Bloco de Notas, salvar como, tipo "Todos os arquivos"). No app, volte para Notas e abra "Com HTML". Por quê: o editor da parte B não entende HTML e o perderia ao salvar. O que você deve ver: na lista, a prévia "Um destaque aqui." sem a tag; na nota, um aviso "Só leitura", o título travado e o texto sem dar para editar. O arquivo continua com o <mark>.

14. Clique em "Conversar sobre a matéria" e pergunte: "O que eu anotei sobre limites?". Depois peça: "Acrescente uma linha na minha nota de limites dizendo que revisei." Por quê: o professor lê as notas (listar_notas e ler_nota) e não escreve nelas. O que você deve ver: na primeira, "Executou 2 comandos ›" (abrindo: listar_notas e ler_nota, com o texto da nota no resultado) e uma resposta a partir do que está na sua nota; na segunda, ele diz que não mexe nas suas notas (no máximo sugere o texto para você colar). O arquivo não muda.

15. Deixe a janela estreita (metade da tela) e abra a nota. Por quê: a coluna única tem de caber. O que você deve ver: o índice vira uma faixa rolável em cima, o editor ocupa a largura, e a barra da seleção fica dentro da tela.


## Resultado

Anote "ok" ou o que aconteceu:

1. Entrada e contagem:
2. Caderno sem notas:
3. Nota nova e título inválido:
4. Atalhos do markdown e menção:
5. Barra da seleção:
6. Salvar sozinho e arquivo legível:
7. Ctrl+Z depois de abrir:
8. Mudou fora do app (recarregar e manter a minha):
9. Trocar o nome:
10. Sair salva:
11. F5 numa nota:
12. Linha do tempo:
13. Nota com HTML só para leitura:
14. Professor lê e não escreve:
15. Janela estreita:
