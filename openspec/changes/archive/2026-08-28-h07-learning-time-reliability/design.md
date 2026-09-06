## Context

Zob. `proposal.md` — motywacja. H07 łączy Laravel API, dwa konteksty Next.js i trzy istniejące źródła zachowania: pomiar `active_seconds` z H06, publiczny punkt integracji H12 oraz ustawienie `reliability_threshold` z H19. Schemat i migracje są zamrożone, a H07 nie może zmieniać wspólnych fasad, implementacji H06/H12/H19 ani tras innych pakietów. Wspólny rejestr menu jest dotykany wyłącznie w zatwierdzonej zmianie integracyjnej, która rejestruje gotową definicję H07.

Stan zastany ujawnił dwie rozbieżności wymagające koordynacji:

- oficjalny kontrakt początkowo wymieniał trzy trasy H07 bez DTO ani pełnej semantyki HTTP;
- pierwotna wersja zamrożonego `ProgressAggregator` liczyła inaczej niż reguła H07. Właściciel fasady poprawił ją na `origin/main`, zachowując publiczny interfejs, a testy agregatora obejmują lekcje różnej długości, rekord nieukończony i brak danych.

Koordynator Błażej dopuścił implementację minimalnego, nieposzerzającego kontraktu kształtu H07: tylko trzy oficjalne operacje, standardowe koperty, `page`/`per_page` dla list administracyjnych, brak dodatkowych filtrów, procent jako `string|null`, flaga jako `boolean`, administracyjne szczegóły wyłącznie z zatwierdzonych istniejących pól oraz standardowe `401`, `403`, `404 not_found` i `422`. Domknięcie zmiany synchronizuje ten wdrożony kształt z oficjalnym dokumentem kontraktu.

H12 dostarczył natomiast uzgodniony punkt integracji. Jest nim domyślnie eksportowany komponent `frontend/components/h12/H07ReliabilitySlot.tsx` o interfejsie `H07ReliabilitySlot(): JSX.Element`, bez propsów. `frontend/components/h12/InstructorGroup.tsx` renderuje go na końcu strony grupy. Ta zależność nie blokuje planu.

## Goals / Non-Goals

**Goals:**

- utrzymać jedną wartość zbiorczą pochodzącą wyłącznie z `ProgressAggregator`;
- rozdzielić pobieranie populacji, autoryzację, serializację i prezentację, tak aby izolację prowadzącego dało się wykazać testami;
- udokumentować i domknąć rozstrzygnięte bramki bez lokalnego rozszerzania kontraktu;
- zachować niezależność sekcji H07 od stanu i pobierania danych H12;
- zaplanować sprawdzalną zgodność API, obu ekranów, ustawienia progu i danych demo.

**Non-Goals:**

- zmiana sygnatury lub implementacji `ProgressAggregator` przez H07;
- zmiana schematu, migracji, zapisu czasu H06 albo ustawień H19;
- dodanie trasy szczegółów prowadzącego, lokalnego DTO, filtra, zdarzenia audytowego lub powiadomienia;
- modyfikacja strony, tabeli członków, typów, pobierania lub układu H12;
- zmiana mechanizmu wspólnego menu poza jednorazową rejestracją gotowej definicji H07.

## Decisions

### 1. Bramki i decyzja koordynatora wyznaczają granice implementacji

Plan stosuje trzy nazwane bramki. `GATE-H07-A1` został zamknięty przez właściciela fasady. Dla `GATE-H07-C1` koordynator dopuścił minimalną implementację przed formalną synchronizacją dokumentu, a domknięcie H07 synchronizuje kontrakt. `GATE-H07-M1` został zamknięty przez zatwierdzoną rejestrację gotowej definicji w istniejącym wspólnym rejestrze.

