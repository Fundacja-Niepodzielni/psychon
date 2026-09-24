#!/usr/bin/env bash
# Proby przyrzadu wdrozeniowego `deploy/wdroz-zdalnie.sh`.
#
# Zaden przypadek nie laczy sie z prawdziwym hostem: na PATH podkladana jest
# ATRAPA `ssh`, ktora liczy swoje wywolania i oddaje spreparowane pomiary.
# Adres uzywany w probach pochodzi z puli dokumentacyjnej 192.0.2.0/24 i nie
# jest adresem zadnej maszyny.
#
# Co jest tu mierzone (numeracja za kryteriami odbioru przyrzadu):
#   W1 skladnia i uzycie, W2 adres tylko ze srodowiska, W3 adres nie pada w
#   wyjsciu (z kontrola perturbacyjna), W4 trzy warunki wstepne = trzy kody,
#   W5 tryb --warunki-wstepne, W6 cztery kroki kontrolne = cztery kody,
#   W7 sciezki logow na sciezce nieudanej, W8 kod wyjscia nie ginie w filtrze.
set -uo pipefail

TU="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$TU/../.." && pwd)"
PRZYRZAD="$REPO_ROOT/deploy/wdroz-zdalnie.sh"

ADRES="192.0.2.10"
ADRES_Z_ARGUMENTU="192.0.2.77"
SHA_PROBNY="0123456789abcdef0123456789abcdef01234567"
INNY_SHA="89abcdef0123456789abcdef0123456789abcdef"

KATALOG="$(mktemp -d)"
trap 'rm -rf "$KATALOG"' EXIT
mkdir -p "$KATALOG/bin" "$KATALOG/logi"

export ATRAPA_LICZNIK="$KATALOG/licznik"
export ATRAPA_ARGI="$KATALOG/argi"
export ATRAPA_ADRES="$ADRES"
export ATRAPA_SHA="$SHA_PROBNY"
ATRAPA="$KATALOG/bin/ssh"

cat > "$ATRAPA" <<"ATRAPA_SSH"
#!/usr/bin/env bash
# Atrapa `ssh`. Nie laczy sie z niczym. Liczy wywolania, zjada czesc zdalna
# ze stdin (inaczej wolajacy dostalby SIGPIPE) i oddaje spreparowane pomiary.
printf '%s\n' "$(( $(cat "$ATRAPA_LICZNIK" 2>/dev/null || echo 0) + 1 ))" > "$ATRAPA_LICZNIK"
printf '%s\n' "$*" >> "$ATRAPA_ARGI"
cat > /dev/null

if [ "${ATRAPA_TRYB:-}" = "adres" ]; then
    # Adres pada na OBU strumieniach - przyrzad ma go zaslonic na kazdym.
    echo "atrapa ssh: probowalem $ATRAPA_ADRES (to jest stdout)"
    echo "ssh: connect to host $ATRAPA_ADRES port 22: Connection refused" >&2
    exit 9
fi

case "$*" in
    *"bash -s -- warunki"*) FAZA=warunki ;;
    *"bash -s -- wdrozenie"*) FAZA=wdrozenie ;;
    *) echo "atrapa ssh: nie rozpoznaje fazy" >&2; exit 97 ;;
esac

if [ "$FAZA" = "warunki" ] && [ "${ATRAPA_TRYB:-}" = "urwany" ]; then
    # Polaczenie konczy sie zerem, ale pomiar urywa sie przed linia konca.
    echo "POMIAR-KTO=deploy"
    echo "POMIAR-KOPIE-ISTNIEJE=tak"
    echo "POMIAR-KOPIE-ZAPIS=tak"
    exit 0
fi

