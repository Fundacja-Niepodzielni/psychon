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
# --skip-dirs '**/vendor/**' --skip-dirs '**/node_modules/**': BEZ tego
# `trivy fs` schodzi TAKZE do zaleznosci zainstalowanych PRZEZ narzedzia
# testowe i zlicza ICH wewnetrzne pliki blokady jako skladniki produktu -
# zmierzone na drzewie po `composer install`+`npm ci`: 230 skladnikow
# zamiast 152, z czego 51 npm z pakietu bundlowanego wewnatrz
# backend/vendor/laravel/framework/.../exceptions/renderer (wlasny
# package-lock.json tej podpaczki) i 25 pkg:pypi z
# backend/vendor/mockery/mockery/docs/requirements.txt (wymagania do
# budowania DOKUMENTACJI mockery, Python w projekcie PHP+JS, zero zwiazku z
# tym, co wdrazamy). Ani backend/composer.lock, ani frontend/package-
# lock.json NIE LEZA wewnatrz vendor/node_modules, wiec pomijanie tych
# katalogow nie gubi ANI JEDNEGO wpisu z prawdziwego inwentarza produktu -
# zmierzone na tym samym drzewie z flaga: 152 skladniki (85 composer + 65
# npm + 2 pliki-zrodla, bajt w bajt to samo wyjscie, co na czystym klonie
# bez zainstalowanych narzedzi).
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
# (kod 0) I wyciagniety plik jest niepusty I policzony inwentarz ma co
# najmniej 1 skladnik - CZTERY niezalezne warunki, bo kazdy z nich z osobna
# bywal falszywie zielony (docker EXIT=0 na pustym montazu wejsciowym,
# `docker cp` "udany" na 0-bajtowym pliku wyjsciowym, i - zmierzone 23.09
# na kopiach spod AppData/Local/Temp - plik POPRAWNY i NIEPUSTY,
# ale z "components": [] po tym samym pustym-montazu-bez-bledu opisanym
# wyzej: trivy dostaje puste /repo, nie znajduje ZADNEGO pliku blokady i
# oddaje poprawny szkielet CycloneDX bez zawartosci). Projekt jest PHP+JS z
# dwoma plikami blokady zawsze obecnymi w drzewie - zero skladnikow nie jest
# WYNIKIEM, jaki ten projekt moze kiedykolwiek prawdziwie miec, wiec taki
# wynik NIE WOLNO zmeldowac jako "zmierzone zero" (patrz test przypadku 2
# nizej w test-bramka-sbom.sh dla ODWROTNEGO przypadku: zero jest poprawnym
# WYNIKIEM tylko wtedy, gdy liczy pojedynczy JUZ GOTOWY plik podany z
# zewnatrz - tu liczymy WLASNY produkt WLASNEGO biegu, gdzie zero jest
# zawsze objawem awarii, nie tresci).
# Brak polecenia `docker` w PATH konczy sie kodem 127 BEZ probowania
# czegokolwiek - to jest przypadek "generator nie moze wystartowac", ktory
# wolajacy ma zmeldowac jako NIEZMIERZONE, a nie jako zero skladnikow.
sbom_uruchom_generator() {
  local katalog_zrodla="$1" plik_wyjscia="$2" plik_log="$3"
  local obraz="${4:-$SBOM_OBRAZ_GENERATORA_DOMYSLNY}"
  local nazwa kod_run kod_cp ilosc

  if ! command -v docker >/dev/null 2>&1; then
    echo "sbom: NIEZMIERZONE - brak polecenia docker w PATH, generator nie moze wystartowac" > "$plik_log"
    return 127
  fi

  nazwa="sbom-gen-$$-${RANDOM}"
  MSYS_NO_PATHCONV=1 docker run --network none --name "$nazwa" \
    -v "${katalog_zrodla}:/repo:ro" \
    "$obraz" fs -f cyclonedx \
    --skip-dirs '**/vendor/**' --skip-dirs '**/node_modules/**' \
    -o /tmp/sbom.cdx.json /repo \
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
  ilosc="$(sbom_policz_skladniki "$plik_wyjscia")"
  if [[ "$ilosc" == "0" ]]; then
    echo "sbom: plik wynikowy jest poprawny, ale niesie ZERO skladnikow - dla tego projektu (PHP+JS, dwa pliki blokady zawsze w drzewie) to nie jest wiarygodny pomiar tylko typowy objaw pustego montazu (patrz komentarz funkcji), wiec NIEZMIERZONE, nie zero" >> "$plik_log"
    return 4
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
#
# KOLEJNOSC dwoch straznikow ponizej jest SWIADOMA, nie przypadkowa: plik
# wejsciowy jest sprawdzany PRZED narzedziem. Powod, zmierzony 23.09
# na maszynie NAPRAWDE bez dockera: gdy caly proces (nie tylko TA
# funkcja) nie ma dockera w PATH, przypadek "brak pliku wejsciowego" (test
# 12 nizej) NIE nadpisuje swojego PATH wlasnym stubem - dziedziczy PATH
# calego biegu. Gdyby strażnik dockera byl pierwszy, doslalby TAKI SAM kod
# 127 co przypadek "brak narzedzia" (test 11), mimo ze to DWA RÓŻNE powody
# NIEZMIERZONE - a caly zestaw testu konczylby sie EXIT=1 (falszywa
# porazka), zamiast obiecanego w naglowku EXIT=3 (NIE ZMIERZONO), bo test
# oczekuje TU kodu 2, niezaleznie od tego, czy TA maszyna ma docker. Lokalny
# check pliku nic nie kosztuje (nie dotyka sieci ani procesow) i jest
# przyczyna NIEZALEZNA od obecnosci narzedzia, wiec ma pierwszenstwo.
sbom_uruchom_skaner() {
  local plik_sbom="$1" plik_log="$2"
  local obraz="${3:-$SBOM_OBRAZ_SKANERA_DOMYSLNY}"
  local nazwa kod_create kod_cp kod_start

  if [[ ! -s "$plik_sbom" ]]; then
    echo "sbom: NIEZMIERZONE - plik SBOM do przeskanowania nie istnieje albo jest pusty ($plik_sbom)" > "$plik_log"
    return 2
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "sbom: NIEZMIERZONE - brak polecenia docker w PATH, skaner nie moze wystartowac" > "$plik_log"
    return 127
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

# ============================================================================
# Warunkowy bieg proby logiki + skanu podatnosci (od 24.09).
#
# Do 23.09 test logiki SBOM (94-100s) i skan podatnosci (91-101s) biegly
# BEZWARUNKOWO na kazdym commicie - +183..201s na commit za pomiar, ktorego
# czerwien i tak nie zatrzymywala niczego (patrz ostrzezenie w bramka-
# hosta.sh sprzed 24.09: "nie ufam licznikom ponizej, ale krok POZOSTAJE
# POMIAREM"). Generator SAM (1s) zostaje bezwarunkowy - jego koszt jest
# pomijalny i liczba skladnikow w dzienniku jest tania do utrzymania na
# kazdym biegu.
#
# Pierwsza wersja warunku (24.09, wczesny bieg) pytala "czy DIFF GATOWANEGO
# COMMITA wzgledem jego pierwszego rodzica dotyka pliku progowego" - i to
# byla wada, nie oszczednosc: bramka biegnie zawsze na pchnietym CZUBKU, a
# pchniecia bywaja zbiorcze (kilka commitow naraz). Gdy zmiana przyrzadu
# ladowala jako commit SRODKOWY takiego pchniecia, diff czubka wzgledem
# jego BEZPOSREDNIEGO rodzica jej nie widzial - próba milczala, mimo ze
# przyrzad naprawde sie zmienil. Odpowiedz na pytanie "czy przyrzad sie
# zmienil" nie ma prawa zalezec od KSZTALTU HISTORII (scalenie, rebase,
# splaszczenie, kolejnosc pchniec) - ma zalezec WYLACZNIE od TRESCI.
#
# Dlatego warunek teraz pyta inaczej: "czy tresc plikow progowych rozni sie
# od tresci, jaka mialy przy OSTATNIM biegu, w ktorym proba PRZESZLA
# (zielono)". Zamiast diffu jednego commita - SKROT SHA-256 tresci
# wszystkich pozycji SBOM_PLIKI_PROGOWE, trzymany OBOK dziennego znacznika
# (poza drzewem repo, z tego samego powodu co znacznik - patrz
# sbom_zapisz_znacznik nizej). Porownanie "z poprzednim GATOWANYM commitem"
# zostalo odrzucone celowo: host musialby pamietac, co gatowano wczesniej -
# to wiedza SPOZA commita, kolejne miejsce, w ktorym brak odpowiedzi moglby
# udawac odpowiedz. Skrot tresci nie ma tej wady: nie gubi go zadna z wyzej
# wymienionych operacji na historii.
#
# Funkcje ponizej dziela sie na DWIE warstwy - CELOWO, zeby decyzja (czysta
# logika, latwa do przetestowania bez gita/dockera/zegara/dysku) nie byla
# zlepiona z jej prawdziwymi zrodlami (tresc plikow na dysku, plik znacznika
# na dysku, zapisany skrot ostatniego zielonego biegu na dysku):
#   - sbom_zdecyduj_o_probie: CZYSTA funkcja decyzyjna. Bierze JUZ POLICZONE
#     wejscia (czy skrot sie policzyl, biezacy skrot, zapisany skrot
#     ostatniego zielonego biegu, czy znacznik dzisiejszej doby istnieje) i
#     zwraca decyzje + POWOD jednym wierszem na stdout - TEN SAM wiersz
#     idzie do dziennika bramki NIEZALEZNIE od tego, czy decyzja jest
#     "biegnij" czy "pomin" (dziennik ma niesc powod ZAWSZE, nie tylko gdy
#     krok biegnie - cichy brak wiersza przy pominieciu byloby dokladnie ta
#     sama wada, co bezwarunkowe ostrzezenie sprzed 24.09, tylko odwrocona).
#   - sbom_probka_ma_biec: WRAPPER, ktory dowozi PRAWDZIWE wejscia (skrot
#     przez sbom_skrot_plikow_progowych, plik znacznika przez
#     sbom_znacznik_dzis_istnieje, zapisany skrot przez
#     sbom_skrot_ostatniego_zielonego_biegu) i wola powyzsza czysta funkcje.
#     TO jest funkcja, ktora bramka-hosta.sh naprawde wywoluje - jej PODPIS
#     (KATALOG_REPO COMMIT KATALOG_ZNACZNIKOW [DATA] [PLIK_LOG_BLEDU]) zostal
#     CELOWO bez zmian, mimo ze COMMIT juz nie steruje diffem: decyzja teraz
#     czyta tresc plikow z KATALOG_REPO wprost, nie potrzebuje numeru
#     commita zeby wiedziec, co jest na dysku.
# ============================================================================

# Pliki, ktorych TRESC wchodzi do skrotu ponizej - kazda zmiana ktoregos z
# nich (niezaleznie od tego, w ktorym commicie pchnietej partii wystapila)
# uzasadnia bieg. Logika progu, jej wlasny test, oba pliki blokady, ktore
# SBOM naprawde spisuje, i sama BRAMKA, ktora krok 3g uruchamia. Ten
# ostatni wpis domyka luke zmierzona para kontrolna: commit uszkadzajacy
# krok 3g w deploy/bramka-hosta.sh, ale niedotykajacy zadnego z pozostalych
# trzech plikow, przechodzil probke NA ZIELONO - straz nie obejmowala
# pliku, ktorego sama pilnuje. Sciezki sa WZGLEDEM SZCZYTU repo.
SBOM_PLIKI_PROGOWE=(
  "deploy/bramka-hosta.sh"
  "deploy/lib/sbom.sh"
  "deploy/tests/test-bramka-sbom.sh"
  "backend/composer.lock"
  "frontend/package-lock.json"
)

# sbom_skrot_plikow_progowych KATALOG_REPO [PLIK_LOG_BLEDU]
#
# Liczy JEDEN skrot SHA-256 z TRESCI wszystkich pozycji SBOM_PLIKI_PROGOWE,
# w kolejnosci tablicy. Kazda pozycja wchodzi do wejsciowego strumienia
# WLASNA SCIEZKA + WLASNYM skrotem tresci, wiec dolozenie kolejnej pozycji
# do tablicy zmienia koncowy skrot SAMO Z SIEBIE, nawet gdy tresc
# dotychczasowych plikow sie nie zmienia - to jest wprost sprawdzane w
# tescie tej funkcji.
#
# Wypisuje na stdout skrot (64 znaki hex, sha256sum) i zwraca 0, gdy
# WSZYSTKIE pliki dalo sie odczytac i narzedzie liczace skrot dla kazdego z
# nich zwrocilo niepuste wyjscie. Zwraca 1 i NIC nie wypisuje na stdout, gdy
# KTORYKOLWIEK plik nie istnieje, nie da sie go odczytac, albo sha256sum
# zwrocilo dla niego puste wyjscie - trzy rozne przyczyny tego samego "nie
# da sie policzyc", ktorego wolajacy (sbom_probka_ma_biec) nigdy nie ma
# prawa pomijac cicho (patrz sbom_zdecyduj_o_probie nizej: brak wyniku =
# BIEG). Powod (nazwa pliku, ktory zawiodl) laduje w PLIK_LOG_BLEDU
# (domyslnie odrzucony), NIE na stdout - stdout tej funkcji przy
# powodzeniu niesie WYLACZNIE skrot.
sbom_skrot_plikow_progowych() {
  local katalog_repo="$1" plik_log_bledu="${2:-/dev/null}"
  local plik sciezka czesciowy wejscie=""
  for plik in "${SBOM_PLIKI_PROGOWE[@]}"; do
    sciezka="$katalog_repo/$plik"
    if [[ ! -r "$sciezka" ]]; then
      echo "sbom: plik progowy '$plik' nie istnieje albo nie da sie go odczytac (${sciezka})" > "$plik_log_bledu"
      return 1
    fi
    czesciowy="$(sha256sum -- "$sciezka" 2>"$plik_log_bledu" | awk '{print $1}')"
    if [[ -z "$czesciowy" ]]; then
      echo "sbom: sha256sum zwrocilo puste wyjscie dla pliku progowego '$plik' (${sciezka})" > "$plik_log_bledu"
      return 1
    fi
    wejscie+="$plik $czesciowy"$'\n'
  done
  printf '%s' "$wejscie" | sha256sum | awk '{print $1}'
  return 0
}

# sbom_znacznik_sciezka KATALOG_ZNACZNIKOW DATA -> stdout: sciezka pliku
# znacznika DANEJ doby (DATA w formacie date +%F, np. 2026-09-24).
sbom_znacznik_sciezka() {
  echo "$1/sbom-probka-biegla-$2.znacznik"
}

# sbom_znacznik_dzis_istnieje KATALOG_ZNACZNIKOW DATA
# Zwraca 0, gdy znacznik DANEJ doby juz istnieje (proba juz biegla dzisiaj),
# 1 w przeciwnym razie.
sbom_znacznik_dzis_istnieje() {
  [[ -f "$(sbom_znacznik_sciezka "$1" "$2")" ]]
}

# sbom_zapisz_znacznik KATALOG_ZNACZNIKOW DATA
#
# Zapisuje znacznik DANEJ doby - WOLAC WYLACZNIE PO UDANYM (EXIT=0, zielonym)
# biegu proby logiki, NIGDY po czerwonym ani po NIEZMIERZONYM (EXIT=3, brak
# dockera na maszynie testujacej): czerwony/niezmierzony bieg ma dostac
# SZANSE zmierzyc sie ponownie na NASTEPNYM commicie tej samej doby, zamiast
# zniknac za znacznikiem az do jutra.
#
# KATALOG_ZNACZNIKOW jest zawsze SPOZA drzewa repo (wolajacy w bramka-
# hosta.sh przekazuje katalog nadrzedny wobec KATALOG_BIEGU, NIGDY PWD) -
# brud w drzewie repo po biegu konczy caly bieg kodem 6 (deploy/lib/drzewo-
# po-biegu.sh), wiec znacznik pisany do repo czerwienilby WLASNYM istnieniem
# pierwszy bieg po kazdym wpieciu tej zmiany.
sbom_zapisz_znacznik() {
  local katalog="$1" data="$2"
  mkdir -p "$katalog" 2>/dev/null || return 1
  : > "$(sbom_znacznik_sciezka "$katalog" "$data")"
}

# sbom_skrot_sciezka KATALOG_ZNACZNIKOW -> stdout: sciezka pliku ze SKROTEM
# TRESCI plikow progowych z OSTATNIEGO biegu proby logiki, w ktorym ta
# proba PRZESZLA (zielono). W odroznieniu od dziennego znacznika
# (sbom_znacznik_sciezka) ten plik NIE niesie daty w nazwie - ma przezyc
# zmiane doby, bo pyta o TRESC przyrzadu, nie o to, KIEDY ostatnio biegl.
sbom_skrot_sciezka() {
  echo "$1/sbom-probka-biegla.skrot"
}

# sbom_skrot_ostatniego_zielonego_biegu KATALOG_ZNACZNIKOW -> stdout:
# zapisany skrot. Zwraca 1 i nic nie wypisuje, gdy plik ze skrotem jeszcze
# nie istnieje (pierwszy bieg po wpieciu tej zmiany albo pierwszy bieg w
# ogole) - wolajacy ma to odroznic od "skrot policzony, ale pusty", bo
# rc odrozniajacy oba przypadki wystarcza, zeby sbom_zdecyduj_o_probie
# nizej nigdy nie porownal "nic" z "nic" i cicho uznal to za zgodnosc.
sbom_skrot_ostatniego_zielonego_biegu() {
  local sciezka
  sciezka="$(sbom_skrot_sciezka "$1")"
  [[ -f "$sciezka" ]] || return 1
  cat "$sciezka"
}

# sbom_zapisz_skrot KATALOG_ZNACZNIKOW SKROT
#
# Zapisuje SKROT jako "tresc przyrzadu przy ostatnim zielonym biegu" - jak
# sbom_zapisz_znacznik obok, WOLAC WYLACZNIE po udanym (EXIT=0) biegu proby
# logiki, nigdy po czerwonym ani po NIEZMIERZONYM. KATALOG_ZNACZNIKOW jest
# zawsze SPOZA drzewa repo, z tego samego powodu co przy znaczniku (patrz
# komentarz nad sbom_zapisz_znacznik).
sbom_zapisz_skrot() {
  local katalog="$1" skrot="$2"
  mkdir -p "$katalog" 2>/dev/null || return 1
  printf '%s' "$skrot" > "$(sbom_skrot_sciezka "$katalog")"
}

# sbom_zdecyduj_o_probie KOD_SKROT SKROT_BIEZACY SKROT_ZAPISANY ZNACZNIK_DZIS_ISTNIEJE [POWOD_BLEDU_SKROTU]
#
#   KOD_SKROT               = 0, gdy skrot tresci plikow progowych
#                              (sbom_skrot_plikow_progowych) sie policzyl;
#                              != 0, gdy sie NIE policzyl.
#   SKROT_BIEZACY            = skrot TERAZ (czytany TYLKO gdy KOD_SKROT=0).
#   SKROT_ZAPISANY           = skrot z ostatniego ZIELONEGO biegu, albo
#                              PUSTY STRING, gdy go jeszcze nie ma.
#   ZNACZNIK_DZIS_ISTNIEJE   = "tak" / "nie".
#   POWOD_BLEDU_SKROTU       = wyjasnienie, gdy KOD_SKROT != 0 - trafia do
#                              wiersza dziennika, zeby przypadek "nie da sie
#                              policzyc" mial co zacytowac, zamiast cichego
#                              pominiecia.
#
# TO JEST funkcja decyzyjna: wypisuje na stdout DOKLADNIE JEDEN wiersz
# dziennika - ZAWSZE, niezaleznie od tego, czy decyzja jest "biegnij" czy
# "pomin" - i zwraca 0 = PROBA MA BIEC, 1 = PROBA NIE BIEGNIE.
#
# Kolejnosc sprawdzen jest CELOWA (bezpieczne domyslne ZAWSZE wygrywa):
#   1. skrotu NIE dalo sie policzyc -> BIEGNIE (nigdy cichego pominiecia,
#      gdy nie wiadomo, czy przyrzad sie zmienil).
#   2. nie ma jeszcze zapisanego skrotu (pierwszy zielony bieg w ogole) ->
#      BIEGNIE - nie ma z czym porownac.
#   3. skrot biezacy != skrot zapisany (tresc przyrzadu sie zmienila od
#      ostatniego zielonego biegu, NIEZALEZNIE w ktorym commicie pchnietej
#      partii ta zmiana wystapila) -> BIEGNIE.
#   4. skrot sie zgadza -> decyduje ZNACZNIK doby: jest -> NIE BIEGNIE, nie
#      ma -> BIEGNIE (pierwszy bieg dzisiejszej doby, mimo zgodnej tresci).
sbom_zdecyduj_o_probie() {
  local kod_skrot="$1" skrot_biezacy="$2" skrot_zapisany="$3" znacznik_dzis="$4" powod_bledu="${5:-}"

  if [[ "$kod_skrot" -ne 0 ]]; then
    echo "SBOM: proba logiki BIEGNIE - powod: skrotu tresci plikow progowych nie dalo sie policzyc (${powod_bledu:-brak szczegolow}), bezpieczne domyslne zachowanie to BIEG, nigdy ciche pominiecie"
    return 0
  fi

  if [[ -z "$skrot_zapisany" ]]; then
    echo "SBOM: proba logiki BIEGNIE - powod: brak zapisanego skrotu z ostatniego zielonego biegu proby logiki"
    return 0
  fi

  if [[ "$skrot_biezacy" != "$skrot_zapisany" ]]; then
    echo "SBOM: proba logiki BIEGNIE - powod: tresc plikow progowych SBOM zmienila sie od ostatniego zielonego biegu proby logiki"
    return 0
  fi

  if [[ "$znacznik_dzis" == "tak" ]]; then
    echo "SBOM: proba logiki NIE BIEGNIE - powod: tresc plikow progowych SBOM nie zmienila sie od ostatniego zielonego biegu, a dzisiejszy znacznik juz istnieje"
    return 1
  fi

  echo "SBOM: proba logiki BIEGNIE - powod: pierwszy bieg dzisiejszej doby, znacznika jeszcze nie ma"
  return 0
}

# sbom_probka_ma_biec KATALOG_REPO COMMIT KATALOG_ZNACZNIKOW [DATA] [PLIK_LOG_BLEDU]
#
# Wrapper wiazacy PRAWDZIWE wejscia (tresc plikow progowych na dysku, plik
# znacznika na dysku, zapisany skrot ostatniego zielonego biegu na dysku) z
# czysta funkcja decyzyjna powyzej. Wypisuje na stdout DOKLADNIE JEDEN
# wiersz dziennika (ten sam, ktory zwraca sbom_zdecyduj_o_probie) i zwraca
# 0 = PROBA MA BIEC, 1 = PROBA NIE BIEGNIE. DATA domyslnie date +%F.
#
# COMMIT zostaje w podpisie (wolajacy w bramka-hosta.sh przekazuje
# "$(git rev-parse HEAD)") wylacznie dla zgodnosci wywolania - decyzja
# CZYTA TRESC PLIKOW z KATALOG_REPO wprost, wiec numer commita nie steruje
# juz niczym tutaj.
sbom_probka_ma_biec() {
  local katalog_repo="$1" katalog_znacznikow="$3"
  local data="${4:-$(date +%F)}" plik_log_bledu="${5:-/dev/null}"
  local skrot_biezacy="" kod_skrot=0 powod="" znacznik_dzis="nie" skrot_zapisany=""

  if ! skrot_biezacy="$(sbom_skrot_plikow_progowych "$katalog_repo" "$plik_log_bledu")"; then
    kod_skrot=1
    powod="$(cat "$plik_log_bledu" 2>/dev/null)"
  fi

  if sbom_znacznik_dzis_istnieje "$katalog_znacznikow" "$data"; then
    znacznik_dzis="tak"
  fi

  skrot_zapisany="$(sbom_skrot_ostatniego_zielonego_biegu "$katalog_znacznikow" 2>/dev/null)" || skrot_zapisany=""

  sbom_zdecyduj_o_probie "$kod_skrot" "$skrot_biezacy" "$skrot_zapisany" "$znacznik_dzis" "$powod"
}

# sbom_kod_kroku KOD_TEST_SBOM PROBA_LOGIKI_BIEGLA
#
#   KOD_TEST_SBOM        = kod wyjscia bash deploy/tests/test-bramka-sbom.sh
#                           (0 zielono, 1 czerwono, 3 NIE ZMIERZONO - brak
#                           dockera na maszynie TESTUJACEJ, patrz komentarz
#                           w bramka-hosta.sh) - IGNOROWANY, gdy proba NIE
#                           biegla (patrz nizej).
#   PROBA_LOGIKI_BIEGLA   = "tak" / "nie" - decyzja z sbom_zdecyduj_o_probie.
#
# Wypisuje na stdout kod, ktory KROK 3g wnosi do KODU WYJSCIA CALEJ BRAMKI:
#   - PROBA_LOGIKI_BIEGLA=nie -> ZAWSZE 0. Pominiecie jest jawne w dzienniku
#     (wiersz sbom_zdecyduj_o_probie powyzej), a nie ciche - i wlasnie
#     DLATEGO jego czerwien nie ma jak wplynac na kod wyjscia.
#   - PROBA_LOGIKI_BIEGLA=tak i KOD_TEST_SBOM=1 (czerwono) -> 1: pomiar,
#     ktory nie umie sie zatrzymac, nie jest kryterium - ten juz umie.
#   - PROBA_LOGIKI_BIEGLA=tak i KOD_TEST_SBOM=3 (NIE ZMIERZONO) -> 0 - to NIE
#     jest czerwien testu logiki, tylko brak Dockera na maszynie testujacej.
#   - PROBA_LOGIKI_BIEGLA=tak i KOD_TEST_SBOM=0 -> 0.
#   - PROBA_LOGIKI_BIEGLA=tak i KOD_TEST_SBOM SPOZA {0,1,3} -> 4: AWARIA
#     PRZYRZADU. Zestaw prob wypisuje 0/1/3 SAM, swoim koncowym `exit` -
#     kazda inna liczba znaczy, ze do tego `exit` nie doszedl: blad skladni
#     w pliku zestawu daje 2, brakujacy plik zestawu daje 127, przerwanie
#     sygnalem daje 128+N. Zestaw, ktory NIE WYSTARTOWAL, nie zmierzyl
#     niczego - a "brak wyniku musi byc czerwony" tak samo jak przy awarii
#     generatora wyzej. Kod 4 jest CELOWO inny od 1 (czerwien zmierzonej
#     proby) i od 2 (awaria generatora): trzy niezalezne powody czerwieni
#     kroku 3g maja sie dac rozroznic w kodzie wyjscia, nie tylko w
#     dzienniku. Bramka dopisuje do dziennika LICZBE i SCIEZKE LOGU, a
#     znacznika dobowego ani skrotu NIE zapisuje - inaczej zestaw, ktory
#     sie nie uruchomil, wyciszalby wlasne uruchomienie do konca doby i
#     zostawial slad, ze przyrzad zostal udowodniony.
#
# Skan podatnosci (generator, skaner, LICZBA podatnosci) NIGDY nie wchodzi
# tutaj - ta funkcja w ogole nie przyjmuje ich kodu jako argumentu, bo
# w Zalaczniku 1 nie ma kryterium podatnosciowego.
sbom_kod_kroku() {
  local kod_test="$1" proba_biegla="$2"
  if [[ "$proba_biegla" != "tak" ]]; then
    echo 0
    return 0
  fi
  if [[ "$kod_test" -eq 1 ]]; then
    echo 1
    return 0
  fi
  # Dopiero TU domyslnym wynikiem przestaje byc zero: zielen nalezy sie
  # WYLACZNIE kodom, ktore zestaw prob wypisal SAM (0 zielono, 3 nie
  # zmierzyl konca). Wszystko pozostale jest awaria przyrzadu - patrz
  # komentarz nad funkcja.
  if [[ "$kod_test" -eq 0 || "$kod_test" -eq 3 ]]; then
    echo 0
    return 0
  fi
  echo 4
  return 0
}

# sbom_kod_kroku_ostateczny KOD_SBOM_GEN KOD_TEST_SBOM PROBA_LOGIKI_BIEGLA
#
# Laczy DWA niezalezne zrodla czerwieni kroku 3g w JEDNA kontrybucje do kodu
# wyjscia calej bramki - to jest funkcja, ktora bramka-hosta.sh (i ten test)
# naprawde ma wywolywac, NIE sbom_kod_kroku powyzej wprost.
#
#   KOD_SBOM_GEN         = kod wyjscia sbom_uruchom_generator (0 = generator
#                           zadzialal, != 0 = generator NIE zadzialal).
#   KOD_TEST_SBOM         = jak w sbom_kod_kroku.
#   PROBA_LOGIKI_BIEGLA   = jak w sbom_kod_kroku.
#
# KOD_SBOM_GEN != 0 to AWARIA PRZYRZADU (generator nie wystartowal / docker
# cp sie nie udal / plik wyjsciowy pusty / zero skladnikow - patrz
# sbom_uruchom_generator), NIE wartosc pomiaru - takiego przyrzadu nie da
# sie zmierzyc, wiec NIE WOLNO mu zostawic bramki zielonej. Dlatego ten
# warunek wygrywa NAJPIERW, NIEZALEZNIE od PROBA_LOGIKI_BIEGLA i od listy
# progowej: "wynik pomiaru moze byc dowolny, brak wyniku musi byc czerwony".
# Zwraca 2 w tym przypadku (odrozniony od 1 = czerwien testu wlasnej logiki
# nizej, zeby dwa niezalezne powody czerwieni dalo sie rozroznic w kodzie
# wyjscia, nie tylko w dzienniku).
#
# Gdy generator zadzialal (KOD_SBOM_GEN=0), reszta idzie DOKLADNIE tak jak
# do tej pory - patrz sbom_kod_kroku. Liczba skladnikow i liczba podatnosci
# (skan) NIE wchodza tutaj w zadnym przypadku - ani ta funkcja, ani
# sbom_kod_kroku, ktora wola, nie przyjmuja ich jako wejscia (Zalacznik 1
# nie ma kryterium podatnosciowego) - to tego nie zmieniamy.
sbom_kod_kroku_ostateczny() {
  local kod_gen="$1" kod_test="$2" proba_biegla="$3"
  if [[ "$kod_gen" -ne 0 ]]; then
    echo 2
    return 0
  fi
  sbom_kod_kroku "$kod_test" "$proba_biegla"
}
