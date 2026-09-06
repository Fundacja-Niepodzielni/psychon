## Context

Zob. `proposal.md` — „Why". Poniżej wyłącznie to, co kształtuje podejście techniczne.

Stan zastany, zweryfikowany w kodzie:

- Tabela `settings` istnieje i ma prosty kształt `key` (unikalny) / `value` (tekst) —
  wzorzec już użyty przez `sales_module_enabled` i `foundation_site_url` w `DemoSeeder`.
  Model `Setting` jest gotowy, bez castów specjalnych dla `value`.
- Middleware `access.active` (H04) blokuje trasy dla kont z wygasłym dostępem lub
  ukończonym programem; sygnatura i reguła są zamrożone i należą do H04.
- `routes/api/h21.php` startował z placeholderem — pakiet zaczyna od zera tras własnych.
- `frontend/lib/menu/participant/h21-start.ts` istniał już jako placeholder pozycji menu
  (routing `/panel/start` był zarezerwowany) — pakiet doprecyzowuje komentarz, nie dodaje
  nowego wpisu w `index.ts`.
- `DemoSeeder::seedSettings()` jest metodą współdzieloną — dopisanie własnego wiersza
  ustawień to jednolinijkowa zmiana bez ryzyka konfliktu z innymi pakietami (inny `key`).

Ograniczenia: brak nowych zależności composer/npm, brak migracji, tylko własny plik tras,
autoryzacja po stronie serwera na każdym żądaniu, walidacja przez FormRequest, teksty UI
po polsku.

## Goals / Non-Goals

**Goals:**

- Jedno źródło treści (`OnboardingContent`) czytane identycznie przez odczyt i przez zapis,
  tak że domyślne wartości nie mogą się rozjechać między dwoma miejscami w kodzie.
- Ekran dostępny **zawsze** dla zalogowanej osoby — również z wygasłym dostępem i po
  ukończeniu programu — bez wyjątków dopisywanych do middleware `access.active`.
- Edycja widoczna natychmiast, bez cache'u, przeładowania czy propagacji.
- Ekran działa na czystej bazie (bez seeda) i po `docker compose down -v`, bo treść ma
  wbudowane wartości domyślne w kodzie, nie tylko w seedzie.

**Non-Goals:**

- Historia wersji treści — zapisujemy wyłącznie bieżący stan i `updated_at`; poprzednia
  treść nie jest nigdzie przechowywana.
- Upload pliku wideo — `video.url` to zwykły link (YouTube/Vimeo), nie hosting.
- Audyt zmian treści — rejestr §3.2 kontraktu nie przewiduje sluga; dodanie nowego wymaga
  strażnika kontraktu i nie jest uzasadnione rozmiarem pakietu (S).
- Podgląd przed publikacją / zatwierdzanie zmian — administracja edytuje wprost na żywo.

## Decisions

### D1. Treść jako jeden wiersz `settings`, nie nowa tabela

Cała treść trzech sekcji trzyma się w jednym wierszu `settings` pod kluczem `onboarding`,
`value` jako zserializowany JSON. Odczyt i zapis idą przez jeden obiekt statyczny
`App\Support\OnboardingContent`.

*Dlaczego:* trzy sekcje o stałym, płaskim kształcie to dokładnie to, do czego `settings`
już służy w tym projekcie (`sales_module_enabled`, `foundation_site_url`) — nowa tabela
wymagałaby migracji, a te są zamrożone i niewspółmierne do pakietu S. *Alternatywa:* osobna
tabela `onboarding_content` z kolumnami per sekcja — odrzucona: sztywniejsza przy przyszłej
zmianie kształtu sekcji i wymaga migracji na coś, co i tak jest jednym rekordem.

### D2. Wartości domyślne jako stała w kodzie, nie wyłącznie w seedzie

`OnboardingContent::DEFAULTS` jest stałą klasy. `get()` czyta wiersz `settings`, a gdy go
brak (albo `value` nie parsuje się do tablicy), zwraca `DEFAULTS` scalone z niczym — czyli
same `DEFAULTS`. Seed demo dodatkowo **materializuje** ten sam wiersz w `seedSettings()`,
ale to jest wygoda demo, nie jedyne źródło.

*Dlaczego:* kryterium „ekran działa po ukończeniu programu i po wygaśnięciu dostępu" musi
być prawdziwe też na środowisku, które nie przeszło seeda (np. świeża instalacja, test
jednostkowy bez `RefreshDatabase` + seed). Gdyby `DEFAULTS` istniały wyłącznie w seederze,
brak wiersza w bazie oznaczałby pusty/błędny ekran zamiast sensownej treści zastępczej.
*Alternatywa:* wymagać, by wiersz zawsze istniał (constraint/seed obowiązkowy) — odrzucona,
bo przenosi ryzyko na kolejność seedowania, której H21 nie kontroluje.

### D3. Scalanie płytkie, per sekcja i per pole — nie nadpisanie całości

