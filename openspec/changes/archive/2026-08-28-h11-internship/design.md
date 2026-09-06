## Context

Zob. `proposal.md` dla motywacji i `specs/internship-journal-approvals/spec.md` dla zachowań. H11 jest samodzielnym pionowym wycinkiem: ma własne ekrany i plik tras, nie czeka strukturalnie na inny pakiet, ale jego powiadomienia są konsumowane przez H16, a zaakceptowane godziny przez wspólny agregator postępu i późniejszy H14.

Tabela `internship_entries` i model `InternshipEntry` już zawierają wszystkie potrzebne pola: dane wpisu, status, komentarz, osobę i czas decyzji oraz soft delete. Kanoniczny `DemoSeeder` ma 41,5 zaakceptowanej godziny Marty, wpis `submitted`, wpis `returned` z komentarzem oraz łącznie dwa wpisy w kolejce, a `SeedIntegrityTest` chroni te liczby. Nie jest potrzebna migracja ani zmiana współdzielonego seedera.

`ProgressAggregator`, `Settings`, `Notify` i `AuditLog` mają zamrożone sygnatury. Klient `frontend/lib/api.ts` przechowuje Bearer token w `localStorage`, więc interaktywne pobieranie i mutacje H11 muszą przebiegać w Client Components. Dokumentacja Next.js 16 potwierdza użycie możliwie wąskiej granicy `'use client'`, lokalnej obsługi oczekiwanych błędów asynchronicznych i jawnych stanów ładowania dla danych pobieranych już po hydratacji.

Kontrakt potwierdza ogólne koperty, paginację, część zachowań H11 i słowniki.
Brakujące decyzje zostały zatwierdzone dla H11, zapisane w „Zatwierdzonej macierzy
kontraktu H11” i opublikowane w `docs/hackathon/02-kontrakt-api.md`.

### Pytania do strażnika kontraktu i przyjęte odpowiedzi

Poniższa lista dokumentuje decyzje przekazane do wspólnego kontraktu. Odpowiedzi
są zamknięte dla H11 i zostały opublikowane bez zmian w `02-kontrakt-api.md`:

1. Czy potrzebna jest osobna operacja `GET /internship/entries/{id}`? **Nie.**
   Uczestnik edytuje wpis wybrany z listy, a `PATCH` po identyfikatorze jest
   owner-scoped; cudzy identyfikator daje `404 not_found`.
2. Jaki jest pełny zasób uczestnika i jakie są formaty? **Dokładnie** pola z
   listy poniżej; `date` to `YYYY-MM-DD`, `hours` to string dziesiętny, a czasy
   to `null` albo ISO 8601 UTC. Bez `user_id`, `decided_by` i obiektu użytkownika.
3. Jaki jest zasób kolejki administracyjnej? Zasób uczestnika plus wyłącznie
   `user: { id, first_name, last_name }`.
4. Jak działa kolejka i paginacja? Tylko `submitted`, sortowanie po
   `created_at` rosnąco, potem `id` rosnąco, domyślnie `per_page=25`, globalnie
   maksymalnie `100`.
5. Co zwracają akceptacja i odesłanie? Obie operacje zwracają `200` z pełnym
   zaktualizowanym zasobem administracyjnym; akceptacja nie ma ciała, odesłanie
   przyjmuje wymagany niepusty `{ comment }`.
6. Co z ponowioną decyzją i komentarzem? Każda decyzja na statusie innym niż
   `submitted` daje `403 entry_locked` bez skutków ubocznych. Ponowne złożenie
   `returned` zachowuje `review_comment`, także po późniejszej akceptacji.

## Goals / Non-Goals

**Goals:**

- Zachować jeden spójny przepływ stanów `submitted → accepted` albo `submitted → returned → submitted` z autoryzacją po stronie serwera.
- Oprzeć odpowiedzi i interfejs na jednym zasobie H11 zatwierdzonym przez strażnika kontraktu.
- Zapisać decyzję, audyt i symulowane powiadomienie atomowo oraz nie dublować zdarzeń przy żądaniach współbieżnych.
- Wykorzystać istniejące komponenty, tokeny i klienta API bez rozbudowy zamrożonych obszarów.
- Pokryć krytyczne reguły testami funkcjonalnymi i odtwarzalnym scenariuszem demo na danych kanonicznych.

**Non-Goals:**

- Nowa migracja, historia wersji wpisu, korekta wpisu zaakceptowanego lub automatyczne wykrywanie danych osobowych w opisie.
- Zmiana `ProgressAggregator`, `Settings`, `Notify`, `AuditLog`, `UserResource`, layoutów, wspólnego rejestru menu, tras innych pakietów albo kontraktu poza opublikowaną macierzą H11.
- Nowe zależności Composer/npm, biblioteka formularzy, biblioteka stanu lub biblioteka UI.
- Implementowanie `GET /internship/entries/{id}`; ta operacja nie należy do zatwierdzonego zakresu H11.
- Realna wysyłka e-maili ani budowa interfejsu H16.

