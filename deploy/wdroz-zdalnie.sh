#!/usr/bin/env bash
# Przyrzad wdrozeniowy po stronie stacji operatora: uruchamia wdrozenie
# srodowiska psychon-dev na hoscie i sprowadza z niego POMIARY, a nie akapit.
#
#   wdroz-zdalnie.sh <pelny-40-znakowy-sha> [--warunki-wstepne | --zaloz-katalog-kopii]
#
# Adres hosta bierze WYLACZNIE ze zmiennej HOST_BRAMKOWY. Nie ma go w
# argumencie, w pliku ani w dokumencie - i nie pada w wyjsciu: cale wyjscie
# przechodzi przez maske (patrz `maskuj` nizej), bo adres wychodzil na
# zewnatrz takze wtedy, gdy nikt go nie przepisal - wypisywal go pierwszy
# wiersz logu narzedzia.
#
# Co ten przyrzad robi inaczej niz wywolanie `ssh` z reki:
#   1. warunki wstepne mierzy PRZED zrzutem bazy i PRZED zmiana schematu,
#      kazdy z osobnym kodem wyjscia - wdrozenie stanelo raz na braku prawa
#      zapisu w katalogu kopii, czyli na warunku, ktorego nikt nie mial gdzie
#      sprawdzic;
#   2. kroki kontrolne po wdrozeniu sa kodami wyjscia, a nie zdaniem w
#      meldunku - zielen nie zalezy od tego, czy ktos je przepisal;
#   3. niczego na hoscie nie podnosi ani nie naprawia SAM: pomiar nie zmienia
#      stanu hosta. Naprawa katalogu kopii ma osobny, jawny tryb
#      `--zaloz-katalog-kopii`, ktory dziala wylacznie prawem konta
#      wdrazajacego do katalogu nadrzednego: praw nie podnosi, cudzego
#      katalogu nie kasuje - przenosi go obok. O jego uruchomieniu decyduje
#      czlowiek, zadna sciezka nie wlacza go sama.
#
# Czesc zdalna idzie przez `stdin` (`bash -s`), argumenty przez `printf %q`.
# Na hoscie nie lezy zadna kopia tego pliku, ktora moglaby sie z nim rozjechac.
#
# Kody wyjscia:
#   0    - zrobione (albo: same warunki wstepne spelnione, albo katalog kopii zalozony)
#   2    - uzycie: brak SHA, SHA nie ma 40 znakow, nadmiarowy argument, dwa tryby naraz, brak HOST_BRAMKOWY
#   11   - warunek (a): katalog kopii nie jest zapisywalny dla uzytkownika wdrazajacego
#   12   - warunek (b): wolne miejsce ponizej progu
#   13   - warunek (c): czubek repozytorium na hoscie != zadany SHA
#   14   - pomiar warunkow nie doszedl w calosci (brak linii konca pomiaru)
#   21   - kontrola 1: HEAD na hoscie po wdrozeniu != zadany SHA
#   22   - kontrola 2: liczba dzialajacych kontenerow != oczekiwana
#   23   - kontrola 3: drzewo robocze na hoscie nie jest czyste
#   24   - kontrola 4: wiersz z koncowym kodem skryptu hosta nie wystapil dokladnie raz
#   25   - skrypt wdrozeniowy hosta zwrocil kod niezerowy
#   31   - --zaloz-katalog-kopii: katalog nadrzedny nie nalezy do uzytkownika
#          wdrazajacego albo nie jest zapisywalny - NIC nie zostalo zrobione
#   32   - --zaloz-katalog-kopii: po operacji katalog kopii nadal niezapisywalny
#   33   - --zaloz-katalog-kopii: krok zakladania albo pomiar po nim nie doszedl w calosci
#   inne - kod kanalu zdalnego przepuszczony bez zmiany (np. 9, 255 z `ssh`)
set -uo pipefail

MASKA="HOST-UKRYTY"
UZYCIE='uzycie: wdroz-zdalnie.sh <pelny-40-znakowy-sha> [--warunki-wstepne | --zaloz-katalog-kopii]   (adres hosta wylacznie ze zmiennej HOST_BRAMKOWY)'

