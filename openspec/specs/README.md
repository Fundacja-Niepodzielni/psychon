# Mapa zdolności — `openspec/specs/`

Ten dokument porządkuje docelową zawartość `openspec/specs/`: jedno źródło prawdy o
tym, jakie **zdolności** (capabilities) powstają z pakietów H01–H21, zanim ich zmiany
zostaną zarchiwizowane. Nie zastępuje `docs/hackathon/01-pakiety-zadan.md` (zakres,
kryteria odbioru) ani `05-zaleznosci-pakietow.md` (kolejność, tory) — tłumaczy je na
nazwy folderów w `openspec/specs/*/spec.md`.

## Konwencja nazewnictwa

Ustalona już w dwóch zarchiwizowanych i pięciu trwających zmianach:

- Slug zdolności — **angielski, kebab-case**, nazwany po zachowaniu, nie po pakiecie
  (`lesson-playback-progress`, nie `h06`).
- Jeden pakiet **może** dać więcej niż jedną zdolność, gdy ma wyraźnie odrębne zbiory
  wymagań pod wspólnym numerem — precedens: H19 → `edition-settings` +
  `admin-dashboard`; H10 → `knowledge-tests` + `workshop-completion`.
- Zdolność może być **współwłasnością** dwóch pakietów, gdy kontrakt tak stanowi
  (§7 pkt 5 dokumentu zależności: `PUT /admin/users/{id}/supervisor` należy jednocześnie
  do H12 i H18) — patrz `supervisor-assignment` niżej.
- Pakiety czysto proceduralne (`koordynacja-pakietow-h01-h21`) świadomie **nie**
  produkują zdolności — nie zmieniają zachowania platformy.

Status: **merged** = w `openspec/specs/` już dziś · **w toku** = ma folder w
`openspec/changes/<zmiana>/specs/` · **proponowana** = pakiet nie ma jeszcze otwartej
zmiany, nazwa poniżej to propozycja do zaakceptowania przy starcie pakietu.

## Pełna mapa

| Zdolność (slug) | Pakiet | Status | Zmiana / Purpose |
|---|---|---|---|
| `lesson-playback-progress` | H06 | **merged** | odtwarzacz, trwały postęp, próg ukończenia |
| `internship-journal-approvals` | H11 | **merged** | dziennik stażu + akceptacje opiekuna |
| `edition-settings` | H19 | **merged** | klucze edycji, walidacja zakresów, audyt |
| `admin-dashboard` | H19 | **merged** | liczniki + kolejki spraw z linkami |
| `documents` | H14 | **merged** | porozumienie/zaświadczenie ze snapshotem profilu |
| `knowledge-tests` | H10 | **merged** | test 10 pytań, limit podejść, snapshot |
| `workshop-completion` | H10 | **merged** | odznaczenie warsztatu stacjonarnego |
| `certificate-issuance-verification` | H13 | **merged** | warunki, wydanie, weryfikacja publiczna |
| `onboarding` | H21 | **merged** | `#/panel/start`, treść edytowalna |
| `permission-matrix-testkit` | H02 | **merged** | `actingAsRole()`, matryca, nawigacja wg roli |
| `participant-profile` | H01 | proponowana | dane profilu, PESEL/adres szyfrowane, zgody |
| `gdpr-data-export` | H01 | proponowana | eksport RODO w tle, 5 zakresów danych |
| `recruitment-applications` | H03 | **merged** (`2026-08-28-h03-recruitment-applications`) | kolejka zgłoszeń, akceptacja/odrzucenie, import CSV |
| `time-limited-access` | H04 | **merged** (backfill, `h04-dostep-czasowy`) | wyjątki `access.active`, `extend-access`, audyt |
| `course-catalog` | H05 | **merged** (backfill, `h05-katalog-kursow`) | lista etapów, `CourseAccess`, blokada z powodem — 4 odstępstwa oczekują na zatwierdzenie strażnika |
| `reliability-monitoring` | H07 | proponowana | rzetelność z `ProgressAggregator`, próg, izolacja grup |
| `course-content-management` | H08a | proponowana | CRUD kursów/lekcji, kolejność, soft delete |
| `lesson-materials` | H08b | proponowana | upload, walidacja typu/rozmiaru, podpisane linki |
| `course-invitations` | H08b | proponowana | zaproszenia e-mail → `course.invited` |
| `instructor-directory` | H09 | proponowana | wizytówki prowadzących |
| `instructor-assignments` | H09 | proponowana | przypisania + reguła dziedziczenia (wspólna z H17) |
| `supervision-scheduling` | H12 | proponowana | terminy, zapisy transakcyjne, obecności |
| `supervisor-assignment` | H12 + H18 | proponowana | `PUT /admin/users/{id}/supervisor` (właściciel do ustalenia — §7 pkt 5) |
| `psychologist-profile-publication` | H15 | proponowana | wniosek → weryfikacja → publikacja, zgoda odwołalna |
| `notification-inbox` | H16 | proponowana | dzwonek, rejestr §3.1, read/read-all |
| `simulated-email-outbox` | H16 | proponowana | `#/admin/emails`, status `simulated` |
| `instructor-questions` | H17 | proponowana | routing wg dziedziczenia, odpowiedź, izolacja |
| `participant-accounts-directory` | H18 | proponowana | lista, filtr/szukaj, tworzenie/edycja/blokada, CSV |
| `participant-record-card` | H18 | proponowana | karta osoby — kształt z kontraktu, jeden agregator |
| `reports-and-audit-log` | H20 | **merged** (`h20-raporty-i-dziennik`) | raport edycji + eksport CSV; dziennik działań, filtry po slugach §3.2, zero tras zapisu |

