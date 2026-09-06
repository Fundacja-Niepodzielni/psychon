## 1. Trasy i szkielet pakietu

- [x] 1.1 W `backend/routes/api/h13.php` zarejestrować 5 tras za flagą `config('features.h13')`: `GET /certificate/conditions`, `POST /certificate/generate`, `GET /certificate/download` (grupa `auth:sanctum` + `role:volunteer` + `access.active`) oraz publiczne `GET /verify/{number}` i `GET /verify/qr/{token}` (bez bramek). Weryfikacja: `php artisan route:list --path=certificate` i `--path=verify` pokazują komplet tras, `php artisan test --filter=PublicRoutesSmokeTest` zielony.

## 2. Warunki ukończenia (minimum ★)

- [x] 2.1 Utworzyć `App\Support\H13\CertificateConditions` budujące cztery warunki z `ProgressAggregator::for()` i progów `Settings::edition('internship_hours_required' / 'supervision_required_count')`; metody `eligible()`, `missing()`, `toArray()`. Weryfikacja: test jednostkowy na seedzie — `marta` daje `eligible=false` i cztery `met=false`, `ola` daje `eligible=true`, godziny są łańcuchami (`"41.5"`, `"72"`).
- [x] 2.2 Kontroler + zasób dla `GET /certificate/conditions` zwracający `{"data":{"eligible":bool,"conditions":[{key,label,done,required,met}]}}` (warunek `workshop` bez liczników). Weryfikacja: test feature — `marta` zgodnie z `04-seed-demo.md`, `ola` `eligible=true`; student i psycholog prowadzący → 403 `forbidden`; brak tokenu → 401.
- [x] 2.3 Test zgodności liczb: `done` z warunków == wartości `ProgressAggregator::for()` dla tego samego użytkownika. Weryfikacja: test feature zielony (handshake z H18/H19/H20 odnotowany w `DEMO/H13.md`).

## 3. Wydanie certyfikatu

- [x] 3.1 Kontroler `POST /certificate/generate`: przy niespełnionych warunkach → `422 conditions_not_met` z `reason.missing`; przy komplecie → `202 {"data":{"status":"queued"}}` i dispatch zadania. Weryfikacja: test — `marta` → 422 z listą braków, `assertDatabaseCount('certificates', <seed>)` bez zmian.
- [x] 3.2 Zadanie `GenerateCertificate`: w `DB::transaction` — `lockForUpdate` na `certificates` edycji, numer `NP/<rok edycji>/<3 cyfry>` z `max+1` w PHP, idempotencja po `user_id+edition_id`, rekord z `conditions_snapshot` i losowym unikalnym `verification_token`, `issued_at`, `users.program_completed_at` gdy puste, `AuditLog::record(..., 'certificate.issued', ...)`; po commit `pdf_path = PdfService::render('pdf.certificate', ...)`. Weryfikacja: test — użytkownik z kompletem warunków → certyfikat `NP/2026/002` (po seedowym `001`), `program_completed_at` ustawione, wpis audytu `certificate.issued`; powtórny `generate` → brak drugiego rekordu.
- [x] 3.3 Widok `backend/resources/views/pdf/certificate.blade.php`: dane absolwenta, numer, data, pełny adres `/weryfikacja?token=<verification_token>` jako odnośnik oraz QR jako inline data-URI SVG (wariant zapasowy: sam odnośnik — zależnie od zgody sztabu na enkoder QR jako kod pakietu). Weryfikacja: wygenerowany plik zawiera `verification_token` i ścieżkę `/weryfikacja`.
- [x] 3.4 Test `ConcurrentCertificateTest`: równoległe wydania w jednej edycji → numery tworzą ciąg bez dziur i bez duplikatów; unikat `certificates.number` odrzuca zdublowany numer. Weryfikacja: `php artisan test --filter=ConcurrentCertificate` zielony, wynik w `DEMO/H13.md`.

## 4. Pobranie własnego certyfikatu

- [x] 4.1 `GET /certificate/download`: strumień pliku wydanego certyfikatu właściciela; brak wydanego certyfikatu → `404 not_found`. Weryfikacja: test — po wydaniu plik jest zwracany, przed wydaniem 404.

## 5. Publiczna weryfikacja

- [x] 5.1 `GET /verify/{number}` (bez auth, bez ograniczeń `where` na parametrze): `{"data":{"number","status","edition","issued_at"}}`; numer nieznany oraz w błędnym formacie → jeden `404 not_found` z komunikatem „Nie znaleziono certyfikatu o podanym numerze.". Weryfikacja: test — `NP/2026/001` → 200 `status=valid`; `NP/2026/999` → 404 z komunikatem; `"abc"` → 404 z tym samym komunikatem; rekord z ustawionym `revoked_at` → 200 `status=revoked`.
- [x] 5.2 `GET /verify/qr/{token}` (bez auth): ten sam payload co po numerze; token nieznany → identyczny `404`. Weryfikacja: test — token z wydanego certyfikatu → 200 `status=valid`; zły token → 404 z tym samym komunikatem.

## 6. Ekrany

- [x] 6.1 `#/panel/certyfikat` (`frontend/app/(uczestnik)/panel/certyfikat/page.tsx`): lista czterech warunków (`ProgressBar`/`Badge`), przycisk „Wygeneruj certyfikat" aktywny tylko przy `eligible`, po `202` odświeżenie stanu i odnośnik do pobrania; wpis `lib/menu/participant/h13-certyfikat.ts` + dwie linie w `participant/index.ts`. Weryfikacja: `npm run lint && npm run build` zielone; ekran pokazuje warunki `marty` i nieaktywny przycisk, dla `oli` przycisk aktywny.
- [x] 6.2 `#/weryfikacja` (`frontend/app/weryfikacja/page.tsx`, publiczny, poza grupą `(uczestnik)`): pole numeru → `GET /verify/{number}` → karta wyniku albo komunikat „Nie znaleziono…". Weryfikacja: `npm run build` zielony; ręcznie `NP/2026/001` → „valid", losowy ciąg → komunikat 404.
- [x] 6.3 `#/certyfikat` (`frontend/app/certyfikat/page.tsx`, publiczny): widok trafienia z parametru `?token=` lub `?number=` (wejście z QR). Weryfikacja: `npm run build` zielony; otwarcie z tokenem certyfikatu z seeda pokazuje kartę.

## 7. Odbiór i dokumentacja

- [x] 7.1 Pełny suite backendu (`php artisan test`) oraz `npm run lint && npm run build` zielone; wyniki wpisane do `DEMO/H13.md`.
- [x] 7.2 `DEMO/H13.md`: co działa (z jawnym wyróżnieniem minimum ★ = warunki), jak pokazać (marta niespełnione / ola komplet / weryfikacja publiczna + QR), tabela testy↔kryteria, czego brakuje (wierność QR w stubie, unieważnianie certyfikatów, styk z H04).
- [x] 7.3 Testy wspólne odnotowane w `DEMO/H13.md` i zgłoszone właścicielom: „bezterminowy dostęp" (H13 + H04 — `program_completed_at` zdejmuje limit) oraz „zgodność liczb" (H13 + H18/H19/H20 — wspólny `ProgressAggregator`).
- [x] 7.4 Zgłosić strażnikowi schematu, czy stan `oli` z seedera wystarcza jako demo H13, czy potrzebny jest seeder pakietu (zakres ID per pakiet w rejestrze seederów).
