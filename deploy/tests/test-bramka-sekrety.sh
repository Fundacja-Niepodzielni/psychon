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
# dotykania Dockera. CZESC 2 (przypadki 5-7, F-107) mierzy
# sekrety_eksportuj_tresc: `git archive` zepsuty albo pusty (shim na PATH,
# bez Dockera) MA konczyc sie kodem 2 z czytelnym komunikatem, normalny
# eksport HEAD MA sie udac. CZESC 3 (przypadki 8-9) jest END-TO-END: prawdziwy
# gitleaks w Dockerze - najpierw na katalogu z JEDNYM SZTUCZNYM trafieniem
# (losowy ciag wygenerowany W TEJ CHWILI, nie wpisany na sztywno - zaden
# prawdziwy sekret nigdzie nie wystapil), potem jako kontrola negatywna na
# prawdziwym eksporcie HEAD (0 trafien oczekiwane) - obie przez
# sekrety_uruchom_gitleaks, TA SAMA funkcja/plik co w bramce. Bez Dockera oba
# przypadki sa NIEZMIERZONE (F-108), nie ZALICZONE - kod wyjscia calego
# skryptu to wtedy 3, nie 0. CZESC 4 (przypadek 10, F-108) mierzy WPROST
# sekrety_pola_do_logu na fiksturze z polami Secret:/Match:, niezaleznie od
# --redact.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TU/../.." && pwd)"

# shellcheck source=deploy/lib/sekrety-licznik.sh
source "$REPO_ROOT/deploy/lib/sekrety-licznik.sh"

PLIKI_TESTOWE=()
KATALOGI_TESTOWE=()
trap 'rm -f "${PLIKI_TESTOWE[@]}" 2>/dev/null; rm -rf "${KATALOGI_TESTOWE[@]}" 2>/dev/null' EXIT

NIEZALICZONE=0
NIEZMIERZONE_LICZNIK=0

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

# ============================ CZESC 2: sekrety_eksportuj_tresc (F-107) =====
# `git archive` jest tu ZASTAPIONY SHIMEM na PATH (nie tykamy prawdziwego
# repo) - shim odpowiada TYLKO na podkomende `archive`, bo funkcja
# sekrety_eksportuj_tresc nie wola gita inaczej.

KATALOG_SHIM_128="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_SHIM_128")
cat > "$KATALOG_SHIM_128/git" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "archive" ]]; then
  exit 128
fi
exit 1
EOF
chmod +x "$KATALOG_SHIM_128/git"

KATALOG_SHIM_PUSTY="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_SHIM_PUSTY")
cat > "$KATALOG_SHIM_PUSTY/git" <<'EOF'
#!/usr/bin/env bash
# archive "udaje sie" (EXIT=0) i wypisuje POPRAWNE, ale PUSTE archiwum tar
# (1024 bajty zer - dwa bloki koncowe, ktore `tar` rozpoznaje jako prawidlowy
# koniec archiwum, EXIT=0) - `tar -x` na takim wejsciu konczy sie EXIT=0 i
# eksportuje 0 plikow (F-107, przypadek "gitleaks skanuje 0 B i pisze no
# leaks found" bez tej poprawki). Rozny przypadek niz PIPESTATUS[1]!=0 nizej
# (przypadek 11): tu OBA czlony potoku "udaja sie", a mimo to trescia nie ma
# nic do zmierzenia.
if [[ "$1" == "archive" ]]; then
  head -c 1024 /dev/zero
  exit 0
fi
exit 1
EOF
chmod +x "$KATALOG_SHIM_PUSTY/git"

