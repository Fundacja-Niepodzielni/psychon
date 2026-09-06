## Why

Pakiet H04 (Dostęp czasowy) jest już zaimplementowany i scalony do `main` (PR #20),
ale nigdy nie przeszedł przez proces OpenSpec — brakowało folderu zmiany, więc jego
zachowanie nie ma delty do zsynchronizowania z `openspec/specs/`. Ta zmiana jest
dokumentacją wsteczną: opisuje to, co faktycznie zbudowano wg `DEMO/H04.md` i kodu na
`main`, nie projektuje nowego zachowania. W przeciwieństwie do backfillu H05, H04 nie
niesie żadnych odstępstw od kontraktu — endpoint, slug audytu i kod błędu są już
zapisane w `docs/hackathon/01-pakiety-zadan.md` i `02-kontrakt-api.md` §1.1/§3.2.

## What Changes

- **`time-limited-access`** — nowa zdolność opisująca bramkę czasowego dostępu do
  treści programu: middleware `access.active` (`EnsureAccessActive`, szkielet
  startera — H04 go nie tworzy, tylko wykorzystuje i testuje), blokujące 403
  `access_expired`, gdy `access_expires_at` minął i `program_completed_at` jest
  `null`; przedłużenie dostępu (`POST /admin/users/{id}/extend-access {months|until}`)
  z audytem `access.extended`; zadanie cykliczne `access:check-expired` (widoczność
  operacyjna w logu, bez audytu/powiadomienia — rejestr §3.1/§3.2 nie ma sluga dla
  samego wygaśnięcia); przekierowanie frontendu na `/dostep-wygasl` przy 403
  `access_expired`.
- Zdolność jest wyłącznie egzekwowana na trasach **treści programu** — logowanie,
  profil, eksport RODO i onboarding pozostają dostępne mimo wygasłego dostępu (to
  H01/H21 gwarantują nieużywaniem middleware na swoich trasach, H04 to tylko
  weryfikuje wspólnym testem egzekwowania).
- Świadomie **poza zakresem** tej zmiany (i samego pakietu H04, per `DEMO/H04.md`):
  wyświetlenie daty wygaśnięcia w `/panel/profil` (jedna linijka w scalonym pliku
  H01, `DONE`) i przycisk „przedłuż dostęp" w karcie osoby (H18, wciąż
  `GOTOWE`/nieprzypisany) — endpoint już gotowy i przetestowany, wpięcie UI należy do
  właścicieli tych plików, nie do H04.

## Capabilities

### New Capabilities

- `time-limited-access`: middleware egzekwujący limit czasowy na treściach programu,
  przedłużenie dostępu przez administrację z audytem, zadanie cykliczne z logiem
  operacyjnym, przekierowanie frontendu na ekran wygaśnięcia.

### Modified Capabilities

Brak. `time-limited-access` nie istniała wcześniej w `openspec/specs/`.

## Impact

- Wyłącznie dokumentacja planistyczna — kod H04 jest już scalony do `main`
  (`AccessController`, `ExtendAccessRequest`, `CheckExpiredAccess`,
  `routes/api/h04.php`, `routes/console.php`, `frontend/lib/api.ts`). Ta zmiana nie
  modyfikuje żadnego z tych plików.
- Brak odstępstw od kontraktu do zatwierdzenia przez strażnika — endpoint, kod błędu
  `access_expired` i slug audytu `access.extended` są już zapisane w
  `01-pakiety-zadan.md` i `02-kontrakt-api.md`.
- Dwa follow-upy nazwane w `tasks.md` jako otwarte pozycje poza zakresem tego
  pakietu: wpięcie daty wygaśnięcia w profil (H01) i przycisku przedłużenia w karcie
  osoby (H18); trzeci — odblokowanie `matrix_5d` w teście macierzy uprawnień H02,
  teraz gdy H04 istnieje.
