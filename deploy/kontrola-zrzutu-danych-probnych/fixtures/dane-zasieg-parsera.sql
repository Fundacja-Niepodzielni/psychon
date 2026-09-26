-- Trzy wektory zasiegu parsera "policz-trafienia.pl", zmierzone empirycznie
-- (postgres:17, patrz dowod/uruchom-dowod.sh) jako miejsca, w ktorych
-- wartosc z domeny probnej moze wyladowac POZA blokiem "COPY", a stara
-- wersja przyrzadu tego nie widziala W OGOLE (POZA_COPY=0, brak sladu):
--
-- 1. Kolumna, ktorej NAZWA (nie wartosc) niesie znacznik - trafia do linii
--    naglowka "COPY ... (kolumny...) FROM stdin;", ktora byla polykana przez
--    rozpoznanie naglowka w Perlu PRZED sprawdzeniem wzorca.
create table sonda_zasiegu (
    id serial primary key,
    "notatka_ZNACZNIK-PROBNY-KONTROLA-DODATNIA" text
);
insert into sonda_zasiegu (id) values (default);

-- 2. Duzy obiekt (pg_catalog large object) - "pg_dump --data-only" zapisuje
--    jego tresc jako "SELECT pg_catalog.lowrite(<fd>, '\x<hex>')" - tresc
--    jest szesnastkowa, wiec dopasowanie "caly tekst linii" jej nie widzi
--    bez dekodowania.
select lo_from_bytea(0, convert_to('duzy-obiekt-ZNACZNIK-PROBNY-KONTROLA-DODATNIA', 'UTF8'));

-- 3. Nazwa RELACJI (nie kolumny) niesie znacznik - identyfikator cudzyslowiony
--    (postgres pozwala na dowolne znaki, wlacznie z myslnikami, w cudzyslowiu)
--    trafia do TEJ SAMEJ linii naglowka "COPY schemat."nazwa" (kolumny...)
--    FROM stdin;" co wektor 1. wyzej, ale to inny ksztalt zrodlowy: caly
--    identyfikator RELACJI niesie tekst przypominajacy znacznik/domene
--    probna, nie nazwa jednej kolumny. Wartosc w kolumnie "v" jest CZYSTA
--    (bez znacznika) - to relacja sama w sobie jest "podejrzana".
create table "sonda-relacja-ZNACZNIK-PROBNY-KONTROLA-DODATNIA" (
    id serial primary key,
    v text
);
insert into "sonda-relacja-ZNACZNIK-PROBNY-KONTROLA-DODATNIA" (v) values ('brak znacznika w tej wartosci');
