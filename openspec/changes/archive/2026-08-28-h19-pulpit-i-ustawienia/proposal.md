## Why

Administracja potrzebuje jednego miejsca, w którym widać liczby wejściowe bieżącej
edycji (uczestniczki, ukończenia, certyfikaty) oraz kolejki spraw wymagających
działania, a także miejsca do zmiany reguł programu (progi testów, wymagane godziny
stażu, limit miejsc, terminy) bez ingerencji programisty. Dziś `#/admin` i
`#/admin/ustawienia` nie istnieją, a `routes/api/h19.php` jest pustym stubem.

## What Changes

- `GET /admin/dashboard` — liczniki (`participants`, `completed`, `certificates`)
  liczone przez `ProgressAggregator`/agregaty na tabeli `editions`, oraz kolejki
  spraw (np. `applications`) z linkiem do właściwego ekranu administracji.
- `GET /admin/edition` — pełny odczyt aktywnej edycji: nazwa, terminy, limit miejsc
  oraz komplet kluczy ustawień z kontraktu §3.3 (`test_pass_threshold`,
  `test_attempts_limit`, `internship_hours_required`, `supervision_required_count`,
  `reliability_threshold`, `lesson_completion_percent`).
- `PATCH /admin/edition` — aktualizacja tych samych pól z walidacją zakresów
  (np. próg 0–100%, dodatnie liczby godzin/miejsc) i audytem `edition.updated`.
- Ekran `#/admin` (pulpit) — kafle liczników klikalne do odpowiedniej kolejki.
- Ekran `#/admin/ustawienia` — formularz edycji ustawień edycji, dostępny wyłącznie
  rolom administracyjnym.
- Trasy ograniczone middleware roli administracyjnej (`role:`) — MVP prowadzi jedną
  edycję naraz, więc `PATCH /admin/edition` nie przyjmuje identyfikatora edycji.

## Capabilities

### New Capabilities

- `admin-dashboard`: liczniki i kolejki spraw na pulpicie administracji (`GET /admin/dashboard`),
  zgodne z wartościami z `04-seed-demo.md` i klikalne do właściwej kolejki.
- `edition-settings`: odczyt i edycja reguł aktywnej edycji (`GET/PATCH /admin/edition`) —
  terminy, limit miejsc oraz wszystkie klucze ustawień z kontraktu §3.3, z walidacją
  zakresów i audytem `edition.updated`; zmiana `test_pass_threshold` realnie wpływa na
  próg zaliczenia testu czytany przez `Settings::edition(...)` w H10.

### Modified Capabilities

Brak — pakiet nie zmienia zachowania istniejących tras; `Settings::edition()` jest
tylko konsumowane (odczyt), a jego kontrakt (klucze, typy) pozostaje bez zmian.

## Impact

- Nowe pliki: `backend/routes/api/h19.php` (rejestracja tras), kontroler(-y),
  `FormRequest` do `PATCH /admin/edition`, `Resource`(-y) do prezentacji dashboardu
  i edycji, serwis liczący liczniki/kolejki pulpitu, testy feature/unit.
- Frontend: nowa grupa tras `app/(administracja)/admin/page.tsx` (pulpit) i
  `app/(administracja)/admin/ustawienia/page.tsx`, wpis w rejestrze menu
  (`lib/menu/administracja/h19-*.ts`), wywołania w `lib/api.ts`.
- Brak zmian w migracjach (tabela `editions` już istnieje) i brak nowych zależności.
- Zależność odbiorcza: `H10` czyta `Settings::edition('test_pass_threshold')` —
  kryterium 2★ tego pakietu weryfikuje to zachowanie testem integracyjnym, ale nie
  wymaga zmian po stronie H10.
