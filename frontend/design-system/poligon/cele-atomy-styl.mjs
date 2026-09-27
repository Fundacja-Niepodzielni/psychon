// Rejestr NIEZALEŻNY od pomiar-styl-atomow.mjs — z tego samego powodu, dla
// którego cele-oczekiwane.mjs stoi osobno od CELE w pomiar-celow-dotyku.mjs:
// gdyby oczekiwane wartości i pętla pomiaru żyły w jednym pliku, skrócenie
// listy obniżałoby też liczbę oczekiwanych pomiarów i próba wracałaby
// zielona przy realnie mniejszym pokryciu.
//
// Par. 8.2 liczy WARIANTY I STANY z
// kolumny par. 2, nie jeden odczyt na atom. Każdy wpis niżej niesie
// `grupa`/`pozycja` odpowiadające DOKŁADNIE jednej pozycji z
// design-system/poligon/pozycje-warianty-stany-par2.mjs (mianownik 69/15
// liczony TAM, nie tu — ten plik jest licznikiem pokrycia, nie mianownikiem).
// Jedna pozycja z tamtego pliku (GAPY_JAWNE — A14 „przerywana”, luka
// specyfikacji) nie ma tu odpowiednika — świadomie, z podanym powodem w
// tamtym pliku, nie przez przeoczenie. A2 „tło odwrócone” i A13 „wys.
// przycisku 34px” miały tu wcześniej luki — usunięte razem z domknięciem
// wad wykonania w Link.tsx i Skeleton.tsx.
//
// `akcje`: tablica kroków wykonywanych PRZED odczytem (pomiar-styl-atomow.mjs
// je interpretuje). Każdy krok: `{ typ: "hover" | "otworz-jesli-zamknieta" |
// "zamknij-jesli-otwarta", cel?: selektor }` — `cel` domyślnie = `selektor`
// wpisu. Bez `akcje` — odczyt statyczny (stan wynika z propsów mountu w
// main.tsx, nie z interakcji).
//
// `atrybut`: `{ nazwa, oczekiwana }` — porównanie `getAttribute(nazwa)` z
// `oczekiwana` (string). Używane tam, gdzie stan objawia się atrybutem
// ARIA/HTML, a nie (albo nie tylko) właściwością CSS.
//
// Reszta pól (`wlasciwosci`, `minWysokosc`, `wysokoscDokladna`, ...) — jak w
// poprzedniej wersji, bez zmian znaczenia.
export const OCZEKIWANE_ATOMY_STYL = [
  // --- A1 Button: 6 wariantów + kursor (stan statyczny) + nieaktywny (stan mountu) ---
  {
    nazwa: "A1 Button — primary", grupa: "A1", pozycja: "primary",
    selektor: '[data-testid="button-primary"]',
    minWysokosc: 44,
    wlasciwosci: {
      "border-radius": "var(--r-xs)", "font-size": "var(--fs-9)",
      "font-weight": "var(--fw-medium)", "background-color": "var(--primary)",
    },
  },
  {
    nazwa: "A1 Button — outline", grupa: "A1", pozycja: "outline",
    selektor: '[data-testid="button-outline"]',
    minWysokosc: 44,
    wlasciwosci: { "background-color": "rgba(0, 0, 0, 0)", color: "var(--ink)" },
  },
  {
    nazwa: "A1 Button — quiet", grupa: "A1", pozycja: "quiet",
    selektor: '[data-testid="button-quiet"]',
    minWysokosc: 44,
    wlasciwosci: { "background-color": "rgba(0, 0, 0, 0)", color: "var(--link)" },
  },
  {
    nazwa: "A1 Button — sm", grupa: "A1", pozycja: "sm",
    selektor: '[data-testid="button-sm"]',
    wlasciwosci: { "font-size": "var(--fs-10)" },
  },
  {
    nazwa: "A1 Button — danger", grupa: "A1", pozycja: "danger",
    selektor: '[data-testid="a1-danger"]',
    wlasciwosci: { color: "var(--error)" },
  },
  {
    nazwa: "A1 Button — lock", grupa: "A1", pozycja: "lock",
    selektor: '[data-testid="a1-lock"]',
    wlasciwosci: { opacity: "0.5" },
  },
  {
    nazwa: "A1 Button — kursor", grupa: "A1", pozycja: "kursor",
    selektor: '[data-testid="button-primary"]',
    wlasciwosci: { cursor: "pointer" },
  },
  {
    nazwa: "A1 Button — nieaktywny", grupa: "A1", pozycja: "nieaktywny",
    selektor: '[data-testid="a1-nieaktywny"]',
    wlasciwosci: { opacity: "0.5" },
    atrybut: { nazwa: "disabled", oczekiwana: "" },
  },

  // --- A2 Link: 3 warianty + kursor ---
  {
    nazwa: "A2 Link — w treści", grupa: "A2", pozycja: "w tresci",
    selektor: '[data-testid="link"]',
    minWysokosc: 44,
    wlasciwosci: { color: "var(--link)" },
  },
  {
    nazwa: "A2 Link — okruszki", grupa: "A2", pozycja: "okruszki",
    selektor: '[data-testid="link-okruszek"]',
    minWysokosc: 44,
    wlasciwosci: { color: "var(--link)" },
  },
  {
    nazwa: "A2 Link — tło odwrócone", grupa: "A2", pozycja: "tlo odwrocone",
    selektor: '[data-testid="link-tlo-odwrocone"]',
    minWysokosc: 44,
    wlasciwosci: { color: "var(--invert-link)" },
  },
  {
    nazwa: "A2 Link — kursor", grupa: "A2", pozycja: "kursor",
    selektor: '[data-testid="link"]',
    wlasciwosci: { cursor: "pointer" },
  },

  // --- A3 Input: 3 warianty + niepoprawny + tylko do odczytu (fokus osobno w REGULY_FOKUSU) ---
  {
    nazwa: "A3 Input — tekst", grupa: "A3", pozycja: "tekst",
    selektor: '[data-testid="input"]',
    wysokoscDokladna: 45, tolerancjaPx: 2, szerokoscMax: 480,
    wlasciwosci: { "border-radius": "var(--r-xs)", "font-size": "var(--fs-8)", "border-top-color": "var(--control)" },
  },
  {
    nazwa: "A3 Input — liczba", grupa: "A3", pozycja: "liczba",
    selektor: '[data-testid="a3-liczba"]',
    szerokoscMax: 160,
    wlasciwosci: { "font-size": "var(--fs-8)" },
  },
  {
    nazwa: "A3 Input — data", grupa: "A3", pozycja: "data",
    selektor: '[data-testid="a3-data"]',
    szerokoscMax: 180,
    wlasciwosci: { "font-size": "var(--fs-8)" },
  },
  {
    nazwa: "A3 Input — niepoprawny", grupa: "A3", pozycja: "niepoprawny",
    selektor: '[data-testid="a3-niepoprawny"]',
    wlasciwosci: { "border-top-color": "var(--error)" },
    atrybut: { nazwa: "aria-invalid", oczekiwana: "true" },
  },
  {
    nazwa: "A3 Input — tylko do odczytu", grupa: "A3", pozycja: "tylko do odczytu",
    selektor: '[data-testid="a3-readonly"]',
    atrybut: { nazwa: "readonly", oczekiwana: "" },
  },

  // --- A4 Textarea: 1 wariant + niepoprawny + tylko do odczytu ---
  {
    nazwa: "A4 Textarea — jeden wariant", grupa: "A4", pozycja: "jeden wariant",
    selektor: '[data-testid="textarea"]',
    minWysokosc: 96, szerokoscMax: 720,
    wlasciwosci: { "border-radius": "var(--r-xs)", "font-size": "var(--fs-8)", "border-top-color": "var(--control)" },
  },
  {
    nazwa: "A4 Textarea — niepoprawny", grupa: "A4", pozycja: "niepoprawny",
    selektor: '[data-testid="a4-niepoprawny"]',
    wlasciwosci: { "border-top-color": "var(--error)" },
    atrybut: { nazwa: "aria-invalid", oczekiwana: "true" },
  },
  {
    nazwa: "A4 Textarea — tylko do odczytu", grupa: "A4", pozycja: "tylko do odczytu",
    selektor: '[data-testid="a4-readonly"]',
    atrybut: { nazwa: "readonly", oczekiwana: "" },
  },

  // --- A5 Select: zamknięta/otwarta/pod kursorem/wybrana (akcje na TEJ SAMEJ kontrolce, fokus w REGULY_FOKUSU) ---
  {
    nazwa: "A5 Select — zamknięta", grupa: "A5", pozycja: "zamknieta",
    selektor: '[role="combobox"]',
    akcje: [{ typ: "zamknij-jesli-otwarta", cel: '[role="combobox"]' }],
    atrybut: { nazwa: "aria-expanded", oczekiwana: "false" },
  },
  {
    nazwa: "A5 Select — otwarta", grupa: "A5", pozycja: "otwarta",
    selektor: '[role="combobox"]',
    akcje: [{ typ: "otworz-jesli-zamknieta", cel: '[role="combobox"]' }],
    atrybut: { nazwa: "aria-expanded", oczekiwana: "true" },
  },
  {
    nazwa: "A5 Select — pod kursorem", grupa: "A5", pozycja: "pod kursorem",
    selektor: '[role="option"]:nth-child(2)',
    akcje: [{ typ: "otworz-jesli-zamknieta", cel: '[role="combobox"]' }, { typ: "hover" }],
    wlasciwosci: { "background-color": "var(--brand)" },
  },
  {
    nazwa: "A5 Select — wybrana", grupa: "A5", pozycja: "wybrana",
    selektor: '[role="option"][aria-selected="true"]',
    akcje: [{ typ: "otworz-jesli-zamknieta", cel: '[role="combobox"]' }],
    atrybut: { nazwa: "aria-selected", oczekiwana: "true" },
  },

  // --- A6 Checkbox: zaznaczony + kursor (fokus w REGULY_FOKUSU) ---
  {
    nazwa: "A6 Checkbox — pole dotyku", grupa: "A6", pozycja: "__pomocniczy_wymiar",
    selektor: 'label[for="pol-zgoda"]',
    minWysokosc: 44, minSzerokosc: 44,
  },
  {
    nazwa: "A6 Checkbox — zaznaczony", grupa: "A6", pozycja: "zaznaczony",
    selektor: 'label[for="pol-zgoda"] > span',
    wlasciwosci: { "background-color": "var(--brand)" },
  },
  {
    nazwa: "A6 Checkbox — kursor", grupa: "A6", pozycja: "kursor",
    selektor: 'label[for="pol-zgoda"]',
    wlasciwosci: { cursor: "pointer" },
  },

  // --- A8 Badge: 6 wariantów ---
  {
    nazwa: "A8 Badge — neutral", grupa: "A8", pozycja: "neutral",
    selektor: '[data-style-id="atom-badge"] > span',
    wlasciwosci: {
      "border-radius": "var(--r-pill)", "font-size": "var(--fs-11)", "font-weight": "var(--fw-medium)",
      "background-color": "var(--grey)", color: "var(--muted)",
    },
  },
  {
    nazwa: "A8 Badge — ok", grupa: "A8", pozycja: "ok",
    selektor: '[data-style-id="atom-badge-ok"] > span',
    wlasciwosci: { "border-radius": "var(--r-pill)", "background-color": "var(--grey)", color: "var(--muted)" },
  },
  {
    nazwa: "A8 Badge — warn", grupa: "A8", pozycja: "warn",
    selektor: '[data-style-id="atom-badge-warn"] > span',
    wlasciwosci: { "border-radius": "var(--r-pill)", "background-color": "var(--warn-bg)", color: "var(--warn)" },
  },
  {
    nazwa: "A8 Badge — error", grupa: "A8", pozycja: "error",
    selektor: '[data-style-id="atom-badge-error"] > span',
    wlasciwosci: { "border-radius": "var(--r-pill)", "background-color": "var(--error-bg)", color: "var(--error)" },
  },
  {
    // Poprzednia wersja twierdziła tu, że
    // `.pending` nie istnieje w Badge.module.css — NIEPRAWDA, zmierzone
    // sondą w odrębnym pomiarze i powtórzone tu: klasa `.pending` JEST (Badge.module.css:25-28,
    // `background: var(--grey); color: var(--muted)`, ta sama para co
    // `.neutral`). Zdjęcie tych dwóch asercji na podstawie nieprawdziwego
    // zdania obniżało pokrycie bez powodu — przywrócone, zweryfikowane
    // ponownie realnym pomiarem.
    nazwa: "A8 Badge — pending", grupa: "A8", pozycja: "pending",
    selektor: '[data-style-id="atom-badge-pending"] > span',
    wlasciwosci: {
      "border-radius": "var(--r-pill)", "font-size": "var(--fs-11)", "font-weight": "var(--fw-medium)",
      "background-color": "var(--grey)", color: "var(--muted)",
    },
  },
  {
    nazwa: "A8 Badge — z licznikiem", grupa: "A8", pozycja: "z licznikiem",
    selektor: '[data-style-id="atom-badge-licznik"] > span',
    wlasciwosci: { "border-radius": "var(--r-pill)", "background-color": "var(--grey)", color: "var(--muted)" },
  },

  // --- A9 Label: 2 warianty ---
  {
    nazwa: "A9 Label — zwykła", grupa: "A9", pozycja: "zwykla",
    selektor: 'label[for="atom-label-cel"]',
    wlasciwosci: { "font-size": "var(--fs-10)", "font-weight": "var(--fw-medium)", color: "var(--ink)" },
  },
  {
    nazwa: "A9 Label — z gwiazdką", grupa: "A9", pozycja: "z gwiazdka",
    selektor: '[data-style-id="atom-label-wymagane"] label > span',
    wlasciwosci: {},
  },

  // --- A10 Hint: 3 umiejscowienia, jedna implementacja ---
  {
    nazwa: "A10 Hint — pod kontrolką", grupa: "A10", pozycja: "pod kontrolka",
    selektor: "#atom-hint",
    wlasciwosci: { "font-size": "var(--fs-11)", color: "var(--muted)" },
  },
  {
    nazwa: "A10 Hint — w nagłówku", grupa: "A10", pozycja: "w naglowku",
    selektor: '[data-style-id="atom-hint-naglowek"] p',
    wlasciwosci: { "font-size": "var(--fs-11)", color: "var(--muted)" },
  },
  {
    nazwa: "A10 Hint — w wierszu", grupa: "A10", pozycja: "w wierszu",
    selektor: '[data-style-id="atom-hint-wiersz"] p',
    wlasciwosci: { "font-size": "var(--fs-11)", color: "var(--muted)" },
  },

  // --- A11 ErrorText: jedyna pozycja ---
  {
    nazwa: "A11 ErrorText — po próbie zapisu", grupa: "A11", pozycja: "po probie zapisu",
    selektor: "#atom-errortext",
    wlasciwosci: { "font-size": "var(--fs-11)", "font-weight": "var(--fw-medium)", color: "var(--error)" },
  },

  // --- A12 Icon: 3 rozmiary ---
  {
    nazwa: "A12 Icon — 18px", grupa: "A12", pozycja: "18px",
    selektor: '[data-style-id="atom-icon"] svg',
    wysokoscDokladna: 18, szerokoscDokladna: 18, tolerancjaPx: 0,
  },
  {
    nazwa: "A12 Icon — 16px", grupa: "A12", pozycja: "16px",
    selektor: '[data-style-id="atom-icon-16"] svg',
    wysokoscDokladna: 16, szerokoscDokladna: 16, tolerancjaPx: 0,
  },
  {
    nazwa: "A12 Icon — 26px", grupa: "A12", pozycja: "26px",
    selektor: '[data-style-id="atom-icon-26"] svg',
    wysokoscDokladna: 26, szerokoscDokladna: 26, tolerancjaPx: 0,
  },

  // --- A13 Skeleton: pasek + wys. przycisku 34px + aria-busy (ten sam mount) ---
  {
    nazwa: "A13 Skeleton — pasek", grupa: "A13", pozycja: "pasek",
    selektor: '[data-style-id="atom-skeleton"] [class*="pasek"]',
    wysokoscDokladna: 14, tolerancjaPx: 0,
    wlasciwosci: { "border-radius": "var(--r-2xs)" },
  },
  {
    nazwa: "A13 Skeleton — wys. przycisku 34px", grupa: "A13", pozycja: "wys. przycisku 34px",
    selektor: '[data-style-id="atom-skeleton-przycisk"] [class*="przycisk"]',
    wysokoscDokladna: 34, tolerancjaPx: 0,
    wlasciwosci: { "border-radius": "var(--r-2xs)" },
  },
  {
    nazwa: "A13 Skeleton — pojemnik aria-busy", grupa: "A13", pozycja: "pojemnik aria-busy",
    selektor: '[data-style-id="atom-skeleton"] > div',
    atrybut: { nazwa: "aria-busy", oczekiwana: "true" },
  },

  // --- A14 Divider: pełna (przerywana = GAP, "tylko nota" w spec) ---
  {
    nazwa: "A14 Divider — pełna", grupa: "A14", pozycja: "pelna",
    selektor: 'hr[role="separator"]',
    wysokoscDokladna: 1, tolerancjaPx: 0,
    wlasciwosci: { "border-top-color": "var(--border)" },
  },

  // --- A15 Avatar: inicjały ---
  {
    nazwa: "A15 Avatar — inicjały", grupa: "A15", pozycja: "inicjaly",
    selektor: '[data-style-id="atom-avatar"] > span',
    wysokoscDokladna: 36, szerokoscDokladna: 36, tolerancjaPx: 0,
    wlasciwosci: {
      "border-radius": "var(--r-round)", "font-size": "var(--fs-10)", "font-weight": "var(--fw-bold)",
      "background-color": "var(--brand-tint)", color: "var(--brand)",
    },
  },

  // --- A16 ProgressBar: w kaflu + w odtwarzaczu ---
  {
    nazwa: "A16 ProgressBar — w kaflu", grupa: "A16", pozycja: "w kaflu",
    selektor: '[data-style-id="atom-progressbar-kafel"] [role="progressbar"]',
    wysokoscDokladna: 10, tolerancjaPx: 0,
    wlasciwosci: { "border-radius": "var(--r-pill)", "background-color": "var(--grey)" },
  },
  {
    nazwa: "A16 ProgressBar — w odtwarzaczu", grupa: "A16", pozycja: "w odtwarzaczu",
    selektor: '[data-style-id="atom-progressbar-odtwarzacz"] [role="progressbar"]',
    wysokoscDokladna: 10, tolerancjaPx: 0,
    wlasciwosci: { "border-radius": "var(--r-pill)", "background-color": "var(--grey)" },
  },

  // --- A17 StepBar: zrobiony/bieżący/przed nami (ten sam mount, 3 kroki) ---
  {
    nazwa: "A17 StepBar — zrobiony", grupa: "A17", pozycja: "zrobiony",
    selektor: '[role="img"] > span:nth-child(1)',
    wysokoscDokladna: 8, tolerancjaPx: 0,
    wlasciwosci: { "background-color": "var(--primary)" },
  },
  {
    nazwa: "A17 StepBar — bieżący", grupa: "A17", pozycja: "biezacy",
    selektor: '[role="img"] > span:nth-child(3)',
    wysokoscDokladna: 8, tolerancjaPx: 0,
  },
  {
    nazwa: "A17 StepBar — przed nami", grupa: "A17", pozycja: "przed nami",
    selektor: '[role="img"] > span:nth-child(4)',
    wysokoscDokladna: 8, tolerancjaPx: 0,
    wlasciwosci: { "background-color": "var(--grey)" },
  },

  // --- A18 Heading: stopień 1-4 (fokus programowy na 2 w REGULY_FOKUSU) ---
  {
    nazwa: "A18 Heading — stopień 1", grupa: "A18", pozycja: "stopien 1",
    selektor: "#atom-heading",
    wlasciwosci: {
      color: "var(--ink)", "font-weight": "var(--fw-bold)",
      "font-size": { "412": "var(--fs-2-sm)", "1440": "var(--fs-2)" },
    },
  },
  {
    nazwa: "A18 Heading — stopień 2", grupa: "A18", pozycja: "stopien 2",
    selektor: "#atom-heading-2",
    wlasciwosci: { "font-size": "var(--fs-4)" },
  },
  {
    nazwa: "A18 Heading — stopień 3", grupa: "A18", pozycja: "stopien 3",
    selektor: "#atom-heading-3",
    wlasciwosci: { "font-size": "var(--fs-6)" },
  },
  {
    nazwa: "A18 Heading — stopień 4", grupa: "A18", pozycja: "stopien 4",
    selektor: "#atom-heading-4",
    wlasciwosci: { "font-size": "var(--fs-8)" },
  },

  // --- A19 Text: zwykły/lekcja/stan pusty ---
  {
    nazwa: "A19 Text — zwykły", grupa: "A19", pozycja: "zwykly",
    selektor: '[data-style-id="atom-text"] > p',
    wlasciwosci: { "font-size": "var(--fs-8)", color: "var(--text)" },
  },
  {
    nazwa: "A19 Text — lekcja", grupa: "A19", pozycja: "lekcja",
    selektor: '[data-style-id="atom-text-lekcja"] > p',
    wlasciwosci: { "font-size": "var(--fs-8)" },
  },
  {
    nazwa: "A19 Text — stan pusty", grupa: "A19", pozycja: "stan pusty",
    selektor: '[data-style-id="atom-text-pusty"] > p',
    wlasciwosci: { "font-size": "var(--fs-8)" },
  },

  // --- A20 Num: 3 umiejscowienia, jedna implementacja ---
  {
    nazwa: "A20 Num — w tekście", grupa: "A20", pozycja: "w tekscie",
    selektor: '[data-style-id="atom-num-tekst"] [class*="liczba"]',
    wlasciwosci: { "font-variant-numeric": "tabular-nums" },
  },
  {
    nazwa: "A20 Num — w tabeli", grupa: "A20", pozycja: "w tabeli",
    selektor: '[data-style-id="atom-num-tabela"] [class*="liczba"]',
    wlasciwosci: { "font-variant-numeric": "tabular-nums" },
  },
  {
    nazwa: "A20 Num — w kaflu", grupa: "A20", pozycja: "w kaflu",
    selektor: '[data-style-id="atom-num-kafel"] [class*="liczba"]',
    wlasciwosci: { "font-variant-numeric": "tabular-nums" },
  },
];

