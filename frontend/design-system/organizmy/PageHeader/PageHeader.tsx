import { useId, type ReactNode } from "react";
import { Badge } from "../../atomy/Badge/Badge";
import { Button } from "../../atomy/Button/Button";
import { Heading } from "../../atomy/Heading/Heading";
import { Hint } from "../../atomy/Hint/Hint";
import { Link } from "../../atomy/Link/Link";
import { Text } from "../../atomy/Text/Text";
import { Breadcrumbs } from "../../molekuly/Breadcrumbs/Breadcrumbs";
import { useDaneRamki } from "../../szablony/KontekstRamki";
import { okruszekRamki } from "../../szablony/OkruszekRamki";
import style from "./PageHeader.module.css";

interface PozycjaOkruszkow {
  etykieta: string;
  href?: string;
}

interface StatusPageHeader {
  wariant: "neutral" | "ok" | "warn" | "error" | "pending";
  etykieta: string;
}

interface AkcjaPageHeader {
  etykieta: string;
  href: string;
}

interface PrzyciskGlownyPageHeader {
  etykieta: string;
  onKliknij: () => void;
  /** Stan niedostępny z powodem: przycisk zostaje kolorowy (`primary` nigdy
   * nie jest wyszarzony atomem), dostaje `aria-disabled="true"` i
   * `aria-describedby` wskazujące podpowiedź pod nagłówkiem z tym powodem.
   * Kliknięcie nadal woła `onKliknij` — ekran pokazuje wtedy braki, zamiast
   * milczeć (to samo, co robił pulpit administracji w `dzieci`). */
  niedostepny?: { powod: string };
}

interface AkcjaDrugorzednaPageHeader {
  etykieta: string;
  onKliknij: () => void;
  /** Akcja chwilowo niedostępna (np. trwa pobieranie): przycisk z atrybutem `disabled`. */
  wylaczona?: boolean;
  /** Akcja otwiera panel na tym samym ekranie: stan panelu jako `aria-expanded`. */
  rozwinieta?: boolean;
}

interface WlasciwosciPageHeader {
  okruszki: PozycjaOkruszkow[];
  /** Przekazane wprost do `Breadcrumbs` (M7) — "pełne" domyślnie. */
  wariantOkruszkow?: "pelne" | "skrocone";
  tytul: string;
  /**
   * Podtytuł. Zwykły tekst (`string`) albo treść z wyróżnieniem (np. liczba
   * dni w `<strong>`); string jest renderowany tak jak dotąd.
   */
  opis?: ReactNode;
  status?: StatusPageHeader;
  /**
   * Znacznik stanu w wierszu tytułu (obok niego), nie w linii pod nim; na
   * wąskim ekranie schodzi pod tytuł. Domyślnie wyłączone: znacznik stoi
   * w linii opisu jak dotąd.
   */
  statusObokTytulu?: boolean;
  /** Wywołane przez przycisk powrotu (`Button`, pole dotyku z `--hit-min`
   * wbudowane w atom — patrz Button.module.css `.przycisk { min-height:
   * var(--hit-min) }`). Właściciel nawigacji to wywołujący
   * (trasa), ten organizm tylko woła przekazany handler. */
  onPowrot: () => void;
  etykietaPowrotu?: string;
  /** Odnośnik poboczny (np. do dokumentacji ekranu) — opcjonalny, `Link` (A2). */
  akcja?: AkcjaPageHeader;
  /** Jedyny przycisk w kolorze na ekranie. Od 768 px stoi w nagłówku przy
   * prawej krawędzi, na wysokości tytułu (makieta 2.0.4, `.head .acts`);
   * poniżej 768 px ma pełną szerokość pod opisem. Szerokość od 768 px
   * wynika z treści przycisku, jak w makiecie (`.head .acts`, bez stałej
   * szerokości; `max-width: 320px` z atomu), długa etykieta zawija się. */
  przyciskGlowny?: PrzyciskGlownyPageHeader;
  /**
   * Akcja drugorzędna nagłówka (`Button` outline), obok przycisku głównego
   * (makieta 2.0.4, `.head .acts`): od 768 px po jego lewej stronie, w jednym
   * wierszu przy prawej krawędzi; poniżej 768 px pod opisem, na pełną
   * szerokość, pod przyciskiem głównym (jak w makiecie: główny pierwszy).
   * Bez przycisku głównego stoi sama w tym samym miejscu. Jedna akcja
   * drugorzędna na nagłówek — kolejne akcje to odnośnik poboczny (`akcja`)
   * albo `dzieci`.
   */
  akcjaDrugorzedna?: AkcjaDrugorzednaPageHeader;
  dzieci?: ReactNode;
}

