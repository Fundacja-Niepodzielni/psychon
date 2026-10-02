import { odmien } from "@/nowy-front/wspolne/odmiana";
import { adresLekcji } from "@/nowy-front/lekcja/adres";
import { adresTestu, type KursUczestnika, type LekcjaKursu, type TematKursu } from "./dane";

/**
 * Czysta logika strony kursu uczestnika: grupowanie lekcji w tematy, liczniki,
 * wybór jedynego przycisku głównego i stan karty testu. Wszystko z pól
 * odczytu `GET /courses/{slug}`; pola `locked` i `test_locked`, gdy są,
 * rozstrzygają same — ekran nie liczy reguły kolejności po swojemu.
 */

/** Tytuł grupy lekcji bez tematu (lekcje bez `topic_id` albo z tematem spoza odczytu). */
export const TYTUL_TEMATU_DOMYSLNEGO = "Lekcje kursu";

export interface LekcjaWiersza {
  lekcja: LekcjaKursu;
  /** Numer lekcji w kursie, od 1, w kolejności `sequence_order`. */
  numer: number;
  zamknieta: boolean;
  /** Numer lekcji, po której ukończeniu ta się otworzy; `null` dla pierwszej lekcji. */
  poLekcji: number | null;
  etykieta: "Rozpocznij lekcję" | "Kontynuuj" | "Otwórz ponownie";
  /** Czy to lekcja, na którą prowadzi przycisk główny. */
  nastepna: boolean;
  /** „W trakcie · obejrzane X z Y potrzebnych minut” — gdy odczyt niesie postęp lekcji; inaczej `null`. */
  postep: string | null;
}

export interface TematEkranu {
  /** Klucz grupy: identyfikator tematu albo „domyslny”. */
  klucz: string;
  tytul: string;
  ukonczone: number;
  razem: number;
  wiersze: LekcjaWiersza[];
}

export type AkcjaGlowna =
  | { rodzaj: "lekcja"; etykieta: string; powod: string; href: string }
  | { rodzaj: "test"; etykieta: string; powod: string; href: string }
  | { rodzaj: "brak" };

export interface WidokKursu {
  lekcje: LekcjaKursu[];
  razem: number;
  ukonczone: number;
  wszystkieUkonczone: boolean;
  tematy: TematEkranu[];
  akcja: AkcjaGlowna;
  test: { czynny: boolean; zdanie: string };
  /** Kurs ukończony w całości (lekcje i test), według `status` odczytu. */
  kursUkonczony: boolean;
  /** Test zaliczony: pole `test_passed` odczytu albo kurs ukończony w całości. */
  testZaliczony: boolean;
  /** Indeks (od 0, w kolejności lekcji) lekcji, na którą prowadzi przycisk główny; `-1`, gdy żadna. */
  indeksNastepnej: number;
}

export interface OpcjeWidoku {
  /** Tryb podglądu: wszystkie lekcje otwarte, pole `locked` z odczytu jest ignorowane. */
  podglad?: boolean;
}

/** Lekcje w kolejności `sequence_order` (przy remisie — `id`). */
export function lekcjeWKolejnosci(lekcje: LekcjaKursu[]): LekcjaKursu[] {
  return lekcje.slice().sort((a, b) => a.sequence_order - b.sequence_order || a.id - b.id);
}

/** „około 2 godziny”, „około 40 min” albo `null`, gdy żadna lekcja nie ma czasu. */
export function czasKursu(lekcje: LekcjaKursu[]): string | null {
  const sekundy = lekcje.reduce((suma, lekcja) => suma + Math.max(0, lekcja.duration_seconds ?? 0), 0);
  if (sekundy <= 0) return null;
  const minuty = Math.round(sekundy / 60);
  if (minuty < 60) return `około ${Math.max(1, minuty)} min`;
  const godziny = Math.round(minuty / 60);
  return `około ${godziny} ${odmien(godziny, "godziny", "godziny", "godzin")}`;
}

