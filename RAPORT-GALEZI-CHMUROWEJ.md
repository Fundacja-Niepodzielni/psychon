# Raport gałęzi `chmura/okno-formularza-i-zmiana-daty`

Gałąź wychodzi z końca `sprint-2` (commit `1d03784`). Plik raportu jest do usunięcia przy przejęciu gałęzi.

## Co zostało zrobione

### Wspólne okno (`design-system/organizmy/Dialog/`)

Wszystkie dotychczasowe użycia okna działają bez zmian w ich kodzie; doszły wyłącznie nowe, nieobowiązkowe właściwości.

- Okno jest natywnym elementem `<dialog>` otwieranym przez `showModal()`: przeglądarka sama wyłącza resztę strony i rysuje przesłonę. Gdy otwarte jest okno, strona pod spodem się nie przewija; po zamknięciu wraca poprzednie ustawienie. Okno ma też jawny atrybut roli, bo istniejące próby szukają go po nim.
- Treść okna jest powiązana z oknem jako jego opis (`aria-describedby`). W oknie formularza opisem jest krótkie zdanie podane przez wywołującego, a nie wszystkie pola.
- Układ: nagłówek u góry, przyciski u dołu, przewija się tylko środek. Poniżej 600 px okno wypełnia ekran, szerzej ma ograniczoną wysokość (także przy powiększeniu 200 %). Gdy klawiatura telefonu zmniejsza widoczną część ekranu, okno bierze jej wysokość, a pole z fokusem jest dosuwane do widoku. Przewijany środek jest osiągalny klawiaturą. Kreska nad przyciskami pojawia się tylko w formularzu albo przy przewijanym środku, więc krótkie pytania wyglądają jak dotąd.
- Nowy wariant „formularz”: treść i przyciski w `<form>`; fokus startuje na pierwszym polu (pytania „Na pewno?” dalej startują na „Anuluj”); Enter w polu wysyła jak na stronie; okno czeka na odpowiedź serwera — przycisk główny mówi „Zapisywanie…”, jest niedostępny, a drugie wysłanie jest ignorowane, zanim cokolwiek wyjdzie; w tym czasie Escape, „Anuluj” i przesłona nie zamykają okna. Błędy stoją na górze okna jako podsumowanie, które dostaje fokus; każdy błąd pola jest odnośnikiem do pola. Klik w przesłonę nigdy nie zamyka formularza. Escape przy wpisanych danych pyta w tym samym oknie „Porzucić wpisane dane?” z przyciskami „Porzuć” i „Wróć do formularza”.
- Escape na otwartej liście pola wyboru (`atomy/Select`) zamyka tylko listę; dopiero drugi Escape trafia do okna.
- Okno w oknie nie jest obsługiwane: w trybie deweloperskim konsola dostaje ostrzeżenie, a klawisze obsługuje wyłącznie okno na wierzchu (koniec „walki” dwóch okien o klawisze).
- Po zamknięciu fokus wraca do przycisku, który otworzył okno; gdy tego przycisku już nie ma albo jest niedostępny — na element wskazany przez wywołującego (np. nagłówek sekcji).
- Komunikat o sukcesie wywołujący ogłasza funkcją `oglosWPanelu` w stałym obszarze ogłoszeń. Obszar powstaje najpóźniej przy otwarciu pierwszego okna i nigdy nie jest usuwany — nie jest tworzony razem z treścią.
- Przycisk „Wstecz” przeglądarki (także na telefonie) przy otwartym oknie formularza zamyka samo okno: okno dokłada jeden wpis historii i zdejmuje go przy zamknięciu. Przy wpisanych danych „Wstecz” zadaje to samo pytanie co Escape.
- Rząd przycisków (`molekuly/DialogActions`) dostał nieobowiązkowe: typ „submit” dla potwierdzenia, stan zapisu z własną etykietą i możliwość niewstawiania fokusu.
- Strona podglądu okna formularza leży w `design-system/organizmy/Dialog/podglad/` (dane zmyślone); próba przeglądarkowa buduje ją sama w katalogu tymczasowym.

### „Zmień datę” na karcie osoby

