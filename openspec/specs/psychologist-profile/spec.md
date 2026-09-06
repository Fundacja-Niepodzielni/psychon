# psychologist-profile Specification

## Purpose

Zapewnia absolwentowi programu bezpieczną ścieżkę złożenia wniosku o wpis do
bazy psychologów Fundacji wraz z chronionymi załącznikami i odwołalną zgodą na
publikację, a administracji kontrolowany przepływ weryfikacji, decyzji i
wglądu w dokumenty wrażliwe.

## Requirements

### Requirement: Wniosek dostępny wyłącznie po ukończeniu programu
System SHALL udostępniać odczyt własnego wniosku (`GET /psychologist-profile`)
niezależnie od stanu ukończenia programu, ale MUST oznaczać go polem
`eligible` wyliczonym z `users.program_completed_at`. System MUST odrzucać
każdą akcję zapisu (`PATCH`, `POST .../submit`, `POST .../documents`) kontu
bez ukończonego programu kodem `403 profile_not_eligible`.

#### Scenario: Odczyt wniosku przed ukończeniem programu
- **WHEN** wolontariusz w trakcie programu pobiera `GET /psychologist-profile`
- **THEN** system zwraca `200` z `data.eligible = false` i nie ujawnia błędu

#### Scenario: Odczyt wniosku absolwentki
- **WHEN** `ola@demo.pl` (absolwentka, `program_completed_at` ustawione)
  pobiera `GET /psychologist-profile`
- **THEN** system zwraca `200` z `data.eligible = true` i danymi jej wniosku
  `draft`

#### Scenario: Edycja przed ukończeniem programu
- **WHEN** wolontariusz w trakcie programu wysyła `PATCH /psychologist-profile`
- **THEN** system zwraca `403` z kodem `profile_not_eligible` i nie zapisuje
  zmian

#### Scenario: Rola bez dostępu do wniosku
- **WHEN** użytkownik o roli innej niż `volunteer` wywołuje dowolną operację
  H15 na własnym wniosku
- **THEN** system zwraca `403` z kodem `forbidden`

### Requirement: Kontrakt zasobu wniosku uczestnika ma zamknięty kształt
System SHALL zwracać zasób własnego wniosku z dokładnie polami `eligible`,
`specializations`, `approach`, `city`, `bio`, `publication_consent_granted`,
`status`, `return_reason`, `documents` (lista `id`, `type`, `uploaded_at`) oraz
`created_at`/`updated_at`. Zasób MUST nie ujawniać `user_id`, `decided_by` ani
ścieżek plików (`file_path`) załączników.

#### Scenario: Odczyt zwraca wyłącznie zatwierdzone pola
- **WHEN** uczestnik pobiera `GET /psychologist-profile`
- **THEN** odpowiedź `data` zawiera dokładnie zatwierdzone pola zasobu
  uczestnika i nie zawiera `user_id` ani `file_path` żadnego załącznika

### Requirement: Edycja wniosku przed złożeniem
System SHALL pozwalać uprawnionemu uczestnikowi edytować dane wniosku
(`specializations`, `approach`, `city`, `bio`) `PATCH`-em wyłącznie, gdy status
wniosku to `draft` albo `returned`. Wniosek w statusie innym niż `draft`/
`returned` MUST odrzucać edycję kodem `403 entry_locked`.

#### Scenario: Edycja wniosku w stanie draft
- **WHEN** absolwentka edytuje własny wniosek w statusie `draft`
- **THEN** system zapisuje zmiany i zwraca `200` z pełnym zasobem uczestnika

#### Scenario: Edycja zablokowana po złożeniu
- **WHEN** absolwentka wysyła `PATCH /psychologist-profile` dla wniosku w
  statusie `submitted` albo `accepted`
- **THEN** system zwraca `403` z kodem `entry_locked` i nie zmienia danych

