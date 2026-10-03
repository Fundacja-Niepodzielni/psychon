# Raport gałęzi `chmura/webinar-uczestnika`

Ten plik jest tymczasowy — zostanie usunięty przy przejęciu gałęzi.

## Co zrobiono — po ekranach

Wszystko w katalogu `frontend/`. Zaplecze jeszcze nie istnieje, więc całość opiera się na kontrakcie z zadania
i na atrapach odpowiedzi. Ekranu „Moje kursy” (lista kursów uczestnika) nie ruszano — zmieniły się tylko typy.

### Typy i żądanie (`frontend/lib/`)

- `lib/courses.ts`: element listy kursów ma `type` (`"course"` albo `"webinar"`); szczegóły kursu mają pola
  webinaru (`starts_at`, `stream_url`, `attendance_window`, `attendance_closes_at`, `attended_at`,
  `recording_lesson_id`) oraz opis (`description`, patrz pytania). Nowa funkcja `confirmAttendance(slug)` woła
  `POST /courses/{slug}/attendance` przez wspólnego klienta API, z pustym ciałem.
- `lib/pulpit/data.ts` oraz pliki `dane.ts` pulpitu i certyfikatu: klucz warunku certyfikatu `"webinars"`.
- Wszystkie nowe pola są opcjonalne w typach (zaplecze bez webinarów ich nie niesie); brak `type` znaczy „kurs”.

### Ekran kursu uczestnika (`nowy-front/kurs-uczestnika/`)

- Gdy odczyt ma `type: "webinar"`, w miejsce tematów, lekcji i testu pokazuje się widok webinaru
  (`WidokWebinaru.tsx`); wybór jest w jednym miejscu, w `KursUczestnika.tsx`.
- Tytuł, opis, termin „czwartek, 5 listopada 2026, 18:00” (Europe/Warsaw), odnośnik „Dołącz do transmisji”
  (tylko adres https, nowa karta, `rel="noopener noreferrer"`; inny adres to brak odnośnika).
- „Potwierdzam udział”: przed oknem widoczny, ale nieczynny, z powodem „Udział potwierdzisz od 18:00.”
  (`aria-disabled` i `aria-describedby`, jak karta testu); w oknie czynny — jedno `POST` bez ciała, potem zdanie
  „Udział potwierdzony {data, godzina}.” i fokus na tym zdaniu; po północy bez przycisku, zdanie „Czas na
  potwierdzenie udziału minął.”.
- Nagranie: „Obejrzyj nagranie” prowadzi na istniejący ekran lekcji (`/panel/lekcje/{id}?kurs={slug}`), bez drugiego
  odtwarzacza; bez nagrania po oknie „Nagranie pojawi się wkrótce.”.
- Ukończony webinar (według `status`) ma potwierdzenie na górze, każdym z dwóch sposobów.
- Błędy: 422, 403, 404 i inne odpowiedzi serwera pokazują zdanie serwera (ekran nie ma własnego zdania zamiast
  niego); 422 z `reason.window` przestawia ekran na okno według serwera; brak połączenia ma „Spróbuj ponownie”.
- Okno obecności przesuwa się z zegarem (co 30 s), bez ponownego wczytania strony; odczyt jest tylko migawką.
- Logika bez Reacta: `webinar.ts` (okno, adres https, cały widok), hak `obecnosc.ts` (jedno `POST` naraz).
- Wspólny formater dat dostał dwie funkcje (`formatujDateZDniemTygodnia`, `formatujGodzine`) i funkcję końca dnia
  w Warszawie (`poczatekNastepnegoDniaWarszawskiego`, poprawna w dniach zmiany czasu o 23 i 25 godzin).

### Pulpit uczestnika (`nowy-front/pulpit/`)

- Webinar nigdy nie prowadzi do kroku „test”, nie bywa „etapem w toku” i nie blokuje: „następny krok” nadal
  wskazuje nieukończony kurs (albo certyfikat, gdy kursów już nie ma). Zmiana w `nastepny-krok.ts`.
