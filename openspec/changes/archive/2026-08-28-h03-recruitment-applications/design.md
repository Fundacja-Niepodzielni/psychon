## Context

H03 startuje na branchu `pakiet/H03-rekrutacja`, a rezerwacja `Mikołaj / W TOKU` jest widoczna na `origin/main`. Schemat zawiera już komplet tabel i kolumn potrzebnych do rekrutacji: `applications`, `users`, `editions`, `audit_log`, `sensitive_access_log`, `notifications` i `emails`; migracje są zamrożone.

Starter udostępnia aktywację konta przez `POST /auth/activate`, jednorazowy `users.activation_token`, role middleware, koperty błędów, `AuditLog::record`, `Notify::send` i `Settings::activeEdition()`. Zamrożone fasady przyjmują wyłącznie istniejącego `User` jako odbiorcę powiadomienia. Obecny seed ma jedno fikcyjne zgłoszenie `new`, bez skanu dyplomu.

Kontrakt wymienia pięć tras H03, ale tylko częściowo opisuje ich wejścia i wyjścia. Nie definiuje osobnej trasy szczegółów ani wglądu w skan, mimo że oba zachowania są wymagane przez kartę pakietu. Plan musi zatem rozdzielić architekturę możliwą do przygotowania od implementacji zablokowanej do aktualizacji kontraktu.

Ekran `/admin/uczestniczki` i jego główna strona należą do H18. H03 może dostarczyć komponent do osadzenia, ale nie może samodzielnie modyfikować strony H18, layoutu panelu ani rejestru menu. Zależności wskazują H18 jako właściciela strukturalnego; bieżąca tablica koordynacyjna nadal pokazuje osobę H18 jako nieprzypisaną, dlatego integracja wymaga potwierdzenia przez liaisona/Tomka przed edycją plików H18.

## Goals / Non-Goals

**Goals:**

- Zaplanować H03 jako jeden pionowy wycinek oparty wyłącznie na istniejącym schemacie i zatwierdzonych fasadach.
- Zapewnić jedną ścieżkę domenową dla akceptacji i jedną dla odrzucenia, z blokadą wiersza i bez częściowych skutków ubocznych.
- Ustalić wyraźne granice własności H03/H18 oraz stabilny, samodzielny interfejs komponentu zakładki.
- Zaplanować testy kontraktu, autoryzacji, odmów, współbieżności, importu, wrażliwych plików i ścieżki aktywacji.
- Zablokować każde zadanie, które wymaga nieistniejącego DTO, trasy, kodu błędu lub decyzji o uprawnieniach.

**Non-Goals:**

- Publiczny formularz rekrutacyjny lub samodzielna rejestracja.
- Zmiana migracji, schematu, zamrożonych fasad, `UserResource`, `/me`, layoutów panelu lub menu registry.
- Edycja strony `/admin/uczestniczki` należącej do H18 bez uzgodnienia.
- Realna wysyłka e-maili, nowe zależności composer/npm lub nowe biblioteki UI.
- Rozstrzyganie retencji skanów i odrzuconych zgłoszeń, która pozostaje decyzją prawną poza H03.

## Decisions

### D1. H03 używa istniejącego schematu bez migracji

`Application`, `User`, `Edition` i `SensitiveAccessLogEntry` już odwzorowują wymagane relacje. Implementacja może dodać wyłącznie relacje, query scopes lub casty w modelach, jeśli nie zmienia to publicznego API startera. Nie powstaje żadna migracja.

Alternatywa odrzucona: dodanie kolumny na status dyplomu, token expiry lub kod zdarzenia w `sensitive_access_log`. Byłoby to sprzeczne z zamrożeniem migracji i wymagałoby strażnika schematu.

### D2. Granica HTTP pozostaje wyłącznie w `backend/routes/api/h03.php`

Zatwierdzone operacje będą zgrupowane pod `auth:sanctum` i `role:project_manager,super_admin`, z flagą `features.h03` zgodnie z wzorcami istniejących pakietów. Każde wejście, włącznie z parametrami listy i importem multipart, otrzyma FormRequest; kontrolery będą cienkie i zwrócą dane przez Resources lub jawne kontraktowe koperty.

