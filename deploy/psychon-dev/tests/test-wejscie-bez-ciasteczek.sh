#!/usr/bin/env bash
# Swiadek: wejscie srodowiska odbiorczego (deploy/psychon-dev/Caddyfile) NIE przekazuje
# ciasteczek do backendu na trasach /api/* i /storage/*, a trasy logowania (/api/auth/*)
# i cala reszta ida do Next.js Z ciasteczkami.
#
# Uruchamia PRAWDZIWY plik Caddyfile z drzewa (sciezka jako argument, domyslnie plik z
# drzewa) w obrazie caddy:2-alpine, z certyfikatem samopodpisanym tworzonym na czas testu,
# w prywatnej sieci Dockera, z dwoma atrapami upstreamu "app" (port 8080, backend) i
# "frontend" (port 3000) na obrazie nginx:alpine z DOMYSLNYMI buforami naglowkow (zadna
# dyrektywa buforow nie jest tu ustawiana - to jest przedmiotem K4). Atrapy odpowiadaja
# naglowkami X-Echo-Cookie i X-Echo-Auth, ktore zawieraja DOKLADNA TRESC odebranego
# naglowka Cookie/Authorization (albo pusty string, gdy naglowek nie dotarl) - swiadek
# mierzy z tego DLUGOSC, nie tresc, bo tresc to wylacznie litery "A" wygenerowane lokalnie,
# nigdy prawdziwe ciasteczko ani token.
#
# Na koniec sprzata kontenery i siec, takze przy bledzie (pulapka EXIT/INT/TERM/HUP).
#
# Czego ten swiadek NIE mierzy: prawdziwego Cloudflare Access (ciasteczko bramy jest tu
# atrapa taka sama jak reszta), prawdziwych ciasteczek sesji logowania (next-auth), ani
# zachowania samego Next.js (atrapa "frontend" tylko echa naglowki, nie uruchamia appki).
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CADDYFILE="${1:-$TU/../Caddyfile}"

if [[ ! -f "$CADDYFILE" ]]; then
  echo "BLAD: brak pliku Caddyfile: $CADDYFILE" >&2
  exit 2
fi
command -v docker >/dev/null 2>&1 || { echo "BLAD: brak docker" >&2; exit 2; }
command -v openssl >/dev/null 2>&1 || { echo "BLAD: brak openssl" >&2; exit 2; }

# $1 = sciezka hosta (plik albo katalog) -> sciezka w formacie, ktory rozumie silnik Dockera
# na tym hoscie. Na Windows/Git Bash to pwd -W (albo cygpath -w, gdy jest); gdziekolwiek
# indziej (Linux) sciezka absolutna zostaje bez zmian.
sciezka_docker() {
  local p="$1" d b
  d="$(cd "$(dirname "$p")" && pwd)"
  b="$(basename "$p")"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$d/$b" 2>/dev/null && return
  fi
  if (cd "$d" && pwd -W) >/dev/null 2>&1; then
    printf '%s/%s\n' "$(cd "$d" && pwd -W)" "$b"
    return
  fi
  printf '%s/%s\n' "$d" "$b"
}

ZNACZNIK="psywit-$$-$(date +%s)"
SIEC="${ZNACZNIK}-siec"
NAZWA_APP="${ZNACZNIK}-app"
NAZWA_FRONTEND="${ZNACZNIK}-frontend"
NAZWA_CADDY="${ZNACZNIK}-caddy"
DOMENA="psychon-witness.test"

ROBOCZY="/d/tmp/${ZNACZNIK}"
mkdir -p "$ROBOCZY/tls" "$ROBOCZY/app" "$ROBOCZY/frontend"

sprzataj() {
  docker rm -f "$NAZWA_CADDY" "$NAZWA_APP" "$NAZWA_FRONTEND" >/dev/null 2>&1
  docker network rm "$SIEC" >/dev/null 2>&1
  rm -rf "$ROBOCZY" 2>/dev/null
}
trap sprzataj EXIT INT TERM HUP

