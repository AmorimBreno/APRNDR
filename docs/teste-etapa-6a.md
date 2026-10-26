# Teste do item 6, parte A: gerar módulo

Objetivo: confirmar que, na visão do curso, só o próximo módulo pode ser gerado; que o formulário funciona (materiais novos, informações, observações, o custo); que o card acompanha a geração e pode parar; que o módulo gerado fica no disco num arquivo legível e o seguinte vira o próximo; que "Ainda não tenho o material deste módulo" deixa o módulo aguardando e avisa quando chega material novo; que a linha do tempo mostra os eventos; e que o professor lê o módulo sem entregar o gabarito. Duas seções à parte conferem o "Recalcular o calendário" e o R$ na conversa. O contrato está em docs/modulos.md, e o dos cursos em docs/cursos.md.

Tempo: uns 40 minutos. Custo esperado: uns 20 centavos a 1 dólar. Cada geração de módulo chama o GPT-6.1 Sol, custa uns 5 a 30 centavos de dólar e leva de 1 a 4 minutos (o teste real deu 2 lições em 110 s por US$ 0,092). O roteiro gera módulos três a quatro vezes.

Os passos podem usar o seu curso "Estudo de Ciência de Dados para Atividade" ou uma matéria de teste com um curso pronto. Se usar o seu curso, os módulos gerados ficam nele (você pode gerar de novo depois). Se usar uma matéria de teste, apague-a no fim pelo Explorador.

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo (a extensão dos módulos).
2. Abra o app pelo atalho "Estudos" e entre no caderno com o curso pronto. Na seção Cursos, clique em "Abrir" no curso. O que você deve ver: a visão do curso, com a ficha e os módulos.
3. Separe um arquivo pequeno (um PDF ou um .py) que ainda não esteja na matéria. Por quê: os passos 17 e 18 mandam material novo.
4. Abra o Explorador em G:\Meu Drive\estudos-dados. Por quê: alguns passos olham a pasta modulos do curso.

Nota: trocar de conversa durante a geração encerra a sessão do pi e para a geração. Durante esses passos, fique na visão do curso, a não ser no passo 9.


## Teste

### O card e o formulário

1. Olhe os cards dos módulos. Por quê: só o próximo pode ser gerado. O que você deve ver: o primeiro módulo ainda não gerado como próximo, com a ação "Gerar módulo"; os seguintes bloqueados, sem ação.

2. Clique em "Gerar módulo". Por quê: o formulário. O que você deve ver: um modal com o título "Gerar o módulo NN · Nome"; o texto "O professor planeja as lições e escreve cada uma com os seus materiais e o que o diagnóstico mostrou. Leva alguns minutos; você pode fechar e voltar."; a área para soltar "Materiais novos para este módulo (opcional)"; "Informações específicas (opcional)" e "Observações (opcional)"; a marcação "Ainda não tenho o material deste módulo"; e o custo aproximado ("Custa por volta de US$ 0,10 a 0,30 com o GPT-6.1 Sol.").

3. Marque "Ainda não tenho o material deste módulo" e desmarque de novo. Por quê: o formulário muda. O que você deve ver: marcado, os campos dão lugar a "Nota (opcional)", o custo some e o primário vira "Marcar como aguardando material"; desmarcado, volta como antes.

### Gerar e acompanhar

4. Em "Observações", escreva "quero um exemplo com código em Python" e clique em "Gerar módulo". Por quê: a geração. O que você deve ver: o modal fecha; embaixo do card, o professor animado, a etapa e uma barra; primeiro "Planejando as lições…", depois "Escrevendo a lição 1 de N", "Escrevendo a lição 2 de N" e assim por diante; o botão "Parar".

5. Espere terminar (de 1 a 4 minutos). Por quê: o card gerado. O que você deve ver: a etiqueta "Gerado" com o resumo ("N lições · M questões"); na leitura do card, "Lições" no lugar de "Conceitos"; a ação "Abrir" com a etiqueta "Em breve" (a visão do módulo é a parte B); "Gerar de novo".

6. Olhe o card seguinte. Por quê: o módulo seguinte vira o próximo. O que você deve ver: o módulo seguinte com "Gerar módulo"; os depois dele continuam bloqueados.

7. No card gerado, clique em "Gerar de novo". Por quê: a confirmação. O que você deve ver: "Gerar este módulo de novo?" com "A versão atual é substituída quando a nova ficar pronta.". Feche sem confirmar: nada muda.

### Parar e fechar no meio

8. No próximo módulo, clique em "Gerar módulo" e em "Gerar módulo" no formulário. Quando aparecer "Escrevendo a lição…", clique em "Parar". Por quê: cancelar. O que você deve ver: "Parando…" e depois o card como antes, com "Gerar módulo"; nenhum arquivo novo na pasta modulos para esse módulo.

9. Gere de novo o mesmo módulo e, durante "Escrevendo a lição…", feche o app pelo atalho "Parar Estudos". Abra o app de novo pelo atalho "Estudos" e volte à visão do curso. Por quê: o estado depois de reabrir. O que você deve ver: o card como antes da geração (com "Gerar módulo"), sem ficar preso em "Escrevendo…"; o módulo anterior continua "Gerado".
   Agora o caso comum: gere de novo e, durante "Escrevendo a lição…", feche só a janela do app (o X), sem o "Parar Estudos". Abra pelo atalho "Estudos" e volte à visão do curso. O que você deve ver: a geração continuou no servidor; o card mostra a etapa em que ela está (ou "Gerado", se já terminou).