- Nowa karta „Najbliższy webinar”: tytuł (odnośnik do webinaru), termin, „Dołącz do transmisji”, „Potwierdzam udział”
  w otwartym oknie (to samo żądanie co na ekranie webinaru), „Obejrzyj nagranie” przy nagraniu, zdanie „od {godzina}”
  przed oknem. Bez karty, gdy nie ma nieukończonego webinaru. Wybór: okno otwarte → nadchodzące (wcześniejsze
  pierwsze) → zamknięte z nagraniem → zamknięte bez nagrania. Szczegóły czytane tylko dla nieukończonych webinarów;
  z zapleczem bez webinarów nie ma ani jednego dodatkowego żądania.
- Lista „Twoja ścieżka” pokazuje też webinary (według numeru w ścieżce), nigdy jako zamknięte; wiersz zamkniętego kursu
  nie nazywa webinaru „poprzednim kursem”. Kafel „Kursy w programie” liczy tylko kursy.

### Certyfikat (`nowy-front/certyfikat-dokumenty/`)

- Warunek „Webinary” (klucz `webinars`) jest listowany jak kursy: „Masz 1 z 2.”, odnośnik „Otwórz webinary”;
  zero webinarów w ścieżce to „W Twojej ścieżce nie ma webinarów.” zamiast „Masz 0 z 0.”.
- Odmowa wydania z `reason.missing` zawierającym `webinars` dostaje ten sam komunikat co każda odmowa warunków.

### Strony podglądu

Nowa strona pod `frontend/app/nowy-front/` nie była potrzebna: widok webinaru żyje w istniejącym ekranie kursu,
a ten ma już trasę i grupę. Nie dotykano `frontend/lib/przelaczenie/`.

## Liczby

| Kontrola | Przed (czubek `sprint-2`) | Po |
|---|---|---|
| `npm run sprawdz-typy` | 0 błędów | 0 błędów |
| `eslint` (`nowy-front`, `lib`, `e2e`) | 0 błędów, 9 ostrzeżeń | 0 błędów, 9 ostrzeżeń (te same, żadne w nowych plikach) |
| `vitest` — cały zbiór | 578 plików, 7127 prób: 7126 zielonych, 1 pominięta | 583 pliki, 7283 próby: 7282 zielone, 1 pominięta, 0 czerwonych |
| `next build` | — (nie mierzono na czubku) | przechodzi |
| e2e — dodane specyfikacje | — | 54 z 54 zielone (1280, 390 i 320 px) |

Przyrost: 156 prób. Pięć nowych plików: 125 prób (`webinar.test.ts` 42, `webinar-widok.test.tsx` 42,
`webinar-pulpit.test.tsx` 20, `nastepny-krok-webinar.test.ts` 18, `courses-obecnosc.test.ts` 3), a w istniejących
plikach 31 (`daty.test.ts` +23, `logika.test.ts` certyfikatu +5, `Certyfikat.test.tsx` +3). Testy pisano najpierw
czerwone (brak funkcji albo komponentu), potem zielone.

Testy sprawdzają m.in.: okno obecności i formatowanie czasu w Europe/Warsaw z datami wokół zmiany czasu
(25 października: dzień 25-godzinny; 29 marca: dzień 23-godzinny), wszystkie stany z zadania (przed, otwarte, po
potwierdzeniu, zamknięte bez nagrania i z nagraniem, ukończony, 422 przed i po oknie, 403, 404, brak połączenia,
adres spoza https, zaplecze bez `type`), dokładne wywołania API (adres, metoda, brak ciała) oraz to, że żadne żądanie
nie idzie pod inny host (`fetch` nie jest wywoływany, wszystkie ścieżki są względne).

E2e: `webinar-uczestnika-ekran.spec.ts` (sześć stanów okna i siedem zachowań, 13 prób na szerokość) i
`webinar-pulpit-karta.spec.ts` (karta w trzech stanach, potwierdzenie z karty, brak karty). W każdym stanie: jeden
`main` i jeden `h1`, brak przewijania poziomego, cele dotyku co najmniej 44 px, automatyczna kontrola dostępności
(też z pomiarem kontrastu) bez naruszeń. Dodatkowo, jako sprawdzenie, że nic się nie zepsuło: istniejące
specyfikacje ekranu kursu, certyfikatu i słownika pulpitów przechodzą (56 zielonych).

## Czego nie zrobiono i dlaczego

