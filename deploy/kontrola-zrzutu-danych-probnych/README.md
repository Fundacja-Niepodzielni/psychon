# Kontrola danych próbnych na zrzucie `pg_dump --data-only`

Ten katalog jest kodem-narzędziem, uruchamianym na tekstowym zrzucie
`pg_dump --data-only` wykonanym **PO odtworzeniu bazy** (patrz
`deploy/prod/odtworzenie-probne.sh` i `deploy/PROTOKOL-ODTWORZENIA-PROBNEGO.md`
- ten katalog nie zastępuje żadnego z nich).

**Powłoki tego katalogu (`kontrola-zrzutu.sh`, `dowod/uruchom-dowod.sh`) NIE
zostały zmierzone `shellcheck`iem** — stacja robocza, na której ten katalog
powstał, niczego nie instaluje. Zero wzmianek o `shellcheck` w tym katalogu
przed tym zdaniem jest właśnie tą luką, nazwaną wprost, nie milczącą.

## Co ten przyrząd PRZESZUKUJE, a czego nie

`pg_dump --data-only` (format tekstowy) wypisuje blok `COPY ... FROM stdin;`
dla każdej relacji, która ma własne, fizyczne przechowywanie danych i którą
`pg_dump` traktuje jako "tabelę danych" — zwykłe tabele (i partycje-liście
tabel partycjonowanych) oraz wartości sekwencji (`SELECT
pg_catalog.setval(...)`). **Ten przyrząd nie twierdzi nic o typach kolumn**
— przeszukuje wartość każdej kolumny każdej wypisanej relacji jako TEKST,
wobec wzorców z `wzorce-probne.txt`.

Tresc **poza** blokami `COPY` (nagłówki, komentarze, polecenia `SET`,
`SELECT pg_catalog.setval(...)` dla sekwencji, zapisy dużych obiektów
`SELECT pg_catalog.lowrite(...)`) **nie jest przeszukiwana per-kolumna** —
ten przyrząd nie ma tam żadnych kolumn do przypisania trafienia. To NIE
znaczy, że taka treść jest bez znaczenia dla stanu — patrz niżej.

**Dawne (odrzucone) zdanie w tym miejscu brzmiało:** „Żeby ta luka w zasięgu
nigdy nie była cicha, `policz-trafienia.pl` i tak liczy linie spoza bloków
`COPY`, które dopasowały którykolwiek wzorzec jako cały tekst linii, i zawsze
wypisuje tę liczbę jako `POZA_COPY=<n>` — `kontrola-zrzutu.sh` drukuje ją w
logu dla obu plików, ale nie liczy jej do stanu `0`/`3`." To zdanie było
**nieprawdziwe**: dwa kształty treści poza `COPY` dawały `POZA_COPY=0` bez
żadnego śladu — cicho, wbrew temu zdaniu — zmierzone tak:

1. **Duży obiekt w postaci szesnastkowej** (`SELECT pg_catalog.lowrite(0,
   '\x...')`) — wartość próbna w treści dużego obiektu nie jest tekstem
   płaskim, więc dopasowanie „cały tekst linii" jej nie łapało.
2. **Nazwa kolumny w linii nagłówka `COPY ... (kolumny...) FROM stdin;`** —
   ta linia była konsumowana przez rozpoznanie nagłówka i `next` w Perlu,
   zanim dotarła do sprawdzenia wzorca — nie liczyła się ani do `SUMA`, ani
   do `POZA_COPY`.

**Naprawione i zmierzone** (patrz `dowod/` niżej dla poleceń i liczb):
`policz-trafienia.pl` liczy dziś **każdą** linię spoza bloków `COPY` do
`LINIE_NIE_COPY=<n>` (zawsze, dopasowaną czy nie — nagłówek `COPY` też),
sprawdza wzorzec na **całej linii nagłówka `COPY` włącznie** (zamykając
wektor 2. — teraz liczy się do `POZA_COPY`), i dekoduje **każde** wywołanie
`lowrite(...)` z osobna, sprawdzając wzorzec na zdekodowanej treści
(`DUZY_OBIEKT_LINIE=<n>` linii rozpoznanych, `DUZY_OBIEKT_TRAFIENIA=<n>` po
dekodowaniu — zamykając wektor 1.).

