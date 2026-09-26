# Przegląd ASVS L2 — walidacja, pliki, konfiguracja, API, dane wrażliwe

Baza pomiaru: gałąź `sprint-2` @ `3463eac`; wiersze dotyczące załączników profilu psychologa zaktualizowano do `8b58c0a` (włączenie szyfrowania załączników). Przegląd jest statyczny i obejmuje tylko kod oraz
konfigurację w repozytorium. Kod produkcyjny nie był zmieniany. Dokument nie zawiera danych
osobowych, adresów hostów, kluczy ani haseł.

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
- Każde wymaganie „niespełnione” o ryzyku wysokim lub średnim ma próbę w
  `backend/tests/Feature/Bezpieczenstwo/` albo w `frontend/__tests__/bezpieczenstwo-naglowki.test.ts`.
  Próba jest oznaczona `markTestIncomplete` / `test.todo` z odwołaniem do wiersza tego dokumentu.
  Jej treść opisuje zachowanie oczekiwane po poprawce, więc bramka zostaje zielona do czasu
  naprawy.

Ograniczenia pomiaru:

- Domyślne ustawienia frameworka (CORS, nagłówki `Cache-Control` odpowiedzi pobierania) opisano
  według dokumentacji Laravel i Symfony. Katalogu `vendor/` nie dało się pobrać w środowisku
  przeglądu.
- Konfiguracji serwera pośredniczącego sprzed aplikacji (CDN, zapora) nie ma w repozytorium.

## Podsumowanie

| Miara | Liczba |
|---|---|
| Wymagania zmierzone (wiersze tabel V5–V14) | 112 |
| spełnione | 51 |
| niespełnione | 41 |
| nie dotyczy | 12 |
| niezmierzone | 8 |
| Luki o ryzyku wysokim | 4 |
| Luki o ryzyku średnim | 19 |
| Luki o ryzyku niskim | 18 |
| Ustalenia spoza listy ASVS: niespełnione (średnie / niskie) | 3 (1 / 2) |
| Ustalenia spoza listy ASVS: niezmierzone | 1 |
| Próby dopisane (PHPUnit, `markTestIncomplete`) | 22 |
| Próby dopisane (Vitest, `test.todo`) | 5 |

Najpoważniejsza luka to V5.2.4, V5.2.5, V5.2.8 i V12.3.6 — jedna przyczyna. Wzory dokumentów
(umowa, zaświadczenie, certyfikat) edytowalne z panelu są kompilowane jako szablon Blade. Osoba z
rolą `project_manager` może więc zapisać we wzorze dowolny kod PHP. Kod wykona się przy
następnym generowaniu dokumentu.

