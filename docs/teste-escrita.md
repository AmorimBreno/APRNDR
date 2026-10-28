# Teste da escrita dos módulos: regras e retorno por bloco

Objetivo: confirmar que a tecla "Escrita" abre "Como o professor escreve"; que dá para criar, editar, ligar, desligar e apagar regras; que o índice do módulo tem o link para as regras; que o "Retorno" no pé de um bloco grava o retorno e pode virar regra; que "Salvar e reescrever o bloco" troca o bloco e guarda a versão anterior; que um módulo novo segue as regras ativas; e que os arquivos e os eventos ficam certos. Também confere o código ao lado com o destaque. O contrato está em docs/escrita.md e em docs/modulos.md.

Tempo: uns 30 minutos. Custo: cada reescrita custa uns 2 centavos de dólar (US$ 0,02). Gerar o módulo novo do passo 25 custa como uma geração normal (uns 10 centavos de dólar).

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo.
2. Tenha um curso com pelo menos um módulo gerado (pelo roteiro docs/teste-etapa-6a.md). Para o passo 25, tenha também um módulo ainda não gerado.
3. Saiba que este roteiro grava de verdade: as regras ficam em aprendiz/escrita.json, e as regras, os retornos e as reescritas viram eventos no aprendiz/eventos.jsonl. Os eventos são só de acréscimo: nada sai de lá depois. Se não quiser misturar com o seu estudo, faça o teste numa matéria de teste.
4. Abra o app pelo atalho "Estudos". O que você deve ver: a tela de cadernos.


## Teste

### As regras na tela de cadernos

1. No pé da tela de cadernos, clique na tecla "Escrita" (junto de Materiais e da conversa). O que você deve ver: o modal "Como o professor escreve", com a linha "Estas regras valem em todo módulo e em toda questão que o professor gerar. Um retorno num bloco também pode virar regra."
2. Sem nenhuma regra ainda, olhe o meio do modal. O que você deve ver: "Nenhuma regra ainda" e o exemplo "Ex.: Comece sempre por um exemplo concreto com números." Se você já tem regras, anote "já tinha regras".
3. Clique em "Regra nova", escreva "Comece sempre por um exemplo concreto com números." e aperte Enter. Por quê: a regra nova. O que você deve ver: embaixo do campo, "Enter salva · Esc fecha · vale para todas as matérias (dá para mudar depois)"; depois do Enter, a regra na lista, ligada e com "Todas as matérias".
4. Clique no texto da regra, mude uma palavra e saia do campo. Por quê: editar no lugar. O que você deve ver: o texto novo fica. Feche e abra o modal: continua o novo.
5. No seletor da matéria da regra, escolha uma matéria. Depois volte para "Todas as matérias". O que você deve ver: o seletor mostra o nome da matéria e depois "Todas as matérias".
6. Desligue a regra no interruptor e ligue de novo. O que você deve ver: "Desligada" e depois "Ligada".
7. Crie uma segunda regra qualquer e clique em "Apagar" nela. Por quê: apagar com confirmação. O que você deve ver: "Apagar esta regra?" com a confirmação; ao confirmar, a regra some. A primeira regra fica.
8. Feche o modal.

### O link no módulo

9. Entre no caderno do curso, abra a visão do curso e clique em "Abrir" num módulo gerado. Olhe o índice das lições, à esquerda. O que você deve ver: o link "Como o professor escreve".
10. Clique no link. O que você deve ver: o mesmo modal, com a regra do passo 3. Feche.

### O retorno num bloco

11. Num bloco de explicação, clique em "Retorno" no pé do bloco. O que você deve ver: o balão "Retorno sobre este bloco" embaixo do bloco, com Bom e Precisa melhorar.
12. Escolha "Bom". O que você deve ver: nenhum motivo para marcar.
13. Escolha "Precisa melhorar". O que você deve ver: os motivos em etiquetas marcáveis ("Longo demais", "Abstrato demais", "Faltou exemplo", "Código sem explicação", "Pulou um passo", "Repetitivo", "Confuso", "Nível errado", "Algo errado"), o campo de texto e o botão "Salvar e reescrever o bloco".
14. Marque "Longo demais" e escreva um texto curto, por exemplo "quero um exemplo antes da definição".
15. Marque "Virar regra de escrita". O que você deve ver: o texto da regra, editável, vindo do seu retorno, e a escolha entre todas as matérias e esta matéria. Deixe a regra em "esta matéria".
16. Clique em "Salvar retorno". O que você deve ver: o balão fecha e aparece "Retorno salvo" no pé do bloco por uns segundos.
17. Clique no link "Como o professor escreve". O que você deve ver: a regra nova na lista, com a matéria do curso e a etiqueta "de um retorno". Feche.

### A reescrita

