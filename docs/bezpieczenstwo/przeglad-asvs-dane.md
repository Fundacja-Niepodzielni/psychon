# Przegląd ASVS L2 — walidacja, pliki, konfiguracja, API, dane wrażliwe

Baza pomiaru: gałąź `sprint-2` @ `3463eac`; wiersze dotyczące załączników profilu psychologa zaktualizowano do `8b58c0a` (włączenie szyfrowania załączników), a numery linii odnośników sprawdzono ponownie na `f229ca8`. Przegląd jest statyczny i obejmuje tylko kod oraz
konfigurację w repozytorium. Dokument nie zawiera danych osobowych, adresów hostów, kluczy ani
haseł.

Druga runda (ta sama gałąź): siedem luk naprawiono w kodzie produkcyjnym, a każdą poprawkę pilnuje
wykonywana próba. Wiersze tych luk mają stan „spełnione” i dowód wskazujący poprawkę; stan
sprzed poprawki opisuje kolumna dowodu („przed: …”). Pozostałe luki nie mają jeszcze poprawki ani
próby — ich lista jest w sekcji „Luki bez poprawki”.

## Zakres i metoda

- Rozdziały OWASP ASVS 4.0.3 na poziomie L2:
  - V5 — walidacja, sanityzacja i kodowanie wyjścia;
  - V7 — rejestr zdarzeń (tylko wymagania dotyczące zapisu zdarzeń i obsługi błędów);
  - V8 i V9 — tylko ścieżki kodu obsługujące dane wrażliwe uczestniczek (profil, profil
    psychologa, załączniki, eksport RODO, dokumenty);
  - V12 — pliki: wgrywanie materiałów i załączników, pobieranie podpisanym linkiem,
    certyfikaty PDF;
  - V13 i V14 — API i konfiguracja: nagłówki bezpieczeństwa, CORS, limity żądań, tryb debug.
- Listy kontrolne pomocnicze z serii OWASP Cheat Sheet Series: „Input Validation Cheat Sheet”,
  „File Upload Cheat Sheet”, „REST Security Cheat Sheet”, „HTTP Headers Cheat Sheet”,
  „Logging Cheat Sheet”.
- Dowód ma postać `plik:linia` względem katalogu głównego repozytorium. `brak` oznacza, że
  mechanizmu nie znaleziono; w kolumnie dowodu jest wtedy opisane, gdzie szukano.
- Stan wymagania:
  - **spełnione** — dowód w kodzie;
  - **niespełnione** — luka wskazana dowodem;
  - **nie dotyczy** — w systemie nie ma takiej funkcji;
  - **niezmierzone** — rozstrzyga środowisko uruchomieniowe albo infrastruktura spoza
    repozytorium.
- Ryzyko jest oceniane tylko dla stanu „niespełnione”.
- Próba istnieje tylko dla luki, która ma poprawkę. Leży w `backend/tests/Feature/Bezpieczenstwo/`
  albo w `frontend/__tests__/bezpieczenstwo-naglowki.test.ts`, wykonuje się przy każdym przebiegu
  (bez `markTestIncomplete` i bez `test.todo`) i pilnuje jednego warunku w kodzie produkcyjnym.
  Dowód, że próba mierzy ten warunek: po celowym zepsuciu warunku próba czerwienieje (sekcja
  „Próby i dowód mutacyjny”).

Ograniczenia pomiaru:

- Domyślne ustawienia frameworka (CORS, nagłówki `Cache-Control` odpowiedzi pobierania) opisano
  według dokumentacji Laravel i Symfony. Katalogu `vendor/` nie dało się pobrać w środowisku
  przeglądu.
- Konfiguracji serwera pośredniczącego sprzed aplikacji (CDN, zapora) nie ma w repozytorium.

## Podsumowanie

| Miara | Przed poprawkami | Po poprawkach |
|---|---|---|
| Wymagania zmierzone (wiersze tabel V5–V14) | 112 | 112 |
| spełnione | 51 | 62 |
| niespełnione | 41 | 30 |
| nie dotyczy | 12 | 12 |
| niezmierzone | 8 | 8 |
| Luki o ryzyku wysokim | 4 | 0 |
| Luki o ryzyku średnim | 19 | 12 |
| Luki o ryzyku niskim | 18 | 18 |
| Ustalenia spoza listy ASVS: niespełnione (średnie / niskie) | 3 (1 / 2) | 2 (0 / 2) |
| Ustalenia spoza listy ASVS: niezmierzone | 1 | 1 |
| Próby wykonywane (PHPUnit) | 0 | 15 |
| Próby wykonywane (Vitest) | 0 | 5 |
| Próby niedokończone (`markTestIncomplete`, `test.todo`) | 27 | 0 |

Najpoważniejsza luka (przed poprawką) to V5.2.4, V5.2.5, V5.2.8 i V12.3.6 — jedna przyczyna.
Wzory dokumentów (umowa, zaświadczenie, certyfikat) edytowalne z panelu są kompilowane jako
szablon Blade, więc osoba z rolą `project_manager` mogła zapisać we wzorze dowolny kod PHP. Po
poprawce zapis wzoru przepuszcza tylko komentarze i wstawki pól (`{{ $pole }}`,
`{{ $obiekt->pole }}`, `{{ $pole ?? 'tekst' }}`); dyrektywy, znaczniki PHP, surowe wyjście i
wywołania funkcji kończą się kodem 422.

