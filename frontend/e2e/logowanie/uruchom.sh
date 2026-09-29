#!/usr/bin/env bash
# Punkt wejscia proby logowania e2e przez prawdziwy tor tokenu.
#
# JEDNO polecenie: z czystego klonu (po `npm ci` w `frontend/` i
# `composer install` w `backend/`) stawia IdP efemeryczny + baze + zaplecze
# Laravel + front Next.js, WSZYSTKO na portach >= 56000, uruchamia
# `e2e/logowanie/logowanie-role.spec.ts` (piec nog przez `zaloguj(page, rola)`
# + swiadek kryterium 2), zdejmuje WYLACZNIE wlasne kontenery/procesy (po
# zapisanym identyfikatorze) i konczy kodem wyjscia Playwrighta.
#
# Porty (>=56000) i procesy: PRZED startem kazdy port jest sprawdzany
# odczytem (`netstat -ano`, funkcja `port_pid`) - zajety = ODMOWA (kod 2),
# zanim cokolwiek zostanie postawione. PO starcie front/zaplecze zapisujemy
# PID WINDOWS kazdego procesu (`/proc/<pid>/winpid`, obok PID MSYS) - to
# WYLACZNIE ten PID Windows sprzatanie zabija (`taskkill //T`). Dla frontu
# ten PID launchera jest PODMIENIANY (po starcie, po potwierdzeniu gotowosci)
# na PID z WLASNEGO lockfile Next.js 16 (`frontend/.next/dev/lock`, format
# `{"pid":...,"port":...}`) - Next.js 16 uruchamia dlugozyjacy serwer per
# katalog, odlaczony od CLI, ktory sam ten launcher tylko wystartowal; PID z
# lockfile to jedyny prawdziwy identyfikator tego serwera, potwierdzany polem
# `port` przed uzyciem (nigdy nie zgadywany przez netstat/tasklist). Zadnej
# funkcji "zabij, cokolwiek dzis nasluchuje na porcie" tu NIE MA; gdy zaden
# wiarygodny PID Windows nie da sie ustalic, sprzatanie nic nie zabija, tylko
# to melduje. Po sprzatnieciu porty sa sprawdzane ponownie - nadal zajete =
# kod 2 biegu (sprzatanie niepelne), bez zadnego zabijania w tym miejscu.
#
# Zero plikow srodowiskowych (`.env*`) - kazda zmienna idzie przez `export`
# w TYM procesie, nigdy przez plik na dysku (zakaz staly tej roboczej nocy).
#
# STRAZNIK K4 (strukturalny, nie kosmetyczny): odmawia PRZED postawieniem
# czegokolwiek, jesli srodowisko TEGO biegu niesie `APP_ENV=testing` albo
# `TESTING_FALLBACK_ROLES` - obie sa furtkami `TokenRoles::TESTING_FALLBACK_ROLES`
# (backend/app/Services/Auth/TokenRoles.php), inertne poza
# `app()->environment('testing')`. Zaplecze tego biegu startuje z jawnym
# `APP_ENV=local` (nizej) - nigdy `testing`, nigdy wartoscia domyslna.
set -uo pipefail

if [ "${APP_ENV-}" = "testing" ] || [ -n "${TESTING_FALLBACK_ROLES-}" ]; then
    echo "[logowanie e2e] ODMOWA (kod 2) - APP_ENV=testing albo TESTING_FALLBACK_ROLES jest w srodowisku tego biegu." >&2
    echo "[logowanie e2e]   Furtka TokenRoles::TESTING_FALLBACK_ROLES dziala WYLACZNIE gdy zaplecze widzi APP_ENV=testing." >&2
    echo "[logowanie e2e]   Ten skrypt startuje zaplecze z jawnym APP_ENV=local i odmawia, zanim cokolwiek postawil." >&2
    echo "[logowanie e2e]   Usun ta zmienna z tego srodowiska i uruchom ponownie." >&2
    exit 2
fi

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"          # frontend/e2e/logowanie
FRONTEND_DIR="$(cd "$TU/../.." && pwd)"                     # frontend
REPO_ROOT="$(cd "$FRONTEND_DIR/.." && pwd)"                  # klon
BACKEND_DIR="$REPO_ROOT/backend"

BIEG="${PSYCHON_BIEG_E2E:-$$-$(date +%s)}"
# UWAGA: `$TU/.stan/$BIEG` (bez przyrostka) jest WLASNYM katalogiem stanu
# `uruchom-idp.sh` (ten sam BIEG) - jego `stop` konczy sie `rm -rf` na TYM
# DOKLADNIE katalogu (zmierzone bezposrednio: pierwsze pelne uruchomienie
# stracilo caly raport, bo `sprzatanie()` wywoluje `uruchom-idp.sh stop`
# PRZED koncem funkcji). Wlasny katalog dowodow tego skryptu musi byc INNA
# sciezka, zeby przezyc sprzatanie IdP.
STAN_DIR="$TU/.stan/$BIEG.raport"
mkdir -p "$STAN_DIR"
chmod 700 "$STAN_DIR"

