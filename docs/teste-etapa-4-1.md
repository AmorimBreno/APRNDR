# Teste do item 4.1: matérias e cadernos

Objetivo: confirmar que as matérias viram pastas legíveis na pasta de dados, que cada criação grava um evento, que a tela de cadernos lista e cria matérias pela ponte e que o professor também lista e cria matérias com as ferramentas novas.

Tempo: uns 15 minutos. Custo esperado: menos de US$ 0,10 (só os passos 9 e 10 falam com o professor).

As matérias que você criar aqui são de verdade: ficam em G:\Meu Drive\estudos-dados\materias. Crie as matérias que você está cursando, com as datas de prova que já souber. Ainda não há como apagar uma matéria pelo app; se precisar, apague a pasta dela à mão.

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C e feche o terminal. Se estiver em dúvida, use o atalho "Parar Estudos" da área de trabalho. Por quê: o atalho sobe o app sozinho, e as portas 7430 e 7431 precisam estar livres.

2. Confira se o Google Drive está aberto e se a pasta G:\Meu Drive\estudos-dados abre no Explorador. Por quê: as matérias são gravadas nela.


## Teste

### Tela de cadernos

1. Abra o app com o atalho "Estudos" e clique no card Estudos. Por quê: a tela de cadernos agora abre a sessão do perfil para falar com a extensão de matérias. O que você deve ver: a faixa escura com "00 Cadernos"; na folha, por um instante, "Abrindo os cadernos…" e depois a folha pautada com uma linha tijolo no meio: o quadrado tracejado com +, "Comece pelo primeiro caderno", "NOVA MATÉRIA" e a tecla "Criar". No pé, "Por enquanto, abrir um caderno leva à conversa com o professor".

2. Clique em "Criar" (ou aperte Enter com a lista em foco). Por quê: confere o modal de matéria nova. O que você deve ver: o modal com a faixa âmbar "Nova matéria"; os campos Nome, "Cor da capa" (seis capinhas: musgo, âmbar, aço, tinta, creme e sálvia), "Ideograma" (uma grade de ideogramas), Prova e "Data da prova" (com "Opcional. Dá para marcar depois."); à direita, uma capa grande inclinada. Escreva um nome, troque a cor e o ideograma: a capa grande muda junto, com a primeira palavra do nome na etiqueta e "No. 01". "Criar caderno" fica apagado enquanto o nome estiver vazio ou só com espaços. Esc fecha sem criar.

3. Crie uma matéria que você está cursando, com o nome da prova (por exemplo P1) e a data dela. Por quê: confere a criação pela tela. O que você deve ver: o botão diz "Criando…" por um instante, o modal fecha e a matéria aparece na linha tijolo, com a capa na cor e no ideograma que você escolheu, "Caderno 01 · P1 em N dias" (ou "hoje", "amanhã") e a tecla "Abrir". A faixa e o cabeçalho passam a dizer 01. A linha "Nova matéria" fica embaixo, com "Um caderno novo".

4. Abra G:\Meu Drive\estudos-dados no Explorador. Por quê: os dados são seus e precisam ser legíveis. O que você deve ver: as pastas materias e aprendiz. Em materias, uma pasta com o nome da matéria sem acento, em minúsculas e com hífen (por exemplo calculo-i). Dentro dela, só dois arquivos: materia.json (abra no Bloco de Notas: id, nome, cor, glifo, provas e criadaEm, um campo por linha) e eventos.jsonl (uma linha só, com "verbo":"criou_materia", a data e hora, a sessão e o que foi criado).

5. Crie uma segunda matéria sem data de prova, escrevendo o nome e apertando Enter no campo. Por quê: confere o Enter e a matéria sem prova. O que você deve ver: o modal fecha e a nova fica na linha tijolo, com "Caderno 02" e sem prova. A capa de amostra do modal dizia "No. 02".

6. Gire a roda do mouse sobre a lista e use as setas para cima e para baixo. Por quê: confere a SubjectWheel. O que você deve ver: cada giro anda uma linha e a do meio vira tijolo, com a capa inclinada. Nas linhas que não estão no meio, a matéria com prova mostra a data à direita (por exemplo "20 nov"). Clicar numa linha que não está no meio traz ela para o meio.

7. Com uma matéria no meio, clique em "Abrir". Por quê: por enquanto o caderno é a conversa (o caderno de verdade é o item 4.3). O que você deve ver: a faixa sobe como bandeira e a janela de conversa abre. Na tecla "Painéis", não aparece nenhum card "Cadernos".

8. Clique em "Cadernos" na barra tijolo. Por quê: a lista é pedida de novo ao voltar. O que você deve ver: as duas matérias, na ordem em que foram criadas.

### Professor

9. Na conversa, mande: "Quais matérias eu tenho?". Por quê: confere a ferramenta listar_materias. O que você deve ver: uma linha de ferramenta "Listar matérias" e a resposta com as duas matérias e a prova que você marcou.

10. Mande: "Crie a matéria" com o nome de mais uma matéria sua e, se souber, a data da prova (por exemplo "Crie a matéria Estatística, com a P1 em 2026-11-27"). Por quê: confere a ferramenta criar_materia. O que você deve ver: uma linha de ferramenta "Criar matéria" e a confirmação com o id. Volte para Cadernos: a terceira matéria está lá, com um ideograma escolhido pelo professor. Na pasta dela, o eventos.jsonl também tem a linha criou_materia.

### Reiniciar

11. Use o atalho "Parar Estudos" e abra de novo com "Estudos". Por quê: as matérias vêm dos arquivos, não da memória do app. O que você deve ver: as três matérias na tela de cadernos, iguais.

12. (Opcional) Saia do Google Drive (ícone na bandeja, engrenagem, Sair) e, no app, volte para Perfis e abra o card Estudos de novo. Por quê: confere o aviso de pasta inacessível. O que você deve ver: "Não consegui abrir os cadernos" com uma mensagem dizendo para conferir se o Google Drive está aberto e sincronizado. Abra o Google Drive de novo, espere o G: aparecer e clique em "Tentar de novo": as matérias voltam.


## Resultado

Para cada passo, escreva ok ou o que aconteceu de diferente:

1. Tela de cadernos vazia:
2. Modal de matéria nova:
3. Criar pela tela:
4. Arquivos na pasta de dados:
5. Segunda matéria com Enter:
6. Roda de matérias:
7. Abrir leva à conversa:
8. Voltar para os cadernos:
9. Professor lista:
10. Professor cria:
11. Reiniciar:
12. Drive fora do ar (opcional):
