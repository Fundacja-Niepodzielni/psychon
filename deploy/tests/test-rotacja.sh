#!/usr/bin/env bash
# Test rotacji kopii (deploy/prod/lib/wspolne.sh: kopie_rotuj).
#
# Rotacja liczy WIEK PLIKU (dni od dzisiaj wg daty w nazwie), NIE liczbe
# plikow - dwie kopie tego samego dnia nie maja skracac retencji pozostalych.
#
# Czesc A: 16 spreparowanych plikow z datami z ostatnich 16 dni (jeden -
# najnowszy - ma date DZISIEJSZA), retencja 14 dni. Oczekiwane: plik w wieku
# dokladnie 14 dni JESZCZE zostaje (14 <= 14), zostaje usuniety TYLKO plik w
# wieku 15 dni (15 > 14) - wiec zostaje 15 z 16 plikow, nie 14.
# Czesc B: dwa pliki, jeden datowany na 13 dni wstecz, drugi na 15 dni wstecz,
# BEZ zadnych innych plikow w katalogu (zeby liczba plikow nie mogla wplynac
# na wynik) - 13-dniowy ma zostac, 15-dniowy ma zostac usuniety.
set -uo pipefail

TU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$TU/../.." && pwd)"
# shellcheck source=deploy/prod/lib/wspolne.sh
source "$REPO_ROOT/deploy/prod/lib/wspolne.sh"

KATALOG="$(mktemp -d)"
PLIK_LOG="$(mktemp)"
trap 'rm -rf "$KATALOG"; rm -f "$PLIK_LOG"' EXIT

NIEZALICZONE=0

data_wstecz() {
  date -d "-${1} day" '+%Y%m%d' 2>/dev/null || date -v-"${1}"d '+%Y%m%d' 2>/dev/null
}

# --- CZESC A: przygotowanie - 16 plikow z datami z ostatnich 16 dni (0..15 dni wstecz) ---
for I in $(seq 0 15); do
  DATA="$(data_wstecz "$I")"
  NAZWA="psychon-baza-${DATA}-120000.dump"
  printf 'zawartosc probna %s\n' "$I" > "$KATALOG/$NAZWA"
done
DZISIAJ="$(date '+%Y%m%d')"

LICZBA_PRZED="$(find "$KATALOG" -maxdepth 1 -type f -name 'psychon-baza-*.dump' | wc -l)"
echo "=== 1 przed rotacja: liczba plikow ==="
echo "  plikow: $LICZBA_PRZED (oczekiwano 16)"
if [ "$LICZBA_PRZED" -ne 16 ]; then
  echo "  WYNIK: NIEZALICZONY - przygotowanie nie dalo 16 plikow"
  NIEZALICZONE=$((NIEZALICZONE + 1))
else
  echo "  WYNIK: ZALICZONY"
fi

echo "=== 2 lista PRZED (posortowana) ==="
find "$KATALOG" -maxdepth 1 -type f -name 'psychon-baza-*.dump' -printf '%f\n' | sort | sed 's/^/  /'

echo "=== 3 uruchomienie kopie_rotuj (retencja=14 dni) ==="
WYNIK_ROTACJI="$(kopie_rotuj "$KATALOG" "psychon-baza-*.dump" 14 "$PLIK_LOG" "$DZISIAJ")"
echo "  kopie_rotuj zwrocilo: $WYNIK_ROTACJI (ZOSTAJE USUNIETO)"

LICZBA_PO="$(find "$KATALOG" -maxdepth 1 -type f -name 'psychon-baza-*.dump' | wc -l)"
echo "=== 4 po rotacji: liczba plikow (WIEK decyduje, nie liczba - 15 z 16 zostaje) ==="
echo "  plikow: $LICZBA_PO (oczekiwano 15)"
if [ "$LICZBA_PO" -ne 15 ]; then
  echo "  WYNIK: NIEZALICZONY - po rotacji zostalo $LICZBA_PO, nie 15"
  NIEZALICZONE=$((NIEZALICZONE + 1))
else
  echo "  WYNIK: ZALICZONY"
fi

echo "=== 5 lista PO (posortowana) ==="
find "$KATALOG" -maxdepth 1 -type f -name 'psychon-baza-*.dump' -printf '%f\n' | sort | sed 's/^/  /'

