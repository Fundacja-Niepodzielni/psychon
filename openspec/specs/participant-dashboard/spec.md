# participant-dashboard Specification

## Purpose
Pulpit uczestnika (`/panel/pulpit`) daje wolontariuszowi i studentowi jeden spokojny widok:
gdzie jest w ścieżce rozwoju, jaki jest następny krok i jak wygląda postęp na czterech
filarach programu. Pulpit wyłącznie czyta dane z endpointów już scalonych i nigdy nie
prowadzi do funkcji, których nie ma.

## Requirements

### Requirement: Dostęp do pulpitu i pozycja w menu

Pulpit SHALL być dostępny dla zalogowanych ról uczestniczących pod trasą
`/panel/pulpit`. W menu panelu uczestnika pozycja „Pulpit" MUST znajdować się bezpośrednio
po pozycji „Start" (onboarding H21) i przed „Kursy". Wejście na `/panel` bez dalszej
ścieżki SHALL nadal przekierowywać na `/panel/start` (bez zmiany).

#### Scenario: Pozycja menu widoczna po Starcie

- **WHEN** zalogowany uczestnik otwiera dowolny ekran panelu
- **THEN** w bocznym menu widzi „Start", a bezpośrednio pod nim „Pulpit"
- **AND** kliknięcie „Pulpit" otwiera `/panel/pulpit` z zaznaczoną pozycją menu

#### Scenario: Bezpośrednie wejście na trasę

- **WHEN** uczestnik wchodzi na `/panel/pulpit`
- **THEN** widzi pulpit z sekcjami: powitanie, Mapa rozwoju, Kolejny krok, skróty postępu

### Requirement: Sekcja powitania

Pulpit SHALL wyświetlać nagłówek powitania złożony z etykiety nadrzędnej (eyebrow),
zwrotu „Dzień dobry, {first_name}" oraz jednego spokojnego, nienaciskającego zdania
wprowadzającego. Imię MUST pochodzić z `GET /me`. Gdy `first_name` jest puste, powitanie
SHALL użyć neutralnej formy bez imienia.

#### Scenario: Powitanie z imieniem

- **WHEN** `GET /me` zwraca `first_name` = „Marta"
- **THEN** nagłówek pokazuje „Dzień dobry, Marta" i zdanie wprowadzające w tonie spokojnym

#### Scenario: Brak imienia

- **WHEN** `GET /me` zwraca puste `first_name`
- **THEN** nagłówek pokazuje powitanie bez imienia i nie wyświetla pustego przecinka ani „,"

### Requirement: Mapa rozwoju — oś etapów

Pulpit SHALL wyświetlać pionową oś etapów ścieżki na podstawie `GET /courses`, w kolejności
rosnącej `sequence_order`, pomijając pozycje `sequence_order = null` (webinary, zaproszenia).
Każdy węzeł MUST pokazywać: ikonę statusu (ukończony / bieżący / zablokowany), etykietę
etapu, tytuł, odznakę statusu oraz pasek postępu `progress_percent` z rolą `progressbar`
i wartościami ARIA. Status MUST być komunikowany ikoną i tekstem, nie samym kolorem.

Węzeł etapu `completed` lub `in_progress` SHALL linkować do `/panel/kursy/{slug}`. Węzeł
`locked` MUST NOT być linkiem — zamiast tego pokazuje spokojną notkę „Ukończ poprzedni
etap, aby odblokować".

#### Scenario: Etap odblokowany prowadzi do kursu

- **WHEN** etap ma status `in_progress` i `progress_percent` = 40
- **THEN** węzeł pokazuje ikonę „w toku", odznakę „W toku", pasek postępu 40%
- **AND** udostępnia link „Otwórz etap" do `/panel/kursy/{slug}`

#### Scenario: Etap zablokowany nie jest linkiem

- **WHEN** etap ma status `locked`
- **THEN** węzeł pokazuje ikonę kłódki i tekst „Ukończ poprzedni etap, aby odblokować"
- **AND** nie zawiera żadnego odnośnika

