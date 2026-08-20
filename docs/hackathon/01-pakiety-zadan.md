# Pakiety zadań na hackathon (wersja 2, po recenzji)

21 pakietów do rozdania zespołom. Każdy pakiet to **pionowy wycinek**: API + ekran +
testy + seed demo. Kształty HTTP: `02-kontrakt-api.md` (rozstrzyga trasy/koperty/kody).
Reguły biznesowe: `../03-dokumentacja-systemu/04-specyfikacja-modulow-mvp.md` (moduły
M1–M21; odwołania typu „M2 pkt 4" = numerowany punkt w sekcji modułu). Stan początkowy
seedów, do którego odwołują się kryteria: `04-seed-demo.md`. Zachowanie ekranów: makieta.

**Priorytety:** **P0** — składają się na pełną ścieżkę demo uczestnika (rozdawane
najpierw, kluczowe z podwójną obsadą — patrz przewodnik §3); P1 — pełny program;
P2 — dopełnienie. **Rozmiary w osobogodzinach zespołu:** S ≈ 25 h · M ≈ 60 h ·
L ≈ 100 h (zespół 4–5 osób ma ~80–100 osobogodzin na dobę, z czego 1/4 zjada nauka
projektu — realnie zespół domyka jeden pakiet M/L albo dwa S).

**Minimum vs rozszerzenie:** kryteria oznaczone ★ to **minimum pakietu** — przy
realokacji o H12 tniemy do ★. Pozostałe kryteria to pełny zakres.

| ID | Pakiet | Prio | Rozmiar | Moduł |
|---|---|---|---|---|
| H01 | Profil użytkownika i eksport RODO | **P0** | M | M2 |
| H02 | Uprawnienia — test-kit matrycy | **P0** | M | M2 |
| H03 | Rekrutacja — kolejka zgłoszeń | P1 | M | M3 |
| H04 | Dostęp czasowy | P1 | S | M2 pkt 5 |
| H05 | Katalog kursów i sekwencyjne odblokowanie | **P0** | M | M4 |
| H06 | Lekcja — odtwarzacz i postęp | **P0** | M | M4 |
| H07 | Pomiar czasu nauki i rzetelność | P1 | M | M7 |
| H08 | CMS treści (dzielony: H08a kursy/lekcje · H08b materiały/zaproszenia) | P1 | L | M4 |
| H09 | Prowadzący — wizytówki i przypisania | P1 | M | M5 |
| H10 | Testy wiedzy + warsztat | **P0** | **L** | M6 |
| H11 | Staż — dziennik i akceptacje | P1 (P0.5) | M | M8 |
| H12 | Superwizja — terminy, zapisy, obecności | P1 (P0.5) | **L** | M9 |
| H13 | Certyfikaty + weryfikacja publiczna | P1 · **minimum ★ w P0** | **L** | M10 |
| H14 | Dokumenty generowane z profilu | P2 | S | M11 |
| H15 | Profil psychologa | P2 | M | M12 |
| H16 | Powiadomienia (dzwonek + e-maile symulowane) | **P0** | M | M13 |
| H17 | Pytania do prowadzącego | P2 | S | M13 |
| H18 | Panel — osoby i karta osoby | **P0** | **L** | M14 |
| H19 | Panel — pulpit i ustawienia edycji | **P0** | S | M14 |
| H20 | Raporty i widoki dziennika działań | P2 | M | M15 |
| H21 | Onboarding „Zacznij tutaj" | **P0** | S | M16 |

„P0.5" = rozdawane natychmiast po obsadzeniu P0 — bez nich karta osoby i warunki
certyfikatu pokazują puste sekcje.

## Poza pakietami — świadomie (żeby nikt tego nie szukał)

- **W starterze (gotowe przed H0):** logowanie + reset/ustawienie hasła z zaproszenia
  + rate limiting; fasady `Notify::send`, `AuditLog::record`, `Settings::edition`,
  `CourseAccess::state`, `ProgressAggregator`, `PdfService` (PDF+QR), helper CSV;
  flagi funkcji; strony globalne 403/404/500/„dostęp wygasł"; migracje + seedy wg
  `04-seed-demo.md`; smoke-test autoryzacji tras jako bramka CI.
- **Po hackathonie (zespół prowadzący):** anonimizacja RODO (art. 17), unieważnianie
  certyfikatów, ekran `#/admin/postepy`, czat pomocy, strony prawne, powiadomienia
  o wygasaniu dostępu, przypomnienia superwizji, obsługa wielu edycji.

---

## H01 · Profil użytkownika i eksport RODO — P0 · M

**Cel:** uczestnik widzi i uzupełnia swoje dane; komplet danych do umów. (M2)
**Ekrany:** `#/panel/profil`. **Tabele:** `users`, `consents`; eksport czyta też
`lesson_progress`, `internship_entries`, `documents`.
**Endpointy:** `GET/PATCH /me` · `POST /me/exports` · `GET /me/exports/{id}` ·
`GET /me/exports/{id}/download`.
**Zakres:** formularz danych (telefon, adres, PESEL — szyfrowane po stronie serwera
PESEL **i adres**, walidacja PESEL); pole e-mail tylko do odczytu (zmiana przez
administrację); podgląd zgód z wersją i datą; eksport RODO w tle (profil, zgody,
postępy, wpisy stażu, metadane dokumentów) + powiadomienie `export.ready`.
**Kryteria:**
1. ★ PESEL niepoprawny → 422 z komunikatem przy polu; poprawny zapisuje się;
   właściciel widzi pełny numer w `GET /me`, administracja na karcie osoby,
   nikt inny nigdzie.
2. ★ `PATCH /me` z polem `email` nie zmienia e-maila (pole ignorowane lub 422).
3. Eksport: plik zawiera wszystkie pięć zakresów danych; pobranie cudzego
   `GET /me/exports/{id}` → 404 (test).

## H02 · Uprawnienia — test-kit matrycy — P0 · M

**Cel:** matryca ról pokryta testami wielokrotnego użytku; nawigacja frontu wg roli.
(M2; matryca: `../03-dokumentacja-systemu/03-role-i-uprawnienia.md` §2, testy §5)
**Uwaga po recenzji:** smoke-test „każda trasa ma autoryzację" jest **bramką CI ze
startera** (lista wyjątków publicznych w `config/public_routes.php`) — nie zadaniem
tego pakietu. H02 nie modyfikuje plików innych pakietów.
**Zakres:** helper `actingAsRole()` + data provider z wierszy matrycy; komplet testów
dla wierszy oznaczonych ✔/S istniejących w P0; testy §5 a–f nazwane `matrix_5a`…`f`
(te zależne od H04/H12 oznaczone `skipped` do czasu powstania pakietu — z komentarzem);
nawigacja frontu wg roli (rejestr pozycji menu ze startera); ekran 403 z `reason`.
**Kryteria:**
1. ★ `php artisan test --filter=PermissionMatrix` — ≥40 asercji na trasach P0,
   zielone; provider czyta wiersze z jednej tabeli w kodzie (łatwo dopisywać).
2. ★ Wolontariusz na trasie panelu (`/admin/...`) → 403 `forbidden`; ręczny URL
   we froncie → ekran 403.
3. Testy `matrix_5a`–`f` istnieją (dozwolone `skipped` z odwołaniem do pakietu).

## H03 · Rekrutacja — kolejka zgłoszeń — P1 · M

**Cel:** kontrolowane wejście do programu. (M3)
**Ekrany:** `#/admin/uczestniczki` → zakładka „Zgłoszenia". **Tabele:** `applications`
(z kolumną `role`), `users`, `editions` (limit miejsc), `sensitive_access_log`.
**Endpointy:** `GET/POST /admin/applications` · `POST .../{id}/accept` ·
`POST .../{id}/reject` · `POST .../import` (CSV multipart).
**Zakres:** lista ze statusami; szczegóły z danymi dyplomu (**wgląd w skan →
`sensitive_access_log`**); akceptacja → konto + zaproszenie do ustawienia hasła
(starter) + `access_expires_at` = akceptacja + 6 mies. + audyt; odrzucenie z powodem
+ e-mail `application.rejected`; import CSV z raportem `imported/skipped`; ostrzeżenie
przy akceptacji ponad limit miejsc edycji (wymaga jawnego potwierdzenia `force`).
**Kryteria:**
1. ★ Przebieg zgłoszenie → akceptacja → e-mail z linkiem (w Mailpit) → ustawienie
   hasła → pierwsze logowanie działa end-to-end.
2. ★ Odrzucenie bez powodu → 422; z powodem: audyt `application.rejected` + rekord e-maila.
3. Duplikat e-maila istniejącego konta → 409 `email_already_registered`
   z `reason.existing_user_id`.
4. Nie istnieje żadna trasa API samodzielnej rejestracji (test; strona informacyjna
   `#/rejestracja` w makiecie to nie rejestracja).

## H04 · Dostęp czasowy — P1 · S

**Cel:** materiały na 6 miesięcy; bezterminowo po ukończeniu. (M2 pkt 5)
**Tabele:** `users.access_expires_at / program_completed_at`.
**Endpointy:** `POST /admin/users/{id}/extend-access {months|until}` · middleware
`access.active` (szkielet w starterze).
**Zakres:** middleware blokuje **treści programu** — nie: logowanie, profil, eksport
RODO, onboarding (`#/panel/start`); 403 `access_expired` z czytelnym ekranem; data
wygaśnięcia widoczna w profilu; przedłużenie + audyt `access.extended`; zadanie
cykliczne; `program_completed_at` (ustawiane przez H13) zdejmuje limit.
**Kryteria:**
1. ★ Konto z datą wsteczną: kursy → 403 `access_expired`; logowanie, profil,
   eksport i onboarding działają (testy wszystkich wyjątków).
2. ★ Przedłużenie ustawia datę i audyt (kto, komu, do kiedy).
3. `program_completed_at` ≠ null → dostęp bezterminowy (test).

## H05 · Katalog kursów i sekwencyjne odblokowanie — P0 · M

**Cel:** lista etapów i twarda reguła odblokowań. (M4)
**Ekrany:** `#/panel/kursy`, `#/panel/kursy/:slug` (właściciel strony; sloty dla
H06/H09/H17 — starter). **Tabele:** `courses`, `lessons`, `materials`,
`lesson_progress`, `tests`, `test_attempts` (odczyt przez `CourseAccess`).
**Endpointy:** `GET /courses` · `GET /courses/{slug}`.
**Zakres:** lista z paskiem postępu i statusami; widok kursu z lekcjami i materiałami
(podpisane linki); egzekwowanie `CourseAccess::state` ze startera (403 `course_locked`
z `reason`); ekran blokady „co musisz najpierw ukończyć"; filtr grup produktowych
(`psychon`/`dobrostan`); zdarzenie `course.unlocked` przy pierwszym odblokowaniu
(→ dzwonek H16); kursy „zaproszone" (spoza sekwencji) dostępne bez odblokowań —
ścieżka Studenta.
**Kryteria:**
1. ★ `GET /courses/{slug}` zablokowanego → 403 `course_locked` z `reason.missing`
   — także ręcznym URL-em.
2. ★ Dla `marta@demo.pl` statusy dokładnie jak w `04-seed-demo.md` (kurs 1
   completed/100, kurs 2 in_progress/40, kursy 3–10 locked).
3. Zaliczenie testu kursu 2 (helper `demo:pass-test` ze startera) → kurs 3 przechodzi
   na `in_progress`, powstaje powiadomienie `course.unlocked`.
4. `filip@demo.pl` (student) widzi kurs „zaproszony" bez sekwencji (test).

## H06 · Lekcja — odtwarzacz i postęp — P0 · M

**Cel:** oglądanie z zapisem postępu przeżywającym wylogowanie. (M4)
**Ekrany:** widok lekcji (slot w stronie kursu). **Tabele:** `lesson_progress`,
`lessons`, `editions` (próg).
**Endpointy:** `GET /lessons/{id}` · `POST /lessons/{id}/progress` ·
`POST /lessons/{id}/complete`.
**Zakres:** mock-odtwarzacz ze startera; heartbeat ≤30 s z `position_seconds`,
`watched_delta`, `active_delta` (nazwy z kontraktu; aktywność = Page Visibility);
wznowienie od pozycji; „ukończ" po progu `Settings::edition('lesson_completion_percent')`;
serwer przycina `active_delta` do 35 s (idempotencja dwóch kart).
**Kryteria:**
1. ★ Wylogowanie i powrót → wznowienie od pozycji (±30 s).
2. ★ Karta w tle nie zwiększa `active_seconds`; dwie karty naraz nie liczą podwójnie
   (test: dwa heartbeaty w tej samej sekundzie → przyrost ≤35 s).
3. ★ `complete` poniżej progu → 422 `not_enough_active_time`; wartości nigdy nie maleją.
4. Zmiana progu w ustawieniach edycji zmienia `completable_at_percent` bez deployu.

## H07 · Pomiar czasu nauki i rzetelność — P1 · M

**Cel:** sygnał „kto przeklikał" dla administracji i prowadzącego. (M7)
**Ekrany:** `#/admin/czas-nauki` (administracja) · sekcja w `#/prowadzacy/grupa`
(prowadzący — swoja grupa). **Tabele:** `lesson_progress`, `lessons`,
`supervisor_assignments`.
**Endpointy:** `GET /admin/reliability` (+ `/{userId}`) — administracja ·
`GET /instructor/reliability` — prowadzący, tylko swoja grupa.
**Zakres:** rzetelność = suma `active_seconds` / suma `duration_seconds` ukończonych
lekcji (liczy `ProgressAggregator`); lista rosnąco, próg `reliability_threshold`
z wyróżnieniem; rozwinięcie per osoba (lekcje poniżej progu, otwarcia, ostatnia
aktywność).
**Kryteria:**
1. ★ `filip@demo.pl` (seed „przeklikany", ≈15%) pierwszy na liście z flagą
   `below_threshold`; `marta@demo.pl` (≈85%) bez flagi.
2. ★ `GET /admin/reliability` dla prowadzącego → 403; `GET /instructor/reliability`
   zwraca wyłącznie grupę zalogowanego (test izolacji).
3. Zmiana progu w ustawieniach zmienia flagi bez deployu.

## H08 · CMS treści — P1 · L (dzielony na dwa zespoły)

**Cel:** zespół Fundacji sam zarządza kursami. (M4)
**Podział:** **H08a** kursy + lekcje + kolejność · **H08b** materiały (upload)
+ zaproszenia. Wspólny ekran `#/admin/kursy` — H08a jest właścicielem strony,
H08b dostarcza komponenty do slotów.
**Tabele:** `courses`, `lessons`, `materials`. **Endpointy:** CRUD `/admin/courses`,
`/admin/courses/{id}/lessons`, `PATCH .../reorder` · H08b: `POST
/admin/lessons/{id}/materials` (multipart) · `POST /admin/courses/{id}/invite`.
**Zakres:** tworzenie kursu/webinaru (typ, grupa produktowa, pozycja w ścieżce);
lekcje: CRUD + soft delete + kolejność; upload materiałów (typ/rozmiar walidowane);
„nagrania" jako mock-plik; zaproszenia e-mail (`course.invited` → H16); audyt
`course.created/updated/deleted`.
**Kryteria:**
1. ★ (H08a) Nowy kurs + 2 lekcje z panelu → widoczny u uczestnika we właściwym
   miejscu ścieżki, bez zmian w kodzie.
2. ★ (H08a) Usunięcie lekcji z postępami = soft delete; postęp historyczny zostaje.
3. (H08a) Zmiana kolejności: modal z listą osób, których statusy się zmienią +
   potwierdzenie; żaden `lesson_progress`/`test_attempts` nie jest kasowany (test).
4. ★ (H08b) Upload złego typu/rozmiaru → 422; poprawny plik pobieralny podpisanym
   linkiem u uczestnika.
5. (H08b) Zaproszenie tworzy powiadomienie + e-mail w skrzynce `simulated`.

## H09 · Prowadzący — wizytówki i przypisania — P1 · M

**Cel:** przy każdym etapie wiadomo, kto go prowadzi. (M5)
**Ekrany:** `#/prowadzacy` (lista), `#/prowadzacy/kursy/:slug`, `#/panel/prowadzacy`,
slot wizytówki w widoku kursu; przypisania: slot w `#/admin/kursy` (komponent
`<AssignmentPanel>`). **Tabele:** `instructor_profiles`, `course_assignments`.
**Endpointy:** `GET /instructors` (+ `/{id}`) · `POST/DELETE
/admin/courses/{id}/assignments` (w DELETE: `assignment_id` w ciele).
**Zakres:** wizytówki (specjalizacje, opis, miasto, odpowiedzialność, prowadzone etapy,
własny superwizor); przypisanie kurs/lekcja z dziedziczeniem; zmiana prowadzącego —
**nowe pytania idą do nowej osoby, stare zostają u odpowiadającego** (M5 pkt 2, wspólna
reguła z H17); powiadomienia `assignment.created/removed` + audyt.
**Kryteria:**
1. ★ Reguła dziedziczenia: lekcja z własnym przypisaniem → jej prowadzący; bez →
   prowadzący kursu (testy obu ścieżek).
2. ★ Przypisanie/odpięcie → powiadomienie + audyt.
3. Po zmianie prowadzącego nowe pytanie trafia do nowej osoby, stare pozostaje
   u starej (test wspólny z H17).

## H10 · Testy wiedzy + warsztat — P0 · L

**Cel:** przejście dalej wymaga opanowania materiału. (M6)
**Ekrany:** `#/panel/kursy/:slug/test`. **Tabele:** `tests`, `test_questions`,
`test_answers`, `test_attempts` (ze snapshotem), `workshop_completions`, `editions`.
**Endpointy:** `GET /courses/{slug}/test` · `POST /tests/{id}/attempts` ·
`GET /tests/{id}/attempts` · `POST /admin/workshop/{userId}/complete` ·
`POST /admin/tests/{testId}/users/{userId}/reset-attempts {reason}` ·
CRUD banku: `GET/POST /admin/tests/{id}/questions`, `PATCH/DELETE
/admin/questions/{id}` (kształt wg konwencji kontraktu §1).
**Zakres:** bank pytań — seed + **edycja pytań i odpowiedzi w panelu** (CRUD;
edycja nie zmienia historii dzięki snapshotom) [dopisane 10.08 — G4 z mapy pokrycia];
10 pytań po jednym na ekranie, bez cofania; ocenianie wyłącznie serwerowe;
progi z `Settings::edition` (kolumny `tests.*` = nadpisania per kurs, null = edycja);
numer podejścia w transakcji; snapshot treści pytań; ekran wyniku z błędnymi
pytaniami; historia; po 3. niezaliczeniu blokada + `attempt.failed_final` → opiekun;
**reset limitu przez opiekuna z powodem** (decyzja po recenzji) + audyt
`attempts.reset`; warsztat: odznaczenie + audyt `workshop.completed`.
**Kryteria:**
1. ★ 79% nie zalicza, 80% zalicza; zaliczenie odblokowuje kolejny etap
   (przez `CourseAccess` — test integracyjny z H05).
2. ★ Czwarte podejście → 403 `attempts_exhausted` (API); test współbieżny
   `--filter=ConcurrentAttempt` — numery 1..N bez dziur (odbiór przez test, wpis
   w `DEMO/H10.md`).
3. ★ Edycja pytania po podejściu nie zmienia historii (snapshot — test).
4. Reset limitu przez opiekuna umożliwia nowe podejście; audyt `attempts.reset` +
   `attempt.finished` przy każdym ukończonym podejściu.
5. Warsztat odznaczony → warunek certyfikatu `workshop.met = true`.
6. Edycja pytania w panelu działa; podejścia historyczne niezmienione (snapshot — test).

## H11 · Staż — dziennik i akceptacje — P1 (P0.5) · M

**Cel:** 72 h dyżurów; liczą się tylko zaakceptowane. (M8)
**Ekrany:** `#/panel/staz`, `#/admin/staz`. **Tabele:** `internship_entries`.
**Endpointy:** `GET/POST /internship/entries` · `PATCH /internship/entries/{id}` ·
`GET /admin/internship/pending` · `POST /admin/internship/{id}/accept|return`.
**Zakres:** wpis (data ≤ dziś, godziny 0,5–24 co 0,5, forma ze słownika EN, liczba
konsultacji ≥0, opis **escapowany przy wyświetlaniu** + stała nota o zakazie danych
osób konsultowanych); licznik 72 h wyłącznie z `accepted`; kolejka opiekuna;
odesłany wpis edytowalny i składany ponownie.
**Kryteria:**
1. ★ Licznik rośnie tylko po akceptacji (test na 0,5 h).
2. ★ Data przyszła / 25 h → 422; `PATCH` wpisu `accepted` → 403 `entry_locked`;
   cudzy wpis po id → 404.
3. ★ Wpis `returned` → edycja → status `submitted`, wraca do kolejki, komentarz
   opiekuna zachowany (test).
4. Odesłanie wymaga komentarza; powiadomienia `internship.accepted/returned` + audyt.

## H12 · Superwizja — terminy, zapisy, obecności — P1 (P0.5) · L

**Cel:** zapisy na spotkania swojej grupy; obecności do certyfikatu. (M9)
**Ekrany:** `#/panel/superwizja`, `#/prowadzacy/grupa`. **Tabele:**
`supervisor_assignments`, `supervision_slots`, `supervision_signups`, `editions`.
**Endpointy:** `GET /supervision/slots` · `POST/DELETE /supervision/slots/{id}/signup` ·
`GET /instructor/group` · `POST /instructor/slots` ·
`PATCH /instructor/slots/{id}/attendance` · `PUT /admin/users/{id}/supervisor`.
**Zakres:** terminy z limitem (zapis transakcyjny); zapis tylko u własnego superwizora;
wypis do startu; „moja grupa" z postępami (`ProgressAggregator`); obecności;
przypisywanie superwizora przez administrację (+audyt `supervisor.assigned`) —
domyka lukę z recenzji.
**Kryteria:**
1. ★ Pełny termin → **409 `slot_full`** (kontrakt!); test równoległości: 10 zapisów
   na 3 miejsca = 3×201 + 7×409, w bazie 3 rekordy.
2. ★ Zapis na termin cudzej grupy → 403 `not_your_supervisor`.
3. ★ Obecność ustawia tylko prowadzący slotu/administracja; zasila licznik warunku.
4. Zmiana superwizora: historia przypisań zachowana, obecności u poprzedniego
   nadal się liczą (test).

## H13 · Certyfikaty + weryfikacja publiczna — P1, minimum ★ w P0 · L

**Cel:** certyfikat po komplecie warunków; publiczna weryfikacja. (M10)
**Ekrany:** `#/panel/certyfikat`, `#/weryfikacja` + `#/certyfikat` (publiczne).
**Tabele:** `certificates`, `editions`, `workshop_completions` (odczyt przez agregator).
**Endpointy:** `GET /certificate/conditions` · `POST /certificate/generate` ·
`GET /certificate/download` · publiczne `GET /verify/{number}`, `GET /verify/qr/{token}`.
**Zakres:** lista warunków z `ProgressAggregator`; generowanie zablokowane do
kompletu; numeracja ciągła per edycja w transakcji; PDF A4 + QR przez `PdfService`
(job); snapshot warunków; **wydanie ustawia `users.program_completed_at`** + audyt
`certificate.issued`; strona publiczna (wyszukiwarka + QR).
**Kryteria:**
1. ★ **(minimum P0)** `GET /certificate/conditions` + ekran `#/panel/certyfikat`
   pokazują cztery warunki ze stanem zgodnym z `04-seed-demo.md` (marta: 3/10
   etapów… ola: komplet).
2. Niespełnione warunki → `generate` 422 `conditions_not_met` ze wskazaniem braków.
3. Test współbiężnej numeracji (`--filter=ConcurrentCertificate`): ciąg bez dziur.
4. QR z PDF prowadzi do weryfikacji; nieistniejący/błędny numer → 404 z identycznym
   komunikatem (bez ujawniania formatu).
5. Wydanie ustawia `program_completed_at` (test z H04: dostęp przestaje wygasać).

## H14 · Dokumenty generowane z profilu — P2 · S

**Cel:** porozumienie wolontariackie bez przepisywania danych. (M11)
**Ekrany:** `#/panel/dokumenty`. **Tabele:** `documents` (z `edition_id`).
**Endpointy:** `GET /documents` · `POST /documents/generate {type}` ·
`GET /documents/{id}/download`.
**Zakres:** typy `volunteer_agreement`, `internship_certificate` (drugi dostępny po
72 h zaakceptowanych); przed generowaniem lista brakujących pól profilu; snapshot
danych; numeracja per typ+edycja; PDF przez `PdfService`; pobranie podpisanym
wygasającym linkiem; powiadomienie `document.ready`; audyt `document.generated`.
**Kryteria:**
1. ★ Niekompletny profil → 422 `profile_incomplete` z listą pól.
2. ★ Zmiana profilu po wygenerowaniu nie zmienia dokumentu (snapshot).
3. Cudzy dokument po id → 404; wygasły link → 403.

## H15 · Profil psychologa — P2 · M

**Cel:** wniosek absolwenta → weryfikacja → publikacja ręczna. (M12)
**Ekrany:** `#/panel/profil-psychologa`, `#/admin/profile`. **Tabele:**
`psychologist_profiles`, `profile_documents`, `sensitive_access_log`, `consents`.
**Endpointy:** `GET/PATCH /psychologist-profile` · `POST .../submit` ·
`POST .../documents` (multipart) · `GET /admin/profiles` (+`/{id}`) ·
`POST /admin/profiles/{id}/accept|return` · `GET /admin/profiles/{id}/documents/{docId}`.
**Zakres:** formularz po `program_completed_at` (403 `profile_not_eligible` wcześniej);
**zgoda na publikację jako odwołalny rekord w `consents`**; załączniki — dostęp tylko
administracja, każdy wgląd w `sensitive_access_log`; po submit edycja zablokowana;
decyzje z powodem + audyt + powiadomienia `profile.accepted/returned`; wycofanie
zgody → status `withdrawn` + powiadomienie zespołu.
**Kryteria:**
1. ★ Konto w trakcie programu → 403 na submit; `ola@demo.pl` (seed absolwentki) może złożyć.
2. ★ Wgląd administracji w załącznik → wpis w rejestrze wglądów (test).
3. Odesłanie z powodem odblokowuje edycję; audyt `profile.returned`.
4. Wycofanie zgody (`DELETE` zgody w `consents`) → status `withdrawn` + powiadomienie.

## H16 · Powiadomienia — dzwonek + e-maile symulowane — P0 · M

**Cel:** wspólna szyna zdarzeń. (M13)
**Ekrany:** dzwonek w nagłówku (wszystkie panele) · skrzynka wysłanych:
**`#/admin/emails`** (nie `#/admin` — to pulpit H19). **Tabele:** `notifications`, `emails`.
**Endpointy:** `GET /notifications` · `POST /notifications/{id}/read` · `.../read-all` ·
`GET /admin/emails`.
**Zakres:** obsługa **wszystkich typów z rejestru kontraktu §3.1** (szyna nie zna
nadawców — typy emitują pakiety-właściciele; typ bez emitenta po prostu nie
występuje); dzwonek z licznikiem, lista, oznaczanie, link do miejsca zdarzenia;
skrzynka e-maili `simulated` z podglądem; szablon e-maila w design systemie.
**Kryteria:**
1. ★ `Notify::send` dowolnego typu z §3.1 → powiadomienie z działającym linkiem +
   rekord e-maila `simulated` (test parametryzowany po typach).
2. ★ `course.unlocked` z H05 widoczny w dzwonku w happy-path demo (bez oblewania testów).
3. Cudze powiadomienie po id → 404; „oznacz wszystkie" działa; licznik w `meta.extra.unread`.
4. Skrzynka e-maili tylko dla administracji; pokazuje odbiorcę, temat, treść, czas.

## H17 · Pytania do prowadzącego — P2 · S

**Cel:** pytanie z lekcji trafia do właściwej osoby. (M13)
**Ekrany:** przycisk przy lekcji (slot H05) · skrzynka pytań w panelu prowadzącego
(`#/panel/prowadzacy`, zakładka „Pytania"). **Tabele:** `instructor_questions`.
**Endpointy:** `POST /lessons/{id}/questions` · `GET /instructor/questions` ·
`POST /instructor/questions/{id}/answer`.
**Zakres:** routing wg reguły dziedziczenia H09 (fallback: prowadzący kursu); filtr
nieodpowiedzianych; odpowiedź wraca przy lekcji + `question.answered`; nowe pytania
po zmianie prowadzącego → nowa osoba (wspólna reguła z H09); treści escapowane.
**Kryteria:**
1. ★ Pytanie trafia wg dziedziczenia (testy: lekcja z własnym prowadzącym / bez).
2. ★ Prowadzący widzi tylko swoje pytania; cudze po id → 404.
3. Odpowiedź widoczna przy lekcji u pytającego + powiadomienie `question.answered`
   (typ obsługuje H16).

## H18 · Panel — osoby i karta osoby — P0 · L

**Cel:** „na czym stoi każda osoba" w jednym miejscu. (M14)
**Ekrany:** `#/admin/uczestniczki` + karta osoby. **Tabele:** odczyt wielu
(`ProgressAggregator`); zapis: `users`.
**Endpointy:** `GET /admin/users` (filtry/szukanie/paginacja) · `GET /admin/users/{id}`
· `POST /admin/users` · `PATCH /admin/users/{id}` · `POST /admin/users/{id}/block
{reason}` · `GET /admin/users/export.csv`.
**Zakres:** lista; konta (tworzenie z zaproszeniem, edycja — w tym e-mail, z audytem);
blokowanie z powodem (komunikat inny niż „dostęp wygasł" — M2); karta osoby wg
kształtu z kontraktu (profil, postępy z agregatora, dokumenty, ostatnie powiadomienia,
wpisy audytu dot. osoby); CSV wspólnym helperem.
**Kryteria:**
1. ★ Filtr `role` + szukajka na seedach; CSV z BOM i `;` otwiera się w Excelu.
2. ★ Opiekun nie nada roli `super_admin` (403 — matryca); zmiany kont w audycie
   `user.updated`.
3. ★ Karta `marta@demo.pl` = dokładnie liczby z `04-seed-demo.md` (te same, co pulpit
   i raport — wspólny `ProgressAggregator`).
4. Zablokowany użytkownik przy logowaniu dostaje komunikat o blokadzie (nie o
   wygaśnięciu) — test rozróżnienia z H04.

## H19 · Panel — pulpit i ustawienia edycji — P0 · S

**Cel:** liczby edycji na wejściu; reguły programu bez programisty. (M14)
**Ekrany:** `#/admin` (pulpit) · `#/admin/ustawienia`. **Tabele:** `editions` + agregaty.
**Endpointy:** `GET /admin/dashboard` · `GET/PATCH /admin/edition`.
**Zakres:** pulpit — liczniki + kolejki spraw z linkami (kształt z kontraktu);
ustawienia: nazwa, terminy, limit miejsc + **wszystkie klucze z kontraktu §3.3**
(w tym `lesson_completion_percent`); walidacja zakresów; audyt `edition.updated`.
**Kryteria:**
1. ★ Liczniki pulpitu = wartości z `04-seed-demo.md`; kliknięcie prowadzi do kolejki.
2. ★ Zmiana `test_pass_threshold` realnie zmienia próg zaliczenia w H10 (test
   integracyjny przez `Settings::edition`).
3. Wartość spoza zakresu (próg 150%) → 422; audyt zmian.

## H20 · Raporty i widoki dziennika działań — P2 · M

**Cel:** liczby do grantu z platformy. (M15)
**Ekrany:** `#/admin/raport`, `#/admin/dziennik`. **Tabele:** `audit_log` (odczyt),
agregaty.
**Endpointy:** `GET /admin/report` · `GET /admin/report/export.csv` ·
`GET /admin/audit` (filtry) · `GET /admin/audit/export.csv`.
**Zakres:** raport edycji (osoby przyjęte/aktywne/ukończone, suma i średnia godzin,
konsultacje, certyfikaty) + zestawienie imienne + print CSS; dziennik z filtrami po
akcjach z rejestru §3.2; **zero tras modyfikacji audytu**.
**Kryteria:**
1. ★ Liczby raportu = karta osoby = pulpit (wspólny `ProgressAggregator`; wartości
   z `04-seed-demo.md`).
2. ★ `PATCH/DELETE /admin/audit/*` → 404 (tras nie ma — test).
3. Oba eksporty CSV wspólnym helperem (BOM + `;`); filtr `action` działa na slugach §3.2.

## H21 · Onboarding „Zacznij tutaj" — P0 · S

**Cel:** pierwszy ekran ścieżki — nowa osoba wie, co ją czeka. (M16)
**Ekrany:** `#/panel/start`. **Tabele:** `settings`.
**Endpointy:** `GET /onboarding` · `PATCH /admin/onboarding`.
**Zakres:** sekcje (film-placeholder, przebieg programu, oczekiwania) edytowalne przez
administrację; stała pozycja w menu wszystkich ról uczestniczących; dostępny też po
wygaśnięciu dostępu (wyjątek zapisany w H04 — spójnie).
**Kryteria:**
1. ★ Administracja zmienia treść bez kodu; widoczne natychmiast.
2. ★ Ekran działa po ukończeniu programu i po wygaśnięciu dostępu (test wspólny z H04).