Nie zostanie dodana żadna trasa publiczna. Nie zostaną zmienione `auth.php`, `h16.php`, `h18.php`, `config/public_routes.php` ani cudze pliki tras.

Alternatywa odrzucona: tymczasowe `GET /admin/applications/{id}` i `/diploma` „na potrzeby frontu”. Kontrakt nie zatwierdza tych tras.

### D3. Operacje zapisu przechodzą przez serwisy domenowe H03

Planowane komponenty backendu:

- `ApplicationAcceptor` — blokuje zgłoszenie i aktywną edycję, sprawdza stan, e-mail oraz capacity, tworzy konto i token, zapisuje decyzję, audyt i powiadomienie.
- `ApplicationRejector` — blokuje zgłoszenie, wymaga stanu `new`, zapisuje decyzję, audyt oraz zatwierdzony kanał odrzucenia.
- `ApplicationCsvImporter` — waliduje plik i wiersze, normalizuje e-maile, zapisuje tylko poprawne zgłoszenia i składa raport.
- `DiplomaScanAccess` — po autoryzacji rozwiązuje bezpieczną ścieżkę pliku, rejestruje udany wgląd i zwraca odpowiedź zatwierdzoną przez strażnika.

Każdy serwis korzysta z istniejących modeli oraz fasad; kontrolery nie duplikują reguł domenowych.

Alternatywa odrzucona: umieszczenie decyzji, importu i logowania w jednym kontrolerze. Utrudniłoby testowanie rollbacku i współbieżności.

### D4. Akceptacja blokuje zasoby i kończy się jako całość albo wcale

Docelowo zewnętrzna transakcja bazy obejmie blokadę `Application`, blokadę aktywnej `Edition`, kontrolę limitu, konflikt e-maila, utworzenie `User`, aktualizację `Application`, `AuditLog::record` i `Notify::send`. Obie fasady dołączają do istniejącej transakcji. Token aktywacyjny powstaje z kryptograficznie losowej wartości wspieranej przez Laravel; hasło pozostaje `null` do użycia starterowego `/auth/activate`.

Kolejność blokad będzie stała (`applications` → `editions`), aby ograniczyć ryzyko deadlocków. Test współbieżny musi potwierdzić, że równoległe akceptacje przy granicy limitu nie omijają capacity.

Semantyka liczników `capacity`, `active`, `requested`, payload `force`, dozwolone role i granica transakcji zostały lokalnie rozstrzygnięte w sekcji „Local API override” na wyraźną prośbę użytkownika; wymagają późniejszej synchronizacji z kanonicznym kontraktem.

Alternatywa odrzucona: kontrola limitu bez blokady i późniejsze utworzenie konta. Dwa równoległe żądania mogłyby zaakceptować ponad limit bez `force`.

### D5. Zaproszenie korzysta z istniejącej aktywacji i H16

Po utworzeniu konta H03 wywoła zatwierdzony typ `application.accepted` przez `Notify::send`. Powiadomienie i e-mail `simulated` trafią do nowego użytkownika, a treść zawrze link aktywacyjny zgodny z ostatecznym kontraktem. H03 nie zmienia `AuthController`, fasady H16 ani skrzynki e-maili.

Repozytorium ma endpoint aktywacji, ale nie ma strony frontendu obsługującej link. Dokładny URL, sposób przekazania tokenu i ewentualna ważność zaproszenia są częścią G-H03-09; H03 nie utworzy arbitralnej trasy auth.

### D6. Odrzucenie wymaga decyzji o odbiorcy Notify

Wymagany typ `application.rejected` jest zatwierdzony, lecz odrzucone zgłoszenie nie ma konta, a zamrożone `Notify::send(User $user, ...)` nie obsługuje adresu e-mail bez `User`. H03 nie utworzy konta dla odrzuconej osoby i nie ominie fasady bez decyzji sztabu. G-H03-10 musi wskazać zatwierdzony sposób użycia Notify albo zmianę zapewnianą przez właściciela startera.

Alternatywy odrzucone: bezpośrednie utworzenie `EmailMessage`, bo omija `Notify::send`; tymczasowy użytkownik, bo tworzy konto osobie odrzuconej; zmiana sygnatury fasady w H03, bo fasada jest staff-owned.

### D7. Udany wgląd w skan tworzy dwa ślady rozliczalności

Po pozytywnej autoryzacji i potwierdzeniu istnienia pliku system zapisze `SensitiveAccessLogEntry` (`viewer_id`, `file_type=diploma_scan`, `file_id`, `viewed_at`) oraz `AuditLog::record(..., 'sensitive.viewed', ...)`. Surowe `diploma_scan_path` nigdy nie trafi do DTO frontendu. Nieudane i zabronione próby nie będą udawane jako udane wglądy.

Dokładna trasa, odpowiedź plikowa i zachowanie dla braku skanu są zablokowane przez G-H03-04.

### D8. Import CSV nie używa eksportowej fasady `Csv`

Istniejący `App\Support\Csv` obsługuje wyłącznie eksport i ma zamrożoną sygnaturę. H03 może zbudować mały parser importu w swojej przestrzeni nazw z natywnych funkcji PHP, ale dopiero po zatwierdzeniu nazwy pola multipart, kodowania, separatora, nagłówków, limitu pliku, reguł duplikatów i atomowości w G-H03-08. Każdy pominięty wiersz zachowuje numer linii i bezpieczny, nieujawniający danych wrażliwych powód.

Alternatywa odrzucona: rozszerzenie zamrożonego helpera albo dodanie biblioteki CSV.

### D9. H03 publikuje samodzielny slot, a H18 jest jedynym integratorem strony

Granica własności:

- H03 może utworzyć `frontend/components/h03/ApplicationsTab.tsx`, typy/API w `frontend/lib/h03/` oraz deskryptor `frontend/lib/slots/h03-applications-tab.tsx`.
- H03 nie edytuje `frontend/app/(administracja)/admin/uczestniczki/**`, `admin/layout.tsx`, `PanelShell`, `frontend/lib/menu/admin/index.ts` ani plików H18.
- H18 importuje komponent lub deskryptor i osadza go w swoim przełączniku zakładek po uzgodnieniu C-H03-01.

Publiczny interfejs będzie stabilny i bez wymaganych zależności od stanu H18:

```ts
export interface ApplicationsTabProps {
  className?: string;
}

export const h03ApplicationsTabSlot = {
  id: "h03-applications",
  label: "Zgłoszenia",
  order: 20,
  Component: ApplicationsTab,
} as const;
```

Komponent sam pobiera i mutuje dane H03, a `className` jest jedynym opcjonalnym propsem layoutowym. Jeśli H18 wprowadzi własny typ rejestru slotów, właściciel H18 tworzy cienki adapter po swojej stronie zamiast wymuszać edycję komponentu H03.

Zachowanie tymczasowe: dopóki slot H18 nie istnieje, H03 nie dodaje osobnej strony ani wpisu menu. Komponent i deskryptor pozostają kompilowalne, ale nie są renderowane w produkcyjnej nawigacji; backend i testy API mogą być rozwijane niezależnie. Dashboard H19 nadal prowadzi do docelowego `/admin/uczestniczki`, którego dostarczenie należy do H18.

### D10. Frontend używa istniejących komponentów i jawnych stanów

Zakładka wykorzysta `Alert`, `Badge`, `Button`, `Card`, `Input`, `Select`, `Table` oraz `api/apiPaged`. Tekst użytkownika będzie renderowany jako React text nodes, bez `dangerouslySetInnerHTML`. Lista na mobile przejdzie w przewijaną tabelę lub karty; akcje będą miały obszar dotykowy co najmniej 44 px.

Dialog szczegółów i decyzji musi mieć `role=dialog`, `aria-modal`, opisany tytuł, focus trap lub równoważne zarządzanie fokusem, Escape/zamknięcie i powrót fokusa do elementu wywołującego. Stan pending blokuje wszystkie sprzeczne działania dla tego samego zgłoszenia. Błąd capacity pokazuje liczby z `reason` oraz osobne, świadome potwierdzenie `force`; zwykłe kliknięcie „Akceptuj” nigdy nie wysyła `force`.

### D11. Testy są podzielone według granic ryzyka

