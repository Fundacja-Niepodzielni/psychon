#!/usr/bin/env bash
# Generuje backend/openapi.json narzedziem zaplecza (Scramble, dedoc/scramble,
# zaleznosc deweloperska). NIE jest bramka i jej nie zastepuje: nie uruchamia
# testow ani skanerow, tylko dokument.
#
# Powod jednorazowej bazy: Scramble w trakcie analizy typow modeli odpytuje
# ZYWE polaczenie z baza (introspekcja schematu kolumn), wiec potrzebuje
# realnej, zmigrowanej bazy - nie wystarczy sama obecnosc .env. Kontener jest
# jednorazowy, z nazwa i etykieta psychon.bieg wlasnego biegu; na koncu biegu
# (trap) jest tylko ZATRZYMYWANY, i to wylacznie wtedy, gdy zalozyl go ten bieg.
# Skrypt nigdy nie usuwa kontenerow - zatrzymany kontener zostaje z etykieta do
# sprzatania rejestrem. Dane logowania czytane z backend/phpunit.xml, nigdy nie
# drukowane.
#
# Uzycie (z katalogu backend/ lub skadkolwiek - skrypt sam ustawia katalog):
#   bash scripts/generuj-openapi.sh
# Zmienna PSYCHON_OPENAPI_DB_PORT pozwala zmienic port, gdy 55433 jest zajety.
set -uo pipefail
export LC_ALL=C.UTF-8
cd "$(dirname "$0")/.." || exit 2   # -> backend/
BACKEND="$(pwd)"

PORT="${PSYCHON_OPENAPI_DB_PORT:-55433}"
# Etykieta biegu na kontenerze (psychon.bieg), zeby kazdy kontener dalo sie
# przypisac do biegu, ktory go zalozyl. Zmienna PSYCHON_BIEG nadaje wlasna.
ETYKIETA_BIEGU="${PSYCHON_BIEG:-generuj-openapi-$(date +%Y%m%d-%H%M%S)}"
# Nazwa kontenera z etykiety biegu (znaki spoza [a-z0-9_.-] zamienione na -):
# stala nazwa pozwalalaby trafic w kontener innego biegu.
KONTENER="psy-openapi-baza-$(printf '%s' "$ETYKIETA_BIEGU" | sed 's/[^a-z0-9_.-]/-/g')"

HASLO="$(grep -oP '(?<=name="DB_PASSWORD" value=")[^"]+' phpunit.xml | head -1)"
UZYTKOWNIK="$(grep -oP '(?<=name="DB_USERNAME" value=")[^"]+' phpunit.xml | head -1)"
BAZA="$(grep -oP '(?<=name="DB_DATABASE" value=")[^"]+' phpunit.xml | head -1)"
if [ -z "$HASLO" ] || [ -z "$UZYTKOWNIK" ] || [ -z "$BAZA" ]; then
    echo "[GENERUJ-OPENAPI] ODMOWA: nie odczytalem danych bazy z phpunit.xml." >&2
    exit 2
fi
echo "[GENERUJ-OPENAPI] baza jednorazowa: uzytkownik=${UZYTKOWNIK} nazwa=${BAZA} port=${PORT} (haslo odczytane z repo, nie drukowane)"

# Znacznik ustawiany dopiero po udanym `docker run`: pulapka zatrzymuje
# wylacznie kontener zalozony przez ten bieg, nigdy cudzy.
ZALOZONY=0
zatrzymaj() {
    WYJSCIE=$?
    if [ "$ZALOZONY" -eq 1 ]; then
        docker.exe stop "$KONTENER" >/dev/null 2>&1 \
            && echo "[GENERUJ-OPENAPI] kontener ${KONTENER} zatrzymany (zostaje, etykieta psychon.bieg=${ETYKIETA_BIEGU})"
    fi
    exit "$WYJSCIE"
}
trap zatrzymaj EXIT

# Katalog danych w pamieci (--tmpfs): obraz postgres:17 deklaruje VOLUME
# /var/lib/postgresql/data, wiec bez tmpfs kazdy start zakladalby nowy
# anonimowy wolumen, ktory zostawalby na dysku po kazdym biegu.
if ! docker.exe run -d --name "$KONTENER" \
        --tmpfs /var/lib/postgresql/data:size=512m \
        --label "psychon.bieg=${ETYKIETA_BIEGU}" \
        -e POSTGRES_USER="$UZYTKOWNIK" -e POSTGRES_PASSWORD="$HASLO" -e POSTGRES_DB="$BAZA" \
        -p "${PORT}:5432" postgres:17 >/dev/null; then
    echo "[GENERUJ-OPENAPI] ODMOWA: kontener bazy nie wstal." >&2
    exit 2
fi
ZALOZONY=1
echo "[GENERUJ-OPENAPI] kontener ${KONTENER} (etykieta psychon.bieg=${ETYKIETA_BIEGU})"

GOTOWA=0
for _ in $(seq 1 30); do
    docker.exe exec "$KONTENER" pg_isready -U "$UZYTKOWNIK" -d "$BAZA" >/dev/null 2>&1 && { GOTOWA=1; break; }
    sleep 1
done
[ "$GOTOWA" -eq 1 ] || { echo "[GENERUJ-OPENAPI] ODMOWA: baza nie odpowiedziala w 30 s." >&2; exit 2; }

export DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT="$PORT" DB_DATABASE="$BAZA" DB_USERNAME="$UZYTKOWNIK" DB_PASSWORD="$HASLO"

php artisan migrate:fresh --force --no-interaction || { echo "[GENERUJ-OPENAPI] ODMOWA: migracja padla." >&2; exit 2; }
echo "[GENERUJ-OPENAPI] migracja EXIT=0"

php artisan scramble:export --path=openapi.json
KOD_EXPORT=$?
[ "$KOD_EXPORT" -eq 0 ] && [ -f openapi.json ] || { echo "[GENERUJ-OPENAPI] ODMOWA: scramble:export padl albo nie zostawil pliku." >&2; exit 2; }
echo "[GENERUJ-OPENAPI] ${BACKEND}/openapi.json: $(wc -c < openapi.json) bajtow"
