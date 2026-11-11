# Roteiro de teste: mesa de estudo, parte D (notas do professor)

Contrato: docs/mesa-parte-d.md. Você roda este roteiro no app (atalho "Estudos"). Reinicie o app antes: a ferramenta nova `criar_nota` só entra com o servidor reiniciado (`wscript launcher\parar.vbs` e abra de novo).

Cuidado com os dados: este roteiro cria notas de verdade no caderno da matéria que você escolher (e o Desfazer apaga uma delas). Use uma matéria em que isso não atrapalhe, e títulos de teste.

Tenha à mão a conversa de uma matéria com o professor visível.


## A. O professor cria uma nota

1. Peça: "Faça um resumo curto do que explicamos até aqui numa nota chamada Teste do professor". Esperado: o professor cria a nota e responde o título e que há um botão Desfazer. No fim da resposta aparece o cartão "Nota criada: Teste do professor" com Abrir e Desfazer. O cartão tem sempre a mesma altura.
2. Clique em Abrir. Esperado: a nota abre numa aba da mesa. A primeira linha é "Nota do professor · conversa de <data>" (a data é um link) e o resumo vem depois.
3. Abra o arquivo da nota fora do app (pasta da matéria, notas). Esperado: a primeira linha é `Nota do professor · [conversa de dd/mm/aaaa](conversa:<id>)`, uma linha em branco e o conteúdo.
4. Na seção Notas do caderno e no seletor do "Guardar na nota", a nota aparece com a tag "do professor".
5. Peça outra nota com o mesmo título. Esperado: o professor diz que o título já existe e não sobrescreve nada.
6. Fora de uma conversa de matéria (a conversa geral), peça uma nota. Esperado: o professor não tem a ferramenta, ou recebe a recusa; nada é criado.
7. Confira a linha do tempo do caderno: "criou nota (do professor)" e, nos Guardar da C1, "guardou na nota", cada um com o rótulo próprio.


## B. O link da conversa

8. Troque de conversa (histórico ou Nova), depois abra a nota do professor e clique no link "conversa de <data>" da primeira linha. Esperado: a conversa em que a nota nasceu abre no painel do professor. Se a conversa atual estava respondendo ou com pedido pendente, pergunta "Trocar mesmo assim?". Nada abre numa aba do navegador.
9. Faça o mesmo com o link de uma nota onde você usou o Guardar na nota (a linha "— Professor, conversa de …").
10. Se você apagar a conversa antiga (ou usar um link de outra matéria), aparece o aviso discreto "Essa conversa não existe mais." e nada é aberto.


## C. Desfazer

11. Peça uma nova nota (por exemplo "Teste 2 do professor"), veja o cartão e clique em Desfazer. Esperado: o cartão pede confirmação na própria linha ("Apagar a nota? Não dá para voltar atrás." com Apagar e Cancelar), sem mudar de altura. Cancelar volta ao normal.
12. Com a nota aberta numa aba, clique em Desfazer e depois em Apagar. Esperado: a aba fecha, a nota some do caderno e o cartão vira "Nota desfeita". "Desfazendo…" só aparece se demorar mais de 1 s.
13. Confira no eventos.jsonl da matéria: `criou_nota_do_professor` (com `hash`) e `desfez_nota_do_professor`.
14. Crie outra nota do professor, abra-a e ESCREVA algo nela (deixe salvar). Volte à conversa e clique em Desfazer → Apagar. Esperado: recusa, com a mensagem de que a nota foi alterada depois de criada; nada é apagado e o cartão fica só com Abrir.
15. Recarregue a página (F5) ou reabra a conversa. Esperado: os cartões das notas que ainda existem voltam como "Nota criada"; o de uma nota apagada mostra "A nota não existe mais".


## D. Como conferir (docs/padroes-de-interface.md)

Com as ferramentas do navegador gravando o estado da tela a cada 15 ms:

16. Ao clicar em Desfazer, a largura e a altura do cartão e do rodapé não mudam nem por um quadro; "Desfazendo…" não pisca antes de 1 s.
17. Ao Apagar com a nota aberta, a faixa de abas não esvazia nem pisca: só a aba da nota some, e a conversa não remonta.
18. Com o painel do professor a 380 px, a confirmação em duas linhas cabe no cartão. Quando "Ir ao trecho" e o cartão aparecem juntos no mesmo turno, o cartão passa para a linha de baixo (é o único caso em que o rodapé cresce).
19. Tela estreita (375 px) e movimento reduzido: sem rolagem lateral e sem animações novas.
20. Clique no link da conversa dentro do editor: o clique abre a conversa e não posiciona o cursor dentro do texto do link (isso só pelo teclado, de propósito).


## Resultado esperado

Passos 1 a 20 sem erro. Ficam fora: as sugestões do professor nas suas notas e os atalhos do pé do chat (retirados do escopo em 2026-11-11), e a aba de material (parte C2).
