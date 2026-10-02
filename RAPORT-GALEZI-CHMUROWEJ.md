# Raport gałęzi: pytania testu końcowego w nowym wyglądzie

Gałąź: `chmura/pytania-testu-nowy-wyglad`, utworzona z czubka `sprint-2`.
Ten plik jest tylko do przejęcia gałęzi i można go usunąć.

## Co zostało zrobione

Ekran „Pytania testu” (pytania testu końcowego kursu) w nowym wyglądzie. Jeden komponent
obsługuje panel administracji i panel prowadzącego. Działa tak samo jak dotychczasowe strony
`frontend/app/(administracja)/admin/testy/[id]/pytania/page.tsx` i
`frontend/app/(prowadzacy)/prowadzacy/testy/[id]/pytania/page.tsx`.

Nowe pliki (poza nimi nic się nie zmieniło):

- `frontend/nowy-front/pytania-testu/POMIAR-STAREGO-EKRANU.md` — pomiar dotychczasowego ekranu:
  żądania i pola, reguły odpowiedzi, komunikaty walidacji, stany i różnice między panelami.
- `frontend/nowy-front/pytania-testu/dane.ts` — cztery żądania i rozpoznawanie błędów.
- `frontend/nowy-front/pytania-testu/logika.ts` — czysta logika: reguły odpowiedzi, walidacja
  z błędami przy polach, odmiana liczebników, zdania ekranu.
- `frontend/nowy-front/pytania-testu/PytaniaTestu.tsx`, `FormularzPytania.tsx`, `PytaniaTestu.module.css` — ekran.
- `frontend/nowy-front/pytania-testu/__tests__/` — 6 plików, 52 próby.
- `frontend/app/nowy-front/admin/testy/[id]/pytania/page.tsx` i
  `frontend/app/nowy-front/prowadzacy/testy/[id]/pytania/page.tsx` — dwie strony podglądu.

Jak wygląda ekran:

- Szablon szczegółu jak na ekranie kursu administracji, nagłówek z okruszkami „Kursy › Pytania testu”
  i opisem „Test końcowy · 3 pytania”, z poprawną odmianą liczebnika.
- Lista pytań. Każde pytanie ma numer, rodzaj („Wybór jednej odpowiedzi”), krótką treść
  (do 120 znaków) i liczbę odpowiedzi. Przyciski „Edytuj” i „Usuń” mają nazwy „Edytuj pytanie N”
  i „Usuń pytanie N”.
- Jeden zielony przycisk „Dodaj pytanie” w nagłówku. Gdy formularz jest otwarty, zielony jest
  tylko „Zapisz pytanie”. Przyciski innych pytań są wtedy nieczynne, a zdanie przy liście mówi dlaczego.
- Formularz ma treść pytania, odpowiedzi z wyborem jednej odpowiedzi poprawnej, „Dodaj odpowiedź”
  i „Usuń odpowiedź N”. Przy dwóch odpowiedziach usuwanie jest nieczynne ze zdaniem dlaczego.
  Błędy stoją przy polach, a fokus idzie na pierwsze pole z błędem.
- Usunięcie pytania pyta we wspólnym oknie potwierdzenia, co zniknie: treść, liczba odpowiedzi
  i odpowiedź poprawna, oraz że wyniki wcześniejszych podejść zostają.
- Po zapisie i po usunięciu potwierdzenie pokazuje wspólne powiadomienie. Niezapisane zmiany
  zgłaszam do wspólnego pytania przed wyjściem z ekranu. Odmowa i „nie znaleziono testu” idą
  przez wspólny ekran odmowy.
- Zmiany kolejności pytań nie ma, bo dotychczasowy ekran też jej nie miał.

Obie strony podglądu montują ten sam ekran i wysyłają te same żądania. Różnią się tylko
okruszkami i powrotem (`/admin/kursy` albo `/prowadzacy/kursy`). Nowych tras nie ma, a kto
może co, nadal rozstrzyga serwer. Prowadzący dostaje dziś od serwera odmowę i widzi wspólny
ekran odmowy, tak jak w dotychczasowym ekranie.

## Polecenia i wyniki

Wszystkie w katalogu `frontend/`.

| Polecenie | Przed zmianą | Po zmianie |
|---|---|---|
| `npm run sprawdz-typy` | 0 błędów | 0 błędów |
| `npm run lint` | 0 błędów, 10 ostrzeżeń | 0 błędów, te same 10 ostrzeżeń (wszystkie w plikach spoza gałęzi) |
| `npm run build` | przeszło, 101 tras | przeszło, 103 trasy (dwie nowe strony podglądu) |
| `npm run test` | 481 plików, 6037 prób zaliczonych, 1 pominięta | 487 plików, 6086 zaliczonych, 1 pominięta, **3 czerwone** (zapowiedziane, niżej) |
| próby samego ekranu | — | 6 plików, 52 próby, wszystkie zaliczone |

