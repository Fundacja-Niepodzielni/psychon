import { Button } from "../../atomy/Button/Button";
import { Heading } from "../../atomy/Heading/Heading";
import { Text } from "../../atomy/Text/Text";
import style from "./EmptyState.module.css";

interface WlasciwosciPrzyciskEmptyState {
  etykieta: string;
  onClick: () => void;
}

interface WlasciwosciEmptyStateBazowe {
  naglowek: string;
  przycisk: WlasciwosciPrzyciskEmptyState;
}

interface WlasciwosciEmptyStateZwykle extends WlasciwosciEmptyStateBazowe {
  wariant?: "pusto" | "brak-wynikow-filtra";
  tresc: string;
}

interface WlasciwosciEmptyStateBrakUprawnien extends WlasciwosciEmptyStateBazowe {
  wariant: "brak-uprawnien";
  /** Nazwa roli — wstawiana w JEDYNY dozwolony szablon zdania (KO-8). */
  rola: string;
}

type WlasciwosciEmptyState = WlasciwosciEmptyStateZwykle | WlasciwosciEmptyStateBrakUprawnien;

function jestWariantemUprawnien(
  wlasciwosci: WlasciwosciEmptyState,
): wlasciwosci is WlasciwosciEmptyStateBrakUprawnien {
  return wlasciwosci.wariant === "brak-uprawnien";
}

/**
 * Stan pusty `EmptyState` (M17). Z atomów `Heading` + `Text` + JEDEN
 * `Button`. Tłumaczy, skąd wezmą się dane, i daje następny krok — nigdy nie
 * wygląda jak awaria (KO-8). Wariant `brak-uprawnien` ma DOKŁADNIE JEDEN
 * szablon zdania „…tylko dla {rola}." i jedno wyjście — treść nie jest tu
 * dowolna, bo dowolność w tym miejscu jest dokładnie to, czego KO-8 zakazuje.
 */
export function EmptyState(wlasciwosci: WlasciwosciEmptyState) {
  const { naglowek, przycisk } = wlasciwosci;
  const tresc = jestWariantemUprawnien(wlasciwosci)
    ? `Ten widok jest dostępny tylko dla ${wlasciwosci.rola}.`
    : wlasciwosci.tresc;

  return (
    <div className={style.pojemnik}>
      <Heading stopien={2}>{naglowek}</Heading>
      <Text wariant="pusty">{tresc}</Text>
      <Button poziom="outline" onClick={przycisk.onClick}>
        {przycisk.etykieta}
      </Button>
    </div>
  );
}
