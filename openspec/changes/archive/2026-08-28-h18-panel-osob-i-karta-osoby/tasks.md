## 1. Koordynacja i przygotowanie

- [x] 1.1 Ustawić na `origin/main` w `openspec/changes/koordynacja-pakietow-h01-h21/tasks.md` właściciela H18 (`Tomek`) i status `W TOKU` przez osobną gałąź docs + PR; weryfikacja: wpis 3.8 na `origin/main` pokazuje właściciela i `W TOKU`. Wykonane gałęzią `docs/board-h18-review` (PR #28, commit `c9ae45e`) — z odstępstwem: claim poszedł od razu na `REVIEW`, nie na `W TOKU`, bo implementacja była już gotowa.
- [x] 1.2 Utworzyć gałąź `pakiet/H18-panel-osob-i-karta-osoby` z aktualnego `origin/main`; weryfikacja: `git branch --show-current` zwraca tę nazwę, `git log` zawiera claim z 1.1.
- [ ] 1.3 Zgłosić strażnikowi kontraktu brak typu powiadomienia dla zaproszenia z `POST /admin/users` (Open Question z `design.md`); weryfikacja: wątek zgłoszony, odpowiedź lub jej brak odnotowana w `DEMO/H18.md`.
- [x] 1.4 Spisać zakres i kryteria ★ H18 w `DEMO/H18.md` na podstawie `docs/hackathon/01-pakiety-zadan.md`, `02-kontrakt-api.md` (§2 H18), `04-seed-demo.md` i makiety `#/admin/uczestniczki`; weryfikacja: plik istnieje z listą czterech kryteriów i scenariuszem ręcznym.

## 2. Backend — lista osób

- [x] 2.1 Zarejestrować trasy w `backend/routes/api/h18.php` za `['auth:sanctum', 'role:project_manager,super_admin']` z flagą `config('features.h18')`: `GET /admin/users`, `GET /admin/users/export.csv`, `GET /admin/users/{id}`, `POST /admin/users`, `PATCH /admin/users/{id}`, `POST /admin/users/{id}/block`; weryfikacja: `php artisan route:list --path=admin/users` pokazuje sześć tras.
- [x] 2.2 Utworzyć `AdminUserQuery` (filtry `role`, `status`, `search` po `first_name`/`last_name`/`email` bez case, `sort` z domyślnym `-created_at`, paginacja `page`/`per_page` max 100); weryfikacja: test jednostkowy zapytania sprawdza każdy filtr i domyślne sortowanie.
- [x] 2.3 Utworzyć `AdminUserListResource` z polami `id, first_name, last_name, email, role, status, product_group, access_expires_at, program_completed_at, created_at` (daty ISO 8601 UTC); weryfikacja: test feature `GET /admin/users` asertuje komplet pól i kopertę `{data, meta}` z `current_page/per_page/total/last_page`.
- [x] 2.4 Implementować `AdminUserController@index` (użycie `AdminUserQuery`); weryfikacja: test feature `GET /admin/users?role=volunteer&search=demo` zwraca 200 i wyłącznie pasujące konta na seedzie demo; `volunteer` → 403, brak tokenu → 401.

## 3. Backend — karta osoby

- [x] 3.1 Utworzyć `AdminUserCardResource` składający `{profile, progress, documents, recent_notifications, audit_entries}`: `profile` = `ProfileResource::make($user)`, `progress` = pięć kluczy z `ProgressAggregator::for` w kolejności `courses_done, courses_total, hours_accepted, supervision_present, workshop_done`; weryfikacja: test feature asertuje obecność pięciu bloków i pełny `profile.pesel`.
- [x] 3.2 Dodać do karty `documents` jako `{id, type, number}` z tabeli `documents` osoby, `recent_notifications` (najnowsze N powiadomień osoby), `audit_entries` (wpisy `subject_type=User`, `subject_id={id}`, sort `created_at` desc, limit 20); weryfikacja: test feature na seedzie demo pokazuje `volunteer_agreement` marty w `documents` i jej nieprzeczytane `internship.returned` w `recent_notifications`.
- [x] 3.3 Implementować `AdminUserController@show` z 404 `not_found` dla nieznanego `id`; weryfikacja: test feature — karta `marta@demo.pl` daje `progress` = `courses_done` 1, `courses_total` 10, `hours_accepted` `"41.5"`, `supervision_present` 5, `workshop_done` `false`; nieznane `id` → 404.
- [x] 3.4 Dodać test spójności: `progress` z karty == wynik `ProgressAggregator::for` dla tej samej osoby (to samo źródło co pulpit/raport); weryfikacja: test asertuje równość struktur.

## 4. Backend — tworzenie i edycja konta

- [x] 4.1 Utworzyć `StoreUserRequest` (`first_name`, `last_name`, `email` unikalny w `users`, `role` ze słownika, opcjonalne pola profilu) i `UpdateUserRequest` (te same pola opcjonalne, `email` unikalny z pominięciem bieżącego konta); weryfikacja: testy walidacji dla braku `email` (422 `validation_failed`) i duplikatu.
- [x] 4.2 Implementować `AdminUserController@store`: konto `status=active` bez hasła, `activation_token` = `Str::random(64)`, rekord `EmailMessage` `status=simulated` z linkiem `auth/activate`, `AuditLog::record($actor, 'user.created', $user)`; duplikat e-maila istniejącego konta → 409 `email_already_registered`; weryfikacja: test feature sprawdza 201, token, rekord `emails`, wpis audytu i ścieżkę 409.
- [x] 4.3 Implementować `AdminUserController@update`: zapis zmienionych pól (w tym `email`), `AuditLog::record($actor, 'user.updated', $user, ['changed' => [...]])`; konflikt `email` → 422/409 bez zapisu; nieznane `id` → 404; weryfikacja: test feature — zmiana `email` daje 200 i wpis `user.updated` wymieniający `email`.
- [x] 4.4 Dodać regułę matrycy ról w `store`/`update`: `project_manager` z `role=super_admin` w żądaniu lub celem `super_admin` → `ApiException(403, 'forbidden')` przed zapisem i audytem; `super_admin` przechodzi; weryfikacja: test feature — `project_manager` dostaje 403 i audyt nie rośnie, `super_admin` dostaje 200 z `user.updated`.

## 5. Backend — blokada i eksport CSV

- [x] 5.1 Utworzyć `BlockUserRequest` (`reason` wymagany, niepusty string) i `AdminUserController@block`: `status=blocked`, `AuditLog::record($actor, 'user.blocked', $user, ['reason' => ...])`, `project_manager` blokujący `super_admin` → 403; weryfikacja: test feature — 200 + wpis `user.blocked`, brak `reason` → 422, cel `super_admin` przez `project_manager` → 403.
- [x] 5.2 Dodać test feature rozróżnienia komunikatu logowania: konto `blocked` vs konto z `access_expires_at` w przeszłości dają różne komunikaty (blokada ≠ `access_expired`); weryfikacja: test asertuje odrębne treści i kody.
- [x] 5.3 Implementować `AdminUserController@export` przez `Csv::download('admin-users.csv', $rows)` z wierszem nagłówka i tymi samymi kolumnami co lista, honorując filtry `AdminUserQuery`; weryfikacja: test feature — `Content-Type: text/csv; charset=utf-8`, odpowiedź zaczyna się od BOM, separator `;`, filtr `role=volunteer` ogranicza wiersze; `volunteer` → 403.

## 6. Frontend — panel osób

- [x] 6.1 Dodać do `frontend/lib/api.ts` funkcje `adminUsers(params)`, `adminUser(id)`, `createAdminUser(body)`, `updateAdminUser(id, body)`, `blockAdminUser(id, reason)` oraz pobranie CSV; weryfikacja: `npm run lint` przechodzi, typy zgodne z kopertami kontraktu.
- [x] 6.2 Utworzyć `app/(administracja)/admin/uczestniczki/page.tsx`: lista z filtrem roli, wyszukiwarką, paginacją i przyciskiem „Eksport CSV”, stany pusty i błędu; weryfikacja: ręcznie na seedzie demo filtr `Wolontariusz` + fraza zawężają listę, CSV pobiera się i otwiera w Excelu (BOM, `;`).
- [x] 6.3 Utworzyć `app/(administracja)/admin/uczestniczki/[id]/page.tsx`: pięć sekcji karty (profil, postępy, dokumenty, ostatnie powiadomienia, audyt), formularz edycji konta i akcja blokady z polem powodu; weryfikacja: ręcznie karta `marta@demo.pl` pokazuje liczby z `04-seed-demo.md`, próba nadania `super_admin` jako `project_manager` pokazuje komunikat 403.
- [x] 6.4 Dodać `frontend/lib/menu/admin/h18-uczestniczki.ts` (label „Uczestniczki”, href `/admin/uczestniczki`, `order` po wpisach H19/H16) i dopiąć jedną linią w `frontend/lib/menu/admin/index.ts`; weryfikacja: pozycja widoczna w menu panelu administracji.

## 7. Domknięcie pakietu

- [x] 7.1 Uruchomić `docker compose exec app php artisan test` (z naciskiem na testy H18) i `./vendor/bin/pint`; weryfikacja: zestaw testów zielony, Pint bez zmian.
- [x] 7.2 Uruchomić `cd frontend && npm run lint -- --fix && npm run build`; weryfikacja: obie komendy kończą się sukcesem.
- [ ] 7.3 Przejść ręczny scenariusz z `DEMO/H18.md` (filtr+szukajka+CSV, matryca 403 + audyt `user.updated`, karta marty = liczby z seeda, blokada vs wygaśnięcie) i zapisać wyniki w `DEMO/H18.md`; weryfikacja: cztery kryteria odhaczone w pliku.
- [x] 7.4 `openspec validate h18-panel-osob-i-karta-osoby --strict`; weryfikacja: walidacja bez błędów.
- [x] 7.5 Zaktualizować status H18 na `REVIEW` w `openspec/changes/koordynacja-pakietow-h01-h21/tasks.md` na `origin/main`, otworzyć PR z gałęzi `pakiet/H18-panel-osob-i-karta-osoby`; weryfikacja: PR otwarty, CI (Pint, PHPUnit, ESLint, build) zielone, wpis 3.8 pokazuje `REVIEW`. PR #27 otwarty i scalony (`6dcf41e`); wpis 3.8 pokazuje dziś `DONE`.
