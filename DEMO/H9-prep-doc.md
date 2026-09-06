# H09 · Prowadzący — wizytówki i przypisania · dokument przygotowawczy

> **Czym jest ten dokument.** Wyciąg z planu i rozpoznania pakietu **H08**
> (`context/slices/h08-cms-tresci/{plan,research}.md`) ograniczony do rzeczy, które
> **wiążą H09**: zobowiązań, które H08a bierze na siebie wobec nas, decyzji, których
> nie wolno podejmować od nowa, oraz stanu kodu zweryfikowanego na `origin/main`
> w commicie `d9cba8e` (2026-08-28, po scaleniu H01/H03/H04/H12/H15/H16/H18).
> Nie jest to plan H09 — jest to materiał wejściowy do rezerwacji pakietu, zgłoszenia
> kontraktowego i dopiero potem planu.
>
> **Stan H08 w chwili pisania (2026-08-28):** zaplanowany, implementowany na gałęzi
> `pakiet/H08-cms-tresci`, **niezmergowany**. Wszystko poniżej opisane jako „dowozi H08a"
> jest **obietnicą**, nie faktem w `main` — patrz §7 (Ryzyka i sekwencja).

---

## 1. Skąd bierze się zależność H09 → H08a

`docs/hackathon/05-zaleznosci-pakietow.md`:

- `H08a ==>|slot AssignmentPanel| H09` (§ mapa zależności),
- `#/admin/kursy` — **właściciel H08a**, goście: H08b (materiały, zaproszenia)
  i **H09 (`<AssignmentPanel>`)** (§ mapa slotów),
- tor E: `H08a → H08b → H09 → H17`; H08a „odblokowuje H08b i H09" (§ ścieżka krytyczna).

`docs/hackathon/00-przewodnik.md:117-118` powtarza to samo w tabeli własności ekranów:
strona kursu `#/panel/kursy/:slug` należy do H05 (H06/H09/H17 wchodzą slotami),
`#/admin/kursy` należy do H08a (H08b i H09 wchodzą slotami).

**Konsekwencja praktyczna:** H09 ma **dwa** wejścia slotowe i **żadne z nich nie
uprawnia do edycji plików cudzego pakietu**. Cała integracja to *jeden plik komponentu
+ dwie linie w rejestrze* (import + wpis w tablicy).

---

## 2. Co H09 dostaje gotowe — stan zweryfikowany w kodzie

### 2.1 Schemat bazy — komplet, migracje zamrożone

`backend/database/migrations/2026_01_01_000040_create_courses_tables.php:52-72`:

```php
Schema::create('course_assignments', function (Blueprint $table) {
    $table->id();
    $table->foreignId('course_id')->constrained()->cascadeOnDelete();
    $table->foreignId('lesson_id')->nullable()->constrained()->cascadeOnDelete(); // null = whole course
    $table->foreignId('instructor_id')->constrained('users')->cascadeOnDelete();
    $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
    $table->timestamp('assigned_at')->nullable();
    $table->timestamp('unassigned_at')->nullable();
    $table->timestamps();
});

Schema::create('instructor_profiles', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
    $table->json('specializations')->nullable();
    $table->text('bio')->nullable();
    $table->text('experience')->nullable();
    $table->string('city')->nullable();
    $table->json('responsibilities')->nullable();
    $table->foreignId('supervisor_id')->nullable()->constrained('users')->nullOnDelete();
    $table->timestamps();
});
```

Obie tabele pokrywają **cały** zakres karty pakietu (specjalizacje, opis, doświadczenie,
miasto, odpowiedzialność, własny superwizor prowadzącego). **Żadna migracja nie jest
potrzebna** — i żadna nie jest dozwolona (`AGENTS.md`: migracje zamrożone, addytywnie,
tylko przez strażnika schematu).

Uwaga na kolumny, które **nie istnieją** i których nie wolno dorobić:
`course_assignments` nie ma `role`, `is_primary` ani `note`. Kolejność aktywnych
przypisań rozstrzyga wyłącznie `id` (patrz §3.1).

### 2.2 Modele — gotowe, z relacjami

- `backend/app/Models/CourseAssignment.php` — `$fillable` obejmuje wszystkie kolumny,
  castowanie `assigned_at` / `unassigned_at` na `datetime`, relacje `course()`,
  `lesson()`, `instructor()` (`users.instructor_id`), `assignedBy()`.
- `backend/app/Models/InstructorProfile.php` — `specializations` i `responsibilities`
  castowane na `array`, relacje `user()` i `supervisor()`.
