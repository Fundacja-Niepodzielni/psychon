## Context

Zob. `proposal.md` — Why oraz `DEMO/H9-prep-doc.md` (pełne rozpoznanie stanu kodu).
Stan istotny dla podejścia:

- `backend/routes/api/h09.php` to pusty stub; `config('features.h09')` = `true`.
  To jedyny plik tras, który H09 wolno edytować.
- Schemat kompletny (`2026_01_01_000040_create_courses_tables.php`):
  `course_assignments` (`course_id`, `lesson_id` nullable, `instructor_id`,
  `assigned_by`, `assigned_at`, `unassigned_at`), `instructor_profiles`
  (`user_id` unique, `specializations` json, `bio`, `experience`, `city`,
  `responsibilities` json, `supervisor_id` nullable). Migracje zamrożone.
- Modele gotowe: `CourseAssignment` (relacje `course`, `lesson`, `instructor`,
  `assignedBy`), `InstructorProfile` (casty `array`, relacje `user`, `supervisor`),
  `User::instructorProfile(): HasOne`, `User::instructorQuestions(): HasMany`,
  `User::fullName()`.
- `CourseDetailResource::instructor()` (plik integracyjny, własność H05) już czyta
  aktywne przypisanie kursowe: `where course_id`, `whereNull lesson_id`,
  `whereNull unassigned_at`, `orderBy id`, `first`. To jest kontrakt de facto —
  H09 w niego trafia, nie zmienia go.
- Middleware `role:` (`EnsureRole`) w `bootstrap/app.php`; błędy przez
  `ApiException` + `ApiExceptionRenderer` (koperta `error`).
- `AuditLog::record(actor, action, subject?, details?)` — slug wyłącznie z §3.2.
  `Notify::send(user, type, title, body, link?)` — typ wyłącznie z §3.1; tworzy
  równocześnie rekord `emails` `simulated`.
- Seed demo (`DemoSeeder::seedInstructor`): Joanna z `InstructorProfile` i trzema
  aktywnymi przypisaniami kursowymi (kursy 1–3, `lesson_id = null`), plus jedno
  nieodpowiedziane pytanie Marty przy pierwszej lekcji kursu 2.

Luka kontraktowa: `docs/hackathon/02-kontrakt-api.md` nie ma sekcji §2 dla H09.
Pytania K1–K12 z proponowanymi odpowiedziami są w `DEMO/H9-prep-doc.md` §6 i idą
do strażnika kontraktu przed implementacją. Poniższe decyzje przyjmują te
proponowane odpowiedzi; rozbieżności naprawiamy przed PR i zapisujemy dosłownie w
`DEMO/H09.md`.

## Goals / Non-Goals

**Goals:**

- Backend obu zdolności (`instructor-directory`, `instructor-assignments`) plus
  testy Feature i Unit, wszystko za `config('features.h09')` w
  `routes/api/h09.php`.
- Reguła dziedziczenia w jednym miejscu: `App\Services\H09\AssignmentResolver`,
  gotowa do konsumpcji przez H17 bez reimplementacji (analogia do `CourseAccess`).
- Odpięcie przypisania jako `unassigned_at = now()`, nigdy `DELETE` wiersza —
  historia jest wymagana przez regułę „stare pytania zostają u odpowiadającego".
- Zero regresji `GET /courses/{slug}` → `data.instructor` (test integracyjny +
  pełna suita).

**Non-Goals:**

- Ekrany Next.js (`#/prowadzacy`, `#/prowadzacy/kursy/:slug`, `#/panel/prowadzacy`),
  slot wizytówki w `lib/slots/course-page.ts`, `<AssignmentPanel>` w
  `lib/slots/admin-courses.ts`. Osobna runda; `<AssignmentPanel>` dodatkowo czeka
  na merge H08a.
- Routing pytań do prowadzącego — własność H17. H09 dostarcza wyłącznie
  `AssignmentResolver`; H17 go woła.
- Zmiana `CourseDetailResource` / `CourseListResource` / `CourseCatalogQuery` /
  `CourseAccess` — pliki integracyjne, tylko odczyt zgodny z istniejącym kształtem.
- Emisja `supervisor.assigned` ani dotykanie `supervisor_assignments` — to
  własność H12/H18. Jedyny „superwizor" H09 to kolumna
  `instructor_profiles.supervisor_id` w wizytówce, ustawiana przez administrację
  (poza zakresem tej rundy — brak trasy w kontrakcie), prezentowana do odczytu.
- Nowe kolumny (`course_assignments` nie ma `role`, `is_primary`, `note` —
  nie dorabiamy).
- Wpis do `config/public_routes.php` — nic nie jest publiczne.

## Decisions

### D1: Trzy kontrolery jednoodpowiedzialnościowe zamiast jednego zasobowego

- `InstructorDirectoryController` (`index`, `show`) — `GET /instructors`,
  `GET /instructors/{id}`.
