import type { AdminCourse } from "@/lib/h08/types";
import type { LekcjaAdmin, StanNagrania } from "@/nowy-front/lekcja-edycja/dane";
import { checklistaPublikacji } from "@/nowy-front/kurs-publikacja/dane";
import { odmien } from "@/nowy-front/wspolne/odmiana";

/**
 * Stan publikacji kursu w jednym miejscu. Ekran nie liczy braków sam: karta
 * „Publikacja”, wąski pas, wiersze lekcji i plakietka zwiniętego tematu
 * czytają wynik funkcji z tego pliku. Gdy serwer zacznie podawać gotowość
 * kursu, zmienia się wyłącznie ten plik.
 */

export type StanLekcji = "gotowa" | "przetwarzanie" | "blad-nagrania" | "pusta";

export const ETYKIETY_STANU_LEKCJI: Record<StanLekcji, string> = {
  gotowa: "Gotowa",
  przetwarzanie: "Nagranie: przetwarzanie",
  "blad-nagrania": "Nagranie: błąd",
  pusta: "Brak nagrania i treści",
};

/** Stan nagrania lekcji z odpowiedzi serwera; brak wpisu = serwer nie odpowiedział. */
export type StanyNagran = Record<number, StanNagrania["status"] | undefined>;

/**
 * Stan jednej lekcji. Nagranie w przetwarzaniu albo z błędem rozpoznaje
 * wyłącznie odpowiedź serwera o nagraniu; bez niej lekcja z identyfikatorem
 * nagrania liczy się jak dotąd — jako lekcja z nagraniem.
 */
export function stanLekcji(
  lekcja: Pick<LekcjaAdmin, "video_provider_id" | "content">,
  nagranie: StanNagrania["status"] | undefined,
): StanLekcji {
  if (lekcja.video_provider_id) {
    if (nagranie === "processing") return "przetwarzanie";
    if (nagranie === "error") return "blad-nagrania";
    return "gotowa";
  }
  return lekcja.content && lekcja.content.trim() !== "" ? "gotowa" : "pusta";
}

/** Czy lekcja w tym stanie wymaga czynności osoby (czekanie nią nie jest). */
export function wymagaUwagi(stan: StanLekcji): boolean {
  return stan === "blad-nagrania" || stan === "pusta";
}

export interface PozycjaPublikacji {
  id: string;
  tekst: string;
  /** Miejsce, w którym brak się naprawia. */
  href?: string;
}

export interface StanPublikacji {
  doZrobienia: PozycjaPublikacji[];
  czekamy: PozycjaPublikacji[];
  gotowe: string[];
}

export const KOTWICA_DRZEWA = "tematy-i-lekcje";
export const KOTWICA_DANYCH_KURSU = "ustawienia-dane";

interface DaneStanuPublikacji {
  kurs: AdminCourse;
  /** Lekcje w kolejności ekranu — numer lekcji to jej miejsce na tej liście. */
  lekcje: LekcjaAdmin[];
  nagrania: StanyNagran;
  /** Adres strony lekcji albo `null`, gdy strona lekcji jest niedostępna. */
  adresLekcji: (idLekcji: number) => string | null;
}

/**
 * Opis i obecność lekcji pochodzą z tej samej reguły co dotąd
 * (`checklistaPublikacji`); stan lekcji z `stanLekcji`.
 */
export function stanPublikacji({ kurs, lekcje, nagrania, adresLekcji }: DaneStanuPublikacji): StanPublikacji {
  const dotychczasowe = checklistaPublikacji({ kurs: { ...kurs, lessons_count: lekcje.length }, lekcje });
  const doZrobienia: PozycjaPublikacji[] = [];
  const czekamy: PozycjaPublikacji[] = [];
  const gotowe: string[] = ["tytuł"];

  if (dotychczasowe.braki.some((brak) => brak.id === "opis")) {
    doZrobienia.push({ id: "opis", tekst: "Kurs nie ma opisu.", href: `#${KOTWICA_DANYCH_KURSU}` });
  } else {
    gotowe.push("opis");
  }
  if (dotychczasowe.braki.some((brak) => brak.id === "lekcje")) {
    doZrobienia.push({ id: "lekcje", tekst: "Kurs nie ma jeszcze lekcji.", href: `#${KOTWICA_DRZEWA}` });
  }

  let gotoweLekcje = 0;
  lekcje.forEach((lekcja, indeks) => {
    const numer = indeks + 1;
    const stan = stanLekcji(lekcja, nagrania[lekcja.id]);
    const href = adresLekcji(lekcja.id) ?? `#${KOTWICA_DRZEWA}`;
    if (stan === "gotowa") gotoweLekcje += 1;
    if (stan === "pusta") {
      doZrobienia.push({ id: `lekcja-${lekcja.id}`, tekst: `Lekcja ${numer}: brak nagrania i treści.`, href });
    }
    if (stan === "blad-nagrania") {
      doZrobienia.push({ id: `lekcja-${lekcja.id}`, tekst: `Lekcja ${numer}: błąd nagrania.`, href });
    }
    if (stan === "przetwarzanie") {
      czekamy.push({
        id: `lekcja-${lekcja.id}`,
        tekst: `Lekcja ${numer}: nagranie się przetwarza, zwykle 10–30 minut.`,
      });
    }
  });
  if (gotoweLekcje > 0) {
    gotowe.push(`${gotoweLekcje} ${odmien(gotoweLekcje, "lekcja", "lekcje", "lekcji")}`);
  }

  return { doZrobienia, czekamy, gotowe };
}

/** „do zrobienia 1 rzecz” — skrót stanu w wąskim pasie. */
export function zdanieDoZrobienia(liczba: number): string {
  return `do zrobienia ${liczba} ${odmien(liczba, "rzecz", "rzeczy", "rzeczy")}`;
}
