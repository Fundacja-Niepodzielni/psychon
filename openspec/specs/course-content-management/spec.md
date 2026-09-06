# course-content-management Specification

## Purpose
Zarządzanie treścią programu przez administrację (`#/admin/kursy`) pozwala zespołowi
Fundacji tworzyć kursy i webinary, budować je z lekcji, publikować i układać kolejność
ścieżki **bez udziału programisty** — a przy tym chroni ścieżkę uczestnika przed
zmianami, które po cichu zablokowałyby albo odblokowały cały rocznik. Konsumentem
wytworzonych treści jest scalona już ścieżka uczestnika (H05), która czyta tabele
`courses` i `lessons` wprost.

## Requirements

### Requirement: Autoryzacja tras zarządzania treścią

Wszystkie trasy CMS SHALL być zarejestrowane za flagą `config('features.h08')` i pod
middleware `role:project_manager,super_admin`. Żądanie bez ważnego tokenu SHALL zwracać
401 `unauthenticated`, a żądanie od roli spoza administracji SHALL zwracać 403
`forbidden`. Trasy CMS SHALL NOT wymagać `access.active` — administracja nie podlega
wygaśnięciu dostępu do programu.

#### Scenario: Wolontariusz nie ma dostępu do CMS

- **WHEN** użytkownik z rolą `volunteer` wywołuje `GET /admin/courses`
- **THEN** odpowiedź to 403 `forbidden` w kopercie błędu

#### Scenario: Gość bez tokenu

- **WHEN** żądanie `GET /admin/courses` idzie bez nagłówka `Authorization`
- **THEN** odpowiedź to 401 `unauthenticated`

### Requirement: Zarządzanie kursami wraz z widocznością szkiców

System SHALL udostępniać `GET /admin/courses`, `POST /admin/courses`,
`GET /admin/courses/{course}`, `PATCH /admin/courses/{course}` oraz
`DELETE /admin/courses/{course}`. Lista SHALL być paginowana (`page`, `per_page`
maksymalnie 100) w kopercie `{data, meta}`, z płaskimi filtrami `type`,
`product_group`, `search` i sortowaniem po `sequence_order`. Lista administracyjna
SHALL zawierać **także kursy niepublikowane** (`is_published = false`), inaczej niż
katalog uczestnika. Kurs tworzony bez jawnej wartości `is_published` SHALL powstawać
jako szkic. Nieistniejący identyfikator SHALL zwracać 404 `not_found`.

#### Scenario: Szkic jest widoczny w panelu, ale nie u uczestnika

- **WHEN** administrator tworzy kurs przez `POST /admin/courses` bez `is_published`
- **THEN** odpowiedź to 201 z `data.is_published` = `false`, kurs pojawia się na
  `GET /admin/courses`, a `GET /courses` wywołane kontem uczestnika go **nie** zawiera

#### Scenario: Nieznany kurs

- **WHEN** administrator wywołuje `GET /admin/courses/{id}` z identyfikatorem, który
  nie istnieje
- **THEN** odpowiedź to 404 `not_found`

### Requirement: Kurs bez lekcji nie może zostać opublikowany

System SHALL odrzucać każdą operację, której stanem docelowym jest kurs
`is_published = true` bez ani jednej nieusuniętej lekcji, odpowiedzią 422
`conditions_not_met` z `reason.missing` zawierającym `"lessons"`. Sprawdzenie SHALL
biec **po** złożeniu stanu docelowego z żądania, a przed zapisem — inaczej
`PATCH {is_published: true}` przeszedłby na podstawie stanu sprzed edycji. Odrzucone
żądanie SHALL NOT zmieniać rekordu kursu.

*Uzasadnienie:* `CourseAccess::allLessonsCompleted()` zwraca `false` dla kursu z zerem
lekcji, więc opublikowany pusty kurs w środku sekwencji natychmiast blokuje wszystkich
uczestników za nim.