## V5 — walidacja, sanityzacja i kodowanie wyjścia

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **V5.1.1** Aplikacja broni się przed zanieczyszczeniem parametrów HTTP (wielokrotne i tablicowe parametry). | niespełnione | `backend/app/Queries/AdminUserQuery.php:30`, `:34` i `backend/app/Http/Controllers/Api/V1/Admin/CourseCatalogAdminController.php:88`, `:92` rzutują `$request->query()` na string, więc `?role[]=x` kończy się błędem 500 | niskie | Czytać filtry list przez FormRequest z regułą `string` i `Rule::in`, a tablice w parametrach odrzucać kodem 422. |
| **V5.1.2** Aplikacja chroni przed masowym przypisaniem pól. | spełnione | brak `$guarded = []` i `unguard()` w `backend/app/Models`; zapisy przez `validated()`, np. `backend/app/Http/Controllers/Api/V1/H11/InternshipEntryController.php:52` | — | — |
| **V5.1.3** Każde wejście jest walidowane listą dozwolonych wartości. | niespełnione | 64 klasy w `backend/app/Http/Requests`, ale filtry `role` i `status` list administracji to dowolne ciągi (`backend/app/Queries/AdminUserQuery.php:30`, `:34`) | niskie | Dodać FormRequest dla list administracji z `Rule::in` na słowniki ról i statusów. |
| **V5.1.4** Dane strukturalne są silnie typowane i ograniczone (typy, zakresy, liczność). | niespełnione | `backend/app/Http/Requests/H03/StoreApplicationRequest.php:25` przyjmuje dowolną tablicę `payload` bez reguł zagnieżdżonych; tablice bez `max` w `backend/app/Http/Requests/H08/InviteToCourseRequest.php:22` i `backend/app/Http/Requests/H15/UpdatePsychologistProfileRequest.php:18` | niskie | Dodać `max` liczności tablic i reguły elementów, a `payload` zastąpić listą nazwanych pól. |
| **V5.1.5** Przekierowania i przekazania URL trafiają tylko pod dozwolone adresy. | spełnione | brak parametrów `redirect`/`next`/`returnTo`; `callbackUrl` to stałe ścieżki względne (`frontend/app/logowanie/page.tsx:160`, `:201`) | — | — |
| **V5.2.1** HTML z edytora jest sanityzowany biblioteką przed użyciem. | niespełnione | treść wzoru dokumentu to HTML bez sanityzacji: `backend/app/Http/Requests/DocumentTemplates/UpdateDocumentTemplateRequest.php:21` (`required, string, min:1`), renderowana w `backend/app/Services/DocumentTemplates/DocumentTemplateRenderer.php:41` | średnie | Przepuszczać HTML wzoru przez sanityzator z listą dozwolonych znaczników i dodać limit długości. |
| **V5.2.2** Dane nieustrukturyzowane mają ograniczone znaki i długość. | niespełnione | pola tekstowe bez `max`: `backend/app/Http/Requests/H08/StoreLessonRequest.php:28`, `backend/app/Http/Requests/H11/StoreInternshipEntryRequest.php:22`, `backend/app/Http/Requests/H15/UpdatePsychologistProfileRequest.php:22`, `backend/app/Http/Requests/H03/RejectApplicationRequest.php:18` | niskie | Dodać `max` do każdego pola tekstowego zgodnie z rozmiarem kolumny. |
| **V5.2.3** Dane trafiające do poczty są oczyszczone przed przekazaniem do systemu pocztowego. | spełnione | adresaci z walidacją `email`; treść jest escapowana `nl2br(e($body))` w `backend/app/Support/Notify.php:40` | — | — |
| **V5.2.4** Aplikacja nie wykonuje kodu dynamicznie, a jeśli musi, dane wejściowe są odizolowane. | niespełnione | `Blade::render($template->content, $data)` w `backend/app/Services/DocumentTemplates/DocumentTemplateRenderer.php:41` kompiluje i wykonuje treść z bazy | wysokie | Zastąpić Blade dla wzorów z bazy ograniczonym podstawianiem nazwanych zmiennych (bez dyrektyw i bez PHP). |
| **V5.2.5** Aplikacja chroni przed wstrzyknięciem szablonu. | niespełnione | zapis treści wzoru bez ograniczeń: `backend/app/Http/Controllers/Api/V1/DocumentTemplateController.php:36`, trasa dla `project_manager` w `backend/routes/api/document_templates.php:25`–`:27`, funkcja włączona w `backend/config/features.php:34` | wysokie | Odrzucać dyrektywy Blade (`@php`, `{!!`, `@include` i inne) w walidacji i renderować wzór silnikiem bez wykonywania kodu. |
| **V5.2.6** Aplikacja chroni przed SSRF (adresy z danych wejściowych). | spełnione | serwer nie pobiera adresów podanych przez użytkownika; generator PDF ma `setIsRemoteEnabled(false)` w `backend/app/Support/PdfService.php:54` | — | — |
| **V5.2.7** Treść SVG od użytkownika jest oczyszczana z elementów skryptowych. | spełnione | listy typów nie obejmują SVG: `backend/app/Http/Requests/H15/StoreProfileDocumentRequest.php:19`, `backend/app/Http/Requests/H08/StoreMaterialRequest.php:31` | — | — |
| **V5.2.8** Treść w językach szablonów i wyrażeń od użytkownika jest oczyszczona lub odizolowana. | niespełnione | wzór z bazy jest szablonem Blade z pełnym PHP; wzór plikowy sam zaczyna się od `@php` (`backend/resources/views/pdf/certificate.blade.php:1`) | wysokie | Wprowadzić własny, zamknięty zestaw znaczników wzoru (np. `{{imie}}`) podstawianych bez interpretacji. |
| **V5.3.1** Kodowanie wyjścia odpowiada interpreterowi i kontekstowi. | niespełnione | eksport CSV nie neutralizuje formuł (`=`, `+`, `-`, `@`, tabulator, CR): `backend/app/Support/Csv.php:29`–`:33`; własne imię i nazwisko ustawia osoba (`backend/app/Http/Requests/H01/UpdateProfileRequest.php:28`) | średnie | W helperze CSV poprzedzać apostrofem komórki zaczynające się od znaku formuły. |
| **V5.3.2** Kodowanie wyjścia zachowuje zestaw znaków. | spełnione | JSON w UTF-8; CSV z BOM i `charset=utf-8` w `backend/app/Support/Csv.php:38` | — | — |
| **V5.3.3** Wyjście jest escapowane zależnie od kontekstu (ochrona przed XSS). | spełnione | treści użytkowników renderowane jako węzły tekstowe React, np. `frontend/components/chat/InstructorGroupThread.tsx:310`–`:313`; jedyne `dangerouslySetInnerHTML` (`frontend/app/(administracja)/admin/emails/page.tsx:209`) dostaje HTML escapowany w `backend/app/Support/Notify.php:40`; szablony Blade używają tylko `{{ }}` | — | — |
| **V5.3.4** Zapytania do bazy są parametryzowane. | spełnione | surowe zapytania tylko z wiązaniem parametrów, np. `backend/app/Http/Controllers/Api/V1/Admin/ApplicationController.php:82` (`whereRaw('LOWER(email) = ?', …)`) | — | — |
| **V5.3.5** Tam, gdzie nie ma parametryzacji, stosowane jest kodowanie kontekstowe SQL. | spełnione | sortowanie z listą dozwolonych kolumn i kierunków: `backend/app/Http/Controllers/Api/V1/Admin/CourseCatalogAdminController.php:115`–`:124`, `backend/app/Queries/AdminUserQuery.php:21` | — | — |
| **V5.3.6** Aplikacja chroni przed wstrzyknięciem JSON i nie wykonuje JSON jako kodu. | spełnione | odpowiedzi przez `response()->json`; frontend parsuje `res.json()` (`frontend/lib/api/klient.ts:62`) | — | — |
| **V5.3.7** Aplikacja chroni przed wstrzyknięciem LDAP. | nie dotyczy | brak integracji LDAP (tożsamość przez OIDC) | — | — |
| **V5.3.8** Aplikacja chroni przed wstrzyknięciem poleceń systemu. | spełnione | brak `exec`, `shell_exec`, `proc_open`, `system`, `passthru` w `backend/app`, `backend/routes`, `backend/config` | — | — |
| **V5.3.9** Aplikacja chroni przed dołączaniem plików lokalnych i zdalnych (LFI/RFI). | spełnione | ścieżki plików tylko z bazy, np. `backend/app/Http/Controllers/Api/V1/MaterialDownloadController.php:48`; skan dyplomu dodatkowo sprawdzany `realpath` w `backend/app/Services/H03/DiplomaScanAccess.php:32`–`:36`. Wyjątek to wzory Blade opisane w V5.2.5. | — | — |
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
| **V7.4.2** Obsługa wyjątków jest jednolita w całym kodzie. | spełnione | jeden renderer koperty błędu: `backend/bootstrap/app.php:31`–`:38` | — | — |
| **V7.4.3** Istnieje ostatni poziom obsługi błędów. | spełnione | gałąź `default` w `backend/app/Exceptions/ApiExceptionRenderer.php:81`–`:85` | — | — |

