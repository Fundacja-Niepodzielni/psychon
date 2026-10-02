# Pomiar starego ekranu „Profil psychologa”

Spis tego, co robi dziś strona `app/(uczestnik)/panel/profil-psychologa/page.tsx` z komponentem
`components/h15/PsychologistProfileForm.tsx`. Nowy ekran z tego folderu ma robić dokładnie to samo:
te same żądania, te same pola, te same reguły.

Źródła pomiaru: kod komponentu i strony, `lib/h15/types.ts`, a po stronie serwera
`backend/routes/api/h15.php`, `PsychologistProfileController`, żądania `UpdatePsychologistProfileRequest`,
`StoreProfileDocumentRequest`, `SubmitPsychologistProfileRequest` i zasób `PsychologistProfileResource`.

## Dostęp

Strona ma osłonę z kontrolą roli w `layout.tsx`; trasy serwera wymagają zalogowania, aktywnego dostępu
i tej samej roli. Cały ekran dotyczy jednej osoby: serwer zawsze pracuje na wniosku zalogowanej osoby,
żadne żądanie nie niesie identyfikatora wniosku.

## Żądania

| Kiedy | Metoda i ścieżka | Ciało wysyłane | Pola, które ekran czyta z odpowiedzi |
|---|---|---|---|
| przy wejściu na ekran | `GET /psychologist-profile` | — | `eligible`, `specializations`, `approach`, `city`, `bio`, `status`, `return_reason`, `documents[]` (`id`, `type`, `uploaded_at`) |
| „Zapisz zmiany” | `PATCH /psychologist-profile` | `specializations` (lista tekstów: wpis z pola rozdzielony przecinkami, bez spacji na brzegach, bez pustych), `approach`, `city`, `bio` (każde tekst albo `null`, gdy puste) | cały wniosek jak wyżej; błąd 422: `errors` (komunikaty pól) |
| „Dodaj załącznik” | `POST /psychologist-profile/documents` (multipart) | `type` (`dyplom` · `niekaralnosc` · `inne`), `file` | brak; po sukcesie ekran woła ponownie `GET /psychologist-profile` |
| „Złóż wniosek” | `POST /psychologist-profile/submit` | `publication_consent` (wartość pola zaznaczenia) | cały wniosek jak wyżej; błąd 422 `profile_incomplete`: `reason.missing` |
| „Wycofaj zgodę” | `POST /psychologist-profile/consent/withdraw` | bez ciała | cały wniosek jak wyżej |

Dodatkowe pole odpowiedzi `publication_consent_granted` jest w typie, ale ekran go nie czyta.
Zapis pól i złożenie wniosku to dwa osobne żądania: złożenie nie wysyła wartości pól, serwer sprawdza
to, co jest już zapisane.

## Pola formularza

| Pole | Co wysyła | Reguła na ekranie | Reguła serwera i jej komunikat |
|---|---|---|---|
| Specjalizacje | lista z tekstu rozdzielonego przecinkami | brak; podpowiedź „Oddziel przecinkami, np.: wsparcie w kryzysie, praca z młodymi dorosłymi.” | lista tekstów: „Lista specjalizacji ma nieprawidłowy format.”, „Każda specjalizacja musi być tekstem.” |
| Nurt terapeutyczny | tekst albo `null` | brak | tekst, najwyżej 255 znaków: „Opis podejścia może mieć najwyżej 255 znaków.” |
| Miasto | tekst albo `null` | brak | tekst, najwyżej 255 znaków: „Nazwa miasta może mieć najwyżej 255 znaków.” |
| Opis (bio) | tekst albo `null` | brak (4 wiersze) | tekst: „To pole musi być tekstem.” |
| Typ załącznika | jedna z trzech wartości | lista: Dyplom, Zaświadczenie o niekaralności, Inny dokument | „Wybierz typ załącznika.”, „Wybierz dozwolony typ załącznika.” |
| Plik | plik | atrybut `accept`: PDF, JPG, JPEG, PNG; pusty wybór → „Wybierz plik przed dodaniem załącznika.” | „Wskaż plik do wgrania.”, „Wgraj poprawny plik.”, „Dozwolone formaty pliku: PDF, JPG, PNG.”, „Plik może mieć maksymalnie 10 MB.” |
| Zgoda na publikację | zaznaczenie | „Wyrażam zgodę na publikację mojego profilu w bazie psychologów Fundacji.”; startuje niezaznaczone | „Zgoda na publikację przyjmuje tylko wartość prawda/fałsz.” |

