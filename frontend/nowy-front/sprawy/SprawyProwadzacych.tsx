import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import type { SprawaProwadzacego } from "./dane-prowadzacych";
import style from "./SprawyProwadzacych.module.css";

export type StanSprawProwadzacych = "ladowanie" | "blad" | "ok";

interface WlasciwosciSprawProwadzacych {
  stan: StanSprawProwadzacych;
  sprawy: SprawaProwadzacego[];
  blad: string | null;
  onPonow: () => void;
}

/**
 * Sekcja „Sprawy zgłoszone przez prowadzących” pod kolejką decyzji: `h2`,
 * a w nim każda sprawa jako `h3` z tematem, linia „data · zgłaszający · osoba”
 * i treść jako zwykły tekst (React escapuje; podział wierszy zachowuje CSS
 * `white-space: pre-wrap`). Separator „·” należy do elementu, który po nim
 * stoi (jest jego pierwszym dzieckiem), więc przy zawinięciu linii nigdy nie
 * zostaje na jej końcu. Stany: ładowanie (szkielet), błąd (komunikat i
 * „Spróbuj ponownie” ponawiające tylko tę sekcję), pusto, dane. Odmowa
 * 401/403 nie jest stanem sekcji — obsługuje ją cały ekran.
 */
export function SprawyProwadzacych({ stan, sprawy, blad, onPonow }: WlasciwosciSprawProwadzacych) {
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
          <li key={sprawa.id} className={style.sprawa} data-testid={`sprawa-prowadzacego-${sprawa.id}`}>
            <Heading stopien={3}>{sprawa.temat}</Heading>
            <p className={style.meta}>
              <span>{sprawa.data}</span>
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
          </li>
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
