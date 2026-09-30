import { Badge } from "../../atomy/Badge/Badge";
import { Text } from "../../atomy/Text/Text";
import { Hint } from "../../atomy/Hint/Hint";
import { Link } from "../../atomy/Link/Link";
import { Button } from "../../atomy/Button/Button";
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
}

interface WlasciwosciListRow {
  wariant?: WariantListRow;
  tytul: string;
  podpowiedz?: string;
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
 */
export function ListRow({
  wariant = "prosty",
  tytul,
  podpowiedz,
  plakietka,
  licznik,
  akcja,
  otwarty = false,
  onKliknijWiersz,
}: WlasciwosciListRow) {
  const klasy = `${style.wiersz} ${otwarty ? style.otwarty : ""}`.trim();
  return (
    <div className={klasy} data-wariant={wariant} onClick={onKliknijWiersz}>
      <div className={style.tresc}>
        <div className={style.naglowek}>
          {plakietka && (
            <span className={style.plakietka}>
              <Badge wariant={plakietka.wariant}>{plakietka.tekst}</Badge>
            </span>
          )}
          <Text>{tytul}</Text>
        </div>
        {podpowiedz && <Hint>{podpowiedz}</Hint>}
      </div>
      <div className={style.akcje} onClick={(zdarzenie) => zdarzenie.stopPropagation()}>
        {licznik && <Num wartosc={licznik.wartosc} etykieta={licznik.etykieta} />}
        {akcja.href ? (
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
