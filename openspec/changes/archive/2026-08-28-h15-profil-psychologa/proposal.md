## Why

H15 (moduł M12) domyka ścieżkę absolwenta programu: po ukończeniu wszystkich
etapów wolontariusz-psycholog może złożyć wniosek o wpis do bazy psychologów
Fundacji, załączyć wymagane dokumenty, wyrazić odwołalną zgodę na publikację, a
administracja może go zweryfikować i zaakceptować albo odesłać do poprawy. Dziś
`routes/api/h15.php` jest pusty mimo gotowych migracji (`psychologist_profiles`,
`profile_documents`, `consents`, `sensitive_access_log`) i gotowego seeda —
`ola@demo.pl` jest absolwentką z profilem w stanie `draft`, gotowym do złożenia.

## What Changes

- **Wniosek uczestnika**: `GET/PATCH /psychologist-profile` (specjalizacje,
  nurt, miasto, opis) — dostępny zawsze do odczytu, ale przed
  `program_completed_at` zwraca stan `eligible: false` zamiast wymuszać twardy
  błąd, żeby zasilić ekran wyjaśniający czego brakuje (M12.1). Zapis (`PATCH`)
  i pozostałe akcje uczestnika wymagają `eligible: true`.
- `POST /psychologist-profile/submit` — blokuje dalszą edycję, zmienia status
  na `submitted`. Konto w trakcie programu → `403 profile_not_eligible`;
  eligible, ale brak wymaganych danych/załączników/zgody → `422
  profile_incomplete` z listą braków w `reason`.
- `POST /psychologist-profile/documents` (multipart) — załączniki weryfikacyjne
  (`dyplom`, `niekaralnosc`, `inne`); przyjmowane tylko przed złożeniem wniosku.
- `POST /psychologist-profile/consent/withdraw` — nowa akcja domenowa (trasa
  nieobecna w pierwotnej liście pakietu, patrz `design.md` → Open Questions):
  odwołuje zgodę na publikację niezależnie od bieżącego statusu, ustawia
  `consents.withdrawn_at`, przenosi profil do stanu `withdrawn` i informuje
  zespół administracyjny.
- **Panel administracji**: `GET /admin/profiles` (kolejka `submitted`, wzorzec
  paginacji jak H11), `GET /admin/profiles/{id}` (pełny wniosek + lista
  załączników z podpisanymi, wygasającymi `download_url`), `GET
  /admin/profiles/{id}/documents/{docId}` (pobranie pojedynczego załącznika —
  podpisany link; każdy udany dostęp zapisuje wpis w `sensitive_access_log`).
- **Decyzje administracji**: `POST /admin/profiles/{id}/accept` i `POST
  /admin/profiles/{id}/return {reason}` — audyt `profile.accepted` /
  `profile.returned` (rejestr §3.2) i powiadomienia tych samych typów (rejestr
  §3.1, oba już zarejestrowane dla H15); powtórna albo sprzeczna decyzja na
  wniosku, który nie jest już `submitted`, zwraca `403 entry_locked` bez zmiany
  wpisu (wzorzec z H11).
- **Poza zakresem tej propozycji** (decyzja użytkownika): przejście do statusu
  `published` — brak trasy w tym pakiecie; publikacja pozostaje ręczną
  operacją zespołu poza API na czas hackathonu.
- **BREAKING**: brak — pakiet dodaje wyłącznie nowe trasy we własnym pliku
  `routes/api/h15.php`, bez zmian w cudzych trasach ani w schemacie bazy.

## Capabilities

### New Capabilities

- `psychologist-profile`: cykl życia wniosku o wpis do bazy psychologów
  (`draft` → `submitted` → `accepted`/`returned`/`withdrawn`), załączniki
  weryfikacyjne chronione rejestrem wglądów, odwołalna zgoda na publikację
  oraz kolejka i decyzje administracji.

### Modified Capabilities

Brak. Żadna istniejąca specyfikacja w `openspec/specs/` nie zmienia wymagań.

## Impact

- Nowe trasy w `backend/routes/api/h15.php` (dziś puste), za flagą
  `config('features.h15')` (już `true`).
- Nowe kontrolery / FormRequesty / zasoby w
  `app/Http/{Controllers,Requests,Resources}/Api/V1/H15/...`, mirror wzorca
  H11 (`AdminInternshipController`, `ReturnInternshipEntryRequest`) i wzorca
  podpisanych pobrań z H14 (`DocumentResource::download_url`,
  `URL::temporarySignedRoute`).
- Zapis do istniejących tabel `psychologist_profiles`, `profile_documents`,
  `consents`, `sensitive_access_log` — bez zmian schematu (migracje zamrożone,
  wszystkie potrzebne kolumny już istnieją).
- Audyt: `profile.accepted`, `profile.returned` (rejestr §3.2, już
  zarejestrowane dla H15). Powiadomienia: `profile.accepted`,
  `profile.returned` (rejestr §3.1, już zarejestrowane).
- **Otwarta zależność kontraktowa**: akcja wycofania zgody wymaga nowego typu
  `profile.withdrawn` (audyt §3.2 + powiadomienie §3.1) — zgłoszenie do
  strażnika kontraktu przed implementacją tego wycinka (SLA 30 min, patrz
  `design.md`). Do czasu odpowiedzi wycofanie zgody i tak zmienia status na
  `withdrawn`, ale powiadomienie zespołu realizuje się jako pozycja w kolejce
  administracyjnej (`GET /admin/profiles?status=withdrawn`), a nie przez
  `Notify::send`.
- Frontend: ekrany `#/panel/profil-psychologa` i `#/admin/profile` (wzorzec
  ekranów H13) — w zakresie tej propozycji, szczegóły w `tasks.md`.
