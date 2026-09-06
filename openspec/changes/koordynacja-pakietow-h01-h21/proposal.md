## Why

Pięcioosobowy zespół odpowiada za pakiety H01–H21 i potrzebuje jednego, dostępnego w repozytorium źródła prawdy o kolejności realizacji, bieżącym właścicielu pakietu oraz integracji pracy asynchronicznej. Bez jawnej kolejki rośnie ryzyko równoczesnego rozpoczęcia tego samego pakietu, dublowania pracy i odkładania integracji na koniec.

## What Changes

- Wprowadzamy wspólną, priorytetyzowaną kolejkę obejmującą wszystkie pakiety H01–H21.
- Nie przypisujemy osobom stałych domen. Każda osoba pobiera kolejny gotowy pakiet w miarę postępu prac.
- Jedna osoba jest właścicielem całego pobranego pakietu HXX: API, autoryzacji, walidacji, interfejsu, testów i dokumentu `DEMO/HXX.md`.
- Każda osoba ma tylko jeden aktywny pakiet naraz; kolejny pobiera po doprowadzeniu poprzedniego do review albo jawnego oznaczenia blokady.
- Najpierw realizowane są pakiety P0 oraz kryteria oznaczone ★, składające się na wspólną ścieżkę demonstracyjną.
- Pakiety P0.5, P1 i P2 pozostają w jawnej kolejce po przejściu podstawowej ścieżki end-to-end.
- Praca odbywa się asynchronicznie na gałęziach `pakiet/HXX-nazwa`, zgodnych z zasadami repozytorium.
- Właściciel przed rozpoczęciem oznacza pakiet jako zajęty, żeby druga osoba nie rozpoczęła równoległej implementacji tego samego zakresu.
- Do repozytorium Fundacji trafia jeden oficjalny PR zespołu, zgodnie z zasadami hackathonu.
- Definiujemy wspólną checklistę odbioru obejmującą kryteria akceptacji, testy, stany błędów oraz dokument `DEMO/HXX.md`.

## Capabilities

### New Capabilities

Brak. Zmiana dotyczy wyłącznie organizacji pracy i dokumentacji zespołu; nie wprowadza nowego zachowania produktu.

### Modified Capabilities

Brak. Zmiana nie modyfikuje wymagań funkcjonalnych platformy.

## Impact

- Dokumentacja i workflow zespołu w repozytorium.
- Brak zmian w kodzie aplikacji, kontrakcie API, schemacie bazy danych i zależnościach.
- Podział nie zastępuje kryteriów z `docs/hackathon/01-pakiety-zadan.md`; wyłącznie przypisuje ich realizację i kolejność.