RAPORT="$STAN_DIR/raport.log"
: > "$RAPORT"
# Bez potoku (rule 74): dwa oddzielne zapisy, nie `| tee`, zeby kod wyjscia
# tej linii nigdy nie byl kodem `tee`, tylko samego zapisu.
log() {
    printf '[uruchom] %s\n' "$*" >> "$RAPORT"
    printf '[uruchom] %s\n' "$*" >&2
}

log "bieg=$BIEG stan=$STAN_DIR"

# ---------------------------------------------------------------------------
# Sprzatanie: WYLACZNIE wlasne procesy/kontenery tego biegu, po zapisanym
# identyfikatorze - nigdy po samej nazwie/porcie. Dla zaplecze zapisany
# identyfikator to PID WINDOWS (nie PID MSYS): pod Git-Bash/MSYS to Windows
# trzyma port i drzewo procesow, a PID MSYS podpowloki bywa INNA liczba niz
# realny PID Windows tego samego procesu - `taskkill //T` na PID MSYS
# potrafi trafic w nic albo w cudzy proces o tym samym numerze. PID Windows
# czytamy z `/proc/<pid>/winpid` (funkcja `winpid_z_msys` nizej) zaraz po
# starcie procesu. Dla front ten sam PID launchera jest pozniej PODMIENIANY
# (patrz sekcja 9 nizej) na PID z WLASNEGO lockfile Next.js 16 - jedynego
# wiarygodnego zrodla identyfikatora dlugozyjacego serwera tej wersji
# Next.js. Funkcji "zabij, cokolwiek dzis nasluchuje na tym porcie" ten
# skrypt NIE MA - gdy zaden wiarygodny PID Windows nie da sie ustalic,
# sprzatanie NIE zabija niczego na tym porcie, tylko to melduje (zadnej
# sciezki wyboru procesu po porcie ani po nazwie).
# ---------------------------------------------------------------------------
FRONTEND_PID=""
FRONTEND_WINPID=""
BACKEND_PID=""
BACKEND_WINPID=""
DB_KONTENER_ID=""
IDP_URUCHOMIONE=0
SPRZATANIE_NIEPELNE=0

# PID Windows faktyczny dla PID MSYS (Git Bash/MSYS: /proc/<pid>/winpid).
# Puste, gdy sciezka nie istnieje - nie zgadujemy zadnej wartosci zastepczej.
winpid_z_msys() {
    local mpid="$1"
    if [ -r "/proc/$mpid/winpid" ]; then
        cat "/proc/$mpid/winpid" 2>/dev/null
    fi
}

# Odczyt WYLACZNIE (netstat -ano): PID Windows nasluchujacy (LISTENING) na
# danym porcie, puste gdy port wolny. Uzywane do kontroli PRZED startem i PO
# sprzatnieciu - nigdy do wyboru celu zabicia.
port_pid() {
    netstat -ano 2>/dev/null | grep "LISTENING" | grep ":$1 " | awk '{print $NF}' | sort -u | head -1
}

