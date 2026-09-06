## 1. Przygotowanie

- [x] 1.1 Zweryfikować zastany schemat: `tests`, `test_questions`, `test_answers`,
      `test_attempts` (z `questions_snapshot`, unikatem `(user_id, test_id, attempt_number)`),
      `workshop_completions` — kompletne, bez potrzeby migracji
- [x] 1.2 Potwierdzić ograniczenie Postgresa: `FOR UPDATE` nie łączy się z `MAX(...)`
      w jednym zapytaniu — numeracja musi liczyć maksimum w PHP po zablokowaniu wierszy (D1)
- [x] 1.3 Założyć `DEMO/H10.md` z sekcjami: co działa, jak pokazać, tabela testów
      per kryterium, decyzje i braki

## 2. Ocenianie — `TestGrader`

- [x] 2.1 Napisać `App\Support\H10\TestGrader::passThreshold()` /
      `attemptsLimit()` — nadpisanie per kurs (`tests.*`), `null` = wartość edycji
      z `Settings::edition()`
- [x] 2.2 Napisać `TestGrader::snapshot()` — zamrożony obraz pytań i odpowiedzi
      **z flagą `is_correct`** (D2)
- [x] 2.3 Napisać `TestGrader::grade()` — ocena wyłącznie względem snapshotu,
      `score_percent = round(poprawne / wszystkie × 100)`, lista `wrong_question_ids`

## 3. API — uczestnik: test i podejścia

- [x] 3.1 Zarejestrować w `backend/routes/api/h10.php`, za flagą
      `config('features.h10')`: trasy uczestnika pod `auth:sanctum`,
      `access.active`, `role:volunteer,student`; trasy administracji pod
      `auth:sanctum`, `role:project_manager,super_admin`
- [x] 3.2 Napisać `TestController::show()` — pytania **bez `is_correct`** (D3),
      `pass_threshold`, `attempts_used`, `attempts_limit`; kurs zablokowany →
      403 `course_locked` wyłącznie przez `CourseAccess::state()`
- [x] 3.3 Napisać `SubmitAttemptRequest` — walidacja, że każdy klucz `answers`
      jest pytaniem tego testu, a wartość odpowiedzią należącą do tego pytania;
      naruszenie → 422 `validation_failed`
- [x] 3.4 Napisać `TestController::storeAttempt()` — transakcja: `lockForUpdate`
      + numer w PHP (D1) → snapshot (D2) → ocena → zapis → audyt
      `attempt.finished` przy **każdym** ukończonym podejściu; limit wyczerpany
      → 403 `attempts_exhausted` **przed** zapisem
- [x] 3.5 Wysłać `attempt.failed_final` do wszystkich `project_manager`, gdy
      podejście wyczerpujące limit kończy się porażką (D5)
- [x] 3.6 Napisać `TestController::attempts()` — historia własnych podejść,
      paginacja standardowa, `meta.extra` z progiem i limitem
- [x] 3.7 Test kryterium 1: 79% nie zalicza, 80% zalicza
      (`TakeTestTest::test_eighty_percent_passes_and_seventy_nine_fails`)
- [x] 3.8 Test kryterium 1: zaliczenie odblokowuje kolejny etap przez
      `CourseAccess` (`TakeTestTest::test_passing_the_test_unlocks_the_next_stage`)
- [x] 3.9 Test kryterium 2: czwarte podejście → 403 `attempts_exhausted`
      (`AttemptLimitTest::test_fourth_attempt_is_rejected_with_attempts_exhausted`)
- [x] 3.10 Test kryterium 2 (współbieżność): `--filter=ConcurrentAttempt` —
      numery 1..N bez dziur i bez duplikatów; unikat blokuje ręcznie wymuszony
      duplikat (`ConcurrentAttemptTest`)
- [x] 3.11 Test: odpowiedź spoza pytania lub spoza testu → 422 `validation_failed`
- [x] 3.12 Test: każde ukończone podejście tworzy wpis audytu `attempt.finished`
      (`AttemptLimitTest::test_every_finished_attempt_is_audited`)

