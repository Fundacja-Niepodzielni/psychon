# Backend — starter hackathonowy (Niepodzielni)

Laravel (PHP 8.4) + PostgreSQL 17 + Redis. Wszystko działa w kontenerach —
PHP na maszynie nie jest potrzebny. Uruchomienie: `scripts/setup.sh` z katalogu
głównego repo (patrz `docs/hackathon/03-pierwsze-30-minut.md`).

```bash
docker compose exec app php artisan test          # testy (osobna baza testowa)
docker compose exec app ./vendor/bin/pint         # autoformat przed PR-em
docker compose exec app php artisan migrate:fresh --seed   # reset bazy do seedów demo
```

## Gdzie co leży

| Co | Gdzie |
|---|---|
| trasy twojego pakietu | `routes/api/hXX.php` — tylko własny plik |
| kontrolery / FormRequesty / Policies | `app/Http/…`, `app/Policies/` (auto-discovery) |
| fasady o zamrożonych sygnaturach | `app/Support/` — `Notify`, `AuditLog`, `Settings`, `CourseAccess`, `ProgressAggregator`, `PdfService`, `Csv` |
| flagi funkcji per pakiet | `config/features.php` |
| trasy publiczne (wyjątki od auth) | `config/public_routes.php` |
| migracje (ZAMROŻONE) i seedy | `database/migrations/`, `database/seeders/` |
| testy | `tests/Feature/` — happy path + odmowa dostępu dla tras z kryteriów |

## Zasady (skrót — pełne w przewodniku §4)

- Kształt odpowiedzi i błędów wyłącznie wg kontraktu (`docs/hackathon/02-kontrakt-api.md`);
  koperta `{data}` / `{error}` jest obsługiwana centralnie — nie buduj własnej.
- Każde żądanie autoryzowane serwerowo (middleware + policy); walidacja przez FormRequest.
- Zdarzenia audytowe i powiadomienia wyłącznie slugami/typami z rejestrów kontraktu §3.
- Migracji nie zmieniasz — potrzebę zgłaszasz strażnikowi schematu.
- Sekrety tylko w `.env`; teksty UI po polsku, kod po angielsku.