# --- argumenty -------------------------------------------------------------
# Adresu tu nie ma i nie bedzie: kazdy nadmiarowy argument pozycyjny konczy
# bieg kodem 2. Gdyby przyrzad go po cichu ignorowal, wolajacy mialby prawo
# sadzic, ze podany adres cos znaczy.
SHA=""
TRYB="pelny"
for arg in "$@"; do
    case "$arg" in
        --warunki-wstepne|--zaloz-katalog-kopii)
            # Tryb jest JEDEN i jawny. Dwa tryby naraz to pytanie bez
            # odpowiedzi, a nie polecenie - konczymy uzyciem.
            if [ "$TRYB" != "pelny" ]; then
                echo "$UZYCIE" >&2
                exit 2
            fi
            case "$arg" in
                --warunki-wstepne) TRYB="warunki" ;;
                *) TRYB="zaloz" ;;
            esac
            ;;
        -*) echo "$UZYCIE" >&2; exit 2 ;;
        *)
            if [ -n "$SHA" ]; then
                echo "$UZYCIE" >&2
                exit 2
            fi
            SHA="$arg"
            ;;
    esac
done

if [ -z "$SHA" ] || [ "${#SHA}" -ne 40 ] || [ -n "${SHA//[0-9a-f]/}" ]; then
    echo "$UZYCIE" >&2
    exit 2
fi

# --- srodowisko ------------------------------------------------------------
# JEDNO zrodlo adresu. Zadnego zapasowego: pusta zmienna konczy bieg, a nie
# uruchamia szukania po plikach - inaczej "brak adresu" bywalby cicho
# zalatany przypadkowa wartoscia z cudzego srodowiska.
HOST="${HOST_BRAMKOWY:-}"
if [ -z "$HOST" ]; then
    echo "Brak adresu hosta: ustaw HOST_BRAMKOWY. Innego zrodla adresu ten przyrzad nie ma." >&2
    exit 2
fi

UZYTKOWNIK="${UZYTKOWNIK_WDROZENIA:-deploy}"
KATALOG_STOSU="${PSYCHON_KATALOG_STOSU:-/opt/psychon}"
# Domyslnie ten sam katalog kopii, ktorego uzywa deploy/psychon-dev/deploy.sh.
KATALOG_KOPII="${PSYCHON_DB_BACKUP_DIR:-$KATALOG_STOSU/kopie-bazy}"
REPO_HOSTA="${PSYCHON_REPO_HOSTA:-$KATALOG_STOSU/psychon-platforma}"
PLIK_SRODOWISKA="${PSYCHON_ENV_FILE:-$KATALOG_STOSU/.env}"
PROG_WOLNE_KB="${PSYCHON_PROG_WOLNE_KB:-1048576}"
OCZEKIWANE_KONTENEROW="${PSYCHON_LICZBA_KONTENEROW:-8}"
KATALOG_LOGOW_HOSTA="${PSYCHON_KATALOG_LOGOW_HOSTA:-/tmp/psychon-wdrozenia}"
KATALOG_LOGOW_LOKALNY="${PSYCHON_KATALOG_LOGOW:-${TMPDIR:-/tmp}/psychon-wdrozenia}"

STEMPEL="$(date +%Y%m%d-%H%M%S)"
LOG_HOSTA="$KATALOG_LOGOW_HOSTA/wdrozenie-$SHA-$STEMPEL.log"
mkdir -p "$KATALOG_LOGOW_LOKALNY"
LOG_LOKALNY="$KATALOG_LOGOW_LOKALNY/wdrozenie-$SHA-$STEMPEL.log"

WDROZENIE_RUSZYLO=0

# --- maska -----------------------------------------------------------------
# Filtr na CALYM wyjsciu przyrzadu, nie tylko na wlasnych `echo`: adres
# potrafi wrocic w komunikacie `ssh` ("connect to host ..."), ktorego autorem
# nie jest ten plik. Podstawienie jest doslowne (cudzyslow wokol wzorca), wiec
# kropki w adresie nie sa znakiem wieloznacznym.
maskuj() {
    local linia
    while IFS= read -r linia || [ -n "$linia" ]; do
        printf '%s\n' "${linia//"$HOST"/$MASKA}"
    done
}

