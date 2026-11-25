# O professor flutuante, a voz pelo atalho e a bandeja do Windows (contrato, versão 2)

Decisão de origem: ESPECIFICACAO.md, 13.21 ("O professor ao lado"). Fases 3, 4 e 6a no docs/PLANO.md, "Novo rumo: o professor ao lado". O Breno anota à mão no Samsung Notes (Windows, S Pen); o professor fica numa bolinha por cima de tudo, abre um chat compacto da mesma conversa, ouve pelo atalho e vê a página quando pedido. Decisões dele: o atalho primeiro (a palavra "professor" é a Fase 5), a resposta em texto (sem voz), o caderno de caneta só depois de um protótipo.

Versão 2 (2026-11-24, pedido do Breno): o protótipo de tinta (R11, Fase 6a) sai por enquanto; entram o ícone nos ícones ocultos da barra de tarefas (R12) e o app subindo com o Windows só com esse ícone (R13), para ele ligar o professor flutuante sem abrir o app. Ele também pediu para conferir que a bolinha e o chat não atrapalham a escrita (o foco da caneta no Samsung Notes).

Regras de sempre: o núcleo não sabe o que é matéria, nota ou plano (o cabeçalho do chat compacto vem do perfil); docs/padroes-de-interface.md vale em toda tela; nada de áudio guardado; a chave do OpenRouter só do ambiente; nada de teste na pasta de dados do Breno.


## 1. Requisitos

Fase 3, o professor flutuante:
- R1 Bolinha: uma janela própria do Electron, sem moldura, transparente, sempre por cima (inclusive do Samsung Notes), fora da barra de tarefas, com a foto do professor (64 px). Arrastável; a posição fica lembrada (%LOCALAPPDATA%\estudos-app\flutuante.json) e sempre dentro de uma tela visível. Aparece sem roubar o foco (showInactive).
- R2 A bolinha mostra o estado: parada, pensando, escrevendo e ouvindo (um anel que pulsa; com movimento reduzido, só a cor muda).
- R3 Chat compacto: o clique na bolinha (sem arrastar) abre o chat compacto (420 × 620), sempre por cima. O chat é um balão de conversa AO LADO da bolinha (que não sai do lugar), com bordas arredondadas e uma pontinha voltada para ela; a bolinha o abre e o fecha (clicar de novo), e não há botão "Recolher". É a MESMA conversa que está aberta no app (a mesma sessão do servidor, sem trocar nada): o que se pergunta nele aparece na mesa e vice-versa. O topo vem do perfil (no de estudos: a matéria da conversa e o seletor de plano), e é por ele que se arrasta o balão (a bolinha vai junto).
- R4 Atalho global Ctrl+Alt+P: abre e recolhe o chat compacto de qualquer lugar do Windows. Fechar a janela principal não fecha a bolinha (o app continua no ar com ela); a bolinha tem "Abrir o app" e "Esconder a bolinha". Sem janela nenhuma, o Electron sai. O "Sair do app" fecha as duas.
- R5 "Olha minha página": um botão no chat compacto captura a tela onde a bolinha está, escondendo a bolinha e o chat durante a captura (lado maior até 2000 px, JPEG 85), e a imagem vai junto da próxima mensagem (aparece como um chip "Captura da tela" com X antes de mandar). O professor (GPT-6.1 Sol, que aceita imagem: conferido no catálogo do pi) lê a anotação. No núcleo, a mensagem aceita imagens (genérico).
- R6 A bolinha se liga e desliga (lembrado em flutuante.json): pelo menu da bolinha ("Esconder a bolinha") e por um botão na tela de perfis ("Mostrar o professor flutuante"), só na janela própria.

