#!/usr/bin/env perl
# Liczy trafienia wzorcow danych probnych w tekstowym zrzucie
# "pg_dump --data-only" (format tekstowy COPY, nie -F custom/-F directory).
#
# NIGDY nie wypisuje dopasowanej wartosci pola - tylko nazwe relacji, nazwe
# kolumny, numer wzorca i LICZBE trafien. Wartosc pola zostaje w zrzucie,
# nie w logu.
#
# Uzycie: policz-trafienia.pl PLIK_ZRZUTU PLIK_WZORCOW
#
# Wyjscie (stdout), jedna wartosc na linie:
#   WIERSZE_DANYCH=<n>   - laczna liczba wierszy danych przeczytanych z
#                           WSZYSTKICH blokow COPY w zrzucie
#   RELACJI_COPY=<n>     - liczba ROZNYCH relacji, dla ktorych zrzut mial
#                           blok "COPY ... FROM stdin;". Zero tu oznacza, ze
#                           plik NIE MA ani jednego bloku COPY - wolajacy ma
#                           to potraktowac jako "przyrzad nie widzial", NIGDY
#                           jako "zero trafien" (pusty/uszkodzony zrzut i
#                           czysty zrzut wygladaja identycznie po SUMA, ale
#                           roznia sie po RELACJI_COPY).
#   LINIE_NIE_COPY=<n>   - liczba WSZYSTKICH linii spoza blokow COPY (naglowki
#                           COPY wlacznie, komentarze, polecenia SET, "SELECT
#                           setval(...)" dla sekwencji, wywolania duzych
#                           obiektow lo_create/lo_open/lowrite/lo_close, ...) -
#                           WSZYSTKIE, dopasowane czy nie. Ten licznik istnieje
#                           zeby zasieg poza COPY byl zawsze widoczny jako
#                           liczba, nigdy jako cisza (poprzednia wersja tego
#                           przyrzadu miala tu dziure: linia naglowka "COPY ...
#                           (kolumny...) FROM stdin;" byla polykana przed
#                           dotarciem do sprawdzenia wzorca i nie liczyla sie
#                           NIGDZIE - ani tu, ani w POZA_COPY - gdy nazwa
#                           kolumny sama niosla wzorzec. Naprawione: kazda
#                           linia poza blokiem COPY, WLACZNIE z linia naglowka,
#                           jest liczona i sprawdzana PRZED decyzja, czy
#                           otwiera blok).
#   POZA_COPY=<n>        - PODZBIOR powyzszego: linie spoza blokow COPY, ktore
#                           dopasowaly ktorykolwiek wzorzec jako CALY TEKST
#                           LINII (wlacznie z linia naglowka COPY, patrz
#                           wyzej). Ten przyrzad NIE przeszukuje tresci poza
#                           blokami COPY per-kolumna i NIE liczy tych trafien
#                           do SUMA - ale (patrz TRAFIENIE nizej) KAZDE takie
#                           trafienie jest zglaszane wolajacemu jako osobna
#                           linia TRAFIENIE, i wolajacy (kontrola-zrzutu.sh)
#                           PODNOSI stan do 3, gdy POZA_COPY>0 - ten licznik
#                           NIE JEST juz kosmetyczny.
#   DUZY_OBIEKT_LINIE=<n> - PODZBIOR LINIE_NIE_COPY: liczba linii rozpoznanych
#                           jako zapis duzego obiektu w postaci szesnastkowej
#                           ("SELECT pg_catalog.lowrite(<fd>, '\x<hex>')"),
#                           ZAWSZE wypisana (takze jako 0) - to jest swiadomie
#                           ograniczony zasieg, wiec liczba ma byc widoczna,
#                           nie zalozona.
#   DUZY_OBIEKT_TRAFIENIA=<n> - z linii DUZY_OBIEKT_LINIE, liczba takich,
#                           ktorych szesnastkowa tresc PO ZDEKODOWANIU
#                           dopasowala ktorykolwiek wzorzec. Dekodowanie jest
#                           PER WYWOLANIE lowrite. Wolajacy (kontrola-zrzutu.sh)
#                           PODNOSI stan do 3, gdy DUZY_OBIEKT_TRAFIENIA>0.
#   DUZY_OBIEKT_WIELOKROTNY=<n> - liczba ROZNYCH duzych obiektow, ktorych
#                           tresc zostala zapisana WIECEJ NIZ jednym kolejnym
#                           wywolaniem lowrite (tresc dluzsza niz jeden kawalek
#                           - zmierzone empirycznie na postgres:17: kawalek ma
#                           16384 B, nie 2048 B, jak zakladal wczesniejszy
#                           komentarz w tym miejscu). Kazde wywolanie jest
#                           dekodowane OSOBNO (patrz DUZY_OBIEKT_TRAFIENIA) -
#                           wzorzec rozdzielony DOKLADNIE na granicy dwoch
#                           takich wywolan NIE JEST wykryty przez zadne z nich
#                           z osobna. Ten licznik istnieje, zeby ta luka nie
#                           byla cicha: wolajacy (kontrola-zrzutu.sh) PODNOSI
#                           stan do 2 (NIE ZMIERZONO), gdy
#                           DUZY_OBIEKT_WIELOKROTNY>0 i zadne inne kryterium
#                           nie juz dalo 3 - obecnosc wielokrotnego zapisu
#                           znaczy "nie wiem", nigdy cicho "0".
#   TRAFIENIE relacja=<schema.tabela|(brak)> kolumna=<nazwa> wzorzec=P<i>
#                         liczba=<n>
#                         - jedna linia na kazda (relacja,kolumna,wzorzec)
#                           z liczba>0 trafien WEWNATRZ blokow COPY.
#   TRAFIENIE relacja=<schema.tabela|(brak)> miejsce=<opis> wzorzec=P<i>
#                         liczba=1
#                         - jedna linia na kazda linie SPOZA blokow COPY, ktora
#                           dopasowala wzorzec (POZA_COPY) - "miejsce" jest
#                           "naglowek-copy" (linia naglowka niesie znacznik w
#                           nazwie kolumny, "relacja" wtedy znana) albo
#                           "poza-copy:linia=<n>" (dowolna inna linia spoza
#                           COPY, "relacja"=(brak) - ten przyrzad nie umie jej
#                           przypisac do zadnej tabeli) - albo jedna linia na
#                           kazde wywolanie lowrite, ktorego zdekodowana tresc
#                           dopasowala wzorzec (DUZY_OBIEKT_TRAFIENIA),
#                           "miejsce"="duzy-obiekt:linia=<n>", "relacja"=(brak)
#                           (duzy obiekt nie jest przypisany do zadnej kolumny
#                           w tekscie zrzutu). NIGDY wartosc pola/tresci -
#                           tylko relacja (gdy znana) i miejsce.
#   SUMA=<n>              - suma wszystkich trafien W BLOKACH COPY (ostatnia
#                           linia po TRAFIENIE, PRZED SUMA nie liczy POZA_COPY
#                           ani DUZY_OBIEKT_TRAFIENIA - to osobne liczniki,
#                           patrz wyzej, ktore wolajacy laczy z SUMA sam)
#
# Kod wyjscia 0 = zrzut PRZECZYTANY DO KONCA (niezaleznie od liczby trafien
# - "0 trafien" i "nie doczytano pliku" to ROZNE rzeczy, stad ten kod).
# Kazdy inny kod = plik zrzutu/wzorcow nieczytelny, wzorzec sie nie skompilowal,
# albo blok COPY zostal URWANY (otwarty naglowkiem "COPY ... FROM stdin;", bez
# terminatora "\." przed koncem pliku - dowod uciecia w polowie zrzutu) -
# wolajacy (kontrola-zrzutu.sh) ma to potraktowac jako NIE ZMIERZONO, nigdy
# jako "0".
use strict;
use warnings;

