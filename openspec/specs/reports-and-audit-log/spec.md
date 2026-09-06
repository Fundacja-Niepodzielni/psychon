# reports-and-audit-log Specification

## Purpose

Liczby do grantu z platformy (raport edycji: osoby przyjęte/aktywne/ukończone, suma i
średnia godzin stażu, konsultacje, certyfikaty, zestawienie imienne) oraz jawny,
tylko-do-odczytu dziennik działań administracji, filtrowany po rejestrze audytu §3.2 —
oba z eksportem CSV wspólnym helperem startera.

## Requirements

### Requirement: Raport edycji zgodny z pulpitem i kartą osoby

System SHALL udostępniać `GET /admin/report` zwracający w `data.summary` liczbę osób
przyjętych, aktywnych (`volunteer`/`student`, status `active`), z ukończonym programem
oraz liczbę wydanych certyfikatów, sumę i średnią godzin stażu zaakceptowanych oraz sumę
konsultacji, a w `data.people` zestawienie imienne (osoba, rola, godziny zaakceptowane,
konsultacje, czy certyfikat wydany). Liczby `active`, `completed` i `certificates_issued`
MUST być identyczne z licznikami `GET /admin/dashboard` (ta sama zdolność, ten sam kod źródłowy
— nie tylko ta sama wartość). Trasa MUST wymagać roli `project_manager` lub
`super_admin`.

#### Scenario: Raport na danych demo odpowiada kanonicznym liczbom

- **WHEN** administrator wywołuje `GET /admin/report` na stanie z seeda demo
- **THEN** `data.summary.active` = 3, `data.summary.completed` = 1,
  `data.summary.certificates_issued` = 1, `data.summary.hours_accepted_total` =
  `"113.5"`, `data.summary.consultations_total` = 101

#### Scenario: Zestawienie imienne odpowiada karcie osoby

- **WHEN** administrator wywołuje `GET /admin/report` na stanie z seeda demo
- **THEN** `data.people` zawiera wiersz Marty z `hours_accepted` = `"41.5"` i
  `consultations` = 37 — te same liczby, które `ProgressAggregator::for()` zwraca dla jej
  karty osoby

#### Scenario: Rola bez dostępu

- **WHEN** użytkownik z rolą `volunteer`, `student` albo `instructor` wywołuje
  `GET /admin/report`
- **THEN** odpowiedź to 403 z `error.code` = `forbidden`

### Requirement: Eksport raportu wspólnym helperem CSV

System SHALL udostępniać `GET /admin/report/export.csv` zwracający zestawienie imienne
w formacie zgodnym z kontraktowym helperem CSV (UTF-8 BOM, separator `;`), z nagłówkiem
kolumn jako pierwszym wierszem. Trasa MUST wymagać tej samej roli co `GET /admin/report`.

#### Scenario: Plik CSV ma BOM, separator i dane

- **WHEN** administrator wywołuje `GET /admin/report/export.csv`
- **THEN** treść pliku zaczyna się od UTF-8 BOM, wiersze są rozdzielone `;`, a nagłówek
  zawiera kolumny `id;first_name;last_name;role;hours_accepted;consultations;certificate_issued`

### Requirement: Dziennik działań tylko do odczytu z filtrami po rejestrze audytu

System SHALL udostępniać `GET /admin/audit` zwracający listę wpisów dziennika (paginacja
zgodna z kontraktem §1) z opcjonalnymi filtrami: `action` (dokładny slug z rejestru
kontraktu §3.2 — wartość spoza rejestru MUST zwrócić 422 `validation_failed`),
`user_id` (aktor — `audit_log.actor_id`), `from`/`to` (zakres dat po `created_at`). Trasa
MUST wymagać roli `project_manager` lub `super_admin`.

#### Scenario: Filtr action zawęża do jednego sluga

- **WHEN** administrator wywołuje `GET /admin/audit?action=access.extended`
- **THEN** każdy wpis w `data` ma `action` = `access.extended`

#### Scenario: Nieznany slug jest odrzucony

- **WHEN** administrator wywołuje `GET /admin/audit?action=nie.istnieje.taki.slug`
- **THEN** odpowiedź to 422 z `error.code` = `validation_failed`

#### Scenario: Filtr user_id zawęża po aktorze

- **WHEN** administrator wywołuje `GET /admin/audit?user_id=<id opiekuna>`
- **THEN** każdy wpis w `data` ma `actor.id` równy podanemu `user_id`

#### Scenario: Filtr zakresu dat

- **WHEN** administrator wywołuje `GET /admin/audit?from=<wczoraj>`
- **THEN** `data` nie zawiera wpisów starszych niż podana data

#### Scenario: Rola bez dostępu

- **WHEN** użytkownik z rolą `volunteer`, `student` albo `instructor` wywołuje
  `GET /admin/audit`
- **THEN** odpowiedź to 403 z `error.code` = `forbidden`

### Requirement: Eksport dziennika wspólnym helperem CSV

System SHALL udostępniać `GET /admin/audit/export.csv`, honorujący te same filtry co
`GET /admin/audit`, w formacie zgodnym z kontraktowym helperem CSV (UTF-8 BOM, separator
`;`).

#### Scenario: Plik CSV ma BOM, separator i dane

- **WHEN** administrator wywołuje `GET /admin/audit/export.csv`
- **THEN** treść pliku zaczyna się od UTF-8 BOM, wiersze są rozdzielone `;`, a nagłówek
  zawiera kolumny `id;action;actor_id;actor_name;subject_type;subject_id;details;created_at`

### Requirement: Zero tras modyfikacji dziennika

System SHALL NOT udostępniać żadnej trasy modyfikującej `/admin/audit/*` — dziennik jest
wyłącznie do odczytu (append-only na poziomie `AuditLog::record`, nigdy przez API).
Dowolna metoda inna niż `GET` pod adresem `/admin/audit/{id}` MUST zwrócić 404, ponieważ
nie istnieje żadna trasa dopasowująca ten wzorzec.

#### Scenario: Próba modyfikacji zwraca 404

- **WHEN** administrator wywołuje `POST`, `PATCH`, `PUT` albo `DELETE` pod
  `/admin/audit/{dowolne id}`
- **THEN** każda odpowiedź to 404 z `error.code` = `not_found`