#### Scenario: Brak etapów

- **WHEN** `GET /courses` nie zwraca żadnego kursu ze ścieżki
- **THEN** Mapa rozwoju pokazuje spokojny pusty stan: „Twoja ścieżka pojawi się tutaj, gdy
  opiekun udostępni pierwszy etap"

### Requirement: Węzeł odliczania do superwizji

Ostatnim węzłem Mapy rozwoju SHALL być odliczanie do najbliższej superwizji na podstawie
`GET /supervision/slots`. Węzeł MUST wybrać najwcześniejszy termin z `starts_at` w
przyszłości i pokazać czytelny czas do niego (np. „za 3 dni") oraz datę. Węzeł SHALL
linkować do `/panel/superwizja`.

Gdy `GET /supervision/slots` zwraca pustą listę (brak przypisanego superwizora albo brak
zaplanowanych terminów) lub żaden termin nie jest w przyszłości, węzeł MUST pokazać spokojny
pusty stan „Termin pierwszej superwizji pojawi się tutaj, gdy opiekun go zaplanuje" i
SHALL nadal linkować do `/panel/superwizja`.

#### Scenario: Najbliższy termin w przyszłości

- **WHEN** `GET /supervision/slots` zwraca termin `starts_at` za 3 dni oraz termin przeszły
- **THEN** węzeł pokazuje „za 3 dni", datę terminu i link „Zobacz superwizje"

#### Scenario: Brak terminów lub brak superwizora

- **WHEN** `GET /supervision/slots` zwraca pustą listę
- **THEN** węzeł pokazuje pusty stan o planowaniu terminu i link do `/panel/superwizja`

### Requirement: Karta „Kolejny krok"

Pulpit SHALL wyświetlać wyróżnioną (akcent fioletowy) kartę „Kolejny krok", która wskazuje
jedną najbliższą akcję nauki. Rozstrzygnięcie MUST przebiegać w kolejności:

1. Jeśli istnieje etap `in_progress`, pobierz `GET /courses/{slug}` tego etapu i wskaż
   pierwszą lekcję z `is_completed = false` — karta pokazuje jej tytuł i przycisk
   „Kontynuuj naukę" do `/panel/lekcje/{id}`.
2. Jeśli etap `in_progress` ma wszystkie lekcje ukończone, karta SHALL kierować do testu
   sprawdzającego etapu: `/panel/kursy/{slug}/test`.
3. Jeśli wszystkie etapy ścieżki mają status `completed`, karta SHALL pokazać komunikat
   „Masz wszystkie etapy za sobą" i link do `/panel/certyfikat`.
4. Jeśli nie ma etapu `in_progress` ani ukończonej ścieżki (np. pierwszy etap jeszcze
   nieudostępniony), karta SHALL pokazać spokojny pusty stan bez przycisku akcji.

Każdy link karty MUST prowadzić do trasy istniejącej w aplikacji.

#### Scenario: Następna nieukończona lekcja

- **WHEN** etap `in_progress` ma pierwszą lekcję z `is_completed = false` o id 21
- **THEN** karta pokazuje tytuł lekcji 21 i przycisk „Kontynuuj naukę" do `/panel/lekcje/21`

#### Scenario: Lekcje ukończone, test przed nami

- **WHEN** wszystkie lekcje etapu `in_progress` mają `is_completed = true`
- **THEN** karta kieruje do `/panel/kursy/{slug}/test`

#### Scenario: Cała ścieżka ukończona

- **WHEN** każdy etap ścieżki ma status `completed`
- **THEN** karta pokazuje „Masz wszystkie etapy za sobą" i link do `/panel/certyfikat`

### Requirement: Skróty postępu — siatka czterech kafli

Pulpit SHALL wyświetlać siatkę czterech kafli postępu:

- **Ukończone etapy** — liczba etapów `completed` względem liczby etapów ścieżki
  (`GET /courses`).
- **Bieżący etap** — `progress_percent` etapu `in_progress` z jego tytułem jako podpisem
  (`GET /courses`); gdy nie ma etapu `in_progress`, kafel pokazuje „—".
- **Godziny stażu** — `done` / `required` warunku `internship` z `GET /certificate/conditions`.
- **Obecności na superwizjach** — `done` / `required` warunku `supervision` z
  `GET /certificate/conditions`.

Wartości liczbowe warunku certyfikatu MUST być pokazane jako stringi dziesiętne bez
przeliczeń. Pod siatką SHALL znajdować się link „Zobacz warunki certyfikatu" do
`/panel/certyfikat`.

#### Scenario: Komplet danych dla wolontariusza

- **WHEN** `GET /courses` daje 2 z 10 etapów `completed` i etap `in_progress` na 40%
- **AND** `GET /certificate/conditions` daje `internship` 41.5/72 oraz `supervision` 5/6
- **THEN** kafle pokazują „2 / 10", „40%", „41.5 / 72" i „5 / 6"

#### Scenario: Rola bez dostępu do warunków certyfikatu

- **WHEN** `GET /certificate/conditions` zwraca 403 (rola inna niż `volunteer`)
- **THEN** pulpit pokazuje tylko kafle „Ukończone etapy" i „Bieżący etap"
- **AND** w miejscu pozostałych kafli wyświetla notkę, że dane stażu i superwizji pojawią
  się dla roli wolontariusza
- **AND** nie pokazuje błędu ani pustych kafli

### Requirement: Brak martwych linków do funkcji niezaimplementowanych

Pulpit MUST NOT zawierać sekcji ani odnośników zależnych od pakietów niescalonych do
`origin/main`. W szczególności pulpit SHALL NOT pokazywać kafla „aktywny czas nauki" /
pokrycia materiału (H07), rozwijanego „Co było w module" z treści CMS (H08), wizytówek ani
linków do profili prowadzących (H09) oraz odnośników do pytań do prowadzącego (H17).
Każdy odnośnik obecny na pulpicie MUST prowadzić do trasy istniejącej w aplikacji.

#### Scenario: Audyt odnośników

- **WHEN** pulpit jest w pełni wyrenderowany z danymi demo
- **THEN** każdy widoczny odnośnik prowadzi do jednej z tras: `/panel/kursy`,
  `/panel/kursy/{slug}`, `/panel/kursy/{slug}/test`, `/panel/lekcje/{id}`,
  `/panel/superwizja`, `/panel/certyfikat`
- **AND** nie istnieje odnośnik do funkcji H07, H08, H09 ani H17

### Requirement: Stany ładowania, błędu i częściowej awarii

Pulpit SHALL pokazywać spokojny stan ładowania do czasu uzyskania danych `GET /me` i
`GET /courses`. Gdy któreś z zapytań pomocniczych (`GET /supervision/slots`,
`GET /courses/{slug}`, `GET /certificate/conditions`) zawiedzie, pulpit MUST wyrenderować
pozostałe sekcje, a w miejscu sekcji dotkniętej awarią pokazać rzeczowy komunikat zamiast
całkowitego błędu strony. Gdy zawiedzie `GET /me` lub `GET /courses`, pulpit SHALL pokazać
komunikat błędu z możliwością ponowienia. Teksty MUST być po polsku, w tonie spokojnym i
nienaciskającym.

#### Scenario: Awaria zapytania pomocniczego

- **WHEN** `GET /supervision/slots` zwraca błąd, a pozostałe zapytania działają
- **THEN** Mapa rozwoju, Kolejny krok i kafle są widoczne
- **AND** węzeł superwizji pokazuje „Nie udało się wczytać terminów superwizji"

#### Scenario: Awaria danych podstawowych

- **WHEN** `GET /courses` zwraca błąd
- **THEN** pulpit pokazuje komunikat „Nie udało się wczytać pulpitu" i przycisk „Spróbuj ponownie"
