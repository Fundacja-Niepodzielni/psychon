import { Button } from "@/design-system/atomy/Button/Button";
import { Text } from "@/design-system/atomy/Text/Text";
import style from "./PasekWyboru.module.css";

interface WlasciwosciPaskaWyboru {
  liczba: number;
  /** Zdanie o przekroczonym limicie jednego przypisania albo `null`. */
  zdanieLimitu: string | null;
  onPrzypisz: () => void;
  onWyczysc: () => void;
}

/**
 * Pasek zaznaczenia listy osób: „Wybrano: N”, przycisk główny „Przypisz
 * prowadzącego” i „Wyczyść wybór”. Pojawia się dopiero przy pierwszej
 * zaznaczonej osobie i przykleja się pod górną belką, więc zostaje w zasięgu
 * przy przewijaniu długiej listy (także w układzie bloków poniżej 640 px).
 * Przycisk główny nigdy nie jest nieaktywny (reguła atomu `Button`): ponad
 * limitem jednego przypisania pokazuje brak zdaniem obok, nie blokuje się.
 */
export function PasekWyboru({ liczba, zdanieLimitu, onPrzypisz, onWyczysc }: WlasciwosciPaskaWyboru) {
  if (liczba === 0) return null;

  return (
    <div className={style.pasek} role="region" aria-label="Wybrane osoby">
      <div className={style.opis}>
        <div role="status">
          <Text>Wybrano: {liczba}</Text>
        </div>
        {zdanieLimitu !== null && <Text>{zdanieLimitu}</Text>}
      </div>
      <div className={style.akcje}>
        <Button poziom="primary" onClick={onPrzypisz}>
          Przypisz prowadzącego
        </Button>
        <Button poziom="outline" onClick={onWyczysc}>
          Wyczyść wybór
        </Button>
      </div>
    </div>
  );
}
