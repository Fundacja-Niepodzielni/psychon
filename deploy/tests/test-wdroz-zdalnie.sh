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
#   W7 sciezki logow na sciezce nieudanej, W8 kod wyjscia nie ginie w filtrze,
#   W9 przyrzad nie podnosi niczyich praw.
# Dalej przypadki trybu --zaloz-katalog-kopii: jawnosc trybu, odmowa przy
# cudzym katalogu nadrzednym, przeniesienie zamiast kasowania, umask przed
# zalozeniem, pomiar po zmianie, nieudana naprawa jako czerwien, kod hosta
# odrozniony od kodu kanalu, zapisywalny katalog logow stacji i maska konta
# wdrozeniowego wraz ze sciezka stosu.
#
# Atrapa zapisuje TRESC czesci zdalnej (ATRAPA_TRESC), bo czesc warunkow mowi
# o tym, co w ogole zostalo na hosta wyslane, a nie tylko o kodzie wyjscia.
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
export ATRAPA_TRESC="$KATALOG/tresc"
export ATRAPA_PO_ZALOZENIU="$KATALOG/po-zalozeniu"
export ATRAPA_ADRES="$ADRES"
export ATRAPA_SHA="$SHA_PROBNY"
ATRAPA="$KATALOG/bin/ssh"

cat > "$ATRAPA" <<"ATRAPA_SSH"
#!/usr/bin/env bash
# Atrapa `ssh`. Nie laczy sie z niczym. Liczy wywolania, ZAPISUJE tresc czesci
# zdalnej ze stdin (inaczej wolajacy dostalby SIGPIPE, a tresci nie dalo by sie
# zmierzyc) i oddaje spreparowane pomiary.
printf '%s\n' "$(( $(cat "$ATRAPA_LICZNIK" 2>/dev/null || echo 0) + 1 ))" > "$ATRAPA_LICZNIK"
printf '%s\n' "$*" >> "$ATRAPA_ARGI"
cat >> "$ATRAPA_TRESC"

if [ "${ATRAPA_TRYB:-}" = "adres" ]; then
    # Adres pada na OBU strumieniach - przyrzad ma go zaslonic na kazdym.
    echo "atrapa ssh: probowalem $ATRAPA_ADRES (to jest stdout)"
    echo "ssh: connect to host $ATRAPA_ADRES port 22: Connection refused" >&2
    exit 9
fi

case "$*" in
    *"bash -s -- warunki"*) FAZA=warunki ;;
    *"bash -s -- zaloz"*) FAZA=zaloz ;;
    *"bash -s -- sprawdz-tryb"*) FAZA=sprawdz-tryb ;;
    *"bash -s -- czubek"*) FAZA=czubek ;;
    *"bash -s -- zrzut"*) FAZA=zrzut ;;
    *"bash -s -- wdrozenie"*) FAZA=wdrozenie ;;
    *) echo "atrapa ssh: nie rozpoznaje fazy" >&2; exit 97 ;;
esac

if [ "$FAZA" = "warunki" ] && [ -n "${ATRAPA_POMIAR_PO_KANAL:-}" ] && [ -e "$ATRAPA_PO_ZALOZENIU" ]; then
    # Kanal pada w POMIARZE PO ZMIANIE, ale krok zakladania juz sie udal (stan
    # hosta jest juz 36) - ani jednego POMIAR- z tego wywolania.
    echo "ssh: connect to host $ATRAPA_ADRES port 22: Connection reset" >&2
    exit "$ATRAPA_POMIAR_PO_KANAL"
fi

if [ "$FAZA" = "warunki" ] && [ "${ATRAPA_POMIAR_PO_URWANY:-0}" = "1" ] && [ -e "$ATRAPA_PO_ZALOZENIU" ]; then
    # Pomiar PO zmianie urywa sie w polowie, choc zmiany na hoscie juz zaszly.
    echo "POMIAR-KTO=${ATRAPA_KTO:-deploy}"
    echo "POMIAR-KOPIE-ISTNIEJE=tak"
    exit 0
fi

if [ "$FAZA" = "warunki" ] && [ "${ATRAPA_TRYB:-}" = "urwany" ]; then
    # Polaczenie konczy sie zerem, ale pomiar urywa sie przed linia konca.
    echo "POMIAR-KTO=deploy"
    echo "POMIAR-KOPIE-ISTNIEJE=tak"
    echo "POMIAR-KOPIE-ZAPIS=tak"
    exit 0
fi

if [ "$FAZA" = "zaloz" ]; then
    if [ -n "${ATRAPA_ZALOZ_KANAL:-}" ]; then
        # Kanal pada, zanim czesc zdalna cokolwiek wypisze: ani jednego POMIAR-.
        echo "ssh: connect to host $ATRAPA_ADRES port 22: Connection reset" >&2
        exit "$ATRAPA_ZALOZ_KANAL"
    fi
    # Nazwa docelowa i decyzja o przeniesieniu MAJA pochodzic od przyrzadu, a
    # nie od atrapy - dlatego atrapa odczytuje je z wyslanego polecenia i
    # oddaje z powrotem. Inaczej proba sprawdzalaby sama siebie.
    POLECENIE="${!#}"
    # shellcheck disable=SC2086
    set -- $POLECENIE
    Z_KATALOG="$5"; Z_ZASTANY="$6"; Z_PRZENIES="$7"
    if [ "${ATRAPA_ZALOZ_URWANY:-0}" = "1" ]; then
        # Kanal konczy sie ZEREM, ale wyjscie urywa sie ZARAZ PO przeniesieniu:
        # ani POMIAR-PRZENIESIONY, ani POMIAR-ZALOZONY, ani linii konca. Znacznik
        # $ATRAPA_PO_ZALOZENIU stoi, bo przeniesienie NAPRAWDE zaszlo.
        if [ "$Z_PRZENIES" = "tak" ]; then
            echo "POMIAR-ZASTANE-POZYCJI=${ATRAPA_POZYCJI:-4}"
        else
            echo "POMIAR-ZASTANE-POZYCJI=brak"
        fi
        : > "$ATRAPA_PO_ZALOZENIU"
        exit 0
    fi
    if [ "${ATRAPA_ZALOZ_URWANY_MKDIR:-0}" = "1" ]; then
        # Bliznacza dziura, kierunek mniej grozny: POMIAR-PRZENIESIONY PADA
        # (przeniesienie zmierzone), ale POMIAR-ZALOZONY i linia konca - nie.
        # mkdir mogl sie udac, wyjscie urwalo sie tuz po przeniesieniu.
        if [ "$Z_PRZENIES" = "tak" ]; then
            echo "POMIAR-ZASTANE-POZYCJI=${ATRAPA_POZYCJI:-4}"
            echo "POMIAR-PRZENIESIONY=$Z_ZASTANY"
        else
            echo "POMIAR-ZASTANE-POZYCJI=brak"
            echo "POMIAR-PRZENIESIONY=nie-trzeba"
        fi
        : > "$ATRAPA_PO_ZALOZENIU"
        exit 0
    fi
    if [ "${ATRAPA_ZASTANY_ZAJETY:-0}" = "1" ]; then
        # Cel zastany - czesc zdalna odmawia PRZED przeniesieniem.
        echo "POMIAR-ZASTANY-ZAJETY=$Z_ZASTANY"
        exit 5
    fi
    if [ "$Z_PRZENIES" = "tak" ]; then
        echo "POMIAR-ZASTANE-POZYCJI=${ATRAPA_POZYCJI:-4}"
        if [ "${ATRAPA_ZALOZ_BLAD:-}" = "mv" ]; then
            echo "POMIAR-PRZENIESIONY=nie-udalo-sie"
            exit 3
        fi
        : > "$ATRAPA_PO_ZALOZENIU"
        echo "POMIAR-PRZENIESIONY=$Z_ZASTANY"
        if [ "${ATRAPA_ZALOZ_BLAD:-}" = "mkdir" ]; then
            # mv sie udal, mkdir padl: katalog zastany STOI JUZ OBOK.
            echo "POMIAR-ZALOZONY=nie-udalo-sie"
            exit 4
        fi
    else
        : > "$ATRAPA_PO_ZALOZENIU"
        echo "POMIAR-ZASTANE-POZYCJI=brak"
        echo "POMIAR-PRZENIESIONY=nie-trzeba"
    fi
    echo "POMIAR-ZALOZONY=$Z_KATALOG"
    echo "POMIAR-KONIEC-ZAKLADANIA=0"
    exit 0
fi

if [ "$FAZA" = "sprawdz-tryb" ]; then
    # pomiar CZYTAJACY, czy deploy.sh na hoscie zna
    # PSYCHON_TRYB_WDROZENIA - poprzedza kazdy zrzut w --ustaw-czubek.
    # Domyslnie odpowiada "tak" (zgodnie z deploy.sh z f2b1fa0), zeby
    # istniejace przypadki --ustaw-czubek nie musialy znac tego knobu.
    if [ -n "${ATRAPA_TRYB_KANAL:-}" ]; then
        echo "ssh: connect to host $ATRAPA_ADRES port 22: Connection reset" >&2
        exit "$ATRAPA_TRYB_KANAL"
    fi
    if [ "${ATRAPA_TRYB_URWANY:-0}" = "1" ]; then
        # Kanal konczy sie ZEREM, ale wyjscie urywa sie PRZED linia konca.
        echo "POMIAR-DEPLOY-ISTNIEJE=tak"
        exit 0
    fi
    if [ "${ATRAPA_DEPLOY_BRAK:-0}" = "1" ]; then
        echo "POMIAR-DEPLOY-ISTNIEJE=nie"
        echo "POMIAR-KONIEC-TRYB=0"
        exit 0
    fi
    echo "POMIAR-DEPLOY-ISTNIEJE=tak"
    echo "POMIAR-DEPLOY-ZNA-TRYB=${ATRAPA_DEPLOY_ZNA_TRYB:-tak}"
    echo "POMIAR-KONIEC-TRYB=0"
    exit 0
