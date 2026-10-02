# Pomiar starych ekranów „Certyfikaty” i „Czas nauki”

Pomiar zrobiony przed budową nowych ekranów, wyłącznie z czytania kodu: strony
`app/(administracja)/admin/certyfikaty/page.tsx` i `app/(administracja)/admin/czas-nauki/page.tsx`,
komponentu `components/h07/AdminReliability.tsx`, funkcji pobierających w `lib/h13/types.ts`
i `lib/h07/api.ts` oraz kontrolerów po stronie serwera (tylko odczyt, żeby wiedzieć, co trasy
przyjmują). Niczego nie uruchamiano w przeglądarce.

Nowe ekrany wołają **te same trasy z tymi samymi polami**. Dwa wyjątki są opisane osobno niżej
(filtr listy certyfikatów, który trasa już obsługuje, oraz jednostki czasu).

---

## 1. Certyfikaty (lista wydanych certyfikatów i unieważnianie)

### 1.1 Żądania

| Żądanie | Kiedy | Wysyłane | Czytane z odpowiedzi |
|---|---|---|---|
| `GET /admin/certificates?page={n}&per_page=25` | wejście na ekran, zmiana strony, „Spróbuj ponownie”, odświeżenie po unieważnieniu (ta sama strona) | `page` (od 1), `per_page` = 25. Bez filtra, bez sortowania. | `data[]`: `id`, `number`, `issued_at`, `status`, `edition`, `user.first_name`, `user.last_name`, `revoked_reason` (tylko dla unieważnionych); `meta.total`, `meta.last_page` |
| `POST /admin/certificates/{id}/revoke` | potwierdzenie unieważnienia | ciało `{ "reason": "<powód po przycięciu białych znaków>" }` | nic (zwrócony certyfikat jest ignorowany; lista ładuje się od nowa) |

Pola, które odpowiedź niesie, a stary ekran ich nie czyta: `user.id`, `revoked_at`, `revoked_by`,
`meta.current_page`, `meta.per_page`.

Co trasa listy przyjmuje po stronie serwera (odczytane z kontrolera): `page`, `per_page` (1–100,
domyślnie 25), filtr `number` (dokładny numer) i filtr `person` (imię, nazwisko albo e-mail osoby).
Kolejność jest stała: od najnowszego wydania. Stary ekran z filtrów nie korzysta.

Dostęp: rola sprawdzana na trasie (tylko osoby z uprawnieniami administracyjnymi). Stary ekran nie sprawdza
roli sam — robi to strażnik układu administracji; odmowa serwera (403) pokazuje komunikat o braku
uprawnień.

### 1.2 Kolumny, filtry, sortowanie, strona

| Kolumna | Zawartość | Brak wartości |
|---|---|---|
| Numer | `number`, pogrubiony | — |
| Osoba | imię i nazwisko (zwykły tekst, bez odnośnika) | „—” |
| Edycja | `edition` | „—” |
| Wydano | `issued_at`, data i godzina w formacie przeglądarki (`pl-PL`, „medium” + „short”) | „—” |
| Status | plakietka „Ważny” (zielona) albo „Unieważniony” (czerwona) | — |
| Akcje | ważny: przycisk „Unieważnij”; unieważniony: **powód unieważnienia wprost w wierszu** | „—” przy braku powodu |

- Filtrów i sortowania: brak. Strona: 25 wierszy.
- Licznik: plakietka w nagłówku „{total} łącznie” (tylko gdy odpowiedź niosła `meta`).
- Stronicowanie: „Poprzednia” / „Następna” i „Strona X z Y”, tylko gdy `last_page` > 1.
- Tytuł „Certyfikaty”, opis „Wydane certyfikaty ukończenia programu i ich unieważnianie.”,
  podpis tabeli „Wydane certyfikaty”.

### 1.3 Stany