### Requirement: Złożenie wniosku wymaga kompletu danych i blokuje edycję
System SHALL zmieniać status wniosku na `submitted` w odpowiedzi na `POST
/psychologist-profile/submit`, gdy uczestnik jest `eligible`, ma uzupełnione
`specializations`, `approach`, `city`, co najmniej jeden załącznik typu
`dyplom` oraz udzieloną zgodę na publikację. Brak któregokolwiek elementu MUST
zwracać `422 profile_incomplete` z listą braków w `reason.missing`. Złożenie
MUST nie być możliwe dla wniosku, który nie jest w statusie `draft` ani
`returned`.

#### Scenario: Poprawne złożenie kompletnego wniosku
- **WHEN** `ola@demo.pl` uzupełnia wymagane pola, załącza dyplom, udziela
  zgody na publikację i wysyła `POST /psychologist-profile/submit`
- **THEN** system zwraca `200` z `data.status = "submitted"` i blokuje dalszą
  edycję

#### Scenario: Złożenie z brakującymi danymi
- **WHEN** eligible uczestnik wysyła `POST /psychologist-profile/submit` bez
  załączonego dyplomu
- **THEN** system zwraca `422` z kodem `profile_incomplete` i
  `reason.missing` zawierającym `documents`

#### Scenario: Konto w trakcie programu nie złoży wniosku
- **WHEN** wolontariusz w trakcie programu wysyła `POST
  /psychologist-profile/submit`
- **THEN** system zwraca `403` z kodem `profile_not_eligible`

### Requirement: Załączniki weryfikacyjne przyjmowane wyłącznie przed złożeniem
System SHALL przyjmować `POST /psychologist-profile/documents` (multipart) z
polem `type` ograniczonym do `dyplom`, `niekaralnosc`, `inne`, wyłącznie gdy
wniosek jest w statusie `draft` albo `returned`. Wniosek `submitted` lub
rozstrzygnięty MUST odrzucać upload kodem `403 entry_locked`.

#### Scenario: Upload załącznika w stanie draft
- **WHEN** absolwentka przesyła plik typu `dyplom` do wniosku `draft`
- **THEN** system zapisuje załącznik i zwraca `201` z jego metadanymi (bez
  `file_path`)

#### Scenario: Upload po złożeniu wniosku
- **WHEN** uczestnik przesyła załącznik do wniosku w statusie `submitted`
- **THEN** system zwraca `403` z kodem `entry_locked` i nie zapisuje pliku

### Requirement: Kolejka administracji zawiera wyłącznie złożone wnioski
System SHALL udostępniać administracji `GET /admin/profiles` ze standardową
paginacją, domyślnie wyłącznie wnioski w statusie `submitted`, posortowane
po `created_at` rosnąco. `GET /admin/profiles/{id}` MUST zwracać pełny wniosek
wraz z listą załączników, z których każdy zawiera podpisany, wygasający
`download_url`.

#### Scenario: Lista zawiera tylko złożone wnioski
- **WHEN** administrator pobiera `GET /admin/profiles`
- **THEN** odpowiedź zawiera wyłącznie wnioski ze statusem `submitted`

#### Scenario: Szczegóły wniosku zawierają podpisane linki załączników
- **WHEN** administrator pobiera `GET /admin/profiles/{id}` wniosku ze
  złożonymi załącznikami
- **THEN** każdy element `documents` zawiera `download_url` będący podpisanym,
  wygasającym adresem

#### Scenario: Rola bez dostępu do panelu administracji
- **WHEN** użytkownik bez roli `project_manager` ani `super_admin` wywołuje
  dowolną operację administracyjną H15
- **THEN** system zwraca `403` z kodem `forbidden`

### Requirement: Wgląd w załącznik administracji zostawia ślad w rejestrze
System SHALL zapisywać wpis w `sensitive_access_log` (`viewer_id`,
`file_type = "profile_document"`, `file_id`, `viewed_at`) przy każdym udanym
pobraniu załącznika przez `GET /admin/profiles/{id}/documents/{docId}`.
System MUST emitować równolegle audyt `sensitive.viewed` (rejestr §3.2, slug
już przypisany do H03/H15) przez `AuditLog::record`, tak aby wgląd był widoczny
także w ogólnym dzienniku administracji (H20).

#### Scenario: Pobranie załącznika tworzy wpis w rejestrze wglądów
- **WHEN** administrator pobiera załącznik przez podpisany
  `GET /admin/profiles/{id}/documents/{docId}`