**Druga naprawa, w tym samym zleceniu jak powyższa: te liczniki dziś ZMIENIAJĄ
kod wyjścia**, nie tylko trafiają do logu. `POZA_COPY>0` **lub**
`DUZY_OBIEKT_TRAFIENIA>0` w `PLIK_PO` podnosi stan do `3` — dokładnie tak samo,
jak trafienie wewnątrz bloku `COPY` — i `policz-trafienia.pl` wypisuje dla
każdego takiego trafienia osobną linię `TRAFIENIE relacja=<schema.tabela
albo (brak)> miejsce=<naglowek-copy | poza-copy:linia=N | duzy-obiekt:linia=N>
wzorzec=P<i> liczba=1`, **nigdy wartość pola** — dokładnie ten sam kontrakt
(relacja/miejsce, nie treść) co `TRAFIENIE` wewnątrz `COPY`. Wcześniej
(commit poprzedzający ten) te liczniki były liczone i drukowane w logu, ale
**nie wpływały na stan** — dowód (`23-stan0-poza-copy-widoczne`, wtedy
oczekujący `0`) sam utrwalał tę wadę jako normę; dziś ten sam przypadek
(przemianowany na `23-stan3-poza-copy-widoczne`) oczekuje `3`.

**Trzecia naprawa: luka w dekodowaniu dużych obiektów przestała być cicha.**
Dekodowanie działa **per wywołanie `lowrite`** — `pg_dump` dzieli treść
dużego obiektu na kawałki i pisze każdy osobnym wywołaniem (rozmiar kawałka
zmierzony empirycznie na `postgres:17`: **16384 B**, NIE ok. 2 kB, jak
zakładało wcześniejsze zdanie w tym miejscu — patrz `dowod/uruchom-dowod.sh`,
krok z `fixtures/dane-duzy-obiekt-rozciety.sql`). Wzorzec rozdzielony
dokładnie na granicy dwóch takich wywołań **nie zostanie wykryty przez żadne
z nich z osobna** — to pozostaje prawdą, dekodowanie NIE łączy kawałków. Ale
ta niepewność już nie jest cicha: `policz-trafienia.pl` liczy
`DUZY_OBIEKT_WIELOKROTNY=<n>` (liczba różnych dużych obiektów zapisanych
więcej niż jednym wywołaniem `lowrite`), i `kontrola-zrzutu.sh` — jeśli
żaden inny warunek nie dał już stanu `3` — kończy się stanem `2` (NIE
ZMIERZONO), gdy `DUZY_OBIEKT_WIELOKROTNY_PO>0`: obecność wielokrotnego
zapisu znaczy "nie wiem, czy jest tam znacznik", nigdy cicho "0". Konsekwencja
nazwana wprost: **każdy** duży obiekt zapisany więcej niż jednym `lowrite`
(nie tylko taki z rozdzielonym znacznikiem) daje dziś `2`, nie tylko te ze
zmierzonym w tym zleceniu przypadkiem.

Dwie klasy relacji **zmierzone empirycznie** (obraz `postgres:17`, patrz
`dowod/uruchom-dowod.sh`) jako pomijane przez `pg_dump --data-only` bez
dodatkowych flag:

| Klasa | `relkind` | Dowód |
|---|---|---|
| Widoki zmaterializowane | `m` | schemat z `mv_archiwum_kontaktow` + dane próbne w kolumnie źródłowej → zero wystąpień w zrzucie danych, mimo że widok ma własne przechowywanie i jest odświeżony |
| Tabele obce / FDW | `f` | `fdw_uczestnicy` (serwer `postgres_fdw` wskazujący na siebie) → zero wystąpień w zrzucie, `pg_dump` nie ma flagi `--include-foreign-data` w tym biegu |

Zwykłe widoki (`relkind=v`) nie mają własnego przechowywania w ogóle — nie
są tu liczone jako osobna "pominięta klasa z danymi", bo fizycznie nie mają
czego wypisać.

`kontrola-zrzutu.sh` **zawsze** wypisuje nazwy tych dwóch klas. Liczbę
relacji tych klas w bazie źródłowej wypisuje tylko, gdy dostanie manifest
(czwarty argument, wynik `fixtures/manifest-klas-pominietych.sql`
uruchomiony na żywej bazie) — bez manifestu przyrząd mówi wprost "liczba
nieznana", nigdy nie zakłada zera.

## Kontrakt `kontrola-zrzutu.sh`

```
kontrola-zrzutu.sh PLIK_PRZED PLIK_PO PLIK_WZORCOW [PLIK_KLAS_POMINIETYCH]
```

