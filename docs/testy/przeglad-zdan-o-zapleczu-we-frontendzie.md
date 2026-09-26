# Przegląd komentarzy frontu: zdania o zapleczu, które się zestarzały

Notatka pomiarowa. Stan na **2026-09-26**, gałąź bazowa `sprint-2`
(`f7ebe3170d33e1bcf3b67d362f84f989fd749f29`). Przegląd objął komentarze we `frontend/**`,
które mówią o trasie, roli albo polu odpowiedzi zaplecza. Każde takie zdanie sprawdzono
w `backend/routes` i `backend/app` (tam, gdzie trzeba, także w `backend/config`).
**Ani kod, ani komentarze nie zostały zmienione.** Ta notatka jest jedyną zmianą w gałęzi.

## 1 · Wynik

| Wielkość | Liczba |
|---|---|
| Pliki `.ts/.tsx/.mjs/.js/.css` we `frontend/` (git) | 414 |
| Pliki z co najmniej jednym komentarzem | 350 |
| Bloki komentarzy (sąsiednie `//` scalone w jeden blok) | 1267 |
| Wiersze komentarzy | 5125 |
| **A** — zdania, które są dziś treściowo nieprawdziwe | **13** |
| **B** — zdania prawdziwe, ale z odnośnikiem do wiersza zaplecza, pod którym dziś jest co innego | **13** |

Wszystkie odnośniki `plik.php:wiersz` we frontendzie (45 wystąpień) sprawdzono
mechanicznie: wydrukowano wskazane wiersze (§4) i porównano z twierdzeniem.
Lista B to wszystkie te, które pokazują dziś pusty wiersz, `}` albo inny kod.

## 2 · Lista A — zdania dziś nieprawdziwe

### A1 · Prowadzący edytuje kurs „tymi samymi punktami API co administracja”

- **Plik:** `frontend/lib/menu/instructor/h08-kursy.ts:5`
- **Cytat:** „Kursy przypisane prowadzącemu — edycja treści (dane kursu, lekcje, materiały) tych samych punktów API co administracja, ograniczona do kursów z własnym `CourseAssignment`”
- **Dlaczego nieprawdziwe dziś:** Trasy `/admin/courses/…`, `/admin/lessons/…` i `/admin/materials/…` przepuszczają tylko administrację, więc prowadzący dostałby na nich 403. Prowadzący ma osobny zestaw tras `/instructor/…`, a przez PATCH kursu zmienia tylko tytuł i opis.
- **Co jest prawdą:**
  - Grupa administracji ma `role:project_manager,super_admin` (`backend/routes/api/h08.php:32`).
  - Prowadzący ma osobną grupę z `role:instructor` (`backend/routes/api/h08.php:68`). Należą do niej trasy kursu (`:69-70`), lekcji (`:72-75`) i materiałów (`:77-79`).
  - PATCH kursu przepuszcza tylko `['title', 'description']` (`backend/app/Http/Controllers/Api/V1/H08/InstructorCourseController.php:31`, `:53`).
  - Front woła `/instructor/courses/${courseId}` (`frontend/lib/api/prowadzacy-kursy.ts:20`).

### A2 · „403 = konto zablokowane/usunięte/zanonimizowane” przy `POST /sso/powiaz`

- **Plik:** `frontend/app/aktywacja/page.tsx:78`
- **Cytat:** „403 = konto zablokowane/usunięte/zanonimizowane (SsoBindController) —”
- **Dlaczego nieprawdziwe dziś:** 403 z tej trasy przychodzi także wtedy, gdy adres e-mail w Kontach Niepodzielni nie jest potwierdzony (`email_not_verified`). To sprawdzenie biegnie przed sprawdzeniem stanu konta. Oba sprawdzenia są w `ApplicationFirstLoginBinder`, a nie w `SsoBindController`.
- **Co jest prawdą:**
  - `SsoBindController` przekazuje całą pracę do `ApplicationFirstLoginBinder::bindByInvitationToken` (`backend/app/Http/Controllers/Api/V1/SsoBindController.php:36`).
  - Binder najpierw woła `verifiedEmail()` (`backend/app/Services/H03/ApplicationFirstLoginBinder.php:64`). Ta metoda zwraca 403 `email_not_verified` (`:96-101`).
  - Dopiero potem binder zwraca 403 `forbidden` dla konta zablokowanego, usuniętego albo zanonimizowanego (`:114-115`).