sprzatanie() {
    log "sprzatanie biegu $BIEG..."
    if [ -n "$FRONTEND_WINPID" ]; then
        taskkill //F //T //PID "$FRONTEND_WINPID" >>"$RAPORT" 2>&1 || true
        log "front: taskkill //T na PID Windows $FRONTEND_WINPID (PID MSYS byl $FRONTEND_PID) wykonany."
        if tasklist //FI "PID eq $FRONTEND_WINPID" 2>/dev/null | grep -q "$FRONTEND_WINPID"; then
            log "KONTROLA DODATNIA front: PID Windows $FRONTEND_WINPID WCIAZ w liscie procesow po sprzatnieciu."
        else
            log "kontrola dodatnia front: PID Windows $FRONTEND_WINPID nie istnieje w liscie procesow (drzewo zdjete)."
        fi
    elif [ -n "$FRONTEND_PID" ]; then
        log "front: brak zapisanego PID Windows - NIE zabijam niczego (bez zgadywania po porcie/nazwie)."
    fi
    if [ -n "$BACKEND_WINPID" ]; then
        taskkill //F //T //PID "$BACKEND_WINPID" >>"$RAPORT" 2>&1 || true
        log "zaplecze: taskkill //T na PID Windows $BACKEND_WINPID (PID MSYS byl $BACKEND_PID) wykonany."
        if tasklist //FI "PID eq $BACKEND_WINPID" 2>/dev/null | grep -q "$BACKEND_WINPID"; then
            log "KONTROLA DODATNIA zaplecze: PID Windows $BACKEND_WINPID WCIAZ w liscie procesow po sprzatnieciu."
        else
            log "kontrola dodatnia zaplecze: PID Windows $BACKEND_WINPID nie istnieje w liscie procesow (drzewo zdjete)."
        fi
    elif [ -n "$BACKEND_PID" ]; then
        log "zaplecze: brak zapisanego PID Windows - NIE zabijam niczego (bez zgadywania po porcie/nazwie)."
    fi
    if [ -n "$DB_KONTENER_ID" ]; then
        ID_ZASTANY="$(MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu-24.04 -- docker inspect --format '{{.Id}}' "psy-e2e-db-$BIEG" 2>/dev/null || true)"
        if [ "$ID_ZASTANY" = "$DB_KONTENER_ID" ]; then
            MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu-24.04 -- docker rm -f "$DB_KONTENER_ID" >>"$RAPORT" 2>&1 || true
            log "kontener bazy $DB_KONTENER_ID zdjety."
        elif [ -n "$ID_ZASTANY" ]; then
            log "ODMOWA sprzatania bazy - ID zastany ($ID_ZASTANY) nie zgadza sie z zapisanym ($DB_KONTENER_ID)."
        fi
    fi
    if [ "$IDP_URUCHOMIONE" = "1" ]; then
        PSYCHON_BIEG_E2E="$BIEG" bash "$TU/uruchom-idp.sh" stop >>"$RAPORT" 2>&1 || true
        log "IdP efemeryczny (bieg $BIEG) zdjety."
    fi

    # Kontrola PO sprzatnieciu (druga polowa): port biegu nadal zajety -> ten
    # sam wiersz PORT ZAJETY i kod 2 CALEGO biegu (sprzatanie niepelne), BEZ
    # zadnego zabijania w tym miejscu.
    local pid
    if [ -n "${FRONT_PORT-}" ]; then
        pid="$(port_pid "$FRONT_PORT")"
        if [ -n "$pid" ]; then
            log "PORT ZAJETY: $FRONT_PORT PID $pid — nie nasz, nie ruszam (front, sprzatanie niepelne)."
            SPRZATANIE_NIEPELNE=1
        else
            log "port $FRONT_PORT (front) wolny po sprzatnieciu (netstat: brak LISTENING)."
        fi
    fi
    if [ -n "${BACKEND_PORT-}" ]; then
        pid="$(port_pid "$BACKEND_PORT")"
        if [ -n "$pid" ]; then
            log "PORT ZAJETY: $BACKEND_PORT PID $pid — nie nasz, nie ruszam (zaplecze, sprzatanie niepelne)."
            SPRZATANIE_NIEPELNE=1
        else
            log "port $BACKEND_PORT (zaplecze) wolny po sprzatnieciu (netstat: brak LISTENING)."
        fi
    fi
    if [ "$SPRZATANIE_NIEPELNE" = "1" ]; then
        log "sprzatanie NIEPELNE - koncze kodem 2 (bez zabijania cudzego procesu)."
        exit 2
    fi
}
trap sprzatanie EXIT

# ---------------------------------------------------------------------------
# Porty >= 56000 (zakres 55430-55939 nalezy do bramki/roli lustra - decyzja
# liderska 21:53/22:3x). Sprawdzane na WOLNOSC na hoscie Windows PRZED
# uzyciem, zeby zmniejszyc szanse kolizji miedzy czterema niezaleznie
# losowanymi portami (baza, zaplecze, front, IdP - ten ostatni losuje sam
# `uruchom-idp.sh`).
# ---------------------------------------------------------------------------
# Wybor portu: domyslnie losowy z zakresu >=56000, sprawdzany ODCZYTEM
# (`port_pid` - netstat -ano), nigdy samym polaczeniem TCP. Parametr $1
# nadpisuje losowanie (uzyte przez `PSYCHON_PORT_FRONT/BACKEND/DB` nizej) -
# jedyny cel: swiadek obcego procesu (miara b) musi wskazac DOKLADNIE ten
# port, ktorego uzyje ten bieg, wiec bieg musi umiec przyjac port z zewnatrz
# zamiast losowac go sam.
wolny_port() {
    local wymuszony="${1:-}" proba pid
    if [ -n "$wymuszony" ]; then
        echo "$wymuszony"; return 0
    fi
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        proba=$(( (RANDOM % 3000) + 56000 ))
        pid="$(port_pid "$proba")"
        if [ -z "$pid" ]; then
            echo "$proba"; return 0
        fi
    done
    log "ODMOWA - brak wolnego portu po 10 probach."
    return 1
}

# Zanim COKOLWIEK postawimy: kazdy port tego biegu jest sprawdzony odczytem;
# zajety -> PORT ZAJETY + kod 2 biegu, bez ruszania cudzego procesu.
zapewnij_port_wolny() {
    local port="$1" etykieta="$2" pid
    pid="$(port_pid "$port")"
    if [ -n "$pid" ]; then
        log "PORT ZAJETY: $port PID $pid — nie nasz, nie ruszam ($etykieta)."
        exit 2
    fi
}

DB_PORT="$(wolny_port "${PSYCHON_PORT_DB-}")" || exit 2
zapewnij_port_wolny "$DB_PORT" "baza"
BACKEND_PORT="$(wolny_port "${PSYCHON_PORT_BACKEND-}")" || exit 2
zapewnij_port_wolny "$BACKEND_PORT" "zaplecze"
FRONT_PORT="$(wolny_port "${PSYCHON_PORT_FRONT-}")" || exit 2
zapewnij_port_wolny "$FRONT_PORT" "front"
log "porty: baza=$DB_PORT zaplecze=$BACKEND_PORT front=$FRONT_PORT (IdP - patrz nizej, wlasny wybor uruchom-idp.sh)"

