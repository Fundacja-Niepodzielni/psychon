#!/usr/bin/env bash
# Swiadek: sondy zdrowia czterech kontenerow, ktore dotad nie mialy zadnej,
# NAPRAWDE czerwienieja, gdy proces przestaje dzialac - i wracaja do zieleni,
# gdy wraca.
#
# Sonda, ktora nie potrafi sie zaczerwienic, nie jest sonda. Dlatego kazdy
# przypadek ma pare: najpierw zielen, potem zaburzenie (SIGSTOP na proces w
# kontenerze), potem pomiar CZASU do czerwieni, potem SIGCONT i powrot.
# Granica: **60 sekund** od zaburzenia do `unhealthy`.
#
# Polecenia sond nie sa tu przepisane recznie - sa WYCIAGANE Z PLIKOW COMPOSE
# tuz przed biegiem. Inaczej swiadek mierzylby swoja kopie tekstu, a nie ten
# tekst, ktory pojedzie na maszyne.
#
# Czego ten swiadek NIE mierzy, i nie udaje, ze mierzy:
#   - prawdziwego obrazu backendu (serversideup/php): przypadek workera stoi na
#     PODSTAWIONYM procesie, ktorego wiersz polecenia niesie to samo slowo
#     szukane. Mierzy wiec mechanizm sondy, nie drzewo procesow tamtego obrazu;
#     czy w tamtym obrazie proces workera jest widoczny w /proc - to pomiar z
#     maszyny, po wdrozeniu, i jest nazwany NIEZMIERZONYM tutaj;
#   - zawieszenia logicznego (proces zyje, nie robi nic): zadna z tych sond
#     tego nie widzi i nie ma tu przypadku, ktory by to udawal;
#   - prawdziwego obrazu frontu: przypadek frontu stoi na node:22-alpine z
#     malym serwerem, bo mierzonym ryzykiem jest to, czy POLECENIE sondy dziala
#     w tej bazie obrazu, a nie to, czy Next.js wstaje.
#
# Kody: 0 wszystkie przypadki zielone, 1 ktorys czerwony, 2 nie da sie zmierzyc.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KORZEN="$(cd "$TU/../../.." && pwd)"
COMPOSE_BAZA="$KORZEN/docker-compose.yml"
COMPOSE_DEV="$KORZEN/docker-compose.psychon-dev.yml"
CADDYFILE="$TU/../Caddyfile"

GRANICA_SEKUND="${GRANICA_SEKUND:-60}"

for p in "$COMPOSE_BAZA" "$COMPOSE_DEV" "$CADDYFILE"; do
  [[ -f "$p" ]] || { echo "BLAD: brak pliku $p" >&2; exit 2; }
done
command -v docker >/dev/null 2>&1 || { echo "BLAD: brak docker" >&2; exit 2; }
command -v openssl >/dev/null 2>&1 || { echo "BLAD: brak openssl" >&2; exit 2; }

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

ZNACZNIK="psyzdr-$$-$(date +%s)"
ROBOCZY="/d/tmp/${ZNACZNIK}"
mkdir -p "$ROBOCZY/tls" || { echo "BLAD: nie moge zalozyc katalogu roboczego" >&2; exit 2; }
KONTENERY=()

sprzataj() {
  local k
  for k in "${KONTENERY[@]:-}"; do
    [[ -n "$k" ]] || continue
    docker rm -f "$k" >/dev/null 2>&1
  done
  rm -rf "$ROBOCZY" 2>/dev/null
}
trap sprzataj EXIT INT TERM HUP

ZIELONYCH=0
CZERWONYCH=0
zielony() { ZIELONYCH=$((ZIELONYCH+1)); echo "  ZIELONY: $1"; }
czerwony() { CZERWONYCH=$((CZERWONYCH+1)); echo "  CZERWONY: $1"; }

# --- wyciagniecie polecen sond z plikow compose -----------------------------
# `$$` w pliku compose to zapis literalnego `$` dla silnika compose; tu wraca
# do jednego znaku, bo polecenie idzie prosto do dockera.
sonda_cmd_shell() {
  local plik="$1" slowo="$2" linia
  linia="$(grep -F "$slowo" "$plik" | grep -F 'CMD-SHELL' | head -n1)"
  [[ -n "$linia" ]] || return 1
  printf '%s' "$linia" | sed -e 's/.*"CMD-SHELL", "//' -e 's/"\][[:space:]]*$//' -e 's/\$\$/\$/g'
}
sonda_url() {
  local plik="$1" port="$2"
  grep -F "127.0.0.1:${port}/zdrowie" "$plik" | head -n1 | sed -e 's/.*"\(http:[^"]*\)".*/\1/'
}

SONDA_QUEUE="$(sonda_cmd_shell "$COMPOSE_BAZA" 'queue:work')" \
  || { echo "BLAD: nie znalazlem polecenia sondy workera w $COMPOSE_BAZA" >&2; exit 2; }
SONDA_SCHEDULER="$(sonda_cmd_shell "$COMPOSE_DEV" 'schedule:work')" \
  || { echo "BLAD: nie znalazlem polecenia sondy planisty w $COMPOSE_DEV" >&2; exit 2; }
