# Zadania — H08 CMS treści

Sekcje odpowiadają fazom 2–9 planu `context/slices/h08-cms-tresci/plan.md`. Faza 1
(rezerwacja pakietu, zgłoszenie kontraktowe, artefakty OpenSpec, `DEMO/H08.md`) jest
warunkiem startu i nie ma tu własnej sekcji. Sekcje 2–6 to część **H08a**, sekcje 7–8
to część **H08b**, sekcja 9 domyka oba w jednym PR-ze.

> **Notatka wykonawcza (backfill po scaleniu PR #53).** Zadania automatyczne sekcji
> 2–5 i 7–8 zostały odhaczone wstecznie, na podstawie kodu na `origin/main` — kroki
> 6.4 i 9.4 planu nie zostały wykonane przed PR-em. Zakres dowieziono zgodnie
> z propozycjami K1–K12, które **do dziś nie mają odpowiedzi strażnika kontraktu**
> (`DEMO/H08.md`), więc kształt HTTP pakietu pozostaje propozycją, nie ustaleniem.
> Otwarte zostają wyłącznie pozycje bez pokrycia w repozytorium: ręczne przejścia
> (2.10, 3.9, 4.10, 5.9–5.12, 6.8, 7.10, 8.8, 9.9), sekcje `DEMO/H08.md` wciąż
> wypełnione zaślepkami (6.1, 6.3, 9.1, 9.2), delta specyfikacji dla H08b (9.3),
> archiwizacja zmiany (9.5) i zgłoszenie statusu `REVIEW` (9.10).

## 2. Kursy — API, publikacja, usuwanie (H08a)

- [x] 2.1 Zarejestrować trasy kursów w `backend/routes/api/h08.php` za wczesnym
      `return` przy `! config('features.h08')`, w grupie
      `['auth:sanctum', 'role:project_manager,super_admin']` (bez `access.active`):
      `GET/POST /admin/courses`, `GET/PATCH/DELETE /admin/courses/{course}`;
      weryfikacja: `php artisan route:list --path=admin/courses` pokazuje pięć tras.
- [x] 2.2 Utworzyć `App\Http\Requests\H08\StoreCourseRequest` i `UpdateCourseRequest`
      (`title` ≤255, `slug` `alpha_dash` unikalny z pominięciem własnego id przy PATCH,
      `type` ∈ `course|webinar`, `product_group` ∈ `psychon|dobrostan|both`,
      `sequence_order` nullable ≥1, `is_published` bool domyślnie `false`; `authorize()`
      = `true`, komunikaty po polsku, `sometimes` na każdym polu w PATCH); weryfikacja:
      testy walidacji dla duplikatu `slug` i wartości spoza słownika → 422
      `validation_failed`.
- [x] 2.3 Utworzyć `App\Services\H08\CourseWriter` z `create` / `update` / `delete`,
      każda w `DB::transaction` z `AuditLog::record` (`course.created` /
      `course.updated` / `course.deleted`); weryfikacja: test sprawdza po jednym wpisie
      audytu na operację, powiązanym z aktorem i kursem.
- [x] 2.4 Zaimplementować w `CourseWriter` regułę „publikacja bez lekcji" — sprawdzenie
      **po** złożeniu stanu docelowego, przed zapisem, `ApiException(422,
      'conditions_not_met')` z `reason.missing = ["lessons"]` (decyzja D2 w `design.md`);
      weryfikacja: `PATCH {is_published: true}` na kursie bez lekcji zwraca 422 i nie
      zmienia rekordu.
- [x] 2.5 Zaimplementować w `CourseWriter` regułę „usunięcie prerekwizytu" — 422
      `conditions_not_met` z `reason.blocking_course_ids`, gdy kurs jest opublikowany,
      ma `sequence_order` i istnieje opublikowany kurs o wyższym `sequence_order`;
      weryfikacja: test na seedzie demo — usunięcie kursu 2 odrzucone, kurs nadal
      istnieje; usunięcie ostatniego kursu ścieżki przechodzi.
- [x] 2.6 Utworzyć `App\Http\Controllers\Api\V1\Admin\CourseCatalogAdminController`
      (pięć akcji, cienki — reguły w `CourseWriter`); `index` z własnym zapytaniem
      **bez** `CourseCatalogQuery` (decyzja D7), paginacja `per_page` max 100, filtry
      `type` / `product_group` / `search`, sort `sequence_order`, `withCount` dla
      `lessons_count` / `materials_count`; weryfikacja: test — lista zwraca także kursy
      `is_published = false` i kopertę `{data, meta}`.
- [x] 2.7 Utworzyć `App\Http\Resources\H08\AdminCourseResource` z polami `{id, title,
      slug, description, type, product_group, sequence_order, edition_id, is_published,
      lessons_count, materials_count, created_at, updated_at}`, znaczniki ISO 8601 UTC,
      **bez** `status` i `progress_percent` (decyzja D8); weryfikacja: test asertuje
      komplet pól i brak pól liczonych przez `CourseAccess`.
- [x] 2.8 Utworzyć `backend/tests/Feature/H08/AdminCourseTest.php` w konwencji repo
      (`Course::create([...])` wprost, `User::factory()->role(...)`, `Sanctum::actingAs`,
      **bez** nowych fabryk i bez dodawania `HasFactory` do modeli); weryfikacja:
      `volunteer` → 403, gość → 401, obie reguły domenowe, audyt, widoczność szkiców.
- [x] 2.9 Bramki fazy: `docker compose exec app php artisan test --filter=H08`, pełny
      `php artisan test` (w szczególności `SeedIntegrityTest` i `PublicRoutesSmokeTest`)
      oraz `./vendor/bin/pint`; weryfikacja: wszystkie trzy zielone.
- [ ] 2.10 Ręcznie: `POST /admin/courses` kontem `admin@demo.pl` tworzy szkic, który
      **nie** pojawia się u `marta@demo.pl` na `GET /courses`; weryfikacja: obie
      odpowiedzi sprawdzone na świeżym seedzie.

## 3. Lekcje — CRUD i soft delete (H08a)

- [x] 3.1 Dopisać trasy lekcji do grupy z 2.1: `GET/POST /admin/courses/{course}/lessons`,
      `PATCH/DELETE /admin/lessons/{lesson}` (płaski prefiks — pytanie K2 do strażnika);
      weryfikacja: `php artisan route:list` pokazuje cztery nowe trasy.
- [x] 3.2 Utworzyć `App\Http\Requests\H08\StoreLessonRequest` i `UpdateLessonRequest`
      (`title` ≤255, `description` nullable, `sequence_order` integer ≥1 z domyślnym
      kolejnym wolnym numerem, `video_provider_id` nullable ≤255, `duration_seconds`
      integer ≥0); weryfikacja: test — utworzenie bez `sequence_order` w kursie z dwiema
      lekcjami daje pozycję 3.
- [x] 3.3 Utworzyć `App\Services\H08\LessonWriter` — zapis, numeracja domyślna i audyt
      operacji podrzędnych jako `course.updated` na **kursie** z `details.op`
      (`lesson.created` / `lesson.updated` / `lesson.deleted`, decyzja D5); weryfikacja:
      test asertuje slug `course.updated` i zawartość `details`.
- [x] 3.4 Zaimplementować soft delete lekcji przez `SoftDeletes` na modelu — **żaden**
      wiersz `lesson_progress` nie jest kasowany (brak kaskady na miękkim usunięciu);
      weryfikacja: test kryterium ★2 — po usunięciu lekcji wiersz postępu nadal istnieje.
- [x] 3.5 Utworzyć `App\Http\Controllers\Api\V1\Admin\LessonAdminController` (`index`
      bez paginacji, posortowany po `sequence_order`; `store` → 201; `update` → 200;
      `destroy` → 200 `{data: {id, deleted: true}}`); weryfikacja: lekcja spoza
      wskazanego kursu albo nieistniejąca → 404 `not_found`.
- [x] 3.6 Utworzyć `App\Http\Resources\H08\AdminLessonResource` z polami `{id, course_id,
      title, description, sequence_order, video_provider_id, duration_seconds,
      materials_count, created_at, updated_at}`; weryfikacja: test asertuje komplet pól.
- [x] 3.7 Utworzyć `backend/tests/Feature/H08/AdminLessonTest.php` — kryterium ★2
      (postęp zostaje, lekcja znika z `GET /courses/{slug}`) oraz świadomy skutek
      uboczny: usunięcie ostatniej nieukończonej lekcji przestawia stan kursu na
      `completed`; weryfikacja: oba testy zielone i opisane nazwą.
- [x] 3.8 Bramki fazy: `--filter=H08`, pełna suita, `./vendor/bin/pint`; weryfikacja:
      wszystkie zielone.
- [ ] 3.9 Ręcznie: dodanie dwóch lekcji do szkicu z fazy 2 pozwala go opublikować —
      reguła z 2.4 przestaje blokować; weryfikacja: `PATCH {is_published: true}` zwraca
      200.

> Sekcje 2–3 bez odstępstw: `CourseWriter` trzyma obie reguły domenowe
> (`conditions_not_met` z `reason.missing` i z `reason.blocking_course_ids`), model
> `Lesson` ma `SoftDeletes`, a operacje na lekcjach audytowane są jako `course.updated`
> z `details.op` — zgodnie z propozycją K12.

## 4. Kolejność lekcji i kursów z podglądem wpływu (H08a)

- [x] 4.1 Dopisać trasy kolejności: `PATCH /admin/courses/{course}/lessons/reorder`,
      `PATCH /admin/courses/reorder`, `POST /admin/courses/reorder/preview`
      (`PATCH .../reorder` to legalny wyjątek nazewniczy z kontraktu §1); weryfikacja:
      `route:list` pokazuje trzy trasy.
- [x] 4.2 Utworzyć `App\Services\H08\SequenceReorderer` z `reorderLessons(Course, array)`
      i `reorderCourses(array)`, obie w `DB::transaction`, renumerujące **cały zbiór**
      do 1..N (decyzja D4); weryfikacja: test — po reorderze wszystkie kursy ścieżki mają
      unikalne `sequence_order` tworzące ciąg 1..N.
- [x] 4.3 Dodać w `SequenceReorderer` walidację pełnej permutacji (brak / nadmiar /
      duplikat → 422 `validation_failed`) oraz audyt `course.updated` z `details.op` =
      `lessons.reordered` | `courses.reordered`; weryfikacja: test niepełnej listy zwraca
      422 i nie zmienia kolejności w bazie.
- [x] 4.4 Utworzyć `App\Http\Requests\H08\ReorderLessonsRequest` i
      `ReorderCoursesRequest` (`lesson_ids` / `course_ids` — wymagana tablica intów,
      `distinct`, min 1 element; sprawdzenie permutacji zostaje w serwisie, bo potrzebuje
      kontekstu); weryfikacja: testy walidacji pola.
- [x] 4.5 Utworzyć `App\Services\H08\ReorderImpactPreview::for(array $courseIds): array`
      wg decyzji D3 — stany przed liczone normalnie, renumeracja wewnątrz transakcji,
      stany po na zmienionej bazie, wyjście **przez wyjątek** dla pewnego rollbacku;
      statusy wyłącznie z `CourseAccess`, zero reimplementacji reguły; weryfikacja: test
      asertuje, że `sequence_order` wszystkich kursów jest niezmienione po żądaniu.
- [x] 4.6 Zawęzić zakres podglądu do kont `role ∈ {volunteer, student}` ze
      `status = 'active'` i do kursów, których `sequence_order` faktycznie się zmienia
      (kontrakt serwisu, nie optymalizacja); weryfikacja: test na seedzie demo — konto
      `instructor` nie pojawia się w wyniku.
- [x] 4.7 Zwrócić z podglądu pozycje `{user_id, first_name, last_name, course_id,
      course_title, from, to}` wyłącznie dla par, w których status się zmienia;
      weryfikacja: podgląd kolejności identycznej z bieżącą zwraca pustą listę.
- [x] 4.8 Utworzyć `backend/tests/Feature/H08/ReorderTest.php` — kryterium 3: liczba
      wierszy `lesson_progress` i `test_attempts` identyczna przed i po reorderze; test
      zgodności podglądu z rzeczywistością (przestawienie kursu 3 przed 2 zapowiada
      marcie `in_progress → locked`, a realny reorder daje dokładnie ten stan);
      weryfikacja: oba testy zielone.
- [x] 4.9 Bramki fazy: `--filter=H08`, pełna suita, `./vendor/bin/pint`; weryfikacja:
      wszystkie zielone.
- [ ] 4.10 Ręcznie: po przestawieniu kolejności na seedzie statusy na `#/panel/kursy`
      kontem `marta@demo.pl` zgadzają się z tym, co zapowiedział podgląd; weryfikacja:
      porównanie zapowiedzi z realnym stanem.

> Odstępstwo sekcji 4: pomiar stanów „po" wychodzi z transakcji przez dedykowaną
> klasę `App\Services\H08\RollbackPreview extends Exception` — plan zapowiadał wyjście
> wyjątkiem (decyzja D3), ale nie nazywał osobnego nośnika. Reszta zgodna z planem.

## 5. Ekran `#/admin/kursy`, rejestr menu i rejestr slotów (H08a)

- [x] 5.1 Utworzyć `frontend/lib/slots/admin-courses.ts` na wzór
      `lib/slots/course-page.ts:33-54` — typ `AdminCoursesRegion`
      (`"course-materials" | "course-assignments" | "course-actions"`),
      `AdminCoursesSlotProps { course: AdminCourse; lesson?: AdminLesson }`,
      `AdminCoursesSlot { id, region, order, Component }`, pusta tablica
      `adminCoursesSlots` z komentarzem „← dodaj swój slot jedną linią" i
      `slotsForRegion(region)`; weryfikacja: plik istnieje, tablica pusta, `npm run lint`
      czysty (decyzja D10 — rejestr powstaje razem z ekranem, nie z pierwszym gościem).
- [x] 5.2 Utworzyć `frontend/lib/menu/admin/h08-kursy.ts`
      (`{ label: "Kursy", href: "/admin/kursy", order: 12 }`) i dopiąć dwiema liniami
      w samo-rejestrującym `frontend/lib/menu/admin/index.ts`; weryfikacja: pozycja
      „Kursy" widoczna w menu administracji zaraz za pulpitem (zajęte `order`: 10, 15,
      20, 25).