WEB_ORIGIN="http://localhost:$FRONT_PORT"

# ---------------------------------------------------------------------------
# 1) IdP efemeryczny (uruchom-idp.sh - wzorzec juz zmierzony wczesniej:
#    --rm, bez wolumenow, port >= 56000, zdejmowany po ID).
# ---------------------------------------------------------------------------
log "startuje IdP efemeryczny (web origin=$WEB_ORIGIN)..."
IDP_WYJSCIE="$(PSYCHON_BIEG_E2E="$BIEG" PSYCHON_E2E_WEB_ORIGIN="$WEB_ORIGIN" bash "$TU/uruchom-idp.sh" start 2>>"$RAPORT")"
echo "$IDP_WYJSCIE" >> "$RAPORT"
IDP_URUCHOMIONE=1
IDP_PORT="$(printf '%s\n' "$IDP_WYJSCIE" | sed -n 's/^PORT=//p')"
IDP_CA="$(printf '%s\n' "$IDP_WYJSCIE" | sed -n 's/^CA=//p')"
if [ -z "$IDP_PORT" ] || [ -z "$IDP_CA" ]; then
    log "ODMOWA - IdP nie zwrocil PORT=/CA= (patrz $RAPORT)."
    exit 2
fi
IDP_STATE_DIR="$TU/.stan/$BIEG"
KEYCLOAK_ISSUER_WARTOSC="https://localhost:$IDP_PORT/realms/niepodzielni"
log "IdP gotowy: $KEYCLOAK_ISSUER_WARTOSC (CA=$IDP_CA)"

# ---------------------------------------------------------------------------
# 2) Kryterium 3 (insecure_tls), swiadek DWUSTRONNY, wprost na klasie, ktora
#    ten config faktycznie czyta (`App\Services\Keycloak\KeycloakDiscovery`),
#    bez calego stosu - dyskretnie tania proba (bez DB), zeby nie zaleznie od
#    reszty biegu w razie jej niepowodzenia.
# ---------------------------------------------------------------------------
K3_LOG="$STAN_DIR/swiadek-k3-insecure-tls.log"
log "swiadek K3 (insecure_tls) - strona 1/2: BEZ zmiennej (oczekiwana odmowa TLS)..."
(
    cd "$BACKEND_DIR"
    APP_ENV=local APP_KEY="base64:$(openssl rand -base64 32)" \
    CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync \
    KEYCLOAK_ISSUER="$KEYCLOAK_ISSUER_WARTOSC" KEYCLOAK_DISCOVERY_BASE="$KEYCLOAK_ISSUER_WARTOSC" \
    php artisan tinker --execute='try { $d = (new App\Services\Keycloak\KeycloakDiscovery)->discovery(); echo "OK issuer=".$d["issuer"]."\n"; } catch (\Throwable $e) { echo "BLAD: ".get_class($e).": ".$e->getMessage()."\n"; }'
) > "$K3_LOG.bez-zmiennej" 2>&1
cat "$K3_LOG.bez-zmiennej" >> "$RAPORT"

log "swiadek K3 (insecure_tls) - strona 2/2: Z KEYCLOAK_INSECURE_TLS=true (oczekiwany sukces)..."
(
    cd "$BACKEND_DIR"
    APP_ENV=local APP_KEY="base64:$(openssl rand -base64 32)" \
    CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync \
    KEYCLOAK_ISSUER="$KEYCLOAK_ISSUER_WARTOSC" KEYCLOAK_DISCOVERY_BASE="$KEYCLOAK_ISSUER_WARTOSC" \
    KEYCLOAK_INSECURE_TLS=true \
    php artisan tinker --execute='try { $d = (new App\Services\Keycloak\KeycloakDiscovery)->discovery(); echo "OK issuer=".$d["issuer"]."\n"; } catch (\Throwable $e) { echo "BLAD: ".get_class($e).": ".$e->getMessage()."\n"; }'
) > "$K3_LOG.z-zmienna" 2>&1
cat "$K3_LOG.z-zmienna" >> "$RAPORT"
log "swiadek K3 zapisany: $K3_LOG.bez-zmiennej / $K3_LOG.z-zmienna"

# ---------------------------------------------------------------------------
# 3) Kryterium 5 (wygasniecie tokenu w trakcie sesji) - pomiar samego IdP,
#    niezalezny od reszty stosu (pomiar-idp-samodzielny.mjs, juz zmierzony
#    recznie wczesniej; tutaj ten sam krok, w biegu wlasciwym).
# ---------------------------------------------------------------------------
K5_LOG="$STAN_DIR/swiadek-k5-wygasniecie.log"
log "swiadek K5 (wygasniecie tokenu w trakcie sesji)..."
(
    cd "$FRONTEND_DIR"
    NODE_EXTRA_CA_CERTS="$IDP_CA" PSYCHON_E2E_WEB_ORIGIN="$WEB_ORIGIN" \
    node e2e/logowanie/pomiar-idp-samodzielny.mjs "e2e/logowanie/.stan/$BIEG"
) > "$K5_LOG" 2>&1
K5_KOD=$?
cat "$K5_LOG" >> "$RAPORT"
log "swiadek K5 zapisany: $K5_LOG (kod $K5_KOD)"

