#!/usr/bin/env bash
# Przyrzad wdrozeniowy po stronie stacji operatora: uruchamia wdrozenie
# srodowiska psychon-dev na hoscie i sprowadza z niego POMIARY, a nie akapit.
#
#   wdroz-zdalnie.sh <pelny-40-znakowy-sha> [--warunki-wstepne | --zaloz-katalog-kopii | --ustaw-czubek]
#
# Adres hosta bierze WYLACZNIE ze zmiennej HOST_BRAMKOWY. Nie ma go w
# argumencie, w pliku ani w dokumencie - i nie pada w wyjsciu: cale wyjscie
# przechodzi przez maske (patrz `maskuj` nizej) - adres, konto wdrozeniowe i
# sciezka stosu - bo adres wychodzil na
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
#      czlowiek, zadna sciezka nie wlacza go sama;
#   4. sciezke repozytorium na hoscie MIERZY, nie zgaduje: sprawdza po kolei
#      znanych kandydatow (pierwszy - stara stala - zostaje jako PIERWSZY
#      sprawdzany, nie jako prawda przyjmowana bez pomiaru) i melduje
#      wybranego wierszem POMIAR-REPO=;
#   5. czubek repozytorium na hoscie da sie NAPRAWDE ustawic, ale tylko
#      jawnym, osobnym trybem `--ustaw-czubek` (ten sam wzorzec co
#      `--zaloz-katalog-kopii`): fetch + checkout na juz-zmierzony, czysty
#      commit, zadnego `reset --hard` na cudzym drzewie. O uruchomieniu
#      decyduje czlowiek, zadna sciezka nie wlacza go sama.
#   6. `--ustaw-czubek` robi zrzut bazy (`deploy.sh --tylko-zrzut`) PRZED
#      checkoutem, nie po nim - kodem JUZ stojacym na hoscie, nie kodem z
#      przychodzacego commita - bo inaczej pozniejszy zwykly bieg zmienialby
#      kolejnosc na checkout -> budowanie -> zrzut -> migracja, w ktorej
#      zrzut juz nie chroni przed zlym CHECKOUTEM, tylko przed zla migracja.
#      Nieudany zrzut => checkout SIE NIE ODBYWA (kod 45), a host zostaje
#      taki, jaki byl - co ten krok potwierdza DRUGIM pomiarem czubka, obok
#      pierwszego sprzed zrzutu.
#
# Czesc zdalna idzie przez `stdin` (`bash -s`), argumenty przez `printf %q`.
# Na hoscie nie lezy zadna kopia tego pliku, ktora moglaby sie z nim rozjechac.
#
# Kody wyjscia:
#   0    - zrobione (albo: same warunki wstepne spelnione, albo katalog kopii zalozony)
#   10   - katalog logow stacji niezapisywalny - biegu nie ma jak odczytac,
#          wiec go nie zaczynam (sprawdzane przed pierwszym siegnieciem hosta)
#   2    - uzycie: brak SHA, SHA nie ma 40 znakow, nadmiarowy argument, dwa tryby naraz, brak HOST_BRAMKOWY
#   11   - warunek (a): katalog kopii nie jest zapisywalny dla uzytkownika wdrazajacego
#   12   - warunek (b): wolne miejsce ponizej progu
#   13   - warunek (c'): zadany commit NIE istnieje na zdalnym po `fetch` (fetch
#          sam nieudany liczy sie tak samo - porownanie jest ZAWSZE tak/nie,
#          nigdy nic posredniego, wiec nieudany odczyt nigdy nie wypada zielono).
#          To byl dawniej warunek KONCOWY checkoutu przebrany za wstepny
#          (host mial juz STAC na zadanym SHA) - stad zawsze czerwony; teraz
#          mierzy to, co da sie zmierzyc PRZED checkoutem.
#   14   - pomiar warunkow nie doszedl w calosci (brak linii konca pomiaru)
#   15   - sciezka repozytorium NIE zostala zmierzona: zadna ze znanych
#          sciezek-kandydatow nie zawiera .git - komunikat nazywa sprawdzone
#          sciezki. Rozlaczny z 13: 13 mowi o SHA, 15 o tym, ze nie ma gdzie
#          go szukac.
#   16   - warunek (d): drzewo robocze na hoscie NIE jest czyste - odmowa
#          niesie liste pozycji, nie tylko ich liczbe. Zaden checkout nigdy
#          nie nadpisuje cudzych zmian.
#   21   - kontrola 1: HEAD na hoscie po wdrozeniu != zadany SHA
#   22   - kontrola 2: liczba dzialajacych kontenerow != oczekiwana
#   23   - kontrola 3: drzewo robocze na hoscie nie jest czyste
#   24   - kontrola 4: wiersz z koncowym kodem skryptu hosta nie wystapil dokladnie raz
#   25   - skrypt wdrozeniowy hosta zwrocil kod niezerowy
#   26   - czesc zdalna kroku wdrozenia: na hoscie nie ma repozytorium
#   27   - czesc zdalna kroku wdrozenia: nie dalo sie zalozyc katalogu logu
#          (26 i 27 znacza: kanal DOSZEDL, odmowil host - to co innego niz
#          kod kanalu, ktory idzie na wierzch bez zmiany)
#   31   - --zaloz-katalog-kopii: katalog nadrzedny nie nalezy do uzytkownika
#          wdrazajacego albo nie jest zapisywalny - NIC nie zostalo zrobione
#   32   - --zaloz-katalog-kopii: po operacji katalog kopii nadal niezapisywalny
#   33   - --zaloz-katalog-kopii: bieg przerwany, na hoscie NIC nie ruszone
#   34   - --zaloz-katalog-kopii: nazwa docelowa zajeta - nic nie przeniesione
#   35   - --zaloz-katalog-kopii: zastany katalog przeniesiony obok, nowego NIE
#          zalozono - na hoscie zostaje do uprzatniecia (nic nie skasowane)
#   36   - --zaloz-katalog-kopii: przeniesione i zalozone (stan docelowy), ale
#          bieg nie potwierdzil tego pomiarem po zmianie
#   37   - --zaloz-katalog-kopii: stan hosta NIEZNANY - wyjscie urwalo sie w
#          miejscu, ktore nie potwierdza ani nie zaprzecza przeniesieniu lub
#          zalozeniu, choc jedno z nich moglo realnie zajsc; obok katalogu
#          kopii moze wtedy lezec .zastane-<stempel> do recznego sprawdzenia
#          (33, 35, 36 i 37 mowia o STANIE hosta, nie o tym, gdzie bieg sie urwal)
#   40   - --ustaw-czubek: czubek na hoscie JUZ byl rowny zadanemu SHA -
#          nic nie ruszone, zaden checkout sie nie odbyl
#   41   - --ustaw-czubek: czubek NAPRAWDE zmieniony na zadany SHA (stan
#          docelowy) - checkout zameldowal sukces I pomiar po zmianie to
#          potwierdzil
#   42   - --ustaw-czubek: `fetch` nie przyniosl zadanego commita (albo sam
#          `fetch` sie nie udal) - commita nie ma na zdalnym, checkout sie
#          nie odbyl
#   43   - --ustaw-czubek: drzewo robocze na hoscie NIE jest czyste - odmowa
#          PRZED jakimkolwiek fetchem/checkoutem, z lista pozycji; cudzych
#          zmian nie nadpisuje
#   44   - --ustaw-czubek: stan hosta NIEZNANY - wyjscie urwalo sie w
#          miejscu, ktore nie potwierdza ani nie zaprzecza checkoutowi, choc
#          mogl realnie zajsc (kanal pada w trakcie albo pomiar po zmianie
#          jest niepelny); nigdy nie zwijane w kod sukcesu ani porazki
#   45   - --ustaw-czubek: zrzut bazy PRZED checkoutem (deploy.sh
#          --tylko-zrzut, kodem JUZ stojacym na hoscie, nie kodem z
#          przychodzacego commita) nie powiodl sie albo jego pomiar nie
#          doszedl w calosci - checkout SIE NIE ODBYWA. Host zostaje TAKI,
#          jaki byl: czubek repozytorium NIETKNIETY (mierzony PONOWNIE po
#          nieudanym zrzucie i wypisywany obok pomiaru sprzed), zadne uslugi
#          nie sa przebudowywane (tryb --tylko-zrzut podnosi wylacznie
#          baze). Rozlaczny z 42/43: te mowia o stanie PRZED zrzutem
#          (fetch/drzewo), 45 o samym zrzucie.
#   46   - --ustaw-czubek: deploy.sh na hoscie (pod zmierzona sciezka
#          repozytorium) NIE ZNA zmiennej PSYCHON_TRYB_WDROZENIA (skrot pliku
#          nie jest na liscie ZNANE_DOBRE_SKROTY_DEPLOY - stary skrypt sprzed
#          wprowadzenia trybu --tylko-zrzut) ALBO pomiar tego NIE WIEM (pliku
#          nie ma, kanal padl bez pomiaru, albo pomiar urwal sie w polowie) -
#          oba wyniki odmawiaja TYM SAMYM kodem, bo brak pomiaru nigdy nie
#          jest zgoda. Odmawiam PRZED jakimkolwiek poleceniem zmieniajacym
#          hosta (zero `docker compose`, zero pg_dump): stary skrypt nie
#          parsuje argumentow w ogole, wiec samo jego WYWOLANIE (nawet ze
#          znacznikiem wersji) przebieglo w pomiarze PELNY zwykly przeplyw
#          (build, force-recreate, migrate) zamiast samego zrzutu bazy - stad
#          pomiar jest WYLACZNIE CZYSTYM ODCZYTEM (sha256sum pliku na hoscie),
#          zero wywolania deploy.sh.
#   47   - --ustaw-czubek: kanal zdalny zrzutu zakonczyl sie ZEREM,
#          ale bez ani jednego wiersza POMIAR- - nie wiem, czy zrzut na
#          hoscie w ogole ruszyl, czy polaczenie padlo tuz przed pierwszym
#          echo. Zerowy kod kanalu tu NIE MOZE byc cicho odczytany jako
#          sukces (kod 0 nie nalezy do tego rozlacznego zbioru) - checkout
#          SIE NIE ODBYWA. Blizniaczy przypadek w kroku checkout ma kod 44;
#          ten sam brak w kroku zrzutu mial dawniej kod 0.
#   inne - kod kanalu zdalnego przepuszczony bez zmiany (np. 9, 255 z `ssh`)
set -uo pipefail

