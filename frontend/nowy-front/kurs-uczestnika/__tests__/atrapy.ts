import type { KursUczestnika, LekcjaKursu } from "../dane";

/**
 * Atrapa odczytu kursu odpowiadająca danym zatwierdzonego szkicu strony kursu:
 * siedem lekcji w dwóch tematach („Kryzys i jego przebieg” — 4, „Rozmowa
 * wspierająca” — 3), razem około dwóch godzin. Dane przykładowe, bez prawdziwych
 * osób.
 *
 * Dwa rodzaje atrap: `odpowiedzSerwera` niesie komplet pól tak, jak je zwraca
 * zaplecze („lekcje po kolei”), a `kursSzkicu` składa odpowiedź po kawałku —
 * także taką, w której pól nie ma (starsze zaplecze), dlatego jej wynik jest
 * typowany jak pełna odpowiedź przez rzutowanie.
 */

export const TYTULY_LEKCJI = [
  "Czym jest kryzys psychiczny",
  "Fazy kryzysu",
  "Rozpoznawanie kryzysu psychicznego",
  "Rozmowa, która nie ocenia",
  "Schemat rozmowy w kryzysie",
  "Kiedy i jak wezwać pomoc",
  "Dbanie o siebie po rozmowie",
] as const;

/** Czasy w sekundach; szósta lekcja jest do czytania, więc bez czasu nagrania. */
const CZASY = [840, 1080, 1200, 960, 720, null, 600];

/**
 * Pola postępu lekcji dodawane przez zaplecze osobną zmianą. Czas potrzebny to
 * 80% nagrania (lekcja do czytania: 8 min). `wTrakcieNr` (1-based) to lekcja
 * z czasem aktywnym 12 z 16 potrzebnych minut — jak w szkicu.
 */
function polaPostepu(indeks: number, ukonczone: number, wTrakcieNr: number | null): Pick<LekcjaKursu, "active_seconds" | "required_active_seconds" | "has_recording"> {
  const wymagane = CZASY[indeks] === null ? 480 : Math.round((CZASY[indeks] as number) * 0.8);
  const aktywne = indeks < ukonczone ? wymagane : wTrakcieNr === indeks + 1 ? 720 : 0;
  return { active_seconds: aktywne, required_active_seconds: wymagane, has_recording: CZASY[indeks] !== null };
}

/**
 * Lekcje szkicu; pierwsze `ukonczone` mają `is_completed`. `zamknieteOd` dodaje
 * `locked` lekcjom od tej pozycji (1-based). `nowePola` dodaje pola postępu
 * (`active_seconds`, `required_active_seconds`, `has_recording`); `wTrakcieNr`
 * wskazuje lekcję z czasem aktywnym (tylko z `nowePola`).
 */
export function lekcjeSzkicu(ukonczone: number, zamknieteOd: number | null = null, nowePola = false, wTrakcieNr: number | null = null): LekcjaKursu[] {
  return TYTULY_LEKCJI.map((tytul, indeks) => ({
    id: 21 + indeks,
    title: tytul,
    sequence_order: indeks + 1,
    duration_seconds: CZASY[indeks],
    is_completed: indeks < ukonczone,
    topic_id: indeks < 4 ? 7 : 8,
    ...(zamknieteOd !== null ? { locked: indeks + 1 >= zamknieteOd } : {}),
    ...(nowePola ? polaPostepu(indeks, ukonczone, wTrakcieNr) : {}),
  })) as LekcjaKursu[];
}

export interface OpcjeKursu {
  ukonczone: number;
  /** Numer pierwszej lekcji zamkniętej (pole `locked`); `null` = pola `locked` nie ma w odczycie. */
  zamknieteOd?: number | null;
  testZamkniety?: boolean;
  status?: KursUczestnika["status"];
  /** Pola postępu lekcji w odczycie (patrz `lekcjeSzkicu`). */
  nowePola?: boolean;
  /** Lekcja (1-based) z czasem aktywnym; wymaga `nowePola`. */
  wTrakcieNr?: number | null;
  /** Pole `test_passed` w odczycie. */
  testZaliczony?: boolean;
}

