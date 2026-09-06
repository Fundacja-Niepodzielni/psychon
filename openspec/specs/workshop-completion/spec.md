# workshop-completion Specification

## Purpose

Odznaczenie ukończenia warsztatu stacjonarnego przez administrację — drugiego, obok testów,
warunku wydania certyfikatu. Operacja jest idempotentna i audytowana.

## Requirements

### Requirement: Odznaczenie warsztatu przez administrację

System SHALL pozwalać rolom administracyjnym na odznaczenie ukończenia warsztatu
stacjonarnego dla wskazanego użytkownika w ramach aktywnej edycji przez
`POST /admin/workshop/{userId}/complete`. Operacja MUST być idempotentna: powtórne wywołanie
dla tego samego użytkownika i tej samej edycji MUST NOT tworzyć drugiego rekordu ani drugiego
wpisu audytu.

#### Scenario: Pierwsze odznaczenie tworzy wpis i audyt

- **WHEN** administracja odznacza warsztat dla użytkownika, który go jeszcze nie ma
  odznaczonego w aktywnej edycji
- **THEN** odpowiedź ma status 200 z `workshop_done` = `true` i `completed_at` ustawionym
- **AND** powstaje dokładnie jeden wpis audytu `workshop.completed`

#### Scenario: Powtórne odznaczenie jest bezpieczne

- **WHEN** administracja woła odznaczenie warsztatu drugi raz dla tego samego użytkownika i
  tej samej edycji
- **THEN** odpowiedź ma status 200 z `workshop_done` = `true`
- **AND** nie powstaje drugi wpis audytu `workshop.completed` ani drugi rekord ukończenia

### Requirement: Warsztat jako warunek certyfikatu

System SHALL udostępniać stan odznaczenia warsztatu jako wejście do agregatora postępu
używanego przez warunki certyfikatu. Po odznaczeniu warunek `workshop` MUST być spełniony
(`met = true`) dla tego użytkownika w tej edycji.

#### Scenario: Odznaczenie warsztatu spełnia warunek certyfikatu

- **WHEN** warsztat użytkownika zostaje odznaczony przez administrację
- **THEN** agregator postępu tego użytkownika zwraca warunek `workshop` ze stanem `met = true`
