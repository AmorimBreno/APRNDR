# Teste do item 4.3, parte A: a tela do caderno

Objetivo: confirmar que cada matéria abre o seu caderno, com a aba tijolo, o índice das seções, a linha do tempo lida dos eventos e os materiais da matéria; que editar a matéria e voltar funcionam; e que a conversa aberta do caderno é da matéria, com a busca nos materiais presa a ela.

Tempo: uns 20 minutos. Custo: alguns centavos (os passos 9 a 12 falam com o professor).

Para os passos 11 e 12 você precisa de uma segunda matéria com algum material (pode ser uma de teste, com um .md curto) e de material na Ciência de Dados (o roteiro do 4.2 já deixa).

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo.


## Teste

1. Abra o app com o atalho "Estudos" e clique no card Estudos. Por quê: o pé da folha mudou. O que você deve ver: a roda com as suas matérias e, no pé, "Abra um caderno para ver a linha do tempo e os materiais da matéria", com as teclas Materiais e "Conversa geral".

2. Com Ciência de Dados no meio da roda, clique em "Abrir". Por quê: é a entrada no caderno. O que você deve ver: a faixa da esquerda sobe como bandeira; a linha tijolo sobe e vira a aba do caderno no topo, enquanto a folha desce e some. A aba tem "Matérias" à esquerda, a capa pequena, "Caderno 01" (e a prova, se tiver), o nome grande, "Editar" e, à direita, "Conversar sobre a matéria".

3. Olhe o resto da tela. Por quê: confere o índice e a linha do tempo. O que você deve ver: à esquerda, "Neste caderno" com Linha do tempo (marcada em âmbar, com o número de eventos), Notas, Materiais (com o número de arquivos), Cursos, Aulas, Resumos e Questionários (estes com "em breve"). À direita, "Linha do tempo" com o dia ("segunda-feira, 19 de outubro") e "09:01 Caderno criado", com o nome embaixo; os eventos entram um depois do outro.

4. Clique em Notas, Cursos, Aulas, Resumos e Questionários. Por quê: as seções que ainda não existem dizem o que vão ter. O que você deve ver: cada uma com um bloco de ideograma na cor da matéria (tijolo para a capa tinta) e um texto do que vai ter e em que item chega.

5. Clique em Materiais. Por quê: os materiais agora moram no caderno. O que você deve ver: a mesma área de soltar e a lista do modal da tela de cadernos. Se você já rodou o roteiro do 4.2, os arquivos estão lá. Se mandar um arquivo agora, quando ele ficar pronto a Linha do tempo ganha "Material adicionado: <arquivo>".

6. Aperte F5 numa seção. Por quê: o endereço guarda o caderno e a seção. O que você deve ver: a mesma seção do mesmo caderno depois de recarregar.

7. Clique em Editar. Por quê: confere a edição da matéria. O que você deve ver: o modal "Editar matéria" com o nome, a cor, o ideograma e a prova atuais e a capa de amostra. Mude a cor e marque uma prova (por exemplo P1 com uma data daqui a uns dias) e clique em Salvar. A aba muda a capa e mostra "P1 em N dias"; a linha do tempo ganha "Matéria editada" com o que mudou. No materia.json da pasta da matéria, a cor e a prova novas; no eventos.jsonl, uma linha alterou_materia.

8. Clique em "Conversar sobre a matéria" na aba. Por quê: a conversa do caderno é da matéria. O que você deve ver: "Abrindo a conversa…" por um instante e a janela de conversa, vazia na primeira vez. No topo, "Estudos · conversa de" e o nome grande "Ciência de Dados" (na conversa geral, fica "Perfil" e "Estudos"). O botão da esquerda da barra diz "Caderno".

9. Mande: "Do que trata esta matéria, pelos materiais?". Por quê: o professor sabe de que matéria é a conversa e busca só nela. O que você deve ver: a linha de ferramenta "Buscar no material" e uma resposta sobre os materiais de Ciência de Dados, sem você dizer o nome da matéria. Clique em "Caderno" na barra: volta para o caderno.

10. Clique de novo em "Conversar sobre a matéria". Por quê: a matéria tem a sua conversa, que continua. O que você deve ver: a mesma conversa do passo 9, com a pergunta e a resposta. No histórico (a faixa da esquerda), abaixo de "Nova conversa": a linha "Outras conversas", com quantas são e uma seta para a direita, fechada; embaixo, "Conversas de Ciência de Dados", aberta, com a conversa do passo 9. Clique em "Outras conversas": a seta gira e as outras conversas aparecem logo abaixo dela (as de outras matérias com uma etiqueta com o nome da matéria). Clique de novo: fecha. A linha das conversas da matéria abre e fecha do mesmo jeito. Na conversa geral é o contrário: a seção de baixo tem as conversas gerais, e "Outras conversas" tem as dos cadernos, com a etiqueta. "Nova conversa" ali cria outra conversa da mesma matéria.

11. Volte para as matérias e abra o caderno da segunda matéria. Clique em "Conversar sobre a matéria" e pergunte por algo que só está nos materiais de Ciência de Dados. Por quê: a busca fica presa ao caderno. O que você deve ver: o professor não acha (a busca diz "em materias/<a segunda matéria>"). Peça "procure em todas as matérias": ele busca de novo em todas e acha nos materiais de Ciência de Dados.

12. Volte para as matérias e clique em "Conversa geral". Por quê: a conversa sem matéria continua existindo. O que você deve ver: a última conversa geral (a de antes deste roteiro, se houver), com "Perfil" e "Estudos" no topo; o botão da esquerda da barra diz "Cadernos". Nela, a busca nos materiais procura em todas as matérias.

13. Clique em "Matérias" na aba de um caderno. Por quê: é a saída do caderno. O que você deve ver: a aba desce e vira de novo a linha tijolo da roda, com a mesma matéria no meio, enquanto a folha sobe e a faixa desce como bandeira.

14. Diminua a janela até ficar estreita. Por quê: confere a tela estreita. O que você deve ver: o índice vira uma faixa de seções lado a lado, sem barra de rolagem aparecendo; a aba esconde "Editar".


## Resultado

Para cada passo, escreva ok ou o que aconteceu de diferente:

1. Pé da folha:
2. Entrada no caderno:
3. Índice e linha do tempo:
4. Seções em breve:
5. Materiais no caderno:
6. F5 numa seção:
7. Editar:
8. Conversa da matéria:
9. Professor sabe a matéria e busca nela:
10. A conversa da matéria continua:
11. Busca presa ao caderno e "todas":
12. Conversa geral:
13. Saída para as matérias:
14. Janela estreita:
