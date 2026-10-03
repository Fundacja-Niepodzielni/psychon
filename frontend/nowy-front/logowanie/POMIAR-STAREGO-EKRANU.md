# Pomiar starych ekranów logowania

Każda funkcja i każda informacja ze starego ekranu ma swoje miejsce na nowym.
Ścieżki starych plików względem `frontend/`; nowe pliki względem tego katalogu.

## `/logowanie` — `app/logowanie/page.tsx` → `Logowanie.tsx`

| funkcja | stary ekran (plik:linia) | nowy ekran |
|---|---|---|
| nagłówek „Zaloguj się” (`h1`) | app/logowanie/page.tsx:36 | `Logowanie.tsx` — `Heading stopien={1}` z `TYTUL_LOGOWANIA` (`logika.ts`) |
| opis „Platforma szkoleniowa programu Niepodzielni…” | app/logowanie/page.tsx:37 | `Logowanie.tsx` — `Text` z `OPIS_LOGOWANIA` |
| znak Fundacji | components/templates/AuthTemplate.tsx (Logo) | `logo` z strony podglądu → szablon `StronaPubliczna` |
| stan oczekiwania „Przekierowuję do logowania…” (`role="status"`) | app/logowanie/page.tsx:40, 193 | `Wczytywanie` z `PRZEKIEROWUJE` |
| oczekiwanie także w czasie zawieszenia (`Suspense`) | app/logowanie/page.tsx:212 | `Logowanie` — ten sam `Suspense` z tym samym stanem |
| granica czasu 8000 ms i jej komunikat | app/logowanie/page.tsx:28, 58, 119 | `LIMIT_CZASU_LOGOWANIA_MS`, `KOMUNIKAT_LIMITU_CZASU` |
| `getSession()` i warunek sesji żywej | app/logowanie/page.tsx:125, 128 | `getSession()` + `czyZalogowana()` |
| sesja żywa: `api("/me")` → `router.replace(homeForRole(role))` | app/logowanie/page.tsx:132–135 | te same wywołania z tymi samymi argumentami |
| `/me` 401: cisza, zegar zostaje | app/logowanie/page.tsx:141–145 | ten sam warunek |
| `/me` inny błąd: komunikat o połączeniu | app/logowanie/page.tsx:143–144 | `KOMUNIKAT_BRAKU_POLACZENIA` |
| `?error=` → komunikat słownika albo zdanie zastępcze | app/logowanie/page.tsx:17–22, 150–152 | `komunikatBleduLogowania()` |
| brak sesji: `signIn("keycloak", { callbackUrl: "/logowanie" })` bez kliknięcia | app/logowanie/page.tsx:160 | `signIn(DOSTAWCA_LOGOWANIA, POWROT_PO_LOGOWANIU)` — te same wartości |
| wyjątek startu: `TypeError` → brak połączenia, inny → konfiguracja | app/logowanie/page.tsx:176–179 | `komunikatAwariiStartu()` |
| komunikat błędu (`role="alert"`) | app/logowanie/page.tsx:198 | `Komunikat wariant="error"` |
| przycisk „Zaloguj przez konto Niepodzielni” → `signIn` z tymi samymi argumentami | app/logowanie/page.tsx:201–204 | `Button poziom="primary"` |
| sprzątanie efektu (odmontowanie kasuje zegar) | app/logowanie/page.tsx:185–188 | to samo |

## `/logowanie/konta` — `app/logowanie/konta/page.tsx` → `PrzekierowanieKont.tsx`

| funkcja | stary ekran (plik:linia) | nowy ekran |
|---|---|---|
| przekierowanie na `/logowanie` z zachowanym `?error=` | app/logowanie/konta/page.tsx:20 | `adresPrzekierowaniaKont()` + `router.replace` |
| nagłówek „Przekierowuję…” | app/logowanie/konta/page.tsx:23 | `Heading stopien={1}` |
| `Suspense` z pustym zastępstwem | app/logowanie/konta/page.tsx:29–31 | to samo |