### A3 · Karta prowadzącego czyta kurs z `GET /admin/courses/{course}`

- **Plik:** `frontend/components/testy/TestWiedzyKursu.tsx:17`
- **Cytat:** „`AdminCourseResource` (H08, `GET /admin/courses/{course}` — ten sam zasób, z którego karta prowadzącego czyta kurs)”
- **Dlaczego nieprawdziwe dziś:** Prowadzący nie ma dostępu do tej trasy. Karta prowadzącego czyta kurs z `GET /instructor/courses/{course}`. Kształt odpowiedzi jest ten sam (`AdminCourseResource`), ale trasa jest inna.
- **Co jest prawdą:**
  - `GET /admin/courses/{course}` (`backend/routes/api/h08.php:35`) należy do grupy administracji (`:32`).
  - Prowadzący czyta kurs przez `GET /instructor/courses/{course}` (`backend/routes/api/h08.php:69`).
  - Ta trasa zwraca `AdminCourseResource` (`backend/app/Http/Controllers/Api/V1/H08/InstructorCourseController.php:63`).

### A4 · „Nie ma dziś danych”, z których prowadzący zbudowałby link do testu

- **Plik:** `frontend/components/testy/TestWiedzyKursu.tsx:20-22`
- **Cytat:** „Zasób osiągalny wyłącznie dla roli `instructor` (`GET /instructor/courses`, H09 → `InstructorCourseSummary`) niesie jeszcze mniej pól, więc nie ma dziś danych, z których dałoby się zbudować ten link inaczej”
- **Dlaczego nieprawdziwe dziś:** `GET /instructor/courses` nie jest jedynym zasobem kursu dla roli `instructor`. Trasa `GET /instructor/courses/{course}/tests` zwraca test kursu razem z jego `id`, czyli dokładnie z tą daną, której brakuje linkowi `/prowadzacy/testy/{id}/pytania`.
- **Co jest prawdą:**
  - Trasa ma `role:instructor` (`backend/routes/api/h10.php:50-51`).
  - Kontroler zwraca `TestGrader::present($test)` (`backend/app/Http/Controllers/Api/V1/H10/InstructorTestController.php:37`).
  - Ten kształt zawiera `'id' => $test->id` (`backend/app/Support/H10/TestGrader.php:43`).

### A5 · Pulpit „linkuje do konkretnej kolejki”

- **Plik:** `frontend/components/ui/Tabs.tsx:18-19`
- **Cytat:** „pulpit (H19) linkuje do konkretnej kolejki, a nie do „ekranu z zakładkami" — bez tego licznik zgłoszeń otwierałby listę osób.”
- **Dlaczego nieprawdziwe dziś:** Zaplecze oddaje dla kolejki zgłoszeń sam adres `/admin/uczestniczki`, bez parametru zakładki. Pulpit wstawia go do `href` bez zmian, a ekran bez parametru otwiera pierwszą zakładkę, „Osoby”. Licznik zgłoszeń otwiera więc dziś właśnie listę osób.
- **Co jest prawdą:**
  - Kolejka `applications` ma `'link' => '/admin/uczestniczki'` (`backend/app/Services/H19/DashboardSummary.php:42`). Oddaje ją `GET /admin/dashboard` (`backend/routes/api/h19.php:26`).
  - Po stronie frontu: `href={queue.link}` (`frontend/app/(administracja)/admin/page.tsx:113`), a pierwsza zakładka to `osoby` (`frontend/app/(administracja)/admin/uczestniczki/page.tsx:32`).

### A6 · „Nic nigdy nie wychodzi w świat”

