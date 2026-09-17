#!/usr/bin/env bash
# Test kroku "kopia poza hostem" (deploy/prod/lib/wspolne.sh: kopie_cel_zewnetrzny), P6.
#
# Przypadek 1: CEL_ZEWNETRZNY pusty (nieustawiony) -> krok POMINIETY, wpis w
# logu, EXIT=0 (funkcja nie ma zwracac bledu za brak konfiguracji, ktora jest
# opcjonalna).
# Przypadek 2: CEL_ZEWNETRZNY ustawiony na katalog lokalny (atrapa celu, nie
# prawdziwe miejsce poza hostem, ktorego tu nie skonfigurowano) -> plik jest
# skopiowany, a jego suma kontrolna (sha256) jest ROWNA sumie zrodla.
set -uo pipefail

TU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$TU/../.." && pwd)"
# shellcheck source=deploy/prod/lib/wspolne.sh
source "$REPO_ROOT/deploy/prod/lib/wspolne.sh"

KATALOG_ZRODLOWY="$(mktemp -d)"
PLIK_LOG="$(mktemp)"
trap 'rm -rf "$KATALOG_ZRODLOWY" "${CEL_ATRAPA:-}"; rm -f "$PLIK_LOG"' EXIT

NIEZALICZONE=0

PLIK_BAZY="$KATALOG_ZRODLOWY/psychon-baza-20260101-030000.dump"
PLIK_STORAGE="$KATALOG_ZRODLOWY/psychon-storage-20260101-030000.tar.gz"
printf 'zawartosc probna bazy - %s\n' "$RANDOM" > "$PLIK_BAZY"
printf 'zawartosc probna storage - %s\n' "$RANDOM" > "$PLIK_STORAGE"
SUMA_BAZY_PRZED="$(sha256sum "$PLIK_BAZY" | awk '{print $1}')"
SUMA_STORAGE_PRZED="$(sha256sum "$PLIK_STORAGE" | awk '{print $1}')"

echo "=== 1 CEL_ZEWNETRZNY pusty - krok pominiety, EXIT=0 ==="
: > "$PLIK_LOG"
kopie_cel_zewnetrzny "" "$PLIK_LOG" "20260101-030000" "$PLIK_BAZY" "$PLIK_STORAGE"
KOD_PUSTY=$?
echo "  EXIT=$KOD_PUSTY (oczekiwano 0)"
NIEZAL_1=0
[ "$KOD_PUSTY" -eq 0 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano EXIT=0"; NIEZAL_1=1; }
if grep -q "cel poza hostem NIEUSTAWIONY - krok pominiety" "$PLIK_LOG"; then
  echo "  log ma wyrazny wpis o pominieciu:"
  grep "cel poza hostem NIEUSTAWIONY" "$PLIK_LOG" | sed 's/^/    /'
else
  echo "  WYNIK: NIEZALICZONY - brak wpisu w logu o pominietym kroku"
  NIEZAL_1=1
fi
if [ "$NIEZAL_1" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 2 CEL_ZEWNETRZNY ustawiony (atrapa lokalna) - plik skopiowany, skrot rowny ==="
CEL_ATRAPA="$(mktemp -d)"
: > "$PLIK_LOG"
kopie_cel_zewnetrzny "$CEL_ATRAPA" "$PLIK_LOG" "20260101-030000" "$PLIK_BAZY" "$PLIK_STORAGE"
KOD_ATRAPA=$?
echo "  EXIT=$KOD_ATRAPA (oczekiwano 0)"
NIEZAL_2=0
[ "$KOD_ATRAPA" -eq 0 ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano EXIT=0"; NIEZAL_2=1; }

if [ -f "$CEL_ATRAPA/$(basename "$PLIK_BAZY")" ] && [ -f "$CEL_ATRAPA/$(basename "$PLIK_STORAGE")" ]; then
  SUMA_BAZY_PO="$(sha256sum "$CEL_ATRAPA/$(basename "$PLIK_BAZY")" | awk '{print $1}')"
  SUMA_STORAGE_PO="$(sha256sum "$CEL_ATRAPA/$(basename "$PLIK_STORAGE")" | awk '{print $1}')"
  echo "  sha256 bazy    przed=$SUMA_BAZY_PRZED po=$SUMA_BAZY_PO"
  echo "  sha256 storage przed=$SUMA_STORAGE_PRZED po=$SUMA_STORAGE_PO"
  [ "$SUMA_BAZY_PRZED" = "$SUMA_BAZY_PO" ] || { echo "  WYNIK: NIEZALICZONY - suma pliku bazy sie rozjechala"; NIEZAL_2=1; }
  [ "$SUMA_STORAGE_PRZED" = "$SUMA_STORAGE_PO" ] || { echo "  WYNIK: NIEZALICZONY - suma pliku storage sie rozjechala"; NIEZAL_2=1; }
else
  echo "  WYNIK: NIEZALICZONY - plik(i) nie zostaly skopiowane do celu"
  NIEZAL_2=1
fi
if grep -q "skopiowano 2 plik" "$PLIK_LOG"; then
  echo "  log potwierdza skopiowanie:"
  grep "skopiowano" "$PLIK_LOG" | sed 's/^/    /'
else
  echo "  WYNIK: NIEZALICZONY - brak wpisu w logu o skopiowaniu"
  NIEZAL_2=1
fi
if [ "$NIEZAL_2" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo
echo "=== PODSUMOWANIE ==="
echo "NIEZALICZONE=$NIEZALICZONE"
[ "$NIEZALICZONE" -eq 0 ] && exit 0 || exit 1