echo "=== 6 kopia z dzisiejsza data (${DZISIAJ}) NADAL obecna ==="
PLIK_DZISIAJ="psychon-baza-${DZISIAJ}-120000.dump"
if [ -f "$KATALOG/$PLIK_DZISIAJ" ]; then
  echo "  $PLIK_DZISIAJ istnieje - WYNIK: ZALICZONY"
else
  echo "  $PLIK_DZISIAJ NIE ISTNIEJE - WYNIK: NIEZALICZONY"
  NIEZALICZONE=$((NIEZALICZONE + 1))
fi

echo "=== 7 plik w wieku 14 dni ZOSTAJE (14 <= retencja 14), usuniety jest TYLKO plik w wieku 15 dni ==="
NIEZAL_7=0
NAZWA_14="psychon-baza-$(data_wstecz 14)-120000.dump"
NAZWA_15="psychon-baza-$(data_wstecz 15)-120000.dump"
if [ -f "$KATALOG/$NAZWA_14" ]; then
  echo "  $NAZWA_14 istnieje (zgodnie z oczekiwaniem - wiek 14 dni mieści sie w retencji 14 dni)"
else
  echo "  $NAZWA_14 NIE ISTNIEJE - powinien zostac (rotacja liczy WIEK, nie liczbe plikow)"
  NIEZAL_7=1
fi
if [ -f "$KATALOG/$NAZWA_15" ]; then
  echo "  $NAZWA_15 NADAL ISTNIEJE - powinien byc usuniety (wiek 15 dni > retencja 14 dni)"
  NIEZAL_7=1
else
  echo "  $NAZWA_15 usuniety (zgodnie z oczekiwaniem)"
fi
if [ "$NIEZAL_7" -eq 1 ]; then
  echo "  WYNIK: NIEZALICZONY"
  NIEZALICZONE=$((NIEZALICZONE + 1))
else
  echo "  WYNIK: ZALICZONY"
fi

echo "=== 8 log rotacji ma dokladnie jeden wiersz usuniecia (jeden plik przekroczyl retencje) ==="
LICZBA_WIERSZY_USUNIECIA="$(grep -c 'rotacja: usunieto' "$PLIK_LOG" || true)"
echo "  wierszy 'rotacja: usunieto' w logu: $LICZBA_WIERSZY_USUNIECIA (oczekiwano 1)"
if [ "$LICZBA_WIERSZY_USUNIECIA" -eq 1 ]; then
  echo "  WYNIK: ZALICZONY"
else
  echo "  WYNIK: NIEZALICZONY"
  NIEZALICZONE=$((NIEZALICZONE + 1))
fi

echo "=== 9 CZESC B: TYLKO dwa pliki - 13 dni i 15 dni - liczba plikow nie moze wplynac na wynik ==="
KATALOG_B="$(mktemp -d)"
PLIK_LOG_B="$(mktemp)"
NAZWA_13_B="psychon-baza-$(data_wstecz 13)-090000.dump"
NAZWA_15_B="psychon-baza-$(data_wstecz 15)-090000.dump"
printf 'plik 13 dni\n' > "$KATALOG_B/$NAZWA_13_B"
printf 'plik 15 dni\n' > "$KATALOG_B/$NAZWA_15_B"
kopie_rotuj "$KATALOG_B" "psychon-baza-*.dump" 14 "$PLIK_LOG_B" "$DZISIAJ" >/dev/null
NIEZAL_9=0
if [ -f "$KATALOG_B/$NAZWA_13_B" ]; then
  echo "  $NAZWA_13_B (13 dni) zostal - ZALICZONY"
else
  echo "  $NAZWA_13_B (13 dni) zostal usuniety - powinien byc w retencji"
  NIEZAL_9=1
fi
if [ -f "$KATALOG_B/$NAZWA_15_B" ]; then
  echo "  $NAZWA_15_B (15 dni) NADAL ISTNIEJE - powinien byc usuniety"
  NIEZAL_9=1
else
  echo "  $NAZWA_15_B (15 dni) zostal usuniety - ZALICZONY"
fi
rm -rf "$KATALOG_B"; rm -f "$PLIK_LOG_B"
if [ "$NIEZAL_9" -eq 1 ]; then
  echo "  WYNIK: NIEZALICZONY"
  NIEZALICZONE=$((NIEZALICZONE + 1))
else
  echo "  WYNIK: ZALICZONY"
fi

echo
echo "=== PODSUMOWANIE ==="
echo "NIEZALICZONE=$NIEZALICZONE"
[ "$NIEZALICZONE" -eq 0 ] && exit 0 || exit 1