18. Em outro bloco de explicação, clique em "Retorno", escolha "Precisa melhorar", marque um motivo e clique em "Salvar e reescrever o bloco". Custo: uns 2 centavos de dólar. O que você deve ver: o bloco apagado, com a faixa "Reescrevendo este bloco…", a foto do professor e o "Parar".
19. Espere terminar. O que você deve ver: o bloco novo no lugar, com a etiqueta "Reescrito" (passe o mouse: "Reescrito em dd/mm (versão 2)") e "Ver a versão anterior" no pé.
20. Clique em "Ver a versão anterior". O que você deve ver: o bloco antigo recolhido, só para ler, com a versão e a data. O botão vira "Esconder a versão anterior".
21. Reescreva o mesmo bloco mais uma vez (passos 18 e 19). Custo: mais uns 2 centavos. Abra a versão anterior. O que você deve ver: "Versão 2 de 3" e as setas "Versão mais antiga" e "Versão mais nova"; a seta para a antiga leva a "Versão 1 de 3".
22. Num terceiro bloco, peça a reescrita e clique em "Parar" durante a faixa. O que você deve ver: a faixa some e o bloco fica como estava, sem "Reescrito".
23. Aperte F5. O que você deve ver: os blocos reescritos continuam com "Reescrito" e com as versões anteriores.

### Um módulo novo com a regra

24. Confira no modal que a regra do passo 3 está ligada.
25. Volte à visão do curso e gere um módulo ainda não gerado. Custo: uns 10 centavos de dólar.
26. Abra o módulo e leia as explicações. O que você deve ver: as explicações começam por um exemplo concreto com números, como a regra pede.
27. Anote quantas explicações seguiram a regra e quantas não.

### Os arquivos

28. Abra G:\Meu Drive\estudos-dados\aprendiz\escrita.json num editor. O que você deve ver: as regras, cada uma com id, texto, materia (null para todas), ativa e origem ("escrita" ou "retorno"; a do retorno com o id do retorno).
29. Abra o arquivo do módulo reescrito (materias\<matéria>\cursos\<curso>\modulos\<m>.json) e procure o bloco do passo 21. O que você deve ver: o bloco com "versao": 3 e "reescritoEm"; em "anteriores", as versões 1 e 2, cada uma com "substituidoEm" e o id do retorno.
30. Abra G:\Meu Drive\estudos-dados\aprendiz\eventos.jsonl e vá ao fim. O que você deve ver: criou_regra_escrita (passos 3, 7 e 15), alterou_regra_escrita (passos 4 a 6), apagou_regra_escrita (passo 7), avaliou_bloco (um por retorno) e reescreveu_bloco (passos 18 e 21, com "de", "para" e o custo).


## Código ao lado

Precisa de um bloco de explicação com código de 3 linhas ou mais. Os módulos de programação costumam ter.

31. Abra uma lição com um bloco desses, numa janela larga. O que você deve ver: o texto à esquerda e o código numa coluna à direita.
32. Role o bloco devagar. O que você deve ver: o código fica fixo à vista enquanto o bloco rola.
33. Procure uma linha longa no código. O que você deve ver: a linha quebra, e a continuação fica recuada depois do número da linha, sem barra de rolagem para o lado.
34. No texto, passe o mouse num código citado (um trecho em código em linha). O que você deve ver: um quadrado claro no mesmo trecho no código à direita, e também nas saídas e nos vetores do bloco, se o trecho estiver lá. Um caractere solto não destaca.
35. Deixe a janela estreita (metade da tela ou menos). O que você deve ver: tudo numa coluna só, com o código embaixo do texto.


## Resultado

Anote "ok" ou o que aconteceu:

1. Tecla Escrita abre o modal:
2. Vazio com o exemplo:
3. Regra nova:
4. Editar no lugar:
5. Matéria Todas ou uma:
6. Ligar e desligar:
7. Apagar com confirmação:
8. (fechar):
9. Link no índice do módulo:
10. Link abre o modal:
11. Retorno abre o balão:
12. Bom sem motivos:
13. Precisa melhorar com os motivos:
14. Motivo e texto:
15. Virar regra de escrita:
16. Salvar retorno e Retorno salvo:
17. Regra com "de um retorno":
18. Reescrevendo com o professor e o Parar:
19. Bloco novo com Reescrito:
20. Ver a versão anterior:
21. Versão 2 de 3 e as setas:
22. Parar a reescrita:
23. F5 mantém as versões:
24. Regra ligada:
25. Gerar o módulo novo:
26. Regra seguida:
27. Quantas seguiram:
28. escrita.json:
29. Módulo com versao e anteriores:
30. Eventos:
31. Código à direita:
32. Código fixo ao rolar:
33. Linhas longas quebrando:
34. Quadrado claro no código citado:
35. Uma coluna na janela estreita:
