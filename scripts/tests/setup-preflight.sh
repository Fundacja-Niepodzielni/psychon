#!/usr/bin/env bash
# Próba sprawdzeń wstępnych scripts/setup.sh (tryb --sprawdz).
# Każdy przypadek uruchamia skrypt z PATH zawierającym WYŁĄCZNIE atrapy narzędzi,
# więc wynik nie zależy od tego, co jest zainstalowane na maszynie.
# Oczekiwanie: komplet narzędzi -> kod 0; brak dowolnego narzędzia -> kod 1 i komunikat "BRAK: ...".
# Uruchom z katalogu głównego repozytorium:  bash scripts/tests/setup-preflight.sh
set -uo pipefail

KORZEN="$(cd "$(dirname "$0")/../.." && pwd -P)"
SKRYPT="$KORZEN/scripts/setup.sh"
BASH_BIN="$(command -v bash)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# atrapa(nazwa, treść) — plik wykonywalny w katalogu atrap danego przypadku
atrapa() { printf '#!%s\n%s\n' "$BASH_BIN" "$3" > "$1/$2"; chmod +x "$1/$2"; }

# komplet(katalog, [wersja_node], [compose_kod], [info_kod])
komplet() {
  mkdir -p "$1"
  atrapa "$1" docker "case \"\$1\" in compose) exit ${3:-0};; info) exit ${4:-0};; esac; exit 0"
  atrapa "$1" node "echo ${2:-v20.11.0}"
  atrapa "$1" npm "exit 0"
}

ZGODNE=0; NIEZGODNE=0
przypadek() { # opis, oczekiwanie (0 | niezero), katalog atrap, [katalog roboczy]
  local kod blad
  blad="$(cd "${4:-$KORZEN}" && PATH="$3" "$BASH_BIN" "$SKRYPT" --sprawdz 2>&1 >/dev/null)"; kod=$?
  # Brak narzędzia ma zatrzymać skrypt w sprawdzeniach wstępnych: kod 1 i komunikat
  # "BRAK:". Inny kod niezerowy (np. 127 z dalszej części skryptu) to nie jest ta kontrola.
  if { [ "$2" = 0 ] && [ "$kod" -eq 0 ]; } \
     || { [ "$2" = niezero ] && [ "$kod" -eq 1 ] && [[ "$blad" == BRAK:* ]]; }; then
    ZGODNE=$((ZGODNE + 1)); echo "ok    kod=$kod  $1"
  else
    NIEZGODNE=$((NIEZGODNE + 1)); echo "BLAD  kod=$kod  $1 (oczekiwano: $2)"
  fi
}

STAN_PRZED="$(git -C "$KORZEN" status --porcelain)"

komplet "$TMP/pelny";                         przypadek "komplet narzędzi"                 0       "$TMP/pelny"
mkdir -p "$TMP/pusty";                        przypadek "brak wszystkich narzędzi"         niezero "$TMP/pusty"
komplet "$TMP/bez-docker"; rm "$TMP/bez-docker/docker"
                                              przypadek "brak docker"                      niezero "$TMP/bez-docker"
komplet "$TMP/bez-compose" v20.11.0 1;        przypadek "brak docker compose"              niezero "$TMP/bez-compose"
komplet "$TMP/bez-demona" v20.11.0 0 1;       przypadek "demon Dockera nie działa"         niezero "$TMP/bez-demona"
komplet "$TMP/bez-node"; rm "$TMP/bez-node/node"
                                              przypadek "brak node"                        niezero "$TMP/bez-node"
komplet "$TMP/node18" v18.19.0;               przypadek "node 18 (za stary)"               niezero "$TMP/node18"
komplet "$TMP/node22" v22.1.0;                przypadek "node 22"                          0       "$TMP/node22"
komplet "$TMP/bez-npm"; rm "$TMP/bez-npm/npm"
                                              przypadek "brak npm"                         niezero "$TMP/bez-npm"
                                              przypadek "uruchomienie spoza katalogu głównego" niezero "$TMP/pelny" "$TMP"

STAN_PO="$(git -C "$KORZEN" status --porcelain)"
if [ "$STAN_PRZED" = "$STAN_PO" ]; then
  ZGODNE=$((ZGODNE + 1)); echo "ok    tryb --sprawdz nie zmienił drzewa roboczego"
else
  NIEZGODNE=$((NIEZGODNE + 1)); echo "BLAD  tryb --sprawdz zmienił drzewo robocze"
fi

echo "zgodne: $ZGODNE  niezgodne: $NIEZGODNE"
[ "$NIEZGODNE" -eq 0 ]
