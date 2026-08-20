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
| reguła domenowa blokuje dostęp/akcję (stan, nie własność) | **403** | `course_locked`, `attempts_exhausted`, `access_expired`, `not_your_supervisor`, `entry_locked`, `profile_not_eligible` |
| zasób nie istnieje **lub należy do innego użytkownika** (pojedynczy rekord wskazywany identyfikatorem — nie ujawniamy istnienia) | **404** | `not_found` |
| wyścig o ograniczony zasób (limit miejsc, duplikat unikalny) | **409** | `slot_full`, `email_already_registered` |
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

`POST /lessons/{id}/progress` (heartbeat ≤ co 30 s) — **przyrosty**, nazwy wiążące:

```json
{ "position_seconds": 314, "watched_delta": 28, "active_delta": 25 }
```

→ 200 `{ "data": { "watched_seconds": 812, "active_seconds": 700,
"completable": false, "completable_at_percent": 60 } }`
Serwer: wartości tylko rosną; **`active_delta` przycinane do 35 s na żądanie**
(idempotencja przy dwóch kartach/urządzeniach). Próg ukończenia =
`editions.lesson_completion_percent` (klucz w §3.3).
`POST /lessons/{id}/complete` → 200 albo 422 `not_enough_active_time`.

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

`POST /internship/entries`

```json
{ "date": "2026-10-03", "hours": "3.5", "form": "phone_duty",
  "consultations_count": 4, "description": "Dyżur telefoniczny — bez danych osób." }
```

→ 201 `{ "data": { "id": 91, "status": "submitted", … } }`
`GET /internship/entries` → lista + `meta.extra.accepted_hours / required_hours`.
Wpis `returned` można edytować `PATCH` → status wraca na `submitted`; wpis `accepted`
→ `PATCH` = 403 `entry_locked`. `POST /admin/internship/{id}/return {comment}` →
200; brak `comment` → 422. Cudzy wpis (`GET/PATCH` po id) → 404.

### Superwizja (H12)

`POST /supervision/slots/{id}/signup` → 201 · pełny termin → **409 `slot_full`** ·
termin cudzej grupy → 403 `not_your_supervisor`.
`PATCH /instructor/slots/{id}/attendance` `{ "attendance": { "17": "present", "18": "absent" } }` → 200.
Przypisanie superwizora do wolontariusza (administracja):
`PUT /admin/users/{id}/supervisor {supervisor_id}` → 200 [audyt `supervisor.assigned`].

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

## 3. Rejestry i słowniki (enums)

### 3.1 Typy powiadomień (`Notify::send`)

MVP hackathonowy — wszystkie typy obsługuje szyna H16; emitują pakiety-właściciele:
`application.accepted` `application.rejected` (H03) · `assignment.created`
`assignment.removed` (H09) · `course.invited` (H08) · `course.unlocked` (H05 —
happy path do demo dzwonka) · `question.asked` `question.answered` (H17) ·
`internship.accepted` `internship.returned` (H11) · `attempt.failed_final` (H10) ·
`certificate.ready` (H13) · `document.ready` (H14) · `profile.accepted`
`profile.returned` (H15) · `export.ready` (H01).
Po hackathonie: `access.expiring_30d/7d`, `supervision.reminder`.

### 3.2 Rejestr zdarzeń audytowych (`AuditLog::record`) — jedyne źródło prawdy

`application.accepted` `application.rejected` (H03) · `access.extended` (H04) ·
`course.created` `course.updated` `course.deleted` (H08) · `assignment.created`
`assignment.removed` (H09) · `attempt.finished` `attempts.reset`
`workshop.completed` (H10) · `internship.accepted` `internship.returned` (H11) ·
`supervisor.assigned` (H12/H18) · `certificate.issued` (H13) · `document.generated`
(H14) · `profile.accepted` `profile.returned` (H15) · `user.created` `user.updated`
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

## 4. Czego nie robimy na hackathonie

Prawdziwe Bunny Stream (mock ze startera) · realna wysyłka e-maili (tylko `simulated`) ·
płatności · integracje zewnętrzne · 2FA · napisy do wideo · unieważnianie certyfikatów ·
anonimizacja RODO (art. 17) · ekran `#/admin/postepy` (zestawienie czterech filarów —
po hackathonie na `ProgressAggregator`) · czat pomocy · tokeny w ciasteczkach HttpOnly
(Bearer to świadome uproszczenie hackathonowe — do przeglądu po wydarzeniu).
Interfejsy są tak zaprojektowane, żeby po hackathonie podmienić mocki na realne
integracje bez zmiany kontraktu.
