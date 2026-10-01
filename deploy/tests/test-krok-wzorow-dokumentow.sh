#!/usr/bin/env bash
# Proba: krok wzorow dokumentow w potoku `deploy/psychon-dev/deploy.sh`.
#
# Po co. Po samych migracjach tabela `document_templates` jest pusta, a edytor
# wzorow odpowiada 404 dla kazdego rodzaju. Krok
# `php artisan db:seed --class=DocumentTemplateSeeder --force` ma stac w
# potoku ZARAZ PO `migrate --force`, a jego blad ma przerwac wdrozenie tak samo
# jak blad migracji.
#
# Cztery rzeczy mierzone osobno:
#   1. wiersz kroku jest w pliku dokladnie raz (caly wiersz rowny krokowi);
#   2. stoi po wierszu migracji i jest pierwszym po nim wierszem zaczynajacym
#      sie od wywolania `exec` w kontenerze;
#   3. opcje powloki i oslona (przypadek 3) oraz zachowanie (przypadki 4-6):
#      blok potoku od komunikatu o migracjach do `optimize` jest wyciety
#      z pliku i uruchomiony z atrapa `docker compose` (wywolania wypisywane
#      na standardowe wyjscie, zadnych plikow tymczasowych) pod opcjami
#      powloki WYCIETYMI Z PLIKU: kazde rozpoznane polecenie `set` i
#      `shopt -o` stojace w pliku przed blokiem jest odtwarzane w tej samej
#      kolejnosci (nic nie jest tu wpisane na sztywno). Mierzona jest
#      kolejnosc wywolan i to, ze blad kroku zatrzymuje dalsze kroki z kodem
#      bledu - tak samo jak blad migracji;
#   4. poziom skladniowy (przypadek 7): wiersz migracji i wiersz kroku sa
#      samodzielnymi poleceniami najwyzszego poziomu skryptu.
# Poza przypadkami biegnie stala kontrola rozpoznawania (przy kazdym biegu):
# trzy zapisy wylaczajace przerywanie, w ktorych `errexit` stoi obok innej
# nazwy opcji, przechodza przez ta sama funkcje wyciagajaca i ten sam warunek
# co przypadek 3. Zapis nierozpoznany daje kod 1 z jego nazwa. Ma osobna linie
# wyniku (`kontrola rozpoznawania: n/3`) i nie zmienia liczby przypadkow.
#
# CO PROBA ROZPOZNAJE (lista zamknieta):
#   a. Wylaczenie przerywania na bledzie (errexit) albo pipefail poleceniem
#      `set`, zapisanym w jednym wierszu miedzy `set -euo pipefail` a krokiem:
#      `set +e`, `set +eu`, `set +o errexit`, `set +o pipefail`, zapis zlozony
#      (`set -u +e`, `set +o errexit +o pipefail`), takze w wierszu z innym
#      poleceniem (`cos; set +e`). Inne nazwy opcji w tym samym poleceniu nie
#      ukrywaja wylaczenia: `set +o noglob +o errexit`,
#      `set -o noclobber +o errexit`.
#   b. To samo poleceniem `shopt` z flagami `u` oraz `o` i nazwa `errexit`
#      albo `pipefail`: `shopt -u -o errexit`, `shopt -uo errexit`,
#      `shopt -o -u pipefail`, takze w wierszu z innym poleceniem. Inne nazwy
#      opcji obok nie ukrywaja wylaczenia: `shopt -u -o noglob errexit`.
#      Szukanie z punktow a-b jest tekstowe, po wierszach niebedacych
#      komentarzem: trafienie w ciele funkcji, w galezi warunku albo w tekscie
#      dokumentu wbudowanego tez sie liczy, a pozniejsze ponowne wlaczenie
#      opcji nie cofa trafienia - proba nie zgaduje, co sie wykona.
#   c. Oslone w wierszu kroku: `|| true` albo `|| :` w wierszu z nazwa seedera.
#   d. Krok albo migracje poza najwyzszym poziomem skryptu: w grupie
#      w klamrach, w podpowloce, w `if`/`while`/`for`/`case`, w ciele funkcji
#      albo w liscie z `||`, `&&`, `!` lub potokiem (takze rozbitej na
#      wiersze). Pomiar robi parser powloki, nie wyrazenie na sasiednich
#      wierszach, dwiema drogami, i obie musza sie zgodzic:
#      - tresc pliku jest definiowana jako cialo funkcji (sama definicja,
#        bez wywolania) i czytana jest postac wypisana przez `declare -f`:
#        polecenie spoza grupy, warunku, petli, funkcji i listy stoi w niej
#        samo w wierszu z pojedynczym wcieciem;
#      - poczatek pliku do wiersza PRZED poleceniem i poczatek pliku do
#        wiersza polecenia WLACZNIE musza byc dla `bash -n` (czytanie bez
#        wykonania) kompletnym skryptem bez ostrzezen: otwarta wyzej
#        podpowloka, grupa, warunek, funkcja, lista albo dokument wbudowany
#        daja tu blad albo ostrzezenie parsera.
#      Wczesniej caly plik przechodzi `bash -n`; plik niepoprawny skladniowo
#      daje kod 2.
#
# CZEGO PROBA NIE ROZPOZNAJE (jawnie):
#   - opcji zmienionych w pliku wczytanym przez `source` albo `.`;
#   - `eval` z trescia ze zmiennej i polecenia `set`/`shopt` skladanego ze
#     zmiennych albo rozbitego na wiersze znakiem kontynuacji;
#   - aliasu i funkcji o nazwie `set` albo `shopt`;
#   - `trap` (w tym pulapki na ERR i EXIT);
#   - opcji narzuconych z zewnatrz: sposobu wywolania skryptu (`bash +e plik`,
#     wywolanie calego skryptu w warunku albo z `|| true`), zmiennych
#     srodowiska;
#   - zmiany tablicy `compose` (np. podmiany na polecenie, ktore zawsze
#     konczy sie zerem) i zachowania samego `docker compose`.
#
# CO PROBA WYKONUJE Z BADANEGO PLIKU. Pomiar poziomu skladniowego nie wykonuje
# z niego niczego (definicja funkcji nie uruchamia jej tresci, a `bash -n`
# tylko czyta). Przypadki 4-6
# wykonuja w osobnej powloce wylacznie: rozpoznane polecenia `set`/`shopt -o`
# (same flagi i slowa z liter, cyfr i `_` - dowolne nazwy opcji, bez znakow
# powloki, wiec zadne slowo z pliku nie uruchomi tu polecenia ani podstawienia;
# zapis, ktorego nie da sie odtworzyc bez bledu, daje czerwien) oraz wiersze
# bloku, ale tylko gdy kazdy wiersz
# bloku jest komentarzem, wierszem `echo "<tekst bez podstawien>"` albo
# wywolaniem atrapy `"${compose[@]}" <slowa>` bez znakow powloki. Blok
# z jakimkolwiek innym wierszem NIE jest uruchamiany, a przypadki 4-6 sa
# wtedy niezaliczone.
#
# Kody: 0 wszystkie zaliczone i kontrola rozpoznawania 3/3, 1 co najmniej
# jeden niezaliczony przypadek albo nierozpoznany zapis kontroli, 2 nie da sie
# zmierzyc.
set -uo pipefail

