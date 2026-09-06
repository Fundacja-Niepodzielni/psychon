## Why

Dziś przy etapie kursu nie wiadomo z systemu, kto go prowadzi. `routes/api/h09.php`
jest pustym stubem, a jedyny konsument prowadzącego (`CourseDetailResource` czyta
aktywne przypisanie kursowe wprost) nie ma czym być zasilany, bo nie istnieje żadna
trasa do zakładania i zdejmowania przypisań ani do prezentacji wizytówek. Bez H09
administracja nie przypisze prowadzącego do kursu ani lekcji, prowadzący nie ma
wizytówki (specjalizacje, doświadczenie, miasto, odpowiedzialność, własny superwizor),
a H17 nie ma wspólnego źródła reguły dziedziczenia, według której pytanie z lekcji
trafia do właściwej osoby (M5).

## What Changes

- `GET /instructors` — paginowana lista wizytówek prowadzących (koperta `{data, meta}`),
  za `auth:sanctum`, dostępna dla każdej zalogowanej roli. DTO wizytówki bez danych
  wrażliwych (bez PESEL i adresu).
- `GET /instructors/{id}` — pojedyncza wizytówka; cudzego/nieistniejącego `id` nie
  ujawniamy inaczej niż `404 not_found`. Dodatkowo `supervisor` (własny superwizor
  prowadzącego z `instructor_profiles.supervisor_id`).
- `GET /me/instructor-profile` + `PATCH /me/instructor-profile` — prowadzący czyta i
  edytuje własną wizytówkę (specjalizacje, bio, doświadczenie, miasto,
  odpowiedzialności). Rola inna niż `instructor` → `403 forbidden`.
- `GET /instructor/courses` — kursy prowadzone przez zalogowanego prowadzącego
  (zasilenie ekranu `#/panel/prowadzacy`); tylko rola `instructor`.
- `GET /admin/courses/{id}/assignments` — aktywne przypisania kursu i jego lekcji.
- `POST /admin/courses/{id}/assignments {instructor_id, lesson_id?}` — założenie
  przypisania (`lesson_id: null` = przypisanie całego kursu). `201` z zasobem
  przypisania. Audyt `assignment.created` + powiadomienie `assignment.created` do
  prowadzącego, którego dotyczy zmiana.
