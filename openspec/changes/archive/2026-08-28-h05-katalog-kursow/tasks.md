## 1. Backend — katalog i szczegóły kursu

- [x] 1.1 `GET /courses` zwraca listę kursów widocznych dla roli, posortowaną po
  `sequence_order` (kursy bez sekwencji na końcu) i tytule, ze statusem i
  `progress_percent` z `CourseAccess`
- [x] 1.2 `GET /courses/{slug}` zwraca szczegóły kursu (prowadzący, lekcje z flagą
  `is_completed`, materiały kursu i jego lekcji łącznie)
- [x] 1.3 Kurs spoza widoczności roli lub grupy produktowej odpowiada 404
  `not_found`, nie 403 (zasada nieujawniania istnienia)

## 2. Backend — widoczność wg roli i egzekwowanie odblokowania

- [x] 2.1 `CourseCatalogQuery::visibleTo()` zawęża zapytanie SQL wg roli
  (`student` → poza sekwencją, `volunteer` → ścieżka, `instructor` → przypisane,
  `project_manager`/`super_admin` → wszystko) przed jakimkolwiek odczytem wiersza
- [x] 2.2 `CourseAccess::state()` egzekwowane na `GET /courses/{slug}` dla ról
  uczestniczących — 403 `course_locked` z `reason.required_course_id` i
  `reason.missing`
- [ ] 2.3 **Oczekuje na zatwierdzenie strażnika kontraktu** — status `locked`
  sprowadzany do `in_progress` w serializacji dla ról nieuczestniczących
  (odstępstwo 1, `DEMO/H05.md`); reguła zaimplementowana i przypięta testem, ale
  nie zapisana w żadnym dokumencie źródłowym

## 3. Backend — zdarzenie odblokowania etapu

- [x] 3.1 `CourseUnlockNotifier` ogłasza `course.unlocked` dla etapu
  `sequence_order > 1` przechodzącego z `locked` na inny stan, wyłącznie gdy
  użytkownik nie ma jeszcze postępu w lekcjach tego etapu
- [x] 3.2 Ogłoszenie jest idempotentne pod współbieżnością (blokada wiersza
  użytkownika przez `SELECT ... FOR UPDATE`, bez migracji na zamrożonym schemacie)

## 4. Backend — materiały

- [x] 4.1 `GET /materials/{material}/download` — podpisany, wygasający (15 min)
  link wydany dla jednego konta (`u`)
- [x] 4.2 Ponowna weryfikacja przy pobraniu: `access_expires_at`, widoczność kursu
  wg roli, `CourseAccess::state()` dla ról uczestniczących
- [x] 4.3 Wpis `api/v1/materials/*/download` w `config/public_routes.php` —
  **zatwierdzone** przy bramie otwierającej H1 (precedens: `api/v1/verify/*` z H13)
- [ ] 4.4 **Oczekuje na zatwierdzenie strażnika kontraktu** — pole `size` (bajty,
  integer) w obiekcie materiału, poszerzające kształt `{id, name, download_url}` z
  kontraktu §2 (odstępstwo 7, `DEMO/H05.md`)

## 5. Backend — filtr grup produktowych

- [x] 5.1 `?product_group=` na `GET /courses` zawęża wynik do podanej wartości
- [ ] 5.2 **Oczekuje na zatwierdzenie strażnika kontraktu** — interpretacja
  `users.product_group = 'both'` jako brak zawężenia niejawnego, zamiast
  dosłownego `IN ('both','both')` (odstępstwo 6, `DEMO/H05.md`); potwierdzenia
  wymaga też sens utrzymywania parametru `?product_group=` w API, skoro zawężenie
  niejawne działa zawsze

## 6. Frontend

- [x] 6.1 `#/panel/kursy` — lista etapów z paskiem postępu i statusami
  (`frontend/app/(uczestnik)/panel/kursy/page.tsx`)
- [x] 6.2 `#/panel/kursy/:slug` — widok kursu, właściciel strony, sloty dla
  H06/H09/H17 (`frontend/lib/slots/course-page.ts`)
- [x] 6.3 Ekran blokady „co musisz najpierw ukończyć" z powodem z `reason`
- [x] 6.4 Wpis „Kursy" w `frontend/lib/menu/participant/index.ts` — **zatwierdzone**
  przy bramie otwierającej H1 (komentarz nagłówkowy pliku zaprasza pakiety do
  dopisania jednej linii)

## 7. Testy i demo

- [x] 7.1 Pokrycie automatyczne: 28 testów / 123 asercje w
  `backend/tests/Feature/Courses/` (`CourseCatalogTest`, `CourseVisibilityTest`,
  `CourseDetailTest`, `MaterialDownloadTest`, `CourseUnlockNotificationTest`)
- [x] 7.2 Komenda demo `demo:complete-lessons {email} {courseSlug}` — obejście
  błędnie sformułowanego kryterium H05.3 z karty pakietu (odstępstwo 3,
  `DEMO/H05.md`)
- [x] 7.3 `DEMO/H05.md` udokumentowane: zakres, kryteria i wyrocznie, wszystkie
  odstępstwa, przejście demo krok po kroku
- [ ] 7.4 **Oczekuje na rozstrzygnięcie strażnika kontraktu** — przeredagowanie
  kryterium H05.3 w `docs/hackathon/01-pakiety-zadan.md` na dwie komendy demo, albo
  formalne potwierdzenie obejścia z 7.2 jako docelowego zachowania

## 8. Otwarte pozycje poza zakresem tego pakietu

- [ ] 8.1 Rozstrzygnięcie znaczenia „podgląd" w matrycy ról dla `instructor` wobec
  kursów nieprowadzonych (odstępstwo 5, `DEMO/H05.md`) — trzy możliwe kierunki do
  wyboru przez strażnika, żaden nie zaimplementowany
- [ ] 8.2 Znane ograniczenie danych demo: `filip@demo.pl` ma ukończone lekcje kursu
  1, którego nie widzi jako `student` — wymaga zmiany seeda, nie kodu H05
