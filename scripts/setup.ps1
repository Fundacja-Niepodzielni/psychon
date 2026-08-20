# Konfiguracja środowiska — Windows (PowerShell). Uruchom z katalogu głównego repo:
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Error "BRAK: zainstaluj Docker Desktop"; exit 1 }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Write-Error "BRAK: zainstaluj Node.js 20+"; exit 1 }

Write-Host "==> Pliki środowiskowe"
if (-not (Test-Path "backend/.env")) { Copy-Item "backend/.env.example" "backend/.env" }
if (-not (Test-Path "frontend/.env.local")) { Copy-Item "frontend/.env.local.example" "frontend/.env.local" }

Write-Host "==> Kontenery (pierwszy raz: pobieranie obrazów, kilka minut)"
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { Write-Error "docker compose up nie powiódł się"; exit 1 }

Write-Host "==> Zależności backendu (composer w kontenerze — nie musisz mieć PHP)"
docker compose exec -T app composer install --no-interaction

Write-Host "==> Klucz aplikacji, migracje, seedy, storage"
docker compose exec -T app php artisan key:generate --force
docker compose exec -T app php artisan migrate --seed --force
docker compose exec -T app php artisan storage:link

Write-Host "==> Zależności frontendu"
Push-Location frontend; npm install; Pop-Location

Write-Host ""
Write-Host "================= GOTOWE ================="
Write-Host "Backend API:   http://localhost:8000"
Write-Host "Frontend:      cd frontend; npm run dev  ->  http://localhost:3000"
Write-Host "Mailpit:       http://localhost:8025   (tu ladatuja wszystkie e-maile)"
Write-Host "Testy:         docker compose exec app php artisan test"
Write-Host ""
Write-Host "Konta demo: marta/ola/filip/joanna @demo.pl (demo1234),"
Write-Host "            opiekun/admin @demo.pl (admin1234)"
Write-Host "=========================================="
