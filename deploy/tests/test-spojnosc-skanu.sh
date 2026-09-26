#!/usr/bin/env bash
# Proba spojnosci przebiegu skanu jakosci (`sonarcloud.yml`) z przebiegiem prob
# (`ci.yml`). Pilnuje trzech rzeczy, z ktorych kazda dawala WYNIK BEZ POMIARU:
#
#   1. Skan liczyl pokrycie takze wtedy, gdy `ci.yml` dla tego samego commita
#      skonczyl sie niepowodzeniem i zadnego raportu nie bylo. Sonar pokazywal
#      wtedy pokrycie nowego kodu 0,0 % i konczyl na zielono, a w zadnym wierszu
#      logu nie stalo, ze to nie jest pomiar, tylko jego brak.
#   2. Krok, ktory ma zamienic brak pomiaru w czerwien, musi byc BLOKUJACY.
#      Z `continue-on-error: true` wypisuje ten sam powod i nie czerwieni nic.
#   3. Oba przebiegi mialy ROZNE filtry sciezek: `ci.yml` pomijal `docs/**` i
#      `*.md`, skan nie pomijal niczego. Push z sama dokumentacja nie tworzyl
#      przebiegu prob, wiec skan czekal na niego pelne 15 minut i czerwienil sie
#      za nic.
#
# Probe uruchamia `ci.yml` (krok "Spojnosc przebiegu skanu"). Proba lezaca w
# drzewie bez wolajacego nie pilnuje niczego - jest to osobna, zapisana wada,
# dlatego obecnosc blokujacego wolajacego jest tu jednym z pomiarow.
#
# Pomiar idzie po KROKACH wyliczonych z pliku, nie po tresci calego pliku:
# dopasowanie do calego pliku zaspokaja sie fraza wpisana w komentarz, wiec
# mierzyloby to, co o pliku napisano, a nie to, co plik robi.
#
# Nogi negatywne nie opisuja zabezpieczenia, tylko je WYCINAJA na kopii plikow i
# sprawdzaja, ze pomiar wtedy czerwienieje. Proba, ktora po usunieciu pilnowanej
# rzeczy nadal jest zielona, nie jest proba.
set -uo pipefail

KORZEN="$(cd "$(dirname "$0")/../.." && pwd)"
PLIK_SKANU="$KORZEN/.github/workflows/sonarcloud.yml"
PLIK_CI="$KORZEN/.github/workflows/ci.yml"
ZDANE=0
OBLANE=0

zdaj() { echo "  [OK]     $1"; ZDANE=$((ZDANE + 1)); }
oblej() { echo "  [ZLE]    $1"; OBLANE=$((OBLANE + 1)); }

# Spis krokow, po jednym wierszu: nazwa | tresc-if | czy-konczy-kodem-1 | czy-nieblokujacy
spis_krokow() {
    awk '
        function zamknij() { if (nazwa != "") printf "%s|%s|%d|%d\n", nazwa, warunek, exit1, coe }
        /^      - / {
            zamknij(); nazwa = ""; warunek = ""; exit1 = 0; coe = 0
            if ($0 ~ /^      - name: /) { nazwa = $0; sub(/^      - name: /, "", nazwa) }
            next
        }
        nazwa != "" && /^        if:/ { w = $0; sub(/^        if:[[:space:]]*/, "", w); warunek = w; next }
        nazwa != "" && /^        continue-on-error:[[:space:]]*true/ { coe = 1; next }
        nazwa != "" && /exit 1/ { exit1 = 1 }
        END { zamknij() }
    ' "$1"
}

