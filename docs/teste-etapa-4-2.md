# Teste do item 4.2: materiais

Objetivo: confirmar que os materiais de uma matéria viram texto pesquisável, que as páginas visuais são descritas pelo modelo com visão, que os arquivos extraídos ficam legíveis na pasta de dados e que o professor busca e cita os materiais.

Tempo: uns 20 minutos. Custo esperado: de US$ 0,05 a US$ 0,50, conforme o tamanho do PDF. Cada página visual descrita custa perto de US$ 0,007 com o Sonnet 5.5; páginas só de texto não custam nada. As perguntas ao professor custam alguns centavos.

Você vai precisar de:
- um PDF de slides de uma aula de verdade, de preferência com gráficos ou figuras;
- se tiver, um .py e um .ipynb da matéria;
- a matéria Ciência de Dados (ou outra que você criou).

Os arquivos que você adicionar ficam de verdade em G:\Meu Drive\estudos-dados\materias\<matéria>\materiais. Use materiais da matéria que você quer estudar.

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo.

2. Confira se o Google Drive está aberto e se a pasta G:\Meu Drive\estudos-dados abre no Explorador.


## Teste

### Modal de materiais

1. Abra o app com o atalho "Estudos" e clique no card Estudos. Por quê: a tela de cadernos ganhou a tecla Materiais. O que você deve ver: no pé da folha, as teclas "Materiais" (com um clipe) e "Conversar com o professor". Gire a roda até a linha "Nova matéria": a tecla Materiais fica apagada. Volte para a sua matéria: ela acende.

2. Clique em Materiais. Por quê: confere o modal. O que você deve ver: o modal "Materiais", com o nome da matéria e "0 arquivos" em cima; a área tracejada "Arraste aqui os PDFs das aulas, .py, .ipynb ou markdown", com a pasta do Drive escrita embaixo; e "Nenhum material ainda" com para que servem.

3. Arraste o PDF de slides para a área (ou clique e escolha). Por quê: confere o envio e o processamento. O que você deve ver: o arquivo aparece por um instante com "enviando…" e depois na lista, com "Na fila" e logo "Processando", com a etapa ("lendo a página 3 de 20", "descrevendo a página 7 de 20") e uma barra que enche. No fim: "Pronto", "N trechos · US$ 0,0X com a visão". No pé do modal aparece "Visão nesta matéria: US$ …". Um PDF de 30 páginas leva de um a três minutos, conforme quantas páginas são visuais. Feche o modal no meio, se quiser: o processamento continua.

4. Arraste o mesmo PDF de novo. Por quê: arquivo repetido não é duplicado. O que você deve ver: o aviso "Um arquivo já estava lá, igual: ficou de fora." e a lista igual.

5. Se tiver, arraste um .py e um .ipynb. Arraste também um arquivo de outro tipo (um .docx ou uma imagem). Por quê: confere os outros formatos. O que você deve ver: o .py e o .ipynb ficam prontos em segundos (sem custo, a não ser que o notebook tenha gráficos nas saídas); o outro aparece como "Não suportado".

### Arquivos na pasta de dados

6. Abra no Explorador G:\Meu Drive\estudos-dados\materias\<matéria>. Por quê: os dados são seus e precisam ser legíveis. O que você deve ver: em materiais, os arquivos que você mandou; ao lado, a pasta .extraido (pode estar oculta: no Explorador, Exibir, Mostrar, Itens ocultos), com uma pasta por arquivo. Na do PDF: manifesto.json e um pagina-NNN.md por página. Abra no Bloco de Notas uma página que era um gráfico: em cima, o cabeçalho com "origem: visao" e o modelo; embaixo, a transcrição e a descrição do gráfico em português.

7. Abra o eventos.jsonl da matéria. Por quê: cada material vira um evento. O que você deve ver: uma linha "adicionou_material" para cada arquivo pronto, com o nome do arquivo, o tipo, os trechos e o custo (o não suportado não gera evento).

8. Copie um outro arquivo (um .md com algumas anotações, por exemplo) direto para a pasta materiais pelo Explorador, sem passar pelo app. Por quê: a pasta também é observada. O que você deve ver: em até 30 segundos o arquivo aparece no modal e fica pronto.

### Professor

9. Feche o modal, clique em "Conversar com o professor" e pergunte algo que está nos slides, citando a matéria. Por exemplo: "Segundo os slides de Ciência de Dados, o que é <um tema da aula>?". Por quê: confere as ferramentas buscar_material e ler_material. O que você deve ver: linhas de ferramenta "Buscar no material" e, provavelmente, "Ler material"; a resposta usa o conteúdo dos slides e diz de onde veio (o arquivo e a página).

10. Pergunte sobre um gráfico ou uma figura dos slides: "O que mostra o gráfico da página N?". Por quê: confere que a descrição da visão chega ao professor. O que você deve ver: a resposta descreve o gráfico como ele é no slide.

### Mudar, reprocessar e apagar

11. Volte para os cadernos e abra Materiais. Clique no botão de processar de novo (as setas em círculo) do .py ou do .md. Por quê: confere o reprocessar. O que você deve ver: o arquivo volta para "Na fila", processa e fica pronto de novo. (Evite reprocessar o PDF: as descrições da visão são refeitas e custam de novo.)

12. Apague pelo Explorador o .md que você copiou no passo 8. Por quê: arquivo apagado sai do índice. O que você deve ver: em até 30 segundos ele some do modal; a pasta dele dentro de .extraido também some; o eventos.jsonl ganha uma linha "removeu_material".

### Reiniciar

13. Use "Parar Estudos" e abra de novo. Abra Materiais. Por quê: nada é processado de novo sem mudança. O que você deve ver: a lista igual, tudo "Pronto", sem passar por "Na fila" e sem custo novo. Pergunte de novo ao professor sobre os slides: ele acha.

14. (Opcional) Com o app parado, apague a pasta %LOCALAPPDATA%\estudos-app\indice e abra o app de novo. Por quê: o índice é derivado e se reconstrói. O que você deve ver: tudo "Pronto" sem processar de novo; o professor continua achando os trechos.


## Resultado

Para cada passo, escreva ok ou o que aconteceu de diferente:

1. Tecla Materiais:
2. Modal vazio:
3. PDF enviado e processado (tempo e custo):
4. PDF repetido:
5. .py, .ipynb e não suportado:
6. Pasta .extraido:
7. Eventos dos materiais:
8. Arquivo copiado pelo Explorador:
9. Professor busca e cita:
10. Gráfico descrito:
11. Processar de novo:
12. Arquivo apagado:
13. Reiniciar:
14. Índice reconstruído (opcional):
