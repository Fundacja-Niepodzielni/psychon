# documents Specification

## Purpose

Generowanie dokumentów programu (porozumienie wolontariackie, zaświadczenie o stażu) z danych,
które uczestniczka wprowadziła w profilu — bez ręcznego przepisywania, z treścią zamrożoną
w chwili wydania i pobieraniem podpisanym wygasającym linkiem.

## Requirements

### Requirement: Lista dokumentów użytkownika

System SHALL udostępniać zalogowanemu użytkownikowi listę jego własnych dokumentów oraz stan
dostępności każdego typu dokumentu. Odpowiedź MUST używać koperty `{"data": ...}` i zawierać
dla każdego dokumentu: `id`, `type`, `number`, `generated_at` (ISO 8601 UTC),
`signature_status` i `download_url` (podpisany, wygasający). Lista MUST zawierać wyłącznie
dokumenty należące do zalogowanego użytkownika. Odpowiedź MUST zawierać w `meta.extra.available_types`
opis każdego typu ze słownika `documents.type`: czy jest dostępny do wygenerowania, a jeśli nie —
powód (`profile_incomplete`, `conditions_not_met`, `already_generated`).

#### Scenario: Właściciel widzi swoje dokumenty

- **WHEN** `marta@demo.pl` woła `GET /documents`
- **THEN** odpowiedź ma status 200 i zawiera dokładnie jeden dokument typu `volunteer_agreement`
  o numerze `PW/2026/001`, z niepustym `download_url`

#### Scenario: Lista nie ujawnia cudzych dokumentów

- **WHEN** `filip@demo.pl` (który nie ma wygenerowanych dokumentów) woła `GET /documents`
- **THEN** odpowiedź ma status 200 z pustą tablicą `data` i nie zawiera dokumentu `PW/2026/001`

#### Scenario: Lista podaje powód niedostępności typu

- **WHEN** użytkownik z niekompletnym profilem woła `GET /documents`
- **THEN** `meta.extra.available_types` opisuje `volunteer_agreement` jako niedostępny
  z powodem `profile_incomplete`

### Requirement: Kompletność profilu jako warunek generowania

System SHALL odmówić wygenerowania dokumentu, gdy w profilu użytkownika brakuje któregokolwiek
z pól wymaganych do umowy: `first_name`, `last_name`, `email`, `phone`, `pesel`,
`address_street`, `address_city`, `address_zip`. Odmowa MUST mieć status 422 z kodem
`profile_incomplete`, a lista brakujących pól MUST znaleźć się w `errors` koperty błędu.
Pole uznaje się za brakujące, gdy jest `null` albo pustym ciągiem po przycięciu białych znaków.

#### Scenario: Brakujące pole profilu blokuje generowanie

- **WHEN** użytkownik bez `pesel` i bez `address_zip` woła
  `POST /documents/generate {"type": "volunteer_agreement"}`
- **THEN** odpowiedź ma status 422, `error.code` = `profile_incomplete`, a `error.errors`
  wymienia `pesel` i `address_zip`
- **AND** żaden rekord dokumentu nie powstaje

#### Scenario: Komplet pól przepuszcza generowanie

- **WHEN** użytkownik z kompletem ośmiu wymaganych pól woła
  `POST /documents/generate {"type": "volunteer_agreement"}`
- **THEN** odpowiedź ma status 201 i zawiera wygenerowany dokument

### Requirement: Warunek stażu dla zaświadczenia

System SHALL udostępnić typ `internship_certificate` dopiero wtedy, gdy suma **zaakceptowanych**
godzin stażu użytkownika osiągnęła próg `internship_hours_required` z ustawień aktywnej edycji.
Godziny MUST pochodzić z tego samego źródła co karta osoby, pulpit i warunki certyfikatu.
Poniżej progu odmowa MUST mieć status 422 z kodem `conditions_not_met` i wskazywać w `reason`
godziny zaakceptowane oraz wymagane, jako wartości dziesiętne przekazane w postaci stringów.

#### Scenario: Poniżej progu zaświadczenie niedostępne

- **WHEN** `marta@demo.pl` (41,5 h zaakceptowanych przy progu 72) woła
  `POST /documents/generate {"type": "internship_certificate"}`
