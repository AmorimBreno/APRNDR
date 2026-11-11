# Mesa de estudo, parte D: o professor e as notas (contrato, versão 1, ainda sem revisão do Opus)

Decisão de origem: ESPECIFICACAO.md, 13.19 ("O professor e as notas"). Vale junto de docs/mesa-de-estudo.md (A e B) e docs/mesa-parte-c.md (C1). Este arquivo troca a regra antiga de que o professor não mexe nas notas pessoais (docs/PLANO.md, decisões de 2026-10-19; extensions/notas.ts e as instruções da conversa do caderno).

Decisões do Breno em 2026-11-11:
- A marca "do professor" é a primeira linha da nota, com o link da conversa (recomendação aceita).
- "Desfazer" apaga o arquivo da nota criada (não a move). Ressalva do contrato: só vale enquanto o Breno não mexeu na nota; depois o botão some.
- As sugestões nas notas do Breno ficam DENTRO do markdown da nota, como um bloco (contra a recomendação, que era um arquivo ao lado). Isto traz os riscos da seção 4.
- A aba de material (C2) fica depois da D (sem preferência dele; escolhi a ordem).

Escopo da D: (1) o professor cria notas; (2) o professor sugere mudanças nas notas do Breno; (3) os quatro atalhos no pé do chat; (4) o clique no link da conversa; (5) os eventos. Fora: sugestão espontânea com a lâmpada, relacionados, Ctrl+K, fechamento da sessão e revisão espaçada (ficam anotados na 13.19).


## 1. Nota do professor

- Ferramenta `criar_nota(titulo, conteudo)` em extensions/notas.ts (só na conversa de uma matéria). Passa por `conferirTitulo` e `criarNota`; se o título existe, recusa (nunca sobrescreve). O conteúdo é markdown comum do formato das notas (docs/notas-formato.md); a extensão escreve a primeira linha:

      Nota do professor · [conversa de 11/11/2026](conversa:abc12345)

  seguida de uma linha em branco. O link é o mesmo de lib/trecho-guardado.ts (id curto de `idCurtoDaConversa`). A marca é lida por uma função pura `ehNotaDoProfessor(markdown)` em lib/nota-tipos.ts (primeira linha não vazia começa com "Nota do professor ·" e tem um link `conversa:`); a lista de notas e a seção Notas mostram a tag "do professor" por ela. Se o Breno apagar a linha, a tag some (ele é o dono da nota).
- O cartão na conversa: "Nota criada: <título>" com Abrir e Desfazer. A extensão emite o fato pela ponte (painel "mesa", ação `nota_criada`, com gravar: true, para voltar igual ao reabrir a conversa) e a tela desenha o cartão. Abrir leva à nota (rota do caderno, aba de prévia da mesa, como o `abrir_na_mesa`). Desfazer manda a ação `desfazer_nota` à extensão, que confere no disco que o arquivo ainda é igual ao que ela criou (o hash gravado no evento `criou_nota_do_professor`), apaga o arquivo e grava `desfez_nota_do_professor`; se o Breno já mexeu, recusa com aviso e o cartão perde o botão. Apagar o arquivo é permanente: o botão pede uma confirmação curta na própria tela.
- Nota aberta no editor no momento de Desfazer: a mesa fecha a aba antes.


## 2. O clique no link da conversa

O link `conversa:<id>` (do Guardar e da marca do professor) abre a conversa pelo id curto: a tela procura na lista de sessões da janela a que tem `idCurtoDaConversa(sessaoId) === id` (nunca por prefixo do id: os primeiros dígitos de um UUID v7 são o relógio) e a abre pela ação de reabrir sessão que o histórico já usa, com as regras de troca da mesa (2.3 do docs/mesa-de-estudo.md: não troca com resposta em andamento nem pedido pendente; confirma antes). Se a sessão não existe mais, aviso curto. No editor, o clique no link com esse esquema não abre endereço nenhum.


## 3. Atalhos no pé do chat

Quatro botões numa fileira acima do campo do professor (a vaga `acimaDoCampo`, junto das pills): Resumir a conversa, Pontos importantes, Revisar minha nota e Perguntas para me testar. Cada um manda ao professor um pedido pronto (lib/atalhos-professor.ts), com os contextos da bancada como em Outro jeito e Me teste nisso. Ficam desligados sem conexão ou com resposta em andamento (o tamanho da fileira nunca muda).
- Resumir a conversa: o professor chama `criar_nota` com o que foi explicado, as dúvidas resolvidas e as abertas.
- Pontos importantes: `sugerir_na_nota` nas notas do Breno que já tratam do assunto (ele lista as notas com `listar_notas` e lê com `ler_nota`).
- Revisar minha nota: sugestões de correção na nota em foco, cada uma com o motivo e a citação do material (`ler_material`).
- Perguntas para me testar: uma sugestão que acrescenta, no fim da nota em foco, blocos de pergunta e resposta (`<details class="pergunta">`, docs/notas-formato.md).
As instruções fixas do professor (AGENTS.md do perfil e as instruções da conversa do caderno, em extensions/notas.ts) trocam a regra "nunca escreve nas notas" por: cria notas novas com `criar_nota`; nas notas do Breno só sugere, com `sugerir_na_nota`.


