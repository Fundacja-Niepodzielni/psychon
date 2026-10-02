# Raport gałęzi: raport roku programu w nowym wyglądzie

Gałąź: `chmura/raport-roku-programu-nowy-wyglad`, utworzona z czubka `sprint-2`.
Ten plik jest tylko do przejęcia gałęzi i można go usunąć.

## Co zostało zrobione

### Pomiar

`frontend/nowy-front/raport-roku-programu/POMIAR.md` opisuje stan przed zmianą:

- każdą liczbę `GET /admin/report` i `GET /admin/report/grantor`, ze sposobem liczenia (plik:wiersz),
- które liczby zawężają daty, a które są stanem dziś,
- co zawierają oba pliki do pobrania,
- rozjazdy z decyzjami Fundacji.

Druga część dokumentu opisuje liczby dopisane na tej gałęzi.

Ze starszej próby z gałęzi `chmura/raporty-front` wziąłem tylko ustalenia o nazwach pól
(`people_with_passed_test` liczy osoby, a `tests_passed` liczy testy). Jej kod opierał się na dawnym stanie
i innej trasie, więc nie przenosiłem go.

### Zaplecze (bez migracji)

Zmienione pliki: `ReportSummary.php`, `ReportController.php`, `ReportIndexRequest.php` i nowa
próba `tests/Feature/H20/ReportYearProgramTest.php`. Stare pola i domyślny plik zostały bez zmian,
bo czyta je dotychczasowy ekran i próby zgodności z pulpitem. Nowe liczby stoją obok nich:

- **Rok programu:** blok `edition` (aktywna edycja) i `period` (zastosowany zakres dat).
- **Liczby programu tylko dla wolontariuszy** (`program`): konta aktywne, ukończeni, przyjęci,
  osoby z zaliczonym testem, certyfikaty **bez unieważnionych**, godziny dyżurów, **średnia na
  wolontariusza** i konsultacje. Daty zawężają tylko godziny, średnią i konsultacje.
- **Studenci osobno** (`students`): konta aktywne i ukończeni.
- **W wierszu osoby:** kursy „ile z ilu”, staż „ile z ilu godzin” (program liczy staż w godzinach),
  superwizje „ile z ilu”, data zaliczenia warsztatu, ważny certyfikat. Staż i superwizje studenta to `null`.
- **Plik pełnego zestawienia dla Fundacji:** `export.csv?uklad=zestawienie`. Ma polskie nagłówki,
  „nie dotyczy” u studenta i liczby dziesiętne z przecinkiem. Bez tego parametru plik jest taki jak dotąd.

Próba ma mały zmyślony zestaw danych bez seeda. Są w nim:

- studenci: jeden aktywny i jeden, który ukończył program,
- unieważniony certyfikat,
- osoba z dyżurem tylko poza okresem,
- konto zablokowane,
- wpis niezaakceptowany,
- odwołana obecność na superwizji,
- konto personelu.

### Front

- **Ekran** w `frontend/nowy-front/raport-roku-programu/`: `RaportRokuProgramu.tsx`, `Zestawienie.tsx`,
  `logika.ts`, `dane.ts`, style i próby.
- **Funkcje API** w `frontend/lib/api/raport-roku-programu.ts`.
- **Strona podglądu** w `frontend/app/nowy-front/admin/raport/page.tsx`.

Ekran stoi na szablonie listy, jak lista osób. Kolejność w kodzie jest taka sama jak na ekranie:

1. **Nagłówek:** „Raport roku programu” i raz rok programu w linii pod tytułem.
2. **„Od kiedy do kiedy”:** dwie daty, przycisk „Pokaż raport za ten okres”, jedno zdanie, które mówi,
   co daty zawężają, a co jest stanem dziś, i zdanie z zastosowanym okresem.
3. **„Najważniejsze liczby”:** lista opisów, nie kafle. Sześć liczb z decyzji, godziny jako „godz.”.
4. **„Dla grantodawcy”:** zdanie „Grantodawca dostaje tylko liczby, bez nazwisk.” i jedyny zielony
   przycisk „Pobierz liczby dla grantodawcy (bez nazwisk)”.
