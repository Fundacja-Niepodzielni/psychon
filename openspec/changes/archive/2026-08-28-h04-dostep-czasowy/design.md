## Context

Dokument opisuje retroaktywnie decyzje techniczne już wcielonego w `main` pakietu H04
(PR #20). Zob. `proposal.md` — Why. Źródło stanu faktycznego: `DEMO/H04.md` oraz kod w
`backend/app/Http/Controllers/Api/V1/Admin/AccessController.php`,
`backend/app/Http/Requests/H04/ExtendAccessRequest.php`,
`backend/app/Console/Commands/CheckExpiredAccess.php`,
`backend/app/Http/Middleware/EnsureAccessActive.php` (szkielet startera, nietknięty),
`frontend/lib/api.ts`. Reguły źródłowe: `docs/system/04-specyfikacja-modulow-mvp.md`
M2 pkt 5, `docs/system/02-model-danych.md` (`users.access_expires_at` /
`program_completed_at`).

## Goals / Non-Goals

**Goals:**
- Udokumentować dokładną regułę blokady (`access_expires_at` w przeszłości ORAZ
  `program_completed_at` puste) i dlaczego middleware nie ingeruje w trasy
  logowania/profilu/eksportu/onboardingu.
- Udokumentować semantykę przedłużenia: `months` sumuje się z jeszcze aktywną datą
  albo liczy od teraz, gdy dostęp już wygasł; `until` ustawia datę wprost, bez
  ograniczenia do przyszłości.
- Udokumentować, dlaczego zadanie cykliczne wyłącznie loguje, zamiast tworzyć audyt
  albo powiadomienie.

**Non-Goals:**
- Projektowanie nowego zachowania — to backfill, nie propozycja zmiany.
- Wpięcie UI w cudze pliki (profil H01, karta osoby H18) — `DEMO/H04.md` nazywa to
  świadomie poza zakresem pakietu, ta zmiana tego nie zmienia.

## Decisions

**Blokada na żywo w middleware, nie przez zadanie cykliczne.** `EnsureAccessActive`
liczy `access_expires_at->isPast()` przy każdym żądaniu, więc zadanie cykliczne
niczego nie musi „domykać" (np. dezaktywować konta). Alternatywa — flaga
`users.access_locked` ustawiana przez cron — została odrzucona: wymagałaby migracji
na zamrożonym schemacie i wprowadzałaby opóźnienie między wygaśnięciem a faktyczną
blokadą (do 24h przy zadaniu dziennym).

**Middleware dołączany przez każdy pakiet do własnych tras, nie globalnie.** H04
dostarcza `EnsureAccessActive` (szkielet startera) i shared test egzekwowania, ale nie
narzuca go globalnie w `bootstrap/app.php` — każdy pakiet treści programu (H06, H10,
H11, H13, H14) dopina `access.active` do swojej grupy tras. Alternatywa (middleware
globalne z listą wyjątków) została odrzucona, bo zmieniałaby pliki tras spoza
pakietu H04 i wymagała scentralizowanej listy wyjątków trudnej do utrzymania przy 21
pakietach.

**`months` sumuje się z aktywną datą, liczy od teraz przy wygasłej.** Administracja
przedłużająca dostęp jeszcze aktywnego konta oczekuje dodania miesięcy do istniejącej
daty (kilka przedłużeń z rzędu nie powinno się nawzajem gubić); przy koncie już
wygasłym liczenie od starej daty dawałoby wynik wciąż w przeszłości albo bliski
teraźniejszości w sposób nieintuicyjny dla administratora. `AccessController::extend()`
rozstrzyga to jednym warunkiem (`$previous->isFuture() ? $previous : now()`) zamiast
dwóch osobnych endpointów.

**`until` bez ograniczenia `after:now`.** Świadomie: administracja może chcieć
skorygować datę wstecz (np. pomyłkę przy poprzednim przedłużeniu), kontrakt tego nie
zabrania, a walidacja `after:now` uniemożliwiłaby korektę bez obejścia przez tinker.

**Zadanie cykliczne loguje, nie audytuje ani nie powiadamia.** Rejestr audytu §3.2 ma
wyłącznie `access.extended` (akcja administracji), nie ma sluga dla samego
wygaśnięcia; rejestr powiadomień §3.1 ma `access.expiring_30d/7d` jawnie oznaczone
jako pozycja post-hackathonowa w `01-pakiety-zadan.md`. Wymyślenie nowego sluga
audytu/powiadomienia dla `access:check-expired` złamałoby zasadę „rejestr jest
jedynym źródłem prawdy" (`AGENTS.md`) bez zgody strażnika kontraktu. `Log::info` daje
widoczność operacyjną bez tego ryzyka.

## Risks / Trade-offs

- **Middleware nie jest dołączony do tras H06/H10 (lekcje/testy) w zautomatyzowanym
  teście macierzy** → mitygacja: `DEMO/H04.md` odnotowuje to jawnie (brak fabryk
  `Course`/`Lesson`/`Test` w repo w chwili implementacji H04); bramkowanie jest
  widoczne wprost w kodzie tras tych pakietów (komentarz „criterion 2, shared test
  with H04"), pełne pokrycie należy do ich własnych testów.
- **Opóźnienie do 24h między północą a wykryciem przez zadanie cykliczne** nie
  dotyczy egzekwowania (blokada jest na żywo), tylko widoczności operacyjnej w logu →
  akceptowalne dla MVP hackathonowego, nazwane w `tasks.md` jako świadoma decyzja.
- **`matrix_5d` w teście macierzy uprawnień H02** mogła być odblokowana teraz, gdy
  H04 istnieje, ale to zmiana w cudzym pliku → mitygacja: nazwana w `tasks.md` jako
  follow-up dla właściciela H02, nie wykonana z tej gałęzi/zmiany.

## Open Questions

Brak — H04 nie niesie żadnego odstępstwa od kontraktu oczekującego na decyzję
strażnika (w przeciwieństwie do backfillu H05). Trzy pozycje w sekcji „Otwarte" w
`tasks.md` to follow-upy delegowane do innych pakietów (H01, H18, H02), nie pytania
wymagające rozstrzygnięcia w tej zmianie.
