## 1. Bramki kontraktu i koordynacji

- [x] 1.1 Lokalny kontrakt (zatwierdzony wyjątek) definiuje DTO listy, filtry/search/sort, kolejność i izolację aktywnej edycji; weryfikacja: `design.md` zawiera payload i asercje `data/meta`.
- [x] 1.2 Lokalny kontrakt definiuje payload, walidację, status/DTO oraz duplikat dla `POST /admin/applications`; weryfikacja: `design.md` zawiera przykłady sukcesu i błędów.
- [x] 1.3 Lokalny kontrakt definiuje `GET /admin/applications/{id}` i szczegóły bez surowej ścieżki pliku; weryfikacja: ApplicationResource ma stabilny kształt.
- [x] 1.4 Lokalny kontrakt definiuje `GET /admin/applications/{id}/diploma-scan`, brak pliku, `file_id` w logu i bezpieczne nagłówki; weryfikacja: feature test pobrania i odmowy.
- [x] 1.5 Lokalny kontrakt definiuje `force`, `edition_capacity_exceeded`, `capacity/active/requested`, liczenie aktywnych i blokadę edycji; weryfikacja: test bez force i z force.
- [x] 1.6 Lokalny kontrakt definiuje sukces odrzucenia i `application_already_decided` dla ponowień; weryfikacja: test decyzji one-shot.
- [x] 1.7 Lokalny kontrakt definiuje role accept i ograniczenie PM przed nadaniem `super_admin`; weryfikacja: AcceptApplicationRequest i test 403.
- [x] 1.8 Lokalny kontrakt definiuje multipart `file`, CSV/BOM/separator, limity, walidację i raport `skipped`; weryfikacja: test importu mieszanego i semicolon/BOM.
- [x] 1.9 Lokalny kontrakt definiuje transakcję accept, URL aktywacji, token i sześciomiesięczne `access_expires_at`; weryfikacja: test Mailpit → activate → login.
- [x] 1.10 Lokalny kontrakt definiuje `Notify::send` dla odrzucenia bez konta (odbiorca audytowy aktora); weryfikacja: test powiadomienia bez tworzenia użytkownika.
- [ ] 1.11 BLOCKED [C-H03-01] Potwierdzić z liaison i właścicielem H18 (Tomek według ustalenia użytkownika) deskryptor slotu, miejsce osadzenia i adapter po stronie H18; weryfikacja: zapisane uzgodnienie wymienia pliki H03 i H18, a H03 nie musi edytować głównej strony H18.
- [ ] 1.12 BLOCKED [C-H03-02] Uzgodnić ze staffem, czy demo skanu używa H03 seedera/fikcyjnego pliku i kto rejestruje seeder w staff-owned `DatabaseSeeder`; weryfikacja: istnieje uzgodniony sposób odtworzenia demo bez prawdziwych danych i bez samowolnej edycji plików staff-owned.

## 2. Fundament backendu H03

- [x] 2.1 Dodać `ApplicationFactory` i bezpieczne fikcyjne stany `new/accepted/rejected` bez prawdziwych danych osobowych; weryfikacja: test fabryki tworzy rekordy powiązane z `Edition`, a fixture e-mail używa domeny `.test`.
- [x] 2.2 Uzupełnić wyłącznie potrzebne relacje/scopes modeli `Application` i `Edition` bez zmiany migracji ani publicznych fasad; weryfikacja: testy relacji zwracają edycję, decydenta i użytkownika, a `git diff --name-only` nie zawiera `backend/database/migrations/`.
- [x] 2.3 Skonfigurować operacje H03 w `backend/routes/api/h03.php` pod flagą `features.h03`, `auth:sanctum` i rolami administracyjnymi; weryfikacja: route list pokazuje siedem lokalnie uzgodnionych endpointów (pięć operacji plus detail/scan) z middleware.
- [x] 2.4 Dodać testy autoryzacji dla gościa, ról uczestniczkowych oraz obu ról administracyjnych; weryfikacja: test routingu sprawdza middleware każdej trasy i 401/403 kolejki.
- [x] 2.5 Dodać test braku publicznej samodzielnej rejestracji oraz kontrolę `config/public_routes.php`; weryfikacja: próby publicznego `POST` rejestracji zwracają `404`, a `PublicRoutesSmokeTest` pozostaje zielony bez dopisania trasy H03 do wyjątków.

## 3. Kolejka, tworzenie i szczegóły

- [x] 3.1 Zaimplementować FormRequest listy, query kolejki i Resource z paginacją/filtrami/izolacją aktywnej edycji; weryfikacja: feature test listy i izolacji.
- [x] 3.2 Zaimplementować StoreApplicationRequest i ręczne tworzenie zgłoszenia; weryfikacja: test statusu `new`, koperty i braku użytkownika.
- [x] 3.3 Zaimplementować odczyt szczegółów bez `diploma_scan_path`; weryfikacja: ApplicationResource nie ujawnia storage path.
- [x] 3.4 Dodać wspólną normalizację e-maila dla create, accept i import; weryfikacja: test jednostkowy i asercje API.

## 4. Akceptacja, capacity i zaproszenie

- [x] 4.1 Zaimplementować AcceptApplicationRequest z rolą, `force` i autoryzacją aktora; weryfikacja: test 403 dla PM przy `super_admin` oraz walidacja enum.
- [x] 4.2 Zaimplementować `ApplicationAcceptor` z blokadami Application/Edition, capacity i transakcją skutków; weryfikacja: test akceptacji sprawdza rekordy użytkownika, audytu, powiadomienia i e-maila.
- [x] 4.3 Zaimplementować konflikt e-maila istniejącego konta jako `409 email_already_registered` z `reason.existing_user_id`; weryfikacja: feature test sprawdza kod i reason oraz brak zmiany zgłoszenia, nowego użytkownika, audytu i powiadomienia.
- [x] 4.4 Zaimplementować `409 edition_capacity_exceeded` i świadome `force`; weryfikacja: asercje reason i happy path ponad limit.
- [x] 4.5 Dodać test współbieżnych akceptacji przy ostatnim miejscu edycji; weryfikacja: `ConcurrentApplicationTest` potwierdza jeden wynik 201, jeden 409, brak osieroconych kont i zachowanie limitu.
- [x] 4.6 Obsłużyć ponowną akceptację oraz accept po reject; weryfikacja: test one-shot i brak dodatkowych skutków.
- [x] 4.7 Zbudować zaproszenie `application.accepted` z linkiem aktywacyjnym przez Notify; weryfikacja: simulated e-mail zawiera token.
- [x] 4.8 Dodać test akceptacja → e-mail/outbox → activate → login; weryfikacja: token jednorazowy, hasło początkowo null i expiry + 6 miesięcy.

## 5. Odrzucenie

- [x] 5.1 Dodać RejectApplicationRequest z wymaganym, niepustym `reason`; weryfikacja: 422 `validation_failed` i brak zmiany bazy.
- [x] 5.2 Zaimplementować `ApplicationRejector` z blokadą, zapisem decyzji, audytem i Notify; weryfikacja: test audytu, powiadomienia/e-maila i braku konta.
- [x] 5.3 Obsłużyć ponowne odrzucenie i reject po accept; weryfikacja: test one-shot i brak drugiego audytu/powiadomienia.
- [ ] 5.4 BLOCKED [G-H03-09, G-H03-10] Dodać test rollbacku odrzucenia przy błędzie obowiązkowego kanału Notify; weryfikacja: zgłoszenie pozostaje `new` i nie ma częściowego audytu ani e-maila.

## 6. Import CSV

- [x] 6.1 Zaimplementować ImportApplicationsRequest dla multipart `file`, CSV/TXT i limitu; weryfikacja: brak pliku zwraca 422.
- [x] 6.2 Zaimplementować wierszowy `ApplicationCsvImporter` bez zależności; weryfikacja: test BOM, separatora, nagłówków i numerów linii.
- [x] 6.3 Zaimplementować walidację/deduplikację z raportem `skipped`; weryfikacja: mieszany plik tworzy tylko poprawne applications i żadnych users.
- [ ] 6.4 BLOCKED [G-H03-08] Zaimplementować zatwierdzoną atomowość importu i zachowanie przy błędzie bazy; weryfikacja: test wymuszonego błędu potwierdza kontraktowy wynik oraz brak nieudokumentowanych częściowych zapisów.

## 7. Skan dyplomu i rejestr wglądów

- [x] 7.1 Zaimplementować `DiplomaScanAccess`, bezpieczne rozwiązanie ścieżki i odpowiedź plikową bez storage path; weryfikacja: feature test pobrania i nagłówków.
- [x] 7.2 Zapisywać każdy udany wgląd w `SensitiveAccessLogEntry` i przez `AuditLog::record('sensitive.viewed')`; weryfikacja: dwa pobrania tworzą dwa wpisy logu i audytu.
- [x] 7.3 Obsłużyć brak rekordu/skanu/pliku i role niedozwolone; weryfikacja: test 404/403 bez wpisu.
- [ ] 7.4 BLOCKED [C-H03-02] Dostarczyć wyłącznie fikcyjny plik demo/skan i uzgodniony seeder H03, jeśli wymaga tego demo; weryfikacja: reset danych odtwarza scenariusz, plik nie zawiera prawdziwych danych, a H03 nie edytuje samodzielnie `DatabaseSeeder` ani kanonicznego `DemoSeeder`.

## 8. Komponent zakładki H03

