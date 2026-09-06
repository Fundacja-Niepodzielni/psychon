## Why

Administracja nie ma dziś jednego miejsca, w którym widać „na czym stoi każda
osoba": listy uczestniczek z filtrem roli i wyszukiwarką, karty osoby z profilem,
postępami z `ProgressAggregator`, dokumentami, ostatnimi powiadomieniami i wpisami
audytu. `routes/api/h18.php` jest pustym stubem, a grupa tras `#/admin/uczestniczki`
oraz karta osoby nie istnieją. Bez tego pakietu nie da się prowadzić kont
(tworzenie z zaproszeniem, edycja e-maila z audytem) ani blokować dostępu z
powodem odróżnialnym od „dostęp wygasł" (M2).

## What Changes

- `GET /admin/users` — paginowana lista kont z płaskimi filtrami `role`,
  wyszukiwaniem `search` (imię, nazwisko, e-mail) i sortowaniem `sort=-created_at`;
  koperta `{data, meta}` z paginacją.
- `GET /admin/users/{id}` — karta osoby w kopercie, dokładnie w kształcie z
  kontraktu §2 (H18): `profile` (jak `/me`, z pełnym PESEL dla administracji),
  `progress` z `ProgressAggregator::for` (te same liczby, co pulpit, raport i
  warunki certyfikatu), `documents`, `recent_notifications`, `audit_entries`
  dotyczące tej osoby.
- `POST /admin/users` — utworzenie konta z tokenem aktywacyjnym i symulowanym
  e-mailem zaproszenia (link `auth/activate`); audyt `user.created`.
- `PATCH /admin/users/{id}` — edycja pól konta, w tym `email` (jedyna droga zmiany
  e-maila w systemie, kontrakt §2 H01); audyt `user.updated`.
- `POST /admin/users/{id}/block {reason}` — zablokowanie konta z wymaganym
  powodem; audyt `user.blocked`. Zablokowany użytkownik przy logowaniu dostaje
  komunikat o blokadzie, nie o wygaśnięciu dostępu (rozróżnienie z H04).
- `GET /admin/users/export.csv` — eksport listy wspólnym helperem `Csv`
  (UTF-8 BOM, separator `;`), z tym samym zestawem filtrów co lista.
- Matryca ról: `project_manager` nie utworzy ani nie nada roli `super_admin`
  (403 `forbidden`); pełne uprawnienia ma tylko `super_admin`. Wszystkie trasy za
  `role:project_manager,super_admin`.
- Frontend: grupa tras `app/(administracja)/admin/uczestniczki` (lista) oraz
  `app/(administracja)/admin/uczestniczki/[id]` (karta osoby), wpis w rejestrze
  menu administracji, wywołania w `lib/api.ts`.

## Capabilities

### New Capabilities

- `admin-people`: panel osób administracji — paginowana i filtrowana lista kont
  (`GET /admin/users`), karta osoby w kształcie kontraktu z profilem, postępami z
  `ProgressAggregator`, dokumentami, powiadomieniami i audytem
  (`GET /admin/users/{id}`), zarządzanie kontami (`POST /admin/users`,
  `PATCH /admin/users/{id}`) z audytem `user.created` / `user.updated`,
  blokowanie z powodem (`POST /admin/users/{id}/block`) z audytem `user.blocked`
  i odrębnym komunikatem logowania, eksport CSV (`GET /admin/users/export.csv`)
  wspólnym helperem, oraz reguła matrycy ról chroniąca rolę `super_admin`.

### Modified Capabilities

Brak. Pakiet konsumuje istniejące fasady startera (`ProgressAggregator`,
`AuditLog`, `Csv`, `Notify`/skrzynka e-mail) bez zmiany ich kontraktu i nie
zmienia zachowania istniejących tras. Obsługa `status = blocked` przy logowaniu
istnieje już w starterze (`AuthController`); pakiet dodaje jedynie test
rozróżnienia z komunikatem o wygaśnięciu.

## Impact

- Nowe pliki backend: rejestracja tras w `backend/routes/api/h18.php`,
  kontroler(-y) w `app/Http/Controllers/Api/V1/Admin`, `FormRequest` dla
  `POST /admin/users`, `PATCH /admin/users/{id}` i `POST .../block`,
  `Resource`(-y) listy i karty osoby, zapytanie listy z filtrami, testy
  feature/unit.
- Zapis wyłącznie do tabeli `users` (kolumny istnieją: `status`,
  `activation_token`, adres, `pesel`, `product_group`, `access_expires_at`).
  Odczyt wielu tabel przez `ProgressAggregator` oraz `documents`,
  `notifications`, `audit_log_entries`.
- Brak zmian w migracjach i brak nowych zależności composer/npm.
- Frontend: nowe strony w `app/(administracja)/admin/uczestniczki`, wpis
  `lib/menu/admin/h18-*.ts`, wywołania w `lib/api.ts`; layout i `PanelShell`
  bez zmian (staff-owned).
- Zależność współdzielona: endpoint przypisania superwizora
  (`PUT /admin/users/{id}/supervisor`) NIE należy do H18 — jest poza zakresem
  pakietu (blokada H12), karta osoby prezentuje superwizora tylko do odczytu,
  jeśli dane są dostępne.
- Otwarta kwestia do potwierdzenia u strażnika kontraktu: brak typu powiadomienia
  dla zaproszenia z `POST /admin/users` w rejestrze §3.1 — pakiet zakłada zapis
  rekordu e-mail o statusie `simulated` bez wpisu „dzwonka".
