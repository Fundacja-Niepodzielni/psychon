import { Badge } from "../../atomy/Badge/Badge";
import { Num } from "../../atomy/Num/Num";
import { Text } from "../../atomy/Text/Text";
import { Button } from "../../atomy/Button/Button";
import style from "./SaveBar.module.css";

interface WlasciwosciSaveBar {
  /** Liczba niezapisanych zmian. 0 = pasek ukryty (Odbiór M13). */
  liczbaZmian: number;
  /** Zdanie mówiące, co się zmieniło — miejsce zmiany, nie tylko liczba. */
  temat: string;
  onCofnij: () => void;
  onPorzucWszystko: () => void;
  onZapisz: () => void;
}

/**
 * Pasek zapisu `SaveBar` (M13). Jedyny wyjątek od reguły „jeden przycisk
 * kolorowy na ekran" — ma trzy: Cofnij, Porzuć wszystko, Zapisz zmiany, w tej
 * stałej kolejności. Pojawia się dopiero przy PIERWSZEJ niezapisanej zmianie
 * (`liczbaZmian === 0` nic nie renderuje — nie pustą ramkę, `null`); wywołanie
 * "Porzuć wszystko" pyta o potwierdzenie po stronie wywołującego (KO-5), ten
 * komponent tylko oddaje kliknięcie dalej.
 */
export function SaveBar({ liczbaZmian, temat, onCofnij, onPorzucWszystko, onZapisz }: WlasciwosciSaveBar) {
  if (liczbaZmian === 0) {
    return null;
  }

  return (
    <div className={style.pasek} role="region" aria-label="Niezapisane zmiany">
      <div className={style.opis}>
        <Badge wariant="pending">Niezapisane</Badge>
        <Num wartosc={liczbaZmian} etykieta="zmian" />
        <Text>{temat}</Text>
      </div>
      <div className={style.akcje}>
        <Button poziom="outline" onClick={onCofnij}>
          Cofnij
        </Button>
        <Button poziom="outline" niebezpieczny onClick={onPorzucWszystko}>
          Porzuć wszystko
        </Button>
        <Button poziom="primary" onClick={onZapisz}>
          Zapisz zmiany
        </Button>
      </div>
    </div>
  );
}
