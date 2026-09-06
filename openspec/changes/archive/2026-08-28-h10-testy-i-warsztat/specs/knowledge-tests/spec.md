## Purpose

Test wiedzy na koniec kursu — dziesięć pytań jednokrotnego wyboru, oceniane wyłącznie po
stronie serwera, z limitem podejść i progiem zaliczenia sterowanym ustawieniami edycji.
Zaliczenie odblokowuje kolejny etap ścieżki. Historia podejść jest niezmienna względem
późniejszej edycji banku pytań.

## ADDED Requirements

### Requirement: Odczyt testu bez flag poprawności

System SHALL udostępniać uprawnionemu uczestnikowi treść testu przypisanego do kursu przez
`GET /courses/{slug}/test`. Odpowiedź MUST zawierać `test_id`, `pass_threshold`,
`attempts_used`, `attempts_limit` oraz listę pytań z odpowiedziami, **bez** pola wskazującego
poprawność którejkolwiek odpowiedzi. `pass_threshold` i `attempts_limit` MUST pochodzić z
nadpisania per kurs (`tests.pass_threshold` / `tests.attempts_limit`), a gdy nadpisanie jest
`null` — z ustawień aktywnej edycji. Żądanie dla kursu zablokowanego sekwencyjnie MUST zwrócić
403 `course_locked`, rozstrzygane wyłącznie regułą `CourseAccess::state()`.

#### Scenario: Uczestnik widzi pytania bez flag poprawności

- **WHEN** uprawniony uczestnik woła `GET /courses/{slug}/test` dla odblokowanego kursu
- **THEN** odpowiedź ma status 200, a żadna odpowiedź w `data.questions` nie zawiera
  informacji, czy jest poprawna

#### Scenario: Zablokowany kurs odrzuca dostęp do testu

- **WHEN** uczestnik bez ukończonego wymaganego etapu woła `GET /courses/{slug}/test`
- **THEN** odpowiedź ma status 403 z `error.code` = `course_locked`

### Requirement: Ocenianie podejścia wyłącznie po stronie serwera

System SHALL przyjmować podejście do testu przez `POST /tests/{id}/attempts` z zestawem
odpowiedzi (`question_id => answer_id`) i oceniać je wyłącznie po stronie serwera, na
podstawie danych niedostępnych klientowi przed wysłaniem podejścia. Wynik MUST być liczony
jako zaokrąglony procent poprawnych odpowiedzi względem wszystkich pytań testu. Odpowiedź
wskazująca pytanie spoza testu lub odpowiedź spoza wskazanego pytania MUST zwrócić 422
`validation_failed`.

#### Scenario: Poprawny zestaw odpowiedzi tworzy podejście

- **WHEN** uprawniony uczestnik z niewyczerpanym limitem woła
  `POST /tests/{id}/attempts` z poprawnym zestawem odpowiedzi
- **THEN** odpowiedź ma status 201 i zawiera `attempt_number`, `score_percent`, `passed`
  oraz `wrong_question_ids`

#### Scenario: Odpowiedź spoza pytania odrzucona

- **WHEN** uczestnik woła `POST /tests/{id}/attempts` z odpowiedzią, która nie należy do
  wskazanego pytania tego testu
- **THEN** odpowiedź ma status 422 z `error.code` = `validation_failed`

### Requirement: Próg zaliczenia rozstrzyga wynik

System SHALL uznawać podejście za zaliczone, gdy `score_percent` jest większy lub równy
progowi zaliczenia testu, i za niezaliczone w przeciwnym razie. Zaliczenie MUST odblokowywać
kolejny etap ścieżki uczestnika przez `CourseAccess`.

#### Scenario: Wynik poniżej progu nie zalicza

- **WHEN** uczestnik składa podejście z wynikiem 79%, a próg zaliczenia wynosi 80%
- **THEN** odpowiedź zawiera `passed` = `false`

#### Scenario: Wynik na progu zalicza i odblokowuje kolejny etap

