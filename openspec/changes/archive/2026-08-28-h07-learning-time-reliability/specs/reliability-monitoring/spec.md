## Purpose

Zdolność pozwala administracji i prowadzącym wykrywać nierzetelne ukończenia nauki na podstawie jednego wspólnego wyniku, z dynamicznym progiem i ścisłą izolacją aktualnej grupy prowadzącego.

## ADDED Requirements

### Requirement: H07 nie rozszerza publicznego kontraktu

System SHALL udostępniać wyłącznie `GET /admin/reliability`, `GET /admin/reliability/{userId}` i `GET /instructor/reliability`. Oficjalny kontrakt SHALL definiować wdrożony minimalny kształt: standardowe koperty, `page`/`per_page` listy administracyjnej, brak dodatkowych filtrów, `reliability_percent` jako `string|null`, `below_threshold` jako `boolean`, zatwierdzone istniejące pola szczegółów oraz standardowe kody `401`, `403`, `404 not_found` i `422`. H07 MUST NOT publikować dodatkowego DTO, filtra, kodu błędu ani trasy.

#### Scenario: Formalny kontrakt odpowiada wdrożonemu API

- **WHEN** klient korzysta z jednej z trzech operacji H07
- **THEN** odpowiedź, parametry i błędy odpowiadają pełnemu kształtowi opisanemu w oficjalnym kontrakcie

#### Scenario: Potrzeba szczegółów prowadzącego

- **WHEN** rozważany jest odczyt szczegółów osoby przez prowadzącego
- **THEN** system nie dodaje czwartej trasy ani parametru identyfikatora bez uprzedniej aktualizacji oficjalnego kontraktu

### Requirement: Jedno źródło wartości rzetelności

Wartość zbiorcza rzetelności użytkownika SHALL być identyczna z wynikiem zamrożonego wspólnego agregatora postępu i SHALL odpowiadać ilorazowi sumy `active_seconds` oraz sumy `duration_seconds` ukończonych, mierzalnych lekcji. H07 MUST NOT implementować alternatywnego algorytmu ani zmieniać publicznej sygnatury agregatora. Implementacja SHALL używać publicznej metody agregatora, której wynik odpowiada polu `reliability_percent` zwracanemu przez `ProgressAggregator::for()`.

#### Scenario: Zgodność dla lekcji o różnych długościach

- **WHEN** użytkownik ma ukończone mierzalne lekcje o różnych czasach trwania i różnym `active_seconds`
- **THEN** API H07, oba ekrany i bezpośredni wynik wspólnego agregatora pokazują tę samą wartość wynikającą z ilorazu sum

#### Scenario: Nieukończona lekcja nie zmienia wyniku

- **WHEN** użytkownik ma dodatkowy postęp dla lekcji bez oznaczenia ukończenia
- **THEN** ten rekord nie zmienia zbiorczej wartości rzetelności

#### Scenario: Brak mierzalnych ukończonych lekcji

- **WHEN** użytkownik nie ma ukończonych lekcji z dodatnim czasem trwania
- **THEN** API i interfejs stosują dokładnie reprezentację braku wyniku zatwierdzoną w oficjalnym kontrakcie

### Requirement: Administracja widzi listę od najniższej rzetelności

Role administracyjne zatwierdzone w oficjalnym kontrakcie SHALL otrzymywać przez `GET /admin/reliability` listę osób uporządkowaną rosnąco według wspólnej wartości rzetelności, ze stabilnym rozstrzyganiem remisów określonym w kontrakcie. Lista SHALL korzystać z bieżącego progu edycji do flagowania wyniku poniżej progu.

#### Scenario: Filip i Marta na danych demo

- **WHEN** uprawniona administracja pobiera listę na kanonicznym seedzie przy progu 60
- **THEN** `filip@demo.pl` ma około 15%, znajduje się przed `marta@demo.pl` i jest oznaczony jako poniżej progu, a `marta@demo.pl` ma około 85% i nie jest oznaczona