## V5 — walidacja, sanityzacja i kodowanie wyjścia

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **V5.1.1** Aplikacja broni się przed zanieczyszczeniem parametrów HTTP (wielokrotne i tablicowe parametry). | niespełnione | `backend/app/Queries/AdminUserQuery.php:30`, `:34` i `backend/app/Http/Controllers/Api/V1/Admin/CourseCatalogAdminController.php:88`, `:92` rzutują `$request->query()` na string, więc `?role[]=x` kończy się błędem 500 | niskie | Czytać filtry list przez FormRequest z regułą `string` i `Rule::in`, a tablice w parametrach odrzucać kodem 422. |
| **V5.1.2** Aplikacja chroni przed masowym przypisaniem pól. | spełnione | brak `$guarded = []` i `unguard()` w `backend/app/Models`; zapisy przez `validated()`, np. `backend/app/Http/Controllers/Api/V1/H11/InternshipEntryController.php:52` | — | — |
| **V5.1.3** Każde wejście jest walidowane listą dozwolonych wartości. | niespełnione | 64 klasy w `backend/app/Http/Requests`, ale filtry `role` i `status` list administracji to dowolne ciągi (`backend/app/Queries/AdminUserQuery.php:30`, `:34`) | niskie | Dodać FormRequest dla list administracji z `Rule::in` na słowniki ról i statusów. |
| **V5.1.4** Dane strukturalne są silnie typowane i ograniczone (typy, zakresy, liczność). | niespełnione | `backend/app/Http/Requests/H03/StoreApplicationRequest.php:25` przyjmuje dowolną tablicę `payload` bez reguł zagnieżdżonych; tablice bez `max` w `backend/app/Http/Requests/H08/InviteToCourseRequest.php:22` i `backend/app/Http/Requests/H15/UpdatePsychologistProfileRequest.php:18` | niskie | Dodać `max` liczności tablic i reguły elementów, a `payload` zastąpić listą nazwanych pól. |
| **V5.1.5** Przekierowania i przekazania URL trafiają tylko pod dozwolone adresy. | spełnione | brak parametrów `redirect`/`next`/`returnTo`; `callbackUrl` to stałe ścieżki względne (`frontend/app/logowanie/page.tsx:160`, `:201`) | — | — |
| **V5.2.1** HTML z edytora jest sanityzowany biblioteką przed użyciem. | niespełnione | treść wzoru ma limit długości i listę dozwolonych wstawek (`backend/app/Http/Requests/DocumentTemplates/UpdateDocumentTemplateRequest.php:22`), ale sam HTML nie przechodzi przez sanityzator; renderowanie w `backend/app/Services/DocumentTemplates/DocumentTemplateRenderer.php:41` | średnie | Przepuszczać HTML wzoru przez sanityzator z listą dozwolonych znaczników. |
| **V5.2.2** Dane nieustrukturyzowane mają ograniczone znaki i długość. | niespełnione | pola tekstowe bez `max`: `backend/app/Http/Requests/H08/StoreLessonRequest.php:28`, `backend/app/Http/Requests/H11/StoreInternshipEntryRequest.php:23`, `backend/app/Http/Requests/H15/UpdatePsychologistProfileRequest.php:22`, `backend/app/Http/Requests/H03/RejectApplicationRequest.php:18` | niskie | Dodać `max` do każdego pola tekstowego zgodnie z rozmiarem kolumny. |
| **V5.2.3** Dane trafiające do poczty są oczyszczone przed przekazaniem do systemu pocztowego. | spełnione | adresaci z walidacją `email`; treść jest escapowana `nl2br(e($body))` w `backend/app/Support/Notify.php:53` | — | — |
| **V5.2.4** Aplikacja nie wykonuje kodu dynamicznie, a jeśli musi, dane wejściowe są odizolowane. | spełnione | zapis wzoru przepuszcza tylko listę dozwolonych wstawek: `backend/app/Rules/SafeDocumentTemplate.php:27`–`:60`, użyta w `backend/app/Http/Requests/DocumentTemplates/UpdateDocumentTemplateRequest.php:22`; przed: `Blade::render($template->content, $data)` (`backend/app/Services/DocumentTemplates/DocumentTemplateRenderer.php:41`) wykonywał dowolną treść z bazy. Wzorów zapisanych przed poprawką reguła nie sprawdza — zapisać mógł je tylko seeder z plików repozytorium | — | — |
| **V5.2.5** Aplikacja chroni przed wstrzyknięciem szablonu. | spełnione | dyrektywy (`@php`, `@include` i inne), `<?`, `{!! !!}` i wstawki spoza wzorca pola są odrzucane kodem 422: `backend/app/Rules/SafeDocumentTemplate.php:35`–`:59`; przed: zapis bez ograniczeń w `backend/app/Http/Controllers/Api/V1/DocumentTemplateController.php:36` (trasa `backend/routes/api/document_templates.php:25`–`:27`) | — | — |
| **V5.2.6** Aplikacja chroni przed SSRF (adresy z danych wejściowych). | spełnione | serwer nie pobiera adresów podanych przez użytkownika; generator PDF ma `setIsRemoteEnabled(false)` w `backend/app/Support/PdfService.php:54` | — | — |
| **V5.2.7** Treść SVG od użytkownika jest oczyszczana z elementów skryptowych. | spełnione | listy typów nie obejmują SVG: `backend/app/Http/Requests/H15/StoreProfileDocumentRequest.php:19`, `backend/app/Http/Requests/H08/StoreMaterialRequest.php:31` | — | — |
| **V5.2.8** Treść w językach szablonów i wyrażeń od użytkownika jest oczyszczona lub odizolowana. | spełnione | wstawka musi pasować do wzorca pola bez wywołań (`backend/app/Rules/SafeDocumentTemplate.php:25`); wzór certyfikatu z pliku ma blok `@php` (`backend/resources/views/pdf/certificate.blade.php:1`), więc datę wydania podaje teraz generator (`backend/app/Jobs/GenerateCertificate.php:140`) i wzór bez tego bloku przechodzi walidację | — | — |
| **V5.3.1** Kodowanie wyjścia odpowiada interpreterowi i kontekstowi. | spełnione | helper CSV poprzedza apostrofem tekst zaczynający się od `=`, `+`, `-`, `@`, tabulatora albo CR: `backend/app/Support/Csv.php:48`–`:57`, wywołanie `:31`; przed: komórki bez neutralizacji, a imię i nazwisko ustawia sama osoba (`backend/app/Http/Requests/H01/UpdateProfileRequest.php:28`) | — | — |
| **V5.3.2** Kodowanie wyjścia zachowuje zestaw znaków. | spełnione | JSON w UTF-8; CSV z BOM i `charset=utf-8` w `backend/app/Support/Csv.php:38` | — | — |
| **V5.3.3** Wyjście jest escapowane zależnie od kontekstu (ochrona przed XSS). | spełnione | treści użytkowników renderowane jako węzły tekstowe React, np. `frontend/components/chat/InstructorGroupThread.tsx:310`–`:313`; jedyne `dangerouslySetInnerHTML` (`frontend/app/(administracja)/admin/emails/page.tsx:209`) dostaje HTML escapowany w `backend/app/Support/Notify.php:53`; szablony Blade używają tylko `{{ }}` | — | — |
| **V5.3.4** Zapytania do bazy są parametryzowane. | spełnione | surowe zapytania tylko z wiązaniem parametrów, np. `backend/app/Http/Controllers/Api/V1/Admin/ApplicationController.php:82` (`whereRaw('LOWER(email) = ?', …)`) | — | — |
| **V5.3.5** Tam, gdzie nie ma parametryzacji, stosowane jest kodowanie kontekstowe SQL. | spełnione | sortowanie z listą dozwolonych kolumn i kierunków: `backend/app/Http/Controllers/Api/V1/Admin/CourseCatalogAdminController.php:115`–`:124`, `backend/app/Queries/AdminUserQuery.php:21` | — | — |
| **V5.3.6** Aplikacja chroni przed wstrzyknięciem JSON i nie wykonuje JSON jako kodu. | spełnione | odpowiedzi przez `response()->json`; frontend parsuje `res.json()` (`frontend/lib/api/klient.ts:62`) | — | — |
| **V5.3.7** Aplikacja chroni przed wstrzyknięciem LDAP. | nie dotyczy | brak integracji LDAP (tożsamość przez OIDC) | — | — |
| **V5.3.8** Aplikacja chroni przed wstrzyknięciem poleceń systemu. | spełnione | brak `exec`, `shell_exec`, `proc_open`, `system`, `passthru` w `backend/app`, `backend/routes`, `backend/config` | — | — |
| **V5.3.9** Aplikacja chroni przed dołączaniem plików lokalnych i zdalnych (LFI/RFI). | spełnione | ścieżki plików tylko z bazy, np. `backend/app/Http/Controllers/Api/V1/MaterialDownloadController.php:48`; skan dyplomu dodatkowo sprawdzany `realpath` w `backend/app/Services/H03/DiplomaScanAccess.php:32`–`:36`. Wzory Blade z bazy przechodzą listę dozwolonych wstawek (V5.2.5). | — | — |
| **V5.3.10** Aplikacja chroni przed wstrzyknięciem XPath i XML. | nie dotyczy | brak parsowania XML (`simplexml_load`, `DOMDocument`) w `backend/app` | — | — |
| **V5.4.1** Aplikacja używa bezpiecznego operowania na pamięci i buforach. | nie dotyczy | PHP i TypeScript zarządzają pamięcią | — | — |
| **V5.4.2** Łańcuchy formatujące nie przyjmują danych wrogich. | nie dotyczy | brak funkcji `printf` z formatem pochodzącym od użytkownika | — | — |
| **V5.4.3** Aplikacja chroni przed przepełnieniem liczb całkowitych. | nie dotyczy | języki zarządzane; liczby z walidacją `integer` i zakresem | — | — |
| **V5.5.1** Obiekty serializowane mają kontrolę integralności lub są szyfrowane. | spełnione | aplikacja nie przyjmuje serializowanych obiektów od klienta; brak `unserialize` w `backend/app` | — | — |
| **V5.5.2** Parsery XML mają wyłączone encje zewnętrzne (XXE). | nie dotyczy | brak parsowania XML w `backend/app` | — | — |
| **V5.5.3** Deserializacja niezaufanych danych jest unikana lub chroniona. | spełnione | wejście tylko jako JSON lub multipart; brak `unserialize` | — | — |
| **V5.5.4** JSON w przeglądarce jest parsowany bez `eval`. | spełnione | brak `eval` w `frontend/app`, `frontend/components`, `frontend/lib` | — | — |

