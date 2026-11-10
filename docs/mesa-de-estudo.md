# Mesa de estudo: plano das partes A e B (versão 2, revisada e decidida)

Decisão de origem: ESPECIFICACAO.md, 13.19. Plano no PLANO.md, Etapa 4, "Item 7: mesa de estudo". Processo: o guia multiagente do Breno (mapear, plano revisado, contratos antes, pacotes com arquivos exclusivos, revisão por diff, um commit por pacote, paradas para teste). Este arquivo vira o contrato da mesa depois do WP0 (como docs/agenda.md e docs/modulos.md).

Escopo desta rodada: partes A (a mesa e as conversas) e B (contexto da tela, olho e seleção). As partes C (o professor agindo na esquerda) e D (o professor e as notas) ganham plano próprio depois da parada 2.

Branch: app-perfis, como o resto do projeto.

Histórico: a versão 1 foi feita a partir de dois mapeamentos do código (agentes Explore no Sonnet) e revisada por um agente Opus em 2026-11-09. A revisão achou três bloqueadores (a fila do followUp, o laço de troca de sessão entre abas e a parada 1 antes da grade), onze pontos importantes e as lacunas que estão na seção 4. Esta versão já os incorpora.


## 1. O que o mapeamento e a revisão acharam

Núcleo e servidor:
- A mensagem do usuário hoje é só texto: AcoesJanela.enviar(texto) (packages/ui/src/use-janela-perfil.ts), o pedido "enviar" {perfil, texto} (packages/core/src/protocolo.ts), o servidor (apps/server/src/conexao.ts) e JanelaPerfil.enviar (packages/core/src/janela-perfil.ts), que chama sessao.prompt ou, com a sessão respondendo, sessao.followUp. Não existe metadado por mensagem.
- O pi 1.2.0 tem o hook before_agent_start, que pode devolver uma mensagem custom. Com display: false ela só some da interface do pi: vai ao modelo como mensagem do usuário e é gravada na sessão como CustomMessageEntry, depois da mensagem do usuário.
- O before_agent_start só roda quando uma execução começa (_prepareRun, chamado por _startRun). O followUp entra na fila da execução em andamento sem passar por ele, e só aceita texto e imagens. Por isso o contexto de uma mensagem mandada durante uma resposta não teria onde entrar. Conferido em agent-session.js.
- Ao reabrir, converterHistorico (packages/core/src/eventos.ts) só trata user, assistant e toolResult; a mensagem custom seria ignorada. O evento ao vivo mensagem_usuario sai antes da custom existir.
- O ContextoSessao (a matéria da conversa, 13.14) é por sessão e "o último vale". O contexto da tela muda a cada mensagem e não vai nele.
- Uma janela de perfil tem uma sessão só, compartilhada por todas as abas do navegador (apps/server/src/janelas.ts). Trocar de sessão aborta a resposta, cancela os pedidos pendentes (ask_user_question, quiz) com "sessao_encerrada" e monta uma ponte nova; o front reconstrói acoesPorPainel a partir da sessão nova, por isso as telas do caderno "zeram".
- Um salvamento de nota em andamento na hora da troca nunca recebe resposta (ela volta pela ponte velha), e o editor fica preso em "salvando" (EditorNota.tsx, emVoo).
- O custo por resposta existe (UsoModelo em cada item). A soma ao vivo inclui os subagentes; ao reabrir ela zera, e o historico() vem de sessao.messages, já compactado.
- listarSessoes devolve o contexto de cada sessão (filtro por matéria pela chave "materia:<id>"), mas só enxerga sessões que já têm arquivo: uma "Nova" sem mensagem não aparece.
- O log do servidor (resumirMensagem em conexao.ts) registraria o pedido "enviar" inteiro.

