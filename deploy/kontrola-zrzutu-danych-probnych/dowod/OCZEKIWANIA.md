# Oczekiwania dowodu (do przeczytania PRZED uruchomieniem)

Ten plik czyta sie PRZED "uruchom-dowod.sh", bez czytania kodu przyrzadu.
Kazdy wiersz nizej to jeden bieg "run_kontrola" w "uruchom-dowod.sh" (nazwa
przypadku identyczna z pierwszym argumentem tego wywolania). Oczekiwania to
TWIERDZENIA, nie konfiguracja: kazdy przypadek, ktory oczekuje kodu 0 MIMO
obecnego w bazie zrodlowej znacznika, ma tu wlasne zdanie, dlaczego to NIE
jest wyciek. Wiersz bez odpowiadajacego przypadku w "uruchom-dowod.sh" jest
bledem tego pliku, nie przyrzadu.

Numeracja "#" nizej to numeracja wektorow ze zlecenia (14 wierszy minimum);
wiersz "6a" to dodatkowy wektor dopisany w trakcie biegu (nazwa relacji), bo
zlecenie mowi wprost: "Lista jest minimum, nie sufitem."

| # | wektor | oczekiwany kod | przypadek w dowodzie | dlaczego |
|---|---|---|---|---|
| 1 | znacznik w wartosci wewnatrz bloku COPY | 3 | `11-stan3-naruszenie` | PLIK_PO = ten sam brudny zrzut co PLIK_PRZED - wartosc niosaca znacznik jest w normalnym wierszu danych, wewnatrz bloku COPY; to jest wyciek z definicji. |
| 2 | znacznik w wartosci poza blokiem COPY | 3 | `23-stan3-poza-copy-widoczne` | Linia wstrzykniete tuz za terminatorem "\." (poza jakimkolwiek blokiem COPY) niesie znacznik - to nadal ten sam zrzut, ten sam plik na dysku po operacji "czyszczenia"; miejsce w pliku nie zmienia tego, ze tresc wyciekla. |
| 3 | znacznik w nazwie kolumny w linii naglowka COPY | 3 | `24-stan3-naglowek-copy` | Naglowek "COPY schemat.tabela (..., "notatka_ZNACZNIK-...", ...) FROM stdin;" niesie znacznik w SAMEJ NAZWIE kolumny, nie w wartosci - to wciaz tekst, ktory operator zobaczy w PLIK_PO; to, ze jest w naglowku a nie w wierszu danych, nie czyni go niewidzialnym. |
| 4 | znacznik w duzym obiekcie (lowrite, jedno wywolanie, hex) | 3 | `25-stan3-duzy-obiekt` | Duzy obiekt zapisany JEDNYM wywolaniem "lowrite" ma cala tresc w jednym, w pelni dekodowalnym kawalku hex - po zdekodowaniu marker jest kompletny i wykrywalny, wiec brak dwuznacznosci: to jest wyciek. |
| 5 | znacznik rozciety na dwa lowrite (granica ok. 16 kB, zmierzone empirycznie) | 2 | `26-stan2-duzy-obiekt-rozciety` | Kazde wywolanie "lowrite" jest dekodowane OSOBNO; znacznik rozdzielony dokladnie na granicy dwoch wywolan nie zostanie zlozony z powrotem przez ten przyrzad - "zero trafien" w takim obiekcie nie jest tu wiarygodne jako "czysty", wiec przyrzad NAZYWA niepewnosc zamiast cicho oddac 0. |
| 6 | znacznik w nazwie relacji przypominajacej domene probna | 3 | `30-stan3-nazwa-relacji` | Caly identyfikator relacji (nie kolumny) niesie tekst znacznika w cudzyslowiu - trafia do tej samej linii naglowka COPY co wektor 3, ale to inny ksztalt zrodlowy (relacja, nie kolumna); operator zobaczy ta nazwe w PLIK_PO niezaleznie od tego, ze wartosci w tabeli sa czyste. |
| 7 | PLIK_PO 0 B | 2 | `19-stan2-po-pusty` | Plik pusty nie ma ani jednego bloku COPY - to nie jest "czysty zrzut", to brak zrzutu (tu: nieudany "pg_dump" wobec nieistniejacej bazy); zero trafien w niczym nie jest tym samym co zero trafien w prawdziwym zrzucie. |
| 8 | PLIK_PO bez bloku COPY | 2 | `20-stan2-po-bez-copy` | Smieci tekstowe (nawet niosace wrazliwy adres) bez struktury "COPY ... FROM stdin;" nie sa zrzutem "pg_dump --data-only" - przyrzad odmawia orzekania "czysty" o czyms, co nie ma ksztaltu, jaki umie czytac. |
| 9 | PLIK_PO z urwanym blokiem COPY | 2 | `21-stan2-po-urwany` | Blok COPY bez terminatora "\." jest zrzutem uciety w polowie - reszta wierszy (i ewentualny znacznik w nich) nigdy nie dotarla do pliku; "zero trafien w tym, co jest" nie dowodzi "zero trafien w tym, co powinno tam byc". |
| 10 | martwa kontrola dodatnia (znacznik nieobecny w PLIK_PRZED) | 2 | `12-stan2-kontrola-dodatnia-pusta` | Jesli PLIK_PRZED (ktory z definicji kroku "przed czyszczeniem" powinien miec >0 trafien) ma zero, to albo wzorce/polaczenie/zrzut sa zepsute, albo argumenty sa zamienione - zero w PLIK_PO w tej sytuacji nie odroznia "czysto" od "przyrzad nic nie widzi", wiec kod jest 2, nie 0. |
| 11a | zrzut "-F custom" (sygnatura "PGDMP") | 2 | `28-stan2-format-custom` | Przyrzad przeszukuje wylacznie tekst; plik binarny zaczynajacy sie od "PGDMP" jest wykrywany PO SYGNATURZE i nazwany wprost jako nieobslugiwany format, zamiast wpasc w ogolne "brak bloku COPY" i zmylic operatora co do przyczyny. |
| 11b | zrzut "-F directory" (katalog) | 2 | `29-stan2-format-directory` | Katalog nie jest plikiem tekstowym w ogole - test "[ -d ... ]" lapie to PRZED probą odczytu zawartosci i nazywa mozliwa przyczyne (format -F directory) wprost. |
| 12 | czysty zrzut, znacznik nieobecny (oba wektory zasiegu i tresc danych czyste) | 0 | `10-stan0-czysty` | PLIK_PO pochodzi z bazy, w ktorej WSZYSTKIE cztery wektory zasiegu (kolumna, relacja, duzy obiekt x2) zostaly usuniete z bazy zrodlowej PRZED zrzutem (nie tylko "nie trafily") - kontrola dodatnia na PLIK_PRZED przechodzi, PLIK_PO ma zero trafien w kazdym z liczonych miejsc. |
| 13 | legalnie pusta tabela (obok tabel z czystymi danymi) | 0 | `10-stan0-czysty` (ten sam zrzut co #12) | "tabela_zawsze_pusta" nigdy nie dostaje wiersza (nie jest "wyczyszczona") i wspolistnieje w TYM SAMYM zrzucie z "personel"/"uczestnicy" zawierajacymi swiezo wstawione, czyste wiersze (patrz krok czyszczenia w "uruchom-dowod.sh") - pusty blok COPY obok blokow z danymi nie jest sam w sobie podejrzany. |
| 14 | wszystkie tabele legalnie puste | 0 | `27-stan0-wszystkie-puste` | PLIK_PO to zrzut wziety TUZ PO ZALOZENIU SCHEMATU, przed jakimkolwiek "insert" - "personel", "uczestnicy" i "tabela_zawsze_pusta" sa rownoczesnie puste z tego samego powodu (baza jest swieza), nie efekt "czyszczenia"; kontrola dodatnia dalej idzie po brudnym PLIK_PRZED, wiec pomiar PLIK_PO jest niezalezny. |

## Pomiar odwrotny (kontrola negatywna wymagana przez zlecenie)

Cofnieta zostala WYLACZNIE jedna linia bramki w "kontrola-zrzutu.sh" (ta,
ktora sprawdza `SUMA_PO`/`POZA_COPY_PO`/`DUZY_OBIEKT_TRAFIENIA_PO` przed
przyznaniem stanu 3) - z powrotem na sam `SUMA_PO`, dokladnie jak przed
naprawa. Liczniki `POZA_COPY`/`DUZY_OBIEKT_TRAFIENIA` zostaja liczone i
wypisywane w logu (WIDOCZNE), ale przestaja WPLYWAC na kod wyjscia. Taki
skrypt, podstawiony przez `DOWOD_SKRYPT_KONTROLA`, ma zaczerwienic dowod
DOKLADNIE na przypadkach idacych przez cofniete liczniki: `23-stan3-poza-copy-widoczne`
(wartosc poza blokiem COPY), `24-stan3-naglowek-copy` (nazwa kolumny w
naglowku COPY), `25-stan3-duzy-obiekt` (tresc duzego obiektu) oraz
`30-stan3-nazwa-relacji` (nazwa relacji w naglowku COPY - trafia do TEJ
SAMEJ bramki co nazwa kolumny). Zaden inny przypadek nie powinien sie
zmienic (w szczegolnosci `26-stan2-duzy-obiekt-rozciety` zostaje przy 2 -
ten wektor idzie przez ODREBNY licznik `DUZY_OBIEKT_WIELOKROTNY`, nie
cofniety tu).
