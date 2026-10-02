# Raport gałęzi `chmura/grupa-prowadzacego-nowy-wyglad`

Data: 2026-10-02. Gałąź odchodzi od końca `sprint-2`. Plik zniknie przy przejęciu gałęzi.

## Co zrobiono

Ekrany „Moja grupa” i „Wątek grupowy” w panelu pracy z grupą odtworzono z klocków nowego wyglądu. Stare strony
(`/prowadzacy/grupa`, `/prowadzacy/watek-grupowy`) i ich komponenty zostały nietknięte.

1. **Pomiar starych ekranów** — `frontend/nowy-front/grupa-prowadzacego/POMIAR-STAREGO-EKRANU.md` (oba ekrany w
   jednym pliku): każde żądanie (metoda, ścieżka, wysyłane i czytane pola), każdy stan, każde pole z regułą i
   komunikatem oraz lista rzeczy, których stary ekran nie ma.
2. **Ekran „Moja grupa”** (`frontend/nowy-front/grupa-prowadzacego/`) na szablonie listy z tym samym nagłówkiem
   strony co inne ekrany tego panelu.
   - Osoby grupy z licznikiem („3 osoby w grupie”), polem „Szukaj osoby” i listą, która na wąskim ekranie
     składa się w blok linii (bez przewijania w bok). Słowa o postępie są te same co na pulpicie tego panelu:
     kursy „2 z 5”, staż „12,5 godz.”, superwizje liczbą, warsztat „Ukończony” / „Nieukończony”.
   - Terminy superwizji z obecnościami (wybór przy osobie, zapis przy terminie), sekcja „Rzetelność nauki”
     z własnym wczytywaniem i własnym błędem.
   - Przycisk główny w nagłówku „Utwórz termin”, obok niego „Zgłoś sprawę”. Każdy otwiera w miejscu listy panel
     z formularzem; fokus idzie na nagłówek panelu, nigdy na przycisk. W otwartym panelu jedynym zielonym
     przyciskiem jest jego przycisk wysyłki, niedostępny z powodem, dopóki brakuje daty albo tematu i opisu.
3. **Ekran „Wątek grupowy”** (`frontend/nowy-front/watek-grupowy/`) na szablonie listy: lista wątków, po otwarciu
   wiadomości w kolejności czasu z autorem i datą po polsku, pole „Wiadomość do grupy” z licznikiem znaków
   (limit 5000 z serwera), wysyłanie (zapisywanie, wysłano, błąd serwera) i skład wątku. Bez wątku jedynym
   zielonym przyciskiem jest „Załóż wątek grupowy” w nagłówku, w otwartym wątku — „Wyślij wiadomość” (niedostępny
   z powodem, dopóki pole jest puste). Po otwarciu wątku fokus idzie na nagłówek „Wiadomości”.
4. **Wspólne stany obu ekranów**: ładowanie, błąd (z komunikatem serwera), brak połączenia, brak dostępu i
   „nie znaleziono” (wspólny ekran odmowy), w tym samym szablonie co ekran z danymi. Potwierdzenia we wspólnym
   powiadomieniu, ostrzeżenie o niezapisanych zmianach przez wspólny mechanizm, daty, czas i odmiana przez
   wspólne pomocniki.
5. **Strony podglądu**: `app/nowy-front/prowadzacy/grupa/page.tsx` i `app/nowy-front/prowadzacy/watek-grupowy/page.tsx`.
   Bez grupy przełączenia, menu i odnośników z innych ekranów.
6. **Testy** (10 plików, 157 przypadków, wszystkie zielone): stany obu ekranów, żądania (te same trasy, metody i
   ciała co na starych stronach), odmiana liczebników, postęp słowami z pulpitu, filtr, obecności, formularze i ich
   błędy serwera, stronicowanie wiadomości, skład wątku, dostępność (kontrola automatyczna we wszystkich stanach)
   oraz struktura plików.

Żądania: żadnej nowej trasy. Grupa: `GET /instructor/group`, `GET /instructor/reliability`,
`POST /instructor/slots`, `PATCH /instructor/slots/{id}/attendance`, `POST /instructor/cases`. Wątek:
`GET /threads`, `POST /threads`, `GET /threads/{id}`, `POST /threads/{id}/messages`,
`POST` i `DELETE /threads/{id}/members/{id osoby}`. Kto co może, rozstrzyga serwer — ekrany niczego nie
sprawdzają same i niczego nie dodają.