## V8 — ochrona danych (dane wrażliwe uczestniczek)

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **V8.1.1** Dane wrażliwe nie są buforowane w komponentach serwerowych (pamięci podręczne, pośredniki). | niespełnione | skan dyplomu wysyłany przez `response()->download()` (`backend/app/Http/Controllers/Api/V1/Admin/ApplicationController.php:153`–`:156`); odpowiedź pobierania pliku w Symfony jest domyślnie `public` | średnie | Ustawiać `Cache-Control: no-store, private` na każdym pobraniu pliku z danymi osobowymi. |
| **V8.1.2** Kopie tymczasowe danych wrażliwych na serwerze są chronione lub usuwane. | spełnione | eksport RODO ma TTL (`backend/config/exports.php:18`); pliki po terminie usuwa co godzinę `backend/app/Console/Commands/PurgeExpiredDataExports.php:36`–`:47` (harmonogram `backend/routes/console.php:16`) | — | — |
| **V8.1.3** Żądania zawierają minimum parametrów wrażliwych. | spełnione | uwierzytelnienie wyłącznie nagłówkiem Bearer; brak danych osobowych w ukrytych polach i ciasteczkach API | — | — |
| **V8.1.4** Aplikacja wykrywa nienaturalną liczbę żądań i alarmuje o niej. | niespełnione | limity tylko na trzech trasach: `backend/routes/api/sso.php:34`, `backend/routes/api/h03.php:27`, `backend/routes/api/h01.php:32`; brak `RateLimiter::for` i `throttleApi()` (`backend/bootstrap/app.php`) | średnie | Włączyć domyślny limiter dla całego API i osobne limity dla tras publicznych, wgrywania i eksportów. |
| **V8.2.1** Odpowiedzi z danymi wrażliwymi mają nagłówki zabraniające buforowania. | niespełnione | brak `no-store` w odpowiedziach API; jedyny taki nagłówek jest w `backend/app/Http/Controllers/Oidc/BackchannelLogoutController.php:113` | średnie | Dodać middleware ustawiające `Cache-Control: no-store` dla tras `api/*`. |
| **V8.2.2** Pamięć przeglądarki nie zawiera danych wrażliwych. | spełnione | `localStorage` tylko dla stanu menu (`frontend/components/organisms/PanelNav.tsx:51`, `:65`); token w pamięci modułu (`frontend/lib/api/klient.ts:54`) | — | — |
| **V8.2.3** Dane uwierzytelnione są usuwane z pamięci klienta po zakończeniu sesji. | spełnione | `invalidateSessionCache` zeruje token w `frontend/lib/api/klient.ts:105`–`:108` | — | — |
| **V8.3.1** Dane wrażliwe są przesyłane w treści lub nagłówkach, nie w adresie. | niespełnione | wyszukiwanie po imieniu i adresie e-mail w `?search=` (`backend/app/Queries/AdminUserQuery.php:38`, `backend/app/Http/Controllers/Api/V1/Admin/ApplicationController.php:40`) | niskie | Przenieść wyszukiwanie osób do `POST` z treścią albo wyłączyć zapis zapytań w logach pośrednika. |
| **V8.3.2** Osoba może wyeksportować albo usunąć swoje dane. | spełnione | eksport `POST /me/exports` (`backend/routes/api/h01.php:31`); anonimizacja konta w `backend/app/Services/H18/UserAnonymizer.php:82`–`:94` | — | — |
| **V8.3.3** Osoba dostaje jasną informację o zbieraniu i użyciu danych. | spełnione | dokumenty prawne z wersjonowaniem i akceptacją (trasy `backend/routes/api/h22.php:28`–`:29`) | — | — |
| **V8.3.4** Dane wrażliwe są zidentyfikowane i objęte polityką. | niezmierzone | polityka klasyfikacji danych jest dokumentem organizacyjnym spoza repozytorium | — | — |
| **V8.3.5** Dostęp do danych wrażliwych jest audytowany (bez zapisu samych danych). | niespełnione | wgląd zapisywany tylko dla skanu dyplomu (`backend/app/Services/H03/DiplomaScanAccess.php:42`–`:48`) i załącznika profilu (`backend/app/Http/Controllers/Api/V1/H15/AdminProfileController.php:149`–`:158`); karta osoby z pełnym PESEL (`backend/app/Http/Controllers/Api/V1/Admin/AdminUserController.php:54`–`:65`) i eksport CSV osób (`:227`) bez śladu | średnie | Zapisywać `sensitive.viewed` przy odczycie karty osoby i przy eksporcie CSV. |
| **V8.3.6** Dane wrażliwe w pamięci są nadpisywane po użyciu. | nie dotyczy | PHP i JavaScript nie dają kontroli nad zwalnianiem pamięci | — | — |
| **V8.3.7** Dane wrażliwe są szyfrowane zatwierdzonym algorytmem. | niespełnione | PESEL i adres szyfrowane w bazie (`backend/app/Models/User.php:49`–`:52`); załączniki profilu szyfrowane przed zapisem (`backend/app/Http/Controllers/Api/V1/H15/PsychologistProfileController.php:156`–`:163`, `backend/app/Services/H15/ProfileDocumentCipher.php:30`); jawny na dysku pozostaje eksport RODO z PESEL (`backend/app/Jobs/GenerateDataExport.php:44`–`:52`) | średnie | Szyfrować plik eksportu RODO przed zapisem tym samym mechanizmem co załączniki profilu i odszyfrowywać przy pobraniu. |
| **V8.3.8** Dane osobowe mają zasady retencji, a nieaktualne są usuwane. | niespełnione | wycofanie zgody nie usuwa załączników ani treści profilu (`backend/app/Http/Controllers/Api/V1/H15/PsychologistProfileController.php:165`–`:202`); anonimizacja pomija treści profilu psychologa i zgłoszenia (`backend/app/Services/H18/UserAnonymizer.php:82`–`:94`) | średnie | Rozszerzyć anonimizację o profil psychologa, zgłoszenie i treści e-maili, a przy wycofaniu zgody usuwać załączniki. |

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
| **V12.1.3** Obowiązuje limit rozmiaru i liczby plików na osobę. | niespełnione | brak limitu liczby załączników profilu: `backend/app/Http/Controllers/Api/V1/H15/PsychologistProfileController.php:134`–`:140`; brak limitu importu wierszy CSV (`backend/app/Services/H03/ApplicationCsvImporter.php:64`) | średnie | Ograniczyć liczbę załączników na profil i łączny rozmiar, a import CSV ograniczyć liczbą wierszy. |
| **V12.2.1** Typ pliku z niezaufanego źródła jest sprawdzany po treści. | spełnione | reguła `mimes` rozpoznaje typ po treści pliku (`backend/app/Http/Requests/H15/StoreProfileDocumentRequest.php:19`, `backend/app/Http/Requests/H08/StoreMaterialRequest.php:31`) | — | — |
| **V12.3.1** Nazwa pliku od użytkownika nie trafia bezpośrednio do systemu plików. | spełnione | nazwa na dysku to ULID z uproszczoną nazwą (`backend/app/Services/H08/MaterialStore.php:96`–`:101`) albo losowa nazwa (`backend/app/Http/Controllers/Api/V1/H15/PsychologistProfileController.php:157`–`:159`) | — | — |
| **V12.3.2** Metadane nazwy pliku nie pozwalają na odczyt lub zapis plików lokalnych. | spełnione | ścieżki pobierania z bazy, nigdy z żądania: `backend/app/Http/Controllers/Api/V1/MaterialDownloadController.php:48`, `backend/app/Http/Controllers/Api/V1/CertificateController.php:63` | — | — |
| **V12.3.3** Metadane nazwy pliku nie pozwalają na dołączanie zdalnych plików ani SSRF. | spełnione | nazwa pliku nie jest używana jako adres; generator PDF bez zasobów zdalnych (`backend/app/Support/PdfService.php:54`) | — | — |
| **V12.3.4** Nazwy plików w odpowiedziach są stałe albo oczyszczone (ochrona przed RFD). | niespełnione | nazwa pobieranego materiału to oryginalna nazwa klienta (`backend/app/Services/H08/MaterialStore.php:68`, `:73` → `backend/app/Http/Controllers/Api/V1/MaterialDownloadController.php:52`); rozszerzenie na dysku też od klienta (`backend/app/Services/H08/MaterialStore.php:99`) | niskie | Budować nazwę pobrania z uproszczonej nazwy i rozszerzenia wynikającego z wykrytego typu. |
| **V12.3.5** Metadane pliku nie trafiają do poleceń systemu. | spełnione | brak wywołań poleceń systemu w `backend/app` | — | — |
| **V12.3.6** Aplikacja nie dołącza ani nie wykonuje funkcji z niezaufanych źródeł. | niespełnione | wzór dokumentu z bazy jest kompilowany do PHP i wykonywany (`backend/app/Services/DocumentTemplates/DocumentTemplateRenderer.php:41`) | wysokie | Jak V5.2.4: wzory z bazy renderować bez wykonywania kodu. |
| **V12.4.1** Pliki z niezaufanych źródeł leżą poza katalogiem publicznym, z ograniczonymi uprawnieniami. | spełnione | dysk `local` w `storage/app/private` (`backend/config/filesystems.php:33`–`:35`) | — | — |
| **V12.4.2** Pliki z niezaufanych źródeł są skanowane programem antywirusowym. | niespełnione | brak skanowania w ścieżkach wgrywania (`backend/app/Services/H08/MaterialStore.php:65`–`:83`, `backend/app/Http/Controllers/Api/V1/H15/PsychologistProfileController.php:119`–`:146`) | średnie | Skanować plik przed zapisem (np. usługą antywirusową w sieci kontenerów) i odrzucać zainfekowane z kodem 422. |
| **V12.5.1** Warstwa webowa serwuje tylko pliki o określonych rozszerzeniach. | niespełnione | dysk prywatny ma `'serve' => true` (`backend/config/filesystems.php:36`), co rejestruje zbędną trasę serwowania plików poza listą tras publicznych | niskie | Ustawić `'serve' => false`, bo aplikacja nie wystawia tymczasowych adresów do dysku. |
| **V12.5.2** Wgrane pliki nigdy nie są wykonywane jako HTML ani JavaScript. | spełnione | wszystkie pobrania mają nagłówek `attachment` (np. `backend/app/Http/Controllers/Api/V1/DocumentController.php:88`–`:93`); brak serwowania plików `inline` | — | — |
| **V12.6.1** Serwer wysyła żądania tylko do dozwolonych zasobów (SSRF). | spełnione | ruch wychodzący tylko do adresów z konfiguracji (dostawca tożsamości, dostawca wideo); generator PDF bez zasobów zdalnych (`backend/app/Support/PdfService.php:54`) | — | — |

