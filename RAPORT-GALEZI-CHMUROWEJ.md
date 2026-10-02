# Raport gałęzi `chmura/profil-psychologa-nowy-wyglad`

Data: 2026-10-02. Gałąź odchodzi od końca `sprint-2`. Plik zniknie przy przejęciu gałęzi.

## Co zrobiono

Ekran „Profil psychologa” uczestnika (formularz, w którym osoba przygotowuje publiczny profil i wysyła go
do sprawdzenia) odtworzono z klocków nowego wyglądu. Stara strona (`/panel/profil-psychologa`) i stary
komponent zostały nietknięte.

1. **Pomiar starego ekranu** — `frontend/nowy-front/profil-psychologa-formularz/POMIAR-STAREGO-EKRANU.md`:
   każde żądanie (metoda, ścieżka, wysyłane i czytane pola), każde pole z regułą i komunikatem, każdy stan
   wniosku i to, co wolno w każdym z nich.
2. **Ekran** (`ProfilPsychologa.tsx`) na szablonie formularza, z tym samym nagłówkiem strony co inne nowe ekrany.
   - **Blok stanu na górze**: nazwa stanu, co on znaczy, uwagi osoby sprawdzającej (gdy wniosek odesłano do
     poprawki) i zdanie „Co dalej”.
   - **Białe karty**: dane wniosku, załączniki weryfikacyjne, zgoda na publikację.
   - **Jeden zielony przycisk** w nagłówku, zależny od tego, co jest do zrobienia: z niezapisanymi zmianami
     „Zapisz zmiany”, po zapisie „Wyślij do sprawdzenia”. Dopóki zapisanemu wnioskowi czegoś brakuje, drugi z nich
     jest niedostępny i pod nagłówkiem stoi powód („Brakuje 2 elementów: dyplom, zgoda na publikację. …”).
     W stanach, w których wniosku nie da się zmienić ani wysłać, przycisku głównego nie ma.
   - Potwierdzenie po zapisie, wysłaniu i wycofaniu zgody we wspólnym powiadomieniu; wspólne ostrzeżenie o
     niezapisanych zmianach; wspólny ekran odmowy i „nie znaleziono”; daty, liczby i odmiana przez wspólne pomocniki.
   - **Nazwy stanów** bierze z ekranów administracji (`profile-kolejka`): Wersja robocza · Czeka na decyzję · Do
     poprawki · Zatwierdzony · Opublikowany · Zgoda wycofana. Jedyny stan spoza tej listy to „Nie rozpoczęto” (osoba
     nie zapisała jeszcze niczego) — administracja go nie widzi.
3. **Strona podglądu**: `app/nowy-front/profil-psychologa/page.tsx`. Bez grupy przełączenia, menu i odnośników.
4. **Testy** (5 plików, 93 przypadki, wszystkie zielone): stany ekranu, żądania (te same trasy, metody i ciała co
   w starym komponencie), nazwy stanów równe administracyjnym, odmiana liczebników, dostępność (kontrola
   automatyczna we wszystkich stanach) i struktura plików.

Żądania: żadnej nowej trasy. `GET /psychologist-profile`, `PATCH /psychologist-profile`,
`POST /psychologist-profile/documents`, `POST /psychologist-profile/submit`,
`POST /psychologist-profile/consent/withdraw`, z tymi samymi polami co dotąd.

## Polecenia i liczby (w katalogu `frontend/`)

| Co | Polecenie | Wynik |
|---|---|---|
| Testy przed zmianami (czysty koniec `sprint-2`) | `npm run test` | 481 plików, 6038 przypadków: 6037 zaliczonych, 1 pominięty, 0 niezaliczonych |
| Testy po zmianach | `npm run test` | 486 plików, 6133 przypadki: 6129 zaliczonych, **3 niezaliczone**, 1 pominięty |
| Same nowe testy | `npx vitest run nowy-front/profil-psychologa-formularz` | 5 plików, 93 przypadki, wszystkie zaliczone |
| Sprawdzenie typów | `npm run sprawdz-typy` | bez błędów |
| Lint | `npm run lint` | 0 błędów, 10 ostrzeżeń w istniejących plikach, 0 w nowych (tyle samo co przed zmianami) |
| Budowanie | `npm run build` | powodzenie; nowa trasa `/nowy-front/profil-psychologa` zbudowana jako statyczna |

Różnica 95 przypadków to 93 nowe plus 2 przypadki istniejącej kontroli punktów orientacyjnych, która sama
obejmuje nową trasę (zaliczone).

Uwaga o pomiarze „przed”: pierwszy przebieg wykonany w trakcie dopisywania plików dał 3 czerwone przypadki —
jeden z powodu moich własnych, częściowo gotowych plików, a dwa w niepowiązanych testach (karta z pytaniami w
lekcji i przełączenie trasy kursu), które w czystym przebiegu na końcu `sprint-2` przeszły. Liczby z tabeli
pochodzą z czystego przebiegu na osobnej kopii roboczej.

