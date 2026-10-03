# Pomiar starego ekranu aktywacji

Stary ekran: `app/aktywacja/page.tsx` (ścieżki względem `frontend/`). Nowy: `Aktywacja.tsx`, `logika.ts`.

| funkcja | stary ekran (plik:linia) | nowy ekran |
|---|---|---|
| nagłówek „Aktywacja konta” | app/aktywacja/page.tsx:159 | `Heading stopien={1}` |
| znak Fundacji | components/templates/PublicPageTemplate.tsx (Logo) | `logo` ze strony podglądu → `StronaPubliczna` |
| wczytywanie w zawieszeniu „Wczytywanie…” (`role="status"`) | app/aktywacja/page.tsx:160 | `Suspense` + `Wczytywanie` |
| token z `?token=` | app/aktywacja/page.tsx:37 | `useSearchParams().get("token") ?? ""` |
| `getSession()` i warunek sesji | app/aktywacja/page.tsx:46, 49 | `getSession()` + `czyZalogowana()` (`logowanie/logika.ts`) |
| brak sesji: zdanie i przycisk logowania | app/aktywacja/page.tsx:107, 117 | te same zdania |
| `signIn("keycloak", { callbackUrl: "/aktywacja?token=…" })` | app/aktywacja/page.tsx:111–114 | `adresPowrotuAktywacji(token)` — ta sama wartość |
| brak tokenu: komunikat lokalny, bez API | app/aktywacja/page.tsx:55–61 | `KOMUNIKAT_BRAKU_TOKENU` |
| wiązanie `POST /sso/powiaz` z `{ token }` | app/aktywacja/page.tsx:64–69 | `api("/sso/powiaz", { method: "POST", body: { token } })` |
| sukces: „Konto powiązane. Przekierowuję…” i `router.replace(homeForRole(role))` | app/aktywacja/page.tsx:71–72, 150 | to samo |
| oczekiwanie „Trwa łączenie konta…” | app/aktywacja/page.tsx:150 | `zdanieOczekiwania()` |
| 401: nic nie rysuje | app/aktywacja/page.tsx:77 | `stanPoBledzieWiazania()` → `null` |
| 403: odmowa z komunikatem serwera, bez ponowienia | app/aktywacja/page.tsx:80–83, 126 | `Komunikat` z tytułem „Brak dostępu” |
| 4xx: komunikat serwera bez ponowienia; sieć/5xx: z ponowieniem | app/aktywacja/page.tsx:87–92, 133–141 | `stanPoBledzieWiazania()`; „Spróbuj ponownie” zwiększa licznik jak dawniej |

## Różnice

- Odmowa: stary `ForbiddenState` miał napis „Brak dostępu” wersalikami; nowy ma go jako
  nagłówek `h2` komunikatu (ta sama treść, poprawna kolejność nagłówków).
- Komunikat oczekiwania ma `role="status"` (stary `Alert` informacyjny też go miał).