Telas:
- A TelaEstudos guarda um useJanelaPerfil só para todas as subtelas. A tela inicial e a conversa em tela cheia nunca estão montadas juntas (App.tsx), então a JanelaPerfil não precisa receber a janela por prop.
- Os pedaços da conversa não dependem da rota, só da janela. A tela cheia vem do CSS de apps/web. O registro de painéis é do app, então o painel da conversa é entregue à tela inicial pelo app.
- Fora do documento, a JanelaPerfil também desenha erros, diagnósticos, o aviso de recarregado, o modal de pedido que abre sozinho e a área de painéis. O envio procura o campo com document.querySelector(".ap-ask__input").
- A conversa rola com scrollIntoView a cada pedaço de resposta (packages/ui/src/visual/Conversa.tsx), o que rola todos os ancestrais (a página e a coluna da esquerda) e puxa para o fim mesmo se o Breno subiu para ler.
- A View Transition roda em todo hashchange, inclusive voltar e avançar (App.tsx), e o perfil não tem como evitar.
- A lição já usa container queries (.modulo__corpo). A nota usa @media 760 e padding-bottom 30vh; o código lateral da lição usa 100vh. A TelaModulo troca a aba do caderno pela CourseBar.
- O markdown da nota e os blocos da lição já estão no cliente, presos dentro dos componentes. Falta um serializador de bloco para texto.
- Seleção: a nota tem o BubbleMenu do TipTap (só com foco); a lição tem a barra dos termos (selectionchange no document, dentro de um [data-texto-estudo]). Clicar e digitar no campo do professor muda a seleção do documento, então a seleção lida na hora de mandar chegaria vazia.
- Não existe visualizador de PDF. Material e mapa na mesa ficam para depois.
- Trocar de aba remonta o EditorNota (perde o desfazer e a rolagem). Ctrl+J abre os Downloads no Edge se não for capturado antes.


## 2. Desenho

2.1 A mesa é o caderno com o professor ao lado. Não há rota nova: a nota (caderno/<matéria>/notas/<título>) e a lição (caderno/<matéria>/cursos/<curso>/modulos/<módulo>[/<lição>]) continuam nas rotas de hoje. A tela do caderno ganha uma coluna à direita com o painel do professor, que abre e fecha pela foto do professor e por Ctrl+J (capturado antes do navegador). Fechado quer dizer escondido (hidden e inert), nunca desmontado: o rascunho, a citação, a resposta em andamento e os pedidos continuam. Com um pedido esperando e o painel fechado, a foto pulsa e o modal não abre sozinho. Na primeira vez o painel começa fechado; depois, o estado aberto ou fechado fica lembrado no localStorage (seção 5, item 4).

2.2 Abas. Uma faixa própria de abas acima da área da esquerda, com as notas e lições abertas daquela matéria (até 6; abrir a sétima fecha a mais antiga que não é a ativa), lembradas por matéria no localStorage. A aba ativa é a rota de hoje (F5 e voltar funcionam). Trocar de aba não dispara a View Transition (ver 2.10). A rolagem de cada aba é guardada e devolvida. A CourseBar da lição ganha um modo compacto a meia largura. A primeira entrega só abre nota e lição.

2.3 Sessão por matéria (regra numa função pura testada, sessao-materia.ts):
- Entrar no caderno de uma matéria (quando materiaId muda) abre a conversa mais recente dela, ou uma nova com o contexto da matéria.
- Não troca enquanto a conversa aberta estiver respondendo ou com pedido pendente: a mesa mostra "O professor está terminando outra resposta" e troca quando ela acabar.
- Sair do caderno não troca nada. A conversa geral continua abrindo só pelo botão "Conversa geral".
- Depois da entrada, a mesa nunca troca sozinha. Se a sessão aberta deixar de ser da matéria (outra aba do navegador trocou), aparece o aviso "A conversa mudou em outra aba" com "Voltar para <matéria>". Isso impede duas abas de trocarem a sessão uma da outra em laço.
- Antes de qualquer troca (entrada, Nova, seletor), a mesa chama antesDeTrocar() da aba ativa, que salva a nota e espera. Nova e o seletor pedem confirmação se houver resposta em andamento ou pedido pendente.
- O perfil guarda no localStorage a última matéria, a aba ativa e a sessão de cada matéria, para o "Continuar de onde parei". A chave do hook do núcleo (sessionStorage, por perfil) não muda. Se o hook cair numa sessão sem contexto ao reconectar (uma Nova que ainda não tinha arquivo), a mesa trata como uma entrada.