## Oczekiwane czerwone testy (zamknięte listy) — czego brakuje

Trzy niezaliczone przypadki w dwóch plikach; żadnego nie ruszałem ani nie osłabiałem.

1. `frontend/design-system/szablony/__tests__/niezapisane-zmiany-zrodla.test.ts` — przypadek „zgłoszenia stoją
   wyłącznie w plikach z listy (lista jest pełna)”. Nowy ekran zgłasza niezapisane zmiany ramie panelu, więc
   zespół musi dopisać do listy `PLIKI_ZGLASZAJACE` dokładnie jeden wpis, po
   `nowy-front/profil-decyzja/PanelDecyzji.tsx`:
   `"nowy-front/profil-psychologa-formularz/ProfilPsychologa.tsx",`
2. `frontend/lib/przelaczenie/__tests__/pokrycie-ekranow.test.ts` — dwa przypadki: „każdy ekran nowego frontu
   należy do jakiejś grupy rejestru” i „przypadek odwrotny: ekran spoza rejestru albo wpis bez strony zostaje
   wykryty”. Zespół musi dopisać w `frontend/lib/przelaczenie/grupy.ts` ekran z
   `trasaPoligonu: "/nowy-front/profil-psychologa"` — w nowej grupie (propozycja klucza: `profilPsychologa`,
   `wlaczona: false`) albo w istniejącej: `{ panel: "uczestnik", staraTrasa: "/panel/profil-psychologa",
   nowaTrasa: <trasa produktu wybrana przez zespół>, trasaPoligonu: "/nowy-front/profil-psychologa" }`.
   Wartość `nowaTrasa` to decyzja zespołu (ten sam adres co stara trasa albo nowy).

## Czego nie zrobiono i dlaczego

- Nie dodano grupy przełączenia, wpisu w menu ani odnośnika z innych ekranów (zgodnie z poleceniem) — stąd czerwone testy wyżej.
- Nie uruchamiano skryptów pomiarowych kontrastu i celów dotyku (`npm run pomiar:*`) ani testów z `e2e/`;
  dostępność sprawdzono automatyczną kontrolą w testach jednostkowych (bez kontrastu — tego środowisko testowe nie liczy)
  oraz wzrokowo na zrzutach z lokalnie uruchomionej zbudowanej aplikacji (390 px i 1280 px, z atrapami odpowiedzi
  serwera, bez sieci zewnętrznej; brak przewijania w poziomie).
- Nie sprawdzano wgrywania prawdziwego pliku do działającego serwera — tylko w testach jednostkowych.
- Nie dotykano tablicy statusów pakietów ani plików `DEMO/` (opisanych w `AGENTS.md`): ta gałąź jest gałęzią roboczą spoza trybu pakietowego.

## Różnice względem starego ekranu (świadome)

- Nazwy trzech stanów: „Czeka na decyzję” zamiast „Oczekuje na weryfikację”, „Do poprawki” zamiast „Do poprawy”,
  „Zatwierdzony” zamiast „Zaakceptowany” — tak nazywają je ekrany administracji. Stan „Opublikowany”, którego stary
  ekran nie znał, jest pokazany jako zablokowany.
- Przycisk „Złóż wniosek” nazywa się „Wyślij do sprawdzenia”. Jest aktywny, gdy ZAPISANY wniosek jest kompletny
  (stary ekran liczył to z wartości w polach, a serwer i tak sprawdza tylko zapisane). Z niezapisanymi zmianami
  zielony jest „Zapisz zmiany”.
- Po dodaniu załącznika lista załączników się odświeża, ale wpisane i jeszcze niezapisane pola zostają (stary ekran
  nadpisywał je zapisanymi wartościami).
- Błędy serwera: błąd pozycji listy specjalizacji (`specializations.0`) i komunikat pola pliku/typu załącznika są
  pokazane (stary ekran pokazywał tylko dokładne klucze i ogólny komunikat).
- Dodano krótkie potwierdzenia po wysłaniu wniosku i po wycofaniu zgody; pod polami są podpowiedzi, które są wymagane
  do wysłania. Wycofanie zgody dalej odbywa się jednym kliknięciem, bez dodatkowego pytania.
- Wybór pliku przez obszar upuszczania ze wspólnych klocków; plik dalej dodaje się osobnym przyciskiem „Dodaj załącznik”,
  a brak pliku daje to samo zdanie co dotąd.

## Pytania otwarte

1. Czy wycofanie zgody ma dostać dodatkowe pytanie „Na pewno?” — skutek jest nieodwracalny (wniosek się blokuje),
   a stary ekran go nie pytał, więc nowy też nie.
2. `nowaTrasa` w rejestrze przełączenia (patrz wyżej): ten sam adres czy nowy.
3. Czy po decyzji „Zatwierdzony” osoba ma widzieć, kiedy profil stanie się „Opublikowany”? Ekran nie ma na to danych
   (serwer nie zwraca daty decyzji osobie, której dotyczy wniosek).

Jest uwaga dotycząca bezpieczeństwa — przekażę ją ustnie.
