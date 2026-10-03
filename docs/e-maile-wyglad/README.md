# Wzór wyglądu e-maili PsychON

Zaakceptowany wzór wyglądu wszystkich e-maili platformy. To materiał wejściowy do wdrożenia szablonów e-maili, a nie kod aplikacji.

## Zasada

Każdy e-mail składa się z jednego zestawu klocków:
- atomy: barwy, krój pisma, odstępy, przycisk główny, odnośnik tekstowy, linia podziału, wartość do uzupełnienia;
- molekuły: nagłówek, powitanie, akapit, lista szczegółów, ramka „Co dalej”, wiersz przycisku, stopka;
- jeden szablon, czyli jeden układ e-maila.

E-mail to szablon plus treść. Nie ma wyglądu robionego dla jednego e-maila. Nowy klocek dodaje się tylko wtedy, gdy żaden istniejący nie pasuje, i od razu trafia do zestawu.

## Zawartość

- `buduj.py`: generator wzoru. Barwy, odstępy i promienie zaokrągleń są wzięte z tokenów frontu. Uruchomienie: `python -B buduj.py`. Oprócz plików wzoru tworzy stronę przeglądu, której nie ma w tym katalogu.
- `e-maile-tresci-95bdf9b2.md`: zaakceptowana treść e-maili, czyli wejście generatora.
- `emaile/E-NN.html`: każdy e-mail jako gotowy dokument HTML, ze stylami w atrybutach (tak, jak wymagają programy pocztowe).
- `emaile/E-NN.txt`: wersja tekstowa każdego e-maila.

## Ustalenia

- Wysyłane są 38 e-maile. E-06, E-07 i E-28 nie są wysyłane, więc nie mają plików.
- Stopka e-maili do osób spoza zespołu ma linię „Kontakt z Fundacją” z wartością z ustawień administracji. E-maile do zespołu Fundacji (E-05, E-17, E-22, E-39, E-41) tej linii nie mają.
- Adres platformy `https://psychon.example.org` i wszystkie dane osób są przykładowe. W szablonach adres pochodzi z konfiguracji aplikacji.
- Wartości w nawiasach kwadratowych, np. „[kontakt Fundacji z panelu administracji]”, to miejsca na dane z ustawień.
- Kontrast tekstu do tła spełnia WCAG AA: tekst główny 12,82:1, biały napis na przycisku 5,06:1.