| Stan | Jak wygląda |
|---|---|
| ładowanie | „Wczytywanie certyfikatów…” (`role="status"`) i szkielet |
| błąd | komunikat serwera (`ApiError.message`) albo „Nie udało się połączyć z serwerem. Sprawdź, czy backend działa.”; bez tytułu; przycisk „Spróbuj ponownie” |
| brak dostępu (403) | karta „Brak dostępu” + „Nie masz uprawnień do wyświetlenia tej listy.” |
| pusta lista | „Brak wydanych certyfikatów.” |
| lista | tabela + stronicowanie |
| po unieważnieniu | zielony komunikat „Certyfikat {numer} został unieważniony.” nad listą; trwa do następnego otwarcia okna unieważnienia |

Stary ekran nie odróżnia błędu serwera od braku połączenia (jeden stan „błąd”), nie ma ekranu
„brak wyników filtra” (nie ma filtra) i nie ma szczegółów certyfikatu.

### 1.4 Unieważnianie — cały przebieg

1. „Unieważnij” w wierszu ważnego certyfikatu otwiera okno. Otwarcie czyści pole powodu, błędy
   i poprzedni komunikat o sukcesie.
2. Okno: tytuł „Unieważnij certyfikat”, opis „Certyfikat {numer}. Powód jest wymagany.”, pole
   „Powód” (wieloliniowe, 4 wiersze), przyciski „Unieważnij” (drugorzędny) i „Anuluj”.
3. Fokus po otwarciu ląduje **na samym oknie** (nie na przycisku potwierdzenia). Tab krąży po
   elementach okna; Escape zamyka okno (nie podczas zapisu); kliknięcie w tło nie zamyka.
   Po zamknięciu fokus wraca do przycisku, który okno otworzył.
4. Potwierdzenie z pustym powodem (po przycięciu) → błąd pola „Podaj powód unieważnienia.”
   (`role="alert"`), żadnego żądania.
5. Potwierdzenie z powodem → `POST …/revoke`. W czasie zapisu: przycisk potwierdzenia
   zablokowany z oznaczeniem ładowania, „Anuluj” zablokowany, Escape nie działa, czytnik
   ekranu słyszy „Trwa zapisywanie.”, przyciski „Unieważnij” w innych wierszach są zablokowane.
6. Sukces: okno się zamyka, pokazuje się komunikat z pkt 1.3, lista ładuje się od nowa (ta sama
   strona).
7. Błąd walidacji z serwera (`errors.reason[0]`) → ten tekst pod polem powodu. Serwer wymaga od 10
   do 1000 znaków; stary ekran sam sprawdza tylko, czy pole nie jest puste.
8. Każdy inny błąd → czerwony komunikat w oknie: tekst serwera albo „Nie udało się unieważnić
   certyfikatu.”. Okno zostaje otwarte. Przykład: „Ten certyfikat został już unieważniony.”
   (409) — lista się wtedy nie odświeża.
9. „Anuluj” zamyka okno i czyści błąd akcji.

Unieważnienia nie można cofnąć (serwer nie ma operacji odwrotnej). Stary ekran tego zdania
nigdzie nie pokazuje.

---

## 2. Czas nauki (rzetelność nauki)

### 2.1 Żądania

| Żądanie | Kiedy | Wysyłane | Czytane z odpowiedzi |
|---|---|---|---|
| `GET /admin/reliability?page={n}&per_page=25` | wejście na ekran, zmiana strony, „Spróbuj ponownie” | `page`, `per_page` = 25. Trasa **nie przyjmuje żadnych innych parametrów** (każdy inny → odmowa walidacji), więc filtra i własnego sortowania nie da się dodać bez zmiany serwera. | `data[]`: `id`, `first_name`, `last_name`, `email`, `reliability_percent` (napis albo `null`), `below_threshold`; `meta.last_page` |
| `GET /admin/reliability/{userId}` | pierwsze rozwinięcie osoby; „Spróbuj ponownie” w szczegółach | tylko identyfikator w adresie | `lessons[]`: `id`, `title`, `active_seconds`, `duration_seconds`, `open_count`, `last_activity_at` (może być `null`), `below_threshold` |

