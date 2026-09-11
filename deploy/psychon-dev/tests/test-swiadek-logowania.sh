#!/usr/bin/env bash
# Test funkcji _swiadek_logowania_ocena i _swiadek_logowania_czytaj_klucz z
# deploy/psychon-dev/deploy.sh, bez zywego hosta. `source deploy.sh` definiuje
# funkcje i konczy sie natychmiast (BASH_SOURCE[0] != $0), bez uruchamiania
# prawdziwego wdrozenia - zaden krok skryptu (docker compose, migracje,
# prawdziwe curl) sie tu nie odbywa - CZESC 1 i CZESC 2a nizej korzystaja
# tylko z tego. CZESC 2b uruchamia deploy.sh jako oddzielny proces (nie
# zrodlowany), z zaslepkami docker/curl/stat na PATH, zeby zmierzyc, co
# naprawde robi caly skrypt (w tym `set -euo pipefail`) na spreparowanym
# .env - to jedyny sposob, zeby zobaczyc kod wyjscia calego wdrozenia.
#
# Wszystkie wartosci ponizej (domeny, issuery, tokeny) sa fikcyjne
# (CANARY/przyklad.test) - zaden prawdziwy sekret ani host nie jest tu
# uzywany.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/psychon-dev/deploy.sh
source "$TU/../deploy.sh"

ISS="https://konta.niepodzielni.com/realms/niepodzielni"
DOMENA="psychon-dev.niepodzielni.com"

PLIKI_TESTOWE=()
KATALOGI_TESTOWE=()
trap 'rm -f "${PLIKI_TESTOWE[@]}" 2>/dev/null; rm -rf "${KATALOGI_TESTOWE[@]}" 2>/dev/null' EXIT

# Zapisuje $1 do nowego pliku tymczasowego i wpisuje jego sciezke do
# OSTATNI_PLIK. Rejestruje plik do sprzatania W TEJ SAMEJ powloce (nie
# przez `$(...)`, bo substytucja polecen zawsze uruchamia funkcje w
# podpowloce - dopisanie do PLIKI_TESTOWE tam nie przetrwa poza nia, co
# wczesniej zostawialo pliki w TMPDIR po kazdym uruchomieniu).
OSTATNI_PLIK=""
nowy_plik_strony() {
  local plik
  plik="$(mktemp)"
  printf '%s' "$1" > "$plik"
  OSTATNI_PLIK="$plik"
  PLIKI_TESTOWE+=("$plik")
}

NIEZALICZONE=0

zawiera_linie_blad() {
  # $1=wyjscie, $2=fragment etykiety assercji (np. "(c)")
  printf '%s\n' "$1" | grep -E "^  $2 .*BLAD" >/dev/null
}

# $1=nazwa, $2=Location, $3=kod strony IdP, $4=cialo strony IdP,
# $5=oczekiwany kod wyjscia funkcji, $6..=etykiety ktore MUSZA byc BLAD gdy
# oczekiwany kod wyjscia != 0 (np. '\(c\)' '\(d\)'). Gdy oczekiwany kod == 0,
# caly wynik musi byc bez zadnego BLAD.
uruchom_przypadek() {
  local nazwa="$1" loc="$2" kod_strony="$3" cialo="$4" oczekiwany_exit="$5"
  shift 5
  local wymagane_blad=("$@")
  local plik_strony wyjscie exit_kod niezal=0

  nowy_plik_strony "$cialo"
  plik_strony="$OSTATNI_PLIK"

  echo "=== $nazwa ==="
  wyjscie="$(_swiadek_logowania_ocena "$ISS" "$DOMENA" "$loc" "$kod_strony" "$plik_strony")"
  exit_kod=$?
  echo "$wyjscie"
  echo "  exit=$exit_kod (oczekiwano $oczekiwany_exit)"

  if [[ "$exit_kod" -ne "$oczekiwany_exit" ]]; then
    echo "  WYNIK: NIEZALICZONY - zly kod wyjscia funkcji"
    niezal=1
  elif [[ "$oczekiwany_exit" -eq 0 ]]; then
    if printf '%s' "$wyjscie" | grep -q 'BLAD'; then
      echo "  WYNIK: NIEZALICZONY - oczekiwano samych OK, jest BLAD"
      niezal=1
    fi
  else
    local etykieta
    for etykieta in "${wymagane_blad[@]}"; do
      if ! zawiera_linie_blad "$wyjscie" "$etykieta"; then
        echo "  WYNIK: NIEZALICZONY - brak BLAD na $etykieta"
        niezal=1
      fi
    done
  fi

  if [[ "$niezal" -eq 1 ]]; then
    NIEZALICZONE=$((NIEZALICZONE + 1))
  else
    echo "  WYNIK: ZALICZONY"
  fi
}