- **Plik:** `frontend/app/(administracja)/admin/emails/page.tsx:67`
- **Cytat:** „Nic nigdy nie wychodzi w świat — status jest zawsze `simulated` na hackathonie.”
- **Dlaczego nieprawdziwe dziś:** Zaplecze wysyła już prawdziwą wiadomość przez skonfigurowany mailer: zaproszenie po przyjęciu zgłoszenia (H03). Druga połowa zdania nadal się zgadza, bo wiersze skrzynki mają status `simulated`.
- **Co jest prawdą:**
  - `ApplicationAcceptor` woła `ApplicationInvitationMailer::send` (`backend/app/Services/H03/ApplicationAcceptor.php:134`).
  - Ta metoda wysyła wiadomość przez `Mail::raw(...)` (`backend/app/Services/H03/ApplicationInvitationMailer.php:44`).
  - Opis klasy: „wysyła jedną wiadomość przez skonfigurowany mailer” (`:12-17`).
  - Wiersze `email_messages` mają `'status' => 'simulated'` (`backend/app/Support/Notify.php:54`, `backend/app/Http/Controllers/Api/V1/Admin/AdminUserController.php:281`).

### A7 · „Treść generuje wyłącznie Notify::send … zescapowany HTML”

- **Plik:** `frontend/app/(administracja)/admin/emails/page.tsx:205-206`
- **Cytat:** „Treść generuje wyłącznie Notify::send po stronie backendu (nl2br(e($body))) — bezpieczny, zescapowany HTML.”
- **Dlaczego nieprawdziwe dziś:** Wiersze skrzynki powstają w dwóch miejscach. Zaproszenie przy `POST /admin/users` zapisuje `body_html` bezpośrednio, jako surowy HTML ze znacznikiem `<a href>`, bez `e()`. Ekran pokazuje tę treść przez `dangerouslySetInnerHTML`.
- **Co jest prawdą:**
  - Są dwa wywołania `EmailMessage::create` w `backend/app`. Pierwsze, `backend/app/Support/Notify.php:49-53`, escapuje treść (`nl2br(e($body))`).
  - Drugie, `backend/app/Http/Controllers/Api/V1/Admin/AdminUserController.php:275-283`, sklejka HTML z `$activationUrl`. Woła je `sendInvitationEmail` (`:100`).
  - `EmailResource` oddaje `body_html` bez zmian (`backend/app/Http/Resources/EmailResource.php:23`).

### A8 · „Ten sam brak backendu, co przy edytorze treści kursu”

- **Plik:** `frontend/app/(prowadzacy)/prowadzacy/testy/[id]/pytania/page.tsx:26-27`
- **Cytat:** „ten sam brak backendu, co przy edytorze treści kursu (`KursProwadzacego.tsx`)”
- **Dlaczego nieprawdziwe dziś:** Edytor treści kursu prowadzącego ma już własne trasy z `role:instructor`, a `KursProwadzacego.tsx` z nich korzysta. Po tej stronie nie brakuje więc niczego. Bank pytań zostaje tylko dla administracji, i jest to decyzja zapisana przy trasach, a nie brak.
- **Co jest prawdą:**
  - Trasy edytora kursu prowadzącego są w `backend/routes/api/h08.php:68-80`.
  - Przy grupie prowadzącego w H10 stoi komentarz „Bez banku pytań — ten zostaje w panelu administracji.” (`backend/routes/api/h10.php:49`).
  - Trasy banku pytań (`backend/routes/api/h10.php:39-42`) są w grupie administracji (`:34`).

### A9 · Zdanie o braku powiązania „jest prawdziwe” po 401 bez `error.reason.sub`

- **Plik:** `frontend/app/logowanie/niepowiazane/page.tsx:28-30`
- **Cytat:** „Tamto zdanie jest twierdzeniem i pojawia się dopiero wtedy, kiedy jest prawdziwe: po odpowiedzi 401 BEZ `error.reason.sub` (token nieważny, `error.code === "unauthenticated"`).”
- **Dlaczego nieprawdziwe dziś:** Zaplecze sygnalizuje brak powiązania wyłącznie odpowiedzią 401 `konto_niepowiazane` z `reason.sub`. Odpowiedź 401 `unauthenticated` bez `sub` oznacza co innego: brak albo nieważność tokena, sesję wylogowaną przez back-channel albo konto zablokowane, usunięte lub zanonimizowane. W żadnym z tych przypadków zdanie o braku powiązania nie jest prawdziwe.
- **Co jest prawdą:**
  - Jedyne wyjście „brak powiązania” to `throw new AccountNotLinkedException($principal->sub)` (`backend/app/Services/Keycloak/KeycloakGuardResolver.php:79`). Ten wyjątek zwraca 401 `konto_niepowiazane` z `reason: ['sub' => …]` (`backend/app/Exceptions/AccountNotLinkedException.php:34-39`).
  - Pozostałe wyjścia to `return null` (`KeycloakGuardResolver.php:43`, `:49`, `:53`, `:83`, `:87`, `:100`).
  - Renderer zamienia je na 401 `unauthenticated` bez `reason` (`backend/app/Exceptions/ApiExceptionRenderer.php:44-47`).