- `MyInstructorProfileController` (`show`, `update`, `courses`) —
  `GET`/`PATCH /me/instructor-profile`, `GET /instructor/courses`.
- `CourseAssignmentController` (`index`, `store`, `destroy`) —
  `GET`/`POST`/`DELETE /admin/courses/{course}/assignments`.

Podział jak w H12 (kontroler na aktora: uczestnik / prowadzący / administracja),
bo trasy dzielą aktora i middleware, nie zapytanie bazowe. Alternatywa (jeden
`InstructorController` na wszystko) odrzucona — mieszałaby trzy różne bramki ról.

### D2: `AssignmentResolver` jako jedyne źródło reguły dziedziczenia

`App\Services\H09\AssignmentResolver` z metodami:

- `forLesson(Lesson $lesson): ?User` — aktywne przypisanie z `lesson_id = $lesson->id`;
  przy braku aktywne przypisanie kursowe (`lesson_id = null`,
  `course_id = $lesson->course_id`); przy braku obu `null`. Determinizm:
  `orderBy('id')` (ten sam tie-break, co `CourseDetailResource`).
- `forCourse(Course $course): ?User` — samo przypisanie kursowe (zasila
  `GET /instructor/courses` i testy regresji wizytówki).

H17 woła `forLesson` w miejscu ustalania adresata pytania. Handshake (czy „nowe
pytania do nowej osoby" obejmuje pytania zadane przed zmianą, ale nieodpowiedziane)
— pytanie K8 do strażnika; wykładnia domyślna: granicą jest **fakt odpowiedzi**
(`answered_by`/`answered_at`), nie data zadania, bo tylko ona jest wykonalna bez
migracji (`instructor_questions` nie ma kolumny `instructor_id`). Zapis w
`DEMO/H09.md`.

Alternatywa (reguła w `CourseAssignment` jako scope albo w resource) odrzucona —
H17 musi ją wołać z własnego kodu, więc musi być wolnostojącą usługą, nie
szczegółem prezentacji.

### D3: Niezmiennik „jedno aktywne przypisanie na parę (course, lesson)"

Egzekwowany w `CourseAssignmentController::store` przed zapisem: zapytanie o
istniejące aktywne przypisanie tej pary; jeśli jest → `ApiException(422,
'conditions_not_met')` z `reason.assignment_id`. Rzut przed `AuditLog::record` i
`Notify::send`, więc audyt i powiadomienia nie rosną. Bazy nie chronimy indeksem
unikalnym (migracje zamrożone), więc `AssignmentResolver` i tak trzyma
deterministyczny tie-break `orderBy('id')` na wypadek danych historycznych.

Alternatywa (auto-odpięcie poprzednika przy nowym przypisaniu) — do wskazania
przez strażnika (K5). Domyślnie: odrzucamy drugie przypisanie, administracja
najpierw odpina, potem przypisuje. Zmiana tej decyzji nie rusza specyfikacji
tras, tylko treść jednego scenariusza.

### D4: Walidacja roli `instructor` dla `instructor_id`

`StoreCourseAssignmentRequest`: `instructor_id` → `exists:users,id` plus reguła
sprawdzająca `role === 'instructor'` (closure albo `Rule::exists` z `where`).
Inna rola → 422 `validation_failed` (nie 404 — konto istnieje, dane wejściowe są
błędne). `lesson_id` (opcjonalne) → `exists:lessons,id` plus reguła „należy do
kursu z URL" (`where('course_id', $courseId)`); niespełnienie → 422
`validation_failed`.

### D5: DTO wizytówki bez danych wrażliwych

`InstructorProfileResource` zwraca `id`, `user_id`, `first_name`, `last_name`,
`city`, `specializations` (`[]` gdy null), `bio`, `experience`, `responsibilities`
(`[]` gdy null), `courses` (z `AssignmentResolver::forCourse` odwróconego:
aktywne przypisania kursowe danego prowadzącego → `{id, slug, title,
sequence_order}` sort `sequence_order`). `GET /instructors/{id}` dokłada
`supervisor` = `{id, name}` z `instructor_profiles.supervisor_id` albo `null`.
Bez `email`, `pesel`, `address`. `first_name`/`last_name` czytane z relacji
`user`.

### D6: `GET /me/instructor-profile` tworzy rekord przy pierwszym `PATCH`

Prowadzący bez rekordu `instructor_profiles`: `GET` zwraca wizytówkę z pustymi
polami (`specializations: []`, `bio: null`, …) albo 404 — wybór do potwierdzenia,
domyślnie **pusta wizytówka 200** (ekran ma co pokazać). Pierwszy poprawny `PATCH`
robi `firstOrCreate(['user_id' => $me->id])` i wypełnia. `PATCH` przyjmuje
wyłącznie `specializations`, `bio`, `experience`, `city`, `responsibilities`
(`UpdateMyInstructorProfileRequest`); `user_id` i `supervisor_id` nie są polami
wejściowymi (ignorowane albo 422). Bez audytu edycji własnej wizytówki (K7:
`assignment.*` to jedyne slugi H09, a wizytówka nie jest daną wrażliwą) — jeśli
strażnik zażąda audytu, mapujemy na istniejący slug z `details.op`.

### D7: Middleware per grupa tras

- `GET /instructors`, `GET /instructors/{id}` — `['auth:sanctum', 'access.active']`
  (jak katalog kursów H05; treść programowa za aktywnym dostępem).
- `GET`/`PATCH /me/instructor-profile`, `GET /instructor/courses` —
  `['auth:sanctum', 'role:instructor']`, bez `access.active` (self-service
  profilu, wzór H01 `/me`).
- `GET`/`POST`/`DELETE /admin/courses/{course}/assignments` —
  `['auth:sanctum', 'role:project_manager,super_admin']`.

Wartości `access.active` do potwierdzenia u strażnika (nie zmienia kształtu
odpowiedzi).

### D8: Powiadomienia i audyt tylko przy realnej zmianie stanu

`store`: po zapisie → `AuditLog::record($actor, 'assignment.created', $assignment,
['course_id' => …, 'lesson_id' => …])` + `Notify::send($instructor,
'assignment.created', <tytuł PL>, <treść PL>, '/panel/prowadzacy')`.
`destroy`: analogicznie `assignment.removed` do prowadzącego, którego dotyczyło
przypisanie. Ponowne/sprzeczne `destroy` (rekord już `unassigned`) → 404
`not_found`, bez audytu i powiadomienia (wzór z H11: „powtórzona decyzja nie
generuje dodatkowego audytu i powiadomienia").

### D9: Test regresji wizytówki kursu

Feature test: seed → `GET /courses/{slug}` daje `data.instructor` = Joanna →
`DELETE` jej przypisania kursowego → `data.instructor` = `null` → `POST` nowego
prowadzącego → `data.instructor` = nowy. Uruchamiane w pełnej suicie
(`docker compose exec app php artisan test`), nie `--filter`.

## Risks / Trade-offs

- [Brak sekcji §2 kontraktu dla H09] → zgłoszenie K1–K12 przed kodem; praca
  równolegle, rozjazdy naprawiane przed PR, odpowiedzi dosłownie w `DEMO/H09.md`.
  Precedens: brak sekcji pogrążył H12 przy review.
- [Kryterium 3 wymaga testu wspólnego z H17, a H17 nie istnieje] → H09 testuje
  `AssignmentResolver` po swojej stronie (lekcja z przypisaniem → jej prowadzący;
  bez → kursu; pytanie odpowiedziane zachowuje `answered_by`). Handshake to K8.
- [Kształt `DELETE` z ciałem żądania] → nietypowe, ale tak stoi w karcie pakietu;
  K1 proponuje alternatywę `DELETE /admin/assignments/{id}`. Do rozstrzygnięcia
  przez strażnika przed implementacją trasy.
- [`/me/instructor-profile` jako nowa podścieżka `/me`] → kontrakt §1 traktuje
  `/me` jako wyjątek zastany; nowe podścieżki wymagają zgody strażnika (K2).
  Alternatywa: `/instructor-profile` (bez `/me`).
- [Brak indeksu unikalnego na aktywnym przypisaniu] → niezmiennik tylko na
  poziomie aplikacji; `AssignmentResolver` ma deterministyczny tie-break, więc
  dane historyczne z duplikatem nie psują prezentacji.
- [Odpięcie jako `unassigned_at`, nie `DELETE`] → tabela rośnie monotonicznie;
  akceptowalne w skali MVP, a historia jest wymagana przez regułę kryterium 3.
- [Reużycie kształtu `CourseDetailResource::instructor()`] → tylko odczyt zgodny
  z istniejącym zapytaniem; gdyby H05 zmienił kształt, H09 podąża (pożądane).

## Open Questions

- Odpowiedzi strażnika kontraktu na K1–K12 (`DEMO/H9-prep-doc.md` §6): kształt
  `DELETE`, dopuszczalność `/me/instructor-profile`, kształt DTO wizytówki i
  przypisania, zachowanie przy drugim przypisaniu tej samej pary (odrzucić vs
  auto-odpiąć), audyt edycji wizytówki, `access.active` na `/instructors`.
  Żadna z tych odpowiedzi nie zmienia podziału na zdolności ani listy zadań —
  najwyżej treść pojedynczych scenariuszy i `FormRequest`.
- K8: czy „nowe pytania do nowej osoby" obejmuje pytania zadane przed zmianą
  prowadzącego, ale jeszcze nieodpowiedziane. Domyślna wykładnia: granicą jest
  fakt odpowiedzi. Ostateczny kształt handshake'u ustala się z H17 przy jego
  starcie; `AssignmentResolver` API (`forLesson`) się nie zmienia.