## Decisions

### Zatwierdzona macierz została opublikowana w oficjalnym kontrakcie

Decyzje produktowe i techniczne są zamknięte w tej zmianie. Macierz została
opublikowana identycznie w `docs/hackathon/02-kontrakt-api.md`, a kontrola
zgodności OpenSpec z tym plikiem nie wykazała różnic. Resource'y, typy TypeScript
i testy JSON odwzorowują tę opublikowaną treść.

Alternatywa: rozpocząć implementację wyłącznie na podstawie lokalnej macierzy
OpenSpec. Została odrzucona, ponieważ repozytorium wskazuje
`docs/hackathon/02-kontrakt-api.md` jako źródło prawdy HTTP.

### Trasy są rozdzielone według roli i ograniczone do `h11.php`

`backend/routes/api/h11.php` zachowa bramkę `features.h11`. Operacje uczestnika zostaną zgrupowane pod `auth:sanctum`, `access.active` i `role:volunteer`; operacje kolejki i decyzji pod `auth:sanctum` i `role:project_manager,super_admin`. Plik zarejestruje dokładnie sześć operacji zatwierdzonych w macierzy, bez pojedynczego `GET` wpisu.

Alternatywa: jedna grupa tylko z `auth:sanctum` i autoryzacja wyłącznie w kontrolerach. Została odrzucona, ponieważ rozdzielone middleware dają czytelną pierwszą bramkę roli, a kontrolery nadal egzekwują własność i stan zasobu.

### Backend ma dwa cienkie kontrolery i jawne granice wejścia/wyjścia

Kontroler uczestnika obsłuży listę, utworzenie i edycję; kontroler administracyjny — kolejkę, akceptację i odesłanie. Osobne FormRequesty obsłużą utworzenie/edycję wpisu oraz komentarz odesłania bez dodawania niezatwierdzonego limitu długości. `InternshipEntryResource` zwróci zamknięty zestaw pól uczestnika, a wariant administracyjny dołączy wyłącznie minimalny obiekt `user`. Ta struktura oddziela walidację, serializację i przepływ stanu bez tworzenia nowej warstwy abstrakcji dla sześciu prostych operacji.

Alternatywa: jeden kontroler z metodami obu ról. Została odrzucona, ponieważ zwiększa ryzyko pomieszania scopu właściciela z globalnym dostępem administracji.

### Własność jest częścią zapytania, nie filtrem po pobraniu

Lista uczestnika zaczyna od relacji bieżącego użytkownika. Edycja wyszukuje wpis przez `user_id` właściciela i identyfikator, dzięki czemu brak oraz cudzy rekord kończą się tym samym `404 not_found`. Identyfikator użytkownika z payloadu nie jest przyjmowany. Zaakceptowany własny wpis generuje domenowe `403 entry_locked` dopiero po pomyślnym sprawdzeniu właściciela.

Alternatywa: globalne route-model binding, a potem porównanie `user_id`. Została odrzucona, ponieważ łatwiej wtedy przypadkowo rozróżnić cudzy rekord od nieistniejącego albo użyć go przed autoryzacją.

### Przejścia statusów są serializowane transakcją i blokadą rekordu

Edycja oraz decyzje pobierają rekord w transakcji z blokadą do zapisu, ponownie sprawdzają bieżący status i wykonują wyłącznie zatwierdzone przejście. Poprawienie `returned` zmienia status na `submitted` bez czyszczenia `review_comment`; późniejsza akceptacja również go nie czyści. Akceptacja/odesłanie ustawiają `decided_by` i `decided_at`, a odesłanie zapisuje komentarz. Administracyjne decyzje są dozwolone wyłącznie dla `submitted`; ponowienie lub decyzja przeciwna zwracają `403 entry_locked` przed audytem i powiadomieniem.

Akceptacja lub odesłanie, `AuditLog::record` i `Notify::send` zostaną wywołane we wspólnej zewnętrznej transakcji. `AuditLog` i `Notify` dołączają do niej przez zagnieżdżone `DB::transaction`, więc błąd którejkolwiek części wycofa decyzję i zapobiegnie częściowemu stanowi. Blokada rekordu zapobiegnie dwóm powiadomieniom/audytom przy równoległych decyzjach.

Alternatywa: aktualizacja rekordu, a następnie niezależne wywołania audytu i powiadomienia. Została odrzucona, ponieważ awaria pozostawiłaby zaakceptowany wpis bez śladu decyzji albo powiadomienia.

