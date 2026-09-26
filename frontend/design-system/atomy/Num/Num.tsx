import style from "./Num.module.css";

interface WlasciwosciNum {
  wartosc: number;
  /** Jednostka albo mianownik — jedno z nich obowiązkowe (KO-6). */
  etykieta: string;
}

/** Wstawia wąską spację nierozdzielającą co trzy cyfry. */
function formatujTysiace(n: number): string {
  return n.toLocaleString("pl-PL").replace(/\s/g, " ");
}

/**
 * Liczba `Num` (A20). Nigdy sama — zawsze z jednostką albo mianownikiem,
 * zawsze cyframi tabelarycznymi.
 */
export function Num({ wartosc, etykieta }: WlasciwosciNum) {
  if (etykieta.trim() === "") {
    throw new Error("Num: liczba bez jednostki ani mianownika nie jest dozwolona");
  }
  return (
    <span>
      <span className={style.liczba}>{formatujTysiace(wartosc)}</span>
      <span className={style.etykieta}>{etykieta}</span>
    </span>
  );
}