2.4 O painel do professor. Topo: o nome da matéria, o seletor de conversas (as sessões da matéria por data, mais a atual mesmo sem arquivo; sem nenhuma, "Nenhuma conversa anterior"), Nova (sessão nova com o contexto da matéria, sem resumo) e o custo da conversa. Embaixo, o chip "Vendo" com o olho. Depois, o documento da conversa e a barra de pergunta, os mesmos componentes da tela cheia no modo embutido: erros numa faixa compacta, "Abrir na tela cheia" quando um painel da área de painéis recebe algo. Com a conexão caída ou carregando, o painel mostra o aviso ou um esqueleto, o campo fica desligado e a esquerda continua usável. A conversa em tela cheia continua igual para a conversa geral e o histórico.

2.5 Contexto da tela (genérico no núcleo). Tipo novo no protocolo:

    ContextoTela {
      tipo: string        // "nota", "licao"; o núcleo não interpreta
      rotulo: string      // "Séries convergentes", "Lição 2.3 · Critério da razão" (até 200)
      origem?: string     // opaco, do perfil; a parte C usa para "Ir ao trecho" (até 500)
      conteudo?: string   // o arquivo inteiro, só com o olho aberto (até 200 mil, só trava)
      parcial?: boolean   // o perfil cortou o conteúdo
      selecao?: string    // o trecho citado (até 20 mil)
    }

O pedido "enviar" ganha contextoTela opcional. O perfil corta o conteúdo antes de mandar e marca parcial; os limites do esquema são só trava. O log do servidor registra só o tipo e os tamanhos.

O núcleo passa a ter a própria fila: com a sessão respondendo, enviar guarda {texto, contextoTela} e emite o estado da fila; quando a execução termina sem ser abortada, manda o próximo com prompt(). Assim toda mensagem passa pelo before_agent_start e leva o próprio contexto. abortar() e a troca de sessão esvaziam a fila; se prompt() lançar erro, o contexto pendente é limpo.

No before_agent_start (extensão interna da ponte) o núcleo devolve a mensagem custom "nucleo.contexto-tela", display: false, com details {tipo, rotulo, origem, olho, parcial, selecao, hash} e o texto para o modelo: "O que o Breno via ao mandar a mensagem acima", o tipo e o rótulo, o trecho citado e, com o olho aberto, o conteúdo. Se o conteúdo tiver o mesmo hash do último contexto ainda presente em sessao.messages (o que o modelo de fato vê, já compactado), vai só "o mesmo conteúdo de <rótulo> mandado antes". O hash vem das mensagens, não da memória, para acertar depois de compactar, reabrir ou trocar de agente.

O tradutor de eventos emite um evento novo "contexto_tela" (o resumo: tipo, rótulo, origem, olho, parcial, selecao; nunca o conteúdo), que o reducer prende ao último item do usuário. O converterHistorico faz o mesmo olhando a custom que vem depois da mensagem do usuário. O documento desenha o resumo como um chip pequeno em cima da mensagem.

O "historico" ganha o campo uso: a soma do uso do ramo inteiro do arquivo (respostas e resultados de subagentes), calculada pelo núcleo. O reducer usa esse total ao reabrir, em vez de zerar. Isso também conserta o custo na tela cheia.

2.6 O chip e o olho. O chip mostra o rótulo da aba ativa e o olho, com aria-pressed. Olho aberto: vai o conteúdo inteiro e o trecho citado. Olho fechado: vai só o texto da mensagem, o rótulo e o trecho citado, nunca o conteúdo (seção 5, item 2). O estado do olho fica lembrado por matéria. Sem aba aberta, o chip não aparece, a mensagem vai sem contexto e a esquerda convida a abrir uma nota ou lição. Se o provedor da aba falhar, a mensagem vai sem conteúdo e o chip avisa. Conteúdo cortado aparece como "parcial" no chip.

2.7 Quem fornece o conteúdo. Um provedor do perfil (vendo.tsx) acima das abas: a aba ativa registra {tipo, rotulo, origem, texto(), antesDeTrocar()}. A nota entrega o markdown do buffer do editor. A lição entrega o texto da lição aberta, montado por um serializador puro (licao-texto.ts): título, objetivo, explicações, enunciados e as explicações pedidas que estão na tela; nunca gabarito, respostaEsperada, rubrica, respostas do Breno nem versões anteriores dos blocos. Módulo aguardando material não tem texto. O painel do professor lê o provedor na hora de mandar, por obterContexto(), que a tela inicial passa ao painel (2.9).

