#!/usr/bin/env bash
# DOWOD, nie kod produkcyjny - patrz README.md katalogu nadrzednego.
#
# Uruchamia wszystkie biegi wymagane do pomiaru zachowania kontrola-zrzutu.sh
# (kontrola dodatnia, naruszenie, integralnosc PLIK_PO, klasy relacji
# pominiete przez "pg_dump --data-only", tresc poza blokami COPY, sprzatanie
# kontenera/wolumenu), na jednym, jednorazowym kontenerze postgres:17
# (docker run --rm, bez nazwanego wolumenu, siec wylaczona - "--network
# none"; postgres_fdw laczy sie do samego siebie po interfejsie loopback,
# ktory kontener ma nawet bez sieci zewnetrznej).
#
# Uzycie: uruchom-dowod.sh KATALOG_LOGOW
#   Kazdy krok pisze wlasny plik pod KATALOG_LOGOW - nic nie trafia do
#   repozytorium (ten katalog jest podawany przez wolajacego, spoza drzewa
#   gita, np. katalog tymczasowy).
#
# Kody wyjscia TEGO skryptu (dowodu, nie kontrola-zrzutu.sh):
#   0 = DOWOD ZIELONY - wszystkie biegi zgodne z oczekiwanym kodem.
#   DOWOD_KOD_CZERWONY (patrz nizej) = DOWOD CZERWONY - skrypt DOSZEDL DO
#       KONCA (wszystkie kroki, wlacznie ze sprzataniem, wykonaly sie), ale
#       co najmniej jeden bieg kontrola-zrzutu.sh mial kod inny niz
#       oczekiwany - patrz 00-podsumowanie.txt pod KATALOG_LOGOW.
#   Kazdy INNY kod (np. z "set -e" po nieudanym docker/psql w trakcie
#       przygotowania) jest WYWROTKA SRODOWISKA, nie zmierzonym wynikiem -
#       odrozniona od DOWOD_KOD_CZERWONY wlasnie tym, ze nie jest tym samym
#       kodem.
set -euo pipefail

DOWOD_KOD_CZERWONY=3

KATALOG_LOGOW="${1:?uzycie: uruchom-dowod.sh KATALOG_LOGOW}"
mkdir -p "$KATALOG_LOGOW"

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KONTENER="dowod-kontrola-zrzutu-$$"
OBRAZ="${DOWOD_OBRAZ:-postgres:17}"

# Przyrzad mierzony jest domyslnie ten z tego katalogu - podmienialny PRZEZ
# ZMIENNA SRODOWISKOWA (nie flaga w drzewie), wylacznie po to, zeby dalo sie
# uruchomic KONTROLE NEGATYWNA: podmienic go na atrapke "exit 0" i pokazac, ze
# TEN skrypt (dowod) idzie na czerwono, bo teraz POROWNUJE oczekiwany kod z
# faktycznym (patrz run_kontrola nizej) - a nie tylko zapisuje go do pliku.
SKRYPT_KONTROLA="${DOWOD_SKRYPT_KONTROLA:-$TU/kontrola-zrzutu.sh}"

# Liczba kontenerow i wolumenow PRZED tym biegiem - sprzatanie ponizej ma
# byc ZMIERZONE (te same dwie liczby ponownie na koncu), nie tylko
# "potwierdzone przez brak bledu z docker rm".
KONTENEROW_PRZED="$(docker ps -aq | wc -l | tr -d ' ')"
WOLUMENOW_PRZED="$(docker volume ls -q | wc -l | tr -d ' ')"
echo "dowod: kontenerow PRZED biegiem = $KONTENEROW_PRZED, wolumenow PRZED biegiem = $WOLUMENOW_PRZED"

# "docker run --rm": kontener usuwa sie sam po zatrzymaniu, WRAZ z anonimowym
# wolumenem, ktory Docker tworzy dla niego automatycznie - obraz "postgres:17"
# ma "VOLUME /var/lib/postgresql/data" zadeklarowane W SAMYM OBRAZIE, wiec ten
# wolumen powstaje NAWET BEZ jawnego "-v" w "docker run". "docker rm -fv" w
# trap ponizej (NIE samo "-f") to zapasowe sprzatanie na wypadek przerwania
# skryptu PRZED normalnym zatrzymaniem kontenera - "-v" usuwa TEZ anonimowy
# wolumen, gdyby "--rm" go z jakiegos powodu nie zdazyl.
sprzataj() {
    docker rm -fv "$KONTENER" >/dev/null 2>&1 || true
    KONTENEROW_PO="$(docker ps -aq | wc -l | tr -d ' ')"
    WOLUMENOW_PO="$(docker volume ls -q | wc -l | tr -d ' ')"
    echo "dowod: kontenerow PO biegu = $KONTENEROW_PO, wolumenow PO biegu = $WOLUMENOW_PO"
}
trap sprzataj EXIT

