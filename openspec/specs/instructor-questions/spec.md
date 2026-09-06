# instructor-questions Specification

## Purpose
Kanał pytań od uczestniczki do osoby prowadzącej, zaczepiony przy konkretnej lekcji:
pytanie trafia do właściwej osoby regułą dziedziczenia przypisań, prowadzący widzi
wyłącznie swoją skrzynkę z filtrem nieodpowiedzianych, a odpowiedź wraca do pytającego
przy tej samej lekcji wraz z powiadomieniem.

## Requirements

### Requirement: Zadanie pytania z lekcji

System SHALL przyjmować od uwierzytelnionego uczestnika (`volunteer`, `student`) z
aktywnym dostępem pytanie do lekcji przez `POST /lessons/{id}/questions` z jednym
polem wejściowym `question` — wymaganym, niepustym po przycięciu białych znaków
stringiem o długości najwyżej 2000 znaków. Odpowiedź MUST mieć status 201 i pełny
zasób pytania. Naruszenie reguł pola MUST dawać `422 validation_failed`. Pola
`user_id`, `lesson_id`, `answer`, `answered_by` i `answered_at` MUST być ignorowane,
jeżeli pojawią się w żądaniu.

Lekcja z kursu zablokowanego regułą `CourseAccess::state()` MUST odpowiadać
`403 course_locked` z tym samym kształtem `reason` co trasy H06. Lekcja nieistniejąca
MUST odpowiadać `404 not_found`. Rola spoza uczestników (`instructor`,
`project_manager`, `super_admin`) MUST otrzymać `403 forbidden`.

#### Scenario: Uczestniczka zadaje pytanie do odblokowanej lekcji

- **WHEN** `marta@demo.pl` woła `POST /lessons/{id}/questions` z
  `{"question": "Jak reagować na milczenie?"}` dla lekcji kursu 2
- **THEN** odpowiedź ma status 201, a `data` zawiera `question` o tej treści,
  `answer` równe `null`, `answered_at` równe `null` i `answered_by_name` równe `null`

#### Scenario: Pytanie do lekcji z kursu zablokowanego

- **WHEN** `marta@demo.pl` woła `POST /lessons/{id}/questions` dla lekcji kursu 3
- **THEN** odpowiedź ma status 403 z `error.code` = `course_locked`, a w bazie nie
  powstaje żaden rekord pytania

#### Scenario: Puste pytanie odrzucone

- **WHEN** uczestniczka woła `POST /lessons/{id}/questions` z `{"question": "   "}`
- **THEN** odpowiedź ma status 422 z `error.code` = `validation_failed` i kluczem
  `question` w `error.errors`

### Requirement: Wyznaczanie adresata regułą dziedziczenia

System SHALL wyznaczać adresata pytania **w chwili odczytu**, na podstawie aktywnych
przypisań (`course_assignments` bez `unassigned_at`), w kolejności: przypisanie do tej
lekcji (`lesson_id` równe identyfikatorowi lekcji) → przypisanie do kursu lekcji
(`lesson_id` równe `null`) → brak adresata. Reguła MUST pochodzić z jednego miejsca w
kodzie współdzielonego z pakietem H09; H17 MUST ją konsumować, a nie definiować
równolegle.

Pytanie MUST NOT przechowywać adresata — tożsamość osoby prowadzącej jest zapisywana
wyłącznie w chwili odpowiedzi, w polu `answered_by`. W konsekwencji zmiana przypisania
MUST przenosić wszystkie pytania jeszcze nieodpowiedziane do nowej osoby, a pytania
już odpowiedziane MUST pozostawać przy osobie, która odpowiedziała.

#### Scenario: Lekcja z własnym przypisaniem wygrywa z kursowym

- **WHEN** lekcja ma aktywne przypisanie do prowadzącej A, a jej kurs do prowadzącej B,
  i uczestniczka zadaje pytanie do tej lekcji
- **THEN** pytanie pojawia się w `GET /instructor/questions` prowadzącej A i nie
  pojawia się w skrzynce prowadzącej B

#### Scenario: Lekcja bez własnego przypisania dziedziczy prowadzącego kursu

- **WHEN** lekcja nie ma przypisania własnego, a jej kurs ma aktywne przypisanie do
  prowadzącej B, i uczestniczka zadaje pytanie do tej lekcji
- **THEN** pytanie pojawia się w `GET /instructor/questions` prowadzącej B

#### Scenario: Zmiana prowadzącego przenosi pytania nieodpowiedziane