## V13 — API i usługi sieciowe

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **V13.1.1** Wszystkie składniki używają tych samych kodowań i parserów. | spełnione | wejście i wyjście JSON w UTF-8; koperta błędów w `backend/bootstrap/app.php:31`–`:38` | — | — |
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
| **V14.3.3** Nagłówki i odpowiedzi nie ujawniają wersji składników. | niespełnione | brak `poweredByHeader: false` (`frontend/next.config.ts:3`–`:5`), więc Next wysyła `X-Powered-By`; wersja frameworka na stronie `/` (`backend/resources/views/welcome.blade.php:120`) | niskie | Ustawić `poweredByHeader: false` i usunąć stronę powitalną. |
| **V14.4.1** Każda odpowiedź ma `Content-Type` z bezpiecznym zestawem znaków. | spełnione | JSON przez `response()->json`; CSV z `charset=utf-8` (`backend/app/Support/Csv.php:38`); PDF z `application/pdf` (`backend/app/Http/Controllers/Api/V1/DocumentController.php:91`) | — | — |
| **V14.4.2** Odpowiedzi API mają `Content-Disposition: attachment` z bezpieczną nazwą. | niespełnione | odpowiedzi JSON bez `Content-Disposition` | niskie | Dodać `Content-Disposition: attachment; filename="api.json"` w middleware odpowiedzi API. |
| **V14.4.3** Odpowiedź ma nagłówek Content-Security-Policy. | niespełnione | brak CSP w `backend/app`, `backend/bootstrap`, `frontend/next.config.ts:3`–`:5` i w bloku nagłówków `deploy/psychon-dev/Caddyfile:57`–`:62` | średnie | Ustawić CSP w `headers()` Next (z `frame-ancestors 'none'`) oraz `default-src 'none'` dla odpowiedzi API. |
| **V14.4.4** Odpowiedź ma `X-Content-Type-Options: nosniff`. | niespełnione | nagłówek ustawia tylko pobranie skanu dyplomu (`backend/app/Http/Controllers/Api/V1/Admin/ApplicationController.php:155`); brak w pozostałych odpowiedziach i w `frontend/next.config.ts` | średnie | Dodać `nosniff` globalnie w middleware API i w `headers()` Next. |
| **V14.4.5** Odpowiedź ma nagłówek HSTS. | niespełnione | brak `Strict-Transport-Security` w aplikacji, w `frontend/next.config.ts` i w `deploy/psychon-dev/Caddyfile:57`–`:62` | średnie | Dodać HSTS (`max-age` co najmniej roku, `includeSubDomains`) w serwerze pośredniczącym albo w `headers()` Next. |
| **V14.4.6** Odpowiedź ma odpowiedni nagłówek Referrer-Policy. | niespełnione | brak `Referrer-Policy` we wszystkich warstwach (jak V14.4.3) | niskie | Ustawić `Referrer-Policy: strict-origin-when-cross-origin` w `headers()` Next. |
| **V14.4.7** Treść da się osadzić tylko na dozwolonych stronach (`frame-ancestors`, `X-Frame-Options`). | niespełnione | brak `X-Frame-Options` i `frame-ancestors` we wszystkich warstwach (jak V14.4.3) | średnie | Ustawić `frame-ancestors 'none'` w CSP i `X-Frame-Options: DENY`. |
| **V14.5.1** Serwer przyjmuje tylko używane metody HTTP. | spełnione | jak V13.2.1 | — | — |
| **V14.5.2** Nagłówek `Origin` nie służy do uwierzytelniania ani kontroli dostępu. | spełnione | uwierzytelnianie wyłącznie tokenem Bearer (`backend/app/Http/Middleware/AuthenticateKeycloakToken.php:37`–`:40`) | — | — |
| **V14.5.3** CORS dopuszcza tylko zaufane źródła z listy. | niespełnione | brak `backend/config/cors.php`, więc działa domyślna konfiguracja frameworka z `allowed_origins` = `*` dla `api/*` | średnie | Dodać `config/cors.php` z listą dozwolonych źródeł czytaną ze zmiennej środowiskowej. |
| **V14.5.4** Nagłówki dodawane przez zaufany pośrednik lub SSO są uwierzytelniane przez aplikację. | niespełnione | brak konfiguracji zaufanych pośredników w `backend/bootstrap/app.php:18`–`:29`; limity żądań liczą się wtedy po adresie pośrednika, a nie klienta | niskie | Skonfigurować `trustProxies` tylko dla adresów sieci pośrednika. |

