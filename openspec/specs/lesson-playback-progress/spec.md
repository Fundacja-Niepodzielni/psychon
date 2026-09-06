# lesson-playback-progress Specification

## Purpose

Zapewnia uczestnikowi bezpieczne odtwarzanie lekcji, trwałe liczniki postępu oraz wiarygodne naliczanie aktywnego czasu wymagane do ukończenia lekcji.

## Requirements

### Requirement: Dostęp do treści lekcji
System SHALL udostępniać odczyt i zmianę postępu lekcji wyłącznie uwierzytelnionemu użytkownikowi z aktywnym dostępem, któremu reguły dostępu do kursu pozwalają otworzyć tę lekcję.

#### Scenario: Dostęp do odblokowanej lekcji
- **WHEN** uwierzytelniony użytkownik z aktywnym dostępem żąda istniejącej lekcji dostępnego kursu
- **THEN** system zwraca status 200 i kopertę `data` zawierającą dokładnie `id`, `title`, `description`, `duration_seconds`, `watched_seconds`, `active_seconds`, `is_completed`, `completable` oraz `completable_at_percent`

#### Scenario: Pierwsze otwarcie bez zapisanego postępu
- **WHEN** uprawniony użytkownik po raz pierwszy odczytuje lekcję
- **THEN** liczniki mają wartość `0`, `is_completed` ma wartość `false`, a `open_count` użytkownika dla tej lekcji zwiększa się o 1

#### Scenario: Kolejne otwarcie lekcji
- **WHEN** uprawniony użytkownik ponownie odczytuje lekcję z zapisanym postępem
- **THEN** system zwraca jego trwały postęp i zwiększa `open_count` o 1 bez zmniejszenia pozostałych wartości

#### Scenario: Zablokowany kurs
- **WHEN** użytkownik żąda lekcji kursu zablokowanego przez sekwencję programu
- **THEN** system zwraca status 403 i błąd `course_locked` w standardowej kopercie błędu

#### Scenario: Brak uwierzytelnienia
- **WHEN** żądanie odczytu lub zmiany postępu lekcji nie zawiera ważnego tokenu
- **THEN** system zwraca status 401 i błąd `unauthenticated`

#### Scenario: Wygasły dostęp
- **WHEN** uwierzytelniony użytkownik z wygasłym dostępem żąda treści albo zmiany postępu lekcji
- **THEN** system zwraca status 403 i błąd `access_expired`

### Requirement: Walidowany heartbeat postępu
System SHALL przyjmować przez kontraktową trasę postępu payload zawierający wymagane `watched_delta` i `active_delta` jako nieujemne liczby całkowite, a błędy wejścia SHALL być zwracane jako 422 `validation_failed`.

#### Scenario: Poprawny heartbeat
- **WHEN** uprawniony użytkownik wysyła poprawne nieujemne wartości wymaganych pól
- **THEN** system zapisuje dozwolone przyrosty i zwraca status 200 z `watched_seconds`, `active_seconds`, `completable` oraz `completable_at_percent`

#### Scenario: Niepoprawny heartbeat
- **WHEN** brakuje wymaganego pola albo którekolwiek pole nie jest nieujemną liczbą całkowitą
- **THEN** system zwraca status 422, kod `validation_failed` i błędy przypisane do pól

#### Scenario: Przyrost czasu oglądania nie jest przycinany limitem aktywności
- **WHEN** poprawny heartbeat zawiera `watched_delta` większy niż 35 oraz `active_delta` większy niż 35
- **THEN** reguła limitu 35 sekund dotyczy wyłącznie `active_delta`

### Requirement: Monotoniczne i współbieżnie bezpieczne liczniki
System SHALL aktualizować liczniki postępu atomowo, SHALL nigdy ich nie zmniejszać i SHALL ograniczać zaliczony `active_delta` do maksymalnie 35 sekund na żądanie oraz dla nakładających się heartbeatów.

#### Scenario: Przyrost aktywności ponad limit
- **WHEN** heartbeat zawiera `active_delta` większy niż 35 sekund
- **THEN** `active_seconds` zwiększa się najwyżej o 35 sekund

#### Scenario: Dwa heartbeaty w tej samej sekundzie
- **WHEN** dwie karty lub urządzenia wysyłają heartbeat dla tej samej osoby i lekcji w tej samej sekundzie
- **THEN** łączny przyrost `active_seconds` wynikający z obu żądań nie przekracza 35 sekund

