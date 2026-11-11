# Mesa de estudo, parte D: notas do professor (contrato, versão 2, escopo reduzido)

Decisão de origem: ESPECIFICACAO.md, 13.19 ("O professor e as notas"). Vale junto de docs/mesa-de-estudo.md (A e B) e docs/mesa-parte-c.md (C1, com o "Guardar na nota" já pronto).

Em 2026-11-11 o Breno reduziu a parte D: a indicação do professor nas notas do Breno (as sugestões com Aceitar, Editar e Recusar) e os atalhos do pé do chat saíram ("é demais"). A interação com as notas fica em duas coisas: o professor cria notas e o Breno guarda trechos da conversa na nota (já feito na C1). Esta versão do contrato descreve só a primeira, mais o que a completa (o link da conversa e os eventos). A regra antiga ("o professor não mexe nas notas pessoais") muda assim: o professor cria notas novas; nas notas do Breno ele continua só lendo (`listar_notas` e `ler_nota`) e nunca escreve nelas.

Decisões do Breno: a marca "do professor" é a primeira linha da nota, com o link da conversa; "Desfazer" apaga o arquivo da nota criada, só enquanto ele não mexeu nela (a ressalva é do contrato).


## 1. A ferramenta criar_nota e a marca

- `criar_nota(titulo, conteudo)` em profiles/estudos/extensions/notas.ts, só na conversa de uma matéria (a matéria vem do contexto da sessão, como `listar_notas`). O título passa por `conferirTitulo` e `criarNota`; se já existe uma nota com o título, recusa (nunca sobrescreve) e diz o erro ao modelo. O conteúdo é markdown do formato das notas (docs/notas-formato.md), até 100 mil caracteres.
- A extensão escreve, antes do conteúdo, a primeira linha e uma linha em branco:

      Nota do professor · [conversa de 11/11/2026](conversa:abc12345)

  O link é o do Guardar (lib/trecho-guardado.ts: `idCurtoDaConversa`, data local dd/mm/aaaa). A marca é lida por `ehNotaDoProfessor(markdown)` em lib/nota-tipos.ts: a primeira linha não vazia começa com "Nota do professor · " e traz um link `conversa:`. Se o Breno apagar a linha, a tag some (a nota é dele).
- O item da lista de notas (`listarNotas`, a ponte "notas" ação `lista`) ganha o campo `doProfessor: boolean`, e a seção Notas mostra a tag "do professor" nele. O `previaDaNota` e a lista não mostram a linha da marca no resumo (a prévia da nota do professor começa depois dela).
- Eventos (eventos.jsonl da matéria, com o id da sessão): `criou_nota_do_professor` com `{materia, titulo, tamanho, hash}`, onde `hash` é o sha256 do arquivo como foi gravado; e `desfez_nota_do_professor` com `{materia, titulo}`.


## 2. O cartão na conversa: Abrir e Desfazer

- Ao criar a nota, a extensão emite pela ponte, no painel `mesa`, a ação `nota_criada`, com `gravar: true` (volta igual ao reabrir a conversa, e ao reiniciar o servidor): `{materia, titulo, rota, chamada, sessao}`, onde `rota` é a rota da nota (`caderno/<m>/notas/<título>`) e `chamada` é o id da chamada da ferramenta (o primeiro argumento de `execute`). Esse painel já existe e é `foraDaArea`.
- A tela desenha um cartão "Nota criada: <título>" com Abrir e Desfazer, no rodapé da resposta que fecha o turno em que a ferramenta foi chamada (o gancho `rodapeDaResposta`, junto do "Ir ao trecho"). A ligação turno e cartão é pelo `chamada`: o rodapé olha as chamadas de ferramenta do turno (os itens `ferramenta` da conversa) e as ações `nota_criada` do painel. O cartão tem tamanho fixo e não muda entre os estados.
- Abrir: abre a nota na mesa (rota do caderno; a prévia da mesa não vale aqui: é um clique do Breno, então vai para a aba).
- Desfazer: pede uma confirmação curta no próprio cartão ("Apagar a nota? Não dá para voltar atrás.") e então manda à extensão a ação `desfazer_nota` no painel `notas`: `{materia, titulo, sessao, pedido}`. A extensão, na fila da nota, confere que o arquivo ainda é byte a byte o que ela criou (o hash do evento `criou_nota_do_professor`, lido do eventos.jsonl da matéria; a ação só vale para o último `criou_nota_do_professor` daquele título), apaga o arquivo e grava `desfez_nota_do_professor`. Responde com `desfeita` `{materia, titulo, pedido}` ou `erro` com `ao: "desfazer_nota"` e a mensagem. Se o hash não bate (o Breno mexeu) ou a nota não existe mais, recusa, e o cartão passa a mostrar só Abrir (ou "A nota não existe mais"). Confira a sessão como em `guardar`.
- Se a nota estiver aberta numa aba da mesa no momento de Desfazer, a mesa fecha a aba antes de mandar a ação.
- Depois de desfeita, o cartão fica "Nota desfeita" sem botões. O estado do cartão (criada, desfeita) vem dos eventos que a tela já recebe pela ponte; ao reabrir a conversa, o cartão volta como "Nota criada" e, se a nota não existe mais na lista, vira "A nota não existe mais".


## 3. O clique no link da conversa

O link `conversa:<id>` (o do Guardar e o da marca do professor) abre a conversa pelo id curto: a tela procura na lista de sessões da janela a que tem `idCurtoDaConversa(sessaoId) === id` (nunca por prefixo: os primeiros dígitos de um UUID v7 são o relógio) e a abre pela ação de reabrir sessão que o histórico já usa, com as regras de troca da mesa (docs/mesa-de-estudo.md, 2.3: não troca com resposta em andamento nem pedido pendente; confirma antes). Se a sessão não existe mais, aviso curto. No editor das notas e na nota em leitura, o clique num link com esse esquema não abre endereço nenhum.


## 4. Instruções do professor

O AGENTS.md do perfil e as instruções da conversa do caderno (extensions/notas.ts, onde diz que ele nunca escreve nas notas) mudam: o professor cria notas novas com `criar_nota`, quando o Breno pedir uma nota ou um resumo, ou quando uma nota nova claramente ajuda; não cria "por garantia"; nas notas do Breno só lê. Depois de criar, ele diz o título e que há um botão Desfazer; não diz que "salvou" algo que não confirmou.


## 5. Pacotes

Sem WP0 separado (o contrato de dados está nesta seção). Dois pacotes de arquivos disjuntos, em paralelo, ambos Sonnet; revisão por diff e um commit por pacote:
- WP1: lib/nota-tipos.ts (`ehNotaDoProfessor`, o campo da lista), lib/notas.ts (se precisar), lib/eventos.ts (os dois verbos), extensions/notas.ts (`criar_nota`, `nota_criada`, `desfazer_nota`, as instruções) e os testes, AGENTS.md do perfil, docs/notas-formato.md.
- WP2: profiles/estudos/paineis/src (o cartão, o rodapé, o clique no link `conversa:` no editor e na leitura, a tag na seção Notas, os rótulos dos verbos novos na linha do tempo, inclusive `guardou_na_nota` da C1) e os testes.
- Parada de teste: roteiro docs/teste-mesa-d.md, rodado pelo Breno.

Fora desta rodada, anotado na 13.19: sugestões do professor nas notas do Breno, os atalhos do pé do chat, a sugestão espontânea com a lâmpada, relacionados, Ctrl+K, fechamento da sessão e revisão espaçada. A aba de material (C2) vem depois.
