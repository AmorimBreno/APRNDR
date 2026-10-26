# Teste do item 5, parte B: o diagnóstico do guia de curso

Objetivo: confirmar que a etapa Diagnóstico do guia tem as três fases (autoavaliação, questões e resultado), que a autoavaliação salva sozinha, que as questões aparecem uma por vez com a confiança antes e sem gabarito, que o resultado mostra a calibração por conceito, o gabarito e a correção da dissertativa, que "Concluir diagnóstico" confirma a etapa, que os eventos são gravados, que mudar o Mapa avisa que o Diagnóstico será descartado, e que o professor lê o diagnóstico. O contrato está em docs/cursos.md, seção "Parte B: o diagnóstico".

Tempo: uns 30 minutos. Custo esperado: uns 10 centavos de dólar. Cada geração das questões chama o GPT-6.1 Sol, custa uns 3 a 4 centavos de dólar e leva cerca de 1 minuto (o teste real deu 7 questões em 65 s por US$ 0,037). A correção de uma dissertativa custa menos de 1 centavo. O roteiro gera as questões duas vezes ("Gerar de novo" no passo 22).

Os passos usam uma matéria de teste, "Teste do diagnóstico", apagada no fim pelo Explorador (a pasta G:\Meu Drive\estudos-dados\materias\teste-do-diagnostico).

Atenção: os eventos do diagnóstico vão para G:\Meu Drive\estudos-dados\aprendiz\eventos.jsonl, que é só de acréscimo. Eles não somem quando a matéria de teste é apagada. Todos levam objeto.materia "teste-do-diagnostico", para dar para separar depois.

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C. Se estiver em dúvida, use o atalho "Parar Estudos". Por quê: o app precisa subir com o código novo (a extensão dos cursos com o diagnóstico).
2. Abra o app pelo atalho "Estudos", crie a matéria "Teste do diagnóstico" e, na seção Cursos, comece um curso pelo guia (por exemplo, "Probabilidade básica"). Siga as etapas até o Mapa: com um material pequeno ou com "Continuar sem material" e "Montar a partir do tema". Deixe uns 6 a 10 conceitos marcados e clique em "Aprovar o mapa e continuar". Por quê: o diagnóstico precisa de um curso já na etapa Diagnóstico. O que você deve ver: a etapa Diagnóstico aberta.
3. Abra o Explorador em G:\Meu Drive\estudos-dados. Por quê: alguns passos olham o curso.json, o eventos.jsonl da matéria e o aprendiz\eventos.jsonl.

Nota: trocar de conversa durante a geração das questões ou a correção encerra a sessão do pi e para a chamada. Durante esses passos, fique no guia.


## Teste

### Autoavaliação

1. Olhe o topo da etapa. Por quê: as três fases. O que você deve ver: "1 Autoavaliação · 2 Questões · 3 Resultado", com Autoavaliação como a atual.

2. Olhe a lista. Por quê: a autoavaliação por conceito. O que você deve ver: cada conceito do curso com quatro níveis: "Nunca vi", "Já ouvi falar", "Sei explicar" e "Sei aplicar"; a contagem "0 de N marcados".

3. Olhe o primário. Por quê: só gera com todos marcados. O que você deve ver: "Gerar as questões" desligado, com "Marque um nível em todos os conceitos.".

4. Marque um nível em metade dos conceitos, variando os níveis (marque pelo menos dois com "Sei explicar" ou "Sei aplicar"). Por quê: a contagem e o salvamento. O que você deve ver: a contagem acompanha ("N de M marcados"). Espere um segundo e aperte F5: o guia volta na etapa Diagnóstico com os níveis como você deixou.

5. Marque o resto. Por quê: o primário liga. O que você deve ver: "Gerar as questões" ligado.

### Geração e questões

6. Clique em "Gerar as questões". Por quê: a chamada ao GPT-6.1 Sol (cerca de 1 minuto). O que você deve ver: a etiqueta "Gerando", o professor animado e "O professor está preparando N questões…". No fim, a primeira questão.

7. Olhe a questão. Por quê: uma por vez, com o placar. O que você deve ver: o placar do quiz no topo (a questão atual e o total); acima do enunciado, o nome do conceito; a fase Questões como a atual.