- `backend/app/Models/User.php:129` — `instructorProfile(): HasOne`;
  `:139` — `instructorQuestions(): HasMany`.

Modeli **nie trzeba tworzyć**. Zgodnie z konwencją repo przyjętą w H08 (plan §
„Current State Analysis") **nie dodajemy `HasFactory`** do modeli — testy budują dane
przez `Model::create([...])` + `User::factory()->role(...)`.

### 2.3 Konsument wizytówki po stronie uczestnika — **już zmergowany**

`backend/app/Http/Resources/CourseDetailResource.php:44-62` czyta przypisanie sam:

```php
$assignment = CourseAssignment::query()
    ->where('course_id', $this->id)
    ->whereNull('lesson_id')      // course-level assignment
    ->whereNull('unassigned_at')  // aktywne
    ->with('instructor')
    ->orderBy('id')
    ->first();
```

To jest **kontrakt de facto**, którego H09 nie ustala, tylko musi w niego trafić — jest
w `main` i karmi `GET /courses/{slug}` → `data.instructor` (kontrakt §2, sekcja „Kursy").

Trzy wnioski wiążące H09:

1. **Odpięcie to `unassigned_at = now()`, nigdy `DELETE` wiersza.** Twarde usunięcie
   przeszłoby niezauważone przez ten resolver, ale skasowałoby historię przypisań,
   na której stoi kryterium 3 (reguła „stare pytania zostają u starej osoby").
2. **Przypisanie kursowe to `lesson_id = null`.** Przypisanie lekcji (`lesson_id` ≠ null)
   jest niewidoczne dla tego resolvera — i tak ma być: wizytówka kursu pokazuje
   prowadzącego kursu.
3. **Przy wielu aktywnych przypisaniach kursowych wygrywa najniższe `id`.** H09 albo
   wymusza „jedno aktywne przypisanie kursowe na kurs" regułą domenową, albo świadomie
   przyjmuje niedeterminizm prezentacji. Rekomendacja: **wymusić jedno aktywne
   przypisanie na parę (kurs, lekcja)** — to samo pytanie idzie do strażnika jako K5 (§6).

### 2.4 Slot wizytówki w widoku kursu — **rejestr istnieje w `main`**

`frontend/lib/slots/course-page.ts` (właściciel H05) ma **gotowy region `"instructor"`**:

```ts
export type CoursePageRegion = "lesson" | "instructor" | "lesson-actions";

export interface CoursePageSlotProps {
  course: CourseDetail;
  lesson?: LessonSummary;   // tylko dla regionów "lesson" i "lesson-actions"
}
```

`frontend/components/courses/CourseDetail.tsx:21-23` już dziś renderuje ten region:

```ts
const instructorSlots = slotsForRegion("instructor");
const showInstructorCard = course.instructor !== null || instructorSlots.length > 0;
```

**H09 nie czeka na H08 z wizytówką w widoku kursu.** Ta połowa pakietu jest
odblokowana już teraz: nowy plik `frontend/lib/slots/h09-instructor-card.tsx`
+ dwie linie w `course-page.ts` (import i wpis w tablicy). To jedyne dwie linie
w cudzym pliku, na które rejestr jawnie zaprasza (nagłówek pliku: *„Dodaj swój slot
jedną linią do importów i jedną do listy poniżej"*).

⚠️ Precedens do naśladowania: **H06 wszedł tu jako pierwszy gość** (commit w `main`,
`frontend/lib/slots/h06-lesson-link.tsx`) i przy okazji **skonsumował linijki-zaślepki**
`// import hXXNazwa …` / `// hXXNazwa,`. Wzorzec został, komentarza-zaproszenia w środku
tablicy już nie ma — H09 dopisuje swoje dwie linie obok wpisu H06 i **nie rusza niczego
innego** w tym pliku. Kolejność w tablicy nie ma znaczenia dla regionu `"instructor"`
(sortowanie po `order`).

### 2.5 Dane demo — komplet pod kryteria

`backend/database/seeders/DemoSeeder.php:311-336` (`seedInstructor`):

- **Joanna** ma `InstructorProfile` (specjalizacje, bio, doświadczenie, miasto,
  odpowiedzialności) i **trzy przypisania kursowe** (kursy 1–3, `lesson_id = null`,
  `assigned_by = admin`, `assigned_at = now()-10 tygodni`, `unassigned_at = null`).
- Jedno **nieodpowiedziane** pytanie Marty przy pierwszej lekcji kursu 2
  (licznik kolejki = 1) — to jest gotowy materiał demonstracyjny do kryterium 3.

`tests/Feature/SeedIntegrityTest.php` **nie asertuje** dziś nic o przypisaniach ani
profilach prowadzących (sprawdzone). Mimo to obowiązuje reguła R2 z H08: uruchamiać
**pełną** suitę, nie `--filter=H09`.

### 2.6 Infrastruktura wspólna

- `backend/routes/api/h09.php` — pusty stub z komentarzem; **jedyny plik tras, który
  H09 wolno edytować**. Flaga `config('features.h09')` = `true`
  (`backend/config/features.php`).
- Middleware `role:project_manager,super_admin`, koperta błędu `ApiException`,
  fasady `AuditLog::record()` i `Notify::send()` — gotowe.
- Rejestry menu: `frontend/lib/menu/{admin,instructor,participant}/index.ts` —
  samorejestrujące, wzorzec „jeden plik + dwie linie".

---

## 3. Zobowiązania H08a wobec H09 — dokładny kształt

Rejestr slotów ekranu `#/admin/kursy` jest w planie H08 **twardym zobowiązaniem
wobec H09**, nie opcją: decyzja **D12** („Czy H08a dowozi rejestr slotów już
w pierwszym PR? — **Tak**; bez tego H09 nie ma gdzie wejść") i ryzyko **R4**
(„Kolizja o `#/admin/kursy` z H09 → mitygacja: rejestr slotów dowieziony w PR H08a").
Plan H08 wykłada to jeszcze raz w zasadzie prowadzącej nr 3: *„Najpierw host, potem
goście … dokładnie tym samym wejściem posłuży się H09 (`<AssignmentPanel>`), który
jest osobnym pakietem i nie może dotykać naszych plików."*

### 3.1 `frontend/lib/slots/admin-courses.ts` (faza 5 H08a) — kontrakt

Kopia wzorca z `course-page.ts`, uzgodniona w planie H08 (faza 5 pkt 1) i w rozpoznaniu
(§6.1):

```ts
// frontend/lib/slots/admin-courses.ts  (właściciel: H08a)
export type AdminCoursesRegion =
  | "course-materials"     // ← H08b (upload materiałów)
  | "course-assignments"   // ← H09  <AssignmentPanel>
  | "course-actions";      // ← H08b (zaproszenia)

export interface AdminCoursesSlotProps {
  course: AdminCourse;
  lesson?: AdminLesson;
}

export interface AdminCoursesSlot {
  id: string;              // prefiks pakietu, np. "h09-assignment-panel"
  region: AdminCoursesRegion;
  order: number;           // niższy renderuje się pierwszy
  Component: ComponentType<AdminCoursesSlotProps>;
}

export const adminCoursesSlots: AdminCoursesSlot[] = [ /* ← dodaj swój slot jedną linią */ ];
export function slotsForRegion(region: AdminCoursesRegion): AdminCoursesSlot[];
```

Region H09 to **`"course-assignments"`**. H08b zajmuje `order: 100` w regionach
`course-materials` i `course-actions` — regiony są rozłączne, więc H09 może również
użyć `order: 100` w swoim regionie bez kolizji.

**Ważne:** props niosą **`lesson?`**. To jest dokładnie ta oś, której H09 potrzebuje
do przypisania na poziomie lekcji — panel wyrenderowany bez `lesson` obsługuje
przypisanie kursu, z `lesson` — przypisanie pojedynczej lekcji. Jeżeli H08a
wyrenderuje region `course-assignments` **wyłącznie** w kontekście kursu (bez `lesson`),
H09 ma dwie wyjścia: obsłużyć wybór lekcji **wewnątrz własnego panelu** (rekomendowane —
zero zależności od cudzego renderu) albo prosić H08a o dodatkowe miejsce renderu.
**Rekomendacja: własny wybór lekcji w panelu H09.**

### 3.2 `frontend/lib/h08/types.ts` (faza 5 H08a)

`AdminCourse`, `AdminLesson`, `ReorderImpactRow`. H09 **importuje** `AdminCourse`
i `AdminLesson` (są w sygnaturze props slotu) i **nigdy ich nie modyfikuje**.
Kształt wynikający z zasobów H08a:

- `AdminCourse` ← `{id, title, slug, description, type, product_group, sequence_order,
  edition_id, is_published, lessons_count, materials_count, created_at, updated_at}`
- `AdminLesson` ← `{id, course_id, title, description, sequence_order,
  video_provider_id, duration_seconds, materials_count, created_at, updated_at}`

### 3.3 Pozycja w menu administracji

H08a zajmuje `order: 12` („Kursy" → `/admin/kursy`). Zajęte pozycje w `adminMenu`
na `d9cba8e`: **10** (Pulpit, H19), **15** (Ustawienia, H19), **20** (Skrzynka
e-maili, H16 **oraz** Uczestniczki, H18 — kolizja, którą rozstrzyga `sortMenu`),
**25** (Akceptacja stażu, H11), **30** (Profile psychologa, H15); do tego **12**
zarezerwowane przez H08a.

H09 **nie potrzebuje własnej pozycji w menu administracji** — wchodzi slotem w ekran
H08a. Potrzebuje natomiast pozycji w pozostałych rejestrach (patrz §5).

---

## 4. Decyzje z H08, które wiążą H09 (nie podejmuj ich od nowa)

| # | Decyzja | Konsekwencja dla H09 |
|---|---|---|
| **Migracje zamrożone** | Zero migracji, schemat wystarcza | `course_assignments` i `instructor_profiles` używamy **jak są**; brak kolumny = brak funkcji, nie nowa kolumna |
| **Zero nowych zależności** | Bez composer/npm i bibliotek UI | Panel przypisań i wizytówka z istniejących 8 komponentów `components/ui/` + tokenów; modal wzorem `ReorderConfirmModal` (natywny `<dialog>` + `showModal()`) |
| **Jeden plik tras na pakiet** | Edytujemy **wyłącznie** `backend/routes/api/h09.php` | Wszystkie trasy H09 tam, za `config('features.h09')`, wzór `routes/api/h19.php:21-29` |
| **D10 / K12 — audyt operacji podrzędnych** | Nie wymyślamy slugów; mapowanie na sluga właściciela + `details` | H09 **ma własne slugi** w rejestrze §3.2: `assignment.created`, `assignment.removed`. Operacje **na wizytówce** slugów nie mają → mapować na istniejący slug z `details.op` albo pytanie do strażnika (K7, §6) |
| **Kody błędów (plan H08, „Implementation Approach")** | Wyprowadzone z tabeli §1.1 kontraktu, nie z nowej decyzji | reguła domenowa blokująca operację → **422 `conditions_not_met`** z `reason`; błędy pól → **422 `validation_failed`**; cudzy/nieistniejący zasób po id → **404 `not_found`**; brak roli → **403 `forbidden`** (middleware) |
| **R8 — bramka `PublicRoutesSmokeTest`** | Nic nie dopisujemy do `config/public_routes.php` | `GET /instructors` **nie jest publiczne** — ekran `#/prowadzacy` jest za logowaniem. Lista publicznych tras (login, reset, activate, `verify/*`, `materials/*/download`) pozostaje nietknięta |
| **R2 — pełna suita, nie `--filter`** | H19 pominął ten krok i to wypłynęło w review | Po każdej fazie `docker compose exec app php artisan test` w całości |
| **R7 — tablica na `main`** | Zakaz `git push origin main` | Rezerwacja H09 idzie osobną gałęzią `docs/board-h09-claim` → PR → merge przez kogoś innego (precedens: `docs/board-h15-claim`, `docs/status-sync-h02-h12`) |
| **R1 — los H12** | Brak sekcji kontraktu → `BLOCKED` przy review | **Kontrakt nie ma sekcji §2 dla H09** (sprawdzone: `grep instructors\|assignments` po `02-kontrakt-api.md` = zero trafień). Zgłoszenie do strażnika **przed** kodem, odpowiedzi dosłownie w `DEMO/H09.md` |
| **Dyscyplina slotów** | Gość nie edytuje plików hosta | H09 dopisuje **jeden plik + dwie linie** w każdym rejestrze; nigdy nie edytuje stron H05 ani H08a |

**Pliki cudze — bezwzględnie nie dotykamy** (lista z sprintu H08, rozszerzona o pliki
H08a): `app/Support/*` (fasady sztabu, w tym `CourseAccess`), `app/Queries/CourseCatalogQuery.php`,
`app/Http/Resources/{MaterialResource,CourseDetailResource,CourseListResource}.php`,
`config/public_routes.php`, strony `frontend/app/(administracja)/admin/kursy/**`,
`frontend/lib/h08/types.ts`. Wyjątek — **dwie linie rejestracyjne** w
`frontend/lib/slots/course-page.ts` i `frontend/lib/slots/admin-courses.ts`, na które
oba rejestry jawnie zapraszają komentarzem.

---

## 5. Zakres H09 — co dokładnie trzeba dowieźć

Karta pakietu (`docs/hackathon/01-pakiety-zadan.md:214-231`) + M5
(`docs/system/04-specyfikacja-modulow-mvp.md:115-129`).

**Ekrany:** `#/prowadzacy` (lista wizytówek), `#/prowadzacy/kursy/:slug`,
`#/panel/prowadzacy`, slot wizytówki w widoku kursu, slot `<AssignmentPanel>`
w `#/admin/kursy`.

**Endpointy z karty:** `GET /instructors` (+ `/{id}`) ·
`POST /admin/courses/{id}/assignments` · `DELETE /admin/courses/{id}/assignments`
(**`assignment_id` w ciele** — nietypowe, ale tak stoi w karcie; do potwierdzenia jako K1).

**Kryteria odbioru:**

1. ★ **Reguła dziedziczenia:** lekcja z własnym przypisaniem → jej prowadzący;
   bez przypisania → prowadzący kursu (testy **obu** ścieżek).
2. ★ **Przypisanie/odpięcie → powiadomienie + audyt** (`assignment.created` /
   `assignment.removed` — oba są w rejestrach §3.1 i §3.2 przypisane do H09).
3. **Po zmianie prowadzącego nowe pytanie trafia do nowej osoby, stare zostaje
   u starej** (test wspólny z H17).

**Matryca ról** (`docs/system/03-role-i-uprawnienia.md:50`):
„Panel: przypisywanie prowadzących" → **wyłącznie `project_manager` i `super_admin`**
(middleware `role:project_manager,super_admin`, tak samo jak CMS w H08). Wiersz „Kursy: przeglądanie i nauka" daje prowadzącemu
`S (prowadzone + podgląd)` — to jest podstawa ekranu `#/prowadzacy/kursy/:slug`.

### 5.1 Kryterium 3 — mechanika wyprowadzona z kodu

`instructor_questions` (`migrations/2026_01_01_000090_create_communication_tables.php:39-48`)
ma kolumny: `user_id`, `lesson_id`, `question`, `answer`, `answered_by`, `answered_at`.
**Nie ma kolumny `instructor_id`.**

To rozstrzyga kryterium 3 bez żadnej migracji:

- pytanie **nieodpowiedziane** nie jest do nikogo przypięte — adresat liczy się
  **w chwili odczytu** z aktualnych przypisań (lekcja → fallback kurs), więc po zmianie
  prowadzącego nowe *i* nieodpowiedziane pytania idą do nowej osoby automatycznie;
- pytanie **odpowiedziane** ma stempel `answered_by` + `answered_at`, więc „stare
  zostaje u odpowiadającego" wynika z danych, nie z reguły.

**Reguła dziedziczenia jest wspólna z H17** i to H17 jest właścicielem routingu pytań.
H09 powinien wystawić ją jako **jedno miejsce w kodzie** (np. `App\Services\H09\AssignmentResolver`
z metodą `forLesson(Lesson $lesson): ?User`), żeby H17 jej nie reimplementował — dokładnie
tak, jak `CourseAccess` jest jedynym źródłem reguły odblokowań dla H05/H08.
Zgłosić do strażnika jako pytanie o kształt handshake'u (K8, §6).

⚠️ Do rozstrzygnięcia w planie: czy „nowe pytania idą do nowej osoby" obejmuje pytania
**zadane przed** zmianą, ale **jeszcze nieodpowiedziane**. Odczyt M5 pkt 2 („zmiana
prowadzącego przenosi **nowe** pytania na nową osobę, stare zostają u odpowiadającego")
sugeruje, że granicą jest **fakt odpowiedzi**, nie data zadania — i tylko taka wykładnia
daje się zaimplementować bez migracji. Zapisać jawnie w `DEMO/H09.md`.

### 5.2 Uwaga terminologiczna — dwa różne „superwizory"

- `instructor_profiles.supervisor_id` — **własny superwizor prowadzącego**, element
  wizytówki (zakres H09, brak sluga audytu).
- `supervisor.assigned` w rejestrze §3.2 — przypisanie **superwizora wolontariuszowi**,
  własność **H12/H18**, trasa `PUT /admin/users/{id}/supervisor`. **Jest już
  zmergowane** (`backend/app/Services/H12/SupervisorAssignmentService.php`,
  `DEMO/H12.md`, `DEMO/H18.md`).

Nie mieszać. H09 **nie** emituje `supervisor.assigned` i **nie** dotyka
`supervisor_assignments` — jego jedyny „superwizor" to kolumna
`instructor_profiles.supervisor_id` w wizytówce.

---

## 6. Luka kontraktowa H09 i propozycja zgłoszenia

Kontrakt `docs/hackathon/02-kontrakt-api.md` **nie ma sekcji §2 dla H09** — dokładnie
ta sama luka, która w H08 dała ryzyko R1 i która pogrążyła H12. Zgłoszenie idzie do
strażnika **przed implementacją** (przewodnik §4 pkt 2, SLA 30 min), z **proponowanymi
odpowiedziami**, żeby strażnik odpowiadał „tak/nie", a nie projektował od zera.
Odpowiedzi trafiają **dosłownie** do `DEMO/H09.md` (wzór: `DEMO/H05.md`).

| # | Pytanie | Propozycja |
|---|---|---|
| **K1** | Kształt odpięcia — karta mówi `DELETE /admin/courses/{id}/assignments` z `assignment_id` **w ciele**; kontrakt §1 preferuje akcje domenowe jako `POST` na pod-zasób | Zostawić kształt z karty: `DELETE /admin/courses/{courseId}/assignments {assignment_id}` → 200 `{data:{id, unassigned: true}}`; alternatywa dla strażnika: `DELETE /admin/assignments/{id}` |
| **K2** | Pełna lista tras H09 | `GET /instructors` · `GET /instructors/{id}` · `GET /admin/courses/{id}/assignments` · `POST /admin/courses/{id}/assignments` · `DELETE /admin/courses/{id}/assignments` · `GET /me/instructor-profile` + `PATCH` (edycja własnej wizytówki) · `GET /instructor/courses` (ekran `#/panel/prowadzacy`) |
| **K3** | Payload przypisania | `POST /admin/courses/{id}/assignments {instructor_id, lesson_id?}` → 201 z zasobem przypisania; `lesson_id: null` = przypisanie kursu |
| **K4** | Kształt DTO wizytówki (`GET /instructors`) | `{id, user_id, first_name, last_name, city, specializations[], bio, experience, responsibilities[], courses:[{id, slug, title, sequence_order}]}`; `GET /instructors/{id}` dodatkowo `supervisor: {id, name}|null` |
| **K5** | Czy dopuszczamy **wiele aktywnych** przypisań na tę samą parę (kurs, lekcja)? `CourseDetailResource` bierze `orderBy('id')->first()`, więc prezentacja byłaby niedeterministyczna | **Nie** — jedno aktywne przypisanie na parę; ponowne przypisanie przy istniejącym aktywnym → **422 `conditions_not_met`** albo automatyczne odpięcie poprzednika (do wskazania przez strażnika) |
| **K6** | Czy `instructor_id` musi mieć rolę `instructor`? | Tak — walidacja `exists:users,id` + sprawdzenie roli; inna rola → 422 `validation_failed` |
| **K7** | Slug audytu dla **edycji wizytówki** (rejestr §3.2 daje H09 tylko `assignment.created` / `assignment.removed`) | Analogicznie do K12 z H08: nie rozszerzać rejestru; mapować na istniejący slug z opisem w `details` **albo** — jeżeli strażnik woli — nie audytować edycji własnej wizytówki (nie jest to dana wrażliwa) |
| **K8** | Kto jest właścicielem **reguły dziedziczenia** jako kodu (handshake z H17) | H09 wystawia `AssignmentResolver::forLesson(Lesson): ?User` jako jedyne źródło reguły; H17 **konsumuje**, nie reimplementuje — analogia do `CourseAccess` |
| **K9** | Czy `GET /instructors` jest publiczne (ekran `#/prowadzacy` bez logowania)? | **Nie.** Nic nie dopisujemy do `config/public_routes.php` (R8); ekran za `auth:sanctum` |
| **K10** | Widoczność wizytówki: czy uczestnik widzi `GET /instructors` w całości, czy tylko prowadzących swoich kursów | Cała lista dla zalogowanych — wizytówka jest treścią programową, nie daną wrażliwą; PESEL/adres **nie wchodzą** do DTO |
| **K11** | Paginacja `GET /instructors` | Standard kontraktu §1: `?page&per_page` (max 100), koperta `{data, meta}` |
| **K12** | Treść powiadomień `assignment.created` / `assignment.removed` — kto jest adresatem | Adresat = **prowadzący**, którego dotyczy zmiana; link `/panel/prowadzacy`; `Notify::send` tworzy równocześnie wiersz `emails` ze statusem `simulated` (`Notify.php:36-45`) |

---

## 7. Ryzyka i sekwencja — kiedy H09 może ruszyć

| # | Ryzyko | Mitygacja |
|---|---|---|
| **RA** | **H08a nie jest zmergowany.** Rejestr `lib/slots/admin-courses.ts` i typy `lib/h08/types.ts` powstają dopiero w fazie 5 H08 | Podzielić H09 tak, jak H08 podzielił się na a/b: **H09a** = backend (trasy, resolver, audyt, powiadomienia) + wizytówka w slocie H05 (`course-page.ts` **jest w `main` już dziś**) → nie czeka na nic. **H09b** = `<AssignmentPanel>` w `#/admin/kursy` → czeka na merge H08a |
| **RB** | H08a dowiezie rejestr o innym kształcie niż w planie (nazwa regionu, props) | Kształt z §3.1 jest **zapisany w planie H08 i w jego rozpoznaniu §6.1** — traktować jako uzgodniony; przed pisaniem `AssignmentPanel` **przeczytać faktyczny plik** z gałęzi H08 i dopiero potem kodować |
| **RC** | Kolizja o ekran `#/admin/kursy` z H08b | Regiony są rozłączne: H08b bierze `course-materials` i `course-actions`, H09 bierze `course-assignments`. Zero wspólnych plików poza dwiema liniami rejestru |
| **RD** | Kryterium 3 wymaga **testu wspólnego z H17**, a H17 nie jest jeszcze zrobiony | Test kryterium 3 pisze H09 **po swojej stronie** (resolver: lekcja z przypisaniem → jej prowadzący, bez → kursu; pytanie odpowiedziane zachowuje `answered_by`). Handshake z H17 zgłosić jako K8 i odnotować w `DEMO/H09.md` |
| **RE** | Brak kontraktu §2 → `BLOCKED` przy review (los H12) | Zgłoszenie K1–K12 przed kodem; odpowiedzi dosłownie w `DEMO/H09.md` |
| **RF** | Regresja P0 — zmiana przypisań psuje `GET /courses/{slug}` u uczestnika | Test integracyjny: po odpięciu prowadzącego `data.instructor` = `null`, po przypisaniu = nowa osoba; pełna suita, nie `--filter=H09` |
| **RG** | Limit ~400 linii i jeden otwarty PR na zespół | Podział RA (H09a/H09b) daje naturalną granicę dwóch PR-ów; jeżeli zespół zdecyduje o jednym PR-ze — zapisać to jawnie w `DEMO/H09.md`, jak zrobił H08 |

**Sekwencja rekomendowana:**

```
teraz            → H09a: backend (routes/api/h09.php, resolver, audyt, Notify)
                        + wizytówka w slocie course-page.ts  (nic nie blokuje)
po merge H08a    → H09b: <AssignmentPanel> w slocie admin-courses.ts
```

---

## 8. Checklist startowy H09 (kolejność obowiązkowa)

1. **Tablica koordynacyjna** — `openspec/changes/koordynacja-pakietow-h01-h21/tasks.md`
   wiersz **4.5** („H09 — Wizytówki i przypisania prowadzących · Właściciel: `@_____` ·
   Status: `GOTOWE`"). Ustawić właściciela i `W TOKU` **osobną gałęzią**
   `docs/board-h09-claim` → PR → merge przez kogoś innego. Status na gałęzi pakietu
   **nie rezerwuje pakietu** (`AGENTS.md`).
2. **Zgłoszenie kontraktowe K1–K12** do strażnika (§6), **przed** implementacją.
   Praca może ruszyć równolegle (precedens H08), rozjazdy naprawiamy przed PR-em.
3. **Gałąź** `pakiet/H09-prowadzacy` odbita od aktualnego `origin/main`,
   celowo **bez upstreamu**, żeby gołe `git push` nie mogło trafić w `main`.
4. **Zmiana OpenSpec** `openspec/changes/h09-prowadzacy/` — `.openspec.yaml`
   (`schema: spec-driven` + `created`), `proposal.md` (`## Why` / `## What Changes` /
   `## Capabilities` / `## Impact`), `design.md`, `tasks.md` oraz
   `specs/<zdolność>/spec.md` (`### Requirement:` + `#### Scenario:`).
   **Nazwy zdolności są już ustalone** w `openspec/specs/README.md:51-52`:
   **`instructor-directory`** (wizytówki) i **`instructor-assignments`** (przypisania
   + reguła dziedziczenia). README dodaje wiążącą wskazówkę (`:78-81`): *„Reguła
   dziedziczenia żyje w `instructor-assignments`, bo to ona decyduje, dokąd trafia
   pytanie (współdzielony scenariusz z `instructor-questions`)"* — czyli scenariusz
   kryterium 3 pisze **H09**, a H17 go konsumuje. Artefakty po polsku, nagłówki
   strukturalne i SHALL/MUST po angielsku.
5. **`DEMO/H09.md`** — założyć od razu: zakres, ustalenia kontraktowe (dosłowne
   odpowiedzi strażnika), co działa, jak pokazać, czego brakuje, znane ograniczenia.
   Tablica wymaga istnienia tego pliku do zamknięcia wiersza 4.5.
6. **Przed każdym commitem:** `docker compose exec app php artisan test` (pełna suita),
   `./vendor/bin/pint`, `npm run lint -- --fix`, `npm run build`,
   `openspec validate h09-prowadzacy --strict`.
7. **PR:** `gh pr create --repo tomekwilczak/psychon-hackaton --base main
   --head pakiet/H09-prowadzacy`. **Zabronione:** push na `main`, push na `upstream`,
   `gh pr create` bez `--repo`, **merge własnego PR-a**.

---

## 9. Czego H09 **nie** robi

- **Żadnych migracji** — `course_assignments` i `instructor_profiles` są kompletne.
- **Żadnych nowych zależności** composer/npm ani bibliotek UI.
- **Nie reimplementuje reguły odblokowań** (`CourseAccess`) — przypisania nie mają
  z nią nic wspólnego.
- **Nie modyfikuje `CourseDetailResource`** — resolver wizytówki uczestnika jest
  zmergowany i H09 się w niego wpasowuje, a nie go zmienia.
- **Nie edytuje stron ani typów H08a** — wejście wyłącznie przez
  `lib/slots/admin-courses.ts`.
- **Nie routuje pytań** — to własność H17; H09 dostarcza wyłącznie regułę dziedziczenia
  jako kod do skonsumowania.
- **Nie dopisuje nic do `config/public_routes.php`.**
- **Nie emituje `supervisor.assigned`** (własność H12/H18) ani żadnego sluga spoza
  §3.2.
- **Nie usuwa twardo przypisań** — odpięcie to `unassigned_at`.

---

## 10. Źródła

- Plan H08: `context/slices/h08-cms-tresci/plan.md` (fazy 5 i 9, „Implementation
  Approach", „What We're NOT Doing")
- Rozpoznanie H08: `context/slices/h08-cms-tresci/research.md` (§4.1 tabela K1–K12,
  §6.1 rejestr slotów, §7 decyzje D1–D13, §8 ryzyka R1–R8)
- Sprint H08: `context/sprints/sprint-002-h08-cms-tresci.md` („Cross-cutting decisions")
- Karta pakietu H09: `docs/hackathon/01-pakiety-zadan.md:214-231`
- Zależności i mapa slotów: `docs/hackathon/05-zaleznosci-pakietow.md` (§ mapa slotów,
  tor E, tabela pakietów)
- Własność ekranów: `docs/hackathon/00-przewodnik.md:117-118`
- Reguły biznesowe: `docs/system/04-specyfikacja-modulow-mvp.md:115-129` (M5)
- Matryca ról: `docs/system/03-role-i-uprawnienia.md:50`
- Mapa zdolności OpenSpec: `openspec/specs/README.md:51-52` i `:78-81`
  (`instructor-directory`, `instructor-assignments`)
- Tablica koordynacyjna: `openspec/changes/koordynacja-pakietow-h01-h21/tasks.md:36`
  (wiersz 4.5, na `d9cba8e` nadal `GOTOWE` — pakiet wolny)
- Kontrakt API: `docs/hackathon/02-kontrakt-api.md` — §1.1 (kody), §3.1/§3.2
  (`assignment.created`, `assignment.removed`), **brak sekcji §2 dla H09**
- Kod: `backend/database/migrations/2026_01_01_000040_create_courses_tables.php:52-72`,
  `backend/app/Models/{CourseAssignment,InstructorProfile}.php`,
  `backend/app/Http/Resources/CourseDetailResource.php:44-62`,
  `backend/database/seeders/DemoSeeder.php:311-336`,
  `frontend/lib/slots/course-page.ts`,
  `frontend/components/courses/CourseDetail.tsx:21-23`,
  `backend/routes/api/h09.php`, `backend/config/public_routes.php`