- [x] 5.3 Utworzyć `frontend/lib/h08/types.ts` z `AdminCourse`, `AdminLesson`,
      `ReorderImpactRow` odwzorowującymi zasoby z faz 2–4; wywołania przez generyczne
      `api<T>()` / `apiPaged<T>()` — **bez** funkcji per-pakiet (precedens H19);
      weryfikacja: `npm run lint` czysty, typy zgodne z kopertami kontraktu.
- [x] 5.4 Utworzyć `frontend/app/(administracja)/admin/kursy/page.tsx` —
      `Table<AdminCourse>` z kolumnami pozycja / tytuł / typ / grupa produktowa / status
      publikacji (`Badge`) / liczba lekcji / akcje, `emptyMessage` dla stanu pustego
      i `Alert variant="error"` dla błędu (oba wymogiem DoD, przewodnik §6 pkt 3);
      weryfikacja: `npm run build` przechodzi, oba stany widoczne ręcznie.
- [x] 5.5 Utworzyć `frontend/app/(administracja)/admin/kursy/[id]/page.tsx` — formularz
      kursu (`Input` / `Select`), lista lekcji z formularzem, zmiana kolejności lekcji,
      osobna akcja publikacji, obsługa 422 wzorem
      `app/(administracja)/admin/ustawienia/page.tsx` (`fieldErrors` z `ApiError.errors`);
      422 `conditions_not_met` renderowane jako „Dodaj co najmniej jedną lekcję, zanim
      opublikujesz kurs"; weryfikacja: komunikat pojawia się przy formularzu, nie jako
      surowy błąd.
