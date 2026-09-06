## 1. Trasy i szkielet pakietu

- [x] 1.1 W `backend/routes/api/h15.php` zarejestrować trasy uczestnika za
  flagą `config('features.h15')`, middleware `['auth:sanctum',
  'access.active', 'role:volunteer']`: `GET /psychologist-profile`, `PATCH
  /psychologist-profile`, `POST /psychologist-profile/submit`, `POST
  /psychologist-profile/documents`, `POST
  /psychologist-profile/consent/withdraw`. Weryfikacja: `php artisan
  route:list --path=psychologist-profile` pokazuje komplet tras.
- [x] 1.2 W tym samym pliku zarejestrować trasy administracji, middleware
  `['auth:sanctum', 'role:project_manager,super_admin']`: `GET
  /admin/profiles`, `GET /admin/profiles/{id}`, `POST
  /admin/profiles/{id}/accept`, `POST /admin/profiles/{id}/return`, oraz
  nazwaną trasę `GET /admin/profiles/{id}/documents/{docId}` z dodatkowym
  middleware `signed`. Weryfikacja: `route:list --path=admin/profiles`
  pokazuje komplet tras.

## 2. Wniosek uczestnika (odczyt i edycja)

- [x] 2.1 Kontroler + zasób dla `GET /psychologist-profile`: zwraca
  `eligible` z `program_completed_at`, a dla braku rekordu w
  `psychologist_profiles` — domyślny szkielet statusu `draft` bez
  tworzenia wiersza. Weryfikacja: test feature — wolontariusz w trakcie
  programu dostaje `200` z `eligible=false`; `ola@demo.pl` dostaje `200`
  z `eligible=true` i jej danymi `draft`.
- [x] 2.2 `PATCH /psychologist-profile`: aktualizuje `specializations`,
  `approach`, `city`, `bio`; `403 profile_not_eligible` gdy `eligible=false`,
  `403 entry_locked` gdy status inny niż `draft`/`returned`. Weryfikacja:
  test feature dla obu ścieżek błędu i ścieżki sukcesu na koncie `ola`.
- [x] 2.3 Zasób uczestnika zwraca dokładnie zatwierdzone pola (bez `user_id`,
  `decided_by`, `file_path` załączników). Weryfikacja: test feature
  asercjący dokładny zestaw kluczy `data`.

## 3. Złożenie wniosku

- [x] 3.1 Walidacja kompletności przy `POST /psychologist-profile/submit`:
  `specializations`/`approach`/`city` niepuste, co najmniej jeden załącznik
  `dyplom`, zgoda na publikację; brak eligibility → `403
  profile_not_eligible` (sprawdzane przed walidacją kompletności); brak
  kompletu → `422 profile_incomplete` z `reason.missing`. Weryfikacja: test
  feature — wolontariusz w trakcie programu → 403; `ola` bez dyplomu → 422 z
  `reason.missing` zawierającym `documents`.
- [x] 3.2 Poprawne złożenie: zapis `consents` (`type=publikacja_profilu`,
  `granted_at=now()`), zmiana statusu na `submitted`, blokada dalszej edycji.
  Weryfikacja: test feature — `ola` po uzupełnieniu wniosku i złożeniu
  dostaje `200` ze statusem `submitted`; kolejny `PATCH` zwraca `403
  entry_locked`.

## 4. Załączniki weryfikacyjne

- [x] 4.1 `POST /psychologist-profile/documents` (multipart, pole `type` w
  `dyplom|niekaralnosc|inne`): zapis pliku (`Storage::disk('local')`,
  wzorzec H14), rekord `profile_documents`, dozwolone tylko dla wniosku
  `draft`/`returned`. Weryfikacja: test feature — upload w stanie `draft` →
  `201` z metadanymi bez `file_path`; upload po `submit` → `403
  entry_locked`.

## 5. Panel administracji — kolejka i szczegóły

- [x] 5.1 `GET /admin/profiles`: standardowa paginacja, domyślnie tylko
  status `submitted`, sortowanie po `created_at` rosnąco; filtr
  `?status=` dla innych statusów (w tym `withdrawn`, patrz zadanie 7.2).
  Weryfikacja: test feature — lista domyślna zawiera wyłącznie `submitted`;
  `?status=withdrawn` zwraca wycofane wnioski.
- [x] 5.2 `GET /admin/profiles/{id}`: pełny wniosek + lista załączników,
  każdy z `download_url` przez `URL::temporarySignedRoute` wskazujący
  nazwaną trasę z zadania 1.2. Weryfikacja: test feature — odpowiedź
  zawiera podpisany, wygasający `download_url` dla każdego załącznika.