echo "dowod: startuje $KONTENER (obraz $OBRAZ, siec wylaczona)"
docker run -d --rm --name "$KONTENER" --network none \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    -e POSTGRES_DB=dowod -e POSTGRES_USER=dowod \
    "$OBRAZ" >/dev/null

GOTOWA=0
for _ in $(seq 1 60); do
    if docker exec "$KONTENER" psql -U dowod -d dowod -tAc 'select 1' 2>/dev/null | grep -qx 1; then
        GOTOWA=1
        break
    fi
    sleep 1
done
if [ "$GOTOWA" -ne 1 ]; then
    echo "dowod: baza nie odpowiedziala SELECT 1 w 60s" >&2
    exit 2
fi
echo "dowod: baza gotowa"

wykonaj_sql() {
    docker exec -i "$KONTENER" psql -U dowod -d dowod -v ON_ERROR_STOP=1 -f /dev/stdin < "$1"
}

# --- Schemat (kontener ma tez mv + fdw + tabela_zawsze_pusta) ---
wykonaj_sql "$TU/fixtures/schemat-z-klasami-pominietymi.sql" > "$KATALOG_LOGOW/01-schemat.log"

# 27: zrzut TUZ PO SCHEMACIE, PRZED jakimikolwiek danymi - WSZYSTKIE tabele
#     (personel, uczestnicy, tabela_zawsze_pusta) legalnie puste (nigdy nie
#     dostaly wiersza, nie "wyczyszczone") - uzyty nizej jako PLIK_PO w
#     "27-stan0-wszystkie-puste" (kontrola dodatnia bierze inny, brudny plik).
docker exec "$KONTENER" pg_dump -U dowod -d dowod --data-only > "$KATALOG_LOGOW/00-schema-pusty.sql"

# --- Dane brudne (kontener ma tez mv + fdw -> manifest niezerowy) ---
wykonaj_sql "$TU/fixtures/dane-probne.sql" > "$KATALOG_LOGOW/02-dane-probne.log"

# --- Trzy wektory zasiegu parsera (kolumna-w-naglowku-COPY, duzy-obiekt-hex,
#     nazwa-relacji-w-naglowku-COPY) - ZALADOWANE TERAZ, zeby byly obecne w
#     KAZDYM kolejnym zrzucie (PRZED I PO) tak samo, jak byloby w prawdziwej
#     bazie - to pokazuje, ze zasieg jest teraz WIDOCZNY w logu kazdego
#     zwyklego biegu, nie tylko w biegu specjalnie dobranym pod ten dowod. ---
wykonaj_sql "$TU/fixtures/dane-zasieg-parsera.sql" > "$KATALOG_LOGOW/02b-zasieg-parsera.log"

# --- Manifest NIEZEROWY (mv + fdw obecne) ---
docker exec "$KONTENER" psql -U dowod -d dowod -tAc "$(cat "$TU/fixtures/manifest-klas-pominietych.sql")" > "$KATALOG_LOGOW/03-manifest-niezero.txt"

# --- Zrzut PRZED (brudny - kontrola dodatnia), format tekstowy "-F plain" ---
docker exec "$KONTENER" pg_dump -U dowod -d dowod --data-only > "$KATALOG_LOGOW/04-przed.sql"

# 28: TEN SAM stan bazy, zrzucony w formacie "-F custom" (binarny, sygnatura
#     "PGDMP") - dowod, ze przyrzad NAZYWA nieobslugiwany format zamiast
#     milczec pod ogolnym "brak bloku COPY".
docker exec "$KONTENER" pg_dump -U dowod -d dowod --data-only -Fc > "$KATALOG_LOGOW/28-format-custom.dump"

# 29: katalog (symulacja "-F directory", ktory jest katalogiem z wieloma
#     plikami, nie pojedynczym plikiem) - pusty wystarcza, bo przyrzad ma
#     odrzucic PO TYPIE argumentu, PRZED czytaniem zawartosci.
mkdir -p "$KATALOG_LOGOW/29-katalog-falszywy-format"

