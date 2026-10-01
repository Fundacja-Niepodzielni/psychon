import { useId, type ReactNode } from "react";
import { Badge } from "../../atomy/Badge/Badge";
import { Button } from "../../atomy/Button/Button";
import { Heading } from "../../atomy/Heading/Heading";
import { Hint } from "../../atomy/Hint/Hint";
import { Link } from "../../atomy/Link/Link";
import { Text } from "../../atomy/Text/Text";
import { Breadcrumbs } from "../../molekuly/Breadcrumbs/Breadcrumbs";
import { useWRamce } from "../../szablony/KontekstRamki";
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

interface WlasciwosciPageHeader {
  okruszki: PozycjaOkruszkow[];
  /** Przekazane wprost do `Breadcrumbs` (M7) — "pełne" domyślnie. */
  wariantOkruszkow?: "pelne" | "skrocone";
  tytul: string;
  opis?: string;
  status?: StatusPageHeader;
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
 * W nowej ramce panelu (`useWRamce()`, ramka z makiety 2.0.4) nagłówek nie ma
 * przycisku powrotu, a okruszki pokazuje tylko ekran, którego okruszki mają
 * łącza (ekran szczegółu): łącza w kolejności plus bieżąca pozycja na końcu.
 * Poza nową ramką (stara powłoka `PanelShell` z samym `DostawcaPowloki`,
 * poligon) zachowanie bez zmian: „Wstecz” i pełne okruszki.
 */
export function PageHeader({
  okruszki,
  wariantOkruszkow = "pelne",
  tytul,
  opis,
  status,
  onPowrot,
  etykietaPowrotu = "Wstecz",
  akcja,
  przyciskGlowny,
  dzieci,
}: WlasciwosciPageHeader) {
  const wPowloce = useWRamce();
  const idPowodu = useId();
  const okruszkiWPowloce = okruszki.some((pozycja) => pozycja.href)
    ? okruszki.filter((pozycja, indeks) => pozycja.href || indeks === okruszki.length - 1)
    : [];

  const blokTekstu = (
    <>
      <div className={style.tytulWiersz}>
        <Heading stopien={1}>{tytul}</Heading>
      </div>

      {(opis || status) && (
        <Text>
          {opis && <span>{opis}</span>}
          {opis && status && (
            <span aria-hidden="true" className={style.separator}>
              {" · "}
            </span>
          )}
          {status && (
            <span className={style.status}>
              <Badge wariant={status.wariant}>{status.etykieta}</Badge>
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
            <Breadcrumbs pozycje={okruszkiWPowloce} wariant={wariantOkruszkow} />
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

      {przyciskGlowny ? (
        <div className={style.glowa} data-testid="pageheader-glowa">
          <div className={style.tekst}>{blokTekstu}</div>
          <div className={style.akcje} data-testid="pageheader-przycisk-glowny">
            <Button
              poziom="primary"
              onClick={przyciskGlowny.onKliknij}
              aria-disabled={przyciskGlowny.niedostepny ? true : undefined}
              aria-describedby={przyciskGlowny.niedostepny ? idPowodu : undefined}
            >
              {przyciskGlowny.etykieta}
            </Button>
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
