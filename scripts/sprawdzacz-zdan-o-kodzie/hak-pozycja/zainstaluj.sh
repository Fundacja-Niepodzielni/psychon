#!/usr/bin/env bash
# Instaluje hak commit-msg (Pozycja: NN) we WLASNYM klonie tego, kto to
# uruchamia. Dzialanie jednorazowe, lokalne, odwracalne (usun
# .git/hooks/commit-msg). Nie zmienia ci.yml, nie dotyka innych klonow.
set -euo pipefail
TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KORZEN="$(git -C "$TU" rev-parse --show-toplevel)"
CEL="$KORZEN/.git/hooks/commit-msg"
cp "$TU/commit-msg" "$CEL"
chmod +x "$CEL"
echo "zainstalowano: $CEL"