5. **„Pozostałe liczby”:** przyjęci, konsultacje i jeden wiersz „Studenci”.
6. **„Zestawienie”:** przycisk „Pobierz zestawienie (Excel)” z uwagą „Do użytku w Fundacji. Nie przekazuj
   grantodawcy.” i tabela w samym raporcie ze stronicowaniem po 25 osób. Nazwisko jest nagłówkiem wiersza;
   kolumny to rola, kursy, staż, superwizje, warsztat i „Otwórz kartę” z ukrytym dopiskiem z nazwą osoby.
   Poniżej 640 px wiersz jest blokiem z nazwiskiem jako tytułem.

Każdy nieczynny przycisk ma zdanie, które mówi dlaczego.

Ekran ma osobne stany, każdy z próbą:

- ładowanie,
- błąd,
- brak połączenia,
- brak dostępu (wspólny ekran odmowy),
- rok bez osób,
- raport z danymi,
- okres bez zdarzeń,
- zły zakres dat: „Data końca nie może być wcześniejsza niż data początku.”

## Zmiany odpowiedzi serwera

1. `GET /admin/report` i `GET /admin/reports`: nowe klucze `data.edition`, `data.period`, `data.program`,
   `data.students`. W każdym `data.people[]` nowe pola: `certificate_valid`, `courses_done`,
   `courses_total`, `internship`, `supervision`, `workshop_completed_at`. Stare pola bez zmian.
2. Zdanie błędu odwróconego zakresu dat (pole `to`) brzmiało „Data końcowa nie może być wcześniejsza niż
   data początkowa.”, a teraz brzmi „Data końca nie może być wcześniejsza niż data początku.”
3. Nowy parametr `uklad` na `GET /admin/report`, `GET /admin/reports` i `GET /admin/report/export.csv`.
   Jedyna dozwolona wartość to `zestawienie`, inna daje 422 „Nieznany układ pliku.” Na trasach JSON
   parametr niczego nie zmienia.
4. Nowa postać pliku `GET /admin/report/export.csv?uklad=zestawienie` (plik `zestawienie-roku-programu.csv`).
5. Raport zamknięcia edycji i plik grantodawcy: bez zmian.

## Polecenia i wyniki

Frontend, w katalogu `frontend/`:

| Polecenie | Przed zmianą | Po zmianie |
|---|---|---|
| `npm run sprawdz-typy` | 0 błędów | 0 błędów |
| `npm run lint` | 0 błędów, 10 ostrzeżeń | 0 błędów, te same 10 ostrzeżeń (wszystkie w plikach spoza gałęzi) |
| `npm run build` | przeszło, 101 tras | przeszło, 102 trasy (nowa `/nowy-front/admin/raport`) |
| `npm run test` | 481 plików, 6037 zaliczonych, 1 pominięta | 486 plików, 6083 zaliczone, 1 pominięta, **2 czerwone** (zapowiedziane, niżej) |
| próby samego ekranu | — | 5 plików, 46 prób, wszystkie zaliczone |

Układ sprawdziłem w przeglądarce przy 320, 390 i 1280 px na tymczasowym stanowisku poza
repozytorium. Sprawdziłem raport z 30 osobami, pusty rok, odmowę i zły zakres dat. W żadnym widoku
strona nie przewija się w poziomie i nie zgłasza błędów.

Zaplecze, w katalogu `backend/`:

- **Próby zaplecza nie zostały uruchomione — ani zmienionych plików, ani całego zestawu.**
  Obraz ma PHP 8.3, a zablokowane zależności wymagają PHP 8.4. Instalacja zależności z pominięciem
  tego wymogu też się nie udała, bo serwer pakietów odmówił pobrań bez uwierzytelnienia. Tokenu nie
  użyłem, zewnętrznych źródeł pakietów nie dodawałem, pliku środowiskowego nie tworzyłem.
- Z tego samego powodu nie zostały uruchomione ani formatowanie, ani analiza statyczna.
- Sprawdziłem tylko składnię (`php -l`) czterech zmienionych plików: bez błędów.
- Przed scaleniem trzeba więc uruchomić w zwykłym środowisku zespołu: `php artisan test` (zwłaszcza
  `tests/Feature/H20`), `./vendor/bin/pint --test` i `./vendor/bin/phpstan analyse`.

## Czerwone próby i wpisy, które musi dodać zespół

