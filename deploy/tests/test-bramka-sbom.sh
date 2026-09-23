#!/usr/bin/env bash
# Test LOGIKI kroku "inwentarz skladnikow (SBOM) i skan podatnosci" z
# deploy/bramka-hosta.sh. Zrodlowuje DOKLADNIE ten sam plik co bramka -
# deploy/lib/sbom.sh - i wywoluje jego funkcje na fixture'ach oraz (CZESC 3)
# na PRAWDZIWYM dockerze. Ten skrypt NIE MA wlasnej kopii logiki liczenia
# skladnikow/podatnosci ani uruchamiania kontenerow - kazda zmiana w
# bibliotece (albo jej brak) jest zmiana tego, co ten test naprawde mierzy.
#
# CZESC 1 i 2 nizej dzialaja na SPREPAROWANYCH plikach (fixture'ach), BEZ
# dotykania Dockera - to jest wymog: ta czesc testu ma mierzyc sie ZAWSZE,
# takze na maszynie bez Dockera w ogole. CZESC 3 (przypadek "brak docker")
# tez nie dotyka Dockera - symuluje jego brak przez PATH bez katalogu, w
# ktorym docker stoi. CZESC 4 jest END-TO-END: prawdziwy trivy+grype w
# Dockerze, na malej fixturze (composer.lock+package-lock.json) zlozonej OBOK
# tego pliku (nie w /tmp - patrz komentarz w deploy/lib/sbom.sh o montowaniu
# katalogow spod /tmp na Windows+Git Bash). Bez Dockera ta czesc jest
# NIEZMIERZONA, nie ZALICZONA - kod wyjscia calego skryptu jest wtedy 3, tak
# jak w test-bramka-sekrety.sh.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TU/../.." && pwd)"

# shellcheck source=deploy/lib/sbom.sh
source "$REPO_ROOT/deploy/lib/sbom.sh"

PLIKI_TESTOWE=()
KATALOGI_TESTOWE=()
trap 'rm -f "${PLIKI_TESTOWE[@]}" 2>/dev/null; rm -rf "${KATALOGI_TESTOWE[@]}" 2>/dev/null' EXIT

NIEZALICZONE=0
NIEZMIERZONE_LICZNIK=0

zaliczone_gdy() {  # $1 = 0/1 (0 = warunek spelniony), $2.. = komunikat porazki
  local warunek="$1"; shift
  if [[ "$warunek" -ne 0 ]]; then
    echo "  WYNIK: NIEZALICZONY - $*"
    NIEZALICZONE=$((NIEZALICZONE + 1))
  else
    echo "  WYNIK: ZALICZONY"
  fi
}

# ==================== CZESC 1: sbom_policz_skladniki / wg_wzorca ==========

echo "=== 1 fixture: 3 skladniki na szczycie, PULAPKA metadata.tools.components z fikcyjnym bom-ref ==="
# Pulapka jest CELOWA: gdyby licznik lapal PIERWSZE wystapienie klucza
# "components" (zamiast tego na szczycie dokumentu), policzylby DWA
# fikcyjne "narzedzia" ponizej zamiast trzech prawdziwych skladnikow - a to
# jest DOKLADNIE regresja, jaka mial zapobiec komentarz w bibliotece.
SBOM_1="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$SBOM_1")
cat > "$SBOM_1" <<'EOF'
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "metadata": {
    "tools": {
      "components": [
        {
          "type": "application",
          "bom-ref": "narzedzie-pulapka-1",
          "name": "fikcyjne-narzedzie-1"
        },
        {
          "type": "application",
          "bom-ref": "narzedzie-pulapka-2",
          "name": "fikcyjne-narzedzie-2"
        }
      ]
    }
  },
  "components": [
    {
      "type": "library",
      "bom-ref": "pkg:composer/vendor/paczka-a@1.0.0",
      "name": "paczka-a",
      "purl": "pkg:composer/vendor/paczka-a@1.0.0"
    },
    {
      "type": "library",
      "bom-ref": "pkg:npm/paczka-b@2.0.0",
      "name": "paczka-b",
      "purl": "pkg:npm/paczka-b@2.0.0"
    },
    {
      "type": "library",
      "bom-ref": "pkg:npm/paczka-c@3.0.0",
      "name": "paczka-c",
      "purl": "pkg:npm/paczka-c@3.0.0"
    }
  ],
  "dependencies": []
}
EOF
WYNIK_1="$(sbom_policz_skladniki "$SBOM_1")"; RC_1=$?
COMPOSER_1="$(sbom_policz_wg_wzorca "$SBOM_1" "pkg:composer")"
NPM_1="$(sbom_policz_wg_wzorca "$SBOM_1" "pkg:npm")"
echo "  skladnikow: $WYNIK_1 (rc=$RC_1); composer=$COMPOSER_1 npm=$NPM_1"
zaliczone_gdy "$([[ "$RC_1" -eq 0 && "$WYNIK_1" == "3" ]] && echo 0 || echo 1)" \
  "oczekiwano 3 skladnikow (nie 2 z pulapki metadata.tools), dostalem '$WYNIK_1' rc=$RC_1"
