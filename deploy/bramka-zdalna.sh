#!/usr/bin/env bash
# Bramka na hoscie zdalnym: uruchamia polecenie na WSKAZANYM commicie w lustrze
# repozytorium stojacym na hoscie, a log i kod wyjscia sprowadza z powrotem.
#
#   bramka-zdalna.sh <repo> <sha> <polecenie...>
#
# Uruchamiany na maszynie operatora (nie na hoscie). Host nie laczy sie do nas
# w druga strone - log sciagamy my, przez `scp`. Dzieki temu host nie potrzebuje
# zadnego klucza do naszej maszyny.
#
# Kody wyjscia:
#   0/1 - wynik polecenia bramki (tak jak lokalnie)
#   2   - przygotowanie sie nie udalo (brak lustra, SHA nie doszedl, HEAD != SHA)
#   3   - oba sloty hosta zajete: NIC nie uruchomiono (to odmowa, nie czerwien)
#
# Trzy rzeczy, ktore ten skrypt UDOWADNIA, zamiast zakladac:
#   1. lustro stoi dokladnie na tym SHA, ktory podano (asercja HEAD, nie komunikat `checkout`),
#   2. bieg wzial slot - a jesli nie byl w stanie, to sie NIE ODBYL,
#   3. slot zdejmuje tylko wlasny zeton; cudzego nie rusza nigdy.
set -uo pipefail

if [ "$#" -lt 3 ]; then
    echo "uzycie: bramka-zdalna.sh <repo> <sha> <polecenie...>" >&2
    exit 2
fi

REPO="$1"; SHA="$2"; shift 2
POLECENIE="$*"

HOST="${HOST_BRAMKOWY:-}"
UZYTKOWNIK="${UZYTKOWNIK_BRAMKI:-bramka}"
KATALOG_BRAMEK="${KATALOG_BRAMEK:-/srv/bramki}"
KATALOG_LOGOW="${KATALOG_LOGOW:-/tmp/bramki}"
ZRODLO="${ZRODLO_REPO:-}"

if [ -z "$HOST" ]; then
    echo "Brak adresu hosta: ustaw HOST_BRAMKOWY." >&2
    exit 2
fi
if [ -z "$ZRODLO" ]; then
    echo "Brak adresu repozytorium: ustaw ZRODLO_REPO (adres publiczny, tylko odczyt)." >&2
    exit 2
fi

mkdir -p "$KATALOG_LOGOW"
LOG_LOKALNY="$KATALOG_LOGOW/$REPO-$SHA.log"
ETYKIETA="$REPO/$SHA"
START="$(date +%s)"

echo "[BRAMKA] host $HOST, repo $REPO, commit $SHA"

# Czesc zdalna idzie przez stdin: dzieki temu na hoscie nie musi lezec zadna
# kopia tego skryptu, ktora moglaby sie rozjechac z tym plikiem.
# Argumenty ida pozycyjnie i przez `printf %q`, a nie przez srodowisko: `ssh`
# domyslnie NIE przenosi zmiennych, wiec polecenie bramki dotarloby puste,
# a bieg zzielenialby na niczym.
ARGI="$(printf "%q %q %q %q %q" "$REPO" "$SHA" "$KATALOG_BRAMEK" "$ZRODLO" "$POLECENIE")"

ssh -o BatchMode=yes -o ServerAliveInterval=20 "$UZYTKOWNIK@$HOST" \
    "bash -s -- $ARGI" <<"ZDALNE"
set -uo pipefail
REPO="$1"; SHA="$2"; KATALOG_BRAMEK="$3"; ZRODLO_REPO="$4"; POLECENIE="$5"
LUSTRO="$KATALOG_BRAMEK/$REPO/lustro"
LOG="$KATALOG_BRAMEK/$REPO/$SHA.log"

if [ ! -d "$LUSTRO/.git" ]; then
    echo "[ZDALNIE] lustra nie ma - klonuje z $ZRODLO_REPO"
    git clone --quiet "$ZRODLO_REPO" "$LUSTRO" || { echo "[ZDALNIE] klon nieudany"; exit 2; }
fi

cd "$LUSTRO" || exit 2
git fetch --quiet --prune origin || { echo "[ZDALNIE] fetch nieudany"; exit 2; }
git checkout --quiet --detach "$SHA" 2>/dev/null || { echo "[ZDALNIE] nie ma commitu $SHA"; exit 2; }

