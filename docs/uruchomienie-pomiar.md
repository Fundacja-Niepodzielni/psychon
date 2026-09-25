# Uruchomienie z czystego pobrania — pomiar instrukcji

Pomiar kryterium „środowisko wstaje z czystego pobrania wg instrukcji, bez czynności
niezapisanych”. Instrukcja: `README.md` (sekcja „Uruchomienie środowiska”),
`scripts/setup.sh`, `scripts/setup.ps1`, oraz `docs/hackathon/03-pierwsze-30-minut.md`,
do którego README odsyła jako do pełnej instrukcji.

- Baza: `sprint-2` @ `3463eac`, czysty klon (`git clone --branch sprint-2`), `git status --porcelain` = 0 wierszy.
- Piaskownica: Linux, klient Dockera jest, **demona Dockera nie ma**, PostgreSQL i Redis nie ma.
- Zasada pracy w pomiarze: plików konfiguracji (kopii plików przykładowych) nie tworzę; krok,
  który je tworzy, jest opisany, a nie wykonany.

## Wersje narzędzi (zmierzone)

| Polecenie | Wynik |
|---|---|
| `node -v` | v22.22.2 |
| `npm -v` | 10.9.7 |
| `php -v` | PHP 8.4.19 (cli) |
| `composer -V` | Composer 2.8.12 |
| `git --version` | 2.43.0 |
| `docker --version` | 29.3.1 (sam klient; `docker info` → brak połączenia z demonem) |
| `docker compose version` | v5.1.1 |
| `bash --version` | 5.2.21 |
| `pwsh -v` | brak w obrazie; do pomiaru `setup.ps1` pobrany PowerShell 7.4.6 (to nie jest Windows PowerShell 5.1) |

## Kroki i wyniki

Wynik: **zgodny z instrukcją** / **wymagał czynności niezapisanej** / **niemożliwy w piaskownicy** / **niewykonany (zasada pracy)**.

| # | Krok (źródło) | Polecenie | Wynik | Zmierzone |
|---|---|---|---|---|
| 1 | Wymagania (README) | Docker Desktop, Node.js 20+, git | niemożliwy w piaskownicy: brak demona Dockera | git, node 22 obecne; klient Dockera obecny |
| 2 | Klon (03, krok 1) | `git clone …` | zgodny z instrukcją | drzewo czyste |
| 3 | Kontrola Dockera (`setup.sh`) | przed: `command -v docker` | wymagał czynności niezapisanej: uruchomienie demona Dockera | przed: kontrola przepuszcza (kod 0) mimo braku demona; skrypt pada dopiero w kroku 6 surowym błędem Dockera. Po zmianie: `docker compose version` i `docker info` w sprawdzeniach wstępnych → `BRAK: Docker jest zainstalowany, ale nie działa…`, kod 1 |
| 4 | Kontrola Node.js (`setup.sh`) | przed: `command -v npm` | wymagał czynności niezapisanej: README wymaga 20+, skrypt wersji nie sprawdzał | po zmianie: `node -v` < 20 → `BRAK: Node.js 20+ (jest …)`, kod 1 |
| 5 | Kopie plików przykładowych (`setup.sh`) | `cp backend/.env.example …`, `cp frontend/.env.local.example …` | niewykonany (zasada pracy) | oba pliki przykładowe istnieją |
| 6 | Kontenery (`setup.sh`) | `docker compose up -d --wait` | niemożliwy w piaskownicy: brak demona | kod 1, „failed to connect to the docker API” |
| 7 | Composer w kontenerze | `docker compose exec -T app composer install --no-interaction` | niemożliwy w piaskownicy: brak demona | kod 1 |
| 8 | Klucz, migracje, seedy, storage | `php artisan key:generate` / `migrate --seed` / `storage:link` w `app` | niemożliwy w piaskownicy: brak demona | — |
| 9 | Paczki frontu | `npm install --ignore-scripts` | wymagał czynności niezapisanej: przywrócenie `frontend/package-lock.json` | kod 0; npm 10.9.7 przepisuje `package-lock.json` (−156 wierszy, pola `libc`), drzewo robocze brudne po setupie. README opisuje to teraz po kroku 6 |
| 10 | Przebudowa trzech paczek | `npm rebuild esbuild unrs-resolver fsevents` | zgodny z instrukcją | kod 0 |
| 11 | Kontrola `REBUILD_LISTA` | skrypt `node -e` z `setup.sh` | zgodny z instrukcją | „Zgodnosc potwierdzona: esbuild,fsevents,unrs-resolver” |
| 12 | Front (README, 03 krok 2) | `cd frontend && npm run dev` | zgodny z instrukcją | „Ready”; `GET /` → 307, `GET /logowanie` → 200 (bez kopii plików konfiguracji) |
| 13 | Logowanie (03, krok 2) | `marta@demo.pl` / hasło | niezgodny z kodem: logowanie wyłącznie SSO | `setup.sh` (podsumowanie) i `AGENTS.md`: bez haseł, wiązanie `psychon:sso-powiaz`; `03-pierwsze-30-minut.md` wciąż podaje hasła — do poprawy poza tym zadaniem. README opisuje teraz logowanie SSO |
| 14 | Wiązanie konta demo | `docker compose exec app php artisan psychon:sso-powiaz {id} {sub}` | niemożliwy w piaskownicy: brak demona | — |
| 15 | Testy (README, 03 krok 3) | `docker compose exec app php artisan test` | niemożliwy w piaskownicy: brak demona i PostgreSQL | — |
| 16 | `setup.ps1` — sprawdzenia wstępne | `pwsh -File scripts/setup.ps1 -Sprawdz` | zgodny z instrukcją (po zmianie) | atrapy narzędzi: komplet → 0; brak Dockera / compose / demona / node 18 / brak npm → 1 z `BRAK:`; prawdziwe narzędzia piaskownicy → `BRAK: Docker … nie działa`, kod 1 |
| 17 | `setup.ps1` — reszta | kroki 5–11 w wersji PowerShell | niemożliwy w piaskownicy: brak demona | — |

