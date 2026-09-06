# certificate-issuance-verification Specification

## Purpose

Zdolność „certificate-issuance-verification" obejmuje warunki ukończenia programu liczone z jednego
wspólnego agregatora, wydanie certyfikatu absolwenta (numer per edycja, PDF z
kodem QR, zamrożony snapshot warunków, ustawienie daty ukończenia programu i wpis
do dziennika działań) oraz publiczną weryfikację autentyczności certyfikatu po
numerze i po tokenie z kodu QR.

## Requirements

### Requirement: Podgląd warunków ukończenia programu

System SHALL udostępniać zalogowanemu wolontariuszowi listę czterech warunków
ukończenia programu (`courses`, `internship`, `supervision`, `workshop`) wraz z
informacją, czy komplet jest spełniony. Wartości liczbowe MUST pochodzić z tego
samego źródła co karta osoby, pulpit i raport (agregator postępu ze startera).
Liczby dziesiętne (godziny) MUST być zwracane jako łańcuchy znaków. Warunek
`workshop` MUST mieć wyłącznie flagę spełnienia, bez liczników.

#### Scenario: Uczestnik w trakcie programu widzi braki

- **WHEN** wolontariusz z częściowym postępem (kursy 1 z 10, staż 41,5 z 72 h,
  superwizja 5 z 6, warsztat niezaliczony) pobiera warunki
- **THEN** odpowiedź zawiera `data.eligible = false` oraz cztery pozycje z
  `met = false`, a `internship.done = "41.5"` i `internship.required = "72"` są
  łańcuchami znaków

#### Scenario: Absolwentka ma komplet warunków

- **WHEN** wolontariuszka po skompletowaniu wszystkich filarów pobiera warunki
- **THEN** odpowiedź zawiera `data.eligible = true` i wszystkie cztery pozycje z
  `met = true`

#### Scenario: Liczby zgadzają się z resztą platformy

- **WHEN** dla tego samego uczestnika porówna się `done` z warunków z wartościami
  agregatora postępu
- **THEN** wartości `courses`, `internship`, `supervision`, `workshop` są
  identyczne w obu miejscach

#### Scenario: Rola bez prawa do certyfikatu

- **WHEN** student lub psycholog prowadzący żąda warunków certyfikatu
- **THEN** system odrzuca żądanie kodem 403 `forbidden`

#### Scenario: Żądanie bez tokenu

- **WHEN** gość bez tokenu żąda warunków certyfikatu
- **THEN** system odpowiada kodem 401 `unauthenticated`

### Requirement: Wydanie certyfikatu po spełnieniu warunków

System SHALL pozwalać wolontariuszowi zażądać wydania certyfikatu tylko wtedy, gdy
wszystkie cztery warunki są spełnione. Gdy warunki nie są spełnione, system MUST
odrzucić żądanie kodem 422 `conditions_not_met` i wskazać brakujące pozycje. Gdy
warunki są spełnione, system MUST przyjąć żądanie kodem 202 i wykonać wydanie w
tle: nadać numer w formacie ciągłym per edycja (`NP/<rok-edycji>/<kolejny>`) bez
dziur, wygenerować plik PDF z kodem QR, zapisać snapshot stanu warunków z chwili
wydania oraz znacznik `issued_at`. Wydanie MUST być jednokrotne dla pary
(uczestnik, edycja). Wydanie MUST ustawiać `users.program_completed_at` oraz
zapisywać zdarzenie audytowe `certificate.issued`.

#### Scenario: Braki blokują wydanie

- **WHEN** uczestnik z niespełnionymi warunkami żąda wydania certyfikatu
- **THEN** system odpowiada kodem 422 `conditions_not_met`, a `reason` wymienia
  brakujące warunki, i żaden rekord certyfikatu nie powstaje

#### Scenario: Wydanie dla absolwentki

- **WHEN** uczestniczka z kompletem warunków żąda wydania certyfikatu
- **THEN** system odpowiada kodem 202, po wykonaniu zadania istnieje certyfikat z
  unikalnym numerem per edycja, ustawiony `program_completed_at` uczestniczki oraz
  wpis audytowy `certificate.issued`

