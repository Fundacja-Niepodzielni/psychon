import type { DaneLekcji } from "./dane";
import type { KontekstKursu } from "./kurs";

/** Stan nagrania na ekranie: odtwarzalne, brak, w przygotowaniu albo nie działa. */
export type RodzajNagrania = "jest" | "brak" | "w-przygotowaniu" | "nie-dziala";

/** „Została 1 minuta”, „Zostały 2–4 minuty” (nie 12–14), „Zostało 5 minut” — z „nagrania”. */
export function zdanieZostalo(minuty: number): string {
  if (minuty === 1) return "Została 1 minuta nagrania.";
  const jednosci = minuty % 10;
  const dziesiatki = minuty % 100;
  if (jednosci >= 2 && jednosci <= 4 && !(dziesiatki >= 12 && dziesiatki <= 14)) {
    return `Zostały ${minuty} minuty nagrania.`;
  }
  return `Zostało ${minuty} minut nagrania.`;
}

/** Minuty do pokazania osobie: zaokrąglone, ale nigdy 0 dla dodatniej liczby sekund. */
export function minutyZSekund(sekundy: number): number {
  return sekundy > 0 ? Math.max(1, Math.round(sekundy / 60)) : 0;
}

/**
 * Czas aktywny (s) wymagany do ukończenia. Liczy go serwer
 * (`required_active_seconds` w odczycie lekcji i w odpowiedzi postępu); tylko
 * dla odpowiedzi sprzed tej zmiany ekran zostaje przy progu procentowym.
 */
export function wymaganeSekundy(
  dane: Pick<DaneLekcji, "required_active_seconds" | "duration_seconds" | "completable_at_percent">,
): number {
  if (typeof dane.required_active_seconds === "number" && dane.required_active_seconds >= 0) {
    return dane.required_active_seconds;
  }
  return Math.ceil((dane.duration_seconds * dane.completable_at_percent) / 100);
}

/** „Obejrzane: 12 z 16 potrzebnych minut.” — liczby z czasu aktywnego i wymaganego; pełne minuty, bez przekroczenia wymaganych. */
export function minutyObejrzane(aktywneSekundy: number, wymagane: number): { obejrzane: number; potrzebne: number } {
  const potrzebne = Math.max(1, Math.ceil(wymagane / 60));
  return { obejrzane: Math.min(potrzebne, Math.floor(Math.max(0, aktywneSekundy) / 60)), potrzebne };
}

/** Czas czytania treści w minutach (200 słów na minutę, od 1); `null` bez treści. */
export function czasCzytaniaMinut(tresc: string | null | undefined): number | null {
  if (typeof tresc !== "string") return null;
  const slowa = tresc.match(/\S+/g)?.length ?? 0;
  return slowa === 0 ? null : Math.max(1, Math.ceil(slowa / 200));
}

/** Podtytuł: „20 min nagrania · około 10 min czytania”, bez nagrania samo „około 10 min czytania”. */
export function podtytul(czasNagraniaSekund: number, nagranie: RodzajNagrania, tresc: string | null | undefined): string {
  const czesci: string[] = [];
  if (nagranie !== "brak" && czasNagraniaSekund > 0) czesci.push(`${minutyZSekund(czasNagraniaSekund)} min nagrania`);
  const czytanie = czasCzytaniaMinut(tresc);
  if (czytanie !== null) czesci.push(`około ${czytanie} min czytania`);
  return czesci.join(" · ");
}

/** Dokąd prowadzi przycisk po ukończeniu. */
export type CelPrzycisku =
  | { rodzaj: "ukoncz" }
  | { rodzaj: "lekcja"; id: number }
  | { rodzaj: "test" }
  | { rodzaj: "kurs" };

export interface StanPrzycisku {
  etykieta: string;
  /** Zdanie z powodem — stoi stale obok przycisku. */
  zdanie: string;
  /** `false`: przycisk wygląda na nieczynny (jasny, z kłódką, `aria-disabled`), ale zostaje w kolejności fokusu. */
  czynny: boolean;
  cel: CelPrzycisku;
}

interface WejscieStanu {
  ukonczona: boolean;
  nagranie: RodzajNagrania;
  /** `completable` z odczytu lekcji albo odpowiedzi postępu. */
  mozna: boolean;
  aktywneSekundy: number;
  wymagane: number;
  kontekst: KontekstKursu | null;
  maTest: boolean;
}

function zdanieNastepnej(nastepna: NonNullable<KontekstKursu["nastepna"]>): string {
  const minuty = minutyZSekund(nastepna.czasSekund);
  return `Następna: „${nastepna.tytul}”${minuty > 0 ? ` (${minuty} min)` : ""}.`;
}

