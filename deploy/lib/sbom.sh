#!/usr/bin/env bash
# Wspolna logika kroku "inwentarz skladnikow wydania (SBOM) i skan podatnosci",
# zrodlowana ZAROWNO przez deploy/bramka-hosta.sh, JAK I przez
# deploy/tests/test-bramka-sbom.sh - jedno miejsce, jedna prawda o tym, jak
# generujemy inwentarz, jak go liczymy i jak go skanujemy. Ten plik NIE ma
# efektow ubocznych przy `source` (definiuje wylacznie funkcje i domyslne
# nazwy obrazow) i sam w sobie niczego nie uruchamia ani nie drukuje.
#
# Powod istnienia (nie kosmetyczny, patrz deploy/lib/sekrety-licznik.sh i
# deploy/lib/drzewo-po-biegu.sh dla tego samego wzorca): bez wydzielenia test
# mialby WLASNA KOPIE logiki liczenia/uruchamiania i zielenilby sie nawet
# wtedy, gdy prawdziwy krok w bramce jest zepsuty albo pusty.
#
# Na maszynie bramkowej NIE MA ani `trivy`, ani `syft`, ani `grype` jako
# binariow hosta - jest tylko docker. Generator (trivy) i skaner (grype)
# jada wiec obrazem kontenera, DOKLADNIE jak semgrep i gitleaks nizej w
# bramce, nie jak `composer audit`/`npm audit`, ktore chodza WEWNATRZ juz
# stojacego kontenera aplikacji.

SBOM_OBRAZ_GENERATORA_DOMYSLNY="aquasec/trivy:0.58.1"
SBOM_OBRAZ_SKANERA_DOMYSLNY="anchore/grype:v0.119.0"

# sbom_uruchom_generator KATALOG_ZRODLA PLIK_WYJSCIA PLIK_LOG [OBRAZ]
#
# Generuje inwentarz CycloneDX z KATALOGU_ZRODLA (montowanego :ro, bez sieci -
# `trivy fs` w tym trybie czyta WYLACZNIE zlockowane pliki zaleznosci
# (backend/composer.lock, frontend/package-lock.json) z dysku; do SAMEGO
# SPISU siec jest niepotrzebna, w odroznieniu od skanu podatnosci nizej,
# ktory siega po baze CVE). JEDNO wywolanie ogarnia OBA ekosystemy naraz
# (PHP i JS) - trivy przechodzi drzewo rekurencyjnie i sam rozpoznaje kazdy
# typ pliku blokady - to jest jedyny powod, dla ktorego wynik jest JEDNYM
# plikiem, a nie dwoma sklejanymi recznie (zmierzone na fixturze z
# backend/composer.lock+composer.json i frontend/package-lock.json+
# package.json obok siebie: jeden bieg, plik z "pkg:composer/..." I
# "pkg:npm/..." naraz).
#
# PLIK WYNIKOWY NIE POWSTAJE przez zamontowany katalog wyjsciowy - `docker cp`
# wyciaga go z kontenera PO biegu. Powod (zmierzony na tym samym Windows+Git
# Bash, na ktorym stoi reszta bramki, patrz sekrety-licznik.sh: "Katalog POD
# repo (nie w globalnym /tmp)"): katalog SPOZA drzewa repo (typowy /tmp z
# `mktemp -d`, czyli DOKLADNIE to, czym bywa $KATALOG_BIEGU) bywa poza
# dyskami, ktore Docker Desktop montuje - montaz wychodzi wtedy PUSTY, BEZ
# ZADNEGO BLEDU (zmierzone: ten sam trivy na tej samej fixturze, raz
# montowany z /tmp - 0 plikow widocznych w kontenerze, raz montowany spod
# katalogu repo - poprawny odczyt). `docker cp` czyta z API demona, nie przez
# bind-mount hosta, wiec dziala NIEZALEZNIE od tego, gdzie lezy PLIK_WYJSCIA -
# jest wiec jedynym sposobem, ktory nie zaklada NICZEGO o polozeniu
# $KATALOG_BIEGU. Ta sama droga (docker cp) sluzy WEJSCIU skanera nizej.
#
# Wejscie repo idzie jednak przez zwykly bind-mount (-v, tak jak semgrep i
# actionlint w bramce) - montujemy KATALOG_ZRODLA (czyli $PWD, drzewo repo
# juz wyewidencjonowane na dysku hosta), ktory NIE ma tej samej wady, bo
# nie jest katalogiem tymczasowym spod /tmp.
#
# Zwraca 0 TYLKO gdy docker wystartowal (kod 0) I `docker cp` wyciagnal plik
# (kod 0) I wyciagniety plik jest niepusty - trzy niezalezne warunki, bo
# kazdy z nich z osobna bywal falszywie zielony (docker EXIT=0 na pustym
# montazu wejsciowym, `docker cp` "udany" na 0-bajtowym pliku wyjsciowym).
# Brak polecenia `docker` w PATH konczy sie kodem 127 BEZ probowania
# czegokolwiek - to jest przypadek "generator nie moze wystartowac", ktory
# wolajacy ma zmeldowac jako NIEZMIERZONE, a nie jako zero skladnikow.
sbom_uruchom_generator() {
  local katalog_zrodla="$1" plik_wyjscia="$2" plik_log="$3"
  local obraz="${4:-$SBOM_OBRAZ_GENERATORA_DOMYSLNY}"
  local nazwa kod_run kod_cp

  if ! command -v docker >/dev/null 2>&1; then
    echo "sbom: NIEZMIERZONE - brak polecenia docker w PATH, generator nie moze wystartowac" > "$plik_log"
    return 127
  fi

  nazwa="sbom-gen-$$-${RANDOM}"
  MSYS_NO_PATHCONV=1 docker run --network none --name "$nazwa" \
    -v "${katalog_zrodla}:/repo:ro" \
    "$obraz" fs -f cyclonedx -o /tmp/sbom.cdx.json /repo \
    > "$plik_log" 2>&1
  kod_run=$?

  docker cp "${nazwa}:/tmp/sbom.cdx.json" "$plik_wyjscia" >> "$plik_log" 2>&1
  kod_cp=$?
  docker rm -f "$nazwa" >/dev/null 2>&1

  if [[ "$kod_run" -ne 0 ]]; then
    echo "sbom: generator zakonczyl sie bledem (docker run EXIT=$kod_run)" >> "$plik_log"
    return "$kod_run"
  fi
  if [[ "$kod_cp" -ne 0 ]]; then
    echo "sbom: docker cp nie wyciagnal pliku wynikowego z kontenera (EXIT=$kod_cp)" >> "$plik_log"
    return 2
  fi
  if [[ ! -s "$plik_wyjscia" ]]; then
    echo "sbom: plik wynikowy jest pusty albo nie istnieje po docker cp" >> "$plik_log"
    return 3
  fi
  return 0
}

