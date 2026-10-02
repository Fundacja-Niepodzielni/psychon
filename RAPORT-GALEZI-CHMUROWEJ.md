# Raport gałęzi: dziennik działań w nowym wyglądzie

Gałąź: `chmura/dziennik-dzialan-nowy-wyglad`, wyprowadzona z `sprint-2` (commit `1d03784`).
Ten plik zostanie usunięty przy przejęciu gałęzi.

## Co zostało zrobione

### Pomiar

`frontend/nowy-front/dziennik-dzialan/POMIAR.md` opisuje stan przed zmianą:

- wszystkie 34 kody zdarzeń z 42 miejsc zapisu i podmiot każdego kodu (czyja to rzecz);
- klucze ładunku;
- co pokazuje stary ekran;
- jakie filtry i rozmiary stron przyjmowało zaplecze;
- format starego eksportu.

Dwa ustalenia z pomiaru:

- **Stronicowanie już było.** Lista miała strony po 25 wpisów (najwyżej 100) i liczbę wszystkich
  wpisów, a stary ekran z tego korzystał. „Najwyżej 100 wierszy” to górna granica jednej strony,
  nie brak stron.
- **Filtr „Do” gubił ostatni dzień.** Sama data znaczyła północ tego dnia, więc wpisy z dnia
  „Do” nie wchodziły do wyniku. Poprawione.

### Zaplecze

- **Nowa klasa `backend/app/Services/H20/AuditLogMap.php`:**
  - siedem grup: „Konta i role”, „Nabór”, „Kursy i testy”, „Staż i dyżury”, „Superwizja”,
    „Dokumenty i certyfikaty”, „Inne”;
  - każdy z 34 kodów należy do dokładnie jednej grupy i ma jedno zdanie po polsku. Zdanie zaczyna
    się czynnością z zamkniętej listy, np. „Zatwierdzono dyżur”, „Wydano certyfikat”;
  - dla każdego typu podmiotu: czyja to rzecz i jak się nazywa.
- **„Kogo dotyczy” w każdym wpisie (pole `subject`):**
  - osoba z imieniem, nazwiskiem i identyfikatorem konta (do odnośnika na kartę osoby) — także
    dla rzeczy należących do osoby: wpisu stażu, podejścia do testu, certyfikatu, dokumentu,
    profilu psychologa, dokumentu profilu, zapisu na superwizję, przypisania superwizora;
  - osoba ze zgłoszenia rekrutacyjnego bez konta: imię i nazwisko bez identyfikatora;
  - wpis o kursie albo lekcji: tytuł kursu, przy zmianie lekcji także jej tytuł;
  - edycja, dokument prawny, ustawienia: czytelna nazwa;
  - nieznany typ: „Inny obiekt systemu” — nigdy typ techniczny i numer.

  Nazwy liczone są paczką dla całej strony: stała liczba zapytań, niezależna od liczby wierszy.
- **Nowe filtry:**
  - `group` — grupa zdarzeń;
  - `subject_user_id` — osoba, której wpis dotyczy, razem z jej rzeczami;
  - `subject_search` — ta osoba po imieniu i nazwisku, także ze zgłoszenia bez konta;
  - `actor_search` — wykonawca po imieniu i nazwisku.

  Dotychczasowe filtry `action`, `user_id`, `from` i `to` zostają.
- **Strony:** `page` i `per_page` mają reguły jak na innych listach administracji (strona od 1,
  od 1 do 100 wpisów).
- **Eksport:** te same filtry co lista, nagłówek z nazwami kolumn ekranu
  (`Kiedy;Rodzaj;Co;Kogo dotyczy;Kto`) i czytelne wartości:
  - data i godzina po polsku w czasie polskim;
  - grupa;
  - zdanie z nazwą rzeczy;
  - „kogo dotyczy” — osoba albo nazwa rzeczy;
  - wykonawca, a gdy go nie ma — „System”.

  Bez ładunku zdarzenia, bez kodów i bez numerów. Nazwa pliku, znacznik BOM i separator `;` bez
  zmian.
- **Dostęp bez zmian:** te same trasy i te same role.

### Front

- `frontend/lib/api/h20-dziennik.ts` — nowe typy i funkcje odczytu listy i pobrania pliku.
  Dotychczasowy `h20.ts` jest bez zmian.