fi

if [ "$FAZA" = "czubek" ]; then
    if [ -n "${ATRAPA_CZUBEK_KANAL:-}" ]; then
        # Kanal pada, zanim czesc zdalna cokolwiek wypisze: ani jednego POMIAR-.
        echo "ssh: connect to host $ATRAPA_ADRES port 22: Connection reset" >&2
        exit "$ATRAPA_CZUBEK_KANAL"
    fi
    if [ "${ATRAPA_CZUBEK_URWANY:-0}" = "1" ]; then
        # Wyjscie urywa sie PRZED linia konca, choc checkout MOGL realnie
        # zajsc - znacznik stoi, tak jak przy analogicznej dziurze w --zaloz.
        : > "$ATRAPA_PO_ZALOZENIU"
        exit 0
    fi
    CZUBEK_CHECKOUT="${ATRAPA_CZUBEK_CHECKOUT:-ok}"
    if [ "$CZUBEK_CHECKOUT" = "ok" ]; then
        : > "$ATRAPA_PO_ZALOZENIU"
    fi
    echo "POMIAR-CHECKOUT=$CZUBEK_CHECKOUT"
    echo "POMIAR-KONIEC-CZUBEK=0"
    exit 0
fi

if [ "$FAZA" = "zrzut" ]; then
    if [ -n "${ATRAPA_ZRZUT_KANAL:-}" ]; then
        # Kanal pada, zanim czesc zdalna zrzutu cokolwiek wypisze: ani
        # jednego POMIAR- - checkout SIE NIE ODBYWA, bo do niego kod stacji
        # w ogole nie dochodzi.
        echo "ssh: connect to host $ATRAPA_ADRES port 22: Connection reset" >&2
        exit "$ATRAPA_ZRZUT_KANAL"
    fi
    if [ "${ATRAPA_ZRZUT_URWANY:-0}" = "1" ]; then
        # Kanal konczy sie ZEREM, ale wyjscie zrzutu urywa sie PRZED linia
        # konca (albo przed samym POMIAR-ZRZUT) - pomiar zrzutu niepelny.
        echo "POMIAR-KTO=deploy"
        exit 0
    fi
    if [ "${ATRAPA_ZRZUT_ZERO_POMIAR:-0}" = "1" ]; then
        # kanal zrzutu konczy sie ZEREM, ale bez ani jednego wiersza
        # POMIAR- w ogole - rozne od ATRAPA_ZRZUT_KANAL (tam kanal sam
        # konczy sie niezerowo): tu polaczenie doszlo i wyszlo zerem, ale
        # tresc zdalna nie zdazyla wypisac ani jednego echo, np. padla tuz
        # przed pierwszym z nich.
        exit 0
    fi
    echo "POMIAR-ZRZUT=${ATRAPA_ZRZUT:-ok}"
    echo "POMIAR-KONIEC-ZRZUT=0"
    exit 0
fi

if [ "$FAZA" = "warunki" ]; then
    if [ -e "$ATRAPA_PO_ZALOZENIU" ]; then
        # Pomiar PO zalozeniu ma prawo pokazac inny stan niz pomiar przed nim -
        # inaczej "zmierz ponownie" nie dalo by sie odroznic od "przepisz".
        W_WLASCICIEL="${ATRAPA_WLASCICIEL_PO:-deploy:deploy}"
        W_PRAWA="${ATRAPA_PRAWA_PO:-700}"
        W_ZAPIS="${ATRAPA_ZAPIS_PO:-tak}"
        W_ISTNIEJE="${ATRAPA_ISTNIEJE_PO:-tak}"
    else
        W_WLASCICIEL="${ATRAPA_WLASCICIEL:-root:root}"
        W_PRAWA="${ATRAPA_PRAWA:-755}"
        W_ZAPIS="${ATRAPA_ZAPIS:-tak}"
        W_ISTNIEJE="${ATRAPA_ISTNIEJE:-tak}"
    fi
    echo "POMIAR-KTO=${ATRAPA_KTO:-deploy}"
    echo "POMIAR-KOPIE-ISTNIEJE=$W_ISTNIEJE"
    echo "POMIAR-KOPIE-WLASCICIEL=$W_WLASCICIEL"
    echo "POMIAR-KOPIE-PRAWA=$W_PRAWA"
    echo "POMIAR-KOPIE-ZAPIS=$W_ZAPIS"
    echo "POMIAR-KOPIE-WOLNE-KB=${ATRAPA_WOLNE:-4194304}"
    echo "POMIAR-RODZIC-ISTNIEJE=tak"
    echo "POMIAR-RODZIC-WLASCICIEL=${ATRAPA_RODZIC_WLASCICIEL:-root:root}"
    echo "POMIAR-RODZIC-PRAWA=755"
    echo "POMIAR-RODZIC-ZAPIS=${ATRAPA_RODZIC_ZAPIS:-nie}"
    echo "POMIAR-RODZIC-WOLNE-KB=${ATRAPA_WOLNE:-4194304}"
    if [ "${ATRAPA_REPO_BRAK:-0}" = "1" ]; then
        # Zadna ze znanych sciezek nie ma .git - dokladnie jak na prawdziwym
        # hoscie, zanim przyrzad zaczal mierzyc.
        echo "POMIAR-HEAD=brak-repozytorium"
        echo "POMIAR-REPO=brak"
        echo "POMIAR-FETCH=brak-repozytorium"
        echo "POMIAR-SHA-NA-ZDALNYM=nie"
        echo "POMIAR-REPO-DRZEWO-LINII=-1"
        echo "POMIAR-REPO-DRZEWO-LISTA="
    else
        if [ -e "$ATRAPA_PO_ZALOZENIU" ] && [ -n "${ATRAPA_CZUBEK_HEAD_PO:-}" ]; then
            # Pomiar PO checkoucie ma prawo pokazac inny czubek niz pomiar
            # przed nim - inaczej "zmierz ponownie" nie dalo by sie odroznic
            # od "przepisz poprzedni wynik".
            echo "POMIAR-HEAD=$ATRAPA_CZUBEK_HEAD_PO"
        elif [ -n "${ATRAPA_HEAD_POMIAR_NR:-}" ] && [ "$(cat "$ATRAPA_LICZNIK" 2>/dev/null)" = "$ATRAPA_HEAD_POMIAR_NR" ]; then
            # odpowiada INNA wartoscia na KONKRETNE (numerowane wg
            # licznika wywolan atrapy) wywolanie pomiaru "warunki" w tym
            # samym biegu - niezaleznie od znacznika $ATRAPA_PO_ZALOZENIU
            # (ktory na sciezce NIEUDANEGO zrzutu nigdy nie powstaje, bo
            # checkout tam sie nie odbywa). Uzywane do dowodu, ze drugi
            # pomiar czubka PO nieudanym zrzucie jest PRAWDZIWYM, ODREBNYM
            # odczytem, a nie przepisaniem pierwszego: mutacja, ktora by go
            # przepisala, zwrocilaby tu STARA wartosc
            # ($ATRAPA_HEAD), nie te.
            echo "POMIAR-HEAD=${ATRAPA_HEAD_INNY:-$ATRAPA_SHA}"
        else
            echo "POMIAR-HEAD=${ATRAPA_HEAD:-$ATRAPA_SHA}"
        fi
        echo "POMIAR-REPO=${ATRAPA_REPO:-/opt/psychon/app}"
        if [ "${ATRAPA_FETCH_OMIN:-0}" != "1" ]; then
            echo "POMIAR-FETCH=${ATRAPA_FETCH:-ok}"
        fi
        echo "POMIAR-SHA-NA-ZDALNYM=${ATRAPA_SHA_ZDALNY:-tak}"
        echo "POMIAR-REPO-DRZEWO-LINII=${ATRAPA_REPO_DRZEWO:-0}"
        echo "POMIAR-REPO-DRZEWO-LISTA=${ATRAPA_REPO_DRZEWO_LISTA:-}"
    fi
    echo "POMIAR-KONIEC=0"
    exit 0
fi

if [ -n "${ATRAPA_WDROZENIE_KANAL:-}" ]; then
    # Kanal pada, zanim czesc zdalna cokolwiek wypisze: zadnego wiersza POWOD=.
    echo "ssh: connect to host $ATRAPA_ADRES port 22: Connection reset" >&2
    exit "$ATRAPA_WDROZENIE_KANAL"
fi
if [ -n "${ATRAPA_WDROZENIE_POWOD:-}" ]; then
    # Kanal DOSZEDL, odmowil host - dokladnie tak, jak robi to czesc zdalna.
    echo "[ZDALNIE] POWOD=$ATRAPA_WDROZENIE_POWOD"
    echo "[ZDALNIE] odmowa czesci zdalnej: $ATRAPA_WDROZENIE_POWOD"
    exit "${ATRAPA_WDROZENIE_KOD:-6}"
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
zeruj() {
    echo 0 > "$ATRAPA_LICZNIK"
    : > "$ATRAPA_ARGI"
    : > "$ATRAPA_TRESC"
    rm -f "$ATRAPA_PO_ZALOZENIU"
}
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