8. Antes de marcar a confiança, tente clicar numa alternativa. Por quê: a confiança vem antes. O que você deve ver: "Antes de responder: quanto você confia que vai acertar?" com "Chute", "Pouca", "Boa" e "Certeza"; as alternativas apagadas, sem responder ao clique. Marque uma confiança: as alternativas ficam ativas.

9. Se algum enunciado ou alternativa tiver fórmula, olhe como aparece. Por quê: LaTeX nos enunciados. O que você deve ver: a fórmula desenhada, sem $ nem comandos soltos.

10. Escolha uma alternativa e clique em "Responder". Por quê: sem gabarito durante as questões. O que você deve ver: o guia passa para a próxima questão, sem nenhuma indicação de certo ou errado e sem explicação. Responda mais uma ou duas, de propósito errando alguma.

11. Antes de responder a próxima, aperte F5. Por quê: o progresso fica salvo. O que você deve ver: o guia volta na primeira questão sem resposta.

12. (Opcional, só se ainda não respondeu nenhuma questão depois de gerar.) Na primeira questão, clique em "Voltar". Por quê: o Voltar das questões volta à autoavaliação. O que você deve ver: a lista dos níveis, como você deixou. Se não deu para fazer, anote "pulado"; o passo 22 também leva a ele.

13. Chegue na dissertativa. Por quê: a resposta escrita. O que você deve ver: a confiança antes, como nas outras; o campo de texto; a dica "A correção sai no resultado, depois da última questão."; "Enviar resposta" desligado até a resposta ter pelo menos 40 caracteres. Escreva uma resposta curta mas com sentido (umas três frases), deixando de fora alguma parte do que a pergunta pede, e envie.

14. Responda as questões que faltarem. Por quê: o fim das questões. O que você deve ver: depois da última, a fase Resultado.

### Resultado

15. Olhe o topo do resultado. Por quê: o placar. O que você deve ver: "Acertou X de Y alternativas" e, quando a correção chegar, "Dissertativa: a/b" na escala da rubrica (a mesma de cada questão, por exemplo 6/8, e não /10). Enquanto a correção não chega: "A nota da dissertativa entra quando a correção chegar.".

16. Olhe cada conceito. Por quê: a calibração. O que você deve ver: o nome do conceito, a etiqueta com o nível que você disse, e uma frase como "Disse "Sei explicar" e foi mal nas questões: achou que sabia mais.", "… e foi bem nas questões: sabia mais do que achou." ou "… a autoavaliação bateu.". Conceitos sem questão aparecem no fim em "Sem questão no diagnóstico: …" com o nível entre parênteses.

17. Abra uma questão de alternativa que você errou. Por quê: o gabarito. O que você deve ver: a linha "Questão NN · Alternativa", a etiqueta do resultado e "Confiança: …"; aberta, o enunciado com a alternativa correta marcada, a sua escolha, uma frase "Sua escolha confunde …" e a explicação.

18. Abra uma que você acertou. O que você deve ver: o gabarito e a explicação, sem a frase da confusão.

19. Abra a dissertativa. Por quê: a correção pela rubrica. O que você deve ver: "Sua resposta" com o seu texto; a nota total (a/b); cada critério com a nota (pontos/máximo), os trechos da sua resposta citados (ou "Nenhum trecho da sua resposta para este critério.") e a justificativa. O critério que a resposta deixou de fora deve ter nota baixa ou zero.

20. Se a correção falhar (a etiqueta "Sem correção" e o aviso "A correção desta dissertativa não chegou."), clique em "Corrigir de novo". O que você deve ver: "Corrigindo…" e depois a correção. Se a correção chegou de primeira, anote "não apareceu".

21. Olhe o primário. Por quê: concluir só com tudo corrigido. O que você deve ver: "Concluir diagnóstico" (desligado com "Espere a correção da dissertativa." enquanto ela não chega). Não clique ainda.

### Gerar de novo

22. Clique em "Gerar de novo", no topo. Por quê: descartar as questões. O que você deve ver: "Gerar outras questões?" com "As respostas destas são descartadas (os eventos já gravados ficam)." e os botões "Manter estas" e "Gerar outras". Clique em "Manter estas": nada muda. Clique de novo e em "Gerar outras": a geração recomeça (uns 3 a 4 centavos, cerca de 1 minuto) e vêm questões novas, a partir da primeira. Se quiser, faça agora o passo 12. Responda todas de novo.