/** Wiersz opisu pod tytułem: „7 lekcji · około 2 godziny · na końcu test”. */
export function opisKursu(lekcje: LekcjaKursu[]): string {
  const liczba = `${lekcje.length} ${odmien(lekcje.length, "lekcja", "lekcje", "lekcji")}`;
  return [liczba, czasKursu(lekcje), "na końcu test"].filter((czesc): czesc is string => czesc !== null).join(" · ");
}

/** Czas lekcji w wierszu: „14 min nagrania”, dla lekcji bez nagrania „do czytania”; bez czasu — `null`. */
export function czasLekcji(lekcja: LekcjaKursu): string | null {
  if (lekcja.has_recording === false) return "do czytania";
  const sekundy = lekcja.duration_seconds ?? 0;
  if (sekundy <= 0) return null;
  return `${Math.max(1, Math.round(sekundy / 60))} min nagrania`;
}

/** Czy odczyt niesie postęp lekcji nieukończonej: czas aktywny większy od zera i potrzebny czas większy od zera. */
function maPostepLekcji(lekcja: LekcjaKursu): lekcja is LekcjaKursu & { active_seconds: number; required_active_seconds: number } {
  return (
    !lekcja.is_completed &&
    typeof lekcja.active_seconds === "number" &&
    typeof lekcja.required_active_seconds === "number" &&
    lekcja.active_seconds > 0 &&
    lekcja.required_active_seconds > 0
  );
}

/**
 * Linia postępu lekcji: „W trakcie · obejrzane 12 z 16 potrzebnych minut”.
 * Minuty zaokrąglane do najbliższej całej, najmniej 1; obejrzane nie
 * przekraczają potrzebnych. Bez pól postępu albo dla lekcji ukończonej — `null`.
 */
export function liniaPostepuLekcji(lekcja: LekcjaKursu): string | null {
  if (!maPostepLekcji(lekcja)) return null;
  const potrzebne = Math.max(1, Math.round(lekcja.required_active_seconds / 60));
  const obejrzane = Math.min(potrzebne, Math.max(1, Math.round(lekcja.active_seconds / 60)));
  return `W trakcie · obejrzane ${obejrzane} z ${potrzebne} potrzebnych minut`;
}

export function licznikLekcji(ukonczone: number, razem: number): string {
  return `${ukonczone} z ${razem} lekcji`;
}

export function zdaniePostepu(ukonczone: number, razem: number): string {
  return `${ukonczone} z ${razem} lekcji ukończone`;
}

function pogrupuj(tematy: TematKursu[], lekcje: LekcjaKursu[]): { klucz: string; tytul: string; lekcje: LekcjaKursu[] }[] {
  const posortowane = tematy.slice().sort((a, b) => a.position - b.position || a.id - b.id);
  const znane = new Set(posortowane.map((temat) => temat.id));
  const grupy = posortowane.map((temat) => ({
    klucz: String(temat.id),
    tytul: temat.title,
    lekcje: lekcje.filter((lekcja) => lekcja.topic_id === temat.id),
  }));
  const bezTematu = lekcje.filter((lekcja) => lekcja.topic_id === null || !znane.has(lekcja.topic_id));
  if (bezTematu.length > 0) grupy.push({ klucz: "domyslny", tytul: TYTUL_TEMATU_DOMYSLNEGO, lekcje: bezTematu });
  return grupy.filter((grupa) => grupa.lekcje.length > 0);
}

