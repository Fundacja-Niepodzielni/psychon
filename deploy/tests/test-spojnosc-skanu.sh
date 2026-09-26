#!/usr/bin/env bash
# Proba spojnosci przebiegu skanu jakosci (`sonarcloud.yml`) z przebiegiem prob
# (`ci.yml`). Pilnuje dwoch rzeczy, ktore w obu wypadkach dawaly WYNIK BEZ POMIARU:
#
#   1. Skan liczyl pokrycie takze wtedy, gdy `ci.yml` dla tego samego commita
#      skonczyl sie niepowodzeniem i zadnego raportu nie bylo. Sonar pokazywal
#      wtedy pokrycie nowego kodu 0,0 % i konczyl na zielono - a w zadnym wierszu
#      logu nie stalo, ze to nie jest pomiar, tylko jego brak.
#   2. Oba przebiegi mialy ROZNE filtry sciezek: `ci.yml` pomijal `docs/**` i
#      `*.md`, skan nie pomijal niczego. Push z sama dokumentacja nie tworzyl
#      przebiegu prob, wiec skan czekal na niego pelne 15 minut i czerwienil sie
#      za nic.
#
# Probe uruchamia `ci.yml` (krok "Spojnosc przebiegu skanu"). Proba lezaca w
# drzewie bez wolajacego nie pilnuje niczego - jest to osobna, zapisana wada.
#
# Nogi negatywne nie opisuja zabezpieczenia, tylko je WYCINAJA na kopii plikow i
# sprawdzaja, ze pomiar wtedy czerwienieje. Proba, ktora po usunieciu pilnowanej
# rzeczy nadal jest zielona, nie jest proba.
set -uo pipefail

KORZEN="$(cd "$(dirname "$0")/../.." && pwd)"
ZDANE=0
OBLANE=0

zdaj() { echo "  [OK]     $1"; ZDANE=$((ZDANE + 1)); }
oblej() { echo "  [ZLE]    $1"; OBLANE=$((OBLANE + 1)); }

# --- pomiar 1: warunek przy krokach mierzacych -------------------------------
# Zwraca tresc wiersza `if:` kroku o podanej nazwie. Krok zaczyna sie od
# "  - name: ", konczy przed nastepnym takim wierszem. Brak kroku = pusty napis,
# czyli tez czerwien (a nie ciche przejscie).
warunek_kroku() {
    awk -v szukana="$1" '
        /^[[:space:]]*- name:/ {
            wewnatrz = (index($0, "- name: " szukana) > 0 && length($0) == index($0, "- name: " szukana) + length("- name: " szukana) - 1)
            next
        }
        wewnatrz && /^[[:space:]]*if:/ { sub(/^[[:space:]]*if:[[:space:]]*/, ""); print; exit }
    ' "$2"
}

PLIK_SKANU="$KORZEN/.github/workflows/sonarcloud.yml"
PLIK_CI="$KORZEN/.github/workflows/ci.yml"

sprawdz_warunki() {
    local plik="$1" etykieta="$2" wynik=0 krok warunek
    for krok in "Pobierz raport pokrycia zaplecza" "Pobierz raport pokrycia frontu" "Skan SonarCloud"; do
        warunek="$(warunek_kroku "$krok" "$plik")"
        case "$warunek" in
            *"steps.ci-run.outputs.conclusion == 'success'"*) ;;
            *) echo "        krok [$krok] nie wymaga udanego przebiegu prob: [${warunek:-BRAK KROKU}]"; wynik=1 ;;
        esac
    done
    # Krok, ktory zamienia brak pomiaru w czerwien. Bez niego wszystkie kroki
    # mierzace wypadaja po cichu i job konczy sie zielono.
    if ! grep -q "conclusion != 'success'" "$plik"; then
        echo "        brak kroku czerwieniacego przy nieudanym przebiegu prob"
        wynik=1
    fi
    return $wynik
}

echo "SPOJNOSC SKANU Z PROBAMI - pomiar na drzewie roboczym:"
if sprawdz_warunki "$PLIK_SKANU" "drzewo"; then
    zdaj "kroki mierzace i skan wymagaja UDANEGO przebiegu ci.yml, brak pomiaru jest czerwony"
else
    oblej "skan moze pobiec bez raportow pokrycia - zielone 0,0 % zamiast czerwieni"
fi

# --- nogi negatywne: wytnij mechanizm na kopii -------------------------------
KOPIA="$(mktemp -d)"
trap 'rm -rf "$KOPIA"' EXIT
mkdir -p "$KOPIA/.github/workflows"
cp "$PLIK_SKANU" "$KOPIA/.github/workflows/sonarcloud.yml"
cp "$PLIK_CI" "$KOPIA/.github/workflows/ci.yml"

echo "NOGI NEGATYWNE (mechanizm wyciety na kopii - pomiar MA sczerwieniec):"

# 1. zdjecie warunku z samego skanu
KOPIA_A="$KOPIA/.github/workflows/sonarcloud.yml"
perl -0777 -i -pe "s/(- name: Skan SonarCloud\n        if: env\.SONAR_TOKEN != '')[^\n]*/\$1/" "$KOPIA_A"
if sprawdz_warunki "$KOPIA_A" "kopia" >/dev/null 2>&1; then
    oblej "po zdjeciu warunku ze skanu pomiar nadal zielony - nie pilnuje niczego"
else
    zdaj "zdjecie warunku ze skanu czerwieni pomiar"
fi
cp "$PLIK_SKANU" "$KOPIA_A"

# 2. usuniecie kroku czerwieniacego brak pokrycia
perl -0777 -i -pe "s/      - name: Bez raportow pokrycia nie ma skanu\n(?:.*?\n)*?          exit 1\n\n//" "$KOPIA_A"
if grep -q "Bez raportow pokrycia nie ma skanu" "$KOPIA_A"; then
    oblej "noga negatywna nie wyciela kroku - pomiar ponizej nic nie dowodzi"
elif sprawdz_warunki "$KOPIA_A" "kopia" >/dev/null 2>&1; then
    oblej "po usunieciu kroku czerwieniacego pomiar nadal zielony"
else
    zdaj "usuniecie kroku czerwieniacego brak pokrycia czerwieni pomiar"
fi

echo "─────────────────────────────────────────"
echo "  zdane: $ZDANE   ·   oblane: $OBLANE"
[ "$OBLANE" -eq 0 ]
