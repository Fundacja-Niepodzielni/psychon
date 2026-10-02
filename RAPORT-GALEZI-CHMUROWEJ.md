# Raport gałęzi: test końcowy kursu w nowym wyglądzie

Gałąź: `chmura/test-uczestnika-nowy-wyglad`, utworzona z czubka `sprint-2`.
Ten plik jest tylko do przejęcia gałęzi i można go usunąć.

## Co zostało zrobione

Ekran testu końcowego dla osoby uczącej się, zbudowany z nowych elementów,
z tym samym działaniem co dotychczasowa strona `frontend/app/(uczestnik)/panel/kursy/[slug]/test/page.tsx`.

Nowe pliki (nic poza nimi się nie zmieniło):

- `frontend/nowy-front/test-uczestnika/dane.ts` — żądania do zaplecza i rozpoznawanie odpowiedzi z błędem.
- `frontend/nowy-front/test-uczestnika/logika.ts` — czysta logika: podejścia, zdania z odmianą liczebników, stan zielonego przycisku.
- `frontend/nowy-front/test-uczestnika/TestUczestnika.tsx` i `TestUczestnika.module.css` — ekran.
- `frontend/nowy-front/test-uczestnika/TestUczestnikaZAdresu.tsx` — tryb podglądu z adresu, tak samo jak na stronie kursu.
- `frontend/nowy-front/test-uczestnika/__tests__/` — 6 plików prób, 58 prób.
- `frontend/app/nowy-front/kurs-uczestnika/[slug]/test/page.tsx` — strona podglądu.

Układ jest taki sam jak na ekranie lekcji: odnośnik „Wróć do kursu”, tytuł „Test końcowy”
z nazwą kursu pod nim i jeden zielony przycisk. Na szerokim ekranie przycisk stoi przy
tytule, a na telefonie w stałym pasku u dołu. Nieczynny przycisk jest jasny, ma kłódkę
i zostaje w kolejności klawisza Tab, a zdanie obok zawsze mówi, dlaczego jest nieczynny.
Odmowy i „nie znaleziono” pokazuje wspólny ekran odmowy. Daty idą przez wspólny formater,
a odmiana liczebników przez wspólną funkcję odmiany. Używam tylko jasnego motywu.

## Pomiar dotychczasowego ekranu

Żądania, które robi dotychczasowy ekran, i pola, które z nich czyta:

| Metoda | Trasa | Pola |
|---|---|---|
| GET | `/courses/{slug}/test` | `test_id`, `pass_threshold`, `attempts_used`, `attempts_limit`, `questions[].id`, `questions[].body`, `questions[].answers[].id`, `questions[].answers[].body` |
| GET | `/tests/{id}/attempts` | `attempt_number`, `score_percent`, `passed`, `created_at` |
| POST | `/tests/{id}/attempts` z `{ answers: { id pytania: id odpowiedzi } }` | `attempt_number`, `score_percent`, `passed`, `wrong_question_ids` |

Limit podejść ekran bierze z odczytu testu (`attempts_limit`). Ustala go zaplecze
z ustawień edycji albo z nadpisania dla kursu, więc nie jest to stała 3.

Stany dotychczasowego ekranu: ładowanie; kurs zamknięty kolejnością ścieżki; odmowa
dostępu; błąd z ponowieniem; ekran przed startem (pytania, próg, wykorzystane
i pozostałe podejścia, zdanie o przebiegu, przycisk „Rozpocznij test”, który jest
nieczynny bez podejść, i zdanie o resecie limitu); pytanie po pytaniu bez cofania,
z przejściem dalej dopiero po zaznaczeniu odpowiedzi; wysyłanie; wynik (procent, próg,
zaliczony albo niezaliczony, pozostałe podejścia, pytania z błędną odpowiedzią,
„Podejdź ponownie”); historia podejść.

## Co nowy ekran robi inaczej i dlaczego

1. **Jeden dodatkowy odczyt istniejącej trasy: `GET /courses/{slug}`.** Czytają ją już
   strona kursu i ekran lekcji. Nowy ekran bierze z niej tylko nazwę kursu do nagłówka,
   numer kursu (powrót z podglądu), `has_test` i liczbę nieukończonych lekcji.
   Gdy ten odczyt się nie uda, test działa dalej, a w nagłówku po prostu nie ma nazwy kursu.
   Nowych tras nie ma.
2. **Kurs bez testu.** Zaplecze na `GET /courses/{slug}/test` odpowiada tym samym 404
   dla kursu bez testu i dla kursu, którego nie ma. Rozróżnia to dopiero `has_test`
   z odczytu kursu. Dotychczasowy ekran pokazywał w obu przypadkach błąd z ponowieniem.
3. **Test zamknięty, bo lekcje nie są ukończone** (422 `conditions_not_met`). Dotychczas
   był to ogólny błąd, a teraz to osobny stan z liczbą lekcji, które zostały do ukończenia.
4. **Brak podejść zgłoszony przez serwer przy wysyłaniu** (403 `attempts_exhausted`).
   Dotychczas był pusty „Wynik testu” z komunikatem, a teraz stan „Nie masz już podejść”
   ze zdaniem serwera.