MASKA="HOST-UKRYTY"
# Zakaz obejmuje adres ORAZ konto wdrozeniowe; sciezke katalogu kopii chowamy
# tak, zeby nazwa katalogu zostala czytelna, a miejsce na dysku nie - z logu ma
# byc wiadomo, CO sie stalo, a nie GDZIE stoi stos.
MASKA_KONTA="KONTO-UKRYTE"
MASKA_SCIEZKI="SCIEZKA-UKRYTA"
UZYCIE='uzycie: wdroz-zdalnie.sh <pelny-40-znakowy-sha> [--warunki-wstepne | --zaloz-katalog-kopii | --ustaw-czubek]   (adres hosta wylacznie ze zmiennej HOST_BRAMKOWY)'

# --- argumenty -------------------------------------------------------------
# Adresu tu nie ma i nie bedzie: kazdy nadmiarowy argument pozycyjny konczy
# bieg kodem 2. Gdyby przyrzad go po cichu ignorowal, wolajacy mialby prawo
# sadzic, ze podany adres cos znaczy.
SHA=""
TRYB="pelny"
for arg in "$@"; do
    case "$arg" in
        --warunki-wstepne|--zaloz-katalog-kopii|--ustaw-czubek)
            # Tryb jest JEDEN i jawny. Dwa tryby naraz to pytanie bez
            # odpowiedzi, a nie polecenie - konczymy uzyciem.
            if [ "$TRYB" != "pelny" ]; then
                echo "$UZYCIE" >&2
                exit 2
            fi
            case "$arg" in
                --warunki-wstepne) TRYB="warunki" ;;
                --zaloz-katalog-kopii) TRYB="zaloz" ;;
                *) TRYB="czubek" ;;
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
KATALOG_NADRZEDNY="$(dirname "$KATALOG_KOPII")"
# Kandydaci na sciezke repozytorium hosta, sprawdzani PO KOLEI na hoscie -
# pierwszy, ktory ma .git, WYGRYWA. Pierwszy kandydat to STARA stala (kiedys
# jedyny, cichy domysl, nigdy nie zmierzony) - zostaje, ale juz tylko jako
# PIERWSZY sprawdzany, nie jako prawda przyjmowana bez pomiaru. REPO_HOSTA
# samo zaczyna PUSTE: dostaje wartosc wylacznie z pomiaru (patrz
# `zmierz_stan_katalogow`/`wymagaj_repo` nizej), nigdy z zgadywania.
REPO_HOSTA_DOMYSLNY="${PSYCHON_REPO_HOSTA:-$KATALOG_STOSU/psychon-platforma}"
KANDYDACI_REPO_HOSTA=("$REPO_HOSTA_DOMYSLNY" "$KATALOG_STOSU/app")
REPO_HOSTA=""
PLIK_SRODOWISKA="${PSYCHON_ENV_FILE:-$KATALOG_STOSU/.env}"
PROG_WOLNE_KB="${PSYCHON_PROG_WOLNE_KB:-1048576}"
OCZEKIWANE_KONTENEROW="${PSYCHON_LICZBA_KONTENEROW:-8}"
KATALOG_LOGOW_HOSTA="${PSYCHON_KATALOG_LOGOW_HOSTA:-/tmp/psychon-wdrozenia}"
KATALOG_LOGOW_LOKALNY="${PSYCHON_KATALOG_LOGOW:-${TMPDIR:-/tmp}/psychon-wdrozenia}"

STEMPEL="$(date +%Y%m%d-%H%M%S)"
LOG_HOSTA="$KATALOG_LOGOW_HOSTA/wdrozenie-$SHA-$STEMPEL.log"
LOG_LOKALNY="$KATALOG_LOGOW_LOKALNY/wdrozenie-$SHA-$STEMPEL.log"
# krok zrzutu (--ustaw-czubek) zostawia SWOJ log na hoscie, tym samym
# wzorcem co krok wdrozenia (LOG_HOSTA) - dawniej cale wyjscie deploy.sh w tym
# kroku szlo w `/dev/null`, wiec trojwartosciowe rozstrzygniecia rotacji zrzutow
# ("NIE WIEM") nie docieraly nigdzie, ani na stacje, ani na hosta.
LOG_HOSTA_ZRZUT="$KATALOG_LOGOW_HOSTA/zrzut-$SHA-$STEMPEL.log"

# skroty (sha256) deploy/psychon-dev/deploy.sh, ktore ZNAJA zmienna
# PSYCHON_TRYB_WDROZENIA - jedyna prawda o tym, czy `--ustaw-czubek` smie
# wolac `deploy.sh --tylko-zrzut` na hoscie PRZED checkoutem. KAZDY commit,
# ktory zmienia ten plik (takze komentarzem - sha256 nie odroznia tresci od
# komentarza), MUSI dopisac tu swoj nowy skrot: `sha256sum
# deploy/psychon-dev/deploy.sh`. Pierwsza pozycja to skrot ze stanu tego
# repozytorium w chwili wprowadzenia trybu (commit, ktory dolozyl ta liste).
ZNANE_DOBRE_SKROTY_DEPLOY=(
    "7824bdef4fddaab4fdeb8f238abbb7d615d8df8e2d131bb171158bf5dfa15537"
)

# Warunek wstepny STACJI, sprawdzany przed czymkolwiek, co siega hosta. Na
# koncu potoku stoi `tee`: gdy nie ma gdzie pisac, `tee` i tak konczy zerem, a
# kod bierzemy z pierwszego ogniwa - wiec bieg BEZ SLADU melduje sie jako
# udany i podaje sciezke kopii, ktorej nie ma. Najciezej wazy to w trybie,
# ktory na hoscie cos ZMIENIA: log jest wtedy jedynym opisem tego, co zaszlo.
mkdir -p "$KATALOG_LOGOW_LOKALNY" 2>/dev/null
if ! ( : > "$LOG_LOKALNY" ) 2>/dev/null; then
    echo "Katalog logow $KATALOG_LOGOW_LOKALNY nie jest zapisywalny - nie zaloze $LOG_LOKALNY." >&2
    echo "Biegu NIE uruchamiam: bez kopii lokalnej nie byloby z czego odczytac, co sie stalo." >&2
    exit 10
fi