/** Przycisk i zdanie z powodem dla lekcji ukończonej: dalej do następnej lekcji, tematu, testu albo do kursu. */
function stanPoUkonczeniu(kontekst: KontekstKursu | null, maTest: boolean): StanPrzycisku {
  if (kontekst === null) {
    return { etykieta: "Wróć do kursu", zdanie: "Lekcja ukończona.", czynny: true, cel: { rodzaj: "kurs" } };
  }
  const { nastepna } = kontekst;
  if (nastepna === null) {
    return maTest
      ? { etykieta: "Przejdź do testu", zdanie: "Wszystkie lekcje ukończone. Został test.", czynny: true, cel: { rodzaj: "test" } }
      : { etykieta: "Wróć do kursu", zdanie: "Wszystkie lekcje ukończone.", czynny: true, cel: { rodzaj: "kurs" } };
  }
  if (kontekst.ostatniaWTemacie && nastepna.nowyTemat !== null) {
    return {
      etykieta: "Przejdź do następnego tematu",
      zdanie: `Temat ukończony. Następny: „${nastepna.nowyTemat}”.`,
      czynny: true,
      cel: { rodzaj: "lekcja", id: nastepna.id },
    };
  }
  return {
    etykieta: nastepna.numer === null ? "Przejdź do następnej lekcji" : `Przejdź do lekcji ${nastepna.numer}`,
    zdanie: zdanieNastepnej(nastepna),
    czynny: true,
    cel: { rodzaj: "lekcja", id: nastepna.id },
  };
}

/**
 * Zielony przycisk i zdanie przy nim — jedna funkcja dla wszystkich stanów
 * ekranu, więc przycisk i powód nie mogą się rozjechać.
 */
export function stanPrzycisku(wejscie: WejscieStanu): StanPrzycisku {
  if (wejscie.ukonczona) return stanPoUkonczeniu(wejscie.kontekst, wejscie.maTest);

  const ukoncz = { rodzaj: "ukoncz" } as const;
  const etykieta = "Oznacz lekcję jako ukończoną";
  if (wejscie.nagranie === "brak") {
    return { etykieta, zdanie: "Przeczytaj lekcję i oznacz ją jako ukończoną.", czynny: true, cel: ukoncz };
  }
  if (wejscie.nagranie === "w-przygotowaniu") {
    return {
      etykieta,
      zdanie: "Nagranie nie jest jeszcze gotowe. Lekcję ukończysz po jego obejrzeniu.",
      czynny: false,
      cel: ukoncz,
    };
  }
  if (wejscie.nagranie === "nie-dziala") {
    return { etykieta, zdanie: "Lekcję ukończysz, gdy nagranie zacznie działać.", czynny: false, cel: ukoncz };
  }
  if (wejscie.mozna) return { etykieta, zdanie: "Możesz już ukończyć tę lekcję.", czynny: true, cel: ukoncz };
  const brakujaceSekundy = Math.max(0, wejscie.wymagane - wejscie.aktywneSekundy);
  const brakujaceMinuty = Math.max(1, Math.ceil(brakujaceSekundy / 60));
  return { etykieta, zdanie: zdanieZostalo(brakujaceMinuty), czynny: false, cel: ukoncz };
}

/** „Obejrzane: …” pod nagraniem: w trakcie, po spełnieniu warunku i po ukończeniu lekcji. */
export function zdanieObejrzane(wejscie: {
  ukonczona: boolean;
  mozna: boolean;
  aktywneSekundy: number;
  wymagane: number;
}): string {
  if (wejscie.ukonczona) return "Lekcja ukończona. Nagranie możesz oglądać dowolnie.";
  const { obejrzane, potrzebne } = minutyObejrzane(wejscie.aktywneSekundy, wejscie.wymagane);
  if (wejscie.mozna) return `Obejrzane: ${potrzebne} z ${potrzebne} potrzebnych minut.`;
  return `Obejrzane: ${obejrzane} z ${potrzebne} potrzebnych minut. Liczy się czas oglądania, nie przewijanie.`;
}

/** Postęp w temacie jednym zdaniem: „2 z 7 lekcji ukończone · jesteś w lekcji 3”. */
export function zdaniePostepuTematu(temat: NonNullable<KontekstKursu["temat"]>, ukonczonaBiezaca: boolean): string {
  const poczatek = `${temat.ukonczone} z ${temat.razem} lekcji ukończone`;
  if (!ukonczonaBiezaca) return `${poczatek} · jesteś w lekcji ${temat.numerBiezacej}`;
  return temat.numerBiezacej < temat.razem ? `${poczatek} · następna to lekcja ${temat.numerBiezacej + 1}` : poczatek;
}

/** „w 12. minucie” z pozycji w sekundach: pełne minuty, od 1. */
export function numerMinuty(pozycjaSekund: number): number {
  return Math.max(1, Math.floor(pozycjaSekund / 60));
}
