# instructor-assignments Specification

## Purpose
Przypisania prowadzących wiążą kurs albo pojedynczą lekcję z prowadzącym i
utrzymują historię tych powiązań. Ta zdolność jest też jedynym źródłem reguły
dziedziczenia: adresata pytania z lekcji (lekcja z własnym przypisaniem → jej
prowadzący, bez → prowadzący kursu), którą konsumuje `instructor-questions` (H17).

## Requirements

### Requirement: Odczyt przypisań kursu
System SHALL udostępniać `GET /admin/courses/{id}/assignments` zwracające w
kopercie `{data}` aktywne przypisania danego kursu (`unassigned_at = null`):
przypisanie kursowe (`lesson_id = null`) oraz przypisania poszczególnych lekcji.
Trasa MUST wymagać uwierzytelnienia i roli administracyjnej (`project_manager`
lub `super_admin`); inne role MUST otrzymać 403 `forbidden`. Każdy element MUST
zawierać co najmniej `id`, `course_id`, `lesson_id` (albo `null`),
`instructor` jako `{id, first_name, last_name}`, `assigned_by`, `assigned_at`.
Nieznany `id` kursu MUST zwracać 404 `not_found`.

#### Scenario: Administracja czyta przypisania kursu z seeda
- **WHEN** administrator wywołuje `GET /admin/courses/{id}/assignments` dla kursu
  prowadzonego przez Joannę
- **THEN** odpowiedź to 200, a `data` zawiera aktywne przypisanie kursowe z
  `lesson_id: null` i `instructor` wskazującym Joannę

#### Scenario: Rola bez dostępu
- **WHEN** użytkownik z rolą `instructor` wywołuje
  `GET /admin/courses/{id}/assignments`
- **THEN** odpowiedź to 403 `forbidden`

### Requirement: Założenie przypisania prowadzącego
System SHALL udostępniać `POST /admin/courses/{id}/assignments` z polami
`instructor_id` (wymagane) i `lesson_id` (opcjonalne; `null` albo brak =
przypisanie całego kursu). Trasa MUST wymagać roli administracyjnej. Żądanie MUST
być walidowane `FormRequest`: `instructor_id` MUST wskazywać istniejące konto z
rolą `instructor` (inaczej 422 `validation_failed`); `lesson_id`, jeśli podane,
MUST należeć do kursu z URL (inaczej 422 `validation_failed`). Jeśli dla tej
samej pary `(course_id, lesson_id)` istnieje już aktywne przypisanie
(`unassigned_at = null`), operacja MUST zwrócić 422 `conditions_not_met` z
`reason` wskazującym istniejące przypisanie i MUST NOT tworzyć drugiego rekordu.
Udane założenie MUST utworzyć rekord z `assigned_by` = zalogowany administrator,
`assigned_at = now()`, `unassigned_at = null`, MUST zwrócić 201 z zasobem
przypisania, MUST przejść przez `AuditLog::record` ze slugiem `assignment.created`
oraz MUST wysłać powiadomienie `assignment.created` przez `Notify::send` do
prowadzącego wskazanego w `instructor_id`, z linkiem `/panel/prowadzacy`.

#### Scenario: Przypisanie prowadzącego do całego kursu
- **WHEN** administrator wysyła `POST /admin/courses/{id}/assignments` z
  `instructor_id` konta prowadzącego i bez `lesson_id`
- **THEN** odpowiedź to 201 z zasobem przypisania (`lesson_id: null`), w audycie
  pojawia się wpis `assignment.created`, a prowadzący dostaje powiadomienie
  `assignment.created`

#### Scenario: Przypisanie prowadzącego do pojedynczej lekcji
- **WHEN** administrator wysyła `POST /admin/courses/{id}/assignments` z
  `instructor_id` i `lesson_id` lekcji należącej do tego kursu
- **THEN** odpowiedź to 201 z zasobem przypisania niosącym to `lesson_id`

#### Scenario: Drugie aktywne przypisanie tej samej pary
- **WHEN** administrator wysyła `POST /admin/courses/{id}/assignments` dla pary
  `(kurs, lekcja)`, która ma już aktywne przypisanie
- **THEN** odpowiedź to 422 `conditions_not_met`, a liczba rekordów przypisań nie
  rośnie

#### Scenario: instructor_id bez roli instructor
- **WHEN** administrator wysyła `POST /admin/courses/{id}/assignments` z
  `instructor_id` konta, które nie ma roli `instructor`
- **THEN** odpowiedź to 422 `validation_failed`, przypisanie nie powstaje, audyt
  nie rośnie

#### Scenario: lesson_id spoza kursu
- **WHEN** administrator wysyła `POST /admin/courses/{id}/assignments` z
  `lesson_id` lekcji należącej do innego kursu
- **THEN** odpowiedź to 422 `validation_failed`

### Requirement: Odpięcie przypisania prowadzącego
System SHALL udostępniać `DELETE /admin/courses/{id}/assignments` z wymaganym
polem `assignment_id` w ciele żądania. Trasa MUST wymagać roli administracyjnej.
Wskazane przypisanie MUST należeć do kursu z URL i MUST być aktywne
(`unassigned_at = null`); inaczej odpowiedź to 404 `not_found`. Odpięcie MUST być
zrealizowane przez ustawienie `unassigned_at = now()` i MUST NOT usuwać wiersza z
bazy (historia jest wymagana przez regułę „stare pytania zostają u
odpowiadającego"). Udane odpięcie MUST zwrócić 200 z zasobem przypisania (albo
`{id, unassigned: true}`), MUST przejść przez `AuditLog::record` ze slugiem
`assignment.removed` oraz MUST wysłać powiadomienie `assignment.removed` przez
`Notify::send` do prowadzącego, którego dotyczyło przypisanie.