[[ "$COMPOSER_1" == "1" && "$NPM_1" == "2" ]] || {
  echo "  WYNIK: NIEZALICZONY - rozbicie PHP/JS niezgodne (composer=$COMPOSER_1 oczekiwano 1, npm=$NPM_1 oczekiwano 2)"
  NIEZALICZONE=$((NIEZALICZONE + 1))
}

echo "=== 2 fixture: pusta tablica components - ZERO jako WYNIK pomiaru (rc=0, nie NIEZMIERZONE) ==="
SBOM_2="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$SBOM_2")
cat > "$SBOM_2" <<'EOF'
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "components": [],
  "dependencies": []
}
EOF
WYNIK_2="$(sbom_policz_skladniki "$SBOM_2")"; RC_2=$?
echo "  skladnikow: $WYNIK_2 (rc=$RC_2)"
zaliczone_gdy "$([[ "$RC_2" -eq 0 && "$WYNIK_2" == "0" ]] && echo 0 || echo 1)" \
  "pusta tablica ma dac ZMIERZONE zero (rc=0), dostalem '$WYNIK_2' rc=$RC_2"

echo "=== 3 fixture: podskladniki (nested components) sa liczone ==="
SBOM_3="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$SBOM_3")
cat > "$SBOM_3" <<'EOF'
{
  "components": [
    {
      "bom-ref": "korzen-a",
      "name": "korzen-a",
      "components": [
        { "bom-ref": "dziecko-a1", "name": "dziecko-a1" },
        { "bom-ref": "dziecko-a2", "name": "dziecko-a2" }
      ]
    }
  ]
}
EOF
WYNIK_3="$(sbom_policz_skladniki "$SBOM_3")"; RC_3=$?
echo "  skladnikow: $WYNIK_3 (rc=$RC_3), oczekiwano 3 (1 korzen + 2 podskladniki)"
zaliczone_gdy "$([[ "$RC_3" -eq 0 && "$WYNIK_3" == "3" ]] && echo 0 || echo 1)" \
  "oczekiwano 3 (korzen + 2 podskladniki), dostalem '$WYNIK_3' rc=$RC_3"

echo "=== 4 plik nieistniejacy - NIEZMIERZONE, nie zero ==="
WYNIK_4="$(sbom_policz_skladniki "$TU/nie-ma-takiego-pliku-$$.json")"; RC_4=$?
echo "  skladnikow: $WYNIK_4 (rc=$RC_4)"
zaliczone_gdy "$([[ "$RC_4" -eq 1 && "$WYNIK_4" == "NIEZMIERZONE" ]] && echo 0 || echo 1)" \
  "brak pliku ma dac NIEZMIERZONE rc=1, dostalem '$WYNIK_4' rc=$RC_4"

