## Purpose

Umożliwia zalogowanemu użytkownikowi odczyt i edycję własnego profilu — z polem `email`
tylko do odczytu i walidacją numeru PESEL — oraz samoobsługowy eksport własnych danych
zgodny z RODO: zlecenie, śledzenie statusu i pobranie gotowego pliku.

## ADDED Requirements

### Requirement: Odczyt pełnego profilu właściciela

System SHALL udostępniać zalogowanemu użytkownikowi pod `GET /me` jego pełny profil,
w tym **pełny, niezamaskowany numer PESEL**, oraz listę zgód (`consents`) z wyliczonym
statusem (`granted`, gdy `withdrawn_at` jest puste, w przeciwnym razie `withdrawn`).
Maskowanie PESEL dla widoków innych niż właściciel jest poza zakresem tej zdolności.

#### Scenario: Właściciel widzi swój pełny profil

- **WHEN** `marta@demo.pl` woła `GET /me`
- **THEN** odpowiedź ma status 200 i zawiera pełny, 11-cyfrowy numer PESEL oraz listę
  `consents` z co najmniej jednym wpisem o statusie `granted`

#### Scenario: Nieuwierzytelnione żądanie jest odrzucane

- **WHEN** `GET /me` woła się bez tokenu Bearer
- **THEN** odpowiedź ma status 401 i `error.code` = `unauthenticated`

### Requirement: Aktualizacja profilu z polem email tylko do odczytu

System SHALL pozwalać właścicielowi aktualizować przez `PATCH /me` pola `first_name`,
`last_name`, `phone`, `pesel` oraz zagnieżdżony `address{street,city,zip}`. Pole `email`
w treści żądania MUST być ignorowane przed walidacją — żądanie zawierające `email` MUST
zakończyć się sukcesem (200) bez odrzucenia i bez zmiany adresu e-mail w bazie.

#### Scenario: Wysłanie pola email nie zmienia adresu

- **WHEN** właściciel woła `PATCH /me` z `{"email": "inny@example.com", "first_name": "Ola"}`
- **THEN** odpowiedź ma status 200, `first_name` jest zaktualizowane, a adres e-mail
  w bazie pozostaje niezmieniony

#### Scenario: Aktualizacja zagnieżdżonego adresu

- **WHEN** właściciel woła `PATCH /me` z `{"address": {"street": "Nowa 1", "city": "Poznań", "zip": "60-100"}}`
- **THEN** odpowiedź ma status 200, a `data.address.city` = `"Poznań"`

### Requirement: Walidacja numeru PESEL

System SHALL akceptować w polu `pesel` wyłącznie ciąg 11 cyfr z poprawnie zakodowaną datą
urodzenia (w tym stuleciem kodowanym w miesiącu) i poprawną cyfrą kontrolną. Niepoprawny
PESEL MUST skutkować odpowiedzią 422 `validation_failed` z komunikatem pod
`error.errors.pesel`, a wartość w bazie MUST pozostać niezmieniona.

#### Scenario: Niepoprawny PESEL jest odrzucany

- **WHEN** właściciel bez zapisanego PESEL-u woła `PATCH /me` z PESEL-em o błędnej sumie
  kontrolnej
- **THEN** odpowiedź ma status 422, `error.code` = `validation_failed`,
  `error.errors.pesel` zawiera `"Nieprawidłowy numer PESEL."`, a PESEL w bazie pozostaje pusty

#### Scenario: Poprawny PESEL jest zapisywany

- **WHEN** właściciel woła `PATCH /me` z poprawnym, zgodnym z sumą kontrolną numerem PESEL
- **THEN** odpowiedź ma status 200, a kolejne `GET /me` zwraca ten sam numer

### Requirement: Zlecenie eksportu danych RODO

System SHALL przyjmować przez `POST /me/exports` żądanie eksportu własnych danych
zalogowanego użytkownika i uruchamiać jego przygotowanie w tle. Odpowiedź MUST mieć status
202 i zawierać identyfikator eksportu oraz status `queued`.

#### Scenario: Zlecenie eksportu jest przyjmowane asynchronicznie

- **WHEN** właściciel woła `POST /me/exports`
- **THEN** odpowiedź ma status 202 i `data.status` = `"queued"`, a `data.id` zaczyna się
  od `ex_`

### Requirement: Zawartość eksportu obejmuje pięć zakresów danych

Wygenerowany plik eksportu SHALL zawierać dokładnie pięć zakresów: profil, zgody, postęp
(w tym liczniki per lekcja), wpisy stażu i metadane dokumentów (bez samych plików). Po
ukończeniu status eksportu MUST zmienić się na `ready`.

#### Scenario: Gotowy eksport zawiera wszystkie zakresy

- **WHEN** eksport zlecony przez właściciela z zapisanym PESEL-em i co najmniej jedną zgodą
  zostaje ukończony
- **THEN** `GET /me/exports/{id}` zwraca `status: "ready"`, a wygenerowany plik JSON zawiera
  klucze `profile`, `consents`, `progress`, `internship_entries` i `documents`, przy czym
  `profile.pesel` odpowiada zapisanemu numerowi

### Requirement: Pobranie eksportu jest chronione własnością

System SHALL udostępniać `GET /me/exports/{id}` (status) oraz
`GET /me/exports/{id}/download` (plik) wyłącznie właścicielowi eksportu. Identyfikator
należący do innego użytkownika albo nieistniejący MUST zwracać 404 `not_found` w obu
przypadkach, bez ujawniania różnicy między „nie istnieje" a „należy do kogoś innego".

#### Scenario: Cudzy eksport jest niewidoczny

- **WHEN** użytkownik B woła `GET /me/exports/{id}` albo
  `GET /me/exports/{id}/download` dla eksportu należącego do użytkownika A
- **THEN** obie odpowiedzi mają status 404 i `error.code` = `not_found`

#### Scenario: Właściciel pobiera gotowy plik

- **WHEN** właściciel woła `GET /me/exports/{id}/download` dla eksportu w statusie `ready`
- **THEN** odpowiedź ma status 200 z nagłówkiem `Content-Disposition: attachment` i nazwą
  pliku zawierającą identyfikator eksportu

### Requirement: Powiadomienie o gotowym eksporcie bez wpisu audytu

Po pomyślnym zakończeniu eksportu system SHALL wysłać powiadomienie typu `export.ready`
z linkiem do `/panel/profil`. Ani aktualizacja profilu, ani eksport danych MUST NOT
zapisywać wpisu w rejestrze audytu — rejestr zdarzeń audytowych (jedyne źródło prawdy) nie
definiuje sluga dla tych operacji.

#### Scenario: Gotowy eksport wysyła powiadomienie

- **WHEN** eksport właściciela osiąga status `ready`
- **THEN** dla tego użytkownika istnieje powiadomienie typu `export.ready` z linkiem
  `/panel/profil`
