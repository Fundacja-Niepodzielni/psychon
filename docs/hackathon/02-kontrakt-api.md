# Kontrakt API — obowiązuje wszystkie pakiety (wersja 2, po recenzji)

**Precedencja dokumentów:** kontrakt rozstrzyga **kształt HTTP** (trasy, koperty, kody,
słowniki) · pakiety rozstrzygają **zakres i kryteria odbioru** · specyfikacja systemowa
rozstrzyga **reguły biznesowe**. Zmiany kontraktu wyłącznie przez strażnika kontraktu.
Brakującą trasę zgłaszasz strażnikowi **przed implementacją** (SLA odpowiedzi: 30 min);
wynik jest dopisywany tutaj i ogłaszany.

## 1. Zasady ogólne

- **Base URL:** `/api/v1` · JSON UTF-8.
- **Daty:** znaczniki czasu — ISO 8601 UTC (`2026-09-30T08:00:00Z`); pola będące datą
  kalendarzową (np. data dyżuru) — `YYYY-MM-DD`.
- **Uwierzytelnienie:** `Authorization: Bearer <token>` (Sanctum).
  `POST /auth/login {email, password}` → `{data:{token, user}}` · `POST /auth/logout`.
  **W starterze (nie w pakietach):** `POST /auth/forgot-password`,
  `POST /auth/reset-password`, `POST /auth/activate {token, password}` (ustawienie hasła
  z zaproszenia po akceptacji zgłoszenia) + rate limiting logowania.
- **Nazewnictwo:** zasoby po angielsku, kebab-case; akcje domenowe jako `POST` na
  pod-zasób (`POST /admin/applications/{id}/accept`). Wyjątki zastane w tym dokumencie
  (`/me`, `/admin/edition`, `PATCH .../attendance`, `PATCH .../reorder`) są legalne —
  nie twórz nowych wyjątków bez strażnika.
- **Koperta odpowiedzi:** **zawsze** `{"data": ...}` — bez wyjątków; listy dodatkowo
  `"meta"` z paginacją:

```json
{ "data": [ ... ],
  "meta": { "current_page": 1, "per_page": 25, "total": 132, "last_page": 6 } }
```

  Pola domenowe obok paginacji umieszczaj w `meta.extra`
  (np. `"extra": { "accepted_hours": "41.5", "required_hours": "72" }`).
- **Paginacja:** `?page=1&per_page=25` (max 100) · filtry płaskie
  (`?role=volunteer&search=kowal`) · sortowanie `?sort=-created_at`.
- **Koperta błędu** (jedyna dopuszczalna): `code` i `message` obowiązkowe;
  `errors` przy walidacji pól; `reason` (obiekt szczegółów) opcjonalny:

```json
{ "error": { "status": 422, "code": "validation_failed",
    "message": "Popraw zaznaczone pola.",
    "errors": { "pesel": ["Nieprawidłowy numer PESEL."] } } }
```

### 1.1 Tabela decyzyjna kodów statusu (rozstrzyga spory w review)

| Sytuacja | Kod | Przykładowy `code` |
|---|---|---|
| brak/nieważny token | **401** | `unauthenticated` |
| rola nie ma dostępu do sekcji/akcji (matryca ról) | **403** | `forbidden` |
| reguła domenowa blokuje dostęp/akcję (stan, nie własność) | **403** | `course_locked`, `attempts_exhausted`, `access_expired`, `not_your_supervisor`, `entry_locked`, `profile_not_eligible`, `program_not_completed`, `cooperation_request_closed` |
| zasób nie istnieje **lub należy do innego użytkownika** (pojedynczy rekord wskazywany identyfikatorem — nie ujawniamy istnienia) | **404** | `not_found` |
| wyścig o ograniczony zasób (limit miejsc, duplikat unikalny) | **409** | `slot_full`, `email_already_registered`, `cooperation_request_open` |
| błędne dane wejściowe / niespełnione warunki operacji | **422** | `validation_failed`, `not_enough_active_time`, `conditions_not_met`, `profile_incomplete`, `cannot_extend_self`, `access_date_not_applicable` |
| przyjęto zadanie w tle | **202** | — |

Przykład 403 domenowego z opcjonalnym `reason`:

```json
{ "error": { "status": 403, "code": "course_locked",
    "message": "Ukończ najpierw etap 2: Wywiad psychologiczny.",
    "reason": { "required_course_id": 2, "missing": ["lessons", "test"] } } }
```

- **Liczby dziesiętne** (godziny, procenty rzetelności) jako stringi: `"hours": "2.5"`.
- **Eksporty CSV:** zawsze `GET .../export.csv` → `text/csv; charset=utf-8` **z BOM**,
  separator `;` (wspólny helper w starterze).
- **Uploady** (materiały, załączniki, import CSV): `multipart/form-data`; odpowiedź
  w standardowej kopercie.
- **Audyt:** każde zdarzenie z rejestru §3.2 musi przejść przez `AuditLog::record` —
  rejestr §3.2 jest **jedynym** źródłem prawdy o slugach audytu.
- **Powiadomienia:** wyłącznie przez `Notify::send` ze startera; typy — rejestr §3.1.

## 2. Przykłady wzorcowe (obowiązujący kształt)

### Ja / profil (H01)

`GET /me` → 200 — właściciel widzi własny PESEL w całości (spec M2); maskowanie
dotyczy widoków innych niż właściciel/administracja:

```json
{ "data": { "id": 17, "first_name": "Marta", "last_name": "Demo",
  "email": "marta@demo.pl", "role": "volunteer", "phone": "+48 600 100 200",
  "pesel": "90010112345", "address": { "street": "…", "city": "…", "zip": "…" },
  "access_expires_at": "2027-02-01T00:00:00Z", "program_completed_at": null,
  "product_group": "psychon" } }
```

`PATCH /me` — pola profilu; **pole `email` tylko do odczytu** (zmiana wyłącznie przez
administrację, `PATCH /admin/users/{id}`, z audytem).
Eksport RODO: `POST /me/exports` → 202 `{"data":{"id":"ex_9f2","status":"queued"}}` ·
`GET /me/exports/{id}` → status · `GET /me/exports/{id}/download` → plik (tylko
właściciel; cudzy `id` → 404). Zakres eksportu: profil, zgody, postępy, wpisy stażu,
metadane dokumentów.

### Kursy (H05)

`GET /courses` → 200

```json
{ "data": [
  { "id": 1, "slug": "podstawy-pomocy", "title": "Podstawy pomocy psychologicznej",
    "sequence_order": 1, "product_group": "psychon",
    "status": "completed", "progress_percent": 100 },
  { "id": 2, "slug": "wywiad-psychologiczny", "title": "Wywiad psychologiczny",
    "sequence_order": 2, "status": "in_progress", "progress_percent": 40 },
  { "id": 3, "slug": "interwencja-kryzysowa", "title": "Interwencja kryzysowa",
    "sequence_order": 3, "status": "locked", "progress_percent": 0 } ] }
```

`GET /courses/{slug}` (odblokowany) → 200 **w kopercie**:

```json
{ "data": { "id": 2, "slug": "wywiad-psychologiczny", "title": "Wywiad psychologiczny",
  "status": "in_progress", "progress_percent": 40,
  "instructor": { "id": 5, "name": "Joanna Demo" },
  "lessons": [ { "id": 21, "title": "…", "sequence_order": 1,
                 "duration_seconds": 1800, "is_completed": true } ],
  "materials": [ { "id": 7, "name": "Karta pracy.pdf",
                   "download_url": "<podpisany, wygasa>" } ] } }
```

Zablokowany → 403 `course_locked` (wzór w §1.1). Odblokowanie liczy wyłącznie
`CourseAccess::state($user, $course)` ze startera — pakiety nie piszą własnej reguły.

### Postęp lekcji (H06)

`GET /lessons/{id}` → 200 (każdy udany odczyt zwiększa `open_count` o 1):

```json
{ "data": {
  "id": 21,
  "title": "Wprowadzenie do wywiadu",
  "description": "Opis lekcji",
  "duration_seconds": 1800,
  "watched_seconds": 812,
  "active_seconds": 700,
  "is_completed": false,
  "completable": false,
  "completable_at_percent": 60
} }
```

`description` może być `null`. Liczniki pochodzą z postępu zalogowanego użytkownika;
przy jego braku mają wartość `0`, a `is_completed` ma wartość `false`.
Lekcja z kursu zablokowanego → 403 `course_locked` zgodnie z regułą `CourseAccess`.

`POST /lessons/{id}/progress` (heartbeat ≤ co 30 s) — **przyrosty**, nazwy wiążące:

```json
{ "watched_delta": 28, "active_delta": 25 }
```

→ 200 `{ "data": { "watched_seconds": 812, "active_seconds": 700,
"completable": false, "completable_at_percent": 60 } }`
Oba pola są wymaganymi, nieujemnymi liczbami całkowitymi. Naruszenie tych reguł
→ 422 `validation_failed`. Serwer: wartości tylko rosną; wyłącznie
**`active_delta` jest przycinane do 35 s na żądanie** (idempotencja przy dwóch
kartach/urządzeniach). Próg ukończenia = `editions.lesson_completion_percent`
(klucz w §3.3).

`POST /lessons/{id}/complete` → 200:

```json
{ "data": { "is_completed": true,
  "completed_at": "2026-10-03T12:30:00Z" } }
```

Poniżej progu → 422 `not_enough_active_time`. Lekcja z `duration_seconds = 0` nigdy
nie jest `completable`; próba ukończenia również zwraca 422
`not_enough_active_time`.

### Rzetelność nauki (H07)

H07 udostępnia dokładnie trzy operacje. Wszystkie wymagają Bearer tokenu i przyjmują
wyłącznie parametry opisane poniżej. Wynik rzetelności pochodzi z
`ProgressAggregator`: jest zaokrąglonym do liczby całkowitej, ograniczonym do 100%
ilorazem sumy `active_seconds` i sumy `duration_seconds` ukończonych lekcji z
`duration_seconds > 0`. W API procent jest dziesiętnym stringiem albo `null`, gdy
osoba nie ma mierzalnej ukończonej lekcji. `below_threshold` jest prawdziwe wyłącznie,
gdy wynik istnieje i jest mniejszy od bieżącego
`Settings::edition('reliability_threshold')`; wynik równy progowi nie jest poniżej
progu.

`GET /admin/reliability?page=1&per_page=50` → `200` — dostęp wyłącznie dla
`project_manager` i `super_admin`. `page` jest dodatnią liczbą całkowitą, a
`per_page` liczbą całkowitą od 1 do 100; wartości domyślne to odpowiednio 1 i 50.
Inne parametry, w tym filtry i własne sortowanie, zwracają `422 validation_failed`.
Lista obejmuje aktywnych użytkowników o roli `volunteer` lub `student` z aktywnej
edycji. Serwer sortuje ją rosnąco po rzetelności, osoby z wynikiem `null` umieszcza
na końcu, a remisy rozstrzyga rosnąco po nazwisku, imieniu i `id`. Sortowanie odbywa
się przed paginacją.

```json
{
  "data": [
    {
      "id": 17,
      "first_name": "Filip",
      "last_name": "Demo",
      "email": "filip@demo.pl",
      "reliability_percent": "15",
      "below_threshold": true
    }
  ],
  "meta": { "current_page": 1, "per_page": 50, "total": 1, "last_page": 1 }
}
```

`GET /admin/reliability/{userId}` → `200` — te same role i pola osoby co na liście,
rozszerzone o `lessons`. Szczegóły obejmują wyłącznie ukończone lekcje z dodatnim
czasem trwania. `below_threshold` lekcji porównuje jej procent aktywnego czasu,
ograniczony do 100%, z tym samym bieżącym progiem edycji. Wartość zbiorcza nadal
pochodzi wyłącznie z `ProgressAggregator` i nie jest liczona z tablicy `lessons`.

```json
{
  "data": {
    "id": 17,
    "first_name": "Filip",
    "last_name": "Demo",
    "email": "filip@demo.pl",
    "reliability_percent": "15",
    "below_threshold": true,
    "lessons": [
      {
        "id": 21,
        "title": "Wprowadzenie do wywiadu",
        "active_seconds": 270,
        "duration_seconds": 1800,
        "open_count": 2,
        "last_activity_at": "2026-10-03T12:30:00Z",
        "below_threshold": true
      }
    ]
  }
}
```

`last_activity_at` może być `null`. Nieistniejący `userId` oraz użytkownik spoza
aktywnej edycji, dozwolonych ról lub aktywnego statusu zwracają identyczne
`404 not_found` z komunikatem „Nie znaleziono osoby.”. Operacja nie przyjmuje
parametrów query. Trasa szczegółów prowadzącego nie istnieje.

`GET /instructor/reliability` → `200` — dostęp wyłącznie dla roli `instructor`.
Zakres jest wyznaczany wyłącznie z tokenu: odpowiedź obejmuje aktywnych wolontariuszy
i studentów aktywnej edycji z `supervisor_assignments`, dla których
`supervisor_id` odpowiada zalogowanemu prowadzącemu, a `unassigned_at` jest `null`.
Operacja nie przyjmuje identyfikatora osoby, grupy, prowadzącego ani innych parametrów.
Kolejność jest taka sama jak na liście administracyjnej. Odpowiedź nie zawiera e-maili
ani szczegółów lekcji:

```json
{
  "data": [
    {
      "id": 18,
      "first_name": "Marta",
      "last_name": "Demo",
      "reliability_percent": "85",
      "below_threshold": false
    }
  ],
  "meta": { "current_page": 1, "per_page": 50, "total": 1, "last_page": 1 }
}
```

Puste listy zwracają `data: []` z `total: 0`; brak wyniku osoby jest reprezentowany
przez `reliability_percent: null` i `below_threshold: false`. Brak lub nieważny token
daje `401 unauthenticated`, a każda rola niedopuszczona dla danej operacji —
`403 forbidden`. Odczyty H07 nie emitują audytu ani powiadomień.

### Test (H10)

`GET /courses/{slug}/test` → pytania bez flag poprawności:

```json
{ "data": { "test_id": 4, "pass_threshold": 80, "attempts_used": 1,
  "attempts_limit": 3, "questions": [
    { "id": 41, "body": "…", "answers": [ { "id": 210, "body": "…" },
      { "id": 211, "body": "…" } ] } ] } }
```

Progi czytane przez `Settings::edition(...)`; kolumny `tests.pass_threshold /
attempts_limit` to **nadpisania per kurs** (null = wartość edycji).
`POST /tests/{id}/attempts` `{ "answers": { "41": 210, … } }` → 201

```json
{ "data": { "attempt_number": 2, "score_percent": 80, "passed": true,
  "wrong_question_ids": [44, 47] } }
```

Podejście zapisuje **snapshot treści pytań** (`test_attempts.questions_snapshot`).
Limit wyczerpany → 403 `attempts_exhausted`. Odpowiedź spoza pytania → 422.
Reset limitu (procedura po 3. niezaliczeniu — decyzja: reset przez opiekuna z powodem):
`POST /admin/tests/{testId}/users/{userId}/reset-attempts {reason}` → 200 [audyt].
Warsztat: `POST /admin/workshop/{userId}/complete` → 200 [audyt].

### Staż (H11)

H11 rejestruje dokładnie sześć operacji. Nie ma `GET /internship/entries/{id}`.

#### Zasób uczestnika

W odpowiedzi uczestnika `data` zawiera dokładnie pola:

```json
{
  "id": 91,
  "date": "2026-08-27",
  "hours": "3.5",
  "form": "phone_duty",
  "consultations_count": 4,
  "description": "Dyżur telefoniczny — bez danych osób.",
  "status": "submitted",
  "review_comment": null,
  "decided_at": null,
  "created_at": "2026-08-27T18:00:00Z",
  "updated_at": "2026-08-27T18:00:00Z"
}
```

`date` jest datą kalendarzową `YYYY-MM-DD`; nie może być późniejsza niż dzień
bieżący. `hours` jest dziesiętnym stringiem od `"0.5"` do `"24"`, w krokach co
`0.5`. `form` przyjmuje wyłącznie `phone_duty`, `chat_duty` albo `other`.
`consultations_count` jest nieujemną liczbą całkowitą. `review_comment` i
`decided_at` mogą być `null`, a pola czasu są ISO 8601 UTC. Zasób nie zawiera
`user_id`, `decided_by` ani danych administratora.

#### Operacje uczestnika

- `GET /internship/entries` → `200`, standardowa paginowana lista wyłącznie
  własnych wpisów. `meta.extra` zawiera dokładnie `accepted_hours` i
  `required_hours` jako dziesiętne stringi. `accepted_hours` obejmuje wyłącznie
  wpisy `accepted`; `required_hours` pochodzi z
  `Settings::edition('internship_hours_required')`.
- `POST /internship/entries` z polami `date`, `hours`, `form`,
  `consultations_count`, `description` → `201`, pełny zasób uczestnika ze
  statusem `submitted`. `user_id` z żądania jest ignorowane/nie jest polem
  wejściowym.
- `PATCH /internship/entries/{id}` z tymi samymi polami → `200`, pełny zasób
  uczestnika. Wpis `returned` po edycji wraca do `submitted` i zachowuje
  `review_comment`. Wpis `accepted` zwraca `403 entry_locked` i nie jest
  zmieniany. Cudzy albo nieistniejący identyfikator zwraca `404 not_found`.

#### Zasób administracyjny i kolejka

`GET /admin/internship/pending` → `200`, standardowa paginacja (domyślnie
`per_page=25`, maksymalnie `100`), wyłącznie wpisy `submitted`, sortowane po
`created_at` rosnąco, a przy remisie po `id` rosnąco. Każdy element zawiera
pełny zasób uczestnika oraz dokładnie:

```json
"user": { "id": 17, "first_name": "Marta", "last_name": "Demo" }
```

Nie są zwracane inne pola użytkownika ani administratora.

#### Decyzje administracyjne

- `POST /admin/internship/{id}/accept` bez ciała → `200` z pełnym zasobem
  administracyjnym po zmianie na `accepted`.
- `POST /admin/internship/{id}/return` z wymaganym niepustym stringiem
  `{ "comment": "Uzupełnij opis dyżuru." }` → `200` z pełnym zasobem
  administracyjnym po zmianie na `returned`. Brak albo pusty komentarz →
  `422 validation_failed`.

Obie decyzje są dostępne wyłącznie dla administracji i tylko dla statusu
`submitted`. Powtórzona albo sprzeczna decyzja zwraca `403 entry_locked` bez
zmiany wpisu, dodatkowego audytu i powiadomienia. Odesłanie wymaga komentarza;
ponowne złożenie zachowuje komentarz opiekuna, również po późniejszej akceptacji.

Akceptacja emituje wyłącznie powiadomienie i audyt `internship.accepted`, a
odesłanie wyłącznie `internship.returned`; oba przechodzą odpowiednio przez
`Notify::send` i `AuditLog::record`.

### Superwizja (H12)

`POST /supervision/slots/{id}/signup` → 201 · pełny termin → **409 `slot_full`** ·
termin cudzej grupy → 403 `not_your_supervisor`.
`PATCH /instructor/slots/{id}/attendance` `{ "attendance": { "17": "present", "18": "absent" } }` → 200.
Przypisanie superwizora do wolontariusza (administracja):
`PUT /admin/users/{id}/supervisor {supervisor_id}` → 200 [audyt `supervisor.assigned`].
`GET /admin/supervision/slots` → 200, wszystkie terminy wszystkich prowadzących wraz z obecnościami (administracja).

`GET /supervision/slots` → 200 — terminy prowadzone przez superwizora osoby pytającej,
stronicowane (`meta`); brak przypisanego superwizora → 200 z pustą listą.
`DELETE /supervision/slots/{id}/signup` → 200 — wypisanie; po rozpoczęciu terminu
→ 422 `validation_failed`; brak aktywnego zapisu → 404 `not_found`.
`GET /instructor/group` → 200 — grupa prowadzącego wraz z etapem każdej osoby.
`POST /instructor/slots` → 201 — utworzenie terminu (`starts_at`, `seats_limit`).
`PATCH /instructor/slots/{id}/attendance` — dostęp: prowadzący **oraz administracja**
(`project_manager`, `super_admin`).
Wspólne dla zapisu i wypisania: nieznany termin → 404 `not_found`; termin, który już się
rozpoczął → 422 `validation_failed`; ponowny zapis na termin już zapisany → 201 bez zmiany
stanu (idempotentnie).

### Certyfikat (H13)

`GET /certificate/conditions` → 200

```json
{ "data": { "eligible": false, "conditions": [
  { "key": "courses",     "label": "Wszystkie etapy i testy", "done": 8,  "required": 10, "met": false },
  { "key": "internship",  "label": "Godziny stażu",  "done": "41.5", "required": "72", "met": false },
  { "key": "supervision", "label": "Obecności na superwizjach", "done": 5, "required": 6, "met": false },
  { "key": "workshop",    "label": "Warsztat stacjonarny", "met": false } ] } }
```

