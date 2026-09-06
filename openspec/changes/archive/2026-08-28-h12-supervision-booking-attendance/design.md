## Context

Zob. `proposal.md` dla motywacji i `specs/supervision-booking-attendance/spec.md` dla zachowań. H12 obejmuje dwa ekrany, siedem operacji HTTP, reguły właścicielskie, transakcje współbieżne oraz integracje z postępem i audytem.

Oficjalny kontrakt H12 podaje trasy, sukces zapisu, błędy `slot_full` i `not_your_supervisor`, kształt wejścia obecności oraz operację przypisania, ale nie będzie już rozszerzany. Zamrożony schemat ma wszystkie potrzebne dane: `supervisor_assignments` przechowuje historię, `supervision_slots` przechowuje parametry terminu, a `supervision_signups` przechowuje zapis, anulowanie i obecność z unikalnością `(slot_id, user_id)`. Dlatego brakujące szczegóły zostają rozstrzygnięte w profilu implementacyjnym H12 na podstawie tych kolumn, ogólnych kopert API i tabeli kodów błędów, bez edycji kontraktu.

`ProgressAggregator::for()` już liczy nieanulowane zapisy z `attendance=present` bez filtrowania po aktualnym superwizorze. Obecności historyczne pozostają więc poprawne bez migracji i bez zmiany agregatora.

Frontend przechowuje Bearer token w `localStorage`. Nowe strony App Router pozostaną serwerowymi wejściami z metadanymi, a pobieranie i mutacje będą wykonywane w wąskich Client Components zgodnie z dokumentacją Next.js 16.

## Goals / Non-Goals

**Goals:**

- Utrzymać role, aktywny dostęp, własność i stan domenowy jako bramki backendu.
- Zapewnić atomowy limit miejsc i rzeczywisty test współbieżności na PostgreSQL.
- Wykorzystać wyłącznie istniejące tabele, słowniki, koperty i mechanizmy wspólne.
- Udostępnić frontendowi minimalne, jednoznaczne DTO potrzebne do obu ekranów.
- Zachować historię przypisań i obecności oraz jeden audyt przypisania.
- Zapewnić stabilny, bezstanowy punkt integracyjny dla H07.

**Non-Goals:**

- Zmiana `docs/hackathon/02-kontrakt-api.md`, nowa trasa, kod domenowy, zdarzenie lub typ powiadomienia.
- Nowa migracja, indeks, tabela, zależność Composer/npm albo biblioteka UI.
- Zmiana `ProgressAggregator`, `AuditLog`, `Notify`, `UserResource`, layoutów, menu, fasad lub plików tras innych niż `backend/routes/api/h12.php`.
- Implementacja H07, H18, `supervision.reminder` albo przypomnień.
- Modyfikowanie zmian OpenSpec H06, H11 lub koordynacyjnej H01–H21.

## Decisions

### Zamknięty kontrakt uzupełnia lokalny profil H12 oparty na schemacie

Profil implementacyjny nie dodaje publicznych operacji ani nowych nazw domenowych. Ustala tylko brakujące kształty dla tras już wymienionych w kontrakcie:

- zasób terminu uczestnika: pola terminu z bazy, liczniki aktywnych zapisów oraz zagnieżdżony własny aktywny zapis;
- zasób terminu prowadzącego: pola terminu, liczniki oraz aktywne zapisy z minimalnymi danymi osoby;
- grupa: obiekt `members` i `slots`, gdzie postęp ma ten sam pięciopolowy kształt co karta H18;
- przypisanie: identyfikatory wolontariusza i superwizora oraz czasy istniejącego rekordu.

Pola wyliczone `active_signups_count`, `available_seats` i `is_full` są deterministycznymi pochodnymi `seats_limit` i rekordów bez `cancelled_at`. Nie są nowym stanem ani nie wymagają migracji. Wszystkie czasy są ISO 8601 UTC, odpowiedzi mają standardową kopertę, a lista uczestnika standardową paginację 25/100.

Alternatywa: zwracać wszystkie kolumny modeli. Odrzucona, ponieważ ujawniałaby identyfikatory właścicieli, autora obecności i techniczne timestamps, których ekrany nie potrzebują.

### Ogólna tabela kontraktu rozstrzyga brakujące błędy