# Certyfikat samopodpisany na czas testu - zadna prawdziwa domena ani sekret.
# "//CN=..." (podwojny slash), nie "/CN=...": Git Bash/MSYS na Windows tlumaczy pojedynczy
# wiodacy slash na sciezke pliku i psuje -subj; podwojny slash wylacza to tlumaczenie tylko
# dla tego jednego argumentu, bez wplywu na resztę wywolania.
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$ROBOCZY/tls/origin.key" -out "$ROBOCZY/tls/origin.crt" \
  -subj "//CN=$DOMENA" -addext "subjectAltName=DNS:$DOMENA" >/dev/null 2>&1
if [[ ! -s "$ROBOCZY/tls/origin.crt" ]]; then
  echo "BLAD: nie udalo sie wygenerowac certyfikatu testowego" >&2
  exit 2
fi

# Atrapy upstreamu: DOMYSLNA konfiguracja glowna nginx:alpine (buforow naglowkow tu nikt
# nie dotyka - K4 mierzy wlasnie te wartosci domyslne), jedyna zmiana to lokalizacja "/",
# ktora echa dlugosc/tresc odebranych naglowkow Cookie i Authorization.
cat > "$ROBOCZY/app/default.conf" <<'EOF'
server {
    listen 8080;
    location / {
        add_header X-Echo-Cookie "$http_cookie" always;
        add_header X-Echo-Auth "$http_authorization" always;
        return 200 "app\n";
    }
}
EOF
cat > "$ROBOCZY/frontend/default.conf" <<'EOF'
server {
    listen 3000;
    location / {
        add_header X-Echo-Cookie "$http_cookie" always;
        add_header X-Echo-Auth "$http_authorization" always;
        return 200 "frontend\n";
    }
}
EOF

docker network create "$SIEC" >/dev/null

MSYS_NO_PATHCONV=1 docker run -d --name "$NAZWA_APP" --network "$SIEC" --network-alias app \
  -p 127.0.0.1:0:8080 \
  -v "$(sciezka_docker "$ROBOCZY/app/default.conf"):/etc/nginx/conf.d/default.conf:ro" \
  nginx:alpine >/dev/null

MSYS_NO_PATHCONV=1 docker run -d --name "$NAZWA_FRONTEND" --network "$SIEC" --network-alias frontend \
  -v "$(sciezka_docker "$ROBOCZY/frontend/default.conf"):/etc/nginx/conf.d/default.conf:ro" \
  nginx:alpine >/dev/null

MSYS_NO_PATHCONV=1 docker run -d --name "$NAZWA_CADDY" --network "$SIEC" \
  -p 127.0.0.1:0:443 \
  -e STAGING_DOMAIN="$DOMENA" \
  -v "$(sciezka_docker "$CADDYFILE"):/etc/caddy/Caddyfile:ro" \
  -v "$(sciezka_docker "$ROBOCZY/tls"):/etc/caddy/tls:ro" \
  caddy:2-alpine >/dev/null

# Port opublikowany przez docker (host losowy, zeby nie kolidowac z niczym zywym).
port_kontenera() {
  docker port "$1" "$2" 2>/dev/null | tail -1 | sed 's/.*://'
}
PORT_CADDY="$(port_kontenera "$NAZWA_CADDY" 443/tcp)"
PORT_APP="$(port_kontenera "$NAZWA_APP" 8080/tcp)"
if [[ -z "$PORT_CADDY" || -z "$PORT_APP" ]]; then
  echo "BLAD: nie udalo sie odczytac opublikowanych portow (caddy=$PORT_CADDY app=$PORT_APP)" >&2
  exit 2
fi

# Rozgrzewka: kontenery startuja asynchronicznie, wiec pierwsze polaczenia moga dostac
# odmowe albo 502, zanim atrapy i Caddy skoncza starty. Petla ograniczona (max 30 x 0.3 s).
gotowe=0
for _ in $(seq 1 30); do
  if curl -sS -k -o /dev/null --resolve "${DOMENA}:${PORT_CADDY}:127.0.0.1" \
      "https://${DOMENA}:${PORT_CADDY}/api/v1/me" 2>/dev/null; then
    gotowe=1
    break
  fi
  sleep 0.3