## V7 — rejestr zdarzeń i obsługa błędów

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **V7.1.1** Log nie zawiera poświadczeń ani tokenów sesji. | spełnione | wywołania `Log::` przekazują identyfikatory i klasy wyjątków, np. `backend/app/Services/H03/ApplicationInvitationMailer.php:49`–`:53`; brak nagłówka `Authorization` w logach | — | — |
| **V7.1.2** Log nie zawiera innych danych wrażliwych w rozumieniu przepisów o ochronie danych. | niespełnione | wolny tekst powodu trafia do ładunku audytu, którego nie da się wyczyścić: `backend/app/Http/Controllers/Api/V1/Admin/AdminUserController.php:190`–`:192`, `backend/app/Services/H13/CertificateRevoker.php:50`–`:53`, `backend/app/Http/Controllers/Api/V1/AdminTestResetController.php:36`–`:38`; `AuditLog::record` nie ma listy dozwolonych kluczy (`backend/app/Support/AuditLog.php:21`–`:34`) | średnie | Zapisywać powód w rekordzie dziedzinowym, a w ładunku audytu tylko identyfikator (wzorzec `profile.returned`). |
| **V7.1.3** Log obejmuje zdarzenia bezpieczeństwa: uwierzytelnienie, odmowy dostępu, błędy walidacji. | niespełnione | brak zapisu odmów 401 i 403 w `backend/app/Http/Middleware/AuthenticateKeycloakToken.php` i `backend/app/Http/Middleware/EnsureRole.php`; renderer błędów niczego nie zapisuje (`backend/app/Exceptions/ApiExceptionRenderer.php`) | średnie | Dodać zapis ostrzeżenia z identyfikatorem użytkownika, trasą i kodem przy każdej odmowie 401 i 403. |
| **V7.1.4** Każde zdarzenie ma dane potrzebne do odtworzenia przebiegu. | spełnione | wpis audytu ma `actor_id`, `action`, `subject_type`, `subject_id`, `created_at` (`backend/app/Support/AuditLog.php:27`–`:33`) | — | — |
| **V7.2.1** Każda decyzja uwierzytelnienia jest rejestrowana bez zapisywania tokenów. | niespełnione | odrzucenie tokenu zwraca 401 bez zapisu: `backend/app/Http/Middleware/AuthenticateKeycloakToken.php:46`–`:51` | średnie | Zapisywać odrzucenie tokenu z przyczyną (`reason.cause`) i bez samego tokenu. |
| **V7.2.2** Decyzje kontroli dostępu da się rejestrować, a odmowy są rejestrowane zawsze. | niespełnione | odmowa roli kończy się 403 bez zapisu (`backend/app/Http/Middleware/EnsureRole.php`) | średnie | W `EnsureRole` i politykach zapisywać odmowę z rolą, trasą i identyfikatorem zasobu. |
| **V7.3.1** Dane w logach są kodowane, co chroni przed wstrzyknięciem do logu. | spełnione | ładunek audytu w kolumnie JSON; logi plikowe przez formatery Monolog (`backend/config/logging.php:61`–`:66`) | — | — |
| **V7.3.4** Źródła czasu są zsynchronizowane. | niezmierzone | synchronizacja czasu zależy od hosta, poza repozytorium | — | — |
| **V7.4.1** Nieoczekiwany błąd daje ogólny komunikat z identyfikatorem do zgłoszenia. | niespełnione | ogólny komunikat 500 bez identyfikatora zdarzenia (`backend/app/Exceptions/ApiExceptionRenderer.php:81`–`:85`); treść `HttpException` wraca bez zmian niezależnie od trybu debug (`:76`–`:80`) | niskie | Dodać identyfikator korelacji do koperty błędu 500 i do wpisu w logu. |
| **V7.4.2** Obsługa wyjątków jest jednolita w całym kodzie. | spełnione | jeden renderer koperty błędu: `backend/bootstrap/app.php:38`–`:46` | — | — |
| **V7.4.3** Istnieje ostatni poziom obsługi błędów. | spełnione | gałąź `default` w `backend/app/Exceptions/ApiExceptionRenderer.php:81`–`:85` | — | — |