# --- stopka ----------------------------------------------------------------
# Ostatni wiersz na KAZDEJ sciezce, takze nieudanej - wtedy sciezka logu jest
# najbardziej potrzebna. Stad `trap ... EXIT`, a nie `echo` na koncu funkcji.
stopka() {
    local uwaga=""
    if [ "$WDROZENIE_RUSZYLO" -eq 0 ]; then
        uwaga=" (krok wdrozenia nie ruszyl - tego pliku moze na hoscie nie byc)"
    fi
    echo "[WDROZENIE] log na hoscie: $LOG_HOSTA$uwaga | kopia lokalna: $LOG_LOKALNY"
}

# --- odczyt pomiaru --------------------------------------------------------
pomiar() {
    printf '%s\n' "$2" | grep -m1 "^POMIAR-$1=" | cut -d= -f2-
}
kontrola_wartosc() {
    printf '%s\n' "$2" | grep -m1 "^KONTROLA-$1=" | cut -d= -f2-
}
# Wartosc, ktora nie jest liczba, ma byc widocznym bledem pomiaru, a nie
# zerem: "-1" nigdy nie przejdzie zadnego progu ani porownania z oczekiwana
# liczba kontenerow.
liczba_lub_minus() {
    case "$1" in
        ''|*[!0-9]*) echo "-1" ;;
        *) echo "$1" ;;
    esac
}

# --- pomiar stanu katalogow na hoscie --------------------------------------
# Jeden pomiar dla obu trybow, ktore go potrzebuja: warunki wstepne i tryb
# zakladania katalogu kopii pytaja host tym samym kodem. Gdyby kazdy tryb
# mierzyl po swojemu, dwa opisy tego samego katalogu moglyby sie rozjechac i
# nikt nie wiedzialby, ktory jest prawdziwy.
POMIAR_WYJSCIE=""
zmierz_stan_katalogow() {
    local argi rc
    argi="$(printf '%q %q %q' "$KATALOG_KOPII" "$SHA" "$REPO_HOSTA")"
    POMIAR_WYJSCIE="$(ssh -o BatchMode=yes -o ServerAliveInterval=20 \
        "$UZYTKOWNIK@$HOST" "bash -s -- warunki $argi" 2>&1 <<"ZDALNE"
set -uo pipefail
KATALOG_KOPII="$2"; SHA="$3"; REPO_HOSTA="$4"

# Pomiar, nie naprawa: zadnego zakladania katalogu, zadnej zmiany praw ani
# wlasciciela. Ta czesc zdalna nie zmienia na hoscie niczego - takze wtedy,
# gdy wola ja tryb, ktory zaraz potem bedzie cos zakladal.
opisz_katalog() {
    etykieta="$1"; sciezka="$2"
    if [ -e "$sciezka" ]; then
        echo "POMIAR-$etykieta-ISTNIEJE=tak"
        echo "POMIAR-$etykieta-WLASCICIEL=$(stat -c '%U:%G' "$sciezka" 2>/dev/null || echo nieznany)"
        echo "POMIAR-$etykieta-PRAWA=$(stat -c '%a' "$sciezka" 2>/dev/null || echo nieznane)"
        if [ -w "$sciezka" ]; then
            echo "POMIAR-$etykieta-ZAPIS=tak"
        else
            echo "POMIAR-$etykieta-ZAPIS=nie"
        fi
        echo "POMIAR-$etykieta-WOLNE-KB=$(df -Pk "$sciezka" 2>/dev/null | awk 'NR==2{print $4}')"
    else
        echo "POMIAR-$etykieta-ISTNIEJE=nie"
        echo "POMIAR-$etykieta-WLASCICIEL=brak"
        echo "POMIAR-$etykieta-PRAWA=brak"
        echo "POMIAR-$etykieta-ZAPIS=nie"
        echo "POMIAR-$etykieta-WOLNE-KB=0"
    fi
}

echo "POMIAR-KTO=$(id -un)"
opisz_katalog KOPIE "$KATALOG_KOPII"
opisz_katalog RODZIC "$(dirname "$KATALOG_KOPII")"
if [ -d "$REPO_HOSTA/.git" ]; then
    echo "POMIAR-HEAD=$(git -C "$REPO_HOSTA" rev-parse HEAD 2>/dev/null || echo brak)"
else
    echo "POMIAR-HEAD=brak-repozytorium"
fi
echo "POMIAR-KONIEC=0"
ZDALNE
)"
    rc=$?
    return "$rc"
}