przypadek "warunek (c'): zadany commit NIE istnieje na zdalnym po fetch - kod 13"
zeruj
ATRAPA_SHA_ZDALNY=nie HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "13"
rowne "wystapien 'pg_dump' w wyjsciu" "$(grep -c 'pg_dump' "$WYJ")" "0"
rowne "wystapien 'migrate' w wyjsciu" "$(grep -c 'migrate' "$WYJ")" "0"
grep -q 'WARUNEK c. NIEZALICZONY' "$WYJ" || zle "brak wiersza nazywajacego warunek (c)"
grep -q 'istnieje na zdalnym po fetch' "$WYJ" || zle "komunikat nie mowi o fetchu ani o zdalnym"
grep 'WARUNEK c' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "warunek (c'): sam fetch od zdalnego nieudany - kod 13, rozny od braku repozytorium (15)"
zeruj
ATRAPA_FETCH=nie-udalo-sie HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "13"
grep -q 'WARUNEK c. NIEZALICZONY' "$WYJ" || zle "brak wiersza nazywajacego warunek (c)"
grep -q 'fetch od zdalnego nie powiodl sie' "$WYJ" || zle "komunikat nie nazywa nieudanego fetcha"
grep 'WARUNEK c' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "warunek (c'): brakujace pole POMIAR-FETCH nigdy nie wypada zielono (bezpieczne domkniecie na niepelnym odczycie)"
zeruj
ATRAPA_FETCH_OMIN=1 HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc (brakujacy odczyt = czerwien, nigdy 0)" "$RC" "13"
koniec_przypadku

przypadek "warunek (d): drzewo robocze na hoscie brudne - kod 16, odmowa niesie liste pozycji"
zeruj
ATRAPA_REPO_DRZEWO=2 ATRAPA_REPO_DRZEWO_LISTA=" M app/foo.php; M app/bar.php;" \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "16"
grep -q 'WARUNEK d. NIEZALICZONY' "$WYJ" || zle "brak wiersza nazywajacego warunek (d)"
# Lista pozycji MUSI byc w samym wierszu odmowy, nie tylko gdzies w surowym
# pomiarze wypisanym wyzej (ten wypisuje POMIAR-REPO-DRZEWO-LISTA zawsze,
# niezaleznie od tego, czy odmowa cokolwiek z niej cytuje).
WIERSZ_D="$(grep 'WARUNEK d. NIEZALICZONY' "$WYJ")"
case "$WIERSZ_D" in
    *"app/foo.php"*) : ;;
    *) zle "wiersz odmowy warunku (d) nie wymienia pierwszej brudnej pozycji" ;;
esac
case "$WIERSZ_D" in
    *"app/bar.php"*) : ;;
    *) zle "wiersz odmowy warunku (d) nie wymienia drugiej brudnej pozycji" ;;
esac
grep 'WARUNEK d' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "sciezka repozytorium: zmierzona i zameldowana wlasnym wierszem POMIAR-REPO"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --warunki-wstepne > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "0"
rowne "wierszy POMIAR-REPO= w wyjsciu" "$(grep -c '^POMIAR-REPO=' "$WYJ")" "1"
grep -q 'WARUNEK repo. ZALICZONY' "$WYJ" || zle "brak wiersza nazywajacego zaliczony warunek repo"
rowne "wystapien '/opt/psychon' (niezamaskowanej sciezki stosu) w wyjsciu" "$(grep -c '/opt/psychon' "$WYJ")" "0"
grep -E 'POMIAR-REPO=|WARUNEK repo' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "sciezka repozytorium: zadna ze znanych sciezek nie ma .git - wlasny kod 15, rozny od 13"
zeruj
ATRAPA_REPO_BRAK=1 HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "15"
rowne "rc rozny od warunku (c)" "$([ "$RC" -ne 13 ] && echo tak || echo nie)" "tak"
grep -q 'WARUNEK repo. NIEZALICZONY' "$WYJ" || zle "brak wiersza nazywajacego niezaliczony warunek repo"
grep -q 'psychon-platforma' "$WYJ" || zle "komunikat nie wymienia pierwszego (starego) kandydata"
grep -q '/app' "$WYJ" || zle "komunikat nie wymienia drugiego kandydata"
grep 'WARUNEK repo' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "sciezka repozytorium: stara stala zostaje jako PIERWSZY kandydat (nie skasowana)"
grep -q 'REPO_HOSTA_DOMYSLNY="\${PSYCHON_REPO_HOSTA:-\$KATALOG_STOSU/psychon-platforma}"' "$PRZYRZAD" \
    || zle "stara stala domyslna zniknela albo zmienila brzmienie"
grep -q 'KANDYDACI_REPO_HOSTA=("\$REPO_HOSTA_DOMYSLNY" "\$KATALOG_STOSU/app")' "$PRZYRZAD" \
    || zle "stara stala nie jest pierwszym kandydatem w liscie"
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

# --- przypadki trybu --zaloz-katalog-kopii ---------------------------------
# Wspolny uklad atrapy dla sciezki, na ktorej wolno cokolwiek zalozyc: katalog
# nadrzedny nalezy do konta wdrazajacego i jest zapisywalny (tak jak zmierzono
# na hoscie), a sam katalog kopii jest cudzy.
RODZIC_NASZ=(ATRAPA_RODZIC_WLASCICIEL=deploy:deploy ATRAPA_RODZIC_ZAPIS=tak)

przypadek "tryb jawny: sam pomiar warunkow niczego nie zaklada"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --warunki-wstepne > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "0"
rowne "wywolan atrapy ssh" "$(licznik)" "1"
rowne "wystapien 'mv ' w tresci wyslanej na hosta" "$(grep -c 'mv ' "$ATRAPA_TRESC")" "0"
rowne "wystapien 'mkdir' w tresci wyslanej na hosta" "$(grep -c 'mkdir' "$ATRAPA_TRESC")" "0"
rowne "wystapien 'umask' w tresci wyslanej na hosta" "$(grep -c 'umask' "$ATRAPA_TRESC")" "0"
rowne "wystapien nazwy docelowej w przechwyconych argumentach" "$(grep -o 'zastane-' "$ATRAPA_ARGI" | grep -c .)" "0"
rowne "wywolan fazy zakladania w argumentach" "$(grep -c 'bash -s -- zaloz' "$ATRAPA_ARGI")" "0"
wiekszy_od_zera "wystapien sciezki katalogu kopii w argumentach kroku pomiaru" "$(grep 'bash -s -- warunki' "$ATRAPA_ARGI" | grep -o 'kopie-bazy' | grep -c .)"
echo "  bajtow tresci wyslanej na hosta: $(wc -c < "$ATRAPA_TRESC")"
koniec_przypadku

przypadek "tryb jawny: bieg pelny tez niczego nie zaklada (jedyny mkdir to katalog logu)"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "0"
rowne "wystapien 'mv ' w tresci" "$(grep -c 'mv ' "$ATRAPA_TRESC")" "0"
rowne "wystapien 'umask' w tresci" "$(grep -c 'umask' "$ATRAPA_TRESC")" "0"
rowne "wystapien nazwy docelowej w przechwyconych argumentach" "$(grep -o 'zastane-' "$ATRAPA_ARGI" | grep -c .)" "0"
rowne "wierszy z 'mkdir' w tresci" "$(grep -c 'mkdir' "$ATRAPA_TRESC")" "1"
echo "  jedyny wiersz z mkdir: $(grep -n 'mkdir' "$ATRAPA_TRESC")"
rowne "wystapien katalogu kopii w argumentach kroku wdrozenia" "$(grep 'bash -s -- wdrozenie' "$ATRAPA_ARGI" | grep -o 'kopie-bazy' | grep -c .)" "0"
wiekszy_od_zera "wystapien katalogu kopii w argumentach kroku pomiaru" "$(grep 'bash -s -- warunki' "$ATRAPA_ARGI" | grep -o 'kopie-bazy' | grep -c .)"
echo "  argumenty kroku wdrozenia: $(grep -o 'bash -s -- wdrozenie.*' "$ATRAPA_ARGI")"
koniec_przypadku