# --- pg_dump wobec zlej nazwy bazy - MA zakonczyc sie kodem != 0, zlapanym
#     PRZEZ &&, nigdy przez oddzielny "if" po fakcie. Plik po lewej stronie
#     przekierowania powstaje i tak (pusty, 0 B), bo powloka tworzy go PRZED
#     uruchomieniem polecenia - ten plik jest ponizej PODANY kontrola-zrzutu.sh
#     jako PLIK_PO, zeby dowod badal BRAMKE, nie tylko sam pg_dump. ---
{
    if docker exec "$KONTENER" pg_dump -U dowod -d nieistniejaca-baza-dowodu --data-only > "$KATALOG_LOGOW/05-zla-baza.sql" 2>"$KATALOG_LOGOW/05-zla-baza.err"; then
        echo "WYNIK=NIESPODZIEWANE_OK"
    else
        echo "WYNIK=pg_dump_kod=$?"
    fi
} > "$KATALOG_LOGOW/05-pg-dump-zla-baza-wynik.txt"

# --- Czyszczenie (symulacja kroku porzadkujacego) -> WSTAWIA tez wiersze
#     zastepcze, CZYSTE (bez znacznika), zeby "07-po-czysty.sql" pokazywal
#     tabele NIEPUSTE-ale-czyste OBOK "tabela_zawsze_pusta" (legalnie pusta
#     przez caly bieg) - dwa ODREBNE powody zerowej sumy trafien we WSPOLNYM
#     zrzucie, nie jeden. ---
docker exec "$KONTENER" psql -U dowod -d dowod -v ON_ERROR_STOP=1 \
    -c "truncate table personel, uczestnicy restart identity cascade; insert into personel (email, rola) values ('nowy.szef@firma-wewnetrzna.pl', 'kierownik'); insert into uczestnicy (kontakt, notatka) values ('+48 111 111 111', 'wiersz czysty bez znacznika, wstawiony po czyszczeniu');" \
    > "$KATALOG_LOGOW/06-truncate.log"

# --- Izolacja CZTERECH wektorow zasiegu parsera, KAZDY na osobnym zrzucie, do
#     dowodu, ze POZA_COPY>0 i DUZY_OBIEKT_TRAFIENIA>0 kazdy Z OSOBNA
#     podnosza stan do 3 (wada rozstrzygajaca), i ze duzy obiekt zapisany
#     wiecej niz jednym wywolaniem lowrite podnosi stan do 2 (wada trzecia) -
#     bez konfundowania jednego wektoru drugim. Kontener jest mutowany
#     SEKWENCYJNIE (usun wektor A, zrzuc; usun wektor B, dodaj wektor C,
#     zrzuc; ...), zeby kazdy zrzut mial DOKLADNIE jeden z nich. ---

# 24: usuwam duzy obiekt ORAZ tabele z nazwa-relacja-znacznikiem, zalozone
#     przez dane-zasieg-parsera.sql - zostaje TYLKO naglowek COPY z nazwa
#     KOLUMNY niosaca znacznik (sonda_zasiegu).
docker exec "$KONTENER" psql -U dowod -d dowod -v ON_ERROR_STOP=1 \
    -c "select lo_unlink(oid) from pg_largeobject_metadata; drop table \"sonda-relacja-ZNACZNIK-PROBNY-KONTROLA-DODATNIA\";" \
    > "$KATALOG_LOGOW/06b-usun-duzy-obiekt-i-relacje-pierwsza.log"
docker exec "$KONTENER" pg_dump -U dowod -d dowod --data-only > "$KATALOG_LOGOW/24-poza-copy-naglowek-widoczny.sql"

# 25: usuwam TEZ tabele z naglowkiem-kolumna-znacznikiem, potem zakladam NOWY
#     duzy obiekt z trescia-znacznikiem - zostaje TYLKO duzy obiekt.
docker exec "$KONTENER" psql -U dowod -d dowod -v ON_ERROR_STOP=1 \
    -c "drop table sonda_zasiegu;" > "$KATALOG_LOGOW/06c-usun-sonda-zasiegu.log"
docker exec "$KONTENER" psql -U dowod -d dowod -v ON_ERROR_STOP=1 \
    -c "select lo_from_bytea(0, convert_to('duzy-obiekt-ZNACZNIK-PROBNY-KONTROLA-DODATNIA', 'UTF8'));" \
    > "$KATALOG_LOGOW/06d-nowy-duzy-obiekt.log"
