// Rachunek autorytatywny wariantow i stanow z kolumny "Warianty i stany"
// 06-ATOMY-MOLEKULY-ORGANIZMY.md par. 2, PRZEPISANY z rachunku wariantow
// sporzadzonego w odrebnym pomiarze. Plik stoi OSOBNO od rejestru
// pomiarowego (cele-atomy-styl.mjs) z tego samego powodu co POZYCJE_PAR2 vs
// cele-oczekiwane.mjs vs CELE w pomiar-celow-dotyku.mjs: gdyby mianownik i
// licznik zyly w jednym pliku, skrocenie rejestru obnizaloby cicho tez
// mianownik, i proba wracalaby zielona przy realnie mniejszym pokryciu.
//
// KAZDA nazwana pozycja z kolumny, raz na atom (regula z odrebnego pomiaru,
// zastosowana tu bez zmian). A7 Radio = 0 (atom nie powstaje). SUMA ATOMOW
// (A1-A20, §2) = 69.
//
// Warstwa 3, grupa A: plik ROZSZERZONY o M1-M9 wybrane pozycje
// (par. 3), ta sama metoda liczenia co dla atomow wyzej. +26 pozycji, SUMA
// = 95.
//
// Warstwa 3, grupa C: plik
// ROZSZERZONY o M14-M19 (par. 3, kolumna "Z czego, warianty, stany" — NIE
// par. 2: nazwa pliku "...par2.mjs" jest artefaktem warstwy 2 i myli,
// sprostowane 27.09 popołudniu; treść wpisów niżej i tak
// liczona z par. 3, tylko sama nazwa pliku zostaje, żeby nie psuć importów
// w cele-atomy-styl.mjs i pomiar-styl-atomow.mjs w tej samej zmianie), ta
// sama metoda liczenia co dla atomów wyżej. M14 Pagination wnosi 0 pozycji
// (kolumna źródłowa nie wymienia żadnego wariantu/stanu, patrz komentarz
// przy wpisach M15 niżej). +13 pozycji, SUMA = 108.
//
// Organizm O7 - dopisane 5 pozycji O7 (par. 4,
// jedyny organizm zlozony wprost z atomow) TA SAMA METODA - SUMA CAŁKOWITA
// (atomy + grupa A + grupa C + O7) = 113 — policzona z `POZYCJE_PAR2.length`
// programowo w pomiar-styl-atomow.mjs, nie wpisana tu z ręki drugi raz.
//
// `rodzaj`: "wariant" (wyglad strukturalny/staly) albo "stan" (zalezny od
// interakcji/atrybutu w czasie). Podzial WLASNY tego pliku (kolumna zrodlowa
// tego nie znakuje) - zrobiony PRZED pomiarem, zeby dobrac wlasciwy sposob
// pomiaru (staly odczyt vs. akcja), nie po to zeby naciagnac wynik.
//
// `koncepcjaStanu`: dla rodzaj="stan" - znormalizowana NAZWA POJECIA stanu,
// uzywana do policzenia "Y z 15 nazwanych stanow" (par. 8.2). Normalizacja
// WLASNA tego pliku, bo zrodlowy rachunek podaje sume stanow (15) ale NIE
// wypisuje explicite ktore 15 nazw to sa - uzasadnienie kazdej
// normalizacji stoi nizej:
//   - "fokus programowy na 2" (A18) -> "fokus" (ten sam koncept co reszta,
//     rozniaca sie tylko SPOSOBEM wywolania, nie nazwa stanu)
//   - "pojemnik aria-busy" (A13) -> "aria-busy" (to samo pojecie, "pojemnik"
//     to tylko opis KTOREGO elementu dotyczy)
// Po tej normalizacji zbior unikalnych nazw ma DOKLADNIE 15 pozycji - zgodnie
// z liczba z rachunku zrodlowego - policzone niżej programowo, nie z reki.
export const POZYCJE_PAR2 = [
  { grupa: "A1", pozycja: "primary", rodzaj: "wariant" },
  { grupa: "A1", pozycja: "outline", rodzaj: "wariant" },
  { grupa: "A1", pozycja: "quiet", rodzaj: "wariant" },
  { grupa: "A1", pozycja: "sm", rodzaj: "wariant" },
  { grupa: "A1", pozycja: "danger", rodzaj: "wariant" },
  { grupa: "A1", pozycja: "lock", rodzaj: "wariant" },
  { grupa: "A1", pozycja: "kursor", rodzaj: "stan", koncepcjaStanu: "kursor" },
  { grupa: "A1", pozycja: "fokus", rodzaj: "stan", koncepcjaStanu: "fokus" },
  { grupa: "A1", pozycja: "nieaktywny", rodzaj: "stan", koncepcjaStanu: "nieaktywny" },

  { grupa: "A2", pozycja: "w tresci", rodzaj: "wariant" },
  { grupa: "A2", pozycja: "okruszki", rodzaj: "wariant" },
  { grupa: "A2", pozycja: "tlo odwrocone", rodzaj: "wariant" },
  { grupa: "A2", pozycja: "kursor", rodzaj: "stan", koncepcjaStanu: "kursor" },
  { grupa: "A2", pozycja: "fokus", rodzaj: "stan", koncepcjaStanu: "fokus" },

  { grupa: "A3", pozycja: "tekst", rodzaj: "wariant" },
  { grupa: "A3", pozycja: "liczba", rodzaj: "wariant" },
  { grupa: "A3", pozycja: "data", rodzaj: "wariant" },
  { grupa: "A3", pozycja: "fokus", rodzaj: "stan", koncepcjaStanu: "fokus" },
  { grupa: "A3", pozycja: "niepoprawny", rodzaj: "stan", koncepcjaStanu: "niepoprawny" },
  { grupa: "A3", pozycja: "tylko do odczytu", rodzaj: "stan", koncepcjaStanu: "tylko do odczytu" },

  { grupa: "A4", pozycja: "jeden wariant", rodzaj: "wariant" },
  { grupa: "A4", pozycja: "fokus", rodzaj: "stan", koncepcjaStanu: "fokus" },
  { grupa: "A4", pozycja: "niepoprawny", rodzaj: "stan", koncepcjaStanu: "niepoprawny" },
  { grupa: "A4", pozycja: "tylko do odczytu", rodzaj: "stan", koncepcjaStanu: "tylko do odczytu" },

  { grupa: "A5", pozycja: "zamknieta", rodzaj: "stan", koncepcjaStanu: "zamknieta" },
  { grupa: "A5", pozycja: "otwarta", rodzaj: "stan", koncepcjaStanu: "otwarta" },
  { grupa: "A5", pozycja: "pod kursorem", rodzaj: "stan", koncepcjaStanu: "pod kursorem" },
  { grupa: "A5", pozycja: "wybrana", rodzaj: "stan", koncepcjaStanu: "wybrana" },
  { grupa: "A5", pozycja: "fokus", rodzaj: "stan", koncepcjaStanu: "fokus" },

  { grupa: "A6", pozycja: "zaznaczony", rodzaj: "stan", koncepcjaStanu: "zaznaczony" },
  { grupa: "A6", pozycja: "kursor", rodzaj: "stan", koncepcjaStanu: "kursor" },
  { grupa: "A6", pozycja: "fokus", rodzaj: "stan", koncepcjaStanu: "fokus" },

  // A7 Radio: 0 pozycji - atom nie powstaje (par. 2, kolumna Odbior).

  { grupa: "A8", pozycja: "neutral", rodzaj: "wariant" },
  { grupa: "A8", pozycja: "ok", rodzaj: "wariant" },
  { grupa: "A8", pozycja: "warn", rodzaj: "wariant" },
  { grupa: "A8", pozycja: "error", rodzaj: "wariant" },
  { grupa: "A8", pozycja: "pending", rodzaj: "wariant" },
  { grupa: "A8", pozycja: "z licznikiem", rodzaj: "wariant" },

  { grupa: "A9", pozycja: "zwykla", rodzaj: "wariant" },
  { grupa: "A9", pozycja: "z gwiazdka", rodzaj: "wariant" },

  { grupa: "A10", pozycja: "pod kontrolka", rodzaj: "wariant" },
  { grupa: "A10", pozycja: "w naglowku", rodzaj: "wariant" },
  { grupa: "A10", pozycja: "w wierszu", rodzaj: "wariant" },

  { grupa: "A11", pozycja: "po probie zapisu", rodzaj: "stan", koncepcjaStanu: "po probie zapisu" },

  { grupa: "A12", pozycja: "18px", rodzaj: "wariant" },
  { grupa: "A12", pozycja: "16px", rodzaj: "wariant" },
  { grupa: "A12", pozycja: "26px", rodzaj: "wariant" },

  { grupa: "A13", pozycja: "pasek", rodzaj: "wariant" },
  { grupa: "A13", pozycja: "wys. przycisku 34px", rodzaj: "wariant" },
  { grupa: "A13", pozycja: "pojemnik aria-busy", rodzaj: "stan", koncepcjaStanu: "aria-busy" },

  { grupa: "A14", pozycja: "pelna", rodzaj: "wariant" },
  // A14 "przerywana" NIE JEST pozycja mianownika. Zrodlo, 06-ATOMY-MOLEKULY-
  // ORGANIZMY.md w. 124, cytat: "przerywana = tylko nota
  // w makiecie: bez wariantu w kodzie i bez pozycji pomiaru; luka klasy
  // 'spec', 27.09". Skoro zrodlo mowi "bez pozycji pomiaru", to pozycji tu
  // nie ma - i nie ma jej tez w GAPY_JAWNE, bo luka jest brakiem POKRYCIA
  // pozycji mianownika, a nie brakiem pozycji. Zapisane wprost, zeby kolejna
  // pozniejsza zmiana nie dopisala jej z powrotem "dla kompletnosci".

  { grupa: "A15", pozycja: "inicjaly", rodzaj: "wariant" },

  { grupa: "A16", pozycja: "w kaflu", rodzaj: "wariant" },
  { grupa: "A16", pozycja: "w odtwarzaczu", rodzaj: "wariant" },

  { grupa: "A17", pozycja: "zrobiony", rodzaj: "stan", koncepcjaStanu: "zrobiony" },
  { grupa: "A17", pozycja: "biezacy", rodzaj: "stan", koncepcjaStanu: "biezacy" },
  { grupa: "A17", pozycja: "przed nami", rodzaj: "stan", koncepcjaStanu: "przed nami" },

  { grupa: "A18", pozycja: "stopien 1", rodzaj: "wariant" },
  { grupa: "A18", pozycja: "stopien 2", rodzaj: "wariant" },
  { grupa: "A18", pozycja: "stopien 3", rodzaj: "wariant" },
  { grupa: "A18", pozycja: "stopien 4", rodzaj: "wariant" },
  { grupa: "A18", pozycja: "fokus programowy na 2", rodzaj: "stan", koncepcjaStanu: "fokus" },

  { grupa: "A19", pozycja: "zwykly", rodzaj: "wariant" },
  { grupa: "A19", pozycja: "lekcja", rodzaj: "wariant" },
  { grupa: "A19", pozycja: "stan pusty", rodzaj: "wariant" },

  { grupa: "A20", pozycja: "w tekscie", rodzaj: "wariant" },
  { grupa: "A20", pozycja: "w tabeli", rodzaj: "wariant" },
  { grupa: "A20", pozycja: "w kaflu", rodzaj: "wariant" },

  // --- Molekuły §3, ta sama zasada
  // liczenia co powyżej dla atomów §2 — KAŻDA nazwana pozycja z kolumny
  // "Z czego, warianty, stany" (§3), raz na molekułę. M5, M6, M10-M19 NIE
  // wchodzą tutaj — należą do innych grup, poza tą
  // gałęzią. +26 pozycji: 18 wariantów + 8 stanów-wystąpień.

  // M1 Field (w. 141): pięć rodzajów kontrolki (warianty) + niepoprawny,
  // obowiązkowy, zablokowany (stany).
  { grupa: "M1", pozycja: "tekst", rodzaj: "wariant" },
  { grupa: "M1", pozycja: "liczba", rodzaj: "wariant" },
  { grupa: "M1", pozycja: "data", rodzaj: "wariant" },
  { grupa: "M1", pozycja: "wieloliniowy", rodzaj: "wariant" },
  { grupa: "M1", pozycja: "wybor", rodzaj: "wariant" },
  { grupa: "M1", pozycja: "niepoprawny", rodzaj: "stan", koncepcjaStanu: "niepoprawny" },
  { grupa: "M1", pozycja: "obowiazkowy", rodzaj: "stan", koncepcjaStanu: "obowiazkowy" },
  { grupa: "M1", pozycja: "zablokowany", rodzaj: "stan", koncepcjaStanu: "zablokowany" },

  // M2 SearchBox (w. 142): "z wpisem · bez wyników" — dwa stany, zero wariantów.
  { grupa: "M2", pozycja: "z wpisem", rodzaj: "stan", koncepcjaStanu: "z wpisem" },
  { grupa: "M2", pozycja: "bez wynikow", rodzaj: "stan", koncepcjaStanu: "bez wynikow" },

  // M3 ListRow (w. 143): prosty · ze stanem · rozwijalny · materiał · z
  // licznikiem (warianty) + otwarty (stan, --card-warm). "Cały wiersz
  // klikalny" NIE liczony — to zdanie o zachowaniu, nie nazwana pozycja
  // rozdzielona "·" w kolumnie źródłowej, tak samo jak reszta tego rejestru
  // liczy tylko pozycje rozdzielone "·".
  { grupa: "M3", pozycja: "prosty", rodzaj: "wariant" },
  { grupa: "M3", pozycja: "ze stanem", rodzaj: "wariant" },
  { grupa: "M3", pozycja: "rozwijalny", rodzaj: "wariant" },
  { grupa: "M3", pozycja: "material", rodzaj: "wariant" },
  { grupa: "M3", pozycja: "z licznikiem", rodzaj: "wariant" },
  { grupa: "M3", pozycja: "otwarty", rodzaj: "stan", koncepcjaStanu: "otwarty" },

  // M4 KeyValueRow (w. 144): wartość jawna · zamaskowana — dwa warianty.
  { grupa: "M4", pozycja: "jawna", rodzaj: "wariant" },
  { grupa: "M4", pozycja: "zamaskowana", rodzaj: "wariant" },

  // M7 Breadcrumbs (w. 147): pełne · skrócone — dwa warianty, oba zbudowane
  // zbudowane i mierzone w cele-atomy-styl.mjs.
  { grupa: "M7", pozycja: "pelne", rodzaj: "wariant" },
  { grupa: "M7", pozycja: "skrocone", rodzaj: "wariant" },

  // M8 Tabs (w. 148): wybrana (aria-pressed) · fokus (stany) + "≤639 cały
  // zestaw w rozwinięciu" (wariant układu, nie stan interakcji) — oba
  // zbudowane i mierzone w cele-atomy-styl.mjs.
  { grupa: "M8", pozycja: "wybrana", rodzaj: "stan", koncepcjaStanu: "wybrana" },
  { grupa: "M8", pozycja: "fokus", rodzaj: "stan", koncepcjaStanu: "fokus" },
  { grupa: "M8", pozycja: "zwinieta ponizej 639", rodzaj: "wariant" },

  // M9 MenuItem (w. 149): bieżąca (aria-current) · linia "W przygotowaniu" ·
  // nagłówek grupy — trzy warianty.
  { grupa: "M9", pozycja: "biezaca", rodzaj: "wariant" },
  { grupa: "M9", pozycja: "w przygotowaniu", rodzaj: "wariant" },
  { grupa: "M9", pozycja: "naglowek grupy", rodzaj: "wariant" },

  // --- Warstwa 3, grupa C (M14-M19). Ten sam rachunek, ta sama kolumna źródłowa — dla
  // molekuł nazywa się "Z czego, warianty, stany" (§3), nie "Warianty i
  // stany" (§2 atomów), ale metoda liczenia jest IDENTYCZNA: każda nazwana
  // pozycja rozdzielona kropką pośrodku ("·") w tej kolumnie, raz na
  // molekułę, sklasyfikowana wariant/stan wg tej samej reguły (wyliczenie
  // WŁASNE tego pliku, nie oznaczone w źródle, zrobione PRZED pomiarem).
  //
  // M14 Pagination (w. 154): komórka źródłowa brzmi WYŁĄCZNIE "Button × 2 +
  // Text" — skład, bez ANI JEDNEJ pozycji rozdzielonej "·". Zero pozycji tu
  // NIE jest błędem rachunku (nie pomyłka, nie pominięcie) — to jest to, co
  // kolumna naprawdę mówi. Molekuła ISTNIEJE (zbudowana w design-system/
  // molekuly/Pagination/), inaczej niż A7 Radio (który nie istnieje wcale) —
  // rozróżnienie zapisane wprost, żeby zero na tej liście nie czytało się
  // jak "brak pracy".
  { grupa: "M15", pozycja: "bez akcji", rodzaj: "wariant" },
  { grupa: "M15", pozycja: "z akcja", rodzaj: "wariant" },
  { grupa: "M15", pozycja: "z odnosnikiem do dziennika", rodzaj: "wariant" },

  { grupa: "M16", pozycja: "zwinieta", rodzaj: "stan", koncepcjaStanu: "zwinieta" },
  { grupa: "M16", pozycja: "rozwinieta", rodzaj: "stan", koncepcjaStanu: "rozwinieta" },
  { grupa: "M16", pozycja: "fokus", rodzaj: "stan", koncepcjaStanu: "fokus" },

  { grupa: "M17", pozycja: "pusto", rodzaj: "wariant" },
  { grupa: "M17", pozycja: "brak uprawnien", rodzaj: "wariant" },
  { grupa: "M17", pozycja: "brak wynikow filtra", rodzaj: "wariant" },

  // "fokus w pojemniku"/"fokus w treści" (w. 158) są DWIE różne, zmierzalne
  // pozycje fokusu (kontener vs. obszar edytowalny), nie jedno powtórzone
  // dwa razy — stąd DWA wiersze, oba pod koncepcją "fokus" (ta sama
  // normalizacja co "fokus programowy na 2" u A18 - różni się SPOSOBEM/
  // MIEJSCEM wywołania, nie nazwą koncepcji).
  { grupa: "M18", pozycja: "fokus w pojemniku", rodzaj: "stan", koncepcjaStanu: "fokus" },
  { grupa: "M18", pozycja: "fokus w tresci", rodzaj: "stan", koncepcjaStanu: "fokus" },

  { grupa: "M19", pozycja: "odpowiedziana", rodzaj: "stan", koncepcjaStanu: "odpowiedziana" },
  { grupa: "M19", pozycja: "czeka", rodzaj: "stan", koncepcjaStanu: "czeka" },

  // Organizm O7, poprawiony w korekcie: O7 jest
  // organizmem — kolumna zrodlowa nazywa sie "Uklad i stany" w §4 (proza
  // zachowania), NIE "Warianty i stany" z §2 (atomy, ten plik) ani "Z czego,
  // warianty, stany" z §3 (molekuly). Zadna z trzech nazw kolumn nie pasuje
  // doslownie do organizmu — wpis tutaj jest ANALOGIA zastosowana do
  // istniejacego przyrzadu (ten sam mechanizm mianownik/pokrycie), zeby O7
  // bylo mierzalne, NIE doslownym cytatem "par. 2" ani "par. 3" (sprawdzone
  // zrodlo: 06-ATOMY-MOLEKULY-ORGANIZMY.md (specyfikacja frontu),
  // wiersze 105/137/161/171).
  // Po korekcie skladu (Text zdjety, zamkniecie dopisane, "zamyka sie sam"
  // = `return null` w komponencie): "bez brakow" juz NIE rysuje wlasnego
  // stylu (nic sie nie montuje), wiec zdjete z mianownika; w jego miejsce
  // "zamkniecie" (Button quiet w skladzie z w. 171). Popup ukryty/otwarty
  // sterowany jest teraz przez wywolujaca trase (KursPublikacja), nie przez
  // sam organizm — nie ma tu osobnego wpisu, bo styl przycisku wyzwalajacego
  // mierzy sie jak kazdy inny A1 Button, nie jako nowa pozycja O7.
  { grupa: "O7", pozycja: "wariant staly", rodzaj: "wariant" },
  { grupa: "O7", pozycja: "gotowe zwiniete z licznikiem", rodzaj: "wariant" },
  { grupa: "O7", pozycja: "zamkniecie", rodzaj: "wariant" },
  { grupa: "O7", pozycja: "z brakami", rodzaj: "stan", koncepcjaStanu: "z brakami" },
  { grupa: "O7", pozycja: "fokus naglowka", rodzaj: "stan", koncepcjaStanu: "fokus" },

  // --- Molekuły warstwy 3, grupa B (M5, M6, M10-M13) — dopisane, nie osobny
  // rejestr: ta sama zasada policzenia co przy atomach (kazda NAZWANA pozycja
  // z kolumny "Z czego, warianty, stany" w 06-ATOMY-MOLEKULY-ORGANIZMY.md
  // §3, raz na molekule). M12 nie wymienia listy wariantow - jej jedyna
  // nazwana pozycja to opisowe zdanie "fokus poczatkowy na wycofaniu",
  // policzone jako JEDNA pozycja (ten sam wzorzec co A11 ErrorText nizej,
  // ktorego jedyna pozycja "po probie zapisu" tez pochodzi z opisu, nie z
  // wypunktowanej listy). M11 ma cztery warianty w typie WariantNotice -
  // cztery pozycje, nie jedna za cala molekule.

  { grupa: "M5", pozycja: "nad obszarem", rodzaj: "stan", koncepcjaStanu: "nad obszarem" },
  { grupa: "M5", pozycja: "fokus", rodzaj: "stan", koncepcjaStanu: "fokus" },
  { grupa: "M5", pozycja: "po dodaniu", rodzaj: "stan", koncepcjaStanu: "po dodaniu" },

  { grupa: "M6", pozycja: "przetwarzanie", rodzaj: "wariant" },
  { grupa: "M6", pozycja: "gotowy", rodzaj: "wariant" },
  { grupa: "M6", pozycja: "blad", rodzaj: "wariant" },

  { grupa: "M10", pozycja: "zwykly", rodzaj: "wariant" },
  { grupa: "M10", pozycja: "dominujacy", rodzaj: "wariant" },
  { grupa: "M10", pozycja: "bez danych", rodzaj: "wariant" },

  { grupa: "M11", pozycja: "ok", rodzaj: "wariant" },
  { grupa: "M11", pozycja: "warn", rodzaj: "wariant" },
  { grupa: "M11", pozycja: "error", rodzaj: "wariant" },
  { grupa: "M11", pozycja: "info", rodzaj: "wariant" },

  { grupa: "M12", pozycja: "fokus poczatkowy na wycofaniu", rodzaj: "stan", koncepcjaStanu: "fokus" },

  { grupa: "M13", pozycja: "ukryty", rodzaj: "stan", koncepcjaStanu: "ukryty" },
  { grupa: "M13", pozycja: "widoczny", rodzaj: "stan", koncepcjaStanu: "widoczny" },
];

