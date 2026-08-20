# Specyfikacja modułów — MVP (pierwsza edycja)

Dla każdego modułu: cel, wymagania, reguły i przypadki brzegowe, kryteria odbioru.
Zachowanie ekranów definiuje makieta (adresy `#/...` poniżej); tu opisane jest to, czego
z makiety nie widać: reguły serwerowe, przypadki brzegowe, walidacje.
Odwołania: model danych → `02-model-danych.md`, uprawnienia → `03-role-i-uprawnienia.md`,
wymagania przekrojowe (RODO, WCAG, bezpieczeństwo) → `06-wymagania-niefunkcjonalne.md`.

Numeracja modułów zgodna z rozpiską modułów programu.

---

## M1. Fundament techniczny

Wymagania opisane w `01-architektura-i-integracje.md` (§1–3). Dodatkowo:

- design system z makiety przeniesiony 1:1 (tokeny kolorów, typografia, komponenty:
  przyciski, pola, karty, tabele, komunikaty, dzwonek, pasek postępu) — komponenty od razu
  zgodne z WCAG (kontrast, focus, etykiety);
- seedy środowiska testowego: po jednym koncie każdej roli + przykładowa edycja z kursami
  (odpowiednik kont demo z makiety).

**Kryteria odbioru I0:** patrz plan iteracji (`../02-plan-iteracji-i-podzial-prac.md` §2).

---

## M2. Konta, role i uprawnienia

**Ekrany makiety:** `#/logowanie`, `#/panel/profil`, panel → uczestniczki.

Wymagania:

1. Logowanie e-mail + hasło; hasła hashowane (bcrypt/argon2); po 5 nieudanych próbach
   w 15 min — czasowa blokada prób (rate limiting), komunikat bez ujawniania, czy konto istnieje.
2. Reset hasła: link jednorazowy, ważny 60 min, wysyłany e-mailem; formularz nie ujawnia,
   czy adres jest w bazie.
3. Profil: imię, nazwisko, telefon, adres, PESEL (do umów); walidacja numeru PESEL;
   pola wrażliwe widoczne tylko dla właściciela i administracji.
4. Eksport danych osobowych (RODO art. 15/20): przycisk w profilu → plik JSON/CSV ze
   wszystkimi danymi użytkownika (profil, zgody, postępy, wpisy stażu, dokumenty-metadane);
   generowany w tle, powiadomienie o gotowości.
5. Dostęp czasowy: patrz `02-model-danych.md` §2.1; data wygaśnięcia widoczna dla
   użytkownika w panelu; przedłużenie jednym działaniem administracji (+wpis w dzienniku);
   po ukończeniu programu ograniczenie zdjęte automatycznie.
6. Role i matryca uprawnień: `03-role-i-uprawnienia.md` — wraz z testami.
7. 2FA dla administracji (⚠️): jeśli decyzja „tak" — TOTP (aplikacja), wymuszony dla
   Super Admina i Opiekuna.

Przypadki brzegowe: zmiana e-maila wymaga potwierdzenia na nowy adres; konto zablokowane
(status) ≠ konto wygasłe (czas) — różne komunikaty; usunięcie konta → procedura anonimizacji
z `06-wymagania-niefunkcjonalne.md` §2.

**Kryteria odbioru:** wszystkie testy matrycy uprawnień zielone; scenariusz „ręcznie wpisany
adres cudzych zasobów" kończy się 403 z serwera; eksport RODO zawiera komplet danych.

---

## M3. Rekrutacja i wejście do programu (MVP)

**Ekrany makiety:** panel administracyjny → zgłoszenia; `#/rejestracja` (informacyjny).

Wymagania:

1. Zgłoszenia trafiają z formularza Fundacji poza platformą; w MVP wprowadzane do kolejki
   ręcznie lub importem (CSV) przez administrację.
2. Kolejka zgłoszeń: lista ze statusami, szczegóły zgłoszenia, dane dyplomu
   (uczelnia, rok ukończenia, ⚠️ ewentualnie skan).
3. Decyzja: akceptacja → automatyczne założenie konta (rola wg zgłoszenia), e-mail
   powitalny z linkiem do ustawienia hasła, dostęp +6 mies.; odrzucenie → wymagany powód,
   e-mail z informacją. Obie decyzje w dzienniku działań.
4. Decyzja o dyplomie widoczna dla kandydata (w e-mailu; po założeniu konta — w profilu).
5. Model cenowy: żadnych kwot w interfejsie, regulaminie i wzorach umów; moduł sprzedaży
   wyłączony flagą `settings.sales_enabled=false` — kod sprzedażowy nie renderuje się
   i nie odpowiada na trasach.