- W nagłówku karty stoi data dostępu („Dostęp do materiałów do 1 lutego 2027” albo „Dostęp do materiałów: bezterminowo”), a obok przycisk „Zmień datę”. Przycisk widzą wyłącznie te role, które dopuszcza serwer na trasie zapisu daty (warunek przepisany z bramki tej trasy i pilnowany próbą czytającą plik trasy). W trakcie edycji danych osoby przycisku nie ma.
- Przycisk otwiera okno formularza „Zmień datę dostępu: Imię Nazwisko” z polami „Nowa data dostępu” (musi być późniejsza niż dziś w strefie warszawskiej, inaczej „Wybierz datę późniejszą niż dzisiejsza.”) i „Powód zmiany” (obowiązkowe, podpowiedź „Pisz rzeczowo, bez informacji o zdrowiu.”), z przyciskami „Anuluj” i „Zapisz datę”. Gdy wybrana data jest wcześniejsza niż obecna, podpowiedź mówi, że dostęp zostanie skrócony.
- Zapis idzie tą samą trasą co dawny ekran (`POST /admin/users/{id}/extend-access`) z samym polem `until`. Po sukcesie okno się zamyka, nagłówek i tabela pokazują nową datę, stały obszar ogłoszeń mówi „Data dostępu zmieniona na <data słownie>.” (słowo neutralne, nigdzie „przedłużony”), a fokus wraca na „Zmień datę”. Błędy serwera stoją na górze okna, wpisane dane zostają.
- Wpisane w oknie dane zgłaszają się do wspólnego pytania o niezapisane zmiany.

### Wycofanie osobnego ekranu przedłużenia dostępu

- Grupa ekranu wypadła z rejestru przełączenia (`lib/przelaczenie/grupy.ts`).
- Oba dawne adresy przekierowują: `/admin/uczestniczki/<id>/przedluzenie` na `/admin/uczestniczki/<id>`, `/nowy-front/admin/uczestniczki/<id>/przedluzenie` na `/nowy-front/admin/uczestniczki/<id>`; gdy w miejscu numeru stoi coś innego niż liczba — na listę osób. Nigdy strona „nie znaleziono”.
- Katalog `nowy-front/przedluzenie-dostepu/` i jego próby zostały usunięte; próba wejścia z karty na ten ekran też.

### Fokus po zaliczeniu warsztatu

Na karcie osoby blok warsztatu ma teraz stały nagłówek „Warsztat stacjonarny” (dla ról, które mogą zaliczać warsztat). Po potwierdzeniu „Zaznacz jako zaliczony” fokus trafia na ten nagłówek, bo przycisk, który otworzył pytanie, znika; po zaliczeniu blok mówi „Warsztat zaliczony.”. Przy „Anuluj” fokus wraca na przycisk.

## Polecenia i liczby

Wszystkie polecenia uruchomione w `frontend/`. „Przed” zmierzone na czystym `sprint-2` (budowa i e2e w osobnej kopii roboczej), „po” na końcu gałęzi.

| Polecenie | Przed | Po |
|---|---|---|
| `npm run sprawdz-typy` | 0 błędów | 0 błędów |
| `npm run lint` | 0 błędów, 10 ostrzeżeń | 0 błędów, 10 ostrzeżeń (te same, zastane) |
| `npm run test` | 481 plików; 6036 zaliczonych, 1 niezaliczona, 1 pominięta | 483 pliki; 6094 zaliczone, 0 niezaliczonych, 1 pominięta |
| `npm run build` | udana, 101 tras w wykazie | udana, 101 tras w wykazie |
| nowe próby przeglądarkowe (`PW_WEB_SERVER=1 npx playwright test e2e/okno-formularza-podglad.spec.ts e2e/karta-osoby-zmiana-daty.spec.ts`) | nie istniały | 32 zaliczone, 0 niezaliczonych |
| pełny zestaw prób przeglądarkowych (`PW_WEB_SERVER=1 npx playwright test`), dodatkowo | 97 niezaliczonych w 7 plikach (zmierzone na tych 7 plikach) | 567 zaliczonych, 97 niezaliczonych, 5 pominiętych z 669 |

Uwagi do liczb:

- Jedna niezaliczona próba jednostkowa „przed” (`app/(uczestnik)/panel/kursy/[slug]/__tests__/przelaczenie-trasa.test.tsx`) czerwieni się tylko w pełnym biegu pod obciążeniem; uruchomiona osobno przechodzi. W pośrednich biegach na gałęzi podobnie zachowały się pojedynczo trzy inne zastane próby (pytania do lekcji, licznik materiałów lekcji, prowadzący superwizji na karcie osoby) — za każdym razem zielone osobno i zielone w końcowym pełnym biegu.
- Pełny bieg prób przeglądarkowych na gałęzi dał najpierw 106 czerwieni. 9 z nich było moich: próby listy kursów administracji szukają okna po atrybucie roli, a natywny `<dialog>` ma tę rolę niejawnie. Po dodaniu jawnego atrybutu te 9 przechodzi. Pozostałe 97 czerwieni w 7 plikach (lekcja uczestnika — trzy pliki, odtwarzacz nagrania w ramce, wysyłanie nagrania w ramce, strażnik ścieżki adresu, logowanie według ról) jest identycznych na czystym `sprint-2`. Przyczyny: część tych plików sama uruchamia przeglądarkę w wersji, której w tym środowisku nie ma; próby logowania wymagają hasła ze zmiennej środowiskowej, której nie ustawiałem (zgodnie z zakazem tworzenia wartości środowiskowych); kilka czeka na żądania do zaplecza, którego tu nie ma.
- Przeglądarka do prób w tym środowisku ma inną wersję niż ta, której oczekuje zainstalowany pakiet prób. Próby uruchamiałem z lokalną nakładką konfiguracji spoza repozytorium, która wskazuje tylko zainstalowaną przeglądarkę (i katalog roboczy serwera); konfiguracja w repozytorium nie została zmieniona, nakładka nie trafiła do commita.
- Żadnej zmiennej środowiskowej ani pliku środowiskowego nie tworzyłem ani nie czytałem; budowa przeszła na wartościach domyślnych kodu.

## Zachowania przeniesione z prób dawnego ekranu do prób okna na karcie

Nowe pliki prób: `nowy-front/karta-osoby/__tests__/karta-osoby-zmiana-daty.test.tsx`, `dane-dostepu.test.ts`, `zmiana-daty-zrodla.test.ts`, a w przeglądarce `e2e/karta-osoby-zmiana-daty.spec.ts`.

Przeniesione:

1. Zapis idzie trasą zmiany daty z samym polem `until` — jedno żądanie, dokładne ciało.
2. Brak daty daje błąd przy polu i żadnego żądania (dziś także data dzisiejsza i wcześniejsza).
3. Data nieistniejąca albo w innym zapisie daje „Podaj poprawną datę.” (logika danych).
4. Data wcześniejsza niż obecna daje podpowiedź, że dostęp zostanie skrócony.
5. Brak obecnej daty daje zdanie „brak ustawionej daty” zamiast kreski.
6. Obecna data jest pokazana obok wyboru nowej (w opisie okna).
7. Jeden przycisk główny — w oknie jest nim tylko „Zapisz datę”.
8. 422 z polem `until` daje komunikat serwera przy polu daty, wpisane dane zostają; 422 bez pól daje zdanie ogólne.
9. 401/403 przy zapisie daje zdanie odmowy, 404 — „Nie znaleziono osoby…”; data bez zmian, brak komunikatu o sukcesie.
10. Błąd sieci przy zapisie daje komunikat, pola zostają, ponowny zapis się udaje.
11. Okno niczego nie wysyła do dziennika działań — serwer zapisuje zdarzenie sam (sprawdzane też w pliku kontrolera).
12. „Anuluj” niczego nie zapisuje (zamyka okno zamiast cofać stronę).
13. Po sukcesie widać nową datę i komunikat (dziś: nagłówek karty i stały obszar ogłoszeń, słowo neutralne zamiast „przedłużony”).
14. Zgodność z zapleczem: reguły żądania (`until` jako data, wykluczające się z `months`), bramka ról i ograniczenie numeru na trasie, klucze zasobu odpowiedzi, pola karty używane przez okno.
15. Formatowanie dat po polsku w strefie warszawskiej bez przesunięcia dnia (lato i zima, północ czasu polskiego).
16. Pomiar źródeł: brak surowych elementów interaktywnych i zdarzeń na nich, twardych kolorów, wstawiania surowego HTML, importów ze starego frontu, własnego znacznika głównego i zakazanych zdań odmowy.
17. W trakcie edycji danych osoby przycisku zmiany daty nie ma.
18. Stany wczytania karty (ładowanie, brak osoby, odmowa, błąd sieci z „Spróbuj ponownie”) — pokrywają je istniejące próby karty; dawny adres z czymś innym niż liczba przekierowuje na listę osób (próba przekierowania).

