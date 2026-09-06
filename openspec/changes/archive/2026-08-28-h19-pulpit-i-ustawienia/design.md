## Context

Stan zastany, zweryfikowany w kodzie:

- `Edition` (`app/Models/Edition.php`) ma wszystkie klucze §3.3 jako zwykłe
  kolumny (`reliability_threshold`, `test_pass_threshold`, `test_attempts_limit`,
  `internship_hours_required`, `supervision_required_count`,
  `lesson_completion_percent`) — nie ma osobnej tabeli/JSON-a ustawień. Model ma
  `$fillable` obejmujący te kolumny plus `name`, `starts_at`, `ends_at`,
  `seats_limit`, `status`.
- `Settings::edition(string $key)` (sygnatura zamrożona) czyta
  `Settings::activeEdition()` (edycja o `status = 'active'`, najnowsza po `id`) i
  zwraca atrybut modelu — **tylko odczyt, bez metody zapisu**. Zapis ustawień
  musi więc iść bezpośrednio przez model `Edition`, nie przez `Settings`.
  Nieznany klucz rzuca `RuntimeException` (nieprzechwycone → 500) — walidację
  zakresów robimy sami w `FormRequest`, zanim cokolwiek trafi do modelu.
- `ProgressAggregator::for(User $user)` liczy postęp **jednej** osoby — nie
  istnieje żaden gotowy agregat wieloosobowy (liczniki, kolejki). Liczniki
  pulpitu trzeba policzyć własnymi zapytaniami `COUNT` na tabelach źródłowych.
- `AuditLog::record(User|int|null $actor, string $action, ?Model $subject,
  array $details)` — sygnatura zamrożona.
- `EnsureRole` (alias `role:`) jest gotowe i kompletne, ale **żaden istniejący
  plik tras go jeszcze nie używa** — H19 jest pierwszym konsumentem. Role w
  systemie: `super_admin · project_manager · instructor · volunteer · student`;
  seed demo osadza `opiekun@demo.pl` jako `project_manager` (codzienna obsługa
  kolejek) i `admin@demo.pl` jako `super_admin`.
- Wzorzec pakietu H01 (jedyny już scalony): `routes/api/h01.php` zaczyna się od
  `if (! config('features.h01')) { return; }`, kontroler bez konstruktora,
  `FormRequest` w `App\Http\Requests\H01\...`, `Resource` zwracający płaską
  tablicę (Laravel domyślnie owija w `"data"`). H19 powtarza ten sam szkielet
  pod `App\Http\Requests\H19\...` i `App\Http\Controllers\Api\V1\Admin\...`.
- Frontend: `app/(administracja)/admin/layout.tsx` już renderuje `PanelShell` z
  `adminMenu`; `app/(administracja)/admin/page.tsx` to placeholder do
  zastąpienia. `lib/menu/admin/h19-pulpit.ts` już istnieje z wpisem „Pulpit”
  (`/admin`) — brakuje wpisu „Ustawienia” i strony `/admin/ustawienia`.
  `components/ui` nie ma gotowego kafla licznika — składamy go z `Card` +
  `Badge`; listę kolejek i formularz ustawień z `Table` / `Input` / `Select` /
  `Button`.
- Brak `EditionFactory` w `database/factories/` — trzeba dopisać dla testów.

## Goals / Non-Goals

**Goals:**

- Jedno miejsce liczące liczniki i kolejki pulpitu z prostych zapytań `COUNT`,
  bez powielania logiki `ProgressAggregator` (ta liczy per-user, nie
  wieloosobowo).
- Zapis ustawień edycji wyłącznie przez model `Edition`, z walidacją zakresów
  przed zapisem i audytem po zapisie, w jednej transakcji.
- Zmiana `test_pass_threshold` widoczna natychmiast dla `Settings::edition()` —
  bez cache'a, bez restartu.

**Non-Goals:**

- Wielość edycji jednocześnie — MVP ma dokładnie jedną aktywną edycję;
  `PATCH /admin/edition` nie przyjmuje identyfikatora.
