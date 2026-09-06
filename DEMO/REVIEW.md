# Review stanu projektu — platforma szkoleniowa Fundacji Niepodzielni

**Stan na:** 2026-08-28, 17:05 · **Gałąź:** `main` @ `4639f0b`
**Poprzednie review:** 2026-08-28, 13:40 @ `6047769` — zachowane w całości w §12.

---

## 1. Nagłówek: **21/21 pakietów zamkniętych**

Wszystkie pakiety H01–H21 są scalone na `main`, mają dokument `DEMO/HXX.md`, testy
i wpis `DONE` na tablicy koordynacji. Do tego **22. deliverable spoza listy** (pulpit
uczestnika) i **działający publiczny staging** pod HTTPS.

Zostały **dwa przejścia integracyjne** (ścieżka demo P0 i P1 na danych seedowych) oraz
pięć jawnie odnotowanych zaległości w pakietach — szczegóły w §6.

---

## 2. Co się zmieniło od poprzedniego review (13:40 → 17:05)

Trzy godziny i pół, **38 scalonych PR-ów (#19–#57)**, **+31 tys. linii**.

| Poprzednie review mówiło | Stan teraz |
|---|---|
| **11/21** pakietów zamkniętych | **21/21** — komplet |
| H12 — `BLOCKED` (brak DTO superwizji w kontrakcie) | dowieziony 20 min później (PR #24) |
| H18 — „najbliższy krok, wciąż bez właściciela" | wzięty i dowieziony w 20 min (PR #27) |
| H03, H04, H07, H08, H09, H17, H20 — `GOTOWE`, nietknięte | **wszystkie siedem dowiezione** |
| 37 plików / 189 metod testowych | **74 pliki / 449 metod** |
| brak stagingu poza maszyną pokazową | **publiczny staging na VPS, auto-deploy z `main`** |
| „dokumentacji jest więcej niż backendu" | **backend wyprzedził dokumentację** (§5) |

Obie uwagi „do posprzątania" z poprzedniego review zostały zamknięte: rozjazd statusu
H05 poprawiony, H12 odblokowane i dowiezione. Trzecia — anomalia `h06.php` — **trwa**,
i ma teraz towarzystwo (§7, §11).

---

## 3. Skala w liczbach

| Metryka | Wartość | Δ od 13:40 |
|---|---|---|
| Commity razem | **185** (116 zwykłych + 69 merge) | +120 |
| Praca po starterze | **566 plików, +52 973 / −142 linii** | +318 plików, +31 024 linii |
| Scalone PR-y | **56** (#1–#57, bez #55) | +38 |
| Okno czasowe pracy (28.08) | **10:17 → 17:05** = **6 h 48 min** | +3 h 26 min |
| Tempo | ~**130 linii/min**, commit co ~**2,2 min** | wyraźnie szybciej |
| Pliki testowe / metody testowe | **74 / 449** | +37 / +260 |
| Strony frontu / komponenty | **35 / 42** | +16 / +20 |
| Kontrolery / FormRequesty / Resources / Serwisy | 40 / 55 / 34 / 29 | — |
| Modele Eloquent | 30 | 0 |
| Migracje | 14 (13 ze startera + **1 addytywna**) | 0 — patrz §11 |
| Dokumenty DEMO | 23 (21 pakietów + prep + review) | +12 |
| OpenSpec: specyfikacje / archiwum / otwarte | 18 / 13 / **10** | +7 / +13 / +4 |

Cały projekt powstał w **jeden dzień**. Starter wjechał 20.08, reszta — 28.08, od
10:17 do 17:05.

---

## 4. Kto co dowiózł

Sumy z commitów scalonych do `main` (bez merge'y):

| Osoba | Commity | Linie | Pliki | Pakiety |
|---|---|---|---|---|
| **Błażej Ksycki** | 44 + 52 merge PR | +14 642 / −256 | 182 | H14, H19, H15, H17 |
| **Mikołaj (mixonnn)** | 31 | +12 623 / −119 | 154 | H06, H11, H12, H03, H07 · **staging** |
| **Tomek Wilczak** | 17 | +12 413 / −79 | 138 | **H01, H10, H13, H21, H18, H09** · pulpit |
| **Mariusz Jendrzejczak** | 18 | +9 659 / −59 | 78 | H05, **H08** |
| **Irek Grycuk** | 5 | +4 048 / −38 | 56 | H02, H16, H04, H20 |

### Ciekawostki o ludziach

**#1 — Moneyball Irka utrzymał się do końca.** Trzecie review z rzędu ten sam wynik:
przy 13:40 miał 3 commity i 2 pakiety, teraz **5 commitów i 4 pakiety** — H02, H16,
H04, H20. **0,80 pakietu na commit**, ośmiokrotnie lepiej niż średnia zespołu. Ani
jednego commita „poprawka do poprawki" w całym dniu. H20 (raporty + dziennik działań,
15 metod testowych, 3 ekrany) dowiózł **jednym** commitem.

**#2 — Tomek zamknął sześć pakietów i dołożył siódmy, którego nikt nie zamawiał.**
H01, H10, H13, H21, H18, H09 — plus `feat(pulpit)`: ekran `/panel/pulpit` z mapą
rozwoju uczestnika, zbudowany wyłącznie na endpointach, które już były na `main`.
Zero nowych tras, zero migracji, świadomie pominięte sekcje wskazujące na pakiety
jeszcze niedowiezione — żeby nie zrobić martwych linków. To jedyny deliverable w repo,
który powstał z obserwacji „brakuje ekranu, który to spina", a nie z listy zadań.

**#3 — Mikołaj przestał pisać pakiety i zbudował infrastrukturę.** Pięć pakietów
(H06, H11, H12, H03, H07), a potem 9 commitów `staging` w 71 minut: Oracle VPS,
Traefik, wolumeny, cache Next.js, Sanctum przez HTTPS. Od 15:52 do 17:03 doprowadził
`main` do stanu, w którym **merge automatycznie ląduje na publicznym adresie** (§8).

**#4 — Błażej jest procesem zespołu, nie tylko integratorem.** 52 z 56 scalonych PR-ów
plus 44 własne commity, z czego większość to nie kod pakietów, tylko `docs(openspec):`,
`docs(board):`, `docs(zaleznosci):` — synchronizacja tablicy, kolorów torów i
specyfikacji. Cztery pakiety dowiózł przy okazji. Najniższy stosunek pakietów do
commitów (0,09) i osoba, bez której 56 PR-ów nie weszłoby na `main`.

**#5 — Mariusz zrobił największy pojedynczy pakiet dnia.** H08 (CMS treści) to
8 commitów p1–p8 w 72 minuty, **64 metody testowe** — o połowę więcej niż drugi
w kolejności — dwa ekrany administracji (727 i 497 linii) i najdłuższy plik zadań
OpenSpec w repo. Jedyny pakiet dostarczony w jawnie ponumerowanych fazach.

---

## 5. Podział wysiłku — punkt zwrotny

| Warstwa | Linie | Udział | Przy 13:40 |
|---|---|---|---|
| **Backend (Laravel)** | **21 537** | **41 %** | 38 % |
| Dokumentacja (.md) | 19 232 | 36 % | **41 %** |
| Frontend (Next.js) | 11 839 | 22 % | 21 % |
| Infrastruktura (compose, CI, deploy) | 365 | 1 % | — |

**#6 — dokumentacja straciła pierwsze miejsce, i to jest dobra wiadomość.** Przez cały
poranek proporcja trzymała się na 41 % docs / 38 % backend — również w migawce o 15:14.
W ostatnich dwóch godzinach zespół dowiózł siedem pakietów naraz i **backend wyprzedził
dokumentację po raz pierwszy w historii projektu**. Nie dlatego, że przestano pisać
specyfikacje (przybyło ich 6 tys. linii), tylko dlatego, że kod w końcu je dogonił.

---

## 6. Tablica pakietów — komplet, ale z pięcioma gwiazdkami

| Status | Pakiety | Liczba |
|---|---|---|
| **DONE** | H01 · H02 · H03 · H04 · H05 · H06 · H07 · H08 · H09 · H10 · H11 · H12 · H13 · H14 · H15 · H16 · H17 · H18 · H19 · H20 · H21 | **21** |

**#7 — tablica po raz pierwszy nie kłamie.** Poprzednie review złapało jeden rozjazd
(H05 wisiał jako `W TOKU` po scaleniu); migawka o 15:14 złapała trzy naraz (H04, H15,
H18 scalone, a na tablicy `REVIEW`). Commit `docs(openspec): zsynchronizuj tablicę i
zadania ze stanem faktycznym` (16:57, PR #56) domknął sprawę: **21 wierszy, 21 statusów
zgodnych z `main`**. Zespół naprawił nie tylko dane, ale i proces — Mikołaj usunął
regułę „jeden otwarty PR na zespół" (`docs: usuń limit jednego otwartego PR`, 16:23),
która była wąskim gardłem przy siedmiu równoległych pakietach.

### Co zostało otwarte

Tablica jawnie odnotowuje pięć zaległości — to nie są braki ukryte, tylko wypisane:

| Pakiet | Zaległość |
|---|---|
| **H08** | sekcje zakresu w `DEMO/H08.md` z pustymi miejscami „uzupełniane w fazie 6/9" |
| **H09** | **frontend pakietu nie istnieje** — scalony jest wyłącznie backend + OpenSpec; K1–K12 czekają na strażnika kontraktu |
| **H17** | wizualny przegląd obu ekranów w przeglądarce |
| **H18** | ręczny scenariusz `DEMO/H18.md` 7.3; pytanie do strażnika o typ powiadomienia dla zaproszenia z `POST /admin/users` |
| **H20** | rozstrzygnięcie strażnika o filtrze `user_id` w dzienniku |

Do tego **dwa niewykonane punkty integracyjne tablicy**: **3.11** (wspólne przejście
ścieżki demo P0) i **4.9** (ścieżka P1). Oba wymagają człowieka przy przeglądarce, nie
kodu — i oba są dziś jedynym, co dzieli projekt od odbioru.

Sekcja **6. Integracja i przekazanie** ma wszystkie cztery punkty niezaznaczone.

---

## 7. Pokrycie testami — 449 metod i jedna dziura

| Pakiet / obszar | Metody | Komentarz |
|---|---|---|
| **H08** — CMS treści | **64** | zdecydowany lider; 5 plików, w tym 415-liniowy `ReorderTest` |
| **H09** — wizytówki i przypisania | 38 | + `AssignmentResolverTest` i test regresji |
| **H18** — panel osób | 32 | 6 plików |
| H05 — kursy | 28 | katalog, szczegóły, widoczność, materiały |
| H10 — testy wiedzy | 28 | + współbieżność |
| H03 — rekrutacja | 27 | + współbieżność, + 2 testy jednostkowe |
| H14 — dokumenty | 26 | + `ConcurrentDocumentNumberTest` |
| **H17** — pytania do prowadzącego | 25 | + `QuestionRoutingTest` (unit) |
| H13 — certyfikaty | 21 | + współbieżność |
| H15 — profil psychologa | 20 | |
| H04 — dostęp czasowy | 17 | egzekwowanie, komenda cron, przedłużenie |
| **H20** — raporty i dziennik | 15 | |
| Feature (root) | 15 | koperty błędów, seed, smoke tras publicznych |
| **H07** — rzetelność | 14 | w tym 5 metod w `ProgressAggregatorReliabilityTest` |
| H01 · H21 | po 11 | |
| H19 · H16 | po 10 | |
| Auth · H11 · H12 | po 8 | |
| H02 — matryca uprawnień | 7 | test-kit, zero tras — zgodnie z zamysłem |
| Support (`CourseAccess`) | 6 | |
| **H06 — lekcja, odtwarzacz, postęp** | **0** | **brak katalogu testów** |

**#8 — H06 nie ma ani jednego własnego testu.** Nie ma katalogu `tests/Feature/H06`.
Endpointy `GET /lessons/{id}`, `POST /lessons/{id}/progress` i
`POST /lessons/{id}/complete` — czyli heartbeat postępu, przycinanie `active_delta` do
35 s i próg ukończenia lekcji — są dotykane wyłącznie **ubocznie**, przez testy H08
i H17, które potrzebują lekcji jako danych. To pakiet **P0**, jeden z pięciu filarów
demo, i jednocześnie ten sam pakiet, który trzyma logikę domenową w pliku tras (§11).
Dwie niezależne uwagi wskazują na to samo miejsce.

**#9 — czterech niezależnych autorów napisało testy współbieżności.** H10, H13, H14,
H03 i H12 mają dedykowane `Concurrent*Test` na wyścigi o limity podejść, numery
certyfikatów, numery dokumentów, duplikat e-maila i ostatnie miejsce na superwizji.
Pięć pakietów, cztery osoby, zero poleceń w dokumentacji — zachowanie rozprzestrzeniło
się samo.

**#10 — test-kit H02 zadziałał dokładnie tak, jak go zaprojektowano.** O 15:38 padł
commit `test(H02): odblokuj matrix_5d i matrix_5e po scaleniu H04 i H12`. Matryca
uprawnień od początku miała dwa przypadki oznaczone `skipped`, bo zależały od
pakietów, które jeszcze nie istniały. Gdy H04 i H12 weszły na `main`, ktoś **odblokował
istniejące testy zamiast pisać nowe** — dziś w całym pliku nie ma już ani jednego
`markTestSkipped`. Siedem metod testowych pokrywających 48 kombinacji rola × trasa.

---

## 8. Staging — od maszyny pokazowej do publicznego adresu

Nowość, której poprzednie review nie miało w ogóle. Między 15:52 a 17:03 Mikołaj
postawił staging na prywatnym Oracle VPS:

- `docker-compose.oracle.yml` (152 linie) — frontend i API dołączają do istniejącej
  sieci Traefika, bez drugiego reverse proxy i bez nowych portów publicznych;
- `deploy/oracle/` — `bootstrap-server.sh`, `deploy.sh`, `env.example`, README;
- `.github/workflows/deploy-staging.yml` — **auto-deploy po każdym merge do `main`**;
- HTTPS + `X-Robots-Tag: noindex,nofollow`, wyłącznie dane demo, sekrety tylko
  w `.env` na VPS-ie.

Siedem z dziewięciu commitów tej serii to `fix(staging):` — cache Next.js, wolumeny
runtime, etykiety SELinux, uwierzytelnianie Sanctum przez HTTPS, checkout na `main`.
Klasyczne „działa lokalnie", rozbrojone w godzinę.

**#11 — Basic Auth zniknął ze stagingu.** Commit `fix(staging): remove HTTP Basic Auth`
(16:33) odblokował dostęp, bo kolidował z uwierzytelnianiem Sanctum. Efekt: staging
jest publicznie dostępny pod HTTPS, chroniony wyłącznie tokenem Sanctum na endpointach
danych i `noindex` przed wyszukiwarkami.
`docs/system/01-architektura-i-integracje.md` §83 wymaga dla środowiska testowego
**„dostęp ograniczony (basic auth / VPN)"** — to świadomy kompromis hackathonowy
(na stagingu są wyłącznie dane demo z `04-seed-demo.md`), ale rozjazd ze specyfikacją
niefunkcjonalną, który trzeba zamknąć przed pokazaniem środowiska Fundacji.

---

## 9. Największe pojedyncze artefakty

```
792  backend/database/seeders/DemoSeeder.php
727  app/(administracja)/admin/kursy/[id]/page.tsx    ← największy plik aplikacji (H08)
585  components/pulpit/PulpitDashboard.tsx            ← pulpit spoza listy pakietów
497  app/(administracja)/admin/kursy/page.tsx
481  frontend/lib/api.ts
471  DEMO/H9-prep-doc.md
451  docs/hackathon/01-pakiety-zadan.md
418  components/h15/PsychologistProfileForm.tsx
415  tests/Feature/H08/ReorderTest.php                ← największy plik testowy
414  docs/hackathon/02-kontrakt-api.md
413  components/h12/InstructorGroup.tsx
377  openspec/changes/h08-cms-tresci/tasks.md
250  backend/routes/api/h06.php                       ← anomalia, patrz §11
```

**#12 — trzy z pięciu największych plików aplikacji należą do dwóch ostatnich godzin.**
Ekrany H08 (727 + 497) i pulpit (585) powstały po 15:00. Zespół nie zwolnił pod koniec
— przeciwnie, największe pojedyncze artefakty dowiózł na finiszu.

---

## 10. Rytm dnia

```
10:00  ██               6 commitów   ← rozruch, tablica zadań, mapa zależności
11:00  ████            11 commitów   ← pierwsze pakiety (H01, H05, H21, H06, H16)
12:00  ████████        23 commity
13:00  ███████████     33 commity    ← H13, H12, H18, H04
14:00  ██████████      29 commitów   ← H15, H03 + synchronizacja OpenSpec
15:00  ███████████     32 commity    ← H20, pulpit, H08 rusza, staging rusza
16:00  ████████████████ 46 commitów  ← SZCZYT: H09, H17, H07, H08 kończy, staging
17:00  █                4 commity    ← domknięcie
```

**#13 — najgęstsza godzina wypadła jako przedostatnia.** Poprzednie review (13:40)
opisywało zespół jako „domykający PR-y" i wskazywało 12:00 jako szczyt z 16 commitami.
W rzeczywistości szczyt przyszedł **cztery godziny później**: 46 commitów między 16:00
a 17:00, prawie trzy razy więcej niż domniemany szczyt. W tej jednej godzinie
domknięto **cztery pakiety** (H09, H17, H07, H08) i postawiono staging. Zespół
przyspieszał do samego końca.

---

## 11. Higiena repo

### Mocne strony

- ✅ **Zero naruszeń własności tras** — sprawdzone plik po pliku: każdy z 20 aktywnych
  `backend/routes/api/hXX.php` ma w historii wyłącznie commity swojego pakietu.
  Dwadzieścia plików, dwudziestu właścicieli, zero kolizji — przez cały dzień.
- ✅ **Struktura tabel nietknięta** — 13 migracji ze startera bez jednej zmiany.
- ✅ **Komplet dokumentacji DEMO** — 21 dokumentów, po jednym na każdy pakiet.
- ✅ **Kontrakt API zmieniany oszczędnie** — 3 commity przez cały dzień, ostatni
  o 13:59. Siedem pakietów dowiezionych po tej godzinie **nie potrzebowało ani jednej
  zmiany kontraktu** — najlepszy dowód, że kontrakt był dobrze napisany przed startem.
- ✅ **Fasada startera poprawiona, sygnatura nietknięta** — `fix(starter)` na
  `ProgressAggregator::reliabilityPercent` (15:28) zmienił 14 linii wewnątrz metody
  i dołożył 111 linii testu; trzy publiczne sygnatury (`for`, `reliabilityPercent`,
  `formatDecimal`) pozostały takie, jakie zamrożono przed hackathonem.
- ✅ **Reakcja na podatność** — `fix(frontend): patch nanoid security advisory` (16:28).

### Do poprawy

- ⚠️ **`h06.php` — 250 linii przy medianie 33.** Trzecie review z rzędu, bez zmian.
  Plik tras deklaruje **własną klasę `FormRequest` (`H06ProgressRequest`) wewnątrz
  pliku routingu**, opakowaną w `if (! class_exists(...))`. Pozostałe pliki tras
  mieszczą się w 15–60 liniach. W połączeniu z zerowym pokryciem testami (§7) to
  najsłabszy punkt repo — i akurat w pakiecie P0.
- ⚠️ **Archiwum OpenSpec rozjechało się mocniej niż poprzednio.** Z 10 otwartych zmian
  **osiem dotyczy pakietów już scalonych** (`h04`, `h05`, `h07`, `h08`, `h09`, `h17`,
  `h18`, `h20`). Przy 13:40 nieodarchiwizowana była jedna, o 15:14 — trzy. Tablica
  została zsynchronizowana ręcznie (§6), archiwum OpenSpec nie.
- ⚠️ **H09 bez frontendu.** Pakiet ma status `DONE`, 38 metod testowych i komplet
  tras — ale ani jednego ekranu. Wizytówki prowadzących nie istnieją w interfejsie,
  co pulpit uczestnika jawnie obchodzi („brak wizytówek prowadzących" wśród świadomych
  pominięć). `DONE` oznacza tu „backend gotowy", nie „pakiet dowieziony".
- ⚠️ **Staging bez ograniczenia dostępu** — rozjazd ze specyfikacją niefunkcjonalną,
  patrz §8.
- ⚠️ **Pierwsza regresja międzypakietowa.** `fix(H17): wołaj AssignmentResolver H09 na
  instancji, nie statycznie` (16:35, PR #52) — H17 sięgnął po serwis H09 scalony
  35 minut wcześniej i wywrócił się na sposobie wywołania. Naprawione tego samego dnia
  i przykryte testem regresji (`CourseInstructorRegressionTest`), ale to sygnał, że
  przy 21 scalonych pakietach zaczynają się liczyć zależności *między* nimi, nie tylko
  wewnątrz.
- ⚠️ **`DEMO/H9-prep-doc.md` łamie konwencję katalogu** — `DEMO/` to wyniki demo
  w schemacie `HXX.md`; ten plik jest dokumentem przygotowawczym z numerem `H9`
  zamiast `H09` i dubluje się z `DEMO/H09.md`.
- ⚠️ `Tomek :: First commit test Tomek` — commit-świadek z rozruchu, na zawsze
  w historii `main`.

---

## 12. Podsumowanie

Pięć osób, **niecałe siedem godzin**, ~53 tysiące linii, **56 scalonych PR-ów**,
**21 z 21 pakietów** z testami i dokumentacją DEMO, publiczny staging odświeżany
automatycznie z `main` — przy zerowym naruszeniu granic własności plików, nietkniętej
strukturze bazy i trzech zmianach kontraktu API przez cały dzień.

Obie uwagi poprzedniego review zamknięto. Nowe mają inny charakter: nie brakuje już
**pakietów**, brakuje **domknięcia** — dwóch przejść demo, jednego frontendu,
archiwum OpenSpec i testów H06.

**Do posprzątania — w kolejności:**

1. **Punkty 3.11 i 4.9 tablicy** — wspólne przejście ścieżki demo P0 i P1 na danych
   seedowych. Jedyne, co dzieli projekt od odbioru; wymaga człowieka, nie kodu.
2. **Frontend H09** — pakiet ma `DONE` przy samym backendzie; do decyzji, czy zamykamy
   go jako częściowy, czy dowozimy ekrany.
3. **Testy H06** — pakiet P0 bez ani jednego własnego testu, z logiką w pliku tras.
   Najpierw testy charakteryzujące, potem refaktor do kontrolera.
4. **Osiem zmian OpenSpec do archiwizacji** — `h04`, `h05`, `h07`, `h08`, `h09`,
   `h17`, `h18`, `h20`.
5. **Pięć zaległości z tablicy** (§6) — trzy pytania do strażnika kontraktu (H09 K1–K12,
   H18 typ powiadomienia, H20 filtr `user_id`) i dwa przeglądy ręczne (H17, H18).
6. **Dostęp do stagingu** — przywrócić ograniczenie zgodne ze specyfikacją albo
   świadomie ją zmienić przed pokazaniem środowiska Fundacji.
7. **Sekcja 6 tablicy** — cztery punkty integracji i przekazania, wszystkie
   niezaznaczone.

---

## 13. Archiwum — review z 2026-08-28, 13:40 (`main` @ `6047769`)

Zachowane w całości; nagłówki obniżone o jeden poziom, treść bez zmian.

<details>
<summary>Rozwiń poprzednie review</summary>

### 1. Skala w liczbach

| Metryka | Wartość |
|---|---|
| Commity razem | **65** (43 zwykłe + 22 merge) |
| Praca po starterze | **248 plików, +21 949 / −104 linii** |
| Scalone PR-y | **18** (#1–#18) |
| Okno czasowe pracy | **10:17 → 13:39** = **3 h 22 min** |
| Tempo | ~**108 linii/min**, commit co ~**4,7 min** |
| Pliki testowe / metody testowe | **37 / 189** |
| Strony frontu / komponenty | **19 / 22** |
| Modele Eloquent | 30 |
| Migracje | 14 — nietknięte, zamrożenie utrzymane ✅ |

Cały projekt powstał w **jeden poranek**. Starter wjechał 20.08, reszta — 28.08 między śniadaniem a obiadem.

### 2. Kto co dowiózł

| Osoba | Commity | Linie | Pliki | Pakiety |
|---|---|---|---|---|
| **Błażej Ksycki** | 15 + 17 merge | +6 796 / −78 | 103 | H14, H19 · H15 w toku |
| **Tomek Wilczak** | 9 | +5 993 / −45 | 83 | **H01, H10, H13, H21** |
| **Mikołaj (mixonnn)** | 9 | +5 019 / −28 | 67 | H06, H11 · H12 blocked |
| **Mariusz Jendrzejczak** | 8 | +2 648 / −57 | 57 | H05 |
| **Irek Grycuk** | 3 | +1 632 / −32 | 28 | H02, H16 |

#### Ciekawostki o ludziach

**#1 — Tomek to maszyna do pakietów.** 4 zamknięte pakiety w 9 commitach, w tym H13 (certyfikaty + publiczna weryfikacja) w **jednym** commicie. Najlepszy stosunek pakietów do commitów w zespole: **0,44 pakietu na commit**.

**#2 — Irek gra w Moneyball.** 3 commity, 2 zamknięte pakiety (H02 + H16), 1 632 linie. Najwyższa gęstość dowozu: **545 linii na commit** i **0,67 pakietu na commit** — a H02 przejął po porzuceniu przez kogoś innego.

**#3 — Błażej scalił 17 z 18 PR-ów.** De facto integrator / release manager zespołu. Jego drugie konto (`64609904+xycu`) to wyłącznie merge z GitHub UI.

### 3. Podział wysiłku — projekt napisany bardziej po polsku niż w PHP

| Warstwa | Linie | Udział |
|---|---|---|
| **Dokumentacja (.md)** | **8 963** | **41 %** |
| Backend (Laravel) | 8 366 | 38 % |
| Frontend (Next.js) | 4 699 | 21 % |

**#4 — dokumentacji jest więcej niż backendu.** Napędzają to dwie osoby: Błażej (4 350 linii docs) i Mikołaj (3 211). Praktycznie cały `openspec/` + mapa zależności + design system.

Profile kontrybucji są wyraźnie różne:

- **Tomek** — 59 % backend, najbardziej „API-first" (3 562 linii BE)
- **Mikołaj** — 64 % dokumentacja, architekt specyfikacji
- **Irek** — jedyny z równowagą 50/50 BE↔FE (652 / 687)
- **Mariusz** — 57 % backend, najbardziej zbalansowany między BE a FE bez docs

### 4. Tablica pakietów — 11/21 zamknięte

| Status | Pakiety | Liczba |
|---|---|---|
| **DONE** | H01 · H02 · **H05** · H06 · H10 · H11 · H13 · H14 · H16 · H19 · H21 | **11** |
| **W TOKU** | H15 (Błażej) | 1 |
| **BLOCKED** | H12 | 1 |
| **GOTOWE** (nietknięte) | H03 · H04 · H07 · H08 · H09 · H17 · H18 · H20 | 8 |

**H12 — powód blokady:** kontrakt API nie definiuje pełnych DTO i walidacji superwizji, cyklu życia zapisu/wypisu ani właściciela wspólnego z H18 endpointu przypisania superwizora.

**Fala P0 jest praktycznie domknięta** — z 10 pakietów P0 brakuje tylko **H18** (panel osób) i **wspólnego przejścia ścieżki demo** (punkt 3.11 tablicy). To najbliższa rzecz do zrobienia.

#### ✅ Rozjazd na tablicy — naprawiony

Review zastał H05 ze statusem `W TOKU`, mimo że PR #15 był już scalony (`896c5c7`, 8 commitów): board mówił „w robocie", `main` mówił „w środku". Wiersz 3.3 tablicy został poprawiony na `DONE` (PR #15 scalony) — bez tego ktoś mógłby uznać pakiet za wolny albo za niedokończony przy odbiorze P0.

### 5. Pokrycie testami — bardzo nierówne

| Pakiet / obszar | Testy | Komentarz |
|---|---|---|
| Courses (H05) | **28** | najlepiej pokryty |
| H10 — testy wiedzy | **28** | + testy współbieżności |
| H14 — dokumenty | **26** | + `ConcurrentDocumentNumberTest` |
| H13 — certyfikaty | 21 | + concurrency |
| Feature (root) | 14 | koperty błędów, seed, smoke |
| H01 · H21 | po 11 | |
| H19 | 10 | |
| Notifications (H16) | 10 | |
| Auth · **H11** | po 8 | H11 najsłabiej pokryty z zamkniętych |
| PermissionMatrix (H02) | 7 | test-kit, zero tras — zgodnie z zamysłem |
| Support (`CourseAccess`) | 6 | |

**#5 — zespół sam z siebie pisał testy współbieżności.** Trzy niezależne pakiety (H10, H13, H14) mają dedykowane `Concurrent*Test` na wyścigi o limity podejść, numery certyfikatów i numery dokumentów. Na hackathonie to rzadkość — zwykle nikt nie testuje race conditions.

### 6. Największe pojedyncze artefakty

```
413  frontend/.../kursy/[slug]/test/page.tsx     ← największy plik projektu
409  frontend/.../panel/profil/page.tsx
367  frontend/.../panel/start/page.tsx
365  components/h11/InternshipJournal.tsx
365  docs/hackathon/05-zaleznosci-pakietow.md
321  DESIGN.md
313  DEMO/H05.md                                 ← najbardziej rozbudowany dokument DEMO
296  components/lesson/LessonPlayer.tsx
279  tests/Feature/H11/InternshipTest.php
235  backend/routes/api/h06.php                  ← anomalia, patrz niżej
```

**#6 — `h06.php` ma 250 linii, przy medianie 15.** Wszystkie pozostałe pliki tras mieszczą się w 28–40 liniach. H06 ma logikę odtwarzacza/heartbeatu wpisaną wprost w plik tras zamiast w kontroler — jedyne miejsce w repo, gdzie router robi realną robotę. Do refaktoru po hackathonie, ale działa.

### 7. Rytm dnia

```
10:00  ██████              6 commitów   ← rozruch, AGENTS.md, kolejka zadań
11:00  ██████████         10 commitów
12:00  ████████████████   16 commitów   ← szczyt
13:00  ██████████         10 commitów   ← domykanie PR-ów
```

**#7 — dwie kolizje sekundowe.** O **12:46** i **12:54** dwie osoby (Błażej i Mikołaj) commitowały w tej samej minucie. Przy 5 osobach i oknie 202 minut to statystycznie ~2 kolizje — czyli dokładnie tyle, ile wypadło. Zespół pracował równomiernie, bez wąskiego gardła na jednej osobie.

**#8 — najdłuższy komunikat commita to komunikat merge'a.** `0985712` Błażeja to 3-liniowy opis rozwiązania konfliktu na `tasks.md`, wyjaśniający, że status `REVIEW` dla H13 był nieaktualny, zanim PR w ogóle zdążył wylądować. Klasyczne hackathonowe „tablica ściga się z rzeczywistością".

### 8. Higiena repo

#### Mocne strony

- ✅ **Zamrożenie migracji utrzymane** — 14 migracji ze startera, zero nowych
- ✅ **Zero naruszeń własności tras** — każdy pakiet tylko w swoim `hXX.php`
- ✅ **11 dokumentów DEMO** — komplet, po jednym na każdy z 11 zamkniętych pakietów
- ✅ **OpenSpec żyje** — 11 specyfikacji zdolności + 6 aktywnych zmian + archiwum
- ✅ **Konwencja commitów trzymana** — `feat(HXX):` / `docs(team):` niemal wszędzie

#### Drobiazgi

- ⚠️ `Tomek :: First commit test Tomek` — tradycyjny commit-świadek, że setup działa. Został na zawsze w historii `main`.

### 9. Podsumowanie

Pięć osób, trzy i pół godziny, ~22 tysiące linii, 18 scalonych PR-ów i **11 z 21 pakietów zamkniętych z testami i dokumentacją DEMO** — przy zerowym naruszeniu zamrożonych migracji i granic własności plików.

**Do posprzątania:**

1. ~~**Status H05 na tablicy** — jest scalony, a wisi jako `W TOKU`.~~ → poprawione na `DONE` (PR #15 scalony).
2. **Odblokowanie H12** — wymaga decyzji strażnika kontraktu w sprawie DTO superwizji i właściciela endpointu `PUT /admin/users/{id}/supervisor`.

**Najbliższy krok do domknięcia fali P0:** pakiet **H18** (panel osób, wciąż bez właściciela) oraz wspólne przejście ścieżki demo (punkt 3.11 tablicy).

</details>
