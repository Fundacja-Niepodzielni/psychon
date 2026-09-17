#!/usr/bin/env bash
# Konfiguracja środowiska — macOS / Linux / WSL2. Uruchom z katalogu głównego repo:
#   bash scripts/setup.sh
set -euo pipefail

command -v docker >/dev/null || { echo "BRAK: zainstaluj Docker Desktop"; exit 1; }
command -v npm >/dev/null || { echo "BRAK: zainstaluj Node.js 20+"; exit 1; }

echo "==> Pliki środowiskowe"
[ -f backend/.env ] || cp backend/.env.example backend/.env
[ -f frontend/.env.local ] || cp frontend/.env.local.example frontend/.env.local

echo "==> Kontenery (pierwszy raz: pobieranie obrazów, kilka minut)"
docker compose up -d --wait

echo "==> Zależności backendu (composer w kontenerze — nie musisz mieć PHP)"
docker compose exec -T app composer install --no-interaction

echo "==> Klucz aplikacji, migracje, seedy, storage"
docker compose exec -T app php artisan key:generate --force
docker compose exec -T app php artisan migrate --seed --force
docker compose exec -T app php artisan storage:link || true

echo "==> Zależności frontendu"
# `--ignore-scripts` blokuje dowolny kod z postinstall cudzych paczek.
# Nie na slepo: `esbuild` i `unrs-resolver` maja "hasInstallScript" w
# package-lock.json, a ich postinstall tylko dobiera wlasciwy natywny plik
# binarny z wlasnych optionalDependencies - bez niego `npm run build` i lint
# padaja. Rebuild wylacznie tych dwoch (plus `fsevents`, macOS-only).
(cd frontend && npm install --ignore-scripts && npm rebuild esbuild unrs-resolver fsevents)

APP_PORT="${NP_APP_PORT:-8000}"; MAILPIT_PORT="${NP_MAILPIT_PORT:-8025}"
cat <<EOT

================= GOTOWE =================
Backend API:   http://localhost:${APP_PORT}
Frontend:      cd frontend && npm run dev  ->  http://localhost:3000
Mailpit:       http://localhost:${MAILPIT_PORT}   (tu lądują wszystkie e-maile)
Testy:         docker compose exec app php artisan test

Konta demo (SSO Konta Niepodzielni — bez haseł, powiąż komendą operatora):
  marta@demo.pl    wolontariuszka w trakcie programu
  ola@demo.pl      absolwentka (certyfikat, profil)
  filip@demo.pl    student
  joanna@demo.pl   psycholożka prowadząca
  opiekun@demo.pl  opiekunka projektu
  admin@demo.pl    super admin

  docker compose exec app php artisan psychon:sso-powiaz {id} {sub}
==========================================
EOT