2.8 Seleção e citação. A seleção não é lida na hora de mandar (o campo do professor já a apagou). Ela vai só como citação: um hook useSelecaoDoDocumento(raiz) (selectionchange no document, filtrado pela raiz da aba; ignora o chat, campos e respostas) e o componente BarraSelecao com:
- Perguntar: guarda o trecho como citação (chip removível acima do campo do professor, com X) e foca o campo; a citação é limpa depois de enviar e devolvida ao campo se o envio falhar.
- Outro jeito: na lição, o explicar que já existe (analogia, caso real, passo a passo, visual); na nota, manda ao professor um pedido pronto com o trecho e o jeito escolhido.
- Me teste nisso: manda ao professor um pedido pronto com o trecho.
Na lição, a barra substitui o Flutuante dos termos e mantém "Não sei o que é isso" e "Explique melhor". Na nota, o BubbleMenu de formatação continua quando a nota está em edição, e a barra de perguntas aparece num grupo separado.

2.9 Fronteira núcleo, app e perfil. PropsTelaInicial ganha:

    conversa?: ComponentType<PropsConversaEmbutida>

    PropsConversaEmbutida {
      janela: JanelaPerfilHook
      aberta: boolean                // fechada = hidden e inert, nunca desmontada
      obterContexto?(): ContextoTela | undefined
      cabecalho?: ReactNode          // o topo do perfil: matéria, seletor, Nova, custo, chip
      citacao?: { texto: string; limpar(): void }
      aoPedidoPendente?(pendente: boolean): void   // para a foto pulsar com o painel fechado
    }

E EntradaTelaInicial ganha semTransicao?(de: string, para: string): boolean, para o perfil dizer quais trocas de caminho não animam a página (as abas da mesa).

O app (apps/web) extrai da JanelaPerfil um PainelConversa com modo "cheio" e "embutido" (documento, barra de pergunta, modal dos pedidos, voo, erros), que a própria JanelaPerfil passa a usar no modo cheio. O envio usa ref, não querySelector. A rolagem da conversa passa a ser scrollTo no contêiner, só quando ela já estava perto do fim. Nada de nota, lição ou matéria entra no núcleo nem no app.

2.10 Teclado, foco, rolagem e telas estreitas. Os listeners de Escape, keydown e scroll no document olham se o alvo está dentro da área deles (closest). scrollIntoView dentro da lição vira scrollTo no contêiner. A nota troca o @media 760 por @container e o padding de 30vh por um valor relativo ao painel; o código lateral da lição troca o 100vh pela altura do contêiner. Abrir o painel foca o campo, fechar devolve o foco à aba; a foto tem aria-expanded. Abaixo de uns 1100 px (lembrando a escala de 90 %) o professor vira gaveta por cima da esquerda; abaixo de 760 px, um lado por vez. Com movimento reduzido: abrir e fechar sem mola, pulso parado, voo desligado (semMovimento). O CSS da mesa fica em profiles/estudos/paineis/src/mesa.css, importado pelo estilo.css do perfil.


## 3. Requisitos