WDROZENIE_RUSZYLO=0
# czy krok zrzutu (--ustaw-czubek) w ogole ruszyl - stopka ma prawo
# wspomniec jego log na hoscie tylko wtedy, gdy plik tam realnie mogl powstac.
ZRZUT_RUSZYLO=0

# --- maska -----------------------------------------------------------------
# Filtr na CALYM wyjsciu przyrzadu, nie tylko na wlasnych `echo`: adres
# potrafi wrocic w komunikacie `ssh` ("connect to host ..."), ktorego autorem
# nie jest ten plik. Podstawienie jest doslowne (cudzyslow wokol wzorca), wiec
# kropki w adresie nie sa znakiem wieloznacznym - i z tego samego powodu nie
# ma tu `sed`: zle zescapowany wzorzec nie zaslania nic i robi to po cichu,
# czyli daje dokladnie ten blad, ktoremu filtr ma zapobiegac.
#
# Kolejnosc ma znaczenie: najpierw sciezka nadrzedna (dluzszy napis, moze
# zawierac nazwe konta), potem adres, na koncu konto.
maskuj() {
    local linia
    while IFS= read -r linia || [ -n "$linia" ]; do
        if [ -n "$KATALOG_NADRZEDNY" ]; then
            linia="${linia//"$KATALOG_NADRZEDNY"/$MASKA_SCIEZKI}"
        fi
        if [ -n "$HOST" ]; then
            linia="${linia//"$HOST"/$MASKA}"
        fi
        if [ -n "$UZYTKOWNIK" ]; then
            linia="${linia//"$UZYTKOWNIK"/$MASKA_KONTA}"
        fi
        printf '%s\n' "$linia"
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
    if [ "$ZRZUT_RUSZYLO" -eq 1 ]; then
        echo "[CZUBEK] log zrzutu (skrypt wdrozeniowy hosta, tryb --tylko-zrzut) na hoscie: $LOG_HOSTA_ZRZUT"
    fi
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
    argi="$(printf '%q %q' "$KATALOG_KOPII" "$SHA"; printf ' %q' "${KANDYDACI_REPO_HOSTA[@]}")"
    POMIAR_WYJSCIE="$(ssh -o BatchMode=yes -o ServerAliveInterval=20 \
        "$UZYTKOWNIK@$HOST" "bash -s -- warunki $argi" 2>&1 <<"ZDALNE"
set -uo pipefail
KATALOG_KOPII="$2"; SHA="$3"; shift 3
# Pozostale argumenty ("$@") sa kandydatami na sciezke repozytorium, w
# kolejnosci pierwszenstwa.

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

# Sciezka repozytorium jest MIERZONA, nie zgadywana: pierwszy kandydat z
# .git wygrywa. Zadnego z kandydatow nie zakladamy ani nie tworzymy - sam
# poszukiwania nie zmieniaja na hoscie niczego.
REPO_WYBRANY=""
for kandydat in "$@"; do
    if [ -d "$kandydat/.git" ]; then
        REPO_WYBRANY="$kandydat"
        break
    fi
done

if [ -n "$REPO_WYBRANY" ]; then
    echo "POMIAR-REPO=$REPO_WYBRANY"
    echo "POMIAR-HEAD=$(git -C "$REPO_WYBRANY" rev-parse HEAD 2>/dev/null || echo brak)"
    # Warunek (c'): zadany commit ISTNIEJE na zdalnym PO fetch - nie
    # porownanie z czubkiem lokalnym (to byl warunek KONCOWY checkoutu,
    # przebrany za wstepny). Fetch tu jest jedynym sposobem, zeby to w ogole
    # zmierzyc PRZED checkoutem - nie zaklada, nie zmienia drzewa roboczego,
    # dotyka wylacznie zdalnie sledzonych referencji.
    if git -C "$REPO_WYBRANY" fetch --quiet origin 2>/dev/null; then
        echo "POMIAR-FETCH=ok"
    else
        echo "POMIAR-FETCH=nie-udalo-sie"
    fi
    if git -C "$REPO_WYBRANY" cat-file -e "$SHA^{commit}" 2>/dev/null; then
        echo "POMIAR-SHA-NA-ZDALNYM=tak"
    else
        echo "POMIAR-SHA-NA-ZDALNYM=nie"
    fi
    # Warunek (d): drzewo robocze musi byc czyste. Lista pozycji - nie tylko
    # ich liczba - bo odmowa ma NAZYWAC, co stoi na przeszkodzie.
    DRZEWO_POZYCJE="$(git -C "$REPO_WYBRANY" status --porcelain 2>/dev/null)"
    echo "POMIAR-REPO-DRZEWO-LINII=$(printf '%s\n' "$DRZEWO_POZYCJE" | grep -c .)"
    echo "POMIAR-REPO-DRZEWO-LISTA=$(printf '%s' "$DRZEWO_POZYCJE" | tr '\n' ';')"
else
    echo "POMIAR-REPO=brak"
    echo "POMIAR-HEAD=brak-repozytorium"
    echo "POMIAR-FETCH=brak-repozytorium"
    echo "POMIAR-SHA-NA-ZDALNYM=nie"
    echo "POMIAR-REPO-DRZEWO-LINII=-1"
    echo "POMIAR-REPO-DRZEWO-LISTA="
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
P_REPO=""; P_FETCH=""; P_SHA_ZDALNY=""; P_REPO_DRZEWO=""; P_REPO_DRZEWO_LISTA=""
# Pola wlasciciela niosa nazwe konta, wiec maja osobna postac DO WYPISANIA.
# Wartosci surowe zostaja do porownan - gdyby maska wchodzila do nich, warunek
# "rodzic nalezy do konta wdrazajacego" porownywalby maske z maska i zawsze
# wychodzil na tak.
P_WLASCICIEL_POKAZ=""; P_R_WLASCICIEL_POKAZ=""
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
    P_REPO="$(pomiar REPO "$wyjscie")"
    P_FETCH="$(pomiar FETCH "$wyjscie")"
    P_SHA_ZDALNY="$(pomiar SHA-NA-ZDALNYM "$wyjscie")"
    P_REPO_DRZEWO="$(liczba_lub_minus "$(pomiar REPO-DRZEWO-LINII "$wyjscie")")"
    P_REPO_DRZEWO_LISTA="$(pomiar REPO-DRZEWO-LISTA "$wyjscie")"
    P_WLASCICIEL_POKAZ="$P_WLASCICIEL"
    P_R_WLASCICIEL_POKAZ="$P_R_WLASCICIEL"
    if [ -n "$P_KTO" ]; then
        P_WLASCICIEL_POKAZ="${P_WLASCICIEL//"$P_KTO"/$MASKA_KONTA}"
        P_R_WLASCICIEL_POKAZ="${P_R_WLASCICIEL//"$P_KTO"/$MASKA_KONTA}"
    fi
}

# Konto wdrozeniowe jest w wyjsciu zakazane tak samo jak adres, a filtr maski
# stoi w OSOBNYM procesie potoku i zna wylacznie konto ZADANE. Konto zmierzone
# na hoscie wypisujemy wiec tylko wtedy, gdy jest tym samym napisem - inaczej
# przeszloby przez filtr nietkniete. Rozjazd nazywamy, nazwy nie podajemy.
konto_do_wypisu() {
    if [ "$P_KTO" = "$UZYTKOWNIK" ]; then
        printf '%s' "$P_KTO"
    else
        printf '%s' "KONTO-INNE-NIZ-ZADANE"
    fi
}

# Surowy pomiar tez idzie na wyjscie, a niesie wiersz POMIAR-KTO i pola
# wlasciciela. Podstawiamy w nim konto zmierzone, bo to jedyne miejsce w
# przyrzadzie, ktore te nazwe w ogole widzi przed filtrem.
wypisz_surowy_pomiar() {
    local linia kto
    kto="$(pomiar KTO "$1")"
    printf '%s\n' "$1" | while IFS= read -r linia || [ -n "$linia" ]; do
        if [ -n "$kto" ]; then
            linia="${linia//"$kto"/$MASKA_KONTA}"
        fi
        printf '%s\n' "$linia"
    done
}