docker exec "$KONTENER" pg_dump -U dowod -d dowod --data-only > "$KATALOG_LOGOW/25-duzy-obiekt-widoczny.sql"

# 30: usuwam TEZ ten duzy obiekt, potem ZAKLADAM PONOWNIE tabele, ktorej
#     NAZWA RELACJI (nie kolumny, nie wartosci) niesie znacznik - zostaje
#     TYLKO ten czwarty wektor (inny ksztalt zrodlowy niz 24, choc trafia do
#     tej samej linii naglowka "COPY ...").
docker exec "$KONTENER" psql -U dowod -d dowod -v ON_ERROR_STOP=1 \
    -c "select lo_unlink(oid) from pg_largeobject_metadata;" > "$KATALOG_LOGOW/06h-usun-duzy-obiekt-trzeci.log"
docker exec "$KONTENER" psql -U dowod -d dowod -v ON_ERROR_STOP=1 \
    -c "create table \"sonda-relacja-ZNACZNIK-PROBNY-KONTROLA-DODATNIA\" (id serial primary key, v text); insert into \"sonda-relacja-ZNACZNIK-PROBNY-KONTROLA-DODATNIA\" (v) values ('brak znacznika w tej wartosci');" \
    > "$KATALOG_LOGOW/06i-nowa-relacja-znacznikiem.log"
docker exec "$KONTENER" pg_dump -U dowod -d dowod --data-only > "$KATALOG_LOGOW/30-relacja-widoczna.sql"

# --- Genuinie czysty zrzut PO: wszystkie CZTERY wektory zasiegu parsera
#     usuniete teraz z bazy zrodlowej (nie tylko "nie trafiaja"), zeby
#     "10-stan0-czysty" i "22/23" mierzyly WYLACZNIE to, co same wstrzykuja -
#     "Zachowane: czysty zrzut 0" zostaje prawdziwe takze PO tej naprawie, nie
#     tylko przed nia. ---
docker exec "$KONTENER" psql -U dowod -d dowod -v ON_ERROR_STOP=1 \
    -c "drop table \"sonda-relacja-ZNACZNIK-PROBNY-KONTROLA-DODATNIA\";" > "$KATALOG_LOGOW/06e-usun-duzy-obiekt-drugi.log"
docker exec "$KONTENER" pg_dump -U dowod -d dowod --data-only > "$KATALOG_LOGOW/07-po-czysty.sql"

# 26: duzy obiekt, ktorego tresc "pg_dump --data-only" zapisuje DWOMA
#     wywolaniami lowrite, ze znacznikiem rozdzielonym dokladnie na ich
#     granicy (patrz fixtures/dane-duzy-obiekt-rozciety.sql) - zaden kawalek,
#     zdekodowany z osobna, nie niesie pelnego znacznika.
wykonaj_sql "$TU/fixtures/dane-duzy-obiekt-rozciety.sql" > "$KATALOG_LOGOW/06f-duzy-obiekt-rozciety.log"
docker exec "$KONTENER" pg_dump -U dowod -d dowod --data-only > "$KATALOG_LOGOW/26-duzy-obiekt-rozciety.sql"
docker exec "$KONTENER" psql -U dowod -d dowod -v ON_ERROR_STOP=1 \
    -c "select lo_unlink(oid) from pg_largeobject_metadata;" > "$KATALOG_LOGOW/06g-usun-duzy-obiekt-rozciety.log"

# --- Usuniecie mv + fdw -> manifest ZEROWY (log ma sie roznic od 03) ---
docker exec "$KONTENER" psql -U dowod -d dowod -v ON_ERROR_STOP=1 \
    -c "drop foreign table fdw_uczestnicy; drop server serwer_samoodwolujacy cascade; drop materialized view mv_archiwum_kontaktow;" \
    > "$KATALOG_LOGOW/08-drop-klasy.log"
docker exec "$KONTENER" psql -U dowod -d dowod -tAc "$(cat "$TU/fixtures/manifest-klas-pominietych.sql")" > "$KATALOG_LOGOW/09-manifest-zero.txt"

# --- Artefakty do dowodu integralnosci PLIK_PO (wada rozstrzygajaca:
#     PLIK_PO, ktory NIE jest poprawnym zrzutem, nie moze dac stanu 0) ---
#
# 17: PLIK_PO bez zadnego bloku COPY - smieci niosace wrazliwa wartosc, ale
#     bez struktury zrzutu w ogole (dowod, ze tresc POZA blokiem COPY nie
#     daje ani trafienia, ani cichego zaliczenia).
printf 'to jest smiec, nie zrzut, z adresem jan.kowalski@example.com w tekscie\n' > "$KATALOG_LOGOW/17-smiec-bez-copy.sql"

