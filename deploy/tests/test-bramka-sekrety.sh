#!/usr/bin/env bash
# Test LOGIKI LICZNIKA kroku "3e - sekrety w tresci commitu" z
# deploy/bramka-hosta.sh (F-106), bez uruchamiania calej bramki. Dwie
# implementacje licznika sa zdefiniowane NIZEJ jako funkcje - CELOWO
# skopiowane z historii tego kroku, nie zrodlowane z bramka-hosta.sh (ten
# skrypt nie ma trybu biblioteki i uruchomienie go od razu odpala caly bieg
# bramki, ze stosem Dockera wlacznie):
#
#   licznik_stary  - dokladnie to, co stalo w 3e PRZED F-106: liczy WYLACZNIE
#                    linie "^RuleID:" w logu gitleaks, bez zadnej kontroli
#                    zgodnosci z linia podsumowania "leaks found: N". Bez
#                    `-v` w wywolaniu gitleaks te linie nie istnialy WCALE,
#                    wiec licznik byl ZAWSZE zero - a jesli akurat istnieja
#                    (bo ktos log spreparowal albo `-v` dolozono gdzie indziej),
#                    stary licznik im slepo ufa i NIE WYKRYJE niezgodnosci
#                    z podsumowaniem.
#   licznik_nowy   - to, co stoi w 3e PO F-106: liczy z linii podsumowania
#                    ("leaks found: N", "no leaks found" == 0) i PORTWIERDZA
#                    ta liczbe naglowkami "^RuleID:" - niezgodnosc konczy sie
#                    wlasnym czerwonym komunikatem, nie cicha zla liczba.
#
# CZESC 2 nizej jest END-TO-END: prawdziwy gitleaks w Dockerze na katalogu
# z JEDNYM SZTUCZNYM trafieniem (losowy ciag wygenerowany W TEJ chwili, nie
# wpisany na sztywno - zaden prawdziwy sekret nigdzie nie wystapil). Sprawdza
# nowy licznik NA PRAWDZIWYM wyjsciu gitleaksa, nie na spreparowanym logu.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TU/../.." && pwd)"

PLIKI_TESTOWE=()
KATALOGI_TESTOWE=()
trap 'rm -f "${PLIKI_TESTOWE[@]}" 2>/dev/null; rm -rf "${KATALOGI_TESTOWE[@]}" 2>/dev/null' EXIT

NIEZALICZONE=0

# ============================ CZESC 1: logika licznika (sztuczne logi) =====

# Licznik SPRZED F-106 (deploy/bramka-hosta.sh @ 63e7ec3, krok 3e): liczy
# WYLACZNIE naglowki "^RuleID:", bez zadnej kontroli spojnosci.
licznik_stary() {
  local log="$1"
  grep -acE "^RuleID:" "$log"
}

# Licznik PO F-106: podsumowanie "leaks found: N" / "no leaks found" (=0) jako
# ZRODLO, naglowki "^RuleID:" jako KONTROLA. Wypisuje "N" na stdout przy
# zgodnosci, albo "NIEZGODNE podsumowanie=X ruleid=Y" i zwraca 1 przy
# niezgodnosci - dokladnie tak, jak krok 3e w bramka-hosta.sh.
licznik_nowy() {
  local log="$1" podsumowanie ruleid
  podsumowanie="$(grep -aoE "leaks found: [0-9]+" "$log" | tail -1 | grep -oE "[0-9]+" || true)"
  if [[ -z "$podsumowanie" ]] && grep -aq "no leaks found" "$log"; then
    podsumowanie=0
  fi
  ruleid="$(grep -acE "^RuleID:" "$log")"
  if [[ -z "$podsumowanie" ]]; then
    echo "NIEZMIERZONE"
    return 1
  fi
  if [[ "$podsumowanie" -ne "$ruleid" ]]; then
    echo "NIEZGODNE podsumowanie=$podsumowanie ruleid=$ruleid"
    return 1
  fi
  echo "$podsumowanie"
  return 0
}

# --- Fixture A: 0 trafien (log -v, "no leaks found") ------------------------
LOG_0="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_0")
cat > "$LOG_0" <<'EOF'
3:07PM INF scanned ~4240971 bytes (4.24 MB) in 4.98s
3:07PM INF no leaks found
EOF

# --- Fixture B: 1 trafienie Z POLAMI, spojne z podsumowaniem ----------------
LOG_1="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_1")
cat > "$LOG_1" <<'EOF'
Finding:     GENERIC_API_KEY = "REDACTED"
Secret:      REDACTED
RuleID:      generic-api-key
Entropy:     3.677567
File:        /tresc/fake.env
Line:        1
Fingerprint: /tresc/fake.env:generic-api-key:1

3:22PM INF scanned ~61 bytes (61 bytes) in 8.25ms
3:22PM WRN leaks found: 1
EOF