TU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
KORZEN="$(cd -- "$TU/../.." && pwd)"
PLIK_DEPLOY="${1:-$KORZEN/deploy/psychon-dev/deploy.sh}"

[[ -f "$PLIK_DEPLOY" ]] || { echo "BLAD: brak pliku $PLIK_DEPLOY" >&2; exit 2; }
bash -n -- "$PLIK_DEPLOY" 2>/dev/null || { echo "BLAD: $PLIK_DEPLOY nie przechodzi bash -n - nie mierze" >&2; exit 2; }

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

# Slowo po `set`/`shopt`: flaga (`-e`, `+o`) albo dowolna nazwa opcji - same
# litery, cyfry i `_` (zadnych znakow powloki, `$`, cudzyslowow, `=`).
SLOWO_OPCJI='[-+][A-Za-z]+|[A-Za-z0-9_]+'
# Polecenia `set` z opcjami (nie `set --`) i polecenia `shopt` z flaga `o`
# z tekstu czytanego ze standardowego wejscia (wiersze niebedace komentarzem),
# po jednym na wiersz wyjscia, w kolejnosci wejscia.
flagi_polecenia() { grep -oE '(^|[[:space:]])-[A-Za-z]+' <<< "$1" | tr -d ' \n-'; }
polecenia_opcji() {
  local polecenie
  grep -oE "(^|[;&|({[:space:]])(set|shopt)([[:space:]]+($SLOWO_OPCJI))+" \
    | sed -E 's/^[;&|({[:space:]]+//' \
    | while IFS= read -r polecenie; do
        if [[ "$polecenie" == shopt* && "$(flagi_polecenia "$polecenie")" != *o* ]]; then continue; fi
        printf '%s\n' "$polecenie"
      done
}
# Wiersze pliku niebedace komentarzem. $1 = pierwszy wiersz zakresu (wlacznie),
# $2 = ostatni (wylacznie).
polecenia_opcji_z_pliku() {
  awk -v od="$1" -v do_="$2" 'NR >= od && NR < do_ && $0 !~ /^[[:space:]]*#/' "$PLIK_DEPLOY" | polecenia_opcji
}
# Czy polecenie wylacza przerywanie na bledzie (errexit) albo pipefail.
wylacza_przerywanie() {
  local flagi
  if [[ "$1" == shopt* ]]; then
    flagi="$(flagi_polecenia "$1")"
    [[ "$flagi" == *u* && "$flagi" == *o* ]] && grep -qE '[[:space:]](errexit|pipefail)([[:space:]]|$)' <<< "$1"
    return
  fi
  grep -qE '[[:space:]]\+[A-Za-z]*e[A-Za-z]*([[:space:]]|$)|[[:space:]]\+[A-Za-z]*o[[:space:]]+(errexit|pipefail)([[:space:]]|$)' <<< " $1"
}
# Z tekstu na standardowym wejsciu wypisuje rozpoznane polecenia, ktore wylaczaja
# przerywanie (jedna funkcja wyciagajaca i jeden warunek: dla przypadku 3
# i dla kontroli rozpoznawania).
wylaczenia_przerywania() {
  local polecenie
  polecenia_opcji | while IFS= read -r polecenie; do
    [[ -n "$polecenie" ]] || continue
    if wylacza_przerywanie "$polecenie"; then printf '%s\n' "$polecenie"; fi
  done
}

