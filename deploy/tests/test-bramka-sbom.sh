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
# istniejacym PATH. Powod zmierzony przy odbiorze 23.09: na hoscie bramkowym
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
# Czysta funkcja - wejscia sa JUZ POLICZONE (kod diffu, tresc diffu, obecnosc
# znacznika), bez gita/dockera/zegara. Piec przypadkow ponizej odpowiadaja
# N2 (a)-(e) dosłownie, kazdy pod wlasna nazwa mowiaca o swoim warunku.

echo "=== 18 (N2-a) decyzja: roznica DOTYKA deploy/lib/sbom.sh -> BIEGNIE, powod nazywa plik ==="
LINIA_18="$(sbom_zdecyduj_o_probie 0 $'deploy/lib/sbom.sh\nbackend/app/Cos.php' "nie")"
RC_18=$?
echo "  wiersz: $LINIA_18"
echo "  rc: $RC_18"
NIEZAL_18=0
[[ "$RC_18" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (BIEGNIE), jest $RC_18"; NIEZAL_18=1; }
[[ "$LINIA_18" == *"BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi BIEGNIE"; NIEZAL_18=1; }
[[ "$LINIA_18" == *"deploy/lib/sbom.sh"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie nazywa sprawcy (deploy/lib/sbom.sh)"; NIEZAL_18=1; }
if [[ "$NIEZAL_18" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 19 (N2-b) decyzja: roznica DOTYKA frontend/package-lock.json -> BIEGNIE, powod nazywa plik ==="
LINIA_19="$(sbom_zdecyduj_o_probie 0 $'frontend/src/App.vue\nfrontend/package-lock.json' "nie")"
RC_19=$?
echo "  wiersz: $LINIA_19"
echo "  rc: $RC_19"
NIEZAL_19=0
[[ "$RC_19" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (BIEGNIE), jest $RC_19"; NIEZAL_19=1; }
[[ "$LINIA_19" == *"BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi BIEGNIE"; NIEZAL_19=1; }
[[ "$LINIA_19" == *"frontend/package-lock.json"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie nazywa sprawcy (frontend/package-lock.json)"; NIEZAL_19=1; }
if [[ "$NIEZAL_19" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 20 (N2-c) decyzja: roznica NIE dotyka progu, znacznik DZISIEJSZY JEST -> NIE BIEGNIE ==="
LINIA_20="$(sbom_zdecyduj_o_probie 0 $'backend/app/Http/Controllers/CosInnego.php' "tak")"
RC_20=$?
echo "  wiersz: $LINIA_20"
echo "  rc: $RC_20"
NIEZAL_20=0
[[ "$RC_20" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=1 (NIE BIEGNIE), jest $RC_20"; NIEZAL_20=1; }
[[ "$LINIA_20" == *"NIE BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi NIE BIEGNIE"; NIEZAL_20=1; }
[[ "$LINIA_20" == *"znacznik"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie nazywa znacznika jako powodu"; NIEZAL_20=1; }
if [[ "$NIEZAL_20" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 21 (N2-d) decyzja: roznica NIE dotyka progu, znacznika doby NIE MA -> BIEGNIE (pierwszy bieg dnia) ==="
LINIA_21="$(sbom_zdecyduj_o_probie 0 $'backend/app/Http/Controllers/CosInnego.php' "nie")"
RC_21=$?
echo "  wiersz: $LINIA_21"
echo "  rc: $RC_21"
NIEZAL_21=0
[[ "$RC_21" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (BIEGNIE), jest $RC_21"; NIEZAL_21=1; }
[[ "$LINIA_21" == *"BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi BIEGNIE"; NIEZAL_21=1; }
[[ "$LINIA_21" == *"pierwszy bieg"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie nazywa 'pierwszy bieg dzisiejszej doby' jako powodu"; NIEZAL_21=1; }
if [[ "$NIEZAL_21" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 22 (N2-e, N3) decyzja: roznicy NIE DA SIE POLICZYC -> BIEGNIE (bezpieczne domyslne), NIGDY ciche pominiecie ==="
LINIA_22="$(sbom_zdecyduj_o_probie 2 "" "tak" "brak rodzica (plytki klon)")"
RC_22=$?
echo "  wiersz: $LINIA_22"
echo "  rc: $RC_22"
NIEZAL_22=0
[[ "$RC_22" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (BIEGNIE, bezpieczne domyslne), jest $RC_22 - N3 wymaga BIEGU, nie cichego pominiecia"; NIEZAL_22=1; }
[[ "$LINIA_22" == *"BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi BIEGNIE"; NIEZAL_22=1; }
[[ "$LINIA_22" == *"nie dalo sie policzyc"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie tlumaczy, ze roznicy nie dalo sie policzyc"; NIEZAL_22=1; }
[[ "$LINIA_22" == *"brak rodzica (plytki klon)"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie niesie przekazanego powodu"; NIEZAL_22=1; }
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

echo "=== 30 (N8) dwa biegi tej samej doby przez PELNY sbom_probka_ma_biec (git+znacznik): drugi NIE biegnie, jutro biegnie ==="
# Wlasny mini-klon (spoza REPO_GIT z CZESCI 8 nizej, celowo - ten test
# potrzebuje repo, ktorego commit NIE dotyka zadnego progowego pliku, zeby o
# wyniku decydowal WYLACZNIE znacznik).
REPO_N8="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$REPO_N8")
(
  cd "$REPO_N8" || exit 1
  git init -q
  git config user.email "test@example.invalid"
  git config user.name "Test"
  echo "x" > plik-x.txt
  git add plik-x.txt
  git commit -q -m "pierwszy"
  echo "y" > plik-poza-progiem.txt
  git add plik-poza-progiem.txt
  git commit -q -m "drugi, nie dotyka progu"
)
SHA_N8="$(cd "$REPO_N8" && git rev-parse HEAD)"
KATALOG_ZNAK_N8="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$KATALOG_ZNAK_N8")

LINIA_30A="$(sbom_probka_ma_biec "$REPO_N8" "$SHA_N8" "$KATALOG_ZNAK_N8" "2026-09-24")"
RC_30A=$?
echo "  pierwszy bieg doby 2026-09-24: $LINIA_30A (rc=$RC_30A)"
sbom_zapisz_znacznik "$KATALOG_ZNAK_N8" "2026-09-24"

LINIA_30B="$(sbom_probka_ma_biec "$REPO_N8" "$SHA_N8" "$KATALOG_ZNAK_N8" "2026-09-24")"
RC_30B=$?
echo "  drugi bieg TEJ SAMEJ doby 2026-09-24: $LINIA_30B (rc=$RC_30B)"

LINIA_30C="$(sbom_probka_ma_biec "$REPO_N8" "$SHA_N8" "$KATALOG_ZNAK_N8" "2026-09-25")"
RC_30C=$?
echo "  pierwszy bieg NASTEPNEGO dnia 2026-09-25: $LINIA_30C (rc=$RC_30C)"

NIEZAL_30=0
[[ "$RC_30A" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - pierwszy bieg doby powinien BIEC (rc=0), jest rc=$RC_30A"; NIEZAL_30=1; }
[[ "$RC_30B" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - drugi bieg TEJ SAMEJ doby powinien NIE BIEC (rc=1), jest rc=$RC_30B"; NIEZAL_30=1; }
[[ "$RC_30C" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - pierwszy bieg NASTEPNEGO dnia powinien BIEC (rc=0), jest rc=$RC_30C"; NIEZAL_30=1; }
if [[ "$NIEZAL_30" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

# ==================== CZESC 8: sbom_lista_plikow_zmiany (prawdziwy git) ===
# N3 na prawdziwym gicie: commit BEZ rodzica (pierwszy commit historii) jest
# DOKLADNIE przypadkiem "roznicy nie da sie policzyc" z tabeli N2-e/N3.

echo "=== 31 (N3) sbom_lista_plikow_zmiany: PIERWSZY commit historii (brak rodzica) -> rc=2, NIC na stdout ==="
REPO_GIT="$(mktemp -d -p "$TU")"; KATALOGI_TESTOWE+=("$REPO_GIT")
(
  cd "$REPO_GIT" || exit 1
  git init -q
  git config user.email "test@example.invalid"
  git config user.name "Test"
  echo "a" > plik-a.txt
  git add plik-a.txt
  git commit -q -m "pierwszy"
)
PIERWSZY_SHA="$(cd "$REPO_GIT" && git rev-parse HEAD)"
LOG_BLAD_31="$(mktemp -p "$TU")"; PLIKI_TESTOWE+=("$LOG_BLAD_31")
WYJSCIE_31="$(sbom_lista_plikow_zmiany "$REPO_GIT" "$PIERWSZY_SHA" "$LOG_BLAD_31")"
RC_31=$?
echo "  rc: $RC_31, stdout: '$WYJSCIE_31', log bledu: $(cat "$LOG_BLAD_31")"
NIEZAL_31=0
[[ "$RC_31" -eq 2 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=2 (nie da sie policzyc), jest $RC_31"; NIEZAL_31=1; }
[[ -z "$WYJSCIE_31" ]] || { echo "  WYNIK: NIEZALICZONY - stdout mial byc pusty przy bledzie, jest '$WYJSCIE_31'"; NIEZAL_31=1; }
if [[ "$NIEZAL_31" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 32 sbom_lista_plikow_zmiany: DRUGI commit (rodzic istnieje) -> rc=0, lista niesie zmieniony plik ==="
(
  cd "$REPO_GIT" || exit 1
  echo "b" > plik-b.txt
  git add plik-b.txt
  git commit -q -m "drugi"
)
DRUGI_SHA="$(cd "$REPO_GIT" && git rev-parse HEAD)"
WYJSCIE_32="$(sbom_lista_plikow_zmiany "$REPO_GIT" "$DRUGI_SHA")"
RC_32=$?
echo "  rc: $RC_32, stdout: '$WYJSCIE_32'"
NIEZAL_32=0
[[ "$RC_32" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0, jest $RC_32"; NIEZAL_32=1; }
[[ "$WYJSCIE_32" == "plik-b.txt" ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano 'plik-b.txt', jest '$WYJSCIE_32'"; NIEZAL_32=1; }
if [[ "$NIEZAL_32" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 33 sbom_lista_plikow_zmiany: commit SCALAJACY -> liczy wzgledem PIERWSZEGO rodzica (bez bledu) ==="
(
  cd "$REPO_GIT" || exit 1
  git checkout -q -b galaz
  echo "c" > plik-c.txt
  git add plik-c.txt
  git commit -q -m "trzeci na galezi"
  git checkout -q -
  git merge -q --no-ff galaz -m "scalenie"
)
SCALENIE_SHA="$(cd "$REPO_GIT" && git rev-parse HEAD)"
WYJSCIE_33="$(sbom_lista_plikow_zmiany "$REPO_GIT" "$SCALENIE_SHA")"
RC_33=$?
echo "  rc: $RC_33, stdout: '$WYJSCIE_33'"
zaliczone_gdy "$([[ "$RC_33" -eq 0 ]] && echo 0 || echo 1)" \
  "commit scalajacy MA rodzica (pierwszego) - oczekiwano rc=0, jest $RC_33"

# ==================== CZESC 9: sbom_lista_dotyka_progu =====================

echo "=== 34 sbom_lista_dotyka_progu: lista BEZ zadnego pliku progowego -> rc=1, nic na stdout ==="
WYJSCIE_34="$(sbom_lista_dotyka_progu $'backend/app/Model.php\nfrontend/src/App.vue')"
RC_34=$?
echo "  rc: $RC_34, stdout: '$WYJSCIE_34'"
NIEZAL_34=0
[[ "$RC_34" -eq 1 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=1, jest $RC_34"; NIEZAL_34=1; }
[[ -z "$WYJSCIE_34" ]] || { echo "  WYNIK: NIEZALICZONY - stdout mial byc pusty, jest '$WYJSCIE_34'"; NIEZAL_34=1; }
if [[ "$NIEZAL_34" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi


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
  CZESC_B_35="$(sed -n '/^# Znacznik doby idzie do katalogu NADRZEDNEGO/,/^KOD_SBOM="\$(sbom_kod_kroku/p' "$REPO_ROOT/deploy/bramka-hosta.sh")"
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

# Samokontrola KOTWICY KONCOWEJ sed (/^KOD_SBOM="\$(sbom_kod_kroku/) - kotwica
# POCZATKOWA (CZESC A powyzej) juz ma swoja samokontrole (kontrola tuz nad
# tym komentarzem: "atrapa decyzji nie wymusila 'NIE BIEGNIE'" czerwieni sie,
# gdy CZESC A wciagnie za duzo/za malo i realna, zrodlowana funkcja decyzyjna
# wygra z atrapa). Kotwica koncowa takiej samokontroli NIE MIALA: kosmetyczne
# zdjecie cudzyslowow z `KOD_SBOM="$(sbom_kod_kroku...)"` w bramce (na
# `KOD_SBOM=$(sbom_kod_kroku...)"`) sprawia, ze wzorzec koncowy (ktory wymaga
# LITERALNEGO cudzyslowu zaraz po `=`) przestaje trafiac - sed BEZ BLEDU
# dociaga WSZYSTKO do konca pliku (brak dopasowania konca = do EOF), a
# przypadek mimo to bywal ZALICZONY, bo szukany wzorzec 'skladnikow N' wciaz
# gdzies w rozdetym fragmencie sie znajdowal. Mierzymy wiec KSZTALT tego, co
# naprawde zostalo wyciete - NIE tresc, ktora moze przypadkiem pasowac.
LINII_CZESC_B_35="$(printf '%s\n' "$CZESC_B_35" | grep -c .)"
OSTATNI_CZESC_B_35="$(printf '%s\n' "$CZESC_B_35" | tail -1)"
PROG_LINII_CZESC_B_35=110
echo "  ksztalt CZESC B (samokontrola kotwicy koncowej): $LINII_CZESC_B_35 wierszy (prog $PROG_LINII_CZESC_B_35), ostatni wiersz: '$OSTATNI_CZESC_B_35'"
if [[ "$LINII_CZESC_B_35" -ge "$PROG_LINII_CZESC_B_35" || "$OSTATNI_CZESC_B_35" != KOD_SBOM=* ]]; then
  echo "  WYNIK: NIEZALICZONY - UPRZAZ SAMA ZEPSUTA: kotwica koncowa sed nie trafila w deploy/bramka-hosta.sh (zmiana ksztaltu wiersza 'KOD_SBOM=\"\$(sbom_kod_kroku...)\"'?) - CZESC B ma $LINII_CZESC_B_35 wierszy (prog $PROG_LINII_CZESC_B_35) i konczy sie na '$OSTATNI_CZESC_B_35' zamiast na wierszu zaczynajacym sie od 'KOD_SBOM=' - to wina UPRZEZY testu (cytuje zly fragment bramki), nie samej bramki"
  NIEZAL_35=1
fi

if [[ "$NIEZAL_35" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

# ==================== CZESC 11: straz obejmuje samego siebie (S1), awaria
# przyrzadu czerwieni NIEZALEZNIE od proby logiki (S2) ==========================
# Wylacznie LOKALNIE - funkcjami z deploy/lib/sbom.sh na wlasnych przypadkach,
# BEZ uruchamiania prawdziwej bramki hosta, BEZ npm ci / build.

echo "=== 36 (S1a) deploy/bramka-hosta.sh jest progiem: dotkniecie WYLACZNIE tego pliku -> BIEGNIE, powod nazywa ten plik ==="
LINIA_36="$(sbom_zdecyduj_o_probie 0 "deploy/bramka-hosta.sh" "tak")"
RC_36=$?
echo "  wiersz: $LINIA_36"
echo "  rc: $RC_36"
NIEZAL_36=0
[[ "$RC_36" -eq 0 ]] || { echo "  WYNIK: NIEZALICZONY - oczekiwano rc=0 (BIEGNIE), jest $RC_36"; NIEZAL_36=1; }
[[ "$LINIA_36" == *"BIEGNIE"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie mowi BIEGNIE"; NIEZAL_36=1; }
[[ "$LINIA_36" == *"deploy/bramka-hosta.sh"* ]] || { echo "  WYNIK: NIEZALICZONY - wiersz nie nazywa sprawcy (deploy/bramka-hosta.sh) - straz nie obejmuje pliku, ktory ja uruchamia"; NIEZAL_36=1; }
if [[ "$NIEZAL_36" -eq 1 ]]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 37 (S1b) prog NIE rozlal sie na wszystko: dotkniecie WYLACZNIE pliku frontu -> NIE BIEGNIE (znacznik dzisiejszy juz jest) ==="
LINIA_37="$(sbom_zdecyduj_o_probie 0 "frontend/src/App.vue" "tak")"
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
