# Pomiar starych ekranów „Moje kursy” i „Mój profil”

Pomiar odczytany z kodu starych stron, bez zgadywania. Źródła:

- `frontend/app/(uczestnik)/panel/kursy/page.tsx` (lista kursów) wraz z
  `components/courses/CourseCard.tsx`, `lib/courses.ts`,
  `lib/hooks/useZasobStronicowany.ts` i `components/templates/ListTemplate.tsx`,
- `frontend/app/(uczestnik)/panel/profil/page.tsx` (profil i eksport danych),
- reguły serwera: `backend/app/Http/Requests/H01/UpdateProfileRequest.php`,
  `backend/app/Rules/Pesel.php`, `backend/app/Http/Controllers/Api/V1/ProfileController.php`,
  `backend/config/exports.php`.

Nowe ekrany wysyłają dokładnie te same żądania z tymi samymi polami. Nie dodajemy
tras i nie zmieniamy zachowania. Poniżej: co jest dziś, a na końcu każdej części —
czym nowe ekrany różnią się wyglądem albo słowami (zachowanie zostaje).

---

## 1. Moje kursy (stary adres `/panel/kursy`)

### 1.1 Żądania

| # | Metoda i ścieżka | Kiedy | Co czyta | Co wysyła |
|---|---|---|---|---|
| 1 | `GET /courses` (bez zapytania) | przy wejściu na ekran i po „Spróbuj ponownie” | lista; z każdego elementu: `id`, `slug`, `title`, `sequence_order` (liczba albo `null`), `status` (`locked` · `in_progress` · `completed`), `progress_percent`. Pole `product_group` jest w typie, ale ekran go nie używa | nic (brak ciała, brak parametrów; grupa produktowa jest zawężana przez serwer) |

Ekran nie stronicuje: hak dostaje `{ data }` bez `meta`, numer strony jest ignorowany.
Kolejność wierszy to kolejność odpowiedzi serwera (ekran nie sortuje).

### 1.2 Stany

| Stan | Co widać dziś |
|---|---|
| ładowanie | nagłówek „Kursy” + opis „Twoja ścieżka szkoleniowa. Kolejny etap otwiera się po ukończeniu poprzedniego.” + `role="status"` z napisem „Ładowanie kursów…” |
| błąd (inny niż 403) | komunikat z błędu API (domyślnie „Nie udało się połączyć z serwerem. Spróbuj ponownie.”) z tytułem „Nie udało się wczytać kursów” i przyciskiem „Spróbuj ponownie” |
| brak uprawnień (HTTP 403) | stan „forbidden” szablonu listy (wspólna odmowa) |
| brak połączenia | ten sam stan błędu co wyżej — stary ekran nie odróżnia sieci od błędu serwera |
| pusta lista | tytuł „Nie masz jeszcze kursów”, opis „Gdy opiekun projektu udostępni Ci pierwszy etap, pojawi się on w tym miejscu.” |
| lista | siatka kart (1 / 2 / 3 kolumny): nad tytułem „Etap N” albo „Poza ścieżką” (gdy `sequence_order` jest `null`), plakietka „Ukończony” / „W toku” / „Zablokowany”, tytuł kursu (h2), pasek postępu z podpisem „Postęp kursu {tytuł}” i wartością w procentach |

Kurs w stanie `completed`: odnośnik „Zobacz kurs” → `/panel/kursy/{slug}`.
Kurs w stanie `in_progress`: odnośnik „Kontynuuj kurs” → `/panel/kursy/{slug}`.
Kurs w stanie `locked`: bez odnośnika, zdanie „Ukończ poprzedni etap, aby odblokować.”
(odnośnik ma w nazwie dostępnej dopisany tytuł kursu).

### 1.3 Zmiany w nowym ekranie (słowa i wygląd, nie zachowanie)

- Stany, słowa i kolejność wierszy jak na liście ścieżki na pulpicie uczestnika:
  „ukończony / w toku / zamknięty”, zdanie „Otworzy się po ukończeniu kursu „…”.”
  dla kursu zamkniętego, podlinia „Kurs N · X% ukończone”.
- Kolejność: kursy z numerem etapu rosnąco, na końcu kursy poza ścieżką (bez numeru)
  w kolejności z serwera. Stary ekran pokazywał kolejność z serwera bez własnej reguły.
- Kursy poza ścieżką (bez numeru) zostają na liście, jak dziś; ich podlinia brzmi
  „Poza ścieżką · X% ukończone”.
- Jeden zielony przycisk na stan, w nagłówku strony: „Wróć do lekcji” przy kursie w toku
  (jak na pulpicie). Do wskazania lekcji ekran odczytuje `GET /courses/{slug}` kursu w toku —
  tę samą istniejącą trasę, której używa pulpit i strona kursu; błąd tego odczytu nie
  psuje listy (przycisk zamienia się na „Otwórz kurs”).

