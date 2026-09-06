## Purpose

Zapewnia bezpieczny przepływ terminów, zapisów, grupy prowadzącego, obecności i historycznych przypisań superwizora, tak aby obecności wiarygodnie zasilały warunek certyfikatu.

## ADDED Requirements

### Requirement: Dostęp do funkcji superwizji jest egzekwowany serwerowo
System SHALL wymagać uwierzytelnienia i właściwej roli dla każdej operacji H12. Operacje uczestnika SHALL być dostępne wyłącznie wolontariuszowi z aktywnym dostępem, operacje grupy i tworzenia terminów SHALL respektować zakres prowadzącego, oznaczanie obecności SHALL dopuszczać prowadzącego danego terminu albo administrację, a przypisanie superwizora SHALL być dostępne wyłącznie administracji.

#### Scenario: Brak uwierzytelnienia
- **WHEN** klient bez ważnego tokenu wywołuje dowolną operację H12
- **THEN** system zwraca `401 unauthenticated`

#### Scenario: Niewłaściwa rola
- **WHEN** uwierzytelniony użytkownik wywołuje operację niedostępną dla jego roli
- **THEN** system zwraca `403 forbidden`

#### Scenario: Wygasły dostęp wolontariusza
- **WHEN** wolontariusz bez ukończonego programu i z wygasłym dostępem wywołuje operację uczestnika H12
- **THEN** system zwraca `403 access_expired`

### Requirement: Uczestnik otrzymuje jednoznaczny zasób terminu
Element odpowiedzi uczestnika SHALL zawierać dokładnie pola `id`, `starts_at`, `duration_minutes`, `seats_limit`, `location_or_link`, `active_signups_count`, `available_seats`, `is_full` i `signup`. Pole `signup` SHALL być `null` albo obiektem z polami `signed_up_at` i `attendance`, gdzie `attendance` ma wartość `present`, `absent` albo `null`. Czas SHALL być zapisany jako ISO 8601 UTC, a liczniki miejsc SHALL uwzględniać wyłącznie zapisy bez `cancelled_at`.

#### Scenario: Termin z aktywnym własnym zapisem
- **WHEN** wolontariusz pobiera termin, na który ma aktywny zapis
- **THEN** `signup` zawiera jego `signed_up_at` i `attendance`, a liczniki miejsc obejmują ten zapis

#### Scenario: Termin bez aktywnego własnego zapisu
- **WHEN** wolontariusz nie ma aktywnego zapisu albo jego rekord ma `cancelled_at`
- **THEN** `signup` ma wartość `null`, a anulowany rekord nie zajmuje miejsca

### Requirement: Uczestnik widzi terminy aktualnego superwizora
`GET /supervision/slots` SHALL zwracać standardową paginowaną listę, domyślnie po 25 i maksymalnie po 100 elementów, wyłącznie dla superwizora z aktualnego przypisania wolontariusza, czyli rekordu bez `unassigned_at`. Lista SHALL być uporządkowana po `starts_at` rosnąco, a przy remisie po `id` rosnąco.

#### Scenario: Lista terminów własnej grupy
- **WHEN** wolontariusz ma aktualne przypisanie i pobiera listę terminów
- **THEN** system zwraca wyłącznie terminy aktualnego superwizora w standardowej kopercie listy

#### Scenario: Brak aktualnego przypisania
- **WHEN** wolontariusz nie ma rekordu przypisania bez `unassigned_at`
- **THEN** system zwraca `200` z pustą listą i standardowymi metadanymi paginacji

#### Scenario: Zmiana superwizora wpływa na listę
- **WHEN** poprzednie przypisanie zostało zamknięte, a nowe jest aktualne
- **THEN** kolejne pobranie listy opiera się na nowym superwizorze bez usuwania historii z bazy

### Requirement: Zapis jest ograniczony do własnej grupy i terminu przed startem
`POST /supervision/slots/{id}/signup` SHALL pozwalać aktywnemu wolontariuszowi zapisać się wyłącznie przed `starts_at` na termin jego aktualnego superwizora. Każdy udany pierwszy, ponowny albo idempotentny zapis SHALL zwracać `201` z pełnym zasobem terminu uczestnika.