Komunikaty błędów pól wyświetla stary ekran tylko dla pól tekstowych i tylko pod dokładnie tym kluczem
(`specializations`, `approach`, `city`); błąd pozycji listy (`specializations.0`) nie jest nigdzie pokazany.
Przy 422 nad formularzem pojawia się zdanie „Popraw zaznaczone pola.”. Komunikaty błędów załącznika
stary ekran pokazuje z ogólnego `message` odpowiedzi, nie z pól.

Warunek aktywności przycisku „Złóż wniosek” (liczony z wartości w polach, nie z zapisanych): specjalizacje,
nurt i miasto niepuste, na liście jest załącznik typu dyplom i zaznaczona zgoda. Gdy nieaktywny, pod
przyciskiem stoi zdanie „Uzupełnij specjalizacje, nurt, miasto i dyplom oraz zaznacz zgodę na publikację,
aby złożyć wniosek.”. Błąd 422 `profile_incomplete` pokazuje „Uzupełnij wniosek przed złożeniem.” i
zdanie „Brakuje: …” z listą: specjalizacje, nurt terapeutyczny, miasto, dyplom, zgoda na publikację.

## Stany wniosku (pole `status`) i co wolno w każdym

Edytowalne są stany `draft` i `returned`; wycofać zgodę wolno w `submitted`, `returned` i `accepted`.

| Stan | Etykieta na starym ekranie | Pola | Zapis | Załączniki | Złożenie | Wycofanie zgody |
|---|---|---|---|---|---|---|
| `draft` (także brak wniosku — serwer zwraca wtedy pusty `draft`) | Wersja robocza | do edycji | tak | tak | tak | nie |
| `submitted` | Oczekuje na weryfikację | zablokowane | nie | tylko lista | nie | tak |
| `returned` | Do poprawy | do edycji | tak | tak | tak | tak |
| `accepted` | Zaakceptowany | zablokowane | nie | tylko lista | nie | tak |
| `withdrawn` | Zgoda wycofana | zablokowane | nie | tylko lista | nie | nie |

W stanie `returned` nad formularzem stoi komunikat „Wniosek odesłany do poprawy” z treścią
`return_reason` (gdy jest). Stan `published` istnieje po stronie serwera i w administracji, a stary ekran
go nie zna (typ nie ma tej wartości, brak etykiety).

Poza stanami wniosku: gdy `eligible` = `false`, ekran pokazuje tylko informację „Wniosek o wpis do bazy
psychologów Fundacji będzie dostępny po ukończeniu całego programu.” i żadnego pola.

## Stany ekranu

1. Wczytywanie — zdanie „Wczytywanie…” z rolą `status`.
2. Błąd wczytania — komunikat z serwera albo „Nie udało się wczytać wniosku. Odśwież stronę.” (jedno wspólne
   ostrzeżenie na każdy błąd; bez ponowienia, bez rozróżnienia braku dostępu i braku połączenia).
3. Program nieukończony — informacja jak wyżej.
4. Formularz w jednym ze stanów z tabeli.
5. Komunikaty akcji: po zapisie „Wniosek został zapisany.”; błąd zapisu — komunikat serwera albo „Nie udało
   się zapisać wniosku. Spróbuj ponownie.”; błąd załącznika — komunikat serwera albo „Nie udało się dodać
   załącznika. Spróbuj ponownie.”; błąd złożenia — komunikat serwera albo „Nie udało się złożyć wniosku.
   Spróbuj ponownie.”; błąd wycofania — komunikat serwera albo „Nie udało się wycofać zgody. Spróbuj
   ponownie.”.
6. Lista załączników: typ (Dyplom · Zaświadczenie o niekaralności · Inny dokument) i data dodania; gdy pusta —
   „Nie dodano jeszcze żadnych załączników.”.
7. Przy każdej z czterech akcji (zapis, załącznik, złożenie, wycofanie) przycisk pokazuje stan ładowania.
   Wycofanie zgody odbywa się jednym kliknięciem, bez dodatkowego pytania; zdanie przy przycisku mówi, że
   wniosek przejdzie w stan „zgoda wycofana” i nie będzie już edytowalny.

## Nazwy stanów w administracji

Ekrany `nowy-front/profile-kolejka` i `nowy-front/profil-decyzja` nazywają te same stany słowami:
`draft` — „Wersja robocza”, `submitted` — „Czeka na decyzję”, `returned` — „Do poprawki”,
`accepted` — „Zatwierdzony”, `published` — „Opublikowany”, `withdrawn` — „Zgoda wycofana”. Stary ekran
uczestnika używa innych słów dla trzech z nich („Oczekuje na weryfikację”, „Do poprawy”, „Zaakceptowany”);
nowy ekran bierze nazwy z listy administracji.
