// Rejestr NIEZALEŻNY od pomiar-styl-atomow.mjs — z tego samego powodu, dla
// którego cele-oczekiwane.mjs stoi osobno od CELE w pomiar-celow-dotyku.mjs:
// gdyby oczekiwane wartości i pętla pomiaru żyły w jednym pliku, skrócenie
// listy obniżałoby też liczbę oczekiwanych pomiarów i próba wracałaby
// zielona przy realnie mniejszym pokryciu.
//
// Par. 8.2 liczy WARIANTY I STANY z
// kolumny par. 2, nie jeden odczyt na atom. Każdy wpis niżej niesie
// `grupa`/`pozycja` odpowiadające DOKŁADNIE jednej pozycji z
// design-system/poligon/pozycje-warianty-stany-par2.mjs (mianownik liczony
// TAM, nie tu — ten plik jest licznikiem pokrycia, nie mianownikiem; po
// dopisaniu organizmu O7 mianownik jest 74, nie 69 —
// wartość zmierzona programowo z długości POZYCJE_PAR2, nie wpisana z ręki).
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

  // --- Molekuły §3, grupa A.
  // Mianownik w pozycje-warianty-stany-par2.mjs (POZYCJE_PAR2, grupy M1-M9).
  // Mounty w main.tsx, wrapper `data-style-id="molekula-*"`.

  // M1 Field: pięć rodzajów kontrolki (Field opakowuje Input/Textarea/Select
  // atomów bez zmiany ich klas — właściwości powtórzone za A3/A4).
  {
    nazwa: "M1 Field — tekst", grupa: "M1", pozycja: "tekst",
    selektor: '[data-style-id="molekula-field-tekst"] input',
    wysokoscDokladna: 45, tolerancjaPx: 2, szerokoscMax: 480,
    wlasciwosci: { "border-radius": "var(--r-xs)", "font-size": "var(--fs-8)", "border-top-color": "var(--control)" },
  },
  {
    nazwa: "M1 Field — liczba", grupa: "M1", pozycja: "liczba",
    selektor: '[data-style-id="molekula-field-liczba"] input',
    szerokoscMax: 160,
    wlasciwosci: { "font-size": "var(--fs-8)" },
  },
  {
    nazwa: "M1 Field — data", grupa: "M1", pozycja: "data",
    selektor: '[data-style-id="molekula-field-data"] input',
    szerokoscMax: 180,
    wlasciwosci: { "font-size": "var(--fs-8)" },
  },
  {
    nazwa: "M1 Field — wieloliniowy", grupa: "M1", pozycja: "wieloliniowy",
    selektor: '[data-style-id="molekula-field-wieloliniowy"] textarea',
    minWysokosc: 96, szerokoscMax: 720,
    wlasciwosci: { "border-radius": "var(--r-xs)", "font-size": "var(--fs-8)", "border-top-color": "var(--control)" },
  },
  {
    nazwa: "M1 Field — wybór", grupa: "M1", pozycja: "wybor",
    selektor: '[data-style-id="molekula-field-wybor"] [role="combobox"]',
    atrybut: { nazwa: "aria-expanded", oczekiwana: "false" },
  },
  {
    nazwa: "M1 Field — niepoprawny", grupa: "M1", pozycja: "niepoprawny",
    selektor: '[data-style-id="molekula-field-niepoprawny"] input',
    wlasciwosci: { "border-top-color": "var(--error)" },
    atrybut: { nazwa: "aria-invalid", oczekiwana: "true" },
  },
  {
    nazwa: "M1 Field — obowiązkowy", grupa: "M1", pozycja: "obowiazkowy",
    selektor: '[data-style-id="molekula-field-wymagane"] label span',
    atrybut: { nazwa: "aria-hidden", oczekiwana: "true" },
  },
  {
    nazwa: "M1 Field — zablokowany", grupa: "M1", pozycja: "zablokowany",
    selektor: '[data-style-id="molekula-field-zablokowany"] input',
    atrybut: { nazwa: "disabled", oczekiwana: "" },
  },

  // M2 SearchBox: z wpisem (przycisk czyszczenia widoczny) / bez wyników
  // (komunikat atomem Text). Bez ikony — atom Icon nie ma dziś glifu
  // szukania/czyszczenia.
  {
    nazwa: "M2 SearchBox — z wpisem", grupa: "M2", pozycja: "z wpisem",
    selektor: '[data-style-id="molekula-searchbox-z-wpisem"] button',
  },
  {
    nazwa: "M2 SearchBox — bez wyników", grupa: "M2", pozycja: "bez wynikow",
    selektor: '[data-style-id="molekula-searchbox-bez-wynikow"] p',
  },

  // M3 ListRow: wariant idzie na atrybut `data-wariant` renderowany wprost
  // przez komponent; stan "otwarty" na tło `--card-warm` (ListRow.module.css).
  {
    nazwa: "M3 ListRow — prosty", grupa: "M3", pozycja: "prosty",
    selektor: '[data-style-id="molekula-listrow-prosty"] > div',
    atrybut: { nazwa: "data-wariant", oczekiwana: "prosty" },
  },
  {
    nazwa: "M3 ListRow — ze stanem", grupa: "M3", pozycja: "ze stanem",
    selektor: '[data-style-id="molekula-listrow-ze-stanem"] > div',
    atrybut: { nazwa: "data-wariant", oczekiwana: "ze-stanem" },
  },
  {
    nazwa: "M3 ListRow — rozwijalny", grupa: "M3", pozycja: "rozwijalny",
    selektor: '[data-style-id="molekula-listrow-rozwijalny"] > div',
    atrybut: { nazwa: "data-wariant", oczekiwana: "rozwijalny" },
  },
  {
    nazwa: "M3 ListRow — materiał", grupa: "M3", pozycja: "material",
    selektor: '[data-style-id="molekula-listrow-material"] > div',
    atrybut: { nazwa: "data-wariant", oczekiwana: "material" },
  },
  {
    nazwa: "M3 ListRow — z licznikiem", grupa: "M3", pozycja: "z licznikiem",
    selektor: '[data-style-id="molekula-listrow-z-licznikiem"] > div',
    atrybut: { nazwa: "data-wariant", oczekiwana: "z-licznikiem" },
  },
  {
    nazwa: "M3 ListRow — otwarty", grupa: "M3", pozycja: "otwarty",
    selektor: '[data-style-id="molekula-listrow-otwarty"] > div',
    wlasciwosci: { "background-color": "var(--card-warm)" },
  },

  // M4 KeyValueRow: jawna (wartość widoczna od razu) / zamaskowana (przycisk
  // "Pokaż" istnieje tylko wtedy).
  {
    nazwa: "M4 KeyValueRow — jawna", grupa: "M4", pozycja: "jawna",
    selektor: '[data-style-id="molekula-keyvaluerow-jawna"] span',
  },
  {
    nazwa: "M4 KeyValueRow — zamaskowana", grupa: "M4", pozycja: "zamaskowana",
    selektor: '[data-style-id="molekula-keyvaluerow-zamaskowana"] button',
  },

  // M7 Breadcrumbs: pełne (Link atomu, pole dotyku ≥44px jak A2).
  {
    nazwa: "M7 Breadcrumbs — pełne", grupa: "M7", pozycja: "pelne",
    selektor: '[data-style-id="molekula-breadcrumbs-pelne"] a',
    minWysokosc: 44,
  },
  {
    // Skrócone (w. 147): pięciopozycyjna ścieżka zwija się do pierwsza/…/
    // ostatnia — mierzony węzeł "…" (aria-hidden, nieklikalny) dowodzi, że
    // Breadcrumbs.tsx naprawdę zwija środek, nie tylko przyjmuje prop.
    nazwa: "M7 Breadcrumbs — skrócone", grupa: "M7", pozycja: "skrocone",
    selektor: '[data-style-id="m7-breadcrumbs-skrocone"] [data-testid="breadcrumbs-elipsa"]',
    wlasciwosci: { color: "var(--muted)" },
  },

  // M8 Tabs: wybrana (aria-pressed na Button poziom=primary). Fokus w
  // REGULY_FOKUSU niżej.
  {
    nazwa: "M8 Tabs — wybrana", grupa: "M8", pozycja: "wybrana",
    selektor: '[data-style-id="molekula-tabs"] button[aria-pressed="true"]',
    atrybut: { nazwa: "aria-pressed", oczekiwana: "true" },
  },
  {
    // Zwinięta poniżej 639 (w. 148): mierzony <summary> WŁASNEGO mountu
    // (zwinPonizej639), nie tego z "wybrana"/"fokus" — patrz komentarz w
    // Tabs.tsx. visibility (nie display) różni się realnie z viewportem:
    // widoczny ≤639, ukryty >639 — dokładnie odwrotnie niż szeroki rząd.
    nazwa: "M8 Tabs — zwinięta poniżej 639", grupa: "M8", pozycja: "zwinieta ponizej 639",
    selektor: '[data-style-id="m8-tabs-zwiniete"] summary',
    wlasciwosci: { visibility: { "412": "visible", "1440": "hidden" } },
  },

  // M9 MenuItem/MenuGroup: bieżąca (aria-current + tło --green-tint), linia
  // "W przygotowaniu" (klasa dedykowana, nigdy <a>), nagłówek grupy (styl
  // MenuItem.module.css .naglowekGrupy).
  {
    nazwa: "M9 MenuItem — bieżąca", grupa: "M9", pozycja: "biezaca",
    selektor: '[data-style-id="molekula-menugroup"] a[aria-current="page"]',
    atrybut: { nazwa: "aria-current", oczekiwana: "page" },
    wlasciwosci: { "background-color": "var(--green-tint)" },
  },
  {
    nazwa: "M9 MenuItem — w przygotowaniu", grupa: "M9", pozycja: "w przygotowaniu",
    selektor: '[data-style-id="molekula-menugroup"] li[class*="wPrzygotowaniu"]',
  },
  {
    nazwa: "M9 MenuItem — nagłówek grupy", grupa: "M9", pozycja: "naglowek grupy",
    selektor: '[data-style-id="molekula-menugroup"] p[class*="naglowekGrupy"]',
    wlasciwosci: { "font-size": "var(--fs-13)" },
  },

  // === Warstwa 3, grupa C (M14-M19) ===
  // Ten sam wołający (`npm run pomiar:styl-atomow`), ten sam mianownik
  // (`pozycje-warianty-stany-par2.mjs`, rozszerzony wyżej) — molekuły
  // WCHODZĄ do istniejącego przyrządu, nie dostają drugiego.

  // --- M14 Pagination: brak nazwanych pozycji w kolumnie "Z czego, warianty,
  // stany" (patrz pozycje-warianty-stany-par2.mjs) — ten wpis jest
  // __pomocniczy_wymiar (jak A6 "pole dotyku"), więc NIE dopasowuje się do
  // POZYCJE_PAR2 i nie zwiększa mianownika; mierzy tylko realny wymiar z
  // kolumny "Wymiary" (w. 154: "pola ≥ 44 px").
  {
    nazwa: "M14 Pagination — pola dotykowe", grupa: "M14", pozycja: "__pomocniczy_wymiar",
    selektor: '[data-style-id="m14-pagination"] button',
    minWysokosc: 44, minSzerokosc: 44,
  },

  // --- M15 Toast: warianty bez akcji / z akcją / z odnośnikiem do dziennika ---
  {
    nazwa: "M15 Toast — bez akcji", grupa: "M15", pozycja: "bez akcji",
    selektor: '[data-style-id="m15-toast-bez-akcji"] [role="status"]',
    wlasciwosci: { "border-radius": "var(--r-pill)", "background-color": "var(--invert-bg)" },
  },
  {
    nazwa: "M15 Toast — z akcją", grupa: "M15", pozycja: "z akcja",
    selektor: '[data-testid="toast-cofnij"]',
    minWysokosc: 44,
    wlasciwosci: { color: "var(--link)" },
  },
  {
    nazwa: "M15 Toast — z odnośnikiem do dziennika", grupa: "M15", pozycja: "z odnosnikiem do dziennika",
    selektor: '[data-testid="toast-odnosnik-dziennika"]',
    minWysokosc: 44,
    wlasciwosci: { color: "var(--invert-link)" },
  },

  // --- M16 CollapsibleSection: zwinięta/rozwinięta na TYM SAMYM mouncie,
  // akcje idempotentne — kolejność wpisów bez znaczenia (jak A5 Select).
  // Fokus w REGULY_FOKUSU niżej.
  {
    nazwa: "M16 CollapsibleSection — zwinięta", grupa: "M16", pozycja: "zwinieta",
    selektor: '[data-style-id="m16-collapsible"] button',
    akcje: [{ typ: "zamknij-jesli-otwarta", cel: '[data-style-id="m16-collapsible"] button' }],
    minWysokosc: 44,
    atrybut: { nazwa: "aria-expanded", oczekiwana: "false" },
  },
  {
    nazwa: "M16 CollapsibleSection — rozwinięta", grupa: "M16", pozycja: "rozwinieta",
    selektor: '[data-style-id="m16-collapsible"] button',
    akcje: [{ typ: "otworz-jesli-zamknieta", cel: '[data-style-id="m16-collapsible"] button' }],
    atrybut: { nazwa: "aria-expanded", oczekiwana: "true" },
  },

  // --- M17 EmptyState: pusto / brak uprawnień / brak wyników filtra ---
  {
    nazwa: "M17 EmptyState — pusto", grupa: "M17", pozycja: "pusto",
    selektor: '[data-style-id="m17-pusto"] h2',
    wlasciwosci: { color: "var(--ink)", "font-weight": "var(--fw-bold)", "font-size": "var(--fs-4)" },
  },
  {
    nazwa: "M17 EmptyState — brak uprawnień", grupa: "M17", pozycja: "brak uprawnien",
    selektor: '[data-style-id="m17-brak-uprawnien"] p',
    wlasciwosci: { color: "var(--muted)", "font-size": "var(--fs-8)" },
  },
  {
    nazwa: "M17 EmptyState — brak wyników filtra", grupa: "M17", pozycja: "brak wynikow filtra",
    selektor: '[data-style-id="m17-brak-wynikow-filtra"] p',
    wlasciwosci: { color: "var(--muted)", "font-size": "var(--fs-8)" },
  },

  // --- M18 RichTextEditor: "fokus w pojemniku" mierzy ANCESTOR (:focus-within
  // na .pojemnik) po kliknięciu przycisku paska — akcja "klik" daje realny
  // fokus DOM niezależnie od heurystyki :focus-visible (ta różnica dotyczy
  // tylko selektora `:focus-visible`, nie `:focus-within`). "fokus w treści"
  // mierzony w REGULY_FOKUSU (element skupiany bezpośrednio, potrzebuje
  // wymuszenia trybu klawiatury — patrz zmierzPromienFokusu).
  {
    nazwa: "M18 RichTextEditor — fokus w pojemniku", grupa: "M18", pozycja: "fokus w pojemniku",
    selektor: '[data-style-id="m18-richtext"] > div',
    akcje: [{ typ: "klik", cel: '[data-style-id="m18-richtext"] button' }],
    wlasciwosci: { "border-top-color": "var(--brand)" },
  },

  // --- M19 QaBlock: odpowiedziana / czeka ---
  {
    nazwa: "M19 QaBlock — odpowiedziana", grupa: "M19", pozycja: "odpowiedziana",
    selektor: '[data-style-id="m19-odpowiedziana"] p:last-child',
    wlasciwosci: { "background-color": "var(--card-warm)", "border-radius": "var(--r-2xs)" },
  },
  {
    nazwa: "M19 QaBlock — czeka", grupa: "M19", pozycja: "czeka",
    selektor: '[data-style-id="m19-czeka"] p:last-child',
    wlasciwosci: { "font-size": "var(--fs-11)", color: "var(--muted)" },
  },

  // --- O7 PublishChecklist: jedyny organizm złożony wprost z atomów (par. 4).
  // Wariant stały (kolumna A-12) — jedyny zbudowany, mountowany dwa razy w
  // main.tsx (z brakami / bez braków), bo "z brakami" i "bez braków" to stan
  // zależny od PROPS (lista braków pusta albo nie), tej samej rangi co np.
  // A13 aria-busy — potrzebuje własnego mountu, nie akcji.
  {
    nazwa: "O7 PublishChecklist — wariant stały (ramka 2px --border-strong)",
    grupa: "O7", pozycja: "wariant staly",
    selektor: '[data-style-id="organizm-o7-z-brakami"] section',
    wlasciwosci: {
      "border-top-width": "2px",
      "border-top-color": "var(--border-strong)",
      "border-radius": "var(--r-sm)",
    },
  },
  {
    nazwa: "O7 PublishChecklist — gotowe zwinięte z licznikiem (min. 44px)",
    grupa: "O7", pozycja: "gotowe zwiniete z licznikiem",
    selektor: '[data-style-id="organizm-o7-z-brakami"] summary',
    wlasciwosci: { "min-height": "var(--hit-min)" },
  },
  {
    // Lista braków (<ul>) istnieje w drzewie WYŁĄCZNIE gdy braki.length > 0 —
    // jej samo istnienie (display != "none") jest dowodem stanu "z brakami",
    // nie tylko dekoracją.
    nazwa: "O7 PublishChecklist — z brakami (lista odnośników wyrenderowana)",
    grupa: "O7", pozycja: "z brakami",
    selektor: '[data-style-id="organizm-o7-z-brakami"] ul',
    wlasciwosci: { display: "flex" },
  },
  {
    // Zamknięcie (w. 171: "Heading + Badge + lista braków + zamknięcie") —
    // Button `quiet` (A1) wewnątrz panelu; cel dotykowy 44px jak każdy
    // Button, sprawdzony tu przez min-height (cel dotyku dla tego elementu).
    nazwa: "O7 PublishChecklist — zamknięcie (Button quiet, cel dotykowy)",
    grupa: "O7", pozycja: "zamkniecie",
    selektor: '[data-style-id="organizm-o7-z-brakami"] button',
    wlasciwosci: { "min-height": "var(--hit-min)" },
  },

  // --- Molekuły warstwy 3, grupa B — dopisane do TEGO SAMEGO rejestru
  // (przyrząd istnieje od warstwy 2, molekuły miały
  // WEJŚĆ do niego, nie dostać drugi). Pozycje odpowiadają DOKŁADNIE
  // wpisom w pozycje-warianty-stany-par2.mjs (grupy M5/M6/M10/M11/M13;
  // M12 nie ma tu żadnej pozycji, jej jedyna pozycja "fokus poczatkowy na
  // wycofaniu" jest GAPEM jawnym, patrz GAPY_JAWNE w tamtym pliku).

  // --- M5 FileDropZone: stan "po dodaniu" (druga mount, niepusta lista plików — FileRow wewnątrz) ---
  {
    nazwa: "M5 FileDropZone — po dodaniu", grupa: "M5", pozycja: "po dodaniu",
    selektor: '[data-style-id="m5-filedropzone-po-dodaniu"] li',
    wlasciwosci: { "border-radius": "var(--r-2xs)" },
  },

  // --- M6 FileRow: 3 warianty (padding 6px 10px, r6, ramka 1px kolor zależny od stanu) ---
  {
    nazwa: "M6 FileRow — przetwarzanie", grupa: "M6", pozycja: "przetwarzanie",
    selektor: '[data-style-id="m6-filerow-przetwarzanie"] li',
    wlasciwosci: { "border-radius": "var(--r-2xs)", "font-size": "var(--fs-10)", "border-top-color": "var(--control)" },
  },
  {
    nazwa: "M6 FileRow — gotowy", grupa: "M6", pozycja: "gotowy",
    selektor: '[data-style-id="m6-filerow-gotowy"] li',
    wlasciwosci: { "border-radius": "var(--r-2xs)", "font-size": "var(--fs-10)", "border-top-color": "var(--border)" },
  },
  {
    nazwa: "M6 FileRow — błąd", grupa: "M6", pozycja: "blad",
    selektor: '[data-style-id="m6-filerow-blad"] li',
    wlasciwosci: { "border-radius": "var(--r-2xs)", "font-size": "var(--fs-10)", "border-top-color": "var(--error)" },
  },

  // --- M10 StatTile: bez ramki/tła/cienia; wartość 24px/700 zwykła, 44px/900 dominująca ---
  {
    nazwa: "M10 StatTile — zwykły", grupa: "M10", pozycja: "zwykly",
    selektor: '[data-style-id="m10-stattile-zwykly"] [class*="wartosc"]',
    wlasciwosci: { "font-size": "var(--fs-3)", "font-weight": "var(--fw-bold)" },
  },
  {
    nazwa: "M10 StatTile — dominujący", grupa: "M10", pozycja: "dominujacy",
    selektor: '[data-style-id="m10-stattile-dominujacy"] [class*="wartosc"]',
    wlasciwosci: { "font-size": "var(--fs-1)", "font-weight": "var(--fw-black)" },
  },
  {
    nazwa: "M10 StatTile — bez danych", grupa: "M10", pozycja: "bez danych",
    selektor: '[data-style-id="m10-stattile-brak"] [class*="kafel"]',
    wlasciwosci: { "background-color": "rgba(0, 0, 0, 0)", "box-shadow": "none" },
  },

  // --- M11 Notice: 4 warianty, tekst zawsze --ink, tło zależne od wariantu, r12 ---
  {
    nazwa: "M11 Notice — ok", grupa: "M11", pozycja: "ok",
    selektor: '[data-style-id="m11-notice-ok"] > div',
    wlasciwosci: { "border-radius": "var(--r-sm)", color: "var(--ink)", "background-color": "var(--success-bg)" },
  },
  {
    nazwa: "M11 Notice — warn", grupa: "M11", pozycja: "warn",
    selektor: '[data-style-id="m11-notice-warn"] > div',
    wlasciwosci: { "border-radius": "var(--r-sm)", color: "var(--ink)", "background-color": "var(--warn-bg)" },
  },
  {
    nazwa: "M11 Notice — error", grupa: "M11", pozycja: "error",
    selektor: '[data-style-id="m11-notice-error"] > div',
    wlasciwosci: { "border-radius": "var(--r-sm)", color: "var(--ink)", "background-color": "var(--error-bg)" },
    atrybut: { nazwa: "role", oczekiwana: "alert" },
  },
  {
    // Styl zmierzony tutaj; realne użycie na ekranie aplikacji nadal 0 —
    // „pułapka M11”: ten wpis mierzy TOKENY,
    // nie zdejmuje faktu zerowego użycia.
    nazwa: "M11 Notice — info", grupa: "M11", pozycja: "info",
    selektor: '[data-style-id="m11-notice-info"] > div',
    wlasciwosci: { "border-radius": "var(--r-sm)", color: "var(--ink)", "background-color": "var(--brand-tint)" },
  },

  // --- M13 SaveBar: widoczny — ramka 1px --warn, r12, padding 10px 14px ---
  {
    nazwa: "M13 SaveBar — widoczny", grupa: "M13", pozycja: "widoczny",
    selektor: '[data-style-id="m13-savebar-widoczny"] > div',
    wlasciwosci: { "border-radius": "var(--r-sm)", "border-top-color": "var(--warn)" },
  },
];

