import style from "./Label.module.css";

interface WlasciwosciLabel {
  htmlFor: string;
  dzieci: string;
  wymagane?: boolean;
}

/**
 * Etykieta `Label` (A9). Każda kontrolka ma widoczną etykietę — podpowiedź
 * w polu (placeholder) nigdy jej nie zastępuje.
 */
export function Label({ htmlFor, dzieci, wymagane = false }: WlasciwosciLabel) {
  return (
    <label htmlFor={htmlFor} className={style.etykieta}>
      {dzieci}
      {wymagane && (
        <span className={style.gwiazdka} aria-hidden="true">
          {" *"}
        </span>
      )}
    </label>
  );
}
