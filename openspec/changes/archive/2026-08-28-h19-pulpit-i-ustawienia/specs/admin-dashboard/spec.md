## Purpose

Pulpit administracji (`#/admin`) daje jednym spojrzeniem liczby wejściowe bieżącej
edycji oraz kolejki spraw wymagających działania, każda z linkiem do właściwego
ekranu, tak żeby administracja nie musiała przeszukiwać osobnych sekcji panelu.

## ADDED Requirements

### Requirement: Liczniki pulpitu
System SHALL udostępniać `GET /admin/dashboard` zwracający w `data.counters`
liczbę uczestniczek i uczestników programu (`participants`: role `volunteer` lub
`student`, status `active`), liczbę ukończeń programu (`completed`:
`program_completed_at` ustawione) oraz liczbę wydanych certyfikatów
(`certificates`). Trasa wymaga uwierzytelnienia i roli administracyjnej.

#### Scenario: Liczniki na danych demo
- **WHEN** administrator wywołuje `GET /admin/dashboard` na stanie z seeda demo
- **THEN** `data.counters.participants` = 3, `data.counters.completed` = 1,
  `data.counters.certificates` = 1

#### Scenario: Rola bez dostępu
- **WHEN** użytkownik z rolą `volunteer` wywołuje `GET /admin/dashboard`
- **THEN** odpowiedź to 403 `forbidden`

### Requirement: Kolejki spraw z linkami
System SHALL zwracać w `data.queues` listę obiektów `{key, count, link}` — co
najmniej dla zgłoszeń rekrutacyjnych oczekujących (`applications`, status `new`),
wpisów stażu oczekujących na akceptację (`internship_entries`, status
`submitted`), profili psychologa oczekujących na decyzję (`profiles`, wyłączając
status `draft`) oraz pytań bez odpowiedzi (`questions`). `link` wskazuje ekran
administracji właściwy dla danej kolejki (np. `/admin/uczestniczki` dla
`applications`).

#### Scenario: Kolejki na danych demo
- **WHEN** administrator wywołuje `GET /admin/dashboard` na stanie z seeda demo
- **THEN** `data.queues` zawiera wpis `applications` z `count` = 1, wpis
  `internship_entries` z `count` = 2, wpis `profiles` z `count` = 0, wpis
  `questions` z `count` = 1 — każdy z niepustym `link`

#### Scenario: Kliknięcie w kolejkę prowadzi do właściwego ekranu
- **WHEN** administrator klika kafel kolejki `applications` na pulpicie
- **THEN** przegląda widok wskazany przez `link` zwrócony w tej kolejce