## V8 — ochrona danych (dane wrażliwe uczestniczek)

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **V8.1.1** Dane wrażliwe nie są buforowane w komponentach serwerowych (pamięci podręczne, pośredniki). | spełnione | każda odpowiedź API, także pobranie pliku, dostaje `Cache-Control: no-store, private` (`backend/app/Http/Middleware/SecurityHeaders.php:30`, zarejestrowane globalnie dla `api/*` w `backend/bootstrap/app.php:29`); przed: skan dyplomu przez `response()->download()` (`backend/app/Http/Controllers/Api/V1/Admin/ApplicationController.php:153`–`:156`) był domyślnie `public` | — | — |
| **V8.1.2** Kopie tymczasowe danych wrażliwych na serwerze są chronione lub usuwane. | spełnione | eksport RODO ma TTL (`backend/config/exports.php:18`); pliki po terminie usuwa co godzinę `backend/app/Console/Commands/PurgeExpiredDataExports.php:36`–`:47` (harmonogram `backend/routes/console.php:16`) | — | — |
| **V8.1.3** Żądania zawierają minimum parametrów wrażliwych. | spełnione | uwierzytelnienie wyłącznie nagłówkiem Bearer; brak danych osobowych w ukrytych polach i ciasteczkach API | — | — |
| **V8.1.4** Aplikacja wykrywa nienaturalną liczbę żądań i alarmuje o niej. | niespełnione | limity na pięciu trasach: `backend/routes/api/sso.php:34`, `backend/routes/api/h03.php:27`, `backend/routes/api/h01.php:34` oraz — po poprawce — publiczna weryfikacja certyfikatu (`backend/routes/api/h13.php:46`) i wgrywanie załączników profilu (`backend/routes/api/h15.php:31`); nadal brak domyślnego limitera całego API i alarmu | średnie | Włączyć domyślny limiter dla całego API i alarmować o przekroczeniach w logu. |
| **V8.2.1** Odpowiedzi z danymi wrażliwymi mają nagłówki zabraniające buforowania. | spełnione | `Cache-Control: no-store, private` na każdej odpowiedzi `api/*`, także na kopercie błędu (`backend/app/Http/Middleware/SecurityHeaders.php:30`); przed: jedyny taki nagłówek był w `backend/app/Http/Controllers/Oidc/BackchannelLogoutController.php:113` | — | — |
| **V8.2.2** Pamięć przeglądarki nie zawiera danych wrażliwych. | spełnione | `localStorage` tylko dla stanu menu (`frontend/components/organisms/PanelNav.tsx:51`, `:65`); token w pamięci modułu (`frontend/lib/api/klient.ts:54`) | — | — |
| **V8.2.3** Dane uwierzytelnione są usuwane z pamięci klienta po zakończeniu sesji. | spełnione | `invalidateSessionCache` zeruje token w `frontend/lib/api/klient.ts:105`–`:108` | — | — |
| **V8.3.1** Dane wrażliwe są przesyłane w treści lub nagłówkach, nie w adresie. | niespełnione | wyszukiwanie po imieniu i adresie e-mail w `?search=` (`backend/app/Queries/AdminUserQuery.php:38`, `backend/app/Http/Controllers/Api/V1/Admin/ApplicationController.php:40`) | niskie | Przenieść wyszukiwanie osób do `POST` z treścią albo wyłączyć zapis zapytań w logach pośrednika. |
| **V8.3.2** Osoba może wyeksportować albo usunąć swoje dane. | spełnione | eksport `POST /me/exports` (`backend/routes/api/h01.php:33`); anonimizacja konta w `backend/app/Services/H18/UserAnonymizer.php:82`–`:94` | — | — |
| **V8.3.3** Osoba dostaje jasną informację o zbieraniu i użyciu danych. | spełnione | dokumenty prawne z wersjonowaniem i akceptacją (trasy `backend/routes/api/h22.php:28`–`:29`) | — | — |
| **V8.3.4** Dane wrażliwe są zidentyfikowane i objęte polityką. | niezmierzone | polityka klasyfikacji danych jest dokumentem organizacyjnym spoza repozytorium | — | — |
| **V8.3.5** Dostęp do danych wrażliwych jest audytowany (bez zapisu samych danych). | niespełnione | wgląd zapisywany tylko dla skanu dyplomu (`backend/app/Services/H03/DiplomaScanAccess.php:42`–`:48`) i załącznika profilu (`backend/app/Http/Controllers/Api/V1/H15/AdminProfileController.php:149`–`:158`); karta osoby z pełnym PESEL (`backend/app/Http/Controllers/Api/V1/Admin/AdminUserController.php:54`–`:65`) i eksport CSV osób (`:227`) bez śladu | średnie | Zapisywać `sensitive.viewed` przy odczycie karty osoby i przy eksporcie CSV. |
| **V8.3.6** Dane wrażliwe w pamięci są nadpisywane po użyciu. | nie dotyczy | PHP i JavaScript nie dają kontroli nad zwalnianiem pamięci | — | — |
| **V8.3.7** Dane wrażliwe są szyfrowane zatwierdzonym algorytmem. | niespełnione | PESEL i adres szyfrowane w bazie (`backend/app/Models/User.php:49`–`:52`); załączniki profilu szyfrowane przed zapisem (`backend/app/Http/Controllers/Api/V1/H15/PsychologistProfileController.php:165`–`:172`, `backend/app/Services/H15/ProfileDocumentCipher.php:30`); jawny na dysku pozostaje eksport RODO z PESEL (`backend/app/Jobs/GenerateDataExport.php:44`–`:52`) | średnie | Szyfrować plik eksportu RODO przed zapisem tym samym mechanizmem co załączniki profilu i odszyfrowywać przy pobraniu. |
| **V8.3.8** Dane osobowe mają zasady retencji, a nieaktualne są usuwane. | niespełnione | wycofanie zgody nie usuwa załączników ani treści profilu (`backend/app/Http/Controllers/Api/V1/H15/PsychologistProfileController.php:174`–`:211`); anonimizacja pomija treści profilu psychologa i zgłoszenia (`backend/app/Services/H18/UserAnonymizer.php:82`–`:94`) | średnie | Rozszerzyć anonimizację o profil psychologa, zgłoszenie i treści e-maili, a przy wycofaniu zgody usuwać załączniki. |

