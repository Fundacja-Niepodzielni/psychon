## 1. Koordynacja i kontrakt

- [x] 1.1 Potwierdzić rezerwację pakietu: wiersz 4.5 w
  `openspec/changes/koordynacja-pakietow-h01-h21/tasks.md` ma właściciela i status
  `W TOKU` widoczny na `origin/main` (PR `docs/board-h09-claim` scalony). Weryfikacja:
  `git show origin/main:openspec/changes/koordynacja-pakietow-h01-h21/tasks.md | grep H09`
  pokazuje właściciela i `W TOKU`.
- [ ] 1.2 Zgłosić strażnikowi kontraktu pytania K1–K12 z `DEMO/H9-prep-doc.md` §6
  (brak sekcji §2 dla H09). Weryfikacja: wątek zgłoszenia istnieje, odpowiedzi
  spisane dosłownie w `DEMO/H09.md`. **Krok koordynacyjny (człowiek) — implementacja
  ruszyła równolegle na proponowanych odpowiedziach, do rozliczenia przed PR.**
- [x] 1.3 Założyć `DEMO/H09.md` (zakres, kryteria ★, ustalenia kontraktowe, co
  działa, jak pokazać, znane ograniczenia). Weryfikacja: plik istnieje i wymienia
  kryteria 1–3 z karty pakietu.
- [ ] 1.4 Nanieść zatwierdzone odpowiedzi strażnika na `proposal.md`, `design.md` i
  oba pliki `specs/*` (jeśli zmieniają scenariusze lub `FormRequest`). Weryfikacja:
  `openspec validate h09-prowadzacy-wizytowki-przypisania --strict` przechodzi.

## 2. Reguła dziedziczenia (rdzeń współdzielony z H17)

- [x] 2.1 Utworzyć `backend/app/Services/H09/AssignmentResolver` z
  `forLesson(Lesson): ?User` i `forCourse(Course): ?User` (aktywne przypisania,
  `whereNull('unassigned_at')`, tie-break `orderBy('id')`; lekcja → fallback kurs
  → `null`). Weryfikacja: test Unit `AssignmentResolverTest` pokrywa trzy ścieżki
  (lekcja z własnym przypisaniem, lekcja bez, brak jakiegokolwiek).
- [x] 2.2 Dodać test Unit ścieżki zmiany prowadzącego: odpięcie B
  (`unassigned_at`) + nowe przypisanie C → `forLesson` zwraca C dla lekcji bez
  własnego przypisania. Weryfikacja: test przechodzi.

## 3. Przypisania — `instructor-assignments`

- [x] 3.1 Zarejestrować w `backend/routes/api/h09.php` (za `config('features.h09')`)
  trasy `GET`/`POST`/`DELETE /admin/courses/{course}/assignments` pod
  `['auth:sanctum', 'role:project_manager,super_admin']`. Weryfikacja:
  `php artisan route:list --path=admin/courses` pokazuje trzy trasy.
- [x] 3.2 `CourseAssignmentController::index` + `CourseAssignmentResource` —
  aktywne przypisania kursu i jego lekcji (`id`, `course_id`, `lesson_id`,
  `instructor{id,first_name,last_name}`, `assigned_by`, `assigned_at`). Nieznany
  kurs → 404. Weryfikacja: test Feature odczytu przypisań Joanny z seeda.
- [x] 3.3 `StoreCourseAssignmentRequest` — `instructor_id` istnieje i ma rolę
  `instructor` (inaczej 422), `lesson_id` opcjonalne i należy do kursu z URL
  (inaczej 422). Weryfikacja: testy Feature obu naruszeń walidacji.
- [x] 3.4 `CourseAssignmentController::store` — niezmiennik „jedno aktywne
  przypisanie na parę `(course_id, lesson_id)`": istniejące aktywne → 422
  `conditions_not_met` z `reason.assignment_id`, bez zapisu, audytu i
  powiadomienia. Sukces → rekord (`assigned_by` = actor, `assigned_at = now()`),
  201 z zasobem. Weryfikacja: testy Feature przypadku sukcesu (kurs i lekcja)
  oraz drugiego przypisania tej samej pary.
- [x] 3.5 W `store` po zapisie: `AuditLog::record($actor, 'assignment.created',
  $assignment, [...])` + `Notify::send($instructor, 'assignment.created', <PL>,
  <PL>, '/panel/prowadzacy')`. Weryfikacja: test Feature sprawdza wpis audytu i
  powiadomienie u prowadzącego.
- [x] 3.6 `DeleteCourseAssignmentRequest` — wymagane `assignment_id` w ciele
  (brak → 422). `CourseAssignmentController::destroy` — przypisanie należy do
  kursu z URL i jest aktywne, inaczej 404. Odpięcie = `unassigned_at = now()`,
  bez `delete()`. Sukces → 200 z zasobem. Weryfikacja: test Feature potwierdza,
  że wiersz nadal istnieje w bazie po odpięciu.
