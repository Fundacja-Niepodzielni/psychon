#!/usr/bin/env bash
# Maszyna pokazowa (staging na sali): pobiera aktualny `main`, przebudowuje
# kontenery i resetuje bazę do stanu seedów demo. Uruchamiany wielokrotnie —
# każde uruchomienie = aktualizacja + reset.
#
# Użycie:  bash scripts/pokaz.sh
# Frontend uruchom raz, osobno:  cd frontend && npm run dev
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Pobieram aktualny main =="
git fetch origin main
git checkout main
git reset --hard origin/main

echo "== Przebudowuję kontenery =="
docker compose up -d --build

echo "== Czekam na bazę i resetuję seedy demo =="
for i in $(seq 1 30); do
  docker compose exec -T pgsql pg_isready -U niepodzielni >/dev/null 2>&1 && break
  sleep 2
done
docker compose exec -T app composer install --no-interaction --prefer-dist --no-progress
docker compose exec -T app php artisan migrate:fresh --seed

echo "== Zależności frontu =="
# `--ignore-scripts` blokuje dowolny kod z postinstall cudzych paczek.
# Nie na slepo: `esbuild` i `unrs-resolver` maja "hasInstallScript" w
# package-lock.json, a ich postinstall tylko dobiera wlasciwy natywny plik
# binarny z wlasnych optionalDependencies - bez niego `npm run build` i lint
# padaja. Rebuild wylacznie tych dwoch (plus `fsevents`, macOS-only).
(cd frontend && npm ci --ignore-scripts && npm rebuild esbuild unrs-resolver fsevents)

echo
echo "Gotowe. Backend: http://localhost:8000 · Mailpit: http://localhost:8025"
echo "Frontend (jeśli nie działa): cd frontend && npm run dev"