# ---------------------------------------------------------------------------
# 4) Suby uzytkownikow testowych IdP (do powiazania z lokalnymi kontami po
#    migracji) - pomiar-zaplecze.mjs suby, ten sam mechanizm zmierzony
#    recznie wczesniej.
# ---------------------------------------------------------------------------
log "pobieram suby uzytkownikow testowych z IdP..."
SUBY_WYJSCIE="$(
    cd "$FRONTEND_DIR"
    NODE_EXTRA_CA_CERTS="$IDP_CA" PSYCHON_IDP_STATE_DIR="e2e/logowanie/.stan/$BIEG" PSYCHON_E2E_WEB_ORIGIN="$WEB_ORIGIN" \
    node e2e/logowanie/pomiar-zaplecze.mjs suby 2>>"$RAPORT"
)"
echo "$SUBY_WYJSCIE" >> "$RAPORT"
SUB_ADMIN="$(printf '%s\n' "$SUBY_WYJSCIE" | awk '$1=="e2e-admin-fundacja"{print $2}')"
SUB_KOORDYNATOR="$(printf '%s\n' "$SUBY_WYJSCIE" | awk '$1=="e2e-koordynator"{print $2}')"
SUB_PROWADZACY="$(printf '%s\n' "$SUBY_WYJSCIE" | awk '$1=="e2e-prowadzacy"{print $2}')"
SUB_WOLONTARIUSZ="$(printf '%s\n' "$SUBY_WYJSCIE" | awk '$1=="e2e-wolontariusz"{print $2}')"
SUB_PACJENT="$(printf '%s\n' "$SUBY_WYJSCIE" | awk '$1=="e2e-pacjent"{print $2}')"
if [ -z "$SUB_ADMIN" ] || [ -z "$SUB_KOORDYNATOR" ] || [ -z "$SUB_PROWADZACY" ] || [ -z "$SUB_WOLONTARIUSZ" ] || [ -z "$SUB_PACJENT" ]; then
    log "ODMOWA - nie udalo sie odebrac wszystkich pieciu subow z IdP (patrz $RAPORT)."
    exit 2
fi
log "suby odebrane dla wszystkich pieciu rol."

# ---------------------------------------------------------------------------
# 5) Baza WLASNA, efemeryczna, w silniku Dockera WSL (obraz postgres:17
#    jest lokalnie w tym silniku; --rm, bez nazwanych wolumenow, port
#    >= 56000, zdejmowana WYLACZNIE po zapisanym ID).
#    --tmpfs /var/lib/postgresql/data: obraz postgres:17 deklaruje
#    VOLUME /var/lib/postgresql/data, wiec kazdy start bez tmpfs zostawia
#    anonimowy wolumen, ktorego `docker rm -f` bez `-v` nie usuwa.
# ---------------------------------------------------------------------------
DB_HASLO="e2e-$(openssl rand -hex 12)"
DB_NAZWA="psy-e2e-db-$BIEG"
log "startuje baze efemeryczna $DB_NAZWA na porcie $DB_PORT (silnik WSL)..."
DB_KONTENER_ID_SUROWY="$(MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu-24.04 -- docker run --rm -d \
    --name "$DB_NAZWA" -p "127.0.0.1:${DB_PORT}:5432" \
    --tmpfs /var/lib/postgresql/data:size=512m \
    -e POSTGRES_DB=psychon_e2e -e POSTGRES_USER=psychon_e2e -e POSTGRES_PASSWORD="$DB_HASLO" \
    postgres:17 2>>"$RAPORT")"
ID_SPRAWDZONY="$(MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu-24.04 -- docker inspect --format '{{.Id}}' "$DB_NAZWA" 2>/dev/null || true)"
if [ -z "$ID_SPRAWDZONY" ] || [ "$ID_SPRAWDZONY" != "$DB_KONTENER_ID_SUROWY" ]; then
    log "ODMOWA - identyfikator kontenera bazy nie potwierdza sie (docker inspect)."
    exit 2
fi
DB_KONTENER_ID="$ID_SPRAWDZONY"
log "kontener bazy: $DB_KONTENER_ID"
DB_MOUNTS_TMPFS="$(MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu-24.04 -- docker inspect --format '{{json .Mounts}} {{json .HostConfig.Tmpfs}}' "$DB_KONTENER_ID" 2>/dev/null || true)"
log "baza mounts+tmpfs: $DB_MOUNTS_TMPFS"

APP_KEY_BIEGU="base64:$(openssl rand -base64 32)"

export_baza=(DB_CONNECTION=pgsql DB_HOST=127.0.0.1 "DB_PORT=$DB_PORT" DB_DATABASE=psychon_e2e DB_USERNAME=psychon_e2e "DB_PASSWORD=$DB_HASLO")

