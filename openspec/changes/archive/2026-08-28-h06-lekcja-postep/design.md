## Context

Zob. `proposal.md` dla uzasadnienia i `specs/lesson-playback-progress/spec.md` dla zachowań normatywnych. Backend ma już modele `Lesson`, `LessonProgress` i `Course`, unikalność `lesson_progress(user_id, lesson_id)` oraz zamrożone fasady `CourseAccess` i `Settings`. Tabela postępu przechowuje czas oglądania i aktywności, ale nie przechowuje pozycji odtwarzania. H06 wykorzysta istniejące liczniki i nie rozszerzy schematu.

Frontend działa w App Routerze Next.js 16. Interaktywny `VideoPlayer` jest już Client Componentem: przyjmuje pozycję początkową, emituje przyrostowe heartbeaty co 10 sekund i korzysta z Page Visibility API. Strona kursu jest własnością H05, więc H06 może dostarczyć tylko importowalny komponent do jej slotu.

Strażnik kontraktu zatwierdził pełne odpowiedzi wszystkich trzech tras H06, walidację heartbeat, zwiększanie `open_count` przy odczycie i zachowanie lekcji o zerowym czasie. Następnie zatwierdził pominięcie `position_seconds` i wznowienia między sesjami, aby H06 działało bez zmiany zamrożonego schematu.

## Goals / Non-Goals

**Goals:**

- Oddzielić logikę autoryzacji, transakcyjnego naliczania i prezentacji odpowiedzi, aby każdą można było przetestować niezależnie.
- Zapewnić monotoniczne aktualizacje oraz serializację konkurencyjnych heartbeatów dla pary użytkownik–lekcja.
- Utrzymać małą granicę Client Componentu i prosty kontrakt integracyjny dla H05.
- Umożliwić wycofanie H06 bez zmian w schemacie wykonywanych przez zespół H06.

**Non-Goals:**

- Prawdziwa integracja Bunny Stream, napisy i transkrypcje.
- Implementacja raportów rzetelności H07, strony kursu H05, CMS H08 lub odblokowywania kursów H05.
- Zapisywanie pozycji odtwarzania i wznowienie filmu po ponownym otwarciu lekcji.
- Zmiany layoutów, menu, `UserResource`, zamrożonych fasad, cudzych plików tras i migracji.
- Dodawanie bibliotek frontendowych lub backendowych.

## Decisions

### 1. Trzy cienkie akcje HTTP korzystają ze wspólnej logiki dostępu

Trasy zostaną zarejestrowane wyłącznie w `backend/routes/api/h06.php`, w grupie `auth:sanctum` i `access.active`, z uwzględnieniem istniejącej flagi `features.h06`. Odczyt, heartbeat i ukończenie będą osobnymi akcjami kontrolera lub osobnymi kontrolerami, ale każda załaduje lekcję z kursem i sprawdzi stan kursu przez `CourseAccess::state`.

Stan `locked` zostanie zamieniony na `ApiException` 403 `course_locked` z kontraktowym `reason`; brak zasobu pozostanie 404 z globalnego renderera. Payload heartbeat przejdzie przez dedykowany FormRequest wymagający `watched_delta` i `active_delta` jako nieujemnych liczb całkowitych.

Zasób odczytu zwróci dokładnie zatwierdzone płaskie pola: `id`, `title`, `description`, `duration_seconds`, `watched_seconds`, `active_seconds`, `is_completed`, `completable` i `completable_at_percent`. Każdy udany odczyt atomowo zwiększy `open_count` o 1. Zasób ukończenia zwróci wyłącznie `is_completed` i `completed_at` w kopercie `data`.

Alternatywa polegająca na sprawdzaniu dostępu tylko w komponencie została odrzucona, ponieważ ręczne wywołanie API musi podlegać tym samym regułom. Ponowne implementowanie sekwencji kursów zostało odrzucone, ponieważ `CourseAccess` jest jedynym dozwolonym źródłem tej reguły.

### 2. Heartbeat jest aktualizowany w transakcji z blokadą wiersza

Dla pary użytkownik–lekcja warstwa domenowa najpierw zapewni istnienie rekordu bezpiecznym `insert-or-ignore`, a następnie w transakcji pobierze go z `lockForUpdate`. Zapobiega to zgubionym aktualizacjom oraz wyścigowi przy pierwszym heartbeatcie.

W obrębie blokady:

- `watched_seconds` dostanie wyłącznie zaakceptowany przyrost;
- zaliczony aktywny przyrost będzie minimum z `active_delta`, 35 sekund i okna czasu dostępnego od poprzedniego `last_activity_at`, liczonego zegarem serwera;
- `last_activity_at` zostanie ustawione zegarem serwera;
- stan ukończenia i `completed_at` nigdy nie zostaną cofnięte.

Połączenie blokady i serwerowego znacznika czasu sprawia, że drugi heartbeat oczekujący na ten sam wiersz zobaczy wynik pierwszego i w tej samej sekundzie nie naliczy drugiego pełnego okna. Limit 35 sekund nie dotyczy `watched_delta`, zgodnie z zatwierdzonym kontraktem. Sama reguła `min(active_delta, 35)` została odrzucona, bo dwa równoległe żądania mogłyby dodać łącznie 70 sekund. Blokada wyłącznie po stronie klienta także została odrzucona, bo nie obejmuje dwóch kart lub urządzeń.

### 3. Możliwość ukończenia jest przeliczana przy każdym żądaniu

Heartbeat, odczyt i ukończenie pobiorą bieżący procent przez `Settings::edition('lesson_completion_percent')`. Wymagany czas zostanie wyliczony z czasu trwania lekcji i progu z zaokrągleniem w górę do pełnej sekundy. Ukończenie ponownie zablokuje rekord postępu, sprawdzi aktualny próg i ustawi `is_completed` oraz `completed_at` tylko raz.