echo "=== 5 plik bez klucza components wcale - NIEZMIERZONE ==="
SBOM_5="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$SBOM_5")
echo '{"bomFormat": "CycloneDX", "specVersion": "1.6"}' > "$SBOM_5"
WYNIK_5="$(sbom_policz_skladniki "$SBOM_5")"; RC_5=$?
echo "  skladnikow: $WYNIK_5 (rc=$RC_5)"
zaliczone_gdy "$([[ "$RC_5" -eq 1 && "$WYNIK_5" == "NIEZMIERZONE" ]] && echo 0 || echo 1)" \
  "brak klucza components ma dac NIEZMIERZONE rc=1, dostalem '$WYNIK_5' rc=$RC_5"

# ==================== CZESC 2: sbom_policz_podatnosci =====================

echo "=== 6 fixture grype: 'No vulnerabilities found' - zero ==="
LOG_G1="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_G1")
printf 'No vulnerabilities found\n' > "$LOG_G1"
WYNIK_G1="$(sbom_policz_podatnosci "$LOG_G1")"; RC_G1=$?
echo "  podatnosci: $WYNIK_G1 (rc=$RC_G1)"
zaliczone_gdy "$([[ "$RC_G1" -eq 0 && "$WYNIK_G1" == "0" ]] && echo 0 || echo 1)" \
  "'No vulnerabilities found' ma dac zero rc=0, dostalem '$WYNIK_G1' rc=$RC_G1"

echo "=== 7 fixture grype: tabela z 3 wierszami - trzy podatnosci ==="
LOG_G2="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_G2")
cat > "$LOG_G2" <<'EOF'
NAME    INSTALLED  FIXED IN  TYPE  VULNERABILITY        SEVERITY  EPSS  RISK
lodash  4.17.4     4.17.21   npm   GHSA-35jh-r3h4-6jhm  High      1.0   1.0
lodash  4.17.4     4.17.12   npm   GHSA-jf85-cpcp-j695  Critical  1.0   1.0
lodash  4.17.4     4.17.19   npm   GHSA-p6mc-m468-83gw  High      1.0   1.0
EOF
WYNIK_G2="$(sbom_policz_podatnosci "$LOG_G2")"; RC_G2=$?
echo "  podatnosci: $WYNIK_G2 (rc=$RC_G2)"
zaliczone_gdy "$([[ "$RC_G2" -eq 0 && "$WYNIK_G2" == "3" ]] && echo 0 || echo 1)" \
  "tabela z 3 wierszami ma dac 3 rc=0, dostalem '$WYNIK_G2' rc=$RC_G2"

echo "=== 8 fixture grype: plik pusty - NIEZMIERZONE ==="
LOG_G3="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_G3")
: > "$LOG_G3"
WYNIK_G3="$(sbom_policz_podatnosci "$LOG_G3")"; RC_G3=$?
echo "  podatnosci: $WYNIK_G3 (rc=$RC_G3)"
zaliczone_gdy "$([[ "$RC_G3" -eq 1 && "$WYNIK_G3" == "NIEZMIERZONE" ]] && echo 0 || echo 1)" \
  "log pusty ma dac NIEZMIERZONE rc=1, dostalem '$WYNIK_G3' rc=$RC_G3"

echo "=== 9 fixture grype: tresc nierozpoznana (np. blad dockera) - NIEZMIERZONE ==="
LOG_G4="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_G4")
printf 'Error response from daemon: conflict\n' > "$LOG_G4"
WYNIK_G4="$(sbom_policz_podatnosci "$LOG_G4")"; RC_G4=$?
echo "  podatnosci: $WYNIK_G4 (rc=$RC_G4)"
zaliczone_gdy "$([[ "$RC_G4" -eq 1 && "$WYNIK_G4" == "NIEZMIERZONE" ]] && echo 0 || echo 1)" \
  "tresc nierozpoznana ma dac NIEZMIERZONE rc=1, dostalem '$WYNIK_G4' rc=$RC_G4"

