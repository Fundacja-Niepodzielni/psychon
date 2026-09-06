## Purpose

Katalog etapów ścieżki uczestnika z twardą regułą sekwencyjnego odblokowania: lista
kursów ze statusem i postępem, widok pojedynczego kursu z lekcjami i materiałami,
egzekwowanie blokady po stronie serwera oraz zdarzenie informujące o odblokowaniu
kolejnego etapu.

## ADDED Requirements

### Requirement: Katalog etapów ze statusem i postępem

System SHALL udostępniać uwierzytelnionemu użytkownikowi listę kursów widocznych dla
jego roli przez `GET /courses`, posortowaną według `sequence_order` (kursy bez
sekwencji na końcu), a w jej ramach alfabetycznie po tytule. Każda pozycja MUST
zawierać `id`, `slug`, `title`, `sequence_order`, `product_group`, `status`
(`locked | in_progress | completed`) oraz `progress_percent`, liczone regułą
`CourseAccess` ze startera.

#### Scenario: Statusy uczestniczki zgodne z seedem demo

- **WHEN** `marta@demo.pl` woła `GET /courses`
- **THEN** kurs 1 ma `status = "completed"` i `progress_percent = 100`, kurs 2 ma
  `status = "in_progress"` i `progress_percent = 40`, a kursy 3–10 mają
  `status = "locked"` i `progress_percent = 0`

### Requirement: Widoczność katalogu według roli

