# Pomiar starego ekranu „Twoje konto”

Stary ekran: `app/konto/page.tsx` (ścieżki względem `frontend/`). Nowy: `Konto.tsx`, `logika.ts`.

| funkcja | stary ekran (plik:linia) | nowy ekran |
|---|---|---|
| nagłówek „Twoje konto” | app/konto/page.tsx:94 | `Heading stopien={1}` |
| odczyt `fetchWhoAmI()` (`GET /sso/whoami`) przy wejściu | app/konto/page.tsx:34 | `fetchWhoAmI()` bez argumentów |
| wczytywanie „Wczytywanie…” | app/konto/page.tsx:97 | `Wczytywanie` |
| 401: komunikat z kodem, bez ponowienia | app/konto/page.tsx:41–43, 100 | `usterkaZBledu()` → `Komunikat wariant="error"` |
| 403: odmowa, bez ponowienia | app/konto/page.tsx:44–46, 104 | `Komunikat` z tytułem „Brak dostępu” |
| awaria (5xx, sieć) z ponowieniem | app/konto/page.tsx:47–56, 108 | `Komunikat` + „Spróbuj ponownie” |
| „Identyfikator (sub)” i wartość | app/konto/page.tsx:114–115 | `KeyValueRow` |
| „Role z tokenu” i plakietki ról | app/konto/page.tsx:118, 124 | lista `Badge` nazwana etykietą |
| „Brak ról — to również jest poprawny stan.” | app/konto/page.tsx:120 | `Text`, to samo zdanie |
| „Wyloguj” (drugorzędny, w każdym stanie) | app/konto/page.tsx:132–138 | `Button poziom="outline"` |
| wylogowanie: adres → `endSession()` → `window.location.assign(url)`; przy błędzie `endSession()` i `router.push("/logowanie/konta")` | app/konto/page.tsx:78–89 | `wylogujZKont()` + `ADRES_POWROTU_KONTA` |

## Różnice

- Identyfikator nie jest pisany krojem o stałej szerokości (atom `Text` go nie ma); długi
  identyfikator łamie się w kolumnie, bez przewijania w bok.