## Polecenia i liczby (w katalogu `frontend/`)

| Co | Polecenie | Wynik |
|---|---|---|
| Testy przed zmianami (czysty koniec `sprint-2`) | `npm run test` | 481 plików, 6038 przypadków: 6037 zaliczonych, 1 pominięty, 0 niezaliczonych |
| Testy po zmianach | `npm run test` | 491 plików, 6199 przypadków: 6195 zaliczonych, **3 niezaliczone**, 1 pominięty |
| Same nowe testy | `npx vitest run nowy-front/grupa-prowadzacego nowy-front/watek-grupowy` | 10 plików, 157 przypadków, wszystkie zaliczone |
| Sprawdzenie typów | `npm run sprawdz-typy` | bez błędów |
| Lint | `npm run lint` | 0 błędów, 10 ostrzeżeń w istniejących plikach (tyle samo co przed zmianami), 0 w nowych |
| Budowanie | `npm run build` | powodzenie; obie nowe trasy zbudowane jako statyczne |

Różnica 161 przypadków to 157 nowych plus 4 przypadki istniejącej kontroli punktów orientacyjnych, która sama
obejmuje dwie nowe trasy (zaliczone). Dla pewności, że testy coś mierzą, zepsułem celowo cztery miejsca w kodzie
(nazwę przycisku głównego, zapis liczby kursów, blokadę pustej wiadomości, przeniesienie fokusu) — testy to wykryły
(14 niezaliczonych), po czym przywróciłem kod.

Oba ekrany obejrzałem też na zrzutach z lokalnie uruchomionej zbudowanej aplikacji (390 px i 1280 px, atrapy
odpowiedzi serwera, bez sieci zewnętrznej): brak przewijania w poziomie, lista osób składa się w bloki linii,
a po otwarciu panelu i wątku fokus stoi na nagłówku.

## Oczekiwane czerwone testy (zamknięte listy) — czego brakuje

Trzy niezaliczone przypadki w dwóch plikach; żadnego nie ruszałem ani nie osłabiałem.

1. `frontend/design-system/szablony/__tests__/niezapisane-zmiany-zrodla.test.ts`, przypadek „zgłoszenia stoją
   wyłącznie w plikach z listy (lista jest pełna)”. Oba nowe ekrany zgłaszają niezapisane zmiany ramie panelu, więc
   zespół musi dopisać do listy `PLIKI_ZGLASZAJACE` dwa wpisy:
   `"nowy-front/grupa-prowadzacego/GrupaProwadzacego.tsx",` (po `nowy-front/formy-stazu/FormyStazu.tsx`) i
   `"nowy-front/watek-grupowy/WatekGrupowy.tsx",` (po `nowy-front/ustawienia-edycji/UstawieniaEdycji.tsx`).
2. `frontend/lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts` — dwa przypadki: „każdy ekran nowego frontu
   należy do jakiejś grupy rejestru” i „przypadek odwrotny: ekran spoza rejestru albo wpis bez strony zostaje
   wykryty”. Zespół musi dopisać w `frontend/lib/przelaczenie/grupy.ts` dwa ekrany tego panelu: z
   `trasaPoligonu: "/nowy-front/prowadzacy/grupa"` (stara trasa `/prowadzacy/grupa`) i z
   `trasaPoligonu: "/nowy-front/prowadzacy/watek-grupowy"` (stara trasa `/prowadzacy/watek-grupowy`), każdy w
   postaci `{ panel: "prowadzacy", staraTrasa: <stara trasa>, nowaTrasa: <trasa produktu wybrana przez zespół>,
   trasaPoligonu: <trasa podglądu> }`. Proponuję jedną grupę (klucz `grupaProwadzacego`, `wlaczona: false`) z oboma
   ekranami albo dwie osobne; wartość `nowaTrasa` to decyzja zespołu.

## Czego nie zrobiono i dlaczego

- **Stanu „wątek zamknięty”, usuwania wiadomości i pytań o potwierdzenie przy ich zamykaniu nie ma.** Ani stary
  ekran, ani serwer nie znają pojęcia zamkniętego wątku (wątek i wiadomość nie mają żadnego takiego pola, a trasy
  nie pozwalają zamykać wątku ani usuwać wiadomości), a polecenie zabrania nowych tras i zmiany zachowania.
  Z tego samego powodu nie ma testu „wątek zamknięty”; zamiast niego test pilnuje, że pole pisania jest zawsze, a
  zdania o zamknięciu nie ma. Usunięcie osoby ze składu wątku — jedyna czynność tego rodzaju — jak dotąd nie pyta o
  potwierdzenie, więc nowy ekran też nie pyta (patrz pytania otwarte).
