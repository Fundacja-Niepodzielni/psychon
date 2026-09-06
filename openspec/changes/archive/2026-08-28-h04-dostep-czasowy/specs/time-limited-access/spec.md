## Purpose

Czasowy limit dostępu do treści programu (materiały ważne 6 miesięcy, bezterminowo
po ukończeniu): egzekwowanie na żywo w middleware, przedłużenie przez administrację z
audytem, zadanie cykliczne o widoczności operacyjnej oraz ekran wygaśnięcia na
froncie.

## ADDED Requirements

### Requirement: Egzekwowanie limitu czasowego na treściach programu

System SHALL blokować dostęp do trasy treści programu odpowiedzią 403
`access_expired`, gdy `users.access_expires_at` jest w przeszłości ORAZ
`users.program_completed_at` jest `null`. Middleware `access.active`
(`EnsureAccessActive`) MUST być dołączany przez każdy pakiet-właściciela do własnych
tras treści programu — nie jest egzekwowany globalnie.

#### Scenario: Wygasły dostęp blokuje treść programu

- **WHEN** uczestnik z `access_expires_at` w przeszłości i bez ukończonego programu
  woła trasę treści programu (np. `GET /documents`, `GET /internship/entries`,
  `GET /certificate/conditions`)
- **THEN** odpowiedź ma status 403 z `error.code` = `access_expired`

#### Scenario: Brak daty wygaśnięcia nigdy nie blokuje

- **WHEN** uczestnik z `access_expires_at = null` woła trasę treści programu
- **THEN** żądanie przechodzi bez blokady 403 `access_expired`

#### Scenario: Data wygaśnięcia w przyszłości nie blokuje

- **WHEN** uczestnik z `access_expires_at` w przyszłości woła trasę treści programu
- **THEN** żądanie przechodzi bez blokady 403 `access_expired`

### Requirement: Ukończenie programu znosi limit bezterminowo

System SHALL traktować niepuste `users.program_completed_at` jako zniesienie limitu
czasowego, niezależnie od wartości `access_expires_at`.

#### Scenario: Ukończony program działa mimo dawno wygasłej daty

- **WHEN** uczestnik ma `access_expires_at` sprzed roku i `program_completed_at`
  ustawione
- **THEN** trasy treści programu odpowiadają 200, nie 403 `access_expired`

### Requirement: Wyjątki od limitu czasowego

System SHALL NOT egzekwować `access.active` na trasach logowania, profilu, eksportu
RODO ani onboardingu — te trasy MUST pozostać dostępne niezależnie od stanu
`access_expires_at`.

#### Scenario: Logowanie działa mimo wygasłego dostępu

- **WHEN** użytkownik z `access_expires_at` sprzed roku woła `POST /auth/login` z
  poprawnym hasłem
- **THEN** odpowiedź ma status 200 z tokenem

#### Scenario: Profil, eksport i onboarding działają mimo wygasłego dostępu

- **WHEN** uczestnik z wygasłym dostępem woła `GET /me`, `PATCH /me`,
  `POST /me/exports` albo `GET /onboarding`
- **THEN** każda odpowiedź ma status zgodny z happy pathem (200 albo 202), nie 403
  `access_expired`

### Requirement: Przedłużenie dostępu przez administrację

System SHALL udostępniać `POST /admin/users/{id}/extend-access` wyłącznie rolom
`project_manager` i `super_admin`. Żądanie MUST podać dokładnie jedno z: `months`
(liczba całkowita 1–60) albo `until` (data). Podanie obu, żadnego, albo wartości
spoza zakresu MUST zwrócić 422 `validation_failed`. Nieznane `id` MUST zwrócić 404
`not_found`.

Gdy podano `months`: nowa data SHALL być sumą bieżącej `access_expires_at` i liczby
miesięcy, jeśli bieżąca data jest jeszcze w przyszłości; w przeciwnym razie (data
wygasła albo `null`) SHALL być liczona od chwili żądania. Gdy podano `until`: nowa
data SHALL być ustawiona wprost, bez ograniczenia do przyszłości.

Operacja SHALL zapisać zdarzenie audytowe `access.extended` z aktorem (kto), podmiotem
(komu) oraz nową i poprzednią datą wygaśnięcia (do kiedy).

#### Scenario: Przedłużenie w miesiącach sumuje się z aktywną datą

- **WHEN** administracja przedłuża o `{"months": 1}` konto z `access_expires_at` za
  miesiąc
- **THEN** nowa `access_expires_at` przypada za dwa miesiące od chwili operacji

#### Scenario: Przedłużenie w miesiącach od wygasłej daty liczy się od teraz

- **WHEN** administracja przedłuża o `{"months": 1}` konto z `access_expires_at`
  sprzed roku
- **THEN** nowa `access_expires_at` przypada za miesiąc od chwili operacji, nie od
  starej daty

#### Scenario: Przedłużenie datą wprost ustawia ją dokładnie

- **WHEN** administracja przedłuża o `{"until": "<data>"}`
- **THEN** `access_expires_at` konta jest ustawiona dokładnie na podaną datę

#### Scenario: Przedłużenie zapisuje kto, komu i do kiedy

- **WHEN** administracja przedłuża dostęp dowolnemu kontu
- **THEN** powstaje wpis audytowy `access.extended` z `actor_id` administracji,
  `subject_id`/`subject_type` konta i `details.access_expires_at` nowej daty

#### Scenario: Rola bez uprawnień jest odrzucona

- **WHEN** `volunteer`, `student` albo `instructor` woła
  `POST /admin/users/{id}/extend-access`
- **THEN** odpowiedź ma status 403 z `error.code` = `forbidden`

### Requirement: Zadanie cykliczne o widoczności operacyjnej

System SHALL udostępniać komendę `access:check-expired`, zaplanowaną codziennie,
która liczy konta z `access_expires_at` w przeszłości i `program_completed_at`
pustym oraz zapisuje ich liczbę i identyfikatory w logu operacyjnym. Zadanie SHALL
NOT tworzyć wpisu audytowego ani powiadomienia — rejestry §3.1/§3.2 nie mają sluga
dla samego wygaśnięcia dostępu. Zadanie SHALL NOT samodzielnie blokować dostępu —
egzekwowanie pozostaje wyłącznie w `EnsureAccessActive` przy każdym żądaniu.

#### Scenario: Zadanie loguje konta z wygasłym dostępem

- **WHEN** w bazie istnieje jedno konto z `access_expires_at` w przeszłości i bez
  ukończonego programu, obok kont z aktywnym, bezterminowym albo ukończonym dostępem
- **THEN** log operacyjny zawiera dokładnie jeden wpis z liczbą 1 i identyfikatorem
  tego konta

#### Scenario: Zadanie nic nie loguje, gdy brak wygasłych kont

- **WHEN** żadne konto nie ma `access_expires_at` w przeszłości bez ukończonego
  programu
- **THEN** zadanie kończy się sukcesem bez wpisu w logu operacyjnym

### Requirement: Ekran wygaśnięcia na froncie

Frontend SHALL przekierowywać na `/dostep-wygasl` po odebraniu odpowiedzi 403 z
`error.code` = `access_expired` z dowolnej trasy API.

#### Scenario: Wygasły dostęp przekierowuje na ekran wygaśnięcia

- **WHEN** dowolne żądanie API zwraca 403 `access_expired`
- **THEN** przeglądarka jest przekierowana na `/dostep-wygasl`
