## Context

Dokument opisuje retroaktywnie decyzje techniczne już wcielonego w `main` pakietu H05.
Zob. `proposal.md` — Why. Źródło stanu faktycznego: `DEMO/H05.md` (sekcja
„Odstępstwa") oraz kod w `backend/app/Http/Controllers/Api/V1/CourseController.php`,
`CourseCatalogQuery`, `CourseUnlockNotifier`, `MaterialDownloadController`.
`CourseAccess::state()` i schemat bazy są zamrożone przez starter — H05 wyłącznie je
odczytuje.

## Goals / Non-Goals

**Goals:**
- Udokumentować, jak katalog rozstrzyga widoczność (rola × grupa produktowa) przed
  jakimkolwiek pytaniem o odblokowanie.
- Udokumentować mechanizm jednorazowego ogłoszenia `course.unlocked` i dlaczego
  wymaga transakcji z blokadą wiersza użytkownika.
- Udokumentować siedem odstępstw z `DEMO/H05.md` jako świadome decyzje pakietu, nie
  przeoczenia — z jawnym rozróżnieniem zatwierdzonych i oczekujących na zatwierdzenie.

**Non-Goals:**
- Projektowanie nowego zachowania — to backfill, nie propozycja zmiany.
- Rozstrzyganie odstępstw oczekujących na zatwierdzenie strażnika kontraktu — ta
  zmiana je nazywa i lokalizuje w specs/tasks, nie zamyka.

## Decisions

**Widoczność w SQL, nie w warstwie autoryzacji po pobraniu.** `CourseCatalogQuery::visibleTo()`
zawęża zapytanie przed jakimkolwiek odczytem wiersza, zamiast wczytać wszystkie kursy i
odfiltrować w PHP. Alternatywa (autoryzacja po pobraniu) była prostsza, ale łamałaby
zasadę „cudzy zasób nie ujawnia istnienia" (kontrakt §1.1) w oczywisty sposób przy
race condition między odczytem a filtrem, a dodatkowo ładowałaby niepotrzebne wiersze.

**Status `locked` sprowadzany do `in_progress` w zasobie, nie w `CourseAccess`.**
`CourseAccess::state()` jest zamrożone przez starter i pisane dla uczących się —
zmiana jego zachowania dla ról administracyjnych wymagałaby ingerencji w plik poza
zakresem pakietu. Zamiast tego `CourseListResource::statusFor()` nadpisuje wynik
wyłącznie w warstwie serializacji, gdy wykonawca nie jest uczestnikiem
(`CourseCatalogQuery::isParticipant()`). Alternatywa — dodanie parametru do
`CourseAccess::state()` — została odrzucona, bo dotykałaby pliku startera.

**Ogłoszenie `course.unlocked` przez blokadę wiersza użytkownika, nie unikalny
indeks.** Tabela `notifications` nie ma unikalnego klucza na (`user_id`, `type`,
`link`), więc dwa równoległe `GET /courses` mogłyby oba przejść test „czy już
ogłoszono" i oba wysłać powiadomienie. `SELECT ... FOR UPDATE` na wierszu użytkownika
serializuje tę sekcję krytyczną bez zmiany schematu (migracje zamrożone). Odrzucona
alternatywa: unikalny indeks na `notifications` — wymagałby migracji, poza zakresem
pakietu na zamrożonym schemacie.

**Ponowna weryfikacja dostępu przy pobraniu materiału, nie tylko przy wydaniu linku.**
Link jest ważny 15 minut; w tym czasie dostęp mógł wygasnąć albo etap mógł zostać
ponownie zablokowany (nie w tym pakiecie, ale teoretycznie). `MaterialDownloadController`
sprawdza `access_expires_at` i `CourseAccess::state()` w chwili strumieniowania, nie
polega wyłącznie na ważności podpisu.

**Cztery odstępstwa oznaczone w specs jako „oczekuje na zatwierdzenie", nie
wycofane.** Zamiast cofać kod do węższego zakresu karty pakietu (usuwać `size`,
przywracać blokadę dla ról administracyjnych, itd.), ta zmiana dokumentuje faktyczne
zachowanie i jawnie nazywa, które decyzje nie mają jeszcze zgody strażnika — zgodnie z
tym, co `DEMO/H05.md` już rejestruje. Cofnięcie bez decyzji strażnika byłoby
samowolną zmianą zachowania, nie neutralnym backfillem dokumentacji.

## Risks / Trade-offs

- **Cztery odstępstwa bez formalnej zgody strażnika kontraktu** (role bez blokady,
  interpretacja `both`, pole `size`, zakres „prowadzone" dla `instructor`) →
  mitygacja: `tasks.md` i delta spec je wymieniają jawnie jako otwarte pozycje, nie
  jako ukończone wymagania bez zastrzeżeń; kolejny PR strażnika może je zatwierdzić
  lub cofnąć bez szukania w historii commitów.
- **Kryterium odbioru H05.3 w `01-pakiety-zadan.md` opisuje nieistniejące
  zachowanie** (sam `demo:pass-test` nie odblokowuje kolejnego etapu) → mitygacja:
  udokumentowane w proposal.md i tasks.md z odwołaniem do rzeczywistego mechanizmu
  (`demo:complete-lessons` + `demo:pass-test`); karta pakietu wymaga korekty przez
  strażnika, poza zakresem tej zmiany.
- **Rola `instructor` nie ma zaimplementowanego „podglądu" nieprowadzonych kursów**
  wymaganego przez matrycę ról (odstępstwo 5) → mitygacja: nazwane w tasks.md jako
  otwarta pozycja z trzema możliwymi rozstrzygnięciami do wyboru przez strażnika, nie
  ciche pominięcie.

## Open Questions

- Czy „podgląd" w matrycy ról dla `instructor` oznacza (a) wszystkie opublikowane
  kursy tylko do odczytu, (b) nic więcej niż kursy prowadzone (stan obecny), czy (c)
  osobną, przyszłą funkcję? Nie zmienia obecnych specs/tasks — rozstrzygnięcie
  strażnika dopisze nowy wymóg, jeśli wybierze (a) lub (c).
- Znane ograniczenie danych demo: `filip@demo.pl` ma ukończone lekcje kursu 1, którego
  nie widzi jako `student` (kurs jest etapem ścieżki, nie jest „zaproszony").
  Funkcjonalnie nieszkodliwe (H07 czyta `lesson_progress` bezpośrednio), ale osłabia
  narrację demo. Rozstrzygnięcie wymaga zmiany seeda, nie kodu H05 — poza zakresem tej
  zmiany.