URL_FRONTU="$(sonda_url "$COMPOSE_DEV" 3000)"
URL_CADDY="$(sonda_url "$COMPOSE_DEV" 2021)"
[[ -n "$URL_FRONTU" && -n "$URL_CADDY" ]] \
  || { echo "BLAD: nie znalazlem adresow sond frontu/wejscia w $COMPOSE_DEV" >&2; exit 2; }

echo "=== polecenia sond wyciagniete z plikow compose ==="
echo "worker:   $SONDA_QUEUE"
echo "planista: $SONDA_SCHEDULER"
echo "front:    $URL_FRONTU"
echo "wejscie:  $URL_CADDY"
echo

# --- pomocnicze: czekanie na stan zdrowia -----------------------------------
# Wypisuje liczbe sekund, ktore uplynely do osiagniecia stanu, albo `NIE-WIEM`.
czekaj_na_stan() {
  local kontener="$1" stan="$2" limit="$3" start teraz obecny
  start="$(date +%s)"
  while :; do
    obecny="$(docker inspect --format '{{.State.Health.Status}}' "$kontener" 2>/dev/null)"
    teraz="$(date +%s)"
    if [[ "$obecny" == "$stan" ]]; then
      printf '%s' "$((teraz - start))"
      return 0
    fi
    if (( teraz - start >= limit )); then
      printf 'NIE-WIEM(ostatni=%s)' "${obecny:-brak}"
      return 1
    fi
    sleep 2
  done
}

# Zaburzenie: zatrzymanie procesu w kontenerze. Nie `docker pause` - ten
# zamraza caly kontener razem z sonda i czerwien wyszlaby z zawieszenia sondy,
# nie z zawieszenia procesu. SIGSTOP trafia w proces, sonda dalej biega.
zatrzymaj() { docker kill -s STOP "$1" >/dev/null 2>&1; }
wznow()     { docker kill -s CONT "$1" >/dev/null 2>&1; }

# $1 nazwa przypadku, $2 kontener
para_zielen_czerwien_zielen() {
  local nazwa="$1" kontener="$2" t
  t="$(czekaj_na_stan "$kontener" healthy 90)"
  if [[ "$t" == NIE-WIEM* ]]; then
    czerwony "$nazwa: sonda nie zapalila sie na zielono w 90 s ($t)"
    docker logs --tail 20 "$kontener" 2>&1 | sed 's/^/    | /'
    return 1
  fi
  zielony "$nazwa: zielen po ${t} s od startu"

  zatrzymaj "$kontener"
  t="$(czekaj_na_stan "$kontener" unhealthy "$GRANICA_SEKUND")"
  if [[ "$t" == NIE-WIEM* ]]; then
    czerwony "$nazwa: po zatrzymaniu procesu sonda NIE zaczerwienila sie w ${GRANICA_SEKUND} s ($t)"
    wznow "$kontener"
    return 1
  fi
  zielony "$nazwa: czerwien po ${t} s od zatrzymania (granica ${GRANICA_SEKUND} s)"

  wznow "$kontener"
  t="$(czekaj_na_stan "$kontener" healthy 90)"
  if [[ "$t" == NIE-WIEM* ]]; then
    czerwony "$nazwa: po wznowieniu procesu sonda nie wrocila do zieleni w 90 s ($t)"
    return 1
  fi
  zielony "$nazwa: powrot do zieleni po ${t} s od wznowienia"
  return 0
}

# --- worker kolejki: sonda workera (proces podstawiony, slowo szukane prawdziwe) --------
echo "--- worker kolejki: sonda workera kolejki (proces podstawiony) ---"
K_WORKER="${ZNACZNIK}-worker"
KONTENERY+=("$K_WORKER")
# `sleep 3000; :` a nie samo `sleep 3000`: powloka z jednym poleceniem zastapila
# by siebie tym poleceniem i slowo szukane znikleoby z wiersza polecenia.
# Trzeci argument staje sie $0 powloki - i to on niesie slowo szukane.
MSYS_NO_PATHCONV=1 docker run -d --name "$K_WORKER" \
  --health-cmd "$SONDA_QUEUE" --health-interval 15s --health-timeout 5s \
  --health-retries 2 --health-start-period 5s \
  alpine:3 sh -c 'sleep 3000; :' 'php artisan queue:work' >/dev/null 2>&1 \
  || { echo "BLAD: nie wystartowal kontener przypadku workera" >&2; exit 2; }
para_zielen_czerwien_zielen "worker kolejki" "$K_WORKER"

# --- planista: ten sam mechanizm, slowo szukane planisty ------------------------
echo "--- planista: sonda planisty (proces podstawiony) ---"
K_PLAN="${ZNACZNIK}-planista"
KONTENERY+=("$K_PLAN")
MSYS_NO_PATHCONV=1 docker run -d --name "$K_PLAN" \
  --health-cmd "$SONDA_SCHEDULER" --health-interval 15s --health-timeout 5s \
  --health-retries 2 --health-start-period 5s \
  alpine:3 sh -c 'sleep 3000; :' 'php artisan schedule:work' >/dev/null 2>&1 \
  || { echo "BLAD: nie wystartowal kontener przypadku planisty" >&2; exit 2; }
