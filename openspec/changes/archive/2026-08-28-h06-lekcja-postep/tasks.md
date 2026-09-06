## 1. Bramka kontraktu

- [x] 1.1 Zatwierdzić i dopisać do `docs/hackathon/02-kontrakt-api.md` pełne odpowiedzi `GET /lessons/{id}` i `POST /lessons/{id}/complete`, dwupolowy heartbeat bez `position_seconds`, `open_count` i obsługę zerowego czasu; zweryfikowano obecność wszystkich decyzji w sekcji H06 kontraktu.

## 2. Warstwa HTTP i autoryzacja

- [x] 2.1 Dodać H06-owy FormRequest dla payloadu heartbeat zgodnie z zatwierdzonym kontraktem; zweryfikowano żądania brakujące, ujemne i niecałkowite, które zwracają 422 `validation_failed` z błędami pól.
- [x] 2.2 Dodać wspólną H06-ową kontrolę dostępu do lekcji opartą wyłącznie na `CourseAccess::state`; zweryfikowano 200 dla dostępnej lekcji, 403 `course_locked`, istniejące middleware 401 `unauthenticated`/403 `access_expired` oraz 404 dla nieistniejącej lekcji.
- [x] 2.3 Zarejestrować trzy kontraktowe trasy w grupie `auth:sanctum` i `access.active`, wyłącznie w `backend/routes/api/h06.php` i za istniejącą flagą H06; zweryfikowano `php artisan route:list --path=api/v1/lessons` oraz brak zmian w innych plikach tras.
- [x] 2.4 Zaimplementować odczyt lekcji zwiększający `open_count` i zwracający dokładnie `id`, `title`, `description`, `duration_seconds`, `watched_seconds`, `active_seconds`, `is_completed`, `completable` i `completable_at_percent`; zweryfikowano pełną kopertę i trwały odczyt przez smoke test API.

## 3. Trwały i atomowy postęp

- [x] 3.1 Zaimplementować transakcyjne utworzenie/pobranie postępu z blokadą wiersza oraz monotoniczne aktualizacje oglądania, aktywności i znaczników ukończenia; zweryfikowano, że opóźniony heartbeat nie zmniejsza żadnej wartości.
- [x] 3.2 Ograniczyć zaliczony aktywny przyrost zegarem serwera do 35 sekund i dostępnego okna od `last_activity_at`, bez stosowania tego limitu do `watched_delta`; zweryfikowano przycięcie aktywności i łączny przyrost dwóch heartbeatów w tej samej sekundzie najwyżej o 35.
- [x] 3.3 Podłączyć `POST /lessons/{id}/progress` do logiki postępu i kontraktowego zasobu; zweryfikowano dokładne pola odpowiedzi 200 smoke testem API.

## 4. Ukończenie lekcji

- [x] 4.1 Wyliczać wymagany aktywny czas z bieżącego `Settings::edition('lesson_completion_percent')`, bez stałej w kodzie; zweryfikowano próg 60% z aktywnej edycji.
- [x] 4.2 Zaimplementować atomowe `POST /lessons/{id}/complete`, zachowujące pierwsze `completed_at`; zweryfikowano 200 dla spełnionego progu, powtarzalne ukończenie oraz 422 `not_enough_active_time` poniżej progu.
- [x] 4.3 Zwracać z ukończenia wyłącznie `data.is_completed` i `data.completed_at`; zweryfikowano format ISO 8601 UTC i kopertę błędu.

## 5. Komponent lekcji i integracja H05

- [x] 5.1 Dodać typy odpowiedzi H06 zgodne z kontraktem oraz Client Component `LessonPlayer` z serializowalnym propem `lessonId`; zweryfikowano kompilację granicy Server/Client przez build Next.js.
- [x] 5.2 Zaimplementować pobranie lekcji i warunkowe zamontowanie istniejącego `VideoPlayer` bez pozycji początkowej z serwera; zweryfikowano stany ładowania, błędu i start od początku w kodzie komponentu.
- [x] 5.3 Podłączyć heartbeaty do sekwencyjnej kolejki zapisów z zachowaniem niezapisanego payloadu po błędzie; zweryfikowano ścieżki „zapisywanie”, sukces, błąd i ponowienie w komponencie.
- [x] 5.4 Podłączyć stan `completable` i akcję ukończenia z użyciem `Card`, `Alert`, `Button` i `ProgressBar`; zweryfikowano polskie stany interfejsu w komponencie.
- [x] 5.5 Wykorzystać Page Visibility API istniejącego `VideoPlayer` i przekazywać aktywność wyłącznie z widocznej karty; zweryfikowano integrację oraz brak aktywnego przyrostu z tła.
- [x] 5.6 Przeprowadzić przegląd klawiaturą i technologii asystujących dla odtwarzacza, komunikatów i ukończenia; zweryfikowano widoczny fokus, tekstowe statusy i `aria-live`/`role="alert"` komponentów.
- [x] 5.7 Przygotować dla właściciela H05 krótki przykład importu i użycia `LessonPlayer`, bez edycji strony kursu; handoff wymaga tylko przekazania `lessonId`.

## 6. Testy, jakość i demo

- [x] 6.1 Uruchomić smoke testy API H06 oraz pełny zestaw PHPUnit i zweryfikować happy path, odmowy dostępu, walidację, monotoniczność, dwa heartbeaty, próg i ukończenie.
- [x] 6.2 Uruchomić pełne `docker compose exec app php artisan test` i Pint; zweryfikowano brak regresji i poprawne formatowanie.
- [x] 6.3 Uruchomić w `frontend` `npm run lint` oraz `npm run build`; zweryfikowano brak błędów ESLint, TypeScript i kompilacji Next.js 16.
- [x] 6.4 Utworzyć `DEMO/H06.md` z kontami demo, krokami ukrytej karty, dwóch heartbeatów, zmiany progu, odmowy ukończenia i sukcesu; scenariusz jest gotowy do przejścia na stagingu.
- [x] 6.5 Przejrzeć końcowy diff i zweryfikować brak migracji, nowych zależności, zmian fasad startera, layoutów, menu, `UserResource`, strony H05, cudzych tras oraz prawdziwych danych osobowych.
