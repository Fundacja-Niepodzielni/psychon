# Pomiar: przypisanie prowadzącego do osoby

Stan kodu przed dodaniem przypisania wielu osób naraz. Ścieżki zaplecza są
względem `backend/`, ścieżki frontu względem `frontend/`. Numery wierszy dotyczą
gałęzi bazowej w chwili pomiaru (2026-10-02).

## 1. Trasa pojedynczego przypisania

`PUT /api/v1/admin/users/{id}/supervisor` z ciałem `{ "supervisor_id": 5 }`.

- Rejestracja: `routes/api/h12.php:50-51`, w grupie z
  `auth:keycloak` i `role:project_manager,super_admin` (`routes/api/h12.php:44`).
  Trasa nie ma `access.active`. `{id}` musi być liczbą (`whereNumber`).
- Kontroler: `AdminSupervisionController::assignSupervisor`
  (`app/Http/Controllers/Api/V1/H12/AdminSupervisionController.php:90-104`) —
  woła usługę i zwraca `200` z `SupervisorAssignmentResource`
  (`volunteer_id`, `supervisor_id`, `assigned_at`, `unassigned_at`).
- Żądanie: `AssignSupervisorRequest`
  (`app/Http/Requests/H12/AssignSupervisorRequest.php`).
- Usługa: `SupervisorAssignmentService::assign`
  (`app/Services/H12/SupervisorAssignmentService.php:22-76`), cała w jednej
  transakcji (`:24`).

## 2. Kto może wołać

Dwie bramki, obie czytają role z tokenu (nie z kolumny `users.role`):

1. pośrednik trasy `role:project_manager,super_admin`
   (`app/Http/Middleware/EnsureRole.php:27-36`) — inna rola dostaje
   `403 forbidden` „Nie masz dostępu do tej sekcji.”;
2. `AssignSupervisorRequest::authorize` (`AssignSupervisorRequest.php:10-13`) —
   ten sam zbiór ról.

Brak albo nieważny token: `401 unauthenticated` (strażnik `auth:keycloak`).

## 3. Sprawdzenia

| Sprawdzenie | Miejsce | Wynik przy naruszeniu |
|---|---|---|
| `supervisor_id` wymagany, liczba, istnieje w `users` | `AssignSupervisorRequest.php:18` | `422 validation_failed` (`errors.supervisor_id`) |
| osoba o `{id}` istnieje | `SupervisorAssignmentService.php:25-28` | `404 not_found` „Nie znaleziono wolontariusza.” |
| osoba ma rolę `volunteer`, wskazany prowadzący ma rolę `instructor` | `SupervisorAssignmentService.php:30-37` | `422 validation_failed` „Wybierz wolontariusza i użytkownika z rolą prowadzącego.” |

- **Kogo można przypisać:** wyłącznie konto z `users.role = volunteer`.
  Student, prowadzący i administracja dostają `422`. Stan konta (`active` /
  `blocked`) nie jest sprawdzany.
- **Kto może być prowadzącym:** wyłącznie konto z `users.role = instructor`;
  stan konta też nie jest sprawdzany.
- Obie role usługa czyta z kolumny `users.role` (dotyczą innych osób niż
  wołający, więc tokenu tu nie ma).
- Oba błędy roli mają ten sam kod i to samo zdanie — z odpowiedzi nie da się
  odróżnić, czy niewłaściwą rolę ma osoba, czy wskazany prowadzący.

## 4. Skutki

- **Bez zmian, gdy to ten sam prowadzący:** jedno aktywne przypisanie do tego
  samego prowadzącego zwraca istniejący wiersz bez zapisu i bez wpisu w
  dzienniku (`SupervisorAssignmentService.php:46-48`). Wynik nadal `200`.
- **Zamknięcie poprzedniego:** każde aktywne przypisanie osoby dostaje
  `unassigned_at = teraz` (`:58-61`); historia zostaje w tabeli.