### Concluir

23. No resultado, com a dissertativa corrigida, clique em "Concluir diagnóstico". Por quê: confirmar a etapa. O que você deve ver: o guia vai para o Esqueleto, com "O esqueleto chega na próxima parte" e "Voltar para os cursos". No trilho, Diagnóstico fica feito.

24. No Explorador, abra materias\teste-do-diagnostico\cursos\<curso>\curso.json no Bloco de Notas. Por quê: o diagnóstico fica legível na pasta de dados. O que você deve ver: "diagnostico" com a autoavaliação, as questões, as respostas (com a confiança, o tempo e a correção) e "concluidoEm"; nenhum "diagnosticoEmAndamento".

25. Abra aprendiz\eventos.jsonl no Bloco de Notas e vá ao fim. Por quê: os eventos de aprendizagem. O que você deve ver: linhas "autoavaliou_conceito" (com o nivel), "respondeu_questao" (com correta, escolha, confianca, tempoMs e, nas erradas, confusao) e "respondeu_dissertativa" (com total, max e os critérios), todas com objeto.materia "teste-do-diagnostico" e contexto.fase "diagnostico". As das questões descartadas no passo 22 continuam lá.

26. Volte ao caderno e abra a linha do tempo. Por quê: os eventos da matéria. O que você deve ver: "Diagnóstico preparado: <curso>" (duas vezes, com o número de questões e o custo) e "Diagnóstico concluído: <curso>" (com as certas e a nota da dissertativa).

### Descarte vindo do Mapa e o professor

27. Na seção Cursos, clique em Continuar no curso, clique em Mapa no trilho, desmarque um conceito e clique em Continuar. Por quê: mudar o Mapa descarta o Diagnóstico. O que você deve ver: o aviso "Mudar Mapa descarta: Diagnóstico. Continuar?", com "A etapa descartada volta a ficar por fazer.". Clique em "Manter como estava": nada muda. Marque o conceito de volta e saia.

28. Clique em "Conversar sobre a matéria" e pergunte "como foi o diagnóstico do curso?". Por quê: o professor lê o diagnóstico. O que você deve ver: no grupo das ferramentas, a chamada ler_curso; a resposta resume a autoavaliação e o resultado por conceito.

29. Pergunte antes de terminar: volte ao guia, clique em "Gerar de novo" e "Gerar outras" (mais uns 3 a 4 centavos), espere as questões e não responda nenhuma. Na conversa, pergunte "qual é a resposta certa da primeira questão do diagnóstico?". Por quê: o professor não vê o gabarito de questões sem resposta. O que você deve ver: a chamada ler_curso e uma resposta que diz a fase (questões) sem dar a alternativa certa nem a explicação. Se preferir não gastar, anote "pulado".

30. No fim, feche o app e apague a pasta materias\teste-do-diagnostico pelo Explorador. Por quê: a matéria de teste não é sua. Os eventos do aprendiz\eventos.jsonl ficam (o arquivo é só de acréscimo); não os apague.

## Resultado

Anote "ok" ou o que aconteceu:

1. As três fases no topo:
2. Os quatro níveis e "0 de N marcados":
3. Gerar as questões desligado:
4. Contagem e F5 com os níveis:
5. Gerar as questões ligado:
6. A espera com o professor:
7. Uma por vez com o placar:
8. Confiança antes (alternativas apagadas):
9. LaTeX:
10. Sem certo ou errado durante as questões:
11. F5 nas questões:
12. Voltar para a autoavaliação:
13. Dissertativa (40 caracteres e a dica):
14. Fim das questões:
15. Placar na escala da rubrica:
16. Calibração por conceito:
17. Errada: gabarito, "Sua escolha confunde…" e explicação:
18. Certa:
19. Correção da dissertativa (nota por critério, trechos, justificativa):
20. Corrigir de novo:
21. Concluir diagnóstico:
22. Gerar de novo com a confirmação:
23. Concluir levando ao Esqueleto:
24. curso.json:
25. aprendiz\eventos.jsonl:
26. Linha do tempo:
27. Aviso de descarte vindo do Mapa:
28. Professor com ler_curso:
29. Sem gabarito de questões sem resposta:
30. Limpeza:
