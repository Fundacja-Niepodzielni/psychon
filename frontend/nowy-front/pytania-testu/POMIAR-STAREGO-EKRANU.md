# Pomiar starego ekranu „Bank pytań”

Pomiar zrobiony na kodzie przed zmianą, na czubku gałęzi `sprint-2`. Źródła:

- `frontend/app/(administracja)/admin/testy/[id]/pytania/page.tsx` (panel administracji),
- `frontend/app/(prowadzacy)/prowadzacy/testy/[id]/pytania/page.tsx` (panel prowadzącego),
- `frontend/components/h10/QuestionBank.tsx` i `frontend/components/h10/QuestionForm.tsx`,
- `frontend/lib/h10/types.ts` (walidacja w przeglądarce),
- po stronie serwera, tylko do odczytu: `backend/routes/api/h10.php`,
  `AdminTestQuestionController.php`, `StoreTestQuestionRequest.php`, `UpdateTestQuestionRequest.php`.

## Żądania

Oba panele wysyłają dokładnie te same żądania. Panel prowadzącego nie ma własnych tras.

| Metoda | Trasa | Wysyłane pola | Czytane pola |
|---|---|---|---|
| GET | `/admin/tests/{id}/questions` | — | lista pytań: `id`, `body`, `sequence_order`, `answers[].id`, `answers[].body`, `answers[].is_correct` |
| POST | `/admin/tests/{id}/questions` | `body`, `answers[].body`, `answers[].is_correct` | nowe pytanie w tym samym kształcie |
| PATCH | `/admin/questions/{id pytania}` | `body`, `answers[]` z `id` (tylko odpowiedzi, które już są), `body`, `is_correct` | pytanie po zmianie w tym samym kształcie |
| DELETE | `/admin/questions/{id pytania}` | — | `id`, `deleted` (ekran tego nie czyta) |

Przy błędzie ekran czyta z odpowiedzi `status`, `message` i `errors` (błędy pól).

`PATCH` zastępuje cały zestaw odpowiedzi: odpowiedź z `id` jest zmieniana,
odpowiedź bez `id` powstaje, a brakująca jest usuwana. Pole `sequence_order`
serwer przyjmuje, ale stary ekran go nie wysyła.

## Kto może co

- Trasy stoją w grupie serwera z rolami `project_manager` i `super_admin`. Każda inna rola
  dostaje odpowiedź 403.
- Panel prowadzącego montuje ten sam ekran, więc prowadzący dostaje 403 i stan odmowy.
  Komentarz w kodzie strony mówi o tym wprost. Serwer nie daje prowadzącemu banku pytań.
- Do samych stron w starej powłoce wpuszcza tylko odpowiednia rola: panel administracji
  wpuszcza administrację, a panel prowadzącego wpuszcza prowadzącego.

## Rodzaje pytań i reguły odpowiedzi

- Jest jeden rodzaj pytania: wybór jednej odpowiedzi z listy.
- Poprawną odpowiedź wskazuje się przyciskiem wyboru jednej opcji. Zawsze jest dokładnie
  jedna poprawna.
- Nowe pytanie startuje z dwiema pustymi odpowiedziami. Pierwsza jest zaznaczona jako poprawna.
- Odpowiedź można dodać bez limitu.
- Nie można usunąć odpowiedzi, gdy zostały dwie. Przycisk „Usuń” jest wtedy wyłączony, bez zdania, które by mówiło dlaczego.
- Usunięcie odpowiedzi poprawnej przenosi to oznaczenie na pierwszą z pozostałych.
- Długość: treść pytania do 2000 znaków, treść odpowiedzi do 1000 znaków. Pole nie
  pozwala wpisać więcej.
- Kolejność pytań nadaje serwer (`sequence_order`). Stary ekran jej nie zmienia: nie ma
  przeciągania ani strzałek.

## Komunikaty walidacji

W przeglądarce, przed wysłaniem (`draftError`). Ekran pokazuje pierwszy pasujący komunikat
w jednym czerwonym komunikacie nad formularzem:

- „Treść pytania nie może być pusta.” (pusta albo same spacje),
- „Pytanie musi mieć co najmniej 2 odpowiedzi.”,
- „Każda odpowiedź musi mieć treść.”,
- „Zaznacz dokładnie jedną poprawną odpowiedź.”

Z serwera (odpowiedź 422, pokazana pod polem i jako komunikat ogólny):

- `body`: „Podaj treść pytania.”, „Treść pytania może mieć najwyżej 2000 znaków.”,
- `answers`: „Podaj odpowiedzi do wyboru.”, „Odpowiedzi mają nieprawidłowy format.”,
  „Pytanie musi mieć co najmniej 2 odpowiedzi.”, „Zaznacz dokładnie jedną poprawną odpowiedź.”,
- `answers.N.body`: „Podaj treść każdej odpowiedzi.”, „Treść odpowiedzi może mieć najwyżej 1000 znaków.”,
- `answers.N.is_correct`: „Zaznacz, czy odpowiedź jest poprawna.”,
  „Poprawność odpowiedzi przyjmuje tylko wartość prawda/fałsz.”,
- tylko przy zmianie: `sequence_order` i `answers.N.id`. Stary ekran tych pól nie wysyła.

Zdania zapasowe, gdy serwer nie przysłał komunikatu: „Nie udało się wczytać banku pytań.”,
„Nie masz uprawnień do wyświetlenia banku pytań.”, „Nie udało się dodać pytania.”,
„Nie udało się zapisać pytania.”, „Nie udało się usunąć pytania.”

## Stany

- **Adres z niepoprawnym numerem testu** (nie liczba całkowita dodatnia): strona 404 aplikacji, bez żądania.
- **Wczytywanie:** karta „Bank pytań” z napisem „Wczytywanie pytań…”.
- **Odmowa (403):** stan odmowy ze zdaniem serwera, bez ponawiania.
- **Każdy inny błąd odczytu** (w tym 404 nieznanego testu i brak sieci): karta
  „Nie udało się otworzyć banku pytań”, zdanie serwera i przycisk ponowienia.
  Stary ekran nie odróżnia „nie ma testu” ani „brak połączenia”.
- **Lista:** karta „Pytania w teście: N” ze zdaniem, że zmiany nie dotykają zakończonych
  podejść. Każde pytanie ma numer (`sequence_order`), treść i odpowiedzi; poprawna ma znak ✓
  i dopisek dla czytnika „Poprawna odpowiedź:”. Każde pytanie ma też przyciski „Edytuj”
  i „Usuń” z nazwami „Edytuj pytanie N” i „Usuń pytanie N”.
- **Pusta lista:** zdanie „Ten test nie ma jeszcze żadnego pytania.”
- **Dodawanie:** karta „Nowe pytanie” stoi zawsze pod listą. Ma przycisk „Dodaj pytanie”
  ze stanem wysyłania. Po dodaniu pytanie trafia na koniec listy, a formularz się czyści.
- **Edycja:** formularz w miejscu wiersza, przyciski „Zapisz pytanie” i „Anuluj”. Otwarcie
  edycji innego pytania porzuca bez pytania zmiany w poprzednim.
- **Usuwanie:** okno przeglądarki „Usunąć pytanie: {pierwsze 80 znaków}? Wyniki wcześniejszych
  podejść zostaną bez zmian.” Po zgodzie pytanie znika z listy, a przy błędzie pojawia się
  czerwony komunikat nad listą.
- Ekran nie pyta o niezapisane zmiany przy wyjściu.

## Różnice między panelami

| | Panel administracji | Panel prowadzącego |
|---|---|---|
| Okruszki | Kursy (`/admin/kursy`) › Bank pytań | Kursy (`/prowadzacy/kursy`) › Bank pytań |
| Tytuł karty przeglądarki | „Bank pytań — Niepodzielni” | „Bank pytań — Panel prowadzącego — Niepodzielni” |
| Żądania | te same | te same |
| Wynik dla właściwej roli | pełna obsługa | odmowa 403 z serwera |

Okruszki nie prowadzą do konkretnego kursu, bo odpowiedź listy pytań nie niesie kursu.
