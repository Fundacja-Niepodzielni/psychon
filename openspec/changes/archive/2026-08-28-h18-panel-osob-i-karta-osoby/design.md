## Context

Zob. `proposal.md` — Why. Stan obecny: `backend/routes/api/h18.php` to pusty stub
z komentarzem nagłówkowym; `config('features.h18')` jest `true`. Fasady startera są
gotowe do konsumpcji:

- `ProgressAggregator::for(User): array{courses_done, courses_total, hours_accepted,
  supervision_present, workshop_done, reliability_percent}` — FROZEN SIGNATURE,
  jedyne źródło liczb postępu (ta sama funkcja zasila H13/H19/H20).
- `AuditLog::record(actor, action, subject?, details?)` — sluggi wyłącznie z §3.2.
- `Csv::download(name, iterable $rows)` — BOM + `;`, FROZEN SIGNATURE.
- `Notify::send(...)` wymaga typu z §3.1; `EmailMessage` (`emails`) przyjmuje
  rekord `simulated` bezpośrednio.
- `EnsureRole` middleware (`role:project_manager,super_admin`) → 403 `forbidden`.
- `ProfileResource` (kształt `/me`, pełny PESEL dla właściciela/administracji) —
  własność integracyjna, konsumowana bez zmian.

Kolumny `users` pod zapis już istnieją (`status`, `activation_token`, adres,
`pesel`, `product_group`, `access_expires_at`). Migracje są zamrożone — pakiet
niczego nie dodaje.

## Goals / Non-Goals

**Goals:**

- Jeden `AdminUserController` obsługujący listę, kartę, tworzenie, edycję,
  blokadę i eksport CSV, zarejestrowany w `routes/api/h18.php` za wspólnym
  `role:project_manager,super_admin`.
- Karta osoby składa dokładnie pięć bloków z kontraktu §2 (H18) z jednego zapytania.
- Liczby postępu pochodzą wyłącznie z `ProgressAggregator::for` — brak własnych
  zliczeń w tym pakiecie.
- Reguła matrycy ról chroniąca `super_admin` egzekwowana przed jakimkolwiek
  zapisem i audytem.

**Non-Goals:**

- `PUT /admin/users/{id}/supervisor` (przypisanie superwizora) — poza zakresem
  H18, blokuje H12; karta pokazuje superwizora tylko do odczytu, jeśli dane są.
- Pełna matryca uprawnień per rola per akcja — implementujemy wyłącznie regułę
  testowaną w kryteriach H18 (ochrona roli `super_admin`).
- Odblokowanie konta, usuwanie kont, reset dostępu — nie ma tras w kontrakcie.
- `sensitive.viewed` przy otwarciu karty — §3.2 wiąże ten slug z H03/H15, nie H18.
- Zmiana `ProfileResource` / `/me` / `PanelShell` / rejestru menu jako plików
  współdzielonych (dodajemy tylko własny wpis menu).

## Decisions

### D1: Jeden kontroler zasobowy zamiast kontrolera na akcję

`AdminUserController` z metodami `index`, `show`, `store`, `update`, `block`,
`export`. Alternatywa (osobne kontrolery jednometodowe jak w H19) odrzucona —
tu akcje dzielą to samo zapytanie bazowe (`index` + `export`) i te same reguły
autoryzacji, więc wspólny kontroler zmniejsza duplikację. Zapytanie listy
wydzielone do `AdminUserQuery` (filtry `role`, `status`, `search`, `sort`),
używane przez `index` i `export`.

### D2: Karta osoby — dedykowany Resource składający istniejące kształty

`AdminUserCardResource` zwraca `{profile, progress, documents,
recent_notifications, audit_entries}`. `profile` = `ProfileResource::make($user)`
(reużycie kształtu `/me`, bez maskowania — administracja widzi PESEL, kontrakt §2).
`progress` = wybór pięciu kluczy z `ProgressAggregator::for($user)` w kolejności
z kontraktu (`reliability_percent` pomijamy — nie ma go w przykładzie §2 H18).
Alternatywa (własny kształt profilu) odrzucona — kryterium 3★ wymaga „dokładnie
jak `/me`”, a duplikacja kształtu grozi rozjazdem.

### D3: `audit_entries` = wpisy, których podmiotem jest ta osoba

Filtr `subject_type = User::class AND subject_id = {id}`, sort `created_at` desc,
limit (np. 20). Nie włączamy wpisów, gdzie osoba jest `actor` — karta odpowiada
na pytanie „co się z tą osobą działo”, nie „co ta osoba zrobiła”. Do potwierdzenia
w review, jeśli pojawi się inna interpretacja — nie zmienia kontraktu HTTP.

### D4: Reguła matrycy ról w `FormRequest` + strażnik w kontrolerze

