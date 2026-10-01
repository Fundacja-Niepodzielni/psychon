/**
 * Jeden formater dat nowego frontu. Każdy znacznik czasu i każda data
 * kalendarzowa z API przechodzi przez te dwie funkcje — ekran nie pokazuje
 * pola `*_at` wprost i nie składa własnego `Intl.DateTimeFormat`.
 *
 *  - `formatujDate("2026-09-30T18:50:00Z")`      → „30 września 2026”
 *  - `formatujDateICzas("2026-09-30T18:50:00Z")` → „30 września 2026, 20:50”
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