### Aguardando material

10. No próximo módulo, abra o formulário, marque "Ainda não tenho o material deste módulo", escreva na nota "a aula sai na quinta" e clique em "Marcar como aguardando material". Por quê: o aguardando material. O que você deve ver: o card com a etiqueta "Aguardando material", a nota e a ação "Gerar agora"; o módulo seguinte vira o próximo, com "Gerar módulo".

11. Abra a seção Materiais da matéria e mande o arquivo separado. Espere ficar pronto e volte à visão do curso. Por quê: o aviso de material novo. O que você deve ver: no card aguardando, o aviso "Material novo" com "Material novo na matéria: gerar agora?".

12. Clique em "Gerar agora" e gere o módulo. Por quê: um módulo aguardando pode ser gerado quando você quiser. O que você deve ver: a geração como no passo 4 e, no fim, "Gerado".

### Material novo pelo formulário

13. No próximo módulo, abra o formulário e solte outro arquivo (ou o mesmo com outro nome) em "Materiais novos para este módulo". Clique em "Gerar módulo". Por quê: a geração espera o material ficar pronto e entrar no mapa. O que você deve ver: primeiro "Esperando o processamento de <arquivo>", depois "Esperando o mapa de conteúdo de <arquivo>", e só então "Planejando as lições…". No fim, "Gerado". Se o mapa falhar, o módulo é gerado assim mesmo, com o aviso "<arquivo> entrou sem referências: o mapa não terminou.".

### Linha do tempo, disco e professor

14. Volte ao caderno e abra a linha do tempo. Por quê: os eventos da matéria. O que você deve ver: "Módulo gerado: <módulo> de <curso>" para cada geração e "Módulo aguardando material: <módulo>", com a nota.

15. No Explorador, abra materias\<matéria>\cursos\<curso>\modulos\m1.json no Bloco de Notas. Por quê: o módulo fica legível na pasta de dados. O que você deve ver: "situacao": "gerado"; "licoes", cada uma com título, objetivo, conceitos e "blocos"; blocos dos tipos explicacao, verificacao, alternativa e dissertativa; nas explicações, o "formato" (exemplo_resolvido, exemplo_incompleto, problema_aberto ou conceito) e as "referencias" (arquivo, local e trecho); no fim, "geradoEm", "modelo", "custo" e "materiaisUsados". Confira se a observação do passo 4 foi seguida (um exemplo em Python).

16. Clique em "Conversar sobre a matéria" e pergunte "o que tem no módulo 1?". Por quê: o professor lê o módulo. O que você deve ver: no grupo das ferramentas, a chamada ler_modulo; a resposta descreve as lições e o que cada uma ensina, sem dizer qual alternativa é a correta nem a resposta-modelo das questões.


## Calendário

17. Na visão do curso, clique em "Recalcular o calendário". Por quê: o calendário refeito a partir de hoje. O que você deve ver: "Recalcular o calendário a partir de hoje?" com "As datas mudam; os módulos ficam como estão." e os botões "Manter" e "Recalcular". Clique em "Manter": nada muda.

18. Clique de novo e em "Recalcular". Por quê: as datas dentro do prazo. O que você deve ver: "Recalculando…" e depois o calendário novo, começando amanhã; nenhuma data depois do prazo; a avaliação de cada módulo nunca depois da avaliação geral; com prazo apertado, vários módulos no mesmo dia e o aviso "Até DD/MM (N dias), este plano pede cerca de X h por dia (Y h por semana); você disse Z h por semana.". No seu curso (prazo 05/11), o esperado é tudo de 27/10 a 03/11, a avaliação geral em 04/11 e cerca de 4,1 h por dia (as datas andam com o dia em que você rodar).

19. Volte ao caderno e abra a linha do tempo. Por quê: o evento recalculou_calendario. O que você deve ver: "Calendário recalculado: <curso>", com "avaliação geral em DD/MM".


## Dinheiro

20. Numa conversa qualquer, peça ao professor: "explique uma ordem de stop com uma ação de R$ 20 e um stop a R$ 19". Por quê: o R$ não pode virar fórmula. O que você deve ver: "R$ 20" e "R$ 19" como texto normal, sem trechos em itálico de fórmula entre eles; se a resposta tiver uma fórmula de verdade ($…$), ela continua desenhada.


## Resultado

Anote "ok" ou o que aconteceu:

1. Próximo com "Gerar módulo" e os seguintes bloqueados:
2. Formulário e custo aproximado:
3. Ainda não tenho o material (nota e primário):
4. Planejando e Escrevendo a lição N de M, com Parar:
5. Card gerado (Gerado, resumo, Abrir · Em breve, Gerar de novo):
6. O seguinte vira o próximo:
7. Confirmação do Gerar de novo:
8. Parar:
9. Fechar no meio e reabrir:
10. Aguardando material com a nota; o seguinte vira o próximo:
11. Material novo na matéria: gerar agora?:
12. Gerar agora:
13. Esperando o processamento e o mapa de conteúdo:
14. Linha do tempo:
15. m1.json (lições, blocos, formatos, referências, a observação):
16. Professor com ler_modulo, sem gabarito:
17. Confirmação do Recalcular:
18. Datas dentro do prazo e o aviso de horas por dia:
19. Linha do tempo do recálculo:
20. R$ normal na conversa:
