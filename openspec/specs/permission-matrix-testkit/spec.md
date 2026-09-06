# permission-matrix-testkit Specification

## Purpose

Wspólny test-kit uprawnień do wielokrotnego użytku przez wszystkie pakiety H01–H21:
pomocnik do logowania jako dana rola, jedna tabela w kodzie opisująca oczekiwany dostęp
każdej roli do każdej trasy, oraz spójna para serwer/front dla odmowy dostępu.

## Requirements

### Requirement: Pomocnik logowania jako dana rola w testach

System SHALL udostępniać pakietom testowym pomocnika tworzącego użytkownika z podaną
rolą i uwierzytelniającego go, tak by żaden pakiet nie musiał powtarzać ręcznego tworzenia
użytkownika i logowania w każdym teście uprawnień.

#### Scenario: Pomocnik tworzy i loguje użytkownika o żądanej roli

- **WHEN** test wywołuje pomocnika logowania z rolą `project_manager`
- **THEN** kolejne żądania w tym teście są wykonywane jako uwierzytelniony użytkownik z
  rolą `project_manager`

### Requirement: Matryca uprawnień jako jedna tabela w kodzie

System SHALL definiować oczekiwany dostęp każdej roli (oraz gościa) do tras istniejących w
kodzie jako pojedynczą strukturę danych w kodzie testowym, czytaną przez sterowany danymi
test. Dopisanie nowej trasy do pokrycia MUST wymagać wyłącznie dodania nowego wiersza do
tej struktury, bez zmian w silniku testu.

#### Scenario: Uprawniona rola otrzymuje powodzenie

- **WHEN** użytkownik z rolą uprawnioną do danej trasy wykonuje żądanie z matrycy
- **THEN** odpowiedź ma status zgodny z oczekiwanym dla tej roli i trasy w tabeli

#### Scenario: Rola bez uprawnień otrzymuje odmowę

- **WHEN** użytkownik z rolą nieuprawnioną do danej trasy wykonuje żądanie z matrycy
- **THEN** odpowiedź ma status 403 z `error.code` = `forbidden`

#### Scenario: Gość otrzymuje odmowę uwierzytelnienia

- **WHEN** żądanie bez tokenu trafia na trasę wymagającą uwierzytelnienia z matrycy
- **THEN** odpowiedź ma status 401 z `error.code` = `unauthenticated`

### Requirement: Dostęp do zasobu własnego rozróżniony od cudzego

System SHALL rozróżniać w matrycy zasoby scoped-do-właściciela: test MUST utworzyć zasób
należący do wykonawcy przed wykonaniem żądania o ten zasób, tak by wynik testu odzwierciedlał
rzeczywisty dostęp do własnego zasobu, a nie przypadkowy brak zasobu o danym identyfikatorze.

#### Scenario: Właściciel ma dostęp do własnego zasobu

- **WHEN** uwierzytelniony użytkownik żąda zasobu, który sam przed chwilą utworzył
- **THEN** odpowiedź ma status powodzenia zgodny z oczekiwaniem matrycy dla tej roli

### Requirement: Cudzy zasób wskazany identyfikatorem zwraca 404, nie 403

System SHALL zwracać 404 `not_found`, nie 403, gdy uwierzytelniony użytkownik żąda
pojedynczego zasobu wskazanego identyfikatorem, który należy do innego użytkownika —
zgodnie z zasadą nieujawniania istnienia cudzego zasobu. Ta reguła MUST być udokumentowana
w kodzie testu jako rozstrzygnięcie rozbieżności między dokumentem ról a kontraktem API.

#### Scenario: Żądanie cudzego zasobu po identyfikatorze

- **WHEN** uwierzytelniony użytkownik żąda przez identyfikator zasobu należącego do innego
  użytkownika
- **THEN** odpowiedź ma status 404 z `error.code` = `not_found`, nie 403

### Requirement: Odmowa całej sekcji zwraca 403, nie 404

