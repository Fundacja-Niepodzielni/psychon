## Context

Zob. `proposal.md` — „Why". Poniżej wyłącznie to, co kształtuje podejście techniczne.

Stan zastany, zweryfikowany w kodzie:

- Tabele `tests`, `test_questions`, `test_answers`, `test_attempts`,
  `workshop_completions` istnieją z kompletem kolumn: `test_attempts` ma
  `questions_snapshot` (json), `answers` (json), `score_percent`, `passed`,
  `attempt_number`, oraz **unikat `(user_id, test_id, attempt_number)`** —
  gotowy jako bariera bazodanowa przy wyścigu.
- `tests.pass_threshold` / `tests.attempts_limit` są nadpisaniami per kurs
  (`null` = czytaj z edycji); `Settings::edition('test_pass_threshold' /
  'test_attempts_limit')`, `CourseAccess::state()`, `ProgressAggregator`,
  `Notify::send`, `AuditLog::record` — gotowe, sygnatury zamrożone.
- Baza to PostgreSQL: `SELECT ... FOR UPDATE` **nie działa razem z agregatem
  (`MAX`)** w jednym zapytaniu — Postgres odrzuca `FOR UPDATE` na wyniku
  agregującym. Numeracja musi więc blokować wiersze i liczyć maksimum w PHP,
  nie w SQL.
- `routes/api/h10.php` startował pusty — pakiet startuje od zera tras własnych.
- Panel banku pytań w UI administracji nie istnieje jeszcze — slot ekranu
  należy do `#/admin/kursy`, którego właścicielem jest H08a.

Ograniczenia: brak nowych zależności composer/npm, brak migracji, tylko własny
plik tras, ocenianie wyłącznie serwerowe (klient nigdy nie widzi, która
odpowiedź jest poprawna, przed wysłaniem podejścia), autoryzacja po stronie
serwera, walidacja przez FormRequest, teksty UI po polsku.

## Goals / Non-Goals

**Goals:**

- Numer podejścia bez dziur i bez duplikatów nawet przy równoległych żądaniach
  tej samej osoby (kryterium 2) — na zamrożonym schemacie, bez nowej tabeli
  sekwencji.
- Treść testu widziana przez historyczne podejście jest niezmienna względem
  późniejszej edycji banku pytań (kryteria 3 i 6) — właściwość konstrukcji
  (snapshot), nie dyscypliny operacyjnej.
- Klient nigdy nie otrzymuje flagi poprawności przed oceną podejścia — ocena
  i próg żyją wyłącznie po stronie serwera.
- Ścieżka „trzy nieudane podejścia → blokada → interwencja opiekuna → reset →
  nowe podejście" jest kompletna i audytowalna end-to-end.

**Non-Goals:**

- Ekran administracji do edycji banku pytań — API i testy gotowe, UI czeka na
  slot w `#/admin/kursy` (H08a).