- `DELETE /admin/courses/{id}/assignments {assignment_id}` — odpięcie przez ustawienie
  `unassigned_at = now()` (nigdy twarde `DELETE` wiersza; historia jest potrzebna
  regule „stare pytania zostają u odpowiadającego"). Audyt `assignment.removed` +
  powiadomienie `assignment.removed`.
- Reguła dziedziczenia jako jedno miejsce w kodzie: `AssignmentResolver::forLesson`
  zwraca prowadzącego lekcji (przypisanie z `lesson_id` tej lekcji), a przy jego
  braku prowadzącego kursu (`lesson_id = null`). H17 tę regułę **konsumuje**, nie
  reimplementuje (analogia do `CourseAccess`).
- Niezmienniki domenowe: jedno aktywne przypisanie na parę `(course_id, lesson_id)`;
  `instructor_id` musi wskazywać konto z rolą `instructor`; przypisania i trasy
  administracyjne wyłącznie dla `project_manager` i `super_admin`.
- Trasy rejestrowane **wyłącznie** w `backend/routes/api/h09.php` za
  `config('features.h09')`. Nic nie trafia do `config/public_routes.php`.

Poza zakresem tej zmiany (świadomie, do osobnej rundy): ekrany Next.js
(`#/prowadzacy`, `#/prowadzacy/kursy/:slug`, `#/panel/prowadzacy`), slot wizytówki
w widoku kursu (`lib/slots/course-page.ts`) oraz `<AssignmentPanel>` w
`#/admin/kursy` (`lib/slots/admin-courses.ts`, zależny od merge H08a). Ta zmiana
dowozi backend obu zdolności plus testy; frontend jest kontynuacją.

## Capabilities

### New Capabilities

- `instructor-directory`: wizytówki prowadzących oparte o `instructor_profiles`.
  Lista i pojedyncza wizytówka za logowaniem (`GET /instructors`, `GET /instructors/{id}`),
  edycja własnej wizytówki przez prowadzącego (`GET`/`PATCH /me/instructor-profile`),
  lista kursów prowadzonych przez zalogowanego prowadzącego (`GET /instructor/courses`).
  DTO bez danych wrażliwych; `supervisor` jako własny superwizor prowadzącego.
- `instructor-assignments`: przypisania prowadzących do kursów i lekcji oparte o
  `course_assignments`. Odczyt (`GET /admin/courses/{id}/assignments`), założenie
  (`POST .../assignments`) i odpięcie (`DELETE .../assignments`) z audytem
  `assignment.created` / `assignment.removed` i powiadomieniami tego samego typu.
  Zawiera **regułę dziedziczenia** (lekcja z własnym przypisaniem → jej prowadzący,
  bez → prowadzący kursu) wystawioną jako `AssignmentResolver` do konsumpcji przez
  `instructor-questions` (H17). Niezmienniki: jedno aktywne przypisanie na parę
  `(course, lesson)`, odpięcie przez `unassigned_at`, `instructor_id` z rolą
  `instructor`, dostęp tylko `project_manager` / `super_admin`.

### Modified Capabilities

Brak. `course-catalog` (H05) nie zmienia kontraktu: `CourseDetailResource` już dziś
czyta aktywne przypisanie kursowe i ta zmiana jedynie zasila go danymi przez nowe
trasy. `AssignmentResolver` jest nowym kodem H09; H17 dopiero powstanie i będzie go
konsumował, więc `instructor-questions` nie jest tu modyfikowane.

## Impact

- Nowe pliki backend: rejestracja tras w `backend/routes/api/h09.php`; kontrolery w
  `app/Http/Controllers/Api/V1` (osobne dla wizytówek, wizytówki własnej i
  przypisań); `FormRequest` dla `POST`/`PATCH`/`DELETE`; `Resource` wizytówki i
  przypisania; `App\Services\H09\AssignmentResolver`; testy Feature i Unit.
- Zapis wyłącznie do `course_assignments` (kolumny `instructor_id`, `lesson_id`,
  `assigned_by`, `assigned_at`, `unassigned_at`) i `instructor_profiles` (kolumny
  `specializations`, `bio`, `experience`, `city`, `responsibilities`,
  `supervisor_id`). Odczyt `courses`, `lessons`, `users`.
- Brak zmian w migracjach (schemat kompletny w `2026_01_01_000040_create_courses_tables.php`)
  i brak nowych zależności composer/npm.
- Audyt wyłącznie przez `AuditLog::record` ze slugami `assignment.created` i
  `assignment.removed` (rejestr kontraktu §3.2). Powiadomienia wyłącznie przez
  `Notify::send` z typami `assignment.created` / `assignment.removed` (rejestr §3.1),
  adresat = prowadzący, którego dotyczy zmiana, link `/panel/prowadzacy`.
- Zależność współdzielona z H17: `AssignmentResolver` jest jedynym źródłem reguły
  dziedziczenia; kształt handshake'u i to, czy „nowe pytania do nowej osoby" obejmuje
  pytania zadane przed zmianą, ale nieodpowiedziane, potwierdza strażnik (K8) i
  zapisujemy dosłownie w `DEMO/H09.md`.
- **Luka kontraktowa**: `docs/hackathon/02-kontrakt-api.md` nie ma sekcji §2 dla H09
  (trasy `instructors` i `assignments` nie są opisane). Zgłoszenie K1–K12 do strażnika
  kontraktu **przed implementacją** (przewodnik §4 pkt 2); pełna lista pytań i
  proponowanych odpowiedzi jest w `DEMO/H9-prep-doc.md` §6, a zatwierdzone
  odpowiedzi trafiają dosłownie do `DEMO/H09.md`. Do czasu odpowiedzi strażnika
  implementacja może ruszyć równolegle, rozjazdy naprawiamy przed PR.
- Ryzyko regresji P0: zmiana przypisań wpływa na `GET /courses/{slug}` → `data.instructor`.
  Pokrywamy testem integracyjnym (po odpięciu `instructor` = `null`, po przypisaniu =
  nowa osoba) i uruchamiamy pełną suitę, nie `--filter`.
