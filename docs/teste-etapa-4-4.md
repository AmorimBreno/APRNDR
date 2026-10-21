# Teste do item 4.4: mapa de conteúdo

Objetivo: confirmar que o mapa de conteúdo da matéria é montado pelo modelo a partir dos materiais (pelo botão Mapear e sozinho quando um material novo fica pronto), que a revisão (tirar, trazer de volta, prioridade, ordem, nome e descrição, conceito novo) funciona e nunca é desfeita por um mapeamento, que a aprovação e a situação depois de mexer aparecem, que um material apagado deixa os conceitos sem fonte, e que o professor lê o mapa. O contrato está em docs/mapa-conteudo.md.

Tempo: uns 30 minutos. Custo esperado: alguns centavos de dólar. O mapeamento usa o Sonnet 5.5 (uma aula curta custou US$ 0,0092 no teste); a seção mostra o custo estimado antes de mapear. "Refazer o mapa" custa de novo o mesmo que o primeiro mapeamento. A pergunta ao professor custa alguns centavos.

Os passos usam a matéria Ciência de Dados (os 3 arquivos que já estão lá) e uma matéria de teste, "Teste do mapa", criada no passo 6 e apagada no fim pelo Explorador (a pasta G:\Meu Drive\estudos-dados\materias\teste-do-mapa).

Você vai precisar de um material pequeno para a matéria de teste: um markdown ou um PDF curto (uma ou duas páginas) sobre qualquer assunto.

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo (a extensão do mapa).
2. Abra o Explorador em G:\Meu Drive\estudos-dados\materias. Por quê: alguns passos olham o mapa-conteudo.json e o eventos.jsonl.

Nota: trocar de conversa durante um mapeamento ("Conversar sobre a matéria", "Nova conversa") encerra a sessão do pi e para o mapeamento. O arquivo volta para "Para mapear" e é só clicar em Mapear de novo. Durante os passos de mapeamento, fique no caderno.


## Teste

### Ciência de Dados

1. Abra o app pelo atalho "Estudos" e o caderno de Ciência de Dados. Por quê: a seção nova no índice. O que você deve ver: no índice das seções, "Mapa de conteúdo" com o ícone da lâmpada. Clique nela.

2. Olhe o topo da seção. Por quê: os materiais que já existiam ainda não foram mapeados. O que você deve ver: a situação "Rascunho" e o aviso "Para mapear" com os 3 arquivos e o custo estimado (uns centavos de dólar), com o botão Mapear. Embaixo, "Sem mapa ainda".

3. Clique em Mapear. Por quê: o mapeamento pelo modelo. O que você deve ver: o aviso "Mapeando" com o arquivo, a parte (quando o arquivo é grande) e a fila dos outros, uma barra que enche e o botão Parar. A cada arquivo, os conceitos aparecem na lista. Pode levar alguns minutos.

4. Durante o mapeamento do segundo ou terceiro arquivo, clique em Parar. Depois clique em Mapear de novo. Por quê: parar sem perder o que já foi feito. O que você deve ver: o andamento some; os conceitos dos arquivos que terminaram ficam; o arquivo interrompido e os da fila voltam para "Para mapear". O Mapear de novo termina o resto.

5. Olhe a lista. Por quê: os conceitos em ordem, com a referência. O que você deve ver: a lista numerada (01, 02…), cada conceito com o nome, a descrição de uma frase e as referências (o arquivo e as páginas ou células). Clique numa referência: a seção Materiais abre com aquele arquivo marcado em âmbar. Volte para o Mapa de conteúdo.

### Mapeamento automático

6. Volte para as matérias, crie a matéria "Teste do mapa", abra o caderno dela e a seção Mapa de conteúdo. Por quê: a seção vazia. O que você deve ver: "Sem mapa ainda", sem "Para mapear".

7. Na seção Materiais da matéria de teste, adicione o material pequeno e espere ele ficar "Pronto". Volte para o Mapa de conteúdo. Por quê: um material novo é mapeado sozinho. O que você deve ver: sem clicar em nada, o "Mapeando" com o arquivo e, no fim, os conceitos dele na lista. Os passos 8 a 19 são nesta matéria.

### Revisão

8. Clique no nome de um conceito, mude o texto e aperte Enter. Depois, num outro, mude e aperte Esc. Depois, num terceiro, mude e clique fora do campo. Por quê: editar no lugar. O que você deve ver: com Enter, o nome novo fica; com Esc, o nome antigo volta; ao sair do campo, o nome novo fica. Faça o mesmo na descrição de um conceito: ela também se edita no lugar.

9. Num conceito, troque a prioridade para Alta; noutro, para Baixa; depois volte um deles para Normal. Por quê: as prioridades. O que você deve ver: a marca da prioridade muda na hora.