# Wartosci OSTATNIEGO pomiaru. Trzymane osobno od wypisywania, bo ten sam
# komplet czytaja dwa tryby, a wypisac trzeba go dwa razy w jednym biegu:
# przed zmiana i po niej.
P_KTO=""; P_ISTNIEJE=""; P_WLASCICIEL=""; P_PRAWA=""; P_ZAPIS=""; P_WOLNE=""
P_R_WLASCICIEL=""; P_R_PRAWA=""; P_R_ZAPIS=""; P_R_WOLNE=""
wczytaj_pomiar() {
    local wyjscie="$1"
    P_KTO="$(pomiar KTO "$wyjscie")"
    P_ISTNIEJE="$(pomiar KOPIE-ISTNIEJE "$wyjscie")"
    P_WLASCICIEL="$(pomiar KOPIE-WLASCICIEL "$wyjscie")"
    P_PRAWA="$(pomiar KOPIE-PRAWA "$wyjscie")"
    P_ZAPIS="$(pomiar KOPIE-ZAPIS "$wyjscie")"
    P_WOLNE="$(liczba_lub_minus "$(pomiar KOPIE-WOLNE-KB "$wyjscie")")"
    P_R_WLASCICIEL="$(pomiar RODZIC-WLASCICIEL "$wyjscie")"
    P_R_PRAWA="$(pomiar RODZIC-PRAWA "$wyjscie")"
    P_R_ZAPIS="$(pomiar RODZIC-ZAPIS "$wyjscie")"
    P_R_WOLNE="$(liczba_lub_minus "$(pomiar RODZIC-WOLNE-KB "$wyjscie")")"
}

# Po jednej linii na katalog kopii i na jego katalog nadrzedny - to jest to,
# czym mierzy sie brak prawa zapisu, na ktorym stanelo wdrozenie. Format jest
# jeden dla wszystkich trybow; rozni je tylko znacznik z przodu, zeby dalo sie
# zestawic pomiar sprzed zmiany z pomiarem po niej.
wypisz_pomiar() {
    local tag="$1"
    echo "$tag katalog kopii $KATALOG_KOPII: istnieje=$P_ISTNIEJE, wlasciciel=$P_WLASCICIEL, prawa=$P_PRAWA, zapis=$P_ZAPIS, wolne=$P_WOLNE KB"
    echo "$tag katalog nadrzedny $(dirname "$KATALOG_KOPII"): wlasciciel=$P_R_WLASCICIEL, prawa=$P_R_PRAWA, zapis=$P_R_ZAPIS, wolne=$P_R_WOLNE KB"
    echo "$tag uzytkownik wdrazajacy na hoscie: $P_KTO"
}

