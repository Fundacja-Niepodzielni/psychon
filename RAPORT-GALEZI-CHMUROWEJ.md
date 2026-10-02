# Raport gałęzi `chmura/certyfikat-dokumenty-nowy-wyglad`

Data: 2026-10-02. Gałąź odchodzi od końca `sprint-2`. Plik zniknie przy przejęciu gałęzi.

## Co zrobiono

Ekrany „Certyfikat” i „Dokumenty” uczestnika odtworzono z klocków nowego wyglądu. Stare strony
(`/panel/certyfikat`, `/panel/dokumenty`) zostały nietknięte.

1. **Pomiar starych ekranów** — `frontend/nowy-front/certyfikat-dokumenty/POMIAR-STAREGO-EKRANU.md`:
   każde żądanie (metoda, ścieżka, czytane pola), każde pobranie i każdy stan obu starych stron.
2. **Ekran „Certyfikat”** (`Certyfikat.tsx`): szablon listy z nagłówkiem strony.
   - Lista czterech warunków prostym językiem, zrobiona wyłącznie z danych, które serwer już
     zwraca: „Masz 41,5 z 72 godzin.”, „Warsztat jeszcze niezaliczony.”, plakietka „Spełniony” albo
     „Brakuje”, zdanie „Spełniasz 2 warunki z 4.”, wiersz „Zaliczone testy”. Nic nie jest liczone po
     stronie ekranu (ani brakujące godziny, ani procenty).
   - Jeden zielony przycisk w nagłówku: „Wygeneruj certyfikat” → po zleceniu „Pobierz certyfikat (PDF)”.
     Gdy warunki nie są spełnione, przycisk jest widoczny, ale niedostępny, z powodem pod nagłówkiem;
     jego kliknięcie niczego nie wysyła, tylko przenosi uwagę na listę braków.
   - Trzy odnośniki do ekranów źródłowych jak na starej stronie (kursy, dziennik stażu, superwizje).
3. **Ekran „Dokumenty”** (`Dokumenty.tsx`): szablon listy. Lista wydanych dokumentów (nazwa, numer,
   data wydania, pobranie) oraz lista dokumentów do wygenerowania z powodem niedostępności i
   przejściem do profilu — tak jak karty rodzajów na starej stronie.
4. **Wspólne stany** (`EkranStanu.tsx`, `Komunikat.tsx`): ładowanie, błąd, brak połączenia, brak
   dostępu i „nie znaleziono” (wspólny ekran odmowy ze `wspolne/ekran-odmowy`), w tym samym szablonie
   co ekran z danymi. Daty przez wspólny formater, liczby dziesiętne przez wspólny formater, odmiana
   przez wspólny pomocnik.
5. **Strony podglądu**: `app/nowy-front/certyfikat/page.tsx` i `app/nowy-front/dokumenty/page.tsx`.
   Bez grupy przełączenia, bez wpisu w menu, bez odnośników z innych ekranów.
6. **Testy** (6 plików, 89 przypadków, wszystkie zielone): stany obu ekranów, żądania (te same trasy,
   metody, ciała i adres pobrania co na starych stronach), odmiana liczebników, dostępność (kontrola
   automatyczna we wszystkich stanach), struktura plików.

Żądania: nie dodano żadnej nowej trasy. Certyfikat: `GET /certificate/conditions`,
`POST /certificate/generate`, `GET /certificate/download` (z tokenem, bezpośrednio). Dokumenty:
`GET /documents`, `POST /documents/generate`, pobranie z podpisanego adresu z listy. Pobrania działają
dokładnie jak na starych stronach, łącznie z nazwami zapisywanych plików.

## Polecenia i liczby (w katalogu `frontend/`)

| Co | Polecenie | Wynik |
|---|---|---|
| Testy przed zmianami | `npm run test` | 481 plików, 6038 przypadków: 6037 zaliczonych, 1 pominięty, 0 niezaliczonych |
| Testy po zmianach | `npm run test` | 487 plików, 6131 przypadków: 6128 zaliczonych, **2 niezaliczone**, 1 pominięty |
| Same nowe testy | `npx vitest run nowy-front/certyfikat-dokumenty` | 6 plików, 89 przypadków, wszystkie zaliczone |
| Sprawdzenie typów | `npm run sprawdz-typy` | bez błędów |
| Lint | `npm run lint` | 0 błędów, 10 ostrzeżeń — wszystkie w istniejących plikach testowych, w nowych plikach 0 |
| Budowanie | `npm run build` | powodzenie; obie nowe trasy zbudowane jako statyczne |

Różnica 93 przypadków = 89 nowych + 4 przypadki istniejącej kontroli punktów orientacyjnych, która
sama obejmuje nowe trasy (wszystkie zaliczone).