log "sprawdzam polaczenie z baza (jedno sprawdzenie, bez obejsc przy braku)..."
POLACZONO=0
for _ in $(seq 1 20); do
    if (
        cd "$BACKEND_DIR"
        env APP_ENV=local APP_KEY="$APP_KEY_BIEGU" "${export_baza[@]}" \
            CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync \
            php artisan migrate:status
    ) >"$STAN_DIR/db-polaczenie.log" 2>&1; then
        POLACZONO=1; break
    fi
    if grep -qi "Migration table not found" "$STAN_DIR/db-polaczenie.log" 2>/dev/null; then
        # Baza odpowiada (tabela migracji po prostu jeszcze nie istnieje na
        # swiezej bazie) - to JEST udane polaczenie, nie awaria.
        POLACZONO=1; break
    fi
    sleep 1
done
cat "$STAN_DIR/db-polaczenie.log" >> "$RAPORT"
if [ "$POLACZONO" != "1" ]; then
    log "ODMOWA (kod 2) - brak polaczenia z baza po 20 probach. Doslowny blad w $STAN_DIR/db-polaczenie.log:"
    tail -5 "$STAN_DIR/db-polaczenie.log" >&2
    exit 2
fi
log "polaczenie z baza potwierdzone."

# ---------------------------------------------------------------------------
# 6) Migracje + seed demo (docs/hackathon/04-seed-demo.md) - konta o
#    ZNANYCH, stalych id (marta=1, ola=2, filip=3, joanna=4, opiekun=5,
#    admin=6 - `DemoSeeder`, zmierzone bezposrednio na swiezej bazie).
# ---------------------------------------------------------------------------
log "migruje i sieje baze demo..."
(
    cd "$BACKEND_DIR"
    env APP_ENV=local APP_KEY="$APP_KEY_BIEGU" "${export_baza[@]}" \
        CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync \
        php artisan migrate --seed --force
) > "$STAN_DIR/migrate-seed.log" 2>&1
MIGRACJA_KOD=$?
tail -20 "$STAN_DIR/migrate-seed.log" >> "$RAPORT"
if [ "$MIGRACJA_KOD" != "0" ]; then
    log "ODMOWA (kod 2) - migracja/seed zakonczyly sie kodem $MIGRACJA_KOD (patrz $STAN_DIR/migrate-seed.log)."
    exit 2
fi

# ---------------------------------------------------------------------------
# 7) Wiazanie subow IdP z kontami demo (`psychon:sso-powiaz`). Swiadek
#    kryterium 2: `marta@demo.pl` (DB rola=volunteer) dostaje sub uzytkownika
#    `e2e-koordynator` (token niesie role realmu `koordynator` ->
#    `project_manager`) - ZAMIERZONA niezgodnosc, to ona jest swiadkiem.
#    Pozostale cztery konta maja role DB zgodne z rola tokenu.
# ---------------------------------------------------------------------------
log "wiaze konta demo z subami IdP (marta<-koordynator: ZAMIERZONA niezgodnosc, swiadek K2)..."
(
    set -e
    cd "$BACKEND_DIR"
    env APP_ENV=local APP_KEY="$APP_KEY_BIEGU" "${export_baza[@]}" \
        CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync \
        php artisan psychon:sso-powiaz 6 "$SUB_ADMIN"
    env APP_ENV=local APP_KEY="$APP_KEY_BIEGU" "${export_baza[@]}" \
        CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync \
        php artisan psychon:sso-powiaz 1 "$SUB_KOORDYNATOR"
    env APP_ENV=local APP_KEY="$APP_KEY_BIEGU" "${export_baza[@]}" \
        CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync \
        php artisan psychon:sso-powiaz 4 "$SUB_PROWADZACY"
    env APP_ENV=local APP_KEY="$APP_KEY_BIEGU" "${export_baza[@]}" \
        CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync \
        php artisan psychon:sso-powiaz 2 "$SUB_WOLONTARIUSZ"
    env APP_ENV=local APP_KEY="$APP_KEY_BIEGU" "${export_baza[@]}" \
        CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync \
        php artisan psychon:sso-powiaz 3 "$SUB_PACJENT"
) > "$STAN_DIR/bind.log" 2>&1
BIND_KOD=$?
cat "$STAN_DIR/bind.log" >> "$RAPORT"
if [ "$BIND_KOD" != "0" ]; then
    log "ODMOWA (kod 2) - wiazanie kont demo z subami IdP nie powiodlo sie (patrz $STAN_DIR/bind.log)."
    exit 2
fi