# Swiadek 1: lustro == zrodlo. Nie ufamy komunikatowi `checkout`, tylko pytamy
# o HEAD po fakcie - to dwie rozne rzeczy, gdy w drzewie zostal ktos inny.
HEAD_TERAZ="$(git rev-parse HEAD)"
OCZEKIWANY="$(git rev-parse --verify "$SHA^{commit}" 2>/dev/null)"
if [ -z "$OCZEKIWANY" ] || [ "$HEAD_TERAZ" != "$OCZEKIWANY" ]; then
    echo "[ZDALNIE] HEAD=$HEAD_TERAZ, oczekiwano $SHA ($OCZEKIWANY)"
    exit 2
fi
BRUD="$(git status --porcelain | grep -c .)"
echo "[ZDALNIE] HEAD=$HEAD_TERAZ, drzewo: $BRUD pozycji"

# Log poprzedniego biegu na tym samym commicie kasujemy TERAZ, przed proba
# wziecia slotu. Inaczej bieg, ktory sie nie odbyl (odmowa slotu), sprowadzilby
# na dol cudzy - albo wlasny wczorajszy - log i wygladalby na pomiar.
rm -f "$LOG"
# Logi pomocnicze biegu: wlasny katalog na commit, obok logu glownego, a nie
# wspolny /tmp, w ktorym plik innego konta zatrzymal pierwszy bieg (10.09 20:20).
KATALOG_BIEGU="$KATALOG_BRAMEK/log/$REPO-$SHA"
rm -rf "$KATALOG_BIEGU"
mkdir -p "$KATALOG_BIEGU" || { echo "[ZDALNIE] nie zalozylem $KATALOG_BIEGU"; exit 2; }
export KATALOG_BIEGU

# Swiadek 2: slot bierze NARZEDZIE - kanoniczny host-slot.sh, jedyny sposob
# brania slotu na tym hoscie; wlasnej implementacji tu nie ma. Brak narzedzia =
# bieg sie NIE odbywa (fail-closed). Zajete = kod 3, a nie "poczekam".
NARZEDZIE_SLOTU="$KATALOG_BRAMEK/host-slot.sh"
export HOST_SLOT_DIR="${HOST_SLOT_DIR:-$KATALOG_BRAMEK/slot}"
if [ ! -f "$NARZEDZIE_SLOTU" ]; then
    echo "[ZDALNIE] brak $NARZEDZIE_SLOTU - nic nie uruchamiam"
    exit 2
fi
LINIA_SLOTU="$(bash "$NARZEDZIE_SLOTU" take "$REPO" "bramka-$SHA" "$$")"
KOD_SLOTU=$?
if [ "$KOD_SLOTU" -eq 3 ]; then
    echo "[ZDALNIE] ODMOWA - sloty zajete, nic nie uruchamiam"
    exit 3
fi
if [ "$KOD_SLOTU" -ne 0 ] || [ -z "$LINIA_SLOTU" ]; then
    echo "[ZDALNIE] slot nie wziety (EXIT=$KOD_SLOTU) - nic nie uruchamiam"
    exit 2
fi
ZETON="${LINIA_SLOTU#* }"
# Swiadek 3: oddaje narzedzie, po zetonie - takze po bledzie i przerwaniu.
# Cudzej tresci narzedzie nie zdejmuje (kod 4); tu tylko to meldujemy.
zwolnij() {
    bash "$NARZEDZIE_SLOTU" release "$ZETON" >/dev/null \
        || echo "[ZDALNIE] UWAGA: release odmowil - slotu NIE zdejmuje recznie"
}
trap zwolnij EXIT INT TERM HUP
echo "[ZDALNIE] slot: ${LINIA_SLOTU%% *}, logi pomocnicze: $KATALOG_BIEGU"

# stdin odciety: ta czesc skryptu sama przyszla przez stdin (`bash -s`), wiec
# proces bramki, ktory siegnie po stdin, zjadlby reszte tego skryptu.
bash -lc "$POLECENIE" < /dev/null > "$LOG" 2>&1
KOD=$?

echo "[ZDALNIE] EXIT=$KOD"
exit "$KOD"
ZDALNE
KOD_ZDALNY=$?
KONIEC="$(date +%s)"

# Log sciagamy ZAWSZE - takze po czerwieni i po odmowie slotu, bo wtedy jest
# najbardziej potrzebny.
scp -q -o BatchMode=yes "$UZYTKOWNIK@$HOST:$KATALOG_BRAMEK/$REPO/$SHA.log" "$LOG_LOKALNY" 2>/dev/null \
    && echo "[BRAMKA] log: $LOG_LOKALNY" \
    || echo "[BRAMKA] logu nie bylo czego sciagnac (bieg sie nie odbyl albo padl przed zapisem)"

echo "[BRAMKA] $ETYKIETA: EXIT=$KOD_ZDALNY, czas $((KONIEC - START)) s"
exit "$KOD_ZDALNY"