FORMULARZ_KC='<html><body><form id="kc-form-login">login</form></body></html>'
# Dwie linie z "kc-form-login" (grep -c liczy LINIE, nie wystapienia) -
# tak wyglada strona z dwoma formularzami logowania.
FORMULARZ_KC_2X=$'<html><body>\n<form id="kc-form-login">a</form>\n<form id="kc-form-login">b</form>\n</body></html>'
BLAD_400='<html><body><h1>400 Bad Request</h1><p>redirect_uri niedozwolony</p></body></html>'

LOC_OK="$ISS/protocol/openid-connect/auth?client_id=psychon-web&redirect_uri=https%3A%2F%2F$DOMENA%2Fapi%2Fauth%2Fcallback%2Fkeycloak&code_challenge_method=S256&response_type=code"
LOC_LOCALHOST="$ISS/protocol/openid-connect/auth?client_id=psychon-web&redirect_uri=https%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback%2Fkeycloak&code_challenge_method=S256&response_type=code"
LOC_ZLY_CLIENT="$ISS/protocol/openid-connect/auth?client_id=inny-klient&redirect_uri=https%3A%2F%2F$DOMENA%2Fapi%2Fauth%2Fcallback%2Fkeycloak&code_challenge_method=S256&response_type=code"
LOC_ZLY_ISS="https://obcy-idp.przyklad.test/protocol/openid-connect/auth?client_id=psychon-web&redirect_uri=https%3A%2F%2F$DOMENA%2Fapi%2Fauth%2Fcallback%2Fkeycloak&code_challenge_method=S256&response_type=code"
LOC_BEZ_S256="$ISS/protocol/openid-connect/auth?client_id=psychon-web&redirect_uri=https%3A%2F%2F$DOMENA%2Fapi%2Fauth%2Fcallback%2Fkeycloak&code_challenge_method=plain&response_type=code"
LOC_LOCALHOST_POZA="$ISS/protocol/openid-connect/auth?client_id=psychon-web&redirect_uri=https%3A%2F%2F$DOMENA%2Fapi%2Fauth%2Fcallback%2Fkeycloak&code_challenge_method=S256&response_type=code&debug_info=localhost-fallback"
# F-104 - dopasowania PODCIAGIEM w starym kodzie: kazda z tych trzech
# Location ma dokladnie JEDNA wade, ktorej podciag nie lapal.
LOC_CLIENT_ID_EVIL="$ISS/protocol/openid-connect/auth?client_id=psychon-web-evil&redirect_uri=https%3A%2F%2F$DOMENA%2Fapi%2Fauth%2Fcallback%2Fkeycloak&code_challenge_method=S256&response_type=code"
LOC_CCM_X="$ISS/protocol/openid-connect/auth?client_id=psychon-web&redirect_uri=https%3A%2F%2F$DOMENA%2Fapi%2Fauth%2Fcallback%2Fkeycloak&code_challenge_method=S256x&response_type=code"
LOC_AUTHX="$ISS/protocol/openid-connect/authx?client_id=psychon-web&redirect_uri=https%3A%2F%2F$DOMENA%2Fapi%2Fauth%2Fcallback%2Fkeycloak&code_challenge_method=S256&response_type=code"

