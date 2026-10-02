/**
 * Minimalna obsługa protokołu komunikatów odtwarzacza w ramce (player.js):
 * komunikaty to tekst JSON z polem `context` równym nazwie protokołu. Moduł
 * tylko odczytuje i buduje komunikaty — o tym, od kogo komunikat wolno przyjąć
 * i dokąd wysłać, rozstrzyga organizm.
 */

export const KONTEKST = "player.js";
export const WERSJA = "0.0.11";

/** Zdarzenia, które organizm rozumie; pozostałe są pomijane. */
export const ZDARZENIA = ["ready", "play", "pause", "ended", "timeupdate", "seeked", "error"] as const;
export type Zdarzenie = (typeof ZDARZENIA)[number];

/** Zdarzenia, na które organizm zapisuje się po gotowości ramki. */
export const ZDARZENIA_SUBSKRYBOWANE: readonly Zdarzenie[] = [
  "play",
  "pause",
  "ended",
  "timeupdate",
  "seeked",
  "error",
];

export interface KomunikatRamki {
  zdarzenie: Zdarzenie;
  /** Pozycja odtwarzania w sekundach — tylko dla `timeupdate`. */
  pozycjaSekund: number | null;
}

function czyObiekt(wartosc: unknown): wartosc is Record<string, unknown> {
  return typeof wartosc === "object" && wartosc !== null && !Array.isArray(wartosc);
}

/**
 * Odczytuje treść komunikatu. Zwraca `null` — nigdy wyjątek — dla wszystkiego,
 * co nie jest komunikatem protokołu: zły JSON, zły kształt, obcy `context`,
 * nieznane zdarzenie, pozycja niebędąca nieujemną liczbą.
 */
export function odczytajKomunikat(dane: unknown): KomunikatRamki | null {
  let tresc: unknown = dane;
  if (typeof dane === "string") {
    try {
      tresc = JSON.parse(dane);
    } catch {
      return null;
    }
  }
  if (!czyObiekt(tresc) || tresc.context !== KONTEKST) return null;
  const nazwa = tresc.event;
  if (typeof nazwa !== "string" || !(ZDARZENIA as readonly string[]).includes(nazwa)) return null;
  const zdarzenie = nazwa as Zdarzenie;
  let pozycjaSekund: number | null = null;
  if (zdarzenie === "timeupdate") {
    const sekundy = czyObiekt(tresc.value) ? tresc.value.seconds : undefined;
    if (typeof sekundy !== "number" || !Number.isFinite(sekundy) || sekundy < 0) return null;
    pozycjaSekund = sekundy;
  }
  return { zdarzenie, pozycjaSekund };
}

/** Zapis na zdarzenie ramki. */
export function polecenieSubskrypcji(zdarzenie: Zdarzenie): string {
  return JSON.stringify({
    context: KONTEKST,
    version: WERSJA,
    method: "addEventListener",
    value: zdarzenie,
    listener: `nagranie-${zdarzenie}`,
  });
}

/** Polecenie ustawienia pozycji odtwarzania. */
export function poleceniePozycji(sekundy: number): string {
  return JSON.stringify({ context: KONTEKST, version: WERSJA, method: "setCurrentTime", value: sekundy });
}

/**
 * Pozycja, od której ma ruszyć odtwarzanie, albo `null`, gdy polecenia nie
 * wysyłamy: brak pozycji, zero, wartość niebędąca dodatnią liczbą, pozycja
 * równa długości nagrania albo dalsza (także przy nieznanej długości).
 */
export function pozycjaStartu(pozycja: number | null | undefined, dlugosc: number): number | null {
  if (typeof pozycja !== "number" || !Number.isFinite(pozycja) || pozycja <= 0) return null;
  if (!Number.isFinite(dlugosc) || pozycja >= dlugosc) return null;
  return pozycja;
}