Walidacja `role` w `StoreUserRequest` / `UpdateUserRequest`; dodatkowo w
kontrolerze przed zapisem: jeśli `actor->role === 'project_manager'` oraz
(żądana `role` == `super_admin` lub `target->role == 'super_admin'`) →
`ApiException(403, 'forbidden')`. Rzut przed `AuditLog::record`, więc audyt nie
rośnie. To samo dotyczy `POST .../block` dla celu `super_admin`. Alternatywa
(rozszerzanie `EnsureRole` / test-kitu H02) odrzucona — H02 jest własnością
innego zespołu i `DONE`; nie ruszamy jego plików.

### D5: Zaproszenie jako rekord `emails` o statusie `simulated`

`POST /admin/users` generuje `activation_token` (`Str::random(64)`), tworzy konto
`status=active` bez hasła, po czym zapisuje `EmailMessage` (`status=simulated`,
temat/treść z linkiem `auth/activate`) bezpośrednio, bez `Notify::send` — bo §3.1
nie ma typu powiadomienia dla zaproszenia z panelu (§3.1 wymienia tylko
`application.accepted` dla ścieżki H03). Zapisujemy pytanie do strażnika kontraktu
(Open Questions); jeśli strażnik wskaże typ, podmieniamy zapis na `Notify::send`
bez zmiany trasy ani odpowiedzi.

### D6: Kolumny listy i CSV wspólne

Zestaw pól: `id, first_name, last_name, email, role, status, product_group,
access_expires_at, program_completed_at, created_at`. `AdminUserListResource`
dla JSON; `export` mapuje te same pola na wiersze do `Csv::download`
(`admin-users.csv`), z wierszem nagłówka. Daty w CSV w ISO 8601 UTC (spójnie z API).

### D7: Blokada nie dotyka logiki logowania

`AuthController` już zwraca odrębny komunikat dla `status === 'blocked'`
(starter, plik staff-owned). H18 ustawia tylko `status=blocked` i dodaje test
feature potwierdzający rozróżnienie komunikatu blokady od `access_expired` (H04).

### D8: Frontend — nowa grupa tras pod `(administracja)`

`app/(administracja)/admin/uczestniczki/page.tsx` (lista: filtr roli, szukajka,
paginacja, przycisk „Eksport CSV”) oraz
`app/(administracja)/admin/uczestniczki/[id]/page.tsx` (karta: pięć sekcji).
Wpis menu `lib/menu/admin/h18-uczestniczki.ts` (`order` po `h19` i `h16`),
dopięty jedną linią w `lib/menu/admin/index.ts`. Wywołania w `lib/api.ts`
(`adminUsers`, `adminUser`, `createAdminUser`, `updateAdminUser`, `blockAdminUser`;
CSV przez bezpośredni link z tokenem lub pobranie bloba). `layout.tsx` grupy
`(administracja)` już wymusza `RequireRole` — nie zmieniamy go.

## Risks / Trade-offs

- [Brak typu powiadomienia dla zaproszenia w §3.1] → zapis `emails` bez „dzwonka”;
  pytanie do strażnika kontraktu, podmiana lokalna jeśli slug powstanie.
- [`ProgressAggregator` liczy `courses_total` z kursów `type=course`,
  `is_published=true`, `sequence_order` not null] → jeśli seed demo daje inną
  wartość niż 10 dla marty, to błąd seedera (poprawia strażnik schematu), nie
  pakietu; test karty asertuje wartości z `04-seed-demo.md`.
- [Reużycie `ProfileResource` (plik integracyjny)] → tylko odczyt, zero edycji;
  gdyby staff zmienił jego kształt, karta podąża automatycznie (pożądane).
- [Jedna reguła matrycy zamiast pełnej] → świadome ograniczenie MVP; udokumentowane
  w Non-Goals, pełna matryca po hackathonie.
- [Filtry `export.csv` = filtry listy] → trzeba trzymać jeden `AdminUserQuery`,
  inaczej rozjazd wyniku listy i eksportu; wymuszone współdzieleniem klasy.
- [`search` po zaszyfrowanym `pesel`/adresie] → wyszukiwanie tylko po
  `first_name`, `last_name`, `email` (kolumny jawne); po polach szyfrowanych
  aplikacyjnie nie da się filtrować w SQL — świadomie poza zakresem `search`.

## Open Questions

- Czy strażnik kontraktu doda typ powiadomienia dla zaproszenia z
  `POST /admin/users`? Jeśli tak — zamiana zapisu `EmailMessage` na `Notify::send`
  (bez zmiany trasy, odpowiedzi ani specyfikacji).
- Czy `audit_entries` na karcie mają w przyszłości obejmować także akcje, w
  których osoba jest `actorem`? Domyślnie: nie (D3). Zmiana nie rusza kontraktu.