# --- krok 1: warunki wstepne ----------------------------------------------
warunki_wstepne() {
    local rc

    echo "[WARUNKI] mierze warunki wstepne PRZED zrzutem bazy i PRZED zmiana schematu"
    zmierz_stan_katalogow
    rc=$?
    printf '%s\n' "$POMIAR_WYJSCIE"
    if [ "$rc" -ne 0 ]; then
        echo "[WARUNKI] kanal zdalny nie doszedl (kod $rc) - warunkow NIE zmierzylem, niczego nie uruchamiam"
        exit "$rc"
    fi
    if [ -z "$(pomiar KONIEC "$POMIAR_WYJSCIE")" ]; then
        echo "[WARUNKI] NIEZALICZONY: pomiar urwal sie w polowie - brak linii konca pomiaru"
        exit 14
    fi

    wczytaj_pomiar "$POMIAR_WYJSCIE"
    wypisz_pomiar "[WARUNKI]"

    # (a) Katalog nieistniejacy nie jest jeszcze bledem: skrypt hosta zaklada
    # go sam, ale tylko wtedy, gdy katalog nadrzedny jest zapisywalny.
    local a_ok=1
    if [ "$P_ISTNIEJE" = "tak" ]; then
        [ "$P_ZAPIS" = "tak" ] || a_ok=0
    else
        [ "$P_R_ZAPIS" = "tak" ] || a_ok=0
    fi
    if [ "$a_ok" -eq 0 ]; then
        echo "[WARUNEK a] NIEZALICZONY: katalog kopii nie jest zapisywalny dla uzytkownika $UZYTKOWNIK - zatrzymuje sie przed zrzutem bazy i przed zmiana schematu"
        echo "[WARUNEK a] praw NIE naprawiam: ten tryb tylko mierzy, a naprawa katalogu kopii ma osobny, jawny tryb --zaloz-katalog-kopii"
        exit 11
    fi
    echo "[WARUNEK a] ZALICZONY: katalog kopii zapisywalny dla uzytkownika $UZYTKOWNIK"

    # (b) Prog i wartosc zmierzona w jednym wierszu - liczba bez progu nie
    # mowi nic, a prog bez liczby nie jest pomiarem.
    local wolne_do_progu="$P_WOLNE"
    [ "$P_ISTNIEJE" = "tak" ] || wolne_do_progu="$P_R_WOLNE"
    if [ "$wolne_do_progu" -lt "$PROG_WOLNE_KB" ]; then
        echo "[WARUNEK b] NIEZALICZONY: wolne miejsce $wolne_do_progu KB, prog $PROG_WOLNE_KB KB"
        exit 12
    fi
    echo "[WARUNEK b] ZALICZONY: wolne miejsce $wolne_do_progu KB, prog $PROG_WOLNE_KB KB"

    # (c) Czubek na hoscie MIERZYMY, nie ustawiamy: przyrzad nie przestawia
    # cudzego drzewa. Rozjazd to wynik do pokazania, nie rzecz do zalatania.
    local head_hosta
    head_hosta="$(pomiar HEAD "$POMIAR_WYJSCIE")"
    if [ "$head_hosta" != "$SHA" ]; then
        echo "[WARUNEK c] NIEZALICZONY: czubek na hoscie $head_hosta, zadano $SHA"
        exit 13
    fi
    echo "[WARUNEK c] ZALICZONY: czubek na hoscie rowny zadanemu $SHA"
}

