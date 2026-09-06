# internship-journal-approvals Specification

## Purpose

Zapewnia uczestnikowi bezpieczny dziennik godzin stażu, a administracji kontrolowany przepływ akceptacji i odesłań, z którego wynikają wiarygodne postępy programu.

## Requirements

### Requirement: Uczestnik prowadzi wyłącznie własny dziennik stażu
System SHALL udostępniać aktywnemu wolontariuszowi listę wyłącznie jego własnych wpisów oraz możliwość utworzenia i edycji własnego wpisu przed jego akceptacją. Wskazanie identyfikatora wpisu należącego do innej osoby MUST nie ujawniać istnienia tego wpisu.

#### Scenario: Lista zawiera tylko wpisy właściciela
- **WHEN** uwierzytelniony wolontariusz pobiera `GET /internship/entries`
- **THEN** system zwraca w standardowej kopercie i paginacji wyłącznie wpisy przypisane do tego wolontariusza

#### Scenario: Utworzenie wpisu własnego
- **WHEN** uwierzytelniony wolontariusz wysyła poprawny `POST /internship/entries`
- **THEN** system zapisuje wpis dla bieżącego wolontariusza ze statusem `submitted` i zwraca odpowiedź `201` w kopercie `data`

#### Scenario: Cudzy wpis nie jest ujawniany podczas edycji
- **WHEN** wolontariusz wysyła `PATCH /internship/entries/{id}` dla wpisu innej osoby
- **THEN** system zwraca `404` z kodem `not_found` i nie modyfikuje wpisu

#### Scenario: Rola bez dostępu do dziennika uczestnika
- **WHEN** użytkownik bez uprawnienia wolontariusza wywołuje operację uczestnika dotyczącą dziennika stażu
- **THEN** system zwraca `403` z kodem `forbidden`

### Requirement: Kontrakt wpisu uczestnika ma zamknięty kształt
System SHALL zwracać zasób własnego wpisu z dokładnie polami `id`, `date`, `hours`, `form`, `consultations_count`, `description`, `status`, `review_comment`, `decided_at`, `created_at` i `updated_at`. `hours` MUST być stringiem dziesiętnym, `date` datą `YYYY-MM-DD`, a pola czasu niebędące `null` MUST być znacznikami ISO 8601 UTC. Zasób uczestnika MUST nie ujawniać `user_id`, danych administratora podejmującego decyzję ani zagnieżdżonego użytkownika. H11 MUST nie publikować operacji `GET /internship/entries/{id}`; dane do edycji pochodzą z listy własnych wpisów.

#### Scenario: Lista zwraca wyłącznie publiczne pola wpisu
- **WHEN** uczestnik pobiera `GET /internship/entries`
- **THEN** każdy element `data` zawiera dokładnie zatwierdzone pola zasobu uczestnika, a lista używa standardowej paginacji

#### Scenario: Utworzenie zwraca pełny zasób
- **WHEN** poprawny `POST /internship/entries` tworzy wpis
- **THEN** odpowiedź `201` zawiera w `data` pełny zasób uczestnika

#### Scenario: Edycja zwraca pełny zasób
- **WHEN** poprawny `PATCH /internship/entries/{id}` aktualizuje własny wpis
- **THEN** odpowiedź `200` zawiera w `data` pełny zasób uczestnika

#### Scenario: Brak pojedynczego pobrania wpisu
- **WHEN** sprawdzany jest zestaw tras H11
- **THEN** nie zawiera on operacji `GET /internship/entries/{id}`

### Requirement: Dane wpisu podlegają ścisłej walidacji domenowej
System MUST przy tworzeniu i edycji przyjmować datę nie późniejszą niż bieżąca data kalendarzowa, godziny od `0.5` do `24` włącznie i wyłącznie w krokach `0.5`, formę wyłącznie `phone_duty`, `chat_duty` albo `other` oraz liczbę konsultacji będącą nieujemną liczbą całkowitą. Niepoprawne dane SHALL zwracać `422 validation_failed` z błędami przypisanymi do pól.

#### Scenario: Poprawna wartość graniczna pół godziny
- **WHEN** wolontariusz składa wpis z dzisiejszą datą, godzinami `0.5`, dozwoloną formą i zerową liczbą konsultacji
- **THEN** system przyjmuje wpis

#### Scenario: Data z przyszłości
- **WHEN** wolontariusz podaje datę późniejszą niż bieżąca data kalendarzowa
- **THEN** system zwraca `422 validation_failed` z błędem pola `date`