#### Scenario: Publikacja pustego kursu odrzucona

- **WHEN** administrator wysyła `PATCH /admin/courses/{id}` z `is_published` = `true`
  dla kursu, który nie ma żadnej lekcji
- **THEN** odpowiedź to 422 `conditions_not_met` z `reason.missing` = `["lessons"]`,
  a kurs w bazie pozostaje szkicem

#### Scenario: Po dodaniu lekcji publikacja przechodzi

- **WHEN** administrator dodaje do tego kursu dwie lekcje, a następnie ponawia
  `PATCH /admin/courses/{id}` z `is_published` = `true`
- **THEN** odpowiedź to 200 z `data.is_published` = `true`

### Requirement: Kurs będący prerekwizytem nie może zostać usunięty

System SHALL odrzucać `DELETE /admin/courses/{course}` odpowiedzią 422
`conditions_not_met` z `reason.blocking_course_ids`, gdy usuwany kurs jest
opublikowany, ma `sequence_order` i istnieje inny **opublikowany** kurs o wyższym
`sequence_order`. Komunikat SHALL kierować do odpublikowania kursu albo przeniesienia
go na koniec ścieżki. Odrzucone żądanie SHALL NOT zmieniać rekordu.

*Uzasadnienie:* `CourseAccess::state()` wybiera poprzednika jako najbliższy niższy
opublikowany kurs typu `course`, więc usunięcie środkowego etapu po cichu skraca ścieżkę
wszystkim, którzy na nim stoją.

#### Scenario: Usunięcie środkowego etapu ścieżki odrzucone

- **WHEN** administrator wywołuje `DELETE /admin/courses/{id}` dla opublikowanego kursu
  o `sequence_order` = 2, gdy istnieje opublikowany kurs o `sequence_order` = 3
- **THEN** odpowiedź to 422 `conditions_not_met` z niepustym
  `reason.blocking_course_ids`, a kurs nadal istnieje i ma niezmienione
  `sequence_order`

#### Scenario: Ostatni kurs ścieżki daje się usunąć

- **WHEN** administrator wywołuje `DELETE /admin/courses/{id}` dla opublikowanego kursu
  o najwyższym `sequence_order` w ścieżce
- **THEN** odpowiedź to 200 z `data.deleted` = `true`

### Requirement: Zarządzanie lekcjami kursu

System SHALL udostępniać `GET /admin/courses/{course}/lessons`,
`POST /admin/courses/{course}/lessons`, `PATCH /admin/lessons/{lesson}` oraz
`DELETE /admin/lessons/{lesson}`. Lista lekcji SHALL być zwracana bez paginacji,
posortowana po `sequence_order`. Lekcja SHALL przyjmować `title`, `description`,
`sequence_order`, `video_provider_id` (tekstowy identyfikator nagrania, bez uploadu
wideo) i `duration_seconds`. Przy braku `sequence_order` system SHALL nadać kolejny
wolny numer w kursie. Lekcja spoza wskazanego kursu albo nieistniejąca SHALL zwracać
404 `not_found`.

#### Scenario: Lekcja spoza wskazanego kursu

- **WHEN** administrator wywołuje `PATCH /admin/lessons/{id}` dla lekcji należącej do
  innego kursu niż wskazany w ścieżce żądania
- **THEN** odpowiedź to 404 `not_found`

#### Scenario: Domyślna pozycja nowej lekcji

- **WHEN** administrator tworzy lekcję przez `POST /admin/courses/{id}/lessons` bez
  pola `sequence_order` w kursie mającym już dwie lekcje
- **THEN** odpowiedź to 201, a `data.sequence_order` = 3

### Requirement: Usunięcie lekcji jest miękkie i zachowuje postęp historyczny

