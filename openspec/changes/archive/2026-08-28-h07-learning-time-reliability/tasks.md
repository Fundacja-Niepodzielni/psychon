## 1. Koordynacja i bramki przed implementacją

- [x] 1.1 Przed pierwszą zmianą kodu wykonać `git remote -v`, `git status`, `git branch --show-current` i `git fetch origin`, potwierdzić gałąź `pakiet/H07-rzetelnosc`, brak cudzych zmian w worktree, H07 = Mikołaj/`W TOKU` oraz H12 = `DONE` na `origin/main`; weryfikacja: wyniki poleceń i odczyt `git show origin/main:openspec/changes/koordynacja-pakietow-h01-h21/tasks.md` są zapisane w notatce roboczej, a w razie niezgodności implementacja zostaje zatrzymana.
- [x] 1.2 Zamknąć `GATE-H07-C1` przez synchronizację oficjalnego kontraktu z wdrożonym minimalnym kształtem: odpowiedzi wszystkich trzech endpointów, koperty i błędy, populacja i zakres edycji, paginacja/`meta`, sortowanie/remisy, filtry, format `reliability_percent` i `below_threshold`, brak wyniku/zerowy mianownik, pola lekcji, `userId`, role administracyjne, aktualna grupa i brak szczegółów prowadzącego; weryfikacja: `docs/hackathon/02-kontrakt-api.md` jednoznacznie rozstrzyga każdy punkt i nie dodaje trasy, filtra, pola ani kodu błędu ponad wdrożone H07.
- [x] 1.3 Otworzyć `GATE-H07-A1` u właściciela `ProgressAggregator`, przekazując reprodukcję rozbieżności między średnią procentów wszystkich otwartych postępów a ilorazem sum ukończonych lekcji; weryfikacja: na `origin/main` fasada zachowuje publiczną sygnaturę, a jej test z lekcjami różnej długości, rekordem nieukończonym i brakiem mierzalnych danych przechodzi dla reguły H07.
- [x] 1.4 Po zamknięciu `GATE-H07-A1` i decyzji koordynatora dla `GATE-H07-C1` zaktualizować gałąź z bieżącego `origin/main` oraz ponownie przejrzeć kontrakt, fasadę i testy bez lokalnego cofania zmian właścicieli; weryfikacja: `git merge-base --is-ancestor origin/main HEAD` zwraca sukces, a design wskazuje minimalny kształt dopuszczony przez koordynatora i zachowanie agregatora.
- [x] 1.5 Potwierdzić przed edycją frontendu, że publiczny slot nadal istnieje jako domyślny bezparametrowy eksport w `frontend/components/h12/H07ReliabilitySlot.tsx` i jest renderowany przez `InstructorGroup.tsx`; weryfikacja: statyczna kontrola obu plików potwierdza `<H07ReliabilitySlot />` bez propsów, w przeciwnym razie frontend prowadzącego otrzymuje osobną blokadę H12 i nie jest implementowany.

## 2. Testy kontraktowe i bezpieczeństwa backendu

- [x] 2.1 Dodać testy oficjalnych kopert sukcesu, pól, typów, paginacji, stabilnego sortowania, filtrów oraz reprezentacji braku danych dla wszystkich trzech operacji dokładnie według minimalnego kształtu; weryfikacja: testy odrzucają niezatwierdzone parametry i przechodzą dla wdrożonego DTO.
- [x] 2.2 Dodać macierz uwierzytelnienia i autoryzacji obejmującą `401` bez tokenu oraz `403` dla każdej niedozwolonej roli; osobno potwierdzić, że prowadzący otrzymuje `403` dla obu tras administracyjnych niezależnie od tego, czy osoba jest w jego grupie; weryfikacja: celowany test feature przechodzi i żadna odpowiedź błędu nie zawiera danych osoby.
- [x] 2.3 Dodać test `GET /admin/reliability/{userId}` dla istniejącej osoby, nieistniejącego identyfikatora i niedostępnego identyfikatora; weryfikacja: statusy, slug błędu i koperty obejmują zatwierdzone `404 not_found`.
- [x] 2.4 Dodać test izolacji dwóch prowadzących z aktualnymi oraz historycznymi `supervisor_assignments`, bez parametru grupy lub prowadzącego; weryfikacja: `GET /instructor/reliability` zawiera tylko osoby z `supervisor_id = auth()->id()` i `unassigned_at IS NULL`, a w treści nie ma identyfikatora, nazwy ani szczegółów osoby obcej.
- [x] 2.5 Dodać test spójności na lekcjach o różnych `duration_seconds`, z różnymi `active_seconds` i dodatkowym postępem nieukończonym; weryfikacja: bezpośredni `ProgressAggregator::for($user)`, lista administracyjna, szczegół administracyjny i lista prowadzącego zwracają dokładnie tę samą wartość ilorazu sum, a rekord nieukończony jej nie zmienia.
- [x] 2.6 Dodać kanoniczny test seedów przy progu 60; weryfikacja: `filip@demo.pl` ma około 15%, jest pierwszą osobą listy i ma `below_threshold = true`, natomiast `marta@demo.pl` ma około 85% i `below_threshold = false`.
- [x] 2.7 Dodać test zmiany progu przez endpoint H19 oraz przypadku wyniku równego progowi; weryfikacja: kolejne żądanie bez wdrożenia i zmiany postępu zachowuje procent, natychmiast aktualizuje flagę, a równość daje `below_threshold = false`.
- [x] 2.8 Dodać testy pustej populacji, pustej aktualnej grupy i osoby bez mierzalnych ukończonych lekcji; weryfikacja: każda odpowiedź stosuje zatwierdzoną pustą kopertę lub reprezentację braku wyniku i nie zgłasza błędu serwera.
- [x] 2.9 Dodać test braku skutków ubocznych odczytów H07; weryfikacja: po wywołaniu trzech oficjalnych operacji liczba wpisów audytu, powiadomień i wysłanych wiadomości nie zmienia się.

