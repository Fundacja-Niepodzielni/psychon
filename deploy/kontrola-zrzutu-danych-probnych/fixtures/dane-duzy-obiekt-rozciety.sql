-- Trzecia wada zmierzona w tym katalogu: duzy obiekt, ktorego tresc
-- "pg_dump --data-only" zapisuje WIECEJ NIZ jednym wywolaniem
-- "SELECT pg_catalog.lowrite(...)" - kazde wywolanie jest dekodowane OSOBNO
-- (patrz policz-trafienia.pl), wiec znacznik rozdzielony DOKLADNIE na
-- granicy dwoch takich wywolan nie zostanie wykryty przez zadne z nich
-- z osobna.
--
-- Rozmiar kawalka zmierzony empirycznie na obrazie postgres:17 (patrz
-- dowod/uruchom-dowod.sh): 16384 B (LOBBUFSIZE pg_dump), NIE 2048 B, jak
-- zakladal wczesniejszy komentarz w tym katalogu.
--
-- Tresc ponizej: 16370 bajtow wypelnienia, potem caly znacznik
-- "ZNACZNIK-PROBNY-KONTROLA-DODATNIA" (33 bajty), potem 20 bajtow
-- wypelnienia - razem 16423 bajtow. Granica pierwszego kawalka wypada
-- dokladnie w SRODKU znacznika (16384-16370=14 bajtow znacznika w
-- pierwszym wywolaniu lowrite, pozostale 19 w drugim) - zaden z dwoch
-- kawalkow, zdekodowany z osobna, nie zawiera pelnego tekstu znacznika.
select lo_from_bytea(0, convert_to(
    repeat('C', 16370) || 'ZNACZNIK-PROBNY-KONTROLA-DODATNIA' || repeat('D', 20),
    'UTF8'
));
