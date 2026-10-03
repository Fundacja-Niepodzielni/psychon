# Raport gałęzi `chmura/ekrany-publiczne-nowy-wyglad`

Nowy wygląd ekranów publicznych i ekranów konta, które dotąd stały na starych
komponentach (`frontend/components/ui`, `frontend/components/templates`). Zmienił się
wyłącznie wygląd: zachowanie, zdania niosące znaczenie, wywołania API i logowania,
przekierowania i parametry adresu są takie same jak na starych stronach. Stare strony
nie zostały zmienione. Nowe ekrany są dostępne pod adresami podglądu
`/nowy-front/publiczne/…`.

Gałąź powstała z czubka `sprint-2` (`e2db503`).

## Szablon strony publicznej

Dodany jeden szablon: `frontend/design-system/szablony/StronaPubliczna/` (z testem, 19 prób).
Znak Fundacji u góry, jedna wyśrodkowana kolumna treści (`main#tresc`, cel linku skoku)
w dwóch szerokościach (`waska` — ekrany wejścia, `czytelna` — dokumenty), stopka z
nawigacją z odnośnikami. Zbudowany wyłącznie z istniejącego atomu `Link`, wspólnego
korzenia szablonów (`KorzenSzablonu`) i tokenów.

Powód: istniejący wariant „publiczny” szablonu `FormTemplate` ma kolumnę 420 px (za
wąsko na deklarację i dokumenty prawne) i nie ma stopki z odnośnikami. Żaden istniejący
atom, molekuła, organizm ani szablon nie został zmieniony.

Wspólne klocki ekranów publicznych (rama ze stopką, komunikat z nagłówkiem `h2`, stan
wczytywania, karta, przebieg wylogowania z Kont Niepodzielni) są w
`frontend/nowy-front/wspolne/strona-publiczna/` (15 prób, w tym kontrola źródeł).

## Ekrany

| ekran | folder | adres podglądu | próby |
|---|---|---|---|
| logowanie | `nowy-front/logowanie/` | `/nowy-front/publiczne/logowanie` | 11 (+ 9 logiki wspólnej z pozostałymi ekranami logowania, + 1 kontrola źródeł) |
| przekierowanie `/logowanie/konta` | `nowy-front/logowanie/` | `/nowy-front/publiczne/logowanie/konta` | 2 |
| konto niepowiązane | `nowy-front/logowanie/` | `/nowy-front/publiczne/logowanie/niepowiazane` | 10 |
| konto zablokowane | `nowy-front/logowanie/` | `/nowy-front/publiczne/logowanie/zablokowane` | 3 |
| aktywacja konta | `nowy-front/aktywacja/` | `/nowy-front/publiczne/aktywacja` | 14 |
| dostęp wygasł | `nowy-front/dostep-wygasl/` | `/nowy-front/publiczne/dostep-wygasl` | 4 |
| Twoje konto | `nowy-front/konto/` | `/nowy-front/publiczne/konto` | 10 |
| weryfikacja certyfikatu | `nowy-front/certyfikat-publiczny/` | `/nowy-front/publiczne/weryfikacja` | 7 (+ 2 logiki, + 1 kontrola źródeł) |
| certyfikat z adresu | `nowy-front/certyfikat-publiczny/` | `/nowy-front/publiczne/certyfikat` | 9 |
| deklaracja dostępności | `nowy-front/dokumenty-publiczne/` | `/nowy-front/publiczne/deklaracja-dostepnosci` | 5 (+ 1 kontrola źródeł) |
| dokumenty prawne | `nowy-front/dokumenty-publiczne/` | `/nowy-front/publiczne/dokumenty-prawne/[typ]` | 6 (+ 1 logiki) |
| Zacznij tutaj | `nowy-front/zacznij-tutaj/` | `/nowy-front/publiczne/panel/start` | 33 (w tym 23 reguły osadzenia filmu) |

Każdy folder ma `POMIAR-STAREGO-EKRANU.md` z tabelą „funkcja | stary ekran (plik:linia) |
nowy ekran”. Każdy ekran ma próby stanów (wczytywanie, błąd serwera, sukces, stan pusty
tam, gdzie istnieje), próby tych samych wywołań z tymi samymi argumentami (atrapy
pomocników z `frontend/lib/` i `next-auth/react`) oraz strażnika `fetch`, który po każdej
próbie sprawdza, że ekran nie zawołał innego hosta.

