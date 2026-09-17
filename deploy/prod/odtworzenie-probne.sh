#!/usr/bin/env bash
# Odtworzenie probne kopii bazy: podnosi PostgreSQL w kontenerze EFEMERYCZNYM
# BEZ SIECI (--network none), odtwarza wskazany plik zrzutu, liczy wiersze w
# tabelach z pliku ".liczby" (zapisanego przez kopia-nocna.sh w chwili kopii)
# i porownuje. Kontener jest usuwany na koniec NIEZALEZNIE od wyniku.
#
# Uzycie: odtworzenie-probne.sh PLIK_BAZY PLIK_LICZB [DB_UZYTKOWNIK] [DB_NAZWA]
#   DB_UZYTKOWNIK/DB_NAZWA domyslnie "odtworzenie" - kontener probny jest
#   calkowicie oddzielny od bazy produkcyjnej, wiec nazwy nie musza sie
#   z nia zgadzac.
#
# Kod wyjscia: 0 tylko wtedy, gdy odtworzenie sie powiodlo I wszystkie liczby
# z PLIK_LICZB zgadzaja sie z policzonymi po odtworzeniu. Kazdy inny przypadek
# (zrzut uszkodzony, plik liczb pusty/brakujacy, rozjazd liczby) konczy sie
# kodem != 0.
set -euo pipefail

# Na Git Bash (Windows) argumenty wygladajace na absolutna sciezke uniksowa
# (np. "/tmp/kopia.dump" przekazywane do `docker cp`/`docker exec`) potrafia
# zostac po cichu przetlumaczone na sciezke Windows PRZED przekazaniem do
# dockera - kontener dostaje wtedy cudzy, nieistniejacy plik. Zmienna ponizej
# wylacza to tlumaczenie; na innych systemach (docelowy host produkcyjny) jest
# nieszkodliwa (nikt jej tam nie czyta).
export MSYS_NO_PATHCONV=1

PLIK_BAZY="${1:?uzycie: odtworzenie-probne.sh PLIK_BAZY PLIK_LICZB [DB_UZYTKOWNIK] [DB_NAZWA]}"
PLIK_LICZB="${2:?uzycie: odtworzenie-probne.sh PLIK_BAZY PLIK_LICZB [DB_UZYTKOWNIK] [DB_NAZWA]}"
UZYTKOWNIK="${3:-odtworzenie}"
BAZA="${4:-odtworzenie}"
OBRAZ="${ODTWORZENIE_OBRAZ:-postgres:17}"

if [ ! -f "$PLIK_BAZY" ]; then
  echo "odtworzenie: plik kopii '$PLIK_BAZY' nie istnieje" >&2
  exit 2
fi
if [ ! -f "$PLIK_LICZB" ]; then
  echo "odtworzenie: plik liczb '$PLIK_LICZB' nie istnieje" >&2
  exit 2
fi
if [ ! -s "$PLIK_LICZB" ]; then
  echo "odtworzenie: plik liczb '$PLIK_LICZB' jest pusty - nie mam z czym porownac" >&2
  exit 2
fi

NAZWA_KONTENERA="psychon-odtworzenie-$$-$RANDOM"

# shellcheck disable=SC2329 # wywolywana przez `trap ... EXIT` ponizej, nie wprost
sprzataj() {
  docker rm -f "$NAZWA_KONTENERA" >/dev/null 2>&1 || true
}
trap sprzataj EXIT

docker run -d --name "$NAZWA_KONTENERA" --network none \
  -e POSTGRES_PASSWORD=odtworzenie-probne-haslo-tymczasowe \
  -e POSTGRES_USER="$UZYTKOWNIK" -e POSTGRES_DB="$BAZA" \
  "$OBRAZ" >/dev/null

# Krotka petla oczekiwania na gotowosc serwera - ograniczona liczba prob
# (bez sieci polaczenie idzie po gniazdzie unixowym wewnatrz kontenera,
# `pg_isready` nie wychodzi na zewnatrz, wiec --network none tego nie blokuje).
GOTOWY=0
for _ in $(seq 1 30); do
  if docker exec "$NAZWA_KONTENERA" pg_isready -U "$UZYTKOWNIK" >/dev/null 2>&1; then
    GOTOWY=1
    break
  fi
  sleep 1
