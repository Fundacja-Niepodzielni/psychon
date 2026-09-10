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

# --- 3b - skanery backendu -------------------------------------------------
# Analiza statyczna JEST blokujaca; audyt zaleznosci NIE JEST. Powod rozdzialu:
# trafienie PHPStana bierze sie z naszej zmiany i mamy je czym naprawic, a wpis
# w bazie podatnosci pojawia sie po stronie serwera, bez zadnego naszego ruchu.
# Bramka, ktora pada od cudzego wpisu, uczy zespol omijac bramke - wiec audyt
# jest tu POMIAREM, ktory zostawia liczbe w logu, i nie wchodzi do kodu wyjscia.
naglowek "3b - backend: analiza statyczna i audyt zaleznosci"

# Cache PHPStana ginie razem z kontenerem, wiec kazdy bieg bramki jest "na zimno".
# Zmierzone 10.09: 123 s na zimno wobec 28 s na cieple. Placimy te ~2 minuty
# swiadomie - cache przenoszony miedzy commitami to nastepna rzecz, ktorej trzeba
# by pilnowac, a analiza, ktora czyta cudzy cache, jest analiza czegos innego.
T="$(date +%s)"
docker exec -u root bramka_app ./vendor/bin/phpstan analyse --memory-limit=512M --no-progress > /tmp/bramka-phpstan.log 2>&1
KOD_STATYCZNA=$?
CZAS_STATYCZNA="$(czas_od "$T")"
grep -aE "\[OK\]|Found [0-9]+ error|^ Line|errors" /tmp/bramka-phpstan.log | tail -2
echo "analiza statyczna: EXIT=$KOD_STATYCZNA, $CZAS_STATYCZNA s"

T="$(date +%s)"
docker exec -u root bramka_app composer audit --locked --format=plain > /tmp/bramka-audyt-php.log 2>&1
KOD_AUDYT_PHP=$?
# Liczbe bierzemy z PIERWSZEJ linii wyniku, nie z kodu wyjscia: kod mowi tylko
# "cos jest", a do STATE i tak trzeba wpisac ILE. Bez trafien composer nie pisze
# linii "Found ...", wiec pusty wynik pokazujemy jako 0, a nie jako brak pomiaru.
PODATNOSCI_PHP="$(grep -aoE "Found [0-9]+ security vulnerability advisor" /tmp/bramka-audyt-php.log | head -1)"
echo "audyt PHP (pomiar, poza kodem wyjscia): EXIT=$KOD_AUDYT_PHP, ${PODATNOSCI_PHP:-Found 0 security vulnerability advisor}ies"

# --- 3c - skaner statyczny na przypietych regulach --------------------------
# Bez sieci (`--network none`) i z regulami z repo, nie z rejestru: to jedyny
# uklad, w ktorym dwa biegi na tym samym commicie musza dac te sama liczbe.
# Zmierzone: z siecia 135 s, bez sieci na migawce 131 s - niezaleznosc od cudzego
# serwera nie kosztuje tu praktycznie nic.
# JEST blokujacy od 10.09 - warunek zapisany tu wczesniej zostal spelniony: oba
# zastane trafienia z backend/config/session.php sa rozstrzygniete (jedno falszywe,
# z wyciszeniem i uzasadnieniem przy linii, drugie prawdziwe i poprawione).
# Zmierzone na czubku przed przelaczeniem: 31 regul na 439 plikach, 0 trafien.
naglowek "3c - backend i front: skaner statyczny (reguly przypiete w repo)"

T="$(date +%s)"
docker run --rm --network none -v "$PWD:/src" -w /src semgrep/semgrep:1.169.0 \
    semgrep scan --config .semgrep/reguly --error --metrics=off > /tmp/bramka-semgrep.log 2>&1
KOD_SEMGREP=$?
CZAS_SEMGREP="$(czas_od "$T")"
# Liczba z PODSUMOWANIA, nie z kodu wyjscia: `--error` daje 1 przy KAZDYM
# trafieniu, wiec kod nie odroznia dwoch zastanych od trzeciego, nowego.
TRAFIENIA_SEMGREP="$(grep -aoE "Ran [0-9]+ rules on [0-9]+ files: [0-9]+ findings" /tmp/bramka-semgrep.log | tail -1)"
echo "skaner statyczny: EXIT=$KOD_SEMGREP, $CZAS_SEMGREP s, ${TRAFIENIA_SEMGREP:-brak odczytu}"