- `PLIK_PRZED` — zrzut wzięty **przed** krokiem czyszczenia danych próbnych
  (kontrola dodatnia — patrz niżej).
- `PLIK_PO` — zrzut, który ma być **oceniony** (np. po kroku czyszczenia).
- `PLIK_WZORCOW` — plik wzorców, patrz `wzorce-probne.txt`.
- `PLIK_KLAS_POMINIETYCH` — opcjonalny manifest liczby relacji klas spoza
  zrzutu (`fixtures/manifest-klas-pominietych.sql`).

Kody wyjścia — **wyłącznie** `{0, 2, 3}`:

- `0` — ZALICZONE: kontrola dodatnia przeszła (`PLIK_PRZED` ma >0
  trafień), **oba** pliki mają co najmniej jeden blok `COPY` (patrz
  "Integralność `PLIK_PO`" niżej), `PLIK_PO` ma 0 trafień w tych blokach,
  0 trafień **poza** nimi (nagłówek `COPY` włącznie), 0 trafień w
  zdekodowanej treści dużych obiektów, **i** żaden duży obiekt w `PLIK_PO`
  nie jest zapisany więcej niż jednym wywołaniem `lowrite`.
- `2` — NIE ZMIERZONO, z nazwaną przyczyną w logu: zły argument, brakujący
  plik, argument jest katalogiem (format `-F directory`?), plik zaczyna się
  od sygnatury `PGDMP` (format `-F custom`, binarny — nieobsługiwany),
  kontrola dodatnia nie przeszła, parser nie ukończył odczytu (w tym blok
  `COPY` urwany w połowie — brak terminatora `\.`), `PLIK_PRZED` lub
  `PLIK_PO` nie ma **ani jednego** bloku `COPY`, ALBO `PLIK_PO` niesie duży
  obiekt zapisany więcej niż jednym wywołaniem `lowrite` i żaden inny
  warunek nie dał już stanu 3 (zasięg takiego obiektu jest niepewny, nigdy
  cicho "czysty").
- `3` — ZMIERZONE NARUSZENIE: kontrola dodatnia przeszła, oba pliki
  strukturalnie poprawne, **i** `PLIK_PO` ma >0 trafień w blokach `COPY`,
  **lub** >0 trafień **poza** nimi (nagłówek `COPY` z nazwą kolumny albo
  nazwą relacji niosącą wzorzec włącznie), **lub** >0 trafień w
  zdekodowanej treści dużego obiektu; log niesie listę `TRAFIENIE
  relacja=.../miejsce=.../wzorzec=.../liczba=...` — **nigdy** wartość pola.

Każdy inny kod wyjścia tego skryptu (np. przerwanie przez powłokę) jest
**własnością środowiska**, w którym przyrząd nie doszedł do końca — to nie
jest żaden z trzech stanów powyżej i ten dokument nie wylicza jego możliwych
źródeł.

### Kontrola dodatnia

Zero trafień w `PLIK_PO` jest bezwartościowe bez dowodu, że przyrząd w ogóle
potrafi coś znaleźć. Dlatego `PLIK_PRZED` (zrzut sprzed czyszczenia) musi
mieć >0 trafień — jeśli ma zero, przyrząd **nie** oddaje "0" dla `PLIK_PO`,
tylko stan 2 ("przyrząd nie widział"). Liczba znaczników z kontroli
dodatniej trafia do logu zawsze, w tej samej linii niezależnie od tego, czy
przeszła, czy nie.

Ta kontrola bada **wyłącznie** `PLIK_PRZED` — sama w sobie nie dowodzi
niczego o tym, czy `PLIK_PO` w ogóle pochodzi z udanego `pg_dump`. Patrz
niżej.

### Integralność `PLIK_PO` (niezależna od `PLIK_PRZED`)

`PLIK_PO`, który **nie jest** poprawnym tekstowym zrzutem `pg_dump
--data-only` — plik pusty (0 B), plik bez żadnego bloku `COPY` (np. z
nieudanego połączenia albo złej nazwy bazy), albo blok `COPY` urwany w
połowie (brak terminatora `\.`) — **nie** może dać stanu 0. Te trzy kształty
dają dziś zero trafień "wewnątrz" (bo nie ma czego liczyć), co bez osobnej
kontroli wygląda identycznie jak "baza czysta".