## V9 — komunikacja

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **V9.1.1** Połączenia klientów idą wyłącznie przez TLS, bez powrotu do połączeń jawnych. | spełnione | przekierowanie z portu 80 na HTTPS w `deploy/psychon-dev/Caddyfile:40`–`:41`; TLS na `:44`–`:50` | — | — |
| **V9.1.2** Włączone są tylko silne zestawy szyfrów. | niezmierzone | zestawy szyfrów to ustawienia domyślne serwera pośredniczącego; nie są jawnie skonfigurowane w repozytorium | — | — |
| **V9.1.3** Włączone są tylko zalecane wersje TLS. | niezmierzone | jak wyżej; weryfikacja wymaga skanu działającej usługi | — | — |
| **V9.2.1** Połączenia serwera używają zaufanych certyfikatów. | spełnione | weryfikacja TLS dostawcy tożsamości włączona domyślnie; wyłącznik `keycloak.insecure_tls` ma domyślnie `false` (`backend/config/keycloak.php:91`, użycie `backend/app/Services/Keycloak/KeycloakDiscovery.php:116`–`:123`) | — | — |
| **V9.2.2** TLS obejmuje połączenia przychodzące i wychodzące, także do bazy. | niespełnione | `sslmode` bazy domyślnie `prefer` (`backend/config/database.php:99`); ruch z serwera pośredniczącego do aplikacji jawny w sieci kontenerów (`deploy/psychon-dev/Caddyfile:84`) | niskie | Ustawić `DB_SSLMODE=verify-full` tam, gdzie baza stoi poza siecią kontenerów. |
| **V9.2.3** Połączenia z systemami zewnętrznymi przenoszące dane wrażliwe są uwierzytelnione. | spełnione | wywołania do dostawcy wideo z kluczem API przez HTTPS z domyślną weryfikacją (`backend/app/Http/Controllers/Api/V1/Admin/BunnyVideoAdminController.php:78`) | — | — |
| **V9.2.4** Sprawdzane jest unieważnienie certyfikatów (OCSP). | niezmierzone | zależy od serwera pośredniczącego i biblioteki HTTP w czasie działania | — | — |

## V12 — pliki i zasoby

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **V12.1.1** Aplikacja nie przyjmuje plików tak dużych, że zapełnią dysk lub spowodują odmowę usługi. | spełnione | limity rozmiaru: materiał 10 MB (`backend/app/Http/Requests/H08/StoreMaterialRequest.php:21`, `:31`), załącznik profilu 10 MB (`backend/app/Http/Requests/H15/StoreProfileDocumentRequest.php:19`), import CSV 5 MB (`backend/app/Http/Requests/H03/ImportApplicationsRequest.php:18`) | — | — |
| **V12.1.2** Pliki skompresowane są sprawdzane pod kątem bomb dekompresyjnych. | nie dotyczy | żaden endpoint nie przyjmuje archiwów | — | — |
| **V12.1.3** Obowiązuje limit rozmiaru i liczby plików na osobę. | spełnione | wniosek ma najwyżej 10 załączników, sprawdzane przed zapisem pliku (`backend/app/Http/Controllers/Api/V1/H15/PsychologistProfileController.php:28`, `:137`–`:141`), po 10 MB każdy (V12.1.1); przed: brak limitu liczby. Import CSV administracji nadal nie ma limitu wierszy (`backend/app/Services/H03/ApplicationCsvImporter.php:64`) — plik jest ograniczony do 5 MB | — | — |
| **V12.2.1** Typ pliku z niezaufanego źródła jest sprawdzany po treści. | spełnione | reguła `mimes` rozpoznaje typ po treści pliku (`backend/app/Http/Requests/H15/StoreProfileDocumentRequest.php:19`, `backend/app/Http/Requests/H08/StoreMaterialRequest.php:31`) | — | — |
| **V12.3.1** Nazwa pliku od użytkownika nie trafia bezpośrednio do systemu plików. | spełnione | nazwa na dysku to ULID z uproszczoną nazwą (`backend/app/Services/H08/MaterialStore.php:96`–`:101`) albo losowa nazwa (`backend/app/Http/Controllers/Api/V1/H15/PsychologistProfileController.php:166`–`:167`) | — | — |
| **V12.3.2** Metadane nazwy pliku nie pozwalają na odczyt lub zapis plików lokalnych. | spełnione | ścieżki pobierania z bazy, nigdy z żądania: `backend/app/Http/Controllers/Api/V1/MaterialDownloadController.php:48`, `backend/app/Http/Controllers/Api/V1/CertificateController.php:66` | — | — |
| **V12.3.3** Metadane nazwy pliku nie pozwalają na dołączanie zdalnych plików ani SSRF. | spełnione | nazwa pliku nie jest używana jako adres; generator PDF bez zasobów zdalnych (`backend/app/Support/PdfService.php:54`) | — | — |
| **V12.3.4** Nazwy plików w odpowiedziach są stałe albo oczyszczone (ochrona przed RFD). | niespełnione | nazwa pobieranego materiału to oryginalna nazwa klienta (`backend/app/Services/H08/MaterialStore.php:68`, `:73` → `backend/app/Http/Controllers/Api/V1/MaterialDownloadController.php:52`); rozszerzenie na dysku też od klienta (`backend/app/Services/H08/MaterialStore.php:99`) | niskie | Budować nazwę pobrania z uproszczonej nazwy i rozszerzenia wynikającego z wykrytego typu. |
| **V12.3.5** Metadane pliku nie trafiają do poleceń systemu. | spełnione | brak wywołań poleceń systemu w `backend/app` | — | — |
| **V12.3.6** Aplikacja nie dołącza ani nie wykonuje funkcji z niezaufanych źródeł. | spełnione | jak V5.2.4: wzór z bazy może zawierać tylko wstawki pól (`backend/app/Rules/SafeDocumentTemplate.php:27`–`:60`); przed: dowolna treść kompilowana do PHP (`backend/app/Services/DocumentTemplates/DocumentTemplateRenderer.php:41`) | — | — |
| **V12.4.1** Pliki z niezaufanych źródeł leżą poza katalogiem publicznym, z ograniczonymi uprawnieniami. | spełnione | dysk `local` w `storage/app/private` (`backend/config/filesystems.php:33`–`:35`) | — | — |
| **V12.4.2** Pliki z niezaufanych źródeł są skanowane programem antywirusowym. | niespełnione | brak skanowania w ścieżkach wgrywania (`backend/app/Services/H08/MaterialStore.php:65`–`:83`, `backend/app/Http/Controllers/Api/V1/H15/PsychologistProfileController.php:122`–`:155`) | średnie | Skanować plik przed zapisem (np. usługą antywirusową w sieci kontenerów) i odrzucać zainfekowane z kodem 422. |
| **V12.5.1** Warstwa webowa serwuje tylko pliki o określonych rozszerzeniach. | niespełnione | dysk prywatny ma `'serve' => true` (`backend/config/filesystems.php:36`), co rejestruje zbędną trasę serwowania plików poza listą tras publicznych | niskie | Ustawić `'serve' => false`, bo aplikacja nie wystawia tymczasowych adresów do dysku. |
| **V12.5.2** Wgrane pliki nigdy nie są wykonywane jako HTML ani JavaScript. | spełnione | wszystkie pobrania mają nagłówek `attachment` (np. `backend/app/Http/Controllers/Api/V1/DocumentController.php:88`–`:93`); brak serwowania plików `inline` | — | — |
| **V12.6.1** Serwer wysyła żądania tylko do dozwolonych zasobów (SSRF). | spełnione | ruch wychodzący tylko do adresów z konfiguracji (dostawca tożsamości, dostawca wideo); generator PDF bez zasobów zdalnych (`backend/app/Support/PdfService.php:54`) | — | — |