Odpowiedź szczegółów niesie też dane osoby (`email`, `reliability_percent`, `below_threshold`) —
stary ekran bierze je z listy, ze szczegółów czyta tylko `lessons`.

Kolejność jest ustalana przez serwer i nie da się jej zmienić: od najniższej rzetelności, osoby
bez wyniku na końcu, remisy po nazwisku, imieniu i identyfikatorze. Lista obejmuje aktywnych
wolontariuszy i studentów aktywnego roku programu. Dostęp: osoby z uprawnieniami administracyjnymi
(rola sprawdzana na trasie, jak wyżej). Nieznana osoba lub osoba spoza zakresu → 404 „Nie
znaleziono osoby.”.

### 2.2 Wiersz listy

- Imię i nazwisko (większy pogrubiony tekst, bez odnośnika) i pod nim e-mail.
- Rzetelność: „{percent}%” i plakietka „Poniżej progu” (czerwona) albo „W normie” (zielona);
  przy braku wyniku (`null`) sama plakietka „Brak danych”.
- Karta osoby poniżej progu ma czerwoną ramkę.
- Przycisk „Pokaż szczegóły” / „Ukryj szczegóły” (`aria-expanded`, `aria-controls`).
- Jedna osoba rozwinięta naraz; ponowne rozwinięcie tej samej osoby bierze szczegóły z pamięci
  ekranu bez nowego żądania.
- Filtrów, sortowania i licznika: brak. Strona: 25 wierszy. Stronicowanie jak w certyfikatach.
- Tytuł „Czas nauki”, opis „Lista jest uporządkowana od najniższej rzetelności. Rozwiń osobę, aby
  zobaczyć dane ukończonych lekcji.”, lista oznaczona „Rzetelność osób”.

### 2.3 Szczegóły osoby (panel pod wierszem)

Dla każdej ukończonej lekcji z pomiarem: tytuł, plakietka „Poniżej progu” / „W normie” i cztery
pola:

| Pole | Wartość w starym ekranie |
|---|---|
| Czas aktywny | `active_seconds` jako „M min S s” (albo „S s” poniżej minuty) |
| Czas lekcji | `duration_seconds` w tym samym zapisie |
| Liczba otwarć | `open_count` |
| Ostatnia aktywność | data i godzina (`pl-PL`, „medium” + „short”) albo „Brak danych” |

### 2.4 Stany

| Stan | Jak wygląda |
|---|---|
| ładowanie listy | „Wczytywanie danych o rzetelności…” |
| błąd listy | tytuł „Nie udało się wczytać listy”, komunikat serwera albo „Nie udało się wczytać danych o rzetelności.”, „Spróbuj ponownie” |
| brak dostępu (403) | karta „Brak dostępu” + „Nie masz uprawnień do wyświetlenia tej listy.” |
| pusta lista | „Brak osób z danymi do wyświetlenia.” i „Dane pojawią się, gdy osoby zaczną kończyć lekcje w bieżącej edycji.” |
| ładowanie szczegółów | „Wczytywanie szczegółów…” (`role="status"`) |
| błąd szczegółów | czerwony komunikat (tekst serwera albo „Nie udało się wczytać szczegółów osoby.”) i „Spróbuj ponownie” |
| szczegóły bez lekcji | „Brak ukończonych lekcji z pomiarem czasu.” |

Stary ekran nie odróżnia błędu serwera od braku połączenia i nie ma osobnego ekranu „nie
znaleziono osoby” (404 szczegółów to zwykły błąd w panelu).

---

## 3. Co zmienia się w nowych ekranach — jawnie

Bez zmian: trasy, pola żądań i odpowiedzi, wielkość strony (25), kolejność z serwera, kto może
wejść na ekran, treść i skutek unieważnienia, to, że nie ma filtra ani sortowania w czasie nauki.

