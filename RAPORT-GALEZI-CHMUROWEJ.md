# Raport gałęzi: superwizja uczestnika w nowym wyglądzie

Gałąź: `chmura/superwizja-uczestnika-nowy-wyglad`, wyprowadzona z `sprint-2` (commit `1d03784`).
Ten plik zostanie usunięty przy przejęciu gałęzi.

## Co zostało zrobione

Ekran „Superwizja” (zapisy na terminy superwizji) powstał od nowa z elementów nowego wyglądu.
Stary ekran (`frontend/app/(uczestnik)/panel/superwizja/page.tsx` ze starym komponentem
`frontend/components/h12/SupervisionSlots.tsx`) został nietknięty.

Nowe pliki:

- `frontend/nowy-front/superwizja-uczestnika/POMIAR-STAREGO-EKRANU.md` — pomiar starego ekranu:
  każde żądanie (metoda, ścieżka, pola wysyłane i czytane), odpowiedzi błędów i każdy stan,
  łącznie z obecnością.
- `frontend/nowy-front/superwizja-uczestnika/dane.ts` — żądania, podział terminów, plakietki,
  powody wyłączonych przycisków, odmiana liczebników, podział błędów.
- `frontend/nowy-front/superwizja-uczestnika/SuperwizjaUczestnika.tsx` — ekran.
- `frontend/nowy-front/superwizja-uczestnika/KartaTerminu.tsx` — karta jednego terminu.
- `frontend/nowy-front/superwizja-uczestnika/SuperwizjaUczestnika.module.css` — style z tokenów,
  bez kolorów wpisanych wprost.
- `frontend/nowy-front/superwizja-uczestnika/__tests__/` — trzy pliki testów (44 testy).
- `frontend/app/nowy-front/superwizja/page.tsx` — strona podglądu pod adresem
  `/nowy-front/superwizja`.

Bez grupy przełączenia, bez wpisu w menu i bez odnośników z innych ekranów.

### Żądania

Nowy ekran wysyła dokładnie te same trzy żądania co stary:

- `GET /supervision/slots?page=1&per_page=25`;
- `POST /supervision/slots/{id}/signup` bez ciała;
- `DELETE /supervision/slots/{id}/signup` bez ciała.

Termin z odpowiedzi zastępuje kartę bez ponownego wczytania listy. Po nieudanym zapisie albo
wypisie lista jest wczytywana jeszcze raz; gdy i to się nie uda, wczytane terminy zostają na
ekranie z komunikatem nad nimi — tak jak dotąd. Pilnuje tego test, który czyta stary komponent,
trasy serwera i zasób terminu.

### Ekran

- Ten sam szablon listy i nagłówek co inne nowe ekrany. Tytuł „Superwizja” to ta sama nazwa co
  pozycja menu.
- **Twoje terminy:** terminy z Twoim zapisem, także minione. Na karcie: data z godziną,
  plakietka („Zapisano Cię” albo obecność), czas trwania, miejsce albo odnośnik „Dołącz do
  spotkania” i obecność.
- **Wolne terminy:** terminy przed rozpoczęciem bez Twojego zapisu, z wolnymi miejscami i pełne.
  Na karcie: liczba wolnych miejsc z odmianą („4 wolne miejsca”, „5 wolnych miejsc”) i zajęte
  miejsca („2 z 6”).
- **Terminy, które już się odbyły:** terminy bez Twojego zapisu, które już się rozpoczęły. Ta
  część pokazuje się tylko wtedy, gdy są takie terminy — stary ekran też je pokazywał.
- Jeden zielony przycisk na stan: tylko „Zapisz się” przy najbliższym terminie, na który można
  się teraz zapisać. Pozostałe przyciski są obrysowane.
- Każdy wyłączony przycisk ma zdanie z powodem, powiązane z przyciskiem dla czytnika ekranu:
  - pełny termin: „Brak wolnych miejsc — termin jest pełny. Wybierz inny termin.”;
  - rozpoczęty termin bez zapisu: „Termin już się rozpoczął — zapis nie jest już możliwy.”;
  - rozpoczęty termin z zapisem: „Termin już się rozpoczął — wypis nie jest już możliwy.”.

  Gdy osoba jest już zapisana, zamiast „Zapisz się” stoi „Wypisz się”.
- Wypis pyta w oknie potwierdzenia („Wypisać Cię z terminu?”, „Nie wypisuj” / „Wypisz się”).
- Po zapisie i wypisie wynik z datą terminu pokazuje wspólny pasek potwierdzenia. Fokus
  przechodzi na przycisk tego terminu w nowym miejscu listy.
- Brak dostępu, wygasły dostęp i „nie znaleziono” korzystają ze wspólnego ekranu odmowy. Błąd
  serwera i brak połączenia mają osobne komunikaty z „Spróbuj ponownie”.
- Daty i godziny pochodzą ze wspólnego formatera, w czasie polskim, także po zmianie czasu.
  Liczebniki odmienia wspólny pomocnik.

### Nazwy

- „Wolne miejsca”, „Brak wolnych miejsc” i „Bez podanej lokalizacji.” to te same słowa co na
  ekranie terminów superwizji w administracji (`nowy-front/superwizje-terminy`). Pilnuje tego
  test.