- `frontend/lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts` — dwie próby: „każdy ekran nowego
  frontu należy do jakiejś grupy rejestru” i „przypadek odwrotny…”. Brakujący wpis to grupa
  w `frontend/lib/przelaczenie/grupy.ts`, na przykład wyłączona:

  ```ts
  raportRokuProgramu: {
    klucz: "raportRokuProgramu",
    wlaczona: false,
    ekrany: [
      { panel: "administracja", staraTrasa: "/admin/raport", nowaTrasa: "/admin/raport", trasaPoligonu: "/nowy-front/admin/raport" },
    ],
  },
  ```

- `design-system/szablony/__tests__/niezapisane-zmiany-zrodla.test.ts` — **nie czerwienieje**. Ekran nie ma
  formularza do zapisania (daty tylko zawężają odczyt), więc się nie zgłasza i wpis nie jest potrzebny.

## Czego nie zrobiłem i dlaczego

- **Pliku grantodawcy nie zmieniałem.** Wolno go było zmienić tylko wtedy, gdy próba udowodni błąd,
  a prób zaplecza nie dało się tu uruchomić. Ten plik dziś:
  - wlicza unieważnione certyfikaty,
  - wlicza studentów do „w programie” i do zaliczonych testów,
  - zawęża datami każdą liczbę poza „w programie”, więc liczy inaczej niż ekran.

  Proponowane próby: unieważniony certyfikat nie wchodzi do `certificates_issued_total`, a student nie
  wchodzi do `participants_by_status.in_program`. Uwaga: obecna próba `GrantorReportTest` oczekuje dziś
  studenta w `in_program`, więc zmiana definicji wymaga decyzji, nie tylko poprawki.
- **Domyślnego `export.csv` nie zmieniłem.** Próba neutralizacji formuł w CSV pilnuje dokładnego końca
  jego wiersza, a czyta go stary ekran. Nowy układ idzie przez parametr.
- **Zdania o datach nie ma w plikach.** Żaden z nich nie ma miejsca na uwagi (plik grantodawcy ma
  dwie kolumny `wskaznik;wartosc`).
- **Raport nie jest zawężony do edycji.** Obejmuje wszystkie konta wolontariuszy i studentów, jak dotąd;
  przy jednej edycji naraz wynik jest ten sam. Próba `ReportClosingTest` wprost pilnuje, że główny raport
  nie jest zawężony do jednej edycji.
- **Przyciski „Poprzednia” i „Następna”** wspólnego stronicowania są na skrajnych stronach nieczynne bez
  osobnego zdania. Mówi o tym tylko napis „Strona X z Y”, a wspólnego elementu nie wolno mi było zmieniać.
- **Dopisek przy „Otwórz kartę”** brzmi „ osoby: Imię Nazwisko”, więc pełna nazwa to „Otwórz kartę osoby: Marta
  Demo”. Sam dwukropek próba nazwy dostępnej łączyła ze spacją przed nim.

## Pytania otwarte

1. Czy plik grantodawcy ma liczyć tak jak ekran: tylko wolontariusze, bez unieważnionych certyfikatów,
   daty zawężają tylko godziny? Dziś liczy inaczej, a ekran pobiera go z tym samym okresem.
2. Średnia na wolontariusza dzieli godziny wszystkich wolontariuszy (także zablokowanych) przez
   wolontariuszy z kontem aktywnym, tym samym wzorem co dotychczasowa średnia. Czy tak ma zostać?
3. „Osoby z zaliczonym testem” liczy osoby z co najmniej jednym zaliczonym testem, jak dotychczasowe pole.
   Czy chodzi o dowolny test, czy o testy kursów ścieżki?
4. Czy raport ma być zawężony do kont aktywnej edycji, gdy edycji będzie kilka?
5. Czy stary ekran „Raport edycji” ma przejść na certyfikaty bez unieważnionych? Dziś pole starego ekranu
   jest równe licznikowi pulpitu, który liczy wszystkie certyfikaty.
6. Plik zestawienia ma przecinek w liczbach dziesiętnych (polski arkusz czyta „41.5” jako datę), a inne
   pliki mają kropkę. Czy ujednolicić?

Uwag dotyczących bezpieczeństwa nie mam.