# ============================ CZESC 1: _swiadek_logowania_ocena ============
uruchom_przypadek "1 poprawna Location" "$LOC_OK" "200" "$FORMULARZ_KC" 0
uruchom_przypadek "2 redirect_uri z localhost:3000 (c i d)" "$LOC_LOCALHOST" "200" "$FORMULARZ_KC" 1 '\(c\)' '\(d\)'
uruchom_przypadek "3 zly client_id (b)" "$LOC_ZLY_CLIENT" "200" "$FORMULARZ_KC" 1 '\(b\)'
uruchom_przypadek "4 strona IdP bez kc-form-login, 400 (f)" "$LOC_OK" "400" "$BLAD_400" 1 '\(f\)'
uruchom_przypadek "5 obcy issuer, reszta OK (tylko a)" "$LOC_ZLY_ISS" "200" "$FORMULARZ_KC" 1 '\(a\)'
uruchom_przypadek "6 brak S256, reszta OK (tylko e)" "$LOC_BEZ_S256" "200" "$FORMULARZ_KC" 1 '\(e\)'
uruchom_przypadek "7 'localhost' poza redirect_uri, reszta OK (tylko d)" "$LOC_LOCALHOST_POZA" "200" "$FORMULARZ_KC" 1 '\(d\)'
uruchom_przypadek "8 dwa formularze kc-form-login (tylko f)" "$LOC_OK" "200" "$FORMULARZ_KC_2X" 1 '\(f\)'

# F-104 - podciag zamiast dokladnego dopasowania parametru/prefiksu: kazdy z
# tych czterech przypadkow byl (w starym kodzie na 7bc7dd2) BLEDNIE zielony,
# bo szukany napis jest podciagiem tego, co naprawde wystapilo w Location
# albo w stronie IdP.
FORMULARZ_KC_2X_JEDNA_LINIA='<html><body><form id="kc-form-login">a</form><form id="kc-form-login">b</form></body></html>'
uruchom_przypadek "22 client_id=psychon-web-evil, podciag 'client_id=psychon-web' nie wystarcza (b)" \
  "$LOC_CLIENT_ID_EVIL" "200" "$FORMULARZ_KC" 1 '\(b\)'
uruchom_przypadek "23 code_challenge_method=S256x, podciag 'S256' nie wystarcza (e)" \
  "$LOC_CCM_X" "200" "$FORMULARZ_KC" 1 '\(e\)'
uruchom_przypadek "24 dwa kc-form-login w JEDNEJ linii, grep -c liczy linie nie wystapienia (f)" \
  "$LOC_OK" "200" "$FORMULARZ_KC_2X_JEDNA_LINIA" 1 '\(f\)'
uruchom_przypadek "25 .../authx zamiast .../auth?..., podciag 'auth' nie wystarcza (a)" \
  "$LOC_AUTHX" "200" "$FORMULARZ_KC" 1 '\(a\)'

# ============================ CZESC 2a: _swiadek_logowania_czytaj_klucz ====
# Fikcyjne pliki .env - same wartosci canary, zaden prawdziwy sekret.
KLUCZ_DOBRY_ISS="https://idp.przyklad.test/realms/dummy"
KLUCZ_DOBRA_DOMENA="dummy.przyklad.test"

ENV_DOBRY="$(mktemp)"; PLIKI_TESTOWE+=("$ENV_DOBRY")
printf 'STAGING_DOMAIN=%s\nAUTH_KEYCLOAK_ISSUER=%s\n' "$KLUCZ_DOBRA_DOMENA" "$KLUCZ_DOBRY_ISS" > "$ENV_DOBRY"