`DELETE /admin/lessons/{lesson}` SHALL wykonywać **soft delete** (`deleted_at`), nigdy
usunięcie twarde. Żaden wiersz `lesson_progress` powiązany z usuwaną lekcją SHALL NOT
zostać skasowany. Usunięta lekcja SHALL zniknąć z odpowiedzi `GET /courses/{slug}`
po stronie uczestnika.

*Uwaga domenowa:* `Course::lessons()` nie ma `withTrashed()`, więc soft delete zdejmuje
lekcję z mianownika ukończenia — usunięcie ostatniej nieukończonej lekcji może
natychmiast ukończyć kurs i odblokować następny. To zachowanie jest świadome i SHALL
być pokryte testem, a nie ukryte.

#### Scenario: Postęp przeżywa usunięcie lekcji

- **WHEN** uczestnik ma zapisany `lesson_progress` dla lekcji, a administrator usuwa tę
  lekcję przez `DELETE /admin/lessons/{id}`
- **THEN** odpowiedź to 200 `{"data": {"id": …, "deleted": true}}`, wiersz
  `lesson_progress` **nadal istnieje** w bazie, a lekcja nie pojawia się już
  w `GET /courses/{slug}` uczestnika

#### Scenario: Skutek uboczny na regule odblokowań jest udokumentowany

- **WHEN** administrator usuwa ostatnią nieukończoną lekcję kursu, w którym uczestnik
  ukończył wszystkie pozostałe lekcje
- **THEN** status tego kursu dla uczestnika zmienia się na `completed`

### Requirement: Zmiana kolejności z renumeracją 1..N

System SHALL udostępniać `PATCH /admin/courses/{course}/lessons/reorder`
z `{lesson_ids: [...]}` oraz `PATCH /admin/courses/reorder` z `{course_ids: [...]}`,
obie zwracające 200 z listą w nowej kolejności. Przekazana lista SHALL być **pełną
permutacją** identyfikatorów zbioru — odpowiednio lekcji kursu i kursów ścieżki
(`sequence_order IS NOT NULL`); brak, nadmiar albo duplikat SHALL zwracać 422
`validation_failed`. Renumeracja SHALL biec w transakcji i obejmować **wszystkie**
elementy zbioru, nie tylko przestawiane, tak żeby po operacji pozycje były unikalne
i tworzyły ciąg 1..N. Zmiana kolejności SHALL NOT kasować żadnego wiersza
`lesson_progress` ani `test_attempts`.

*Uzasadnienie pełnej renumeracji:* `sequence_order` nie ma unikalności w bazie,
a `CourseAccess` wybiera poprzednika po tej kolumnie — duplikat czyni wybór
niedeterministycznym.

#### Scenario: Reorder niczego nie kasuje

- **WHEN** administrator zmienia kolejność kursów ścieżki przez
  `PATCH /admin/courses/reorder`
- **THEN** liczba wierszy `lesson_progress` i `test_attempts` jest **identyczna** przed
  i po operacji

#### Scenario: Pozycje po reorderze są unikalne

- **WHEN** administrator zmienia kolejność kursów ścieżki
- **THEN** wszystkie kursy ze ścieżki mają unikalne `sequence_order` tworzące ciąg 1..N

#### Scenario: Niepełna permutacja odrzucona

- **WHEN** administrator wysyła `PATCH /admin/courses/reorder` z listą pomijającą jeden
  z kursów ścieżki
- **THEN** odpowiedź to 422 `validation_failed`, a kolejność w bazie pozostaje
  niezmieniona

### Requirement: Podgląd wpływu zmiany kolejności przed zapisem