export function kursSzkicu({ ukonczone, zamknieteOd = null, testZamkniety, status, nowePola = false, wTrakcieNr = null, testZaliczony }: OpcjeKursu): KursUczestnika {
  return {
    id: 2,
    slug: "pierwsza-pomoc-psychologiczna",
    title: "Pierwsza pomoc psychologiczna",
    status: status ?? "in_progress",
    progress_percent: Math.round((ukonczone / TYTULY_LEKCJI.length) * 100),
    topics: [
      { id: 7, title: "Kryzys i jego przebieg", position: 1 },
      { id: 8, title: "Rozmowa wspierająca", position: 2 },
    ],
    lessons: lekcjeSzkicu(ukonczone, zamknieteOd, nowePola, wTrakcieNr),
    ...(testZamkniety !== undefined ? { test_locked: testZamkniety } : {}),
    ...(testZaliczony !== undefined ? { test_passed: testZaliczony } : {}),
  } as KursUczestnika;
}

export interface OpcjeOdpowiedziSerwera {
  /** Ile pierwszych lekcji jest ukończonych. */
  ukonczone: number;
  /** Lekcja (1-based) z czasem aktywnym 12 z 16 potrzebnych minut; domyślnie pierwsza nieukończona lekcja nie ma postępu. */
  wTrakcieNr?: number | null;
  /** Reguła „lekcje po kolei”: lekcje za pierwszą nieukończoną są zamknięte (dla personelu — `false`). */
  zamykajZaNastepna?: boolean;
  /** Nadpisanie pól kursu, które serwer rozstrzyga sam. */
  kurs?: Partial<Pick<KursUczestnika, "test_locked" | "test_passed" | "has_test" | "status">>;
}

/**
 * Odpowiedź w kształcie `CourseDetailResource` z kompletem pól „lekcje po kolei”:
 * `locked`, `active_seconds`, `required_active_seconds`, `has_recording` przy każdej
 * lekcji oraz `test_locked`, `test_passed`, `has_test` przy kursie. Wartości liczy
 * tu atrapa tak, jak zaplecze (zamknięta jest lekcja za pierwszą nieukończoną;
 * test zamknięty, dopóki nie wszystkie lekcje ukończone).
 */
export function odpowiedzSerwera({ ukonczone, wTrakcieNr = null, zamykajZaNastepna = true, kurs }: OpcjeOdpowiedziSerwera): KursUczestnika {
  const razem = TYTULY_LEKCJI.length;
  const lekcje: LekcjaKursu[] = TYTULY_LEKCJI.map((tytul, indeks) => ({
    id: 21 + indeks,
    title: tytul,
    sequence_order: indeks + 1,
    duration_seconds: CZASY[indeks],
    is_completed: indeks < ukonczone,
    topic_id: indeks < 4 ? 7 : 8,
    locked: zamykajZaNastepna && indeks > ukonczone,
    ...polaPostepu(indeks, ukonczone, wTrakcieNr),
  }));
  return {
    id: 2,
    slug: "pierwsza-pomoc-psychologiczna",
    title: "Pierwsza pomoc psychologiczna",
    status: ukonczone >= razem && kurs?.test_passed === true ? "completed" : "in_progress",
    progress_percent: Math.round((ukonczone / razem) * 100),
    has_test: true,
    test_locked: ukonczone < razem,
    test_passed: false,
    topics: [
      { id: 7, title: "Kryzys i jego przebieg", position: 1 },
      { id: 8, title: "Rozmowa wspierająca", position: 2 },
    ],
    lessons: lekcje,
    ...kurs,
  };
}

/** Cztery stany szkicu: dane wejściowe i to, co `pomiar.json` zapisał jako przycisk główny i zdanie obok. */
export const STANY_SZKICU = [
  { n: 1, nazwa: "nierozpoczety", opcje: { ukonczone: 0, zamknieteOd: 2 }, primaryText: "Rozpocznij lekcję 1", powod: "„Czym jest kryzys psychiczny”", podglad: false },
  { n: 2, nazwa: "w-toku", opcje: { ukonczone: 2, zamknieteOd: 4 }, primaryText: "Kontynuuj lekcję 3", powod: "„Rozpoznawanie kryzysu psychicznego”", podglad: false },
  { n: 3, nazwa: "zostal-test", opcje: { ukonczone: 7 }, primaryText: "Przejdź do testu", powod: "Wszystkie lekcje ukończone. Został test.", podglad: false },
  { n: 4, nazwa: "podglad", opcje: { ukonczone: 2, zamknieteOd: 4 }, primaryText: "Kontynuuj lekcję 3", powod: "„Rozpoznawanie kryzysu psychicznego”", podglad: true },
] as const;