- **WHEN** pytanie zadane przy przypisaniu prowadzącej A pozostaje nieodpowiedziane,
  a przypisanie zostaje zamknięte i kurs otrzymuje prowadzącą B
- **THEN** pytanie znika ze skrzynki prowadzącej A i pojawia się w skrzynce
  prowadzącej B

#### Scenario: Pytanie odpowiedziane zostaje u odpowiadającego

- **WHEN** prowadząca A odpowiedziała na pytanie, a następnie kurs otrzymuje
  prowadzącą B
- **THEN** pytanie ma nadal `answered_by` wskazujące prowadzącą A i nie trafia do
  skrzynki nieodpowiedzianych prowadzącej B

#### Scenario: Lekcja bez jakiegokolwiek przypisania

- **WHEN** uczestniczka zadaje pytanie do lekcji, której ani lekcja, ani kurs nie mają
  aktywnego przypisania
- **THEN** pytanie zostaje zapisane ze statusem nieodpowiedzianego, żadne powiadomienie
  `question.asked` nie powstaje, a pytanie nie pojawia się w skrzynce żadnej osoby
  prowadzącej

### Requirement: Skrzynka prowadzącego z filtrem nieodpowiedzianych

System SHALL udostępniać roli `instructor` przez `GET /instructor/questions`
standardowo paginowaną listę (`?page`, `?per_page` domyślnie 25, maksymalnie 100)
wyłącznie tych pytań, których adresatem jest wykonawca według reguły dziedziczenia,
oraz tych, na które wykonawca już odpowiedział. Lista MUST być sortowana po
`created_at` malejąco, a przy remisie po `id` malejąco. Parametr `?answered=false`
MUST zawężać wynik do pytań bez odpowiedzi, a `?answered=true` do odpowiedzianych.
`meta.extra` MUST zawierać dokładnie `unanswered` — liczbę nieodpowiedzianych pytań w
skrzynce wykonawcy, niezależną od paginacji i od filtra.

Każdy element MUST zawierać pełny zasób pytania rozszerzony o autora w kształcie
`"user": {"id", "first_name", "last_name"}` oraz o `lesson` w kształcie
`{"id", "title", "course": {"id", "slug", "title"}}`. Element MUST NOT zawierać
żadnych innych danych osobowych pytającego.

#### Scenario: Prowadząca widzi wyłącznie swoje pytania

- **WHEN** `joanna@demo.pl` woła `GET /instructor/questions`, a w bazie istnieją
  pytania do lekcji kursów prowadzonych przez inną osobę
- **THEN** odpowiedź zawiera wyłącznie pytania z kursów 1–3 i nie zawiera żadnego
  pytania cudzego

#### Scenario: Filtr nieodpowiedzianych i licznik

- **WHEN** skrzynka prowadzącej zawiera jedno pytanie nieodpowiedziane i dwa
  odpowiedziane, a wykonawca woła `GET /instructor/questions?answered=false`
- **THEN** `data` zawiera dokładnie jedno pytanie, a `meta.extra.unanswered` ma
  wartość `1`

#### Scenario: Rola spoza prowadzących nie ma dostępu do skrzynki

- **WHEN** `marta@demo.pl` woła `GET /instructor/questions`
- **THEN** odpowiedź ma status 403 z `error.code` = `forbidden`

### Requirement: Odpowiedź prowadzącego

System SHALL przyjmować od adresata pytania odpowiedź przez
`POST /instructor/questions/{id}/answer` z jednym polem `answer` — wymaganym,
niepustym po przycięciu białych znaków stringiem o długości najwyżej 5000 znaków.
Odpowiedź MUST mieć status 200 i pełny zasób pytania z ustawionymi `answer`,
`answered_by` (identyfikator wykonawcy) i `answered_at` (ISO 8601 UTC).

Pytanie, którego wykonawca nie jest adresatem, oraz pytanie nieistniejące MUST
odpowiadać `404 not_found` — istnienie cudzego pytania MUST NOT być ujawniane.
Pytanie już odpowiedziane MUST odpowiadać `403 entry_locked` bez zmiany rekordu,
bez powiadomienia i bez nadpisania `answered_by`. Puste `answer` MUST dawać
`422 validation_failed`.

#### Scenario: Prowadząca odpowiada na pytanie ze swojej skrzynki

- **WHEN** `joanna@demo.pl` woła `POST /instructor/questions/{id}/answer` z
  `{"answer": "Zostaw ciszę i poczekaj."}` dla pytania z kursu 2
- **THEN** odpowiedź ma status 200, `data.answer` ma tę treść, `data.answered_by`
  wskazuje `joanna@demo.pl`, a `data.answered_at` jest znacznikiem ISO 8601 UTC

