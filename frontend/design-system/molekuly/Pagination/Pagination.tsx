import { Button } from "../../atomy/Button/Button";
import { Text } from "../../atomy/Text/Text";
import style from "./Pagination.module.css";

interface WlasciwosciPagination {
  /** Bieżąca strona, licząc od 1. */
  strona: number;
  /** Liczba wszystkich stron. */
  stron: number;
  naPoprzednia: () => void;
  naNastepna: () => void;
}

/**
 * Stronicowanie `Pagination` (M14). Z atomów `Button` × 2 + `Text`. Dotyczy
 * list ponad 25 pozycji — w makiecie warstwy 3 (06-ATOMY-MOLEKULY-ORGANIZMY.md
 * §3) ma **0** wystąpień, więc ta implementacja nie ma dziś żadnego miejsca
 * użycia we froncie; zbudowana z definicji, nie z istniejącego ekranu.
 * Dokładnie jedna implementacja — podpisy zawsze "Poprzednia" / "Strona X z Y"
 * / "Następna", bez lokalnych wariantów.
 */
export function Pagination({ strona, stron, naPoprzednia, naNastepna }: WlasciwosciPagination) {
  return (
    <nav aria-label="Stronicowanie" className={style.pasek}>
      <Button poziom="outline" onClick={naPoprzednia} disabled={strona <= 1}>
        Poprzednia
      </Button>
      <Text>
        Strona {strona} z {stron}
      </Text>
      <Button poziom="outline" onClick={naNastepna} disabled={strona >= stron}>
        Następna
      </Button>
    </nav>
  );
}
