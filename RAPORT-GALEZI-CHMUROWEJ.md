# Raport gałęzi: dziennik stażu w nowym wyglądzie

Gałąź: `chmura/dziennik-stazu-nowy-wyglad`, wyprowadzona z `sprint-2` (commit `1d03784`).
Ten plik zostanie usunięty przy przejęciu gałęzi.

## Co zostało zrobione

Dziennik stażu osoby wolontariackiej powstał od nowa z elementów nowego wyglądu. Stary ekran
(`frontend/app/(uczestnik)/panel/staz/page.tsx` ze starym komponentem
`frontend/components/h11/InternshipJournal.tsx`) został nietknięty.

Nowe pliki:

- `frontend/nowy-front/dziennik-stazu/dane.ts` — żądania, nazwy stanów i form, odmiana liczebników,
  podział błędów na stany ekranu.
- `frontend/nowy-front/dziennik-stazu/DziennikStazu.tsx` — ekran.
- `frontend/nowy-front/dziennik-stazu/FormularzWpisu.tsx` — formularz dodania i poprawki wpisu.
- `frontend/nowy-front/dziennik-stazu/PanelWpisu.tsx` — szczegóły wpisu, którego nie można już zmienić.
- `frontend/nowy-front/dziennik-stazu/DziennikStazu.module.css` — style z tokenów, bez kolorów wpisanych wprost.
- `frontend/nowy-front/dziennik-stazu/__tests__/` — trzy pliki testów (54 testy).
- `frontend/app/nowy-front/staz/page.tsx` — strona podglądu pod adresem `/nowy-front/staz`.

Bez grupy przełączenia, bez wpisu w menu i bez odnośników z innych ekranów.

### Pomiar starego ekranu

Stary komponent wysyła trzy żądania:

| Metoda | Ścieżka | Co wysyła | Co czyta |
|---|---|---|---|
| GET | `/internship/entries?page={n}&per_page=25` | — | listę wpisów (`id`, `date`, `hours`, `form`, `consultations_count`, `description`, `status`, `review_comment`) oraz `meta.current_page`, `meta.last_page`, `meta.extra.accepted_hours`, `meta.extra.required_hours` |
| POST | `/internship/entries` | `date`, `hours` (napis), `form`, `consultations_count` (liczba; puste pole daje 0), `description` (pusty napis jako `null`) | zapisany wpis |
| PATCH | `/internship/entries/{id}` | te same pięć pól | poprawiony wpis |

Stany starego ekranu: wczytywanie, błąd wczytywania z „Spróbuj ponownie”, pusty dziennik, lista,
formularz dodania, formularz poprawki (dla wpisu czekającego i odesłanego do poprawy), błędy pól,
zapisywanie, komunikat po zapisie, wpis zatwierdzony (zamknięty), wpis odrzucony (zamknięty, z
podpowiedzią, żeby dodać nowy), stronicowanie.

Nowy ekran wysyła dokładnie te same trzy żądania z tymi samymi polami. Pilnuje tego test, który
czyta oba pliki źródłowe, zasób wpisu po stronie serwera i reguły żądania zapisu.

### Ekran

- Ten sam szablon listy i nagłówek co ekran decyzji o dyżurach; jedyny zielony przycisk w nagłówku
  to „Dodaj wpis”.
- Karta „Zatwierdzone godziny”: pasek, „41,5 z 72 godz.”, zdanie, ile godzin brakuje, i liczba
  wpisów z poprawną odmianą („4 wpisy”, „5 wpisów”).
- Lista wpisów w kolumnach Dyżur, Stan, Godziny i akcja. Pod datą stoją forma i konsultacje
  („Czat · 1 konsultacja”), a pod nimi uwaga z decyzji, gdy jest.
- Formularz dodania otwiera się nad listą. Gdy jest otwarty, jego zapis jest jedynym zielonym
  przyciskiem, a wiersze listy nie mają akcji — zdanie nad listą mówi dlaczego.
