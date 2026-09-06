## Context

Zob. `proposal.md` — „Why". Poniżej wyłącznie to, co kształtuje podejście techniczne.

Stan zastany, zweryfikowany w kodzie:

- Tabela `documents` istnieje i ma komplet kolumn: `user_id`, `edition_id`, `type`, `number`,
  `data_snapshot` (json), `pdf_path`, `generated_at`, `signature_status`, unikat
  `(edition_id, type, number)`. **Nie ma** unikatu `(user_id, edition_id, type)` — a migracje
  są zamrożone (tylko addytywne, przez strażnika schematu, w wyznaczonych oknach).
- `App\Models\Document` gotowy, z castem `data_snapshot => array` i `generated_at => datetime`.
- `PdfService::render(view, data)` renderuje Blade i zapisuje **HTML** na dysku `local`
  pod `pdf/{Y}/{m}/{uuid}.html`, zwracając ścieżkę. Sygnatura zamrożona.
- `Notify::send`, `AuditLog::record`, `Settings::edition`, `ProgressAggregator::for` — gotowe,
  sygnatury zamrożone. `ProgressAggregator::for()['hours_accepted']` zwraca string, np. `"41.5"`.
- `User` szyfruje `pesel` i `address_*` castem `encrypted` — odczyt przez model daje jawny
  tekst, więc snapshot pracuje na wartościach odszyfrowanych. `pesel` jest w `$hidden`,
  więc nie wycieknie przypadkiem przez serializację modelu.
- Seed demo ma dla `marta@demo.pl` dokument `PW/2026/001` ze **ścieżką do pliku, którego nie ma
  na dysku** (`pdf/documents/pw-2026-001.html`) i `signature_status = signed_offline`.
- `routes/api/h14.php` jest pusty (same komentarze) — pakiet startuje od zera tras.
- `config/public_routes.php` nie zawiera tras dokumentów; plik należy do sztabu.

Ograniczenia: brak nowych zależności composer/npm, brak migracji, tylko własny plik tras,
autoryzacja po stronie serwera na każdym żądaniu, walidacja przez FormRequest, teksty UI po polsku.

## Goals / Non-Goals

**Goals:**

- Jedna ścieżka wydania dokumentu, w której warunki dostępności, numeracja, snapshot, render,
  powiadomienie i audyt są atomowe — albo wszystko, albo nic.
- Reguła „co jest w dokumencie" żyje w jednym miejscu (snapshot builder), tak że szablon Blade
  nie czyta modelu `User` i nie ma jak sięgnąć po dane świeższe niż snapshot.
- Numeracja odporna na równoległość bez migracji i bez nowej tabeli sekwencji.
- Ekran działa na seedzie demo bez ręcznego dosypywania plików na dysk.

**Non-Goals:**

- Prawdziwy renderer PDF — `PdfService` zostaje stubem; podmiana po hackathonie nie zmienia
  kontraktu ani niczego w tym pakiecie.
- Panel administracji dla dokumentów, podpis elektroniczny, unieważnianie, regeneracja.
- Wersjonowanie szablonów dokumentów (snapshot zamraża dane, nie układ graficzny).

## Decisions

### D1. Serwis domenowy `DocumentIssuer` zamiast logiki w kontrolerze

Kontroler robi trzy rzeczy: autoryzuje, waliduje typ przez FormRequest i woła serwis.
Cała reguła wydania — sprawdzenie warunków, numer, snapshot, render, `Notify`, `AuditLog` —
siedzi w `App\Services\H14\DocumentIssuer` wywoływanym w jednej transakcji.

*Dlaczego:* trzy warunki odmowy (`profile_incomplete`, `conditions_not_met`, duplikat) i pięć
skutków ubocznych to za dużo na kontroler, a testy jednostkowe reguły kompletności profilu
i numeracji nie powinny przechodzić przez HTTP. *Alternatywa:* wszystko w kontrolerze —
odrzucone, bo test współbieżności numeracji byłby wtedy testem HTTP, wolnym i chwiejnym.

### D2. Warunki dostępności typu jako osobny obiekt, wspólny dla listy i generowania

`DocumentTypeGate::for(User $user): array` zwraca dla każdego typu ze słownika
`documents.type` parę „dostępny / powód niedostępności". `GET /documents` renderuje to wprost
w `meta.extra.available_types`, a `POST /documents/generate` odpytuje ten sam obiekt i zamienia
powód na kod błędu.

*Dlaczego:* ekran musi pokazać powód **zanim** użytkowniczka kliknie, a serwer musi ten sam
powód wyegzekwować po kliknięciu. Jedno źródło znaczy, że kafel nie może twierdzić „możesz",
gdy serwer odpowie 422. *Alternatywa:* front liczy warunki sam z `/me` i `/internship/entries` —
odrzucone: dublowałoby regułę i wiązało H14 z trasami H01/H11, których kryteria odbioru
nie obejmują tego pakietu.

### D3. Kompletność profilu — lista pól jako stała w kodzie pakietu

