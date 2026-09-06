# admin-people Specification

## Purpose

Panel osób administracji daje jedno miejsce, w którym widać „na czym stoi każda
osoba": filtrowaną listę kont, kartę osoby z profilem i postępami z jednego
agregatora, oraz operacje na koncie (tworzenie z zaproszeniem, edycja e-maila,
blokada z powodem) — każda z wpisem audytu.

## Requirements

### Requirement: Lista osób z filtrem, wyszukiwaniem i paginacją
System SHALL udostępniać `GET /admin/users` zwracające paginowaną listę kont w
kopercie `{data, meta}`. Trasa MUST wymagać uwierzytelnienia i roli
administracyjnej (`project_manager` lub `super_admin`); inne role otrzymują 403
`forbidden`. Lista MUST wspierać płaski filtr `role`, filtr `status`
(`active` | `blocked`), wyszukiwanie `search` po imieniu, nazwisku i adresie
e-mail (dopasowanie częściowe, bez rozróżniania wielkości liter) oraz sortowanie
`sort` z domyślnym `-created_at`. Paginacja MUST używać `page` i `per_page`
(domyślnie 25, maksymalnie 100). Każdy element listy MUST zawierać co najmniej
`id`, `first_name`, `last_name`, `email`, `role`, `status`, `product_group`,
`access_expires_at`, `program_completed_at`, `created_at`.

#### Scenario: Filtr roli i wyszukiwanie na seedach demo
- **WHEN** administrator wywołuje `GET /admin/users?role=volunteer&search=demo`
- **THEN** odpowiedź to 200, `data` zawiera wyłącznie konta z rolą `volunteer`
  pasujące do frazy `demo`, a `meta` niesie `current_page`, `per_page`, `total`
  i `last_page`

#### Scenario: Sortowanie domyślne
- **WHEN** administrator wywołuje `GET /admin/users` bez parametru `sort`
- **THEN** rekordy są uporządkowane malejąco po `created_at`

#### Scenario: Rola bez dostępu
- **WHEN** użytkownik z rolą `volunteer` wywołuje `GET /admin/users`
- **THEN** odpowiedź to 403 `forbidden`

#### Scenario: Brak tokenu
- **WHEN** żądanie `GET /admin/users` przychodzi bez nagłówka `Authorization`
- **THEN** odpowiedź to 401 `unauthenticated`

### Requirement: Karta osoby w kształcie kontraktu
System SHALL udostępniać `GET /admin/users/{id}` zwracające kartę osoby w
kopercie `{data}` z polami `profile`, `progress`, `documents`,
`recent_notifications` i `audit_entries`. `profile` MUST mieć ten sam kształt co
`GET /me` i MUST zawierać pełny numer PESEL (administracja i właściciel widzą
PESEL bez maskowania). `progress` MUST pochodzić z tego samego źródła co pulpit,
raport i warunki certyfikatu (`ProgressAggregator`) i zawierać `courses_done`,
`courses_total`, `hours_accepted` (string dziesiętny), `supervision_present` oraz
`workshop_done`. `documents` MUST być listą obiektów `{id, type, number}` dla tej
osoby. `recent_notifications` MUST być listą najnowszych powiadomień tej osoby.
`audit_entries` MUST zawierać wpisy audytu, których podmiotem jest ta osoba,
najnowsze pierwsze. Trasa MUST wymagać roli administracyjnej. Nieznany
identyfikator MUST zwracać 404 `not_found`.

#### Scenario: Karta marty zgodna z danymi demo
- **WHEN** administrator wywołuje `GET /admin/users/{id}` dla konta
  `marta@demo.pl` na stanie z seeda demo
- **THEN** `data.progress` = `courses_done` 1, `courses_total` 10,
  `hours_accepted` `"41.5"`, `supervision_present` 5, `workshop_done` `false`
- **AND** liczby te są identyczne z wynikiem `ProgressAggregator` użytym na
  pulpicie i w raporcie

#### Scenario: PESEL widoczny dla administracji
- **WHEN** administrator otwiera kartę osoby z ustawionym numerem PESEL
- **THEN** `data.profile.pesel` zawiera pełny, niemaskowany numer

#### Scenario: Sekcje karty
- **WHEN** administrator otwiera kartę osoby z wygenerowanym porozumieniem
  wolontariackim i przynajmniej jednym powiadomieniem
- **THEN** `data.documents` zawiera wpis `{id, type, number}` tego dokumentu,
  a `data.recent_notifications` zawiera co najmniej to powiadomienie

#### Scenario: Nieznana osoba
- **WHEN** administrator wywołuje `GET /admin/users/{id}` dla nieistniejącego
  identyfikatora
- **THEN** odpowiedź to 404 `not_found`

### Requirement: Tworzenie konta z zaproszeniem
System SHALL udostępniać `POST /admin/users` tworzące konto na podstawie
`first_name`, `last_name`, `email`, `role` oraz opcjonalnych pól profilu.
Żądanie MUST być walidowane `FormRequest`: `email` unikalny w tabeli `users`,
`role` ze słownika. Konto MUST powstać ze statusem `active`, bez hasła i z
wygenerowanym `activation_token`. System MUST zapisać symulowany rekord e-mail
zaproszenia (status `simulated`) z linkiem `auth/activate`. Operacja MUST
przejść przez `AuditLog::record` ze slugiem `user.created`. Duplikat adresu
e-mail istniejącego konta MUST zwracać 409 `email_already_registered`.

#### Scenario: Utworzenie konta wolontariusza
- **WHEN** administrator wysyła `POST /admin/users` z poprawnymi danymi i rolą
  `volunteer`
