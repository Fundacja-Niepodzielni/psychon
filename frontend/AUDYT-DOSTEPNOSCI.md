# Audyt dostępności (WCAG 2.1 AA) — pierwszy pomiar

Data pomiaru: 2026-09-16. Zakres: wszystkie ekrany `app/**/page.tsx` (41 sztuk, w tym
2 czyste przekierowania serwerowe bez renderowanej treści). Metoda: pomiar statyczny
(czytanie kodu, tokenów designu i istniejących testów) — bez przeglądarki i bez czytnika
ekranu. To jest **pierwszy pomiar**, nie poprawki; poprawki idą w kolejnym etapie (sekcja
„Lista poprawek" niżej).

## Metodologia

- **Kontrast** liczony wzorem WCAG 2.1 (relatywna luminancja sRGB → współczynnik kontrastu),
  na wartościach hex z tokenów w `app/globals.css`. W repozytorium nie było dotąd testu,
  który liczyłby kontrast liczbowo — istniejący `app/__tests__/design-tokens-p2.test.ts`
  sprawdza tylko obecność wartości i reguł przez dopasowanie tekstu, nie liczy kontrastu.
  Użyto więc kanonicznego wzoru WCAG wprost, bez dodatkowych zależności.
- **Etykiety pól** sprawdzone dla całego frontu: każde wystąpienie natywnego
  `<input>/<textarea>/<select>` odczytane ręcznie (obecność `<label htmlFor>`, etykiety
  opasującej albo `aria-label`); każde użycie komponentów `Input`/`Select` liczone jako
  posiadające etykietę, bo `Field` (który obie komponują) renderuje `<label htmlFor={id}>`,
  a prop `label` jest wymagany w typach (weryfikacja: 0 błędów `tsc`).
- **Struktura nagłówków** czytana z kodu źródłowego stron i (gdy strona sama nie renderuje
  nagłówków) z komponentu, do którego deleguje. Znane ograniczenie: metoda pozycyjna
  (kolejność w pliku źródłowym) nie zawsze odpowiada kolejności renderowania, gdy funkcje
  pomocnicze są wywoływane w innej kolejności niż zdefiniowane — jeden taki przypadek
  znaleziony i ręcznie zweryfikowany (`/panel/pulpit` — kolejność w kodzie źródłowym
  sugerowała przeskok h1→h3, rzeczywista kolejność wywołań w JSX tego nie potwierdza).
- **Nawigacja klawiaturą** sprawdzona przez wyszukanie elementów `<div>`/`<span>`/`<li>`/
  `<tr>`/`<td>` z `onClick`, które nie są `button`/`a`/`input`.

## Wyniki zbiorcze

| Miernik | Wynik |
|---|---|
| Ekranów ogółem | 41 (39 z renderowaną treścią, 2 to przekierowania bez treści) |
| Kontrast — par tekst/tło z tokenów sprawdzonych | 75 |
| Kontrast — par poniżej 4,5∶1 (tekst normalny) | 27 |
| Kontrast — par poniżej 3∶1 (duży tekst / elementy UI) | 17 |
| Pól formularzy ogółem | 96 (16 natywnych + 80 przez komponenty `Input`/`Select`) |
| Pól bez dostępnej etykiety | 0 |
| Ekranów bez nagłówka `h1` | 4 |
| Elementów klikalnych bez wsparcia klawiatury | 1 |

## Tabela audytu — ekran po ekranie

| Ekran | Kontrast | Klawiatura | Etykiety | Nagłówki | Uwaga |
|---|---|---|---|---|---|
| /admin/czas-nauki | tokeny | OK | 0 braków | OK (h1) | — |
| /admin/dziennik | tokeny | OK | 0 braków | OK (h1) | brak jakiegokolwiek formularza na ekranie |
| /admin/emails | tokeny | **brak obsługi klawiatury** | 0 braków | OK (h1) | okno podglądu e-maila: `<div role="dialog" onClick>` bez `tabIndex` i bez obsługi Escape |
| /admin/kursy | tokeny | OK | 0 braków | OK (h1) | — |
| /admin/kursy/[id] | tokeny | OK | 0 braków | OK (h1→h2→h3) | — |
| /admin (pulpit administracji) | tokeny | OK | 0 braków | OK (h1) | — |
| /admin/profile (kolejka) | tokeny | OK | 0 braków | OK (h1) | — |
| /admin/profile/[id] | tokeny | OK | 0 braków | OK (h1) | — |
| /admin/raport | tokeny | OK | 0 braków | OK | dwa `h1` na jednym ekranie — do przejrzenia w rundzie 2 |
| /admin/sprawy | tokeny | OK | 0 braków | OK (h1) | — |
| /admin/staz | tokeny | OK | 0 braków | OK (h1) | — |
| /admin/superwizje | tokeny | OK | 0 braków | OK (h1) | — |
| /admin/testy/[id]/pytania | tokeny | OK | 0 braków | **brak h1** | tylko nagłówki `h2` (tytuły kart) |
| /admin/uczestniczki | tokeny | OK | 0 braków | OK (h1) | — |
| /admin/uczestniczki/[id] | tokeny | OK | 0 braków | OK | dwa `h1` na jednym ekranie |
| /admin/ustawienia | tokeny | OK | 0 braków | OK (h1) | — |
| /prowadzacy/grupa | tokeny | OK | 0 braków | OK | dwa `h1` na jednym ekranie |
| /prowadzacy | tokeny | OK | 0 braków | OK (h1) | — |
| /prowadzacy/pytania | tokeny | OK | 0 braków | OK (h1) | — |
| /panel/certyfikat | tokeny | OK | 0 braków | OK (h1) | — |
| /panel/dokumenty | tokeny | OK | 0 braków | OK (h1) | — |
| /panel/kursy | tokeny | OK | 0 braków | OK (h1) | — |
| /panel/kursy/[slug] | tokeny | OK | 0 braków | OK (h1) | — |
| /panel/kursy/[slug]/test | tokeny | OK | 0 braków | OK | dwa `h1` (pytanie testowe renderuje własny `h1` na pytanie) |
| /panel/lekcje/[id] | tokeny | OK | 0 braków | **brak h1** | tylko nagłówki `h2` (tytuły kart) |
| /panel (przekierowanie) | nie dotyczy | nie dotyczy | nie dotyczy | nie dotyczy | przekierowanie serwerowe do `/panel/start`, bez renderowanej treści |
| /panel/profil | tokeny | OK | 0 braków | OK (h1) | — |
| /panel/profil-psychologa | tokeny | OK | 0 braków | OK | dwa `h1` na jednym ekranie |
| /panel/pulpit | tokeny | OK | 0 braków | OK (h1→h2→h3) | kolejność zweryfikowana ręcznie w JSX (patrz metodologia) |
| /panel/start | tokeny | OK | 0 braków | OK | dwa `h1` (dwa niezależne formularze na jednym ekranie) |
| /panel/staz | tokeny | OK | 0 braków | OK (h1) | — |
| /panel/superwizja | tokeny | OK | 0 braków | OK (h1) | — |
| /aktywacja | tokeny | OK | 0 braków | **brak h1** | tylko nagłówki `h2` (tytuły kart) |
| /certyfikat | tokeny | OK | 0 braków | OK (h1) | — |
| /dostep-wygasl | tokeny | OK | 0 braków | OK (h1) | — |
| /konto | tokeny | OK | 0 braków | OK (h1) | — |
| /logowanie/konta | tokeny | OK | 0 braków | **brak nagłówka** | przekierowanie z krótkim komunikatem tekstowym, bez formularza |
| /logowanie/niepowiazane | tokeny | OK | 0 braków | OK (h1) | — |
| /logowanie | tokeny | OK | 0 braków | OK (h1) | ekran logowania: bez formularza (SSO), nie modyfikowany w tej rundzie |
| / (strona główna) | nie dotyczy | nie dotyczy | nie dotyczy | nie dotyczy | przekierowanie serwerowe do `/logowanie`, bez renderowanej treści |
| /weryfikacja | tokeny | OK | 0 braków | OK (h1) | — |
| /deklaracja-dostepnosci (nowy ekran tej rundy) | tokeny | OK | 0 braków | OK (h1) | — |

39 ekranów z treścią zmierzonych w pełni, 2 przekierowania bez treści zmierzone jako „nie
dotyczy" (nie renderują niczego, więc nie ma czego oceniać), 0 ekranów niezmierzonych.

## Deklaracja dostępności

Nowy ekran: `/deklaracja-dostepnosci`. Zawiera stan zgodności z liczbami z tego audytu,
datę sporządzenia i miejsce na zgłaszanie problemów. Dwa pola treści czekają na dane od
właściciela platformy (nie zostały wymyślone): adres/kontakt do zgłaszania problemów z
dostępnością i data najbliższego przeglądu deklaracji.

Link do deklaracji dodany w stopce wspólnej powłoki paneli (`PanelShell`) — widoczny na
ekranach panelu uczestnika, panelu administracji i panelu prowadzącego. Ekrany publiczne
poza tą powłoką (`/logowanie`, `/certyfikat`, `/weryfikacja`, `/konto`, `/aktywacja`,
`/dostep-wygasl`, strona główna) współdzielą tylko najcieńszy layout aplikacji i nie mają
dziś żadnej stopki — dodanie linku tam wymaga zmiany współdzielonego układu strony, co
zostawiam do decyzji przy planowaniu kolejnego etapu.

## Lista poprawek — kolejny etap

Kolejność: najpierw to, co blokuje korzystanie (nawigacja klawiaturą, brak etykiet),
potem kontrast, potem reszta.

| # | Czego dotyczy | Ekranów | Szacunek | Mierzalne testem |
|---|---|---|---|---|
| 1 | Obsługa klawiatury (Escape/`tabIndex`) dla okna podglądu e-maila w `/admin/emails` | 1 | 0,5 h | tak — test komponentu na `onKeyDown`/focus |
| 2 | Dodać `h1` na ekranach bez nagłówka głównego (`/admin/testy/[id]/pytania`, `/panel/lekcje/[id]`, `/aktywacja`, `/logowanie/konta`) | 4 | 1 h | tak — test struktury DOM na obecność `h1` |
| 3 | Przegląd duplikatów `h1` na jednym ekranie (6 ekranów) — ustalić, czy to zamierzone (np. wiele niezależnych sekcji) czy do zmiany na `h2` | 6 | 1,5 h | częściowo — test policzy wystąpienia, ocena „czy to błąd" wymaga decyzji projektowej |
| 4 | Kolory dekoracyjne (zieleń marki, żółty warning, niebieski info) używane w miejscach, gdzie mogłyby trafić na tekst — dodać test pilnujący, że w kodzie nie pojawią się jako `text-*` bez wariantu `-dark` | — (test zapobiegawczy) | 1 h | tak |
| 5 | Uzupełnić dwa puste pola w deklaracji dostępności (kontakt, data przeglądu) po stronie właściciela platformy | 1 | 0,25 h (redakcja, nie kod) | nie |
| 6 | Dodać stopkę z linkiem do deklaracji na ekranach publicznych poza powłoką paneli | 8 | 1 h | tak — test obecności linku w renderze |
| 7 | Test automatyczny osadzony w bramce CI, liczący kontrast par tekst/tło z tokenów (na wzór tego audytu), żeby przyszłe zmiany tokenów nie obniżały kontrastu bez wiedzy | — (test zapobiegawczy) | 1 h | tak |

Suma szacunków rundy 2: **6,25 h** (mieści się w pozostałej części widełek 14–20 h przy
0 h zmierzonych wcześniej i tej rundzie pomiarowej).