#### Scenario: Pierwszy zapis do własnej grupy
- **WHEN** aktywny wolontariusz zapisuje się przed rozpoczęciem na mający wolne miejsce termin aktualnego superwizora
- **THEN** system tworzy aktywny zapis, ustawia `signed_up_at` i zwraca `201`

#### Scenario: Zapis do cudzej grupy
- **WHEN** wolontariusz próbuje zapisać się na termin prowadzącego, który nie jest jego aktualnym superwizorem
- **THEN** system zwraca `403 not_your_supervisor` i nie tworzy ani nie reaktywuje zapisu

#### Scenario: Zapis w chwili rozpoczęcia albo później
- **WHEN** wolontariusz próbuje zapisać się w chwili `starts_at` albo później
- **THEN** system zwraca `422 validation_failed` i nie zmienia zapisu

#### Scenario: Nieistniejący termin
- **WHEN** wolontariusz wskazuje identyfikator nieistniejącego terminu
- **THEN** system zwraca `404 not_found`

### Requirement: Cykl życia zapisu wykorzystuje istniejący rekord
Ponowny zapis przy już aktywnym rekordzie SHALL być idempotentny i MUST nie zmieniać `signed_up_at` ani zajmować dodatkowego miejsca. Ponowny zapis po anulowaniu SHALL reaktywować ten sam rekord przez wyzerowanie `cancelled_at`, ustawienie nowego `signed_up_at` oraz wyzerowanie `attendance` i `attendance_marked_by`, ale dopiero po ponownym sprawdzeniu relacji i limitu miejsc.

#### Scenario: Powtórzenie aktywnego zapisu
- **WHEN** wolontariusz ponawia zapis na termin, na który jest już aktywnie zapisany
- **THEN** system zwraca `201` z bieżącym zasobem terminu bez utworzenia rekordu i bez zmiany czasu pierwotnego zapisu

#### Scenario: Reaktywacja anulowanego zapisu
- **WHEN** wolontariusz ponawia zapis przed startem, jego poprzedni rekord jest anulowany i istnieje wolne miejsce
- **THEN** system reaktywuje ten sam rekord, czyści poprzednią obecność i zwraca `201`

#### Scenario: Reaktywacja przy pełnym terminie
- **WHEN** anulowany zapis jest ponawiany, ale wszystkie miejsca są zajęte przez aktywne zapisy
- **THEN** system zwraca `409 slot_full` i pozostawia rekord anulowany

### Requirement: Limit miejsc jest nieprzekraczalny przy współbieżności
Przyjęcie nowego lub reaktywowanego zapisu SHALL być operacją atomową względem `seats_limit`. Aktywne zapisy nie mogą przekroczyć limitu, a każde nadmiarowe żądanie SHALL zwrócić `409 slot_full`.

#### Scenario: Zapis na pełny termin
- **WHEN** liczba aktywnych zapisów osiągnęła limit i kolejny wolontariusz próbuje się zapisać
- **THEN** system zwraca `409 slot_full` i liczba aktywnych zapisów nie rośnie

#### Scenario: Dziesięć równoległych zapisów na trzy miejsca
- **WHEN** dziesięciu uprawnionych wolontariuszy równolegle próbuje zapisać się na pusty termin z limitem trzech miejsc
- **THEN** dokładnie trzy żądania kończą się `201`, siedem kończy się `409 slot_full`, a w bazie istnieją dokładnie trzy aktywne zapisy

### Requirement: Wypisanie zachowuje historię i jest możliwe tylko przed startem
`DELETE /supervision/slots/{id}/signup` SHALL przed `starts_at` ustawić `cancelled_at` na własnym aktywnym zapisie bez usuwania rekordu i SHALL zwrócić `200` z pełnym zasobem terminu uczestnika, w którym `signup` ma wartość `null`.

