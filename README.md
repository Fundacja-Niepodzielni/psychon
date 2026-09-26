# Platforma szkoleniowa Fundacji Niepodzielni

Platforma programu rozwojowego dla psychologów-wolontariuszy Fundacji Niepodzielni.
Startuje na hackathonie (~80 osób · 24 godziny), a po wydarzeniu jest rozwijana dalej —
zasady pracy w tym repozytorium istnieją po to, żeby kod z hackathonu wszedł do
produktu i służył uczestniczkom programu.

Repozytorium jest **publiczne**: klonujesz bez żadnych uprawnień, a zmiany wysyłasz
jako pull request z własnego forka (jeden fork na zespół).

## Uczestniczysz w hackathonie? Zacznij tutaj

1. **[Pierwsze 30 minut](docs/hackathon/03-pierwsze-30-minut.md)** — fork, uruchomienie
   środowiska, logowanie, pierwszy PR. Zrób to w domu przed wydarzeniem.
2. **[Przewodnik hackathonu](docs/hackathon/00-przewodnik.md)** — zasady twarde,
   przepływ pracy, Definition of Done, rytm 24 godzin.
3. **[Pakiety zadań](docs/hackathon/01-pakiety-zadan.md)** — twój zespół realizuje jeden
   pakiet: zakres, ekrany, endpointy i kryteria akceptacji.
4. **[Kontrakt API](docs/hackathon/02-kontrakt-api.md)** — źródło prawdy o kształcie
   HTTP; buduj wyłącznie zgodnie z nim.
5. **[Dane demonstracyjne](docs/hackathon/04-seed-demo.md)** — konta demo i liczby,
   na których oparte są kryteria akceptacji.
6. Reguły biznesowe, model danych i role:
   **[docs/system/](docs/system/00-wprowadzenie-i-slownik.md)**.
7. Wygląd i zachowanie ekranów definiuje **klikalna makieta**:
   https://fundacja-niepodzielni.github.io/psychon-makieta/
   (konta demo wypisane pod formularzem logowania).

## Uruchomienie środowiska

Wymagane: Docker Desktop (**uruchomiony**), Node.js 20+, git. Pełna instrukcja (w tym
rozwiązywanie problemów): **[docs/hackathon/03-pierwsze-30-minut.md](docs/hackathon/03-pierwsze-30-minut.md)**.
Pomiar tej instrukcji z czystego pobrania: [docs/uruchomienie-pomiar.md](docs/uruchomienie-pomiar.md).
W skrócie (z katalogu głównego repozytorium):

```bash
bash scripts/setup.sh --sprawdz  # tylko sprawdzenia wstępne, niczego nie zmienia
bash scripts/setup.sh            # macOS / Linux / WSL2
# lub (Windows):  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1   (-Sprawdz = tylko sprawdzenia)
cd frontend && npm run dev       # frontend: http://localhost:3000
```

Co robi skrypt, po kolei (oba skrypty w tej samej kolejności):

1. Sprawdzenia wstępne: katalog główny repozytorium, `docker`, `docker compose`, działający
   demon Dockera, `node` w wersji 20+, `npm`. Brak czegokolwiek = komunikat `BRAK: …`
   i kod wyjścia 1, zanim cokolwiek zostanie zmienione.
2. Kopiuje pliki przykładowe konfiguracji (`backend/.env.example`, `frontend/.env.local.example`)
   pod nazwy bez `.example` — tylko jeśli kopii jeszcze nie ma.
3. `docker compose up -d --wait` — PostgreSQL, Redis, Mailpit, backend, worker kolejek.
4. `composer install` w kontenerze `app` (PHP na komputerze nie jest potrzebne).
5. `php artisan key:generate`, `migrate --seed`, `storage:link` w kontenerze `app`.
6. Zależności frontendu: `setup.sh` — `npm install --ignore-scripts`, `npm rebuild` trzech
   paczek z listy `REBUILD_LISTA` i kontrola tej listy z `package-lock.json`;
   `setup.ps1` — zwykłe `npm install`.

Po kroku 6 `git status` może pokazać zmieniony `frontend/package-lock.json` (npm 10 usuwa
z niego pola `libc`); tej zmiany nie dołączaj do swojego PR-a.

Logowanie: wyłącznie przez Konta Niepodzielni (SSO), bez haseł. Konto demo wiążesz komendą
`docker compose exec app php artisan psychon:sso-powiaz {id} {sub}` — listę kont wypisuje
skrypt na końcu.

### Wartości konfiguracji — dwie drogi

**(a) Kopia pliku przykładowego.** Skrypt tworzy kopie w kroku 2; wartości zmieniasz w kopii.
Kopie są ignorowane przez git.

**(b) Wartości w środowisku procesu, z pliku poza repozytorium.** Dla stacji, na których
nie wolno wydać polecenia z nazwą pliku konfiguracji w treści. Plik (ten sam format
`NAZWA=wartość` co plik przykładowy) leży poza repozytorium, a jego ścieżkę podajesz
w zmiennej `PLIK_PRZYRZADU`; przed uruchomieniem ładujesz go do środowiska procesu:

```bash
export PLIK_PRZYRZADU="$HOME/konfiguracja/psychon-frontend"   # ścieżka przykładowa
set -a; . "$PLIK_PRZYRZADU"; set +a
cd frontend && npm run dev
```

```powershell
$env:PLIK_PRZYRZADU = "$HOME\konfiguracja\psychon-frontend"   # ścieżka przykładowa
Get-Content $env:PLIK_PRZYRZADU | Where-Object { $_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$' } |
  ForEach-Object { Set-Item "env:$($Matches[1])" $Matches[2] }
```

Frontend (Next.js) bierze wartość ze środowiska procesu przed wartością z kopii pliku.
Granica drogi (b): do kontenerów `app` i `queue` środowisko procesu **nie dociera**
(`docker-compose.yml` przekazuje im tylko własną, stałą listę zmiennych), więc backend
uruchomiony w Dockerze czyta konfigurację wyłącznie z kopii z drogi (a).

Backend: http://localhost:8000 · Mailpit (tu lądują wszystkie e-maile — nic nie
wychodzi w świat): http://localhost:8025 · testy:
`docker compose exec app php artisan test`.

## Stack i struktura

Laravel (PHP 8.4) · Next.js (TypeScript, Tailwind 4) · PostgreSQL 17 · Redis ·
Mailpit · docker-compose.

| Katalog | Zawartość |
|---|---|
| `backend/` | API (Laravel): migracje, seedy, auth, fasady, trasy per pakiet |
| `frontend/` | aplikacja (Next.js): design system z makiety, layouty paneli, klient API |
| `docs/hackathon/` | przewodnik, pakiety zadań, kontrakt API, uruchomienie, seed |
| `docs/system/` | specyfikacja: model danych, role, wymagania jakościowe |
| `scripts/` | `setup.sh` / `setup.ps1` (środowisko), `pokaz.sh` / `pokaz.ps1` (maszyna pokazowa) |
| `TEAMS.md` | lista zespołów — dopisujesz się pierwszym PR-em |

## Po hackathonie

Każdy pakiet przechodzi audyt i triage (przyjęty / do poprawek / do przepisania);
to, co przejdzie, staje się bazą dalszego rozwoju platformy. Szczegóły: przewodnik §8.
