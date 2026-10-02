import { adresLekcji } from "../lekcja/adres";
import { ADRES_LISTY_KURSOW, adresTestu } from "../kurs-uczestnika/dane";
import { etapySciezki, type KursSciezki, type LekcjaKursu } from "../pulpit/nastepny-krok";

/** Zdanie pod tytułem ekranu — to samo co na starej liście kursów. */
export const OPIS_EKRANU = "Twoja ścieżka szkoleniowa. Kolejny etap otwiera się po ukończeniu poprzedniego.";

/** Adres certyfikatu — cel kroku „Zobacz warunki certyfikatu”, jak na pulpicie. */
const ADRES_CERTYFIKATU = "/panel/certyfikat";

/**
 * Kolejność wierszy: kursy ze ścieżki rosnąco po numerze etapu, a na końcu kursy
 * poza ścieżką (bez numeru) w kolejności z serwera. Pulpit pokazuje tylko ścieżkę,
 * więc kolejność ścieżki jest ta sama.
 */
export function ulozKursy(kursy: readonly KursSciezki[]): KursSciezki[] {
  const zNumerem = kursy
    .filter((kurs) => kurs.sequence_order !== null)
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
  const bezNumeru = kursy.filter((kurs) => kurs.sequence_order === null);
  return [...zNumerem, ...bezNumeru];
}

/** Podlinia wiersza kursu otwartego: „Kurs 2 · 40% ukończone”; kurs poza ścieżką: „Poza ścieżką · 50% ukończone”. */
export function podliniaKursu(kurs: KursSciezki): string {
  const miejsce = kurs.sequence_order === null ? "Poza ścieżką" : `Kurs ${kurs.sequence_order}`;
  return `${miejsce} · ${kurs.progress_percent}% ukończone`;
}

/** Adres strony kursu uczestnika — ten sam, pod którym stoi nowa strona kursu. */
export function adresKursu(slug: string): string {
  return `${ADRES_LISTY_KURSOW}/${slug}`;
}

/** Pierwszy kurs w toku w kolejności wyświetlania. */
export function kursWToku(ulozone: readonly KursSciezki[]): KursSciezki | undefined {
  return ulozone.find((kurs) => kurs.status === "in_progress");
}

/** Szczegóły kursu w toku — potrzebne tylko do wskazania lekcji, do której przycisk wraca. */
export type SzczegolyKursuWToku =
  | { stan: "ladowanie" }
  | { stan: "blad" }
  | { stan: "ok"; lekcje: LekcjaKursu[] }
  | { stan: "brak" };

/** Jedyny zielony przycisk ekranu: dokąd prowadzi i jak się nazywa. */
export type KrokListy =
  | { rodzaj: "lekcja"; kurs: KursSciezki; lekcja: LekcjaKursu }
  | { rodzaj: "test"; kurs: KursSciezki }
  | { rodzaj: "kurs"; kurs: KursSciezki }
  | { rodzaj: "certyfikat" };

function pierwszaNieukonczonaLekcja(lekcje: readonly LekcjaKursu[]): LekcjaKursu | undefined {
  return [...lekcje].sort((a, b) => a.sequence_order - b.sequence_order).find((lekcja) => !lekcja.is_completed);
}

/**
 * Krok dla przycisku głównego — te same reguły co „następny krok” na pulpicie:
 * kurs w toku → jego pierwsza nieukończona lekcja albo test, gdy wszystkie lekcje są
 * ukończone; cała ścieżka ukończona → warunki certyfikatu. Błąd odczytu szczegółów
 * kursu w toku zostawia przycisk „Otwórz kurs”. Brak kroku (ładowanie szczegółów,
 * żaden kurs nie jest w toku) = brak przycisku, a nie przycisk nieaktywny.
 */
export function wyliczKrokListy(ulozone: readonly KursSciezki[], szczegoly: SzczegolyKursuWToku): KrokListy | null {
  const wToku = kursWToku(ulozone);
  if (wToku !== undefined) {
    if (szczegoly.stan === "blad") return { rodzaj: "kurs", kurs: wToku };
    if (szczegoly.stan !== "ok") return null;
    const lekcja = pierwszaNieukonczonaLekcja(szczegoly.lekcje);
    return lekcja ? { rodzaj: "lekcja", kurs: wToku, lekcja } : { rodzaj: "test", kurs: wToku };
  }
  const sciezka = etapySciezki([...ulozone]);
  if (sciezka.length > 0 && sciezka.every((kurs) => kurs.status === "completed")) return { rodzaj: "certyfikat" };
  return null;
}

/** Napis przycisku kroku. */
export function etykietaKroku(krok: KrokListy): string {
  switch (krok.rodzaj) {
    case "lekcja":
      return "Wróć do lekcji";
    case "test":
      return "Przejdź do testu";
    case "kurs":
      return "Otwórz kurs";
    case "certyfikat":
      return "Zobacz warunki certyfikatu";
  }
}

/** Adres, pod który prowadzi przycisk kroku. */
export function adresKroku(krok: KrokListy): string {
  switch (krok.rodzaj) {
    case "lekcja":
      return adresLekcji(krok.lekcja.id, krok.kurs.slug);
    case "test":
      return adresTestu(krok.kurs.slug);
    case "kurs":
      return adresKursu(krok.kurs.slug);
    case "certyfikat":
      return ADRES_CERTYFIKATU;
  }
}