- `frontend/nowy-front/dziennik-dzialan/` — ekran ze słownikiem zdań `slownik.ts`, danymi
  `dane.ts`, listą wpisów `TabelaWpisow.tsx`, odczytem parametru z adresu
  `DziennikDzialanZAdresu.tsx`, stylami i testami.
- `frontend/app/nowy-front/admin/dziennik/page.tsx` — strona podglądu. Bez grupy przełączenia,
  bez wpisu w menu i bez odnośników z innych ekranów.

Ekran:

- **Szablon i nagłówek:** ten sam szablon listy i nagłówek co „Osoby” i „Sprawy”. Tytuł „Dziennik
  działań”, pod nim zdanie „Dziennik pokazuje, kto i kiedy wykonał w systemie ważne czynności.
  Nie zapisujemy w nim treści danych.”
- **Kolumny:**
  - „Kiedy” — wspólny formater dat;
  - „Co” — grupa jako plakietka, pogrubione zdanie i nazwa rzeczy;
  - „Kogo dotyczy” — osoba jako odnośnik do karty albo tytuł kursu;
  - „Kto”.
- **Filtry:**
  - „Od” i „Do” z gotowymi zakresami: „Dziś”, „Ostatnie 7 dni”, „Ten miesiąc” oraz „Cały rok
    programu” z dat edycji;
  - „Rodzaj” — grupy;
  - „Kogo dotyczy” i „Kto” — szukanie po imieniu i nazwisku.
- **Zmiana filtra:** lista odczytuje się od razu, a pola wyszukiwania po chwili przerwy w pisaniu
  albo po Enter. Fokus zostaje w polu, a czytnik ekranu słyszy „Pokazano 25 z 482 wpisów” (odmiana
  ze wspólnego pomocnika).
- **Wejście z karty osoby:** adres z `?dotyczy=<id>` pokazuje znacznik „Dotyczy: Imię Nazwisko ×”.
  Przycisk × zdejmuje filtr i parametr z adresu. Imię i nazwisko pochodzi z wczytanych wpisów,
  bez dodatkowego odczytu karty osoby.
- **Licznik i strony:** licznik „Na tej stronie: 25 z 482” i wspólne stronicowanie.
- **Poniżej 640 px** każdy wpis jest blokiem: „Co” (pogrubione, z plakietką), „Kogo dotyczy: …”,
  „Kto · kiedy”. Nic nie przewija się w bok.
- **Pobranie:** „Pobierz to, co widać (Excel)” z uwagą „Plik zawiera nazwiska. Nie wysyłaj go poza
  Fundację.” Pobiera plik z bieżącymi filtrami, ze wszystkich stron.
- **Stany:** ładowanie, błąd, brak połączenia, brak dostępu i nie znaleziono (wspólny ekran
  odmowy), pusty dziennik, brak wyników filtra („Nic nie pasuje do filtrów.” i „Wyczyść
  filtry”), lista, lista zawężona do osoby, ostatnia strona. Każdy ma test.

## Zmiany odpowiedzi serwera

1. Wpis listy `GET /admin/audit` ma dwa nowe pola:
   - `group` (`key`, `label`);
   - `subject` (`person`: `id` albo `null`, `first_name`, `last_name`; `label`).

   Pola `subject_type`, `subject_id` i `details` zostają bez zmian, bo czyta je dotychczasowy
   ekran dziennika.
2. Nowe parametry: `group`, `subject_user_id`, `subject_search`, `actor_search`. Nieznana grupa
   daje 422.
3. `page` i `per_page` są sprawdzane: `per_page` spoza zakresu 1–100 albo `page` mniejsze od 1
   daje 422. Dotąd wartość była po cichu obcinana.
4. Sama data w `to` obejmuje cały ten dzień.
5. Eksport `GET /admin/audit/export.csv` ma nowy nagłówek i nowe kolumny (opis wyżej), bez
   `id`, `action`, `actor_id`, `subject_type`, `subject_id`, `details` i daty technicznej. Zmiana
   dotyczy też przycisku „Eksport CSV” na dotychczasowym ekranie, bo to ta sama trasa.