przypadek "katalog nadrzedny cudzy: kod 31, ani jednego mv i mkdir na hoscie"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "31"
rowne "wywolan atrapy ssh (sam pomiar)" "$(licznik)" "1"
rowne "wystapien 'mv ' w tresci wyslanej na hosta" "$(grep -c 'mv ' "$ATRAPA_TRESC")" "0"
rowne "wystapien 'mkdir' w tresci wyslanej na hosta" "$(grep -c 'mkdir' "$ATRAPA_TRESC")" "0"
rowne "wystapien 'umask' w tresci wyslanej na hosta" "$(grep -c 'umask' "$ATRAPA_TRESC")" "0"
rowne "wystapien adresu w wyjsciu" "$(grep -c "$ADRES" "$WYJ")" "0"
grep 'KATALOG-KOPII' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "katalog cudzy: przeniesiony obok, nie skasowany; umask przed mkdir; pomiar po zmianie"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_ZAPIS=nie ATRAPA_WLASCICIEL=root:root ATRAPA_POZYCJI=7 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "0"
rowne "wywolan atrapy ssh (pomiar + zalozenie + pomiar)" "$(licznik)" "3"
rowne "wystapien 'mv ' w tresci wyslanej na hosta" "$(grep -c 'mv ' "$ATRAPA_TRESC")" "1"
rowne "wystapien 'rm ' w tresci wyslanej na hosta" "$(grep -c 'rm ' "$ATRAPA_TRESC")" "0"
rowne "wystapien 'rmdir' w tresci wyslanej na hosta" "$(grep -c 'rmdir' "$ATRAPA_TRESC")" "0"
rowne "zadan przeniesienia w argumentach (konczy sie na 'tak')" "$(grep -c 'bash -s -- zaloz .* tak$' "$ATRAPA_ARGI")" "1"
wiekszy_od_zera "wystapien nazwy docelowej w przechwyconych argumentach" "$(grep -o 'zastane-' "$ATRAPA_ARGI" | grep -c .)"
echo "  argumenty kroku zakladania: $(grep -o 'bash -s -- zaloz.*' "$ATRAPA_ARGI")"
rowne "linii z nazwa docelowa i liczba pozycji" "$(grep -c 'zastane-.*pozycji w srodku: 7' "$WYJ")" "1"
rowne "wystapien 'pg_dump' w wyjsciu" "$(grep -c 'pg_dump' "$WYJ")" "0"
rowne "wystapien '[ZDALNIE]' w wyjsciu (krok wdrozenia nie rusza)" "$(grep -c 'ZDALNIE' "$WYJ")" "0"
rowne "wystapien 'KONTROLA' w wyjsciu (krok wdrozenia nie rusza)" "$(grep -c 'KONTROLA' "$WYJ")" "0"
UM="$(grep -n 'umask 077' "$ATRAPA_TRESC" | head -1 | cut -d: -f1)"
MK="$(grep -n 'mkdir' "$ATRAPA_TRESC" | head -1 | cut -d: -f1)"
echo "  wiersz umask: $UM ($(grep -n 'umask 077' "$ATRAPA_TRESC" | head -1))"
echo "  wiersz mkdir: $MK ($(grep -n 'mkdir' "$ATRAPA_TRESC" | head -1))"
if [ -n "$UM" ] && [ -n "$MK" ] && [ "$UM" -lt "$MK" ]; then
    echo "  umask 077 stoi PRZED mkdir: tak"
else
    zle "umask 077 nie stoi przed mkdir (umask=$UM, mkdir=$MK)"
fi
rowne "linii pomiaru PRZED zmiana" "$(grep -c 'KATALOG-KOPII przed. katalog kopii .*wlasciciel=.*prawa=.*zapis=.*wolne=' "$WYJ")" "1"
rowne "linii pomiaru PO zmianie" "$(grep -c 'KATALOG-KOPII po. katalog kopii .*wlasciciel=.*prawa=.*zapis=.*wolne=' "$WYJ")" "1"
rowne "wystapien adresu w wyjsciu" "$(grep -c "$ADRES" "$WYJ")" "0"
grep -E 'KATALOG-KOPII (przed|po)' "$WYJ" | sed 's/^/    | /'
grep -E 'zastany katalog|zalozony|ZALICZONY' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "katalog juz wlasny: nie ma czego przenosic, zadnego mv na hoscie"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_WLASCICIEL=deploy:deploy ATRAPA_ZAPIS=tak \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "0"
rowne "wywolan atrapy ssh (pomiar + zalozenie + pomiar)" "$(licznik)" "3"
rowne "zadan przeniesienia w argumentach (konczy sie na 'nie')" "$(grep -c 'bash -s -- zaloz .* nie$' "$ATRAPA_ARGI")" "1"
rowne "linii 'nie ma czego przenosic'" "$(grep -c 'nie ma czego przenosic' "$WYJ")" "1"
rowne "wystapien 'rm ' w tresci wyslanej na hosta" "$(grep -c 'rm ' "$ATRAPA_TRESC")" "0"
grep -E 'nie ma czego przenosic|zastany katalog' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "katalog kopii nie istnieje: zakladany od zera, bez przenoszenia czegokolwiek"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_ISTNIEJE=nie ATRAPA_WLASCICIEL=brak ATRAPA_PRAWA=brak ATRAPA_ZAPIS=nie \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "0"
rowne "wywolan atrapy ssh (pomiar + zalozenie + pomiar)" "$(licznik)" "3"
rowne "zadan przeniesienia w argumentach (konczy sie na 'nie')" "$(grep -c 'bash -s -- zaloz .* nie$' "$ATRAPA_ARGI")" "1"
rowne "linii pomiaru PRZED zmiana z istnieje=nie" "$(grep -c 'KATALOG-KOPII przed. katalog kopii .*istnieje=nie' "$WYJ")" "1"
rowne "linii pomiaru PO zmianie z istnieje=tak" "$(grep -c 'KATALOG-KOPII po. katalog kopii .*istnieje=tak' "$WYJ")" "1"
rowne "linii 'nie ma czego przenosic'" "$(grep -c 'nie ma czego przenosic: istnieje=nie' "$WYJ")" "1"
rowne "wystapien 'rm ' w tresci wyslanej na hosta" "$(grep -c 'rm ' "$ATRAPA_TRESC")" "0"
rowne "wierszy 'mkdir' w tresci wyslanej na hosta" "$(grep -c 'mkdir' "$ATRAPA_TRESC")" "1"
rowne "linii ZALICZONY w wyjsciu" "$(grep -c 'KATALOG-KOPII. ZALICZONY' "$WYJ")" "1"
grep -E 'nie ma czego przenosic|zalozony|ZALICZONY' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "nazwa docelowa zajeta: kod 34, zastane nie rusza sie z miejsca"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_ZAPIS=nie ATRAPA_ZASTANY_ZAJETY=1 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "34"
rowne "wywolan atrapy ssh (pomiar + odmowa, bez pomiaru po)" "$(licznik)" "2"
rowne "linii nazywajacej zajeta nazwe docelowa" "$(grep -c 'jest juz zajeta' "$WYJ")" "1"
rowne "linii ZALICZONY w wyjsciu" "$(grep -c 'KATALOG-KOPII. ZALICZONY' "$WYJ")" "0"
rowne "linii mowiacych, ze zastane zostaje" "$(grep -c 'zostaje nietkniety' "$WYJ")" "1"
SPR="$(grep -n 'if \[ -e "\$ZASTANY" \]' "$ATRAPA_TRESC" | head -1 | cut -d: -f1)"
MV="$(grep -n 'mv ' "$ATRAPA_TRESC" | head -1 | cut -d: -f1)"
echo "  wiersz sprawdzenia celu: $SPR, wiersz mv: $MV"
if [ -n "$SPR" ] && [ -n "$MV" ] && [ "$SPR" -lt "$MV" ]; then
    echo "  sprawdzenie celu stoi PRZED mv: tak"
else
    zle "sprawdzenie istnienia celu nie stoi przed mv (sprawdzenie=$SPR, mv=$MV)"
