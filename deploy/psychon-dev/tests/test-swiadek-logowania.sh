#!/usr/bin/env bash
# Test funkcji _swiadek_logowania_ocena z deploy/psychon-dev/deploy.sh, bez
# zywego hosta. `source deploy.sh` definiuje funkcje i konczy sie natychmiast
# (BASH_SOURCE[0] != $0), bez uruchamiania prawdziwego wdrozenia - zaden krok
# skryptu (docker compose, migracje, prawdziwe curl) sie tu nie odbywa.
#
# Kazdy przypadek podaje gotowa Location (jak po 302 z /api/auth/signin/keycloak)
# i cialo strony IdP (jak po GET tej Location) - dokladnie to, co dostaje
# funkcja w deploy.sh, tyle ze spreparowane, a nie pobrane z sieci.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../deploy.sh
source "$TU/../deploy.sh"

ISS="https://konta.niepodzielni.com/realms/niepodzielni"
DOMENA="psychon-dev.niepodzielni.com"

PLIKI_TESTOWE=()
trap 'rm -f "${PLIKI_TESTOWE[@]}"' EXIT

nowy_plik_strony() {
  local plik
  plik="$(mktemp)"
  printf '%s' "$1" > "$plik"
  PLIKI_TESTOWE+=("$plik")
  printf '%s' "$plik"
}

NIEZALICZONE=0
uruchom_przypadek() {
  local nazwa="$1" loc="$2" kod_strony="$3" cialo="$4" oczekiwany_exit="$5"
  local plik_strony wyjscie exit_kod
  plik_strony="$(nowy_plik_strony "$cialo")"

  echo "=== $nazwa ==="
  wyjscie="$(_swiadek_logowania_ocena "$ISS" "$DOMENA" "$loc" "$kod_strony" "$plik_strony")"
  exit_kod=$?
  echo "$wyjscie"
  echo "  exit=$exit_kod (oczekiwano $oczekiwany_exit)"

  if [[ "$exit_kod" -ne "$oczekiwany_exit" ]]; then
    echo "  WYNIK: NIEZALICZONY - zly kod wyjscia funkcji"
    NIEZALICZONE=$((NIEZALICZONE + 1))
    return
  fi

  if [[ "$oczekiwany_exit" -eq 0 ]]; then
    if printf '%s' "$wyjscie" | grep -q 'BLAD'; then
      echo "  WYNIK: NIEZALICZONY - oczekiwano samych OK, jest BLAD"
      NIEZALICZONE=$((NIEZALICZONE + 1))
      return
    fi
  fi

  echo "  WYNIK: ZALICZONY"
}

zawiera_linie_blad() {
  # $1=wyjscie, $2=fragment etykiety assercji (np. "(c)")
  printf '%s\n' "$1" | grep -E "^  $2 .*BLAD" >/dev/null
}

FORMULARZ_KC='<html><body><form id="kc-form-login">login</form></body></html>'
BLAD_400='<html><body><h1>400 Bad Request</h1><p>redirect_uri niedozwolony</p></body></html>'

# --- Przypadek 1: poprawna Location -> ZALICZONY -----------------------------
LOC_OK="$ISS/protocol/openid-connect/auth?client_id=psychon-web&redirect_uri=https%3A%2F%2F$DOMENA%2Fapi%2Fauth%2Fcallback%2Fkeycloak&code_challenge_method=S256&response_type=code"
uruchom_przypadek "1 poprawna Location" "$LOC_OK" "200" "$FORMULARZ_KC" 0

# --- Przypadek 2: redirect_uri z localhost:3000 -> BLAD (c) i (d) -----------
LOC_LOCALHOST="$ISS/protocol/openid-connect/auth?client_id=psychon-web&redirect_uri=https%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback%2Fkeycloak&code_challenge_method=S256&response_type=code"
echo
WYJSCIE_2="$(_swiadek_logowania_ocena "$ISS" "$DOMENA" "$LOC_LOCALHOST" "200" "$(nowy_plik_strony "$FORMULARZ_KC")")"
EXIT_2=$?
echo "=== 2 redirect_uri z localhost:3000 ==="
echo "$WYJSCIE_2"
echo "  exit=$EXIT_2 (oczekiwano 1)"
if [[ "$EXIT_2" -ne 1 ]] || ! zawiera_linie_blad "$WYJSCIE_2" '\(c\)' || ! zawiera_linie_blad "$WYJSCIE_2" '\(d\)'; then
  echo "  WYNIK: NIEZALICZONY - oczekiwano BLAD na (c) i (d)"
  NIEZALICZONE=$((NIEZALICZONE + 1))
else
  echo "  WYNIK: ZALICZONY"
fi

# --- Przypadek 3: zly client_id -> BLAD (b) ---------------------------------
LOC_ZLY_CLIENT="$ISS/protocol/openid-connect/auth?client_id=inny-klient&redirect_uri=https%3A%2F%2F$DOMENA%2Fapi%2Fauth%2Fcallback%2Fkeycloak&code_challenge_method=S256&response_type=code"
echo
WYJSCIE_3="$(_swiadek_logowania_ocena "$ISS" "$DOMENA" "$LOC_ZLY_CLIENT" "200" "$(nowy_plik_strony "$FORMULARZ_KC")")"
EXIT_3=$?
echo "=== 3 zly client_id ==="
echo "$WYJSCIE_3"
echo "  exit=$EXIT_3 (oczekiwano 1)"
if [[ "$EXIT_3" -ne 1 ]] || ! zawiera_linie_blad "$WYJSCIE_3" '\(b\)'; then
  echo "  WYNIK: NIEZALICZONY - oczekiwano BLAD na (b)"
  NIEZALICZONE=$((NIEZALICZONE + 1))
else
  echo "  WYNIK: ZALICZONY"
fi

# --- Przypadek 4: strona IdP bez kc-form-login (np. 400) -> BLAD (f) -------
echo
WYJSCIE_4="$(_swiadek_logowania_ocena "$ISS" "$DOMENA" "$LOC_OK" "400" "$(nowy_plik_strony "$BLAD_400")")"
EXIT_4=$?
echo "=== 4 strona IdP bez kc-form-login (400) ==="
echo "$WYJSCIE_4"
echo "  exit=$EXIT_4 (oczekiwano 1)"
if [[ "$EXIT_4" -ne 1 ]] || ! zawiera_linie_blad "$WYJSCIE_4" '\(f\)'; then
  echo "  WYNIK: NIEZALICZONY - oczekiwano BLAD na (f)"
  NIEZALICZONE=$((NIEZALICZONE + 1))
else
  echo "  WYNIK: ZALICZONY"
fi

echo
if [[ "$NIEZALICZONE" -eq 0 ]]; then
  echo "TESTY SWIADKA LOGOWANIA: WSZYSTKIE ZALICZONE"
  exit 0
else
  echo "TESTY SWIADKA LOGOWANIA: NIEZALICZONE PRZYPADKI: $NIEZALICZONE"
  exit 1
fi