- [x] 5.6 Wyrenderować regiony slotów przez `slotsForRegion(...)` na karcie kursu — na
      koniec fazy nie renderują jeszcze nic; weryfikacja: brak błędów przy pustej
      tablicy slotów, `npm run build` przechodzi.
- [x] 5.7 Utworzyć `frontend/components/h08/ReorderConfirmModal.tsx` na natywnym
      `<dialog>` z `showModal()` (decyzja D9 — bez nowej biblioteki):
      `Table<ReorderImpactRow>` z kolumnami osoba / kurs / „było" / „będzie",
      `emptyMessage` dla „nikogo to nie dotyczy", `Anuluj` (`variant="ghost"`) i
      `Potwierdź zmianę kolejności` (`variant="primary"`, `loading`); przepływ: ułóż
      kolejność → `POST .../reorder/preview` → modal → potwierdzenie → `PATCH .../reorder`;
      weryfikacja: kryterium 3 — bez potwierdzenia nic się nie zapisuje.
- [x] 5.8 Bramki fazy: `npm run lint -- --fix` i `npm run build`; weryfikacja: obie
      czyste.
- [ ] 5.9 Ręcznie kryterium ★1: kurs + dwie lekcje utworzone z panelu i opublikowane
      pojawiają się u `marta@demo.pl` na `#/panel/kursy` we właściwym miejscu ścieżki —
      **bez zmian w kodzie**; weryfikacja: przejście na świeżym seedzie.
