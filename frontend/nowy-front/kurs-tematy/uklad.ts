import type { AdminLesson } from "@/lib/h08/types";
import type { Topic, UkladTematu } from "@/lib/api/h08-tematy";
import type { TematCourseTree } from "@/design-system/organizmy/CourseTree/CourseTree";

/**
 * Układ kursu po stronie ekranu A-12: kolejność tematów, przydział i kolejność
 * lekcji w tematach oraz tytuły lekcji. Dwa egzemplarze żyją obok siebie —
 * `serwer` (ostatni stan potwierdzony przez API) i `lokalny` (ze zmianami
 * osoby) — i wszystko, co ekran pokazuje jako „niezapisane”, wynika z ich
 * porównania, nie z osobnego licznika.
 */
export interface TematUkladu {
  id: number;
  tytul: string;
  lekcje: number[];
}

export interface Uklad {
  tematy: TematUkladu[];
  tytulyLekcji: Record<number, string>;
}

/** Układ z odpowiedzi API: tematy w kolejności `position`, lekcje w kolejności
 * `lesson_ids` (aneks kontraktu „tematy kursu”, pkt 2). */
export function ukladZSerwera(tematy: Topic[], lekcje: AdminLesson[]): Uklad {
  const tytulyLekcji: Record<number, string> = {};
  for (const lekcja of lekcje) tytulyLekcji[lekcja.id] = lekcja.title;
  return {
    tematy: [...tematy]
      .sort((a, b) => a.position - b.position)
      .map((temat) => ({ id: temat.id, tytul: temat.title, lekcje: [...temat.lesson_ids] })),
    tytulyLekcji,
  };
}

/**
 * Przeniesienie lekcji — ten sam kształt co `onPrzenies` organizmu
 * `CourseTree`: `docelowyIndeks` to pozycja lekcji w temacie docelowym PO
 * przeniesieniu (przeciąganie i strzałki podają ją tak samo).
 */
export function przeniesLekcje(
  uklad: Uklad,
  zTematu: number,
  lekcja: number,
  doTematu: number,
  docelowyIndeks: number,
): Uklad {
  const tematy = uklad.tematy.map((temat) => ({ ...temat, lekcje: [...temat.lekcje] }));
  const zrodlo = tematy.find((temat) => temat.id === zTematu);
  const cel = tematy.find((temat) => temat.id === doTematu);
  if (!zrodlo || !cel || !zrodlo.lekcje.includes(lekcja)) return uklad;

  zrodlo.lekcje = zrodlo.lekcje.filter((id) => id !== lekcja);
  const indeks = Math.max(0, Math.min(docelowyIndeks, cel.lekcje.length));
  cel.lekcje.splice(indeks, 0, lekcja);
  return { ...uklad, tematy };
}

export function zmienTytulLekcji(uklad: Uklad, lekcja: number, tytul: string): Uklad {
  return { ...uklad, tytulyLekcji: { ...uklad.tytulyLekcji, [lekcja]: tytul } };
}

/** Ciało `PATCH …/topics/reorder`: pełna permutacja tematów i — w sumie
 * `lesson_ids` — pełna permutacja lekcji kursu, w jednym żądaniu. */
export function cialoUkladu(uklad: Uklad): UkladTematu[] {
  return uklad.tematy.map((temat) => ({ id: temat.id, lesson_ids: [...temat.lekcje] }));
}

function pozycje(uklad: Uklad): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const temat of uklad.tematy) {
    temat.lekcje.forEach((lekcja, indeks) => mapa.set(lekcja, `${temat.id}:${indeks}`));
  }
  return mapa;
}

/** Czy kolejność lub przydział lekcji do tematów różni się od serwera. */
export function kolejnoscZmieniona(serwer: Uklad, lokalny: Uklad): boolean {
  return JSON.stringify(cialoUkladu(serwer)) !== JSON.stringify(cialoUkladu(lokalny));
}

/** Tytuły lekcji zmienione lokalnie względem serwera. */
export function tytulyDoZapisu(serwer: Uklad, lokalny: Uklad): { id: number; title: string }[] {
  return Object.entries(lokalny.tytulyLekcji)
    .map(([id, title]) => ({ id: Number(id), title }))
    .filter(({ id, title }) => serwer.tytulyLekcji[id] !== title);
}

