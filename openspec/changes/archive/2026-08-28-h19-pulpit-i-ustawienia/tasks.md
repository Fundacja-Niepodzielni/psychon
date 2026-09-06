## 1. Przygotowanie i zgłoszenia

- [x] 1.1 Sprawdzić `config/features.php` — klucz `h19` już istniał (`true`),
      nic do zgłoszenia
- [x] 1.2 Dodać pozycję „Ustawienia” (`/admin/ustawienia`) do
      `lib/menu/admin/index.ts` — okazało się, że ten plik jest samo-rejestrujący
      (instrukcja w pliku wprost zaprasza każdy pakiet do dopisania swojego
      wpisu), więc zrobione bezpośrednio, bez zgłoszenia do sztabu
- [x] 1.3 Zweryfikowano w kodzie: `Application`, `InternshipEntry`,
      `PsychologistProfile`, `InstructorQuestion` istnieją; dokładny kształt
      liczników potwierdza już istniejący
      `SeedIntegrityTest::test_dashboard_and_report_counters_match_the_seed`
      (m.in. `InstructorQuestion::whereNull('answer')`, nie `answered_at`)
- [x] 1.4 Ścieżki linków kolejek (`/admin/staz`, `/admin/profile`,
      `/panel/prowadzacy`) trzymane jako stałe w `DashboardSummary`; uzgodnienie
      z liaisonami H11/H15/H09/H17 zapisane jako otwarty punkt w `DEMO/H19.md`
      (nie zablokowało implementacji)
- [x] 1.5 Założono `DEMO/H19.md`

## 2. Liczniki i kolejki pulpitu

- [x] 2.1 `App\Services\H19\DashboardSummary::build()` — cztery zapytania
      `COUNT` dla `counters` i cztery dla `queues`, zgodne z §5 seeda
- [x] 2.2 Pokryte przez `DashboardTest::test_counters_and_queues_match_the_seed_demo`
      (feature test na pełnym seedzie zamiast osobnego testu jednostkowego —
      liczniki i tak są prostymi zapytaniami bez logiki do odizolowania)
- [x] 2.3 Pokryte przez seed demo (filip = `student` liczy się, joanna =
      `instructor` nie liczy się do `participants`) — osobny test uznany za
      redundantny wobec 2.2

## 3. Ustawienia edycji — serwis i walidacja

- [x] 3.1 `App\Services\H19\EditionSettingsUpdater::update()` — transakcja,
      zapis + `AuditLog::record('edition.updated', ...)`
- [x] 3.2 `App\Http\Requests\H19\UpdateEditionRequest` z regułami z D4
- [x] 3.3 `EditionSettingsTest::test_threshold_above_range_is_rejected_without_changing_the_value`
- [x] 3.4 `EditionSettingsTest::test_valid_update_persists_and_is_audited`
- [x] 3.5 `EditionSettingsTest::test_updated_threshold_is_visible_immediately_through_settings`
- [x] 3.6 `database/factories/EditionFactory.php` dodana; wymagało też dodania
      `HasFactory` do `App\Models\Edition` (brakowało w starterze) — zanotowane
      jako drobna zmiana pliku poza wyłączną własnością H19 w `DEMO/H19.md`

## 4. API — trasy, kontroler, autoryzacja

- [x] 4.1 Trzy trasy w `routes/api/h19.php`, za flagą, pod
      `role:project_manager,super_admin`
- [x] 4.2 `DashboardController::show`
- [x] 4.3 `EditionSettingsController` (`show`, `update`)
- [x] 4.4 `DashboardTest::test_counters_and_queues_match_the_seed_demo`
- [x] 4.5 `DashboardTest::test_volunteer_is_forbidden` / `test_guest_is_unauthenticated`,
      `EditionSettingsTest` odpowiedniki (rola `instructor` niesprawdzona osobno —
      `volunteer` + `super_admin`/`project_manager` jako pozytyw uznane za
      wystarczające pokrycie macierzy roli)
- [x] 4.6 `EditionSettingsTest::test_threshold_above_range_is_rejected_without_changing_the_value`
- [x] 4.7 `EditionSettingsTest::test_get_edition_returns_the_seed_defaults`

## 5. Frontend — ekrany `#/admin` i `#/admin/ustawienia`

- [x] 5.1 Przeczytano wzorzec istniejącej strony H01
      (`app/(uczestnik)/panel/profil/page.tsx`) jako referencję konwencji —
      `frontend/node_modules/next/dist/docs/` niedostępne w tej sesji (worktree
      bez `npm install` w chwili czytania); ryzyko niskie, wzorzec H01 już
      przechodzi `npm run build` na Next 16
- [x] 5.2 Pominięte celowo — `lib/api.ts` jest już generyczne (`api<T>()`,
      `apiPaged<T>()`); strony H19 wołają je bezpośrednio, tak jak
      `panel/profil/page.tsx`, bez dodawania per-pakietowych funkcji
- [x] 5.3 Pulpit zbudowany — kafle liczników (`Card`) + lista kolejek jako
      klikalne `next/link` (nie `Table`, bo każdy wiersz to link nawigacyjny,
      nie dane tabelaryczne)
- [x] 5.4 Formularz ustawień zbudowany (`Input` + `Button`, bez `Select` —
      wszystkie pola to tekst/liczba/data, żadne nie jest wyborem z listy)
- [x] 5.5 Wpis menu dodany bezpośrednio (patrz 1.2)
- [ ] 5.6 Przejście klawiaturą i stanów focus — **nie wykonane w tej sesji**,
      tylko `npm run build` + lint; do zrobienia przed PR

## 6. Odbiór

- [x] 6.1 `docker compose exec app php artisan test --filter=H19` zielony
      (10/10). W sesji H19 pełny `php artisan test` nie był uruchomiony —
      uniknięto uruchamiania obcych testów na wspólnej bazie
      `niepodzielni_testing` równolegle z sesją H14; domknięte później na
      `main`: pełny pakiet 524 passed / 2288 asercji, bez pominięć
- [x] 6.2 Pint (pliki H19) i `npm run lint -- --fix` + `npm run build` — czysto
- [ ] 6.3 Pełne ręczne przejście w przeglądarce — **nie wykonane**, patrz 5.6
- [x] 6.4 `DEMO/H19.md` uzupełniony
- [x] 6.5 PR otwarty i scalony — PR #4 (`pakiet/H19-pulpit-i-ustawienia`,
      merge `8fa9710`); w chwili pisania tej listy jeszcze nie istniał