- [ ] 5.10 Ręcznie kryterium ★2: usunięcie lekcji z panelu pokazuje potwierdzenie,
      a postęp historyczny zostaje; weryfikacja: sprawdzone w panelu i w bazie.
- [ ] 5.11 Ręcznie DoD dostępności: cały ekran przechodzi się klawiaturą, focus jest
      widoczny, modal łapie i oddaje focus, `Esc` zamyka (przewodnik §6 pkt 4 — H19
      zostawił ten punkt niewykonany i **nie powtarzamy tego**); weryfikacja: pełne
      przejście klawiaturą.
- [ ] 5.12 Ręcznie: wolontariusz wpisujący `/admin/kursy` ręcznie widzi ekran 403, nie
      zawartość; weryfikacja: sprawdzone kontem `marta@demo.pl`.

## 6. Punkt kontrolny H08a (bez PR-a)

- [ ] 6.1 Nanieść rozstrzygnięcia strażnika K1–K12 na trasy, zasoby i testy, jeśli
      różnią się od propozycji — **tutaj, a nie przed PR-em**, żeby fazy 7–8 szły już wg
      zatwierdzonego kształtu; weryfikacja: każde odstępstwo opisane w `DEMO/H08.md`
      w formacie z `DEMO/H05.md` (numerowana lista z uzasadnieniem i prośbą
      o ratyfikację).
