#!/usr/bin/env bash
# Test P5: "zmienne zamiast stalych" - kopie_pg_dump i kopie_pg_policz_wiersze
# (deploy/prod/lib/wspolne.sh) MAJA przekazywac PROJEKT/UZYTKOWNIK/BAZA z
# argumentow (czyli z konfiguracji wolajacego) do `docker compose exec`, a nie
# miec ktorejkolwiek z tych wartosci wpisanej na sztywno.
#
# Metoda: ATRAPA `docker` podstawiona na PATH (nie prawdziwy stos - to jest
# test PRZEKAZYWANIA PARAMETROW, nie test prawdziwego polaczenia z baza).
# Atrapa zapisuje KAZDE swoje wywolanie (wszystkie argumenty, jeden wiersz na
# wywolanie) do pliku i odpowiada wartosciami, ktore test potem porownuje.
# Uzyte tu nazwy uzytkownika/bazy/projektu SA CELOWO inne niz jakiekolwiek
# domyslne w repo ("niepodzielni", "psychon-prod") - zeby zgodnosc nie
# wynikala przypadkiem z pokrywajacej sie wartosci domyslnej.
set -uo pipefail

TU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$TU/../.." && pwd)"
# shellcheck source=deploy/prod/lib/wspolne.sh
source "$REPO_ROOT/deploy/prod/lib/wspolne.sh"

KATALOG_ATRAPY="$(mktemp -d)"
PLIK_WYWOLAN="$(mktemp)"
PLIK_ZRZUTU="$(mktemp)"
trap 'rm -rf "$KATALOG_ATRAPY"; rm -f "$PLIK_WYWOLAN" "$PLIK_ZRZUTU"' EXIT

cat > "$KATALOG_ATRAPY/docker" <<EOF_ATRAPA
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$PLIK_WYWOLAN"
if printf '%s' "\$*" | grep -q " pg_dump "; then
  printf 'ZAWARTOSC-ATRAPY-ZRZUTU\n'
  exit 0
fi
if printf '%s' "\$*" | grep -q " psql "; then
  printf '17\n'
  exit 0
fi
exit 1
EOF_ATRAPA
chmod +x "$KATALOG_ATRAPY/docker"

PROJEKT_TESTOWY="projekt-p5-atrapa"
UZYTKOWNIK_TESTOWY="uzytkownik-p5-atrapa"
BAZA_TESTOWA="baza-p5-atrapa"
TABELA_TESTOWA="tabela-p5-atrapa"

NIEZALICZONE=0

echo "=== 1 kopie_pg_dump przekazuje PROJEKT/UZYTKOWNIK/BAZA z argumentow ==="
: > "$PLIK_WYWOLAN"
if PATH="$KATALOG_ATRAPY:$PATH" kopie_pg_dump "$PROJEKT_TESTOWY" "$UZYTKOWNIK_TESTOWY" "$BAZA_TESTOWA" "$PLIK_ZRZUTU"; then
  echo "  kopie_pg_dump: EXIT=0"
else
  echo "  kopie_pg_dump: EXIT!=0 - WYNIK: NIEZALICZONY"
  NIEZALICZONE=$((NIEZALICZONE + 1))
fi
echo "  wywolanie atrapy docker:"
cat "$PLIK_WYWOLAN" | sed 's/^/    /'
NIEZAL_1=0
grep -q -- "-p $PROJEKT_TESTOWY " "$PLIK_WYWOLAN" || { echo "  WYNIK: NIEZALICZONY - projekt nie trafil do wywolania"; NIEZAL_1=1; }
grep -q -- "-U $UZYTKOWNIK_TESTOWY " "$PLIK_WYWOLAN" || { echo "  WYNIK: NIEZALICZONY - uzytkownik nie trafil do wywolania"; NIEZAL_1=1; }
grep -q -- " $BAZA_TESTOWA\$" "$PLIK_WYWOLAN" || { echo "  WYNIK: NIEZALICZONY - nazwa bazy nie trafila do wywolania"; NIEZAL_1=1; }
if [ -f "$PLIK_ZRZUTU" ] && grep -q "ZAWARTOSC-ATRAPY-ZRZUTU" "$PLIK_ZRZUTU"; then
  echo "  plik zrzutu zapisany z odpowiedzia atrapy"
else
  echo "  WYNIK: NIEZALICZONY - plik zrzutu nie ma oczekiwanej zawartosci"
  NIEZAL_1=1
fi
if [ "$NIEZAL_1" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo "=== 2 kopie_pg_policz_wiersze przekazuje PROJEKT/UZYTKOWNIK/BAZA/TABELA z argumentow ==="
: > "$PLIK_WYWOLAN"
LICZBA="$(PATH="$KATALOG_ATRAPY:$PATH" kopie_pg_policz_wiersze "$PROJEKT_TESTOWY" "$UZYTKOWNIK_TESTOWY" "$BAZA_TESTOWA" "$TABELA_TESTOWA")"
KOD_LICZBY=$?
echo "  kopie_pg_policz_wiersze: '$LICZBA' (EXIT=$KOD_LICZBY, oczekiwano '17' i 0)"
echo "  wywolanie atrapy docker:"
cat "$PLIK_WYWOLAN" | sed 's/^/    /'
NIEZAL_2=0
[ "$KOD_LICZBY" -eq 0 ] || { echo "  WYNIK: NIEZALICZONY - EXIT!=0"; NIEZAL_2=1; }
[ "$LICZBA" = "17" ] || { echo "  WYNIK: NIEZALICZONY - oczekiwano '17'"; NIEZAL_2=1; }
grep -q -- "-p $PROJEKT_TESTOWY " "$PLIK_WYWOLAN" || { echo "  WYNIK: NIEZALICZONY - projekt nie trafil do wywolania"; NIEZAL_2=1; }
grep -q -- "-U $UZYTKOWNIK_TESTOWY " "$PLIK_WYWOLAN" || { echo "  WYNIK: NIEZALICZONY - uzytkownik nie trafil do wywolania"; NIEZAL_2=1; }
grep -q -- "-d $BAZA_TESTOWA " "$PLIK_WYWOLAN" || { echo "  WYNIK: NIEZALICZONY - nazwa bazy nie trafila do wywolania"; NIEZAL_2=1; }
grep -q -- "from ${TABELA_TESTOWA}\$" "$PLIK_WYWOLAN" || { echo "  WYNIK: NIEZALICZONY - nazwa tabeli nie trafila do zapytania"; NIEZAL_2=1; }
if [ "$NIEZAL_2" -eq 1 ]; then NIEZALICZONE=$((NIEZALICZONE + 1)); else echo "  WYNIK: ZALICZONY"; fi

echo
echo "=== PODSUMOWANIE ==="
echo "NIEZALICZONE=$NIEZALICZONE"
[ "$NIEZALICZONE" -eq 0 ] && exit 0 || exit 1
