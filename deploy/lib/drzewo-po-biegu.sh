#!/usr/bin/env bash
# Ocena stanu drzewa PO biegu bramki. Logika mieszka tutaj, a nie w bramce, z tego
# samego powodu co licznik sekretow (deploy/lib/sekrety-licznik.sh): ten sam plik
# zrodluje test deploy/tests/test-bramka-drzewo.sh, wiec test i bramka nie moga sie
# rozjechac, a cofnieta poprawka daje czerwien zamiast cichego zera.
#
# Do 23.09 bramka MIERZYLA brud i go WYPISYWALA, ale kod wyjscia dostawala wylacznie
# wtedy, gdy sam `git status` nie wystartowal. Bieg, ktory zostawil po sobie pliki,
# konczyl sie zielono - a wiersz "drzewo po biegu: 12 pozycji" nie byl przez nic
# czytany. Krok wygladal na wpiety, bo zmienna stala w lancuchu decydujacym; wpiety
# byl tylko dla awarii przyrzadu, nie dla tego, czego mial pilnowac.
#
# Kody: 0 czysto, 6 brud, a gdy git nie wystartowal - jego wlasny kod, bo
# "nie zmierzylem" to trzeci stan przyrzadu i nie wolno go mylic z "zmierzylem,
# jest czysto". Szostka, a nie 4: 1 to zwykla czerwien kroku, 2 i 3 nalezą do
# bramki zdalnej (przygotowanie nieudane / sloty zajete), 4 zajmuje host-slot.sh
# ("cudza tresc slotu"), 7 stoi w tescie monitoringu, 255 przynosi ssh. Kod, ktory
# znaczy dwie rzeczy naraz, kosztuje przy pierwszej czerwieni o 3 nad ranem.
KOD_DRZEWO_BRUD=6

# $1 = tekst `git status --porcelain`, $2 = kod wyjscia gita, $3 = pierwszy wiersz stderr
# Wypisuje wiersz do dziennika na stdout, zwraca kod.
ocen_drzewo_po_biegu() {
    local tekst="$1" kod_gita="$2" blad="${3:-}"
    local brud

    if [ "$kod_gita" -ne 0 ]; then
        echo "drzewo po biegu: NIEZMIERZONE - git EXIT=$kod_gita: $blad"
        return "$kod_gita"
    fi

    brud="$(printf '%s' "$tekst" | grep -c .)"
    if [ "$brud" -eq 0 ]; then
        echo "drzewo po biegu: 0 pozycji"
        return 0
    fi

    # Sama liczba nie wystarcza: czerwien, ktorej nie da sie rozstrzygnac bez wejscia
    # na maszyne bramkowa, kosztuje wiecej niz daje. Dziesiec pozycji to kompromis -
    # dosc, zeby rozpoznac sprawce, za malo, zeby zalac dziennik.
    echo "drzewo po biegu: $brud pozycji - BRUD, bieg zostawil po sobie pliki"
    printf '%s\n' "$tekst" | head -10 | sed 's/^/  ! /'
    if [ "$brud" -gt 10 ]; then
        echo "  ! (i $((brud - 10)) dalszych)"
    fi
    return "$KOD_DRZEWO_BRUD"
}