## 4. Bank pytań — CRUD administracji

- [x] 4.1 Napisać `StoreTestQuestionRequest` / `UpdateTestQuestionRequest` —
      dokładnie jedna odpowiedź `is_correct = true`, min. dwie odpowiedzi
- [x] 4.2 Napisać `AdminTestQuestionController::index/store/update/destroy` —
      edycja podmienia zestaw odpowiedzi po `id` (D6); bez audytu (rejestr
      §3.2 nie przewiduje sluga dla banku pytań — świadomie)
- [x] 4.3 Test kryterium 3/6: edycja pytania po podejściu nie zmienia wyniku
      ani treści historycznego podejścia
      (`QuestionBankTest::test_editing_a_question_does_not_change_a_past_attempt`)
- [x] 4.4 Test kryterium 3/6: usunięcie pytania nie zmienia historycznego
      podejścia (`QuestionBankTest::test_deleting_a_question_does_not_change_a_past_attempt`)

## 5. Reset limitu i warsztat

- [x] 5.1 Napisać `ResetAttemptsRequest` — `reason` wymagany, min. 3 znaki; brak
      → 422
- [x] 5.2 Napisać `AdminTestResetController::store()` — kasuje podejścia
      użytkownika dla testu w transakcji (D4), audyt `attempts.reset` z powodem
      i liczbą usuniętych podejść
- [x] 5.3 Test kryterium 4: reset umożliwia nowe podejście, numeracja od 1
      (`ResetAttemptsTest::test_reset_clears_attempts_and_allows_a_new_one`)
- [x] 5.4 Napisać `AdminWorkshopController::store()` — `firstOrCreate` po
      `(user_id, edition_id)`, idempotentne; audyt `workshop.completed` tylko
      przy pierwszym odznaczeniu
- [x] 5.5 Test kryterium 5: odznaczenie warsztatu ustawia warunek certyfikatu
      `workshop.met = true` przez `ProgressAggregator`
      (`WorkshopTest::test_marking_the_workshop_sets_the_certificate_condition`)

## 6. Frontend — ekran `#/panel/kursy/:slug/test`

- [x] 6.1 Przeczytać właściwy przewodnik w `frontend/node_modules/next/dist/docs/`
      przed pisaniem kodu Next.js 16 (@frontend/AGENTS.md)
- [x] 6.2 Zbudować `app/(uczestnik)/panel/kursy/[slug]/test/page.tsx`: intro
      z progiem i liczbą podejść → pytania pojedynczo, **bez cofania** →
      ekran wyniku (procent, próg, odznaka zaliczenia, błędne pytania) →
      historia podejść
- [x] 6.3 Obsłużyć ekran blokady `course_locked` i komunikat po wyczerpaniu
      podejść (`attempts_exhausted`), teksty po polsku

## 7. Odbiór

- [x] 7.1 `docker compose exec app php artisan test --filter=H10` — 28 testów,
      132 asercje, zielone
- [x] 7.2 `./vendor/bin/pint` (backend) i `npm run lint` + `npm run build`
      (frontend) bez zastrzeżeń
- [x] 7.3 Uzupełnić `DEMO/H10.md` o tabelę kryterium→test, ścieżkę demo na
      seedzie (marta: test 1 zdany, test 2 — 1/3 podejść) i listę świadomych
      braków (panel banku pytań w UI, zależność od H08a)
- [x] 7.4 Otworzyć PR z gałęzi `pakiet/H10-testy-warsztat` (≤ ~400 linii —
      pakiet przekracza ten rozmiar ze względu na klasę L; do odnotowania przy
      przeglądzie); przegląd partnerski → przegląd łącznika → merge przez
      sztab — **wymaga potwierdzenia użytkownika** (push + PR to akcje z
      wymaganą jawną zgodą)
