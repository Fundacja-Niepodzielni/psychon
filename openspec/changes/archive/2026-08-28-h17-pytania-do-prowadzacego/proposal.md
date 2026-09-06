## Why

Pętla nauki uczestniczki urywa się na lekcji: nie ma żadnego kanału zadania pytania
osobie prowadzącej, a panel prowadzącego (`app/(prowadzacy)/prowadzacy/page.tsx`) to
placeholder, który wprost zapowiada pakiet H17. Baza jest gotowa i zamrożona —
tabela `instructor_questions` (migracja `2026_01_01_000090`, kolumny `user_id`,
`lesson_id`, `question`, `answer`, `answered_by`, `answered_at`), model
`App\Models\InstructorQuestion` oraz jedno nieodpowiedziane pytanie w `DemoSeeder`
istnieją, ale `backend/routes/api/h17.php` jest pustym stubem. Bez H17 dane
demonstracyjne opisują funkcję, której nie da się pokazać.

## What Changes

- **Zadanie pytania z lekcji** — `POST /lessons/{id}/questions` dla uczestnika
  (`volunteer`, `student`) z aktywnym dostępem; lekcja z kursu zablokowanego
  odpowiada `403 course_locked` zgodnie z `CourseAccess::state()`, dokładnie jak
  trasy H06.
- **Skrzynka prowadzącego** — `GET /instructor/questions` zwraca wyłącznie pytania
  zaadresowane do wykonawcy, w standardowej kopercie z paginacją, z filtrem
  `?answered=false` na nieodpowiedziane oraz licznikiem `meta.extra.unanswered`.
- **Odpowiedź** — `POST /instructor/questions/{id}/answer` zapisuje `answer`,
  `answered_by` i `answered_at`; pytanie spoza skrzynki wykonawcy odpowiada
  `404 not_found`, a pytanie już odpowiedziane `403 entry_locked`.
- **Odczyt uczestnika przy lekcji** — `GET /lessons/{id}/questions` zwraca wyłącznie
  własne pytania pytającego wraz z odpowiedziami. **Trasa nie istnieje w kontrakcie
  §2** — kryterium odbioru 3 („odpowiedź widoczna przy lekcji u pytającego") nie ma
  bez niej nośnika, więc zgłoszenie do strażnika kontraktu jest **blokującym
  warunkiem wstępnym** implementacji (SLA 30 min, `docs/hackathon/00-przewodnik.md`).
- **Routing według reguły dziedziczenia** — adresat liczony jest **w chwili
  odczytu**, nie zapisywany na pytaniu: lekcja z własnym przypisaniem → jej
  prowadzący; lekcja bez przypisania → prowadzący kursu; brak przypisania → pytanie
  bez adresata. Reguła jest **własnością H09**, który wystawia
  `App\Services\H09\AssignmentResolver::forLesson(Lesson): ?User` (ustalenie z
  `DEMO/H9-prep-doc.md` §5.1, punkt K8). H17 **konsumuje** ją przez cienki adapter
  `QuestionRouting`, a dopóki H09 nie jest scalony, adapter degraduje się do
  zapytania kursowego identycznego z tym w `CourseDetailResource::instructor()`.
  Po scaleniu H09 znika ciało fallbacku, nie interfejs.
- **Powiadomienia** — `question.asked` do prowadzącego przy zadaniu pytania i
  `question.answered` do pytającego przy odpowiedzi, wyłącznie przez `Notify::send`
  (rejestr §3.1, oba typy przypisane do H17). **Bez zdarzeń audytowych** — rejestr
  §3.2 nie zawiera żadnego sluga `question.*`, a wymyślanie własnego jest zakazane.
- **Interfejs** — zakładka „Pytania" w panelu prowadzącego
  (`#/prowadzacy/pytania`) z filtrem nieodpowiedzianych i formularzem odpowiedzi,
  wpis w rejestrze menu prowadzącego (import + jedna linia w tablicy) oraz slot
  uczestnika na stronie kursu `#/panel/kursy/:slug` — formularz pytania przy lekcji
  i lista własnych pytań z odpowiedziami. Treści pytań i odpowiedzi renderowane
  jako tekst, nigdy jako HTML.

## Capabilities

### New Capabilities

- `instructor-questions`: zadanie pytania z lekcji, wyznaczanie adresata regułą
  dziedziczenia przypisań, skrzynka prowadzącego z filtrem nieodpowiedzianych,
  odpowiedź ze stemplem autora i czasu, odczyt własnych pytań przy lekcji,
  powiadomienia `question.asked` / `question.answered`.

### Modified Capabilities

Brak. `instructor-questions` nie istnieje wcześniej w `openspec/specs/`, a H17 nie
zmienia wymagań żadnej istniejącej zdolności — wchodzi do `course-catalog`
i panelu prowadzącego wyłącznie slotami, bez modyfikacji ich kontraktów.

## Impact

- **Backend (nowe pliki H17):** `backend/routes/api/h17.php` (jedyny plik tras
  pakietu), `app/Http/Controllers/Api/V1/H17/*`, `app/Http/Requests/H17/*`,
  `app/Http/Resources/H17/*`, `app/Services/H17/QuestionRouting.php`,
  `tests/Feature/H17/*`.
- **Bez migracji.** Schemat `instructor_questions` wystarcza; brak kolumny
  `instructor_id` jest tu cechą, nie brakiem — to on daje „nowe pytania idą do nowej
  osoby, odpowiedziane zostają u odpowiadającego" bez żadnej zmiany bazy.
- **Frontend:** nowa strona `app/(prowadzacy)/prowadzacy/pytania/page.tsx`, wpis
  `lib/menu/instructor/h17-pytania.ts` + dwie linie w `lib/menu/instructor/index.ts`,
  komponenty w `components/questions/`, funkcje API w `lib/questions.ts`, oraz
  slot na stronie kursu H05.
- **Zależności międzypakietowe:** H09 (`AssignmentResolver`, przypisania
  lekcja-poziom) i H08 (treści kursów) są planowane jako dostarczane przez inne
  osoby; H17 nie tworzy przypisań ani treści i działa na seedzie demo do czasu ich
  scalenia. H16 obsługuje szynę powiadomień — oba typy H17 są już w rejestrze.
- **Ryzyko formalne:** `GET /lessons/{id}/questions` pozostaje niezatwierdzony przez
  strażnika kontraktu do czasu odpowiedzi; `tasks.md` traktuje to zgłoszenie jako
  zadanie numer jeden i nie pozwala zamknąć pakietu z niepotwierdzoną trasą.
