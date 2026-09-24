#!/usr/bin/env bash
# Proba: skrot pliku `deploy/psychon-dev/deploy.sh` stoi na liscie znanych
# dobrych skrotow w `deploy/wdroz-zdalnie.sh`.
#
# Po co ta proba istnieje. Przyrzad wdrozeniowy wola na maszynie krok zrzutu
# PRZED checkoutem i robi to tylko wtedy, gdy rozpozna skrypt maszyny po
# skrocie. Zasada „kazdy zapis zmieniajacy ten plik dopisuje nowy skrot" stala
# w komentarzu i nigdzie indziej - wiec gdy plik sie zmienil, nikt jej nie
# przypomnial, a odmowa przyszla dopiero przy wdrozeniu, po bramce i po
# scaleniu. Zasada w prozie nie dziala; dziala pomiar w miejscu, gdzie zdarza
# sie zdarzenie. Tym miejscem jest bramka.
#
# Uwaga na kierunek: ta proba NIE mowi, ze skrypt maszyny jest dobry. Mowi
# tylko, ze plik z drzewa i lista z drzewa zgadzaja sie ze soba. To dokladnie
# to, czego zabraklo.
#
# Kody: 0 zgodne, 1 skrotu nie ma na liscie, 2 nie da sie zmierzyc.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KORZEN="$(cd "$TU/../../.." && pwd)"
PLIK_DEPLOY="${1:-$KORZEN/deploy/psychon-dev/deploy.sh}"
PLIK_PRZYRZADU="${2:-$KORZEN/deploy/wdroz-zdalnie.sh}"

for p in "$PLIK_DEPLOY" "$PLIK_PRZYRZADU"; do
  [[ -f "$p" ]] || { echo "BLAD: brak pliku $p" >&2; exit 2; }
done
command -v sha256sum >/dev/null 2>&1 || { echo "BLAD: brak sha256sum" >&2; exit 2; }

PRZYPADKOW=0
BLEDOW=0
naglowek() { PRZYPADKOW=$((PRZYPADKOW+1)); echo "=== $1 ==="; }
zaliczony() { echo "  WYNIK: ZALICZONY"; }
niezaliczony() { BLEDOW=$((BLEDOW+1)); echo "  WYNIK: NIEZALICZONY"; }

SKROT="$(sha256sum -- "$PLIK_DEPLOY" | awk '{print $1}')"
[[ -n "$SKROT" ]] || { echo "BLAD: nie policzylem skrotu" >&2; exit 2; }

# Lista czytana z pliku przyrzadu: wiersze miedzy otwarciem tablicy a nawiasem
# zamykajacym. Czytam plik, nie zrodluje go - zrodlowanie przyrzadu
# wdrozeniowego uruchomiloby jego warunki wstepne.
LISTA="$(sed -n '/^ZNANE_DOBRE_SKROTY_DEPLOY=(/,/^)/p' "$PLIK_PRZYRZADU" \
  | grep -oE '[0-9a-f]{64}')"

naglowek "1 lista skrotow w przyrzadzie wdrozeniowym nie jest pusta"
LICZBA="$(printf '%s\n' "$LISTA" | grep -c .)"
echo "  skrotow na liscie: $LICZBA"
if [[ "$LICZBA" -ge 1 ]]; then zaliczony; else
  echo "  powod: nie znalazlem ani jednego skrotu - albo nazwa tablicy sie zmienila"
  niezaliczony
fi

naglowek "2 skrot pliku wdrozeniowego maszyny stoi na liscie"
echo "  skrot pliku:   $SKROT"
if printf '%s\n' "$LISTA" | grep -qxF -- "$SKROT"; then
  zaliczony
else
  echo "  powod: skrotu nie ma na liscie; plik zmienil sie bez dopisania skrotu"
  echo "  napraw tak: dopisz ten skrot do ZNANE_DOBRE_SKROTY_DEPLOY w deploy/wdroz-zdalnie.sh"
  niezaliczony
fi

# Noga przeciwna: bez niej nie wiadomo, czy przypadek 2 mierzy zgodnosc, czy
# tylko to, ze lista jest niepusta.
naglowek "3 zmieniony plik NIE jest rozpoznawany (noga przeciwna)"
TYMCZASOWY="$(mktemp 2>/dev/null || echo "/tmp/proba-skrotu-$$")"
cp -- "$PLIK_DEPLOY" "$TYMCZASOWY" 2>/dev/null && printf '\n# zmiana na czas proby\n' >> "$TYMCZASOWY"
SKROT_ZMIENIONY="$(sha256sum -- "$TYMCZASOWY" 2>/dev/null | awk '{print $1}')"
rm -f -- "$TYMCZASOWY"
echo "  skrot po zmianie: ${SKROT_ZMIENIONY:-NIE-WIEM}"
if [[ -n "$SKROT_ZMIENIONY" && "$SKROT_ZMIENIONY" != "$SKROT" ]] \
   && ! printf '%s\n' "$LISTA" | grep -qxF -- "$SKROT_ZMIENIONY"; then
  zaliczony
else
  echo "  powod: zmieniony plik dostal ten sam skrot albo trafil na liste - pomiar nic nie mierzy"
  niezaliczony
fi

echo
echo "przypadki: $((PRZYPADKOW-BLEDOW))/$PRZYPADKOW zaliczone"
if [[ "$BLEDOW" -eq 0 ]]; then
  echo "PROBA LISTY SKROTOW: WSZYSTKIE ZALICZONE"
  exit 0
fi
echo "PROBA LISTY SKROTOW: $BLEDOW NIEZALICZONYCH"
exit 1
