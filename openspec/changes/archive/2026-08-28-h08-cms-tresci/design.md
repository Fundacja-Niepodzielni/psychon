## Context

Stan zastany, zweryfikowany w kodzie na commicie `6e0034c` (pełne rozpoznanie:
`context/slices/h08-cms-tresci/research.md`).

- **Schemat jest kompletny.** `courses`, `lessons` (obie `softDeletes`) i `materials`
  mają komplet kolumn pod cały zakres pakietu
  (`migrations/2026_01_01_000040_create_courses_tables.php:15-50`). Modele `Course`,
  `Lesson`, `Material` mają `$fillable` pod CRUD. Migracje są zamrożone i **żadna nie
  jest potrzebna**.
- **`CourseAccess` jest cudzą własnością z zamrożoną sygnaturą** i komentarzem
  „packages must not re-implement this rule" (`app/Support/CourseAccess.php:10-16`).
  To determinuje sposób liczenia podglądu wpływu (D3).
- **Pusty kurs blokuje ścieżkę.** `CourseAccess::allLessonsCompleted()` zwraca `false`
  dla kursu z zerem lekcji (`CourseAccess.php:75-82`) — opublikowanie kursu bez lekcji
  w środku sekwencji natychmiast blokuje wszystkich za nim i wywala `SeedIntegrityTest`.
- **Szkic nie łamie łańcucha.** `CourseAccess::state()` szuka poprzednika z filtrem
  `is_published = true` i `type = 'course'` (`CourseAccess.php:25-31`) — kurs
  niepublikowany i webinar są przezroczyste dla reguły odblokowań. To fundament cyklu
  „szkic → uzupełnij lekcje → publikuj".
- **`sequence_order` nie jest unikalny** (`migrations/…000040:22` — `nullable()->index()`,
  bez `unique`). Duplikaty czynią wybór poprzednika niedeterministycznym.
- **Soft delete lekcji zdejmuje ją z mianownika** — `Course::lessons()` nie ma
  `withTrashed()` (`Course.php:39-42`), więc usunięcie ostatniej nieukończonej lekcji
  może natychmiast ukończyć kurs i odblokować następny.
- **Pobranie materiału jest już gotowe** — H05 dowiózł
  `GET /materials/{material}/download` (podpisany, TTL 15 min, re-sprawdzanie
  widoczności i blokady w chwili pobrania: `MaterialDownloadController.php:49-84`).
  H08b pisze wyłącznie upload i usuwanie. `CourseDetailResource::materials()` już dziś
  zbiera materiały kursu **i lekcji** do jednej tablicy, z komentarzem „H08b uploads
  with `lesson_id`" (`CourseDetailResource.php:70-76`).
- **Wzorce do skopiowania:** trasy za flagą — `routes/api/h19.php:21-29`; serwis
  z audytem w transakcji — `App\Services\H19\EditionSettingsUpdater`; formularz
  administracji z obsługą 422 — `app/(administracja)/admin/ustawienia/page.tsx`;
  rejestr slotów — `frontend/lib/slots/course-page.ts:33-54`; samo-rejestrujące menu —
  `frontend/lib/menu/admin/index.ts` (wolne `order`: zajęte 10, 15, 20, 25).
- **Konwencja testów** w repo to `Course::create([...])` wprost plus
  `User::factory()->role(...)` (`tests/Feature/H10/TestPackageCase.php:42`,
  `tests/Feature/Courses/CourseCatalogTest.php:85`) — fabryk dla `Course`/`Lesson`/
  `Material` nie ma i **nie dodajemy `HasFactory` do modeli**, żeby nie powtarzać
  odstępstwa H19 na `Edition`.
- **Luka kontraktowa:** `02-kontrakt-api.md` nie ma sekcji §2 dla H08 — to ta sama
  luka, która zablokowała H12. Zgłoszenie K1–K12 poszło do strażnika przed
  implementacją; treść i odpowiedzi żyją w `DEMO/H08.md`.

## Goals / Non-Goals

**Goals:**

- Producent treści kompletny na tyle, żeby opiekun projektu założył kurs, dodał lekcje,
  wgrał materiały i opublikował go **bez programisty** — a uczestnik zobaczył efekt
  bez żadnej zmiany w kodzie H05.
- Reguły domenowe chroniące ścieżkę uczestnika przed przypadkowym kliknięciem
  w panelu (publikacja pustego kursu, usunięcie prerekwizytu) — to regresja P0,
  nie kosmetyka.
- Zmiana kolejności pokazująca **przed zapisem**, czyje statusy się zmienią, liczona
  tą samą regułą, która potem zadziała naprawdę.
- Rejestr slotów jako kontrakt H08a wobec H08b i H09 — nawet w jednym PR-ze H08b nie
  edytuje stron H08a.