## V13 — API i usługi sieciowe

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **V13.1.1** Wszystkie składniki używają tych samych kodowań i parserów. | spełnione | wejście i wyjście JSON w UTF-8; koperta błędów w `backend/bootstrap/app.php:38`–`:46` | — | — |
| **V13.1.3** Adresy API nie ujawniają informacji wrażliwych (klucze, tokeny sesji). | niespełnione | podpis linku do pobrania materiału działa jak token w adresie przez 5 minut, bez uwierzytelnienia (`backend/routes/api/h05.php:30`–`:32`, `backend/config/courses.php:19`); wyszukiwanie osób w adresie (V8.3.1) | niskie | Skrócić ważność podpisu i wiązać pobranie z tokenem Bearer tam, gdzie klient może go przesłać. |
| **V13.1.4** Autoryzacja jest sprawdzana na poziomie trasy i zasobu. | spełnione | middleware ról na grupach tras (np. `backend/routes/api/h18.php:24`) i sprawdzenie własności zasobu (np. `backend/app/Http/Controllers/Api/V1/ProfileController.php:148`–`:153`, `backend/app/Policies/DocumentPolicy.php:22`–`:23`) | — | — |
| **V13.1.5** Żądania z nieoczekiwanym typem treści są odrzucane (406/415). | niespełnione | brak globalnej kontroli `Content-Type`; tylko `backend/app/Http/Controllers/Api/V1/Admin/BunnyVideoAdminController.php:60`–`:61` odrzuca treść inną niż JSON | niskie | Dodać middleware odrzucające kodem 415 treść inną niż JSON lub multipart na trasach zapisu. |
| **V13.2.1** Włączone metody HTTP odpowiadają akcjom. | spełnione | tylko jawne `Route::get/post/put/patch/delete`; brak `Route::any` i `Route::match` w `backend/routes`; zła metoda daje 405 (`backend/app/Exceptions/ApiExceptionRenderer.php:71`–`:75`) | — | — |
| **V13.2.2** Wejście JSON jest walidowane schematem przed przyjęciem. | spełnione | FormRequest na trasach zapisu (64 klasy w `backend/app/Http/Requests`); wyjątki opisano w V5.1.1 i V5.1.3 | — | — |
| **V13.2.3** Usługi REST oparte na ciasteczkach są chronione przed CSRF. | spełnione | API uwierzytelnia wyłącznie nagłówkiem Bearer (`backend/app/Http/Middleware/AuthenticateKeycloakToken.php:37`–`:40`); serwer pośredniczący usuwa ciasteczka przed API (`deploy/psychon-dev/Caddyfile:84`–`:85`) | — | — |
| **V13.2.5** Usługa sprawdza, czy `Content-Type` żądania jest oczekiwany. | niespełnione | jak V13.1.5 | niskie | Jak V13.1.5. |
| **V13.2.6** Nagłówki i treść nie są modyfikowane w drodze. | niezmierzone | zależy od TLS na zewnątrz i w sieci kontenerów (V9.2.2) | — | — |
| **V13.3.1** Usługi SOAP walidują XSD. | nie dotyczy | brak SOAP | — | — |
| **V13.4.1** GraphQL ma limity złożoności zapytań. | nie dotyczy | brak GraphQL | — | — |