Nieprzeniesione, bo w nowym formularzu nie ma już trybu „o liczbę miesięcy”: zapis z polem `months`, granice 1–60 miesięcy, domyślne 6 miesięcy, liczenie miesięcy od obecnej daty albo od dziś i błędy pola miesięcy. Nieprzeniesione też odczytywanie numeru osoby z adresu ekranu (karta dostaje numer od strony) oraz wejście z karty na osobny ekran (ekranu już nie ma).

## Zmiany w próbach z zamkniętymi listami

- `frontend/lib/przelaczenie/__tests__/grupy.test.ts`: z listy grup usunięta grupa wycofanego ekranu; tytuł próby mówi teraz o dwudziestu ośmiu grupach zamiast dwudziestu dziewięciu.
- `frontend/lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts`: dodana jawna lista adresów wycofanych ekranów, które zostają wyłącznie jako przekierowanie — z jednym wpisem, dawnym adresem ekranu przedłużenia pod segmentem nowego frontu, z powodem. Adres z tej listy jest wyłączony z wymogu „każdy ekran nowego frontu należy do grupy”, a nowa próba w tym samym pliku pilnuje, że adres z listy istnieje, nie należy do żadnej grupy, jego strona przekierowuje i nie wstawia żadnego ekranu.
- `frontend/design-system/szablony/__tests__/niezapisane-zmiany-zrodla.test.ts`: z listy plików zgłaszających niezapisane zmiany usunięty plik wycofanego ekranu. Okno zmiany daty zgłasza się przez plik karty, który już był na liście — nowego wpisu nie było trzeba.
- `frontend/design-system/organizmy/Dialog/__tests__/Dialog.test.tsx` (próby okna, nie lista): próba „klik w przesłonę” sprawdza to samo zachowanie na nowej budowie okna — w natywnym oknie przesłoną jest sam element okna, a nie jego rodzic.

## Czego nie zrobiono i dlaczego

- Powód zmiany nie trafia do serwera. Trasa zapisu daty go dziś nie przyjmuje ani nie przechowuje, a kontrakt nie zna takiego pola; wymyślanie pola i zmiany zaplecza były poza zakresem. Pole jest obowiązkowe w formularzu, ale wpisany powód po zapisie przepada (próba to dokumentuje).
- Strona `frontend/app/nowy-front/admin/uczestniczki/[id]/page.tsx` dalej podaje karcie adres dawnego ekranu. Plik był poza dozwolonym zakresem, więc właściwość została w karcie jako przestarzała i nieczytana. Do usunięcia razem z tą linią strony.
- Komentarz w `frontend/app/(administracja)/admin/uczestniczki/[id]/page.tsx` dalej wspomina przycisk „Przedłuż dostęp” — plik starego frontu poza zakresem, komentarz jest nieaktualny.
- Pozostałe okna (pytania „Na pewno?”) dalej pokazują komunikat o sukcesie w powiadomieniu tworzonym razem z treścią; przeniesienie ich do stałego obszaru ogłoszeń zmieniałoby ich kod, a miały działać bez zmian.
- Strona pokazowa formularzy (`design-system/poligon/`) nie dostała wariantu formularza — poza zakresem; podgląd stoi w katalogu okna.
- `DESIGN.md` i audyt dostępności nie zostały uzupełnione o nowe zachowanie okna — poza zakresem plików.

## Otwarte pytania

1. Czy powód zmiany daty ma być zapisywany? Jeśli tak, potrzebny jest dopisek do kontraktu i zmiana zaplecza; zgodnie z zasadą o wolnym tekście powód powinien trafić do rekordu dziedzinowego, a nie do ładunku dziennika działań.
2. Poniżej 600 px na pełny ekran przechodzą wszystkie okna, także krótkie pytania „Na pewno?” — tak mówiło zlecenie. Czy krótkie pytania mają zostać jako małe okno na środku?
3. Po zamknięciu okna formularza przyciskiem „Wstecz” przycisk „Dalej” przeglądarki prowadzi na pusty wpis okna (nic się nie dzieje, adres ten sam). Czy to wystarcza?
4. Zamknięcie okna i przejście na inny adres w tej samej chwili nie jest obsługiwane (zdjęcie wpisu historii jest asynchroniczne) — opisane w komentarzu okna. Czy któryś ekran tego potrzebuje?
5. Dawne adresy przekierowują tymczasowo (307). Czy mają przekierowywać na stałe?

## Uwagi

Jest uwaga dotycząca bezpieczeństwa — przekażę ją ustnie.

Commity nie zawierają żadnych dopisków autorstwa ani stopek.