## Droga (b): wartości w środowisku procesu (`PLIK_PRZYRZADU`)

| Pomiar | Przed | Po |
|---|---|---|
| bash: liczba zmiennych frontu (`NEXT_PUBLIC_API_URL`, `AUTH_KEYCLOAK_ISSUER`, `AUTH_SECRET`) ustawionych w powłoce po `set -a; . "$PLIK_PRZYRZADU"; set +a` | 0 | 3 |
| te same zmienne widoczne w procesie `node` uruchomionym z tej powłoki | — | 3 |
| PowerShell 7.4.6: fragment z README (`Get-Content … Set-Item env:…`) | 0 | 3 |

- W pomiarze `PLIK_PRZYRZADU` wskazywał plik przykładowy frontu — żaden nowy plik nie powstał.
- Pierwszeństwo w Next.js — odczyt kodu `@next/env` (`processEnv`): wartość z pliku jest brana
  tylko wtedy, gdy klucza nie ma w początkowym `process.env`. Wartość ze środowiska procesu wygrywa z kopią.
- Pierwszeństwo w Laravelu — **niezmierzone**: w piaskownicy `composer install` wypisał samą
  składnię polecenia i nie zainstalował `vendor/`.
- Kontenery: `docker-compose.yml` (usługa `app`, w. 10–12) przekazuje wyłącznie
  `AUTORUN_ENABLED` i `PHP_OPCACHE_ENABLE`. Wartości ze środowiska procesu na hoście nie docierają
  do `app` ani `queue`; backend w Dockerze czyta konfigurację tylko z kopii (droga a). Zmiana
  wymagałaby edycji `docker-compose.yml` — poza zakresem tego zadania.

## Baza prób

`backend/phpunit.xml` (w. 27–33) ustawia współrzędne bazy prób (`DB_CONNECTION`, `DB_HOST`,
`DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_URL`) z `force="true"`. Dopóki to
wymuszenie stoi, **własny kontener bazy nie izoluje biegu prób**: próby łączą się tam, gdzie mówi
`phpunit.xml`, niezależnie od środowiska procesu. Tu tylko zapisane, nie naprawiane. Bazę prób
tworzy `backend/tests/bootstrap.php` (w. 120) — odczyt kodu, niezmierzone.

## Rozbieżności `setup.ps1` wobec `setup.sh` (zachowanie, niezmienione)

Zadanie pozwala zmieniać w skryptach tylko komunikaty i sprawdzenia wstępne, więc poniższe zostaje:

1. Paczki frontu: `setup.ps1` robi zwykłe `npm install` (uruchamia skrypty instalacyjne wszystkich
   paczek); `setup.sh` robi `npm install --ignore-scripts` + `npm rebuild` trzech paczek i kontrolę listy.
2. `storage:link`: w `setup.sh` błąd jest tolerowany (`|| true`), w `setup.ps1` nie.
3. `docker compose exec …` w `setup.ps1` nie sprawdza `$LASTEXITCODE` (sprawdzane jest tylko `docker compose up`).

Poprawione w komunikatach `setup.ps1`: porty w podsumowaniu biorą `NP_APP_PORT` / `NP_MAILPIT_PORT`
(jak `setup.sh`), literówka „ladatuja” → „lądują”.

## Próba sprawdzeń wstępnych

`bash scripts/tests/setup-preflight.sh` — 10 przypadków z atrapami narzędzi na `PATH` + kontrola,
że tryb `--sprawdz` nie zmienia drzewa roboczego.

| | Zgodne | Niezgodne | Kod wyjścia |
|---|---|---|---|
| `setup.sh` z bazy (kontrola negatywna) | 1 | 10 | 1 |
| `setup.sh` po zmianie | 11 | 0 | 0 |

## Do wykonania przez utrzymujących (stacja z Dockerem)

1. `bash scripts/setup.sh` od początku do końca w czystym klonie (kroki 5–11, 14) i czas przebiegu.
2. `docker compose exec app php artisan test` (krok 15) po czystym setupie.
3. `setup.ps1` w Windows PowerShell 5.1 na Windows — pomiar tutaj był w PowerShell 7.4.6 na Linuksie.
4. Pierwszeństwo wartości ze środowiska procesu w Laravelu przy backendzie uruchomionym natywnie.
5. Logowanie SSO na koncie demo po `psychon:sso-powiaz`.
6. Poprawka `docs/hackathon/03-pierwsze-30-minut.md` (hasła demo, krok 13) — plik poza zakresem tego zadania.
