"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { ProgressBar } from "@/design-system/atomy/ProgressBar/ProgressBar";
import { Text } from "@/design-system/atomy/Text/Text";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { formatujDate } from "../wspolne/daty";
import { formatujDziesietny } from "../wspolne/formatuj-dziesietny";
import {
  dodajGodziny,
  etykietaFormyZWielkiej,
  nazwaOsoby,
  pobierzGodzinyOsoby,
  procentGodzin,
  type GodzinyOsoby,
  type RodzajDecyzji,
  type WpisDoDecyzji,
} from "./dane";
import style from "./StazKolejka.module.css";

/** Decyzje, które wymagają komentarza — każda ma swój formularz w panelu. */
export type RodzajDecyzjiZKomentarzem = Exclude<RodzajDecyzji, "zatwierdz">;

export interface OtwartaDecyzja {
  rodzaj: RodzajDecyzjiZKomentarzem;
  komentarz: string;
  blad: string | undefined;
}

export const TEKSTY_DECYZJI: Record<
  RodzajDecyzjiZKomentarzem,
  { tytul: string; etykieta: string; pole: string; toast: string }
> = {
  odeslij: {
    tytul: "Poproś o poprawkę",
    etykieta: "Poproś o poprawkę",
    pole: "Co trzeba poprawić",
    toast: "Dyżur odesłany do poprawy.",
  },
  odrzuc: {
    tytul: "Odrzuć dyżur",
    etykieta: "Odrzuć dyżur",
    pole: "Powód odrzucenia",
    toast: "Dyżur odrzucony.",
  },
};

type StanGodzin =
  | { rodzaj: "ladowanie" }
  | { rodzaj: "blad" }
  | { rodzaj: "ok"; godziny: GodzinyOsoby };

interface WlasciwosciPanelu {
  wpis: WpisDoDecyzji;
  /** Trwa zapis decyzji: akcje poboczne są nieaktywne (przycisk główny pilnuje wołający). */
  zajete: boolean;
  /** Formularz poprawki albo odrzucenia; `null`, gdy panel pokazuje same akcje. */
  decyzja: OtwartaDecyzja | null;
  onZatwierdz: () => void;
  onOtworzFormularz: (rodzaj: RodzajDecyzjiZKomentarzem) => void;
  onZmienKomentarz: (wartosc: string) => void;
  onZapiszFormularz: () => void;
  onWroc: () => void;
}

/**
 * Panel otwartego dyżuru (makieta A-02, sprawa „Dyżur” otwarta): po lewej
 * dane wpisu (Data, Forma, Godziny, Konsultacje, Opis), po prawej „Ile godzin
 * ma teraz”, niżej akcje. Godziny osoby czytane są przy otwarciu z dwóch
 * istniejących tras (patrz `./dane.ts`); gdy ich nie ma, panel mówi o tym
 * wprost i nie zgaduje liczby. Kontrakt nie niesie godzin „od–do”, więc
 * panel nie ma tej linii.
 *
 * Fokus ląduje na samym panelu (obszar z nazwą, `tabIndex={-1}`), nie na
 * żadnej decyzji — przypadkowy Enter nie zatwierdza dyżuru. Akcje, od lewej:
 * „Zatwierdź” (jedyny przycisk główny), „Poproś o poprawkę”, „Odrzuć dyżur”
 * (mniej widoczny, ale w kontrakcie) i „Wróć do listy”. „Poproś o poprawkę”
 * i „Odrzuć dyżur” otwierają `FormSection` z wymaganym komentarzem w miejscu
 * rzędu akcji — wtedy jedynym przyciskiem głównym panelu jest zapis
 * formularza, a jego „Wróć do listy” zamyka cały panel, tak jak w rzędzie.
 */
