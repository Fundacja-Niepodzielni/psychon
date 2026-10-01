import style from "./Wysylanie.module.css";

interface WlasciwosciPaskaPostepu {
  procent: number;
  /** Nazwa dostępna paska — mówi, czego postęp dotyczy. */
  nazwa: string;
  /** `maly` — w pasku ramy i w wierszu lekcji; `duzy` — w karcie nagrania. */
  rozmiar?: "maly" | "duzy";
  /** Wysyłanie stoi: wypełnienie szare zamiast barwy postępu. */
  zatrzymany?: boolean;
}

/**
 * Pasek postępu wysyłania nagrania. Wypełnienie w barwie marki, nie w barwie
 * przycisku głównego: zielony jest na ekranie wyłącznie przycisk główny.
 * Pasek nigdy nie jest jedynym nośnikiem — wołający stawia obok procent słowami.
 */
export function PasekPostepu({ procent, nazwa, rozmiar = "maly", zatrzymany = false }: WlasciwosciPaskaPostepu) {
  const bezpieczny = Math.min(100, Math.max(0, Math.round(procent)));
  return (
    <span
      role="progressbar"
      aria-valuenow={bezpieczny}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={nazwa}
      className={rozmiar === "duzy" ? `${style.tor} ${style.torDuzy}` : style.tor}
      data-postep-wysylania={zatrzymany ? "zatrzymany" : "trwa"}
    >
      <span
        className={zatrzymany ? `${style.wypelnienie} ${style.wypelnienieZatrzymane}` : style.wypelnienie}
        style={{ width: `${bezpieczny}%` }}
      />
    </span>
  );
}
