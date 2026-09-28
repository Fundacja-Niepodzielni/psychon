"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Heading } from "../../atomy/Heading/Heading";
import { Text } from "../../atomy/Text/Text";
import { Link } from "../../atomy/Link/Link";
import { Button } from "../../atomy/Button/Button";
import { ProgressBar } from "../../atomy/ProgressBar/ProgressBar";
import { StepBar } from "../../atomy/StepBar/StepBar";
import { Skeleton } from "../../atomy/Skeleton/Skeleton";
import { ListRow } from "../../molekuly/ListRow/ListRow";
import { QaBlock } from "../../molekuly/QaBlock/QaBlock";
import { Field } from "../../molekuly/Field/Field";
import { Notice } from "../../molekuly/Notice/Notice";
import { EmptyState } from "../../molekuly/EmptyState/EmptyState";
import { STAN_GOTOWY, type StanDanych } from "../stanDanych";
import style from "./LessonPlayer.module.css";

export interface MaterialLessonPlayer {
  id: string;
  nazwa: string;
  href: string;
}

export type PytanieLessonPlayer =
  | { id: string; stan: "odpowiedziana"; pytanie: string; kto: string; kiedy: string; odpowiedz: string }
  | { id: string; stan: "czeka"; pytanie: string; obiecanyCzas: string; poPrzekroczeniu: string };

interface PustyLessonPlayer {
  naglowek: string;
  tresc: string;
  przycisk: { etykieta: string; onClick: () => void };
}

interface WlasciwosciLessonPlayer {
  /** Przedrostek identyfikatorów w bloku; bez niego nadawany przez `useId`. */
  id?: string;
  tytul: string;
  /** Treść lekcji; pusta razem z brakiem nagrania i materiałów = stan pusty. */
  tresc: string;
  krokiZrobione: number;
  krokiRazem: number;
  materialy: MaterialLessonPlayer[];
  pytania: PytanieLessonPlayer[];
  onZadajPytanie: (tresc: string) => void;
  /** Długość nagrania i obejrzana część, w sekundach — źródło paska i licznika czasu. */
  czasTrwaniaSekund: number;
  obejrzaneSekundy: number;
  procentAktywnegoCzasu: number;
  progUkonczenia: number;
  /** Warunki poza czasem aktywnym, każdy zdaniem z odnośnikiem do miejsca uzupełnienia. */
  braki: { id: string; tekst: string; href: string }[];
  bezNagrania?: boolean;
  pusty: PustyLessonPlayer;
  stan?: StanDanych;
}

function formatujCzas(sekundy: number): string {
  const calkowite = Math.max(0, Math.floor(sekundy));
  const minuty = Math.floor(calkowite / 60);
  const reszta = calkowite % 60;
  return `${minuty}:${String(reszta).padStart(2, "0")}`;
}

/**
 * Blok lekcji `LessonPlayer` (O6). Odtwarzacz (mock ze startera, bez Bunny
 * Stream) + `StepBar` (A17) + treść (`Text` wariant „lekcja”) + materiały
 * (`ListRow` wariant „material”) + `QaBlock` (M19) + `Field` pytania (M1) +
 * blok warunku ukończenia.
 *
 * Blok warunku NIE MA własnego przycisku: mówi, ile brakuje, i linkuje
 * miejsca uzupełnienia. Brakujący procent i to, czy warunek jest spełniony,
 * wynikają z jednego obliczenia (`brakujeProcent` + `braki`), więc zdanie
 * o brakach nie może pokazać zera ani liczby ujemnej przy spełnionym czasie.
 * Pasek i licznik czasu odtwarzacza czytają `obejrzaneSekundy`
 * i `czasTrwaniaSekund`, nie stałe.
 */
