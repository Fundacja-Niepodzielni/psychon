-- Schemat zastepczy DO DOWODU, z celowo dolaczonymi klasami relacji, ktorych
-- "pg_dump --data-only" NIE wypisuje: widokiem zmaterializowanym (relkind=m)
-- i tabela obca/FDW (relkind=f). Uzywany do pokazania NIEZEROWEJ liczby
-- pominietych relacji (patrz README, sekcja o pominietych klasach).
--
-- Dwie zwykle tabele ("personel", "uczestnicy") tworza jedyne relacje, ktore
-- "pg_dump --data-only" naprawde wypisze jako COPY.

create table personel (
    id serial primary key,
    email text not null,
    rola text not null
);

create table uczestnicy (
    id serial primary key,
    kontakt text,
    notatka text
);

-- Tabela legalnie pusta PRZEZ CALY bieg kontenera - nigdy nie dostaje
-- INSERT. Wspolistnieje w tym samym zrzucie z tabelami niosacymi dane
-- (przed i po czyszczeniu) - dowod, ze pusty blok COPY obok blokow z danymi
-- nie przeszkadza stanowi (RELACJI_COPY go liczy, WIERSZE_DANYCH/SUMA - nie).
create table tabela_zawsze_pusta (
    id serial primary key,
    nota text
);

-- Widok zmaterializowany: ma wlasne, fizyczne przechowywanie (w
-- przeciwienstwie do zwyklego widoku), ale zmierzone empirycznie na
-- postgres:17 (patrz README) - "pg_dump --data-only" go NIE wypisuje.
create materialized view mv_archiwum_kontaktow as
    select kontakt as tresc from uczestnicy;

-- Tabela obca (FDW, relkind=f): "pg_dump --data-only" bez opcji
-- "--include-foreign-data" tez jej NIE wypisuje - zmierzone empirycznie
-- na postgres:17 (patrz README). Serwer wskazuje samo na siebie (ten sam
-- kontener, bez wyjscia poza niego) - nazwa biezacej bazy/roli jest brana
-- dynamicznie (current_database()/current_user), zeby ten plik dzialal
-- niezaleznie od tego, jak wolajacy nazwal baze/uzytkownika.
create extension if not exists postgres_fdw;
do $$
declare
    nazwa_bazy text := current_database();
    nazwa_roli text := current_user;
begin
    execute format(
        'create server if not exists serwer_samoodwolujacy foreign data wrapper postgres_fdw options (host %L, dbname %L, port %L)',
        'localhost', nazwa_bazy, '5432'
    );
    execute format(
        'create user mapping if not exists for %I server serwer_samoodwolujacy options (user %L)',
        nazwa_roli, nazwa_roli
    );
end $$;
create foreign table fdw_uczestnicy (kontakt text)
    server serwer_samoodwolujacy options (table_name 'uczestnicy');
