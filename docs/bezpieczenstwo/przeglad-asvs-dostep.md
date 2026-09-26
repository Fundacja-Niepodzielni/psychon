# Przegląd bezpieczeństwa ASVS L2: uwierzytelnianie, sesja, kontrola dostępu

Baza pomiaru: `sprint-2` @ `3463eac`; dowody sprawdzone ponownie na `f229ca8` (cytowane pliki bez zmian). Przegląd tylko czyta kod — nie zmienia kodu
produkcyjnego. Luki o ryzyku wysokim lub średnim mają próby, które dziś dokumentują lukę
i czerwienieją dopiero po jej zamknięciu (sekcja 5).

## 1. Zakres i metoda

- **Standard:** OWASP ASVS 5.0, poziom L2 — wszystkie wymagania L1 i L2 z trzech rozdziałów,
  60 wierszy. Treść wymagań zmierzona z repozytorium OWASP ASVS (`5.0/en`), nie z pamięci.
- **Numeracja rozdziałów.** Uwierzytelnianie, sesja i kontrola dostępu to w ASVS 5.0 rozdziały
  **V6 Authentication**, **V7 Session Management** i **V8 Authorization**. W ASVS 4.0.3 te same
  tematy miały numery V2, V3, V4 — w 5.0 numery V2–V4 oznaczają walidację, front i API. Przegląd
  trzyma się tematu, więc ocenia V6, V7 i V8 z wersji 5.0.
- **Zaplecze:** `backend/app`, `backend/routes/api/*.php`, `backend/config/keycloak.php`,
  polityki, middleware, FormRequest. **Front:** `frontend/auth.ts`, trasy `frontend/app/api/auth`,
  strażnicy ról ekranów (`frontend/components/permissions`), wylogowanie.
- **Lista kontrolna pomocnicza:** OWASP Cheat Sheet Series — arkusze *Authentication Cheat Sheet*,
  *Session Management Cheat Sheet*, *Authorization Cheat Sheet*, *Access Control Cheat Sheet*.
- **Stany:** `spełnione` (dowód w kodzie lub dokumencie), `niespełnione` (zmierzona luka),
  `nie dotyczy` (mechanizm nie istnieje w tej architekturze), `niezmierzone` (rozstrzyga
  konfiguracja poza repozytorium).
- **Dlaczego tyle `niezmierzone`.** Platforma nie ma własnego logowania: hasła, drugi składnik,
  reset i ograniczanie prób prowadzi system kont Fundacji (Keycloak) —
  `docs/system/01-architektura-i-integracje.md:136-162`,
  `docs/system/06-wymagania-niefunkcjonalne.md:9-12`. W repozytorium nie ma eksportu
  konfiguracji realmu (przeszukano `deploy/`, `docs/` i całe repozytorium pod kątem polityki hasła,
  OTP, czasów sesji i ochrony przed zgadywaniem haseł). Wymagania, które rozstrzyga realm, dostają
  stan `niezmierzone` z odwołaniem do miejsca delegacji.

Skróty dowodów używane w tabelach:

- **[DEL]** — delegacja uwierzytelnienia do systemu kont:
  `docs/system/01-architektura-i-integracje.md:136-162`, `docs/system/06-wymagania-niefunkcjonalne.md:9-12`.
- **[BEZHASEŁ]** — aplikacja nie przechowuje ani nie sprawdza haseł:
  `backend/database/migrations/2026_09_11_130000_drop_password_auth_from_users_table.php:25-29`,
  `backend/tests/Feature/PasswordAuthGoneTest.php:31-39`, `frontend/app/logowanie/page.tsx:64-66`.

## 2. Podsumowanie liczbowe

| Miara | Wartość |
|---|---|
| wymagania zmierzone (L1+L2, V6+V7+V8) | 60 |
| spełnione | 11 |
| niespełnione | 13 |
| nie dotyczy | 4 |
| niezmierzone | 32 |
| luki wysokie (niespełnione, ryzyko wysokie) | 0 |
| luki średnie (niespełnione, ryzyko średnie) | 9 |
| luki niskie (niespełnione, ryzyko niskie) | 4 |
| niezmierzone o ryzyku wysokim | 1 (6.3.3 — drugi składnik dla kont administracyjnych) |
| próby dopisane | 10 aktywnych (7 PHPUnit, 18 asercji; 3 Vitest), 0 niedokończonych |

