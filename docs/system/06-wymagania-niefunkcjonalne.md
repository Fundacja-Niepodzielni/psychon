# Wymagania niefunkcjonalne

Obowiązują każdy moduł od pierwszej iteracji. Odbiór iteracji obejmuje sprawdzenie tej listy.

---

## 1. Bezpieczeństwo

1. Hasła: bcrypt/argon2; polityka min. 8 znaków; rate limiting logowania i resetu;
   komunikaty nieujawniające istnienia konta.
2. Sesje/tokeny: wygasanie, unieważnienie po zmianie hasła i wylogowaniu; tokeny
   nieprzechowywane w miejscach dostępnych dla skryptów, jeśli architektura na to pozwala
   (preferencja: ciasteczka HttpOnly).
3. Autoryzacja serwerowa każdego żądania wg matrycy (`03-role-i-uprawnienia.md`) + testy.
4. Walidacja wszystkich danych wejściowych na serwerze; ochrona przed SQL injection
   (zapytania parametryzowane), XSS (escapowanie treści od użytkowników — opisy dyżurów,
   pytania, bio), CSRF (dla żądań sesyjnych), IDOR (identyfikatory nieprzewidywalne
   lub sprawdzana własność zasobu).
5. Nagłówki bezpieczeństwa (CSP, X-Frame-Options, HSTS itd.); cały ruch HTTPS.
6. Pliki: podpisane, wygasające adresy; typ i rozmiar sprawdzane przy wgrywaniu; skan
   nazw/typów po stronie serwera; brak wykonywalnych.
7. Sekrety poza repozytorium; klucze API nigdy w odpowiedziach do klienta ani w kodzie
   frontendu.
8. Zależności: aktualizacje bezpieczeństwa co kwartał; przegląd przed startem produkcji.
9. Kopie zapasowe szyfrowane; dostęp do produkcji imiennie, nie współdzielonym kontem.

## 2. RODO i prywatność

1. **Rejestr czynności przetwarzania i umowy powierzenia** (hosting, wideo, e-mail) —
   dokumenty po stronie Fundacji (⚠️ kto odpowiada), wykonawca dostarcza listę
   podprocesorów i lokalizacje danych.
2. Zgody: wersjonowane, z datą; wycofanie nie kasuje historii (`consents`).
3. Prawo dostępu i przenoszenia (art. 15/20): eksport z profilu — komplet danych.
4. Prawo do usunięcia (art. 17): procedura anonimizacji — dane osobowe zastępowane,
   rekordy statystyczne (godziny, liczby) zostają; certyfikaty wydane zostają
   (podstawa prawna: weryfikacja publiczna); procedura uruchamiana przez administrację,
   odnotowana w dzienniku.
5. Minimalizacja: opisy dyżurów bez danych osób konsultowanych (nota + w fazie 2
   moderacja); publiczna weryfikacja certyfikatu pokazuje minimum (⚠️ zakres).
6. Retencja wg tabeli `02-model-danych.md` §5 — egzekwowana zadaniami cyklicznymi,
   nie „ręcznie kiedyś".
7. Dane wrażliwe (PESEL, adres, skany): szyfrowanie w bazie/at-rest, dostęp ograniczony,
   wgląd rejestrowany (`sensitive_access_log`).
8. Środowisko testowe: wyłącznie dane fikcyjne; zakaz kopiowania produkcyjnej bazy
   do testów bez anonimizacji.

## 3. Wydajność i niezawodność

1. Skala projektowa: setki użytkowników na edycję, dziesiątki równoczesnych — nie jest to
   system wysokiego ruchu; prostota ponad przedwczesną optymalizację.
2. Czas odpowiedzi: strony panelu < 1 s przy skali projektowej; raporty i eksporty mogą
   być generowane w tle.
3. Operacje współbieżne poprawne: numeracja certyfikatów/dokumentów, limity miejsc
   superwizji, liczniki podejść — transakcyjnie.
4. Kolejka zadań z ponowieniami i alarmem przy trwałych błędach.
5. Dostępność: cel 99,5% w godzinach 7–23; okna serwisowe komunikowane.
6. Kopie: baza codziennie, pliki co tydzień, test odtworzenia co kwartał (procedura opisana).
7. Monitoring błędów front+back z powiadomieniami; uptime monitor.

## 4. Dostępność cyfrowa — WCAG 2.1 AA (lista kontrolna)

Percepcja:
- kontrast tekstu ≥ 4,5:1 (duży tekst ≥ 3:1), elementów interfejsu ≥ 3:1 — **sprawdzone
  w tokenach design systemu, zanim powstaną ekrany**;
- treść nie zależy od samego koloru (statusy: ikona/tekst + kolor);
- nagrania: napisy rozszerzone (⚠️ pozycja poza pracami programistycznymi), odtwarzacz
  obsługuje napisy i transkrypcję;
- obrazy z `alt`; ikony dekoracyjne ukryte przed czytnikami.

Obsługa:
- pełna obsługa klawiaturą (w tym odtwarzacz, dzwonek, menu, modale — pułapki focusa
  w modalach, Esc zamyka);
- widoczny wskaźnik focusa na każdym elemencie interaktywnym;
- link „przejdź do treści"; brak pułapek klawiaturowych;
- limity czasowe (test): informacja i możliwość przedłużenia — test bez limitu czasu w MVP.

Zrozumiałość:
- `lang="pl"`; etykiety wszystkich pól; komunikaty błędów powiązane z polami
  (`aria-describedby`, `aria-invalid`) i ogłaszane (`role="alert"`/`aria-live`);
- spójna nawigacja; przewidywalne zachowanie (bez zmiany kontekstu przy focusie).

Solidność:
- poprawna semantyka i hierarchia nagłówków; landmarki;
- komponenty złożone (dzwonek, akordeon, tabs, radiogroup testu) wg wzorców ARIA;
- testy czytnikiem ekranu (NVDA) kluczowych ścieżek: logowanie, lekcja, test, wpis stażu,
  zapis na superwizję, pobranie certyfikatu;
- automatyczny lint dostępności w CI + przegląd manualny każdej iteracji.

Deklaracja dostępności publikowana przy starcie; audyt zewnętrzny z certyfikatem — ⚠️.

## 5. Jakość kodu i proces

1. Repozytorium z przeglądem kodu (code review) przed scaleniem; CI uruchamia testy
   i lint przy każdej zmianie.
2. Testy automatyczne: minimum — cała matryca uprawnień, reguły odblokowań, licznik
   stażu, numeracja certyfikatów, limity podejść, wygasanie dostępu; cel: testy tam,
   gdzie błąd kosztuje zaufanie (decyzje, liczniki, blokady).
3. Migracje bazy wersjonowane; seedy dla środowisk nieprodukcyjnych.
4. Dokumentacja API generowana z kodu (dla fazy 2 — integracje).
5. Konwencje: język polski w interfejsie, angielski w kodzie; formatowanie automatyczne.

## 6. Kryteria odbioru iteracji (Definition of Done)

Iteracja jest ukończona, gdy:
1. kryteria funkcjonalne iteracji (plan iteracji §2) spełnione na środowisku testowym;
2. testy automatyczne zakresu iteracji zielone w CI;
3. nowe ekrany przechodzą lint dostępności + przegląd klawiaturą;
4. decyzje administracyjne nowego zakresu widoczne w dzienniku działań;
5. zespół Fundacji wykonał scenariusze odbiorcze i zgłosił uwagi (lista uwag ≠ blokada
   odbioru — uwagi krytyczne poprawiane przed zamknięciem, reszta do backlogu);
6. dokumentacja użytkowa panelu uzupełniona o nowe funkcje.
