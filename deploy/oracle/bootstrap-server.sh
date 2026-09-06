#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="$repo_root/deploy/oracle/.env"

cd "$repo_root"

if ! docker network inspect n8n_traefik >/dev/null 2>&1; then
  echo "Brak wymaganej sieci Docker n8n_traefik. Przerywam bez zmian."
  exit 1
fi

if [[ ! -f "$env_file" ]]; then
  umask 077
  db_password="$(openssl rand -hex 32)"
  app_key="base64:$(openssl rand -base64 32)"

  {
    echo "STAGING_DOMAIN=psychon.mgmurski.pl"
    echo "DB_DATABASE=niepodzielni"
    echo "DB_USERNAME=niepodzielni"
    echo "DB_PASSWORD=$db_password"
    echo "APP_KEY=$app_key"
    echo "NP_MAILPIT_PORT=8025"
  } > "$env_file"

  echo "Utworzono chroniony plik deploy/oracle/.env."
else
  echo "Plik deploy/oracle/.env już istnieje — nie nadpisuję sekretów."
fi

chmod 600 "$env_file"

echo "Konfiguracja Compose:"
docker compose \
  --env-file "$env_file" \
  -f docker-compose.yml \
  -f docker-compose.oracle.yml \
  config --quiet

echo "Bootstrap zakończony. Aplikacja nie została jeszcze uruchomiona."
