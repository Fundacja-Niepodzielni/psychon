# Raport gałęzi `chmura/certyfikaty-i-czas-nauki-nowy-wyglad`

Ten plik jest tymczasowy — zostanie usunięty przy przejęciu gałęzi.

## Co zrobiono

Dwa ekrany panelu administracyjnego zbudowano od nowa z nowych klocków. Stare strony zostały bez zmian.

1. **Pomiar starych ekranów** — plik `frontend/nowy-front/certyfikaty-lista/POMIAR-STAREGO-EKRANU.md`
   (oba ekrany w jednym pliku): każde żądanie z polami, kolumny, strona, stany, cały przebieg unieważnienia
   i lista świadomych różnic.
2. **Ekran „Certyfikaty”** — `frontend/nowy-front/certyfikaty-lista/`, strona podglądu
   `frontend/app/nowy-front/admin/certyfikaty/page.tsx`.
   - Lista na wzorze listy osób: ten sam szablon strony, nagłówek, pasek filtra, licznik z odmianą
     („Razem: 60 certyfikatów.”), stronicowanie, wspólny ekran odmowy.
   - Stan słowami: „ważny”, „unieważniony”. Słowo „rok programu” zamiast „edycja”.
   - Nazwa osoby jest odnośnikiem do karty osoby.
   - „Unieważnij” stoi w wierszu certyfikatu. Otwiera okno z wymaganym powodem, podpowiedzią
     „Pisz rzeczowo, bez informacji o zdrowiu.” i zdaniem, że unieważnienia nie da się cofnąć.
     Fokus po otwarciu idzie na nagłówek okna, nie na przycisk potwierdzenia.
   - Powód unieważnionego certyfikatu nie stoi w wierszu. Pokazuje go dopiero przycisk „Szczegóły”
     przy tym certyfikacie (dane z już pobranej listy, bez nowego żądania).
3. **Ekran „Czas nauki”** — `frontend/nowy-front/czas-nauki/`, strona podglądu
   `frontend/app/nowy-front/admin/czas-nauki/page.tsx`.
   - Te same liczby i szczegóły co na starym ekranie, czas w „godz.” i „min”.
   - Szczegóły osoby otwierają się jako osobny widok tego samego ekranu. „Wróć do listy” wraca na tę samą
     stronę listy, bez ponownego pobierania, a fokus wraca na przycisk, który widok otworzył.
4. **Wspólna lista wierszy** `TabelaWierszy` (w folderze certyfikatów, używana też przez czas nauki):
   od 640 px układ tabeli, poniżej bloki linii z nazwą na górze, bez przewijania poziomego. Powstała,
   bo gotowa lista rekordów nie pozwala zrobić z nazwy odnośnika.

Żadnej nowej trasy serwera, żadnej zmiany tego, kto co może. Nie dodano grupy przełączenia, wpisu menu
ani odnośnika z innych ekranów.

## Polecenia i liczby

Wszystko w katalogu `frontend/`. „Przed” = czubek gałęzi `sprint-2`, „po” = ostatni commit z kodem.

| Polecenie | Przed | Po |
|---|---|---|
| `npm run sprawdz-typy` (typy) | 0 błędów | 0 błędów |
| `npm run lint` | 0 błędów, 10 ostrzeżeń | 0 błędów, 10 ostrzeżeń (te same, żadne w nowych plikach) |
| `npm run test` | 481 plików, 6038 prób: 6037 zielonych, 1 pominięta, 0 czerwonych | 486 plików, 6141 prób: 6138 zielonych, 1 pominięta, **2 czerwone** (patrz niżej) |
| `npm run build` | przechodzi, 98 tras | przechodzi, 100 tras (dwie nowe strony podglądu) |

Przyrost prób: 99 nowych w 5 nowych plikach (stany ekranów, filtr, szczegóły, unieważnienie, dane,
kontrola źródeł, automatyczna kontrola dostępności) oraz 4 przypadki we wspólnym teście punktów
orientacyjnych, który sam liczy strony.

Poza tym sprawdzono oba ekrany w prawdziwej przeglądarce (Chromium) na szerokościach 390, 768 i 1280 px,
na tymczasowej stronie z podstawionymi danymi (nie wchodzi do repozytorium): lista, szczegóły, okno
unieważnienia z błędem, widok osoby. Wynik: brak przewijania poziomego (szerokość strony równa szerokości
okna), żaden element klikalny w liście mniejszy niż 40 px, automatyczna kontrola dostępności z pomiarem
kontrastu bez naruszeń w 15 z 15 widoków, fokus po otwarciu okna na nagłówku. Ta kontrola wykryła realny
problem (patrz „Pytania otwarte”, punkt 5), który poprawiono przed ostatnim commitem.

Raz w jednym z pełnych przebiegów czerwony był niezwiązany test starej strony kursu uczestnika
(`app/(uczestnik)/panel/kursy/[slug]/__tests__/przelaczenie-trasa.test.tsx`, różnica w chwili
pojawienia się komunikatu błędu). Osobno przeszedł 4/4, a w dwóch pozostałych pełnych przebiegach też
był zielony — traktuję to jako jednorazową zależność od czasu pod obciążeniem, nie jako skutek zmian.

## Czerwone testy zamkniętych list