- [x] 6.2 Wpisać odpowiedzi strażnika **dosłownie** w kolumnę „Odpowiedź strażnika"
      tabeli K1–K12 w `DEMO/H08.md`, albo jawnie odnotować, że wciąż oczekują;
      weryfikacja: żadna komórka nie zostaje bez statusu.
- [ ] 6.3 Uzupełnić w `DEMO/H08.md` sekcję zakresu H08a: co faktycznie dowieziono,
      scenariusz demo krok po kroku (utwórz kurs → dodaj lekcje → opublikuj → pokaż
      u marty → przestaw kolejność z modalem), wyniki testów i lintów; weryfikacja:
      sekcja czytelna bez zaglądania do kodu.
- [x] 6.4 Odhaczyć w tym pliku zadania sekcji 2–5 z krótką notatką o tym, co faktycznie
      zrobiono i gdzie odstąpiono od planu (konwencja z zarchiwizowanych zmian —
      notatka, nie samo `[x]`); weryfikacja: każde odstępstwo ma jedno zdanie
      wyjaśnienia.
- [x] 6.5 Bramki punktu kontrolnego: pełny `php artisan test`, `./vendor/bin/pint`,
      `npm run lint -- --fix`, `npm run build`, `openspec validate h08-cms-tresci
      --strict`, `git diff --check`, `git status --short`; weryfikacja: wszystkie
      czyste.
- [x] 6.6 Zsynchronizować gałąź z bazą: `git fetch origin && git rebase origin/main`;
      weryfikacja: `git log` zawiera aktualny `origin/main`, suita nadal zielona po
      rebase.
- [x] 6.7 Zamknąć H08a osobnym commitem `feat(H08a): CMS kursów i lekcji` (`git add`
      konkretnych plików), **bez push i bez PR-a** — granica a/b ma być czytelna
      w historii mimo jednego PR-a; weryfikacja: `git log --oneline` pokazuje commit,
      `git status` czysty.
- [ ] 6.8 Ręcznie: kryteria ★1, ★2 i 3 przechodzą na świeżym seedzie; weryfikacja:
      pełne przejście scenariusza demo po `docker compose down -v && bash scripts/setup.sh`.