# 18: PLIK_PO urwany w polowie bloku COPY (brak terminatora "\."). Biore
#     prawdziwy zrzut PRZED i tne go tuz przed pierwszym terminatorem bloku.
TERMINATOR_LINIA="$(grep -n '^\\\.$' "$KATALOG_LOGOW/04-przed.sql" | head -n1 | cut -d: -f1)"
head -n "$((TERMINATOR_LINIA - 1))" "$KATALOG_LOGOW/04-przed.sql" > "$KATALOG_LOGOW/18-urwany-w-copy.sql"

# 22: zrzut PO strukturalnie kompletny, oparty na 07-po-czysty.sql (teraz
#     GENUINIE czysty - oba wektory wyzej juz usuniete z bazy zrodlowej), z
#     JEDNA linia wstrzyknieta POZA blokiem COPY (zaraz za pierwszym
#     terminatorem, nie naglowkiem) - trzeci wektor z tabeli w zleceniu
#     ("wartosc poza blokiem COPY"), izolowany od pozostalych dwoch: dowod, ze
#     TAKA tresc PODNOSI stan do 3 (wada rozstrzygajaca - dawniej dawala
#     stan 0, cicho).
awk '1; /^\\\.$/ && !w { print "-- uwaga-dowod: jan.kowalski@example.com poza blokiem COPY"; w=1 }' \
    "$KATALOG_LOGOW/07-po-czysty.sql" > "$KATALOG_LOGOW/22-poza-copy-wstrzykniete.sql"

# --- Biegow kontrola-zrzutu.sh, kazdy zapisany do wlasnego pliku + kod,
#     TERAZ POROWNANY z kodem OCZEKIWANYM (wada rozstrzygajaca: dawna wersja
#     zapisywala kod do ".kod" i NIGDY go z niczym nie porownywala - atrapa
#     "exit 0" podstawiona pod SKRYPT_KONTROLA konczyla dowod kodem 0 mimo
#     jedenastu blednych wynikow). Bramka idzie na KODZIE PROCESU (docker/
#     bash), nie na "if" po zapisaniu do zmiennej - "&&"/"||" na tej samej
#     linii co samo wywolanie. Kazda niezgodnosc podnosi licznik NIEZGODNYCH -
#     koncowy kod tego skryptu (patrz koniec pliku) niesie ten wynik. ---
PODSUMOWANIE="$KATALOG_LOGOW/00-podsumowanie.txt"
: > "$PODSUMOWANIE"
NIEZGODNYCH=0

run_kontrola() {
    NAZWA="$1"; OCZEKIWANY="$2"; shift 2
    # Kod procesu zlapany PRZEZ "if" na samym wywolaniu (jak reszta tego
    # pliku) - "if polecenie; then...else..." NIE wylacza "set -e" dla tego
    # polecenia i nie wymaga wlasnego "set +e"/"set -e" dookola niego.
    if bash "$SKRYPT_KONTROLA" "$@" > "$KATALOG_LOGOW/$NAZWA.log" 2>&1; then
        FAKTYCZNY=0
    else
        FAKTYCZNY=$?
    fi
    echo "$FAKTYCZNY" > "$KATALOG_LOGOW/$NAZWA.kod"
    if [ "$FAKTYCZNY" -eq "$OCZEKIWANY" ]; then
        WYNIK=OK
    else
        WYNIK=ZLE
        NIEZGODNYCH=$((NIEZGODNYCH + 1))
    fi
    printf '%s oczekiwany=%s faktyczny=%s wynik=%s\n' "$NAZWA" "$OCZEKIWANY" "$FAKTYCZNY" "$WYNIK" >> "$PODSUMOWANIE"
}

run_kontrola "10-stan0-czysty"        0 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/07-po-czysty.sql" "$TU/wzorce-probne.txt"
run_kontrola "11-stan3-naruszenie"    3 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/04-przed.sql"     "$TU/wzorce-probne.txt"
run_kontrola "12-stan2-kontrola-dodatnia-pusta" 2 "$KATALOG_LOGOW/07-po-czysty.sql" "$KATALOG_LOGOW/04-przed.sql" "$TU/wzorce-probne.txt"
run_kontrola "13-stan2-brak-pliku"    2 "$KATALOG_LOGOW/nieistnieje.sql" "$KATALOG_LOGOW/04-przed.sql" "$TU/wzorce-probne.txt"
run_kontrola "14-stan2-brak-argumentow" 2