- Pełny test integracyjny „nowy próg realnie oblewa podejście w H10” — to test
  wspólny z §6.3 dokumentu zależności (`H19 + H10`), którego właścicielem jest
  pakiet dowożony później. H19 dostarcza tylko gwarancję braku cache'owania po
  stronie `Settings`.
- Panel `/admin/postepy` (poza zakresem programu na hackathon).

## Decisions

### D1. Liczniki i kolejki: bezpośrednie zapytania `COUNT`, osobny serwis `DashboardSummary`

`App\Services\H19\DashboardSummary::build(): array` zwraca `counters` i `queues`
z prostych zapytań: `User::whereIn('role', ['volunteer','student'])->where('status','active')->count()`,
`User::whereNotNull('program_completed_at')->count()`, `Certificate::count()`,
`Application::where('status','new')->count()`, `InternshipEntry::where('status','submitted')->count()`,
`PsychologistProfile::whereNot('status','draft')->...->count()` (dokładna reguła
„do decyzji” zgodna z §5 seeda: `submitted` liczy się, `draft` nie),
`InstructorQuestion::whereNull('answered_at')->count()`.

*Dlaczego:* `ProgressAggregator::for()` jest per-user — pętla po wszystkich
użytkownikach dla sześciu liczników byłaby O(n) zapytań zamiast sześciu.
Bezpośrednie `COUNT` na tabelach innych pakietów jest bezpieczne, bo migracje są
zamrożone i tabele już istnieją w starterze (H19 tylko czyta, nic nie zapisuje w
cudzych tabelach). *Alternatywa:* rozszerzyć `ProgressAggregator` o metodę
wieloosobową — odrzucone: zmiana pliku sztabu poza zakresem pakietu S.

### D2. `queues` jako stała lista z linkami wpisaną w kodzie pakietu

Cztery wpisy na sztywno: `applications` → `/admin/uczestniczki`,
`internship_entries` → `/admin/staz`, `profiles` → `/panel/profil-psychologa`
(a raczej właściwy ekran administracyjny H15, jeśli istnieje — w innym wypadku
link do `/admin/uczestniczki` jako najbliższy istniejący ekran), `questions` →
`/panel/prowadzacy`. Każdy wpis ma `key`, `count`, `link` w stałej kolejności.

*Dlaczego:* kontrakt pokazuje kształt `{key, count, link}` bez zamkniętej listy
kluczy; §5 seeda wprost wymienia te cztery liczniki jako „liczniki pulpitu
(H19)”. *Uwaga:* linki do ekranów spoza H19 (`/admin/staz`, ekran profili, ekran
pytań) mogą jeszcze nie istnieć w chwili scalania — nie blokuje to H19 (link to
string, nie routing time-check), ale wymaga uzgodnienia ścieżek z właścicielami
H11/H15/H09/H17 przy integracji (do zgłoszenia liaisonowi, nie strażnikowi
kontraktu — to nie zmiana kontraktu HTTP).

### D3. Zapis ustawień: bezpośrednio przez `Edition::update()`, nie przez `Settings`

Kontroler woła `App\Services\H19\EditionSettingsUpdater::update(Edition $edition,
array $validated, User $actor): Edition`, który w transakcji robi
`$edition->update($validated)` i `AuditLog::record($actor, 'edition.updated',
$edition, ['changed' => array_keys($validated)])`.