// Reguły fokusu — osobny wykaz, bo mierzą REGUŁĘ WSPÓLNĄ
// (`[data-theme] :focus-visible`), nie tabelę atomów. `grupa`/`pozycja` wypełnione
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
  // M8 Tabs — fokus na Button już wybranej zakładki (ta sama reguła wspólna).
  { nazwa: "Fokus — M8 Tabs", grupa: "M8", pozycja: "fokus", selektor: '[data-style-id="molekula-tabs"] button[aria-pressed="true"]', wymusFokusowalnosc: false },

  // Warstwa 3, grupa C.
  { nazwa: "Fokus — M16 CollapsibleSection nagłówek", grupa: "M16", pozycja: "fokus", selektor: '[data-style-id="m16-collapsible"] button', wymusFokusowalnosc: false },
  {
    // Obszar edytowalny nie ma standardowego r-2xs (`.obszar:focus-visible`
    // rysuje TYLKO outline, bez zmiany border-radius) — sprawdzany
    // outline-width, ten sam wzorzec co A6 Checkbox (widżet, dla którego
    // border-radius nie jest właściwym pomiarem fokusu).
    nazwa: "Fokus — M18 RichTextEditor treść", grupa: "M18", pozycja: "fokus w tresci",
    selektor: '[data-style-id="m18-richtext"] [contenteditable]', wymusFokusowalnosc: false,
    wlasciwosc: "outline-width", oczekiwanaWartoscTokenu: "var(--focus-width)",
  },
  {
    // O7 PublishChecklist: nagłówek (Heading stopień 2, tabIndex=-1 wbudowany
    // w atom) przyjmuje fokus programowy przy KAŻDYM renderze — ten sam
    // mechanizm co A18 "fokus programowy na 2", zmierzony na organizmie, nie
    // na gołym atomie.
    nazwa: "Fokus — O7 PublishChecklist nagłówek (programowy)",
    grupa: "O7", pozycja: "fokus naglowka",
    selektor: '[data-style-id="organizm-o7-z-brakami"] h2',
    wymusFokusowalnosc: false,
  },
  // M5 FileDropZone: obszar ma natywny tabIndex={0} (własny atrybut komponentu,
  // patrz FileDropZone.tsx) — wymusFokusowalnosc NIE potrzebne. Domyślne
  // wlasciwoscDoSprawdzenia/oczekiwanaWartoscTokenu (border-radius / var(--r-2xs))
  // celowo BEZ nadpisania — poprzednia własna reguła .obszar:focus-visible w
  // FileDropZone.module.css (border-radius: var(--r-sm)) była wadą wykonania,
  // usuniętą przy tej samej zmianie (patrz komentarz w tamtym pliku): fokus
  // widoczny ma JEDNĄ regułę na cały front, r6, bez wyjątku per-molekuła.
  { nazwa: "Fokus — M5 FileDropZone", grupa: "M5", pozycja: "fokus", selektor: '[data-style-id="m5-filedropzone"] [role="button"]', wymusFokusowalnosc: false },
];
