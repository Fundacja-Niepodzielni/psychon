import type { ReactNode } from "react";
import { Heading } from "../../atomy/Heading/Heading";
import { Link } from "../../atomy/Link/Link";
import { Text } from "../../atomy/Text/Text";
import { parsujTresc, type Blok, type Wtracenie } from "./parsujTresc";
import style from "./TrescLekcji.module.css";

interface WlasciwosciTrescLekcji {
  /** `lessons.content` z `GET /lessons/{id}` — podzbiór Markdown albo `null`. */
  tresc: string | null;
}

function renderujWtracenia(wtracenia: Wtracenie[]): ReactNode[] {
  return wtracenia.map((wtracenie, indeks) => {
    switch (wtracenie.rodzaj) {
      case "tekst":
        return wtracenie.tekst;
      case "pogrubienie":
        return <strong key={indeks}>{renderujWtracenia(wtracenie.dzieci)}</strong>;
      case "kursywa":
        return <em key={indeks}>{renderujWtracenia(wtracenie.dzieci)}</em>;
      case "kod":
        return (
          <code key={indeks} className={style.kod}>
            {wtracenie.tekst}
          </code>
        );
      case "lamanie":
        return <br key={indeks} />;
      case "link":
        return (
          <Link
            key={indeks}
            href={wtracenie.adres}
            rel={wtracenie.zewnetrzny ? "noopener noreferrer" : undefined}
          >
            {renderujWtracenia(wtracenie.dzieci)}
          </Link>
        );
    }
  });
}

function renderujBlok(blok: Blok, indeks: number): ReactNode {
  switch (blok.rodzaj) {
    case "akapit":
      return (
        <Text key={indeks} wariant="lekcja">
          {renderujWtracenia(blok.dzieci)}
        </Text>
      );
    case "naglowek":
      return (
        <Heading key={indeks} stopien={blok.stopien}>
          {renderujWtracenia(blok.dzieci)}
        </Heading>
      );
    case "lista": {
      const elementy = blok.elementy.map((element, pozycja) => (
        <li key={pozycja}>{renderujWtracenia(element)}</li>
      ));
      return blok.uporzadkowana ? (
        <ol key={indeks} className={style.lista} start={blok.start === 1 ? undefined : blok.start}>
          {elementy}
        </ol>
      ) : (
        <ul key={indeks} className={style.lista}>
          {elementy}
        </ul>
      );
    }
  }
}

/**
 * Treść lekcji (`TrescLekcji`) — render podzbioru Markdown z `lessons.content`
 * do elementów Reacta. Parser (`parsujTresc`) buduje drzewo danych, a ten
 * komponent zamienia je na elementy; każdy tekst trafia do DOM jako dziecko
 * tekstowe Reacta, więc HTML zapisany w treści (`<script>`, `<img onerror>`)
 * jest wyświetlany jako tekst i nigdy nie jest interpretowany. Surowego HTML
 * nie wstrzykujemy w żadnej postaci.
 *
 * Linki: wyłącznie `https:`, `http:`, `mailto:` i ścieżki od `/`; inny schemat
 * (także `javascript:` w dowolnej wielkości liter) zostaje samym tekstem.
 * Linki zewnętrzne dostają `rel="noopener noreferrer"`.
 *
 * Pusta albo nieobecna treść (`null`) nie renderuje niczego.
 */
export function TrescLekcji({ tresc }: WlasciwosciTrescLekcji) {
  const bloki = parsujTresc(tresc);

  if (bloki.length === 0) {
    return null;
  }

  return <div className={style.tresc}>{bloki.map(renderujBlok)}</div>;
}