## 3. Tabele wymagań

### V6 Authentication

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **6.1.1** (L1) Dokumentacja opisuje ograniczanie prób, antyautomatyzację i reakcję adaptacyjną przeciw credential stuffing i zgadywaniu haseł. | niespełnione | `docs/system/01-architektura-i-integracje.md:160-162`; `docs/hackathon/02-kontrakt-api.md:18`; `backend/routes/api/sso.php:34`; `backend/routes/api/h03.php:27` | niskie | Opisać parametry ochrony realmu (próg, czas blokady, tryb) i limity `throttle` API, usunąć z kontraktu nieaktualny wpis o „rate limiting logowania”. |
| **6.1.2** (L2) Udokumentowana lista słów kontekstowych zakazanych w hasłach. | niezmierzone | [DEL] | niskie | Spisać listę (nazwy Fundacji, programów, produktów) i wpisać ją do polityki hasła realmu. |
| **6.1.3** (L2) Wszystkie ścieżki uwierzytelnienia są udokumentowane razem z kontrolami i siłą uwierzytelnienia. | niespełnione | `docs/system/01-architektura-i-integracje.md:136-162` (brak ścieżek wiązania); `docs/hackathon/02-kontrakt-api.md:14-18` (opisuje usunięte logowanie hasłem); `backend/routes/api/sso.php:28,34`; `backend/routes/api/h03.php:27`; `backend/app/Console/Commands/SsoPowiazCommand.php:22` | niskie | Dodać jedną tabelę ścieżek (SSO, `/sso/powiaz`, `/applications/first-login`, polecenie `psychon:sso-powiaz`) z ich kontrolami. |
| **6.2.1** (L1) Hasło ma co najmniej 8 znaków (zalecane 15). | niezmierzone | [DEL]; [BEZHASEŁ] | średnie | Wersjonować eksport realmu bez sekretów i potwierdzić minimalną długość w polityce hasła. |
| **6.2.2** (L1) Użytkownik może zmienić hasło. | niezmierzone | [DEL]; `frontend/app/konto/page.tsx:111-139` (brak odnośnika do konsoli konta) | niskie | Dodać na `/konto` odnośnik do konsoli konta systemu kont. |
| **6.2.3** (L1) Zmiana hasła wymaga podania obecnego i nowego hasła. | niezmierzone | [DEL]; [BEZHASEŁ] | niskie | — |
| **6.2.4** (L1) Hasła są sprawdzane z listą co najmniej 3000 najczęstszych haseł. | niezmierzone | [DEL]; [BEZHASEŁ] | średnie | Włączyć listę zakazanych haseł w polityce realmu i zapisać to w dokumentacji. |
| **6.2.5** (L1) Brak reguł składu hasła (wymogów wielkich liter, cyfr, znaków specjalnych). | niezmierzone | [DEL]; [BEZHASEŁ] | niskie | Potwierdzić w realmie brak reguł składu. |
| **6.2.6** (L1) Pola hasła mają `type=password`. | niezmierzone | [DEL]; front nie ma żadnego pola hasła — `frontend/app/logowanie/page.tsx:64-66` | niskie | — (pole renderuje motyw logowania systemu kont). |
| **6.2.7** (L1) Wklejanie i menedżery haseł są dozwolone. | niezmierzone | [DEL]; `frontend/auth.ts:89-97` (logowanie wyłącznie przez system kont) | niskie | — |
| **6.2.8** (L1) Hasło weryfikowane dokładnie tak, jak je podano (bez obcinania i zmiany wielkości liter). | niezmierzone | [DEL]; [BEZHASEŁ] | niskie | — |
| **6.2.9** (L2) Dozwolone hasła o długości co najmniej 64 znaków. | niezmierzone | [DEL]; [BEZHASEŁ] | niskie | Potwierdzić w realmie maksymalną długość ≥ 64. |
| **6.2.10** (L2) Brak wymuszonej okresowej zmiany hasła. | niezmierzone | [DEL]; [BEZHASEŁ] | niskie | Potwierdzić w realmie brak wygaszania haseł. |
| **6.2.11** (L2) Lista słów kontekstowych jest używana przy tworzeniu hasła. | niezmierzone | [DEL] | niskie | Jak 6.1.2. |
| **6.2.12** (L2) Hasła sprawdzane z bazą haseł z wycieków. | niezmierzone | [DEL]; [BEZHASEŁ] | średnie | Dodać do realmu sprawdzanie haseł z wycieków (k-anonimowość) i opisać je. |
| **6.3.1** (L1) Kontrole przeciw credential stuffing i zgadywaniu haseł wdrożone zgodnie z dokumentacją. | niezmierzone | [DEL]; `backend/routes/api/sso.php:34`, `backend/routes/api/h03.php:27` (`throttle:6,1` tylko na trasach wiązania) | średnie | Wersjonować ustawienia ochrony realmu i dodać ogólny limiter API. |
| **6.3.2** (L1) Brak kont domyślnych (np. „admin”) albo są wyłączone. | spełnione | `backend/database/seeders/DemoSeeder.php:161-167` (konto demonstracyjne bez hasła i bez `keycloak_sub`); `backend/app/Services/Keycloak/KeycloakGuardResolver.php:64` (wejście wyłącznie po powiązanym `sub`) | niskie | Zablokować uruchamianie `DemoSeeder` w środowisku produkcyjnym. |
| **6.3.3** (L2) Dostęp wymaga MFA albo kombinacji czynników. | niezmierzone | [DEL]; `docs/system/03-role-i-uprawnienia.md:14` (2FA dla administracji „opcjonalnie”, decyzja otwarta); `docs/system/01-architektura-i-integracje.md:169`; `backend/config/keycloak.php:66-68` (znacznik `wymaga-2fa` celowo ignorowany) | wysokie | Wymusić drugi składnik w realmie co najmniej dla ról administracyjnych i sprawdzać go w API (6.8.4). |
| **6.3.4** (L2) Nie ma nieudokumentowanych ścieżek uwierzytelnienia, a kontrole są spójne. | niespełnione | `backend/routes/api/sso.php:28,34`; `backend/routes/api/h03.php:27`; `backend/app/Services/H03/ApplicationFirstLoginBinder.php:62-72`; `backend/app/Console/Commands/SsoPowiazCommand.php:22`; brak opisu w `docs/system/01-architektura-i-integracje.md:136-162` | średnie | Opisać każdą ścieżkę wiązania z jej kontrolami i przypiąć inwentarz tras `auth.keycloak` testem. |
| **6.4.1** (L1) Kody aktywacyjne są losowe, zgodne z polityką i wygasają po krótkim czasie lub po użyciu. | niespełnione | `backend/app/Http/Controllers/Api/V1/Admin/AdminUserController.php:97` (`Str::random(64)`); `backend/app/Services/H03/ApplicationAcceptor.php:93`; `backend/app/Services/H03/ApplicationFirstLoginBinder.php:67` (wyszukanie bez warunku czasu), `:146` (zużycie przy powiązaniu) | średnie | Dodać termin ważności tokenu zaproszenia sprawdzany przy wiązaniu i przechowywać tylko jego skrót. |
| **6.4.2** (L1) Brak podpowiedzi haseł i pytań pomocniczych. | niezmierzone | [DEL]; w aplikacji brak takiego mechanizmu | niskie | — |
| **6.4.3** (L2) Reset hasła jest bezpieczny i nie omija MFA. | niezmierzone | [DEL]; [BEZHASEŁ] | średnie | Opisać, że reset w realmie nie omija drugiego składnika. |
| **6.4.4** (L2) Utrata czynnika MFA wymaga weryfikacji tożsamości na poziomie rejestracji. | niezmierzone | [DEL] | średnie | Opisać procedurę odzyskania drugiego składnika z weryfikacją tożsamości. |
| **6.5.1** (L2) Kody zapasowe, kody OOB i TOTP są jednorazowe. | niezmierzone | [DEL] | niskie | — |
| **6.5.2** (L2) Kody zapasowe o niskiej entropii są przechowywane jako skrót z solą. | niezmierzone | [DEL] | niskie | — |
| **6.5.3** (L2) Kody zapasowe, kody OOB i ziarna TOTP pochodzą z CSPRNG. | niezmierzone | [DEL] | niskie | — |
| **6.5.4** (L2) Kody zapasowe i OOB mają co najmniej 20 bitów entropii. | niezmierzone | [DEL] | niskie | — |
| **6.5.5** (L2) Żądania OOB i TOTP mają określony czas życia. | niezmierzone | [DEL] | niskie | Potwierdzić okres TOTP w realmie. |
| **6.6.1** (L2) OTP przez telefon/SMS tylko dla zweryfikowanego numeru i z silniejszą alternatywą. | niezmierzone | [DEL] | niskie | — |
| **6.6.2** (L2) Żądania OOB są związane z pierwotnym żądaniem uwierzytelnienia. | niezmierzone | [DEL] | niskie | — |
| **6.6.3** (L2) Mechanizm OOB oparty o kod jest chroniony limitem prób. | niezmierzone | [DEL] | niskie | — |
| **6.8.1** (L2) Przy wielu dostawcach tożsamości nie da się podszyć przez innego dostawcę. | nie dotyczy | `backend/app/Services/Keycloak/TokenValidator.php:79-85` (jeden wystawca); `backend/app/Services/Keycloak/KeycloakGuardResolver.php:64` | niskie | Przy drugim dostawcy kluczować konto parą (wystawca, `sub`). |
| **6.8.2** (L2) Podpis asercji uwierzytelnienia jest zawsze weryfikowany. | spełnione | `backend/app/Services/Keycloak/TokenValidator.php:47,63` (`JWT::decode` z kluczami realmu); `backend/app/Services/Keycloak/KeycloakDiscovery.php:72`; `backend/app/Services/Keycloak/LogoutTokenValidator.php:36-55` | niskie | — |
| **6.8.3** (L2) Asercje SAML są przetwarzane jednokrotnie. | nie dotyczy | `frontend/auth.ts:89-97` (wyłącznie OIDC) | niskie | — |
| **6.8.4** (L2) Oczekiwana siła lub świeżość uwierzytelnienia jest sprawdzana na podstawie danych z IdP. | niespełnione | `docs/system/03-role-i-uprawnienia.md:14` (oczekiwanie silniejszego uwierzytelnienia administracji); `backend/app/Services/Keycloak/TokenValidator.php:79-119` (brak odczytu `acr`, `amr`, `auth_time`) | średnie | Dodać middleware tras administracyjnych wymagające poziomu uwierzytelnienia z tokenu albo udokumentować założenie jednoskładnikowe. |

