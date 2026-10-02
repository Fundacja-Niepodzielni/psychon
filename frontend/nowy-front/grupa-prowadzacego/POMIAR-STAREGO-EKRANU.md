# Pomiar starych ekranów „Moja grupa” i „Wątek grupowy”

Spis tego, co robią dziś strony `app/(prowadzacy)/prowadzacy/grupa/page.tsx` (komponent
`components/h12/InstructorGroup.tsx` z sekcją `components/h12/H07ReliabilitySlot.tsx`) i
`app/(prowadzacy)/prowadzacy/watek-grupowy/page.tsx` (komponent
`components/chat/InstructorGroupThread.tsx`). Nowe ekrany z folderów `grupa-prowadzacego` i
`watek-grupowy` mają robić dokładnie to samo: te same żądania, te same pola, te same reguły i ta
sama odpowiedź na pytanie, kto co może.

Źródła pomiaru: kod komponentów, `lib/h12/types.ts`, `lib/chat.ts`, `lib/h07/api.ts`, a po stronie
serwera `backend/routes/api/h12.php`, `backend/routes/api/chat.php`, kontrolery
`InstructorSupervisionController`, `ThreadController`, `MessageController`, `ThreadMemberController`
oraz żądania `StoreSupervisionSlotRequest`, `UpdateAttendanceRequest`,
`StoreSupervisionCaseRequest`, `StoreMessageRequest`.

## Dostęp

Obie strony mają osłonę z kontrolą roli w układzie panelu prowadzącego. Trasy serwera: grupa, terminy,
obecności, sprawy i rzetelność wymagają roli prowadzącego; założenie wątku i zmiany składu także;
odczyt wątku i wysyłka wiadomości nie są ograniczone rolą, tylko widocznością wątku (cudzy lub
nieistniejący wątek to zawsze 404, nigdy 403). Ekrany niczego nie sprawdzają same — przekazują odpowiedzi serwera.

## Ekran „Moja grupa”

### Żądania

| Kiedy | Metoda i ścieżka | Ciało wysyłane | Pola, które ekran czyta z odpowiedzi |
|---|---|---|---|
| przy wejściu | `GET /instructor/group` | — | `members[]`: `id`, `first_name`, `last_name`, `progress` (`courses_done`, `courses_total`, `hours_accepted`, `supervision_present`, `workshop_done`); `slots[]`: `id`, `starts_at`, `duration_minutes`, `seats_limit`, `location_or_link`, `active_signups_count`, `available_seats`, `can_mark_attendance`, `signups[]` (`user.id`, `user.first_name`, `user.last_name`, `attendance`) |
| przy wejściu, niezależnie od poprzedniego (sekcja „Rzetelność nauki”) | `GET /instructor/reliability` | — | `id`, `first_name`, `last_name`, `reliability_percent` (tekst albo `null`), `below_threshold`; ekran czyta tylko `data` (bez stron) |
| „Utwórz termin” | `POST /instructor/slots` | `starts_at` (czas z pola daty i godziny zamieniony na ISO UTC), `duration_minutes` (liczba), `seats_limit` (liczba), `location_or_link` (tekst albo `null`, gdy puste) | nowy termin w tym samym kształcie co element `slots`; ekran dopisuje go do listy |
| „Zapisz obecności” przy terminie | `PATCH /instructor/slots/{id}/attendance` | `attendance`: obiekt `{ "<id osoby>": "present" \| "absent" }` — tylko osoby, które mają wartość (z serwera albo wybraną teraz) | termin po zmianie; ekran podmienia nim ten termin |
| „Zgłoś sprawę” | `POST /instructor/cases` | `subject`, `body`, `volunteer_id` (liczba albo `null` dla sprawy ogólnej) | nic (ekran czyta tylko sukces albo błąd) |

Serwer zwraca dla osoby także inne pola postępu niż te pięć; ekran ich nie czyta.

### Co ekran pokazuje o osobach

Wyłącznie imię i nazwisko oraz postęp: kursy (zrobione z wszystkich, pasek), godziny stażu, liczbę obecności
na superwizjach, stan warsztatu („Ukończony” / „Nieukończony”) i — w osobnej sekcji — wynik rzetelności nauki
(procent, „Poniżej progu” / „W normie” / „Brak danych”). W terminach: imię i nazwisko osoby zapisanej i jej
obecność. Żadnych danych kontaktowych, dokumentów ani notatek stary ekran nie pokazuje.

### Pola i ich reguły