#### Scenario: Wypis przed rozpoczęciem
- **WHEN** wolontariusz wypisuje własny aktywny zapis przed `starts_at`
- **THEN** system ustawia `cancelled_at`, zwalnia miejsce i zwraca `200`

#### Scenario: Próba wypisu w chwili rozpoczęcia albo później
- **WHEN** wolontariusz próbuje wypisać się w chwili `starts_at` albo później
- **THEN** system zwraca `422 validation_failed` bez zmiany aktywnego zapisu

#### Scenario: Brak aktywnego własnego zapisu
- **WHEN** wskazany termin nie istnieje, nie należy do aktualnego superwizora albo wolontariusz nie ma na nim aktywnego zapisu
- **THEN** system zwraca `404 not_found` bez ujawnienia cudzego zasobu

### Requirement: Prowadzący otrzymuje własną grupę, postępy i własne terminy
`GET /instructor/group` SHALL zwracać `200` z obiektem `data` zawierającym tablice `members` i `slots`. `members` SHALL obejmować wyłącznie aktualnie przypisanych wolontariuszy i dla każdej osoby pola `id`, `first_name`, `last_name` oraz `progress` z polami `courses_done`, `courses_total`, `hours_accepted`, `supervision_present` i `workshop_done`. `slots` SHALL obejmować wyłącznie terminy prowadzącego i zasób terminu prowadzącego z polami `id`, `starts_at`, `duration_minutes`, `seats_limit`, `location_or_link`, `active_signups_count`, `available_seats` oraz `signups`. Każdy aktywny zapis w `signups` SHALL zawierać `user` z polami `id`, `first_name`, `last_name` oraz pola `signed_up_at` i `attendance`.

#### Scenario: Izolacja grup prowadzących
- **WHEN** prowadzący pobiera grupę, a system ma przypisania i terminy innych prowadzących
- **THEN** odpowiedź zawiera wyłącznie jego aktualnych członków, jego terminy i aktywne zapisy na te terminy

#### Scenario: Postęp członka grupy
- **WHEN** członek grupy ma ukończone kursy, zaakceptowany staż, obecności i warsztat
- **THEN** `progress` jest zgodny z wartościami wspólnego źródła używanego przez warunki certyfikatu

#### Scenario: Brak członków i terminów
- **WHEN** prowadzący nie ma aktualnej grupy ani utworzonych terminów
- **THEN** system zwraca `200` z pustymi tablicami `members` i `slots`

### Requirement: Prowadzący tworzy wyłącznie własne terminy
`POST /instructor/slots` SHALL przyjmować wymagane `starts_at` oraz opcjonalne `duration_minutes`, `seats_limit` i `location_or_link`. `starts_at` MUST być poprawnym czasem ISO 8601 UTC w przyszłości, `duration_minutes` MUST być liczbą całkowitą od 1 do 65535, `seats_limit` MUST być liczbą całkowitą od 1 do 255, a `location_or_link` MUST być wartością `null` albo stringiem o długości do 255 znaków. Pominięte pola SHALL używać istniejących domyślnych wartości bazy: 90 minut, 3 miejsca i `null`. Właściciel SHALL zawsze pochodzić z uwierzytelnionego prowadzącego, a sukces SHALL zwracać `201` z zasobem terminu prowadzącego.

#### Scenario: Utworzenie własnego terminu z wartościami domyślnymi
- **WHEN** prowadzący wysyła tylko przyszłe `starts_at`
- **THEN** system tworzy jego termin z czasem 90 minut, limitem 3 miejsc i pustą lokalizacją oraz zwraca `201`

#### Scenario: Próba wskazania innego właściciela
- **WHEN** payload zawiera `supervisor_id` albo inny identyfikator właściciela
- **THEN** pole nie jest dozwolonym wejściem, a termin nie może zostać utworzony dla innej osoby

#### Scenario: Nieprawidłowe dane terminu
- **WHEN** którekolwiek pole nie spełnia ustalonego typu, zakresu albo `starts_at` nie jest w przyszłości
- **THEN** system zwraca `422 validation_failed` i nie tworzy terminu

