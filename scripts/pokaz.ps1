# Maszyna pokazowa (staging na sali) — wariant Windows/PowerShell.
# Pobiera aktualny `main`, przebudowuje kontenery i resetuje bazę do seedów demo.
# Uruchamiany wielokrotnie — każde uruchomienie = aktualizacja + reset.
#
# Użycie:  powershell -ExecutionPolicy Bypass -File scripts\pokaz.ps1
# Frontend uruchom raz, osobno:  cd frontend; npm run dev
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "== Pobieram aktualny main =="
git fetch origin main
git checkout main
git reset --hard origin/main

Write-Host "== Przebudowuję kontenery =="
docker compose up -d --build

Write-Host "== Czekam na bazę i resetuję seedy demo =="
for ($i = 0; $i -lt 30; $i++) {
    docker compose exec -T pgsql pg_isready -U niepodzielni *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 2
}
docker compose exec -T app composer install --no-interaction --prefer-dist --no-progress
docker compose exec -T app php artisan migrate:fresh --seed

Write-Host "== Zależności frontu =="
Push-Location frontend
npm ci
Pop-Location

Write-Host ""
Write-Host "Gotowe. Backend: http://localhost:8000 - Mailpit: http://localhost:8025"
Write-Host "Frontend (jeśli nie działa): cd frontend; npm run dev"