done
if [ "$GOTOWY" -ne 1 ]; then
  echo "odtworzenie: kontener probny nie osiagnal gotowosci w 30 s" >&2
  exit 1
fi

# Plik trafia do kontenera STRUMIENIEM (`docker exec -i ... cat > ...`), nie
# `docker cp` - `docker cp` bierze sciezke HOSTA jako argument, ktora na Git
# Bash (Windows) potrzebuje WLASNIE tego automatycznego tlumaczenia, ktore
# MSYS_NO_PATHCONV wylacza dla drugiej strony wywolania. Strumieniem problem
# znika calkowicie: PLIK_BAZY otwiera bash (nie docker), a do kontenera idzie
# tylko jego zawartosc.
if ! docker exec -i "$NAZWA_KONTENERA" sh -c 'cat > /tmp/kopia.dump' < "$PLIK_BAZY"; then
  echo "odtworzenie: nie udalo sie przeslac pliku kopii do kontenera probnego" >&2
  exit 1
fi

# --no-owner --no-privileges: kontener probny jest calkowicie oddzielny od
# bazy produkcyjnej i jego uzytkownik/baza NIE musza sie nazywac tak samo jak
# w zrodle kopii (UZYTKOWNIK/BAZA maja tu wartosci domyslne "odtworzenie",
# zrzut z P1 niesie role "niepodzielni") - bez tych flag `pg_restore` probuje
# ustawic wlasciciela na role, ktorej w kontenerze probnym nie ma, i konczy
# sie bledem mimo poprawnego zrzutu.
if ! docker exec "$NAZWA_KONTENERA" pg_restore -U "$UZYTKOWNIK" -d "$BAZA" --no-owner --no-privileges /tmp/kopia.dump; then
  echo "odtworzenie: pg_restore zakonczyl sie bledem - kopia '$PLIK_BAZY' jest nieczytelna albo uszkodzona" >&2
  exit 1
fi

NIEZGODNOSCI=0
WCZYTANO_WIERSZY=0
while read -r TABELA OCZEKIWANA; do
  [ -n "$TABELA" ] || continue
  WCZYTANO_WIERSZY=$((WCZYTANO_WIERSZY + 1))
  # `</dev/null` na wszelki wypadek: `docker exec` bez `-i` w niektorych
  # srodowiskach dziedziczy fd 0 procesu wywolujacego, a wewnatrz
  # `while read ... done < PLIK` fd 0 to WLASNIE ten plik - blokada nie
  # kosztuje nic i usuwa ryzyko, ze petla zjadlaby reszte linii.
  # `|| true`: pod `set -e` niezerowy kod zapytania (np. tabela nie istnieje
  # po uszkodzonym odtworzeniu) MA zostac obsluzony NIZEJ jako NIEZGODNOSC
  # (pusta ZMIERZONA != OCZEKIWANA), a nie ubic caly skrypt w tym miejscu.
  ZMIERZONA="$(docker exec "$NAZWA_KONTENERA" psql -U "$UZYTKOWNIK" -d "$BAZA" -tAc "select count(*) from ${TABELA}" 2>/dev/null </dev/null | tr -d '[:space:]')" || true
  if [ "$ZMIERZONA" != "$OCZEKIWANA" ]; then
    echo "odtworzenie: NIEZGODNOSC tabela $TABELA - oczekiwano $OCZEKIWANA, po odtworzeniu $ZMIERZONA" >&2
    NIEZGODNOSCI=$((NIEZGODNOSCI + 1))
  else
    echo "odtworzenie: tabela $TABELA = $ZMIERZONA wierszy (zgodne)"
  fi
done < "$PLIK_LICZB"

if [ "$WCZYTANO_WIERSZY" -eq 0 ]; then
  echo "odtworzenie: plik liczb '$PLIK_LICZB' nie niesie zadnego wiersza do porownania" >&2
  exit 2
fi

if [ "$NIEZGODNOSCI" -ne 0 ]; then
  echo "odtworzenie: $NIEZGODNOSCI niezgodnosci liczby wierszy" >&2
  exit 1
fi

echo "odtworzenie probne: OK, wszystkie liczby wierszy zgodne"
exit 0