30 zdolności na 21 pakietów. Pakiety jednozdolnościowe: H01 (wyjątkowo dwie — profil i
eksport mają zupełnie inny cykl życia, patrz niżej), H02, H03, H04, H05, H07, H13,
H14, H15, H17, H20, H21. Pakiety dwuzdolnościowe: H01, H09, H10, H12 (współdzielona
z H18), H16, H18, H19. Pakiet H08 dzielony już na poziomie karty zadania (H08a/H08b) —
tu każdy sub-pakiet dodatkowo rozbity, bo `lesson-materials` i `course-invitations`
mają zupełnie inne wejścia (plik vs e-mail) mimo wspólnego slotu w `#/admin/kursy`.

## Uzasadnienie podziałów, które nie są oczywiste z karty pakietu

- **H01 → dwie zdolności.** `participant-profile` (formularz, PESEL/adres, zgody) i
  `gdpr-data-export` (zadanie w tle, plik, wygasający link) mają różne wymagania
  bezpieczeństwa (szyfrowanie pól vs autoryzacja pobrania) i różny rytm zmian —
  eksport prawdopodobnie zostanie dotknięty ponownie przy realnej integracji RODO
  po hackathonie, profil nie.
- **H09 → dwie zdolności.** `instructor_profiles` i `course_assignments` to osobne
  tabele z osobnymi aktorami (prowadzący edytuje wizytówkę, administracja przypisuje).
  Reguła dziedziczenia żyje w `instructor-assignments`, bo to ona decyduje, dokąd
  trafia pytanie (współdzielony scenariusz z `instructor-questions`).
- **H12 → `supervisor-assignment` jako zdolność współdzielona z H18**, nie podzdolność
  H12. To dosłownie punkt koordynacyjny #5 z `05-zaleznosci-pakietow.md` — jeden zespół
  implementuje, drugi konsumuje. Trzymanie tego jako osobnej zdolności (zamiast
  chowania w `supervision-scheduling` albo `participant-record-card`) daje miejsce na
  spec, który obie strony czytają przed startem, zamiast negocjować w PR review.
- **H16 → dwie zdolności.** `notification-inbox` (szyna + dzwonek) i
  `simulated-email-outbox` (skrzynka administracji) mają różnych odbiorców (każda rola
  vs wyłącznie administracja) i różne kryteria odbioru w karcie pakietu.
- **H18 → dwie zdolności.** `participant-accounts-directory` (lista, CRUD konta,
  blokada, CSV) to co innego niż `participant-record-card` (jeden GET, kompozycja z
  `ProgressAggregator` — ta sama zdolność koncepcyjnie co liczby w `admin-dashboard`,
  `reports-and-audit-log` i warunkach certyfikatu, tylko inny kontekst wyświetlenia).
- **H20 → jedna zdolność `reports-and-audit-log`.** Mapa proponowała tu podział 1:1 z
  dwoma ekranami (`cohort-report` dla `#/admin/raport`, `audit-log-viewer` dla
  `#/admin/dziennik`) i dwoma tabelami źródłowymi. Pakiet przy starcie przyjął jedną
  zdolność — oba ekrany dzielą rolę (`project_manager`/`super_admin`), wspólny helper
  CSV i ten sam zestaw kryteriów odbioru, a rozdzielenie dawałoby dwa specy czytane
  zawsze razem. Nazwy z mapy były propozycją do zaakceptowania przy starcie pakietu
  (patrz „Konwencja nazewnictwa"), więc wiążąca jest nazwa ze zmiany.

## Zdolności żniwne (dojrzewają późno, patrz §5c dokumentu zależności)

`time-limited-access` (H04), `permission-matrix-testkit` (H02),
`reports-and-audit-log` (H20) i `documents` (H14) mają specs, które prawdo­
podobnie dostaną drugą rundę `ADDED`/`MODIFIED Requirements` już po pierwszym mergu —
ich kompletność zależy od tego, ile innych pakietów wyemitowało zdarzenia/trasy do
pokrycia. To nie błąd planowania, tylko naturalna kolejność w falach z §6.2.
