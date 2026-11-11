# Roteiro de teste: mesa de estudo, parte C1 (o professor agindo na esquerda)

Contrato: docs/mesa-parte-c.md. Você roda este roteiro no app (atalho "Estudos"). Reinicie o app antes (a extensão nova `mesa.ts` só entra com o servidor reiniciado: `wscript launcher\parar.vbs` e abra de novo).

Cuidado com os dados: o passo 8 em diante grava na nota que você escolher. Use uma nota de teste ou aceite o acréscimo (dá para desfazer apagando o bloco no editor).

Tenha à mão uma matéria com pelo menos uma nota, um módulo gerado (uma lição) e a conversa da matéria aberta, com o professor visível.


## A. O professor abre e destaca

1. Abra uma nota e deixe o professor aberto. Peça: "Abra a lição 1 do módulo 1 na mesa". Esperado: uma aba nova aparece na faixa, pulsando, na vaga de prévia. Se você não estava digitando, ela vira a aba em foco; se estava digitando, ela só pulsa na faixa e você continua onde estava.
2. Clique na aba de prévia, ou role dentro dela. Esperado: ela deixa de ser prévia (vira aba fixa, sem pulso).
3. Peça de novo para abrir outra lição ou nota. Esperado: a nova prévia ocupa a vaga; a aba que você fixou continua.
4. Abra uma nota e peça: "Mostre na minha nota onde fala de <um assunto que está nela>". Esperado: o professor destaca a frase (fundo suave) e a nota rola até lá. O destaque some sozinho em uns 3 s ou no próximo clique. A nota NÃO fica "suja" (nada de "salvando" depois do destaque; confira a linha de situação da nota).
5. Mesmo teste numa lição: peça para destacar uma frase de uma explicação. Esperado: a lição rola e marca a frase.
6. Peça para destacar uma frase que não existe. Esperado: o professor responde que não achou o trecho (a ferramenta confere antes), sem nada na tela.
7. Reabra a conversa (troque de conversa e volte, ou F5). Esperado: NADA é aberto nem destacado de novo.


## B. Perguntar com citação e Ir ao trecho

8. Selecione uma frase numa nota e clique em Perguntar. Esperado: a citação aparece acima do campo do professor, com um X. Escreva a pergunta e envie; a citação some do campo e a resposta chega.
9. Na resposta pronta, no pé, aparece o botão "Ir ao trecho". Navegue para outra aba e clique nele. Esperado: volta à aba de onde saiu a pergunta, rola até a frase e destaca.
10. Edite a nota (acrescente ou apague texto perto da frase) e clique em "Ir ao trecho" de novo. Esperado: ainda acha a frase; se apagou a frase, vai ao título da seção e aparece o aviso discreto "O trecho mudou desde a pergunta".
11. Durante uma resposta ainda chegando, o botão "Ir ao trecho" NÃO aparece; ele entra quando o turno todo termina, sem mexer no tamanho de nada.
12. Na conversa em tela cheia (abra "Abrir na tela cheia"), as respostas ficam exatamente como antes: sem "Ir ao trecho", sem botão de guardar.


## C. Guardar na nota

13. Com uma nota em foco, passe o mouse (ou use Tab) sobre um parágrafo da resposta do professor. Esperado: um botão pequeno de guardar aparece à direita do parágrafo, sem empurrar o texto.
14. Clique nele. Esperado: o trecho entra no FIM da nota aberta como uma citação, com a linha "Professor, conversa de <data>" e um comentário `<!-- conversa:… -->`; a nota salva sozinha. Abra o arquivo da nota fora do app para conferir que o formato é legível.
15. Guarde um bloco de lista, um de código e um com fórmula. Esperado: aparecem inteiros dentro da citação, legíveis.
16. Com uma LIÇÃO em foco, clique em guardar. Esperado: abre um seletor curto com as notas da matéria e "Nova nota…". Escolha uma nota que NÃO está aberta: o texto vai para o fim dela. Abra a nota depois e confira.
17. Escolha "Nova nota…", dê um título e confirme. Esperado: a nota é criada e o trecho entra nela. (Ela fica sem a tag "do professor": isso é da parte D.)
18. Deixe a nota em conflito (edite o mesmo arquivo fora do app e depois tente guardar). Esperado: aviso claro de conflito; nada sobrescrito.
19. Confira a linha do tempo do caderno: cada guardar vira um evento "guardou na nota" (no eventos.jsonl da matéria, com `materia`, `titulo`, `sessao`, `tamanho`).


## D. Como conferir (docs/padroes-de-interface.md)

Faça uma vez, com as ferramentas do navegador gravando o estado da tela a cada 15 ms:

20. Troque de aba pelo "Ir ao trecho" e pelo comando do professor: a conversa e a faixa de abas não podem desmontar nem piscar (nenhum quadro com a aba ou o texto do professor sumido).
21. Termine uma resposta com "Guardar" visível: a altura do bloco e a largura do botão não mudam entre repouso, "guardando" e "guardado".
22. Estado passageiro: "Guardando…" só deve aparecer se a gravação passar de 1 s.
23. Tela estreita (375 px) e janela média (~1024 px): o professor vira gaveta; as ações por bloco, o seletor de notas e o aviso do trecho não são cortados nem criam rolagem lateral. Tabelas e blocos de código na resposta ficam 36 px mais estreitos na mesa; confira que continuam legíveis.
24. Movimento reduzido ligado no sistema: sem pulso na aba de prévia, sem animação do destaque, sem fade das ações.
25. O seletor de notas: abre com foco dentro, setas navegam, Esc fecha e devolve o foco ao botão; se a lista for longa, o seletor não é cortado no fim da conversa.


## Resultado esperado

Passos 1 a 25 sem erro. O que fica fora desta rodada: a aba de material com o PDF (parte C2), a tag "do professor", as sugestões e os atalhos (parte D).
