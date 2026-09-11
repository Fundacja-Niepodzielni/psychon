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
# Caddyfile jest montowany jako pojedynczy plik: `git checkout` kladzie nowy
# plik (nowy i-wezel), a dzialajacy kontener dalej widzi stary. Przy
# `admin off` nie ma tez przeladowania z zewnatrz. Samo `up -d` zostawia
# kontener, bo jego definicja sie nie zmienila - tak zmiana tras logowania
# nie weszla przy pierwszym wdrozeniu. Kilka sekund przerwy na 443 to cena.
"${compose[@]}" up -d --force-recreate caddy

echo "Migracje i cache konfiguracji..."
"${compose[@]}" exec -T app php artisan migrate --force
"${compose[@]}" exec -T app php artisan optimize

echo "Status uslug:"
"${compose[@]}" ps

# Swiadek: rozdzial ruchu sprawdzamy PRZEZ Caddy na tym hoscie, zanim
# ktokolwiek sprobuje wejsc z zewnatrz. Inaczej pierwszym przyrzadem bylaby
# przegladarka za Cloudflare Access, czyli trzy warstwy naraz.
# `curl --resolve` laczy sie z 127.0.0.1:443 pod nazwa domeny, czyli z tym
# samym TLS i ta sama nazwa co prawdziwy klient. Pierwsza wersja (`wget` z
# wnetrza kontenera Caddy po adresie IP) laczyla sie bez nazwy w TLS i Caddy
# zrywal polaczenie (alert TLS 80) - na kazdej sciezce "BRAK ODPOWIEDZI", takze
# przy stojacych uslugach. `--retry` przeczekuje 502/503, dopoki uslugi wstaja.
echo "Swiadek rozdzialu ruchu (przez Caddy na 127.0.0.1:443):"
domena="$(grep -E '^STAGING_DOMAIN=' "$env_file" | cut -d= -f2-)"
# `/api/v1/me` bez tokenu ma zwrocic 401 Z LARAVELA - to dowodzi, ze odpowiedzial
# backend, a nie Next.js (ktory na tej sciezce dalby 404). `/` ma dac 200 z Next.
# `/api/auth/providers` ma dac 200 Z NEXT (next-auth) - 404 znaczy, ze `/api/*`
# znow oddal trasy logowania Laravelowi i przycisk "Zaloguj przez Konta" nie dziala.
# Kod HTTP czytamy z `-w`, a nie z kodu wyjscia: oczekiwany wynik `/api/v1/me`
# to 401, a swiadek nie moze przerwac skryptu pod `set -e` - `|| true`.
# `000` znaczy: brak odpowiedzi po wszystkich probach.
for sciezka in /api/v1/me /api/auth/providers /; do
  kod="$(curl -sk --resolve "$domena:443:127.0.0.1" --retry 15 --retry-connrefused --retry-delay 2 \
    --max-time 20 -o /dev/null -w '%{http_code}' "https://$domena$sciezka" || true)"
  echo "  $sciezka -> ${kod:-BRAK ODPOWIEDZI}"
done

echo "Wdrozenie zakonczone. Nie resetowano bazy ani seedow."