// Reguły fokusu — osobny wykaz, bo mierzą REGUŁĘ WSPÓLNĄ
// (`:root :focus-visible`), nie tabelę atomów. `grupa`/`pozycja` wypełnione
// TYLKO tam, gdzie odpowiadają realnej pozycji "fokus" z kolumny par. 2 —
// Badge nie ma tam wiersza (A8 nie wymienia fokusu w par. 2), więc liczy się
// jako dowód uogólnienia reguły wspólnej, nie jako jedna z 69 pozycji.
export const REGULY_FOKUSU = [
  { nazwa: "Fokus — A1 Button", grupa: "A1", pozycja: "fokus", selektor: '[data-testid="button-primary"]', wymusFokusowalnosc: false },
  { nazwa: "Fokus — A2 Link", grupa: "A2", pozycja: "fokus", selektor: '[data-testid="link"]', wymusFokusowalnosc: false },
  { nazwa: "Fokus — A3 Input", grupa: "A3", pozycja: "fokus", selektor: '[data-testid="input"]', wymusFokusowalnosc: false },
  { nazwa: "Fokus — A4 Textarea", grupa: "A4", pozycja: "fokus", selektor: '[data-testid="textarea"]', wymusFokusowalnosc: false },
  { nazwa: "Fokus — A5 Select", grupa: "A5", pozycja: "fokus", selektor: '[role="combobox"]', wymusFokusowalnosc: false },
  {
    // Natywny <input type="checkbox"> ignoruje author border-radius dla
    // własnego kształtu (charakterystyka renderowania widżetu, zmierzone
    // sondą bezpośrednią — patrz komentarz przy zmierzPromienFokusu w
    // pomiar-styl-atomow.mjs) — dla A6 sprawdzany jest obrys, nie promień.
    nazwa: "Fokus — A6 Checkbox", grupa: "A6", pozycja: "fokus", selektor: "#pol-zgoda", wymusFokusowalnosc: false,
    wlasciwosc: "outline-width", oczekiwanaWartoscTokenu: "var(--focus-width)",
  },
  { nazwa: "Fokus — A18 Heading stopień 2 (programowy)", grupa: "A18", pozycja: "fokus programowy na 2", selektor: "#atom-heading-2", wymusFokusowalnosc: false },
  { nazwa: "Fokus — A8 Badge (spoczynek --r-pill, dowód uogólnienia reguły)", grupa: null, pozycja: null, selektor: '[data-style-id="atom-badge"] > span', wymusFokusowalnosc: true },
];
