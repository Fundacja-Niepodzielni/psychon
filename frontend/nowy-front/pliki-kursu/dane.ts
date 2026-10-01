import { api, ApiError } from "@/lib/api/klient";
import { downloadFile } from "@/lib/api/pliki";
import { sciezka } from "@/lib/api/sciezka";

/**
 * Pliki kursu w odczycie `GET /courses/{slug}` (kontrakt, „Kursy (H05)” i aneks
 * „Tematy kursu”): każdy element niesie `id`, `name`, `size`, `lesson_id`
 * (liczba dla pliku lekcji, `null` dla pliku całego kursu) i podpisany,
 * wygasający `download_url`.
 */
export interface PlikKursu {
  id: number;
  name: string;
  size: number | null;
  lesson_id: number | null;
  download_url: string;
}

/** Lekcja kursu w tym samym odczycie — tyle, ile potrzeba do grupowania plików. */
export interface LekcjaKursuPlikow {
  id: number;
  title: string;
  sequence_order: number;
}

export interface KursZPlikami {
  lessons: LekcjaKursuPlikow[];
  materials: PlikKursu[];
}

/** Odczyt kursu: lekcje i pliki. Rzuca przy błędzie (403 `course_locked`, 404, sieć). */
export async function pobierzKursZPlikami(slug: string): Promise<KursZPlikami> {
  const kurs = await api<Partial<KursZPlikami>>(sciezka`/courses/${slug}`);
  return { lessons: kurs.lessons ?? [], materials: kurs.materials ?? [] };
}

/**
 * Pliki jednej lekcji z odczytu kursu. `null`, gdy się nie da: kurs zablokowany,
 * nieznany albo niedostępny, błąd sieci, albo lekcji nie ma w tym kursie —
 * ekran lekcji nie ma wtedy nic do pokazania i nie zgłasza błędu.
 */
export async function pobierzPlikiLekcji(slugKursu: string, idLekcji: number): Promise<PlikKursu[] | null> {
  try {
    const kurs = await pobierzKursZPlikami(slugKursu);
    if (!kurs.lessons.some((lekcja) => lekcja.id === idLekcji)) return null;
    return kurs.materials.filter((plik) => plik.lesson_id === idLekcji);
  } catch {
    return null;
  }
}

export type WynikPobrania = "ok" | "blad";

/** Link pobrania wygasł albo podpis przestał być ważny: serwer odpowiada 403 (`link_expired`). */
function czyLinkWygasl(wyjatek: unknown): boolean {
  return wyjatek instanceof ApiError && (wyjatek.status === 403 || wyjatek.status === 410);
}

async function sprobuj(plik: PlikKursu, adres: string): Promise<unknown> {
  try {
    await downloadFile(adres, plik.name);
    return null;
  } catch (wyjatek) {
    return wyjatek ?? new Error("Pobranie nie powiodło się.");
  }
}

/**
 * Pobiera plik. Gdy link wygasł, ponownie pobiera dane kursu (`odswiez`),
 * bierze z nich świeży link do tego samego pliku i próbuje jeszcze raz — jedna
 * ponowna próba, nie pętla. Każda inna porażka kończy się od razu.
 */
export async function pobierzPlik(
  plik: PlikKursu,
  odswiez?: () => Promise<PlikKursu[] | null>,
): Promise<WynikPobrania> {
  const pierwszy = await sprobuj(plik, plik.download_url);
  if (pierwszy === null) return "ok";
  if (!czyLinkWygasl(pierwszy) || !odswiez) return "blad";

  let swiezePliki: PlikKursu[] | null;
  try {
    swiezePliki = await odswiez();
  } catch {
    return "blad";
  }
  const swiezy = swiezePliki?.find((kandydat) => kandydat.id === plik.id);
  if (!swiezy) return "blad";
  return (await sprobuj(swiezy, swiezy.download_url)) === null ? "ok" : "blad";
}
