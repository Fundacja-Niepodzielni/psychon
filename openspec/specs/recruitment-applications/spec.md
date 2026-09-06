# recruitment-applications Specification

## Purpose

Zdolność zapewnia administracji kontrolowaną, audytowalną obsługę zgłoszeń rekrutacyjnych od wpływu do decyzji, bez udostępniania publicznej samodzielnej rejestracji.

## Requirements

### Requirement: Dostęp administracyjny i brak publicznej rejestracji
System SHALL udostępniać operacje H03 wyłącznie uwierzytelnionym użytkownikom z rolą `project_manager` albo `super_admin` i MUST nie udostępniać publicznej trasy API tworzącej konto lub zgłoszenie kandydata.

#### Scenario: Administracja otwiera kolejkę
- **WHEN** uwierzytelniony Opiekun Projektu albo Super Admin żąda kolejki zgłoszeń
- **THEN** system dopuszcza żądanie i zwraca odpowiedź w kontraktowej kopercie

#### Scenario: Rola nieadministracyjna próbuje otworzyć kolejkę
- **WHEN** Student, Wolontariusz albo Psycholog prowadzący żąda dowolnej operacji `/admin/applications`
- **THEN** system zwraca `403 forbidden` bez ujawnienia danych zgłoszeń

#### Scenario: Gość próbuje użyć operacji H03
- **WHEN** nieuwierzytelniony klient żąda dowolnej operacji H03
- **THEN** system zwraca `401 unauthenticated`

#### Scenario: Próba samodzielnej rejestracji
- **WHEN** klient próbuje wywołać publiczną trasę API rejestracji kandydata albo konta inną niż zatwierdzone trasy auth startera
- **THEN** trasa nie istnieje i system zwraca `404 not_found`

### Requirement: Kolejka i szczegóły zgłoszeń
System SHALL udostępniać administracji paginowaną kolejkę zgłoszeń wraz ze statusami oraz szczegóły pojedynczego zgłoszenia, zgodnie z DTO, filtrami, sortowaniem i sposobem adresowania zatwierdzonymi w bramkach `G-H03-01` i `G-H03-03`.

#### Scenario: Lista zgłoszeń aktywnej edycji
- **WHEN** administrator pobiera `GET /admin/applications` z zatwierdzonymi parametrami paginacji, filtrów i sortowania
- **THEN** system zwraca wyłącznie dozwolone zgłoszenia w `data` oraz standardową paginację w `meta`

#### Scenario: Pusta kolejka
- **WHEN** żadne zgłoszenie nie spełnia zatwierdzonych filtrów
- **THEN** system zwraca pustą tablicę `data` i poprawne `meta`, bez traktowania pustego wyniku jako błędu

#### Scenario: Odczyt szczegółów
- **WHEN** administrator wybiera zgłoszenie z kolejki
- **THEN** system zwraca zatwierdzony DTO szczegółów bez ujawniania surowej ścieżki pliku skanu dyplomu

### Requirement: Ręczne utworzenie zgłoszenia
System SHALL pozwalać administracji utworzyć zgłoszenie przez `POST /admin/applications` według wejścia, walidacji i odpowiedzi zatwierdzonych w bramce `G-H03-02`; utworzenie zgłoszenia MUST nie tworzyć konta użytkownika.

#### Scenario: Poprawne ręczne zgłoszenie
- **WHEN** administrator wysyła kompletne, poprawne dane zgodne z zatwierdzonym DTO
- **THEN** system zapisuje zgłoszenie ze statusem `new` dla właściwej edycji i zwraca zatwierdzoną odpowiedź sukcesu

#### Scenario: Niepoprawne dane zgłoszenia
- **WHEN** administrator wysyła dane niespełniające zatwierdzonych reguł walidacji
- **THEN** system zwraca `422 validation_failed`, nie zapisuje zgłoszenia i nie tworzy konta

### Requirement: Rejestrowany dostęp do skanu dyplomu
System SHALL udostępniać skan dyplomu wyłącznie administracji przez kształt HTTP zatwierdzony w bramce `G-H03-04`; każdy udany wgląd lub pobranie MUST utworzyć wpis w `sensitive_access_log` oraz audyt `sensitive.viewed`.

#### Scenario: Administrator ogląda skan
- **WHEN** Opiekun Projektu albo Super Admin uzyskuje dostęp do skanu dyplomu zgłoszenia
- **THEN** system zwraca plik zgodnie z zatwierdzonym kontraktem i zapisuje identyfikator oglądającego, typ pliku, identyfikator zgłoszenia oraz czas wglądu
- **AND** system zapisuje audyt `sensitive.viewed` przez zatwierdzoną fasadę audytu

