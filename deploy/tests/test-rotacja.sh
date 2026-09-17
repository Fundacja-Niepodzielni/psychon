#!/usr/bin/env bash
# Test rotacji kopii (deploy/prod/lib/wspolne.sh: kopie_rotuj).
#
# Przygotowuje 16 spreparowanych plikow z datami z ostatnich 16 dni (jeden z
# nich - najnowszy - ma date DZISIEJSZA) i uruchamia rotacje z limitem 14.
# Sprawdza: przed rotacja 16 plikow, po rotacji 14, plik z dzisiejsza data
# jest obecny i po rotacji, i usuniete sa dokladnie dwa NAJSTARSZE.
set -uo pipefail

TU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$TU/../.." && pwd)"
# shellcheck source=deploy/prod/lib/wspolne.sh
source "$REPO_ROOT/deploy/prod/lib/wspolne.sh"

KATALOG="$(mktemp -d)"
PLIK_LOG="$(mktemp)"
trap 'rm -rf "$KATALOG"; rm -f "$PLIK_LOG"' EXIT

NIEZALICZONE=0

# --- przygotowanie: 16 plikow z datami z ostatnich 16 dni (0..15 dni wstecz) ---
declare -a NAZWY_PRZED=()
for I in $(seq 0 15); do
  DATA="$(date -d "-${I} day" '+%Y%m%d' 2>/dev/null || date -v-"${I}"d '+%Y%m%d' 2>/dev/null)"
  NAZWA="psychon-baza-${DATA}-120000.dump"
  printf 'zawartosc probna %s\n' "$I" > "$KATALOG/$NAZWA"
  NAZWY_PRZED+=("$NAZWA")
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

echo "=== 3 uruchomienie kopie_rotuj (zachowaj=14) ==="
WYNIK_ROTACJI="$(kopie_rotuj "$KATALOG" "psychon-baza-*.dump" 14 "$PLIK_LOG" "$DZISIAJ")"
echo "  kopie_rotuj zwrocilo: $WYNIK_ROTACJI (ZOSTAJE USUNIETO)"

LICZBA_PO="$(find "$KATALOG" -maxdepth 1 -type f -name 'psychon-baza-*.dump' | wc -l)"
echo "=== 4 po rotacji: liczba plikow ==="
echo "  plikow: $LICZBA_PO (oczekiwano 14)"
if [ "$LICZBA_PO" -ne 14 ]; then
  echo "  WYNIK: NIEZALICZONY - po rotacji zostalo $LICZBA_PO, nie 14"
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

echo "=== 7 usuniete to dokladnie dwa NAJSTARSZE (dni 14 i 15 wstecz) ==="
NIEZAL_7=0
for I in 14 15; do
  DATA="$(date -d "-${I} day" '+%Y%m%d' 2>/dev/null || date -v-"${I}"d '+%Y%m%d' 2>/dev/null)"
  NAZWA="psychon-baza-${DATA}-120000.dump"
  if [ -f "$KATALOG/$NAZWA" ]; then
    echo "  $NAZWA NADAL ISTNIEJE - powinien byc usuniety"
    NIEZAL_7=1
  else
    echo "  $NAZWA usuniety (zgodnie z oczekiwaniem)"
  fi
done
if [ "$NIEZAL_7" -eq 1 ]; then
  echo "  WYNIK: NIEZALICZONY"
  NIEZALICZONE=$((NIEZALICZONE + 1))
else
  echo "  WYNIK: ZALICZONY"
fi

echo "=== 8 log rotacji ma wiersz usuniecia dla kazdego z dwoch plikow ==="
LICZBA_WIERSZY_USUNIECIA="$(grep -c 'rotacja: usunieto' "$PLIK_LOG" || true)"
echo "  wierszy 'rotacja: usunieto' w logu: $LICZBA_WIERSZY_USUNIECIA (oczekiwano 2)"
if [ "$LICZBA_WIERSZY_USUNIECIA" -eq 2 ]; then
  echo "  WYNIK: ZALICZONY"
else
  echo "  WYNIK: NIEZALICZONY"
  NIEZALICZONE=$((NIEZALICZONE + 1))
fi

echo
echo "=== PODSUMOWANIE ==="
echo "NIEZALICZONE=$NIEZALICZONE"
[ "$NIEZALICZONE" -eq 0 ] && exit 0 || exit 1
