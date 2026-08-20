# Pierwsze 30 minut — od zera do działającego środowiska

Cel: zanim skończy się briefing otwarcia, każdy w zespole ma działającą aplikację
i wie, gdzie co leży.

## Zanim przyjedziesz (zrób w domu — oszczędzisz godzinę na sali)

1. Zainstaluj: **Docker Desktop** (Windows: z backendem WSL2), **Node.js 20+**, **git**.
2. Uruchom Docker Desktop raz, żeby dokończył konfigurację.
3. (Windows) Upewnij się, że wirtualizacja jest włączona w BIOS — najczęstsza przyczyna
   „Docker nie startuje".

## Krok 1 · Zrób fork, sklonuj i odpal setup (~10 min, głównie pobieranie)

Repozytorium jest **publiczne** — nie potrzebujesz żadnych uprawnień ani zaproszenia:
https://github.com/Fundacja-Niepodzielni/psychon

Jedna osoba z zespołu robi **fork** (przycisk „Fork" na GitHubie) i w swoim forku
dodaje resztę zespołu (Settings → Collaborators). Zespół pracuje na forku,
a gotowe zmiany wysyła jako PR do repozytorium głównego.

```bash
git clone https://github.com/<wasz-fork>/psychon.git niepodzielni && cd niepodzielni
```

(Testujesz w domu przed wydarzeniem? Możesz sklonować wprost repozytorium główne —
fork będzie potrzebny dopiero do wysłania PR-a.)

macOS / Linux / WSL2:

```bash
bash scripts/setup.sh
```

Windows (PowerShell):

```bash
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

Skrypt: skopiuje pliki `.env`, postawi kontenery (PostgreSQL, Redis, Mailpit, backend),
zainstaluje zależności composera **w kontenerze** (nie musisz mieć PHP), wykona
migracje + seedy i zainstaluje paczki frontu.

## Krok 2 · Uruchom front i zaloguj się (~5 min)

```bash
cd frontend && npm run dev
```

- Frontend: http://localhost:3000 → zaloguj się jako `marta@demo.pl` / `demo1234`
- Backend API: http://localhost:8000
- **Mailpit: http://localhost:8025** — tu lądują WSZYSTKIE e-maile z aplikacji
  (nic nie wychodzi w świat); sprawdzaj tu maile powitalne, powiadomienia itd.

Pozostałe konta demo: `ola@demo.pl`, `filip@demo.pl`, `joanna@demo.pl` (`demo1234`),
`opiekun@demo.pl`, `admin@demo.pl` (`admin1234`).

## Krok 3 · Sprawdź, że testy przechodzą (~2 min)

```bash
docker compose exec app php artisan test
```

Zielone? Środowisko gotowe.

## Krok 4 · Pierwszy PR zespołu (~10 min — obowiązkowy, patrz przewodnik §7 H0–H2)

```bash
git checkout -b pakiet/HXX-nazwa
```

Dodajcie linijkę z nazwą zespołu do `TEAMS.md`, wypchnijcie gałąź do swojego forka,
otwórzcie PR do repozytorium głównego (GitHub sam to zaproponuje po wypchnięciu;
szablon podpowie checklistę), poproście sztab o merge. To przećwiczy cały przepływ,
zanim zacznie się prawdziwa praca.

## Gdzie co leży

| Co | Gdzie |
|---|---|
| Twój pakiet: zakres i kryteria | `docs/hackathon/01-pakiety-zadan.md` |
| Kontrakt API (kształt odpowiedzi, błędy) | `docs/hackathon/02-kontrakt-api.md` |
| Reguły biznesowe / model danych / role | `docs/system/` |
| Wzorcowy kontroler + test do kopiowania | `backend/app/...` (patrz README backendu) |
| Komponenty UI i layouty paneli | `frontend/` (design system z makiety) |
| Makieta (jak ma wyglądać ekran) | https://fundacja-niepodzielni.github.io/psychon-makieta/ |

## Najczęstsze problemy

| Objaw | Ratunek |
|---|---|
| `port is already allocated` (5432/8000/8025) | nie edytuj compose — ustaw zmienną przy setupie: `NP_APP_PORT=8010 NP_DB_PORT=55433 NP_MAILPIT_PORT=8026 bash scripts/setup.sh` (i wpisz ten sam adres API do `frontend/.env.local`) |
| Docker na Windows „wisi" | Docker Desktop → Settings → upewnij się, że używa WSL2; restart Dockera |
| wolny frontend na Windows | trzymaj repo w systemie plików WSL2 (`~/projekty/...`), nie na `C:\Users\...` |
| `key:generate` / migracje padły | `docker compose logs app` — najczęściej baza jeszcze wstawała; odpal setup ponownie (jest idempotentny) |
| zepsułem sobie bazę | `docker compose down -v && bash scripts/setup.sh` — czysta baza z seedami od nowa |
| CI czerwone na lint | backend: `docker compose exec app ./vendor/bin/pint` · frontend: `npm run lint -- --fix` |

Utknąłeś dłużej niż 15 minut? Nie walcz w pojedynkę — sztab integracyjny siedzi przy
oznaczonym stole właśnie po to.