`DocumentIssuer::REQUIRED_PROFILE_FIELDS` = `first_name`, `last_name`, `email`, `phone`,
`pesel`, `address_street`, `address_city`, `address_zip`. Pole brakuje, gdy jest `null` albo
pustym ciągiem po `trim`. Kod odmowy `profile_incomplete` (kontrakt §1.1, kolumna 422),
lista pól w `error.errors` z komunikatami po polsku.

*Dlaczego:* to dokładnie zestaw, który ma `marta@demo.pl` w seedzie — happy path działa na
seedzie bez zmian, a test ★1 czyści jedno pole na kopii konta. `email` jest w bazie `NOT NULL`
i nigdy nie zawiedzie, ale zostaje na liście, bo jest treścią porozumienia i lista ma być
czytelna jako „co musi być w umowie", nie jako „co potrafi być puste".

### D4. Numeracja: blokada wiersza edycji w transakcji + unikat jako siatka bezpieczeństwa

W transakcji: `SELECT ... FOR UPDATE` na wierszu aktywnej edycji, potem `MAX` sekwencji
dla pary (edycja, typ), potem `+1` i zapis. Format `PW/{rok edycji}/{NNN}` dla
`volunteer_agreement`, `ZS/{rok edycji}/{NNN}` dla `internship_certificate`. Istniejący unikat
`(edition_id, type, number)` zostaje jako ostatnia linia obrony — kolizja rzuca wyjątek,
a nie po cichu nadpisuje.

*Dlaczego:* blokada na wierszu edycji serializuje **całą** numerację w edycji, więc ciąg jest
bez dziur także wtedy, gdy dziesięciu użytkowników generuje jednocześnie. Rok bierzemy z edycji
(`starts_at`), nie z `now()` — inaczej dokument wydany 2 stycznia dostałby numer z innego roku
niż reszta edycji.

*Alternatywy:* (a) sekwencja Postgresa — wymaga migracji, a te są zamrożone; (b) `MAX+1` bez
blokady — dziura albo kolizja przy równoległości, wprost sprzeczne z wymaganiem;
(c) `lockForUpdate` na `documents` — nie blokuje wierszy, które jeszcze nie istnieją, więc dwa
żądania policzyłyby to samo `MAX`.

### D5. Duplikat: sprawdzenie wewnątrz tej samej transakcji, bez nowej migracji

Po zdobyciu blokady edycji serwis sprawdza, czy użytkownik ma już dokument tego typu w tej
edycji; jeśli tak — 409, bez zapisu. Blokada edycji już serializuje ścieżkę wydania, więc
warunek wyścigu „dwa równoległe żądania tej samej osoby" jest zamknięty bez unikatu w bazie.

*Dlaczego nie unikat `(user_id, edition_id, type)`:* wymagałby migracji, a te idą przez
strażnika schematu w wyznaczonych oknach — niewspółmierne do pakietu S. Warto to zgłosić jako
utwardzenie po hackathonie i zapisać w `DEMO/H14.md`.

