#!/usr/bin/env bash
# Instala em ~/.pi/agent as peças deste projeto que precisam ficar fora do vault.
# Hoje: as extensões web-search e web-fetch, usadas pelo pesquisador.
#
# Por que copiar e não criar um link: o pi procura extensões nas subpastas de
# ~/.pi/agent/extensions, e a documentação dele avisa que pastas com link
# simbólico podem não ser encontradas. Copiar é garantido. Rode este script de
# novo sempre que mudar algo em extras/pi-agent.
#
# Uso (no WSL, a partir da raiz do repositório):  bash extras/instalar.sh
set -euo pipefail

ORIGEM="$(cd "$(dirname "$0")" && pwd)/pi-agent/extensions"
DESTINO="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/extensions"

mkdir -p "$DESTINO"
for ext in web-search web-fetch; do
  rm -rf "${DESTINO:?}/$ext"
  cp -r "$ORIGEM/$ext" "$DESTINO/$ext"
  echo "instalado: $DESTINO/$ext"
done

# tmux: sem "extended keys" o tmux manda Shift+Enter e Enter como a mesma tecla,
# e o pi não consegue separar "nova linha" de "enviar" (docs/tmux.md do pi).
# O formato csi-u exige tmux 3.5 ou mais novo; o Ubuntu do WSL tem o 3.6.
if ! grep -qs "extended-keys on" "$HOME/.tmux.conf"; then
  {
    echo ""
    echo "# pi: separar Shift+Enter de Enter (adicionado por estudos-ia/extras/instalar.sh)"
    echo "set -g extended-keys on"
    echo "set -g extended-keys-format csi-u"
  } >> "$HOME/.tmux.conf"
  echo "configurado: ~/.tmux.conf (extended keys)"
fi

if [ -z "${TAVILY_API_KEY:-}" ]; then
  echo
  echo "Aviso: TAVILY_API_KEY não está definida neste terminal."
  echo "Sem ela o web_search falha e o web_fetch baixa as páginas direto. Veja docs/instalacao.md."
fi