- [x] 8.1 Utworzyć publiczne `ApplicationsTabProps`, `ApplicationsTab` i `h03ApplicationsTabSlot` w plikach H03 zgodnie z interfejsem D9; weryfikacja: TypeScript kompiluje komponent bez wymaganych propsów i bez importu pliku strony H18.
- [x] 8.2 Zaimplementować kolejkę z paginacją, filtrami/statusami i stanami loading/empty/retry error; weryfikacja: komponent używa `apiPaged` i parametrów lokalnego kontraktu.
- [x] 8.3 Dodać formularz ręcznego zgłoszenia z etykietami, błędami pól i pending/success; weryfikacja: 422 mapuje `error.errors`, sukces odświeża kolejkę.
- [x] 8.4 Dodać dostępny dialog szczegółów i kontrolowane otwarcie skanu; weryfikacja: Escape/ARIA/fokus i brak HTML/ścieżki pliku.
- [x] 8.5 Dodać accept z wyborem roli i osobnym potwierdzeniem `force` po błędzie capacity; weryfikacja: komponent wysyła force dopiero w drugim żądaniu.
- [x] 8.6 Dodać reject z obowiązkowym powodem i stanami pending/error/success; weryfikacja: pusty powód zatrzymuje submit, 422 wiąże się z polem.
- [x] 8.7 Dodać dostępny import CSV i raport `imported/skipped`; weryfikacja: klawiatura, postęp, liczba importów i powody wierszy.
- [x] 8.8 Przejrzeć komponent na mobile i pod kątem WCAG: fokus, ARIA, etykiety statusów, kontrast, obszary 44 px i brak polegania wyłącznie na kolorze; weryfikacja: checklista w `DEMO/H03.md` ma wynik dla klawiatury i widoku mobilnego, a lint dostępności jest zielony.
- [ ] 8.9 BLOCKED [C-H03-01] Przekazać deskryptor właścicielowi H18 i zweryfikować osadzenie w `/admin/uczestniczki` bez edycji plików H18 przez H03; weryfikacja: zakładka „Zgłoszenia” jest dostępna na ekranie H18, a diff H03 nie zawiera cudzych plików strony/layoutu/menu.
- [x] 8.10 Zachować zachowanie tymczasowe bez slotu H18: bez nowej strony i bez wpisu menu; weryfikacja: `npm run build` kompiluje H03, a `git diff --name-only` nie pokazuje `admin/uczestniczki`, `admin/layout.tsx`, `PanelShell` ani `frontend/lib/menu/admin/index.ts`.

## 9. Testy integracyjne i dane demonstracyjne

- [x] 9.1 Dodać testy kopert sukcesów/błędów i kodów `401/403/404/409/422`; weryfikacja: 27 testów H03 przechodzi.
- [x] 9.2 Dodać test izolacji aktywnej edycji i niedozwolonych ról; weryfikacja: administrator nie widzi zamkniętej edycji, role uczestniczkowe dostają 403.
- [x] 9.3 Zapisy audytu i powiadomień realizować wyłącznie przez `AuditLog::record`/`Notify::send`; weryfikacja: code review i asercje bazy dla slugów H03.
- [x] 9.4 Dodać `DEMO/H03.md` z fikcyjnymi danymi i krokami: kolejka, create, accept, Mailpit, activate/login, reject, import, capacity/force, duplikat e-maila i sensitive view; weryfikacja: dokument podaje konta demo, komendy testowe, oczekiwane wyniki oraz jawnie wymienia nierozstrzygnięte bramki.
- [ ] 9.5 Przejść ręczny scenariusz H03 na danych demo bez prawdziwych danych osobowych; weryfikacja: wynik każdego kroku i ewentualne ograniczenia są zapisane w `DEMO/H03.md`.

## 10. Bramki jakości i kontrola zakresu

- [x] 10.1 Uruchomić Pint dla backendu i sprawdzić brak zmian formatowania poza H03; weryfikacja: `cd backend && ./vendor/bin/pint` kończy się kodem 0, a diff nie obejmuje cudzych plików.
- [x] 10.2 Uruchomić testy H03 oraz pełny backend; weryfikacja: `php artisan test --filter=H03` (27) i pełny backend (313, 2 skip) kończą się kodem 0.
- [x] 10.3 Uruchomić frontend lint i build; weryfikacja: `cd frontend && npm run lint` oraz `npm run build` kończą się kodem 0 bez nowych zależności.
- [x] 10.4 Uruchomić `git diff --check` oraz audyt zakresu plików; weryfikacja: brak błędów whitespace, zmian migracji, compose, lockfile, fasad, `UserResource`, `/me`, cudzych tras, layoutów, menu registry i strony H18.
- [x] 10.5 Zweryfikować powierzchnię tras i brak publicznej rejestracji; weryfikacja: route list zawiera pięć operacji plus lokalne detail/scan, a test public registration pozostaje zielony.
- [x] 10.6 Uruchomić `openspec validate h03-recruitment-applications --strict` po aktualizacji artefaktów decyzjami strażników; weryfikacja: polecenie kończy się powodzeniem bez ostrzeżeń.
- [x] 10.7 Pobrać `origin/main`, zintegrować go z branchem i sprawdzić własność/status H03; weryfikacja: branch `pakiet/H03-rekrutacja`, tablica `Mikołaj / W TOKU`, a status zawiera wyłącznie świadome pliki H03.