## V14 — konfiguracja

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **V14.1.1** Budowanie i wdrożenie są bezpieczne i powtarzalne. | spełnione | skrypt wdrożenia `deploy/psychon-dev/deploy.sh` z `composer install --no-dev` (`:229`); budowanie w CI | — | — |
| **V14.1.2** Flagi kompilatora włączają ochrony. | nie dotyczy | brak kodu kompilowanego natywnie | — | — |
| **V14.1.3** Konfiguracja serwera jest utwardzona według zaleceń. | niezmierzone | serwer PHP i nginx pochodzą z gotowego obrazu (`docker-compose.yml:5`); ustawienia obrazu poza repozytorium | — | — |
| **V14.1.4** Aplikację, konfigurację i zależności da się odtworzyć skryptem. | spełnione | `docker-compose*.yml`, `deploy/psychon-dev/deploy.sh`, pliki blokad zależności | — | — |
| **V14.2.1** Wszystkie składniki są aktualne. | spełnione | `composer audit --locked`: „No security vulnerability advisories found.”; `npm audit --omit=dev`: „found 0 vulnerabilities” (pomiar przy bazie `3463eac`) | — | — |
| **V14.2.2** Zbędne funkcje, przykłady i dokumentacja są usunięte. | niespełnione | domyślna strona powitalna z wersją frameworka (`backend/resources/views/welcome.blade.php:120`, trasa `backend/routes/web.php:6`–`:8`) | niskie | Usunąć stronę powitalną albo zwracać na `/` pustą odpowiedź 404. |
| **V14.2.3** Zasoby z CDN mają kontrolę integralności (SRI). | nie dotyczy | frontend nie ładuje skryptów ani styli z zewnętrznych CDN | — | — |
| **V14.2.4** Składniki pochodzą z zaufanych, zdefiniowanych repozytoriów. | spełnione | `composer.lock` i `frontend/package-lock.json` z rejestrów Packagist i npm | — | — |
| **V14.2.5** Istnieje wykaz składników zewnętrznych (SBOM). | niespełnione | brak generowanego SBOM; wykazem są tylko pliki blokad | niskie | Generować SBOM (CycloneDX) z plików blokad przy każdym wydaniu. |
| **V14.2.6** Powierzchnia ataku bibliotek zewnętrznych jest ograniczona izolacją. | niezmierzone | ocena projektowa bez mierzalnego kryterium w repozytorium | — | — |
| **V14.3.2** Tryb debug jest wyłączony w produkcji. | spełnione | `APP_DEBUG` domyślnie `false` (`backend/config/app.php:42`); `docker-compose.psychon-dev.yml:23` ustawia `"false"` | — | — |
| **V14.3.3** Nagłówki i odpowiedzi nie ujawniają wersji składników. | niespełnione | brak `poweredByHeader: false` (`frontend/next.config.ts:18`–`:22`), więc Next wysyła `X-Powered-By`; wersja frameworka na stronie `/` (`backend/resources/views/welcome.blade.php:120`) | niskie | Ustawić `poweredByHeader: false` i usunąć stronę powitalną. |
| **V14.4.1** Każda odpowiedź ma `Content-Type` z bezpiecznym zestawem znaków. | spełnione | JSON przez `response()->json`; CSV z `charset=utf-8` (`backend/app/Support/Csv.php:38`); PDF z `application/pdf` (`backend/app/Http/Controllers/Api/V1/DocumentController.php:91`) | — | — |
| **V14.4.2** Odpowiedzi API mają `Content-Disposition: attachment` z bezpieczną nazwą. | niespełnione | odpowiedzi JSON bez `Content-Disposition` | niskie | Dodać `Content-Disposition: attachment; filename="api.json"` w middleware odpowiedzi API. |
| **V14.4.3** Odpowiedź ma nagłówek Content-Security-Policy. | niespełnione | API ma `default-src 'none'; frame-ancestors 'none'` dla JSON (`backend/app/Http/Middleware/SecurityHeaders.php:35`–`:42`); strony Next mają CSP tylko z `frame-ancestors 'none'` (`frontend/next.config.ts:11`), bez `script-src`, więc nie ograniczają skutków XSS | średnie | Dodać w Next CSP z nonce'ami dla skryptów (`script-src 'nonce-…' 'strict-dynamic'`). |
| **V14.4.4** Odpowiedź ma `X-Content-Type-Options: nosniff`. | spełnione | każda odpowiedź API (`backend/app/Http/Middleware/SecurityHeaders.php:31`) i każda strona Next (`frontend/next.config.ts:13`); przed: tylko pobranie skanu dyplomu (`backend/app/Http/Controllers/Api/V1/Admin/ApplicationController.php:155`) | — | — |
| **V14.4.5** Odpowiedź ma nagłówek HSTS. | niespełnione | `Strict-Transport-Security: max-age=31536000` w API (`backend/app/Http/Middleware/SecurityHeaders.php:34`) i w Next (`frontend/next.config.ts:15`); bez `includeSubDomains`, którego wymaga wymaganie — decyzja należy do właściciela domeny, bo obejmie wszystkie poddomeny | niskie | Po potwierdzeniu, że wszystkie poddomeny działają na HTTPS, dopisać `includeSubDomains`. |
| **V14.4.6** Odpowiedź ma odpowiedni nagłówek Referrer-Policy. | spełnione | `no-referrer` w API (`backend/app/Http/Middleware/SecurityHeaders.php:33`), `strict-origin-when-cross-origin` w Next (`frontend/next.config.ts:14`); przed: brak we wszystkich warstwach | — | — |
| **V14.4.7** Treść da się osadzić tylko na dozwolonych stronach (`frame-ancestors`, `X-Frame-Options`). | spełnione | `X-Frame-Options: DENY` i `frame-ancestors 'none'` w API (`backend/app/Http/Middleware/SecurityHeaders.php:32`, `:35`–`:42`) i w Next (`frontend/next.config.ts:11`–`:12`); przed: brak we wszystkich warstwach | — | — |
| **V14.5.1** Serwer przyjmuje tylko używane metody HTTP. | spełnione | jak V13.2.1 | — | — |
| **V14.5.2** Nagłówek `Origin` nie służy do uwierzytelniania ani kontroli dostępu. | spełnione | uwierzytelnianie wyłącznie tokenem Bearer (`backend/app/Http/Middleware/AuthenticateKeycloakToken.php:37`–`:40`) | — | — |
| **V14.5.3** CORS dopuszcza tylko zaufane źródła z listy. | niespełnione | brak `backend/config/cors.php`, więc działa domyślna konfiguracja frameworka z `allowed_origins` = `*` dla `api/*` | średnie | Dodać `config/cors.php` z listą dozwolonych źródeł czytaną ze zmiennej środowiskowej. |
| **V14.5.4** Nagłówki dodawane przez zaufany pośrednik lub SSO są uwierzytelniane przez aplikację. | niespełnione | brak konfiguracji zaufanych pośredników w `backend/bootstrap/app.php:19`–`:36`; limity żądań liczą się wtedy po adresie pośrednika, a nie klienta | niskie | Skonfigurować `trustProxies` tylko dla adresów sieci pośrednika. |

## Ustalenia spoza listy ASVS

Każde ustalenie ma identyfikator używany w próbach.

| Ustalenie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **D-1** Unieważniony certyfikat nadal można pobrać. | spełnione | pobranie pomija unieważnione certyfikaty i zwraca 404: `backend/app/Http/Controllers/Api/V1/CertificateController.php:57`; przed: zapytanie bez warunku na `revoked_at` | — | — |
| **D-2** Pomocnik pobierania dokleja token Bearer do dowolnego adresu. | niespełnione | `downloadFile` nie sprawdza pochodzenia adresu: `frontend/lib/api/pliki.ts:13`–`:18` | niskie | Dołączać token tylko dla adresów względnych albo o tym samym pochodzeniu co API. |
| **D-3** Film powitalny osadzany jest bez atrybutu `sandbox`, z dowolnego źródła https. | niespełnione | `frontend/components/onboarding/OnboardingView.tsx:26`–`:27`; reguła `url` bez ograniczenia hosta w `backend/app/Http/Requests/H21/UpdateOnboardingRequest.php:25` | niskie | Ograniczyć adres do listy dostawców wideo i dodać `sandbox` do elementu `iframe`. |
| **D-4** Kopie zapasowe plików z danymi osobowymi nie są szyfrowane. | niezmierzone | skrypt kopii `deploy/prod/kopia-nocna.sh:28`, `:48` tworzy archiwum bez szyfrowania; ochrona dostępu do katalogu kopii jest poza repozytorium | — | — |

