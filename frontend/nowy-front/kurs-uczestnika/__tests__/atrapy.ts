import type { KursUczestnika, LekcjaKursu } from "../dane";

/**
 * Atrapa odczytu kursu odpowiadająca danym zatwierdzonego szkicu strony kursu:
 * siedem lekcji w dwóch tematach („Kryzys i jego przebieg” — 4, „Rozmowa
 * wspierająca” — 3), razem około dwóch godzin. Dane przykładowe, bez prawdziwych
 * osób.
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

/** Lekcje szkicu; pierwsze `ukonczone` mają `is_completed`. `zamknieteOd` dodaje `locked` lekcjom od tej pozycji (1-based). */
export function lekcjeSzkicu(ukonczone: number, zamknieteOd: number | null = null): LekcjaKursu[] {
  return TYTULY_LEKCJI.map((tytul, indeks) => ({
    id: 21 + indeks,
    title: tytul,
    sequence_order: indeks + 1,
    duration_seconds: CZASY[indeks],
    is_completed: indeks < ukonczone,
    topic_id: indeks < 4 ? 7 : 8,
    ...(zamknieteOd !== null ? { locked: indeks + 1 >= zamknieteOd } : {}),
  }));
}

export interface OpcjeKursu {
  ukonczone: number;
  /** Numer pierwszej lekcji zamkniętej (pole `locked`); `null` = pola `locked` nie ma w odczycie. */
  zamknieteOd?: number | null;
  testZamkniety?: boolean;
  status?: KursUczestnika["status"];
}

export function kursSzkicu({ ukonczone, zamknieteOd = null, testZamkniety, status }: OpcjeKursu): KursUczestnika {
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
    lessons: lekcjeSzkicu(ukonczone, zamknieteOd),
    ...(testZamkniety !== undefined ? { test_locked: testZamkniety } : {}),
  };
}

/** Cztery stany szkicu: dane wejściowe i to, co `pomiar.json` zapisał jako przycisk główny i zdanie obok. */
export const STANY_SZKICU = [
  { n: 1, nazwa: "nierozpoczety", opcje: { ukonczone: 0, zamknieteOd: 2 }, primaryText: "Rozpocznij lekcję 1", powod: "„Czym jest kryzys psychiczny”", podglad: false },
  { n: 2, nazwa: "w-toku", opcje: { ukonczone: 2, zamknieteOd: 4 }, primaryText: "Kontynuuj lekcję 3", powod: "„Rozpoznawanie kryzysu psychicznego”", podglad: false },
  { n: 3, nazwa: "zostal-test", opcje: { ukonczone: 7 }, primaryText: "Przejdź do testu", powod: "Wszystkie lekcje ukończone. Został test.", podglad: false },
  { n: 4, nazwa: "podglad", opcje: { ukonczone: 2, zamknieteOd: 4 }, primaryText: "Kontynuuj lekcję 3", powod: "„Rozpoznawanie kryzysu psychicznego”", podglad: true },
] as const;