- **THEN** odpowiedź to 201 z zasobem nowego konta, powstaje `activation_token`,
  zapisany jest rekord e-mail o statusie `simulated`, a w audycie pojawia się
  wpis `user.created`

#### Scenario: Zajęty adres e-mail
- **WHEN** administrator wysyła `POST /admin/users` z adresem e-mail należącym do
  istniejącego konta
- **THEN** odpowiedź to 409 `email_already_registered`

#### Scenario: Braki walidacyjne
- **WHEN** administrator wysyła `POST /admin/users` bez `email`
- **THEN** odpowiedź to 422 `validation_failed` z polem `email` w `errors`

### Requirement: Edycja konta z audytem
System SHALL udostępniać `PATCH /admin/users/{id}` zmieniające pola konta, w tym
`email` (jedyna droga zmiany adresu e-mail w systemie). Zmiany MUST być
walidowane `FormRequest`, a nowy `email` MUST pozostać unikalny. Każda udana
edycja MUST przejść przez `AuditLog::record` ze slugiem `user.updated`
zawierającym listę zmienionych pól. Nieznany identyfikator MUST zwracać 404
`not_found`.

#### Scenario: Zmiana adresu e-mail
- **WHEN** administrator wysyła `PATCH /admin/users/{id}` z nowym, wolnym adresem
  `email`
- **THEN** odpowiedź to 200 ze zaktualizowanym zasobem, a w audycie pojawia się
  wpis `user.updated` wymieniający pole `email`

#### Scenario: Konflikt adresu e-mail
- **WHEN** administrator wysyła `PATCH /admin/users/{id}` z adresem e-mail
  zajętym przez inne konto
- **THEN** odpowiedź to 422 `validation_failed` (lub 409
  `email_already_registered`) i konto nie jest zmieniane

### Requirement: Matryca ról chroni rolę super_admin
System SHALL egzekwować, że rola `project_manager` nie może utworzyć konta z rolą
`super_admin` ani podnieść istniejącego konta do roli `super_admin`, ani edytować
konta, które już ma rolę `super_admin`. Naruszenie MUST zwracać 403 `forbidden`
bez zapisu zmiany i bez wpisu audytu. Rola `super_admin` MUST mieć pełne
uprawnienia do tych operacji.

#### Scenario: Opiekun projektu nie nada roli super_admin
- **WHEN** użytkownik z rolą `project_manager` wysyła `POST /admin/users` lub
  `PATCH /admin/users/{id}` z `role` ustawionym na `super_admin`
- **THEN** odpowiedź to 403 `forbidden`, konto nie jest tworzone ani zmieniane,
  audyt nie rośnie

#### Scenario: Super admin nada rolę super_admin
- **WHEN** użytkownik z rolą `super_admin` wysyła `PATCH /admin/users/{id}` z
  `role` ustawionym na `super_admin`
- **THEN** odpowiedź to 200, a w audycie pojawia się wpis `user.updated`

### Requirement: Blokada konta z powodem
System SHALL udostępniać `POST /admin/users/{id}/block` z wymaganym niepustym
stringiem `reason`. Udana operacja MUST ustawić `status = blocked`, przejść przez
`AuditLog::record` ze slugiem `user.blocked` (z zapisanym powodem) i być
dostępna wyłącznie dla roli administracyjnej. `project_manager` MUST otrzymać
403 `forbidden` przy próbie zablokowania konta z rolą `super_admin`. Brak lub
pusty `reason` MUST zwracać 422 `validation_failed`. Zablokowany użytkownik przy
próbie logowania MUST otrzymać komunikat o blokadzie konta, odrębny od komunikatu
o wygaśnięciu dostępu (H04).

#### Scenario: Zablokowanie konta
- **WHEN** administrator wysyła `POST /admin/users/{id}/block` z niepustym
  `reason`
- **THEN** odpowiedź to 200, `status` konta to `blocked`, a w audycie pojawia się
  wpis `user.blocked` z powodem

#### Scenario: Brak powodu
- **WHEN** administrator wysyła `POST /admin/users/{id}/block` bez `reason`
- **THEN** odpowiedź to 422 `validation_failed`

#### Scenario: Komunikat logowania odróżnia blokadę od wygaśnięcia
- **WHEN** zablokowany użytkownik i użytkownik z wygasłym dostępem próbują się
  zalogować
- **THEN** każdy dostaje inny komunikat — o blokadzie konta, nie o wygaśnięciu
  dostępu

### Requirement: Eksport listy osób do CSV
System SHALL udostępniać `GET /admin/users/export.csv` zwracające
`text/csv; charset=utf-8` z BOM i separatorem `;` przez wspólny helper `Csv`.
Eksport MUST honorować te same filtry co lista (`role`, `status`, `search`) i
MUST zawierać wiersz nagłówka oraz kolumny odpowiadające polom listy. Trasa MUST
wymagać roli administracyjnej.

#### Scenario: Plik CSV otwiera się w Excelu
- **WHEN** administrator wywołuje `GET /admin/users/export.csv?role=volunteer`
- **THEN** odpowiedź ma typ `text/csv; charset=utf-8`, zaczyna się od BOM, używa
  separatora `;`, zawiera wiersz nagłówka i wyłącznie konta z rolą `volunteer`

#### Scenario: Eksport wymaga roli administracyjnej
- **WHEN** użytkownik z rolą `volunteer` wywołuje `GET /admin/users/export.csv`
- **THEN** odpowiedź to 403 `forbidden`