# --- tryb --zaloz-katalog-kopii --------------------------------------------
# Tryb JAWNY i osobny: nie wlacza sie z zadnej innej sciezki, a pomiar warunkow
# wstepnych dalej wylacznie mierzy. Dziala tylko tym prawem, ktore konto
# wdrazajace ma do katalogu NADRZEDNEGO - praw nie podnosi ani nie zmienia.
# Katalog zastany, nalezacy do kogos innego, jest PRZENOSZONY obok i nigdy
# kasowany: w srodku moga lezec zrzuty bazy z danymi osobowymi jawnym tekstem,
# a ich zniknecia nikt by nie odwrocil. Dlatego przed przeniesieniem pada
# liczba pozycji w srodku - zeby nic nie znikalo po cichu.
zaloz_katalog_kopii() {
    local rc argi wyjscie zastany przenies

    echo "[KATALOG-KOPII] tryb jawny: mierze stan przed zmiana"
    zmierz_stan_katalogow
    rc=$?
    printf '%s\n' "$POMIAR_WYJSCIE"
    if [ "$rc" -ne 0 ]; then
        echo "[KATALOG-KOPII] kanal zdalny nie doszedl (kod $rc) - niczego nie zakladam"
        exit "$rc"
    fi
    if [ -z "$(pomiar KONIEC "$POMIAR_WYJSCIE")" ]; then
        echo "[KATALOG-KOPII] NIEZALICZONY: pomiar urwal sie w polowie - niczego nie zakladam"
        exit 14
    fi
    wczytaj_pomiar "$POMIAR_WYJSCIE"
    wypisz_pomiar "[KATALOG-KOPII przed]"

    # (1) Rodzic musi byc nasz. Cudzy rodzic to cudze uprawnienie: konczymy
    # PRZED wyslaniem czegokolwiek, co zmienia stan hosta.
    if [ "${P_R_WLASCICIEL%%:*}" != "$P_KTO" ] || [ "$P_R_ZAPIS" != "tak" ]; then
        echo "[KATALOG-KOPII] NIEZALICZONY: katalog nadrzedny $(dirname "$KATALOG_KOPII") ma wlasciciela $P_R_WLASCICIEL i zapis=$P_R_ZAPIS, a uzytkownik wdrazajacy to $P_KTO"
        echo "[KATALOG-KOPII] to juz cudze uprawnienie - nie zakladam, nie przenosze, praw nie podnosze"
        exit 31
    fi
    echo "[KATALOG-KOPII] katalog nadrzedny nalezy do $P_KTO i jest zapisywalny - dzialam w granicach wlasnego prawa"

    # (2) Decyzja o przeniesieniu zapada TU, z pomiaru, a nie na hoscie.
    przenies=nie
    if [ "$P_ISTNIEJE" = "tak" ] && { [ "${P_WLASCICIEL%%:*}" != "$P_KTO" ] || [ "$P_ZAPIS" != "tak" ]; }; then
        przenies=tak
    fi
    zastany="$KATALOG_KOPII.zastane-$STEMPEL"
    if [ "$przenies" = "tak" ]; then
        echo "[KATALOG-KOPII] zastany katalog nalezy do $P_WLASCICIEL (zapis=$P_ZAPIS): PRZENIOSE go na $zastany, nie skasuje"
    else
        echo "[KATALOG-KOPII] nie ma czego przenosic: istnieje=$P_ISTNIEJE, wlasciciel=$P_WLASCICIEL, zapis=$P_ZAPIS"
    fi

    argi="$(printf '%q %q %q' "$KATALOG_KOPII" "$zastany" "$przenies")"
    wyjscie="$(ssh -o BatchMode=yes -o ServerAliveInterval=20 \
        "$UZYTKOWNIK@$HOST" "bash -s -- zaloz $argi" 2>&1 <<"ZDALNE"
set -uo pipefail
KATALOG_KOPII="$2"; ZASTANY="$3"; PRZENIES="$4"

# Ta czesc zdalna rusza WYLACZNIE dwie sciezki: katalog kopii i jego zastana
# postac obok. Nic poza wlasna sciezka nie leci - i ani jednego kasowania.
if [ "$PRZENIES" = "tak" ]; then
    if LISTA="$(ls -A "$KATALOG_KOPII" 2>/dev/null)"; then
        echo "POMIAR-ZASTANE-POZYCJI=$(printf '%s' "$LISTA" | grep -c .)"
    else
        echo "POMIAR-ZASTANE-POZYCJI=nieczytelne"
    fi
    mv "$KATALOG_KOPII" "$ZASTANY" || { echo "POMIAR-PRZENIESIONY=nie-udalo-sie"; exit 3; }
    echo "POMIAR-PRZENIESIONY=$ZASTANY"
else
    echo "POMIAR-ZASTANE-POZYCJI=brak"
    echo "POMIAR-PRZENIESIONY=nie-trzeba"
fi

# Prawa daje umask PRZED zalozeniem katalogu: powstaje on od razu jako 700 i
# ani przez chwile nie stoi otworem. Praw po fakcie nie ruszamy.
umask 077
mkdir -p "$KATALOG_KOPII" || { echo "POMIAR-ZALOZONY=nie-udalo-sie"; exit 4; }
echo "POMIAR-ZALOZONY=$KATALOG_KOPII"
echo "POMIAR-KONIEC-ZAKLADANIA=0"
ZDALNE
)"
    rc=$?
    printf '%s\n' "$wyjscie"
    if [ "$rc" -ne 0 ]; then
        echo "[KATALOG-KOPII] krok zakladania nie doszedl (kod $rc)"
        exit "$rc"
    fi
    if [ -z "$(pomiar KONIEC-ZAKLADANIA "$wyjscie")" ]; then
        echo "[KATALOG-KOPII] NIEZALICZONY: krok zakladania urwal sie - brak linii konca"
        exit 33
    fi
    echo "[KATALOG-KOPII] zastany katalog: $(pomiar PRZENIESIONY "$wyjscie"), pozycji w srodku: $(pomiar ZASTANE-POZYCJI "$wyjscie") (nic nie skasowano)"
    echo "[KATALOG-KOPII] zalozony: $(pomiar ZALOZONY "$wyjscie") (umask 077, czyli prawa 700)"

    # (4) Pomiar PO zmianie - tym samym kodem i w tym samym formacie co warunki
    # wstepne. Zielen tego trybu bierze sie z niego, a nie z tego, ze polecenia
    # poszly bez bledu.
    zmierz_stan_katalogow
    rc=$?
    printf '%s\n' "$POMIAR_WYJSCIE"
    if [ "$rc" -ne 0 ]; then
        echo "[KATALOG-KOPII] pomiar po zmianie nie doszedl (kod $rc)"
        exit "$rc"
    fi
    if [ -z "$(pomiar KONIEC "$POMIAR_WYJSCIE")" ]; then
        echo "[KATALOG-KOPII] NIEZALICZONY: pomiar po zmianie urwal sie w polowie"
        exit 33
    fi
    wczytaj_pomiar "$POMIAR_WYJSCIE"
    wypisz_pomiar "[KATALOG-KOPII po]"

    # (5) Niezapisywalny katalog po calej operacji to czerwien, nie uwaga.
    if [ "$P_ZAPIS" != "tak" ]; then
        echo "[KATALOG-KOPII] NIEZALICZONY: po operacji katalog kopii nadal nie jest zapisywalny dla $P_KTO (wlasciciel=$P_WLASCICIEL, prawa=$P_PRAWA)"
        exit 32
    fi
    echo "[KATALOG-KOPII] ZALICZONY: katalog kopii zapisywalny dla $P_KTO, wlasciciel=$P_WLASCICIEL, prawa=$P_PRAWA"
}