- [x] 3.7 W `destroy` po odpięciu: `AuditLog::record($actor, 'assignment.removed',
  ...)` + `Notify::send($instructor, 'assignment.removed', ...)`. Ponowne
  `destroy` na rekordzie `unassigned` → 404 bez dodatkowego audytu i
  powiadomienia. Weryfikacja: testy Feature obu ścieżek.
- [x] 3.8 Bramka ról: `instructor`/`volunteer` na trasach `admin/courses/.../assignments`
  → 403 `forbidden`; brak tokenu → 401. Weryfikacja: testy Feature matrycy ról.

## 4. Wizytówki — `instructor-directory`

- [x] 4.1 Zarejestrować w `routes/api/h09.php` trasy `GET /instructors`,
  `GET /instructors/{id}` pod `['auth:sanctum', 'access.active']` oraz
  `GET`/`PATCH /me/instructor-profile`, `GET /instructor/courses` pod
  `['auth:sanctum', 'role:instructor']`. Weryfikacja: `php artisan route:list`
  pokazuje pięć tras; żadna nie jest w `config/public_routes.php`.
- [x] 4.2 `InstructorProfileResource` — `id`, `user_id`, `first_name`,
  `last_name`, `city`, `specializations` (`[]` gdy null), `bio`, `experience`,
  `responsibilities` (`[]` gdy null), `courses[{id,slug,title,sequence_order}]`;
  bez `email`, `pesel`, `address`. Weryfikacja: test Feature asertuje brak pól
  wrażliwych.
- [x] 4.3 `InstructorDirectoryController::index` — paginacja `page`/`per_page`
  (domyślnie 25, max 100), tylko konta z rolą `instructor` mające
  `instructor_profiles`, koperta `{data, meta}`. Weryfikacja: test Feature listy
  z Joanną i jej kursami 1–3 z seeda.
- [x] 4.4 `InstructorDirectoryController::show` — kształt jak element listy plus
  `supervisor{id,name}|null`; nieznany `id` lub konto bez wizytówki → 404
  `not_found`. Weryfikacja: testy Feature wizytówki z superwizorem, bez
  superwizora i nieznanej.
- [x] 4.5 `MyInstructorProfileController::show` — `GET /me/instructor-profile`
  dla roli `instructor`; brak rekordu → pusta wizytówka 200 (potwierdzone w
  K-zgłoszeniu). Inna rola → 403. Weryfikacja: testy Feature obu ról.
- [x] 4.6 `UpdateMyInstructorProfileRequest` + `MyInstructorProfileController::update`
  — przyjmuje wyłącznie `specializations`, `bio`, `experience`, `city`,
  `responsibilities` (listy = listy stringów); `user_id`/`supervisor_id` nie są
  polami wejściowymi. Pierwszy `PATCH` robi `firstOrCreate(['user_id' => $me->id])`.
  Weryfikacja: testy Feature aktualizacji, utworzenia przy pierwszej edycji i
  odrzucenia pola spoza wizytówki.
- [x] 4.7 `MyInstructorProfileController::courses` — `GET /instructor/courses`
  z aktywnych przypisań kursowych zalogowanego prowadzącego, sort
  `sequence_order`; rola inna niż `instructor` → 403. Weryfikacja: testy Feature
  dla Joanny (kursy 1–3), prowadzącego bez przypisań (pusta lista) i złej roli.

## 5. Brak regresji P0

- [x] 5.1 Test Feature regresji wizytówki kursu: `GET /courses/{slug}` →
  `data.instructor` = Joanna → `DELETE` jej przypisania kursowego →
  `data.instructor` = `null` → `POST` nowego prowadzącego → `data.instructor` =
  nowy. Weryfikacja: test przechodzi, kształt pozostałych pól `GET /courses/{slug}`
  bez zmian.
- [x] 5.2 Uruchomić pełną suitę backendu (`docker compose exec app php artisan
  test`), nie `--filter`. Weryfikacja: cała suita zielona, wynik zapisany w
  `DEMO/H09.md`.

## 6. Domknięcie pakietu

- [x] 6.1 `./vendor/bin/pint` (backend) bez zmian do naniesienia. Weryfikacja:
  Pint kończy się bez diffów.
- [x] 6.2 Uzupełnić `DEMO/H09.md`: zakres, dosłowne odpowiedzi strażnika,
  scenariusz demo (przypisanie/odpięcie → powiadomienie + audyt; reguła
  dziedziczenia obu ścieżek), znane ograniczenia (frontend i test wspólny z H17
  odłożone). Weryfikacja: plik kompletny wg wzoru `DEMO/H05.md`.
- [x] 6.3 `openspec validate h09-prowadzacy-wizytowki-przypisania --strict`.
  Weryfikacja: komenda przechodzi.
- [x] 6.4 Zsynchronizować `origin/main` do brancha, `git diff --check`,
  `git status --short` bez plików spoza zakresu H09. Weryfikacja: diff obejmuje
  wyłącznie `routes/api/h09.php`, nowe pliki `app/`, testy, `openspec/changes/h09-*`,
  `DEMO/H09.md`. Wykonane — PR #47 przeszedł CI i został scalony.