- **WHEN** uczestnik składa podejście z wynikiem 80% przy progu 80%
- **THEN** odpowiedź zawiera `passed` = `true`
- **AND** kolejny etap ścieżki, dotąd zablokowany przez ten kurs, staje się dostępny

### Requirement: Numeracja podejść bez dziur i duplikatów pod równoległością

System SHALL nadawać numery podejść w ciągu bez dziur, zaczynając od 1, osobno dla każdej
pary (użytkownik, test), również gdy ten sam użytkownik składa wiele podejść równolegle.
Nadanie numeru MUST odbywać się atomowo z zapisem podejścia. Baza danych MUST wymuszać
unikalność pary (użytkownik, test, numer podejścia) jako ostatnia linia obrony niezależna od
logiki aplikacji.

#### Scenario: Kolejne podejścia tworzą ciąg bez dziur

- **WHEN** ten sam uczestnik składa osiem podejść do tego samego testu, jedno po drugim
- **THEN** numery podejść tworzą ciąg `1, 2, 3, 4, 5, 6, 7, 8` bez powtórzeń i bez dziur

#### Scenario: Baza blokuje zduplikowany numer podejścia

- **WHEN** dwa rekordy podejść tego samego użytkownika i testu próbują otrzymać ten sam
  `attempt_number`
- **THEN** zapis drugiego rekordu kończy się błędem integralności bazy danych

### Requirement: Limit podejść

System SHALL odmówić przyjęcia podejścia, gdy liczba dotychczasowych podejść użytkownika do
danego testu osiągnęła limit. Odmowa MUST mieć status 403 z kodem `attempts_exhausted` i MUST
nastąpić przed jakąkolwiek próbą zapisu nowego podejścia.

#### Scenario: Czwarte podejście przy limicie trzech odrzucone

- **WHEN** uczestnik z trzema wykorzystanymi podejściami (limit = 3) woła
  `POST /tests/{id}/attempts`
- **THEN** odpowiedź ma status 403 z `error.code` = `attempts_exhausted`
- **AND** żadne nowe podejście nie zostaje zapisane

### Requirement: Powiadomienie po wyczerpującym limit niezaliczonym podejściu

System SHALL wysłać powiadomienie typu `attempt.failed_final` do ról administracyjnych
odpowiedzialnych za interwencję, gdy podejście wyczerpujące limit kończy się porażką.

#### Scenario: Ostatnie nieudane podejście powiadamia opiekunów

- **WHEN** uczestnik składa ostatnie dostępne podejście (limit osiągnięty) i nie zalicza go
- **THEN** każde konto z rolą odpowiedzialną za reset limitu otrzymuje powiadomienie
  `attempt.failed_final` wskazujące tego uczestnika

### Requirement: Snapshot treści pytań zamrożony przy podejściu

System SHALL zapisywać przy każdym podejściu zamrożony obraz treści pytań i odpowiedzi
(łącznie z ich poprawnością) w chwili składania tego podejścia. Ocena podejścia MUST opierać
się wyłącznie na tym zamrożonym obrazie. Późniejsza edycja lub usunięcie pytania w banku pytań
MUST NOT zmieniać wyniku ani treści już złożonego podejścia.

#### Scenario: Edycja pytania nie zmienia historycznego wyniku

- **WHEN** administracja edytuje treść pytania po tym, jak uczestnik złożył podejście
  zawierające to pytanie
- **THEN** historyczne podejście zachowuje pierwotny `score_percent` i pierwotną treść pytania

#### Scenario: Usunięcie pytania nie zmienia historycznego podejścia

- **WHEN** administracja usuwa pytanie z banku po tym, jak uczestnik złożył podejście
  zawierające to pytanie
- **THEN** historyczne podejście pozostaje niezmienione i nadal odczytywalne

### Requirement: Historia własnych podejść

