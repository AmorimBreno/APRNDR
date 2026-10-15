# Teste da Etapa 2: o app com o perfil de estudos

Objetivo: confirmar os 7 critérios da Fase 1 (ESPECIFICACAO.md, seção 10). Você abre o app pelo atalho da área de trabalho, conversa com o professor, chama o pesquisador, testa a ponte de eventos com o painel de teste e confere a edição ao vivo. Não é uma aula de verdade; é um teste de que as peças estão ligadas.

Tempo: uns 25 a 30 minutos. Custo esperado: menos de US$ 0,50. A pergunta que chama o researcher é a mais cara (ele faz buscas na web); as outras custam alguns centavos cada.

No fim, anote o resultado de cada passo e mande para o Claude Code. A Etapa 2 só está pronta quando você aprovar.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C e feche o terminal. Por quê: o atalho sobe o app sozinho, escondido, e as portas 7430 e 7431 precisam estar livres. Se estiver em dúvida, use o atalho "Parar Estudos" da área de trabalho; ele não faz mal se nada estiver rodando.

2. Saiba que a tela é provisória e crua de propósito: textos simples, sem cores, sem layout cuidado. Ela existe só para testar o núcleo e o servidor. O design de verdade vem depois, a partir das referências que você vai mandar. Não reprove um passo pela aparência; reprove se faltar alguma informação ou se algo não funcionar.


## Teste

1. Abra o app com o atalho "Estudos" da área de trabalho. Por quê: confere o lançador (critério 1), que sobe o servidor sem janela e abre o Edge em modo app. O que você deve ver: nenhuma janela de terminal aparece, nem piscando; depois de alguns segundos abre uma janela do Edge sem barra de endereço e sem abas, só com a página do app. Ao abrir o perfil (passo 3), aparece "Carregando perfil…" antes da conversa.

2. Olhe a tela inicial. Por quê: confere que o servidor achou o perfil na pasta profiles (critério 2). O que você deve ver: o título "Perfis" e o perfil Estudos na lista. Não deve aparecer "Perfis inválidos".

3. Clique no perfil Estudos. Por quê: abrir o perfil cria a sessão do pi com o agente padrão (critério 3). O que você deve ver: "Carregando perfil…" e depois a conversa vazia. No estado da sessão aparecem o agente professor, o modelo openai/gpt-6.1-sol e a lista de ferramentas. Na lista devem estar web_search, web_fetch, subagent, mostrar_painel_teste e perguntar_no_painel_teste.

4. Faça uma pergunta curta, por exemplo: "Em até 5 frases: para que serve a variância?". Por quê: confere a conversa ao vivo (critério 4). O que você deve ver: a sua mensagem em "Você" e a resposta do "Assistente" aparecendo aos poucos, enquanto é escrita, em português do Brasil.

5. Agora faça uma pergunta que faz o professor chamar o pesquisador, por exemplo: "Verifique com o researcher quem propôs o R² ajustado e cite a fonte". Por quê: confere o subagente como sessão filha (critério 4), que não existia no pi do terminal do Windows. O que você deve ver: a ferramenta subagent aparece no meio da conversa, com o progresso do researcher (as buscas que ele faz) enquanto ele trabalha; no fim, o professor responde citando pelo menos uma URL. Pode levar um ou dois minutos.

6. Troque para o agente researcher e depois volte para o professor. Por quê: confere a troca de agente (critério 5). O que você deve ver: a cada troca, o estado mostra o novo agente e o modelo dele (o researcher usa z-ai/glm-5.3). A conversa continua a mesma: as mensagens anteriores ficam na tela, e o novo agente responde a partir delas.

7. Abra uma conversa antiga pela lista de "Sessões" (por exemplo, a das perguntas dos passos 4 e 5). Por quê: confere o histórico (critério 5). O que você deve ver: as mensagens antigas voltam na tela, com as ferramentas no lugar.

8. Comece uma conversa nova e troque o modelo para outro da lista (por exemplo, anthropic/claude-sonnet-5.5). Por quê: confere a nova sessão e a troca de modelo (critério 5). O que você deve ver: a conversa vazia e o estado mostrando o modelo novo. Depois volte para openai/gpt-6.1-sol, para os passos seguintes usarem o modelo padrão.

