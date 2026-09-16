# Frontend — starter hackathonowy (Niepodzielni)

Next.js (App Router, TypeScript, Tailwind 4). Teksty UI po polsku, kod po angielsku.

## Start

```bash
npm install
npm run dev        # http://localhost:3000
```

Adres backendu w `.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:8010`
(klient API sam dokleja `/api/v1`).

## Struktura

```
app/
  logowanie/            jedyny ekran logowania — SSO przez konto Niepodzielni,
                        bez formularza (patrz „Logowanie" niżej).
                        logowanie/konta/  stary adres, tylko przekierowanie
                        logowanie/niepowiazane/  konto Kont bez powiązania z PsychON
  aktywacja/            wiązanie `sub` konta Niepodzielni z zaproszeniem PsychON
                        (`POST /sso/powiaz`) — bez hasła
  konto/                ekran „Twoje konto" (whoami, wylogowanie)
  api/auth/[...nextauth]/  jedyna trasa Auth.js
  api/auth/end-session-url/  adres end_session_endpoint realmu (wylogowanie)
  dostep-wygasl/        ekran „dostęp wygasł"
  not-found.tsx         404 · error.tsx  błąd globalny (500)
  (uczestnik)/panel/    layout + strony panelu uczestnika
  (prowadzacy)/prowadzacy/   layout + strony panelu prowadzącego
  (administracja)/admin/     layout + strony administracji
components/
  ui/                   komponenty bazowe — UŻYWAJ ICH zamiast pisać własne
  layout/PanelShell.tsx wspólny szkielet paneli (sidebar, nagłówek, wylogowanie)
  VideoPlayer.tsx       atrapa odtwarzacza (heartbeat co 10 s)
  Forbidden.tsx         ekran 403 (message + reason.missing)
lib/
  api.ts                klient API (koperty, ApiError, token z sesji Auth.js)
  home-by-role.ts       słownik lądowania po roli — wspólny dla /logowanie i /aktywacja
  menu/                 rejestry menu — plik per pakiet
auth.ts                 konfiguracja Auth.js — wyłącznie dostawca Keycloak (konto
                        Niepodzielni), sesja JWT w ciasteczku HttpOnly
```

## Zasady (twarde)

- **Zero nowych zależności npm** bez zgody sztabu.
- **Komponenty tylko z `components/ui/`** — nie dubluj przycisków/inputów.
- Kolory, promienie i cienie **wyłącznie tokenami** (klasy niżej) — bez hexów w kodzie.
- Teksty interfejsu po polsku; treści użytkowników escapowane (JSX robi to domyślnie —
  nie używaj `dangerouslySetInnerHTML`).

## Jak dodać wpis menu (Twój pakiet HXX)

1. Utwórz plik w rejestrze swojego panelu, np. `lib/menu/participant/h05-kursy.ts`:

```ts
import type { MenuEntry } from "../types";
const entry: MenuEntry = { label: "Kursy", href: "/panel/kursy", order: 20 };
export default entry;
```

2. W `lib/menu/participant/index.ts` dodaj import i pozycję na liście (dwie linie,
   miejsca oznaczone komentarzem). Rejestry: `participant/` (panel uczestnika),
   `instructor/` (prowadzący), `admin/` (administracja).

## Jak użyć klienta API

```ts
import { api, apiPaged, ApiError } from "@/lib/api";

// pojedynczy zasób — zwraca `data` z koperty
const course = await api<Course>("/courses/wywiad-psychologiczny");

// mutacja
await api("/lessons/21/progress", {
  method: "POST",
  body: { position_seconds: 314, watched_delta: 28, active_delta: 25 },
});

// lista z paginacją — zwraca { data, meta }
const { data, meta } = await apiPaged<UserRow>("/admin/users?page=1");

// obsługa błędów (koperta {error:{status,code,message,errors,reason}})
try { … } catch (err) {
  if (err instanceof ApiError && err.status === 403) {
    // <Forbidden message={err.message} missing={err.reason?.missing} />
  }
}
```

## Logowanie (wyłącznie SSO)

PsychON nie ma własnego hasła — jedyne drzwi to konto Niepodzielni (Keycloak,
realm `niepodzielni`, publiczny klient `psychon-web`, dostawca Keycloak
Auth.js w `auth.ts`). `/logowanie` nie ma formularza:

1. brak sesji i brak `?error=` → sama zaczyna `signIn("keycloak", …)`, zero
   kliknięć;
2. `?error=` z callbacku Auth.js → komunikat po polsku i przycisk „Zaloguj
   przez konto Niepodzielni" — bez żadnego automatycznego przekierowania
   (inaczej błąd nigdy nie dałby się przeczytać, bo od razu zaczynałby się
   kolejny SSO);
3. sesja już żywa → `GET /me` i lądowanie wg roli (`lib/home-by-role.ts`,
   `HOME_BY_ROLE`).

Nowe konto (zaproszenie) wiąże się na `/aktywacja?token=…`: bez sesji —
przycisk logowania z tym samym tokenem w `callbackUrl`; z sesją — `POST
/sso/powiaz` z tokenem zaproszenia (backend wiąże `sub` z zaproszonym
użytkownikiem), potem lądowanie wg roli. Żadnego pola hasła — konto go nie ma.