`PATCH` przyjmuje dowolny podzbiór z trzech sekcji (`sometimes`); w obrębie podanej sekcji
FormRequest wymaga jej pól tekstowych (poza `video.url`, które może być puste). Zapis
(`OnboardingContent::merge`) nadpisuje w istniejącej treści tylko te pola, które faktycznie
przyszły w żądaniu — nieznane klucze sekcji/pól są pomijane, a pominięte sekcje zostają
bez zmian.

*Dlaczego:* administracja edytuje ekran sekcja po sekcji (np. tylko `program`), a wymuszenie
przesłania całości przy każdej edycji zwiększa ryzyko przypadkowego wyzerowania sekcji, której
formularz na ekranie akurat nie renderował. Test `test_get_onboarding_returns_stored_content`
i `..._sections_untouched` w `..._and_it_is_visible_immediately` pilnują tej własności.
*Alternatywa:* `PUT` z pełnym zastąpieniem treści — odrzucona: prostsza implementacyjnie, ale
przenosi ryzyko utraty danych na front (musiałby zawsze wysyłać komplet, nawet nietkniętych
sekcji).

### D4. `GET /onboarding` bez middleware `access.active` — celowy wyjątek, nie zmiana H04

Trasa odczytu wisi wyłącznie na `auth:sanctum`. Middleware `access.active` (własność H04)
nie jest ani modyfikowany, ani owijany warunkiem — po prostu nie jest dołączony do tej
jednej trasy. Wyjątek jest udokumentowany w komentarzu pliku tras i w karcie pakietu (kontrakt
zapisuje go jako „spójny z H04").

*Dlaczego:* to jedyny ekran, który z definicji musi przetrwać wygaśnięcie dostępu — zmiana
reguły middleware pod potrzeby jednego pakietu ryzykowałaby efekt uboczny dla wszystkich
pozostałych tras. Trzymanie wyjątku na poziomie rejestracji trasy (nie dodanie middleware)
jest najmniejszą możliwą zmianą i nie wymaga review pliku należącego do innego pakietu.
*Alternatywa:* dodać do `access.active` listę tras wyłączonych — odrzucona: rozprasza regułę
dostępu po dwóch plikach (H04 i H21) zamiast trzymać wyjątek w miejscu, które go potrzebuje.

### D5. `PATCH /admin/onboarding` autoryzowany przez `role:`, nie przez policy

Middleware `role:super_admin,project_manager` z zestawu startera pilnuje dostępu do trasy;
`UpdateOnboardingRequest::authorize()` sprawdza jedynie, że użytkownik jest zalogowany —
właściwa bramka roli jest na poziomie trasy, żeby wolontariusz/student nigdy nie trafił
nawet do FormRequest.

*Dlaczego:* treść onboardingu nie ma właściciela (nie jest zasobem użytkownika), więc nie
ma czego modelować jako `Policy` — to czysta bramka roli, identyczna z innymi trasami
administracyjnymi w kontrakcie. Test `test_volunteer_cannot_update_content` pilnuje 403
z kodem `forbidden` zgodnie z tabelą decyzyjną §1.1 kontraktu.

## Risks / Trade-offs

- **`video.url` bez walidacji hosta** (dowolny URL przechodzi regułę `url`) → administracja
  może wkleić link spoza YouTube/Vimeo, którego `<iframe>` odmówi wyświetlenia.
  *Mitygacja:* akceptowalne dla P0/S — front nie blokuje zapisu, a błędne osadzenie jest
  widoczne i odwracalne jedną kolejną edycją; nie ma ryzyka dla danych ani bezpieczeństwa.
- **Brak audytu edycji treści** → nie da się dziś odtworzyć, kto i kiedy zmienił onboarding
  poza jednym znacznikiem `updated_at` (bez `updated_by`). *Mitygacja:* rejestr audytu nie
  przewiduje sluga; zgłoszenie nowego po hackathonie, jeśli treść zacznie być zmieniana
  częściej niż sporadycznie.
- **Wyjątek od `access.active` na poziomie trasy** → kolejny pakiet mógłby przez
  nieuwagę skopiować ten wzorzec tam, gdzie nie powinien. *Mitygacja:* komentarz w
  `routes/api/h21.php` tłumaczy uzasadnienie wprost przy trasie; karta kontraktu H21
  zapisuje wyjątek jako „spójny z H04", nie jako precedens ogólny.
- **Jeden wiersz `settings` bez blokady** → dwie równoczesne edycje administracji
  (bardzo mało prawdopodobne — role administracyjne, nie setki użytkowników) mogłyby się
  nadpisać w kolejności zapisu. *Mitygacja:* akceptowalne ryzyko dla treści redakcyjnej
  edytowanej przez garstkę osób; `updateOrCreate` zapobiega duplikatom wiersza.

## Migration Plan

Brak migracji bazy — treść mieści się w istniejącej tabeli `settings`. Wdrożenie to zwykły
merge za flagą `config('features.h21')`; wyłączenie flagi zdejmuje trasy pakietu (ekran
frontowy przestaje mieć dane, ale nie wywala aplikacji, bo pozycja menu jest niezależna od
flagi backendu w praktyce ekran wywoła 404 na flagowanej trasie). Rollback: flaga na `false`,
wiersz `settings` zostaje nietknięty (nic nie kasujemy).