**Dwa niezaliczone testy** — `lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts` („każdy ekran nowego
frontu należy do jakiejś grupy rejestru” i jego przypadek odwrotny). Test wymaga, żeby każda strona
pod `/nowy-front/` była wpisana w rejestr grup przełączenia, a rejestr leży w `lib/przelaczenie/` —
poza zakresem tej gałęzi, i polecenie wprost zabrania dodawania grupy przełączenia. Testu nie
osłabiałem ani nie pomijałem. Zniknie, gdy zespół doda grupę z trasami `/nowy-front/certyfikat` i
`/nowy-front/dokumenty` (tak samo wypadłby każdy nowy ekran dodany bez wpisu w rejestrze).

Dodatkowo obejrzano oba ekrany w przeglądarce testowej przy szerokości 390 px i 1280 px na lokalnie
uruchomionej zbudowanej aplikacji, z atrapami odpowiedzi serwera (bez sieci zewnętrznej): brak
przewijania w poziomie, układ i teksty zgodne z testami.

## Czego nie zrobiono i dlaczego

- **Daty wydania certyfikatu nie ma na ekranie.** Żądania starej strony jej nie zwracają, a polecenie
  zabrania nowych żądań i liczenia czegokolwiek, czego serwer nie zwraca. Z tego samego powodu ekran
  nie wie, czy certyfikat został już wydany: przycisk pobrania pojawia się po zleceniu w tej samej
  wizycie (tak jak na starej stronie), a po odświeżeniu znów jest „Wygeneruj certyfikat”.
- Nie dodano grupy przełączenia, wpisu w menu ani odnośnika z innych ekranów (zgodnie z poleceniem).
- Nie uruchamiano skryptów pomiarowych kontrastu i celów dotyku (`npm run pomiar:*`) ani testów
  przeglądarkowych z katalogu `e2e/`; dostępność sprawdzono automatyczną kontrolą w testach jednostkowych
  (bez kontrastu — tego środowisko testowe nie liczy) i wzrokowo na zrzutach.
- Nie sprawdzano pobierania plików w prawdziwej przeglądarce — tylko w testach jednostkowych.
- Nie dotykano tablicy statusów pakietów ani plików `DEMO/` (opisanych w `AGENTS.md`): ta gałąź jest
  gałęzią roboczą spoza trybu pakietowego.
- W repozytorium nie ma plików `WYTYCZNE-PRACY.md` ani `frontend/CLAUDE.md`. Przeczytano pozostałe
  wskazane dokumenty: `AGENTS.md` (główny i z `frontend/`), `frontend/AUDYT-DOSTEPNOSCI.md`, `DESIGN.md`.

## Decyzje, które warto znać

- Stara strona dokumentów ma też generowanie dokumentów (karty rodzajów). Ta funkcja została, żeby
  zachowanie się nie zmieniło, choć polecenie opisuje tylko listę.
- Przycisk główny na ekranie certyfikatu stoi w nagłówku (wzór z pulpitu). Stara strona przy
  niespełnionych warunkach nie pokazywała żadnego przycisku — nowa pokazuje niedostępny z powodem.
- Ekran dokumentów nie ma przycisku głównego: każde działanie należy do wiersza.
- Komunikaty błędów mają nagłówek drugiego stopnia (zamiast wspólnego komunikatu z nagłówkiem
  trzeciego), żeby pod tytułem ekranu nie było przeskoku w kolejności nagłówków.
- Teksty przycisków z formatem: „Pobierz PDF”, „Pobierz certyfikat (PDF)”; pełna nazwa dostępna
  przycisku dokumentu: „Pobierz porozumienie wolontariackie NP/PW/2026/003 (plik PDF)”.
- Odnośniki z listy warunków i profilu prowadzą do dzisiejszych tras (`/panel/kursy`, `/panel/staz`,
  `/panel/superwizja`, `/panel/profil`), tak jak na starych stronach.

## Pytania otwarte

1. **Rozszerzenie pobieranych plików.** Serwer odsyła certyfikat i dokumenty jako PDF, a oba stare
   ekrany zapisują plik pod nazwą z końcówką `.html` (`certyfikat.html`, `NP-PW-2026-003.html`).
   Zostawiono to bez zmian, bo polecenie mówi „dokładnie jak dotąd”, a napisy przycisków mówią „PDF”.
   Czy zmienić nazwy zapisywanych plików na `.pdf`?
2. **Data wydania.** Skąd ją brać: dołożyć odczyt konta (pole `program_completed_at`) czy pole w
   odpowiedzi warunków? Obie opcje zmieniają zestaw żądań.
3. **Grupa przełączenia** dla obu tras — do dodania przez zespół (zielenią się wtedy dwa czerwone testy).
4. Czy ekran „Dokumenty” ma dostać przycisk główny, gdy jakiś dokument jest do wygenerowania?

Jest uwaga dotycząca bezpieczeństwa — przekażę ją ustnie.