Liczby liczy `ProgressAggregator` ze startera (to samo źródło co karta osoby, pulpit
i raport). `POST /certificate/generate` → 202 (job; PDF+QR przez `PdfService`) albo
422 `conditions_not_met` z listą braków. Wydanie ustawia
`users.program_completed_at` [audyt `certificate.issued`].
Publiczne (bez auth): `GET /verify/{number}` → 200
`{ "data": { "number": "NP/2026/017", "status": "valid", "edition": "2026",
"issued_at": "…" } }` (`status`: `valid | revoked`; unieważnianie — po hackathonie) ·
nieznany albo błędny numer → 404 z komunikatem „Nie znaleziono certyfikatu o podanym
numerze." (identycznym dla obu przypadków).

### Powiadomienia (H16)

`GET /notifications` → `{ "data": [ { "id": 5, "type": "internship.returned",
"title": "…", "body": "…", "link": "/panel/staz", "read_at": null,
"created_at": "…" } ], "meta": { …paginacja…, "extra": { "unread": 3 } } }`
`POST /notifications/{id}/read` (cudze → 404) · `POST /notifications/read-all`.
Skrzynka e-maili: `GET /admin/emails` (status `simulated` — nic nie wychodzi w świat).

### Rekrutacja (H03)

`POST /admin/applications/{id}/accept {role}` → 201
`{ "data": { "user_id": 44, "access_expires_at": "<akceptacja + 6 mies.>" } }`
— tworzy konto i wysyła zaproszenie (link `auth/activate`). Rola z żądania; kolumna
`applications.role` przechowuje rolę proponowaną w zgłoszeniu (wartość domyślna
formularza). `POST .../reject {reason}` (422 bez powodu) [audyt] + powiadomienie/e-mail
`application.rejected`. Duplikat e-maila istniejącego konta → 409
`email_already_registered` + `reason.existing_user_id` (możliwość powiązania).
Import: `POST /admin/applications/import` (multipart CSV) → 200
`{ "data": { "imported": 18, "skipped": [ { "line": 4, "reason": "…" } ] } }`.
Wgląd w skan dyplomu → wpis w `sensitive_access_log`.

### Panel — osoby (H18)

`GET /admin/users?role=volunteer&search=demo&sort=-created_at` → lista + meta.
`GET /admin/users/{id}` → karta **w kopercie**:

```json
{ "data": { "profile": { …jak /me… },
  "progress": { "courses_done": 8, "courses_total": 10,
    "hours_accepted": "41.5", "supervision_present": 5, "workshop_done": false },
  "documents": [ { "id": 3, "type": "volunteer_agreement", "number": "…" } ],
  "recent_notifications": [ … ], "audit_entries": [ …dotyczące tej osoby… ] } }
```

`POST /admin/users` (konto + zaproszenie) · `PATCH /admin/users/{id}` ·
`POST /admin/users/{id}/block {reason}` [audyt] · `GET /admin/users/export.csv`.

### Ustawienia edycji (H19)

`GET /admin/edition` → aktywna edycja (MVP prowadzi jedną naraz) ·
`PATCH /admin/edition` — klucze z §3.3, walidacja zakresów [audyt `edition.updated`].
`GET /admin/dashboard` → `{ "data": { "counters": { "participants": …,
"completed": …, "certificates": … }, "queues": [ { "key": "applications",
"count": 3, "link": "/admin/uczestniczki?zakladka=zgloszenia" }, … ] } }`.

### Raporty i dziennik (H20)

`GET /admin/report` (+ `GET /admin/report/export.csv`) ·
`GET /admin/audit?action=…&user_id=…&from=…&to=…` (+ `GET /admin/audit/export.csv`).
Trasy modyfikacji audytu **nie istnieją** (próba → 404).

### Dokumenty prawne (H22)

Rodzaj dokumentu jest zamknięty słownikiem `regulamin · polityka`; nowy rodzaj to zmiana
kodu, nie danych. Wersja ma stan `draft` albo `published`; wersja opublikowana jest
niezmienna — zmiana treści zakłada zawsze nową wersję (nowy wiersz), nigdy edycję starej.
Na rodzaj przypada **dokładnie jedna wersja bieżąca**: najnowsza opublikowana (po
`published_at`, przy remisie po `id`).

#### Odczyt publiczny (bez logowania)

- `GET /legal-documents/{type}/current` → 200, bieżąca wersja rodzaju. Nieznany rodzaj →
  404 `not_found`; rodzaj bez żadnej opublikowanej wersji → 404 `not_found`.
- `GET /legal-documents/{type}/versions/{version}` → 200, dowolna **opublikowana** wersja
  rodzaju, niezależnie od tego, czy jest bieżąca. Nieznany rodzaj, nieznana etykieta wersji
  oraz szkic (wersja `draft`) → 404 `not_found` we wszystkich trzech przypadkach —
  bezpośredni odnośnik do szkicu nie ujawnia jego istnienia.

Obie trasy są publiczne z tego samego powodu co weryfikacja certyfikatu (H13) i pobranie
materiału (H05): wpis na liście dozwolonych tras bez tokenu (`config/public_routes.php`),
pilnowany testem dymnym, który psuje bramkę, gdy jakakolwiek inna trasa `/api` stanie się
osiągalna bez tokenu.

#### Akceptacja (osoba zalogowana, dowolna rola)

`POST /legal-documents/{type}/accept { "version": "..." }` — osoba potwierdza, że
zaakceptowała wersję widzianą na ekranie.

- Gość (brak tokenu) → 401 `unauthenticated`.
- Nieznany rodzaj dokumentu → **422** `unknown_document_type` — inny kod niż na trasach
  odczytu (tam ten sam warunek daje 404 `not_found`); rozjazd opisany niżej w wadach.
- **Rodzaj informacyjny** (klauzula z art. 13 RODO — dziś `klauzula-rodo`) **nie jest na tej
  trasie znanym rodzajem** → **422** `unknown_document_type`, tak samo jak rodzaj nieistniejący,
  bez zapisu `consents` i bez wpisu audytu. Klauzuli informacyjnej nikt nie udziela i nikt jej
  nie wycofuje — administrator ma obowiązek ją udostępnić, a nie zebrać na nią zgodę. Na tej
  trasie „znany rodzaj" znaczy **rodzaj zgody**, czyli rodzaj mający odpowiednik w słowniku zgód
  (`Application::CONSENT_COLUMNS`), a nie każdy rodzaj z listy dokumentów
  (`LegalDocumentVersion::TYPES`). Podział obu zbiorów jest jawny w
  `LegalDocumentVersion::INFORMATIONAL_TYPES` i pilnowany próbą.
  **Trasy odczytu i trasy administracyjne ta zasada nie dotyczy** — klauzula jest publicznie
  czytelna przez `GET /legal-documents/klauzula-rodo/current` i dalej można wydać jej nową wersję.
  Aneks po decyzji właściciela z 23.09.2026: do 18.09 lista dokumentów i lista zgód były tym
  samym zbiorem, więc bramkowanie po liście dokumentów było poprawne; trzeci dokument
  (klauzula RODO, dodany 18.09) rozdzielił te zbiory i tym samym — niezauważenie — poszerzył
  to, co dało się przyjąć jako zgodę.
- Wersja z żądania inna niż aktualnie bieżąca (dokument zmienił się między wczytaniem
  ekranu a wysłaniem, albo etykieta nie istnieje) → 422 `document_version_not_current`,
  z `reason.current_version` wskazującym bieżącą etykietę (albo `null`, gdy rodzaj nie ma
  żadnej opublikowanej wersji).
- Pierwsza akceptacja bieżącej wersji → **201**, zapisuje wiersz `consents`
  (`user_id`, `type`, `document_version`, `granted_at`) i audyt `legal_document.accepted`.
- Powtórzona akceptacja **tej samej, nadal bieżącej** wersji → **200**, bez nowego wiersza
  i bez drugiego wpisu audytu — zwraca istniejącą zgodę. Dwa równoległe żądania tej samej
  akceptacji rozstrzyga indeks unikalny na trójce (osoba, rodzaj, wersja dokumentu):
  przegrana strona łapie naruszenie unikalności i zwraca wiersz zwycięzcy, zamiast błędu i
  zamiast drugiego wpisu audytu.
- Odpowiedź: `{ "data": { "type": "...", "document_version": "..." } }`.

#### Administracja (`project_manager`, `super_admin`)

Wszystkie trasy niżej wymagają tokenu i jednej z tych dwóch ról (ta sama bramka co inne
panele CMS — brak tokenu → 401 `unauthenticated`, inna rola → 403 `forbidden`).

- `GET /admin/legal-documents/{type}/versions` → 200, wszystkie wersje rodzaju (szkice i
  opublikowane), najnowsza pierwsza. Nieznany rodzaj → 404 `not_found`.
- `POST /admin/legal-documents/{type}/versions { "version": "...", "content": "..." }`
  → **201**, nowy szkic (`status: draft`). Walidacja: oba pola wymagane, `version` do 32
  znaków, `content` do 20000 znaków — naruszenie dowolnego warunku → 422
  `validation_failed`, nic nie jest zapisywane.
- `PATCH /admin/legal-documents/{type}/versions/{version} { "version"?, "content"? }` →
  200, edycja **wyłącznie szkicu**. Wersja opublikowana → 403 `version_locked`, treść bez
  zmian.
- `DELETE /admin/legal-documents/{type}/versions/{version}` → 200, usunięcie **wyłącznie
  szkicu**. Wersja opublikowana → 403 `version_locked`, wiersz zostaje.
- `POST /admin/legal-documents/{type}/versions/{version}/publish` bez ciała → 200, ustawia
  `status: published` i `published_at`, audyt `legal_document.published`. Wersja już
  opublikowana → 403 `version_locked` (ponowna publikacja tej samej wersji jest odrzucana,
  nie jest no-opem).

Reguła wydania drugiej wersji o tej samej etykiecie: etykieta `version` jest unikalna **w
obrębie rodzaju** (na poziomie walidacji żądania i na poziomie tabeli) — druga wersja `v1`
rodzaju `regulamin` → 422 `validation_failed`; ta sama etykieta `v1` dla rodzaju `polityka`
jest osobnym wierszem i przechodzi bez przeszkód.

#### Widoczność na `/me`

Własny profil (`GET /me`, nie karta administracji) niesie
`legal_documents_pending_acceptance` — listę rodzajów, na które osoba **nie ma** zgody na
aktualnie bieżącą wersję (brak zgody w ogóle albo zgoda na wersję już nieaktualną).
Publikacja nowej wersji rodzaju, na który osoba już się zgodziła, przywraca ten rodzaj na
listę; akceptacja go z niej zdejmuje. Pole nie pojawia się na karcie osoby w panelu
administracji (`GET /admin/users/{id}`) — tam nie ma odbiorcy tej informacji, więc karta w
ogóle nie wykonuje zapytań, które by ją policzyły.

#### Zdarzenia audytu pakietu

- `legal_document.published` — administracja publikuje nową wersję dokumentu. Pola
  ładunku: `type`, `version`.
- `legal_document.accepted` — osoba akceptuje bieżącą wersję dokumentu. Pola ładunku:
  `type`, `version`.

Oba slugi są już w rejestrze §3.2 (aneks z 2026-09-17) — nie powtarzam tu drugiej
definicji, tylko domykam brakującą sekcję pakietu, do której ten wpis odsyłał.

## 3. Rejestry i słowniki (enums)

### 3.1 Typy powiadomień (`Notify::send`)

MVP hackathonowy — wszystkie typy obsługuje szyna H16; emitują pakiety-właściciele:
`application.accepted` `application.rejected` (H03) · `assignment.created`
`assignment.removed` (H09) · `course.invited` (H08) · `course.unlocked` (H05 —
happy path do demo dzwonka) · `question.asked` `question.answered` (H17) ·
`internship.accepted` `internship.returned` (H11) · `attempt.failed_final` (H10) ·
`certificate.ready` (H13) · `document.ready` (H14) · `profile.accepted`
`profile.returned` `profile.withdrawn` (H15) · `export.ready` (H01).
Po hackathonie: `access.expiring_30d/7d`, `supervision.reminder`.

### 3.2 Rejestr zdarzeń audytowych (`AuditLog::record`) — jedyne źródło prawdy

`application.accepted` `application.rejected` (H03) · `access.extended` (H04) ·
`course.created` `course.updated` `course.deleted` (H08) · `assignment.created`
`assignment.removed` (H09) · `attempt.finished` `attempts.reset`
`workshop.completed` (H10) · `internship.accepted` `internship.returned` (H11) ·
`supervisor.assigned` (H12/H18) · `certificate.issued` (H13) · `document.generated`
(H14) · `profile.accepted` `profile.returned` `profile.withdrawn` (H15) ·
`user.created` `user.updated`
`user.blocked` `user.unblocked` (H18) · `edition.updated` (H19) · `sensitive.viewed`
(H03/H15 — automatycznie przy wglądzie).

### 3.3 Klucze ustawień edycji (`Settings::edition(...)`)

`test_pass_threshold` (80) · `test_attempts_limit` (3) · `internship_hours_required`
(72) · `supervision_required_count` (6) · `reliability_threshold` (60) ·
`lesson_completion_percent` (60 — próg czasu aktywnego do „ukończ lekcję";
**inny** niż rzetelność).

### 3.4 Pozostałe słowniki

- `role`: `super_admin · project_manager · instructor · volunteer · student`
  (PL: Super Admin · Opiekun Projektu · Psycholog prowadzący · Wolontariusz · Student)
