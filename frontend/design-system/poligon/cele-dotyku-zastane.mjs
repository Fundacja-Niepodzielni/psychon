// Listy ZASTANYCH naruszeń progu — DWIE, nie jedna: ślad okruszków
// (breadcrumb) zostaje w obecnym rozstawie, jest nawigacją ZAPASOWĄ, i dla
// jego elementów obowiązuje próg AA 2.5.8 (24px), nie AAA 2.5.5 (44px) —
// pod warunkiem, że na tym samym ekranie stoi RÓWNOWAŻNY pełnowymiarowy
// (>=44px) przycisk powrotu (wyjątek WCAG 2.5.5 "równoważny element na tej
// samej stronie"). Krok bramki (PROG_PX = 44px w pomiar-celow-dotyku.mjs)
// zostaje BEZ ZMIAN dla wszystkiego POZA okruszkami — to jest wyjątek
// jednego typu elementu, nie zwężenie progu.
//
// Obie listy NIE są zgodą na te wymiary na zawsze — są mechanizmem, który
// odróżnia "znany, już zgłoszony problem" od "nowy regres wprowadzony
// właśnie teraz". Dopasowanie w pomiar-celow-dotyku.mjs jest PO WSZYSTKICH
// polach (element + motyw + viewport + oba wymiary) — samo dopasowanie
// nazwy przepuściłoby pogorszenie po cichu. Obie listy mogą się WYŁĄCZNIE
// SKRACAĆ i NIGDY rosnąć nad odpowiadający im sufit —
// pomiar-celow-dotyku.mjs pilnuje TEGO sam, niezależnie od gita, dla
// KAŻDEJ z dwóch list osobno.

// Elementy traktowane jako "ślad okruszków" — WYŁĄCZNIE po dokładnej nazwie
// z rejestru (cele-oczekiwane.mjs), żeby dopasowanie było mechaniczne, nie
// domysłem. Dziś jeden: "Breadcrumbs (pozycja z odnośnikiem)" (selektor w
// pomiar-celow-dotyku.mjs celuje w pierwszą pozycję z odnośnikiem wariantu
// "pełne" — [data-style-id="molekula-breadcrumbs-pelne"]). Wariant
// "skrócone" (m7-breadcrumbs-skrocone) NIE ma własnej pozycji w CELE/
// OCZEKIWANE_CELE (nie jest osobno mierzony), więc nie może dziś dostarczyć
// ani zastałego, ani nowego naruszenia — to jest luka pokrycia, nazwana
// tutaj żeby nie zniknęła po cichu.
export const OKRUSZKI_ELEMENTY = new Set(["Breadcrumbs (pozycja z odnośnikiem)"]);

// AA 2.5.8 — próg WYŁĄCZNIE dla elementów z OKRUSZKI_ELEMENTY, pod
// warunkiem wyjątku (równoważny przycisk powrotu >=44px na tym samym
// ekranie). Ten skrypt NIE potrafi zweryfikować obecności tego przycisku
// (poligon nie jest ekranem produktu — patrz komentarz w main.tsx), więc
// warunek jest przyjęty z decyzji właściciela, nie zmierzony tutaj.
export const PROG_OKRUSZKA_PX = 24;

// Zmierzone 2026-09-28 (bieg na nietkniętym drzewie): jedyna zmierzona
// pozycja okruszka to "Breadcrumbs (pozycja z odnośnikiem)", 43.23×45px,
// we WSZYSTKICH 4 kombinacjach motyw×viewport. Oba wymiary >= 24px — pod
// progiem AA/wyjątku to NIE jest naruszenie w ogóle (byłoby naruszeniem
// tylko pod progiem AAA 44px, który dla okruszków już nie obowiązuje).
// Lista zastałych okruszków jest więc PUSTA, nie ma czego allowlistować —
// a sufit 0 oznacza, że KAŻDA przyszła pozycja tutaj (nawet jedna) jest
// sama w sobie rozjazdem, dopóki architektura nie podniesie tego sufitu
// jawną decyzją.
export const ZASTALE_OKRUSZKI = [];
export const MAKSYMALNA_LICZBA_ZASTALYCH_OKRUSZKOW = 0;

// "Pozostałe" — WSZYSTKO poza OKRUSZKI_ELEMENTY, próg AAA 44px bez zmian.
// Zmierzone: jedyna pozostała pozycja poniżej progu to "Toast (zamknij)",
// 42.77×44px, we wszystkich 4 kombinacjach motyw×viewport — 4 pozycje.
export const ZASTALE_POZOSTALE = [
  { element: "Toast (zamknij)", motyw: "light", viewport: "412", szerokosc: 42.77, wysokosc: 44 },
  { element: "Toast (zamknij)", motyw: "light", viewport: "1440", szerokosc: 42.77, wysokosc: 44 },
  { element: "Toast (zamknij)", motyw: "dark", viewport: "412", szerokosc: 42.77, wysokosc: 44 },
  { element: "Toast (zamknij)", motyw: "dark", viewport: "1440", szerokosc: 42.77, wysokosc: 44 },
];
export const MAKSYMALNA_LICZBA_ZASTALYCH_POZOSTALE = 4;

// UWAGA — wcześniejsza notatka wspominała o elemencie śladu z wymiarem
// 19px, opisanym jako wada do naprawienia albo do jawnego zgłoszenia, że
// się nie da: w obecnym rejestrze (27 celów z cele-oczekiwane.mjs, patrz
// CELE w pomiar-celow-dotyku.mjs) jest DOKŁADNIE JEDNA zmierzona pozycja
// okruszka ("Breadcrumbs (pozycja z odnośnikiem)", pierwsza pozycja z
// odnośnikiem wariantu "pełne") i mierzy ona 43.23×45px w KAŻDYM z 4
// biegów — nie ma zmierzonego elementu o wymiarze 19px. Ten skrypt NIE
// zgaduje istnienia takiego elementu: jeśli istnieje gdzie indziej w
// drzewie (np. w wariancie "skrócone", nie mierzonym dziś — patrz
// komentarz przy OKRUSZKI_ELEMENTY wyżej), to jest luka pokrycia rejestru,
// zgłoszona tutaj, żeby nie zniknęła po cichu.
