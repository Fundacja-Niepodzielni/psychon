-- Zapytanie manifestu: ile relacji klas, ktorych "pg_dump --data-only" NIE
-- wypisuje (widoki zmaterializowane relkind=m, tabele obce/FDW relkind=f),
-- jest w biezacej bazie - schematy systemowe pominiete.
--
-- Celowo NIE "group by" bez zapasu: samo "group by" na zerze wierszy nie
-- daje ZADNEGO wiersza wyjsciowego, co jest dokladnie licznikiem bez
-- mianownika (pusty wydruk wygladajacy identycznie jak "nie policzono").
-- Zapytanie ponizej wypisuje OBIE klasy ZAWSZE, z liczba=0 gdy klasy nie
-- ma w bazie (left join do stalej listy klas).
select 'relkind=' || k.relkind || ' nazwa=' || k.nazwa || ' liczba=' || coalesce(c.n, 0)::text
from (values ('m', 'widoki-zmaterializowane'), ('f', 'tabele-obce-fdw')) as k(relkind, nazwa)
left join (
    select relkind::text as relkind, count(*) as n
    from pg_class
    where relkind in ('m', 'f')
      and relnamespace not in (
          select oid from pg_namespace where nspname in ('pg_catalog', 'information_schema')
      )
    group by relkind
) c on c.relkind = k.relkind
order by k.relkind;