ENV_CUDZYSLOW="$(mktemp)"; PLIKI_TESTOWE+=("$ENV_CUDZYSLOW")
printf 'STAGING_DOMAIN="%s"\nAUTH_KEYCLOAK_ISSUER="%s"\n' "$KLUCZ_DOBRA_DOMENA" "$KLUCZ_DOBRY_ISS" > "$ENV_CUDZYSLOW"

ENV_CRLF="$(mktemp)"; PLIKI_TESTOWE+=("$ENV_CRLF")
printf 'STAGING_DOMAIN=%s\r\nAUTH_KEYCLOAK_ISSUER=%s\r\n' "$KLUCZ_DOBRA_DOMENA" "$KLUCZ_DOBRY_ISS" > "$ENV_CRLF"

ENV_BRAK="$(mktemp)"; PLIKI_TESTOWE+=("$ENV_BRAK")
printf 'STAGING_DOMAIN=%s\n' "$KLUCZ_DOBRA_DOMENA" > "$ENV_BRAK"

# $1=nazwa, $2=plik .env, $3=klucz, $4=oczekiwana wartosc (tylko do
# porownania - nigdy nie drukowana), $5=oczekiwany kod wyjscia
sprawdz_klucz() {
  local nazwa="$1" plik="$2" klucz="$3" oczekiwana="$4" oczekiwany_rc="$5"
  local wartosc rc niezal=0
  wartosc="$(_swiadek_logowania_czytaj_klucz "$klucz" "$plik")"
  rc=$?
  echo "=== $nazwa ==="
  echo "  rc=$rc (oczekiwano $oczekiwany_rc)"
  if [[ "$rc" -ne "$oczekiwany_rc" ]]; then
    echo "  WYNIK: NIEZALICZONY - zly kod wyjscia"
    niezal=1
  elif [[ "$oczekiwany_rc" -eq 0 && "$wartosc" != "$oczekiwana" ]]; then
    echo "  WYNIK: NIEZALICZONY - odczytana wartosc nie zgadza sie z oczekiwana"
    niezal=1
  fi
  if [[ "$niezal" -eq 1 ]]; then
    NIEZALICZONE=$((NIEZALICZONE + 1))
  else
    echo "  WYNIK: ZALICZONY"
  fi
}

sprawdz_klucz "9 czytaj_klucz - wartosc bez cudzyslowow" "$ENV_DOBRY" "AUTH_KEYCLOAK_ISSUER" "$KLUCZ_DOBRY_ISS" 0
sprawdz_klucz "10 czytaj_klucz - wartosc w cudzyslowach" "$ENV_CUDZYSLOW" "AUTH_KEYCLOAK_ISSUER" "$KLUCZ_DOBRY_ISS" 0
sprawdz_klucz "11 czytaj_klucz - plik CRLF" "$ENV_CRLF" "AUTH_KEYCLOAK_ISSUER" "$KLUCZ_DOBRY_ISS" 0
sprawdz_klucz "12 czytaj_klucz - brak klucza" "$ENV_BRAK" "AUTH_KEYCLOAK_ISSUER" "" 1

# ============================ CZESC 2c: _swiadek_logowania_wartosc (F-105) =
# F-105: skrypt wdrozenia eksportuje AUTH_KEYCLOAK_ISSUER w powloce PRZED
# wywolaniem deploy.sh, a `docker compose --env-file` bierze te zmienna
# PRZED wartoscia z pliku. Ta funkcja MUSI rozstrzygac w tej samej
# kolejnosci - inaczej swiadek ocenia ISS, ktorego stos wcale nie uzywa.
KLUCZ_ISS_ZE_SRODOWISKA="https://idp-ze-srodowiska.przyklad.test/realms/z-env"

ENV_ISS_PUSTY="$(mktemp)"; PLIKI_TESTOWE+=("$ENV_ISS_PUSTY")
printf 'AUTH_KEYCLOAK_ISSUER=\n' > "$ENV_ISS_PUSTY"

