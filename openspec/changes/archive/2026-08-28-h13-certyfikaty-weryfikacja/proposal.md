## Why

Pakiet H13 (moduł M10) zamyka ścieżkę uczestnika: po skompletowaniu warunków
programu absolwent musi dostać **certyfikat**, a osoba trzecia (pracodawca,
Fundacja) musi móc **publicznie zweryfikować** jego autentyczność. Dziś w
platformie nie ma ani ekranu warunków, ani tras certyfikatu, ani strony
weryfikacji — a minimum ★ tego pakietu wchodzi w skład ścieżki demo P0
(`H01 → H05 → H06 → H10 → H16 → H13★ → H18/H19/H21`).

## What Changes

- **Ekran warunków certyfikatu** (`#/panel/certyfikat`) + `GET /certificate/conditions`
  — cztery filary (kursy, staż, superwizja, warsztat) ze stanem liczonym przez
  `ProgressAggregator` ze startera (to samo źródło, co karta osoby, pulpit i raport).
  To jest **minimum ★ w P0**.
- **Generowanie certyfikatu** (`POST /certificate/generate`) — zablokowane do
  kompletu warunków (422 `conditions_not_met` z listą braków); po spełnieniu
  uruchamia zadanie w tle: numeracja ciągła per edycja w transakcji, PDF + kod QR
  przez `PdfService`, snapshot warunków w chwili wydania.
- **Pobranie** własnego certyfikatu (`GET /certificate/download`).
- **Wydanie certyfikatu ustawia `users.program_completed_at`** + audyt
  `certificate.issued` (rejestr §3.2). To zdejmuje limit czasowy dostępu (styk z H04).
- **Publiczna weryfikacja bez uwierzytelnienia**: `GET /verify/{number}` oraz
  `GET /verify/qr/{token}` (trasy już przepuszczone przez bramkę CI w
  `config/public_routes.php` jako `api/v1/verify/*`); nieznany albo błędny numer →
  404 z **identycznym** komunikatem dla obu przypadków (bez ujawniania formatu).
- **Strony publiczne** `#/weryfikacja` (wyszukiwarka numeru) i `#/certyfikat`
  (widok trafienia z QR).
- Poza zakresem hackathonu (kontrakt §4): **unieważnianie certyfikatów** —
  `status` w odpowiedzi weryfikacji obsługuje `valid | revoked`, ale trasy
  unieważniania nie powstają.

## Capabilities

### New Capabilities

- `certificate-issuance-verification`: warunki ukończenia programu, wydanie certyfikatu absolwenta
  (numeracja per edycja, PDF+QR, snapshot, `program_completed_at`, audyt) oraz
  publiczna weryfikacja autentyczności po numerze i po tokenie QR.

### Modified Capabilities

Brak. Żadna istniejąca specyfikacja w `openspec/specs/` nie zmienia wymagań;
`ProgressAggregator`, `PdfService`, `AuditLog`, `EnsureAccessActive` i
`config/public_routes.php` mają zamrożone sygnatury i są tu wyłącznie konsumowane.

## Impact

- **Nowe trasy** (`routes/api/h13.php`, dziś pusty): `GET /certificate/conditions`,
  `POST /certificate/generate`, `GET /certificate/download`, publiczne
  `GET /verify/{number}`, `GET /verify/qr/{token}`.
- **Nowe kontrolery / FormRequesty / zasób** w `app/Http/...` (przestrzeń pakietu H13).
- **Nowe zadanie w tle** generujące PDF (kolejka `sync` w testach).
- **Nowy widok Blade** certyfikatu dla `PdfService::render`.
- **Zapis do `users.program_completed_at`** przy wydaniu (kolumna istnieje w
  migracjach; brak zmian schematu).
- **Tabela `certificates`** — zapis (kolumny `number`, `verification_token`,
  `conditions_snapshot`, `issued_at`, `pdf_path` już w migracji).
- **Audyt**: slug `certificate.issued` (rejestr kontraktu §3.2).
- **Frontend**: nowe ekrany `#/panel/certyfikat`, `#/weryfikacja`, `#/certyfikat`
  + wpis w rejestrze menu uczestnika (`lib/menu/participant/h13-*.ts`).
- **Testy wspólne (handshake)**: „zgodność liczb" H13 + H18 + H19 + H20 (ten sam
  `ProgressAggregator`); „bezterminowy dostęp" H13 + H04 (`program_completed_at`
  zdejmuje limit).
- Bez nowych zależności composer/npm. Bez zmian w kontrakcie API i schemacie bazy.
