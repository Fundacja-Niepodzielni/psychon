#!/usr/bin/env bash
# Test LOGIKI kroku "3e - sekrety w tresci commitu" z deploy/bramka-hosta.sh.
# Zrodlowuje DOKLADNIE ten sam plik co bramka -
# deploy/lib/sekrety-licznik.sh - i wywoluje jego funkcje na fixture'ach oraz
# (CZESC 2) na PRAWDZIWYM wyjsciu gitleaksa. Ten skrypt NIE MA wlasnej kopii
# logiki licznika/kontroli zgodnosci/filtra pol - kazda zmiana w bibliotece
# (albo jej brak) jest zmiana tego, co ten test naprawde mierzy.
#
# CZESC 1 nizej dziala na SPREPAROWANYCH logach (fixture'ach) - imituja one
# rozne wyjscia gitleaksa (zgodne, niezgodne, brak podsumowania), bez
# dotykania Dockera. CZESC 2 (przypadki 5-7) mierzy
# sekrety_eksportuj_tresc: `git archive` zepsuty albo pusty (shim na PATH,
# bez Dockera) MA konczyc sie kodem 2 z czytelnym komunikatem, normalny
# eksport HEAD MA sie udac. CZESC 3 (przypadki 8-9) jest END-TO-END: prawdziwy
# gitleaks w Dockerze - najpierw na katalogu z JEDNYM SZTUCZNYM trafieniem
# (losowy ciag wygenerowany W TEJ CHWILI, nie wpisany na sztywno - zaden
# prawdziwy sekret nigdzie nie wystapil), potem jako kontrola negatywna na
# prawdziwym eksporcie HEAD (0 trafien oczekiwane) - obie przez
# sekrety_uruchom_gitleaks, TA SAMA funkcja/plik co w bramce. Bez Dockera oba
# przypadki sa NIEZMIERZONE, nie ZALICZONE - kod wyjscia calego
# skryptu to wtedy 3, nie 0. CZESC 4 (przypadek 10) mierzy WPROST
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
# format. Licznik OPARTY WYLACZNIE o naglowki tego nie widzi -
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