- **THEN** system zwraca plik, zapisuje dokładnie jeden nowy wpis w
  `sensitive_access_log` z `viewer_id` administratora i jeden wpis audytu
  `sensitive.viewed`

### Requirement: Decyzje administracji są jednorazowe, z audytem i powiadomieniem
System SHALL akceptować `POST /admin/profiles/{id}/accept` (bez ciała) oraz
`POST /admin/profiles/{id}/return {reason}` (niepusty string) wyłącznie dla
wniosku w statusie `submitted`. Akceptacja MUST ustawiać status `accepted`,
`decided_by`, `decided_at` i emitować audyt `profile.accepted` oraz
powiadomienie tego samego typu. Odesłanie MUST ustawiać status `returned`,
zapisywać `return_reason` i emitować audyt `profile.returned` oraz
powiadomienie tego samego typu. Powtórna albo sprzeczna decyzja na wniosku,
który nie jest już `submitted`, MUST zwracać `403 entry_locked` bez zmiany
wniosku, dodatkowego audytu ani powiadomienia.

#### Scenario: Akceptacja złożonego wniosku
- **WHEN** administrator wysyła `POST /admin/profiles/{id}/accept` dla wniosku
  `submitted`
- **THEN** system zwraca `200` ze statusem `accepted`, zapisuje audyt
  `profile.accepted` i wysyła powiadomienie `profile.accepted` do wnioskującej

#### Scenario: Odesłanie wymaga powodu
- **WHEN** administrator wysyła `POST /admin/profiles/{id}/return` bez pola
  `reason` albo z pustym stringiem
- **THEN** system zwraca `422` z kodem `validation_failed` i nie zmienia
  wniosku

#### Scenario: Odesłanie z powodem odblokowuje edycję
- **WHEN** administrator odsyła złożony wniosek z niepustym `reason`
- **THEN** system zwraca `200` ze statusem `returned`, zapisanym
  `return_reason`, i wniosek staje się ponownie edytowalny przez właściciela

#### Scenario: Powtórna decyzja na już rozstrzygniętym wniosku
- **WHEN** administrator wysyła `POST /admin/profiles/{id}/accept` dla
  wniosku już zaakceptowanego albo odesłanego
- **THEN** system zwraca `403` z kodem `entry_locked` i nie tworzy nowego
  wpisu audytu ani powiadomienia

### Requirement: Wycofanie zgody na publikację kończy proces i informuje zespół
System SHALL akceptować `POST /psychologist-profile/consent/withdraw` od
właściciela wniosku niezależnie od bieżącego statusu (poza `draft`, gdzie
zgoda nie została jeszcze udzielona). Operacja MUST ustawiać
`consents.withdrawn_at` na aktywnym rekordzie zgody na publikację oraz status
wniosku na `withdrawn`. System SHALL informować zespół administracyjny o
wycofaniu w sposób zgodny z rejestrem powiadomień (rejestr §3.1) — do czasu
przyznania dedykowanego typu przez strażnika kontraktu wycofany wniosek MUST
być widoczny w kolejce administracyjnej przez filtr statusu.

#### Scenario: Wycofanie zgody po akceptacji
- **WHEN** zaakceptowany psycholog wysyła `POST
  /psychologist-profile/consent/withdraw`
- **THEN** system ustawia status wniosku na `withdrawn`, zapisuje
  `withdrawn_at` na zgodzie i wniosek przestaje być edytowalny

#### Scenario: Wycofanie zgody bez wcześniejszego udzielenia
- **WHEN** uczestnik z wnioskiem w statusie `draft` (bez udzielonej zgody)
  wysyła `POST /psychologist-profile/consent/withdraw`
- **THEN** system zwraca `422` z kodem `validation_failed` i nie zmienia
  statusu wniosku

#### Scenario: Wycofany wniosek trafia do kolejki administracyjnej
- **WHEN** administrator filtruje `GET /admin/profiles?status=withdrawn` po
  wycofaniu zgody przez uczestnika
- **THEN** wniosek pojawia się na liście