- Wpis odesłany do poprawy ma akcję „Popraw wpis”. Otwiera ona pod wierszem uwagę „Co trzeba
  poprawić” i formularz z wartościami wpisu („Wyślij poprawiony wpis”). Wpis czekający na decyzję
  można edytować jak dotąd („Edytuj wpis”). Wpis zatwierdzony i odrzucony mają „Szczegóły” z
  danymi i zdaniem, dlaczego są zamknięte.
- Po zapisie wpis od razu pojawia się na liście, a potwierdzenie pokazuje wspólny pasek
  potwierdzenia. Fokus wraca na „Dodaj wpis” albo na akcję wiersza.
- Brak dostępu, wygasły dostęp i „nie znaleziono” korzystają ze wspólnego ekranu odmowy. Błąd
  serwera i brak połączenia mają osobne komunikaty z „Spróbuj ponownie”.
- Otwarty formularz z wpisanymi zmianami zgłasza się do wspólnego pytania o niezapisane zmiany.

### Naprawione usterki starego ekranu

- Daty są w czytelnym polskim zapisie ze wspólnego formatera („27 sierpnia 2026”), nigdzie w
  zapisie technicznym.
- Stany mają te same słowa co ekran decyzji o dyżurach: „Czeka na decyzję”, „Zatwierdzony”,
  „Odesłany do poprawy”, „Odrzucony” (stary ekran mówił „Oczekuje na akceptację”, „Zaakceptowany”,
  „Do poprawy”). Uwagi z decyzji mają te same nazwy co pola, w które się je wpisuje: „Co trzeba
  poprawić” i „Powód odrzucenia”. Spójność z tamtym ekranem pilnuje test.
- Wpis odesłany do poprawy pokazuje powód w wierszu i ma akcję „Popraw wpis”.
- Godziny są zapisane jako „godz.”, z przecinkiem dziesiętnym.
- Nazwy form dyżuru: serwer zwraca przy wpisie tylko kod formy, a słownik form z nazwami jest
  dostępny wyłącznie dla administracji. Dlatego zostaje lista ze starego ekranu („Dyżur
  telefoniczny”, „Czat”, „Inna forma”).

## Uruchomione polecenia i wyniki

Wszystko w katalogu `frontend/`. Pomiar „przed” na czystej kopii `sprint-2`, „po” na tej gałęzi.

| Polecenie | Przed | Po |
|---|---|---|
| `npm run sprawdz-typy` | 0 błędów | 0 błędów |
| `npm run lint` | 0 błędów, 10 ostrzeżeń | 0 błędów, 10 ostrzeżeń (żadne w nowych plikach) |
| `npm run test` | 481 plików, 6038 testów: 6035 zaliczonych, 2 niezaliczone, 1 pominięty | 484 pliki, 6094 testy: 6090 zaliczonych, 3 niezaliczone, 1 pominięty |
| `npm run build` | — | sukces, trasa `/nowy-front/staz` zbudowana jako statyczna |

Testy nowego katalogu: 54 z 54 zaliczonych.

Dwa niezaliczone testy „przed” (`lekcja-edycja-materialy-licznik`, `przelaczenie-trasa` na
`/panel/kursy/[slug]`) przechodzą uruchomione osobno (33 z 33) i w przebiegu „po”. Wyglądają na
niestabilne pod obciążeniem, niezwiązane z tą zmianą.

Trzy niezaliczone testy „po” wynikają z tej zmiany. Każdy pilnuje zamkniętej listy w miejscu,
którego ta gałąź nie mogła ruszać:

1. `lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts` — dwa testy: każda strona pod
   `/nowy-front/` musi należeć do grupy w `lib/przelaczenie/grupy.ts`. Nowa strona
   `/nowy-front/staz` jeszcze do żadnej nie należy, bo dodanie grupy zespół robi później.
   Naprawa: wpis grupy z `trasaPoligonu: "/nowy-front/staz"` (stara trasa `/panel/staz`),
   domyślnie wyłączonej.
2. `design-system/szablony/__tests__/niezapisane-zmiany-zrodla.test.ts` — „lista jest pełna”:
   ekran z formularzem zgłasza niezapisane zmiany, a lista plików zgłaszających jest zamknięta.
   Naprawa: dopisanie `"nowy-front/dziennik-stazu/DziennikStazu.tsx"` do `PLIKI_ZGLASZAJACE`.

Żaden test nie został osłabiony ani pominięty.

Sprawdzenie układu przy szerokości 390 px: ekran zbudowany produkcyjnie, odpowiedzi serwera
podstawione w przeglądarce. Ani lista, ani otwarta poprawka nie przewijają się w bok
(szerokość przewijania 390 z 390).

## Czego nie zrobiono i dlaczego

- W repozytorium nie ma plików `WYTYCZNE-PRACY.md` ani `frontend/CLAUDE.md`. Przeczytane zostały
  `AGENTS.md`, `frontend/AGENTS.md`, `frontend/AUDYT-DOSTEPNOSCI.md` i `DESIGN.md`.
- Ekranu nie oglądano z prawdziwym serwerem, bo wymaga to wartości środowiskowych, których ta
  gałąź nie zakłada ani nie czyta. Sprawdzono go testami i w przeglądarce z podstawionymi
  odpowiedziami.
- Zakresów pól (godziny od 0,5 do 24 co 0,5, data nie późniejsza niż dziś) nie sprawdza
  przeglądarka. Stary ekran blokował wysłanie atrybutami pól; wspólne pole formularza nowego
  wyglądu tych atrybutów nie przyjmuje, a formularz wyłącza sprawdzanie przeglądarki. Zakresy
  podaje podpowiedź pod polem, a rozstrzyga serwer tymi samymi komunikatami co dotąd. Skutek:
  błędna wartość dochodzi do serwera i wraca jako błąd pola.

## Różnice w zachowaniu wobec starego ekranu

- Potwierdzenie zapisu znika po 8 sekundach (wspólny pasek). Stary ekran trzymał komunikat do
  następnej zmiany.
- Gdy poprawka trafi na wpis rozstrzygnięty w międzyczasie albo usunięty, ekran zamyka formularz,
  pokazuje własne zdanie i wczytuje listę jeszcze raz tym samym żądaniem. Stary ekran tylko
  wypisywał komunikat serwera.
- Wygasły dostęp ma osobny ekran („Twój dostęp wygasł.”), a nie ogólny komunikat błędu.
- Po dodaniu wpisu licznik wpisów w karcie godzin rośnie od razu, bez ponownego wczytania.

## Pytania otwarte

1. Nazwy form: stara lista mówi „Inna forma”, ekran decyzji o dyżurach — „inna”. Obok istnieje
   słownik form stażu prowadzony przez administrację, ale wpis niesie tylko jeden z trzech stałych
   kodów i nie odwołuje się do słownika. Która lista ma obowiązywać po obu stronach?
2. Godziny: ten ekran pisze „godz.”, ekran decyzji o dyżurach — „h”, pulpit — „godzin”. Czy
   ujednolicić?
3. Wspólny ekran odmowy mówi „Jesteś zalogowany jako …” — forma męska, nie neutralna. Jest we
   wspólnym katalogu, więc nie została zmieniona.
4. Nieaktywny przycisk „Poprzednia”/„Następna” we wspólnym stronicowaniu tłumaczy tylko zdanie
   „Strona 1 z 2” stojące między przyciskami. Czy to wystarcza?
5. Pole daty pokazuje kontrolka przeglądarki, więc zapis daty w samym polu zależy od języka
   przeglądarki. Na liście i w szczegółach daty idą przez wspólny formater.

Jest uwaga dotycząca bezpieczeństwa — przekażę ją ustnie.