#### Scenario: Cudze pytanie nieodróżnialne od nieistniejącego

- **WHEN** prowadząca woła `POST /instructor/questions/{id}/answer` dla pytania
  zaadresowanego do innej osoby
- **THEN** odpowiedź ma status 404 z `error.code` = `not_found`, identycznie jak dla
  identyfikatora nieistniejącego, a pytanie pozostaje nieodpowiedziane

#### Scenario: Powtórna odpowiedź zablokowana

- **WHEN** prowadząca woła `POST /instructor/questions/{id}/answer` dla pytania, na
  które już odpowiedziano
- **THEN** odpowiedź ma status 403 z `error.code` = `entry_locked`, a `answer`,
  `answered_by` i `answered_at` pozostają bez zmian

### Requirement: Odczyt własnych pytań przy lekcji

System SHALL udostępniać uczestnikowi przez `GET /lessons/{id}/questions` listę
wyłącznie jego własnych pytań do tej lekcji, wraz z odpowiedziami, posortowaną po
`created_at` malejąco, a przy remisie po `id` malejąco. Odpowiedź MUST używać
standardowej koperty z paginacją. Lekcja z kursu zablokowanego MUST odpowiadać
`403 course_locked`, a lekcja nieistniejąca `404 not_found`. Lista MUST NOT zawierać
pytań innych uczestników ani danych osobowych osoby odpowiadającej poza
`answered_by_name`.

Trasa jest rozszerzeniem kontraktu §2 i MUST zostać zatwierdzona przez strażnika
kontraktu, zanim pakiet zostanie zamknięty.

#### Scenario: Pytająca widzi swoją odpowiedź przy lekcji

- **WHEN** `marta@demo.pl` woła `GET /lessons/{id}/questions` dla lekcji, na której
  zadała pytanie i otrzymała odpowiedź
- **THEN** `data` zawiera jej pytanie z niepustym `answer`, `answered_at` i
  `answered_by_name`

#### Scenario: Uczestniczka nie widzi cudzych pytań

- **WHEN** dwie uczestniczki zadały pytania do tej samej lekcji, a jedna z nich woła
  `GET /lessons/{id}/questions`
- **THEN** `data` zawiera dokładnie jej własne pytanie

### Requirement: Powiadomienia pytania i odpowiedzi

System SHALL wysyłać przez `Notify::send` powiadomienie `question.asked` do adresata
wyznaczonego regułą dziedziczenia w chwili zapisania pytania oraz `question.answered`
do pytającego w chwili zapisania odpowiedzi. Oba powiadomienia MUST prowadzić linkiem
do właściwego ekranu: `question.asked` do skrzynki prowadzącego, `question.answered`
do strony kursu z lekcją. Żadna operacja H17 MUST NOT zapisywać zdarzenia audytowego —
rejestr §3.2 nie zawiera sluga `question.*`.

Powiadomienie MUST NOT powstawać dla operacji odrzuconej (403, 404, 422) ani dla
pytania bez adresata.

#### Scenario: Zadanie pytania powiadamia prowadzącego

- **WHEN** uczestniczka zadaje pytanie do lekcji z aktywnym przypisaniem
- **THEN** adresat ma nowe powiadomienie typu `question.asked`, a pytająca nie ma
  żadnego nowego powiadomienia

#### Scenario: Odpowiedź powiadamia pytającego

- **WHEN** prowadząca odpowiada na pytanie
- **THEN** pytająca ma nowe powiadomienie typu `question.answered` z linkiem do strony
  kursu tej lekcji

#### Scenario: Brak zdarzeń audytowych

- **WHEN** wykonane zostaną zadanie pytania i odpowiedź na nie
- **THEN** w `audit_log` nie przybywa żaden wpis pochodzący z pakietu H17

### Requirement: Treści pytań i odpowiedzi traktowane jako tekst

System SHALL przechowywać i zwracać treść pytania oraz odpowiedzi dokładnie tak, jak
została wprowadzona, bez interpretacji jako znaczników. Interfejs MUST renderować obie
treści jako tekst, nigdy jako HTML, a symulowana kopia e-mail MUST escapować treść
przed osadzeniem w `body_html`.

#### Scenario: Znaczniki nie są wykonywane

- **WHEN** uczestniczka zadaje pytanie o treści `<script>alert(1)</script>` i
  prowadząca otwiera skrzynkę
- **THEN** treść jest widoczna jako tekst, a przeglądarka nie wykonuje żadnego skryptu