# --- 3d - skladnia plikow workflow (krok blokujacy) -------------------------
# Blokuje, bo nie ma tu zastanych trafien do rozstrzygniecia, a klasa bledow, ktora
# lapie, kosztuje inaczej minuty na zdalnym biegu i cudzy commit: bledny warunek
# `if:` na sekrecie przechodzil u nas przez przeglad, a czerwien przychodzila
# dopiero z serwera. Obraz przypiety wersja, nie `latest`, bo inaczej bramka mierzy
# to, co ktos wczoraj wypchnal. Bez sieci - narzedzie niesie shellcheck w obrazie.
# Warunek nizej jest na "rozne od zera", nie na jedynke: poza repozytorium git
# narzedzie konczy sie kodem 3 ("no project was found"), czyli ODMAWIA POMIARU
# z powodu niezwiazanego z tym, co mierzy - i taka odmowa ma byc czerwona.
naglowek "3d - skladnia plikow workflow"

KOD_ACTIONLINT=0
if [ -d .github/workflows ]; then
    T="$(date +%s)"
    docker run --rm --network none -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -no-color > /tmp/bramka-actionlint.log 2>&1
    KOD_ACTIONLINT=$?
    CZAS_ACTIONLINT="$(czas_od "$T")"
    # ILE obejrzal, nie tylko ile znalazl: pusty katalog workflow tez dalby zero.
    PLIKOW_AL="$(ls -1 .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null | wc -l)"
    BLEDOW_AL="$(grep -acE "^[^ ]+:[0-9]+:[0-9]+:" /tmp/bramka-actionlint.log)"
    echo "skladnia workflow: EXIT=$KOD_ACTIONLINT, $CZAS_ACTIONLINT s, plikow $PLIKOW_AL, bledow $BLEDOW_AL"
    [ "$KOD_ACTIONLINT" -ne 0 ] && head -10 /tmp/bramka-actionlint.log | sed 's/^/  ! /'
else
    echo "skladnia workflow: POMINIETA - brak .github/workflows" >&2
fi

# --- 3e - sekrety w tresci commitu (krok blokujacy) -------------------------
# Powod istnienia: zestaw regul `generic.secrets.*` zostal 10.09 wyjety z migawki
# semgrepa (nosi przyklady sekretow w `pattern-not:`, przez co GitHub odrzucal
# pchniecie z GH013). Bez tego kroku bramka nie skanowalaby sekretow WCALE, a
# jedynym przyrzadem zostalaby push protection GitHuba - czyli dowiadywalibysmy
# sie o sekrecie dopiero przy pchnieciu, po fakcie.
# Skanujemy WYLACZNIE tresc sledzona przez git (`git archive` czubka), nie katalog
# roboczy: `gitleaks dir` na drzewie znajduje 11 trafien, wszystkie w `frontend/.next`
# i `backend/vendor`, czyli w plikach, ktorych repozytorium NIE zawiera (zmierzone:
# `git ls-files` = 0 dla kazdego z nich). Skaner, ktory czerwieni sie od cudzych
# artefaktow budowania, zostanie wyciszony przez pierwsza osobe, ktora go zobaczy.
naglowek "3e - sekrety w tresci commitu"

T="$(date +%s)"
EKSPORT="$(mktemp -d)"
git archive --format=tar HEAD | tar -x -C "$EKSPORT"
PLIKOW_GL="$(find "$EKSPORT" -type f | wc -l)"
docker run --rm --network none -v "${EKSPORT}:/tresc:ro" -v "$PWD/.gitleaks.toml:/konfiguracja.toml:ro"     ghcr.io/gitleaks/gitleaks:v8.30.1 dir /tresc -c /konfiguracja.toml --no-banner --redact     > /tmp/bramka-gitleaks.log 2>&1
KOD_GITLEAKS=$?
CZAS_GITLEAKS="$(czas_od "$T")"
rm -rf "$EKSPORT"
# ILE obejrzal, nie tylko ile znalazl - pusty eksport tez dalby zero trafien.
BAJTOW_GL="$(grep -aoE "scanned ~[0-9]+ bytes" /tmp/bramka-gitleaks.log | tail -1)"
TRAFIEN_GL="$(grep -acE "^RuleID:" /tmp/bramka-gitleaks.log)"
echo "sekrety: EXIT=$KOD_GITLEAKS, $CZAS_GITLEAKS s, plikow $PLIKOW_GL, ${BAJTOW_GL:-brak odczytu}, trafien $TRAFIEN_GL"
[ "$KOD_GITLEAKS" -ne 0 ] && grep -aE "^(RuleID|File|Line):" /tmp/bramka-gitleaks.log | head -12 | sed 's/^/  ! /'

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

    # Audyt npm biegnie OSOBNO, a nie w lancuchu wyzej, z dwoch powodow: ma nie
    # zaczerwienic kroku frontu (pomiar, nie blokada) i ma sie odbyc takze wtedy,
    # gdy build padnie. Zmierzone: `npm audit` czyta package-lock.json i nie
    # potrzebuje node_modules, wiec `npm ci` nie jest tu warunkiem.
    # `--omit=dev` swiadomie: podatnosci w vitest czy js-yaml nie ida do przegladarki.
    docker run --rm -v "$PWD/frontend:/praca" -w /praca node:22-alpine \
        npm audit --omit=dev --audit-level=high > /tmp/bramka-audyt-npm.log 2>&1
    KOD_AUDYT_NPM=$?
    PODATNOSCI_NPM="$(grep -aoE "[0-9]+ vulnerabilities \(.*\)|found 0 vulnerabilities" /tmp/bramka-audyt-npm.log | tail -1)"
    echo "audyt npm (pomiar, poza kodem wyjscia): EXIT=$KOD_AUDYT_NPM, ${PODATNOSCI_NPM:-brak odczytu}"
