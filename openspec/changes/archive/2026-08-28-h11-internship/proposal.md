## Why

Uczestnicy pełnej ścieżki programu potrzebują bezpiecznego dziennika stażu, a administracja — kolejki decyzji, dzięki której do wymaganego wymiaru godzin zaliczają się wyłącznie wpisy zaakceptowane. Pakiet H11 domyka ten przepływ na istniejącym, zamrożonym modelu danych i zgodnie z rejestrami kontraktu API.

## What Changes

- Dodajemy ekran uczestnika `/panel/staz` do tworzenia, przeglądania i poprawiania własnych wpisów oraz prezentacji postępu godzinowego.
- Dodajemy ekran administracji `/admin/staz` z kolejką wpisów oczekujących na akceptację lub odesłanie z komentarzem.
- Implementujemy zakontraktowane operacje `GET/POST /internship/entries`, `PATCH /internship/entries/{id}`, `GET /admin/internship/pending`, `POST /admin/internship/{id}/accept` i `POST /admin/internship/{id}/return` bez rozszerzania kontraktu o nowe trasy.
- Egzekwujemy walidację daty, godzin, formy, liczby konsultacji i komentarza odesłania oraz izolację właściciela, blokadę zaakceptowanych wpisów i ponowne złożenie wpisów odesłanych.
- Liczymy postęp wyłącznie z wpisów `accepted`, a wymagany wymiar pobieramy przez `Settings::edition('internship_hours_required')`.
- Wyświetlamy opisy jako zwykły tekst i stale przypominamy o zakazie wpisywania danych osób konsultowanych.
- Rejestrujemy decyzje wyłącznie jako `internship.accepted` lub `internship.returned` przez `AuditLog::record` i wysyłamy odpowiadające im typy przez `Notify::send`.
- Dodajemy testy przepływów H11 i dokument demonstracyjny `DEMO/H11.md`, obejmujące również stany ładowania, pustej listy, błędu i trwających akcji.
- Przyjmujemy zatwierdzoną macierz kontraktu H11: bez trasy `GET` wpisu po identyfikatorze, z dokładnie określonym zasobem uczestnika i rozszerzeniem administracyjnym, pełnym zasobem po decyzji, błędem `entry_locked` dla niedozwolonej decyzji, wyłącznie łącznym postępem godzinowym oraz zachowaniem komentarza opiekuna po ponownym złożeniu i późniejszej akceptacji.

## Capabilities

### New Capabilities

- `internship-journal-approvals`: Dziennik stażu uczestnika, administracyjna kolejka akceptacji, walidacja, autoryzacja, liczenie zaakceptowanych godzin, powiadomienia, audyt i komplet stanów interfejsu.

### Modified Capabilities

Brak.

## Impact

- Backend H11: kontrolery, FormRequesty, zasoby odpowiedzi, autoryzacja, serwis przepływu decyzji, testy oraz wyłącznie `backend/routes/api/h11.php` spośród plików tras.
- Frontend H11: nowe strony w istniejących grupach App Router i komponenty domenowe korzystające z `frontend/lib/api.ts` oraz komponentów bazowych.
- Dokumentacja: `DEMO/H11.md`, artefakty tej zmiany oraz uzupełniona macierz HTTP w `docs/hackathon/02-kontrakt-api.md`.
- Dane i integracje: istniejąca tabela `internship_entries`, `Settings`, `Notify` i `AuditLog`; bez migracji, nowych zależności, zmian zamrożonych fasad, layoutów, `UserResource`, rejestru menu ani zakresu innych pakietów.
