#!/usr/bin/env bash
# Dostawca tozsamosci EFEMERYCZNY dla e2e logowania (realny tor tokenu OIDC).
#
# Uzycie (KAZDE wywolanie tego skryptu idzie PRZEZ suita.sh - "Docker only through
# the slot tool" - ten skrypt sam w sobie NIE bierze slotu):
#   bash uruchom-idp.sh start   -> stawia kontener, czeka na gotowosc, zapisuje stan
#   bash uruchom-idp.sh stop    -> zdejmuje WYLACZNIE kontener zapisany we WLASNYM stanie
#   bash uruchom-idp.sh status  -> wypisuje stan bez zadnej zmiany
#
# Obraz quay.io/keycloak/keycloak:26.7.0 jest juz lokalnie - ten skrypt go NIE pobiera
# (`docker image inspect` przed `docker run`; brak obrazu = odmowa, nie pull).
#
# Realm: frontend/e2e/logowanie/realm-fixture.template.json - wywiedziony z kontraktu
# (INTEGRACJA-KONTRAKT.md SS1, SS2, SS2b, SS2d, SS3), NIE z eksportu produkcyjnego.
# Sekret klienta poufnego (`psychon-api`) i haslo testowe sa generowane W BIEGU
# (`openssl rand`) i podstawiane do KOPII szablonu w katalogu roboczym biegu -
# NIGDY do pliku w drzewie repo.
set -euo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SZABLON_REALMU="$TU/realm-fixture.template.json"
IMAGE="quay.io/keycloak/keycloak:26.7.0"

# Prefiks kontenera niesie identyfikator TEGO biegu (F-... "nazwa z przedrostkiem
# Twojego biegu, np. psy-e2e-idp-<bieg>") - domyslnie PID powloki nadrzednej + czas,
# nadpisywalne przez PSYCHON_BIEG_E2E dla powtarzalnosci w jednym uruchomieniu.
BIEG="${PSYCHON_BIEG_E2E:-$$-$(date +%s)}"
NAZWA="psy-e2e-idp-${BIEG}"
KATALOG_STANU="${PSYCHON_IDP_STATE_DIR:-$TU/.stan/$BIEG}"

# Port WLASNY, spoza 55430-55449 (ten zakres jest zarezerwowany dla wspolnego
# kontenera bazy uzywanego przez bramke zaplecza - nie wolno tam wejsc). Domyslnie
# losowany raz i zapamietywany w
# stanie biegu, zeby stop/status uzywaly TEGO SAMEGO portu co start.
wybierz_port() {
    # Zakres >= 56000: 55430-55939 nalezy od dff742f do bramki (port z roli lustra),
    # a decyzja liderska z 21:53 rozszerza to samo wymaganie na port IdP w tym biegu.
    local proba
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        proba=$(( (RANDOM % 3000) + 56000 ))
        if ! (exec 3<>"/dev/tcp/127.0.0.1/$proba") 2>/dev/null; then
            echo "$proba"; return 0
        fi
        exec 3>&- 2>/dev/null || true
    done
    echo "brak wolnego portu po 10 probach" >&2
    return 1
}

log() { printf '[idp-efemeryczny] %s\n' "$*" >&2; }

polecenie="${1:-}"

