#!/usr/bin/env bash
# Uruchamia świadka dwustronnego trasa<->dokument (backend/scripts/openapi-swiadek.php):
# świeży `route:list --path=api --json` przeciw zatwierdzonemu `backend/openapi.json`.
# `route:list` nie potrzebuje żywej bazy - w przeciwieństwie do
# `scripts/generuj-openapi.sh`, ten skrypt NIE zakłada kontenera.
#
# Uzycie:
#   bash scripts/swiadek-openapi.sh                     # pomiar zwykly
#   bash scripts/swiadek-openapi.sh --usun-trase "GET /v1/lessons/{id}"   # kontrola dodatnia
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2   # -> backend/

TMP_TRASY="$(mktemp)"
trap 'rm -f "$TMP_TRASY"' EXIT

php artisan route:list --path=api --json > "$TMP_TRASY" 2>&1 || {
    echo "[SWIADEK-OPENAPI] ODMOWA: route:list padl." >&2
    cat "$TMP_TRASY" >&2
    exit 2
}

php scripts/openapi-swiadek.php "$TMP_TRASY" openapi.json "$@"
