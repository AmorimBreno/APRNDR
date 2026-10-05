#!/usr/bin/env bash
# Instala no WSL (Ubuntu) os programas de sistema que o projeto precisa.
# Precisa de sudo, por isso é o Breno quem roda. Pode rodar de novo sem problema.
#
#   Node.js 22.19+   o pi exige essa versão
#   Google Chrome    o mermaid-cli usa para desenhar os diagramas mermaid
#   librsvg2-bin     o rsvg-convert, que desenha os diagramas SVG
#   tmux             o pi-interactive-subagents só funciona dentro dele (já vem no Ubuntu)
#
# Uso (no WSL, a partir da raiz do repositório):  bash extras/preparar-wsl.sh
set -euo pipefail

echo "== 1/4 Atualizando a lista de pacotes do apt"
sudo apt-get update

echo "== 2/4 Pacotes básicos: tmux, rsvg-convert, git, curl"
sudo apt-get install -y tmux librsvg2-bin git curl ca-certificates

echo "== 3/4 Node.js 22.19 ou mais novo"
# O PATH do WSL inclui o Node do Windows (/mnt/c/Program Files/nodejs), que não
# serve aqui. Por isso olhamos só o node do Linux, em /usr/bin.
node_ok() {
  [ -x /usr/bin/node ] && /usr/bin/node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=19)?0:1)'
}
if node_ok; then
  echo "Node já instalado: $(/usr/bin/node --version)"
else
  candidato=$(apt-cache policy nodejs | awk '/Candidate:/ {print $2; exit}')
  maior=""
  if echo "$candidato" | grep -qE '^([0-9]+:)?[0-9]+\.[0-9]+'; then
    maior=$(echo "$candidato" | sed -E 's/^[0-9]+://; s/^([0-9]+)\.([0-9]+).*/\1 \2/')
  fi
  set -- $maior
  if [ -n "${1:-}" ] && { [ "$1" -gt 22 ] || { [ "$1" -eq 22 ] && [ "${2:-0}" -ge 19 ]; }; }; then
    echo "O Ubuntu oferece o Node $candidato; instalando pelo apt."
    sudo apt-get install -y nodejs npm
  else
    echo "O Node do apt ($candidato) é antigo; instalando o Node 22 pelo repositório oficial da NodeSource."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  node_ok || { echo "Falhou: o Node instalado não é 22.19+"; exit 1; }
  echo "Node instalado: $(/usr/bin/node --version)"
fi

echo "== 4/4 Google Chrome"
# O chromium do apt no Ubuntu é um pacote snap, que costuma falhar no WSL.
# O .deb oficial do Google não depende do snap e já traz as bibliotecas e fontes.
if [ -x /usr/bin/google-chrome-stable ]; then
  echo "Chrome já instalado: $(/usr/bin/google-chrome-stable --version)"
else
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/google-chrome.deb" https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo apt-get install -y "$tmp/google-chrome.deb"
  rm -rf "$tmp"
  echo "Chrome instalado: $(/usr/bin/google-chrome-stable --version)"
fi

echo
echo "Pronto. Conferindo as versões:"
/usr/bin/node --version
tmux -V
rsvg-convert --version
/usr/bin/google-chrome-stable --version
