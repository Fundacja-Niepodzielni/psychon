# Raport gałęzi `chmura/kursy-i-profil-uczestnika-nowy-wyglad`

Plik tymczasowy — zostanie usunięty przy przejęciu gałęzi.

Jest uwaga dotycząca bezpieczeństwa — przekażę ją ustnie.

## Co zrobiono

1. **Pomiar starych ekranów** — `frontend/nowy-front/profil-uczestnika/POMIAR-STAREGO-EKRANU.md`
   (oba ekrany w jednym pliku): każde żądanie z polami, każde pole formularza z regułą i
   komunikatem serwera, każdy stan, cały przebieg eksportu danych (zlecenie, sprawdzanie
   stanu co 2 sekundy, pobranie, wygaśnięcie po 24 godzinach).
2. **„Moje kursy”** — `frontend/nowy-front/kursy-uczestnika-lista/`, strona podglądu
   `/nowy-front/kursy`. Szablon listy z nagłówkiem jak na pulpicie, wiersze kursów
   wspólne z listą ścieżki na pulpicie (ukończony / w toku / zamknięty, zdanie o kursie,
   który trzeba ukończyć wcześniej). Jeden zielony przycisk w nagłówku: „Wróć do lekcji”
   przy kursie w toku, „Przejdź do testu”, „Zobacz warunki certyfikatu” albo „Otwórz kurs”
   (gdy nie uda się odczytać szczegółów kursu). Stany: ładowanie, błąd, brak połączenia,
   brak dostępu i „nie znaleziono” (wspólny ekran odmowy), brak kursów.
3. **„Mój profil”** — `frontend/nowy-front/profil-uczestnika/`, strona podglądu
   `/nowy-front/profil`. Karta „Dane osobowe” (widoczne etykiety, błędy pod polami i w
   podsumowaniu, fokus na podsumowaniu po błędzie, wspólny pasek potwierdzenia z fokusem po
   zapisie, wspólne ostrzeżenie o niezapisanych zmianach), karta „Eksport danych (RODO)”
   w osobnym komponencie, karta „Zgody” (tylko odczyt, jak na starej stronie).
4. **Żądania** — dokładnie te same co na starych stronach: `GET /courses`,
   `GET /courses/{slug}` (tylko kursu w toku, ta sama trasa co na pulpicie), `GET /me`,
   `PATCH /me`, `POST /me/exports`, `GET /me/exports/{id}`, pobranie pliku eksportu.
   Test `dane.test.ts` pilnuje metod, ścieżek i ciała żądania.

## Polecenia i liczby (w katalogu `frontend/`)

| Polecenie | Przed | Po |
|---|---|---|
| `npm run sprawdz-typy` | bez błędów | bez błędów |
| `npm run lint` | 0 błędów, 10 ostrzeżeń | 0 błędów, 10 ostrzeżeń (te same; w nowych plikach 0) |
| `npm run test` | 481 plików, 6037 testów zaliczonych, 1 pominięty | 488 plików: 486 zaliczonych i 2 z błędem; 6142 testy zaliczone, 3 z błędem, 1 pominięty |
| `npm run build` | przechodzi | przechodzi, obie nowe strony są na liście tras |

Przybyło 7 plików testowych i 108 testów łącznie: 104 to moje nowe testy (29 dla listy kursów, 75 dla profilu), a 4 dodatkowe przypadki pochodzą ze wspólnych testów, które przeglądają foldery — nie sprawdzałem, które to dokładnie. Sprawdziłem, że testy wykrywają
błędy: po celowym wyłączeniu fokusu po zapisie, fokusu na podsumowaniu błędów i blokady
podwójnego pobrania poczerwieniało 11 testów (pliki przywrócone).

## Oczekiwane czerwone testy (zamknięte listy — nie ruszałem)

