## Context

Dokument opisuje decyzje techniczne pakietu H20, zaimplementowanego na branchu
`pakiet/H20-raporty-i-widoki-dziennika-działan` (nie scalonego jeszcze do `main`). Zob.
`proposal.md` — Why. Źródło stanu faktycznego: `DEMO/H20.md` oraz kod w
`backend/app/Services/H20/ReportSummary.php`,
`backend/app/Queries/AdminAuditQuery.php`,
`backend/app/Http/Requests/H20/AuditIndexRequest.php`,
`backend/app/Http/Resources/AuditLogEntryResource.php`,
`backend/app/Http/Controllers/Api/V1/Admin/{ReportController,AuditController}.php`,
`frontend/lib/api.ts`. Reguły źródłowe: `docs/system/04-specyfikacja-modulow-mvp.md`
M15, `docs/hackathon/02-kontrakt-api.md` §2/§3.2.

## Goals / Non-Goals

**Goals:**
- Udokumentować, dlaczego liczniki raportu wołają `DashboardSummary::build()` (H19)
  zamiast liczyć te same zapytania drugi raz.
- Udokumentować dwie niejednoznaczności kontraktu rozstrzygnięte przy implementacji:
  mianownik „średniej godzin" i znaczenie `user_id` w filtrze dziennika.
- Udokumentować, dlaczego trasy modyfikacji `/admin/audit/*` po prostu nie istnieją,
  zamiast być jawnie odrzucane przez kontroler.

**Non-Goals:**
- Projektowanie nowego zachowania — pakiet jest już zbudowany, to dokumentacja decyzji
  podjętych podczas implementacji, nie propozycja przyszłej zmiany.
- Wpięcie ekranu `#/admin/postepy` (zestawienie czterech filarów) — jawnie poza
  zakresem hackathonu (`01-pakiety-zadan.md`, „Czego nie robimy").
- Zmiana zachowania `DashboardSummary` (H19) czy `ProgressAggregator` (starter) — H20
  wyłącznie z nich korzysta, nie modyfikuje.

## Decisions

**`active`/`completed`/`certificates_issued` wołają `DashboardSummary::build()`, nie
liczą własnych `COUNT`-ów.** Kryterium ★1 wymaga literalnej równości z pulpitem.
Napisanie tych samych zapytań niezależnie w H20 dawałoby *dziś* te same liczby, ale nie
gwarantowałoby ich przez konstrukcję — gdyby H19 kiedyś zmieniło definicję (np. dodało
filtr `product_group`), oba miejsca mogłyby po cichu się rozjechać. Wywołanie
współdzielonego serwisu (a nie duplikacja zapytań) czyni rozjazd niemożliwym, kosztem
zależności H20 → `App\Services\H19`. Alternatywa — wydzielenie wspólnej klasy do
`App\Support` — odrzucona jako zmiana poza zakresem H20 (H19 jest już `DONE`/scalone;
przenoszenie jego kodu wymagałoby zmiany cudzego pliku bez wyraźnej potrzeby).

**„Średnia godzin" = suma godzin zaakceptowanych / liczba osób aktywnych
(`DashboardSummary` `participants`).** Kontrakt („suma i średnia godzin") nie precyzuje
mianownika. Odrzucone alternatywy: (a) dzielenie przez liczbę osób z co najmniej jednym
zaakceptowanym wpisem stażu — zawyżałoby średnią, ukrywając uczestników bez wpisów; (b)
dzielenie przez `admitted` (przyjęci) — myliłoby „ile godzin przypada na osobę w
programie" z „ile godzin przypada na przyjęte zgłoszenie", gdy część przyjętych mogła
jeszcze nie aktywować konta. Dzielenie przez `active` odpowiada wprost pytaniu grantowemu
„ile średnio godzin stażu przypada na uczestniczkę/uczestnika programu".

**`user_id` w filtrze dziennika = aktor (`audit_log.actor_id`), nie podmiot
(`subject_id`).** Kontrakt (`GET /admin/audit?action=…&user_id=…&from=…&to=…`) nie
rozstrzyga, który koniec relacji. „Dziennik działań" odpowiada na pytanie „kto co
zrobił" — filtrowanie po aktorze (np. „co zrobił opiekun X") jest tu naturalniejszą
odpowiedzią niż „co się przydarzyło osobie Y" (to byłoby bliżej karty osoby, H18, która
już ma własną sekcję `audit_entries` filtrowaną po podmiocie). Gdyby strażnik kontraktu
rozstrzygnął inaczej, zmiana jest lokalna do `AdminAuditQuery::fromRequest()` — jeden
warunek `where('actor_id', …)` → `where('subject_id', …)`.

**Zero tras modyfikacji `/admin/audit/*` zamiast jawnego kontrolera zwracającego 404.**
Kontrakt: „Trasy modyfikacji audytu nie istnieją (próba → 404)." Najprostsza, najbardziej
odporna na pomyłkę implementacja tego zdania to dosłowne nierejestrowanie żadnej trasy —
Laravel odpowiada 404 dla dowolnej metody pod nieistniejącym wzorcem URI bez dodatkowego
kodu. Alternatywa (kontroler jawnie rzucający `ApiException(404, ...)` dla tych metod)
została odrzucona jako martwy kod, który mógłby się kiedyś przypadkiem obsłużyć
(np. refaktor dodający `Route::any`) i złamać kryterium ★2.

## Risks / Trade-offs

- **Zależność H20 → `App\Services\H19\DashboardSummary`** (cudzy, choć scalony i
  `DONE`, serwis) → mitygacja: wyłącznie odczyt (`::build()`), zero modyfikacji pliku
  H19; jeśli H19 kiedyś zmieni sygnaturę, złamie się w sposób widoczny (błąd typu),
  a nie cichym rozjazdem liczb.
- **`matrix_5f` w H02 wymagał jednolinijkowej poprawki** (patrz `proposal.md` „What
  Changes") → mitygacja: zmiana jest mechaniczna, nie zmienia zamiaru testu (nadal
  weryfikuje brak tras modyfikacji audytu), udokumentowana tu i w `DEMO/H20.md`.
- **„Osoby przyjęte" (`Application::accepted()->count()`) wynosi 0 na danych demo** —
  konta demo są tworzone bezpośrednio przez seeder, nie przez realny przepływ akceptacji
  H03 → mitygacja: `04-seed-demo.md` §5 nie definiuje wiążącej wartości dla tego
  licznika (w przeciwieństwie do `active`/`completed`/`certificates_issued`/godzin/
  konsultacji), więc 0 nie jest błędem — nazwane jawnie w `DEMO/H20.md`.

## Open Questions

- Czy `user_id` w filtrze dziennika powinien filtrować po aktorze czy po podmiocie —
  kontrakt tego nie rozstrzyga. Obecna decyzja (aktor) jest udokumentowana wyżej;
  zmiana w razie innej decyzji strażnika kontraktu jest lokalna do jednej linii w
  `AdminAuditQuery`.