# ---------------------------------------------------------------------------
# 8) Zaplecze Laravel - WLASNY klon, bez pliku srodowiskowego, zmienne w
#    wierszu polecenia. `APP_ENV=local` JAWNIE (nigdy domyslne, nigdy
#    `testing`) - to jest strona "postaw zaplecze z jawnym APP_ENV != testing"
#    kryterium 4. `KEYCLOAK_INSECURE_TLS=true` tutaj (a nie w swiadku K3
#    wyzej) - bez niej ten bieg w ogole nie dziala wobec wlasnego CA IdP
#    (zmierzone: cURL error 60 na kazdym wywolaniu zaplecza).
# ---------------------------------------------------------------------------
log "startuje zaplecze na porcie $BACKEND_PORT..."
(
    cd "$BACKEND_DIR"
    env APP_ENV=local APP_KEY="$APP_KEY_BIEGU" "${export_baza[@]}" \
        CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync \
        KEYCLOAK_ISSUER="$KEYCLOAK_ISSUER_WARTOSC" KEYCLOAK_DISCOVERY_BASE="$KEYCLOAK_ISSUER_WARTOSC" \
        KEYCLOAK_INSECURE_TLS=true \
        php artisan serve --host=127.0.0.1 --port="$BACKEND_PORT"
) > "$STAN_DIR/zaplecze.log" 2>&1 < /dev/null &
BACKEND_PID=$!
BACKEND_WINPID="$(winpid_z_msys "$BACKEND_PID")"
log "zaplecze PID MSYS=$BACKEND_PID PID Windows=${BACKEND_WINPID:-brak}, czekam na gotowosc (/up)..."
ZAPLECZE_GOTOWE=0
for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/up" >/dev/null 2>&1; then ZAPLECZE_GOTOWE=1; break; fi
    sleep 1
done
if [ "$ZAPLECZE_GOTOWE" != "1" ]; then
    log "ODMOWA (kod 2) - zaplecze nie odpowiedzialo na /up w 30s. Log: $STAN_DIR/zaplecze.log"
    tail -30 "$STAN_DIR/zaplecze.log" >&2
    exit 2
fi
log "zaplecze gotowe."

# Kryterium 4 (dokumentacyjne w logu biegu): nazwa srodowiska, ktora
# TO zaplecze naprawde widzi - `php artisan env`, bez zadnych wartosci tajnych.
(
    cd "$BACKEND_DIR"
    env APP_ENV=local APP_KEY="$APP_KEY_BIEGU" "${export_baza[@]}" \
        CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync \
        php artisan env
) > "$STAN_DIR/zaplecze-env.log" 2>&1
cat "$STAN_DIR/zaplecze-env.log" >> "$RAPORT"
log "srodowisko zaplecza potwierdzone: $(cat "$STAN_DIR/zaplecze-env.log")"

# ---------------------------------------------------------------------------
# 9) Front Next.js - `next dev`, port >= 56000, zmienne w srodowisku procesu
#    (Auth.js v5: AUTH_KEYCLOAK_ISSUER / AUTH_SECRET / AUTH_URL;
#    NEXT_PUBLIC_API_URL do `lib/api.ts`). `NODE_EXTRA_CA_CERTS` MUSI byc
#    ustawione PRZED startem procesu (undici buduje agenta TLS raz, na
#    starcie - zmierzone bezposrednio) - inaczej wymiana kodu na token po
#    stronie Auth.js (serwer) odrzuca samopodpisany certyfikat IdP.
# ---------------------------------------------------------------------------
AUTH_SECRET_BIEGU="$(openssl rand -hex 32)"
log "startuje front na porcie $FRONT_PORT..."
(
    cd "$FRONTEND_DIR"
    env NODE_EXTRA_CA_CERTS="$IDP_CA" \
        AUTH_KEYCLOAK_ISSUER="$KEYCLOAK_ISSUER_WARTOSC" \
        AUTH_SECRET="$AUTH_SECRET_BIEGU" \
        AUTH_URL="$WEB_ORIGIN" \
        NEXT_PUBLIC_API_URL="http://localhost:$BACKEND_PORT" \
        npx next dev -p "$FRONT_PORT"
) > "$STAN_DIR/front.log" 2>&1 &
FRONTEND_PID=$!
FRONTEND_WINPID="$(winpid_z_msys "$FRONTEND_PID")"
log "front PID MSYS=$FRONTEND_PID PID Windows=${FRONTEND_WINPID:-brak} (launcher; Next.js 16 uzywa wlasnego, dlugozyjacego demona per katalog - patrz nizej), czekam na gotowosc (/logowanie)..."
FRONT_GOTOWY=0
for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${FRONT_PORT}/logowanie" >/dev/null 2>&1; then FRONT_GOTOWY=1; break; fi
    sleep 1
done
if [ "$FRONT_GOTOWY" != "1" ]; then
    log "ODMOWA (kod 2) - front nie odpowiedzial na /logowanie w 60s. Log: $STAN_DIR/front.log"
    tail -30 "$STAN_DIR/front.log" >&2
    exit 2
fi
log "front gotowy."

