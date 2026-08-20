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

Wymagane: Docker Desktop, Node.js 20+, git. Pełna instrukcja (w tym rozwiązywanie
problemów): **[docs/hackathon/03-pierwsze-30-minut.md](docs/hackathon/03-pierwsze-30-minut.md)**.
W skrócie:

```bash
bash scripts/setup.sh            # macOS / Linux / WSL2
# lub (Windows):  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
cd frontend && npm run dev       # frontend: http://localhost:3000
```

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
