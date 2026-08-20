# Specyfikacja fazy 2 — wersja docelowa

Pakiety niezależne, zamawiane osobno po pierwszej edycji. Model danych MVP jest na nie
przygotowany (`02-model-danych.md` §4) — żaden pakiet nie wymaga przebudowy MVP.

---

## F2.A Wydarzenia na żywo (moduł 18)

**Ekrany makiety:** `#/panel/live`, `#/admin/live`, `#/zapis` (strona publiczna).

1. Kalendarz wydarzeń: lista nadchodzących z limitem miejsc; plik `.ics` do pobrania.
2. Typy dostępu: **imienny** (superwizje — tylko przypisani), **programowy** (webinary —
   uczestnicy zapisywani automatycznie), **publiczny** (strona zapisu dla osób spoza
   programu; zbierane dane minimalne + zgoda).
3. Przebieg: przycisk „Dołącz" aktywny od X minut przed startem; lista obecności
   (ręczna lub z systemu wideo, zależnie od dostawcy); nagranie podpinane po spotkaniu
   (jako lekcja/webinar w M4).
4. Decyzja ⚠️ o dostawcy wideo determinuje połowę nakładu prac: wariant „link zewnętrzny"
   (Zoom/Meet) vs „pokój osadzony" (integracja + licencje na uczestnika).

Kryteria odbioru: osoba nieprzypisana nie dołączy do superwizji nawet z linkiem;
zapis publiczny działa bez konta; obecność zasila statystyki raportu.

## F2.B Integracja profili psychologów (moduł 12 — część docelowa)

1. Publikacja profilu jednym działaniem: wysyłka przez API do bazy psychologów na stronie
   Fundacji; aktualizacja i wycofanie profilu propagowane automatycznie.
2. Integracja z systemem rezerwacji wizyt (przekierowanie lub głęboka integracja —
   wg decyzji).
3. Synchronizacja: `external_id`, log synchronizacji, obsługa błędów (kolejka, ponowienia,
   alarm przy trwałym błędzie).
4. Decyzje ⚠️ przed realizacją: format danych i uwierzytelnienie; **który system
   jest nadrzędny przy konflikcie danych** (rekomendacja: platforma jest źródłem prawdy
   profilu, baza zewnętrzna repliką).

## F2.C DOBROstan i mailing (moduł 19)

**Ekrany makiety:** `#/dobrostan`, `#/dobrostan/panel`, `#/admin/dobrostan`,
`#/admin/mailing`, `#/platnosc`.

1. Osobny produkt na wspólnej platformie: strona publiczna, osobne wejście i menu,
   przełączanie produktów dla osób z oboma (grupa produktowa istnieje od MVP).
2. Treści: miesiąc tematyczny, karty pracy, wyzwania, webinar miesiąca (mechanika M4/M18).
3. Subskrypcja 35 zł/mc: płatności cykliczne (dostawca do wyboru), okres karencji przy
   nieudanej płatności, anulowanie z końcem okresu; faktury/rachunki wg wymagań księgowości;
   podgląd przychodu tylko dla Super Admina.
4. Włączenie flagi sprzedaży wymaga: regulaminu sprzedaży, polityki zwrotów (treści prawne
   po stronie Fundacji), zgody konsumenckiej o treściach cyfrowych.
5. Mailing: baza adresów z tagami (uczestnicy, absolwenci, subskrybenci, zewnętrzni),
   import/eksport, wysyłka do tagu, skrzynka wysłanych, zgody marketingowe i wypisanie
   się (link w stopce, strona potwierdzenia); limity antyspamowe dostawcy.

## F2.D Współpraca po programie (moduł 20)

**Ekrany makiety:** `#/panel/po-programie`, `#/admin/wspolpraca`.

1. Ścieżka absolwenta: formy współpracy do zaznaczenia, kontakt z zespołem HR, historia
   zgłoszeń z odpowiedziami; dostęp do materiałów bezterminowy (mechanizm z M2).
2. Panel HR: lista zgłoszeń, statusy, odpowiedzi, notatki.

## F2.E Rekrutacja na platformie (moduł 3 — część docelowa)

1. Formularz zgłoszeniowy na platformie zamiast zewnętrznego: pola wg formularza Fundacji,
   załącznik dyplomu (wg decyzji ⚠️ z MVP), zgody i obowiązek informacyjny (treść od
   prawnika), potwierdzenie e-mail.
2. Retencja danych kandydatów zgodnie z `02-model-danych.md` §5.

## F2.F Drobne odłożone

- losowanie pytań testu z większej puli (wymaga rozbudowy banku pytań — praca merytoryczna
  po stronie Fundacji);
- lista obecności warsztatu stacjonarnego;
- moderacja opisów dyżurów przed zapisem (automatyczne wykrywanie potencjalnych danych
  osobowych + kolejka moderacji).
