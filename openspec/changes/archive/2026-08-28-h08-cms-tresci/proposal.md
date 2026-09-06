## Why

Zespół Fundacji nie ma dziś żadnego sposobu, żeby dodać kurs, lekcję ani materiał bez
programisty — treść programu powstaje wyłącznie w seedzie i migracjach (M4 pkt 6).
`routes/api/h08.php` jest pustym stubem, a katalog `app/(administracja)/admin/` nie ma
ekranu `#/admin/kursy`. Jednocześnie tabele `courses`, `lessons` i `materials` mają już
komplet kolumn pod cały zakres pakietu, a ścieżka uczestnika (H05, scalona) czyta je
wprost — brakuje wyłącznie warstwy producenta treści.

Ta warstwa jest wrażliwa: `courses.sequence_order` steruje regułą odblokowań całej
ścieżki (`CourseAccess`), więc jedno kliknięcie w panelu potrafi zablokować albo
odblokować wszystkich uczestników. Dlatego pakiet dowozi nie tylko CRUD, ale też reguły
domenowe chroniące ścieżkę i podgląd wpływu zmiany kolejności przed jej zapisaniem.

## What Changes

- `GET/POST /admin/courses`, `GET/PATCH/DELETE /admin/courses/{course}` — CRUD kursów
  i webinarów (typ, grupa produktowa, pozycja w ścieżce, publikacja). Lista
  administracyjna widzi **także szkice** (`is_published = false`), czego zapytanie H05
  (`CourseCatalogQuery`) z definicji nie robi.
- Dwie reguły domenowe chroniące ścieżkę uczestnika, obie zwracające 422
  `conditions_not_met`: nie publikujemy kursu bez ani jednej lekcji, nie usuwamy kursu,
  który jest prerekwizytem opublikowanego etapu.
- `GET/POST /admin/courses/{course}/lessons`, `PATCH/DELETE /admin/lessons/{lesson}` —
  CRUD lekcji z **miękkim** usuwaniem, które nie kasuje żadnego wiersza
  `lesson_progress`.
- `PATCH /admin/courses/{course}/lessons/reorder` i `PATCH /admin/courses/reorder` —
  zmiana kolejności z transakcyjną renumeracją 1..N obejmującą cały zbiór, bo
  `sequence_order` nie ma unikalności w bazie i duplikat czyni wybór poprzednika
  w `CourseAccess` niedeterministycznym.
- `POST /admin/courses/reorder/preview` — podgląd wpływu: lista osób, których statusy
  zmieni proponowana kolejność, liczona **przez `CourseAccess`** w transakcji cofanej
  po pomiarze, a nie przez reimplementację reguły odblokowań.
- Ekran `#/admin/kursy` (lista + karta kursu + modal potwierdzenia zmiany kolejności),
  wpis w rejestrze menu administracji oraz **rejestr slotów**
  `frontend/lib/slots/admin-courses.ts` jako punkt wejścia dla H08b i H09.
- `POST /admin/lessons/{lesson}/materials`, `POST /admin/courses/{course}/materials`,
  `DELETE /admin/materials/{material}` — upload z walidacją typu i rozmiaru oraz
  usuwanie materiału wraz z plikiem (H08b).
- `POST /admin/courses/{course}/invite` — zaproszenie na kurs poza główną ścieżką,
  realizowane wyłącznie przez `Notify::send('course.invited')` (H08b).
- Wszystkie trasy za flagą `config('features.h08')` i pod middleware
  `role:project_manager,super_admin`.

Pakiet dowozimy **jednym PR-em** obejmującym obie części karty (H08a + H08b); granica
a/b zostaje granicą faz, commitów i jawnego podziału zakresu w `DEMO/H08.md`.

## Capabilities

### New Capabilities

- `course-content-management`: zarządzanie treścią programu przez administrację — CRUD
  kursów i lekcji, publikacja z ochroną ścieżki, miękkie usuwanie lekcji zachowujące
  postęp historyczny, zmiana kolejności z renumeracją 1..N i podglądem wpływu na statusy
  uczestników, audyt `course.created` / `course.updated` / `course.deleted`. Kurs
  utworzony i opublikowany w panelu pojawia się u uczestnika we właściwym miejscu
  ścieżki **bez żadnej zmiany w kodzie** — konsumentem jest scalony już H05.

Część H08b dokłada do tej zmiany dwie kolejne zdolności — `lesson-materials`
(upload, walidacja typu i rozmiaru, usuwanie wraz z plikiem) i `course-invitations`
(zaproszenia → `course.invited`) — nazwane zgodnie z `openspec/specs/README.md`. Ich
pliki spec powstają w fazie 9 planu, razem z implementacją faz 7–8; ta zmiana otwiera
się z jedną zdolnością, żeby proposal nie zapowiadał deltas, których jeszcze nie ma.

### Modified Capabilities

Brak. Pakiet nie zmienia zachowania istniejących tras ani DTO uczestnika:
`course-catalog` (H05) jest wyłącznie **konsumentem** danych, które CMS produkuje, a
`CourseAccess`, `CourseCatalogQuery`, `CourseDetailResource` i `MaterialResource`
pozostają nietknięte. Kryterium ★1 polega właśnie na tym, że po stronie H05 nie ma nic
do wpięcia.

## Impact

- **Backend (nowe pliki):** `backend/routes/api/h08.php` (dziś pusty stub) ·
  kontrolery `Admin\CourseCatalogAdminController`, `Admin\LessonAdminController`,
  `Admin\MaterialAdminController`, `Admin\CourseInviteController` ·
  `FormRequest`-y w `App\Http\Requests\H08\` · serwisy `App\Services\H08\CourseWriter`,
  `LessonWriter`, `SequenceReorderer`, `ReorderImpactPreview`, `MaterialStore` ·
  zasoby `App\Http\Resources\H08\Admin{Course,Lesson,Material}Resource` ·
  testy `tests/Feature/H08/`.
- **Frontend (nowe pliki):** `app/(administracja)/admin/kursy/page.tsx` i
  `kursy/[id]/page.tsx` · `components/h08/ReorderConfirmModal.tsx` ·
  `components/h08b/CourseMaterialsPanel.tsx`, `CourseInvitePanel.tsx` ·
  `lib/slots/admin-courses.ts` · `lib/h08/types.ts` · `lib/menu/admin/h08-kursy.ts`
  plus dwie linie w samo-rejestrującym `lib/menu/admin/index.ts`.
- **Brak migracji.** Schemat jest zamrożony i w pełni wystarczający — `courses`,
  `lessons` (obie z `softDeletes`) i `materials` mają komplet kolumn pod cały zakres.
- **Brak nowych zależności** composer/npm i bibliotek UI. Modal budujemy z natywnego
  `<dialog>` i istniejących tokenów, bo design system nie ma komponentu modala.
- **Brak nowych slugów audytu i typów powiadomień.** Rejestr §3.2 daje H08 tylko
  `course.created/updated/deleted`, rejestr §3.1 tylko `course.invited` — operacje
  podrzędne (lekcje, materiały, reorder, zaproszenia) mapujemy na `course.updated`
  z opisem w `details`.
- **Luka kontraktowa:** `docs/hackathon/02-kontrakt-api.md` nie ma sekcji §2 dla H08.
  Zgłoszenie K1–K12 poszło do strażnika kontraktu przed implementacją; praca biegnie
  równolegle wg propozycji, a rozjazdy nanosi faza 6. Treść zgłoszenia i odpowiedzi
  żyją w `DEMO/H08.md`.
- **Zobowiązanie wobec innych pakietów:** rejestr slotów `admin-courses.ts` jest
  punktem wejścia nie tylko dla H08b, ale i dla H09 (`<AssignmentPanel>`), który jest
  osobnym pakietem i nie może edytować naszych stron.