1. `frontend/lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts` — **czerwone, 2 próby**
   („każdy ekran nowego frontu należy do jakiejś grupy rejestru” oraz „przypadek odwrotny…”).
   Powód: w drzewie są dwie nowe trasy `/nowy-front/admin/certyfikaty` i `/nowy-front/admin/czas-nauki`,
   których żadna grupa nie wskazuje. Wpis, który zespół ma dodać w `frontend/lib/przelaczenie/grupy.ts`
   (w `GRUPY`, po jednej grupie na ekran; test nie wymaga zmiany, druga próba zazielenieje razem z pierwszą):

   ```ts
   certyfikaty: {
     klucz: "certyfikaty",
     wlaczona: false,
     ekrany: [{ panel: "administracja", staraTrasa: "/admin/certyfikaty", nowaTrasa: "/admin/certyfikaty",
                trasaPoligonu: "/nowy-front/admin/certyfikaty" }],
   },
   czasNauki: {
     klucz: "czasNauki",
     wlaczona: false,
     ekrany: [{ panel: "administracja", staraTrasa: "/admin/czas-nauki", nowaTrasa: "/admin/czas-nauki",
                trasaPoligonu: "/nowy-front/admin/czas-nauki" }],
   },
   ```

   Włączenie grup wymaga jeszcze podmiany treści starych stron (jak przy pozostałych grupach) —
   tego nie robiono.
2. `frontend/design-system/szablony/__tests__/niezapisane-zmiany-zrodla.test.ts` — **zostało zielone**,
   choć spodziewano się czerwieni. Powód: nowe pliki nie mają formularza zapisującego zmiany w jego
   rozumieniu (nie używają `SaveBar`, `onZapisz` ani `zapisz(`), a okno unieważnienia jest modalne —
   nie da się z niego wyjść bez rozstrzygnięcia, więc nie zgłaszam go do mechanizmu niezapisanych zmian.
   Jeśli zespół chce inaczej, trzeba dodać wpis w liście `PLIKI_ZGLASZAJACE` dla pliku
   `nowy-front/certyfikaty-lista/OknoUniewaznienia.tsx` i wywołać zgłoszenie w tym pliku.

## Czego nie zrobiono i dlaczego

- Grupy przełączenia, wpisu menu i odnośnika z innych ekranów — zgodnie z zakazem, zrobi to zespół.
- Filtra ani sortowania w „Czasie nauki” — serwer odrzuca każdy parametr poza stroną i rozmiarem strony,
  a nowej trasy nie wolno dodawać. Stan „filtr bez wyników” dotyczy więc tylko certyfikatów.
- Osobnego adresu dla widoku osoby w „Czasie nauki” — nie wolno dodawać stron poza dwiema podglądowymi,
  więc widok osoby jest stanem tego samego ekranu. Przycisk „Wstecz” przeglądarki wychodzi z całego
  ekranu, nie wraca na listę.
- Sprawdzenia całości w działającej aplikacji z prawdziwym serwerem i logowaniem — w tym środowisku
  jej nie ma; przeglądarkowe próby poszły na tymczasowej stronie z podstawionymi danymi.
- Do opisów commitów nie dodano żadnych dopisków na końcu (autor ustawiony jak w ostatnim commicie gałęzi `sprint-2`).

## Pytania otwarte

1. **„Wspólny pasek potwierdzenia”** — zrozumiałem jako wspólny `Toast` (pasek z potwierdzeniem po
   unieważnieniu, znika po 8 s albo po zamknięciu). Jeśli chodziło o inny element, zmiana jest w jednym
   miejscu (`CertyfikatyLista.tsx`).
2. **Filtr certyfikatów** używa parametrów `number` i `person`, które serwer już obsługuje. Bez filtra
   żądanie jest identyczne ze starym. Czy to mieści się w „tych samych żądaniach z tymi samymi polami”?
3. **Czas w minutach** — sekundy nie są już pokazywane, a minuty zaokrąglane w górę wspólną funkcją
   (270 s daje „5 min”, stary ekran: „4 min 30 s”). Procent rzetelności z serwera bez zmian.
4. **Powód unieważnienia** — serwer wymaga 10–1000 znaków, a ekran (jak stary) sprawdza tylko, czy pole
   nie jest puste; za krótki powód wraca jako błąd pola z serwera. Czy dodać sprawdzenie długości po
   stronie ekranu? Odpowiedź serwera „już unieważniony” (409) pokazuje się w oknie, lista się wtedy nie
   odświeża (tak samo jak dawniej).
5. **Wspólny przycisk główny z wariantem „niebezpieczny”** daje czerwony napis na zielonym tle —
   kontrast 1,2:1 (zmierzony w przeglądarce, testy w jsdom tego nie widzą). To samo łączenie robi wspólne
   okno potwierdzenia (`Dialog` z `niebezpieczne`), więc dotyczy też innych ekranów. W nowym oknie użyto
   przycisku obrysowanego z czerwonym napisem; atomu nie zmieniano.
6. **Lista wierszy** `TabelaWierszy` leży w folderze certyfikatów i jest importowana przez czas nauki.
   Zespół może ją przenieść do wspólnego miejsca.
Jest uwaga dotycząca bezpieczeństwa — przekażę ją ustnie.
