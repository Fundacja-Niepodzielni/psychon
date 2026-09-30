import type { ReactNode } from "react";
import { Badge } from "../../atomy/Badge/Badge";
import { Button } from "../../atomy/Button/Button";
import { Heading } from "../../atomy/Heading/Heading";
import { Link } from "../../atomy/Link/Link";
import { Text } from "../../atomy/Text/Text";
import { Breadcrumbs } from "../../molekuly/Breadcrumbs/Breadcrumbs";
import { useWPowloce } from "../../szablony/KontekstPowloki";
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
 * W powłoce panelu (`useWPowloce()`, ramka z makiety 2.0.4) nagłówek nie ma
 * przycisku powrotu, a okruszki pokazuje tylko ekran, którego okruszki mają
 * łącza (ekran szczegółu): łącza w kolejności plus bieżąca pozycja na końcu.
 * Poza powłoką (poligon) zachowanie bez zmian.
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
  dzieci,
}: WlasciwosciPageHeader) {
  const wPowloce = useWPowloce();
  const okruszkiWPowloce = okruszki.some((pozycja) => pozycja.href)
    ? okruszki.filter((pozycja, indeks) => pozycja.href || indeks === okruszki.length - 1)
    : [];

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

      <div className={style.tytulWiersz}>
        <Heading stopien={1}>{tytul}</Heading>
        {status && <Badge wariant={status.wariant}>{status.etykieta}</Badge>}
      </div>

      {opis && <Text>{opis}</Text>}

      {akcja && (
        <p className={style.akcja}>
          <Link href={akcja.href}>{akcja.etykieta}</Link>
        </p>
      )}

      {dzieci}
    </header>
  );
}
