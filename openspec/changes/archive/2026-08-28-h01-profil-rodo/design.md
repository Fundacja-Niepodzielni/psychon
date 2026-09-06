## Context

Zob. `proposal.md` — „Why". Poniżej wyłącznie decyzje techniczne, jakie faktycznie znajdują
się w scalonym kodzie (`app/Http/Controllers/Api/V1/ProfileController.php` i sąsiednie pliki).

Stan zastany, zweryfikowany w kodzie:

- `User` szyfruje `pesel` i `address_{street,city,zip}` castem `encrypted`; `pesel` jest
  dodatkowo w `$hidden` — trafia do odpowiedzi wyłącznie przez jawne pole w `ProfileResource`.
- `data_exports` (`public_id, user_id, status, file_path, error, completed_at`) — `public_id`
  jest kluczem trasy (`getRouteKeyName()`), więc żadna trasa nie ujawnia wewnętrznego PK.
- `Notify::send` i `ProgressAggregator::for()` to zamrożone sygnatury startera; H01 tylko
  z nich korzysta.
- Kolejka: `database` driver, kontener `queue` w docker-compose; testy uruchamiają `sync`,
  więc `POST /me/exports` w teście od razu daje `status: ready`.

## Goals / Non-Goals

**Goals:**

- Właściciel zawsze widzi swój pełny profil, bez maskowania — maskowanie jest zadaniem
  widoków innych niż właściciel (H18), nie H01.
- `email` jest niezmienne przez ten endpoint bez karania klienta błędem — cichy no-op jest
  celowo łagodniejszy niż 422/403, bo pole bywa wysyłane przez formularz bez modyfikacji.
- Jedna transakcyjna ścieżka eksportu: `queued → processing → ready|failed`, zawsze dokładnie
  jeden plik JSON, zawsze dokładnie jedno powiadomienie przy `ready`.
- Brak wpisu audytu dla eksportu jest świadomą decyzją zgodną z kontraktem (rejestr §3.2 nie
  ma sluga `export.*`), nie luką do naprawienia.

**Non-Goals:**

- Maskowanie PESEL dla widoków administracyjnych/innych użytkowników (H18).
- Panel administracyjny profili, usuwanie/anonimizacja danych (RODO art. 17 — poza zakresem
  hackathonu, §4 kontraktu).
- Prawdziwa asynchroniczność w środowisku testowym (testy celowo używają kolejki `sync`).

## Decisions

### Walidacja PESEL jako osobna reguła (`app/Rules/Pesel.php`)

11 cyfr; miesiąc koduje wiek/stulecie przez `intdiv(miesiąc, 20)` (0→1900s, 1→2000s,
2→2100s, 3→2200s, 4→1800s, inne → nieprawidłowy); suma kontrolna z wagami
`[1,3,7,9,1,3,7,9,1,3]`, `(10 - suma % 10) % 10` musi zgadzać się z ostatnią cyfrą. Jeden
komunikat błędu dla wszystkich przypadków niepoprawności — nie ujawnia, która część zawodzi.

### `email` usuwany przed walidacją, nie odrzucany

`UpdateProfileRequest::prepareForValidation()` usuwa klucz `email` z danych wejściowych,
zanim reguły walidacji w ogóle go zobaczą. Alternatywa (reguła `prohibited` → 422) została
odrzucona, bo formularz frontendowy zawsze wysyła `email` jako pole wyszarzone — 422 przy
każdym zapisie byłoby złym doświadczeniem bez żadnej korzyści bezpieczeństwa.

### Eksport: pięć zakresów budowanych w jednym miejscu

`GenerateDataExport::payloadFor()` składa `profile`, `consents`, `progress`
(`ProgressAggregator::for()` + liczniki per lekcja), `internship_entries`, `documents`
(wyłącznie metadane — bez plików PDF, bo to duplikowałoby H14). Job jest idempotentny wobec
brakującego użytkownika/eksportu (cichy `return`, obsługa wyścigu z usunięciem konta).

### 404 zamiast 403 dla cudzego eksportu

`ownExportOrFail()` skanuje po `user_id = auth()->id()` — brak dopasowania (cudzy albo
nieistniejący `id`) zawsze kończy się `ModelNotFoundException` → 404 `not_found`. Zgodne
z tabelą decyzyjną kontraktu §1.1: pojedynczy zasób wskazywany identyfikatorem nie ujawnia
istnienia cudzego rekordu, więc nie ma tu osobnej gałęzi 403.

## Risks / Trade-offs

- Brak audytu dla edycji profilu i eksportu oznacza, że dziennik działań (H20) nie zobaczy
  tych zdarzeń — zaakceptowane, bo rejestr audytu §3.2 nie definiuje odpowiednich slugów.
- Plik eksportu trafia na dysk `local` bez czasu wygasania/czyszczenia — poza zakresem
  hackathonu (brak wymogu w kontrakcie), ale warto odnotować jako dług, gdyby program działał
  produkcyjnie dłużej niż jedną edycję.

## Migration Plan

Brak — kod jest już scalony do `main`, migracja `data_exports` już zastosowana. Ta zmiana nie
wymaga żadnych kroków wdrożeniowych; jedynym efektem jest zsynchronizowanie
`openspec/specs/profile-gdpr-export` po zaakceptowaniu.

## Open Questions

Brak pytań blokujących — zachowanie jest już w produkcji i przetestowane. Ewentualna decyzja
o cofnięciu edytowalności `first_name`/`last_name` (patrz „Świadomie udokumentowane
odstępstwa" w `proposal.md`) należałaby do strażnika kontraktu, ale nie jest to warunek
zamknięcia tego backfillu.