- Obecność: „Obecność potwierdzona” i „Nieobecność” to słowa starego ekranu i dotychczasowego
  ekranu terminów w administracji. Nowy ekran administracji obecności nie pokazuje. Brak wpisu
  nazywa się „Obecność jeszcze nieoznaczona”.
- Forma neutralna: zamiast „Jesteś zapisany/a” jest „Zapisano Cię”.

## Uruchomione polecenia i wyniki

Wszystko w katalogu `frontend/`. „Przed” to czysty `sprint-2`, „po” to ostatni stan gałęzi.

| Polecenie | Przed | Po |
|---|---|---|
| `npm run sprawdz-typy` | 0 błędów | 0 błędów |
| `npm run lint` | 0 błędów, 10 ostrzeżeń | 0 błędów, 10 ostrzeżeń (żadne w nowych plikach) |
| `npm run test` | 481 plików, 6038 testów: 6037 zaliczonych, 1 pominięty, 0 niezaliczonych | 484 pliki, 6084 testy: 6081 zaliczonych, 1 pominięty, 2 niezaliczone |
| `npm run build` | sukces, 72 strony | sukces, 73 strony (nowa `/nowy-front/superwizja`) |

Testy nowego katalogu: 44 z 44 zaliczonych.

Oba niezaliczone testy są w `lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts`:

- „każdy ekran nowego frontu należy do jakiejś grupy rejestru”;
- „przypadek odwrotny: ekran spoza rejestru albo wpis bez strony zostaje wykryty”.

Przyczyna: strona `/nowy-front/superwizja` nie należy jeszcze do żadnej grupy przełączenia, bo
dodanie grupy zespół robi później. Wpis do dodania w `lib/przelaczenie/grupy.ts`:

```ts
superwizjaUczestnika: {
  klucz: "superwizjaUczestnika",
  wlaczona: false,
  ekrany: [
    {
      panel: "uczestnik",
      staraTrasa: "/panel/superwizja",
      nowaTrasa: "/panel/superwizja",
      trasaPoligonu: "/nowy-front/superwizja",
    },
  ],
},
```

Przyrząd `design-system/szablony/__tests__/niezapisane-zmiany-zrodla.test.ts` przechodzi. Ekran
nie ma formularza z polami do utracenia, więc nie zgłasza się do pytania o niezapisane zmiany
i nie potrzebuje wpisu na liście.

Żaden test nie został osłabiony ani pominięty.

Sprawdzenie układu przy szerokości 390 px: ekran zbudowany produkcyjnie, odpowiedzi serwera
podstawione w przeglądarce. Ani lista, ani otwarte okno wypisu nie przewijają się w bok
(szerokość przewijania 390 z 390).

## Czego nie zrobiono i dlaczego

- Ekranu nie oglądano z prawdziwym serwerem, bo wymaga to wartości środowiskowych, których ta
  gałąź nie zakłada ani nie czyta. Sprawdzono go testami i w przeglądarce z podstawionymi
  odpowiedziami.
- Stronicowania nie dodano. Stary ekran pokazywał tylko pierwsze 25 terminów, nowy robi to samo
  i mówi o tym zdaniem „Widzisz pierwsze 25 terminów z N.”.

## Różnice w zachowaniu wobec starego ekranu

- Wypis pyta o potwierdzenie (stary ekran wypisywał od razu).
- Potwierdzenie zapisu i wypisu znika po 8 sekundach (wspólny pasek). Stary ekran trzymał
  komunikat do następnej akcji.
- Brak połączenia i wygasły dostęp mają własne komunikaty.
- Pełny termin ma zdanie z powodem przy wyłączonym przycisku (stary ekran mówił o tym tylko
  plakietką).
- Miejsce podane jako adres `http` albo `https` jest klikalnym odnośnikiem „Dołącz do spotkania”.
  Każdy inny zapis zostaje tekstem, tak jak na starym ekranie.

## Pytania otwarte

1. Wspólny przycisk główny z wariantem „niebezpieczne” (`design-system/atomy/Button`, użyty przez
   `DialogActions`) daje czerwony napis na zielonym tle — nieczytelny. Okno wypisu na tym ekranie
   nie używa tego wariantu. Ekran terminów superwizji w administracji używa go w potwierdzeniu
   „Odwołaj termin”. Do poprawy we wspólnym przycisku.
2. Obecność: nowy ekran terminów w administracji jej nie pokazuje, a stary ekran prowadzącego
   mówi „Obecny/a” i „Nieobecny/a” (forma nieneutralna). Które słowa mają obowiązywać na
   wszystkich ekranach?
3. Wspólny ekran odmowy mówi „Jesteś zalogowany jako …” — forma męska. Jest we wspólnym katalogu,
   więc nie została zmieniona.
4. Czy przy więcej niż 25 terminach dodać stronicowanie? Wymagałoby to drugiego odczytu tej samej
   trasy z kolejnym numerem strony.
5. Na minionym terminie z zapisem obecność jest widoczna dwa razy: w plakietce i w danych karty.
   Zostawić czy zostawić tylko plakietkę?
6. Polecenie mówi o ekranie „Superwizje”, a menu i stary ekran mówią „Superwizja”. Nowy ekran ma
   tytuł z menu.

Jest uwaga dotycząca bezpieczeństwa — przekażę ją ustnie.
