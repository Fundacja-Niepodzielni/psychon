import type { LekcjaKursuPlikow, PlikKursu } from "./dane";

export interface GrupaPlikow {
  klucz: string;
  lekcja: { id: number; numer: number; tytul: string };
  pliki: PlikKursu[];
}

/**
 * Układ listy „Pliki do pobrania” kursu: jedna grupa na lekcję, w kolejności
 * `sequence_order` (przy równych wartościach — według `id`). Pliki są tylko
 * w lekcjach: plik bez lekcji (`lesson_id: null`) i plik wskazujący lekcję,
 * której nie ma w kursie, nie trafiają do żadnej grupy. Numer lekcji to jej
 * miejsce w całym kursie (od 1), liczone także dla lekcji bez plików, więc
 * numery nie mają dziur. Pliki w grupie zostają w kolejności z odpowiedzi.
 * Lekcje bez plików grup nie dostają.
 */
export function grupujPliki(lekcje: LekcjaKursuPlikow[], pliki: PlikKursu[]): GrupaPlikow[] {
  const poKolei = lekcje.slice().sort((a, b) => a.sequence_order - b.sequence_order || a.id - b.id);

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
  return grupy;
}
