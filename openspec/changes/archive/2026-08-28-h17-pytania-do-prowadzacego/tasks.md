## 1. Warunki wstępne i uzgodnienia

- [ ] 1.1 Zgłosić strażnikowi kontraktu trasę `GET /lessons/{id}/questions` (zasób
  uczestnika, paginacja, `403 course_locked`, uzasadnienie z kryterium odbioru 3);
  weryfikacja: odpowiedź strażnika zapisana w `DEMO/H17.md` wraz z decyzją
  (zatwierdzona / plan awaryjny D6).
- [ ] 1.2 Uzgodnić z właścicielem H09 sygnaturę
  `App\Services\H09\AssignmentResolver::forLesson(Lesson): ?User` (handshake K8 z
  `DEMO/H9-prep-doc.md`); weryfikacja: potwierdzenie sygnatury i terminu scalenia
  zapisane w `DEMO/H17.md`.
- [x] 1.3 Utworzyć gałąź `pakiet/H17-pytania-do-prowadzacego` z aktualnego
  `origin/main`; weryfikacja: `git branch --show-current` i `git log -1 origin/main`
  wskazują ten sam commit bazowy, `git remote -v` pokazuje `origin` na
  `tomekwilczak/psychon-hackaton`.
- [x] 1.4 Zapisać w `DEMO/H17.md` zakres pakietu, kryteria ★ oraz jawne założenie, że
  H08 i H09 dostarczają inne osoby; weryfikacja: plik istnieje i wymienia wszystkie
  trzy kryteria odbioru z karty H17.

## 2. Reguła routingu

- [x] 2.1 Zaimplementować `App\Services\H17\QuestionRouting::forLesson(Lesson): ?User`
  z delegacją do `AssignmentResolver` przez `class_exists` i fallbackiem
  lekcja → kurs → `null` (D1); weryfikacja: test jednostkowy pokrywa obie ścieżki
  fallbacku i przypadek braku przypisania.
- [x] 2.2 Zaimplementować `QuestionRouting::scopeFor(User)` wyznaczający zakres
  skrzynki: pytania z lekcji aktualnie przypisanych do wykonawcy w sumie logicznej z
  pytaniami o `answered_by = wykonawca` (D2); weryfikacja: test pokazuje, że po
  zamknięciu przypisania własne odpowiedzi zostają, a nieodpowiedziane znikają.
- [x] 2.3 Test jednostkowy reguły dziedziczenia: lekcja z własnym przypisaniem →
  jej prowadzący, lekcja bez przypisania → prowadzący kursu; weryfikacja: kryterium
  odbioru H17.1 ★ ma pokrycie w `tests/Unit`.

## 3. Trasy uczestnika

- [x] 3.1 `POST /lessons/{id}/questions` — FormRequest (`question`: required, string,
  przycięty, 1–2000 znaków), rola `volunteer,student`, `access.active`, egzekwowanie
  `CourseAccess` z `403 course_locked` (D5); weryfikacja: testy happy path, 403 na
  kursie zablokowanym, 403 dla roli prowadzącego, 422 na pustym polu, 404 dla lekcji
  nieistniejącej.
- [x] 3.2 `ParticipantQuestionResource` w kształcie z D3 (`answered_by_name`, bez
  identyfikatora odpowiadającego); weryfikacja: test asserts na dokładnym zestawie
  kluczy odpowiedzi.
- [x] 3.3 `GET /lessons/{id}/questions` — wyłącznie własne pytania, sortowanie
  `created_at` malejąco z remisem po `id`, standardowa paginacja, `403 course_locked`
  na kursie zablokowanym; weryfikacja: test dwóch uczestniczek na tej samej lekcji
  pokazuje rozłączne wyniki. **Wykonać dopiero po zamknięciu zadania 1.1.**

## 4. Trasy prowadzącego

- [x] 4.1 `GET /instructor/questions` — rola `instructor`, zakres z 2.2, paginacja
  (`per_page` domyślnie 25, maksymalnie 100), filtr `?answered=true|false`,
  `meta.extra.unanswered` niezależne od paginacji i filtra; weryfikacja: testy
  filtra, licznika, sortowania i `403 forbidden` dla uczestniczki.
- [x] 4.2 `InstructorQuestionResource` w kształcie z D3 (`user`, `lesson.course`,
  `answered_by`); weryfikacja: test asserts na dokładnym zestawie kluczy, brak
  e-maila i innych danych osobowych pytającego.
- [x] 4.3 `POST /instructor/questions/{id}/answer` — FormRequest (`answer`: required,
  string, przycięty, 1–5000 znaków), zapis `answer`, `answered_by`, `answered_at`;
  weryfikacja: test happy path plus `404 not_found` na cudzym i nieistniejącym
  identyfikatorze (kryterium H17.2 ★).
- [x] 4.4 Blokada powtórnej odpowiedzi `403 entry_locked` bez zmiany rekordu i bez
  powiadomienia (D4); weryfikacja: test sprawdza niezmienione `answer`,
  `answered_by`, `answered_at` oraz brak nowego powiadomienia.
