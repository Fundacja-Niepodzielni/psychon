#!/usr/bin/env bash
# Kontrola danych probnych na TEKSTOWYM ZRZUCIE "pg_dump --data-only"
# (format "-F plain", domyslny bez "-F"). Formaty "-F custom" (binarny,
# sygnatura "PGDMP") i "-F directory" (katalog) NIE SA obslugiwane - ten
# przyrzad to WYKRYWA i MOWI wprost (STAN=2, przyczyna nazwana), zamiast
# milczec pod ogolnym "brak bloku COPY".
#
# Co ten przyrzad PRZESZUKUJE: kazda wartosc w kazdej kolumnie kazdej
# relacji, dla ktorej "pg_dump --data-only" (format tekstowy, COPY) wypisal
# blok danych - czyli zwykle tabele (i partycje-liscie tabel partycjonowanych,
# bo te tez dostaja wlasny blok COPY). Dopasowanie idzie na WARTOSCI JAKO
# TEKST wobec wzorcow z pliku wzorcow (patrz wzorce-probne.txt) - ten
# przyrzad nie twierdzi NIC o typie zadeklarowanym w schemacie kolumny.
#
# Czego ten przyrzad NIE PRZESZUKUJE per-kolumna (zmierzone empirycznie na
# postgres:17, patrz README.md tego katalogu - "pg_dump --data-only" bez
# dodatkowych flag tych klas po prostu nie wypisuje w zrzucie):
#   - widoki zmaterializowane (relkind=m),
#   - tabele obce / FDW (relkind=f, bez "--include-foreign-data"),
#   - wszystko, co nie ma wlasnego bloku "COPY ... FROM stdin;" w zrzucie
#     (np. zwykle widoki - te nie maja wlasnego przechowywania w ogole; a w
#     zrzucie, ktory taki blok MA, tresc POZA blokami COPY - komentarze,
#     polecenia SET, "SELECT setval(...)" dla sekwencji).
# Liczba pominietych relacji (m/f) w bazie zrodlowej NIE wynika z samego
# zrzutu - jesli operator poda manifest (czwarty argument), przyrzad go
# WYPISZE; bez manifestu przyrzad mowi wprost, ze liczby nie zna - nigdy nie
# zaklada zera. Tresc POZA blokami COPY (naglowki COPY wlacznie) NIE jest
# cicho pomijana: kazde dopasowanie wzorca tam trafia do logu jako TRAFIENIE
# (relacja+miejsce, nigdy wartosc pola) i LICZY SIE do stanu PLIK_PO - patrz
# "Kody wyjscia" nizej. To samo dotyczy tresci duzych obiektow zapisanych
# szesnastkowo przez pg_dump (SELECT pg_catalog.lowrite(...)).
#
# KONTROLA DODATNIA: PLIK_PRZED to zrzut wziety PRZED krokiem czyszczenia
# danych probnych (a wiec ma zawierac >0 znacznikow z definicji tego
# kroku w potoku). Jesli ten przyrzad znajdzie w PLIK_PRZED zero trafien,
# nie oddaje "0" dla PLIK_PO - zero bez przechodzacej kontroli dodatniej
# nie odroznia "PLIK_PO jest czysty" od "wzorce/zrzut/polaczenie sa zepsute",
# wiec konczy sie stanem 2, nazwanym w logu.
#
# NIEZALEZNA KONTROLA INTEGRALNOSCI PLIK_PO: kontrola dodatnia powyzej bada
# WYLACZNIE PLIK_PRZED - nie dowodzi nic o tym, czy PLIK_PO w ogole POCHODZI
# z udanego "pg_dump --data-only". Dlatego PLIK_PO (i PLIK_PRZED - ta sama
# regula, ten sam kod) jest osobno sprawdzany na WLASNA integralnosc: musi
# miec co najmniej jeden kompletny blok "COPY ... FROM stdin;" (parser liczy
# to jako RELACJI_COPY). Plik pusty (0 B), plik bez zadnego bloku COPY (np.
# smieci, nieudany zrzut, zla nazwa bazy przy "pg_dump") i blok COPY urwany
# w polowie (bez terminatora "\.") daja stan 2 - NIGDY 0 - niezaleznie od
# tego, czy kontrola dodatnia na drugim pliku przeszla.
#
# Kody wyjscia - DOKLADNIE trzy, kazdy uzyty jawnie w tym pliku:
#   0 = ZALICZONE - kontrola dodatnia przeszla (>0 w PLIK_PRZED), OBA pliki
#       maja co najmniej jeden blok COPY, PLIK_PO ma zero trafien W BLOKACH
#       COPY, zero trafien POZA blokami COPY (naglowki wlacznie) i zero
#       trafien w tresci duzych obiektow PO ZDEKODOWANIU - I zaden duzy
#       obiekt w PLIK_PO nie jest zapisany wiecej niz jednym wywolaniem
#       lowrite (patrz stan 2 nizej - inaczej zasieg jest niepewny, nie
#       czysty).
#   2 = NIE ZMIERZONO, z nazwana przyczyna: zly argument, brakujacy plik,
#       argument jest katalogiem (format -F directory?), plik zaczyna sie od
#       sygnatury 'PGDMP' (format -F custom - binarny, nieobslugiwany),
#       kontrola dodatnia nie przeszla, parser nie ukonczyl odczytu / plik
#       urwany w polowie bloku COPY, ktorykolwiek plik bez zadnego bloku
#       COPY, ALBO PLIK_PO niesie duzy obiekt zapisany wiecej niz jednym
#       wywolaniem lowrite i zaden INNY warunek nie dal juz stanu 3 (tresc
#       kazdego wywolania jest dekodowana OSOBNO - wzorzec rozdzielony
#       dokladnie na granicy dwoch wywolan nie zostanie wykryty, wiec "zero
#       trafien" w takim obiekcie NIE jest tu wiarygodne jako "czysty").
#   3 = ZMIERZONE NARUSZENIE - kontrola dodatnia przeszla, oba pliki
#       strukturalnie poprawne, I PLIK_PO ma >0 trafien W BLOKACH COPY, LUB
#       >0 trafien POZA blokami COPY (naglowek COPY z nazwa kolumny niosaca
#       wzorzec wlacznie), LUB >0 trafien w zdekodowanej tresci duzego
#       obiektu; lista TRAFIENIE (relacja+kolumna+wzorzec+liczba w blokach
#       COPY, relacja+miejsce+wzorzec+liczba poza nimi) idzie do logu
#       (NIGDY wartosc pola).
# Kazdy INNY kod wyjscia tego skryptu (np. z przerwania przez powloke pod
# "set -u") jest WLASNOSCIA srodowiska, w ktorym przyrzad nie doszedl do
# konca - to nie jest zaden z trzech stanow powyzej i nikt tu nie wylicza
# jego mozliwych zrodel.
set -uo pipefail