Dlatego `kontrola-zrzutu.sh` sprawdza **każdy** z obu plików (`PLIK_PRZED`
**i** `PLIK_PO`, ten sam kod, ten sam warunek) na własną integralność, w
oderwaniu od tego, co znalazła kontrola dodatnia na drugim pliku: plik musi
mieć co najmniej jeden blok `COPY` (`RELACJI_COPY>0`) i żaden z jego bloków
`COPY` nie może być urwany (parser kończy się kodem różnym od zera, gdy plik
urywa się w środku bloku). Popsucie **samego** `PLIK_PO` — przy nienagannym,
niezmienionym `PLIK_PRZED` — daje stan 2, nie 0.

## Pliki

| Plik | Rola |
|---|---|
| `kontrola-zrzutu.sh` | Właściwy przyrząd — patrz kontrakt wyżej. |
| `policz-trafienia.pl` | Parsuje bloki `COPY` zrzutu, liczy trafienia wzorców per relacja/kolumna, kończy się kodem różnym od zera przy urwanym bloku `COPY`. Wypisuje też `RELACJI_COPY` (do kontroli integralności), `LINIE_NIE_COPY` (wszystkie linie poza `COPY`, dopasowane czy nie), `POZA_COPY` (podzbiór dopasowany jako cały tekst linii, teraz wliczając nagłówek `COPY`), `DUZY_OBIEKT_LINIE`/`DUZY_OBIEKT_TRAFIENIA` (zapisy dużych obiektów, dekodowane per wywołanie `lowrite`). Nigdy nie wypisuje wartości pola. |
| `wzorce-probne.txt` | Wzorce tekstowe (regex Perla), jeden na linię. |
| `fixtures/schemat-z-klasami-pominietymi.sql` | Dwie zwykłe tabele + widok zmaterializowany + tabela obca — do dowodu klas pominiętych. |
| `fixtures/schemat-bez-klas-pominietych.sql` | Ten sam kształt tabel, bez `mv`/`fdw` — porównanie (nie używany osobno w `dowod/` — tam ten sam efekt daje `drop` na istniejącym schemacie, patrz niżej). |
| `fixtures/dane-probne.sql` | Wiersze z znacznikami danych próbnych, w tym jeden własny znacznik-kanarek. |
| `fixtures/dane-zasieg-parsera.sql` | Trzy wektory zasięgu parsera zmierzone empirycznie jako ciche w starej wersji: kolumna nazwana znacznikiem (trafia do nagłówka `COPY`), duży obiekt z treścią-znacznikiem (trafia do `SELECT pg_catalog.lowrite(...)` szesnastkowo), i relacja, której CAŁA nazwa niesie znacznik (inny kształt źródłowy niż kolumna, ta sama linia nagłówka). |
| `fixtures/dane-duzy-obiekt-rozciety.sql` | Duży obiekt, którego treść `pg_dump` zapisuje DWOMA wywołaniami `lowrite` ze znacznikiem rozdzielonym dokładnie na ich granicy (16384 B) — żaden kawałek zdekodowany osobno nie niesie pełnego znacznika. |
| `fixtures/manifest-klas-pominietych.sql` | Zapytanie liczące relacje klas `m`/`f` w bazie źródłowej — zawsze wypisuje OBIE klasy, z `liczba=0`, gdy klasy nie ma (nie "group by" bez zapasu). |
| `dowod/uruchom-dowod.sh` | Dowód, NIE kod produkcyjny — patrz niżej. |
| `dowod/OCZEKIWANIA.md` | Tabela wektor → kod oczekiwany → przypadek w dowodzie → uzasadnienie, czytelna PRZED uruchomieniem dowodu, bez czytania kodu. |

## Uruchomienie dowodu

```
bash deploy/kontrola-zrzutu-danych-probnych/dowod/uruchom-dowod.sh KATALOG_LOGOW
```

Wymaga tylko `docker` (obraz `postgres:17`). Liczy kontenery i wolumeny
**przed** swoim biegiem, stawia jeden, jednorazowy kontener (`docker run
--rm`, bez nazwanego wolumenu, `--network none`), ładuje schemat z klasami
pominiętymi (bierze od razu zrzut ze wszystkimi tabelami legalnie pustymi —
wiersz 14 niżej), dane próbne **i trzy wektory zasięgu parsera**
(`fixtures/dane-zasieg-parsera.sql` — kolumna-nazwana-znacznikiem, duży
obiekt-z-treścią-znacznikiem, relacja-nazwana-znacznikiem), robi zrzut PRZED
w formacie tekstowym **i** ten sam stan bazy w formacie `-F custom`, symuluje
błąd `pg_dump` (zła nazwa bazy — dowód, że błąd procesu mierzącego NIE jest
liczony jako "0"; plik po prawej stronie przekierowania i tak powstaje,
pusty, i jest niżej **podany `kontrola-zrzutu.sh` jako `PLIK_PO`**, żeby
dowód badał bramkę, nie tylko sam `pg_dump`), czyści tabele **wstawiając w
ich miejsce wiersze czyste, bez znacznika** (nie samo `truncate` — zrzut PO
ma pokazać tabelę legalnie pustą OBOK tabel niepustych-ale-czystych) i robi
zrzut PO, usuwa `mv`/`fdw` i liczy manifest jeszcze raz (dowód, że log z
zerową liczbą różni się od logu z niezerową).

