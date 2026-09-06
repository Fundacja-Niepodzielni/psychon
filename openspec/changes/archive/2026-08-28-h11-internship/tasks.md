## 1. Publikacja zatwierdzonego kontraktu H11

- [x] 1.1 Uzupełnić `docs/hackathon/02-kontrakt-api.md` zatwierdzoną macierzą H11; weryfikacja: źródło prawdy wymienia dokładnie sześć operacji bez `GET /internship/entries/{id}`, oba zamknięte DTO, paginację i kolejność, odpowiedzi decyzji, `entry_locked`, łączny postęp i zachowanie komentarza.
- [x] 1.2 Porównać uzupełniony kontrakt z `proposal.md`, spec, `design.md` i tym planem; weryfikacja: `openspec validate h11-internship --strict` przechodzi, a ręczne porównanie potwierdza zgodność tras, pól, kodów i przejść statusów.

## 2. API uczestnika i walidacja wpisów

- [x] 2.1 Dodać FormRequesty H11 dla tworzenia i edycji wpisu z polskimi komunikatami oraz regułami: data `≤ dziś`, godziny `0.5–24` w kroku `0.5`, trzy dozwolone formy i nieujemna liczba całkowita konsultacji; weryfikacja: testy H11 zwracają `422 validation_failed` z błędami właściwych pól dla każdej granicy i przyjmują poprawne `0.5`.
- [x] 2.2 Dodać Resource uczestnika z dokładnie polami `id`, `date`, `hours`, `form`, `consultations_count`, `description`, `status`, `review_comment`, `decided_at`, `created_at`, `updated_at`, prawidłowymi formatami dat/liczb i bez danych właściciela lub administratora; weryfikacja: dokładne asercje JSON przechodzą dla create/list/update i odrzucają pola spoza kontraktu.
- [x] 2.3 Zaimplementować właścicielską, paginowaną listę `GET /internship/entries` z jedynie `meta.extra.accepted_hours` z `ProgressAggregator` i `required_hours` z `Settings::edition('internship_hours_required')`; weryfikacja: test pokazuje wyłącznie własne wpisy, stringi w meta, brak rozbicia według formy i godzin `submitted/returned`, wzrost dokładnie o `0.5` po akceptacji oraz wartość wymaganą inną niż `72`.
- [x] 2.4 Zaimplementować `POST /internship/entries` bez przyjmowania `user_id` i ze statusem nadawanym po stronie serwera jako `submitted`; weryfikacja: happy-path Feature test otrzymuje zatwierdzone `201`, a rekord należy do uwierzytelnionego wolontariusza.
- [x] 2.5 Zaimplementować owner-scoped `PATCH /internship/entries/{id}` w transakcji z ponowną kontrolą statusu; weryfikacja: testy potwierdzają edycję własnego `submitted`, `404 not_found` dla cudzego identyfikatora, `403 entry_locked` bez zmiany danych dla `accepted` oraz `returned → submitted` z zachowaniem `review_comment`.
- [x] 2.6 Pokryć operacje uczestnika autoryzacją roli i aktywnego dostępu; weryfikacja: testy zwracają `401 unauthenticated` bez tokenu oraz zatwierdzone `403` dla niewłaściwej roli i nieaktywnego dostępu.

## 3. Kolejka i decyzje administracyjne