# --- Fixture C: NIEZGODNOSC (podsumowanie mowi 2, naglowek jest tylko 1) ----
# Tak wyglada log, ktoremu NIE MOZNA ufac bez kontroli: albo `-v` czesciowo
# obcieto (log w locie, przerwane polaczenie), albo gitleaks kiedys zmieni
# format. Stary licznik tego nie widzi - liczy tylko to, co jest, i milczy.
LOG_NIEZGODNY="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_NIEZGODNY")
cat > "$LOG_NIEZGODNY" <<'EOF'
Finding:     GENERIC_API_KEY = "REDACTED"
Secret:      REDACTED
RuleID:      generic-api-key
Entropy:     3.677567
File:        /tresc/fake.env
Line:        1
Fingerprint: /tresc/fake.env:generic-api-key:1

3:22PM INF scanned ~9001 bytes (9 KB) in 12ms
3:22PM WRN leaks found: 2
EOF

# $1=nazwa, $2=plik logu, $3=oczekiwana wartosc STAREGO licznika (tylko
# liczba, bez wykrywania niezgodnosci - to jego znana wada), $4=oczekiwane
# ZACHOWANIE nowego licznika: liczba (zgodne) albo "NIEZGODNE" (wykryte)
sprawdz_fixture() {
  local nazwa="$1" log="$2" oczek_stary="$3" oczek_nowy="$4"
  local wynik_stary wynik_nowy rc_nowy niezal=0

  echo "=== $nazwa ==="
  wynik_stary="$(licznik_stary "$log")"
  echo "  stary:  $wynik_stary (oczekiwano $oczek_stary)"
  if [[ "$wynik_stary" != "$oczek_stary" ]]; then
    echo "  WYNIK (stary): NIEZALICZONY - licznik sprzed F-106 dal inna wartosc niz przewidziana fixture"
    niezal=1
  fi

  wynik_nowy="$(licznik_nowy "$log")"; rc_nowy=$?
  echo "  nowy:   $wynik_nowy (rc=$rc_nowy, oczekiwano $oczek_nowy)"
  if [[ "$oczek_nowy" == "NIEZGODNE"* ]]; then
    if [[ "$rc_nowy" -eq 0 || "$wynik_nowy" != NIEZGODNE* ]]; then
      echo "  WYNIK (nowy): NIEZALICZONY - oczekiwano wykrycia niezgodnosci, nowy licznik jej nie zlapal"
      niezal=1
    fi
  else
    if [[ "$rc_nowy" -ne 0 || "$wynik_nowy" != "$oczek_nowy" ]]; then
      echo "  WYNIK (nowy): NIEZALICZONY - nowy licznik nie dal oczekiwanej, zgodnej liczby"
      niezal=1
    fi
  fi

  if [[ "$niezal" -eq 1 ]]; then
    NIEZALICZONE=$((NIEZALICZONE + 1))
  else
    echo "  WYNIK: ZALICZONY"
  fi
}

sprawdz_fixture "1 fixture 0 trafien - stary i nowy licznik zgodne (0)" "$LOG_0" "0" "0"
sprawdz_fixture "2 fixture 1 trafienie z polami, spojne - stary i nowy licznik zgodne (1)" "$LOG_1" "1" "1"
sprawdz_fixture "3 fixture niezgodnosc - stary MILCZY (1, bledna liczba bez ostrzezenia), nowy WYKRYWA" \
  "$LOG_NIEZGODNY" "1" "NIEZGODNE"

# Dowod wprost (nie tylko przez fixture 3 wyzej), ze CALA TROJKA fixture pod
# STARA logika nie ma zadnego mechanizmu wykrywania niezgodnosci - fixture 3
# jest jedynym miejscem, gdzie to sie objawia, bo tylko tam podsumowanie i
# naglowki NIE ZGADZAJA sie ze soba. Test wyzej juz to pokazuje (stary
# "zalicza" fixture 3 dajac 1, czyli DAJE WYNIK, mimo ze wynik jest niepewny)
# - ponizej jawna asercja tego samego faktu, dla czytelnosci raportu.
echo "=== 4 stary licznik na fixture niezgodnosc NIE ZGLASZA bledu (dowod luki F-106) ==="
WYNIK_STARY_NIEZGODNY="$(licznik_stary "$LOG_NIEZGODNY")"
echo "  stary zwrocil: $WYNIK_STARY_NIEZGODNY (exit=0, bez ostrzezenia o niezgodnosci z podsumowaniem)"
if [[ "$WYNIK_STARY_NIEZGODNY" == "1" ]]; then
  echo "  WYNIK: ZALICZONY - potwierdzone, ze stara logika myli sie CICHO (to jest luka, ktora F-106 zamyka)"
else
  echo "  WYNIK: NIEZALICZONY - fixture zmieniona, ponowna kalibracja dowodu potrzebna"
  NIEZALICZONE=$((NIEZALICZONE + 1))