sprawdz_warunki() {
    local plik="$1" wynik=0 krok wiersz warunek coe znaleziony=0 exit1
    for krok in "Pobierz raport pokrycia zaplecza" "Pobierz raport pokrycia frontu" "Skan SonarCloud"; do
        wiersz="$(spis_krokow "$plik" | awk -F'|' -v n="$krok" '$1 == n')"
        if [ -z "$wiersz" ]; then
            echo "        kroku [$krok] w ogole nie ma"; wynik=1; continue
        fi
        warunek="$(printf '%s' "$wiersz" | cut -d'|' -f2)"
        coe="$(printf '%s' "$wiersz" | cut -d'|' -f4)"
        case "$warunek" in
            *"steps.ci-run.outputs.conclusion == 'success'"*) ;;
            *) echo "        krok [$krok] nie wymaga udanego przebiegu prob"; wynik=1 ;;
        esac
        [ "$coe" = "0" ] || { echo "        krok [$krok] jest nieblokujacy - jego czerwien nic nie znaczy"; wynik=1; }
    done
    while IFS='|' read -r krok warunek exit1 coe; do
        case "$warunek" in *"conclusion != 'success'"*) ;; *) continue ;; esac
        znaleziony=1
        [ "$exit1" = "1" ] || { echo "        krok [$krok] lapie brak pomiaru, ale nie konczy sie kodem 1"; wynik=1; }
        [ "$coe" = "0" ] || { echo "        krok [$krok] lapie brak pomiaru, ale jest nieblokujacy"; wynik=1; }
    done < <(spis_krokow "$plik")
    [ "$znaleziony" = "1" ] || { echo "        zaden KROK nie lapie nieudanego przebiegu prob"; wynik=1; }
    return $wynik
}

sprawdz_wolajacego() {
    local plik="$1" wiersz coe
    wiersz="$(spis_krokow "$plik" | awk -F'|' '$1 == "Spojnosc przebiegu skanu"')"
    [ -n "$wiersz" ] || { echo "        w ci.yml nie ma kroku wolajacego te probe"; return 1; }
    grep -q 'test-spojnosc-skanu.sh' "$plik" || { echo "        krok jest, ale nie wola tego pliku"; return 1; }
    coe="$(printf '%s' "$wiersz" | cut -d'|' -f4)"
    [ "$coe" = "0" ] || { echo "        wolajacy jest nieblokujacy - proba nie zatrzyma niczego"; return 1; }
    return 0
}

filtry_sciezek() {
    awk '
        /^[a-z]/ && !/^on:/ { w_on = 0 }
        /^on:$/ { w_on = 1; next }
        w_on && /^  [a-z_]+:/ { wyzwalacz = $1; sub(/:$/, "", wyzwalacz); w_filtrze = 0; next }
        w_on && /^    paths-ignore:/ { w_filtrze = 1; next }
        w_on && /^    [a-z-]+:/ { w_filtrze = 0; next }
        w_on && w_filtrze && /^      - / { wzorzec = $0; sub(/^      - /, "", wzorzec); print wyzwalacz ":" wzorzec }
    ' "$1"
}

porownaj_filtry() {
    local a b
    a="$(filtry_sciezek "$1" | sort)"
    b="$(filtry_sciezek "$2" | sort)"
    if [ -z "$a" ]; then echo "        w pierwszym pliku nie ma ani jednego wzorca paths-ignore"; return 1; fi
    if [ "$a" != "$b" ]; then echo "        filtry rozne"; return 1; fi
    return 0
}

echo "SPOJNOSC SKANU Z PROBAMI - pomiar na drzewie roboczym:"
if sprawdz_warunki "$PLIK_SKANU"; then
    zdaj "kroki mierzace wymagaja UDANEGO przebiegu prob, a brak pomiaru konczy zadanie kodem 1"
else
    oblej "skan moze pobiec bez raportow pokrycia albo czerwien jest pozorna"
fi
if sprawdz_wolajacego "$PLIK_CI"; then
    zdaj "ci.yml wola te probe krokiem blokujacym"
else
    oblej "proba bez blokujacego wolajacego nie pilnuje niczego"
fi
echo "FILTRY SCIEZEK - oba przebiegi pomijaja to samo:"
if porownaj_filtry "$PLIK_CI" "$PLIK_SKANU"; then
    zdaj "ci.yml i sonarcloud.yml maja identyczne listy paths-ignore"
