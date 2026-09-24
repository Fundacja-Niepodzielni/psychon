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
# tez nie dotyka Dockera - PATH jest ustawiony na JEDEN NAPRAWDE PUSTY
# katalog (nie filtrowany po napisie z istniejacego PATH - patrz przypadek
# 9a), tak samo jak na maszynie, ktora Dockera w ogole nie ma. CZESC 3b tez
# nie dotyka prawdziwego Dockera, ale - w odroznieniu od 1-3 - obserwuje
# funkcje WYWOLUJACE docker (`sbom_uruchom_generator`), podmieniajac PATH na
# katalog z WLASNYM plikiem wykonywalnym "docker" (atrapa bez sieci i bez
# kontenera), zeby zdeterministycznie wymusic wyniki, ktorych prawdziwy
# trivy nie da bez przygotowanej fixtury (plik pusty po cp; plik poprawny,
# ale z zerem skladnikow). CZESC 4 jest END-TO-END: prawdziwy trivy+grype w
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
# Symulacja PRZEZ PATH, nie przez Docker: PATH ustawiony na JEDEN, NAPRAWDE
# PUSTY katalog (mktemp -d, nic w srodku) - NIE filtr po napisie "/docker" w
# istniejacym PATH. Powod zmierzony 23.09: na hoscie bramkowym
# docker stoi w katalogu, ktorego NAZWA nie zawiera "/docker" (shim w
# katalogu-narzedziu z inna nazwa) - filtr po napisie zostawial ten katalog
# w PATH, wiec `command -v docker` PO "filtrze" nadal zwracal sciezke, i
# `sbom_uruchom_generator`/`sbom_uruchom_skaner` naprawde probowaly
# uruchomic docker (log przypadku 11 na hoscie: "unable to decode sbom" -
# dowod, ze grype NAPRAWDE wystartowal). Pusty katalog nie ma tej wady:
# `command -v docker` w nim NIE MOZE znalezc niczego, niezaleznie od tego,
# jak nazywa sie prawdziwy katalog z dockerem na danej maszynie.
KAT_BEZ_DOCKER="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KAT_BEZ_DOCKER")
PATH_BEZ_DOCKER="$KAT_BEZ_DOCKER"

echo "=== 9a kontrola: PATH ustawiony na pusty katalog -> 'command -v docker' nic nie zwraca ==="
WYJSCIE_CV_9A="$(PATH="$PATH_BEZ_DOCKER" command -v docker 2>/dev/null)"; RC_CV_9A=$?
echo "  command -v docker (PATH=$PATH_BEZ_DOCKER): wyjscie='$WYJSCIE_CV_9A' rc=$RC_CV_9A"
zaliczone_gdy "$([[ "$RC_CV_9A" -ne 0 && -z "$WYJSCIE_CV_9A" ]] && echo 0 || echo 1)" \
  "PATH pusty ma dac brak docker (rc!=0, wyjscie puste), dostalem rc=$RC_CV_9A wyjscie='$WYJSCIE_CV_9A'"

echo "=== 10 brak docker w PATH: generator melduje NIEZMIERZONE (kod 127), nie 0 skladnikow ==="
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
  "oczekiwano rc=2 i komunikatu NIEZMIERZONE (bez wzgledu na obecnosc dockera na TEJ maszynie - plik wejsciowy jest sprawdzany PRZED narzedziem), dostalem rc=$KOD_BRAK_PLIK"

# ==================== CZESC 3b: docker UDAJEMY skryptem-atrapa ============
# Dwa przypadki nizej NIE dotykaja prawdziwego Dockera (dzialaja WSZEDZIE,
# tak jak Czesc 1-3) - ale, w odroznieniu od Czesci 1-2, obserwuja funkcje
# WYWOLUJACE docker (sbom_uruchom_generator), nie tylko funkcje liczace.
# Podmieniamy PATH na katalog z WLASNYM plikiem wykonywalnym o nazwie
# "docker", ktory udaje `docker run`/`docker cp`/`docker rm` bez
# uruchamiania czegokolwiek naprawde - jedyny sposob, zeby zdeterministycznie
# wymusic akurat TEN wynik trivy (pusty plik po cp / plik z zerem
# skladnikow), ktorego prawdziwy trivy nie da bez przygotowanej fixtury i
# bez zaleznosci od tego, czy TA maszyna w ogole ma Docker.
ATRAPA_DIR="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$ATRAPA_DIR")

echo "=== 13 generator: docker 'sie udaje', ale wyciagniety plik jest PUSTY - NIEZMIERZONE (kod 3), nie 0 skladnikow ==="
# Ta atrapa udaje wylacznie kod wyjscia `docker run`/`docker rm` (0) i
# `docker cp` (0) - CELOWO nie tworzy tresci w pliku docelowym, zeby
# wywolac DOKLADNIE trzeci z niezaleznych warunkow generatora (plik po
# `docker cp` pusty/nieistniejacy).
ATRAPA_PUSTY="$ATRAPA_DIR/docker"
cat > "$ATRAPA_PUSTY" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  run) exit 0 ;;
  cp) : > "$3" 2>/dev/null; exit 0 ;;
  rm) exit 0 ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$ATRAPA_PUSTY"
LOG_ATRAPA_PUSTY="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_ATRAPA_PUSTY")
PLIK_ATRAPA_PUSTY="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$PLIK_ATRAPA_PUSTY")
rm -f "$PLIK_ATRAPA_PUSTY"
PATH="$ATRAPA_DIR:$PATH" sbom_uruchom_generator "$TU" "$PLIK_ATRAPA_PUSTY" "$LOG_ATRAPA_PUSTY"
KOD_ATRAPA_PUSTY=$?
echo "  sbom_uruchom_generator (docker-atrapa, cp bez tresci): rc=$KOD_ATRAPA_PUSTY, log: $(cat "$LOG_ATRAPA_PUSTY")"
zaliczone_gdy "$([[ "$KOD_ATRAPA_PUSTY" -eq 3 ]] && grep -q "NIEZMIERZONE\|pusty" "$LOG_ATRAPA_PUSTY" && echo 0 || echo 1)" \
  "oczekiwano rc=3 (plik wynikowy pusty po docker cp), dostalem rc=$KOD_ATRAPA_PUSTY"

echo "=== 14 generator: docker 'sie udaje', plik POPRAWNY ale z ZERO skladnikow - NIEZMIERZONE (kod 4), nie zmierzone zero ==="
# Ta atrapa zwraca plik CycloneDX POPRAWNY (niepusty, sparsowalny), ale z
# pusta tablica "components" na szczycie - dokladnie ksztalt, jaki
# zostawia prawdziwy trivy po pustym montazu wejsciowym: rc=0, plik
# niepusty, a mimo to "skladnikow: 0; composer=0 npm=0" zmeldowane jako
# pomiar, zamiast jako brak pomiaru.
ATRAPA_ZERO="$ATRAPA_DIR/docker"
cat > "$ATRAPA_ZERO" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  run) exit 0 ;;
  cp)
    cat > "$3" <<'JSON'
{"bomFormat": "CycloneDX", "specVersion": "1.6", "components": [], "dependencies": []}
JSON
    exit 0
    ;;
  rm) exit 0 ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$ATRAPA_ZERO"
LOG_ATRAPA_ZERO="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_ATRAPA_ZERO")
PLIK_ATRAPA_ZERO="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$PLIK_ATRAPA_ZERO")
rm -f "$PLIK_ATRAPA_ZERO"
PATH="$ATRAPA_DIR:$PATH" sbom_uruchom_generator "$TU" "$PLIK_ATRAPA_ZERO" "$LOG_ATRAPA_ZERO"
KOD_ATRAPA_ZERO=$?
echo "  sbom_uruchom_generator (docker-atrapa, plik z zero skladnikow): rc=$KOD_ATRAPA_ZERO, log: $(cat "$LOG_ATRAPA_ZERO")"
zaliczone_gdy "$([[ "$KOD_ATRAPA_ZERO" -eq 4 ]] && grep -q "NIEZMIERZONE\|ZERO" "$LOG_ATRAPA_ZERO" && echo 0 || echo 1)" \
  "oczekiwano rc=4 i komunikatu o zerze skladnikow, dostalem rc=$KOD_ATRAPA_ZERO"
[[ -s "$PLIK_ATRAPA_ZERO" ]] || {
  echo "  WYNIK: NIEZALICZONY - plik wynikowy powinien istniec i byc niepusty (poprawny JSON), tylko z zerem skladnikow"
  NIEZALICZONE=$((NIEZALICZONE + 1))
}