---

## 2. Mój profil (stary adres `/panel/profil`)

### 2.1 Żądania

| # | Metoda i ścieżka | Kiedy | Co czyta | Co wysyła |
|---|---|---|---|---|
| 1 | `GET /me` | przy wejściu | `id`, `first_name`, `last_name`, `email`, `role`, `phone`, `pesel`, `address {street, city, zip}`, `access_expires_at`, `program_completed_at`, `product_group`, `consents[] {type, document_version, granted_at, withdrawn_at, status}` | nic |
| 2 | `PATCH /me` | „Zapisz zmiany” | pełny profil po zapisie (te same pola co wyżej) — zastępuje stan formularza | `first_name`, `last_name`, `phone` (pusty napis → `null`), `pesel` (pusty → `null`), `address {street, city, zip}` (puste → `null`). **`email` nie jest wysyłany** |
| 3 | `POST /me/exports` | „Przygotuj eksport danych” / „Przygotuj nowy eksport” | `id` (np. `ex_9f2`), `status`, `requested_at`, `completed_at`, `download_url` | nic (brak ciała) |
| 4 | `GET /me/exports/{id}` | co 2 sekundy, dopóki status to `queued` albo `processing` (jedno żądanie naraz) | to samo co w pkt 3 | nic |
| 5 | `GET {baza}/api/v1/me/exports/{id}/download` | „Pobierz plik”, ze zwykłym `fetch` i nagłówkiem `Authorization: Bearer …` | plik; przeglądarka zapisuje go jako `moje-dane-{id}.json` | nic |

### 2.2 Pola formularza i reguły

Stary formularz nie ma żadnej własnej walidacji w przeglądarce (`noValidate`, brak
sprawdzeń przed wysyłką). Wszystkie reguły są po stronie serwera, a ekran pokazuje
pierwszy komunikat każdego pola z odpowiedzi 422 (`errors`).

| Pole (etykieta) | Klucz w żądaniu | Klucz błędu | Reguła serwera | Komunikat serwera |
|---|---|---|---|---|
| Imię | `first_name` | `first_name` | tekst, do 255 znaków | „Imię jest za długie (maksymalnie 255 znaków).” |
| Nazwisko | `last_name` | `last_name` | tekst, do 255 znaków | „Nazwisko jest za długie (maksymalnie 255 znaków).” |
| Adres e-mail | — (nie wysyłany) | — | tylko do odczytu, zmienia administracja | podpowiedź: „Adres e-mail zmienia administracja — napisz do opiekuna projektu.” |
| Telefon | `phone` | `phone` | tekst, do 32 znaków, może być pusty | „Numer telefonu jest za długi.” |
| PESEL | `pesel` | `pesel` | 11 cyfr, poprawna data urodzenia i suma kontrolna, może być pusty | „Nieprawidłowy numer PESEL.” |
| Ulica i numer | `address.street` | `address.street` | tekst, do 255 znaków, może być pusty | „Ulica jest za długa (maksymalnie 255 znaków).” |
| Miejscowość | `address.city` | `address.city` | tekst, do 255 znaków, może być pusty | „Miasto jest za długie (maksymalnie 255 znaków).” |
| Kod pocztowy | `address.zip` | `address.zip` | tekst, do 16 znaków, może być pusty | „Kod pocztowy jest za długi.” |

Dodatkowe zachowania pól: PESEL i kod pocztowy mają klawiaturę numeryczną
(`inputMode="numeric"`); PESEL ma podpowiedź „Potrzebny do umowy wolontariackiej.
Widoczny tylko dla Ciebie i administracji.”; pola Imię i Nazwisko stoją obok siebie,
adres jest w grupie „Adres” (`fieldset` z legendą). Każda zmiana pola zdejmuje
komunikat „Zapisano zmiany.”.

### 2.3 Stany

| Stan | Co widać dziś |
|---|---|
| ładowanie | tytuł „Profil”, tekst „Wczytywanie profilu…” |
| błąd odczytu `GET /me` (każdy) | tytuł „Profil”, komunikat „Nie udało się wczytać profilu. Odśwież stronę.” (bez przycisku; stary ekran nie odróżnia 403, 404 ani braku sieci) |
| widok profilu | karta „Dane osobowe” (formularz), karta „Zgody” (tylko do odczytu), karta „Eksport danych (RODO)” |
| zapisywanie | przycisk „Zapisz zmiany” w stanie ładowania (blokada ponownego kliknięcia) |
| zapisano | komunikat „Zapisano zmiany.”; formularz wypełniony odpowiedzią serwera |
| błąd walidacji (422 z `errors`) | komunikat „Popraw zaznaczone pola.” i błędy pod polami |
| inny błąd zapisu | komunikat z błędu API; poza błędem API: „Nie udało się zapisać zmian. Spróbuj ponownie.” |

