import style from "./Divider.module.css";

/**
 * Linia `Divider` (A14). Jedna implementacja: wiersz zbioru rozdziela
 * linia, nigdy ramka ani cień pojemnika.
 */
export function Divider() {
  return <hr role="separator" className={style.linia} />;
}
