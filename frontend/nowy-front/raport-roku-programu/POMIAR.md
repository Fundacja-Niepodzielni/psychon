# Pomiar raportu przed zmianą

Pomiar zrobiony na kodzie czubka `sprint-2` (commit `1d03784`), przed jakąkolwiek zmianą
na tej gałęzi. Ścieżki zaplecza liczone od `backend/`.

Trasy (`routes/api/h20.php`) są w grupie ról `project_manager` i `super_admin`:

- `GET /admin/report` i jego drugi adres `GET /admin/reports` — liczby i zestawienie imienne (JSON),
- `GET /admin/report/export.csv` — plik z zestawieniem imiennym,
- `GET /admin/report/grantor` i `GET /admin/report/grantor/export.csv` — liczby dla grantodawcy,
- `GET /admin/reports/closing?edition=` — raport zamknięcia edycji (ekran z niego nie korzysta).

Dotychczasowy ekran (`frontend/components/h20/ReportView.tsx`, „Raport edycji”) czyta
`GET /admin/report` i pobiera `export.csv`. Pliku grantodawcy nie pobiera żaden ekran.

## Liczby `GET /admin/report` — `summary`

Wszystkie liczy `app/Services/H20/ReportSummary.php::build()`.

| Pole | Jak jest liczone | Zależy od dat? |
|---|---|---|
| `admitted` | wszystkie przyjęte zgłoszenia (`Application::accepted()`), każdej roli — `ReportSummary.php:104` | nie, stan dziś |
| `active` | konta wolontariuszy **i studentów** w stanie „aktywne” — z pulpitu, `DashboardSummary.php:32` | nie, stan dziś |
| `completed` | **wszystkie** konta z datą ukończenia programu, bez względu na rolę — z pulpitu, `DashboardSummary.php:35` | nie, stan dziś |
| `hours_accepted_total` | suma godzin zaakceptowanych wpisów stażu wszystkich osób — `ReportSummary.php:82` | **tak**, po dacie wpisu (`ReportSummary.php:328, 332`, oba brzegi włącznie) |
| `hours_accepted_average` | suma godzin podzielona przez `active` (wolontariusze i studenci) — `ReportSummary.php:108` | **tak** (licznik), mianownik to stan dziś |
| `consultations_total` | suma konsultacji z zaakceptowanych wpisów — `ReportSummary.php:83` | **tak**, po dacie wpisu |
| `certificates_issued` | **wszystkie** certyfikaty, **także unieważnione** — `Certificate::count()`, `DashboardSummary.php:36` | nie, stan dziś |
| `people_with_passed_test` | osoby z zestawienia (wolontariusze i studenci, także zablokowani) z co najmniej jednym zaliczonym testem — `ReportSummary.php:113` | nie, stan dziś |

## Wiersz zestawienia imiennego — `people[]`

Lista to wszystkie konta ról `volunteer` i `student`, bez filtra stanu konta i edycji,
po nazwisku i imieniu — `ReportSummary.php:213`.

| Pole | Jak jest liczone | Zależy od dat? |
|---|---|---|
| `id`, `first_name`, `last_name`, `role`, `status` | atrybuty konta | nie |
| `hours_accepted` | godziny zaakceptowanych wpisów tej osoby — `ReportSummary.php:253` | **tak** |
| `consultations` | konsultacje z zaakceptowanych wpisów tej osoby — `ReportSummary.php:256` | **tak** |
| `certificate_issued` | czy osoba ma jakikolwiek certyfikat, **także unieważniony** — `ReportSummary.php:202, 257` | nie |
| `stage`, `stage_label` | pierwszy niespełniony warunek certyfikatu z `ProgressAggregator::for()` — `ReportSummary.php:258` | nie (liczone bez dat) |
| `tests_passed` | liczba różnych zaliczonych testów — `ProgressAggregator.php:96`, `ReportSummary.php:271` | nie |

Czego wiersz dziś **nie** niesie: kursów „ile z ilu”, stażu „ile z ilu godzin”, superwizji
„ile z ilu”, daty zaliczenia warsztatu. Program liczy staż w **godzinach**
(`editions.internship_hours_required`), nie w liczbie form.

## Liczby `GET /admin/report/grantor` — `indicators`

Liczy `app/Services/H20/GrantorReportAggregates.php::build()`. Tu daty zawężają **wszystko**
poza `in_program`, każdą liczbę po dacie jej własnego zdarzenia.

| Pole | Jak jest liczone | Zależy od dat? |
|---|---|---|
| `participants_by_status.accepted` | przyjęte zgłoszenia każdej roli — `GrantorReportAggregates.php:102` | **tak**, po dacie decyzji |
| `participants_by_status.in_program` | aktywne konta wolontariuszy **i studentów** bez daty ukończenia — `:80` | nie, stan dziś |
| `participants_by_status.completed` | konta z datą ukończenia, każdej roli — `:85` | **tak**, po dacie ukończenia |
| `participants_by_status.removed` | konta zanonimizowane — `:88` | **tak**, po dacie anonimizacji |
| `tests_passed_total` | zaliczone testy kursów ścieżki, wolontariusze **i studenci** — `:107, 139` | **tak**, po dacie pierwszej zaliczającej próby |
| `certificates_issued_total` | certyfikaty, **także unieważnione** — `:91` | **tak**, po dacie wydania |
| `supervisions_confirmed_total` | obecności na superwizjach (bez odwołanych) — `:94` | **tak**, po dacie terminu |

## Co zawierają pliki

- `GET /admin/report/export.csv` (`ReportController.php:45-59`, plik `raport.csv`): BOM,
  separator `;`, kolumny `id;first_name;last_name;role;hours_accepted;consultations;certificate_issued`
  (nagłówki po angielsku, rola jako kod, certyfikat jako `1`/`0`). Godziny i konsultacje
  w okresie z zapytania. To plik **z nazwiskami**.
- `GET /admin/report/grantor/export.csv` (`GrantorReportController.php:38-44`, plik
  `raport-grantodawcy.csv`): BOM, `;`, dwie kolumny `wskaznik;wartosc`, wiersze jak pola
  `indicators` (np. `participants_by_status.accepted`). **Bez nazwisk.**
- Żaden z plików nie ma miejsca na uwagi.

## Rozjazdy z decyzjami Fundacji przed zmianą

- Certyfikaty liczone razem z unieważnionymi (raport, pulpit, plik grantodawcy).
- Liczby programu liczą razem wolontariuszy i studentów (`active`, `completed`, średnia,
  godziny), a `completed` i `admitted` także inne role.
- Średnia godzin dzieli przez wolontariuszy i studentów razem.
- Raport nie pokazuje, którego roku programu dotyczy. Odpowiedź nie niesie edycji, a lista
  nie jest zawężona do edycji. Przy jednej edycji naraz wynik jest ten sam.
