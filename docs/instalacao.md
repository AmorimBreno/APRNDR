# Instalação no WSL

Este roteiro prepara o Ubuntu do WSL para rodar o pi. Os passos 1 e 2 são seus, porque pedem a sua senha (sudo) e as suas chaves. Depois deles, o Claude Code faz o resto (passo 3).

O caminho do repositório dentro do WSL é /mnt/c/Users/Pichau/Desktop/DEV/projeto-estudos. Todo comando abaixo roda num terminal do Ubuntu (WSL), não no PowerShell.


## 1. Programas de sistema

Abra o Ubuntu (menu Iniciar, "Ubuntu", ou wsl no PowerShell) e rode:

```bash
cd /mnt/c/Users/Pichau/Desktop/DEV/projeto-estudos
bash extras/preparar-wsl.sh
```

O script pede a senha do seu usuário do Ubuntu uma vez e instala:

- Node.js 22.19 ou mais novo, porque o pi exige essa versão. O Node do Windows (22.17) não serve dentro do WSL.
- Google Chrome, que o mermaid-cli usa para desenhar os diagramas. O chromium do apt no Ubuntu vem como snap, que costuma falhar no WSL. Por isso o script usa o .deb oficial do Google.
- librsvg2-bin (o comando rsvg-convert), que desenha os diagramas SVG.
- tmux, que já vem instalado (versão 3.6), mas o script confere.

No fim ele mostra as versões. Se algo falhar, copie a saída e mande para o Claude Code.


## 2. Chaves de API

As chaves ficam num arquivo só seu, fora do repositório, lido pelo terminal toda vez que ele abre.

1. Crie o arquivo e deixe só o seu usuário ler:

```bash
mkdir -p ~/.config/estudos-ia && touch ~/.config/estudos-ia/chaves.env && chmod 600 ~/.config/estudos-ia/chaves.env
```

2. Abra o arquivo no editor:

```bash
nano ~/.config/estudos-ia/chaves.env
```

Escreva as duas linhas abaixo, trocando os valores pelas suas chaves. A do OpenRouter fica em openrouter.ai/keys e a do Tavily em app.tavily.com. Salve com Ctrl+O, Enter, e saia com Ctrl+X.

```
export OPENROUTER_API_KEY="cole-aqui-a-chave-do-openrouter"
export TAVILY_API_KEY="cole-aqui-a-chave-do-tavily"
```

3. Faça o terminal ler esse arquivo sempre que abrir:

```bash
echo '[ -f ~/.config/estudos-ia/chaves.env ] && . ~/.config/estudos-ia/chaves.env' >> ~/.bashrc
```

4. Feche o terminal do Ubuntu, abra de novo e confira. O comando abaixo só mostra se cada chave existe, sem mostrar o valor:

```bash
for v in OPENROUTER_API_KEY TAVILY_API_KEY; do [ -n "${!v}" ] && echo "$v ok" || echo "$v FALTANDO"; done
```

Um cuidado com o tmux: ele guarda as variáveis do momento em que o servidor dele foi aberto. Se algum dia você mudar uma chave com o tmux já aberto, rode tmux kill-server (fecha todas as sessões do tmux) e abra de novo.


## 3. O resto, feito pelo Claude Code

Quando os passos 1 e 2 estiverem prontos, avise. O Claude Code então:

1. instala o pi e o pi-interactive-subagents;
2. roda npm install em vault/.pi/extensions/visual-tools (o mermaid-cli);
3. roda extras/instalar.sh, que copia web_search e web_fetch para ~/.pi/agent/extensions e configura o ~/.tmux.conf;
4. confere tudo e deixa pronto para o roteiro docs/teste-fase-1.md.
