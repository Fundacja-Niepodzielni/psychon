import { Hint } from "../../atomy/Hint/Hint";
import { Text } from "../../atomy/Text/Text";
import style from "./QaBlock.module.css";

interface WlasciwosciQaBlockBazowe {
  pytanie: string;
}

interface WlasciwosciQaBlockOdpowiedziana extends WlasciwosciQaBlockBazowe {
  stan: "odpowiedziana";
  /** Kto odpowiedział. */
  kto: string;
  /** Kiedy odpowiedział. */
  kiedy: string;
  odpowiedz: string;
}

interface WlasciwosciQaBlockCzeka extends WlasciwosciQaBlockBazowe {
  stan: "czeka";
  /** Obiecany czas odpowiedzi. */
  obiecanyCzas: string;
  /** Co się stanie po przekroczeniu obiecanego czasu. */
  poPrzekroczeniu: string;
}

type WlasciwosciQaBlock = WlasciwosciQaBlockOdpowiedziana | WlasciwosciQaBlockCzeka;

/**
 * Blok pytania `QaBlock` (M19). Pytanie + `Hint` (kto, kiedy, stan) +
 * odpowiedź. Stan `odpowiedziana` pokazuje KTO odpowiedział i KIEDY; stan
 * `czeka` NIE MOŻE zostać bez obiecanego czasu i bez zdania, co się stanie po
 * jego przekroczeniu — typ wymusza oba pola przy tym stanie, więc bloku
 * "czeka" bez tych dwóch informacji nie da się w ogóle złożyć.
 */
export function QaBlock(wlasciwosci: WlasciwosciQaBlock) {
  return (
    <div className={style.blok}>
      <Text>{wlasciwosci.pytanie}</Text>
      {wlasciwosci.stan === "odpowiedziana" ? (
        <>
          <Hint>
            {wlasciwosci.kto} · {wlasciwosci.kiedy}
          </Hint>
          <p className={style.odpowiedz}>{wlasciwosci.odpowiedz}</p>
        </>
      ) : (
        <Hint>
          Czeka na odpowiedź — do {wlasciwosci.obiecanyCzas}. {wlasciwosci.poPrzekroczeniu}
        </Hint>
      )}
    </div>
  );
}