### Requirement: Obecność jest atomowa, ma zamknięty słownik i właściwego autora
`PATCH /instructor/slots/{id}/attendance` SHALL przyjmować obiekt `attendance`, którego kluczami są identyfikatory użytkowników z aktywnym zapisem na termin, a wartościami wyłącznie `present` albo `absent`. Cała mapa SHALL zostać zapisana albo odrzucona. Operacja SHALL być dostępna po `starts_at + duration_minutes` prowadzącemu danego terminu albo rolom `project_manager` i `super_admin`, SHALL ustawiać `attendance_marked_by` na wykonawcę i SHALL zwracać `200` z zasobem terminu prowadzącego. Ponowne oznaczenie SHALL nadpisywać wcześniejszą wartość i autora.

#### Scenario: Prowadzący oznacza własny zakończony termin
- **WHEN** prowadzący terminu po jego zakończeniu przesyła poprawną mapę obecności
- **THEN** system zapisuje wszystkie wartości i identyfikator prowadzącego jako autora oraz zwraca `200`

#### Scenario: Administracja oznacza obecność
- **WHEN** `project_manager` albo `super_admin` oznacza obecność po zakończeniu terminu
- **THEN** system zapisuje obecność i administratora jako autora

#### Scenario: Inny prowadzący wskazuje termin
- **WHEN** prowadzący niebędący właścicielem wskazuje termin do aktualizacji
- **THEN** system zwraca `404 not_found` i nie ujawnia ani nie zmienia cudzego terminu

#### Scenario: Niepoprawna wartość albo brak aktywnego zapisu
- **WHEN** mapa zawiera wartość spoza `present|absent` albo identyfikator bez aktywnego zapisu na termin
- **THEN** system zwraca `422 validation_failed` i nie zapisuje żadnej pozycji mapy

#### Scenario: Próba przed końcem spotkania
- **WHEN** uprawniony użytkownik próbuje oznaczyć obecność przed `starts_at + duration_minutes`
- **THEN** system zwraca `422 validation_failed` i nie zmienia obecności

#### Scenario: Ponowne oznaczenie
- **WHEN** uprawniony użytkownik oznacza ponownie obecność po zakończeniu terminu
- **THEN** system nadpisuje wskazane wartości i zapisuje bieżącego wykonawcę jako autora

### Requirement: Obecności historyczne zasilają warunek certyfikatu
Do licznika superwizji SHALL wchodzić każdy nieanulowany zapis wolontariusza z `attendance=present`, również gdy termin należał do poprzedniego superwizora. H12 MUST używać istniejącego wspólnego wyniku postępu i MUST nie modyfikować sposobu jego obliczania.

#### Scenario: Obecność u poprzedniego superwizora
- **WHEN** wolontariusz ma `present` na historycznym terminie poprzedniego superwizora i aktualne przypisanie do innej osoby
- **THEN** historyczna obecność nadal zwiększa `supervision_present`

#### Scenario: Nieobecność i anulowany zapis
- **WHEN** zapis ma `attendance=absent` albo ustawione `cancelled_at`
- **THEN** zapis nie zwiększa `supervision_present`

### Requirement: H12 jest właścicielem historycznego przypisania superwizora
H12 SHALL być jedynym implementującym `PUT /admin/users/{id}/supervisor`, a H18 SHALL wyłącznie konsumować tę operację. Request SHALL zawierać wymagane `supervisor_id`; użytkownik wskazany w ścieżce MUST mieć rolę `volunteer`, a wskazany superwizor MUST mieć rolę `instructor`. Sukces SHALL zwracać `200` z polami `volunteer_id`, `supervisor_id`, `assigned_at` i `unassigned_at`.

#### Scenario: Pierwsze przypisanie
- **WHEN** administrator przypisuje prowadzącego wolontariuszowi bez aktualnego przypisania
- **THEN** system tworzy rekord z `assigned_at`, `unassigned_at=null` i zwraca `200`

