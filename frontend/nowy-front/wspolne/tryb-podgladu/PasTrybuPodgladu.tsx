import Link from "next/link";
import style from "./PasTrybuPodgladu.module.css";

export const TEKST_PASA_PODGLADU = "Tryb podglądu. Widzisz kurs tak, jak uczestnik. Nic się nie zapisuje.";
export const ETYKIETA_POWROTU_Z_PODGLADU = "Wróć do edycji kursu";

interface WlasciwosciPasaPodgladu {
  /** Adres powrotu do edycji kursu (z `adresPowrotuZPodgladu`). */
  powrot: string;
}

/**
 * Pas trybu podglądu u góry ekranu: tekst „Tryb podglądu. Widzisz kurs tak,
 * jak uczestnik. Nic się nie zapisuje.” i odnośnik „Wróć do edycji kursu”.
 * Pas jest regionem z nazwą, a odnośnik ma cel dotyku co najmniej 44 px.
 */
export function PasTrybuPodgladu({ powrot }: WlasciwosciPasaPodgladu) {
  return (
    <div className={style.pas} role="region" aria-label="Tryb podglądu">
      <p>
        <b>Tryb podglądu.</b> Widzisz kurs tak, jak uczestnik. Nic się nie zapisuje.
      </p>
      <Link className={style.powrot} href={powrot}>
        {ETYKIETA_POWROTU_Z_PODGLADU}
      </Link>
    </div>
  );
}
