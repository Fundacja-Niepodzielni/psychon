// Rachunek autorytatywny wariantow i stanow z kolumny "Warianty i stany"
// 06-ATOMY-MOLEKULY-ORGANIZMY.md par. 2, PRZEPISANY z rachunku wariantow
// sporzadzonego w odrebnym pomiarze. Plik stoi OSOBNO od rejestru
// pomiarowego (cele-atomy-styl.mjs) z tego samego powodu co POZYCJE_PAR2 vs
// cele-oczekiwane.mjs vs CELE w pomiar-celow-dotyku.mjs: gdyby mianownik i
// licznik zyly w jednym pliku, skrocenie rejestru obnizaloby cicho tez
// mianownik, i proba wracalaby zielona przy realnie mniejszym pokryciu.
//
// KAZDA nazwana pozycja z kolumny, raz na atom (regula z odrebnego pomiaru,
// zastosowana tu bez zmian). A7 Radio = 0 (atom nie powstaje). SUMA = 69.
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
  { grupa: "A14", pozycja: "przerywana", rodzaj: "wariant" },

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
];

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
export const GAPY_JAWNE = [
  {
    grupa: "A14",
    pozycja: "przerywana",
    klasyfikacja: "luka specyfikacji",
    powod: '06-ATOMY-MOLEKULY-ORGANIZMY.md w. 124 przy tej pozycji: "tylko nota" - specyfikacja SAMA oznacza to jako opis, nie jako cos do zaimplementowania. Sprawdzone osobno: jedyna inna wzmianka "przerywana" w calym pliku (w. 145, ramka 2px przerywana) dotyczy INNEGO komponentu (M5 FileDropZone), nie Dividera - brak jakiejkolwiek konkretnej wartosci przypisanej A14 gdziekolwiek w spec.',
  },
];
// A2 "tlo odwrocone" i A13 "wys. przycisku 34px" byly tu jako wady wykonania
// (patrz historia pliku) - domkniete: Link.tsx dostal wariant "tlo-odwrocone"
// (kolor `--invert-link`, bez wlasnego tla), Skeleton.tsx dostal wariant
// "przycisk" (pasek 34px wysokosci). Obie pozycje maja teraz wpis w
// cele-atomy-styl.mjs i sa mierzone, nie wymienione tutaj.

/** Unikalne nazwy koncepcji stanu (dla "Y z 15") - policzone z tablicy, nie wpisane osobno. */
export function nazwyKoncepcjiStanu() {
  return [...new Set(POZYCJE_PAR2.filter((p) => p.rodzaj === "stan").map((p) => p.koncepcjaStanu))];
}