### V7 Session Management

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **7.1.1** (L2) Udokumentowany limit bezczynności i absolutny czas sesji z uzasadnieniem. | niespełnione | `docs/system/06-wymagania-niefunkcjonalne.md:13-15` (tylko ogólnik „wygasanie”); `frontend/auth.ts:87` (`strategy: "jwt"` bez `maxAge`, czyli domyślne 30 dni) | średnie | Zapisać wartości z uzasadnieniem i ustawić jawnie `session.maxAge` zgodne z realmem. |
| **7.1.2** (L2) Udokumentowana liczba równoległych sesji i reakcja na przekroczenie. | niespełnione | brak w `docs/system/01-architektura-i-integracje.md:136-162` | niskie | Dopisać decyzję do §4.7 architektury. |
| **7.1.3** (L2) Udokumentowana koordynacja czasów życia sesji w federacji (SSO). | niespełnione | `docs/system/01-architektura-i-integracje.md:152-156` (tylko wylogowanie kanałem zwrotnym) | niskie | Dodać tabelę czasów życia (ciasteczko aplikacji, sesja SSO, token dostępu) i zdarzeń kończących sesję. |
| **7.2.1** (L1) Weryfikacja tokenu sesji odbywa się w zaufanym zapleczu. | spełnione | `backend/app/Providers/AppServiceProvider.php:39-41`; `backend/app/Services/Keycloak/KeycloakGuardResolver.php:46-54`; `backend/app/Services/Keycloak/TokenValidator.php:47,79-94` | niskie | — |
| **7.2.2** (L1) Sesja oparta o dynamicznie wydawane tokeny, nie statyczne klucze. | spełnione | `backend/app/Services/Keycloak/TokenValidator.php:34-47`; [BEZHASEŁ] (tokeny Sanctum usunięte) | niskie | — |
| **7.2.3** (L1) Tokeny referencyjne są unikalne i mają ≥ 128 bitów entropii. | nie dotyczy | `frontend/auth.ts:87`; `backend/app/Services/Keycloak/TokenValidator.php:47` (wyłącznie tokeny samowystarczalne) | niskie | — |
| **7.2.4** (L1) Nowy token sesji przy każdym uwierzytelnieniu. | spełnione | `frontend/auth.ts:111-124` (token budowany od nowa z odpowiedzi logowania) | niskie | — |
| **7.3.1** (L2) Limit bezczynności wymusza ponowne uwierzytelnienie. | niezmierzone | `frontend/auth.ts:87,128-151` (sesja pada dopiero, gdy realm odmówi odświeżenia); `backend/config/keycloak.php:39` | średnie | Wersjonować limit bezczynności realmu i ustawić zgodny limit w aplikacji. |
| **7.3.2** (L2) Absolutny maksymalny czas sesji wymusza ponowne uwierzytelnienie. | niezmierzone | `frontend/auth.ts:87` (sesja przesuwna, brak czasu pierwszego logowania) | średnie | Zapisywać czas logowania w callbacku `jwt` i kończyć sesję po udokumentowanym limicie. |
| **7.4.1** (L1) Po zakończeniu sesji (wylogowanie, wygaśnięcie) sesji nie da się dalej używać. | niespełnione | `backend/app/Http/Controllers/Oidc/BackchannelLogoutController.php:61,73` (wylogowanie po samym `sub`: brak znacznika); `backend/app/Services/Keycloak/InvalidationStore.php:56-60`; `backend/app/Services/Keycloak/KeycloakBackchannelInvalidation.php:37-43` (sprawdzenie wyłącznie po `sid`); `frontend/components/layout/PanelShell.tsx:85-89` (przy błędzie odczytu adresu wylogowania sesja systemu kont trwa dalej) | średnie | Dla wylogowania po `sub` zapisywać znacznik per `sub` i odrzucać tokeny wydane przed nim; w gałęzi błędu też kończyć sesję systemu kont. |
| **7.4.2** (L1) Zablokowanie lub usunięcie konta kończy jego sesje. | spełnione | `backend/app/Http/Controllers/Api/V1/Admin/AdminUserController.php:174-188`; `backend/app/Services/Keycloak/KeycloakGuardResolver.php:82-88`; `backend/app/Services/H18/UserAnonymizer.php:132-152` | niskie | Rozważyć sprawdzanie statusu także na `/sso/whoami` (`backend/routes/api/sso.php:28`). |
| **7.4.3** (L2) Po zmianie czynnika uwierzytelnienia można zakończyć pozostałe sesje. | niezmierzone | [DEL]; zmiana hasła i MFA wyłącznie w systemie kont | niskie | — |
| **7.4.4** (L2) Każda strona wymagająca logowania ma widoczne wylogowanie. | spełnione | `frontend/components/layout/PanelShell.tsx:148-158`; `frontend/app/(administracja)/admin/layout.tsx:12`; `frontend/app/(prowadzacy)/prowadzacy/layout.tsx:12`; `frontend/app/(uczestnik)/panel/layout.tsx:43`; `frontend/app/konto/page.tsx:132-139` | niskie | Dodać wylogowanie na ekranach `Forbidden403` i `/dostep-wygasl`. |
| **7.4.5** (L2) Administrator może zakończyć sesje jednego użytkownika albo wszystkich. | niespełnione | `backend/routes/api/h18.php:24-31` (tylko blokada i anonimizacja); `backend/app/Http/Controllers/Api/V1/Admin/AdminUserController.php:174-199` | średnie | Dodać trasę administracyjną oznaczającą wszystkie `sid` użytkownika jako unieważnione oraz globalny próg „tokeny wydane przed T”. |
| **7.5.1** (L2) Zmiana wrażliwych atrybutów konta wymaga ponownego uwierzytelnienia. | niezmierzone | `backend/app/Http/Requests/H01/UpdateProfileRequest.php:22` (e-mail nie jest polem wejściowym); [DEL] | niskie | — |
| **7.5.2** (L2) Użytkownik widzi aktywne sesje i może je zakończyć. | niezmierzone | [DEL]; `frontend/app/konto/page.tsx:111-139` (brak listy sesji i odnośnika do konsoli konta) | niskie | Dodać na `/konto` odnośnik do listy urządzeń w konsoli konta. |
| **7.6.1** (L2) Czasy życia sesji między aplikacją a IdP zachowują się zgodnie z dokumentacją. | niezmierzone | `frontend/auth.ts:128-151`; `frontend/app/api/auth/end-session-url/route.ts:36-50`; brak dokumentacji (7.1.1) | średnie | Po uzupełnieniu 7.1.x dodać test ponownego logowania po upływie maksymalnego czasu SSO. |
| **7.6.2** (L2) Utworzenie sesji wymaga zgody lub wyraźnego działania użytkownika. | niespełnione | `frontend/app/logowanie/page.tsx:160` (`signIn` w `useEffect`, bez kliknięcia); `frontend/app/page.tsx:5`; `frontend/lib/api/logowanie.ts:86-92`; utrwalone w `frontend/app/logowanie/__tests__/logowanie-stany.test.tsx:60-71` | średnie | Wymagać kliknięcia „Zaloguj” albo wysyłać do systemu kont `prompt=login`, gdy aplikacja nie ma sesji. |