fi

# ============================ CZESC 2: end-to-end (docker + gitleaks) ======
# Katalog z JEDNYM sztucznym trafieniem: ciag generowany W TEJ CHWILI
# (losowy hex), nie sekret wpisany na sztywno w repo. `.gitleaks.toml` z
# repo jest uzyty NIEZMIENIONY (ta sama migawka regul co reszta bramki).
if ! command -v docker >/dev/null 2>&1; then
  echo "=== 5 end-to-end (docker gitleaks) ==="
  echo "  POMINIETY - brak docker w PATH"
else
  # Katalog POD repo (nie w globalnym /tmp): na Windows+Git Bash /tmp z
  # `mktemp -d` bywa poza dyskami udostepnionymi Docker Desktopowi, wiec
  # montaz wychodzi PUSTY (zmierzone lokalnie) - katalog obok tego testu
  # dziala wszedzie, bo to ten sam wolumin, z ktorego i tak montujemy repo.
  KATALOG_SEKRETU="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_SEKRETU")
  CIAG_SYNTETYCZNY="$(head -c 20 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  printf 'GENERIC_API_KEY = "%s"\n' "$CIAG_SYNTETYCZNY" > "$KATALOG_SEKRETU/fake.env"

  LOG_E2E="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_E2E")
  docker run --rm --network none -v "${KATALOG_SEKRETU}:/tresc:ro" \
    -v "${REPO_ROOT}/.gitleaks.toml:/konfiguracja.toml:ro" \
    ghcr.io/gitleaks/gitleaks:v8.30.1 dir /tresc -c /konfiguracja.toml --no-banner --redact -v \
    > "$LOG_E2E" 2>&1
  KOD_E2E=$?

  echo "=== 5 end-to-end (docker gitleaks) - katalog z 1 sztucznym trafieniem ==="
  WYNIK_E2E="$(licznik_nowy "$LOG_E2E")"; RC_E2E=$?
  echo "  gitleaks EXIT=$KOD_E2E, licznik: $WYNIK_E2E (rc=$RC_E2E)"

  POLA_E2E="$(grep -aE "^(RuleID|File|Line):" "$LOG_E2E")"
  echo "$POLA_E2E" | sed 's/^/  ! /'

  NIEZAL_E2E=0
  if [[ "$RC_E2E" -ne 0 || "$WYNIK_E2E" != "1" ]]; then
    echo "  WYNIK: NIEZALICZONY - oczekiwano licznika 1 (zgodnego), dostalem '$WYNIK_E2E'"
    NIEZAL_E2E=1
  fi
  if ! printf '%s\n' "$POLA_E2E" | grep -q "^RuleID:"; then
    echo "  WYNIK: NIEZALICZONY - brak pola RuleID w wypisanych polach"
    NIEZAL_E2E=1
  fi
  if ! printf '%s\n' "$POLA_E2E" | grep -q "^File:"; then
    echo "  WYNIK: NIEZALICZONY - brak pola File w wypisanych polach"
    NIEZAL_E2E=1
  fi
  if ! printf '%s\n' "$POLA_E2E" | grep -q "^Line:"; then
    echo "  WYNIK: NIEZALICZONY - brak pola Line w wypisanych polach"
    NIEZAL_E2E=1
  fi
  # Dowod, ze WYJSCIE TEGO TESTU (to, co wlasnie wydrukowal) nie zawiera
  # nigdzie samego ciagu sekretu - ani via --redact (gitleaks), ani via filtr
  # pol (RuleID/File/Line, nigdy Secret/Match/Finding).
  LICZBA_CIAGU_W_WYJSCIU="$(printf '%s\n%s\n' "$WYNIK_E2E" "$POLA_E2E" | grep -cF "$CIAG_SYNTETYCZNY" || true)"
  echo "  wystapien sztucznego ciagu w wyjsciu testu: $LICZBA_CIAGU_W_WYJSCIU"
  if [[ "$LICZBA_CIAGU_W_WYJSCIU" -ne 0 ]]; then
    echo "  WYNIK: NIEZALICZONY - sztuczny ciag (sekret) wyciekl do wyjscia testu"
    NIEZAL_E2E=1
  fi

  if [[ "$NIEZAL_E2E" -eq 1 ]]; then
    NIEZALICZONE=$((NIEZALICZONE + 1))
  else
    echo "  WYNIK: ZALICZONY"
  fi
fi

echo
if [[ "$NIEZALICZONE" -eq 0 ]]; then
  echo "TESTY LOGIKI LICZNIKA SEKRETOW: WSZYSTKIE ZALICZONE"
  exit 0
else
  echo "TESTY LOGIKI LICZNIKA SEKRETOW: NIEZALICZONE PRZYPADKI: $NIEZALICZONE"
  exit 1
fi