echo "=== 5 eksport: git archive pada (shim, EXIT=128) - K1 ==="
KATALOG_EKSPORT_1="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_EKSPORT_1")
KOMUNIKAT_K1="$(PATH="$KATALOG_SHIM_128:$PATH" sekrety_eksportuj_tresc HEAD "$KATALOG_EKSPORT_1" 2>&1 1>/dev/null)"
KOD_K1=$?
echo "  sekrety_eksportuj_tresc: rc=$KOD_K1, komunikat: $KOMUNIKAT_K1"
NIEZAL_K1=0
[[ "$KOD_K1" -eq 2 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=2, dostalem rc=$KOD_K1"; NIEZAL_K1=1; }
[[ "$KOMUNIKAT_K1" == *"eksport tresci commitu nieprawidlowy"* ]] || { echo "  WYNIK: NIEZALICZONY - komunikat nie nazywa przyczyny"; NIEZAL_K1=1; }
[[ "$KOMUNIKAT_K1" == *"128"* ]] || { echo "  WYNIK: NIEZALICZONY - komunikat nie wspomina kodu wyjscia git archive"; NIEZAL_K1=1; }
if [[ "$NIEZAL_K1" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 6 eksport: git archive EXIT=0, ale 0 plikow (shim) - K2 ==="
KATALOG_EKSPORT_2="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_EKSPORT_2")
KOMUNIKAT_K2="$(PATH="$KATALOG_SHIM_PUSTY:$PATH" sekrety_eksportuj_tresc HEAD "$KATALOG_EKSPORT_2" 2>&1 1>/dev/null)"
KOD_K2=$?
echo "  sekrety_eksportuj_tresc: rc=$KOD_K2, komunikat: $KOMUNIKAT_K2"
NIEZAL_K2=0
[[ "$KOD_K2" -eq 2 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=2, dostalem rc=$KOD_K2"; NIEZAL_K2=1; }
[[ "$KOMUNIKAT_K2" == *"eksport tresci commitu nieprawidlowy"* ]] || { echo "  WYNIK: NIEZALICZONY - komunikat nie nazywa przyczyny"; NIEZAL_K2=1; }
[[ "$KOMUNIKAT_K2" == *"0 plikow"* ]] || { echo "  WYNIK: NIEZALICZONY - komunikat nie wspomina pustego eksportu"; NIEZAL_K2=1; }
if [[ "$NIEZAL_K2" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 7 eksport: kontrola negatywna - normalny git archive na czystym HEAD - K3 ==="
KATALOG_EKSPORT_3="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_EKSPORT_3")
PLIKOW_K3="$(cd "$REPO_ROOT" && sekrety_eksportuj_tresc HEAD "$KATALOG_EKSPORT_3")"
KOD_K3=$?
echo "  sekrety_eksportuj_tresc: rc=$KOD_K3, plikow=$PLIKOW_K3"
NIEZAL_K3=0
[[ "$KOD_K3" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0, dostalem rc=$KOD_K3"; NIEZAL_K3=1; }
[[ "$PLIKOW_K3" =~ ^[0-9]+$ ]] && [[ "$PLIKOW_K3" -gt 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano liczby plikow > 0, dostalem '$PLIKOW_K3'"; NIEZAL_K3=1; }
if [[ "$NIEZAL_K3" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

# ============================ CZESC 3: end-to-end (docker + gitleaks) ======
# Katalog z JEDNYM sztucznym trafieniem: ciag generowany W TEJ CHWILI
# (losowy hex), nie sekret wpisany na sztywno w repo. `.gitleaks.toml` z
# repo jest uzyty NIEZMIENIONY (ta sama migawka regul co reszta bramki).
# Wywolanie gitleaksa idzie przez sekrety_uruchom_gitleaks - TA SAMA funkcja
# co w kroku 3e bramki.
if ! command -v docker >/dev/null 2>&1; then
  # Brak Dockera NIE MA konczyc sie cicha zieleniia (F-108, druga uwaga):
  # przypadki end-to-end ponizej (8: sztuczne trafienie, 9: kontrola
  # negatywna na czystym HEAD) sa wtedy NIEZMIERZONE, nie ZALICZONE - licza
  # sie do osobnego licznika, ktory na koncu pliku zabiera EXIT=0.
  echo "=== 8 end-to-end (docker gitleaks) ==="
  echo "  WYNIK: NIE ZMIERZONO - brak docker w PATH"
  echo "=== 9 end-to-end kontrola negatywna (docker gitleaks na czystym HEAD) ==="
  echo "  WYNIK: NIE ZMIERZONO - brak docker w PATH"
  NIEZMIERZONE_LICZNIK=$((NIEZMIERZONE_LICZNIK + 2))
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

  echo "=== 8 end-to-end (docker gitleaks) - katalog z 1 sztucznym trafieniem ==="
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

  # --- 9 kontrola negatywna K3 (dokonczenie): prawdziwy eksport HEAD, ------
  # prawdziwy gitleaks - normalny bieg konczy sie EXIT=0, plikow > 0, trafien
  # policzalne (repo na tym commicie jest czyste - .gitleaks.toml wylacza
  # fixture'y ponizej z regul, wiec oczekujemy 0 trafien).
  echo "=== 9 end-to-end kontrola negatywna (docker gitleaks na czystym HEAD) - K3 ==="
  KATALOG_EKSPORT_K3B="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_EKSPORT_K3B")
  PLIKOW_K3B="$(cd "$REPO_ROOT" && sekrety_eksportuj_tresc HEAD "$KATALOG_EKSPORT_K3B")"
  KOD_EKSPORT_K3B=$?
  NIEZAL_K3B=0
  if [[ "$KOD_EKSPORT_K3B" -ne 0 ]]; then
    echo "  WYNIK: NIEZALICZONY - eksport HEAD nie powiodl sie (rc=$KOD_EKSPORT_K3B)"
    NIEZAL_K3B=1
  else
    LOG_K3B="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_K3B")
    # MSYS_NO_PATHCONV=1 z tego samego powodu co w przypadku 8 (Git Bash na
    # Windows psuje sciezke montowania bez tego).
    MSYS_NO_PATHCONV=1 sekrety_uruchom_gitleaks "$KATALOG_EKSPORT_K3B" "$REPO_ROOT/.gitleaks.toml" "$LOG_K3B"
    KOD_GITLEAKS_K3B=$?
    if grep -aq "scanned ~0 bytes" "$LOG_K3B" && command -v wslpath >/dev/null 2>&1; then
      MSYS_NO_PATHCONV=1 sekrety_uruchom_gitleaks \
        "$(wslpath -w "$KATALOG_EKSPORT_K3B")" "$(wslpath -w "$REPO_ROOT/.gitleaks.toml")" "$LOG_K3B"
      KOD_GITLEAKS_K3B=$?
    fi
    WYNIK_K3B="$(sekrety_policz_trafienia "$LOG_K3B")"; RC_K3B=$?
    echo "  plikow=$PLIKOW_K3B, gitleaks EXIT=$KOD_GITLEAKS_K3B, trafien=$WYNIK_K3B (rc licznika=$RC_K3B)"
    [[ "$KOD_GITLEAKS_K3B" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano gitleaks EXIT=0 na czystym HEAD"; NIEZAL_K3B=1; }
    [[ "$RC_K3B" -eq 0 && "$WYNIK_K3B" == "0" ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano 0 trafien zgodnych, dostalem '$WYNIK_K3B' (rc=$RC_K3B)"; NIEZAL_K3B=1; }
  fi
  if [[ "$NIEZAL_K3B" -eq 1 ]]; then
    NIEZALICZONE=$((NIEZALICZONE + 1))
  else
    echo "  WYNIK: ZALICZONY"
  fi
fi

# ============================ CZESC 4: filtr pol (F-108) ===================
# `sekrety_pola_do_logu` NIE MA byc zielony tylko dlatego, ze --redact
# ukryl tresc sekretu wczesniej (K4/K5) - ta asercja dziala na fiksturze,
# ktora ma pola Secret:/Match: NIEZALEZNIE od --redact, i sprawdza WPROST,
# ze funkcja filtra sama z siebie nie przepuszcza tych pol.
echo "=== 10 filtr pol: fikstura z polami Secret:/Match:, RuleID/File/Line zachowane - K4 ==="
LOG_FILTR="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_FILTR")
cat > "$LOG_FILTR" <<'EOF'
Finding:     GENERIC_API_KEY = "udawany-sekret-xyz"
Secret:      udawany-sekret-xyz
Match:       GENERIC_API_KEY = "udawany-sekret-xyz"
RuleID:      generic-api-key
Entropy:     3.677567
File:        /tresc/fake.env
Line:        1
Fingerprint: /tresc/fake.env:generic-api-key:1

3:22PM INF scanned ~61 bytes (61 bytes) in 8.25ms
3:22PM WRN leaks found: 1
EOF
LINIE_PRZED="$(grep -acE "^(Secret|Match):" "$LOG_FILTR")"
WYNIK_FILTR="$(sekrety_pola_do_logu "$LOG_FILTR")"
LINIE_PO_SM="$(printf '%s\n' "$WYNIK_FILTR" | grep -acE "^(Secret|Match):")"
echo "  linii Secret:/Match: PRZED filtrem: $LINIE_PRZED, PO filtrze: $LINIE_PO_SM"
NIEZAL_K4=0
[[ "$LINIE_PO_SM" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - filtr przepuscil pole Secret:/Match:"; NIEZAL_K4=1; }
printf '%s\n' "$WYNIK_FILTR" | grep -q "^RuleID:" || { echo "  WYNIK: NIEZALICZONY - filtr zgubil RuleID"; NIEZAL_K4=1; }
printf '%s\n' "$WYNIK_FILTR" | grep -q "^File:" || { echo "  WYNIK: NIEZALICZONY - filtr zgubil File"; NIEZAL_K4=1; }
printf '%s\n' "$WYNIK_FILTR" | grep -q "^Line:" || { echo "  WYNIK: NIEZALICZONY - filtr zgubil Line"; NIEZAL_K4=1; }
if [[ "$NIEZAL_K4" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

# ================ CZESC 5: PIPESTATUS[1] i pokrycie niezalezne (F-122/F-123) =
# Ticket K1/K3: `git archive` "udaje sie" (EXIT=0), ale `tar` konczy sie
# bledem na obcietym/niepoprawnym strumieniu - to jest DOKLADNIE przypadek,
# ktorego PIPESTATUS[0] (F-123) nie widzi, bo patrzy tylko na `git archive`.
KATALOG_SHIM_TAR_PADA="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_SHIM_TAR_PADA")
cat > "$KATALOG_SHIM_TAR_PADA/git" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "archive" ]]; then
  # Losowe bajty na stdout, NIE poprawny format tar - `git archive` konczy sie
  # EXIT=0 (proces po prostu skonczyl pisac), ale `tar -x` na tym wejsciu ma
  # sie wywalic (nie rozpozna formatu archiwum).
  head -c 200 /dev/urandom
  exit 0
fi
exit 1
EOF
chmod +x "$KATALOG_SHIM_TAR_PADA/git"

echo "=== 11 eksport: git archive EXIT=0, tar pada na niepoprawnym strumieniu - ticket K1/K3 (PIPESTATUS[1]) ==="
KATALOG_EKSPORT_TARFAIL="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_EKSPORT_TARFAIL")
KOMUNIKAT_TARFAIL="$(PATH="$KATALOG_SHIM_TAR_PADA:$PATH" sekrety_eksportuj_tresc HEAD "$KATALOG_EKSPORT_TARFAIL" 2>&1 1>/dev/null)"
KOD_TARFAIL=$?
echo "  sekrety_eksportuj_tresc: rc=$KOD_TARFAIL, komunikat: $KOMUNIKAT_TARFAIL"
NIEZAL_TARFAIL=0
[[ "$KOD_TARFAIL" -eq 2 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=2, dostalem rc=$KOD_TARFAIL"; NIEZAL_TARFAIL=1; }
[[ "$KOMUNIKAT_TARFAIL" == *"tar zakonczyl sie bledem"* ]] || { echo "  WYNIK: NIEZALICZONY - komunikat nie nazywa tar jako przyczyny"; NIEZAL_TARFAIL=1; }
if [[ "$NIEZAL_TARFAIL" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 12 pokrycie: plikow i bajtow zgodne (kontrola pozytywna) ==="
WYNIK_POKR_OK="$(sekrety_sprawdz_pokrycie 930 4374451 930 4374451)"; RC_POKR_OK=$?
echo "  $WYNIK_POKR_OK (rc=$RC_POKR_OK)"
NIEZAL_POKR_OK=0
[[ "$RC_POKR_OK" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0"; NIEZAL_POKR_OK=1; }
if [[ "$NIEZAL_POKR_OK" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 13 pokrycie: plikow NIEZGODNE (4 zamiast 930, dokladnie liczby z F-123) - ticket K5 ==="
WYNIK_POKR_PLIKOW="$(sekrety_sprawdz_pokrycie 4 34520 930 4374451)"; RC_POKR_PLIKOW=$?
echo "  $WYNIK_POKR_PLIKOW (rc=$RC_POKR_PLIKOW)"
NIEZAL_POKR_PLIKOW=0
[[ "$RC_POKR_PLIKOW" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=1"; NIEZAL_POKR_PLIKOW=1; }
[[ "$WYNIK_POKR_PLIKOW" == *"plikow zmierzone=4"* && "$WYNIK_POKR_PLIKOW" == *"oczekiwane"*"930"* ]] || { echo "  WYNIK: NIEZALICZONY - komunikat nie podaje obu liczb plikow"; NIEZAL_POKR_PLIKOW=1; }
if [[ "$NIEZAL_POKR_PLIKOW" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 14 pokrycie: plikow zgodne, bajtow ponizej progu 0,9x (dokladnie liczby z F-123) - ticket K6 ==="
WYNIK_POKR_BAJT="$(sekrety_sprawdz_pokrycie 930 34520 930 4374451)"; RC_POKR_BAJT=$?
echo "  $WYNIK_POKR_BAJT (rc=$RC_POKR_BAJT)"
NIEZAL_POKR_BAJT=0
[[ "$RC_POKR_BAJT" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=1"; NIEZAL_POKR_BAJT=1; }
[[ "$WYNIK_POKR_BAJT" == *"bajtow zmierzone=34520"* ]] || { echo "  WYNIK: NIEZALICZONY - komunikat nie podaje zmierzonych bajtow"; NIEZAL_POKR_BAJT=1; }
if [[ "$NIEZAL_POKR_BAJT" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 15 pokrycie: brak liczby zmierzonej (NIEZMIERZONE) - ticket K7 ==="
WYNIK_POKR_BRAK="$(sekrety_sprawdz_pokrycie NIEZMIERZONE 34520 930 4374451)"; RC_POKR_BRAK=$?
echo "  $WYNIK_POKR_BRAK (rc=$RC_POKR_BRAK)"
NIEZAL_POKR_BRAK=0
[[ "$RC_POKR_BRAK" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=1"; NIEZAL_POKR_BRAK=1; }
[[ "$WYNIK_POKR_BRAK" == *"NIEZMIERZONE"* ]] || { echo "  WYNIK: NIEZALICZONY - komunikat nie mowi NIEZMIERZONE"; NIEZAL_POKR_BRAK=1; }
if [[ "$NIEZAL_POKR_BRAK" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 16 wyciagniecie bajtow skanu: log bez linii 'scanned' - NIEZMIERZONE - ticket K7 ==="
LOG_BEZ_SCANNED="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_BEZ_SCANNED")
printf '3:22PM FTL could not open config file\n' > "$LOG_BEZ_SCANNED"
WYNIK_BAJTY_BRAK="$(sekrety_wyciagnij_bajty_skanu "$LOG_BEZ_SCANNED")"; RC_BAJTY_BRAK=$?
echo "  sekrety_wyciagnij_bajty_skanu: '$WYNIK_BAJTY_BRAK' (rc=$RC_BAJTY_BRAK)"
NIEZAL_BAJTY_BRAK=0
[[ "$RC_BAJTY_BRAK" -eq 1 && "$WYNIK_BAJTY_BRAK" == "NIEZMIERZONE" ]] || { echo "  WYNIK: NIEZALICZONY"; NIEZAL_BAJTY_BRAK=1; }
if [[ "$NIEZAL_BAJTY_BRAK" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 17 pokrycie: scanned ~0 bytes na logu z 'no leaks found' (udawany wyciek nie doskanowany) - ticket K4 ==="
# Odroznienie od przyczyny "test wlasnej logiki jest CZERWONY": tu test
# wlasnej logiki (CZESC 1-4 wyzej) jest ZIELONY, a mimo to krok 3e ma
# oblac - z powodu ZEROWEGO SKANU, nie z powodu wbudowanego testu. Ten log
# wyglada dokladnie jak F-122 (scan 0 bajtow na commicie z udawanym wyciekiem).
LOG_ZERO_BAJTOW="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_ZERO_BAJTOW")
cat > "$LOG_ZERO_BAJTOW" <<'EOF'
3:07PM INF scanned ~0 bytes (0 B) in 0.12s
3:07PM INF no leaks found
EOF
BAJTY_ZERO="$(sekrety_wyciagnij_bajty_skanu "$LOG_ZERO_BAJTOW")"; RC_BAJTY_ZERO=$?
WYNIK_POKR_ZERO="$(sekrety_sprawdz_pokrycie 1 "$BAJTY_ZERO" 1 1000)"; RC_POKR_ZERO=$?
echo "  bajty ze skanu: $BAJTY_ZERO (rc=$RC_BAJTY_ZERO); pokrycie: $WYNIK_POKR_ZERO (rc=$RC_POKR_ZERO)"
NIEZAL_POKR_ZERO=0
[[ "$RC_BAJTY_ZERO" -eq 0 && "$BAJTY_ZERO" == "0" ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano odczytania 0 bajtow"; NIEZAL_POKR_ZERO=1; }
[[ "$RC_POKR_ZERO" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano czerwonego pokrycia"; NIEZAL_POKR_ZERO=1; }
[[ "$WYNIK_POKR_ZERO" == *"bajtow zmierzone=0"* ]] || { echo "  WYNIK: NIEZALICZONY - komunikat nie nazywa zerowego skanu jako przyczyny"; NIEZAL_POKR_ZERO=1; }
if [[ "$NIEZAL_POKR_ZERO" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo
if [[ "$NIEZALICZONE" -gt 0 ]]; then
  echo "TESTY LOGIKI LICZNIKA SEKRETOW: NIEZALICZONE PRZYPADKI: $NIEZALICZONE"
  exit 1
elif [[ "$NIEZMIERZONE_LICZNIK" -gt 0 ]]; then
  # F-108 (druga uwaga): brak Dockera NIE MA wygladac jak zielony bieg - kod
  # wyjscia jest tu CELOWO inny niz 0 i inny niz 1 (NIEZALICZONY), zeby
  # wolajacy odroznil "sprawdzilem i jest OK" od "nie sprawdzilem wcale".
  echo "TESTY LOGIKI LICZNIKA SEKRETOW: NIE ZMIERZONO $NIEZMIERZONE_LICZNIK przypadek(ow) (brak Docker) - bieg NIE jest zielony"
  exit 3
else
  echo "TESTY LOGIKI LICZNIKA SEKRETOW: WSZYSTKIE ZALICZONE"
  exit 0
fi