## Luki bez poprawki

Te luki nie mają jeszcze poprawki, więc nie mają też próby — próba bez poprawki mogłaby być tylko
czerwona albo niedokończona. Każda dostanie próbę razem z poprawką.

| Ryzyko | Wiersze |
|---|---|
| średnie | V5.2.1 (sanityzacja HTML wzoru), V7.1.2 (wolny tekst w ładunku audytu), V7.1.3, V7.2.1, V7.2.2 (zapis odmów 401 i 403), V8.1.4 (limit całego API i alarm), V8.3.5 (audyt odczytu karty osoby i eksportu CSV), V8.3.7 (szyfrowanie eksportu RODO), V8.3.8 (usuwanie danych przy wycofaniu zgody i anonimizacji), V12.4.2 (skanowanie antywirusowe), V14.4.3 (CSP ze `script-src` w Next), V14.5.3 (lista źródeł CORS) |
| niskie | V5.1.1, V5.1.3, V5.1.4, V5.2.2, V7.4.1, V8.3.1, V9.2.2, V12.3.4, V12.5.1, V13.1.3, V13.1.5, V13.2.5, V14.2.2, V14.2.5, V14.3.3, V14.4.2, V14.4.5, V14.5.4, D-2, D-3 |

## Próby i dowód mutacyjny

Każda próba wykonuje się przy każdym przebiegu i pilnuje jednego warunku w kodzie produkcyjnym.
Kolumna „Mutacja” mówi, jak warunek zepsuto, żeby sprawdzić, że próba wtedy czerwienieje. Wynik
mutacji jest w opisie zmiany (wiersze podsumowania przebiegów).

| Wiersz | Próba | Pilnowany warunek | Mutacja |
|---|---|---|---|
| V5.2.4, V5.2.5, V12.3.6 | `backend/tests/Feature/Bezpieczenstwo/SzablonyDokumentowTest.php` `test_wzor_z_kodem_php_jest_odrzucany` | `SafeDocumentTemplate` w `UpdateDocumentTemplateRequest` | reguła usunięta z listy reguł `content` |
| V5.2.5 | ta sama klasa, `test_wzor_z_surowym_wyjsciem_i_dolaczaniem_widokow_jest_odrzucany` | jw. | jw. |
| V5.2.8 | ta sama klasa, `test_wstawka_z_wywolaniem_funkcji_jest_odrzucana` | jw. | jw. |
| V5.2.1 (limit długości) | ta sama klasa, `test_tresc_wzoru_ma_limit_dlugosci` | `max:200000` w `UpdateDocumentTemplateRequest` | reguła `max` usunięta |
| V5.2.4 (brak nadmiarowych odrzuceń) | ta sama klasa, `test_wzor_z_repozytorium_przechodzi_walidacje` | wzorzec wstawki przepuszcza pola z wzorów repozytorium | — (próba przeciwna: pilnuje, że reguła nie blokuje prawdziwego wzoru) |
| V5.3.1 | `backend/tests/Feature/Bezpieczenstwo/EksportCsvTest.php` `test_komorka_zaczynajaca_sie_od_formuly_jest_zneutralizowana` | `Csv::cell()` | `cell()` zwraca wartość bez apostrofu |
| V8.1.4 | `backend/tests/Feature/Bezpieczenstwo/LimityZadanTest.php` `test_publiczna_weryfikacja_certyfikatu_ma_limit_zadan` | `throttle:60,1` na `verify/*` | middleware usunięte z grupy tras |
| V8.1.4 | ta sama klasa, `test_wgrywanie_zalacznikow_ma_limit_zadan` | `throttle:20,1` na wgrywaniu załączników | middleware usunięte z trasy |
| V8.2.1 | `backend/tests/Feature/Bezpieczenstwo/NaglowkiOdpowiedziTest.php` `test_odpowiedz_z_profilem_zabrania_buforowania` | `SecurityHeaders` zarejestrowane globalnie dla `api/*` | rejestracja middleware usunięta z `bootstrap/app.php` |
| V8.1.1 | ta sama klasa, `test_pobranie_skanu_dyplomu_nie_jest_buforowane_publicznie` | jw. | jw. |
| V14.4.3, V14.4.7 | ta sama klasa, `test_odpowiedz_api_ma_csp_i_zakaz_osadzania` | jw. | jw. |
| V14.4.4, V14.4.5, V14.4.6 | ta sama klasa, `test_odpowiedz_api_ma_nosniff_hsts_i_polityke_referera` | jw. | jw. |
| V8.2.1, V14.4.4, V14.4.7 | ta sama klasa, `test_koperta_bledu_tez_ma_naglowki_bezpieczenstwa` | jw. | jw. |
| V12.1.3 | `backend/tests/Feature/Bezpieczenstwo/PlikiTest.php` `test_liczba_zalacznikow_profilu_jest_ograniczona` | `MAX_DOCUMENTS` w `PsychologistProfileController::storeDocument()` | sprawdzenie limitu usunięte |
| D-1 | `backend/tests/Feature/Bezpieczenstwo/CertyfikatTest.php` `test_uniewazniony_certyfikat_nie_jest_do_pobrania` | `whereNull('revoked_at')` w `CertificateController::download()` | warunek usunięty |
| V14.4.4 | `frontend/__tests__/bezpieczenstwo-naglowki.test.ts` „X-Content-Type-Options ma wartość nosniff” | wpis w `securityHeaders` (`frontend/next.config.ts`) | wpis usunięty |
| V14.4.5 | ten sam plik, „Strict-Transport-Security ma max-age co najmniej jednego roku” | jw. | jw. |
| V14.4.6 | ten sam plik, „Referrer-Policy nie wysyła pełnego adresu do obcych źródeł” | jw. | jw. |
| V14.4.7 | ten sam plik, „CSP zawiera frame-ancestors 'none'” | jw. | jw. |
| V14.4.7 | ten sam plik, „panel nie daje się osadzić w obcej ramce (X-Frame-Options: DENY)” | jw. | jw. |