# ==================== CZESC 4: end-to-end (docker: trivy + grype) =========
# Fixture ZLOZONA OBOK TEGO PLIKU (mktemp -d -p "$TU"), NIE w /tmp - patrz
# komentarz w deploy/lib/sbom.sh o montowaniu katalogow spod /tmp na
# Windows+Git Bash (montaz wychodzil PUSTY, bez zadnego bledu).
if ! command -v docker >/dev/null 2>&1; then
  echo "=== 15 end-to-end (docker trivy) ==="
  echo "  WYNIK: NIE ZMIERZONO - brak docker w PATH"
  echo "=== 16 end-to-end (docker grype) ==="
  echo "  WYNIK: NIE ZMIERZONO - brak docker w PATH"
  echo "=== 17 kontrola: generowanie NIE zmienia KATALOGU_ZRODLA ==="
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
  PRZED_17="$(cd "$FIX" && find . -type f -printf '%p %s\n' | sort)"

  SBOM_WYJ="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$SBOM_WYJ")
  LOG_GEN="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_GEN")
  sbom_uruchom_generator "$FIX" "$SBOM_WYJ" "$LOG_GEN"
  KOD_GEN=$?

  echo "=== 15 end-to-end (docker trivy): fixture composer+npm -> JEDEN plik CycloneDX ==="
  echo "  sbom_uruchom_generator: rc=$KOD_GEN"
  SKLADNIKOW_E2E="$(sbom_policz_skladniki "$SBOM_WYJ")"; RC_SKLAD_E2E=$?
  COMPOSER_E2E="$(sbom_policz_wg_wzorca "$SBOM_WYJ" "pkg:composer")"
  NPM_E2E="$(sbom_policz_wg_wzorca "$SBOM_WYJ" "pkg:npm")"
  echo "  skladnikow: $SKLADNIKOW_E2E (rc=$RC_SKLAD_E2E); composer=$COMPOSER_E2E npm=$NPM_E2E"
  NIEZAL_15=0
  [[ "$KOD_GEN" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - generator zakonczyl sie EXIT=$KOD_GEN, log: $(tail -5 "$LOG_GEN")"; NIEZAL_15=1; }
  [[ "$RC_SKLAD_E2E" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - liczenie skladnikow NIEZMIERZONE na prawdziwym wyjsciu generatora"; NIEZAL_15=1; }
  [[ "$COMPOSER_E2E" -ge 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano co najmniej 1 skladnika composer, jest $COMPOSER_E2E"; NIEZAL_15=1; }
  [[ "$NPM_E2E" -ge 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano co najmniej 1 skladnika npm, jest $NPM_E2E"; NIEZAL_15=1; }
  if [[ "$NIEZAL_15" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

  # --- 15 kontrola, DOKONCZENIE: KATALOG_ZRODLA ma byc BAJT W BAJT taki sam
  echo "=== 17 kontrola: generowanie NIE zmienia KATALOGU_ZRODLA (fixture) ani nie zostawia w nim pliku ==="
  PO_17="$(cd "$FIX" && find . -type f -printf '%p %s\n' | sort)"
  RUZNICA_17="$(diff <(printf '%s\n' "$PRZED_17") <(printf '%s\n' "$PO_17") || true)"
  echo "  plikow w fixture PRZED: $(printf '%s\n' "$PRZED_17" | grep -c .), PO: $(printf '%s\n' "$PO_17" | grep -c .)"
  zaliczone_gdy "$([[ -z "$RUZNICA_17" ]] && echo 0 || echo 1)" \
    "KATALOG_ZRODLA zmienil sie po generowaniu: $RUZNICA_17"

  echo "=== 16 end-to-end (docker grype): fixture z lodash 4.17.4 -> co najmniej 1 realna podatnosc ==="
  if [[ "$KOD_GEN" -ne 0 ]]; then
    echo "  WYNIK: NIE ZMIERZONO - generator (przypadek 15) nie zostawil pliku do przeskanowania"
    NIEZMIERZONE_LICZNIK=$((NIEZMIERZONE_LICZNIK + 1))
  else
    LOG_SKAN="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_SKAN")
    sbom_uruchom_skaner "$SBOM_WYJ" "$LOG_SKAN"
    KOD_SKAN=$?
    PODATNOSCI_E2E="$(sbom_policz_podatnosci "$LOG_SKAN")"; RC_PODAT_E2E=$?
    echo "  sbom_uruchom_skaner: rc=$KOD_SKAN; podatnosci: $PODATNOSCI_E2E (rc=$RC_PODAT_E2E)"
    NIEZAL_16=0
    [[ "$KOD_SKAN" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - skaner zakonczyl sie EXIT=$KOD_SKAN, log: $(tail -5 "$LOG_SKAN")"; NIEZAL_16=1; }
    [[ "$RC_PODAT_E2E" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - liczenie podatnosci NIEZMIERZONE na prawdziwym wyjsciu skanera"; NIEZAL_16=1; }
    if [[ "$RC_PODAT_E2E" -eq 0 ]]; then
      [[ "$PODATNOSCI_E2E" -ge 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano co najmniej 1 podatnosci (lodash 4.17.4 ma znane GHSA), jest $PODATNOSCI_E2E"; NIEZAL_16=1; }
    fi
    if [[ "$NIEZAL_16" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi
  fi
fi


# ==================== CZESC 5: sbom_zdecyduj_o_probie (funkcja decyzyjna) =
# Czysta funkcja - wejscia sa JUZ POLICZONE (kod skrotu, skrot biezacy,
# skrot zapisany, obecnosc znacznika), bez gita/dockera/zegara/dysku. Piec
# przypadkow ponizej odpowiadaja piec galezi funkcji dosłownie, kazdy pod
# wlasna nazwa mowiaca o swoim warunku.

echo "=== 18 decyzja: skrotu NIE DA SIE POLICZYC -> BIEGNIE (bezpieczne domyslne), NIGDY ciche pominiecie ==="
LINIA_18="$(sbom_zdecyduj_o_probie 1 "" "" "tak" "plik progowy 'backend/composer.lock' nie istnieje")"
RC_18=$?
echo "  wiersz: $LINIA_18"
echo "  rc: $RC_18"
NIEZAL_18=0
[[ "$RC_18" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (BIEGNIE, bezpieczne domyslne), jest $RC_18"; NIEZAL_18=1; }
[[ "$LINIA_18" == *"BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi BIEGNIE"; NIEZAL_18=1; }
[[ "$LINIA_18" == *"nie dalo sie policzyc"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie tlumaczy, ze skrotu nie dalo sie policzyc"; NIEZAL_18=1; }
[[ "$LINIA_18" == *"backend/composer.lock"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie niesie przekazanego powodu"; NIEZAL_18=1; }
if [[ "$NIEZAL_18" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 19 decyzja: skrot policzony, ale NIE MA jeszcze zapisanego (pierwszy zielony bieg w ogole) -> BIEGNIE ==="
LINIA_19="$(sbom_zdecyduj_o_probie 0 "aaa111" "" "tak")"
RC_19=$?
echo "  wiersz: $LINIA_19"
echo "  rc: $RC_19"
NIEZAL_19=0
[[ "$RC_19" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (BIEGNIE), jest $RC_19"; NIEZAL_19=1; }
[[ "$LINIA_19" == *"BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi BIEGNIE"; NIEZAL_19=1; }
[[ "$LINIA_19" == *"brak zapisanego skrotu"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie nazywa braku zapisanego skrotu jako powodu"; NIEZAL_19=1; }
if [[ "$NIEZAL_19" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 20 decyzja: skrot BIEZACY rozny od ZAPISANEGO (tresc przyrzadu sie zmienila) -> BIEGNIE, NIEZALEZNIE od znacznika ==="
LINIA_20="$(sbom_zdecyduj_o_probie 0 "aaa111" "bbb222" "tak")"
RC_20=$?
echo "  wiersz: $LINIA_20"
echo "  rc: $RC_20"
NIEZAL_20=0
[[ "$RC_20" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (BIEGNIE), jest $RC_20"; NIEZAL_20=1; }
[[ "$LINIA_20" == *"BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi BIEGNIE"; NIEZAL_20=1; }
[[ "$LINIA_20" == *"zmienila sie"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie nazywa zmiany tresci jako powodu"; NIEZAL_20=1; }
if [[ "$NIEZAL_20" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 21 decyzja: skrot ZGODNY, znacznik DZISIEJSZY JEST -> NIE BIEGNIE ==="
LINIA_21="$(sbom_zdecyduj_o_probie 0 "aaa111" "aaa111" "tak")"
RC_21=$?
echo "  wiersz: $LINIA_21"
echo "  rc: $RC_21"
NIEZAL_21=0
[[ "$RC_21" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=1 (NIE BIEGNIE), jest $RC_21"; NIEZAL_21=1; }
[[ "$LINIA_21" == *"NIE BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi NIE BIEGNIE"; NIEZAL_21=1; }
[[ "$LINIA_21" == *"znacznik"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie nazywa znacznika jako powodu"; NIEZAL_21=1; }
if [[ "$NIEZAL_21" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 22 decyzja: skrot ZGODNY, znacznika doby NIE MA -> BIEGNIE (pierwszy bieg dnia, mimo zgodnej tresci) ==="
LINIA_22="$(sbom_zdecyduj_o_probie 0 "aaa111" "aaa111" "nie")"
RC_22=$?
echo "  wiersz: $LINIA_22"
echo "  rc: $RC_22"
NIEZAL_22=0
[[ "$RC_22" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (BIEGNIE), jest $RC_22"; NIEZAL_22=1; }
[[ "$LINIA_22" == *"BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi BIEGNIE"; NIEZAL_22=1; }
[[ "$LINIA_22" == *"pierwszy bieg"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie nazywa 'pierwszy bieg dzisiejszej doby' jako powodu"; NIEZAL_22=1; }
if [[ "$NIEZAL_22" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

# ==================== CZESC 6: sbom_kod_kroku (kontrybucja do EXIT bramki) =
# N4/N5/N6 - bez uruchamiania prawdziwej bramki/hosta (zakazane w tym
# zadaniu): funkcja jest CZYSTA, wiec jej semantyke da sie zmierzyc lokalnie.

echo "=== 23 (N4) kod kroku: proba BIEGLA i jest CZERWONA (KOD_TEST_SBOM=1) -> kontrybucja=1 (!=0) ==="
KOD_23="$(sbom_kod_kroku 1 "tak")"
echo "  sbom_kod_kroku 1 tak -> $KOD_23"
zaliczone_gdy "$([[ "$KOD_23" -eq 1 ]] && echo 0 || echo 1)" \
  "oczekiwano 1 (czerwien proby MA wejsc do kodu wyjscia, gdy proba biegla), jest $KOD_23"

echo "=== 24 (N5) kod kroku: proba NIE BIEGLA, nawet gdyby KOD_TEST_SBOM niosl '1' -> kontrybucja=0 ==="
KOD_24="$(sbom_kod_kroku 1 "nie")"
echo "  sbom_kod_kroku 1 nie -> $KOD_24"
zaliczone_gdy "$([[ "$KOD_24" -eq 0 ]] && echo 0 || echo 1)" \
  "oczekiwano 0 (pominiecie nie ma jak wplynac na kod wyjscia), jest $KOD_24"

echo "=== 25 kod kroku: proba BIEGLA i jest ZIELONA (KOD_TEST_SBOM=0) -> kontrybucja=0 ==="
KOD_25="$(sbom_kod_kroku 0 "tak")"
echo "  sbom_kod_kroku 0 tak -> $KOD_25"
zaliczone_gdy "$([[ "$KOD_25" -eq 0 ]] && echo 0 || echo 1)" \
  "oczekiwano 0, jest $KOD_25"

echo "=== 26 kod kroku: proba BIEGLA, ale NIE ZMIERZYLA konca (KOD_TEST_SBOM=3, brak dockera) -> kontrybucja=0 ==="
KOD_26="$(sbom_kod_kroku 3 "tak")"
echo "  sbom_kod_kroku 3 tak -> $KOD_26"
zaliczone_gdy "$([[ "$KOD_26" -eq 0 ]] && echo 0 || echo 1)" \
  "oczekiwano 0 (kod 3 nie jest czerwienia testu logiki), jest $KOD_26"

echo "=== 27 (N6) kod kroku: NIE przyjmuje liczby podatnosci jako wejscia w ogole (podpis funkcji: 2 argumenty) ==="
LICZBA_ARGUMENTOW="$(declare -f sbom_kod_kroku | grep -c '\$3')"
echo "  wystapien \$3 w ciele sbom_kod_kroku: $LICZBA_ARGUMENTOW"
zaliczone_gdy "$([[ "$LICZBA_ARGUMENTOW" -eq 0 ]] && echo 0 || echo 1)" \
  "sbom_kod_kroku odwoluje sie do trzeciego argumentu - liczba podatnosci NIE MA prawa tam wplywac na kod wyjscia"

# ==================== CZESC 7: znacznik doby (N8) ==========================

echo "=== 28 znacznik: sciezka niesie DATE w nazwie pliku, NIE w drzewie repo (katalog podany przez wolajacego) ==="
KATALOG_ZNAK="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_ZNAK")
SCIEZKA_ZNAK="$(sbom_znacznik_sciezka "$KATALOG_ZNAK" "2026-09-24")"
echo "  sciezka: $SCIEZKA_ZNAK"
zaliczone_gdy "$([[ "$SCIEZKA_ZNAK" == "$KATALOG_ZNAK"/*2026-09-24* ]] && echo 0 || echo 1)" \
  "sciezka znacznika nie niesie podanej daty w podanym katalogu"

echo "=== 29 znacznik: PRZED zapisem nie istnieje, PO zapisie istnieje, INNA data dalej nie istnieje ==="
NIEZAL_29=0
sbom_znacznik_dzis_istnieje "$KATALOG_ZNAK" "2026-09-24" && { echo "  WYNIK: NIEZALICZONY - znacznik istnieje PRZED zapisem"; NIEZAL_29=1; }
sbom_zapisz_znacznik "$KATALOG_ZNAK" "2026-09-24"
sbom_znacznik_dzis_istnieje "$KATALOG_ZNAK" "2026-09-24" || { echo "  WYNIK: NIEZALICZONY - znacznik NIE istnieje PO zapisie"; NIEZAL_29=1; }
sbom_znacznik_dzis_istnieje "$KATALOG_ZNAK" "2026-09-25" && { echo "  WYNIK: NIEZALICZONY - znacznik z INNEJ daty (2026-09-25) niesluznie istnieje"; NIEZAL_29=1; }
if [[ "$NIEZAL_29" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

# zbuduj_fixture_progowa KATALOG [PRZYROSTEK_TRESCI]
#
# Zaklada w KATALOGU repo gita z plikami na WSZYSTKICH pieciu sciezkach z
# SBOM_PLIKI_PROGOWE (tresc kazdego niesie PRZYROSTEK, domyslnie "v1", zeby
# dwa wywolania z roznym przyrostkiem dawaly repo o INNEJ tresci progowej,
# ale tej samej strukturze) i commituje je jednym commitem "poczatek".
# Uzywana przez CZESC 7-9 i 13 nizej - kazdej z nich potrzebne jest repo, w
# ktorym skrot NAPRAWDE da sie policzyc (prawdziwe pliki na dysku, nie
# atrapy) - dokladnie to, co czyta sbom_skrot_plikow_progowych.
zbuduj_fixture_progowa() {
  local katalog="$1" przyrostek="${2:-v1}"
  mkdir -p "$katalog/deploy/lib" "$katalog/deploy/tests" "$katalog/backend" "$katalog/frontend"
  printf 'bramka %s\n' "$przyrostek" > "$katalog/deploy/bramka-hosta.sh"
  printf 'sbom %s\n' "$przyrostek" > "$katalog/deploy/lib/sbom.sh"
  printf 'test sbom %s\n' "$przyrostek" > "$katalog/deploy/tests/test-bramka-sbom.sh"
  printf '{"composer":"%s"}\n' "$przyrostek" > "$katalog/backend/composer.lock"
  printf '{"npm":"%s"}\n' "$przyrostek" > "$katalog/frontend/package-lock.json"
  ( cd "$katalog" && git init -q && git config user.email "test@example.invalid" && git config user.name "Test" && git add -A && git commit -q -m "poczatek" )
}

echo "=== 30 dwa biegi tej samej doby przez PELNY sbom_probka_ma_biec (skrot+znacznik): drugi NIE biegnie, jutro biegnie ==="
# Repo, ktorego drugi commit NIE dotyka zadnego progowego pliku, zeby o
# wyniku decydowal WYLACZNIE znacznik (skrot zostaje zgodny przez caly czas).
REPO_N8="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$REPO_N8")
zbuduj_fixture_progowa "$REPO_N8" "v1"
echo "poza progiem" > "$REPO_N8/plik-poza-progiem.txt"
( cd "$REPO_N8" && git add -A && git commit -q -m "drugi, nie dotyka progu" )
SHA_N8="$(cd "$REPO_N8" && git rev-parse HEAD)"
KATALOG_ZNAK_N8="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_ZNAK_N8")

LINIA_30A="$(sbom_probka_ma_biec "$REPO_N8" "$SHA_N8" "$KATALOG_ZNAK_N8" "2026-09-24")"
RC_30A=$?
echo "  pierwszy bieg doby 2026-09-24 (brak zapisanego skrotu): $LINIA_30A (rc=$RC_30A)"
# Znacznik I skrot ida RAZEM, dokladnie tak jak bramka-hosta.sh robi to po
# zielonym biegu (patrz komentarz nad sbom_zapisz_skrot).
sbom_zapisz_znacznik "$KATALOG_ZNAK_N8" "2026-09-24"
SKROT_N8="$(sbom_skrot_plikow_progowych "$REPO_N8")"
sbom_zapisz_skrot "$KATALOG_ZNAK_N8" "$SKROT_N8"

LINIA_30B="$(sbom_probka_ma_biec "$REPO_N8" "$SHA_N8" "$KATALOG_ZNAK_N8" "2026-09-24")"
RC_30B=$?
echo "  drugi bieg TEJ SAMEJ doby 2026-09-24 (skrot zgodny, znacznik jest): $LINIA_30B (rc=$RC_30B)"

LINIA_30C="$(sbom_probka_ma_biec "$REPO_N8" "$SHA_N8" "$KATALOG_ZNAK_N8" "2026-09-25")"
RC_30C=$?
echo "  pierwszy bieg NASTEPNEGO dnia 2026-09-25 (skrot dalej zgodny, znacznika tej doby NIE MA): $LINIA_30C (rc=$RC_30C)"

NIEZAL_30=0
[[ "$RC_30A" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - pierwszy bieg doby powinien BIEC (rc=0), jest rc=$RC_30A"; NIEZAL_30=1; }
[[ "$RC_30B" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - drugi bieg TEJ SAMEJ doby powinien NIE BIEC (rc=1), jest rc=$RC_30B"; NIEZAL_30=1; }
[[ "$RC_30C" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - pierwszy bieg NASTEPNEGO dnia powinien BIEC (rc=0, noga dziennego znacznika), jest rc=$RC_30C"; NIEZAL_30=1; }
if [[ "$NIEZAL_30" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

# ==================== CZESC 8: sbom_skrot_plikow_progowych (skrot TRESCI) =
# W odroznieniu od starego mechanizmu (diff jednego commita wzgledem jego
# pierwszego rodzica) skrot czyta TRESC plikow progowych WPROST z dysku -
# nie potrzebuje gita w ogole do samego liczenia.

echo "=== 31 skrot na fixturze z pieciu prawdziwych plikow progowych -> rc=0, 64 znaki hex ==="
REPO_SKROT="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$REPO_SKROT")
zbuduj_fixture_progowa "$REPO_SKROT" "v1"
WYJSCIE_31="$(sbom_skrot_plikow_progowych "$REPO_SKROT")"
RC_31=$?
echo "  rc: $RC_31, skrot: '$WYJSCIE_31' (dlugosc ${#WYJSCIE_31})"
NIEZAL_31=0
[[ "$RC_31" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0, jest $RC_31"; NIEZAL_31=1; }
[[ "$WYJSCIE_31" =~ ^[0-9a-f]{64}$ ]] || { echo "  WYNIK: NIEZALICZONY - '$WYJSCIE_31' nie wyglada na skrot sha256 (64 znaki hex)"; NIEZAL_31=1; }
if [[ "$NIEZAL_31" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 32 dolozenie SZOSTEJ pozycji do SBOM_PLIKI_PROGOWE zmienia skrot SAMO Z SIEBIE (tresc pierwszych 5 plikow bez zmian) ==="
WYJSCIE_32A="$(sbom_skrot_plikow_progowych "$REPO_SKROT")"
printf 'szosta pozycja, prawdziwy plik na dysku\n' > "$REPO_SKROT/szosty-plik-progowy-fixture.txt"
# Podmiana TABLICY tylko w PODSHELLU (nawiasy nizej) - reszta testu dalej
# widzi oryginalne pieciopozycyjne SBOM_PLIKI_PROGOWE zrodlowane z
# prawdziwego deploy/lib/sbom.sh, nie duplikujemy listy progowej recznie.
WYJSCIE_32B="$( SBOM_PLIKI_PROGOWE+=("szosty-plik-progowy-fixture.txt"); sbom_skrot_plikow_progowych "$REPO_SKROT" )"
rm -f "$REPO_SKROT/szosty-plik-progowy-fixture.txt"
echo "  skrot z 5 pozycjami: $WYJSCIE_32A"
echo "  skrot z 6 pozycjami (dolozona szosta, tresc 1-5 bez zmian): $WYJSCIE_32B"
NIEZAL_32=0
[[ -n "$WYJSCIE_32A" && -n "$WYJSCIE_32B" ]] || { echo "  WYNIK: NIEZALICZONY - ktorys ze skrotow jest pusty - uprzaz sama zepsuta"; NIEZAL_32=1; }
[[ "$WYJSCIE_32A" != "$WYJSCIE_32B" ]] || { echo "  WYNIK: NIEZALICZONY - dolozenie szostej pozycji NIE zmienilo skrotu"; NIEZAL_32=1; }
if [[ "$NIEZAL_32" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 33 zmiana TRESCI jednego z pieciu plikow progowych (bez dotykania pozostalych) zmienia koncowy skrot ==="
WYJSCIE_33A="$(sbom_skrot_plikow_progowych "$REPO_SKROT")"
printf '{"composer":"v2-zmieniony"}\n' > "$REPO_SKROT/backend/composer.lock"
WYJSCIE_33B="$(sbom_skrot_plikow_progowych "$REPO_SKROT")"
echo "  skrot przed zmiana backend/composer.lock: $WYJSCIE_33A"
echo "  skrot po zmianie backend/composer.lock:   $WYJSCIE_33B"
NIEZAL_33=0
[[ "$WYJSCIE_33A" != "$WYJSCIE_33B" ]] || { echo "  WYNIK: NIEZALICZONY - zmiana tresci pliku progowego NIE zmienila skrotu"; NIEZAL_33=1; }
if [[ "$NIEZAL_33" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 34 brak wyniku MUSI byc czerwony: plik progowy NAPRAWDE usuniety z dysku (nie atrapa) -> rc=1, log nazywa plik, stdout PUSTY ==="
rm -f "$REPO_SKROT/backend/composer.lock"
LOG_BLAD_34="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_BLAD_34")
WYJSCIE_34="$(sbom_skrot_plikow_progowych "$REPO_SKROT" "$LOG_BLAD_34")"
RC_34=$?
echo "  rc: $RC_34, stdout: '$WYJSCIE_34', log bledu: $(cat "$LOG_BLAD_34")"
NIEZAL_34=0
[[ "$RC_34" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=1 (nie da sie policzyc), jest $RC_34"; NIEZAL_34=1; }
[[ -z "$WYJSCIE_34" ]] || { echo "  WYNIK: NIEZALICZONY - stdout mial byc pusty przy bledzie, jest '$WYJSCIE_34'"; NIEZAL_34=1; }
[[ "$(cat "$LOG_BLAD_34")" == *"backend/composer.lock"* ]] || { echo "  WYNIK: NIEZALICZONY - log bledu nie nazywa brakujacego pliku (backend/composer.lock)"; NIEZAL_34=1; }
if [[ "$NIEZAL_34" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 34b ten sam brak pliku, przez PELNY sbom_probka_ma_biec -> decyzja BIEGNIE (nigdy cicho pominieta), mimo zgodnego znacznika ==="
KATALOG_ZNAK_34B="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_ZNAK_34B")
sbom_zapisz_znacznik "$KATALOG_ZNAK_34B" "2026-09-24"
LINIA_34B="$(sbom_probka_ma_biec "$REPO_SKROT" "dowolny-sha" "$KATALOG_ZNAK_34B" "2026-09-24")"
RC_34B=$?
echo "  wiersz: $LINIA_34B"
echo "  rc: $RC_34B"
NIEZAL_34B=0
[[ "$RC_34B" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (BIEGNIE), jest $RC_34B - brak pliku progowego NIE MA prawa zostac cicho pominiety, nawet gdy znacznik dzisiejszy istnieje"; NIEZAL_34B=1; }
[[ "$LINIA_34B" == *"BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi BIEGNIE"; NIEZAL_34B=1; }
if [[ "$NIEZAL_34B" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

# ==================== CZESC 9: przechowywanie skrotu poza drzewem repo ====
# sbom_skrot_sciezka / sbom_zapisz_skrot / sbom_skrot_ostatniego_zielonego_biegu.
# W odroznieniu od znacznika doby ten plik NIE niesie daty w nazwie - ma
# przezyc zmiane doby (patrz komentarz nad sbom_skrot_sciezka w bibliotece).

echo "=== 43 skrot: sciezka NIE niesie zadnej daty w nazwie (w odroznieniu od znacznika), lezy w podanym katalogu ==="
KATALOG_SKR="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_SKR")
SCIEZKA_SKR="$(sbom_skrot_sciezka "$KATALOG_SKR")"
echo "  sciezka: $SCIEZKA_SKR"
NIEZAL_43=0
[[ "$SCIEZKA_SKR" == "$KATALOG_SKR"/* ]] || { echo "  WYNIK: NIEZALICZONY - sciezka skrotu nie lezy w podanym katalogu"; NIEZAL_43=1; }
[[ "$SCIEZKA_SKR" != *2026-09-24* && "$SCIEZKA_SKR" != *2026-09-25* ]] || { echo "  WYNIK: NIEZALICZONY - sciezka skrotu niesie date, a nie powinna"; NIEZAL_43=1; }
if [[ "$NIEZAL_43" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 44 skrot: PRZED zapisem nie da sie odczytac (rc=1), PO zapisie zwraca DOKLADNIE zapisana wartosc ==="
NIEZAL_44=0
sbom_skrot_ostatniego_zielonego_biegu "$KATALOG_SKR" >/dev/null 2>&1 && { echo "  WYNIK: NIEZALICZONY - skrot da sie odczytac PRZED zapisem"; NIEZAL_44=1; }
sbom_zapisz_skrot "$KATALOG_SKR" "deadbeef1234"
ODCZYT_44="$(sbom_skrot_ostatniego_zielonego_biegu "$KATALOG_SKR")"; RC_44=$?
echo "  po zapisie: rc=$RC_44, odczyt='$ODCZYT_44'"
[[ "$RC_44" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 PO zapisie, jest $RC_44"; NIEZAL_44=1; }
[[ "$ODCZYT_44" == "deadbeef1234" ]] || { echo "  WYNIK: NIEZALICZONY - odczyt '$ODCZYT_44' != zapisana wartosc 'deadbeef1234'"; NIEZAL_44=1; }
if [[ "$NIEZAL_44" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi


# ==================== CZESC 10: generator kroku 3g biegnie BEZWARUNKOWO ===
# N7 potrzebuje SWIADKA ZACHOWANIA, nie napisu: przypadek nizej URUCHAMIA
# WYCIETY, PRAWDZIWY fragment deploy/bramka-hosta.sh (krok 3g, scalenie do
# KOD_FRONT, koncowy lancuch kodu wyjscia) - CYTOWANY sedem z pliku PRZY
# KAZDYM biegu testu, NIE przepisany recznie, zeby test i bramka nie mogly
# sie rozjechac i zeby przypadek naprawde zaczerwienil sie, gdyby ktos
# kiedys owinal wywolanie generatora w warunek decyzji (dokladnie ta klasa
# usterki, ktorej struktura kodu sama NIE pilnuje).
#
# Jedyna ingerencja w cytowany tekst: PO linii `source .../lib/sbom.sh`
# (kwarantanna miedzy dwoma czesciami kroku 3g) wstawiamy ATRAPE funkcji
# sbom_probka_ma_biec, ktora ZAWSZE zwraca "NIE BIEGNIE" (rc=1) - analogicznie
# do PATH-owej atrapy dockera w CZESCI 3 wyzej, tylko przez redefinicje
# funkcji (bo sbom_probka_ma_biec nie idzie przez PATH). Teza pod probe:
# NAWET gdy decyzja mowi "NIE BIEGNIE", dziennik i tak ma niesc liczbe
# skladnikow z generatora (krok 3g, generator bezwarunkowy).
echo "=== 35 (N7) krok 3g URUCHOMIONY z wymuszona decyzja NIE BIEGNIE -> generator i tak dowozi 'skladnikow N' w dzienniku ==="

KATALOG_HARNESS_35="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_HARNESS_35")
# W $REPO_ROOT/deploy, NIE w $TU: cytowana linia `source
# "$(dirname "${BASH_SOURCE[0]}")/lib/sbom.sh"` rozwiazuje sciezke wzgledem
# WLASNEGO polozenia pliku - ma wskazac deploy/lib/sbom.sh, dokladnie jak w
# prawdziwej bramce.
FRAGMENT_35="$(mktemp -p "$REPO_ROOT/deploy" bramka-swiadek-3g.XXXXXX.sh)"
PLIKI_TESTOWE+=("$FRAGMENT_35")

{
  echo "#!/usr/bin/env bash"
  # Pomocnicze funkcje uzywane przez cytowane fragmenty - cytowane TEZ sedem,
  # nie przepisane, z gory pliku bramka-hosta.sh.
  sed -n '/^czas_od() {/p' "$REPO_ROOT/deploy/bramka-hosta.sh"
  sed -n '/^naglowek() {/p' "$REPO_ROOT/deploy/bramka-hosta.sh"
  echo
  # Zmienne, ktore w prawdziwej bramce dostarczaja wczesniejsze kroki
  # (A, B, statyczna, ...) - tutaj nieuruchamiane, wiec zerowe. KATALOG_BIEGU
  # jest WLASNY dla tego biegu testu.
  cat <<VARS
KOD_A=0
KOD_B=0
KOD_STATYCZNA=0
KOD_ACTIONLINT=0
KOD_GITLEAKS=0
KOD_SWIADEK_LOGOWANIA=0
KOD_LIBC=0
KOD_DRZEWO=0
KOD_SEMGREP=0
KOD_FRONT=0
KATALOG_BIEGU="$KATALOG_HARNESS_35/bieg"
mkdir -p "\$KATALOG_BIEGU"
VARS
  echo
  # --- krok 3g, CZESC A: naglowek + zrodlowanie lib/sbom.sh (cytat doslowny) ---
  sed -n '/^naglowek "3g - inwentarz skladnikow/,/lib\/sbom\.sh"$/p' "$REPO_ROOT/deploy/bramka-hosta.sh"
  echo
  # --- ATRAPA: jedyna nie-cytowana linia w calym przypadku - wymusza decyzje
  echo 'sbom_probka_ma_biec() { echo "SBOM: proba logiki NIE BIEGNIE - powod: ATRAPA przypadku 35 wymusza pominiecie"; return 1; }'
  echo
  # --- krok 3g, CZESC B: reszta kroku (cytat doslowny, uzywa atrapy powyzej) ---
  # Wyjecie do zmiennej (nie prosto do potoku wyjsciowego) - zeby PONIZEJ, PO
  # zlozeniu fragmentu, dalo sie zmierzyc KSZTALT tego, co sed naprawde
  # wyciol (samokontrola kotwicy KONCOWEJ, patrz przypadek 35 nizej).
  #
  # Kotwica konczy sie na PELNEJ nazwie sbom_kod_kroku_ostateczny, NIE na
  # samym sbom_kod_kroku: "sbom_kod_kroku" jest
  # PRZEDROSTKIEM "sbom_kod_kroku_ostateczny", wiec kotwica bez pelnej nazwy
  # trafialaby TAKZE w stara linie (KOD_SBOM="$(sbom_kod_kroku ...)") - a to
  # znaczy, ze cofniecie WPIECIA (powrot do starej funkcji, bez swiadomosci
  # awarii generatora) NIE zmienialoby ksztaltu wyciecia i przypadek 35 nie
  # zauwazylby niczego. Przypadek 42 nizej mierzy ten rozdzial wprost.
  CZESC_B_35="$(sed -n '/^# Znacznik doby idzie do katalogu NADRZEDNEGO/,/^KOD_SBOM="\$(sbom_kod_kroku_ostateczny/p' "$REPO_ROOT/deploy/bramka-hosta.sh")"
  printf '%s\n' "$CZESC_B_35"
  echo
  # --- scalenie do KOD_FRONT (cytat doslowny) ---
  sed -n '/^# Scalenie proby logiki SBOM/,/^fi$/p' "$REPO_ROOT/deploy/bramka-hosta.sh"
  echo
  # --- koncowy lancuch kodu wyjscia + exit (cytat doslowny) ---
  sed -n '/^if \[ "\$KOD_A"/,$p' "$REPO_ROOT/deploy/bramka-hosta.sh"
} > "$FRAGMENT_35"
chmod +x "$FRAGMENT_35"

WYJSCIE_35="$(cd "$REPO_ROOT" && bash "$FRAGMENT_35" 2>&1)"
RC_35=$?
echo "  fragment: $FRAGMENT_35"
echo "  rc calego fragmentu (kod wyjscia symulowanej bramki): $RC_35"
echo "$WYJSCIE_35" | sed 's/^/  | /'

NIEZAL_35=0
echo "$WYJSCIE_35" | grep -q "NIE BIEGNIE" || { echo "  WYNIK: NIEZALICZONY - atrapa decyzji nie wymusila 'NIE BIEGNIE' (uprzaz sama zepsuta)"; NIEZAL_35=1; }
echo "$WYJSCIE_35" | grep -qE 'SBOM \(pomiar, poza kodem wyjscia\): EXIT=0.*skladnikow [0-9]' || {
  echo "  WYNIK: NIEZALICZONY - mimo decyzji NIE BIEGNIE, dziennik NIE niesie wiersza 'SBOM (...): EXIT=0 ... skladnikow N' - generator zostal (kiedys) uwarunkowany decyzja, zamiast biec bezwarunkowo"
  NIEZAL_35=1
}

# RC_35 przestaje byc ozdoba drukowana i nie sprawdzana:
# w TYM przypadku generator jest PRAWDZIWY (docker/trivy, bezwarunkowy,
# niezmockowany) - proba NIE BIEGNIE, wiec jedynym zrodlem czerwieni jest
# generator. Na maszynie Z dockerem prawdziwy generator ma sie udac (rc=0
# tego kroku), wiec caly bieg ma dac RC=0. Bez dockera generator sam jest
# NIEZMIERZONY (patrz sbom_uruchom_generator, kod 127) - a to jest TERAZ (po
# poprawce) AWARIA PRZYRZADU, ktora legalnie czerwieni krok 3g
# (RC=2) NIEZALEZNIE od tego, czy cokolwiek tu jest zepsute - taki wynik nie
# jest porazka testu, jest NIEZMIERZONY (jak reszta CZESCI 4 end-to-end).
if command -v docker >/dev/null 2>&1; then
  [[ "$RC_35" -eq 0 ]] || {
    echo "  WYNIK: NIEZALICZONY - docker jest dostepny, generator prawdziwy powinien byl sie udac (proba logiki NIE BIEGNIE, jedyne zrodlo czerwieni), oczekiwano RC=0, jest RC=$RC_35"
    NIEZAL_35=1
  }
else
  echo "  RC_35: NIE ZMIERZONO wprost (brak docker w PATH na tej maszynie - generator prawdziwy sam jest NIEZMIERZONY, RC=$RC_35 legalnie != 0 po poprawce)"
  NIEZMIERZONE_LICZNIK=$((NIEZMIERZONE_LICZNIK + 1))
fi

# Samokontrola KOTWICY KONCOWEJ sed (/^KOD_SBOM="\$(sbom_kod_kroku_ostateczny/) -
# kotwica POCZATKOWA (CZESC A powyzej) juz ma swoja samokontrole (kontrola
# tuz nad tym komentarzem: "atrapa decyzji nie wymusila 'NIE BIEGNIE'"
# czerwieni sie, gdy CZESC A wciagnie za duzo/za malo i realna, zrodlowana
# funkcja decyzyjna wygra z atrapa). Kotwica koncowa takiej samokontroli NIE
# MIALA: kosmetyczne zdjecie cudzyslowow z
# `KOD_SBOM="$(sbom_kod_kroku_ostateczny...)"` w bramce sprawia, ze wzorzec
# koncowy (ktory wymaga LITERALNEGO cudzyslowu zaraz po `=`) przestaje
# trafiac - sed BEZ BLEDU dociaga WSZYSTKO do konca pliku (brak dopasowania
# konca = do EOF), a przypadek mimo to bywal ZALICZONY, bo szukany wzorzec
# 'skladnikow N' wciaz gdzies w rozdetym fragmencie sie znajdowal. Mierzymy
# wiec KSZTALT tego, co naprawde zostalo wyciete - NIE tresc, ktora moze
# przypadkiem pasowac.
LINII_CZESC_B_35="$(printf '%s\n' "$CZESC_B_35" | grep -c .)"
OSTATNI_CZESC_B_35="$(printf '%s\n' "$CZESC_B_35" | tail -1)"
PROG_LINII_CZESC_B_35=110
# Fixed-string (grep -F), NIE dopasowanie [[ == glob ]]: ostatni wiersz niesie
# `$(` i `"` - znaki specjalne dla substytucji polecen/cudzyslowia, gdyby
# trafily NIEocytowane w prawa strone `[[ ]]`. grep -F omija ten klopot.
if [[ "$LINII_CZESC_B_35" -ge "$PROG_LINII_CZESC_B_35" ]] || ! printf '%s' "$OSTATNI_CZESC_B_35" | grep -qF 'KOD_SBOM="$(sbom_kod_kroku_ostateczny'; then
  echo "  WYNIK: NIEZALICZONY - UPRZAZ SAMA ZEPSUTA: kotwica koncowa sed nie trafila w deploy/bramka-hosta.sh (zmiana ksztaltu wiersza 'KOD_SBOM=\"\$(sbom_kod_kroku_ostateczny...)\"'?) - CZESC B ma $LINII_CZESC_B_35 wierszy (prog $PROG_LINII_CZESC_B_35) i konczy sie na '$OSTATNI_CZESC_B_35' zamiast na wierszu zaczynajacym sie od 'KOD_SBOM=\"\$(sbom_kod_kroku_ostateczny' - to wina UPRZEZY testu (cytuje zly fragment bramki), nie samej bramki"
  NIEZAL_35=1
fi

if [[ "$NIEZAL_35" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

# ==================== CZESC 12: WPIECIE ===================================
# Przypadki 38-40 zamknely "przyrzad ktory nie zadzialal zostaje zielony" na
# poziomie FUNKCJI (sbom_kod_kroku_ostateczny). Brakowalo pomiaru, ze
# zestaw NIGDY nie sprawdza, czy deploy/bramka-hosta.sh NAPRAWDE woła TA
# funkcje - wiersz 518 dalo sie cofnac do starej postaci
# (KOD_SBOM="$(sbom_kod_kroku ...)", BEZ generatora jako wejscia) i zestaw
# nadal dawal 41/0. Dwa niezalezne dowody ponizej lataja NIE na tresci sed-a
# (jak przypadek 35), tylko na PRAWDZIWYM zachowaniu cytowanego kodu.

echo "=== 41 WPIECIE: krok 3g z generatorem USZKODZONYM (atrapa, EXIT=9) i decyzja NIE BIEGNIE -> caly cytowany bieg MA dac RC!=0 ==="
# Para kontrolna z KRYTERIOW (odpowiednik 8701593): generator PADA, ZADEN
# prog nie jest dotkniety (tu: symulowane wprost atrapa decyzji NIE BIEGNIE,
# bez potrzeby prawdziwego gita/znacznika). To jest DOKLADNIE ta kombinacja,
# w ktorej stara wersja (sbom_kod_kroku bez generatora jako wejscia) milczala
# zielono - i test, ktory tylko DRUKOWAL RC_35, tego nie widzial.
KATALOG_HARNESS_41="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_HARNESS_41")
FRAGMENT_41="$(mktemp -p "$REPO_ROOT/deploy" bramka-swiadek-3g-wpiecie.XXXXXX.sh)"
PLIKI_TESTOWE+=("$FRAGMENT_41")

{
  echo "#!/usr/bin/env bash"
  sed -n '/^czas_od() {/p' "$REPO_ROOT/deploy/bramka-hosta.sh"
  sed -n '/^naglowek() {/p' "$REPO_ROOT/deploy/bramka-hosta.sh"
  echo
  cat <<VARS
KOD_A=0
KOD_B=0
KOD_STATYCZNA=0
KOD_ACTIONLINT=0
KOD_GITLEAKS=0
KOD_SWIADEK_LOGOWANIA=0
KOD_LIBC=0
KOD_DRZEWO=0
KOD_SEMGREP=0
KOD_FRONT=0
KATALOG_BIEGU="$KATALOG_HARNESS_41/bieg"
mkdir -p "\$KATALOG_BIEGU"
VARS
  echo
  # --- krok 3g, CZESC A: naglowek + zrodlowanie lib/sbom.sh (cytat doslowny) ---
  sed -n '/^naglowek "3g - inwentarz skladnikow/,/lib\/sbom\.sh"$/p' "$REPO_ROOT/deploy/bramka-hosta.sh"
  echo
  # --- DWIE ATRAPY: jedyne nie-cytowane linie - generator PADA (docker w
  # ogole nie jest potrzebny, podmieniamy funkcje wprost, tak jak nizej dla
  # decyzji) I proba logiki NIE BIEGNIE zarazem.
  echo 'sbom_uruchom_generator() { echo "sbom: ATRAPA przypadku 41 wymusza awarie generatora" > "$3" 2>/dev/null; return 9; }'
  echo 'sbom_probka_ma_biec() { echo "SBOM: proba logiki NIE BIEGNIE - powod: ATRAPA przypadku 41 wymusza pominiecie"; return 1; }'
  echo
  # --- krok 3g, CZESC B: reszta kroku (cytat doslowny, uzywa atrap powyzej) ---
  # Kotwica LUZNA (bez _ostateczny) - CELOWO ta sama, jaka byla przed poprawka:
  # przypadek 41 ma zmierzyc WPIECIE (zachowanie), nie KSZTALT cytatu (to
  # robia 35 i 42) - ma zostac BEZPIECZNIE OGRANICZONY (nie uciec az do "4 -
  # front", ktory probowalby dockera/npm) NIEZALEZNIE OD TEGO, ktora funkcja
  # naprawde stoi w KOD_SBOM=... w tej chwili. Luzna kotwica trafia w obie
  # nazwy (sbom_kod_kroku i sbom_kod_kroku_ostateczny), wiec ograniczenie
  # dziala w OBU wariantach wpiecia - dokladnie to tu jest potrzebne.
  sed -n '/^# Znacznik doby idzie do katalogu NADRZEDNEGO/,/^KOD_SBOM="\$(sbom_kod_kroku/p' "$REPO_ROOT/deploy/bramka-hosta.sh"
  echo
  # --- scalenie do KOD_FRONT (cytat doslowny) ---
  sed -n '/^# Scalenie proby logiki SBOM/,/^fi$/p' "$REPO_ROOT/deploy/bramka-hosta.sh"
  echo
  # --- koncowy lancuch kodu wyjscia + exit (cytat doslowny) ---
  sed -n '/^if \[ "\$KOD_A"/,$p' "$REPO_ROOT/deploy/bramka-hosta.sh"
} > "$FRAGMENT_41"
chmod +x "$FRAGMENT_41"

WYJSCIE_41="$(cd "$REPO_ROOT" && bash "$FRAGMENT_41" 2>&1)"
RC_41=$?
echo "  fragment: $FRAGMENT_41"
echo "  rc calego fragmentu (kod wyjscia symulowanej bramki): $RC_41"
echo "$WYJSCIE_41" | sed 's/^/  | /'

NIEZAL_41=0
echo "$WYJSCIE_41" | grep -q "NIE BIEGNIE" || { echo "  WYNIK: NIEZALICZONY - atrapa decyzji nie wymusila 'NIE BIEGNIE' (uprzaz sama zepsuta)"; NIEZAL_41=1; }
echo "$WYJSCIE_41" | grep -q "generator EXIT=9" || { echo "  WYNIK: NIEZALICZONY - atrapa generatora nie wymusila EXIT=9 (uprzaz sama zepsuta)"; NIEZAL_41=1; }
[[ "$RC_41" -ne 0 ]] || {
  echo "  WYNIK: NIEZALICZONY - WPIECIE: generator PADL (EXIT=9) i proba logiki NIE BIEGLA, a caly cytowany bieg mimo to zakonczyl sie RC=0 - awaria przyrzadu zostala CICHO ODPIETA od kodu wyjscia bramki (dokladnie dziura, ktora ta poprawka miala zamknac)"
  NIEZAL_41=1
}
if [[ "$NIEZAL_41" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 42 kotwica koncowa ROZROZNIA sbom_kod_kroku od sbom_kod_kroku_ostateczny (nie sama tresc, ktora moze przypadkiem pasowac) ==="
# Pomiar wprost, bez gita/dockera: kotwica uzywana przez przypadki 35/41 MA
# trafiac w linie z sbom_kod_kroku_ostateczny i MA NIE trafiac w linie ze
# STARA funkcja sbom_kod_kroku (mimo ze ta druga nazwa jest PRZEDROSTKIEM
# pierwszej - to byla luka w pomiarze).
WZORZEC_KONCOWY_42='^KOD_SBOM="\$(sbom_kod_kroku_ostateczny'
LINIA_STARA_42='KOD_SBOM="$(sbom_kod_kroku "$KOD_TEST_SBOM" "$PROBA_SBOM_BIEGLA")"'
LINIA_NOWA_42='KOD_SBOM="$(sbom_kod_kroku_ostateczny "$KOD_SBOM_GEN" "$KOD_TEST_SBOM" "$PROBA_SBOM_BIEGLA")"'

# grep BEZ -E (BRE), NIE ERE: dokladnie tak samo jak sed BRE uzywane
# naprawde w przypadkach 35/41 - "(" jest tam znakiem LITERALNYM, nie
# grupujacym. Z -E ten sam wzorzec pada "Unmatched (" (zmierzone przy
# pisaniu tego przypadku).
echo "$LINIA_NOWA_42" | grep -q "$WZORZEC_KONCOWY_42"; DOPASOWANIE_NOWA_42=$?
echo "$LINIA_STARA_42" | grep -q "$WZORZEC_KONCOWY_42"; DOPASOWANIE_STARA_42=$?
echo "  wzorzec: $WZORZEC_KONCOWY_42"
echo "  dopasowanie do NOWEJ linii (sbom_kod_kroku_ostateczny): rc=$DOPASOWANIE_NOWA_42 (0=trafil)"
echo "  dopasowanie do STAREJ linii (sbom_kod_kroku, bez _ostateczny): rc=$DOPASOWANIE_STARA_42 (0=trafil, TU MA BYC 1)"

NIEZAL_42=0
[[ "$DOPASOWANIE_NOWA_42" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - kotwica NIE trafia we WLASCIWA linie (sbom_kod_kroku_ostateczny)"; NIEZAL_42=1; }
[[ "$DOPASOWANIE_STARA_42" -ne 0 ]] || { echo "  WYNIK: NIEZALICZONY - kotwica trafia TAKZE w stara linie (sbom_kod_kroku bez _ostateczny) - przedrostek nie jest odrozniany, wpiecie dalo by sie cofnac bez sladu"; NIEZAL_42=1; }
if [[ "$NIEZAL_42" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

# ==================== CZESC 11: straz obejmuje samego siebie, awaria
# przyrzadu czerwieni NIEZALEZNIE od proby logiki ===========================
# Wylacznie LOKALNIE - funkcjami z deploy/lib/sbom.sh na wlasnych przypadkach,
# BEZ uruchamiania prawdziwej bramki hosta, BEZ npm ci / build.

echo "=== 36 straz obejmuje SAMA SIEBIE: zmiana TRESCI deploy/bramka-hosta.sh (przy zgodnym skrocie startowym) -> BIEGNIE ==="
REPO_S1="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$REPO_S1")
zbuduj_fixture_progowa "$REPO_S1" "v1"
KATALOG_ZNAK_S1="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_ZNAK_S1")
sbom_zapisz_znacznik "$KATALOG_ZNAK_S1" "2026-09-24"
sbom_zapisz_skrot "$KATALOG_ZNAK_S1" "$(sbom_skrot_plikow_progowych "$REPO_S1")"
# Dotykamy WYLACZNIE deploy/bramka-hosta.sh - plik, ktory sama bramke uruchamia.
printf 'bramka v2-zmieniona\n' > "$REPO_S1/deploy/bramka-hosta.sh"
LINIA_36="$(sbom_probka_ma_biec "$REPO_S1" "dowolny-sha" "$KATALOG_ZNAK_S1" "2026-09-24")"
RC_36=$?
echo "  wiersz: $LINIA_36"
echo "  rc: $RC_36"
NIEZAL_36=0
[[ "$RC_36" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (BIEGNIE), jest $RC_36 - straz nie obejmuje pliku, ktory ja uruchamia"; NIEZAL_36=1; }
[[ "$LINIA_36" == *"BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi BIEGNIE"; NIEZAL_36=1; }
if [[ "$NIEZAL_36" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 37 prog NIE rozlal sie na wszystko: zmiana pliku SPOZA SBOM_PLIKI_PROGOWE -> NIE BIEGNIE (skrot dalej zgodny, znacznik jest) ==="
REPO_S1B="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$REPO_S1B")
zbuduj_fixture_progowa "$REPO_S1B" "v1"
KATALOG_ZNAK_S1B="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_ZNAK_S1B")
sbom_zapisz_znacznik "$KATALOG_ZNAK_S1B" "2026-09-24"
sbom_zapisz_skrot "$KATALOG_ZNAK_S1B" "$(sbom_skrot_plikow_progowych "$REPO_S1B")"
# Plik SPOZA piatki progowej - nie ma prawa wplynac na skrot ani na decyzje.
mkdir -p "$REPO_S1B/frontend/src"
printf '<template>zmiana frontu, poza progiem</template>\n' > "$REPO_S1B/frontend/src/App.vue"
LINIA_37="$(sbom_probka_ma_biec "$REPO_S1B" "dowolny-sha" "$KATALOG_ZNAK_S1B" "2026-09-24")"
RC_37=$?
echo "  wiersz: $LINIA_37"
echo "  rc: $RC_37"
NIEZAL_37=0
[[ "$RC_37" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=1 (NIE BIEGNIE), jest $RC_37 - prog rozlal sie na plik spoza SBOM_PLIKI_PROGOWE"; NIEZAL_37=1; }
[[ "$LINIA_37" == *"NIE BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi NIE BIEGNIE"; NIEZAL_37=1; }
if [[ "$NIEZAL_37" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 38 (S2a) generator zmuszony do EXIT!=0 -> kod kroku 3g != 0, TAKZE gdy proba logiki NIE BIEGNIE ==="
KOD_38A="$(sbom_kod_kroku_ostateczny 9 0 "nie")"
RC_38A_FN=$?
echo "  sbom_kod_kroku_ostateczny 9 0 nie -> $KOD_38A (rc fn=$RC_38A_FN)"
KOD_38B="$(sbom_kod_kroku_ostateczny 9 1 "tak")"
echo "  sbom_kod_kroku_ostateczny 9 1 tak -> $KOD_38B"
NIEZAL_38=0
[[ "$KOD_38A" -ne 0 ]] || { echo "  WYNIK: NIEZALICZONY - generator EXIT=9, proba NIE BIEGNIE: oczekiwano kod kroku 3g != 0, jest $KOD_38A (awaria przyrzadu zostala pochlonieta przez pominiecie proby)"; NIEZAL_38=1; }
[[ "$KOD_38B" -ne 0 ]] || { echo "  WYNIK: NIEZALICZONY - generator EXIT=9, proba BIEGLA: oczekiwano kod kroku 3g != 0, jest $KOD_38B"; NIEZAL_38=1; }
if [[ "$NIEZAL_38" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 39 (S2b) wartosc pomiaru (liczba podatnosci) nadal NIE czerwieni: generator EXIT=0 -> kod kroku 3g = 0, funkcja nie przyjmuje liczby podatnosci jako wejscia w ogole ==="
KOD_39="$(sbom_kod_kroku_ostateczny 0 0 "tak")"
echo "  sbom_kod_kroku_ostateczny 0 0 tak -> $KOD_39"
PODPIS_39="$(declare -f sbom_kod_kroku_ostateczny | grep -cE '\$4|podatnosc')"
echo "  wystapien \$4/'podatnosc' w ciele sbom_kod_kroku_ostateczny: $PODPIS_39"
NIEZAL_39=0
[[ "$KOD_39" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - generator zielony ma dac kod kroku 3g = 0 (to nadal pomiar, nie kryterium), jest $KOD_39"; NIEZAL_39=1; }
[[ "$PODPIS_39" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - sbom_kod_kroku_ostateczny odwoluje sie do liczby podatnosci - nie ma prawa"; NIEZAL_39=1; }
if [[ "$NIEZAL_39" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 40 (S2c) zielony generator nie czerwieni: bieg bez uszkodzen (generator EXIT=0, test logiki EXIT=0, proba biegla) -> kod kroku 3g = 0 ==="
KOD_40="$(sbom_kod_kroku_ostateczny 0 0 "tak")"
echo "  sbom_kod_kroku_ostateczny 0 0 tak -> $KOD_40"
zaliczone_gdy "$([[ "$KOD_40" -eq 0 ]] && echo 0 || echo 1)" \
  "bieg bez uszkodzen ma dac kod kroku 3g = 0, jest $KOD_40"

# ==================== CZESC 13: wyzwalacz odporny na KSZTALT HISTORII =====
# Bramka biegnie zawsze na pchnietym CZUBKU, a pchniecia bywaja zbiorcze
# (kilka commitow naraz). Gdy zmiana przyrzadu ladowala jako commit
# SRODKOWY takiego pchniecia, diff czubka wzgledem jego BEZPOSREDNIEGO
# rodzica jej nie widzial - to byla przyczyna, dla ktorej wersja diffowa
# milczala. Skrot tresci nie ma tej wady: liczy sie z dysku PRZY CZUBKU,
# niezaleznie w ktorym commicie zbiorczego pchniecia zmiana wystapila.

echo "=== 45 rozstrzygajacy: plik progowy zmieniono w commicie SRODKOWYM (N), commit N+1 (czubek) dokłada cos NIEZWIAZANEGO -> decyzja dla N+1 to BIEGNIE ==="
REPO_N45="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$REPO_N45")
zbuduj_fixture_progowa "$REPO_N45" "v1"
KATALOG_ZNAK_N45="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_ZNAK_N45")
# Skrot i znacznik zapisane PRZED commitem N - dokladnie to, co bramka-
# hosta.sh zapisalaby po OSTATNIM zielonym biegu, ktory widzial tresc
# sprzed zmiany.
sbom_zapisz_skrot "$KATALOG_ZNAK_N45" "$(sbom_skrot_plikow_progowych "$REPO_N45")"
sbom_zapisz_znacznik "$KATALOG_ZNAK_N45" "2026-09-24"

# Commit N: zmienia PLIK PROGOWY (backend/composer.lock) - ten commit NIGDY
# nie jest gatowany sam, tylko jako czesc partii ponizej.
printf '{"composer":"v2-zmieniony-w-N"}\n' > "$REPO_N45/backend/composer.lock"
( cd "$REPO_N45" && git add -A && git commit -q -m "N: zmienia plik progowy" )

# Commit N+1 (CZUBEK partii, jedyny, na ktorym bramka naprawde biegnie):
# dokłada cos NIEZWIAZANEGO z przyrzadem.
mkdir -p "$REPO_N45/frontend/src"
printf '<template>nowy, niezwiazany komponent</template>\n' > "$REPO_N45/frontend/src/CosInnego.vue"
( cd "$REPO_N45" && git add -A && git commit -q -m "N+1: dokłada cos niezwiazanego" )
SHA_N45="$(cd "$REPO_N45" && git rev-parse HEAD)"

LINIA_45="$(sbom_probka_ma_biec "$REPO_N45" "$SHA_N45" "$KATALOG_ZNAK_N45" "2026-09-24")"
RC_45=$?
echo "  wiersz: $LINIA_45"
echo "  rc: $RC_45"
NIEZAL_45=0
[[ "$RC_45" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (BIEGNIE), jest $RC_45 - zmiana przyrzadu w commicie SRODKOWYM zbiorczego pchniecia zostala pominieta"; NIEZAL_45=1; }
[[ "$LINIA_45" == *"BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi BIEGNIE"; NIEZAL_45=1; }
if [[ "$NIEZAL_45" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 46 rozstrzygajacy w druga strone: PRAWDZIWY commit, ktory przyrzadu NIE zmienil, znacznik istnieje, skrot zgodny -> NIE BIEGNIE (koszt platny TYLKO gdy przyrzad sie naprawde zmienil) ==="
REPO_N46="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$REPO_N46")
zbuduj_fixture_progowa "$REPO_N46" "v1"
KATALOG_ZNAK_N46="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_ZNAK_N46")
sbom_zapisz_skrot "$KATALOG_ZNAK_N46" "$(sbom_skrot_plikow_progowych "$REPO_N46")"
sbom_zapisz_znacznik "$KATALOG_ZNAK_N46" "2026-09-24"

# PRAWDZIWY commit (nie tylko zapis na dysku) na pliku SPOZA SBOM_PLIKI_PROGOWE.
mkdir -p "$REPO_N46/backend/app"
printf '<?php // kontroler niezwiazany z SBOM\n' > "$REPO_N46/backend/app/CosInnego.php"
( cd "$REPO_N46" && git add -A && git commit -q -m "commit ktory przyrzadu nie zmienil" )
SHA_N46="$(cd "$REPO_N46" && git rev-parse HEAD)"

LINIA_46="$(sbom_probka_ma_biec "$REPO_N46" "$SHA_N46" "$KATALOG_ZNAK_N46" "2026-09-24")"
RC_46=$?
echo "  wiersz: $LINIA_46"
echo "  rc: $RC_46"
NIEZAL_46=0
[[ "$RC_46" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=1 (NIE BIEGNIE), jest $RC_46 - koszt (~196s/commit) zostal zaplacony, mimo ze przyrzad sie nie zmienil"; NIEZAL_46=1; }
[[ "$LINIA_46" == *"NIE BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi NIE BIEGNIE"; NIEZAL_46=1; }
if [[ "$NIEZAL_46" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

# ==================== CZESC 14: skrot zyje POZA drzewem repo ===============
# jak dzienny znacznik - patrz deploy/lib/drzewo-po-biegu.sh (ten sam plik
# zrodluje deploy/tests/test-bramka-drzewo.sh, wiec nie duplikujemy jego
# logiki tutaj - uzywamy go wprost).

echo "=== 47 skrot (jak znacznik) NIE brudzi drzewa repo: git status --porcelain PUSTY po zapisie, drzewo-po-biegu.sh melduje 0 pozycji ==="
# shellcheck source=deploy/lib/drzewo-po-biegu.sh
source "$REPO_ROOT/deploy/lib/drzewo-po-biegu.sh"
REPO_N47="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$REPO_N47")
zbuduj_fixture_progowa "$REPO_N47" "v1"
# Katalog znacznikow/skrotu jest SPOZA REPO_N47 (jak KATALOG_ZNACZNIKOW_SBOM
# w bramka-hosta.sh, dirname wobec KATALOG_BIEGU) - NIGDY drzewo repo.
KATALOG_ZNAK_N47="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_ZNAK_N47")
sbom_zapisz_znacznik "$KATALOG_ZNAK_N47" "2026-09-24"
sbom_zapisz_skrot "$KATALOG_ZNAK_N47" "$(sbom_skrot_plikow_progowych "$REPO_N47")"

STATUS_N47="$(cd "$REPO_N47" && git status --porcelain)"; KOD_GIT_N47=$?
WIERSZ_DRZEWO_N47="$(ocen_drzewo_po_biegu "$STATUS_N47" "$KOD_GIT_N47")"
RC_DRZEWO_N47=$?
echo "  git status --porcelain: '$STATUS_N47' (kod=$KOD_GIT_N47)"
echo "  drzewo-po-biegu: $WIERSZ_DRZEWO_N47 (rc=$RC_DRZEWO_N47)"
NIEZAL_47=0
[[ -z "$STATUS_N47" ]] || { echo "  WYNIK: NIEZALICZONY - repo NIE jest czyste po zapisie znacznika/skrotu poza jego drzewem"; NIEZAL_47=1; }
[[ "$WIERSZ_DRZEWO_N47" == *"0 pozycji"* ]] || { echo "  WYNIK: NIEZALICZONY - drzewo-po-biegu nie melduje 0 pozycji"; NIEZAL_47=1; }
[[ "$RC_DRZEWO_N47" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (czysto), jest $RC_DRZEWO_N47 (6 = brud konczylby caly bieg)"; NIEZAL_47=1; }
if [[ "$NIEZAL_47" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

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