STAN_ZALICZONE=0
STAN_NIE_ZMIERZONO=2
STAN_NARUSZENIE=3

PLIK_PRZED="${1:-}"
PLIK_PO="${2:-}"
PLIK_WZORCOW="${3:-}"
PLIK_KLAS_POMINIETYCH="${4:-}"

if [ -z "$PLIK_PRZED" ] || [ -z "$PLIK_PO" ] || [ -z "$PLIK_WZORCOW" ]; then
    echo "kontrola-zrzutu: uzycie: $0 PLIK_PRZED PLIK_PO PLIK_WZORCOW [PLIK_KLAS_POMINIETYCH]" >&2
    echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - brak wymaganych argumentow" >&2
    exit "$STAN_NIE_ZMIERZONO"
fi

for PLIK in "$PLIK_PRZED" "$PLIK_PO" "$PLIK_WZORCOW"; do
    if [ -d "$PLIK" ]; then
        echo "kontrola-zrzutu: '$PLIK' jest katalogiem, nie plikiem - ten przyrzad przyjmuje WYLACZNIE pojedynczy plik tekstowego zrzutu ('pg_dump --data-only' bez '-F', czyli format '-F plain'). Zrzut w formacie '-F directory' (katalog z wieloma plikami) NIE JEST obslugiwany - ten przyrzad go nie przeszukuje." >&2
        echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - argument jest katalogiem (format -F directory?)" >&2
        exit "$STAN_NIE_ZMIERZONO"
    fi
    if [ ! -f "$PLIK" ]; then
        echo "kontrola-zrzutu: plik '$PLIK' nie istnieje" >&2
        echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - brakujacy plik wejsciowy" >&2
        exit "$STAN_NIE_ZMIERZONO"
    fi
done

