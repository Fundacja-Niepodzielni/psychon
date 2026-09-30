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
 */

const BRAK = "—";
const STREFA = "Europe/Warsaw";
const JEZYK = "pl-PL";
const DATA_KALENDARZOWA = /^\d{4}-\d{2}-\d{2}$/;

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