if [ "$FAZA" = "warunki" ]; then
    echo "POMIAR-KTO=deploy"
    echo "POMIAR-KOPIE-ISTNIEJE=tak"
    echo "POMIAR-KOPIE-WLASCICIEL=root:root"
    echo "POMIAR-KOPIE-PRAWA=755"
    echo "POMIAR-KOPIE-ZAPIS=${ATRAPA_ZAPIS:-tak}"
    echo "POMIAR-KOPIE-WOLNE-KB=${ATRAPA_WOLNE:-4194304}"
    echo "POMIAR-RODZIC-ISTNIEJE=tak"
    echo "POMIAR-RODZIC-WLASCICIEL=root:root"
    echo "POMIAR-RODZIC-PRAWA=755"
    echo "POMIAR-RODZIC-ZAPIS=nie"
    echo "POMIAR-RODZIC-WOLNE-KB=${ATRAPA_WOLNE:-4194304}"
    echo "POMIAR-HEAD=${ATRAPA_HEAD:-$ATRAPA_SHA}"
    echo "POMIAR-KONIEC=0"
    exit 0
fi

echo "[ZDALNIE] KONIEC-STATUS=${ATRAPA_KONIEC_KOD:-0}"
if [ "${ATRAPA_POWTORZ_KONIEC:-0}" = "1" ]; then
    echo "[ZDALNIE] KONIEC-STATUS=${ATRAPA_KONIEC_KOD:-0}"
fi
echo "KONTROLA-HEAD=${ATRAPA_HEAD_PO:-$ATRAPA_SHA}"
echo "KONTROLA-KONTENERY=${ATRAPA_KONTENERY:-8}"
echo "KONTROLA-DRZEWO-LINII=${ATRAPA_DRZEWO:-0}"
exit 0
ATRAPA_SSH
chmod +x "$ATRAPA"

PATH="$KATALOG/bin:$PATH"
export PATH
export PSYCHON_KATALOG_LOGOW="$KATALOG/logi"
export PSYCHON_KATALOG_LOGOW_HOSTA="/tmp/proba-wdrozenia"

WSZYSTKIE=0
ZALICZONE=0
NIEZAL_PRZYPADKU=0

przypadek() {
    echo "=== $* ==="
    NIEZAL_PRZYPADKU=0
    WSZYSTKIE=$((WSZYSTKIE + 1))
}
zle() {
    echo "  NIEZALICZONY: $*"
    NIEZAL_PRZYPADKU=1
}
koniec_przypadku() {
    if [ "$NIEZAL_PRZYPADKU" -eq 0 ]; then
        ZALICZONE=$((ZALICZONE + 1))
        echo "  WYNIK: ZALICZONY"
    else
        echo "  WYNIK: NIEZALICZONY"
    fi
}
rowne() {
    # $1 nazwa, $2 zmierzone, $3 oczekiwane
    echo "  $1: $2 (oczekiwano $3)"
    [ "$2" = "$3" ] || zle "$1 = $2, oczekiwano $3"
}
wiekszy_od_zera() {
    echo "  $1: $2 (oczekiwano > 0)"
    [ "$2" -gt 0 ] || zle "$1 = $2, oczekiwano wiecej niz 0"
}
zeruj() { echo 0 > "$ATRAPA_LICZNIK"; : > "$ATRAPA_ARGI"; }
licznik() { cat "$ATRAPA_LICZNIK" 2>/dev/null || echo brak; }

WYJ="$KATALOG/wyjscie.txt"

# --- W1 --------------------------------------------------------------------
przypadek "skladnia pliku przyrzadu jest poprawna"
bash -n "$PRZYRZAD"
RC=$?
rowne "rc bash -n" "$RC" "0"
koniec_przypadku

przypadek "brak argumentu: kod 2, jedna linia uzycia, atrapa niewolana"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "2"
rowne "linii w wyjsciu" "$(grep -c . "$WYJ")" "1"
rowne "linii zaczynajacych sie od 'uzycie:'" "$(grep -c '^uzycie:' "$WYJ")" "1"
rowne "wywolan atrapy ssh" "$(licznik)" "0"
sed 's/^/    | /' "$WYJ"
koniec_przypadku