- Feature API: koperty, paginacja, autoryzacja każdej roli, walidacja FormRequestów, konflikty i brak tras publicznych.
- Serwisy: transakcje, rollback, dokładnie jeden audyt/powiadomienie i powtórzone decyzje.
- Współbieżność: capacity i unikalny e-mail.
- Import: BOM/kodowanie/separator/nagłówki po zatwierdzeniu, mieszane wiersze, duplikaty i brak `users`.
- Wrażliwe pliki: pozytywny wgląd, odmowa, brak pliku i dwa ślady audytowe.
- E2E/integracja: akceptacja → Mailpit/outbox → activate → login oraz ręczna weryfikacja komponentu w slocie H18.

## Formalne bramki kontraktu i koordynacji

Poniższa tabela zachowuje ślad pierwotnych braków kontraktu. Bramy G-H03-01…10 są rozstrzygnięte lokalnym override opisanym niżej; bramy C-H03-01…02 pozostają otwarte, bo dotyczą cudzej własności i seedera.

| Bramka | Właściciel | Brakujące rozstrzygnięcie | Blokuje |
|---|---|---|---|
| `G-H03-01` | strażnik kontraktu | DTO elementu i listy `GET /admin/applications`, dozwolone filtry/search/sort, domyślna kolejność, wybór/izolacja edycji | Request/Resource listy, frontend kolejki, testy listy |
| `G-H03-02` | strażnik kontraktu | payload, walidacja, status i odpowiedź `POST /admin/applications`, zasady duplikatu zgłoszenia | ręczne tworzenie i formularz |
| `G-H03-03` | strażnik kontraktu | zatwierdzony sposób pobrania szczegółów bez dodawania nieoficjalnej trasy | szczegóły backend/frontend |
| `G-H03-04` | strażnik kontraktu | trasa i odpowiedź wglądu/pobrania skanu, brak skanu, nagłówki pliku i identyfikator logowany jako `file_id` | dostęp do dyplomu i testy `sensitive.viewed` |
| `G-H03-05` | strażnik kontraktu | pole i typ `force`, rejestracja `edition_capacity_exceeded`, definicja `capacity/active/requested`, role liczone do limitu, reguła współbieżności | capacity/force i dialog ostrzeżenia |
| `G-H03-06` | strażnik kontraktu | status/DTO sukcesu reject oraz kody/statusy ponownej i sprzecznej decyzji accept/reject | cykl życia decyzji i testy idempotencji |
| `G-H03-07` | strażnik kontraktu | dozwolone wartości `role` w accept i różnica uprawnień PM/SA, zwłaszcza nadanie `super_admin` | AcceptApplicationRequest i testy ról |
| `G-H03-08` | strażnik kontraktu | nazwa pola multipart, kolumny CSV, separator/kodowanie/BOM, limity, walidacja, definicja duplikatu, atomowość oraz katalog powodów `skipped` | importer, formularz i testy CSV |
| `G-H03-09` | strażnik kontraktu + właściciel startera/H16 | granica atomowości konto–zgłoszenie–audyt–Notify, dokładny URL/link aktywacji, przekazanie tokenu i ewentualna ważność zaproszenia | pełny accept E2E i szablon zaproszenia |
| `G-H03-10` | strażnik kontraktu + właściciel `Notify` | jak legalnie wysłać `application.rejected` przez `Notify::send(User ...)`, gdy kandydat nie ma konta | odrzucenie z wymaganym e-mailem/powiadomieniem |
| `C-H03-01` | liaison + właściciel H18 (wskazany przez użytkownika: Tomek) | potwierdzenie deskryptora slotu, miejsca osadzenia i adaptera po stronie H18; tablica obecnie nie wskazuje osoby H18 | produkcyjne osadzenie zakładki |
| `C-H03-02` | strażnik schematu/staff | ewentualne zarejestrowanie H03 seedera lub fikcyjnego pliku dyplomu bez edycji staff-owned `DatabaseSeeder`/kanonicznego seedera | demo wglądu w skan, jeżeli obecny seed bez pliku jest niewystarczający |

## Risks / Trade-offs

