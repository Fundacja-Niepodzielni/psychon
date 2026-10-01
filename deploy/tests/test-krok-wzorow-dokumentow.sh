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
#      standardowe wyjscie, zadnych plikow tymczasowych) pod tymi samymi
#      opcjami powloki, ktore plik ustawia przed blokiem. Mierzona jest
#      kolejnosc wywolan i to, ze blad kroku zatrzymuje dalsze kroki z
#      kodem bledu - tak samo jak blad migracji.
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

naglowek "3 opcje powloki przerywajace potok obowiazuja w miejscu kroku"
W_SET="$(nr_wiersza 'set -euo pipefail')"
ILE_SET_PLUS=0
if [[ -n "$W_SET" && -n "$W_WZOROW" ]]; then
  ILE_SET_PLUS="$(awk -v od="$W_SET" -v do_="$W_WZOROW" 'NR > od && NR < do_ && /^[[:space:]]*set \+[a-z]*e/ { n++ } END { print n+0 }' "$PLIK_DEPLOY")"
fi
ILE_OSLON="$(grep -F -- 'DocumentTemplateSeeder' "$PLIK_DEPLOY" | grep -cE '\|\| *(true|:)')"
echo "  wiersz 'set -euo pipefail': ${W_SET:-BRAK}, 'set +e' miedzy nim a krokiem: $ILE_SET_PLUS, krok oslaniany '|| true': $ILE_OSLON"
if [[ -n "$W_SET" && -n "$W_WZOROW" && "$W_SET" -lt "$W_WZOROW" && "$ILE_SET_PLUS" -eq 0 && "$ILE_OSLON" -eq 0 ]]; then
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

# Uruchamia blok z atrapa compose. $1 = fragment polecenia, ktory ma zawiesc
# (pusty = nic nie zawodzi). Wypisuje wywolania i na koncu STAN=<n>.
uruchom_blok() {
  local zawodzi="$1"
  local wyjscie kod
  wyjscie="$(ZAWODZI="$zawodzi" bash -c '
    set -euo pipefail
    atrapa() {
      echo "WYWOLANIE: $*"
      if [[ -n "$ZAWODZI" && "$*" == *"$ZAWODZI"* ]]; then return 7; fi
      return 0
    }
    compose=(atrapa)
    eval "$1"
  ' _ "$BLOK" 2>/dev/null)"
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