R1. A nota e a lição abrem com o painel do professor à direita, que abre e fecha pela foto e por Ctrl+J (sem abrir os Downloads) e lembra o estado.
R2. Fechar o painel não perde a resposta em andamento, o rascunho, a citação nem um pedido pendente; com pedido esperando, a foto pulsa.
R3. Entrar no caderno abre a conversa mais recente da matéria, sem abortar uma resposta em andamento; sair não troca. As telas do caderno carregam depois da troca e uma nota sendo salva termina de salvar.
R4. Nova começa uma conversa da matéria do zero; o seletor lista (inclusive a atual sem arquivo) e reabre as conversas da matéria; os dois confirmam se há resposta ou pedido em andamento.
R5. O custo da conversa aparece no topo, ao vivo e ao reabrir, com o mesmo valor (incluindo subagentes); a tela cheia também passa a mostrar o valor certo ao reabrir.
R6. Abas de notas e lições da matéria (até 6), lembradas por matéria, com a rolagem guardada; trocar de aba não faz o chat piscar.
R7. A conversa em tela cheia continua igual (regressão): histórico, painéis, pedidos, seletores, voo, erros.
R8. O chip "Vendo" mostra a aba ativa com o olho; o olho lembra o estado por matéria.
R9. Olho aberto manda o conteúdo inteiro (sem repetir conteúdo igual ainda visível ao modelo); olho fechado não manda o conteúdo.
R10. O contexto volta como chip na mensagem ao reabrir a conversa, sem o conteúdo.
R11. Mensagens mandadas durante uma resposta levam o próprio contexto (fila do núcleo).
R12. A barra de seleção única aparece na nota e na lição, com Perguntar, Outro jeito e Me teste nisso; na lição mantém os pedidos dos termos.
R13. Perguntar põe o trecho como citação removível acima do campo; ele vai junto e volta ao campo se o envio falhar.
R14. Nota e lição funcionam a meia largura (container queries), sem rolagem lateral; Escape e rolagem de um lado não fecham coisas do outro; rolar o chat não rola a página nem a esquerda.
R15. O núcleo não conhece nota, lição nem matéria (só tipo, rótulo, origem, conteúdo e seleção); o log do servidor não guarda o conteúdo.
R16. Duas abas do navegador não trocam a sessão em laço; a mesa avisa quando a conversa mudou em outra aba.
R17. Conexão caída, carregando, matéria sem conversa, mesa sem aba e módulo sem material têm estado próprio na tela; telas estreitas e movimento reduzido funcionam.


## 4. Pacotes

WP0, orquestrador. Contratos nos arquivos de tipo: o esquema do contextoTela (protocolo.ts), o resumo, o evento contexto_tela e o uso no historico (eventos.ts e protocolo), PropsConversaEmbutida e semTransicao (telas-iniciais.ts), a interface do provedor com antesDeTrocar (vendo.tsx, só tipos), a assinatura de licao-texto.ts, o mesa.css vazio com o @import. Os testes que definem contrato, escritos antes do código e marcados como pendentes: protocolo (limites e esquema strict), janela-perfil (contexto no prompt e na fila própria; abortar e trocar esvaziam a fila; hash depois de compactar, reabrir e trocar de agente), eventos (o resumo nunca leva o conteúdo), estado-janela (chip e uso ao reabrir), servidor (log sem o conteúdo), licao-texto, abas-mesa (limite de 6, fechar a ativa), sessao-materia, App (sem transição entre abas da mesa). Uma prova curta da fila própria com sessão falsa. Parada 0: o Breno lê os contratos.

WP1, Opus, o pacote mais arriscado do núcleo. Arquivos: packages/core/src/janela-perfil.ts, contexto-tela.ts (novo), eventos.ts, sessoes.ts (uso do ramo) e os testes deles; apps/server/src/conexao.ts e servidor.test.ts. Aceite: os testes do núcleo verdes; pnpm typecheck e pnpm test limpos; dois envios seguidos, um durante a resposta, deixam dois contextos no .jsonl.

WP6, Haiku, junto do WP1. Arquivo: profiles/estudos/paineis/src/licao-texto.ts. Aceite: o teste do WP0 verde.

WP2, Sonnet, depois do WP1. Arquivos: packages/ui/src/use-janela-perfil.ts, estado-janela.ts e o teste, tipos.ts, index.ts. Aceite: enviar(texto, contexto?), o resumo no item do usuário, o uso ao reabrir igual ao do arquivo.

WP3, Sonnet, depois do WP2. Arquivos: apps/web/src/telas/JanelaPerfil.tsx, telas/PainelConversa.tsx (novo), App.tsx e App.test.ts, apps/web/src/estilo.css; packages/ui/src/telas-iniciais.ts, visual/Conversa.tsx, visual/BarraPergunta.tsx e o estilo.css do ui. Aceite: a tela cheia sem diferença (roteiro do R7); nenhum querySelector no envio; rolagem só no contêiner; semTransicao respeitado.