H12 użyje wyłącznie kodów już istniejących:

| Przypadek | Wynik |
|---|---|
| brak tokenu | `401 unauthenticated` |
| niedozwolona rola | `403 forbidden` |
| wygasły dostęp wolontariusza | `403 access_expired` |
| zapis do cudzej grupy | `403 not_your_supervisor` |
| pojedynczy nieistniejący lub cudzy zasób | `404 not_found` |
| brak miejsca | `409 slot_full` |
| błędne pole, niedozwolony zakres lub niewłaściwy moment operacji | `422 validation_failed` |

Nie powstanie nowy kod dla wypisu po starcie, zapisu po starcie, obecności przed końcem ani błędnej roli celu przypisania.

Alternatywa: użyć `403 forbidden` dla każdego stanu domenowego. Odrzucona, ponieważ ogólna tabela rozróżnia rolę od niespełnionych warunków operacji i udostępnia `422 validation_failed`.

### Wszystkie trasy mają dedykowane FormRequesty i warstwową autoryzację

`backend/routes/api/h12.php` zachowa istniejącą bramkę `features.h12`. Stosy middleware:

- uczestnik: `auth:sanctum`, `access.active`, `role:volunteer`;
- prowadzący: `auth:sanctum`, `role:instructor`;
- obecność: `auth:sanctum`, `role:instructor,project_manager,super_admin`;
- przypisanie: `auth:sanctum`, `role:project_manager,super_admin`.

Każda akcja, w tym GET i DELETE bez ciała, otrzyma dedykowany FormRequest. Request ograniczy pola i wykona pierwszą autoryzację, a zapytanie lub serwis ponownie sprawdzi własność konkretnego rekordu. `user_id` i `supervisor_id` właściciela terminu nie są zaufanym wejściem.

Alternatywa: route-model binding bez zakresu właścicielskiego. Odrzucona ze względu na ryzyko IDOR i ujawnienia cudzego zasobu.

### Parametry terminu wynikają z typów i wartości domyślnych bazy

Tworzenie terminu przyjmuje:

- wymagane `starts_at` jako przyszły czas ISO 8601;
- opcjonalne `duration_minutes` jako integer 1–65535, domyślnie 90;
- opcjonalne `seats_limit` jako integer 1–255, domyślnie 3;
- opcjonalne `location_or_link` jako `null` lub string do 255 znaków.

Zakresy liczb odpowiadają `unsignedSmallInteger` i `unsignedTinyInteger`, a długość lokalizacji domyślnemu `string`. Właściciel zawsze pochodzi z tokenu.

Alternatywa: wprowadzić arbitralne biznesowe limity, np. 30–180 minut. Odrzucona, ponieważ nie istnieją w kontrakcie ani schemacie.

### Zapis serializuje zmianę superwizora i konkurujące rezerwacje

Serwis zapisu rozpocznie transakcję i w stałej kolejności:

1. zablokuje rekord wolontariusza;
2. pobierze i zablokuje jego aktualne przypisanie;
3. zablokuje termin;
4. ponownie sprawdzi zgodność superwizora i czas rozpoczęcia;
5. pobierze istniejący zapis uczestnika;
6. dla nowego lub anulowanego zapisu policzy aktywne rekordy i sprawdzi limit;
7. utworzy albo reaktywuje rekord.

Blokada terminu serializuje wszystkie konkurujące zapisy. Aktywny duplikat jest sprawdzany przed limitem i zwraca idempotentne `201` bez mutacji. Reaktywacja wykorzystuje ten sam rekord wymagany przez unikalność, ustawia nowy `signed_up_at` i czyści anulowanie oraz wcześniejszą obecność.

Alternatywa: liczyć miejsca przed transakcją albo polegać na unikalności. Odrzucona, ponieważ unikalność nie ogranicza liczby różnych uczestników.

### Test limitu używa niezależnych połączeń PostgreSQL

Test 10→3 uruchomi dziesięć operacji z niezależnymi połączeniami i wspólną barierą startową. Po zakończeniu sprawdzi 3×201, 7×409 `slot_full` oraz dokładnie trzy aktywne rekordy. Nie może używać sekwencyjnej pętli ani jednej transakcji `RefreshDatabase`.