# sbom_uruchom_skaner PLIK_SBOM PLIK_LOG [OBRAZ]
#
# Skanuje GOTOWY plik CycloneDX (nie drzewo repo) skanerem podatnosci - wejscie
# idzie do kontenera przez `docker cp` (TEN SAM powod co w generatorze:
# PLIK_SBOM lezy w $KATALOG_BIEGU, ktory bywa poza dyskami montowanymi przez
# Docker Desktop). Siec jest WLACZONA (domyslna) - w odroznieniu od
# generatora, skaner musi sciagnac/odswiezyc baze CVE, dokladnie jak
# `composer audit` i `npm audit` w tym samym biegu (te tez licza sie z siecia)
# - i, tak jak one, jest to POMIAR, nie bramka (patrz krok wywolujacy w
# bramka-hosta.sh: wynik nie wchodzi do kodu wyjscia calego biegu).
#
# `docker create` + `docker cp` + `docker start -a` zamiast zwyklego
# `docker run`: potrzebujemy kontenera, ktory ISTNIEJE (ale jeszcze nie
# wystartowal) w chwili, gdy wgrywamy do niego plik - `docker run` startuje
# od razu i nie zostawia takiego okna.
#
# Zwraca kod `docker start` (0 = skaner sie wykonal - NIEZALEZNIE od tego,
# ile podatnosci znalazl, bo bez `--fail-on` grype nie czerwieni sie od
# samych trafien, tak samo jak nie interesuje nas tu semantyka kodu
# `composer audit`). Brak pliku wejsciowego albo brak docker w PATH konczy
# sie odpowiednio 2 i 127, BEZ probowania uruchomienia.
sbom_uruchom_skaner() {
  local plik_sbom="$1" plik_log="$2"
  local obraz="${3:-$SBOM_OBRAZ_SKANERA_DOMYSLNY}"
  local nazwa kod_create kod_cp kod_start

  if ! command -v docker >/dev/null 2>&1; then
    echo "sbom: NIEZMIERZONE - brak polecenia docker w PATH, skaner nie moze wystartowac" > "$plik_log"
    return 127
  fi
  if [[ ! -s "$plik_sbom" ]]; then
    echo "sbom: NIEZMIERZONE - plik SBOM do przeskanowania nie istnieje albo jest pusty ($plik_sbom)" > "$plik_log"
    return 2
  fi

  nazwa="sbom-skan-$$-${RANDOM}"
  docker create --name "$nazwa" "$obraz" sbom:/tmp/sbom.cdx.json -o table > "$plik_log" 2>&1
  kod_create=$?
  if [[ "$kod_create" -ne 0 ]]; then
    echo "sbom: docker create dla skanera nie powiodl sie (EXIT=$kod_create)" >> "$plik_log"
    docker rm -f "$nazwa" >/dev/null 2>&1
    return "$kod_create"
  fi

  docker cp "$plik_sbom" "${nazwa}:/tmp/sbom.cdx.json" >> "$plik_log" 2>&1
  kod_cp=$?
  if [[ "$kod_cp" -ne 0 ]]; then
    echo "sbom: docker cp pliku SBOM do kontenera skanera nie powiodl sie (EXIT=$kod_cp)" >> "$plik_log"
    docker rm -f "$nazwa" >/dev/null 2>&1
    return "$kod_cp"
  fi

  # Od tego miejsca PLIK_LOG jest NADPISYWANY czystym wyjsciem skanera (bez
  # diagnostyki create/cp powyzej) - sbom_policz_podatnosci nizej parsuje
  # DOKLADNIE ten ksztalt (naglowek "NAME INSTALLED ..." albo pojedyncza
  # linia "No vulnerabilities found"), wiec log ma niesc TYLKO to.
  docker start -a "$nazwa" > "$plik_log" 2>&1
  kod_start=$?
  docker rm -f "$nazwa" >/dev/null 2>&1
  return "$kod_start"
}