Zmiany świadome (nie są nowym zachowaniem serwera):

1. **Filtr listy certyfikatów.** Nowy ekran dodaje pasek filtra „Numer certyfikatu” i „Osoba”.
   Używa istniejących parametrów trasy (`number`, `person`), więc nie powstaje żadna nowa trasa.
   Bez filtra żądanie jest bajt w bajt takie samo jak w starym ekranie.
2. **Powód unieważnienia nie stoi w wierszu.** Wiersz unieważnionego certyfikatu pokazuje tylko
   stan słowami; powód jest po otwarciu szczegółów tego certyfikatu (z danych już pobranych
   z listy — bez nowego żądania).
3. **Szczegóły certyfikatu.** Nowy przycisk „Szczegóły” w wierszu pokazuje numer, osobę, rok
   programu, datę i godzinę wydania, stan oraz — dla unieważnionego — datę unieważnienia i powód.
   Pola z odpowiedzi listy (`revoked_at` jest nowo czytane); identyfikatora osoby, która
   unieważniła, nie pokazuje.
4. **Okno unieważnienia.** Dochodzą: podpowiedź „Pisz rzeczowo, bez informacji o zdrowiu.” i zdanie,
   że unieważnienia nie da się cofnąć; fokus po otwarciu idzie na nagłówek okna. Reszta przebiegu
   (pusty powód → błąd bez żądania, zapis, błąd walidacji, błąd serwera, sukces) jak w pkt 1.4.
5. **Słowo „rok programu” zamiast „edycja”** w nagłówkach i opisach.
6. **Nazwa osoby jest odnośnikiem do karty osoby** (`/admin/uczestniczki/{id}`) w obu listach.
   Na liście czasu nauki e-mail zostaje pod nazwą.
7. **Błąd serwera i brak połączenia to dwa różne stany** z osobnymi zdaniami; odmowa dostępu
   i „nie znaleziono osoby” używają wspólnego ekranu odmowy.
8. **Jednostki czasu w szczegółach czasu nauki: „godz.” i „min”** zamiast „min” i „s”. Przeliczenie
   idzie wspólną funkcją minut (zaokrąglenie w górę do pełnej minuty, więc lekcja z dodatnim czasem
   nigdy nie pokazuje 0 min). Sekundy nie są już pokazywane; procent rzetelności z serwera jest
   bez zmian.
9. **Szczegóły osoby w czasie nauki otwierają się jako osobny widok tego samego ekranu** (nagłówek
   z nazwą osoby i przyciskiem „Wróć do listy”), a nie rozwinięciem w wierszu. Powrót wraca na tę
   samą stronę listy i bez ponownego pobierania listy. Szczegóły są pamiętane w ekranie (jak
   wcześniej), więc ponowne otwarcie tej samej osoby nie robi nowego żądania.
10. **Daty i godziny** przechodzą przez wspólny formater dat (zapis „30 września 2026, 20:50”),
    nie przez własny format przeglądarki.
11. **Liczba z odmianą** („Razem: 3 certyfikaty”) zamiast plakietki „{n} łącznie”.
12. **Potwierdzenie po unieważnieniu** to wspólny pasek potwierdzenia (znika po kilku sekundach albo po
    zamknięciu), a nie stały zielony komunikat nad listą. Fokus po zapisie idzie na przycisk „Szczegóły”
    tego certyfikatu, bo przycisk „Unieważnij” znika razem ze stanem „ważny”. Lista po zapisie wczytuje
    się od nowa (to samo żądanie co dotąd), ale bez szkieletu, żeby nie zgubić fokusu.
13. **Okno unieważnienia w czasie zapisu**: przycisk potwierdzenia zostaje kolorowy, ma napis
    „Zapisywanie…” i oznaczenie „niedostępny”; przyciski w innych wierszach nie są blokowane (okno
    zasłania stronę, więc nie da się ich kliknąć).