case "$polecenie" in
  start)
    if [ -f "$KATALOG_STANU/container.id" ]; then
        log "ODMOWA - stan biegu '$BIEG' juz istnieje w $KATALOG_STANU (uruchom 'stop' albo inny PSYCHON_BIEG_E2E)."
        exit 1
    fi
    mkdir -p "$KATALOG_STANU"
    chmod 700 "$KATALOG_STANU"

    docker image inspect "$IMAGE" >/dev/null 2>&1 || { log "ODMOWA - obraz $IMAGE nie jest lokalnie; ten skrypt NIE pobiera nowych obrazow."; exit 1; }

    PORT="$(wybierz_port)"
    echo "$PORT" > "$KATALOG_STANU/port"

    WEB_ORIGIN="${PSYCHON_E2E_WEB_ORIGIN:-http://localhost:3000}"

    # --- sekret klienta poufnego i haslo testowe: generowane W BIEGU, nigdy w repo ---
    SEKRET_API="$(openssl rand -hex 32)"
    HASLO_E2E="e2e-syntetyczne-haslo-$(openssl rand -hex 6)"

    # --- CA i certyfikat TLS wlasny dla tego biegu (kryterium 3: swiadek dwustronny insecure_tls) ---
    mkdir -p "$KATALOG_STANU/tls"
    # Git Bash/MSYS: "-subj /CN=..." z WLACZONYM MSYS_NO_PATHCONV (ten skrypt jest
    # wolywany z nim ustawionym - wymaga tego wywolanie przez suita.sh dla poprawnych
    # montowan -v) wciaz psulby -keyout/-out (MSYS_NO_PATHCONV wylacza KAZDA konwersje
    # sciezki, nie tylko dla -subj). Zmierzone: `env MSYS_NO_PATHCONV=` (pusta wartosc)
    # NIE dziala - MSYS sprawdza sama OBECNOSC zmiennej, nie jej wartosc - trzeba ja
    # NAPRAWDE usunac (`env -u`) na czas TEGO wywolania; -subj dostaje podwojny wiodacy
    # "/" (MSYS nie tlumaczy "//CN=..."), zeby dzialalo tez bez zmiennej ustawionej.
    env -u MSYS_NO_PATHCONV openssl req -x509 -newkey rsa:2048 -sha256 -days 1 -nodes \
        -keyout "$KATALOG_STANU/tls/key.pem" -out "$KATALOG_STANU/tls/cert.pem" \
        -subj "//CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
        >/dev/null 2>&1

    # --- realm renderowany do kopii w katalogu stanu, NIE w drzewie repo ---
    sed \
        -e "s/__PSYCHON_API_CLIENT_SECRET__/${SEKRET_API}/g" \
        -e "s#__PSYCHON_WEB_ORIGIN__#${WEB_ORIGIN}#g" \
        -e "s/__NP_E2E_HASLO__/${HASLO_E2E}/g" \
        "$SZABLON_REALMU" > "$KATALOG_STANU/realm.json"

    # MSYS_NO_PATHCONV=1 na CALE to wywolanie: bez tego Git-Bash tlumaczy KAZDY
    # argument wygladajacy na sciezke POSIX (w tym WARTOSCI po `-e KLUCZ=`, nie
    # tylko `-v`) na sciezke Windows - zmierzone: `/opt/keycloak/certs/cert.pem`
    # trafial do kontenera jako `C:/Program Files/Git/opt/keycloak/certs/cert.pem`,
    # Keycloak nie znajdowal pliku, padal PO bootstrapie (`NoSuchFileException`)
    # i `--rm` sprzatal kontener, zanim petla gotowosci zdazyla to zobaczyc.
    MSYS_NO_PATHCONV=1 docker run -d --rm \
        --name "$NAZWA" \
        -p "127.0.0.1:${PORT}:8443" \
        -v "$KATALOG_STANU/realm.json:/opt/keycloak/data/import/realm.json:ro" \
        -v "$KATALOG_STANU/tls/cert.pem:/opt/keycloak/certs/cert.pem:ro" \
        -v "$KATALOG_STANU/tls/key.pem:/opt/keycloak/certs/key.pem:ro" \
        -e KC_BOOTSTRAP_ADMIN_USERNAME="e2e-bootstrap" \
        -e KC_BOOTSTRAP_ADMIN_PASSWORD="$(openssl rand -hex 16)" \
        -e KC_HOSTNAME="https://localhost:${PORT}" \
        -e KC_HOSTNAME_STRICT_BACKCHANNEL="false" \
        -e KC_HTTPS_CERTIFICATE_FILE="/opt/keycloak/certs/cert.pem" \
        -e KC_HTTPS_CERTIFICATE_KEY_FILE="/opt/keycloak/certs/key.pem" \
        -e KC_HTTP_ENABLED="false" \
        "$IMAGE" start-dev --import-realm > "$KATALOG_STANU/container.id.tmp"

    ID_KONTENERA="$(cat "$KATALOG_STANU/container.id.tmp")"
    # Weryfikacja przed zapisaniem na stale: identyfikator MUSI odpowiadac kontenerowi
    # o TEJ nazwie (zdejmujemy po ID, ale ID zapisujemy dopiero po potwierdzeniu,
    # ze to nasz, wlasnie uruchomiony proces).
    ID_SPRAWDZONY="$(docker inspect --format '{{.Id}}' "$NAZWA" 2>/dev/null || true)"
    if [ -z "$ID_SPRAWDZONY" ] || [ "$ID_SPRAWDZONY" != "$ID_KONTENERA" ]; then
        log "ODMOWA - identyfikator kontenera nie potwierdza sie (docker inspect); nie zapisuje stanu."
        docker rm -f "$ID_KONTENERA" >/dev/null 2>&1 || true
        exit 1
    fi
    mv "$KATALOG_STANU/container.id.tmp" "$KATALOG_STANU/container.id"
    echo "$NAZWA" > "$KATALOG_STANU/container.name"

    log "kontener $NAZWA ($ID_SPRAWDZONY) na porcie $PORT, czekam na gotowosc..."
    GOTOWY=0
    for _ in $(seq 1 60); do
        # Ta sama pulapka MSYS co przy openssl: z MSYS_NO_PATHCONV=1 (ustawionym
        # przez wywolujacego, suita.sh) curl.exe NIE tlumaczy sciezki --cacert i
        # zglasza "does not exist" na kazdej probie - stad `env -u` tutaj tez.
        if env -u MSYS_NO_PATHCONV curl -fsS --cacert "$KATALOG_STANU/tls/cert.pem" \
            "https://localhost:${PORT}/realms/niepodzielni/.well-known/openid-configuration" \
            >/dev/null 2>&1; then
            GOTOWY=1; break
        fi
        sleep 2
    done
    if [ "$GOTOWY" -ne 1 ]; then
        log "ODMOWA - IdP nie odpowiedzial w 120s; logi ponizej, kontener NIE jest zdejmowany automatycznie (do diagnozy)."
        docker logs --tail 80 "$NAZWA" >&2 || true
        exit 1
    fi
    log "gotowy: https://localhost:${PORT}/realms/niepodzielni"
    echo "PORT=${PORT}"
    echo "CA=${KATALOG_STANU}/tls/cert.pem"
    echo "BIEG=${BIEG}"
    ;;

  stop)
    if [ ! -f "$KATALOG_STANU/container.id" ]; then
        log "brak stanu dla biegu '$BIEG' w $KATALOG_STANU - nic do zdjecia."
        exit 0
    fi
    ID_ZAPISANY="$(cat "$KATALOG_STANU/container.id")"
    NAZWA_ZAPISANA="$(cat "$KATALOG_STANU/container.name" 2>/dev/null || echo "$NAZWA")"
    ID_ZASTANY="$(docker inspect --format '{{.Id}}' "$NAZWA_ZAPISANA" 2>/dev/null || true)"
    if [ -z "$ID_ZASTANY" ]; then
        log "kontener '$NAZWA_ZAPISANA' juz nie istnieje (--rm go pewnie juz zdjal). Czyszcze tylko stan."
    elif [ "$ID_ZASTANY" != "$ID_ZAPISANY" ]; then
        log "ODMOWA - kontener o nazwie '$NAZWA_ZAPISANA' istnieje, ale jego ID ($ID_ZASTANY) NIE zgadza sie z zapisanym ($ID_ZAPISANY). NIE zdejmuje cudzego kontenera."
        exit 1
    else
        docker rm -f "$ID_ZAPISANY" >/dev/null 2>&1 || true
        log "zdjety kontener $NAZWA_ZAPISANA ($ID_ZAPISANY)."
    fi
    rm -rf "$KATALOG_STANU"
    ;;

  status)
    if [ -f "$KATALOG_STANU/container.id" ]; then
        echo "BIEG=${BIEG} PORT=$(cat "$KATALOG_STANU/port" 2>/dev/null || echo '?') KONTENER=$(cat "$KATALOG_STANU/container.name" 2>/dev/null || echo '?')"
    else
        echo "brak biegu '$BIEG'"
    fi
    ;;

  *)
    echo "uzycie: uruchom-idp.sh {start|stop|status}" >&2
    exit 2
    ;;
esac
