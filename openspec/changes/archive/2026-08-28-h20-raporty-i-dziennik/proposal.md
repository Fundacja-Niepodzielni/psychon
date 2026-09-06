## Why

Pakiet H20 (Raporty i widoki dziennika działań) jest zaimplementowany na branchu
`pakiet/H20-raporty-i-widoki-dziennika-działan` — backend, frontend i testy zielone
lokalnie (patrz `DEMO/H20.md`), branch jeszcze nie scalony do `main`. Ta zmiana
dokumentuje zaprojektowane i zbudowane zachowanie przed otwarciem Pull Requestu, zgodnie
z `docs/hackathon/06-workflow-pakietu-i-pr.md` §4 („Zamknięcie zmiany OpenSpec"). Cel
pakietu: liczby do grantu z platformy (raport edycji) oraz jawny, tylko-do-odczytu
dziennik działań administracji — oba już zapisane w `docs/hackathon/01-pakiety-zadan.md`
i `02-kontrakt-api.md` §2/§3.2.

## What Changes

- **`reports-and-audit-log`** — nowa zdolność: `GET /admin/report` (+ `export.csv`) —
  raport edycji (osoby przyjęte/aktywne/ukończone, suma i średnia godzin stażu,
  konsultacje, certyfikaty, zestawienie imienne) oraz `GET /admin/audit` (+
  `export.csv`) — dziennik działań tylko do odczytu, filtrowany po `action` (wyłącznie
  slugi z rejestru kontraktu §3.2), `user_id` (aktor), `from`/`to`. Zero tras
  modyfikacji `/admin/audit/*` — nie są nigdzie rejestrowane, więc każda próba
  PATCH/PUT/DELETE/POST kończy się naturalnym 404 Laravela.
- Liczniki `active`/`completed`/`certificates_issued` w raporcie wołają wprost
  `App\Services\H19\DashboardSummary::build()` (pulpit, H19, `DONE`) zamiast liczyć te
  same zapytania `COUNT` drugi raz — równość z pulpitem (kryterium ★1) jest
  gwarantowana przez wspólny kod, nie przez „policzone tak samo". Godziny/konsultacje
  per osoba używają tych samych kolumn co `ProgressAggregator`
  (`internship_entries.hours`/`.consultations_count`, status `accepted`).
- Oba eksporty CSV (raport, dziennik) używają wyłącznie startowego, zamrożonego helpera
  `App\Support\Csv::download()` (BOM + `;`) — H20 nie tworzy własnego formatowania CSV.
- Frontend: `#/admin/raport` (kafelki podsumowania, zestawienie imienne, eksport CSV,
  wydruk przez `window.print()` + warianty Tailwind `print:`) i `#/admin/dziennik`
  (filtry, tabela, paginacja, eksport CSV); obie strony dziedziczą strażnik roli
  `RequireRole` z H02 (już owija cały `admin/layout.tsx`), więc ręczne wejście spoza
  roli administracyjnej pokazuje ekran 403, nie surowy błąd API.
- **Wymuszona poprawka w cudzym pliku:** `tests/Feature/PermissionMatrix/PermissionMatrixTest.php`
  (H02, `DONE`, scalone) zakładał, że żadna trasa `/admin/audit` nie istnieje, testując
  `POST /admin/audit` (bez id) jako oczekujące 404. Odkąd H20 rejestruje
  `GET /admin/audit`, ten sam `POST` trafia w 405 (zła metoda na istniejącej trasie), nie
  404 — test zaczął czerwienić się z powodu tej, kontraktowo poprawnej, zmiany. Wiersz
  poprawiono na podścieżkę z id (`/admin/audit/1`, bez żadnej zarejestrowanej metody),
  identycznie jak we własnym teście H20. Bez tej jednolinijkowej poprawki pełny
  `php artisan test` jest czerwony dla każdego, kto zbuduje na tym branchu.

## Capabilities

### New Capabilities

- `reports-and-audit-log`: raport edycji (liczby zgodne z pulpitem i kartą osoby) oraz
  dziennik działań tylko do odczytu z filtrami po rejestrze audytu; oba z eksportem CSV
  wspólnym helperem.

### Modified Capabilities

Brak. `reports-and-audit-log` nie istniała wcześniej w `openspec/specs/`.

## Impact

- Nowe pliki backendu: `app/Services/H20/ReportSummary.php`,
  `app/Queries/AdminAuditQuery.php`, `app/Http/Requests/H20/AuditIndexRequest.php`,
  `app/Http/Resources/AuditLogEntryResource.php`,
  `app/Http/Controllers/Api/V1/Admin/{ReportController,AuditController}.php`,
  `tests/Feature/H20/{ReportTest,AuditTest}.php`; zmienione: `routes/api/h20.php`.
- Nowe pliki frontendu: `components/h20/{ReportView,AuditLogView}.tsx`,
  `lib/h20/labels.ts`, `lib/menu/admin/h20-{raport,dziennik}.ts`,
  `app/(administracja)/admin/{raport,dziennik}/page.tsx`; zmienione: `lib/api.ts`
  (nowa sekcja), `lib/menu/admin/index.ts` (dwa wpisy menu).
- Poza zakresem H20: `tests/Feature/PermissionMatrix/PermissionMatrixTest.php` (H02) —
  jedna linia poprawiona z konieczności (patrz „What Changes" wyżej), bez zmiany
  zamierzonego zachowania testu.
- Brak zmian schematu (migracje zamrożone, H20 czyta wyłącznie istniejące tabele
  `audit_log`, `internship_entries`, `applications`, `certificates`, `users`) i brak
  odstępstw od kontraktu wymagających decyzji strażnika — endpointy, kody błędów i
  rejestr audytu są już zapisane w `01-pakiety-zadan.md` i `02-kontrakt-api.md`.