# ==================== CZESC 3: brak narzedzia (BEZ Dockera) ===============
# Symulacja PRZEZ PATH, nie przez Docker: PATH bez katalogu z dockerem -
# `command -v docker` w bibliotece ma tego NIE znalezc, TAK SAMO jak na
# maszynie, ktora Dockera w ogole nie ma. Ten przypadek MA sie mierzyc
# ZAWSZE, niezaleznie od tego, czy TA maszyna Dockera ma.
echo "=== 10 brak docker w PATH: generator melduje NIEZMIERZONE (kod 127), nie 0 skladnikow ==="
KAT_BEZ_DOCKER="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KAT_BEZ_DOCKER")
PATH_BEZ_DOCKER="$(printf '%s\n' "$PATH" | tr ':' '\n' | grep -avi '/docker' | tr '\n' ':')"
LOG_BRAK_GEN="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_BRAK_GEN")
PLIK_WYJ_BRAK="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$PLIK_WYJ_BRAK")
rm -f "$PLIK_WYJ_BRAK"
PATH="$PATH_BEZ_DOCKER" sbom_uruchom_generator "$TU" "$PLIK_WYJ_BRAK" "$LOG_BRAK_GEN"
KOD_BRAK_GEN=$?
echo "  sbom_uruchom_generator (bez docker w PATH): rc=$KOD_BRAK_GEN, log: $(cat "$LOG_BRAK_GEN")"
zaliczone_gdy "$([[ "$KOD_BRAK_GEN" -eq 127 ]] && grep -q "NIEZMIERZONE" "$LOG_BRAK_GEN" && echo 0 || echo 1)" \
  "oczekiwano rc=127 i komunikatu NIEZMIERZONE, dostalem rc=$KOD_BRAK_GEN"
[[ ! -e "$PLIK_WYJ_BRAK" || ! -s "$PLIK_WYJ_BRAK" ]] || {
  echo "  WYNIK: NIEZALICZONY - brak docker nie moze zostawic niepustego pliku wynikowego"
  NIEZALICZONE=$((NIEZALICZONE + 1))
}

echo "=== 11 brak docker w PATH: skaner melduje NIEZMIERZONE (kod 127) ==="
LOG_BRAK_SKAN="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_BRAK_SKAN")
echo '{"components": [{"bom-ref": "x"}]}' > "$SBOM_2"
PATH="$PATH_BEZ_DOCKER" sbom_uruchom_skaner "$SBOM_2" "$LOG_BRAK_SKAN"
KOD_BRAK_SKAN=$?
echo "  sbom_uruchom_skaner (bez docker w PATH): rc=$KOD_BRAK_SKAN, log: $(cat "$LOG_BRAK_SKAN")"
zaliczone_gdy "$([[ "$KOD_BRAK_SKAN" -eq 127 ]] && grep -q "NIEZMIERZONE" "$LOG_BRAK_SKAN" && echo 0 || echo 1)" \
  "oczekiwano rc=127 i komunikatu NIEZMIERZONE, dostalem rc=$KOD_BRAK_SKAN"

echo "=== 12 skaner na pliku wejsciowym pustym/nieistniejacym - NIEZMIERZONE (kod 2), bez probowania Dockera ==="
LOG_BRAK_PLIK="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_BRAK_PLIK")
sbom_uruchom_skaner "$TU/nie-ma-takiego-sbom-$$.json" "$LOG_BRAK_PLIK"
KOD_BRAK_PLIK=$?
echo "  sbom_uruchom_skaner (plik wejsciowy nieistniejacy): rc=$KOD_BRAK_PLIK"
zaliczone_gdy "$([[ "$KOD_BRAK_PLIK" -eq 2 ]] && grep -q "NIEZMIERZONE" "$LOG_BRAK_PLIK" && echo 0 || echo 1)" \
  "oczekiwano rc=2 i komunikatu NIEZMIERZONE, dostalem rc=$KOD_BRAK_PLIK"