my ($plik_zrzutu, $plik_wzorcow) = @ARGV;
if (!defined $plik_zrzutu || !defined $plik_wzorcow) {
    die "policz-trafienia: uzycie: policz-trafienia.pl PLIK_ZRZUTU PLIK_WZORCOW\n";
}

open(my $fw, '<', $plik_wzorcow) or die "policz-trafienia: nie mozna otworzyc pliku wzorcow '$plik_wzorcow': $!\n";
my @wzorce;
while (my $linia = <$fw>) {
    chomp $linia;
    next if $linia =~ /^\s*$/;
    next if $linia =~ /^\s*#/;
    my $re = eval { qr/$linia/i };
    if (!defined $re) {
        die "policz-trafienia: wzorzec '$linia' sie nie kompiluje: $@\n";
    }
    push @wzorce, $re;
}
close $fw;
if (@wzorce == 0) {
    die "policz-trafienia: plik wzorcow '$plik_wzorcow' nie niesie zadnego wzorca\n";
}

open(my $fz, '<', $plik_zrzutu) or die "policz-trafienia: nie mozna otworzyc pliku zrzutu '$plik_zrzutu': $!\n";

my %trafienia;      # {relacja}{kolumna}{indeks_wzorca} = liczba
my $wiersze_danych = 0;
my %relacje_copy;   # relacja => 1
my $w_bloku = 0;
my @kolumny;
my $relacja_biezaca;
my $poza_copy = 0;         # PODZBIOR linie_nie_copy: dopasowane calym tekstem linii
my $linie_nie_copy = 0;    # WSZYSTKIE linie spoza blokow COPY, dopasowane czy nie
my $duzy_obiekt_linie = 0;      # PODZBIOR linie_nie_copy: wywolania lowrite() rozpoznane
my $duzy_obiekt_trafienia = 0;  # z tych, ile po zdekodowaniu hex dopasowalo wzorzec
my $duzy_obiekt_wielokrotny = 0;   # liczba obiektow zapisanych wiecej niz jednym lowrite
my $poprzednia_byla_lowrite = 0;   # sledzi ciag kolejnych linii lowrite (ten sam obiekt)
my $biezacy_ciag_juz_liczony = 0;  # zeby ciag >2 linii policzyc jako JEDEN obiekt wielokrotny
my @trafienia_poza;         # linie TRAFIENIE dla POZA_COPY/DUZY_OBIEKT_TRAFIENIA,
                             # zebrane tu i wypisane RAZEM z reszta na koncu, zeby
                             # kolejnosc wyjscia zostala taka sama jak przedtem
                             # (liczniki, potem TRAFIENIE, potem SUMA)