# $1=nazwa, $2=wartosc zmiennej SRODOWISKA AUTH_KEYCLOAK_ISSUER na czas
# wywolania (pusty string = zmienna NIEUSTAWIONA w tym wywolaniu, nie
# "ustawiona na pusto" - `env -u` usuwa ja z procesu), $3=plik .env,
# $4=oczekiwana wartosc na stdout (tylko do porownania, nigdy nie
# drukowana), $5=oczekiwany kod wyjscia (0=OK, 1=brak klucza, 2=pusta
# wartosc - patrz komentarz przy funkcji w deploy.sh)
sprawdz_wartosc() {
  local nazwa="$1" env_iss="$2" plik="$3" oczekiwana="$4" oczekiwany_rc="$5"
  local wartosc rc niezal=0

  echo "=== $nazwa ==="
  if [[ -n "$env_iss" ]]; then
    wartosc="$(AUTH_KEYCLOAK_ISSUER="$env_iss" _swiadek_logowania_wartosc "AUTH_KEYCLOAK_ISSUER" "$plik")"
  else
    wartosc="$(unset AUTH_KEYCLOAK_ISSUER; _swiadek_logowania_wartosc "AUTH_KEYCLOAK_ISSUER" "$plik")"
  fi
  rc=$?
  echo "  rc=$rc (oczekiwano $oczekiwany_rc)"
  if [[ "$rc" -ne "$oczekiwany_rc" ]]; then
    echo "  WYNIK: NIEZALICZONY - zly kod wyjscia"
    niezal=1
  elif [[ "$oczekiwany_rc" -eq 0 && "$wartosc" != "$oczekiwana" ]]; then
    echo "  WYNIK: NIEZALICZONY - odczytana wartosc nie zgadza sie z oczekiwana"
    niezal=1
  fi
  if [[ "$niezal" -eq 1 ]]; then
    NIEZALICZONE=$((NIEZALICZONE + 1))
  else
    echo "  WYNIK: ZALICZONY"
  fi
}

sprawdz_wartosc "17 wartosc - zmienna srodowiska ustawiona, plik pusty -> ISS ze srodowiska" \
  "$KLUCZ_ISS_ZE_SRODOWISKA" "$ENV_ISS_PUSTY" "$KLUCZ_ISS_ZE_SRODOWISKA" 0
sprawdz_wartosc "18 wartosc - srodowisko nieustawione, plik z wartoscia -> ISS z pliku" \
  "" "$ENV_DOBRY" "$KLUCZ_DOBRY_ISS" 0
sprawdz_wartosc "19 wartosc - oba puste -> rc=2 (pusta wartosc, NIE brak klucza)" \
  "" "$ENV_ISS_PUSTY" "" 2
sprawdz_wartosc "20 wartosc - srodowisko nieustawione, plik bez klucza -> rc=1 (brak klucza)" \
  "" "$ENV_BRAK" "" 1

# ============================ CZESC 2b: pelne deploy.sh z zaslepkami =======
# Uruchamia deploy.sh jako ODDZIELNY PROCES (nie zrodlowany), z docker/curl/
# stat podmienionymi na PATH - jedyny sposob, zeby zmierzyc kod wyjscia
# calego skryptu pod `set -euo pipefail` na spreparowanym .env, a nie tylko
# zachowanie jednej funkcji po `source`.
DOMENA_WDR="wdrozenie.przyklad.test"
ISS_WDR="https://idp.wdrozenie.test/realms/dummy"
STUB_REDIRECT_ENC="https%3A%2F%2F${DOMENA_WDR}%2Fapi%2Fauth%2Fcallback%2Fkeycloak"

STUB_BIN="$(mktemp -d)"; KATALOGI_TESTOWE+=("$STUB_BIN")
TLS_DIR_WDR="$(mktemp -d)"; KATALOGI_TESTOWE+=("$TLS_DIR_WDR")
printf 'dummy' > "$TLS_DIR_WDR/origin.crt"
printf 'dummy' > "$TLS_DIR_WDR/origin.key"