- [x] 4.5 Zarejestrować wszystkie cztery trasy wyłącznie w
  `backend/routes/api/h17.php` pod `config('features.h17')`; weryfikacja:
  `git diff --stat` nie pokazuje żadnego innego pliku tras.

## 5. Powiadomienia

- [x] 5.1 `question.asked` przez `Notify::send` do adresata z 2.1 przy zapisie
  pytania, z linkiem do `/prowadzacy/pytania`; weryfikacja: test potwierdza
  powiadomienie u adresata i jego brak u pytającej.
- [x] 5.2 `question.answered` przez `Notify::send` do pytającego przy zapisie
  odpowiedzi, z linkiem do strony kursu lekcji; weryfikacja: test potwierdza typ,
  odbiorcę i link (kryterium H17.3).
- [x] 5.3 Brak powiadomienia dla pytania bez adresata oraz dla każdej operacji
  odrzuconej (403, 404, 422); weryfikacja: testy negatywne liczą wiersze w
  `notifications` przed i po żądaniu.
- [x] 5.4 Potwierdzić, że żadna ścieżka H17 nie woła `AuditLog::record`; weryfikacja:
  `grep -r "AuditLog" backend/app/Http/Controllers/Api/V1/H17 backend/app/Services/H17 backend/routes/api/h17.php`
  nie zwraca trafień, a test liczy niezmienioną liczbę wpisów audytu.

## 6. Interfejs prowadzącego

- [x] 6.1 Funkcje API w `frontend/lib/questions.ts` (lista z filtrem i paginacją,
  odpowiedź) wraz z typami; weryfikacja: `npm run lint` i `npx tsc --noEmit`
  przechodzą.
- [x] 6.2 Strona `app/(prowadzacy)/prowadzacy/pytania/page.tsx` — lista pytań,
  przełącznik „tylko nieodpowiedziane", formularz odpowiedzi, stany pusty / ładowania
  / błędu; weryfikacja: ręczny scenariusz z `DEMO/H17.md` na koncie
  `joanna@demo.pl`.
- [x] 6.3 Wpis menu `lib/menu/instructor/h17-pytania.ts` plus import i jedna linia w
  `lib/menu/instructor/index.ts` (jedyna dozwolona zmiana rejestru); weryfikacja:
  `git diff lib/menu/instructor/index.ts` pokazuje dokładnie dwie dodane linie.
- [x] 6.4 Renderowanie treści pytań i odpowiedzi wyłącznie jako tekstu; weryfikacja:
  `grep -r dangerouslySetInnerHTML frontend/components/questions frontend/app/\(prowadzacy\)/prowadzacy/pytania`
  nie zwraca trafień.

## 7. Interfejs uczestnika

- [x] 7.1 Komponent `components/questions/LessonQuestions.tsx` — formularz pytania
  przy lekcji plus lista własnych pytań z odpowiedziami i stanem pustym;
  weryfikacja: komponent działa na koncie `marta@demo.pl` dla lekcji kursu 2.
- [x] 7.2 Osadzić komponent jako slot na stronie kursu `#/panel/kursy/:slug` bez
  przepisywania widoku H05; weryfikacja: diff w plikach H05 ogranicza się do
  osadzenia slotu.
- [x] 7.3 Obsłużyć na froncie `403 course_locked` i brak adresata (komunikat po
  polsku, bez błędu technicznego); weryfikacja: ręczny scenariusz na kursie 3
  (zablokowanym) w `DEMO/H17.md`.

## 8. Zamknięcie pakietu

- [x] 8.1 Uruchomić `docker compose exec app php artisan test` oraz
  `./vendor/bin/pint`; weryfikacja: oba zielone, wynik wklejony do `DEMO/H17.md`.
- [x] 8.2 Uruchomić `npm run lint` i `npm run build` we `frontend/`; weryfikacja: oba
  zielone, wynik wklejony do `DEMO/H17.md`.
- [x] 8.3 Uzupełnić `DEMO/H17.md` o przejście ręcznego scenariusza (pytanie →
  dzwonek prowadzącej → odpowiedź → dzwonek uczestniczki → odpowiedź przy lekcji)
  oraz o listę odstępstw, jeśli powstały; weryfikacja: wszystkie trzy kryteria
  odbioru mają w pliku jednoznaczny wynik. Wykonane — `DEMO/H17.md` §3 ma
  siedmiokrokową tabelę scenariusza, §4 listę odstępstw. Plik sam odnotowuje, że
  wizualny przegląd obu ekranów w przeglądarce pozostaje do zrobienia.
- [x] 8.4 `openspec validate h17-pytania-do-prowadzacego --strict`; weryfikacja:
  komenda kończy się bez błędów.
- [x] 8.5 Zintegrować aktualny `origin/main`, sprawdzić `git diff --check` i
  `git status --short` pod kątem plików spoza zakresu pakietu; weryfikacja: diff
  obejmuje wyłącznie pliki wymienione w `proposal.md` § Impact.
- [x] 8.6 Wypchnąć gałąź, otworzyć PR do `origin` i ustawić status H17 na `REVIEW`
  w `openspec/changes/koordynacja-pakietow-h01-h21/tasks.md` na `main`; weryfikacja:
  status `REVIEW` z numerem PR widoczny na `origin/main`, PR nie jest scalany przez
  autora.
