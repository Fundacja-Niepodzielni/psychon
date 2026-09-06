## Why

Fundacja potrzebuje kontrolowanego, audytowalnego wejścia kandydatów do programu bez publicznej samodzielnej rejestracji. H03 ma połączyć administracyjną kolejkę zgłoszeń z utworzeniem konta, zaproszeniem do ustawienia hasła, limitem miejsc edycji, importem CSV i rejestrowanym dostępem do dokumentów wrażliwych.

## What Changes

- Dodajemy administracyjną kolejkę zgłoszeń z listą, szczegółami, statusami i bezpiecznym wglądem w skan dyplomu.
- Dodajemy ręczne tworzenie zgłoszeń oraz import CSV z raportem `imported/skipped`, bez tworzenia kont dla niepoprawnych lub zduplikowanych wierszy.
- Dodajemy transakcyjną akceptację zgłoszenia: kontrolę limitu aktywnej edycji, jawne `force`, utworzenie konta, sześciomiesięczny dostęp, zaproszenie aktywacyjne, audyt i zatwierdzone powiadomienie.
- Dodajemy odrzucenie z obowiązkowym powodem, audytem i zatwierdzonym typem powiadomienia/e-maila.
- Dodajemy rejestrowanie każdego administracyjnego wglądu w skan dyplomu jako `sensitive.viewed` oraz wpis w `sensitive_access_log`.
- Dostarczamy samodzielny komponent zakładki „Zgłoszenia”, przeznaczony do osadzenia przez właściciela H18 w `/admin/uczestniczki`, bez edycji strony H18 przez H03.
- Dodajemy testy potwierdzające brak publicznej trasy samodzielnej rejestracji oraz autoryzację operacji administracyjnych.
- Na potrzeby implementacji użytkownik zatwierdził lokalne uzupełnienie niepełnego kontraktu; decyzje są jawnie zapisane w `design.md` i przeznaczone do późniejszej synchronizacji przez strażnika kontraktu.

## Capabilities

### New Capabilities

- `recruitment-applications`: Administracyjna kolejka zgłoszeń, ręczne wprowadzanie i import CSV, decyzje accept/reject, limit miejsc z jawnym `force`, tworzenie konta i zaproszenia oraz audyt dostępu do skanów dyplomu.

### Modified Capabilities

Brak.

## Impact

- Backend H03: modele istniejącego schematu, FormRequesty, Resources, serwisy transakcyjne, kontrolery, testy oraz wyłącznie `backend/routes/api/h03.php`.
- Frontend H03: komponenty i typy H03 korzystające z istniejącego klienta API, design tokenów i bazowych komponentów UI; integracja docelowa przez slot należący do H18.
- Integracje: aktywacja konta ze startera (`POST /auth/activate`), `AuditLog::record`, `Notify::send`, aktywna edycja i skrzynka e-maili H16.
- Dane: istniejące tabele `applications`, `users`, `editions`, `audit_log`, `sensitive_access_log`, `notifications` i `emails`; bez migracji i nowych zależności.
- Kontrakt: implementacja używa lokalnego override opisanego w `design.md`; kanoniczny dokument API wymaga późniejszego uzupełnienia.
