## Why

Nowa osoba loguje się pierwszy raz i nie wie, czego się spodziewać: jak wygląda program,
co się od niej oczekuje, ani gdzie zacząć. Pakiet H21 (moduł M16, priorytet **P0**, rozmiar S)
zamyka tę lukę pierwszym ekranem ścieżki (`#/panel/start`) z trzema sekcjami — filmem
powitalnym, opisem przebiegu programu i oczekiwaniami — edytowalnymi przez administrację
bez ingerencji w kod.

Ekran musi zostać dostępny również wtedy, gdy dostęp już wygasł albo program został
ukończony — to jedyny ekran w produkcie, dla którego to jest wymagane wprost (kryterium 2,
test wspólny z H04). Priorytet P0 wynika z tego, że to pierwsze wrażenie każdej nowej
uczestniczki i wolontariusza w programie.

Teraz, bo pakiet nie ma zależności blokujących: treść trzyma się w istniejącej tabeli
`settings` (wzorzec identyczny jak `sales_module_enabled` / `foundation_site_url`), nie
wymaga migracji, nowego modelu domenowego ani integracji z innym pakietem.

## What Changes

- **Odczyt treści** — `GET /onboarding` zwraca trzy sekcje (`video`, `program`,
  `expectations`) i `updated_at` (znacznik ostatniej edycji, `null` gdy nietknięte).
  Dostępne dla **każdej zalogowanej roli**, celowo **bez** middleware `access.active` —
  ekran ma działać po wygaśnięciu dostępu i po ukończeniu programu.
- **Edycja treści przez administrację** — `PATCH /admin/onboarding` dla ról `super_admin`
  i `project_manager`; każda sekcja opcjonalna (częściowa aktualizacja), pola sekcji podanej
  wymagane poza `video.url` (może być puste — placeholder). Inna rola → 403 `forbidden`.
- **Wartości domyślne wbudowane w kod** — brak wiersza w `settings` nie jest błędem: serwis
  zwraca stałe `OnboardingContent::DEFAULTS`, więc ekran działa na czystej bazie i zaraz po
  `docker compose down -v`.
- **Widoczność natychmiastowa** — zapis administracji i kolejny odczyt czytają to samo
  źródło (jeden wiersz `settings`), bez cache'u i bez przeładowania aplikacji.
- **Stała pozycja w menu** — „Start" w menu wszystkich ról uczestniczących
  (`frontend/lib/menu/participant/`), niezależna od stanu dostępu.
- **Ekran `#/panel/start`** — film-placeholder (odtwarzacz, gdy `video.url` ustawiony;
  w przeciwnym razie zastępczy kafel z podpisem), sekcja przebiegu programu, sekcja
  oczekiwań; dla administracji przycisk „Edytuj treść" na tym samym ekranie. UI po polsku.

## Capabilities

### New Capabilities

- `onboarding`: treść pierwszego ekranu ścieżki (film, przebieg programu, oczekiwania),
  odczyt dla każdej zalogowanej roli niezależnie od stanu dostępu, edycja przez administrację
  bez wdrożenia kodu, wartości domyślne gdy nic nie zapisano.

### Modified Capabilities

Brak — H21 nie zmienia wymagań żadnej istniejącej zdolności. Współdzielony jest wyłącznie
mechanizm middleware `access.active` (H04): H21 świadomie go pomija na trasie `GET /onboarding`
zamiast zmieniać jego regułę.

## Impact

**Backend**

- `backend/routes/api/h21.php` — jedyny plik tras dotykany przez pakiet (własność H21, §5.1).
- Nowy `app/Http/Controllers/Api/V1/OnboardingController.php` + `UpdateOnboardingRequest`.
- Nowy `app/Support/OnboardingContent.php` — jedyne źródło prawdy o kształcie treści,
  wartościach domyślnych i regule scalania.
- `backend/database/seeders/DemoSeeder.php` — plik współdzielony, jedna dopisana metoda
  wywołania (`seedSettings()`) tworząca wiersz `onboarding` z treścią domyślną.
- Testy `tests/Feature/H21/OnboardingTest.php`.
- **Bez migracji** — treść mieści się w istniejącej tabeli `settings` (`key`/`value`).
- **Bez nowych zależności** composer/npm.
- **Bez audytu** — rejestr §3.2 kontraktu nie przewiduje sluga dla onboardingu; nie
  wymyślamy nowego bez strażnika.

**Frontend**

- Nowa/zaktualizowana strona `frontend/app/(uczestnik)/panel/start/page.tsx` — widok
  i formularz edycji inline dla administracji na jednym ekranie.
- Pozycja w rejestrze menu — pakiet dopisuje własny plik i jedną linię w `index.ts`
  współdzielonym (§5.1), zgodnie z konwencją „dopisz sam" zamiast zgłoszenia do sztabu.

**Kontrakt i rejestry**

- Trasy `GET /onboarding`, `PATCH /admin/onboarding` są już w kontrakcie (karta H21) —
  nic nie wymyślamy.
- Brak nowego typu powiadomienia i brak nowego sluga audytu — pakiet żadnego nie potrzebuje.

**Świadomie poza zakresem**

Rzeczywisty upload/hosting wideo (pole `video.url` to zwykły link zewnętrzny, np. YouTube),
historia zmian treści (przechowywany jest wyłącznie ostatni stan i jego znacznik czasu),
wersjonowanie/podgląd przed publikacją, tłumaczenia wielojęzyczne.
