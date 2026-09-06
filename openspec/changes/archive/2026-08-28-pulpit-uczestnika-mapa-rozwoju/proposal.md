## Why

Uczestnik po zalogowaniu trafia na ekran „Start" (H21), który jest onboardingiem, a nie
miejscem pracy z programem. Nie ma jednego widoku, który pokazuje, gdzie uczestnik jest w
ścieżce, co robić dalej i jak wygląda postęp na czterech filarach. Dane już istnieją w
scalonych endpointach (H01, H05, H11, H12, H13) — brakuje ekranu, który je zbiera.

## What Changes

- Nowa trasa uczestnika `/panel/pulpit` — pulpit „Pulpit" z czterema sekcjami:
  - **Powitanie** — nagłówek z imieniem uczestnika i spokojnym zdaniem wprowadzającym
    (`GET /me`).
  - **Mapa rozwoju** — pionowa oś etapów kursów (ukończony / bieżący / zablokowany) z
    odznaką statusu i paskiem postępu (`GET /courses`); ostatni węzeł to odliczanie do
    najbliższej superwizji (`GET /supervision/slots`).
  - **Kolejny krok** — fioletowa karta akcentowa z następną nieukończoną lekcją bieżącego
    etapu i przyciskiem „Kontynuuj naukę" (`GET /courses`, `GET /courses/{slug}`).
  - **Skróty postępu** — siatka czterech kafli: ukończone etapy i procent bieżącego etapu
    (`GET /courses`), godziny stażu i obecności na superwizjach
    (`GET /certificate/conditions`).
- Nowy wpis menu panelu uczestnika „Pulpit" tuż po „Start" (plik wpisu + jedna linia w
  rejestrze `frontend/lib/menu/participant/index.ts`).
- Brak zmian w API, autoryzacji serwerowej i migracjach. Ekran korzysta wyłącznie z
  endpointów scalonych do `origin/main`.
- Świadome pominięcia, aby uniknąć martwych linków do niezaimplementowanych pakietów:
  brak „aktywnego czasu nauki" / pokrycia materiału (H07), brak treści CMS „Co było w
  module" (H08), brak wizytówek prowadzących (H09), brak pytań do prowadzącego (H17).

## Capabilities

### New Capabilities

- `participant-dashboard`: pulpit uczestnika `/panel/pulpit` — agregacja postępu ścieżki,
  następnego kroku i skrótów czterech filarów wyłącznie z danych już dostępnych; reguły
  pustych stanów, degradacja dla ról bez dostępu do warunków certyfikatu, brak linków do
  funkcji niezaimplementowanych.

### Modified Capabilities

<!-- Brak. Żaden istniejący wymóg (spec) nie zmienia zachowania — pulpit tylko czyta
     istniejące endpointy H01/H05/H11/H12/H13. -->

## Impact

- **Frontend (tylko dodatki):**
  - Nowa trasa `frontend/app/(uczestnik)/panel/pulpit/page.tsx` + komponenty pomocnicze.
  - Nowy plik wpisu menu `frontend/lib/menu/participant/pulpit.ts` (order między „Start"=10
    a „Kursy") oraz jedna linia importu i jedna w liście w `index.ts`.
  - Możliwe wydzielenie typów/klienta do `frontend/lib/pulpit/` (kształty zgodne z
    kontraktem §2, bez nowych wywołań).
- **Backend:** brak. Zero nowych tras, zero zmian w `routes/api/*`, zero migracji.
- **Zależne endpointy (muszą pozostać scalone):** `GET /me` (H01), `GET /courses` i
  `GET /courses/{slug}` (H05), `GET /supervision/slots` (H12), `GET /certificate/conditions`
  (H13, tylko rola `volunteer`). Godziny stażu (H11) i obecności (H12) czytane przez
  warunki certyfikatu.
- **Ryzyko:** `GET /certificate/conditions` jest ograniczone middleware `role:volunteer` —
  dla `student` i innych ról pulpit degraduje siatkę kafli do danych z `GET /courses`.
