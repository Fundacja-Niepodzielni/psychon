#!/usr/bin/env bash
# Bramka uruchamiana NA HOSCIE, wewnatrz lustra repozytorium, na commicie,
# ktory wybral wolajacy. Odpowiednik biegu, ktory dzis chodzi lokalnie:
# krok A (suita rownolegla) i krok B (grupa na wspolnej bazie) w backendzie,
# plus lint / test / build we froncie.
#
# Zalozenia, z ktorych zaden nie jest kosmetyczny:
#   - wlasny projekt compose i BRAK portow na hoscie: bramka nie moze wystawic
#     bazy na swiat ani wejsc w droge czemukolwiek, co na hoscie juz stoi;
#   - `.env` powstaje z `.env.example`, klucz aplikacji jest EFEMERYCZNY;
#     zaden sekret nie jest tu potrzebny i zaden nie jest tu tworzony na stale;
#   - kazdy krok ma wlasny czas i wlasny kod wyjscia - zeby dalo sie porownac
#     z droga lokalna liczbami, a nie wrazeniem "chyba szybciej".
set -uo pipefail

PROJEKT="${PROJEKT_BRAMKI:-bramka}"
PROCESY="${PROCESY:-4}"
POMIN_FRONT="${POMIN_FRONT:-nie}"

czas_od() { echo $(( $(date +%s) - $1 )); }
naglowek() { echo; echo "=== $* ==="; }

if [ ! -f docker-compose.yml ] || [ ! -d backend ]; then
    echo "Ten skrypt uruchamia sie w katalogu repozytorium." >&2
    exit 2
fi

START_CALOSC="$(date +%s)"

# Kroki w kontenerze ida jako root, bo katalog repo na hoscie nalezy do konta
# bramki, a obraz PHP chodzi wewnatrz jako wlasny uzytkownik - przy montowaniu
# katalogu te dwa swiaty sie nie zgadzaja i `composer install` nie ma gdzie
# zalozyc `vendor` (zmierzone dwa razy, PUID/PGID tego nie zalatwilo).
# Dlug placimy od razu: WLASNOSC WRACA do konta bramki w sprzataniu, ktore
# chodzi TAKZE po bledzie - inaczej pierwszy czerwony bieg zostawilby w lustrze
# pliki roota, ktorych nastepny bieg nie umialby ruszyc.
UID_BRAMKI="$(id -u)"
GID_BRAMKI="$(id -g)"

sprzataj() {
    docker exec -u root bramka_app chown -R "$UID_BRAMKI:$GID_BRAMKI" /var/www/html >/dev/null 2>&1
    docker compose -p "$PROJEKT" down -v >/dev/null 2>&1
    rm -f docker-compose.override.yml
}
trap sprzataj EXIT

# --- 1 - wlasny stos, bez portow na hoscie ---------------------------------
naglowek "1 - stos bramki"

# Dane bazy CZYTAMY z repo (phpunit.xml), a nie wpisujemy tu z pamieci: suita
# laczy sie dokladnie tam, gdzie mowi ten plik, wiec kontener ma sie nazywac tak
# samo. Zmierzone: kontener z domyslna baza `niepodzielni` daje w kroku A
# "database niepodzielni_testing does not exist" i EXIT=7 w zero sekund.
HASLO="$(grep -oP "(?<=name=\"DB_PASSWORD\" value=\")[^\"]+" backend/phpunit.xml | head -1)"
UZYTKOWNIK="$(grep -oP "(?<=name=\"DB_USERNAME\" value=\")[^\"]+" backend/phpunit.xml | head -1)"
BAZA="$(grep -oP "(?<=name=\"DB_DATABASE\" value=\")[^\"]+" backend/phpunit.xml | head -1)"
if [ -z "$HASLO" ] || [ -z "$UZYTKOWNIK" ] || [ -z "$BAZA" ]; then
    echo "nie odczytalem danych bazy z backend/phpunit.xml" >&2
    exit 2
fi
echo "baza: uzytkownik=$UZYTKOWNIK nazwa=$BAZA (haslo z repo, nie drukowane)"

cat > docker-compose.override.yml <<YML
name: bramka
services:
  app:
    container_name: bramka_app
    ports: !reset []
  queue:
    container_name: bramka_queue
    profiles: ["niepotrzebny"]
  pgsql:
    container_name: bramka_pgsql
    environment:
      POSTGRES_DB: $BAZA
      POSTGRES_USER: $UZYTKOWNIK
      POSTGRES_PASSWORD: $HASLO
    ports: !reset []
  redis:
    container_name: bramka_redis
    ports: !reset []
  mailpit:
    container_name: bramka_mailpit
    ports: !reset []
YML

if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env || exit 2
fi

docker compose -p "$PROJEKT" up -d pgsql redis app > /tmp/bramka-up.log 2>&1
KOD_UP=$?
if [ "$KOD_UP" -ne 0 ]; then
    echo "stos nie wstal (EXIT=$KOD_UP):"; tail -15 /tmp/bramka-up.log
    exit 2
fi

# Czekanie ograniczone: baza albo wstanie w minute, albo bieg sie nie odbywa.
GOTOWA="nie"
for _ in $(seq 1 60); do
    if docker exec bramka_pgsql pg_isready -U "$UZYTKOWNIK" -d "$BAZA" >/dev/null 2>&1; then GOTOWA="tak"; break; fi
    sleep 1