**Non-Goals:**

- **Żadnych migracji** i żadnych nowych zależności composer/npm ani bibliotek UI.
- **Nie piszemy pobierania materiału** — trasa, podpis i re-sprawdzanie dostępu należą
  do H05 i są scalone.
- **Nie tworzymy tabeli zaproszeń.** Zaproszenie jest wyłącznie powiadomieniem i nie
  nadaje dostępu (D6).
- **Nie wgrywamy plików wideo.** „Nagranie" to tekstowy `lessons.video_provider_id` —
  kontrakt §4 wyłącza prawdziwe Bunny Stream z hackathonu.
- **Nie dodajemy nowych slugów audytu ani typów powiadomień** (D5).
- **Nie dotykamy plików cudzych pakietów** — w szczególności `CourseCatalogQuery`,
  `CourseAccess`, `MaterialResource`, `CourseDetailResource` (H05) i fasad
  w `app/Support/`.
- Nie budujemy podglądu kursu „oczami uczestnika" w panelu — od tego jest
  `#/panel/kursy`.

## Decisions

### D1. Reguły domenowe kursu w serwisie `CourseWriter`, nie w kontrolerze

`App\Services\H08\CourseWriter` z metodami `create(array $validated, User $actor): Course`,
`update(Course $course, array $validated, User $actor): Course`,
`delete(Course $course, User $actor): void` — każda w `DB::transaction` z
`AuditLog::record`. Kontroler zostaje cienki. Obie reguły rzucają
`ApiException(422, 'conditions_not_met', …)` z `reason` wskazującym braki:

- **Publikacja bez lekcji** — gdy stan **po** zastosowaniu żądania ma
  `is_published = true`, a kurs nie ma ani jednej nieusuniętej lekcji;
  `reason: {missing: ['lessons']}`.
- **Usunięcie prerekwizytu** — gdy kurs jest opublikowany, ma `sequence_order`
  i istnieje inny **opublikowany** kurs o wyższym `sequence_order`;
  `reason: {blocking_course_ids: [...]}`.

*Dlaczego 422 `conditions_not_met`, a nie 403:* tabela decyzyjna kontraktu §1.1
przypisuje 403 regule blokującej **dostęp** ze względu na stan, a 422 „niespełnionym
warunkom operacji". Administracja ma dostęp do kursu — nie spełnia warunków tej
konkretnej operacji. To wyprowadzenie z istniejącej tabeli, nie nowa decyzja.

*Dlaczego reguła usuwania w ogóle istnieje:* `CourseAccess::state()` wybiera poprzednika
jako najbliższy niższy opublikowany kurs typu `course`, więc usunięcie środkowego etapu
po cichu skraca ścieżkę wszystkim, którzy na nim stoją.

### D2. Kolejność sprawdzeń przy publikacji: **najpierw złóż stan docelowy, potem waliduj**

Walidacja „kurs bez lekcji nie może być opublikowany" biegnie **po** zastosowaniu zmian
z żądania, a przed zapisem.

*Dlaczego:* przy sprawdzeniu na stanie sprzed edycji `PATCH {is_published: true}`
przechodzi, bo w momencie sprawdzenia kurs jeszcze nie jest opublikowany. To
kontrintuicyjna kolejność (waliduj po złożeniu, nie na wejściu), więc jest zapisana
wprost.

### D3. Podgląd wpływu reorderu: zastosuj w transakcji, zmierz, **cofnij transakcję**

`App\Services\H08\ReorderImpactPreview::for(array $courseIds): array` zwraca pozycje
`{user_id, first_name, last_name, course_id, course_title, from, to}` wyłącznie dla par
(osoba, kurs), w których status faktycznie się zmienia.

```php
$before = $this->statesFor($participants, $courses);

DB::transaction(function () use (...) {
    $this->renumber($order);                       // ta sama metoda, co realny reorder
    $after = $this->statesFor($participants, $courses);
    throw new RollbackPreview($before, $after);    // wyjście przez wyjątek = pewny rollback
});
```

*Dlaczego tak, a nie funkcyjnie:* `CourseAccess` ma zamrożoną sygnaturę i pakietom nie
wolno reimplementować reguły odblokowań, więc „co się stanie po zmianie kolejności" nie
da się policzyć bez dotknięcia bazy. *Dlaczego wyjście przez wyjątek:* gwarantuje
rollback także wtedy, gdy pomiar rzuci — `return` z domknięcia zatwierdziłby transakcję.
*Dlaczego ta sama metoda renumerująca, co realny reorder:* inaczej podgląd i zapis
mogłyby się rozjechać i modal by kłamał.