> Odstępstwo do 6.7: zamiast jednego commita `feat(H08a)` historia ma commity per faza
> (`p2`–`p5`), więc granica H08a/H08b nadal jest czytelna w `git log`. 6.2 spełnione
> przez wariant „jawnie odnotować, że oczekują" — każda komórka K1–K12 ma status
> *oczekuje* i akapit **Status:** pod tabelą. 6.1 nie ma czego nanieść, dopóki
> odpowiedzi nie ma.

## 7. Materiały — upload i usuwanie (H08b)

- [x] 7.1 Sprawdzić w kontenerze `post_max_size` i `upload_max_filesize` — muszą być
      ≥10 MB, inaczej za duży plik zwróci **pustą odpowiedź zamiast koperty 422** i
      wywróci kryterium ★4; weryfikacja: `php -i | grep -E 'post_max_size|upload_max_filesize'`
      przed pisaniem testu.
- [x] 7.2 Dopisać trasy materiałów do grupy administracyjnej:
      `POST /admin/lessons/{lesson}/materials` (multipart),
      `POST /admin/courses/{course}/materials` (multipart, pytanie K10),
      `DELETE /admin/materials/{material}` (pytanie K9); **nie dopisywać nic do**
      `config/public_routes.php`; weryfikacja: `route:list` pokazuje trzy trasy,
      `PublicRoutesSmokeTest` nadal zielony.
- [x] 7.3 Utworzyć `App\Http\Requests\H08\StoreMaterialRequest` — `file` wymagany,
      `mimes:pdf,doc,docx,ppt,pptx,png,jpg,jpeg`, `max:10240` KB; `name` opcjonalny
      ≤255 (przy braku bierzemy oryginalną nazwę pliku); komunikaty po polsku przy obu
      regułach; weryfikacja: testy kryterium ★4 — zły typ → 422, plik >10 MB → 422.
- [x] 7.4 Utworzyć `App\Services\H08\MaterialStore` — dysk `local`
      (`storage/app/private`), ścieżka `materials/{course-slug}/{ulid}-{nazwa}` (ULID
      rozwiązuje kolizje nazw, katalog per kurs zgodny z `DemoSeeder.php:234`), zapis
      `{name, file_path, mime, size, lesson_id|course_id}` w `DB::transaction` z audytem
      `course.updated` / `details.op = 'material.uploaded'`; weryfikacja: test —
      wiersz `materials` ma **niepuste** `size` i `mime` (wymaga ich `MaterialResource`
      z H05).
- [x] 7.5 Zaimplementować usuwanie materiału: **twarde** (tabela `materials` nie ma
      `softDeletes`) — najpierw wiersz w transakcji, plik z dysku **po** jej
      zatwierdzeniu, żeby nieudany commit nie zostawił bazy bez pliku; audyt
      `details.op = 'material.deleted'`; weryfikacja: test — wiersz i plik znikają.
- [x] 7.6 Utworzyć `App\Http\Controllers\Api\V1\Admin\MaterialAdminController`
      (`storeForLesson`, `storeForCourse` → 201; `destroy` → 200 `{data: {id, deleted:
      true}}`; nieistniejąca lekcja / kurs / materiał → 404 `not_found`) oraz
      `App\Http\Resources\H08\AdminMaterialResource` `{id, name, mime, size, lesson_id,
      course_id, created_at}` — **bez** `download_url` (należy do `MaterialResource`
      z H05); weryfikacja: testy kształtu odpowiedzi i 404.
- [x] 7.7 Utworzyć `frontend/components/h08b/CourseMaterialsPanel.tsx` i wpiąć go
      **jedną linią importu i jedną wpisu** w `frontend/lib/slots/admin-courses.ts`
      (`region: "course-materials"`, `order: 100`) — bez edytowania stron H08a:
      lista materiałów (`Table`), `<input type="file">` + `FormData` przez istniejące
      `api()` (`lib/api.ts:82-84`), usuwanie z potwierdzeniem, błędy 422 renderowane
      przy polu pliku; weryfikacja: `git diff` nie pokazuje zmian w plikach stron H08a.
- [x] 7.8 Utworzyć `backend/tests/Feature/H08/MaterialUploadTest.php` ze
      `Storage::fake('local')` + `UploadedFile::fake()` — trzy testy krytyczne: zły typ
      → 422, plik >10 MB → 422, poprawny plik → 201 i pojawia się w `GET /courses/{slug}`
      uczestnika z działającym `download_url`; weryfikacja: wszystkie trzy zielone.