# Po jednej linii na katalog kopii i na jego katalog nadrzedny - to jest to,
# czym mierzy sie brak prawa zapisu, na ktorym stanelo wdrozenie. Format jest
# jeden dla wszystkich trybow; rozni je tylko znacznik z przodu, zeby dalo sie
# zestawic pomiar sprzed zmiany z pomiarem po niej.
wypisz_pomiar() {
    local tag="$1"
    echo "$tag katalog kopii $KATALOG_KOPII: istnieje=$P_ISTNIEJE, wlasciciel=$P_WLASCICIEL_POKAZ, prawa=$P_PRAWA, zapis=$P_ZAPIS, wolne=$P_WOLNE KB"
    echo "$tag katalog nadrzedny $KATALOG_NADRZEDNY: wlasciciel=$P_R_WLASCICIEL_POKAZ, prawa=$P_R_PRAWA, zapis=$P_R_ZAPIS, wolne=$P_R_WOLNE KB"
    echo "$tag uzytkownik wdrazajacy na hoscie: $(konto_do_wypisu)"
}

# Wymaga zmierzonej sciezki repozytorium z OSTATNIEGO pomiaru: ustawia
# globalne REPO_HOSTA, albo konczy caly bieg kodem 15, gdy zadna ze znanych
# sciezek-kandydatow nie ma .git. Wspolna dla warunkow wstepnych i
# --ustaw-czubek - obie potrzebuja tej samej prawdy o polozeniu
# repozytorium, zmierzonej, nie zgadywanej.
wymagaj_repo() {
    local wyjscie="$1" repo
    repo="$(pomiar REPO "$wyjscie")"
    if [ -z "$repo" ] || [ "$repo" = "brak" ]; then
        echo "[WARUNEK repo] NIEZALICZONY: zadna ze znanych sciezek-kandydatow nie zawiera .git - sprawdzilem: ${KANDYDACI_REPO_HOSTA[*]}"
        exit 15
    fi
    echo "[WARUNEK repo] ZALICZONY: sciezka repozytorium na hoscie zmierzona: $repo"
    REPO_HOSTA="$repo"
}

# --- krok 1: warunki wstepne ----------------------------------------------
warunki_wstepne() {
    local rc

    echo "[WARUNKI] mierze warunki wstepne PRZED zrzutem bazy i PRZED zmiana schematu"
    zmierz_stan_katalogow
    rc=$?
    wypisz_surowy_pomiar "$POMIAR_WYJSCIE"
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

    # Sciezke repozytorium wymagamy PRZED warunkiem (c'): bez niej nie ma
    # czego fetchowac ani czyjego drzewa sprawdzac.
    wymagaj_repo "$POMIAR_WYJSCIE"

    # (c') Zadany commit ISTNIEJE na zdalnym PO fetch. To NIE jest
    # porownanie z czubkiem lokalnym - ten dawny warunek byl w istocie
    # warunkiem KONCOWYM checkoutu (host mial juz STAC na zadanym SHA),
    # przebranym za wstepny, i dlatego byl zawsze czerwony: nic w przyrzadzie
    # nie umialo tam host ustawic. Porownanie jest tu ZAWSZE "rowne slowu
    # tak" albo nie - nigdy nic posredniego, wiec nieudany fetch i brak
    # commita na zdalnym oba ladujA sie w tej samej czerwieni, tak jak dawne
    # porownanie z "brak-repozytorium" nigdy nie wypadalo rowne prawdziwemu
    # SHA.
    if [ "$P_FETCH" != "ok" ]; then
        echo "[WARUNEK c] NIEZALICZONY: fetch od zdalnego nie powiodl sie (POMIAR-FETCH=${P_FETCH:-brak}) - commita $SHA nie dalo sie sprawdzic"
        exit 13
    fi
    if [ "$P_SHA_ZDALNY" != "tak" ]; then
        echo "[WARUNEK c] NIEZALICZONY: zadany commit $SHA nie istnieje na zdalnym po fetch"
        exit 13
    fi
    echo "[WARUNEK c] ZALICZONY: zadany commit $SHA istnieje na zdalnym po fetch"

    # (d) Drzewo robocze na hoscie musi byc czyste - inaczej pozniejszy
    # checkout nadpisalby cudze zmiany. Odmowa NAZYWA pozycje, nie tylko ich
    # liczbe; zaden `reset --hard` nigdzie w tym przyrzadzie nie pada.
    if [ "$P_REPO_DRZEWO" -ne 0 ]; then
        echo "[WARUNEK d] NIEZALICZONY: drzewo robocze na hoscie ma $P_REPO_DRZEWO linii zmian: ${P_REPO_DRZEWO_LISTA:-(lista niedostepna)}"
        exit 16
    fi
    echo "[WARUNEK d] ZALICZONY: drzewo robocze na hoscie czyste"
}

# --- stan hosta po kroku zakladania ----------------------------------------
# Kod wyjscia ma odpowiadac na pytanie, z ktorym przychodzi czlowiek po urwanym
# biegu: czy cudzy katalog lezy jeszcze na swoim miejscu, czy stoi juz obok.
# Dlatego kod bierze sie ze ZMIERZONEGO stanu, a nie z tego, na ktorej linii
# bieg sie zatrzymal. Pusty wiersz pomiaru i wiersz mowiacy "nie" to DWIE
# ROZNE rzeczy: stacja sama wyliczyla, czy przeniesienia zadala (argument
# przenies_zadany), wiec umie odroznic uczciwe "nie" od zwyklego braku
# wiersza - nie zgaduje w zadna strone:
#   33 - nic nie ruszone (pomiar to potwierdza ALBO przeniesienia nie zadano)
#   35 - zastany katalog przeniesiony obok, mkdir zmierzony jako nieudany
#   36 - przeniesiony i zalozony (stan docelowy), tylko bieg tego nie potwierdzil
#   37 - NIEZNANY: przeniesienie zadano albo realnie zaszlo, ale brakuje
#        wiersza, ktory by to POTWIERDZIL lub ZAPRZECZYL
kod_stanu_hosta() {
    local wyjscie przenies_zadany prz zal
    wyjscie="$1"
    przenies_zadany="${2:-nie}"
    prz="$(pomiar PRZENIESIONY "$wyjscie")"
    zal="$(pomiar ZALOZONY "$wyjscie")"

    if [ -n "$zal" ] && [ "$zal" != "nie-udalo-sie" ]; then
        echo 36
        return
    fi

    if [ -z "$prz" ]; then
        # Pusty POMIAR-PRZENIESIONY to brak pomiaru, nie pomiar. Uczciwe 33
        # tylko gdy przeniesienia nie zadano - stacja sama to wyliczyla i
        # wyslala w argumentach. Gdy zadano, mv mogl sie udac, a wyjscie
        # urwalo sie tuz po nim: to NIEZNANY, nie "nic nie ruszone".
        if [ "$przenies_zadany" = "tak" ]; then
            echo 37
        else
            echo 33
        fi
        return
    fi
    case "$prz" in
        nie-trzeba|nie-udalo-sie)
            echo 33
            return
            ;;
    esac

    # prz to realna nazwa docelowa: przeniesienie ZASZLO i jest zmierzone.
    # Brak POMIAR-ZALOZONY w ogole (pusty, nie "nie-udalo-sie") to ten sam
    # brak pomiaru w kierunku mniej groznym: mkdir mogl sie udac, ale
    # wyjscie urwalo sie tuz po przeniesieniu.
    if [ -z "$zal" ]; then
        echo 37
        return
    fi
    echo 35
}

