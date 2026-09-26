# Konfiguracja środowiska — Windows (PowerShell). Uruchom z katalogu głównego repo:
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1            # pełna konfiguracja
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -Sprawdz   # tylko sprawdzenia wstępne
param([switch]$Sprawdz)
$ErrorActionPreference = "Stop"

function Brak([string]$powod) { [Console]::Error.WriteLine("BRAK: $powod"); exit 1 }

# Sprawdzenia wstępne: każdy brak kończy skrypt czytelnym komunikatem i kodem 1,
# zanim cokolwiek zostanie skopiowane albo uruchomione.
if (-not (Test-Path "docker-compose.yml") -or -not (Test-Path "backend") -or -not (Test-Path "frontend")) {
    Brak "uruchom skrypt z katalogu głównego repozytorium (tam, gdzie leży docker-compose.yml)"
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Brak "zainstaluj Docker Desktop" }
$ErrorActionPreference = "Continue"
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Brak "polecenie 'docker compose' nie działa — zainstaluj Docker Desktop (albo wtyczkę Compose v2)" }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Brak "Docker jest zainstalowany, ale nie działa — uruchom Docker Desktop i poczekaj, aż wystartuje" }
$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Brak "zainstaluj Node.js 20+" }
$nodeWersja = "$(node -v)".Trim()
$nodeGlowna = 0
[void][int]::TryParse($nodeWersja.TrimStart("v").Split(".")[0], [ref]$nodeGlowna)
if ($nodeGlowna -lt 20) { Brak "Node.js 20+ (jest $nodeWersja)" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Brak "npm (instaluje się razem z Node.js 20+)" }
Write-Host "==> Sprawdzenia wstępne: docker, docker compose, demon Dockera, node $nodeWersja, npm — OK"
if ($Sprawdz) { exit 0 }

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

$appPort = if ($env:NP_APP_PORT) { $env:NP_APP_PORT } else { "8000" }
$mailpitPort = if ($env:NP_MAILPIT_PORT) { $env:NP_MAILPIT_PORT } else { "8025" }
Write-Host ""
Write-Host "================= GOTOWE ================="
Write-Host "Backend API:   http://localhost:$appPort"
Write-Host "Frontend:      cd frontend; npm run dev  ->  http://localhost:3000"
Write-Host "Mailpit:       http://localhost:$mailpitPort   (tu lądują wszystkie e-maile)"
Write-Host "Testy:         docker compose exec app php artisan test"
Write-Host ""
Write-Host "Konta demo (SSO Konta Niepodzielni — bez hasel): marta/ola/filip/joanna/opiekun/admin @demo.pl"
Write-Host "            powiaz komenda: docker compose exec app php artisan psychon:sso-powiaz {id} {sub}"
Write-Host "=========================================="
