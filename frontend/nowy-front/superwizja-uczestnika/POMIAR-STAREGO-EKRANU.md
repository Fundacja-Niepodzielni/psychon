# Pomiar starego ekranu „Superwizja”

Stary ekran: strona `frontend/app/(uczestnik)/panel/superwizja/page.tsx` z komponentem
`frontend/components/h12/SupervisionSlots.tsx`. Układ strony
(`frontend/app/(uczestnik)/panel/superwizja/layout.tsx`) wpuszcza wyłącznie rolę `volunteer`.
Pozostałym rolom pokazuje zdanie odmowy, zanim komponent wyśle jakiekolwiek żądanie.

Pomiar zrobiony z kodu: komponentu, typów `frontend/lib/h12/types.ts` oraz tras i zasobu
serwera (`backend/routes/api/h12.php`, `ParticipantSupervisionController`,
`SupervisionSignupService`, `SupervisionSlotResource`, `SupervisionTiming`). Kod przeczytany,
niczego w nim nie zmieniano.

## Żądania

| Metoda | Ścieżka | Kiedy | Co wysyła | Co czyta |
|---|---|---|---|---|
| GET | `/supervision/slots?page=1&per_page=25` | przy wejściu, po „Spróbuj ponownie” i po każdym nieudanym zapisie albo wypisie | — | `data[]` (pola terminu niżej) i `meta.current_page`, `meta.last_page` |
| POST | `/supervision/slots/{id}/signup` | „Zapisz się” | bez ciała | jeden termin (te same pola) |
| DELETE | `/supervision/slots/{id}/signup` | „Wypisz się” | bez ciała | jeden termin (te same pola) |

Stary ekran zawsze prosi o pierwszą stronę po 25 terminów. Stronicowania nie ma: przy więcej
niż jednej stronie pokazuje tylko zdanie „Strona 1 z N”.

Pola terminu (`SupervisionSlotResource`): `id`, `starts_at` (znacznik czasu UTC),
`duration_minutes`, `seats_limit`, `location_or_link` (tekst albo `null`),
`active_signups_count`, `available_seats`, `is_full`, `can_sign_up` (serwer liczy je tym samym
warunkiem, którym odmawia zapisu i wypisu: termin jeszcze się nie rozpoczął) i `signup`
(`null` albo `{ signed_up_at, attendance }`, gdzie `attendance` to `present`, `absent` albo
`null`).

Stary ekran nie czyta `signed_up_at`. Pole `is_full` czyta tylko do plakietki i do wyłączenia
przycisku zapisu.

Serwer zwraca wyłącznie terminy aktualnie przypisanego superwizora, od najwcześniejszego. Osoba
bez przypisanego superwizora dostaje pustą listę, nie błąd.

## Odpowiedzi błędów zapisu i wypisu

| Odpowiedź | Kiedy | Co pokazuje stary ekran |
|---|---|---|
| 409 `slot_full` | brak wolnych miejsc w chwili zapisu | „Ten termin został właśnie zapełniony. Odśwież listę i wybierz inny termin.” |
| 403 `not_your_supervisor` | termin innego superwizora | „Możesz zapisywać się tylko na terminy swojego superwizora.” |
| 422 `validation_failed` | termin już się rozpoczął (zapis albo wypis) | komunikat serwera |
| 404 `not_found` | nieznany termin albo brak aktywnego zapisu przy wypisie | komunikat serwera |
| brak odpowiedzi | sieć | „Nie udało się wykonać operacji. Spróbuj ponownie.” |

Po każdym błędzie zapisu albo wypisu komunikat stoi przy karcie tego terminu, a lista jest
wczytywana ponownie. Gdy ponowne wczytanie się nie uda, lista zostaje na ekranie, a nad nią
stoi komunikat błędu z „Spróbuj ponownie”.

Ponowny zapis na termin, na który osoba już jest zapisana, serwer traktuje jako sukces bez
zmiany stanu.

## Stany starego ekranu

- **Wczytywanie:** „Wczytywanie terminów…”.
- **Błąd wczytywania bez listy:** komunikat serwera albo „Nie udało się wczytać terminów.
  Spróbuj ponownie.” oraz „Spróbuj ponownie”. Brak połączenia nie jest odróżniony od innego
  błędu.
- **Pusto:** „Nie masz jeszcze dostępnych terminów u swojego superwizora.”
- **Lista kart, po jednej na termin**, w kolejności z serwera. Ekran nie dzieli terminów na
  „Twoje” i „Wolne”. Na karcie:
  - tytuł — data i godzina w pełnym zapisie z dniem tygodnia, z własnego formatera;
  - plakietka — „Termin już się odbył” (gdy `can_sign_up` jest fałszywe), „Brak miejsc” (pełny
    termin bez zapisu osoby) albo „N miejsce/miejsca wolne” (odmiana tylko dla 1 i reszty, więc
    „5 miejsca wolne” jest błędne);
  - czas trwania w minutach („60 min”);
  - „Zapisane osoby: X / Y”;
  - „Obecność” — tylko przy zapisie osoby: „Obecność potwierdzona” (`present`),
    „Nieobecność” (`absent`), „Jeszcze nieoznaczona” (`null`);
  - „Miejsce lub link” — tekst albo „Szczegóły u prowadzącego”; link nie jest klikalny;
  - przy zapisie osoby plakietka „Jesteś zapisany/a” (forma nieneutralna) i przycisk
    drugorzędny „Wypisz się”;
  - bez zapisu przycisk główny „Zapisz się” — na każdej karcie, więc przy kilku terminach jest
    kilka przycisków głównych;
  - przycisk wyłączony, gdy termin się rozpoczął albo jest pełny. Przy rozpoczętym terminie
    stoi zdanie „Termin już się rozpoczął — zapis i wypis nie są już możliwe.” Przy pełnym
    terminie zdania nie ma — mówi o tym tylko plakietka;
  - komunikat błędu tej karty.
- **W trakcie zapisu albo wypisu:** przycisk tej karty w stanie ładowania.
- **Po zapisie albo wypisie:** komunikat nad listą „Zapisano Cię na termin.” albo „Wypisano Cię
  z terminu.”, zostaje do następnej akcji. Kartę zastępuje termin z odpowiedzi, bez ponownego
  wczytania listy.
- **Wypis bez pytania o potwierdzenie.**
- **Więcej niż jedna strona:** zdanie „Strona X z Y”, bez przycisków stronicowania.

## Jak to przenosi nowy ekran

Te same trzy żądania, z tymi samymi ścieżkami, bez ciała, z tą samą pierwszą stroną po 25
terminów. Ponowne wczytanie listy po nieudanym zapisie albo wypisie zostaje. Termin z odpowiedzi
zastępuje kartę bez ponownego wczytania. Nowe są tylko układ i słowa: podział na „Twoje
terminy”, „Wolne terminy” i terminy, które już się odbyły, pytanie przed wypisem, odróżnienie
braku połączenia, wspólny ekran odmowy oraz zdania przy każdym wyłączonym przycisku.