/** Lekcje oznaczone w drzewie kropką „niezapisana zmiana”. */
export function zmienioneLekcje(serwer: Uklad, lokalny: Uklad): Set<number> {
  const przed = pozycje(serwer);
  const po = pozycje(lokalny);
  const wynik = new Set<number>();
  for (const [lekcja, miejsce] of po) {
    if (przed.get(lekcja) !== miejsce) wynik.add(lekcja);
  }
  for (const { id } of tytulyDoZapisu(serwer, lokalny)) wynik.add(id);
  return wynik;
}

/** Dane dla `CourseTree` (O12): identyfikatory jako tekst, czas w minutach. */
export function tematyDrzewa(
  serwer: Uklad,
  lokalny: Uklad,
  lekcje: AdminLesson[],
): TematCourseTree[] {
  const czasy = new Map(lekcje.map((lekcja) => [lekcja.id, lekcja.duration_seconds]));
  const zmienione = zmienioneLekcje(serwer, lokalny);
  return lokalny.tematy.map((temat) => ({
    id: String(temat.id),
    tytul: temat.tytul,
    lekcje: temat.lekcje.map((lekcja) => ({
      id: String(lekcja),
      tytul: lokalny.tytulyLekcji[lekcja] ?? `Lekcja ${lekcja}`,
      czasMin: Math.round((czasy.get(lekcja) ?? 0) / 60),
      zmieniona: zmienione.has(lekcja),
    })),
  }));
}

/** Nowy temat z serwera dopisany na koniec układu (kontrakt: „nowy temat
 * trafia na koniec kursu”). */
export function dopiszTemat(uklad: Uklad, temat: Topic): Uklad {
  return {
    ...uklad,
    tematy: [...uklad.tematy, { id: temat.id, tytul: temat.title, lekcje: [...temat.lesson_ids] }],
  };
}

export function zmienTytulTematu(uklad: Uklad, idTematu: number, tytul: string): Uklad {
  return {
    ...uklad,
    tematy: uklad.tematy.map((temat) => (temat.id === idTematu ? { ...temat, tytul } : temat)),
  };
}

/**
 * Temat usunięty przez serwer znika z układu. Serwer usuwa wyłącznie temat bez
 * żywych lekcji; gdy lokalnie (przed zapisem) przeniesiono do niego lekcje,
 * wracają one na koniec pierwszego pozostałego tematu, żeby żadna nie zniknęła
 * z niezapisanego układu.
 */
export function usunTematZUkladu(uklad: Uklad, idTematu: number): Uklad {
  const usuwany = uklad.tematy.find((temat) => temat.id === idTematu);
  const pozostale = uklad.tematy
    .filter((temat) => temat.id !== idTematu)
    .map((temat) => ({ ...temat, lekcje: [...temat.lekcje] }));
  if (usuwany && usuwany.lekcje.length > 0 && pozostale.length > 0) {
    pozostale[0].lekcje.push(...usuwany.lekcje);
  }
  return { ...uklad, tematy: pozostale };
}

/**
 * Lekcja założona przez serwer wchodzi na koniec swojego tematu (`topic_id`
 * z odpowiedzi); bez tematu w układzie — na koniec ostatniego tematu, tak jak
 * robi to serwer (aneks kontraktu „tematy kursu”, pkt 3).
 */
export function dopiszLekcje(uklad: Uklad, lekcja: { id: number; title: string; topic_id: number | null }): Uklad {
  if (uklad.tematy.length === 0) return uklad;
  const cel = uklad.tematy.some((temat) => temat.id === lekcja.topic_id)
    ? lekcja.topic_id
    : uklad.tematy[uklad.tematy.length - 1].id;
  return {
    tematy: uklad.tematy.map((temat) =>
      temat.id === cel ? { ...temat, lekcje: [...temat.lekcje.filter((id) => id !== lekcja.id), lekcja.id] } : temat,
    ),
    tytulyLekcji: { ...uklad.tytulyLekcji, [lekcja.id]: lekcja.title },
  };
}

/** Lekcja usunięta przez serwer znika z każdego tematu i z tytułów. */
export function usunLekcjeZUkladu(uklad: Uklad, idLekcji: number): Uklad {
  const tytulyLekcji = { ...uklad.tytulyLekcji };
  delete tytulyLekcji[idLekcji];
  return {
    tematy: uklad.tematy.map((temat) => ({ ...temat, lekcje: temat.lekcje.filter((id) => id !== idLekcji) })),
    tytulyLekcji,
  };
}