przypadek "skrot krotszy niz 40 znakow: kod 2, jedna linia uzycia, atrapa niewolana"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" abc123 > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "2"
rowne "linii w wyjsciu" "$(grep -c . "$WYJ")" "1"
rowne "wywolan atrapy ssh" "$(licznik)" "0"
sed 's/^/    | /' "$WYJ"
koniec_przypadku

# --- W2 --------------------------------------------------------------------
przypadek "brak HOST_BRAMKOWY: kod 2, komunikat nazywa brak, atrapa niewolana"
zeruj
env -u HOST_BRAMKOWY "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "2"
rowne "linii z 'HOST_BRAMKOWY'" "$(grep -c 'HOST_BRAMKOWY' "$WYJ")" "1"
rowne "wywolan atrapy ssh" "$(licznik)" "0"
sed 's/^/    | /' "$WYJ"
koniec_przypadku

przypadek "adres jako argument: przyrzad go NIE przyjmuje (kod 2, atrapa niewolana)"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" "$ADRES_Z_ARGUMENTU" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "2"
rowne "wywolan atrapy ssh" "$(licznik)" "0"
rowne "wystapien adresu z argumentu w wyjsciu" "$(grep -c "$ADRES_Z_ARGUMENTU" "$WYJ")" "0"
sed 's/^/    | /' "$WYJ"
koniec_przypadku

przypadek "w pliku jest DOKLADNIE jedno zrodlo adresu"
ILE="$(grep -cE '^[[:space:]]*HOST=' "$PRZYRZAD")"
rowne "przypisan do HOST" "$ILE" "1"
echo "  wiersz: $(grep -nE '^[[:space:]]*HOST=' "$PRZYRZAD")"
grep -qE '^[[:space:]]*HOST="\$\{HOST_BRAMKOWY:-\}"$' "$PRZYRZAD" || zle "jedyne przypisanie do HOST nie pochodzi z HOST_BRAMKOWY"
koniec_przypadku

# --- W3 i W8 ---------------------------------------------------------------
przypadek "atrapa wypisuje adres na stdout i stderr i konczy 9, kod atrapy nie ginie w filtrze"
zeruj
ATRAPA_TRYB=adres HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
echo "  rc=$RC"
rowne "rc (kod atrapy nie zgubiony w filtrze)" "$RC" "9"
rowne "wystapien adresu w calym wyjsciu" "$(grep -c "$ADRES" "$WYJ")" "0"
wiekszy_od_zera "wystapien maski HOST-UKRYTY" "$(grep -c 'HOST-UKRYTY' "$WYJ")"
rowne "wywolan atrapy ssh" "$(licznik)" "1"
echo "  wiersze z maska:"
grep 'HOST-UKRYTY' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "kontrola perturbacyjna: atrapa wolana WPROST wypisuje adres"
zeruj
ATRAPA_TRYB=adres "$ATRAPA" -o BatchMode=yes deploy@"$ADRES" "bash -s -- warunki x" < /dev/null > "$WYJ" 2>&1
RC=$?
echo "  rc=$RC"
rowne "rc atrapy wolanej wprost" "$RC" "9"
wiekszy_od_zera "wystapien adresu bez przyrzadu" "$(grep -c "$ADRES" "$WYJ")"
sed 's/^/    | /' "$WYJ"
koniec_przypadku

przypadek "lokalna kopia logu tez jest zamaskowana"
zeruj
ATRAPA_TRYB=adres HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
KOPIA="$(grep -o 'kopia lokalna: .*' "$WYJ" | tail -1 | sed 's/kopia lokalna: //')"
echo "  kopia lokalna: $KOPIA"
if [ -f "$KOPIA" ]; then
    rowne "wystapien adresu w kopii lokalnej" "$(grep -c "$ADRES" "$KOPIA")" "0"
    wiekszy_od_zera "wystapien maski w kopii lokalnej" "$(grep -c 'HOST-UKRYTY' "$KOPIA")"
