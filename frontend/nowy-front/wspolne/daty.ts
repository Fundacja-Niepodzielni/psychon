/**
 * Jeden formater dat nowego frontu. Każdy znacznik czasu i każda data
 * kalendarzowa z API przechodzi przez te dwie funkcje — ekran nie pokazuje
 * pola `*_at` wprost i nie składa własnego `Intl.DateTimeFormat`.
 *
 *  - `formatujDate("2026-09-30T18:50:00Z")`      → „30 września 2026”
 *  - `formatujDateICzas("2026-09-30T18:50:00Z")` → „30 września 2026, 20:50”
 *  - `formatujDateZDniemTygodnia("2026-11-05T17:00:00Z")` → „czwartek, 5 listopada 2026, 18:00”
 *  - `formatujGodzine("2026-11-05T17:00:00Z")`    → „18:00”
 *  - brak wartości (`null`, `undefined`, pusty napis) albo napis, którego nie
 *    da się odczytać jako daty → „—”.
 *
 * Strefa zawsze `Europe/Warsaw`, język `pl-PL`. Data kalendarzowa bez godziny
 * (`YYYY-MM-DD`) nie zmienia dnia przy przeliczeniu strefy: jest dniem samym
 * w sobie, więc formatuje się w `UTC`, a „z godziną” pokazuje wtedy sam dzień.
 *
 * Ten sam plik niesie liczenie dnia kalendarzowego (`numerDniaKalendarzowego`):
 * to jedyne miejsce, w którym nowy front składa formater dnia warszawskiego.
 */

const BRAK = "—";
const STREFA = "Europe/Warsaw";
const JEZYK = "pl-PL";
const DATA_KALENDARZOWA = /^\d{4}-\d{2}-\d{2}$/;
const MS_NA_DOBE = 24 * 60 * 60 * 1000;

const formatDnia = new Intl.DateTimeFormat(JEZYK, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: STREFA,
});

const formatDniaKalendarzowego = new Intl.DateTimeFormat(JEZYK, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const formatDniaTygodnia = new Intl.DateTimeFormat(JEZYK, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: STREFA,
});

const formatGodziny = new Intl.DateTimeFormat(JEZYK, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: STREFA,
});

// Części dnia warszawskiego do liczenia numeru dnia: angielski, gregoriański
// kalendarz i cyfry łacińskie, żeby `Number(...)` nie zależało od języka ani od
// ustawień maszyny. Strefa jawna, nigdy strefa maszyny ani przeglądarki.
const formatNumeruDnia = new Intl.DateTimeFormat("en-US", {
  timeZone: STREFA,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function odczytaj(iso: string | null | undefined): { data: Date; kalendarzowa: boolean } | null {
  if (iso === null || iso === undefined) return null;
  const tekst = iso.trim();
  if (tekst === "") return null;
  const data = new Date(tekst);
  if (Number.isNaN(data.getTime())) return null;
  return { data, kalendarzowa: DATA_KALENDARZOWA.test(tekst) };
}

export function formatujDate(iso: string | null | undefined): string {
  const odczyt = odczytaj(iso);
  if (!odczyt) return BRAK;
  return (odczyt.kalendarzowa ? formatDniaKalendarzowego : formatDnia).format(odczyt.data);
}

export function formatujDateICzas(iso: string | null | undefined): string {
  const odczyt = odczytaj(iso);
  if (!odczyt) return BRAK;
  if (odczyt.kalendarzowa) return formatDniaKalendarzowego.format(odczyt.data);
  return `${formatDnia.format(odczyt.data)}, ${formatGodziny.format(odczyt.data)}`;
}

/** „czwartek, 5 listopada 2026, 18:00” — dzień tygodnia, dzień i godzina w Warszawie; data kalendarzowa bez godziny pokazuje sam dzień z dniem tygodnia. */
export function formatujDateZDniemTygodnia(iso: string | null | undefined): string {
  const odczyt = odczytaj(iso);
  if (!odczyt) return BRAK;
  if (odczyt.kalendarzowa) {
    return new Intl.DateTimeFormat(JEZYK, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(odczyt.data);
  }
  return `${formatDniaTygodnia.format(odczyt.data)}, ${formatGodziny.format(odczyt.data)}`;
}

/** „18:00” — sama godzina w Warszawie (północ to „00:00”); data kalendarzowa bez godziny nie ma godziny, więc „—”. */
export function formatujGodzine(iso: string | null | undefined): string {
  const odczyt = odczytaj(iso);
  if (!odczyt || odczyt.kalendarzowa) return BRAK;
  return formatGodziny.format(odczyt.data);
}

// Dzień i godzina na ścianie w Warszawie (cyfry łacińskie, kalendarz gregoriański, godzina 0–23).
const formatSciany = new Intl.DateTimeFormat("en-US", {
  timeZone: STREFA,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

function sciana(ms: number): { rok: number; miesiac: number; dzien: number; godzina: number; minuta: number } {
  const czesci = formatSciany.formatToParts(new Date(ms));
  const wartosc = (rodzaj: Intl.DateTimeFormatPartTypes) => Number(czesci.find((czesc) => czesc.type === rodzaj)?.value);
  return { rok: wartosc("year"), miesiac: wartosc("month"), dzien: wartosc("day"), godzina: wartosc("hour"), minuta: wartosc("minute") };
}

/**
 * Chwila (ms od 1970 UTC), w której kończy się dzień kalendarzowy w Warszawie,
 * w którym wypada `ms` — północ 00:00 następnego dnia. Czas Warszawy to UTC+1
 * albo UTC+2, więc północ jest o 23:00 albo 22:00 UTC; dzień zmiany czasu trwa
 * 23 albo 25 godzin i też kończy się o północy. Wartość nieskończona → `null`.
 */
export function poczatekNastepnegoDniaWarszawskiego(ms: number): number | null {
  if (!Number.isFinite(ms)) return null;
  const dzis = sciana(ms);
  const sciennaPolnoc = Date.UTC(dzis.rok, dzis.miesiac - 1, dzis.dzien + 1, 0, 0);
  const jutro = sciana(sciennaPolnoc);
  for (const przesuniecieGodzin of [1, 2]) {
    const kandydat = sciennaPolnoc - przesuniecieGodzin * 60 * 60 * 1000;
    const wynik = sciana(kandydat);
    if (wynik.rok === jutro.rok && wynik.miesiac === jutro.miesiac && wynik.dzien === jutro.dzien && wynik.godzina === 0 && wynik.minuta === 0) {
      return kandydat;
    }
  }
  return null;
}

/**
 * Numer dnia kalendarzowego (czasu warszawskiego), w którym wypada chwila `ms`
 * (skończona liczba milisekund): liczba dób od 1970-01-01 dla daty
 * rok-miesiąc-dzień. Różnica dwóch takich numerów to liczba dni kalendarzowych
 * — doba 23-godzinna (29.03) i 25-godzinna (25.10) zmiany czasu liczy się jako
 * jeden dzień, bo liczy się data, a nie upływ godzin.
 */
export function numerDniaKalendarzowego(ms: number): number {
  const czesci = formatNumeruDnia.formatToParts(new Date(ms));
  const wartosc = (rodzaj: "year" | "month" | "day") => Number(czesci.find((czesc) => czesc.type === rodzaj)?.value);
  return Date.UTC(wartosc("year"), wartosc("month") - 1, wartosc("day")) / MS_NA_DOBE;
}