Układ sprawdziłem w przeglądarce przy szerokości 390 px i 1280 px, na tymczasowym stanowisku
poza repozytorium z danymi przykładowymi. Sprawdziłem siedem widoków: lista, dodawanie,
błędy walidacji, edycja, okno usuwania, brak pytań i odmowa. W żadnym strona nie przewija się
w poziomie, a strona nie zgłosiła żadnego błędu.

## Czerwone próby i wpisy, które musi dodać zespół

1. `frontend/lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts` — dwie próby: „każdy ekran
   nowego frontu należy do jakiejś grupy rejestru” i „przypadek odwrotny…”. Brakujący wpis to
   grupa w `frontend/lib/przelaczenie/grupy.ts`, na przykład wyłączona grupa `pytaniaTestu`
   z dwoma ekranami:

   ```ts
   pytaniaTestu: {
     klucz: "pytaniaTestu",
     wlaczona: false,
     ekrany: [
       { panel: "administracja", staraTrasa: "/admin/testy/[id]/pytania", nowaTrasa: "/admin/testy/[id]/pytania", trasaPoligonu: "/nowy-front/admin/testy/[id]/pytania" },
       { panel: "prowadzacy", staraTrasa: "/prowadzacy/testy/[id]/pytania", nowaTrasa: "/prowadzacy/testy/[id]/pytania", trasaPoligonu: "/nowy-front/prowadzacy/testy/[id]/pytania" },
     ],
   },
   ```

2. `frontend/design-system/szablony/__tests__/niezapisane-zmiany-zrodla.test.ts` — próba
   „zgłoszenia stoją wyłącznie w plikach z listy (lista jest pełna)”. Brakujący wpis na liście
   `PLIKI_ZGLASZAJACE`: `"nowy-front/pytania-testu/PytaniaTestu.tsx"`.

## Co nowy ekran robi inaczej i dlaczego

- Błędy walidacji stoją przy polach, których dotyczą, i pokazują się wszystkie naraz.
  Dotychczas był jeden komunikat nad formularzem z pierwszym błędem. Zdania są te same.
- „Nie ma testu” (404) i „brak połączenia” to osobne stany. Dotychczas oba były ogólnym błędem
  z ponowieniem. Odmowa (403) jest jak dotąd, bez ponowienia.
- Zapis bez odpowiedzi serwera mówi o internecie, a nie „Nie udało się dodać pytania.”
- Formularz dodawania otwiera się przyciskiem „Dodaj pytanie” i zamyka po zapisie. Dotychczas
  stał zawsze pod listą i po zapisie zostawał pusty.
- Gdy formularz jest otwarty, nie da się przejść do edycji innego pytania. Dotychczas otwarcie
  innego pytania po cichu porzucało zmiany.
- Usuwanie pyta we wspólnym oknie zamiast w oknie przeglądarki.
- Lista pokazuje liczbę odpowiedzi, a nie wszystkie odpowiedzi. Odpowiedź poprawną widać w formularzu edycji.
- Strona przyjmuje opcjonalny parametr adresu `kurs` z numerem kursu. Wtedy w okruszkach
  pojawia się „Kurs”, który prowadzi do tego kursu. Bez parametru okruszki są takie jak dotąd:
  odpowiedź listy pytań nie niesie kursu, a nowego żądania nie dodałem.

## Czego nie zrobiłem i dlaczego

- Grupy przełączenia, wpisu w menu ani odnośników z innych ekranów nie dodałem, zgodnie
  z poleceniem. Stąd trzy czerwone próby powyżej.
- Przycisk potwierdzenia w oknie usuwania nie ma wariantu „niebezpieczny”. We wspólnym przycisku
  systemu projektowego ten wariant na zielonym tle daje czerwony tekst, a to jest prawie
  nieczytelne. Systemu projektowego nie wolno mi było zmieniać. Ten sam wariant jest dziś
  używany na trzech innych nowych ekranach.
- W systemie projektowym nie ma elementu wyboru jednej opcji. Odpowiedź poprawną wskazuje zwykłe
  pole wyboru jednej opcji, tak jak dotychczas, ostylowane tokenami.
- Pole `Field` nie przyjmuje limitu długości, więc pola stoją na atomach (etykieta, pole, błąd).
  Limit 2000 i 1000 znaków działa tak jak dotąd.

## Pytania otwarte

1. Czy dodać do zasobu listy pytań kurs testu, żeby okruszki zawsze prowadziły do kursu?
   To zmiana zaplecza i kontraktu. Dziś działa to tylko z parametrem `kurs` w adresie.
2. Panel prowadzącego dostaje od serwera odmowę. Czy prowadzący ma zarządzać pytaniami? Dziś
   serwer daje bank pytań tylko administracji, a ekran tego nie zmienia.
3. Numer pytania to pozycja nadana przez serwer, więc po usunięciu w numeracji zostaje luka,
   tak jak dotąd. Czy numerować kolejno?
4. Czy poprawić wariant „niebezpieczny” przycisku głównego w systemie projektowym?
5. Czy element wyboru jednej opcji ma trafić do systemu projektowego?

Uwag dotyczących bezpieczeństwa nie mam.