### V8 Authorization

| Wymaganie | Stan | Dowód | Ryzyko | Proponowana poprawka |
|---|---|---|---|---|
| **8.1.1** (L1) Dokumentacja definiuje reguły dostępu do funkcji i danych. | spełnione | `docs/system/03-role-i-uprawnienia.md:3-18`; `docs/hackathon/02-kontrakt-api.md:44-51` | niskie | — |
| **8.1.2** (L2) Dokumentacja definiuje reguły dostępu do pól (odczyt i zapis). | niespełnione | reguły rozproszone: `docs/hackathon/02-kontrakt-api.md:77-78` (PESEL), `:88-89` (e-mail tylko do odczytu) | średnie | Dodać do `03-role-i-uprawnienia.md` tabelę uprawnień do pól (odczyt, zapis, rola, stan obiektu). |
| **8.2.1** (L1) Dostęp do funkcji mają tylko konsumenci z jawnym uprawnieniem. | spełnione | `backend/app/Http/Middleware/EnsureRole.php:23-37`; `backend/routes/api/h18.php:24`; `backend/config/public_routes.php:14-19`; wszystkie 77 tras `/admin` i 10 tras prowadzącego mają `role:` (inwentarz tras) | niskie | — |
| **8.2.2** (L1) Dostęp do danych ograniczony do konkretnych rekordów (ochrona przed IDOR/BOLA). | niespełnione | poprawne zawężanie m.in. `backend/app/Services/Chat/ChatThreadQuery.php:25-53`, `backend/app/Policies/DocumentPolicy.php:20-24`; wyjątek: `backend/routes/api/chat.php:40-42`, `backend/app/Http/Controllers/Api/V1/Chat/ThreadMemberController.php:43-56`, `backend/app/Services/H12/SupervisorAssignmentService.php:22-67` | średnie | Dodawać do wątku grupowego tylko osoby już przypisane przez administrację albo jawnie opisać to uprawnienie w matrycy. |
| **8.2.3** (L2) Dostęp do pól ograniczony do jawnie uprawnionych (ochrona przed BOPLA). | spełnione | `backend/app/Http/Controllers/Api/V1/ProfileController.php:38-47`; `backend/app/Http/Requests/H01/UpdateProfileRequest.php:22`; `backend/app/Models/User.php:39-43` (`$hidden`) | niskie | Usunąć z `User::$fillable` pola `role`, `status`, `access_expires_at`, `activation_token` (obrona w głąb). |
| **8.3.1** (L1) Autoryzacja egzekwowana w zaufanej warstwie serwerowej. | spełnione | `docs/system/03-role-i-uprawnienia.md:3-5`; `backend/app/Http/Middleware/EnsureRole.php:23-37`; `frontend/components/permissions/RequireRole.tsx:33-39` (strażnik frontu tylko dla wygody) | niskie | — |
| **8.4.1** (L2) Kontrole między najemcami w aplikacjach wielonajemcowych. | nie dotyczy | `docs/hackathon/02-kontrakt-api.md:458` (jedna aktywna edycja); `backend/app/Services/Lessons/LessonAccess.php:148-156` (grupy produktowe to segmentacja treści, nie najemcy) | niskie | — |