| Bramka | Właściciel | Warunek zamknięcia | Blokowany zakres |
| --- | --- | --- | --- |
| `GATE-H07-C1` | strażnik kontraktu HTTP | formalna synchronizacja `docs/hackathon/02-kontrakt-api.md` z minimalnym kształtem zatwierdzonym przez koordynatora i wdrożonym przez H07 | zamknięta w zmianie domykającej; bez dodatkowej trasy, filtra lub pola |
| `GATE-H07-A1` | właściciel zamrożonej fasady startera | zachowanie `ProgressAggregator` odpowiada ilorazowi `sum(active_seconds) / sum(duration_seconds)` wyłącznie ukończonych mierzalnych lekcji, bez zmiany publicznej sygnatury; testy właściciela obejmują różne długości lekcji, postęp nieukończony i brak danych | zamknięta na `origin/main` |
| `GATE-H07-M1` | właściciel wspólnego rejestru menu | przygotowany per-pakietowy wpis H07 jest zarejestrowany we wspólnym indeksie bez zmiany mechanizmu menu | zamknięta w zmianie domykającej; `/admin/czas-nauki` jest dostępne z nawigacji |

Alternatywą byłoby przyjęcie lokalnych kształtów odpowiedzi i lokalnego algorytmu. Odrzucamy ją, ponieważ złamałaby źródło prawdy kontraktu i wymóg zgodności z fasadą.

### 2. Agregat i diagnostyka pozostają odseparowane

Serwis prezentacyjny H07 pobiera wartość zbiorczą tylko przez publiczne `ProgressAggregator::reliabilityPercent($user)`. Metoda jest częścią tej samej zamrożonej fasady i zwraca dokładnie pole `reliability_percent` dostępne przez `ProgressAggregator::for($user)`. H07 nie wykonuje własnego zapytania agregującego ani nie koryguje wyniku fasady. `below_threshold` jest wyprowadzane przez porównanie wyniku z aktualną wartością `Settings::edition('reliability_threshold')`; granica jest ścisła (`result < threshold`).

Osobny serwis zapytania szczegółowego może odczytać `lesson_progress` połączone z `lessons`, ale tylko dla ukończonych rekordów i wyłącznie do pól zatwierdzonych przez `GATE-H07-C1`, takich jak czas aktywny, czas trwania, liczba otwarć i ostatnia aktywność. Nie wolno z tych wierszy ponownie obliczać wyniku zbiorczego.

Alternatywa polegająca na własnym SQL dla listy i szczegółów tworzyłaby drugi algorytm. Implementacja wywołuje zoptymalizowaną publiczną metodę agregatora, a test kosztu na trzech osobach demo potwierdza maksymalnie siedem zapytań (pomiar: sześć), bez zmiany źródła wyniku.

### 3. Warstwy backendu odpowiadają za odrębne gwarancje

Każda z trzech operacji otrzyma dedykowany `FormRequest`, również gdy nie ma parametrów. Request odpowiada za autoryzację roli i walidację wyłącznie parametrów zatwierdzonych w kontrakcie. Kontroler ma być cienki: przyjmuje Request, wywołuje serwis zapytania i zwraca Resource lub ResourceCollection w oficjalnej kopercie.

Plan zakłada trzy punkty wejścia kontrolerów odpowiadające dokładnie trasom oficjalnym. Wszystkie definicje znajdują się wyłącznie w `backend/routes/api/h07.php`; nie powstaje trasa pomocnicza. Resources odwzorowują wyłącznie minimalny kształt dopuszczony decyzją koordynatora, a nie wygodę modeli Eloquent.

Dla administracji Request dopuszcza istniejące role administracyjne `project_manager` i `super_admin`. Dla prowadzącego serwis zawsze rozpoczyna zakres od uwierzytelnionego użytkownika i `supervisor_assignments`, gdzie `supervisor_id = auth()->id()` oraz `unassigned_at IS NULL`. Id prowadzącego ani grupy nie jest przyjmowane od klienta. Historyczne i cudze przypisania są wykluczane przed obliczeniem lub serializacją.

