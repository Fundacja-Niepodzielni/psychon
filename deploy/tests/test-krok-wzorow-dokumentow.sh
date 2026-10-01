#!/usr/bin/env bash
# Proba: krok wzorow dokumentow w potoku `deploy/psychon-dev/deploy.sh`.
#
# Po co. Po samych migracjach tabela `document_templates` jest pusta, a edytor
# wzorow odpowiada 404 dla kazdego rodzaju. Krok
# `php artisan db:seed --class=DocumentTemplateSeeder --force` ma stac w
# potoku ZARAZ PO `migrate --force`, a jego blad ma przerwac wdrozenie tak samo
# jak blad migracji.
#
# Trzy rzeczy mierzone osobno:
#   1. krok jest w pliku dokladnie raz;
#   2. stoi po migracji i jest pierwszym wywolaniem `exec` po niej;
#   3. zachowanie: blok potoku od migracji do `optimize` jest wyciety z pliku
#      i uruchomiony z atrapa `docker compose` (wywolania wypisywane na
#      standardowe wyjscie, zadnych plikow tymczasowych) pod opcjami
#      powloki WYCIETYMI Z PLIKU: kazde polecenie `set` z opcjami, ktore
#      stoi w pliku przed blokiem, jest odtwarzane w tej samej kolejnosci
#      (nic nie jest tu wpisane na sztywno). Mierzona jest kolejnosc wywolan
#      i to, ze blad kroku zatrzymuje dalsze kroki z kodem bledu - tak samo
#      jak blad migracji.
#
# Wylaczenie przerywania na bledzie jest rozpoznawane w kazdym zapisie:
# `set +e`, `set +eu`, `set +o errexit`, zapis zlozony (`set -u +e`,
# `set +o errexit +o pipefail`) i w wierszu z innym poleceniem (`cos; set +e`).
# Polecenie `set` w ciele funkcji albo w galezi warunku tez sie liczy: proba
# nie zgaduje, czy ta galaz sie wykona, tylko czerwienieje.
#
# Kody: 0 wszystkie zaliczone, 1 co najmniej jeden niezaliczony,
# 2 nie da sie zmierzyc.
set -uo pipefail

TU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
KORZEN="$(cd -- "$TU/../.." && pwd)"
PLIK_DEPLOY="${1:-$KORZEN/deploy/psychon-dev/deploy.sh}"

[[ -f "$PLIK_DEPLOY" ]] || { echo "BLAD: brak pliku $PLIK_DEPLOY" >&2; exit 2; }

KROK_MIGRACJI='"${compose[@]}" exec -T app php artisan migrate --force'
KROK_WZOROW='"${compose[@]}" exec -T app php artisan db:seed --class=DocumentTemplateSeeder --force'

PRZYPADKOW=0
BLEDOW=0
naglowek() { PRZYPADKOW=$((PRZYPADKOW+1)); echo "=== $1 ==="; }
zaliczony() { echo "  WYNIK: ZALICZONY"; }
niezaliczony() { BLEDOW=$((BLEDOW+1)); echo "  WYNIK: NIEZALICZONY - $1"; }

nr_wiersza() { grep -nxF -- "$1" "$PLIK_DEPLOY" | head -n1 | cut -d: -f1; }

naglowek "1 krok wzorow jest w potoku dokladnie raz"
ILE_WZOROW="$(grep -cxF -- "$KROK_WZOROW" "$PLIK_DEPLOY")"
echo "  wierszy z krokiem: $ILE_WZOROW"
if [[ "$ILE_WZOROW" -eq 1 ]]; then zaliczony; else niezaliczony "oczekiwano 1"; fi

naglowek "2 krok wzorow stoi zaraz po migracji"
W_MIGRACJI="$(nr_wiersza "$KROK_MIGRACJI")"
W_WZOROW="$(nr_wiersza "$KROK_WZOROW")"
# pierwsze wywolanie `exec` w kontenerze po wierszu migracji
W_NASTEPNY_EXEC=""
if [[ -n "$W_MIGRACJI" ]]; then
  W_NASTEPNY_EXEC="$(awk -v od="$W_MIGRACJI" 'NR > od && /^"\$\{compose\[@\]\}" exec / { print NR; exit }' "$PLIK_DEPLOY")"
