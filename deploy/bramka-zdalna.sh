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

# Swiadek 2: slot bierze NARZEDZIE. `noclobber` gwarantuje, ze dwoch nie wezmie
# tego samego pliku. Oba zajete = bieg sie NIE ODBYWA (kod 3), a nie "poczekam".
SLOT1="$KATALOG_BRAMEK/HOST-SUITA-1.lock"
SLOT2="$KATALOG_BRAMEK/HOST-SUITA-2.lock"
ZETON="$REPO;$SHA;$(date "+%Y-%m-%d %H:%M:%S");pid=$$"
MOJ_SLOT=""
for S in "$SLOT1" "$SLOT2"; do
    if ( set -o noclobber; echo "$ZETON" > "$S" ) 2>/dev/null; then MOJ_SLOT="$S"; break; fi
done
if [ -z "$MOJ_SLOT" ]; then
    echo "[ZDALNIE] ODMOWA - oba sloty zajete, nic nie uruchamiam:"
    for S in "$SLOT1" "$SLOT2"; do echo "[ZDALNIE]   za: $(cat "$S" 2>/dev/null)"; done
    exit 3
fi
echo "[ZDALNIE] slot: $MOJ_SLOT"

bash -lc "$POLECENIE" > "$LOG" 2>&1
KOD=$?

# Swiadek 3: zdejmuje WYLACZNIE swoj zeton. Cudzej tresci nie kasuje - melduje.
TERAZ="$(cat "$MOJ_SLOT" 2>/dev/null)"
if [ "$TERAZ" = "$ZETON" ]; then
    rm -f "$MOJ_SLOT"
else
    echo "[ZDALNIE] UWAGA: w slocie nie ma mojego zetonu - NIE zdejmuje."
    echo "[ZDALNIE]   zapisalem: $ZETON"
    echo "[ZDALNIE]   zastalem : $TERAZ"
fi

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