#### Scenario: Brak skanu
- **WHEN** administrator żąda skanu dla zgłoszenia, które go nie posiada
- **THEN** system zwraca zatwierdzony przez strażnika błąd bez tworzenia fałszywego wpisu wglądu

#### Scenario: Nieadministracyjny wgląd w skan
- **WHEN** użytkownik bez uprawnienia do dokumentów wrażliwych próbuje uzyskać skan
- **THEN** system odmawia dostępu i nie zapisuje zdarzenia jako udanego wglądu

### Requirement: Akceptacja tworzy aktywowalne konto
System SHALL obsługiwać `POST /admin/applications/{id}/accept` jako jedną decyzję domenową: zwalidować rolę według bramki `G-H03-07`, utworzyć konto bez hasła, przypisać zgłoszenie i aktywną edycję, ustawić `access_expires_at` na czas akceptacji plus sześć miesięcy, oznaczyć zgłoszenie jako `accepted`, zapisać audyt `application.accepted` i wysłać `application.accepted` przez `Notify::send`.

#### Scenario: Poprawna akceptacja
- **WHEN** administrator akceptuje nowe zgłoszenie do edycji mieszczącej się w limicie i podaje dozwoloną rolę
- **THEN** system zwraca `201` z `data.user_id` oraz `data.access_expires_at`
- **AND** utworzone konto nie ma hasła, ma jednorazowy token aktywacyjny i otrzymuje symulowany e-mail z linkiem do `auth/activate`
- **AND** zgłoszenie wskazuje utworzone konto i zawiera dane decyzji

#### Scenario: Aktywacja i pierwsze logowanie
- **WHEN** odbiorca używa tokenu z zaproszenia w `POST /auth/activate`, ustawia poprawne hasło, a następnie loguje się tym hasłem
- **THEN** aktywacja i pierwsze logowanie kończą się sukcesem, a token aktywacyjny nie może zostać użyty ponownie

#### Scenario: Audyt i powiadomienie akceptacji
- **WHEN** akceptacja kończy się sukcesem
- **THEN** istnieje dokładnie jeden audyt `application.accepted`, jedno powiadomienie `application.accepted` i odpowiadający mu e-mail `simulated`

### Requirement: Limit miejsc i jawne force
System SHALL kontrolować limit miejsc edycji podczas akceptacji według semantyki zatwierdzonej w bramce `G-H03-05` i MUST przekroczyć limit wyłącznie po jawnym `force` w żądaniu.

#### Scenario: Limit przekroczony bez force
- **WHEN** akceptacja zwiększyłaby liczbę aktywnych uczestników ponad `seats_limit`, a żądanie nie zawiera jawnego `force`
- **THEN** system zwraca `409 edition_capacity_exceeded` z `reason.capacity`, `reason.active` i `reason.requested`
- **AND** nie zmienia zgłoszenia, nie tworzy użytkownika, audytu ani powiadomienia

#### Scenario: Jawne force ponad limit
- **WHEN** uprawniony administrator powtarza akceptację z jawnym `force` zgodnym z zatwierdzonym payloadem
- **THEN** system może zaakceptować zgłoszenie ponad limit i wykonuje pełny przebieg akceptacji

### Requirement: Konflikt istniejącego e-maila
System SHALL odrzucić akceptację zgłoszenia, jeżeli konto o tym samym znormalizowanym adresie e-mail już istnieje.

#### Scenario: E-mail już zarejestrowany
- **WHEN** administrator akceptuje zgłoszenie z adresem e-mail istniejącego konta
- **THEN** system zwraca `409 email_already_registered` z `reason.existing_user_id`
- **AND** nie zmienia zgłoszenia i nie tworzy dodatkowego użytkownika, audytu ani powiadomienia

### Requirement: Odrzucenie wymaga powodu
System SHALL wymagać niepustego powodu dla `POST /admin/applications/{id}/reject`, zapisać decyzję i audyt `application.rejected` oraz wyemitować zatwierdzone powiadomienie/e-mail `application.rejected` według rozstrzygnięcia bramki `G-H03-10`.

#### Scenario: Brak powodu
- **WHEN** administrator odrzuca zgłoszenie bez niepustego `reason`
- **THEN** system zwraca `422 validation_failed` z błędem pola `reason`
- **AND** zgłoszenie pozostaje bez zmian i nie powstaje audyt ani powiadomienie

#### Scenario: Odrzucenie z powodem
- **WHEN** administrator odrzuca nowe zgłoszenie z poprawnym powodem
- **THEN** system oznacza je jako `rejected`, zapisuje powód, osobę i czas decyzji oraz zwraca odpowiedź zatwierdzoną w bramce `G-H03-06`
- **AND** istnieje dokładnie jeden audyt `application.rejected` oraz jeden zatwierdzony e-mail/powiadomienie `application.rejected`

