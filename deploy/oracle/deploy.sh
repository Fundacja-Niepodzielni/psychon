#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="$repo_root/deploy/oracle/.env"
compose=(docker compose --env-file "$env_file" -f docker-compose.yml -f docker-compose.oracle.yml)

cd "$repo_root"

if [[ ! -f "$env_file" ]]; then
  echo "Brak deploy/oracle/.env. Najpierw uruchom deploy/oracle/bootstrap-server.sh."
  exit 1
fi

"${compose[@]}" config --quiet

echo "Przygotowuję prywatne wolumeny aplikacji..."
"${compose[@]}" run --rm --no-deps --label traefik.enable=false --user 0:0 --entrypoint sh app -lc \
  'mkdir -p vendor storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache && chown -R 33:33 vendor storage bootstrap/cache'

echo "Instaluję zależności backendu..."
"${compose[@]}" run --rm --no-deps --label traefik.enable=false app \
  composer install --no-interaction --no-dev --prefer-dist --no-progress --optimize-autoloader

echo "Buduję frontend..."
"${compose[@]}" build frontend

echo "Uruchamiam usługi Psychon..."
"${compose[@]}" up -d pgsql redis mailpit
# Frontend powstaje jako niezmienny obraz, więc działający kontener zachowuje
# kompletny poprzedni build aż do chwili pomyślnego utworzenia nowego obrazu.
# Procesy Laravel są odtwarzane, aby workery i OPcache nie trzymały starego kodu.
"${compose[@]}" up -d --force-recreate app queue scheduler frontend

echo "Uruchamiam migracje i cache konfiguracji..."
"${compose[@]}" exec -T app php artisan migrate --force
"${compose[@]}" exec -T app php artisan optimize

echo "Status usług:"
"${compose[@]}" ps

echo "Wdrożenie zakończone. Nie resetowano istniejącej bazy ani seedów."