Fase 4, a voz pelo atalho:
- R7 Ctrl+Alt+Espaço (global) ou o botão de microfone do chat compacto começa a gravar; de novo, para. Gravando, a bolinha (ou o botão) pulsa e mostra o tempo; para sozinha em 60 s. Se o chat estava recolhido, ele abre.
- R8 O áudio (WAV 16 kHz mono, convertido no front) vai ao servidor, que transcreve pela API do OpenRouter (POST https://openrouter.ai/api/v1/audio/transcriptions, JSON com input_audio {data, format: "wav"}, language "pt"), com a OPENROUTER_API_KEY do ambiente. O modelo vem do profile.json (transcricao.modelo; padrão openai/whisper-large-v3). O áudio não é gravado em disco nem nos logs; o log diz só a duração e o custo.
- R9 O texto aparece no campo do chat compacto e é enviado sozinho depois de 2 s, com "Cancelar" e com a edição parando a contagem. A resposta vem em texto.
- R10 O Electron libera o microfone (permissão "media", só áudio) só para o front do app; as outras continuam negadas. Microfone negado ou sem dispositivo: aviso claro no chat ("Não consegui usar o microfone").

Fase 6a, o protótipo de tinta (FORA DESTA RODADA, versão 2):
- R11 Uma tela à parte, #/perfil/estudos/tinta-teste (sem botão na interface; o roteiro diz o endereço), com uma página pautada no rosa das notas do Breno: caneta com pressão (perfect-freehand), 4 cores (preto, vermelho, azul, amarelo), marca-texto (amarelo translúcido, atrás da tinta), borracha (o botão da S Pen, pointer buttons 32, ou a ferramenta), desfazer (Ctrl+Z e botão); desenhar só com pointerType "pen" (e mouse, para testar), o toque rola a página e a palma é ignorada; canvas com desynchronized; o traço é desenhado direto no canvas a cada pointermove (coalesced events), e os traços prontos ficam numa camada já desenhada. Um medidor mostra a latência média (do evento ao quadro) e os quadros por segundo. Nada é gravado em disco (só na memória da tela).


A bandeja do Windows (versão 2):
- R12 Um ícone do app (o do professor, apps/desktop/assets/icone.ico) na bandeja do Windows (os ícones ocultos ao lado do relógio), sempre que o Electron está no ar. Clique esquerdo: liga e mostra a bolinha, ou esconde se ela está à vista (grava ligada). Menu do clique direito: "Mostrar o professor" / "Esconder o professor", "Abrir o app", "Iniciar com o Windows" (caixa de marcar), "Sair do app" (o mesmo sairDoApp). Dica do ícone: "APRNDR · professor". Com a bandeja, fechar a janela principal não sai do app: o Electron fica vivo na bandeja (window-all-closed não sai mais); só o "Sair do app" encerra.
- R13 Iniciar com o Windows: um atalho "APRNDR (bandeja)" na pasta Inicializar do usuário (shell:startup, %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup) que roda wscript launcher\iniciar.vbs com o argumento --bandeja; o iniciar.vbs repassa os argumentos ao iniciar.mjs; com --bandeja, o lançador sobe o pnpm dev escondido como sempre e abre o Electron com --bandeja (sem a janela principal: só a bandeja e a bolinha, se ligada). Abrir o atalho "Estudos" com o Electron já na bandeja mostra a janela principal (second-instance). A caixa "Iniciar com o Windows" cria ou apaga esse atalho (shell.writeShortcutLink); ligada por padrão na primeira vez que o Electron abre (grava em flutuante.json que a escolha já foi feita, para não recriar se o Breno desligar).

## 2. Contratos entre os pacotes

2.1 Mensagem com imagens (núcleo, WP-A):

    // packages/core/src/protocolo.ts
    ImagemMensagem { tipo: "image/png" | "image/jpeg" | "image/webp"; dados: string }   // base64 sem "data:"
    pedido "enviar": { tipo, perfil, texto, contextosTela?, imagens?: ImagemMensagem[] }   // até 3, cada uma até 8 MB de base64

    JanelaPerfil.enviar(texto, contextosTela?, imagens?) -> a fila própria guarda as imagens junto; prompt(texto, { images: [{ type: "image", data, mimeType }] }).
    Evento "mensagem_usuario" ganha imagens?: number (quantas); converterHistorico conta as imagens da mensagem do usuário.
    packages/ui: AcoesJanela.enviar(texto, contextosTela?, imagens?); ItemUsuarioConversa.imagens?: number; a nota do usuário na conversa mostra um chip "1 imagem" (ou "N imagens"). O log do servidor registra só quantas imagens e o tamanho, nunca os dados.

2.2 Transcrição (servidor, WP-A):

    POST /api/transcrever  body { perfil: string; audio: string (base64 de um WAV); formato: "wav" }  (até 10 MB)
    200 { texto: string; segundos?: number; custo?: number }
    4xx/5xx { erro: string }   // frase para a tela, em português
    O modelo: perfil.transcricao?.modelo (profile.json "transcricao": { "modelo": "openai/whisper-large-v3" }), validado no esquema do perfil.

2.3 A ponte do Electron (WP-B implementa no preload; WP-C usa):

    window.estudosDesktop (já existe: plataforma, alturaBarra, sair) ganha:
      flutuante?: {
        // só na janela da bolinha
        modo(): Promise<"bolinha" | "chat">;
        disposicao(): Promise<Disposicao | null>;  // a atual; null no modo bolinha
        expandir(): Promise<void>;            // abre o balão ao lado da bolinha
        recolher(): Promise<void>;            // fecha o balão: volta a bolinha
        moverPara(x: number, y: number): void; // posição da BOLINHA em pixels da tela (nos dois modos; no chat a janela anda junto)
        capturarTela(): Promise<{ tipo: "image/jpeg"; dados: string; largura: number; altura: number } | null>;
        abrirApp(): Promise<void>;
        esconder(): Promise<void>;            // "Esconder a bolinha" (grava ligado: false)
        aoMudarModo(cb: (modo: "bolinha" | "chat", disposicao?: Disposicao) => void): () => void;
        aoAlternarVoz(cb: () => void): () => void;   // o atalho Ctrl+Alt+Espaço
      };
      // em qualquer janela do app
      bolinha?: { ligada(): Promise<boolean>; ligar(ligada: boolean): Promise<void> };

    Disposicao (pixels; calculada pelo Electron em estado-flutuante.mjs, disposicaoDoChat, e conferida na tela por lerDisposicao):
      { janela: {x, y, width, height},      // o retângulo da janela na tela (contém a bolinha e o balão)
        bolinha: {x, y},                    // o quadro de 76 × 76 da bolinha, dentro da janela
        balao: {x, y, width, height},       // o balão (420 × 620), dentro da janela
        lado: "esquerda" | "direita",       // de que lado da bolinha o balão fica
        ponta: {y} }                        // o centro vertical da bolinha dentro do balão, a pelo menos 24 px das bordas dele

    O balão vai para a esquerda da bolinha se o centro dela está na metade direita da área útil da tela, senão para a direita; se o centro está na metade de baixo, o fundo do balão alinha com o da bolinha (cresce para cima), senão o topo alinha com o topo. Entre os dois há um vão de 14 px, onde fica a pontinha. Se não couber na vertical, o balão desliza para dentro da área (a bolinha não se mexe); se não couber do lado escolhido, usa o outro. Expandir faz setBounds(disposicao.janela) na MESMA janela; recolher volta ao quadro da bolinha. No modo chat, arrastar o balão pelo topo (arrasto nativo) leva a janela e a bolinha juntas, com a disposição guardada, e a posição da bolinha (janela + disposicao.bolinha) é a que fica gravada. O Electron recorta a janela (BrowserWindow.setShape) na bolinha, no balão e na pontinha, para o vazio em volta deixar o clique passar ao app de trás; sem setShape, segue sem recorte.

    A janela da bolinha carrega URL_APP + "/#/flutuante/estudos" (o perfil vem da rota), com o mesmo preload (o argumento --estudos-janela=flutuante diz ao preload que é ela). Fundo transparente: a página da rota flutuante nunca pinta o fundo (html, body e raiz), nos dois modos, com zoom 1; só o conteúdo do balão usa o zoom do app (0,9).

2.4 A tela flutuante (WP-C):

    apps/web: rota "#/flutuante/<perfil>" -> TelaFlutuante (genérica). Usa useJanelaPerfil(perfil) (abre o perfil sem sessaoId: entra na conversa aberta no servidor).
    packages/ui/telas-iniciais.ts: EntradaTelaInicial ganha cabecalhoFlutuante?: ComponentType<{ janela: JanelaPerfilHook }>.
    profiles/estudos/paineis: CabecalhoFlutuante (a matéria da conversa, pela chave "materia:<id>" do contexto, e o SeletorPlano dela; sem matéria, "Conversa geral").


## 3. Pacotes (arquivos exclusivos; paralelo)

- WP-A (Sonnet), núcleo e servidor: packages/core (protocolo, janela-perfil, eventos, perfis/esquema do profile.json), packages/ui (use-janela-perfil, estado-janela, a nota do usuário na Conversa), apps/server (a passagem das imagens, a rota /api/transcrever, o log), profiles/estudos/profile.json (transcricao), e os testes.
- WP-B (Sonnet), Electron e lançador: apps/desktop/src (main.mjs, preload.cjs, um módulo novo para a bolinha e o estado dela, a bandeja, os testes puros), launcher/iniciar.vbs e launcher/iniciar.mjs (o --bandeja), docs/janela-propria.md (as mudanças de comportamento).
- WP-C (Sonnet), a tela flutuante e a voz no front: apps/web/src (a rota, TelaFlutuante, a gravação e o WAV, o chip da captura, o botão da tela de perfis), packages/ui/src/telas-iniciais.ts (só o campo cabecalhoFlutuante), profiles/estudos/paineis/src (CabecalhoFlutuante.tsx e o registro em index.ts), e os testes. Usa as assinaturas de 2.1 a 2.4 mesmo antes de WP-A e WP-B terminarem.
- WP-D, o protótipo de tinta: fora desta rodada (versão 2).
- (antigo WP-D) profiles/estudos/paineis/src (TintaTeste.tsx, tinta.ts, o CSS e a rota "tinta-teste" em TelaEstudos.tsx), a dependência perfect-freehand no package.json do paineis, e os testes puros.
- Depois: revisão por diff, pnpm typecheck e pnpm test, um commit por pacote; conferência de verdade (a janela do Electron com captura, uma transcrição real com um WAV gerado, uma mensagem com imagem ao modelo numa pasta temporária); roteiros docs/teste-flutuante.md e docs/teste-tinta.md; code-review.
