#!/usr/bin/env bash
# Test LOGIKI kroku "drzewo po biegu" z deploy/bramka-hosta.sh. Zrodluje DOKLADNIE
# ten sam plik co bramka - deploy/lib/drzewo-po-biegu.sh - i wola jego funkcje na
# spreparowanych wejsciach. Zadnej kopii logiki tutaj: kazda zmiana w bibliotece
# (albo jej cofniecie) jest zmiana tego, co ten test mierzy.
#
# Przypadki sa dobrane tak, zeby rozrozniac TRZY stany, ktore wczesniej zlewaly sie
# do jednego zielonego: czysto / brud / nie zmierzylem. Przypadek 2 jest kontrola
# negatywna samej poprawki: przed 23.09 wracal zerem.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TU/../.." && pwd)"

# shellcheck source=deploy/lib/drzewo-po-biegu.sh
source "$REPO_ROOT/deploy/lib/drzewo-po-biegu.sh"

NIEZALICZONE=0

sprawdz() {  # $1 = opis, $2 = kod oczekiwany, $3 = kod otrzymany
    if [ "$2" -eq "$3" ]; then
        echo "  OK   $1 (kod $3)"
    else
        echo "  BLAD $1: oczekiwano kodu $2, jest $3"
        NIEZALICZONE=$((NIEZALICZONE + 1))
    fi
}

sprawdz_tekst() {  # $1 = opis, $2 = wzorzec, $3 = tekst
    if printf '%s' "$3" | grep -q "$2"; then
        echo "  OK   $1"
    else
        echo "  BLAD $1: w wyjsciu nie ma wzorca \"$2\""
        NIEZALICZONE=$((NIEZALICZONE + 1))
    fi
}

echo "== 1. drzewo czyste"
WY="$(ocen_drzewo_po_biegu "" 0 "")"; KOD=$?
sprawdz "czyste drzewo konczy sie zerem" 0 "$KOD"
sprawdz_tekst "czyste drzewo melduje 0 pozycji" "drzewo po biegu: 0 pozycji" "$WY"

echo "== 2. drzewo brudne (kontrola negatywna poprawki)"
WY="$(ocen_drzewo_po_biegu '?? zostawione.txt
 M backend/composer.json' 0 "")"; KOD=$?
sprawdz "brud czerwieni bieg kodem 6" 6 "$KOD"
sprawdz_tekst "brud melduje liczbe pozycji" "2 pozycji" "$WY"
sprawdz_tekst "brud WYMIENIA zostawiony plik" "zostawione.txt" "$WY"

echo "== 3. git nie wystartowal - stan NIE ZMIERZYLEM"
WY="$(ocen_drzewo_po_biegu "" 128 "fatal: Unable to read current working directory")"; KOD=$?
sprawdz "kod gita przechodzi na wylot" 128 "$KOD"
sprawdz_tekst "melduje NIEZMIERZONE, nie zero pozycji" "NIEZMIERZONE" "$WY"

echo "== 4. dlugi brud - dziennik nie jest zalewany"
DUZO="$(for i in $(seq 1 25); do echo "?? plik-$i.tmp"; done)"
WY="$(ocen_drzewo_po_biegu "$DUZO" 0 "")"; KOD=$?
sprawdz "dlugi brud tez czerwieni kodem 6" 6 "$KOD"
sprawdz_tekst "melduje pelna liczbe" "25 pozycji" "$WY"
sprawdz_tekst "wypisuje najwyzej 10 pozycji i mowi o reszcie" "15 dalszych" "$WY"

echo
if [ "$NIEZALICZONE" -eq 0 ]; then
    echo "test drzewa po biegu: WSZYSTKIE PRZYPADKI ZALICZONE"
    exit 0
fi
echo "test drzewa po biegu: NIEZALICZONYCH $NIEZALICZONE"
exit 1