done
if [[ "$gotowe" -ne 1 ]]; then
  echo "BLAD: caddy/atrapy nie wstaly w wyznaczonym czasie" >&2
  exit 2
fi

# Generuje N bajtow litery "A" - dane fikcyjne, nigdy prawdziwe ciasteczko.
gen() { head -c "$1" /dev/zero | tr '\0' 'A'; }
COOKIE_8300="$(gen 8300)"
COOKIE_7900="$(gen 7900)"
COOKIE_4000="$(gen 4000)"
AUTH_ATRAPA="Bearer CANARY-ATRAPA-TOKENU-NIE-PRAWDZIWY"

# $1=plik naglowkow odpowiedzi, $2=nazwa naglowka -> wartosc (pusty string gdy brak/pusty)
naglowek_wartosc() {
  awk -v n="$2" '
    BEGIN { IGNORECASE = 1; szukany = tolower(n) ": " }
    { linia = $0; sub(/\r$/, "", linia); dolna = tolower(linia)
      if (index(dolna, szukany) == 1) { print substr(linia, length(n) + 3); found = 1; exit } }
    END { if (!found) print "" }
  ' "$1"
}

STATUS=""
NAGLOWKI="$ROBOCZY/resp-headers"

# $1=sciezka, $2=cookie (albo ""), $3=authorization (albo "")
zapytaj_caddy() {
  local path="$1" cookie="$2" auth="$3"
  local -a args=(-sS -k -o /dev/null -D "$NAGLOWKI" -w '%{http_code}' \
    --resolve "${DOMENA}:${PORT_CADDY}:127.0.0.1")
  [[ -n "$cookie" ]] && args+=(-H "Cookie: $cookie")
  [[ -n "$auth" ]] && args+=(-H "Authorization: $auth")
  args+=("https://${DOMENA}:${PORT_CADDY}${path}")
  STATUS="$(curl "${args[@]}")"
}

# $1=cookie (nigdy "")
zapytaj_app_bezposrednio() {
  local cookie="$1"
  curl -sS -o /dev/null -w '%{http_code}' \
    -H "Cookie: $cookie" \
    "http://127.0.0.1:${PORT_APP}/api/v1/me"
}

# Dwa liczniki osobno: 6 przypadkow z opisu zlecenia (K1 mowi o nich "6/6") i osobno
# kontrola K4 (atrapa app ma domyslne bufory) - K1 i K4 sa oddzielnymi kryteriami, wiec
# raport ponizej podaje obie liczby osobno, a kod wyjscia jest 0 tylko gdy OBIE sa zerowe.
NIEZALICZONE=0
NIEZALICZONE_K4=0
wynik() {
  # $1=nazwa, $2=0 (ok) / 1 (zle), $3=nazwa licznika (glowny|k4, domyslnie glowny)
  if [[ "$2" -eq 0 ]]; then
    echo "  WYNIK: ZALICZONY"
  else
    echo "  WYNIK: NIEZALICZONY"
    if [[ "${3:-glowny}" == "k4" ]]; then
      NIEZALICZONE_K4=$((NIEZALICZONE_K4 + 1))
    else
      NIEZALICZONE=$((NIEZALICZONE + 1))
    fi
  fi
}

echo "=== 1 /api/v1/me z ciasteczkiem 8300 B: nie 400, app widzi Cookie dlugosci 0 ==="
zapytaj_caddy "/api/v1/me" "$COOKIE_8300" ""
DL="$(naglowek_wartosc "$NAGLOWKI" "X-Echo-Cookie" | tr -d '\n' | wc -c)"
echo "  status=$STATUS dlugosc_cookie_u_app=$DL"
ZLE=0
[[ "$STATUS" == "400" ]] && ZLE=1
[[ "$DL" -ne 0 ]] && ZLE=1
wynik "1" "$ZLE"

