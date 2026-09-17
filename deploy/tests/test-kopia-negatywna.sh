#!/usr/bin/env bash
# Test odtworzenia probnego (deploy/prod/odtworzenie-probne.sh) - kontrola
# POZYTYWNA i NEGATYWNA, obie na WLASNYM, jednorazowym kontenerze zrodlowym
# (nie na stosie projektu - to jest test skryptu, nie odbior na prawdziwych
# danych, ktory idzie osobno na stosie z zablokowanym slotem).
#
# Przypadek 1 (kontrola pozytywna): pelny, nieuszkodzony zrzut -> odtworzenie
# konczy sie EXIT=0 i liczby wierszy sie zgadzaja. Bez tego przypadku
# przypadek 2 nizej mogloby "zaliczac sie" nawet gdyby skrypt ZAWSZE zwracal
# blad - kontrola negatywna bez pozytywnej nie dowodzi niczego.
# Przypadek 2 (kontrola negatywna, P4): TEN SAM zrzut z uciety koncem pliku ->
# odtworzenie MA zglosic blad (EXIT != 0) i NIE MA nigdzie napisac "OK".
set -uo pipefail

TU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$TU/../.." && pwd)"
SKRYPT_ODTWORZENIA="$REPO_ROOT/deploy/prod/odtworzenie-probne.sh"

if ! command -v docker >/dev/null 2>&1; then
  echo "=== test-kopia-negatywna ==="
  echo "  WYNIK: NIE ZMIERZONO - brak docker w PATH"
  exit 3
fi

KATALOG="$(mktemp -d)"
NAZWA_ZRODLA="psychon-test-zrodlo-$$"
sprzataj() {
  docker rm -f "$NAZWA_ZRODLA" >/dev/null 2>&1 || true
  rm -rf "$KATALOG"
}
trap sprzataj EXIT

NIEZALICZONE=0

echo "=== 1 przygotowanie: kontener zrodlowy z 3 wierszami w tabeli testowej ==="
docker run -d --name "$NAZWA_ZRODLA" --network none \
  -e POSTGRES_PASSWORD=test-tymczasowe -e POSTGRES_USER=test -e POSTGRES_DB=test \
  postgres:17 >/dev/null

GOTOWY=0
for _ in $(seq 1 30); do
  if docker exec "$NAZWA_ZRODLA" pg_isready -U test >/dev/null 2>&1; then
    GOTOWY=1
    break
  fi
  sleep 1
done
if [ "$GOTOWY" -ne 1 ]; then
  echo "  WYNIK: NIE ZMIERZONO - kontener zrodlowy nie osiagnal gotowosci"
  exit 3
fi

docker exec "$NAZWA_ZRODLA" psql -U test -d test -c \
  "create table t (id int); insert into t values (1),(2),(3);" >/dev/null

docker exec "$NAZWA_ZRODLA" pg_dump -U test -Fc test > "$KATALOG/pelny.dump"
ROZMIAR_PELNY="$(stat -c%s "$KATALOG/pelny.dump")"
echo "  zrzut zrodlowy: $ROZMIAR_PELNY B"
printf 't 3\n' > "$KATALOG/pelny.liczby"

if [ "$ROZMIAR_PELNY" -lt 200 ]; then
  echo "  WYNIK: NIEZALICZONY - zrzut zrodlowy podejrzanie maly ($ROZMIAR_PELNY B), test niewiarygodny"
  NIEZALICZONE=$((NIEZALICZONE + 1))
fi

