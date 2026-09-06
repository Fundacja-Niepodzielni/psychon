## Why

Pakiet H06 ma zapewnić uczestnikom bezpieczne oglądanie lekcji i zapis liczników postępu w bazie. Jest to element ścieżki P0, od którego zależą wiarygodny pomiar aktywnego czasu oraz ukończenie lekcji i kursów.

## What Changes

- Dodać obsługę kontraktowych tras `GET /lessons/{id}`, `POST /lessons/{id}/progress` i `POST /lessons/{id}/complete`, z uwierzytelnieniem, aktywnym dostępem, autoryzacją kursu przez `CourseAccess` oraz walidacją przez FormRequest.
- Zapisywać przyrostowy postęp oglądania i aktywności, nie zmniejszać wartości oraz ograniczać naliczanie aktywności do 35 sekund na żądanie i łącznie dla konkurencyjnych heartbeatów.
- Wyliczać możliwość ukończenia wyłącznie z aktualnego `Settings::edition('lesson_completion_percent')` i zwracać `not_enough_active_time` poniżej progu.
- Dostarczyć interaktywny, dostępny komponent lekcji wykorzystujący istniejący mock `VideoPlayer`, Page Visibility API i klienta API, ze stanami ładowania, błędu, odtwarzania, zapisu i ukończenia.
- Dostarczyć właścicielowi H05 jawny komponent/punkt integracji do osadzenia w slocie strony kursu, bez edycji tej strony.
- Dodać testy backendu dla dostępu, walidacji, monotoniczności, dwóch heartbeatów i ukończenia oraz weryfikację zachowania frontendu i `DEMO/H06.md`.
- Zrealizować zatwierdzony przez strażnika kontrakt pełnych odpowiedzi `GET /lessons/{id}` i `POST /lessons/{id}/complete`, walidacji heartbeat, licznika otwarć i lekcji o zerowym czasie trwania.
- Pominąć zapisywanie pozycji odtwarzania i wznowienie między sesjami, ponieważ istniejący zamrożony schemat nie zawiera odpowiedniego pola; H06 nie tworzy ani nie edytuje migracji.

## Capabilities

### New Capabilities

- `lesson-playback-progress`: Odtwarzanie lekcji, trwałe i współbieżnie bezpieczne liczniki postępu, próg ukończenia oraz komponent integracyjny H06.

### Modified Capabilities

Brak.

## Impact

- Backend: nowe klasy H06 w kontrolerach, FormRequestach i zasobach, testy Feature oraz wyłącznie własny plik tras `backend/routes/api/h06.php` spośród plików tras.
- Frontend: nowy komponent lekcji korzystający z `frontend/components/VideoPlayer.tsx`, komponentów bazowych i `frontend/lib/api.ts`; bez zmian w stronie kursu, layoutach i menu.
- Dane i kontrakt: kształty HTTP są zapisane w kontrakcie i wykorzystują wyłącznie istniejące pola schematu; zmiana nie zawiera migracji ani trwałego wznowienia pozycji odtwarzania.
- Zależności: bez nowych pakietów Composer/npm i bez zmian zamrożonych fasad startera.
