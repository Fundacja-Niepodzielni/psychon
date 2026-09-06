## 1. Trasa i wpis menu

- [x] 1.1 Utworzyć `frontend/lib/menu/participant/pulpit.ts` z wpisem `{ label: "Pulpit", href: "/panel/pulpit", order: 15 }`; weryfikacja: plik eksportuje `MenuEntry` zgodny z `../types`, `npm run lint` przechodzi.
- [x] 1.2 Dodać w `frontend/lib/menu/participant/index.ts` jedną linię importu i jedną pozycję na liście `participantMenu` (tylko te dwie linie); weryfikacja: w bocznym menu panelu „Pulpit" pojawia się bezpośrednio po „Start" i przed „Kursy".
- [x] 1.3 Utworzyć `frontend/app/(uczestnik)/panel/pulpit/page.tsx` jako komponent kliencki (`"use client"`) ze szkieletem czterech sekcji i `export const metadata`/tytułem „Pulpit — Niepodzielni" wg wzoru sąsiednich tras; weryfikacja: wejście na `/panel/pulpit` renderuje stronę w `PanelShell`, `npm run build` przechodzi.
- [x] 1.4 Potwierdzić, że `frontend/app/(uczestnik)/panel/page.tsx` nadal przekierowuje na `/panel/start` (bez zmian); weryfikacja: `/panel` → `/panel/start`.

## 2. Klient danych i typy

- [x] 2.1 Dodać `frontend/lib/pulpit/` z typami i wąskimi funkcjami odczytu: powitanie (`GET /me`), lista kursów (reużyć `fetchCourses` z `lib/courses.ts`), szczegóły kursu (`fetchCourse`), terminy superwizji (`GET /supervision/slots`, reużyć `ParticipantSlot` z `lib/h12/types.ts`), warunki certyfikatu (`GET /certificate/conditions`); weryfikacja: kształty zgodne z kontraktem §2, `npm run lint` przechodzi.
- [x] 2.2 Zaimplementować czystą funkcję `resolveNextStep(courses, inProgressDetail)` zwracającą wariant `lesson | test | certificate | empty` w kolejności z `specs/participant-dashboard/spec.md` (Requirement: Karta „Kolejny krok"); weryfikacja: dla danych demo `marta@demo.pl` zwraca wariant `lesson` z pierwszą nieukończoną lekcją bieżącego etapu.
- [x] 2.3 Zaimplementować pomocnik czasu względnego po polsku (`za 3 dni` / `jutro` / `za 5 godz.`) liczony w UTC z `Date` oraz pełną datę przez `Intl.DateTimeFormat("pl-PL")`; weryfikacja: termin za 72 h daje „za 3 dni", termin przeszły jest odfiltrowany.

## 3. Sekcja powitania

- [x] 3.1 Wyrenderować nagłówek: eyebrow „PULPIT", „Dzień dobry, {first_name}" i jedno spokojne zdanie wprowadzające; przy pustym `first_name` forma bez imienia i bez wiszącego przecinka; weryfikacja: podmiana `first_name` na pusty string nie pozostawia „Dzień dobry, ".

## 4. Mapa rozwoju i węzeł superwizji

- [x] 4.1 Wyrenderować pionową oś etapów z `GET /courses` przefiltrowaną do `sequence_order !== null`, posortowaną rosnąco; każdy węzeł: ikona statusu (check/play/lock, inline SVG jak w `CourseCard`), `stageLabel`, tytuł, `Badge` z `COURSE_STATUS_BADGE`, `ProgressBar` (rola `progressbar` + ARIA); weryfikacja: statusy czytelne ikoną i tekstem, nie samym kolorem.
- [x] 4.2 Węzeł `completed`/`in_progress` linkuje do `/panel/kursy/{slug}`; węzeł `locked` renderuje notkę „Ukończ poprzedni etap, aby odblokować" bez żadnego `<Link>`; weryfikacja: w DOM węzła `locked` nie ma elementu `a`.
- [x] 4.3 Pusty stan Mapy rozwoju, gdy brak kursów ze ścieżki: „Twoja ścieżka pojawi się tutaj, gdy opiekun udostępni pierwszy etap"; weryfikacja: przy `GET /courses` = `[]` sekcja pokazuje pusty stan zamiast pustej listy.
- [x] 4.4 Dodać końcowy węzeł odliczania do superwizji z `GET /supervision/slots`: najwcześniejszy `starts_at > now`, czas względny + data, link „Zobacz superwizje" do `/panel/superwizja`; weryfikacja: przy dwóch terminach (przeszły + za 3 dni) węzeł pokazuje „za 3 dni".
- [x] 4.5 Pusty stan węzła superwizji przy `data: []` lub braku terminu przyszłego: „Termin pierwszej superwizji pojawi się tutaj, gdy opiekun go zaplanuje" + nadal link do `/panel/superwizja`; weryfikacja: przy pustej liście węzeł pokazuje pusty stan i zachowuje link.

## 5. Karta „Kolejny krok"

- [x] 5.1 Wyrenderować kartę akcentową (fioletowy: `border-accent-15`, `bg-accent-06`, `text-accent`) z nagłówkiem „Kolejny krok" i treścią wg wyniku `resolveNextStep`; weryfikacja: wariant `lesson` pokazuje tytuł lekcji i `Button` „Kontynuuj naukę" do `/panel/lekcje/{id}`.
- [x] 5.2 Obsłużyć warianty `test` (link do `/panel/kursy/{slug}/test`), `certificate` (tekst „Masz wszystkie etapy za sobą" + link do `/panel/certyfikat`) i `empty` (spokojny pusty stan bez przycisku); weryfikacja: każdy wariant prowadzi do trasy istniejącej w aplikacji lub nie ma linku.

## 6. Skróty postępu — siatka czterech kafli

- [x] 6.1 Kafle „Ukończone etapy" (liczba `completed` / liczba etapów ścieżki) i „Bieżący etap" (`progress_percent` etapu `in_progress` + tytuł jako podpis; „—" gdy brak) z `GET /courses`; weryfikacja: dla danych demo `marta@demo.pl` kafle pokazują wartości zgodne z `docs/hackathon/04-seed-demo.md`.
- [x] 6.2 Kafle „Godziny stażu" i „Obecności na superwizjach" z `GET /certificate/conditions` (`internship` i `supervision` jako `done / required`, stringi bez przeliczeń); pod siatką link „Zobacz warunki certyfikatu" do `/panel/certyfikat`; weryfikacja: kafle pokazują „41.5 / 72" i „5 / 6" dla danych demo.
- [x] 6.3 Wywoływać `GET /certificate/conditions` tylko gdy `me.role === "volunteer"`; przy 403 lub innej roli pokazać notkę zamiast kafli stażu/obecności, bez błędu i bez pustych kafli; weryfikacja: dla roli `student` pulpit pokazuje tylko dwa kafle kursowe + notkę.

## 7. Stany ładowania, błędu i częściowej awarii

- [x] 7.1 Wspólny stan ładowania do czasu `GET /me` + `GET /courses`; przy ich błędzie ekran „Nie udało się wczytać pulpitu" + „Spróbuj ponownie" (wzór z `panel/kursy/page.tsx`); weryfikacja: wymuszony błąd `GET /courses` pokazuje komunikat i działający retry.
- [x] 7.2 Niezależne stany dla zapytań pomocniczych (`GET /courses/{slug}`, `GET /supervision/slots`, `GET /certificate/conditions`): awaria jednego renderuje rzeczową notkę w jego sekcji, reszta pulpitu widoczna; weryfikacja: wymuszony błąd `GET /supervision/slots` zostawia Mapę rozwoju, Kolejny krok i kafle widoczne, a węzeł superwizji pokazuje „Nie udało się wczytać terminów superwizji".

## 8. Weryfikacja końcowa

- [x] 8.1 Audyt odnośników: każdy widoczny link prowadzi do `/panel/kursy`, `/panel/kursy/{slug}`, `/panel/kursy/{slug}/test`, `/panel/lekcje/{id}`, `/panel/superwizja` lub `/panel/certyfikat`; brak linków/sekcji zależnych od H07, H08, H09, H17; weryfikacja: ręczny przegląd wyrenderowanego pulpitu na danych demo.
- [x] 8.2 Uruchomić `cd frontend && npm run lint && npm run build`; weryfikacja: obie komendy kończą się powodzeniem.
- [ ] 8.3 Ręczny scenariusz na danych demo (`marta@demo.pl`): logowanie → „Pulpit" w menu po „Start" → cztery sekcje z danymi, następny krok prowadzi do właściwej lekcji; weryfikacja: przejście bez błędów w konsoli, zapisane w `DEMO/` jeśli wymagane przy PR.
- [x] 8.4 `openspec validate pulpit-uczestnika-mapa-rozwoju --strict`; weryfikacja: walidacja przechodzi bez błędów.