#### Scenario: Heartbeat ze starszego klienta
- **WHEN** opóźniony heartbeat dociera po nowszej aktualizacji tej samej lekcji
- **THEN** żaden zapisany licznik ani znacznik ukończenia nie zostaje cofnięty

### Requirement: Aktywność tylko przy widocznej karcie
Komponent lekcji SHALL korzystać z widoczności dokumentu tak, aby czas spędzony z kartą w tle nie zwiększał `active_seconds`.

#### Scenario: Odtwarzanie w tle
- **WHEN** odtwarzacz działa, ale karta pozostaje niewidoczna
- **THEN** heartbeat nie zgłasza aktywnego czasu za okres niewidoczności, a `active_seconds` nie rośnie z tego powodu

#### Scenario: Powrót do widocznej karty
- **WHEN** użytkownik wraca do widocznej karty i kontynuuje odtwarzanie
- **THEN** kolejne heartbeaty naliczają wyłącznie aktywność od momentu odzyskania widoczności

### Requirement: Ukończenie według progu aktywnej edycji
System SHALL przy każdym odczycie postępu i każdej próbie ukończenia używać aktualnej wartości `lesson_completion_percent` aktywnej edycji, bez stałej zakodowanej w aplikacji.

#### Scenario: Próg został osiągnięty
- **WHEN** aktywny czas użytkownika osiąga wymagany procent czasu trwania lekcji i użytkownik wywołuje ukończenie
- **THEN** system zapisuje ukończenie, zwraca status 200 z `data.is_completed` równym `true` i `data.completed_at` jako znacznikiem ISO 8601 UTC, a ponowny odczyt pokazuje lekcję jako ukończoną

#### Scenario: Za mało aktywnego czasu
- **WHEN** aktywny czas jest poniżej aktualnego progu i użytkownik wywołuje ukończenie
- **THEN** system nie oznacza lekcji jako ukończonej i zwraca status 422 z kodem `not_enough_active_time`

#### Scenario: Zmiana progu bez wdrożenia
- **WHEN** administrator zmienia `lesson_completion_percent` aktywnej edycji
- **THEN** następna odpowiedź postępu zwraca nową wartość `completable_at_percent`, a możliwość ukończenia jest przeliczona według nowego progu

#### Scenario: Lekcja o zerowym czasie trwania
- **WHEN** lekcja ma `duration_seconds` równe `0`
- **THEN** system zwraca `completable` równe `false`, a próba ukończenia zwraca status 422 z kodem `not_enough_active_time`

### Requirement: Komponent integracyjny lekcji
Frontend SHALL dostarczać właścicielowi strony kursu samodzielny komponent kliencki H06 przyjmujący serializowalny identyfikator lekcji i możliwy do osadzenia bez przenoszenia strony kursu do odpowiedzialności H06.

#### Scenario: Osadzenie w slocie H05
- **WHEN** właściciel H05 osadza komponent H06 w stronie kursu i przekazuje identyfikator lekcji
- **THEN** komponent sam pobiera dozwolone dane lekcji, obsługuje heartbeat i ukończenie, bez wymagania zmian layoutu lub menu

#### Scenario: Pełny cykl stanów interfejsu
- **WHEN** komponent pobiera dane, odtwarza materiał, zapisuje postęp, napotyka błąd albo kończy lekcję
- **THEN** pokazuje po polsku odpowiednio stan ładowania, odtwarzania, zapisu, błędu, dostępności ukończenia lub ukończenia

### Requirement: Dostępność interfejsu lekcji
Komponent lekcji SHALL używać istniejących tokenów i komponentów bazowych oraz SHALL zachować obsługę klawiatury, widoczny fokus, semantyczne statusy i komunikaty błędów dostępne dla technologii asystujących.

#### Scenario: Obsługa klawiaturą i czytnikiem ekranu
- **WHEN** użytkownik przechodzi przez odtwarzacz i akcję ukończenia klawiaturą lub korzysta z czytnika ekranu
- **THEN** wszystkie działania są osiągalne, fokus jest widoczny, a zmiany zapisu, błędy i ukończenie są przekazywane tekstem, nie wyłącznie kolorem
