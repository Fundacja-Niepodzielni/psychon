## Why

Pakiet H12 ma dostarczyć kompletny przepływ superwizji: uczestnik zapisuje się na termin własnego superwizora, prowadzący zarządza swoją grupą i obecnościami, a administracja zachowuje historię przypisań. Jest to potrzebne teraz, ponieważ obecności zasilają warunek certyfikatu, a H12 jest również właścicielem ekranu grupy, na którym później zintegruje się H07.

## What Changes

- Dodajemy ekran uczestnika `/panel/superwizja` z terminami aktualnego superwizora, informacją o dostępności miejsc oraz akcjami zapisu i wypisu.
- Dodajemy ekran prowadzącego `/prowadzacy/grupa` z listą wyłącznie własnej grupy, postępami pobieranymi przez istniejący `ProgressAggregator`, tworzeniem własnych terminów i oznaczaniem obecności.
- Przygotowujemy na ekranie `/prowadzacy/grupa` jawny punkt integracyjny dla przyszłej sekcji rzetelności H07, bez implementowania H07.
- Implementujemy wyłącznie zakontraktowane trasy H12: `GET /supervision/slots`, `POST/DELETE /supervision/slots/{id}/signup`, `GET /instructor/group`, `POST /instructor/slots`, `PATCH /instructor/slots/{id}/attendance` oraz `PUT /admin/users/{id}/supervisor`. H12 jest jedynym implementującym endpoint przypisania, a H18 pozostaje jego konsumentem.
- Egzekwujemy role, aktywny dostęp i relacje właścicielskie po stronie serwera: uczestnik widzi i rezerwuje tylko terminy aktualnego superwizora, prowadzący widzi tylko swoją grupę i tworzy własne terminy, a obecność może ustawić prowadzący danego terminu albo administracja.
- Zapewniamy transakcyjną ochronę limitu miejsc; równoległe próby nie mogą przekroczyć limitu, a żądania nadmiarowe zwracają `409 slot_full`.
- Zachowujemy historię zmiany superwizora przez zamknięcie poprzedniego przypisania polem `unassigned_at` i utworzenie nowego rekordu; wcześniejsze obecności nadal są uwzględniane bez modyfikowania `ProgressAggregator`.
- Ograniczamy obecność do `present` i `absent`, audyt przypisania wyłącznie do `supervisor.assigned` oraz nie emitujemy żadnych typów powiadomień H12; `supervision.reminder` pozostaje poza zakresem hackathonu.
- Dodajemy testy autoryzacji, izolacji grup, historii przypisań, obecności i warunku certyfikatu oraz obowiązkowy test współbieżności 10 prób na 3 miejsca: 3×201, 7×409 i 3 aktywne zapisy w bazie.
- Ponieważ oficjalny kontrakt jest zamknięty, brakujące szczegóły operacyjne zapisujemy wyłącznie w zmianie H12 jako profil implementacyjny oparty na istniejącym schemacie, ogólnych kopertach API i tabeli kodów błędów. Nie dodajemy tras, pól bazy, kodów domenowych, zdarzeń ani powiadomień.

## Capabilities

### New Capabilities

- `supervision-booking-attendance`: Terminy i zapisy uczestnika, grupa i terminy prowadzącego, obecności, historia przypisań superwizora, zasilanie postępu oraz punkt integracyjny H07.

### Modified Capabilities

Brak.

## Impact

- Backend H12: kontrolery, FormRequesty, Resources/serializacja, serwisy transakcyjne, autoryzacja, testy oraz wyłącznie `backend/routes/api/h12.php` spośród plików tras.
- Frontend H12: nowe strony w istniejących grupach App Router, wąskie komponenty klienckie korzystające z `frontend/lib/api.ts`, komponentów bazowych i tokenów z `DESIGN.md`, bez zmian layoutów i współdzielonego rejestru menu.
- Dane: istniejące `supervisor_assignments`, `supervision_slots`, `supervision_signups`, `editions` i kanoniczne seedy; bez migracji i bez zmiany `ProgressAggregator`.
- Integracje: `AuditLog::record` wyłącznie dla `supervisor.assigned`; brak wywołań `Notify::send`; H18 konsumuje endpoint przypisania należący do H12, a H07 otrzymuje jawny slot ekranu grupy.
- Ograniczenia: bez nowych zależności Composer/npm, zmian zamrożonych fasad, `UserResource`, tras innych pakietów, zmian H06/H11/koordynacji ani implementacji H07/H18.
