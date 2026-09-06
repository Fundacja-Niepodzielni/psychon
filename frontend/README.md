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
  logowanie/            logowanie hasłem, redirect wg roli · logowanie/konta/ logowanie
                        przez konto Fundacji (link do Konta Niepodzielni)
  konto/                ekran po zalogowaniu przez konto Fundacji (whoami, wylogowanie)
  api/auth/[...nextauth]/  jedyna trasa Auth.js — obsługuje obie drogi logowania
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
  menu/                 rejestry menu — plik per pakiet
auth.ts                 konfiguracja Auth.js — dostawcy Keycloak i Credentials,
                        jedna sesja (JWT, ciasteczko HttpOnly) dla obu drzwi logowania
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

Token Bearer żyje w jednej sesji Auth.js (`next-auth`), wspólnej dla obu drzwi
logowania — hasła lokalnego (`/logowanie`, dostawca Credentials) i konta Fundacji
(`/logowanie/konta`, dostawca Keycloak). Sesja to zaszyfrowane, HttpOnly
ciasteczko; klient czyta z niej token przez `/api/auth/session`
(`lib/api.ts#getToken`). Nigdzie w `localStorage` — czytelnym dla każdego skryptu
wstrzykniętego w stronę. 401 kończy sesję i przekierowuje na `/logowanie`
automatycznie. `body` będące `FormData` wysyła się jako multipart (uploady).

Konto Fundacji odświeża token dostępu w tle (`auth.ts`, callback `jwt`) — gdy
wygasa, aplikacja wymienia go na nowy przez `refresh_token`, zanim ekran to
zauważy. Jeśli odświeżenie się nie uda (token odświeżający wygasł albo realm
jest nieosiągalny), sesja kończy się od razu — `lib/api.ts` woła wtedy
`signOut()`, zamiast pokazywać dalej zalogowany ekran z martwym tokenem.

**Dwie granice zmierzone przy odbiorze tego mechanizmu, spisane tu, bo nie są
oczywiste z samego kodu:**

- **Token dostępu żyje dalej po wylogowaniu — do końca swoich 600 s.**
  Wylogowanie kończy sesję przeglądarki natychmiast (ciasteczko znika, ekran
  wymaga ponownego logowania), ale sam token dostępu, jeśli ktoś zdążył go
  gdzieś zapisać przed wylogowaniem, nadal odpowiada w API aż do naturalnego
  wygaśnięcia. To świadomy kompromis identity providera (krótki czas życia
  tokenu zamiast natychmiastowej unieważnialności), nie błąd tej aplikacji.
- **Zalogowanie się przez jedne drzwi zastępuje sesję drugich.** Jest jedno
  miejsce na sesję (jedno ciasteczko Auth.js) — zalogowanie się lokalnym
  hasłem po zalogowaniu przez konto Fundacji (i odwrotnie) kończy tamtą
  sesję, nie otwiera drugiej obok niej. Zamierzone dla tego etapu; gdyby ktoś
  to odkrył jako „błąd", to jest to udokumentowane zachowanie, nie regresja.

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