- Stan „pusta grupa” rozumiem jako wynik filtru bez trafień („Brak osób spełniających filtr”), a stan „brak
  przypisanej grupy” jako grupę bez żadnej osoby („Nie masz jeszcze przypisanej grupy”), bo serwer nie odróżnia
  tych przypadków. Do potwierdzenia.
- Paska postępu kursów ze starej tabeli nie ma: lista w układzie kolumn ze wspólnych klocków nie ma paska, a liczba
  „2 z 5” niesie tę samą informację tekstem.
- Nie dodano grupy przełączenia, wpisu w menu ani odnośników z innych ekranów (zgodnie z poleceniem).
- Nie uruchamiano skryptów pomiarowych kontrastu i celów dotyku (`npm run pomiar:*`) ani testów z `e2e/`;
  dostępność sprawdzono automatyczną kontrolą w testach (bez kontrastu) oraz wzrokowo na zrzutach.
- Nie dotykano tablicy statusów pakietów ani plików `DEMO/`: ta gałąź jest gałęzią roboczą spoza trybu pakietowego.

## Różnice względem starych ekranów (świadome)

- Formularze terminu i sprawy nie leżą już na stronie na stałe: otwiera je „Utwórz termin” i „Zgłoś sprawę” z
  nagłówka. Pola, reguły i komunikaty są te same; pusty temat albo opis blokuje przycisk (z powodem) zamiast
  blokady przeglądarki.
- Nowy termin wchodzi na listę we właściwe miejsce według daty (stary ekran dopisywał go na koniec).
- Wiadomości dalsze niż pierwsze 25: stary ekran ich nie pokazywał (serwer stronicuje po 25). Nowy ma przyciski
  „Poprzednia” / „Następna” i prosi o dalsze strony tą samą trasą z parametrem `page`; pierwsza strona jest czytana
  dokładnie jak dotąd.
- Obecność w liście wyboru: „Obecność” / „Nieobecność” zamiast „Obecny/a” / „Nieobecny/a”; „Nie masz jeszcze żadnego
  terminu” zamiast „Nie utworzyłeś/aś…” (formy neutralne płciowo).
- Wpisana, a niewysłana wiadomość w wątku jest zgłaszana wspólnemu ostrzeżeniu o niezapisanych zmianach (stary ekran
  tego nie robił). To samo dotyczy niezapisanych obecności i otwartych formularzy w „Mojej grupie”.
- Pole z numerem osoby w składzie wątku nazywa się „Numer osoby” (było „Identyfikator osoby”) i mówi, dlaczego
  przyciski są nieaktywne.

## Co ekrany pokazują o osobach, i pytania otwarte

Stary ekran „Moja grupa” pokazuje o osobie wyłącznie imię i nazwisko oraz postęp (kursy, staż, superwizje,
warsztat, rzetelność nauki); w terminach — imię, nazwisko i obecność. Danych kontaktowych, dokumentów ani notatek
nie pokazuje, więc nowy ekran też ich nie pokazuje i niczego nie trzeba było pomijać.

1. Czy do „postępu w nauce” wolno zaliczać godziny stażu, obecności na superwizjach, stan warsztatu i wynik
   rzetelności (stary ekran i pulpit tego panelu je pokazują), czy zawęzić widok do kursów?
2. Czy dodać stan „wątek zamknięty”? Wymaga to nowego pola i tras po stronie serwera (zmiana kontraktu).
3. Czy usunięcie osoby ze składu wątku ma pytać „Na pewno?”. Usunięcie zdejmuje osobę z grupy osoby, która
   to robi (zamyka jej przypisanie), a stary ekran robi to jednym kliknięciem.
4. Numer osoby wpisuje się ręcznie, a nigdzie na ekranach nie widzi tych numerów. Czy zastąpić pole listą
   osób? Wymaga to innego źródła niż dotychczasowe żądania ekranu wątku.
5. Czy stronicowanie wiadomości w wątku ma zostać (dodatek względem starego ekranu)?

Jest uwaga dotycząca bezpieczeństwa — przekażę ją ustnie.