else
    zle "nie ma pliku kopii lokalnej: $KOPIA"
fi
koniec_przypadku

# --- W7 (sciezka nieudana, kod 9) -----------------------------------------
przypadek "ostatni wiersz na sciezce nieudanej (kod 9) podaje oba logi"
OSTATNI="$(tail -1 "$WYJ")"
echo "  ostatni wiersz: $OSTATNI"
case "$OSTATNI" in
    *"log na hoscie: "*"kopia lokalna: "*) : ;;
    *) zle "ostatni wiersz nie podaje obu sciezek" ;;
esac
koniec_przypadku

# --- W4 --------------------------------------------------------------------
przypadek "katalog kopii niezapisywalny: kod 11, przed zrzutem i przed zmiana schematu"
zeruj
ATRAPA_ZAPIS=nie HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "11"
rowne "wystapien 'pg_dump' w wyjsciu" "$(grep -c 'pg_dump' "$WYJ")" "0"
rowne "wystapien 'migrate' w wyjsciu" "$(grep -c 'migrate' "$WYJ")" "0"
rowne "wywolan atrapy ssh (tylko pomiar warunkow)" "$(licznik)" "1"
grep -q 'WARUNEK a. NIEZALICZONY' "$WYJ" || zle "brak wiersza nazywajacego warunek (a)"
grep 'WARUNEK a' "$WYJ" | sed 's/^/    | /'
OSTATNI="$(tail -1 "$WYJ")"
echo "  ostatni wiersz: $OSTATNI"
case "$OSTATNI" in
    *"log na hoscie: "*"kopia lokalna: "*) : ;;
    *) zle "ostatni wiersz na sciezce niezapisywalnego katalogu kopii nie podaje obu sciezek logow" ;;
esac
koniec_przypadku

przypadek "za malo miejsca: kod 12, wyjscie podaje prog i wartosc"
zeruj
ATRAPA_WOLNE=1024 HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "12"
rowne "wystapien 'pg_dump' w wyjsciu" "$(grep -c 'pg_dump' "$WYJ")" "0"
rowne "wystapien 'migrate' w wyjsciu" "$(grep -c 'migrate' "$WYJ")" "0"
grep -q 'WARUNEK b. NIEZALICZONY' "$WYJ" || zle "brak wiersza nazywajacego warunek (b)"
grep 'WARUNEK b' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "czubek na hoscie inny niz zadany: kod 13"
zeruj
ATRAPA_HEAD="$INNY_SHA" HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "13"
rowne "wystapien 'pg_dump' w wyjsciu" "$(grep -c 'pg_dump' "$WYJ")" "0"
rowne "wystapien 'migrate' w wyjsciu" "$(grep -c 'migrate' "$WYJ")" "0"
grep -q 'WARUNEK c. NIEZALICZONY' "$WYJ" || zle "brak wiersza nazywajacego warunek (c)"
grep 'WARUNEK c' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "pomiar warunkow wstepnych urwany w polowie (kanal konczy zerem): kod 14, nic nie rusza"
zeruj
ATRAPA_TRYB=urwany HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "14"
rowne "wystapien 'migrate' w wyjsciu" "$(grep -c 'migrate' "$WYJ")" "0"
rowne "wystapien 'pg_dump' w wyjsciu" "$(grep -c 'pg_dump' "$WYJ")" "0"
rowne "wywolan atrapy ssh (bez kroku wdrozenia)" "$(licznik)" "1"
grep 'urwal sie' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

