-- Ten sam ksztalt tabel co w schemat-z-klasami-pominietymi.sql, ale BEZ
-- widoku zmaterializowanego i BEZ tabeli obcej. Uzywany do pokazania, ze
-- liczba pominietych relacji w logu potrafi wyjsc ZERO (i ze ten log rozni
-- sie od logu na schemacie z klasami pominietymi - patrz README, sekcja o
-- pominietych klasach).

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