else
    oblej "filtry sciezek sie rozjezdzaja - push pomijany przez jeden przebieg czerwieni drugi"
fi

KOPIA="$(mktemp -d)"
trap 'rm -rf "$KOPIA"' EXIT
KOPIA_A="$KOPIA/sonarcloud.yml"
KOPIA_CI="$KOPIA/ci.yml"

echo "NOGI NEGATYWNE (mechanizm wyciety na kopii - pomiar MA sczerwieniec):"

noga() {
    local opis="$1"
    shift
    cp "$PLIK_SKANU" "$KOPIA_A"
    cp "$PLIK_CI" "$KOPIA_CI"
    if ! "$@"; then
        oblej "noga [$opis] nie zmienila pliku - pomiar ponizej nic nie dowodzi"
        return
    fi
    if sprawdz_warunki "$KOPIA_A" >/dev/null 2>&1 && sprawdz_wolajacego "$KOPIA_CI" >/dev/null 2>&1 && porownaj_filtry "$KOPIA_CI" "$KOPIA_A" >/dev/null 2>&1; then
        oblej "$opis - pomiar nadal zielony"
    else
        zdaj "$opis - pomiar czerwienieje"
    fi
}

zdejmij_warunek_skanu() {
    perl -0777 -i -pe "s/(- name: Skan SonarCloud\n        if: env\.SONAR_TOKEN != '')[^\n]*/\$1/" "$KOPIA_A"
    spis_krokow "$KOPIA_A" | awk -F'|' '$1 == "Skan SonarCloud" && $2 !~ /success/ { zn = 1 } END { exit !zn }'
}
usun_krok_czerwieniacy() {
    perl -0777 -i -pe "s/      - name: Bez raportow pokrycia nie ma skanu\n(?:.*?\n)*?          exit 1\n\n//" "$KOPIA_A"
    ! grep -q "Bez raportow pokrycia nie ma skanu" "$KOPIA_A"
}
zostaw_sama_fraze() {
    usun_krok_czerwieniacy || return 1
    printf '%s\n' "# wzmianka w komentarzu: conclusion != 'success'" >> "$KOPIA_A"
    grep -q "conclusion != 'success'" "$KOPIA_A"
}
odblokuj_krok_czerwieniacy() {
    perl -0777 -i -pe "s/(      - name: Bez raportow pokrycia nie ma skanu\n)/\$1        continue-on-error: true\n/" "$KOPIA_A"
    spis_krokow "$KOPIA_A" | awk -F'|' '$1 == "Bez raportow pokrycia nie ma skanu" && $4 == 1 { zn = 1 } END { exit !zn }'
}
zdejmij_filtr() {
    perl -0777 -i -pe "s/    paths-ignore:\n      - .docs\/\*\*.\n//" "$KOPIA_A"
    [ "$(grep -c 'paths-ignore' "$KOPIA_A")" -ne 2 ]
}
odblokuj_wolajacego() {
    perl -0777 -i -pe "s/(      - name: Spojnosc przebiegu skanu\n)/\$1        continue-on-error: true\n/" "$KOPIA_CI"
    spis_krokow "$KOPIA_CI" | awk -F'|' '$1 == "Spojnosc przebiegu skanu" && $4 == 1 { zn = 1 } END { exit !zn }'
}

noga "zdjecie warunku ze skanu" zdejmij_warunek_skanu
noga "usuniecie kroku konczacego kodem 1" usun_krok_czerwieniacy
noga "sama fraza w komentarzu zamiast kroku" zostaw_sama_fraze
noga "krok czerwieniacy jako nieblokujacy" odblokuj_krok_czerwieniacy
noga "zdjecie filtra sciezek z jednego przebiegu" zdejmij_filtr
noga "wolajacy jako nieblokujacy" odblokuj_wolajacego

echo "─────────────────────────────────────────"
echo "  zdane: $ZDANE   ·   oblane: $OBLANE"
[ "$OBLANE" -eq 0 ]