// Mianownik molekul grupy B, policzony PROGRAMOWO z tablicy powyzej (nie z
// reki): 16 pozycji (10 wariantow + 6 stanow-wystapien). SUMA CALOSCI pliku
// = 113 (atomy + grupa A + grupa C + O7, patrz naglowek pliku) + 16 (molekuly
// grupy B, ta zmiana) = 129 - wartosc wyliczona przez POZYCJE_PAR2.length
// nizej, nie wpisana z reki drugi raz.

// Gapy jawne - pozycje z POZYCJE_PAR2, ktorych rejestr pomiarowy NIE mierzy,
// z powodem. Wymieniane w wyniku pomiaru zamiast byc cicho pominiete
// (zasada: "rozjazdu nie uzgadniaj po cichu").
// Pole `klasyfikacja`: kazda
// pozycja jest albo WADA WYKONANIA (spec podaje konkretna wartosc, drzewo jej
// nie realizuje - zostaje w rachunku, ma wlasciciela) albo LUKA SPECYFIKACJI
// (spec nie podaje zadnej wartosci do zaimplementowania - do
// rozstrzygniecia w samej specyfikacji). Pomylka w strone "luka" tam, gdzie spec faktycznie cos podaje,
// KASUJE robote z listy - stad rozroznienie jest jawnym polem, nie tylko
// tekstem w `powod`.
// Trzy klasy luk, nie jedna. Pole `klasa` ma dokladnie
// trzy dopuszczalne wartosci i silnik je rozroznia, bo znacza rozne rzeczy:
//   "spec"          - zrodlo nie podaje czego mierzyc; nie ma czego zbudowac
//                     ani czym zmierzyc, luka nalezy do specyfikacji;
//   "przyrzad"      - produkt JA REALIZUJE, ale przyrzad dzis nie siega;
//                     dozwolona tylko z plikiem, wlascicielem naprawy i
//                     TERMINEM powrotu jako pozycja mierzalna, inaczej kod 4;
//   "niezbudowane"  - produktu nie ma. To NIE jest luka, tylko czerwona
//                     pozycja zakresu: sam wpis tej klasy konczy bieg kodem 4.
// Bez tego rozroznienia wszystkie trzy obnizaly prog identycznie, wiec
// "nie zbudowalem" wygladalo w pomiarze tak samo jak "zrodlo nie mowi".
// M7 "skrocone" i M8 "zwinieta ponizej 639" NIE SA tu wymienione: commit
// "Zbuduj warianty Breadcrumbs skrocone i Tabs zwinieta ponizej 639"
// zbudowala oba warianty, dala im mount w main.tsx i cel pomiaru w
// cele-atomy-styl.mjs - wyszly z wykazu luk, sa teraz pozycjami MIERZONYMI,
// nie GAPAMI JAWNYMI. Zapisane wprost, zeby kolejna zmiana nie wpisala ich
// tu z powrotem "dla porzadku".
export const GAPY_JAWNE = [
  {
    grupa: "M5",
    plik: "frontend/design-system/poligon/pomiar-styl-atomow.mjs (wykonajAkcje)",
    wlasciciel: 'przyrzad pomiaru: nowy typ akcji "dragover" (Playwright locator.dispatchEvent)',
    termin: "przeglad po warstwie 4",
    pozycja: "nad obszarem",
    klasa: "przyrzad",
    powod: 'Spec podaje konkretna wartosc (ramka --primary, tlo --green-tint) i produkt ja realizuje (FileDropZone.module.css, klasa .nadObszarem) - silnik pomiaru (pomiar-styl-atomow.mjs, funkcja wykonajAkcje) nie ma typu akcji "dragover" (tylko hover/klik/otworz-jesli-zamknieta/zamknij-jesli-otwarta), wiec stanu nie da sie dzis wywolac programowo bez rozszerzenia silnika. Wlasciciel: rozszerzenie wykonajAkcje o "dragover" (Playwright locator.dispatchEvent), osobna zmiana.',
  },
  {
    grupa: "M12",
    plik: "frontend/design-system/poligon/pomiar-styl-atomow.mjs (petla pomiaru)",
    wlasciciel: "przyrzad pomiaru: osobna, izolowana strona na pozycje zalezne od fokusu przy zamontowaniu",
    termin: "przeglad po warstwie 4",
    pozycja: "fokus poczatkowy na wycofaniu",
    klasa: "przyrzad",
    powod: 'Spec podaje konkretne zachowanie i produkt je realizuje (DialogActions.tsx, efekt po zamontowaniu). Fokus DOM jest jednak stanem GLOBALNYM calej strony poligonu, nie lokalnym dla jednej pozycji - inne pozycje w tej samej petli pomiaru (np. akcje "klik" na A5 Select) przenosza fokus DOM gdzie indziej zanim przyszlaby kolej na odczyt tej pozycji, wiec wynik zalezalby od KOLEJNOSCI wpisow w rejestrze, nie od zachowania DialogActions. Wlasciciel: osobna, izolowana strona pomiaru dla stanow zaleznych od fokusu przy zamontowaniu, nie prowizoryczne ustawienie kolejnosci.',
  },
  {
    grupa: "M13",
    plik: "frontend/design-system/poligon/pomiar-styl-atomow.mjs (zmierzAtom) + cele-atomy-styl.mjs",
    wlasciciel: "przyrzad pomiaru: pole oczekiwanyBrakElementu i gniazdo w zmierzAtom",
    termin: "przeglad po warstwie 4",
    pozycja: "ukryty",
    klasa: "przyrzad",
    powod: 'Spec podaje konkretna wartosc (liczbaZmian=0 -> pasek nie istnieje w DOM) i produkt ja realizuje (SaveBar.tsx zwraca null). Silnik pomiaru (zmierzAtom w pomiar-styl-atomow.mjs) traktuje 0 dopasowan selektora jako kod 2 "nie da sie zmierzyc" bezwarunkowo - nie rozroznia "element powinien nie istniec, i nie istnieje" (poprawnie) od "element powinien istniec, ale selektor go nie znalazl" (blad). Wlasciciel: nowe pole np. oczekiwanyBrakElementu w cele-atomy-styl.mjs i gniazdo w zmierzAtom, osobna zmiana.',
  },
];
// A2 "tlo odwrocone" i A13 "wys. przycisku 34px" byly tu jako wady wykonania
// (patrz historia pliku) - domkniete: Link.tsx dostal wariant "tlo-odwrocone"
// (kolor `--invert-link`, bez wlasnego tla), Skeleton.tsx dostal wariant
// "przycisk" (pasek 34px wysokosci). Obie pozycje maja teraz wpis w
// cele-atomy-styl.mjs i sa mierzone, nie wymienione tutaj. M7 "skrocone" i
// M8 "zwinieta ponizej 639" byly tu jako klasa "niezbudowane"
// - domkniete: Breadcrumbs.tsx dostal wariant
// "skrocone", Tabs.tsx dostal prop "zwinPonizej639"; obie maja teraz wpis w
// cele-atomy-styl.mjs, wlasny mount w main.tsx i sa mierzone.

/** Unikalne nazwy koncepcji stanu (dla "Y z 15") - policzone z tablicy, nie wpisane osobno. */
export function nazwyKoncepcjiStanu() {
  return [...new Set(POZYCJE_PAR2.filter((p) => p.rodzaj === "stan").map((p) => p.koncepcjaStanu))];
}