# Zapis duzego obiektu w formacie tekstowym pg_dump:
#   SELECT pg_catalog.lowrite(<fd>, '\x<tresc szesnastkowo>');
# Tresc jest szesnastkowa, wiec zwykle dopasowanie "caly tekst linii" (ponizej,
# to samo co POZA_COPY) prawie nigdy nie trafi w PLAINTEKSTOWY wzorzec - stad
# osobne dekodowanie PRZED sprawdzeniem wzorca (patrz DUZY_OBIEKT_* w naglowku).
my $wzorzec_lowrite = qr/^SELECT\s+pg_catalog\.lowrite\(\s*\d+\s*,\s*'\\x([0-9a-fA-F]*)'\s*\)\s*;?\s*$/i;

while (my $linia = <$fz>) {
    chomp $linia;
    if (!$w_bloku) {
        # KAZDA linia spoza blokow COPY jest liczona tu, ZANIM cokolwiek
        # zdecyduje, czy to naglowek "COPY ... FROM stdin;" - inaczej linia
        # naglowka jest polykana przez "next" nizej i nie liczy sie NIGDZIE,
        # nawet gdy sama niesie wzorzec (np. w nazwie kolumny). To byla cicha
        # dziura w zasiegu - teraz kazda linia poza COPY trafia do
        # LINIE_NIE_COPY, i jest sprawdzona wobec wzorcow jako caly tekst
        # (POZA_COPY), zanim ewentualnie otworzy blok COPY.
        $linie_nie_copy++;

        # Sprawdzone TU (nie nizej, przy otwarciu bloku), zeby znac nazwe
        # relacji juz w momencie zglaszania POZA_COPY dla TEJ SAMEJ linii,
        # gdy to ona wlasnie jest naglowkiem - $1/$2 z TEGO dopasowania,
        # zebrane od razu, zeby nie zgubic ich pod kolejnymi dopasowaniami
        # nizej (wzorce, potem lowrite).
        my ($naglowek_relacja, $naglowek_kolumny_tekst);
        if ($linia =~ /^COPY\s+(\S+)\s+\(([^)]*)\)\s+FROM\s+stdin;\s*$/) {
            $naglowek_relacja = $1;
            $naglowek_kolumny_tekst = $2;
        }

        my $numer_wzorca_poza;
        for (my $j = 0; $j < @wzorce; $j++) {
            if ($linia =~ $wzorce[$j]) {
                $poza_copy++;
                $numer_wzorca_poza = $j;
                last;
            }
        }
        if (defined $numer_wzorca_poza) {
            my $relacja_zglaszana = defined $naglowek_relacja ? $naglowek_relacja : '(brak)';
            my $miejsce = defined $naglowek_relacja ? 'naglowek-copy' : "poza-copy:linia=$.";
            push @trafienia_poza, 'TRAFIENIE relacja=' . $relacja_zglaszana . ' miejsce=' . $miejsce
                . ' wzorzec=P' . ($numer_wzorca_poza + 1) . ' liczba=1';
        }

        # Duzy obiekt w postaci szesnastkowej: osobna, jawnie nazwana proba
        # zasiegu - patrz DUZY_OBIEKT_* w naglowku pliku. Ciag KOLEJNYCH linii
        # lowrite (bez zadnej innej linii spoza COPY pomiedzy nimi) to TEN
        # SAM obiekt zapisany wiecej niz jednym kawalkiem - liczony raz do
        # DUZY_OBIEKT_WIELOKROTNY, niezaleznie od tego, ile kawalkow ma.
        if ($linia =~ $wzorzec_lowrite) {
            $duzy_obiekt_linie++;
            if ($poprzednia_byla_lowrite) {
                if (!$biezacy_ciag_juz_liczony) {
                    $duzy_obiekt_wielokrotny++;
                    $biezacy_ciag_juz_liczony = 1;
                }
            } else {
                $biezacy_ciag_juz_liczony = 0;
            }
            $poprzednia_byla_lowrite = 1;
            my $hex = $1;
            if (length($hex) > 0 && length($hex) % 2 == 0) {
                my $bajty = pack('H*', $hex);
                for (my $j = 0; $j < @wzorce; $j++) {
                    if ($bajty =~ $wzorce[$j]) {
                        $duzy_obiekt_trafienia++;
                        push @trafienia_poza, 'TRAFIENIE relacja=(brak) miejsce=duzy-obiekt:linia=' . $.
                            . ' wzorzec=P' . ($j + 1) . ' liczba=1';
                        last;
                    }
                }
            }
        } else {
            $poprzednia_byla_lowrite = 0;
        }

        # Naglowek bloku COPY w formacie tekstowym pg_dump:
        #   COPY schemat.tabela (kol1, kol2, ...) FROM stdin;
        if (defined $naglowek_relacja) {
            $relacja_biezaca = $naglowek_relacja;
            @kolumny = map {
                my $k = $_;
                $k =~ s/^\s+|\s+$//g;
                $k =~ s/^"(.*)"$/$1/;
                $k;
            } split /,/, $naglowek_kolumny_tekst;
            $relacje_copy{$relacja_biezaca} = 1;
            $w_bloku = 1;
        }
        next;
    }
    # W bloku COPY: koniec bloku to linia z samym "\."
    if ($linia eq '\\.') {
        $w_bloku = 0;
        next;
    }
    $wiersze_danych++;
    my @wartosci = split /\t/, $linia, -1;
    for (my $i = 0; $i < @wartosci && $i < @kolumny; $i++) {
        my $wartosc = $wartosci[$i];
        next if $wartosc eq '\\N'; # NULL w formacie COPY - nic do przeszukania
        for (my $j = 0; $j < @wzorce; $j++) {
            if ($wartosc =~ $wzorce[$j]) {
                my $klucz_kolumny = $kolumny[$i];
                $trafienia{$relacja_biezaca}{$klucz_kolumny}{$j}++;
            }
        }
    }
}
close $fz;