**Zależność od strażnika kontraktu:** slug `document_already_generated` dla tego 409.
Sytuacja mieści się w tabeli §1.1 („duplikat unikalny" → 409), sam slug jeszcze nie jest
wypisany. Do czasu decyzji implementacja trzyma slug w jednej stałej, więc zamiana to jedna
linia. Kształt odpowiedzi (`error.reason.document_id`) nie zależy od rozstrzygnięcia.

### D6. Pobieranie: `auth:sanctum` + `signed`, link generowany na świeżo

Trasa `GET /documents/{document}/download` z middleware `['auth:sanctum', 'access.active', 'signed']`.
`download_url` powstaje przez `URL::temporarySignedRoute(..., now()->addMinutes(15), ...)`
przy **każdej** odpowiedzi listy i generowania — nie jest nigdzie zapisywany.

Kolejność sprawdzeń daje kody wymagane przez kryterium 3: `signed` odsiewa wygasły
i zmanipulowany podpis → **403**; dopiero potem policy właściciela → **404** dla cudzego
dokumentu (nie ujawniamy istnienia). Front pobiera przez `fetch` z nagłówkiem `Authorization`
i tworzy blob — `<a href download>` nie przeniósłby tokenu Bearer.

*Alternatywa:* trasa publiczna, wyłącznie na podpisie — działałaby jako zwykły `<a href>`,
ale wymaga dopisania wzorca do `config/public_routes.php` (plik sztabu, bramka CI
`PublicRoutesSmokeTest`) i zgody strażnika kontraktu. Odrzucone: wprowadza blokadę odbioru
w pakiecie, który poza tym nie ma żadnej.

### D7. Brakujący plik na dysku odtwarzany ze snapshotu

Gdy `pdf_path` wskazuje plik nieobecny na dysku, handler pobrania renderuje go ponownie
przez `PdfService::render` **wyłącznie z `data_snapshot`** i zapisuje nową ścieżkę.

*Dlaczego:* seed demo tworzy `PW/2026/001` ze ścieżką `pdf/documents/pw-2026-001.html`, której
nie ma w `storage` — bez tego kroku pierwsze kliknięcie „Pobierz" w demo kończy się błędem,
a kryterium „ekran działa na seedzie" nie wychodzi. Odtworzenie ze snapshotu nie narusza
kryterium 2: źródłem treści jest zamrożony snapshot, nie bieżący profil. Ta sama ścieżka kodu
ratuje wyczyszczone `storage` po `docker compose down -v`.

*Alternatywa:* dosypać plik w seederze — odrzucone, `DemoSeeder` jest plikiem współdzielonym,
a stan `04-seed-demo.md` jest wiążący dla innych pakietów.

### D8. Snapshot niesie gotowe do wydruku wartości, nie identyfikatory

`data_snapshot` zapisuje sformatowane wartości użyte w treści: imię, nazwisko, e-mail, telefon,
PESEL, adres w trzech polach, nazwa edycji, daty edycji, numer dokumentu, data wydania, a dla
zaświadczenia dodatkowo godziny zaakceptowane i liczbę konsultacji. Szablon Blade dostaje
**wyłącznie snapshot** — nie ma dostępu do modelu `User`.

*Dlaczego:* kryterium 2 („zmiana profilu nie zmienia dokumentu") jest wtedy własnością
konstrukcji, a nie dyscypliny autora szablonu. Gdyby szablon dostał `$user`, każde późniejsze
`{{ $user->address_city }}` po cichu łamałoby wymaganie.

*Uwaga RODO:* snapshot zawiera PESEL w `data_snapshot` (json, nieszyfrowany). To świadome
uproszczenie hackathonowe spójne z tym, że dokument i tak ma PESEL w treści; do przeglądu
po wydarzeniu razem z szyfrowaniem `documents.data_snapshot`. Zapisujemy w `DEMO/H14.md`.

### D9. Godziny stażu wyłącznie z `ProgressAggregator`

Warunek zaświadczenia czyta `ProgressAggregator::for($user)['hours_accepted']` i porównuje
z `Settings::edition('internship_hours_required')`. Pakiet nie liczy sam sumy z
`internship_entries`.

*Dlaczego:* karta osoby, pulpit, raport i warunki certyfikatu czytają ten sam agregator —
gdyby H14 liczyło własną sumę, zaświadczenie mogłoby wydać się osobie, której karta pokazuje
za mało godzin. Porównanie robimy na `float` z jawnym rzutowaniem stringa, bo agregator zwraca
`"41.5"` zgodnie z kontraktem (dziesiętne jako stringi).

## Risks / Trade-offs

- **Brak unikatu bazodanowego na `(user_id, edition_id, type)`** → wyścig zamknięty wyłącznie
  blokadą wiersza edycji w D4/D5. *Mitygacja:* test równoległości dwóch żądań tej samej osoby
  wchodzi do zakresu odbioru; zgłoszenie utwardzenia (indeks unikalny) do strażnika schematu
  jako praca po hackathonie, wpisane w `DEMO/H14.md`.
- **Blokada wiersza edycji serializuje wszystkie wydania w edycji** → przy dużym ruchu byłoby
  wąskim gardłem. *Mitygacja:* akceptowalne — dokumenty wydaje się kilkadziesiąt razy na edycję,
  a transakcja jest krótka (render HTML w pamięci, zapis pliku poza transakcją tylko wtedy,
  gdy da się to zrobić bez rozspójnienia; w przeciwnym razie render zostaje w środku).
- **`PdfService` zwraca HTML, nie PDF** → nagłówki i rozszerzenie pobieranego pliku będą
  mówiły „html". *Mitygacja:* typ treści i nazwę pliku wyprowadzamy z rozszerzenia ścieżki
  zwróconej przez `PdfService`, więc podmiana stubu na dompdf po hackathonie nie wymaga
  zmiany handlera pobrania.
- **Zależność odbiorcza od H01** (komplet pól profilu w `/me` i formularz profilu) → jeśli H01
  nie dowiezie, użytkowniczka nie ma gdzie uzupełnić brakujących pól z poziomu UI.
  *Mitygacja:* H14 nie blokuje się — pola są w seedzie, a komunikat o brakach linkuje do
  `/panel/profil` niezależnie od tego, czy ekran H01 jest już gotowy.
- **Zależność odbiorcza od H11** (72 h) → bez H11 nie da się w demo przejść z 41,5 h na 72 h
  „na żywo". *Mitygacja:* `ola@demo.pl` ma w seedzie 72 h zaakceptowane, więc obie gałęzie
  warunku są demonstrowalne i testowalne bez H11.
- **Slug 409 czeka na strażnika kontraktu** → *Mitygacja:* slug w jednej stałej; reszta
  implementacji i wszystkie testy poza jedną asercją są od tego niezależne.

## Migration Plan

Brak migracji bazy — tabela `documents` jest gotowa. Wdrożenie to zwykły merge za flagą
`config('features.h14')`; wyłączenie flagi zdejmuje trasy i ekran bez odwracania commitów.
Rollback: flaga na `false`, dane w `documents` zostają nietknięte (nic nie kasujemy).