### A10 · Link do materiału „ważny 15 minut”

- **Plik:** `frontend/lib/courses.ts:38`
- **Cytat:** „Podpisany link ważny 15 minut — kontrakt §2 „podpisany, wygasa".”
- **Dlaczego nieprawdziwe dziś:** Czas ważności pochodzi z konfiguracji i domyślnie wynosi 300 s, czyli 5 minut. Żaden plik w repozytorium nie ustawia `NP_MATERIAL_LINK_TTL_SECONDS` (sprawdzone przez `grep -rn NP_MATERIAL_LINK_TTL_SECONDS` poza `vendor/` i `node_modules/`).
- **Co jest prawdą:**
  - `download_url` powstaje przez `URL::temporarySignedRoute(…, now()->addSeconds((int) config('courses.material_link_ttl_seconds')), …)` (`backend/app/Http/Resources/MaterialResource.php:28-35`).
  - Konfiguracja: `'material_link_ttl_seconds' => (int) env('NP_MATERIAL_LINK_TTL_SECONDS', 300)` (`backend/config/courses.php:19`).

### A11 · `video_provider_id` jako „mock — bez uploadu wideo”

- **Plik:** `frontend/lib/h08/types.ts:44`
- **Cytat:** „Tekstowy identyfikator nagrania (mock — bez uploadu wideo).”
- **Dlaczego nieprawdziwe dziś:** Zaplecze ma prawdziwe wgrywanie nagrań do Bunny Stream. `video_provider_id` przechowuje GUID zwrócony przez Bunny, a z tego pola zaplecze podpisuje link odtwarzania.
- **Co jest prawdą:**
  - Wgrywanie obsługuje `POST /admin/lessons/{lesson}/video-uploads` z `role:super_admin` (`backend/routes/api/video.php:22-24`).
  - Kontroler zapisuje `$lesson->video_provider_id = $videoId;` (`backend/app/Http/Controllers/Api/V1/Admin/BunnyVideoAdminController.php:96`).
  - Pole odczytuje `VideoTokenService::videoId()` (`backend/app/Services/Video/VideoTokenService.php:146-155`).
  - Link odtwarzania wydaje `GET /lessons/{lesson}/video-link` (`backend/routes/api/video.php:18-20`).

### A12 · Slugi audytu „zgadzają się 1:1 — 30 i 30”

- **Plik:** `frontend/lib/h20/__tests__/audit-actions-source-of-truth.test.ts:27-28`
- **Cytat:** „dziś (mierzone poniżej) obie listy się zgadzają 1:1 — 30 unikalnych sluganow w wywołaniach `record()`, 30 pozycji w `ACTIONS`”
- **Dlaczego nieprawdziwe dziś:** Wywołania `AuditLog::record` zapisują 33 unikalne slugi, a `ACTIONS` ma 30. Trzech slugów spoza listy nie da się filtrować w dzienniku, czyli zachodzi dokładnie ten rozjazd, który komentarz opisuje jako hipotetyczny.
- **Co jest prawdą:**
  - `ACTIONS` ma 30 pozycji (`backend/app/Http/Requests/H20/AuditIndexRequest.php:18-33`), a filtr to `Rule::in(self::ACTIONS)` (`:45`).
  - Poza listą są trzy slugi:
    - `cooperation_request.created` (`backend/app/Http/Controllers/Api/V1/H01/CooperationRequestController.php:56`);
    - `cooperation_request.answered` (`backend/app/Http/Controllers/Api/V1/H01/AdminCooperationRequestController.php:75`);
    - `supervision.slot_cancelled`, zapisywany przez stałą (`backend/app/Services/H12/SupervisionSlotService.php:28`, `:113`) przy `DELETE /admin/supervision/slots/{id}` (`backend/routes/api/h12.php:49`).
  - Każdy z 30 slugów `ACTIONS` ma swoje wywołanie `record()` (pomiar w §4).