cat > "$STUB_BIN/docker" <<'EOF'
#!/bin/bash
# Zaslepka: kazde wywolanie "docker compose ..." w testach konczy sie
# powodzeniem bez dotykania prawdziwego Dockera.
exit 0
EOF
chmod +x "$STUB_BIN/docker"

cat > "$STUB_BIN/stat" <<'EOF'
#!/bin/bash
# Zaslepka: prawa pliku .env nie sa tu przedmiotem testu.
echo 600
EOF
chmod +x "$STUB_BIN/stat"

cat > "$STUB_BIN/curl" <<'EOF'
#!/bin/bash
# Zaslepka curl: rozpoznaje wywolania deploy.sh po koncowce URL-a (ostatni
# argument) i zwraca spreparowane, fikcyjne odpowiedzi - bez sieci.
url="${@: -1}"
out_file=""
dump_file=""
prev=""
for a in "$@"; do
  if [[ "$prev" == "-o" ]]; then out_file="$a"; fi
  if [[ "$prev" == "-D" ]]; then dump_file="$a"; fi
  prev="$a"
done
case "$url" in
  */api/auth/csrf)
    echo '{"csrfToken":"CANARY-CSRF-DUMMY"}'
    ;;
  */api/auth/signin/keycloak)
    if [[ -n "$dump_file" ]]; then
      printf 'HTTP/1.1 302 Found\r\nLocation: %s/protocol/openid-connect/auth?client_id=psychon-web&redirect_uri=%s&code_challenge_method=S256&response_type=code\r\n\r\n' \
        "${STUB_ISS_LOC:-}" "${STUB_REDIRECT_ENC:-}" > "$dump_file"
    fi
    ;;
  *"/protocol/openid-connect/auth"*)
    if [[ -n "$out_file" ]]; then
      printf '<html><body><form id="kc-form-login">login</form></body></html>' > "$out_file"
    fi
    printf '200'
    ;;
  *)
    if [[ -n "$out_file" ]]; then : > "$out_file"; fi
    printf '200'
    ;;
esac
exit 0
EOF
chmod +x "$STUB_BIN/curl"

RC_WDROZENIA_BAZOWY=""

# $1=nazwa, $2=plik .env, $3=fragment ktory MUSI wystapic w wyjsciu
sprawdz_wdrozenie() {
  local nazwa="$1" env_plik="$2" oczekiwany_fragment="$3"
  local wyjscie rc niezal=0
  wyjscie="$(PATH="$STUB_BIN:$PATH" \
    PSYCHON_ENV_FILE="$env_plik" \
    PSYCHON_TLS_DIR="$TLS_DIR_WDR" \
    STUB_ISS_LOC="$ISS_WDR" \
    STUB_REDIRECT_ENC="$STUB_REDIRECT_ENC" \
    bash "$TU/../deploy.sh" 2>&1)"
  rc=$?
  echo "=== $nazwa ==="
  printf '%s\n' "$wyjscie" | grep -E 'SWIADEK LOGOWANIA|Wdrozenie zakonczone|OSTRZEZENIE' || true
  echo "  rc=$rc"

  if [[ -z "$RC_WDROZENIA_BAZOWY" ]]; then
    RC_WDROZENIA_BAZOWY="$rc"
  elif [[ "$rc" -ne "$RC_WDROZENIA_BAZOWY" ]]; then
    echo "  WYNIK: NIEZALICZONY - rc deploy zmienil sie wzgledem bazowego ($rc != $RC_WDROZENIA_BAZOWY)"
    niezal=1
  fi

  if ! printf '%s\n' "$wyjscie" | grep -qF "$oczekiwany_fragment"; then
    echo "  WYNIK: NIEZALICZONY - brak oczekiwanego fragmentu w wyjsciu"
    niezal=1
  fi

  if ! printf '%s\n' "$wyjscie" | grep -q 'Wdrozenie zakonczone'; then
    echo "  WYNIK: NIEZALICZONY - deploy nie doszedl do konca (nie ma 'Wdrozenie zakonczone')"
    niezal=1
  fi

  if [[ "$niezal" -eq 1 ]]; then
    NIEZALICZONE=$((NIEZALICZONE + 1))
  else
    echo "  WYNIK: ZALICZONY"
  fi
}

