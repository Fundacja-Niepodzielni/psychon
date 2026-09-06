## Why

Pakiet H16 (moduł M13, priorytet P0) — powiadomienia, dzwonek i e-maile symulowane — jest
scalony do `main` (bezpośrednio, bez PR — świadoma decyzja właściciela repozytorium,
odnotowana w `DEMO/H16.md`) i oznaczony `DONE` na tablicy koordynacji. Podobnie jak H01,
pakiet powstał zanim zespół zaczął prowadzić proces OpenSpec dla H01–H21, więc
`openspec/specs/` nie ma zdolności opisującej `GET /notifications`,
`POST /notifications/{id}/read`, `POST /notifications/read-all` ani
`GET /admin/emails`.

Ta zmiana nie modyfikuje kodu — to retroaktywne udokumentowanie zachowania, które już działa
na `main`. Źródła: `backend/routes/api/h16.php`, `NotificationController`,
`Admin/EmailController`, `app/Support/Notify.php` (szyna startera, niezmieniona przez H16),
migracja `2026_01_01_000090_create_communication_tables.php`, testy
`tests/Feature/Notifications/{NotifySendTest,NotificationsEndpointTest,AdminEmailsTest}.php`
oraz `DEMO/H16.md`.

## What Changes

- **Skrzynka powiadomień właściciela** — `GET /notifications` zwraca wyłącznie powiadomienia
  zalogowanego użytkownika, posortowane malejąco po dacie utworzenia, z licznikiem
  nieprzeczytanych w `meta.extra.unread`.
- **Oznaczenie pojedynczego powiadomienia** — `POST /notifications/{id}/read` jest
  idempotentne (ustawia `read_at` tylko przy pierwszym wywołaniu); cudze albo nieistniejące
  `id` zwraca **404 `not_found`**, nigdy 403 — zgodnie z zasadą nieujawniania istnienia
  cudzego zasobu wskazywanego identyfikatorem (kontrakt §1.1).
- **Oznaczenie wszystkich jako przeczytane** — `POST /notifications/read-all` aktualizuje
  wyłącznie nieprzeczytane powiadomienia wywołującego, nie dotyka innych użytkowników.
- **Szyna `Notify::send`** (dostarczona przez starter, zamrożona sygnatura — H16 z niej
  korzysta, jej nie zmienia) — każde wywołanie w jednej transakcji tworzy dokładnie jedno
  powiadomienie **i** dokładnie jeden symulowany e-mail; nie ma trybu bez e-maila ani
  preferencji/opt-outu.
- **Status e-maila zawsze `simulated`** — żaden e-mail nigdy nie opuszcza systemu; nie ma
  prawdziwej integracji SMTP/Mailpit w tej ścieżce (Mailpit obsługuje inne, niezależne od
  H16 przepływy startera).
- **Skrzynka e-maili tylko dla administracji** — `GET /admin/emails` (bez podziału per
  użytkownik) dostępne wyłącznie dla ról `project_manager` i `super_admin`; inna rola → 403
  `forbidden`.
- **Dzwonek w panelu** — `NotificationBell` w `PanelShell` (widoczny we wszystkich panelach):
  odpytywanie co 30 s, licznik nieprzeczytanych (limit wyświetlania „9+"), kliknięcie
  nawiguje pod `link` i oznacza jako przeczytane optymistycznie, przycisk „oznacz wszystkie".
- **Ekran `/admin/emails`** — tabela odbiorca/temat/status/czas z podglądem treści w modalu;
  brak osobnej trasy podglądu — modal korzysta z danych już pobranych w liście.

## Capabilities

### New Capabilities

- `notification-inbox-emails`: własna skrzynka powiadomień z licznikiem nieprzeczytanych
  i oznaczaniem jako przeczytane (pojedynczo i zbiorczo), wspólna szyna tworząca
  powiadomienie + symulowany e-mail atomowo dla dowolnego typu z rejestru kontraktu, oraz
  administracyjny wgląd w wysłane (symulowane) e-maile.

### Modified Capabilities

Brak — H16 nie zmienia wymagań żadnej istniejącej zdolności; jest konsumowana przez inne
pakiety (H01, H05, H10, H11, H13, H14), które wołają `Notify::send` z własnymi typami.

## Impact

**Kod (już scalony, bez zmian w tej propozycji)**

- `backend/routes/api/h16.php`,
  `app/Http/Controllers/Api/V1/NotificationController.php`,
  `app/Http/Controllers/Api/V1/Admin/EmailController.php`,
  `app/Http/Resources/{NotificationResource,EmailResource}.php`,
  `app/Support/Notify.php` (starter, niezmieniony), modele `Notification`, `EmailMessage`,
  migracja `2026_01_01_000090_create_communication_tables.php`.
- `frontend/components/notifications/NotificationBell.tsx` (wpięty w `PanelShell.tsx`),
  `frontend/app/(administracja)/admin/emails/page.tsx`,
  `frontend/lib/{notifications/types.ts,menu/admin/h16-emails.ts}`.
- Testy: `tests/Feature/Notifications/{NotifySendTest,NotificationsEndpointTest,
  AdminEmailsTest}.php` (13 testów H16), plus wiersze H16 w
  `tests/Feature/PermissionMatrix/PermissionMatrixTest.php` (H02).

**Kontrakt** — trasy, koperty i rejestr typów powiadomień §3.1 są już w
`docs/hackathon/02-kontrakt-api.md`; ta zmiana niczego w kontrakcie nie modyfikuje.

**Świadomie udokumentowane odstępstwa i obserwacje (z `DEMO/H16.md` i analizy kodu)**

1. Scalono bezpośrednio do `main` bez PR — jednorazowa decyzja właściciela repozytorium,
   odnotowana jako odstępstwo od standardowego przepływu pakietu.
2. Z 16 typów powiadomień w rejestrze §3.1 tylko 7 ma dziś rzeczywiste miejsce wywołania
   (`course.unlocked`, `internship.accepted`, `internship.returned`, `attempt.failed_final`,
   `certificate.ready`, `document.ready`, `export.ready`) — pozostałe (H03, H08, H09, H15,
   H17) nie są jeszcze podłączone przez swoich właścicieli; szyna działa dla dowolnego typu,
   więc nie jest to ograniczenie H16.
3. Kolumna `emails.status` ma w schemacie miejsce na `queued`/`sent`/`failed`, ale w
   praktyce `Notify::send` zawsze zapisuje `simulated` — pozostałe wartości to zapas
   schematu/UI, nie osiągalny stan.
4. Brak wpisu w rejestrze audytu §3.2 dla H16 — pakiet nie generuje własnych zdarzeń
   audytowych (audytuje je pakiet-nadawca, jeśli w ogóle).

**Poza zakresem** — prawdziwa wysyłka e-maili (§4 kontraktu: „symulowane"), preferencje
powiadomień/opt-out, `access.expiring_30d/7d` i `supervision.reminder` (jawnie
post-hackathonowe w rejestrze §3.1).