System SHALL udostępniać uczestnikowi listę jego własnych podejść do danego testu przez
`GET /tests/{id}/attempts`, standardową kopertą paginowaną, z `meta.extra` zawierającym próg
zaliczenia i limit podejść.

#### Scenario: Uczestnik widzi historię swoich podejść

- **WHEN** uczestnik z dwoma złożonymi podejściami woła `GET /tests/{id}/attempts`
- **THEN** odpowiedź zawiera oba podejścia z numerem, wynikiem i statusem zaliczenia

### Requirement: Bank pytań w panelu administracji

System SHALL udostępniać rolom administracyjnym zarządzanie bankiem pytań danego testu:
odczyt pełnej listy z flagami poprawności, tworzenie, edycję i usuwanie pytań. Każde pytanie
MUST mieć dokładnie jedną odpowiedź oznaczoną jako poprawną, wymuszane przy tworzeniu i przy
edycji obejmującej odpowiedzi.

#### Scenario: Nowe pytanie wymaga dokładnie jednej poprawnej odpowiedzi

- **WHEN** administracja tworzy pytanie z zerem albo z dwiema odpowiedziami oznaczonymi jako
  poprawne
- **THEN** odpowiedź ma status 422 z komunikatem o wymogu dokładnie jednej poprawnej
  odpowiedzi

#### Scenario: Administracja edytuje zestaw odpowiedzi

- **WHEN** administracja wysyła `PATCH /admin/questions/{id}` z odpowiedziami zawierającymi
  część istniejących `id` i jedną nową pozycję bez `id`
- **THEN** istniejące odpowiedzi zostają zaktualizowane, nowa pozycja zostaje utworzona, a
  odpowiedzi pominięte w żądaniu zostają usunięte

### Requirement: Reset limitu podejść przez opiekuna

System SHALL pozwalać rolom administracyjnym na zresetowanie limitu podejść użytkownika do
danego testu przez `POST /admin/tests/{testId}/users/{userId}/reset-attempts`, wyłącznie z
podanym powodem. Reset MUST usunąć dotychczasowe podejścia tego użytkownika do tego testu, tak
że kolejne podejście otrzyma numer 1. Brak powodu MUST zwrócić 422. Reset MUST utworzyć wpis
audytu `attempts.reset` zawierający wykonawcę, powód i liczbę usuniętych podejść.

#### Scenario: Reset bez powodu odrzucony

- **WHEN** administracja woła reset limitu bez pola `reason`
- **THEN** odpowiedź ma status 422 z komunikatem o wymogu podania powodu

#### Scenario: Reset umożliwia nowe podejście od numeru 1

- **WHEN** administracja resetuje limit użytkownika, który wyczerpał wszystkie podejścia
- **THEN** ten użytkownik może złożyć nowe podejście, które otrzymuje numer 1
- **AND** powstaje wpis audytu `attempts.reset` wskazujący wykonawcę, powód i liczbę usuniętych
  podejść

### Requirement: Ekran testu dla uczestnika

System SHALL udostępniać ekran `#/panel/kursy/:slug/test` prezentujący pytania pojedynczo,
bez możliwości cofnięcia się do poprzedniego pytania, a po złożeniu podejścia — ekran wyniku z
procentem, progiem, odznaką zaliczenia i listą błędnie odpowiedzianych pytań. Ekran MUST
pokazywać czytelny komunikat, gdy kurs jest zablokowany lub limit podejść wyczerpany. Teksty
interfejsu MUST być po polsku.

#### Scenario: Uczestnik przechodzi test bez możliwości cofania

- **WHEN** uczestnik odpowiada na pytanie i przechodzi do następnego
- **THEN** ekran nie udostępnia opcji powrotu do poprzedniego pytania

#### Scenario: Ekran wyczerpanego limitu

- **WHEN** uczestnik bez dostępnych podejść otwiera ekran testu
- **THEN** ekran pokazuje czytelny komunikat o wyczerpanym limicie zamiast formularza podejścia