echo "=== 2 /api/v1/me z ciasteczkiem 4000 B: app widzi Cookie dlugosci 0 ==="
zapytaj_caddy "/api/v1/me" "$COOKIE_4000" ""
DL="$(naglowek_wartosc "$NAGLOWKI" "X-Echo-Cookie" | tr -d '\n' | wc -c)"
echo "  status=$STATUS dlugosc_cookie_u_app=$DL"
ZLE=0
[[ "$DL" -ne 0 ]] && ZLE=1
wynik "2" "$ZLE"

echo "=== 3 /storage/plik z ciasteczkiem 4000 B: app widzi Cookie dlugosci 0 ==="
zapytaj_caddy "/storage/plik" "$COOKIE_4000" ""
DL="$(naglowek_wartosc "$NAGLOWKI" "X-Echo-Cookie" | tr -d '\n' | wc -c)"
echo "  status=$STATUS dlugosc_cookie_u_app=$DL"
ZLE=0
[[ "$DL" -ne 0 ]] && ZLE=1
wynik "3" "$ZLE"

echo "=== 4 /api/v1/me z Authorization: app widzi Authorization niepusty ==="
zapytaj_caddy "/api/v1/me" "" "$AUTH_ATRAPA"
DL="$(naglowek_wartosc "$NAGLOWKI" "X-Echo-Auth" | tr -d '\n' | wc -c)"
echo "  status=$STATUS dlugosc_auth_u_app=$DL"
ZLE=0
[[ "$DL" -eq 0 ]] && ZLE=1
wynik "4" "$ZLE"

echo "=== 5 /api/auth/session z ciasteczkiem 4000 B: frontend widzi Cookie dlugosci >= 4000 ==="
zapytaj_caddy "/api/auth/session" "$COOKIE_4000" ""
DL="$(naglowek_wartosc "$NAGLOWKI" "X-Echo-Cookie" | tr -d '\n' | wc -c)"
echo "  status=$STATUS dlugosc_cookie_u_frontend=$DL"
ZLE=0
[[ "$DL" -lt 4000 ]] && ZLE=1
wynik "5" "$ZLE"

echo "=== 6 /logowanie z ciasteczkiem 4000 B: frontend widzi Cookie dlugosci >= 4000 ==="
zapytaj_caddy "/logowanie" "$COOKIE_4000" ""
DL="$(naglowek_wartosc "$NAGLOWKI" "X-Echo-Cookie" | tr -d '\n' | wc -c)"
echo "  status=$STATUS dlugosc_cookie_u_frontend=$DL"
ZLE=0
[[ "$DL" -lt 4000 ]] && ZLE=1
wynik "6" "$ZLE"

echo
echo "=== K4 kontrolna: atrapa app ma domyslne bufory nginx (bezposrednio, z pominieciem Caddy) ==="
S8300="$(zapytaj_app_bezposrednio "$COOKIE_8300")"
echo "  ciasteczko 8300 B bezposrednio do app: status=$S8300 (oczekiwano 400)"
ZLE=0
[[ "$S8300" != "400" ]] && ZLE=1
wynik "K4a (8300 B -> 400)" "$ZLE" "k4"

S7900="$(zapytaj_app_bezposrednio "$COOKIE_7900")"
echo "  ciasteczko 7900 B bezposrednio do app: status=$S7900 (oczekiwano NIE 400)"
ZLE=0
[[ "$S7900" == "400" ]] && ZLE=1
wynik "K4b (7900 B -> nie 400)" "$ZLE" "k4"

echo
echo "przypadki 1-6: $((6 - NIEZALICZONE))/6 zaliczone"
echo "kontrola K4 (bufory atrapy app): $((2 - NIEZALICZONE_K4))/2 zaliczone"
if [[ "$NIEZALICZONE" -eq 0 && "$NIEZALICZONE_K4" -eq 0 ]]; then
  echo "SWIADEK WEJSCIA BEZ CIASTECZEK: WSZYSTKIE ZALICZONE"
  exit 0
else
  echo "SWIADEK WEJSCIA BEZ CIASTECZEK: NIEZALICZONE PRZYPADKI GLOWNE: $NIEZALICZONE, K4: $NIEZALICZONE_K4"
  exit 1
fi