### Postęp korzysta z zamrożonych źródeł prawdy

`accepted_hours` zostanie pobrane z `ProgressAggregator::for($user)['hours_accepted']`, a `required_hours` z `Settings::edition('internship_hours_required')` i zserializowane jako string. Te dwa pola będą jedynym rozszerzeniem H11 w `meta.extra` paginowanej listy uczestnika. H11 nie liczy ani nie pokazuje podziału według formy, nie modyfikuje agregatora i nie utrzymuje osobnego licznika w bazie.

Alternatywa: obliczanie i przechowywanie licznika w nowej kolumnie użytkownika. Została odrzucona z powodu zamrożonych migracji oraz ryzyka rozjazdu z H13/H18/H19/H20.

### Frontend zachowuje Server Component jako wejście i ma wąską wyspę kliencką

Każda nowa trasa App Router otrzyma serwerowy `page.tsx` z polskim tytułem metadanych i osadzonym komponentem klienckim H11. Komponent kliencki użyje `apiPaged`/`api`, ponieważ token jest dostępny tylko w przeglądarce, i będzie przechowywał osobno: stan pierwszego ładowania, błąd pobrania, błędy pól, identyfikator edytowanego wpisu oraz identyfikator trwającej decyzji.

Nie polegamy na samym `loading.tsx` dla pierwszego wywołania API: konwencja Next.js obejmuje zawieszanie renderowania segmentu, natomiast obecny klient pobiera dane po hydratacji. Dlatego wymagany stan ładowania powstanie bezpośrednio w komponencie klienckim. Oczekiwane błędy żądań i event handlerów będą łapane lokalnie jako `ApiError`, zgodnie z dokumentacją Next.js 16.

Alternatywa: oznaczyć cały ekran i jego statyczne elementy jako jeden duży Client Component. Jest dopuszczalna technicznie, ale odrzucona na rzecz mniejszej granicy klienta i możliwości ustawienia metadanych bez dodatkowego pliku layoutu.

### UI składa się z istniejących prymitywów i jawnych stanów

Ekran uczestnika użyje `Card`, `ProgressBar`, `Input`, `Select`, `Button`, `Badge` i `Alert`; opis otrzyma natywne, etykietowane `textarea` ostylowane semantycznymi klasami startera. Lista użyje `Table` lub równoważnych kart H11 na mobile bez nowej biblioteki. Statusy dostaną polskie etykiety wspierane tekstem, nie samym kolorem. Opis będzie interpolowany jako tekst JSX; `dangerouslySetInnerHTML` nie będzie użyte.

Stała nota prywatności znajdzie się bezpośrednio przy polu opisu. Wpis `returned` pokaże komentarz opiekuna i akcję „Popraw i wyślij ponownie”; `accepted` pokaże brak dostępnej edycji i czytelną blokadę. Przycisk trwającej operacji użyje `loading`, będzie wyłączony i zachowa stabilny układ.

Ekran administracji pokaże kolejkę w tabeli/kartach w kolejności otrzymanej z serwera. Odesłanie użyje formularza komentarza w wierszu lub pod kartą zamiast nowego modala — repozytorium nie ma współdzielonego, dostępnego prymitywu modalnego. Po odpowiedzi `200` pełny zwrócony zasób posłuży do komunikatu sukcesu, a rozstrzygnięty rekord zostanie usunięty z lokalnej kolejki lub lista zostanie odświeżona.

### Testy koncentrują się na granicach zaufania i przejściach

Testy Feature H11 utworzą fikcyjnych użytkowników i wpisy bez danych osobowych. Obejmą poprawne tworzenie/listę/edycję, dokładne kształty obu zasobów, brak trasy pojedynczego `GET`, wszystkie reguły walidacji, listę ograniczoną do właściciela, `404` dla cudzego identyfikatora, `entry_locked`, licznik z testem `0.5`, brak podziału według formy, ustawienie wymaganych godzin, role administracyjne, stronicowanie i kolejność kolejki, komentarz wymagany przy odesłaniu, odpowiedzi obu decyzji, zachowanie komentarza po ponownym złożeniu i akceptacji oraz dokładne typy audytu i powiadomień. Testy ponowionej i przeciwnej decyzji sprawdzą `403 entry_locked` oraz brak dodatkowego audytu i powiadomienia.

Istniejący `SeedIntegrityTest` pozostaje źródłem weryfikacji danych demo. `DEMO/H11.md` opisze ręcznie stany ekranów, scenariusz Marty i kolejki administracji oraz wyniki Pint/PHPUnit/ESLint/build; nie będą dodawane zależności testowe frontendu.

## Zatwierdzona macierz kontraktu H11