/** Liczy cały widok strony z odczytu kursu. */
export function zbudujWidok(kurs: KursUczestnika, opcje: OpcjeWidoku = {}): WidokKursu {
  const podglad = opcje.podglad === true;
  const zamknietaOdczytem = (lekcja: LekcjaKursu) => !podglad && lekcja.locked === true;
  const lekcje = lekcjeWKolejnosci(kurs.lessons);
  const razem = lekcje.length;
  const ukonczone = lekcje.filter((lekcja) => lekcja.is_completed).length;
  const wszystkieUkonczone = razem > 0 && ukonczone === razem;
  const kursUkonczony = kurs.status === "completed";
  const testZaliczony = kursUkonczony || kurs.test_passed === true;

  // Lekcja, na którą prowadzi przycisk główny: pierwsza nieukończona i otwarta z postępem
  // (czas aktywny większy od zera); bez takiej albo bez pól postępu — pierwsza nieukończona i otwarta.
  const otwarteNieukonczone = lekcje.filter((lekcja) => !lekcja.is_completed && !zamknietaOdczytem(lekcja));
  const rozpoczeta = otwarteNieukonczone.find((lekcja) => (lekcja.active_seconds ?? 0) > 0) ?? null;
  const nastepna = rozpoczeta ?? otwarteNieukonczone[0] ?? null;
  const numerNastepnej = nastepna === null ? null : lekcje.indexOf(nastepna) + 1;
  const kontynuacja = ukonczone > 0 || rozpoczeta !== null;

  const testCzynny = typeof kurs.test_locked === "boolean" ? !kurs.test_locked : wszystkieUkonczone;
  const zostalo = razem - ukonczone;
  const zdanieTestu = testZaliczony
    ? "Test zaliczony."
    : testCzynny
      ? "Możesz już podejść do testu. Po zaliczeniu dostaniesz zaświadczenie."
      : zostalo > 0
        ? `Test odblokuje się, gdy ukończysz wszystkie lekcje. Zostało: ${zostalo}.`
        : "Test jest jeszcze zamknięty.";

  let akcja: AkcjaGlowna = { rodzaj: "brak" };
  if (kursUkonczony || (wszystkieUkonczone && testZaliczony)) {
    akcja = { rodzaj: "brak" };
  } else if (wszystkieUkonczone) {
    akcja = testCzynny
      ? {
          rodzaj: "test",
          etykieta: "Przejdź do testu",
          powod: "Wszystkie lekcje ukończone. Został test.",
          href: adresTestu(kurs.slug),
        }
      : { rodzaj: "brak" };
  } else if (nastepna !== null && numerNastepnej !== null) {
    akcja = {
      rodzaj: "lekcja",
      etykieta: `${kontynuacja ? "Kontynuuj lekcję" : "Rozpocznij lekcję"} ${numerNastepnej}`,
      powod: `„${nastepna.title}”`,
      href: adresLekcji(nastepna.id, kurs.slug),
    };
  }

  const tematy: TematEkranu[] = pogrupuj(kurs.topics ?? [], lekcje).map((grupa) => ({
    klucz: grupa.klucz,
    tytul: grupa.tytul,
    ukonczone: grupa.lekcje.filter((lekcja) => lekcja.is_completed).length,
    razem: grupa.lekcje.length,
    wiersze: grupa.lekcje.map((lekcja): LekcjaWiersza => {
      const numer = lekcje.indexOf(lekcja) + 1;
      const jestNastepna = nastepna !== null && lekcja.id === nastepna.id;
      const zPostepem = (lekcja.active_seconds ?? 0) > 0;
      return {
        lekcja,
        numer,
        zamknieta: zamknietaOdczytem(lekcja) && !lekcja.is_completed,
        poLekcji: numer > 1 ? numer - 1 : null,
        etykieta: lekcja.is_completed
          ? "Otwórz ponownie"
          : (jestNastepna && kontynuacja) || (zPostepem && !zamknietaOdczytem(lekcja))
            ? "Kontynuuj"
            : "Rozpocznij lekcję",
        nastepna: jestNastepna,
        postep: liniaPostepuLekcji(lekcja),
      };
    }),
  }));

  return {
    lekcje,
    razem,
    ukonczone,
    wszystkieUkonczone,
    tematy,
    akcja,
    test: { czynny: testCzynny, zdanie: zdanieTestu },
    kursUkonczony,
    testZaliczony,
    indeksNastepnej: nastepna === null ? -1 : lekcje.indexOf(nastepna),
  };
}
