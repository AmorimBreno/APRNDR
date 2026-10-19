# Teste do item 4.3, parte A: a tela do caderno

Objetivo: confirmar que cada matéria abre o seu caderno, com a aba tijolo, o índice das seções, a linha do tempo lida dos eventos e os materiais da matéria, e que editar a matéria e voltar funcionam.

Tempo: uns 10 minutos. Custo: nenhum (não fala com o professor).

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo.


## Teste

1. Abra o app com o atalho "Estudos" e clique no card Estudos. Por quê: o pé da folha mudou. O que você deve ver: a roda com as suas matérias e, no pé, "Abra um caderno para ver a linha do tempo e os materiais da matéria", com as teclas Materiais e Conversar com o professor.

2. Com Ciência de Dados no meio da roda, clique em "Abrir". Por quê: é a entrada no caderno. O que você deve ver: a faixa da esquerda sobe como bandeira; a linha tijolo sobe e vira a aba do caderno no topo, enquanto a folha desce e some. A aba tem "Matérias" à esquerda, a capa pequena, "Caderno 01" (e a prova, se tiver), o nome grande, "Editar" e, à direita, "Conversar com o professor".

3. Olhe o resto da tela. Por quê: confere o índice e a linha do tempo. O que você deve ver: à esquerda, "Neste caderno" com Linha do tempo (marcada em âmbar, com o número de eventos), Notas, Materiais (com o número de arquivos), Cursos, Aulas, Resumos e Questionários (estes com "em breve"). À direita, "Linha do tempo" com o dia ("segunda-feira, 19 de outubro") e "09:01 Caderno criado", com o nome embaixo; os eventos entram um depois do outro.

4. Clique em Notas, Cursos, Aulas, Resumos e Questionários. Por quê: as seções que ainda não existem dizem o que vão ter. O que você deve ver: cada uma com um bloco de ideograma na cor da matéria (tijolo para a capa tinta) e um texto do que vai ter e em que item chega.

5. Clique em Materiais. Por quê: os materiais agora moram no caderno. O que você deve ver: a mesma área de soltar e a lista do modal da tela de cadernos. Se você já rodou o roteiro do 4.2, os arquivos estão lá. Se mandar um arquivo agora, quando ele ficar pronto a Linha do tempo ganha "Material adicionado: <arquivo>".

6. Aperte F5 numa seção. Por quê: o endereço guarda o caderno e a seção. O que você deve ver: a mesma seção do mesmo caderno depois de recarregar.

7. Clique em Editar. Por quê: confere a edição da matéria. O que você deve ver: o modal "Editar matéria" com o nome, a cor, o ideograma e a prova atuais e a capa de amostra. Mude a cor e marque uma prova (por exemplo P1 com uma data daqui a uns dias) e clique em Salvar. A aba muda a capa e mostra "P1 em N dias"; a linha do tempo ganha "Matéria editada" com o que mudou. No materia.json da pasta da matéria, a cor e a prova novas; no eventos.jsonl, uma linha alterou_materia.

8. Clique em "Conversar com o professor" na aba. Por quê: a conversa volta para o caderno. O que você deve ver: a janela de conversa, com o botão da esquerda da barra dizendo "Caderno". Clique nele: volta para o caderno de Ciência de Dados.

9. Clique em "Matérias" na aba. Por quê: é a saída do caderno. O que você deve ver: a aba desce e vira de novo a linha tijolo da roda, com a mesma matéria no meio, enquanto a folha sobe e a faixa desce como bandeira.

10. Diminua a janela até ficar estreita. Por quê: confere a tela estreita. O que você deve ver: o índice vira uma faixa de seções lado a lado, sem barra de rolagem aparecendo; a aba esconde "Editar".


## Resultado

Para cada passo, escreva ok ou o que aconteceu de diferente:

1. Pé da folha:
2. Entrada no caderno:
3. Índice e linha do tempo:
4. Seções em breve:
5. Materiais no caderno:
6. F5 numa seção:
7. Editar:
8. Conversar e voltar:
9. Saída para as matérias:
10. Janela estreita:
