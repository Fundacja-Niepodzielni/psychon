# Licznik testów ścieżki (`path_tests_passed` / `path_tests_total`) — notatki

## Noga zerowa — próby dokładnego kształtu odpowiedzi karty (H18)

Plik przeszukany: `backend/tests/Feature/H18/AdminUserCardTest.php`. Szukane wzorce:
`assertSame` na tablicy porównywanej wobec całego fragmentu odpowiedzi, `assertExactJson`.
`assertExactJson` — brak w pliku. Jedno trafienie `assertSame` na tablicy:

| Próba | Trzyma wartość czy kształt |
| --- | --- |
| `test_card_progress_is_the_same_source_as_the_aggregator` (linia ~45, przed poprawką) | **Oba**: `assertSame` na zamkniętej tablicy porównuje jednocześnie zestaw kluczy (kształt — dodanie/ubytek klucza zmienia długość tablicy i psuje porównanie) i wartości pod nimi (wartość — liczby muszą się zgadzać co do bitu z agregatorem). Zamknięta tablica czyni to świadomym wyborem: rozszerzenie zasobu bez dopisania klucza tutaj kończy się czerwienią, nie cichą akceptacją. |

Reszta prób w pliku bada **kształt** wąsko (`assertJsonStructure` na `test_card_has_all_five_blocks_and_full_pesel_for_administration`, mimo nazwy niezmienionej — patrzy tylko czy klucz istnieje, nie ile ich jest ani jakie mają wartości) albo pojedyncze **wartości** (`assertJsonPath`, `assertSame($marta->pesel, ...)`), nie kształt całości.

## Rozjazd zastany (zmierzony, nie naprawiony w kodzie)

`test_card_has_all_five_blocks_and_full_pesel_for_administration` nadal nazywa blok
„all five blocks" i asertuje `assertJsonStructure` z pięcioma kluczami `progress`
(`courses_done`, `courses_total`, `hours_accepted`, `supervision_present`,
`workshop_done`) — bez `path_tests_passed`/`path_tests_total`. `assertJsonStructure`
NIE jest zamknięta (nie odrzuca nadmiarowych kluczy), więc ta próba w dalszym ciągu
**przechodzi** mimo że karta zwraca siedem kluczy, nie pięć. Nazwa i komentarz w
kodzie („all five blocks") są nieaktualne wobec siedmiu kluczy `progress` — poza
zakresem tej poprawki (naprawiono TYLKO `test_card_progress_is_the_same_source_as_the_aggregator`
i dopisano nową próbę kontraktu), więc melduje rozjazd zamiast go cicho zamykać przy okazji.

## Umowa `path_tests_total` / `path_tests_passed`

Patrz `backend/app/Support/ProgressAggregator.php:41-81` — komentarz nad `for()`
opisuje regułę wprost. Próby ścieżki (3 nogi) w
`backend/tests/Feature/H18/PathTestsCounterTest.php` budują własne, izolowane dane
(edycja + kursy z `sequence_order`, testy, `TestAttempt`), nie korzystają z `$this->seed()`,
żeby żadna z trzech nóg nie zależała od zawartości seeda demo.