# --- Format zrzutu: ten przyrzad przeszukuje WYLACZNIE tekstowy format
#     "-F plain" (domyslny dla "pg_dump --data-only" bez "-F"). Format
#     "-F custom" jest binarny i zaczyna sie od sygnatury "PGDMP" - bez tego
#     sprawdzenia taki plik konczyl sie tym samym "brak bloku COPY" co
#     zwykle smieci, co MILCZY o PRAWDZIWEJ przyczynie (format, nie usterka).
#     "-F directory" jest katalogiem, zlapanym wyzej. ---
for PLIK in "$PLIK_PRZED" "$PLIK_PO"; do
    MAGIC="$(head -c 5 "$PLIK" 2>/dev/null || true)"
    if [ "$MAGIC" = "PGDMP" ]; then
        echo "kontrola-zrzutu: '$PLIK' zaczyna sie od sygnatury 'PGDMP' - to zrzut w formacie '-F custom' (binarny), NIE tekstowym '-F plain'. Ten przyrzad przeszukuje WYLACZNIE tekstowy format '-F plain' - '-F custom'/'-F directory' NIE SA obslugiwane." >&2
        echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - format zrzutu nieobslugiwany (-F custom)" >&2
        exit "$STAN_NIE_ZMIERZONO"
    fi
done

SKRYPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSER="$SKRYPT_DIR/policz-trafienia.pl"
if [ ! -f "$PARSER" ]; then
    echo "kontrola-zrzutu: brak '$PARSER'" >&2
    echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - przyrzad niekompletny" >&2
    exit "$STAN_NIE_ZMIERZONO"
fi

# --- Rozmiary przeszukanych zbiorow - ZAWSZE wypisane, niezaleznie
#     od tego, co przyrzad w koncu oddaje. ---
BAJTY_PRZED=$(wc -c < "$PLIK_PRZED" | tr -d ' ')
WIERSZE_PLIKU_PRZED=$(wc -l < "$PLIK_PRZED" | tr -d ' ')
BAJTY_PO=$(wc -c < "$PLIK_PO" | tr -d ' ')
WIERSZE_PLIKU_PO=$(wc -l < "$PLIK_PO" | tr -d ' ')
echo "kontrola-zrzutu: rozmiar PLIK_PRZED = ${BAJTY_PRZED} B / ${WIERSZE_PLIKU_PRZED} wierszy pliku"
echo "kontrola-zrzutu: rozmiar PLIK_PO    = ${BAJTY_PO} B / ${WIERSZE_PLIKU_PO} wierszy pliku"

# --- NAZWANE KLASY relacji poza zrzutem - ZAWSZE wypisane. ---
echo "kontrola-zrzutu: klasy relacji, ktorych 'pg_dump --data-only' NIE WYPISUJE: widoki zmaterializowane (relkind=m), tabele obce/FDW (relkind=f)"
if [ -n "$PLIK_KLAS_POMINIETYCH" ] && [ -f "$PLIK_KLAS_POMINIETYCH" ]; then
    echo "kontrola-zrzutu: manifest liczby tych relacji w bazie zrodlowej ($PLIK_KLAS_POMINIETYCH):"
    sed 's/^/kontrola-zrzutu:   /' "$PLIK_KLAS_POMINIETYCH"
else
    echo "kontrola-zrzutu: manifest liczby relacji pominietych klas NIE PODANY jako 4. argument - liczba nieznana (same klasy sa nieprzeszukane niezaleznie od tego, czy manifest jest podany)"
fi

# --- Parser na PLIK_PRZED (kontrola dodatnia) ---
# Gate na kodzie wyjscia PROCESU liczacego (perl), doklejony przez &&/||
# na TEJ SAMEJ linii co samo wywolanie - nie osobnym "if" po zapisaniu
# wyniku do zmiennej.
WYNIK_PRZED="$(perl "$PARSER" "$PLIK_PRZED" "$PLIK_WZORCOW")" && KOD_PARSERA_PRZED=0 || KOD_PARSERA_PRZED=$?
if [ "$KOD_PARSERA_PRZED" -ne 0 ]; then
    echo "kontrola-zrzutu: parser nie ukonczyl odczytu PLIK_PRZED (kod perl=$KOD_PARSERA_PRZED)" >&2
    echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - odczyt PLIK_PRZED zawiodl" >&2
    exit "$STAN_NIE_ZMIERZONO"
fi

