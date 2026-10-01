import { NBSP, procentWyslania } from "@/nowy-front/lekcja-edycja/nagranie";
import { PasekPostepu } from "./PasekPostepu";
import type { StanWysylania } from "./uchwyt";
import style from "./Wysylanie.module.css";

/**
 * Stan wysyłania nagrania w wierszu lekcji na ekranie kursu: procent z
 * paskiem w trakcie wysyłania, „Wysyłanie przerwane”, gdy stanęło, a po
 * wysłaniu całego pliku — przetwarzanie.
 */
export function StanWysylaniaWWierszu({ stan }: { stan: Exclude<StanWysylania, { rodzaj: "brak" }> }) {
  if (stan.rodzaj === "wyslane") return <>Nagranie: przetwarzanie</>;
  if (stan.rodzaj === "przerwane") {
    return (
      <span className={style.przerwaneWWierszu} data-wysylanie-w-wierszu="przerwane">
        Wysyłanie przerwane
      </span>
    );
  }
  const procent = procentWyslania(stan.wyslano, stan.rozmiar);
  return (
    <span className={style.wWierszu} data-wysylanie-w-wierszu="wysylanie">
      Wysyłanie {procent}
      {NBSP}%
      <PasekPostepu procent={procent} nazwa={`Wysyłanie nagrania lekcji ${stan.lekcja.tytul}`} />
    </span>
  );
}