WP4, Sonnet, junto do WP3. Arquivos: profiles/estudos/paineis/src/TelaEstudos.tsx, TelaCadernos.tsx, comum.ts, sessao-materia.ts e o teste (novos), EditorNota.tsx (só o emVoo na troca) e os *-ponte.ts que faltarem. Aceite: o teste verde; entrar no caderno com resposta em andamento não aborta; duas abas não entram em laço.

WP5a, Sonnet, depois do WP3 e do WP4. Arquivos: MesaEstudo.tsx e CabecalhoProfessor.tsx (novos), TelaCaderno.tsx, mesa.css. Conteúdo: a grade, abrir e fechar, Ctrl+J, o seletor, Nova, o custo, os estados vazios e de conexão, a gaveta em telas estreitas.

Parada 1 (parte A, sem o contexto): o Breno abre uma nota e uma lição, abre e fecha o professor (pela foto e por Ctrl+J), conversa, manda uma mensagem durante uma resposta, troca de conversa, Nova, confere o custo ao vivo e ao reabrir, entra em outro caderno com o professor respondendo, e confere a conversa em tela cheia sem mudança.

WP5b, Sonnet. Arquivos: abas-mesa.ts e o teste, vendo.tsx (o provedor), o chip com o olho, o semTransicao do perfil, MesaEstudo.tsx, CabecalhoProfessor.tsx, mesa.css.

WP7a, Haiku, junto do WP5b (mecânico, contrato fechado). Arquivos: estilo.css do perfil (container queries da nota e do código lateral, modo compacto da CourseBar), TermosModulo.tsx (só os listeners restritos por closest), TelaModulo.tsx (só o scrollTo). Aceite: rolar o chat não fecha a barra da lição; a nota a 700 px sem rolagem lateral.

WP7b, Sonnet, depois do WP5b e do WP7a. Arquivos: selecao.ts e o teste, BarraSelecao.tsx (novos), TermosModulo.tsx, EditorNota.tsx (o provedor e o grupo de perguntas), TelaModulo.tsx (o provedor da lição), estilo.css do perfil.

Parada 2 (parte B): o chip, o olho aberto e fechado (conferindo no botão de informações da resposta que o custo muda e que a segunda mensagem com a nota igual fica barata), a seleção nas duas abas, Perguntar com citação, Outro jeito, Me teste nisso, reabrir a conversa e ver os chips.

Fim: /code-review e /security-review, correções, roteiro docs/teste-mesa.md, filemap e PLANO.

Estado do WP0 (feito em 2026-11-09):
- Núcleo: ContextoTela e ResumoContextoTela (eventos.ts), o evento contexto_tela, o contextoTela do item do usuário, o esquema com LIMITES_CONTEXTO_TELA no pedido enviar e o uso no historico (protocolo.ts), e contexto-tela.ts com as assinaturas e os testes pulados.
- Interface: PropsConversaEmbutida, a prop conversa da tela inicial e semTransicao (packages/ui/src/telas-iniciais.ts). O reducer ignora contexto_tela até o WP2.
- Perfil: vendo.ts (só tipos; o provedor do React será vendo.tsx no WP5b), licao-texto.ts com o teste pulado, mesa.css importado pelo estilo.css. abas-mesa.ts e sessao-materia.ts já foram implementados no WP0, com testes: o WP4 e o WP5b só os usam.
- Testes pendentes (it.todo) nos arquivos do WP1, WP2 e WP3: janela-perfil.test, eventos.test, servidor.test, estado-janela.test e App.test. Cada pacote troca os seus por testes de verdade.

Regras dos pacotes: um commit por pacote, feito pelo orquestrador depois de ler o diff e rodar pnpm typecheck e pnpm test. Paralelo só com arquivos disjuntos (WP1 com WP6; WP3 com WP4; WP5b com WP7a). Falha de Haiku: até 2 novas tentativas com o diff e o critério que falhou; na terceira sobe para o Sonnet.


## 5. Decisões do Breno (2026-11-09)