- [Kontrakt nie pozwala jeszcze zbudować pełnego HTTP] → zadania mają jawne numery bramek i nie tworzą lokalnych tras ani DTO.
- [Równoległe akceptacje omijają limit] → blokada zgłoszenia i edycji, jedna transakcja oraz test współbieżny po rozstrzygnięciu G-H03-05.
- [Notify nie obsługuje odrzuconej osoby bez konta] → G-H03-10; brak bezpośrednich zapisów do `emails` i brak sztucznych kont.
- [Link zaproszenia nie ma istniejącej strony frontendu] → G-H03-09; H03 integruje istniejące API, ale nie przejmuje staff-owned auth bez zgody.
- [H18 nie ma jeszcze slotu] → samodzielny komponent bez osobnej trasy; integracja wyłącznie przez C-H03-01.
- [Wrażliwy plik albo ścieżka wycieknie w DTO/logach] → brak `diploma_scan_path` w Resources, kontrolowane odpowiedzi plikowe i bezpieczne powody importu.
- [Duży CSV zużyje pamięć] → parser wierszowy i limity z G-H03-08; bez ładowania całego pliku do pamięci.
- [Zmiany wyjdą poza H03] → końcowa kontrola ścieżek, `git diff --check` i jawna lista plików cudzej własności.

## Local API override (approved for implementation)

Na potrzeby działającego demo użytkownik jawnie zaakceptował lokalne
uzupełnienie niepełnego kontraktu. Poniższe decyzje są implementacyjnym
źródłem prawdy tej zmiany i powinny zostać później przeniesione do kanonicznego
`docs/hackathon/02-kontrakt-api.md` przez strażnika kontraktu:

- `GET /admin/applications` przyjmuje `page`, `per_page`, `status`, `search`,
  `sort` i zwraca wszystkie bezpieczne pola `ApplicationResource` oraz `meta`;
  zakres jest ograniczony do aktywnej edycji.
- `POST /admin/applications` przyjmuje dane osoby (opcjonalne `edition_id`,
  `phone`, `source`, `role`, `payload`, `university`, `graduation_year`),
  tworzy status `new` i nie tworzy użytkownika.
- `GET /admin/applications/{id}` zwraca szczegóły bez surowego
  `diploma_scan_path`; `GET /admin/applications/{id}/diploma-scan` streamuje
  plik i zapisuje `sensitive_access_log` oraz `sensitive.viewed`.
- Accept przyjmuje `{role, force?}`. Limit liczy aktywnych użytkowników
  edycji; przekroczenie bez `force` zwraca 409 z `reason.capacity`, `active`,
  `requested`. Akceptacja zapisuje konto zaproszone, token, sześciomiesięczny
  `access_expires_at`, audyt i `Notify::send(application.accepted)`.
- Reject przyjmuje `{reason}` i zwraca zasób zgłoszenia. Ponowiona lub
  sprzeczna decyzja zwraca `409 application_already_decided`. Ponieważ nowy
  kandydat nie ma jeszcze konta, lokalnie odbiorcą `Notify::send` dla
  `application.rejected` jest aktor administracyjny.
- Import używa multipart `file`, nagłówków `first_name,last_name,email` oraz
  opcjonalnych pól osoby; parser obsługuje przecinek/średnik i BOM, a raport
  ma kształt `{imported, skipped:[{line, reason}]}`.

To odstępstwo jest celowe i jawne; nie oznacza zgodności kanonicznego
kontraktu, dopóki strażnik nie zsynchronizuje dokumentacji.

## Migration Plan

1. Utrzymać lokalne decyzje G-H03-01…10 i przekazać je strażnikowi do synchronizacji; uzgodnić C-H03-01…02 z właścicielami H18/staff.
2. Zintegrować najnowszy `origin/main` z branchem pakietu przed wydaniem.
3. Zaimplementować backend wyłącznie na istniejącym schemacie i pod flagą H03.
4. Dodać samodzielny komponent/deskryptor H03, a produkcyjne osadzenie przekazać H18.
5. Uruchomić testy H03, pełne testy backendu, Pint, lint, build i scenariusz demo.
6. Rollback polega na wyłączeniu `features.h03` i usunięciu osadzenia slotu H18; nie ma migracji do cofnięcia. Dane utworzone przed rollbackiem pozostają zgodnie z polityką retencji i nie są kasowane automatycznie.
