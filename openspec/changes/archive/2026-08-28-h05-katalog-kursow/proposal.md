## Why

Pakiet H05 (Katalog kursów i sekwencyjne odblokowanie) jest już zaimplementowany i
scalony do `main`, ale nigdy nie przeszedł przez proces OpenSpec — brakowało folderu
zmiany, więc jego zachowanie nie ma delty do zsynchronizowania z `openspec/specs/`.
Ta zmiana jest dokumentacją wsteczną: opisuje to, co faktycznie zbudowano (łącznie
z zatwierdzonymi i oczekującymi na zatwierdzenie odstępstwami z `DEMO/H05.md`), nie
projektuje nowego zachowania.

## What Changes

- **`course-catalog`** — nowa zdolność opisująca katalog etapów (`GET /courses`),
  szczegóły kursu z lekcjami i materiałami (`GET /courses/{slug}`), egzekwowanie
  `CourseAccess::state()` (403 `course_locked` z `reason.missing`), zdarzenie
  `course.unlocked` przy pierwszym odblokowaniu, filtr grup produktowych oraz
  pobieranie materiału podpisanym wygasającym linkiem
  (`GET /materials/{material}/download`).
- Zachowanie obejmuje udokumentowane odstępstwa od karty pakietu, ponieważ tak
  faktycznie działa kod na `main` — nie idealizuję ich do pierwotnego zakresu:
  - role spoza `volunteer`/`student` (prowadzący, administracja) nie podlegają
    sekwencyjnej blokadzie — status `locked` jest sprowadzany do `in_progress`
    przed serializacją (odstępstwo 1, **oczekuje na zatwierdzenie strażnika**);
  - `product_group = 'both'` oznacza brak zawężenia katalogu, nie warunek
    `IN ('both','both')` (odstępstwo 6, **oczekuje na zatwierdzenie**);
  - obiekt materiału zwraca dodatkowe pole `size` (liczba bajtów) poza kształtem
    z kontraktu §2 (odstępstwo 7, **oczekuje na zatwierdzenie**);
  - trasa pobierania materiału jest wpisana do `config/public_routes.php` jako
    podpisana (`signed`), nie `auth`-owa (odstępstwo a, **zatwierdzone przy bramie
    otwierającej H1**);
  - prowadzący widzi wyłącznie kursy, które prowadzi — część „podgląd" z matrycy
    ról nie ma nośnika w danych i nie została zaimplementowana (odstępstwo 5,
    **oczekuje na zatwierdzenie**).
- Kryterium odbioru H05.3 z karty pakietu („zaliczenie testu kursu 2 przez
  `demo:pass-test` odblokowuje kurs 3") jest udokumentowane jako **błędnie
  sformułowane** w źródle: `CourseAccess::state()` wymaga też kompletu ukończonych
  lekcji, więc pakiet dostarcza dodatkową komendę demo `demo:complete-lessons`
  (odstępstwo 3, **oczekuje na zatwierdzenie** przeredagowania kryterium).

## Capabilities

### New Capabilities

- `course-catalog`: lista etapów ze statusami i postępem, widok kursu z lekcjami
  i materiałami, egzekwowanie sekwencyjnego odblokowania, zdarzenie
  `course.unlocked`, filtr grup produktowych, pobieranie materiału podpisanym
  linkiem.

### Modified Capabilities

Brak. `course-catalog` nie istniała wcześniej w `openspec/specs/`.

## Impact

- Wyłącznie dokumentacja planistyczna — kod H05 jest już scalony do `main`
  (`backend/app/Http/Controllers/Api/V1/CourseController.php`,
  `CourseCatalogQuery`, `CourseUnlockNotifier`, `CourseListResource` /
  `CourseDetailResource` / `MaterialResource`,
  `frontend/app/(uczestnik)/panel/kursy/**`). Ta zmiana nie modyfikuje żadnego
  z tych plików.
- Cztery odstępstwa (1, 5, 6, 7) pozostają formalnie **niezatwierdzone przez
  strażnika kontraktu** mimo że kod je realizuje na `main` — `tasks.md` i
  `specs/course-catalog/spec.md` odnotowują ten stan jawnie, żeby nie ukryć długu
  za pozorem kompletności.
