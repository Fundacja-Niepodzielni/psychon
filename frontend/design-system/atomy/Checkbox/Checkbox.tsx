import style from "./Checkbox.module.css";

interface WlasciwosciCheckbox {
  id: string;
  zaznaczony: boolean;
  onZmiana: (wartosc: boolean) => void;
  etykieta: string;
}

/**
 * Pole zaznaczenia `Checkbox` (A6). Pole dotyku 44×44 przy znaczniku 20×20;
 * zaznaczenie czytelne bez barwy dzięki znacznikowi „✓”, nie tylko tłu.
 */
export function Checkbox({ id, zaznaczony, onZmiana, etykieta }: WlasciwosciCheckbox) {
  return (
    <label htmlFor={id} className={style.dotyk}>
      <input
        id={id}
        type="checkbox"
        className={style.ukryty}
        checked={zaznaczony}
        onChange={(e) => onZmiana(e.target.checked)}
      />
      <span className={`${style.pole} ${zaznaczony ? style.zaznaczony : ""}`} aria-hidden="true">
        {zaznaczony ? "✓" : ""}
      </span>
      {etykieta}
    </label>
  );
}
