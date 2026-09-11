#!/usr/bin/env bash
# Test LOGIKI kroku "3e - sekrety w tresci commitu" z deploy/bramka-hosta.sh
# (F-106). Zrodlowuje DOKLADNIE ten sam plik co bramka -
# deploy/lib/sekrety-licznik.sh - i wywoluje jego funkcje na fixture'ach oraz
# (CZESC 2) na PRAWDZIWYM wyjsciu gitleaksa. Ten skrypt NIE MA wlasnej kopii
# logiki licznika/kontroli zgodnosci/filtra pol - kazda zmiana w bibliotece
# (albo jej brak) jest zmiana tego, co ten test naprawde mierzy.
#
# CZESC 1 nizej dziala na SPREPAROWANYCH logach (fixture'ach) - imituja one
# rozne wyjscia gitleaksa (zgodne, niezgodne, brak podsumowania), bez
# dotykania Dockera. CZESC 2 (przypadek 5) jest END-TO-END: prawdziwy
# gitleaks w Dockerze na katalogu z JEDNYM SZTUCZNYM trafieniem (losowy ciag
# wygenerowany W TEJ CHWILI, nie wpisany na sztywno - zaden prawdziwy sekret
# nigdzie nie wystapil), wywolany przez sekrety_uruchom_gitleaks - TA SAMA
# funkcja/plik co w bramce, wiec mutacja flag (np. usuniete --redact) w
# bibliotece daje tu czerwien.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TU/../.." && pwd)"

# shellcheck source=deploy/lib/sekrety-licznik.sh
source "$REPO_ROOT/deploy/lib/sekrety-licznik.sh"

PLIKI_TESTOWE=()
KATALOGI_TESTOWE=()
trap 'rm -f "${PLIKI_TESTOWE[@]}" 2>/dev/null; rm -rf "${KATALOGI_TESTOWE[@]}" 2>/dev/null' EXIT

NIEZALICZONE=0

# ============================ CZESC 1: sekrety_policz_trafienia (fixture'y) =

# --- Fixture 0 trafien (log -v, "no leaks found") ---------------------------
LOG_0="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_0")
cat > "$LOG_0" <<'EOF'
3:07PM INF scanned ~4240971 bytes (4.24 MB) in 4.98s
3:07PM INF no leaks found
EOF

# --- Fixture 1 trafienie Z POLAMI, spojne z podsumowaniem -------------------
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

# --- Fixture NIEZGODNOSC (podsumowanie mowi 2, naglowek jest tylko 1) -------
# Tak wyglada log, ktoremu NIE MOZNA ufac bez kontroli: albo `-v` czesciowo
# obcieto (log w locie, przerwane polaczenie), albo gitleaks kiedys zmieni
# format. Licznik OPARTY WYLACZNIE o naglowki (sprzed F-106) tego nie widzi -
# liczy tylko to, co jest, i milczy o niezgodnosci z podsumowaniem.
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

# --- Fixture NIEZMIERZONE (ani "leaks found: N", ani "no leaks found") ------
# Tak wyglada log gitleaksa, ktory padl albo zmienil format wyjscia calkiem -
# bez linii podsumowania nie ma z czego czerpac liczby, i licznik ma to
# przyznac wprost, a nie zgadywac zero.
LOG_NIEZMIERZONY="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_NIEZMIERZONY")
cat > "$LOG_NIEZMIERZONY" <<'EOF'
3:22PM FTL could not open config file
EOF

