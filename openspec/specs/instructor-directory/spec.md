# instructor-directory Specification

## Purpose
Wizytówki prowadzących dają uczestnikom i administracji jedno miejsce z informacją,
kto prowadzi program: specjalizacje, opis, doświadczenie, miasto, odpowiedzialności
i własny superwizor prowadzącego, plus lista prowadzonych kursów. Prowadzący
utrzymuje własną wizytówkę samodzielnie.

## Requirements

### Requirement: Lista wizytówek prowadzących
System SHALL udostępniać `GET /instructors` zwracające paginowaną listę wizytówek
prowadzących w kopercie `{data, meta}`. Trasa MUST wymagać uwierzytelnienia
(`auth:sanctum`) i MUST być dostępna dla każdej zalogowanej roli. Trasa MUST NOT
być publiczna (nie trafia do `config/public_routes.php`). Paginacja MUST używać
`page` i `per_page` (domyślnie 25, maksymalnie 100). Lista MUST zawierać wyłącznie
konta z rolą `instructor`, które mają rekord `instructor_profiles`. Każdy element
MUST zawierać co najmniej `id` (identyfikator wizytówki), `user_id`, `first_name`,
`last_name`, `city`, `specializations` (lista), `bio`, `experience`,
`responsibilities` (lista) oraz `courses` jako listę obiektów
`{id, slug, title, sequence_order}` z aktywnie prowadzonymi kursami. DTO MUST NOT
zawierać danych wrażliwych (bez `pesel`, bez adresu, bez `email`).

#### Scenario: Zalogowany uczestnik widzi listę wizytówek
- **WHEN** uczestnik wywołuje `GET /instructors` na stanie z seeda demo
- **THEN** odpowiedź to 200, `data` zawiera wizytówkę Joanny z jej
  specjalizacjami i listą `courses` obejmującą kursy 1–3, a `meta` niesie
  `current_page`, `per_page`, `total` i `last_page`

#### Scenario: DTO wizytówki nie ujawnia danych wrażliwych
- **WHEN** dowolna zalogowana rola pobiera `GET /instructors`
- **THEN** żaden element `data` nie zawiera pól `pesel`, `address` ani `email`

#### Scenario: Brak tokenu
- **WHEN** żądanie `GET /instructors` przychodzi bez nagłówka `Authorization`
- **THEN** odpowiedź to 401 `unauthenticated`

### Requirement: Pojedyncza wizytówka prowadzącego
System SHALL udostępniać `GET /instructors/{id}` zwracające jedną wizytówkę w
kopercie `{data}`. Trasa MUST wymagać uwierzytelnienia. Odpowiedź MUST zawierać
te same pola co element listy oraz dodatkowo `supervisor` jako `{id, name}` albo
`null` (własny superwizor prowadzącego z `instructor_profiles.supervisor_id`).
Nieznany identyfikator albo identyfikator konta bez wizytówki MUST zwracać 404
`not_found` (nie ujawniamy istnienia rekordu).

#### Scenario: Wizytówka z własnym superwizorem
- **WHEN** zalogowany użytkownik wywołuje `GET /instructors/{id}` dla prowadzącego,
  który ma ustawiony `supervisor_id`
- **THEN** odpowiedź to 200, a `data.supervisor` zawiera `{id, name}` tego
  superwizora

#### Scenario: Wizytówka bez superwizora
- **WHEN** zalogowany użytkownik wywołuje `GET /instructors/{id}` dla prowadzącego
  bez `supervisor_id`
- **THEN** odpowiedź to 200, a `data.supervisor` to `null`

#### Scenario: Nieznana wizytówka
- **WHEN** zalogowany użytkownik wywołuje `GET /instructors/{id}` dla
  nieistniejącego identyfikatora albo konta bez rekordu `instructor_profiles`
- **THEN** odpowiedź to 404 `not_found`

### Requirement: Prowadzący edytuje własną wizytówkę
System SHALL udostępniać `GET /me/instructor-profile` i
`PATCH /me/instructor-profile` dla zalogowanego prowadzącego. Obie trasy MUST
wymagać roli `instructor`; inna rola MUST otrzymać 403 `forbidden`. `PATCH` MUST
być walidowane `FormRequest` i MUST przyjmować wyłącznie pola wizytówki
(`specializations`, `bio`, `experience`, `city`, `responsibilities`);
`specializations` i `responsibilities` MUST być listami stringów. `PATCH` MUST NOT
pozwalać na zmianę `user_id` ani `supervisor_id` (własny superwizor prowadzącego
jest ustawiany przez administrację, nie przez samego prowadzącego). Jeśli
prowadzący nie ma jeszcze rekordu `instructor_profiles`, pierwszy `PATCH` MUST go
utworzyć. Odpowiedź MUST zwracać pełną wizytówkę w kopercie `{data}`.

#### Scenario: Prowadzący aktualizuje specjalizacje i miasto
- **WHEN** zalogowany prowadzący wysyła `PATCH /me/instructor-profile` z
  `specializations` i `city`
- **THEN** odpowiedź to 200 z zaktualizowaną wizytówką, a zmiany są widoczne w
  kolejnym `GET /me/instructor-profile`

#### Scenario: Rola inna niż instructor
- **WHEN** użytkownik z rolą `volunteer` wywołuje `GET /me/instructor-profile`
- **THEN** odpowiedź to 403 `forbidden`

#### Scenario: Próba zmiany pola spoza wizytówki
- **WHEN** prowadzący wysyła `PATCH /me/instructor-profile` z polem
  `supervisor_id` albo `user_id`
- **THEN** pole jest ignorowane albo odpowiedź to 422 `validation_failed`, a
  wartość w bazie nie zmienia się

#### Scenario: Pierwsza edycja tworzy wizytówkę
- **WHEN** prowadzący bez rekordu `instructor_profiles` wysyła poprawny
  `PATCH /me/instructor-profile`
- **THEN** odpowiedź to 200, rekord `instructor_profiles` zostaje utworzony i
  powiązany z jego kontem

### Requirement: Kursy prowadzone przez zalogowanego prowadzącego
System SHALL udostępniać `GET /instructor/courses` zwracające w kopercie `{data}`
listę kursów, do których zalogowany prowadzący ma aktywne przypisanie kursowe
(`course_assignments` z `lesson_id = null` i `unassigned_at = null`). Trasa MUST
wymagać roli `instructor`. Każdy element MUST zawierać co najmniej
`id`, `slug`, `title`, `sequence_order`. Lista MUST być posortowana po
`sequence_order` rosnąco.

#### Scenario: Prowadzący widzi swoje kursy
- **WHEN** Joanna (prowadząca kursy 1–3 na seedzie demo) wywołuje
  `GET /instructor/courses`
- **THEN** odpowiedź to 200, `data` zawiera dokładnie kursy 1–3 uporządkowane po
  `sequence_order`

#### Scenario: Prowadzący bez przypisań
- **WHEN** prowadzący bez żadnego aktywnego przypisania kursowego wywołuje
  `GET /instructor/courses`
- **THEN** odpowiedź to 200 z pustą listą `data`

#### Scenario: Rola inna niż instructor
- **WHEN** użytkownik z rolą `project_manager` wywołuje `GET /instructor/courses`
- **THEN** odpowiedź to 403 `forbidden`