Karta „Zgody” (tylko odczyt z `GET /me`): brak zgód → „Brak zapisanych zgód.”; wiersz
zgody: nazwa („Regulamin platformy”, „Polityka prywatności”, „Zgoda na publikację
profilu”, „Zgoda marketingowa”; nieznany typ pokazuje surowy kod), podpis „Wersja {wersja
albo —} · z dnia {data}”, plakietka „Udzielona” / „Wycofana”. Data w starym formacie
`dd.mm.rrrr`.

### 2.4 Eksport danych — cały przebieg

Zdanie wstępne: „Przygotujemy plik ze wszystkimi Twoimi danymi: profil, zgody, postępy w
nauce, wpisy stażu i lista wygenerowanych dokumentów. Przygotowanie trwa chwilę —
powiadomimy Cię, gdy plik będzie gotowy.”

1. **Zlecenie.** `POST /me/exports` → serwer odpowiada 202 z `status: "queued"`.
   Serwer dopuszcza jedną ważną paczkę na osobę i 3 żądania na 60 minut.
2. **Sprawdzanie stanu.** Dopóki status to `queued` albo `processing`, po 2 sekundach
   idzie `GET /me/exports/{id}`; odpowiedź zastępuje stan i ewentualnie planuje kolejne
   sprawdzenie. Plakietka: „Przygotowywanie…”.
3. **Gotowe.** Status `ready`: plakietka „Gotowy” i przycisk-odnośnik „Pobierz plik”
   (w trakcie pobierania „Pobieranie…” i blokada).
4. **Pobranie.** `GET …/me/exports/{id}/download` z tokenem; wynik zapisywany jako
   `moje-dane-{id}.json`.
5. **Wygaśnięcie.** Paczka żyje 24 godziny (`ttl_hours` w konfiguracji serwera), potem
   status `expired`: plakietka „Wygasł” i zdanie „Plik został usunięty po 24 godzinach.
   Przygotuj nowy eksport.”. Jeśli pobranie zwróci 404 (paczki już nie ma), stan zmienia
   się lokalnie na `expired` i pokazuje się błąd „Ten eksport wygasł i plik został
   usunięty. Przygotuj nowy.”.
6. **Błędy.**
   - status `failed` w sprawdzaniu stanu: błąd „Przygotowanie eksportu nie powiodło się.
     Spróbuj ponownie.” (plakietki nie ma);
   - błąd sprawdzania stanu: „Nie udało się sprawdzić statusu eksportu.” (sprawdzanie się
     zatrzymuje);
   - błąd pobrania inny niż 404: „Nie udało się pobrać pliku. Spróbuj ponownie.”;
   - zlecenie: odpowiedź `too_many_requests` → „Za dużo żądań eksportu. Spróbuj ponownie
     za {N sekund}.” (liczba z `reason.retry_after_seconds`; bez liczby: „… Spróbuj
     ponownie za chwilę.”); każdy inny błąd API pokazuje zdanie z serwera (np. 409
     `export_in_progress`, `export_already_available`); poza błędem API: „Nie udało się
     zlecić eksportu danych.”.
7. **Przycisk zlecenia** („Przygotuj eksport danych”, po pierwszym zleceniu „Przygotuj
   nowy eksport”) ma stan ładowania w czasie żądania. Stary ekran nie blokuje go w
   czasie przygotowywania — serwer odpowie wtedy 409.

### 2.5 Zmiany w nowym ekranie (słowa i wygląd, nie zachowanie)

- Etykiety są widoczne nad polami; błędy stoją pod polami i w podsumowaniu na górze
  formularza (z odnośnikami do pól). Po błędzie fokus trafia na podsumowanie, po zapisie
  na potwierdzenie.
- Karta „Zgody” zostaje (stary ekran ją ma); to ten sam odczyt `GET /me`.
- Eksport w osobnej karcie: „Przygotuj eksport”, zdanie o przygotowywaniu, „Pobierz plik”,
  zdanie „Plik usuniemy po 24 godzinach.”. Jeden główny przycisk na kartę. Przycisk
  „Przygotuj eksport” w czasie przygotowywania jest oznaczony jako niedostępny i mówi
  dlaczego (stary ekran pozwalał kliknąć i dostawał 409).
- Ostrzeżenie o niezapisanych zmianach przy wyjściu z ekranu (stary ekran go nie miał).
- Daty w zgodach: „30 września 2026” zamiast „30.09.2026”.
- Stan „brak uprawnień” i „nie znaleziono” używają wspólnej odmowy; „brak połączenia” jest
  osobnym stanem z przyciskiem ponowienia (stary ekran miał jeden błąd bez przycisku).
