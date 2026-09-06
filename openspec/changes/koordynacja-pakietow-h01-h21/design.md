## Context

Pakiety H01–H21 są zdefiniowane jako samodzielne pionowe wycinki obejmujące API, ekran, testy i dane demo. Repozytorium narzuca jeden kontrakt API, zamrożone migracje, własność plików współdzielonych oraz obowiązkowe review i bramki CI dla każdego oficjalnego PR-a do repozytorium Fundacji; wiele pakietowych PR-ów może pozostawać otwartych równolegle.

Zespół liczy pięć kodujących osób. Osoby nie mają stałych domen: po ukończeniu pakietu pobierają kolejny gotowy pakiet z priorytetyzowanej kolejki.

## Goals / Non-Goals

**Goals:**

- Zapewnić jednoznacznego właściciela całego pakietu HXX.
- Umożliwić pięciu osobom niezależną, asynchroniczną pracę bez dublowania zakresu.
- Utrzymać widoczną kolejność P0 → P0.5/P1 → P2.
- Scalać i testować każdy pakiet przed pobraniem kolejnego.
- Utrzymać jeden wspólny PR zespołu do repozytorium Fundacji.

**Non-Goals:**

- Przypisywanie osobom stałych domen lub ról backend/frontend.
- Zmiana treści pakietów, kontraktu API, kryteriów akceptacji lub modelu danych.
- Deklarowanie, że wszystkie H01–H21 muszą zostać ukończone podczas wydarzenia.
- Tworzenie alternatywnej tablicy produktowej poza repozytorium.

## Decisions

### Cały pakiet należy do jednej osoby

Właściciel pakietu odpowiada za backend, frontend, autoryzację, walidację, testy, stany interfejsu i `DEMO/HXX.md`. Dzięki temu przekazanie odpowiedzialności nie zatrzymuje się na granicy warstw technicznych.

Alternatywa odrzucona: podział na backend, frontend i testy. Tworzyłby zależności oczekiwania między osobami i rozmywał odpowiedzialność za kryteria odbioru.

### Przydział działa jako kolejka pull

Każda osoba ma jeden aktywny pakiet. Po oddaniu go do review pobiera najwyżej położony pakiet oznaczony jako gotowy. Pakiet z realną blokadą zostaje jawnie oznaczony, a właściciel może pobrać następny po uzgodnieniu z zespołem.

Alternatywa odrzucona: przypisanie wszystkich pakietów osobom z góry. Utrudniałoby reagowanie na różnice w pracochłonności i blokady integracyjne.

### Kolejność wynika z priorytetów organizatora

Kolejka jest podzielona na trzy fale:

1. P0 i minimum ★: H01, H02, H05, H06, H10, H13★, H16, H18, H19, H21.
2. P0.5 i P1: H03, H04, H07, H08, H09, H11, H12 oraz pełny zakres H13.
3. P2: H14, H15, H17, H20.

W obrębie fali pobierany jest pakiet gotowy do pracy, z uwzględnieniem własności plików i dostępnych slotów opisanych w przewodniku hackathonu.

Alternatywa odrzucona: kolejność numeryczna H01–H21. Nie odpowiada priorytetom demo i zależnościom produktu.

### Stan kolejki jest wersjonowany razem z planem

`tasks.md` jest wspólną tablicą. Przy każdym HXX przechowuje priorytet, status i właściciela. Roszczenie pakietu zaczyna się od aktualizacji tej pozycji oraz utworzenia gałęzi `pakiet/HXX-nazwa`.

Statusy robocze:

- `GOTOWE` — można pobrać,
- `W TOKU` — ma właściciela,
- `REVIEW` — implementacja i testy właściciela są gotowe,
- `DONE` — scalone i zweryfikowane,
- `BLOCKED` — opisana przeszkoda uniemożliwia dalszą pracę.

### Integracja jest częścią ukończenia pakietu

Osoba nie pobiera następnego HXX wyłącznie dlatego, że kod działa lokalnie. Pakiet musi mieć spełnione minimum ★, testy, obsługę odmowy dostępu, stan błędu/pusty oraz notatkę demo. Jeśli pełny zakres nie mieści się w dostępnej pracy, właściciel kończy minimum ★ i jawnie zapisuje pozostały zakres.

## Risks / Trade-offs

- [Dwie osoby pobierają ten sam pakiet] → Właściciel jest wpisywany w `tasks.md` przed rozpoczęciem implementacji; zespół sprawdza także istniejące gałęzie `pakiet/HXX-*`.
- [Duży pakiet blokuje jedną osobę] → Zachowujemy jednego właściciela, ale wolna osoba może pomóc na gałęzi pakietu; pierwszeństwo ma minimum ★.
- [Kolizje w plikach współdzielonych] → Stosujemy własność stron i slotów z przewodnika, często aktualizujemy gałąź z forka oraz nie modyfikujemy cudzych plików tras.
- [Integracja odkładana na koniec] → Przejście do następnego pakietu następuje dopiero po review lub jawnym oznaczeniu blokady.
- [Kolejka staje się nieaktualna] → Każda zmiana stanu pakietu obejmuje aktualizację `tasks.md` w tym samym PR-ze lub commicie co zmiana statusu.
- [Wszystkie pakiety są traktowane jako równoważne] → Fale P0, P0.5/P1 i P2 pozostają twardą kolejnością; P2 nie wyprzedza niedomkniętej ścieżki P0.

## Migration Plan

1. Scalić artefakty OpenSpec do głównej gałęzi forka zespołu.
2. Wpisać loginy pięciu osób do sekcji zespołu w `tasks.md`.
3. Każda osoba pobiera po jednym pakiecie z pierwszej fali i oznacza go `W TOKU`.
4. Po każdym scaleniu aktualizować status pakietu i pobierać kolejny gotowy element.
5. Jeśli model się nie sprawdzi, wycofanie polega na odwróceniu zmiany dokumentacyjnej; kod aplikacji nie jest nią modyfikowany.