ENV_WDR_DOBRY="$(mktemp)"; PLIKI_TESTOWE+=("$ENV_WDR_DOBRY")
printf 'STAGING_DOMAIN=%s\nAUTH_KEYCLOAK_ISSUER=%s\n' "$DOMENA_WDR" "$ISS_WDR" > "$ENV_WDR_DOBRY"

ENV_WDR_CUDZYSLOW="$(mktemp)"; PLIKI_TESTOWE+=("$ENV_WDR_CUDZYSLOW")
printf 'STAGING_DOMAIN="%s"\nAUTH_KEYCLOAK_ISSUER="%s"\n' "$DOMENA_WDR" "$ISS_WDR" > "$ENV_WDR_CUDZYSLOW"

ENV_WDR_CRLF="$(mktemp)"; PLIKI_TESTOWE+=("$ENV_WDR_CRLF")
printf 'STAGING_DOMAIN=%s\r\nAUTH_KEYCLOAK_ISSUER=%s\r\n' "$DOMENA_WDR" "$ISS_WDR" > "$ENV_WDR_CRLF"

ENV_WDR_BRAK="$(mktemp)"; PLIKI_TESTOWE+=("$ENV_WDR_BRAK")
printf 'STAGING_DOMAIN=%s\n' "$DOMENA_WDR" > "$ENV_WDR_BRAK"

sprawdz_wdrozenie "13 pelne wdrozenie - dobra wartosc AUTH_KEYCLOAK_ISSUER" "$ENV_WDR_DOBRY" "SWIADEK LOGOWANIA: ZALICZONY"
sprawdz_wdrozenie "14 pelne wdrozenie - AUTH_KEYCLOAK_ISSUER w cudzyslowach" "$ENV_WDR_CUDZYSLOW" "SWIADEK LOGOWANIA: ZALICZONY"
sprawdz_wdrozenie "15 pelne wdrozenie - .env z CRLF" "$ENV_WDR_CRLF" "SWIADEK LOGOWANIA: ZALICZONY"
sprawdz_wdrozenie "16 pelne wdrozenie - brak AUTH_KEYCLOAK_ISSUER, deploy nie pada" "$ENV_WDR_BRAK" "SWIADEK LOGOWANIA: NIEZALICZONY (brak klucza AUTH_KEYCLOAK_ISSUER"

# ============================ CZESC 2d: F-105 p.2 - pusty ISS => 0 curl ====
# Zaslepka curl POWYZEJ zawsze odpowiada (nie liczy wywolan) - tu potrzebny
# jest LICZNIK: dowod, ze przy pustym ISS swiadek NIE WYKONUJE zadnego curl
# do IdP/next-auth (csrf, signin/keycloak, /protocol/openid-connect/auth).
# Trzy proby swiadka ROZDZIALU RUCHU (/api/v1/me, /api/auth/providers, /)
# nie sa objete tym zakazem - to inny swiadek, uruchamiany wczesniej - i
# zaslepka ponizej ich celowo NIE liczy.
STUB_BIN_LICZNIK="$(mktemp -d)"; KATALOGI_TESTOWE+=("$STUB_BIN_LICZNIK")
LICZNIK_CURL="$(mktemp)"; PLIKI_TESTOWE+=("$LICZNIK_CURL")
printf '0' > "$LICZNIK_CURL"

