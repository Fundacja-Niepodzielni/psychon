import type { LekcjaKursuPlikow, PlikKursu } from "./dane";

export interface GrupaPlikow {
  klucz: string;
  /** Lekcja grupy; `null` dla grupy „Pliki kursu” (pliki bez lekcji). */
  lekcja: { id: number; numer: number; tytul: string } | null;
  pliki: PlikKursu[];
}

/**
 * Układ listy „Pliki do pobrania” kursu: jedna grupa na lekcję, w kolejności
 * `sequence_order` (przy równych wartościach — według `id`), a na końcu grupa
 * „Pliki kursu” z plikami bez lekcji. Numer lekcji to jej miejsce w całym
 * kursie (od 1), liczone także dla lekcji bez plików, więc numery nie mają
 * dziur. Pliki w grupie zostają w kolejności z odpowiedzi. Lekcje bez plików
 * grup nie dostają. Plik wskazujący lekcję, której nie ma w kursie, nie znika:
 * trafia do grupy „Pliki kursu”.
 */
export function grupujPliki(lekcje: LekcjaKursuPlikow[], pliki: PlikKursu[]): GrupaPlikow[] {
  const poKolei = lekcje.slice().sort((a, b) => a.sequence_order - b.sequence_order || a.id - b.id);
  const znane = new Set(poKolei.map((lekcja) => lekcja.id));

  const grupy: GrupaPlikow[] = [];
  poKolei.forEach((lekcja, indeks) => {
    const swoje = pliki.filter((plik) => plik.lesson_id === lekcja.id);
    if (swoje.length === 0) return;
    grupy.push({
      klucz: `lekcja-${lekcja.id}`,
      lekcja: { id: lekcja.id, numer: indeks + 1, tytul: lekcja.title },
      pliki: swoje,
    });
  });

  const kursowe = pliki.filter((plik) => plik.lesson_id === null || !znane.has(plik.lesson_id));
  if (kursowe.length > 0) grupy.push({ klucz: "kurs", lekcja: null, pliki: kursowe });
  return grupy;
}