done
echo "baza gotowa: $GOTOWA"
[ "$GOTOWA" = "tak" ] || { exit 2; }

# --- 2 - zaleznosci i swieza baza ------------------------------------------
naglowek "2 - composer, klucz, migracja"

T="$(date +%s)"
docker exec -u root bramka_app composer install --no-interaction --prefer-dist --quiet > /tmp/bramka-composer.log 2>&1
KOD_COMPOSER=$?
echo "composer: EXIT=$KOD_COMPOSER, $(czas_od "$T") s"
[ "$KOD_COMPOSER" -eq 0 ] || { tail -10 /tmp/bramka-composer.log; exit 2; }

docker exec -u root bramka_app php artisan key:generate --force --no-interaction >/dev/null 2>&1
T="$(date +%s)"
# artisan NIE czyta phpunit.xml, a `--env` wybiera PLIK z ustawieniami, nie baze;
# adres bazy podaje srodowisko.
docker exec -u root -e DB_CONNECTION=pgsql -e DB_HOST=pgsql -e DB_PORT=5432     -e DB_DATABASE="$BAZA" -e DB_USERNAME="$UZYTKOWNIK" -e DB_PASSWORD="$HASLO"     bramka_app php artisan migrate:fresh --force --no-interaction > /tmp/bramka-migracja.log 2>&1
KOD_MIGRACJI=$?
TABELE="$(docker exec bramka_pgsql psql -U "$UZYTKOWNIK" -d "$BAZA" -tAc "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null | tr -d "[:space:]")"
echo "migracja: EXIT=$KOD_MIGRACJI, $(czas_od "$T") s, tabel w $BAZA: $TABELE"
[ "$KOD_MIGRACJI" -eq 0 ] || { tail -10 /tmp/bramka-migracja.log; exit 2; }
# Zielona migracja, ktora nic nie zalozyla, znaczy zwykle, ze artisan poszedl
# na INNA baze niz ta, ktora zaraz mierzymy. Kod wyjscia tego nie powie.
if [ -z "$TABELE" ] || [ "$TABELE" -eq 0 ] 2>/dev/null; then
    echo "migracja EXIT=0, a tabel: ${TABELE:-brak odczytu} - to nie ta baza"
    exit 2
fi

# --- 3 - krok A i krok B ---------------------------------------------------
naglowek "3 - backend: krok A (rownolegle) i krok B (wspolna baza)"

T="$(date +%s)"
docker exec -u root bramka_app php artisan test --parallel --processes="$PROCESY" --exclude-group=wspolna-baza > /tmp/bramka-A.log 2>&1
KOD_A=$?
CZAS_A="$(czas_od "$T")"
grep -aE "Tests:|Assertions:|FAILURES|ERRORS|OK \(" /tmp/bramka-A.log | tail -3
echo "krok A: EXIT=$KOD_A, $CZAS_A s"

T="$(date +%s)"
docker exec -u root bramka_app ./vendor/bin/phpunit --group=wspolna-baza > /tmp/bramka-B.log 2>&1
KOD_B=$?
CZAS_B="$(czas_od "$T")"
grep -aE "Tests:|Assertions:|FAILURES|ERRORS|OK \(" /tmp/bramka-B.log | tail -3
echo "krok B: EXIT=$KOD_B, $CZAS_B s"

# --- 4 - front -------------------------------------------------------------
KOD_FRONT=0
CZAS_FRONT=0
if [ "$POMIN_FRONT" = "tak" ]; then
    naglowek "4 - front pominiety (POMIN_FRONT=tak)"
else
    naglowek "4 - front: instalacja, lint, test, build"
    T="$(date +%s)"
    docker run --rm -v "$PWD/frontend:/praca" -w /praca node:22-alpine \
        sh -c "npm ci --no-audit --no-fund && npm run lint && npm test -- --run && npm run build" \
        > /tmp/bramka-front.log 2>&1
    KOD_FRONT=$?
    CZAS_FRONT="$(czas_od "$T")"
    docker run --rm -v "$PWD/frontend:/praca" -w /praca node:22-alpine chown -R "$UID_BRAMKI:$GID_BRAMKI" /praca >/dev/null 2>&1
    grep -aE "Test Files|Tests |Compiled|Failed|error|Error" /tmp/bramka-front.log | tail -5
    echo "front: EXIT=$KOD_FRONT, $CZAS_FRONT s"
fi

# --- 5 - sprzatanie i wynik ------------------------------------------------
naglowek "5 - wynik"

docker exec -u root bramka_app chown -R "$UID_BRAMKI:$GID_BRAMKI" /var/www/html >/dev/null 2>&1
rm -f docker-compose.override.yml
BRUD="$(git status --porcelain | grep -c .)"

echo "drzewo po biegu: $BRUD pozycji"
echo "czasy: A=${CZAS_A}s B=${CZAS_B}s front=${CZAS_FRONT}s calosc=$(czas_od "$START_CALOSC")s"

if [ "$KOD_A" -ne 0 ]; then KOD=$KOD_A
elif [ "$KOD_B" -ne 0 ]; then KOD=$KOD_B
else KOD=$KOD_FRONT; fi

echo "EXIT=$KOD"
exit "$KOD"
