## 1. Granice backendu, FormRequesty i trasy

- [x] 1.1 Utworzyć dedykowany FormRequest dla każdej z siedmiu operacji H12, również GET i DELETE bez ciała, z regułami profilu H12 i polskimi komunikatami; weryfikacja: kontrolery nie przyjmują bazowego `Illuminate\Http\Request`, a testy błędnych pól zwracają `422 validation_failed`.
- [x] 1.2 Utworzyć Resources/serializację H12 dla terminu uczestnika, terminu prowadzącego, grupy i przypisania; weryfikacja: dokładne asercje JSON potwierdzają pola ze specyfikacji, ISO 8601 UTC, standardowe koperty i brak pól nadmiarowych.
- [x] 1.3 Zarejestrować za `features.h12` wyłącznie siedem tras w `backend/routes/api/h12.php` z właściwymi middleware; weryfikacja: `php artisan route:list` pokazuje każdą operację dokładnie raz, a żaden inny plik tras nie ma zmian.
- [x] 1.4 Dodać test macierzy uwierzytelnienia, roli i `access.active` dla wszystkich tras; weryfikacja: bez tokenu jest `401 unauthenticated`, niewłaściwa rola ma `403 forbidden`, wygasły wolontariusz ma `403 access_expired`, a dozwolone role przechodzą do reguł domenowych.

## 2. Terminy uczestnika, zapis i wypis

- [x] 2.1 Zaimplementować `GET /supervision/slots` przez aktualne przypisanie wolontariusza, standardową paginację 25/100 i Resource terminu; weryfikacja: test pokazuje wyłącznie terminy aktualnego superwizora, poprawne liczniki, własny aktywny zapis, stabilne sortowanie i pustą listę bez przypisania.
- [x] 2.2 Zaimplementować transakcyjny zapis z blokadą wolontariusza, aktualnego przypisania i terminu oraz liczeniem tylko aktywnych zapisów; weryfikacja: pierwszy zapis zwraca `201`, cudza grupa `403 not_your_supervisor`, zapis od `starts_at` `422 validation_failed`, pełny termin `409 slot_full`, a błędy nie mutują bazy.
- [x] 2.3 Wdrożyć idempotentny aktywny zapis i reaktywację anulowanego rekordu zgodnie z unikalnością `(slot_id, user_id)`; weryfikacja: aktywne ponowienie zachowuje `signed_up_at` i liczbę rekordów, a reaktywacja tego samego rekordu czyści `cancelled_at`, obecność i autora oraz ponownie respektuje limit.
- [x] 2.4 Zaimplementować owner-scoped `DELETE /supervision/slots/{id}/signup` pod blokadą rekordu; weryfikacja: wypis przed startem ustawia `cancelled_at`, zwalnia miejsce i zwraca Resource z `signup=null`, a start/później daje `422` i brak/cudzy zasób `404 not_found` bez mutacji.

## 3. Rzeczywista współbieżność limitu miejsc

- [x] 3.1 Zbudować test integracyjny PostgreSQL uruchamiający dziesięć zapisów przez niezależne połączenia lub procesy ze wspólną barierą startową, bez nowej zależności; weryfikacja: test nie jest sekwencyjną pętlą ani jedną transakcją `RefreshDatabase`.
- [x] 3.2 Sprawdzić kryterium terminu z limitem trzech miejsc; weryfikacja: każdy przebieg daje dokładnie 3×201, 7×409 `slot_full` i dokładnie trzy aktywne rekordy w bazie.
- [x] 3.3 Dodać test wyścigu zapisu z równoległą zmianą superwizora przy wspólnej kolejności blokad; weryfikacja: zapis jest zgodny z przypisaniem ponownie sprawdzonym w transakcji i test nie kończy się deadlockiem.

## 4. Grupa prowadzącego i własne terminy

