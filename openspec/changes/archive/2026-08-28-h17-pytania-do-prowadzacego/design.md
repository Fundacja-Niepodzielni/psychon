## Context

Motywacja i zakres: patrz `proposal.md`. Wymagania obserwowalne: patrz
`specs/instructor-questions/spec.md`.

Stan zastany, zweryfikowany w kodzie na `origin/main`:

- `instructor_questions` (`backend/database/migrations/2026_01_01_000090_create_communication_tables.php:39-48`)
  ma `user_id`, `lesson_id`, `question`, `answer`, `answered_by`, `answered_at` —
  **bez kolumny `instructor_id`**. Migracje są zamrożone; H17 nie potrzebuje żadnej.
- `App\Models\InstructorQuestion` istnieje z relacjami `user`, `lesson`, `answeredBy`.
- `course_assignments` ma `course_id`, `lesson_id` (null = cały kurs), `instructor_id`,
  `unassigned_at`. `DemoSeeder` przypisuje `joanna@demo.pl` do kursów 1–3 na poziomie
  kursu i tworzy jedno nieodpowiedziane pytanie na pierwszej lekcji kursu 2.
- `CourseDetailResource::instructor()` już wykonuje zapytanie kursowe
  (`lesson_id IS NULL`, `unassigned_at IS NULL`, `orderBy('id')->first()`) — to jest
  istniejący precedens kształtu zapytania.
- `DEMO/H9-prep-doc.md` §5.1 i K8 przesądzają, że **H09 jest właścicielem reguły
  dziedziczenia** i wystawi `App\Services\H09\AssignmentResolver::forLesson(Lesson): ?User`,
  a H17 ją konsumuje — analogicznie do `CourseAccess` w H05/H06/H08.
- `backend/routes/api/h17.php` jest pustym stubem; `config('features.h17')` jest `true`.
- Panel prowadzącego ma layout, stronę startową i rejestr menu
  (`frontend/lib/menu/instructor/index.ts`) przygotowany na wpisy pakietów.

Ograniczenia twarde: kontrakt API rozstrzyga kształt HTTP; rejestr §3.2 nie zawiera
sluga `question.*`, więc H17 nie zapisuje audytu; pakiet dotyka wyłącznie własnego
pliku tras.

## Goals / Non-Goals

**Goals:**

- Jedno źródło reguły dziedziczenia, z którego H17 korzysta i którego nie duplikuje.
- Adresat liczony przy odczycie, bez kolumny i bez migracji — dzięki temu kryterium
  „nowe pytania do nowej osoby, odpowiedziane zostają u odpowiadającego" wychodzi
  z danych, nie z dodatkowej reguły.
- Dwa rozłączne kształty zasobu (uczestnika i prowadzącego), żeby skrzynka nie
  wyciekała danych osobowych do widoku uczestnika i odwrotnie.
- Pakiet działa na `main` zanim H08 i H09 zostaną scalone, i nie wymaga przepisania
  po ich scaleniu.

**Non-Goals:**

- Tworzenie ani edycja przypisań prowadzących — to H09.
- Treści kursów i lekcji — to H08.
- Wątkowanie (odpowiedź na odpowiedź), edycja i usuwanie pytań, załączniki.
- Powiadomienia inne niż `question.asked` i `question.answered`.
- Jakikolwiek wpis audytowy.

## Decisions

### D1. Reguła dziedziczenia konsumowana z H09 przez adapter `QuestionRouting`

H17 wprowadza `App\Services\H17\QuestionRouting` z dwoma wejściami:
`forLesson(Lesson): ?User` (adresat pytania) i `lessonIdsFor(User): Builder|array`
(zakres skrzynki prowadzącego). Ciało `forLesson` deleguje do
`App\Services\H09\AssignmentResolver::forLesson()`, jeżeli klasa istnieje
(`class_exists`), a w przeciwnym razie wykonuje ten sam zapytaniowy fallback:
przypisanie lekcji → przypisanie kursu → `null`.

