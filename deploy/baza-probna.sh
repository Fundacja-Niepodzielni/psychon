#!/usr/bin/env bash
# Baza probna na czas jednego biegu, we WLASNYM klonie.
#
# Do dzisiaj Postgres byl stawiany recznie, przy okazji
# czesto na tym samym porcie i pod ta sama nazwa co sasiedni klon na tej samej
# maszynie - kolizja portu albo nazwy kontenera konczyla sie zgadywaniem,
# czyj bieg wlasnie sie wywalil. Ten skrypt stawia kontener nazwany PO
# KATALOGU KLONU, na porcie ktory wybiera sam Docker (opcja `-p host::port`
# bez podania portu hosta) - dwa klony obok siebie nigdy nie licytuja sie
# o ten sam numer, bo o wybor portu nie decyduje zaden wyscig w tym skrypcie,
# tylko atomowa alokacja po stronie Dockera.
#
# Kontrakt: `baza-probna.sh <polecenie> [argumenty...]`
#   1. stawia Postgresa w kontenerze nazwanym po katalogu klonu,
#   2. czeka na PRAWDZIWE `SELECT 1` (nie na `pg_isready` - `pg_isready`
#      potrafi zameldowac gotowosc w trakcie wewnetrznego restartu, ktory
#      `postgres:17` robi sam podczas pierwszego `initdb`, i to juz raz dalo
#      falszywa zielen),
#   3. laduje schemat (migracje) do swiezej, pustej bazy,
#   4. wystawia zmienne DB_* dla przekazanego polecenia i je uruchamia,
#   5. sprzata WYLACZNIE kontener i jego wlasny (anonimowy) wolumen danych,
#      przez `docker rm -fv`, nigdy `docker volume rm` ani `compose down -v`.
#
# Kod wyjscia tego skryptu to kod wyjscia przekazanego polecenia - sprzatanie
# PO biegu nie moze zamienic czerwieni na zielen. Dlatego kod biegu jest
# lapany natychmiast po samym poleceniu (`KOD_BIEGU=$?` w linii nastepnej),
# a nie przez posredni plik/potok - `polecenie > log; tail log` daje kod
# `tail`, nie polecenia, i to jest dokladnie pulapka, ktorej ten skrypt
# unika.
#
# Zadnego hasla w tym pliku: kontener startuje z POSTGRES_HOST_AUTH_METHOD=
# trust, wiec hasla do bazy probnej po prostu nie ma - nie trzeba go wiec
# nigdzie wpisywac ani przekazywac.
#
# Poza zakresem tego skryptu: `composer install` i plik `.env`.
# Skrypt niczego w `.env` nie czyta i nie zapisuje - zmienne DB_* dla biegu
# dostaje przekazane polecenie WYLACZNIE przez srodowisko procesu, wiec
# nadpisuja to, co ewentualnie lezy w `.env` (Laravel/Dotenv nie nadpisuje
# zmiennych juz ustawionych w prawdziwym srodowisku), a sam plik zostaje
# nietkniety.
#
# `backend/phpunit.xml` wymusza (`force="true"`) tozsamosc bazy prob (nazwa,
# uzytkownik...) na stale - to CELOWE zabezpieczenie domyslnej sciezki prob
# przed przypadkowym trafieniem w zywa baze (i drugi straznik w
# `tests/TestCase.php` porownuje `current_database()` z ta sama deklaracja -
# nazwa spoza niej konczy kazdy test, nie tylko polaczenie). Ten skrypt NIE
# rusza `phpunit.xml` i nie omija zadnego z tych dwoch straznikow -
# `tests/bootstrap.php` (juz w repo, patrz jego wlasne komentarze) sam
# wyjmuje DB_HOST/DB_PORT z tego, co wymusza plik, i bierze je z PRAWDZIWEGO
# srodowiska procesu, zostawiajac tozsamosc (nazwa bazy, uzytkownik) wymuszona.
# Wiec zamiast obchodzic straznikow, ten skrypt daje im dokladnie to, czego
# oczekuja: kontener probny dostaje baze i uzytkownika o TAKICH SAMYCH
# nazwach, jakie deklaruje `phpunit.xml` (czytane STAMTAD, nizej - nie
# przepisane tu na sztywno, zeby nie powstalo drugie zrodlo prawdy), tylko
# fizycznie stoja w izolowanym kontenerze na losowym porcie.
#
# Zadnego ZIELONEGO PODZBIORU "prob bez klucza aplikacji" NIE MA - APP_KEY nie
# wymaga zadnego pliku, tylko tego samego kanalu, ktorym ten skrypt juz podaje
# DB_*: `tests/Feature/ExampleTest.php` bez APP_KEY konczy sie kodem 2
# ("No application encryption key has been specified."), z jednorazowym
# APP_KEY podanym WYLACZNIE przez srodowisko procesu (zaden plik nie
# powstaje) - kodem 0 (zmierzone na wlasnym czubku tej galezi).
#
# Pelna suita w TYM srodowisku jest ROZSTRZYGNIETA, na czerwono - i to NIE
# jest wina tego skryptu ani tej galezi. `php artisan test` z APP_KEY ze
# srodowiska procesu konczy sie kodem 2 na Tests\Feature\H13\
# ConcurrentCertificateTest (bieg 2m27s) - wynik OKRESLONY, nie
# "nierozstrzygniety". Podprobka `--testsuite Unit` daje 171 prob / 143
# zielonych / 28 bledow "Could not generate a test RSA key pair" -
# IDENTYCZNIE z kluczem i bez klucza, a takze na przodku tej galezi (sprint-2,
# 09c98f1) sprzed tego skryptu - pady sa zastane, niezalezne od klucza i od
# tego czubka. Przyczyna tych 28 padow jest NIEUSTALONA: sprawdzone i
# odrzucone zostaly hipotezy braku OpenSSL (brak podpisu
# `error:80000003:system library` w trzech biegach) i wyczerpywania zasobu
# (liczba nie wedrowala: 28/28/28) - zadnej z nich nie wolno tu dopisac bez
# wlasnego pomiaru. (Liczby pelnej suity, `--testsuite Unit` i przodka:
# f4f894c, 26.09.2026 - nie powtorzone w tym biegu.)
set -euo pipefail