### A13 · Etykiety `reason.missing` „z koperty 403”

- **Plik:** `frontend/components/Forbidden.tsx:3`
- **Cytat:** „Etykiety PL dla kluczy `reason.missing` z koperty 403 (kontrakt §1.1).”
- **Dlaczego nieprawdziwe dziś (częściowo):** W kopercie 403 (`course_locked`) przychodzą tylko dwa z sześciu kluczy mapy: `lessons` i `test`. Pozostałe cztery (`courses`, `internship`, `supervision`, `workshop`) zaplecze wysyła wyłącznie w odpowiedzi **422** `conditions_not_met`.
- **Co jest prawdą:**
  - `course_locked` niesie `missing` z `lessons`/`test` (`backend/app/Support/CourseAccess.php:63-66`, `backend/app/Http/Controllers/Api/V1/CourseController.php:112`).
  - Klucze warunków certyfikatu idą w 422 `conditions_not_met` (`backend/app/Http/Controllers/Api/V1/CertificateController.php:37-42`, klucze w `backend/app/Support/H13/CertificateConditions.php:45`, `:52`, `:59`, `:66`).

## 3 · Lista B — prawdziwa treść, nieaktualny numer wiersza zaplecza

Każde z tych zdań mówi prawdę o trasie albo roli. Wskazany wiersz zawiera jednak dziś
pusty wiersz, `}`, komentarz albo inny kod. „Wskazany” to wiersz z komentarza frontu,
„dziś” to wiersz, w którym ta treść naprawdę stoi.

| # | Plik frontu | Cytat odnośnika | Pod wskazanym wierszem dziś | Gdzie jest to, o czym mowa |
|---|---|---|---|---|
| B1 | `frontend/app/(uczestnik)/panel/certyfikat/layout.tsx:4` | `backend/routes/api/h13.php:25` | komentarz `// Uczestnik: warunki, wydanie…` | `role:volunteer`: `backend/routes/api/h13.php:26` |
| B2 | `frontend/app/(uczestnik)/panel/staz/layout.tsx:4` | `backend/routes/api/h11.php:25` | pusty wiersz | `role:volunteer`: `backend/routes/api/h11.php:26` |
| B3 | `frontend/components/h20/ReportView.tsx:232` | `ReportSummary.php:71-72` | docblock `@return` (opis pól wiersza) | warunek ról: `backend/app/Services/H20/ReportSummary.php:213`; filtr edycji tylko dla `closing()`: `:219-221`, `:157`; `build()` woła `people()` bez edycji: `:100` |
| B4 | `frontend/lib/chat.ts:86` | `routes/api/chat.php:29` | pusty wiersz | `GET /threads/{thread}`: `backend/routes/api/chat.php:36` |
| B5 | `frontend/lib/chat.ts:93` | `routes/api/chat.php:30` | `if (! config('features.chat', true)) {` | `POST /threads/{thread}/messages`: `backend/routes/api/chat.php:37` |
| B6 | `frontend/lib/menu/__tests__/participant-roles-contract.test.ts:43` | `backend/routes/api/h01.php:24-25` | `}` i pusty wiersz | grupa `auth:keycloak`: `backend/routes/api/h01.php:26`, `GET /me`: `:27` |
| B7 | `frontend/lib/menu/__tests__/participant-roles-contract.test.ts:45` | `backend/routes/api/h01.php:24-26` | `}`, pusty wiersz, otwarcie grupy | `GET/PATCH /me`: `backend/routes/api/h01.php:27-28` |
| B8 | `frontend/lib/menu/__tests__/participant-roles-contract.test.ts:49` | `backend/routes/api/h11.php:25` | pusty wiersz | `backend/routes/api/h11.php:26` |
| B9 | `frontend/lib/menu/__tests__/participant-roles-contract.test.ts:51` | `backend/routes/api/h12.php:25` | pusty wiersz | `backend/routes/api/h12.php:26` |
| B10 | `frontend/lib/menu/participant/h-po-programie.ts:5` | `backend/routes/api/h01.php:24-25` | `}` i pusty wiersz | `backend/routes/api/h01.php:26-27` |
| B11 | `frontend/lib/menu/participant/h11-staz.ts:5` | `backend/routes/api/h11.php:25` | pusty wiersz | `backend/routes/api/h11.php:26` |
| B12 | `frontend/lib/menu/participant/h12-superwizja.ts:5` | `backend/routes/api/h12.php:25` | pusty wiersz | `backend/routes/api/h12.php:26` |
| B13 | `frontend/lib/menu/instructor/h15-watek-grupowy.ts:12` | `ThreadController.php:56-57` | `/** @var Collection … */ $threads = collect();` | własny wątek grupowy dla `instructor`: `backend/app/Http/Controllers/Api/V1/Chat/ThreadController.php:74-75`; wolontariusz dostaje wątek grupowy swojego superwizora, nie własny: `:70` |