**Zawężenie zakresu jest częścią kontraktu serwisu, nie optymalizacją zostawioną
implementacji:** konta `role ∈ {volunteer, student}` i `status = 'active'` oraz kursy,
których `sequence_order` faktycznie się zmienia. Bez tego zapytanie rośnie z iloczynu
kont i kursów ścieżki.

### D4. Renumeracja 1..N obejmuje **cały zbiór**, nie tylko przestawiane elementy

`App\Services\H08\SequenceReorderer` nadaje pozycje 1..N wszystkim kursom ścieżki
(`sequence_order IS NOT NULL`), odpowiednio wszystkim lekcjom kursu. Przekazana lista
musi być **pełną permutacją** identyfikatorów — brak, nadmiar albo duplikat → 422
`validation_failed`.

*Dlaczego:* `sequence_order` nie ma unikalności w bazie, a `CourseAccess` wybiera
poprzednika po tej kolumnie — duplikat czyni wybór niedeterministycznym, czyli statusy
uczestników zaczynają zależeć od kolejności wierszy w zapytaniu.

### D5. Audyt operacji podrzędnych mapowany na `course.updated`, bez rozszerzania rejestru

Rejestr §3.2 daje H08 wyłącznie `course.created` / `course.updated` / `course.deleted`.
Operacje na lekcjach, materiałach, reorderze i zaproszeniach zapisujemy jako
`course.updated` **na kursie**, z opisem w `details`:
`['op' => 'lesson.deleted', 'lesson_id' => 21]`, analogicznie
`lesson.created`, `lesson.updated`, `lessons.reordered`, `courses.reordered`,
`material.uploaded`, `material.deleted`, `course.invited`.

*Dlaczego mapowanie, a nie nowe slugi:* rejestr §3.2 jest jedynym źródłem prawdy
o slugach audytu, a jego zmiana idzie wyłącznie przez strażnika kontraktu. Mapowanie
zachowuje pełną informację (kto, co, na czym) bez rozszerzania słownika. Pytanie K12
zgłoszone strażnikowi; przy odmowie faza 6 nanosi rozjazd.

### D6. Zaproszenie jest wyłącznie powiadomieniem — nie nadaje dostępu

`POST /admin/courses/{course}/invite {"user_ids":[44,45]}` → 200 `{"data":{"invited":2}}`.
Dla każdej osoby `Notify::send($user, 'course.invited', …, "/panel/kursy/{$course->slug}")`;
`Notify::send` sam tworzy wiersz w `emails` ze statusem `simulated`
(`Notify.php:36-45`). Zapraszamy wyłącznie na kurs **poza główną ścieżką**
(`sequence_order IS NULL`); kurs ze ścieżki → 422 `conditions_not_met`.

*Dlaczego bez nadawania dostępu:* tabeli zaproszeń nie ma, a migracje są zamrożone.
Kryterium 5 mówi dosłownie o powiadomieniu i e-mailu, a widoczność kursu poza sekwencją
i tak wynika z roli. *Dlaczego tylko poza ścieżką:* M4 pkt 6 mówi wprost „dotyczy kursów
poza główną ścieżką, np. webinarów". Ograniczenie jest jawnie opisane w `DEMO/H08.md`
jako do domknięcia po hackathonie.

### D7. Lista administracyjna nie korzysta z `CourseCatalogQuery`

Panel musi widzieć szkice, a `CourseCatalogQuery` filtruje po `is_published` i jest
własnością H05. Kontroler CMS buduje własne zapytanie z paginacją (`per_page` max 100),
płaskimi filtrami (`type`, `product_group`, `search`) i `withCount` dla `lessons_count`
/ `materials_count`.

*Dlaczego nie rozszerzyć `CourseCatalogQuery` o flagę „pokaż szkice":* to plik cudzego,
już scalonego pakietu; rozszerzanie go byłoby zmianą poza zakresem H08 i ryzykiem
regresji w ścieżce uczestnika.

### D8. Zasób administracyjny nie dubluje pól liczonych przez `CourseAccess`

`AdminCourseResource` zwraca `{id, title, slug, description, type, product_group,
sequence_order, edition_id, is_published, lessons_count, materials_count, created_at,
updated_at}` — bez `status` i `progress_percent`.