fi
grep -E 'zajeta|zostaje nietkniety' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "czesc zdalna kroku zakladania odmawia: kod 33 i slowo NIEZALICZONY"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_ZAPIS=nie ATRAPA_ZALOZ_BLAD=mv \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "33"
rowne "wywolan atrapy ssh (pomiar + krok zakladania, bez pomiaru po)" "$(licznik)" "2"
rowne "linii NIEZALICZONY z kodem hosta" "$(grep -c 'KATALOG-KOPII. NIEZALICZONY: krok zakladania na hoscie' "$WYJ")" "1"
rowne "linii mylacych to z kanalem" "$(grep -c 'kanal zdalny nie doszedl' "$WYJ")" "0"
rowne "linii ZALICZONY w wyjsciu" "$(grep -c 'KATALOG-KOPII. ZALICZONY' "$WYJ")" "0"
grep -E 'NIEZALICZONY' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "kanal pada w kroku zakladania: kod kanalu na wierzchu, nie 33"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_ZAPIS=nie ATRAPA_ZALOZ_KANAL=255 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc (kod kanalu, nie kod hosta)" "$RC" "255"
rowne "linii mowiacych o kanale" "$(grep -c 'kanal zdalny nie doszedl' "$WYJ")" "1"
rowne "linii o odmowie czesci zdalnej" "$(grep -c 'krok zakladania na hoscie' "$WYJ")" "0"
rowne "wystapien adresu w wyjsciu" "$(grep -c "$ADRES" "$WYJ")" "0"
grep -E 'kanal zdalny' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "krok zakladania urywa sie kodem 0 PO PRZENIESIENIU, bez zadnej linii POMIAR- dalej: stan NIEZNANY (37), nie 33"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_ZAPIS=nie ATRAPA_ZALOZ_URWANY=1 ATRAPA_POZYCJI=3 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "37"
rowne "rc rozny od stanu nienaruszonego" "$([ "$RC" -ne 33 ] && echo tak || echo nie)" "tak"
rowne "rc rozny od zajetej nazwy docelowej" "$([ "$RC" -ne 34 ] && echo tak || echo nie)" "tak"
rowne "rc rozny od stanu polowicznego potwierdzonego" "$([ "$RC" -ne 35 ] && echo tak || echo nie)" "tak"
rowne "rc rozny od stanu docelowego potwierdzonego" "$([ "$RC" -ne 36 ] && echo tak || echo nie)" "tak"
rowne "wywolan atrapy ssh (pomiar + krok zakladania, bez pomiaru po)" "$(licznik)" "2"
rowne "linii mowiacych, ze stan jest nieznany" "$(grep -c 'stan hosta: NIEZNANY' "$WYJ")" "1"
rowne "linii mylnie mowiacych, ze nic sie nie ruszylo" "$(grep -c 'nic nie zostalo ruszone' "$WYJ")" "0"
rowne "linii wskazujacych na mozliwa nazwe zastana do recznego sprawdzenia" "$(grep -c 'zastane-.*sprawdz recznie' "$WYJ")" "1"
grep -E 'stan hosta|NIEZALICZONY' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "krok zakladania urywa sie kodem 0 PO PRZENIESIENIU, PRZED linia mkdir: stan NIEZNANY (37), nie 35 - bliznacza dziura, kierunek mniej grozny"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_ZAPIS=nie ATRAPA_ZALOZ_URWANY_MKDIR=1 ATRAPA_POZYCJI=2 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "37"
rowne "rc rozny od stanu polowicznego potwierdzonego (mkdir zmierzony jako nieudany)" "$([ "$RC" -ne 35 ] && echo tak || echo nie)" "tak"
rowne "wywolan atrapy ssh (pomiar + krok zakladania, bez pomiaru po)" "$(licznik)" "2"
rowne "linii mowiacych, ze stan jest nieznany" "$(grep -c 'stan hosta: NIEZNANY' "$WYJ")" "1"
rowne "linii mylnie mowiacych 'nowego katalogu NIE zalozylem'" "$(grep -c 'nowego katalogu NIE zalozylem' "$WYJ")" "0"
grep -E 'stan hosta|NIEZALICZONY' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "kanal pada w POMIARZE PO ZMIANIE: krok zakladania juz potwierdzony - stan 36, nie surowy kod kanalu (255)"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_ZAPIS=nie ATRAPA_POMIAR_PO_KANAL=255 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc (zmierzony stan hosta, nie surowy kod kanalu)" "$RC" "36"
rowne "rc rozny od surowego kodu kanalu uzytego przy kroku zakladania" "$([ "$RC" -ne 255 ] && echo tak || echo nie)" "tak"
rowne "wywolan atrapy ssh (pomiar + zalozenie + pomiar-po ktory pada)" "$(licznik)" "3"
rowne "linii mowiacych o stanie docelowym" "$(grep -c 'stan docelowy osiagniety' "$WYJ")" "1"
rowne "linii mowiacych o kodzie pomiaru po zmianie" "$(grep -c 'pomiar po zmianie nie doszedl (kod 255)' "$WYJ")" "1"
grep -E 'pomiar po zmianie|stan hosta' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "katalog logow stacji niezapisywalny: kod 10 przed pierwszym siegnieciem hosta"
zeruj
PRZESZKODA="$KATALOG/nie-jest-katalogiem"
: > "$PRZESZKODA"
PSYCHON_KATALOG_LOGOW="$PRZESZKODA/logi" HOST_BRAMKOWY="$ADRES" \
    "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "10"
rowne "wywolan atrapy ssh" "$(licznik)" "0"
rowne "linii ZALICZONY w wyjsciu" "$(grep -c 'ZALICZONY' "$WYJ")" "0"
rowne "linii podajacych kopie lokalna" "$(grep -c 'kopia lokalna:' "$WYJ")" "0"
rowne "linii nazywajacych katalog logow" "$(grep -c 'Katalog logow' "$WYJ")" "1"
sed 's/^/    | /' "$WYJ"
koniec_przypadku

przypadek "ten sam warunek w biegu pelnym: kod 10, zadnego wdrozenia"
zeruj
PSYCHON_KATALOG_LOGOW="$KATALOG/nie-jest-katalogiem/logi" HOST_BRAMKOWY="$ADRES" \
    "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "10"
rowne "wywolan atrapy ssh" "$(licznik)" "0"
rowne "wystapien 'pg_dump' w wyjsciu" "$(grep -c 'pg_dump' "$WYJ")" "0"
koniec_przypadku

przypadek "maska zaslania konto wdrozeniowe i sciezke stosu, nazwe katalogu zostawia czytelna"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_ZAPIS=nie ATRAPA_POZYCJI=3 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "0"
rowne "wystapien konta wdrozeniowego w wyjsciu" "$(grep -o 'deploy' "$WYJ" | grep -c .)" "0"
rowne "wystapien sciezki stosu w wyjsciu" "$(grep -o '/opt/psychon' "$WYJ" | grep -c .)" "0"
rowne "wystapien adresu w wyjsciu" "$(grep -c "$ADRES" "$WYJ")" "0"
wiekszy_od_zera "wystapien nazwy katalogu kopii" "$(grep -o 'kopie-bazy' "$WYJ" | grep -c .)"
wiekszy_od_zera "wystapien maski konta" "$(grep -c 'KONTO-UKRYTE' "$WYJ")"
wiekszy_od_zera "wystapien maski sciezki" "$(grep -c 'SCIEZKA-UKRYTA' "$WYJ")"
KOPIA="$(grep -o 'kopia lokalna: .*' "$WYJ" | tail -1 | sed 's/kopia lokalna: //')"
if [ -f "$KOPIA" ]; then
    rowne "wystapien konta w kopii lokalnej" "$(grep -o 'deploy' "$KOPIA" | grep -c .)" "0"
    rowne "wystapien sciezki stosu w kopii lokalnej" "$(grep -o '/opt/psychon' "$KOPIA" | grep -c .)" "0"
else
    zle "nie ma pliku kopii lokalnej: $KOPIA"
fi
grep -E 'KATALOG-KOPII (przed|po)|zastany katalog' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "konto zmierzone na hoscie o innej nazwie tez nie pada w wyjsciu"
zeruj
env ATRAPA_KTO=wdrozeniowiec ATRAPA_RODZIC_WLASCICIEL=wdrozeniowiec:wdrozeniowiec \
    ATRAPA_RODZIC_ZAPIS=tak ATRAPA_ZAPIS=nie ATRAPA_WLASCICIEL_PO=wdrozeniowiec:wdrozeniowiec \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "0"
rowne "wystapien nazwy konta zmierzonego na hoscie" "$(grep -o 'wdrozeniowiec' "$WYJ" | grep -c .)" "0"
wiekszy_od_zera "linii nazywajacych rozjazd kont" "$(grep -c 'KONTO-INNE-NIZ-ZADANE' "$WYJ")"
grep -E 'uzytkownik wdrazajacy|KONTO-INNE' "$WYJ" | head -4 | sed 's/^/    | /'
koniec_przypadku

przypadek "czesc zdalna kroku wdrozenia odmawia brakiem repozytorium: kod 26, nie 2"
zeruj
ATRAPA_WDROZENIE_POWOD=brak-repozytorium ATRAPA_WDROZENIE_KOD=6 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "26"
rowne "rc rozny od kodu uzycia" "$([ "$RC" -ne 2 ] && echo tak || echo nie)" "tak"
rowne "wywolan atrapy ssh (warunki + wdrozenie)" "$(licznik)" "2"
rowne "linii NIEZALICZONY nazywajacej brak repozytorium" "$(grep -c 'WDROZENIE. NIEZALICZONY: na hoscie nie ma repozytorium' "$WYJ")" "1"
rowne "linii mylacych to z kanalem" "$(grep -c 'kanal zdalny nie doszedl' "$WYJ")" "0"
grep -E 'ZDALNIE|NIEZALICZONY' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "czesc zdalna kroku wdrozenia odmawia brakiem katalogu logu: kod 27, nie 2"
zeruj
ATRAPA_WDROZENIE_POWOD=brak-katalogu-logu ATRAPA_WDROZENIE_KOD=7 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "27"
rowne "rc rozny od kodu uzycia" "$([ "$RC" -ne 2 ] && echo tak || echo nie)" "tak"
rowne "rc rozny od kodu poprzedniego powodu" "$([ "$RC" -ne 26 ] && echo tak || echo nie)" "tak"
rowne "linii NIEZALICZONY nazywajacej katalog logu" "$(grep -c 'WDROZENIE. NIEZALICZONY: na hoscie nie dalo sie zalozyc katalogu logu' "$WYJ")" "1"
rowne "linii mylacych to z kanalem" "$(grep -c 'kanal zdalny nie doszedl' "$WYJ")" "0"
grep -E 'NIEZALICZONY' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "kanal pada w kroku wdrozenia: kod kanalu na wierzchu, nie kod hosta"
zeruj
ATRAPA_WDROZENIE_KANAL=255 HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc (kod kanalu)" "$RC" "255"
rowne "linii mowiacych o kanale" "$(grep -c 'kanal zdalny nie doszedl' "$WYJ")" "1"
rowne "linii o odmowie hosta" "$(grep -c 'kanal doszedl, odmowil host' "$WYJ")" "0"
rowne "wystapien adresu w wyjsciu" "$(grep -c "$ADRES" "$WYJ")" "0"
grep -E 'kanal zdalny' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "blad uzycia zostaje wylacznie kodem 2"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" abc > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "2"
rowne "wywolan atrapy ssh" "$(licznik)" "0"
rowne "linii o hoscie w wyjsciu" "$(grep -c 'ZDALNIE\|kanal' "$WYJ")" "0"
koniec_przypadku