- `GET /internship/entries` zwraca standardową stronicowaną listę własnych zasobów uczestnika. `meta.extra` zawiera dokładnie `accepted_hours` i `required_hours` jako stringi dziesiętne.
- `POST /internship/entries` zwraca `201`, a `PATCH /internship/entries/{id}` zwraca `200`; w obu przypadkach `data` jest pełnym zasobem uczestnika.
- Zasób uczestnika zawiera dokładnie: `id`, `date`, `hours`, `form`, `consultations_count`, `description`, `status`, `review_comment`, `decided_at`, `created_at`, `updated_at`. `date` ma format `YYYY-MM-DD`, `hours` jest stringiem dziesiętnym, pola czasu są `null` albo ISO 8601 UTC. Nie ma `user_id`, `decided_by`, danych administratora ani obiektu użytkownika.
- H11 nie rejestruje `GET /internship/entries/{id}`. Wpis wybrany do edycji pochodzi z listy, a izolację właściciela po identyfikatorze sprawdza `PATCH`.
- `GET /admin/internship/pending` zwraca `200`, standardową paginację z domyślnym `per_page=25` i globalnym limitem `100`, wyłącznie wpisy `submitted`, najstarsze według `created_at`, a przy remisie rosnąco według `id`.
- Zasób administracyjny zawiera wszystkie pola zasobu uczestnika oraz dokładnie `user: { id, first_name, last_name }`; nie ujawnia dalszych pól użytkownika ani administratora.
- `POST /admin/internship/{id}/accept` nie przyjmuje ciała i zwraca `200` z pełnym zaktualizowanym zasobem administracyjnym w `data`.
- `POST /admin/internship/{id}/return` przyjmuje `{ comment }`, gdzie `comment` jest wymaganym niepustym stringiem bez nowego limitu H11, i zwraca `200` z pełnym zaktualizowanym zasobem administracyjnym w `data`.
- Obie decyzje są dozwolone wyłącznie dla `submitted`. Decyzja ponowiona albo sprzeczna zwraca `403 entry_locked` bez zmiany, dodatkowego audytu i powiadomienia.
- Ponowne złożenie wpisu `returned` ustawia `submitted`, lecz zachowuje `review_comment`; późniejsza akceptacja również zachowuje ten komentarz.
- Postęp H11 jest wyłącznie łączny. API i UI nie udostępniają rozbicia godzin według formy.

## Risks / Trade-offs

- [Oficjalny kontrakt był skrótowy] → Macierz H11 została uzupełniona w źródle prawdy i porównana z OpenSpec przed zamknięciem implementacji.
- [Dwie osoby podejmą decyzję o tym samym wpisie] → Transakcja, blokada rekordu i ponowna kontrola statusu przed skutkami ubocznymi.
- [Ktoś spróbuje dodać rozbicie godzin po formach na podstawie jednej strony listy] → Utrzymać zatwierdzony licznik łączny i nie wyliczać rozszerzeń poza kontraktem.
- [Opis lub komentarz ujawni dane w HTML/e-mailu/audycie] → Renderować opis wyłącznie jako tekst, korzystać z escapowania w `Notify`, nie kopiować opisu ani komentarza do `AuditLog.details` i stosować dane fikcyjne w testach/demo.
- [Uczestnik zmodyfikuje wpis w chwili decyzji administratora] → Obie operacje sprawdzają status pod blokadą rekordu; wygrywa pierwsza zatwierdzona transakcja.
- [Brak pozycji menu utrudni odkrycie ekranów] → Dostarczyć zakontraktowane adresy i opisać wejście bezpośrednim URL w demo; rejestr menu pozostaje poza zakresem bez zgody sztabu.
- [Komponent kliencki pobiera dane dopiero po hydratacji] → Zapewnić stabilny, dostępny stan ładowania i nie udawać, że `loading.tsx` obsługuje to żądanie.

## Migration Plan

1. Uzupełnić `docs/hackathon/02-kontrakt-api.md` zatwierdzoną macierzą H11 i potwierdzić jej zgodność z OpenSpec.
2. Wdrożyć backend za istniejącą flagą `features.h11`, uruchomić testy Feature H11 i pełny PHPUnit/Pint.
3. Dodać oba ekrany bez zmian layoutów/menu, uruchomić ESLint i produkcyjny build Next.js oraz manualny przegląd klawiaturą.
4. Zweryfikować kanoniczne seedy i scenariusz `DEMO/H11.md` na środowisku demonstracyjnym.

Wycofanie polega na wyłączeniu istniejącej flagi H11 i cofnięciu plików pakietu. Nie ma migracji ani transformacji danych do odwrócenia; wpisy utworzone podczas pilotażu pozostają w istniejącej tabeli.