Alternatywa: dziesięć kolejnych requestów. Odrzucona, ponieważ taki test nie bada wyścigu.

### Wypis i obecność zachowują rekord zapisu

Wypis blokuje termin i własny aktywny zapis, ponownie sprawdza `now() < starts_at` i ustawia wyłącznie `cancelled_at`. Brak aktywnego własnego zapisu jest `404 not_found`, a operacja od startu terminu jest `422 validation_failed`.

Aktualizacja obecności interpretuje klucze mapy jako `user_id` zgodnie z przykładem kontraktu. Serwis blokuje termin i wszystkie wskazane aktywne zapisy, sprawdza właściciela/admina oraz `now() >= starts_at + duration_minutes`, po czym aktualizuje całą mapę albo nic. Powtórna aktualizacja nadpisuje wartość i `attendance_marked_by`. Nieaktywny lub nieznany zapis powoduje `422 validation_failed` dla całego żądania.

Alternatywa: ignorować nieznane klucze albo aktualizować częściowo. Odrzucona, ponieważ lista obecności musi być atomowa i weryfikowalna.

### Grupa korzysta bezpośrednio z istniejącego agregatora

Backend pobierze aktualne przypisania do prowadzącego oraz jego terminy z aktywnymi zapisami. Dla każdego członka wywoła `ProgressAggregator::for()` i zwróci `courses_done`, `courses_total`, `hours_accepted`, `supervision_present` i `workshop_done`. Nie powstanie alternatywne zapytanie liczące postęp ani kopia liczników.

Odpowiedź grupy jest pojedynczym obiektem z dwiema tablicami, a nie dwiema niezależnymi listami paginowanymi. To upraszcza spójny ekran prowadzącego; koszt zapytań zostanie sprawdzony w testach na danych demo.

Alternatywa: własny agregator grupowy H12. Odrzucona, ponieważ stworzyłby drugie źródło prawdy względem certyfikatu.

### H12 wyłącznie implementuje przypisanie, H18 wyłącznie konsumuje

Własność wspólnej operacji zostaje rozstrzygnięta na rzecz H12, ponieważ historia superwizji i atomowość zmiany są częścią tego pakietu. H12 rejestruje `PUT /admin/users/{id}/supervisor` tylko w `h12.php`. H18 nie jest modyfikowany i ma korzystać z tej samej operacji.

Serwis przypisania blokuje rekord wolontariusza i wszystkie jego aktualne przypisania. Dla nowego prowadzącego jednym timestampem zamyka aktywne rekordy, tworzy nowy rekord i zapisuje dokładnie jeden `supervisor.assigned` w tej samej transakcji. Powtórzenie bieżącego przypisania jest idempotentne i nie tworzy rekordu ani audytu. `Notify::send` nie jest wywoływane.

Alternatywa: dwie implementacje w H12 i H18. Odrzucona, ponieważ kolejność ładowania tras i rozbieżne transakcje byłyby niejednoznaczne.

### Frontend ma serwerowe strony i wąskie wyspy klienckie

`/panel/superwizja/page.tsx` i `/prowadzacy/grupa/page.tsx` pozostaną Server Components z polskimi metadata. Każda strona osadzi domenowy Client Component, bo `frontend/lib/api.ts` pobiera token z `localStorage`. Komponenty utrzymają stany pierwszego ładowania, błędu, błędów pól, trwającej akcji i sukcesu. Oczekiwane `ApiError` będą obsługiwane lokalnie, a przyciski zablokują ponowne wysłanie.

Typy H12 zostaną wydzielone bez zmiany publicznego API wspólnego helpera. Ekran uczestnika użyje `apiPaged`, a ekran grupy i mutacje `api`.

Alternatywa: pobieranie w Server Component. Odrzucona, ponieważ serwer nie ma tokenu z `localStorage`, a zmiana sesji wykracza poza H12.

### UI korzysta z istniejącego design systemu i bezpiecznego tekstu

Ekran uczestnika użyje `Card`, `Badge`, `Button` i `Alert`. Ekran grupy użyje `Table`, `ProgressBar`, istniejących pól formularza i przycisków. Wszystkie statusy otrzymają polską etykietę, a `location_or_link` i nazwy będą renderowane jako tekst JSX bez `dangerouslySetInnerHTML`.