System SHALL udostępniać `POST /admin/courses/reorder/preview` przyjmujący ten sam
payload co `PATCH /admin/courses/reorder` i zwracający listę pozycji
`{user_id, first_name, last_name, course_id, course_title, from, to}`, gdzie `from`
i `to` należą do `locked | in_progress | completed`, wyłącznie dla par (osoba, kurs),
w których status faktycznie się zmienia. Podgląd SHALL liczyć statusy przez
`CourseAccess` i SHALL NOT reimplementować reguły odblokowań. Podgląd SHALL NOT zapisać
żadnej zmiany — w szczególności `sequence_order` wszystkich kursów SHALL pozostać
niezmienione po żądaniu. Zakres liczenia SHALL być zawężony do kont
`role ∈ {volunteer, student}` ze `status = 'active'` oraz do kursów, których
`sequence_order` faktycznie się zmienia.

#### Scenario: Podgląd nie zapisuje niczego

- **WHEN** administrator wywołuje `POST /admin/courses/reorder/preview` z kolejnością
  różną od bieżącej
- **THEN** odpowiedź to 200 z listą przejść, a `sequence_order` **wszystkich** kursów
  w bazie jest niezmienione

#### Scenario: Podgląd zgadza się z rzeczywistym skutkiem

- **WHEN** na seedzie demo administrator prosi o podgląd przestawienia kursu 3 przed
  kurs 2, a następnie wykonuje ten sam reorder naprawdę
- **THEN** podgląd zapowiada dla `marta@demo.pl` przejście `in_progress → locked` dla
  kursu 2, a `GET /courses` kontem marty po reorderze pokazuje dokładnie ten stan

#### Scenario: Zmiana bez wpływu na nikogo

- **WHEN** administrator prosi o podgląd kolejności identycznej z bieżącą
- **THEN** odpowiedź to 200 z pustą listą przejść

### Requirement: Audyt operacji zarządzania treścią

Każda udana operacja CMS SHALL rejestrować zdarzenie przez `AuditLog::record`
z użyciem wyłącznie slugów z rejestru §3.2 kontraktu: `course.created` przy utworzeniu
kursu, `course.deleted` przy usunięciu kursu, `course.updated` przy edycji kursu.
Operacje podrzędne — na lekcjach, na kolejności, na materiałach i przy zaproszeniach —
SHALL być zapisywane jako `course.updated` **na kursie**, z opisem operacji
w `details.op` (np. `lesson.deleted`, `lessons.reordered`, `courses.reordered`).
System SHALL NOT wprowadzać nowych slugów audytu poza rejestrem §3.2.

#### Scenario: CRUD kursu trafia do dziennika

- **WHEN** administrator kolejno tworzy, edytuje i usuwa kurs
- **THEN** w dzienniku audytu pojawiają się wpisy `course.created`, `course.updated`
  i `course.deleted` powiązane z tym administratorem i tym kursem

#### Scenario: Operacja na lekcji mapowana na `course.updated`

- **WHEN** administrator usuwa lekcję przez `DELETE /admin/lessons/{id}`
- **THEN** w dzienniku audytu pojawia się wpis `course.updated` na kursie tej lekcji,
  z `details.op` = `"lesson.deleted"` i identyfikatorem lekcji

### Requirement: Treść utworzona w panelu jest widoczna u uczestnika bez zmian w kodzie

Kurs utworzony i opublikowany przez CMS wraz z lekcjami SHALL pojawiać się u uczestnika
na liście `GET /courses` we właściwym miejscu ścieżki wynikającym z `sequence_order`,
bez żadnej zmiany w kodzie ścieżki uczestnika. Status kursu u uczestnika SHALL być
liczony wyłącznie przez `CourseAccess::state()`; CMS SHALL NOT wystawiać własnych pól
statusu ani postępu w zasobie administracyjnym.

#### Scenario: Nowy etap pojawia się na ścieżce uczestnika

- **WHEN** administrator tworzy kurs z `sequence_order` = 11, dodaje do niego dwie
  lekcje i publikuje go
- **THEN** `GET /courses` wywołane kontem `marta@demo.pl` zwraca ten kurs na końcu
  ścieżki, ze statusem policzonym przez `CourseAccess`, bez żadnego wdrożenia ani
  zmiany w kodzie H05