export function PanelDyzuru({
  wpis,
  zajete,
  decyzja,
  onZatwierdz,
  onOtworzFormularz,
  onZmienKomentarz,
  onZapiszFormularz,
  onWroc,
}: WlasciwosciPanelu) {
  const panel = useRef<HTMLDivElement>(null);
  const [godziny, setGodziny] = useState<StanGodzin>({ rodzaj: "ladowanie" });
  const osoba = nazwaOsoby(wpis);
  const osobaId = wpis.user.id;

  useEffect(() => {
    panel.current?.focus();
  }, []);

  useEffect(() => {
    let aktualne = true;
    pobierzGodzinyOsoby(osobaId)
      .then((wynik) => {
        if (aktualne) setGodziny({ rodzaj: "ok", godziny: wynik });
      })
      .catch(() => {
        if (aktualne) setGodziny({ rodzaj: "blad" });
      });
    return () => {
      aktualne = false;
    };
  }, [osobaId]);

  return (
    <div
      ref={panel}
      className={style.panel}
      role="region"
      aria-label={`Dyżur: ${osoba}`}
      tabIndex={-1}
      data-testid="panel-dyzuru"
    >
      <div className={style.kolumny}>
        <dl className={style.dane}>
          <div className={style.para}>
            <dt>
              <Hint>Data</Hint>
            </dt>
            <dd>
              <Text>{formatujDate(wpis.date)}</Text>
            </dd>
          </div>
          <div className={style.para}>
            <dt>
              <Hint>Forma</Hint>
            </dt>
            <dd>
              <Text>{etykietaFormyZWielkiej(wpis.form)}</Text>
            </dd>
          </div>
          <div className={style.para}>
            <dt>
              <Hint>Godziny</Hint>
            </dt>
            <dd>
              <Text>{`${formatujDziesietny(wpis.hours)} h`}</Text>
            </dd>
          </div>
          <div className={style.para}>
            <dt>
              <Hint>Konsultacje</Hint>
            </dt>
            <dd>
              <Text>{String(wpis.consultations_count)}</Text>
            </dd>
          </div>
          <div className={style.para}>
            <dt>
              <Hint>Opis</Hint>
            </dt>
            <dd className={style.opis}>
              {wpis.description ? <Text>{wpis.description}</Text> : <Hint>Bez opisu.</Hint>}
            </dd>
          </div>
        </dl>
        <section className={style.godziny} aria-labelledby={`godziny-${wpis.id}`}>
          <Heading stopien={3} id={`godziny-${wpis.id}`}>
            Ile godzin ma teraz
          </Heading>
          <GodzinyOsobyBlok stan={godziny} wpis={wpis} />
        </section>
      </div>

      {decyzja === null ? (
        <div className={style.akcjePanelu}>
          <Button poziom="primary" onClick={onZatwierdz}>
            Zatwierdź
          </Button>
          <Button poziom="outline" disabled={zajete} onClick={() => onOtworzFormularz("odeslij")}>
            {TEKSTY_DECYZJI.odeslij.etykieta}
          </Button>
          <Button poziom="quiet" disabled={zajete} onClick={() => onOtworzFormularz("odrzuc")}>
            {TEKSTY_DECYZJI.odrzuc.etykieta}
          </Button>
          <span className={style.rozdzielacz} aria-hidden="true" />
          <Button poziom="quiet" disabled={zajete} onClick={onWroc}>
            Wróć do listy
          </Button>
        </div>
      ) : (
        <div className={style.decyzja}>
          <FormSection
            fokusPrzyOtwarciu
            tytul={`${TEKSTY_DECYZJI[decyzja.rodzaj].tytul}: ${osoba}`}
            pola={[
              {
                id: `komentarz-${wpis.id}`,
                etykieta: TEKSTY_DECYZJI[decyzja.rodzaj].pole,
                rodzaj: "wieloliniowy",
                wymagane: true,
                wartosc: decyzja.komentarz,
                onZmiana: onZmienKomentarz,
                blad: decyzja.blad,
              },
            ]}
            etykietaAnuluj="Wróć do listy"
            etykietaZapisz={TEKSTY_DECYZJI[decyzja.rodzaj].etykieta}
            onAnuluj={onWroc}
            onZapisz={onZapiszFormularz}
          />
        </div>
      )}
    </div>
  );
}

function GodzinyOsobyBlok({ stan, wpis }: { stan: StanGodzin; wpis: WpisDoDecyzji }) {
  if (stan.rodzaj === "ladowanie") return <Hint>Wczytuję godziny osoby…</Hint>;
  if (stan.rodzaj === "blad") {
    return <Hint>Nie udało się wczytać godzin tej osoby. Decyzję możesz podjąć bez nich.</Hint>;
  }
  const { zaakceptowane, wymagane } = stan.godziny;
  const teraz = formatujDziesietny(zaakceptowane);
  const po = dodajGodziny(zaakceptowane, wpis.hours);
  return (
    <>
      {wymagane === null ? (
        <Text>{`${teraz} h zatwierdzonych`}</Text>
      ) : (
        <ProgressBar
          procent={procentGodzin(zaakceptowane, wymagane)}
          etykieta={`${teraz} z ${formatujDziesietny(wymagane)} h`}
        />
      )}
      {po !== null && <Hint>{`Po zatwierdzeniu tego dyżuru: ${formatujDziesietny(po)} h.`}</Hint>}
    </>
  );
}