## 4. Luki o ryzyku średnim — opis

1. **6.3.4 — nieudokumentowane ścieżki uwierzytelnienia.** Poza SSO istnieją trzy ścieżki wiązania
   tożsamości: `POST /sso/powiaz`, `POST /applications/first-login` (po potwierdzonym adresie
   e-mail) i polecenie `psychon:sso-powiaz`. Dokumentacja architektury ich nie wymienia, a kontrakt
   API nadal opisuje usunięte logowanie hasłem.
2. **6.4.1 — token zaproszenia bez terminu ważności.** Token jest losowy i jednorazowy, ale
   nie wygasa i leży w bazie jawnie. Ktoś, kto przejmie stare zaproszenie, może nim powiązać
   konto nawet po miesiącach — pod warunkiem potwierdzonego adresu e-mail w systemie kont.
3. **6.8.4 — brak sprawdzenia siły uwierzytelnienia.** Trasy administracyjne przyjmują token
   uzyskany samym hasłem; API nie czyta `acr`, `amr` ani `auth_time`.
4. **7.1.1 — czas sesji nieudokumentowany i niejawny.** Ciasteczko sesji frontu żyje domyślnie
   30 dni (sesja przesuwna), faktyczny limit wyznacza wyłącznie realm spoza repozytorium.
