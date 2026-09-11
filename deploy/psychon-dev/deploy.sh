#!/usr/bin/env bash
# Wdrozenie srodowiska odbiorczego psychon-dev na hoscie Fundacji.
#
# Rozni sie od deploy/oracle/deploy.sh trzema rzeczami:
#   1. plik srodowiskowy lezy POZA repozytorium (/opt/psychon/.env, prawa 600),
#   2. nie ma etykiet `traefik.enable=false` - nie ma Traefika,
#   3. przed uruchomieniem sprawdza certyfikat Origin CA, bo bez niego Caddy
#      wstaje i natychmiast pada, a przyczyna widoczna jest dopiero w logu.
#
# Skrypt nie tworzy zadnych sekretow. Plik /opt/psychon/.env zaklada czlowiek.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${PSYCHON_ENV_FILE:-/opt/psychon/.env}"
tls_dir="${PSYCHON_TLS_DIR:-/opt/psychon/tls}"
compose=(docker compose --env-file "$env_file" -f docker-compose.yml -f docker-compose.psychon-dev.yml)

cd "$repo_root"

if [[ ! -f "$env_file" ]]; then
  echo "BLAD: brak $env_file. Wzor: deploy/.env.example. Przerywam bez zmian."
  exit 1
fi

# Prawa sprawdzamy, a nie naprawiamy: plik zaklada wlasciciel hosta i to jego
# decyzja, kto go czyta. Ciche `chmod` ukryloby prawdziwy problem.
prawa="$(stat -c %a "$env_file")"
if [[ "$prawa" != "600" ]]; then
  echo "BLAD: $env_file ma prawa $prawa, wymagane 600. Przerywam bez zmian."
  exit 1
fi

for plik in origin.crt origin.key; do
  if [[ ! -s "$tls_dir/$plik" ]]; then
    echo "BLAD: brak $tls_dir/$plik (certyfikat Cloudflare Origin CA). Przerywam bez zmian."
    exit 1
  fi
done

"${compose[@]}" config --quiet

echo "Przygotowuje prywatne wolumeny aplikacji..."
"${compose[@]}" run --rm --no-deps --user 0:0 --entrypoint sh app -lc \
  'mkdir -p vendor storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache && chown -R 33:33 vendor storage bootstrap/cache'

echo "Instaluje zaleznosci backendu..."
"${compose[@]}" run --rm --no-deps app \
  composer install --no-interaction --no-dev --prefer-dist --no-progress --optimize-autoloader

echo "Buduje frontend..."
"${compose[@]}" build frontend

echo "Uruchamiam uslugi..."
"${compose[@]}" up -d pgsql redis mailpit
# Frontend powstaje jako niezmienny obraz, wiec dzialajacy kontener zachowuje
# kompletny poprzedni build az do chwili pomyslnego utworzenia nowego obrazu.
# Procesy Laravel sa odtwarzane, zeby workery i OPcache nie trzymaly starego kodu.
"${compose[@]}" up -d --force-recreate app queue scheduler frontend
"${compose[@]}" up -d caddy

echo "Migracje i cache konfiguracji..."
"${compose[@]}" exec -T app php artisan migrate --force
"${compose[@]}" exec -T app php artisan optimize

echo "Status uslug:"
"${compose[@]}" ps

# Swiadek: rozdzial ruchu sprawdzamy PRZEZ Caddy, od srodka sieci kontenerow,
# zanim ktokolwiek sprobuje wejsc z zewnatrz. Inaczej pierwszym przyrzadem
# bylaby przegladarka za Cloudflare Access, czyli trzy warstwy naraz.
echo "Swiadek rozdzialu ruchu (przez Caddy, wewnatrz sieci):"
domena="$(grep -E '^STAGING_DOMAIN=' "$env_file" | cut -d= -f2-)"
# `/api/v1/me` bez tokenu ma zwrocic 401 Z LARAVELA - to dowodzi, ze odpowiedzial
# backend, a nie Next.js (ktory na tej sciezce dalby 404). `/` ma dac 200 z Next.
for sciezka in /api/v1/me /; do
  kod="$("${compose[@]}" exec -T caddy wget -qO /dev/null -S --no-check-certificate \
    --header="Host: $domena" "https://127.0.0.1$sciezka" 2>&1 | awk '/HTTP\//{print $2; exit}')"
  echo "  $sciezka -> ${kod:-BRAK ODPOWIEDZI}"
done

echo "Wdrozenie zakonczone. Nie resetowano bazy ani seedow."
