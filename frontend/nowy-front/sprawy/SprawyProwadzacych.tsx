import { useEffect, useRef, useState } from "react";
import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { fokusNaNaglowku } from "@/nowy-front/wspolne/fokus-otwartej-sprawy";
import type { SprawaProwadzacego } from "./dane-prowadzacych";
import { dniOczekiwania, tekstPlakietkiCzekania, wariantPlakietkiCzekania } from "./wiek";
import style from "./SprawyProwadzacych.module.css";

export type StanSprawProwadzacych = "ladowanie" | "blad" | "ok";

/** Rodzaj sprawy w wierszu — każda sprawa tej sekcji jest zgłoszeniem prowadzącego. */
export const RODZAJ_SPRAWY_PROWADZACEGO = "Sprawa od prowadzącego";

interface WlasciwosciSprawProwadzacych {
  stan: StanSprawProwadzacych;
  sprawy: SprawaProwadzacego[];
  /** Chwila odczytu spraw (ms) — od niej liczy się wiek; `null` przed odczytem. */
  teraz: number | null;
  blad: string | null;
  onPonow: () => void;
}

/**
 * Sekcja „Sprawy zgłoszone przez prowadzących” pod kolejką decyzji: `h2`, a
 * pod nim lista spraw. Zwinięty wiersz sprawy pokazuje tylko rodzaj („Sprawa
 * od prowadzącego”), osobę i to, jak długo sprawa czeka (plakietka i próg z
 * `./wiek.ts`, jak w kolejce decyzji) — temat i treść są widoczne dopiero po
 * „Otwórz”. Otwarcie rozwija sprawę w miejscu: `h3` z tematem (fokus trafia
 * na ten nagłówek, `tabIndex={-1}`, jak panel otwartego dyżuru), linia
 * „data · zgłaszający · osoba” i treść jako zwykły tekst (React escapuje;
 * podział wierszy zachowuje CSS `white-space: pre-wrap`). Ten sam przycisk
 * („Zwiń”, `aria-expanded`) zwija sprawę i zostaje z fokusem.
 *
 * Separator „·” należy do elementu, który po nim stoi (jest jego pierwszym
 * dzieckiem), więc nigdy nie zostaje na końcu linii. Poniżej 640 px elementy
 * stoją w osobnych liniach, a separatory są ukryte (`display: none`); od
 * 640 px stoją w jednym rzędzie, a za długi tekst zawija się wewnątrz swojego
 * elementu — żadna linia nie zaczyna się od separatora. Stany: ładowanie
 * (szkielet), błąd (komunikat i „Spróbuj ponownie” ponawiające tylko tę
 * sekcję), pusto, dane. Odmowa 401/403 nie jest stanem sekcji — obsługuje ją
 * cały ekran.
 */
export function SprawyProwadzacych({ stan, sprawy, teraz, blad, onPonow }: WlasciwosciSprawProwadzacych) {
  let zawartosc;
  if (stan === "ladowanie") {
    zawartosc = <Skeleton wiersze={3} />;
  } else if (stan === "blad") {
    zawartosc = (
      <div className={style.blad}>
        <Notice wariant="error" tytul="Nie udało się wczytać spraw zgłoszonych przez prowadzących">
          {blad}
        </Notice>
        <div className={style.akcja}>
          <Button poziom="outline" onClick={onPonow}>
            Spróbuj ponownie
          </Button>
        </div>
      </div>
    );
  } else if (sprawy.length === 0) {
    zawartosc = <p className={style.pusto}>Brak spraw zgłoszonych przez prowadzących.</p>;
  } else {
    zawartosc = (
      <ol className={style.lista} aria-label="Zgłoszone sprawy">
        {sprawy.map((sprawa) => (
          <SprawaWiersz key={sprawa.id} sprawa={sprawa} teraz={teraz} />
        ))}
      </ol>
    );
  }

  return (
    <section className={style.sekcja} aria-label="Sprawy zgłoszone przez prowadzących">
      <Heading stopien={2}>Sprawy zgłoszone przez prowadzących</Heading>
      {zawartosc}
    </section>
  );
}

function SprawaWiersz({ sprawa, teraz }: { sprawa: SprawaProwadzacego; teraz: number | null }) {
  const [otwarta, setOtwarta] = useState(false);
  // Fokus na temat tylko po otwarciu przyciskiem, nie przy pierwszym renderze.
  const fokusPoOtwarciu = useRef(false);
  const tresc = useRef<HTMLDivElement>(null);
  const idTresci = `sprawa-prowadzacego-tresc-${sprawa.id}`;
  const dni = teraz === null ? null : dniOczekiwania(sprawa.czekaOd, teraz);

  useEffect(() => {
    if (!otwarta || !fokusPoOtwarciu.current) return;
    fokusPoOtwarciu.current = false;
    fokusNaNaglowku(tresc.current?.querySelector<HTMLElement>("h3"));
  }, [otwarta]);

  function przelacz() {
    fokusPoOtwarciu.current = !otwarta;
    setOtwarta(!otwarta);
  }

  return (
    <li className={style.sprawa} data-testid={`sprawa-prowadzacego-${sprawa.id}`}>
      <div className={style.wiersz}>
        <div className={style.opisWiersza}>
          <span className={style.rodzaj}>{RODZAJ_SPRAWY_PROWADZACEGO}</span>
          <span className={style.osoba}>{sprawa.osoba}</span>
        </div>
        <div className={style.akcjeWiersza}>
          {dni !== null && <Badge wariant={wariantPlakietkiCzekania(dni)}>{tekstPlakietkiCzekania(dni)}</Badge>}
          <Button
            poziom="outline"
            rozmiar="sm"
            aria-expanded={otwarta}
            aria-controls={otwarta ? idTresci : undefined}
            aria-label={`${otwarta ? "Zwiń" : "Otwórz"} sprawę od prowadzącego: ${sprawa.osoba}`}
            onClick={przelacz}
          >
            {otwarta ? "Zwiń" : "Otwórz"}
          </Button>
        </div>
      </div>
      {otwarta && (
        <div ref={tresc} id={idTresci} className={style.otwarta}>
          <Heading stopien={3}>{sprawa.temat}</Heading>
          <p className={style.meta}>
            <span className={style.data}>{sprawa.data}</span>
            <span className={style.elementMeta}>
              <span className={style.separator} aria-hidden="true">
                ·
              </span>
              <span>{sprawa.zglaszajacy}</span>
            </span>
            <span className={style.elementMeta}>
              <span className={style.separator} aria-hidden="true">
                ·
              </span>
              <span>{sprawa.osoba}</span>
            </span>
          </p>
          <p className={style.tresc}>{sprawa.tresc}</p>
        </div>
      )}
    </li>
  );
}