- **THEN** odpowiedź ma status 422 z `error.code` = `conditions_not_met`
- **AND** `error.reason` zawiera `hours_accepted` = `"41.5"` oraz `hours_required` = `"72"`

#### Scenario: Po osiągnięciu progu zaświadczenie dostępne

- **WHEN** `ola@demo.pl` (72 h zaakceptowanych) woła
  `POST /documents/generate {"type": "internship_certificate"}`
- **THEN** odpowiedź ma status 201 z dokumentem typu `internship_certificate`

#### Scenario: Godziny niezaakceptowane nie liczą się do progu

- **WHEN** użytkownik ma 72 h w statusach `submitted` i `returned`, a 0 h `accepted`
- **THEN** `POST /documents/generate {"type": "internship_certificate"}` zwraca 422
  `conditions_not_met`

### Requirement: Generowanie dokumentu ze snapshotem danych

System SHALL wygenerować dokument synchronicznie i odpowiedzieć statusem 201 z kopertą `data`
zawierającą `id`, `type`, `number`, `generated_at`, `signature_status` i `download_url`.
Przy generowaniu system MUST zapisać snapshot danych użytych w treści dokumentu oraz
wyrenderowany plik. Późniejsza zmiana danych profilu MUST NOT zmieniać ani snapshotu, ani
treści już wygenerowanego pliku. Typ MUST należeć do słownika `documents.type`
(`volunteer_agreement`, `internship_certificate`); inna wartość → 422 `validation_failed`.

#### Scenario: Wygenerowany dokument zwraca komplet pól

- **WHEN** uprawniony użytkownik woła `POST /documents/generate {"type": "volunteer_agreement"}`
- **THEN** odpowiedź 201 zawiera `type` = `volunteer_agreement`, niepusty `number`,
  `generated_at` w ISO 8601 UTC i `download_url`

#### Scenario: Zmiana profilu nie zmienia wydanego dokumentu

- **WHEN** użytkownik wygenerował dokument, a następnie zmienił adres i telefon w profilu
- **THEN** pobrany plik i snapshot dokumentu zawierają dane sprzed zmiany

#### Scenario: Nieznany typ dokumentu odrzucony

- **WHEN** użytkownik woła `POST /documents/generate {"type": "certificate"}`
- **THEN** odpowiedź ma status 422 z `error.code` = `validation_failed`

### Requirement: Jeden dokument danego typu na edycję

System SHALL dopuścić najwyżej jeden dokument danego typu na użytkownika w ramach jednej edycji.
Powtórne wywołanie generowania dla typu, który użytkownik ma już wygenerowany w aktywnej edycji,
MUST zakończyć się statusem 409 ze wskazaniem identyfikatora istniejącego dokumentu w `reason`,
bez tworzenia nowego rekordu, bez nowego wpisu audytu i bez nowego powiadomienia.

#### Scenario: Powtórne generowanie odrzucone

- **WHEN** `marta@demo.pl` (ma już `PW/2026/001`) woła
  `POST /documents/generate {"type": "volunteer_agreement"}`
- **THEN** odpowiedź ma status 409, a `error.reason.document_id` wskazuje istniejący dokument
- **AND** liczba dokumentów użytkownika nie zmienia się

### Requirement: Ciągła numeracja per typ i edycja

System SHALL nadawać numery dokumentów w ciągu bez dziur, osobno dla każdej pary
(typ dokumentu, edycja). Numer MUST być unikalny w ramach edycji i typu, a jego nadanie MUST
odbyć się atomowo z zapisem dokumentu, tak by równoległe żądania nie otrzymały tego samego numeru.

#### Scenario: Kolejny dokument dostaje kolejny numer

- **WHEN** w edycji 2026 istnieje `PW/2026/001` i inny użytkownik generuje porozumienie
- **THEN** nowy dokument otrzymuje numer `PW/2026/002`

#### Scenario: Równoległe generowanie nie duplikuje numerów

- **WHEN** dziesięciu różnych użytkowników jednocześnie generuje porozumienie w tej samej edycji
- **THEN** powstaje dziesięć dokumentów o numerach tworzących ciąg bez dziur i bez powtórzeń

#### Scenario: Numeracja typów jest niezależna