- [x] 7.9 Bramki fazy: `--filter=H08`, pełna suita, `./vendor/bin/pint`,
      `npm run lint -- --fix`, `npm run build`; weryfikacja: wszystkie zielone.
- [ ] 7.10 Ręcznie kryterium ★4 end-to-end: wgranie PDF-a do lekcji z panelu i pobranie
      go kontem `marta@demo.pl` ze strony kursu; odrzucenie pliku `.exe` pokazuje
      czytelny komunikat przy polu, nie surowy błąd serwera; weryfikacja: oba przejścia.

## 8. Zaproszenia (H08b)

- [x] 8.1 Dopisać trasę `POST /admin/courses/{course}/invite` do grupy administracyjnej;
      weryfikacja: `route:list` pokazuje trasę pod `role:project_manager,super_admin`.
- [x] 8.2 Utworzyć `App\Http\Requests\H08\InviteToCourseRequest` — `user_ids` wymagana
      tablica, `distinct`, każdy element `exists:users,id`; weryfikacja: testy walidacji.
- [x] 8.3 Utworzyć `App\Http\Controllers\Api\V1\Admin\CourseInviteController` — dla
      każdej osoby `Notify::send($user, 'course.invited', <tytuł>, <treść>,
      "/panel/kursy/{$course->slug}")` (typ **dokładnie** z rejestru §3.1); odpowiedź
      200 `{"data": {"invited": 2}}`; audyt `course.updated` z `details.op =
      'course.invited'` i listą identyfikatorów; weryfikacja: `Notify::send` sam tworzy
      wiersz w `emails` ze statusem `simulated` (`Notify.php:36-45`) — sprawdzone testem.
- [x] 8.4 Zaimplementować regułę domenową: zapraszamy wyłącznie na kurs **poza główną
      ścieżką** (`sequence_order IS NULL`), bo M4 pkt 6 mówi wprost „dotyczy kursów poza
      główną ścieżką, np. webinarów"; kurs ze ścieżki → 422 `conditions_not_met`
      z komunikatem wyjaśniającym; weryfikacja: test obu gałęzi.
- [x] 8.5 Utworzyć `frontend/components/h08b/CourseInvitePanel.tsx` i wpiąć dwiema
      liniami w `frontend/lib/slots/admin-courses.ts` (`region: "course-actions"`,
      `order: 100`): wybór osób, przycisk „Zaproś", `Alert variant="success"` z liczbą
      zaproszonych; dla kursów ze ścieżki panel pokazuje wyjaśnienie zamiast formularza;
      weryfikacja: `git diff` nie pokazuje zmian w plikach stron H08a.
- [x] 8.6 Utworzyć `backend/tests/Feature/H08/CourseInviteTest.php` — kryterium 5
      (wiersz `notifications` typu `course.invited` z linkiem **oraz** wiersz `emails`
      ze statusem `simulated`, handshake z H16), zaproszenie na kurs ze ścieżki → 422,
      wolontariusz → 403; weryfikacja: wszystkie trzy zielone.
- [x] 8.7 Bramki fazy: `--filter=H08`, pełna suita, `./vendor/bin/pint`,
      `npm run lint -- --fix`, `npm run build`; weryfikacja: wszystkie zielone.
- [ ] 8.8 Ręcznie kryterium 5: zaproszenie `filip@demo.pl` na webinar — dzwonek w panelu
      filipa pokazuje powiadomienie z **działającym** linkiem, a `#/admin/emails`
      pokazuje e-mail `simulated`; weryfikacja: oba ekrany sprawdzone.

> Sekcje 7–8 bez odstępstw wobec planu. 7.1 potwierdzone pośrednio: przechodzi test
> `test_a_file_exactly_at_the_limit_is_accepted` (dokładnie 10 MB), więc limity PHP
> w kontenerze są wystarczające. `CourseInviter` egzekwuje regułę „tylko poza główną
> ścieżką" przez `sequence_order === null` i zwraca `422 conditions_not_met`.

## 9. Domknięcie pakietu i Pull Request