# Kody wyjscia WLASNE tego skryptu (zle uzycie/awaria przygotowania) stoja
# CELOWO poza zakresem 0-2, ktorym PHPUnit/`php artisan test` opisuje WYNIK
# BIEGU (0 zielono, 1 nieudane proby, 2 blad/wyjatek biegu). Kod wyjscia
# tego skryptu to kod wyjscia PRZEKAZANEGO polecenia (patrz wyzej) - gdyby
# `KOD_ZLEGO_UZYCIA` tez byl "2", czytajacy nie odroznilby "skrypt wywolany
# zle" od "PHPUnit mial blad", a to jest dokladnie klasa pomylki miedzy
# "nie zmierzylem" i "zmierzylem i jest zle", ktorej ten skrypt ma nie
# powtarzac. 64 = EX_USAGE z konwencji `sysexits`, poza zakresem PHPUnita.
KOD_ZLEGO_UZYCIA=64
KOD_KONTENER_ISTNIEJE=90
KOD_PORTU_NIE_ODCZYTANO=91
KOD_BAZA_NIE_ODPOWIEDZIALA=92
KOD_SCHEMAT_NIE_ZALADOWANY=93

if [ "$#" -eq 0 ]; then
    echo "uzycie: $0 <polecenie> [argumenty...]" >&2
    echo "  (uruchamia polecenie z DB_* wskazujacymi na swieza baze probna)" >&2
    exit "$KOD_ZLEGO_UZYCIA"
fi