- **Nowe przypisanie:** nowy wiersz `supervisor_assignments` (`:63-67`).
- **Dziennik działań:** jeden wpis `supervisor.assigned` z polami
  `volunteer_id` i `supervisor_id`, podmiotem jest wiersz przypisania
  (`:69-72`). Filtr dziennika zna ten rodzaj (`app/Http/Requests/H20/AuditIndexRequest.php:25`).
- **Powiadomienia:** brak. Ani usługa, ani kontroler nie wołają
  `Notify::send`; w rejestrze typów powiadomień nie ma typu dla przypisania
  prowadzącego.
- **Rozmowy (czat):** usługa nie dotyka tabel czatu. Wszystko, co zmienia się
  w rozmowach, wynika z tego, że czat czyta aktywne przypisania na żywo:
  - wątek grupowy prowadzącego widzą osoby z jego aktywnymi przypisaniami
    (`app/Services/Chat/ChatThreadQuery.php:36-50`, warunek `unassigned_at`
    w `:48`) — po zmianie osoba wypada z grupy poprzedniego prowadzącego i
    trafia do grupy nowego;
  - lista wątków (`GET /threads`, `app/Http/Controllers/Api/V1/Chat/ThreadController.php:58-88`)
    zakłada i pokazuje rozmowę indywidualną tylko dla aktywnej pary: osoba
    widzi rozmowę z nowym prowadzącym, nowy prowadzący — z nią, a na liście
    poprzedniego prowadzącego tej rozmowy już nie ma;
  - odbiorcy powiadomień o wiadomości w wątku grupowym to aktywny skład
    (`app/Services/Chat/ChatMessageService.php:75-85`).
  - Jest uwaga dotycząca bezpieczeństwa — przekażę ją ustnie.
- **Inny wołający tej samej usługi:** dodanie osoby do wątku grupowego przez
  prowadzącego (`app/Http/Controllers/Api/V1/Chat/ThreadMemberController.php:51`)
  woła `assign` z `requireNoConflict = true` — wtedy osoba z innym aktywnym
  prowadzącym daje `409 volunteer_already_assigned` zamiast przepisania.

## 5. Pola odpowiedzi listy i karty (przed zmianą)

`GET /admin/users` — wiersz `AdminUserListResource`
(`app/Http/Resources/AdminUserListResource.php:20-47`): `id`, `first_name`,
`last_name`, `email`, `role`, `status`, `product_group`, `access_expires_at`,
`program_completed_at`, `created_at`. Stała `FIELDS` jest jednocześnie
nagłówkiem pliku CSV (`AdminUserController::export`, `:249-256`).
**Brak bieżącego prowadzącego.**

`GET /admin/users/{id}` — karta `AdminUserCardResource`
(`app/Http/Resources/AdminUserCardResource.php:86-140`): `profile` (kształt
`/me`: `id`, imię, nazwisko, e-mail, `role`, `roles`, telefon, PESEL, adres,
`access_expires_at`, `program_completed_at`, `product_group`), `progress`,
`documents`, `recent_notifications`, `audit_entries`.
**Brak bieżącego prowadzącego, stanu konta (`status`) i daty założenia konta
(`created_at`).**

Front: typy `AdminUserListItem` i `AdminUserCard` (`lib/api/h18.ts:17-70`)
odpowiadają temu kształtowi. Pojedyncze przypisanie woła dziś karta osoby
(`nowy-front/karta-osoby/PrzypisanieSuperwizora.tsx`) i stary ekran
(`components/h12/AssignSupervisor.tsx`); obie listy kandydatów biorą z
`GET /admin/users?role=instructor&per_page=100`.

## 6. Wnioski dla przypisania wielu osób

- Zaznaczyć na liście można tylko wiersz osoby z rolą „Wolontariusz” — tylko
  taką osobę serwer przypisze.
- Prowadzącego wybiera się spośród osób z rolą „Psycholog prowadzący”.
- Nowa trasa woła tę samą usługę osobno dla każdej osoby, więc każda dostaje
  dokładnie te same skutki co przy pojedynczym przypisaniu: jeden wpis w
  dzienniku przy zmianie, zero wpisów bez zmiany, zero powiadomień i tę samą
  zmianę w rozmowach.