#### Scenario: Godziny poza zakresem
- **WHEN** wolontariusz podaje mniej niż `0.5` albo więcej niż `24` godzin
- **THEN** system zwraca `422 validation_failed` z błędem pola `hours`

#### Scenario: Godziny poza krokiem
- **WHEN** wolontariusz podaje godziny, które nie są wielokrotnością `0.5`
- **THEN** system zwraca `422 validation_failed` z błędem pola `hours`

#### Scenario: Forma spoza słownika
- **WHEN** wolontariusz podaje formę inną niż `phone_duty`, `chat_duty` lub `other`
- **THEN** system zwraca `422 validation_failed` z błędem pola `form`

#### Scenario: Niecałkowita lub ujemna liczba konsultacji
- **WHEN** wolontariusz podaje ujemną albo niecałkowitą liczbę konsultacji
- **THEN** system zwraca `422 validation_failed` z błędem pola `consultations_count`

### Requirement: Opisy dyżurów chronią prywatność osób konsultowanych
System SHALL stale prezentować przy formularzu informację, że w opisie nie wolno wpisywać danych osób konsultowanych. Opis zapisany przez użytkownika MUST być wyświetlany jako tekst i MUST nie być interpretowany jako HTML ani wykonywalny kod.

#### Scenario: Nota prywatności jest stale widoczna
- **WHEN** uczestnik otwiera formularz nowego lub poprawianego wpisu
- **THEN** widzi bez dodatkowej interakcji polską informację o zakazie wpisywania danych osób konsultowanych

#### Scenario: Znaczniki w opisie nie są wykonywane
- **WHEN** zapisany opis zawiera tekst wyglądający jak znacznik HTML lub skrypt
- **THEN** interfejs prezentuje go jako nieszkodliwą treść tekstową i nie wykonuje ani nie renderuje go jako HTML

### Requirement: Licznik postępu obejmuje wyłącznie zaakceptowane godziny
System SHALL prezentować zaakceptowane godziny jako sumę pola `hours` wyłącznie dla własnych wpisów o statusie `accepted`. Wymagany wymiar MUST pochodzić z aktywnego ustawienia edycji `internship_hours_required`, a liczby dziesiętne w API MUST być zapisane jako stringi. `meta.extra` odpowiedzi listy MUST zawierać w zakresie H11 wyłącznie łączny postęp w polach `accepted_hours` i `required_hours`, bez podziału godzin według formy stażu.

#### Scenario: Wpis oczekujący nie zwiększa licznika
- **WHEN** wolontariusz ma wpis `submitted`
- **THEN** jego godziny nie są dodane do `accepted_hours`

#### Scenario: Wpis odesłany nie zwiększa licznika
- **WHEN** wolontariusz ma wpis `returned`
- **THEN** jego godziny nie są dodane do `accepted_hours`

#### Scenario: Akceptacja pół godziny zwiększa licznik
- **WHEN** administracja akceptuje wpis na `0.5` godziny
- **THEN** kolejne pobranie dziennika właściciela zwiększa `accepted_hours` dokładnie o `0.5`

#### Scenario: Zmiana wymaganego wymiaru w edycji
- **WHEN** wartość `internship_hours_required` aktywnej edycji różni się od `72`
- **THEN** odpowiedź i interfejs prezentują tę wartość jako `required_hours` bez stałej wartości zaszytej w H11

#### Scenario: Brak podziału postępu według formy
- **WHEN** uczestnik ma zaakceptowane wpisy różnych form
- **THEN** API i interfejs prezentują jeden łączny wynik bez osobnych sum dla `phone_duty`, `chat_duty` i `other`

### Requirement: Zaakceptowany wpis jest niezmienny dla uczestnika
System MUST odrzucać każdą próbę edycji wpisu `accepted` przez jego właściciela jako blokadę domenową i SHALL prezentować taki wpis jako zablokowany w interfejsie.

#### Scenario: API blokuje edycję zaakceptowanego wpisu
- **WHEN** właściciel wysyła `PATCH /internship/entries/{id}` dla wpisu `accepted`
- **THEN** system zwraca `403` z kodem `entry_locked` i nie zmienia wpisu

#### Scenario: Interfejs oznacza blokadę
- **WHEN** uczestnik przegląda wpis `accepted`
- **THEN** widzi polską etykietę zaakceptowanego i zablokowanego wpisu oraz nie otrzymuje aktywnej akcji edycji