# --- krok 2: wdrozenie i kroki kontrolne -----------------------------------
wdrozenie() {
    local argi wyjscie rc
    argi="$(printf '%q %q %q %q' "$SHA" "$REPO_HOSTA" "$LOG_HOSTA" "$PLIK_SRODOWISKA")"
    WDROZENIE_RUSZYLO=1
    echo "[WDROZENIE] uruchamiam skrypt wdrozeniowy hosta; jego log zostaje na hoscie"

    wyjscie="$(ssh -o BatchMode=yes -o ServerAliveInterval=20 \
        "$UZYTKOWNIK@$HOST" "bash -s -- wdrozenie $argi" 2>&1 <<"ZDALNE"
set -uo pipefail
SHA="$2"; REPO_HOSTA="$3"; LOG_HOSTA="$4"; PLIK_SRODOWISKA="$5"

cd "$REPO_HOSTA" 2>/dev/null || { echo "[ZDALNIE] brak repozytorium $REPO_HOSTA"; exit 2; }
mkdir -p "$(dirname "$LOG_HOSTA")" || { echo "[ZDALNIE] nie zalozylem katalogu logu"; exit 2; }

# stdin odciety: ta czesc skryptu sama przyszla przez stdin (`bash -s`), wiec
# proces wdrozenia, ktory po niego siegnie, zjadlby jej reszte.
# Tresc logu zostaje na hoscie: na dol ida stad wylacznie POMIARY, bo log
# wdrozenia zawiera nazwy domen i cale komunikaty uslug.
bash deploy/psychon-dev/deploy.sh < /dev/null > "$LOG_HOSTA" 2>&1
status_zdalny=$?
echo "[ZDALNIE] KONIEC-STATUS=$status_zdalny"

echo "KONTROLA-HEAD=$(git -C "$REPO_HOSTA" rev-parse HEAD 2>/dev/null || echo brak)"
echo "KONTROLA-KONTENERY=$(docker compose --env-file "$PLIK_SRODOWISKA" \
    -f docker-compose.yml -f docker-compose.psychon-dev.yml \
    ps --status running --format '{{.Name}}' 2>/dev/null | grep -c .)"
echo "KONTROLA-DRZEWO-LINII=$(git -C "$REPO_HOSTA" status --porcelain 2>/dev/null | grep -c .)"
exit 0
ZDALNE
)"
    rc=$?
    printf '%s\n' "$wyjscie"
    if [ "$rc" -ne 0 ]; then
        echo "[WDROZENIE] kanal zdalny nie doszedl (kod $rc)"
        exit "$rc"
    fi

    local ile_konca kod_hosta head_po kontenery drzewo
    ile_konca="$(printf '%s\n' "$wyjscie" | grep -c 'KONIEC-STATUS=')"
    kod_hosta="$(printf '%s\n' "$wyjscie" | grep -m1 'KONIEC-STATUS=' | sed 's/.*KONIEC-STATUS=//')"
    kod_hosta="$(liczba_lub_minus "$kod_hosta")"
    head_po="$(kontrola_wartosc HEAD "$wyjscie")"
    kontenery="$(liczba_lub_minus "$(kontrola_wartosc KONTENERY "$wyjscie")")"
    drzewo="$(liczba_lub_minus "$(kontrola_wartosc DRZEWO-LINII "$wyjscie")")"

    echo "[KONTROLA 1] czubek na hoscie po wdrozeniu: $head_po (zadano $SHA)"
    echo "[KONTROLA 2] dzialajacych kontenerow: $kontenery (oczekiwano $OCZEKIWANE_KONTENEROW)"
    echo "[KONTROLA 3] linii w stanie drzewa na hoscie: $drzewo (oczekiwano 0)"
    echo "[KONTROLA 4] wierszy z koncowym kodem skryptu hosta: $ile_konca (oczekiwano 1)"
    echo "[WDROZENIE] skrypt wdrozeniowy hosta zwrocil kod: $kod_hosta"

    if [ "$kod_hosta" -ne 0 ]; then
        echo "[WDROZENIE] NIEZALICZONY: skrypt wdrozeniowy hosta zwrocil kod $kod_hosta"
        exit 25
    fi
    if [ "$head_po" != "$SHA" ]; then
        echo "[KONTROLA 1] NIEZALICZONY: czubek na hoscie po wdrozeniu rozni sie od zadanego"
        exit 21
    fi
    if [ "$kontenery" -ne "$OCZEKIWANE_KONTENEROW" ]; then
        echo "[KONTROLA 2] NIEZALICZONY: liczba dzialajacych kontenerow rozni sie od oczekiwanej"
        exit 22
    fi
    if [ "$drzewo" -ne 0 ]; then
        echo "[KONTROLA 3] NIEZALICZONY: drzewo robocze na hoscie nie jest czyste"
        exit 23
    fi
    if [ "$ile_konca" -ne 1 ]; then
        echo "[KONTROLA 4] NIEZALICZONY: wiersz z koncowym kodem skryptu hosta nie wystapil dokladnie raz"
        exit 24
    fi
    echo "[WDROZENIE] cztery kroki kontrolne zaliczone"
}

glowna() {
    trap stopka EXIT
    echo "[WDROZENIE] cel: $MASKA (adres wylacznie ze zmiennej HOST_BRAMKOWY, nie jest wypisywany)"
    echo "[WDROZENIE] uzytkownik: $UZYTKOWNIK, commit: $SHA, tryb: $TRYB"
    if [ "$TRYB" = "zaloz" ]; then
        zaloz_katalog_kopii
        echo "[KATALOG-KOPII] tryb --zaloz-katalog-kopii: warunkow wstepnych ani wdrozenia NIE uruchamiam"
        exit 0
    fi
    warunki_wstepne
    if [ "$TRYB" = "warunki" ]; then
        echo "[WARUNKI] tryb --warunki-wstepne: wdrozenia NIE uruchamiam"
        exit 0
    fi
    wdrozenie
    exit 0
}

# Kod wyjscia bierzemy z PIERWSZEGO ogniwa potoku, a nie z jego konca: na
# koncu stoi `tee`, ktory zawsze konczy zerem i zamienilby kazda czerwien w
# zielen.
glowna 2>&1 | maskuj | tee "$LOG_LOKALNY"
exit "${PIPESTATUS[0]}"