przypadek "mv sie udal, mkdir padl: kod 35 i meldunek mowi, ze katalog stoi juz obok"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_ZAPIS=nie ATRAPA_ZALOZ_BLAD=mkdir ATRAPA_POZYCJI=5 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "35"
rowne "rc rozny od kodu stanu nienaruszonego" "$([ "$RC" -ne 33 ] && echo tak || echo nie)" "tak"
rowne "wywolan atrapy ssh (pomiar + krok zakladania)" "$(licznik)" "2"
rowne "linii mowiacych, ze katalog stoi juz obok" "$(grep -c 'STOI JUZ OBOK pod nazwa .*zastane-' "$WYJ")" "1"
rowne "linii mowiacych, ze nic sie nie zmienilo" "$(grep -c 'nic nie zostalo ruszone\|zostal taki, jaki byl' "$WYJ")" "0"
rowne "linii z pomiarem przeniesienia nad meldunkiem" "$(grep -c '^POMIAR-PRZENIESIONY=.*zastane-' "$WYJ")" "1"
rowne "linii ZALICZONY w wyjsciu" "$(grep -c 'KATALOG-KOPII. ZALICZONY' "$WYJ")" "0"
grep -E 'POMIAR-PRZENIESIONY|POMIAR-ZALOZONY|stan hosta|NIEZALICZONY' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "mv padl: kod 33 i meldunek mowi, ze nic nie zostalo ruszone"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_ZAPIS=nie ATRAPA_ZALOZ_BLAD=mv \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "33"
rowne "rc rozny od kodu stanu przeniesionego" "$([ "$RC" -ne 35 ] && echo tak || echo nie)" "tak"
rowne "linii mowiacych, ze nic nie zostalo ruszone" "$(grep -c 'nic nie zostalo ruszone' "$WYJ")" "1"
rowne "linii mowiacych, ze katalog stoi obok" "$(grep -c 'STOI JUZ OBOK' "$WYJ")" "0"
grep -E 'stan hosta|NIEZALICZONY' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "pomiar po zmianie urwany: kod 36, bo przeniesione i zalozone"
zeruj
env "${RODZIC_NASZ[@]}" ATRAPA_ZAPIS=nie ATRAPA_POMIAR_PO_URWANY=1 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --zaloz-katalog-kopii > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "36"
rowne "rc rozny od kodu stanu nienaruszonego" "$([ "$RC" -ne 33 ] && echo tak || echo nie)" "tak"
rowne "rc rozny od kodu stanu polowicznego" "$([ "$RC" -ne 35 ] && echo tak || echo nie)" "tak"
rowne "wywolan atrapy ssh (pomiar + zalozenie + pomiar)" "$(licznik)" "3"
rowne "linii mowiacych o stanie docelowym" "$(grep -c 'stan docelowy osiagniety' "$WYJ")" "1"
rowne "linii mowiacych, ze zmiany juz zaszly" "$(grep -c 'zmiany na hoscie JUZ zaszly' "$WYJ")" "1"
rowne "linii ZALICZONY w wyjsciu" "$(grep -c 'KATALOG-KOPII. ZALICZONY' "$WYJ")" "0"
grep -E 'stan hosta|NIEZALICZONY' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "ladunek kroku wdrozenia nie niesie ani jednego kasowania"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "0"
rowne "wywolan atrapy ssh (warunki + wdrozenie)" "$(licznik)" "2"
rowne "wystapien 'rm ' w tresci wyslanej na hosta" "$(grep -c 'rm ' "$ATRAPA_TRESC")" "0"
rowne "wystapien 'rmdir' w tresci wyslanej na hosta" "$(grep -c 'rmdir' "$ATRAPA_TRESC")" "0"
rowne "wystapien 'unlink' w tresci wyslanej na hosta" "$(grep -c 'unlink' "$ATRAPA_TRESC")" "0"
rowne "wystapien 'find .* -delete' w tresci wyslanej na hosta" "$(grep -c 'delete' "$ATRAPA_TRESC")" "0"
rowne "wywolan fazy wdrozenia w argumentach" "$(grep -c 'bash -s -- wdrozenie' "$ATRAPA_ARGI")" "1"
echo "  bajtow ladunku biegu pelnego: $(wc -c < "$ATRAPA_TRESC")"
koniec_przypadku

# --- przypadki trybu --ustaw-czubek ----------------------------------------
przypadek "ustaw-czubek: tryb jawny nie wlacza sie sam - ani w biegu pelnym, ani w --warunki-wstepne"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" > "$WYJ" 2>&1
RC=$?
rowne "rc biegu pelnego" "$RC" "0"
rowne "wywolan fazy czubek w argumentach (bieg pelny)" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "0"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --warunki-wstepne > "$WYJ" 2>&1
RC=$?
rowne "rc --warunki-wstepne" "$RC" "0"
rowne "wywolan fazy czubek w argumentach (--warunki-wstepne)" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "0"
koniec_przypadku

przypadek "ustaw-czubek: czubek na hoscie juz rowny zadanemu SHA - kod 40, zaden checkout"
zeruj
HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "40"
rowne "wywolan atrapy ssh (sam pomiar, bez checkout)" "$(licznik)" "1"
rowne "wywolan fazy czubek w argumentach" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "0"
grep -q 'nic nie ruszam' "$WYJ" || zle "brak zdania o nieruszaniu stanu hosta"
grep 'CZUBEK' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "ustaw-czubek: drzewo robocze na hoscie brudne - kod 43, odmowa PRZED fetchem/checkoutem"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_REPO_DRZEWO=1 ATRAPA_REPO_DRZEWO_LISTA=" M zmieniony.php;" \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "43"
rowne "wywolan atrapy ssh (sam pomiar, bez checkout)" "$(licznik)" "1"
rowne "wywolan fazy czubek w argumentach" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "0"
# Pozycja MUSI byc w samym wierszu odmowy [CZUBEK], nie tylko gdzies w
# surowym pomiarze wypisanym wyzej (ten wypisuje POMIAR-REPO-DRZEWO-LISTA
# zawsze, niezaleznie od tego, czy odmowa cokolwiek z niej cytuje).
WIERSZ_CZUBEK_D="$(grep 'CZUBEK. NIEZALICZONY' "$WYJ")"
case "$WIERSZ_CZUBEK_D" in
    *"zmieniony.php"*) : ;;
    *) zle "wiersz odmowy nie wymienia brudnej pozycji" ;;
esac
case "$WIERSZ_CZUBEK_D" in
    *"NIE nadpisuje cudzych zmian"*) : ;;
    *) zle "brak zdania o nienadpisywaniu w wierszu odmowy" ;;
esac
grep 'CZUBEK' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "ustaw-czubek: fetch nie przyniosl zadanego commita - kod 42, zaden checkout"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_SHA_ZDALNY=nie \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "42"
rowne "wywolan atrapy ssh (sam pomiar, bez checkout)" "$(licznik)" "1"
rowne "wywolan fazy czubek w argumentach" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "0"
koniec_przypadku

przypadek "ustaw-czubek: sciezka repozytorium niezmierzona - kod 15, zaden checkout"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_REPO_BRAK=1 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "15"
rowne "wywolan atrapy ssh (sam pomiar, bez checkout)" "$(licznik)" "1"
koniec_przypadku

# --- warunek wstepny hosta (skrot deploy.sh) - MIERZONY PRZED
# zrzutem i checkoutem, wlasny kod 46 rozlaczny z 40-45/47. Dwie nogi
# zadane przez lidera: (1) STARY deploy.sh (skrot nieznany) -> kod 46, ZERO
# polecen zwyklego przeplywu (zero wywolan faz zrzut i czubek); (2) NOWY
# deploy.sh (domyslna atrapa, znany skrot) -> kod 46 NIE pada, przeplyw idzie
# dalej (juz dowiedzione w kazdym innym przypadku --ustaw-czubek nizej/wyzej,
# ktory dochodzi do zrzutu/checkoutu - tu osobny, jawny swiadek tej nogi).
przypadek "ustaw-czubek: deploy.sh na hoscie NIE zna trybu (stary skrot) - kod 46, ZERO polecen zwyklego przeplywu"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_DEPLOY_ZNA_TRYB=nie \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "46"
rowne "wywolan atrapy ssh (pomiar + sprawdz-tryb, bez zrzutu/checkoutu)" "$(licznik)" "2"
rowne "wywolan fazy zrzut w argumentach (ZERO polecen zwyklego przeplywu)" "$(grep -c 'bash -s -- zrzut' "$ATRAPA_ARGI")" "0"
rowne "wywolan fazy czubek w argumentach (ZERO polecen zwyklego przeplywu)" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "0"
grep -q 'NIE zna PSYCHON_TRYB_WDROZENIA' "$WYJ" || zle "brak zdania nazywajacego stary skrypt"
koniec_przypadku

przypadek "ustaw-czubek: na hoscie nie ma pliku deploy.sh - kod 46, ZERO polecen zwyklego przeplywu"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_DEPLOY_BRAK=1 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "46"
rowne "wywolan fazy zrzut w argumentach (ZERO polecen zwyklego przeplywu)" "$(grep -c 'bash -s -- zrzut' "$ATRAPA_ARGI")" "0"
rowne "wywolan fazy czubek w argumentach (ZERO polecen zwyklego przeplywu)" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "0"
koniec_przypadku