# $1=nazwa, $2=plik logu, $3=oczekiwana wartosc STDOUT, $4=oczekiwany kod
# wyjscia sekrety_policz_trafienia (0=zgodne, 1=niewiarygodne)
sprawdz_fixture() {
  local nazwa="$1" log="$2" oczek_stdout="$3" oczek_rc="$4"
  local wynik rc niezal=0

  echo "=== $nazwa ==="
  wynik="$(sekrety_policz_trafienia "$log")"; rc=$?
  echo "  sekrety_policz_trafienia: '$wynik' (rc=$rc, oczekiwano '$oczek_stdout' rc=$oczek_rc)"

  if [[ "$rc" -ne "$oczek_rc" ]]; then
    echo "  WYNIK: NIEZALICZONY - zly kod wyjscia"
    niezal=1
  fi
  if [[ "$oczek_stdout" == "NIEZGODNE"* ]]; then
    [[ "$wynik" == NIEZGODNE* ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano prefiksu NIEZGODNE"; niezal=1; }
  else
    [[ "$wynik" == "$oczek_stdout" ]] || { echo "  WYNIK: NIEZALICZONY - zla wartosc na stdout"; niezal=1; }
  fi

  if [[ "$niezal" -eq 1 ]]; then
    NIEZALICZONE=$((NIEZALICZONE + 1))
  else
    echo "  WYNIK: ZALICZONY"
  fi
}

sprawdz_fixture "1 fixture 0 trafien - zgodne (0)" "$LOG_0" "0" 0
sprawdz_fixture "2 fixture 1 trafienie z polami, zgodne (1)" "$LOG_1" "1" 0
sprawdz_fixture "3 fixture niezgodnosc (podsumowanie 2, naglowkow kontrolnych 1) - wykryte" "$LOG_NIEZGODNY" "NIEZGODNE" 1
sprawdz_fixture "4 fixture brak linii podsumowania - NIEZMIERZONE" "$LOG_NIEZMIERZONY" "NIEZMIERZONE" 1

# ============================ CZESC 2: end-to-end (docker + gitleaks) ======
# Katalog z JEDNYM sztucznym trafieniem: ciag generowany W TEJ CHWILI
# (losowy hex), nie sekret wpisany na sztywno w repo. `.gitleaks.toml` z
# repo jest uzyty NIEZMIENIONY (ta sama migawka regul co reszta bramki).
# Wywolanie gitleaksa idzie przez sekrety_uruchom_gitleaks - TA SAMA funkcja
# co w kroku 3e bramki.
if ! command -v docker >/dev/null 2>&1; then
  echo "=== 5 end-to-end (docker gitleaks) ==="
  echo "  POMINIETY - brak docker w PATH"
else
  # Katalog POD repo (nie w globalnym /tmp): na Windows+Git Bash /tmp z
  # `mktemp -d` bywa poza dyskami udostepnionymi Docker Desktopowi, wiec
  # montaz wychodzi PUSTY (zmierzone lokalnie) - katalog obok tego testu
  # dziala wszedzie, bo to ten sam wolumin, z ktorego i tak montujemy repo.
  # MSYS_NO_PATHCONV=1 przy wywolaniu docker: w Git Bash na Windows sama
  # konwersja sciezek MSYS (np. "/tresc" -> "C:/Program Files/Git/tresc")
  # psuje docelowa sciezke montowania W KONTENERZE, wiec bez tego przypadek
  # jest NIEZMIERZONY na Windows, mimo poprawnego montowania po stronie hosta.
  KATALOG_SEKRETU="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_SEKRETU")
  CIAG_SYNTETYCZNY="$(head -c 20 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  printf 'GENERIC_API_KEY = "%s"\n' "$CIAG_SYNTETYCZNY" > "$KATALOG_SEKRETU/fake.env"

  LOG_E2E="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_E2E")
  MSYS_NO_PATHCONV=1 sekrety_uruchom_gitleaks "$KATALOG_SEKRETU" "$REPO_ROOT/.gitleaks.toml" "$LOG_E2E"
  KOD_E2E=$?

  # W WSL, gdzie `docker` na PATH bywa TYLKO cienkim wrapperem do docker.exe
  # (Windows), ten `docker.exe` NIE tlumaczy sam sciezek `/mnt/<litera>/...` -
  # montaz `-v` na takiej sciezce wychodzi PUSTY (zmierzone lokalnie: katalog
  # inny niz podany, "scanned ~0 bytes" mimo pliku w srodku). Wykrywamy to PO
  # WYNIKU (nie po nazwie dystrybucji) i, jesli `wslpath` jest dostepny,
  # PONAWIAMY z przetlumaczonymi sciezkami Windows (D:\...), na ktorych ten
  # sam `docker.exe` montuje poprawnie.
  if grep -aq "scanned ~0 bytes" "$LOG_E2E" && command -v wslpath >/dev/null 2>&1; then
    sekrety_uruchom_gitleaks \
      "$(wslpath -w "$KATALOG_SEKRETU")" "$(wslpath -w "$REPO_ROOT/.gitleaks.toml")" "$LOG_E2E"
    KOD_E2E=$?
  fi

  echo "=== 5 end-to-end (docker gitleaks) - katalog z 1 sztucznym trafieniem ==="
  WYNIK_E2E="$(sekrety_policz_trafienia "$LOG_E2E")"; RC_E2E=$?
  echo "  gitleaks EXIT=$KOD_E2E, licznik: $WYNIK_E2E (rc=$RC_E2E)"

  POLA_E2E="$(sekrety_pola_do_logu "$LOG_E2E")"
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

  # Dowod NA SUROWYM LOGU (przed jakimkolwiek filtrem pol), nie tylko na
  # polach juz przefiltrowanych (sekrety_pola_do_logu): to jedyna asercja,
  # ktora naprawde zalezy od --redact w sekrety_uruchom_gitleaks. Pola juz
  # przefiltrowane nigdy nie niosa tresci sekretu (redagowanej albo nie) -
  # wiec sprawdzanie samych pol nie moze wykryc brakujacego --redact.
  LICZBA_CIAGU_W_SUROWYM_LOGU="$(grep -cF "$CIAG_SYNTETYCZNY" "$LOG_E2E" || true)"
  echo "  wystapien sztucznego ciagu w SUROWYM logu gitleaksa: $LICZBA_CIAGU_W_SUROWYM_LOGU"
  if [[ "$LICZBA_CIAGU_W_SUROWYM_LOGU" -ne 0 ]]; then
    echo "  WYNIK: NIEZALICZONY - sztuczny ciag (sekret) wyciekl do SUROWEGO logu gitleaksa (brak --redact?)"
    NIEZAL_E2E=1
  fi

  # Dowod dodatkowy: WYJSCIE TEGO TESTU (co wlasnie wydrukowal) tez nie
  # zawiera ciagu - ani via --redact, ani via filtr pol.
  LICZBA_CIAGU_W_WYJSCIU="$(printf '%s\n%s\n' "$WYNIK_E2E" "$POLA_E2E" | grep -cF "$CIAG_SYNTETYCZNY" || true)"
  echo "  wystapien sztucznego ciagu w przefiltrowanym wyjsciu testu: $LICZBA_CIAGU_W_WYJSCIU"
  if [[ "$LICZBA_CIAGU_W_WYJSCIU" -ne 0 ]]; then
    echo "  WYNIK: NIEZALICZONY - sztuczny ciag (sekret) wyciekl do przefiltrowanego wyjscia testu"
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