# ==================== CZESC 4: end-to-end (docker: trivy + grype) =========
# Fixture ZLOZONA OBOK TEGO PLIKU (mktemp -d -p "$TU"), NIE w /tmp - patrz
# komentarz w deploy/lib/sbom.sh o montowaniu katalogow spod /tmp na
# Windows+Git Bash (montaz wychodzil PUSTY, bez zadnego bledu).
if ! command -v docker >/dev/null 2>&1; then
  echo "=== 13 end-to-end (docker trivy) ==="
  echo "  WYNIK: NIE ZMIERZONO - brak docker w PATH"
  echo "=== 14 end-to-end (docker grype) ==="
  echo "  WYNIK: NIE ZMIERZONO - brak docker w PATH"
  echo "=== 15 kontrola: generowanie NIE zmienia KATALOGU_ZRODLA ==="
  echo "  WYNIK: NIE ZMIERZONO - brak docker w PATH"
  NIEZMIERZONE_LICZNIK=$((NIEZMIERZONE_LICZNIK + 3))
else
  FIX="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$FIX")
  mkdir -p "$FIX/backend" "$FIX/frontend"
  cat > "$FIX/backend/composer.json" <<'EOF'
{"name": "fixture/backend", "require": {"symfony/polyfill-mbstring": "^1.27"}}
EOF
  cat > "$FIX/backend/composer.lock" <<'EOF'
{
  "_readme": ["fixture minimalna testu SBOM - nigdy niescalana"],
  "content-hash": "abc123",
  "packages": [
    {
      "name": "symfony/polyfill-mbstring",
      "version": "v1.27.0",
      "source": {"type": "git", "url": "https://github.com/symfony/polyfill-mbstring.git", "reference": "abc"},
      "type": "library"
    }
  ],
  "packages-dev": [],
  "platform": [],
  "platform-dev": []
}
EOF
  cat > "$FIX/frontend/package.json" <<'EOF'
{"name": "fixture-frontend", "version": "1.0.0", "dependencies": {"lodash": "4.17.4"}}
EOF
  # lodash 4.17.4 jest NAPRAWDE stara (2017) i ma udokumentowane podatnosci
  # w bazie GHSA - wybrana SWIADOMIE, zeby przypadek 14 mial co znalezc bez
  # zadnego spreparowanego/fikcyjnego wpisu.
  cat > "$FIX/frontend/package-lock.json" <<'EOF'
{
  "name": "fixture-frontend",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": { "name": "fixture-frontend", "version": "1.0.0", "dependencies": { "lodash": "4.17.4" } },
    "node_modules/lodash": {
      "version": "4.17.4",
      "resolved": "https://registry.npmjs.org/lodash/-/lodash-4.17.4.tgz",
      "integrity": "sha512-fake=="
    }
  }
}
EOF

  # --- 15 kontrola, PRZED generowaniem: migawka KATALOGU_ZRODLA ---------
  PRZED_15="$(cd "$FIX" && find . -type f -printf '%p %s\n' | sort)"

  SBOM_WYJ="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$SBOM_WYJ")
  LOG_GEN="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_GEN")
  sbom_uruchom_generator "$FIX" "$SBOM_WYJ" "$LOG_GEN"
  KOD_GEN=$?

  echo "=== 13 end-to-end (docker trivy): fixture composer+npm -> JEDEN plik CycloneDX ==="
  echo "  sbom_uruchom_generator: rc=$KOD_GEN"
  SKLADNIKOW_E2E="$(sbom_policz_skladniki "$SBOM_WYJ")"; RC_SKLAD_E2E=$?
  COMPOSER_E2E="$(sbom_policz_wg_wzorca "$SBOM_WYJ" "pkg:composer")"
  NPM_E2E="$(sbom_policz_wg_wzorca "$SBOM_WYJ" "pkg:npm")"
  echo "  skladnikow: $SKLADNIKOW_E2E (rc=$RC_SKLAD_E2E); composer=$COMPOSER_E2E npm=$NPM_E2E"
  NIEZAL_13=0
  [[ "$KOD_GEN" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - generator zakonczyl sie EXIT=$KOD_GEN, log: $(tail -5 "$LOG_GEN")"; NIEZAL_13=1; }
  [[ "$RC_SKLAD_E2E" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - liczenie skladnikow NIEZMIERZONE na prawdziwym wyjsciu generatora"; NIEZAL_13=1; }
  [[ "$COMPOSER_E2E" -ge 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano co najmniej 1 skladnika composer, jest $COMPOSER_E2E"; NIEZAL_13=1; }
  [[ "$NPM_E2E" -ge 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano co najmniej 1 skladnika npm, jest $NPM_E2E"; NIEZAL_13=1; }
  if [[ "$NIEZAL_13" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

  # --- 15 kontrola, DOKONCZENIE: KATALOG_ZRODLA ma byc BAJT W BAJT taki sam
  echo "=== 15 kontrola: generowanie NIE zmienia KATALOGU_ZRODLA (fixture) ani nie zostawia w nim pliku ==="
  PO_15="$(cd "$FIX" && find . -type f -printf '%p %s\n' | sort)"
  RUZNICA_15="$(diff <(printf '%s\n' "$PRZED_15") <(printf '%s\n' "$PO_15") || true)"
  echo "  plikow w fixture PRZED: $(printf '%s\n' "$PRZED_15" | grep -c .), PO: $(printf '%s\n' "$PO_15" | grep -c .)"
  zaliczone_gdy "$([[ -z "$RUZNICA_15" ]] && echo 0 || echo 1)" \
    "KATALOG_ZRODLA zmienil sie po generowaniu: $RUZNICA_15"

  echo "=== 14 end-to-end (docker grype): fixture z lodash 4.17.4 -> co najmniej 1 realna podatnosc ==="
  if [[ "$KOD_GEN" -ne 0 ]]; then
    echo "  WYNIK: NIE ZMIERZONO - generator (przypadek 13) nie zostawil pliku do przeskanowania"
    NIEZMIERZONE_LICZNIK=$((NIEZMIERZONE_LICZNIK + 1))
  else
    LOG_SKAN="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_SKAN")
    sbom_uruchom_skaner "$SBOM_WYJ" "$LOG_SKAN"
    KOD_SKAN=$?
    PODATNOSCI_E2E="$(sbom_policz_podatnosci "$LOG_SKAN")"; RC_PODAT_E2E=$?
    echo "  sbom_uruchom_skaner: rc=$KOD_SKAN; podatnosci: $PODATNOSCI_E2E (rc=$RC_PODAT_E2E)"
    NIEZAL_14=0
    [[ "$KOD_SKAN" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - skaner zakonczyl sie EXIT=$KOD_SKAN, log: $(tail -5 "$LOG_SKAN")"; NIEZAL_14=1; }
    [[ "$RC_PODAT_E2E" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - liczenie podatnosci NIEZMIERZONE na prawdziwym wyjsciu skanera"; NIEZAL_14=1; }
    if [[ "$RC_PODAT_E2E" -eq 0 ]]; then
      [[ "$PODATNOSCI_E2E" -ge 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano co najmniej 1 podatnosci (lodash 4.17.4 ma znane GHSA), jest $PODATNOSCI_E2E"; NIEZAL_14=1; }
    fi
    if [[ "$NIEZAL_14" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi
  fi
fi

echo
if [[ "$NIEZALICZONE" -gt 0 ]]; then
  echo "PROBY LOGIKI SBOM: NIEZALICZONE PRZYPADKI: $NIEZALICZONE"
  exit 1
elif [[ "$NIEZMIERZONE_LICZNIK" -gt 0 ]]; then
  # Brak Dockera NIE MA wygladac jak zielony bieg - kod wyjscia jest tu
  # CELOWO inny niz 0 i inny niz 1, zeby wolajacy odroznil "sprawdzilem i
  # jest OK" od "nie sprawdzilem wcale" (ten sam kontrakt co
  # test-bramka-sekrety.sh).
  echo "PROBY LOGIKI SBOM: NIE ZMIERZONO $NIEZMIERZONE_LICZNIK przypadek(ow) (brak Docker) - bieg NIE jest zielony"
  exit 3
else
  echo "PROBY LOGIKI SBOM: WSZYSTKIE ZALICZONE"
  exit 0
fi