Alternatywy odrzucone: (a) własna, niezależna reguła w H17 — łamie ustalenie K8 z
`DEMO/H9-prep-doc.md` i tworzy drugie źródło prawdy, które rozjedzie się z H09
przy pierwszej zmianie; (b) twarda zależność od H09 bez fallbacku — blokuje H17 do
czasu scalenia cudzego pakietu, wbrew zasadzie „mock ponad blokadę" z przewodnika §
o pracy równoległej. Wybrany wariant kosztuje jeden `class_exists` i znika przez
usunięcie ciała fallbacku, bez zmiany sygnatury ani wywołań.

### D2. Zero kolumn, adresat wyznaczany przy odczycie

Pytanie nie zapisuje adresata. Skrzynka prowadzącego to zapytanie po
`instructor_questions` zawężone do lekcji, których adresatem **jest teraz** wykonawca,
w sumie logicznej z pytaniami, na które wykonawca już odpowiedział
(`answered_by = wykonawca`). Ten drugi człon jest konieczny: bez niego prowadząca,
której przypisanie zamknięto, straciłaby wgląd we własne odpowiedzi.

Alternatywa odrzucona: kolumna `instructor_id` stemplowana przy zapisie — wymaga
migracji (zamrożone) i wprowadza rozjazd, gdy przypisanie zmieni się przed
odpowiedzią.

Konsekwencja wydajnościowa: zakres skrzynki to zapytanie po identyfikatorach lekcji
wyprowadzonych z `course_assignments`. Przy skali hackathonu (dziesiątki lekcji,
pojedyncze przypisania) jest to jedno podzapytanie `whereIn`, nie N+1.

### D3. Dwa zasoby, nie jeden

- **Zasób uczestnika** (`POST /lessons/{id}/questions`, `GET /lessons/{id}/questions`):
  `id`, `lesson_id`, `question`, `answer`, `answered_by_name`, `answered_at`,
  `created_at`, `updated_at`. Nazwisko odpowiadającego jako string, bez identyfikatora
  i bez e-maila.
- **Zasób prowadzącego** (`GET /instructor/questions`,
  `POST /instructor/questions/{id}/answer`): pola powyżej oraz `answered_by` (id),
  `user` (`id`, `first_name`, `last_name`) i `lesson`
  (`id`, `title`, `course`: `id`, `slug`, `title`).

Wzorzec przeniesiony z H11, gdzie kontrakt rozdziela zasób uczestnika od
administracyjnego. Alternatywa (jeden zasób z warunkowymi polami) odrzucona —
warunkowa serializacja to najczęstsze źródło wycieku pól w review.

### D4. 404 zamiast 403 dla cudzego pytania