*Dlaczego:* status i postęp to pojęcia **ścieżki uczestnika**, liczone per-osoba przez
`CourseAccess`. W CMS-ie nie mają odbiorcy (nie ma „uczestnika" w kontekście panelu),
a ich wystawienie sugerowałoby, że CMS jest drugim źródłem prawdy o statusach.

### D9. Modal z natywnego `<dialog>`, bez nowej biblioteki

`components/h08/ReorderConfirmModal.tsx` używa natywnego `<dialog>` z `showModal()`.

*Dlaczego:* design system ma 8 komponentów bazowych i **nie ma modala**, a nowych
bibliotek UI nie wolno dokładać bez zgody sztabu. Natywny `<dialog>` daje warstwę górną,
obsługę `Esc` i focus trap bez własnego kodu — co jest wprost wymogiem DoD
(przewodnik §6 pkt 4), którego H19 nie domknął i nie powtarzamy tego.

### D10. Najpierw host, potem goście — rejestr slotów powstaje razem z ekranem

Faza 5 dowozi ekran z **pustymi** slotami (`frontend/lib/slots/admin-courses.ts`,
regiony `course-materials` / `course-assignments` / `course-actions`), a fazy 7–8
wchodzą w nie wyłącznie przez rejestr.

*Dlaczego to nie kosmetyka:* dokładnie tym samym wejściem posłuży się H09
(`<AssignmentPanel>`), który jest osobnym pakietem i nie może dotykać naszych plików.
Gdyby rejestr powstał dopiero z pierwszym gościem, H09 nie miałby gdzie wejść bez
edycji cudzych stron. Wzorzec jest sprawdzony — `lib/slots/course-page.ts` dał H06/H09/
H17 wejście w stronę kursu H05.

## Risks / Trade-offs

- **Brak sekcji §2 kontraktu dla H08** → kształt tras i payloadów jest propozycją, nie
  ustaleniem. *Mitygacja:* zgłoszenie K1–K12 wysłane przed implementacją (SLA 30 min);
  praca biegnie równolegle wg propozycji, a rozjazdy nanosi **faza 6** — zanim fazy 7–8
  dołożą trasy H08b, żeby druga połowa szła już wg zatwierdzonego kształtu.
- **Podgląd wpływu dotyka bazy w transakcji cofanej** → jeśli rollback nie zadziała,
  podgląd trwale przestawi ścieżkę wszystkim uczestnikom. *Mitygacja:* wyjście przez
  wyjątek (nie `return`), plus test asertujący, że `sequence_order` **wszystkich** kursów
  jest niezmienione po `POST .../reorder/preview` — asercja na stanie bazy, nie na
  „braku `save()` w kodzie".
- **Podgląd może rozjechać się z rzeczywistością** → modal pokazałby coś innego, niż
  faktycznie się stanie. *Mitygacja:* podgląd i realny reorder używają **tej samej**
  metody renumerującej i tej samej `CourseAccess`; test integracyjny porównuje zapowiedź
  podglądu z realnym efektem po reorderze, zamiast duplikować regułę w teście.
- **Soft delete lekcji ma skutek uboczny na regule odblokowań** — usunięcie ostatniej
  nieukończonej lekcji może natychmiast ukończyć kurs i odblokować następny, bo
  `Course::lessons()` nie ma `withTrashed()`. *Mitygacja:* to zachowanie jest **świadome
  i udokumentowane testem**, nie ukryte; alternatywą byłaby zmiana relacji w modelu
  współdzielonym z H05, czyli wyjście poza zakres pakietu.
- **Zmiany CMS mogą przesunąć liczby seeda demo**, na których stoi pięć innych pakietów.
  *Mitygacja:* `SeedIntegrityTest` jest bramką w każdej fazie; kursy tworzone przez CMS
  są danymi runtime, a seed pozostaje kanonicznym stanem startowym (żadnej zmiany
  w seedach).
- **Limit uploadu vs konfiguracja PHP** — przy `post_max_size` / `upload_max_filesize`
  poniżej 10 MB za duży plik zwróci **pustą odpowiedź zamiast koperty 422**, co wywraca
  kryterium ★4. *Mitygacja:* sprawdzić limity w kontenerze przy pierwszym uruchomieniu
  fazy 7, przed pisaniem testu.
- **Jeden PR na oba sub-pakiety przekracza orientacyjny limit ~400 linii** z przewodnika
  §4 pkt 3. *Świadoma decyzja zespołu:* obie połowy dotykają tego samego ekranu, więc
  dwie rundy review kosztowałyby więcej niż dają. Granica a/b zostaje granicą faz,
  commitów i jawnego podziału zakresu w `DEMO/H08.md` — czego wprost żąda wiersz 4.4
  tablicy koordynacyjnej.

## Migration Plan

Brak migracji — schemat jest zamrożony i wystarczający. Brak zmian w seedach: kursy
tworzone przez CMS są danymi runtime, a `04-seed-demo.md` pozostaje kanonicznym stanem
startowym.

Wdrożenie to zwykły merge za `config('features.h08')` (flaga już istnieje i jest `true`).
Wyłączenie flagi zdejmuje trasy i ekran bez cofania commitów; dane w `courses`,
`lessons` i `materials` zostają nietknięte. `docker compose down -v && bash scripts/setup.sh`
przywraca stan sprzed eksperymentów w panelu.