fi
echo "  wiersz migracji: ${W_MIGRACJI:-BRAK}, wiersz kroku wzorow: ${W_WZOROW:-BRAK}, pierwszy exec po migracji: ${W_NASTEPNY_EXEC:-BRAK}"
if [[ -n "$W_MIGRACJI" && -n "$W_WZOROW" && "$W_WZOROW" -gt "$W_MIGRACJI" && "$W_NASTEPNY_EXEC" == "$W_WZOROW" ]]; then
  zaliczony
else
  niezaliczony "krok wzorow nie jest pierwszym wywolaniem po migracji"
fi

# Polecenia `set` z opcjami (nie `set --`) z wierszy niebedacych komentarzem,
# po jednym na wiersz wyjscia, w kolejnosci z pliku. $1 = pierwszy wiersz
# zakresu (wlacznie), $2 = ostatni wiersz zakresu (wylacznie).
polecenia_set() {
  awk -v od="$1" -v do_="$2" 'NR >= od && NR < do_ && $0 !~ /^[[:space:]]*#/' "$PLIK_DEPLOY" \
    | grep -oE '(^|[;&|({[:space:]])set([[:space:]]+([-+][A-Za-z]+|errexit|pipefail|nounset|errtrace|xtrace))+' \
    | sed -E 's/^[;&|({[:space:]]+//'
}
# Czy polecenie `set` wylacza przerywanie na bledzie (errexit) albo pipefail.
wylacza_przerywanie() {
  grep -qE '[[:space:]]\+[A-Za-z]*e[A-Za-z]*([[:space:]]|$)|[[:space:]]\+[A-Za-z]*o[[:space:]]+(errexit|pipefail)([[:space:]]|$)' <<< " $1"
}

W_BLOKU="$(nr_wiersza 'echo "Migracje i cache konfiguracji..."')"

naglowek "3 opcje powloki przerywajace potok obowiazuja w miejscu kroku"
W_SET="$(nr_wiersza 'set -euo pipefail')"
ILE_WYLACZEN=0
if [[ -n "$W_SET" && -n "$W_WZOROW" ]]; then
  while IFS= read -r POLECENIE; do
    [[ -n "$POLECENIE" ]] || continue
    if wylacza_przerywanie "$POLECENIE"; then
      ILE_WYLACZEN=$((ILE_WYLACZEN+1))
      echo "  wylaczenie przerywania: $POLECENIE"
    fi
  done < <(polecenia_set "$((W_SET+1))" "$W_WZOROW")
fi
ILE_OSLON="$(grep -F -- 'DocumentTemplateSeeder' "$PLIK_DEPLOY" | grep -cE '\|\| *(true|:)')"
echo "  wiersz 'set -euo pipefail': ${W_SET:-BRAK}, wylaczen przerywania miedzy nim a krokiem: $ILE_WYLACZEN, krok oslaniany '|| true': $ILE_OSLON"
if [[ -n "$W_SET" && -n "$W_WZOROW" && "$W_SET" -lt "$W_WZOROW" && "$ILE_WYLACZEN" -eq 0 && "$ILE_OSLON" -eq 0 ]]; then
  zaliczony
else
  niezaliczony "blad kroku nie przerwalby potoku"
fi

# Blok potoku: od komunikatu o migracjach do `optimize` wlacznie.
BLOK="$(sed -n '/^echo "Migracje i cache konfiguracji..."$/,/php artisan optimize$/p' "$PLIK_DEPLOY")"
if [[ -z "$BLOK" ]]; then
  echo "BLAD: nie wycialem bloku migracji z $PLIK_DEPLOY - zachowania nie da sie zmierzyc" >&2
  exit 2
fi