Alternatywa z filtrowaniem gotowej kolekcji po stronie klienta lub kontrolera została odrzucona: dane obce mogłyby zostać pobrane lub ujawnione przed filtrem.

### 4. Kolejność i próg są własnością odpowiedzi serwera

Serwer zwraca listę administracyjną rosnąco według wyniku agregatora, osoby bez wyniku umieszcza na końcu, a remisy rozstrzyga po nazwisku, imieniu i identyfikatorze. Sortowanie odbywa się przed paginacją; frontend zachowuje kolejność odpowiedzi i jej nie interpretuje ponownie. Ten wybór zapewnia identyczny porządek niezależnie od klienta i umożliwia test Filipa jako pierwszej osoby.

Próg będzie odczytywany dla każdego żądania przez `Settings::edition('reliability_threshold')`, bez cache'u H07 i bez zapisywania flagi w bazie. Zmiana dokonana przez H19 wpływa więc na kolejny odczyt, ale nie na sam wynik agregatora.

### 5. Szczegóły administracyjne korzystają z istniejącej operacji

Ekran `/admin/czas-nauki` użyje listy oraz `GET /admin/reliability/{userId}` do dostępnego rozwinięcia wiersza albo panelu szczegółów w obrębie tej strony. Wybór dokładnego komponentu nastąpi po zatwierdzeniu liczby i struktury pól, ale nie wymaga nowej trasy frontendowej ani backendowej. Każdy panel szczegółów ma osobny stan `idle/loading/success/empty/error`, a ponowienie nie przeładowuje całej listy.

Element otwierający będzie natywnym przyciskiem z `aria-expanded` i `aria-controls`; po zamknięciu fokus pozostanie na przycisku. Komunikaty asynchroniczne użyją istniejących komponentów, semantycznego statusu lub alertu, a układ na urządzeniach mobilnych zachowa działania i cele dotykowe minimum 44 px. Tekst danych będzie renderowany zwykłym JSX, bez `dangerouslySetInnerHTML`.

### 6. H12 pozostaje właścicielem ekranu, a H07 wyłącznie wnętrza slotu

Publiczny handoff H12 ma następujący kontrakt:

- lokalizacja: `frontend/components/h12/H07ReliabilitySlot.tsx`;
- eksport: `default function H07ReliabilitySlot()`;
- wejście: brak propsów i brak zależności od prywatnego stanu H12;
- osadzenie: istniejące `<H07ReliabilitySlot />` w `frontend/components/h12/InstructorGroup.tsx`.

H07 może zastąpić zawartość pliku slotu, zachowując nazwę, eksport domyślny i interfejs bez propsów. H12 zachowuje własność `frontend/app/(prowadzacy)/prowadzacy/grupa/page.tsx`, `frontend/components/h12/InstructorGroup.tsx`, `frontend/lib/h12/types.ts` oraz swojej logiki API; H07 ich nie edytuje ani nie kopiuje.

Slot jest samowystarczalnym klientem `GET /instructor/reliability`. Pokazuje własny stan ładowania, polski stan pustej aktualnej grupy oraz jawny błąd z przyciskiem ponowienia. Awaria H07 nie propaguje się do zapytania H12 i nie zasłania tabeli grupy, terminów ani obecności. Dane prowadzącego nie są przekazywane propsami; izolację gwarantuje backend na podstawie tokenu.

### 7. Frontend korzysta z per-pakietowego klienta i wpisu menu

Typy oraz funkcje klienta H07 zostaną umieszczone w domenie H07 i będą używać istniejącej infrastruktury `frontend/lib/api.ts`. Nie zmienią ogólnego klienta tylko po to, by obsłużyć lokalny przypadek. Dekodowanie błędów zachowa oficjalną kopertę i rozróżni co najmniej brak uwierzytelnienia, brak uprawnień, brak zasobu i błąd techniczny zgodnie z kontraktem.