Nie zapisujemy wyniku `completable` ani wartości progu w bazie, ponieważ zmiana ustawienia ma działać bez deployu. Nie wykorzystujemy progu `reliability_threshold`, bo kontrakt jawnie rozdziela go od progu ukończenia.

Lekcja z `duration_seconds = 0` zawsze zwróci `completable: false`; próba ukończenia zakończy się 422 `not_enough_active_time`. Zapobiega to przypadkowemu ukończeniu niegotowej lekcji przez matematyczny próg równy zero.

### 4. `LessonPlayer` stanowi granicę integracyjną H06/H05

H06 dostarczy Client Component, roboczo `frontend/components/lesson/LessonPlayer.tsx`, z jedynym wymaganym propem `lessonId: number`. H05 będzie mógł zaimportować go do swojego Server lub Client Componentu, ponieważ identyfikator jest serializowalny, a dyrektywa `use client` pozostanie na możliwie wąskiej granicy H06.

Komponent po zamontowaniu pobierze lekcję przez istniejący `api()`. Dopiero po poprawnym odczycie zamontuje istniejący `VideoPlayer`, bez pozycji początkowej z serwera. Heartbeaty przekażą do API wyłącznie przyrost oglądania i aktywności przez małą kolejkę zapisów, aby żądania z jednej karty nie wyprzedzały się; błąd zapisu zachowa najnowszy niezapisany stan do ponowienia i pokaże komunikat bez udawania sukcesu.

Stan widoku będzie jawną sumą stanów: `loading`, `ready`, `saving`, `save_error`, `completable`, `completing`, `completed` oraz `load_error`. Do prezentacji zostaną użyte istniejące `Card`, `Alert`, `Button` i `ProgressBar`, semantyczne tokeny z `DESIGN.md`, `aria-live` dla zapisu/ukończenia i dostępne sterowanie istniejącego odtwarzacza. Wszystkie teksty będą po polsku.

Alternatywa edycji strony kursu została odrzucona z powodu własności H05. Osobna trasa strony lekcji została odrzucona, ponieważ nie istnieje w kontrakcie zakresu i pakiet przewiduje slot na stronie kursu.

### 5. Weryfikacja frontendu korzysta z istniejącego toolchainu

Repozytorium nie ma runnera testów frontendowych, a nowe zależności są zabronione. Backend otrzyma testy Feature obejmujące happy path, autoryzację, walidację, monotoniczność, współbieżne heartbeaty i próg ukończenia. Frontend zostanie zweryfikowany przez ESLint, produkcyjny build oraz opisany w `DEMO/H06.md` scenariusz manualny: ukryta karta, dwa heartbeaty, błąd zapisu i ukończenie.

Dodanie Vitest/Jest/Playwright zostało odrzucone, ponieważ wymagałoby nowej zależności i zgody sztabu. Jeżeli sztab udostępni istniejący runner przed implementacją, czyste funkcje kolejki i mapowania stanów mogą dostać testy bez zmiany architektury.

## Resolved Decisions

Strażnik kontraktu zatwierdził:

1. płaski kształt `GET /lessons/{id}` zapisany w kontrakcie;
2. minimalny kształt sukcesu `POST /lessons/{id}/complete` z `is_completed` i `completed_at`;
3. wymagane `watched_delta` i `active_delta` jako nieujemne liczby całkowite oraz limit 35 sekund wyłącznie dla `active_delta`;
4. zwiększenie `open_count` przy każdym udanym odczycie;
5. brak możliwości ukończenia lekcji z `duration_seconds = 0`;
6. pominięcie `position_seconds` i wznowienia między sesjami bez tworzenia migracji.

## Risks / Trade-offs

- [Film po ponownym otwarciu zaczyna się od początku] → Jest to zaakceptowany kompromis braku zmiany schematu; nie przeciążać znaczenia `watched_seconds` i nie udawać trwałego wznowienia.
- [Backend lub frontend może odejść od zatwierdzonego kształtu] → Asercje pełnego JSON w testach Feature oraz wspólne typy frontendowe tworzone bezpośrednio z kontraktu.
- [Blokada wiersza zwiększa opóźnienie przy wielu kartach] → Heartbeat występuje najwyżej co 10–30 sekund, więc krótka transakcja jest akceptowalnym kosztem za brak podwójnego naliczania.
- [`last_activity_at` jako watermark może zaniżyć aktywność przy opóźnionej sieci] → Używać zegara serwera, krótkich transakcji i testów z kontrolowanym czasem; priorytetem kontraktu jest brak zawyżania.
- [Nieudany heartbeat może pozostawić lokalny postęp niezapisany] → Serializować wysyłkę, zachować payload do ponowienia i jawnie pokazać stan błędu zapisu.
- [Integracja może utknąć na własności strony H05] → Dostarczyć stabilny import i krótki przykład użycia w `DEMO/H06.md`, a sam merge do strony pozostawić właścicielowi H05.

## Implementation and Rollout Plan

1. Kontrakt jest zaktualizowany tak, aby wykorzystywał wyłącznie istniejące pola schematu.
2. H06 implementuje i testuje backend za istniejącą flagą `features.h06`, bez migracji i zmian fasad.
3. H06 dostarcza komponent integracyjny i przekazuje H05 import oraz wymagany prop.
4. Po zielonych testach, lint i build scenariusz z `DEMO/H06.md` jest wykonywany na stagingu.
5. Wycofanie polega na odłączeniu komponentu H06 i tras lub operacyjnym wyłączeniu flagi przez sztab; zapisane monotoniczne rekordy postępu pozostają zgodne wstecznie i nie są kasowane.
