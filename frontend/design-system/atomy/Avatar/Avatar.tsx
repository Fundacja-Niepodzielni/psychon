import style from "./Avatar.module.css";

interface WlasciwosciAvatar {
  imie: string;
  nazwisko?: string;
}

/** Liczy inicjały; brak imienia nigdy nie daje pustego kółka. */
function inicjaly(imie: string, nazwisko?: string): string {
  const i = imie.trim().charAt(0).toUpperCase();
  const n = nazwisko?.trim().charAt(0).toUpperCase() ?? "";
  const wynik = `${i}${n}`;
  return wynik === "" ? "?" : wynik;
}

/**
 * Awatar `Avatar` (A15). Zawsze inicjały, bez zdjęcia. Brak imienia nigdy
 * nie renderuje pustego kółka.
 */
export function Avatar({ imie, nazwisko }: WlasciwosciAvatar) {
  return <span className={style.awatar}>{inicjaly(imie, nazwisko)}</span>;
}
