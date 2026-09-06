## Why

Administracja i prowadzący potrzebują jednego, porównywalnego sygnału wskazującego osoby, które ukończyły lekcje przy niewspółmiernie krótkim czasie aktywnej nauki. H07 domyka ten pionowy wycinek na danych już zbieranych przez H06, z dynamicznym progiem H19 i izolacją grupy wynikającą z aktualnych przypisań H12.

## What Changes

- Dodajemy administracyjny ekran `/admin/czas-nauki`: lista osób rosnąco według rzetelności oraz dostępny widok szczegółów osoby.
- Dodajemy sekcję rzetelności na `/prowadzacy/grupa` przez publiczny, bezstanowy slot `frontend/components/h12/H07ReliabilitySlot.tsx`, bez zmiany strony ani logiki H12.
- Udostępniamy wyłącznie oficjalne operacje `GET /admin/reliability`, `GET /admin/reliability/{userId}` i `GET /instructor/reliability`, z autoryzacją serwerową, dedykowanymi FormRequestami i standardowymi kopertami.
- Wartość zbiorczą pobieramy wyłącznie z zamrożonego `ProgressAggregator`; zapytania szczegółowe mogą czytać `lesson_progress` i `lessons` tylko do zatwierdzonych pól diagnostycznych.
- Flaga progu korzysta przy każdym odczycie z `Settings::edition('reliability_threshold')`, dzięki czemu zmiana H19 działa bez wdrożenia.
- Nie dodajemy migracji, zależności, zdarzeń audytowych, powiadomień ani tras poza trzema operacjami H07.
- Synchronizujemy oficjalny kontrakt HTTP z minimalnym kształtem odpowiedzi H07 wdrożonym po decyzji koordynatora, bez rozszerzania tras, filtrów i kodów błędów.
- Korzystamy z poprawionego na `origin/main` publicznego API `ProgressAggregator`, bez zmiany fasady i bez lokalnego algorytmu zastępczego.

## Capabilities

### New Capabilities

- `reliability-monitoring`: wspólny pomiar rzetelności, administracyjna lista i szczegóły, izolowany widok prowadzącego, dynamiczny próg oraz integracja z publicznym slotem H12.

### Modified Capabilities

- Brak.

## Impact

- Backend H07: nowe FormRequesty, Resources, serwisy zapytań i kontrolery oraz wyłącznie `backend/routes/api/h07.php`.
- Frontend H07: nowy ekran `/admin/czas-nauki`, kod domenowy H07, per-pakietowy wpis menu oraz wnętrze publicznego slotu `frontend/components/h12/H07ReliabilitySlot.tsx`; bez zmian w stronie, tabeli, typach i logice H12.
- Integracje: odczyt `ProgressAggregator`, `Settings::edition('reliability_threshold')`, `lesson_progress`, `lessons` i aktualnych `supervisor_assignments`.
- Testy: seedy Filipa (około 15%, pierwszy, poniżej progu) i Marty (około 85%, bez flagi), zgodność wszystkich prezentacji z agregatorem, role, 401/403/404, izolacja grup, zmiana progu, stany puste i błędy.
- Zależności organizacyjne: bramki kontraktu i rejestracji wpisu menu są domknięte w zmianie integracyjnej po wdrożeniu H07; nie rozszerza to API ani własności pozostałych plików staff-owned.