#### Scenario: Numeracja bez dziur przy równoległych wydaniach

- **WHEN** wiele wydań w tej samej edycji następuje współbieżnie
- **THEN** nadane numery tworzą ciąg kolejny bez dziur i bez duplikatów

#### Scenario: Powtórne żądanie nie tworzy drugiego certyfikatu

- **WHEN** uczestnik, który ma już certyfikat w bieżącej edycji, ponownie żąda
  wydania
- **THEN** system nie tworzy drugiego rekordu i nie zmienia nadanego numeru

#### Scenario: Bezterminowy dostęp po wydaniu

- **WHEN** certyfikat zostaje wydany uczestnikowi z wygasającym dostępem
- **THEN** ustawiony `program_completed_at` sprawia, że bramka dostępu czasowego
  przestaje blokować materiały programu

### Requirement: Pobranie własnego certyfikatu

System SHALL pozwalać właścicielowi pobrać plik swojego wydanego certyfikatu.
Gdy certyfikat nie został jeszcze wydany, system MUST odpowiedzieć kodem 404.

#### Scenario: Właściciel pobiera wydany certyfikat

- **WHEN** uczestnik z wydanym certyfikatem żąda pobrania
- **THEN** system zwraca plik certyfikatu

#### Scenario: Brak wydanego certyfikatu

- **WHEN** uczestnik bez wydanego certyfikatu żąda pobrania
- **THEN** system odpowiada kodem 404 `not_found`

### Requirement: Publiczna weryfikacja po numerze

System SHALL udostępniać bez uwierzytelnienia weryfikację certyfikatu po jego
numerze, zwracając numer, `status` (`valid | revoked`), oznaczenie edycji oraz
datę wydania. Dla numeru nieznanego oraz dla numeru w błędnym formacie system
MUST zwrócić kod 404 z **identycznym** komunikatem „Nie znaleziono certyfikatu o
podanym numerze.", nie ujawniając oczekiwanego formatu.

#### Scenario: Weryfikacja istniejącego certyfikatu

- **WHEN** ktokolwiek (bez tokenu) odpytuje weryfikację prawidłowym numerem
  wydanego certyfikatu
- **THEN** system zwraca kod 200 z `data.status = "valid"`, numerem, edycją i datą
  wydania

#### Scenario: Nieznany numer

- **WHEN** zapytanie używa poprawnie sformatowanego, ale nieistniejącego numeru
- **THEN** system odpowiada kodem 404 z komunikatem „Nie znaleziono certyfikatu o
  podanym numerze."

#### Scenario: Błędny format numeru

- **WHEN** zapytanie używa numeru w niepoprawnym formacie
- **THEN** system odpowiada kodem 404 z tym samym komunikatem co dla nieznanego
  numeru

#### Scenario: Certyfikat unieważniony

- **WHEN** weryfikowany jest certyfikat oznaczony jako unieważniony
- **THEN** system zwraca kod 200 z `data.status = "revoked"`

### Requirement: Publiczna weryfikacja po tokenie kodu QR

System SHALL udostępniać bez uwierzytelnienia weryfikację certyfikatu po tokenie
zakodowanym w kodzie QR, zwracając ten sam zestaw danych co weryfikacja po
numerze. Dla nieznanego tokenu system MUST zwrócić kod 404 z identycznym
komunikatem jak przy weryfikacji po numerze.

#### Scenario: Wejście z kodu QR

- **WHEN** ktokolwiek (bez tokenu) otwiera adres weryfikacji z tokenem z kodu QR
  wydanego certyfikatu
- **THEN** system zwraca kod 200 z danymi certyfikatu i `data.status = "valid"`

#### Scenario: Nieznany token

- **WHEN** zapytanie używa tokenu, który nie odpowiada żadnemu certyfikatowi
- **THEN** system odpowiada kodem 404 z komunikatem „Nie znaleziono certyfikatu o
  podanym numerze."