# ============================ CZESC 2: sekrety_eksportuj_tresc ============
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
# eksportuje 0 plikow (przypadek "gitleaks skanuje 0 B i pisze no
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
  # Brak Dockera NIE MA konczyc sie cicha zieleniia (druga uwaga):
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
  # wejscie ma byc LOSOWE, ale o STALEJ entropii. Poprzednio bylo to 40
  # znakow hex z /dev/urandom - rozklad znakow wychodzil raz taki, raz inny, a
  # gitleaks tnie regule generic-api-key progiem entropii Shannona 3,5: zmierzone
  # entropie kolejnych losowan 3,644 / 3,554 / 3,806, wiec ten sam kod raz
  # przechodzil, raz nie, BEZ zadnej zmiany w bibliotece. Teraz ciag to 48 znakow:
  # kazda z 16 cyfr szesnastkowych DOKLADNIE trzy razy, w losowej kolejnosci -
  # entropia Shannona takiego zbioru wynosi log2(16) = 4,000 niezaleznie od
  # wylosowanej kolejnosci. Losowosc zostaje (zaden sekret nie jest wpisany w
  # repo), zmienna przestaje byc ta, ktora decydowala o wyniku.
  CIAG_SYNTETYCZNY="$(printf '0123456789abcdef%.0s' 1 2 3 | fold -w1 | shuf | tr -d '\n')"
  ENTROPIA_CIAGU="$(printf '%s' "$CIAG_SYNTETYCZNY" | fold -w1 | sort | uniq -c \
    | awk '{n[NR]=$1; s+=$1} END{e=0; for(i=1;i<=NR;i++){pr=n[i]/s; e-=pr*log(pr)/log(2)} printf "%.3f", e}')"
  echo "  entropia wejscia (Shannon, znaki): $ENTROPIA_CIAGU (prog gitleaksa dla generic-api-key: 3,5)"
  if ! awk -v e="$ENTROPIA_CIAGU" 'BEGIN{exit !(e >= 3.9)}'; then
    echo "  WYNIK: NIEZALICZONY - wejscie przypadku 8 ma entropie $ENTROPIA_CIAGU, czyli nie jest stale powyzej progu"
    NIEZALICZONE=$((NIEZALICZONE + 1))
  fi
  printf 'GENERIC_API_KEY = "%s"\n' "$CIAG_SYNTETYCZNY" > "$KATALOG_SEKRETU/fake.env"

  LOG_E2E="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_E2E")
  sekrety_uruchom_gitleaks_odporne "$KATALOG_SEKRETU" "$REPO_ROOT/.gitleaks.toml" "$LOG_E2E"
  KOD_E2E=$?

  # W WSL, gdzie `docker` na PATH bywa TYLKO cienkim wrapperem do docker.exe
  # (Windows), ten `docker.exe` NIE tlumaczy sam sciezek `/mnt/<litera>/...` -
  # montaz `-v` na takiej sciezce wychodzi PUSTY (zmierzone lokalnie: katalog
  # inny niz podany, "scanned ~0 bytes" mimo pliku w srodku). Wykrywamy to PO
  # WYNIKU (nie po nazwie dystrybucji) i, jesli `wslpath` jest dostepny,
  # PONAWIAMY z przetlumaczonymi sciezkami Windows (D:\...), na ktorych ten
  # sam `docker.exe` montuje poprawnie.

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
    sekrety_uruchom_gitleaks_odporne "$KATALOG_EKSPORT_K3B" "$REPO_ROOT/.gitleaks.toml" "$LOG_K3B"
    KOD_GITLEAKS_K3B=$?
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

  # ========== CZESC 5b: regula pomijania wyliczona w biegu =================
  # $LOG_K3B/$KATALOG_EKSPORT_K3B/$PLIKOW_K3B sa juz gotowe z przypadku 9
  # (ten sam prawdziwy bieg gitleaksa na czystym HEAD) - NIE mierzymy drugi
  # raz tego samego skanu, tylko czytamy z niego dodatkowe informacje.
  echo "=== 18 K1: regula pomijania nazwana i zmierzona (2 z listy, 2 spoza) ==="
  LISTA_POMINIETE_K1="$(sekrety_pliki_pominiete "$LOG_K3B")"
  echo "  plikow pominietych przez gitleaks: $(printf '%s\n' "$LISTA_POMINIETE_K1" | grep -c .)"
  NIEZAL_K1F133=0
  for P in "frontend/package-lock.json" "backend/public/favicon.ico"; do
    printf '%s\n' "$LISTA_POMINIETE_K1" | grep -qxF "$P" || { echo "  WYNIK: NIEZALICZONY - '$P' (z listy oczekiwanej) oczekiwany wsrod pominietych, nie ma go"; NIEZAL_K1F133=1; }
  done
  for P in "deploy/lib/sekrety-licznik.sh" "frontend/package.json"; do
    printf '%s\n' "$LISTA_POMINIETE_K1" | grep -qxF "$P" && { echo "  WYNIK: NIEZALICZONY - '$P' (spoza listy) NIE powinien byc pominiety, a jest"; NIEZAL_K1F133=1; }
  done
  if [[ "$NIEZAL_K1F133" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

  echo "=== 19 oczekiwane bajty ZE STRUMIENIA TAR, porownanie DOKLADNE (tolerancja 0) ==="
  # (16.09.2026): oczekiwane liczymy z rozpakowanego eksportu, nie z
  # `git ls-tree` - inaczej obie strony licza INNE BAJTY tych samych plikow
  # (`git archive` doklada CR w plikach .ps1: +70 B na tym drzewie) i roznice
  # trzeba bylo zaklejac progiem procentowym. Tu progu nie ma: ma sie zgadzac
  # co do bajta.
  BAJTOW_OCZ_K2="$(sekrety_oczekiwane_bajty "$KATALOG_EKSPORT_K3B" "$LOG_K3B")"; RC_OCZ_K2=$?
  BAJTOW_ZM_K2="$(sekrety_wyciagnij_bajty_skanu "$LOG_K3B")"
  PLIKOW_OCZ_K2="$(cd "$REPO_ROOT" && sekrety_git_ls_plikow HEAD)"
  PELNE_K2="$(sekrety_bajtow_eksportu "$KATALOG_EKSPORT_K3B")"
  POMINIETYCH_K2="$(sekrety_pliki_pominiete "$LOG_K3B" | sort -u | grep -c .)"
  WYNIK_K2="$(cd "$REPO_ROOT" && sekrety_sprawdz_pokrycie "$PLIKOW_K3B" "$BAJTOW_ZM_K2" "$PLIKOW_OCZ_K2" "$BAJTOW_OCZ_K2" "$KATALOG_EKSPORT_K3B" HEAD)"; RC_K2=$?
  echo "  eksport pelny=$PELNE_K2 B, pominietych plikow=$POMINIETYCH_K2, oczekiwane=$BAJTOW_OCZ_K2 (rc=$RC_OCZ_K2), zmierzone=$BAJTOW_ZM_K2"
  echo "  $WYNIK_K2 (rc=$RC_K2)"
  NIEZAL_K2F133=0
  [[ "$RC_OCZ_K2" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - sekrety_oczekiwane_bajty odmowilo na czystym drzewie"; NIEZAL_K2F133=1; }
  [[ "$RC_K2" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0"; NIEZAL_K2F133=1; }
  if [[ "$BAJTOW_ZM_K2" =~ ^[0-9]+$ && "$BAJTOW_OCZ_K2" =~ ^[0-9]+$ ]]; then
    ROZNICA_K2=$(( BAJTOW_ZM_K2 - BAJTOW_OCZ_K2 ))
    echo "  roznica zmierzone-oczekiwane: $ROZNICA_K2 B (wymagane 0)"
    [[ "$ROZNICA_K2" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - roznica $ROZNICA_K2 B przy tolerancji 0"; NIEZAL_K2F133=1; }
  else
    echo "  WYNIK: NIEZALICZONY - ktoras z liczb nie jest liczba"; NIEZAL_K2F133=1
  fi
  if [[ "$NIEZAL_K2F133" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

  # --- 20 K3: falszywy alarm na PRAWDZIWYCH binariach --------------------
  # Poprzednia wersja dokladala 600 kB z /dev/urandom - tresci, ktorej skaner NIE
  # rozpoznaje po MIME, wiec ja skanowal i przypadek nie dotykal wady. Tu ida
  # PRAWDZIWE binaria: 20 kopii czcionki woff2 pod rozszerzeniem .fnt (609 760 B),
  # ktore gitleaks pomija po ROZPOZNANYM MIME ("DBG skipping binary file
  # mime_type=application/font-woff"). Zmierzone na poprzedniej bibliotece:
  # oczekiwane 5 011 020, zmierzone 4 401 330, KROK 3E czerwony BEZ WYCIEKU.
  # Przypadek 23 nizej jest kontrola drugiej strony (tresc, ktora JEST skanowana).
  echo "=== 20 K3: 609 760 B prawdziwych binariow (woff2 jako .fnt) bez wycieku -> zielone ==="
  WT_K3="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$WT_K3")
  # w Git Bash `git worktree add` dostawal sciezke MSYS ("/d/tmp/..."),
  # a windowsowy git zakladal ja pod "D:\d\tmp\..." - worktree nie powstawal
  # tam, gdzie test go szukal, przypadek byl NIEZMIERZONY, a na dysku zostawalo
  # 8,7 MB smieci poza repozytorium. Sciezka idzie teraz przez cygpath (gdy jest)
  # i z MSYS_NO_PATHCONV=1.
  SCIEZKA_WT_K3="$WT_K3"
  command -v cygpath >/dev/null 2>&1 && SCIEZKA_WT_K3="$(cygpath -w "$WT_K3")"
  (cd "$REPO_ROOT" && MSYS_NO_PATHCONV=1 git worktree add -q --detach "$SCIEZKA_WT_K3" HEAD) >/dev/null 2>&1
  WYNIK_WT_K3=1
  if [[ -d "$WT_K3/.git" || -f "$WT_K3/.git" ]]; then
    mkdir -p "$WT_K3/deploy/tests/przyrost-binariow"
    seq 1 20 | xargs -I@ cp "$WT_K3/frontend/public/fonts/roboto-v51-latin.woff2" "$WT_K3/deploy/tests/przyrost-binariow/czcionka-@.fnt"
    BAJTOW_PRZYROSTU_K3="$(sekrety_bajtow_eksportu "$WT_K3/deploy/tests/przyrost-binariow")"
    (cd "$WT_K3" && git add deploy/tests/przyrost-binariow \
      && git -c user.email="Fundacja-Niepodzielni@users.noreply.github.com" -c user.name="Fundacja Niepodzielni" \
             commit -q -m "test: perturbacja binariow bez sekretu (nigdy niescalana)") >/dev/null 2>&1
    EKSP_K3="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$EKSP_K3")
    PLIKOW_ZM_K3="$(cd "$WT_K3" && sekrety_eksportuj_tresc HEAD "$EKSP_K3")"
    LOG_K3="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_K3")
    sekrety_uruchom_gitleaks_odporne "$EKSP_K3" "$WT_K3/.gitleaks.toml" "$LOG_K3" "$WT_K3/.gitleaksignore"
    BAJTOW_ZM_K3="$(sekrety_wyciagnij_bajty_skanu "$LOG_K3")"
    PLIKOW_OCZ_K3="$(cd "$WT_K3" && sekrety_git_ls_plikow HEAD)"
    BAJTOW_OCZ_K3="$(sekrety_oczekiwane_bajty "$EKSP_K3" "$LOG_K3")"; RC_OCZ_K3=$?
    POMINIETYCH_K3="$(sekrety_pliki_pominiete "$LOG_K3" | sort -u | grep -c .)"
    WYNIK_POKR_K3="$(cd "$WT_K3" && sekrety_sprawdz_pokrycie "$PLIKOW_ZM_K3" "$BAJTOW_ZM_K3" "$PLIKOW_OCZ_K3" "$BAJTOW_OCZ_K3" "$EKSP_K3" HEAD)"; RC_POKR_K3=$?
    echo "  dolozone binaria: $BAJTOW_PRZYROSTU_K3 B w 20 plikach; plikow $PLIKOW_ZM_K3/$PLIKOW_OCZ_K3; pominietych $POMINIETYCH_K3"
    echo "  oczekiwane=$BAJTOW_OCZ_K3 (rc=$RC_OCZ_K3) zmierzone=$BAJTOW_ZM_K3"
    echo "  $WYNIK_POKR_K3 (rc=$RC_POKR_K3)"
    [[ "$RC_POKR_K3" -eq 0 && "$RC_OCZ_K3" -eq 0 ]] && WYNIK_WT_K3=0
    (cd "$REPO_ROOT" && git worktree remove --force "$SCIEZKA_WT_K3") >/dev/null 2>&1
  else
    echo "  WYNIK: NIE ZMIERZONO - nie udalo sie zalozyc jednorazowego worktree"
    NIEZMIERZONE_LICZNIK=$((NIEZMIERZONE_LICZNIK + 1))
    WYNIK_WT_K3=2
  fi
  if [[ "$WYNIK_WT_K3" -eq 0 ]]; then
    echo "  WYNIK: ZALICZONY"
  elif [[ "$WYNIK_WT_K3" -eq 1 ]]; then
    echo "  WYNIK: NIEZALICZONY - oczekiwano pokrycia ZGODNEGO (zielonego) na 609 760 B binariow bez wycieku"
    NIEZALICZONE=$((NIEZALICZONE + 1))
  fi

  # --- 21 K4: perturbacja prawdziwa - strumien przyciety --------------------
  echo "=== 21 K4: strumien gitleaksa przyciety -> czerwone ==="
  EKSP_K4="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$EKSP_K4")
  (cd "$REPO_ROOT" && git archive --format=tar HEAD) | head -c 40000 | tar -x -C "$EKSP_K4" 2>/dev/null
  PLIKOW_ZM_K4="$(find "$EKSP_K4" -type f | wc -l)"
  LOG_K4="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_K4")
  sekrety_uruchom_gitleaks_odporne "$EKSP_K4" "$REPO_ROOT/.gitleaks.toml" "$LOG_K4"
  BAJTOW_ZM_K4="$(sekrety_wyciagnij_bajty_skanu "$LOG_K4")"
  PLIKOW_OCZ_K4="$(cd "$REPO_ROOT" && sekrety_git_ls_plikow HEAD)"
  BAJTOW_OCZ_K4="$(sekrety_oczekiwane_bajty "$EKSP_K4" "$LOG_K4")"
  WYNIK_POKR_K4="$(cd "$REPO_ROOT" && sekrety_sprawdz_pokrycie "$PLIKOW_ZM_K4" "$BAJTOW_ZM_K4" "$PLIKOW_OCZ_K4" "$BAJTOW_OCZ_K4" "$EKSP_K4" HEAD)"; RC_POKR_K4=$?
  echo "  plikow $PLIKOW_ZM_K4/$PLIKOW_OCZ_K4, bajtow $BAJTOW_ZM_K4/$BAJTOW_OCZ_K4"
  echo "  $WYNIK_POKR_K4 (rc=$RC_POKR_K4)"
  NIEZAL_K4F133=0
  [[ "$RC_POKR_K4" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano czerwonego pokrycia na przycietym strumieniu"; NIEZAL_K4F133=1; }
  if [[ "$NIEZAL_K4F133" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

  # --- 22 K5: perturbacja nowa - usuniety jeden plik tekstowy z eksportu ----
  echo "=== 22 K5: jeden plik tekstowy usuniety z eksportu (spoza listy pomijanych) -> czerwone ==="
  EKSP_K5="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$EKSP_K5")
  PLIKOW_PRZED_K5="$(cd "$REPO_ROOT" && sekrety_eksportuj_tresc HEAD "$EKSP_K5")"
  PLIK_USUN_K5="$(find "$EKSP_K5/backend/tests" -name "*.php" -size +2k -size -20k 2>/dev/null | head -1)"
  if [[ -n "$PLIK_USUN_K5" ]]; then
    rm -f "$PLIK_USUN_K5"
  fi
  PLIKOW_ZM_K5="$(find "$EKSP_K5" -type f | wc -l)"
  LOG_K5="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_K5")
  sekrety_uruchom_gitleaks_odporne "$EKSP_K5" "$REPO_ROOT/.gitleaks.toml" "$LOG_K5"
  BAJTOW_ZM_K5="$(sekrety_wyciagnij_bajty_skanu "$LOG_K5")"
  PLIKOW_OCZ_K5="$(cd "$REPO_ROOT" && sekrety_git_ls_plikow HEAD)"
  BAJTOW_OCZ_K5="$(sekrety_oczekiwane_bajty "$EKSP_K5" "$LOG_K5")"
  WYNIK_POKR_K5="$(cd "$REPO_ROOT" && sekrety_sprawdz_pokrycie "$PLIKOW_ZM_K5" "$BAJTOW_ZM_K5" "$PLIKOW_OCZ_K5" "$BAJTOW_OCZ_K5" "$EKSP_K5" HEAD)"; RC_POKR_K5=$?
  echo "  usuniety: ${PLIK_USUN_K5:-BRAK - nie znaleziono kandydata}, plikow $PLIKOW_ZM_K5/$PLIKOW_OCZ_K5 (przed usunieciem eksport mial $PLIKOW_PRZED_K5)"
  echo "  $WYNIK_POKR_K5 (rc=$RC_POKR_K5)"
  NIEZAL_K5F133=0
  [[ -n "$PLIK_USUN_K5" ]] || { echo "  WYNIK: NIEZALICZONY - nie znaleziono pliku-kandydata do usuniecia"; NIEZAL_K5F133=1; }
  [[ "$RC_POKR_K5" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano czerwonego pokrycia po usunieciu pliku z eksportu"; NIEZAL_K5F133=1; }
  if [[ "$NIEZAL_K5F133" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

  # --- 23 kontrola drugiej strony: tresc, ktorej skaner NIE pomija ----------
  # 600 000 B z /dev/urandom gitleaks SKANUJE (nie rozpoznaje MIME), wiec te
  # bajty MAJA sie znalezc po obu stronach porownania. Bez tego przypadku
  # "zielone na binariach" dalo by sie uzyskac odejmowaniem wszystkiego.
  echo "=== 23 kontrola: +600 000 B tresci SKANOWANEJ (urandom) tez zielone ==="
  EKSP_K6="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$EKSP_K6")
  PLIKOW_ZM_K6="$(cd "$REPO_ROOT" && sekrety_eksportuj_tresc HEAD "$EKSP_K6")"
  head -c 600000 /dev/urandom > "$EKSP_K6/przyrost-losowy.dat"
  PLIKOW_ZM_K6=$(( PLIKOW_ZM_K6 + 1 ))
  PLIKOW_OCZ_K6=$(( $(cd "$REPO_ROOT" && sekrety_git_ls_plikow HEAD) + 1 ))
  LOG_K6="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_K6")
  sekrety_uruchom_gitleaks_odporne "$EKSP_K6" "$REPO_ROOT/.gitleaks.toml" "$LOG_K6" "$REPO_ROOT/.gitleaksignore"
  BAJTOW_ZM_K6="$(sekrety_wyciagnij_bajty_skanu "$LOG_K6")"
  BAJTOW_OCZ_K6="$(sekrety_oczekiwane_bajty "$EKSP_K6" "$LOG_K6")"; RC_OCZ_K6=$?
  WYNIK_POKR_K6="$(sekrety_sprawdz_pokrycie "$PLIKOW_ZM_K6" "$BAJTOW_ZM_K6" "$PLIKOW_OCZ_K6" "$BAJTOW_OCZ_K6")"; RC_POKR_K6=$?
  echo "  plikow $PLIKOW_ZM_K6/$PLIKOW_OCZ_K6, oczekiwane=$BAJTOW_OCZ_K6 (rc=$RC_OCZ_K6) zmierzone=$BAJTOW_ZM_K6"
  echo "  $WYNIK_POKR_K6 (rc=$RC_POKR_K6)"
  NIEZAL_K6F133=0
  [[ "$RC_POKR_K6" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano zielonego pokrycia na tresci skanowanej"; NIEZAL_K6F133=1; }
  if [[ "$NIEZAL_K6F133" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

  # --- 24 wyciszenie po ODCISKU, nie po sciezce ----------------------
  # Podrzucony sekret w frontend/__tests__/ MA byc znaleziony. Wczesniej wyjatek
  # w .gitleaks.toml pomijal te sciezke PRZED czytaniem tresci, wiec dalo sie tam
  # schowac dowolny klucz (zmierzone: takze caly blok BEGIN RSA PRIVATE KEY).
  # Atrapa powstaje TYLKO w katalogu tymczasowym i nigdy nie trafia do repo.
  echo "=== 24 podrzucony sekret w frontend/__tests__ JEST znajdowany ==="
  EKSP_K7="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$EKSP_K7")
  (cd "$REPO_ROOT" && sekrety_eksportuj_tresc HEAD "$EKSP_K7") >/dev/null
  CIAG_PODRZUCONY="$(printf '0123456789abcdef%.0s' 1 2 3 | fold -w1 | shuf | tr -d '\n')"
  mkdir -p "$EKSP_K7/frontend/__tests__"
  printf 'const GENERIC_API_KEY = "%s";\n' "$CIAG_PODRZUCONY" > "$EKSP_K7/frontend/__tests__/podrzucony-atrapa.test.ts"
  # Druga atrapa - INNA REGULA (private-key). Wyciszenie po odcisku dotyczy
  # jednego trafienia jednej reguly; gdyby wrocilo wyciszenie po sciezce, w tym
  # samym katalogu dalo by sie schowac takze blok klucza prywatnego (zmierzone
  # na poprzedniej wersji: nie byl znajdowany wcale). Naglowek bloku skladany
  # jest z kawalkow W BIEGU, zeby ten plik testu sam nie niosl jego ksztaltu.
  printf -- '-----%s RSA PRIVATE KEY-----\n%s\n-----%s RSA PRIVATE KEY-----\n' \
    BEGIN "$CIAG_PODRZUCONY" END > "$EKSP_K7/frontend/__tests__/podrzucony-klucz-atrapa.test.ts"
  LOG_K7="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_K7")
  sekrety_uruchom_gitleaks_odporne "$EKSP_K7" "$REPO_ROOT/.gitleaks.toml" "$LOG_K7" "$REPO_ROOT/.gitleaksignore"
  TRAFIEN_K7="$(sekrety_policz_trafienia "$LOG_K7")"; RC_TRAF_K7=$?
  POMINIETY_K7="$(sekrety_pliki_pominiete "$LOG_K7" | grep -c 'frontend/__tests__/podrzucony-')"
  KLUCZ_ZNALEZIONY_K7="$(sekrety_pola_do_logu "$LOG_K7" | grep -c 'podrzucony-klucz-atrapa')"
  API_ZNALEZIONY_K7="$(sekrety_pola_do_logu "$LOG_K7" | grep -c 'podrzucony-atrapa')"
  echo "  trafien=$TRAFIEN_K7 (rc=$RC_TRAF_K7); plik z kluczem API: $API_ZNALEZIONY_K7, plik z kluczem prywatnym: $KLUCZ_ZNALEZIONY_K7"
  echo "  podrzucone pliki wsrod pominietych: $POMINIETY_K7 (wymagane 0)"
  NIEZAL_K7F143=0
  [[ "$RC_TRAF_K7" -eq 0 && "$TRAFIEN_K7" == "2" ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano DOKLADNIE 2 trafien (dwie rozne reguly), dostalem '$TRAFIEN_K7'"; NIEZAL_K7F143=1; }
  [[ "$API_ZNALEZIONY_K7" -ge 1 ]] || { echo "  WYNIK: NIEZALICZONY - podrzucony klucz API nie zostal znaleziony"; NIEZAL_K7F143=1; }
  [[ "$KLUCZ_ZNALEZIONY_K7" -ge 1 ]] || { echo "  WYNIK: NIEZALICZONY - podrzucony klucz prywatny (inna regula) nie zostal znaleziony"; NIEZAL_K7F143=1; }
  [[ "$POMINIETY_K7" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - podrzucony plik zostal pominiety przed czytaniem tresci"; NIEZAL_K7F143=1; }
  if [[ "$NIEZAL_K7F143" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi
fi

# ============================ CZESC 4: filtr pol ===========================
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

# ================ CZESC 5: PIPESTATUS[1] i pokrycie niezalezne =============
# Ticket K1/K3: `git archive` "udaje sie" (EXIT=0), ale `tar` konczy sie
# bledem na obcietym/niepoprawnym strumieniu - to jest DOKLADNIE przypadek,
# ktorego PIPESTATUS[0] nie widzi, bo patrzy tylko na `git archive`.
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

echo "=== 13 pokrycie: plikow NIEZGODNE (4 zamiast 930) - ticket K5 ==="
WYNIK_POKR_PLIKOW="$(sekrety_sprawdz_pokrycie 4 34520 930 4374451)"; RC_POKR_PLIKOW=$?
echo "  $WYNIK_POKR_PLIKOW (rc=$RC_POKR_PLIKOW)"
NIEZAL_POKR_PLIKOW=0
[[ "$RC_POKR_PLIKOW" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=1"; NIEZAL_POKR_PLIKOW=1; }
[[ "$WYNIK_POKR_PLIKOW" == *"plikow zmierzone=4"* && "$WYNIK_POKR_PLIKOW" == *"oczekiwane"*"930"* ]] || { echo "  WYNIK: NIEZALICZONY - komunikat nie podaje obu liczb plikow"; NIEZAL_POKR_PLIKOW=1; }
if [[ "$NIEZAL_POKR_PLIKOW" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 14 pokrycie: plikow zgodne, bajtow ponizej progu 0,9x - ticket K6 ==="
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
# wyglada dokladnie jak przypadek zerowego skanu (scan 0 bajtow na commicie z udawanym wyciekiem).
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

# ====== CZESC 6: trzecia klasa, zupelnosc klas, asercja nie do wylaczenia ====
# Wszystko na fixture'ach - bez Dockera, wiec mierzy sie ZAWSZE, takze tam,
# gdzie przypadkow end-to-end nie da sie uruchomic.
KAT_FIX="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KAT_FIX")
head -c 100 /dev/zero | tr '\0' 'a' > "$KAT_FIX/a.txt"
head -c 50 /dev/zero > "$KAT_FIX/b.fnt"
: > "$KAT_FIX/c.pusty"

LOG_FIX_TRZY="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_FIX_TRZY")
cat > "$LOG_FIX_TRZY" <<'EOF'
1:23PM DBG skipping file: global allowlist path=/tresc/a.txt
1:23PM DBG skipping empty file path=/tresc/c.pusty
1:23PM DBG skipping binary file mime_type=application/font-woff path=/tresc/b.fnt
1:23PM INF scanned ~0 bytes (0 B) in 1s
EOF

echo "=== 25 trzecia klasa pominiecia (binary file mime_type=) jest w zbiorze ==="
LISTA_FIX="$(sekrety_pliki_pominiete "$LOG_FIX_TRZY")"
LICZBA_FIX="$(printf '%s\n' "$LISTA_FIX" | grep -c .)"
echo "  zbior pominietych: $LICZBA_FIX plikow ($(printf '%s' "$LISTA_FIX" | tr '\n' ' '))"
NIEZAL_FIX_TRZY=0
[[ "$LICZBA_FIX" -eq 3 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano 3 plikow (trzy klasy pominiecia), jest $LICZBA_FIX"; NIEZAL_FIX_TRZY=1; }
printf '%s\n' "$LISTA_FIX" | grep -qxF "b.fnt" || { echo "  WYNIK: NIEZALICZONY - plik pominiety jako binarny po MIME nie jest w zbiorze"; NIEZAL_FIX_TRZY=1; }
if [[ "$NIEZAL_FIX_TRZY" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 26 nierozpoznana (czwarta) klasa pominiecia -> ODMOWA, nie zgadywanie ==="
LOG_FIX_OBCA="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_FIX_OBCA")
cat > "$LOG_FIX_OBCA" <<'EOF'
1:23PM DBG skipping file: global allowlist path=/tresc/a.txt
1:23PM DBG skipping wymyslona przyszla klasa path=/tresc/b.fnt
1:23PM INF scanned ~0 bytes (0 B) in 1s
EOF
NIEROZPOZNANE_FIX="$(sekrety_pominiete_nierozpoznane "$LOG_FIX_OBCA" | grep -c .)"
WYNIK_FIX_OBCA="$(sekrety_oczekiwane_bajty "$KAT_FIX" "$LOG_FIX_OBCA")"; RC_FIX_OBCA=$?
echo "  nierozpoznanych linii: $NIEROZPOZNANE_FIX; wynik: $WYNIK_FIX_OBCA (rc=$RC_FIX_OBCA)"
NIEZAL_FIX_OBCA=0
[[ "$NIEROZPOZNANE_FIX" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - kontrola zupelnosci klas nie widzi obcej linii"; NIEZAL_FIX_OBCA=1; }
[[ "$RC_FIX_OBCA" -eq 1 && "$WYNIK_FIX_OBCA" == *"ODMOWA"* ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano odmowy wyliczenia"; NIEZAL_FIX_OBCA=1; }
if [[ "$NIEZAL_FIX_OBCA" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 27 ta sama sciezka DWA RAZY w logu -> ODMOWA (zbior nie do nadmuchania) ==="
LOG_FIX_DWA="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_FIX_DWA")
cat > "$LOG_FIX_DWA" <<'EOF'
1:23PM DBG skipping file: global allowlist path=/tresc/a.txt
1:23PM DBG skipping file: global allowlist path=/tresc/a.txt
1:23PM INF scanned ~0 bytes (0 B) in 1s
EOF
SUMA_SUROWO_FIX="$(sekrety_pliki_pominiete "$LOG_FIX_DWA" | sekrety_bajtow_zbioru "$KAT_FIX")"
SUMA_UNIK_FIX="$(sekrety_pliki_pominiete "$LOG_FIX_DWA" | sort -u | sekrety_bajtow_zbioru "$KAT_FIX")"
WYNIK_FIX_DWA="$(sekrety_oczekiwane_bajty "$KAT_FIX" "$LOG_FIX_DWA")"; RC_FIX_DWA=$?
echo "  suma bez odduplikowania=$SUMA_SUROWO_FIX B, po odduplikowaniu=$SUMA_UNIK_FIX B (plik ma 100 B)"
echo "  wynik: $WYNIK_FIX_DWA (rc=$RC_FIX_DWA)"
NIEZAL_FIX_DWA=0
[[ "$SUMA_UNIK_FIX" -eq 100 ]] || { echo "  WYNIK: NIEZALICZONY - odduplikowany zbior ma liczyc 100 B, liczy $SUMA_UNIK_FIX"; NIEZAL_FIX_DWA=1; }
[[ "$RC_FIX_DWA" -eq 1 && "$WYNIK_FIX_DWA" == *"powtorzone sciezki"* ]] || { echo "  WYNIK: NIEZALICZONY - powtorzona sciezka ma byc odmowa, nie cichym odjeciem"; NIEZAL_FIX_DWA=1; }
if [[ "$NIEZAL_FIX_DWA" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 28 zbior pominietych obejmuje CALY eksport -> ODMOWA, nie 'zapas 100%' ==="
LOG_FIX_WSZYSTKO="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_FIX_WSZYSTKO")
cat > "$LOG_FIX_WSZYSTKO" <<'EOF'
1:23PM DBG skipping file: global allowlist path=/tresc/a.txt
1:23PM DBG skipping file: global allowlist path=/tresc/b.fnt
1:23PM DBG skipping empty file path=/tresc/c.pusty
1:23PM INF scanned ~0 bytes (0 B) in 1s
EOF
WYNIK_FIX_WSZ="$(sekrety_oczekiwane_bajty "$KAT_FIX" "$LOG_FIX_WSZYSTKO")"; RC_FIX_WSZ=$?
echo "  wynik: $WYNIK_FIX_WSZ (rc=$RC_FIX_WSZ)"
NIEZAL_FIX_WSZ=0
[[ "$RC_FIX_WSZ" -eq 1 && "$WYNIK_FIX_WSZ" == *"ODMOWA"* ]] || { echo "  WYNIK: NIEZALICZONY - zbior rowny calemu eksportowi ma byc odmowa"; NIEZAL_FIX_WSZ=1; }
if [[ "$NIEZAL_FIX_WSZ" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 29 oczekiwane 0 bajtow to ODMOWA, nie zgodnosc ==="
WYNIK_FIX_ZERO="$(sekrety_sprawdz_pokrycie 930 4401330 930 0)"; RC_FIX_ZERO=$?
echo "  $WYNIK_FIX_ZERO (rc=$RC_FIX_ZERO)"
NIEZAL_FIX_ZERO=0
[[ "$RC_FIX_ZERO" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=1 (odmowa)"; NIEZAL_FIX_ZERO=1; }
[[ "$WYNIK_FIX_ZERO" == *"ODMOWA"* ]] || { echo "  WYNIK: NIEZALICZONY - komunikat nie nazywa tego odmowa"; NIEZAL_FIX_ZERO=1; }
if [[ "$NIEZAL_FIX_ZERO" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 30 tolerancja 0 - JEDEN bajt roznicy to czerwien ==="
WYNIK_FIX_TOL_R="$(sekrety_sprawdz_pokrycie 930 4401331 930 4401330)"; RC_FIX_TOL_R=$?
WYNIK_FIX_TOL_Z="$(sekrety_sprawdz_pokrycie 930 4401330 930 4401330)"; RC_FIX_TOL_Z=$?
echo "  +1 B: $WYNIK_FIX_TOL_R (rc=$RC_FIX_TOL_R)"
echo "  0 B: $WYNIK_FIX_TOL_Z (rc=$RC_FIX_TOL_Z)"
NIEZAL_FIX_TOL=0
[[ "$RC_FIX_TOL_R" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - roznica 1 B ma byc czerwona (tolerancja 0)"; NIEZAL_FIX_TOL=1; }
[[ "$WYNIK_FIX_TOL_R" == *"roznica 1 B"* ]] || { echo "  WYNIK: NIEZALICZONY - komunikat nie podaje roznicy w bajtach"; NIEZAL_FIX_TOL=1; }
[[ "$RC_FIX_TOL_Z" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - rowne liczby maja byc zielone"; NIEZAL_FIX_TOL=1; }
if [[ "$NIEZAL_FIX_TOL" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 31 linia o wyciszonym TRAFIENIU nie jest pominietym PLIKIEM ==="
# Czwarty rodzaj linii "DBG skipping" (wyciszenie po odcisku z .gitleaksignore)
# dotyczy jednego trafienia, a nie pliku: plik jest czytany i liczony do
# "scanned ~N bytes". Gdyby wszedl do zbioru pominietych, oczekiwane bajty
# zanizylby o CALY plik; gdyby byl "nierozpoznany", kazdy bieg z wyciszeniem
# konczylby sie odmowa. Ma byc ani jedno, ani drugie.
LOG_FIX_ODCISK="$(mktemp)"; PLIKI_TESTOWE+=("$LOG_FIX_ODCISK")
cat > "$LOG_FIX_ODCISK" <<'EOF'
1:23PM DBG skipping file: global allowlist path=/tresc/a.txt
1:23PM DBG skipping finding: global fingerprint finding=REDACTED fingerprint=/tresc/b.fnt:generic-api-key:97
1:23PM INF scanned ~50 bytes (50 B) in 1s
EOF
LISTA_ODCISK="$(sekrety_pliki_pominiete "$LOG_FIX_ODCISK" | grep -c .)"
NIEROZP_ODCISK="$(sekrety_pominiete_nierozpoznane "$LOG_FIX_ODCISK" | grep -c .)"
OCZ_ODCISK="$(sekrety_oczekiwane_bajty "$KAT_FIX" "$LOG_FIX_ODCISK")"; RC_ODCISK=$?
echo "  pominietych PLIKOW: $LISTA_ODCISK (wymagane 1), nierozpoznanych linii: $NIEROZP_ODCISK (wymagane 0)"
echo "  oczekiwane=$OCZ_ODCISK (rc=$RC_ODCISK); eksport ma 150 B, plik pominiety 100 B"
NIEZAL_ODCISK=0
[[ "$LISTA_ODCISK" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - wyciszone trafienie policzone jako pominiety plik"; NIEZAL_ODCISK=1; }
[[ "$NIEROZP_ODCISK" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - znana linia o wyciszonym trafieniu uznana za nierozpoznana"; NIEZAL_ODCISK=1; }
[[ "$RC_ODCISK" -eq 0 && "$OCZ_ODCISK" == "50" ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano 50 B (150 minus 100 B pliku pominietego), dostalem '$OCZ_ODCISK' (rc=$RC_ODCISK)"; NIEZAL_ODCISK=1; }
if [[ "$NIEZAL_ODCISK" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo
if [[ "$NIEZALICZONE" -gt 0 ]]; then
  echo "TESTY LOGIKI LICZNIKA SEKRETOW: NIEZALICZONE PRZYPADKI: $NIEZALICZONE"
  exit 1
elif [[ "$NIEZMIERZONE_LICZNIK" -gt 0 ]]; then
  # Druga uwaga: brak Dockera NIE MA wygladac jak zielony bieg - kod
  # wyjscia jest tu CELOWO inny niz 0 i inny niz 1 (NIEZALICZONY), zeby
  # wolajacy odroznil "sprawdzilem i jest OK" od "nie sprawdzilem wcale".
  echo "TESTY LOGIKI LICZNIKA SEKRETOW: NIE ZMIERZONO $NIEZMIERZONE_LICZNIK przypadek(ow) (brak Docker) - bieg NIE jest zielony"
  exit 3
else
  echo "TESTY LOGIKI LICZNIKA SEKRETOW: WSZYSTKIE ZALICZONE"
  exit 0
fi