przypadek "ustaw-czubek: pomiar trybu deploy.sh urwany w polowie - NIE WIEM, kod 46 (nie 0/47), ZERO polecen"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_TRYB_URWANY=1 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc (NIE WIEM tez konczy 46, nie zgoda)" "$RC" "46"
rowne "wywolan fazy zrzut w argumentach (ZERO polecen zwyklego przeplywu)" "$(grep -c 'bash -s -- zrzut' "$ATRAPA_ARGI")" "0"
rowne "wywolan fazy czubek w argumentach (ZERO polecen zwyklego przeplywu)" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "0"
koniec_przypadku

przypadek "ustaw-czubek: kanal pada CALKOWICIE w kroku sprawdz-tryb - kod kanalu na wierzchu, nie 46"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_TRYB_KANAL=255 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc (kod kanalu, nie zmierzony stan)" "$RC" "255"
rowne "wywolan fazy zrzut w argumentach (ZERO polecen zwyklego przeplywu)" "$(grep -c 'bash -s -- zrzut' "$ATRAPA_ARGI")" "0"
grep -q 'kanal zdalny sprawdzenia trybu skryptu wdrozeniowego hosta nie doszedl' "$WYJ" || zle "brak zdania o kanale"
koniec_przypadku

przypadek "ustaw-czubek, druga noga: NOWY deploy.sh (skrot znany) -> kod 46 NIE pada, przeplyw idzie dalej"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_CZUBEK_HEAD_PO="$SHA_PROBNY" \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc (46 NIE pada, przeplyw doszedl do stanu docelowego)" "$RC" "41"
rowne "wywolan fazy sprawdz-tryb w argumentach" "$(grep -c 'bash -s -- sprawdz-tryb' "$ATRAPA_ARGI")" "1"
rowne "wywolan fazy zrzut w argumentach (przeplyw NIE zatrzymal sie na warunku)" "$(grep -c 'bash -s -- zrzut' "$ATRAPA_ARGI")" "1"
grep -q 'zna PSYCHON_TRYB_WDROZENIA' "$WYJ" || zle "brak zdania potwierdzajacego znany skrot"
koniec_przypadku

przypadek "ustaw-czubek: checkout udany i potwierdzony pomiarem po zmianie - kod 41, stan docelowy"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_CZUBEK_HEAD_PO="$SHA_PROBNY" \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "41"
rowne "wywolan atrapy ssh (pomiar + sprawdz-tryb + zrzut + checkout + pomiar po)" "$(licznik)" "5"
rowne "wywolan fazy czubek w argumentach" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "1"
rowne "wywolan fazy zrzut w argumentach" "$(grep -c 'bash -s -- zrzut' "$ATRAPA_ARGI")" "1"
rowne "wywolan fazy sprawdz-tryb w argumentach" "$(grep -c 'bash -s -- sprawdz-tryb' "$ATRAPA_ARGI")" "1"
# Dowod 1 z odbioru: wiersz zrzutu stoi PRZED wierszem checkoutu w dzienniku
# WYWOLAN (ATRAPA_ARGI - jedna linia na kazde wywolanie ssh, w kolejnosci, w
# jakiej faktycznie wypadly) - liczba linii PRZED pierwszym wystapieniem
# "zrzut" musi byc MNIEJSZA niz liczba linii przed pierwszym "czubek".
WIERSZ_ZRZUT="$(grep -n 'bash -s -- zrzut' "$ATRAPA_ARGI" | head -1 | cut -d: -f1)"
WIERSZ_CZUBEK="$(grep -n 'bash -s -- czubek' "$ATRAPA_ARGI" | head -1 | cut -d: -f1)"
echo "  wiersz zrzutu w dzienniku wywolan: $WIERSZ_ZRZUT | wiersz checkoutu: $WIERSZ_CZUBEK"
[ -n "$WIERSZ_ZRZUT" ] && [ -n "$WIERSZ_CZUBEK" ] && [ "$WIERSZ_ZRZUT" -lt "$WIERSZ_CZUBEK" ] || zle "zrzut nie stoi PRZED checkoutem w dzienniku wywolan"
# Ten sam dowod, ale w DZIENNIKU BIEGU ($WYJ - to, co przyrzad naprawde
# wypisuje), nie tylko w wewnetrznym dzienniku atrapy: zdanie o udanym
# zrzucie ma stac PRZED zdaniem o udanym checkoutcie.
LW_ZRZUT="$(grep -n 'zrzut PRZED checkoutem zameldowal sukces' "$WYJ" | head -1 | cut -d: -f1)"
LW_CHECKOUT="$(grep -n 'checkout zameldowal sukces' "$WYJ" | head -1 | cut -d: -f1)"
echo "  w dzienniku biegu: wiersz zrzutu na linii $LW_ZRZUT, wiersz checkoutu na linii $LW_CHECKOUT"
[ -n "$LW_ZRZUT" ] && [ -n "$LW_CHECKOUT" ] && [ "$LW_ZRZUT" -lt "$LW_CHECKOUT" ] || zle "w dzienniku biegu zrzut nie stoi PRZED checkoutem"
grep -q 'stan docelowy osiagniety' "$WYJ" || zle "brak zdania o stanie docelowym"
# Poza komentarzami - "git checkout" pada TEZ w komentarzu heredoku, wiec
# dopasowanie liczone po samym tekscie (bez odciecia '^#') przechodzi nawet
# gdy prawdziwe polecenie zostanie zepsute. Swiadek ma widziec kod, nie komentarz.
rowne "wystapien 'checkout --quiet' w KODZIE (poza komentarzami) w tresci wyslanej na hosta" "$(grep -v '^#' "$ATRAPA_TRESC" | grep -c 'checkout --quiet')" "1"
rowne "wystapien 'reset' w KODZIE (poza komentarzami) w tresci wyslanej na hosta" "$(grep -v '^#' "$ATRAPA_TRESC" | grep -c 'reset')" "0"
# Ten sam swiadek co "checkout --quiet" wyzej, ale dla strony ZRZUTU:
# heredoc zrzutu ma naprawde wolac deploy.sh w trybie --tylko-zrzut (poza
# komentarzem) - swiadek widzi kod wyslany na hosta, nie zdanie stacji.
rowne "wystapien 'PSYCHON_TRYB_WDROZENIA=tylko-zrzut' w KODZIE (poza komentarzami) w tresci wyslanej na hosta" "$(grep -v '^#' "$ATRAPA_TRESC" | grep -c 'PSYCHON_TRYB_WDROZENIA=tylko-zrzut')" "1"
grep 'CZUBEK' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "ustaw-czubek: checkout urwal sie bez linii konca - stan NIEZNANY (44), nie 41 ani 40"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_CZUBEK_URWANY=1 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "44"
rowne "rc rozny od stanu docelowego potwierdzonego" "$([ "$RC" -ne 41 ] && echo tak || echo nie)" "tak"
rowne "wywolan atrapy ssh (pomiar + sprawdz-tryb + zrzut + krok checkout, bez pomiaru po)" "$(licznik)" "4"
grep -q 'stan NIEZNANY' "$WYJ" || zle "brak zdania o stanie nieznanym"
grep 'CZUBEK' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

przypadek "ustaw-czubek: checkout na hoscie zameldowal niepowodzenie - stan NIEZNANY (44)"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_CZUBEK_CHECKOUT=nie-udalo-sie \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "44"
rowne "wywolan atrapy ssh (pomiar + sprawdz-tryb + zrzut + krok checkout, bez pomiaru po)" "$(licznik)" "4"
grep -q 'stan NIEZNANY' "$WYJ" || zle "brak zdania o stanie nieznanym"
koniec_przypadku

przypadek "ustaw-czubek: kanal pada CALKOWICIE w kroku checkout - kod kanalu na wierzchu, nie 44"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_CZUBEK_KANAL=255 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc (kod kanalu, nie zmierzony stan)" "$RC" "255"
grep -q 'kanal zdalny nie doszedl' "$WYJ" || zle "brak zdania o kanale"
koniec_przypadku

przypadek "ustaw-czubek: pomiar po zmianie urwany mimo checkout potwierdzony - stan NIEZNANY (44)"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_POMIAR_PO_URWANY=1 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "44"
rowne "wywolan atrapy ssh (pomiar + sprawdz-tryb + zrzut + checkout + pomiar-po ktory sie urywa)" "$(licznik)" "5"
grep -q 'stan NIEZNANY' "$WYJ" || zle "brak zdania o stanie nieznanym"
koniec_przypadku

przypadek "ustaw-czubek: kanal pada w pomiarze po zmianie mimo checkout potwierdzony - stan NIEZNANY (44), nie surowy kanal"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_POMIAR_PO_KANAL=255 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc (zmierzony stan, nie surowy kod kanalu)" "$RC" "44"
rowne "rc rozny od surowego kodu kanalu" "$([ "$RC" -ne 255 ] && echo tak || echo nie)" "tak"
koniec_przypadku

