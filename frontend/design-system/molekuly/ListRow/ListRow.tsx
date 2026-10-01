import { Badge } from "../../atomy/Badge/Badge";
import { Text } from "../../atomy/Text/Text";
import { Hint } from "../../atomy/Hint/Hint";
import { Link } from "../../atomy/Link/Link";
import { Button } from "../../atomy/Button/Button";
import { Icon } from "../../atomy/Icon/Icon";
import { Num } from "../../atomy/Num/Num";
import style from "./ListRow.module.css";

type WariantListRow = "prosty" | "ze-stanem" | "rozwijalny" | "material" | "z-licznikiem";
type WariantPlakietki = "neutral" | "ok" | "warn" | "error" | "pending";

interface PlakietkaListRow {
  wariant: WariantPlakietki;
  tekst: string;
}
interface LicznikListRow {
  wartosc: number;
  etykieta: string;
}
interface AkcjaListRow {
  /** Widoczny napis akcji; bez `etykietaDostepna` jest też jej nazwą dla czytnika. */
  etykieta: string;
  /** Pełna nazwa akcji dla czytnika ekranu (np. „Otwórz: Dyżury”), gdy widoczny napis jest krótki („Otwórz”). */
  etykietaDostepna?: string;
  href?: string;
  onKliknij?: () => void;
  /**
   * Akcja nieaktywna (np. kurs zamknięty): przycisk z kłódką i
   * `aria-disabled`, bez odnośnika i bez obsługi kliknięcia. Ma pierwszeństwo
   * przed `href` i `onKliknij`.
   */
  nieaktywna?: boolean;
}

interface WlasciwosciListRow {
  wariant?: WariantListRow;
  tytul: string;
  /** Pogrubia tytuł (waga `--fw-medium`, jak rodzaj sprawy w makiecie). */
  tytulPogrubiony?: boolean;
  /**
   * Druga część tytułu (np. osoba): stoi za tytułem po separatorze „·”, który
   * należy do niej (nie do tytułu), więc przy zawinięciu linii nigdy nie
   * zostaje na końcu linii. Poniżej 640 px stoi w drugiej linii obok
   * plakietki, a separator znika.
   */
  tytulDodatek?: string;
  podpowiedz?: string;
  /** Podpowiedź tylko dla czytnika ekranu (np. data); wzrokowo jej nie ma. */
  podpowiedzTylkoDlaCzytnika?: boolean;
  /** Wiersz bez wcięcia poziomego: tekst równo z krawędzią treści (z nagłówkiem ekranu). */
  bezWciecia?: boolean;
  plakietka?: PlakietkaListRow;
  licznik?: LicznikListRow;
  akcja: AkcjaListRow;
  otwarty?: boolean;
  onKliknijWiersz?: () => void;
}

/**
 * Wiersz listy `ListRow` (M3). `Badge` + `Text` + `Hint` + akcja, złożone z
 * atomów warstwy 2. Nie jest pojemnikiem z ramką (ZU-3, rozdziela linia w
 * `.module.css`, nie ramka/cień). Akcja ma WŁASNY, jawny, klawiaturowo
 * dostępny element (`Link` albo `Button`) — kliknięcie w tło wiersza
 * (`onKliknijWiersz`) jest wygodą myszy, nie zastępuje jej. Plakietka stoi w
 * linii tytułu, PRZED nim, i ma szerokość własnej treści (nie kolumny).
 * Akcja z `href` wygląda od 640 px jak przycisk drugorzędny, a na węższym
 * ekranie jak „Otwórz ›”; `etykietaDostepna` daje czytnikowi pełną nazwę.
 * Akcja `nieaktywna` to przycisk z kłódką (`aria-disabled`): od 640 px jak
 * nieaktywny przycisk drugorzędny, na węższym ekranie bez ramki, jak
 * „Otwórz ›”, żeby stała obok treści, a nie pod nią.
 *
 * Wiersz kolejki decyzji (makieta A-02): plakietka na początku, tytuł
 * pogrubiony (`tytulPogrubiony`), za nim po „·” druga część tytułu
 * (`tytulDodatek`); poniżej 640 px tytuł stoi w pierwszej linii, a druga
 * część i plakietka w drugiej. `podpowiedzTylkoDlaCzytnika` zostawia
 * podpowiedź (np. datę) wyłącznie czytnikowi ekranu, `bezWciecia` ustawia
 * tekst równo z krawędzią treści ekranu.
 */
export function ListRow({
  wariant = "prosty",
  tytul,
  tytulPogrubiony = false,
  tytulDodatek,
  podpowiedz,
  podpowiedzTylkoDlaCzytnika = false,
  bezWciecia = false,
  plakietka,
  licznik,
  akcja,
  otwarty = false,
  onKliknijWiersz,
}: WlasciwosciListRow) {
  const klasy = [style.wiersz, otwarty ? style.otwarty : "", bezWciecia ? style.bezWciecia : ""]
    .filter(Boolean)
    .join(" ");
  const ukrytaPodpowiedz = Boolean(podpowiedz) && podpowiedzTylkoDlaCzytnika;
  return (
    <div className={klasy} data-wariant={wariant} onClick={onKliknijWiersz}>
      <div className={ukrytaPodpowiedz ? `${style.tresc} ${style.trescZUkrytym}` : style.tresc}>
        <div className={tytulPogrubiony ? `${style.naglowek} ${style.pogrubiony}` : style.naglowek}>
          {plakietka && (
            <span className={style.plakietka}>
              <Badge wariant={plakietka.wariant}>{plakietka.tekst}</Badge>
            </span>
          )}
          <Text>{tytul}</Text>
          {tytulDodatek && (
            <span className={style.dodatek}>
              <span className={style.separator} aria-hidden="true">
                ·
              </span>
              <span>{tytulDodatek}</span>
            </span>
          )}
        </div>
        {podpowiedz &&
          (ukrytaPodpowiedz ? (
            <span className={style.ukryte}>{podpowiedz}</span>
          ) : (
            <Hint>{podpowiedz}</Hint>
          ))}
      </div>
      <div className={style.akcje} onClick={(zdarzenie) => zdarzenie.stopPropagation()}>
        {licznik && <Num wartosc={licznik.wartosc} etykieta={licznik.etykieta} />}
        {akcja.nieaktywna ? (
          <span className={style.akcjaNieaktywna}>
            <Button
              poziom="outline"
              rozmiar="sm"
              aria-disabled="true"
              aria-label={akcja.etykietaDostepna}
              data-akcja="nieaktywna"
            >
              <span className={style.zamkniety}>
                <Icon nazwa="lock" rozmiar={16} />
                {akcja.etykieta}
              </span>
            </Button>
          </span>
        ) : akcja.href ? (
          <span className={style.akcjaOdnosnik}>
            <Link href={akcja.href} aria-label={akcja.etykietaDostepna}>
              {akcja.etykieta}{" "}
              <span className={style.strzalka} aria-hidden="true">
                ›
              </span>
            </Link>
          </span>
        ) : (
          <Button poziom="quiet" rozmiar="sm" onClick={akcja.onKliknij} aria-label={akcja.etykietaDostepna}>
            {akcja.etykieta}
          </Button>
        )}
      </div>
    </div>
  );
}
