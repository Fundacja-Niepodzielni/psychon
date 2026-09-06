## Purpose

Pierwszy ekran ścieżki uczestnika i wolontariusza (`#/panel/start`) — film powitalny,
przebieg programu i oczekiwania — z treścią edytowalną przez administrację bez zmian w
kodzie i widoczną natychmiast po zapisie. Ekran musi pozostać dostępny również po
wygaśnięciu dostępu i po ukończeniu programu.

## ADDED Requirements

### Requirement: Odczyt treści onboardingu

System SHALL udostępniać treść ekranu onboardingu każdej zalogowanej osobie, niezależnie od
roli. Odpowiedź MUST używać koperty `{"data": ...}` i zawierać trzy sekcje — `video` (`title`,
`url`, `caption`), `program` (`title`, `body`), `expectations` (`title`, `body`) — oraz
`updated_at` (ISO 8601 UTC, `null` gdy treść nigdy nie była edytowana). Gdy żadna treść nie
została zapisana, odpowiedź MUST zwrócić wartości domyślne wbudowane w kod.

#### Scenario: Domyślna treść na czystej bazie

- **WHEN** zalogowany użytkownik woła `GET /onboarding`, a żaden wiersz treści nie istnieje
- **THEN** odpowiedź ma status 200 i zawiera trzy sekcje z wartościami domyślnymi oraz
  `updated_at` równy `null`

#### Scenario: Zapisana treść zastępuje tylko edytowane sekcje

- **WHEN** administracja zapisała wyłącznie sekcję `program`, a użytkownik woła
  `GET /onboarding`
- **THEN** odpowiedź zawiera zmienioną treść `program`, a sekcje `video` i `expectations`
  pozostają na wartościach domyślnych

#### Scenario: Gość nie ma dostępu

- **WHEN** niezalogowany klient woła `GET /onboarding`
- **THEN** odpowiedź ma status 401 z `error.code` = `unauthenticated`

### Requirement: Ekran dostępny mimo wygasłego dostępu lub ukończenia programu

System SHALL udostępniać `GET /onboarding` bez względu na stan `access_expires_at` i
`program_completed_at` użytkownika. Trasa MUST NOT być objęta bramką dostępu stosowaną na
pozostałych trasach chronionych (`access.active`).

#### Scenario: Dostęp wygasł

- **WHEN** zalogowany użytkownik z `access_expires_at` w przeszłości woła `GET /onboarding`
- **THEN** odpowiedź ma status 200 z pełną treścią onboardingu

#### Scenario: Program ukończony

- **WHEN** zalogowany użytkownik z ustawionym `program_completed_at` woła `GET /onboarding`
- **THEN** odpowiedź ma status 200 z pełną treścią onboardingu

### Requirement: Edycja treści przez administrację

System SHALL pozwalać rolom `super_admin` i `project_manager` na częściową aktualizację
treści onboardingu przez `PATCH /admin/onboarding`. Każda z trzech sekcji MUST być opcjonalna
w żądaniu; gdy sekcja jest podana, jej pola tekstowe (poza `video.url`) MUST być wymagane.
Nieprawidłowe dane MUST zwrócić 422 `validation_failed` z listą pól w `error.errors`, bez
zapisu żadnej zmiany. Rola spoza dozwolonych MUST otrzymać 403 `forbidden` i nie może
utworzyć ani zmienić wiersza treści.

#### Scenario: Project Manager edytuje treść

- **WHEN** `project_manager` woła `PATCH /admin/onboarding` z poprawnymi danymi sekcji
  `program` i `video`
- **THEN** odpowiedź ma status 200 i zwraca zaktualizowaną treść tych sekcji

#### Scenario: Super Admin również może edytować

- **WHEN** `super_admin` woła `PATCH /admin/onboarding` z poprawnymi danymi sekcji
  `expectations`
- **THEN** odpowiedź ma status 200, a kolejny odczyt zwraca zapisaną treść

#### Scenario: Wolontariusz nie może edytować

- **WHEN** użytkownik z rolą `volunteer` woła `PATCH /admin/onboarding`
- **THEN** odpowiedź ma status 403 z `error.code` = `forbidden`
- **AND** żaden wiersz treści onboardingu nie zostaje utworzony

#### Scenario: Pusta sekcja odrzucona

- **WHEN** administracja woła `PATCH /admin/onboarding` z sekcją `program` zawierającą pusty
  `title`
- **THEN** odpowiedź ma status 422 z `error.code` = `validation_failed` wskazującym pola
  `program.title` i `program.body` w `error.errors`

#### Scenario: Nieprawidłowy adres wideo odrzucony

- **WHEN** administracja woła `PATCH /admin/onboarding` z `video.url` niebędącym poprawnym
  adresem URL
- **THEN** odpowiedź ma status 422 z `error.code` = `validation_failed`

### Requirement: Widoczność zmiany natychmiast po zapisie

System SHALL udostępniać zapisaną treść przy najbliższym kolejnym `GET /onboarding`, bez
opóźnienia, cache'u ani wymogu ponownego wdrożenia. Znacznik `updated_at` MUST odzwierciedlać
czas ostatniego udanego zapisu.

#### Scenario: Kolejny odczyt widzi zmianę

- **WHEN** administracja zapisuje nową treść przez `PATCH /admin/onboarding`, a zaraz potem
  dowolny zalogowany użytkownik woła `GET /onboarding`
- **THEN** odpowiedź zawiera właśnie zapisaną treść

#### Scenario: Znacznik czasu pojawia się po pierwszej edycji

- **WHEN** treść onboardingu zostaje edytowana po raz pierwszy
- **THEN** kolejne `GET /onboarding` zwraca `updated_at` równy czasowi tego zapisu, w formacie
  ISO 8601 UTC

### Requirement: Ekran onboardingu uczestnika i wolontariusza

System SHALL udostępniać ekran `#/panel/start` ze stałą pozycją w menu wszystkich ról
uczestniczących, prezentujący trzy sekcje treści onboardingu. Gdy `video.url` nie jest
ustawiony, ekran MUST pokazać zastępczy element z podpisem `video.caption`. Dla ról
`super_admin` i `project_manager` ekran MUST udostępniać możliwość edycji treści bez
opuszczania ekranu. Teksty interfejsu MUST być po polsku.

#### Scenario: Uczestniczka widzi ekran startowy

- **WHEN** uczestniczka otwiera `/panel/start`
- **THEN** widzi sekcje wideo (lub zastępczy placeholder z podpisem), przebiegu programu
  i oczekiwań, bez elementów edycji

#### Scenario: Administracja edytuje treść z poziomu ekranu

- **WHEN** `project_manager` otwiera `/panel/start` i zapisuje zmianę w formularzu edycji
- **THEN** ekran pokazuje potwierdzenie zapisu, a zaktualizowana treść jest widoczna bez
  przeładowania strony