# Next.js 16 (Turbopack) NIE jest procesem-dzieckiem trwajacym przez cale zycie
# `npx next dev` - to CLI zwalnia proces (MSYS/exec-chain konczy sie wczesnie) i
# NASTEPNIE uruchamia wlasny, DLUGOZYJACY serwer per katalog projektu, ktorego
# prawdziwy PID zapisuje SAM Next.js w lockfile `<distDir>/dev/lock`
# (`next/dist/build/lockfile.js`: JSON `{"pid":...,"port":...}`, ten sam plik,
# ktory CLI odczytuje przy komunikacie "Another next dev server is already
# running"). Dlatego `FRONTEND_WINPID` z chwili odpalenia bywa juz martwy, zanim
# sprzatanie sie zaczyna (`/proc/<pid>/winpid` znika, taskkill dostaje "process
# not found") - PID Windows launchera nigdy nie byl PID-em serwera. To NIE jest
# wybor procesu po porcie/nazwie: czytamy WLASNY plik stanu narzedzia, ktore
# sami uruchomilismy (ten sam wzorzec co `docker inspect` przy kontenerze bazy
# nizej), a pole `port` w nim slfuzy WYLACZNIE do potwierdzenia, ze to lockfile
# TEGO biegu (ten sam FRONT_PORT), a nie zdolce po innym, obcym biegu w tym
# samym katalogu - bez zgody nie podmieniamy PID-u.
FRONT_LOCK="$FRONTEND_DIR/.next/dev/lock"
if [ -r "$FRONT_LOCK" ]; then
    LOCK_JSON="$(cat "$FRONT_LOCK" 2>/dev/null)"
    LOCK_PID="$(printf '%s' "$LOCK_JSON" | sed -n 's/.*"pid":\([0-9]*\).*/\1/p')"
    LOCK_PORT="$(printf '%s' "$LOCK_JSON" | sed -n 's/.*"port":\([0-9]*\).*/\1/p')"
    if [ -n "$LOCK_PID" ] && [ "$LOCK_PORT" = "$FRONT_PORT" ]; then
        log "front: lockfile Next.js ($FRONT_LOCK) potwierdza PID $LOCK_PID na porcie $LOCK_PORT (zgodny z FRONT_PORT) - to ten PID sprzatanie bedzie zdejmowac, NIE PID launchera."
        FRONTEND_WINPID="$LOCK_PID"
    else
        log "front: lockfile Next.js ($FRONT_LOCK) nie potwierdza tego biegu (pid='$LOCK_PID' port='$LOCK_PORT', oczekiwany port=$FRONT_PORT) - zostaje PID Windows launchera."
    fi
else
    log "front: brak lockfile Next.js pod $FRONT_LOCK - zostaje PID Windows launchera."
fi

# ---------------------------------------------------------------------------
# 10) Proba wlasciwa: `logowanie-role.spec.ts` (piec nog + swiadek K2).
#     Reporter `list` (domyslny z playwright.config.ts), wynik do
#     `.stan/<bieg>/pomiar.log` (poza gitem). `PW_BASE_URL` wskazuje WYLACZNIE
#     na wlasny, efemeryczny front tego biegu - NIGDY na
#     `https://psychon-dev.niepodzielni.com` (domyslna wartosc konfiguracji
#     bez tej zmiennej) - logowanie do prawdziwego panelu jest zakazem stalym.
# ---------------------------------------------------------------------------
# Odczyt bez node/require: sciezka absolutna w stylu MSYS (/d/...) przekazana
# jako CZESC literalu `-e` NIE jest tlumaczona przez konwerter argumentow MSYS
# (dziala tylko na calych argumentach wygladajacych jak sciezka POSIX), wiec
# node.exe (naturalny, nie-MSYS) dostaje ja doslownie i nie znajduje pliku
# (zmierzone bezposrednio: `Cannot find module '/d/...'` przy pierwszym
# pelnym uruchomieniu). Wszystkie konta testowe tego realmu dziela jedno
# haslo (patrz `realm-fixture.template.json`) - bierzemy pierwsze
# wystapienie klucza "value" pod "credentials", bez node.
HASLO_BIEGU="$(grep -m1 '"value"' "$IDP_STATE_DIR/realm.json" | sed -E 's/.*"value": *"([^"]*)".*/\1/')"
if [ -z "$HASLO_BIEGU" ]; then
    log "ODMOWA (kod 2) - nie udalo sie odczytac hasla biegu z $IDP_STATE_DIR/realm.json."
    exit 2
fi
POMIAR_LOG="$STAN_DIR/pomiar.log"
log "uruchamiam probe: e2e/logowanie/logowanie-role.spec.ts (log: $POMIAR_LOG)..."
(
    cd "$FRONTEND_DIR"
    env PW_BASE_URL="$WEB_ORIGIN" \
        PSYCHON_E2E_BACKEND_URL="http://localhost:$BACKEND_PORT" \
        PSYCHON_E2E_HASLO="$HASLO_BIEGU" \
        npx playwright test e2e/logowanie/logowanie-role.spec.ts
) > "$POMIAR_LOG" 2>&1
PLAYWRIGHT_KOD=$?
cat "$POMIAR_LOG" >> "$RAPORT"

log "proba zakonczona kodem $PLAYWRIGHT_KOD. Wynik: $POMIAR_LOG"
log "raport pelny biegu: $RAPORT"

exit "$PLAYWRIGHT_KOD"