## Ustalenia spoza listy ASVS

Każde ustalenie ma identyfikator używany w próbach.

| Ustalenie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **D-1** Unieważniony certyfikat nadal można pobrać. | niespełnione | pobranie nie sprawdza `revoked_at`: `backend/app/Http/Controllers/Api/V1/CertificateController.php:52`–`:56` | średnie | Dodać `whereNull('revoked_at')` do zapytania pobrania i zwracać 404 dla unieważnionego. |
| **D-2** Pomocnik pobierania dokleja token Bearer do dowolnego adresu. | niespełnione | `downloadFile` nie sprawdza pochodzenia adresu: `frontend/lib/api/pliki.ts:13`–`:18` | niskie | Dołączać token tylko dla adresów względnych albo o tym samym pochodzeniu co API. |
| **D-3** Film powitalny osadzany jest bez atrybutu `sandbox`, z dowolnego źródła https. | niespełnione | `frontend/components/onboarding/OnboardingView.tsx:26`–`:27`; reguła `url` bez ograniczenia hosta w `backend/app/Http/Requests/H21/UpdateOnboardingRequest.php:25` | niskie | Ograniczyć adres do listy dostawców wideo i dodać `sandbox` do elementu `iframe`. |
| **D-4** Kopie zapasowe plików z danymi osobowymi nie są szyfrowane. | niezmierzone | skrypt kopii `deploy/prod/kopia-nocna.sh:28`, `:48` tworzy archiwum bez szyfrowania; ochrona dostępu do katalogu kopii jest poza repozytorium | — | — |