- [x] 4.1 Zaimplementować `GET /instructor/group` przez aktualne przypisania do uwierzytelnionego prowadzącego i `ProgressAggregator::for()` dla każdego członka; weryfikacja: test izoluje dwie grupy i porównuje wszystkie pięć pól `progress` z bezpośrednim wynikiem agregatora.
- [x] 4.2 Dołączyć wyłącznie własne terminy i aktywne zapisy z minimalnymi danymi osoby oraz poprawnymi licznikami miejsc; weryfikacja: dokładna asercja JSON wyklucza cudze terminy, anulowane zapisy i dodatkowe dane osobowe oraz zwraca puste tablice dla pustej grupy.
- [x] 4.3 Zaimplementować `POST /instructor/slots` z właścicielem wyłącznie z tokenu oraz zakresami wynikającymi ze schematu; weryfikacja: wartości domyślne 90/3/null i granice 1–65535, 1–255, 255 znaków przechodzą lub odpadają zgodnie ze specyfikacją, `starts_at` musi być przyszłe, a klient nie może ustawić `supervisor_id`.
- [x] 4.4 Dodać testy roli i izolacji grupy oraz tworzenia terminów; weryfikacja: prowadzący nie widzi cudzej grupy ani nie tworzy terminu innej osoby, a role uczestników otrzymują `403 forbidden`.

## 5. Obecności i warunek certyfikatu

- [x] 5.1 Zaimplementować `UpdateAttendanceRequest` z wymaganą mapą kluczy `user_id`, słownikiem wyłącznie `present|absent` i sprawdzeniem aktywnego zapisu; weryfikacja: zła wartość, zły klucz lub osoba bez aktywnego zapisu daje `422 validation_failed` i brak częściowej aktualizacji.
- [x] 5.2 Zaimplementować atomową aktualizację obecności pod blokadą terminu i zapisów dla właściciela terminu albo administracji, z `attendance_marked_by` z tokenu; weryfikacja: testy dopuszczają właściciela, `project_manager` i `super_admin`, odrzucają innego prowadzącego przez `404 not_found` i zapisują właściwego autora.
- [x] 5.3 Egzekwować aktualizację od `starts_at + duration_minutes` oraz nadpisywanie wcześniejszego oznaczenia; weryfikacja: test przed końcem zwraca `422` bez zmian, a powtórzenie po końcu nadpisuje wskazane wartości i autora oraz zwraca `200` z pełnym zasobem terminu.
- [x] 5.4 Sprawdzić zasilanie warunku certyfikatu bez zmiany `ProgressAggregator`; weryfikacja: `present` zwiększa `supervision_present`, `absent` i `cancelled_at` go nie zwiększają, a obecność u poprzedniego superwizora nadal liczy się po zmianie przypisania.

## 6. Historyczne przypisanie superwizora i własność H12

- [x] 6.1 Zaimplementować w H12 `PUT /admin/users/{id}/supervisor` z requestem `supervisor_id`, blokadą wolontariusza i aktywnych przypisań oraz jednym timestampem zamknięcia/utworzenia; weryfikacja: pierwsze przypisanie i zmiana zwracają `200`, poprzednie rekordy mają `unassigned_at`, a w bazie pozostaje dokładnie jedno aktualne przypisanie.
- [x] 6.2 Objąć zmianę przypisania i `AuditLog::record(..., 'supervisor.assigned', ...)` jedną transakcją i nie wywoływać `Notify::send`; weryfikacja: test potwierdza dokładnie jeden audyt, zero powiadomień oraz rollback przypisania przy błędzie audytu.
- [x] 6.3 Pokryć role celu i superwizora oraz idempotentne przypisanie tej samej osoby; weryfikacja: błędne role dają `422 validation_failed`, a ponowienie bieżącego przypisania nie tworzy rekordu ani audytu.
- [x] 6.4 Udokumentować H12 jako implementującego, a H18 jako konsumenta w `DEMO/H12.md`; weryfikacja: `route:list` pokazuje jedną trasę, scenariusz administracyjny zachowuje historię i przełącza listę uczestnika, a diff nie zawiera zmian H18.

## 7. Ekran uczestnika `/panel/superwizja`