# Zdanie o stanie hosta pisane z TYCH SAMYCH pomiarow co kod wyjscia - zeby
# meldunek nie mogl przeczyc wierszowi POMIAR- stojacemu nad nim.
opisz_stan_hosta() {
    local wyjscie przenies_zadany prz zal
    wyjscie="$1"
    przenies_zadany="${2:-nie}"
    prz="$(pomiar PRZENIESIONY "$wyjscie")"
    zal="$(pomiar ZALOZONY "$wyjscie")"
    case "$(kod_stanu_hosta "$wyjscie" "$przenies_zadany")" in
        33)
            echo "[KATALOG-KOPII] stan hosta: nic nie zostalo ruszone - zastany katalog lezy tam, gdzie lezal"
            ;;
        35)
            echo "[KATALOG-KOPII] stan hosta: zastany katalog STOI JUZ OBOK pod nazwa $prz, nowego katalogu NIE zalozylem"
            echo "[KATALOG-KOPII] nic nie skasowano; uprzatniecie zostaje dla czlowieka - dane z zastanego katalogu sa w calosci pod ta nazwa"
            ;;
        36)
            echo "[KATALOG-KOPII] stan hosta: zastany katalog obok ($prz), nowy katalog zalozony ($zal) - stan docelowy osiagniety"
            ;;
        37)
            echo "[KATALOG-KOPII] stan hosta: NIEZNANY - pomiar urwal sie w miejscu, ktore nie potwierdza ani nie zaprzecza przeniesieniu/zalozeniu"
            echo "[KATALOG-KOPII] obok katalogu kopii moze juz lezec $KATALOG_KOPII.zastane-$STEMPEL - sprawdz recznie na hoscie, zanim cokolwiek ruszysz"
            ;;
    esac
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
    local rc argi wyjscie zastany przenies zajety

    echo "[KATALOG-KOPII] tryb jawny: mierze stan przed zmiana"
    zmierz_stan_katalogow
    rc=$?
    wypisz_surowy_pomiar "$POMIAR_WYJSCIE"
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
        echo "[KATALOG-KOPII] NIEZALICZONY: katalog nadrzedny $KATALOG_NADRZEDNY ma wlasciciela $P_R_WLASCICIEL_POKAZ i zapis=$P_R_ZAPIS, a uzytkownik wdrazajacy to $(konto_do_wypisu)"
        echo "[KATALOG-KOPII] to juz cudze uprawnienie - nie zakladam, nie przenosze, praw nie podnosze"
        exit 31
    fi
    echo "[KATALOG-KOPII] katalog nadrzedny nalezy do $(konto_do_wypisu) i jest zapisywalny - dzialam w granicach wlasnego prawa"

    # (2) Decyzja o przeniesieniu zapada TU, z pomiaru, a nie na hoscie.
    przenies=nie
    if [ "$P_ISTNIEJE" = "tak" ] && { [ "${P_WLASCICIEL%%:*}" != "$P_KTO" ] || [ "$P_ZAPIS" != "tak" ]; }; then
        przenies=tak
    fi
    zastany="$KATALOG_KOPII.zastane-$STEMPEL"
    if [ "$przenies" = "tak" ]; then
        echo "[KATALOG-KOPII] zastany katalog nalezy do $P_WLASCICIEL_POKAZ (zapis=$P_ZAPIS): PRZENIOSE go na $zastany, nie skasuje"
    else
        echo "[KATALOG-KOPII] nie ma czego przenosic: istnieje=$P_ISTNIEJE, wlasciciel=$P_WLASCICIEL_POKAZ, zapis=$P_ZAPIS"
    fi

    argi="$(printf '%q %q %q' "$KATALOG_KOPII" "$zastany" "$przenies")"
    wyjscie="$(ssh -o BatchMode=yes -o ServerAliveInterval=20 \
        "$UZYTKOWNIK@$HOST" "bash -s -- zaloz $argi" 2>&1 <<"ZDALNE"
set -uo pipefail
KATALOG_KOPII="$2"; ZASTANY="$3"; PRZENIES="$4"

# Ta czesc zdalna rusza WYLACZNIE dwie sciezki: katalog kopii i jego zastana
# postac obok. Nic poza wlasna sciezka nie leci - i ani jednego kasowania.
if [ "$PRZENIES" = "tak" ]; then
    # Cel MUSI byc wolny. `mv` na istniejacy katalog nie konczy sie bledem -
    # wklada katalog DO SRODKA celu, a przyrzad zameldowalby "obok". Stempel
    # ma ziarnistosc sekundy, wiec drugi bieg w tej samej sekundzie trafia
    # dokladnie w ten uklad. Nie zgadujemy nowej nazwy: zastany katalog moze
    # trzymac zrzuty bazy jawnym tekstem i ma zostac tam, gdzie go zastalismy.
    if [ -e "$ZASTANY" ]; then
        echo "POMIAR-ZASTANY-ZAJETY=$ZASTANY"
        exit 5
    fi
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
    zajety="$(pomiar ZASTANY-ZAJETY "$wyjscie")"
    if [ -n "$zajety" ]; then
        echo "[KATALOG-KOPII] NIEZALICZONY: nazwa docelowa $zajety jest juz zajeta - NIE przenosze, bo katalog wladowalby sie do jej srodka"
        echo "[KATALOG-KOPII] zastany katalog zostaje nietkniety; powtorz bieg za sekunde albo uprzatnij nazwe docelowa"
        exit 34
    fi
    if [ "$rc" -ne 0 ]; then
        # Kod hosta a kod kanalu to dwie rozne wiadomosci. Skoro w wyjsciu sa
        # nasze wiersze POMIAR-, czesc zdalna RUSZYLA i to ona odmowila -
        # wolajacy nie ma prawa czytac tego jako zerwanego polaczenia.
        # DOPASOWANIE BEZ POTOKU. `printf ... | grep -q` pod `set -o
        # pipefail` (naglowek pliku) potrafil odwrocic sie SAM: `grep -q`
        # konczy natychmiast po pierwszym dopasowaniu i zamyka swoj koniec
        # potoku, `printf` przy duzej tresci dostaje SIGPIPE (rc 141), a
        # pipefail bierze TEN kod jako kod calego potoku - warunek staje sie
        # falszem, choc POMIAR- naprawde stal w tresci. Zmierzone: przy ~200
        # kB tresci status potoku = 141, przy kilkunastu bajtach = 0.
        # Tu-string (`<<<`) nie jest potokiem - grep czyta z tymczasowego
        # deskryptora, zaden proces nie moze dostac SIGPIPE.
        if grep -q '^POMIAR-' <<<"$wyjscie"; then
            echo "[KATALOG-KOPII] NIEZALICZONY: krok zakladania na hoscie nie powiodl sie (kod z hosta: $rc)"
            opisz_stan_hosta "$wyjscie" "$przenies"
            exit "$(kod_stanu_hosta "$wyjscie" "$przenies")"
        fi
        echo "[KATALOG-KOPII] kanal zdalny nie doszedl (kod $rc) - krok zakladania nie ruszyl"
        exit "$rc"
    fi
    if [ -z "$(pomiar KONIEC-ZAKLADANIA "$wyjscie")" ]; then
        echo "[KATALOG-KOPII] NIEZALICZONY: krok zakladania urwal sie - brak linii konca"
        opisz_stan_hosta "$wyjscie" "$przenies"
        exit "$(kod_stanu_hosta "$wyjscie" "$przenies")"
    fi
    echo "[KATALOG-KOPII] zastany katalog: $(pomiar PRZENIESIONY "$wyjscie"), pozycji w srodku: $(pomiar ZASTANE-POZYCJI "$wyjscie") (nic nie skasowano)"
    echo "[KATALOG-KOPII] zalozony: $(pomiar ZALOZONY "$wyjscie") (umask 077, czyli prawa 700)"

    # (4) Pomiar PO zmianie - tym samym kodem i w tym samym formacie co warunki
    # wstepne. Zielen tego trybu bierze sie z niego, a nie z tego, ze polecenia
    # poszly bez bledu.
    zmierz_stan_katalogow
    rc=$?
    wypisz_surowy_pomiar "$POMIAR_WYJSCIE"
    if [ "$rc" -ne 0 ]; then
        # Do tego miejsca dochodzimy tylko z krokiem zakladania W PELNI
        # potwierdzonym (linia KONIEC-ZAKLADANIA byla obecna) - stan hosta
        # jest juz znany z $wyjscie, tu pada wylacznie kanal WERYFIKACJI po
        # zmianie. Kod wyjscia NIE MOZE byc surowym kodem kanalu: ten sam
        # surowy kod (np. 255) pada tez wyzej, gdy kanal kroku zakladania
        # umiera PRZED dotknieciem hosta (linia "krok zakladania nie
        # ruszyl") - a to dwa rozne stany hosta. Wychodzimy wiec zmierzonym
        # stanem, nie kodem kanalu.
        echo "[KATALOG-KOPII] pomiar po zmianie nie doszedl (kod $rc) - stan zakladania mam juz potwierdzony z poprzedniego kroku"
        opisz_stan_hosta "$wyjscie" "$przenies"
        exit "$(kod_stanu_hosta "$wyjscie" "$przenies")"
    fi
    if [ -z "$(pomiar KONIEC "$POMIAR_WYJSCIE")" ]; then
        echo "[KATALOG-KOPII] NIEZALICZONY: pomiar po zmianie urwal sie w polowie - zmiany na hoscie JUZ zaszly"
        opisz_stan_hosta "$wyjscie" "$przenies"
        exit "$(kod_stanu_hosta "$wyjscie" "$przenies")"
    fi
    wczytaj_pomiar "$POMIAR_WYJSCIE"
    wypisz_pomiar "[KATALOG-KOPII po]"

    # (5) Niezapisywalny katalog po calej operacji to czerwien, nie uwaga.
    if [ "$P_ZAPIS" != "tak" ]; then
        echo "[KATALOG-KOPII] NIEZALICZONY: po operacji katalog kopii nadal nie jest zapisywalny dla $(konto_do_wypisu) (wlasciciel=$P_WLASCICIEL_POKAZ, prawa=$P_PRAWA)"
        exit 32
    fi
    echo "[KATALOG-KOPII] ZALICZONY: katalog kopii zapisywalny dla $(konto_do_wypisu), wlasciciel=$P_WLASCICIEL_POKAZ, prawa=$P_PRAWA"
}

