# Roteiro: o professor flutuante, a voz e a bandeja

Contrato em docs/professor-flutuante.md (versão 2). Antes: se a janela antiga do app estiver aberta, saia pela bandeja ("Sair do app") ou feche e rode o atalho "Estudos" de novo, para o Electron novo valer.

Bandeja e início com o Windows
1. Nos ícones ocultos da barra de tarefas (a setinha ao lado do relógio), há o ícone do professor, "APRNDR · professor". Arraste-o para a barra, se quiser que fique sempre à vista.
2. Clique nele: a bolinha do professor some; clique de novo: ela volta. O menu do clique direito tem "Mostrar/Esconder o professor", "Abrir o app", "Iniciar com o Windows" (marcado) e "Sair do app".
3. Feche a janela principal do app pelo X: o ícone continua na bandeja e a bolinha continua na tela. "Abrir o app" no menu traz a janela de volta.
4. Reinicie o Windows (ou saia e entre de novo): sem abrir nada, o ícone aparece na bandeja e a bolinha aparece no canto (o app sobe escondido; pode levar uns segundos). Desmarcar "Iniciar com o Windows" tira isso.

A bolinha e a escrita
5. Abra o Samsung Notes e escreva com a S Pen com a bolinha à vista: a bolinha fica por cima, e a caneta continua escrevendo no Samsung Notes (o foco não sai dele). Arraste a bolinha para outro canto: ela vai, e o Samsung Notes continua ativo.
6. Rode o teste automático de foco (abre o Bloco de Notas, abre e recolhe o chat pelo atalho e diz se o foco foi roubado):
   powershell -ExecutionPolicy Bypass -File scripts\testar-foco.ps1
   O esperado: "OK: a bolinha não roubou o foco." e "OK: o foco voltou para a janela de escrita ao recolher." Feche o Bloco de Notas que ele abriu.

O chat compacto
7. Clique na bolinha (sem arrastar): o balão do chat surge ao lado dela (com a pontinha para ela), com a matéria e o seletor de plano no topo e a mesma conversa da mesa; a bolinha não se mexe nem pisca. Clique de novo na bolinha: o balão fecha. Pergunte algo: a resposta chega ali, e a mesma conversa aparece na mesa. Arraste o balão pelo topo ou a bolinha: os dois andam juntos.
8. Ctrl+Alt+P em qualquer app abre e fecha o balão. Ao fechar, o foco volta para o app em que você estava; feche e abra de novo: a conversa e o rascunho continuam onde estavam.
9. Clique direito na bolinha: o menu do Windows com Abrir o chat, Abrir o app e Esconder o professor.

Olha minha página
10. Com uma página de anotação aberta no Samsung Notes, abra o chat e clique na câmera: aparece o chip "Captura da tela" (a bolinha e o chat não aparecem na captura). Mande com o texto padrão ou com uma pergunta: o professor comenta a sua anotação (o que está errado, faltando ou em aberto). Na conversa, a sua mensagem mostra "1 imagem".

Voz
11. Ctrl+Alt+Espaço (ou o microfone do chat): a bolinha pulsa em âmbar e o tempo corre; fale a pergunta; Ctrl+Alt+Espaço de novo para. O texto aparece no campo com "Envia em 2 s · Cancelar"; deixe ir, ou cancele e edite.
12. Na primeira vez, se o Windows pedir permissão do microfone, permita. Com o microfone desligado, aparece "Não consegui usar o microfone".
13. Uma gravação longa para sozinha em 60 s.

Conferência (docs/padroes-de-interface.md, "Como conferir")
14. A bolinha, os chips e os botões não mudam de tamanho ao trocar de estado; nada pisca ao abrir e recolher o chat; com movimento reduzido no Windows, a bolinha não pulsa.

Resultado esperado: tudo acima sem erro, e o Samsung Notes nunca perde a caneta por causa da bolinha.