SUMA_PRZED="$(printf '%s\n' "$WYNIK_PRZED" | grep -E '^SUMA=' | cut -d= -f2)"
if [ -z "$SUMA_PRZED" ]; then
    echo "kontrola-zrzutu: parser nie zwrocil linii SUMA= dla PLIK_PRZED - pusty wynik pomiaru to NIE zero" >&2
    echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - wynik parsera niekompletny" >&2
    exit "$STAN_NIE_ZMIERZONO"
fi
echo "kontrola-zrzutu: rozmiary przeszukanego PLIK_PRZED: $(printf '%s\n' "$WYNIK_PRZED" | grep -E '^(WIERSZE_DANYCH|RELACJI_COPY|LINIE_NIE_COPY|POZA_COPY|DUZY_OBIEKT_LINIE|DUZY_OBIEKT_TRAFIENIA)=' | tr '\n' ' ')"
echo "kontrola-zrzutu: kontrola dodatnia - znacznikow danych probnych w PLIK_PRZED = $SUMA_PRZED"

RELACJI_COPY_PRZED="$(printf '%s\n' "$WYNIK_PRZED" | grep -E '^RELACJI_COPY=' | cut -d= -f2)"
if [ -z "$RELACJI_COPY_PRZED" ] || [ "$RELACJI_COPY_PRZED" -eq 0 ]; then
    echo "kontrola-zrzutu: PLIK_PRZED nie ma ani jednego bloku COPY - nie wyglada na udany tekstowy zrzut 'pg_dump --data-only' (pusty plik, uszkodzony zrzut, albo tresc spoza tego formatu)" >&2
    echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - PLIK_PRZED strukturalnie nie jest zrzutem" >&2
    exit "$STAN_NIE_ZMIERZONO"
fi

if [ "$SUMA_PRZED" -eq 0 ]; then
    echo "kontrola-zrzutu: kontrola dodatnia NIE PRZESZLA - PLIK_PRZED ma zero trafien mimo $RELACJI_COPY_PRZED znalezionych bloku(ow) COPY" >&2
    echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - przyrzad nie widzial" >&2
    exit "$STAN_NIE_ZMIERZONO"
fi

# --- Parser na PLIK_PO (wlasciwy pomiar, tylko jesli kontrola dodatnia przeszla) ---
WYNIK_PO="$(perl "$PARSER" "$PLIK_PO" "$PLIK_WZORCOW")" && KOD_PARSERA_PO=0 || KOD_PARSERA_PO=$?
if [ "$KOD_PARSERA_PO" -ne 0 ]; then
    echo "kontrola-zrzutu: parser nie ukonczyl odczytu PLIK_PO (kod perl=$KOD_PARSERA_PO)" >&2
    echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - odczyt PLIK_PO zawiodl" >&2
    exit "$STAN_NIE_ZMIERZONO"
fi

SUMA_PO="$(printf '%s\n' "$WYNIK_PO" | grep -E '^SUMA=' | cut -d= -f2)"
if [ -z "$SUMA_PO" ]; then
    echo "kontrola-zrzutu: parser nie zwrocil linii SUMA= dla PLIK_PO - pusty wynik pomiaru to NIE zero" >&2
    echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - wynik parsera niekompletny" >&2
    exit "$STAN_NIE_ZMIERZONO"
fi
echo "kontrola-zrzutu: rozmiary przeszukanego PLIK_PO: $(printf '%s\n' "$WYNIK_PO" | grep -E '^(WIERSZE_DANYCH|RELACJI_COPY|LINIE_NIE_COPY|POZA_COPY|DUZY_OBIEKT_LINIE|DUZY_OBIEKT_TRAFIENIA|DUZY_OBIEKT_WIELOKROTNY)=' | tr '\n' ' ')"
echo "kontrola-zrzutu: znacznikow danych probnych w PLIK_PO (wylacznie w blokach COPY) = $SUMA_PO"

RELACJI_COPY_PO="$(printf '%s\n' "$WYNIK_PO" | grep -E '^RELACJI_COPY=' | cut -d= -f2)"
if [ -z "$RELACJI_COPY_PO" ] || [ "$RELACJI_COPY_PO" -eq 0 ]; then
    echo "kontrola-zrzutu: PLIK_PO nie ma ani jednego bloku COPY - nie wyglada na udany tekstowy zrzut 'pg_dump --data-only' (pusty plik, zerwane polaczenie, zla nazwa bazy, albo inny nieudany 'pg_dump --data-only')" >&2
    echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - PLIK_PO strukturalnie nie jest zrzutem, wiec 'zero trafien' nie ma znaczenia" >&2
    exit "$STAN_NIE_ZMIERZONO"