#### Scenario: Zmiana superwizora
- **WHEN** administrator wskazuje innego prowadzącego dla wolontariusza z aktualnym przypisaniem
- **THEN** system tym samym czasem zamyka wszystkie jego aktualne rekordy, tworzy osobny nowy rekord i zachowuje pełną historię

#### Scenario: Ponowienie tego samego przypisania
- **WHEN** wskazany prowadzący jest już aktualnym superwizorem wolontariusza
- **THEN** system zwraca `200` z bieżącym przypisaniem bez nowego rekordu i bez nowego audytu

#### Scenario: Nieprawidłowa rola
- **WHEN** użytkownik docelowy nie jest wolontariuszem albo wskazany superwizor nie jest prowadzącym
- **THEN** system zwraca `422 validation_failed` i nie zmienia przypisań

### Requirement: Przypisanie ma dokładnie jeden audyt i zero powiadomień
Pierwsze lub zmienione przypisanie SHALL wraz ze zmianą rekordów zapisać dokładnie jedno zdarzenie `supervisor.assigned` przez wspólny mechanizm audytu. H12 MUST nie emitować powiadomień, w szczególności `supervision.reminder`.

#### Scenario: Udane nowe przypisanie
- **WHEN** administracja tworzy pierwsze albo zmienia aktualne przypisanie
- **THEN** system zapisuje dokładnie jeden audyt `supervisor.assigned` i nie zapisuje powiadomienia

#### Scenario: Błąd przypisania
- **WHEN** zapis przypisania albo audytu kończy się błędem
- **THEN** system wycofuje całą operację i nie pozostawia częściowej historii

### Requirement: Interfejs uczestnika obsługuje pełny przebieg zapisów
Ekran `/panel/superwizja` SHALL prezentować po polsku terminy aktualnego superwizora, dostępność miejsc i własny zapis oraz akcje zapisu i wypisu zgodne ze stanem terminu. Ekran MUST mieć dostępne stany ładowania, pustej listy, błędu, sukcesu i trwającej operacji oraz MUST blokować wielokrotne wysłanie tej samej akcji.

#### Scenario: Uczestnik zapisuje się przez ekran
- **WHEN** wolontariusz wybiera zapis na dostępny termin
- **THEN** ekran pokazuje stan operacji, obsługuje wynik i odświeża licznik oraz własny zapis

#### Scenario: Termin zapełnia się równolegle
- **WHEN** akcja uczestnika kończy się `409 slot_full`
- **THEN** ekran pokazuje po polsku czytelny komunikat i odświeża widoczny stan terminu

#### Scenario: Brak terminów
- **WHEN** odpowiedź listy nie zawiera elementów
- **THEN** ekran pokazuje czytelny polski stan pusty zamiast pustej tabeli lub błędu

### Requirement: Ekran grupy posiada punkt integracyjny H07
Ekran `/prowadzacy/grupa` SHALL prezentować po polsku własną grupę, postępy, własne terminy, formularz terminu i oznaczanie obecności. Ekran SHALL zawierać jawnie nazwany, odseparowany punkt integracyjny dla przyszłej sekcji rzetelności H07, lecz H12 MUST nie implementować obliczeń, API ani danych H07.

#### Scenario: Prowadzący otwiera własną grupę
- **WHEN** prowadzący otwiera `/prowadzacy/grupa`
- **THEN** ekran obsługuje ładowanie, błąd, pustą grupę i dane wyłącznie własnych wolontariuszy

#### Scenario: Prowadzący tworzy termin i oznacza obecność
- **WHEN** prowadzący wykonuje dozwolone akcje na własnych terminach
- **THEN** ekran waliduje pola, blokuje podwójne wysłanie i pokazuje wynik po polsku

#### Scenario: Punkt integracyjny czeka na H07
- **WHEN** H12 renderuje ekran grupy przed wdrożeniem H07
- **THEN** struktura zawiera stabilny bezstanowy punkt integracyjny bez wymyślonych danych ani funkcji rzetelności