# --- tryb --ustaw-czubek ----------------------------------------------------
# Tryb JAWNY i osobny, na wzor --zaloz-katalog-kopii: nie wlacza sie z zadnej
# innej sciezki. Rozwiazuje ten sam brak co ten katalog rozwiazal dla praw
# katalogu kopii - tu chodzi o czubek repozytorium, ktorego przyrzad wczesniej
# tylko MIERZYL (warunek c'), nigdy nie ustawial. Dziala w dwoch krokach:
# fetch+checkout na hoscie (WYLACZNIE gdy drzewo jest juz zmierzone jako
# czyste), a nie `reset --hard` - cudzych zmian nigdy nie nadpisuje, tylko
# odmawia. Mierzy stan PRZED i PO, z rozlacznymi kodami dla rozlacznych
# stanow hosta (patrz naglowek pliku, kody 40-44).
ustaw_czubek() {
    local rc head_przed argi wyjscie rc2 head_po
    local argi_zrzut wyjscie_zrzut rc_zrzut_kanal rc_po_zrzut head_po_zrzut
    local argi_tryb wyjscie_tryb rc_tryb_kanal

    echo "[CZUBEK] tryb jawny: mierze stan przed zmiana (w tym fetch od zdalnego)"
    zmierz_stan_katalogow
    rc=$?
    wypisz_surowy_pomiar "$POMIAR_WYJSCIE"
    if [ "$rc" -ne 0 ]; then
        echo "[CZUBEK] kanal zdalny nie doszedl (kod $rc) - niczego nie ustawiam"
        exit "$rc"
    fi
    if [ -z "$(pomiar KONIEC "$POMIAR_WYJSCIE")" ]; then
        echo "[CZUBEK] NIEZALICZONY: pomiar urwal sie w polowie - niczego nie ustawiam"
        exit 14
    fi
    wczytaj_pomiar "$POMIAR_WYJSCIE"
    wymagaj_repo "$POMIAR_WYJSCIE"

    head_przed="$(pomiar HEAD "$POMIAR_WYJSCIE")"
    echo "[CZUBEK] stan przed: repo=$REPO_HOSTA, HEAD=$head_przed, drzewo robocze: $P_REPO_DRZEWO linii zmian"

    # (1) Juz na miejscu - wlasny, ROZLACZNY kod. Zaden fetch/checkout sie
    # nie odbywa: nie ma czego ustawiac.
    if [ "$head_przed" = "$SHA" ]; then
        echo "[CZUBEK] ZALICZONY: czubek na hoscie juz rowny zadanemu $SHA - nic nie ruszam"
        exit 40
    fi

    # (2) Drzewo brudne - odmawiam PRZED jakimkolwiek fetchem/checkoutem.
    # Nigdy `reset --hard`: cudzych zmian nie nadpisuje.
    if [ "$P_REPO_DRZEWO" -ne 0 ]; then
        echo "[CZUBEK] NIEZALICZONY: drzewo robocze na hoscie ma $P_REPO_DRZEWO linii zmian: ${P_REPO_DRZEWO_LISTA:-(lista niedostepna)} - NIE nadpisuje cudzych zmian, odmawiam"
        exit 43
    fi

    # (3) Fetch nie przyniosl zadanego commita - checkout by i tak nie mial
    # na czym stanac.
    if [ "$P_FETCH" != "ok" ]; then
        echo "[CZUBEK] NIEZALICZONY: fetch od zdalnego nie powiodl sie (POMIAR-FETCH=${P_FETCH:-brak}) - checkout sie nie odbywa"
        exit 42
    fi
    if [ "$P_SHA_ZDALNY" != "tak" ]; then
        echo "[CZUBEK] NIEZALICZONY: fetch nie przyniosl commita $SHA - na zdalnym go nie ma, checkout sie nie odbywa"
        exit 42
    fi
    echo "[CZUBEK] fetch potwierdzony, commit $SHA jest na zdalnym i drzewo jest czyste - checkout dozwolony"

    # LUKA ROZRUCHOWA. `deploy.sh` z PRZED tego trybu nie zna
    # PSYCHON_TRYB_WDROZENIA (0 wystapien) - ustawiony a nieznany, zmienna
    # jest po prostu IGNOROWANA: stary skrypt nie parsuje ARGUMENTOW w ogole,
    # wiec samo jego WYWOLANIE (nawet ze znacznikiem wersji jako argumentem)
    # przebieglo w pomiarze PELNY zwykly przeplyw - 6 polecen zmieniajacych
    # hosta (composer, build, force-recreate, migrate...) PRZED jakakolwiek
    # odmowa, mimo ze repozytorium NIE jest jeszcze checkoutowane na $SHA.
    # Z dwoch dopuszczalnych przyrzadow pomiaru (znacznik wersji w argumencie
    # ALBO skrot tresci porownany z lista znanych) wybieram DRUGI: wywolanie
    # deploy.sh z NIEZNANYM MU argumentem jest dokladnie tym niebezpiecznym
    # trikiem, ktory ten warunek ma wykluczyc - pomiar musi wiec zostac
    # CZYSTYM ODCZYTEM PLIKU (sha256sum), zero wywolania. Lista znanych
    # skrotow rosnie z kazdym commitem, ktory zmienia
    # deploy/psychon-dev/deploy.sh - znany koszt utrzymania, przyjety
    # swiadomie w zamian za bezpieczenstwo pomiaru.
    argi_tryb="$(printf '%q' "$REPO_HOSTA"; printf ' %q' "${ZNANE_DOBRE_SKROTY_DEPLOY[@]}")"
    wyjscie_tryb="$(ssh -o BatchMode=yes -o ServerAliveInterval=20 \
        "$UZYTKOWNIK@$HOST" "bash -s -- sprawdz-tryb $argi_tryb" 2>&1 <<"ZDALNE"
set -uo pipefail
REPO_HOSTA="$2"; shift 2
# Pozostale argumenty ("$@") sa znanymi-dobrymi skrotami deploy.sh, w
# kolejnosci przyjscia - zaden nie jest zgadywany, wszystkie przyszly ze
# stacji.
plik_deploy="$REPO_HOSTA/deploy/psychon-dev/deploy.sh"
if [ ! -f "$plik_deploy" ]; then
    echo "POMIAR-DEPLOY-ISTNIEJE=nie"
else
    echo "POMIAR-DEPLOY-ISTNIEJE=tak"
    skrot_zmierzony="$(sha256sum -- "$plik_deploy" 2>/dev/null | awk '{print $1}')"
    echo "POMIAR-DEPLOY-SKROT=${skrot_zmierzony:-nieczytelny}"
    znany="nie"
    if [ -n "$skrot_zmierzony" ]; then
        for kandydat in "$@"; do
            if [ "$kandydat" = "$skrot_zmierzony" ]; then
                znany="tak"
                break
            fi
        done
    fi
    echo "POMIAR-DEPLOY-ZNA-TRYB=$znany"
fi
echo "POMIAR-KONIEC-TRYB=0"
ZDALNE
)"
    rc_tryb_kanal=$?
    printf '%s\n' "$wyjscie_tryb"
    if ! grep -q '^POMIAR-' <<<"$wyjscie_tryb"; then
        if [ "$rc_tryb_kanal" -ne 0 ]; then
            echo "[CZUBEK] kanal zdalny sprawdzenia trybu skryptu wdrozeniowego hosta nie doszedl (kod $rc_tryb_kanal) - checkout SIE NIE ODBYWA"
            exit "$rc_tryb_kanal"
        fi
        # Kanal skonczyl ZEREM bez zadnego pomiaru - to jest "NIE WIEM", nie
        # "wolno": kod 46 obejmuje ROWNIEZ ten wynik (nie tylko jawne "nie
        # zna"), bo brak pomiaru nigdy nie jest zgoda.
        echo "[CZUBEK] NIEZALICZONY: pomiar trybu skryptu wdrozeniowego hosta zakonczyl sie zerem bez zadnego pomiaru (NIE WIEM) - checkout SIE NIE ODBYWA, zero polecen zmieniajacych hosta"
        exit 46
    fi
    if [ -z "$(pomiar KONIEC-TRYB "$wyjscie_tryb")" ]; then
        echo "[CZUBEK] NIEZALICZONY: pomiar trybu skryptu wdrozeniowego hosta urwal sie w polowie (NIE WIEM) - checkout SIE NIE ODBYWA, zero polecen zmieniajacych hosta"
        exit 46
    fi
    if [ "$(pomiar DEPLOY-ISTNIEJE "$wyjscie_tryb")" != "tak" ]; then
        echo "[CZUBEK] NIEZALICZONY: na hoscie nie ma skryptu wdrozeniowego (deploy/psychon-dev/) pod zmierzona sciezka repozytorium $REPO_HOSTA - checkout SIE NIE ODBYWA, zero polecen zmieniajacych hosta"
        exit 46
    fi
    if [ "$(pomiar DEPLOY-ZNA-TRYB "$wyjscie_tryb")" != "tak" ]; then
        echo "[CZUBEK] NIEZALICZONY: skrypt wdrozeniowy hosta NIE zna PSYCHON_TRYB_WDROZENIA (skrot $(pomiar DEPLOY-SKROT "$wyjscie_tryb") nie jest na liscie znanych-dobrych - stara wersja sprzed wprowadzenia trybu czubka) - zrzut PRZED checkoutem wykonalby PELNY przeplyw zamiast samej bazy. Odmawiam PRZED jakimkolwiek poleceniem zmieniajacym hosta (WARUNEK WDROZENIA: przeprowadz host raz zwyklym wdrozeniem PRZED pierwszym uzyciem --ustaw-czubek)"
        exit 46
    fi
    echo "[CZUBEK] skrypt wdrozeniowy hosta zna PSYCHON_TRYB_WDROZENIA (skrot $(pomiar DEPLOY-SKROT "$wyjscie_tryb") jest na liscie znanych-dobrych) - zrzut PRZED checkoutem dozwolony"

    # Zrzut kopii bazy MUSI stac PRZED checkoutem, nie po nim: gdyby stal po
    # nim (jak w zwyklym biegu `wdrozenie`), kolejnosc przy uzyciu tego trybu
    # wychodzilaby checkout -> budowanie -> zrzut -> migracja, i zrzut
    # przestawalby chronic przed zlym CHECKOUTEM, chronilby juz tylko przed
    # zla migracja - a to jest dokladnie ryzyko, ktore ten krok ma usunac.
    # Wola WYLACZNIE deploy/psychon-dev/deploy.sh w trybie --tylko-zrzut:
    # kod juz stojacy na hoscie (repozytorium jeszcze NIE jest checkoutowane
    # na $SHA), nie kod z commita, ktory dopiero wjezdza. Ten tryb podnosi
    # wylacznie baze (zadnego app/queue/frontend/caddy), robi zrzut i
    # rotacje, i konczy - migracje/budowanie zostaja dla pozniejszego biegu
    # `deploy.sh --bez-zrzutu`, PO checkoucie.
    ZRZUT_RUSZYLO=1
    argi_zrzut="$(printf '%q %q %q %q' "$REPO_HOSTA" "$PLIK_SRODOWISKA" "$KATALOG_KOPII" "$LOG_HOSTA_ZRZUT")"
    wyjscie_zrzut="$(ssh -o BatchMode=yes -o ServerAliveInterval=20 \
        "$UZYTKOWNIK@$HOST" "bash -s -- zrzut $argi_zrzut" 2>&1 <<"ZDALNE"