- `users.status`: `active · blocked` · `application.status`: `new · accepted · rejected`
- `internship.form`: `phone_duty` („dyżur telefoniczny") · `chat_duty` („czat") ·
  `other` („inna") — w bazie EN, etykiety PL na froncie
- `internship.status`: `submitted · accepted · returned` · `attendance`: `present · absent`
- `course.status` (wyliczane): `locked · in_progress · completed` ·
  `courses.type`: `course · webinar` · `product_group`: `psychon · dobrostan · both`
- `profile.status`: `draft · submitted · returned · accepted · published · withdrawn`
- `documents.type`: `volunteer_agreement` („porozumienie wolontariackie") ·
  `internship_certificate` („zaświadczenie o stażu")
- `certificate.status`: `valid · revoked` · klucze warunków certyfikatu:
  `courses · internship · supervision · workshop`
- `emails.status`: `queued · sent · failed · simulated`
- `lesson.video_status` (H08): `none · uploading · processing · ready · error` ·
  `publication_gap.code` (H08): `course_without_lessons · lesson_empty · recording_error ·
  recording_in_progress`
- `legal_document.type` (H22): `regulamin · polityka` · `legal_document_version.status`:
  `draft · published`

## 4. Czego nie robimy na hackathonie

Prawdziwe Bunny Stream (mock ze startera) · realna wysyłka e-maili (tylko `simulated`) ·
płatności · integracje zewnętrzne · 2FA · napisy do wideo · unieważnianie certyfikatów ·
anonimizacja RODO (art. 17) · ekran `#/admin/postepy` (zestawienie czterech filarów —
po hackathonie na `ProgressAggregator`) · czat pomocy · tokeny w ciasteczkach HttpOnly
(Bearer to świadome uproszczenie hackathonowe — do przeglądu po wydarzeniu).
Interfejsy są tak zaprojektowane, żeby po hackathonie podmienić mocki na realne
integracje bez zmiany kontraktu.

---

## Aneks z 2026-09-17 — siódma operacja stażu i sześć slugów audytu poza rejestrem

Data: 2026-09-17. Podstawa: pismo decyzyjne z 17.09.2026 (blok wieczorny)
oraz pomiar rejestru zdarzeń audytu z tego samego dnia; oba w wewnętrznym
rejestrze projektu, który nie jest częścią tego repozytorium.

Kod ma rację, ten aneks dogania kontrakt. Miejsc niżej nie usuwam — zapis
historyczny zostaje, ten blok jest wobec nich nadrzędny.

| Miejsce | Co mówi dokument | Jak jest naprawdę |
|---|---|---|
| wiersz 300 (§2 „Staż (H11)") | „H11 rejestruje dokładnie sześć operacji." | Operacji jest siedem. Siódma to trwałe odrzucenie wpisu — `POST /admin/internship/{id}/reject`. |
| wiersz 367 (§2 „Decyzje administracyjne") | „Obie decyzje są dostępne wyłącznie dla administracji..." (mowa tylko o `accept` i `return`) | Decyzje są trzy: akceptacja, odesłanie i odrzucenie. Każda działa tylko na wpisie w stanie `submitted`; po dowolnej z nich kolejna decyzja na tym samym wpisie zwraca `403 entry_locked`. |
| wiersz 509 (§3.4 „Pozostałe słowniki", `internship.status`) | `internship.status`: `submitted · accepted · returned` | Brakuje wartości `rejected`. Pełny słownik: `submitted · accepted · returned · rejected`. |
| wiersze 483-493 (§3.2 „Rejestr zdarzeń audytowych") | 24 slugi | Slugów jest 30. Brakuje sześciu: `internship.rejected`, `user.anonymized`, `supervision.attendance_marked`, `certificate.revoked`, `legal_document.published`, `legal_document.accepted`. |

### 1. Siódma operacja pakietu stażowego (H11): odrzucenie wpisu

Dopisać do §2 „Staż (H11)", w podsekcji „Decyzje administracyjne", jako
trzecią decyzję obok akceptacji i odesłania, tym samym stylem co pozostałe
dwie:

- `POST /admin/internship/{id}/reject` z wymaganym niepustym stringiem
  `{ "comment": "..." }` → `200` z pełnym zasobem administracyjnym po zmianie
  na `rejected`. Brak albo pusty komentarz → `422 validation_failed`.

Trasa zostaje w kontrakcie: to jedyny sposób administracji na ostateczne,
jednoznaczne „nie" wobec wadliwego wpisu — bez niej jedyną drogą zamknięcia
sprawy jest odesłanie do poprawy, które nie jest stanem końcowym i pozwala na
nieograniczoną liczbę ponownych prób.

Odrzucenie jest stanem końcowym: wpis `rejected` nie może być edytowany przez
osobę (`403 entry_locked`) ani ponownie rozstrzygnięty przez administrację —
tak samo jak `accepted`, i tak samo jak przy pozostałych dwóch decyzjach
dotyczy to wyłącznie wpisu w stanie `submitted`. Odrzucenie emituje wyłącznie
powiadomienie i audyt `internship.rejected`, oba przechodzą odpowiednio przez
`Notify::send` i `AuditLog::record`.

### 2. Wartość statusu wpisu stażu: `rejected`

Dopisać do §3.4 „Pozostałe słowniki": `internship.status`:
`submitted · accepted · returned · rejected`.

### 3. Sześć brakujących rodzajów zdarzeń audytu

Dopisać do §3.2 „Rejestr zdarzeń audytowych" — rejestr rośnie z 24 do 30
slugów. Sześć nowych, po ludzku i z nazwami pól ładunku (`details`), nigdy z
przykładowymi wartościami:

- `internship.rejected` (H11) — opiekun projektu albo super-admin odrzuca
  zgłoszony wpis w dzienniku stażu; trzecia możliwa decyzja obok akceptacji i
  odesłania. Pola ładunku: `entry_id`.
- `user.anonymized` (H18) — administracja bezpowrotnie anonimizuje konto na
  żądanie prawa do bycia zapomnianym. Bez ładunku — patrz reguła niżej.
- `supervision.attendance_marked` (H12) — zmiana obecności osoby na terminie
  superwizji. Pola ładunku: `slot_id`, `user_id`, `attendance_before`,
  `attendance_after`.
- `certificate.revoked` (H13) — administracja unieważnia już wydany
  certyfikat, z podanym powodem. Pola ładunku: `number`, `reason`.
  **Do zmiany.** `reason` jest dziś wolnym tekstem wpisywanym ręcznie, więc
  jest to jedno z miejsc w rejestrze, w których mogą wylądować dane
  osobowe — a rejestru zdarzeń nie da się poprawić ani wyczyścić. Docelowo
  ładunek niesie `number` i ewentualnie kod powodu ze słownika, a treść
  powodu żyje wyłącznie w rekordzie certyfikatu, skąd anonimizacja konta
  może ją usunąć. Ten opis mówi, jak jest dziś, nie jak ma być.

  **Errata 2026-09-18.** Poprzednie brzmienie tego akapitu mówiło, że jest to
  **jedyne** miejsce w całym rejestrze z wolnym tekstem. To było nieprawdą.
  Pomiar kodu daje **trzy** takie miejsca:

  | miejsce | pole | co wpisuje administracja |
  |---|---|---|
  | `Services/H13/CertificateRevoker.php` | `reason` | powód unieważnienia certyfikatu |
  | `Http/Controllers/Api/V1/Admin/AdminUserController.php` | `reason` | uzasadnienie zablokowania konta |
  | `Http/Controllers/Api/V1/AdminTestResetController.php` | `reason` | powód wyzerowania prób |

  Polecenie, którym to zmierzono, żeby dało się powtórzyć bez wiary na słowo:
  wypisz pliki wywołujące `AuditLog::record` i znajdź w nich pola `reason`
  trafiające do ładunku.

  Erratę zapisuję osobno, zamiast po cichu poprawić zdanie, bo **fałszywy opis
  jest groźniejszy od braku opisu**: zdanie „jedyne miejsce" zostałoby
  zacytowane jako stan faktyczny przy najbliższym przeglądzie ochrony danych,
  a dwa pozostałe miejsca nie trafiłyby do żadnej listy.

  **Wzorzec docelowy jest już w kodzie i warto go wskazać palcem, zamiast
  opisywać słowami.** Zwrot profilu psychologa (`profile.returned`,
  `Http/Controllers/Api/V1/H15/AdminProfileController.php`) przyjmuje od
  administracji dokładnie taki sam wolny tekst — i zapisuje go **do rekordu
  dziedzinowego**, a do ładunku rejestru wkłada wyłącznie identyfikator
  profilu. Tak mają wyglądać wszystkie trzy miejsca z tabeli.

  Zasada ogólna, wyprowadzona z tego pomiaru: **żadne pole, którego treść
  administracja wpisuje ręcznie w formularzu, nie należy do rejestru zdarzeń.**
  Rejestr przyjmuje identyfikatory, kody ze słowników zamkniętych i flagi.
  Treść wpisana ręcznie żyje w rekordzie dziedzinowym, skąd anonimizacja konta
  potrafi ją usunąć — z rejestru nie potrafi jej usunąć nic.
- `course.updated` (H08) — zmiana w kursie. **Jeden rodzaj, osiem różnych
  zdarzeń**, rozróżnianych wyłącznie polem `operation`. Pola ładunku:
  `operation` (obowiązkowe, słownik zamknięty) oraz identyfikator przedmiotu
  zmiany: `lesson_id`, `material_id` albo `course_id`, zależnie od operacji.

  **Słownik `operation` jest zamknięty. Wartość spoza słownika jest odrzucana
  przy zapisie, tak jak każde pole spoza listy dozwolonych.** Wolny tekst w tym
  polu nie występuje i nie wolno go wprowadzić.

  | kod | co się wydarzyło |
  |---|---|
  | `course.invited` | osoba zaproszona na kurs |
  | `lesson.created` | lekcja dodana |
  | `lesson.updated` | lekcja zmieniona |
  | `lesson.deleted` | lekcja usunięta |
  | `material.uploaded` | materiał wgrany |
  | `material.deleted` | materiał usunięty |
  | `lessons.reordered` | zmieniona kolejność lekcji w kursie |
  | `courses.reordered` | zmieniona kolejność kursów |

  **Identyfikator towarzyszący — reguła i jedyny wyjątek.** Każdy kod niesie
  **dokładnie jeden** identyfikator przedmiotu zmiany. Nigdy listy: lista
  identyfikatorów jest tym samym wolnym ładunkiem, który ten kontrakt wyklucza,
  tylko w innym przebraniu.

  Wyjątkiem jest **`courses.reordered`, który nie ma towarzysza — i to jest
  decyzja zmierzona, nie przeoczenie.** Pomiar: trasa przestawiająca kolejność
  kursów nie przyjmuje żadnego parametru, jej reguła sprawdzająca żąda wyłącznie
  listy kursów bez pola przedmiotu nadrzędnego, a sam kurs nie ma w zapleczu
  kolumny wiążącej go ze ścieżką ani z programem. Przedmiotem tej operacji jest
  **jedna globalna lista w całości**, a nie obiekt, który dałoby się nazwać.

  **Nie wolno wypełniać tego miejsca listą identyfikatorów kursów** ani dokładać
  czwartego pola po to, żeby tabela wyglądała równo. Puste miejsce bez powodu
  zostaje zapełnione — dlatego powód stoi tutaj, a nie w czyjejś pamięci.

  **Dlaczego to nie jest osiem osobnych rodzajów:** liczba rodzajów w rejestrze
  zostaje taka, jaka była, a rozróżnienie niesie pole. Słowniki po stronie
  interfejsu nie muszą znać ośmiu nowych nazw.

  **Dlaczego pole jest obowiązkowe, a nie mile widziane:** bez niego wszystkie
  osiem zapisów staje się w dzienniku nieodróżnialne — zostaje ta sama nazwa
  rodzaju i ten sam identyfikator kursu. Lista dozwolonych pól, która usuwa
  `operation`, nie chroni wtedy niczego, tylko **kasuje sens zdarzenia**.

  **Zbiór kodów w kodzie ma być równy zbiorowi kodów w tej tabeli** i ma tego
  pilnować przyrząd czerwieniejący **w obie strony**: gdy kod doda dziewiąty
  kod, i gdy tabela wymieni kod, którego w kodzie nie ma. Przyrząd pilnujący
  jednej strony przepuści rozjazd w drugą.

  **Skąd te osiem, a nie inna liczba** (pomiar 2026-09-18, powtarzalny): kody
  pochodzą z odczytania wszystkich miejsc zapisujących ten rodzaj, wraz
  z rozwinięciem dwóch, które podstawiają kod przez zmienną, a nie literałem —
  `Services/H08/LessonWriter.php` i `Services/H08/MaterialStore.php`. Sam odczyt
  literałów dałby **pięć** kodów i trzy operacje zniknęłyby z dziennika po cichu:
  usunięcie lekcji, usunięcie materiału i jedna z dwóch zmian kolejności.

- `legal_document.published` (H22) — administracja publikuje nową wersję
  dokumentu prawnego (regulamin/polityka). Pola ładunku: `type`, `version`.
- `legal_document.accepted` (H22) — osoba akceptuje bieżącą wersję dokumentu
  prawnego. Pola ładunku: `type`, `version`.

Pakiet H22 (dokumenty prawne) ma teraz własną sekcję w §2 („Dokumenty prawne
(H22)") — uzupełniona osobno, zgodnie z zapowiedzią w tym akapicie; ten wpis w
rejestrze zostaje, sekcja go nie zastępuje.

### 4. Reguła: anonimizacja konta zapisuje zdarzenie bez ładunku

Zdarzenie `user.anonymized` zapisuje się w rejestrze audytu **bez ładunku**
(`details = null`) i tak ma zostać. Uzasadnienie: ładunek zdarzenia o
anonimizacji sam niósłby dane, które anonimizacja ma usunąć — zapisanie ich
w `audit_log` unieważniłoby cel operacji. Jedynym śladem pozostają standardowe
kolumny każdego wpisu audytu (`actor_id`, `subject_type`, `subject_id`,
`created_at`), które wskazują na wiersz `User`, ale nie niosą jego treści.

---

## Aneks z 2026-09-28 — ustawienia powiadomień administracji (H16)

Nowy wyjątek singletonowy, tego samego kształtu co `/admin/edition` i
`/admin/onboarding` — jedna edycja naraz, trasa nie przyjmuje identyfikatora.

### 1. Trasy

- `GET /admin/notification-settings` → 200
  `{ "data": { "types": [ { "type": "application.accepted", "enabled": true }, … ],
  "supervision_reminder": { "enabled": true, "send_at": "08:00" } } }`.
- `PATCH /admin/notification-settings`, te same pola, częściowo → 200 z pełnym
  stanem po zapisie.
- Dostęp: `project_manager`, `super_admin`; inne role → 403 `forbidden`.
- `types` to typy z §3.1 **bez** `supervision.reminder`, który ma wyłącznie
  własny blok. Typ spoza tej listy, `supervision.reminder` w `types` albo
  `send_at` spoza wzorca `HH:00` (00–23, strefa `config('app.timezone')`) →
  422 `validation_failed`.

### 2. Zapis

Tabela `settings`, jeden klucz `notification_settings` (JSON), wzorzec
`OnboardingContent`. Brak wiersza = obecne zachowanie sprzed tej zmiany:
wszystkie typy włączone, przypomnienie o superwizji włączone, `08:00`.
`Settings::edition` (sygnatura zamrożona) bez zmian.

### 3. Skutek

- Typ wyłączony przez administrację: `Notify::send` nie tworzy ani wpisu
  dzwonka, ani e-maila. Preferencje osoby (`/notifications/preferences`)
  działają tylko wewnątrz typów włączonych przez administrację.
- E-maile startera (aktywacja, reset hasła) są poza `Notify` i nie są
  przełączane tym panelem.
- `supervision:send-reminders` działa w harmonogramie co godzinę. Wysyła,
  gdy blok jest włączony i bieżąca godzina (strefa `config('app.timezone')`)
  jest równa albo późniejsza niż `send_at`. Idempotencję nadal daje istniejące
  `reminder_sent_at` — zmiana `send_at` w ciągu dnia nie gubi przypomnień.
- `supervision.reminder` przechodzi w §3.1 z „Po hackathonie” do MVP: kod już
  go emituje (`SendSupervisionReminders.php`).

### 4. Audyt

Nowy slug `notification_settings.updated` w §3.2 (administracja zmienia
ustawienia powiadomień). Pola ładunku: kody typów z ich flagami (`types`) i
blok `supervision_reminder` (`enabled`, `send_at`) — bez wolnego tekstu,
zgodnie z zasadą ogólną z erraty 2026-09-18.

---

## Aneks z 2026-09-28 (2) — zgłoszenia dalszej współpracy (H01)

Zał. 1 wymaga formularza zgłoszenia dalszej współpracy na ekranie po programie.
Zgłoszenie trafia do panelu administracji ze statusem i możliwością odpowiedzi.

### 1. Trasy

- `POST /cooperation-requests` — złożenie zgłoszenia przez osobę zalogowaną.
- `GET /cooperation-requests/mine` — własne zgłoszenia (koperta `{data}`,
  paginacja jak w innych listach).
- `GET /admin/cooperation-requests` — lista wszystkich zgłoszeń, filtr
  `?status=`, standardowa paginacja.
- `PATCH /admin/cooperation-requests/{id}` — decyzja administracji, pola
  `response` (string, do 2000 znaków) i `status` ∈ `answered · closed`.

### 2. Uprawnienia

Trasy administracyjne wymagają roli `project_manager` albo `super_admin`.
Trasy osoby (`POST /cooperation-requests`, `GET /cooperation-requests/mine`)
działają bez middleware `access.active`: po zakończeniu programu dostęp do
kursów może już wygasnąć, a zgłoszenie dalszej współpracy ma zostać osiągalne
mimo to (ten sam powód co przy `/me` i eksporcie RODO w H01).

### 3. Wyjątek nazewniczy

`PATCH /admin/cooperation-requests/{id}` jest legalnym wyjątkiem od reguły
„akcja domenowa jako `POST` na pod-zasób”, obok `PATCH .../attendance` — to
zmiana stanu rekordu razem z treścią odpowiedzi, a nie akcja bez danych.
Nowych wyjątków ten aneks nie tworzy.

### 4. Kody

- `403 program_not_completed` — zgłoszenie przed zakończeniem programu.
- `409 cooperation_request_open` — osoba ma już jedno otwarte zgłoszenie.
- `403 cooperation_request_closed` — próba odpowiedzi na zgłoszenie już
  zamknięte.
- `404 not_found` — nieznany albo cudzy identyfikator.

Te cztery kody dopisane do przykładów tabeli §1.1.

### 5. Rejestry

- **§3.1** (typy `Notify::send`): `cooperation_request.answered`.
- **§3.2** (rejestr audytu): `cooperation_request.created`,
  `cooperation_request.answered`.
- **§3.4** (słowniki): `cooperation_request.status`: `new · answered · closed`.

### 6. Lista przełączników ustawień powiadomień (H16)

`NotificationSettings::TYPES` (panel `GET`/`PATCH /admin/notification-settings`,
poprzedni aneks tej daty) rośnie o dwie pozycje zdecydowane wprost, nie
„automatycznie”: `cooperation_request.answered` (ten aneks) i
`internship.rejected` (aneks z 2026-09-17, dotąd pominięty przy zakładaniu
panelu) — lista rośnie z 17 do 19. Osobną decyzją dochodzi `supervision.slot_cancelled`
(H12 — termin superwizji odwołany przez prowadzącego albo administrację, typ i
slug audytu już emitowane przez kod) — lista rośnie do **20**. `supervision.reminder`
nadal ma wyłącznie własny blok i nie wchodzi do `TYPES`.

---

## Aneks z 2026-09-28 — źródła liczb osoby (H18)

`GET /admin/users/{id}/number-sources` → 200 — dostęp wyłącznie dla
`project_manager` i `super_admin`; nieznana osoba → 404 `not_found`. Odpowiedź
niesie pięć sekcji, każda w kształcie `{ "rows": [...], "sum": ... }`, sekcja
`workshop` dodatkowo `"done"`. Każdy wiersz ma dokładnie te pola:

- `date` (`YYYY-MM-DD` albo `null`) i `occurred_at` (znacznik ISO 8601 UTC
  albo `null`) — dokładnie jedno z obu jest niepuste w każdym wierszu; sekcja
  `hours_accepted` niesie `date`, pozostałe cztery sekcje niosą `occurred_at`.
- `value` — dla `hours_accepted` godziny jako dziesiętny string (jak wszędzie
  indziej w kontrakcie); w pozostałych sekcjach liczba całkowita właściwa
  danej sekcji.
- `state` — kod ze słownika zamkniętego danej sekcji (patrz niżej); pole nie
  jest wolnym tekstem.
- `form` — kod `internship.form` wyłącznie w sekcji `hours_accepted`; w
  pozostałych czterech sekcjach zawsze `null`.
- `label` — tekst do wyświetlenia (imię i nazwisko prowadzącego/oznaczającego
  albo tytuł kursu) albo `null`, gdy sekcja nie ma naturalnej etykiety.

Pole `source` **nie istnieje** w tym kształcie — zastąpione parą `form`/`label`
powyżej.

### Wiersze są dokładnie rekordami źródłowymi liczby

Każda sekcja pokazuje wyłącznie te rekordy, z których policzona jest jej
`sum` — żadnych dodatkowych ani pominiętych: `hours_accepted` to wpisy stażu
w stanie `accepted` (nie `submitted` ani `returned`); `supervision_present`
to zapisy na superwizję z `attendance = present` i aktywne (`cancelled_at`
puste); `workshop` to komplety `WorkshopCompletion` (dziś co najwyżej jeden
na edycję); `passed_tests` to kursy ścieżki z testem, dla których
`CourseAccess::testPassed()` jest prawdziwe, po jednym wierszu na kurs, ze
wskazaniem najwcześniejszej zaliczającej próby; `reliability` to ukończone
lekcje z dodatnim `duration_seconds`, tak samo jak liczy je
`ProgressAggregator::reliabilityPercent()`.

### Punkt 4 — `sum` jest tą samą liczbą co gdzie indziej, nigdy drugą definicją

| sekcja | `sum` liczony dokładnie jak | ta sama liczba na |
|---|---|---|
| `hours_accepted` | `ProgressAggregator::for()['hours_accepted']` | karta osoby (`GET /admin/users/{id}` → `data.progress.hours_accepted`) |
| `supervision_present` | `ProgressAggregator::for()['supervision_present']` | karta osoby → `data.progress.supervision_present` |
| `workshop` (`done`) | `ProgressAggregator::for()['workshop_done']` | karta osoby → `data.progress.workshop_done` |
| `passed_tests` | `ProgressAggregator::for()['path_tests_passed']` — **nie** `ProgressAggregator::passedTestsCount()`, która liczy inną wielkość (zaliczone testy na całej platformie, bez mianownika ścieżki) | karta osoby → `data.progress.path_tests_passed` |
| `reliability` | `ProgressAggregator::reliabilityPercent()` — string albo `null`, stosunek nie suma kolumny `value` | `GET /admin/reliability/{userId}` → `data.reliability_percent` |

### Słownik `state` — jawnie, po sekcji (odczytany z kodu, nie wymyślony)

Każda sekcja pokazuje wyłącznie rekordy uwzględnione w jej `sum` (patrz wyżej),
dlatego dziś każda z nich niesie w praktyce dokładnie jedną wartość `state`:

- `hours_accepted` → `accepted` (sekcja filtruje `internship.status = accepted`
  przed zbudowaniem wierszy; pełny słownik pola w bazie to
  `submitted · accepted · returned · rejected`, ale tu nigdy nie zobaczysz nic
  poza `accepted`).
- `supervision_present` → `present` (sekcja filtruje `attendance = present`;
  pełny słownik pola to `present · absent`).
- `workshop` → `completed` (jedyna wartość, jaką niesie ukończenie warsztatu).
- `passed_tests` → `passed` (sekcja filtruje próby zaliczające).
- `reliability` → `completed` (sekcja pokazuje wyłącznie ukończone lekcje).

### Osoba bez rekordów danej sekcji

Sekcja jest obecna zawsze, z `rows: []`; liczbowe `sum` wynosi `0` (`"0"` dla
`hours_accepted`, liczba całkowita `0` dla pozostałych trzech), `workshop.done`
wynosi `false`, a `reliability.sum` wynosi `null` — dokładnie ten sam `null`,
który niesie `reliability_percent` osoby bez mierzalnej ukończonej lekcji.

---

## Aneks z 2026-09-28 (4) — raport w układzie grantodawcy (H20), układ ogólny MVP

`GET /admin/report/grantor?from=&to=` → 200
`{"data":{"period":{"from","to"},"indicators":{...}}}` oraz
`GET /admin/report/grantor/export.csv?from=&to=` (wspólny helper CSV z §1: BOM,
`;`, `text/csv; charset=utf-8`) — w istniejącej grupie
`role:project_manager,super_admin` pakietu H20. `from`/`to` opcjonalne, format
`YYYY-MM-DD`; data początkowa późniejsza niż końcowa, zły format albo parametr
spoza tych dwóch → 422 `validation_failed`.

Wskaźniki (`indicators`): `participants_by_status` (`accepted`, `in_program`,
`completed`, `removed`), `tests_passed_total`, `certificates_issued_total`,
`supervisions_confirmed_total` — wyłącznie liczby zbiorcze, zero danych
osobowych w odpowiedzi i w pliku CSV (żadnego identyfikatora, imienia,
nazwiska ani e-maila). Każdy wskaźnik wspólny z `GET /admin/report` albo z
kartą osoby (`GET /admin/users/{id}`) pochodzi z tego samego źródła co jego
odpowiednik — bez drugiej reguły liczenia.

Układ ogólny MVP; wzór konkretnego grantodawcy wymaga osobnego uzgodnienia
(Zał. 2 umowy) i jest poza MVP.

Odczyt, bez audytu i bez powiadomień (jak H07).

---

## Aneks — prowadzący zakłada własny kurs (H08/H09)

`POST /instructor/courses` w grupie `role:instructor` — prowadzący zakłada nowy kurs. `201` w
kopercie `{"data": ...}`, ten sam zasób co odpowiedź `POST /admin/courses`.

Pola dozwolone w ciele: `title` (wymagane, string, do 255 znaków), `slug` (wymagany, string,
`alpha_dash`, do 255 znaków, unikalny w `courses`), `description` (opcjonalny, string albo
`null`), `type` (opcjonalny, `course` albo `webinar`) — te same reguły i komunikaty co
`POST /admin/courses`.

Pola zakazane (`prohibited`, każde osobno → `422 validation_failed`): `is_published`,
`instructor_id`, `lesson_id`, `assigned_by`, `assigned_at`, `sequence_order`, `product_group`.
Stan i przypisanie ustawia wyłącznie serwer — wejście nigdy ich nie niesie.

Kurs powstaje zawsze jako szkic (`is_published: false`) — ta sama reguła co
`POST /admin/courses` (kurs bez lekcji nie może być opublikowany). Zakładający zostaje od razu
przypisany jako jego prowadzący, tą samą ścieżką przypisań co administracja (H09):
`assignment.created` w rejestrze audytu (§3.2) i w typach powiadomień (§3.1) — bez nowego kodu
błędu, sluga audytu ani typu powiadomienia. Publikacja i kolejność w ścieżce zostają przy
administracji.

Kod: `Http/Requests/H08/InstructorStoreCourseRequest.php`,
`Services/H08/InstructorCourseAssignment.php`,
`Http/Controllers/Api/V1/H08/InstructorCourseController.php::store`.

---

## Aneks — tematy kursu (H05, H06, H08)

Warstwa między kursem a lekcjami: kurs → tematy → lekcje. Zmiana jest addytywna —
dotychczasowe pola, trasy i kody zostają bez zmian. Bez nowego kodu błędu, sluga audytu
ani typu powiadomienia.

### 1. Odczyt uczestnika

`GET /courses/{slug}` niesie dodatkowo `topics` — żywe tematy kursu rosnąco po `position`
— a każda lekcja w `lessons` dodatkowo `topic_id` (liczba albo `null`). `lessons` zostaje
płaską listą w kolejności `sequence_order`; ta kolejność jest spłaszczona (najpierw
kolejność tematów, potem kolejność lekcji w temacie), więc grupowanie po `topic_id` jej nie
zmienia. Każdy element `materials` niesie dodatkowo `lesson_id`: liczbę dla materiału lekcji
albo `null` dla materiału całego kursu.

```json
{ "data": { "…pola bez zmian…": "…",
  "topics": [ { "id": 7, "title": "Lekcje kursu", "position": 1 } ],
  "lessons": [ { "id": 21, "title": "…", "sequence_order": 1, "duration_seconds": 1800,
                 "is_completed": true, "topic_id": 7 } ],
  "materials": [ { "id": 3, "name": "Karta pracy.pdf", "size": 245760,
                   "lesson_id": null, "download_url": "<podpisany, wygasa>" } ] } }
```

`GET /lessons/{id}` niesie dodatkowo `topic`: `{ "id", "title", "position" }` albo `null`.

Widoczność tematów jest tą samą regułą co `GET /courses/{slug}` (katalog i dostęp kursu);
uczestnik nie ma trasy czytającej temat po identyfikatorze. Kody obu tras bez zmian:
`200`, `401 unauthenticated`, `403 course_locked`, `404 not_found`.

### 2. Zapis tematów — administracja i prowadzący własnego kursu

Te same trasy w dwóch grupach: `/admin/…` (`project_manager`, `super_admin`) oraz
`/instructor/…` (`instructor`). Parametry `{course}` i `{topic}` są liczbami.

| Trasa | Ciało | Sukces | Błędy |
|---|---|---|---|
| `GET …/courses/{course}/topics` | — | `200 {data:[Topic]}` | 401, 403, 404 |
| `POST …/courses/{course}/topics` | `{ "title" }` | `201 {data:Topic}` | 401, 403, 404, 422 `validation_failed` |
| `PATCH …/topics/{topic}` | `{ "title" }` | `200 {data:Topic}` | 401, 403, 404, 422 `validation_failed` |
| `DELETE …/topics/{topic}` | — | `200 {data:{id, deleted:true}}` | 401, 403, 404, 422 `conditions_not_met` |
| `PATCH …/courses/{course}/topics/reorder` | `{ "topics": [ { "id", "lesson_ids": [...] } ] }` | `200 {data:[Topic]}` | 401, 403, 404, 422 `validation_failed` |

`Topic` = `{ "id", "course_id", "title", "position", "lesson_ids", "created_at",
"updated_at" }`; `lesson_ids` to żywe lekcje tematu w jego kolejności. Lista tematów nie
jest stronicowana (jak lista lekcji kursu). `title` jest wymagany, string, do 255 znaków.
Nowy temat trafia na koniec kursu. Usunięcie jest miękkie i dotyczy wyłącznie tematu bez
żywych lekcji — temat z lekcjami daje `422 conditions_not_met` bez zmian; pozostałe tematy
dostają ciągłą numerację `position`.

`PATCH …/topics/reorder` jest tym samym legalnym wyjątkiem nazewniczym co
`PATCH …/reorder` z §1, nie nowym wyjątkiem. Jedno żądanie niesie cały układ kursu:
`topics` musi być pełną permutacją żywych tematów kursu, a suma wszystkich `lesson_ids` —
pełną permutacją żywych lekcji kursu (pusta lista lekcji tematu jest dozwolona).
Przeniesienie lekcji między tematami jest tą samą operacją. Brak, obcy identyfikator albo
duplikat → `422 validation_failed` (`errors.topics` albo pole ciała), bez żadnej zmiany i bez
wpisu audytu. `position`, pozycję lekcji w temacie i spłaszczony `sequence_order` nadaje
wyłącznie serwer.

Dostęp: brak tokenu → `401 unauthenticated`; rola spoza grupy trasy → `403 forbidden`,
zanim cokolwiek zostanie odczytane. Dla prowadzącego kurs albo temat bez jego aktywnego
przypisania na poziomie kursu wygląda jak nieistniejący: identyczne `404 not_found`
(„Nie znaleziono zasobu.”), także przy niepoprawnym ciele żądania — odmowa pada przed
walidacją ciała i niczego nie zapisuje.

### 3. Trasy lekcji (H08) — uzupełnienia

- `POST …/courses/{course}/lessons` przyjmuje opcjonalne `topic_id` — żywy temat tego kursu;
  temat obcy albo nieistniejący → `422 validation_failed` na polu `topic_id`. Bez `topic_id`
  lekcja trafia na koniec ostatniego tematu; kurs bez tematu dostaje temat domyślny
  „Lekcje kursu”. `topic_position` jest zakazane (`prohibited`).
- `PATCH …/lessons/{lesson}`: `topic_id` i `topic_position` są zakazane (`prohibited` →
  `422 validation_failed`); układ w tematach zmienia wyłącznie `…/topics/reorder`.
- Zasób lekcji administracji i prowadzącego niesie dodatkowo `topic_id` i `topic_position`.
- Kurs z więcej niż jednym tematem: jawny `sequence_order` w `POST`/`PATCH` lekcji oraz
  `PATCH /admin/courses/{course}/lessons/reorder` → `422 validation_failed`. Kurs z jednym
  tematem działa jak dotąd, a pozycje lekcji w temacie idą za `sequence_order`.

### 4. Audyt

Każda operacja zapisu tematu zapisuje slug `course.updated` z rejestru §3.2, podmiotem jest
kurs. Słownik kodów operacji rośnie z 8 do 12:

| kod | co się wydarzyło | towarzysz |
|---|---|---|
| `topic.created` | temat dodany | `topic_id` |
| `topic.updated` | tytuł tematu zmieniony | `topic_id` |
| `topic.deleted` | temat usunięty | `topic_id` |
| `topics.reordered` | zmieniony układ tematów i lekcji w tematach | `course_id` |

`topic_id` jest nowym dozwolonym polem towarzyszącym. Każdy kod niesie dokładnie jeden
identyfikator, nigdy listę. Kod operacji zapisuje dziś pole `op` — to samo, którym zapisują
się pozostałe operacje na treści kursu; wyrównanie nazwy pola do `operation` z tabeli
aneksu z 2026-09-17 obejmie wszystkie kody naraz.

### 5. Dane

Nowa tabela `course_topics` (`course_id`, `title`, `position`, miękkie usuwanie, unikat
`(course_id, position)` wśród żywych) oraz kolumny `lessons.topic_id` i
`lessons.topic_position` (obie nullable, unikat `(topic_id, topic_position)` wśród żywych).
Migracja zakłada jeden temat domyślny „Lekcje kursu” dla każdego kursu z lekcjami; postęp
(`lesson_progress`) wiąże się wyłącznie przez `lesson_id` i nie zmienia się.

Kod: `Services/H08/TopicWriter.php`, `Services/H08/TopicLayout.php`,
`Services/H08/TopicScope.php`, `Http/Controllers/Api/V1/Admin/CourseTopicAdminController.php`,
`Http/Controllers/Api/V1/H08/InstructorCourseTopicController.php`.

---

## Aneks — treść lekcji (H06, H08)

Lekcja dostaje pole `content` — treść lekcji w podzbiorze Markdown. `description` zostaje
krótkim opisem lekcji. Zmiana jest addytywna: bez nowych tras, kodów błędu, slugów audytu
i typów powiadomień.

### 1. Pole

- `content`: string albo `null` (lekcja bez treści ma `null`).
- Limit: **20 000 znaków** (znaków, nie bajtów — 20 000 znaków wielobajtowych, np. `ż`,
  mieści się w limicie). Przekroczenie → `422 validation_failed` z błędem na polu
  `errors.content`; nic nie jest zapisywane.
- Serwer zapisuje treść **dokładnie tak, jak przyszła**: nie przycina białych znaków,
  nie czyści i nie odrzuca treści za HTML. Pusty string jest zapisywany jako `null`.

### 2. Podzbiór Markdown

Akapity (rozdzielone pustym wierszem) · nagłówki `##` i `###` · `**pogrubienie**` ·
`*kursywa*` · listy punktowane `- ` i numerowane `1. ` · `` `kod w linii` `` · twarde
łamanie wiersza (dwie spacje albo `\` na końcu wiersza) · linki `[tekst](adres)`
wyłącznie dla `https:`, `http:`, `mailto:` i ścieżek zaczynających się od jednego `/`.
Link z innym schematem (w tym `javascript:`, `data:`, `vbscript:` w dowolnej wielkości
liter i z białymi znakami) klient pokazuje jako sam tekst linku, bez odnośnika. Linki
zewnętrzne (`https:`, `http:`) dostają `rel="noopener noreferrer"`. Obrazów, tabel,
bloków HTML i surowego HTML w podzbiorze **nie ma** — taki zapis zostaje dosłownym
tekstem.

**HTML w treści jest tekstem.** Odpowiedź zaplecza niesie `content` bajt w bajt tak,
jak został zapisany (JSON, bez escapowania HTML i bez przycinania); klient nie
interpretuje HTML — `<script>` czy `<img onerror>` w treści są wyświetlane jako tekst.

### 3. Trasy

Odczyt — pole `content` niesie:

- `GET /lessons/{id}` (obok `description`),
- zasób lekcji administracji i prowadzącego: odpowiedzi `POST /admin/courses/{course}/lessons`,
  `PATCH /admin/lessons/{lesson}`, `POST /instructor/courses/{course}/lessons`,
  `PATCH /instructor/lessons/{lesson}` oraz listy
  `GET /admin/courses/{course}/lessons` i `GET /instructor/courses/{course}/lessons`
  (edytor potrzebuje treści), a także odpowiedź `PATCH /admin/courses/{course}/lessons/reorder`.

Lista lekcji uczestnika w `GET /courses/{slug}` (`data.lessons`) **nie niesie** `content`
— treść do 20 000 znaków na lekcję jest czytana wyłącznie przez `GET /lessons/{id}`.

Zapis — te same istniejące trasy lekcji przyjmują opcjonalne `content`
(`POST`/`PATCH` administracji i prowadzącego wymienione wyżej).

### 4. Audyt

Bez zmian rodzaju i pól: zapis lekcji dalej emituje `course.updated` z `op`
(`lesson.created`/`lesson.updated`) i `lesson_id`. Treść wpisana ręcznie **nie trafia**
do ładunku audytu — zgodnie z zasadą ogólną z erraty 2026-09-18.

### 5. Dane

Migracja addytywna `2026_09_29_130000_add_content_to_lessons_table.php`: kolumna
`lessons.content` (`text`, nullable); `down()` usuwa wyłącznie tę kolumnę.

Kod: `Http/Requests/H08/StoreLessonRequest.php`, `Http/Requests/H08/UpdateLessonRequest.php`
(trasy prowadzącego dziedziczą reguły), `Http/Requests/Concerns/KeepsLessonContentVerbatim.php`,
`Http/Resources/H08/AdminLessonResource.php`, `routes/api/h06.php`; front:
`frontend/design-system/molekuly/TrescLekcji/`.

---

## Aneks — wzory dokumentów: edytor administracji

Trzy trasy edytora wzorów dokumentów generowanych dla osoby (porozumienie, zaświadczenie o
stażu, certyfikat). Aneks opisuje stan kodu; nie dodaje sluga audytu ani typu powiadomienia.

### 1. Trasy

Wszystkie w grupie `role:project_manager,super_admin` (brak tokenu → `401 unauthenticated`,
inna rola → `403 forbidden`), pod flagą `features.document_templates`.

- `GET /document-templates/{type}` → `200 {data: Wzor}`.
- `PUT /document-templates/{type}` z ciałem `{ "content": "..." }` → `200 {data: Wzor}` po
  zapisie nowej wersji. Limit: **20 żądań na minutę na osobę**.
- `GET /document-templates/{type}/versions` → `200 {data: [Wersja]}`, od najnowszej, bez
  stronicowania.

`{type}` jest słownikiem zamkniętym: `agreement · attendance_certificate · certificate`.
Rodzaj spoza słownika → `404 not_found` („Nie znaleziono zasobu.”) na każdej z trzech tras.

### 2. Zasoby

`Wzor` = `{ "type", "content", "version", "updated_at", "updated_by", "current_version_unused" }`.
`Wersja` = `{ "version", "updated_at", "updated_by" }`. `updated_at` — ISO 8601 UTC;
`updated_by` — `{ "id", "name" }` albo `null`.

`current_version_unused` (wartość logiczna): `true` oznacza, że bieżąca treść ma stary zapis
i **nie jest używana** — dokumenty tego rodzaju powstają z wzoru domyślnego z repozytorium.
Ten sam warunek stosuje generator, więc pole i generowanie nie mogą się rozjechać.

### 3. Zapis treści

`content`: wymagany string, od 1 do **20 000 znaków**. Treść z bazy **nigdy nie jest
kompilowana ani wykonywana** — serwer podstawia w niej wyłącznie pola zapisane dokładnie jako
`{{ $nazwa }}`, z listy pól danego rodzaju dokumentu.

Odmowa zapisu → `422 validation_failed` w standardowej kopercie, zdanie w `errors.content`,
nic nie jest zapisywane:

- pole spoza listy rodzaju: „Pole „…” nie istnieje w tym dokumencie.”;
- zapis `{!! … !!}`;
- podwójne nawiasy klamrowe otaczające cokolwiek poza nazwą pola (wyrażenie, wartość
  domyślna, komentarz);
- znaczniki `<?` albo `?>`;
- słowo zaczynające się od znaku `@` (adres e-mail jest dozwolony).

Każde z tych zdań kończy się dopiskiem z listą pól dostępnych w tym rodzaju dokumentu.

Po regule pól serwer wykonuje **próbne generowanie** dokumentu z danych przykładowych. Gdy
się nie powiedzie → `422 validation_failed`, `errors.content[0]` = „Z tego wzoru nie da się
wygenerować dokumentu. Usuń odwołania do plików i adresów; obrazy tylko osadzone w treści.”

```json
{ "error": { "status": 422, "code": "validation_failed",
    "message": "Popraw zaznaczone pola.",
    "errors": { "content": ["Treść nie może zawierać znaczników „<?” ani „?>”. …"] } } }
```

### 4. Limit żądań

Przekroczenie limitu zapisu → **429** `too_many_requests`; odmowy `422` liczą się do limitu.
`reason` ma dokładnie jeden klucz — liczbę sekund do następnej próby (liczba całkowita 1–60):

```json
{ "error": { "status": 429, "code": "too_many_requests",
    "message": "Zbyt wiele żądań. Spróbuj ponownie za chwilę.",
    "reason": { "retry_after_seconds": 42 } } }
```

Kod `429 too_many_requests` dochodzi do tabeli §1.1 jako „przekroczony limit żądań trasy”.

### 5. Czego ten aneks nie wprowadza

Zapis wzoru nie emituje dziś zdarzenia audytu ani powiadomienia — slug i ładunek dojdą
osobnym aneksem razem ze zmianą kodu. Trasy „przywróć wzór domyślny” nie ma.

Kod: `routes/api/document_templates.php`,
`Http/Controllers/Api/V1/DocumentTemplateController.php`,
`Http/Requests/DocumentTemplates/UpdateDocumentTemplateRequest.php`,
`Http/Resources/DocumentTemplateResource.php`,
`Services/DocumentTemplates/DocumentTemplateFields.php`,
`Services/DocumentTemplates/DocumentTemplateTrial.php`.

---

## Aneks — nagranie lekcji tylko z wgrania (H08)

Identyfikator nagrania lekcji (`video_provider_id`) nadaje serwer w ścieżce wgrania pliku.
Trasy zapisu lekcji nie przyjmują go od prowadzącego, a u administracji pilnują, żeby jedno
nagranie nie było przypisane do dwóch lekcji. Aneks opisuje stan kodu: bez nowych tras, kodów
błędu, slugów audytu i typów powiadomień; zero zmian w danych.

### 1. Prowadzący

- `POST /instructor/courses/{course}/lessons`: każda niepusta wartość `video_provider_id` →
  `422 validation_failed`, lekcja nie powstaje.
- `PATCH /instructor/lessons/{lesson}`: pole nieobecne albo równe zapisanej wartości → `200`
  bez zmiany nagrania. Każda inna wartość — także `null` albo pusty napis przy lekcji, która
  ma nagranie — → `422 validation_failed`, kolumna bez zmian.

Zdanie odmowy jest jedno dla wszystkich przypadków i nie ujawnia, czy podany identyfikator
istnieje:

```json
{ "error": { "status": 422, "code": "validation_failed",
    "message": "Popraw zaznaczone pola.",
    "errors": { "video_provider_id": [
      "Nagranie do lekcji przypisuje administracja. Tego pola nie można tutaj zmienić." ] } } }
```

### 2. Administracja

`POST /admin/courses/{course}/lessons` i `PATCH /admin/lessons/{lesson}`: identyfikator
przypisany już do innej żywej lekcji → `422 validation_failed` w tej samej kopercie, zdanie
w `errors.video_provider_id`: „Ten identyfikator nagrania jest już przypisany do innej
lekcji.” Wartość niezmieniona przechodzi zawsze; `null` odpina nagranie; identyfikator
lekcji usuniętej jest wolny.

### 3. Czego ten aneks nie wprowadza

Niepowtarzalności nie pilnuje jeszcze indeks w bazie (dwa równoległe żądania administracji
mogą ją ominąć), porównanie rozróżnia wielkość liter, a ścieżka wgrania nie sprawdza, czy
identyfikator jest już przypisany — domknięcie przyjdzie osobnym aneksem razem ze zmianą
kodu i danych.

Kod: `Rules/RecordingAssignedByAdministration.php`, `Rules/RecordingIdNotTaken.php`,
`Http/Requests/H08/StoreInstructorLessonRequest.php`,
`Http/Requests/H08/UpdateInstructorLessonRequest.php`,
`Http/Requests/H08/StoreLessonRequest.php`, `Http/Requests/H08/UpdateLessonRequest.php`.

---

## Aneks — lista materiałów lekcji (H08)

Ekran edycji lekcji w panelu administracji dostaje listę materiałów lekcji, także tych
wgranych wcześniej. Zmiana jest addytywna: jedna nowa trasa odczytu, dotychczasowe trasy,
pola i kody zostają bez zmian. Bez nowego kodu błędu, sluga audytu ani typu powiadomienia.

### 1. Trasa i role

`GET /admin/lessons/{lesson}/materials` → `200 {"data": [AdminMaterial]}`.

Trasa leży w grupie administracji H08, obok tras zapisu i usunięcia materiałów, i wymaga
roli `project_manager` albo `super_admin`. `{lesson}` jest liczbą. Brak tokenu → `401
unauthenticated`; każda inna rola (`volunteer`, `student`, `instructor`) → `403 forbidden`,
zanim cokolwiek zostanie odczytane z bazy.

### 2. Element listy

`AdminMaterial` to ten sam zasób, który zwracają `POST /admin/lessons/{lesson}/materials` i
`POST /admin/courses/{course}/materials` — dokładnie pola `id`, `name`, `mime`, `size`,
`lesson_id`, `course_id`, `created_at`, bez żadnej zmiany. Element nie zawiera
`download_url`, ścieżki ani nazwy dysku, ani treści pliku: panel nie pobiera plików, a
podpisany link pobrania należy do ścieżki uczestnika (`GET /materials/{id}/download`, H05).

```json
{ "data": [
  { "id": 12, "name": "Karta pracy.pdf", "mime": "application/pdf", "size": 245760,
    "lesson_id": 21, "course_id": null, "created_at": "2026-10-01T10:00:00Z" },
  { "id": 15, "name": "Slajdy.pdf", "mime": "application/pdf", "size": 1048576,
    "lesson_id": 21, "course_id": null, "created_at": "2026-10-01T10:05:00Z" } ] }
```

### 3. Zakres, kolejność i ograniczenie

- Lista obejmuje wyłącznie żywe materiały tej lekcji (`lesson_id` równe `{lesson}`).
  Materiały innych lekcji i materiały wpięte wprost w kurs nie wchodzą. Materiał nie ma
  miękkiego usuwania — usunięcie (`DELETE /admin/materials/{id}`) jest twarde, więc usunięty
  materiał nie występuje na liście.
- Kolejność: `created_at` rosnąco, przy remisie `id` rosnąco.
- Bez stronicowania i bez `meta`. Odpowiedź ma twarde ograniczenie **200 pozycji**,
  nakładane w zapytaniu do bazy (`limit 200`), nie przez obcięcie wczytanej kolekcji; przy
  większej liczbie materiałów lekcji zwracane jest 200 najstarszych.
- Parametry query są ignorowane, jak w pozostałych trasach H08: nie zmieniają wyniku i nie
  dają `422`.
- Pusta lekcja → `200 {"data": []}`.
- Trasa nie sprawdza zgodności lekcji z kursem z adresu ekranu; robi to ekran istniejącym
  stanem „nie znaleziono”.

### 4. Kody

`200` · `401 unauthenticated` · `403 forbidden` · `404 not_found` w standardowej kopercie
(„Nie znaleziono zasobu.”) dla lekcji nieistniejącej, usuniętej miękko, a także dla
identyfikatora nieliczbowego albo spoza zakresu liczb całkowitych. Trasa nie zwraca `422`.

### 5. Odczyt bez skutków ubocznych

Odczyt nie emituje audytu ani powiadomień i niczego nie zapisuje do bazy.

### 6. Prowadzący

Odpowiednik dla prowadzącego (`/instructor/…`) jest planowany razem z ekranem prowadzącego;
ten aneks go nie wprowadza i trasa `GET /instructor/lessons/{lesson}/materials` nie istnieje.

Kod: `routes/api/h08.php`,
`Http/Controllers/Api/V1/Admin/MaterialAdminController.php::indexForLesson`,
`Http/Resources/H08/AdminMaterialResource.php` (bez zmian), `openapi.json`.

---

## Aneks — identyfikator nagrania niepowtarzalny w bazie (H08)

Domyka punkt 3 („Czego ten aneks nie wprowadza”) aneksu „nagranie lekcji tylko
z wgrania”: niepowtarzalności identyfikatora nagrania pilnuje teraz indeks bazy,
porównanie nie rozróżnia wielkości liter, a ścieżka wgrania nie przypisze
identyfikatora, który trzyma już inna lekcja. Aneks opisuje stan kodu: bez nowych
tras, kodów błędu, slugów audytu i typów powiadomień.

### 1. Zapis małymi literami

Identyfikator nagrania (`lessons.video_provider_id`) trafia do bazy w postaci
znormalizowanej: bez białych znaków na brzegach i małymi literami; pusta wartość
znaczy „brak nagrania” (`null`). Dotyczy każdego zapisu kolumny z API:

- zapisu lekcji w panelu administracji i w panelu prowadzącego
  (`POST`/`PATCH` lekcji),
- ścieżki wgrania (`POST /admin/lessons/{id}/video-uploads`).

Odpowiedź zasobu lekcji niesie wartość zapisaną, a odczyty (stan przetwarzania,
link do odtwarzania) używają wartości zapisanej. Wzorzec kształtu (od 1 do 64
znaków z klasy `A-Z a-z 0-9 -`) bez zmian: wielkie litery są przyjmowane, ale
zapisywane małymi.

Zwrot identyfikatora różniącego się od zapisanego wyłącznie wielkością liter nie
jest zmianą nagrania: wartość zapisana wcześniej z wielkimi literami zostaje bez
zmian, zamiast przepisywać się przy edycji innego pola. W odpowiedzi ścieżki
wgrania `video_id` i podpis TUS niosą identyfikator tak, jak zwrócił go dostawca;
do lekcji trafia jego postać znormalizowana.

### 2. Porównanie bez rozróżniania wielkości liter

Reguła „już przypisany” w żądaniach administracji porównuje postać
znormalizowaną: `MOCK-ABC` przy zajętym `mock-abc` — tak samo jak ` mock-abc `
z białymi znakami na brzegach — daje `422 validation_failed` z dotychczasowym
zdaniem w `errors.video_provider_id`:

```json
{ "error": { "status": 422, "code": "validation_failed",
    "message": "Popraw zaznaczone pola.",
    "errors": { "video_provider_id": [
      "Ten identyfikator nagrania jest już przypisany do innej lekcji." ] } } }
```

Reguła prowadzącego (aneks „nagranie lekcji tylko z wgrania”) jest bez zmian:
prowadzący może odesłać wyłącznie wartość zapisaną.

### 3. Wyścig po przejściu reguły żądania: 422

Dwa równoczesne zapisy tego samego, wolnego jeszcze identyfikatora do dwóch
lekcji mogą oba przejść regułę żądania. Przegrany w bazie zapis (naruszenie
indeksu z punktu 5) kończy się tą samą odmową co reguła: `422 validation_failed`,
błąd na `video_provider_id`, to samo zdanie i ta sama koperta — zamiast `500`.
Nic nie jest zapisywane. Rozpoznanie idzie po NAZWIE indeksu: naruszenie innego
indeksu (np. kolejności lekcji w kursie) nie jest nazywane zajętym nagraniem.

### 4. Ścieżka wgrania: 502 `bunny_error`

Gdy dostawca nagrań zwróci identyfikator, który trzyma już inna żywa lekcja
(po zrównaniu wielkości liter), trasa wgrania zwraca `502 bunny_error` ze zdaniem
„Bunny Stream zwrócił identyfikator nagrania, który jest już przypisany do innej
lekcji.” Lekcja zostaje bez zmian. Ten sam identyfikator we własnej lekcji nie
jest błędem; identyfikator lekcji usuniętej jest wolny.

### 5. Dane

Migracja addytywna `2026_10_01_205639_add_unique_recording_id_index_to_lessons.php`
zakłada indeks częściowy `lessons_video_provider_id_unique`:

```sql
CREATE UNIQUE INDEX lessons_video_provider_id_unique
ON lessons (lower(video_provider_id))
WHERE deleted_at IS NULL AND video_provider_id IS NOT NULL AND video_provider_id <> ''
```

Indeks dotyczy tylko żywych lekcji z niepustym identyfikatorem — wiele lekcji bez
nagrania jest normalne, a lekcja usunięta miękko zwalnia identyfikator. `down()`
usuwa wyłącznie ten indeks. Migracja nie zmienia danych: gdy w żywych lekcjach
znajdzie powtórzony identyfikator (po zrównaniu wielkości liter), zatrzymuje się
z liczbą powtórzeń w komunikacie — bez wartości identyfikatorów — i niczego nie
zakłada.

### 6. Czego ten aneks nie wprowadza

Zastane identyfikatory z wielkimi literami nie są przepisywane (migracja nie
zmienia danych); zapis przepisuje je dopiero przy faktycznej zmianie nagrania.
Ścieżka przywrócenia lekcji usuniętej miękko w kodzie nie istnieje — gdyby
powstała, baza odrzuci przywrócenie nad lekcją trzymającą ten sam identyfikator.
Wideo utworzone u dostawcy, którego identyfikator został odrzucony w punkcie 4,
nie jest usuwane po stronie dostawcy.

Kod: `Services/Video/VideoProviderId.php`, `Services/H08/RecordingIdIndex.php`,
`Services/H08/LessonWriter.php`, `Rules/RecordingIdNotTaken.php`,
`Http/Controllers/Api/V1/Admin/BunnyVideoAdminController.php`.

---

## Aneks — stan nagrania lekcji (H08)

Lekcja pamięta stan swojego nagrania w bazie, nowe nagranie zastępuje dotychczasowe dopiero
po gotowości, a publikacja kursu i lista braków liczą się jedną regułą po stronie serwera.
Bez nowych tras, slugów audytu i typów powiadomień. Wcześniejsze aneksy o nagraniu obowiązują;
ten zmienia je tylko tam, gdzie mówi to wprost.

### 1. Stan nagrania — pola

Słownik zamknięty `lesson.video_status`: `none · uploading · processing · ready · error`
(brak nagrania · plik w drodze do dostawcy · dostawca przetwarza · gotowe · błąd). Wartość
`null` znaczy „stan jeszcze nieustalony”: lekcja ma nagranie sprzed tej zmiany, o którego
stan nikt jeszcze nie zapytał. Takie nagranie jest traktowane jak grające.

Zastane nagranie (przypisane przed wprowadzeniem stanu) ma stan nieznany i wydaje link do
odtwarzania jak dotąd. Pierwszy odczyt stanu przez administrację ustala stan według dostawcy
i od tej chwili link zależy od stanu.

Lekcja ma nagranie **odtwarzane** (`video_provider_id`) i co najwyżej jedno nagranie
**w drodze** — wysyłane albo przetwarzane obok odtwarzanego. Identyfikator nagrania w drodze
nie jest polem żadnego zasobu.

Zasób lekcji administracji i prowadzącego (te same trasy co w aneksie o treści lekcji)
niesie dodatkowo, po `updated_at`:

- `video_status` — stan **najnowszego** nagrania lekcji (nagrania w drodze, jeśli jest; w
  przeciwnym razie odtwarzanego): wartość ze słownika albo `null`;
- `video_status_at` — chwila ostatniej zmiany stanu, ISO 8601 UTC, albo `null`;
- `video_ready` — wartość logiczna: lekcja ma nagranie, do którego uczestnik dostaje link;
- `video_pending` — wartość logiczna: lekcja ma nagranie w drodze.

`GET /lessons/{id}` (uczestnik) niesie dodatkowo `video_status` — zawsze wartość ze
słownika, nigdy `null`: `ready` **dokładnie wtedy**, gdy `GET /lessons/{id}/video-link` wyda
link (także w czasie wymiany nagrania i dla nagrania o stanie nieustalonym); `none`, gdy
lekcja nie ma nagrania; w pozostałych przypadkach stan nagrania, na które lekcja czeka.
Uczestnik nie dostaje `video_status_at` ani identyfikatorów.

Ręczna zmiana `video_provider_id` przez administrację (`PATCH /admin/lessons/{lesson}`)
ustawia stan z powrotem na nieustalony (`null`). Identyfikator, który inna żywa lekcja ma
jako nagranie w drodze, jest odrzucany tym samym `422 validation_failed` i tym samym zdaniem
co identyfikator zajęty jako odtwarzany.

### 2. `GET /admin/lessons/{lesson}/video-status`

Prawdą jest stan w bazie. Odpowiedź `200`:

```json
{ "data": { "status": "processing", "duration_seconds": 1800,
  "preview_embed_url": "<podpisany, wygasa>",
  "video_status": "processing", "video_status_at": "2026-10-01T12:00:00Z",
  "video_ready": true, "video_pending": true } }
```

Lekcja bez nagrania: `{ "data": { "status": "no_video", "video_status": "none",
"video_status_at": null, "video_ready": false, "video_pending": false } }`.

- `status` zostaje dla dotychczasowych klientów: `no_video · processing · finished · error`,
  wyliczane z `video_status` (`ready` → `finished`, `error` → `error`, reszta →
  `processing`).
- `preview_embed_url` dotyczy nagrania odtwarzanego; `null`, gdy lekcja go nie ma.
- Serwer pyta dostawcę wyłącznie dla stanów `uploading`, `processing` i nieustalonego, i nie
  częściej niż **raz na 30 sekund na lekcję** (`services.bunny.status_refresh_seconds`).
  Stany `ready`, `error` i `none` nie pytają dostawcy nigdy — także na żądanie. Z dwóch
  równoczesnych odczytów tej samej lekcji dostawcę pyta jeden.
- Dostawca nie odpowiada albo odpowiada błędem → `200` ze stanem z bazy; stan i
  `video_status_at` zostają bez zmian. (Dotąd: `502 bunny_error`.)
- Stan dostawcy spoza znanej listy jest zapisywany jako `processing`, nigdy `ready`.
- **Podmiana:** odczyt, który pierwszy zobaczy nagranie w drodze jako gotowe, w tej samej
  transakcji robi z niego nagranie odtwarzane i zapisuje jego czas trwania w
  `duration_seconds`. Nigdy wcześniej. Błąd nagrania w drodze nie rusza odtwarzanego.

### 3. Link uczestnika — `GET /lessons/{id}/video-link`

Link dotyczy wyłącznie nagrania odtwarzanego i jest wydawany, gdy jest ono gotowe albo ma
stan nieustalony. W czasie wymiany uczestnik dostaje link do **dotychczasowego** nagrania.

- Lekcja ma nagranie, ale żadnego gotowego (wysyłane, przetwarzane, z błędem) →
  **404** `video_not_ready`, komunikat „Nagranie w przygotowaniu.”. Status jest ten sam co
  przy istniejącym `video_missing` na tej trasie; oba przypadki rozróżnia wyłącznie `code`.
- Lekcja bez nagrania → jak dotąd `404 video_missing`.
- Lekcja z nagraniem sprzed tej zmiany (stan nieustalony, `video_status` puste w bazie)
  dostaje link jak dotąd; wydanie linku niczego nie zapisuje.

Trasa nie pyta dostawcy.

### 4. Wysyłka i jej wznowienie — `POST /admin/lessons/{lesson}/video-uploads`

Ciało bez zmian (`{ "title" }`). Odpowiedź `201` niesie dodatkowo `resumed` (wartość
logiczna):

```json
{ "data": { "video_id": "…", "upload_url": "https://video.bunnycdn.com/tusupload",
  "library_id": "…", "expiration_time": 1790000000, "signature": "…", "resumed": false } }
```

- Rozpoczęcie wysyłki **nie zmienia** `video_provider_id`: nowe nagranie staje się
  nagraniem w drodze w stanie `uploading`. Wyjątek: dotychczasowe nagranie, o którym
  wiadomo, że nie gra (stan `error`, `processing` albo `uploading`), jest przy tym
  odpinane.
- **Wznowienie:** gdy lekcja ma nagranie w drodze w stanie `uploading`, założone mniej niż
  **6 godzin** temu, odpowiedź niesie uprawnienie dla **tego samego** `video_id`
  (`resumed: true`) i u dostawcy nie powstaje nowe nagranie. Nagranie starsze, w stanie
  `error` albo już przetwarzane → nowe nagranie (`resumed: false`), które zastępuje
  poprzednie nagranie w drodze.
- Podpis jest liczony przy każdym wydaniu od nowa. Serwer nie zapisuje i nie zwraca niczego,
  co pozwalałoby wysyłać bez ponownego uprawnienia.
- Identyfikator od dostawcy, który inna żywa lekcja ma już jako odtwarzany albo w drodze →
  `502 bunny_error`, lekcja bez zmian.
- Identyfikator nagrania w drodze jest zapisywany tak samo jak odtwarzany: bez białych
  znaków na brzegach i **małymi literami**. Ścieżka wysyłki nie zapisuje już
  `video_provider_id` (punkt 1 aneksu „identyfikator nagrania niepowtarzalny w bazie” w
  części o ścieżce wgrania): identyfikator trafia do niego dopiero przy podmianie, w tej
  samej, znormalizowanej postaci. Przy wznowieniu `video_id` i podpis niosą postać zapisaną.
- Niepowtarzalności pilnują dwa indeksy bazy — nagrania odtwarzanego
  (`lessons_video_provider_id_unique`) i nagrania w drodze
  (`lessons_video_pending_id_unique`). Wyścig przegrany na którymkolwiek z nich przy
  rozpoczęciu wysyłki daje to samo `502 bunny_error` z tym samym zdaniem, lekcja bez zmian.
  Wyścig przegrany na indeksie nagrania odtwarzanego przy podmianie niczego nie zapisuje:
  lekcja zachowuje dotychczasowe nagranie odtwarzane i nagranie w drodze.
- Zapis lekcji przez administrację odmawia identyfikatora, który inna żywa lekcja ma jako
  odtwarzany **albo w drodze** — `422 validation_failed` z dotychczasowym zdaniem w
  `errors.video_provider_id`, bez ujawniania, w której kolumnie stoi identyfikator.

### 5. Braki kursu i reguła publikacji

Zasób kursu administracji i prowadzącego (`GET`/`POST`/`PATCH /admin/courses…`,
`/instructor/courses…`, lista `GET /admin/courses`) niesie dodatkowo `publication_gaps`:

```json
"publication_gaps": {
  "blocking": [ { "code": "lesson_empty", "lesson_id": 21 } ],
  "waiting":  [ { "code": "recording_in_progress", "lesson_id": 22 } ] }
```

Słownik zamknięty `publication_gap.code`; `lesson_id` to liczba albo `null` (brak dotyczy
całego kursu). Wpisy stoją w kolejności lekcji.

| grupa | kod | kiedy |
|---|---|---|
| `blocking` | `course_without_lessons` | kurs nie ma żadnej lekcji (`lesson_id: null`) |
| `blocking` | `lesson_empty` | lekcja bez nagrania i bez treści (`content` puste albo same białe znaki) |
| `blocking` | `recording_error` | nagranie w stanie `error`, lekcja nie ma gotowego |
| `waiting` | `recording_in_progress` | nagranie `uploading` albo `processing`, lekcja nie ma gotowego |

Lekcja z samą treścią, bez nagrania, nie jest brakiem. Lekcja z gotowym nagraniem nie jest
brakiem także wtedy, gdy jej nowe nagranie jest w drodze albo skończyło się błędem.

**Publikacja** (`PATCH /admin/courses/{course}` z `is_published: true` dla kursu
nieopublikowanego, `POST /admin/courses` z `is_published: true`) odmawia tą samą regułą:
niepusta grupa `blocking` → `422 conditions_not_met`. `reason` niesie dwa pola:

- `reason.items` — nowe pole: **dokładnie** lista `blocking` z zasobu kursu (obiekty
  `{ "code", "lesson_id" }`, słownik `publication_gap.code` z tabeli wyżej, kolejność lekcji);
- `reason.missing` — pole dotychczasowe, bez zmiany kształtu: **lista napisów**. Kurs bez
  lekcji daje dokładnie `["lessons"]`, jak dotąd. Pozostałe braki blokujące dają swoje kody
  (`lesson_empty`, `recording_error`) — każdy kod raz, w kolejności pierwszego wystąpienia.
  Pełny słownik wartości pola: `lessons · lesson_empty · recording_error`.

```json
{ "error": { "status": 422, "code": "conditions_not_met",
    "message": "Uzupełnij lekcje wskazane na liście braków, zanim opublikujesz kurs.",
    "reason": {
      "missing": [ "lesson_empty", "recording_error" ],
      "items": [ { "code": "lesson_empty", "lesson_id": 21 },
                 { "code": "recording_error", "lesson_id": 24 },
                 { "code": "lesson_empty", "lesson_id": 25 } ] } } }
```

Kurs bez lekcji — komunikat i `reason.missing` bez zmian, obok nowe `reason.items`:

```json
{ "error": { "status": 422, "code": "conditions_not_met",
    "message": "Dodaj co najmniej jedną lekcję, zanim opublikujesz kurs.",
    "reason": { "missing": [ "lessons" ],
                "items": [ { "code": "course_without_lessons", "lesson_id": null } ] } } }
```

Ekran, który zna tylko `reason.missing`, działa jak dotąd: dla `lessons` pokazuje własne
zdanie, dla pozostałych wartości — `message` serwera. Grupa `waiting` nie
blokuje. Kurs już opublikowany nie jest cofany ani blokowany w edycji, gdy brak pojawi się
później — pokazuje go `publication_gaps`. Wyliczenie braków czyta wyłącznie bazę.

### 6. Dane

Migracja addytywna `2026_10_01_213000_add_recording_state_to_lessons_table.php`: kolumny
`lessons.video_status` (słownik pilnowany ograniczeniem tabeli), `lessons.video_status_at`,
`lessons.video_pending_id` — wszystkie nullable, bez przepisywania istniejących wierszy —
oraz indeks niepowtarzalności identyfikatora nagrania w drodze wśród żywych lekcji, bez
rozróżniania wielkości liter. `down()` usuwa wyłącznie te obiekty.

Kod: `Services/Video/RecordingStatus.php`, `Services/Video/LessonRecording.php`,
`Services/Video/RecordingStateRefresher.php`, `Services/H08/CoursePublicationGaps.php`,
`Services/H08/CourseWriter.php`, `Rules/RecordingIdNotOnItsWay.php`,
`Http/Controllers/Api/V1/Admin/BunnyVideoAdminController.php`,
`Http/Controllers/Api/V1/VideoTokenController.php`.

---

## Aneks — wzory dokumentów: obrazy i pliki we wzorze, wzór zbyt złożony

Uzupełnia aneks „wzory dokumentów: edytor administracji”. Tamtego tekstu nie usuwam — zapis
historyczny zostaje, ten blok jest wobec niego nadrzędny w dwóch miejscach: zdanie odmowy
próbnego generowania (§3 tamtego aneksu) ma nowe brzmienie, a odwołanie do pliku albo obraz
osadzony w treści wzoru nie jest już powodem odmowy zapisu. Bez nowych tras, kodów błędu,
slugów audytu i typów powiadomień; zero zmian w danych.

### 1. Zasada

Dokument generowany z wzoru **nie wczytuje obrazów ani plików wskazanych we wzorze**. Jedyny
obraz w dokumencie to kod QR certyfikatu, który wstawia system. Zapora stoi w generowaniu
dokumentu, a nie w odpowiedzi zapisu: zapis wzoru z takim odwołaniem przechodzi, a zasób
jest przy generowaniu pomijany — bez komunikatu dla osoby zapisującej.

### 2. Zapis wzoru — `PUT /document-templates/{type}`

| Treść wzoru | Odpowiedź | Dokument |
|---|---|---|
| tło (`url()` w atrybucie `style` albo w bloku `<style>`) wskazujące plik: ścieżka bezwzględna, ścieżka względna, `file://`, `phar://` | `200`, nowa wersja zapisana | powstaje z tej treści, zasób pominięty |
| `<img>` wskazujący plik (ścieżka, `phar://`) albo adres `ftp://` | `200`, nowa wersja zapisana | powstaje z tej treści, zasób pominięty |
| `<link rel="stylesheet">` wskazujący `phar://` | `200`, nowa wersja zapisana | powstaje z tej treści, zasób pominięty |
| obraz osadzony w treści (`data:` — PNG, JPEG, SVG) w `<img>` albo jako tło | `200`, nowa wersja zapisana | powstaje z tej treści, zasób pominięty |
| tło wskazujące adres sieciowy (`http://`, `https://`, `ftp://`) | `422 validation_failed`, nic nie jest zapisywane | — |
| treść ponad limit złożoności (pkt 3) | `422 validation_failed`, nic nie jest zapisywane | — |

Odpowiedź zapisu — kod i treść — **nie zależy od tego, czy wskazany plik istnieje na
serwerze**: ta sama treść daje tę samą odpowiedź `200`, gdy pliku nie ma i gdy jest.

Odmowa dla tła z adresem sieciowym ma zdanie w `errors.content[0]`:

„Z tego wzoru nie da się wygenerować dokumentu. Wzór nie wczytuje obrazów ani plików — usuń
odwołania do adresów. Jedyny obraz w dokumencie to kod QR, który wstawia system.”

To samo zdanie dostaje każda inna treść, na której próbne generowanie kończy się błędem.
Odmowa nie zapisuje wersji ani wpisu audytu.

### 3. Wzór zbyt złożony

W próbnym generowaniu serwer liczy złożoność treści. Przekroczenie dowolnego limitu →
`422 validation_failed` (istniejący kod, standardowa koperta), nic nie jest zapisywane,
`errors.content[0]` =

„Wzór jest zbyt złożony, żeby wygenerować z niego dokument: ma za dużo elementów, zbyt
głębokie zagnieżdżenie, zbyt duże scalenie komórek tabeli albo za dużo stron.”

| Limit | Wartość |
|---|---|
| elementy dokumentu | 2000 |
| głębokość zagnieżdżenia elementów | 40 |
| `colspan` albo `rowspan` jednej komórki | 50 |
| suma pól (`colspan` × `rowspan`) wszystkich scalonych komórek | 2000 |
| strony dokumentu | 40 |

Elementy, głębokość i scalenia są liczone przed ułożeniem stron; strony — w jego trakcie, na
pierwszej stronie ponad limit.

```json
{ "error": { "status": 422, "code": "validation_failed",
    "message": "Popraw zaznaczone pola.",
    "errors": { "content": ["Wzór jest zbyt złożony, żeby wygenerować z niego dokument: …"] } } }
```

### 4. Generowanie dokumentu

- `GET /documents/{document}/download` (adres podpisany) → `200` także wtedy, gdy treść wzoru w bazie nie daje się
  wygenerować albo przekracza limit z pkt 3 (treść wstawiona z pominięciem trasy zapisu):
  dokument powstaje wtedy z wzoru domyślnego z repozytorium, a w dzienniku błędów zostaje
  jeden wpis z rodzajem wzoru, numerem wersji i klasą wyjątku — bez treści wzoru i bez danych
  osoby.
- Certyfikat: kod QR jest wstawiany przez system i jest jedynym obrazem, który generowanie
  wczytuje. Lista dozwolonych obrazów jest ustalana osobno dla każdego generowania i niesie
  wyłącznie kod QR tego certyfikatu.
- Wartość pola dłuższa niż wiersz (ciąg bez spacji) jest w dokumencie łamana na kolejne
  wiersze — tak samo dla wzoru domyślnego i dla wzoru zapisanego w bazie.
- Tekst w akapicie przechodzi na kolejne strony.
- Wiersz tabeli nie jest dzielony między strony: wartość w komórce tabeli dłuższa niż
  miejsce do końca strony nie jest widoczna w całości. To zastane ograniczenie silnika
  generowania, nie reguła wzoru.
- Pola walidowane mają najwyżej 255 znaków; wartość tej długości jest widoczna w całości
  w każdym wzorze domyślnym.

### 5. Czego ten aneks nie wprowadza

Edytor nie mówi osobie zapisującej, że obraz albo plik z jej wzoru zostanie pominięty —
komunikat o tym dojdzie osobnym aneksem razem ze zmianą kodu.

Kod: `Support/PdfService.php`, `Services/DocumentTemplates/DocumentCostLimit.php`,
`Services/DocumentTemplates/DocumentTemplateTrial.php`,
`Services/DocumentTemplates/DocumentTemplateSampleData.php`, `Jobs/GenerateCertificate.php`,
`routes/api/document_templates.php`, `routes/api/h14.php`.

---

## Aneks — wgranie nagrania lekcji także przez opiekuna projektu (H08)

Zlecenie wgrania nagrania lekcji, dotąd dostępne wyłącznie dla `super_admin`, dostępne jest
teraz dla obu ról administracji. Zmienia się wyłącznie próg roli trasy; limity treści i
odmowy treści zostają bez zmian. Bez nowych kodów błędu, slugów audytu i typów powiadomień;
zero zmian w danych.

### 1. Trasa i role

`POST /admin/lessons/{lesson}/video-uploads` — role `project_manager` i `super_admin`, ten
sam próg co reszta tras zarządzania kursami (`role:project_manager,super_admin`). Odczyt
stanu `GET /admin/lessons/{lesson}/video-status` ma ten sam próg i nie zmienia się. Rolę rozstrzyga wyłącznie pośrednik trasy: w kontrolerze ani w usłudze nagrań nie ma
drugiego sprawdzenia roli.

### 2. Kody

| Sytuacja | Kod | `code` |
|---|---|---|
| brak albo nieważny token (także konto zablokowane) | **401** | `unauthenticated` |
| rola spoza `project_manager` i `super_admin` | **403** | `forbidden` |
| nieznana albo usunięta lekcja (rola administracji) | **404** | `not_found` |

Rola spoza grupy dostaje odmowę bez żadnego żądania do dostawcy nagrań i bez zmiany lekcji.
Rozwiązanie parametru `{lesson}` poprzedza pośrednika roli (tak jest na wszystkich trasach
administracji), więc dla lekcji nieistniejącej osoba spoza grupy może dostać `404 not_found`
zamiast `403 forbidden` — w obu przypadkach żądanie do dostawcy nagrań nie wychodzi.

### 3. Kształt i zachowanie wobec dostawcy

Ten aneks zmienia wyłącznie próg roli trasy. Kształt żądania i odpowiedzi, zasady wysyłki
i jej wznowienia oraz stan nagrania opisuje aneks „stan nagrania lekcji” powyżej; ten aneks
mu nie przeczy i go nie powtarza. Odmowy treści działają u obu ról tak samo: multipart z
załącznikiem → `422 no_direct_upload`, ciało ponad limit → `413 payload_too_large`, nieznane
pole → `422 invalid_payload`. Klucz dostawcy nie wraca w odpowiedzi.

Kod: `routes/api/video.php`, `Http/Controllers/Api/V1/Admin/BunnyVideoAdminController.php`.

---

## Aneks — ukończenie lekcji, pozycja odtwarzania i pytania do lekcji (H06, H17)

Aneks opisuje stan kodu. Zmiana jest addytywna wobec trasy i kształtu: bez nowych tras,
kodów błędu, slugów audytu i typów powiadomień; zero zmian w danych. Zdanie z §2 „Postęp
lekcji (H06)” — „Lekcja z `duration_seconds = 0` nigdy nie jest `completable`; próba
ukończenia również zwraca 422 `not_enough_active_time`” — zostaje w mocy dla każdej lekcji
**z nagraniem**; dla lekcji **bez nagrania** uchyla je punkt 1.

### 1. Reguła ukończenia lekcji zależy od stanu nagrania

Stan nagrania lekcji dla uczestnika to `video_status` z odczytu `GET /lessons/{id}`
(aneks „stan nagrania lekcji”): jedna reguła, ta sama dla odczytu, zapisu postępu i
ukończenia. Pole `completable` w `GET /lessons/{id}` i w odpowiedzi
`POST /lessons/{id}/progress` oraz wynik `POST /lessons/{id}/complete` rozstrzyga wyłącznie
ona:

| `video_status` | `completable` | `POST /lessons/{id}/complete` |
|---|---|---|
| `none` (lekcja bez nagrania) | `true` od razu, niezależnie od `duration_seconds` i czasu aktywnego | `200` |
| `uploading`, `processing` (nagranie w przygotowaniu, lekcja nie ma gotowego) | `false` | `422 not_enough_active_time` |
| `error` (nagranie z błędem, lekcja nie ma gotowego) | `false` | `422 not_enough_active_time` |
| `ready` (także nagranie zastane o stanie nieustalonym, traktowane jak grające) | `true`, gdy `duration_seconds > 0` i `active_seconds` ≥ `ceil(duration_seconds × completable_at_percent / 100)`; w przeciwnym razie `false` | od progu `200`; poniżej progu albo przy `duration_seconds = 0` `422 not_enough_active_time` |

Szczegóły:

- Ukończenie lekcji bez nagrania niczego nie dopisuje do czasu aktywnego: `active_seconds`
  i `watched_seconds` zostają, jakie były; zapisuje się wyłącznie ukończenie
  (`is_completed`, `completed_at`). Powtórne ukończenie jest idempotentne (`200`, ten sam
  `completed_at`).
- Lekcja, która dostaje nagranie (wysyłka w drodze), przestaje być do ukończenia bez
  czasu aktywnego od chwili, gdy jej `video_status` przestaje być `none`. Lekcja już
  ukończona zostaje ukończona.
- Postęp kursu, kolejność etapów w ścieżce (`CourseAccess::state`) i warunki certyfikatu
  liczą lekcję ukończoną bez nagrania tak samo jak każdą inną ukończoną lekcję. Reguła
  rzetelności (`ProgressAggregator::reliabilityPercent`, H07) tym aneksem się nie zmienia.
- Kody błędu bez zmian: do ukończenia, które się nie powiodło, służy dotychczasowy
  `422 not_enough_active_time`.

### 2. `position_seconds`

- `POST /lessons/{id}/progress` przyjmuje opcjonalne `position_seconds` — liczbę całkowitą
  ≥ 0, bezwzględną pozycję odtwarzacza w sekundach. Pozycja jest **nadpisywana**, nie
  sumowana, i wolno jej maleć (przewinięcie wstecz); liczniki `watched_delta` i
  `active_delta` działają jak dotąd. Pole nieobecne zostawia pozycję bez zmiany. Wartość
  nie będąca liczbą całkowitą albo ujemna → `422 validation_failed`.
- `GET /lessons/{id}` niesie `position_seconds` (liczba całkowita, `0` bez postępu) obok
  `watched_seconds` i `active_seconds`. Odpowiedź zapisu postępu pozycji nie niesie.

### 3. `GET /lessons/{id}/questions`

Własne pytania osoby do jednej lekcji → `200 { "data": [Pytanie], "meta": { …paginacja… } }`.

- Role: `volunteer`, `student` (inna rola → `403 forbidden`); brak tokenu → `401
  unauthenticated`; wygasły dostęp → `403 access_expired`. Dostęp do lekcji — ta sama reguła
  co treść lekcji: lekcja nieistniejąca albo spoza zasięgu osoby → `404 not_found`, kurs
  zablokowany kolejnością → `403 course_locked`.
- Lista obejmuje wyłącznie pytania zalogowanej osoby do tej lekcji, od najnowszego
  (`created_at` malejąco, przy remisie `id` malejąco). `?per_page` domyślnie 25; wartość
  poza zakresem 1–100 jest przycinana do zakresu, bez `422`. Pusta lista → `data: []`.
- `Pytanie` = `{ "id", "lesson_id", "question", "answer", "answered_by_name",
  "answered_at", "created_at", "updated_at" }`. `answer`, `answered_by_name` i
  `answered_at` są `null` do chwili odpowiedzi; pola czasu to ISO 8601 UTC.
  `answered_by_name` to imię i nazwisko odpowiadającego — bez jego identyfikatora i adresu
  e-mail.
- `POST /lessons/{id}/questions` z `{ "question" }` (wymagany napis, 1–2000 znaków po
  przycięciu białych znaków; naruszenie → `422 validation_failed`) → `201` z jednym
  `Pytanie` w tym samym kształcie.

### 7. `GET /lessons/{id}/video-link` — link do nagrania

Role: osoby z dostępem do lekcji (ta sama reguła co `GET /lessons/{id}`). `200`:

```json
{ "data": { "url": "<podpisany adres listy odtwarzania>", "expires_at": 1790007200,
  "video_id": "mock-nagranie", "embed_url": "https://iframe.mediadelivery.net/embed/<biblioteka>/<nagranie>?token=<podpis>&expires=1790007200",
  "embed_expires_at": 1790007200 } }
```

- `url`, `expires_at` i `video_id` bez zmian. `embed_url` jest podpisanym adresem ramki
  odtwarzacza dostawcy dla tego samego nagrania (odtwarzanego — w czasie wymiany nagrania
  nadal dotychczasowego); host ramki jest stały po stronie serwera, nie z konfiguracji.
- `embed_expires_at` jest czasem uniksowym (liczba całkowita) w tym samym formacie co
  `expires_at` i wskazuje **tę samą chwilę** — oba adresy wydawane są jednym podpisem czasu.
  Podgląd administracji (`preview_embed_url`) ma własny, krótszy czas życia i nie zmienia się.
- Odmowy bez zmian i bez żadnego adresu w odpowiedzi: `401 unauthenticated`, `403
  course_locked`, `404 not_found` (lekcja spoza zasięgu), `404 video_missing` (lekcja bez
  nagrania), `404 video_not_ready` (nagranie w przygotowaniu albo z błędem, bez gotowego),
  `503 video_not_configured` (brak konfiguracji podpisu).
- Trasa nie pyta dostawcy; stan nagrania pochodzi z bazy.

### 8. Pola odczytu lekcji — `GET /lessons/{id}` i `POST /lessons/{id}/progress`

Zmiana addytywna: dotychczasowe pola, kody i reguła dostępu bez zmian.

`GET /lessons/{id}` niesie dodatkowo:

```json
{ "data": { "…pola bez zmian…": "…",
  "course": { "id": 2, "slug": "wywiad-psychologiczny", "title": "Wywiad psychologiczny" },
  "required_active_seconds": 360,
  "question_addressee": { "name": "Marta Zielińska" } } }
```

- `course` — `{ id, slug, title }` kursu lekcji (okruszki, powrót do kursu, adres testu). Pole
  niczego nie otwiera: dostęp do lekcji rozstrzyga ta sama reguła co dotąd — kurs
  zablokowany kolejnością nadal daje `403 course_locked`, kurs spoza zasięgu `404 not_found`,
  a odpowiedź odmowy nie niesie żadnych danych kursu.
- `question_addressee` — `{ "name" }` albo `null`. To adresat pytania zadanego z tego ekranu,
  wyznaczony tą samą regułą dziedziczenia co zapis pytania (`POST /lessons/{id}/questions`):
  aktywne przypisanie do lekcji wygrywa z aktywnym przypisaniem do kursu; bez żadnego
  aktywnego przypisania `null` (pytanie i tak się zapisuje). Tylko imię i nazwisko — bez
  identyfikatora i adresu e-mail. Nazwisko prowadzącego z `GET /courses/{slug}`
  (`instructor.name`) dotyczy wyłącznie przypisania kursowego i może się różnić.
- `required_active_seconds` — liczba całkowita: czas aktywny w sekundach, od którego
  `completable` zmienia się na `true`. Jedna formuła z `completable`, liczona na serwerze
  w `LessonCompletionRule`: `ceil(duration_seconds × completable_at_percent / 100)` dla lekcji
  z nagraniem. Lekcja **bez nagrania** (`video_status: none`) ma `0` — jest do ukończenia od
  razu. Lekcja z nagraniem o `duration_seconds = 0` też ma `0`, ale nigdy nie jest do
  ukończenia (rozstrzyga `completable`, nie ta liczba). Lekcja z nagraniem w przygotowaniu
  albo z błędem niesie wartość ze wzoru, a `completable` pozostaje `false`.

`POST /lessons/{id}/progress` → `200` niesie w `data` dodatkowo `required_active_seconds` —
tę samą wartość, tą samą formułą co odczyt lekcji.

### 9. Pola odczytu kursu — `GET /courses/{slug}`

- `has_test` — wartość logiczna: czy kurs ma test. Kurs bez testu ma warunek testu spełniony
  z definicji. Pole jest tylko w odczycie kursu; element listy `GET /courses` go nie niesie.
- `materials[].mime` — typ pliku (np. `application/pdf`) albo `null`, gdy kolumna jest
  pusta; ta sama nazwa i wartość co w zasobie administracji (`AdminMaterial`).

Odczyty niczego nie zapisują i nie emitują audytu ani powiadomień (poza istniejącym
zwiększeniem `open_count` przy odczycie lekcji). Liczba zapytań do bazy przy odczycie kursu
nie rośnie z liczbą lekcji i materiałów; odczyt lekcji ma stałą liczbę zapytań.

Kod: `routes/api/h06.php`, `Services/Lessons/LessonCompletionRule.php`,
`Http/Controllers/Api/V1/VideoTokenController.php`, `Services/Video/VideoTokenService.php`,
`routes/api/h17.php`, `Http/Controllers/Api/V1/H17/LessonQuestionController.php`,
`Http/Resources/H17/ParticipantQuestionResource.php`, `Http/Resources/CourseDetailResource.php`,
`Http/Resources/MaterialResource.php`, `Services/H17/QuestionRouting.php`, `openapi.json`.

---

## Aneks — lekcje po kolei (H05, H06, H10, H17)

Uczestnik przechodzi lekcje kursu po kolei, a test kursu otwiera się dopiero po ukończeniu
wszystkich lekcji. Zmiana jest addytywna: nowy kod `lesson_locked`, nowe pola odczytu kursu
(`locked`, `test_locked`, `active_seconds`, `required_active_seconds`, `has_recording`,
`test_passed`), materiały lekcji zamkniętych poza odczytem kursu i nowa odmowa startu testu.
Bez nowych tras, slugów audytu i typów powiadomień; zero zmian w danych.

### 1. Reguła otwarcia lekcji

Kolejność lekcji jest ta sama co w odczycie kursu (`GET /courses/{slug}`, `lessons`):
płaska lista w kolejności `sequence_order` (tematy rosnąco, w nich lekcje). Lekcja jest
**otwarta** dla uczestnika, gdy:

1. jest pierwszą lekcją kursu, **albo**
2. poprzednia lekcja w tej kolejności jest ukończona, **albo**
3. sama jest ukończona — ukończona lekcja zostaje otwarta zawsze, także po zmianie
   kolejności lekcji po publikacji kursu.

W przeciwnym razie lekcja jest **zamknięta**. Sam postęp (czas, pozycja) bez ukończenia
lekcji nie otwiera. Zmiana kolejności lekcji nie cofa ukończenia: lekcja ukończona
przesunięta za nieukończoną zostaje otwarta, a lekcja nieukończona przesunięta na początek
kursu jest otwarta jako pierwsza.

Reguła dotyczy wyłącznie **uczestnika** — osoby, której token niesie rolę wolontariusza
albo studenta (ta sama miara co `is_completed` w odczycie kursu). Personel
(`project_manager`, `super_admin`) i prowadzący są poza regułą: na wszystkich trasach
dostają dotychczasowe odpowiedzi, a w odczycie kursu `locked` i `test_locked` mają `false`.

### 2. Kod i kolejność odmów

`403 lesson_locked` (domenowy, stan — jak `course_locked`), dopisek do tabeli §1.1:

```json
{ "error": { "status": 403, "code": "lesson_locked",
    "message": "Najpierw ukończ lekcję 2: Wprowadzenie do wywiadu.",
    "reason": { "required_lesson_id": 21 } } }
```

`N` w komunikacie to numer poprzedniej lekcji w kolejności kursu (od 1), a po dwukropku stoi
jej tytuł; `reason.required_lesson_id` to identyfikator tej lekcji — tej, którą trzeba
ukończyć. Kolejność odmów: `401 unauthenticated` → `404 not_found` (kurs albo lekcja
niewidoczne) → `403 course_locked` (kolejność kursów w ścieżce) → `403 lesson_locked`.

### 3. Trasy uczestnika objęte regułą

`GET /lessons/{id}`, `POST /lessons/{id}/progress`, `POST /lessons/{id}/complete`,
`GET /lessons/{id}/video-link`, `GET /lessons/{id}/questions` i `POST /lessons/{id}/questions`
(zapis pytania). Odmowa niczego nie zapisuje: ani postępu, ani `open_count`, ani
ukończenia, ani pytania; odczyt zamkniętej lekcji nie podbija `open_count`.

Pobranie pliku materiału (`GET /materials/{id}/download`) tą regułą bezpośrednio **nie jest
objęte**: trasa jest podpisana i nie czyta roli z tokena. Zamiast tego odczyt kursu nie wydaje
uczestnikowi linków do materiałów lekcji zamkniętej (punkt 6); kształt pola `download_url` i
trasa pobrania bez zmian. Znane ograniczenie: link wydany, zanim lekcja się zamknęła (np. po
zmianie kolejności lekcji), działa do końca swojej ważności (domyślnie 300 s).

### 4. Odczyt kursu — `GET /courses/{slug}`: zamknięcie lekcji i testu

Addytywnie: każdy element `lessons` niesie `locked` (wartość logiczna — ta sama reguła co
odmowa `lesson_locked` na trasach lekcji), a kurs niesie `test_locked`:

```json
{ "data": { "…pola bez zmian…": "…",
  "has_test": true, "test_locked": true,
  "lessons": [ { "id": 21, "…": "…", "is_completed": true, "topic_id": 7, "locked": false },
               { "id": 22, "…": "…", "is_completed": false, "topic_id": 7, "locked": false },
               { "id": 23, "…": "…", "is_completed": false, "topic_id": 7, "locked": true } ] } }
```

`test_locked` jest prawdziwe, gdy kurs ma test, ma lekcje i nie wszystkie lekcje są
ukończone; kurs bez testu, kurs bez lekcji oraz personel mają `false`. Liczba zapytań do bazy
przy odczycie kursu nie zależy od liczby lekcji.

### 5. Odczyt kursu — czas aktywny, nagranie i zaliczenie testu

Addytywnie także cztery pola, zwracane zawsze, także dla lekcji zamkniętej (bez postępu — zera)
i dla personelu (te same wartości liczone tak samo):

- `lessons[].active_seconds` — liczba całkowita, czas aktywny zalogowanej osoby w lekcji
  (ta sama wartość co `active_seconds` w `GET /lessons/{id}`; brak postępu: `0`);
- `lessons[].required_active_seconds` — liczba całkowita, ta sama definicja i to samo źródło
  co pole o tej nazwie w `GET /lessons/{id}` (lekcja bez nagrania: `0`);
- `lessons[].has_recording` — wartość logiczna; lekcja ma nagranie (ten sam predykat „bez
  nagrania”, którego używa reguła ukończenia lekcji i rzetelność);
- `test_passed` — wartość logiczna na poziomie kursu: test kursu zaliczony, to samo źródło,
  którym `CourseAccess` rozstrzyga zaliczenie testu; kurs bez testu: `false`.

### 6. Odczyt kursu — materiały lekcji zamkniętych

`materials` nie zawiera materiałów lekcji zamkniętej dla wywołującego
(materiału z `lesson_id` lekcji, której `locked` jest `true`); materiały wpięte w kurs
(`lesson_id: null`) i materiały lekcji otwartych zostają bez zmian. Decyduje ta sama reguła
i te same policzone blokady co `lessons[].locked`, więc dla uczestnika materiał lekcji jest
obecny wtedy i tylko wtedy, gdy lekcja nie jest zamknięta; personel i prowadzący dostają
komplet (dla nich `locked` jest `false`). Po ukończeniu poprzedniej lekcji materiał pojawia się
w następnym odczycie. Kształt elementu `materials` i pola `download_url` bez zmian.

### 7. Start testu przed ukończeniem lekcji

`GET /courses/{slug}/test` i `POST /tests/{id}/attempts` dla kursu, który ma nieukończone
lekcje, odpowiadają `422 conditions_not_met` z `reason.missing: ["lessons"]` (kody i
koperta jak w §1.1). Odmowa stoi po `404` i po `403 course_locked`, niczego nie zapisuje i
nie zużywa podejścia. Kurs bez lekcji nie zamyka testu. Po ukończeniu wszystkich lekcji
obie trasy działają jak dotąd. Trasa historii podejść (`GET /tests/{id}/attempts`) bez zmian.

Kod: `Services/Lessons/LessonSequence.php` (jedyna implementacja reguły),
`Services/Lessons/LessonAccess.php`, `Http/Controllers/Api/V1/TestController.php`,
`Http/Resources/CourseDetailResource.php`, `Http/Resources/LessonSummaryResource.php`,
`Services/Lessons/LessonCompletionRule.php`, `openapi.json`.

---

## Aneks — rzetelność nauki: lekcja bez nagrania (H07, H18)

Domyka definicję rzetelności z §2 „Rzetelność nauki (H07)”. Tamtego tekstu nie usuwam —
ten blok jest wobec niego nadrzędny w jednym miejscu: co znaczy „mierzalna ukończona
lekcja”. Bez nowych tras, pól, kodów, slugów audytu i typów powiadomień; zero zmian w danych.

### 1. Definicja

Ukończona lekcja jest **mierzalna**, gdy ma nagranie **i** dodatni `duration_seconds`.
Lekcja bez nagrania nie ma czasu do odrobienia, więc nie ma czego mierzyć: nie wchodzi ani
do sumy `active_seconds`, ani do sumy `duration_seconds`. „Bez nagrania” to ten sam stan,
który reguła ukończenia lekcji odczytuje jako `video_status: none` (lekcja bez nagrania
odtwarzanego i bez nagrania w drodze) — jedna implementacja predykatu
(`LessonCompletionRule`), bez drugiej kopii warunku. Lekcja z nagraniem w przygotowaniu albo
z błędem nagrania ma nagranie i podlega dotychczasowej regule.

### 2. Skutek

- Osoba, której ukończone lekcje z dodatnim czasem trwania są wyłącznie lekcjami bez nagrania,
  nie ma mierzalnej ukończonej lekcji: `reliability_percent: null`, `below_threshold: false`.
- Osoba z nagraniami we wszystkich ukończonych lekcjach ma dokładnie tę samą liczbę co
  dotąd; ukończenie lekcji bez nagrania jej nie zmienia.
- Liczba pochodzi z `ProgressAggregator` i jest ta sama w trzech miejscach: karta osoby
  (`reliability_percent`), `sum` sekcji `reliability` w `GET /admin/users/{id}/number-sources`
  i `reliability_percent` w `GET /admin/reliability/{userId}`. Wiersze sekcji `reliability`
  nie zawierają lekcji bez nagrania.

### 3. Czego ten aneks nie wprowadza

Stan nagrania jest czytany w chwili obliczenia, nie w chwili ukończenia: lekcja ukończona bez
nagrania, do której nagranie dodano później, wchodzi do ilorazu z czasem aktywnym zapisanym
w chwili ukończenia (zwykle `0 s`). Lista lekcji w szczegółach
`GET /admin/reliability/{userId}` (`lessons`) nadal wymienia ukończone lekcje z dodatnim czasem
trwania, także te bez nagrania; wartość zbiorcza nie jest z niej liczona.

Kod: `Services/Lessons/LessonCompletionRule.php` (`isMeasurable`), `Support/ProgressAggregator.php`,
`Services/H18/UserNumberSourcesQuery.php`.

---

## Aneks — podgląd kursu nieopublikowanego (H05, H06, H08)

Personel i prowadzący związany z kursem czytają kurs nieopublikowany (szkic) tymi samymi
trasami co uczestnik, żeby sprawdzić go przed publikacją. Zmiana dotyczy wyłącznie widoczności;
bez nowych tras, parametrów, pól, kodów błędu, slugów audytu i typów powiadomień; zero zmian w
danych.

### 1. Kto i czym

- **Trasy:** `GET /courses/{slug}`, `GET /lessons/{id}`, `GET /lessons/{id}/video-link`.
- **Dopuszczeni do szkicu:** `project_manager` i `super_admin` (rola z tokena) — w granicach
  filtra grupy produktowej osoby, tak jak przy kursie opublikowanym — oraz prowadzący związany
  z kursem według tej samej reguły co pozostałe trasy lekcji prowadzącego: ta sama grupa
  produktowa kursu albo aktywne przypisanie.
- **Pozostali bez zmian:** uczestnik (także zapisany na kurs, także ze śladem postępu) i
  prowadzący bez związku z kursem dostają `404 not_found`, identyczne bajt w bajt jak dla zasobu
  nieistniejącego: `Nie znaleziono kursu.` na trasie kursu, `Nie znaleziono zasobu.` na trasach
  lekcji i linku (dotąd odczyt lekcji niewidocznej mówił `Nie znaleziono lekcji.`, czym różnił
  się od lekcji nieistniejącej — teraz oba mówią to samo).
- **Lista kursów** (`GET /courses`) szkicu nie pokazuje nikomu, także personelowi i
  prowadzącemu: podgląd wchodzi wyłącznie adresem kursu.
- Reguła stoi w jednym miejscu (`LessonAccess::canPreviewDraft`), a odczyt kursu i link do
  nagrania pytają właśnie tam. Kurs opublikowany czytany jest dokładnie jak dotąd.

### 2. Link do nagrania szkicu

Link do nagrania szkicu powstaje tak samo jak dla kursu opublikowanego: serwer niczego nie
wysyła do dostawcy nagrań przy wydaniu linku (podpisuje adres lokalnie), a bez skonfigurowanego
klucza podpisu odpowiada `503 video_not_configured`.

Kod: `Services/Lessons/LessonAccess.php`, `Http/Controllers/Api/V1/CourseController.php`.

---

## Aneks z 2026-10-02 — odblokowanie konta (H18)

Administracja cofa blokadę konta nałożoną przez `POST /admin/users/{id}/block`. Nowa trasa,
nowy slug audytu `user.unblocked` (dopisany w §3.2), dwa nowe kody `409`. Bez typu
powiadomienia i bez e-maila; zero zmian w danych (`users.status` jest napisem).

### 1. Trasa i role

`POST /admin/users/{id}/unblock` — bez ciała (pola ciała są ignorowane), w tej samej grupie co
blokada: `project_manager` i `super_admin`. `{id}` jest liczbą. Odpowiedź `200` niesie kartę
osoby w kopercie, tak jak blokada (`{ "data": { "profile": …, "account": …, … } }`).

| Sytuacja | Kod | `code` · komunikat |
|---|---|---|
| brak albo nieważny token | **401** | `unauthenticated` |
| rola spoza `project_manager` i `super_admin` | **403** | `forbidden` |
| nieznana osoba | **404** | `not_found` · „Nie znaleziono osoby.” |
| opiekun projektu odblokowuje konto Super Admina | **403** | `forbidden` · „Tylko Super Admin może zarządzać kontami Super Admina.” |
| konto zanonimizowane | **409** | `account_anonymized` · „Konta zanonimizowanego nie można odblokować.” |
| konto w stanie innym niż `blocked` | **409** | `account_not_blocked` · „To konto nie jest zablokowane.” |

Każda odmowa niczego nie zmienia i nie zapisuje audytu.

### 2. Skutek

- Stan po odblokowaniu: `invited`, gdy konto nie jest jeszcze powiązane z Kontami Niepodzielni
  (`keycloak_sub` puste) — wiązanie przy pierwszym logowaniu zostaje wymagane; w przeciwnym
  razie `active`.
- `access_expires_at` bez zmian: odblokowanie nie przedłuża dostępu do materiałów.
- Blokada i odblokowanie są lokalne — konto w Kontach Niepodzielni zostaje nietknięte.

### 3. Blokada konta zanonimizowanego

`POST /admin/users/{id}/block` dla konta zanonimizowanego → **409** `account_anonymized` ·
„Konta zanonimizowanego nie można zablokować.”, bez zmiany stanu i bez audytu. Pozostałe
zachowanie blokady bez zmian.

### 4. Karta osoby

`GET /admin/users/{id}` (i odpowiedzi tras zapisu, które zwracają kartę) niesie dodatkowo
`account: { "status" }` — bieżący `users.status`: `active · invited · blocked · deleted`
(`deleted` = konto zanonimizowane). Powód i datę blokady front bierze z istniejącego
`audit_entries` (ostatni wpis `user.blocked`).

### 5. Audyt

`user.unblocked` — administracja odblokowuje konto. Pola ładunku: `previous_status`,
`restored_status` (kody stanu konta). Bez wolnego tekstu, zgodnie z zasadą ogólną z erraty
2026-09-18.

Kod: `routes/api/h18.php`, `Http/Controllers/Api/V1/Admin/AdminUserController.php`,
`Http/Requests/H18/UnblockUserRequest.php`, `Http/Resources/AdminUserCardResource.php`.

---

## Aneks — odmowa dla konta zablokowanego (H18)

Konto zablokowane (`POST /admin/users/{id}/block`) dostaje od strażnika uwierzytelnienia własny
kod, żeby ekran logowania nie mówił mu „Konto nie jest jeszcze połączone”. Zmiana dotyczy
wartości istniejącego pola `code` — kształt koperty błędu i status HTTP zostają bez zmian. Bez
nowych tras, pól, slugów audytu i typów powiadomień; zero zmian w danych. Wobec zdania
„także konto zablokowane” w aneksie z 2026-10-02 (tabela odblokowania, wiersz 401) ten aneks jest
nadrzędny w jednym miejscu: kod tej odmowy.

### 1. Odmowy 401 strażnika

Dotyczy każdej trasy za strażnikiem (`/me`, `/courses`, `/notifications` itd.):

| Sytuacja | Kod | `code` |
|---|---|---|
| brak, nieważny albo wygasły token; sesja zakończona; konto usunięte lub zanonimizowane | **401** | `unauthenticated` |
| ważny token, konto jeszcze niepowiązane (bez zmian) | **401** | `konto_niepowiazane` (`reason.sub`) |
| ważny token, konto zablokowane | **401** | `konto_zablokowane` |

```json
{ "error": { "status": 401, "code": "konto_zablokowane",
    "message": "To konto jest zablokowane." } }
```

### 2. Koperta

Odpowiedź dla `konto_zablokowane` niesie wyłącznie `status`, `code` i `message`: bez `reason`,
bez `sub`, bez powodu blokady, bez dat i bez danych osoby. Powód blokady żyje w rekordzie i w
dzienniku administracji. Stan konta wraca wyłącznie posiadaczowi ważnego, w pełni
zwalidowanego tokena; konto usunięte i zanonimizowane zostaje przy `unauthenticated`.

### 3. Po odblokowaniu

Po `POST /admin/users/{id}/unblock` ten sam token przechodzi strażnika bez ponownego logowania —
odmowa znika, bez zmian po stronie klienta poza ponownym wejściem na ekran logowania.

### 4. Klient

Klient API czyta `error.code` przed rozstrzygnięciem 401. `konto_zablokowane` kieruje na ekran
„Konto jest zablokowane” (`/logowanie/zablokowane`) bez pytania `GET /sso/whoami` i bez kończenia
sesji; sesję kończy dopiero przycisk „Wyloguj się” na tym ekranie. Kod nieznany klientowi idzie
dotychczasową ścieżką.

Kod: `Exceptions/AccountBlockedException.php`, `Services/Keycloak/KeycloakGuardResolver.php`,
`openapi.json` (opis odpowiedzi `AuthenticationException`); front:
`frontend/lib/api/klient.ts`, `frontend/lib/api/logowanie.ts`,
`frontend/app/logowanie/zablokowane/page.tsx`.

---

## Aneks — zmiana daty dostępu osoby w programie (H04, H18)

Opisuje stan kodu trasy `POST /admin/users/{id}/extend-access`. Bez nowych tras, slugów audytu
i typów powiadomień; zero zmian w danych. Dwa nowe kody `422` (`cannot_extend_self`,
`access_date_not_applicable`) dopisane do przykładów tabeli §1.1; kod `409 account_anonymized`
na tej trasie opisuje tabela odmów niżej.

### Trasa, role i ciało

`POST /admin/users/{id}/extend-access` — role `project_manager` i `super_admin`; `{id}` jest
liczbą. Ciało: dokładnie jedno z pól `until` albo `months` oraz wymagany `reason`.

- `until` — data (`YYYY-MM-DD`; przyjmowany jest też znacznik czasu ISO 8601) ustawiana wprost.
- `months` — liczba całkowita od 1 do 24. Liczy się od bieżącej daty końca dostępu, gdy jest
  jeszcze w przyszłości (przedłużenia się sumują), a od teraz, gdy dostęp już wygasł.
  Miesiące nie przelewają się na następny miesiąc: 29 lutego + 24 miesiące kończy się 28 lutego,
  31 sierpnia + 6 miesięcy kończy się 28 lutego, nigdy 1 ani 3 marca.
- `reason` — napis, po przycięciu białych znaków od 1 do 1000 znaków. Powód trafia do rekordu
  zmiany daty, a nie do dziennika zdarzeń (zasada ogólna z erraty 2026-09-18).

`200 {"data": <zasób użytkownika>}` z nową `access_expires_at`. Audyt `access.extended` niesie
wyłącznie dwie daty (`previous_access_expires_at`, `access_expires_at`).

### Zakres daty

Data końca dostępu jest najwcześniej początkiem jutrzejszego dnia i najpóźniej dzisiejszym
dniem + 24 miesiące kalendarzowe (ten dzień do końca). Dni liczą się w kalendarzu polskim
(`Europe/Warsaw`), nie w strefie aplikacji: między północą w Polsce a północą UTC „dziś” jest
już następnym dniem kalendarzowym niż w UTC. Podana chwila jest przeliczana na dzień
warszawski — ta sama chwila, która trafia do bazy; data bez godziny oznacza początek tego dnia
według UTC. Naruszenie → `422 validation_failed` z jednym zdaniem w `errors.until`:

- za wcześnie (dziś, wcześniej): „Data końca dostępu musi być późniejsza niż dzisiejsza.”;
- za daleko: „Nowa data dostępu może być najwyżej 24 miesiące od dziś.”.

Tryb `months`, którego wynik przekroczyłby ten sam pułap, daje `422 validation_failed` na
polu `months`: „Dostęp można przedłużyć najdalej do `YYYY-MM-DD`.”. Przy każdej odmowie data
w bazie, dziennik zdarzeń i rekordy zmian daty zostają bez zmian.

### Kogo dotyczy data i kolejność odmów

Datę końca dostępu mają wyłącznie osoby w programie: rola konta `volunteer` albo `student`.
Konto prowadzącego (`instructor`) i konta administracji (`project_manager`, `super_admin`) nie
mają terminu — takie konto wyłącza się blokadą. Odmowy, w tej kolejności, każda przed
walidacją ciała (zdanie i kod nie zależą od tego, czy ciało by ją przeszło):

| Sytuacja | Kod | `code` · komunikat |
|---|---|---|
| brak albo nieważny token | **401** | `unauthenticated` |
| rola spoza `project_manager` i `super_admin` | **403** | `forbidden` |
| nieznana osoba | **404** | `not_found` · „Nie znaleziono osoby.” |
| opiekun projektu zmienia datę konta Super Admina | **403** | `forbidden` · „Tylko Super Admin może zarządzać kontami Super Admina.” |
| konto zanonimizowane | **409** | `account_anonymized` · „Kontu zanonimizowanemu nie można zmienić daty dostępu.” |
| własne konto osoby wywołującej | **422** | `cannot_extend_self` · „Nie można zmienić daty dostępu własnego konta.” |
| konto prowadzącego albo administracji | **422** | `access_date_not_applicable` · „Konta prowadzących i administracji nie mają terminu dostępu. Takie konto wyłącza się blokadą.” |
| data albo powód poza regułami | **422** | `validation_failed` |

Zasada hierarchii (konto Super Admina tylko dla Super Admina) i zasada własnego konta są tymi
samymi regułami co przy blokadzie konta; jedna implementacja w `AccountManagementGuard`.
Wobec konta Super Admina opiekun projektu dostaje `403`, a nie `422 access_date_not_applicable`
— hierarchia ma pierwszeństwo przed regułą roli konta.

Konto zanonimizowane nie ma już terminu dostępu do zmiany: `409 account_anonymized`, bez
żadnego zapisu — ani daty, ani powodu w rekordzie zmiany, ani audytu `access.extended`, ani
powiadomienia. Odmowa pada tak samo dla konta zanonimizowanego w stanie `deleted` i `blocked`,
także gdy konto ma rolę bez terminu (wtedy to ona wygrywa z `access_date_not_applicable`), i
tak jak pozostałe odmowy tej trasy — przed walidacją ciała; hierarchia (`403`) ma przed nią
pierwszeństwo. Kontroler powtarza ją na wierszu zablokowanym w transakcji, więc konto
zanonimizowane między sprawdzeniem żądania a zapisem też niczego nie dostaje.

### Blokada konta — własne konto

`POST /admin/users/{id}/block` dla własnego konta osoby wywołującej → **422**
`cannot_block_self` · „Nie można zablokować własnego konta.”, bez zmiany stanu i bez audytu.
Odmowa pada w `authorize()` żądania, po sprawdzeniu hierarchii (`403`) i przed regułą
„ostatniego aktywnego konta administracji” (`409 last_active_administrator`); kontroler
powtarza ją na wierszu zablokowanym w transakcji. Kod odmowy jest dziś zwracany przez kod
(`Services/H18/AccountManagementGuard.php::cannotBlockSelf`) i pilnowany próbami H18.

Kod: `routes/api/h04.php`, `Http/Requests/H04/ExtendAccessRequest.php`,
`Http/Controllers/Api/V1/Admin/AccessController.php`,
`Services/H18/AccountManagementGuard.php` (`assertNotOwnAccount`, `cannotExtendOwnAccess`,
`assertAccessDateApplies`, `assertDateMayBeChanged`), `openapi.json`.

---

## Aneks — wpis o czyszczeniu danych próbnych przy przejściu na produkcję

Jednorazowe polecenie konsoli `psychon:zero-danych-probnych` (procedura:
`deploy/PROCEDURA-PRZEJSCIA-TEST-PRODUKCJA.md`) usuwa osoby próbne i ślady fazy testowej, razem z
dziennikiem zdarzeń i dziennikiem wglądu w dane wrażliwe. Aneks dopisuje jeden slug audytu do
§3.2. Bez nowych tras, kodów błędu i typów powiadomień; zero zmian w schemacie danych.

### 1. Slug

`trial_data.purged` (§3.2) — polecenie czyszczące zapisuje go **raz**, jako pierwszy wpis dziennika
produkcji, w tej samej transakcji co usunięcie danych i znacznik startu produkcji. Slug wchodzi do
`AuditIndexRequest::ACTIONS`, więc da się go odfiltrować (`GET /admin/audit?action=trial_data.purged`)
i wyeksportować jak każdy inny wpis rejestru.

### 2. Ładunek

Pola ładunku (`details`), wyłącznie liczby i kody — bez wolnego tekstu, zgodnie z zasadą ogólną
z erraty 2026-09-18:

- `deleted` — obiekt: nazwa tabeli (z zamkniętej listy tabel czyszczonych w kodzie) → liczba
  usuniętych wierszy (liczba całkowita; tabele z zerem też są wymienione), w tym oba dzienniki;
- `kept_accounts` — liczba kont personelu, które zostały (liczba, nie lista identyfikatorów);
- `executor` — kod źródła uruchomienia; jedyna wartość to `console`.

Ładunek nie niesie identyfikatorów ani adresów e-mail — także w zagnieżdżonym `deleted`: każdy
liść to liczba albo kod `console`, każdy klucz to nazwa pola albo tabeli. Pilnuje tego próba
`ZeroDanychProbnychCommandTest`.

`actor_id` jest pusty i wpis nie ma podmiotu (`subject_type`, `subject_id` puste): osoba, która
uruchomiła polecenie, jest wpisana wyłącznie w protokole przejścia poza repozytorium.

### 3. Znacznik startu produkcji i jednorazowość

W tej samej transakcji powstaje klucz `production_started_at` w tabeli `settings` (chwila wpisu,
ISO 8601 UTC). Klucz jest wewnętrzny: żadna trasa go nie czyta ani nie zapisuje, a model `Setting`
odmawia zapisu i usunięcia kluczy z listy `ProductionStart::RESERVED_KEYS`. Od chwili zapisu
znacznika każde kolejne uruchomienie polecenia — także bieg na sucho — kończy się odmową
(kod wyjścia `2`); jedyną opcją dostępną po znaczniku jest `--sprawdz` (pomiar stanu po przejściu,
bez zmian w bazie).

### 4. Znacznik odtworzenia próbnego kopii

Bez udanego odtworzenia próbnego kopii (krok 3 procedury) nie ma czyszczenia: polecenie odmawia
(kod wyjścia `2`) zarówno biegu na sucho, jak i właściwego, dopóki w tabeli `settings` nie stoi
klucz `restore_trial_confirmed_at` (chwila zapisu, ISO 8601 UTC). Klucz jest wewnętrzny na tych
samych zasadach co `production_started_at` (lista `ProductionStart::RESERVED_KEYS`). Zapisuje go
wyłącznie opcja `--zapisz-odtworzenie=<plik wyniku odtworzenia>` tego samego polecenia — samodzielna
(nie łączy się z żadną inną opcją) i zamknięta po znaczniku startu produkcji — a tylko wtedy, gdy
ostatnia niepusta linia pliku to dokładnie potwierdzenie sukcesu skryptu odtworzenia, a żadna
linia nie niesie słowa `NIEZGODNOSC`. Opcja `--sprawdz` mierzy też obecność tego znacznika.
Polecenie nie dotyka systemu Kont Niepodzielni i nie usuwa żadnej kopii.

Kod: `Console/Commands/ZeroDanychProbnychCommand.php`, `Services/Cutover/ProbeDataPurge.php`,
`Support/ProductionStart.php`, `Support/RestoreTrial.php`, `Models/Setting.php`, `Http/Requests/H20/AuditIndexRequest.php`;
etykieta slugu w słownikach klienta (`frontend/lib/api/h20.ts`, `frontend/lib/h20/labels.ts`)
wchodzi razem z kodem slugu — test zgodności rejestru z frontem
(`frontend/lib/h20/__tests__/audit-actions-source-of-truth.test.ts`) pilnuje obu stron.

---

## Aneks — przypisanie prowadzącego wielu osobom naraz (H12, H18)

Administracja przypisuje jednego prowadzącego wielu wolontariuszom jednym żądaniem, a lista
osób i karta osoby pokazują bieżącego prowadzącego. Aneks opisuje stan kodu. Jedna nowa trasa,
nowe pola odczytu. Bez nowych kodów błędu i typów powiadomień; w rejestrze §3.2 dopisany
istniejący slug `supervisor.unassigned` (pkt 3); zero zmian w danych.

### 1. Trasa i role

`POST /admin/supervisor-assignments` — w pliku `routes/api/h12.php`, w tej samej grupie i z tym
samym pośrednikiem co `PUT /admin/users/{id}/supervisor`. Role `project_manager` i
`super_admin`; brak tokenu → `401 unauthenticated`; inna rola → `403 forbidden`, bez żadnego
zapisu.

Ciało:

```json
{ "supervisor_id": 5, "user_ids": [17, 18, 44] }
```

- `supervisor_id` — wymagana liczba całkowita; aktywne konto (`status: active`, bez
  anonimizacji) z rolą `instructor`. Prowadzący sprawdzany jest raz dla całego żądania.
- `user_ids` — wymagana lista od 1 do **100** liczb całkowitych dodatnich, bez powtórzeń.
  Elementy muszą być liczbami całkowitymi JSON: napis z cyframi (`"17"`) albo liczba z
  częścią ułamkową to błąd walidacji, nie identyfikator.

Pola ciała spoza tych dwóch są ignorowane — nie dają `422` i niczego nie zmieniają.

Naruszenie dowolnego warunku → `422 validation_failed` (błąd na `supervisor_id`, `user_ids`
albo `user_ids.N`), nic nie jest zapisywane. Identyfikator osoby, która nie istnieje, **nie**
jest błędem walidacji — wraca w wyniku jako `not_found`.

### 2. Odpowiedź

`200`:

```json
{ "data": {
  "supervisor_id": 5,
  "results": [
    { "user_id": 17, "result": "assigned",  "reason": null },
    { "user_id": 18, "result": "unchanged", "reason": null },
    { "user_id": 44, "result": "refused",   "reason": "not_assignable" },
    { "user_id": 99, "result": "not_found", "reason": null } ],
  "summary": { "requested": 4, "assigned": 1, "unchanged": 1, "refused": 1, "not_found": 1 } } }
```

- `results` — dokładnie jeden wpis na identyfikator z żądania, **w kolejności żądania**.
- `result` — słownik zamknięty `supervisor_assignment.result`:
  `assigned · unchanged · refused · not_found`.
  - `assigned` — nowe przypisanie (poprzednie aktywne przypisanie osoby zostaje zamknięte);
  - `unchanged` — osoba ma już tego prowadzącego, nic się nie zmienia;
  - `refused` — osoby nie można przypisać: rola inna niż `volunteer` (studenci są poza MVP)
    albo konto zablokowane lub zanonimizowane;
  - `not_found` — nie ma takiej osoby.
- `reason` — słownik zamknięty: `not_assignable` przy `refused`, w pozostałych przypadkach
  `null`. Jeden kod dla wszystkich powodów odmowy, tak jak trasa pojedyncza daje jedną odmowę
  dla każdej niewłaściwej roli.
- `summary` — liczby wyników; `requested` równa się długości `results`.

Każda osoba jest przypisywana tą samą ścieżką co trasa pojedyncza, we własnej transakcji.
Odmowa przy jednej osobie nie cofa pozostałych.

Żądanie **nie jest** atomowe jako całość. Nieoczekiwany błąd serwera przy osobie N kończy
żądanie odpowiedzią `500` w standardowej kopercie błędu, **bez** `results` i `summary`. Osoby
przed N zostają przypisane, razem ze swoimi wpisami audytu; osoba N i osoby po niej zostają
bez zmian. Ponowne wysłanie tego samego żądania jest bezpieczne: osoby już przypisane wracają
jako `unchanged` i nie dostają drugiego wpisu audytu.

### 3. Audyt i powiadomienia

Trasa zbiorcza zapisuje dziennik tą samą usługą co trasa pojedyncza, więc wpisy są identyczne:

- `supervisor.assigned` — dokładnie jeden na osobę z wynikiem `assigned`. Pola ładunku:
  `volunteer_id`, `supervisor_id`.
- `supervisor.unassigned` — jeden za każde zamknięte poprzednie aktywne przypisanie tej osoby.
  Pola ładunku: `volunteer_id`, `supervisor_id` (prowadzący dotychczasowy).
- `unchanged`, `refused` i `not_found` nie zapisują niczego.

`supervisor.unassigned` kod emituje od trasy pojedynczej, a filtr dziennika
(`GET /admin/audit?action=`) go zna; ten aneks dopisuje go do rejestru §3.2 (H12) — kod ma
rację, rejestr dogania. Bez wolnego tekstu w ładunku, zgodnie z zasadą ogólną z erraty
2026-09-18. Powiadomień trasa zbiorcza nie wysyła, tak jak pojedyncza.

### 4. Rozmowa z poprzednim prowadzącym

Po zmianie prowadzącego (pojedynczej albo zbiorczej) rozmowa indywidualna z poprzednim
prowadzącym jest dla osoby tylko do odczytu (`meta.extra.read_only: true`, zapis →
`403 thread_closed`), poprzedni prowadzący jej nie widzi (`404 not_found`), a z nowym
prowadzącym powstaje nowa rozmowa.

### 5. Pola odczytu

- `GET /admin/users` — każdy element niesie `supervisor`: `{ "id", "name" }` bieżącego
  aktywnego prowadzącego albo `null`. Prowadzący są wczytywani dla całej strony naraz; liczba
  zapytań nie zależy od liczby osób na stronie.
  Eksport `GET /admin/users/export.csv` bez zmian.
- Karta osoby — `GET /admin/users/{id}` i odpowiedzi tras zwracających kartę
  (`PATCH /admin/users/{id}`, `POST /admin/users`, blokada, odblokowanie, anonimizacja) —
  `supervisor` w tym samym kształcie oraz w `account` nowe pole `created_at` (ISO 8601 UTC)
  obok istniejącego `status` (aneks z 2026-10-02).
- `profile.roles` na karcie osoby niesie rolę tej osoby; role z tokenu wyłącznie na własnym
  profilu (`GET /me`).

### 6. Czego ten aneks nie wprowadza

Ścieżka trasy pojedynczej `PUT /admin/users/{id}/supervisor`, kształt jej żądania i odpowiedzi
oraz kody odpowiedzi (`200`, `404 not_found`, `422 validation_failed`) zostają bez zmian. Obie trasy
stosują te same reguły dla prowadzącego i osoby (pkt 1–2).

Kod: `routes/api/h12.php`,
`Http/Controllers/Api/V1/H12/AdminSupervisionController.php::assignSupervisorToMany`,
`Http/Requests/H12/AssignSupervisorToManyRequest.php`,
`Services/H12/SupervisorAssignmentService.php` (`assignToMany`),
`Http/Resources/AdminUserListResource.php`, `Http/Resources/AdminUserCardResource.php`.

---

## Aneks — powód wpisany ręcznie żyje w rekordzie, nie w dzienniku (H10, H13, H18, H20)

Domyka zasadę ogólną z erraty 2026-09-18 dla trzech zdarzeń z tabeli tamtej erraty.
Tamtego tekstu nie usuwam; w tych trzech miejscach ten blok jest wobec niego nadrzędny.
Bez nowych tras, kodów błędu, slugów audytu i typów powiadomień. W ładunkach rejestru
zdarzeń nie ma tekstu wpisanego ręcznie.

### 1. Ładunki trzech zdarzeń (§3.2)

| slug | pola ładunku (`details`) | gdzie żyje powód |
|---|---|---|
| `certificate.revoked` (H13) | `number` | `certificates.revoked_reason` |
| `user.blocked` (H18) | `previous_status` | `users.blocked_reason` |
| `attempts.reset` (H10) | `test_id`, `cleared` | `test_attempt_resets.reason` |

Pole `reason` nie występuje w ładunku żadnego z tych zdarzeń. Rejestr przyjmuje
identyfikatory, kody ze słowników zamkniętych i flagi. Powód unieważnienia jest w rekordzie
certyfikatu, nie w rejestrze zdarzeń.

Lista dozwolonych pól ładunku dla każdego sluga jest jawna w kodzie
(`tests/Unit/H20/AuditPayloadAllowListTest.php`) i pilnowana próbą po wszystkich wywołaniach
`AuditLog::record` w `app/`: nowy klucz spoza listy sluga, nowe wywołanie bez wpisu na liście
i wpis listy, którego kod już nie zapisuje, czerwienią próbę. Żadna nazwa z listy nie może być
nazwą pola z tekstem wpisanym ręcznie (zbiór z punktu 2). Zapis z pustym ładunkiem jest
zapisem bez ładunku (`details = null`).

### 2. Lista dziennika i eksport — `GET /admin/audit`, `GET /admin/audit/export.csv`

`details` wiersza listy i kolumna `details` pliku CSV niosą wyłącznie identyfikatory, kody
i flagi. Pola z treścią wpisaną ręcznie są pomijane przy odczycie na dowolnej głębokości
ładunku; zbiór nazw jest zamknięty: `reason`, `comment`, `note`, `notes`, `response`,
`description`, `message`. Ładunek, który po pominięciu jest pusty, ma `details: null`
(w CSV: pusta kolumna). Kształt wiersza i kolejność kolumn bez zmian. To samo dotyczy
`audit_entries[].details` na karcie osoby (`GET /admin/users/{id}`).

Stare wiersze rejestru nie są czyszczone ani przepisywane: rejestr jest zablokowany na
poziomie bazy, produkcja startuje bez danych, a środowisko deweloperskie zawiera wyłącznie
dane demonstracyjne. Odczyt pomija w nich pola tekstowe, więc nie wracają listą ani plikiem.

### 3. Certyfikaty — `GET /admin/certificates`

Element listy i odpowiedź `POST /admin/certificates/{certificate}/revoke` niosą
`revoked_reason` jak dotąd, wyłącznie dla `project_manager` i `super_admin` (inna rola →
`403 forbidden`, bez treści powodu w odpowiedzi). Powód jest w rekordzie certyfikatu, a po
anonimizacji konta właściciela ma wartość `null`; numer, data wydania i fakt unieważnienia
zostają.

### 4. Konto — blokada i odblokowanie (H18)

Powód z `POST /admin/users/{id}/block` jest zapisywany w `users.blocked_reason`
(`text`, nullable). `POST /admin/users/{id}/unblock` i anonimizacja zerują tę kolumnę.
Karta osoby (`GET /admin/users/{id}` i odpowiedzi tras blokady i odblokowania) niesie
`account.blocked_reason` — napis przy koncie zablokowanym, w pozostałych stanach `null` —
obok istniejącego `account.status`. Pole widzi wyłącznie administracja (`project_manager`,
`super_admin`): karta jest trasą administracyjną, inna rola dostaje `403 forbidden`, a własny
profil osoby (`GET /me`) powodu nie niesie. Poprzedni sposób odczytu powodu z
`audit_entries[].details` przestaje działać.

### 5. Zerowanie podejść do testu (H10)

Powód z `POST /admin/tests/{testId}/users/{userId}/reset-attempts` jest zapisywany w nowej
tabeli `test_attempt_resets` (`test_id`, `user_id`, `reset_by`, `reason`, `cleared`,
`created_at`); wiersz powstaje razem ze skasowaniem podejść, w tej samej transakcji.
Odpowiedź trasy i jej kształt bez zmian; powodu nie zwraca żadna trasa odczytu. Anonimizacja
osoby zeruje `reason` wierszy tej osoby, a sam wiersz (test, liczba skasowanych podejść,
data) zostaje.

### 6. Anonimizacja konta

`POST /admin/users/{id}/anonymize` zeruje `certificates.revoked_reason` certyfikatów osoby,
`users.blocked_reason` i `test_attempt_resets.reason` wierszy osoby. Tak samo robi domknięcie
stanu zastanego pod `409 already_anonymized`.
Po anonimizacji powód w rekordzie zmiany daty dostępu (`access_date_changes.reason`) jest pustym
napisem (kolumna jest NOT NULL), nie `null`.

### 7. Dane

Migracja addytywna `2026_10_03_130000_add_blocked_reason_and_test_attempt_resets.php`:
kolumna `users.blocked_reason` i tabela `test_attempt_resets`; `down()` usuwa wyłącznie te dwa
obiekty. Migracja nie zmienia istniejących wierszy.

Kod: `Support/AuditDetailsView.php`, `Http/Resources/AuditLogEntryResource.php`,
`Http/Resources/AdminUserCardResource.php`, `Http/Controllers/Api/V1/Admin/AdminUserController.php`,
`Http/Controllers/Api/V1/AdminTestResetController.php`, `Services/H13/CertificateRevoker.php`,
`Services/H18/UserAnonymizer.php`, `Models/TestAttemptReset.php`, `openapi.json`; front:
`frontend/components/h18/AdminUserCard.tsx`, `frontend/lib/api/h18.ts`.

---

## Aneks — blokada i odblokowanie konta zanonimizowanego: 403 (H18)

Kod ma rację, ten aneks dogania kontrakt. Aneks z 2026-10-02 („odblokowanie konta”) w
tabeli odmów i w punkcie 3 podaje dla konta zanonimizowanego **409** `account_anonymized`. Kod
zwraca **403** `account_anonymized` z tymi samymi komunikatami. Tamtego tekstu nie usuwam — ten
blok jest wobec niego nadrzędny w dwóch miejscach. Bez nowych tras, kodów, pól, slugów audytu i
typów powiadomień; zero zmian w danych.

### 1. Kody

| Trasa | Sytuacja | Kod | `code` · komunikat |
|---|---|---|---|
| `POST /admin/users/{id}/block` | konto zanonimizowane | **403** | `account_anonymized` · „Konta zanonimizowanego nie można zablokować.” |
| `POST /admin/users/{id}/unblock` | konto zanonimizowane | **403** | `account_anonymized` · „Konta zanonimizowanego nie można odblokować.” |

Uzasadnienie według tabeli §1.1: anonimizacja jest stanem konta, który blokuje akcję („reguła
domenowa blokuje dostęp/akcję — stan, nie własność” → 403), a nie wyścigiem o ograniczony zasób
(409). Odmowa niczego nie zmienia i nie zapisuje audytu — bez zmian.

### 2. Czego ten aneks nie zmienia

`POST /admin/users/{id}/extend-access` dla konta zanonimizowanego zostaje przy **409**
`account_anonymized` (aneks „zmiana daty dostępu osoby w programie”). Wyrównanie tego kodu z
blokadą i odblokowaniem przyjdzie osobnym aneksem razem ze zmianą kodu.

Kod: `Http/Controllers/Api/V1/Admin/AdminUserController.php` (`block`, `unblock`).