### Requirement: Import CSV raportuje wynik per wiersz
System SHALL przyjmować administracyjny import multipart przez `POST /admin/applications/import`, tworzyć wyłącznie poprawne nowe zgłoszenia i zwracać raport `data.imported` oraz `data.skipped` zgodny z kontraktem i bramką `G-H03-08`; import MUST nie tworzyć kont użytkowników.

#### Scenario: Import mieszany
- **WHEN** plik zawiera poprawne, niepoprawne i zduplikowane wiersze według zatwierdzonych reguł CSV
- **THEN** system tworzy zgłoszenia wyłącznie z poprawnych wierszy, zwraca ich liczbę w `imported` i wpis `{line, reason}` dla każdego pominiętego wiersza

#### Scenario: Niepoprawny plik importu
- **WHEN** multipart, kodowanie, nagłówki albo rozmiar pliku nie spełniają zatwierdzonego kontraktu
- **THEN** system zwraca `422 validation_failed` i nie tworzy zgłoszeń ani kont

### Requirement: Decyzje są jednokrotne i atomowe
System SHALL stosować wynik bramek `G-H03-06` i `G-H03-09` dla ponownych lub sprzecznych decyzji oraz atomowej granicy zapisu zgłoszenia, konta, audytu i powiadomień.

#### Scenario: Powtórzona lub sprzeczna decyzja
- **WHEN** administrator próbuje ponownie zaakceptować albo odrzucić rozstrzygnięte zgłoszenie
- **THEN** system zwraca zatwierdzony błąd domenowy bez dodatkowej zmiany danych, audytu lub powiadomienia

#### Scenario: Błąd dowolnego skutku ubocznego decyzji
- **WHEN** w trakcie decyzji nie powiedzie się którykolwiek obowiązkowy zapis objęty zatwierdzoną granicą transakcji
- **THEN** system nie pozostawia częściowo rozstrzygniętego zgłoszenia ani osieroconego konta, audytu, powiadomienia lub e-maila

### Requirement: Zakładka Zgłoszenia integruje się przez slot H18
System SHALL dostarczać polskojęzyczny, samodzielny komponent zakładki „Zgłoszenia” bez modyfikowania strony, layoutu ani rejestru menu należącego do H18 lub sztabu.

#### Scenario: H18 osadza komponent H03
- **WHEN** właściciel H18 importuje publiczny deskryptor slotu albo komponent H03 do `/admin/uczestniczki`
- **THEN** zakładka pokazuje kolejkę i szczegóły oraz udostępnia zatwierdzone działania H03 bez wymaganych propsów zależnych od wewnętrznego stanu H18

#### Scenario: Slot H18 nie jest jeszcze dostępny
- **WHEN** H18 nie udostępnił miejsca integracji
- **THEN** komponent H03 pozostaje kompilowalnym, samodzielnym artefaktem bez osobnej publicznej strony, zmiany menu lub edycji plików H18

#### Scenario: Stany i dostępność interfejsu
- **WHEN** użytkownik ładuje dane, widzi pustą kolejkę, napotyka błąd, wykonuje akcję albo kończy ją sukcesem
- **THEN** interfejs pokazuje odpowiednio stany loading, empty, error, pending action i success, blokuje duplikację akcji, zachowuje widoczny fokus, zarządza focusem dialogów, ma etykiety ARIA i działa klawiaturą oraz na urządzeniach mobilnych

#### Scenario: Bezpieczne wyświetlenie treści użytkownika
- **WHEN** szczegóły zgłoszenia zawierają tekst pochodzący od kandydata
- **THEN** interfejs renderuje go jako tekst bez wykonywania HTML lub skryptów

### Requirement: Lokalny kontrakt implementacyjny H03
System SHALL używać lokalnych decyzji API opisanych w `design.md` do czasu ich
przeniesienia do kanonicznego kontraktu. Lista i szczegóły ograniczają się do
aktywnej edycji, accept przyjmuje `role` oraz opcjonalne boolean `force`, import
przyjmuje multipart `file`, a skan jest dostępny pod
`GET /admin/applications/{id}/diploma-scan`.

#### Scenario: Jawne przekroczenie limitu
- **WHEN** administrator ponawia akceptację z `force: true`
- **THEN** serwis wykonuje akceptację mimo przekroczenia `seats_limit` i zapisuje
  w audycie, że wymuszenie było użyte

#### Scenario: Import nie tworzy kont
- **WHEN** poprawne wiersze CSV zostają zaimportowane
- **THEN** tworzone są wyłącznie rekordy `applications` ze statusem `new`, bez
  rekordów `users`