cat > "$STUB_BIN_LICZNIK/docker" <<'EOF'
#!/bin/bash
exit 0
EOF
chmod +x "$STUB_BIN_LICZNIK/docker"

cat > "$STUB_BIN_LICZNIK/stat" <<'EOF'
#!/bin/bash
echo 600
EOF
chmod +x "$STUB_BIN_LICZNIK/stat"

cat > "$STUB_BIN_LICZNIK/curl" <<EOF
#!/bin/bash
# Zaslepka-licznik: liczy WYLACZNIE wywolania skierowane do IdP/next-auth na
# sciezce logowania. Reszta (swiadek rozdzialu ruchu) dostaje zawsze 200,
# bez liczenia - to nie jest przedmiotem tego testu.
url="\${@: -1}"
out_file=""
prev=""
for a in "\$@"; do
  if [[ "\$prev" == "-o" ]]; then out_file="\$a"; fi
  prev="\$a"
done
case "\$url" in
  */api/auth/csrf|*/api/auth/signin/keycloak|*"/protocol/openid-connect/auth"*)
    echo "\$((\$(cat "$LICZNIK_CURL") + 1))" > "$LICZNIK_CURL"
    ;;
esac
if [[ -n "\$out_file" ]]; then : > "\$out_file"; fi
printf '200'
exit 0
EOF
chmod +x "$STUB_BIN_LICZNIK/curl"

ENV_ISS_PUSTY_WDR="$(mktemp)"; PLIKI_TESTOWE+=("$ENV_ISS_PUSTY_WDR")
printf 'STAGING_DOMAIN=%s\nAUTH_KEYCLOAK_ISSUER=\n' "$DOMENA_WDR" > "$ENV_ISS_PUSTY_WDR"

TLS_DIR_LICZNIK="$(mktemp -d)"; KATALOGI_TESTOWE+=("$TLS_DIR_LICZNIK")
printf 'dummy' > "$TLS_DIR_LICZNIK/origin.crt"
printf 'dummy' > "$TLS_DIR_LICZNIK/origin.key"

echo "=== 21 pelne wdrozenie - AUTH_KEYCLOAK_ISSUER puste (plik i srodowisko) -> 0 curl do IdP/next-auth ==="
WYJSCIE_LICZNIK="$(env -u AUTH_KEYCLOAK_ISSUER PATH="$STUB_BIN_LICZNIK:$PATH" \
  PSYCHON_ENV_FILE="$ENV_ISS_PUSTY_WDR" \
  PSYCHON_TLS_DIR="$TLS_DIR_LICZNIK" \
  bash "$TU/../deploy.sh" 2>&1)"
printf '%s\n' "$WYJSCIE_LICZNIK" | grep -E 'SWIADEK LOGOWANIA|Wdrozenie zakonczone' || true
LICZBA_CURL="$(cat "$LICZNIK_CURL")"
echo "  wywolan curl do IdP/next-auth: $LICZBA_CURL"

NIEZAL_21=0
if ! printf '%s\n' "$WYJSCIE_LICZNIK" | grep -qF "SWIADEK LOGOWANIA: NIEZALICZONY (AUTH_KEYCLOAK_ISSUER jest puste"; then
  echo "  WYNIK: NIEZALICZONY - brak oczekiwanego powodu 'puste' w wyjsciu"
  NIEZAL_21=1
fi
if [[ "$LICZBA_CURL" -ne 0 ]]; then
  echo "  WYNIK: NIEZALICZONY - swiadek zawolal curl do IdP/next-auth mimo pustego ISS ($LICZBA_CURL wywolan)"
  NIEZAL_21=1
fi
if ! printf '%s\n' "$WYJSCIE_LICZNIK" | grep -qF 'Wdrozenie zakonczone'; then
  echo "  WYNIK: NIEZALICZONY - deploy nie doszedl do konca"
  NIEZAL_21=1
fi
if [[ "$NIEZAL_21" -eq 1 ]]; then
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
