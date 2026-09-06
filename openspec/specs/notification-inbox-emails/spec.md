# notification-inbox-emails Specification

## Purpose

Zapewnia każdemu użytkownikowi własną skrzynkę powiadomień z licznikiem nieprzeczytanych,
wspólną szynę tworzącą powiadomienie i symulowany e-mail atomowo dla dowolnego typu
z rejestru kontraktu, oraz administracyjny wgląd w wysłane (symulowane) e-maile.

## Requirements

### Requirement: Lista własnych powiadomień z licznikiem nieprzeczytanych

System SHALL udostępniać pod `GET /notifications` wyłącznie powiadomienia zalogowanego
użytkownika, posortowane malejąco po dacie utworzenia, w standardowej kopercie
paginowanej. Odpowiedź MUST zawierać w `meta.extra.unread` liczbę powiadomień tego
użytkownika bez ustawionego `read_at`.

#### Scenario: Użytkownik widzi tylko swoje powiadomienia

- **WHEN** użytkownik z dwoma powiadomieniami, z których jedno jest nieprzeczytane, woła
  `GET /notifications`
- **THEN** odpowiedź ma status 200, `data` zawiera wyłącznie jego powiadomienia,
  a `meta.extra.unread` = 1

#### Scenario: Nieuwierzytelnione żądanie jest odrzucane

- **WHEN** `GET /notifications` woła się bez tokenu Bearer
- **THEN** odpowiedź ma status 401 i `error.code` = `unauthenticated`

### Requirement: Oznaczenie pojedynczego powiadomienia jako przeczytane

System SHALL pozwalać właścicielowi oznaczyć własne powiadomienie jako przeczytane przez
`POST /notifications/{id}/read`, w sposób idempotentny — powtórne wywołanie nie MUST
zmieniać wcześniej ustawionego `read_at`. Identyfikator należący do innego użytkownika albo
nieistniejący MUST zwracać 404 `not_found`, nie 403 — nie ujawnia się istnienia cudzego
powiadomienia.

#### Scenario: Właściciel oznacza własne powiadomienie

- **WHEN** właściciel woła `POST /notifications/{id}/read` dla swojego nieprzeczytanego
  powiadomienia
- **THEN** odpowiedź ma status 200 i `data.read_at` jest ustawione

#### Scenario: Oznaczenie cudzego powiadomienia zwraca 404

- **WHEN** użytkownik B woła `POST /notifications/{id}/read` dla powiadomienia należącego
  do użytkownika A
- **THEN** odpowiedź ma status 404 i `error.code` = `not_found`

### Requirement: Oznaczenie wszystkich powiadomień jako przeczytane

System SHALL pozwalać przez `POST /notifications/read-all` oznaczyć jako przeczytane
wszystkie dotąd nieprzeczytane powiadomienia wywołującego, bez wpływu na powiadomienia
innych użytkowników.

#### Scenario: Oznaczenie wszystkich dotyczy tylko wywołującego

- **WHEN** dwóch użytkowników ma nieprzeczytane powiadomienia i jeden z nich woła
  `POST /notifications/read-all`
- **THEN** wszystkie powiadomienia wywołującego mają ustawione `read_at`
  (`meta.extra.unread` = 0 przy kolejnym `GET /notifications`), a powiadomienia drugiego
  użytkownika pozostają nieprzeczytane

### Requirement: Wspólna szyna tworzy powiadomienie i symulowany e-mail atomowo

Wywołanie szyny powiadomień dla dowolnego typu z rejestru kontraktu SHALL w jednej
transakcji utworzyć dokładnie jedno powiadomienie w skrzynce adresata oraz dokładnie jeden
wiersz w skrzynce e-maili, ze statusem e-maila równym `simulated`. Żaden e-mail MUST NOT
opuszczać systemu.

#### Scenario: Wywołanie szyny tworzy powiadomienie i symulowany e-mail

- **WHEN** szyna zostaje wywołana dla użytkownika z typem, tytułem, treścią i linkiem
- **THEN** powiadomienie o tym typie i linku pojawia się w `GET /notifications` adresata,
  a odpowiadający mu wiersz w skrzynce e-maili ma status `simulated` i niepusty czas
  wysyłki

### Requirement: Skrzynka e-maili wyłącznie dla administracji

System SHALL udostępniać `GET /admin/emails` — listę wszystkich symulowanych e-maili
(odbiorca, temat, treść, status, czas) — wyłącznie rolom `project_manager` i
`super_admin`. Inna rola MUST otrzymać 403 `forbidden`.

#### Scenario: Administracja widzi skrzynkę e-maili

- **WHEN** użytkownik z rolą `super_admin` woła `GET /admin/emails`
- **THEN** odpowiedź ma status 200 i zawiera odbiorcę, temat, treść i status `simulated`
  dla każdego wysłanego dotąd e-maila

#### Scenario: Rola bez uprawnień jest odrzucana

- **WHEN** użytkownik z rolą `volunteer` woła `GET /admin/emails`
- **THEN** odpowiedź ma status 403 i `error.code` = `forbidden`