## 3. FormRequesty i autoryzacja

- [x] 3.1 Utworzyć osobny FormRequest dla `GET /admin/reliability`, który dopuszcza dokładne role administracyjne i waliduje wyłącznie zatwierdzone parametry listy; weryfikacja: test Requestu pokrywa dozwolone role, `403` oraz każdy zatwierdzony i odrzucony parametr.
- [x] 3.2 Utworzyć osobny FormRequest dla `GET /admin/reliability/{userId}`, bez rozszerzania dostępu prowadzącego; weryfikacja: test Requestu potwierdza role, wiązanie lub walidację `userId` i kontraktowe zachowanie błędu.
- [x] 3.3 Utworzyć osobny FormRequest dla `GET /instructor/reliability`, pobierający tożsamość wyłącznie z uwierzytelnionego użytkownika i odrzucający niezatwierdzone identyfikatory zakresu; weryfikacja: test potwierdza dostęp prowadzącego, `403` pozostałych ról i brak możliwości wskazania cudzej grupy.

## 4. Resources i serwisy zapytań H07

- [x] 4.1 Zaimplementować Resource/ResourceCollection listy administracyjnej dokładnie według minimalnego DTO i oficjalnej koperty; weryfikacja: asercje JSON potwierdzają pola, typy, `meta` i brak pól modelu spoza kontraktu.
- [x] 4.2 Zaimplementować Resource szczegółu osoby z wyłącznie zatwierdzonymi polami `lesson_progress` i `lessons`; weryfikacja: test JSON potwierdza dozwolone pola oraz brak pól niezatwierdzonych i danych wrażliwych.
- [x] 4.3 Zaimplementować Resource/ResourceCollection prowadzącego według minimalnego DTO; weryfikacja: test JSON potwierdza kopertę, pola i brak szczegółów osób spoza bieżącego zakresu.
- [x] 4.4 Zaimplementować wspólny serwis prezentacji wyniku, który wywołuje wyłącznie `ProgressAggregator::reliabilityPercent($user)` i odczytuje próg przez `Settings::edition('reliability_threshold')` przy każdym żądaniu; weryfikacja: kontrolowane dane potwierdzają zgodność z `ProgressAggregator::for()`, brak alternatywnego obliczenia, ścisłe `<` i ponowny odczyt progu.
- [x] 4.5 Zaimplementować serwis listy administracyjnej z zatwierdzoną populacją, rosnącym sortowaniem, stabilnym tie-breakerem i paginacją; weryfikacja: test feature potwierdza kolejność, remisy, granice stron i pozycję osób bez wyniku.
- [x] 4.6 Zaimplementować serwis listy prowadzącego zaczynający zapytanie od aktualnych przypisań uwierzytelnionego prowadzącego; weryfikacja: test SQL/feature z dwoma prowadzącymi i przypisaniem historycznym potwierdza izolację przed serializacją.
- [x] 4.7 Zaimplementować serwis szczegółów administracyjnych: wynik zbiorczy z agregatora, a diagnostyka tylko z ukończonych `lesson_progress` i `lessons` oraz zatwierdzonych pól; weryfikacja: test potwierdza zgodność agregatu z fasadą, właściwe lekcje poniżej progu i brak wtórnego algorytmu agregującego.
- [x] 4.8 Sprawdzić koszt zapytań dla zatwierdzonej strony bez obchodzenia fasady; weryfikacja: test utrzymuje limit siedmiu zapytań dla trzech osób demo i nie wprowadza własnego SQL liczącego rzetelność.