- [x] 5.3 `GET /admin/profiles/{id}/documents/{docId}` (trasa `signed`):
  strumieniuje plik i zapisuje dokładnie jeden wpis w
  `sensitive_access_log` (`viewer_id`, `file_type=profile_document`,
  `file_id`, `viewed_at`) na każde udane pobranie, oraz jeden wpis audytu
  `AuditLog::record(..., 'sensitive.viewed', ...)` (rejestr §3.2 —
  slug już przypisany H03/H15, nie wymaga zgody strażnika). Weryfikacja:
  test feature — pobranie przez administratora tworzy nowy wpis w rejestrze
  wglądów i w dzienniku audytu; link bez podpisu → `403`/`401` (middleware
  `signed`).

## 6. Decyzje administracji

- [x] 6.1 `POST /admin/profiles/{id}/accept`: w transakcji z
  `lockForUpdate`, strażnik statusu (`404 not_found` brak wniosku, `403
  entry_locked` status inny niż `submitted`), zmiana na `accepted` +
  `decided_by`/`decided_at`, `AuditLog::record(..., 'profile.accepted',
  ...)`, `Notify::send(..., 'profile.accepted', ...)`. Weryfikacja: test
  feature — akceptacja złożonego wniosku `ola` → `200` status `accepted`,
  wpis audytu i powiadomienia; powtórna akceptacja → `403 entry_locked` bez
  duplikatu audytu/powiadomienia.
- [x] 6.2 `POST /admin/profiles/{id}/return {reason}`: `FormRequest`
  wymagający niepustego `reason` (`422 validation_failed` inaczej),
  analogiczny strażnik statusu, zapis `return_reason`, status `returned`,
  audyt `profile.returned`, powiadomienie `profile.returned`. Weryfikacja:
  test feature — brak `reason` → 422; odesłanie z powodem → 200 status
  `returned`, wniosek ponownie edytowalny (`PATCH` działa, zachowuje
  `return_reason` do czasu ponownego złożenia).

## 7. Wycofanie zgody na publikację

- [x] 7.1 `POST /psychologist-profile/consent/withdraw`: wymaga istniejącej,
  aktywnej zgody `publikacja_profilu` (`422 validation_failed` gdy brak —
  np. wniosek wciąż `draft`); ustawia `withdrawn_at` na zgodzie i status
  wniosku na `withdrawn`. Weryfikacja: test feature — wycofanie po
  akceptacji → `200`, `consents.withdrawn_at` ustawione, status
  `withdrawn`; wycofanie bez wcześniejszej zgody → 422.
- [x] 7.2 Zgłoszenie do strażnika kontraktu o slug `profile.withdrawn`
  (audyt §3.2 + powiadomienie §3.1). Do czasu odpowiedzi wycofany wniosek
  jest widoczny wyłącznie przez `GET /admin/profiles?status=withdrawn`
  (bez `Notify::send`); po odpowiedzi dopisać `AuditLog::record` i
  `Notify::send` z przyznanym slugiem. Weryfikacja: wpis w
  `DEMO/H15.md` z wynikiem zgłoszenia i (jeśli przyznane) test feature
  asercjący audyt/powiadomienie.

## 8. Ekrany

- [x] 8.1 `#/panel/profil-psychologa`
  (`frontend/app/(uczestnik)/panel/profil-psychologa/page.tsx`): ekran
  „czego brakuje" gdy `eligible=false`; formularz wniosku, upload
  załączników, checkbox zgody na publikację, przycisk „Złóż wniosek"
  (aktywny tylko przy komplecie danych), przycisk „Wycofaj zgodę" widoczny
  po złożeniu. Wpis w rejestrze menu uczestnika. Weryfikacja: `npm run lint
  && npm run build` zielone; ręcznie — `ola` widzi formularz gotowy do
  złożenia, wolontariusz w trakcie programu widzi ekran wyjaśniający.
- [x] 8.2 `#/admin/profile` (`frontend/app/(administracja)/admin/profile/...`):
  lista `GET /admin/profiles`, widok szczegółów z podglądem/pobraniem
  załączników, akcje akceptuj/odeślij z polem powodu. Weryfikacja: `npm
  run build` zielony; ręcznie — `opiekun@demo.pl` widzi kolejkę i może
  podjąć decyzję.

## 9. Odbiór i dokumentacja

- [x] 9.1 Pełny suite backendu (`php artisan test`) oraz `npm run lint &&
  npm run build` zielone.
- [x] 9.2 `DEMO/H15.md`: co działa (z wyróżnieniem kryteriów ★1 i ★2), jak
  pokazać (wolontariusz w trakcie programu / `ola` składająca wniosek /
  decyzja administracji / wycofanie zgody), tabela testy↔kryteria, czego
  brakuje (status `published`, szyfrowanie at-rest, wynik zgłoszenia
  `profile.withdrawn`).
- [x] 9.3 Zgłoszenie do strażnika schematu: potwierdzić, że stan `ola` z
  seedera wystarcza jako demo H15, czy potrzebny jest dodatkowy seeder
  pakietu (np. drugi absolwent do testu równoległych decyzji).