Dokumentu kontraktu ani `backend/openapi.json` nie zmieniano. Opis tych tras w `openapi.json`
nie zna nowych pól i parametrów.

## Minimalizacja danych

Nowy ekran i nowy eksport nie pokazują ładunku zdarzenia. Lista nadal wysyła `details` w całości,
bo pokazuje je dotychczasowy ekran (kolumna „Szczegóły”). Wartości i tekst wpisany ręcznie
w ładunku:

- `reason` w `user.blocked`, `certificate.revoked` i `attempts.reset` — tekst wpisany ręcznie;
- `score_percent` i `passed` w `attempt.finished`;
- `attendance_before` i `attendance_after` w `supervision.attendance_marked`;
- daty dostępu w `access.extended`;
- `role` w `user.created` i `application.accepted`;
- numery dokumentów w `certificate.issued`, `certificate.revoked` i `document.generated`;
- wartości ustawień w `notification_settings.updated`;
- `status` w `cooperation_request.answered`;
- listy identyfikatorów w starszych wpisach `course.updated`.

Pól nie usunięto z odpowiedzi listy, bo potrzebuje ich dotychczasowy ekran. Treści pytań ani
danych o zdrowiu dziennik nie zapisuje.

## Uruchomione polecenia i wyniki

„Przed” to czysty `sprint-2`, „po” to ostatni stan gałęzi.

| Polecenie | Przed | Po |
|---|---|---|
| Testy zaplecza (cały zestaw) | 2051 testów: 1704 zaliczone, 2 niezaliczone, 345 błędów | 2070 testów: 1723 zaliczone, 2 niezaliczone, 345 błędów |
| Testy zaplecza dziennika (`tests/Feature/H20/AuditTest.php`, `AuditSubjectsTest.php`, `tests/Unit/H20`) | — | 30 z 30 zaliczonych |
| Formatowanie zaplecza (Pint) na zmienionych plikach | — | bez uwag |
| `npm run sprawdz-typy` | 0 błędów | 0 błędów |
| `npm run lint` | 0 błędów, 10 ostrzeżeń | 0 błędów, 10 ostrzeżeń (żadne w nowych plikach) |
| `npm run test` | 481 plików, 6038 testów: 6037 zaliczonych, 1 pominięty | 484 pliki, 6082 testy: 6079 zaliczonych, 2 niezaliczone, 1 pominięty |
| `npm run build` | sukces, 72 strony | sukces, 73 strony (nowa `/nowy-front/admin/dziennik`) |

Nowe testy: 19 w zapleczu (6 jednostkowych słownika grup i zdań, 13 funkcjonalnych „kogo
dotyczy”, filtrów, stron i eksportu) i 42 we froncie (słownik, dane, stany ekranu).

### Zaplecze — czerwień niezależna od tej zmiany

345 błędów to testy, które potrzebują klucza aplikacji (szyfrowanie). W tym środowisku klucz
istnieje tylko w pliku środowiskowym, którego ta gałąź nie tworzy ani nie czyta. Dwa niezaliczone
testy (`ProfileTest`) padają z tego samego powodu. Liczba i lista tych testów są identyczne przed
zmianą i po niej.

Wśród nich jest `CsvFormulaExportsTest::test_audit_export_neutralises_the_actor_name`, którego
oczekiwany wiersz eksportu zmieniłem na nowe kolumny. Lokalnie nie da się go uruchomić. To samo
sprawdzenie, bez szyfrowania, robi nowy `AuditSubjectsTest::test_export_neutralises_a_formula_in_the_names`
— przechodzi.

W `AuditTest::test_export_csv_uses_the_shared_csv_helper` oczekiwany nagłówek zmienił się z
technicznego na nagłówek ekranu. Sprawdzenie jest tak samo ścisłe (dokładny nagłówek i brak kodu
zdarzenia w pliku).

### Front — oczekiwana czerwień

Dwa niezaliczone testy są w `frontend/lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts`:
„każdy ekran nowego frontu należy do jakiejś grupy rejestru” i „przypadek odwrotny…”. Strona
`/nowy-front/admin/dziennik` nie należy jeszcze do żadnej grupy. Wpis do dodania
w `frontend/lib/przelaczenie/grupy.ts`:

```ts
dziennikDzialan: {
  klucz: "dziennikDzialan",
  wlaczona: false,
  ekrany: [
    {
      panel: "administracja",
      staraTrasa: "/admin/dziennik",
      nowaTrasa: "/admin/dziennik",
      trasaPoligonu: "/nowy-front/admin/dziennik",
    },
  ],
},
```

Przyrząd `design-system/szablony/__tests__/niezapisane-zmiany-zrodla.test.ts` przechodzi. Filtry
dziennika nie są pracą do utracenia, więc ekran nie zgłasza się do pytania o niezapisane zmiany
i nie potrzebuje wpisu na liście.

Po drodze przyrząd `nowy-front/sprawy/__tests__/wiek.test.ts` złapał własną stałą doby
w `dane.ts`. Poprawione: dni liczy wyłącznie wspólny moduł dat.

### Przy 320, 390 i 1280 px

Sprawdzone na zbudowanym ekranie, z odpowiedziami serwera podstawionymi w przeglądarce, w tym
z bardzo długim nazwiskiem. Szerokość przewijania równa szerokości okna przy każdej z trzech
szerokości.

## Środowisko — co zrobiono, żeby uruchomić testy zaplecza

- W środowisku jest PHP 8.3, a plik blokady zależności wymaga 8.4. Zależności zainstalowano
  z lokalnej, nieśledzonej kopii pliku blokady, w której:
  - paczki Symfony obniżono do 7.4 (zgodnych z 8.3);
  - pominięto narzędzie analizy statycznej (nie dało się go pobrać).

  Pliki repozytorium (`composer.json`, `composer.lock`) są bez zmian. Testy biegły więc na
  Symfony 7.4, nie 8.1.
- Analizy statycznej (Larastan) nie uruchomiono.
- Baza testowa: lokalny PostgreSQL 16 z nazwą, użytkownikiem i hasłem z `backend/phpunit.xml`.

## Czego nie zrobiono i dlaczego

- Grupy przełączenia, wpisu w menu ani odnośnika z karty osoby nie dodano — zgodnie
  z poleceniem. Odnośnik z karty osoby ma prowadzić na `…/dziennik?dotyczy=<id>`.
- Zapisu pobrań do dziennika nie dodano ani nie zmieniano.
- Pól ładunku z listy nie usunięto (powód wyżej).
- `openapi.json` i dokument kontraktu bez zmian.
- Testy wymagające klucza aplikacji nie zostały uruchomione (powód wyżej).

## Pytania otwarte

1. **Eksport ma pięć kolumn, ekran cztery.** Grupa, która na ekranie jest plakietką w „Co”,
   w pliku jest osobną kolumną „Rodzaj”, żeby dało się po niej filtrować w arkuszu. Zostawić tak
   czy połączyć z „Co”?
2. **Przydział niejednoznacznych kodów do grup.**
   - Profile psychologa i prośby o dalszą współpracę są w „Inne”.
   - Wgląd w dokument wrażliwy, w tym skan dyplomu ze zgłoszenia, jest w „Dokumenty i
     certyfikaty”.
   - Warsztat jest w „Kursy i testy”.
   - Zmiana dokumentu prawnego i jego akceptacja są w „Dokumenty i certyfikaty”.

   Czy taki podział pasuje?
3. **Odwołany termin superwizji „dotyczy” prowadzącego** (właściciela terminu), nie osób
   zapisanych. Wpis zawiera tylko liczbę zwolnionych zapisów, nie ich listę.
4. **Akceptacja dokumentu prawnego** ma w „Kogo dotyczy” nazwę dokumentu. Osoba, która
   akceptuje, jest w „Kto”, więc filtr „dotyczy osoby” jej nie obejmuje.
5. **„Zmieniono dane konta”** obejmuje każdą zmianę konta, także zmianę roli. Rozróżnienie
   wymagałoby czytania nazw zmienionych pól z ładunku. Zostawić jedno zdanie?
6. **Pola daty** pokazuje kontrolka przeglądarki, więc zapis daty w polu zależy od języka
   przeglądarki. Na liście daty idą przez wspólny formater.
7. **Wspólny ekran odmowy** mówi „Jesteś zalogowany jako …” (forma męska). Nie zmieniono go —
   jest we wspólnym katalogu.
