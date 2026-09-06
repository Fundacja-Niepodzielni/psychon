## Why

Pakiet H01 (moduł M2, priorytet P0) — profil użytkownika i eksport RODO — jest scalony do
`main` i oznaczony `DONE` na tablicy koordynacji od fali P0 (`DEMO/H01.md` istnieje, testy
przechodzą). Pakiet powstał jednak zanim zespół zaczął prowadzić proces OpenSpec dla H01–H21,
więc `openspec/specs/` nie ma zdolności opisującej `GET /me`, `PATCH /me` ani eksport RODO —
w przeciwieństwie do H02, H04, H05, H06, H10, H11, H12, H13, H14, H19 i H21, które już mają
swoją zdolność w drzewie specyfikacji.

Ta zmiana nie modyfikuje kodu — to retroaktywne udokumentowanie zachowania, które już działa
na `main`, żeby `openspec/specs/` było kompletnym źródłem prawdy o stanie produktu. Źródła:
`backend/routes/api/h01.php`, `ProfileController`, `UpdateProfileRequest`, `Pesel` (reguła
walidacji), `DataExport` + `GenerateDataExport` (kolejka), testy
`tests/Feature/H01/{ProfileTest,DataExportTest}.php` oraz `DEMO/H01.md`.

## What Changes

- **Profil właściciela** — `GET /me` zwraca pełny profil zalogowanego użytkownika, w tym
  **pełny numer PESEL** (bez maskowania — maskowanie dla innych widoków, np. karty osoby
  w H18, jest poza zakresem H01) oraz listę zgód (`consents`) ze statusem wyliczonym
  (`granted`/`withdrawn`).
- **Aktualizacja profilu z polem `email` tylko do odczytu** — `PATCH /me` przyjmuje
  `first_name`, `last_name`, `phone`, `pesel`, zagnieżdżony `address{street,city,zip}`.
  Pole `email` jest **po cichu ignorowane** (usuwane przed walidacją) — żądanie z `email`
  kończy się sukcesem (200), a adres e-mail pozostaje niezmieniony; to nie jest błąd 422/403.
- **Walidacja numeru PESEL** — dokładnie 11 cyfr, poprawna data urodzenia zakodowana
  w miesiącu (offset dekady wieku), poprawna suma kontrolna; błąd → 422 `validation_failed`
  z komunikatem `"Nieprawidłowy numer PESEL."` pod `error.errors.pesel`.
- **Zlecenie eksportu danych RODO** — `POST /me/exports` tworzy zadanie w tle
  (`GenerateDataExport`), zwraca 202 ze statusem `queued`.
- **Zawartość eksportu — pięć zakresów** — profil, zgody, postęp (z `ProgressAggregator`
  i liczników lekcji), wpisy stażu, metadane dokumentów (bez samych plików PDF). Plik JSON
  trafia na dysk `local`, eksport przechodzi `queued` → `processing` → `ready`/`failed`.
- **Pobranie eksportu i ochrona własności** — `GET /me/exports/{id}` (status) oraz
  `GET /me/exports/{id}/download` (plik) są dostępne wyłącznie właścicielowi; cudzy albo
  nieistniejący `id` zwraca **404 `not_found`** w obu przypadkach — nie ma odrębnej ścieżki
  403, bo istnienie cudzego eksportu nie jest ujawniane (kontrakt §1.1).
- **Powiadomienie bez wpisu audytu** — udany eksport wywołuje
  `Notify::send(..., 'export.ready', ...)` z linkiem do `/panel/profil`. H01 **świadomie nie
  woła `AuditLog::record`** dla edycji profilu ani eksportu — rejestr audytu (kontrakt §3.2,
  jedyne źródło prawdy) nie definiuje sluga dla `export.*`, więc brak wpisu jest zgodny
  z kontraktem, nie luką.
- **Ekran `/panel/profil`** — formularz danych osobowych z wyszarzonym polem e-mail, karta
  zgód, karta eksportu RODO z odpytywaniem statusu co 2 s i pobraniem pliku przez `fetch`
  z nagłówkiem `Authorization` (nie przez `<a href>`, żeby token nie trafił do URL-a).

## Capabilities

### New Capabilities

- `profile-gdpr-export`: odczyt i edycja własnego profilu (z regułą tylko-do-odczytu na
  `email` i walidacją PESEL) oraz samoobsługowy eksport danych RODO — zlecenie, status,
  zawartość pięciu zakresów danych, pobranie chronione własnością, powiadomienie o gotowości.

### Modified Capabilities

Brak — H01 nie zmienia wymagań żadnej istniejącej zdolności w drzewie specyfikacji.

## Impact

**Kod (już scalony, bez zmian w tej propozycji)**

- `backend/routes/api/h01.php`, `app/Http/Controllers/Api/V1/ProfileController.php`,
  `app/Http/Requests/H01/UpdateProfileRequest.php`, `app/Rules/Pesel.php`,
  `app/Http/Resources/{ProfileResource,DataExportResource}.php`,
  `app/Jobs/GenerateDataExport.php`, `app/Models/DataExport.php`,
  migracja `2026_01_02_000000_create_data_exports_table.php`.
- `frontend/app/(uczestnik)/panel/profil/page.tsx`,
  `frontend/lib/menu/participant/h01-profil.ts`.
- Testy: `backend/tests/Feature/H01/{ProfileTest,DataExportTest}.php` (11 testów).

**Kontrakt** — trasy i kształty odpowiedzi są już w `docs/hackathon/02-kontrakt-api.md` §2
(„Ja / profil"); ta zmiana niczego w kontrakcie nie modyfikuje.

**Świadomie udokumentowane odstępstwa (z `DEMO/H01.md`, przeniesione tu dla kompletności)**

1. Karta pakietu H01 wymienia jako edytowalne wyłącznie telefon/adres/PESEL, z `email` jako
   jedynym polem tylko-do-odczytu — zespół uczynił edytowalnymi również `first_name`
   i `last_name` (uzasadnione jako mieszczące się w zakresie modułu M2 pkt 3). Zachowanie już
   działa na `main`; ta specyfikacja opisuje stan faktyczny, nie zaleca zmiany.
2. `consents` w odpowiedzi `GET /me` wykracza poza ilustracyjny przykład kontraktu (który
   używa `…`) — pole jest potrzebne do karty „Zgody" na ekranie profilu.

**Poza zakresem** — maskowanie PESEL na widokach innych niż właściciel (H18), panel
administracyjny profili (H18), unieważnianie/usuwanie eksportów (RODO art. 17 — poza
zakresem całego hackathonu per §4 kontraktu).