if ($w_bloku) {
    die "policz-trafienia: plik zrzutu '$plik_zrzutu' urwany w srodku bloku COPY relacji '$relacja_biezaca' - brak terminatora '\\.' przed koncem pliku\n";
}

print "WIERSZE_DANYCH=$wiersze_danych\n";
print "RELACJI_COPY=" . scalar(keys %relacje_copy) . "\n";
print "LINIE_NIE_COPY=$linie_nie_copy\n";
print "POZA_COPY=$poza_copy\n";
print "DUZY_OBIEKT_LINIE=$duzy_obiekt_linie\n";
print "DUZY_OBIEKT_TRAFIENIA=$duzy_obiekt_trafienia\n";
print "DUZY_OBIEKT_WIELOKROTNY=$duzy_obiekt_wielokrotny\n";

my $suma = 0;
for my $relacja (sort keys %trafienia) {
    for my $kolumna (sort keys %{$trafienia{$relacja}}) {
        for my $j (sort { $a <=> $b } keys %{$trafienia{$relacja}{$kolumna}}) {
            my $n = $trafienia{$relacja}{$kolumna}{$j};
            $suma += $n;
            my $numer_wzorca = $j + 1;
            print "TRAFIENIE relacja=$relacja kolumna=$kolumna wzorzec=P$numer_wzorca liczba=$n\n";
        }
    }
}
# TRAFIENIE dla POZA_COPY/DUZY_OBIEKT_TRAFIENIA - zebrane podczas czytania
# pliku (patrz @trafienia_poza wyzej), wypisane tu, PO trafieniach z bloku
# COPY, PRZED SUMA - SUMA ponizej ich NIE liczy (patrz naglowek pliku).
print "$_\n" for @trafienia_poza;
print "SUMA=$suma\n";

exit 0;
