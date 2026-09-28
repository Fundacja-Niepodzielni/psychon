// Rejestr NIEZALEŻNY od tablicy `CELE` w pomiar-celow-dotyku.mjs — tylko nazwy celów
// dotyku, bez selektorów, w OSOBNYM pliku. Cel: gdy ktoś skróci `CELE`
// (pomyłką, refaktorem, pośpiechem), ten plik NIE rusza się razem z nią, więc
// rozjazd jest widoczny i nazwany, zamiast po cichu obniżyć próg pokrycia.
//
// Zmierzone przed tą zmianą: „OCZEKIWANE POMIAROW” liczyło się jako
// `CELE.length * ...` — usunięcie jednego wpisu z `CELE` obniżało też
// oczekiwaną liczbę, więc próba wracała zielona (36/36) przy realnym
// pokryciu 9 elementów zamiast 10. Ten rejestr nie mierzy niczego sam —
// mówi tylko, ile celów i o jakich nazwach POWINNO istnieć w `CELE`.
//
// Utrzymanie: gdy w design-system/poligon/main.tsx przybywa albo ubywa
// zmierzalny element, ZAKTUALIZUJ TEN PLIK ręcznie i osobno od `CELE` w
// pomiar-celow-dotyku.mjs — to jest jego jedyny sens istnienia w osobnym pliku.
//
// Zmierzone przy TEJ zmianie (czytaniem 40 źródeł `*.tsx` w
// design-system/{atomy,molekuly,organizmy} poza `__tests__`, nie wzorcem):
// 23 z 40 PLIKÓW niosą WŁASNY element interaktywny (własny cel dotyku, nie
// tylko przekazany potomek). `design-system/molekuly/MenuItem/` to DWA pliki
// (`MenuGroup.tsx` + `MenuItem.tsx`) pod JEDNĄ pozycją specyfikacji (M9,
// 06-ATOMY-MOLEKULY-ORGANIZMY.md) — main.tsx montuje tylko `MenuGroup`,
// który renderuje własny `MenuItem`, więc oba pliki dzielą JEDEN mierzalny
// węzeł DOM i JEDEN wpis niżej. Licząc pozycjami specyfikacji (jak main.tsx
// numeruje: A1-A20 minus A7 „Radio nie istnieje" = 19, M1-M19 = 19, O7 = 1,
// razem 39) zamiast plikami (40), własny cel ma 22 z 39 pozycji — to
// najpewniej źródło liczby „39" w poprzednim pomiarze przybliżonym wzorcem
// tekstowym, który sam liczył PLIKI (40), nie pozycje, i trafił 21 z nich:
// dwa fałszywe trafienia (`Heading`, `Notice` — złapane przez `tabIndex={-1}`,
// który w obu jest METKĄ FOKUSU PROGRAMOWEGO, nie celem dotyku: element nigdy
// nie wchodzi do kolejności Tab i nie ma uchwytu aktywacji) i cztery
// przeoczenia (`Breadcrumbs`, `Field`, `MenuGroup`, `MenuItem` — każdy składa
// WŁASNY interaktywny atom przez JSX komponentu (`<Link>`, `<Input>`/
// `<Textarea>`/`<Select>`, `<MenuItem>`), nie przez surowy znacznik ani
// `onClick` literalnie w tekście źródła, więc wzorzec `<button|<a |<input|
// <select|<textarea|onClick|role="button"|tabIndex` nie miał czego złapać —
// `MenuItem.tsx` dodatkowo łamie wzorzec `<a ` samym formatowaniem: `<a`
// i `href=` stoją w źródle na osobnych liniach, nie `<a ` ze spacją).
//
// 17 plików BEZ własnego celu (własny osąd, nie wzorzec) — z powodem przy
// każdym w `WYKLUCZENIA` niżej: Avatar, Badge, Divider, ErrorText, Heading,
// Hint, Icon, Num, ProgressBar, Skeleton, StepBar, Text, Label (atomy) oraz
// FileRow, Notice, QaBlock, StatTile (molekuły).
export const OCZEKIWANE_CELE = [
  "Button primary",
  "Button outline",
  "Button quiet",
  "Button sm",
  "Icon jako przycisk",
  "Link (pole klikalne)",
  "Link wariant okruszek",
  "Checkbox (etykieta = pole dotyku)",
  "Input",
  "Textarea",
  "Select (przycisk combobox)",
  "Breadcrumbs (pozycja z odnośnikiem)",
  "CollapsibleSection (nagłówek rozwijający)",
  "DialogActions (wycofanie)",
  "EmptyState (przycisk)",
  "Field (kontrolka tekstowa)",
  "FileDropZone (obszar upuszczania)",
  "KeyValueRow (pokaż/ukryj)",
  "ListRow (akcja wiersza)",
  "MenuItem/MenuGroup (pozycja menu)",
  "Pagination (poprzednia)",
  "RichTextEditor (przycisk paska)",
  "SaveBar (cofnij)",
  "SearchBox (pole wyszukiwania)",
  "Tabs (zakładka)",
  "Toast (zamknij)",
  "PublishChecklist (odnośnik braku)",
  // Organizmy z `lekcja.html` (osobna strona wejścia poligonu, pole `strona`
  // w `CELE`): każdy z trzech plików ma co najmniej jeden własny cel.
  "TimeChart (rozwinięcie tabeli)",
  "CourseTree (strzałka przeniesienia)",
  "CourseTree (zmiana nazwy)",
  "CourseTree (dodanie lekcji)",
  "LessonPlayer (odtwarzanie)",
  "LessonPlayer (powiększenie)",
  "LessonPlayer (odnośnik braku)",
  // Organizmy z `formularze.html` (trzecia strona wejścia poligonu, pole
  // `strona` w `CELE`): `Dialog` sam nie ma własnego celu (patrz WYKLUCZENIA
  // niżej — opakowuje wyłącznie `DialogActions`, już rozliczony), `FormSection`
  // i `JournalTable` mają po jednym.
  "FormSection (zapisz)",
  "JournalTable (odnośnik pobrania)",
];