# Opcje powloki, ktore plik FAKTYCZNIE ma w miejscu bloku: wszystkie polecenia
# `set` z opcjami od poczatku pliku do pierwszego wiersza bloku, w kolejnosci.
OPCJE_PLIKU="$(polecenia_set 1 "${W_BLOKU:-1}")"
echo "opcje powloki wyciete z pliku przed blokiem: $(printf '%s' "$OPCJE_PLIKU" | paste -sd';' -)"

# Uruchamia blok z atrapa compose pod opcjami wycietymi z pliku. $1 = fragment
# polecenia, ktory ma zawiesc (pusty = nic nie zawodzi). Wypisuje wywolania
# i na koncu STAN=<n>.
uruchom_blok() {
  local zawodzi="$1"
  local wyjscie kod
  wyjscie="$(ZAWODZI="$zawodzi" bash -c '
    atrapa() {
      echo "WYWOLANIE: $*"
      if [[ -n "$ZAWODZI" && "$*" == *"$ZAWODZI"* ]]; then return 7; fi
      return 0
    }
    compose=(atrapa)
    eval "$2"
    eval "$1"
  ' _ "$BLOK" "$OPCJE_PLIKU" 2>/dev/null)"
  kod=$?
  printf '%s\nSTAN=%s\n' "$wyjscie" "$kod"
}

kolejnosc() { grep '^WYWOLANIE: ' | sed -E 's/^WYWOLANIE: exec -T app php artisan ([^ ]+).*/\1/' | paste -sd' ' -; }

naglowek "4 bez bledow: migracja, wzory, szyfrowanie migawek, optimize - w tej kolejnosci"
WYNIK="$(uruchom_blok '')"
KOLEJNOSC="$(printf '%s\n' "$WYNIK" | kolejnosc)"
STAN="$(printf '%s\n' "$WYNIK" | sed -n 's/^STAN=//p')"
echo "  kolejnosc: $KOLEJNOSC; stan wyjscia: $STAN"
if [[ "$KOLEJNOSC" == "migrate db:seed documents:encrypt-snapshots optimize" && "$STAN" == "0" ]]; then
  zaliczony
else
  niezaliczony "oczekiwano 'migrate db:seed documents:encrypt-snapshots optimize' i kodu 0"
fi

naglowek "5 blad kroku wzorow przerywa potok (dalsze kroki nie ruszaja, kod rozny od 0)"
WYNIK="$(uruchom_blok 'db:seed --class=DocumentTemplateSeeder')"
KOLEJNOSC="$(printf '%s\n' "$WYNIK" | kolejnosc)"
STAN="$(printf '%s\n' "$WYNIK" | sed -n 's/^STAN=//p')"
echo "  kolejnosc: $KOLEJNOSC; stan wyjscia: $STAN"
if [[ "$KOLEJNOSC" == "migrate db:seed" && "$STAN" == "7" ]]; then
  zaliczony
else
  niezaliczony "oczekiwano zatrzymania po 'db:seed' z kodem 7"
fi

naglowek "6 blad migracji przerywa potok przed krokiem wzorow (to samo traktowanie)"
WYNIK="$(uruchom_blok 'migrate --force')"
KOLEJNOSC="$(printf '%s\n' "$WYNIK" | kolejnosc)"
STAN="$(printf '%s\n' "$WYNIK" | sed -n 's/^STAN=//p')"
echo "  kolejnosc: $KOLEJNOSC; stan wyjscia: $STAN"
if [[ "$KOLEJNOSC" == "migrate" && "$STAN" == "7" ]]; then
  zaliczony
else
  niezaliczony "oczekiwano zatrzymania po 'migrate' z kodem 7"
fi

echo
echo "przypadki: $((PRZYPADKOW-BLEDOW))/$PRZYPADKOW zaliczone"
if [[ "$BLEDOW" -eq 0 ]]; then
  echo "PROBA KROKU WZOROW: WSZYSTKIE ZALICZONE"
  exit 0
fi
echo "PROBA KROKU WZOROW: $BLEDOW NIEZALICZONYCH"
exit 1