## 5. Kontrolery i oficjalne trasy

- [x] 5.1 Zaimplementować cienkie kontrolery listy administracyjnej, szczegółu administracyjnego i listy prowadzącego, używające dedykowanych Requestów, serwisów oraz Resources; weryfikacja: testy kontrolerów przechodzą, a kontrolery nie zawierają zapytań domenowych ani ręcznie budowanych kopert.
- [x] 5.2 Zarejestrować dokładnie trzy oficjalne operacje w `backend/routes/api/h07.php` pod wymaganym uwierzytelnieniem i bez zmiany tras innych pakietów; weryfikacja: `php artisan route:list` pokazuje wyłącznie `GET /api/v1/admin/reliability`, `GET /api/v1/admin/reliability/{userId}` i `GET /api/v1/instructor/reliability` jako nowe trasy H07.
- [x] 5.3 Zweryfikować standardowe koperty błędów dla walidacji, `401`, `403`, `404` i błędu technicznego bez ujawniania danych; weryfikacja: celowany test feature sprawdza status, slug i strukturę każdej zatwierdzonej odpowiedzi błędu.

## 6. Klient API i ekran administracyjny

- [x] 6.1 Dodać typy i funkcje klienta H07 dla listy oraz szczegółu administracyjnego, wykorzystujące istniejący `frontend/lib/api.ts` i bez modyfikowania wspólnego klienta dla lokalnego wyjątku; weryfikacja: TypeScript kompiluje DTO, a kontrola wywołań wskazuje wyłącznie oficjalne URL-e i obsługę koperty błędu.
- [x] 6.2 Utworzyć stronę `/admin/czas-nauki` z istniejących komponentów i tokenów `DESIGN.md`, zachowując kolejność zwróconą przez API; weryfikacja: na odpowiedzi seedowej Filip jest pierwszy, Marta ma około 85%, a UI nie wykonuje dodatkowego sortowania zmieniającego wynik serwera.
- [x] 6.3 Zaimplementować rozwijane szczegóły osoby korzystające z `GET /admin/reliability/{userId}` i osobnych stanów `idle/loading/success/empty/error`; weryfikacja: scenariusz przeglądarkowy potwierdza niezależne ładowanie, błąd i retry szczegółu bez przeładowania listy.
- [x] 6.4 Dodać jawne polskie stany ładowania, pustej listy, błędu listy i retry oraz bezpieczne renderowanie tekstu; weryfikacja: kontrolowane odpowiedzi loading/empty/error są czytelne, retry ponawia żądanie, a tekst jest renderowany przez bezpieczny JSX.
- [x] 6.5 Zapewnić obsługę klawiatury, fokus, `aria-expanded`, `aria-controls`, semantyczne komunikaty i układ mobilny z celami minimum 44 px; weryfikacja: przejście samą klawiaturą oraz inspekcja przy szerokości 320 px potwierdzają dostęp do wszystkich działań, logiczny fokus i brak utraty treści.

## 7. Sekcja prowadzącego w slocie H12

- [x] 7.1 Dodać klienta `GET /instructor/reliability` w domenie H07 bez parametru prowadzącego lub grupy; weryfikacja: inspekcja żądania i TypeScript potwierdzają oficjalny URL, DTO oraz brak klientowego identyfikatora zakresu.
- [x] 7.2 Zastąpić wyłącznie wnętrze `frontend/components/h12/H07ReliabilitySlot.tsx`, zachowując eksport domyślny i zero propsów, oraz samodzielnie pobierać dane prowadzącego; weryfikacja: `InstructorGroup.tsx` pozostaje bez zmian, kompilacja akceptuje istniejące `<H07ReliabilitySlot />`, a wartości odpowiadają API/agregatorowi.
- [x] 7.3 Zaimplementować w slocie niezależne polskie stany loading/empty/error/retry oraz bezpieczne renderowanie danych; weryfikacja: zasymulowany błąd H07 pozostawia tabelę, terminy i obecność H12 używalne, a pusta grupa i retry działają bez przeładowania strony.
- [x] 7.4 Zweryfikować dostępność i mobile sekcji prowadzącego; weryfikacja: nawigacja klawiaturą, fokus, semantyczny alert/status i widok 320 px spełniają `DESIGN.md`, a dane wyglądające jak HTML pozostają zwykłym tekstem.

## 8. Menu i granice własności frontendu

