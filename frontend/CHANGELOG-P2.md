# Partia P2 — warstwa identyfikacji + atomy

Zakres: decyzje właściciela P2 (identyfikacja wizualna ze strony Fundacji, atomy
`Field`/`Card`/`Badge`/`Skeleton`/`Logo`, pierścień fokusu, Roboto lokalnie).
Źródła wartości: `Niepodzielni-dev/DESIGN.md`, `D:/tmp/INWENTARZ-IDENTYFIKACJA-STRONY.md`.
Bierzemy **wartości** ze strony, nigdy znaczniki/układy Blade; zieleń strony (`#01BE4A`
jako tożsamość klienta) **nie** wchodzi do PsychON.

## Wartość strony → token `--psy-*`

| Wartość strony | Token PsychON | Gdzie użyty |
|---|---|---|
| Pierścień fokusu `3px outline #1500BB` (offset 2, `utilities.css:191`) | `--psy-focus-ring: 0 0 0 3px var(--psy-violet-dark)` | `@utility focus-ring`, wszystkie atomy interaktywne (`Button`, `Input`, `Select`, linki, pozycje menu) |
| Granat `#1500BB` (logo, nagłówki strony) | `--psy-violet-dark` (już istniał w `globals.css` — P2 tylko go **wykorzystuje**, nie dodaje nowej zmiennej) | pierścień fokusu; `Logo` wariant `default` przez klasę `text-accent-dark` |
| Krój Roboto v51, self-hosted, `latin`+`latin-ext` (`typography.css:2-36`) | `--psy-font: "Roboto", …` (istniał, nigdy nie ładowany — F-89) | `@font-face` w `app/globals.css`, pliki w `public/fonts/roboto-v51-latin(-ext).woff2` |
| Znak marki (SVG, jeden kolor `#1500BB`, `logo-niepodzielni-ze-strony-2026-09-11.svg`) | brak nowego tokenu — kolor przez `text-accent-dark` / `text-light` | atom `components/ui/Logo.tsx`, `currentColor` zamiast drugiego pliku dla wariantu na ciemne tło |

