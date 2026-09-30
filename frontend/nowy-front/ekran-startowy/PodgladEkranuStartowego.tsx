import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Link } from "@/design-system/atomy/Link/Link";
import { Text } from "@/design-system/atomy/Text/Text";
import { adresFilmu, type FormularzEkranu } from "./dane";
import style from "./EkranStartowy.module.css";

const DOMYSLNY_PODPIS_FILMU = "Film pojawi się tutaj wkrótce.";

function Tytul({ tytul }: { tytul: string }) {
  return <Heading stopien={3}>{tytul.trim() === "" ? "Bez tytułu" : tytul}</Heading>;
}

/** Treść jako tekst: bez interpretacji znaczników, łamania wierszy zachowane. */
function Akapit({ tresc }: { tresc: string }) {
  if (tresc.trim() === "") return null;
  return (
    <div className={style.tekst}>
      <Text>{tresc}</Text>
    </div>
  );
}

/**
 * Podgląd ekranu „Zacznij tutaj” w układzie odbiorcy: trzy karty (film,
 * przebieg programu, oczekiwania) z bieżących wartości formularza, przed
 * zapisem. Każda wartość trafia do DOM jako tekst Reacta — znaczniki wpisane
 * w treść są wyświetlane dosłownie. Odnośnik do filmu tylko dla `http:` i
 * `https:` (`adresFilmu`).
 */
export function PodgladEkranuStartowego({ wartosci }: { wartosci: FormularzEkranu }) {
  const adres = adresFilmu(wartosci["video.url"]);
  const podpis = wartosci["video.caption"].trim();

  return (
    <div className={style.podglad}>
      <section className={`${style.karta} ${style.kartaFilm}`} aria-label="Podgląd: film">
        <Tytul tytul={wartosci["video.title"]} />
        {adres ? (
          <Text>
            <Link href={adres} target="_blank" rel="noopener noreferrer">
              Otwórz film
            </Link>
          </Text>
        ) : (
          <Text wariant="pusty">{podpis === "" ? DOMYSLNY_PODPIS_FILMU : podpis}</Text>
        )}
        {adres && podpis !== "" && <Akapit tresc={wartosci["video.caption"]} />}
      </section>

      <section className={style.karta} aria-label="Podgląd: przebieg programu">
        <Tytul tytul={wartosci["program.title"]} />
        <Akapit tresc={wartosci["program.body"]} />
      </section>

      <section className={style.karta} aria-label="Podgląd: oczekiwania">
        <Tytul tytul={wartosci["expectations.title"]} />
        <Akapit tresc={wartosci["expectations.body"]} />
      </section>
    </div>
  );
}