fi

# --- 5 - sprzatanie i wynik ------------------------------------------------
naglowek "5 - wynik"

docker exec -u root bramka_app chown -R "$UID_BRAMKI:$GID_BRAMKI" /var/www/html >/dev/null 2>&1
rm -f docker-compose.override.yml
# Trzeci stan przyrzadu: "nie zmierzylem" (L-113). `git status | grep -c .` daje ZERO
# takze wtedy, gdy git w ogole nie wystartowal - a taki przypadek tu zachodzi naprawde:
# bieg w WSL dziedziczy katalog roboczy z katalogu bind-mountow Docker Desktop
# (/mnt/wsl/docker-desktop-bind-mounts/...), ktory znika razem z kontenerami, i git konczy
# sie wtedy "fatal: Unable to read current working directory". Zielone "drzewo po biegu:
# 0 pozycji" bylo w takim biegu NIEPRAWDA, tylko wygladalo jak prawda.
STATUS_TXT="$(git status --porcelain 2>/tmp/bramka-status.err)"
KOD_STATUS=$?
KOD_DRZEWO=0
if [ "$KOD_STATUS" -ne 0 ]; then
    KOD_DRZEWO=$KOD_STATUS
    echo "drzewo po biegu: NIEZMIERZONE - git EXIT=$KOD_STATUS: $(head -1 /tmp/bramka-status.err)" >&2
else
    BRUD="$(printf '%s' "$STATUS_TXT" | grep -c .)"
    echo "drzewo po biegu: $BRUD pozycji"
fi
echo "czasy: A=${CZAS_A}s B=${CZAS_B}s statyczna=${CZAS_STATYCZNA:-0}s semgrep=${CZAS_SEMGREP:-0}s front=${CZAS_FRONT}s calosc=$(czas_od "$START_CALOSC")s"

# KOD_ACTIONLINT, KOD_GITLEAKS i - od 10.09 - KOD_SEMGREP sa tu wymienione (blokuja).
# Audyty (KOD_AUDYT_PHP, KOD_AUDYT_NPM) NIE sa i to jest decyzja, nie przeoczenie:
# ich liczby stoja w logu wyzej i ida do rejestru z numerem, a podatnosc w cudzej
# zaleznosci nie jest rzecza, ktora ten commit zepsul.
if [ "$KOD_A" -ne 0 ]; then KOD=$KOD_A
elif [ "$KOD_B" -ne 0 ]; then KOD=$KOD_B
elif [ "${KOD_STATYCZNA:-0}" -ne 0 ]; then KOD=$KOD_STATYCZNA
elif [ "${KOD_ACTIONLINT:-0}" -ne 0 ]; then KOD=$KOD_ACTIONLINT
elif [ "${KOD_GITLEAKS:-0}" -ne 0 ]; then KOD=$KOD_GITLEAKS
elif [ "${KOD_DRZEWO:-0}" -ne 0 ]; then KOD=$KOD_DRZEWO
elif [ "${KOD_SEMGREP:-0}" -ne 0 ]; then KOD=$KOD_SEMGREP
else KOD=$KOD_FRONT; fi

echo "EXIT=$KOD"
exit "$KOD"