## `/logowanie/niepowiazane` — `app/logowanie/niepowiazane/page.tsx` → `Niepowiazane.tsx`

| funkcja | stary ekran (plik:linia) | nowy ekran |
|---|---|---|
| sprawdzenie `checkAccountBinding(signal)` z limitem `KONTO_BINDING_LIMIT_MS` | app/logowanie/niepowiazane/page.tsx:66–86 | `sprawdzZLimitem(checkAccountBinding, KONTO_BINDING_LIMIT_MS)` (`logika.ts`) |
| wynik → stan (null i awaria → awaria, blokada, identyfikator, brak powiązania) | app/logowanie/niepowiazane/page.tsx:97–105 | `stanZWyniku()` |
| konto zablokowane → `router.replace("/logowanie/zablokowane")` | app/logowanie/niepowiazane/page.tsx:122 | to samo |
| nagłówek zależny od stanu | app/logowanie/niepowiazane/page.tsx:163 | `naglowekNiepowiazania()` |
| obszar `aria-live="polite"` | app/logowanie/niepowiazane/page.tsx:173 | to samo |
| „Sprawdzam stan Twojego konta…” | app/logowanie/niepowiazane/page.tsx:176 | `Komunikat wariant="info"` |
| identyfikator w `code` i „Kopiuj” → `navigator.clipboard.writeText(sub)` | app/logowanie/niepowiazane/page.tsx:144, 182–189 | to samo (`Button poziom="outline"`) |
| awaria i „Spróbuj ponownie” (tylko na kliknięcie, w trakcie zajęty) | app/logowanie/niepowiazane/page.tsx:195–203 | to samo; w trakcie `aria-busy` |
| zdanie o braku powiązania | app/logowanie/niepowiazane/page.tsx:209 | to samo zdanie |
| „Wyloguj” (drugorzędny przy awarii, główny w pozostałych) | app/logowanie/niepowiazane/page.tsx:217–222 | `outline` przy awarii, `primary` w pozostałych |
| wylogowanie: adres `/api/auth/end-session-url` → `endSession()` → `window.location.assign(url)`; przy błędzie `endSession()` i `router.push("/logowanie")` | app/logowanie/niepowiazane/page.tsx:150–157 | `wylogujZKont()` (`wspolne/strona-publiczna/wylogowanie.ts`) |

## `/logowanie/zablokowane` — `app/logowanie/zablokowane/page.tsx` → `Zablokowane.tsx`

| funkcja | stary ekran (plik:linia) | nowy ekran |
|---|---|---|
| nagłówek „Konto jest zablokowane” | app/logowanie/zablokowane/page.tsx:45 | `Heading stopien={1}` |
| komunikat o blokadzie (`role="alert"`) | app/logowanie/zablokowane/page.tsx:50 | `Komunikat wariant="error"` |
| wejście nie czyta z serwera | app/logowanie/zablokowane/page.tsx (brak efektu) | brak efektu |
| „Wyloguj się” i ten sam przebieg wylogowania | app/logowanie/zablokowane/page.tsx:33–40, 59 | `wylogujZKont()` |

## Różnice

- Ikona przy przycisku „Zaloguj przez konto Niepodzielni” (app/logowanie/page.tsx:203) —
  nie ma jej w zamkniętej liście glifów atomu `Icon`; napis przycisku zostaje bez zmian.
- Przycisk w trakcie pracy: stary `Button loading` był wyłączony i miał obrotowy znak;
  nowy ma `aria-busy`/`aria-disabled`, a drugie kliknięcie niczego nie wysyła (atom
  `Button` w wariancie głównym nie bywa wyłączony).
- Kod błędu spoza słownika, który jest nazwą właściwości obiektu (np. `constructor`),
  dostaje zdanie zastępcze — stara strona zwracała wtedy wartość z prototypu obiektu.