#### Scenario: Odpięcie aktywnego przypisania
- **WHEN** administrator wysyła `DELETE /admin/courses/{id}/assignments` z
  `assignment_id` aktywnego przypisania
- **THEN** odpowiedź to 200, rekord ma ustawione `unassigned_at`, wiersz nadal
  istnieje w bazie, w audycie pojawia się wpis `assignment.removed`, a prowadzący
  dostaje powiadomienie `assignment.removed`

#### Scenario: Ponowne odpięcie tego samego przypisania
- **WHEN** administrator wysyła `DELETE /admin/courses/{id}/assignments` z
  `assignment_id` przypisania, które ma już ustawione `unassigned_at`
- **THEN** odpowiedź to 404 `not_found`, bez dodatkowego audytu i powiadomienia

#### Scenario: assignment_id spoza kursu z URL
- **WHEN** administrator wysyła `DELETE /admin/courses/{id}/assignments` z
  `assignment_id` należącym do innego kursu
- **THEN** odpowiedź to 404 `not_found`

#### Scenario: Brak assignment_id
- **WHEN** administrator wysyła `DELETE /admin/courses/{id}/assignments` bez
  `assignment_id`
- **THEN** odpowiedź to 422 `validation_failed`

### Requirement: Reguła dziedziczenia prowadzącego
System SHALL wyznaczać prowadzącego odpowiedzialnego za lekcję według reguły:
jeśli lekcja ma własne aktywne przypisanie (`course_assignments` z `lesson_id`
tej lekcji i `unassigned_at = null`), prowadzącym lekcji jest instruktor z tego
przypisania; w przeciwnym razie prowadzącym lekcji jest instruktor z aktywnego
przypisania kursowego (`lesson_id = null`). Jeśli nie ma ani przypisania lekcji,
ani kursu, wynik MUST być pusty (`null`). Reguła MUST być zaimplementowana jako
jedno miejsce w kodzie (usługa `AssignmentResolver`), tak aby
`instructor-questions` (H17) ją konsumował, a nie reimplementował. Przy wielu
aktywnych przypisaniach tej samej pary `(course, lesson)` (stan, którego zapis
zabrania, ale który może powstać w danych historycznych) reguła MUST wybierać
deterministycznie najniższe `id`.

#### Scenario: Lekcja z własnym przypisaniem
- **WHEN** lekcja ma aktywne przypisanie lekcyjne do prowadzącego A, a kurs ma
  przypisanie kursowe do prowadzącego B
- **THEN** reguła dziedziczenia zwraca prowadzącego A dla tej lekcji

#### Scenario: Lekcja bez własnego przypisania dziedziczy prowadzącego kursu
- **WHEN** lekcja nie ma przypisania lekcyjnego, a kurs ma aktywne przypisanie
  kursowe do prowadzącego B
- **THEN** reguła dziedziczenia zwraca prowadzącego B dla tej lekcji

#### Scenario: Brak jakiegokolwiek przypisania
- **WHEN** ani lekcja, ani jej kurs nie mają aktywnego przypisania
- **THEN** reguła dziedziczenia zwraca `null`

#### Scenario: Zmiana prowadzącego przekierowuje przyszłe rozstrzygnięcia
- **WHEN** przypisanie kursowe do prowadzącego B zostaje odpięte
  (`unassigned_at`), a następnie założone nowe przypisanie kursowe do
  prowadzącego C
- **THEN** reguła dziedziczenia dla lekcji bez własnego przypisania zwraca odtąd
  prowadzącego C, a wcześniej udzielone odpowiedzi pozostają przypisane do B
  przez `answered_by` (własność `instructor-questions`, H17)

### Requirement: Przypisania zasilają wizytówkę prowadzącego w widoku kursu
System SHALL zapewnić, że aktywne przypisanie kursowe jest jedynym źródłem pola
`data.instructor` w `GET /courses/{slug}` (kontrakt §2, „Kursy"). Po odpięciu
wszystkich aktywnych przypisań kursowych `data.instructor` MUST być `null`. Po
założeniu nowego aktywnego przypisania kursowego `data.instructor` MUST wskazywać
nowego prowadzącego. Ta zdolność MUST NOT zmieniać kształtu odpowiedzi
`GET /courses/{slug}` poza wartością `data.instructor`.

#### Scenario: Odpięcie prowadzącego zeruje wizytówkę kursu
- **WHEN** administrator odpina jedyne aktywne przypisanie kursowe, a następnie
  uczestnik pobiera `GET /courses/{slug}` dla tego kursu
- **THEN** `data.instructor` to `null`, a pozostałe pola odpowiedzi są bez zmian

#### Scenario: Przypisanie nowego prowadzącego aktualizuje wizytówkę kursu
- **WHEN** administrator zakłada aktywne przypisanie kursowe do prowadzącego C, a
  następnie uczestnik pobiera `GET /courses/{slug}`
- **THEN** `data.instructor` wskazuje prowadzącego C
