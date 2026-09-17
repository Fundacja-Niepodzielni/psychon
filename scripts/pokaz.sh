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
# REBUILD_LISTA jest tu JEDYNYM miejscem wpisania tej listy w tym pliku -
# uzywaja jej i `npm rebuild`, i kontrola ponizej. Ta sama wartosc musi
# siedziec w `.github/workflows/ci.yml` (zmienna REBUILD_LISTA) i w
# scripts/setup.sh - trzy pliki, zaden nie umie odczytac listy od drugiego
# bez dodatkowej zaleznosci (parser YAML w bashu), wiec kazdy pilnuje
# siebie osobno wobec tego samego zrodla prawdy: package-lock.json.
REBUILD_LISTA="esbuild unrs-resolver fsevents"
(
  cd frontend
  npm ci --ignore-scripts
  npm rebuild $REBUILD_LISTA
  REBUILD_LISTA="$REBUILD_LISTA" node -e '
    const fs = require("fs");
    const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
    const found = new Set();
    for (const [p, info] of Object.entries(lock.packages || {})) {
      if (info && info.hasInstallScript) found.add(p.split("node_modules/").pop());
    }
    const expected = new Set((process.env.REBUILD_LISTA || "").trim().split(/\s+/).filter(Boolean));
    const a = [...found].sort().join(",");
    const b = [...expected].sort().join(",");
    if (a !== b) {
      console.error("Rozjazd: hasInstallScript w package-lock.json = [" + a + "], REBUILD_LISTA = [" + b + "]. Uaktualnij zmienna REBUILD_LISTA na gorze tego skryptu.");
      process.exit(1);
    }
    console.log("Zgodnosc potwierdzona: " + a);
  '
)

echo
echo "Gotowe. Backend: http://localhost:8000 · Mailpit: http://localhost:8025"
echo "Frontend (jeśli nie działa): cd frontend && npm run dev"