Oba ekrany zapewnią logiczne nagłówki, widoczny fokus, cele dotykowe co najmniej 44 px, komunikaty `aria-live`/`role=alert`, stany pusty/błędu i responsywność zgodną z `DESIGN.md`. Layouty i menu pozostają bez zmian; demo użyje bezpośrednich adresów.

### Punkt integracyjny H07 jest bezstanowym komponentem

Strona grupy wyrenderuje dedykowany komponent-slot H07. W H12 slot nie pobiera danych, nie oblicza rzetelności i nie pokazuje wartości zastępczych. H07 będzie mogło później zastąpić wnętrze slotu bez zmiany strony i tabeli H12. Nazwa pliku i zasada przyszłej własności zostaną opisane w `DEMO/H12.md`.

Alternatywa: komentarz TODO w stronie. Odrzucona, ponieważ nie tworzy stabilnej granicy integracji.

## Bramki i ich rozstrzygnięcia

1. **Niepełne odpowiedzi.** Rozstrzygnięte przez minimalne DTO oparte na istniejących kolumnach, wyliczonych miejscach, standardowej kopercie i minimalnych danych osoby. Bramka nie wymaga zmiany kontraktu.
2. **Wspólna własność przypisania.** Rozstrzygnięte: H12 implementuje, H18 konsumuje. H12 nie edytuje plików H18.
3. **Cykl życia.** Rozstrzygnięte: aktywny zapis jest idempotentny, anulowany jest reaktywowany, wypis od `starts_at` zwraca `422 validation_failed`, a obecność można nadpisywać po końcu spotkania.
4. **Walidacja terminu i obecności.** Rozstrzygnięte z typów i domyślnych wartości bazy; mapa obecności używa `user_id` i jest atomowa.

Wszystkie cztery bramki są zamknięte w planie H12. Nie oczekują już na strażnika i nie blokują wdrożenia przez `openspec-apply-change`.

## Risks / Trade-offs

- [Brak unikalnego aktualnego przypisania w schemacie] → Blokować rekord wolontariusza, zamykać wszystkie aktywne przypisania i testować, że po operacji istnieje najwyżej jedno.
- [Test współbieżności jest pozornie zielony] → Wymagać niezależnych połączeń, wspólnej bariery i końcowej asercji bazy na PostgreSQL.
- [Wyścig zmiany superwizora z zapisem] → Obie operacje zaczynają od blokady tego samego rekordu wolontariusza i używają stałej kolejności dalszych blokad.
- [Reaktywacja usuwa timestamp poprzedniego anulowania] → Jest to ograniczenie zamrożonego schematu; zachowana zostaje tożsamość rekordu, a nowa migracja jest poza zakresem.
- [Koszt agregatora dla dużej grupy] → Mierzyć liczbę i czas zapytań na seedach oraz nie tworzyć drugiego źródła postępu.
- [H18 spróbuje zarejestrować tę samą trasę] → Test `route:list` i dokumentacja demo wskazują H12 jako jedynego implementującego.
- [Brak pozycji menu utrudni demo] → Użyć bezpośrednich adresów w `DEMO/H12.md`; rejestr menu pozostaje zamrożony.
- [Lokalizacja zostanie potraktowana jako HTML lub niebezpieczny link] → Renderować jako zwykły tekst, bez aktywowania dowolnego URL.

## Migration Plan

1. Zaimplementować backend za istniejącą flagą `features.h12`, zaczynając od FormRequestów, Resources i autoryzacji.
2. Dodać serwisy transakcyjne zapisu, wypisu, obecności i przypisania oraz testy Feature.
3. Uruchomić test współbieżności na PostgreSQL i sprawdzić końcowy stan bazy.
4. Dodać oba ekrany i slot H07 bez zmian layoutów i menu; uruchomić lint, build oraz przegląd klawiaturą i mobile.
5. Zweryfikować kanoniczne seedy, zapisać wyniki w `DEMO/H12.md` i wykonać pełne testy oraz kontrolę zakresu diffu.

Wycofanie polega na wyłączeniu istniejącej flagi `features.h12` i cofnięciu plików pakietu. Nie ma migracji ani transformacji danych do odwrócenia; rekordy utworzone podczas pilotażu pozostają w istniejących tabelach historycznych.