### Requirement: Odesłany wpis można poprawić i złożyć ponownie
System SHALL pozwalać właścicielowi edytować wpis `returned`. Poprawna edycja MUST ustawić status z powrotem na `submitted`, zachować dotychczasowy komentarz opiekuna i ponownie umieścić wpis w kolejce administracyjnej.

#### Scenario: Ponowne złożenie po poprawie
- **WHEN** właściciel poprawnie edytuje wpis `returned`
- **THEN** system zapisuje zmiany, ustawia `submitted`, zachowuje `review_comment` i wpis jest ponownie dostępny w kolejce oczekujących

#### Scenario: Uczestnik widzi powód odesłania
- **WHEN** uczestnik otwiera odesłany wpis
- **THEN** interfejs prezentuje zachowany komentarz opiekuna oraz akcję poprawienia i ponownego wysłania

#### Scenario: Późniejsza akceptacja nie usuwa komentarza
- **WHEN** poprawiony wpis z zachowanym `review_comment` zostaje następnie zaakceptowany
- **THEN** system zachowuje dotychczasowy `review_comment` w zaakceptowanym wpisie

### Requirement: Decyzje o wpisach są dostępne wyłącznie administracji
System MUST zezwalać na pobranie kolejki, akceptację i odesłanie wyłącznie rolom `project_manager` i `super_admin`. Użytkownik innej roli SHALL otrzymać `403 forbidden`. Kolejka SHALL obejmować wyłącznie wpisy w statusie `submitted`, używać standardowej paginacji z domyślną wielkością strony `25` i zwracać najstarsze wpisy jako pierwsze według `created_at`, a przy remisie według rosnącego `id`.

#### Scenario: Administracja pobiera kolejkę
- **WHEN** użytkownik roli `project_manager` lub `super_admin` wywołuje `GET /admin/internship/pending`
- **THEN** system zwraca `200` ze standardową stronicowaną kopertą wpisów `submitted`, po `25` elementów domyślnie, bez wpisów `accepted` i `returned`, od najstarszego wpisu

#### Scenario: Wolontariusz nie może pobrać kolejki
- **WHEN** wolontariusz wywołuje `GET /admin/internship/pending`
- **THEN** system zwraca `403` z kodem `forbidden`

#### Scenario: Wolontariusz nie może zaakceptować ani odesłać wpisu
- **WHEN** wolontariusz wywołuje administracyjną akcję `accept` lub `return`
- **THEN** system zwraca `403` z kodem `forbidden` i nie zmienia wpisu

### Requirement: Zasób kolejki ujawnia tylko dane potrzebne administracji
System SHALL zwracać w kolejce i odpowiedziach decyzji wszystkie pola zasobu uczestnika oraz dodatkowe pole `user`, zawierające dokładnie `id`, `first_name` i `last_name` właściciela wpisu. Administracyjny zasób wpisu MUST nie ujawniać innych pól użytkownika ani danych osoby podejmującej decyzję.

#### Scenario: Element kolejki ma zatwierdzony kształt administracyjny
- **WHEN** administracja pobiera `GET /admin/internship/pending`
- **THEN** każdy element `data` zawiera dokładnie pola zasobu uczestnika i obiekt `user` z polami `id`, `first_name` i `last_name`

### Requirement: Administracja akceptuje wpis oczekujący
System SHALL umożliwiać administracji zmianę wpisu `submitted` na `accepted` przez `POST /admin/internship/{id}/accept` bez ciała żądania. Decyzja MUST zapisać osobę i czas decyzji, utworzyć audyt wyłącznie ze slugiem `internship.accepted` i wysłać właścicielowi powiadomienie wyłącznie typu `internship.accepted`.

#### Scenario: Poprawna akceptacja
- **WHEN** administracja akceptuje wpis `submitted`
- **THEN** wpis otrzymuje status `accepted`, osobę i czas decyzji, jego godziny zaczynają wliczać się do postępu właściciela, a odpowiedź `200` zawiera w `data` pełny zasób administracyjny po zmianie

#### Scenario: Audyt i powiadomienie po akceptacji
- **WHEN** akceptacja wpisu kończy się powodzeniem
- **THEN** system zapisuje dla wpisu zdarzenie audytowe `internship.accepted` i wysyła jego właścicielowi powiadomienie `internship.accepted`, bez użycia innych slugów H11