## Różnice wobec starych ekranów

### Wszystkie ekrany publiczne

- Stopka z odnośnikami (deklaracja dostępności i trzy dokumenty prawne) jest częścią
  szablonu, a nie układu głównego. Lista odnośników i ich kolejność są te same co w
  `components/layout/PublicFooter.tsx`; deklaracja nie linkuje do siebie.
- Znak Fundacji podaje strona podglądu (`components/ui/Logo`), tak jak robią to powłoki
  paneli w `app/(przelaczenie)`. Ekrany w `nowy-front/` niczego z `components/` nie
  importują; strony podglądu sięgają tam wyłącznie po znak (pilnuje tego próba źródeł).
- Komunikaty mają tytuł jako nagłówek `h2` (molekuła `Notice` niesie zawsze `h3`, co pod
  `h1` łamałoby kolejność nagłówków). Rola jak w starym `Alert`: błąd `role="alert"`,
  pozostałe `role="status"`.
- Przycisk w trakcie pracy ma `aria-busy`/`aria-disabled` i ignoruje drugie kliknięcie
  (atom `Button` w wariancie głównym nigdy nie jest wyłączony) — dawniej był wyłączony i
  miał obrotowy znak.
- Daty przechodzą przez wspólny formater nowego frontu (`nowy-front/wspolne/daty.ts`,
  strefa warszawska, np. „30 września 2026”) zamiast lokalnych formatów („30.09.2026”).

### Poszczególne ekrany

- Logowanie: przycisk „Zaloguj przez konto Niepodzielni” bez ikony — atom `Icon` ma
  zamkniętą listę glifów bez ikony logowania. Kod `?error=` będący nazwą właściwości
  obiektu (np. `constructor`) dostaje zdanie zastępcze zamiast wartości z prototypu.
- Weryfikacja: „Nie znaleziono certyfikatu o podanym numerze.” stoi przy polu (błąd
  powiązany z polem przez `aria-describedby`, ogłaszany od razu), a nie jako osobny
  komunikat pod kartą. Obszar wyników jest ogłaszany czytnikowi.
- Certyfikat z adresu: w czasie zawieszenia widać już nagłówek i opis.
- Twoje konto: identyfikator bez kroju o stałej szerokości (atom `Text` go nie ma).
- Dokumenty prawne: stan „nie znaleziono” ma znak Fundacji i stopkę.
- Zacznij tutaj: ekran stoi na `ListTemplate` z `PageHeader` (jak pozostałe ekrany panelu
  nowego frontu), bez stopki stron publicznych. **Edycja treści** — stara strona
  otwierała edytor w miejscu i po zapisie pokazywała „Zapisano treść ekranu.”; nowy ekran
  daje administracji odnośnik „Edytuj treść” do ekranu edycji `/admin/ekran-startowy`
  (w nowym froncie: `nowy-front/ekran-startowy`, z podglądem, zapisem i komunikatem).
  Powód: edytor ze starego `components/` jest zamrożony, a drugi edytor tej samej treści
  oznaczałby drugą implementację zapisu. Reguła filmu (tylko host `youtube.com` i jego
  poddomeny oraz `youtu.be` idą do odtwarzacza YouTube) jest przeniesiona jako czysta
  funkcja z próbą zgodności ze starą `toEmbedUrl` wartość w wartość.

## Kontrole

| polecenie | wynik |
|---|---|
| `npm run sprawdz-typy` | 0 błędów (`next typegen` i `tsc`) |
| `npx eslint --max-warnings=0` na 10 katalogach tej gałęzi (68 plików `.ts`/`.tsx`) | 0 błędów, 0 ostrzeżeń |
| `npx vitest run` na tych samych katalogach | 27 plików, 163 próby, wszystkie zielone |
| `npm run build` | zbudowane; 12 nowych tras podglądu na liście tras |
| pomiar w przeglądarce (Chromium, 13 widoków × 390 i 320 px) | przewijanie w bok 0 px wszędzie; jeden `h1` i jeden `main` na każdym widoku; żaden przycisk, pole ani odnośnik treści i stopki poniżej 44 px wysokości; widoczny obrys fokusu na pierwszym elemencie po linku skoku; zero żądań do innych hostów (wszystkie żądania poza `localhost` były blokowane i liczone — lista pusta) |
| kontrast z tokenów (próba szablonu) | tekst, nagłówek, odnośnik i tekst wyciszony na tle strony i karty — każda para ≥ 4,5∶1 |