5. **7.4.1 — wylogowanie nie zawsze kończy sesję.** (a) Wylogowanie kanałem zwrotnym z samym
   `sub` (dozwolone przez OIDC Back-Channel Logout) nie zapisuje znacznika, a ścieżka odczytu
   sprawdza tylko `sid`, więc token tej sesji dalej działa. (b) Gdy front nie odczyta adresu
   wylogowania systemu kont, kasuje tylko własne ciasteczko; sesja SSO trwa, a `/logowanie`
   loguje ponownie bez pytania (patrz 7.6.2).
6. **7.4.5 — administrator nie może zakończyć sesji bez blokady konta.**
7. **7.6.2 — sesja tworzona bez działania użytkownika.** `/logowanie` sam wywołuje `signIn`;
   przy żywej sesji SSO wejście na stronę główną tworzy sesję aplikacji bez kliknięcia.
8. **8.1.2 — brak dokumentacji uprawnień do pól.** Kod zawęża pola poprawnie (8.2.3), ale nie ma
   specyfikacji, względem której da się to testować.
9. **8.2.2 — prowadzący może sam przypisać sobie wolontariusza.** Trasa
   `POST /threads/{thread}/members/{user}` (rola `instructor`) tworzy rekord
   `supervisor_assignments` dla dowolnego nieprzypisanego wolontariusza. Prowadzący zyskuje wtedy
   wgląd w postępy, rzetelność i przypadki superwizyjne tej osoby. Matryca ról mówi, że uprawnienia
   „do swoich” wynikają z relacji w bazie (`docs/system/03-role-i-uprawnienia.md:12-13`), a
   przypisanie superwizora jest trasą administracyjną (`PUT /admin/users/{id}/supervisor`).
   Istniejący test `backend/tests/Feature/Chat/GroupThreadCompositionTest.php:66-80` traktuje to
   zachowanie jako zamierzone — rozjazd wymaga decyzji właściciela matrycy, nie cichej poprawki.