1. `frontend/design-system/szablony/__tests__/niezapisane-zmiany-zrodla.test.ts`,
   przypadek „zgłoszenia stoją wyłącznie w plikach z listy”. Do tablicy `PLIKI_ZGLASZAJACE`
   trzeba dopisać wpis `"nowy-front/profil-uczestnika/ProfilUczestnika.tsx"` (plik wywołuje
   `useZgloszenieNiezapisanychZmian`). Pozostałe przypadki tego pliku przechodzą.
2. `frontend/lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts`, dwa przypadki:
   „każdy ekran nowego frontu należy do jakiejś grupy rejestru” oraz „przypadek odwrotny…”
   (ten drugi ma na sztywno listę dwóch tras `po-programie` i `zgloszenia-wspolpracy` — po
   dodaniu grup trzeba go przejrzeć). Do rejestru `GRUPY` w `frontend/lib/przelaczenie/grupy.ts`
   trzeba dodać ekrany o trasach poligonu `/nowy-front/kursy` (stara trasa i nowa
   `/panel/kursy`, panel `uczestnik`) oraz `/nowy-front/profil` (stara i nowa `/panel/profil`,
   panel `uczestnik`), z `wlaczona: false`. Nie dodawałem grupy, wpisu menu ani odnośnika.

## Czego nie zrobiono i dlaczego

- Grupa przełączenia, menu i odnośniki z innych ekranów — zostawione zespołowi, jak w poleceniu.
- Nie dodałem własnej walidacji w przeglądarce: stary formularz jej nie ma, wszystkie
  reguły sprawdza serwer (komunikaty pokazujemy tak jak dotąd).
- Nie zmieniałem wspólnych komponentów, więc pole formularza składam z atomów (`Label`,
  `Input`, `Hint`, `ErrorText`) zamiast z `Field`: `Field` nie przekazuje klawiatury
  numerycznej (PESEL, kod pocztowy), którą ma stary formularz.
- Po wyjściu z ekranu i powrocie karta eksportu zaczyna od „nie rozpoczęty”, bo serwer nie
  ma trasy listy eksportów (tak samo jak stary ekran).
- „Wróć do lekcji” na liście kursów odczytuje szczegóły kursu w toku (`GET /courses/{slug}`);
  to istniejąca trasa, ale na starej liście tego żądania nie było.
- Ścieżka „Przejdź do dalszej współpracy” z pulpitu nie jest powtórzona (wymagałaby
  dodatkowego odczytu `GET /me` na liście kursów).

## Drobne różnice względem starych ekranów (zachowanie zostaje)

- Kursy poza ścieżką zostają na liście (jak dotąd), na końcu; podlinia „Poza ścieżką · X% ukończone”.
- Przycisk „Przygotuj eksport” w trakcie przygotowywania jest niedostępny i mówi dlaczego
  (stary ekran pozwalał kliknąć i dostawał odmowę). Przy gotowym pliku „Przygotuj nowy
  eksport” jest niedostępny z powodem — serwer i tak odmówiłby.
- Dodany przycisk „Sprawdź ponownie”, gdy sprawdzanie stanu eksportu zatrzymał błąd
  (stary ekran zostawiał osobę bez wyjścia).
- Adres kursu z listy: `/panel/kursy/{slug}`, ten sam co na pulpicie i pod którym stoi
  nowa strona kursu po przełączeniu; strona podglądu `/nowy-front/kursy` prowadzi więc,
  do czasu przełączenia, na starą stronę kursu.

## Pytania otwarte

1. Czy lista kursów ma pokazywać kursy poza ścieżką (jak stary ekran), czy tylko ścieżkę (jak pulpit)?
2. Gdy serwer odpowie, że eksport już istnieje (po powrocie na ekran), możemy wznowić
   sprawdzanie na podstawie identyfikatora z odpowiedzi — to zmiana zachowania, więc czeka na decyzję.
3. Stary formularz wysyła puste imię i nazwisko do serwera; komunikat serwera dla pustego pola
   bywa niepolski. Czy dodać sprawdzenie w przeglądarce?
4. Gałąź nie zawiera dopisków o współautorstwie ani o narzędziu, zgodnie z poleceniem.
