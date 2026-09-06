Backfill — zadania odzwierciedlają pracę już wykonaną i scaloną do `main` (patrz
`DEMO/H01.md`), a nie plan do wykonania. Wszystkie pozycje są zamknięte.

## 1. Odczyt i edycja profilu

- [x] 1.1 `GET /me` zwraca pełny profil właściciela wraz z pełnym PESEL-em i listą
  `consents` (`ProfileResource`)
- [x] 1.2 `PATCH /me` (`UpdateProfileRequest`) aktualizuje `first_name`, `last_name`,
  `phone`, `pesel`, zagnieżdżony `address{street,city,zip}`
- [x] 1.3 Pole `email` jest usuwane z danych wejściowych przed walidacją
  (`prepareForValidation`) — żądanie z `email` kończy się sukcesem, adres pozostaje bez zmian
- [x] 1.4 Reguła walidacji `App\Rules\Pesel` — 11 cyfr, poprawna data urodzenia (stulecie
  kodowane w miesiącu), poprawna suma kontrolna, jeden komunikat błędu
- [x] 1.5 Test: niepoprawny PESEL → 422 pod `error.errors.pesel`, wartość w bazie bez zmian
- [x] 1.6 Test: poprawny PESEL zapisuje się i jest widoczny w kolejnym `GET /me`
- [x] 1.7 Test: `PATCH /me` z polem `email` nie zmienia adresu e-mail
- [x] 1.8 Test: `PATCH /me` z zagnieżdżonym adresem aktualizuje `address.city`
- [x] 1.9 Test: `GET /me` bez tokenu → 401 `unauthenticated`

## 2. Eksport danych RODO

- [x] 2.1 `POST /me/exports` tworzy rekord `DataExport` (status domyślny `queued`) i
  dysponuje zadaniem `GenerateDataExport`, odpowiada 202
- [x] 2.2 `GenerateDataExport` buduje payload z pięciu zakresów: `profile`, `consents`,
  `progress` (przez `ProgressAggregator` + liczniki lekcji), `internship_entries`,
  `documents` (wyłącznie metadane)
- [x] 2.3 Zadanie zapisuje plik JSON na dysku `local` pod `exports/{public_id}.json` i
  aktualizuje status na `ready` (albo `failed` z komunikatem błędu i ponownym rzuceniem
  wyjątku)
- [x] 2.4 `GET /me/exports/{id}` i `GET /me/exports/{id}/download` skopowane po
  `user_id = auth()->id()` — cudzy albo nieistniejący `id` → 404 `not_found` w obu
  przypadkach (`ownExportOrFail`)
- [x] 2.5 Pobranie gotowego pliku przez `Storage::disk('local')->download()` z nazwą
  zawierającą `public_id`; plik nie w statusie `ready` albo brakujący na dysku → 404
- [x] 2.6 Po ukończeniu eksportu wywołanie `Notify::send(..., 'export.ready', ...)` z
  linkiem `/panel/profil`; brak wywołania `AuditLog::record` (świadoma decyzja — rejestr
  §3.2 nie definiuje sluga dla `export.*`)
- [x] 2.7 Test: zlecenie eksportu → 202 `queued`; po przetworzeniu (kolejka `sync` w
  testach) → `ready`, plik zawiera wszystkie pięć kluczy, `profile.pesel` zgodny
- [x] 2.8 Test: status eksportu można odpytać (`GET /me/exports/{id}`)
- [x] 2.9 Test: gotowy eksport pobiera się jako plik z nagłówkiem
  `Content-Disposition: attachment`
- [x] 2.10 Test: cudzy `id` eksportu → 404 `not_found` zarówno dla statusu, jak i pobrania
- [x] 2.11 Test: `POST /me/exports` bez tokenu → 401 `unauthenticated`

## 3. Frontend

- [x] 3.1 `frontend/app/(uczestnik)/panel/profil/page.tsx` — formularz danych osobowych
  z wyszarzonym, nieedytowalnym polem e-mail i podpowiedzią o zmianie przez administrację
- [x] 3.2 Karta „Zgody" — lista `consents` z etykietami PL i odznaką statusu
- [x] 3.3 Karta „Eksport danych (RODO)" — przycisk zlecenia, odpytywanie statusu co 2 s,
  pobranie pliku przez `fetch` z nagłówkiem `Authorization` (nie przez `<a href>`)
- [x] 3.4 Mapowanie błędów 422 (w tym zagnieżdżonych `address.*`) na pola formularza

## 4. Dokumentacja i weryfikacja

- [x] 4.1 Pokrycie automatyczne: 11 testów w `backend/tests/Feature/H01/` (`ProfileTest` 6,
  `DataExportTest` 5); pełny pakiet backendu zielony
- [x] 4.2 `DEMO/H01.md` udokumentowane: zakres, kryteria ★, scenariusz manualny,
  świadome odstępstwa (edytowalność imienia/nazwiska, brak audytu dla eksportu)

## 5. Ten backfill (poza zakresem implementacji)

- [x] 5.1 Zbadano faktyczny kod scalony do `main` (trasy, kontrolery, testy, `DEMO/H01.md`)
  jako źródło tej specyfikacji
- [x] 5.2 **Wymaga człowieka** — recenzja partnera/liaisona zgodnie z
  `docs/hackathon/06-workflow-pakietu-i-pr.md`, następnie synchronizacja do
  `openspec/specs/profile-gdpr-export` i archiwizacja zmiany
