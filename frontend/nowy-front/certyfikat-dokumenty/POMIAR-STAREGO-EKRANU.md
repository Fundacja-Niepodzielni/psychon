# Pomiar starych ekranów „Certyfikat” i „Dokumenty”

Spis tego, co robią dziś strony `app/(uczestnik)/panel/certyfikat/page.tsx` i
`app/(uczestnik)/panel/dokumenty/page.tsx`. Nowe ekrany z tego folderu mają robić
dokładnie to samo: te same żądania, te same pola, te same pobrania.

Stan na dzień pomiaru: żądania i pola odczytane z kodu stron, z modułów, które
wołają (`lib/pulpit/data.ts`, `lib/api/h14.ts`, `lib/api/pliki.ts`), i z kodu
zaplecza (`backend/routes/api/h13.php`, `CertificateController`,
`DocumentController`, `DocumentResource`).

## Certyfikat

### Żądania

| Kiedy | Metoda i ścieżka | Pola, które ekran czyta |
|---|---|---|
| przy wejściu na ekran i po odmowie wydania (422 `conditions_not_met`) | `GET /certificate/conditions` | `eligible`, `conditions[]` (`key`, `label`, `done`, `required`, `met`), `passed_tests_count` (może go nie być albo być `null`) |
| po kliknięciu „Wygeneruj certyfikat” | `POST /certificate/generate` (bez ciała) | tylko sukces albo błąd: `code` (`conditions_not_met`) i `message` |
| po kliknięciu „Pobierz certyfikat” | `GET /certificate/download` z nagłówkiem `Authorization: Bearer …`, wołany bezpośrednio przez `fetch`, nie przez klienta API | kod odpowiedzi (404 = plik jeszcze się nie wygenerował) i treść pliku |

Nie ma żadnego innego żądania: ekran nie czyta `GET /me` i nie zna daty wydania.

### Pobranie

Plik pobiera się przez `fetch` z tokenem, zamienia na blob i zapisuje przez
tymczasowy odnośnik pod nazwą `certyfikat.html`. Nie ma stałego adresu pliku, nie ma
zwykłego odnośnika do pobrania. (Serwer wysyła dziś PDF, a nazwa pliku w starym
ekranie ma końcówkę `.html` — patrz raport, sekcja pytań otwartych.)

### Stany

1. Wczytywanie — zdanie „Wczytywanie…”.
2. Błąd wczytania — komunikat z serwera albo „Nie udało się wczytać warunków. Odśwież stronę.”.
3. Warunki niespełnione (`eligible` = `false`) — lista czterech warunków (etykieta,
   licznik „zrobione / wymagane” albo „brak danych”, pasek postępu, plakietka
   „spełniony” albo „w toku”), wiersz „Zaliczone testy”, informacja „Certyfikat będzie
   dostępny po spełnieniu wszystkich czterech warunków.”.
4. Warunki spełnione, jeszcze nie zlecone — informacja „Wszystkie warunki są spełnione.
   Możesz wygenerować certyfikat.” i przycisk „Wygeneruj certyfikat”.
5. Zlecone — zdanie „Certyfikat został zlecony do wygenerowania. Plik będzie gotowy
   za chwilę.” i przycisk „Pobierz certyfikat” (w trakcie pobierania — stan ładowania).
6. Błędy akcji nad listą:
   - odmowa wydania z `conditions_not_met` — „Nie wszystkie warunki są spełnione —
     odśwież listę poniżej.” i ponowny odczyt warunków;
   - inny błąd API przy wydaniu — komunikat z serwera;
   - błąd sieci przy wydaniu — „Nie udało się rozpocząć generowania. Spróbuj ponownie.”;
   - 404 przy pobraniu — „Certyfikat jeszcze się generuje. Spróbuj ponownie za chwilę.”
     (stan zostaje „zlecone”);
   - inny błąd pobrania — „Nie udało się pobrać pliku. Spróbuj ponownie za chwilę.”.

