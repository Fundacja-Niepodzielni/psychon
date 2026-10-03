import type { AttendanceWindow } from "@/lib/courses";
import { adresLekcji } from "@/nowy-front/lekcja/adres";
import { formatujDateICzas, formatujDateZDniemTygodnia, formatujGodzine, poczatekNastepnegoDniaWarszawskiego } from "@/nowy-front/wspolne/daty";
import type { KursUczestnika } from "./dane";

/**
 * Czysta logika widoku webinaru (bez Reacta i bez żądań): okno potwierdzania
 * obecności, bezpieczny adres transmisji i wszystkie stany widoku, liczone z
 * odczytu `GET /courses/{slug}` (`type: "webinar"`). Webinar jest zawsze
 * otwarty (nie ma „zamkniętego”), nie ma tematów, lekcji ani testu; ukończenie
 * rozstrzyga `status` odczytu — dwa sposoby: potwierdzona obecność albo
 * obejrzane nagranie na istniejącym ekranie lekcji.
 */

/** Czy odczyt dotyczy webinaru; brak pola `type` (zaplecze bez webinarów) znaczy „kurs”. */
export function jestWebinarem(kurs: { type?: string | null }): boolean {
  return kurs.type === "webinar";
}

/**
 * Adres transmisji, ale tylko gdy jest bezpiecznym odnośnikiem: schemat https,
 * host, bez nazwy użytkownika i hasła, bez białych znaków. Transmisja idzie na
 * zewnętrzny serwis, więc ekran niczego innego nie linkuje (ani `http:`, ani
 * `javascript:`, ani `data:`). Wraca napis dokładnie taki, jak przyszedł.
 */