- Cofanie się do wcześniejszego pytania w trakcie podejścia.
- Częściowy/bonusowy reset (np. „dodaj jedno podejście") — model danych nie ma
  na to kolumny; reset jest całkowity.
- Wgląd administracji w cudzą historię podejść przez ten pakiet — idzie przez
  kartę osoby (H18), nie przez trasy H10.

## Decisions

### D1. Numeracja podejść: `lockForUpdate` na wierszach + `MAX` w PHP, unikat jako siatka bezpieczeństwa

W transakcji: zablokuj (`lockForUpdate`) wszystkie wiersze `test_attempts`
danego użytkownika i testu, policz `MAX(attempt_number)` **w PHP** po
pobraniu zablokowanych wierszy, zapisz `+1`. Istniejący unikat
`(user_id, test_id, attempt_number)` łapie każdy przypadek, w którym mimo
blokady doszłoby do kolizji.

*Dlaczego nie `SELECT MAX(...) FOR UPDATE` w jednym zapytaniu:* PostgreSQL
odrzuca `FOR UPDATE` razem z funkcją agregującą w tym samym zapytaniu — to
ograniczenie silnika, nie wybór projektowy. Blokada wierszy + agregacja w PHP
daje ten sam efekt serializacji bez odejścia od Postgresa.
*Alternatywa:* sekwencja Postgresa per (user, test) — wymagałaby migracji
tworzącej sekwencje dynamicznie, niewspółmierne do zamrożonego schematu.
Test `ConcurrentAttemptTest::test_attempt_numbers_are_contiguous_from_one`
(`--filter=ConcurrentAttempt`) i
`test_unique_index_blocks_a_duplicated_attempt_number` pilnują obu warstw
osobno.

### D2. Snapshot treści i flag poprawności zamrażany przy **każdym** podejściu

`TestGrader::snapshot()` czyta pytania i odpowiedzi **z flagą `is_correct`**
i zapisuje to jako `questions_snapshot` razem z podejściem, zanim jakakolwiek
późniejsza zmiana banku pytań mogłaby dotrzeć do rekordu. Ocena
(`TestGrader::grade()`) liczy wynik wyłącznie z tego zamrożonego obrazu, nie
z bieżącego stanu `test_questions`/`test_answers`.

*Dlaczego:* kryteria 3 i 6 wymagają, żeby edycja lub usunięcie pytania w
panelu **nie zmieniały** wyniku i treści już złożonego podejścia. Gdyby ocena
czytała bieżący bank pytań, edycja API `AdminTestQuestionController::update()`
mogłaby po cichu przeliczyć historię. *Alternatywa:* przechowywać tylko
wynik, bez treści pytań — odrzucona: ekran wyniku musi pokazać treść błędnych
pytań tak, jak brzmiała w chwili podejścia, nie jak brzmi dziś.

### D3. Ocenianie wyłącznie serwerowe — `GET` nigdy nie ujawnia `is_correct`

`TestController::show()` mapuje pytania i odpowiedzi bez pola `is_correct`.
Jedyne miejsce w kodzie, które czyta tę flagę dla uczestnika, to
`TestGrader::grade()` wewnątrz `storeAttempt()`, po stronie serwera.
`AdminTestQuestionController` zwraca `is_correct` tylko na trasach
administracyjnych (`role:project_manager,super_admin`).

*Dlaczego:* to bezpośrednie wymaganie pakietu („ocenianie wyłącznie
serwerowe") — klient, który przechwyci odpowiedź `GET /courses/{slug}/test`,
nie ma z niej żadnej przewagi.

### D4. Reset limitu: kasuje historię, nie dopisuje puli

`AdminTestResetController::store()` usuwa (`delete()`) wszystkie
`test_attempts` użytkownika dla danego testu; kolejne podejście zaczyna
numerację od 1. Powód (`reason`, min. 3 znaki) jest wymagany i trafia do
`AuditLog::record(..., 'attempts.reset', ...)` razem z liczbą usuniętych
podejść.

*Dlaczego:* model danych (`attempt_number` liczone od 1 per test i
użytkownik, bez kolumny na „dodatkowy limit") jest zamrożony — dopisanie puli
bonusowych podejść wymagałoby nowej kolumny i migracji. Kasowanie z pełnym
audytem (kto, komu, dlaczego, ile podejść usunięto) jest najprostszym
rozwiązaniem spójnym ze schematem. *Kompromis zapisany w Risks poniżej:*
usunięte podejścia znikają z `GET /tests/{id}/attempts` — historia
przedreset owa nie jest już widoczna uczestnikowi, tylko w dzienniku audytu.

### D5. `attempt.failed_final` trafia do wszystkich `project_manager`, nie tylko do opiekuna przypisanego

Gdy podejście wyczerpujące limit kończy się porażką,
`TestController::notifyFinalFailure()` wysyła `Notify::send(...,
'attempt.failed_final', ...)` do **każdego** konta z rolą `project_manager`,
nie tylko do superwizora przypisanego tej osobie (przypisanie superwizora
dotyczy H12, nie ról administracyjnych ogólnie).

*Dlaczego:* karta pakietu nie precyzuje odbiorcy poza „opiekun"; `project_manager`
to rola odpowiadająca za interwencję (reset limitu), a lista kont tej roli w
demo jest mała. *Alternatywa:* kierować tylko do przypisanego superwizora
wolontariusza — odrzucona: superwizor (H12) jest przypisywany do
wolontariuszy do superwizji grupowych, nie jest to ta sama relacja co
„opiekun projektu decydujący o resecie limitu testu".

### D6. Bank pytań: edycja podmienia cały zestaw odpowiedzi po `id`, nie tylko treść

`AdminTestQuestionController::update()` z podanym `answers`: pozycje z `id`
aktualizują istniejące rekordy, pozycje bez `id` tworzą nowe, rekordy, których
`id` nie pojawiło się w żądaniu, są usuwane (`whereKeyNot($keepIds)->delete()`).
Walidacja (`StoreTestQuestionRequest` / `UpdateTestQuestionRequest`) wymusza
dokładnie jedną odpowiedź `is_correct = true`.

*Dlaczego:* to najprostszy model edycji spójny z formularzem panelu (lista
odpowiedzi edytowana jako całość), a ograniczenie „dokładnie jedna poprawna"
jest wymaganiem domenowym testu jednokrotnego wyboru. Ponieważ oceny
historycznych podejść czytają wyłącznie `questions_snapshot` (D2), ta operacja
nigdy nie dotyka już złożonych podejść.

## Risks / Trade-offs

- **Reset limitu kasuje historię podejść** (D4) → uczestnik traci widok
  własnych wcześniejszych prób w `GET /tests/{id}/attempts` po resecie.
  *Mitygacja:* ślad zostaje w dzienniku audytu (`attempts.reset` z liczbą
  usuniętych podejść); jeśli po hackathonie okaże się to niewystarczające,
  zmiana na „miękkie" oznaczenie podejść jako nieaktywnych wymaga nowej
  kolumny i migracji.
- **`attempt.failed_final` do wszystkich `project_manager`** (D5) → przy
  większej liczbie kont administracyjnych mogłoby generować szum
  powiadomień. *Mitygacja:* akceptowalne dla rozmiaru programu w MVP;
  ograniczenie do przypisanego superwizora to zmiana jednej pętli, jeśli
  sztab zdecyduje inaczej.
- **Panel banku pytań bez UI** → administracja może zarządzać pytaniami
  wyłącznie przez API do czasu, aż H08a dostarczy slot ekranu.
  *Mitygacja:* zależność jest jednostronna i nieblokująca dla kryteriów H10 —
  API i testy są kompletne niezależnie od stanu H08a.
- **Blokada `lockForUpdate` na wszystkich podejściach użytkownika+testu przy
  każdym nowym podejściu** → przy dużej liczbie jednoczesnych podejść tej
  samej osoby (nierealistyczne — jedna osoba composuje jedno podejście na
  raz) serializowałoby zapisy. *Mitygacja:* akceptowalne — liczba wierszy do
  zablokowania jest ograniczona przez `attempts_limit` (typowo 3-20), więc
  blokada jest tania i krótkotrwała.

## Migration Plan

Brak migracji bazy — wszystkie tabele istnieją z kompletem kolumn i unikatem
wymaganym przez D1. Wdrożenie to zwykły merge za flagą `config('features.h10')`;
wyłączenie flagi zdejmuje trasy pakietu bez odwracania commitów. Rollback:
flaga na `false`, dane w `test_attempts` / `workshop_completions` zostają
nietknięte (nic nie kasujemy).