echo "=== 2 kontrola POZYTYWNA: odtworzenie pelnego, nieuszkodzonego zrzutu ==="
WYJSCIE_POZYTYWNE="$(bash "$SKRYPT_ODTWORZENIA" "$KATALOG/pelny.dump" "$KATALOG/pelny.liczby" test test 2>&1)"
KOD_POZYTYWNY=$?
# shellcheck disable=SC2001 # zamiana kazdego WIERSZA (nie calego lancucha) - podstawienie parametru bash tego nie robi
echo "$WYJSCIE_POZYTYWNE" | sed 's/^/  ! /'
echo "  EXIT=$KOD_POZYTYWNY (oczekiwano 0)"
NIEZAL_POZ=0
[ "$KOD_POZYTYWNY" -eq 0 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano EXIT=0 na nieuszkodzonym zrzucie"; NIEZAL_POZ=1; }
if ! printf '%s' "$WYJSCIE_POZYTYWNE" | grep -q "odtworzenie probne: OK"; then
  echo "  WYNIK: NIEZALICZONY - brak komunikatu OK mimo poprawnego odtworzenia"
  NIEZAL_POZ=1
fi
if [ "$NIEZAL_POZ" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 3 kontrola NEGATYWNA (P4): ten sam zrzut z uciety koncem pliku ==="
UCIETY_ROZMIAR=$(( ROZMIAR_PELNY - 200 ))
if [ "$UCIETY_ROZMIAR" -le 0 ]; then
  echo "  WYNIK: NIEZALICZONY - zrzut zrodlowy za maly, zeby uciac 200 B"
  NIEZALICZONE=$((NIEZALICZONE + 1))
else
  head -c "$UCIETY_ROZMIAR" "$KATALOG/pelny.dump" > "$KATALOG/ucieta.dump"
  echo "  ucieto z $ROZMIAR_PELNY B do $UCIETY_ROZMIAR B"
  WYJSCIE_NEGATYWNE="$(bash "$SKRYPT_ODTWORZENIA" "$KATALOG/ucieta.dump" "$KATALOG/pelny.liczby" test test 2>&1)"
  KOD_NEGATYWNY=$?
  # shellcheck disable=SC2001 # zamiana kazdego WIERSZA (nie calego lancucha) - podstawienie parametru bash tego nie robi
  echo "$WYJSCIE_NEGATYWNE" | sed 's/^/  ! /'
  echo "  EXIT=$KOD_NEGATYWNY (oczekiwano != 0)"
  NIEZAL_NEG=0
  [ "$KOD_NEGATYWNY" -ne 0 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano EXIT != 0 na uszkodzonym zrzucie, dostalem 0"; NIEZAL_NEG=1; }
  if printf '%s' "$WYJSCIE_NEGATYWNE" | grep -q "odtworzenie probne: OK"; then
    echo "  WYNIK: NIEZALICZONY - skrypt zglosil OK na uszkodzonym zrzucie"
    NIEZAL_NEG=1
  fi
  if [ "$NIEZAL_NEG" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi
fi

echo "=== 4 plik liczb PUSTY - EXIT!=0, brak 'OK' ==="
: > "$KATALOG/pusty.liczby"
WYJSCIE_PUSTY="$(bash "$SKRYPT_ODTWORZENIA" "$KATALOG/pelny.dump" "$KATALOG/pusty.liczby" test test 2>&1)"
KOD_PUSTY=$?
# shellcheck disable=SC2001 # zamiana kazdego WIERSZA (nie calego lancucha) - podstawienie parametru bash tego nie robi
echo "$WYJSCIE_PUSTY" | sed 's/^/  ! /'
echo "  EXIT=$KOD_PUSTY (oczekiwano != 0)"
NIEZAL_PUSTY=0
[ "$KOD_PUSTY" -ne 0 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano EXIT != 0 dla pustego pliku liczb"; NIEZAL_PUSTY=1; }
if printf '%s' "$WYJSCIE_PUSTY" | grep -q "odtworzenie probne: OK"; then
  echo "  WYNIK: NIEZALICZONY - skrypt zglosil OK mimo pustego pliku liczb"
  NIEZAL_PUSTY=1
fi
if [ "$NIEZAL_PUSTY" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 5 plik liczb BRAKUJACY - EXIT!=0, brak 'OK' ==="
WYJSCIE_BRAK="$(bash "$SKRYPT_ODTWORZENIA" "$KATALOG/pelny.dump" "$KATALOG/nie-istnieje.liczby" test test 2>&1)"
KOD_BRAK=$?
# shellcheck disable=SC2001 # zamiana kazdego WIERSZA (nie calego lancucha) - podstawienie parametru bash tego nie robi
echo "$WYJSCIE_BRAK" | sed 's/^/  ! /'
echo "  EXIT=$KOD_BRAK (oczekiwano != 0)"
NIEZAL_BRAK=0
[ "$KOD_BRAK" -ne 0 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano EXIT != 0 dla brakujacego pliku liczb"; NIEZAL_BRAK=1; }
if printf '%s' "$WYJSCIE_BRAK" | grep -q "odtworzenie probne: OK"; then
  echo "  WYNIK: NIEZALICZONY - skrypt zglosil OK mimo brakujacego pliku liczb"
  NIEZAL_BRAK=1
fi
if [ "$NIEZAL_BRAK" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 6 domyslny UZYTKOWNIK/BAZA odtworzenia dzialaja na kopii z INNA rola (nazwa jak w domyslnej konfiguracji kopii - 'niepodzielni') ==="
NAZWA_ZRODLA_R6="psychon-test-zrodlo-r6-$$"
docker run -d --name "$NAZWA_ZRODLA_R6" --network none \
  -e POSTGRES_PASSWORD=test-tymczasowe -e POSTGRES_USER=niepodzielni -e POSTGRES_DB=niepodzielni \
  postgres:17 >/dev/null
GOTOWY_R6=0
for _ in $(seq 1 30); do
  if docker exec "$NAZWA_ZRODLA_R6" pg_isready -U niepodzielni >/dev/null 2>&1; then
    GOTOWY_R6=1
    break
  fi
  sleep 1
done
NIEZAL_R6=0
if [ "$GOTOWY_R6" -ne 1 ]; then
  echo "  WYNIK: NIE ZMIERZONO - kontener zrodlowy R6 nie osiagnal gotowosci"
else
  docker exec "$NAZWA_ZRODLA_R6" psql -U niepodzielni -d niepodzielni -c \
    "create table t (id int); insert into t values (1),(2),(3),(4);" >/dev/null
  docker exec "$NAZWA_ZRODLA_R6" pg_dump -U niepodzielni -Fc niepodzielni > "$KATALOG/r6.dump"
  printf 't 4\n' > "$KATALOG/r6.liczby"
  # BEZ trzeciego/czwartego argumentu - DOMYSLNY uzytkownik/baza ("odtworzenie"),
  # rozne od roli w zrzucie ("niepodzielni") - to jest dokladnie scenariusz R6.
  WYJSCIE_R6="$(bash "$SKRYPT_ODTWORZENIA" "$KATALOG/r6.dump" "$KATALOG/r6.liczby" 2>&1)"
  KOD_R6=$?
  # shellcheck disable=SC2001 # zamiana kazdego WIERSZA (nie calego lancucha) - podstawienie parametru bash tego nie robi
  echo "$WYJSCIE_R6" | sed 's/^/  ! /'
  echo "  EXIT=$KOD_R6 (oczekiwano 0, mimo ze zrzut niesie inna role niz domyslny uzytkownik odtworzenia)"
  [ "$KOD_R6" -eq 0 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano EXIT=0 z domyslnymi nazwami"; NIEZAL_R6=1; }
  if ! printf '%s' "$WYJSCIE_R6" | grep -q "odtworzenie probne: OK"; then
    echo "  WYNIK: NIEZALICZONY - brak komunikatu OK"
    NIEZAL_R6=1
  fi
fi
docker rm -f "$NAZWA_ZRODLA_R6" >/dev/null 2>&1 || true
if [ "$NIEZAL_R6" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo
echo "=== PODSUMOWANIE ==="
echo "NIEZALICZONE=$NIEZALICZONE"
[ "$NIEZALICZONE" -eq 0 ] && exit 0 || exit 1