Żadne polecenie nie wymagało wartości środowiskowych. W katalogu frontu jest wyłącznie
plik przykładowy środowiska; nie był otwierany.

**Czerwona próba poza moimi katalogami:** `frontend/lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts`
(2 z 12 prób) wymaga, żeby każda strona pod `app/nowy-front/` była zapisana w rejestrze
przełączenia `frontend/lib/przelaczenie/grupy.ts`. Dwanaście nowych podglądów tam nie
jest, a katalogu `lib/przelaczenie/` ta gałąź nie może zmieniać. Bez nowych podglądów ta
sama próba jest zielona (12 z 12) — sprawdzone przez chwilowe odsunięcie katalogu
`app/nowy-front/publiczne`. Próba nie została osłabiona ani pominięta.

## Pytania otwarte (z rekomendacją)

1. **Rejestr przełączenia.** Kto dopisze 12 podglądów do `lib/przelaczenie/grupy.ts`?
   *Rekomendacja:* jedna grupa wyłączona (np. `stronyPubliczne`, `wlaczona: false`) z
   ekranami: stara trasa = nowa trasa (adres się nie zmienia, strona zamienia treść),
   `trasaPoligonu` = adres podglądu. To przywraca zieleń próby bez włączania czegokolwiek.
   Pole `panel` dla ekranów publicznych nie ma dziś pasującej wartości — potrzebna decyzja,
   czy rejestr ma znać ekrany spoza paneli.
2. **Podwójna stopka w podglądzie.** Układ główny (`app/layout.tsx`) dokłada starą stopkę
   pod każdą stroną poza panelami, więc pod podglądami widać dwie stopki. *Rekomendacja:*
   przy przełączeniu dopisać nowe adresy do warunku ukrycia w `PublicFooter` (albo ukryć
   ją dla stron na szablonie `StronaPubliczna`); w podglądzie zostawić.
3. **Edycja „Zacznij tutaj” w miejscu.** *Rekomendacja:* zostać przy odnośniku do ekranu
   edycji — jedno miejsce zapisu treści; jeśli właściciel chce edycji w miejscu, osadzić
   istniejący ekran `nowy-front/ekran-startowy` zamiast budować drugi edytor.
4. **Znak Fundacji w design-systemie.** Atomu znaku nie ma; strony podglądu biorą
   `components/ui/Logo`. *Rekomendacja:* dodać atom znaku do design-systemu osobną zmianą
   i podmienić go w powłokach paneli i w tych podglądach naraz.
5. **Ikona logowania.** *Rekomendacja:* nie dodawać — napis przycisku jest pełną nazwą
   działania; glif można dołożyć razem z rozszerzeniem listy glifów atomu `Icon`.
6. **Format dat.** Nowe ekrany pokazują daty słownie („30 września 2026”). *Rekomendacja:*
   przyjąć wspólny formater nowego frontu bez wyjątków dla tych ekranów.

## Uwagi o pracy

- Pliki `WYTYCZNE-PRACY.md` (korzeń) i `frontend/CLAUDE.md` nie istnieją w tej gałęzi;
  przeczytane zostały `AGENTS.md`, `frontend/AGENTS.md`, `DESIGN.md` i
  `frontend/AUDYT-DOSTEPNOSCI.md`.
- Szablon powstał próbą najpierw (czerwień przy braku modułu, potem zieleń). Ekrany i
  ich próby powstawały w tym samym kroku i trafiały do wspólnego commitu; to, że próby
  potrafią się zaczerwienić, sprawdzone na logowaniu zmianą adresu powrotu w wywołaniu
  `signIn` (3 próby czerwone), a próba źródeł ekranów logowania była czerwona, dopóki nie
  powstały ich strony podglądu.
