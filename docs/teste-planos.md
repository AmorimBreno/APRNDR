# Roteiro: planos de estudos (Fase 2 do novo rumo)

Contrato em docs/planos-de-estudo.md. Antes: abra o app pelo atalho. Se a janela já estava aberta, feche e abra de novo (o "Copiar imagem" precisa da janela nova do Electron).

Criar pela conversa
1. Abra uma nota de Ciência de Dados na mesa e o painel do professor (Ctrl+J). Embaixo da linha das conversas aparece "Plano: nenhum".
2. Clique em "Nova" para começar uma conversa limpa. Abra o seletor de plano: só tem "Criar plano nesta conversa". Clique nele: a mensagem "Quero montar um plano de estudos nesta conversa." vai sozinha.
3. Responda o que ele perguntar (no máximo 2 ou 3 perguntas) colando a lista de temas da prova. Ele cria o plano e já começa o primeiro item, do jeito de sempre (sem parar para você anotar).
4. Embaixo da resposta, o cartão "Plano criado: <título>" com Abrir e Desfazer. O seletor passa a mostrar "Plano: <título> · 0 de N".
5. Abra o plano pelo cartão: a primeira linha é "Plano de estudos · criado em …", depois o objetivo, a checklist e "Conversas" com o link desta conversa. No topo da nota, a faixa com o progresso.
6. Na lista de notas do caderno, o plano tem a tag "plano de estudos · 0 de N".

Durante a aula
7. Diga "entendi, pode passar para o próximo". O item 1 fica marcado; com a nota do plano aberta numa aba, ela recarrega sozinha e a faixa vira "1 de N" sem piscar.
8. Marque você mesmo um item na nota: a faixa muda na hora. Pergunte ao professor em que item vocês estão: ele considera a sua marcação.
9. Comece a digitar na nota do plano e, sem esperar salvar, peça ao professor para marcar outro item: aparece o conflito de sempre ("Recarregar a do arquivo" ou "Manter a minha"), nada se perde sem você escolher.

Seguir numa conversa nova
10. Clique em "Nova". O seletor volta para "Plano: nenhum". Escolha o plano: a mensagem "Vamos seguir o plano …" vai sozinha e o professor retoma pelo primeiro item não marcado, dizendo onde parou.
11. Na nota do plano, a seção Conversas ganhou o link da conversa nova. O clique num link abre a conversa certa.
12. Escolha "Nenhum": não vai mensagem nenhuma; pergunte algo e confira que ele não fala mais do plano.
13. Com o professor respondendo, o seletor fica desligado.

Desfazer e renomear
14. Crie um plano de teste e clique em Desfazer no cartão: confirme; o cartão vira "Plano desfeito", a nota some da lista e o seletor volta para "Nenhum".
15. Renomeie um plano que a conversa segue: o seletor mostra o nome novo, e o professor continua seguindo.

Copiar imagem
16. Peça um diagrama ao professor. Passe o mouse na imagem: "Copiar imagem" no canto. Clique e cole no Samsung Notes: a imagem entra, com fundo (não transparente). O botão mostra "Copiada" por um instante, sem mudar de tamanho.

Conferência (docs/padroes-de-interface.md, "Como conferir")
17. O seletor, a tag, a faixa e o cartão não mudam de tamanho ao trocar de estado; nada pisca ao trocar de aba ou de conversa; na janela estreita (375 px) o seletor cabe sem rolagem para o lado; com movimento reduzido, sem animação.

Resultado esperado: tudo acima sem erro na tela, e o plano no Drive legível no Bloco de Notas.