set -uo pipefail
REPO_HOSTA="$2"; PLIK_SRODOWISKA="$3"; KATALOG_KOPII="$4"; LOG_HOSTA_ZRZUT="$5"

cd "$REPO_HOSTA" 2>/dev/null || { echo "POMIAR-ZRZUT=brak-repozytorium"; echo "POMIAR-KONIEC-ZRZUT=0"; exit 0; }
# log deploy.sh tego kroku ZOSTAJE na hoscie (tym samym wzorcem co
# krok wdrozenia), nie ginie w `/dev/null` - inaczej trojwartosciowe rozstrzygniecia
# rotacji zrzutow ("NIE WIEM") nie dochodza nigdzie. Katalog logu zakladamy
# PRZED biegiem: nieudany mkdir nie ma przerywac samego zrzutu, wiec brak
# katalogu tylko obcina log, nie blokuje pomiaru POMIAR-ZRZUT ponizej.
mkdir -p "$(dirname "$LOG_HOSTA_ZRZUT")" 2>/dev/null
PSYCHON_TRYB_WDROZENIA=tylko-zrzut PSYCHON_ENV_FILE="$PLIK_SRODOWISKA" PSYCHON_DB_BACKUP_DIR="$KATALOG_KOPII" \
    bash deploy/psychon-dev/deploy.sh < /dev/null > "$LOG_HOSTA_ZRZUT" 2>&1
rc_zrzut=$?
if [ "$rc_zrzut" -eq 0 ]; then
    echo "POMIAR-ZRZUT=ok"
else
    echo "POMIAR-ZRZUT=nie-udalo-sie"
fi
echo "POMIAR-KONIEC-ZRZUT=0"
ZDALNE
)"
    rc_zrzut_kanal=$?
    printf '%s\n' "$wyjscie_zrzut"
    # DOPASOWANIE BEZ POTOKU (patrz komentarz przy pierwszym
    # wystapieniu wyzej w pliku) - `printf | grep -q` pod pipefail potrafil
    # odwrocic sie sam przy duzej tresci (SIGPIPE na `printf`, pipefail
    # podnosi to do statusu potoku). Tu-string nie jest potokiem.
    if ! grep -q '^POMIAR-' <<<"$wyjscie_zrzut"; then
        if [ "$rc_zrzut_kanal" -ne 0 ]; then
            # Ani jeden POMIAR-, kanal skonczyl niezerowo: kanal zrzutu nie
            # doszedl do hosta - checkout SIE NIE ODBYWA, kod kanalu idzie na
            # wierzch bez zmiany.
            echo "[CZUBEK] kanal zdalny zrzutu nie doszedl (kod $rc_zrzut_kanal) - zrzut nie ruszyl, checkout SIE NIE ODBYWA"
            exit "$rc_zrzut_kanal"
        fi
        # kanal skonczyl ZEREM, ale bez ani jednego POMIAR- - nie wiem,
        # czy zrzut na hoscie w ogole ruszyl, czy polaczenie padlo tuz przed
        # pierwszym echo. Zerowy kod kanalu NIE MOZE byc tu cicho odczytany
        # jako sukces (kod 0 nie nalezy do rozlacznego zbioru 40-47 tego
        # trybu) - blizniaczy przypadek w kroku checkout nizej ma kod 44,
        # ten sam brak tutaj mial dawniej kod 0.
        echo "[CZUBEK] stan NIEZNANY: kanal zdalny zrzutu zakonczyl sie zerem bez zadnego pomiaru - nie wiem, czy zrzut realnie ruszyl, checkout SIE NIE ODBYWA"
        exit 47
    fi
    if [ -z "$(pomiar KONIEC-ZRZUT "$wyjscie_zrzut")" ] || [ "$(pomiar ZRZUT "$wyjscie_zrzut")" != "ok" ]; then
        echo "[CZUBEK] NIEZALICZONY: zrzut PRZED checkoutem nie powiodl sie albo jego pomiar nie doszedl w calosci (POMIAR-ZRZUT=$(pomiar ZRZUT "$wyjscie_zrzut")) - checkout SIE NIE ODBYWA"
        # Dowod, ze czubek na hoscie NIE ruszyl: DRUGI pomiar HEAD, obok
        # pierwszego sprzed zrzutu - nie zdanie, tylko dwa wiersze z
        # wartosciami. Checkout i tak nigdy nie zostal wywolany (kod nizej
        # po prostu do niego nie dochodzi), wiec host zostaje taki, jaki byl,
        # niezaleznie od tego, czy ten potwierdzajacy pomiar sam dojdzie.
        echo "[CZUBEK] POMIAR-HEAD-PRZED-ZRZUTEM=$head_przed"
        zmierz_stan_katalogow
        rc_po_zrzut=$?
        wypisz_surowy_pomiar "$POMIAR_WYJSCIE"
        if [ "$rc_po_zrzut" -eq 0 ] && [ -n "$(pomiar KONIEC "$POMIAR_WYJSCIE")" ]; then
            head_po_zrzut="$(pomiar HEAD "$POMIAR_WYJSCIE")"
            echo "[CZUBEK] POMIAR-HEAD-PO-NIEUDANYM-ZRZUCIE=$head_po_zrzut"
        else
            echo "[CZUBEK] POMIAR-HEAD-PO-NIEUDANYM-ZRZUCIE=niedostepny (kanal potwierdzenia nie doszedl w calosci) - checkout i tak nigdy nie zostal wywolany"
        fi
        exit 45
    fi
    echo "[CZUBEK] zrzut PRZED checkoutem zameldowal sukces - checkout dozwolony"

    argi="$(printf '%q %q' "$REPO_HOSTA" "$SHA")"
    wyjscie="$(ssh -o BatchMode=yes -o ServerAliveInterval=20 \
        "$UZYTKOWNIK@$HOST" "bash -s -- czubek $argi" 2>&1 <<"ZDALNE"