`POST /instructor/questions/{id}/answer` na pytanie spoza skrzynki wykonawcy zwraca
`404 not_found`, zgodnie z tabelą §1.1 („zasób nie istnieje lub należy do innego
użytkownika"). Powtórna odpowiedź na własne pytanie zwraca `403 entry_locked` — to
reguła stanu, nie własności, więc kod domenowy jest właściwy; `entry_locked` jest już
w kontrakcie (H11) i nie wymaga nowego sluga.

### D5. Blokada dostępu do lekcji przez `CourseAccess`, powielona z H06

Trasy `POST|GET /lessons/{id}/questions` egzekwują tę samą regułę co H06: `CourseAccess::state()`,
a `status === 'locked'` → `403 course_locked` z `reason.required_course_id` i
`reason.missing`. Logika jest przepisana do H17 (kilka linii), ponieważ helper H06
żyje w zamkniętym pliku tras cudzego pakietu i nie jest publicznym punktem wejścia.
Źródłem prawdy pozostaje `CourseAccess`, więc duplikacja dotyczy tłumaczenia stanu na
wyjątek, nie samej reguły.

### D6. Nowa trasa `GET /lessons/{id}/questions` jako warunek wstępny

Trasa nie istnieje w kontrakcie §2. Zgłoszenie do strażnika (SLA 30 min) jest
zadaniem numer jeden w `tasks.md` i blokuje implementację części uczestnika. Wybrano
tę trasę zamiast rozszerzania `GET /lessons/{id}` o pole `questions`, bo tamta trasa
należy do pliku H06, którego H17 nie może dotykać, a jej kształt jest już wdrożony.

Jeżeli strażnik odmówi, planem awaryjnym jest wariant „tylko powiadomienie":
`question.answered` niesie treść odpowiedzi w `body` i link do lekcji. Wariant ten
spełnia kryterium 3 częściowo i MUSI zostać odnotowany w `DEMO/H17.md` jako
odstępstwo — nie wolno zamknąć pakietu, udając komplet.

### D7. Interfejs wchodzi wyłącznie slotami

Panel prowadzącego dostaje własną stronę `#/prowadzacy/pytania` plus wpis w rejestrze
menu (`lib/menu/instructor/h17-pytania.ts` + import i jedna linia w tablicy w
`index.ts`) — to jedyna dozwolona ingerencja w plik rejestru. Strona kursu
`#/panel/kursy/:slug` należy do H05; H17 dostarcza komponent i osadza go zgodnie z
mapą slotów z `docs/hackathon/00-przewodnik.md:117-118`, bez przepisywania widoku
kursu. Treści renderowane jako tekst w JSX (React escapuje domyślnie), nigdy przez
`dangerouslySetInnerHTML`.

## Risks / Trade-offs

- **Strażnik odrzuca `GET /lessons/{id}/questions`** → plan awaryjny D6; kryterium 3
  spada do „widoczne w powiadomieniu" i trafia do `DEMO/H17.md` jako jawne
  odstępstwo, a nie jako cicha luka.
- **H09 scala się z inną sygnaturą niż `forLesson(Lesson): ?User`** → adapter
  `QuestionRouting` jest jedynym miejscem do poprawki; koszt to jedna metoda. Ryzyko
  zmniejsza wcześniejsze uzgodnienie z właścicielem H09 (zadanie w `tasks.md`).
- **H09 wprowadza przypisania lekcja-poziom, których seed demo nie ma** → testy H17
  tworzą przypisania lekcja-poziom fabrykami, więc obie ścieżki kryterium 1 są
  pokryte niezależnie od tego, co robi seed.
- **Skrzynka prowadzącej po zamknięciu przypisania** → człon `answered_by = wykonawca`
  z D2 zachowuje historię odpowiedzi; pytania nieodpowiedziane celowo znikają, bo tak
  brzmi kryterium 3.
- **Rozmiar PR** — pełny wycinek pionowy (backend + dwa wejścia UI + testy) zbliża się
  do limitu ~400 linii z `AGENTS.md`. Mitygacja: brak migracji, brak nowych zależności,
  komponenty trzymane małe; przy przekroczeniu limitu dzielić po granicy
  backend / frontend, nie po kryteriach odbioru.
- **Pytanie bez adresata** (lekcja bez przypisań) jest zapisywane i nie generuje
  powiadomienia — świadomy kompromis. Alternatywa (odrzucenie 422) karałaby
  uczestniczkę za brak konfiguracji po stronie administracji.

## Migration Plan

Brak migracji bazy i brak zmian wstecznie niezgodnych. Wdrożenie to scalenie gałęzi
`pakiet/H17-pytania-do-prowadzacego`; wyłącznik awaryjny to `config('features.h17')`
ustawione na `false`, co wygasza wszystkie trasy pakietu bez rewertu. Frontend przy
wyłączonej fladze dostaje 404 na trasach H17 — wpis w menu prowadzącego usuwa się
przez usunięcie dwóch linii z rejestru.

## Open Questions

- Czy skrzynka prowadzącego ma domyślnie pokazywać wyłącznie nieodpowiedziane
  (`?answered=false` jako domyślka serwera), czy komplet z filtrem po stronie UI?
  Spec zakłada komplet i filtr jawny; zmiana domyślki nie rusza wymagań ani zadań.
- Czy `question.answered` ma nieść pełną treść odpowiedzi w `body`, czy tylko
  zapowiedź z linkiem. Rozstrzygnięcie zależy od odpowiedzi strażnika z D6 i nie
  zmienia podziału zadań.