export function adresStreamu(adres: string | null | undefined): string | null {
  if (typeof adres !== "string" || !/^https:\/\/[^/\\?#]/i.test(adres) || /\s/.test(adres)) return null;
  try {
    const url = new URL(adres);
    if (url.protocol !== "https:" || url.hostname === "" || url.username !== "" || url.password !== "") return null;
    return adres;
  } catch {
    return null;
  }
}

const KOLEJNOSC_OKNA: Record<AttendanceWindow, number> = { before: 0, open: 1, closed: 2 };

function jestOknem(wartosc: unknown): wartosc is AttendanceWindow {
  return wartosc === "before" || wartosc === "open" || wartosc === "closed";
}

function czas(iso: string | null | undefined): number | null {
  if (typeof iso !== "string") return null;
  const wynik = Date.parse(iso);
  return Number.isNaN(wynik) ? null : wynik;
}

export interface WejscieOkna {
  /** Okno z odczytu (migawka z chwili odczytu); może być nieobecne. */
  serwer: AttendanceWindow | null | undefined;
  startsAt: string | null | undefined;
  /** Koniec okna z odczytu; bez niego liczony jest z początku (północ w Warszawie). */
  zamyka: string | null | undefined;
}

/**
 * Okno obecności „teraz”: od początku transmisji do północy w Warszawie tego
 * dnia. Okno z odczytu jest migawką, więc zegar może je tylko przesunąć dalej
 * (przed → otwarte → zamknięte), nigdy wstecz — wygrywa późniejszy z dwóch
 * stanów. Bez czasów rozstrzyga sam serwer; bez niczego wynik to `null`
 * (obecności wtedy nie oferujemy).
 */
export function oknoObecnosci({ serwer, startsAt, zamyka }: WejscieOkna, teraz: number): AttendanceWindow | null {
  const zSerwera = jestOknem(serwer) ? serwer : null;
  const start = czas(startsAt);
  let zCzasow: AttendanceWindow | null = null;
  if (start !== null) {
    const koniec = czas(zamyka) ?? poczatekNastepnegoDniaWarszawskiego(start);
    zCzasow = teraz < start ? "before" : koniec !== null && teraz >= koniec ? "closed" : "open";
  }
  if (zSerwera === null) return zCzasow;
  if (zCzasow === null) return zSerwera;
  return KOLEJNOSC_OKNA[zCzasow] > KOLEJNOSC_OKNA[zSerwera] ? zCzasow : zSerwera;
}

/** Okno podane przez serwer w odmowie 422 — wygrywa z odczytem i z zegarem aż do ponownego wczytania. */
export interface NadpisanieOkna {
  okno: AttendanceWindow;
  otwiera: string | null;
  zamyka: string | null;
}

export type ObecnoscWidoku =
  /** Obecność potwierdzona (z odczytu albo przed chwilą): zdanie zamiast przycisku. */
  | { rodzaj: "potwierdzona"; zdanie: string }
  /** Okno otwarte: przycisk „Potwierdzam udział” czynny. */
  | { rodzaj: "czynny" }
  /** Przed oknem: przycisk widoczny, ale nieczynny, z powodem. */
  | { rodzaj: "przed"; powod: string }
  /** Po oknie: bez przycisku, zdanie o upływie czasu. */
  | { rodzaj: "minelo"; zdanie: string }
  /** Nic do pokazania (webinar ukończony nagraniem albo okno nieznane). */
  | { rodzaj: "brak" };

export type NagranieWidoku = { rodzaj: "link"; href: string } | { rodzaj: "wkrotce" } | { rodzaj: "brak" };

export interface WidokWebinaru {
  tytul: string;
  /** Opis webinaru; `null`, gdy odczyt go nie niesie. */
  opis: string | null;
  /** „czwartek, 5 listopada 2026, 18:00” w Warszawie; „—”, gdy brak daty. */
  termin: string;
  okno: AttendanceWindow | null;
  /** Webinar ukończony: `status` odczytu albo obecność potwierdzona w tej sesji. */
  ukonczony: boolean;
  /** Zdanie pod potwierdzeniem ukończenia (jak ukończono); `null`, gdy sposób nieznany. */
  zdanieUkonczenia: string | null;
  /** Odnośnik do transmisji tylko dla adresu https; inaczej `null`. */
  adresStreamu: string | null;
  obecnosc: ObecnoscWidoku;
  nagranie: NagranieWidoku;
}

const ZDANIE_MINELO = "Czas na potwierdzenie udziału minął.";

function zdaniePotwierdzenia(attendedAt: string): string {
  return `Udział potwierdzony ${formatujDateICzas(attendedAt)}.`;
}

/**
 * Cały widok webinaru z odczytu. `lokalnaObecnosc` to chwila potwierdzenia
 * zrobionego w tej sesji (odczyt jeszcze jej nie niesie); `nadpisanie` — okno
 * z odmowy 422. `teraz` w ms, żeby okno przesuwało się z zegarem.
 */
export function zbudujWidokWebinaru(
  kurs: KursUczestnika,
  teraz: number,
  lokalnaObecnosc: string | null,
  nadpisanie: NadpisanieOkna | null,
): WidokWebinaru {
  const attendedAt = kurs.attended_at ?? lokalnaObecnosc;
  const potwierdzona = typeof attendedAt === "string" && attendedAt !== "";
  const ukonczony = kurs.status === "completed" || potwierdzona;
  const okno =
    nadpisanie !== null
      ? nadpisanie.okno
      : oknoObecnosci({ serwer: kurs.attendance_window, startsAt: kurs.starts_at, zamyka: kurs.attendance_closes_at }, teraz);
  const opis = typeof kurs.description === "string" && kurs.description.trim() !== "" ? kurs.description : null;

  let obecnosc: ObecnoscWidoku;
  if (potwierdzona) {
    obecnosc = { rodzaj: "potwierdzona", zdanie: zdaniePotwierdzenia(attendedAt) };
  } else if (ukonczony || okno === null) {
    obecnosc = { rodzaj: "brak" };
  } else if (okno === "open") {
    obecnosc = { rodzaj: "czynny" };
  } else if (okno === "before") {
    const godzina = formatujGodzine(kurs.starts_at);
    obecnosc = {
      rodzaj: "przed",
      powod: godzina === "—" ? "Udział potwierdzisz od rozpoczęcia transmisji." : `Udział potwierdzisz od ${godzina}.`,
    };
  } else {
    obecnosc = { rodzaj: "minelo", zdanie: ZDANIE_MINELO };
  }

  const idNagrania = kurs.recording_lesson_id;
  const nagranie: NagranieWidoku =
    typeof idNagrania === "number"
      ? { rodzaj: "link", href: adresLekcji(idNagrania, kurs.slug) }
      : okno === "closed"
        ? { rodzaj: "wkrotce" }
        : { rodzaj: "brak" };

  return {
    tytul: kurs.title,
    opis,
    termin: formatujDateZDniemTygodnia(kurs.starts_at),
    okno,
    ukonczony,
    zdanieUkonczenia: !ukonczony ? null : potwierdzona ? zdaniePotwierdzenia(attendedAt) : kurs.status === "completed" ? "Nagranie obejrzane." : null,
    adresStreamu: adresStreamu(kurs.stream_url),
    obecnosc,
    nagranie,
  };
}