System SHALL zawężać zbiór kursów widocznych w `GET /courses` i `GET /courses/{slug}`
wyłącznie do opublikowanych kursów właściwych dla roli wykonawcy, zanim zapyta o
regułę odblokowania: `student` widzi wyłącznie kursy poza sekwencją
(`sequence_order IS NULL` — „zaproszone"/webinary); `volunteer` widzi wyłącznie kursy
ścieżki (`sequence_order IS NOT NULL`); `instructor` widzi wyłącznie kursy, do których
ma aktywne przypisanie kursowe; `project_manager` i `super_admin` widzą wszystkie
opublikowane kursy. Kurs spoza tego zbioru MUST być nieodróżnialny od nieistniejącego
— `GET /courses/{slug}` MUST zwrócić 404 `not_found`, nie 403.

#### Scenario: Student widzi wyłącznie kurs zaproszony

- **WHEN** `filip@demo.pl` (rola `student`) woła `GET /courses`
- **THEN** odpowiedź zawiera wyłącznie kursy z `sequence_order = null` i nie zawiera
  żadnego etapu ścieżki

#### Scenario: Prowadzący widzi wyłącznie przypisane kursy

- **WHEN** `joanna@demo.pl` (rola `instructor`, przypisana do kursów 1–3) woła
  `GET /courses`
- **THEN** odpowiedź zawiera dokładnie kursy 1–3

#### Scenario: Kurs spoza widoczności roli odpowiada jak nieistniejący

- **WHEN** uczestnik woła `GET /courses/{slug}` dla kursu spoza swojej roli lub grupy
  produktowej
- **THEN** odpowiedź ma status 404 z `error.code` = `not_found`

### Requirement: Szczegóły kursu z lekcjami i materiałami

System SHALL udostępniać przez `GET /courses/{slug}` widoczny i odblokowany kurs wraz
z polami listy, prowadzącym (`instructor.id`, `instructor.name`, gdy przypisany),
listą lekcji (`id`, `title`, `sequence_order`, `duration_seconds`, `is_completed`) oraz
listą materiałów kursu i jego lekcji łącznie, posortowaną po `id`.

#### Scenario: Szczegóły odblokowanego kursu

- **WHEN** uprawniony uczestnik woła `GET /courses/{slug}` dla odblokowanego kursu z
  materiałem
- **THEN** odpowiedź ma status 200 i zawiera `lessons` z flagami `is_completed` oraz
  `materials` z co najmniej jedną pozycją

### Requirement: Egzekwowanie sekwencyjnego odblokowania

System SHALL egzekwować regułę `CourseAccess::state()` ze startera na granicy HTTP dla
ról uczestniczących (`volunteer`, `student`): żądanie `GET /courses/{slug}` kursu w
stanie `locked` MUST zwrócić 403 `course_locked` z `reason.required_course_id` i
`reason.missing`, także gdy adres wpisano ręcznie z pominięciem linku z listy.

#### Scenario: Zablokowany etap odrzucony z powodem

- **WHEN** `marta@demo.pl` woła `GET /courses/interwencja-kryzysowa` (etap 3, przy
  nieukończonym etapie 2)
- **THEN** odpowiedź ma status 403, `error.code` = `course_locked`,
  `error.reason.required_course_id` wskazuje etap 2, a `error.reason.missing`
  wymienia brakujące warunki (`lessons`, `test`)

### Requirement: Sekwencyjna blokada nie obowiązuje ról nieuczestniczących

System SHALL sprowadzać status `locked` do `in_progress` w serializacji katalogu dla
ról spoza `volunteer`/`student` (`instructor`, `project_manager`, `super_admin`) oraz
SHALL NOT egzekwować `course_locked` na `GET /courses/{slug}` dla tych ról — reguła
sekwencji dotyczy wyłącznie uczestniczek uczących się, nie osób zarządzających
treścią. **Status: oczekuje na zatwierdzenie strażnika kontraktu** (odstępstwo 1,
`DEMO/H05.md`) — reguła nie jest zapisana w żadnym dokumencie źródłowym.

#### Scenario: Administracja nie widzi kłódek

- **WHEN** `admin@demo.pl` (rola `super_admin`) woła `GET /courses`
- **THEN** żaden kurs nie ma `status = "locked"`, niezależnie od faktycznego stanu
  `CourseAccess`

#### Scenario: Prowadzący otwiera dowolny swój kurs bez blokady

- **WHEN** `joanna@demo.pl` woła `GET /courses/{slug}` dla kursu, do którego jest
  przypisana, niezależnie od kolejności w sekwencji
- **THEN** odpowiedź ma status 200, nie 403 `course_locked`

### Requirement: Zdarzenie odblokowania etapu, ogłaszane dokładnie raz

System SHALL wysyłać powiadomienie `course.unlocked` dokładnie raz na parę
(użytkownik, etap), gdy etap o `sequence_order > 1` przechodzi ze stanu `locked` do
stanu innego niż `locked`, a użytkownik nie ma jeszcze żadnego postępu w lekcjach tego
etapu. Ponowne odpytanie katalogu MUST NOT tworzyć kolejnych powiadomień dla już
ogłoszonego etapu. Etap już rozpoczęty w chwili pierwszego sprawdzenia MUST NOT zostać
ogłoszony retroaktywnie.

#### Scenario: Pierwsze odblokowanie wysyła powiadomienie

- **WHEN** uczestniczka kończy komplet lekcji i test wymagany przez etap 2, a
  następnie woła `GET /courses`
- **THEN** powstaje dokładnie jedno powiadomienie `course.unlocked` wskazujące etap 3,
  z linkiem `/panel/kursy/{slug etapu 3}`

#### Scenario: Powtórne odpytanie nie duplikuje ogłoszenia

- **WHEN** ten sam uczestnik woła `GET /courses` dwa razy z rzędu po odblokowaniu
  etapu
- **THEN** liczba powiadomień `course.unlocked` dla tego etapu pozostaje równa 1

### Requirement: Filtr grup produktowych

System SHALL przyjmować opcjonalny parametr `?product_group=` na `GET /courses` i
zawężać wynik do podanej wartości, ORAZ SHALL zawężać katalog niejawnie do grupy
produktowej użytkownika (`courses.product_group IN (users.product_group, 'both')`),
niezależnie od parametru zapytania. Gdy `users.product_group = 'both'`, zawężenie
niejawne SHALL NOT ograniczać wyniku do kursów `both` — konto `both` widzi kursy
wszystkich grup. **Status: oczekuje na zatwierdzenie strażnika kontraktu**
(odstępstwo 6, `DEMO/H05.md`) — interpretacja `'both'` jako brak zawężenia nie wynika
wprost z żadnego dokumentu źródłowego.

#### Scenario: Zawężenie do jednej grupy produktowej

- **WHEN** użytkownik z `product_group = "psychon"` woła `GET /courses`
- **THEN** odpowiedź zawiera wyłącznie kursy z `product_group` równym `"psychon"` lub
  `"both"`

#### Scenario: Konto „both" nie jest zawężane

- **WHEN** użytkownik z `product_group = "both"` woła `GET /courses`
- **THEN** odpowiedź zawiera kursy wszystkich grup produktowych, nie wyłącznie `both`

### Requirement: Pobranie materiału podpisanym wygasającym linkiem

System SHALL udostępniać plik materiału przez adres podpisany, ważny 15 minut, wydany
dla konkretnego konta (`u`). Żądanie z ważnym podpisem MUST ponownie zweryfikować w
chwili pobrania: aktywność dostępu czasowego (403 `access_expired`, gdy wygasł i
program nieukończony), widoczność kursu materiału dla wykonawcy (404, gdy poza
zakresem roli) oraz stan odblokowania dla ról uczestniczących (403 `course_locked`,
gdy etap jest zablokowany w chwili pobrania). Podpis wygasły lub ze zmienionym
parametrem MUST zostać odrzucony przez mechanizm podpisanych adresów startera.

#### Scenario: Właściciel pobiera materiał odblokowanego etapu

- **WHEN** uprawniony uczestnik otwiera `download_url` materiału z odblokowanego etapu
  przed upływem 15 minut
- **THEN** odpowiedź zwraca plik materiału

#### Scenario: Dostęp wygasły w chwili pobrania odrzucony

- **WHEN** posiadacz ważnego podpisu, którego `access_expires_at` minął, a program nie
  jest ukończony, otwiera `download_url`
- **THEN** odpowiedź ma status 403 z `error.code` = `access_expired`

#### Scenario: Etap zablokowany w chwili pobrania odrzucony

- **WHEN** etap materiału staje się zablokowany między wydaniem linku a jego użyciem, a
  uczestnik otwiera `download_url`
- **THEN** odpowiedź ma status 403 z `error.code` = `course_locked`

### Requirement: Rozmiar pliku w obiekcie materiału

Obiekt materiału w `GET /courses/{slug}` SHALL zawierać pole `size` (liczba bajtów,
integer) obok `id`, `name` i `download_url`. **Status: oczekuje na zatwierdzenie
strażnika kontraktu** (odstępstwo 7, `DEMO/H05.md`) — kontrakt §2 definiuje materiał
bez tego pola; pakiet je dodał świadomie, żeby front mógł pokazać czytelny rozmiar
pliku wymagany przez plan pakietu.

#### Scenario: Materiał niesie rozmiar pliku

- **WHEN** uprawniony uczestnik woła `GET /courses/{slug}` dla kursu z materiałem
- **THEN** każda pozycja `materials` zawiera `size` jako liczbę całkowitą bajtów