run_kontrola "15-log-manifest-niezero" 0 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/07-po-czysty.sql" "$TU/wzorce-probne.txt" "$KATALOG_LOGOW/03-manifest-niezero.txt"
run_kontrola "16-log-manifest-zero"    0 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/07-po-czysty.sql" "$TU/wzorce-probne.txt" "$KATALOG_LOGOW/09-manifest-zero.txt"

# --- Integralnosc PLIK_PO niezalezna od PLIK_PRZED: we wszystkich trzech
#     ponizej PLIK_PRZED jest niezmieniony, poprawny zrzut (kontrola dodatnia
#     przechodzi) - psuje sie WYLACZNIE PLIK_PO. ---
run_kontrola "19-stan2-po-pusty"          2 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/05-zla-baza.sql" "$TU/wzorce-probne.txt"
run_kontrola "20-stan2-po-bez-copy"       2 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/17-smiec-bez-copy.sql" "$TU/wzorce-probne.txt"
run_kontrola "21-stan2-po-urwany"         2 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/18-urwany-w-copy.sql" "$TU/wzorce-probne.txt"

# --- Cztery wektory zasiegu parsera, KAZDY W IZOLACJI (patrz sekcja wyzej,
#     zrzuty 24/25/26/30) - wada rozstrzygajaca (POZA_COPY, DUZY_OBIEKT_TRAFIENIA
#     -> 3) i wada trzecia (DUZY_OBIEKT_WIELOKROTNY -> 2, nigdy cicho 0). ---
run_kontrola "23-stan3-poza-copy-widoczne" 3 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/22-poza-copy-wstrzykniete.sql" "$TU/wzorce-probne.txt"
run_kontrola "24-stan3-naglowek-copy"      3 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/24-poza-copy-naglowek-widoczny.sql" "$TU/wzorce-probne.txt"
run_kontrola "25-stan3-duzy-obiekt"        3 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/25-duzy-obiekt-widoczny.sql" "$TU/wzorce-probne.txt"
run_kontrola "26-stan2-duzy-obiekt-rozciety" 2 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/26-duzy-obiekt-rozciety.sql" "$TU/wzorce-probne.txt"
run_kontrola "30-stan3-nazwa-relacji"      3 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/30-relacja-widoczna.sql" "$TU/wzorce-probne.txt"

# --- Trzy dodatkowe wiersze z tabeli zlecenia: format nieobslugiwany (-F
#     custom, -F directory) ma dawac 2 Z NAZWANA PRZYCZYNA (nie milczec), a
#     zrzut TUZ PO SCHEMACIE (wszystkie tabele legalnie puste) ma dawac 0. ---
run_kontrola "27-stan0-wszystkie-puste"    0 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/00-schema-pusty.sql" "$TU/wzorce-probne.txt"
run_kontrola "28-stan2-format-custom"      2 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/28-format-custom.dump" "$TU/wzorce-probne.txt"
run_kontrola "29-stan2-format-directory"   2 "$KATALOG_LOGOW/04-przed.sql" "$KATALOG_LOGOW/29-katalog-falszywy-format" "$TU/wzorce-probne.txt"

echo "dowod: wszystkie biegi zapisane pod $KATALOG_LOGOW"
echo "dowod: kody wyjscia (oczekiwany/faktyczny/wynik), patrz tez $PODSUMOWANIE:"
sed 's/^/  /' "$PODSUMOWANIE"

LICZBA_BIEGOW=18
ZGODNYCH=$((LICZBA_BIEGOW - NIEZGODNYCH))
echo "dowod: zgodnych z oczekiwaniem: $ZGODNYCH/$LICZBA_BIEGOW"
if [ "$NIEZGODNYCH" -gt 0 ]; then
    echo "dowod: DOWOD CZERWONY - $NIEZGODNYCH z $LICZBA_BIEGOW biegow NIEZGODNYCH z oczekiwanym kodem (kod tego skryptu: $DOWOD_KOD_CZERWONY, patrz naglowek)" >&2
    exit "$DOWOD_KOD_CZERWONY"
fi
echo "dowod: DOWOD ZIELONY - $ZGODNYCH/$LICZBA_BIEGOW biegow zgodnych z oczekiwanym kodem"