- [x] 3.1 Dodać FormRequest odesłania wymagający niepustego `comment`, bez wymyślania niezatwierdzonego limitu długości; weryfikacja: brak/pusty komentarz zwraca `422 validation_failed` przy `comment` i nie zmienia wpisu.
- [x] 3.2 Zaimplementować `GET /admin/internship/pending` dla `project_manager` i `super_admin`, z domyślną stroną `25`, wpisami wyłącznie `submitted` od najstarszego oraz Resource'em administracyjnym rozszerzonym dokładnie o `user: { id, first_name, last_name }`; weryfikacja: dokładne testy kolejki obejmują oba konta administracyjne, sortowanie z remisem po `id`, standardową paginację, brak nadmiarowych pól, wykluczenie `accepted/returned` i `403 forbidden` dla wolontariusza.
- [x] 3.3 Zaimplementować bezciałowy `POST /admin/internship/{id}/accept` pod blokadą rekordu, ustawiając `accepted`, `decided_by` i `decided_at` oraz wyłącznie audyt/powiadomienie `internship.accepted`; weryfikacja: test happy path sprawdza rekord, pełny Resource administracyjny w odpowiedzi `200`, dokładnie jeden audyt i jedno powiadomienie właściciela przez istniejące fasady.
- [x] 3.4 Zaimplementować `POST /admin/internship/{id}/return` pod blokadą rekordu, ustawiając `returned`, komentarz, `decided_by` i `decided_at` oraz wyłącznie audyt/powiadomienie `internship.returned`; weryfikacja: test happy path sprawdza rekord, pełny Resource administracyjny w odpowiedzi `200`, dokładnie jeden audyt i jedno powiadomienie właściciela.
- [x] 3.5 Objąć decyzję, audyt i `Notify::send` wspólną transakcją oraz blokować każdą decyzję dla statusu innego niż `submitted`; weryfikacja: testy ponownej i sprzecznej decyzji otrzymują `403 entry_locked` bez zmiany, dodatkowego audytu, powiadomienia i częściowo zapisanego stanu.
- [x] 3.6 Zarejestrować za flagą `features.h11` dokładnie sześć zatwierdzonych operacji i tylko w `backend/routes/api/h11.php`; weryfikacja: `php artisan route:list` pokazuje listę/create/update, pending/accept/return, nie pokazuje `GET /internship/entries/{id}`, a żaden plik trasy innego pakietu nie ma zmian.

## 4. Testy funkcjonalne backendu

- [x] 4.1 Utworzyć zestaw Feature H11 dla happy path tworzenia, listy, edycji i licznika, używając wyłącznie fikcyjnych danych; weryfikacja: celowany filtr testów H11 przechodzi i zawiera przypadek zaakceptowanych `0.5` godziny.
- [x] 4.2 Uzupełnić zestaw Feature H11 o walidację daty przyszłej, `25` godzin, wartości poza krokiem, formy spoza słownika i ujemnej/niecałkowitej liczby konsultacji; weryfikacja: każda reguła ma osobną asercję `422` i pola błędu.
- [x] 4.3 Uzupełnić testy izolacji właściciela, roli administracyjnej, blokady `entry_locked`, komentarza odesłania i pełnych przejść `submitted → accepted` oraz `submitted → returned → submitted → accepted`; weryfikacja: testy potwierdzają zachowanie komentarza także po późniejszej akceptacji i użycie wyłącznie dwóch zatwierdzonych slugów.
- [x] 4.4 Dodać asercję zestawu tras H11 bez `GET /internship/entries/{id}`; weryfikacja: test lub kontrola `route:list` potwierdza brak dodatkowej operacji przy zachowaniu `PATCH` na tym URI.

## 5. Ekran uczestnika `/panel/staz`

- [x] 5.1 Dodać serwerowy `page.tsx` z polskimi metadanymi oraz wąski komponent kliencki pobierający zatwierdzony DTO przez `apiPaged`; weryfikacja: bezpośrednie wejście na `/panel/staz` renderuje tytuł i stabilne stany ładowania, błędu oraz pustej listy bez zmian layoutu i menu.
- [x] 5.2 Zbudować formularz wpisu z istniejących `Input`, `Select`, `Button`, `Card` i `Alert` oraz etykietowanego natywnego `textarea`, stale pokazując notę o zakazie danych osób konsultowanych; weryfikacja: pola mają etykiety, ograniczenia pomocnicze i błędy `aria-describedby`/`aria-invalid`, a zapis/ponowne wysłanie blokuje wielokrotne żądanie.
- [x] 5.3 Zbudować listę wpisów, polskie etykiety trzech statusów, komentarz odesłania oraz tryb poprawy `returned`; weryfikacja: zaakceptowany wpis nie ma aktywnej edycji i jest opisany jako zablokowany, a odesłany można poprawić i wysłać ponownie.
- [x] 5.4 Dodać kartę i pasek wyłącznie łącznego postępu opartego na `accepted_hours/required_hours` z odpowiedzi; weryfikacja: interfejs nie ma stałej `72`, pokazuje wartość liczbowo obok paska, nie liczy danych z jednej strony paginacji i nie pokazuje rozbicia według formy.
- [x] 5.5 Renderować opis wpisu wyłącznie jako tekst JSX, bez `dangerouslySetInnerHTML`; weryfikacja: wyszukanie `rg 'dangerouslySetInnerHTML'` nie znajduje użycia w plikach H11, a ręczny opis testowy ze znacznikiem HTML nie tworzy elementu ani nie wykonuje skryptu.

## 6. Ekran administracji `/admin/staz`

- [x] 6.1 Dodać serwerowy `page.tsx` z polskimi metadanymi oraz komponent kliencki kolejki korzystający z istniejącego klienta API i zatwierdzonego DTO; weryfikacja: `/admin/staz` obsługuje ładowanie, błąd i pustą kolejkę bez edycji layoutu ani rejestru menu.
- [x] 6.2 Zbudować responsywną tabelę/karty oczekujących z bezpiecznie wyświetlanym opisem i akcją akceptacji per wpis; weryfikacja: w trakcie akceptacji tylko właściwy wiersz ma widoczny stan działania i zablokowane ponowne kliknięcie, a po sukcesie znika z kolejki.
- [x] 6.3 Dodać pod wpisem dostępny formularz odesłania z komentarzem zamiast nowego modala; weryfikacja: błąd `comment` jest powiązany z polem i ogłoszony, anulowanie nie zmienia wpisu, a stan wysyłania i sukces są widoczne po polsku.
- [x] 6.4 Przejść oba ekrany klawiaturą i sprawdzić responsywność zgodnie z `DESIGN.md`; weryfikacja: fokus jest widoczny, cele dotykowe mają co najmniej 44 px, status nie zależy od samego koloru, tabela jest używalna na mobile, a hierarchia nagłówków jest poprawna. Kontrola tabulatorem w Chromium objęła oba adresy; zrzuty przy 390×844 potwierdziły responsywność, a kontrola DOM potwierdziła etykiety, `aria-describedby` i cele formularza o wysokości co najmniej 44 px.

## 7. Demo, bramki jakości i kontrola zakresu

- [x] 7.1 Utworzyć `DEMO/H11.md` z opisem działania, kontami i wyłącznie kanonicznymi fikcyjnymi danymi, krokami dla Marty/opiekuna, stanami UI oraz odwołaniem do opublikowanej macierzy kontraktu; weryfikacja: dokument pozwala odtworzyć tworzenie, odesłanie, poprawę, akceptację, wzrost licznika i blokadę wpisu.
- [x] 7.2 Uruchomić celowane testy H11, `SeedIntegrityTest`, pełne `php artisan test` i Pint; weryfikacja: testy H11, `SeedIntegrityTest`, pełne testy oraz Pint dla plików H11 są zielone, a pełny Pint wykazuje wyłącznie dwa wcześniej istniejące problemy H01 (`ProfileResource.php`, `DataExportResource.php`), zapisane w `DEMO/H11.md` bez zmiany zakresu H11.
- [x] 7.3 Uruchomić `npm run lint` i `npm run build` w frontendzie oraz ręczny przegląd dostępności obu ekranów; weryfikacja: komendy są zielone, a wynik przeglądu klawiaturą i stanów jest zapisany w `DEMO/H11.md`. Przejście tabulatorem i kontrola mobilna zostały wykonane dla `/panel/staz` i `/admin/staz`.
- [x] 7.4 Przejrzeć końcowy diff pod kątem własności i ograniczeń; weryfikacja: brak nowych migracji i zależności, zmian zamrożonych fasad, layoutów, `UserResource`, menu, innych tras i zmian OpenSpec H06/koordynacji, a spośród tras zmieniony jest wyłącznie `backend/routes/api/h11.php`. Audyt `git status`, `git diff --name-only`, `git diff --check` oraz wyszukiwanie zakazanych zmian przeszedł.