Stary ekran nie ma osobnych stanów „brak połączenia”, „brak dostępu” ani „nie
znaleziono”: dostęp ogranicza otoczka z rolą wolontariusza w `layout.tsx` strony, a
każdy błąd odczytu pokazuje jedno wspólne ostrzeżenie.

### Odnośniki

Z liczników trzech warunków prowadzą odnośniki do ekranów źródłowych:

- „Wszystkie etapy i testy” → `/panel/kursy` (nazwa dostępna: „… — przejdź do listy kursów i testów”),
- „Godziny stażu” → `/panel/staz` („… — przejdź do dziennika stażu”),
- „Obecności na superwizjach” → `/panel/superwizja` („… — przejdź do terminów superwizji”).

Warsztat stacjonarny nie ma odnośnika ani licznika (odhacza go wyłącznie administracja).

## Dokumenty

### Żądania

| Kiedy | Metoda i ścieżka | Pola, które ekran czyta |
|---|---|---|
| przy wejściu na ekran i po udanym wygenerowaniu | `GET /documents` | `data[]` (`id`, `type`, `number`, `generated_at`, `download_url`), `meta.extra.available_types` (dla każdego z dwóch rodzajów: `available`, `reason`, `missing_fields`, `hours_accepted`, `hours_required`) |
| po kliknięciu „Wygeneruj” przy rodzaju | `POST /documents/generate` z ciałem `{ "type": … }` | tylko sukces albo błąd (`message`) |
| po kliknięciu „Pobierz” w wierszu | `GET <download_url>` (adres podpisany, wygasa po 15 minutach) z nagłówkiem `Authorization: Bearer …`, przez `downloadFile` | treść pliku |

### Pobranie

`downloadFile(download_url, nazwa)`: `fetch` z tokenem, blob, tymczasowy odnośnik.
Nazwa pliku: numer dokumentu z ukośnikami zamienionymi na myślniki i końcówką `.html`
(np. `NP-PW-2026-003.html`). Serwer odsyła PDF.

### Stany

1. Wczytywanie — „Wczytywanie dokumentów…”.
2. Brak uprawnień (403) — „Nie masz uprawnień do wyświetlenia dokumentów.”, bez przycisku ponowienia.
3. Błąd (inny) — „Nie udało się wczytać dokumentów” z komunikatem serwera albo
   „Nie udało się pobrać listy dokumentów.” i przyciskiem „Spróbuj ponownie”.
4. Lista dokumentów — tabela „Wygenerowane dokumenty”: numer, typ („Porozumienie
   wolontariackie”, „Zaświadczenie o stażu”), data wydania (`dd.mm.rrrr`), przycisk
   „Pobierz” (nazwa dostępna: „Pobierz dokument {numer}”, w trakcie pobierania — stan ładowania).
5. Pusta lista — „Nie masz jeszcze żadnych dokumentów.” (stary ekran nie mówi, kiedy
   dokumenty się pojawią).
6. Dwie karty rodzajów dokumentu (zawsze, gdy dane są wczytane):
   - plakietka: „Wygenerowano” (jest już dokument tego rodzaju), „Dostępny do
     wygenerowania” (`available`), „Niedostępny”;
   - powód niedostępności `profile_incomplete`: lista brakujących pól profilu (Imię,
     Nazwisko, Adres e-mail, Telefon, PESEL, Ulica i numer, Miejscowość, Kod pocztowy)
     i odnośnik „Przejdź do profilu” → `/panel/profil`;
   - powód `conditions_not_met`: „Godziny stażu zaakceptowane: {hours_accepted} z
     {hours_required} wymaganych.”;
   - przycisk „Wygeneruj” (nazwa dostępna: „Wygeneruj: {rodzaj}”), nieaktywny, gdy rodzaj
     jest niedostępny, w trakcie wydawania — stan ładowania; znika, gdy dokument tego
     rodzaju już jest;
   - błąd wydania pod kartą rodzaju: komunikat z serwera albo „Nie udało się wygenerować dokumentu.”.
7. Błąd pobrania nad kartami — komunikat z serwera albo „Nie udało się pobrać dokumentu.”.