// Mapa cel -> komponent źródłowy. Osobna od nazw celów, bo jeden komponent
// (np. `Button`) niesie kilka nazwanych celów (warianty stylu), a K1 wymaga
// DWÓCH różnych mianowników w wyjściu pomiaru: ile celów i z ilu KOMPONENTÓW
// (patrz `KOMPONENTOW_OCZEKIWANE` liczone z tej mapy w pomiar-celow-dotyku.mjs).
export const KOMPONENT_CELU = {
  "Button primary": "Button",
  "Button outline": "Button",
  "Button quiet": "Button",
  "Button sm": "Button",
  "Icon jako przycisk": "Button", // sam Icon.tsx nie ma celu — mierzony jest Button opakowujący
  "Link (pole klikalne)": "Link",
  "Link wariant okruszek": "Link",
  "Checkbox (etykieta = pole dotyku)": "Checkbox",
  Input: "Input",
  Textarea: "Textarea",
  "Select (przycisk combobox)": "Select",
  "Breadcrumbs (pozycja z odnośnikiem)": "Breadcrumbs",
  "CollapsibleSection (nagłówek rozwijający)": "CollapsibleSection",
  "DialogActions (wycofanie)": "DialogActions",
  "EmptyState (przycisk)": "EmptyState",
  "Field (kontrolka tekstowa)": "Field",
  "FileDropZone (obszar upuszczania)": "FileDropZone",
  "KeyValueRow (pokaż/ukryj)": "KeyValueRow",
  "ListRow (akcja wiersza)": "ListRow",
  "MenuItem/MenuGroup (pozycja menu)": "MenuItem/MenuGroup",
  "Pagination (poprzednia)": "Pagination",
  "RichTextEditor (przycisk paska)": "RichTextEditor",
  "SaveBar (cofnij)": "SaveBar",
  "SearchBox (pole wyszukiwania)": "SearchBox",
  "Tabs (zakładka)": "Tabs",
  "Toast (zamknij)": "Toast",
  "PublishChecklist (odnośnik braku)": "PublishChecklist",
  "TimeChart (rozwinięcie tabeli)": "TimeChart", // nagłówek CollapsibleSection osadzonej w organizmie
  "CourseTree (strzałka przeniesienia)": "CourseTree",
  "CourseTree (zmiana nazwy)": "CourseTree",
  "CourseTree (dodanie lekcji)": "CourseTree",
  "LessonPlayer (odtwarzanie)": "LessonPlayer",
  "LessonPlayer (powiększenie)": "LessonPlayer",
  "LessonPlayer (odnośnik braku)": "LessonPlayer",
  "FormSection (zapisz)": "FormSection",
  "JournalTable (odnośnik pobrania)": "JournalTable",
};

// Lista jawnych wykluczeń: komponent BEZ własnego celu dotyku, z powodem
// przy pozycji — "nie znika po cichu". `plik` wskazuje źródło, które
// przejrzałem, żeby dało się sprawdzić powód bez ufania samemu zdaniu.
export const WYKLUCZENIA = [
  { komponent: "Avatar", plik: "atomy/Avatar/Avatar.tsx", powod: "sam <span> z inicjałami, bez handlera ani roli aktywacji." },
  { komponent: "Badge", plik: "atomy/Badge/Badge.tsx", powod: "sam <span> statusu; konsumenci wsadzają go W przyciski (np. SaveBar), Badge sam nie ma uchwytu." },
  { komponent: "Divider", plik: "atomy/Divider/Divider.tsx", powod: '<hr role="separator"> — separator strukturalny, nie odbiera aktywacji.' },
  { komponent: "ErrorText", plik: "atomy/ErrorText/ErrorText.tsx", powod: '<p role="alert"> — ogłoszenie dla czytnika, nie kontrolka.' },
  { komponent: "Heading", plik: "atomy/Heading/Heading.tsx", powod: "tabIndex={-1} tylko dla stopnia 2 to metka fokusu PROGRAMOWEGO (nigdy w kolejności Tab, bez uchwytu aktywacji) — nie cel dotyku." },
  { komponent: "Hint", plik: "atomy/Hint/Hint.tsx", powod: "sam <p>, bez interakcji." },
  { komponent: "Icon", plik: "atomy/Icon/Icon.tsx", powod: 'aria-hidden SVG; wariant „jako przycisk" to Button OPAKOWUJĄCY Icon (patrz „Icon jako przycisk" wyżej), nie sam ten plik.' },
  { komponent: "Num", plik: "atomy/Num/Num.tsx", powod: "sformatowana liczba w <span>, bez handlera." },
  { komponent: "ProgressBar", plik: "atomy/ProgressBar/ProgressBar.tsx", powod: 'role="progressbar" — wskaźnik stanu, nie widżet czynny.' },
  { komponent: "Skeleton", plik: "atomy/Skeleton/Skeleton.tsx", powod: "placeholder aria-busy, nic do kliknięcia w trakcie ładowania." },
  { komponent: "StepBar", plik: "atomy/StepBar/StepBar.tsx", powod: 'role="img" z aria-label — jawnie niekliknięty przez własną rolę ARIA.' },
  { komponent: "Text", plik: "atomy/Text/Text.tsx", powod: "sam <p>, bez interakcji." },
  { komponent: "Label", plik: "atomy/Label/Label.tsx", powod: "<label htmlFor> wskazuje kontrolkę ZEWNĘTRZNĄ; system nadaje klasę dotyku (.dotyk) jawnie Checkbox, nie samemu Label — sporne (natywny klik na label-for przenosi aktywację), wykluczone za konwencją tego systemu." },
  { komponent: "FileRow", plik: "molekuly/FileRow/FileRow.tsx", powod: "Text + Hint w <li>, używany wyłącznie zagnieżdżony w FileDropZone, bez własnego handlera." },
  { komponent: "Notice", plik: "molekuly/Notice/Notice.tsx", powod: "div tabIndex={-1} to metka fokusu programowego (ogłoszenie błędu), nie cel dotyku; ewentualna akcja pochodzi z przekazanego z zewnątrz `akcja`, którego żaden z czterech montów w poligonie nie podaje." },
  { komponent: "QaBlock", plik: "molekuly/QaBlock/QaBlock.tsx", powod: "Text + Hint + <p>, bez handlera." },
  { komponent: "StatTile", plik: "molekuly/StatTile/StatTile.tsx", powod: "Label + Num + ProgressBar + Hint — żaden z tych czterech nie niesie własnego celu (patrz ich własne wykluczenia wyżej)." },
  { komponent: "Dialog", plik: "organizmy/Dialog/Dialog.tsx", powod: "div przesłony + div okna + Heading (nieinteraktywny) + treść przekazana przez wywołującego + DialogActions OPAKOWYWANY (już rozliczony jako „DialogActions (wycofanie)”) — sam ten plik nie renderuje własnego uchwytu aktywacji poza dzieckiem już rozliczonym gdzie indziej." },
];

