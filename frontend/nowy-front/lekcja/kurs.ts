import { api } from "@/lib/api/klient";
import { sciezka } from "@/lib/api/sciezka";
import type { PlikKursu } from "@/nowy-front/pliki-kursu/dane";

/**
 * Odczyt kursu potrzebny ekranowi lekcji (`GET /courses/{slug}`, kontrakt „Kursy
 * (H05)” i aneksy „Tematy kursu”, „Pliki lekcji”): tematy, płaska lista lekcji z
 * `topic_id` i `is_completed`, pliki z `mime` i `has_test`. Pola dodane później
 * (`mime`, `has_test`) mogą w odpowiedzi sprzed zmiany zaplecza nie występować —
 * wtedy element, który z nich korzysta, znika albo pokazuje stan neutralny.
 */
export interface LekcjaKursu {
  id: number;
  title: string;
  sequence_order: number;
  duration_seconds: number;
  is_completed: boolean;
  topic_id: number | null;
}

export interface TematKursu {
  id: number;
  title: string;
  position: number;
}

/** Plik kursu z odczytu: pola `PlikKursu` i rodzaj z `mime`. */
export interface PlikZMime extends PlikKursu {
  mime?: string | null;
}

export interface OdczytKursu {
  slug: string;
  topics: TematKursu[];
  lessons: LekcjaKursu[];
  materials: PlikZMime[];
  /** `true` tylko gdy zaplecze to potwierdziło; brak pola = nie wiadomo, czyli bez „Przejdź do testu”. */
  has_test: boolean;
}

/** Lekcja z odczytu z polami uzupełnionymi, gdy zaplecze ich nie niesie (stan neutralny: bez tematu, bez czasu, nieukończona). */
function lekcjaZOdczytu(lekcja: Partial<LekcjaKursu> & Pick<LekcjaKursu, "id" | "title" | "sequence_order">): LekcjaKursu {
  return {
    id: lekcja.id,
    title: lekcja.title,
    sequence_order: lekcja.sequence_order,
    duration_seconds: typeof lekcja.duration_seconds === "number" ? lekcja.duration_seconds : 0,
    is_completed: lekcja.is_completed === true,
    topic_id: typeof lekcja.topic_id === "number" ? lekcja.topic_id : null,
  };
}

/** Odczyt kursu albo `null` (kurs zablokowany, nieznany, błąd sieci): ekran lekcji działa dalej bez kontekstu kursu. */
export async function pobierzOdczytKursu(slug: string): Promise<OdczytKursu | null> {
  try {
    const kurs = await api<Partial<OdczytKursu> | null>(sciezka`/courses/${slug}`);
    return {
      slug,
      topics: Array.isArray(kurs?.topics) ? kurs.topics : [],
      lessons: Array.isArray(kurs?.lessons) ? kurs.lessons.map(lekcjaZOdczytu) : [],
      materials: Array.isArray(kurs?.materials) ? kurs.materials : [],
      has_test: kurs?.has_test === true,
    };
  } catch {
    return null;
  }
}

/** Pliki jednej lekcji z odczytu kursu; `null`, gdy lekcji nie ma w tym kursie. */
export function plikiLekcji(odczyt: OdczytKursu, idLekcji: number): PlikZMime[] | null {
  if (!odczyt.lessons.some((lekcja) => lekcja.id === idLekcji)) return null;
  return odczyt.materials.filter((plik) => plik.lesson_id === idLekcji);
}

/** Numer lekcji w kolejności całego kursu (od 1, wg `sequence_order`); `null`, gdy odczyt kursu jej nie zawiera. */
export function numerLekcjiWKursie(odczyt: OdczytKursu, idLekcji: number): number | null {
  const wszystkie = [...odczyt.lessons].sort((a, b) => a.sequence_order - b.sequence_order);
  const indeks = wszystkie.findIndex((lekcja) => lekcja.id === idLekcji);
  return indeks < 0 ? null : indeks + 1;
}

/** Lekcja kursu razem z jej numerem w temacie (liczonym od 1 na liście przefiltrowanej po temacie). */
export interface LekcjaWTemacie {
  lekcja: LekcjaKursu;
  numer: number;
}

