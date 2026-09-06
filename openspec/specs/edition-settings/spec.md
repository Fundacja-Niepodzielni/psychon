# edition-settings Specification

## Purpose

Ustawienia edycji (`#/admin/ustawienia`) pozwalają administracji zmieniać reguły
programu — terminy, limit miejsc oraz progi zaliczeń — bez ingerencji
programisty, z pełną walidacją zakresów i audytem każdej zmiany.

## Requirements

### Requirement: Odczyt ustawień aktywnej edycji
System SHALL udostępniać `GET /admin/edition` zwracający w `data` aktywną edycję:
`name`, `starts_at`, `ends_at`, `seats_limit` oraz komplet kluczy z kontraktu
§3.3 — `test_pass_threshold`, `test_attempts_limit`, `internship_hours_required`,
`supervision_required_count`, `reliability_threshold`,
`lesson_completion_percent`. Trasa wymaga uwierzytelnienia i roli
administracyjnej. MVP prowadzi jedną aktywną edycję naraz — trasa nie przyjmuje
identyfikatora edycji.

#### Scenario: Odczyt na danych demo
- **WHEN** administrator wywołuje `GET /admin/edition` na stanie z seeda demo
- **THEN** odpowiedź zawiera `name` = "Edycja 2026", `starts_at` = "2026-10-01",
  `seats_limit` = 40, `test_pass_threshold` = 80, `test_attempts_limit` = 3,
  `internship_hours_required` = 72, `supervision_required_count` = 6,
  `reliability_threshold` = 60, `lesson_completion_percent` = 60

#### Scenario: Rola bez dostępu
- **WHEN** użytkownik z rolą `instructor` wywołuje `GET /admin/edition`
- **THEN** odpowiedź to 403 `forbidden`

### Requirement: Aktualizacja ustawień z walidacją zakresów
System SHALL udostępniać `PATCH /admin/edition` przyjmujący dowolny podzbiór pól
z powyższego wymagania i zapisujący je na aktywnej edycji. Wartości procentowe
(`test_pass_threshold`, `reliability_threshold`, `lesson_completion_percent`)
SHALL mieścić się w zakresie 0–100. Wartości liczbowe (`test_attempts_limit`,
`internship_hours_required`, `supervision_required_count`, `seats_limit`) SHALL
być dodatnimi liczbami całkowitymi. Wartość spoza dozwolonego zakresu SHALL
skutkować odpowiedzią 422 `validation_failed` z błędem przy właściwym polu, bez
zapisu żadnej zmiany.

#### Scenario: Próg poza zakresem odrzucony
- **WHEN** administrator wysyła `PATCH /admin/edition` z `test_pass_threshold` =
  150
- **THEN** odpowiedź to 422 `validation_failed` z błędem przy polu
  `test_pass_threshold`, a wartość w bazie pozostaje niezmieniona

#### Scenario: Poprawna aktualizacja się zapisuje
- **WHEN** administrator wysyła `PATCH /admin/edition` z `test_pass_threshold` =
  70
- **THEN** odpowiedź to 200 z `data.test_pass_threshold` = 70, a kolejne
  `GET /admin/edition` zwraca tę samą wartość

### Requirement: Audyt zmian ustawień
Każda udana `PATCH /admin/edition` SHALL rejestrować zdarzenie audytowe
`edition.updated` przez `AuditLog::record` z informacją, które pola się
zmieniły.

#### Scenario: Zmiana ustawień trafia do dziennika audytu
- **WHEN** administrator zmienia `seats_limit` przez `PATCH /admin/edition`
- **THEN** w dzienniku audytu pojawia się wpis `edition.updated` powiązany z tym
  administratorem i tą edycją

### Requirement: Zmiana progu testu obowiązuje natychmiast w H10
Zmiana `test_pass_threshold` przez `PATCH /admin/edition` SHALL być natychmiast
widoczna dla `Settings::edition('test_pass_threshold')` — bez cache'owania i bez
wdrożenia — tak żeby próg zaliczenia testu kursu w H10 zmieniał się bez zmian w
kodzie.

#### Scenario: Nowy próg zmienia wynik zaliczenia testu
- **WHEN** administrator ustawia `test_pass_threshold` = 90, a następnie
  uczestniczka podchodzi do testu kursu z wynikiem 85%
- **THEN** `Settings::edition('test_pass_threshold')` zwraca 90, a podejście do
  testu z wynikiem 85% jest oznaczone jako niezaliczone
