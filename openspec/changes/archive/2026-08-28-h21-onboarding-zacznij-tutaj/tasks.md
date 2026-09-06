## 1. Przygotowanie

- [x] 1.1 Zweryfikować, że `routes/api/h21.php` i pozycja menu `frontend/lib/menu/participant/h21-start.ts` istnieją jako placeholdery (routing `/panel/start` zarezerwowany) — pakiet doprecyzowuje, nie zakłada nowego wpisu w `index.ts`
- [x] 1.2 Założyć `DEMO/H21.md` z sekcjami na zakres, API, przechowywanie, pliki, kryteria odbioru i wynik testów

## 2. Treść — jedno źródło prawdy

- [x] 2.1 Napisać `App\Support\OnboardingContent` ze stałymi `KEY`, `SECTIONS`, `DEFAULTS` (trzy sekcje: `video`, `program`, `expectations`)
- [x] 2.2 Zaimplementować `get()`: odczyt wiersza `settings` po `KEY`, dekodowanie JSON, scalenie z `DEFAULTS` — brak wiersza albo nieparsowalna wartość zwraca same `DEFAULTS`
- [x] 2.3 Zaimplementować `put(array $patch)`: scalenie płytkie per sekcja i per pole (D3), `updateOrCreate` wiersza `settings`, zwrot pełnej treści po zapisie
- [x] 2.4 Dopisać do współdzielonego `DemoSeeder::seedSettings()` jeden wiersz `onboarding` z `OnboardingContent::DEFAULTS` — zmiana jednolinijkowa, inny `key` niż istniejące wiersze

## 3. API — trasy, kontroler, walidacja

- [x] 3.1 Zarejestrować w `backend/routes/api/h21.php`, za flagą `config('features.h21')`: `GET /onboarding` pod `auth:sanctum` **bez** `access.active` (D4, komentarz w pliku tras); `PATCH /admin/onboarding` dodatkowo pod `role:super_admin,project_manager`
- [x] 3.2 Napisać `OnboardingController::show()` — `{"data": {...sekcje, "updated_at"}}`, `updated_at` z wiersza `settings` (`null`, gdy nietknięty)
- [x] 3.3 Napisać `OnboardingController::update()` — woła `OnboardingContent::put($request->validated())`, zwraca pełną treść tą samą kopertą co `show()`
- [x] 3.4 Napisać `UpdateOnboardingRequest` (D3): każda sekcja `sometimes`; pola sekcji podanej `required_with`, poza `video.url` (`nullable`, `url`, max 500); `program`/`expectations` `title` max 200, `body` max 4000; komunikaty po polsku
- [x] 3.5 Test: `GET /onboarding` bez zapisanej treści zwraca `OnboardingContent::DEFAULTS`
- [x] 3.6 Test: `GET /onboarding` po częściowym zapisie zwraca zmienioną sekcję i nietknięte sekcje na wartościach domyślnych
- [x] 3.7 Test kryterium ★1: `PATCH /admin/onboarding` przez `project_manager` i przez `super_admin` → kolejny `GET /onboarding` natychmiast zwraca nową treść
- [x] 3.8 Test: wolontariusz wywołujący `PATCH /admin/onboarding` → 403 `forbidden`, żaden wiersz `settings` nie powstaje
- [x] 3.9 Test: gość wywołujący `GET /onboarding` → 401 `unauthenticated`
- [x] 3.10 Test walidacji: sekcja z pustymi polami tekstowymi → 422 `validation_failed` z listą pól w `error.errors`
- [x] 3.11 Test walidacji: `video.url` niebędący poprawnym URL → 422 `validation_failed`
- [x] 3.12 Test kryterium ★2: `GET /onboarding` dla konta z `access_expires_at` w przeszłości → 200 (test wspólny z H04)
- [x] 3.13 Test kryterium ★2: `GET /onboarding` dla konta z `program_completed_at` ustawionym → 200
- [x] 3.14 Test: `updated_at` jest `null` przed pierwszą edycją i równy znacznikowi wiersza `settings` zaraz po zapisie

## 4. Frontend — ekran `#/panel/start`

- [x] 4.1 Przeczytać właściwy przewodnik w `frontend/node_modules/next/dist/docs/` przed pisaniem kodu Next.js 16 (@frontend/AGENTS.md)
- [x] 4.2 Zbudować `app/(uczestnik)/panel/start/page.tsx` na komponentach z `components/ui` i design systemie; pobranie `GET /onboarding` + `GET /me` (dla roli) przy wejściu na ekran
- [x] 4.3 Zbudować blok wideo: odtwarzacz `<iframe>` osadzający link (z konwersją typowych adresów YouTube/Vimeo do formy embed), gdy `video.url` ustawiony; w przeciwnym razie zastępczy kafel z `video.caption`
- [x] 4.4 Zbudować sekcje „Przebieg programu" i „Czego od Ciebie oczekujemy" z treści `program`/`expectations`
- [x] 4.5 Dodać przycisk „Edytuj treść" widoczny wyłącznie dla ról `super_admin`/`project_manager`, z formularzem inline scalającym trzy sekcje i wywołaniem `PATCH /admin/onboarding`
- [x] 4.6 Obsłużyć błędy 422 formularza edycji (komunikaty pól po polsku) bez wychodzenia z ekranu; stan zapisu i potwierdzenie sukcesu
- [x] 4.7 Zaktualizować komentarz w `frontend/lib/menu/participant/h21-start.ts` — pozycja „Start" jest stała dla wszystkich ról uczestniczących, niezależna od stanu dostępu

## 5. Odbiór

- [x] 5.1 `docker compose exec app php artisan test --filter=H21` — 11 testów, 37 asercji, zielone
- [x] 5.2 `docker compose exec app php artisan test` — cały pakiet zielony w kontekście pełnego zestawu (51 passed)
- [x] 5.3 `./vendor/bin/pint` (pliki pakietu) i `npm run lint` + `npm run build` (frontend) bez zastrzeżeń
- [x] 5.4 Uzupełnić `DEMO/H21.md` o wynik testów i weryfikację lokalną (komendy, liczby)
- [x] 5.5 Otworzyć PR z gałęzi `pakiet/H21-onboarding` (≤ ~400 linii); przegląd partnerski → przegląd łącznika → merge przez sztab — **wymaga potwierdzenia użytkownika** (push + PR to akcje z wymaganą jawną zgodą)