5. **Okno potwierdzenia przed wysłaniem** mówi, ile pytań zostało bez odpowiedzi
   i że wysłanie zużywa jedno podejście.
6. **Test bez pytań:** „Rozpocznij test” jest nieczynny, a zdanie obok mówi dlaczego.
   Dotychczas dało się wejść w pusty przebieg.
7. **Zdanie o resecie limitu** odsyła teraz do zespołu programu, w formie neutralnej płciowo.
8. **Tryb podglądu** (parametr podglądu i konto zespołu). Pytania można przejrzeć,
   a wysłanie jest nieczynne ze zdaniem „W trybie podglądu odpowiedzi nie są wysyłane.”

## Polecenia i wyniki

Wszystkie w katalogu `frontend/`.

| Polecenie | Przed zmianą | Po zmianie |
|---|---|---|
| `npm run test` | 481 plików, 6037 prób zaliczonych, 1 pominięta, 0 czerwonych | 487 plików, 6093 próby zaliczone, 1 pominięta, **2 czerwone** (patrz niżej) |
| `npm run sprawdz-typy` | — | 0 błędów |
| `npm run lint` | — | 0 błędów, 10 ostrzeżeń, wszystkie w plikach, których ta gałąź nie zmienia |
| `npm run build` | — | zakończone powodzeniem, 102 trasy, w tym nowa `/nowy-front/kurs-uczestnika/[slug]/test` |
| próby samego ekranu (`npx vitest run nowy-front/test-uczestnika`) | — | 6 plików, 58 prób, wszystkie zaliczone |

Sprawdzenia typów i lintu nie uruchamiałem przed zmianą. Wszystkie 10 ostrzeżeń lintu
jest w plikach spoza tej gałęzi.

W jednym pełnym przebiegu, puszczonym równolegle z budową, padła jeszcze próba
`nowy-front/karta-osoby/__tests__/karta-osoby-prowadzacy.test.tsx` („rola … widzi sekcję
i pobiera kandydatów”). Ta gałąź tego pliku nie dotyka. Uruchomiona osobno przeszła
3 razy na 3, a w kolejnym pełnym przebiegu bez budowy obok też przeszła. Wygląda na
wyścig czasowy pod obciążeniem.

Układ sprawdziłem w przeglądarce, przy 390 px i 1280 px szerokości, na tymczasowym
stanowisku poza repozytorium z danymi przykładowymi. Stany: przed startem, w trakcie,
okno potwierdzenia, wynik, brak podejść, lekcje nieukończone i kurs bez testu.
W żadnym z nich strona nie przewija się w poziomie.

## Czego nie zrobiłem i dlaczego

- **Grupy przełączenia, wpisu w menu ani odnośników z innych ekranów** nie dodałem,
  zgodnie z poleceniem. Skutek: dwie próby w `frontend/lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts`
  („każdy ekran nowego frontu należy do jakiejś grupy rejestru” i „przypadek odwrotny…”)
  są czerwone. Każda strona pod `/nowy-front/…` musi mieć wpis w rejestrze grup
  (`frontend/lib/przelaczenie/grupy.ts`), a tego katalogu nie wolno mi było zmieniać.
  Gdy zespół doda wpis, obie próby się zazielenią. Stronę podglądu dodałem osobnym
  ostatnim commitem z kodem (`b2144f6`), więc można go cofnąć, jeśli gałąź ma być
  zielona przed dodaniem wpisu. Przez te dwie próby przebieg CI na tej gałęzi będzie czerwony.
- **Plików `WYTYCZNE-PRACY.md` i `frontend/CLAUDE.md` nie ma w repozytorium.** Przeczytałem
  `AGENTS.md`, `frontend/AGENTS.md`, `DESIGN.md` i `frontend/AUDYT-DOSTEPNOSCI.md`.
- **Wspólnego paska potwierdzenia nie ma już w repozytorium.** Usunięto go wcześniej,
  a potwierdzenia po zapisie idą teraz istniejącym powiadomieniem. Do pytania przed
  wysłaniem użyłem wspólnego okna potwierdzenia, tak jak inne pytania potwierdzające
  w nowym froncie.
- **W systemie projektowym nie ma elementu wyboru jednej odpowiedzi.** Odpowiedzi to
  zwykłe pola wyboru jednej opcji w grupie z podpisem pytania, tak jak na dotychczasowym
  ekranie. Wygląd biorą z tokenów.

## Pytania otwarte

1. Przebieg jest taki sam jak dotychczas: dalej przechodzi się dopiero po zaznaczeniu
   odpowiedzi. Dlatego okno potwierdzenia pokaże dziś zawsze „Bez odpowiedzi: 0 pytań”.
   Czy pozwolić pomijać pytania? To byłaby zmiana zachowania.
2. Czy dodatkowy odczyt `GET /courses/{slug}` (nazwa kursu, kurs bez testu) jest w porządku?
3. Jak dotychczas, do zaliczonego już testu można podejść ponownie, co zużywa podejście.
   Czy ekran ma o tym ostrzegać?
4. Czy element wyboru jednej odpowiedzi ma trafić do systemu projektowego?
5. Czy w trybie podglądu zespół ma widzieć pytania testu? Dziś je widzi, ale nic nie wysyła.

Uwag dotyczących bezpieczeństwa nie mam.