- **WHEN** w edycji istnieją porozumienia do numeru `PW/2026/003`, a nie ma żadnego zaświadczenia
- **THEN** pierwsze wygenerowane zaświadczenie otrzymuje numer z sekwencją `001`

### Requirement: Pobranie podpisanym wygasającym linkiem

System SHALL udostępniać plik dokumentu wyłącznie jego właścicielowi, przez adres podpisany
i wygasający. Żądanie z ważnym podpisem MUST zwrócić plik. Żądanie o dokument nienależący do
zalogowanego użytkownika MUST zwrócić 404 `not_found` — bez ujawniania, czy dokument istnieje.
Żądanie z podpisem wygasłym lub zmanipulowanym MUST zwrócić 403. Adres pobrania MUST być
generowany na świeżo przy każdej odpowiedzi listy i generowania.

#### Scenario: Właściciel pobiera dokument

- **WHEN** właściciel otwiera `download_url` otrzymany z `GET /documents`
- **THEN** odpowiedź ma status 200 i zwraca plik dokumentu

#### Scenario: Cudzy dokument nie istnieje dla pytającego

- **WHEN** `filip@demo.pl` woła `GET /documents/{id}/download` dla dokumentu `marta@demo.pl`
  z poprawnym podpisem
- **THEN** odpowiedź ma status 404 z `error.code` = `not_found`

#### Scenario: Wygasły link odrzucony

- **WHEN** właściciel otwiera link po upływie czasu ważności podpisu
- **THEN** odpowiedź ma status 403

#### Scenario: Zmanipulowany podpis odrzucony

- **WHEN** ktokolwiek otwiera `GET /documents/{id}/download` ze zmienionym parametrem podpisu
- **THEN** odpowiedź ma status 403

### Requirement: Powiadomienie i wpis audytu przy wydaniu

System SHALL przy każdym udanym wygenerowaniu dokumentu utworzyć powiadomienie typu
`document.ready` dla właściciela, z linkiem prowadzącym do ekranu dokumentów, oraz wpis audytu
o akcji `document.generated` wskazujący wygenerowany dokument. Oba MUST powstać wyłącznie przy
udanym wydaniu — odrzucone żądanie MUST NOT zostawiać po sobie ani powiadomienia, ani audytu.

#### Scenario: Udane wydanie zostawia ślad

- **WHEN** użytkownik pomyślnie generuje porozumienie wolontariackie
- **THEN** powstaje powiadomienie `document.ready` dla tego użytkownika z linkiem
  do ekranu dokumentów oraz wpis audytu `document.generated` wskazujący ten dokument

#### Scenario: Odrzucone żądanie nie zostawia śladu

- **WHEN** użytkownik z niekompletnym profilem próbuje wygenerować porozumienie
- **THEN** nie powstaje żadne powiadomienie `document.ready` ani wpis audytu `document.generated`

### Requirement: Ekran dokumentów uczestnika

System SHALL udostępniać uczestniczce ekran dokumentów, na którym widzi swoje wygenerowane
dokumenty z numerem i datą wydania, pobiera je jednym działaniem oraz widzi, które typy może
teraz wygenerować. Gdy typ jest zablokowany, ekran MUST pokazać czytelny powód po polsku;
przy niekompletnym profilu MUST wymienić brakujące pola i prowadzić do ekranu profilu.
Teksty interfejsu MUST być po polsku.

#### Scenario: Uczestniczka pobiera dokument z ekranu

- **WHEN** `marta@demo.pl` otwiera ekran dokumentów i uruchamia pobranie `PW/2026/001`
- **THEN** plik zostaje pobrany, a ekran nie wymaga ręcznego przeklejania adresu

#### Scenario: Ekran wskazuje brakujące pola profilu

- **WHEN** uczestniczka z niekompletnym profilem otwiera ekran dokumentów
- **THEN** kafel porozumienia jest nieaktywny, wymienia brakujące pola po polsku
  i prowadzi do ekranu profilu

#### Scenario: Ekran wyjaśnia brak godzin stażu

- **WHEN** `marta@demo.pl` (41,5 h z 72) otwiera ekran dokumentów
- **THEN** kafel zaświadczenia o stażu jest nieaktywny i pokazuje stan godzin
  zaakceptowanych wobec wymaganych