## 4. Sugestões nas notas do Breno (dentro do markdown)

Formato no arquivo (novo no docs/notas-formato.md): um bloco de primeiro nível logo depois do ponto a que a sugestão se prende:

    <div class="sugestao" data-id="s1" data-tipo="acrescentar">
    Texto novo, em markdown.
    </div>

    <div class="sugestao" data-id="s2" data-tipo="trocar" data-de="a frase como está na nota" data-motivo="Uma linha com o porquê.">
    A frase como deve ficar.
    </div>

- `data-tipo`: `acrescentar` (o conteúdo entra depois do bloco onde a sugestão está) ou `trocar` (o conteúdo substitui a frase `data-de`, que está no bloco logo acima). O texto da sugestão é pequeno (até uns 1500 caracteres): nunca a nota reescrita inteira. `data-id` é único na nota; `data-motivo` é opcional e vai no cartão.
- A ferramenta `sugerir_na_nota(nota, depois_de, tipo, texto, de?, motivo?)`: `depois_de` é um trecho que está na nota (título de seção, início de frase), conferido no disco como no `destacar_trecho`; a extensão põe o bloco logo depois do bloco que o contém. Confere que `de` existe nesse bloco. Limite de sugestões abertas por nota (por exemplo 8).
- Nota FECHADA: a extensão escreve o bloco na fila da nota, com a versão lida (conflito = recusa, nada sobrescrito). Nota ABERTA no editor: a extensão manda o pedido à tela pela ponte (`sugestao`, gravar: false) e a tela insere o bloco no buffer (como o `inserirNoBuffer`), e o salvamento automático grava; sem a tela atender em alguns segundos, o professor recebe "a nota está aberta e ocupada" e tenta de novo.
- Na tela: o nó `sugestao` do editor (extensão nova em paineis/src, junto das caixas e recolhíveis) desenha um cartão com o texto proposto (e, em `trocar`, a frase antiga riscada), o motivo e três botões: Aceitar (aplica e remove o bloco), Editar (abre o texto da sugestão para ele mexer e então aceita) e Recusar (remove o bloco). O cartão não muda de tamanho entre os estados.
- Se a frase `data-de` não existe mais (o Breno editou a nota): o cartão avisa "A nota mudou desde a sugestão", desliga Aceitar e oferece Recusar e "Pedir de novo" (manda ao professor uma mensagem pedida com a nota em foco). Uma sugestão `acrescentar` nunca fica obsoleta (ela se prende ao lugar onde está).
- Riscos aceitos pela escolha do Breno, que a revisão deve olhar: (a) o arquivo da nota passa a ter blocos que o professor escreveu, e o `temHtmlDesconhecido` precisa conhecer `<div class="sugestao">` (senão a nota abre só para leitura); (b) fora do app, o bloco aparece como HTML cru; (c) a nota aberta em duas abas do navegador pode gerar conflito (já acontece); (d) um `.md` com sugestão pendente vai para o Drive como está; (e) o `previaDaNota` e a comparação de trechos de `destacar_trecho` devem ignorar os blocos de sugestão; (f) as sugestões de outra nota não aparecem na lista de tarefas nem nos eventos até serem decididas.


## 5. Eventos

Todos com o id da sessão, em materias/<m>/eventos.jsonl, só de acréscimo: `criou_nota_do_professor` ({materia, titulo, tamanho, hash}), `desfez_nota_do_professor`, `sugeriu_na_nota` ({materia, titulo, sugestao, tipo, tamanho}), `aceitou_sugestao`, `editou_sugestao` (antes do aceite, quando o Breno mexeu no texto) e `recusou_sugestao`. As decisões vêm da tela pela ponte "notas" (ações `decidiu_sugestao` e `desfazer_nota`); com o editor aberto quem aplica a mudança é a tela, e a extensão só registra o evento.


## 6. Pacotes (sugeridos; a revisão do Opus decide)

- WP0, orquestrador: este contrato em código: os tipos do bloco de sugestão e do cartão, `ehNotaDoProfessor`, o parser puro do bloco `sugestao` (com testes), os verbos de evento, `temHtmlDesconhecido` conhecendo o bloco, os testes pendentes.
- WP1, Sonnet: extensions/notas.ts (criar_nota, sugerir_na_nota, desfazer_nota, decidiu_sugestao, o pedido `sugestao` à tela, as instruções novas) e lib/ (nota do professor, sugestões em arquivo, hash, eventos), AGENTS.md do perfil.
- WP2, Opus: o nó `sugestao` no editor (cartão, Aceitar, Editar, Recusar, obsoleta), a inserção no buffer, a regra de nota aberta e a conferência de conflito. É o pacote mais arriscado.
- WP3, Sonnet: o cartão "Nota criada", a tag "do professor" na lista, o clique em `conversa:<id>` e os quatro atalhos (prompts em lib/atalhos-professor.ts).
- Paradas: depois do WP2 (o Breno vê uma sugestão, aceita, edita, recusa) e no fim (roteiro docs/teste-mesa-d.md).