# sbom_policz_skladniki PLIK_SBOM
#
# Liczy elementy tablicy "components" NA SZCZYCIE dokumentu CycloneDX (JSON),
# licznikiem opartym o GLEBOKOSC OBIEKTOW (nawiasy klamrowe) - NIE o wciecie,
# bo wciecie roznych generatorow/wersji rozjezdza sie (nie zakladamy 2 czy
# 4 spacji). Dlaczego "na szczycie", a nie po prostu pierwsze wystapienie
# klucza "components": od CycloneDX 1.5 sekcja "metadata"."tools" tez uzywa
# klucza "components" (opis SAMYCH NARZEDZI, ktore zrobily SBOM, nie
# zaleznosci) - licznik, ktory lapalby PIERWSZE wystapienie tego klucza,
# zliczylby narzedzia. Zmierzone na prawdziwym wyjsciu trivy 0.58.1: klucz
# "components" wystepuje w pliku DWA razy - raz wewnatrz metadata.tools (na
# glebokosci obiektu 3), raz na szczycie dokumentu (na glebokosci 1). Test
# ponizej ma osobny przypadek na dokladnie ta pulapke.
#
# W zasiegu (miedzy otwierajacym a zamykajacym nawiasem TEJ tablicy, na
# dowolnej zagniezdzonej glebokosci - podskladniki tez sa skladnikami)
# liczymy pola "bom-ref": kazdy skladnik I kazda usluga w CycloneDX ma
# dokladnie jedno, zaden inny obiekt w typowym wyjsciu generatorow go nie ma.
#
# Brak pliku, pusty plik albo brak klucza "components" WCALE = NIEZMIERZONE
# (kod 1) na stdout - zero jako WYNIK POMIARU (pusta tablica, plik istnieje i
# jest poprawny) i zero jako BRAK POMIARU (pliku nie ma / nie da sie go
# przeczytac) to dwie rozne rzeczy, ktorych nie wolno mylic.
sbom_policz_skladniki() {
  local plik="$1"
  if [[ ! -s "$plik" ]] || ! grep -q '"components"' "$plik"; then
    echo "NIEZMIERZONE"
    return 1
  fi
  awk '
    BEGIN { glebokosc=0; uzbrojony=0; g_tablicy=0; n=0; znaleziony=0 }
    {
      linia=$0
      if (!znaleziony && glebokosc==1 && linia ~ /"components"[ \t]*:[ \t]*\[[ \t]*$/) {
        znaleziony=1; uzbrojony=1; g_tablicy=0
      } else if (uzbrojony && linia ~ /"bom-ref"[ \t]*:/) {
        n++
      }
      kopia=linia; oc=gsub(/\{/,"{",kopia)
      kopia=linia; cc=gsub(/\}/,"}",kopia)
      kopia=linia; ao=gsub(/\[/,"[",kopia)
      kopia=linia; ac=gsub(/\]/,"]",kopia)
      if (uzbrojony) {
        g_tablicy += ao - ac
        if (g_tablicy <= 0) uzbrojony=0
      }
      glebokosc += (oc - cc)
    }
    END { print n+0 }
  ' "$plik"
  return 0
}

# sbom_policz_wg_wzorca PLIK_SBOM WZORZEC
#
# Ta sama logika zasiegu (tablica "components" NA SZCZYCIE dokumentu) co
# sbom_policz_skladniki, ale liczy linie z polem "purl" zawierajace WZORZEC
# (np. "pkg:composer" albo "pkg:npm") - uzywane WYLACZNIE do rozbicia sumy
# w dzienniku na PHP/JS (jeden plik obejmujacy PHP i JS), NIE
# do decyzji o wyniku kroku.
sbom_policz_wg_wzorca() {
  local plik="$1" wzorzec="$2"
  if [[ ! -s "$plik" ]] || ! grep -q '"components"' "$plik"; then
    echo "NIEZMIERZONE"
    return 1
  fi
  awk -v wz="$wzorzec" '
    BEGIN { glebokosc=0; uzbrojony=0; g_tablicy=0; n=0; znaleziony=0 }
    {
      linia=$0
      if (!znaleziony && glebokosc==1 && linia ~ /"components"[ \t]*:[ \t]*\[[ \t]*$/) {
        znaleziony=1; uzbrojony=1; g_tablicy=0
      } else if (uzbrojony && linia ~ /"purl"[ \t]*:/ && index(linia, wz) > 0) {
        n++
      }
      kopia=linia; oc=gsub(/\{/,"{",kopia)
      kopia=linia; cc=gsub(/\}/,"}",kopia)
      kopia=linia; ao=gsub(/\[/,"[",kopia)
      kopia=linia; ac=gsub(/\]/,"]",kopia)
      if (uzbrojony) {
        g_tablicy += ao - ac
        if (g_tablicy <= 0) uzbrojony=0
      }
      glebokosc += (oc - cc)
    }
    END { print n+0 }
  ' "$plik"
  return 0
}

# sbom_policz_podatnosci PLIK_LOG_SKANERA
#
# Liczy wiersze tabeli grype (jeden wiersz = jedno trafienie pakiet+regula).
# "No vulnerabilities found" (JEDYNA linia pliku) = 0 - zgodne z tym, jak
# grype naprawde sygnalizuje pusty wynik (nigdy nie pisze "0
# vulnerabilities", wzorem gitleaksa, ktory tez nie pisze "leaks found: 0" -
# patrz sekrety_policz_trafienia). W przeciwnym razie: liczba wierszy MINUS
# naglowek ("NAME INSTALLED FIXED-IN ..." w pierwszej linii).
#
# Brak pliku, pusty plik, albo wyjscie o ksztalcie, ktorego nie rozpoznajemy
# (ani "No vulnerabilities found", ani naglowek NAME/INSTALLED) =
# NIEZMIERZONE (kod 1) - nie zgadujemy liczby z czegos, czego formatu nie
# znamy (np. log bledu dockera zlapany zamiast tabeli).
sbom_policz_podatnosci() {
  local log="$1" wiersze
  if [[ ! -s "$log" ]]; then
    echo "NIEZMIERZONE"
    return 1
  fi
  if grep -qx "No vulnerabilities found" "$log"; then
    echo 0
    return 0
  fi
  if head -1 "$log" | grep -qE "^NAME[[:space:]]+INSTALLED"; then
    wiersze=$(( $(grep -c . "$log") - 1 ))
    if [[ "$wiersze" -ge 0 ]]; then
      echo "$wiersze"
      return 0
    fi
  fi
  echo "NIEZMIERZONE"
  return 1
}
