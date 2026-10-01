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
| błędne dane wejściowe / niespełnione warunki operacji | **422** | `validation_failed`, `not_enough_active_time`, `conditions_not_met`, `profile_incomplete` |
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
"count": 3, "link": "/admin/uczestniczki" }, … ] } }`.

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
`user.blocked` (H18) · `edition.updated` (H19) · `sensitive.viewed`
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