H07 przygotowuje własny plik wpisu menu, zgodny z mechanizmem per-pakietowym. Nie zmienia layoutu ani mechanizmu rejestru. W zmianie domykającej właściciel integracji dodaje wyłącznie import gotowej definicji i jej pozycję w `frontend/lib/menu/admin/index.ts`, zamykając `GATE-H07-M1`.

### 8. Testy porównują rezultaty, nie duplikują algorytmu produkcyjnego

Test zgodności utworzy dane rozróżniające średnią procentów od ilorazu sum oraz dodatkowy rekord nieukończony. Najpierw sprawdzi oczekiwany wynik fasady, a następnie tę samą wartość w odpowiedziach H07. Testy ekranów podstawią zatwierdzone odpowiedzi API i sprawdzą render, kolejność, stany oraz dostępność sterowania; nie będą ponownie implementować wzoru w kodzie frontendu.

Kanoniczny test seedów sprawdzi dokładnie `filip@demo.pl` (około 15%, pierwszy, `below_threshold = true`) oraz `marta@demo.pl` (około 85%, `below_threshold = false`) przy progu 60. Osobny test zmieni próg przez istniejącą ścieżkę H19 lub odpowiadające jej ustawienie i ponowi odczyt, potwierdzając niezmieniony procent i natychmiast zmienioną flagę.

## Risks / Trade-offs

- [Rozjazd dokumentu kontraktu z wdrożonym H07] → domknięcie synchronizuje dokładny minimalny kształt, a testy kontraktowe zapobiegają dodaniu dalszych pól, filtrów i błędów.
- [Regresja fasady mogłaby rozjechać wszystkie widoki] → test H07 porównuje listę, szczegół i widok prowadzącego bezpośrednio z `ProgressAggregator::for()` na danych odróżniających iloraz sum od średniej procentów.
- [Wywołanie agregatora per osoba może powodować N+1] → H07 używa zoptymalizowanej publicznej metody fasady i utrzymuje testowany limit zapytań bez własnego SQL liczącego rzetelność.
- [Zmiana progu między dwoma żądaniami listy i szczegółów] → każde żądanie świadomie pokazuje aktualny próg; UI nie utrzymuje lokalnego źródła prawdy.
- [Nieokreślone umiejscowienie osób bez wyniku] → kontrakt rozstrzyga je przed implementacją sortowania, dzięki czemu backend i frontend nie przyjmą różnych założeń.
- [Awaria sekcji H07 mogłaby pogorszyć ekran H12] → slot ma własne granice stanów i retry, bez modyfikacji żądania H12.
- [Wpis menu wymaga pliku wspólnego] → zmiana integracyjna ogranicza się do importu per-pakietowej definicji i dodania jej do istniejącej listy; mechanizm menu i layout pozostają bez zmian.

## Migration Plan

1. Właściciel fasady zamyka `GATE-H07-A1`, koordynator zatwierdza minimalny zakres H07, a gałąź pakietu aktualizuje się z `origin/main` i ponownie potwierdza H12 jako `DONE` oraz własność pakietu.
2. Backend powstaje od testów izolacji i spójności agregatora, następnie Requests, Resources, serwisy, kontrolery i `backend/routes/api/h07.php`.
3. Po ustabilizowaniu API powstaje ekran administracyjny i zawartość publicznego slotu H12; zmiana domykająca synchronizuje kontrakt i rejestruje wpis menu, zamykając `GATE-H07-C1` oraz `GATE-H07-M1`.
4. Dane demo, testy celowane, pełny backend, lint, build, kontrola własności plików i `DEMO/H07.md` stanowią bramkę do `REVIEW`.
5. Wdrożenie nie wymaga migracji ani backfillu. Wycofanie polega na usunięciu tras i powierzchni H07 oraz per-pakietowego wpisu menu; nie cofa danych H06, H12 ani ustawień H19.