Token Bearer żyje w sesji Auth.js (`next-auth`). Sesja to zaszyfrowane,
HttpOnly ciasteczko; klient czyta z niej token przez `/api/auth/session`
(`lib/api.ts#getToken`). Nigdzie w `localStorage` — czytelnym dla każdego
skryptu wstrzykniętego w stronę. `body` będące `FormData` wysyła się jako
multipart (uploady).

**401 z dowolnej trasy biznesowej ma dwie różne przyczyny, rozróżnione w
`lib/api.ts` (`handleUnauthorized`) przez dodatkowe wywołanie `GET
/sso/whoami` na tym samym tokenie:**

- sesja Kont ważna, ale `sub` NIE jest powiązany z żadnym kontem PsychON
  (`whoami` odpowiada 200, `/me` 401) → ekran `/logowanie/niepowiazane`,
  sesja NIE kończy się (dopiero przycisk na tym ekranie ją kończy);
- sesja naprawdę nieważna (`whoami` też 401) → `endSession()` i powrót na
  `/logowanie`, które samo zacznie nowe logowanie.

Bez tego rozróżnienia każde 401 kończyłoby sesję i wracało na `/logowanie`,
które dla wciąż żywej sesji Kont natychmiast logowałoby z powrotem bez
pytania o cokolwiek — i znów dostawałoby 401: pętla bez żadnego czytelnego
ekranu.

Konto Niepodzielni odświeża token dostępu w tle (`auth.ts`, callback `jwt`) —
gdy wygasa, aplikacja wymienia go na nowy przez `refresh_token`, zanim ekran
to zauważy. Jeśli odświeżenie się nie uda (token odświeżający wygasł albo
realm jest nieosiągalny), sesja kończy się od razu — `lib/api.ts` woła wtedy
`signOut()`, zamiast pokazywać dalej zalogowany ekran z martwym tokenem.

**Granice zmierzone przy odbiorze tego mechanizmu, spisane tu, bo nie są
oczywiste z samego kodu:**

- **Wylogowanie kończy sesję w koncie Fundacji, a API przestaje przyjmować
  token tej sesji — bo sprawdza znacznik wylogowania konta Fundacji
  (`sid`), a nie dlatego, że token właśnie wygasł.** Nawet jeśli ktoś zdążył
  gdzieś zapisać sobie token przed wylogowaniem, API przestaje go honorować,
  gdy tylko dotrze do niego informacja o wylogowaniu. Zmierzone na lokalnym
  uruchomieniu (efemeryczne konto Fundacji, dwa pomiary): około **6–7 sekund**
  między wywołaniem wylogowania a pierwszą odmową dla tego tokenu. To liczba
  z jednego, lokalnego przebiegu testowego — nie z produkcji; na produkcyjnej
  infrastrukturze może wyjść inaczej, prawdopodobnie krócej (sama operacja
  zapisania znacznika to pojedynczy zapis do bazy z odczytem kontrolnym, a
  zmierzony czas w większości pochłonęło samo środowisko testowe, wyraźnie
  wolniejsze niż docelowe). Gdy w chwili sprawdzania API nie potrafi odczytać
  tego znacznika (np. awaria jego magazynu), traktuje to jako powód do
  odmowy i każe zalogować się ponownie — nigdy nie wpuszcza tokenu tylko
  dlatego, że nie znalazło dla niego znacznika. Jest jeden wyjątek, w którym
  token żyje pełne 600 sekund mimo wylogowania: gdy wylogowanie w ogóle nie
  dotarło do konta Fundacji — bo karta przeglądarki została zamknięta albo
  padło połączenie sieciowe, zanim żądanie wylogowania wyszło. Wtedy żaden
  znacznik nigdy nie powstaje i token jest honorowany aż do naturalnego
  wygaśnięcia. To wyjątkowy przypadek, nie reguła.

## Tokeny designu (z makiety)

Źródło: `app/globals.css` (`--psy-*` + mapowanie na klasy Tailwind).

- **Kolory:** `bg-primary` (przyciski), `bg-brand` (zieleń dekoracyjna), `text-accent`
  (fiolet), tła `bg-page / bg-card / bg-card-warm / bg-grey`, ramki `border-line`,
  tekst `text-ink / text-body / text-muted / text-subtle`, statusy
  `success / warning(-dark) / danger / info(-dark)` + warianty `*-bg`.
- **Typografia:** `text-h1 … text-h4`, `text-body`, `text-small`, `text-caption`.
- **Promienie:** `rounded-xs … rounded-3xl`, `rounded-pill`.
- **Cienie:** `shadow-card`, `shadow-header`. **Fokus:** `focus-visible:focus-ring`.

Uwaga na kontrast: zieleń marki `#01be4a` NIE nadaje się na tekst ani na tło pod
białym tekstem (2,5:1) — do tego służy `primary` (`#00803a`). Analogicznie
`warning-dark` i `info-dark` dla tekstu.

## Sprawdzenie przed PR-em

```bash
npm run lint && npm run build
```