/**
 * Nagłówek ekranu `PageHeader` (O1, 71 ekranów). Skład: `Breadcrumbs`
 * (molekuła) + `Heading` / `Text` / `Badge` / `Button` / `Link` (atomy).
 * Przycisk powrotu ma pole dotyku ≥44px z samego atomu `Button` — nic tu
 * tego nie nadpisuje. Ślad okruszków ma niższy próg dotyku niż reszta
 * organizmu, 24px, spełniony już przez `Link` wariant `okruszek` (44px
 * zmierzone poligonem atomów, patrz komentarz w Link.module.css) — z
 * zapasem powyżej progu, nie tylko go osiągając.
 *
 * Plakietka stanu stoi w linii pod tytułem, po kropce środkowej za opisem (makieta 2.0.4,
 * `.head .sub`); bez opisu stoi sama w tej linii.
 *
 * W nowej ramce panelu (`useDaneRamki()`, ramka z makiety 2.0.4) nagłówek nie
 * ma przycisku powrotu, a okruszek składa jedna reguła (`okruszekRamki`,
 * `szablony/OkruszekRamki.ts`) z menu ramki i bieżącej ścieżki: ekrany z
 * „Codziennie” bez okruszka, pozostałe „korzeń › [rodzic ›] bieżąca”, szczegół
 * zawsze z łańcuchem, jedna pozycja nigdy. Okruszki podane przez ekran
 * dostarczają łącza pośrednie i ostatnią pozycję (bieżącą na szczególe i na
 * ekranie poza menu; na liście bieżącą nazywa pozycja menu). Poza nową ramką (stara
 * powłoka `PanelShell` z samym `DostawcaPowloki`, poligon) zachowanie bez
 * zmian: „Wstecz” i pełne okruszki.
 */
export function PageHeader({
  okruszki,
  wariantOkruszkow = "pelne",
  tytul,
  opis,
  status,
  statusObokTytulu = false,
  onPowrot,
  etykietaPowrotu = "Wstecz",
  akcja,
  przyciskGlowny,
  akcjaDrugorzedna,
  dzieci,
}: WlasciwosciPageHeader) {
  const daneRamki = useDaneRamki();
  const wPowloce = daneRamki !== null;
  const idPowodu = useId();
  const okruszkiWPowloce = daneRamki
    ? okruszekRamki({ menu: daneRamki.menu, sciezka: daneRamki.sciezka, okruszki, tytul })
    : [];

  const statusPrzyTytule = statusObokTytulu && status !== undefined;
  const statusWOpisie = statusPrzyTytule ? undefined : status;

  const blokTekstu = (
    <>
      <div className={style.tytulWiersz}>
        <Heading stopien={1}>{tytul}</Heading>
        {statusPrzyTytule && (
          <span className={style.status}>
            <Badge wariant={status.wariant}>{status.etykieta}</Badge>
          </span>
        )}
      </div>

      {(opis || statusWOpisie) && (
        <Text>
          {opis && <span>{opis}</span>}
          {opis && statusWOpisie && (
            <span aria-hidden="true" className={style.separator}>
              {" · "}
            </span>
          )}
          {statusWOpisie && (
            <span className={style.status}>
              <Badge wariant={statusWOpisie.wariant}>{statusWOpisie.etykieta}</Badge>
            </span>
          )}
        </Text>
      )}

      {akcja && (
        <p className={style.akcja}>
          <Link href={akcja.href}>{akcja.etykieta}</Link>
        </p>
      )}
    </>
  );

  return (
    <header className={style.naglowek}>
      {wPowloce ? (
        okruszkiWPowloce.length > 0 && (
          <div className={style.gornyWiersz}>
            <Breadcrumbs pozycje={okruszkiWPowloce} wariant={wariantOkruszkow} oznaczBiezaca />
          </div>
        )
      ) : (
        <div className={style.gornyWiersz}>
          <Button poziom="outline" onClick={onPowrot} data-testid="pageheader-powrot">
            {etykietaPowrotu}
          </Button>
          <Breadcrumbs pozycje={okruszki} wariant={wariantOkruszkow} />
        </div>
      )}

      {przyciskGlowny || akcjaDrugorzedna ? (
        <div className={style.glowa} data-testid="pageheader-glowa">
          <div className={style.tekst}>{blokTekstu}</div>
          <div
            className={akcjaDrugorzedna && przyciskGlowny ? `${style.akcje} ${style.akcjeDwie}` : style.akcje}
            data-testid={przyciskGlowny ? "pageheader-przycisk-glowny" : "pageheader-akcje"}
          >
            {akcjaDrugorzedna && (
              <Button
                poziom="outline"
                type="button"
                onClick={akcjaDrugorzedna.onKliknij}
                disabled={akcjaDrugorzedna.wylaczona}
                aria-expanded={akcjaDrugorzedna.rozwinieta}
                data-testid="pageheader-akcja-drugorzedna"
              >
                {akcjaDrugorzedna.etykieta}
              </Button>
            )}
            {przyciskGlowny && (
              <Button
                poziom="primary"
                onClick={przyciskGlowny.onKliknij}
                aria-disabled={przyciskGlowny.niedostepny ? true : undefined}
                aria-describedby={przyciskGlowny.niedostepny ? idPowodu : undefined}
              >
                {przyciskGlowny.etykieta}
              </Button>
            )}
          </div>
        </div>
      ) : (
        blokTekstu
      )}

      {przyciskGlowny?.niedostepny && <Hint id={idPowodu}>{przyciskGlowny.niedostepny.powod}</Hint>}

      {dzieci}
    </header>
  );
}