KORZEN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ ! -e "$KORZEN/.git" ]; then
    echo "baza-probna: $KORZEN nie wyglada na korzen klonu (brak .git)" >&2
    exit "$KOD_ZLEGO_UZYCIA"
fi
if [ ! -d "$KORZEN/backend" ]; then
    echo "baza-probna: $KORZEN/backend nie istnieje" >&2
    exit "$KOD_ZLEGO_UZYCIA"
fi

# Nazwa kontenera = nazwa katalogu klonu, oczyszczona do znakow ktore Docker
# akceptuje w nazwie. To jest "nazwany po klonie" z wymagania - dwa katalogi
# klonow o roznych nazwach ("strumien-c-baza" i "strumien-c-baza-2") daja
# dwie rozne nazwy kontenerow bez zadnej dodatkowej ksiegowosci.
NAZWA_KLONU="$(printf '%s' "$(basename "$KORZEN")" | tr -c 'A-Za-z0-9_.-' '-')"
KONTENER="baza-probna-${NAZWA_KLONU}"

OBRAZ="${BAZA_PROBNA_OBRAZ:-postgres:17}"
LIMIT_GOTOWOSCI_S="${BAZA_PROBNA_LIMIT_S:-60}"

# Nazwa bazy/uzytkownika: domyslnie CZYTANA z `backend/phpunit.xml` (ten sam
# wpis, ktory ten plik wymusza probom, i ktory `tests/TestCase.php` porownuje
# z zywym polaczeniem) - nie przepisana tu na sztywno, zeby te dwa miejsca
# nie mogly sie rozjechac. Brak pliku albo brak deklaracji nie jest bledem
# tego skryptu (migracje/rollback dzialaja na dowolnej nazwie) - po prostu
# spada do wlasnego, oczywiscie-probnego domyslnego etykietu.
#
# `grep` bez dopasowania konczy sie kodem 1 - pod `set -euo pipefail` samo
# PRZYPISANIE `zmienna="$(ta_funkcja ...)"` ginie tym kodem, zanim ten zapas
# (linia nizej) zdazy zadzialac, bo dla przypisania od komendy powloka liczy
# kod calej substytucji, nie kod funkcji z osobna. Dlatego `|| kod=$?` NA
# WEWNETRZNYM przypisaniu, z jawnym `kod=0` zaraz potem - brak dopasowania
# jest tu oczekiwanym wynikiem "brak deklaracji", nie awaria tej funkcji, a
# funkcja zawsze konczy sie przez `printf` (kod 0), wiec przypisanie u
# wolajacego juz nigdy nie zabije calego skryptu z tego powodu.
_wartosc_env_z_phpunit_xml() {
    local nazwa="$1" plik="$2" wynik="" kod
    if [ -f "$plik" ]; then
        wynik="$(grep -o "<env name=\"${nazwa}\" value=\"[^\"]*\"" "$plik" 2>/dev/null \
            | head -1 \
            | sed -E 's/.*value="([^"]*)"/\1/')" || kod=$?
        kod=0
    fi
    printf '%s' "$wynik"
}
PHPUNIT_XML="$KORZEN/backend/phpunit.xml"
DB_NAZWA_ZADEKLAROWANA="$(_wartosc_env_z_phpunit_xml DB_DATABASE "$PHPUNIT_XML")"
DB_UZYTKOWNIK_ZADEKLAROWANY="$(_wartosc_env_z_phpunit_xml DB_USERNAME "$PHPUNIT_XML")"
DB_NAZWA="${BAZA_PROBNA_DB:-${DB_NAZWA_ZADEKLAROWANA:-niepodzielni_probna}}"
DB_UZYTKOWNIK="${BAZA_PROBNA_USER:-${DB_UZYTKOWNIK_ZADEKLAROWANY:-niepodzielni_probna}}"