- [x] 7.1 Dodać typy H12, serwerowy `page.tsx` z polskimi metadanymi i wąski Client Component korzystający z `apiPaged`; weryfikacja: typy dokładnie odwzorowują Resource, a żądanie startuje po hydratacji z tokenem Bearer.
- [x] 7.2 Zbudować responsywne karty terminów z istniejących `Card`, `Badge`, `Button` i `Alert`, pokazując czas, lokalizację jako tekst, dostępność miejsc i własny zapis; weryfikacja: ekran ma polskie stany ładowania, pusty, błędu i sukcesu oraz nie zmienia layoutu ani menu.
- [x] 7.3 Podłączyć zapis i wypis z osobnym stanem trwającej akcji per termin oraz obsługą `slot_full`, `not_your_supervisor`, `validation_failed` i `not_found`; weryfikacja: przycisk blokuje podwójne wysłanie, odpowiedź odświeża stan, a równoległe zapełnienie pokazuje czytelny komunikat.
- [x] 7.4 Przejść ekran klawiaturą i przy szerokości mobilnej; weryfikacja: brak `dangerouslySetInnerHTML`, fokus jest widoczny, cele dotykowe mają co najmniej 44 px, nagłówki są logiczne, a komunikaty są ogłaszane czytnikom.

## 8. Ekran prowadzącego `/prowadzacy/grupa` i slot H07

- [x] 8.1 Dodać typy grupy, serwerowy `page.tsx` z polskimi metadanymi i wąski Client Component korzystający z `api`; weryfikacja: ekran obsługuje ładowanie, błąd i pustą grupę, a typy nie zawierają pól spoza Resource.
- [x] 8.2 Zbudować responsywną tabelę lub karty członków i postępów z `Table`, `ProgressBar`, `Badge` i tekstowymi wartościami; weryfikacja: wartości są zgodne z API, status nie zależy od samego koloru i widok jest używalny na mobile.
- [x] 8.3 Dodać formularz własnego terminu i atomowe akcje obecności z istniejących pól i przycisków; weryfikacja: błędy pól są powiązane przez ARIA, trwające akcje blokują powtórzenie, UI nie pozwala wskazać innego prowadzącego, a obecność oferuje tylko polskie etykiety dla `present` i `absent`.
- [x] 8.4 Dodać stabilny, bezstanowy komponent-slot H07 w dedykowanym pliku integracyjnym i wyrenderować go bez danych rzetelności; weryfikacja: H07 może później wypełnić slot bez edycji głównej strony H12, a wyszukanie kodu nie znajduje obliczeń ani endpointów H07.
- [x] 8.5 Przejść ekran prowadzącego klawiaturą i przy szerokości mobilnej; weryfikacja: fokus jest widoczny, cele dotykowe mają co najmniej 44 px, formularze mają etykiety, błędy są ogłaszane, a wszystkie teksty są po polsku i zgodne z `DESIGN.md`.

## 9. Demo, testy jakości i kontrola zakresu

- [x] 9.1 Utworzyć `DEMO/H12.md` z kanonicznymi fikcyjnymi kontami Marty i Joanny oraz krokami zapisu, `slot_full`, izolacji grup, obecności, zmiany superwizora i slotu H07; weryfikacja: scenariusz nie zawiera prawdziwych danych i odtwarza wszystkie kryteria H12 przez bezpośrednie adresy ekranów.
- [x] 9.2 Uruchomić celowane testy H12, test współbieżności PostgreSQL, `SeedIntegrityTest`, pełne `php artisan test` i Pint; weryfikacja: wszystkie komendy są zielone, a wyniki i wcześniejsze problemy spoza H12 są zapisane w `DEMO/H12.md` bez modyfikowania obcych pakietów.
- [x] 9.3 Uruchomić `npm run lint` i `npm run build` oraz manualny przegląd obu ekranów klawiaturą i mobile; weryfikacja: komendy i przegląd są zielone, a stany ładowania, pusty, błędu, sukcesu i trwających akcji są udokumentowane.
- [x] 9.4 Przejrzeć końcowy diff pod kątem własności i ograniczeń; weryfikacja: brak migracji, zależności, zmian fasad, `ProgressAggregator`, layoutów, `UserResource`, menu, H06/H11/koordynacji, H07/H18 oraz tras innych niż `backend/routes/api/h12.php`, a `git diff --check` przechodzi.
- [x] 9.5 Potwierdzić brak nowych typów powiadomień i slugów audytu; weryfikacja: H12 nie wywołuje `Notify::send`, nie używa `supervision.reminder`, a jedynym audytem jest `supervisor.assigned` przez `AuditLog::record`.