Poza tymi 13 wszystkie pozostałe odnośniki `*.php:wiersz` we frontendzie (32 z 45) wskazują
dziś właściwą treść. Jeden przypadek graniczny nie trafił do listy:
`frontend/lib/h22/legal-documents.ts:16` → `LegalDocumentController.php:22-35`. Zakres
obejmuje całe ciało `current()` bez klamry zamykającej (`:36`).

## 4 · Jak to zmierzono (do powtórzenia)

1. **Wyciągnięcie komentarzy.** Parser TypeScript (`typescript` zainstalowany globalnie)
   przeszedł każdy plik `.ts/.tsx/.mjs/.js` we `frontend/` (bez `node_modules/`, `.next/`).
   Zebrał komentarze wiodące i końcowe każdego węzła oraz puste wyrażenia JSX
   `{/* … */}`, a sąsiednie wiersze `//` scalił w jeden blok. Z plików `.css` wzięto bloki
   `/* … */`. Wynik: 1267 bloków, 5125 wierszy, 350 plików.
2. **Przegląd.** Wszystkie bloki podzielono na siedem porcji po około 1000–1200 wierszy i
   przeczytano w całości. Każde zdanie o trasie, roli albo polu odpowiedzi porównano z
   `backend/routes/api.php`, `backend/routes/api/*.php`, `backend/routes/web.php`,
   `backend/bootstrap/app.php` oraz kodem w `backend/app` i `backend/config`. `php artisan
   route:list` nie był dostępny, bo w piaskownicy nie ma `vendor/`, więc trasy czytano
   wprost z plików. Każdą pozycję list A i B sprawdzono ponownie ręcznie: otwarto wskazany
   plik i wiersz zaplecza.
3. **Odnośniki do wierszy.** Polecenie z katalogu głównego repozytorium:

   ```bash
   grep -rnoE "[A-Za-z0-9_/.-]+\.php:[0-9]+(-[0-9]+)?" frontend \
     --include=*.ts --include=*.tsx --include=*.mjs | sort -u
   ```

   Dla każdego z 45 wyników wydrukowano wskazany zakres (`sed -n A,Bp`) i porównano go
   z twierdzeniem komentarza.
4. **Slugi audytu (A12).** Z katalogu `backend/`:

   ```bash
   grep -rn -A2 "AuditLog::record(" app | grep -oE "'[a-z_]+\.[a-z_]+'" | tr -d "'" | sort -u
   grep -rn "AuditLog::record(" app | grep -v "'[a-z_]*\.[a-z_]*'"
   ```

   Pierwsze polecenie łapie też kody `op`, np. `lessons.reordered` z ładunku
   `course.updated`. To nie są slugi i zostały odrzucone po odczycie miejsca wywołania.
   Drugie pokazuje wywołania przez stałą (`SupervisionSlotService::CANCELLED_AUDIT_ACTION`)
   i wywołania z literałem w następnym wierszu (`AccessController.php:44-46`,
   `access.extended`). Wynik: 33 slugi, a `ACTIONS` ma 30. Wszystkie 30 z `ACTIONS`
   występują w wywołaniach.