// K3, noga trzecia: lista WSZYSTKICH plików `*.tsx`, które ten odbiór
// PRZEJRZAŁ i rozliczył — czy to nazwanym celem (22 pozycje wyżej, `Button`
// niesie ich kilka, ale plik jest jeden — stąd `MenuGroup.tsx` I
// `MenuItem.tsx` są DWOMA wpisami tu, mimo że dzielą JEDNĄ pozycję
// `KOMPONENT_CELU`), czy jawnym wykluczeniem (17 pozycji w `WYKLUCZENIA`
// wyżej). To jest mechanizm, który ma ZAUWAŻYĆ nowy plik komponentu dopisany
// do drzewa i NIE dopisany ani tu, ani do `WYKLUCZENIA` — pomiar-celow-dotyku.mjs
// skanuje realny katalog `design-system/{atomy,molekuly,organizmy}` (poza
// `__tests__`) i porównuje z tą listą; plik spoza niej jest ROZJAZDEM (kod
// 3), nazwanym z pełnej ścieżki, nie cichym pominięciem. 23 pliki mają
// własny cel (patrz komentarz przy OCZEKIWANE_CELE — MenuGroup+MenuItem to
// DWA pliki pod jedną pozycją), 17 ma wykluczenie — razem 40, cały dzisiejszy
// stan `design-system/{atomy,molekuly,organizmy}` poza `__tests__`.
export const PLIKI_ROZLICZONE = [
  // 23 pliki z własnym celem (patrz OCZEKIWANE_CELE/KOMPONENT_CELU wyżej):
  "atomy/Button/Button.tsx",
  "atomy/Checkbox/Checkbox.tsx",
  "atomy/Input/Input.tsx",
  "atomy/Link/Link.tsx",
  "atomy/Select/Select.tsx",
  "atomy/Textarea/Textarea.tsx",
  "molekuly/Breadcrumbs/Breadcrumbs.tsx",
  "molekuly/CollapsibleSection/CollapsibleSection.tsx",
  "molekuly/DialogActions/DialogActions.tsx",
  "molekuly/EmptyState/EmptyState.tsx",
  "molekuly/Field/Field.tsx",
  "molekuly/FileDropZone/FileDropZone.tsx",
  "molekuly/KeyValueRow/KeyValueRow.tsx",
  "molekuly/ListRow/ListRow.tsx",
  "molekuly/MenuItem/MenuGroup.tsx",
  "molekuly/MenuItem/MenuItem.tsx",
  "molekuly/Pagination/Pagination.tsx",
  "molekuly/RichTextEditor/RichTextEditor.tsx",
  "molekuly/SaveBar/SaveBar.tsx",
  "molekuly/SearchBox/SearchBox.tsx",
  "molekuly/Tabs/Tabs.tsx",
  "molekuly/Toast/Toast.tsx",
  "organizmy/PublishChecklist/PublishChecklist.tsx",
  // 3 organizmy z `lekcja.html`, rozliczone celami wyżej:
  "organizmy/CourseTree/CourseTree.tsx",
  "organizmy/LessonPlayer/LessonPlayer.tsx",
  "organizmy/TimeChart/TimeChart.tsx",
  // 2 organizmy z `formularze.html`, rozliczone celami wyżej (`Dialog` jest
  // wykluczeniem, patrz niżej — dwa opisane cele + jedno wykluczenie = trzy
  // nowe pliki formularzy i dziennika):
  "organizmy/FormSection/FormSection.tsx",
  "organizmy/JournalTable/JournalTable.tsx",
  // 18 plików wykluczonych (patrz WYKLUCZENIA wyżej — te same `plik`; `Dialog`
  // dopisany do WYKLUCZENIA podnosi tę listę z 17 do 18):
  ...WYKLUCZENIA.map((w) => w.plik),
];
