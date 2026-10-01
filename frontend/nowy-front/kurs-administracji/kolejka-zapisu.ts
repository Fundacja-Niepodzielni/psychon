/**
 * Kolejka zapisu jednego stanu: żądania idą po kolei, nigdy dwa naraz. Zmiana
 * zlecona w trakcie zapisu czeka; gdy czeka kilka, wysyłany jest wyłącznie
 * najnowszy stan (starsze nie mają już znaczenia — każdy niesie cały układ).
 * Odmowa kasuje to, co czekało: stan z ekranu wraca do ostatnio potwierdzonego,
 * więc kolejny zapis nie miałby już na czym stać.
 */
export interface ZdarzeniaKolejki<T> {
  /** Serwer potwierdził ten stan. */
  zapisano: (stan: T) => void;
  /** Serwer odmówił albo nie odpowiedział; nic więcej nie zostanie wysłane. */
  odmowa: (blad: unknown, stan: T) => void;
}

export interface KolejkaZapisu<T> {
  zlec: (stan: T) => void;
  /** Czy trwa zapis albo coś na niego czeka. */
  zajeta: () => boolean;
}

export function utworzKolejkeZapisu<T>(
  wyslij: (stan: T) => Promise<unknown>,
  zdarzenia: ZdarzeniaKolejki<T>,
): KolejkaZapisu<T> {
  let trwa = false;
  let oczekujacy: { stan: T } | null = null;

  function wezOczekujacy(): { stan: T } | null {
    const wziety = oczekujacy;
    oczekujacy = null;
    return wziety;
  }

  async function biegnij(pierwszy: T): Promise<void> {
    trwa = true;
    let stan = pierwszy;
    for (;;) {
      try {
        await wyslij(stan);
      } catch (blad) {
        oczekujacy = null;
        trwa = false;
        zdarzenia.odmowa(blad, stan);
        return;
      }
      zdarzenia.zapisano(stan);
      const nastepny = wezOczekujacy();
      if (nastepny === null) break;
      stan = nastepny.stan;
    }
    trwa = false;
  }

  return {
    zlec(stan) {
      if (trwa) {
        oczekujacy = { stan };
        return;
      }
      void biegnij(stan);
    },
    zajeta: () => trwa,
  };
}