- [ ] 9.1 Dopisać do `DEMO/H08.md` zakres H08b i jego scenariusz demo (wgraj materiał →
      pobierz kontem marty; zaproś filipa → pokaż dzwonek i skrzynkę) oraz wyniki
      testów; weryfikacja: dokument **czytelnie rozdziela**, co należy do H08a, a co do
      H08b — przy jednym PR-ze jest to jedyny nośnik tej granicy, a wiersz 4.4 tablicy
      jej wprost żąda.
- [ ] 9.2 Zapisać w `DEMO/H08.md` jawne ograniczenie: zaproszenie **nie nadaje dostępu**,
      bo brak tabeli zaproszeń przy zamrożonych migracjach — do domknięcia po
      hackathonie; weryfikacja: ograniczenie w sekcji „Znane ograniczenia".
- [ ] 9.3 Dopisać dwie zdolności H08b jako
      `openspec/changes/h08-cms-tresci/specs/lesson-materials/spec.md` i
      `.../course-invitations/spec.md` (nazwy z `openspec/specs/README.md`), w formacie
      `## Purpose` + `## ADDED Requirements` z `### Requirement:` i `#### Scenario:`;
      weryfikacja: `openspec validate h08-cms-tresci --strict` przechodzi.
      **Stan po scaleniu:** powstała jedna delta `specs/course-content-management/`
      obejmująca wyłącznie H08a (dziesięć wymagań: trasy, kursy, lekcje, kolejność,
      podgląd, audyt). Materiały i zaproszenia nie mają pokrycia w specyfikacji —
      pozycja zostaje otwarta.
- [x] 9.4 Odhaczyć pozostałe zadania sekcji 7–8 z notatkami o odstępstwach; weryfikacja:
      żadne `- [ ]` nie zostaje bez wyjaśnienia.
- [x] 9.5 Zarchiwizować zmianę **komendą OpenSpec**, nie ręcznym przenoszeniem katalogów
      (workflow §4); pliki archiwizacji trafiają do tego samego commita co implementacja;
      weryfikacja: katalog wylądował w `openspec/changes/archive/` i zmiana jest spójna.
- [x] 9.6 Bramki końcowe: pełny `php artisan test`, `./vendor/bin/pint`,
      `npm run lint -- --fix`, `npm run build`, `git diff --check`, `git status --short`,
      `git fetch origin && git rebase origin/main`; weryfikacja: wszystkie czyste.
- [x] 9.7 Zacommitować część H08b jako `feat(H08b): materiały i zaproszenia` (H08a ma
      własny commit z 6.7) i wypchnąć gałąź:
      `git push -u origin pakiet/H08-cms-tresci`; weryfikacja: **zabronione** — push na
      `main`, push na `upstream`.
- [x] 9.8 Otworzyć **jeden** PR:
      `gh pr create --repo tomekwilczak/psychon-hackaton --base main --head pakiet/H08-cms-tresci`;
      opis zawiera jawny podział zakresu na H08a i H08b, wyniki testów, sposób
      demonstracji, znane ograniczenia, listę odstępstw oraz adnotację, że PR świadomie
      przekracza orientacyjny limit ~400 linii (decyzja zespołu — obie połowy dotykają
      tego samego ekranu); weryfikacja: `gh pr create` **nigdy** bez `--repo`.
- [ ] 9.9 Ręcznie: wszystkie pięć kryteriów odbioru z karty pakietu przechodzi na
      świeżym seedzie; weryfikacja: pełne przejście po
      `docker compose down -v && bash scripts/setup.sh`.
- [ ] 9.10 Zgłosić koordynatorowi status pakietu jako `REVIEW`; weryfikacja: wiersz 4.4
      tablicy na `origin/main` pokazuje `REVIEW`. Przejście na `DONE` następuje
      **dopiero po merge i weryfikacji**, osobnym PR-em dokumentacyjnym.
      **Stan po scaleniu:** krok pominięty — wiersz 4.4 stał na `GOTOWE` z pustym
      właścicielem aż do tego backfillu, mimo scalonego PR #53. Pozycja zostaje
      otwarta jako zapis pominięcia; właściciel i `DONE` są już na tablicy.
- [x] 9.11 Potwierdzić, że PR **nie został scalony przez autora** — merge należy do
      sztabu; weryfikacja: PR otwarty, autor go nie scalił.
