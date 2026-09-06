## 1. Backend — egzekwowanie limitu czasowego

- [x] 1.1 `EnsureAccessActive` (`access.active`, szkielet startera — H04 nietknięty,
  tylko wykorzystuje i testuje) — 403 `access_expired`, gdy `access_expires_at` minął
  ORAZ `program_completed_at` jest `null`
- [x] 1.2 `program_completed_at` niepuste zdejmuje limit bezterminowo, niezależnie od
  `access_expires_at`
- [x] 1.3 Brak `access_expires_at` (`null`) nigdy nie blokuje
- [x] 1.4 Middleware dołączony przez pakiety-właścicieli do własnych tras treści
  programu (H06, H10, H11, H13, H14) — H04 nie modyfikuje ich plików tras, tylko
  dostarcza middleware i wspólny test egzekwowania

## 2. Backend — wyjątki (trasy zawsze dostępne)

- [x] 2.1 Logowanie (`POST /auth/login`) działa niezależnie od stanu dostępu
- [x] 2.2 `GET /me`, `PATCH /me`, `POST /me/exports` (H01) działają mimo wygasłego
  dostępu
- [x] 2.3 `GET /onboarding` (H21) działa mimo wygasłego dostępu

## 3. Backend — przedłużenie dostępu

- [x] 3.1 `POST /admin/users/{id}/extend-access` — rola `project_manager` lub
  `super_admin`; nieznane `id` → 404 `not_found`
- [x] 3.2 Dokładnie jedno z `{months}` (1–60, sumuje się z jeszcze aktywną datą albo
  liczy od teraz przy wygasłej) albo `{until}` (data wprost, bez ograniczenia
  `after:now` — świadoma decyzja, patrz `design.md`); oba albo żadne → 422
  `validation_failed`
- [x] 3.3 Audyt `access.extended` — `actor_id` (kto), `subject_id`/`subject_type`
  (komu), `details.access_expires_at` (do kiedy), `details.previous_access_expires_at`

## 4. Backend — zadanie cykliczne

- [x] 4.1 `php artisan access:check-expired`, zaplanowane `->daily()` w
  `routes/console.php`
- [x] 4.2 Liczy i loguje (`Log::info`) konta z `access_expires_at` w przeszłości i
  `program_completed_at` pustym; brak takich kont → nic nie loguje
- [x] 4.3 Świadomie bez audytu i bez powiadomienia — rejestr §3.2/§3.1 nie ma sluga
  dla samego wygaśnięcia (`access.expiring_30d/7d` jest jawnie pozycją
  post-hackathonową w `01-pakiety-zadan.md`); zadanie nie blokuje niczego samo w
  sobie, egzekwowanie jest na żywo w `EnsureAccessActive`

## 5. Frontend

- [x] 5.1 `lib/api.ts` — 403 `access_expired` przekierowuje na `/dostep-wygasl`
  (ekran już istniał w starterze; lustrzane odbicie istniejącego wzorca 401→
  `/logowanie` w tym samym pliku)

## 6. Testy i demo

- [x] 6.1 Pokrycie automatyczne: 25 testów / 48 asercji w
  `backend/tests/Feature/AccessExpiry/` (`AccessExpiryEnforcementTest`,
  `ExtendAccessTest`, `CheckExpiredAccessCommandTest`); pełny pakiet backendu 251
  passed / 2 skipped po zmianie
- [x] 6.2 `DEMO/H04.md` udokumentowane: zakres, kryteria i wyrocznie, świadome
  ograniczenia zakresu, przejście demo krok po kroku
- [ ] 6.3 Brak testów frontendu (jak H01/H02 — repo nie ma runnera JS w tym
  środowisku); przekierowanie zweryfikowane `npm run build` + ręcznie przez API

## 7. Otwarte pozycje poza zakresem tego pakietu

- [ ] 7.1 Wyświetlenie `access_expires_at` w `/panel/profil` — dane już zwracane
  przez `GET /me` (H01, `DONE`); fragment gotowy w `DEMO/H04.md`, wpięcie należy do
  właściciela H01
- [ ] 7.2 Przycisk „przedłuż dostęp" w karcie osoby — endpoint gotowy i przetestowany
  (`POST /admin/users/{id}/extend-access`); UI należy do H18 (`GOTOWE`/nieprzypisany
  w chwili tego backfillu), gdy pakiet ruszy
- [x] 7.3 Odblokowanie `matrix_5d`/`matrix_5e` w
  `backend/tests/Feature/PermissionMatrix/PermissionMatrixTest.php` (H02) — nie były
  już `skipped` z braku pakietu H04, ale zmiana pliku należy do właściciela H02
