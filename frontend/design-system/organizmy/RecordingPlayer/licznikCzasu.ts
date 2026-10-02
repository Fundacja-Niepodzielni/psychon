/**
 * Licznik czasu oglądania liczony WYŁĄCZNIE z komunikatów ramki: rośnie tylko
 * między zgłoszeniem odtwarzania a pauzą albo końcem i tylko o tyle, o ile
 * pozycja nagrania faktycznie się przesunęła — nigdy więcej, niż upłynęło
 * czasu zegara. Bez komunikatów nie rośnie nic: licznik nie ma własnego zegara
 * ani cyklicznego tyknięcia.
 *
 * Odcinek to ciągłe odtwarzanie od jednej kotwicy (pozycja, chwila zegara).
 * W odcinku doliczone może być najwyżej min(przesunięcie pozycji, czas zegara);
 * liczone na cały odcinek, a nie na pojedynczy komunikat, żeby nierówne odstępy
 * między komunikatami nie zaniżały wyniku.
 */

/** Dłuższa cisza między komunikatami przerywa odcinek: przerwy nie doliczamy. */
export const NAJDLUZSZA_PRZERWA_SEKUND = 15;
/** Najszybsze tempo odtwarzania, przy którym skok pozycji jest jeszcze odtwarzaniem. */
export const NAJSZYBSZE_TEMPO = 4;
/** Luz na nierówny odstęp komunikatów przy rozpoznawaniu przewinięcia. */
export const LUZ_SEKUND = 1.5;

export interface Przyrost {
  /** Pełne sekundy odtwarzania doliczone tym komunikatem. */
  obejrzane: number;
  /** Pełne sekundy odtwarzania przy widocznej karcie doliczone tym komunikatem. */
  aktywne: number;
}

export interface LicznikCzasu {
  /** Ramka zgłosiła odtwarzanie. */
  odtwarzanie(): void;
  /** Ramka zgłosiła pauzę, koniec albo błąd. */
  zatrzymanie(): void;
  /** Ramka zgłosiła przewinięcie: następna pozycja zaczyna nowy odcinek. */
  przewiniecie(): void;
  /** Ramka zgłosiła pozycję `sekundy` w chwili `terazMs` zegara. */
  pozycja(sekundy: number, terazMs: number, kartaWidoczna: boolean): Przyrost;
  czyOdtwarza(): boolean;
}

interface Odcinek {
  kotwicaPozycji: number;
  kotwicaZegaraMs: number;
  ostatniaPozycja: number;
  ostatniZegarMs: number;
  /** Ile sekund odcinka już doliczono. */
  doliczone: number;
}

const ZERO: Przyrost = { obejrzane: 0, aktywne: 0 };

export function utworzLicznikCzasu(): LicznikCzasu {
  let odtwarza = false;
  let odcinek: Odcinek | null = null;
  // Ułamki sekund czekające na pełną sekundę; w górę idą wyłącznie pełne sekundy.
  let resztaObejrzane = 0;
  let resztaAktywne = 0;

  function nowyOdcinek(sekundy: number, terazMs: number): void {
    odcinek = {
      kotwicaPozycji: sekundy,
      kotwicaZegaraMs: terazMs,
      ostatniaPozycja: sekundy,
      ostatniZegarMs: terazMs,
      doliczone: 0,
    };
  }

  return {
    odtwarzanie() {
      odtwarza = true;
      odcinek = null;
    },
    zatrzymanie() {
      odtwarza = false;
      odcinek = null;
    },
    przewiniecie() {
      odcinek = null;
    },
    czyOdtwarza() {
      return odtwarza;
    },
    pozycja(sekundy, terazMs, kartaWidoczna) {
      if (!odtwarza) return ZERO;
      if (odcinek === null) {
        nowyOdcinek(sekundy, terazMs);
        return ZERO;
      }
      const krokPozycji = sekundy - odcinek.ostatniaPozycja;
      const krokZegara = (terazMs - odcinek.ostatniZegarMs) / 1000;
      const cofniecie = krokPozycji < 0;
      const przerwa = krokZegara < 0 || krokZegara > NAJDLUZSZA_PRZERWA_SEKUND;
      const skok = krokPozycji > krokZegara * NAJSZYBSZE_TEMPO + LUZ_SEKUND;
      if (cofniecie || przerwa || skok) {
        nowyOdcinek(sekundy, terazMs);
        return ZERO;
      }
      odcinek.ostatniaPozycja = sekundy;
      odcinek.ostatniZegarMs = terazMs;
      const dozwolone = Math.min(
        sekundy - odcinek.kotwicaPozycji,
        (terazMs - odcinek.kotwicaZegaraMs) / 1000,
      );
      const przyrost = dozwolone - odcinek.doliczone;
      if (przyrost <= 0) return ZERO;
      odcinek.doliczone = dozwolone;
      resztaObejrzane += przyrost;
      if (kartaWidoczna) resztaAktywne += przyrost;
      // Margines na błąd zaokrągleń sum ułamków (np. 120 × 0,25 s).
      const obejrzane = Math.floor(resztaObejrzane + 1e-9);
      const aktywne = Math.floor(resztaAktywne + 1e-9);
      resztaObejrzane -= obejrzane;
      resztaAktywne -= aktywne;
      return obejrzane === 0 && aktywne === 0 ? ZERO : { obejrzane, aktywne };
    },
  };
}