| Formularz | Pole | Reguła na ekranie | Reguła serwera i komunikaty |
|---|---|---|---|
| Utwórz termin | Data i godzina | wymagane; pole daty i godziny przeglądarki | „Podaj datę i godzinę spotkania.”, „Podaj prawidłową datę i godzinę spotkania.” |
| | Czas trwania (minuty) | wymagane, liczba od 1 do 65535, domyślnie 90 | „Czas trwania musi być liczbą całkowitą.”, „Spotkanie musi trwać co najmniej minutę.”, „Czas trwania jest zbyt długi.” |
| | Limit miejsc | wymagane, liczba od 1 do 255, domyślnie 3 | „Limit miejsc musi być liczbą całkowitą.”, „Termin musi mieć co najmniej jedno miejsce.”, „Limit miejsc jest zbyt duży.” |
| | Miejsce lub link | opcjonalne | „Lokalizacja może mieć najwyżej 255 znaków.” |
| Obecności | Obecność przy osobie | lista: Wybierz · Obecny/a · Nieobecny/a; nieaktywna, dopóki `can_mark_attendance` jest fałszem; pod listą zdanie „Obecność oznaczysz po zakończeniu terminu.” | „Obecność można oznaczyć dopiero po zakończeniu terminu.”, „Zaznacz co najmniej jedną osobę.”, „Lista obecności zawiera osobę bez aktywnego zapisu.” (404 dla cudzego terminu) |
| Zgłoś sprawę | Dotyczy osoby (opcjonalnie) | lista z osobami grupy i pozycją „Sprawa ogólna — bez wskazania osoby” | „Możesz wskazać wyłącznie osobę ze swojej grupy.”, „Wskazana osoba nie istnieje.” |
| | Temat | wymagane, do 255 znaków | „Podaj temat zgłoszenia.”, „Temat może mieć najwyżej 255 znaków.” |
| | Opis sprawy | wymagane, do 5000 znaków, 4 wiersze | „Opisz zgłaszaną sprawę.”, „Treść jest zbyt długa.” |

Błędy pól pokazuje stary ekran pod polem tylko dla pól, które ma w formularzu (po dokładnym kluczu), a nad
formularzem zdanie „Popraw zaznaczone pola.” (przy 422).

### Stany ekranu

1. Wczytywanie — szkielet z podpisem „Wczytywanie grupy…”.
2. Błąd wczytania — komunikat z serwera albo „Nie udało się wczytać grupy. Spróbuj ponownie.” i przycisk „Spróbuj
   ponownie” (jedno wspólne ostrzeżenie na każdy błąd, bez rozróżnienia braku dostępu i braku połączenia).
3. Dane: tabela „Postępy uczestników grupy” (lub zdanie „Nie masz jeszcze przypisanych uczestników.”), formularz
   terminu, lista terminów i obecności (lub „Nie utworzyłeś/aś jeszcze żadnego terminu.”), formularz sprawy,
   sekcja rzetelności.
4. Termin: data i godzina (pełna data po polsku), „zajęte / limit miejsc · czas trwania min · miejsce”,
   plakietka „N wolnych miejsc” (czerwona, gdy 0); bez zapisanych: „Nikt nie zapisał się na ten termin.”.
5. Sekcja rzetelności: własne wczytywanie („Wczytywanie rzetelności grupy…”), własny błąd z przyciskiem „Spróbuj
   ponownie”, pusta lista „Nie masz obecnie przypisanych osób w grupie.”.
6. Komunikaty akcji: „Termin został utworzony.” (lista się powiększa, formularz wraca do domyślnych wartości),
   „Obecności zostały zapisane.”, „Sprawa została zgłoszona do administracji.”; błędy: komunikat serwera albo
   „Nie udało się utworzyć terminu.”, „Nie udało się zapisać obecności.”, „Nie udało się zgłosić sprawy.”.
7. Przy każdej z akcji przycisk pokazuje stan ładowania. Żadna z nich nie pyta o potwierdzenie.

## Ekran „Wątek grupowy”

### Żądania