/** Co ekran wie o miejscu lekcji w kursie — wszystko liczone z odczytu kursu, nic z zaplecza „obok”. */
export interface KontekstKursu {
  /** Temat bieżącej lekcji; `null`, gdy lekcja nie ma tematu. */
  temat: {
    id: number;
    tytul: string;
    razem: number;
    ukonczone: number;
    /** Numer bieżącej lekcji w temacie (od 1). */
    numerBiezacej: number;
    /** Dla każdej lekcji tematu: czy ukończona (bieżąca zgodnie ze stanem lokalnym). */
    segmenty: { id: number; ukonczona: boolean; biezaca: boolean }[];
  } | null;
  /** Następna lekcja w kolejności kursu; `null` przy ostatniej lekcji kursu. */
  nastepna: {
    id: number;
    tytul: string;
    /** Numer w jej temacie (od 1), `null` gdy lekcja nie ma tematu. */
    numer: number | null;
    czasSekund: number;
    /** Tytuł następnego tematu, gdy następna lekcja leży w innym temacie niż bieżąca. */
    nowyTemat: string | null;
  } | null;
  ostatniaWTemacie: boolean;
  ostatniaWKursie: boolean;
}

function lekcjeTematu(lekcje: LekcjaKursu[], idTematu: number | null): LekcjaKursu[] {
  return lekcje.filter((lekcja) => lekcja.topic_id === idTematu);
}

/**
 * Kontekst bieżącej lekcji. Lekcje w kolejności `sequence_order` (płaska lista
 * jest już spłaszczona: najpierw kolejność tematów, potem lekcji w temacie);
 * lekcje tematu = ta lista przefiltrowana po `topic_id`, numer w temacie = miejsce
 * na niej. `ukonczonaTeraz` to lokalny stan bieżącej lekcji (po ukończeniu bez
 * ponownego odczytu lekcji ani kursu). `null`, gdy odczyt kursu nie zawiera lekcji.
 */
export function kontekstKursu(odczyt: OdczytKursu, idLekcji: number, ukonczonaTeraz: boolean): KontekstKursu | null {
  const wszystkie = [...odczyt.lessons].sort((a, b) => a.sequence_order - b.sequence_order);
  const indeks = wszystkie.findIndex((lekcja) => lekcja.id === idLekcji);
  if (indeks < 0) return null;
  const biezaca = wszystkie[indeks];
  const czyUkonczona = (lekcja: LekcjaKursu) => (lekcja.id === idLekcji ? ukonczonaTeraz || lekcja.is_completed : lekcja.is_completed);

  let temat: KontekstKursu["temat"] = null;
  let ostatniaWTemacie = false;
  if (biezaca.topic_id !== null) {
    const wTemacie = lekcjeTematu(wszystkie, biezaca.topic_id);
    const miejsce = wTemacie.findIndex((lekcja) => lekcja.id === idLekcji);
    const nazwa = odczyt.topics.find((t) => t.id === biezaca.topic_id)?.title;
    temat = {
      id: biezaca.topic_id,
      tytul: nazwa ?? "",
      razem: wTemacie.length,
      ukonczone: wTemacie.filter(czyUkonczona).length,
      numerBiezacej: miejsce + 1,
      segmenty: wTemacie.map((lekcja) => ({ id: lekcja.id, ukonczona: czyUkonczona(lekcja), biezaca: lekcja.id === idLekcji })),
    };
    ostatniaWTemacie = miejsce === wTemacie.length - 1;
  }

  const kolejna = wszystkie[indeks + 1] ?? null;
  let nastepna: KontekstKursu["nastepna"] = null;
  if (kolejna !== null) {
    const numer = kolejna.topic_id === null ? null : lekcjeTematu(wszystkie, kolejna.topic_id).findIndex((l) => l.id === kolejna.id) + 1;
    const innyTemat = kolejna.topic_id !== biezaca.topic_id && kolejna.topic_id !== null;
    nastepna = {
      id: kolejna.id,
      tytul: kolejna.title,
      numer,
      czasSekund: kolejna.duration_seconds,
      nowyTemat: innyTemat ? (odczyt.topics.find((t) => t.id === kolejna.topic_id)?.title ?? null) : null,
    };
  }

  return { temat, nastepna, ostatniaWTemacie: ostatniaWTemacie && temat !== null, ostatniaWKursie: kolejna === null };
}