1. A sessão troca ao entrar no caderno, só se a conversa aberta não estiver respondendo nem com pedido pendente, e nunca ao sair (recomendação aceita, 2.3).
2. Olho fechado e sem trecho citado: vai só o rótulo ("está na nota X"), nunca o conteúdo.
3. Na lição, "o arquivo" é a lição aberta, sem gabarito, rubrica, respostas nem versões anteriores.
4. O painel do professor começa fechado na primeira vez; abre pela foto ou por Ctrl+J, e depois lembra a escolha.
5. Duas abas do navegador dividem a mesma conversa, com o aviso e "Voltar para <matéria>" (recomendação aceita).
6. O WP1 é feito no Opus.

## 5b. A bancada (2026-11-10)

Pedido do Breno depois da parada 2: as pills acima do campo mostram todas as abas abertas da mesa, não só a ativa. Muda o contrato do contexto da tela: uma mensagem leva uma lista de contextos.

Regra das pills:
- uma pill por aba aberta, na ordem das abas; o olho dentro da pill mostra se ela está selecionada;
- padrão: a aba em foco selecionada, as outras não; um clique alterna a seleção de qualquer pill, e as escolhas valem até a aba em foco mudar, quando volta o padrão;
- selecionada: vai o conteúdo inteiro (como o olho aberto de antes); não selecionada: vai só o nome, para o professor saber o que está na bancada;
- a aba em foco vai marcada com foco, e o trecho citado vai nela.

Conteúdo das abas fora de foco: a aba que perde o foco deixa uma cópia do texto no provedor Vendo (a nota, o buffer do editor; a lição, o textoDaLicao). Uma aba restaurada do localStorage que ainda não foi aberta nesta sessão não tem cópia: na nota, o conteúdo é pedido pela ponte de notas quando a pill é selecionada; na lição, vai só o nome, e a pill avisa "abra a aba para o professor ver".

Contrato novo (substitui o contextoTela único):
- ContextoTela ganha foco?: boolean; o pedido "enviar" leva contextosTela?: ContextoTela[] (até 8; a soma dos conteúdos até 200 mil caracteres) no lugar de contextoTela;
- o evento contexto_tela leva contextos: ResumoContextoTela[]; o item do usuário do histórico leva contextosTela?: ResumoContextoTela[]; as sessões antigas, com details de um contexto só, são lidas como uma lista de um;
- a mensagem custom nucleo.contexto-tela leva details.contextos (cada um com o hash, se foi conteúdo) e o texto para o modelo lista as abas: as selecionadas com o conteúdo (ou "o mesmo conteúdo de antes", se o hash ainda estiver visível) e as outras só com o nome;
- PropsConversaEmbutida.obterContexto vira obterContextos?(): ContextoTela[] | Promise<ContextoTela[]>, e a citação vai no contexto com foco.

Também nesta rodada: sai o texto "Enter envia · Shift + Enter quebra a linha" da conversa embutida, e as barras de rolagem da nota, da lição e do chat ficam finas e discretas.

## 6. Estado (2026-11-09)

Partes A e B implementadas, um commit por pacote: WP0 b9e0296, WP6 8f6ad5d, WP1 60c39fc, WP2 4dd1f35, WP4 1dda0ab, WP3 909d0be, WP5a 98105cc, WP7a 0ab3ef1, WP5b 0e942fd, WP7b df7ff3d. pnpm typecheck limpo e pnpm test verde (92 arquivos, 1712 testes).

Mudanças pedidas pelo Breno na parada 1: o professor fica abaixo da barra do caderno (ou da do curso), que ocupa a largura toda, e ocupa 40 % da largura da mesa (mínimo 380 px; 7b93c1f); o nome da matéria saiu do topo do professor (61def70); a foto do professor na aba do caderno abre e fecha o painel (92fdd51).

Conferido no navegador na parada 1: a mesa na nota a 1600 e a 1024 px, abrir e fechar pela foto e por Ctrl+J, o seletor, Nova e o custo, a conversa em tela cheia sem mudança, e o aviso "A conversa mudou em outra aba" sem trocar de volta. Não conferido no navegador (abrir um caderno troca a conversa que o Breno está usando): as abas, o chip e o olho, a barra de seleção e a citação; ficam para o roteiro da parada 2.

Lacunas conhecidas: renomear uma nota deixa a aba antiga até ser fechada; na lição, a seleção vale por bloco (o título e o objetivo não abrem a barra); o Alt+F10 leva o foco à barra de seleção (atalho escolhido pelo agente).