fi

# --- Bramka na PLIK_PO: TRZY liczniki niezaleznie moga podniesc stan do 3 -
#     wewnatrz blokow COPY (SUMA_PO), poza nimi jako caly tekst linii
#     (POZA_COPY_PO, naglowek COPY z nazwa kolumny niosaca wzorzec wlacznie),
#     i w zdekodowanej tresci duzych obiektow (DUZY_OBIEKT_TRAFIENIA_PO).
#     Zaden z trzech nie jest tu juz "tylko widoczny w logu" - kazdy
#     samodzielnie wystarcza do STAN=3. ---
POZA_COPY_PO="$(printf '%s\n' "$WYNIK_PO" | grep -E '^POZA_COPY=' | cut -d= -f2)"
DUZY_OBIEKT_TRAFIENIA_PO="$(printf '%s\n' "$WYNIK_PO" | grep -E '^DUZY_OBIEKT_TRAFIENIA=' | cut -d= -f2)"
DUZY_OBIEKT_WIELOKROTNY_PO="$(printf '%s\n' "$WYNIK_PO" | grep -E '^DUZY_OBIEKT_WIELOKROTNY=' | cut -d= -f2)"
if [ -z "$POZA_COPY_PO" ] || [ -z "$DUZY_OBIEKT_TRAFIENIA_PO" ] || [ -z "$DUZY_OBIEKT_WIELOKROTNY_PO" ]; then
    echo "kontrola-zrzutu: parser nie zwrocil jednego z licznikow POZA_COPY/DUZY_OBIEKT_TRAFIENIA/DUZY_OBIEKT_WIELOKROTNY dla PLIK_PO - wynik pomiaru niekompletny" >&2
    echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - wynik parsera niekompletny" >&2
    exit "$STAN_NIE_ZMIERZONO"
fi

if [ "$SUMA_PO" -gt 0 ] || [ "$POZA_COPY_PO" -gt 0 ] || [ "$DUZY_OBIEKT_TRAFIENIA_PO" -gt 0 ]; then
    echo "kontrola-zrzutu: STAN=3 (ZMIERZONE NARUSZENIE) - $SUMA_PO trafien w blokach COPY, $POZA_COPY_PO poza nimi, $DUZY_OBIEKT_TRAFIENIA_PO w zdekodowanej tresci duzych obiektow, w PLIK_PO:" >&2
    printf '%s\n' "$WYNIK_PO" | grep -E '^TRAFIENIE ' | sed 's/^/kontrola-zrzutu:   /' >&2
    exit "$STAN_NARUSZENIE"
fi

# --- Zaden z trzech powyzszych licznikow nie znalazl niczego. Zanim to
#     nazwiemy "czysty", sprawdzamy jeszcze, czy PLIK_PO nie niesie duzego
#     obiektu zapisanego wiecej niz jednym wywolaniem lowrite - kazde
#     wywolanie jest dekodowane OSOBNO (patrz policz-trafienia.pl), wiec
#     wzorzec rozdzielony dokladnie na granicy dwoch takich wywolan nie
#     zostanie wykryty i "zero trafien" tu NIE jest wiarygodne. ---
if [ "$DUZY_OBIEKT_WIELOKROTNY_PO" -gt 0 ]; then
    echo "kontrola-zrzutu: PLIK_PO niesie $DUZY_OBIEKT_WIELOKROTNY_PO duzy(ych) obiekt(ow) zapisanych wiecej niz jednym wywolaniem lowrite - tresc kazdego wywolania jest dekodowana osobno, znacznik rozdzielony na granicy dwoch wywolan nie zostanie wykryty" >&2
    echo "kontrola-zrzutu: STAN=2 (NIE ZMIERZONO) - zasieg duzego obiektu niepewny" >&2
    exit "$STAN_NIE_ZMIERZONO"
fi

echo "kontrola-zrzutu: STAN=0 (ZALICZONE) - kontrola dodatnia przeszla ($SUMA_PRZED w PLIK_PRZED), PLIK_PO strukturalnie poprawny ($RELACJI_COPY_PO blok(ow) COPY) i czysty (0 w blokach COPY, 0 poza nimi, 0 w duzych obiektach, zaden duzy obiekt wielokrotny)"
exit "$STAN_ZALICZONE"
