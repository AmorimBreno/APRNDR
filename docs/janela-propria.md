# Teste da janela própria do app

Objetivo: confirmar que o app abre numa janela própria (sem a aba do Edge), com a barra do app, os botões do Windows e o ícone do professor, e que abrir, arrastar, maximizar, fechar e parar funcionam. Decisão 13.20 da especificação.

Tempo: uns 10 minutos. Custo: nenhum (não chama modelo).

No fim, anote o resultado de cada passo e mande para o Claude Code.


## Antes de começar

1. Se o app estiver rodando por um terminal (pnpm dev), pare com Ctrl+C, ou use o atalho "Parar Estudos".
2. Se o ícone do atalho "Estudos" ainda for o do Edge, rode uma vez: `powershell -ExecutionPolicy Bypass -File scripts\criar-atalho.ps1`.


## Roteiro

1. Digite "aprndr" na pesquisa do Windows e abra o resultado (ou dê dois cliques no atalho "Estudos" da área de trabalho). Esperado: o ícone do atalho é o do professor; depois de alguns segundos abre uma janela com a barra escura no topo (a marca APRNDR à esquerda e minimizar, maximizar e fechar à direita), sem aba e sem o globo do Edge. Na barra de tarefas, o ícone é o do professor.
2. A tela de perfis aparece inteira, sem barra de rolagem e sem corte embaixo. Abra o perfil Estudos e um caderno: o topo vermelho fica logo abaixo da barra escura, e a tela de baixo continua inteira.
3. Arraste a janela segurando na barra escura (em qualquer ponto sem botão). Esperado: ela anda. Dê duplo clique na barra: maximiza; outro duplo clique: volta ao tamanho de antes.
4. Passe o mouse no botão de maximizar. Esperado: no Windows 11, aparece o menu de encaixe (layouts). Encaixe a janela na metade da tela e volte.
5. Redimensione a janela pelas bordas e pelos cantos. Esperado: o conteúdo acompanha, sem faixa vazia, e a janela não fica menor do que 900 por 600.
6. Troque de tela várias vezes (perfis, caderno, nota, conversa). Esperado: a barra escura não pisca nem se mexe na troca.
7. Com a janela aberta, dê dois cliques no atalho "Estudos" de novo. Esperado: não abre uma segunda janela; a que já existe vem para a frente, sem recarregar (o que você estava digitando continua).
8. Mude o tamanho e a posição da janela, feche no X e abra pelo atalho. Esperado: ela abre no mesmo tamanho e no mesmo lugar (e maximizada, se estava). O servidor continua no ar depois de fechar: abrir de novo é rápido.
9. Clique num link para fora do app (por exemplo, um link de uma resposta do professor). Esperado: abre no navegador padrão, não dentro da janela.
10. Aperte F12: abrem as ferramentas de desenvolvedor. Ctrl+R recarrega a página. Ctrl+mais, Ctrl+menos e Ctrl+0 mudam o zoom.
11. Na tela de perfis, clique em "Sair do app" (ao lado de Recarregar). Esperado: a janela fecha na hora e, em poucos segundos, o servidor para (o app deixa de responder em localhost:7430). Abra de novo pelo atalho ou pela pesquisa do Windows ("aprndr"): sobe tudo outra vez. O botão não existe no navegador comum, só na janela própria.
12. Opcional: abra o app, pare só o servidor (matando o pnpm dev) e olhe a janela. Esperado: o que está na tela continua; só uma tela nova que não carregar mostra "Reconectando…" (depois de 1 segundo) e volta sozinha quando o servidor sobe.


## O que lembrar

- Os últimos blocos usados do menu "/" recomeçaram do zero: o Electron guarda o localStorage num perfil próprio (%LOCALAPPDATA%\estudos-app\electron), diferente do Edge.
- Se o app abrir no Edge em vez da janela própria, o Electron não está instalado: rode `pnpm install` e, se faltar o binário, `node apps/desktop/node_modules/electron/install.js`.
- Tamanho e posição da janela ficam em %LOCALAPPDATA%\estudos-app\janela.json; apagar o arquivo volta ao padrão.