*Dlaczego nie przez `Settings`:* `Settings::edition()` ma zamrożoną sygnaturę
tylko-do-odczytu; dopisywanie mu metody zapisu byłoby zmianą pliku sztabu poza
zakresem pakietu. *Alternatywa:* własna warstwa cache — odrzucone,
niepotrzebna złożoność, a `Settings::activeEdition()` i tak odpytuje bazę przy
każdym wywołaniu (brak cache'a do unieważnienia).

### D4. Walidacja zakresów w `UpdateEditionRequest`

Pola procentowe (`test_pass_threshold`, `reliability_threshold`,
`lesson_completion_percent`) — `integer|min:0|max:100`. Pola licznikowe
(`test_attempts_limit`, `internship_hours_required`,
`supervision_required_count`, `seats_limit`) — `integer|min:1`. `starts_at` /
`ends_at` — `date`, z `ends_at` `after:starts_at` gdy oba podane. Wszystkie pola
`sometimes` (PATCH częściowy). Komunikaty po polsku.

*Dlaczego:* kryterium 3 wymaga wprost 422 dla progu 150%; górna granica 100 dla
pól procentowych i dolna 1 dla pól licznikowych to jedyne zakresy, które mają
sens domenowy i są łatwe do przetestowania.

### D5. Autoryzacja: `role:project_manager,super_admin`

Obie trasy (`GET /admin/dashboard`, `GET/PATCH /admin/edition`) pod
`['auth:sanctum', 'role:project_manager,super_admin']`. H19 jest pierwszym
konsumentem aliasu `role:` w plikach tras.

*Dlaczego te dwie role:* to jedyne role z persony „obsługa administracyjna” w
słowniku ról i w seedzie demo (`opiekun@demo.pl` = `project_manager`,
`admin@demo.pl` = `super_admin`). `instructor` ma własny panel
(`/panel/prowadzacy`), `volunteer`/`student` nie mają dostępu do `/admin`.
*Alternatywa:* tylko `super_admin` — odrzucone, bo `opiekun@demo.pl` jest
codzienną personą obsługującą kolejki wg seeda i musi widzieć pulpit.

### D6. Flaga funkcji i szkielet tras

`routes/api/h19.php` zaczyna się od `if (! config('features.h19')) { return; }`,
identycznie jak H01. Jeśli klucz `h19` nie istnieje jeszcze w
`config/features.php` (plik sztabu), dopisanie go jest zgłoszeniem, nie PR-em w
pliku sztabu — patrz `tasks.md` §1.

## Risks / Trade-offs

- **Bezpośrednie zapytania na tabelach innych pakietów** (`Application`,
  `InternshipEntry`, `PsychologistProfile`, `InstructorQuestion`) → jeśli któraś
  tabela/model jeszcze nie istnieje w chwili implementacji, licznik dla tej
  kolejki nie da się policzyć. *Mitygacja:* zweryfikować istnienie każdego
  modelu przed pisaniem serwisu (starter ma komplet migracji, więc ryzyko
  niskie); w razie braku — zwrócić `count: 0` z komentarzem TODO, nie blokować
  całego pulpitu.
- **Linki kolejek do ekranów spoza H19** mogą wskazywać nieistniejące jeszcze
  trasy frontendowe w trakcie równoległej pracy innych zespołów. *Mitygacja:*
  to zwykłe stringi, nie routing-time assertions — ekran H19 działa niezależnie
  od tego, czy cel linku już istnieje; do uzgodnienia z liaisonem przy
  integracji.
- **H19 jest pierwszym konsumentem `role:`** → jeśli inny pakiet ustali inną
  konwencję nazw ról w middleware, trzeba będzie ujednolicić. *Mitygacja:*
  używamy dokładnie nazw z `users.role` i słownika kontraktu §3.4, zero
  wymyślonych wartości.
- **Brak pełnego testu „próg zmienia wynik w H10”** → kryterium 2★ opiera się
  na teście wspólnym z H10 (§6.3), którego H19 nie może samodzielnie domknąć,
  dopóki H10 nie ma endpointu podejścia do testu. *Mitygacja:* H19 dostarcza
  test jednostkowy „`Settings::edition()` zwraca nową wartość zaraz po
  zapisie”, co jest mechanizmem wymaganym przez kryterium; pełny test
  integracyjny z H10 wchodzi do `DEMO/H19.md` jako uzgodnienie do domknięcia z
  właścicielem H10.

## Migration Plan

Brak migracji — tabela `editions` ma już wszystkie potrzebne kolumny. Wdrożenie
to zwykły merge za `config('features.h19')`; wyłączenie flagi zdejmuje trasy i
ekrany bez cofania commitów. Rollback: flaga na `false`, dane w `editions`
zostają nietknięte.