9. Peça ao professor: "Use a ferramenta mostrar_painel_teste com o texto 'olá, painel'". Por quê: confere a ponte de eventos no sentido da ferramenta para a tela (critério 6). O que você deve ver: em "Painéis", o painel teste deixa de dizer "Nenhuma ação recebida." e mostra a ação "mostrar" com o texto; o professor diz que mostrou.

10. Peça ao professor: "Use a ferramenta perguntar_no_painel_teste para me perguntar qual é a minha cor favorita". Por quê: confere o pedido que espera a sua resposta (critério 6). O que você deve ver: o painel teste mostra a pergunta, um campo para responder e um botão Cancelar, e a conversa fica esperando. Escreva uma cor e envie. O professor deve repetir a cor que você escreveu. Opcional: repita o pedido e clique em Cancelar; o professor deve dizer que você não respondeu, sem erro.

11. Edição ao vivo da tela (critério 7). Deixe a janela do app aberta na tela inicial. Abra no editor o arquivo apps\web\src\provisorio\TelaPerfis.tsx, troque o título "Perfis" (a linha com h2) por "Perfis teste" e salve. Por quê: o Vite troca o componente sem recarregar a página. O que você deve ver: o título muda na hora, sem a página piscar nem voltar a "Conectando ao servidor…". Depois desfaça a mudança e salve de novo.

12. Edição ao vivo do servidor (critério 7). Abra o perfil Estudos com a conversa do passo 10 na tela. Abra o arquivo apps\server\src\app.ts, acrescente um espaço no fim de uma linha, salve, apague o espaço e salve de novo. Por quê: o servidor reinicia sozinho quando o código dele muda, e a tela se reconecta. O que você deve ver: "Reconectando…" por alguns segundos e depois a conversa de volta, com as mensagens.

13. Edição ao vivo do perfil (critério 7). Abra profiles\estudos\extensions\painel-teste.ts e troque o texto "mostrado no painel teste" por "mostrado no painel teste, versão nova". Salve. Por quê: o servidor percebe a mudança no perfil e recarrega as extensões, sem reiniciar. O que você deve ver: um aviso de perfil recarregado na janela. Peça de novo ao professor para usar mostrar_painel_teste com qualquer texto; o resultado da ferramenta deve trazer "versão nova". Depois desfaça a mudança e salve (o aviso aparece de novo).


## Fim

1. Feche a janela do app e use o atalho "Parar Estudos" da área de trabalho. Por quê: fechar a janela não para o servidor, que continua rodando escondido. O que você deve ver: nada na tela; o servidor para em silêncio. Se usar o atalho "Estudos" depois, ele sobe tudo outra vez.

2. Os logs ficam em %LOCALAPPDATA%\estudos-app\logs (cole esse caminho na barra do Explorador de Arquivos). Lá estão o log do lançador, a saída do servidor e os logs das sessões.


## O que ainda não existe

- O quiz e o ask_user_question no app. Eles desenham no terminal e não aparecem na tela; viram painéis na Etapa 3. Se o professor tentar usar um deles, pode não funcionar, e isso não reprova o teste.
- As imagens dos diagramas na conversa. Se o professor pedir um diagrama a um desenhista, o texto mostra só o nome do arquivo; a imagem vai para a pasta estudos-dados\viz, onde você pode abri-la.
- O visual definitivo do app.


## Se algo falhar

Mande para o Claude Code: o número do passo, o que você fez, o que esperava e o que viu, com a mensagem de erro (da tela ou do log em %LOCALAPPDATA%\estudos-app\logs). Nunca cole o valor das chaves; se uma mensagem ou um log mostrar uma chave, apague esse trecho antes de mandar.


## Resultado

Anote aqui, passo a passo, "ok" ou o que deu errado.

Antes de começar (app parado):
1. Abrir pelo atalho:
2. Tela inicial com o perfil:
3. Abrir o perfil e o estado da sessão:
4. Pergunta curta ao vivo:
5. Subagente researcher:
6. Trocar de agente:
7. Conversa antiga:
8. Nova conversa e troca de modelo:
9. mostrar_painel_teste:
10. perguntar_no_painel_teste:
11. Edição ao vivo da tela:
12. Edição ao vivo do servidor:
13. Edição ao vivo do perfil:
Fim (Parar Estudos e logs):
