# Hackathon — przewodnik organizacyjno-techniczny (wersja 2, po recenzji)

Platforma szkoleniowa Niepodzielni startuje na hackathonie: **~80 osób · 24 godziny ·
~16 zespołów po 4–5 osób**. Ten dokument mówi, jak pracować, żeby kod z hackathonu
**przetrwał** — wszedł do dalszego rozwoju platformy i służył uczestniczkom programu.

**Precedencja dokumentów:** `02-kontrakt-api.md` rozstrzyga kształt HTTP ·
`01-pakiety-zadan.md` rozstrzyga zakres i kryteria odbioru · `docs/system/`
(specyfikacja) rozstrzyga reguły biznesowe · `04-seed-demo.md` rozstrzyga stan danych
demo. Start środowiska: `03-pierwsze-30-minut.md`.

---

## 1. Zasady, dzięki którym praca 16 zespołów złoży się w jeden produkt

| Typowe ryzyko | Zabezpieczenie |
|---|---|
| każdy zespół wybiera własny stack | jeden stack narzucony starterem (§2) |
| konflikty w schemacie bazy | komplet migracji przed startem — **zamrożone**; zmiany tylko addytywne, w oknach (§4) |
| niekompatybilne API | kontrakt z góry + brakujące trasy przez strażnika (SLA 30 min) |
| konflikty w plikach współdzielonych | własność plików i sloty (§5.1) — trasy per pakiet, rejestr menu, CODEOWNERS |
| zalew PR-ów, których nikt nie zdąży przejrzeć | **limit 1 otwartego PR na zespół** + review partnerskie + bramki CI (§5) |
| „skończone" na laptopie autora | wspólny **staging = maszyna pokazowa na sali** (laptop sztabu; `scripts/pokaz.sh` pobiera `main`, przebudowuje i resetuje seedy) — odbiór tylko tam (§6) |
| brak zabezpieczeń („bo hackathon") | autoryzacja i walidacja to kryterium akceptacji, nie opcja |
| wszyscy padają o 3 w nocy | zmiany nocne narzucone z góry (§7) |

## 2. Stack i starter (gotowy PRZED hackathonem — warunek startu wydarzenia)

**Stack:** Laravel (PHP 8.4) · Next.js (TypeScript) · PostgreSQL · Redis · docker-compose.

Starter ma **imiennego właściciela po stronie zespołu prowadzącego, code freeze na
72 h przed wydarzeniem** i własny odbiór: świeży klon → setup → logowanie 6 kontami →
testy zielone → przykładowy PR przechodzi CI — sprawdzone na czystym Windowsie,
macOS i Linuksie przez osobę spoza zespołu. Zawartość w dniu startu:

**Infrastruktura:** docker-compose (backend, PostgreSQL, Redis, Mailpit, worker
kolejek) z konfigurowalnymi portami; skrypty `setup.sh`/`setup.ps1`; CI < 4 min
(lint + testy + **bramki**: smoke-test autoryzacji tras z listą wyjątków publicznych,
test koperty błędów, `migrate:fresh --seed` + smoke E2E); szablon PR; `.gitattributes`.

**Backend:** komplet migracji (model danych §2 — z kolumnami dodanymi po recenzji);
seedy dokładnie wg `04-seed-demo.md` (wspólne konta demo; staging resetowany
o pełnych godzinach); auth: logowanie, reset hasła, aktywacja konta z zaproszenia,
rate limiting; middleware ról + `access.active`; **fasady z zamrożonymi sygnaturami,
w cienkiej implementacji** (kilkanaście linii każda — sygnatura święta, środek wolno
ulepszać przez sztab): `Notify::send`, `AuditLog::record`, `Settings::edition`,
`CourseAccess::state`, `ProgressAggregator`, `PdfService`, helper CSV (BOM+`;`);
flagi funkcji (`config/features.php`); trasy dzielone na pliki per pakiet
(`routes/api/h01.php`…); komenda `demo:pass-test`.

**Frontend (wariant „plac budowy"):** tokeny z makiety + **8 komponentów bazowych**
(Button, Input, Select, Card, Table, Badge, ProgressBar, Alert) — dostępne
(focus/aria/kontrast); 3 layouty paneli + **rejestr pozycji menu**; klient API
z obsługą koperty błędów; mock `<VideoPlayer>`; strony 403 (z `reason`) / 404 / 500 /
„dostęp wygasł"; logowanie end-to-end. Bardziej złożone komponenty budują zespoły
z tokenów — spodziewana nierówność wizualna jest świadomym kosztem wariantu
(ujednolicenie po hackathonie).

## 3. Podział ludzi

- **~16 zespołów wykonawczych** (4–5 osób; składy układa sztab **przed wydarzeniem**
  na podstawie ankiety kompetencji — każdy zespół ma ≥1 osobę od Laravela i ≥1 od
  Reacta). **Pakiety P0 przydzielone imiennie przed wydarzeniem**; kluczowe P0
  (H10, H18) z podwójną obsadą backend/frontend. Po odbiorze pakietu zespół bierze
  kolejną kartę ze swojego toru (backend-heavy / frontend-heavy / zbalansowany)
  z fizycznej tablicy — karty przesuwa wyłącznie sztab.
- **Sztab integracyjny (6 osób, dwie zmiany z zakładką):** strażnik schematu, strażnik
  kontraktu, kapitan wydania + reviewerzy. **Model liaison:** każdy członek sztabu jest
  stałym opiekunem 3–4 zespołów i to on robi ich drugi przegląd. Pierwszy przegląd
  każdego PR-a robi **zespół partnerski** (pary A↔B ogłoszone na starcie).
- **Zespół jakości (4–5 osób):** scenariusz E2E podzielony na 5 ścieżek; przebieg na
  stagingu co ~3 h; issue z priorytetami; od H14 — przegląd dostępności (klawiatura,
  kontrast, etykiety) i stanów pustych/błędów. Wynikowe issue trafiają na „ławkę" —
  oficjalną kolejkę zadań dla zespołów, które czekają.

## 4. Zasady twarde

1. **Migracje zamrożone.** Zmiany wyłącznie przez strażnika schematu, wyłącznie
   **addytywne** (nowe kolumny nullable / nowe tabele), wyłącznie w oknach **H4 / H10 /
   H16**, ogłaszane jednym komunikatem („rebase + migrate"). Samowolna migracja =
   odrzucony PR.
2. **Kontrakt API źródłem prawdy kształtu HTTP.** Brakującą trasę zgłaszasz strażnikowi
   **przed implementacją** (SLA 30 min). Niezgodność = odrzucony PR.
3. **Limit 1 otwartego PR-a na zespół.** PR ≤ ~400 linii.
4. **Zakaz nowych zależności** composer/npm i bibliotek UI spoza startera bez zgody sztabu.
5. **Każde żądanie autoryzowane serwerowo** (middleware/policy) — pilnuje bramka CI.
6. **Walidacja wejścia (FormRequest) zawsze**; treści od użytkowników (opisy, pytania,
   bio) **escapowane przy wyświetlaniu**.
7. **Zdarzenia audytowe** wyłącznie slugami z rejestru kontraktu §3.2 przez
   `AuditLog::record`; **powiadomienia** wyłącznie typami z §3.1 przez `Notify::send`.
8. **Zakaz prawdziwych danych osobowych** — w seedach, testach i uploadach (żadnych
   własnych PESEL-i i dokumentów „do testu"). Storage czyszczony po wydarzeniu.
9. Teksty interfejsu po polsku wg makiety; kod po angielsku; sekrety tylko w `.env`.
10. **„Revert first":** main czerwony → każdy członek sztabu cofa merge bez dyskusji,
    wszystkie inne merge stoją. Co 2 h tag `green-HXX` na ostatnim dobrym stanie.

## 5. Przepływ pracy

Gałąź `pakiet/HXX-nazwa` → PR (szablon z checklistą DoD) → review partnerskie →
review liaisona → merge (sztab). CI zielone obowiązkowo. Funkcja nieskończona przy
code freeze → wyłączana flagą `features.hXX`.
Mock ponad blokadę: czekasz na cudzy endpoint → pracuj na seedach zgodnych z kontraktem
i oznacz `// TODO(HXX)`.
Wyniki opisujesz w **`DEMO/HXX.md`** (plik per pakiet — nie wspólny).
Pakiet, który tonie: **nie przechodzi do innego zespołu** — o H12 kapitan wydania tnie
go do minimum ★ albo dołącza do zespołu osobę ze sztabu.

### 5.1 Własność plików współdzielonych

| Plik/obszar | Właściciel | Inni |
|---|---|---|
| migracje, `DatabaseSeeder` | strażnik schematu | seeder per pakiet przez rejestr; ID z zakresów per pakiet (H05: 500–599 itd.) |
| `routes/api/hXX.php` | pakiet HXX | nie dotykać cudzych |
| fasady startera (`Notify`, `CourseAccess`, `ProgressAggregator`…) | sztab | zgłoszenia zmian przez issue |
| strona kursu `#/panel/kursy/:slug` | H05 | H06/H09/H17 dostarczają komponenty do slotów |
| `#/admin/kursy` | H08a | H08b i H09 przez sloty |
| layouty paneli, rejestr menu | sztab | pozycje menu: plik per pakiet |
| `UserResource` / kształt `/me` | sztab | potrzeby pól przez issue |

## 6. Definition of Done pakietu (odbiór przez liaisona, widoczny na tablicy)

1. Kryteria akceptacji spełnione **na stagingu** (maszyna pokazowa na sali,
   aktualizowana z `main` skryptem `scripts/pokaz.sh`); kryteria oznaczone jako
   testowe — przez wskazany w `DEMO/HXX.md` test w CI.
2. Endpointy zgodne z kontraktem; autoryzacja + walidacja; testy: happy path + odmowa
   dostępu **dla tras z kryteriów** (nie mechanicznie dla wszystkich).
3. Ekrany zbudowane z tokenów i komponentów bazowych startera (bez własnych bibliotek
   i stylów ad hoc), układ wg makiety; stan pusty i stan błędu obsłużone. Piksel-perfekt
   wobec makiety NIE jest wymagany na hackathonie (ujednolicenie po wydarzeniu).
4. Nowe ekrany: przegląd klawiaturą + lint dostępności zielony; treści użytkowników
   escapowane.
5. Zdarzenia audytowe i powiadomienia wg rejestrów kontraktu.
6. Seed pakietu w rejestrze seederów, zgodny z `04-seed-demo.md`.
7. `DEMO/HXX.md`: co działa, jak pokazać, czego brakuje.

## 7. Rytm 24 godzin

| Godzina | Co się dzieje |
|---|---|
| **przed wydarzeniem** | pre-flight (T-5…T-2): każdy uczestnik uruchamia starter w domu i wysyła PR „hello" do piaskownicy; składy zespołów + pakiety P0 ogłoszone; briefing sztabu |
| H0 | otwarcie: 30 min plenarnie (zasady twarde, mapa dokumentów) + 20 min breakouty torowe + 15 min zespół↔liaison nad kartą pakietu |
| H0–H2 | potwierdzenie środowisk (pre-flight był wcześniej — tu tylko wyjątki); start pracy |
| **H5** | **sanity kontraktu:** każdy zespół ma na main 1 endpoint w kopercie albo 1 ekran na design systemie |
| **H8** | **punkt kontrolny 1:** pakiety P0 — happy path API na stagingu |
| H12 | półmetek: mapa stanu na tablicy; decyzje kapitana o cięciu do ★ / wzmocnieniu |
| **H13–14** | **próba integracyjna:** obowiązkowy merge wszystkiego, co P0 ma; przebieg E2E; lista blokerów ogłoszona o H15 |
| **H16** | **punkt kontrolny 2:** ścieżka demo P0 przechodzi na stagingu (H01→H05→H06→H10→H16→H13★→H18/H19/H21) |
| H20 | **code freeze funkcji** — dalej tylko poprawki i flagi |
| H22 | scalenie `DEMO/`, przygotowanie scenariusza demo (prezentuje sztab, 3–4 osoby) |
| H24 | demo pełnej ścieżki + przekazanie |
| noc | zmiana sztabu 1: H0–H14, zmiana 2: H12–H24 (zakładka H12–14 z protokołem przekazania); w zespołach praca na dwie zmiany — narzucone, nie sugerowane |

## 8. Co się dzieje po hackathonie

Zespół prowadzący robi **audyt i triage**: każdy pakiet dostaje status przyjęty /
do poprawek / do przepisania. Realistycznie pełne DoD przejdzie 8–12 pakietów — dlatego
pakiety P0 mają podwójną obsadę i pierwszeństwo review: lepiej mniej pakietów odebranych
naprawdę niż wszystkie „prawie". To, co przejdzie audyt, staje się bazą dalszych prac —
zasady §4–6 to bilet waszego kodu do produkcji, nie biurokracja. Harmonogram dalszych
prac zostanie zaktualizowany do stanu po audycie.