Uwaga: kolory tła/tekstu/promienie/cienie ze strony (zieleń, szarości, `#c0392b`, promienie
8/12/15/20/24/36/50) były **już zgodne** przed P2 (inwentarz, sekcja „Takie same") — P2 nie
dotyka tych tokenów. Nagłówki zostają czarne (`--psy-text-strong #1a1a1a`) — `#1500BB` tylko
jako akcent i fokus (decyzja właściciela P2 pkt 4), granat strony na nagłówkach **odrzucony**.

## Wielkie litery na przyciskach — decyzja

**Bez `text-transform: uppercase` na `Button`.** Wielkie litery pogarszają czytelność polskich
znaków diakrytycznych w tekście ciągłym przycisku (np. „ZAPISZ SIĘ NA ĆWICZENIE") i nie mają
dodatkowej wartości A11Y (waga `font-medium` + tło/obramowanie już odróżniają przycisk od
tekstu) — C1 Z-9 stawia czytelność wyżej niż imitację makiety strony, która kapitaliki stosuje
na nagłówkach `h1` (`psy-listing.css:80`), nie na przyciskach `.btn`.

## Atomy P2

- **`Field`** (`components/ui/Field.tsx`) — etykieta + kontrolka + błąd + podpowiedź pod
  jednym `id`. `Input` i `Select` teraz komponują `Field` zamiast duplikować znaczniki
  (usunięcie części z 19 ręcznych kopii wzorca liczonych w C2 §1.5) — przez to `Field` ma
  **29 użyć pośrednich** (18 miejsc z `Input`, 11 z `Select`, poza testami).
- **`Skeleton`** (`components/ui/Skeleton.tsx`) — szkielet treści, `aria-hidden`,
  `motion-reduce:animate-none` na każdym pasku (F-91). `LoadingState` (P1) teraz renderuje
  `Skeleton` zamiast własnych trzech `<div>` — użycie w `ListTemplate`, czyli na wszystkich
  ekranach listy podłączonych w P1.
- **`Logo`** (`components/ui/Logo.tsx`) — inline SVG źródła
  `_architektura/FRONT-PSYCHON/logo-niepodzielni-ze-strony-2026-09-11.svg`, warianty
  `default` (`text-accent-dark`, #1500BB) / `inverted` (`text-light`, `currentColor` na ciemne
  tło) — **ten sam plik**, bez drugiego znaku. Użycia: `components/layout/PanelShell.tsx`
  (sidebar wszystkich paneli — `panel/kursy`, `admin/emails`, `admin/kursy`, h11, h18, h20 idą
  przez ten szkielet) i `app/dostep-wygasl/page.tsx`.
- **`Card`, `Badge`** — istniały przed P2 (nie duplikowane). Rozszerzenie: dodane testy
  (`components/ui/__tests__/Card.test.tsx`, `Badge.test.tsx`); domknięcie F-93 w miejscu, gdzie
  Badge nie był użyty wprost — `components/pulpit/PulpitDashboard.tsx` (`NODE_TONE.in_progress`)
  powtarzał `bg-accent-15 text-accent` (4,37:1) zamiast korzystać z tego samego poprawionego
  odcienia co `Badge` — zmienione na `text-accent-dark` (ta sama klasa co `Badge` wariant
  `accent`).

## Znaleziska ZNALEZISKA-OTWARTE.md

| Nr | Domknięte w P2? | Jak |
|---|---|---|
| F-89 | **tak** | Roboto ładowany lokalnie (`@font-face` w `globals.css`, pliki w `public/fonts/`), 0 żądań do `fonts.googleapis.com`/`fonts.gstatic.com` |
| F-90 | **tak, w całości** | `--psy-focus-ring` z `#01be4a73` (1,41–1,55:1) na `var(--psy-violet-dark)` #1500BB (≥ 9,98:1 wobec wszystkich zmierzonych teł, patrz komentarz w `globals.css`) **+ uwaga werdyktu domknięta**: `@utility focus-ring` ma teraz zamiennik `@media (forced-colors: active) { outline: 3px solid Highlight; }`, więc `outline: none` nie zostaje bez zastępstwa w trybie wysokiego kontrastu (C1 Z-9) |
| F-91 | **tak** | globalna reguła `@media (prefers-reduced-motion: reduce)` w `globals.css` + `motion-reduce:animate-none` na `Skeleton` |
| F-92 | **nie** — poza zakresem P2 (atomy identyfikacji, nie przebudowa układu tabel/wierszy `admin/page.tsx`, `Tabs.tsx`, `PanelShell.tsx`); wymaga zmiany wysokości istniejących wierszy poza atomami tej partii |
| F-93 | **tak** | `Badge` accent już naprawiony w P1; P2 domyka jedyne pominięte miejsce (`PulpitDashboard.tsx` `NODE_TONE.in_progress`) |
| F-94 | **nie** — wyciek uprawnień (`lib/pulpit/data.ts`) to logika ról, nie atom identyfikacji; poza zakresem P2 |
| F-95 | **nie** — angielski klucz serwera na ekranie to słownik/i18n (`admin/page.tsx`), nie atom; poza zakresem P2 |

## Uwagi z werdyktu P2 (`74048a5`) domknięte

- **F-90 w całości** — `@utility focus-ring` w `app/globals.css` miało samo
  `outline: none` bez zamiennika widocznego w trybie wymuszonych kolorów
  systemu (`box-shadow` jest tam maskowany). Dodano
  `@media (forced-colors: active) { outline: 3px solid Highlight; ... }`
  wewnątrz tej samej reguły — poza tym trybem nic się nie zmienia (nadal
  wyłącznie `box-shadow` w `--psy-focus-ring`).
- **Licencja Roboto** — `public/fonts/LICENSE-roboto.txt` miał sam URL Apache
  2.0. Dodano pełny tekst w `public/fonts/LICENSE-Apache-2.0.txt` i zapisano
  w `LICENSE-roboto.txt`, z czego wynika rozstrzygnięcie Apache (nie OFL):
  metadane pliku (`fc-query`/`fontTools`, tabela `name`) nie mają wprost pola
  licencji, ale copyright wskazuje repozytorium `googlefonts/roboto-classic`,
  które w oficjalnym repozytorium Google Fonts leży w katalogu `apache/`, nie
  `ofl/`.
- **Zakres wag** — plik ma oś `wght` 100-900, `@font-face` zostaje przy
  `300 700` (jedyny zakres wykorzystywany przez tokeny PsychON; `--psy-fw-thin`
  200 i `--psy-fw-black` 900 nie mają żadnego użycia w komponentach —
  `grep -rn "fw-thin\|fw-black"` poza `globals.css` = 0). Uzasadnienie
  zapisane w `LICENSE-roboto.txt`; poszerzenie deklaracji to osobna decyzja.
- **`Skeleton` — drugie i trzecie bezpośrednie użycie** poza `LoadingState` i
  testami: `components/h07/AdminReliability.tsx` (ładowanie listy
  rzetelności) i `components/h12/InstructorGroup.tsx` (ładowanie karty
  grupy) — oba miały własny placeholder `<p role="status">tekst…</p>`;
  tekst zostaje identyczny (teraz w `sr-only` + `aria-label`), znika tylko
  wizualny akapit na rzecz szkieletu treści.
- **Testy na mutacje nieuchwycone przez werdykt** —
  `components/ui/__tests__/Button.test.tsx` (nowy: klasa
  `focus-visible:focus-ring` na renderowanym `Button`/`Input`/`Select`, nie
  tylko tekst tokenu), `app/__tests__/design-tokens-p2.test.ts` (rozszerzony:
  token nagłówków zostaje `#1a1a1a`, `app/layout.tsx` bez Google Fonts,
  `@utility focus-ring` naprawdę stosuje `box-shadow: var(--psy-focus-ring)`
  i ma zamiennik `forced-colors`, 0 `outline: none` bez zamiennika poza tym
  blokiem), `components/ui/__tests__/Logo.test.tsx` (liczba ścieżek = 20, nie
  tylko „> 0”).

## Uwagi z werdyktu P1 domknięte przy okazji

- `LoadingState` bez `motion-reduce` → naprawione przez przejście na atom `Skeleton`
  (`motion-reduce:animate-none` na każdym pasku).
- Zdublowany komentarz w `ListTemplate.tsx` (ok. l. 67–70) → usunięty (została jedna kopia).
- Brak testu filtra ekranu h20 → dopisany (`components/h20/__tests__/AuditLogView.test.tsx`,
  test „filtr: wysłanie formularza…").