## 5. Próby

Każda luka o ryzyku średnim ma aktywną próbę. Próba sprawdza zachowanie, które dziś czyni lukę
realną, więc przechodzi, dopóki luka jest otwarta, i czerwienieje w chwili jej zamknięcia. To
zamierzone: kto zamyka lukę, odwraca próbę w test regresji i aktualizuje wiersz tabeli —
komunikat błędu wskazuje wiersz. Żadna próba nie jest oznaczona jako niedokończona.

- **PHPUnit Feature** — `backend/tests/Feature/Bezpieczenstwo/LukiAsvsDostepuTest.php`,
  7 metod (6.3.4, 6.4.1, 6.8.4, 7.4.1 a, 7.4.5, 8.1.2, 8.2.2), 18 asercji.
- **Vitest** — trzy pliki w `frontend/__tests__/`: `bezpieczenstwo-asvs-dostep.test.ts` (7.1.1),
  `bezpieczenstwo-asvs-wylogowanie.test.tsx` (7.4.1 b), `bezpieczenstwo-asvs-logowanie.test.tsx` (7.6.2).

Dowód, że każda próba pilnuje swojego warunku: dla każdej wykonano bieg po celowym zepsuciu
warunku (czerwony) i po jego przywróceniu (zielony).

| Próba | Celowe zepsucie warunku (zmiana tymczasowa, cofnięta) | Bieg po zepsuciu | Po przywróceniu |
|---|---|---|---|
| 6.3.4 | trzy ścieżki wiązania dopisane do dokumentu architektury | czerwony | zielony |
| 6.4.1 | wyszukanie tokenu zaproszenia z terminem ważności 7 dni | czerwony (422) | zielony |
| 6.8.4 | trasy `/admin` odrzucają token bez podniesionego uwierzytelnienia | czerwony (403) | zielony |
| 7.4.1 a | wylogowanie po samym `sub` oznacza znane `sid` tej osoby | czerwony (401) | zielony |
| 7.4.5 | dodana trasa `/admin/users/{id}/sessions/terminate` | czerwony | zielony |
| 8.1.2 | dopisany rozdział „Uprawnienia do pól” w matrycy ról | czerwony | zielony |
| 8.2.2 | serwis przypisań odmawia dodania nieprzypisanego wolontariusza | czerwony (403) | zielony |
| 7.1.1 | jawne `session.maxAge` w `auth.ts` | czerwony | zielony |
| 7.4.1 b | gałąź błędu wylogowania nawiguje pełnym przejściem | czerwony | zielony |
| 7.6.2 | usunięte automatyczne `signIn` na `/logowanie` | czerwony | zielony |