Izoluje SEKWENCYJNIE (usuń wektor, zrzuć; kolejny wektor, zrzuć; ...)
każdy z czterech wektorów zasięgu parsera na własnym zrzucie (kolumna w
nagłówku `COPY`, duży obiekt jednym `lowrite`, duży obiekt rozdzielony na
dwa `lowrite` na granicy 16384 B, nazwa relacji w nagłówku `COPY`), dokłada
trzy dalsze zepsute warianty `PLIK_PO` (0 B, bez bloku `COPY` z wartością
wrażliwą w tekście, blok `COPY` urwany w połowie), jeden zrzut strukturalnie
poprawny z wartością wrażliwą wstrzykniętą **poza** blokiem `COPY`, jeden
katalog puste (symulacja `-F directory`) — we wszystkich powyższych
`PLIK_PRZED` zostaje niezmienionym, poprawnym zrzutem tekstowym (kontrola
dodatnia przechodzi), żeby pokazać, że popsucie/format samego `PLIK_PO`
wystarcza do stanu 2 lub 3 niezależnie od `PLIK_PRZED`.

Uruchamia `kontrola-zrzutu.sh` w **osiemnastu** konfiguracjach łącznie —
mapowanie każdego przypadku na wektor zlecenia jest w `dowod/OCZEKIWANIA.md`
(czytelne PRZED uruchomieniem, bez czytania kodu). Każdy bieg niesie **kod
OCZEKIWANY**, doklejony do wywołania jako argument — `run_kontrola` porównuje
go z kodem FAKTYCZNYM tego samego procesu i zapisuje wynik (`OK`/`ZLE`) do
`00-podsumowanie.txt`; jedna niezgodność wystarcza, żeby `uruchom-dowod.sh`
sam skończył kodem **sterowanym i nazwanym** (`DOWOD_KOD_CZERWONY=3` w
nagłówku pliku, ODRÓŻNIALNYM od wywrotki środowiska — dawna wersja kończyła
się gołym `exit 1`, nieodróżnialnym od awarii powłoki; wada rozstrzygająca:
jeszcze wcześniejsza wersja zapisywała kod do pliku `.kod` i nigdy go z
niczym nie porównywała — atrapa `exit 0` podstawiona pod przyrząd kończyła
dowód kodem 0 mimo błędnych wyników; zmienna środowiskowa
`DOWOD_SKRYPT_KONTROLA` istnieje wyłącznie do tej kontroli negatywnej).
Sprząta kontener **wraz z jego anonimowym wolumenem** (`docker run --rm`
plus zapasowe `docker rm -fv` w `trap`, nigdy `docker volume rm`) i liczy
kontenery/wolumeny **po** — obie liczby (przed/po) trafiają do logu.

Żaden plik pod `KATALOG_LOGOW` nie trafia do repozytorium — katalog jest
podawany przez wołającego, spoza drzewa gita.

## Wołający

Ten katalog **nie ma w tym repozytorium żadnego wołającego** — nic w
potoku wdrożenia nie uruchamia `kontrola-zrzutu.sh` automatycznie po kroku
czyszczenia danych próbnych (`grep -rn "kontrola-zrzutu" poza tym
katalogiem` → brak wyników w drzewie na dzień pisania tego zdania). Ten
przyrząd chroni **tylko wtedy**, gdy ktoś (operator albo osobny krok
potoku, spoza tego katalogu) uruchomi go ręcznie z prawidłowymi
`PLIK_PRZED`/`PLIK_PO` po prawdziwym odtworzeniu bazy próbnej. Podłączenie
go jako krok automatyczny (np. w `deploy/prod/odtworzenie-probne.sh`) jest
osobnym zadaniem, poza zakresem tego katalogu.