# --- zrzut PRZED checkoutem: dowod (a) nieudany zrzut => checkout SIE NIE
# ODBYWA, z DWOMA pomiarami czubka (przed/po), identycznymi; (b) wiersz
# zrzutu stoi PRZED wierszem checkoutu, gdy oba sie udaja (patrz przypadek
# "checkout udany..." wyzej - dowod ordynku juz tam). Kod 45 to kontrola
# psujaca ZACHOWANIE atrapy zrzutu (ATRAPA_ZRZUT=nie-udalo-sie), nie
# przestawiona stala.
przypadek "ustaw-czubek: zrzut PRZED checkoutem nie powiodl sie - kod 45, checkout SIE NIE ODBYWA, HEAD przed/po IDENTYCZNE"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_ZRZUT=nie-udalo-sie \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "45"
rowne "wywolan atrapy ssh (pomiar + sprawdz-tryb + zrzut nieudany + pomiar potwierdzajacy)" "$(licznik)" "4"
# CIEZAR tej kontroli lezy TU - na liczbie wywolan checkoutu,
# nie na rownosci wartosci ponizej. Mutacja "drugi pomiar HEAD przepisany z
# pierwszego" NIE zmienia tego, ile razy checkout zostal wywolany (nadal
# zero), wiec sama rownosc ponizej nie umie sczerwienic w tamtym kierunku -
# ta linia umie, i jest osobno przemierzona mutacja lapiaca ponizej.
rowne "wywolan fazy czubek w argumentach (checkout NIGDY nie wywolany)" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "0"
rowne "wywolan fazy zrzut w argumentach" "$(grep -c 'bash -s -- zrzut' "$ATRAPA_ARGI")" "1"
grep -q 'zrzut PRZED checkoutem nie powiodl sie' "$WYJ" || zle "brak zdania o nieudanym zrzucie"
grep -q 'checkout zameldowal sukces' "$WYJ" && zle "wiersz o udanym checkoutcie NIE MOZE wystapic - checkout sie nie odbyl"
# Dwa pomiary czubka, przed i po nieudanym zrzucie, jako WIERSZE Z
# WARTOSCIAMI (nie zdanie) - INFORMACYJNE dla czytajacego dziennik biegu.
# Sa identyczne, bo checkout nigdy nie zostal wywolany - ale ta rownosc SAMA
# NIE JEST dowodem (przepisanie pierwszej wartosci do drugiej dawaloby tu
# identyczny wynik): dowod jest w przypadku NIZEJ, ktory wymusza na atrapie
# INNA odpowiedz na DRUGIM pomiarze i sprawdza, ze przyrzad ja naprawde
# przekazuje dalej.
HEAD_PRZED="$(grep -m1 '^\[CZUBEK\] POMIAR-HEAD-PRZED-ZRZUTEM=' "$WYJ" | cut -d= -f2-)"
HEAD_PO="$(grep -m1 '^\[CZUBEK\] POMIAR-HEAD-PO-NIEUDANYM-ZRZUCIE=' "$WYJ" | cut -d= -f2-)"
echo "  POMIAR-HEAD-PRZED-ZRZUTEM=$HEAD_PRZED | POMIAR-HEAD-PO-NIEUDANYM-ZRZUCIE=$HEAD_PO (informacyjne, patrz komentarz)"
[ -n "$HEAD_PRZED" ] || zle "brak pomiaru HEAD przed zrzutem"
[ -n "$HEAD_PO" ] || zle "brak pomiaru HEAD po nieudanym zrzucie"
grep 'CZUBEK' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

# kontrola negatywna mutacji przepisujacej pierwszy odczyt: atrapa odpowiada
# na CZWARTE wywolanie ssh w tym biegu (pomiar + sprawdz-tryb + zrzut +
# TEN pomiar potwierdzajacy) wartoscia HEAD RÓZNA od pierwszego pomiaru.
# Kod POPRAWNY przekazuje ja dalej (bo naprawde woła zmierz_stan_katalogow
# drugi raz i czyta jej WLASNY wynik). Mutacja "head_po_zrzut=$head_przed"
# ta mutacja zwrocilaby tu STARA wartosc $INNY_SHA zamiast tej, wiec
# TEN przypadek jest tym, ktory ta mutacja ma sczerwienic.
przypadek "ustaw-czubek: pomiar HEAD po nieudanym zrzucie jest PRAWDZIWYM drugim odczytem, nie przepisaniem pierwszego"
zeruj
INNY_HEAD_PO_ZRZUCIE="fedcba9876543210fedcba9876543210fedcba98"
ATRAPA_HEAD="$INNY_SHA" ATRAPA_ZRZUT=nie-udalo-sie ATRAPA_HEAD_POMIAR_NR=4 ATRAPA_HEAD_INNY="$INNY_HEAD_PO_ZRZUCIE" \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "45"
HEAD_PRZED2="$(grep -m1 '^\[CZUBEK\] POMIAR-HEAD-PRZED-ZRZUTEM=' "$WYJ" | cut -d= -f2-)"
HEAD_PO2="$(grep -m1 '^\[CZUBEK\] POMIAR-HEAD-PO-NIEUDANYM-ZRZUCIE=' "$WYJ" | cut -d= -f2-)"
echo "  POMIAR-HEAD-PRZED-ZRZUTEM=$HEAD_PRZED2 | POMIAR-HEAD-PO-NIEUDANYM-ZRZUCIE=$HEAD_PO2 (atrapa na 4. wywolaniu odpowiada CELOWO INNA wartoscia: $INNY_HEAD_PO_ZRZUCIE)"
rowne "HEAD przed zrzutem (pierwszy pomiar)" "$HEAD_PRZED2" "$INNY_SHA"
rowne "HEAD po nieudanym zrzucie (DRUGI, ODREBNY odczyt - MUSI pokazac wartosc atrapy z TEGO wywolania, nie przepisanie pierwszego)" "$HEAD_PO2" "$INNY_HEAD_PO_ZRZUCIE"
koniec_przypadku

przypadek "ustaw-czubek: kanal pada CALKOWICIE w kroku zrzutu - kod kanalu na wierzchu, checkout SIE NIE ODBYWA"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_ZRZUT_KANAL=255 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc (kod kanalu, nie 45)" "$RC" "255"
rowne "wywolan fazy czubek w argumentach (checkout NIGDY nie wywolany)" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "0"
grep -q 'kanal zdalny zrzutu nie doszedl' "$WYJ" || zle "brak zdania o kanale zrzutu"
koniec_przypadku

przypadek "ustaw-czubek: pomiar zrzutu urwany (bez POMIAR-ZRZUT/POMIAR-KONIEC-ZRZUT) - kod 45, nie 0/44, checkout SIE NIE ODBYWA"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_ZRZUT_URWANY=1 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "45"
rowne "wywolan fazy czubek w argumentach (checkout NIGDY nie wywolany)" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "0"
grep -q 'zrzut PRZED checkoutem nie powiodl sie' "$WYJ" || zle "brak zdania o nieudanym/niepelnym zrzucie"
koniec_przypadku

# kanal zrzutu konczy sie ZEREM, ale bez ani
# jednego wiersza POMIAR- - dokladnie ta dziura, ktora skasowanie "exit 47"
# (przywrocenie starej wady) otwiera z powrotem. CIEZAR tej kontroli
# lezy na LICZNIKU wywolan fazy czubek w przechwyconych argumentach atrapy
# (tak jak wyzej), nie na samym kodzie wyjscia - kod wyjscia sam w
# sobie moglby sie zgadzac przypadkiem, licznik nie.
przypadek "ustaw-czubek: zrzut konczy sie zerem bez zadnego POMIAR- - stan NIEZNANY (47), nie 0/44/45; checkout NIGDY nie wywolany"
zeruj
ATRAPA_HEAD="$INNY_SHA" ATRAPA_ZRZUT_ZERO_POMIAR=1 \
    HOST_BRAMKOWY="$ADRES" "$PRZYRZAD" "$SHA_PROBNY" --ustaw-czubek > "$WYJ" 2>&1
RC=$?
rowne "rc" "$RC" "47"
rowne "wywolan atrapy ssh (pomiar + sprawdz-tryb + zrzut bez zadnego pomiaru)" "$(licznik)" "3"
rowne "wywolan fazy czubek w argumentach (checkout NIGDY nie wywolany)" "$(grep -c 'bash -s -- czubek' "$ATRAPA_ARGI")" "0"
grep -q 'stan NIEZNANY: kanal zdalny zrzutu zakonczyl sie zerem bez zadnego pomiaru' "$WYJ" || zle "brak zdania o stanie NIEZNANYM kanalu zrzutu"
grep -q 'checkout zameldowal sukces' "$WYJ" && zle "wiersz o udanym checkoutcie NIE MOZE wystapic - checkout sie nie odbyl"
grep 'CZUBEK' "$WYJ" | sed 's/^/    | /'
koniec_przypadku

# Kontrola "zadnego sudo/chown/chmod w calym pliku, tez po dolozeniu trybu
# --zaloz-katalog-kopii" jest juz w W9 (skanuje caly $PRZYRZAD, wiec i nowy
# tryb) - drugi identyczny przebieg tego samego grep-a byl zbedny, usuniety.
# Odrebna asercja liczby "umask 077" w PLIKU przyrzadu byla usunieta razem z
# nim: nie umiala upasc (napis stoi w linii echo, wiec licznik=1 nawet po
# skasowaniu prawdziwego `umask 077`). Swiadek zdolny do czerwieni na to juz
# istnieje wyzej: "umask 077 stoi PRZED mkdir" w przypadku "katalog cudzy:
# przeniesiony obok...".

echo
echo "PODSUMOWANIE: $ZALICZONE/$WSZYSTKIE przypadkow zaliczonych"
[ "$ZALICZONE" -eq "$WSZYSTKIE" ]