Przypadki brzegowe: duplikat e-maila w zgłoszeniu (konto już istnieje) — komunikat
i możliwość powiązania; akceptacja przy pełnym limicie miejsc edycji — ostrzeżenie
i świadome potwierdzenie.

**Kryteria odbioru:** pełny przebieg zgłoszenie→akceptacja→konto→pierwsze logowanie
działa na środowisku testowym; odrzucenie zapisuje powód; nie istnieje żadna publiczna
ścieżka samodzielnej rejestracji.

---

## M4. Kursy i materiały

**Ekrany makiety:** `#/panel/kursy`, `#/panel/kursy/:slug`, panel administracyjny → kursy.

Wymagania:

1. Lista kursów uczestnika: status (zablokowany / w toku / ukończony), pasek postępu,
   podział na grupy produktowe.
2. Widok kursu: lekcje w kolejności, materiały do pobrania (podpisane, wygasające adresy),
   prowadzący (link do wizytówki — M5), postęp.
3. Sekwencyjne odblokowanie: reguła z `02-model-danych.md` §2.4 — egzekwowana na serwerze
   (żądanie treści zablokowanego etapu = 403 + czytelny ekran „co musisz najpierw ukończyć").
4. Zapis postępu przeżywa wylogowanie i zmianę urządzenia (stan w bazie, nie w przeglądarce).
5. Odtwarzacz wideo: wznowienie od miejsca, zapis pozycji co ≤30 s i przy pauzie/wyjściu;
   integracja wg decyzji ⚠️ (patrz `01-architektura-i-integracje.md` §4.1).
6. CMS dla zespołu: tworzenie kursu/webinaru (wybór typu), lekcje (dodawanie, edycja,
   usuwanie miękkie, zmiana kolejności), wgrywanie nagrań i materiałów, zapraszanie
   uczestników e-mailem (dotyczy kursów poza główną ścieżką, np. webinarów).

Przypadki brzegowe: usunięcie lekcji, którą ktoś ukończył — postęp historyczny zostaje
(soft delete); zmiana kolejności etapów w trakcie edycji — ostrzeżenie o wpływie na
odblokowania; nagranie w trakcie przetwarzania u dostawcy — status „przetwarzanie".

**Kryteria odbioru:** uczestnik nie obejrzy lekcji etapu 3 przed zaliczeniem etapu 2 nawet
przy ręcznym wpisaniu adresu / wywołaniu API; zespół samodzielnie publikuje nowy kurs
z nagraniem bez udziału programisty.

---

## M5. Prowadzący i przypisania

**Ekrany makiety:** `#/prowadzacy`, `#/panel/prowadzacy`, `#/prowadzacy/kursy/:slug`,
`#/prowadzacy/grupa`.

Wymagania — zgodnie z rozpiską 5.1–5.3 oraz:

1. Wizytówka dostępna z listy kursów i z widoku kursu.
2. Przypisanie: kurs lub pojedyncza lekcja (dziedziczenie po kursie); zmiana prowadzącego
   przenosi **nowe** pytania na nową osobę, stare zostają u odpowiadającego.
3. Powiadomienia o przypisaniu i odpięciu: dzwonek + e-mail (w MVP do I6 — symulowany,
   widoczny w skrzynce wysłanych).

**Kryteria odbioru:** pytanie zadane przy lekcji trafia do właściwej osoby wg reguły
dziedziczenia; odpięcie prowadzącego generuje powiadomienie.

---

## M6. Testy i odblokowywanie etapów

**Ekrany makiety:** `#/panel/kursy/:slug/test`.

Wymagania:

1. Test etapu: 10 pytań jednokrotnego wyboru, jedno na ekranie, bez cofania; pytania
   w kolejności zdefiniowanej (losowanie z puli — faza 2).
2. Próg 80% i limit 3 podejść — wartości z konfiguracji edycji, nie zaszyte w kodzie.
3. Ocenianie wyłącznie na serwerze; odpowiedzi spoza pytania odrzucane; podejście zapisane
   nawet przy zerwaniu połączenia (zapis odpowiedzi na bieżąco lub przy zamknięciu).
4. Ekran wyniku: procent, zaliczony/nie, lista pytań z oznaczeniem błędów (bez pokazywania
   poprawnych odpowiedzi — utrudnia wymianę odpowiedzi między uczestnikami).
5. Historia podejść widoczna dla uczestnika i administracji.
6. Po 3. niezaliczeniu: blokada testu + powiadomienie do opiekuna + procedura ⚠️.
7. Warsztat stacjonarny: odznaczenie zaliczenia w panelu (per uczestnik, z datą);
   warunek certyfikatu.
8. Bank pytań: import 100 pytań z prototypu; edycja pytań w CMS; zmiana pytania nie
   zmienia wyników historycznych (podejścia trzymają treść w snapshotcie).

**Kryteria odbioru:** czwarte podejście niemożliwe także przez API; wynik 79% nie zalicza;
zaliczenie odblokowuje kolejny etap bez odświeżania strony.

---

## M7. Kontrola czasu nauki

**Ekrany makiety:** panel administracyjny → czas nauki (`#/admin/czas-nauki`).

Wymagania:

1. Pomiar: czas przy **aktywnej karcie** liczony oddzielnie od czasu odtwarzania
   (`02-model-danych.md` §2.3); liczba otwarć lekcji; data ostatniej aktywności.
2. Rzetelność = zmierzony czas aktywny / oczekiwany czas materiału; próg w konfiguracji
   (domyślnie 60%).
3. Widok administracyjny: lista uczestników sortowana rosnąco po rzetelności, wskazanie
   lekcji „odhaczonych" poniżej progu; przeznaczenie: rozmowa przed warsztatem,
   nie automatyczne sankcje.
4. Ukończenie lekcji wymaga minimalnego czasu aktywnego (procent długości materiału,
   konfigurowalny) — inaczej przycisk „ukończ" nieaktywny z wyjaśnieniem.

Przypadki brzegowe: materiały bez wideo (tekstowe) — czas liczony od otwarcia przy aktywnej
karcie, z sufitem; dwa urządzenia naraz — liczy się suma, ale zapisy idempotentne
(brak podwójnego liczenia tej samej minuty).

**Kryteria odbioru:** karta w tle przez godzinę nie zwiększa czasu aktywnego; lista
rzetelności wskazuje uczestnika, który „przeklikał" lekcje.

---

## M8. Staż i dziennik praktyk

**Ekrany makiety:** `#/panel/staz`, panel administracyjny → staż (`#/admin/staz`).

Wymagania — rozpiska 8.1–8.3 oraz:

1. Wpis: data (nie z przyszłości), godziny (0,5–24 h, krok 0,5), forma ze słownika,
   liczba konsultacji (≥0), opis; nota o zakazie danych osób konsultowanych przy polu.
2. Licznik 72 h: wyłącznie wpisy zaakceptowane; pasek postępu; rozbicie na formy.
3. Kolejka akceptacji dla opiekuna: akceptuj / odeślij z komentarzem; odesłany wpis
   uczestnik poprawia i składa ponownie (historia wersji nie jest wymagana, status wystarczy);
   każda decyzja w dzienniku działań.
4. Edycja wpisu możliwa tylko przed akceptacją; zaakceptowanego nie można zmienić
   (korekta = działanie administracji z wpisem w dzienniku).

**Kryteria odbioru:** licznik pokazuje wyłącznie godziny zaakceptowane; odesłanie z komentarzem
dociera powiadomieniem; wpis z datą przyszłą odrzucany walidacją.

---

## M9. Superwizja

**Ekrany makiety:** `#/panel/superwizja`, `#/prowadzacy/grupa`.

Wymagania — rozpiska 9.1–9.2 oraz:

1. Zapis na termin: tylko terminy własnego superwizora, tylko przy wolnych miejscach;
   wypisanie się możliwe do rozpoczęcia spotkania.
2. Obecność odnotowuje prowadzący po spotkaniu; obecności liczą się do warunku certyfikatu
   (liczba wymagana — konfiguracja edycji).
3. Widok „moja grupa": lista wolontariuszy z postępem (etapy, staż, superwizje) — tylko
   swoja grupa.
4. Zmiana superwizora: historia przypisań zachowana; obecności u poprzedniego superwizora
   nadal się liczą.

**Kryteria odbioru:** zapis na cudzą grupę niemożliwy (także API); licznik obecności
zgadza się z historią; limit miejsc nieprzekraczalny (zapisy współbieżne — transakcja).

---

## M10. Certyfikaty i weryfikacja

**Ekrany makiety:** `#/panel/certyfikat`, `#/weryfikacja`, `#/certyfikat` (strona publiczna).

Wymagania — rozpiska 10.1–10.2 oraz:

1. Lista warunków z bieżącym stanem (etapy, testy, 72 h stażu, superwizje, warsztat) —
   zawsze widoczna dla uczestnika; generowanie zablokowane do kompletu.
2. Wydanie: numer ciągły w edycji (transakcyjnie, bez dziur), zapis snapshotu warunków,
   PDF A4 z kodem QR generowany w tle, powiadomienie o gotowości; wpis w dzienniku działań.
3. Weryfikacja publiczna (bez logowania): strona wyszukiwania po numerze + wejście z QR
   (token); pokazywane dane wg decyzji ⚠️ (rekomendacja: numer, status, edycja, data —
   imię i nazwisko tylko za zgodą absolwenta); nieistniejący numer → czytelna odmowa
   bez ujawniania formatu numeracji.
4. Unieważnienie certyfikatu przez administrację (z powodem, w dzienniku) — strona
   weryfikacji pokazuje „unieważniony".

**Kryteria odbioru:** dwóch absolwentów generujących certyfikat równocześnie dostaje
kolejne numery; QR z wydruku prowadzi do strony weryfikacji; niespełniony warunek blokuje
generowanie z konkretnym wskazaniem, czego brakuje.

---

## M11. Dokumenty i umowy

**Ekrany makiety:** `#/panel/dokumenty`.

Wymagania — rozpiska 11.1–11.2 oraz:

1. Generowanie porozumienia wolontariackiego: dane z profilu wstawiane we wzór; przed
   generowaniem lista brakujących pól z linkiem do profilu; snapshot danych w dokumencie
   (późniejsza zmiana profilu nie zmienia wydanego dokumentu).
2. Numeracja dokumentów per typ i edycja; wersja A4 do druku.
3. Dostęp: właściciel + administracja; pobrania przez podpisane, wygasające adresy.
4. Zaświadczenie o odbyciu stażu: generowane po osiągnięciu 72 h zaakceptowanych.
5. Wzory: treści dostarcza prawnik Fundacji (⚠️); system trzyma wzory jako szablony
   edytowalne przez administrację (pola podstawiane automatycznie oznaczone).
6. Podpis elektroniczny (⚠️): poza MVP; model danych gotowy (pole statusu podpisu).

**Kryteria odbioru:** dokument wygenerowany przy niekompletnym profilu — niemożliwy;
link do PDF wygasa; osoba trzecia z linkiem bez zalogowania nie pobierze dokumentu.

---

## M12. Profil psychologa i publikacja (MVP)

**Ekrany makiety:** `#/panel/profil-psychologa`, panel administracyjny → profile
(`#/admin/profile`).

Wymagania — rozpiska 12.1–12.2 oraz:

1. Formularz wniosku odblokowany po spełnieniu warunków ukończenia programu; wcześniej
   ekran wyjaśniający, czego brakuje.
2. Wniosek: specjalizacje, nurt, miasto, opis + załączniki (dyplom, zaświadczenie
   o niekaralności) + zgoda na publikację (osobna, odwołalna — `consents`).
3. Po złożeniu: edycja zablokowana; administracja akceptuje albo odsyła z powodem;
   decyzje w dzienniku działań.
4. Ochrona załączników: dostęp tylko administracja, każdy wgląd w `sensitive_access_log`,
   pliki szyfrowane at-rest, podpisane krótkotrwałe adresy.
5. Publikacja w MVP ręczna (zespół przenosi dane na stronę Fundacji); status „opublikowany"
   odnotowany w systemie. Integracja API — faza 2.
6. Wycofanie zgody na publikację → status „wycofany" + zadanie dla zespołu (powiadomienie).

**Kryteria odbioru:** wolontariusz w trakcie programu nie złoży wniosku; odesłanie
z powodem wraca do edycji; wgląd opiekuna w zaświadczenie zostawia ślad w rejestrze.

---

## M13. Powiadomienia i komunikacja

**Ekrany makiety:** dzwonek w nagłówku panelu; panel administracyjny → skrzynka; czat.

Wymagania — rozpiska 13.1–13.4 oraz:

1. Dzwonek: licznik nieprzeczytanych, lista, oznaczanie pojedynczo i „wszystkie", link
   prowadzący do miejsca, którego dotyczy powiadomienie.
2. Zdarzenia generujące powiadomienia (MVP): przypisanie/odpięcie prowadzącego, nowe
   pytanie do prowadzącego, odpowiedź na pytanie, decyzja o wpisie stażu, decyzja
   o profilu, certyfikat gotowy, dokument gotowy, eksport RODO gotowy, zbliżające się
   wygaśnięcie dostępu (30/7 dni), termin superwizji (przypomnienie dzień wcześniej).
3. E-maile: do I6 symulowane (rekord w `emails` ze statusem `simulated`, podgląd
   w skrzynce administracyjnej — jak w makiecie); od I6 realna wysyłka przez dostawcę
   (⚠️) z kolejki; szablony w design systemie; stopka ze wskazaniem nadawcy.
4. Pytania do prowadzącego: zadanie przy lekcji, skrzynka prowadzącego (lista, filtr
   nieodpowiedzianych), odpowiedź wraca w tym samym miejscu przy lekcji + powiadomienie.
5. Czat pomocy: okno czatu w panelu; obsada i godziny — decyzja ⚠️; jeśli brak obsady,
   czat w MVP przyjmuje wiadomości do skrzynki (asynchronicznie) z jasną informacją
   o czasie odpowiedzi.

**Kryteria odbioru:** każde zdarzenie z listy nr 2 tworzy powiadomienie z działającym
linkiem; e-mail w środowisku testowym nigdy nie wychodzi do prawdziwego adresata.

---

## M14. Panel administracyjny

**Ekrany makiety:** `#/admin/*` (uczestniczki, kursy, staż, profile, czas nauki, dziennik,
raport, ustawienia, postępy).

Wymagania — rozpiska 14.1–14.3 oraz:

1. Zarządzanie osobami: lista z filtrowaniem (rola, status, edycja) i wyszukiwaniem;
   dodawanie/edycja/blokowanie; usuwanie = anonimizacja przez procedurę RODO; kolejka
   dyplomów; karta osoby z pełną historią (postępy, staż, superwizje, dokumenty,
   powiadomienia, wpisy dziennika jej dotyczące); eksport CSV listy.
2. Podgląd postępów: zestawienie wszystkich osób w czterech filarach (etapy, staż,
   superwizje, warsztat) — dane te same co w raporcie (jedno źródło prawdy).
3. Pulpit: liczby edycji (uczestnicy, ukończenia, certyfikaty) + kolejka spraw
   (zgłoszenia, wpisy stażu, profile do decyzji, pytania bez odpowiedzi).
4. Ustawienia edycji: nazwa, terminy, limit miejsc, progi (rzetelność, test, podejścia,
   godziny stażu, superwizje) — bez programisty.
5. Wszystkie działania panelu w dzienniku działań.

**Kryteria odbioru:** zespół zakłada edycję, konfiguruje reguły i prowadzi pełny cykl
bez udziału programisty; karta osoby odpowiada na pytanie „na czym stoi ta osoba"
w jednym miejscu.

---

## M15. Raporty i rozliczalność

**Ekrany makiety:** `#/admin/raport`, `#/admin/dziennik`.

Wymagania — rozpiska 15.1–15.2 oraz:

1. Raport z edycji: liczba osób (przyjęte, aktywne, ukończone), godziny stażu (suma,
   średnia), liczba konsultacji, certyfikaty; wskaźniki liczone ze stanu bazy w momencie
   generowania; zestawienie imienne; eksport CSV; wersja do druku A4; dopasowanie do
   wzoru grantodawcy po dostarczeniu wzoru (⚠️).
2. Dziennik działań: widok z filtrowaniem (rodzaj działania, osoba, zakres dat),
   eksport CSV; zapis wyłącznie serwerowy w transakcji z decyzją; brak edycji i usuwania
   (także dla Super Admina); retencja — decyzja ⚠️.
3. Rejestr odczytów dokumentów wrażliwych — decyzja ⚠️ (mechanizm gotowy od I5).

**Kryteria odbioru:** liczby w raporcie zgadzają się z kartami osób; próba modyfikacji
wpisu dziennika (SQL/panel) niemożliwa z poziomu aplikacji.

---

## M16. Wprowadzenie i onboarding

**Ekrany makiety:** `#/panel/start`.

Wymagania — rozpiska 16.1: film wprowadzający (nagranie po stronie Fundacji), przebieg
programu krok po kroku, oczekiwania, stała pozycja w menu (także po ukończeniu programu).
Treść edytowalna przez administrację (CMS prostą stroną).

---

## M17. Dostępność cyfrowa (WCAG 2.1 AA)

Standard obowiązuje **od pierwszego komponentu** (I0). Szczegółowa lista kontrolna:
`06-wymagania-niefunkcjonalne.md` §4. W iteracji I7: przegląd całości, poprawki,
deklaracja dostępności. Pozycje ⚠️ poza zakresem prac programistycznych: napisy do 60 h nagrań,
dostępne PDF-y, audyt zewnętrzny z certyfikatem.

---

## M21. Wdrożenie i utrzymanie

Zakres iteracji I7 (`../02-plan-iteracji-i-podzial-prac.md`): testy całej ścieżki,
wprowadzenie treści, szkolenie (nagrane), instrukcja obsługi panelu, start produkcyjny.
Wymagania utrzymaniowe: `01-architektura-i-integracje.md` §6. Decyzje ⚠️ (właściciel
operacyjny, umowa serwisowa, koszty bieżące, role RODO) — przed startem.