## 5 · Sprawdzone, a nie zgłoszone (przypadki graniczne)

- `frontend/app/konto/page.tsx:45`: gałąź „odmowa roli” przy 403 z `GET /sso/whoami`.
  Trasa nie ma `role:` (`backend/routes/api/sso.php:28`), a middleware zwraca tylko 401.
  To jednak gałąź obronna, a komentarz nie twierdzi, że zaplecze tak odpowiada.
- `frontend/app/aktywacja/page.tsx:75`: „401 = sesja się skończyła w międzyczasie”.
  `/sso/powiaz` zwraca 401 także dla tokena z obcym wystawcą
  (`backend/app/Services/H03/ApplicationFirstLoginBinder.php:93`). To uproszczenie w
  granicach „nieważny token”, a nie nieprawda.
- `frontend/app/(prowadzacy)/prowadzacy/testy/[id]/pytania/page.tsx:24-26`: „dopóki backend
  nie doda roli `instructor`”. Opis stanu bieżącego jest poprawny (`backend/routes/api/h10.php:34-42`).
  Zapowiedź zmiany stoi jednak w sprzeczności z decyzją z `h10.php:49` (patrz A8).
- `frontend/components/h11/AdminInternshipQueue.tsx:20`: opisuje dwie akcje ekranu.
  Trzecia decyzja zaplecza (`POST /admin/internship/{id}/reject`,
  `backend/routes/api/h11.php:39`) istnieje, ale komentarz nie twierdzi, że decyzje są tylko dwie.
- `frontend/components/h12/AdminSupervisionSlots.tsx:22-26` i
  `frontend/components/h12/SupervisionSlots.tsx:22`: „obecność odnotowuje prowadzący”.
  Zgadza się z kodem (`backend/routes/api/h12.php:40-41`, tylko `role:instructor`). Z kodem
  rozjeżdża się kontrakt §2 H12, nie komentarz.
- `frontend/components/questions/LessonQuestions.tsx:47` („trasa jeszcze niezatwierdzona”):
  zgodne z opisem przy trasie (`backend/routes/api/h17.php:29-31`).
- `frontend/components/onboarding/types.ts:4-5`, `frontend/lib/questions.ts:4-8`,
  `frontend/lib/h13/types.ts:3-7`: odsyłacze do sekcji kontraktu, których tam nie ma albo
  które mówią o czymś innym. To nieścisłość wobec dokumentu, a nie wobec zaplecza.
  Kształty odpowiedzi opisane w tych komentarzach zgadzają się z kodem.
- `frontend/lib/api/logowanie.ts:101-108`: 401 nazwane „wiem, że nie masz roli”. To luźne
  brzmienie komunikatu ekranu, a nie twierdzenie o kodzie odpowiedzi.
- `frontend/app/(administracja)/admin/certyfikaty/page.tsx:35` („trasa zaplecza istniała bez
  odbiorcy”) i `frontend/lib/pulpit/data.ts:37-40` („stare odpowiedzi API go nie mają”):
  zdania historyczne.

## 6 · Poza zakresem tej notatki (kod, nie komentarz)

- `frontend/components/permissions/Forbidden403.tsx:6` (typ) i `:37` (odczyt) używają
  `reason.your_role`. `EnsureRole` wysyła `your_roles`, w liczbie mnogiej
  (`backend/app/Http/Middleware/EnsureRole.php:34`). To rozjazd w kodzie, nie w komentarzu,
  więc tu go tylko odnotowuję i nie poprawiam.
- Pliki `.md` we `frontend/` (`README.md`, `AUDYT-DOSTEPNOSCI.md`, `CHANGELOG-P2.md`,
  `PRODUCT.md`, `AGENTS.md`) to dokumentacja, a nie komentarze w kodzie, i nie były
  przeglądane. `frontend/.env.local.example` i `frontend/scripts/pomiar-kc.sh` przejrzano:
  jedyne zdanie o zapleczu („klient API sam dokleja /api/v1”) jest prawdziwe
  (`frontend/lib/api/klient.ts:126`).