#### Scenario: Prowadzący próbuje otworzyć listę administracyjną

- **WHEN** użytkownik z rolą `instructor` wywołuje `GET /admin/reliability`
- **THEN** system odpowiada `403 forbidden`

#### Scenario: Brak uwierzytelnienia listy administracyjnej

- **WHEN** klient bez ważnego tokenu wywołuje `GET /admin/reliability`
- **THEN** system odpowiada `401 unauthenticated`

#### Scenario: Brak osób do pokazania

- **WHEN** zatwierdzony zakres listy administracyjnej nie zawiera żadnej osoby
- **THEN** system zwraca poprawną pustą listę w zatwierdzonej kopercie, a ekran pokazuje polski stan pusty

### Requirement: Administracja odczytuje zatwierdzone szczegóły osoby

Role administracyjne zatwierdzone w kontrakcie SHALL móc wywołać `GET /admin/reliability/{userId}`. Odpowiedź SHALL zawierać wyłącznie zatwierdzone przez kontrakt dane osoby i diagnostyczne szczegóły ukończonych lekcji, które można wyprowadzić z istniejących `lesson_progress` i `lessons`; szczegóły MUST NOT być używane do ponownego liczenia wartości zbiorczej.

#### Scenario: Szczegóły wskazują lekcje poniżej progu

- **WHEN** administracja otwiera szczegóły osoby mającej ukończone lekcje poniżej bieżącego progu
- **THEN** odpowiedź i ekran wskazują te lekcje oraz wyłącznie zatwierdzone pola diagnostyczne, a wartość zbiorcza nadal pochodzi ze wspólnego agregatora

#### Scenario: Nieistniejący identyfikator

- **WHEN** administracja wskazuje nieistniejący `userId`
- **THEN** system odpowiada `404 not_found` w standardowej kopercie błędu

#### Scenario: Rola bez dostępu do szczegółów administracyjnych

- **WHEN** prowadzący wywołuje `GET /admin/reliability/{userId}` dla osoby ze swojej lub cudzej grupy
- **THEN** system odpowiada `403 forbidden` i nie ujawnia szczegółów administracyjnych

### Requirement: Prowadzący widzi wyłącznie aktualną grupę

`GET /instructor/reliability` SHALL być dostępne wyłącznie prowadzącemu i SHALL wyznaczać osoby z relacji `supervisor_assignments`, w których `supervisor_id` odpowiada uwierzytelnionemu prowadzącemu, a `unassigned_at` jest puste. Tożsamość prowadzącego MUST pochodzić z tokenu, nigdy z parametru klienta. Endpoint MUST nie ujawniać osób z grup innych prowadzących ani historycznych przypisań.

#### Scenario: Izolacja dwóch grup

- **WHEN** dwóch prowadzących ma różne aktualne przypisania i pierwszy pobiera `GET /instructor/reliability`
- **THEN** odpowiedź zawiera wyłącznie aktualnych członków pierwszej grupy i nie zawiera osoby przypisanej do drugiego prowadzącego

#### Scenario: Historyczne przypisanie nie nadaje dostępu

- **WHEN** przypisanie osoby do prowadzącego ma ustawione `unassigned_at`
- **THEN** osoba nie pojawia się w odpowiedzi tego prowadzącego

#### Scenario: Pusta aktualna grupa

- **WHEN** prowadzący nie ma aktualnie przypisanych osób
- **THEN** system zwraca poprawną pustą odpowiedź, a sekcja na ekranie grupy pokazuje polski stan pusty

#### Scenario: Rola spoza panelu prowadzącego

- **WHEN** wolontariusz albo student wywołuje `GET /instructor/reliability`
- **THEN** system odpowiada `403 forbidden`

### Requirement: Próg rzetelności działa dynamicznie

Flaga wyniku poniżej progu SHALL być wyliczana przy każdym żądaniu z aktualnej wartości `reliability_threshold` aktywnej edycji. Zmiana progu przez ustawienia edycji MUST wpływać na następny odczyt bez wdrożenia, cache'u ani zmiany zapisanych postępów.

#### Scenario: Zmiana progu zmienia flagę

- **WHEN** administracja zmienia `reliability_threshold` tak, że niezmieniona wartość osoby przechodzi na drugą stronę progu, a następnie ponawia odczyt H07
- **THEN** flaga tej osoby zmienia się natychmiast, a wartość rzetelności pozostaje identyczna

#### Scenario: Wynik równy progowi

- **WHEN** wartość rzetelności jest równa bieżącemu progowi
- **THEN** wynik nie jest oznaczony jako poniżej progu

### Requirement: Ekran administracyjny obsługuje pełny cykl stanów

Ekran `/admin/czas-nauki` SHALL używać polskich treści i istniejącego systemu wizualnego, prezentować listę w kolejności API oraz umożliwiać dostępne rozwinięcie albo widok szczegółów osoby. Interfejs MUST jawnie obsługiwać ładowanie, pustą listę, błąd listy, ładowanie szczegółów, błąd szczegółów i ponowienie żądania.

#### Scenario: Ładowanie i błąd listy

- **WHEN** pierwsze żądanie listy jest w toku albo kończy się błędem
- **THEN** ekran pokazuje stabilny polski stan ładowania albo jawny dostępny komunikat błędu z akcją ponowienia

#### Scenario: Rozwinięcie szczegółów klawiaturą

- **WHEN** użytkownik klawiatury otwiera i zamyka szczegóły osoby
- **THEN** kontrolka ma poprawne `aria-expanded` i `aria-controls`, fokus pozostaje logiczny, a treść jest osiągalna bez myszy

#### Scenario: Widok mobilny

- **WHEN** ekran jest używany na wąskim widoku
- **THEN** lista i szczegóły pozostają czytelne bez utraty działań, z celami dotykowymi co najmniej 44 px

### Requirement: Sekcja prowadzącego wypełnia publiczny slot H12

H07 SHALL wypełnić bezstanowy komponent-slot H12 na `/prowadzacy/grupa`, zachowując jego publiczny interfejs bez parametrów. Sekcja SHALL samodzielnie pobierać `GET /instructor/reliability` i MUST nie zmieniać głównej strony, tabeli członków, typów ani logiki pobierania H12. Błąd H07 MUST nie usuwać ani nie blokować pozostałych funkcji ekranu H12.

#### Scenario: Niezależne ładowanie sekcji

- **WHEN** ekran H12 jest już dostępny, a żądanie H07 nadal trwa
- **THEN** sekcja pokazuje własny polski stan ładowania bez blokowania tabeli grupy, terminów i obecności

#### Scenario: Błąd H07 przy działającym H12

- **WHEN** `GET /instructor/reliability` kończy się błędem, a dane H12 zostały pobrane poprawnie
- **THEN** slot pokazuje jawny dostępny błąd i akcję ponowienia, a reszta ekranu H12 pozostaje używalna

#### Scenario: Bezpieczne wyświetlenie nazw

- **WHEN** zatwierdzone pole tekstowe zawiera znaki wyglądające jak HTML
- **THEN** oba interfejsy prezentują je jako bezpieczny tekst i nie wykonują go jako kodu

### Requirement: H07 nie emituje audytu ani powiadomień

Odczyty list, szczegółów i sekcji prowadzącego SHALL nie tworzyć zdarzeń audytowych ani powiadomień. H07 MUST nie dodawać nowych slugów ani typów do rejestrów kontraktu.

#### Scenario: Odczyty nie zostawiają zdarzeń

- **WHEN** administracja i prowadzący wykonują wszystkie trzy operacje H07
- **THEN** liczba wpisów audytu, powiadomień i wiadomości e-mail nie zmienia się