10. Use Subir e Descer num conceito. Por quê: mudar a ordem pelos botões. O que você deve ver: o conceito troca de lugar com o vizinho e os números se refazem.

11. Arraste um conceito pela grade de seis pontos à esquerda para outro lugar da lista. Por quê: mudar a ordem arrastando. O que você deve ver: os outros abrem espaço enquanto você arrasta; ao soltar, o conceito fica no lugar novo e os números se refazem.

12. Clique em "Tirar do mapa" num conceito. Por quê: tirar o que não cai. O que você deve ver: ele sai da lista e, embaixo, aparece "Fora do mapa (1)", fechado. Abra: o conceito está lá. Traga de volta: ele volta para a lista no lugar em que estava. Tire de novo um conceito e deixe-o fora.

13. Clique em "Conceito novo", escreva um nome e uma descrição e aperte Enter. Por quê: escrever um conceito à mão. O que você deve ver: o conceito entra no fim da lista, sem referência. Esc fecha o campo sem criar.

14. Apague o conceito escrito à mão. Por quê: só os conceitos escritos à mão podem ser apagados (os do material só saem do mapa). O que você deve ver: ele some da lista e não vai para "Fora do mapa".

### Aprovação

15. Clique em "Aprovar mapa". Por quê: a aprovação. O que você deve ver: a situação "Aprovado" com a data, em verde.

16. Mude qualquer coisa (por exemplo, a prioridade de um conceito). Por quê: a situação depois de mexer. O que você deve ver: a situação passa a "Mudou depois da aprovação", em âmbar, e o botão vira "Aprovar de novo". Aprove de novo.

17. Clique em "Refazer o mapa". Por quê: mapear de novo todos os arquivos sem perder as decisões. O que você deve ver: a confirmação "Refazer o mapa?" com o custo do primeiro mapeamento. Confirme. Depois do mapeamento: o nome que você editou, as prioridades, a ordem e o conceito tirado continuam como você deixou; a situação volta a "Mudou depois da aprovação" se algo mudou.

18. Na seção Materiais, apague o material da matéria de teste. Volte para o Mapa de conteúdo. Por quê: um material que sai. O que você deve ver: os conceitos continuam na lista, cada um com o aviso de sem fonte ("O material de onde ele veio saiu da matéria"); o resumo em cima conta os "sem fonte".

19. Abra a linha do tempo do caderno. Por quê: os eventos do mapa. O que você deve ver: "Mapa atualizado com <arquivo>" (um por mapeamento), "Mapa revisado" (um por abertura da seção em que você mexeu), "Mapa aprovado" e "Mapa sem <arquivo>" (o material apagado).

20. No Explorador, abra materias\teste-do-mapa\mapa-conteudo.json no Bloco de Notas. Por quê: o mapa fica legível na pasta de dados. O que você deve ver: um JSON com tabulação, com "situacao", "aprovadoEm", os conceitos em ordem (nome, descrição, referências, prioridade, origem; "fora": true no que você tirou) e "arquivos" vazio (o material saiu). O formato está em docs/mapa-conteudo.md.

### Professor e erro

21. Volte para Ciência de Dados, clique em "Conversar sobre a matéria" e pergunte "quais conceitos estão no mapa desta matéria?". Por quê: o professor lê o mapa. O que você deve ver: no grupo das ferramentas, a chamada ler_mapa_conteudo; a resposta lista os conceitos do mapa, na ordem.

22. Desligue o Wi-Fi (ou tire o cabo de rede). Na matéria de teste, adicione de novo o material pequeno, espere ficar "Pronto" e vá para o Mapa de conteúdo. Por quê: o erro de rede. O que você deve ver: no topo da seção, o aviso de erro ("Não deu certo", com a mensagem), que dá para fechar; o arquivo fica em "Para mapear". Ligue a rede de novo e clique em Mapear: ele é mapeado.

23. No fim, feche o app e apague a pasta materias\teste-do-mapa pelo Explorador. Por quê: a matéria de teste não é sua.

## Resultado

Anote "ok" ou o que aconteceu:

1. Seção no índice:
2. Para mapear com o custo:
3. Mapear e o andamento:
4. Parar e mapear de novo:
5. Lista e referências:
6. Seção vazia:
7. Mapeamento automático:
8. Editar nome e descrição (Enter, Esc, sair do campo):
9. Prioridade:
10. Subir e descer:
11. Arrastar pela grade:
12. Tirar e trazer de volta:
13. Conceito novo:
14. Apagar conceito escrito à mão:
15. Aprovar:
16. Mudou depois da aprovação:
17. Refazer o mapa:
18. Material apagado, sem fonte:
19. Linha do tempo:
20. mapa-conteudo.json:
21. Professor com ler_mapa_conteudo:
22. Erro de rede:
23. Limpeza:
