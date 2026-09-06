## Why

Przejście do kolejnego etapu ścieżki wymaga opanowania materiału, nie tylko obejrzenia
lekcji. Pakiet H10 (moduł M6, priorytet **P0**, rozmiar **L**) dostarcza test wiedzy na
koniec kursu — dziesięć pytań jednokrotnego wyboru, ocenianych wyłącznie po stronie
serwera, z limitem podejść i progiem zaliczenia sterowanym ustawieniami edycji — oraz
odznaczenie warsztatu stacjonarnego, drugiego (obok testów) warunku certyfikatu.

Rozmiar L wynika z liczby reguł, które muszą działać jednocześnie i bez luk: numeracja
podejść odporna na równoległość, zamrożony obraz pytań w chwili podejścia (żeby późniejsza
edycja banku pytań w panelu nie zmieniała historii), oraz procedura odblokowania po
trzykrotnym niezaliczeniu, która wymaga interwencji opiekuna z podanym powodem.

Priorytet P0 wynika z tego, że H10 jest bramką sekwencyjną: bez zaliczonego testu
`CourseAccess` nie odblokuje kolejnego etapu (H05), więc żaden dalszy etap ścieżki
uczestnika nie jest demonstrowalny bez tego pakietu.

## What Changes

- **Odczyt testu** — `GET /courses/{slug}/test` zwraca pytania **bez flag poprawności**,
  próg zaliczenia i limit podejść (z nadpisaniem per kurs w kolumnach `tests.*`, `null`
  = wartość edycji), oraz liczbę już wykorzystanych podejść. Kurs zablokowany
  sekwencyjnie → 403 `course_locked` (reguła wyłącznie z `CourseAccess::state`).
- **Podejście do testu** — `POST /tests/{id}/attempts` ocenia odpowiedzi **wyłącznie po
  stronie serwera**: numer podejścia liczony w transakcji z `lockForUpdate`, obraz treści
  pytań i flag poprawności zamrażany w `questions_snapshot`, wynik jako
  `round(poprawne / wszystkie × 100)`. Odpowiedź spoza pytania lub spoza testu → 422
  `validation_failed`. Wyczerpany limit → 403 `attempts_exhausted`.
- **Historia podejść** — `GET /tests/{id}/attempts` zwraca własne podejścia uczestnika
  (lista + `meta.extra` z progiem i limitem).
- **Ostatnie niezaliczone podejście** — gdy podejście wyczerpujące limit kończy się
  porażką, wszyscy `project_manager` dostają powiadomienie `attempt.failed_final`
  z linkiem do karty osoby.
- **Bank pytań w panelu** — CRUD (`GET/POST /admin/tests/{id}/questions`,
  `PATCH/DELETE /admin/questions/{id}`) dla ról administracyjnych; dokładnie jedna
  poprawna odpowiedź na pytanie; edycja i usunięcie **nie zmieniają** historii
  wcześniejszych podejść (te trzymają własny snapshot).
- **Reset limitu przez opiekuna** — `POST /admin/tests/{testId}/users/{userId}/reset-attempts
  {reason}` czyści dotychczasowe podejścia użytkownika do danego testu (numeracja
  zaczyna się od 1 ponownie); brak powodu → 422; zdarzenie audytowane
  jako `attempts.reset`.
- **Warsztat stacjonarny** — `POST /admin/workshop/{userId}/complete`, idempotentne
  odznaczenie przez administrację, audyt `workshop.completed`; zasila warunek
  certyfikatu `workshop` czytany przez `ProgressAggregator` (H13).
- **Ekran `#/panel/kursy/:slug/test`** — pytania pojedynczo, bez cofania, ekran wyniku
  z listą błędnych pytań i odznaką zaliczenia, historia podejść, komunikat blokady.
  UI po polsku.

## Capabilities

### New Capabilities

- `knowledge-tests`: test wiedzy na koniec kursu — pytania bez flag poprawności,
  ocenianie serwerowe, numeracja podejść odporna na równoległość, snapshot treści
  pytań, limit podejść i reset przez opiekuna, bank pytań CRUD w panelu.
- `workshop-completion`: odznaczenie warsztatu stacjonarnego przez administrację,
  idempotentne, zasilające warunek certyfikatu `workshop`.

### Modified Capabilities

Brak — H10 nie zmienia wymagań żadnej istniejącej zdolności. Czyta
`CourseAccess::state()` (H05) i `Settings::edition()` ze startera bez zmiany ich
kontraktu; `ProgressAggregator` (H13) czyta wynik H10, nie odwrotnie.

## Impact

**Backend**

- `backend/routes/api/h10.php` — jedyny plik tras dotykany przez pakiet (własność
  H10, §5.1).
- Nowe kontrolery: `TestController` (uczestnik), `AdminTestQuestionController`,
  `AdminTestResetController`, `AdminWorkshopController` (administracja).
- Nowy `App\Support\H10\TestGrader` — jedyne miejsce liczące próg, limit, snapshot
  i wynik; logika pakietu, nie fasada startera.
- Testy `tests/Feature/H10/…`, w tym `--filter=ConcurrentAttempt` na numerację
  podejść pod równoległością.
- **Bez migracji** — tabele `tests`, `test_questions`, `test_answers`,
  `test_attempts` (ze snapshotem), `workshop_completions` istnieją w starterze
  z kompletem kolumn; unikat `(user_id, test_id, attempt_number)` już istnieje
  i jest ostatnią linią obrony przy wyścigu.
- **Bez nowych zależności** composer/npm.

**Frontend**

- Nowa strona `frontend/app/(uczestnik)/panel/kursy/[slug]/test/page.tsx`.
- Panel banku pytań (UI administracji) **świadomie poza zakresem tego PR** — API
  i testy są gotowe, ekran edycji należy do slotu w `#/admin/kursy` (właściciel
  strony: H08a), do dołożenia po H08a.

**Kontrakt i rejestry**

- Wszystkie trasy pakietu są już w kontrakcie (karta H10, §2 „Test (H10)") — nic
  nie wymyślamy.
- `attempt.failed_final` (§3.1) i `attempt.finished` / `attempts.reset` /
  `workshop.completed` (§3.2) są w rejestrach — używane wprost.

**Świadomie poza zakresem**

Ekran administracji do edycji banku pytań (patrz wyżej — zależność od H08a);
cofanie się do wcześniejszego pytania w trakcie podejścia (kryterium „bez
cofania"); bonusowe/dodatkowe podejścia ponad reset całkowity (model danych nie
ma na to kolumny — reset kasuje historię i zaczyna numerację od 1, decyzja
zapisana w `DEMO/H10.md`).
