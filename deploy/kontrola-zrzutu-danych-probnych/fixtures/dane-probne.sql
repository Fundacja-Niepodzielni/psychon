-- Garsc wierszy DO DOWODU: kilka "czystych" (nie pasujacych do zadnego
-- wzorca) i kilka niosacych znaczniki danych probnych (adresy w domenach
-- powszechnie uzywanych do danych zastepczych, plus jeden znacznik
-- WLASNY - "ZNACZNIK-PROBNY-KONTROLA-DODATNIA" - ktory MUSI zostac
-- znaleziony przez kazdy poprawnie dzialajacy przebieg (dowod, ze wzorzec
-- nie jest martwy - martwy wzorzec nie moze zdac egzaminu z nietrafiania).
--
-- Zero prawdziwych osob - to plik do jednorazowego kontenera dowodowego.

insert into personel (email, rola) values
    ('kierownik.zmiany@firma-wewnetrzna.pl', 'kierownik'),
    ('jan.kowalski@example.com', 'tester'),
    ('proba@demo.pl', 'tester');

insert into uczestnicy (kontakt, notatka) values
    ('+48 000 000 000', 'wiersz bez znacznika, do sprawdzenia swoistosci wzorcow'),
    ('kontakt.probny@test.pl', 'drugi znacznik probny'),
    ('bez-adresu', 'ZNACZNIK-PROBNY-KONTROLA-DODATNIA');