System SHALL zwracać 403 `forbidden`, gdy rola użytkownika nie ma dostępu do całej
trasy/sekcji niezależnie od konkretnego zasobu (np. wolontariusz na trasie administracyjnej),
odróżniając ten przypadek od odmowy dostępu do pojedynczego cudzego rekordu.

#### Scenario: Rola bez dostępu do sekcji administracyjnej

- **WHEN** użytkownik z rolą `volunteer` woła trasę dostępną wyłącznie dla ról
  administracyjnych
- **THEN** odpowiedź ma status 403 z `error.code` = `forbidden`

### Requirement: Testy zależne od nieistniejących pakietów oznaczone jawnie jako pominięte

System SHALL zawierać w matrycy testy wymagane przez specyfikację uprawnień nawet dla
scenariuszy zależnych od pakietów jeszcze niescalonych do kodu, oznaczone jako pominięte z
odwołaniem do pakietu blokującego, zamiast być nieobecne. Pominięcie takiego testu MUST NOT
powodować niepowodzenia całego zestawu testów.

#### Scenario: Test zależny od brakującego pakietu jest pominięty, nie czerwieni builda

- **WHEN** uruchamiany jest pełny zestaw testów matrycy uprawnień, a pakiet wymagany przez
  jeden ze scenariuszy §5 jeszcze nie istnieje w kodzie
- **THEN** ten scenariusz jest raportowany jako pominięty, a cały przebieg testów kończy się
  powodzeniem (exit code 0)

### Requirement: Odmowa dostępu niesie kontekst wymaganej i posiadanej roli

System SHALL dołączać do każdej odpowiedzi 403 wynikającej z braku wymaganej roli pole
`reason` zawierające listę ról uprawnionych do danej trasy oraz rolę wykonawcy żądania,
zgodnie z kopertą błędu z kontraktu API.

#### Scenario: Odmowa roli niesie wymaganą i posiadaną rolę

- **WHEN** użytkownik z rolą `volunteer` woła trasę wymagającą roli `project_manager` lub
  `super_admin`
- **THEN** odpowiedź 403 zawiera `error.reason.required_roles` = `["project_manager",
  "super_admin"]` i `error.reason.your_role` = `"volunteer"`

### Requirement: Strażnik roli w panelach administracyjnych

System SHALL uniemożliwiać wyświetlenie treści paneli administracyjnych i prowadzącego
zalogowanej roli, dla której serwer i tak odrzuciłby żądania tych sekcji, prezentując zamiast
tego czytelny ekran odmowy dostępu z rolą wymaganą i posiadaną. Ta kontrola po stronie
klienta MUST NOT być jedynym mechanizmem egzekwowania dostępu — serwer MUST nadal odrzucać
każde żądanie API spoza dozwolonej roli niezależnie od stanu interfejsu.

#### Scenario: Ręczne wejście pod chroniony adres bez uprawnień

- **WHEN** zalogowany użytkownik bez wymaganej roli otwiera ręcznie adres panelu
  administracyjnego lub panelu prowadzącego
- **THEN** ekran pokazuje czytelny komunikat „Brak dostępu" z wymaganą rolą i rolą
  użytkownika, zamiast treści panelu

#### Scenario: Uprawniona rola widzi panel normalnie

- **WHEN** zalogowany użytkownik z wymaganą rolą otwiera panel administracyjny lub panel
  prowadzącego
- **THEN** treść panelu renderuje się normalnie, bez ekranu odmowy dostępu

#### Scenario: Panel uczestnika nie jest objęty jednym wspólnym strażnikiem roli

- **WHEN** użytkownik dowolnej roli z dostępem do co najmniej jednej sekcji panelu
  uczestnika otwiera ten panel
- **THEN** panel nie blokuje wejścia na poziomie całego layoutu — dostęp do
  poszczególnych sekcji rozstrzyga się niezależnie od tego wspólnego strażnika