## Próby dokumentujące luki

Wszystkie próby są oznaczone jako niedokończone i nie zmieniają wyniku bramki. Każda
wskazuje wiersz tego dokumentu. Po wdrożeniu poprawki usuwa się znacznik, a próba staje się
testem regresji.

| Wiersz | Plik | Metoda |
|---|---|---|
| V5.2.4, V5.2.5, V5.2.8, V12.3.6 | `backend/tests/Feature/Bezpieczenstwo/SzablonyDokumentowTest.php` | `test_wzor_z_dyrektywa_php_jest_odrzucany` |
| V5.2.4, V5.2.5, V5.2.8, V12.3.6 | `backend/tests/Feature/Bezpieczenstwo/SzablonyDokumentowTest.php` | `test_wzor_z_surowym_wyjsciem_jest_odrzucany` |
| V5.2.1 | `backend/tests/Feature/Bezpieczenstwo/SzablonyDokumentowTest.php` | `test_tresc_wzoru_ma_limit_dlugosci_i_jest_sanityzowana` |
| V5.3.1 | `backend/tests/Feature/Bezpieczenstwo/EksportCsvTest.php` | `test_komorka_zaczynajaca_sie_od_formuly_jest_zneutralizowana` |
| V7.1.2 | `backend/tests/Feature/Bezpieczenstwo/DaneWrazliweTest.php` | `test_powod_blokady_nie_trafia_do_ladunku_audytu` |
| V7.1.3, V7.2.2 | `backend/tests/Feature/Bezpieczenstwo/RejestrZdarzenTest.php` | `test_odmowa_dostepu_jest_zapisywana_w_logu` |
| V7.2.1 | `backend/tests/Feature/Bezpieczenstwo/RejestrZdarzenTest.php` | `test_odrzucenie_tokenu_jest_zapisywane_w_logu` |
| V8.1.1 | `backend/tests/Feature/Bezpieczenstwo/NaglowkiOdpowiedziTest.php` | `test_pobranie_skanu_dyplomu_nie_jest_buforowane_publicznie` |
| V8.1.4 | `backend/tests/Feature/Bezpieczenstwo/LimityZadanTest.php` | `test_publiczna_weryfikacja_certyfikatu_ma_limit_zadan` |
| V8.1.4 | `backend/tests/Feature/Bezpieczenstwo/LimityZadanTest.php` | `test_wgrywanie_zalacznikow_ma_limit_zadan` |
| V8.2.1 | `backend/tests/Feature/Bezpieczenstwo/NaglowkiOdpowiedziTest.php` | `test_odpowiedz_z_profilem_zabrania_buforowania` |
| V8.3.5 | `backend/tests/Feature/Bezpieczenstwo/DaneWrazliweTest.php` | `test_odczyt_karty_osoby_jest_audytowany` |
| V8.3.5 | `backend/tests/Feature/Bezpieczenstwo/DaneWrazliweTest.php` | `test_eksport_csv_osob_jest_audytowany` |
| V8.3.7 | `backend/tests/Feature/Bezpieczenstwo/DaneWrazliweTest.php` | `test_plik_eksportu_rodo_jest_zaszyfrowany_na_dysku` |
| V8.3.8 | `backend/tests/Feature/Bezpieczenstwo/DaneWrazliweTest.php` | `test_anonimizacja_czysci_profil_psychologa` |
| V8.3.8 | `backend/tests/Feature/Bezpieczenstwo/DaneWrazliweTest.php` | `test_wycofanie_zgody_usuwa_zalaczniki` |
| V12.1.3 | `backend/tests/Feature/Bezpieczenstwo/PlikiTest.php` | `test_liczba_zalacznikow_profilu_jest_ograniczona` |
| V12.4.2 | `backend/tests/Feature/Bezpieczenstwo/PlikiTest.php` | `test_plik_z_sygnatura_testowa_antywirusa_jest_odrzucany` |
| D-1 | `backend/tests/Feature/Bezpieczenstwo/PlikiTest.php` | `test_uniewazniony_certyfikat_nie_jest_do_pobrania` |
| V14.4.3, V14.4.7 | `backend/tests/Feature/Bezpieczenstwo/NaglowkiOdpowiedziTest.php` | `test_odpowiedz_api_ma_csp_i_zakaz_osadzania` |
| V14.4.4, V14.4.5 | `backend/tests/Feature/Bezpieczenstwo/NaglowkiOdpowiedziTest.php` | `test_odpowiedz_api_ma_nosniff_i_hsts` |
| V14.5.3 | `backend/tests/Feature/Bezpieczenstwo/NaglowkiOdpowiedziTest.php` | `test_cors_nie_przepuszcza_obcego_zrodla` |
| V14.4.3 | `frontend/__tests__/bezpieczenstwo-naglowki.test.ts` | `test.todo` — CSP w `headers()` Next |
| V14.4.4 | `frontend/__tests__/bezpieczenstwo-naglowki.test.ts` | `test.todo` — `nosniff` w `headers()` Next |
| V14.4.5 | `frontend/__tests__/bezpieczenstwo-naglowki.test.ts` | `test.todo` — HSTS w `headers()` Next |
| V14.4.7 | `frontend/__tests__/bezpieczenstwo-naglowki.test.ts` | `test.todo` — `frame-ancestors` w `headers()` Next |
| V14.4.3, V14.4.7 | `frontend/__tests__/bezpieczenstwo-naglowki.test.ts` | `test.todo` — zakaz osadzania panelu w obcej ramce |