- **Zaplecza ani kontraktu** — poza zakresem; wszystko idzie przez atrapy zgodne z opisem z zadania.
- **Przeglądarki do e2e**: zainstalowana wersja biblioteki chce kompilacji przeglądarki, której na maszynie nie ma
  (jest starsza). Niczego nie instalowano; specyfikacje uruchomiono z tymczasowym plikiem konfiguracji (poza
  repozytorium, usunięty) wskazującym przeglądarkę, która jest. Jedna istniejąca specyfikacja
  (`pulpity-rowne-kafle.spec.ts`, 11 prób) wymaga osobnej przeglądarki bezgłowej, której też nie ma — nie
  uruchomiła się, z powodu środowiska, nie kodu.
- **Kafla „Webinary” na pulpicie** — układ czterech kafli jest zamknięty testami; warunek `webinars` pokazuje ekran
  certyfikatu. Do decyzji (pytanie 5).
- **Karty webinaru na pulpicie studenta** — zadanie dotyczy uczestnika; na pulpicie studenta zmienił się tylko wiersz
  listy (webinar nigdy zamknięty).
- **Ponownego odczytu strony po potwierdzeniu** — ukończenie wnioskujemy lokalnie z potwierdzenia; po odświeżeniu
  zdecyduje serwer (pytanie 8).
- **Sprawdzenia ekranu lekcji dla lekcji z nagraniem webinaru** na prawdziwym zapleczu — nie ma go jeszcze.

## Pytania otwarte (z moją rekomendacją)

1. **Napis przycisku** „Potwierdzam udział” (z zadania) czy „Potwierdź udział” (jak pozostałe przyciski: „Zatwierdź”,
   „Odrzuć”)? Rekomendacja: zostawić „Potwierdzam udział” — to deklaracja obecności, a po niej stoi zdanie „Udział
   potwierdzony”. Zmiana to jedno miejsce na ekranie i jedno w karcie.
2. **„Obecność” kontra „udział”**: zdania serwera z kontraktu mówią „obecność” („Obecność potwierdzisz od
   rozpoczęcia transmisji.”), a ekran „udział”. Rekomendacja: ujednolicić na „udział” w zdaniach serwera.
3. **Opis webinaru**: kontrakt nie wymienia `description` w odczycie kursu, a zadanie chce opisu. Ekran pokazuje go,
   gdy jest (pole opcjonalne). Rekomendacja: dodać `description` (tekst albo `null`) do `GET /courses/{slug}`.
4. **Numer webinaru w ścieżce i dane na liście**: ekran radzi sobie z `sequence_order` ustawionym i pustym. Lista kursów
   nie niesie terminu ani okna, więc pulpit czyta szczegóły każdego nieukończonego webinaru. Rekomendacja: dodać do
   elementu listy `starts_at` i `attendance_window` albo oddać „najbliższy webinar” jednym polem — wtedy pulpit
   zrobi jedno żądanie mniej na webinar.
5. **Kafel „Webinary” na pulpicie** („1 z 2”) obok czterech obecnych? Rekomendacja: tak, jako piąty kafel, ale to
   osobna zmiana układu pulpitu (testy równych kafli).
6. **Przycisk główny**: na ekranie webinaru jest nim „Potwierdzam udział” w oknie otwartym i „Obejrzyj nagranie” po
   oknie; przed oknem i po ukończeniu żadnego (zasada jednego przycisku w kolorze). Rekomendacja: zostawić.
7. **Karta na pulpicie przed oknem** nie ma nieczynnego przycisku, tylko zdanie „od {godzina}” (na ekranie
   webinaru jest nieczynny przycisk). Rekomendacja: zostawić — karta ma być krótka.
8. **Po sukcesie bez ponownego odczytu**: ekran sam uznaje webinar za ukończony. Rekomendacja: zostawić; po
   odświeżeniu rozstrzyga `status` z serwera.
9. **Zegar**: okno przesuwa się z zegarem przeglądarki; po odmowie 422 obowiązuje okno z serwera do odświeżenia.
   Rekomendacja: zostawić, ewentualnie dodać odczyt czasu serwera w odpowiedzi.

Jest uwaga dotycząca bezpieczeństwa — przekażę ją ustnie.