### Requirement: Administracja odsyła wpis wyłącznie z komentarzem
System SHALL umożliwiać administracji zmianę wpisu `submitted` na `returned` przez `POST /admin/internship/{id}/return` z ciałem zawierającym wymagany, niepusty string `comment`. Decyzja MUST zapisać komentarz, osobę i czas decyzji, utworzyć audyt wyłącznie ze slugiem `internship.returned` i wysłać właścicielowi powiadomienie wyłącznie typu `internship.returned`.

#### Scenario: Brak komentarza blokuje odesłanie
- **WHEN** administracja próbuje odesłać wpis bez niepustego `comment`
- **THEN** system zwraca `422 validation_failed` z błędem pola `comment` i pozostawia wpis bez zmian

#### Scenario: Poprawne odesłanie
- **WHEN** administracja odsyła wpis `submitted` z niepustym komentarzem
- **THEN** wpis otrzymuje status `returned`, zachowany komentarz, osobę i czas decyzji, a odpowiedź `200` zawiera w `data` pełny zasób administracyjny po zmianie

#### Scenario: Audyt i powiadomienie po odesłaniu
- **WHEN** odesłanie wpisu kończy się powodzeniem
- **THEN** system zapisuje dla wpisu zdarzenie audytowe `internship.returned` i wysyła jego właścicielowi powiadomienie `internship.returned`, bez użycia innych slugów H11

### Requirement: Decyzję można podjąć tylko dla wpisu oczekującego
System MUST pozwalać na akceptację lub odesłanie wyłącznie wpisu w statusie `submitted`. Próba ponowienia tej samej albo wykonania przeciwnej decyzji dla wpisu `accepted` lub `returned` SHALL zwracać `403 entry_locked` bez zmiany danych, kolejnego audytu i kolejnego powiadomienia.

#### Scenario: Ponowiona akceptacja jest zablokowana
- **WHEN** administracja wywołuje akcję `accept` dla wpisu `accepted`
- **THEN** system zwraca `403 entry_locked` i nie tworzy kolejnego audytu ani powiadomienia

#### Scenario: Przeciwna decyzja jest zablokowana
- **WHEN** administracja wywołuje akcję `return` dla wpisu `accepted` albo dowolną decyzję dla wpisu `returned`
- **THEN** system zwraca `403 entry_locked` bez zmiany wpisu, audytu i powiadomienia

### Requirement: Interfejs obsługuje pełny cykl działań i stanów
Ekrany `/panel/staz` i `/admin/staz` SHALL używać polskich treści, semantycznych etykiet statusów i dostępnych kontrolek zgodnych z systemem wizualnym. Interfejs MUST jawnie obsługiwać ładowanie, pustą listę, błąd, zapis lub wysłanie wpisu, akceptację, odesłanie i blokadę wpisu oraz MUST blokować wielokrotne uruchomienie trwającej akcji.

#### Scenario: Ładowanie dziennika
- **WHEN** ekran uczestnika oczekuje na pierwszą odpowiedź API
- **THEN** prezentuje stabilny, polski stan ładowania

#### Scenario: Pusty dziennik
- **WHEN** uczestnik nie ma żadnych wpisów
- **THEN** ekran prezentuje polski stan pusty i nadal umożliwia dodanie pierwszego wpisu

#### Scenario: Pusta kolejka administracyjna
- **WHEN** nie ma wpisów `submitted`
- **THEN** ekran administracji prezentuje polską informację o braku wpisów oczekujących

#### Scenario: Błąd pobierania
- **WHEN** pobranie danych ekranu kończy się błędem
- **THEN** interfejs prezentuje dostępny komunikat błędu zamiast pustej lub niepełnej treści

#### Scenario: Trwa zapis lub ponowne wysłanie
- **WHEN** żądanie utworzenia albo edycji wpisu jest w toku
- **THEN** odpowiednia akcja jest oznaczona jako trwająca i zablokowana przed wielokrotnym wysłaniem

#### Scenario: Trwa decyzja administracyjna
- **WHEN** żądanie akceptacji albo odesłania jest w toku
- **THEN** akcje dotyczące tego wpisu są oznaczone jako trwające i zablokowane do zakończenia żądania

#### Scenario: Błąd walidacji formularza
- **WHEN** API zwraca błędy pól formularza wpisu lub komentarza odesłania
- **THEN** interfejs wiąże polskie komunikaty z odpowiednimi polami i ogłasza stan błędu technologiom asystującym