W_BLOKU="$(nr_wiersza 'echo "Migracje i cache konfiguracji..."')"

naglowek "3 opcje powloki przerywajace potok obowiazuja w miejscu kroku"
W_SET="$(nr_wiersza 'set -euo pipefail')"
ILE_WYLACZEN=0
if [[ -n "$W_SET" && -n "$W_WZOROW" ]]; then
  while IFS= read -r POLECENIE; do
    [[ -n "$POLECENIE" ]] || continue
    ILE_WYLACZEN=$((ILE_WYLACZEN+1))
    echo "  wylaczenie przerywania: $POLECENIE"
  done < <(polecenia_opcji_z_pliku "$((W_SET+1))" "$W_WZOROW" | wylaczenia_przerywania)
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
# `set` i `shopt -o` od poczatku pliku do pierwszego wiersza bloku, w kolejnosci.
OPCJE_PLIKU="$(polecenia_opcji_z_pliku 1 "${W_BLOKU:-1}")"

# Blok wolno uruchomic tylko wtedy, gdy kazdy jego wiersz jest pusty, jest
# komentarzem, wierszem `echo "<tekst bez podstawien>"` albo wywolaniem atrapy.
DOZWOLONE_ECHO='^echo "[^"$`\\]*"$'
DOZWOLONE_ATRAPA='^"\$\{compose\[@\]\}"( [A-Za-z0-9:=_./-]+)+$'
BLOK_DOZWOLONY=1
while IFS= read -r WIERSZ_BLOKU; do
  [[ -z "${WIERSZ_BLOKU//[[:space:]]/}" || "$WIERSZ_BLOKU" =~ ^[[:space:]]*# ]] && continue
  if ! grep -qE -e "$DOZWOLONE_ECHO" -e "$DOZWOLONE_ATRAPA" <<< "$WIERSZ_BLOKU"; then
    BLOK_DOZWOLONY=0
    echo "wiersz bloku spoza dozwolonych (bloku nie uruchamiam): $WIERSZ_BLOKU"
  fi
done <<< "$BLOK"
# Odtwarzane sa tylko wiersze zlozone z `set`/`shopt`, flag i slow z liter,
# cyfr i `_` (ten sam wzorzec slowa co przy wycinaniu); inny wiersz = nie
# uruchamiam.
WIERSZ_OPCJI_DOZWOLONY="^(set|shopt)([[:space:]]+($SLOWO_OPCJI))+\$"
while IFS= read -r WIERSZ_OPCJI; do
  [[ -n "$WIERSZ_OPCJI" ]] || continue
  if ! [[ "$WIERSZ_OPCJI" =~ $WIERSZ_OPCJI_DOZWOLONY ]]; then
    BLOK_DOZWOLONY=0
    echo "polecenie opcji spoza dozwolonych (bloku nie uruchamiam): $WIERSZ_OPCJI"
  fi
done <<< "$OPCJE_PLIKU"
echo "opcje powloki wyciete z pliku przed blokiem: $(printf '%s' "$OPCJE_PLIKU" | paste -sd';' -)"

# Uruchamia blok z atrapa compose pod opcjami wycietymi z pliku. $1 = fragment
# polecenia, ktory ma zawiesc (pusty = nic nie zawodzi). Wypisuje wywolania
# i na koncu STAN=<n>.
uruchom_blok() {
  local zawodzi="$1"
  local wyjscie kod
  if [[ "$BLOK_DOZWOLONY" -ne 1 ]]; then
    printf 'STAN=nieuruchomiony\n'
    return 0
  fi
  wyjscie="$(ZAWODZI="$zawodzi" bash -c '
    atrapa() {
      echo "WYWOLANIE: $*"
      if [[ -n "$ZAWODZI" && "$*" == *"$ZAWODZI"* ]]; then return 7; fi
      return 0
    }
    compose=(atrapa)
    while IFS= read -r opcja; do
      [[ -n "$opcja" ]] || continue
      eval "$opcja" || exit 97
    done <<< "$2"
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

# Postac pliku po przejsciu przez parser powloki: tresc zdefiniowana jako
# cialo funkcji (definicja, bez wywolania) i wypisana przez `declare -f`.
# Zadne polecenie z pliku nie jest przy tym wykonywane.
postac_z_parsera() {
  bash --norc --noprofile -c '
    tresc="$(cat -- "$1")" || exit 2
    eval "__plik_potoku() {
$tresc
}" 2>/dev/null || exit 2
    declare -f __plik_potoku
  ' _ "$PLIK_DEPLOY"
}
# $1 = postac z parsera, $2 = igla, $3 = pelne polecenie. Wypisuje:
# "<wierszy z igla> <wierszy rownych poleceniu na najwyzszym poziomie>".
policz_poziom() {
  local z_igla na_szczycie
  z_igla="$(grep -cF -- "$2" <<< "$1")"
  na_szczycie="$(grep -cxF -e "    $3" -e "    $3;" <<< "$1")"
  echo "$z_igla $na_szczycie"
}

# Czy pierwsze $1 wierszy pliku to dla parsera kompletny skrypt bez ostrzezen.
# `bash -n` czyta tresc ze standardowego wejscia i niczego nie wykonuje.
kompletny_poczatek() {
  local uwagi
  uwagi="$(head -n "$1" -- "$PLIK_DEPLOY" | bash --norc --noprofile -n 2>&1)" && [[ -z "$uwagi" ]]
}
# $1 = numer wiersza polecenia (pusty = brak). Wypisuje "tak" albo "nie".
poczatki_kompletne() {
  if [[ -n "$1" ]] && kompletny_poczatek "$(($1-1))" && kompletny_poczatek "$1"; then echo tak; else echo nie; fi
}

naglowek "7 migracja i krok wzorow sa samodzielnymi poleceniami najwyzszego poziomu skryptu"
POSTAC="$(postac_z_parsera)"
if [[ -z "$POSTAC" ]]; then
  echo "BLAD: parser powloki nie zwrocil postaci pliku $PLIK_DEPLOY - poziomu nie da sie zmierzyc" >&2
  exit 2
fi
read -r M_IGLA M_SZCZYT <<< "$(policz_poziom "$POSTAC" 'artisan migrate --force' "$KROK_MIGRACJI")"
read -r K_IGLA K_SZCZYT <<< "$(policz_poziom "$POSTAC" 'DocumentTemplateSeeder' "$KROK_WZOROW")"
echo "  migracja: wierszy z poleceniem $M_IGLA, z tego na najwyzszym poziomie $M_SZCZYT; krok wzorow: wierszy z poleceniem $K_IGLA, z tego na najwyzszym poziomie $K_SZCZYT"
M_POCZATKI="$(poczatki_kompletne "$W_MIGRACJI")"
K_POCZATKI="$(poczatki_kompletne "$W_WZOROW")"
echo "  poczatek pliku kompletny przed poleceniem i z poleceniem: migracja $M_POCZATKI, krok wzorow $K_POCZATKI"
if [[ "$M_IGLA" -eq 1 && "$M_SZCZYT" -eq 1 && "$K_IGLA" -eq 1 && "$K_SZCZYT" -eq 1 && "$M_POCZATKI" == tak && "$K_POCZATKI" == tak ]]; then
  zaliczony
else
  niezaliczony "migracja albo krok wzorow stoi w poleceniu zlozonym albo w liscie z ||, &&, !"
fi

# Stala kontrola rozpoznawania: zapisy z inna nazwa opcji obok `errexit` musza
# zostac rozpoznane jako wylaczenie przerywania - ta sama funkcja i ten sam
# warunek co w przypadku 3, tekst ze strumienia (bez plikow). Nie jest
# przypadkiem i nie zmienia liczby przypadkow.
echo
echo "=== kontrola rozpoznawania (stala, poza przypadkami) ==="
KONTROLA_ZAPISY=('set +o noglob +o errexit' 'set -o noclobber +o errexit' 'shopt -u -o noglob errexit')
KONTROLA_OK=0
for ZAPIS in "${KONTROLA_ZAPISY[@]}"; do
  ROZPOZNANO="$(printf '%s\n' "$ZAPIS" | wylaczenia_przerywania)"
  if [[ "$ROZPOZNANO" == "$ZAPIS" ]]; then
    KONTROLA_OK=$((KONTROLA_OK+1))
    echo "  rozpoznano: $ROZPOZNANO"
  else
    echo "  NIEROZPOZNANY zapis: $ZAPIS (rozpoznano: ${ROZPOZNANO:-nic})"
  fi
done

echo
echo "przypadki: $((PRZYPADKOW-BLEDOW))/$PRZYPADKOW zaliczone"
echo "kontrola rozpoznawania: $KONTROLA_OK/${#KONTROLA_ZAPISY[@]}"
if [[ "$BLEDOW" -eq 0 && "$KONTROLA_OK" -eq "${#KONTROLA_ZAPISY[@]}" ]]; then
  echo "PROBA KROKU WZOROW: WSZYSTKIE ZALICZONE"
  exit 0
fi
echo "PROBA KROKU WZOROW: $BLEDOW NIEZALICZONYCH, KONTROLA ROZPOZNAWANIA $KONTROLA_OK/${#KONTROLA_ZAPISY[@]}"
exit 1