- [x] 8.1 Utworzyć wyłącznie per-pakietową definicję wpisu administracyjnego „Czas nauki” prowadzącą do `/admin/czas-nauki`, zgodną z istniejącym mechanizmem i bez edycji layoutu lub wspólnego indeksu; weryfikacja: plik H07 eksportuje oczekiwany typ, a `git diff` nie zawiera `frontend/lib/menu/admin/index.ts` ani layoutów.
- [x] 8.2 Zamknąć `GATE-H07-M1` w zatwierdzonej zmianie integracyjnej przez rejestrację gotowej definicji H07; weryfikacja: `frontend/lib/menu/admin/index.ts` importuje wyłącznie per-pakietowy wpis `h07-czas-nauki`, `sortMenu` zachowuje kolejność i nawigacja wskazuje `/admin/czas-nauki`, bez zmiany layoutu lub mechanizmu menu.

## 9. Integracja, regresje i dane demo

- [x] 9.1 Uruchomić wspólny scenariusz na świeżym seedzie i porównać wynik `ProgressAggregator`, JSON obu kontekstów oraz oba ekrany dla tych samych osób; weryfikacja: wartości są identyczne, kolejność rosnąca, Filip około 15%/poniżej progu, Marta około 85%/bez flagi.
- [x] 9.2 Zweryfikować zmianę progu bez deployu przez H19 i ponowić odczyt H07; weryfikacja: flagi zmieniają się przy kolejnym odczycie, procenty pozostają bez zmian, a wynik równy progowi nie ma flagi.
- [x] 9.3 Zweryfikować negatywne scenariusze w przeglądarce i API: brak tokenu, rola prowadzącego na admin API, cudza/historyczna grupa, nieistniejący `userId`, puste dane i błąd serwera; weryfikacja: każdy przypadek daje zatwierdzony status/kopertę i jawny stan UI bez wycieku danych.
- [x] 9.4 Udokumentować `DEMO/H07.md` bez prawdziwych danych osobowych, z przygotowaniem środowiska, kontami demo, trzema endpointami, Filipem/Martą, izolacją grupy, szczegółami, pustymi/błędnymi stanami i zmianą progu; weryfikacja: druga osoba może wykonać instrukcję od świeżego seeda i odtworzyć wszystkie obowiązkowe kryteria.

## 10. Jakość, własność plików i zamknięcie

- [x] 10.1 Uruchomić Pint dla backendu; weryfikacja: `docker compose exec app ./vendor/bin/pint` kończy się kodem 0 i ponowne uruchomienie nie zmienia plików.
- [x] 10.2 Uruchomić celowane testy H07 obejmujące agregator, API, role, izolację, próg, seedy i brak skutków ubocznych; weryfikacja: `docker compose exec app php artisan test --filter=Reliability` kończy się kodem 0 bez pominiętych testów H07.
- [x] 10.3 Uruchomić pełny zestaw testów backendu po scaleniu poprawki regresji H09/H17; weryfikacja: `docker compose exec app php artisan test` zakończyło się kodem 0 wynikiem 460 zaliczonych testów na aktualnym `origin/main`, a zmiana domykająca H07 nie modyfikuje backendu.
- [x] 10.4 Uruchomić kontrolę frontendu; weryfikacja: `cd frontend && npm run lint` oraz `npm run build` kończą się kodem 0 bez nowych ostrzeżeń H07.
- [x] 10.5 Wykonać ręczny przegląd dostępności klawiaturą i mobile obu ekranów zgodnie z `DESIGN.md`; weryfikacja: wyniki dla fokusu, ARIA, retry, pustych/błędnych stanów, bezpiecznego tekstu i szerokości 320 px są zapisane w `DEMO/H07.md`.
- [x] 10.6 Skontrolować własność i zakres diffu względem aktualnego `origin/main`; weryfikacja: implementacja pakietowa nie zawiera migracji, zależności, zmian `ProgressAggregator`, implementacji H06/H12/H19, plików H12 poza publicznym slotem, layoutów, tras innych pakietów ani rejestrów audytu/powiadomień, a zmiana domykająca dotyka wspólnego indeksu menu wyłącznie w celu rejestracji gotowego wpisu H07.
- [x] 10.7 Uruchomić kontrole repozytorium i OpenSpec przed przekazaniem do review; weryfikacja: `git diff --check` oraz `openspec validate h07-learning-time-reliability --strict` kończą się kodem 0, a `openspec status --change h07-learning-time-reliability` pokazuje komplet artefaktów.
- [x] 10.8 Ponownie wykonać obowiązkową checklistę `docs/hackathon/06-workflow-pakietu-i-pr.md` przed commitem, pushem i PR-em domykającym; weryfikacja: potwierdzono repozytorium Tomka, branch roboczy oparty na aktualnym `origin/main`, zielone kontrole, status H07 = `DONE` po scaleniu PR #49 oraz brak pushu do `upstream` lub `origin/main` i brak samodzielnego merge'a PR-a domykającego.