if docker ps -a --format '{{.Names}}' | grep -qx "$KONTENER"; then
    echo "baza-probna: kontener $KONTENER juz istnieje - poprzedni bieg w tym" >&2
    echo "  klonie nie posprzatal po sobie; usun go recznie (docker rm -fv $KONTENER)" >&2
    exit "$KOD_KONTENER_ISTNIEJE"
fi

echo "baza-probna: startuje $KONTENER (obraz $OBRAZ)"
# -v BEZ nazwy = anonimowy wolumen przypisany do TEGO kontenera; `docker rm
# -fv` nizej usuwa dokladnie ten wolumen i zaden inny. Zadnego docker build -
# obraz jest ten sam co w docker-compose.yml projektu, tylko pobrany/uzyty,
# nie budowany.
docker run -d \
    --name "$KONTENER" \
    -e POSTGRES_DB="$DB_NAZWA" \
    -e POSTGRES_USER="$DB_UZYTKOWNIK" \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    -v /var/lib/postgresql/data \
    -p "127.0.0.1::5432" \
    "$OBRAZ" >/dev/null

sprzatnij() {
    docker rm -fv "$KONTENER" >/dev/null 2>&1 || true
}
trap sprzatnij EXIT

MAPOWANIE="$(docker port "$KONTENER" 5432/tcp | head -1)"
PORT="${MAPOWANIE##*:}"
if [ -z "$PORT" ]; then
    echo "baza-probna: nie udalo sie odczytac przydzielonego portu z 'docker port'" >&2
    exit "$KOD_PORTU_NIE_ODCZYTANO"
fi
echo "baza-probna: port hosta = $PORT"

# Prawdziwe SELECT 1 w petli, NIE pg_isready. `postgres:17` przy pierwszym
# starcie robi initdb, a potem SAM SIEBIE restartuje - pg_isready melduje
# "accepting connections" w tym oknie, mimo ze serwer za chwile sie zwinie
# i wstanie od nowa. Zapytanie SQL wykonane przez `psql` po prostu nie
# przejdzie, dopoki baza naprawde nie jest gotowa na polaczenia.
GOTOWA=0
KONIEC=$((SECONDS + LIMIT_GOTOWOSCI_S))
while [ "$SECONDS" -lt "$KONIEC" ]; do
    if docker exec "$KONTENER" psql -U "$DB_UZYTKOWNIK" -d "$DB_NAZWA" -tAc 'SELECT 1' 2>/dev/null | grep -qx 1; then
        GOTOWA=1
        break
    fi
    sleep 0.5
done
if [ "$GOTOWA" -ne 1 ]; then
    echo "baza-probna: baza nie odpowiedziala prawdziwym SELECT 1 w ${LIMIT_GOTOWOSCI_S}s" >&2
    exit "$KOD_BAZA_NIE_ODPOWIEDZIALA"
fi
echo "baza-probna: SELECT 1 przeszlo - baza gotowa"

echo "baza-probna: laduje schemat (migracje)"
if ! (
    cd "$KORZEN/backend" \
    && DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT="$PORT" \
       DB_DATABASE="$DB_NAZWA" DB_USERNAME="$DB_UZYTKOWNIK" DB_PASSWORD= DB_URL= \
       php artisan migrate --force --no-interaction
); then
    echo "baza-probna: zaladowanie schematu (migracje) nie powiodlo sie" >&2
    exit "$KOD_SCHEMAT_NIE_ZALADOWANY"
fi

echo "baza-probna: uruchamiam bieg -> $*"
set +e
(
    cd "$KORZEN/backend" \
    && DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT="$PORT" \
       DB_DATABASE="$DB_NAZWA" DB_USERNAME="$DB_UZYTKOWNIK" DB_PASSWORD= DB_URL= \
       "$@"
)
KOD_BIEGU=$?
set -e

echo "baza-probna: bieg zakonczony kodem $KOD_BIEGU - sprzatam $KONTENER"
exit "$KOD_BIEGU"