para_zielen_czerwien_zielen "planista" "$K_PLAN"

# --- bez procesu: noga przeciwna - sonda workera na kontenerze BEZ workera ---------
# Bez tego przypadku nie wiadomo, czy sonda mierzy proces, czy tylko to, ze
# kontener chodzi.
echo "--- bez procesu: sonda workera tam, gdzie workera nie ma (ma byc czerwono) ---"
K_PUSTY="${ZNACZNIK}-bez-workera"
KONTENERY+=("$K_PUSTY")
MSYS_NO_PATHCONV=1 docker run -d --name "$K_PUSTY" \
  --health-cmd "$SONDA_QUEUE" --health-interval 5s --health-timeout 5s \
  --health-retries 2 --health-start-period 1s \
  alpine:3 sleep 3000 >/dev/null 2>&1 \
  || { echo "BLAD: nie wystartowal kontener przypadku bez procesu" >&2; exit 2; }
T="$(czekaj_na_stan "$K_PUSTY" unhealthy 60)"
if [[ "$T" == NIE-WIEM* ]]; then
  czerwony "bez procesu: sonda workera NIE zaczerwienila sie w kontenerze bez workera ($T)"
else
  zielony "bez procesu: czerwien po ${T} s tam, gdzie workera nie ma"
fi

# --- front: sonda frontu (baza obrazu prawdziwa, serwer podstawiony) ----------
echo "--- front: sonda frontu na node:22-alpine ---"
cat > "$ROBOCZY/serwer.js" <<"JS"
const http = require("http");
http.createServer((req, res) => {
  if (req.url === "/zdrowie") { res.writeHead(200, {"content-type": "text/plain"}); res.end("ok"); return; }
  res.writeHead(404); res.end();
}).listen(3000, "0.0.0.0");
JS
K_FRONT="${ZNACZNIK}-front"
KONTENERY+=("$K_FRONT")
MSYS_NO_PATHCONV=1 docker run -d --name "$K_FRONT" \
  -v "$(sciezka_docker "$ROBOCZY/serwer.js")":/serwer.js:ro \
  --health-cmd "wget -q -O /dev/null $URL_FRONTU" --health-interval 15s --health-timeout 5s \
  --health-retries 2 --health-start-period 5s \
  node:22-alpine node /serwer.js >/dev/null 2>&1 \
  || { echo "BLAD: nie wystartowal kontener przypadku frontu" >&2; exit 2; }
para_zielen_czerwien_zielen "front" "$K_FRONT"

# --- wejscie: sonda wejscia na PRAWDZIWYM pliku Caddyfile ------------------------
echo "--- wejscie: sonda wejscia, prawdziwy plik Caddyfile w caddy:2-alpine ---"
DOMENA="psychon-zdrowie.test"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$ROBOCZY/tls/origin.key" -out "$ROBOCZY/tls/origin.crt" \
  -subj "//CN=$DOMENA" -addext "subjectAltName=DNS:$DOMENA" >/dev/null 2>&1 \
  || { echo "BLAD: nie udalo sie zrobic certyfikatu na czas proby" >&2; exit 2; }
K_CADDY="${ZNACZNIK}-caddy"
KONTENERY+=("$K_CADDY")
MSYS_NO_PATHCONV=1 docker run -d --name "$K_CADDY" \
  -e "STAGING_DOMAIN=$DOMENA" \
  -v "$(sciezka_docker "$CADDYFILE")":/etc/caddy/Caddyfile:ro \
  -v "$(sciezka_docker "$ROBOCZY/tls")":/etc/caddy/tls:ro \
  --health-cmd "wget -q -O /dev/null $URL_CADDY" --health-interval 15s --health-timeout 5s \
  --health-retries 2 --health-start-period 5s \
  caddy:2-alpine >/dev/null 2>&1 \
  || { echo "BLAD: nie wystartowal kontener przypadku wejscia" >&2; exit 2; }
para_zielen_czerwien_zielen "wejscie" "$K_CADDY"

# --- trasa frontu: trasa /zdrowie stoi w drzewie frontu -------------------------------
echo "--- trasa frontu: trasa sondy frontu istnieje w drzewie ---"
if [[ -f "$KORZEN/frontend/app/zdrowie/route.ts" ]]; then
  if grep -q 'force-dynamic' "$KORZEN/frontend/app/zdrowie/route.ts"; then
    zielony "trasa frontu: trasa /zdrowie jest i jest dynamiczna"
  else
    czerwony "trasa frontu: trasa /zdrowie jest, ale bez wymuszenia dynamicznosci"
  fi
else
  czerwony "trasa frontu: brak pliku frontend/app/zdrowie/route.ts - sonda frontu pytalaby o nic"
fi

echo
echo "=== PODSUMOWANIE: zielonych=$ZIELONYCH czerwonych=$CZERWONYCH ==="
[[ "$CZERWONYCH" -eq 0 ]] || exit 1
exit 0