## 6. Uwagi poza zakresem V6–V8

- Token dostępu trafia do JavaScriptu przeglądarki przez `/api/auth/session` (`frontend/auth.ts:157`),
  a `id_token` przez `/api/auth/end-session-url` (`frontend/app/api/auth/end-session-url/route.ts:47,50`).
  Wymaganie niefunkcjonalne preferuje ciasteczka HttpOnly (`docs/system/06-wymagania-niefunkcjonalne.md:13-15`);
  każdy XSS może odczytać token (ASVS V10/V3).
- Odpowiedź 403 z `EnsureRole` zwraca wymagane role i role wywołującego
  (`backend/app/Http/Middleware/EnsureRole.php:33-34`) — niewielki wyciek struktury ról.
- Cudzy wątek grupowy daje 403 zamiast 404 (`backend/app/Http/Controllers/Api/V1/Chat/ThreadMemberController.php:98-99`),
  wbrew regule „cudzy zasób → 404” (`docs/system/03-role-i-uprawnienia.md:9-11`).
- Grupa ekranów uczestnika nie ma strażnika roli na poziomie `/panel`
  (`frontend/app/(uczestnik)/panel/layout.tsx:10-51`) — tylko wygoda, serwer i tak odmawia.

## 7. Jak zmierzyć wiersze `niezmierzone`

32 wiersze rozstrzyga konfiguracja realmu systemu kont. Eksport realmu **bez sekretów**
dołączony do repozytorium (albo odczyt jego ustawień w przeglądzie) pozwoli ocenić: politykę
hasła (6.2.x, 6.1.2), ochronę przed zgadywaniem haseł (6.3.1), drugi składnik (6.3.3, 6.4.3,
6.4.4, 6.5.x, 6.6.x) i czasy sesji SSO (7.3.x, 7.6.1).