set -uo pipefail
REPO_HOSTA="$2"; SHA="$3"

# Checkout WYLACZNIE na juz-zmierzony, czysty commit. Zaden `reset --hard`:
# gdyby ktos zmienil drzewo MIEDZY pomiarem a tym krokiem, `git checkout`
# sam odmowi, zamiast po cichu nadpisac cudza zmiane.
if git -C "$REPO_HOSTA" checkout --quiet "$SHA" 2>/dev/null; then
    echo "POMIAR-CHECKOUT=ok"
else
    echo "POMIAR-CHECKOUT=nie-udalo-sie"
fi
echo "POMIAR-KONIEC-CZUBEK=0"
ZDALNE
)"
    rc2=$?
    printf '%s\n' "$wyjscie"
    # dopasowanie bez potoku - patrz komentarz przy pierwszym
    # wystapieniu wyzej w pliku.
    if ! grep -q '^POMIAR-' <<<"$wyjscie"; then
        if [ "$rc2" -ne 0 ]; then
            # Ani jeden POMIAR-, kanal skonczyl niezerowo: kanal nie doszedl
            # do hosta, kod kanalu idzie na wierzch bez zmiany - to co innego
            # niz "host ruszyl i odmowil".
            echo "[CZUBEK] kanal zdalny nie doszedl (kod $rc2) - krok checkout nie ruszyl"
            exit "$rc2"
        fi
        # Kanal skonczyl ZEREM, ale bez ani jednego POMIAR-: nie wiem, czy
        # checkout zaszedl, czy polaczenie padlo tuz przed pierwszym echo.
        # Zerowy kod kanalu NIE MOZE byc tu cicho odczytany jako sukces.
        echo "[CZUBEK] stan NIEZNANY: krok checkout zakonczyl sie bez zadnego pomiaru - nie wiem, czy checkout realnie zaszedl"
        exit 44
    fi
    if [ -z "$(pomiar KONIEC-CZUBEK "$wyjscie")" ]; then
        echo "[CZUBEK] stan NIEZNANY: krok checkout urwal sie - brak linii konca, choc checkout MOGL realnie zajsc"
        exit 44
    fi
    if [ "$(pomiar CHECKOUT "$wyjscie")" != "ok" ]; then
        echo "[CZUBEK] stan NIEZNANY: checkout na hoscie zameldowal niepowodzenie (mogl czesciowo zajsc)"
        exit 44
    fi
    echo "[CZUBEK] checkout zameldowal sukces - mierze stan po zmianie"

    zmierz_stan_katalogow
    rc=$?
    wypisz_surowy_pomiar "$POMIAR_WYJSCIE"
    if [ "$rc" -ne 0 ]; then
        echo "[CZUBEK] stan NIEZNANY: checkout byl potwierdzony, ale pomiar po zmianie nie doszedl (kod $rc)"
        exit 44
    fi
    if [ -z "$(pomiar KONIEC "$POMIAR_WYJSCIE")" ]; then
        echo "[CZUBEK] stan NIEZNANY: checkout byl potwierdzony, ale pomiar po zmianie urwal sie w polowie"
        exit 44
    fi
    wczytaj_pomiar "$POMIAR_WYJSCIE"
    head_po="$(pomiar HEAD "$POMIAR_WYJSCIE")"
    echo "[CZUBEK] stan po: HEAD=$head_po"
    if [ "$head_po" = "$SHA" ]; then
        echo "[CZUBEK] ZALICZONY: czubek na hoscie ustawiony na zadany $SHA - stan docelowy osiagniety"
        exit 41
    fi
    echo "[CZUBEK] stan NIEZNANY: checkout zameldowal sukces, ale pomiar po zmianie pokazuje inny czubek na hoscie ($head_po)"
    exit 44
}

# --- krok 2: wdrozenie i kroki kontrolne -----------------------------------
wdrozenie() {
    local argi wyjscie rc powod
    argi="$(printf '%q %q %q %q' "$SHA" "$REPO_HOSTA" "$LOG_HOSTA" "$PLIK_SRODOWISKA")"
    WDROZENIE_RUSZYLO=1
    echo "[WDROZENIE] uruchamiam skrypt wdrozeniowy hosta; jego log zostaje na hoscie"

    wyjscie="$(ssh -o BatchMode=yes -o ServerAliveInterval=20 \
        "$UZYTKOWNIK@$HOST" "bash -s -- wdrozenie $argi" 2>&1 <<"ZDALNE"
set -uo pipefail
SHA="$2"; REPO_HOSTA="$3"; LOG_HOSTA="$4"; PLIK_SRODOWISKA="$5"

# Kazda odmowa ma WLASNY kod i wlasny wiersz z powodem. Wspolny kod kaze
# wolajacemu zgadywac, a akurat kod 2 znaczy na stacji "zle uzycie" - czego
# host o sobie nigdy nie twierdzi.
cd "$REPO_HOSTA" 2>/dev/null || { echo "[ZDALNIE] POWOD=brak-repozytorium"; echo "[ZDALNIE] brak repozytorium $REPO_HOSTA"; exit 6; }
mkdir -p "$(dirname "$LOG_HOSTA")" || { echo "[ZDALNIE] POWOD=brak-katalogu-logu"; echo "[ZDALNIE] nie zalozylem katalogu logu $(dirname "$LOG_HOSTA")"; exit 7; }

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
    # Odmowa HOSTA i zerwany KANAL to dwie rozne wiadomosci, wiec maja rozne
    # kody. Skoro w wyjsciu stoi nasz wiersz POWOD=, czesc zdalna ruszyla i to
    # ona odmowila - wiersz o niedoszlym kanale bylby wtedy nieprawda.
    powod="$(printf '%s\n' "$wyjscie" | grep -m1 '^.ZDALNIE. POWOD=' | sed 's/.*POWOD=//')"
    case "$powod" in
        brak-repozytorium)
            echo "[WDROZENIE] NIEZALICZONY: na hoscie nie ma repozytorium $REPO_HOSTA - kanal doszedl, odmowil host"
            exit 26
            ;;
        brak-katalogu-logu)
            echo "[WDROZENIE] NIEZALICZONY: na hoscie nie dalo sie zalozyc katalogu logu $(dirname "$LOG_HOSTA") - kanal doszedl, odmowil host"
            exit 27
            ;;
    esac
    if [ "$rc" -ne 0 ]; then
        echo "[WDROZENIE] kanal zdalny nie doszedl (kod $rc) - skrypt hosta nie ruszyl"
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
    if [ "$TRYB" = "czubek" ]; then
        ustaw_czubek
        # Nieosiagalne: ustaw_czubek zawsze konczy WLASNYM kodem (40-44,
        # 14/15, albo surowym kodem kanalu) - to nizej jest tylko siatka
        # bezpieczenstwa, gdyby kiedys przybyla sciezka, ktora zapomni exit.
        echo "[CZUBEK] tryb --ustaw-czubek: warunkow wstepnych ani wdrozenia NIE uruchamiam"
        exit 1
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