# --- W5 --------------------------------------------------------------------
przypadek "tryb --warunki-wstepne: kod 0, bez wdrozenia, z prawami i miejscem"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --warunki-wstepne > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "0"
rowne "wystapien 'migrate' w wyjsciu" "$(grep -c 'migrate' "$WYJ")" "0"
rowne "wystapien 'pg_dump' w wyjsciu" "$(grep -c 'pg_dump' "$WYJ")" "0"
rowne "wywolan atrapy ssh (sam pomiar, bez wdrozenia)" "$(licznik)" "1"
rowne "linii o katalogu kopii" "$(grep -c 'katalog kopii .*wlasciciel=.*prawa=.*wolne=' "$WYJ")" "1"
rowne "linii o katalogu nadrzednym" "$(grep -c 'katalog nadrzedny .*wlasciciel=.*prawa=.*wolne=' "$WYJ")" "1"
rowne "wystapien adresu w wyjsciu" "$(grep -c "$ADRES" "$WYJ")" "0"
grep -E 'katalog (kopii|nadrzedny)' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

# --- W6 --------------------------------------------------------------------
przypadek "bieg zielony: kod 0, cztery kroki kontrolne zaliczone"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "0"
rowne "wywolan atrapy ssh (warunki + wdrozenie)" "$(licznik)" "2"
rowne "wierszy KONIEC-STATUS w wyjsciu" "$(grep -c 'KONIEC-STATUS=' "$WYJ")" "1"
grep -E '^\[KONTROLA' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "kontrola 1: czubek po wdrozeniu inny - kod 21"
zeruj
ATRAPA_HEAD_PO="$INNY_SHA" HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "21"
grep -q 'KONTROLA 1. NIEZALICZONY' "$WYJ" || zle "brak wiersza nazywajacego kontrole 1"
grep 'KONTROLA 1' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "kontrola 2: 7 kontenerow zamiast 8 - kod 22"
zeruj
ATRAPA_KONTENERY=7 HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "22"
grep -q 'KONTROLA 2. NIEZALICZONY' "$WYJ" || zle "brak wiersza nazywajacego kontrole 2"
grep 'KONTROLA 2' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "kontrola 3: drzewo na hoscie brudne - kod 23"
zeruj
ATRAPA_DRZEWO=3 HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "23"
grep -q 'KONTROLA 3. NIEZALICZONY' "$WYJ" || zle "brak wiersza nazywajacego kontrole 3"
grep 'KONTROLA 3' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "kontrola 4: dwa wiersze konca zamiast jednego - kod 24"
zeruj
ATRAPA_POWTORZ_KONIEC=1 HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "24"
rowne "wierszy KONIEC-STATUS w wyjsciu" "$(grep -c 'KONIEC-STATUS=' "$WYJ")" "2"
grep -q 'KONTROLA 4. NIEZALICZONY' "$WYJ" || zle "brak wiersza nazywajacego kontrole 4"
grep 'KONTROLA 4' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "skrypt hosta konczy niezerowo - kod 25"
zeruj
ATRAPA_KONIEC_KOD=1 HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "25"
grep 'zwrocil kod' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

# --- W7 na biegu zielonym --------------------------------------------------
przypadek "ostatni wiersz biegu zielonego podaje log hosta i kopie lokalna"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
OSTATNI="$(tail -1 "$WYJ")"
echo "  ostatni wiersz: $OSTATNI"
case "$OSTATNI" in
    *"log na hoscie: /tmp/proba-wdrozenia/"*"kopia lokalna: "*) : ;;
    *) zle "ostatni wiersz nie podaje obu sciezek" ;;
esac
koniec_przypadku

# --- W9 --------------------------------------------------------------------
przypadek "przyrzad nie podnosi niczyich praw"
ILE="$(grep -cE 'sudo|chown|chmod' "$PRZYRZAD")"
rowne "trafien sudo/chown/chmod w pliku przyrzadu" "$ILE" "0"
koniec_przypadku

echo
echo "PODSUMOWANIE: $ZALICZONE/$WSZYSTKIE przypadkow zaliczonych"
[ "$ZALICZONE" -eq "$WSZYSTKIE" ]
