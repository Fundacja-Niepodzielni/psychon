#!/usr/bin/env bash
# Konfiguracja środowiska — macOS / Linux / WSL2. Uruchom z katalogu głównego repo:
#   bash scripts/setup.sh             # sprawdzenia wstępne + pełna konfiguracja
#   bash scripts/setup.sh --sprawdz   # tylko sprawdzenia wstępne, niczego nie zmienia
set -euo pipefail

brak() { echo "BRAK: $1" >&2; exit 1; }

# Sprawdzenia wstępne: każdy brak kończy skrypt czytelnym komunikatem i kodem 1,
# zanim cokolwiek zostanie skopiowane albo uruchomione.
[ -f docker-compose.yml ] && [ -d backend ] && [ -d frontend ] \
  || brak "uruchom skrypt z katalogu głównego repozytorium (tam, gdzie leży docker-compose.yml)"
command -v docker >/dev/null || brak "zainstaluj Docker Desktop"
docker compose version >/dev/null 2>&1 || brak "polecenie 'docker compose' nie działa — zainstaluj Docker Desktop (albo wtyczkę Compose v2)"
docker info >/dev/null 2>&1 || brak "Docker jest zainstalowany, ale nie działa — uruchom Docker Desktop i poczekaj, aż wystartuje"
command -v node >/dev/null || brak "zainstaluj Node.js 20+"
NODE_WERSJA="$(node -v)"; NODE_GLOWNA="${NODE_WERSJA#v}"; NODE_GLOWNA="${NODE_GLOWNA%%.*}"
[ "$NODE_GLOWNA" -ge 20 ] 2>/dev/null || brak "Node.js 20+ (jest $NODE_WERSJA)"
command -v npm >/dev/null || brak "npm (instaluje się razem z Node.js 20+)"
echo "==> Sprawdzenia wstępne: docker, docker compose, demon Dockera, node $NODE_WERSJA, npm — OK"
if [ "${1:-}" = "--sprawdz" ]; then exit 0; fi

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
# REBUILD_LISTA jest tu JEDYNYM miejscem wpisania tej listy w tym pliku -
# uzywaja jej i `npm rebuild`, i kontrola ponizej. Ta sama wartosc musi
# siedziec w `.github/workflows/ci.yml` (zmienna REBUILD_LISTA) i w
# scripts/pokaz.sh - trzy pliki, zaden nie umie odczytac listy od drugiego
# bez dodatkowej zaleznosci (parser YAML w bashu), wiec kazdy pilnuje
# siebie osobno wobec tego samego zrodla prawdy: package-lock.json.
REBUILD_LISTA="esbuild unrs-resolver fsevents"
(
  cd frontend
  npm install --ignore-scripts
  read -ra REBUILD_ARR <<< "$REBUILD_LISTA"
  npm rebuild "${REBUILD_ARR[@]}"
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