| Kiedy | Metoda i ścieżka | Ciało wysyłane | Pola, które ekran czyta z odpowiedzi |
|---|---|---|---|
| przy wejściu | `GET /threads` | — | `data[]`; ekran zostawia tylko wątki z `type` = `group`; czyta `id` i `updated_at` |
| „Załóż wątek grupowy” | `POST /threads` | bez ciała | nic; po sukcesie ekran czyta listę wątków od nowa (`GET /threads`) |
| „Otwórz wątek” | `GET /threads/{id}` | — | tylko `data[]` — pierwsza strona wiadomości (serwer zwraca 25 na stronę od najstarszej): `id`, `sender.first_name`, `sender.last_name` (może być `null`), `body`, `created_at`; `meta` jest pomijane |
| „Wyślij wiadomość” | `POST /threads/{id}/messages` | `body` | wysłana wiadomość; ekran dopisuje ją na koniec listy i czyści pole |
| „Dodaj do wątku” | `POST /threads/{id}/members/{id osoby}` | bez ciała | nic (tylko sukces albo błąd) |
| „Usuń z wątku” | `DELETE /threads/{id}/members/{id osoby}` | bez ciała | nic |

Uwaga o serwerze: `GET /threads` sam zakłada grupowy wątek prowadzącego, jeśli go nie ma, więc stan „nie masz
jeszcze wątku” zdarza się w praktyce tylko wtedy, gdy odpowiedź serwera jest pusta. „Dodanie do wątku” to
przypisanie osoby do grupy prowadzącego, a „usunięcie” — zamknięcie tego przypisania.

### Pola i ich reguły

| Pole | Reguła na ekranie | Reguła serwera i komunikaty |
|---|---|---|
| Wiadomość do grupy | wymagane, do 5000 znaków (bez licznika znaków na ekranie) | „Wpisz treść wiadomości.”, „Wiadomość jest za długa (maksymalnie 5000 znaków).” |
| Identyfikator osoby | liczba całkowita od 1; oba przyciski nieaktywne, dopóki wartość nie jest taka liczbą (bez zdania, dlaczego) | 404 „Nie znaleziono wolontariusza.”, 422 „Wybierz wolontariusza i użytkownika z rolą prowadzącego.”, 409 „Ta osoba jest już przypisana do innego prowadzącego.”, 403 „Nie zarządzasz składem tego wątku.”, 404 „Ta osoba nie jest w składzie tego wątku.” |

### Stany ekranu

1. Wczytywanie listy wątków — „Wczytuję wątek grupowy…”.
2. Brak uprawnień (403) — „Nie masz uprawnień do wyświetlenia wątku grupowego.”.
3. Błąd listy — komunikat serwera albo „Nie udało się połączyć z serwerem. Spróbuj ponownie.”, tytuł „Nie udało
   się wczytać wątku grupowego”, przycisk ponowienia.
4. Brak wątku — „Nie masz jeszcze wątku grupowego.” i przycisk „Załóż wątek grupowy”; błąd założenia: komunikat
   serwera albo „Nie udało się założyć wątku grupowego. Spróbuj ponownie.”.
5. Lista wątków — wiersz z plakietką „Grupa”, „Ostatnia wiadomość: {data}” albo „Brak wiadomości” i przyciskiem
   „Otwórz wątek” (po otwarciu wątku przycisk jest drugorzędny).
6. Wiadomości otwartego wątku: wczytywanie („Wczytuję wiadomości…”), 403 („Nie masz uprawnień do wyświetlenia
   tego wątku.”), błąd z ponowieniem (tytuł „Nie udało się wczytać wiadomości”), pusty („Nie ma jeszcze żadnych
   wiadomości w tym wątku.”), lista (autor albo „Nieznany nadawca”, data `dd.mm.rrrr, gg:mm`, treść jako zwykły
   tekst), pole wysyłki, błąd wysyłki (komunikat serwera albo „Nie udało się wysłać wiadomości. Spróbuj ponownie.”).
7. „Skład wątku” (po poprawnym wczytaniu wiadomości): pole z identyfikatorem i dwa przyciski; komunikaty „Osoba
   dodana do składu wątku.”, „Osoba usunięta ze składu wątku.”, błędy: komunikat serwera albo „Nie udało się dodać
   osoby do wątku. Spróbuj ponownie.”, „Nie udało się usunąć osoby z wątku. Spróbuj ponownie.”.

### Czego stary ekran NIE ma

- Pojęcia wątku zamkniętego (żadne pole wątku ani wiadomości o tym nie mówi, a serwer nie ma takiego stanu).
- Usuwania ani edycji wiadomości.
- Pytania o potwierdzenie przy usuwaniu osoby z wątku (odbywa się jednym kliknięciem).
- Przechodzenia na dalsze strony wiadomości (serwer stronicuje po 25, ekran pokazuje pierwszą stronę).
