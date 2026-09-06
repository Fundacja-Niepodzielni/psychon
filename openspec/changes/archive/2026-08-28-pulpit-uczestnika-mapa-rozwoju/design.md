## Context

Zobacz `proposal.md` — Why. Ograniczenia, które kształtują podejście:

- Kontrakt API (`docs/hackathon/02-kontrakt-api.md`) rozstrzyga kształt HTTP; strażnik
  kontraktu wymagany dla nowych tras. Ten pulpit nie wprowadza żadnej trasy.
- Rejestr menu i `layout.tsx` paneli są własnością sztabu; rozszerzanie menu odbywa się
  udokumentowanym mechanizmem „jeden plik wpisu + jedna linia w `index.ts`" (tak zrobiły
  H05, H11, H15).
- Token Bearer żyje w `localStorage`, więc każdy ekran panelu jest komponentem klienckim
  (`"use client"`), pobierającym dane w `useEffect` przez `api()` / `apiPaged()`.
- Stan pakietów wg `origin/main` (`openspec/changes/koordynacja-pakietow-h01-h21/tasks.md`):
  scalone i użyteczne — H01, H05, H06, H10, H11, H12, H13, H16, H21. Niescalone —
  H04 (REVIEW), H07 (W TOKU), H08 (GOTOWE), H09 (W TOKU), H17 (W TOKU).
- Dostępne prymitywy UI: `Card` (z wariantem `warm`), `Badge`, `ProgressBar` (ma już rolę
  `progressbar` + ARIA), `Button`, `Alert`. Tokeny w `globals.css` (`bg-accent-06`,
  `border-accent-15`, `text-accent`, `bg-brand`, `text-subtle` itd.).
- Wzorce do naśladowania: `frontend/app/(uczestnik)/panel/kursy/page.tsx` (ładowanie +
  retry + puste stany), `components/courses/CourseCard.tsx` (etap zablokowany = notka,
  nie link), `panel/certyfikat/page.tsx` (konsument `GET /certificate/conditions`).

## Goals / Non-Goals

**Goals:**

- Jeden ekran kliencki agregujący 3–5 wywołań istniejących endpointów w cztery sekcje
  spec (powitanie, Mapa rozwoju, Kolejny krok, skróty postępu).
- Odporność na częściową awarię: sekcje niezależne, awaria zapytania pomocniczego nie
  wywraca strony.
- Zero zmian po stronie backendu, zero martwych linków.

**Non-Goals:**

- Nowy endpoint agregujący postęp uczestnika (odpowiednik `GET /admin/dashboard`) — poza
  zakresem; pulpit składa dane po stronie klienta.
- Odwzorowanie 1:1 makiety „Psychon": pomijamy chipy domeny/fazy pacjenta, hover-summary,
  rozwijane „Co było w module", nawigację skokową między krokami — brak dla nich danych
  w kontrakcie albo zależą od H08.
- Zmiana trasy startowej `/panel` (nadal → `/panel/start`).
- Współdzielenie logiki z panelem prowadzącego / administracji.

## Decisions

### D1. Trasa i wpis menu

`frontend/app/(uczestnik)/panel/pulpit/page.tsx` jako komponent kliencki. Nowy plik wpisu
menu `frontend/lib/menu/participant/pulpit.ts` z `order` między „Start" (10) a „Kursy".
Sprawdzone: `h05-kursy.ts` używa `order: 20`. Aby nie kolidować, wpis pulpitu dostaje
`order: 15`, „Kursy" zostaje na 20. Do `index.ts` dochodzą dwie linie (import + pozycja na
liście) — zgodnie z instrukcją w nagłówku pliku.

- Alternatywa: podmiana `order` w `h05-kursy.ts` na 30 — odrzucona, to plik innego pakietu.
- Alternatywa: pulpit jako trasa startowa zamiast `start` — odrzucona, zadanie mówi „tuż
  po Zacznij tutaj", więc Start pozostaje pierwszy.

### D2. Model pobierania danych

W `useEffect`: równolegle `GET /me` i `GET /courses` (dane podstawowe). Po ich sukcesie:

- wybór etapu `in_progress` → jeśli jest, `GET /courses/{slug}` po jego lekcje (Kolejny
  krok);
- `GET /supervision/slots` (węzeł superwizji + kafel obecności fallback);
- `GET /certificate/conditions` tylko gdy `me.role === "volunteer"` (kafle stażu i
  obecności).

