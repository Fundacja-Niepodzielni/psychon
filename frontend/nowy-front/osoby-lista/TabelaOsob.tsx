import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Checkbox } from "@/design-system/atomy/Checkbox/Checkbox";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { KOLUMNY_OSOB, type KolumnaOsob, type WierszOsoby, type WybranaOsoba } from "./dane";
import { doWyboruNaStronie, wszystkieNaStronie, type Wybor } from "./wybor";
import style from "./TabelaOsob.module.css";

interface WlasciwosciTabeliOsob {
  wiersze: WierszOsoby[];
  wybor: Wybor;
  onPrzelacz: (osoba: WybranaOsoba, zaznaczona: boolean) => void;
  onZaznaczStrone: (zaznaczona: boolean) => void;
}

const TYTUL = "Lista osób";

function wartoscKolumny(kolumna: KolumnaOsob, wiersz: WierszOsoby) {
  if (kolumna.nazwa === "Rola") return <span>{wiersz.rola}</span>;
  if (kolumna.nazwa === "Prowadzący") return <span>{wiersz.prowadzacy}</span>;
  return (
    <span className={style.plakietka}>
      <Badge wariant={wiersz.plakietka.wariant}>{wiersz.plakietka.tekst}</Badge>
    </span>
  );
}

/**
 * Lista osób z polem wyboru — ten sam układ co lista rekordów w trybie kolumn
 * (`RecordList`: role tabeli na elementach `div`, od 640 px siatka z
 * nagłówkami, poniżej każdy wiersz to blok z podpisem przy wartości), z jedną
 * różnicą: wiersz osoby, którą można przypisać do prowadzącego, ma w pierwszej
 * komórce pole wyboru opisane imieniem i nazwiskiem. Nad nagłówkami kolumn stoi
 * „Zaznacz wszystkie na tej stronie” — widoczne na każdej szerokości.
 */
export function TabelaOsob({ wiersze, wybor, onPrzelacz, onZaznaczStrone }: WlasciwosciTabeliOsob) {
  const zWyborem = doWyboruNaStronie(wiersze).length > 0;

  return (
    <section className={style.karta} aria-label={TYTUL}>
      <div className={style.ukryte}>
        <Heading stopien={2}>{TYTUL}</Heading>
      </div>
      {zWyborem && (
        <div className={style.zaznaczStrone}>
          <Checkbox
            id="osoby-zaznacz-strone"
            zaznaczony={wszystkieNaStronie(wybor, wiersze)}
            onZmiana={onZaznaczStrone}
            etykieta="Zaznacz wszystkie na tej stronie"
          />
        </div>
      )}
      <div className={style.tabela} role="table" aria-label={TYTUL} data-z-wyborem={zWyborem || undefined}>
        <div className={style.naglowki} role="row">
          {KOLUMNY_OSOB.map((kolumna) => (
            <span key={kolumna.nazwa} className={style.naglowekKolumny} role="columnheader" data-rodzaj={kolumna.rodzaj}>
              {kolumna.rodzaj === "akcja" ? <span className={style.ukryte}>{kolumna.nazwa}</span> : kolumna.nazwa}
            </span>
          ))}
        </div>
        {wiersze.map((wiersz) => (
          <div key={wiersz.id} className={style.wiersz} role="row" data-wiersz={wiersz.id}>
            {KOLUMNY_OSOB.map((kolumna) => {
              if (kolumna.rodzaj === "osoba") {
                return (
                  <div key={kolumna.nazwa} className={`${style.komorka} ${style.nazwa}`} role="cell" data-rodzaj="osoba">
                    {wiersz.doWyboru ? (
                      <Checkbox
                        id={`osoba-wybor-${wiersz.id}`}
                        zaznaczony={wybor.has(wiersz.id)}
                        onZmiana={(zaznaczona) => onPrzelacz(wiersz.wybor, zaznaczona)}
                        etykieta={wiersz.nazwa}
                      />
                    ) : (
                      <div className={style.bezWyboru}>
                        <Text>{wiersz.nazwa}</Text>
                      </div>
                    )}
                    <div className={style.email}>
                      <Hint>{wiersz.email}</Hint>
                    </div>
                  </div>
                );
              }
              if (kolumna.rodzaj === "akcja") {
                return (
                  <div key={kolumna.nazwa} className={style.komorka} role="cell" data-rodzaj="akcja">
                    <span className={style.akcja}>
                      <Link href={wiersz.akcja.href} aria-label={wiersz.akcja.etykietaDostepna}>
                        {wiersz.akcja.etykieta}{" "}
                        <span className={style.strzalka} aria-hidden="true">
                          ›
                        </span>
                      </Link>
                    </span>
                  </div>
                );
              }
              return (
                <div key={kolumna.nazwa} className={style.komorka} role="cell" data-rodzaj={kolumna.rodzaj}>
                  <span className={style.podpis} aria-hidden="true">
                    {kolumna.nazwa}
                  </span>
                  {wartoscKolumny(kolumna, wiersz)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