export function LessonPlayer({
  id,
  tytul,
  tresc,
  krokiZrobione,
  krokiRazem,
  materialy,
  pytania,
  onZadajPytanie,
  czasTrwaniaSekund,
  obejrzaneSekundy,
  procentAktywnegoCzasu,
  progUkonczenia,
  braki,
  bezNagrania = false,
  pusty,
  stan = STAN_GOTOWY,
}: WlasciwosciLessonPlayer) {
  const zapasowyId = useId();
  const baza = id ?? zapasowyId;
  const odtwarzacz = useRef<HTMLDivElement>(null);
  const [odtwarzane, setOdtwarzane] = useState(false);
  const [pelnyEkran, setPelnyEkran] = useState(false);
  const [trescPytania, setTrescPytania] = useState("");

  useEffect(() => {
    const naZmiane = () => setPelnyEkran(document.fullscreenElement === odtwarzacz.current);
    document.addEventListener("fullscreenchange", naZmiane);
    return () => document.removeEventListener("fullscreenchange", naZmiane);
  }, []);

  if (stan.rodzaj === "ladowanie") {
    return (
      <div className={style.blok} aria-busy="true">
        <div className={style.szkieletOdtwarzacza} />
        <Skeleton wiersze={5} />
      </div>
    );
  }

  if (stan.rodzaj === "blad") {
    return (
      <Notice
        wariant="error"
        tytul="Nie udało się wczytać lekcji"
        akcja={
          <Button poziom="outline" onClick={stan.onPonow}>
            Spróbuj ponownie
          </Button>
        }
      >
        {stan.tresc}
      </Notice>
    );
  }

  if (bezNagrania && tresc.trim() === "" && materialy.length === 0) {
    return <EmptyState naglowek={pusty.naglowek} tresc={pusty.tresc} przycisk={pusty.przycisk} />;
  }

  const brakujeProcent = Math.max(0, progUkonczenia - procentAktywnegoCzasu);
  const spelniony = brakujeProcent === 0 && braki.length === 0;
  const procentObejrzany = czasTrwaniaSekund > 0 ? (obejrzaneSekundy / czasTrwaniaSekund) * 100 : 0;
  const idTresci = `${baza}-tresc`;
  const idPytania = `${baza}-pytanie`;

  function przelaczPelnyEkran() {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => setPelnyEkran(false));
    } else {
      // Przeglądarka może odmówić pełnego ekranu; odtwarzacz zostaje wtedy w miejscu.
      void odtwarzacz.current?.requestFullscreen().catch(() => setPelnyEkran(false));
    }
  }

  return (
    <div className={style.blok}>
      <StepBar zrobione={krokiZrobione} razem={krokiRazem} jednostka="lekcji ukończonych" />

      {!bezNagrania && (
        <div ref={odtwarzacz} className={style.odtwarzacz}>
          <button
            type="button"
            className={style.przyciskOdtwarzania}
            aria-label={odtwarzane ? "Zatrzymaj" : "Odtwórz"}
            onClick={() => setOdtwarzane((p) => !p)}
          >
            <span className={odtwarzane ? style.znakPauzy : style.znakOdtwarzania} aria-hidden="true" />
          </button>
          <div className={style.paskSterowania}>
            <span className={style.czas}>
              {formatujCzas(obejrzaneSekundy)} / {formatujCzas(czasTrwaniaSekund)}
            </span>
            <ProgressBar
              procent={procentObejrzany}
              etykieta={`${Math.floor(obejrzaneSekundy / 60)} z ${Math.ceil(czasTrwaniaSekund / 60)} min`}
              wariant="odtwarzacz"
            />
            <button
              type="button"
              className={style.powiekszenie}
              aria-label={pelnyEkran ? "Zmniejsz" : "Powiększ"}
              onClick={przelaczPelnyEkran}
            >
              <span className={style.znakPowiekszenia} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <Heading stopien={2} id={idTresci}>
        {tytul}
      </Heading>
      {tresc.trim() !== "" && <Text wariant="lekcja">{tresc}</Text>}

      {materialy.length > 0 && (
        <div className={style.materialy}>
          <Heading stopien={3}>Materiały</Heading>
          {materialy.map((material) => (
            <ListRow
              key={material.id}
              wariant="material"
              tytul={material.nazwa}
              akcja={{ etykieta: "Pobierz", href: material.href }}
            />
          ))}
        </div>
      )}

      <div className={style.pytania}>
        <Heading stopien={3}>Pytania</Heading>
        {pytania.map((p) =>
          p.stan === "odpowiedziana" ? (
            <QaBlock key={p.id} stan="odpowiedziana" pytanie={p.pytanie} kto={p.kto} kiedy={p.kiedy} odpowiedz={p.odpowiedz} />
          ) : (
            <QaBlock
              key={p.id}
              stan="czeka"
              pytanie={p.pytanie}
              obiecanyCzas={p.obiecanyCzas}
              poPrzekroczeniu={p.poPrzekroczeniu}
            />
          ),
        )}
        <Field
          id={idPytania}
          etykieta="Zadaj pytanie prowadzącemu"
          rodzaj="wieloliniowy"
          wartosc={trescPytania}
          onZmiana={setTrescPytania}
        />
        <Button
          poziom="outline"
          onClick={() => {
            onZadajPytanie(trescPytania);
            setTrescPytania("");
          }}
        >
          Wyślij pytanie
        </Button>
      </div>

      <div className={style.warunek} role="status">
        <Heading stopien={3}>Ukończenie lekcji</Heading>
        {spelniony ? (
          <>
            <Text>
              Warunek ukończenia spełniony — masz {procentAktywnegoCzasu}% aktywnego czasu (próg {progUkonczenia}%).
            </Text>
            <Link href="#nastepna-lekcja">Przejdź do następnej lekcji</Link>
          </>
        ) : (
          <>
            {brakujeProcent > 0 ? (
              <Text>
                Brakuje {brakujeProcent}% aktywnego czasu do progu {progUkonczenia}% (masz {procentAktywnegoCzasu}%).
              </Text>
            ) : (
              <Text>
                Czas aktywny spełniony — masz {procentAktywnegoCzasu}% (próg {progUkonczenia}%). Zostało jeszcze:
              </Text>
            )}
            {braki.length > 0 && (
              <ul className={style.listaBrakow}>
                {braki.map((brak) => (
                  <li key={brak.id}>
                    <Link href={brak.href}>{brak.tekst}</Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