Każde zapytanie pomocnicze ma własny stan (`data | "loading" | "error"`), renderowane
niezależnie. Dane podstawowe mają wspólny stan z ekranem błędu + „Spróbuj ponownie"
(wzór z `kursy/page.tsx`).

- Alternatywa: `Promise.all` wszystkiego i jeden `catch` — odrzucona, łamie wymóg
  częściowej awarii ze spec.
- Alternatywa: pobierać wszystkie `GET /courses/{slug}` dla „Co było w module" — odrzucona,
  brak pola treści i N+1 zapytań.

### D3. Rozstrzyganie „następnego kroku"

Czysta funkcja `resolveNextStep(courses, inProgressDetail)` zwracająca wariant:
`{kind: "lesson", lessonId, title}` | `{kind: "test", slug}` | `{kind: "certificate"}` |
`{kind: "empty"}`. Kolejność dokładnie jak w spec (Requirement: Karta „Kolejny krok").
Trzymana obok komponentu, testowalna jednostkowo bez DOM.

### D4. Mapa rozwoju

Filtr `sequence_order !== null`, sort rosnąco. Reużycie `COURSE_STATUS_BADGE` i
`stageLabel` z `lib/courses.ts`, `ProgressBar` z `components/ui`. Ikona statusu: check /
play / lock (inline SVG jak w `CourseCard`). Węzeł `locked` renderuje `<p>` z notką, nie
`<Link>` — 1:1 jak `CourseCard`. Węzeł superwizji to dodatkowy element listy renderowany
po etapach.

### D5. Odliczanie do superwizji

Z `ParticipantSlot.starts_at` (ISO 8601 UTC). Wybór `min(starts_at)` gdzie
`starts_at > now`. Format względny po polsku („za 3 dni", „jutro", „za 5 godz.") liczony z
różnicy dni/godzin; pełna data z `Intl.DateTimeFormat("pl-PL")`. Brak nowej zależności.
Pusta lista → pusty stan (kontroler H12 już zwraca `data: []` przy braku przypisania
superwizora).

### D6. Degradacja kafli dla ról bez `volunteer`

`GET /certificate/conditions` ma middleware `role:volunteer`. Dla `student` i innych
pulpit nie wywołuje tego endpointu (warunek na `me.role`), a jeśli mimo to zwróci 403 —
`catch` ustawia stan kafli stażu/obecności na notkę informacyjną. Kafle „Ukończone etapy"
i „Bieżący etap" działają z samego `GET /courses` niezależnie od roli.

### D7. Język i ton

Wszystkie teksty po polsku, spokojne, nienaciskające (AGENTS.md + makieta „Tone of
voice"). Jedyny wielkalny tekst to eyebrow (13px, letter-spacing). Statusy zawsze ikona +
tekst, nie sam kolor.

## Risks / Trade-offs

- **[Rozjazd stanu pakietów — H12/H13 mogłyby zostać wyłączone flagą przed demo]** →
  pulpit degraduje każdą sekcję zależną od zapytania pomocniczego do rzeczowej notki;
  brak twardej zależności poza H01+H05.
- **[`GET /courses/{slug}` to dodatkowe zapytanie po wyborze etapu — opóźnia kartę
  „Kolejny krok"]** → karta ma własny stan ładowania; reszta pulpitu nie czeka.
- **[Format czasu względnego bez biblioteki może się rozjechać na granicy dni/stref]** →
  liczymy w UTC z `Date`, pokazujemy też pełną datę lokalną, więc przybliżenie „za N dni"
  nie jest jedyną informacją.
- **[Edycja `frontend/lib/menu/participant/index.ts` dotyka pliku własności sztabu]** →
  zmiana to wyłącznie dwie linie wg instrukcji w nagłówku pliku; ten sam wzór użyty przez
  H05/H11/H15. Do odnotowania w opisie PR.
- **[Pulpit powiela fragment ekranu warunków certyfikatu]** → pokazuje skróconą migawkę +
  link „Zobacz warunki certyfikatu"; pełny przepływ generowania zostaje na `/panel/certyfikat`.

## Migration Plan

Zmiana wyłącznie dodająca po stronie frontendu. Wdrożenie = scalenie PR. Wycofanie =
rewert commita (usunięcie trasy `pulpit/`, pliku wpisu menu i dwóch linii w `index.ts`).
Brak migracji bazy, brak zmian kontraktu, brak flag.
