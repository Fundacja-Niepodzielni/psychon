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

/** Odmiana rzeczownika „zmiana" po liczbie: 1 → zmiana, liczby kończące się
 * na 2-4 poza 12-14 → zmiany, wszystkie pozostałe (0, 5-21, 22-24, …) →
 * zmian — zwykła polska odmiana liczebnikowa (ten sam wzorzec co
 * `odmienZdarzenia` w `organizmy/JournalTable/JournalTable.tsx`). */
function odmienZmian(liczba: number): string {
  if (liczba === 1) return "zmiana";
  const ostatniaCyfra = liczba % 10;
  const dwieOstatnieCyfry = liczba % 100;
  if (ostatniaCyfra >= 2 && ostatniaCyfra <= 4 && !(dwieOstatnieCyfry >= 12 && dwieOstatnieCyfry <= 14)) {
    return "zmiany";
  }
  return "zmian";
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
        <Num wartosc={liczbaZmian} etykieta={odmienZmian(liczbaZmian)} />
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
